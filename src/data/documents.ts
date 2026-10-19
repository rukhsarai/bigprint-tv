/**
 * Real documents, produced by the deployed backend (Textract + Nova + the
 * numeric and currency guards) from public sample receipts and letters. The
 * raw results live in backend/fixtures/; regenerate this file with:
 *
 *     python backend/gen_fixtures.py
 *
 * They are genuine pipeline output, not hand-written examples, so the app is
 * exercised against the messiness of real OCR. Nothing here came from
 * anyone's private post.
 */

export type DocumentFact = {
  label: string;
  value: string;
  /** Textract confidence. Anything below 90 was dropped by the pipeline. */
  confidence?: number;
};

/** One line of the page's own words, as printed. */
export type ExactLine = {
  text: string;
  /** A title or section header, ordinary text, or a row of a table. */
  kind: 'heading' | 'text' | 'row';
};

export type ScannedDocument = {
  id: string;
  /** What kind of document this is, in plain words. */
  kind: string;
  /** Who sent it. Absent for things with no sender, like a card or a label. */
  sender?: string;
  /**
   * Figures a reader must not get wrong. Pinned on screen and never scrolled
   * past. Empty for documents that have none — the pipeline only extracts
   * these when the document is classified as a bill or receipt.
   */
  keyFacts: DocumentFact[];
  /** Body text, rewritten into plain English, already split into lines. */
  lines: string[];
  /** The main points only, a few short sentences. Absent on older results. */
  summary?: string[];
  /** The page's own words in reading order. Absent on older results. */
  exact?: ExactLine[];
  /** True when OCR confidence was low, so the UI warns instead of pretending. */
  lowConfidence: boolean;
  /** Unix seconds when the backend produced it. Absent on fixtures. */
  createdAt?: number;
};

/** financial, every figure cross-checked. */
export const sampleReceipt: ScannedDocument = {
  id: "doc-1792119062-7c5592cdb1fb",
  kind: "Receipt",
  sender: "Brewers Restaurant and Sports Bar",
  keyFacts: [
    {label: "Total", value: "26.91", confidence: 100},
    {label: "Date", value: "3/17/2017", confidence: 100},
    {label: "Reference", value: "834-5", confidence: 100},
    {label: "Phone", value: "928-783-0073", confidence: 99.6},
  ],
  lines: [
    "This is a receipt from Brewers Restaurant and Sports Bar.",
    "The total amount to pay is 26.91.",
    "The order number is 834-5.",
    "The table number is 315.",
    "The server was Steve A.",
    "The date of the order is March 17, 2017.",
    "The time of the order is 1:13 PM.",
    "One BLT Sandwich costs 8.99.",
    "Tater Tots cost 0.99.",
    "One Corned Beef Tacos cost 7.99.",
    "One Side Fries cost 2.99.",
    "The subtotal is 20.96.",
    "The tax is 2.18.",
    "The 18% gratuity is 3.77.",
    "More items are listed on the receipt.",
  ],
  lowConfidence: false,
};

/** non-financial, numbers that must NOT be read as money. */
export const sampleLetter: ScannedDocument = {
  id: "doc-1792119069-128e4de31004",
  kind: "Recipe for biscotti",
  keyFacts: [
  ],
  lines: [
    "This is a recipe for biscotti.",
    "Knead the milk into the flour mix until dough forms.",
    "Add milk if necessary.",
    "Put dough on a lightly floured surface.",
    "Knead the dough 7 or 8 times.",
    "Do not overwork the dough.",
    "Roll the dough to the desired thickness.",
    "Cut biscotti out with a cookie cutter or canning ring.",
    "Cooking times vary by thickness and oven, 14 to 20 minutes.",
    "The most important ingredient is love.",
  ],
  lowConfidence: false,
};

/** dense page with a table, flagged low confidence. */
export const sampleInvoice: ScannedDocument = {
  id: "doc-1792119078-a9fb3af69ba5",
  kind: "Tax Invoice",
  sender: "XYZ CO.",
  keyFacts: [
    {label: "Total", value: "27140", confidence: 93.7},
  ],
  lines: [
    "This is a Tax Invoice from XYZ CO.",
    "The total amount due is 27140.",
    "The bank account details are provided for payment.",
    "More items are listed in the table, but they are garbled and cannot be read.",
  ],
  lowConfidence: true,
};

/** tiny blurry photo, the low-confidence path. */
export const samplePoorScan: ScannedDocument = {
  id: "doc-1792119066-129c812a47b3",
  kind: "Receipt",
  keyFacts: [
    {label: "Total", value: "$116.37", confidence: 100},
  ],
  lines: [
    "This is a receipt from Drder ESCATE.",
    "The subtotal is 100 dollars 50 cents.",
    "The tax is 1 dollar 87 cents.",
    "The total is 116 dollars 37 cents.",
    "The order balance due is 116 dollars 37 cents.",
    "On 2/19/18, you ordered 1/185 for 5 dollars.",
    "You ordered I for 3 dollars 50 cents.",
    "You ordered trass! serouts for 7 dollars 25 cents.",
    "You ordered Floot orange and for 7 dollars.",
    "You ordered Stone N for 1 dollar.",
    "You ordered any City 11 to PUB for 7 dollars.",
    "You ordered grilled theere for 1 dollar.",
    "You ordered 1 taxe for 4 dollars 50 cents.",
    "You ordered tawntos for 6 dollars 25 cents.",
    "You ordered a blank item for 15 dollars.",
    "You ordered Stuffed Shells for 14 dollars.",
    "You ordered a blank item for 70 dollars.",
    "You ordered chaffie for 10 dollars.",
    "More items are listed.",
  ],
  lowConfidence: true,
};

export const sampleDocuments: ScannedDocument[] = [sampleReceipt, sampleLetter, sampleInvoice, samplePoorScan];
