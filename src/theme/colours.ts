/**
 * The three looks a viewer can choose between.
 *
 * Why three: light text on black reads faster for people whose eyes scatter
 * light (common with age and cataract), dark text on a light ground suits many
 * others and bright rooms, and yellow on black is the TV high-contrast style.
 * Preference differs even within one eye condition, so the choice belongs to
 * the viewer. Dark is the default. The research and contrast ratios are on the
 * design canvas ("Colour research", "Three themes").
 *
 * Rules every theme keeps, which the screens rely on:
 * - Letters never change colour when a line is focused. Focus is a thick
 *   ring around the line.
 * - `focus` is used for focus and nothing else, so it always means "you are
 *   here".
 * - Problems are panels with an icon and a first word, never colour alone.
 * test/colours.spec.ts checks every pair below against WCAG contrast.
 */

export type ColoursName = 'dark' | 'light' | 'yellow';

export type Colours = {
  name: ColoursName;
  /** Spoken and shown on the first-run choice. */
  label: string;
  /** Fits on the Colours button. */
  shortLabel: string;
  /** One sentence for the first-run choice. */
  description: string;

  background: string;
  text: string;
  textSecondary: string;

  /** Ring around a focused line or tile. Nothing else uses it. */
  focus: string;
  /** A focused button fills with this. */
  focusFill: string;
  focusText: string;
  focusEdge: string;

  /** Edge and icon of a Problem or Check panel. */
  attention: string;
  /** Colour of the first word, "Problem" or "Check". */
  attentionWord: string;
  panelFill: string;

  buttonFill: string;
  buttonText: string;
  buttonEdge: string;

  disabledFill: string;
  disabledText: string;
  disabledEdge: string;

  /** Key-figure cards, the status line and other quiet containers. */
  cardFill: string;
  cardEdge: string;
  keyFigure: string;

  /** Numbered step circles on the pairing screen. */
  badgeFill: string;
  badgeText: string;

  /** Edge of the white frame round the QR code. */
  qrEdge: string;
};

const dark: Colours = {
  name: 'dark',
  label: 'Dark',
  shortLabel: 'Dark',
  description:
    'White letters on black. Often easier if bright lights or white screens bother you, or with cataracts.',
  background: '#000000',
  text: '#FFFFFF',
  textSecondary: '#CCCCCC',
  focus: '#FFD400',
  focusFill: '#FFD400',
  focusText: '#000000',
  focusEdge: '#FFFFFF',
  attention: '#FF9A3C',
  attentionWord: '#FFFFFF',
  panelFill: '#000000',
  buttonFill: '#222222',
  buttonText: '#FFFFFF',
  buttonEdge: '#AAAAAA',
  disabledFill: '#000000',
  disabledText: '#CCCCCC',
  disabledEdge: '#767676',
  cardFill: '#000000',
  cardEdge: '#767676',
  keyFigure: '#FFFFFF',
  badgeFill: '#FFFFFF',
  badgeText: '#000000',
  qrEdge: '#FFFFFF',
};

const light: Colours = {
  name: 'light',
  label: 'Light',
  shortLabel: 'Light',
  description:
    'Dark letters on a light background, like paper. Often easier in a bright room.',
  // Off-white rather than pure white is a comfort choice, not a proven glare
  // reduction; #111111 on it is still 16.6:1.
  background: '#F2F0EB',
  text: '#111111',
  textSecondary: '#4A4A4A',
  // Yellow vanishes on a pale ground (1.3:1), so focus here is black.
  focus: '#111111',
  focusFill: '#111111',
  focusText: '#FFFFFF',
  focusEdge: '#111111',
  attention: '#7A2C00',
  attentionWord: '#7A2C00',
  panelFill: '#FFFFFF',
  buttonFill: '#FFFFFF',
  buttonText: '#111111',
  buttonEdge: '#4A4A4A',
  disabledFill: '#F2F0EB',
  disabledText: '#4A4A4A',
  disabledEdge: '#767676',
  cardFill: '#FFFFFF',
  cardEdge: '#767676',
  keyFigure: '#111111',
  badgeFill: '#111111',
  badgeText: '#FFFFFF',
  qrEdge: '#111111',
};

const yellow: Colours = {
  name: 'yellow',
  label: 'Yellow on black',
  shortLabel: 'Yellow',
  description:
    'Yellow letters on black, the high-contrast TV style. Some people find it the sharpest.',
  background: '#000000',
  text: '#FFD400',
  textSecondary: '#CCCCCC',
  // The text is already yellow, so focus is white here.
  focus: '#FFFFFF',
  focusFill: '#FFFFFF',
  focusText: '#000000',
  focusEdge: '#FFFFFF',
  attention: '#FF9A3C',
  attentionWord: '#FFFFFF',
  panelFill: '#000000',
  buttonFill: '#222222',
  buttonText: '#FFD400',
  buttonEdge: '#AAAAAA',
  disabledFill: '#000000',
  disabledText: '#CCCCCC',
  disabledEdge: '#767676',
  cardFill: '#000000',
  cardEdge: '#767676',
  keyFigure: '#FFFFFF',
  badgeFill: '#FFFFFF',
  badgeText: '#000000',
  qrEdge: '#FFFFFF',
};

export const COLOURS: Record<ColoursName, Colours> = {dark, light, yellow};

/** The order the Colours button and the first-run choice go through. */
export const COLOURS_ORDER: ColoursName[] = ['dark', 'light', 'yellow'];

export const DEFAULT_COLOURS: ColoursName = 'dark';

export const isColoursName = (value: unknown): value is ColoursName =>
  typeof value === 'string' && (COLOURS_ORDER as string[]).includes(value);

/** The look after this one, wrapping round. */
export const nextColours = (name: ColoursName): ColoursName =>
  COLOURS_ORDER[(COLOURS_ORDER.indexOf(name) + 1) % COLOURS_ORDER.length];
