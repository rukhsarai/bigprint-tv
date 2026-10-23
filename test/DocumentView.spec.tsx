import 'react-native';
import {BackHandler} from '@amazon-devices/react-native-kepler';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {DocumentView} from '../src/screens/DocumentView';
import {ColoursProvider} from '../src/theme/ColoursProvider';
import {sampleReceipt as mockBill} from '../src/data/documents';
import type {ScannedDocument} from '../src/data/documents';
import {
  UNSURE_LABEL,
  UNSURE_MARK,
  UNSURE_SPOKEN,
} from '../src/data/unsure';
import type {AudioPlayer, PlaybackHandlers} from '../src/services/audioPlayer';
import type {
  DocumentService,
  VoiceUpdate,
} from '../src/services/documentService';

/** Lets the saved text size, view and colours load so React state is settled. */
const settled = async () => {
  await waitFor(() => expect(screen.getByTestId('control-Settings')).toBeTruthy());
  await act(async () => {});
};

const openSettings = () => fireEvent.press(screen.getByTestId('control-Settings'));

/** A player the test drives by hand. */
const fakePlayer = () => {
  let handlers: PlaybackHandlers | null = null;
  const player: AudioPlayer & {
    handlers: () => PlaybackHandlers | null;
    urls: string[];
  } = {
    urls: [],
    handlers: () => handlers,
    play: jest.fn((url: string, h: PlaybackHandlers) => {
      player.urls.push(url);
      handlers = h;
    }),
    pause: jest.fn(),
    resume: jest.fn(),
    stop: jest.fn(() => {
      handlers = null;
    }),
  };
  return player;
};

/** A service whose voice the test makes ready by hand. */
const fakeService = (canListen = true) => {
  let update: ((u: VoiceUpdate) => void) | null = null;
  const service: DocumentService & {voice: (u: VoiceUpdate) => void} = {
    subscribe: () => () => {},
    canListen: () => canListen,
    requestVoice: jest.fn(
      (_doc: ScannedDocument, onUpdate: (u: VoiceUpdate) => void) => {
        update = onUpdate;
        onUpdate({state: 'making'});
        return jest.fn();
      },
    ),
    voice: (u) => act(() => update!(u)),
  };
  return service;
};

type Options = {
  document?: ScannedDocument;
  player?: AudioPlayer | null;
  service?: DocumentService;
  nextReady?: boolean;
  onNext?: () => void;
};

const show = ({
  document = mockBill,
  player = null,
  service = fakeService(),
  nextReady = false,
  onNext = () => {},
}: Options = {}) =>
  render(
    <DocumentView
      document={document}
      player={player}
      service={service}
      nextReady={nextReady}
      onNext={onNext}
    />,
  );

/** The Jest stand-in in test/setup.js adds this; the real handler has no such thing. */
const pressBack = (): boolean =>
  (BackHandler as unknown as {mockPressBack: () => boolean}).mockPressBack();

/** A letter that has the main points and the exact words as well. */
const letter: ScannedDocument = {
  ...mockBill,
  summary: [
    'Pay 26.91 to Brewers Restaurant.',
    'Call 928-783-0073 with any question.',
  ],
  exact: [
    {text: 'BREWERS RESTAURANT AND SPORTS BAR', kind: 'heading'},
    {text: 'Table 315, Server Steve A', kind: 'text'},
    {text: 'Item: BLT Sandwich; Price: 8.99', kind: 'row'},
  ],
};

