/*
 * constants.js — single source of truth for KDP print rules and book layout.
 *
 * Nothing in this file may be duplicated elsewhere. Preview, pagination,
 * validation and PDF export all read these values.
 *
 * Verified against Amazon KDP documentation:
 *   https://kdp.amazon.com/en_US/help/topic/G201834180       (trim sizes / page counts)
 *   https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6 (bleed + margins)
 *   https://kdp.amazon.com/en_US/help/topic/G201857950        (paperback submission)
 */
(function (global) {
  'use strict';

  /** 1 inch = 72 PDF points. The only unit conversion in the project. */
  var POINTS_PER_INCH = 72;

  /**
   * Standard KDP paperback trim sizes for black ink on white paper.
   * `maxPages` is per-profile — never use one global maximum.
   */
  var KDP_TRIM_SIZES = {
    '5x8':        { label: '5" × 8"',                 widthIn: 5,    heightIn: 8,     minPages: 24, maxPages: 828, category: 'regular' },
    '5.06x7.81':  { label: '5.06" × 7.81"',           widthIn: 5.06, heightIn: 7.81,  minPages: 24, maxPages: 828, category: 'regular' },
    '5.25x8':     { label: '5.25" × 8"',              widthIn: 5.25, heightIn: 8,     minPages: 24, maxPages: 828, category: 'regular' },
    '5.5x8.5':    { label: '5.5" × 8.5"',             widthIn: 5.5,  heightIn: 8.5,   minPages: 24, maxPages: 828, category: 'regular' },
    '6x9':        { label: '6" × 9"',                 widthIn: 6,    heightIn: 9,     minPages: 24, maxPages: 828, category: 'regular' },
    '6.14x9.21':  { label: '6.14" × 9.21"',           widthIn: 6.14, heightIn: 9.21,  minPages: 24, maxPages: 828, category: 'large'   },
    '6.69x9.61':  { label: '6.69" × 9.61"',           widthIn: 6.69, heightIn: 9.61,  minPages: 24, maxPages: 828, category: 'large'   },
    '7x10':       { label: '7" × 10"',                widthIn: 7,    heightIn: 10,    minPages: 24, maxPages: 828, category: 'large'   },
    '7.44x9.69':  { label: '7.44" × 9.69"',           widthIn: 7.44, heightIn: 9.69,  minPages: 24, maxPages: 828, category: 'large'   },
    '7.5x9.25':   { label: '7.5" × 9.25"',            widthIn: 7.5,  heightIn: 9.25,  minPages: 24, maxPages: 828, category: 'large'   },
    '8x10':       { label: '8" × 10"',                widthIn: 8,    heightIn: 10,    minPages: 24, maxPages: 828, category: 'large'   },
    '8.25x6':     { label: '8.25" × 6" (Landscape)',  widthIn: 8.25, heightIn: 6,     minPages: 24, maxPages: 800, category: 'large'   },
    '8.25x8.25':  { label: '8.25" × 8.25" (Square)',  widthIn: 8.25, heightIn: 8.25,  minPages: 24, maxPages: 800, category: 'large'   },
    '8.27x11.69': { label: '8.27" × 11.69" (A4)',     widthIn: 8.27, heightIn: 11.69, minPages: 24, maxPages: 780, category: 'large'   },
    '8.5x8.5':    { label: '8.5" × 8.5" (Square)',    widthIn: 8.5,  heightIn: 8.5,   minPages: 24, maxPages: 590, category: 'large'   },
    '8.5x11':     { label: '8.5" × 11"',              widthIn: 8.5,  heightIn: 11,    minPages: 24, maxPages: 590, category: 'large'   }
  };

  var DEFAULT_TRIM_ID = '8.5x11';

  /** A trim is "large" if wider than 6.12 in or taller than 9 in. */
  var LARGE_TRIM_WIDTH_IN = 6.12;
  var LARGE_TRIM_HEIGHT_IN = 9;

  /** KDP custom paperback trim bounds (advanced; page limits are not published). */
  var CUSTOM_TRIM_BOUNDS = { minWidthIn: 4, maxWidthIn: 8.5, minHeightIn: 6, maxHeightIn: 11.69 };

  /** Minimum inside/gutter margin by final page count. `upTo` is inclusive. */
  var KDP_GUTTER_TABLE = [
    { upTo: 150, gutterIn: 0.375 },
    { upTo: 300, gutterIn: 0.5 },
    { upTo: 500, gutterIn: 0.625 },
    { upTo: 700, gutterIn: 0.75 },
    { upTo: 828, gutterIn: 0.875 }
  ];

  /** Minimum outside/top/bottom margin. */
  var KDP_MIN_OUTSIDE_NO_BLEED_IN = 0.25;
  var KDP_MIN_OUTSIDE_BLEED_IN = 0.375;

  /**
   * Bleed. Added to the outside edge, top and bottom — never to the gutter.
   * PDF page = (trim width + 0.125) x (trim height + 0.25).
   */
  var BLEED_IN = 0.125;

  /** Design margins sit safely inside the KDP minimums. */
  var DESIGN_MARGIN_IN = {
    top: 0.5,
    bottom: 0.5,
    outside: 0.5,
    insideFloor: 0.5,
    insideSafetyBuffer: 0.125
  };

  /** KDP asks for >= 7 pt text; we hold to stricter product minimums. */
  var MIN_FONT_PT = { body: 10, puzzleDigit: 14, footer: 9, heading: 16 };

  /** Shared layout geometry, in inches unless the name says otherwise. */
  var BOOK_LAYOUT = {
    headerHeightIn: 0.30,
    headerGapIn: 0.16,
    footerHeightIn: 0.26,
    footerGapIn: 0.14,
    /** Extra inset for copyright/instruction text, inside the safe-area content box. */
    frontMatterInsetIn: 0.2,
    /** Slight inset for puzzle cards and the answer key, inside the safe-area content box. */
    bodyInsetIn: 0.12,
    cardGapIn: 0.30,
    cardPadXIn: 0.06,
    cardTitleGapIn: 0.14,

    // Guess-grid proportions, all expressed as multiples of the square cell
    // size so one `cell` value drives the whole card.
    pegDiameterRatio: 0.28,
    pegPitchRatio: 0.36,
    pegLeadGapRatio: 0.30,
    /** Outline thickness as a fraction of a clue symbol's diameter. */
    pegStrokeRatio: 0.17,
    /** Inline clue symbol in body text, as a fraction of the font size. */
    inlinePegDiameterRatio: 0.54,
    /** How far an inline symbol's centre sits above the text baseline. */
    inlinePegBaselineRatio: 0.30,
    digitFontRatio: 0.55,
    gridLineRatio: 0.030,
    minGridLineIn: 0.010,
    maxGridLineIn: 0.020,

    cardTitlePt: 12,
    headerPt: 10,
    footerPt: 10,
    bodyPt: 11.5,
    bodyLeadingRatio: 1.45,
    headingPt: 18,
    answerPt: 11,
    answerLineIn: 0.30,
    answerColGapIn: 0.28,
    answerMinColWidthIn: 1.30,
    /** Gap between an answer's number and its code. */
    answerLabelGapIn: 0.14
  };

  /** Puzzle densities offered, highest first — `Auto` walks this list. */
  var DENSITY_OPTIONS = [
    { value: 4, cols: 2, rows: 2 },
    { value: 2, cols: 1, rows: 2 },
    { value: 1, cols: 1, rows: 1 }
  ];

  /** Difficulty presets. Every preset still requires a unique solution. */
  var MODE_PRESETS = {
    classic: { label: 'Classic', codeLength: 4, digitMin: 1, digitMax: 7, allowDuplicates: true,  minClues: 5, maxClues: 7 },
    easy:    { label: 'Easy',    codeLength: 4, digitMin: 1, digitMax: 6, allowDuplicates: false, minClues: 6, maxClues: 8 },
    medium:  { label: 'Medium',  codeLength: 4, digitMin: 1, digitMax: 7, allowDuplicates: true,  minClues: 5, maxClues: 7 },
    hard:    { label: 'Hard',    codeLength: 4, digitMin: 0, digitMax: 9, allowDuplicates: true,  minClues: 5, maxClues: 6 }
  };

  var PUZZLE_LIMITS = {
    codeLengthMin: 3,
    codeLengthMax: 6,
    digitMin: 0,
    digitMax: 9,
    clueRowsMin: 4,
    clueRowsMax: 8,
    /**
     * Uniqueness is proved by complete enumeration of the candidate universe,
     * so the universe has to stay enumerable in a browser tab.
     */
    maxUniverse: 400000
  };

  var PROJECT_FILE_VERSION = 2;

  global.NCB_CONST = {
    POINTS_PER_INCH: POINTS_PER_INCH,
    KDP_TRIM_SIZES: KDP_TRIM_SIZES,
    DEFAULT_TRIM_ID: DEFAULT_TRIM_ID,
    LARGE_TRIM_WIDTH_IN: LARGE_TRIM_WIDTH_IN,
    LARGE_TRIM_HEIGHT_IN: LARGE_TRIM_HEIGHT_IN,
    CUSTOM_TRIM_BOUNDS: CUSTOM_TRIM_BOUNDS,
    KDP_GUTTER_TABLE: KDP_GUTTER_TABLE,
    KDP_MIN_OUTSIDE_NO_BLEED_IN: KDP_MIN_OUTSIDE_NO_BLEED_IN,
    KDP_MIN_OUTSIDE_BLEED_IN: KDP_MIN_OUTSIDE_BLEED_IN,
    BLEED_IN: BLEED_IN,
    DESIGN_MARGIN_IN: DESIGN_MARGIN_IN,
    MIN_FONT_PT: MIN_FONT_PT,
    BOOK_LAYOUT: BOOK_LAYOUT,
    DENSITY_OPTIONS: DENSITY_OPTIONS,
    MODE_PRESETS: MODE_PRESETS,
    PUZZLE_LIMITS: PUZZLE_LIMITS,
    PROJECT_FILE_VERSION: PROJECT_FILE_VERSION
  };
})(window);
