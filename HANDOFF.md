# Handoff: making BigPrint TV ready for any TV

Read this first. Branch `claude/upbeat-rubin-ad0wgg`, draft PR
[rukhsarai/bigprint-tv#1](https://github.com/rukhsarai/bigprint-tv/pull/1).
Last updated 16 October 2026.

## Where things stand

- **App:** builds, installs and launches on the x86_64 Vega virtual device
  (cold launch under 1 s), D-pad works, text size persists, the whole pairing →
  processing → document flow runs against the built-in mock. 50 Jest tests,
  `tsc` and lint clean.
- **Backend:** two Lambdas (`bigprint-tv-capture`, `bigprint-tv-process`) and
  bucket `bigprint-tv-dev-ru22` in us-east-1 are deployed and work end to end
  when invoked directly: 11 sample photos read, 17 key facts, 0 wrong.
  Details in `backend/README.md`.
- **Blocker:** the capture function's public Function URL answers
  `403 AccessDeniedException` to every anonymous caller although it is
  configured exactly as AWS documents (checked live: `AuthType NONE`, policy
  statement present). The control refusing it sits above the function and the
  deploy user cannot see it. **Fix is written, not yet applied:** `aws/deploy.py`
  now puts an API Gateway HTTP API in front of the function (same event
  format, no public policy needed on the function).

## Do this first (in order)

1. Paste the current `aws/iam-policy-phase2.json` over the inline policy
   `BigPrintTvPhase2` on IAM user `bigprint-tv-dev` (it gains the
   `apigateway:*` actions). Role policies are already correct.
2. Run `python aws/deploy.py --write-config` (needs boto3 and that user's
   keys; or do the same calls through the AWS connector: `apigatewayv2
   CreateApi` quick-create with `Target` = capture function ARN, `UpdateStage`
   throttling, `lambda AddPermission` for `apigateway.amazonaws.com`, delete
   the old Function URL). It ends with an anonymous `GET /health`; it must
   print 200. If it prints 403 too, the account refuses public endpoints of
   any kind: ask the AWS organisation administrator.
3. Commit the new `src/config.ts` (`CAPTURE_BASE_URL` = the API endpoint,
   no trailing slash), rebuild, install on the device, pair with a phone, send
   a photo. Expected: document on screen within 15–50 s.

## Then, on real hardware (cannot be done on the virtual device)

- **Read-aloud audio.** The virtual device cannot bind
  `com.amazon.audio.*` (IPC error -41). On a Fire TV check: sound plays,
  word highlight follows the voice, Play/Pause and Back behave, the silent
  fallback appears only if audio fails. Code: `src/services/vegaAudio.ts`,
  `src/services/audioPlayer.ts`, `src/hooks/useReadAloud.ts`.
- **VoiceView** (Fire TV screen reader) against both screens.
- **QR scan** from a sofa at 1080p (300 px code), and the phone page on an
  iPhone (HEIC → JPEG happens in Safari via canvas).
- Text sizes 1x–2x on a real panel; D-pad focus order; Back never exits
  unexpectedly.

## Device-readiness review (16 Oct, 26 agents, every finding adversarially verified)

Fixed in this branch, all covered by Jest, none yet seen on hardware:

- **Back on the remote exited the app from the document view.** `DocumentView`
  now claims `hardwareBackPress` through Vega's `BackHandler` and goes back to
  the pairing screen. On a real TV, press Back on a document and confirm the
  app stays open; on the pairing screen Back should still exit.
- **Early session renewal orphaned phone pages.** The TV renewed its code 10
  minutes before the backend expired it, so a page sent under the old code was
  read into a session nobody watched, and a TV mid-read stayed on "Reading your
  letter" for ever. Renewal is now driven only by the backend's 404/410, the
  state resets on a switch, and a switch mid-read shows "The code expired while
  a page was being read…" next to the new QR. Remaining gap: a page accepted in
  the few seconds before the backend's own expiry is still lost (the backend
  refuses reads of an expired code); closing it means a read-only grace period
  in `lambda_capture.py` plus polling the old code alongside the new one.
- **Wi-Fi loss after pairing was silent.** Five failed polls in a row now show
  the no-network message; the first good poll re-announces the session, which
  clears it.
- **429/500/503 on session start said "cannot reach the internet".** The
  backend's own message is shown instead; 401/403 say the service refused the TV.
- **No request timeout.** Every fetch now aborts after 15 s.
- **Audio start-timeout left the player loading**, so late audio could play
  over the silent highlight; the element is paused on fallback. The explicit
  `load()` call, which the package lists as unsupported, is gone.
- **Disabled size buttons were unfocusable**, so at 2x the preferred-focus
  button could not take focus at launch. Buttons now stay focusable and expose
  `accessibilityState.disabled` instead.
- `manifest.toml`: the two autolinked media modules are declared; the
  privilege `com.amazon.system.audio`, which exists nowhere in the SDK, is
  removed. Run `vega exec vpt validate manifest.toml` once on a machine with
  the Vega CLI.

Refuted by the verifiers (no change needed): "Play/Pause does nothing while a
line is read" — the document view handles it.

## Facts that save time

- The deploy user cannot change IAM; role/user policies are pasted in the
  console. User inline policies are capped at 2048 bytes without whitespace;
  `iam-policy-phase2.json` is at 1985.
- S3 answers `AccessDenied`, not `NoSuchKey`, for a missing key to a role
  without `ListBucket`; both Lambdas treat that 403 as "not there" (logged).
- The Vega build appends two media modules to `manifest.toml`; they are now
  declared, so the tree stays clean. `fast-text-encoding` must be imported
  before the QR package (`src/screens/PairingScreen.tsx`).
- Accuracy design: numbers come from Textract only; Nova may veto a money
  figure, never supply one; a currency is spoken only if printed; any line
  with a figure not on the page is dropped. Low-resolution photos are read
  but flagged "check against the paper copy".
- Limits: JPEG ≤ 4 MB, 20 uploads/session, 40 sessions and 80 uploads per
  address per day, 200 documents/day, API throttled to 20 r/s. Sessions
  expire after 2 h; everything in the bucket after 1 day.
- Cost ≈ $0.08 per document; idle ≈ $0.

## Commands

```
npm test                      # app (Jest)
npx tsc --noEmit && npm run lint
npm run test:backend          # backend unit tests
npm run build:release         # react-native build-vega
python aws/deploy.py --status
python backend/gen_fixtures.py   # regenerate src/data/documents.ts from backend/fixtures/
```

Docs: `CONTEXT.md` (project map), `AWS_SETUP.md` (IAM and deploy,
troubleshooting table), `backend/README.md` (pipeline, accuracy, cost),
`FRICTION_LOG.md` (10 entries for the hackathon).
