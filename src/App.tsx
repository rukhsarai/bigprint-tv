import React, {useMemo, useState} from 'react';

import {PairingScreen} from './screens/PairingScreen';
import {DocumentView} from './screens/DocumentView';
import {useIncomingDocument} from './hooks/useIncomingDocument';
import {
  createMockDocumentService,
  type DocumentService,
} from './services/documentService';

const makePairingCode = (): string =>
  String(Math.floor(1000 + Math.random() * 9000));

type Props = {
  /** Injected in tests, and swapped for the real API client later. */
  service?: DocumentService;
};

export const App = ({service}: Props) => {
  const [pairingCode] = useState<string>(makePairingCode);
  // Built once: a new service object each render would resubscribe endlessly.
  const documentService = useMemo(
    () => service ?? createMockDocumentService(),
    [service],
  );

  const {status, document, error, reset} = useIncomingDocument(
    documentService,
    pairingCode,
  );

  if (status === 'arrived' && document) {
    return <DocumentView document={document} onBack={reset} />;
  }

  return <PairingScreen pairingCode={pairingCode} error={error} />;
};
