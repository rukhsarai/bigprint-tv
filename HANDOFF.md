# Handoff: making BigPrint TV ready for any TV

Read this first. Branch `claude/upbeat-rubin-ad0wgg`, draft PR
[rukhsarai/bigprint-tv#1](https://github.com/rukhsarai/bigprint-tv/pull/1).
Last updated 16 October 2026 (afternoon, after the first on-device run
against the live backend).

## Where things stand

- **End to end works on the virtual device.** Pairing → phone photo → OCR →
  document on screen → read-aloud, all against the live backend at
  `https://7y24w49ro6.execute-api.us-east-1.amazonaws.com` (API Gateway HTTP
  API `7y24w49ro6` in front of `bigprint-tv-capture`). Upload to document on
  screen took about 8 s. Two real phone photos were read correctly, with the
  low-confidence banner shown where it should be.
- **App:** release build 2.5 MB, cold launch 874 ms, D-pad works, text size
  persists (1x and 1.25x observed). Jest, `tsc` and lint clean.
- **Backend:** two Lambdas (`bigprint-tv-capture`, `bigprint-tv-process`) and
  bucket `bigprint-tv-dev-ru22` in us-east-1. Accuracy on samples: 11 photos
  read, 17 key facts, 0 wrong. Details in `backend/README.md`.
- **No open blocker.** The earlier Function URL 403 is history: the old URL
  and its public statement are deleted, and the API answers `GET /health`
  with 200 from outside AWS. No account-level guardrail investigation is
  needed.

## Corrections to earlier notes (read before trusting older claims)

- An earlier version of this file said read-aloud audio "cannot be done on
  the virtual device" (IPC error -41). **Wrong.** The device plays audio
  fine; the app was being refused because `manifest.toml` declared no
  `[wants]` services. The error was `unauthorized access: missing
  [[wants.service]] manifest declaration, service = com.amazon.audio.system`.
  The manifest now declares the media and audio services (and `[offers]`
  `com.amazon.gipc.uuid.*`), and playback was verified from the media
  pipeline's events: `waiting → canplay → playing → ended`, about 7 s for a
  seven-line document. The non-obvious part: `com.amazon.audio.system` is
  required even though the media-player setup guide lists only
  `audio.stream` and `audio.control`; declaring those two alone still fails.
- The old `-41` conclusion was generalised from `UISoundManager` (UI click
  sounds) failing. That is a different route from read-aloud; do not infer
  one from the other.
- Audio was verified from pipeline events, not by ear. Word-highlight sync
  with the voice is still unconfirmed (see "Still unverified").

## Fixed on device, 16 Oct afternoon

- **Read-aloud silent**: `[wants]` / `[offers]` added to `manifest.toml`.
  Verified, see above.
- **Wrapped text clipped mid-glyph**: every scaled `Text` set `fontSize`
  without `lineHeight`, so a wrapped string measured too short and its lower
  lines were clipped through the glyphs. The one exception, the document
  line, was the only text that rendered correctly. `useTextScale` now has
  `typeAt(size)` returning `{fontSize, lineHeight}` (ratio 1.4) and every
  scaled text on both screens uses it.
- **Pairing-screen instructions overflowed** at 1x: step 2 was cut at the
  ScrollView's clip edge with the status line drawn over it, and step 3 was
  out of view. Taller line boxes from the fix above made it marginally
  worse. Applied the cheap options from the test report: title 44 → 40 with
  a 16 px margin, instruction copy shortened, spacing tightened, and the
  scroll indicator shown so any remaining overflow at 1.5x/2x reads as
  "more below". **Not yet seen on a device**; re-check at every size. If it
  still overflows at 1x, the remaining option is to give the instruction
  block a fixed share of the column, which is poor for this audience, so
  prefer shortening copy further.

## Still unverified

- Real Fire TV hardware. Everything above is the x86_64 virtual device;
  `vega device list` never showed a physical device.
- Audible confirmation and word-highlight sync with the voice.
- Remote Back key on a physical remote: Back on a document returns to the
  pairing screen, Back on the pairing screen exits, and nothing else exits.
- **VoiceView** (Fire TV screen reader) against both screens.
- The phone page on an iPhone (HEIC → JPEG happens in Safari via canvas). The
  session's photos came from a phone whose model and browser were not
  recorded.
- **QR scan** from a sofa at 1080p (300 px code).
- Text sizes 1.5x and 2x on a device; only 1x and 1.25x were observed, and
  the pairing-screen layout fix above should be re-checked at both.
- D-pad focus order on a real panel.

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
  removed. (The privilege was the wrong mechanism, but the services still had
  to be declared under `[wants]`; see "Corrections" above.) The manifest
  validated with 0 errors in the 16 Oct release build.

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
npm test                      # app (Jest; App.spec is a cold-start flake under the
                              # full parallel run, hence testTimeout 15 s in jest.config.json)
npx tsc --noEmit && npm run lint
npm run test:backend          # backend unit tests
npm run build:release         # react-native build-vega
python aws/deploy.py --status
python backend/gen_fixtures.py   # regenerate src/data/documents.ts from backend/fixtures/
```

Docs: `CONTEXT.md` (project map), `AWS_SETUP.md` (IAM and deploy,
troubleshooting table), `backend/README.md` (pipeline, accuracy, cost),
`FRICTION_LOG.md` (10 entries for the hackathon).
