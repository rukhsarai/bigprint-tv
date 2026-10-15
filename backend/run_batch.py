"""Run the pipeline over every image in the bucket and save the results."""
import json, sys, boto3
from pipeline import Pipeline, to_app_json

BUCKET = "bigprint-tv-dev-ru22"
s3 = boto3.client("s3", region_name="us-east-1")
# Only photographs at the top level: the app's own uploads/, results/ and
# sessions/ prefixes are skipped, as are formats Textract cannot read.
READABLE = (".jpg", ".jpeg", ".png")
keys = []
for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET):
    for o in page.get("Contents", []):
        k = o["Key"]
        if "/" in k or k.startswith("_") or not k.lower().endswith(READABLE):
            continue
        keys.append(k)
keys.sort()

pipe = Pipeline()
out = []
for k in keys:
    print(f"\n--- {k}")
    try:
        doc = pipe.run(bucket=BUCKET, key=k, doc_id=k.rsplit(".", 1)[0])
    except Exception as e:
        print(f"   SKIPPED: {type(e).__name__}: {str(e)[:90]}")
        continue
    d = doc.diagnostics
    print(f"   kind={doc.kind!r} sender={doc.sender!r}")
    print(f"   ocr={d.get('ocrConfidence')}% ({d.get('ocrFeature')}) financial={d.get('isFinancial')} "
          f"facts={d.get('factsFound')} disputed={len(d.get('factsDisputed') or [])} "
          f"dropped={d.get('linesDroppedByGuard')} lowConf={doc.lowConfidence}")
    for f in doc.keyFacts:
        print(f"     {f.label:<16} {f.value[:30]:<32} {f.confidence}%")
    for line in doc.lines[:3]:
        print(f"     | {line[:66]}")
    out.append({"key": k, **to_app_json(doc), "diagnostics": d})

json.dump(out, open(sys.argv[1], "w"), indent=1, ensure_ascii=False)
print(f"\nwrote {len(out)} documents to {sys.argv[1]}")
