import {type ScannedDocument, sampleReceipt} from '../data/documents';
import {POLL_INTERVAL_MS} from '../config';

/**
 * How the TV learns that a photo has arrived and been read.
 *
 * The service owns the pairing session: it asks the backend for a code and a
 * secret, tells the screen what to put in the QR code, and then listens for a
 * document. The mock implements the same contract without a network, so the
 * whole app can be built, demonstrated and tested offline.
 */
export type Unsubscribe = () => void;

export type PairingSession = {
  /** Six digits shown on the TV and echoed on the phone, so people know they match. */
  code: string;
  /** Full URL for the QR code. Carries the secret; never shown as text. */
  captureUrl: string;
  /** Unix seconds. The service renews the session itself before this. */
  expiresAt: number;
};

export type DocumentListener = {
  /** A pairing code is ready (or has been renewed). */
  onSession: (session: PairingSession) => void;
  /** A photo has arrived and is being read. */
  onProcessing: () => void;
  onDocument: (document: ScannedDocument) => void;
  onError: (message: string) => void;
};

export type DocumentService = {
  subscribe: (listener: DocumentListener) => Unsubscribe;
  /** Where to fetch the audio for one line, or null when there is no audio. */
  audioUrl: (document: ScannedDocument, lineIndex: number) => string | null;
};

// ---------------------------------------------------------------------------
// Mock

/** How long the mock waits before delivering, in milliseconds. */
const MOCK_DELAY_MS = 6000;

/**
 * Stands in for the backend. Delivers a sample document a few seconds after
 * the screen appears, so the real waiting flow can be exercised without AWS.
 */
export const createMockDocumentService = (
  document: ScannedDocument = sampleReceipt,
  delayMs: number = MOCK_DELAY_MS,
): DocumentService => ({
  subscribe: (listener) => {
    listener.onSession({
      code: '482134',
      captureUrl: 'https://example.invalid/?c=482134&k=mock',
      expiresAt: Math.floor(Date.now() / 1000) + 7200,
    });
    const processing = setTimeout(
      () => listener.onProcessing(),
      Math.max(0, delayMs - 2000),
    );
    const arrival = setTimeout(() => listener.onDocument(document), delayMs);
    return () => {
      clearTimeout(processing);
      clearTimeout(arrival);
    };
  },
  audioUrl: () => null,
});

/** A service that only ever fails, for exercising the error path. */
export const createFailingDocumentService = (
  message = 'We could not read that photo. Please try again.',
  delayMs = 500,
): DocumentService => ({
  subscribe: (listener) => {
    listener.onSession({
      code: '482134',
      captureUrl: 'https://example.invalid/?c=482134&k=mock',
      expiresAt: Math.floor(Date.now() / 1000) + 7200,
    });
    const timer = setTimeout(() => listener.onError(message), delayMs);
    return () => clearTimeout(timer);
  },
  audioUrl: () => null,
});

// ---------------------------------------------------------------------------
// Real backend

type SessionResponse = {
  ok: boolean;
  code: string;
  secret: string;
  expiresAt: number;
  message?: string;
};

type ResultResponse = {
  ok: boolean;
  state: 'idle' | 'processing' | 'done' | 'error';
  message?: string | null;
  document?: ScannedDocument | null;
  expiresAt?: number;
};

const NO_NETWORK =
  'The TV cannot reach the internet. Please check the connection.';
/** The backend answered, but refused us: a setup problem, not a network one. */
const refused = (status: number) =>
  `The reading service refused this TV (error ${status}). Please tell the person who set it up.`;

class RefusedError extends Error {
  constructor(readonly status: number) {
    super(`refused ${status}`);
  }
}

/** Renew this long before the backend would expire the session, in seconds. */
const RENEW_MARGIN_SECONDS = 10 * 60;

/** The backend gives up after two minutes; the TV should not wait much longer. */
export const PROCESSING_TIMEOUT_MS = 150 * 1000;
const TOOK_TOO_LONG =
  'That took too long. Please take the photo again.';

/**
 * Talks to the capture Lambda. One session per subscription; polls for a
 * result every POLL_INTERVAL_MS; renews the session before it expires.
 */
