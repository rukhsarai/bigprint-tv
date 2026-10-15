/**
 * The one thing the read-aloud hook needs from the platform: play a URL and
 * say how far along it is. Keeping it this small means the hook, the view and
 * the tests never touch Vega's media API directly.
 */
export type PlaybackHandlers = {
  /** Called often (tens of times a second) with the position in milliseconds. */
  onTime: (ms: number) => void;
  onEnded: () => void;
  onError: (reason: string) => void;
};

export type AudioPlayer = {
  play: (url: string, handlers: PlaybackHandlers) => void;
  stop: () => void;
};

/** How often playback position is sampled, in milliseconds. */
export const POSITION_TICK_MS = 50;

/**
 * How long the platform gets to initialise, or to produce sound, before the
 * highlight carries on silently. The device is not instant, but it is not
 * this slow either. Without this a stalled initialise would leave every line
 * a dead button.
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
  load?: () => void;
};

const withTimeout = <T,>(work: Promise<T>, ms: number, what: string) =>
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
 * line, because initialising a player on the device is not instant. Position
 * is sampled on a timer rather than relying on 'timeupdate', which fires too
 * rarely to light up individual words.
 */
export const createMediaElementPlayer = (
  getElement: () => Promise<MediaElementLike> | MediaElementLike,
): AudioPlayer => {
  let element: Promise<MediaElementLike> | null = null;
  let tick: ReturnType<typeof setInterval> | null = null;
  let detach: (() => void) | null = null;
  // Bumped on every play/stop so a slow initialise cannot start stale audio.
  let generation = 0;

  const quiet = () => {
    generation += 1;
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
            handlers.onError('playback failed');
          };
          el.addEventListener('ended', onEnded);
          el.addEventListener('error', onError);
          // An interruption ends the line rather than leaving one word lit.
          INTERRUPTIONS.forEach((type) => el.addEventListener(type, onEnded));
          detach = () => {
            el.removeEventListener('ended', onEnded);
            el.removeEventListener('error', onError);
            INTERRUPTIONS.forEach((type) =>
              el.removeEventListener(type, onEnded),
            );
          };
          el.src = url;
          if (el.load) {
            el.load();
          }
          const startedAt = Date.now();
          let heard = false;
          tick = setInterval(() => {
            const seconds = el.currentTime;
            if (seconds > 0) {
              heard = true;
            } else if (!heard && Date.now() - startedAt > AUDIO_START_TIMEOUT_MS) {
              // Nothing has played: wrong URL, codec or focus. Go silent.
              onError();
              return;
            }
            handlers.onTime(Math.round(seconds * 1000));
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
