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
  /** True when the next photo has already been read, so Next photo shows it. */
  nextReady: boolean;
  /** Go on to the next photo — shown at once if it is already here. */
  reset: () => void;
};

type Held =
  | {kind: 'document'; document: ScannedDocument}
  | {kind: 'processing'}
  | {kind: 'error'; message: string}
  | null;

/**
 * Waits for a document to arrive for this TV.
 *
 * The subscription is torn down on unmount, so a late delivery can never push
 * a document onto a screen the user has left. Anything that happens while a
 * document is being read — a second page, a failed photo, "reading…" — is
 * held back and shown when the reader presses Next photo (or Back), so the page never changes
 * under them and nothing is silently lost.
 */
export const useIncomingDocument = (
  service: DocumentService,
): IncomingDocument => {
  const [status, setStatus] = useState<IncomingStatus>('connecting');
  const [session, setSession] = useState<PairingSession | null>(null);
  const [document, setDocument] = useState<ScannedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextReady, setNextReady] = useState(false);
  const reading = useRef(false);
  const held = useRef<Held>(null);

  useEffect(() => {
    let active = true;

    const unsubscribe = service.subscribe({
      onSession: (incoming) => {
        if (!active) {
          return;
        }
        setSession(incoming);
        if (!reading.current) {
          setError(null);
          setStatus((current) =>
            current === 'connecting' || current === 'error'
              ? 'waiting'
              : current,
          );
        }
      },
      onProcessing: () => {
        if (!active) {
          return;
        }
        if (reading.current) {
          // A document already held wins over a mere "in progress".
          if (held.current?.kind !== 'document') {
            held.current = {kind: 'processing'};
          }
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
          held.current = {kind: 'document', document: incoming};
          setNextReady(true);
          return;
        }
        reading.current = true;
        setDocument(incoming);
        setError(null);
        setStatus('arrived');
      },
      onError: (message) => {
        if (!active) {
          return;
        }
        if (reading.current) {
          if (held.current?.kind !== 'document') {
            held.current = {kind: 'error', message};
          }
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
    const next = held.current;
    held.current = null;
    setNextReady(false);
    setError(null);
    if (next?.kind === 'document') {
      reading.current = true;
      setDocument(next.document);
      setStatus('arrived');
      return;
    }
    setDocument(null);
    if (next?.kind === 'processing') {
      setStatus('processing');
    } else if (next?.kind === 'error') {
      setError(next.message);
      setStatus('error');
    } else {
      setStatus((current) => (current === 'arrived' ? 'waiting' : current));
    }
  }, []);

  return {status, session, document, error, nextReady, reset};
};
