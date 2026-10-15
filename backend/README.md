# BigPrint TV — backend

Two small AWS Lambda functions and one S3 bucket. Nothing runs between uses.

```
phone ──POST /upload──▶ capture Lambda ──▶ S3 uploads/<sid>/…jpg
                                                 │ (S3 event)
                                                 ▼
TV ◀──GET /result────── capture Lambda ◀── S3 results/<sid>/… ◀── process Lambda
TV ◀──GET /audio─────── capture Lambda                               │
                                              Textract ◀─────────────┤
                                              Bedrock Nova ◀─────────┤
                                              Polly ◀────────────────┘
```

| File | What it is |
|---|---|
| `lambda_capture.py` | The only public endpoint. Issues pairing sessions, serves the phone page, accepts one JPEG, hands results and audio to the TV. Cannot call any AI service. |
| `capture_page.html` | The phone page. Downscales and re-encodes the photo as JPEG in the browser (this is also what makes iPhone HEIC work). |
| `lambda_process.py` | Triggered by S3. Runs the pipeline, makes the audio, writes the result. No public endpoint. |
| `pipeline.py` | photo → OCR with layout and tables → classify → key facts (cross-checked) → plain English → numeric guard |
| `speech.py` | Polly neural voice, one MP3 per line, with word timings for the highlight |
| `tests/` | Unit tests for the pure parts: `python -m unittest discover backend/tests` |
| `run_batch.py` | Runs the pipeline over every photo in the bucket and prints an accuracy report |
| `gen_fixtures.py` | Regenerates `src/data/documents.ts` from chosen photos |

## Trust model

- A session is a 6-digit **code** plus a 22-character **secret** (128 bits). The
  secret only ever travels inside the QR code. Everything on S3 is keyed by a
  hash of the two, so the code alone opens nothing, and nothing is guessable.
- The public function can only write photos and read finished results. The
  processing function has no endpoint at all.
- Limits: 4 MB and JPEG-only per upload, 20 uploads per session, 40 sessions and
  80 uploads per network address per day, sessions expire after 2 hours, reserved concurrency 5 (capture) and 3 (process) where the
  account allows it (a new account's 10-execution limit cannot be carved up, and
  then simply acts as the cap), and a global **200 documents per day** cap that is only spent once a photo has
  actually been read. Worst case for a determined abuser is about $20 of AI calls
  in a day, and the budget alarm fires before that.
- Photos, results, sessions and counters are deleted by an S3 lifecycle rule
  after one day. These are photographs of people's private post.
- Logs never contain document text, only sizes, ids and error types.

## Why the pipeline is shaped this way

Tested against real photographs. Three findings drove the design:

1. **`AnalyzeExpense` must not run on everything.** It assumes the page is a
   receipt and force-fits anything into that shape. On a university marks
   certificate it reported `SUBTOTAL 3.32`, `TAX 3.37`, `TOTAL 215.9` — none of
   which were money. So Nova classifies first, and key facts are only extracted
   from documents that are genuinely financial.

2. **One-cell-per-line OCR produces nonsense when read aloud.** The first
   version used `DetectDocumentText`, which returns a table as a column of
   cells. On a real fuel receipt the rewrite produced "The amount for diesel is
   8" and "The total amount is 1". The pipeline now uses `AnalyzeDocument` with
   LAYOUT and TABLES, rebuilds each table row as `cell | cell | cell` in reading
   order, and tells the model which lines are table rows.

3. **The language model must never be the source of a number.** Key figures
   come from Textract. Nova Pro is shown the photo and asked for the same
   figures only so it can *veto* one it disagrees with — a disputed amount is
   hidden, not shown. Separately, every number in the rewritten text must exist
   in the OCR text (`numeric_guard`); a line that fails is dropped. For a reader
   who cannot easily check the paper, a confidently wrong number is worse than
   no number.

Anything below 90 % confidence is dropped rather than shown, and the TV warns
"check against the paper copy" when the whole page read below 90 % or a money
figure was disputed.

## Cost per document (us-east-1, October 2026)

| Step | Service | About |
|---|---|---|
| OCR with layout and tables | Textract AnalyzeDocument | $0.019 |
| Key figures (bills only) | Textract AnalyzeExpense | $0.01 |
| Classify | Nova Lite | $0.0001 |
| Rewrite | Nova Pro | $0.002 |
| Cross-check figures against the photo | Nova Pro (image) | $0.002 |
| Voice and word timings | Polly neural, ~1,500 characters × 2 | $0.05 |
| Lambda, S3, logs | | < $0.001 |
| **Bill** | | **≈ $0.08** |
| **Letter** | | **≈ $0.07** |

Idle cost is a few cents a month of S3.

## Deploy

```
python -m venv .venv && . .venv/bin/activate && pip install boto3
python ../aws/deploy.py           # creates or updates everything, prints the URL
```

Then put the printed URL in `src/config.ts`. See `AWS_SETUP.md` for the IAM
pieces that must exist first.

## Known limitation

The capture page is a public URL with no WAF or rate limiting beyond reserved
concurrency and the daily cap. That is acceptable for a prototype; a product
would put CloudFront with a rate rule in front of it.
