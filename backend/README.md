# BigPrint TV — document pipeline

Turns a photograph into the JSON the TV app renders.

    photo -> OCR -> classify -> (key facts if financial) -> plain English

## Why it is shaped this way

Tested against 18 real photographs. Two findings drove the design:

1. **`AnalyzeExpense` must not run on everything.** It assumes the page is a
   receipt and force-fits anything into that shape. On a university marks
   certificate it reported `SUBTOTAL 3.32`, `TAX 3.37`, `TOTAL 215.9` — none of
   which were money. So Nova classifies first, and key facts are only extracted
   from documents that are genuinely financial.

2. **OCR flattens tables to one cell per line.** A naive rewrite produced
   `"100"`, `"85"`, `"3"`, `"3.75"` — meaningless read aloud. The rewrite step
   recombines table rows into sentences, and `_is_speakable()` drops any
   fragment that slips through.

Key figures always come from Textract, never from the language model. Anything
below 90% confidence is dropped rather than shown: for a reader who cannot
easily check the paper, a confidently wrong amount is worse than no amount.

## Known limitation

HEIC is rejected by Textract (`UnsupportedDocumentException`). iPhones shoot
HEIC by default, so the phone capture page must convert to JPEG before upload.

## Run

    python -m venv .venv && . .venv/bin/activate
    pip install -r requirements.txt

    python run_batch.py results.json       # whole bucket, accuracy report
    python gen_fixtures.py ../src/data/documents.ts   # regenerate app data
