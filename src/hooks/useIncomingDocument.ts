import {useCallback, useEffect, useRef, useState} from 'react';

import type {ScannedDocument} from '../data/documents';
import type {
  DocumentService,
  PairingSession,
} from '../services/documentService';

export type IncomingStatus =
  | 'connecting'
  | 'waiting'
  | 'processing'
  | 'arrived'
  | 'error';

export type IncomingDocument = {
  status: IncomingStatus;
  session: PairingSession | null;
  document: ScannedDocument | null;
  error: string | null;
  /** Go back to waiting — used after reading one document, or after a failure. */
  reset: () => void;
};

/**
 * Waits for a document to arrive for this TV.
 *
 * The subscription is torn down on unmount, so a late delivery can never push
 * a document onto a screen the user has left. A document that arrives while
 * one is already being read is held back until the reader presses Back, so the
 * page never changes under them.
 */
export const useIncomingDocument = (
  service: DocumentService,
): IncomingDocument => {
  const [status, setStatus] = useState<IncomingStatus>('connecting');
  const [session, setSession] = useState<PairingSession | null>(null);
  const [document, setDocument] = useState<ScannedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reading = useRef(false);
  const held = useRef<ScannedDocument | null>(null);

  useEffect(() => {
    let active = true;

    const unsubscribe = service.subscribe({
      onSession: (incoming) => {
        if (!active) {
          return;
        }
        setSession(incoming);
        setError(null);
        if (!reading.current) {
          setStatus('waiting');
        }
      },
      onProcessing: () => {
        if (!active || reading.current) {
          return;
        }
        setError(null);
        setStatus('processing');
      },
      onDocument: (incoming) => {
        if (!active) {
          return;
        }
        if (reading.current) {
          held.current = incoming;
          return;
        }
        reading.current = true;
        setDocument(incoming);
        setError(null);
        setStatus('arrived');
      },
      onError: (message) => {
        if (!active || reading.current) {
          return;
        }
        setError(message);
        setStatus('error');
      },
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  const reset = useCallback(() => {
    reading.current = false;
    setError(null);
    if (held.current) {
      const next = held.current;
      held.current = null;
      reading.current = true;
      setDocument(next);
      setStatus('arrived');
      return;
    }
    setDocument(null);
    setStatus((current) => (current === 'arrived' ? 'waiting' : current));
  }, []);

  return {status, session, document, error, reset};
};
