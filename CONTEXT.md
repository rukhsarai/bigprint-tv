# BigPrint TV — project context

**Read this first.** It is the handover document: what the product is, what is
built, what is still fake, and the decisions that would be expensive to
rediscover. Last updated 12 October 2026.

---

## 1. The product

A Fire TV app for people who cannot comfortably read paper post — primarily
older people with age-related sight loss.

Someone photographs a letter with a phone. It appears on the television in very
large print, and can be read aloud with the current word highlighted.

**Scope is short documents that arrive on paper and must be understood** —
bills, hospital letters, council letters, medicine labels, cards. Not books: a
300-page book means 300 photographs, and audiobook services already do that
better. One or two pages of anything is fine.

The TV is the right surface because the user already owns a large screen, sits
two metres from it, and is unafraid of the remote. The phone is only a camera.

---

## 2. Hackathon

Entered in the **Amazon Developer Hackathon**, Fire TV track (Vega OS).

- **Deadline: 24 October 2026, 00:00 GMT+5**
- Devpost: https://amazonappdev2026.devpost.com/
- Fire TV priority categories that fit: **computer vision**, **multi-modal UX**
- Also eligible for the **AWS Builder** mini challenge (uses Textract, Bedrock
  Nova, Polly, S3) and the **Open Source** mini challenge

**Submission requires:** text description, GitHub repo (public with a licence,
or private with Amazon reviewers added as collaborators), a demo video under
3 minutes showing the app running on a real Fire TV or the Vega simulator,
and product feedback on every tool and SDK used.

**Friction logs earn up to a 10% judging bonus** — see `FRICTION_LOG.md`, which
already has six real entries.

Judging criteria: Tech Implementation, Design, Potential Impact, Quality of Idea.

---

## 3. Status

### Works

| | |
|---|---|
| Vega app | Builds, installs, runs on the Vega virtual device |
| Pairing screen | QR code + 4-digit code, waiting and error states |
| Document view | Large print, D-pad line navigation, read-aloud with word highlight |
| Text size | 1x / 1.25x / 1.5x / 2x, persisted, shared across screens |
| Accessibility | Audited against Amazon's A11Y Compass and fixed |
| Tests | 26 passing, typecheck clean, 0 lint errors |
| AWS pipeline | Textract → Nova → Polly proven on 18 real photographs |

### Still fake

- **Document delivery is a `setTimeout`.** `createMockDocumentService` in
  `src/services/documentService.ts` delivers a sample after 6 seconds. No
  network call exists in the app.
- **Read-aloud produces no sound.** The word highlight is driven by a timer
  using locally generated speech marks. Polly is proven to work but is not
  wired into the app.
- **The QR points nowhere.** `CAPTURE_BASE_URL` is
  `https://bigprint.tv/scan` — that domain has no DNS record.

### Not started

- Phone capture page (decision made: AWS Lambda Function URL — see §8)
- Git repository and GitHub (required for submission)
- Demo video
- App icon (512×512 PNG; `vega project doctor` flags its absence)
- Fire OS build (separate project, probably out of scope before the deadline)

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

---

## 5. Code map

```
src/
  App.tsx                      owns the pairing code, routes on delivery status
  screens/PairingScreen.tsx    QR, 4-digit code, waiting/error, text size
  screens/DocumentView.tsx     large print, line navigation, word highlight
  hooks/useTextScale.ts        text size + persistence, shared by both screens
  hooks/useReadAloud.ts        drives word highlighting from speech marks
  hooks/useIncomingDocument.ts waiting / arrived / error, subscription teardown
  services/documentService.ts  THE SEAM — swap the mock for the real transport
  data/documents.ts            GENERATED from real photos, do not hand-edit
  data/speechMarks.ts          Polly-shaped speech marks + local generator
backend/
  pipeline.py                  photo → OCR → classify → facts → plain English
  run_batch.py                 whole bucket, accuracy report
  gen_fixtures.py              regenerates src/data/documents.ts
aws/
  iam-policy-phase1.json       Textract, Bedrock Nova, Polly, S3 (APPLIED)
  iam-policy-phase2.json       Lambda + scoped PassRole (NOT YET APPLIED)
  lambda-execution-role-*.json for the capture Lambda
```

---

## 6. AWS

| | |
|---|---|
| Account | 236605144361 |
| Region | `us-east-1` — stay in it |
| Bucket | `bigprint-tv-dev-ru22` (Block Public Access ON) |
| IAM user | `bigprint-tv-dev`, policy `BigPrintTvPhase1` |
| Credentials | `~/.aws/credentials`, `[default]` profile |

All four services verified working: Textract, Bedrock Nova, Polly, S3.

Setup steps and troubleshooting: `AWS_SETUP.md`.

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
when the document is genuinely financial. An earlier conclusion — "take key
facts from Textract, not Nova" — was drawn from one clean synthetic bill and
was wrong on real documents.

### Key figures come from Textract, never from the language model

Nova rewrites prose. It is never asked to copy numbers, because it silently
drops them: on the first synthetic bill it returned the amount due but omitted
the due date Textract had read at 97.9%.

### Anything below 90% confidence is dropped, not shown

For a reader who cannot easily check the paper, a confidently wrong amount is
worse than no amount. `lowConfidence` triggers the on-screen warning.

### OCR flattens tables, so the rewrite must rebuild them

