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
then refuses under its daily cap. A per-address limit on sessions and uploads
stops one machine from using up that cap for everyone.
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
# Per source address, per day. Generous for a care home behind one router,
# and small next to the processing function's daily cap, so one machine can
# never use that cap up for everyone.
MAX_SESSIONS_PER_IP_DAY = int(os.environ.get("MAX_SESSIONS_PER_IP_DAY", "40"))
MAX_UPLOADS_PER_IP_DAY = int(os.environ.get("MAX_UPLOADS_PER_IP_DAY", "80"))

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

CONDITIONAL_CODES = ("PreconditionFailed", "412", "ConditionalRequestConflict")


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


def _put_json(key: str, data: dict, **conditions):
    s3.put_object(
        Bucket=BUCKET, Key=key, Body=json.dumps(data).encode("utf-8"),
        ContentType="application/json", **conditions,
    )


def _bump(key: str, field: str, limit: int) -> bool:
    """Atomically count one more under `field`; False when the limit is reached.

    Read-modify-write with S3 conditional writes, so five parallel requests
    at 19 of 20 cannot all pass. On persistent collisions the request is
    refused, which is the safe side.
    """
    for _ in range(4):
        data, etag = _get_json(key)
        data = data or {}
        if data.get(field, 0) >= limit:
            return False
        data[field] = data.get(field, 0) + 1
        try:
            if etag:
                _put_json(key, data, IfMatch=etag)
            else:
                _put_json(key, data, IfNoneMatch="*")
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] not in CONDITIONAL_CODES:
                raise
    return False


def _source_ip(event) -> str:
    http = (event.get("requestContext") or {}).get("http") or {}
    return str(http.get("sourceIp") or "unknown")


def _ip_allowed(event, action: str, limit: int) -> bool:
    """Per-address daily budget. The address is hashed; nothing identifying is stored."""
    day = time.strftime("%Y-%m-%d", time.gmtime())
    key = f"ratelimit/{_sha(_source_ip(event))[:16]}/{day}.json"
    return _bump(key, action, limit)


def _load_session(params: dict):
    """Validate c and k. Returns (session, sid) or (None, error_response)."""
    code = params.get("c", "")
    secret = params.get("k", "")
    if not CODE_RE.match(code) or not SECRET_RE.match(secret):
        return None, _error(400, "This link is not complete. Please scan the QR code on the TV again.")
    session, _ = _get_json(f"sessions/{code}.json")
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

def create_session(event):
    """The TV calls this when it shows the pairing screen."""
    if not _ip_allowed(event, "sessions", MAX_SESSIONS_PER_IP_DAY):
        return _error(429, "Too many requests from this network. Please try again later.")
    for _ in range(5):
        code = f"{secrets.randbelow(1_000_000):06d}"
        existing, _ = _get_json(f"sessions/{code}.json")
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

    data = _body_bytes(event)
    if len(data) > MAX_UPLOAD_BYTES:
        return _error(413, "That photo is too large. Please try again.")
    if len(data) < 1024 or not data.startswith(b"\xff\xd8\xff"):
        return _error(415, "Please send a JPEG photo taken with the camera.")
    if not _ip_allowed(event, "uploads", MAX_UPLOADS_PER_IP_DAY):
        return _error(429, "Too many photos from this network. Please try again later.")
    if not _bump(f"sessions/{session['code']}.json", "uploads", MAX_UPLOADS_PER_SESSION):
        return _error(429, "That is enough pages for one session. Please scan the QR code on the TV again.")

    upload_id = f"{int(time.time())}-{uuid.uuid4().hex[:12]}"
    _put_json(f"results/{sid}/status.json", {
        "state": "processing", "uploadId": upload_id, "at": int(time.time()),
    })
    s3.put_object(
        Bucket=BUCKET,
        Key=f"uploads/{sid}/{upload_id}.jpg",
        Body=data,
        ContentType="image/jpeg",
        Metadata={"code": session["code"]},
    )
    return _resp(200, {"ok": True, "uploadId": upload_id})


def result(params):
    """What the TV polls. Returns the processing state and the newest document.

    One small status object answers most polls; the document itself is read
    only when it is new to this TV.
    """
    session, sid_or_err = _load_session(params)
    if session is None:
        return sid_or_err
    sid = sid_or_err

    status, _ = _get_json(f"results/{sid}/status.json")
    status = status or {"state": "idle"}
    since = params.get("since", "")

    document = None
    doc_id = status.get("docId")
    if status.get("state") == "done" and doc_id and DOC_RE.match(doc_id) and doc_id != since:
        document, _ = _get_json(f"results/{sid}/{doc_id}.json")

    return _resp(200, {
        "ok": True,
        "state": status.get("state", "idle"),
        "message": status.get("message"),
        "since": status.get("at"),
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
            return create_session(event)
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
