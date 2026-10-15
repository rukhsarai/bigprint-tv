/**
 * Where the TV talks to the backend.
 *
 * This is the public URL of the capture Lambda (see aws/deploy.py). It is not a
 * secret: anyone can load the page, but nothing can be read or sent without a
 * pairing code and the secret that only ever lives inside the QR code.
 *
 * Leave it empty to run the app against the built-in mock, which delivers a
 * sample document after a few seconds and makes no network calls.
 */
export const CAPTURE_BASE_URL = '';

/** How often the TV asks whether a photo has been read, in milliseconds. */
export const POLL_INTERVAL_MS = 3000;
