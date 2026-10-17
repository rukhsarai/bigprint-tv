"""Regenerate src/data/documents.ts from saved pipeline output.

The JSON files in backend/fixtures/ are results exactly as the processing
function wrote them to S3 (minus the audio timings, which the mock service
does not use). They come from public sample receipts, not from anyone's post,
so they can live in the repository. Refresh one by running a sample through
the deployed backend and saving results/<sid>/<docId>.json here.

    python backend/gen_fixtures.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, "fixtures")
TARGET = os.path.join(HERE, "..", "src", "data", "documents.ts")

# (file, exported name, why it is in the set)
PICKS = [
    ("receipt.json", "sampleReceipt", "financial, every figure cross-checked"),
    ("letter.json", "sampleLetter", "non-financial, numbers that must NOT be read as money"),
    ("invoice.json", "sampleInvoice", "dense page with a table, flagged low confidence"),
    ("poor-scan.json", "samplePoorScan", "tiny blurry photo, the low-confidence path"),
]


def ts(v):
    return json.dumps(v, ensure_ascii=False)


def render(name, why, d):
    sender = f"\n  sender: {ts(d['sender'])}," if d.get("sender") else ""
    facts = "".join(
        f"\n    {{label: {ts(f['label'])}, value: {ts(f['value'])}, confidence: {f['confidence']}}},"
        for f in d.get("keyFacts", [])
    )
    lines = "".join(f"\n    {ts(l)}," for l in d["lines"])
    summary = "".join(f"\n    {ts(l)}," for l in d.get("summary") or [])
    exact = "".join(
        f"\n    {{text: {ts(e['text'])}, kind: {ts(e['kind'])}}},"
        for e in d.get("exact") or []
    )
    extra = ""
    if summary:
        extra += f"\n  summary: [{summary}\n  ],"
    if exact:
        extra += f"\n  exact: [{exact}\n  ],"
    return f"""
/** {why}. */
export const {name}: ScannedDocument = {{
  id: {ts(d['id'])},
  kind: {ts(d['kind'])},{sender}
  keyFacts: [{facts}
  ],
  lines: [{lines}
  ],{extra}
  lowConfidence: {str(d['lowConfidence']).lower()},
}};
"""


def main():
    with open(TARGET, encoding="utf-8") as f:
        current = f.read()
    header = current[: current.index("\n/**", current.index("export type ScannedDocument"))]
    header = re.sub(r"\n/\*\*.*?\*/\nexport const.*", "", header, flags=re.S)
    out = [header.rstrip("\n") + "\n"]
    for file, name, why in PICKS:
        with open(os.path.join(FIXTURES, file), encoding="utf-8") as f:
            out.append(render(name, why, json.load(f)))
    names = ", ".join(name for _, name, _ in PICKS)
    out.append(f"\nexport const sampleDocuments: ScannedDocument[] = [{names}];\n")
    with open(TARGET, "w", encoding="utf-8") as f:
        f.write("".join(out))
    print(f"wrote {TARGET} with {len(PICKS)} documents")


if __name__ == "__main__":
    main()