export const createRemoteDocumentService = (
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  pollIntervalMs: number = POLL_INTERVAL_MS,
): DocumentService => {
  const base = baseUrl.replace(/\/+$/, '');
  // The live session, and the session each document arrived under: audio for
  // a page already on screen must keep working after the session is renewed.
  let current: {code: string; secret: string; expiresAt: number} | null = null;
  const credentialsFor = new Map<string, {code: string; secret: string}>();

  const audioUrl = (document: ScannedDocument, lineIndex: number) => {
    const creds = credentialsFor.get(document.id) ?? current;
    if (!creds || !document.speech || !document.speech[lineIndex]) {
      return null;
    }
    const q = `c=${creds.code}&k=${encodeURIComponent(creds.secret)}`;
    return `${base}/audio?${q}&d=${encodeURIComponent(document.id)}&n=${lineIndex}`;
  };

  return {
    audioUrl,
    subscribe: (listener) => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let lastDocumentId = '';
      let lastState: ResultResponse['state'] = 'idle';
      let processingSince: number | null = null;

      const schedule = (fn: () => void, ms: number) => {
        if (!active) {
          return;
        }
        timer = setTimeout(fn, ms);
      };

      const startSession = async () => {
        try {
          const res = await fetchImpl(`${base}/session`, {method: 'POST'});
          if (res.status === 401 || res.status === 403) {
            throw new RefusedError(res.status);
          }
          const body = (await res.json()) as SessionResponse;
          if (!res.ok || !body.ok) {
            throw new Error(body.message || 'session');
          }
          if (!active) {
            return;
          }
          current = {
            code: body.code,
            secret: body.secret,
            expiresAt: body.expiresAt,
          };
          listener.onSession({
            code: body.code,
            captureUrl: `${base}/?c=${body.code}&k=${encodeURIComponent(body.secret)}`,
            expiresAt: body.expiresAt,
          });
          schedule(poll, pollIntervalMs);
        } catch (e) {
          if (!active) {
            return;
          }
          listener.onError(e instanceof RefusedError ? refused(e.status) : NO_NETWORK);
          // Keep trying quietly; the error clears when a session arrives.
          schedule(startSession, 10000);
        }
      };

      const poll = async () => {
        if (!active || !current) {
          return;
        }
        const nowSeconds = Date.now() / 1000;
        if (current.expiresAt - nowSeconds < RENEW_MARGIN_SECONDS) {
          current = null;
          startSession();
          return;
        }
        try {
          const q = `c=${current.code}&k=${encodeURIComponent(current.secret)}&since=${encodeURIComponent(lastDocumentId)}`;
          const res = await fetchImpl(`${base}/result?${q}`);
          if (res.status === 404 || res.status === 410) {
            // The backend forgot us (expiry, redeploy). Start again.
            current = null;
            startSession();
            return;
          }
          const body = (await res.json()) as ResultResponse;
          if (!res.ok || !body.ok) {
            throw new Error(body.message || 'result');
          }
          if (!active) {
            return;
          }
          if (body.document && body.document.id !== lastDocumentId) {
            lastDocumentId = body.document.id;
            if (current) {
              credentialsFor.set(body.document.id, {
                code: current.code,
                secret: current.secret,
              });
            }
            processingSince = null;
            listener.onDocument(body.document);
          } else if (body.state === 'processing') {
            if (lastState !== 'processing') {
              processingSince = Date.now();
              listener.onProcessing();
            } else if (
              processingSince !== null &&
              Date.now() - processingSince > PROCESSING_TIMEOUT_MS
            ) {
              // The backend never answered (a timeout upstream). Say so once.
              processingSince = null;
              listener.onError(TOOK_TOO_LONG);
            }
          } else if (body.state === 'error' && lastState !== 'error') {
            processingSince = null;
            listener.onError(
              body.message || 'We could not read that photo. Please try again.',
            );
          }
          lastState = body.state;
        } catch {
          // A single failed poll is not worth alarming anyone; keep going.
        }
        schedule(poll, pollIntervalMs);
      };

      startSession();
      return () => {
        active = false;
        if (timer !== null) {
          clearTimeout(timer);
        }
      };
    },
  };
};
