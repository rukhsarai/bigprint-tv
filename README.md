# BigPrint TV

A Fire TV app that reads your post to you.

Photograph a letter or bill with your phone. It appears on the television in
very large print and can be read aloud, one word highlighted at a time.

Built for people with age-related sight loss, who already own a large screen
and know how to use a remote.

---

## 👉 Start with [CONTEXT.md](CONTEXT.md)

It is the handover document: what is built, what is still mocked, the decisions
behind the architecture and the evidence for them, and the gotchas that cost
time. Read it before changing anything.

## Other documents

| File | What it is |
|---|---|
| [CONTEXT.md](CONTEXT.md) | **Full project context — read first** |
| [DAILY_GUIDE.md](DAILY_GUIDE.md) | Commands to start work each day ([PDF](BigPrint_TV_Daily_Guide.pdf)) |
| [AWS_SETUP.md](AWS_SETUP.md) | AWS account setup, current values, troubleshooting |
| [FRICTION_LOG.md](FRICTION_LOG.md) | Developer-experience issues found while building on Vega |
| [backend/README.md](backend/README.md) | The document pipeline and why it is shaped that way |

## Quick start

```bash
vega virtual-device start
vega device start-port-forwarding --port 8081 --forward false
npm install
npm run build:debug
vega run-app $(find build -name '*_x86_64.vpkg' -path '*Debug*' | head -1) com.bigprint.tv.main
```

```bash
npm test          # 26 tests
npm run lint
npx tsc --noEmit
```

## Stack

React Native 0.83 on Vega OS (Vega SDK 0.24) · Amazon Textract · Amazon Bedrock
Nova · Amazon Polly · Amazon S3

## Status

The app runs and is fully navigable. Document delivery, audio playback and the
phone capture page are not yet wired to the backend — see CONTEXT.md §3.
