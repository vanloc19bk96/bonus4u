/*
 * The fronts of the cover templates. Each layout draws into the front's safe box
 * f = { x, y, w, h, cx } (every word stays inside it) and may paint shapes out to the bleed:
 * f.X0..f.X1 across, 0..f.H down. A layout gets the sheet, f, the cover's words
 * w = { title, sub, author, count, large, kid }, the palette, the template's options, a scale k
 * (the cover shrinks k until res.fits) and a seeded random. It returns { fits, avoid, confetti }.
 *
 * The groups on a cover are decoration and never come from the book, so no cover gives an answer away.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var K = CX.cover.kit;

  // Groups to choose from: the cover shows the four that share least with the book.
  var GROUPS = [['Shades of blue', 'NAVY, TEAL, SKY, COBALT'], ['Card games', 'SNAP, RUMMY, BRIDGE, POKER'], ['___ ball', 'SNOW, FOOT, MEAT, EYE'], ['Hidden animals', 'SCATTER, BEARD, CANTEEN, DOGMA'],
    ['Things with wings', 'BAT, PLANE, ANGEL, MOTH'], ['Kinds of knot', 'BOW, REEF, GRANNY, HITCH'], ['Moon ___', 'LIGHT, BEAM, WALK, SHINE'], ['Hidden metals', 'SATIN, IRONY, GOLDEN, LEADER'],
    ['Things that ring', 'BELL, PHONE, ALARM, CHIME'], ['Shades of green', 'LIME, OLIVE, JADE, MINT']];
  var KID_GROUPS = [['Farm animals', 'COW, PIG, HEN, GOAT'], ['Colors', 'RED, BLUE, PINK, GREEN'], ['Fruit', 'APPLE, PEAR, PLUM, KIWI'], ['___ ball', 'FOOT, SNOW, BASKET, BEACH'],
    ['Shapes', 'STAR, HEART, OVAL, SQUARE'], ['Things that fly', 'KITE, BIRD, PLANE, BEE'], ['Zoo animals', 'LION, ZEBRA, PANDA, SEAL'], ['In the sky', 'SUN, MOON, CLOUD, STAR']];
  var TILE_INK = '#1B1B3A';

  function groups(w) {
    var pool = (w.kid ? KID_GROUPS : GROUPS).map(function (g, i) { return { i: i, n: w.project ? CX.plan.overlap(w.project, [g]) : 0, link: g[0].toUpperCase(), words: g[1].split(', ') }; });
    var used = {};
    return pool.slice().sort(function (a, b) { return a.n - b.n || a.i - b.i; }).filter(function (g) {
      // no answer twice on one cover (STAR is in two kid groups)
      if (g.words.some(function (x) { return used[x]; })) return false;
      g.words.forEach(function (x) { used[x] = 1; });
      return true;
    }).slice(0, 4).sort(function (a, b) { return a.i - b.i; });
  }
  function colors(pal) { return pal.groups || ['#F2CF5B', '#9FCB6E', '#8DB7E8', '#BC94D8']; }

  function title(sh, f, w, pal, k, top, o) {
    o = o || {};
    return K.textLines(sh, w.title, o.x == null ? f.x : o.x, top, o.w || f.w, Object.assign({ font: 'sansBold', lines: 4, color: pal.title, fill: 1.2, lead: 0.12 }, o, { max: (o.max || f.w * 0.14) * k, name: w.lead }));
  }

  // A solved group: a rounded bar with its link and its four answers.
  function bar(sh, x, y, w, h, g, color) {
    sh.rrect(x, y, w, h, h * 0.16, color);
    var ls = K.fitLine(g.link, 'sansBold', w * 0.86, h * 0.3, 0.06), ws = K.fitLine(g.words.join(', '), 'sans', w * 0.86, h * 0.26);
    sh.text(g.link, x + w / 2, y + h * 0.45, ls, 'sansBold', TILE_INK, { align: 'center', ls: ls * 0.06 });
    sh.text(g.words.join(', '), x + w / 2, y + h * 0.45 + ws * 1.35, ws, 'sans', TILE_INK, { align: 'center' });
  }

  // Tiles of answers: rows of four, each a rounded card with its word.
  function tiles(sh, x, y, w, rows, words, gap, th, fill, ink) {
    var tw = (w - gap * 3) / 4;
    var size = Math.min.apply(null, words.map(function (s) { return K.fitLine(s, 'sansBold', tw * 0.84, th * 0.36); }));
    for (var r = 0; r < rows; r++) for (var c = 0; c < 4; c++) {
      var s = words[(r * 4 + c) % words.length], tx = x + c * (tw + gap), ty = y + r * (th + gap);
      sh.rrect(tx, ty, tw, th, th * 0.16, fill);
      if (size >= 6) sh.text(s, tx + tw / 2, ty + th / 2 + size * 0.35, size, 'sansBold', ink, { align: 'center' });
    }
    return rows * th + (rows - 1) * gap;
  }

  // The answers of groups 2 to 4, mixed, as a board still to solve.
  function mixed(gs) {
    var all = [];
    for (var i = 0; i < 4; i++) for (var j = 1; j < 4; j++) all.push(gs[j].words[(i + j) % 4]);
    return all;
  }

  // Moves what was drawn since item start down into the free space above bottom (part of it).
  function settle(sh, start, end, bottom, part) {
    var dy = Math.max(0, (bottom - end) * part);
    if (dy) sh.shift(start, 0, dy);
  }

  var L = {};

  // Title on top, then the four solved groups as colored bars (the classic look of the niche).
  L.bars = function (sh, f, w, pal, o, k) {
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: pal.ink, font: 'sans' }, { color: pal.ink });
    var y = title(sh, f, w, pal, k, f.y + f.h * 0.02, {});
    // the bars take the room left, up to a comfortable height, and sit in the middle of it
    var gs = groups(w), c = colors(pal), gap = f.h * 0.022 * k, top = y + f.h * 0.04;
    var bh = Math.max(f.h * 0.07 * k, Math.min(f.h * 0.13, f.w * 0.22, (bottom - f.h * 0.03 - top - gap * 3) / 4)), start = sh.items.length;
    gs.forEach(function (g, i) { bar(sh, f.x, top + i * (bh + gap), f.w, bh, g, c[i]); });
    var end = top + 4 * bh + 3 * gap;
    settle(sh, start, end, bottom - f.h * 0.03, 0.5);
    return { fits: end <= bottom - f.h * 0.02, confetti: null };
  };

  // Title, then a board: one group already found as a bar, three rows of tiles still to sort.
  L.board = function (sh, f, w, pal, o, k) {
    var bottom = K.flow(sh, f, w, { kind: o.sub || 'box', fill: pal.a1, color: K.contrastOn(pal.a1) }, { color: pal.ink });
    var y = title(sh, f, w, pal, k, f.y + f.h * 0.02, { upper: !!o.upper });
    var gs = groups(w), c = colors(pal), gap = f.w * 0.025, th = f.w * 0.15 * k, top = y + f.h * 0.045;
    bar(sh, f.x, top, f.w, th, gs[0], c[0]);
    var h = tiles(sh, f.x, top + th + gap, f.w, 3, mixed(gs), gap, th, pal.card, pal.cardInk);
    return { fits: top + th + gap + h <= bottom - f.h * 0.02, confetti: null };
  };

  // A huge number of puzzles, the title, and a strip of the four group colors.
  L.count = function (sh, f, w, pal, o, k) {
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: pal.ink, font: 'sans' }, { color: pal.ink });
    var start = sh.items.length, n = String(w.count), ns = K.fitLine(n, 'sansBold', f.w * 0.7, f.h * 0.26 * k), y = f.y + f.h * 0.02 + K.capH('sansBold') * ns;
    sh.text(n, f.cx, y, ns, 'sansBold', pal.a1 === pal.bg ? pal.title : K.visible(pal.bg, pal.a1, pal.title), { align: 'center' });
    var ps = Math.min(f.w * 0.09, ns * 0.22);
    y += ps * 1.6;
    sh.text(w.large ? 'LARGE PRINT PUZZLES' : 'PUZZLES', f.cx, y, K.fitLine(w.large ? 'LARGE PRINT PUZZLES' : 'PUZZLES', 'sansBold', f.w * 0.8, ps, 0.18), 'sansBold', pal.ink, { align: 'center', ls: ps * 0.18 });
    var c = colors(pal), s = f.w * 0.16, gap = s * 0.25, sx = f.cx - (4 * s + 3 * gap) / 2, sy = y + f.h * 0.04;
    c.forEach(function (col, i) { sh.rrect(sx + i * (s + gap), sy, s, s * 0.62, s * 0.12, col); });
    var end = title(sh, f, w, pal, k, sy + s * 0.62 + f.h * 0.05, { max: f.w * 0.12 });
    settle(sh, start, end, bottom - f.h * 0.03, 0.35);
    return { fits: end <= bottom - f.h * 0.02, confetti: null };
  };

  // Calm: a serif title, a small board of colored squares, a thin frame.
  L.quiet = function (sh, f, w, pal, o, k) {
    sh.frame(f.x - f.w * 0.02, f.y - f.w * 0.02, f.w * 1.04, f.h + f.w * 0.04, pal.title, 1.2);
    var inner = { x: f.x + f.w * 0.06, y: f.y + f.h * 0.04, w: f.w * 0.88, h: f.h * 0.92, cx: f.cx, X0: f.X0, X1: f.X1, H: f.H, B: f.B };
    var bottom = K.flow(sh, inner, w, { kind: 'line', color: pal.ink, font: 'serif' }, { color: pal.ink, font: 'serif', lsK: 0.08, upper: true });
    var start = sh.items.length, y = title(sh, inner, w, pal, k, inner.y + inner.h * 0.03, { font: 'serifBold', max: inner.w * 0.13, fill: 1 });
    var c = colors(pal), bw = inner.w * 0.66 * k, gap = bw * 0.05, s = (bw - 3 * gap) / 4, bx = f.cx - bw / 2, by = y + inner.h * 0.07;
    for (var r = 0; r < 4; r++) for (var cc = 0; cc < 4; cc++) {
      var col = r === 0 ? c[0] : K.mix(pal.bg, pal.title, 0.12 + ((r * 4 + cc) % 3) * 0.05);
      sh.rrect(bx + cc * (s + gap), by + r * (s * 0.7 + gap), s, s * 0.7, s * 0.12, col);
    }
    var end = by + 4 * s * 0.7 + 3 * gap;
    settle(sh, start, end, bottom - inner.h * 0.03, 0.35);
    return { fits: end <= bottom - inner.h * 0.03, confetti: null };
  };

  // Bands of the four group colors behind a big title card.
  L.bands = function (sh, f, w, pal, o, k) {
    var c = colors(pal), bh = f.H / 4;
    c.forEach(function (col, i) { sh.rect(f.X0, i * bh, f.X1 - f.X0, bh + 0.5, col); });
    // answers only in the top and bottom bands, clear of the card
    var gs = groups(w);
    [0, 3].forEach(function (i) {
      var str = gs[i].words.join('   '), s = K.fitLine(str, 'sansBold', f.w, bh * 0.2);
      sh.text(str, f.cx, i * bh + bh * 0.5 + s * 0.35, s, 'sansBold', K.mix(c[i], TILE_INK, 0.55), { align: 'center' });
    });
    var cw = f.w, ch = f.h * 0.5, cy = f.y + f.h * 0.25;
    sh.rrect(f.x, cy, cw, ch, f.w * 0.04, pal.card);
    var inner = { x: f.x + cw * 0.07, y: cy + ch * 0.07, w: cw * 0.86, h: ch * 0.86, cx: f.cx, X0: f.x, X1: f.x + cw, H: f.H, B: f.B };
    var bottom = K.flow(sh, inner, w, { kind: 'plain', color: pal.cardInk, font: 'sans' }, { color: pal.cardInk });
    var end = title(sh, inner, w, Object.assign({}, pal, { title: pal.cardInk }), k, inner.y, { max: inner.w * 0.16 });
    return { fits: end <= bottom - inner.h * 0.03, confetti: null };
  };

  L.groups = groups;
  CX.coverFronts = L;
})(typeof window !== 'undefined' ? window : globalThis);
