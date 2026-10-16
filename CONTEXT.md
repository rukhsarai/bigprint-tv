# BigPrint TV — project context

**Read this first.** It is the handover document: what the product is, what is
built, what is still unverified, and the decisions that would be expensive to
rediscover. Last updated 15 October 2026.

---

## 1. The product

A Fire TV app for people who cannot comfortably read paper post — primarily
older people with age-related sight loss.

Someone photographs a letter with a phone. It appears on the television in very
large print, and is read aloud in a natural voice with the current word
highlighted.

**Scope is short documents that arrive on paper and must be understood** —
bills, hospital letters, council letters, medicine labels, cards. Not books: a
300-page book means 300 photographs, and audiobook services already do that
better. One or two pages of anything is fine.

The TV is the right surface because the user already owns a large screen, sits
two metres from it, and is unafraid of the remote. The phone is only a camera,
and it is usually held by a relative or carer.

---

## 2. Hackathon

Entered in the **Amazon Developer Hackathon**, Fire TV track (Vega OS).

- **Deadline: 24 October 2026, 00:00 GMT+5**
- Devpost: https://amazonappdev2026.devpost.com/
- Fire TV priority categories that fit: **computer vision**, **multi-modal UX**
- Also eligible for the **AWS Builder** mini challenge (Lambda, S3, Textract,
  Bedrock Nova Lite + Pro, Polly) and the **Open Source** mini challenge (MIT)

**Submission requires:** text description, GitHub repo (public with a licence,
or private with Amazon reviewers added as collaborators), a demo video under
3 minutes showing the app running on a real Fire TV or the Vega simulator,
and product feedback on every tool and SDK used.

**Friction logs earn up to a 10% judging bonus** — see `FRICTION_LOG.md`.

Judging criteria: Tech Implementation, Design, Potential Impact, Quality of Idea.

---

## 3. Status

### Built and tested

| | |
|---|---|
| Vega app | Builds, installs, runs on the Vega virtual device |
| Pairing screen | QR code carrying a session secret, 6-digit confirmation code, connecting / waiting / reading / error states |
| Document view | Large print, D-pad line navigation, read-aloud with word highlight driven by real audio |
| Text size | 1x / 1.25x / 1.5x / 2x, persisted, shared across screens |
| Accessibility | Audited against Amazon's A11Y Compass and fixed; new states have spoken equivalents |
| Backend | Two Lambdas + S3, deployed; see `backend/README.md` |
| Pipeline | Textract LAYOUT+TABLES (headings kept) → Nova Lite classify → AnalyzeExpense + Nova Pro image cross-check → Nova Pro rewrite with the letter fenced as data → currency guard → whole-figure numeric guard → Polly neural with word marks |
| Tests | App: 49 Jest tests, typecheck clean, 0 lint errors. Backend: 26 unit tests |
| Abuse limits | 128-bit session secret, JPEG-only 4 MB uploads, 20 per session, 40 sessions and 80 uploads per address per day, a 200 docs/day cap spent only after a real read, 1-day data expiry |

### Unverified

- **Nothing has been run on a physical Fire TV**, and VoiceView has never been
  run against it. For an accessibility product that is a real gap — the markup
  is correct by construction, not confirmed by ear.
- **Audio playback on the virtual device.** The W3C media `AudioPlayer` is
  wired up per its type definitions; it has not yet been heard on a device.
  If it fails, the app falls back to the silent highlight automatically.
- **The phone page on a real iPhone.** HEIC → JPEG conversion relies on Safari
  decoding HEIC into a canvas, which it does on iOS 11+, but it has only been
  reasoned about, not tapped.
- **The app icon.** `assets/icon.png` (512×512) exists; wiring it into
  `manifest.toml` needs the `[package]` icon key checked against the Vega docs
  with `vega exec vpt validate manifest.toml`.
