"""
BigPrint TV — document reading pipeline.

Turns a photograph of a document into the JSON the TV app renders.

    photo -> OCR -> classify -> (key facts if financial) -> plain English

Design decisions, learned from testing 18 real photographs:

1. OCR (DetectDocumentText) is reliable and always runs.
2. AnalyzeExpense is NOT safe to run on everything. It assumes the document is
   a receipt and force-fits any page into that shape — on a university marks
   certificate it reported SUBTOTAL 3.32 / TAX 3.37 / TOTAL 215.9, none of which
   were money. So it runs only when the document is classified as financial.
3. Key figures come from AnalyzeExpense, never from the language model. Nova is
   asked to rewrite prose, not to copy numbers.
4. Anything below a confidence floor is dropped rather than shown. For a reader
   who cannot check the paper easily, a confidently wrong amount is worse than
   no amount.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, asdict
from typing import Any

import boto3

REGION = "us-east-1"

# Below this, a key figure is not shown at all.
FACT_CONFIDENCE_FLOOR = 90.0
# Below this mean OCR confidence, the app shows "check against the paper copy".
OCR_CONFIDENCE_FLOOR = 90.0

CLASSIFY_MODEL = "us.amazon.nova-lite-v1:0"
REWRITE_MODEL = "us.amazon.nova-lite-v1:0"

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


@dataclass
class DocumentFact:
    label: str
    value: str
    confidence: float


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
    def __init__(self, region: str = REGION):
        self.textract = boto3.client("textract", region_name=region)
        self.bedrock = boto3.client("bedrock-runtime", region_name=region)

    # -- step 1: OCR ------------------------------------------------------
    def read_text(self, document: dict) -> tuple[list[str], float]:
        blocks = self.textract.detect_document_text(Document=document)["Blocks"]
        lines = [b for b in blocks if b["BlockType"] == "LINE"]
        texts = [b["Text"] for b in lines]
        confs = [b["Confidence"] for b in lines]
        mean = round(sum(confs) / len(confs), 1) if confs else 0.0
        return texts, mean

    # -- step 2: classify -------------------------------------------------
    def classify(self, texts: list[str]) -> dict:
        """Decide what this is, and whether AnalyzeExpense is safe to run."""
        excerpt = "\n".join(texts[:40])
        prompt = f"""Classify this document, read by OCR from a photograph.

---
{excerpt}
---

Return ONLY JSON, no markdown fence:
{{"kind": "short plain-English description, e.g. Electricity bill, Hospital appointment, Certificate, Receipt",
 "sender": "organisation or person who issued it, or null",
 "isFinancial": true or false}}

isFinancial must be true ONLY for bills, invoices, receipts and statements —
documents where an amount of money is genuinely owed or was paid. Certificates,
transcripts, appointment letters, forms and personal letters are false, even if
numbers appear on them."""
        raw = self._nova(CLASSIFY_MODEL, prompt, max_tokens=200)
        data = _parse_json(raw) or {}
        return {
            "kind": (data.get("kind") or "Document").strip(),
            "sender": _clean_sender(data.get("sender")),
            "isFinancial": bool(data.get("isFinancial")),
        }

    # -- step 3: key facts, only for financial documents ------------------
    def extract_facts(self, document: dict) -> list[DocumentFact]:
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
                facts.append(DocumentFact(FACT_LABELS[field_type], value, conf))
        return facts

    # -- step 4: plain English --------------------------------------------
    def simplify(self, texts: list[str], kind: str) -> list[str]:
        """Rewrite the document as sentences a person can listen to.

        OCR returns a table one cell per line, so a naive rewrite emits
        fragments like "100", "85", "3", "3.75" — meaningless when spoken.
        The prompt therefore requires every line to be a sentence, and table
        rows to be recombined into one.
        """
        prompt = f"""Rewrite this {kind} to be READ ALOUD on a television to
someone who cannot see it. They will hear it, not look at it.

OCR text (tables arrive one cell per line, so structure is lost):
---
{chr(10).join(texts)}
---

Return ONLY JSON, no markdown fence:
{{"lines": ["one complete spoken sentence per line"]}}

Rules:
- EVERY line must be a complete sentence that makes sense when heard on its
  own. Never output a bare number, a column heading, or a fragment.
- Tables: turn each row into one sentence, for example
  "Programming Fundamental: 90 out of 100, grade point 4".
  Never list the cells separately.
- If a table is long, give the first few rows and then summarise the rest,
  for example "There are 8 more subjects listed."
- Copy every number, amount, date and reference EXACTLY. Never round,
  reformat, correct or invent one.
- Omit anything the OCR garbled, rather than guessing.
- Omit page furniture: signatures, stamps, form codes, column headings.
- Plain English. At most 16 words per sentence.
- At most 30 lines in total. Prefer fewer."""
        raw = self._nova(REWRITE_MODEL, prompt, max_tokens=2000)
        data = _parse_json(raw) or {}
        lines = [str(x).strip() for x in data.get("lines", []) if str(x).strip()]
        lines = [l for l in lines if _is_speakable(l)]
        # Fall back to raw OCR rather than showing nothing.
        return lines or texts

    # -- orchestration ----------------------------------------------------
    def run(self, *, bucket: str | None = None, key: str | None = None,
            image_bytes: bytes | None = None, doc_id: str = "doc") -> ScannedDocument:
        if image_bytes is not None:
            document = {"Bytes": image_bytes}
        elif bucket and key:
            document = {"S3Object": {"Bucket": bucket, "Name": key}}
        else:
            raise ValueError("pass either image_bytes or bucket+key")

        texts, ocr_conf = self.read_text(document)
        if not texts:
            return ScannedDocument(
                id=doc_id, kind="Unreadable", sender=None, lines=[],
                lowConfidence=True,
                diagnostics={"reason": "no text found", "ocrConfidence": ocr_conf},
            )

        meta = self.classify(texts)

        facts: list[DocumentFact] = []
        if meta["isFinancial"]:
            try:
                facts = self.extract_facts(document)
            except Exception as e:  # noqa: BLE001 - never fail the whole read
                print(f"   AnalyzeExpense failed, continuing without facts: {e}")

        lines = self.simplify(texts, meta["kind"])

        return ScannedDocument(
            id=doc_id,
            kind=meta["kind"],
            sender=meta["sender"],
            keyFacts=facts,
            lines=lines,
            lowConfidence=ocr_conf < OCR_CONFIDENCE_FLOOR,
            diagnostics={
                "ocrConfidence": ocr_conf,
                "ocrLines": len(texts),
                "isFinancial": meta["isFinancial"],
                "factsFound": len(facts),
            },
        )

    # -- helpers -----------------------------------------------------------
    def _nova(self, model_id: str, prompt: str, max_tokens: int) -> str:
        r = self.bedrock.converse(
            modelId=model_id,
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": 0},
        )
        return r["output"]["message"]["content"][0]["text"]


def _is_speakable(line: str) -> bool:
    """Reject fragments that are meaningless when heard.

    A bare number or a two-character token is a leaked table cell, not a
    sentence. Belt and braces alongside the prompt rule.
    """
    stripped = line.strip()
    if len(stripped) < 4:
        return False
    # Needs at least two words, one of which contains letters.
    words = stripped.split()
    if len(words) < 2:
        return False
    return any(any(ch.isalpha() for ch in w) for w in words)


# Nova sometimes answers the literal string "null" rather than JSON null.
_NO_SENDER = {"null", "none", "n/a", "na", "unknown", "not specified", ""}


def _clean_sender(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = " ".join(value.split())
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
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
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