Textract returns one cell per line. A naive rewrite produced `"100"`, `"85"`,
`"3"`, `"3.75"` — meaningless read aloud. The prompt now requires whole
sentences and recombines table rows (`"Islamic Studies: 85 out of 100, grade
point 3.75."`). `_is_speakable()` drops fragments that slip through.

### HEIC fails outright

Textract rejects it with `UnsupportedDocumentException`. **iPhones shoot HEIC by
default**, so the capture page must convert to JPEG before upload. One of the
18 test photos was HEIC.

### Accessibility: static text is unreachable on Fire TV

The screen reader follows **input focus**, so text that cannot be focused is
never spoken. The key facts were static — a blind user would never have heard
the amount due, which is the app's entire purpose. They are now linked to the
first line with `accessibilityDescribedBy`. There is a regression test; do not
remove it.

Related: the Vega accessibility props (`accessibilityDescribedBy`,
`accessibilityOrientationText`) **only type-check when components are imported
from `@amazon-devices/react-native-kepler`**, not from `react-native`. The
template imports from `react-native`, so this bites immediately.

Also: use `role` / `aria-label` / `aria-disabled`, not the deprecated
`accessibilityRole` / `accessibilityLabel` / `accessibilityState`. `role="text"`
is not a valid Vega role.

### Scale the prose, pin the essentials

Anything the user cannot complete the task without — the pairing code, key
facts — must sit outside the scaling, scrolling text flow. At 2x text an early
version scrolled the pairing code off screen, which defeats the feature.

### No Alexa for reading or payments

An Alexa skill cannot see the app's screen or drive the highlight; Vega's Alexa
integration (VSK) is for catalog search and playback. Polly is required because
only it returns **speech marks** — word-level timings — which is what makes
synchronised highlighting possible.

Payments were considered and rejected: no third-party Alexa payment API exists,
Amazon IAP is for digital goods, payment initiation is regulated, and the amount
comes from OCR that may be wrong. Show how to pay instead.

---

## 8. Next step (decided, not yet built)

**A single Lambda with a Function URL** serves the capture page and issues
presigned S3 uploads. Chosen over Vercel, Amplify and S3+CloudFront because it
is one resource, gives a free HTTPS URL, needs no domain, and keeps AWS
credentials inside AWS.

- `GET /?c=1234` → capture page HTML
- `POST /upload` → presigned S3 PUT to `uploads/<code>/<uuid>.jpg`

**Blocked on:** the user creating `BigPrintTvCaptureRole` in the console and
attaching `aws/iam-policy-phase2.json` to `bigprint-tv-dev`. `iam:CreateRole`
was deliberately **not** requested — it is a privilege-escalation path. The
agent gets `iam:PassRole` scoped to that one role ARN instead.

**Known risk:** a Function URL with `AuthType: NONE` is a public upload
endpoint. Mitigate with code validation, size and content-type limits, short
presign expiry, random keys. Add an S3 lifecycle rule deleting `uploads/` after
a day or two — these are photographs of people's private post.

After that: wire `documentService.ts` to the real backend, swap the read-aloud
timer for Polly audio, app icon, git repo, demo video.

---

## 9. Gotchas that cost time

| | |
|---|---|
| **Spaces in the project path break the build** | `kepler-module-manifest-builder` shells out unquoted. The folder was renamed from `vega os and fire tv env` for this reason. Never reintroduce spaces. |
| `console.log` is invisible in Metro on RN 0.83 | Static Hermes. Output only appears in React Native DevTools. |
| `POST /open-debugger` silently does nothing | Returns 200, logs "Launching DevTools...", no browser. `DISPLAY` was correctly set. Launch Chrome manually with the `devtoolsFrontendUrl` from `/json/list`. |
| Port forwarding is lost on every device restart | Re-run `start-port-forwarding`. Most common cause of "hot reload stopped working". |
| Screenshots do not work on the virtual device | `gwsi-tool-screenshooter` is physical-hardware only, so visual checks need human eyes. `vega device info` also returns empty `product`, so the documented vvrp check fails. |
| `vega project doctor` flags supported libraries | `react-native-qrcode-svg` is reported as "not a managed OS-version package". It is a false alarm; the build links it correctly. |
| AsyncStorage needs a Jest mock | Not mentioned in the Vega docs. Wired up in `test/setup.js`. |
| Bedrock was blocked for hours | All quotas applied as 0 while defaults were in the millions; error was `ThrottlingException: Too many tokens per day`. It was **account verification**, not quota. It cleared itself. Do not file a quota increase for this — the blocking quota is marked Not adjustable. |
| The snapshot test was flaky | The pairing code is random. `Math.random` is pinned in `test/App.spec.tsx`. |

---

## 10. Honest assessment

The app is well built and genuinely accessible. The pipeline works on real
photographs — OCR scored above 93% on 13 of 17 images.

**What is unproven:** nothing has been tested on a physical Fire TV, and
VoiceView has never been run against it. For an accessibility product that is a
real gap — the markup is correct by construction, not confirmed by ear.

**The bigger risk is not technical.** Reaching an 82-year-old with macular
degeneration is harder than building this. They do not browse app stores.
Distribution runs through adult children, carers, and charities such as RNIB,
the Macular Society and Age UK. That belongs in the plan alongside the code.
