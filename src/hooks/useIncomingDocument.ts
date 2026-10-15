import {useCallback, useEffect, useState} from 'react';

import type {ScannedDocument} from '../data/documents';
import type {DocumentService} from '../services/documentService';

export type IncomingStatus = 'waiting' | 'arrived' | 'error';

export type IncomingDocument = {
  status: IncomingStatus;
  document: ScannedDocument | null;
  error: string | null;
  /** Go back to waiting — used after reading one document, or after a failure. */
  reset: () => void;
};

/**
 * Waits for a document to arrive for this pairing code.
 *
 * The subscription is torn down on unmount and whenever the code changes, so a
 * late delivery can never push a document onto a screen the user has left.
 */
export const useIncomingDocument = (
  service: DocumentService,
  pairingCode: string,
): IncomingDocument => {
  const [status, setStatus] = useState<IncomingStatus>('waiting');
  const [document, setDocument] = useState<ScannedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    const unsubscribe = service.subscribe(pairingCode, {
      onDocument: (incoming) => {
        if (!active) {
          return;
        }
        setDocument(incoming);
        setError(null);
        setStatus('arrived');
      },
      onError: (message) => {
        if (!active) {
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
  }, [service, pairingCode, attempt]);

  const reset = useCallback(() => {
    setDocument(null);
    setError(null);
    setStatus('waiting');
    // Bumping the attempt re-runs the effect, re-subscribing for the next one.
    setAttempt((n) => n + 1);
  }, []);

  return {status, document, error, reset};
};
