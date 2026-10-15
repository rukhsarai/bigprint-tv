# BigPrint TV

A Fire TV app that reads your post to you.

Photograph a letter or bill with your phone. It appears on the television in
very large print and is read aloud in a natural voice, one word highlighted at
a time.

Built for people with age-related sight loss, who already own a large screen
and know how to use a remote. The phone is only a camera, and it is usually
held by a relative or carer.

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
| [DAILY_GUIDE.md](DAILY_GUIDE.md) | Commands to start work each day ([PDF](BigPrint_TV_Daily_Guide.pdf)) |
| [FRICTION_LOG.md](FRICTION_LOG.md) | Developer-experience issues found while building on Vega |

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
   figures against the photo, and makes audio with word timings using Polly.
4. The TV polls for the result and shows it in large print. Pressing a line
   plays its audio with the spoken word highlighted.

Every number in the spoken text must exist in the OCR output, and a key figure
is shown only when two independent readers agree. For this audience a
confidently wrong number is worse than no number.

## Quick start

```bash
vega virtual-device start
vega device start-port-forwarding --port 8081 --forward false
npm install
npm run build:debug
vega run-app $(find build -name '*_x86_64.vpkg' -path '*Debug*' | head -1) com.bigprint.tv.main
```

```bash
npm test                                   # app: 41 tests
python -m unittest discover backend/tests  # backend: 14 tests
npm run lint
npx tsc --noEmit
```

With `CAPTURE_BASE_URL` empty in `src/config.ts` the app runs against a
built-in mock and needs no AWS account. To use the real backend, deploy it
(`aws/deploy.py`, see [backend/README.md](backend/README.md)) and paste the URL
it prints into `src/config.ts`.

## Stack

React Native 0.83 on Vega OS (Vega SDK 0.24) · AWS Lambda · Amazon S3 ·
Amazon Textract · Amazon Bedrock (Nova Lite, Nova Pro) · Amazon Polly

## Licence

MIT — see [LICENSE](LICENSE).
