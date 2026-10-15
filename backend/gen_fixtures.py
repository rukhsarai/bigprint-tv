"""Run the pipeline on chosen photos and emit src/data/documents.ts."""
import json, sys
from pipeline import Pipeline, to_app_json

BUCKET = "bigprint-tv-dev-ru22"
# Chosen to cover the range the app must handle:
PICKS = [
    ("IMG_20261011_215046.jpg", "sampleReceipt",    "financial, key facts present"),
    ("IMG_20261011_214928.jpg", "sampleCertificate","non-financial, numbers that must NOT be read as money"),
    ("IMG_20261011_215107.jpg", "sampleSchedule",   "dense page, no sender figures"),
    ("IMG_20261011_214705.jpg", "samplePoorScan",   "61.8% OCR — the low-confidence path"),
]

pipe = Pipeline()
docs = []
for key, var, why in PICKS:
    print(f"running {key} ...", flush=True)
    d = pipe.run(bucket=BUCKET, key=key, doc_id=var)
    docs.append((var, why, to_app_json(d), d.diagnostics))

def ts(v):
    return json.dumps(v, ensure_ascii=False)

out = ['''/**
 * Real documents, produced by running backend/pipeline.py over photographs
 * in the bigprint-tv-dev-ru22 bucket. Regenerate with:
 *
 *     cd backend && python gen_fixtures.py
 *
 * These are genuine Textract + Nova output, not hand-written examples, so the
 * app is exercised against the messiness of real OCR.
 */

export type DocumentFact = {
  label: string;
  value: string;
  /** Textract confidence. Anything below 90 was dropped by the pipeline. */
  confidence?: number;
};

export type ScannedDocument = {
  id: string;
  /** What kind of document this is, in plain words. */
  kind: string;
  /** Who sent it. Absent for things with no sender, like a card or a label. */
  sender?: string;
  /**
   * Figures a reader must not get wrong. Pinned on screen and never scrolled
   * past. Empty for documents that have none — the pipeline only extracts
   * these when the document is classified as a bill or receipt.
   */
  keyFacts: DocumentFact[];
  /** Body text, rewritten into plain English, already split into lines. */
  lines: string[];
  /** True when OCR confidence was low, so the UI warns instead of pretending. */
  lowConfidence: boolean;
};
''']

for var, why, d, diag in docs:
    sender = f"\n  sender: {ts(d['sender'])}," if d.get("sender") else ""
    facts = "".join(
        f"\n    {{label: {ts(f['label'])}, value: {ts(f['value'])}, confidence: {f['confidence']}}},"
        for f in d["keyFacts"]
    ) or ""
    lines = "".join(f"\n    {ts(l)}," for l in d["lines"])
    out.append(f"""
/** {why}. OCR {diag.get('ocrConfidence')}%, financial={str(diag.get('isFinancial')).lower()}. */
export const {var}: ScannedDocument = {{
  id: {ts(d['id'])},
  kind: {ts(d['kind'])},{sender}
  keyFacts: [{facts}
  ],
  lines: [{lines}
  ],
  lowConfidence: {str(d['lowConfidence']).lower()},
}};
""")

names = ", ".join(v for v, _, _, _ in docs)
out.append(f"\nexport const sampleDocuments: ScannedDocument[] = [{names}];\n")
open(sys.argv[1], "w").write("".join(out))
print("wrote", sys.argv[1])
