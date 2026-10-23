# BigPrint TV — submission pack

Final analysis for **Build, Ship, Shape: Amazon Developer Hackathon**, Fire TV
track (Vega OS). Written 19 October 2026, four days before the deadline.

- **Deadline:** 23 October 2026, 12:00 PM Pacific (24 October, 00:00 GMT+5).
- **Judging:** 9–20 November 2026. Winners on or around 3 December.
- **Rule that matters most:** judges are not required to run the project and
  may judge on the text, images and video alone. The video and the
  description carry the submission; the code backs them up.

---

## 1. Verdict

The product is finished and working. What remains is submission mechanics,
listed in order in §8: merge to `main`, one build with the icon, the video,
the form. Nothing in the code is blocking.

Verified today, 19 October, from a machine outside AWS with no Fire TV, by
`backend/tools/round_trip.sh` against the deployed backend (two runs):

| Step | Run 1 | Run 2 |
|---|---|---|
| Pairing session issued | instant | instant |
| Phone page served | HTTP 200 | HTTP 200 |
| Upload accepted (223 KB JPEG, synthetic water bill) | yes | yes |
| Text on the TV (OCR → classify → key facts → rewrite → guards) | 11.7 s | 8 s |
| Key facts | 5 of 5 right (£92.58 due, date, account, phone) | 5 of 5 right |
| Voice ready after pressing Listen (Polly, on request) | 3.6 s | 3 s |
| Audio served | 340 KB MP3 | 276 KB MP3 |

App: 162 Jest tests, typecheck clean, 0 lint errors. Backend: 44 unit tests.
Licence: MIT. Friction log: 12 entries.

---

## 2. How it scores against the four criteria

**Technical implementation.** The pipeline is the strongest card. Say it in
one breath in the video and the description: *Textract reads the page with
layout and tables → Nova Lite classifies → Textract AnalyzeExpense pulls the
figures → Nova Pro looks at the photo and may veto a money figure → Nova Pro
rewrites into spoken sentences and main points → a currency guard and a
numeric guard drop any line with a number that is not on the page → Polly
reads the whole letter as one story, only when someone presses Listen.*
Then the trust model: 6-digit code plus a 128-bit secret that lives only in
the QR, a public function that cannot call any AI service, per-address and
daily caps, everything deleted after a day. Measured accuracy: 17 key facts
shown on sample photos, 0 wrong.

**Design.** Built for people with age-related sight loss, and it shows:
three looks (dark, light, yellow on black) chosen by reading a real
sentence, every colour pair tested at WCAG 7:1 in Jest, text size up to 2×
that never scrolls the key figures or the pairing code away, a thick focus
ring instead of flipping the line's colours, three buttons on the document
screen, Back on the remote never exits by accident, VoiceView markup done
the Fire TV way (static text linked to the first focusable line, because
the screen reader follows input focus). Recent letters, held on the TV only,
so a page left by mistake is two presses back.

**Potential impact.** The audience is large and under-served on the one
screen they already use. Nearly 20 million American adults have some form of
age-related macular degeneration, 1.5 million of them late-stage (JAMA
Ophthalmology 2022, on CDC surveillance data). RNIB's 2026 Sight Loss Data
Tool puts just over 600,000 people living with AMD in England and over two
million people in the UK living with sight loss. The US is the largest Fire TV
market and where Vega OS launched first, so it is the first market. WHO's
February 2026 fact sheet: at least 2.2 billion people worldwide have a near
or distance vision impairment, most over 50. Paper mail does not stop
arriving: bills, hospital letters, city letters. A relative or caregiver with
a phone is the distribution channel, which is also why the phone page has
one button. Cost per letter is about $0.02–0.03 read on screen, $0.05 with
the voice, which makes a free tier or a charity-funded service realistic.

**Quality of the idea.** It comes from a real need: the author lost the
ability to read a phone or a page to solar retinopathy a few months ago,
and built the thing that would have helped. The TV is the right surface for
this and nobody treats it that way: a large screen the person already owns, two metres away,
with a remote they are not afraid of. The phone is only a camera. The
design decisions that are *not* obvious are the ones to point at: reading
first and voice on request, numbers come from OCR and never from the model,
a letter is data not instructions (scam post targets exactly this audience).

