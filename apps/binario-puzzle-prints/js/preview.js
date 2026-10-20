/*!
 * preview.js — on-screen page preview, drawn as inline SVG.
 *
 * It renders from the very same plan object pdf-export.js uses, in the same
 * unit (inches, via the SVG viewBox), so what the box shows is what the PDF
 * will contain — including which side the gutter falls on.
 *
 * Output is an SVG *string* rather than DOM nodes: it costs nothing to build,
 * drops straight into innerHTML, and can be rendered headlessly by the tests.
 *
 * Exposes window.Preview. Classic script, no modules (spec 2).
 */
(function (global) {
  'use strict';

  var K = global.KdpLayout;
  var C = global.BinarioCore;

  var INK = '#000';
  var GUIDE = '#b9b9c4';
  var GUIDE_TEXT = '#8a8a99';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function f(v) { return (Math.round(v * 10000) / 10000); }

  /* ------------------------------------------------------- placeholders --
   * The preview must work before the user clicks Generate (spec 6.3), so when
   * there are no real puzzles yet it fills the page with throwaway grids built
   * from a complete solution with most cells hidden. They exist purely to show
   * the layout; they are never exported.
   */
  var placeholderCache = {};
  function placeholders(n, howMany) {
    var key = n + ':' + howMany;
    if (placeholderCache[key]) return placeholderCache[key];
    var rng = C.makeRng(20240816 + n);
    var out = [];
    for (var i = 0; i < howMany; i++) {
      var sol = C.fillSolution(n, rng);
      var clues = new Array(n * n);
      for (var j = 0; j < n * n; j++) clues[j] = rng() < 0.3 ? sol[j] : null;
      out.push({
        n: n, clues: clues, solution: Array.prototype.slice.call(sol),
        difficulty: 'medium', index: i + 1, placeholder: true
      });
    }
    placeholderCache[key] = out;
    return out;
  }

  /* ------------------------------------------------------------ drawing -- */

  function gridSvg(o) {
    var x = o.x, y = o.y, n = o.n, cell = o.cell, cells = o.cells;
    var size = n * cell, i, row, col, s = [];

    for (i = 1; i < n; i++) {                                   // cell separators
      s.push('<line x1="' + f(x + i * cell) + '" y1="' + f(y) +
             '" x2="' + f(x + i * cell) + '" y2="' + f(y + size) + '"/>');
      s.push('<line x1="' + f(x) + '" y1="' + f(y + i * cell) +
             '" x2="' + f(x + size) + '" y2="' + f(y + i * cell) + '"/>');
    }
    var inner = '<g stroke="' + INK + '" stroke-width="' + f(0.5 / 72) + '">' + s.join('') + '</g>';

    var border = '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(size) + '" height="' + f(size) +
      '" fill="none" stroke="' + INK + '" stroke-width="' + f(1.2 / 72) + '"/>';

    var r = cell * K.CIRCLE_R_RATIO, circles = [];
    for (row = 0; row < n; row++) {
      for (col = 0; col < n; col++) {
        var v = cells[row * n + col];
        if (v === null || v === undefined) continue;
        var cx = x + col * cell + cell / 2, cy = y + row * cell + cell / 2;
        circles.push('<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '" fill="' +
          (v === 1 ? INK : '#fff') + '" stroke="' + INK + '" stroke-width="' + f(0.6 / 72) + '"/>');
      }
    }
    return inner + border + circles.join('');
  }

  function textSvg(str, x, y, pt, weight, anchor, fill) {
    return '<text x="' + f(x) + '" y="' + f(y) + '" font-size="' + f(pt / 72) +
      '" font-family="Inter, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif"' +
      (weight ? ' font-weight="' + weight + '"' : '') +
      ' text-anchor="' + (anchor || 'middle') + '" fill="' + (fill || INK) + '">' + esc(str) + '</text>';
  }

  /* --------------------------------------------------------- whole page -- */

  function renderPageSvg(plan, puzzles, page, opts) {
    opts = opts || {};
    var trim = plan.trim, n = plan.n, m = page.margins;
    var out = [];

    // Intrinsic size follows trim inches so CSS can keep the page proportion
    // honest when scaling into the preview stage (spec 6.3).
    out.push('<svg class="pv-svg" viewBox="0 0 ' + f(trim.w) + ' ' + f(trim.h) +
      '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img" ' +
      'style="--trim-w:' + f(trim.w) + ';--trim-h:' + f(trim.h) + '" ' +
      'aria-label="Preview of page ' + page.number + '">');
    out.push('<rect class="pv-page" x="0" y="0" width="' + f(trim.w) + '" height="' + f(trim.h) +
      '" fill="#fff"/>');

    // --- guide: dashed margin box = printable safe area (spec 6.3) --------
    if (opts.guides !== false) {
      // Stroke uses screen pixels via vector-effect so dashes stay readable
      // at every preview scale.
      out.push('<rect class="pv-safe" x="' + f(m.left) + '" y="' + f(m.top) +
        '" width="' + f(trim.w - m.left - m.right) + '" height="' + f(trim.h - m.top - m.bottom) +
        '" fill="none" stroke="' + GUIDE + '" stroke-width="1.25" stroke-dasharray="5 4" ' +
        'vector-effect="non-scaling-stroke"/>');
      out.push(textSvg('safe area', m.left + 0.04, m.top - 0.07, 7, null, 'start', GUIDE_TEXT));
    }

    var list = puzzles && puzzles.length ? puzzles : null;

    if (page.kind === 'title') {
      var title = opts.title || 'Binario Puzzles';
      var titleLead = 30 / 72 * 1.25;
      var blockH = titleLead;
      if (opts.subtitle) blockH += 0.28 + 14 / 72 * 1.35;
      var yTitle = (trim.h - blockH) / 2 + 30 / 72 * 0.85;
      out.push(textSvg(title, trim.w / 2, yTitle, 30, 'bold'));
      if (opts.subtitle) {
        out.push(textSvg(opts.subtitle, trim.w / 2, yTitle + titleLead + 0.28, 14));
      }

    } else if (page.kind === 'divider') {
      out.push(textSvg('SOLUTIONS', trim.w / 2, trim.h * 0.45, 30, 'bold'));

    } else if (page.kind === 'howto') {
      out.push(renderHowTo(plan, page, opts));

    } else if (page.kind === 'blank') {
      out.push(textSvg('(blank page)', trim.w / 2, trim.h / 2, 9, null, 'middle', GUIDE_TEXT));

    } else if (page.kind === 'puzzles') {
      var pz = list || placeholders(n, plan.perPage);
      var L = plan.puzzleLayout;
      var head;
      var firstP = pickPuzzle(pz, page.from, list);
      if (plan.perPage === 1) {
        head = 'Puzzle ' + page.from + '  ·  ' + n + '×' + n + '  ·  ' + tierLabel(firstP);
      } else if (page.from === page.to) {
        head = 'Puzzle ' + page.from + '  ·  ' + n + '×' + n;
      } else {
        head = 'Puzzles ' + page.from + '–' + page.to + '  ·  ' + n + '×' + n;
      }
      out.push(textSvg(head, trim.w / 2, m.top + 0.22, 10, 'bold'));

      for (var slot = 0; slot + page.from <= page.to; slot++) {
        var p = pickPuzzle(pz, page.from + slot, list);
        var g = blockGeom(L, slot, m.left, m.top + K.HEADER_H);
        out.push(gridSvg({ x: g.gx, y: g.gy, n: n, cell: L.cell, cells: p.clues }));
        if (L.captionH > 0) {
          out.push(textSvg('Puzzle ' + (page.from + slot) + '  ·  ' + tierLabel(p),
            g.bx + L.blockW / 2, g.gy + L.gridSize + 0.16, 9));
        }
      }

    } else if (page.kind === 'solutions') {
      var pzs = list || placeholders(n, plan.solutionsPerPage);
      var SL = plan.solutionLayout;
      for (var s2 = 0; s2 + page.from <= page.to; s2++) {
        var sp = pickPuzzle(pzs, page.from + s2, list);
        var g2 = blockGeom(SL, s2, m.left, m.top);
        out.push(gridSvg({ x: g2.gx, y: g2.gy, n: n, cell: SL.cell, cells: sp.solution }));
        out.push(textSvg('#' + (page.from + s2), g2.bx + SL.blockW / 2, g2.gy + SL.gridSize + 0.16, 9));
      }
    }

    if (page.footer) {
      out.push(textSvg(String(page.number), trim.w / 2, trim.h - m.bottom - 0.10, 9));
    }

    out.push('</svg>');
    return out.join('');
  }

  function tierLabel(p) {
    return ({ easy: 'Easy', medium: 'Medium', hard: 'Hard' })[p.difficulty] || 'Medium';
  }

  /** Real puzzles are indexed 1..count; placeholders just cycle. */
  function pickPuzzle(pool, index1, isReal) {
    return isReal ? pool[index1 - 1] : pool[(index1 - 1) % pool.length];
  }

  function blockGeom(L, slot, originX, originY) {
    var col = slot % L.cols, row = (slot / L.cols) | 0;
    var bx = originX + col * (L.blockW + K.GAP);
    var by = originY + row * (L.blockH + K.GAP);
    return {
      bx: bx, by: by,
      gx: bx + (L.blockW - L.gridSize) / 2,
      gy: by + (L.blockH - L.captionH - L.gridSize) / 2
    };
  }

  function renderHowTo(plan, page, opts) {
    var trim = plan.trim, m = page.margins;
    var P = global.PdfExport;
    var EX = P ? P.EXAMPLE : null;
    if (!P || typeof P.planHowTo !== 'function' || !EX) return '';

    // Wrap with the same UI sans the SVG paints, otherwise Noto metrics make
    // lines break early and the preview looks half-empty on wide trims.
    var L = P.planHowTo(trim, m, { measure: 'screen' });
    var out = [], y = L.titleY, i, b, lines;

    for (i = 0; i < L.titleLines.length; i++) {
      out.push(textSvg(L.titleLines[i], trim.w / 2, y, L.titlePt, 'bold'));
      y += L.titleLead;
    }
    y += 0.18;

    for (b = 0; b < L.blocks.length; b++) {
      lines = L.blocks[b].lines;
      for (i = 0; i < lines.length; i++) {
        var x = L.left + (L.blocks[b].kind === 'rule'
          ? (i === 0 ? L.blocks[b].indent : L.blocks[b].hang)
          : 0);
        out.push(textSvg(lines[i], x, y, L.bodyPt, null, 'start'));
        y += L.bodyLead;
      }
      y += L.blocks[b].kind === 'rule' ? 0.06 : 0.12;
    }

    if (L.example) {
      var ex = L.example;
      out.push(textSvg('Puzzle', ex.x0 + ex.size / 2, ex.gy1 - 0.12, 10, 'bold'));
      out.push(gridSvg({ x: ex.x0, y: ex.gy1, n: ex.n, cell: ex.cell, cells: EX.clues }));
      out.push(textSvg('Solution', ex.x0 + ex.size / 2, ex.gy2 - 0.12, 10, 'bold'));
      out.push(gridSvg({ x: ex.x0, y: ex.gy2, n: ex.n, cell: ex.cell, cells: EX.solution }));
    }
    return out.join('');
  }

  /** The first page of each section — what the preview offers to show. */
  function firstPageOfKind(plan, kind) {
    for (var i = 0; i < plan.pages.length; i++) if (plan.pages[i].kind === kind) return plan.pages[i];
    return null;
  }

  global.Preview = {
    renderPageSvg: renderPageSvg,
    firstPageOfKind: firstPageOfKind,
    placeholders: placeholders,
    gridSvg: gridSvg
  };
})(typeof window !== 'undefined' ? window : this);
