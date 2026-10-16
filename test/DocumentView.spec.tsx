import 'react-native';
import {BackHandler} from '@amazon-devices/react-native-kepler';
import {act, render, screen, fireEvent, waitFor, within} from '@testing-library/react-native';
import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {DocumentView} from '../src/screens/DocumentView';
import {sampleReceipt as mockBill} from '../src/data/documents';
import type {AudioPlayer, PlaybackHandlers} from '../src/services/audioPlayer';

/** Waits for the saved-text-size lookup to finish so React state is settled. */
const settled = () =>
  waitFor(() => expect(screen.getByText(/Text size/)).toBeTruthy());


/** A player the test drives by hand. */
const fakePlayer = () => {
  let handlers: PlaybackHandlers | null = null;
  const player: AudioPlayer & {handlers: () => PlaybackHandlers | null; urls: string[]} = {
    urls: [],
    handlers: () => handlers,
    play: jest.fn((url: string, h: PlaybackHandlers) => {
      player.urls.push(url);
      handlers = h;
    }),
    stop: jest.fn(() => {
      handlers = null;
    }),
  };
  return player;
};

/** The Jest stand-in in test/setup.js adds this; the real handler has no such thing. */
const pressBack = (): boolean =>
  (BackHandler as unknown as {mockPressBack: () => boolean}).mockPressBack();