describe('DocumentView', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('shows what kind of letter it is and who sent it', async () => {
    show();
    await settled();
    expect(screen.getByText(mockBill.kind)).toBeTruthy();
    expect(screen.getByText(`from ${mockBill.sender}`)).toBeTruthy();
  });

  it('shows every key fact, which must never be hidden', async () => {
    show();
    await settled();
    for (const fact of mockBill.keyFacts) {
      expect(screen.getByText(fact.label)).toBeTruthy();
      expect(screen.getByText(fact.value)).toBeTruthy();
    }
  });

  it('renders every line of the letter', async () => {
    show();
    await settled();
    mockBill.lines.forEach((_, index) => {
      expect(screen.getByTestId(`line-${index}`)).toBeTruthy();
    });
  });

  it('goes on to the next photo, and says when it is already waiting', async () => {
    const onNext = jest.fn();
    show({onNext});
    await settled();
    expect(screen.queryByTestId('control-Back')).toBeNull();
    fireEvent.press(screen.getByTestId('control-Next photo'));
    expect(onNext).toHaveBeenCalledTimes(1);
    show({nextReady: true});
    await waitFor(() =>
      expect(screen.getByText('Next photo is ready')).toBeTruthy(),
    );
  });

  it("the remote's Back key goes on to the next photo, not out of the app", async () => {
    const onNext = jest.fn();
    const {unmount} = show({onNext});
    await settled();
    expect(pressBack()).toBe(true);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(BackHandler.exitApp).not.toHaveBeenCalled();
    unmount();
    // Once the document is gone, Back falls through to the default again.
    expect(pressBack()).toBe(false);
  });

  it('persists a larger text size for the next screen', async () => {
    show();
    await settled();
    openSettings();
    fireEvent.press(screen.getByTestId('control-Bigger text'));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('bigprint.textScale')).toBe('2'),
    );
  });

  it('warns, as a panel with a first word, when the backend was unsure about the text', async () => {
    show({document: {...mockBill, lowConfidence: true}});
    await settled();
    expect(
      screen.getByText(
        'Check: some words were hard to read. Compare with the paper copy.',
      ),
    ).toBeTruthy();
  });

  it('shows a badge, not a figure, where the backend was unsure about money', async () => {
    // The pipeline leaves the sentence and takes the amount out. Printing it
    // anyway under the Check panel would state the one thing the app must not
    // get wrong. See mask_uncertain_money in backend/pipeline.py.
    show({
      document: {
        ...mockBill,
        lowConfidence: true,
        lines: [`The total amount due is ${UNSURE_MARK}.`],
      },
    });
    await settled();
    expect(screen.getByText(` [${UNSURE_LABEL}]`)).toBeTruthy();
    expect(screen.queryByText(/992|\$/)).toBeNull();
  });

  it('says the missing figure in words, because a badge cannot be heard', async () => {
    show({
      document: {
        ...mockBill,
        lowConfidence: true,
        lines: [`The total amount due is ${UNSURE_MARK}.`],
      },
    });
    await settled();
    expect(screen.getByTestId('line-0').props.accessibilityLabel).toBe(
      `The total amount due is ${UNSURE_SPOKEN}.`,
    );
  });

  it('links key facts to the first line so a screen reader hears them', async () => {
    // Fire TV screen readers follow input focus, so static text is never
    // reached on its own. Losing this link silently hides the amount due.
    show();
    await settled();
    const firstLine = screen.getByTestId('line-0');
    expect(firstLine.props.accessibilityDescribedBy).toEqual(
      mockBill.keyFacts.map((_, index) => `fact-${index}`),
    );
  });

  it('also links the warning when confidence is low', async () => {
    show({document: {...mockBill, lowConfidence: true}});
    await settled();
    expect(
      screen.getByTestId('line-0').props.accessibilityDescribedBy,
    ).toContain('read-warning');
  });

  it('lines are for reading: focusable, but not buttons', async () => {
    show();
    await settled();
    const line = screen.getByTestId('line-0');
    expect(line.props.role).toBeUndefined();
    expect(line.props.focusable).toBe(true);
  });

  it('does not warn when confidence is good', async () => {
    show();
    await settled();
    expect(screen.queryByText(/hard to read/)).toBeNull();
  });
});

