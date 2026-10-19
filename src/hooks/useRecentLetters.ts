import {useCallback, useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type {ScannedDocument} from '../data/documents';

const RECENT_KEY = 'bigprint.recent';
/** Enough to get back to a page or two; few enough to be a short list. */
export const MAX_RECENT = 10;
/** Letters are private post: they are not kept on the TV for long. */
export const KEEP_DAYS = 7;
const KEEP_MS = KEEP_DAYS * 24 * 60 * 60 * 1000;

export type RecentLetter = {
  document: ScannedDocument;
  /** Milliseconds since the epoch, when it was last on screen. */
  seenAt: number;
};

const isLetter = (value: unknown): value is RecentLetter => {
  const v = value as RecentLetter;
  return (
    !!v &&
    typeof v.seenAt === 'number' &&
    !!v.document &&
    typeof v.document.id === 'string' &&
    typeof v.document.kind === 'string' &&
    Array.isArray(v.document.lines) &&
    Array.isArray(v.document.keyFacts)
  );
};

const fresh = (letters: RecentLetter[], now: number) =>
  letters.filter((l) => now - l.seenAt < KEEP_MS).slice(0, MAX_RECENT);

/**
 * The last few letters, kept on this TV only. Pressing Next photo by mistake
 * should not mean photographing the same page again: that is another
 * Textract and Bedrock bill, and another wait. Opening a letter from here
 * sends nothing anywhere.
 *
 * Kept on the device, never on the backend (which forgets everything after a
 * day), for at most a week and at most ten letters, and the list can be
 * deleted from the screen.
 */
export const useRecentLetters = (now: () => number = Date.now) => {
  const [letters, setLetters] = useState<RecentLetter[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(RECENT_KEY);
        const parsed: unknown = saved ? JSON.parse(saved) : [];
        if (active && Array.isArray(parsed)) {
          setLetters(fresh(parsed.filter(isLetter), now()));
        }
      } catch (e) {
        console.warn('Could not read recent letters', e);
      }
    })();
    return () => {
      active = false;
    };
  }, [now]);

  const save = (next: RecentLetter[]) => {
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch((e) =>
      console.warn('Could not save recent letters', e),
    );
  };

  const remember = useCallback(
    (document: ScannedDocument) => {
      setLetters((current) => {
        const next = fresh(
          [
            {document, seenAt: now()},
            ...current.filter((l) => l.document.id !== document.id),
          ],
          now(),
        );
        save(next);
        return next;
      });
    },
    [now],
  );

  const clear = useCallback(() => {
    setLetters([]);
    AsyncStorage.removeItem(RECENT_KEY).catch((e) =>
      console.warn('Could not delete recent letters', e),
    );
  }, []);

  return {letters, remember, clear};
};

/** "Bill from Severn Water", or just "Birthday card". */
export const letterTitle = (document: ScannedDocument) =>
  document.sender ? `${document.kind} from ${document.sender}` : document.kind;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** "Today 10:42", "Yesterday 18:05", or "Mon 14:30" within the week. */
export const whenSeen = (seenAt: number, now: number = Date.now()) => {
  const seen = new Date(seenAt);
  const today = new Date(now);
  const time = `${pad(seen.getHours())}:${pad(seen.getMinutes())}`;
  const dayStart = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayStart(today) - dayStart(seen)) / 86400000);
  if (days <= 0) {
    return `Today ${time}`;
  }
  if (days === 1) {
    return `Yesterday ${time}`;
  }
  return `${DAYS[seen.getDay()]} ${time}`;
};
