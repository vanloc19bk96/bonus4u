/*
 * Amazon KDP paperback rules (help topic GVBQ3CMEQW3W2VL6 "Set trim size, bleed and margins").
 * Black ink on white paper, no bleed. Lengths in inches unless the name says pt.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};

  var TRIMS = [
    { id: '6x9', w: 6, h: 9, label: '6 x 9 in', hint: 'Most popular for puzzle novels' },
    { id: '7x10', w: 7, h: 10, label: '7 x 10 in', hint: 'Roomier pages' },
    { id: '8x10', w: 8, h: 10, label: '8 x 10 in', hint: 'Large, workbook feel' },
    { id: '8.5x11', w: 8.5, h: 11, label: '8.5 x 11 in', hint: 'US Letter, easiest to write in' }
  ];

  // Minimum inside (gutter) margin by total page count.
  var GUTTER = [
    { max: 150, inside: 0.375 },
    { max: 300, inside: 0.5 },
    { max: 500, inside: 0.625 },
    { max: 700, inside: 0.75 },
    { max: 828, inside: 0.875 }
  ];

  var KDP = {
    TRIMS: TRIMS,
    GUTTER: GUTTER,
    MIN_PAGES: 24,
    MAX_PAGES: 828,            // black ink, white paper
    MIN_OUTSIDE: 0.25,         // top, bottom and outside, no bleed
    MIN_FONT_PT: 7,
    MIN_LINE_PT: 0.75,
    MIN_GRAY_FILL: 0.10,       // fills lighter than 10% gray may not print
    GUTTER_SAFETY: 0.125,      // added on top of KDP's minimum gutter
    OUTSIDE: 0.5,              // our outside margin: double the KDP minimum
    TOP: 0.55,
    BOTTOM: 0.6,
    SPINE_PER_PAGE_WHITE: 0.002252,
    SPINE_TEXT_MIN_PAGES: 79,  // KDP allows spine text from 79 pages
    COVER_BLEED: 0.125,

    trim: function (id) {
      for (var i = 0; i < TRIMS.length; i++) if (TRIMS[i].id === id) return TRIMS[i];
      return TRIMS[0];
    },

    minGutter: function (pages) {
      for (var i = 0; i < GUTTER.length; i++) if (pages <= GUTTER[i].max) return GUTTER[i].inside;
      return GUTTER[GUTTER.length - 1].inside;
    },

    // The margins we print with, for a book of this many pages.
    margins: function (pages) {
      return {
        inside: KDP.minGutter(pages) + KDP.GUTTER_SAFETY,
        minInside: KDP.minGutter(pages),
        outside: KDP.OUTSIDE, top: KDP.TOP, bottom: KDP.BOTTOM
      };
    },

    // Full cover size for KDP's cover upload (paperback, white paper).
    cover: function (trimId, pages) {
      var t = KDP.trim(trimId);
      var spine = pages * KDP.SPINE_PER_PAGE_WHITE;
      return {
        spine: spine,
        width: KDP.COVER_BLEED * 2 + t.w * 2 + spine,
        height: KDP.COVER_BLEED * 2 + t.h,
        spineText: pages >= KDP.SPINE_TEXT_MIN_PAGES
      };
    },

    // Page 1 is a right-hand page, so odd pages carry the gutter on the left.
    isRight: function (pageNo) { return pageNo % 2 === 1; }
  };

  LK.kdp = KDP;
})(typeof window !== 'undefined' ? window : globalThis);
