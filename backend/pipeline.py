"""
BigPrint TV — document reading pipeline.

Turns a photograph of a document into the JSON the TV app renders.

    photo -> OCR with layout and tables -> classify -> (key facts if financial,
    cross-checked against the image) -> plain English -> numeric fidelity guard

Design decisions, learned from testing real photographs:

1. OCR always runs. AnalyzeDocument with LAYOUT and TABLES is used so that a
   table reaches the language model as whole rows, not one cell per line. The
   one-cell-per-line output of DetectDocumentText is what produced "The amount
   for diesel is 8" on a real receipt. DetectDocumentText remains the fallback.
2. AnalyzeExpense is NOT safe to run on everything. It assumes the document is
   a receipt and force-fits any page into that shape — on a university marks
   certificate it reported SUBTOTAL 3.32 / TAX 3.37 / TOTAL 215.9, none of which
   were money. So it runs only when the document is classified as financial.
3. Key figures come from Textract, never from the language model. The model is
   only used to CONFIRM them: Nova Pro reads the photo independently, and a
   figure the two disagree on is hidden rather than shown.
4. Every number the language model writes must exist in the OCR text. A line
   that fails this check is dropped. For a reader who cannot check the paper
   easily, a confidently wrong number is worse than no number.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, asdict
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

REGION = "us-east-1"

# Below this, a key figure is not shown at all.
FACT_CONFIDENCE_FLOOR = 90.0
# Below this mean OCR confidence, the app shows "check against the paper copy".
OCR_CONFIDENCE_FLOOR = 90.0

CLASSIFY_MODEL = "us.amazon.nova-lite-v1:0"
REWRITE_MODEL = "us.amazon.nova-pro-v1:0"
CROSSCHECK_MODEL = "us.amazon.nova-pro-v1:0"

# AnalyzeExpense field -> the label a person would recognise.
FACT_LABELS = {
    "AMOUNT_DUE": "Amount due",
    "TOTAL": "Total",
    "DUE_DATE": "Pay by",
    "INVOICE_RECEIPT_DATE": "Date",
    "ACCOUNT_NUMBER": "Account number",
    "INVOICE_RECEIPT_ID": "Reference",
    "VENDOR_PHONE": "Phone",
}
# Shown in this order, so money and deadlines come first.
FACT_ORDER = [
    "AMOUNT_DUE",
    "TOTAL",
    "DUE_DATE",
    "INVOICE_RECEIPT_DATE",
    "ACCOUNT_NUMBER",
    "INVOICE_RECEIPT_ID",
    "VENDOR_PHONE",
]
# Which facts the image cross-check is asked about, and how to compare them.
CROSSCHECK_FIELDS = {
    "AMOUNT_DUE": ("amount_due", "money"),
    "TOTAL": ("total", "money"),
    "DUE_DATE": ("due_date", "date"),
    "INVOICE_RECEIPT_DATE": ("document_date", "date"),
    "ACCOUNT_NUMBER": ("account_number", "digits"),
    "INVOICE_RECEIPT_ID": ("reference", "digits"),
}

_RETRY = Config(retries={"mode": "standard", "max_attempts": 6})


@dataclass
class DocumentFact:
    label: str
    value: str
    confidence: float


@dataclass
class OcrResult:
    """What the OCR step hands to the rest of the pipeline."""

    texts: list[str]          # reading order, tables rendered as "a | b | c" rows
    raw_lines: list[str]      # every LINE Textract saw, for the numeric guard
    confidence: float         # mean LINE confidence, 0-100
    feature: str              # "layout" or "detect"


@dataclass
class ScannedDocument:
    """Mirrors the ScannedDocument type in src/data/documents.ts."""

    id: str
    kind: str
    sender: str | None
    keyFacts: list[DocumentFact] = field(default_factory=list)
    lines: list[str] = field(default_factory=list)
    lowConfidence: bool = False
    # Kept for debugging and the accuracy report; not rendered by the app.
    diagnostics: dict[str, Any] = field(default_factory=dict)


class Pipeline:
    def __init__(self, region: str = REGION, *, rewrite_with_image: bool = False):
        self.textract = boto3.client("textract", region_name=region, config=_RETRY)
        self.bedrock = boto3.client("bedrock-runtime", region_name=region, config=_RETRY)
        self.s3 = boto3.client("s3", region_name=region, config=_RETRY)
        self.rewrite_with_image = rewrite_with_image

    # -- step 1: OCR ------------------------------------------------------
    def read_text(self, document: dict) -> OcrResult:
        try:
            blocks = self.textract.analyze_document(
                Document=document, FeatureTypes=["LAYOUT", "TABLES"]
            )["Blocks"]
            feature = "layout"
        except ClientError as e:
            # Falls back when the role lacks AnalyzeDocument or the call is throttled out.
            print(f"   AnalyzeDocument unavailable ({e.response['Error']['Code']}), using DetectDocumentText")
            blocks = self.textract.detect_document_text(Document=document)["Blocks"]
            feature = "detect"
        texts, raw_lines, confidence = structure_blocks(blocks)
        return OcrResult(texts=texts, raw_lines=raw_lines, confidence=confidence, feature=feature)

    # -- step 2: classify -------------------------------------------------
    def classify(self, texts: list[str]) -> dict:
        """Decide what this is, and whether AnalyzeExpense is safe to run."""
        excerpt = "\n".join(texts[:40])[:4000]
        prompt = f"""Classify this document, read by OCR from a photograph.