**Bonuses.** Friction log: 12 entries in `FRICTION_LOG.md`, each with
task, steps, expected, actual, severity, workaround and a suggestion. Two
are high severity and were real blockers (path with spaces; public Function
URL 403). Mini challenge: **AWS Builder** (Lambda, API Gateway, S3,
Textract, Bedrock Nova Lite and Pro, Polly). Priority categories to tick:
**computer vision** and **multi-modal UX**.

**Not the Open Source mini challenge, on the rules as written.** That prize
asks for "a new, additional open-source project or contribute to an existing
public repository during the hackathon window, *alongside* a primary track
submission", and the form wants a separate contribution URL. This repository
being MIT is the primary submission, not an additional contribution, so
claiming it would be claiming something the rule does not grant. To enter the
mini challenge properly, publish one of the pieces this build already needed
as its own MIT repository, or open a pull request against a library the
friction log found wanting, and put that URL on the form.

**Newly created in the submission period.** First commit 15 October 2026;
the submission period opened 31 August 2026. Nothing here predates it, so the
"significantly updated" explanation the rules ask for does not apply.

---

## 3. Is anyone building the same thing?

**Method and limits.** The Devpost gallery and the Amazon developer forum
were not reachable from the environment this analysis ran in, so the scan
covered public GitHub repositories and the web for hackathon projects, with
ten searches on the obvious phrasings (Fire TV + letters / mail / bills /
OCR / Textract / large print / read aloud / seniors / low vision / QR photo
upload). **Browse the Devpost gallery yourself before submitting**; most
projects only appear there at the deadline.

**Result: no project found that does what BigPrint TV does.** The closest
Fire TV hackathon projects, and where they stop:

| Project | What it does | Overlap | Where BigPrint differs |
|---|---|---|---|
| Family Hub (ydev0927) | Living-room family dashboard. QR code → phone photographs a school notice or receipt → Nova turns it into calendar entries, to-dos, groceries. | The phone-photo-via-QR mechanism and Nova on AWS | Different job (organising, not reading), no accessibility design, no OCR fidelity layer, no voice, no large-print reading surface. |
| SignalBridge (fetachino) | Accessibility-first prototype that turns on-screen emergency alerts into spoken and visual guidance; large text, read-aloud. | Accessibility framing, large text, read-aloud | Broadcast alerts, not the person's own post. No camera, no OCR, no document pipeline. |
| NarraTV (AtchayamG), Sightline (TusharTechs), described (moiz-lakkadkutta) | Audio description for video that has none, with Nova and Polly. | Same AWS voice stack, accessibility audience | Video, not documents. Nothing is read from paper. |
| Couch Quiz (Riki1200) | Family trivia; the TV is the board, every phone is a buzzer. | Phone as a second screen for the TV | Games, not accessibility or documents. |
| FormVision (Axon-Enjin) | Fitness coaching with a camera, on Fire OS because Vega has no camera API. | Computer vision on Fire TV | Confirms the gap BigPrint fills with the phone-as-camera design. |

**Five lines of differentiation to put in the description and the video,
in this order:**

1. **It reads your letters, on the TV.** Photograph a letter with any phone; it
   appears in very large print on the screen you already own, two metres
   away, and one press reads it aloud.
2. **Every number is guarded.** Figures come from Textract, never from the
   language model; a second reader (Nova Pro, looking at the photo) can veto
   a money figure but never add one; any sentence with a number that is not
   on the page is dropped; low confidence shows a warning. Measured: 17 key
   facts, 0 wrong.
3. **Built for sight loss, not adapted to it.** Three looks tested at WCAG
   7:1, 2× text that never hides the figures, VoiceView-correct markup, a
   focus ring instead of colour flips, three buttons.
4. **Private by construction.** The secret lives only in the QR code, the
   public function cannot call any AI service, everything is deleted after a
   day, logs never contain the text of a letter.
5. **Cheap enough to give away.** About $0.02–0.03 a letter read on screen;
   the voice is made only when someone asks.

If a similar project turns up in the gallery, these five still hold: nobody
found so far combines the reading surface, the fidelity layer and the
accessibility work.

