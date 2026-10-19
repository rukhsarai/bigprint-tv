import type {ExactLine} from './documents';

/** A paragraph longer than this starts a new one at the next sentence end. */
const SOFT_LIMIT = 280;
/** ...and is cut here even mid-sentence, so one item never fills the screen. */
const HARD_LIMIT = 420;

const ENDS_SENTENCE = /[.!?:;]["')\]]*$/;
const HYPHEN_BREAK = /[A-Za-z]-$/;

/**
 * The page's own words come from OCR one printed line at a time, so a
 * sentence that wrapped on paper ("…for general / use.") arrived split in
 * two, each half its own item with space around it. This joins plain text
 * lines back into sentences and short paragraphs. Headings and table rows
 * stay as they are: their line breaks mean something.
 */
export const toParagraphs = (lines: ExactLine[]): ExactLine[] => {
  const out: ExactLine[] = [];
  let open: string | null = null;

  const close = () => {
    if (open !== null) {
      out.push({text: open, kind: 'text'});
      open = null;
    }
  };

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) {
      continue;
    }
    if (line.kind !== 'text') {
      close();
      out.push({...line, text});
      continue;
    }
    if (open === null) {
      open = text;
    } else if (HYPHEN_BREAK.test(open) && /^[a-z]/.test(text)) {
      // "contin-" + "ued": a word broken across lines.
      open = open.slice(0, -1) + text;
    } else {
      open = `${open} ${text}`;
    }
    const current: string = open;
    if (
      current.length >= HARD_LIMIT ||
      (current.length >= SOFT_LIMIT && ENDS_SENTENCE.test(current))
    ) {
      close();
    }
  }
  close();
  return out;
};
