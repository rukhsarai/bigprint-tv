/**
 * Real documents, produced by running backend/pipeline.py over photographs
 * in the bigprint-tv-dev-ru22 bucket. Regenerate with:
 *
 *     cd backend && python gen_fixtures.py ../src/data/documents.ts
 *
 * These are genuine Textract + Nova output, not hand-written examples, so the
 * app is exercised against the messiness of real OCR.
 */

import type {SpeechMark} from './speechMarks';

export type LineSpeech = {
  /** Polly word timings for this line. */
  marks: SpeechMark[];
  /** Roughly how long the audio lasts; drives the silent fallback. */
  durationMs: number;
};

export type DocumentFact = {
  label: string;
  value: string;
  /** Textract confidence. Anything below 90 was dropped by the pipeline. */
  confidence?: number;
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
  /** True when OCR confidence was low, so the UI warns instead of pretending. */
  lowConfidence: boolean;
  /** Unix seconds when the backend produced it. Absent on fixtures. */
  createdAt?: number;
  /** One entry per line when the backend made audio. Absent on fixtures. */
  speech?: LineSpeech[];
};

/** financial, key facts present. OCR 96.5%, financial=true. */
export const sampleReceipt: ScannedDocument = {
  id: "sampleReceipt",
  kind: "Receipt",
  sender: "AMIN FILLING STATION",
  keyFacts: [
    {label: "Date", value: "20-11-25", confidence: 99.9},
    {label: "Reference", value: "21081", confidence: 96.7},
    {label: "Phone", value: "0313-5715779", confidence: 100.0},
  ],
  lines: [
    "This is a receipt from Amin Filling Station.",
    "The station is located on Swabi Mardan Road, near Ismaila Interchange in Swabi.",
    "You can reach them at 0313-5715779 or 0300-9088376.",
    "The vehicle number is 4082.",
    "The transaction number is 21081.",
    "The date of the transaction is 20-11-25.",
    "The first product purchased is petrol, with a rate of 267.",
    "The amount for petrol is 7700.",
    "The next product is diesel, with a rate of 28.",
    "The amount for diesel is 8.",
    "The next product is HOBS, with a rate of 36.",
    "The amount for HOBS is 1.",
    "The next product is mobile oil, with a rate of 1.",
    "The amount for mobile oil is 1.",
    "The next product is break oil, with a rate of 1.",
    "The amount for break oil is 1.",
    "The next product is filter, with a rate of 1.",
    "The amount for filter is 1.",
    "The next product is S.T.P, with a rate of 1.",
    "The amount for S.T.P is 1.",
    "The next product is car wash, with a rate of 1.",
    "The amount for car wash is 1.",
    "The next product is tyre shop, with a rate of 1.",
    "The amount for tyre shop is 1.",
    "The total amount is 1.",
    "Please sign here to confirm the transaction.",
  ],
  lowConfidence: false,
};

/** non-financial, numbers that must NOT be read as money. OCR 91.2%, financial=false. */
export const sampleCertificate: ScannedDocument = {
  id: "sampleCertificate",
  kind: "Provisional Detailed Marks Certificate",
  sender: "ABDUL WALI KHAN UNIVERSITY MARDAN, DEPARTMENT OF COMPUTER SCIENCE",
  keyFacts: [
  ],
  lines: [
    "Abdul Wali Khan University Mardan, Department of Computer Science.",
    "Provisional detailed marks certificate for Rukhsar, daughter of Bakhtaj.",
    "Roll number 59, Fall semester 2021.",
    "Islamic Studies: 85 out of 100, grade point 3.75.",
    "Principal of Psychology: 84 out of 100, grade point 3.7.",
    "Basic Mathematics: 56 out of 100, grade point 2.3.",
    "Introduction to Biochemistry: 85 out of 100, grade point 3.75.",
    "English Composition & Comprehension: 72 out of 100, grade point 3.1.",
    "Total for Fall 2021: 382 out of 500, GPA 3.32.",
    "Spring 2022 semester.",
    "Introduction to Computing: 70 out of 100, grade point 3.",
    "Pakistan Studies: 72 out of 100, grade point 3.1.",
    "Programming Fundamental: 90 out of 100, grade point 4.",
    "Islamic History: 83 out of 100, grade point 3.65.",
    "Communication Skills: 70 out of 100, grade point 3.",
    "Total for Spring 2022: 385 out of 500, GPA 3.35.",
    "Fall 2022 semester.",
    "Object Oriented Programming: 86 out of 100, grade point 3.8.",
    "GE-Social Sciences-II/ Calculus-I: 66 out of 100, grade point 2.8.",
    "Intro to Networks: 80 out of 100, grade point 3.5.",
    "GE-Natural Science-II/ Discrete Structure: 80 out of 100, grade point 3.5.",
    "Technical writing: 80 out of 100, grade point 3.3.",
    "Total for Fall 2022: 392 out of 500, GPA 3.44.",
    "Spring 2023 semester.",
    "Operating System: 70 out of 100, grade point 3.",
    "Research Methods: 78 out of 100, grade point 3.4.",
    "Introduction to Philosophy: 80 out of 100, grade point 3.5.",
    "Database System: 80 out of 100, grade point 3.5.",
    "Introduction to Physics: 77 out of 100, grade point 3.35.",
    "Data Structure: 80 out of 100, grade point 3.5.",
    "Total for Spring 2023: 465 out of 600, GPA 3.38.",
    "Overall percentage: 77.33, CGPA 3.37.",
    "Errors and omissions are subject to subsequent rectification.",
    "Note: This DMC is for Openlab Summer Student Programme Scholarship only.",
    "Prepared by Mr. Farman Ullah, checked by Mr. Shahzad Alam.",
    "Transcript issued on 25th January 2024.",
    "Chairman, Controller of Examination, Department of Computer Science, Abdul Wali Khan University Mardan.",
  ],
  lowConfidence: false,
};