---
{excerpt}
---

Return ONLY JSON, no markdown fence:
{{"kind": "short plain-English description, e.g. Electricity bill, Hospital appointment letter, Certificate, Receipt",
 "sender": "organisation or person who issued it, or null",
 "isFinancial": true or false}}

isFinancial must be true ONLY for bills, invoices, receipts and statements —
documents where an amount of money is genuinely owed or was paid. Certificates,
transcripts, appointment letters, forms and personal letters are false, even if
numbers appear on them."""
        raw = self._nova(CLASSIFY_MODEL, prompt, max_tokens=200)
        data = _parse_json(raw) or {}
        return {
            "kind": (str(data.get("kind") or "Document")).strip()[:60],
            "sender": _clean_sender(data.get("sender")),
            "isFinancial": bool(data.get("isFinancial")),
        }

    # -- step 3: key facts, only for financial documents ------------------
    def extract_facts(self, document: dict) -> list[tuple[str, DocumentFact]]:
        """Returns (field_type, fact) pairs above the confidence floor."""
        expense = self.textract.analyze_expense(Document=document)
        best: dict[str, tuple[str, float]] = {}
        for doc in expense.get("ExpenseDocuments", []):
            for f in doc.get("SummaryFields", []):
                field_type = (f.get("Type") or {}).get("Text")
                if field_type not in FACT_LABELS:
                    continue
                value = _clean_value((f.get("ValueDetection") or {}).get("Text"))
                conf = round((f.get("ValueDetection") or {}).get("Confidence", 0.0), 1)
                if not value or conf < FACT_CONFIDENCE_FLOOR:
                    continue
                # Keep the highest-confidence reading of each field.
                if field_type not in best or conf > best[field_type][1]:
                    best[field_type] = (value, conf)

        facts = []
        for field_type in FACT_ORDER:
            if field_type in best:
                value, conf = best[field_type]
                facts.append((field_type, DocumentFact(FACT_LABELS[field_type], value, conf)))
        return facts

    def cross_check_facts(self, image_bytes: bytes, facts: list[tuple[str, DocumentFact]]):
        """Ask Nova Pro to read the photo independently; hide any figure the two disagree on.

        Nova is never the source of a figure. It can only veto one. If it cannot
        see a value it says null, which keeps Textract's reading.
        """
        wanted = [CROSSCHECK_FIELDS[t][0] for t, _ in facts if t in CROSSCHECK_FIELDS]
        if not wanted:
            return facts, []
        prompt = (
            "Read this photograph of a document. Return ONLY JSON, no markdown fence, with these keys: "
            + ", ".join(wanted)
            + ". For each key copy the value EXACTLY as printed on the page (same digits, same date "
            "format), or null if it is not clearly printed. Do not calculate or guess anything."
        )
        try:
            raw = self._nova(CROSSCHECK_MODEL, prompt, max_tokens=300, image_bytes=image_bytes)
        except Exception as e:  # noqa: BLE001 - the cross-check is advisory
            print(f"   cross-check unavailable: {type(e).__name__}")
            return facts, []
        seen = _parse_json(raw) or {}
        kept, disputed = [], []
        for field_type, fact in facts:
            spec = CROSSCHECK_FIELDS.get(field_type)
            if not spec:
                kept.append((field_type, fact))
                continue
            key, kind = spec
            other = seen.get(key)
            if other is None or str(other).strip().lower() in ("", "null", "none"):
                kept.append((field_type, fact))
            elif values_agree(fact.value, str(other), kind):
                kept.append((field_type, fact))
            else:
                disputed.append({"field": field_type, "textract": fact.value, "nova": str(other)})
        return kept, disputed

    # -- step 4: plain English --------------------------------------------
    def simplify(self, ocr: OcrResult, kind: str, image_bytes: bytes | None = None) -> tuple[list[str], int]:
        """Rewrite the document as sentences a person can listen to.

        Returns (lines, dropped) where dropped counts lines removed by the
        numeric fidelity guard.
        """
        source = "\n".join(ocr.texts)[:12000]
        prompt = f"""Rewrite this {kind} to be READ ALOUD on a television to