describe('DocumentView', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('shows what kind of letter it is and who sent it', async () => {
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    await settled();
    expect(screen.getByText(mockBill.kind)).toBeTruthy();
    expect(screen.getByText(`from ${mockBill.sender}`)).toBeTruthy();
  });

  it('shows every key fact, which must never be hidden', async () => {
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    await settled();
    for (const fact of mockBill.keyFacts) {
      expect(screen.getByText(fact.label)).toBeTruthy();
      expect(screen.getByText(fact.value)).toBeTruthy();
    }
  });

  it('renders every line of the letter', async () => {
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    await settled();
    mockBill.lines.forEach((_, index) => {
      expect(screen.getByTestId(`line-${index}`)).toBeTruthy();
    });
  });

  it('calls back when Back is pressed', async () => {
    const onBack = jest.fn();
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={onBack} />);
    await settled();
    fireEvent.press(screen.getByTestId('control-Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("the remote's Back key leaves the document, not the app", async () => {
    const onBack = jest.fn();
    const {unmount} = render(
      <DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={onBack} />,
    );
    await settled();
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(BackHandler.exitApp).not.toHaveBeenCalled();
    unmount();
    // Once the document is gone, Back falls through to the default again.
    expect(pressBack()).toBe(false);
  });

  it('persists a larger text size for the next screen', async () => {
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    fireEvent.press(screen.getByTestId('control-Bigger text'));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('bigprint.textScale')).toBe('1.25'),
    );
  });

  it('warns when the backend was unsure about the text', async () => {
    render(
      <DocumentView
        document={{...mockBill, lowConfidence: true}}
        player={null}
        audioUrl={() => null}
        onBack={() => {}}
      />,
    );
    await settled();
    // A panel with a first word, never colour alone.
    expect(
      screen.getByText(
        'Check: some words were hard to read. Compare with the paper copy.',
      ),
    ).toBeTruthy();
  });

  it('links key facts to the first line so a screen reader hears them', async () => {
    // Fire TV screen readers follow input focus, so static text is never
    // reached on its own. Losing this link silently hides the amount due.
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    await settled();
    const firstLine = screen.getByTestId('line-0');
    expect(firstLine.props.accessibilityDescribedBy).toEqual(
      mockBill.keyFacts.map((_, index) => `fact-${index}`),
    );
  });

  it('also links the warning when confidence is low', async () => {
    render(
      <DocumentView
        document={{...mockBill, lowConfidence: true}}
        player={null}
        audioUrl={() => null}
        onBack={() => {}}
      />,
    );
    await settled();
    expect(
      screen.getByTestId('line-0').props.accessibilityDescribedBy,
    ).toContain('read-warning');
  });

  it('marks lines as buttons, since pressing them reads aloud', async () => {
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    await settled();
    expect(screen.getByTestId('line-0').props.role).toBe('button');
  });

  it('marks the spoken word with a bar while a line is read', async () => {
    const player = fakePlayer();
    render(
      <DocumentView document={mockBill} player={player} audioUrl={(n) => `https://x/${n}`} onBack={() => {}} />,
    );
    await settled();
    expect(screen.queryByTestId('spoken-word')).toBeNull();
    fireEvent.press(screen.getByTestId('line-1'));
    expect(player.urls).toEqual(['https://x/1']);
    expect(screen.getByTestId('spoken-word')).toBeTruthy();
    expect(screen.getByTestId('line-position').props.children).toBe(
      `Reading line 2 of ${mockBill.lines.length}`,
    );
  });

  it('keeps every letter of a line while it is read', async () => {
    const player = fakePlayer();
    render(
      <DocumentView document={mockBill} player={player} audioUrl={(n) => `https://x/${n}`} onBack={() => {}} />,
    );
    await settled();
    fireEvent.press(screen.getByTestId('line-0'));
    // The words are laid out one by one so the bar can sit under one of them;
    // nothing may be lost or reordered doing so.
    const shown = within(screen.getByTestId('line-0'))
      .getAllByText(/.+/)
      .map((node) => node.props.children)
      .join('');
    expect(shown).toBe(mockBill.lines[0].replace(/\s+/g, ''));
  });

  it('reads the whole letter, one line after another', async () => {
    const player = fakePlayer();
    const letter = {...mockBill, lines: mockBill.lines.slice(0, 3)};
    render(
      <DocumentView document={letter} player={player} audioUrl={(n) => `https://x/${n}`} onBack={() => {}} />,
    );
    await settled();
    fireEvent.press(screen.getByTestId('control-Read whole letter'));
    expect(player.urls).toEqual(['https://x/0']);
    expect(screen.getByText('Stop reading')).toBeTruthy();

    act(() => player.handlers()!.onEnded());
    expect(player.urls).toEqual(['https://x/0', 'https://x/1']);
    act(() => player.handlers()!.onEnded());
    expect(player.urls).toEqual(['https://x/0', 'https://x/1', 'https://x/2']);
    // After the last line it stops instead of starting again.
    act(() => player.handlers()!.onEnded());
    expect(player.urls).toHaveLength(3);
    expect(screen.getByText('Read whole letter')).toBeTruthy();
  });

  it('skips a blank line during a whole-letter reading instead of stalling', async () => {
    const player = fakePlayer();
    const letter = {...mockBill, lines: ['First line.', '   ', 'Third line.']};
    render(
      <DocumentView document={letter} player={player} audioUrl={(n) => `https://x/${n}`} onBack={() => {}} />,
    );
    await settled();
    fireEvent.press(screen.getByTestId('control-Read whole letter'));
    act(() => player.handlers()!.onEnded());
    expect(player.urls).toEqual(['https://x/0', 'https://x/2']);
  });

  it('pressing a line during a whole-letter reading reads just that line', async () => {
    const player = fakePlayer();
    render(
      <DocumentView document={mockBill} player={player} audioUrl={(n) => `https://x/${n}`} onBack={() => {}} />,
    );
    await settled();
    fireEvent.press(screen.getByTestId('control-Read whole letter'));
    fireEvent.press(screen.getByTestId('line-4'));
    act(() => player.handlers()!.onEnded());
    expect(player.urls).toEqual(['https://x/0', 'https://x/4']);
  });

  it('Stop reading ends a whole-letter reading', async () => {
    const player = fakePlayer();
    render(
      <DocumentView document={mockBill} player={player} audioUrl={(n) => `https://x/${n}`} onBack={() => {}} />,
    );
    await settled();
    fireEvent.press(screen.getByTestId('control-Read whole letter'));
    fireEvent.press(screen.getByTestId('control-Read whole letter'));
    expect(player.stop).toHaveBeenCalled();
    expect(screen.getByText('Read whole letter')).toBeTruthy();
    expect(player.urls).toEqual(['https://x/0']);
  });

  it('does not warn when confidence is good', async () => {
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    await settled();
    expect(screen.queryByText(/hard to read/)).toBeNull();
  });
});