- **Lambda retry policy.** `aws/deploy.py` sets the processing function to zero
  async retries so a timed-out read is not re-run at full price; that call needs
  `lambda:PutFunctionEventInvokeConfig`, which is in the current
  `aws/iam-policy-phase2.json` but may not be on the user yet. Processing is
  idempotent either way (a retry sees the finished status and stops).

### Not started

- Demo video
- Fire OS build (separate project, out of scope before the deadline)

---

## 4. Running it

Full instructions in `DAILY_GUIDE.md` (also as a PDF). Short version, two
terminals:

```bash
# Terminal B
cd ~/Desktop/vega-os-and-fire-tv-env
vega virtual-device start
vega device start-port-forwarding --port 8081 --forward false
npm run build:debug
vega run-app $(find build -name '*_x86_64.vpkg' -path '*Debug*' | head -1) com.bigprint.tv.main

# Terminal A
npm start          # then press j for React Native DevTools
```

`vega` is sourced from `~/vega/env` by `~/.bashrc`. **Non-interactive shells
exit `.bashrc` early**, so scripts must `source ~/vega/env` explicitly.

`src/config.ts` decides the backend: empty `CAPTURE_BASE_URL` → built-in mock
(no network, sample document after 6 s); a URL → the real Lambda.

---

## 5. Code map

```
src/
  config.ts                    backend URL and poll interval
  App.tsx                      picks mock or remote service, routes on status
  screens/PairingScreen.tsx    QR, 6-digit code, connecting/waiting/reading/error, text size
  screens/DocumentView.tsx     large print, line navigation, word highlight
  hooks/useTextScale.ts        text size + persistence, shared by both screens
  hooks/useReadAloud.ts        word highlight from audio position, silent fallback
  hooks/useIncomingDocument.ts connecting/waiting/processing/arrived/error; holds a
                               second page until the reader presses Back
  services/documentService.ts  THE SEAM — mock and remote (session, polling, renewal)
  services/audioPlayer.ts      tiny player interface + media-element wrapper
  services/vegaAudio.ts        Vega W3C media AudioPlayer behind that interface
  data/documents.ts            GENERATED from real photos, do not hand-edit
  data/speechMarks.ts          Polly-shaped speech marks + local generator (fallback)
backend/
  lambda_capture.py            public endpoint: session, page, upload, result, audio
  capture_page.html            the phone page
  lambda_process.py            S3-triggered: pipeline + speech + results
  pipeline.py                  photo → OCR → classify → facts → plain English → guard
  speech.py                    Polly per line with word timings
  tests/                       unit tests (python -m unittest discover backend/tests)
  run_batch.py                 accuracy report over the bucket
  gen_fixtures.py              regenerates src/data/documents.ts
aws/
  iam-policy-phase1.json       user: Textract, Nova, Polly, the bucket (APPLIED)
  iam-policy-phase2.json       user: manage bigprint-tv-* Lambdas, pass the two roles (APPLIED)
  capture-role-policy.json     BigPrintTvCaptureRole
  process-role-policy.json     BigPrintTvProcessRole
  deploy.py                    idempotent create-or-update of everything
test/mocks/w3cmedia.js         Jest stand-in for the native media package
```

---

## 6. AWS

| | |
|---|---|
| Account | `236605144361` |
| Region | `us-east-1` — stay in it |
| Bucket | `bigprint-tv-dev-ru22` (Block Public Access ON) |
| IAM user | `bigprint-tv-dev`, policies `BigPrintTvPhase1` + `BigPrintTvPhase2` |
| Roles | `BigPrintTvCaptureRole`, `BigPrintTvProcessRole` |
| Functions | `bigprint-tv-capture` (Function URL, AuthType NONE), `bigprint-tv-process` |

Setup steps and troubleshooting: `AWS_SETUP.md`. Architecture, trust model and
cost: `backend/README.md`.

**Python tooling note:** Ubuntu 24.04 has no `awscli` package and Python is
externally managed. Use a venv; do not `pip install` system-wide.

---

## 7. Decisions, and the evidence behind them

These came from testing. Re-deriving them costs hours.

