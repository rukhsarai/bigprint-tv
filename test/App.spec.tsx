import 'react-native';
import {render, screen, waitFor} from '@testing-library/react-native';
import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {App} from '../src/App';
import {
  createMockDocumentService,
  createFailingDocumentService,
  type DocumentListener,
} from '../src/services/documentService';
import {sampleLetter} from '../src/data/documents';

/** Waits for the saved-text-size lookup to finish so React state is settled. */
const settled = () =>
  waitFor(() => expect(screen.getByText(/Text size/)).toBeTruthy());

/** A service that issues a code but never delivers, so the app stays on the pairing screen. */
const neverDelivers = {
  subscribe: (listener: DocumentListener) => {
    listener.onSession({
      code: '482134',
      captureUrl: 'https://example.invalid/?c=482134&k=test',
      expiresAt: 9999999999,
    });
    return () => {};
  },
  audioUrl: () => null,
};

describe('App', () => {
  let randomSpy: jest.SpyInstance;

  beforeEach(async () => {
    await AsyncStorage.clear();
    // The QR library and some RN internals use randomness; pin it so the
    // snapshot captures layout, not luck.
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('matches snapshot', async () => {
    const view = render(<App service={neverDelivers} />);
    await settled();
    expect(view).toMatchSnapshot();
  });

  it('shows the pairing instructions while waiting', async () => {
    render(<App service={neverDelivers} />);
    await settled();
    expect(screen.getByText('Read anything on your TV')).toBeTruthy();
    expect(
      screen.getByText(
        '2. Tap the link that pops up, then photograph the letter',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('pairing-waiting')).toBeTruthy();
  });

  it('shows the six digit pairing code in two groups', async () => {
    render(<App service={neverDelivers} />);
    await settled();
    expect(screen.getByText('482 134')).toBeTruthy();
    expect(screen.getByText('The phone will show this code')).toBeTruthy();
  });

  it('shows a placeholder until the backend issues a code', async () => {
    render(<App service={{subscribe: () => () => {}, audioUrl: () => null}} />);
    await settled();
    expect(screen.getByTestId('qr-placeholder')).toBeTruthy();
    expect(screen.getByTestId('pairing-connecting')).toBeTruthy();
  });

  it('offers both text size controls', async () => {
    render(<App service={neverDelivers} />);
    await settled();
    expect(screen.getByTestId('size-button-Bigger text')).toBeTruthy();
    expect(screen.getByTestId('size-button-Smaller text')).toBeTruthy();
  });

  it('switches to the document when one arrives', async () => {
    render(
      <App
        service={createMockDocumentService(sampleLetter, 10)}
        player={null}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(sampleLetter.kind)).toBeTruthy(),
    );
    // The pairing screen is gone once the document is on screen.
    expect(screen.queryByTestId('pairing-waiting')).toBeNull();
  });

  it('tells the user when reading the photo failed', async () => {
    render(
      <App
        service={createFailingDocumentService('Could not read that.', 10)}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('pairing-error')).toBeTruthy(),
    );
    expect(screen.getByText('Could not read that.')).toBeTruthy();
    // Still on the pairing screen, so the user can try again.
    expect(screen.getByText('482 134')).toBeTruthy();
  });

  it('restores a previously saved text size', async () => {
    await AsyncStorage.setItem('bigprint.textScale', '1.5');
    render(<App service={neverDelivers} />);
    await waitFor(() =>
      expect(screen.getByText(/^Text size 1\.5x \(saved\)/)).toBeTruthy(),
    );
  });

  it('starts at the default size when nothing is saved', async () => {
    render(<App service={neverDelivers} />);
    await waitFor(() =>
      expect(screen.getByText(/^Text size 1x \(saved\)/)).toBeTruthy(),
    );
  });
});
