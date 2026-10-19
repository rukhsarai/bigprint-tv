# BigPrint TV — backend

Two small AWS Lambda functions and one S3 bucket. Nothing runs between uses.

```
phone ──POST /upload──▶ HTTP API ──▶ capture Lambda ──▶ S3 uploads/<sid>/…jpg
                                                 │ (S3 event)
                                                 ▼
TV ◀──GET /result────── capture Lambda ◀── S3 results/<sid>/… ◀── process Lambda
TV ──POST /voice──────▶ capture Lambda ──▶ S3 voice/<sid>/… (S3 event) ──▶ │
TV ◀──GET /audio─────── capture Lambda                               │
                                              Textract ◀─────────────┤
                                              Bedrock Nova ◀─────────┤
                                              Polly ◀────────────────┘
```

| File | What it is |
|---|---|
| `lambda_capture.py` | Behind the API, the only public surface. Issues pairing sessions, serves the phone page, accepts one JPEG, hands results to the TV, takes a request to read a letter aloud, and serves the audio. Cannot call any AI service. |
| `capture_page.html` | The phone page. Downscales and re-encodes the photo as JPEG in the browser (this is also what makes iPhone HEIC work). |
| `lambda_process.py` | Triggered by S3. For a photo: runs the pipeline and writes the text. For a voice request: reads the letter aloud, once. No public endpoint. |
| `pipeline.py` | photo → OCR with layout and tables → classify → key facts (cross-checked) → plain English → currency guard → numeric guard |
| `speech.py` | Polly neural voice (Joanna, US English): the whole letter as one story, split into parts only past Polly's 3,000-character limit. No word timings. |
| `tests/` | Unit tests for the pure parts: `python -m unittest discover backend/tests` |
| `run_batch.py` | Runs the pipeline over every photo in the bucket and prints an accuracy report |
| `gen_fixtures.py` | Regenerates `src/data/documents.ts` from the saved results in `fixtures/` |
| `fixtures/` | Four real results from public sample photos, used as app fixtures |

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

4. **A currency the page does not print is never spoken.** On a US receipt
   with bare figures the rewrite came back as "31 pounds 40": the model had
   supplied the voice's own currency. `currency_guard` now strips any currency
   word that the OCR text does not evidence (symbol, code such as `EUR` even
   when glued to the figure, or the word itself), so the line becomes "The
   subtotal is 31.40", and drops a line left with a bare currency claim.

5. **The anti-injection rule must not speak.** The first version told the
   model to say "This letter contains text addressed to a computer" when the
   page tried to instruct it. Five of twelve ordinary receipts triggered that
   sentence (e-mail addresses and codes look like instructions to a model), so
   the rule now says: ignore it, say nothing.

Anything below 90 % confidence is dropped rather than shown, and the TV warns
"check against the paper copy" when the whole page read below 90 % or a money
figure was disputed.

## Accuracy, measured (16 October 2026)

Eleven public sample photographs from the bucket, each run through the
*deployed* functions, then checked by eye against the picture. Four of the
results are kept as app fixtures in `fixtures/`. "Figures" are every number
the TV speaks: amounts, dates, times, references, phone numbers.

| Photo | OCR | Key facts shown | Figures spoken | Wrong | Warning shown |
|---|---|---|---|---|---|
| Brewers receipt (phone photo, 340 px) | 99.5 % | 4 of 4 right | 14 | 0 | no |
| El Chalan guest check, two copies | 98.4 % / 97.5 % | 8 of 8 right | 28 | 0 | once, wrongly (see below) |
| Nexxt Cafe (stock-photo thumbnail, 380 px) | 94.8 % | 3 of 3 right | 13 | 1 | no |
| McDonald's Alicante | 91.7 % | none (date cross-check failed, see below) | 9 | 0 | no |
| Recipe on a letter | 92.2 % | none, correctly: not financial | 3 | 0 | no |
| Tax invoice template | 76.6 % | 1 | 2 | 0 | yes |
| Four blurry thumbnails (5–17 KB) | 60–87 % | 1 of 1 right | — | item names garbled, one subtotal does not add up | yes, every time |

