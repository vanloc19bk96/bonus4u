/*
 * grid.js: drawing commands for puzzle grids, solution grids and placeholders.
 *
 * Commands are plain objects in inches (line weights and font sizes in points) that both
 * renderers understand:
 *   { t: 'line', x1, y1, x2, y2, w, ink, cap }
 *   { t: 'path', pts: [x0, y0, x1, y1, ...], closed, w, ink, dash: [on, off] | null }
 *   { t: 'rect', x, y, w, h, fill }
 *   { t: 'text', x, y, text, face, size, ink }      (y is the baseline, text starts at x)
 * `ink` is the amount of black: 1 = black, 0 = white. A command with `preview: true` is
 * shown on screen only and never printed.
 */
(function () {
  'use strict';
  window.KS = window.KS || {};
  var T = KS.Text;
  var PT = 1 / 72;

  var THIN = { w: 0.75, ink: 0.5 };   // cell lines: lightest allowed stroke, mid gray
  var CAGE_INK = 1;
  var SUM_FACE = 'sans';
  var DIGIT_FACE = 'sans';

  function styleFor(cellPt, kind) {
    if (kind === 'solution') return { box: 1.25, outer: 1.5 };
    return { box: cellPt >= 30 ? 1.75 : 1.5, outer: cellPt >= 30 ? 2.25 : 2 };
  }

  // ---------------------------------------------------------------- cage geometry
  var cache = typeof WeakMap === 'function' ? new WeakMap() : null;

  function cagesOf(pz) {
    var hit = cache && cache.get(pz);
    if (hit) return hit;
    var lists = [];
    for (var i = 0; i < 81; i++) (lists[pz.cageOf[i]] = lists[pz.cageOf[i]] || []).push(i);
    var cages = lists.map(function (cells, id) {
      return { cells: cells, sum: pz.sums[id], loops: outline(cells) };
    });
    if (cache) cache.set(pz, cages);
    return cages;
  }

  // Boundary loops of a cage in cell units, clockwise on screen (interior on the right),
  // with straight runs merged. Where the cage touches itself at a corner, the loop turns
  // right, so each loop stays simple and can be inset cleanly.
  function outline(cells) {
    var inCage = {};
    cells.forEach(function (c) { inCage[c] = true; });
    var has = function (r, c) { return r >= 0 && r < 9 && c >= 0 && c < 9 && inCage[r * 9 + c]; };
    var edges = [], from = {};
    function add(x1, y1, x2, y2) {
      var e = { x1: x1, y1: y1, x2: x2, y2: y2, dx: x2 - x1, dy: y2 - y1, used: false };
      edges.push(e);
      (from[x1 + ',' + y1] = from[x1 + ',' + y1] || []).push(e);
    }
    cells.forEach(function (i) {
      var r = (i / 9) | 0, c = i % 9;
      if (!has(r - 1, c)) add(c, r, c + 1, r);
      if (!has(r, c + 1)) add(c + 1, r, c + 1, r + 1);
      if (!has(r + 1, c)) add(c + 1, r + 1, c, r + 1);
      if (!has(r, c - 1)) add(c, r + 1, c, r);
    });
    var loops = [];
    edges.forEach(function (start) {
      if (start.used) return;
      var pts = [], e = start;
      while (e && !e.used) {
        e.used = true;
        pts.push([e.x1, e.y1, e.dx, e.dy]);
        var next = (from[e.x2 + ',' + e.y2] || []).filter(function (n) { return !n.used || n === start; });
        if (next.length > 1) {
          var right = next.filter(function (n) { return n.dx === -e.dy && n.dy === e.dx; });
          next = right.length ? right : next;
        }
        e = next[0] === start ? null : next[0];
      }
      // Keep only corners: drop vertices where the direction does not change.
      var corners = pts.filter(function (p, k) {
        var prev = pts[(k + pts.length - 1) % pts.length];
        return prev[2] !== p[2] || prev[3] !== p[3];
      });
      loops.push(corners);
    });
    return loops;
  }

  // Moves every corner `inset` (cell units) towards the inside of the cage.
  function insetLoop(loop, inset) {
    var n = loop.length, out = [];
    for (var k = 0; k < n; k++) {
      var p = loop[k], prev = loop[(k + n - 1) % n];
      var nx = -prev[3] + -p[3], ny = prev[2] + p[2];
      out.push(p[0] + inset * nx, p[1] + inset * ny);
    }
    return out;
  }

  // ---------------------------------------------------------------- grid lines
  function lineWeightAt(index, st) {
    if (index === 0 || index === 9) return st.outer;
    return index % 3 === 0 ? st.box : THIN.w;
  }

  function gridLines(out, x, y, size, st, preview) {
    var cell = size / 9, i;
    for (i = 1; i < 9; i++) {
      if (i % 3 === 0) continue;
      out.push({ t: 'line', x1: x + i * cell, y1: y, x2: x + i * cell, y2: y + size, w: THIN.w, ink: THIN.ink, cap: 'butt', preview: preview });
      out.push({ t: 'line', x1: x, y1: y + i * cell, x2: x + size, y2: y + i * cell, w: THIN.w, ink: THIN.ink, cap: 'butt', preview: preview });
    }
    for (i = 3; i < 9; i += 3) {
      out.push({ t: 'line', x1: x + i * cell, y1: y, x2: x + i * cell, y2: y + size, w: st.box, ink: 1, cap: 'butt', preview: preview });
      out.push({ t: 'line', x1: x, y1: y + i * cell, x2: x + size, y2: y + i * cell, w: st.box, ink: 1, cap: 'butt', preview: preview });
    }
    out.push({ t: 'path', pts: [x, y, x + size, y, x + size, y + size, x, y + size], closed: true, w: st.outer, ink: 1, dash: null, preview: preview });
  }

  // ---------------------------------------------------------------- puzzle grid
  // opts.digits: also print the solution (used for the How to Play example).
  function killer(out, pz, x, y, size, opts) {
    opts = opts || {};
    var cell = size / 9, cellPt = cell * 72, st = styleFor(cellPt, 'puzzle');
    var cages = cagesOf(pz);
    gridLines(out, x, y, size, st);

    // Dashed cage outlines, inset far enough to clear the thickest line plus a hairline gap.
    var insetIn = Math.max(cell * 0.1, (st.box / 2 + 0.375 + 0.9) * PT);
    var dash = cellPt >= 30 ? [2.6 * PT, 1.7 * PT] : [2.2 * PT, 1.5 * PT];
    cages.forEach(function (cage) {
      cage.loops.forEach(function (loop) {
        var pts = insetLoop(loop, insetIn / cell).map(function (v, k) {
          return (k % 2 ? y : x) + v * cell;
        });
        out.push({ t: 'path', pts: pts, closed: true, w: 0.75, ink: CAGE_INK, dash: dash });
      });
    });

    // Cage sums in the top-left corner of each cage's first cell, on a white patch that
    // interrupts the dashed line without touching the grid lines.
    var sumSize = Math.min(11, Math.max(KS.KDP.MIN_FONT_PT, Math.round(cellPt * 0.26 * 2) / 2));
    var cap = T.capHeight(SUM_FACE, sumSize), pad = 0.8 * PT;
    cages.forEach(function (cage) {
      var first = cage.cells[0], r = (first / 9) | 0, c = first % 9;
      var cx = x + c * cell, cy = y + r * cell;
      var clearL = (lineWeightAt(c, st) / 2 + 0.4) * PT, clearT = (lineWeightAt(r, st) / 2 + 0.4) * PT;
      var label = String(cage.sum), tw = T.width(label, SUM_FACE, sumSize);
      out.push({ t: 'rect', x: cx + clearL, y: cy + clearT, w: tw + pad * 2, h: cap + pad * 2, fill: 0 });
      out.push({ t: 'text', x: cx + clearL + pad, y: cy + clearT + pad + cap, text: label, face: SUM_FACE, size: sumSize, ink: 1 });
    });

    if (opts.digits) {
      var dSize = Math.max(KS.KDP.MIN_FONT_PT, Math.round(cellPt * 0.46 * 2) / 2);
      var dCap = T.capHeight(DIGIT_FACE, dSize);
      for (var i = 0; i < 81; i++) {
        var d = pz.solution[i], w = T.width(d, DIGIT_FACE, dSize);
        var dx = x + (i % 9) * cell + (cell - w) / 2;
        var dy = y + ((i / 9) | 0) * cell + cell * 0.6 + dCap / 2;
        out.push({ t: 'text', x: dx, y: dy, text: d, face: DIGIT_FACE, size: dSize, ink: 1 });
      }
    }
  }

  // ---------------------------------------------------------------- solution grid
  function solution(out, pz, x, y, size) {
    var cell = size / 9, cellPt = cell * 72, st = styleFor(cellPt, 'solution');
    gridLines(out, x, y, size, st);
    var dSize = Math.max(KS.KDP.MIN_FONT_PT, Math.round(cellPt * 0.6 * 2) / 2);
    var cap = T.capHeight(DIGIT_FACE, dSize);
    for (var i = 0; i < 81; i++) {
      var d = pz.solution[i], w = T.width(d, DIGIT_FACE, dSize);
      out.push({
        t: 'text', x: x + (i % 9) * cell + (cell - w) / 2, y: y + ((i / 9) | 0) * cell + (cell + cap) / 2,
        text: d, face: DIGIT_FACE, size: dSize, ink: 1
      });
    }
  }

  // ---------------------------------------------------------------- placeholder
  // Same grid lines as the real thing (so layout checks see the same geometry), plus a
  // screen-only note. It can never be printed: Download waits for every puzzle.
  function placeholder(out, x, y, size, kind) {
    var cellPt = size / 9 * 72;
    gridLines(out, x, y, size, styleFor(cellPt, kind), false);
    var note = 'Creating puzzle…', fs = Math.max(8, Math.min(12, size * 72 / 22));
    var w = T.width(note, 'sans', fs);
    out.push({ t: 'rect', x: x + size / 2 - w / 2 - 0.08, y: y + size / 2 - 0.18, w: w + 0.16, h: 0.3, fill: 0, preview: true });
    out.push({ t: 'text', x: x + size / 2 - w / 2, y: y + size / 2 + T.capHeight('sans', fs) / 2 - 0.03, text: note, face: 'sans', size: fs, ink: 0.55, preview: true });
  }

  KS.Grid = {
    THIN: THIN,
    // The outer border is stroked on the grid edge, so half of it lies outside `size`.
    // Layout keeps this much room around every grid.
    STROKE_PAD: 2.25 / 72,
    cagesOf: cagesOf,
    outline: outline,
    killer: killer,
    solution: solution,
    placeholder: placeholder
  };
})();