describe('DocumentView listening', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('makes the voice only when Listen is pressed, then plays the parts in order', async () => {
    const player = fakePlayer();
    const service = fakeService();
    show({player, service});
    await settled();
    // Nothing is asked of the backend until someone wants to listen.
    expect(service.requestVoice).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('control-Listen'));
    expect(service.requestVoice).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('line-position').props.children).toBe(
      'Getting the voice ready…',
    );

    service.voice({state: 'ready', urls: ['https://x/0', 'https://x/1']});
    expect(player.urls).toEqual(['https://x/0']);
    expect(screen.getByText('Pause')).toBeTruthy();
    expect(screen.getByTestId('line-position').props.children).toBe(
      'Reading aloud',
    );

    act(() => player.handlers()!.onEnded());
    expect(player.urls).toEqual(['https://x/0', 'https://x/1']);
    act(() => player.handlers()!.onEnded());
    expect(screen.getByText('Listen')).toBeTruthy();
  });

  it('pauses and carries on from where it stopped', async () => {
    const player = fakePlayer();
    const service = fakeService();
    show({player, service});
    await settled();
    fireEvent.press(screen.getByTestId('control-Listen'));
    service.voice({state: 'ready', urls: ['https://x/0']});
    fireEvent.press(screen.getByTestId('control-Listen'));
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Keep listening')).toBeTruthy();
    expect(screen.getByTestId('line-position').props.children).toBe('Paused');
    fireEvent.press(screen.getByTestId('control-Listen'));
    expect(player.resume).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Pause')).toBeTruthy();
  });

  it('listening again uses the voice already made', async () => {
    const player = fakePlayer();
    const service = fakeService();
    show({player, service});
    await settled();
    fireEvent.press(screen.getByTestId('control-Listen'));
    service.voice({state: 'ready', urls: ['https://x/0']});
    act(() => player.handlers()!.onEnded());
    fireEvent.press(screen.getByTestId('control-Listen'));
    expect(service.requestVoice).toHaveBeenCalledTimes(1);
    expect(player.urls).toEqual(['https://x/0', 'https://x/0']);
  });

  it('nothing on screen follows the voice', async () => {
    const player = fakePlayer();
    const service = fakeService();
    show({player, service});
    await settled();
    fireEvent.press(screen.getByTestId('control-Listen'));
    service.voice({state: 'ready', urls: ['https://x/0']});
    act(() => player.handlers()!.onTime?.(800));
    expect(screen.queryByTestId('spoken-word')).toBeNull();
    expect(screen.queryByTestId('speaking-0')).toBeNull();
    // Pressing a line reads nothing aloud.
    fireEvent.press(screen.getByTestId('line-1'));
    expect(player.urls).toEqual(['https://x/0']);
  });

  it('says plainly when the voice cannot be made', async () => {
    const service = fakeService();
    show({player: fakePlayer(), service});
    await settled();
    fireEvent.press(screen.getByTestId('control-Listen'));
    service.voice({state: 'none'});
    expect(screen.getByText('No voice')).toBeTruthy();
  });

  it('offers no Listen without a player, or for a letter with no voice', async () => {
    show({player: null});
    await settled();
    expect(screen.queryByTestId('control-Listen')).toBeNull();
    show({player: fakePlayer(), service: fakeService(false)});
    await settled();
    expect(screen.queryByTestId('control-Listen')).toBeNull();
  });

  it('Next photo stops the voice', async () => {
    const player = fakePlayer();
    const service = fakeService();
    show({player, service});
    await settled();
    fireEvent.press(screen.getByTestId('control-Listen'));
    service.voice({state: 'ready', urls: ['https://x/0']});
    fireEvent.press(screen.getByTestId('control-Next photo'));
    expect(player.stop).toHaveBeenCalled();
  });
});

