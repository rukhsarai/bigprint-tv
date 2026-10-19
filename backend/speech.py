"""
The letter read aloud as one story, by Amazon Polly.

Reading on the TV is the main thing; the voice is for someone who would
rather listen, start to finish, without watching the screen. So the whole
letter becomes one recording, and nothing on screen follows it: no word
timings are asked for, which halves the Polly bill compared with marks.

Polly takes at most 3,000 characters a request. A letter longer than that is
split between lines into a few parts, made in parallel and played back to
back by the TV. Polly bills by the character, so parts cost nothing extra.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import boto3
from botocore.config import Config

VOICE = "Joanna"       # US English, clear and unhurried
ENGINE = "neural"
MAX_CHARS = 2900       # Polly's per-request ceiling is 3,000 billed characters
# A story is one or two parts; this only bounds a very long page.
MAX_WORKERS = 4
MAX_PARTS = 20         # the capture function serves story-0 to story-19

_RETRY = Config(retries={"mode": "standard", "max_attempts": 8})


def story_text(kind: str, sender: str | None, lines: list[str], low_confidence: bool = False) -> list[str]:
    """What the voice says, as a list of sentences: what the page is, the
    warning if there is one, then the letter. Someone only listening cannot
    see the header or the warning, so the voice says them."""
    opening = f"{kind} from {sender}." if sender else f"{kind}."
    said = [opening]
    if low_confidence:
        said.append("Some words were hard to read, so check the paper copy.")
    said.extend(line.strip() for line in lines if line and line.strip())
    return said


def split_parts(sentences: list[str], limit: int = MAX_CHARS) -> list[str]:
    """Join sentences into parts of at most `limit` characters, breaking only
    between sentences so no word is cut in two. A single sentence longer than
    the limit is cut at a space."""
    parts: list[str] = []
    current = ""
    for sentence in sentences:
        while len(sentence) > limit:
            cut = sentence.rfind(" ", 0, limit)
            cut = cut if cut > 0 else limit
            if current:
                parts.append(current)
                current = ""
            parts.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if not sentence:
            continue
        joined = f"{current}\n{sentence}" if current else sentence
        if len(joined) > limit:
            parts.append(current)
            current = sentence
        else:
            current = joined
    if current:
        parts.append(current)
    return parts[:MAX_PARTS]


class Speech:
    def __init__(self, region: str = "us-east-1"):
        self.polly = boto3.client("polly", region_name=region, config=_RETRY)

    def _part(self, text: str) -> bytes:
        return self.polly.synthesize_speech(
            VoiceId=VOICE, Engine=ENGINE, Text=text, TextType="text", OutputFormat="mp3",
        )["AudioStream"].read()

    def story(self, sentences: list[str]) -> list[bytes]:
        """The MP3 parts of the story, in order. Any part failing fails the
        story: a recording with a hole in the middle is worse than none."""
        parts = split_parts(sentences)
        if not parts:
            return []
        with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(parts))) as pool:
            return list(pool.map(self._part, parts))