---

## 4. Devpost description (paste-ready)

**Title:** BigPrint TV

**Tagline:** The letter you can't read anymore, in very large print on the
TV you already own. Every number checked. Read aloud when you ask.

**About line:** Built in Pakistan, by someone who needed it, for every
living room with a Fire TV. First market: the United States, where Fire TV
and Vega OS live.

**Inspiration**

A few months ago I damaged my eyes looking at the sun. Solar retinopathy.
The scar is one tiny spot, right in the centre of my vision, which happens
to be exactly where reading lives. My phone turned into a smudge. The post
on the table turned into shapes. A bill, a letter from the clinic, a note
from a friend: I could hold them, I just couldn't read them. I kept
wishing for something very simple, a big reader for text.

Then one evening I looked up, and it was already in the room. The biggest
screen in the house, two metres away, with a remote I could use with my
eyes closed. Millions of people live with sight loss, most of them older,
and their mail never stops arriving. Their television is already there
too. So I built the thing I was wishing for.

**What it does**

The TV shows a QR code. A relative or caregiver scans it with any phone
and gets a page with one button: photograph the letter. That's the phone's
whole job, it is only a camera.

About ten seconds later the letter is on the TV in large print, three
ways: the whole letter in plain English, just the main points, or the
exact words as printed. The figures nobody can afford to get wrong, the
amount due, the pay-by date, the account number, are pinned at the top and
never scroll away. Press Listen and the whole letter is read in a calm,
natural voice. Press Next photo for the next page. Text goes up to twice
the size, and there are three looks, dark, light, and yellow on black,
chosen on first run by reading a real sentence in each, because eyes
disagree about what is easiest, even with the same condition. Letters stay
on the TV for a day, so one closed by mistake is two presses back, and
then everything is deleted. It is someone's private mail.

**How we built it**

React Native 0.83 on Vega OS for the TV app. Behind it, two AWS Lambda
functions and one S3 bucket, nothing running between letters. Amazon
Textract reads the photo with layout and tables, so a bill's rows stay
rows. Amazon Nova Lite classifies the page. Textract's expense model pulls
the money figures, and Nova Pro looks at the photo independently with one
power only: it can veto a figure it disagrees with, never add one. Nova
Pro then rewrites the page into short spoken sentences, and two guards run
last: a currency the page does not print is never spoken, and any sentence
containing a number that is not on the page is dropped. Amazon Polly makes
the voice, only when someone presses Listen, so a letter nobody listens to
costs nothing to voice. The phone page converts iPhone HEIC photos to JPEG
in the browser.

**Challenges we ran into**

The honest list is long, and twelve entries of it are written up in our
friction log. The ones that shaped the product: our first OCR pass turned
a receipt's table into "the amount for diesel is 8", right digits, wrong
row, which is where the layout-aware OCR and the numeric guard were born.
Textract's expense model confidently found a SUBTOTAL and TAX on a
university certificate, so now the pipeline classifies first. A Lambda
Function URL configured exactly as documented refused everyone with a 403;
an API Gateway in front fixed it without a code change. Read-aloud was
silent until the manifest declared audio services the docs don't mention.
And the build broke because our folder name had a space in it.

**Accomplishments that we're proud of**

The thing we are proudest of is what the app refuses to do. Numbers never
come from the language model. A disputed figure is hidden, not shown. On
our sample photographs, every key fact the TV displayed was correct, 17 of
17, and when a page is blurry the TV says "Check: some words were hard to
read" instead of guessing. For a reader who cannot easily check the paper,
a confidently wrong number is worse than no number, so we built the whole
pipeline around that sentence.

We are also proud of the accessibility work: every colour pair tested at
WCAG 7:1 in the test suite, and the non-obvious Fire TV fact that the
screen reader follows input focus, so the pinned key facts had to be
linked to the first focusable line or a blind user would never hear the
amount due, which is the entire point of the app. Scam post targets
exactly this audience, so a letter is treated as data, never as
instructions, and the public endpoint cannot call any AI service at all.
162 app tests and 44 backend tests.

**What we learned**

