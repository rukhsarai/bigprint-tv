import {type ScannedDocument, sampleReceipt} from '../data/documents';

/**
 * How the TV learns that a photo has arrived and been read.
 *
 * Subscription rather than a one-shot promise, because the real transport is
 * push: the phone uploads, the backend runs Textract and Nova, then notifies
 * this screen. Swapping the mock for an API Gateway WebSocket (or polling)
 * means writing another implementation of this type — nothing else changes.
 */
export type Unsubscribe = () => void;

export type DocumentListener = {
  onDocument: (document: ScannedDocument) => void;
  onError: (message: string) => void;
};

export type DocumentService = {
  /** Watch for a document sent to this pairing code. */
  subscribe: (pairingCode: string, listener: DocumentListener) => Unsubscribe;
};

/** How long the mock waits before delivering, in milliseconds. */
const MOCK_DELAY_MS = 6000;

/**
 * Stands in for the backend until AWS exists. Delivers a sample document a few
 * seconds after the screen appears, so the real waiting flow can be built,
 * demonstrated and tested without a network.
 */
export const createMockDocumentService = (
  document: ScannedDocument = sampleReceipt,
  delayMs: number = MOCK_DELAY_MS,
): DocumentService => ({
  subscribe: (_pairingCode, listener) => {
    const timer = setTimeout(() => listener.onDocument(document), delayMs);
    return () => clearTimeout(timer);
  },
});

/** A service that only ever fails, for exercising the error path. */
export const createFailingDocumentService = (
  message = 'We could not read that photo. Please try again.',
  delayMs = 500,
): DocumentService => ({
  subscribe: (_pairingCode, listener) => {
    const timer = setTimeout(() => listener.onError(message), delayMs);
    return () => clearTimeout(timer);
  },
});
