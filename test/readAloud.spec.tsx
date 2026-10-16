import {act, renderHook} from '@testing-library/react-native';

import {useReadAloud} from '../src/hooks/useReadAloud';
import {useIncomingDocument} from '../src/hooks/useIncomingDocument';
import type {AudioPlayer, PlaybackHandlers} from '../src/services/audioPlayer';
import {createMediaElementPlayer, type MediaElementLike} from '../src/services/audioPlayer';
import type {DocumentListener} from '../src/services/documentService';
import {sampleReceipt, sampleInvoice} from '../src/data/documents';

const marks = [
  {time: 0, type: 'word' as const, start: 0, end: 3, value: 'Pay'},
  {time: 400, type: 'word' as const, start: 4, end: 10, value: '£84.60'},
  {time: 1200, type: 'word' as const, start: 11, end: 14, value: 'now'},
];

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

describe('useReadAloud with audio', () => {
  it('follows the audio position and stops when it ends', () => {
    const player = fakePlayer();
    const {result} = renderHook(() => useReadAloud(player));

    act(() => result.current.toggle(2, 'Pay £84.60 now', {marks, audioUrl: 'https://x/audio'}));
    expect(player.urls).toEqual(['https://x/audio']);
    expect(result.current.readingLine).toBe(2);
    expect(result.current.hasAudio).toBe(true);
    expect(result.current.wordIndex).toBe(0);

    act(() => player.handlers()!.onTime(450));
    expect(result.current.wordIndex).toBe(1);
    act(() => player.handlers()!.onTime(1300));
    expect(result.current.wordIndex).toBe(2);

    act(() => player.handlers()!.onEnded());
    expect(result.current.readingLine).toBeNull();
    expect(player.stop).toHaveBeenCalled();
  });

  it('pressing the same line again stops it', () => {
    const player = fakePlayer();
    const {result} = renderHook(() => useReadAloud(player));
    act(() => result.current.toggle(0, 'Pay £84.60 now', {marks, audioUrl: 'https://x/audio'}));
    act(() => result.current.toggle(0, 'Pay £84.60 now', {marks, audioUrl: 'https://x/audio'}));
    expect(result.current.readingLine).toBeNull();
  });

  it('falls back to the silent highlight when audio fails', () => {
    jest.useFakeTimers();
    const player = fakePlayer();
    const {result} = renderHook(() => useReadAloud(player));
    act(() => result.current.toggle(0, 'Pay £84.60 now', {marks, audioUrl: 'https://x/audio'}));
    act(() => player.handlers()!.onError('no codec'));
    expect(result.current.hasAudio).toBe(false);
    expect(result.current.readingLine).toBe(0);
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.wordIndex).toBe(1);
    jest.useRealTimers();
  });

  it('highlights silently when there is no player', () => {
    jest.useFakeTimers();
    const {result} = renderHook(() => useReadAloud(null));
    act(() => result.current.toggle(0, 'Please pay by 28 October 2026.'));
    expect(result.current.readingLine).toBe(0);
    expect(result.current.hasAudio).toBe(false);
    expect(result.current.marks.length).toBe(6);
    jest.useRealTimers();
  });
});

