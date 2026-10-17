import {act, renderHook} from '@testing-library/react-native';

import {useIncomingDocument} from '../src/hooks/useIncomingDocument';
import {useListen} from '../src/hooks/useListen';
import {
  createMediaElementPlayer,
  type AudioPlayer,
  type MediaElementLike,
  type PlaybackHandlers,
} from '../src/services/audioPlayer';
import type {
  DocumentListener,
  DocumentService,
  VoiceUpdate,
} from '../src/services/documentService';
import {sampleReceipt, sampleInvoice} from '../src/data/documents';

/** The parts of a service useIncomingDocument does not use. */
const noVoice = {canListen: () => false, requestVoice: () => () => {}};

describe('useListen', () => {
  const setup = () => {
    let handlers: PlaybackHandlers | null = null;
    let update: ((u: VoiceUpdate) => void) | null = null;
    const cancel = jest.fn();
    const player: AudioPlayer = {
      play: jest.fn((_url: string, h: PlaybackHandlers) => {
        handlers = h;
      }),
      pause: jest.fn(),
      resume: jest.fn(),
      stop: jest.fn(),
    };
    const service: DocumentService = {
      subscribe: () => () => {},
      canListen: () => true,
      requestVoice: jest.fn((_d, onUpdate) => {
        update = onUpdate;
        return cancel;
      }),
    };
    const hook = renderHook(() => useListen(player, service, sampleReceipt));
    return {
      hook,
      player,
      service,
      cancel,
      handlers: () => handlers!,
      voice: (u: VoiceUpdate) => act(() => update!(u)),
    };
  };

  it('pressing again while the voice is being made cancels the wait', () => {
    const {hook, cancel, voice, player} = setup();
    act(() => hook.result.current.press());
    expect(hook.result.current.state).toBe('preparing');
    act(() => hook.result.current.press());
    expect(hook.result.current.state).toBe('idle');
    expect(cancel).toHaveBeenCalled();
    // A late answer to the cancelled request plays nothing.
    voice({state: 'ready', urls: ['https://x/0']});
    expect(player.play).not.toHaveBeenCalled();
  });

  it('stops, rather than going on to the next part, when Alexa takes the speaker', () => {
    const {hook, voice, handlers, player} = setup();
    act(() => hook.result.current.press());
    voice({state: 'ready', urls: ['https://x/0', 'https://x/1']});
    act(() => handlers().onInterrupted!());
    expect(hook.result.current.state).toBe('idle');
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('says the voice is unavailable when it will not play', () => {
    const {hook, voice, handlers} = setup();
    act(() => hook.result.current.press());
    voice({state: 'ready', urls: ['https://x/0']});
    act(() => handlers().onError('404'));
    expect(hook.result.current.state).toBe('unavailable');
  });

  it('stops the voice when the screen goes away', () => {
    const {hook, voice, player} = setup();
    act(() => hook.result.current.press());
    voice({state: 'ready', urls: ['https://x/0']});
    hook.unmount();
    expect(player.stop).toHaveBeenCalled();
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
    // Paused, the clock stands still and the stall watchdog stays quiet.
    player.pause();
    await settle();
    expect(el.pause).toHaveBeenCalledTimes(1);
    const calls = onTime.mock.calls.length;
    jest.advanceTimersByTime(5000);
    expect(onTime.mock.calls.length).toBe(calls);
    player.resume();
    await settle();
    expect(el.play).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(60);
    expect(onTime.mock.calls.length).toBeGreaterThan(calls);
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
    player.play('https://x/a.mp3', {
      onTime: jest.fn(),
      onEnded: jest.fn(),
      onError,
    });
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
    player.play('https://x/2.mp3', {
      onTime: jest.fn(),
      onEnded: jest.fn(),
      onError: jest.fn(),
    });
    await settle();
    expect(el.src).toBe('https://x/2.mp3');
    expect(created).toBe(1);
    jest.useRealTimers();
  });
});

describe('useIncomingDocument', () => {
  it('holds a second document until the reader presses Next photo', () => {
    let l: DocumentListener | null = null;
    const service = {
      subscribe: (listener: DocumentListener) => {
        l = listener;
        return () => {};
      },
      ...noVoice,
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
    // ...but the Next photo button can say it is ready.
    expect(result.current.nextReady).toBe(true);

    act(() => result.current.reset());
    expect(result.current.status).toBe('arrived');
    expect(result.current.document).toBe(sampleInvoice);
    expect(result.current.nextReady).toBe(false);

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

  it('gives up on an initialise that never answers, so Listen is not left saying it plays', async () => {
    jest.useFakeTimers();
    const player = createMediaElementPlayer(
      () => new Promise<MediaElementLike>(() => {}),
    );
    const onError = jest.fn();
    player.play('https://x/a.mp3', {
      onTime: jest.fn(),
      onEnded: jest.fn(),
      onError,
    });
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

  it('treats losing the speaker to Alexa as an interruption, not the end', async () => {
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
    const onInterrupted = jest.fn();
    player.play('https://x/a.mp3', {
      onTime: jest.fn(),
      onEnded,
      onError: jest.fn(),
      onInterrupted,
    });
    await settle();
    el.currentTime = 1.2;
    jest.advanceTimersByTime(100);
    listeners.audiofocuslost();
    // A story must not carry on to its next part over Alexa.
    expect(onInterrupted).toHaveBeenCalledTimes(1);
    expect(onEnded).not.toHaveBeenCalled();
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
      ...noVoice,
    };
    return {service, listener: () => l!};
  };

  it('surfaces a failed second photo after Next photo instead of losing it', () => {
    const {service, listener} = makeService();
    const {result} = renderHook(() => useIncomingDocument(service));
    act(() =>
      listener().onSession({code: '482134', captureUrl: 'u', expiresAt: 1}),
    );
    act(() => listener().onDocument(sampleReceipt));
    act(() => listener().onProcessing());
    act(() => listener().onError('Too dark.'));
    expect(result.current.status).toBe('arrived');
    act(() => result.current.reset());
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Too dark.');
  });

  it('shows "reading" after Next photo when the next page is still being read', () => {
    const {service, listener} = makeService();
    const {result} = renderHook(() => useIncomingDocument(service));
    act(() =>
      listener().onSession({code: '482134', captureUrl: 'u', expiresAt: 1}),
    );
    act(() => listener().onDocument(sampleReceipt));
    act(() => listener().onProcessing());
    act(() => result.current.reset());
    expect(result.current.status).toBe('processing');
  });

  it('a renewed session does not clear an error the user has not seen', () => {
    const {service, listener} = makeService();
    const {result} = renderHook(() => useIncomingDocument(service));
    act(() =>
      listener().onSession({code: '482134', captureUrl: 'u', expiresAt: 1}),
    );
    act(() => listener().onError('Too dark.'));
    expect(result.current.status).toBe('error');
    act(() =>
      listener().onSession({code: '900001', captureUrl: 'u2', expiresAt: 2}),
    );
    // A fresh code means the user can try again; the screen goes back to waiting.
    expect(result.current.status).toBe('waiting');
    expect(result.current.session?.code).toBe('900001');
  });
});
