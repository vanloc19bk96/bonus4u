/*
 * kdp.js: Amazon KDP paperback interior rules (help page GVBQ3CMEQW3W2VL6, plus the
 * print-quality guide for the 7 pt / 0.75 pt minimums). Pure data + small helpers.
 * Lengths in inches, font sizes and line weights in points.
 */
(function () {
  'use strict';
  window.WF = window.WF || {};

  // maxPages: KDP caps 8.5 x 11 and 8.5 x 8.5 at 590 pages; the A4-size large trim is
  // treated the same way to stay on the safe side.
  var TRIMS = [
    { key: '8.5x11', w: 8.5, h: 11, label: '8.5 x 11 in (US Letter)', recommended: true, maxPages: 590 },
    { key: '8.27x11.69', w: 8.27, h: 11.69, label: '8.27 x 11.69 in (A4)', recommended: true, maxPages: 590 },
    { key: '8x10', w: 8, h: 10, label: '8 x 10 in', recommended: true },
    { key: '7x10', w: 7, h: 10, label: '7 x 10 in', recommended: true },
    { key: '6x9', w: 6, h: 9, label: '6 x 9 in', recommended: true },
    { key: '5x8', w: 5, h: 8, label: '5 x 8 in' },
    { key: '5.06x7.81', w: 5.06, h: 7.81, label: '5.06 x 7.81 in' },
    { key: '5.25x8', w: 5.25, h: 8, label: '5.25 x 8 in' },
    { key: '5.5x8.5', w: 5.5, h: 8.5, label: '5.5 x 8.5 in' },
    { key: '6.14x9.21', w: 6.14, h: 9.21, label: '6.14 x 9.21 in' },
    { key: '6.69x9.61', w: 6.69, h: 9.61, label: '6.69 x 9.61 in' },
    { key: '7.44x9.69', w: 7.44, h: 9.69, label: '7.44 x 9.69 in' },
    { key: '7.5x9.25', w: 7.5, h: 9.25, label: '7.5 x 9.25 in' },
    { key: '8.25x6', w: 8.25, h: 6, label: '8.25 x 6 in (landscape)' },
    { key: '8.25x8.25', w: 8.25, h: 8.25, label: '8.25 x 8.25 in' },
    { key: '8.5x8.5', w: 8.5, h: 8.5, label: '8.5 x 8.5 in', maxPages: 590 }
  ];

  // Inside (gutter) margin by final page count.
  var GUTTER_TABLE = [
    { min: 24, max: 150, inside: 0.375 },
    { min: 151, max: 300, inside: 0.5 },
    { min: 301, max: 500, inside: 0.625 },
    { min: 501, max: 700, inside: 0.75 },
    { min: 701, max: 828, inside: 0.875 }
  ];

  var KDP = {
    TRIMS: TRIMS,
    GUTTER_TABLE: GUTTER_TABLE,
    MIN_PAGES: 24,
    MAX_PAGES: 828,
    MIN_FONT_PT: 7,
    MIN_LINE_PT: 0.75,
    BLEED_W: 0.125,        // added to the page width (outside edge only)
    BLEED_H: 0.25,         // added to the page height (0.125 top + 0.125 bottom)
    OUTSIDE_NO_BLEED: 0.25,
    OUTSIDE_BLEED: 0.375,
    COMFORT_EXTRA: 0.125,  // "Comfortable" preset adds this on every side

    trimByKey: function (key) {
      for (var i = 0; i < TRIMS.length; i++) if (TRIMS[i].key === key) return TRIMS[i];
      return TRIMS[0];
    },

    maxPages: function (trim) { return trim.maxPages || KDP.MAX_PAGES; },

    // Row of the gutter table for a page count (clamped to the first/last row).
    gutterRow: function (pageCount) {
      for (var i = 0; i < GUTTER_TABLE.length; i++) {
        if (pageCount <= GUTTER_TABLE[i].max) return GUTTER_TABLE[i];
      }
      return GUTTER_TABLE[GUTTER_TABLE.length - 1];
    },

    // Margins measured from the trim edge. Measuring the bleed-case 0.375" from the trim
    // (not from the bleed edge) is stricter than KDP asks, so it is always safe.
    margins: function (pageCount, bleed, preset) {
      var row = KDP.gutterRow(pageCount);
      var extra = preset === 'minimum' ? 0 : KDP.COMFORT_EXTRA;
      return {
        inside: row.inside + extra,
        outside: (bleed ? KDP.OUTSIDE_BLEED : KDP.OUTSIDE_NO_BLEED) + extra,
        kdpInside: row.inside,
        kdpOutside: bleed ? KDP.OUTSIDE_BLEED : KDP.OUTSIDE_NO_BLEED,
        row: row
      };
    },

    pageSize: function (trim, bleed) {
      return bleed
        ? { w: trim.w + KDP.BLEED_W, h: trim.h + KDP.BLEED_H }
        : { w: trim.w, h: trim.h };
    },

    // Page 1 is a right-hand (recto) page; its gutter is on the left.
    sideOf: function (pageNumber) { return pageNumber % 2 === 1 ? 'right' : 'left'; }
  };

  WF.KDP = KDP;
})();
