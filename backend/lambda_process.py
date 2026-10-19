"""
BigPrint TV — processing function.

Triggered by S3, for two kinds of work:

    uploads/<sid>/<upload>.jpg    a photo the capture function accepted:
                                  read it and publish the text
    voice/<sid>/<doc>.json        someone pressed Listen: read the letter
                                  aloud, once

and leaves the result where the capture function can hand it to the TV:

    results/<sid>/doc-<time>-<id>.json        the document
    results/<sid>/status.json                 processing | done | error
    results/<sid>/doc-<time>-<id>/voice.json  making | ready (parts: N) | none
    results/<sid>/doc-<time>-<id>/story-N.mp3 the letter read aloud, in one
                                              part or a few

Reading on the TV is the main thing and the voice is optional, so the text is
all a photo pays for. Most letters are read, not heard; the voice is made
only when someone asks for it, then kept for the rest of the day.

This function has no public endpoint. Its only inputs are objects that the
capture function already accepted, and a daily cap stops a flood of uploads
from running up the bill. The cap is spent only once a photo has actually
been read, so garbage uploads cannot use up real readers' budget. A voice is
claimed once per letter by the capture function, so it cannot be bought twice.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import time
import uuid
from urllib.parse import unquote_plus

import boto3
from botocore.exceptions import ClientError

from pipeline import Pipeline, to_app_json
from speech import Speech, story_text

BUCKET = os.environ["BUCKET"]
DAILY_CAP = int(os.environ.get("DAILY_CAP", "200"))
REWRITE_WITH_IMAGE = os.environ.get("REWRITE_WITH_IMAGE", "0") == "1"

s3 = boto3.client("s3")
_pipeline: Pipeline | None = None
_speech: Speech | None = None

KEY_RE = re.compile(r"^uploads/([0-9a-f]{32})/([0-9]{10}-[0-9a-f]{12})\.jpg$")
VOICE_KEY_RE = re.compile(r"^voice/([0-9a-f]{32})/(doc-[0-9]{10}-[0-9a-f]{12})\.json$")

FRIENDLY_ERROR = "We could not read that photo. Please try again in better light."
CAP_ERROR = "The service is very busy today. Please try again tomorrow."


def _put_json(key: str, data: dict, **conditions):
    s3.put_object(Bucket=BUCKET, Key=key, Body=json.dumps(data).encode("utf-8"),
                  ContentType="application/json", **conditions)


def _get_json(key: str):
    """(data, etag) or (None, None).

    S3 answers AccessDenied rather than NoSuchKey for a missing key when the
    caller lacks s3:ListBucket. These roles deliberately cannot list the
    bucket, so a 403 here almost always means "not there". It is logged, so a
    genuinely wrong policy still shows up in the function's logs.
    """
    try:
        obj = s3.get_object(Bucket=BUCKET, Key=key)
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("NoSuchKey", "404"):
            return None, None
        if code in ("AccessDenied", "403"):
            print(f"s3 get {key.split('/')[0]}/...: AccessDenied, treated as missing")
            return None, None
        raise
    return json.loads(obj["Body"].read()), obj.get("ETag")


def _status(sid: str, state: str, **extra):
    _put_json(f"results/{sid}/status.json", {"state": state, "at": int(time.time()), **extra})


def _counter_key() -> str:
    return f"counters/{dt.date.today().isoformat()}.json"


def _cap_reached() -> bool:
    data, _ = _get_json(_counter_key())
    return (data or {}).get("count", 0) >= DAILY_CAP


def _spend_cap():
    """Count one real document. A conditional write keeps parallel runs honest;
    if the object changed underneath us we re-read and try again."""
    key = _counter_key()
    for _ in range(4):
        data, etag = _get_json(key)
        count = (data or {}).get("count", 0) + 1
        try:
            if etag:
                _put_json(key, {"count": count}, IfMatch=etag)
            else:
                _put_json(key, {"count": count}, IfNoneMatch="*")
            return
        except ClientError as e:
            if e.response["Error"]["Code"] not in ("PreconditionFailed", "412", "ConditionalRequestConflict"):
                raise
    # Four collisions in a row: count it unconditionally rather than lose it.
    data, _ = _get_json(key)
    _put_json(key, {"count": (data or {}).get("count", 0) + 1})


def process(sid: str, upload_id: str, key: str):
    global _pipeline

    # Lambda retries an async invocation on failure or timeout; never pay twice.
    status, _ = _get_json(f"results/{sid}/status.json")
    if status and status.get("uploadId") == upload_id:
        if status.get("state") in ("done", "error"):
            print(f"already handled {upload_id}, skipping")
            return

    if _cap_reached():
        print(f"daily cap reached, refusing {key}")
        _status(sid, "error", uploadId=upload_id, message=CAP_ERROR)
        return

    _pipeline = _pipeline or Pipeline(rewrite_with_image=REWRITE_WITH_IMAGE)

    image = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
    doc_id = f"doc-{int(time.time())}-{uuid.uuid4().hex[:12]}"
    started = time.time()

    # OCR first: a blank or bogus upload costs a fraction of a cent and does
    # not spend the daily budget.
    ocr = _pipeline.read_text({"Bytes": image})
    if not ocr.texts:
        _status(sid, "error", uploadId=upload_id, message=FRIENDLY_ERROR)
        return
    _spend_cap()

    doc = _pipeline.run(image_bytes=image, doc_id=doc_id, ocr=ocr)
    if not doc.lines:
        _status(sid, "error", uploadId=upload_id, message=FRIENDLY_ERROR)
        return

    payload = to_app_json(doc)
    payload["createdAt"] = int(time.time())
    _put_json(f"results/{sid}/{doc_id}.json", payload)
    _status(sid, "done", uploadId=upload_id, docId=doc_id)

    d = doc.diagnostics
    print(json.dumps({
        "event": "text", "docId": doc_id, "seconds": round(time.time() - started, 1),
        "ocrConfidence": d.get("ocrConfidence"), "ocrFeature": d.get("ocrFeature"),
        "lines": len(doc.lines),
        "facts": d.get("factsFound"), "disputed": [x.get("field") for x in d.get("factsDisputed") or []],
        "dropped": d.get("linesDroppedByGuard"), "lowConfidence": doc.lowConfidence,
    }))


def make_voice(sid: str, doc_id: str):
    """Read the whole letter aloud as one story. Nothing here may undo the
    text on screen, so every failure ends as audio = none, never an error."""
    global _speech
    voice_key = f"results/{sid}/{doc_id}/voice.json"
    claim, _ = _get_json(voice_key)
    if not claim or claim.get("audio") != "making":
        # Already made, or failed (a retry of this run): never pay twice.
        print(f"voice for {doc_id} already handled, skipping")
        return
    payload, _ = _get_json(f"results/{sid}/{doc_id}.json")
    if not payload:
        _put_json(voice_key, {"audio": "none", "at": int(time.time())})
        return
    started = time.time()
    # Only the full letter is read aloud. The main points and the exact words
    # are for reading; a voice for them would be more Polly for little gain.
    lines = payload.get("lines") or []
    sentences = story_text(payload.get("kind") or "Letter", payload.get("sender"),
                           lines, bool(payload.get("lowConfidence")))
    parts: list[bytes] = []
    try:
        _speech = _speech or Speech()
        parts = _speech.story(sentences)
        for n, mp3 in enumerate(parts):
            s3.put_object(Bucket=BUCKET, Key=f"results/{sid}/{doc_id}/story-{n}.mp3",
                          Body=mp3, ContentType="audio/mpeg")
    except Exception as e:  # noqa: BLE001 - the letter is on screen; the voice is optional
        print(f"voice failed for {doc_id}: {type(e).__name__}: {str(e)[:200]}")
        parts = []
    _put_json(voice_key, {"audio": "ready" if parts else "none",
                          "parts": len(parts), "at": int(time.time())})
    print(json.dumps({
        "event": "voice", "docId": doc_id, "seconds": round(time.time() - started, 1),
        "characters": sum(len(x) for x in sentences), "parts": len(parts),
    }))


def handler(event, _context):
    for record in event.get("Records", []):
        key = unquote_plus(record.get("s3", {}).get("object", {}).get("key", ""))
        v = VOICE_KEY_RE.match(key)
        if v:
            try:
                make_voice(v.group(1), v.group(2))
            except Exception as e:  # noqa: BLE001 - the TV must not wait for ever
                print(f"voice failed for {key}: {type(e).__name__}: {str(e)[:200]}")
                _put_json(f"results/{v.group(1)}/{v.group(2)}/voice.json",
                          {"audio": "none", "at": int(time.time())})
            continue
        m = KEY_RE.match(key)
        if not m:
            print(f"ignoring unexpected key {key!r}")
            continue
        sid, upload_id = m.group(1), m.group(2)
        try:
            process(sid, upload_id, key)
        except Exception as e:  # noqa: BLE001 - always tell the TV something
            # Never log the document text; it is someone's private post.
            print(f"processing failed for {key}: {type(e).__name__}: {str(e)[:200]}")
            _status(sid, "error", uploadId=upload_id, message=FRIENDLY_ERROR)
    return {"ok": True}
