import {useCallback, useEffect, useRef, useState} from 'react';

import {
  makeSpeechMarks,
  speechDuration,
  type SpeechMark,
} from '../data/speechMarks';

/** How often the clock checks which word should be lit. */
const TICK_MS = 50;

export type ReadAloudState = {
  /** Index of the line being read, or null when silent. */
  readingLine: number | null;
  /** Index into the current line's speech marks, or -1 before the first word. */
  wordIndex: number;
  /** Marks for the line being read, so the view can split the text. */
  marks: SpeechMark[];
  /** Start reading a line. Reading a line that is already playing stops it. */
  toggle: (lineIndex: number, text: string) => void;
  stop: () => void;
};

/**
 * Drives word-by-word highlighting from speech marks.
 *
 * Today the clock is a timer, because there is no audio yet. When Polly is
 * wired up, replace the elapsed-time source with the audio element's
 * currentTime — the rest of this hook, and the whole view, stay as they are.
 */
export const useReadAloud = (): ReadAloudState => {
  const [readingLine, setReadingLine] = useState<number | null>(null);
  const [wordIndex, setWordIndex] = useState(-1);
  const [marks, setMarks] = useState<SpeechMark[]>([]);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    setReadingLine(null);
    setWordIndex(-1);
    setMarks([]);
  }, [clearTimer]);

  const toggle = useCallback(
    (lineIndex: number, text: string) => {
      // Pressing the line that is already being read stops it.
      if (timer.current !== null && lineIndex === readingLine) {
        stop();
        return;
      }

      clearTimer();
      const lineMarks = makeSpeechMarks(text);
      const total = speechDuration(text, lineMarks);

      setMarks(lineMarks);
      setReadingLine(lineIndex);
      setWordIndex(lineMarks.length > 0 ? 0 : -1);
      startedAt.current = Date.now();

      if (lineMarks.length === 0) {
        return;
      }

      timer.current = setInterval(() => {
        const elapsed = Date.now() - startedAt.current;

        if (elapsed >= total) {
          stop();
          return;
        }

        // The current word is the last one whose start time has passed.
        let next = 0;
        for (let i = 0; i < lineMarks.length; i++) {
          if (lineMarks[i].time <= elapsed) {
            next = i;
          } else {
            break;
          }
        }
        setWordIndex(next);
      }, TICK_MS);
    },
    [clearTimer, readingLine, stop],
  );

  // Never leave a timer running after the screen goes away.
  useEffect(() => clearTimer, [clearTimer]);

  return {readingLine, wordIndex, marks, toggle, stop};
};
