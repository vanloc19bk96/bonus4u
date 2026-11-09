/*
 * Draws a puzzle into a box on a page, as simple shapes in gray: the same page items as the rest of
 * the book, so the preview and the PDF match. A drawing sizes itself to the box and returns false
 * when it had to go under its smallest readable size (the checklist and the tests catch that).
 * draw(pg, d, box, o): d is the puzzle's draw or solved data; o: { b: body size, solved: bool }.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var F = null;

  function fonts() { return F || (F = CX.metrics.load()); }
  function wid(str, size, font) { return fonts()[font].width(String(str), size, 0); }
  function lift(size, font) { return fonts()[font].capHeight * size / 2; }
  function wrap(str, size, font, maxW) {
    var words = String(str).split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur && wid(t, size, font) > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function center(pg, str, cx, cy, size, font, ink) { pg.text(String(str), cx, cy + lift(size, font || 'sansBold'), size, font || 'sansBold', { align: 'center', ink: ink }); }
  function starPts(cx, cy, r) {
    var pts = [];
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    return pts;
  }

  // ---------- small symbols ----------
  var ICONS = {
    key: function (pg, x, y, r, ink) {
      pg.ring(x - r * 0.45, y, r * 0.42, Math.max(0.9, r * 0.14), ink);
      pg.line(x - r * 0.03, y, x + r * 0.95, y, Math.max(0.9, r * 0.17), ink);
      pg.line(x + r * 0.55, y, x + r * 0.55, y + r * 0.4, Math.max(0.9, r * 0.17), ink);
      pg.line(x + r * 0.88, y, x + r * 0.88, y + r * 0.4, Math.max(0.9, r * 0.17), ink);
    },
    coin: function (pg, x, y, r, ink) { pg.ring(x, y, r * 0.82, Math.max(0.9, r * 0.13), ink); pg.ring(x, y, r * 0.48, 0.75, ink); },
    star: function (pg, x, y, r, ink) { pg.poly(starPts(x, y, r * 0.95), ink); },
    moon: function (pg, x, y, r, ink) {
      var pts = [], i, a;
      for (i = 0; i <= 18; i++) { a = (70 + i * 220 / 18) * Math.PI / 180; pts.push(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85); }
      for (i = 18; i >= 0; i--) { a = (70 + i * 220 / 18) * Math.PI / 180; pts.push(x + r * 0.32 + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62); }
      pg.poly(pts, ink);
    },
    diamond: function (pg, x, y, r, ink) {
      pg.path([x, y - r * 0.92, x + r * 0.68, y, x, y + r * 0.92, x - r * 0.68, y], Math.max(1, r * 0.15), ink, true);
      pg.line(x - r * 0.68, y, x + r * 0.68, y, 0.75, ink);
    }
  };

  // ---------- tiles: a coded mark with a box to write in ----------
  function flow(words, cw, gap, W) {
    var lines = [[]], x = 0;
    words.forEach(function (w) {
      var ww = w.length * cw;
      if (x && x + ww > W + 0.01) { lines.push([]); x = 0; }
      if (ww > W) {
        // a word too long for a line is split across two
        var per = Math.floor(W / cw);
        for (var i = 0; i < w.length; i += per) { if (i) { lines.push([]); x = 0; } lines[lines.length - 1].push(w.slice(i, i + per)); x = w.slice(i, i + per).length * cw + gap; }
        return;
      }
      lines[lines.length - 1].push(w);
      x += ww + gap;
    });
    return lines;
  }

  // tile(pg, value, x, y, cw, topH): draws the coded mark in the top part of a tile.
  function tiles(pg, words, box, o) {
    var best = null, ratio = o.ratio || 2.05;
    for (var cw = o.max; cw >= o.min; cw -= 0.5) {
      var gap = cw * 0.55, lines = flow(words, cw, gap, box.w), h = lines.length * cw * ratio;
      if (h <= box.h) { best = { cw: cw, gap: gap, lines: lines, rowH: cw * ratio }; break; }
    }
    var ok = !!best;
    if (!best) { var g = o.min * 0.55; best = { cw: o.min, gap: g, lines: flow(words, o.min, g, box.w), rowH: o.min * ratio }; }
    var total = best.lines.length * best.rowH, y = box.y + Math.max(0, (box.h - total) * 0.35);
    best.lines.forEach(function (line) {
      var used = line.reduce(function (s, w) { return s + w.length * best.cw; }, 0) + best.gap * (line.length - 1), x = box.x + (box.w - used) / 2;
      line.forEach(function (w) {
        w.forEach(function (v, i) {
          var cx = x + i * best.cw, topH = best.rowH * 0.5, bw = best.cw * 0.86, bh = Math.min(best.cw * 0.92, best.rowH * 0.44);
          o.tile(pg, v, cx + best.cw / 2, y + topH * 0.52, best.cw, topH);
          pg.box(cx + (best.cw - bw) / 2, y + topH, bw, bh, 0.75, 0.6);
        });
        x += w.length * best.cw + best.gap;
      });
      y += best.rowH;
    });
    return ok;
  }

  function letterStrip(pg, box) {
    var ABC = CX.engine.ABC, cs = box.w / 13, y = box.y, size = Math.max(7.5, Math.min(cs * 0.55, 10.5));
    for (var i = 0; i < 26; i++) {
      var r = i < 13 ? 0 : 1, x = box.x + (i % 13) * cs;
      pg.box(x, y + r * cs * 0.82, cs, cs * 0.82, 0.75, 0.45);
      center(pg, ABC[i], x + cs / 2, y + r * cs * 0.82 + cs * 0.41, size, 'sans', 0.85);
    }
    return cs * 0.82 * 2;
  }

  function drawLetters(pg, d, box) {
    var top = d.strip ? letterStrip(pg, box) + 10 : 0;
    return tiles(pg, d.words.map(function (w) { return w.split(''); }), { x: box.x, y: box.y + top, w: box.w, h: box.h - top }, {
      max: 25, min: 15,
      tile: function (p, ch, cx, cy, cw) { center(p, ch, cx, cy, Math.max(9, cw * 0.62), 'sansBold'); }
    });
  }

  // ---------- the shape code ----------
  var PIG = {};
  (function () {
    var cells = [['r', 'b'], ['l', 'r', 'b'], ['l', 'b'], ['t', 'b', 'r'], ['t', 'b', 'l', 'r'], ['t', 'b', 'l'], ['t', 'r'], ['t', 'l', 'r'], ['t', 'l']];
    var xs = ['s', 'e', 'w', 'n'];
    'ABCDEFGHI'.split('').forEach(function (ch, i) { PIG[ch] = { sides: cells[i] }; });
    'JKLMNOPQR'.split('').forEach(function (ch, i) { PIG[ch] = { sides: cells[i], dot: true }; });
    'STUV'.split('').forEach(function (ch, i) { PIG[ch] = { x: xs[i] }; });
    'WXYZ'.split('').forEach(function (ch, i) { PIG[ch] = { x: xs[i], dot: true }; });
  })();

  function pigGlyph(pg, ch, cx, cy, s, ink) {
    var g = PIG[ch], w = Math.max(1.1, s * 0.09), a = s / 2;
    if (g.sides) {
      g.sides.forEach(function (k) {
        if (k === 't') pg.line(cx - a, cy - a, cx + a, cy - a, w, ink);
        if (k === 'b') pg.line(cx - a, cy + a, cx + a, cy + a, w, ink);
        if (k === 'l') pg.line(cx - a, cy - a, cx - a, cy + a, w, ink);
        if (k === 'r') pg.line(cx + a, cy - a, cx + a, cy + a, w, ink);
      });
    } else {
      var P = { s: [cx - a, cy - a, cx, cy + a * 0.7, cx + a, cy - a], n: [cx - a, cy + a, cx, cy - a * 0.7, cx + a, cy + a], e: [cx - a, cy - a, cx + a * 0.7, cy, cx - a, cy + a], w: [cx + a, cy - a, cx - a * 0.7, cy, cx + a, cy + a] }[g.x];
      pg.path(P, w, ink);
    }
    if (g.dot) pg.dot(cx, cy, Math.max(1.2, s * 0.12), ink);
  }

  /* The key: two grids and two crosses of letters, with their shapes made by the lines. Returns its height. */
  function pigKey(pg, x, y, w, maxH) {
    var cs = Math.min(w / 16.5, maxH / 3, 22), size = Math.max(7.5, cs * 0.58), gap = cs * 0.95, block = cs * 3, xs = [x + (w - block * 4 - gap * 3) / 2];
    for (var i = 1; i < 4; i++) xs.push(xs[0] + i * (block + gap));
    [0, 1].forEach(function (g) {
      var x0 = xs[g], letters = g ? 'JKLMNOPQR' : 'ABCDEFGHI';
      for (var k = 1; k < 3; k++) { pg.line(x0 + k * cs, y, x0 + k * cs, y + block, 1.1); pg.line(x0, y + k * cs, x0 + block, y + k * cs, 1.1); }
      for (var c = 0; c < 9; c++) {
        var cx = x0 + (c % 3 + 0.5) * cs, cy = y + (Math.floor(c / 3) + 0.5) * cs;
        center(pg, letters[c], cx - (g ? cs * 0.14 : 0), cy, size, 'sansBold');
        if (g) pg.dot(cx + cs * 0.26, cy, Math.max(1, cs * 0.07));
      }
    });
    [0, 1].forEach(function (g) {
      var x0 = xs[2 + g], m = x0 + block / 2, n = y + block / 2, letters = g ? 'WXYZ' : 'STUV';
      pg.line(x0 + cs * 0.3, y + cs * 0.3, x0 + block - cs * 0.3, y + block - cs * 0.3, 1.1);
      pg.line(x0 + block - cs * 0.3, y + cs * 0.3, x0 + cs * 0.3, y + block - cs * 0.3, 1.1);
      var spots = [[m, n - cs * 0.95], [m - cs * 0.95, n], [m + cs * 0.95, n], [m, n + cs * 0.95]];
      spots.forEach(function (s, i) {
        center(pg, letters[i], s[0] - (g ? cs * 0.14 : 0), s[1], size, 'sansBold');
        if (g) pg.dot(s[0] + cs * 0.24, s[1], Math.max(1, cs * 0.07));
      });
    });
    return block;
  }

  function drawPigpen(pg, d, box) {
    var top = d.key ? pigKey(pg, box.x, box.y, box.w, Math.min(66, box.h * 0.3)) + 12 : 0;
    return tiles(pg, d.words.map(function (w) { return w.split(''); }), { x: box.x, y: box.y + top, w: box.w, h: box.h - top }, {
      max: 25, min: 15,
      tile: function (p, ch, cx, cy, cw) { pigGlyph(p, ch, cx, cy, cw * 0.52); }
    });
  }

  // ---------- morse ----------
  function morseMarks(pg, code, cx, cy, u) {
    var w = 0, i;
    for (i = 0; i < code.length; i++) w += (code[i] === '-' ? u * 2.2 : u) + (i ? u * 0.7 : 0);
    var x = cx - w / 2;
    for (i = 0; i < code.length; i++) {
      if (code[i] === '-') { pg.rectFill(x, cy - u * 0.34, u * 2.2, u * 0.68); x += u * 2.2 + u * 0.7; }
      else { pg.dot(x + u / 2, cy, u * 0.4); x += u + u * 0.7; }
    }
  }

  /* The whole Morse alphabet. Returns its height. */
  function morseChart(pg, x, y, w, size) {
    var M = CX.engine.MORSE, ABC = CX.engine.ABC, cols = w > 300 ? 5 : 4, rows = Math.ceil(26 / cols), cw = w / cols, rh = size * 1.55;
    for (var i = 0; i < 26; i++) {
      var c = Math.floor(i / rows), r = i % rows, cx = x + c * cw, cy = y + r * rh + rh / 2;
      center(pg, ABC[i], cx + size * 0.6, cy, size, 'sansBold');
      morseMarks(pg, M[ABC[i]], cx + size * 1.5 + (cw - size * 1.6) / 2, cy, Math.min(size * 0.34, (cw - size * 1.8) / 9));
    }
    return rows * rh;
  }

  function drawMorse(pg, d, box) {
    var top = d.chart ? morseChart(pg, box.x, box.y, box.w, 9.5) + 12 : 0;
    return tiles(pg, d.words, { x: box.x, y: box.y + top, w: box.w, h: box.h - top }, {
      max: 40, min: 26, ratio: 1.55,
      tile: function (p, code, cx, cy, cw) { morseMarks(p, code, cx, cy, Math.min(cw / 8.4, 5)); }
    });
  }

  function drawCodes(pg, d, box) {
    return tiles(pg, d.words, box, {
      max: 25, min: 17,
      tile: function (p, n, cx, cy, cw) { center(p, n, cx, cy, Math.max(8.5, cw * 0.46), 'sansBold'); }
    });
  }

  // ---------- stencil ----------
  function drawGrille(pg, d, box, o) {
    var n = d.n, holes = {};
    d.card.forEach(function (h) { holes[h[0] + ',' + h[1]] = 1; });
    if (o.solved) {
      var cs0 = Math.min(box.w, box.h) / n, x0 = box.x + (box.w - cs0 * n) / 2;
      for (var a = 0; a < n; a++) for (var b = 0; b < n; b++) {
        var mx = x0 + (b + 0.5) * cs0, my = box.y + (a + 0.5) * cs0;
        if (holes[a + ',' + b]) { pg.dot(mx, my, cs0 * 0.43, 0.22); center(pg, d.grid[a][b], mx, my, Math.max(7, cs0 * 0.56), 'sansBold'); }
        else center(pg, d.grid[a][b], mx, my, Math.max(7, cs0 * 0.56), 'sans', 0.45);
      }
      return true;
    }
    var gap = 14, cs = Math.min((box.w - gap) / (2 * n), box.h - 18 > 0 ? (box.h - 18) / n : 1, 24), W = cs * n, x1 = box.x + (box.w - W * 2 - gap) / 2, x2 = x1 + W + gap, y = box.y + 14;
    pg.text('THE LETTERS', x1 + W / 2, y - 5, 8, 'sansBold', { align: 'center', ls: 1.2 });
    pg.text('THE STENCIL', x2 + W / 2, y - 5, 8, 'sansBold', { align: 'center', ls: 1.2 });
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      pg.box(x1 + c * cs, y + r * cs, cs, cs, 0.75, 0.6);
      center(pg, d.grid[r][c], x1 + (c + 0.5) * cs, y + (r + 0.5) * cs, Math.max(8, cs * 0.55), 'sansBold');
      pg.box(x2 + c * cs, y + r * cs, cs, cs, 0.75, 0.3);
      if (holes[r + ',' + c]) pg.rectFill(x2 + c * cs + cs * 0.14, y + r * cs + cs * 0.14, cs * 0.72, cs * 0.72);
    }
    pg.box(x1, y, W, W, 1.4); pg.box(x2, y, W, W, 1.4);
    return cs >= 13;
  }

  // ---------- sudoku ----------
  function drawSudoku(pg, d, box, o) {
    var n = d.n, cs = Math.min(box.w / n, box.h / n, o.solved ? 22 : 44), W = cs * n, x = box.x + (box.w - W) / 2, y = box.y + (o.solved ? 0 : (box.h - W) * 0.3), bx = d.box;
    for (var i = 0; i <= n; i++) {
      var thickH = i % bx[0] === 0, thickV = i % bx[1] === 0;
      pg.line(x, y + i * cs, x + W, y + i * cs, thickH ? 1.6 : 0.75, thickH ? 1 : 0.6);
      pg.line(x + i * cs, y, x + i * cs, y + W, thickV ? 1.6 : 0.75, thickV ? 1 : 0.6);
    }
    var size = Math.max(8, cs * 0.5), given = o.solved ? d.given : d.grid;
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      var v = o.solved ? d.grid[r][c] : d.grid[r][c], cx = x + (c + 0.5) * cs, cy = y + (r + 0.5) * cs;
      if (v) center(pg, v, cx, cy, size, given[r][c] ? 'sansBold' : 'sans', given[r][c] ? 1 : 0.65);
    }
    pg.ring(x + (d.mark[1] + 0.5) * cs, y + (d.mark[0] + 0.5) * cs, cs * 0.38, Math.max(1.2, cs * 0.05));
    return cs >= 15;
  }

  // ---------- logic grid ----------
  function rotated(pg, str, x, y, size, font) {
    pg.items.push({ t: 'text', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, str: CX.metrics.printable(str, fonts()[font]), font: font, size: size, angle: 90 });
  }
  function drawLogic(pg, d, box, o) {
    var n = d.n, b = o.b, size = b, lines = [], ok = true;
    function clueLines(s) { var out = []; d.clues.forEach(function (t, i) { wrap((i + 1) + '. ' + t, s, 'serif', box.w).forEach(function (l) { out.push(l); }); }); return out; }
    function headFor(ls) { return Math.max.apply(null, d.objects.map(function (t) { return wid(t, ls, 'sans'); })) + 6; }
    var cs, ls, lead;
    // the clues give way first: the grid has to stay big enough to write in
    for (size = b; ; size -= 0.25) {
      lines = clueLines(size); lead = size * 1.24;
      ls = Math.max(7.5, size * 0.84);
      cs = Math.min(23, (box.h - lines.length * lead - 8 - headFor(ls) - 2) / (2 * n));
      if (cs >= 14 || size <= 8) break;
    }
    if (cs < 13) ok = false;
    var y = box.y;
    lines.forEach(function (l, i) { pg.text(l, box.x, y + lead * (i + 0.8), size, 'serif'); });
    y += lines.length * lead + 8;
    ls = Math.max(7.5, size * 0.84);
    var labelW = Math.max.apply(null, d.people.concat(d.objects).map(function (t) { return wid(t, ls, 'sans'); })) + 5;
    var headH = Math.max.apply(null, d.objects.map(function (t) { return wid(t, ls, 'sans'); })) + 6;
    headH = Math.max(headH, cs);
    var W = labelW + cs * 2 * n;
    var x = box.x + Math.max(0, (box.w - W) / 2), gx = x + labelW, gy = y + headH;
    if (W > box.w + 0.5) ok = false;
    var i, j;
    for (i = 0; i < n; i++) {
      center(pg, i + 1, gx + (i + 0.5) * cs, gy - cs * 0.42, Math.max(8, cs * 0.5), 'sansBold');
      rotated(pg, d.objects[i], gx + (n + i + 0.5) * cs + ls * 0.33, gy - 3, ls, 'sans');
    }
    d.people.forEach(function (t, r) { pg.text(t, gx - 4, gy + (r + 0.5) * cs + lift(ls, 'sans'), ls, 'sans', { align: 'right' }); });
    d.objects.forEach(function (t, r) { pg.text(t, gx - 4, gy + (n + r + 0.5) * cs + lift(ls, 'sans'), ls, 'sans', { align: 'right' }); });
    // people by numbers and by objects, objects by numbers
    for (i = 0; i <= n; i++) {
      pg.line(gx, gy + i * cs, gx + 2 * n * cs, gy + i * cs, i === 0 || i === n ? 1.3 : 0.75, i === 0 || i === n ? 1 : 0.6);
      pg.line(gx, gy + (n + i) * cs, gx + n * cs, gy + (n + i) * cs, i === n ? 1.3 : 0.75, i === n ? 1 : 0.6);
    }
    for (j = 0; j <= 2 * n; j++) {
      var bot = j <= n ? 2 * n : n;
      pg.line(gx + j * cs, gy, gx + j * cs, gy + bot * cs, j % n === 0 ? 1.3 : 0.75, j % n === 0 ? 1 : 0.6);
    }
    return ok && gy + 2 * n * cs <= box.y + box.h + 1;
  }

  // ---------- padlock ----------
  function drawLock(pg, d, box) {
    var n = d.n, rows = d.rows.length, rh = Math.min(30, (box.h - 76) / rows), ds = Math.min(rh * 0.86, 25), size = Math.max(8.5, Math.min(ds * 0.5, 11)), y = box.y;
    // the lock itself, with the dial that counts in a heavier box
    var bw = n * 26 + 28, bx = box.x + box.w / 2 - bw / 2, sh = [], mid = box.x + box.w / 2, rad = bw * 0.27;
    for (var a = 180; a <= 360; a += 15) sh.push(mid + Math.cos(a * Math.PI / 180) * rad, y + 26 + Math.sin(a * Math.PI / 180) * rad);
    sh.unshift(mid - rad, y + 34); sh.push(mid + rad, y + 34);
    pg.path(sh, 3);
    pg.box(bx, y + 32, bw, 36, 1.8);
    for (var i = 0; i < n; i++) pg.box(bx + 14 + i * 26 + 1, y + 39, 24, 22, i === d.spot ? 2 : 0.75, i === d.spot ? 1 : 0.6);
    y += 76;
    var lw = wid('2 in the right place, 2 in the wrong place', size, 'sans');
    var used = n * ds + 8 + lw, x0 = box.x + Math.max(0, (box.w - used) / 2);
    d.rows.forEach(function (row, r) {
      var cy = y + (r + 0.5) * rh;
      row.guess.forEach(function (g, k) {
        pg.box(x0 + k * ds, cy - ds / 2, ds - 1.5, ds, 0.75, 0.6);
        center(pg, g, x0 + k * ds + (ds - 1.5) / 2, cy, Math.max(8.5, ds * 0.6), 'sansBold');
      });
      pg.text(row.right + ' in the right place, ' + row.near + ' in the wrong place', x0 + n * ds + 8, cy + lift(size, 'sans'), size, 'sans');
    });
    return rh >= 15 && used <= box.w + 0.5;
  }

  // ---------- symbol sums ----------
  function drawSymbols(pg, d, box) {
    var rows = d.eqs.length, rh = Math.min(50, box.h / Math.max(rows, 1)), r = rh * 0.32, size = Math.max(10, rh * 0.36), y = box.y + Math.max(0, (box.h - rows * rh) * 0.25);
    d.eqs.forEach(function (e, i) {
      var cy = y + (i + 0.5) * rh, step = r * 2.6, opW = r * 1.25, w = 0;
      e.terms.forEach(function (t, k) { w += (k ? opW : 0) + step + (t.times ? opW + step : 0); });
      var totalW = wid('= ' + e.total, size, 'sansBold') + opW, x = box.x + (box.w - w - totalW) / 2;
      e.terms.forEach(function (t, k) {
        if (k) { center(pg, '+', x + opW / 2, cy, size, 'sansBold'); x += opW; }
        ICONS[t.s](pg, x + step / 2, cy, r);
        x += step;
        if (t.times) { center(pg, '×', x + opW / 2, cy, size, 'sansBold'); x += opW; ICONS[t.times](pg, x + step / 2, cy, r); x += step; }
      });
      pg.text('= ' + e.total, x + opW * 0.6, cy + lift(size, 'sansBold'), size, 'sansBold');
      if (i < rows - 1) pg.line(box.x + box.w * 0.15, cy + rh / 2, box.x + box.w * 0.85, cy + rh / 2, 0.75, 0.25);
    });
    return rh >= 26;
  }

  // ---------- number row ----------
  function drawSequence(pg, d, box) {
    var all = d.nums.map(String).concat(['?']), size = 15, tw = 0;
    all.forEach(function (s) { tw = Math.max(tw, wid(s, size, 'sansBold')); });
    var cw = Math.max(34, tw + 14), gap = 10, per = Math.min(all.length, Math.floor((box.w + gap) / (cw + gap))), rows = Math.ceil(all.length / per), h = cw * 0.86;
    var y = box.y + Math.max(0, (box.h - rows * (h + gap)) * 0.3);
    for (var r = 0; r < rows; r++) {
      var row = all.slice(r * per, (r + 1) * per), W = row.length * cw + (row.length - 1) * gap, x = box.x + (box.w - W) / 2;
      row.forEach(function (s, i) {
        var isLast = s === '?';
        pg.box(x + i * (cw + gap), y + r * (h + gap), cw, h, isLast ? 1.6 : 0.9, isLast ? 1 : 0.7, isLast ? [3, 2] : null);
        center(pg, s, x + i * (cw + gap) + cw / 2, y + r * (h + gap) + h / 2, size, 'sansBold');
      });
    }
    return cw * per + gap * (per - 1) <= box.w + 0.5;
  }

  // ---------- maze ----------
  function drawMaze(pg, d, box, o) {
    var n = d.n, lab = o.solved ? 9 : 16, cs = Math.min((box.w - lab * 2) / n, (box.h - lab * 2) / n), W = cs * n, x = box.x + (box.w - W) / 2, y = box.y + lab + (o.solved ? 0 : Math.max(0, (box.h - lab * 2 - W) * 0.3));
    var lw = Math.max(0.9, Math.min(1.5, cs * 0.09)), r, c;
    if (o.solved && d.path) {
      var pts = [];
      d.path.forEach(function (rc) { pts.push(x + (rc[1] + 0.5) * cs, y + (rc[0] + 0.5) * cs); });
      pg.path(pts, Math.max(1.2, cs * 0.28), 0.4);
    }
    for (r = 0; r <= n; r++) for (c = 0; c < n; c++) if (d.walls.h[r][c]) pg.line(x + c * cs, y + r * cs, x + (c + 1) * cs, y + r * cs, lw);
    for (r = 0; r < n; r++) for (c = 0; c <= n; c++) if (d.walls.v[r][c]) pg.line(x + c * cs, y + r * cs, x + c * cs, y + (r + 1) * cs, lw);
    var size = o.solved ? 8.5 : 12;
    d.exits.forEach(function (e) {
      var ex = e.side === 'left' ? x - lab * 0.6 : e.side === 'right' ? x + W + lab * 0.6 : x + (e.c + 0.5) * cs;
      var ey = e.side === 'top' ? y - lab * 0.6 : e.side === 'bottom' ? y + W + lab * 0.6 : y + (e.r + 0.5) * cs;
      center(pg, e.label, ex, ey, size, 'sansBold');
    });
    pg.poly(starPts(x + (d.start[1] + 0.5) * cs, y + (d.start[0] + 0.5) * cs, cs * 0.4));
    return o.solved || cs >= 13;
  }

  // ---------- picture grid ----------
  function drawPicture(pg, d, box, o) {
    var R = d.R, C = d.C, maxRow = Math.max.apply(null, d.rows.map(function (x) { return x.length; })), maxCol = Math.max.apply(null, d.cols.map(function (x) { return x.length; }));
    var cs, size, W, H;
    if (o.solved) {
      cs = Math.min(box.w / C, box.h / R, 11); W = cs * C; H = cs * R;
      var sx = box.x + (box.w - W) / 2;
      for (var a = 0; a < R; a++) for (var b = 0; b < C; b++) {
        if (d.pic[a][b]) pg.rectFill(sx + b * cs, box.y + a * cs, cs, cs);
      }
      pg.box(sx, box.y, W, H, 1);
      return true;
    }
    cs = Math.min(box.w / (C + maxRow * 0.62), box.h / (R + maxCol * 0.72), 30);
    size = Math.max(7.5, Math.min(cs * 0.56, 12));
    var rowW = maxRow * size * 0.95 + 4, colH = maxCol * size * 1.12 + 4;
    cs = Math.min((box.w - rowW) / C, (box.h - colH) / R, 30);
    size = Math.max(7.5, Math.min(cs * 0.58, 12));
    rowW = maxRow * size * 0.95 + 4; colH = maxCol * size * 1.12 + 4;
    W = cs * C; H = cs * R;
    var x = box.x + (box.w - rowW - W) / 2 + rowW, y = box.y + Math.max(0, (box.h - colH - H) * 0.25) + colH, i, j, given = {};
    d.given.forEach(function (k) { given[k] = 1; });
    d.rows.forEach(function (cl, r) {
      var tx = x - 4;
      cl.slice().reverse().forEach(function (v) {
        pg.text(String(v), tx, y + (r + 0.5) * cs + lift(size, 'sansBold'), size, 'sansBold', { align: 'right' });
        tx -= size * 0.95;
      });
    });
    d.cols.forEach(function (cl, c) {
      var ty = y - 4;
      cl.slice().reverse().forEach(function (v) {
        pg.text(String(v), x + (c + 0.5) * cs, ty, size, 'sansBold', { align: 'center' });
        ty -= size * 1.12;
      });
    });
    Object.keys(given).forEach(function (k) { var p = k.split(',').map(Number); pg.rectFill(x + p[1] * cs + 0.8, y + p[0] * cs + 0.8, cs - 1.6, cs - 1.6, 0.55); });
    for (i = 0; i <= R; i++) pg.line(x, y + i * cs, x + W, y + i * cs, i === 0 || i === R || i % 5 === 0 ? 1.3 : 0.75, i === 0 || i === R || i % 5 === 0 ? 1 : 0.55);
    for (j = 0; j <= C; j++) pg.line(x + j * cs, y, x + j * cs, y + H, j === 0 || j === C || j % 5 === 0 ? 1.3 : 0.75, j === 0 || j === C || j % 5 === 0 ? 1 : 0.55);
    return cs >= 13;
  }

  // ---------- floor plan ----------
  function drawWalk(pg, d, box, o) {
    var n = d.n, lead = o.b * 1.25, size = o.b * 0.96, cs, W, x, y;
    if (o.solved) {
      cs = Math.min(box.w / n, box.h / n); W = cs * n; x = box.x + (box.w - W) / 2; y = box.y;
    } else {
      // the directions in two columns under the plan: their size gives way so the plan stays readable
      var cols = 2, per = Math.ceil(d.words.length / cols), textH;
      for (;;) {
        lead = size * 1.25;
        textH = per * lead * (d.words.some(function (t) { return wid(t, size, 'serif') > box.w / 2 - 8; }) ? 2 : 1) + 8;
        cs = Math.min((box.h - textH) / n, box.w / n, 34);
        if (cs >= 20 || size <= 8) break;
        size -= 0.25;
      }
      W = cs * n; x = box.x + (box.w - W) / 2; y = box.y;
      var ty = y + W + 8 + lead * 0.8, colW = box.w / cols;
      d.words.forEach(function (t, i) {
        var col = i < per ? 0 : 1, ls = wrap(t, size, 'serif', colW - 8);
        ls.forEach(function (l) {
          pg.text(l, box.x + col * colW, ty, size, 'serif');
          ty += lead;
        });
        if (i === per - 1) ty = y + W + 8 + lead * 0.8;
      });
    }
    var r, c, fs = Math.max(7.5, cs * 0.46);
    if (o.solved && d.route) {
      var pts = [];
      d.route.forEach(function (rc) { pts.push(x + (rc[1] + 0.5) * cs, y + (rc[0] + 0.5) * cs); });
      pg.path(pts, Math.max(1, cs * 0.2), 0.3);
    }
    for (r = 0; r <= n; r++) { pg.line(x, y + r * cs, x + W, y + r * cs, r % n === 0 ? 1.5 : 0.75, r % n === 0 ? 1 : 0.6); pg.line(x + r * cs, y, x + r * cs, y + W, r % n === 0 ? 1.5 : 0.75, r % n === 0 ? 1 : 0.6); }
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
      var cx = x + (c + 0.5) * cs, cy = y + (r + 0.5) * cs;
      if (d.start[0] === r && d.start[1] === c) pg.poly(starPts(cx, cy, cs * 0.34));
      else if (o.solved && d.end && d.end[0] === r && d.end[1] === c) { pg.ring(cx, cy, cs * 0.4, 1.3); center(pg, d.grid[r][c], cx, cy, fs, 'sansBold'); }
      else center(pg, d.grid[r][c], cx, cy, fs, 'sansBold', o.solved ? 0.6 : 1);
    }
    return o.solved || cs >= 15;
  }

  // ---------- gears ----------
  // odd gears are turned half a tooth, so a tooth of one sits in a gap of the next
  function gear(pg, cx, cy, r, first, odd) {
    var teeth = 12, pts = [], outer = r * 1.0, inner = r * 0.8;
    for (var i = 0; i < teeth; i++) {
      var s = Math.PI / teeth, a = i / teeth * Math.PI * 2 + (odd ? s : 0);
      [[-0.5, inner], [-0.28, outer], [0.28, outer], [0.5, inner]].forEach(function (k) {
        pts.push(cx + Math.cos(a + k[0] * s) * k[1], cy + Math.sin(a + k[0] * s) * k[1]);
      });
    }
    pg.path(pts, 1.1, 1, true);
    pg.ring(cx, cy, r * 0.22, 1);
    if (first) pg.dot(cx, cy, r * 0.22);
  }

  function drawGears(pg, d, box) {
    var rows = d.gears.map(function (g) { return g.r; }), cols = d.gears.map(function (g) { return g.c; });
    var r0 = Math.min.apply(null, rows), r1 = Math.max.apply(null, rows), c0 = Math.min.apply(null, cols), c1 = Math.max.apply(null, cols);
    var nr = r1 - r0 + 1, nc = c1 - c0 + 1, cs = Math.min((box.w - 8) / (nc + 0.1), (box.h - 8) / (nr + 0.1), 86), r = cs * 0.54;
    var x = box.x + (box.w - cs * nc) / 2, y = box.y + Math.max(4, (box.h - cs * nr) * 0.35);
    d.gears.forEach(function (g, i) { gear(pg, x + (g.c - c0 + 0.5) * cs, y + (g.r - r0 + 0.5) * cs, r, i === 0, (g.r + g.c) % 2 === 1); });
    // the arrow on the first gear, turning clockwise
    var f = d.gears[0], fx = x + (f.c - c0 + 0.5) * cs, fy = y + (f.r - r0 + 0.5) * cs, ar = r * 0.54, pts = [];
    for (var a = -150; a <= 60; a += 15) pts.push(fx + Math.cos(a * Math.PI / 180) * ar, fy + Math.sin(a * Math.PI / 180) * ar);
    pg.path(pts, 1.5);
    var hx = fx + Math.cos(60 * Math.PI / 180) * ar, hy = fy + Math.sin(60 * Math.PI / 180) * ar, hs = Math.max(3, r * 0.16);
    pg.poly([hx - hs * 1.15, hy + hs * 0.45, hx + hs * 0.9, hy + hs * 0.2, hx + hs * 0.1, hy - hs * 1.05]);
    return cs >= 34;
  }

  // ---------- clocks ----------
  function clockFace(pg, cx, cy, r, hour) {
    pg.ring(cx, cy, r, 1.5);
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      pg.line(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, cx + Math.cos(a) * r, cy + Math.sin(a) * r, i % 3 === 0 ? 1.2 : 0.75, 0.8);
    }
    var size = Math.max(7.5, r * 0.25);
    [[12, 0], [3, 90], [6, 180], [9, 270]].forEach(function (k) {
      var a = (k[1] - 90) * Math.PI / 180;
      center(pg, k[0], cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7, size, 'sans');
    });
    if (hour == null) { center(pg, '?', cx, cy, r * 0.6, 'sansBold'); return; }
    var h = (hour % 12) / 12 * Math.PI * 2 - Math.PI / 2;
    pg.line(cx, cy, cx + Math.cos(h) * r * 0.4, cy + Math.sin(h) * r * 0.4, Math.max(1.8, r * 0.06));
    pg.line(cx, cy, cx, cy - r * 0.52, Math.max(1, r * 0.03));
    pg.dot(cx, cy, Math.max(1.5, r * 0.05));
  }

  function drawClocks(pg, d, box) {
    var r = Math.min(box.w / 6.3, box.h / 4.3, 52), rowY = [box.y + r + 2, box.y + r * 3.2 + 2];
    var gap = Math.min(r * 2.3, box.w / 3), x0 = box.x + box.w / 2 - gap;
    d.hours.slice(0, 3).forEach(function (h, i) { clockFace(pg, x0 + i * gap, rowY[0], r, h); });
    clockFace(pg, box.x + box.w / 2 - gap / 2, rowY[1], r, d.hours[3]);
    clockFace(pg, box.x + box.w / 2 + gap / 2, rowY[1], r, null);
    return r >= 26;
  }

  // ---------- evidence board ----------
  function drawCount(pg, d, box) {
    var cs = Math.min(box.w / d.C, box.h / d.R, 52), W = cs * d.C, H = cs * d.R, x = box.x + (box.w - W) / 2, y = box.y + Math.max(0, (box.h - H) * 0.25), r = cs * 0.34;
    pg.box(x, y, W, H, 1.4);
    for (var a = 0; a < d.R; a++) for (var b = 0; b < d.C; b++) {
      var v = d.cells[a][b], cx = x + (b + 0.5) * cs, cy = y + (a + 0.5) * cs;
      ICONS[v.s](pg, cx - (v.dot ? cs * 0.07 : 0), cy, r);
      if (v.dot) pg.dot(cx + cs * 0.36, cy - cs * 0.28, Math.max(1.3, cs * 0.05));
    }
    return cs >= 26;
  }

  // ---------- word search ----------
  function drawSearch(pg, d, box, o) {
    var n = d.n, r, c;
    if (o.solved) {
      var cs0 = Math.min(box.w / n, box.h / n), x0 = box.x + (box.w - cs0 * n) / 2, keep = {};
      d.keep.forEach(function (k) { keep[k[0] + ',' + k[1]] = 1; });
      for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
        var mx = x0 + (c + 0.5) * cs0, my = box.y + (r + 0.5) * cs0, v0 = d.grid[r][c];
        if (v0 === '#') { pg.rectFill(x0 + c * cs0, box.y + r * cs0, cs0, cs0, 0.2); continue; }
        if (keep[r + ',' + c]) { pg.dot(mx, my, cs0 * 0.45, 0.22); center(pg, v0, mx, my, Math.max(7, cs0 * 0.58), 'sansBold'); }
        else center(pg, v0, mx, my, Math.max(7, cs0 * 0.58), 'sans', 0.45);
      }
      return true;
    }
    var size = Math.max(8.5, o.b * 0.86), lead = size * 1.3, cols = 3, per = Math.ceil(d.words.length / cols), listH = per * lead + 6;
    var cs = Math.min(box.w / n, (box.h - listH) / n, 32), W = cs * n, x = box.x + (box.w - W) / 2, y = box.y;
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
      var v = d.grid[r][c], cx = x + (c + 0.5) * cs, cy = y + (r + 0.5) * cs;
      if (v === '#') pg.rectFill(x + c * cs, y + r * cs, cs, cs, 0.22);
      else center(pg, v, cx, cy, Math.max(8, cs * 0.58), 'sansBold');
    }
    pg.box(x, y, W, W, 1.4);
    var ly = y + W + 6, colW = box.w / cols;
    d.words.forEach(function (w, i) {
      var col = Math.floor(i / per), row = i % per;
      pg.text(w, box.x + col * colW + colW / 2, ly + (row + 0.8) * lead, size, 'sans', { align: 'center' });
    });
    return cs >= 15;
  }

  // ---------- riddle ----------
  function drawRiddle(pg, d, box, o) {
    var size = Math.max(o.b * 1.08, 11), lead = size * 1.42, lines = [];
    d.text.split(/\n+/).forEach(function (para) { wrap(para, size, 'serif', box.w - 40).forEach(function (l) { lines.push(l); }); });
    var panelH = lines.length * lead + 30, y = box.y + 4;
    pg.box(box.x + 8, y, box.w - 16, panelH, 1.2);
    pg.box(box.x + 12, y + 4, box.w - 24, panelH - 8, 0.75, 0.45);
    lines.forEach(function (l, i) { pg.text(l, box.x + box.w / 2, y + 15 + lead * (i + 0.72), size, 'serif', { align: 'center' }); });
    y += panelH + 18;
    var os = Math.max(o.b, 10.5), rh = Math.min(38, (box.h - panelH - 26) / d.options.length), tile = Math.min(26, rh * 0.8);
    d.options.forEach(function (op, i) {
      var cy = y + (i + 0.5) * rh;
      pg.box(box.x + box.w * 0.18, cy - tile / 2, tile, tile, 1);
      center(pg, op.label, box.x + box.w * 0.18 + tile / 2, cy, tile * 0.62, 'sansBold');
      pg.text(op.text, box.x + box.w * 0.18 + tile + 10, cy + lift(os, 'serif'), os, 'serif');
    });
    return rh >= 18;
  }

  // ---------- the Field Kit: the plain alphabet with its numbers ----------
  function alphabetTable(pg, x, y, w) {
    var ABC = CX.engine.ABC, cw = w / 13, rh = cw * 0.92, size = Math.max(8, cw * 0.42), i;
    for (i = 0; i < 26; i++) {
      var r = i < 13 ? 0 : 1, cx = x + (i % 13) * cw;
      pg.box(cx, y + r * rh * 1.15, cw, rh, 0.75, 0.6);
      center(pg, ABC[i], cx + cw / 2, y + r * rh * 1.15 + rh * 0.3, size, 'sansBold');
      center(pg, i + 1, cx + cw / 2, y + r * rh * 1.15 + rh * 0.72, Math.max(7.5, size * 0.82), 'sans');
    }
    return rh * 2.15;
  }

  var DRAW = { letters: drawLetters, pigpen: drawPigpen, morse: drawMorse, codes: drawCodes, grille: drawGrille, sudoku: drawSudoku, logic: drawLogic, lock: drawLock, symbols: drawSymbols, sequence: drawSequence, maze: drawMaze, picture: drawPicture, walk: drawWalk, gears: drawGears, clocks: drawClocks, count: drawCount, search: drawSearch, riddle: drawRiddle };

  function draw(pg, d, box, o) { return DRAW[d.type](pg, d, box, o || {}); }

  // Puzzles whose answer is clearer as a picture, and how much room the picture takes.
  var SOLVED_H = { sudoku: 86, grille: 92, maze: 112, picture: 104, walk: 92, search: 104 };

  CX.draw = { draw: draw, ICONS: ICONS, SOLVED_H: SOLVED_H, pigKey: pigKey, morseChart: morseChart, alphabetTable: alphabetTable, starPts: starPts, wrap: wrap };
})(typeof window !== 'undefined' ? window : globalThis);
