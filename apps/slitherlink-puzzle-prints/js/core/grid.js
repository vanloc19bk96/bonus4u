/*
 * grid.js: drawing commands for Slitherlink puzzle grids, solution grids, the small
 * technique diagrams of the Solving Tips page, and placeholders.
 *
 * Commands are plain objects in inches (line weights and font sizes in points) that both
 * renderers understand:
 *   { t: 'line', x1, y1, x2, y2, w, ink, cap }
 *   { t: 'path', pts: [x0, y0, x1, y1, ...], closed, w, ink, dash: [on, off] | null }
 *   { t: 'rect', x, y, w, h, fill }
 *   { t: 'disc', cx, cy, r, fill }
 *   { t: 'text', x, y, text, face, size, ink }      (y is the baseline, text starts at x)
 * `ink` is the amount of black: 1 = black, 0 = white. A command with `preview: true` is
 * shown on screen only and never printed.
 *
 * A grid of n x n cells is drawn inside a square of side `size`: a thin frame on the
 * square's edge and the (n + 1) x (n + 1) dots inset from it by MARGIN cells.
 */
(function () {
  'use strict';
  window.KS = window.KS || {};
  var T = KS.Text;

  var MARGIN = 0.45;                  // gap between the frame and the outer dots, in cells
  var FRAME = { w: 1, ink: 1 };
  var GUIDE = { w: 0.75, ink: 0.18 }; // optional light lines between the dots
  var CLUE_FACE = 'sans';
  var SHADE = 0.14;                   // inside of the loop on solution pages
  var SOLUTION_CLUE_INK = 0.6;
  var CROSS = { w: 0.9, ink: 0.65 };

  function lattice(x, y, size, n) {
    var cell = size / (n + 2 * MARGIN);
    return { cell: cell, ox: x + MARGIN * cell, oy: y + MARGIN * cell, cellPt: cell * 72 };
  }

  function clueSize(cellPt) {
    return Math.max(KS.KDP.MIN_FONT_PT, Math.min(24, Math.round(cellPt * 0.58 * 2) / 2));
  }
  function dotRadius(cellPt) { return Math.max(0.9, Math.min(2.6, cellPt * 0.075)) / 72; }
  function loopWidth(cellPt) { return Math.max(1.25, Math.min(3.5, cellPt * 0.11)); }

  // ---------------------------------------------------------------- puzzle data
  var cache = typeof WeakMap === 'function' ? new WeakMap() : null;

  // Clues, loop edges and the loop as an ordered list of dots, from a wire puzzle.
  function shapeOf(pz) {
    var hit = cache && cache.get(pz);
    if (hit) return hit;
    var w = KS.engine.fromWire(pz), g = w.geo, n = pz.size, e;
    var order = [], start = -1;
    for (e = 0; e < g.E; e++) if (w.on[e]) { start = e; break; }
    if (start >= 0) {
      var first = g.edgeV[start * 2], cur = g.edgeV[start * 2 + 1], prev = start;
      order.push(first, cur);
      for (var guard = 0; guard < g.E && cur !== first; guard++) {
        var next = -1;
        for (var k = 0; k < 4; k++) {
          var f = g.dotE[cur * 4 + k];
          if (f >= 0 && f !== prev && w.on[f]) { next = f; break; }
        }
        if (next < 0) break;
        cur = g.edgeV[next * 2] === cur ? g.edgeV[next * 2 + 1] : g.edgeV[next * 2];
        prev = next;
        if (cur !== first) order.push(cur);
      }
    }
    var shape = { n: n, clues: w.clues, inside: w.inside, on: w.on, order: order };
    if (cache) cache.set(pz, shape);
    return shape;
  }

  // ---------------------------------------------------------------- pieces
  function frame(out, x, y, size, preview) {
    out.push({ t: 'path', pts: [x, y, x + size, y, x + size, y + size, x, y + size], closed: true, w: FRAME.w, ink: FRAME.ink, dash: null, preview: preview });
  }

  function guides(out, L, n) {
    var span = n * L.cell;
    for (var i = 0; i <= n; i++) {
      out.push({ t: 'line', x1: L.ox + i * L.cell, y1: L.oy, x2: L.ox + i * L.cell, y2: L.oy + span, w: GUIDE.w, ink: GUIDE.ink, cap: 'butt' });
      out.push({ t: 'line', x1: L.ox, y1: L.oy + i * L.cell, x2: L.ox + span, y2: L.oy + i * L.cell, w: GUIDE.w, ink: GUIDE.ink, cap: 'butt' });
    }
  }

  function dots(out, L, rows, cols, scale) {
    var r = dotRadius(L.cellPt) * (scale || 1);
    for (var i = 0; i <= rows; i++) {
      for (var j = 0; j <= cols; j++) out.push({ t: 'disc', cx: L.ox + j * L.cell, cy: L.oy + i * L.cell, r: r, fill: 1 });
    }
  }

  function clue(out, L, r, c, value, ink) {
    var size = clueSize(L.cellPt), text = String(value);
    var w = T.width(text, CLUE_FACE, size), cap = T.capHeight(CLUE_FACE, size);
    out.push({
      t: 'text', x: L.ox + c * L.cell + (L.cell - w) / 2, y: L.oy + r * L.cell + (L.cell + cap) / 2,
      text: text, face: CLUE_FACE, size: size, ink: ink == null ? 1 : ink
    });
  }

  function cross(out, L, r1, c1, r2, c2) {
    var mx = L.ox + (c1 + c2) / 2 * L.cell, my = L.oy + (r1 + r2) / 2 * L.cell, h = L.cell * 0.12;
    out.push({ t: 'line', x1: mx - h, y1: my - h, x2: mx + h, y2: my + h, w: CROSS.w, ink: CROSS.ink, cap: 'butt' });
    out.push({ t: 'line', x1: mx - h, y1: my + h, x2: mx + h, y2: my - h, w: CROSS.w, ink: CROSS.ink, cap: 'butt' });
  }

  // ---------------------------------------------------------------- puzzle grid
  // opts.guides: light lines between the dots.
  function puzzle(out, pz, x, y, size, opts) {
    opts = opts || {};
    var shape = shapeOf(pz), n = shape.n, L = lattice(x, y, size, n);
    if (opts.guides) guides(out, L, n);
    frame(out, x, y, size);
    dots(out, L, n, n);
    for (var i = 0; i < n * n; i++) {
      if (shape.clues[i] >= 0) clue(out, L, (i / n) | 0, i % n, shape.clues[i]);
    }
  }

  // ---------------------------------------------------------------- solution grid
  // The loop as one thick closed line, the inside lightly shaded, the numbers in gray.
  // opts.shade, opts.clues (default true).
  function solution(out, pz, x, y, size, opts) {
    opts = opts || {};
    var shape = shapeOf(pz), n = shape.n, L = lattice(x, y, size, n), i;
    if (opts.shade) {
      for (i = 0; i < n * n; i++) {
        if (!shape.inside[i]) continue;
        out.push({ t: 'rect', x: L.ox + (i % n) * L.cell, y: L.oy + ((i / n) | 0) * L.cell, w: L.cell, h: L.cell, fill: SHADE });
      }
    }
    frame(out, x, y, size);
    dots(out, L, n, n, 0.8);
    if (opts.clues !== false) {
      for (i = 0; i < n * n; i++) {
        if (shape.clues[i] >= 0) clue(out, L, (i / n) | 0, i % n, shape.clues[i], SOLUTION_CLUE_INK);
      }
    }
    var pts = [];
    shape.order.forEach(function (d) {
      pts.push(L.ox + (d % (n + 1)) * L.cell, L.oy + ((d / (n + 1)) | 0) * L.cell);
    });
    if (pts.length) out.push({ t: 'path', pts: pts, closed: true, w: loopWidth(L.cellPt), ink: 1, dash: null });
  }

  // ---------------------------------------------------------------- tip diagrams
  // spec: { rows, cols, clues: [[r, c, n]], lines: [[r1, c1, r2, c2]] (dot coordinates),
  //         crosses: [[r1, c1, r2, c2]], edge: ['top', 'left', ...] sides that are the
  //         puzzle's edge }. Drawn with `cell` inches per cell; returns the size used.
  function diagramSize(spec, cell) {
    return { w: (spec.cols + 2 * MARGIN) * cell, h: (spec.rows + 2 * MARGIN) * cell };
  }

  function diagram(out, spec, x, y, cell) {
    var L = { cell: cell, ox: x + MARGIN * cell, oy: y + MARGIN * cell, cellPt: cell * 72 };
    var sz = diagramSize(spec, cell), w = loopWidth(L.cellPt);
    (spec.edge || []).forEach(function (side) {
      // The puzzle's frame on the sides that are the edge of the grid.
      var x0 = x, y0 = y, x1 = x + sz.w, y1 = y + sz.h;
      if (side === 'top') out.push({ t: 'line', x1: x0, y1: y0, x2: x1, y2: y0, w: FRAME.w, ink: 1, cap: 'butt' });
      if (side === 'bottom') out.push({ t: 'line', x1: x0, y1: y1, x2: x1, y2: y1, w: FRAME.w, ink: 1, cap: 'butt' });
      if (side === 'left') out.push({ t: 'line', x1: x0, y1: y0, x2: x0, y2: y1, w: FRAME.w, ink: 1, cap: 'butt' });
      if (side === 'right') out.push({ t: 'line', x1: x1, y1: y0, x2: x1, y2: y1, w: FRAME.w, ink: 1, cap: 'butt' });
    });
    (spec.lines || []).forEach(function (s) {
      out.push({ t: 'line', x1: L.ox + s[1] * cell, y1: L.oy + s[0] * cell, x2: L.ox + s[3] * cell, y2: L.oy + s[2] * cell, w: w, ink: 1, cap: 'square' });
    });
    dots(out, L, spec.rows, spec.cols);
    (spec.clues || []).forEach(function (c) { clue(out, L, c[0], c[1], c[2]); });
    (spec.crosses || []).forEach(function (s) { cross(out, L, s[0], s[1], s[2], s[3]); });
    return sz;
  }

  // ---------------------------------------------------------------- placeholder
  // Same outer geometry as the real thing (so layout checks see the same extent), plus a
  // screen-only note. It can never be printed: Download waits for every puzzle.
  function placeholder(out, x, y, size, n) {
    var L = lattice(x, y, size, n);
    frame(out, x, y, size, false);
    dots(out, L, n, n);
    var note = 'Creating puzzle…', fs = Math.max(8, Math.min(12, size * 72 / 22));
    var w = T.width(note, 'sans', fs);
    out.push({ t: 'rect', x: x + size / 2 - w / 2 - 0.08, y: y + size / 2 - 0.18, w: w + 0.16, h: 0.3, fill: 0, preview: true });
    out.push({ t: 'text', x: x + size / 2 - w / 2, y: y + size / 2 + T.capHeight('sans', fs) / 2 - 0.03, text: note, face: 'sans', size: fs, ink: 0.55, preview: true });
  }

  KS.Grid = {
    MARGIN: MARGIN,
    // The frame is stroked on the grid edge, so half of it lies outside `size` on each
    // side. Layout keeps this much room around every grid.
    STROKE_PAD: 2.5 / 72,
    cellPt: function (size, n) { return size / (n + 2 * MARGIN) * 72; },
    clueSize: clueSize,
    shapeOf: shapeOf,
    puzzle: puzzle,
    solution: solution,
    diagram: diagram,
    diagramSize: diagramSize,
    placeholder: placeholder
  };
})();
