/*
 * Amazon KDP paperback rules (help topic GVBQ3CMEQW3W2VL6 "Paperback and hardcover specifications"):
 * trim sizes, page-count limits per paper, the inside (gutter) margin by page count, and the
 * full-cover size with its spine. Interior: black ink, no bleed. Lengths in inches.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  var TRIMS = [
    { id: '5.5x8.5', w: 5.5, h: 8.5, label: '5.5 x 8.5 in', hint: 'Handbag size', max: 828 },
    { id: '6x9', w: 6, h: 9, label: '6 x 9 in', hint: 'What the bestsellers use', max: 828 },
    { id: '7x10', w: 7, h: 10, label: '7 x 10 in', hint: 'Roomy, good for large print', max: 828 },
    { id: '8x10', w: 8, h: 10, label: '8 x 10 in', hint: 'Workbook feel', max: 828 },
    { id: '8.5x11', w: 8.5, h: 11, label: '8.5 x 11 in', hint: 'Big pages, easy to write on', max: 590 }
  ];

  var PAPERS = [
    { id: 'white', label: 'White paper', perPage: 0.002252, max: 828 },
    { id: 'cream', label: 'Cream paper', perPage: 0.0025, max: 776 }
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
    PAPERS: PAPERS,
    GUTTER: GUTTER,
    MIN_PAGES: 24,
    MIN_OUTSIDE: 0.25,         // top, bottom and outside, no bleed
    MIN_FONT_PT: 7,
    MIN_LINE_PT: 0.75,
    MIN_GRAY: 0.10,            // ink lighter than 10% gray may not print
    GUTTER_SAFETY: 0.125,      // added on top of KDP's minimum gutter
    OUTSIDE: 0.5,              // double the KDP minimum
    TOP: 0.55,
    BOTTOM: 0.55,
    SPINE_TEXT_MIN_PAGES: 79,  // KDP prints spine text from 79 pages
    COVER_BLEED: 0.125,

    trim: function (id) {
      for (var i = 0; i < TRIMS.length; i++) if (TRIMS[i].id === id) return TRIMS[i];
      return TRIMS[1];
    },
    paper: function (id) {
      for (var i = 0; i < PAPERS.length; i++) if (PAPERS[i].id === id) return PAPERS[i];
      return PAPERS[0];
    },
    // The most pages KDP prints for this trim and paper.
    maxPages: function (trimId, paperId) {
      var t = KDP.trim(trimId), p = KDP.paper(paperId);
      if (t.id === '8.5x11') return p.id === 'cream' ? 550 : 590;
      return p.max;
    },

    minGutter: function (pages) {
      for (var i = 0; i < GUTTER.length; i++) if (pages <= GUTTER[i].max) return GUTTER[i].inside;
      return GUTTER[GUTTER.length - 1].inside;
    },

    // The margins we print with, for a book of this many pages (inches).
    margins: function (pages) {
      return {
        inside: KDP.minGutter(pages) + KDP.GUTTER_SAFETY,
        minInside: KDP.minGutter(pages),
        outside: KDP.OUTSIDE, top: KDP.TOP, bottom: KDP.BOTTOM
      };
    },

    // Full cover size for KDP's cover upload (paperback, 0.125 in bleed all round).
    cover: function (trimId, pages, paperId) {
      var t = KDP.trim(trimId), p = KDP.paper(paperId);
      var spine = pages * p.perPage;
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

  CX.kdp = KDP;
})(typeof window !== 'undefined' ? window : globalThis);
