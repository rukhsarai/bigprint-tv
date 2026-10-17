# Handoff: making BigPrint TV ready for any TV

Read this first. Branch `claude/upbeat-rubin-ad0wgg`, draft PR
[rukhsarai/bigprint-tv#1](https://github.com/rukhsarai/bigprint-tv/pull/1);
the follow-up from the on-device run is
[rukhsarai/bigprint-tv#2](https://github.com/rukhsarai/bigprint-tv/pull/2).
The description of PR #1 predates the device run and still talks about a
public Function URL and untested audio; this file is current, it is not.
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

## Reading first, voice on request (this round, not yet on a device)

From the test-report feedback: reading on the TV is the main thing, the
word-by-word highlight read as blinking, and the voice must be cheap.

- **Text first, faster.** The document is published the moment the rewrite
  is done; the TV polls every second while a photo is being read (3 s
  otherwise); key facts and the rewrite run in parallel; the phone sends a
  smaller JPEG (quality 0.85).
- **Three views**, one View button: Full letter, Main points (numbered, at
  most six, through the same currency and numeric guards), Exact words
  (headings bold, table rows marked ▸). The choice is remembered.
- **Reading and listening are separate.** No word highlight, no speaker on a
  line, lines do nothing when pressed. **Listen** reads the whole letter as
  one story; the same button then says Pause, then Carry on listening.
  Changing the view leaves it playing. Alexa taking the speaker stops it.
- **Voice on request.** Nothing is sent to Polly until someone presses
  Listen; it is made once per letter and kept for the day. Polly was $0.05
  of $0.08 a letter; a letter read on screen is now about $0.02–0.03. See
  `backend/README.md` → Cost. Deploying this needs the new S3 trigger on
  `voice/` and the two role policies re-applied (`aws/deploy.py`,
  `aws/*-role-policy.json`): the process role now reads `results/*`, and the
  capture role writes `voice/*` and `results/*/voice.json`.
- **Next photo** replaces Back. It shows the code again, or the page already
  waiting ("Next photo is ready"); the remote's Back key does the same.

Check on the device: Listen on a short and a long letter (two parts play
back to back), Pause and Carry on listening, the "Getting the voice…" wait
(estimated 3–6 s: S3 event, Polly, one poll; not measured), and Next photo with a page waiting.

## Corrections to earlier notes (read before trusting older claims)

- An earlier version of this file said read-aloud audio "cannot be done on
  the virtual device" (IPC error -41). **Wrong.** The device plays audio
  fine; the app was being refused because `manifest.toml` declared no
  `[wants]` services. The error was `unauthorized access: missing
  [[wants.service]] manifest declaration, service = com.amazon.audio.system`.
  The manifest now declares the media and audio services (and `[offers]`
  `com.amazon.gipc.uuid.*`), and playback of one line was verified from the
  media pipeline's events: one `waiting → canplay → playing → ended` cycle,
  about 7 s. Each line is its own MP3 (the document had seven) and only one
  cycle was logged, so playing several lines in a row is still unverified.
  The non-obvious part: `com.amazon.audio.system` is the service the device
  log named, and the media-player setup guide's list does not mention it;
  declaring `audio.stream` and `audio.control` without it still fails.
- During the 16 Oct test session an early conclusion that the virtual device
  could not bind audio at all was drawn from `UISoundManager` (UI click
  sounds) failing. That is a different route from read-aloud; do not infer
  one from the other. Where the original `-41` note came from is not
  recorded.
- Audio was verified from pipeline events, not by ear. Word-highlight sync
  with the voice is still unconfirmed (see "Still unverified").

## Fixed and verified on the virtual device, 16 Oct afternoon

- **Read-aloud silent**: `[wants]` / `[offers]` added to `manifest.toml`.
  Verified, see above.
- **Wrapped text clipped mid-glyph**: every scaled `Text` except the
  document line set `fontSize` without `lineHeight`, so a wrapped string
  measured too short and its lower lines were clipped through the glyphs.
  The document line, which already set a line height, was the only text
  that rendered correctly. `useTextScale` now has `typeAt(size)` returning
  `{fontSize, lineHeight}` (ratio 1.4) and every scaled text on both screens
  uses it.

## Three-look UI (implemented, not yet seen on a device)

Built from the design canvas after colour research (sources on its
"Colour research" board). What is in `src/`:

- **Three looks**, `src/theme/colours.ts`: Dark (default), Light, Yellow on
  black. `ColoursProvider` remembers the choice under `bigprint.colours`.
  A first-run screen (`FirstRunColours`) asks "Which is easier to read?"
  until one is chosen; the Colours button on both screens cycles them.
  `test/colours.spec.ts` checks every text pair at 7:1 and every mark at 3:1.
- **Letters never flip.** A focused line keeps its colours and gets a 14 px
  ring, whose space is always reserved, so text never moves.
- **Yellow means focus** on Dark, and nothing else: key figures are white in
  grey-edged cards and the pairing code is white. Light has no yellow.
- **Problems and checks are panels** with an icon and a first word.
- **Listen** reads the whole letter aloud; see "Reading first, voice on
  request" above, which replaced Read whole letter and the word bar.
- **Design scale**, `src/theme/layout.ts`: every size is in 1920 × 1080
  design pixels, multiplied by `min(width / 1920, height / 1080)` of the
  window. On a 1920 × 1080 window nothing changes; on a 960 × 540 one the
  layout matches the drawing instead of overflowing. This is also the
  intended fix for the open bug below, if the window turns out smaller.
- **Icons** use `react-native-svg`, imported under the same name as the QR
  library. Importing it as `@amazon-devices/react-native-svg` as well
  loads a second copy and registers every SVG view twice (it crashed Jest;
  it would crash the app).

Differences from the canvas, on purpose: the reading-progress list shows two
steps, not three, because the backend reports only "processing"; the QR is
not dimmed while a photo is read, so a helper can still scan it; the offline
panel has no Try again or Wi-Fi button,
because nothing in the app can act on them yet (the TV already retries).

Check on the device: the debug line's window size, that icons draw, that
the 14 px ring is visible from 3 m, first run then pairing, each look on
both screens, Listen with real audio, and every look
with Fire TV's High Contrast Text on.

## Open bug: pairing-screen instructions overflow (changed, not verified)

At 1x on the virtual device, step 2 was cut at the ScrollView's clip edge
with the status line drawn over it, and step 3 was out of view. The
`lineHeight` fix above makes each line box taller, so it slightly worsens
this while fixing the mid-glyph clipping.

What is in the branch now: title 44 → 40 with a 16 px margin and the step
spacing 12 → 8. That saves roughly 35–40 px and nothing more. The step copy
is unchanged: shortening it did not change how many lines each step wraps
to, so it bought no height. The scroll indicator is not shown: nothing in
the block can take focus, so a remote cannot scroll it, and an indicator
would advertise content the user cannot reach.

Two facts to settle before the next change, because the fix depends on
them:

- **The logical viewport.** With the file's own numbers (96/54 padding,
  left column 3/5 of the width, ~177 px of controls) the old block fit
  comfortably at 1x on a 1920×1080 or 1280×720 logical screen; the reported
  symptom only reproduces at a logical size around 960×540 (a density-2
  screen), where the title and every step wrap to two lines. In that
  geometry the current block still overflows by about 120 px at 1x. The
  pairing screen's debug line now shows the window size and scale next to
  the text size; read it off the screen on the next run and record it here.
- **Whether the steps may scroll.** The test report advises against a
  scrollable instruction list for this audience. If overflow must be
  reachable at 1.5x and 2x, the steps have to be focusable (a
  `TVFocusGuideView` of `Pressable`s, as the document view does for lines);
  that changes the focus order from the size buttons and is a design call.

If the viewport is 960×540, the whole screen is laid out for twice its
size (the 300 px QR plus 48 px frame does not fit a 307 px column either)
and the right fix is to size the pairing screen for that viewport: a title
that fits one line (about 28 px bold, or placed above both columns) and
steps that fit one line each at 1x.

## Still unverified

- Real Fire TV hardware. Everything above is the x86_64 virtual device;
  `vega device list` never showed a physical device.
- Audible confirmation of Listen, Pause and Carry on listening, and a letter
  long enough to play in two parts; only one line of the old per-line voice
  was logged playing.
- The pairing-screen layout at every text size (see the open bug above).
- Remote Back key on a physical remote: Back on a document does what Next
  photo does, Back on the pairing screen exits, and nothing else exits.
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
