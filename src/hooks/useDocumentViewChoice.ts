import {useCallback, useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VIEW_KEY = 'bigprint.view';

/**
 * The three ways to read a letter.
 * - full: the whole letter in plain English, one sentence per line. The
 *   voice reads this.
 * - points: the main points only, a few short sentences.
 * - exact: the page's own words in reading order, headings and table rows
 *   kept, for when the exact wording matters.
 */
export type DocumentViewName = 'full' | 'points' | 'exact';

export const VIEW_ORDER: DocumentViewName[] = ['full', 'points', 'exact'];

export const VIEW_LABEL: Record<DocumentViewName, string> = {
  full: 'Full letter',
  points: 'Main points',
  exact: 'Exact words',
};

export const isViewName = (value: unknown): value is DocumentViewName =>
  typeof value === 'string' && (VIEW_ORDER as string[]).includes(value);

/** The view after this one among those offered, wrapping round. */
export const nextView = (
  current: DocumentViewName,
  offered: DocumentViewName[],
): DocumentViewName => {
  const i = offered.indexOf(current);
  return offered[(i + 1) % offered.length] ?? offered[0];
};

/**
 * Which view the viewer last chose, remembered between letters and launches
 * like the text size, so someone who always wants the exact words gets them
 * without asking each time.
 */
export const useDocumentViewChoice = () => {
  const [view, setViewState] = useState<DocumentViewName>('full');
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(VIEW_KEY);
        if (active && isViewName(saved)) {
          setViewState(saved);
        }
      } catch (e) {
        console.warn('Could not read saved view', e);
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

  const setView = useCallback((next: DocumentViewName) => {
    setViewState(next);
    AsyncStorage.setItem(VIEW_KEY, next).catch((e) =>
      console.warn('Could not save view', e),
    );
  }, []);

  return {view, setView, restored};
};
