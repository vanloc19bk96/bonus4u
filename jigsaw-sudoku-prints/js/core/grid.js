/*
 * grid.js: drawing commands for puzzle grids, solution grids and placeholders.
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
 */
(function () {
  'use strict';
  window.KS = window.KS || {};
  var T = KS.Text;

  var THIN = { w: 0.75, ink: 0.5 };   // cell lines: lightest allowed stroke, mid gray
  var DIAG = { w: 0.75, ink: 0.3 };   // the two long diagonals of the Diagonal variant
  var GIVEN_FACE = 'sansBold';
  var SOLVED_FACE = 'sans';
  // Region shading: light grays, neighbouring regions never share one. All at least 0.1
  // ink so they print, and light enough that black digits stay crisp on them.
  var SHADES = [0, 0.1, 0.17, 0.24, 0.3];
  var HIGHLIGHT = 0.2;

  function styleFor(cellPt, kind) {
    if (kind === 'solution') return { region: 1.25, outer: 1.5 };
    return { region: cellPt >= 30 ? 2 : 1.75, outer: cellPt >= 30 ? 2.5 : 2.25 };
  }

  function symbol(n, d) { return String(n === 10 ? d - 1 : d); }

  // ---------------------------------------------------------------- region geometry
  var cache = typeof WeakMap === 'function' ? new WeakMap() : null;
  var CH = '0123456789abcdefghijklmnopqrstuvwxyz';

  // Decoded puzzle plus its region borders: runs of cell edges between two different
  // regions, merged along each grid line.
  function shapeOf(pz) {
    var hit = cache && cache.get(pz);
    if (hit) return hit;
    var n = pz.size, N2 = n * n, reg = [], sol = [], giv = [], i, r, c;
    for (i = 0; i < N2; i++) {
      reg.push(CH.indexOf(pz.regions[i]));
      sol.push(CH.indexOf(pz.solution[i]));
      giv.push(pz.givens[i] === '.' ? 0 : CH.indexOf(pz.givens[i]));
    }
    var segs = [];
    for (r = 1; r < n; r++) { // horizontal borders on the line above row r
      for (c = 0; c < n;) {
        if (reg[(r - 1) * n + c] === reg[r * n + c]) { c++; continue; }
        var c0 = c;
        while (c < n && reg[(r - 1) * n + c] !== reg[r * n + c]) c++;
        segs.push([c0, r, c, r]);
      }
    }
    for (c = 1; c < n; c++) { // vertical borders on the line left of column c
      for (r = 0; r < n;) {
        if (reg[r * n + c - 1] === reg[r * n + c]) { r++; continue; }
        var r0 = r;
        while (r < n && reg[r * n + c - 1] !== reg[r * n + c]) r++;
        segs.push([c, r0, c, r]);
      }
    }
    var shape = { n: n, reg: reg, sol: sol, giv: giv, segs: segs, shades: shadesFor(n, reg), diagonal: pz.variant === 'diagonal' };
    if (cache) cache.set(pz, shape);
    return shape;
  }

  // DSatur colouring of the region map with the lightest shades it can manage.
  function shadesFor(n, reg) {
    var adj = [], i, k;
    for (i = 0; i < n; i++) adj.push({});
    for (i = 0; i < n * n; i++) {
      var r = (i / n) | 0, c = i % n;
      if (c < n - 1 && reg[i] !== reg[i + 1]) { adj[reg[i]][reg[i + 1]] = 1; adj[reg[i + 1]][reg[i]] = 1; }
      if (r < n - 1 && reg[i] !== reg[i + n]) { adj[reg[i]][reg[i + n]] = 1; adj[reg[i + n]][reg[i]] = 1; }
    }
    var color = new Array(n).fill(-1);
    for (var step = 0; step < n; step++) {
      var best = -1, bestSat = -1, bestDeg = -1;
      for (i = 0; i < n; i++) {
        if (color[i] >= 0) continue;
        var seen = {}, sat = 0, deg = Object.keys(adj[i]).length;
        Object.keys(adj[i]).forEach(function (j) { if (color[j] >= 0 && !seen[color[j]]) { seen[color[j]] = 1; sat++; } });
        if (sat > bestSat || (sat === bestSat && deg > bestDeg)) { best = i; bestSat = sat; bestDeg = deg; }
      }
      var used = {};
      Object.keys(adj[best]).forEach(function (j) { if (color[j] >= 0) used[color[j]] = 1; });
      for (k = 0; used[k]; k++);
      color[best] = Math.min(k, SHADES.length - 1);
    }
    return color.map(function (k) { return SHADES[k]; });
  }

  // ---------------------------------------------------------------- grid lines
  function thinLines(out, x, y, size, n, preview) {
    var cell = size / n;
    for (var i = 1; i < n; i++) {
      out.push({ t: 'line', x1: x + i * cell, y1: y, x2: x + i * cell, y2: y + size, w: THIN.w, ink: THIN.ink, cap: 'butt', preview: preview });
      out.push({ t: 'line', x1: x, y1: y + i * cell, x2: x + size, y2: y + i * cell, w: THIN.w, ink: THIN.ink, cap: 'butt', preview: preview });
    }
  }

  function border(out, x, y, size, st, preview) {
    out.push({ t: 'path', pts: [x, y, x + size, y, x + size, y + size, x, y + size], closed: true, w: st.outer, ink: 1, dash: null, preview: preview });
  }

  // Square caps close the corners where a horizontal and a vertical border meet; every run
  // ends on another border or the outer frame, so the caps never poke into a cell.
  function regionLines(out, shape, x, y, size, st) {
    var cell = size / shape.n;
    shape.segs.forEach(function (s) {
      out.push({ t: 'line', x1: x + s[0] * cell, y1: y + s[1] * cell, x2: x + s[2] * cell, y2: y + s[3] * cell, w: st.region, ink: 1, cap: 'square' });
    });
  }

  function fills(out, shape, x, y, size, opts) {
    var n = shape.n, cell = size / n;
    for (var i = 0; i < n * n; i++) {
      var ink = 0;
      if (opts.shade) ink = shape.shades[shape.reg[i]];
      if (opts.highlight != null && shape.reg[i] === opts.highlight) ink = HIGHLIGHT;
      if (ink) out.push({ t: 'rect', x: x + (i % n) * cell, y: y + ((i / n) | 0) * cell, w: cell, h: cell, fill: ink });
    }
  }

  function diagonals(out, shape, x, y, size) {
    if (!shape.diagonal) return;
    out.push({ t: 'line', x1: x, y1: y, x2: x + size, y2: y + size, w: DIAG.w, ink: DIAG.ink, cap: 'butt' });
    out.push({ t: 'line', x1: x + size, y1: y, x2: x, y2: y + size, w: DIAG.w, ink: DIAG.ink, cap: 'butt' });
  }

  function digit(out, n, d, face, size, ink, x, y, cell, i) {
    var cap = T.capHeight(face, size), text = symbol(n, d), w = T.width(text, face, size);
    out.push({
      t: 'text', x: x + (i % n) * cell + (cell - w) / 2, y: y + ((i / n) | 0) * cell + (cell + cap) / 2,
      text: text, face: face, size: size, ink: ink
    });
  }

  function digitSize(cellPt, share) {
    return Math.max(KS.KDP.MIN_FONT_PT, Math.round(cellPt * share * 2) / 2);
  }

  // ---------------------------------------------------------------- puzzle grid
  // opts.digits: also print the solved digits (How to Play example).
  // opts.shade: shade the regions in light grays. opts.highlight: region id to shade.
  function jigsaw(out, pz, x, y, size, opts) {
    opts = opts || {};
    var shape = shapeOf(pz), n = shape.n, cell = size / n, cellPt = cell * 72, st = styleFor(cellPt, 'puzzle');
    fills(out, shape, x, y, size, opts);
    thinLines(out, x, y, size, n);
    diagonals(out, shape, x, y, size);
    regionLines(out, shape, x, y, size, st);
    border(out, x, y, size, st);
    var gs = digitSize(cellPt, 0.56);
    for (var i = 0; i < n * n; i++) {
      if (shape.giv[i]) digit(out, n, shape.giv[i], GIVEN_FACE, gs, 1, x, y, cell, i);
      else if (opts.digits) digit(out, n, shape.sol[i], SOLVED_FACE, gs, 1, x, y, cell, i);
    }
  }

  // ---------------------------------------------------------------- solution grid
  // Givens in bold, solved digits in regular weight, so the solver can find their entries.
  function solution(out, pz, x, y, size, opts) {
    opts = opts || {};
    var shape = shapeOf(pz), n = shape.n, cell = size / n, cellPt = cell * 72, st = styleFor(cellPt, 'solution');
    fills(out, shape, x, y, size, opts);
    thinLines(out, x, y, size, n);
    diagonals(out, shape, x, y, size);
    regionLines(out, shape, x, y, size, st);
    border(out, x, y, size, st);
    var ds = digitSize(cellPt, 0.6);
    for (var i = 0; i < n * n; i++) {
      digit(out, n, shape.sol[i], shape.giv[i] ? GIVEN_FACE : SOLVED_FACE, ds, 1, x, y, cell, i);
    }
  }

  // ---------------------------------------------------------------- placeholder
  // Same outer geometry as the real thing (so layout checks see the same extent), plus a
  // screen-only note. It can never be printed: Download waits for every puzzle.
  function placeholder(out, x, y, size, n, kind) {
    var cellPt = size / n * 72;
    thinLines(out, x, y, size, n, false);
    border(out, x, y, size, styleFor(cellPt, kind), false);
    var note = 'Creating puzzle…', fs = Math.max(8, Math.min(12, size * 72 / 22));
    var w = T.width(note, 'sans', fs);
    out.push({ t: 'rect', x: x + size / 2 - w / 2 - 0.08, y: y + size / 2 - 0.18, w: w + 0.16, h: 0.3, fill: 0, preview: true });
    out.push({ t: 'text', x: x + size / 2 - w / 2, y: y + size / 2 + T.capHeight('sans', fs) / 2 - 0.03, text: note, face: 'sans', size: fs, ink: 0.55, preview: true });
  }

  KS.Grid = {
    THIN: THIN,
    SHADES: SHADES,
    // The outer border is stroked on the grid edge, so half of it lies outside `size` on
    // each side. Layout keeps this much room around every grid.
    STROKE_PAD: 2.5 / 72,
    shapeOf: shapeOf,
    symbol: symbol,
    jigsaw: jigsaw,
    solution: solution,
    placeholder: placeholder
  };
})();