### `AnalyzeExpense` must not run on every document

It assumes the page is a receipt and force-fits anything into that shape. On a
university marks certificate it confidently reported `SUBTOTAL 3.32`,
`TAX 3.37`, `TOTAL 215.9` — none of which were money.

So the pipeline **classifies first with Nova**, and only runs `AnalyzeExpense`
when the document is genuinely financial.

### Key figures come from Textract, never from the language model

Nova rewrites prose. It is never asked to copy numbers, because it silently
drops them: on the first synthetic bill it returned the amount due but omitted
the due date Textract had read at 97.9%.

Nova Pro *is* shown the photo and asked for the same figures — but only so it
can **veto** a Textract reading it disagrees with. A disputed money figure is
hidden and the page is flagged low-confidence. Nova can never add a figure.

### A letter is data, not instructions

Scam post targets exactly this audience. The model's rules live in the system
turn and the OCR text is fenced as `<letter>…</letter>` with an explicit rule
that text addressed to a computer is reported, not obeyed. Key figures never
come from the model, so an injected "you owe £820" cannot become a pinned fact.

### Every number the model writes must exist in the OCR text

On a real fuel receipt the first pipeline produced "The amount for diesel is 8"
and "The total amount is 1" — real digits, wrong rows. Two fixes:

1. **OCR with layout and tables.** `DetectDocumentText` returns a table as a
   column of cells, so the model had to guess which numbers belonged together.
   `AnalyzeDocument` with LAYOUT + TABLES lets `structure_blocks()` rebuild
   each row as `cell | cell | cell` in reading order. 12× the OCR price, still
   under a quarter of the per-document cost.
2. **`numeric_guard()`.** A rewritten line whose figures are not all on the
   page is dropped. A figure is matched whole and in order ("76.44" matches
   "£76.44", "44.76" does not; the "8" in "28.8" never counts as an 8), so
   recalculated, transposed and invented numbers go, while regrouped phone
   numbers and spoken money ("92 pounds 58") survive. Empty table cells keep
   their column and values are paired with their headings, which is what
   prevents right-digits-wrong-row.

### Anything below 90% confidence is dropped, not shown

For a reader who cannot easily check the paper, a confidently wrong amount is
worse than no amount. `lowConfidence` triggers the on-screen warning.

### The secret lives only in the QR code

A 4-digit code that anyone could type was an open door: 10,000 guesses to push
a document onto a stranger's TV, or read theirs. Now the backend issues a
6-digit code **and** a 128-bit secret; every S3 key is a hash of both. The code
is shown on the TV and echoed on the phone purely so people can see they match.
Manual code entry was removed: there is no domain to type, and the secret
cannot be typed anyway.

### The public function cannot call any AI service

`bigprint-tv-capture` can write a photo and read a result, nothing else. If the
public endpoint is abused, the worst case is bounded by the processing
function's daily cap, not by the attacker's imagination. The review panel found
the first version of that cap could be exhausted by anyone with curl in a
minute, taking the service down for every real user until midnight: it is now
spent only after a photo has actually been read, every address gets 40 sessions
and 80 uploads a day, and the counters use S3 conditional writes.

### Audio is one MP3 per line, from Polly, with word marks

Polly is required because only it returns **speech marks** — word-level timings
— which is what makes synchronised highlighting possible. Per-line files mean
any line starts instantly and stops cleanly; Polly bills by character, so the
split costs nothing extra. Marks arrive as UTF-8 byte offsets and are converted
to character offsets in `speech.py`, or "£" would shift every highlight.

### Second page? Hold it until Back

A carer may photograph three pages in a row. A new document never replaces the
one being read; it is held and shown when the reader presses Back.

### HEIC fails outright

Textract rejects it with `UnsupportedDocumentException`. **iPhones shoot HEIC by
default**, so the phone page draws the photo onto a canvas and re-encodes it as
JPEG before upload (this also downscales to 2000 px and applies rotation).

### Accessibility: static text is unreachable on Fire TV

