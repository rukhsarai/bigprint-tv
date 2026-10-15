import {makeSpeechMarks, speechDuration} from '../src/data/speechMarks';

describe('speechMarks', () => {
  it('produces one mark per word', () => {
    const marks = makeSpeechMarks('Please pay by 28 October 2026.');
    expect(marks.map((m) => m.value)).toEqual([
      'Please',
      'pay',
      'by',
      '28',
      'October',
      '2026.',
    ]);
  });

  it('gives character offsets that slice the original text exactly', () => {
    // This is what keeps the highlight aligned with real Polly marks.
    const text = 'The amount due is £84.60.';
    for (const mark of makeSpeechMarks(text)) {
      expect(text.slice(mark.start, mark.end)).toBe(mark.value);
    }
  });

  it('starts the first word at zero and moves forward monotonically', () => {
    const marks = makeSpeechMarks('One two three four');
    expect(marks[0].time).toBe(0);
    for (let i = 1; i < marks.length; i++) {
      expect(marks[i].time).toBeGreaterThan(marks[i - 1].time);
    }
  });

  it('handles an empty line without crashing', () => {
    expect(makeSpeechMarks('')).toEqual([]);
    expect(speechDuration('', [])).toBe(0);
  });

  it('reports a duration past the final word', () => {
    const text = 'Thank you for being a customer.';
    const marks = makeSpeechMarks(text);
    expect(speechDuration(text, marks)).toBeGreaterThan(
      marks[marks.length - 1].time,
    );
  });

  it('reads at a pace suited to the audience, not a demo', () => {
    // Twelve words should take several seconds, not a fraction of one.
    const text = 'one two three four five six seven eight nine ten more words';
    const seconds = speechDuration(text, makeSpeechMarks(text)) / 1000;
    expect(seconds).toBeGreaterThan(3);
    expect(seconds).toBeLessThan(12);
  });
});
