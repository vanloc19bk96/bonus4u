/*
 * kdp.js: Amazon KDP paperback rules (help pages GVBQ3CMEQW3W2VL6 and G201857950).
 * Pure data and small helpers. Lengths in inches; font sizes and line weights in points.
 */
(function () {
  'use strict';
  window.KS = window.KS || {};

  var TRIMS = [
    { key: '8.5x11', w: 8.5, h: 11, label: '8.5 x 11 in', hint: 'US Letter', maxPages: 590 },
    { key: '8.27x11.69', w: 8.27, h: 11.69, label: '8.27 x 11.69 in', hint: 'A4', maxPages: 780 },
    { key: '8x10', w: 8, h: 10, label: '8 x 10 in', hint: '', maxPages: 828 },
    { key: '7x10', w: 7, h: 10, label: '7 x 10 in', hint: '', maxPages: 828 },
    { key: '6x9', w: 6, h: 9, label: '6 x 9 in', hint: '', maxPages: 828 }
  ];

  // Minimum inside (gutter) margin by total page count.
  var GUTTER_TABLE = [
    { max: 150, inside: 0.375 },
    { max: 300, inside: 0.5 },
    { max: 500, inside: 0.625 },
    { max: 700, inside: 0.75 },
    { max: 828, inside: 0.875 }
  ];

  var KDP = {
    TRIMS: TRIMS,
    GUTTER_TABLE: GUTTER_TABLE,
    MIN_PAGES: 24,
    MIN_FONT_PT: 7,
    MIN_LINE_PT: 0.75,
    MIN_MARGIN: 0.25,        // outside, top and bottom, no bleed
    COMFORT: 0.25,           // the app's defaults add this to every KDP minimum
    DEFAULT_MARGIN: 0.5,
    MAX_MARGIN: 1.5,         // the form's upper limit; more only wastes the page
    MIN_CELL_PT: 24,         // smallest puzzle cell a person can comfortably write in

    trim: function (key) {
      for (var i = 0; i < TRIMS.length; i++) if (TRIMS[i].key === key) return TRIMS[i];
      return TRIMS[0];
    },

    // KDP's minimum gutter for a page count (counts above the table use the last row).
    minGutter: function (pageCount) {
      for (var i = 0; i < GUTTER_TABLE.length; i++) {
        if (pageCount <= GUTTER_TABLE[i].max) return GUTTER_TABLE[i].inside;
      }
      return GUTTER_TABLE[GUTTER_TABLE.length - 1].inside;
    },

    // Page 1 is a right-hand page with its gutter on the left.
    isRightPage: function (pageNumber) { return pageNumber % 2 === 1; }
  };

  KS.KDP = KDP;
})();