someone who cannot see it. They will hear it, not look at it.

The text below was read by OCR in reading order. Tables are given as rows with
cells separated by " | ", between [Table] and [End of table] markers.
---
{source}
---

Return ONLY JSON, no markdown fence:
{{"lines": ["one complete spoken sentence per line"]}}

Rules:
- EVERY line must be a complete sentence that makes sense when heard on its
  own. Never output a bare number, a column heading, or a fragment.
- Start with what the document is and who it is from, in one sentence.
- Then give the things the reader must act on: any amount to pay, any date or
  deadline, any appointment, any phone number to call. Keep these early.
- Tables: turn each row into one sentence, for example
  "Electricity used: 312 kilowatt hours, costing 76 pounds 44."
  Never list the cells separately.
- If a table is long, give the first few rows and then summarise the rest,
  for example "There are 8 more items listed."
- Copy every number, amount, date, time and reference EXACTLY as digits.
  Never round, reformat, recalculate, correct or invent one.
- Omit anything the OCR garbled, rather than guessing.
- Omit page furniture: signatures, stamps, form codes, column headings,
  website addresses, legal small print.
- Plain English. At most 16 words per sentence.
- At most 30 lines in total. Prefer fewer."""
        image = image_bytes if (self.rewrite_with_image and image_bytes) else None
        raw = self._nova(REWRITE_MODEL, prompt, max_tokens=2000, image_bytes=image)
        data = _parse_json(raw) or {}
        lines = [str(x).strip() for x in data.get("lines", []) if str(x).strip()]
        lines = [l for l in lines if _is_speakable(l)]
        guarded = numeric_guard(lines, ocr.raw_lines)
        dropped = len(lines) - len(guarded)
        # Fall back to raw OCR rather than showing nothing.
        return (guarded or [t for t in ocr.texts if _is_speakable(t)] or ocr.texts), dropped

    # -- orchestration ----------------------------------------------------
    def run(self, *, bucket: str | None = None, key: str | None = None,
            image_bytes: bytes | None = None, doc_id: str = "doc") -> ScannedDocument:
        if image_bytes is None:
            if not (bucket and key):
                raise ValueError("pass either image_bytes or bucket+key")
            image_bytes = self.s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        document = {"Bytes": image_bytes}

        ocr = self.read_text(document)
        if not ocr.texts:
            return ScannedDocument(
                id=doc_id, kind="Unreadable", sender=None, lines=[],
                lowConfidence=True,
                diagnostics={"reason": "no text found", "ocrConfidence": ocr.confidence},
            )

        meta = self.classify(ocr.texts)

        facts: list[tuple[str, DocumentFact]] = []
        disputed: list[dict] = []
        if meta["isFinancial"]:
            try:
                facts = self.extract_facts(document)
                facts, disputed = self.cross_check_facts(image_bytes, facts)
            except Exception as e:  # noqa: BLE001 - never fail the whole read
                print(f"   key facts unavailable, continuing without: {type(e).__name__}")

        lines, dropped = self.simplify(ocr, meta["kind"], image_bytes)

        money_disputed = any(d["field"] in ("AMOUNT_DUE", "TOTAL") for d in disputed)
        return ScannedDocument(
            id=doc_id,
            kind=meta["kind"],
            sender=meta["sender"],
            keyFacts=[f for _, f in facts],
            lines=lines,
            lowConfidence=ocr.confidence < OCR_CONFIDENCE_FLOOR or money_disputed,
            diagnostics={
                "ocrConfidence": ocr.confidence,
                "ocrFeature": ocr.feature,
                "ocrLines": len(ocr.raw_lines),
                "isFinancial": meta["isFinancial"],
                "factsFound": len(facts),
                "factsDisputed": disputed,
                "linesDroppedByGuard": dropped,
            },
        )

    # -- helpers -----------------------------------------------------------
    def _nova(self, model_id: str, prompt: str, max_tokens: int, image_bytes: bytes | None = None) -> str:
        content: list[dict] = []
        if image_bytes:
            content.append({"image": {"format": "jpeg", "source": {"bytes": image_bytes}}})
        content.append({"text": prompt})
        r = self.bedrock.converse(
            modelId=model_id,
            messages=[{"role": "user", "content": content}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": 0},
        )
        return r["output"]["message"]["content"][0]["text"]


# -- OCR structure ----------------------------------------------------------

def structure_blocks(blocks: list[dict]) -> tuple[list[str], list[str], float]:
    """Turn Textract blocks into reading-order text with tables as rows.

    Works for AnalyzeDocument (LAYOUT + TABLES) output and degrades to plain
    line order for DetectDocumentText output. Returns
    (texts, raw_lines, mean_confidence).
    """
    by_id = {b["Id"]: b for b in blocks}

    def children(block: dict) -> list[str]:
        out: list[str] = []
        for rel in block.get("Relationships", []) or []:
            if rel.get("Type") == "CHILD":
                out.extend(rel.get("Ids", []))
        return out

    # Lines.
    lines = [b for b in blocks if b["BlockType"] == "LINE"]
    raw_lines = [b.get("Text", "") for b in lines]
    confs = [b.get("Confidence", 0.0) for b in lines]
    mean_conf = round(sum(confs) / len(confs), 1) if confs else 0.0

    # Tables: which WORD belongs to which table, and the rendered rows.
    word_table: dict[str, int] = {}
    rendered_tables: list[list[str]] = []
    for b in blocks:
        if b["BlockType"] != "TABLE":
            continue
        t_index = len(rendered_tables)
        grid: dict[int, dict[int, str]] = {}
        for cell_id in children(b):
            cell = by_id.get(cell_id)
            if not cell or cell["BlockType"] != "CELL":
                continue
            words = []
            for wid in children(cell):
                w = by_id.get(wid)
                if w and w["BlockType"] == "WORD":
                    words.append(w.get("Text", ""))
                    word_table[wid] = t_index
            text = " ".join(words).strip()
            if text:
                grid.setdefault(cell.get("RowIndex", 0), {})[cell.get("ColumnIndex", 0)] = text
        rows = []
        for r in sorted(grid):
            cells = [grid[r][c] for c in sorted(grid[r])]
            if cells:
                rows.append(" | ".join(cells))
        rendered_tables.append(rows)

    def line_table(line: dict) -> int | None:
        wids = children(line)
        if not wids:
            return None
        hits = [word_table[w] for w in wids if w in word_table]
        if len(hits) * 2 >= len(wids):
            return max(set(hits), key=hits.count)
        return None

    emitted_tables: set[int] = set()
    texts: list[str] = []
    used_lines: set[str] = set()

    def emit_line(line: dict):
        used_lines.add(line["Id"])
        t = line_table(line)
        if t is None:
            text = line.get("Text", "").strip()
            if text:
                texts.append(text)
            return
        if t in emitted_tables:
            return
        emitted_tables.add(t)
        rows = rendered_tables[t]
        if rows:
            texts.append("[Table]")
            texts.extend(rows)
            texts.append("[End of table]")

    layout = [b for b in blocks if b["BlockType"].startswith("LAYOUT_")]
    if layout:
        for lb in layout:
            for cid in children(lb):
                child = by_id.get(cid)
                if child and child["BlockType"] == "LINE" and child["Id"] not in used_lines:
                    emit_line(child)
    for line in lines:  # anything the layout step did not claim
        if line["Id"] not in used_lines:
            emit_line(line)

    return texts, raw_lines, mean_conf


# -- numeric fidelity --------------------------------------------------------

_DIGIT_RUN = re.compile(r"\d+")


def _digit_runs(text: str) -> list[str]:
    # "1,234.56" is one number to a reader; strip thousands separators first.
    return _DIGIT_RUN.findall(text.replace(",", ""))


def numeric_guard(lines: list[str], ocr_lines: list[str]) -> list[str]:
    """Keep only lines whose every number can be found in the OCR text.

    A number is accepted if the exact digit run appears in the OCR, or if it
    appears inside the digits of a single OCR line (so "0800 048 7811" and
    "08000487811" are both fine). Catches invented or recalculated figures;
    does not catch a figure copied from the wrong row — the layout step is
    what prevents that.
    """
    ocr_runs: set[str] = set()
    ocr_line_digits: list[str] = []
    for l in ocr_lines:
        runs = _digit_runs(l)
        ocr_runs.update(runs)
        ocr_line_digits.append("".join(runs))

    kept = []
    for line in lines:
        ok = True
        for run in _digit_runs(line):
            if run in ocr_runs:
                continue
            if any(run in d for d in ocr_line_digits if d):
                continue
            ok = False
            break
        if ok:
            kept.append(line)
    return kept


# -- fact comparison ---------------------------------------------------------

_MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def _parse_date(text: str) -> tuple[int, int, int] | None:
    """Best-effort (day, month, year) from the formats seen on UK and US post.

    Returns None when the text is not clearly a date.
    """
    t = text.strip().lower()
    t = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", t)
    m = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", t)
    if m:
        return int(m.group(3)), int(m.group(2)), int(m.group(1))
    m = re.search(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b", t)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        if mo > 12 and d <= 12:  # US order
            d, mo = mo, d
        return d, mo, y
    m = re.search(r"\b(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{2,4})\b", t)
    if m and m.group(2)[:3] in _MONTHS:
        y = int(m.group(3))
        return int(m.group(1)), _MONTHS[m.group(2)[:3]], (y + 2000 if y < 100 else y)
    m = re.search(r"\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b", t)
    if m and m.group(1)[:3] in _MONTHS:
        return int(m.group(2)), _MONTHS[m.group(1)[:3]], int(m.group(3))
    return None


def values_agree(textract_value: str, other_value: str, kind: str) -> bool:
    """Do two readings of the same fact mean the same thing?"""
    if kind == "date":
        a, b = _parse_date(textract_value), _parse_date(other_value)
        if a and b:
            return a == b
        # Fall through to a digit comparison when one side is not a clear date.
    a_digits = "".join(_digit_runs(textract_value))
    b_digits = "".join(_digit_runs(other_value))
    if not a_digits or not b_digits:
        return True  # nothing numeric to disagree about
    if kind == "money":
        # "84.60" vs "84.6" vs "84"
        a_digits, b_digits = a_digits.rstrip("0"), b_digits.rstrip("0")
    return a_digits == b_digits


# -- small helpers -------------------------------------------------------------

def _is_speakable(line: str) -> bool:
    """Reject fragments that are meaningless when heard.

    A bare number or a two-character token is a leaked table cell, not a
    sentence. Belt and braces alongside the prompt rule.
    """
    stripped = line.strip()
    if len(stripped) < 4 or stripped.startswith("["):
        return False
    words = stripped.split()
    if len(words) < 2:
        return False
    return any(any(ch.isalpha() for ch in w) for w in words)


# Nova sometimes answers the literal string "null" rather than JSON null.
_NO_SENDER = {"null", "none", "n/a", "na", "unknown", "not specified", ""}


def _clean_sender(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = " ".join(value.split())[:80]
    return None if text.strip().lower() in _NO_SENDER else text


def _clean_value(value: Any) -> str:
    """Tidy an AnalyzeExpense value.

    Observed on a real fuel receipt: DATE came back as "20-11-25 Date:" — the
    neighbouring field label bled into the value. Strip a trailing label.
    """
    if not isinstance(value, str):
        return ""
    text = " ".join(value.split())
    text = re.sub(r"\s*\b[A-Za-z][A-Za-z ]{0,14}:\s*$", "", text)
    return text.strip(" :-")


def _parse_json(raw: str) -> dict | None:
    """Nova usually returns clean JSON, but sometimes wraps it in a fence."""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(0))
                return data if isinstance(data, dict) else None
            except json.JSONDecodeError:
                return None
    return None


def to_app_json(doc: ScannedDocument) -> dict:
    """Strip diagnostics and round confidences for the app."""
    d = asdict(doc)
    d.pop("diagnostics", None)
    for f in d["keyFacts"]:
        f["confidence"] = round(f["confidence"], 1)
    return d
