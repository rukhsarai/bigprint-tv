import {toParagraphs} from '../src/data/paragraphs';

describe('toParagraphs', () => {
  it('joins printed lines back into sentences', () => {
    expect(
      toParagraphs([
        {text: 'Apply a small amount over the face for general', kind: 'text'},
        {text: 'use. Avoid the eye', kind: 'text'},
        {text: 'contour.', kind: 'text'},
      ]),
    ).toEqual([
      {text: 'Apply a small amount over the face for general use. Avoid the eye contour.', kind: 'text'},
    ]);
  });

  it('keeps headings and table rows on their own', () => {
    expect(
      toParagraphs([
        {text: 'Directions', kind: 'heading'},
        {text: 'Use daily', kind: 'text'},
        {text: 'Item: Cream; Price: 9.99', kind: 'row'},
        {text: 'and rinse.', kind: 'text'},
      ]).map((l) => l.kind),
    ).toEqual(['heading', 'text', 'row', 'text']);
  });

  it('mends a word broken with a hyphen', () => {
    expect(
      toParagraphs([
        {text: 'Please contin-', kind: 'text'},
        {text: 'ue to take it.', kind: 'text'},
      ])[0].text,
    ).toBe('Please continue to take it.');
  });

  it('starts a new paragraph after a long run, at a sentence end', () => {
    const sentence = 'This sentence is about sixty characters long, give or take.';
    const lines = Array.from({length: 12}, () => ({text: sentence, kind: 'text' as const}));
    const out = toParagraphs(lines);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((p) => p.text.length <= 420)).toBe(true);
    expect(out.every((p) => p.text.endsWith('.'))).toBe(true);
  });
});
