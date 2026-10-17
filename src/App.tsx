import React, {useMemo} from 'react';
import {View} from '@amazon-devices/react-native-kepler';

import {PairingScreen} from './screens/PairingScreen';
import {DocumentView} from './screens/DocumentView';
import {FirstRunColours} from './screens/FirstRunColours';
import {useIncomingDocument} from './hooks/useIncomingDocument';
import {
  createMockDocumentService,
  createRemoteDocumentService,
  type DocumentService,
} from './services/documentService';
import type {AudioPlayer} from './services/audioPlayer';
import {createVegaAudioPlayer} from './services/vegaAudio';
import {CAPTURE_BASE_URL} from './config';
import {ColoursProvider, useColours} from './theme/ColoursProvider';
import {layout} from './theme/styles';

type Props = {
  /** Injected in tests. Defaults to the real backend, or the mock when no URL is configured. */
  service?: DocumentService;
  /** Injected in tests. Defaults to the platform audio player; null means no voice. */
  player?: AudioPlayer | null;
};

export const App = (props: Props) => (
  <ColoursProvider>
    <Screens {...props} />
  </ColoursProvider>
);

const Screens = ({service, player}: Props) => {
  const {restored, chosen, colours} = useColours();

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

  // Starts pairing straight away, even during the first-run choice, so the
  // code is ready by the time the viewer has picked a look.
  const {status, session, document, error, nextReady, reset} =
    useIncomingDocument(documentService);

  if (!restored) {
    // A blank screen in the default look for the moment it takes to read
    // the saved choice, rather than a flash of the wrong colours.
    return (
      <View style={[layout.fill, {backgroundColor: colours.background}]} />
    );
  }

  if (!chosen) {
    return <FirstRunColours />;
  }

  if (status === 'arrived' && document) {
    return (
      // Keyed by letter, so the next photo starts with its voice stopped.
      <DocumentView
        key={document.id}
        document={document}
        player={audioPlayer}
        service={documentService}
        nextReady={nextReady}
        onNext={reset}
      />
    );
  }

  return <PairingScreen status={status} session={session} error={error} />;
};
