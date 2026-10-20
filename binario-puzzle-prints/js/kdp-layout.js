/*!
 * kdp-layout.js — KDP trim sizes, margins, page maths and validation.
 *
 * Everything in here is measured in INCHES, matching jsPDF's unit setting.
 * Source for the numbers: KDP Help, "Set Trim Size, Bleed, and Margins".
 *
 * This module owns the whole page plan. pdf-export.js and preview.js both
 * consume the same plan, which is what keeps the on-screen preview honest
 * about what will come out of the PDF.
 *
 * Exposes window.KdpLayout. Classic script, no modules (spec 2).
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------- spec 4.1 trim sizes --
   * Paperback, black ink on white paper — the only combination this app
   * targets. `max` is the page ceiling for that combination.
   */
  var TRIMS = [
    { id: '5x8',        w: 5,    h: 8,     mm: '127 × 203.2',   min: 24, max: 828, cls: 'Regular' },
    { id: '5.06x7.81',  w: 5.06, h: 7.81,  mm: '128.5 × 198.4', min: 24, max: 828, cls: 'Regular' },
    { id: '5.25x8',     w: 5.25, h: 8,     mm: '133.4 × 203.2', min: 24, max: 828, cls: 'Regular' },
    { id: '5.5x8.5',    w: 5.5,  h: 8.5,   mm: '139.7 × 215.9', min: 24, max: 828, cls: 'Regular' },
    { id: '6x9',        w: 6,    h: 9,     mm: '152.4 × 228.6', min: 24, max: 828, cls: 'Regular', star: true },
    { id: '6.14x9.21',  w: 6.14, h: 9.21,  mm: '156 × 233.9',   min: 24, max: 828, cls: 'Large' },
    { id: '6.69x9.61',  w: 6.69, h: 9.61,  mm: '169.9 × 244.1', min: 24, max: 828, cls: 'Large' },
    { id: '7x10',       w: 7,    h: 10,    mm: '177.8 × 254',   min: 24, max: 828, cls: 'Large', star: true },
    { id: '7.44x9.69',  w: 7.44, h: 9.69,  mm: '189 × 246.1',   min: 24, max: 828, cls: 'Large' },
    { id: '7.5x9.25',   w: 7.5,  h: 9.25,  mm: '190.5 × 235',   min: 24, max: 828, cls: 'Large' },
    { id: '8x10',       w: 8,    h: 10,    mm: '203.2 × 254',   min: 24, max: 828, cls: 'Large' },
    { id: '8.25x6',     w: 8.25, h: 6,     mm: '209.6 × 152.4', min: 24, max: 800, cls: 'Large' },
    { id: '8.25x8.25',  w: 8.25, h: 8.25,  mm: '209.6 × 209.6', min: 24, max: 800, cls: 'Large' },
    { id: '8.5x8.5',    w: 8.5,  h: 8.5,   mm: '215.9 × 215.9', min: 24, max: 590, cls: 'Large' },
    { id: '8.5x11',     w: 8.5,  h: 11,    mm: '215.9 × 279.4', min: 24, max: 590, cls: 'Large', star: true },
    { id: 'a4',         w: 8.27, h: 11.69, mm: '210 × 297',     min: 24, max: 780, cls: 'Large', label: 'A4' }
  ];
  var DEFAULT_TRIM = '8.5x11';

  function trimById(id) {
    for (var i = 0; i < TRIMS.length; i++) if (TRIMS[i].id === id) return TRIMS[i];
    return null;
  }

  function trimLabel(t) {
    var name = t.label ? (t.w + ' × ' + t.h + ' in (' + t.label + ')') : (t.w + ' × ' + t.h + ' in');
    return (t.star ? '★ ' : '') + name;
  }

  /* ------------------------------------------------------ spec 4.3 / 4.4 --
   * Gutter minimum by total interior page count. No bleed anywhere in this
   * app, so the PDF page size is exactly the trim size (spec 4.2).
   */
  function gutterMin(pageCount) {
    if (pageCount <= 150) return 0.375;
    if (pageCount <= 300) return 0.5;
    if (pageCount <= 500) return 0.625;
    if (pageCount <= 700) return 0.75;
    return 0.875;
  }

  var MARGIN = {
    top: 0.65,        // comfortably above the 0.25 in minimum
    bottom: 0.65,
    outside: 0.50,
    insideExtra: 0.25 // gutter headroom on top of the KDP minimum
  };
  var HARD_MIN_MARGIN = 0.25;   // spec 4.3, outside/top/bottom with no bleed

  function insideMargin(pageCount) { return gutterMin(pageCount) + MARGIN.insideExtra; }

  /* -------------------------------------------------- spec 4.5 mirroring --
   * The gutter sits on the binding side, which alternates. Odd PDF pages are
   * right-hand (recto) so the binding is on their LEFT; even pages are
   * left-hand (verso) so the binding is on their RIGHT.
   */
  function pageMargins(pageNumber, pageCount) {
    var inside = insideMargin(pageCount);
    var isRecto = pageNumber % 2 === 1;
    return {
      left: isRecto ? inside : MARGIN.outside,
      right: isRecto ? MARGIN.outside : inside,
      top: MARGIN.top,
      bottom: MARGIN.bottom,
      gutterSide: isRecto ? 'left' : 'right'
    };
  }

  /* --------------------------------------------------- spec 5.1 constants -- */
  var HEADER_H = 0.45;        // "Puzzle 12 · 10×10 · Medium"
  var FOOTER_H = 0.35;        // page number
  var GAP = 0.35;             // between puzzle blocks on a page
  var EDGE_PAD = 0.08;        // breathing room inside each block vs safe area
  var MIN_CELL = 0.28;        // below this, print is uncomfortably small
  var MAX_CELL = 0.60;        // above this looks silly; centre the grid instead
  var MIN_CELL_SOL = 0.14;    // solution grids may be smaller
  var CIRCLE_R_RATIO = 0.36;
  var CAPTION_H = 0.22;       // caption line under a grid when perPage > 1

  var PER_PAGE_GRID = { 1: [1, 1], 2: [1, 2], 4: [2, 2] };

  /** Solutions are always 4 per page (2×2). */
  function solutionGrid(/* n */) { return [2, 2]; }
  function solutionsPerPage(n) { var g = solutionGrid(n); return g[0] * g[1]; }

  /* ------------------------------------------------ spec 5.2 cell sizing -- */

  /**
   * Fit `cols × rows` grids of n×n cells into the content area.
   * Grids are centred inside their block, horizontally and vertically.
   * `edgePad` shrinks the usable block so every density keeps a thin gap from
   * the safe-area edge instead of kissing it on either side.
   */
  function layoutBlocks(opts) {
    var contentW = opts.contentW, contentH = opts.contentH;
    var cols = opts.cols, rows = opts.rows, n = opts.n;
    var captionH = opts.captionH || 0;
    var maxCell = opts.maxCell || MAX_CELL;
    var pad = opts.edgePad || 0;

    var blockW = (contentW - GAP * (cols - 1)) / cols;
    var blockH = (contentH - GAP * (rows - 1)) / rows;
    var cell = Math.min(
      Math.max(0, blockW - 2 * pad) / n,
      Math.max(0, blockH - captionH - 2 * pad) / n,
      maxCell
    );

    return {
      cell: cell, cols: cols, rows: rows,
      blockW: blockW, blockH: blockH,
      contentW: contentW, contentH: contentH,
      captionH: captionH,
      edgePad: pad,
      gridSize: cell * n
    };
  }

  /** spec 5.2 — the puzzle-page case, with header and footer reserved. */
  function layoutPage(o) {
    var contentW = o.trimW - o.margins.left - o.margins.right;
    var contentH = o.trimH - o.margins.top - o.margins.bottom - HEADER_H - FOOTER_H;
    var grid = PER_PAGE_GRID[o.perPage];
    return layoutBlocks({
      contentW: contentW, contentH: contentH,
      cols: grid[0], rows: grid[1], n: o.n,
      captionH: o.perPage > 1 ? CAPTION_H : 0,
      edgePad: EDGE_PAD
    });
  }

  /**
   * Solution pages carry no running header (spec 7 gives them only a caption
   * per grid and the page number), so the header band goes back to the grids.
   * Always 2×2 with the same edge pad as 4-puzzle pages so grids clear the
   * safe-area dashed box.
   */
  function layoutSolutionPage(o) {
    var contentW = o.trimW - o.margins.left - o.margins.right;
    var contentH = o.trimH - o.margins.top - o.margins.bottom - FOOTER_H;
    var grid = solutionGrid(o.n);
    return layoutBlocks({
      contentW: contentW, contentH: contentH,
      cols: grid[0], rows: grid[1], n: o.n,
      captionH: CAPTION_H,
      maxCell: MAX_CELL,
      edgePad: EDGE_PAD
    });
  }

  /* ============================================ spec 7 — the page plan ====
   * Page count does not depend on the gutter (puzzles-per-page is user-chosen),
   * so one pass is enough: count pages, look up the gutter, then lay out
   * (spec 4.6 note 4).
   */
  function planBook(opts) {
    var trim = trimById(opts.trimId) || trimById(DEFAULT_TRIM);
    var count = opts.count, perPage = opts.perPage, n = opts.n;
    var errors = [], warnings = [];

    var pages = [];
    function push(kind, extra) {
      var p = { kind: kind, number: pages.length + 1 };
      if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) p[k] = extra[k];
      pages.push(p);
      return p;
    }

    // --- front matter ------------------------------------------------------
    // Title (and optional How to Play) run straight into the puzzles — no
    // intervening blank leaves. Padding blanks still appear at the end so the
    // total stays even and ≥ 24 (spec 4.6).
    push('title');
    if (opts.howTo) push('howto');

    // --- puzzle pages ------------------------------------------------------
    var puzzlePages = Math.ceil(count / perPage);
    for (var i = 0; i < puzzlePages; i++) {
      push('puzzles', { from: i * perPage + 1, to: Math.min(count, (i + 1) * perPage) });
    }

    // --- SOLUTIONS divider, which must land on a recto (odd) page ----------
    if ((pages.length + 1) % 2 === 0) push('blank');
    push('divider');

    // --- solution pages ----------------------------------------------------
    var solPer = solutionsPerPage(n);
    var solPages = Math.ceil(count / solPer);
    for (var s = 0; s < solPages; s++) {
      push('solutions', { from: s * solPer + 1, to: Math.min(count, (s + 1) * solPer) });
    }

    // --- padding (spec 4.6): at least 24 pages, and an even total ----------
    while (pages.length < 24) push('blank');
    if (pages.length % 2 === 1) push('blank');

    var pageCount = pages.length;

    // Folios only on content pages after the front matter (title / how-to).
    // Blank padding pages stay truly blank.
    for (var q = 0; q < pages.length; q++) {
      var pg = pages[q];
      pg.footer = pg.kind === 'puzzles' || pg.kind === 'solutions' || pg.kind === 'divider';
      pg.margins = pageMargins(pg.number, pageCount);
    }

    // --- validation --------------------------------------------------------
    if (pageCount > trim.max) {
      errors.push('Book is ' + pageCount + ' pages, over the ' + trim.max +
        '-page limit for ' + trim.w + ' × ' + trim.h + ' in. Reduce the puzzle count, ' +
        'increase puzzles per page, or pick a different trim size.');
    }

    var margins = pageMargins(1, pageCount);   // recto; left/right sum is the same on verso
    var puzzleLayout = layoutPage({ trimW: trim.w, trimH: trim.h, margins: margins, perPage: perPage, n: n });
    var solLayout = layoutSolutionPage({ trimW: trim.w, trimH: trim.h, margins: margins, n: n });

    // spec 5.4
    if (puzzleLayout.cell < MIN_CELL) {
      errors.push('⚠️ Cells are too small to print clearly (' + puzzleLayout.cell.toFixed(3) + '" < ' +
        MIN_CELL.toFixed(2) + '"). Pick a larger trim size, fewer puzzles per page, ' +
        'or a smaller grid.');
    }
    if (solLayout.cell < MIN_CELL_SOL) {
      errors.push('⚠️ Solution cells are too small (' + solLayout.cell.toFixed(3) + '" < ' +
        MIN_CELL_SOL.toFixed(2) + '"). Pick a larger trim size or a smaller grid.');
    }
    if (puzzleLayout.contentH <= 0 || puzzleLayout.contentW <= 0) {
      errors.push('Trim size is too small for the margins — no room left for content.');
    }

    var inside = insideMargin(pageCount);
    if (MARGIN.outside < HARD_MIN_MARGIN || MARGIN.top < HARD_MIN_MARGIN || MARGIN.bottom < HARD_MIN_MARGIN) {
      errors.push('Margins are below KDP’s 0.25 in minimum.');   // guards edits to MARGIN
    }

    return {
      trim: trim,
      n: n,
      count: count,
      perPage: perPage,
      pages: pages,
      pageCount: pageCount,
      gutter: gutterMin(pageCount),
      inside: inside,
      outside: MARGIN.outside,
      puzzleLayout: puzzleLayout,
      solutionLayout: solLayout,
      solutionsPerPage: solPer,
      errors: errors,
      warnings: warnings,
      ok: errors.length === 0
    };
  }

  /** spec 6.2 — the one read-only summary line shown under the form. */
  function summaryLine(plan) {
    var t = plan.trim;
    var bits = [
      t.w + ' × ' + t.h + ' in',
      plan.count + ' puzzles',
      plan.perPage + '/page',
      plan.pageCount + ' pages',
      'inside margin ' + plan.inside.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '"',
      'outside margin ' + plan.outside + '"'
    ];
    return '📖 ' + bits.join(' · ') + (plan.ok ? ' ✅ KDP-ready' : ' ❌ Not KDP-ready');
  }

  /**
   * Which puzzles-per-page densities keep puzzle cells ≥ MIN_CELL for this
   * trim / grid / count. Used by the form to disable options that would fail
   * print-clarity validation, so the user never lands on "Not KDP-ready" from
   * an oversized-per-page choice.
   */
  function fittingPerPages(opts) {
    var out = {};
    var candidates = [1, 2, 4];
    for (var i = 0; i < candidates.length; i++) {
      var pp = candidates[i];
      var trial = planBook({
        trimId: opts.trimId,
        n: opts.n,
        count: opts.count,
        perPage: pp,
        howTo: opts.howTo
      });
      out[pp] = trial.puzzleLayout.cell >= MIN_CELL &&
        trial.solutionLayout.cell >= MIN_CELL_SOL;
    }
    return out;
  }

  /** Largest of 1 / 2 / 4 that still prints clearly; falls back to the request. */
  function clampPerPage(opts) {
    var fit = fittingPerPages(opts);
    if (fit[opts.perPage]) return opts.perPage;
    if (fit[4]) return 4;
    if (fit[2]) return 2;
    if (fit[1]) return 1;
    return opts.perPage;
  }

  var GRID_SIZES = [6, 8, 10, 12, 14];

  /** True when this grid still clears MIN_CELL at 1 puzzle per page. */
  function gridFitsTrim(opts, n) {
    var trial = planBook({
      trimId: opts.trimId,
      n: n,
      count: opts.count,
      perPage: 1,
      howTo: opts.howTo
    });
    return trial.puzzleLayout.cell >= MIN_CELL &&
      trial.solutionLayout.cell >= MIN_CELL_SOL;
  }

  /**
   * Largest grid ≤ the request that still prints clearly at 1/page on this
   * trim. Falls back to the request when even 6×6 cannot fit (should not
   * happen on any KDP paperback trim we ship).
   */
  function clampGridSize(opts) {
    if (gridFitsTrim(opts, opts.n)) return opts.n;
    for (var i = GRID_SIZES.length - 1; i >= 0; i--) {
      var n = GRID_SIZES[i];
      if (n < opts.n && gridFitsTrim(opts, n)) return n;
    }
    return opts.n;
  }

  global.KdpLayout = {
    TRIMS: TRIMS,
    DEFAULT_TRIM: DEFAULT_TRIM,
    GRID_SIZES: GRID_SIZES,
    trimById: trimById,
    trimLabel: trimLabel,
    gutterMin: gutterMin,
    insideMargin: insideMargin,
    pageMargins: pageMargins,
    layoutBlocks: layoutBlocks,
    layoutPage: layoutPage,
    layoutSolutionPage: layoutSolutionPage,
    solutionGrid: solutionGrid,
    solutionsPerPage: solutionsPerPage,
    planBook: planBook,
    summaryLine: summaryLine,
    fittingPerPages: fittingPerPages,
    clampPerPage: clampPerPage,
    gridFitsTrim: gridFitsTrim,
    clampGridSize: clampGridSize,
    MARGIN: MARGIN,
    HARD_MIN_MARGIN: HARD_MIN_MARGIN,
    HEADER_H: HEADER_H,
    FOOTER_H: FOOTER_H,
    GAP: GAP,
    EDGE_PAD: EDGE_PAD,
    MIN_CELL: MIN_CELL,
    MAX_CELL: MAX_CELL,
    MIN_CELL_SOL: MIN_CELL_SOL,
    CIRCLE_R_RATIO: CIRCLE_R_RATIO,
    CAPTION_H: CAPTION_H
  };
})(typeof window !== 'undefined' ? window : this);
