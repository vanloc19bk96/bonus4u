/*!
 * pdf-export.js — assembles the print-ready KDP interior PDF with jsPDF.
 *
 * Units are INCHES throughout (jsPDF `unit: 'in'`); font sizes stay in points,
 * which is how jsPDF wants them regardless of the document unit.
 *
 * Two rules govern everything here:
 *   - Vectors only. Never rasterise a grid to a canvas image (spec 5.5).
 *   - Pure black and pure white only, no transparency, no gradients (spec 4.8).
 *
 * Exposes window.PdfExport. Classic script, no modules (spec 2).
 */
(function (global) {
  'use strict';

  var K = global.KdpLayout;

  /* -------------------------------------------------------- typography -- */
  var FONT = 'NotoSans';
  var PT = {
    title: 30,
    subtitle: 14,
    divider: 30,
    header: 10,       // spec 7 — bold
    footer: 9,        // spec 7 — regular
    caption: 9,
    body: 11,
    bodyLead: 0.235,  // inches between body lines
    howtoHead: 18,
    exampleLabel: 10
  };

  /* ------------------------------------------------- spec 4.8 line widths --
   * Minimum for print is 0.25 pt; these are the recommended values. jsPDF
   * measures line width in the document unit, so points must be divided by 72.
   */
  var LW = { grid: 0.5 / 72, border: 1.2 / 72, circle: 0.6 / 72 };

  /* --------------------------------------- spec 7.1 worked 6×6 example ----
   * Hard-coded so the How to Play page is always identical and always correct.
   * Verified: the solution satisfies all three rules and the clues admit
   * exactly one solution (test/qa.js re-checks both on every run).
   */
  var EXAMPLE = {
    n: 6,
    clues: [
      null, null, null, 0, 0, null,
      1, 1, null, null, null, null,
      null, 0, null, null, null, 1,
      0, null, null, null, null, null,
      null, 0, 1, null, null, null,
      null, null, 0, 0, null, null
    ],
    solution: [
      1, 0, 1, 0, 0, 1,
      1, 1, 0, 1, 0, 0,
      0, 0, 1, 0, 1, 1,
      0, 1, 0, 1, 1, 0,
      1, 0, 1, 1, 0, 0,
      0, 1, 0, 0, 1, 1
    ]
  };

  var HOWTO_TITLE = 'How to Play Binario';
  var HOWTO_INTRO = 'Fill every empty cell with either a white circle or a black circle, so that:';
  var HOWTO_RULES = [
    '1.  Each row and each column contains an equal number of white and black circles.',
    '2.  No more than two circles of the same colour may sit next to each other, in any row or column.',
    '3.  No two rows are identical, and no two columns are identical.'
  ];
  var HOWTO_CLOSE = 'Every puzzle has exactly one solution, and can be solved by logic alone — you never need to guess.';

  var TIER_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

  /* ------------------------------------------------------------ helpers -- */

  function slug(s) {
    return (s || 'binario').toString().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'binario';
  }

  /**
   * spec 4.7 — KDP rejects non-embedded fonts, and jsPDF's built-in
   * Helvetica/Times are standard-14 fonts that never get embedded. Register a
   * real TTF and select it before any text is drawn.
   */
  function registerFonts(doc) {
    if (typeof global.NOTO_SANS_BASE64 !== 'string' || typeof global.NOTO_SANS_BOLD_BASE64 !== 'string') {
      throw new Error('Font module vendor/font-notosans.js did not load — cannot embed fonts.');
    }
    doc.addFileToVFS('NotoSans-Regular.ttf', global.NOTO_SANS_BASE64);
    doc.addFont('NotoSans-Regular.ttf', FONT, 'normal');
    doc.addFileToVFS('NotoSans-Bold.ttf', global.NOTO_SANS_BOLD_BASE64);
    doc.addFont('NotoSans-Bold.ttf', FONT, 'bold');
    doc.setFont(FONT, 'normal');
  }

  function setText(doc, size, weight) {
    doc.setFont(FONT, weight || 'normal');
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
  }

  /* ------------------------------------------------- spec 5.5 grid drawing -- */

  function drawGrid(doc, o) {
    var x = o.x, y = o.y, n = o.n, cell = o.cell, cells = o.cells;
    var size = n * cell, i, row, col;

    doc.setDrawColor(0, 0, 0);

    doc.setLineWidth(LW.grid);                      // 1. cell separators
    for (i = 1; i < n; i++) {
      doc.line(x + i * cell, y, x + i * cell, y + size);
      doc.line(x, y + i * cell, x + size, y + i * cell);
    }

    doc.setLineWidth(LW.border);                    // 2. outer border, last so it stays crisp
    doc.rect(x, y, size, size);

    var r = cell * K.CIRCLE_R_RATIO;                // 3. circles
    doc.setLineWidth(LW.circle);
    for (row = 0; row < n; row++) {
      for (col = 0; col < n; col++) {
        var v = cells[row * n + col];
        if (v === null || v === undefined) continue;
        var cx = x + col * cell + cell / 2;
        var cy = y + row * cell + cell / 2;
        if (v === 1) { doc.setFillColor(0, 0, 0); doc.circle(cx, cy, r, 'F'); }
        else { doc.setFillColor(255, 255, 255); doc.circle(cx, cy, r, 'FD'); }
      }
    }
  }

  /* --------------------------------------------------------- page parts -- */

  function drawFooter(doc, page, trim) {
    if (!page.footer) return;
    setText(doc, PT.footer, 'normal');
    // Baseline inside the reserved footer band, which is the last FOOTER_H of
    // the content area — not below the bottom margin.
    doc.text(String(page.number), trim.w / 2, trim.h - page.margins.bottom - 0.10, { align: 'center' });
  }

  function drawHeader(doc, text, page, trim) {
    setText(doc, PT.header, 'bold');
    doc.text(text, trim.w / 2, page.margins.top + 0.22, { align: 'center' });
  }

  function drawTitlePage(doc, page, trim, meta) {
    var cx = trim.w / 2;
    var contentW = trim.w - page.margins.left - page.margins.right;

    setText(doc, PT.title, 'bold');
    var titleLines = doc.splitTextToSize(meta.title || 'Binario Puzzles', contentW);
    var titleLead = PT.title / 72 * 1.25;
    var blockH = titleLines.length * titleLead;

    var subLines = null;
    var subLead = PT.subtitle / 72 * 1.35;
    if (meta.subtitle) {
      setText(doc, PT.subtitle, 'normal');
      subLines = doc.splitTextToSize(meta.subtitle, contentW);
      blockH += 0.28 + subLines.length * subLead;
    }

    // Centre the whole title block on the page (horizontal + vertical).
    var y = (trim.h - blockH) / 2 + PT.title / 72 * 0.85;
    setText(doc, PT.title, 'bold');
    for (var i = 0; i < titleLines.length; i++) {
      doc.text(titleLines[i], cx, y, { align: 'center' });
      y += titleLead;
    }

    if (subLines) {
      y += 0.28;
      setText(doc, PT.subtitle, 'normal');
      for (var j = 0; j < subLines.length; j++) {
        doc.text(subLines[j], cx, y, { align: 'center' });
        y += subLead;
      }
    }
  }

  function drawDividerPage(doc, page, trim) {
    setText(doc, PT.divider, 'bold');
    doc.text('SOLUTIONS', trim.w / 2, trim.h * 0.45, { align: 'center' });
  }

  /* --------------------------------------------------- text measurement --
   * Preview SVG paints with the UI sans stack; the PDF embeds Noto Sans.
   * Those faces have different advances, so wrapping MUST use the same
   * measurer as the renderer or lines break early and look half-empty.
   */
  var SCREEN_FONT = 'Inter, "Segoe UI", Helvetica, Arial, sans-serif';
  var measureDoc = null;
  var measureCtx = null;

  function getMeasureDoc() {
    if (measureDoc) return measureDoc;
    var jsPDFCtor = (global.jspdf && global.jspdf.jsPDF) || global.jsPDF;
    if (!jsPDFCtor) throw new Error('vendor/jspdf.umd.min.js did not load.');
    measureDoc = new jsPDFCtor({
      orientation: 'portrait', unit: 'in', format: [8.5, 11],
      putOnlyUsedFonts: true
    });
    registerFonts(measureDoc);
    return measureDoc;
  }

  function getMeasureCtx() {
    if (measureCtx) return measureCtx;
    try {
      if (typeof document === 'undefined') return null;
      var c = document.createElement('canvas');
      var ctx = c.getContext && c.getContext('2d');
      if (!ctx || typeof ctx.measureText !== 'function') return null;
      // Probe: jsdom stubs often return width 0 for everything.
      ctx.font = '12pt ' + SCREEN_FONT;
      if (!(ctx.measureText('MM').width > 0)) return null;
      measureCtx = ctx;
      return measureCtx;
    } catch (e) {
      return null;
    }
  }

  function pdfWidth(str, pt, weight) {
    var doc = getMeasureDoc();
    setText(doc, pt, weight || 'normal');
    return doc.getTextWidth(String(str));
  }

  function screenWidth(str, pt, weight) {
    var ctx = getMeasureCtx();
    if (!ctx) return null;
    ctx.font = (weight === 'bold' ? 'bold ' : 'normal ') + pt + 'pt ' + SCREEN_FONT;
    // CSS px → inches (96 CSS px per in). Matches SVG font-size = pt/72 in.
    return ctx.measureText(String(str)).width / 96;
  }

  function wrapWithWidth(widthFn, str, maxW) {
    var words = String(str).split(/\s+/), lines = [], cur = '';
    var limit = Math.max(0.5, maxW);
    for (var i = 0; i < words.length; i++) {
      var trial = cur ? cur + ' ' + words[i] : words[i];
      if (cur && widthFn(trial) > limit) {
        lines.push(cur);
        cur = words[i];
        while (widthFn(cur) > limit && cur.length > 1) {
          var cut = Math.max(1, Math.floor(cur.length * limit / widthFn(cur)));
          lines.push(cur.slice(0, cut));
          cur = cur.slice(cut);
        }
      } else {
        cur = trial;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  /** `measure`: 'screen' for preview SVG font, 'pdf' for Noto Sans (default). */
  function makeMeasurer(measure) {
    if (measure === 'screen') {
      var probe = screenWidth('Measuring', 11, 'normal');
      if (probe != null) {
        return {
          width: function (s, pt, w) { return screenWidth(s, pt, w); },
          wrap: function (s, maxW, pt, w) {
            return wrapWithWidth(function (t) { return screenWidth(t, pt, w); }, s, maxW);
          }
        };
      }
    }
    return {
      width: function (s, pt, w) { return pdfWidth(s, pt, w); },
      wrap: function (s, maxW, pt, w) {
        var doc = getMeasureDoc();
        setText(doc, pt, w || 'normal');
        var lines = doc.splitTextToSize(String(s), Math.max(0.5, maxW));
        return lines && lines.length ? lines : [''];
      }
    };
  }

  /**
   * Shared How-to-Play geometry. Scales type on narrow trims and wraps every
   * paragraph so copy + example grids stay inside the safe area (e.g. 5×8).
   * Pass opts.measure = 'screen' from the preview so wrap matches the SVG font.
   */
  function planHowTo(trim, margins, opts) {
    opts = opts || {};
    var M = makeMeasurer(opts.measure || 'pdf');

    var safeW = trim.w - margins.left - margins.right;
    // Keep a thin pad inside the safe area, but don't starve the line length —
    // over-inset was forcing wraps while the page still looked empty.
    var inset = Math.min(0.10, Math.max(0.06, safeW * 0.025));
    var left = margins.left + inset;
    var contentW = Math.max(1, safeW - inset * 2);
    var narrow = contentW < 4.2;

    var titlePt = narrow ? 14 : PT.howtoHead;
    var bodyPt = narrow ? 9.5 : PT.body;
    var bodyLead = narrow ? 0.20 : PT.bodyLead;
    var topPad = narrow ? 0.32 : 0.50;
    var ruleIndent = Math.min(0.12, contentW * 0.035);
    var hangIndent = Math.min(0.36, ruleIndent + 0.24);

    while (titlePt > 11 && M.width(HOWTO_TITLE, titlePt, 'bold') > contentW) titlePt -= 0.5;
    var titleLines = M.wrap(HOWTO_TITLE, contentW, titlePt, 'bold');
    var titleLead = titlePt / 72 * 1.25;

    var blocks = [];
    blocks.push({ kind: 'body', lines: M.wrap(HOWTO_INTRO, contentW, bodyPt, 'normal'), indent: 0, hang: 0 });
    for (var k = 0; k < HOWTO_RULES.length; k++) {
      blocks.push({
        kind: 'rule',
        lines: M.wrap(HOWTO_RULES[k], contentW - ruleIndent, bodyPt, 'normal'),
        indent: ruleIndent,
        hang: hangIndent
      });
    }
    blocks.push({ kind: 'body', lines: M.wrap(HOWTO_CLOSE, contentW, bodyPt, 'normal'), indent: 0, hang: 0 });

    var y = margins.top + topPad;
    y += titleLines.length * titleLead + 0.18;
    for (var b = 0; b < blocks.length; b++) {
      y += blocks[b].lines.length * bodyLead;
      y += blocks[b].kind === 'rule' ? 0.06 : 0.12;
    }

    var bottomPad = 0.20;
    var labelBand = narrow ? 0.24 : 0.30;
    var stackGap = narrow ? 0.22 : 0.35;
    var available = trim.h - margins.bottom - bottomPad - y - 0.06;
    var n = EXAMPLE.n;
    var cell = Math.min(
      contentW / n,
      (available - 2 * labelBand - stackGap) / (2 * n),
      narrow ? 0.42 : K.MAX_CELL
    );
    var example = null;
    if (cell >= 0.09 && available > 1.0) {
      var gridSize = cell * n;
      example = {
        cell: cell, n: n, size: gridSize,
        x0: left + (contentW - gridSize) / 2,
        gy1: y + labelBand,
        gy2: y + labelBand + gridSize + stackGap + labelBand
      };
    }

    return {
      left: left, contentW: contentW,
      titlePt: titlePt, titleLines: titleLines, titleLead: titleLead,
      bodyPt: bodyPt, bodyLead: bodyLead,
      titleY: margins.top + topPad,
      blocks: blocks, example: example
    };
  }

  /** spec 7.1 — copy is fixed; the example below it is the hard-coded pair. */
  function drawHowToPage(doc, page, trim) {
    var L = planHowTo(trim, page.margins, { measure: 'pdf' });
    var y = L.titleY;
    var i, b, lines;

    setText(doc, L.titlePt, 'bold');
    for (i = 0; i < L.titleLines.length; i++) {
      doc.text(L.titleLines[i], trim.w / 2, y, { align: 'center' });
      y += L.titleLead;
    }
    y += 0.18;

    setText(doc, L.bodyPt, 'normal');
    for (b = 0; b < L.blocks.length; b++) {
      lines = L.blocks[b].lines;
      for (i = 0; i < lines.length; i++) {
        var x = L.left + (L.blocks[b].kind === 'rule'
          ? (i === 0 ? L.blocks[b].indent : L.blocks[b].hang)
          : 0);
        doc.text(lines[i], x, y);
        y += L.bodyLead;
      }
      y += L.blocks[b].kind === 'rule' ? 0.06 : 0.12;
    }

    if (L.example) {
      var ex = L.example;
      setText(doc, PT.exampleLabel, 'bold');
      doc.text('Puzzle', ex.x0 + ex.size / 2, ex.gy1 - 0.12, { align: 'center' });
      drawGrid(doc, { x: ex.x0, y: ex.gy1, n: ex.n, cell: ex.cell, cells: EXAMPLE.clues });
      doc.text('Solution', ex.x0 + ex.size / 2, ex.gy2 - 0.12, { align: 'center' });
      drawGrid(doc, { x: ex.x0, y: ex.gy2, n: ex.n, cell: ex.cell, cells: EXAMPLE.solution });
    }
  }

  /**
   * One page of puzzles. With a single puzzle the tier goes in the page header;
   * with 2 or 4 the header names the range and each grid gets its own caption,
   * so a mixed-difficulty book still tells the reader what they are facing.
   */
  function drawPuzzlePage(doc, page, trim, plan, puzzles) {
    var m = page.margins;
    var L = plan.puzzleLayout;
    var n = plan.n;
    var perPage = plan.perPage;
    var first = puzzles[page.from - 1];

    var headerText;
    if (perPage === 1) {
      headerText = 'Puzzle ' + page.from + '  ·  ' + n + '×' + n + '  ·  ' + TIER_LABEL[first.difficulty];
    } else if (page.from === page.to) {
      headerText = 'Puzzle ' + page.from + '  ·  ' + n + '×' + n;
    } else {
      headerText = 'Puzzles ' + page.from + '–' + page.to + '  ·  ' + n + '×' + n;
    }
    drawHeader(doc, headerText, page, trim);

    var originX = m.left;
    var originY = m.top + K.HEADER_H;

    for (var slot = 0; slot + page.from <= page.to; slot++) {
      var pz = puzzles[page.from - 1 + slot];
      var col = slot % L.cols, row = (slot / L.cols) | 0;
      var bx = originX + col * (L.blockW + K.GAP);
      var by = originY + row * (L.blockH + K.GAP);

      // centre the grid in its block (spec 5.2)
      var gx = bx + (L.blockW - L.gridSize) / 2;
      var gy = by + (L.blockH - L.captionH - L.gridSize) / 2;

      drawGrid(doc, { x: gx, y: gy, n: n, cell: L.cell, cells: pz.clues });

      if (L.captionH > 0) {
        setText(doc, PT.caption, 'normal');
        doc.text('Puzzle ' + (page.from + slot) + '  ·  ' + TIER_LABEL[pz.difficulty],
          bx + L.blockW / 2, gy + L.gridSize + 0.16, { align: 'center' });
      }
    }
  }

  function drawSolutionPage(doc, page, trim, plan, puzzles) {
    var m = page.margins;
    var L = plan.solutionLayout;
    var n = plan.n;
    var originX = m.left;
    var originY = m.top;

    for (var slot = 0; slot + page.from <= page.to; slot++) {
      var pz = puzzles[page.from - 1 + slot];
      var col = slot % L.cols, row = (slot / L.cols) | 0;
      var bx = originX + col * (L.blockW + K.GAP);
      var by = originY + row * (L.blockH + K.GAP);
      var gx = bx + (L.blockW - L.gridSize) / 2;
      var gy = by + (L.blockH - L.captionH - L.gridSize) / 2;

      drawGrid(doc, { x: gx, y: gy, n: n, cell: L.cell, cells: pz.solution });

      setText(doc, PT.caption, 'normal');
      doc.text('#' + (page.from + slot), bx + L.blockW / 2, gy + L.gridSize + 0.16, { align: 'center' });
    }
  }

  function drawPage(doc, page, trim, plan, puzzles, meta) {
    switch (page.kind) {
      case 'title': drawTitlePage(doc, page, trim, meta); break;
      case 'howto': drawHowToPage(doc, page, trim); break;
      case 'divider': drawDividerPage(doc, page, trim); break;
      case 'puzzles': drawPuzzlePage(doc, page, trim, plan, puzzles); break;
      case 'solutions': drawSolutionPage(doc, page, trim, plan, puzzles); break;
      case 'blank': break;      // deliberately empty, and no page number
    }
    drawFooter(doc, page, trim);
  }

  /* ------------------------------------------------------ spec 8 build -- */

  function newDoc(trim) {
    var jsPDFCtor = (global.jspdf && global.jspdf.jsPDF) || global.jsPDF;
    if (!jsPDFCtor) throw new Error('vendor/jspdf.umd.min.js did not load.');
    // spec 4.2 — no bleed, so the page size is exactly the trim size.
    // jsPDF normalises `format` to the orientation it is given (portrait puts
    // the short side first), so a wide trim MUST say 'landscape' or it comes
    // out rotated — 8.25 × 6 would silently become 6 × 8.25.
    return new jsPDFCtor({
      orientation: trim.w > trim.h ? 'landscape' : 'portrait',
      unit: 'in',
      format: [trim.w, trim.h],
      compress: true,
      // Without this, jsPDF writes its 14 built-in Type1 fonts into every
      // document. They are never drawn with, but they still show up in the
      // page's /Font resources, and preflight reports them as non-embedded —
      // which is exactly what KDP rejects (spec 4.7).
      putOnlyUsedFonts: true
    });
  }

  /**
   * PDF bookmarks (Bookmarks / Outline panel) so a reader can jump between
   * Title, How to Play, Puzzles and Solutions after download.
   */
  function addNavigator(doc, pages) {
    if (!doc.outline || typeof doc.outline.add !== 'function') return;
    var seen = {};
    var labels = {
      title: 'Title page',
      howto: 'How to play',
      puzzles: 'Puzzles',
      divider: 'Solutions'
    };
    for (var i = 0; i < pages.length; i++) {
      var kind = pages[i].kind;
      if (!labels[kind] || seen[kind]) continue;
      doc.outline.add(null, labels[kind], { pageNumber: i + 1 });
      seen[kind] = true;
    }
  }

  /**
   * Build an interior from an explicit list of page descriptors (defaults to
   * the whole plan). Each descriptor already carries its own mirrored margins,
   * so this just walks them in order.
   */
  function build(plan, puzzles, meta, pageList) {
    var trim = plan.trim;
    var doc = newDoc(trim);
    registerFonts(doc);
    doc.setProperties({
      title: meta.title || 'Binario Puzzles',
      subject: meta.subtitle || '',
      creator: 'Binario KDP Generator',
      author: meta.author || ''
    });

    var orientation = trim.w > trim.h ? 'landscape' : 'portrait';
    var pages = pageList || plan.pages;
    for (var i = 0; i < pages.length; i++) {
      if (i > 0) doc.addPage([trim.w, trim.h], orientation);
      drawPage(doc, pages[i], trim, plan, puzzles, meta);
    }
    addNavigator(doc, pages);
    return doc;
  }

  function fileName(meta, trim, suffix) {
    return slug(meta.title) + '_' + trim.w + 'x' + trim.h + '_interior' + (suffix || '') + '.pdf';
  }

  function save(plan, puzzles, meta) {
    var doc = build(plan, puzzles, meta);
    doc.save(fileName(meta, plan.trim));
  }

  /**
   * spec 8 — a 4-page test file (title, how to play, one puzzle page, one
   * solution page) so the user can eyeball the real output before committing
   * to the full book. It is a proof, not a book: too short for KDP to accept.
   */
  function samplePages(plan) {
    var wanted = ['title', 'howto', 'puzzles', 'solutions'];
    var out = [];
    for (var w = 0; w < wanted.length; w++) {
      for (var i = 0; i < plan.pages.length; i++) {
        if (plan.pages[i].kind !== wanted[w]) continue;
        var src = plan.pages[i], copy = {};
        for (var k in src) if (src.hasOwnProperty(k)) copy[k] = src[k];
        // Re-mirror for the sample's own page order, keeping the gutter WIDTH
        // the real book will use, so both the side and the size look right.
        copy.margins = K.pageMargins(out.length + 1, plan.pageCount);
        out.push(copy);
        break;
      }
    }
    return out;
  }

  function saveSample(plan, puzzles, meta) {
    var doc = build(plan, puzzles, meta, samplePages(plan));
    doc.save(fileName(meta, plan.trim, '_SAMPLE'));
  }

  global.PdfExport = {
    build: build,
    save: save,
    saveSample: saveSample,
    samplePages: samplePages,
    drawGrid: drawGrid,
    registerFonts: registerFonts,
    fileName: fileName,
    slug: slug,
    EXAMPLE: EXAMPLE,
    HOWTO: { title: HOWTO_TITLE, intro: HOWTO_INTRO, rules: HOWTO_RULES, close: HOWTO_CLOSE },
    planHowTo: planHowTo,
    TIER_LABEL: TIER_LABEL,
    FONT: FONT,
    LW: LW
  };
})(typeof window !== 'undefined' ? window : this);
