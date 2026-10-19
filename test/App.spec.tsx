import 'react-native';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';
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
  canListen: () => false,
  requestVoice: () => () => {},
};

describe('App', () => {
  let randomSpy: jest.SpyInstance;

  beforeEach(async () => {
    await AsyncStorage.clear();
    // A look has been chosen before, so these tests start on pairing.
    await AsyncStorage.setItem('bigprint.colours', 'dark');
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
        'Tap the link that pops up, then photograph the letter',
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
    render(<App service={{subscribe: () => () => {}, canListen: () => false, requestVoice: () => () => {}}} />);
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

  it('brings a letter back from Recent letters after Next photo by mistake', async () => {
    const service = createMockDocumentService(sampleLetter, 10);
    service.requestVoice = jest.fn(service.requestVoice);
    render(<App service={service} player={null} />);
    await waitFor(() => expect(screen.getByText(sampleLetter.kind)).toBeTruthy());
    fireEvent.press(screen.getByTestId('control-Next photo'));
    await waitFor(() => expect(screen.getByTestId('control-Recent letters')).toBeTruthy());
    fireEvent.press(screen.getByTestId('control-Recent letters'));
    fireEvent.press(screen.getByTestId('recent-0'));
    await waitFor(() => expect(screen.getByText(sampleLetter.kind)).toBeTruthy());
    // Nothing was sent again to get it back.
    expect(service.requestVoice).not.toHaveBeenCalled();
  });

  it('shows only "Reading your letter" while a photo is read', async () => {
    let l: DocumentListener | null = null;
    render(
      <App
        service={{
          subscribe: (listener) => {
            l = listener;
            listener.onSession({code: '482134', captureUrl: 'u', expiresAt: 1});
            return () => {};
          },
          canListen: () => false,
          requestVoice: () => () => {},
        }}
      />,
    );
    await waitFor(() => expect(screen.getByText('482 134')).toBeTruthy());
    act(() => l!.onProcessing());
    await waitFor(() => expect(screen.getByTestId('pairing-processing')).toBeTruthy());
    expect(screen.getByText('Reading your letter')).toBeTruthy();
    // The code has done its job: no QR, no buttons, one message.
    expect(screen.queryByText('482 134')).toBeNull();
    expect(screen.queryByTestId('size-button-Bigger text')).toBeNull();
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

  it('asks which colours are easier to read on first run', async () => {
    await AsyncStorage.removeItem('bigprint.colours');
    render(<App service={neverDelivers} />);
    await waitFor(() =>
      expect(screen.getByText('Which is easier to read?')).toBeTruthy(),
    );
    expect(screen.getByTestId('colours-dark')).toBeTruthy();
    expect(screen.getByTestId('colours-light')).toBeTruthy();
    expect(screen.getByTestId('colours-yellow')).toBeTruthy();
    // Pairing waits until a look is chosen.
    expect(screen.queryByText('Read anything on your TV')).toBeNull();

    fireEvent.press(screen.getByTestId('colours-light'));
    await settled();
    expect(screen.getByText('Read anything on your TV')).toBeTruthy();
    expect(screen.getByText('Colours: Light')).toBeTruthy();
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('bigprint.colours')).toBe('light'),
    );
  });

  it('remembers the chosen colours and skips the question next time', async () => {
    await AsyncStorage.setItem('bigprint.colours', 'yellow');
    render(<App service={neverDelivers} />);
    await settled();
    expect(screen.queryByText('Which is easier to read?')).toBeNull();
    expect(screen.getByText('Colours: Yellow')).toBeTruthy();
  });

  it('the Colours button moves to the next look and remembers it', async () => {
    render(<App service={neverDelivers} />);
    await settled();
    expect(screen.getByText('Colours: Dark')).toBeTruthy();
    fireEvent.press(screen.getByTestId('colours-button'));
    expect(screen.getByText('Colours: Light')).toBeTruthy();
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('bigprint.colours')).toBe('light'),
    );
    fireEvent.press(screen.getByTestId('colours-button'));
    fireEvent.press(screen.getByTestId('colours-button'));
    expect(screen.getByText('Colours: Dark')).toBeTruthy();
  });

  it('ignores a saved value it does not recognise and asks again', async () => {
    await AsyncStorage.setItem('bigprint.colours', 'purple');
    render(<App service={neverDelivers} />);
    await waitFor(() =>
      expect(screen.getByText('Which is easier to read?')).toBeTruthy(),
    );
  });

  it('starts at the default size when nothing is saved', async () => {
    render(<App service={neverDelivers} />);
    await waitFor(() =>
      expect(screen.getByText(/^Text size 1x \(saved\)/)).toBeTruthy(),
    );
  });
});
