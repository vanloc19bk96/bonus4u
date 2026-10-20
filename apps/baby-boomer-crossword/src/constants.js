'use strict';

const PT = 72;
const MIN_LINE_PT = 0.75;
// KDP-safe margins (above minimums) — red dashed overlay uses these
const OUTSIDE_IN = 0.65;
const TOP_IN = 0.75;
const BOTTOM_IN = 0.75;
// Extra breathing room between content and safe-area edge
const CONTENT_INSET_IN = 0.18;
// Page number sits inside safe area, in a reserved band at the bottom
const PAGE_NUM_BAND_IN = 0.28;
const BLEED_IN = 0.125;

const TRIM_SIZES = [
  { id: '6x9', w: 6, h: 9, maxPages: 828 },
  { id: '7x10', w: 7, h: 10, maxPages: 828 },
  { id: '8x10', w: 8, h: 10, maxPages: 828 },
  { id: '8.25x8.25', w: 8.25, h: 8.25, maxPages: 828 },
  { id: '8.5x8.5', w: 8.5, h: 8.5, maxPages: 590 },
  { id: '8.5x11', w: 8.5, h: 11, maxPages: 590 },
  { id: 'a4', w: 8.27, h: 11.69, maxPages: 780 },
];

const GRID_SIZES = [11, 13, 15, 17, 19];

const CELL_SIZES = [
  { id: 'large', label: 'Large print (0.45")', inches: 0.45 },
  { id: 'standard', label: 'Standard (0.35")', inches: 0.35 },
  { id: 'compact', label: 'Compact (0.28")', inches: 0.28 },
];

const GUTTER_BRACKETS = [
  { min: 24, max: 150, gutter: 0.375 },
  { min: 151, max: 300, gutter: 0.5 },
  { min: 301, max: 500, gutter: 0.625 },
  { min: 501, max: 700, gutter: 0.75 },
  { min: 701, max: 828, gutter: 0.875 },
];

const DEFAULT_SETTINGS = {
  bookTitle: '',
  trim: { w: 8.5, h: 11 },
  bleed: false,
  maxGrid: 13,
  cellSize: 0.45, // large print — fixed, not user-selectable
  puzzleTitleFormat: 'Puzzle {n}',
  cluesColumns: 2,
  cluesPlacement: 'same',
  answerKey: true,
  answersPerPage: 4,
    pageNumbers: true,
    seed: 0, // set randomly at runtime
    filledBlocks: false,
  };

function gutterForPageCount(pageCount) {
  const n = Math.max(24, pageCount | 0);
  for (const b of GUTTER_BRACKETS) {
    if (n >= b.min && n <= b.max) return b.gutter;
  }
  return GUTTER_BRACKETS[GUTTER_BRACKETS.length - 1].gutter;
}

function maxPagesForTrim(trim) {
  const found = TRIM_SIZES.find(
    (t) => Math.abs(t.w - trim.w) < 0.01 && Math.abs(t.h - trim.h) < 0.01
  );
  return found ? found.maxPages : 828;
}

function pageSizePts(trim, bleed) {
  const pageW = (trim.w + (bleed ? BLEED_IN : 0)) * PT;
  const pageH = (trim.h + (bleed ? BLEED_IN * 2 : 0)) * PT;
  return { pageW, pageH };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PT,
    MIN_LINE_PT,
    OUTSIDE_IN,
    TOP_IN,
    BOTTOM_IN,
    CONTENT_INSET_IN,
    PAGE_NUM_BAND_IN,
    BLEED_IN,
    TRIM_SIZES,
    GRID_SIZES,
    CELL_SIZES,
    GUTTER_BRACKETS,
    DEFAULT_SETTINGS,
    gutterForPageCount,
    maxPagesForTrim,
    pageSizePts,
  };
}