/** dense page, no sender figures. OCR 97.3%, financial=false. */
export const sampleSchedule: ScannedDocument = {
  id: "sampleSchedule",
  kind: "Event schedule for a conference",
  sender: "UN Women",
  keyFacts: [
  ],
  lines: [
    "Welcome to the Women Digital Empowerment Conference.",
    "The event is scheduled for the 20th of November, 2025.",
    "On the second day, there will be a session on action and innovation.",
    "At 9:00 AM, there will be a registration for participant check-in and welcome.",
    "At 9:30 AM, the opening will feature informal networking among students, startups, and industry guests.",
    "At 9:45 AM, there will be a presentation showcasing digitalization initiatives by students from various universities.",
    "At 11:30 AM, there will be an idea exchange with interactive sessions with MSMEs and mentors.",
    "At 2:00 PM, there will be a networking lunch for informal networking.",
    "The event is organized by UN Women, CR, KOICA, CD, and DCR.",
    "The speakers include Zoha Waqas, Co-founder of playeuneure LUMS, Lahore, and Ayesha Mukhtar, Solar Panel and Energy Solutions, Multan.",
    "The event is supported by SMEDA, Karandaaz, Accelerate Prosperity, TIE, Karavan C, Jazz, Telenor, and Easypaisa i2i.",
    "The event is hosted by UN Women KP and Punjab Offices.",
  ],
  lowConfidence: false,
};

/** 61.8% OCR — the low-confidence path. OCR 61.8%, financial=true. */
export const samplePoorScan: ScannedDocument = {
  id: "samplePoorScan",
  kind: "Invoice",
  sender: "ROBERTSON",
  keyFacts: [
  ],
  lines: [
    "Invoice number DGPR06 145.",
    "Ship to Rukhsai Bro Ahmad Taj.",
    "Customer order number Shanbaz Gami Mardan Zie Photostate Shop GGPP25032806189.",
    "Address is Mardan 23200.",
    "Attention to ROBERTSON Shm Prom.",
    "Attention 63R.",
    "Total amount due is CMPOOUT.",
    "Ship via outside system.",
    "Order quantity is 10, SKU is GOCPGAEB300813, item is IGG BK SM Scholar Tee.",
    "Order quantity is 10, SKU is GGCPGC 80205999, item is (GG.BN) TOPS 2020 Person Pough.",
    "Order quantity is 3, SKU is GOCPGBPH167899, item is GG/GNI Google Duffer Bag Green.",
    "Order quantity is 3, SKU is 000PG0CQ185798, item is GG WT Google Hardcover Journal White.",
    "Order quantity is 1, SKU is 3GCPG0AJ206099, item is IGG GRI TOPS 2020 Pen.",
    "There are 3 more items listed.",
  ],
  lowConfidence: true,
};

export const sampleDocuments: ScannedDocument[] = [sampleReceipt, sampleCertificate, sampleSchedule, samplePoorScan];