describe('DocumentView settings', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('keeps the screen to three buttons: Listen, Next photo, Settings', async () => {
    show({player: fakePlayer()});
    await settled();
    expect(screen.getByTestId('control-Listen')).toBeTruthy();
    expect(screen.getByTestId('control-Next photo')).toBeTruthy();
    expect(screen.getByTestId('control-Settings')).toBeTruthy();
    expect(screen.queryByTestId('control-Bigger text')).toBeNull();
    expect(screen.queryByTestId('control-Colours-dark')).toBeNull();
  });

  it('opens text size and colours in Settings, and Done or Back closes them', async () => {
    const onNext = jest.fn();
    // Inside the real provider, so a colour choice takes effect.
    render(
      <ColoursProvider>
        <DocumentView
          document={mockBill}
          player={null}
          service={fakeService()}
          nextReady={false}
          onNext={onNext}
        />
      </ColoursProvider>,
    );
    await settled();
    openSettings();
    expect(screen.getByText('Text size 1.5x')).toBeTruthy();
    expect(screen.getByTestId('control-Colours-dark').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('control-Colours-light'));
    expect(screen.getByTestId('control-Colours-light').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('control-Done'));
    expect(screen.queryByTestId('control-Done')).toBeNull();

    openSettings();
    // Back closes Settings first; it does not leave the letter.
    let claimed = false;
    act(() => {
      claimed = pressBack();
    });
    expect(claimed).toBe(true);
    expect(screen.queryByTestId('control-Done')).toBeNull();
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe('DocumentView views', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('offers no view choice when a result has only the full letter', async () => {
    show();
    await settled();
    openSettings();
    expect(screen.queryByTestId('control-View-full')).toBeNull();
  });

  it('switches from the full letter to numbered main points to the exact words', async () => {
    show({document: letter});
    await settled();
    openSettings();
    const selected = (name: string) =>
      screen.getByTestId(`control-View-${name}`).props.accessibilityState.selected;
    expect(selected('full')).toBe(true);
    expect(screen.getByTestId('line-0').props.accessibilityLabel).toBe(
      letter.lines[0],
    );

    fireEvent.press(screen.getByTestId('control-View-points'));
    expect(selected('points')).toBe(true);
    expect(
      screen.getByText('1.  Pay 26.91 to Brewers Restaurant.'),
    ).toBeTruthy();
    expect(
      screen.getByText('2.  Call 928-783-0073 with any question.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('line-2')).toBeNull();
    expect(screen.getByTestId('line-position').props.children).toBe(
      '2 main points',
    );

    fireEvent.press(screen.getByTestId('control-View-exact'));
    expect(selected('exact')).toBe(true);
    expect(screen.getByText('BREWERS RESTAURANT AND SPORTS BAR')).toBeTruthy();
    expect(screen.getByText('▸ Item: BLT Sandwich; Price: 8.99')).toBeTruthy();
    expect(screen.getByTestId('line-position').props.children).toBe(
      '3 lines as printed',
    );

    fireEvent.press(screen.getByTestId('control-View-full'));
    expect(selected('full')).toBe(true);
  });

  it('joins the exact words back into sentences instead of one item per printed line', async () => {
    show({
      document: {
        ...letter,
        exact: [
          {text: 'DIRECTIONS', kind: 'heading'},
          {text: 'Apply a small amount over the face for general', kind: 'text'},
          {text: 'use. Do not use on sensitive skin.', kind: 'text'},
        ],
      },
    });
    await settled();
    openSettings();
    fireEvent.press(screen.getByTestId('control-View-exact'));
    expect(
      screen.getByText(
        'Apply a small amount over the face for general use. Do not use on sensitive skin.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('line-2')).toBeNull();
  });

  it('keeps focus in Settings when a view is chosen', async () => {
    show({document: letter});
    await settled();
    expect(screen.getByTestId('line-0').props.hasTVPreferredFocus).toBe(true);
    openSettings();
    // Choosing a view re-creates the lines; the first must not pull focus
    // out of the panel while it is open.
    fireEvent.press(screen.getByTestId('control-View-points'));
    expect(screen.getByTestId('line-0').props.hasTVPreferredFocus).toBe(false);
    expect(screen.getByTestId('control-Done')).toBeTruthy();
    fireEvent.press(screen.getByTestId('control-Done'));
    expect(screen.getByTestId('line-0').props.hasTVPreferredFocus).toBe(true);
  });

  it('remembers the chosen view for the next letter', async () => {
    show({document: letter});
    await settled();
    openSettings();
    fireEvent.press(screen.getByTestId('control-View-points'));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('bigprint.view')).toBe('points'),
    );
  });

  it('starts in the remembered view when the letter offers it', async () => {
    await AsyncStorage.setItem('bigprint.view', 'exact');
    show({document: letter});
    await waitFor(() =>
      expect(screen.getByText('BREWERS RESTAURANT AND SPORTS BAR')).toBeTruthy(),
    );
    // A letter without exact words falls back to the full letter, without
    // forgetting the choice.
    show();
    await waitFor(() =>
      expect(screen.getAllByText(mockBill.lines[0]).length).toBeGreaterThan(0),
    );
    expect(await AsyncStorage.getItem('bigprint.view')).toBe('exact');
  });

  it('changing the view leaves the voice playing: it reads the whole letter', async () => {
    const player = fakePlayer();
    const service = fakeService();
    show({document: letter, player, service});
    await settled();
    fireEvent.press(screen.getByTestId('control-Listen'));
    service.voice({state: 'ready', urls: ['https://x/0']});
    openSettings();
    fireEvent.press(screen.getByTestId('control-View-points'));
    fireEvent.press(screen.getByTestId('control-Done'));
    expect(player.stop).not.toHaveBeenCalled();
    expect(screen.getByText('Pause')).toBeTruthy();
  });
});
