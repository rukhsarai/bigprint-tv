/**
 * Word timings for read-aloud highlighting.
 *
 * The shape mirrors an AWS Polly speech mark of type "word", so when the real
 * backend arrives you replace the generator with Polly's response and nothing
 * downstream changes:
 *
 *   {"time":373,"type":"word","start":5,"end":10,"value":"world"}
 *
 * Polly returns these alongside the audio when you request
 * SpeechMarkTypes=["word"], which is what makes word-synced highlighting
 * possible at all.
 */
export type SpeechMark = {
  /** Milliseconds from the start of the audio. */
  time: number;
  type: 'word';
  /** Character offset of the word in the source text. */
  start: number;
  /** Character offset just past the word. */
  end: number;
  value: string;
};

/** Roughly 140 words per minute — unhurried, which suits this audience. */
const BASE_MS = 230;
const PER_CHAR_MS = 55;

const wordDuration = (word: string) =>
  Math.max(280, BASE_MS + word.length * PER_CHAR_MS);

/**
 * Stand-in for Polly. Produces plausible timings from the text itself so the
 * highlight can be built and tested before any AWS call exists.
 */
export const makeSpeechMarks = (text: string): SpeechMark[] => {
  const marks: SpeechMark[] = [];
  const pattern = /\S+/g;
  let elapsed = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const value = match[0];
    marks.push({
      time: elapsed,
      type: 'word',
      start: match.index,
      end: match.index + value.length,
      value,
    });
    elapsed += wordDuration(value);
  }

  return marks;
};

/** Total time the line takes to speak, used to clear the highlight at the end. */
export const speechDuration = (text: string, marks: SpeechMark[]): number => {
  if (marks.length === 0) {
    return 0;
  }
  const last = marks[marks.length - 1];
  return last.time + wordDuration(last.value);
};
