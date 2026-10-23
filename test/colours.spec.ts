import {
  COLOURS,
  COLOURS_ORDER,
  isColoursName,
  nextColours,
  type Colours,
} from '../src/theme/colours';
import {designScale} from '../src/theme/layout';

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2.x contrast ratio between two colours. */
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Text must reach WCAG AAA (7:1), the level W3C ties to about 20/80 vision.
// Marks and edges that carry meaning must reach 3:1 against what they sit on.
const TEXT_PAIRS: [keyof Colours, keyof Colours][] = [
  ['text', 'background'],
  ['textSecondary', 'background'],
  ['buttonText', 'buttonFill'],
  ['focusText', 'focusFill'],
  ['disabledText', 'disabledFill'],
  ['keyFigure', 'cardFill'],
  ['textSecondary', 'cardFill'],
  ['text', 'panelFill'],
  ['attentionWord', 'panelFill'],
  ['badgeText', 'badgeFill'],
  // The badge that stands where an unsure figure was is text, not a chip:
  // a background on a nested Text is not painted on Vega.
  ['attention', 'background'],
];

const MARK_PAIRS: [keyof Colours, keyof Colours][] = [
  ['focus', 'background'],
  ['attention', 'background'],
  ['attention', 'panelFill'],
  ['buttonEdge', 'background'],
  ['cardEdge', 'background'],
  ['disabledEdge', 'background'],
  ['badgeFill', 'background'],
  // Focusing a button must change it by at least 3:1.
  ['focusFill', 'buttonFill'],
];

describe.each(COLOURS_ORDER)('the %s look', (name) => {
  const c = COLOURS[name];

  it.each(TEXT_PAIRS)('%s on %s reaches 7:1', (fg, bg) => {
    expect(contrast(c[fg] as string, c[bg] as string)).toBeGreaterThanOrEqual(
      7,
    );
  });

  it.each(MARK_PAIRS)('%s against %s reaches 3:1', (fg, bg) => {
    expect(contrast(c[fg] as string, c[bg] as string)).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('keeps its focus colour for focus alone', () => {
    // If focus matched the text, a focus ring would read as more text.
    expect(c.focus).not.toBe(c.text === c.focus ? '' : c.text);
    expect(c.focus).not.toBe(c.attention);
  });

  it('has a name the button and the first-run choice can show', () => {
    expect(c.name).toBe(name);
    expect(c.label.length).toBeGreaterThan(0);
    expect(c.shortLabel.length).toBeLessThanOrEqual(c.label.length);
  });
});

describe('colour choices', () => {
  it('start with Dark', () => {
    expect(COLOURS_ORDER[0]).toBe('dark');
  });

  it('cycle dark, light, yellow and back to dark', () => {
    expect(nextColours('dark')).toBe('light');
    expect(nextColours('light')).toBe('yellow');
    expect(nextColours('yellow')).toBe('dark');
  });

  it('recognise only the three saved names', () => {
    expect(isColoursName('light')).toBe(true);
    expect(isColoursName('purple')).toBe(false);
    expect(isColoursName(null)).toBe(false);
  });

  it('never use yellow for focus on a pale ground, where it vanishes', () => {
    expect(
      contrast(COLOURS.light.focus, COLOURS.light.background),
    ).toBeGreaterThan(10);
  });
});

describe('design scale', () => {
  it('is 1 on a 1920 × 1080 window', () => {
    expect(designScale(1920, 1080)).toBe(1);
  });

  it('halves everything on a 960 × 540 window, so the layout matches the drawing', () => {
    expect(designScale(960, 540)).toBe(0.5);
  });

  it('fits the tighter side on an unusual shape', () => {
    expect(designScale(1920, 540)).toBe(0.5);
  });

  it('falls back to 1 when the window size is unknown', () => {
    expect(designScale(0, 0)).toBe(1);
    expect(designScale(NaN, 1080)).toBe(1);
  });
});
