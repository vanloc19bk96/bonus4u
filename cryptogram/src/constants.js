'use strict';

const IN = 72;
const VERSION = '1.0';

const TRIM_SIZES = [
  { id: '5x8', label: '5 × 8', w: 5, h: 8, klass: 'regular', star: false },
  { id: '5.06x7.81', label: '5.06 × 7.81', w: 5.06, h: 7.81, klass: 'regular', star: false },
  { id: '5.25x8', label: '5.25 × 8', w: 5.25, h: 8, klass: 'regular', star: false },
  { id: '5.5x8.5', label: '5.5 × 8.5 ★', w: 5.5, h: 8.5, klass: 'regular', star: true },
  { id: '6x9', label: '6 × 9 ★', w: 6, h: 9, klass: 'regular', star: true },
  { id: '6.14x9.21', label: '6.14 × 9.21', w: 6.14, h: 9.21, klass: 'large', star: false },
  { id: '6.69x9.61', label: '6.69 × 9.61', w: 6.69, h: 9.61, klass: 'large', star: false },
  { id: '7x10', label: '7 × 10', w: 7, h: 10, klass: 'large', star: false },
  { id: '7.44x9.69', label: '7.44 × 9.69', w: 7.44, h: 9.69, klass: 'large', star: false },
  { id: '7.5x9.25', label: '7.5 × 9.25', w: 7.5, h: 9.25, klass: 'large', star: false },
  { id: '8x10', label: '8 × 10', w: 8, h: 10, klass: 'large', star: false },
  { id: '8.25x6', label: '8.25 × 6', w: 8.25, h: 6, klass: 'large', star: false },
  { id: '8.25x8.25', label: '8.25 × 8.25', w: 8.25, h: 8.25, klass: 'large', star: false },
  { id: '8.5x8.5', label: '8.5 × 8.5', w: 8.5, h: 8.5, klass: 'large', star: false },
  { id: '8.5x11', label: '8.5 × 11 ★', w: 8.5, h: 11, klass: 'large', star: true },
  { id: '8.27x11.69', label: '8.27 × 11.69 (A4)', w: 8.27, h: 11.69, klass: 'large', star: false },
];

const PAPER_TYPES = {
  white: { label: 'Black ink / white paper', min: 24, maxDefault: 828 },
  cream: { label: 'Black ink / cream paper', min: 24, maxDefault: 776 },
  groundwood: { label: 'Black ink / groundwood', min: 24, maxDefault: 812 },
};

function maxPagesFor(trimId, paper) {
  const base = PAPER_TYPES[paper] || PAPER_TYPES.white;
  if (trimId === '8.25x6' || trimId === '8.25x8.25') {
    if (paper === 'cream') return 750;
    if (paper === 'groundwood') return 784;
    return 800;
  }
  if (trimId === '8.5x8.5' || trimId === '8.5x11') {
    if (paper === 'cream') return 550;
    if (paper === 'groundwood') return 578;
    return 590;
  }
  if (trimId === '8.27x11.69') {
    if (paper === 'cream') return 730;
    if (paper === 'groundwood') return 764;
    return 780;
  }
  return base.maxDefault;
}

const DIFFICULTY = {
  easy: { minLen: 25, maxLen: 90, reveal: 3, aids: ['hint'] },
  medium: { minLen: 70, maxLen: 140, reveal: 2, aids: ['hint'] },
  hard: { minLen: 120, maxLen: 200, reveal: 0, aids: [] },
  expert: { minLen: 150, maxLen: 260, reveal: 0, aids: [], numeric: true },
};

const CELL_SIZE_LADDER = [20, 18, 16, 14, 12, 10];
const LARGE_PRINT_MIN_CELL = 22;
const DIVIDER_GAP_IN = 0.35;
const MIN_PAGES = 24;
const ALLOWED_CHARS = /^[A-Z .,!?;:'"-]+$/;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Soft inset inside the KDP content box so type isn't flush to the margin line (~0.2") */
const CONTENT_INSET_IN = 0.2;

/**
 * KDP-oriented type scale for instructional / front-matter pages (pt).
 * Regular trims (~6×9): body ~11 pt. Large trims (8.5×11 etc.): body ~13 pt.
 * Large-print mode: body ≥16 pt (Amazon large-print convention).
 */
function printTypeScale(trimId, largePrint) {
  const trim = TRIM_SIZES.find((t) => t.id === trimId);
  const isLarge = !!(trim && trim.klass === 'large');
  if (largePrint) {
    return {
      sectionTitle: isLarge ? 26 : 22,
      body: isLarge ? 16 : 14,
      bodyLead: isLarge ? 24 : 21,
      paraGap: isLarge ? 18 : 14,
      caption: isLarge ? 13 : 11,
      mono: isLarge ? 16 : 14,
      measureIn: isLarge ? 6.75 : 5.5,
    };
  }
  return {
    sectionTitle: isLarge ? 22 : 16,
    body: isLarge ? 13 : 11,
    bodyLead: isLarge ? 20 : 16,
    paraGap: isLarge ? 16 : 12,
    caption: isLarge ? 11 : 9,
    mono: isLarge ? 14 : 12,
    measureIn: isLarge ? 6.5 : 5.25,
  };
}

const DEFAULT_CONFIG = {
  version: VERSION,
  book: {
    title: 'Cryptogram Puzzles',
    subtitle: 'Decode the Hidden Wisdom',
    volume: '1',
    author: '',
    publisher: '',
    year: new Date().getFullYear(),
    isbn: '',
  },
  format: { trim: '8.5x11', paper: 'white', bleed: false, largePrint: false },
  puzzles: {
    count: 100,
    perPage: 4,
    mix: { easy: 30, medium: 40, hard: 30, expert: 0 },
    order: 'progressive',
    freshKeyPerPuzzle: true,
    allowReciprocal: false,
    numericVariant: false,
    stripPunctuation: false,
    source: 'builtin',
    theme: 'any',
    seed: 48211,
  },
  layout: {
    gutterPad: 0.125,
    outerMargin: 0.5,
    cellSizeMax: 20,
    showPageNumbers: true,
  },
  sections: {
    howToSolve: true,
    worksheet: true,
    dedication: false,
    notesEvery: 0,
    solutionsPerPage: 20,
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    IN, VERSION, TRIM_SIZES, PAPER_TYPES, maxPagesFor, DIFFICULTY,
    CELL_SIZE_LADDER, LARGE_PRINT_MIN_CELL, DIVIDER_GAP_IN, MIN_PAGES,
    ALLOWED_CHARS, LETTERS, CONTENT_INSET_IN, printTypeScale, DEFAULT_CONFIG,
  };
}
