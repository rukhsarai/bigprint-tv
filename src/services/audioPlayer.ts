/**
 * The one thing the listen hook needs from the platform: play a URL, pause
 * it, and say when it ends. Keeping it this small means the hook, the view
 * and the tests never touch Vega's media API directly.
 */
export type PlaybackHandlers = {
  /** Called often (tens of times a second) with the position in milliseconds. */
  onTime?: (ms: number) => void;
  onEnded: () => void;
  onError: (reason: string) => void;
  /**
   * Alexa or the screen reader took the speaker. Not the end of the audio,
   * so a story does not carry on to its next part. Defaults to onEnded.
   */
  onInterrupted?: () => void;
};

export type AudioPlayer = {
  play: (url: string, handlers: PlaybackHandlers) => void;
  /** Hold the current audio where it is; resume carries on from there. */
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

/** How often playback position is sampled, in milliseconds. */
export const POSITION_TICK_MS = 50;

/**
 * How long the platform gets to initialise, or to produce sound, before the
 * TV says the voice could not be played. The device is not instant, but it
 * is not this slow either. Without this a stalled initialise would leave the
 * Listen button saying it is playing when nothing is heard.
 */
export const AUDIO_START_TIMEOUT_MS = 4000;

/**
 * Anything shaped like an HTML media element. Vega's W3C media package
 * provides one (AudioPlayer), and so does a browser.
 */
export type MediaElementLike = {
  src: string;
  currentTime: number;
  play: () => Promise<void> | void;
  pause: () => void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

const withTimeout = <T>(work: Promise<T>, ms: number, what: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

/** Vega raises these when Alexa or the screen reader takes the speaker. */
const INTERRUPTIONS = ['audiofocuslost', 'audiofocuspaused'];

/**
 * Wraps a media element. One element is created lazily and reused for every
 * part of every letter, because initialising a player on the device is not
 * instant. Position is sampled on a timer, which is also what notices audio
 * that never starts.
 */
export const createMediaElementPlayer = (
  getElement: () => Promise<MediaElementLike> | MediaElementLike,
): AudioPlayer => {
  let element: Promise<MediaElementLike> | null = null;
  let tick: ReturnType<typeof setInterval> | null = null;
  let detach: (() => void) | null = null;
  // While paused, silence is expected: the stall watchdog must not fire.
  let paused = false;
  let startedAt = 0;
  // Bumped on every play/stop so a slow initialise cannot start stale audio.
  let generation = 0;

  const quiet = () => {
    generation += 1;
    paused = false;
    if (tick !== null) {
      clearInterval(tick);
      tick = null;
    }
    if (detach) {
      detach();
      detach = null;
    }
  };

  const stop = () => {
    quiet();
    if (element) {
      element.then((el) => el.pause()).catch(() => {});
    }
  };

  return {
    stop,
    pause: () => {
      if (tick === null || paused) {
        return;
      }
      paused = true;
      element?.then((el) => el.pause()).catch(() => {});
    },
    resume: () => {
      if (tick === null || !paused) {
        return;
      }
      paused = false;
      // The watchdog counts from now, not from the first play.
      startedAt = Date.now();
      element
        ?.then((el) => {
          const result = el.play();
          if (result && typeof (result as Promise<void>).catch === 'function') {
            (result as Promise<void>).catch(() => {});
          }
        })
        .catch(() => {});
    },
    play: (url, handlers) => {
      stop();
      const mine = generation;
      if (!element) {
        element = withTimeout(
          Promise.resolve().then(getElement),
          AUDIO_START_TIMEOUT_MS,
          'audio initialise',
        );
        // A failed or stalled initialise is not permanent; try again next time.
        element.catch(() => {
          element = null;
        });
      }
      element
        .then((el) => {
          if (mine !== generation) {
            return;
          }
          const onEnded = () => {
            quiet();
            handlers.onEnded();
          };
          const onError = () => {
            quiet();
            // Stop the element too: audio that starts late must not play
            // after the TV has said it could not.
            try {
              el.pause();
            } catch {
              // nothing to stop
            }
            handlers.onError('playback failed');
          };
          el.addEventListener('ended', onEnded);
          el.addEventListener('error', onError);
          const onInterrupted = () => {
            quiet();
            (handlers.onInterrupted ?? handlers.onEnded)();
          };
          INTERRUPTIONS.forEach((type) =>
            el.addEventListener(type, onInterrupted),
          );
          detach = () => {
            el.removeEventListener('ended', onEnded);
            el.removeEventListener('error', onError);
            INTERRUPTIONS.forEach((type) =>
              el.removeEventListener(type, onInterrupted),
            );
          };
          // Setting src is the package's documented URL-mode path and loads
          // the media itself; an explicit load() is listed as unsupported.
          el.src = url;
          startedAt = Date.now();
          let heard = false;
          tick = setInterval(() => {
            if (paused) {
              return;
            }
            const seconds = el.currentTime;
            if (seconds > 0) {
              heard = true;
            } else if (
              !heard &&
              Date.now() - startedAt > AUDIO_START_TIMEOUT_MS
            ) {
              // Nothing has played: wrong URL, codec or focus. Go silent.
              onError();
              return;
            }
            handlers.onTime?.(Math.round(seconds * 1000));
          }, POSITION_TICK_MS);
          const result = el.play();
          if (result && typeof (result as Promise<void>).catch === 'function') {
            (result as Promise<void>).catch(onError);
          }
        })
        .catch((e) => {
          if (mine === generation) {
            quiet();
            handlers.onError(String(e));
          }
        });
    },
  };
};
