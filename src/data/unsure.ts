/**
 * A money figure the backend would not put its name to.
 *
 * When Textract's reading of an amount is below the confidence floor, or the
 * second reader vetoes it, the pipeline keeps the sentence and takes the
 * figure out, leaving `UNSURE_MARK` where it stood (see `mask_uncertain_money`
 * in backend/pipeline.py). The alternative, printing the figure anyway under a
 * "some words were hard to read" warning, states as fact the one thing this
 * app exists not to get wrong.
 *
 * On screen the mark becomes a badge inside the line; for the screen reader
 * and for Polly it becomes words, because a reader who is listening cannot see
 * a badge.
 */
export const UNSURE_MARK = '{{unsure}}';

/** What the badge says on screen. Short: it sits inside a sentence. */
export const UNSURE_LABEL = 'hard to read — check the paper';

/** What the screen reader says in place of the figure. */
export const UNSURE_SPOKEN = 'a figure that was too hard to read';

/** The line as a voice should say it, with the mark put into words. */
export const spokenLine = (text: string): string =>
  text.split(UNSURE_MARK).join(UNSURE_SPOKEN);

/**
 * The line split for rendering: the text between the marks. Two pieces mean
 * one mark, three mean two, and a line with no mark comes back as itself.
 */
export const unsureParts = (text: string): string[] => text.split(UNSURE_MARK);
