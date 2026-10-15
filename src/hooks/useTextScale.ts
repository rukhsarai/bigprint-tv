import {useCallback, useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TEXT_SCALE_KEY = 'bigprint.textScale';

/** Text scale steps. 1 is the baseline; users who need more go up. */
export const SCALE_STEPS = [1, 1.25, 1.5, 2];

export type TextScale = {
  /** Current multiplier, e.g. 1.5 */
  scale: number;
  /** Index into SCALE_STEPS. */
  scaleIndex: number;
  /** True once the saved preference has been read. */
  restored: boolean;
  /** Multiply a base font size by the current scale. */
  scaled: (size: number) => number;
  /** Step the scale up (1) or down (-1) and persist it. */
  changeScale: (direction: 1 | -1) => void;
  canGoBigger: boolean;
  canGoSmaller: boolean;
};

/**
 * The user's text size, shared across screens and remembered between launches.
 * This is the core accessibility setting, so it is read once at startup and
 * written on every change rather than only at exit.
 */
export const useTextScale = (): TextScale => {
  const [scaleIndex, setScaleIndex] = useState(0);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(TEXT_SCALE_KEY);
        if (active && saved !== null) {
          const index = SCALE_STEPS.indexOf(Number(saved));
          if (index !== -1) {
            setScaleIndex(index);
          }
        }
      } catch (e) {
        console.warn('Could not read saved text size', e);
      } finally {
        if (active) {
          setRestored(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const changeScale = useCallback(
    (direction: 1 | -1) => {
      setScaleIndex((current) => {
        const next = Math.min(
          SCALE_STEPS.length - 1,
          Math.max(0, current + direction),
        );
        AsyncStorage.setItem(TEXT_SCALE_KEY, String(SCALE_STEPS[next])).catch(
          (e) => console.warn('Could not save text size', e),
        );
        return next;
      });
    },
    [],
  );

  const scale = SCALE_STEPS[scaleIndex];

  return {
    scale,
    scaleIndex,
    restored,
    scaled: (size: number) => Math.round(size * scale),
    changeScale,
    canGoBigger: scaleIndex < SCALE_STEPS.length - 1,
    canGoSmaller: scaleIndex > 0,
  };
};
