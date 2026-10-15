"""
Read-aloud audio with word timings, from Amazon Polly.

Polly is used because it is the only service here that returns speech marks:
the millisecond at which each word starts. That is what lets the TV light up
the word being spoken. Each line of the document becomes its own MP3, so the
app can start any line instantly and stop cleanly at its end.
"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import boto3
from botocore.config import Config

VOICE = "Amy"          # British English, clear and unhurried
ENGINE = "neural"
MAX_WORKERS = 6        # Polly neural allows ~8 requests/s; stay under it

_RETRY = Config(retries={"mode": "standard", "max_attempts": 8})


@dataclass
class LineAudio:
    mp3: bytes
    marks: list[dict] = field(default_factory=list)
    durationMs: int = 0


def byte_to_char_offsets(text: str, marks: list[dict]) -> list[dict]:
    """Polly's start/end are byte offsets in UTF-8. The app slices JavaScript
    strings, so convert to character offsets. Matters for "£" and "—"."""
    encoded = text.encode("utf-8")
    out = []
    for m in marks:
        start = len(encoded[: int(m.get("start", 0))].decode("utf-8", errors="ignore"))
        end = len(encoded[: int(m.get("end", 0))].decode("utf-8", errors="ignore"))
        out.append({
            "time": int(m.get("time", 0)),
            "type": "word",
            "start": start,
            "end": end,
            "value": text[start:end],
        })
    return out


class Speech:
    def __init__(self, region: str = "us-east-1"):
        self.polly = boto3.client("polly", region_name=region, config=_RETRY)

    def line(self, text: str) -> LineAudio:
        common = {"VoiceId": VOICE, "Engine": ENGINE, "Text": text, "TextType": "text"}
        audio = self.polly.synthesize_speech(OutputFormat="mp3", **common)["AudioStream"].read()
        marks_raw = self.polly.synthesize_speech(
            OutputFormat="json", SpeechMarkTypes=["word"], **common
        )["AudioStream"].read().decode("utf-8")
        marks = [json.loads(l) for l in marks_raw.splitlines() if l.strip()]
        marks = [m for m in marks if m.get("type") == "word"]
        marks = byte_to_char_offsets(text, marks)
        last = marks[-1]["time"] if marks else 0
        # Polly does not report total length; the app uses the 'ended' event and
        # this only drives the no-audio fallback.
        return LineAudio(mp3=audio, marks=marks, durationMs=last + 600)

    def lines(self, texts: list[str]) -> list[LineAudio]:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            return list(pool.map(self.line, texts))
