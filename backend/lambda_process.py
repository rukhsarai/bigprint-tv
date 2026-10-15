"""
BigPrint TV — processing function.

Triggered by S3 when the capture function stores a photo under uploads/.
Runs the reading pipeline, makes the audio, and leaves the result where the
capture function can hand it to the TV:

    results/<sid>/doc-<time>-<id>.json       the document, with word timings
    results/<sid>/doc-<time>-<id>/line-N.mp3 one MP3 per line
    results/<sid>/status.json                processing | done | error

This function has no public endpoint. Its only input is a photo that the
capture function already accepted, and a daily cap stops a flood of uploads
from running up the bill.
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
from speech import Speech

BUCKET = os.environ["BUCKET"]
DAILY_CAP = int(os.environ.get("DAILY_CAP", "500"))
REWRITE_WITH_IMAGE = os.environ.get("REWRITE_WITH_IMAGE", "0") == "1"

s3 = boto3.client("s3")
_pipeline: Pipeline | None = None
_speech: Speech | None = None

KEY_RE = re.compile(r"^uploads/([0-9a-f]{32})/([0-9]{10}-[0-9a-f]{12})\.jpg$")

FRIENDLY_ERROR = "We could not read that photo. Please try again in better light."
CAP_ERROR = "The service is very busy today. Please try again tomorrow."


def _put_json(key: str, data: dict):
    s3.put_object(Bucket=BUCKET, Key=key, Body=json.dumps(data).encode("utf-8"),
                  ContentType="application/json")


def _status(sid: str, state: str, **extra):
    _put_json(f"results/{sid}/status.json", {"state": state, "at": int(time.time()), **extra})


def _under_daily_cap() -> bool:
    """Soft global cap. A race can let a couple of extra documents through,
    which is fine — this protects the bill, not a quota."""
    key = f"counters/{dt.date.today().isoformat()}.json"
    try:
        count = json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()).get("count", 0)
    except ClientError as e:
        if e.response["Error"]["Code"] not in ("NoSuchKey", "404"):
            raise
        count = 0
    if count >= DAILY_CAP:
        return False
    _put_json(key, {"count": count + 1})
    return True


def process(sid: str, upload_id: str, key: str):
    global _pipeline, _speech
    if not _under_daily_cap():
        print(f"daily cap reached, refusing {key}")
        _status(sid, "error", uploadId=upload_id, message=CAP_ERROR)
        return

    _pipeline = _pipeline or Pipeline(rewrite_with_image=REWRITE_WITH_IMAGE)
    _speech = _speech or Speech()

    image = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
    doc_id = f"doc-{int(time.time())}-{uuid.uuid4().hex[:12]}"
    started = time.time()

    doc = _pipeline.run(image_bytes=image, doc_id=doc_id)
    if not doc.lines:
        _status(sid, "error", uploadId=upload_id, message=FRIENDLY_ERROR)
        return

    audio = _speech.lines(doc.lines)
    for n, a in enumerate(audio):
        s3.put_object(Bucket=BUCKET, Key=f"results/{sid}/{doc_id}/line-{n}.mp3",
                      Body=a.mp3, ContentType="audio/mpeg")

    payload = to_app_json(doc)
    payload["createdAt"] = int(time.time())
    payload["speech"] = [{"marks": a.marks, "durationMs": a.durationMs} for a in audio]
    _put_json(f"results/{sid}/{doc_id}.json", payload)
    _status(sid, "done", uploadId=upload_id, docId=doc_id)

    d = doc.diagnostics
    print(json.dumps({
        "event": "processed", "docId": doc_id, "seconds": round(time.time() - started, 1),
        "ocrConfidence": d.get("ocrConfidence"), "ocrFeature": d.get("ocrFeature"),
        "lines": len(doc.lines), "facts": d.get("factsFound"),
        "disputed": len(d.get("factsDisputed") or []), "dropped": d.get("linesDroppedByGuard"),
        "lowConfidence": doc.lowConfidence,
    }))


def handler(event, _context):
    for record in event.get("Records", []):
        key = unquote_plus(record.get("s3", {}).get("object", {}).get("key", ""))
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