The screen reader follows **input focus**, so text that cannot be focused is
never spoken. The key facts were static — a blind user would never have heard
the amount due, which is the app's entire purpose. They are linked to the
first line with `accessibilityDescribedBy`. There is a regression test; do not
remove it. The pairing code is linked to the first button for the same reason,
and the QR frame's label tells a blind user what to ask a helper to do.

Related: the Vega accessibility props (`accessibilityDescribedBy`,
`accessibilityOrientationText`) **only type-check when components are imported
from `@amazon-devices/react-native-kepler`**, not from `react-native`.

Also: use `role` / `aria-label` / `aria-disabled`, not the deprecated
`accessibilityRole` / `accessibilityLabel` / `accessibilityState`. `role="text"`
is not a valid Vega role.

### Scale the prose, pin the essentials

Anything the user cannot complete the task without — the pairing code, key
facts — must sit outside the scaling, scrolling text flow. At 2x text an early
version scrolled the pairing code off screen, which defeats the feature.

### No Alexa for reading or payments

An Alexa skill cannot see the app's screen or drive the highlight; Vega's Alexa
integration (VSK) is for catalog search and playback.

Payments were considered and rejected: no third-party Alexa payment API exists,
Amazon IAP is for digital goods, payment initiation is regulated, and the amount
comes from OCR that may be wrong. Show how to pay instead.

---

## 8. Next steps

1. Run on a physical Fire TV with VoiceView on. Listen to every state.
2. Scan the QR with a real iPhone and a real Android phone.
3. Record the demo video: phone → TV round trip, read-aloud, text size, under
   three minutes.
4. Validate the icon key in `manifest.toml` with `vega exec vpt validate`.
5. Submit on Devpost with the friction log and tool feedback.

After the hackathon: CloudFront + rate limiting in front of the capture URL,
a per-TV allow-list so only a paired phone can send, and a batch mode that
lets a carer photograph several pages and have them queued on the TV.

---

## 9. Gotchas that cost time

| | |
|---|---|
| **Spaces in the project path break the build** | `kepler-module-manifest-builder` shells out unquoted. Never reintroduce spaces. |
| `console.log` is invisible in Metro on RN 0.83 | Static Hermes. Output only appears in React Native DevTools. |
| `POST /open-debugger` silently does nothing | Launch Chrome manually with the `devtoolsFrontendUrl` from `/json/list`. |
| Port forwarding is lost on every device restart | Re-run `start-port-forwarding`. Most common cause of "hot reload stopped working". |
| Screenshots do not work on the virtual device | `gwsi-tool-screenshooter` is physical-hardware only. |
| `vega project doctor` flags supported libraries | `react-native-qrcode-svg` and `react-native-w3cmedia` are reported as "not a managed OS-version package". False alarm; the build links them. |
| AsyncStorage and w3cmedia need Jest mocks | Wired up in `test/setup.js` and `jest.config.json` → `test/mocks/`. |
| Bedrock was blocked for hours on a new account | `ThrottlingException: Too many tokens per day` with all quotas at 0 was **account verification**, not quota. It cleared itself. |
| Inline policies on a user share a 2048-byte limit | Role policies go on the roles. Pasting one onto the user fails with "Maximum policy size exceeded". |
| The snapshot test was flaky | `Math.random` is pinned in `test/App.spec.tsx`. |
| Polly speech-mark offsets are bytes, not characters | Converted in `speech.py`; the app slices JS strings. |

---

## 10. Honest assessment

The pipeline is deliberately conservative: it would rather say nothing than
say a wrong number, and it tells the reader when it is unsure. The OCR scored
above 93% on 13 of 17 real photographs in the first batch; the layout-aware
pipeline has been run on the same photographs plus a set of sample invoices.

**The bigger risk is not technical.** Reaching an 82-year-old with macular
degeneration is harder than building this. They do not browse app stores.
Distribution runs through adult children, carers, and charities such as RNIB,
the Macular Society and Age UK. That belongs in the plan alongside the code.
