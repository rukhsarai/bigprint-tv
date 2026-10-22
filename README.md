# BigPrint TV

A Fire TV app that reads your post to you.

Photograph a letter or bill with your phone. It appears on the television in
very large print, to read at your own pace. If you would rather listen, one
press reads the whole letter aloud in a natural voice.

Built for people with age-related sight loss, who already own a large screen
and know how to use a remote. The phone is only a camera, and it is usually
held by a relative or caregiver. Built in Pakistan for every living room
with a Fire TV; the first market is the United States.

## Why

A few months ago I got solar retinopathy. Suddenly I could not read the
messages on my phone, and I could not read the text on a page either. Things
I had always done without thinking, a text from a friend, a letter on the
table, were out of reach, and I was worried. Then I thought: this is not only
my problem. Millions of people live with it every day, most of them older,
and their mail keeps arriving. I decided to solve it, for me and for them.

The answer was already in the room: a large screen that most people own and
know how to drive with a remote, and a phone in a relative's hand to act as
the camera. BigPrint TV is that idea, built.

---

## 👉 Start with [CONTEXT.md](CONTEXT.md)

It is the handover document: what is built, the decisions behind the
architecture and the evidence for them, and the gotchas that cost time. Read it
before changing anything.

## Other documents

| File | What it is |
|---|---|
| [CONTEXT.md](CONTEXT.md) | **Full project context — read first** |
| [backend/README.md](backend/README.md) | The AWS backend: architecture, trust model, cost, deploy |
| [AWS_SETUP.md](AWS_SETUP.md) | AWS account and IAM setup, step by step |
| [DAILY_GUIDE.md](DAILY_GUIDE.md) | Commands to start work each day ([PDF](BigPrint_TV_Daily_Guide.pdf), app part only) |
| [FRICTION_LOG.md](FRICTION_LOG.md) | Developer-experience issues found while building on Vega |
| [SUBMISSION.md](SUBMISSION.md) | Hackathon submission pack: criteria, competitor scan, Devpost text, video script, checklist |

## How it works

```
 phone camera ──▶ capture Lambda ──▶ S3 ──▶ process Lambda ──▶ S3 ──▶ TV
                 (public URL)                 Textract
                                              Bedrock Nova
                                              Polly
```

1. The TV shows a QR code. Scanning it opens a one-button web page.
2. The page downscales the photo and sends it to a Lambda function.
3. A second Lambda reads the page with Textract (layout and tables), rewrites
   it into short spoken sentences with Amazon Nova, pulls any amount due or
   deadline out with Textract's expense model, has Nova cross-check those
   figures against the photo, and writes the main points as well.
4. The TV polls for the result and shows it in large print: the whole letter,
   the main points, or the exact words. **Listen** asks for the letter to be
   read aloud with Polly, made then and only then, so a letter nobody listens
   to costs nothing to voice. **Next photo** goes on to the next page.

Every number in the spoken text must exist in the OCR output, and a key figure
is shown only when two independent readers agree. For this audience a
confidently wrong number is worse than no number.

## For judges: try it in five minutes

You do not need an AWS account. The app is built against the live backend,
which stays up through the judging window (to 20 November 2026).

**On the Vega virtual device or a Fire TV running Vega OS**

1. Download the package for your target from the
   [latest release](https://github.com/rukhsarai/bigprint-tv/releases/latest):
   `x86_64` for the virtual device, `aarch64` for a Fire TV.
2. Install and launch:

   ```bash
   vega install-app bigprint-tv-0.1.0_x86_64.vpkg
   vega run-app com.bigprint.tv.main
   ```

3. Scan the QR code on the TV with any phone, photograph a letter, a bill
   or a note, and watch it arrive on the screen. Press **Listen** to hear it.
   A sample bill to photograph is in [samples/us-bill.jpg](samples/us-bill.jpg);
   a deliberately blurry one is next to it.

**Without a device**

```bash
backend/tools/round_trip.sh              # live backend, end to end, ~15 s
npm ci && npm test                       # app: 157 tests
python3 -m unittest discover backend/tests   # backend: 37 tests
```

`round_trip.sh` opens a pairing session, uploads a sample photo, waits for
the text, and prints the key facts the pipeline extracted, which is the whole
product minus the screen.

## Quick start

```bash
vega virtual-device start
vega device start-port-forwarding --port 8081 --forward false
npm install
npm run build:debug
vega run-app $(find build -name '*_x86_64.vpkg' -path '*Debug*' | head -1) com.bigprint.tv.main
```

```bash
npm test                                   # app: 157 tests
python -m unittest discover backend/tests  # backend: 37 tests
npm run lint
npx tsc --noEmit
backend/tools/round_trip.sh                # the live backend, end to end, in ~15 s
```

With `CAPTURE_BASE_URL` empty in `src/config.ts` the app runs against a
built-in mock and needs no AWS account. To use the real backend, deploy it
(`aws/deploy.py`, see [backend/README.md](backend/README.md)) and paste the URL
it prints into `src/config.ts`.

## Status, 19 October 2026

Everything runs against the live backend. Verified from outside AWS with
`backend/tools/round_trip.sh`: a synthetic bill is on the TV in 8–12 seconds
with every key figure right, and the voice is ready about 3 seconds after
Listen is pressed. Not yet run on a physical Fire TV. Demo video: to be
recorded (script in [SUBMISSION.md](SUBMISSION.md)).

## Stack

React Native 0.83 on Vega OS (Vega SDK 0.24) · AWS Lambda · Amazon S3 ·
Amazon Textract · Amazon Bedrock (Nova Lite, Nova Pro) · Amazon Polly

## Licence

MIT — see [LICENSE](LICENSE).
