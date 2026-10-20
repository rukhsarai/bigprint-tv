# BigPrint TV — demo video script (2 min 55 s, on camera)

You on camera for about 45 seconds in total, the app for about two minutes.
Spoken at a calm pace this is about 390 words, which fits inside three
minutes with room for the pauses. Judges are not required to watch past
three minutes, so the letter must be on the TV before the one-minute mark.

Two shot types:
- **FACE**: you, at a table, phone camera at eye level, window light on your
  face, a plain wall behind. Look at the lens, not the screen.
- **TV**: screen recording of the Vega virtual device (ffmpeg or
  SimpleScreenRecorder on the QEMU window, with system audio so the voice is
  heard). If you can plug the laptop into a real television over HDMI, film
  that television from the sofa for shots 1 and 5: it looks like the product.

---

## Shot list

| # | Time | Shot | What you say (voice-over or to camera) |
|---|---|---|---|
| 1 | 0:00–0:05 | TV. A letter in huge print, the voice reading one sentence. No title yet. | *(the TV's own voice, nothing else)* |
| 2 | 0:05–0:30 | FACE. You hold up the OCT scan printout, personal details covered (see below). Point at the centre of the scan on "right in the centre". | "Hi, I'm Rukhsar. A few months ago I got solar retinopathy. This is my OCT scan, a picture of the back of my eye. The damage is one tiny spot, right in the centre, exactly where you read. For weeks I couldn't read a message on my phone, and I couldn't read the letters that kept arriving. I kept wishing for a big reader for text. Then I looked up. The biggest screen in my house was already in the room, and I knew how to use its remote." |
| 3 | 0:30–0:38 | FACE, then cut to the TV pairing screen. | "So I built BigPrint TV. Your Fire TV becomes the reader for your mail. Here is how it works." |
| 4 | 0:38–0:55 | Split screen: phone scans the QR on the TV, one-button page, photo of the letter. TV switches to "Reading your letter". | "Anyone with a phone, a relative, a carer, scans the code on the TV. One button: photograph the letter. The phone is only a camera. Nothing to install." |
| 5 | 0:55–1:20 | TV. The letter appears: kind and sender at the top, the key figures pinned, the full letter in large print. D-pad moves the focus ring line by line. | "About ten seconds later the letter is on the TV in large print. The amount due, the date and the account number are pinned at the top and never scroll away. Every one of those figures came from the OCR, never from a language model, and a second reader checks the money against the photo." |
| 6 | 1:20–1:38 | TV. Press Listen. The button becomes Pause. The voice reads; nothing on screen moves. Pause, then Keep listening. | "If reading is still too much, press Listen. The whole letter is read in a natural voice, made only when someone asks for it. Pause and keep listening when you like." |
| 7 | 1:38–2:00 | TV. Settings: Show → Main points, then Exact words. Text size up to 2×; the figures stay pinned. Colors: Dark → Light → Yellow on black. | "Three ways to read it: plain English, just the main points, or the exact words as printed. Text up to twice the size. And three looks, chosen by reading a real sentence, because eyes disagree about what is easiest, even with the same condition." |
| 8 | 2:00–2:15 | TV. A blurry photo: the "Check: some words were hard to read" panel. | "When a page is hard to read, it says so instead of guessing. For a reader who cannot check the paper, a confident wrong number is worse than no number." |
| 9 | 2:15–2:33 | TV. "Next photo is ready": the salicylic acid carton appears, kind at the top, Main points view (use, warning, 2%). Then Recent letters list, Delete all. | "Next photo goes on to the next page, or to anything else with small print: the directions on a bottle. Recent letters stay on the TV for a day, then everything is deleted. These are people's private mail." |
| 10 | 2:33–2:55 | FACE, then an architecture card over the last line: phone → API Gateway → Lambda → S3 → Lambda (Textract, Nova, Polly) → TV. Repo URL. | "I built this for me. But millions of people live with sight loss, most of them older, and their post keeps arriving. It runs on two Lambda functions, Textract, Nova and Polly, for about three cents a letter. It is open source. BigPrint TV: the television you already own, reading your mail." |

---

## Before you film

**Your OCT scan.** It will be on public YouTube. The scan images themselves
are fine to show and are the strongest thing in the video: a picture of
the eye with a mark in the centre needs no explanation. Cover the header
with paper tape or sticky notes first: name, date of birth, patient number,
clinic name, and the scanner maker's logo (Zeiss, Heidelberg and the like
are third-party trademarks, which the rules forbid). Keep the camera far
enough that the small print is not legible. Hold it still for two seconds
so the editor can cut to a close-up.

**The letter the TV reads.** The scan is pictures, so it is not the thing
the TV reads. Best choice: a real letter from the eye clinic (an
appointment letter or the report's cover letter) with your name, address
and patient number taped over before you photograph it, so the story
closes: the letter you could not read, read by your TV. The OCR reads
whatever is visible and puts it on screen, so tape first, photograph
second. If no such letter exists or it has little text, use the synthetic
bill from `backend/tools/make_sample_letter.py`, changed to a US style
first (dollar figures, US dates). Never a real utility or bank letter:
their logo is a third-party trademark.

**Three photos ready before recording:** the clean letter, a deliberately
blurry one for shot 8, and the product carton for shot 9. For the carton:
photograph the flat directions panel of the box, not the curved bottle;
tape over every brand mention on that panel first, including the company
line (a third-party trademark, and the OCR would show it on the TV as the
sender); the print is about six point in English and French, so fill the
frame with the panel from 10–15 cm, tap to focus, daylight, no glare; run
it through `backend/tools/round_trip.sh` once and retake if the Check
panel appears; show the Main points view, since the ingredient list runs
long in Exact words. Keep the front of the box and the bottle out of shot. Prepare them so the "Reading your letter" wait is not dead air;
cut it to three seconds in the edit and keep "about ten seconds" in the
voice-over, which is honest.

**The app, from `main`:** pull `main`, remove the debug line from the
pairing screen, set the text size to 2× for the document shots, and check
the pairing screen does not clip at the size you record it at. Keep the real
pairing code visible: it proves the round trip is live. Keep the QEMU title
bar in one shot so the "running on the simulator" rule is provable.

**Sound.** The TV voice from the system mixer, your voice from the phone or
a lapel mic, no music. Add captions (YouTube auto-captions, corrected): an
accessibility product with an uncaptioned video is a bad look.

**Camera.** Phone horizontal, 1080p, 30 fps, locked focus and exposure.
Read each FACE line two or three times and keep the best take. Say the
lines, do not recite them: the story is yours.

---

## Edit order

1. Cut the FACE takes to the words above; trim every pause longer than a second.
2. Lay the TV recording under shots 4–9; speed nothing up except the
   reading wait.
3. Picture-in-picture for shot 4: TV large, phone small in a corner.
4. Title card at 0:05 for two seconds: "BigPrint TV", then the face.
5. Architecture card and repo URL at 2:40: `github.com/rukhsarai/bigprint-tv`.
6. Export 1080p, upload unlisted or public on YouTube, test the link in a
   private window, then paste it into the Devpost form.