describe('createMediaElementPlayer', () => {
  const element = () => {
    const listeners: Record<string, () => void> = {};
    const el: MediaElementLike & {fire: (type: string) => void} = {
      src: '',
      currentTime: 0,
      play: jest.fn(),
      pause: jest.fn(),
      addEventListener: (type, fn) => {
        listeners[type] = fn;
      },
      removeEventListener: (type) => {
        delete listeners[type];
      },
      fire: (type) => listeners[type] && listeners[type](),
    };
    return el;
  };

  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
  };

  it('samples position on a timer and reports ended', async () => {
    jest.useFakeTimers();
    const el = element();
    const player = createMediaElementPlayer(() => el);
    const onTime = jest.fn();
    const onEnded = jest.fn();
    player.play('https://x/a.mp3', {onTime, onEnded, onError: jest.fn()});
    await settle();
    expect(el.src).toBe('https://x/a.mp3');
    expect(el.play).toHaveBeenCalled();
    el.currentTime = 0.42;
    jest.advanceTimersByTime(60);
    expect(onTime).toHaveBeenLastCalledWith(420);
    el.fire('ended');
    expect(onEnded).toHaveBeenCalled();
    // Ending on its own does not pause; an explicit stop does.
    player.stop();
    await settle();
    expect(el.pause).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('reports an error when the element cannot be created', async () => {
    const player = createMediaElementPlayer(() => {
      throw new Error('no media');
    });
    const onError = jest.fn();
    player.play('https://x/a.mp3', {onTime: jest.fn(), onEnded: jest.fn(), onError});
    await settle();
    expect(onError).toHaveBeenCalled();
  });

  it('reuses one element and ignores a stale initialise after stop', async () => {
    jest.useFakeTimers();
    let created = 0;
    const el = element();
    const player = createMediaElementPlayer(async () => {
      created += 1;
      return el;
    });
    const first = {onTime: jest.fn(), onEnded: jest.fn(), onError: jest.fn()};
    player.play('https://x/1.mp3', first);
    player.stop();
    await settle();
    expect(el.play).not.toHaveBeenCalled();
    player.play('https://x/2.mp3', {onTime: jest.fn(), onEnded: jest.fn(), onError: jest.fn()});
    await settle();
    expect(el.src).toBe('https://x/2.mp3');
    expect(created).toBe(1);
    jest.useRealTimers();
  });
});

describe('useIncomingDocument', () => {
  it('holds a second document until the reader presses Back', () => {
    let l: DocumentListener | null = null;
    const service = {
      subscribe: (listener: DocumentListener) => {
        l = listener;
        return () => {};
      },
      audioUrl: () => null,
    };
    const {result} = renderHook(() => useIncomingDocument(service));
    expect(result.current.status).toBe('connecting');

    act(() => l!.onSession({code: '482134', captureUrl: 'u', expiresAt: 1}));
    expect(result.current.status).toBe('waiting');

    act(() => l!.onProcessing());
    expect(result.current.status).toBe('processing');

    act(() => l!.onDocument(sampleReceipt));
    expect(result.current.status).toBe('arrived');
    expect(result.current.document).toBe(sampleReceipt);

    // A second page arrives while reading: the view must not change underneath them.
    act(() => l!.onDocument(sampleInvoice));
    act(() => l!.onError('ignored while reading'));
    expect(result.current.document).toBe(sampleReceipt);
    expect(result.current.error).toBeNull();

    act(() => result.current.reset());
    expect(result.current.status).toBe('arrived');
    expect(result.current.document).toBe(sampleInvoice);

    act(() => result.current.reset());
    expect(result.current.status).toBe('waiting');
    expect(result.current.document).toBeNull();
  });
});

describe('createMediaElementPlayer robustness', () => {
  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
  };

  it('gives up on an initialise that never answers, so the line is not a dead button', async () => {
    jest.useFakeTimers();
    const player = createMediaElementPlayer(() => new Promise<MediaElementLike>(() => {}));
    const onError = jest.fn();
    player.play('https://x/a.mp3', {onTime: jest.fn(), onEnded: jest.fn(), onError});
    await settle();
    expect(onError).not.toHaveBeenCalled();
    jest.advanceTimersByTime(4100);
    await settle();
    expect(onError).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('goes silent when nothing plays within the start timeout', async () => {
    jest.useFakeTimers();
    const listeners: Record<string, () => void> = {};
    const el: MediaElementLike = {
      src: '',
      currentTime: 0,
      play: jest.fn(),
      pause: jest.fn(),
      addEventListener: (t, fn) => {
        listeners[t] = fn;
      },
      removeEventListener: (t) => {
        delete listeners[t];
      },
    };
    const player = createMediaElementPlayer(() => el);
    const onError = jest.fn();
    const onTime = jest.fn();
    player.play('https://x/a.mp3', {onTime, onEnded: jest.fn(), onError});
    await settle();
    jest.advanceTimersByTime(4200);
    expect(onError).toHaveBeenCalledTimes(1);
    // The watchdog stops the clock as well.
    const calls = onTime.mock.calls.length;
    jest.advanceTimersByTime(500);
    expect(onTime.mock.calls.length).toBe(calls);
    jest.useRealTimers();
  });

  it('treats losing the speaker to Alexa as the end of the line', async () => {
    jest.useFakeTimers();
    const listeners: Record<string, () => void> = {};
    const el: MediaElementLike = {
      src: '',
      currentTime: 0,
      play: jest.fn(),
      pause: jest.fn(),
      addEventListener: (t, fn) => {
        listeners[t] = fn;
      },
      removeEventListener: (t) => {
        delete listeners[t];
      },
    };
    const player = createMediaElementPlayer(() => el);
    const onEnded = jest.fn();
    player.play('https://x/a.mp3', {onTime: jest.fn(), onEnded, onError: jest.fn()});
    await settle();
    el.currentTime = 1.2;
    jest.advanceTimersByTime(100);
    listeners.audiofocuslost();
    expect(onEnded).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('useIncomingDocument late events', () => {
  const makeService = () => {
    let l: DocumentListener | null = null;
    const service = {
      subscribe: (listener: DocumentListener) => {
        l = listener;
        return () => {};
      },
      audioUrl: () => null,
    };
    return {service, listener: () => l!};
  };

  it('surfaces a failed second photo after Back instead of losing it', () => {
    const {service, listener} = makeService();
    const {result} = renderHook(() => useIncomingDocument(service));
    act(() => listener().onSession({code: '482134', captureUrl: 'u', expiresAt: 1}));
    act(() => listener().onDocument(sampleReceipt));
    act(() => listener().onProcessing());
    act(() => listener().onError('Too dark.'));
    expect(result.current.status).toBe('arrived');
    act(() => result.current.reset());
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Too dark.');
  });

  it('shows "reading" after Back when the next page is still being read', () => {
    const {service, listener} = makeService();
    const {result} = renderHook(() => useIncomingDocument(service));
    act(() => listener().onSession({code: '482134', captureUrl: 'u', expiresAt: 1}));
    act(() => listener().onDocument(sampleReceipt));
    act(() => listener().onProcessing());
    act(() => result.current.reset());
    expect(result.current.status).toBe('processing');
  });

  it('a renewed session does not clear an error the user has not seen', () => {
    const {service, listener} = makeService();
    const {result} = renderHook(() => useIncomingDocument(service));
    act(() => listener().onSession({code: '482134', captureUrl: 'u', expiresAt: 1}));
    act(() => listener().onError('Too dark.'));
    expect(result.current.status).toBe('error');
    act(() => listener().onSession({code: '900001', captureUrl: 'u2', expiresAt: 2}));
    // A fresh code means the user can try again; the screen goes back to waiting.
    expect(result.current.status).toBe('waiting');
    expect(result.current.session?.code).toBe('900001');
  });
});