That reading is the product and the voice is a gift, so the text must
arrive first and the voice should be made on request. That a language
model must never be the source of a number. That older eyes disagree about
polarity even within one eye condition, so the viewer should choose by
reading, not by name. And that a friction log kept from day one is worth
more than memory.

**What's next**

A run on a physical Fire TV with VoiceView, the screen reader, which we
have not done yet and say so plainly. Then distribution through the people
who actually reach this audience: adult children, caregivers, and
sight-loss organizations, such as the American Foundation for the Blind
and Prevent Blindness in the US, and the RNIB and the Macular Society in
the UK. A per-TV allow-list so only a paired phone can send, CloudFront in
front of the API, and a batch mode so a caregiver can photograph a whole
pile of post at once. A letter read on screen costs about two to three
cents, which makes a free or charity-funded service realistic.

**Built with:** react-native, vega-os, fire-tv, aws-lambda, amazon-api-gateway,
amazon-s3, amazon-textract, amazon-bedrock, amazon-nova, amazon-polly,
typescript, python

---

## 5. Demo video: script and shot list (2 min 40 s)

**Rules:** under three minutes; must show the app running on a real Fire TV
or the Vega virtual device. The virtual device cannot take screenshots
(friction log #5), so **screen-record the QEMU window** (on Linux Mint:
SimpleScreenRecorder, OBS, or `ffmpeg -f x11grab`). Record the phone with
its own screen recorder, or film it over the shoulder. Edit to split screen
when phone and TV are both in play. Record the audio from the TV through the
system mixer so the voice is heard clearly. Keep the real pairing code
visible: it proves the round trip is live.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:15 | A real letter on a table, then the TV pairing screen (dark look). | "A few months ago I got solar retinopathy. I couldn't read my phone, and I couldn't read a letter. Millions of people live like that every day. So I built BigPrint TV: the television you already own becomes the reader for your mail." |
| 0:15–0:30 | Phone scans the QR; one-button page; photo taken. Split screen with the TV turning to "Reading your letter". | "A relative or carer scans the code on the TV with any phone. One button: photograph the letter. The phone is only a camera." |
| 0:30–0:55 | The letter appears: kind and sender, the key figures pinned, the full letter in large print. D-pad moves line by line. | "About ten seconds later the letter is on the TV in large print. The amount due, the pay-by date and the account number are pinned at the top, and every one of them came from the OCR, never from a language model. A second reader checks the money against the photo." |
| 0:55–1:15 | Settings: Show → Main points, then Exact words (table rows marked). Text size to 2×; figures stay pinned. | "Three ways to read it: plain English, just the main points, or the exact words as printed. Text goes up to twice the size and the figures never scroll away." |
| 1:15–1:35 | Press Listen. Button becomes Pause. The voice reads; nothing on screen moves. Pause, carry on. | "Press Listen and the whole letter is read in a natural voice, made only when someone asks for it. Pause and carry on when you like." |
| 1:35–1:55 | Colors: Dark → Light → Yellow on black. First-run tile screen if you reset. Focus ring on a line. | "Old eyes disagree about what's easiest to read, even with the same condition, so the viewer chooses by reading a real sentence. Every pair passes WCAG at seven to one." |
| 1:55–2:15 | A blurry photo: the "Check: some words were hard to read" panel. Then a receipt with a table read as sentences. | "When the page is hard to read, it says so instead of guessing. And a bill's table is read as whole rows, not loose numbers." |
| 2:15–2:30 | Next photo, second page waiting. Recent letters list. | "Next photo goes on to the next page. Recent letters stay on the TV for a day, then everything is deleted: these are people's private mail." |
| 2:30–2:40 | Architecture card: phone → API Gateway → Lambda → S3 → Lambda (Textract, Nova, Polly) → TV. Repo URL. | "Two Lambda functions, S3, Textract, Nova and Polly. About three cents a letter. Open source, MIT." |

Have two photos ready: a clean one-page bill with a table, and a deliberately
poor one. Prepare them before recording; the Reading step is ten seconds of
dead air otherwise (cut it to three in the edit, keep the clock honest in the
voice-over).

---

## 6. Product feedback on every tool and SDK used