- **Key facts: 17 shown, 16 verified correct, 1 unverifiable (the template's
  27140), 0 wrong.** Key facts are what a reader acts on, and they are pinned
  on screen.
- **Spoken figures on readable photos: 69, of which 1 wrong** (98.6 %). The
  one is a suggested-tip line where Textract read "6.28" as "6.20" on a
  380-pixel-wide thumbnail and was confident about it. No layer can catch a
  confident OCR misread of a non-key figure; a photo taken with the phone's
  camera, as the capture page insists on, is many times that resolution.
- **Nothing wrong was shown without a warning on any blurry photo.** The
  warning fired on all four, and on the tax-invoice template.
- **Audio: 0 silent lines in 11 documents** (under the old per-line voice).
  Upload to spoken result took 13–49 seconds; Polly's two calls per line
  dominated on long receipts. The text no longer waits for the voice at all:
  it is published as soon as the rewrite is done, and the voice is made only
  when someone presses Listen.
- **The photo cross-check vetoed five facts, and every veto was wrong.** Nova
  read "3/12/2016" as "3/27/2016" and "27/02/2025" as "17-02/02/2025", and
  once disagreed with a correct "$49.52"; Textract was right each time. So the
  veto now applies to money only, where a second reader is worth a rare
  hidden total, and dates and references are shown as Textract read them
  (`values_agree` also accepts "3/12/2016" against "March 12, 2016").
  Re-run after that change: the two hidden dates came back, both correct. The
  money veto still fired wrongly on the 380-pixel copy (total hidden, amount
  due kept, warning shown); it never fired on a phone-resolution photo.
- One wrong *word*: an OCR garble "bisenits" was rewritten as "biscotti" on
  what is a biscuit recipe. Words are the model's to smooth; only figures are
  guarded. That is the trade the design makes, and it is stated on the TV.

Re-run with `python run_batch.py` (needs the IAM user's keys) or by uploading
to a session and reading `results/<sid>/<docId>.json`.

## Cost per document (us-east-1, October 2026)

| Step | Service | About |
|---|---|---|
| OCR with layout and tables | Textract AnalyzeDocument | $0.019 |
| Key figures (bills only) | Textract AnalyzeExpense | $0.01 |
| Classify | Nova Lite | $0.0001 |
| Rewrite (whole letter and main points, one call) | Nova Pro | $0.002 |
| Cross-check figures against the photo | Nova Pro (image) | $0.002 |
| Lambda, S3, logs | | < $0.001 |
| **Bill, read on screen** | | **≈ $0.033** |
| **Letter, read on screen** | | **≈ $0.023** |
| Voice, only if someone presses Listen | Polly neural, ~1,500 characters, once | + $0.024 |

The voice used to be made for every letter, with a second Polly call per line
for word timings: $0.05 of the old $0.08. Now it is made on request, once per
letter (claimed with a conditional write, so pressing Listen twice or on two
TVs still makes one), with no timings, and kept for the day so listening
again is free. A letter nobody listens to costs nothing to voice.

If the voice still costs too much, `ENGINE = "standard"` in `speech.py` is a
quarter of the price, but it sounds noticeably more robotic, which matters
for this audience.

Idle cost is a few cents a month of S3.

## Deploy

```
python -m venv .venv && . .venv/bin/activate && pip install boto3
python ../aws/deploy.py           # creates or updates everything, prints the URL
```

Then put the printed URL in `src/config.ts`. See `AWS_SETUP.md` for the IAM
pieces that must exist first.

## The front door

The capture function sits behind an API Gateway HTTP API (`aws/deploy.py`
creates it), not its own public Function URL. In this account the Function URL
was configured exactly as documented and still answered 403 to every anonymous
caller, which points at a guardrail above the function; the API invokes the
function as a service principal, so nothing public has to be granted on the
function itself. The API's `$default` stage is throttled to 20 requests a
second with a burst of 50, which is ample for TVs polling every 3 seconds and
is the first wall an abuser hits, before the per-address and daily limits.

## Known limitation

There is no WAF. A product would add one, or CloudFront with a rate rule, in
front of the API.
