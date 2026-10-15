import React, {useMemo} from 'react';

import {PairingScreen} from './screens/PairingScreen';
import {DocumentView} from './screens/DocumentView';
import {useIncomingDocument} from './hooks/useIncomingDocument';
import {
  createMockDocumentService,
  createRemoteDocumentService,
  type DocumentService,
} from './services/documentService';
import type {AudioPlayer} from './services/audioPlayer';
import {createVegaAudioPlayer} from './services/vegaAudio';
import {CAPTURE_BASE_URL} from './config';

type Props = {
  /** Injected in tests. Defaults to the real backend, or the mock when no URL is configured. */
  service?: DocumentService;
  /** Injected in tests. Defaults to the platform audio player; null means silent highlighting. */
  player?: AudioPlayer | null;
};

export const App = ({service, player}: Props) => {
  // Built once: a new service object each render would resubscribe endlessly.
  const documentService = useMemo(
    () =>
      service ??
      (CAPTURE_BASE_URL
        ? createRemoteDocumentService(CAPTURE_BASE_URL)
        : createMockDocumentService()),
    [service],
  );
  const audioPlayer = useMemo(
    () => (player === undefined ? createVegaAudioPlayer() : player),
    [player],
  );

  const {status, session, document, error, reset} =
    useIncomingDocument(documentService);

  if (status === 'arrived' && document) {
    return (
      <DocumentView
        document={document}
        player={audioPlayer}
        audioUrl={(lineIndex) => documentService.audioUrl(document, lineIndex)}
        onBack={reset}
      />
    );
  }

  return <PairingScreen status={status} session={session} error={error} />;
};