The form asks for feedback on every tool and SDK. Short versions below; the
long versions with reproduction steps are the numbered entries in
`FRICTION_LOG.md`.

- **Vega SDK 0.24 / Vega CLI 1.4.4.** Generating, building and installing
  work well once the path has no spaces; the build fails on a path with a
  space with an error that names a directory you never typed (#1). The build
  silently appends modules to `manifest.toml` (#9). `vega project doctor`
  flags officially supported libraries as unknown (#4). The manifest
  reference documents `icon` only as the Settings icon, but the home screen
  renders the same 512 x 512 file in a 16:9 tile and crops it, so an icon
  drawn to the documented spec arrives on the home screen with its top and
  bottom cut off, and nothing warns (#11). Suggest: quote the path, print
  one line when autolinking edits the manifest, include system-deployed
  libraries in the managed list, document the icon's 16:9 safe area, and
  either warn in `vpt validate` or accept a separate launcher asset.
- **React Native for Vega 0.83 (`react-native-kepler` 4.0.1).** Solid and
  fast on the virtual device (cold launch under a second for a 2.5 MB
  release build). Accessibility props are Kepler-only imports but the docs
  and template do not say so (#2). Wrapped `Text` needs an explicit
  `lineHeight` or it clips mid-glyph; worth a note in the docs.
- **`react-native-w3cmedia` 2.3.2-rn-83.** Plays an MP3 by URL fine, but
  the README only documents MSE pre-buffering; whether `initialize()` must be
  awaited, and which `AudioContentType` to use for speech, had to be inferred
  from the type definitions (#7). Audio was silent until the manifest declared
  the media and audio services under `[wants]`, including
  `com.amazon.audio.system`, which the setup guide's list does not mention.
- **`react-native-qrcode-svg` 3.0 and `react-native-svg` port.** Work as
  documented; `fast-text-encoding` must be imported before the QR package.
  Importing the SVG package under two names loads two copies and registers
  every view twice.
- **AsyncStorage port.** Works; the Jest setup needs the bundled mock and the
  Vega page does not mention it (#6).
- **Vega virtual device.** Reliable for the round trip and D-pad. No
  screenshots or frame capture, and `vega device info` returns empty fields
  (#5), so visual checks are by eye and demo capture is a screen recorder.
- **Metro / React Native DevTools on RN 0.83.** `console.log` only appears
  in DevTools; `POST /open-debugger` returns 200 and opens nothing (#3).
- **A11Y Compass documentation.** The guidance is right and the audit found
  real bugs. The one rule that changed the design, "the screen reader follows
  input focus, so static text is never spoken", deserves a headline.
- **Amazon Textract.** AnalyzeDocument with LAYOUT and TABLES is what makes
  bills readable; DetectDocumentText alone flattens tables. AnalyzeExpense
  force-fits non-financial pages into receipt shape, so classify first.
  HEIC is rejected outright, which matters because iPhones default to it.
- **Amazon Bedrock, Nova Lite and Nova Pro.** Fast and cheap; Nova Pro's
  image reading was wrong every time it disagreed with Textract on dates and
  references, right often enough on money to be worth a veto. A new account
  was blocked for hours by account verification that presented as a quota
  error with every quota at zero.
- **Amazon Polly (neural, Joanna, US English).** Clear and unhurried for this audience;
  the 3,000-character limit is handled by splitting between sentences.
- **AWS Lambda and API Gateway.** A public Function URL configured exactly
  as documented answered 403 to everyone and nothing in the account could
  explain why (#10); an HTTP API in front of the function worked with no
  code change. New accounts cannot reserve concurrency.
- **Amazon S3.** Conditional writes make counters and one-time claims
  trivial. `GetObject` without `ListBucket` answers AccessDenied for a key
  that does not exist, which reads exactly like a policy mistake (#8).
- **IAM.** Inline policies on a user share a 2,048-byte limit; put role
  policies on the roles.

**The two questions the form asks that the list above does not answer.**

*Onboarding, zero to hello world.* Vega: about an hour, and most of it was
the two blockers — a project path containing a space broke the build with an
error naming a directory we never typed (#1), and accessibility props turned
out to be Kepler-only imports that neither the docs nor the template mention
(#2). Once past those, generate → build → install → run on the virtual device
was quick and stayed quick. AWS: Lambda, S3 and Textract were same-afternoon;
Bedrock was not, because a new account sat behind a verification step that
presented as a quota error with every quota reading zero, with nothing saying
to wait.

*Would you build with these devices and services again? **Yes.*** React
Native on Vega is a genuinely fast way to reach a television — a 2.5 MB
release build cold-launches in under a second — and the accessibility
guidance was right where it mattered, including the one rule that changed
the design (the screen reader follows input focus). On the AWS side,
layout-aware Textract plus Nova plus on-request Polly is the whole product
for about three cents a letter, which is what makes a free or charity-funded
service plausible. The caveats are documentation, not capability, and all
twelve are written up in `FRICTION_LOG.md`.

---

## 7. Known gaps, stated plainly

Say these in the description's "What's next" rather than let a judge find
them.

- **No physical Fire TV run yet, and VoiceView has not been heard.** The
  markup is correct by construction and by test, not by ear. If a physical
  stick is reachable before Thursday, one session with VoiceView on is the
  single most valuable hour left.
- **Pairing-screen instructions can overflow** at some logical viewports and
  the larger text sizes (open bug, `CONTEXT.md` §3). Check at 1×, 1.5× and 2×
  on the virtual device before recording.
- **The rewrite sometimes adds "More items are listed."** when nothing was
  omitted (seen in one of two runs today). Optional one-line prompt fix in
  `backend/pipeline.py`, `rewrite_prompt`: change "If a table is long, give
  the first few rows and then say that more items are listed, without
  inventing a count." to "If a table has more than six rows, give the first
  six and then say that more items are listed, without a count. Never say
  more items are listed when every row has been given." Redeploy with
  `python aws/deploy.py`, then run `backend/tools/round_trip.sh` twice. Skip
  it if time is short; the guard keeps it from ever carrying a wrong number.
- **The icon key** in `manifest.toml` follows the Vega manifest reference
  (`icon = "@image/icon.png"`, file under `assets/image/`) but has not been
  through `vega exec vpt validate manifest.toml` or a build here. Step 2 in
  §8 does that; if validation rejects the key, remove the one line and keep
  the file.
- **iPhone HEIC path** is reasoned (Safari decodes HEIC into a canvas), not
  tapped on a real iPhone.
- **The Devpost gallery was not scanned** from this environment (§3).

---

## 8. Pre-submission checklist, in order

1. **`main` is the code.** Everything is merged; the old stacked branches and
   PRs are closed. Work from `main` only.
2. **Build with the icon.** On the development machine:
   `git checkout main && git pull && npm ci`, then
   `vega exec vpt validate manifest.toml`, `npm run build:release`, install
   on the virtual device, and check Settings → Applications shows the icon.
3. **Run every check:** `npm test`, `npm run lint`, `npx tsc --noEmit`,
   `npm run test:backend`, `backend/tools/round_trip.sh`.
4. **One real run** on the virtual device with a real phone photo, at 1× and
   2× text, in all three looks; a physical Fire TV with VoiceView if one is
   reachable.
5. **Record the video** (§5), upload unlisted (YouTube or Vimeo), test the
   link in a private window.
6. **Devpost form:** title and tagline (§4); description (§4); repository
   `https://github.com/rukhsarai/bigprint-tv` (public, MIT, run instructions
   in the README); video link; three to five images taken from the recording
   (pairing screen, letter with pinned figures, Settings with the three
   looks, phone page, architecture card); built-with tags (§4); product
   feedback (§6); friction log (`FRICTION_LOG.md`, link it); mini
   challenges: AWS Builder and Open Source; categories: computer vision,
   multi-modal UX.
7. **After submitting:** leave the backend deployed and the `$20` budget
   alarm on through 20 November; the daily cap is 200 documents. Do not
   rotate the session secret scheme or the API endpoint until judging ends.
   Browse the Devpost gallery once more for look-alikes and, if one appears,
   add one sentence from §3 to the description.

Idle cost through judging is a few cents of S3. Each judge who tries the
flow costs about $0.03–0.06.
