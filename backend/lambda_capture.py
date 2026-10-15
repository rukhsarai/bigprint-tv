"""
BigPrint TV — capture function (AWS Lambda behind a public Function URL).

It is the only thing on the internet, so it is kept small and suspicious:

    POST /session          TV asks for a pairing code and a secret
    GET  /?c=..&k=..       the phone's camera page (static HTML)
    POST /upload?c=..&k=.. the phone sends one JPEG
    GET  /result?c=..&k=.. the TV polls for the latest reading
    GET  /audio?c=..&k=..&d=..&n=..   one line of Polly audio
    GET  /health

Trust model: the 6-digit code identifies a session; the 22-character secret
(128 bits, only ever carried inside the QR code) proves you own it. Everything
on S3 is keyed by a hash of the two, so the code alone opens nothing.

This function deliberately cannot call Textract, Bedrock or Polly. If the public
endpoint is abused, the worst outcome is an upload that the processing function
then refuses under its daily cap.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
import uuid

import boto3
from botocore.exceptions import ClientError

BUCKET = os.environ["BUCKET"]
SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", str(2 * 60 * 60)))
MAX_UPLOADS_PER_SESSION = int(os.environ.get("MAX_UPLOADS_PER_SESSION", "20"))
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(4 * 1024 * 1024)))

s3 = boto3.client("s3")

_HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_HERE, "capture_page.html"), "rb") as _f:
    PAGE_HTML = _f.read()

CODE_RE = re.compile(r"^\d{6}$")
SECRET_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
DOC_RE = re.compile(r"^doc-[0-9]{10}-[0-9a-f]{12}$")

SECURITY_HEADERS = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
}


# -- helpers ---------------------------------------------------------------

def _resp(status: int, body=None, *, content_type="application/json", raw: bytes | None = None, extra=None):
    headers = {**SECURITY_HEADERS, "Content-Type": content_type, **(extra or {})}
    if raw is not None:
        return {
            "statusCode": status,
            "headers": headers,
            "body": base64.b64encode(raw).decode("ascii"),
            "isBase64Encoded": True,
        }
    if body is None:
        return {"statusCode": status, "headers": headers, "body": ""}
    return {"statusCode": status, "headers": headers, "body": json.dumps(body)}


def _error(status: int, message: str):
    return _resp(status, {"ok": False, "message": message})


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _session_id(code: str, secret: str) -> str:
    """Everything on S3 for a session lives under this; neither half alone derives it."""
    return hashlib.sha256(f"{code}:{secret}".encode("utf-8")).hexdigest()[:32]


def _get_json(key: str):
    try:
        obj = s3.get_object(Bucket=BUCKET, Key=key)
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
            return None
        raise
    return json.loads(obj["Body"].read())


def _put_json(key: str, data: dict):
    s3.put_object(
        Bucket=BUCKET, Key=key, Body=json.dumps(data).encode("utf-8"),
        ContentType="application/json",
    )


def _load_session(params: dict):
    """Validate c and k. Returns (session, sid) or (None, error_response)."""
    code = params.get("c", "")
    secret = params.get("k", "")
    if not CODE_RE.match(code) or not SECRET_RE.match(secret):
        return None, _error(400, "This link is not complete. Please scan the QR code on the TV again.")
    session = _get_json(f"sessions/{code}.json")
    if not session:
        return None, _error(404, "This code is not in use. Please scan the QR code on the TV again.")
    if not hmac.compare_digest(session.get("secretHash", ""), _sha(secret)):
        # Do not reveal whether the code exists.
        return None, _error(404, "This code is not in use. Please scan the QR code on the TV again.")
    if time.time() > session.get("expiresAt", 0):
        return None, _error(410, "This code has expired. Please scan the QR code on the TV again.")
    return session, _session_id(code, secret)


def _body_bytes(event) -> bytes:
    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        return base64.b64decode(body)
    return body.encode("utf-8")


# -- routes ----------------------------------------------------------------

def create_session():
    """The TV calls this when it shows the pairing screen."""
    for _ in range(5):
        code = f"{secrets.randbelow(1_000_000):06d}"
        existing = _get_json(f"sessions/{code}.json")
        if existing and time.time() < existing.get("expiresAt", 0):
            continue  # live collision, pick another
        break
    else:
        return _error(503, "Could not start a session. Please try again.")

    secret = secrets.token_urlsafe(16)  # 128 bits
    now = int(time.time())
    session = {
        "code": code,
        "secretHash": _sha(secret),
        "sid": _session_id(code, secret),
        "createdAt": now,
        "expiresAt": now + SESSION_TTL_SECONDS,
        "uploads": 0,
    }
    _put_json(f"sessions/{code}.json", session)
    return _resp(200, {
        "ok": True,
        "code": code,
        "secret": secret,
        "expiresAt": session["expiresAt"],
    })


def serve_page():
    return _resp(200, raw=PAGE_HTML, content_type="text/html; charset=utf-8", extra={
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
                                   "img-src blob:; connect-src 'self'; base-uri 'none'; form-action 'none'",
    })


def upload(event, params):
    session, sid_or_err = _load_session(params)
    if session is None:
        return sid_or_err
    sid = sid_or_err
    if session.get("uploads", 0) >= MAX_UPLOADS_PER_SESSION:
        return _error(429, "That is enough pages for one session. Please scan the QR code on the TV again.")

    data = _body_bytes(event)
    if len(data) > MAX_UPLOAD_BYTES:
        return _error(413, "That photo is too large. Please try again.")
    if len(data) < 1024 or not data.startswith(b"\xff\xd8\xff"):
        return _error(415, "Please send a JPEG photo taken with the camera.")

    upload_id = f"{int(time.time())}-{uuid.uuid4().hex[:12]}"
    s3.put_object(
        Bucket=BUCKET,
        Key=f"uploads/{sid}/{upload_id}.jpg",
        Body=data,
        ContentType="image/jpeg",
        Metadata={"code": session["code"]},
    )
    session["uploads"] = session.get("uploads", 0) + 1
    _put_json(f"sessions/{session['code']}.json", session)
    _put_json(f"results/{sid}/status.json", {
        "state": "processing", "uploadId": upload_id, "at": int(time.time()),
    })
    return _resp(200, {"ok": True, "uploadId": upload_id})


def result(params):
    """What the TV polls. Returns the processing state and the newest document."""
    session, sid_or_err = _load_session(params)
    if session is None:
        return sid_or_err
    sid = sid_or_err

    status = _get_json(f"results/{sid}/status.json") or {"state": "idle"}
    since = params.get("since", "")

    newest_key = None
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=BUCKET, Prefix=f"results/{sid}/doc-"):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.endswith(".json") and (newest_key is None or key > newest_key):
                newest_key = key

    document = None
    if newest_key:
        doc_id = newest_key.rsplit("/", 1)[-1][:-5]
        if doc_id != since:
            document = _get_json(newest_key)

    return _resp(200, {
        "ok": True,
        "state": status.get("state", "idle"),
        "message": status.get("message"),
        "document": document,
        "expiresAt": session.get("expiresAt"),
    })


def audio(params):
    session, sid_or_err = _load_session(params)
    if session is None:
        return sid_or_err
    sid = sid_or_err
    doc_id = params.get("d", "")
    line = params.get("n", "")
    if not DOC_RE.match(doc_id) or not line.isdigit() or int(line) > 200:
        return _error(400, "Bad audio request.")
    try:
        obj = s3.get_object(Bucket=BUCKET, Key=f"results/{sid}/{doc_id}/line-{int(line)}.mp3")
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
            return _error(404, "No audio for that line.")
        raise
    return _resp(200, raw=obj["Body"].read(), content_type="audio/mpeg",
                 extra={"Cache-Control": "private, max-age=3600"})


# -- entry point -----------------------------------------------------------

def handler(event, _context):
    http = (event.get("requestContext") or {}).get("http") or {}
    method = http.get("method", "GET").upper()
    path = (event.get("rawPath") or "/").rstrip("/") or "/"
    params = event.get("queryStringParameters") or {}

    try:
        if method == "GET" and path == "/health":
            return _resp(200, {"ok": True})
        if method == "POST" and path == "/session":
            return create_session()
        if method == "GET" and path == "/":
            return serve_page()
        if method == "POST" and path == "/upload":
            return upload(event, params)
        if method == "GET" and path == "/result":
            return result(params)
        if method == "GET" and path == "/audio":
            return audio(params)
        return _error(404, "Not found.")
    except Exception as e:  # noqa: BLE001 - never leak a stack trace to the public
        # Log the type only; request bodies are photographs of private post.
        print(f"capture error {type(e).__name__}: {str(e)[:200]}")
        return _error(500, "Something went wrong. Please try again.")
