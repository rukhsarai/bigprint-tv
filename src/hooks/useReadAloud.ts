import {useCallback, useEffect, useRef, useState} from 'react';

import {
  makeSpeechMarks,
  speechDuration,
  type SpeechMark,
} from '../data/speechMarks';
import type {AudioPlayer} from '../services/audioPlayer';

/** How often the silent fallback clock checks which word should be lit. */
const TICK_MS = 50;

export type ReadAloudSource = {
  /** Polly's timings for this line. Generated locally when absent. */
  marks?: SpeechMark[];
  /** Where the audio is. Without it the words are highlighted silently. */
  audioUrl?: string | null;
};

export type ReadAloudState = {
  /** Index of the line being read, or null when silent. */
  readingLine: number | null;
  /** Index into the current line's speech marks, or -1 before the first word. */
  wordIndex: number;
  /** Marks for the line being read, so the view can split the text. */
  marks: SpeechMark[];
  /** True while real audio is playing (as opposed to the silent highlight). */
  hasAudio: boolean;
  /** Start reading a line. Reading a line that is already playing stops it. */
  toggle: (lineIndex: number, text: string, source?: ReadAloudSource) => void;
  stop: () => void;
};

/**
 * Drives word-by-word highlighting.
 *
 * With an audio player and a URL, the clock is the audio's own position, so
 * the highlight stays in step with Polly's voice. Without either — in tests,
 * on the simulator, or when audio fails to load — a timer walks the marks
 * silently, so the feature still demonstrates and never leaves a dead button.
 */
export const useReadAloud = (player: AudioPlayer | null): ReadAloudState => {
  const [readingLine, setReadingLine] = useState<number | null>(null);
  const [wordIndex, setWordIndex] = useState(-1);
  const [marks, setMarks] = useState<SpeechMark[]>([]);
  const [hasAudio, setHasAudio] = useState(false);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<number>(0);
  const currentLine = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    if (player) {
      player.stop();
    }
    currentLine.current = null;
    setReadingLine(null);
    setWordIndex(-1);
    setMarks([]);
    setHasAudio(false);
  }, [clearTimer, player]);

  const indexAt = (lineMarks: SpeechMark[], elapsed: number) => {
    // The current word is the last one whose start time has passed.
    let next = 0;
    for (let i = 0; i < lineMarks.length; i++) {
      if (lineMarks[i].time <= elapsed) {
        next = i;
      } else {
        break;
      }
    }
    return next;
  };

  const startSilent = useCallback(
    (lineIndex: number, text: string, lineMarks: SpeechMark[]) => {
      const total = speechDuration(text, lineMarks);
      startedAt.current = Date.now();
      setHasAudio(false);
      timer.current = setInterval(() => {
        const elapsed = Date.now() - startedAt.current;
        if (elapsed >= total || currentLine.current !== lineIndex) {
          stop();
          return;
        }
        setWordIndex(indexAt(lineMarks, elapsed));
      }, TICK_MS);
    },
    [stop],
  );

  const toggle = useCallback(
    (lineIndex: number, text: string, source?: ReadAloudSource) => {
      // Pressing the line that is already being read stops it.
      if (currentLine.current === lineIndex) {
        stop();
        return;
      }

      clearTimer();
      if (player) {
        player.stop();
      }
      const lineMarks =
        source?.marks && source.marks.length > 0
          ? source.marks
          : makeSpeechMarks(text);

      currentLine.current = lineIndex;
      setMarks(lineMarks);
      setReadingLine(lineIndex);
      setWordIndex(lineMarks.length > 0 ? 0 : -1);

      if (lineMarks.length === 0) {
        return;
      }

      if (player && source?.audioUrl) {
        setHasAudio(true);
        player.play(source.audioUrl, {
          onTime: (ms) => {
            if (currentLine.current === lineIndex) {
              setWordIndex(indexAt(lineMarks, ms));
            }
          },
          onEnded: () => {
            if (currentLine.current === lineIndex) {
              stop();
            }
          },
          onError: () => {
            // Audio is unavailable: keep the highlight moving so the reader
            // still gets the line, just silently.
            if (currentLine.current === lineIndex) {
              startSilent(lineIndex, text, lineMarks);
            }
          },
        });
        return;
      }

      startSilent(lineIndex, text, lineMarks);
    },
    [clearTimer, player, startSilent, stop],
  );

  // Never leave audio or a timer running after the screen goes away.
  useEffect(
    () => () => {
      clearTimer();
      if (player) {
        player.stop();
      }
    },
    [clearTimer, player],
  );

  return {readingLine, wordIndex, marks, hasAudio, toggle, stop};
};
