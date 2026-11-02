/*
 * The fronts of the cover templates. Each layout draws into the front's safe box
 * f = { x, y, w, h, cx } (every word stays inside it) and may paint shapes out to the bleed:
 * f.X0..f.X1 across, 0..f.H down. A layout gets the sheet, f, the cover's words
 * w = { title, sub, author, count, large }, the palette, the template's options, a scale k (the
 * cover shrinks k until res.fits) and a seeded random. It returns { fits, avoid, confetti }.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var K = CX.cover.kit;

  // ---------- helpers ----------
  function center(sh, start, bottom, used, part) {
    var dy = Math.max(0, (bottom - used) * (part == null ? 0.45 : part));
    sh.shift(start, 0, dy);
    return dy;
  }
  function moved(boxes, dy) { return boxes.map(function (b) { return { x: b.x, y: b.y + dy, w: b.w, h: b.h }; }); }
  function on(pal, c) { return Math.abs(K.lum(c) - K.lum(pal.bg)) > 0.12; }
  function title(sh, f, w, pal, k, top, o) {
    return K.textLines(sh, w.title, o.x == null ? f.x : o.x, top, o.w || f.w, Object.assign({ font: 'sansBold', upper: false, lines: 4, color: pal.title, fill: 1.25, lead: 0.12 }, o, { max: (o.max || f.w * 0.14) * k }));
  }

  // The letters of the decoration. They never come from the book, so no cover gives an answer away.
  var FILLER = 'EARSTOLINUDHMGCBPWFYK';
  var TRAIL = 'FINDEVERYWORDONTHETRAIL';

  /*
   * A wandering trail from the top row to the bottom row of a cols x rows board, with a few steps
   * sideways so it never reads as a straight column: [[r, c]...].
   */
  function wander(cols, rows, rng, c0) {
    var c = c0 == null ? 1 + rng.int(Math.max(1, cols - 2)) : c0, out = [[0, c]], seen = {};
    seen['0,' + c] = 1;
    for (var r = 0; r < rows; r++) {
      if (r) {
        var nc = Math.max(0, Math.min(cols - 1, c + (rng.int(3) - 1)));
        out.push([r, nc]); c = nc; seen[r + ',' + c] = 1;
      }
      if (r < rows - 1 && rng.next() < 0.45) {
        var side = Math.max(0, Math.min(cols - 1, c + (rng.next() < 0.5 ? -1 : 1)));
        if (side !== c && !seen[r + ',' + side]) { out.push([r, side]); c = side; seen[r + ',' + side] = 1; }
      }
    }
    return out;
  }

  /*
   * A board of letter rounds with one highlighted trail. o: { fill, ink, hi, hiInk, line, rng, ring,
   * square, clip (letters only inside this box), holes (circles where rounds are left out) }. Returns the box it takes.
   */
  function board(sh, x, y, cs, cols, rows, o) {
    var rng = o.rng, trail = wander(cols, rows, rng, o.start), on2 = {}, r = cs * 0.43, i;
    trail.forEach(function (rc, n) { on2[rc[0] + ',' + rc[1]] = n + 1; });
    function cx(c) { return x + c * cs + cs / 2; }
    function cy(r2) { return y + r2 * cs + cs / 2; }
    function inside(px, py, s) { var b = o.clip; return !b || (px - s * 0.5 >= b.x && px + s * 0.5 <= b.x + b.w && py - s * 0.5 >= b.y && py + s * 0.5 <= b.y + b.h); }
    var pts = [];
    trail.forEach(function (rc) { pts.push(cx(rc[1]), cy(rc[0])); });
    for (var rr = 0; rr < rows; rr++) for (var c = 0; c < cols; c++) {
      if (on2[rr + ',' + c]) continue;
      var px = cx(c), py = cy(rr), size = cs * 0.48;
      if ((o.holes || []).some(function (h) { return Math.pow(px - h.x, 2) + Math.pow(py - h.y, 2) < Math.pow(h.r + r, 2); })) continue;
      if (o.square) sh.rrect(px - r, py - r, r * 2, r * 2, r * 0.25, o.fill);
      else if (o.ring) sh.ring(px, py, r, o.fill, Math.max(1, cs * 0.04));
      else sh.circle(px, py, r, o.fill);
      if (size >= 7 && inside(px, py, size)) sh.text(FILLER[(rr * 7 + c * 5 + rng.int(4)) % FILLER.length], px, py + size * 0.35, size, 'sansBold', o.ink, { align: 'center' });
    }
    sh.path(pts, o.hi, Math.max(1.5, cs * 0.34));
    for (i = 0; i < trail.length; i++) {
      var tx = pts[i * 2], ty = pts[i * 2 + 1], ts = cs * 0.5;
      if (o.square) sh.rrect(tx - r, ty - r, r * 2, r * 2, r * 0.25, o.hi);
      else sh.circle(tx, ty, r, o.hi);
      if (ts >= 7 && inside(tx, ty, ts)) sh.text(TRAIL[i % TRAIL.length], tx, ty + ts * 0.35, ts, 'sansBold', o.hiInk, { align: 'center' });
    }
    return { x: x, y: y, w: cols * cs, h: rows * cs };
  }

  // The colors a board takes on a palette.
  function boardInks(pal, rng) {
    var fill = pal.a2, hi = pal.a1;
    return { fill: fill, ink: K.contrastOn(fill), hi: hi, hiInk: K.contrastOn(hi), rng: rng };
  }

  // Where the seals go: LARGE PRINT and how many puzzles the book has, inside f, over the board's lower corners.
  function sealSpots(f, w, box, k) {
    var r = Math.min(f.w * 0.135, box.h * 0.3) * Math.max(0.8, k), out = [];
    if (r < 22) return out;
    var y = Math.min(f.y + f.h - r, box.y + box.h - r * 0.55);
    if (w.large) out.push({ x: Math.max(f.x + r, box.x - r * 0.1), y: y, r: r, lines: ['LARGE', 'PRINT'], o: { ring: true } });
    out.push({ x: Math.min(f.x + f.w - r, box.x + box.w + r * 0.1), y: y, r: r, lines: [String(w.count), 'PUZZLES'], o: { points: 14 } });
    return out;
  }
  function drawSeals(sh, spots, pal) {
    var fill = on(pal, pal.a3) ? pal.a3 : pal.a1, ink = K.contrastOn(fill);
    return spots.map(function (s) {
      K.seal(sh, s.x, s.y, s.r, s.lines, fill, ink, s.o);
      return { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
    });
  }

  /*
   * The common shape: title on top (or under the art with o.artTop), the art in the height left
   * (art(y, h) returns { avoid }), then subtitle and pen name, the group centered in the space.
   */
  function artFlow(sh, f, w, pal, k, o) {
    var bottom = K.flow(sh, f, w, o.sub, o.foot);
    var start = sh.items.length, gap = (o.gap || f.w * 0.05) * k, y = f.y, r, tO = o.title || {};
    var tH = K.measure(sh, function () { return title(sh, f, w, pal, k, 0, tO); });
    var h = Math.min(o.maxH || 1e9, bottom - f.y - tH - gap * 2);
    if (o.artTop) { r = o.art(y, h) || {}; y = title(sh, f, w, pal, k, y + h + gap, tO); }
    else { y = title(sh, f, w, pal, k, y, tO) + gap; r = o.art(y, h) || {}; y += h; }
    var dy = center(sh, start, bottom - gap * 0.5, y, o.part);
    return { fits: h >= (o.minH || f.w * 0.5), avoid: moved(r.avoid || [], dy), dy: dy };
  }

  // A board as big as the room allows, with the seals beside it.
  function fittedBoard(sh, f, w, pal, k, rng, o) {
    return function (y, h) {
      var cols = o.cols || 6, cs = Math.min((o.wide || 0.82) * f.w / cols, h / (o.minRows || 5)), rows = Math.max(o.minRows || 5, Math.min(o.maxRows || 7, Math.floor(h / cs)));
      var gx = f.cx - cols * cs / 2, gy = y + (h - rows * cs) / 2;
      var spots = sealSpots(f, w, { x: gx, y: gy, w: cols * cs, h: rows * cs }, k);
      var b = board(sh, gx, gy, cs, cols, rows, Object.assign(boardInks(pal, rng), o.ink || {}, { holes: spots }));
      return { avoid: [b].concat(drawSeals(sh, spots, pal)) };
    };
  }

  var F = {};

  // The look readers know: a board of round letters and one bright trail under the title.
  F.bubbles = function (sh, f, w, pal, opt, k, rng) {
    return artFlow(sh, f, w, pal, k, {
      sub: { kind: 'plain', color: pal.ink }, foot: { color: pal.ink },
      title: { max: f.w * 0.15 }, art: fittedBoard(sh, f, w, pal, k, rng, opt)
    });
  };

  // Rounded letter tiles.
  F.tiles = function (sh, f, w, pal, opt, k, rng) {
    return artFlow(sh, f, w, pal, k, {
      sub: { kind: 'box', fill: pal.card, color: pal.cardInk }, foot: { color: pal.ink },
      title: { max: f.w * 0.15, colors: [pal.title, K.visible(pal.bg, pal.a3, pal.a1, pal.ink)] },
      art: fittedBoard(sh, f, w, pal, k, rng, { ink: { square: true }, cols: 6 })
    });
  };

  // The title in a colored band across the top, the board on the plain ground below.
  F.band = function (sh, f, w, pal, opt, k, rng) {
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: pal.ink }, { color: pal.ink });
    var bandFill = on(pal, pal.a1) ? pal.a1 : pal.dark, ink = K.contrastOn(bandFill), pad = f.w * 0.06;
    var tH = K.measure(sh, function () { return title(sh, f, w, pal, k, 0, { color: ink, max: f.w * 0.15 }); });
    var bandH = f.y + tH + pad;
    sh.rect(f.X0, 0, f.X1 - f.X0, bandH, bandFill);
    title(sh, f, w, pal, k, f.y, { color: ink, max: f.w * 0.15 });
    var y = bandH + f.w * 0.05, h = bottom - y - f.w * 0.04;
    var art = fittedBoard(sh, f, w, pal, k, rng, { ink: { hi: K.visible(pal.bg, pal.a3, pal.a1), hiInk: K.contrastOn(K.visible(pal.bg, pal.a3, pal.a1)) } })(y, h);
    return { fits: h >= f.w * 0.5, avoid: art.avoid };
  };

  // The board runs off the bottom corner of the book, the title stands above it, set left.
  F.corner = function (sh, f, w, pal, opt, k, rng) {
    var bottom = f.y + f.h, tO = { align: 'left', max: f.w * 0.16, fill: 1.1 };
    var y = title(sh, f, w, pal, k, f.y, tO);
    if (w.sub) { var m = K.subLines(w.sub, { kind: 'plain', w: f.w * 0.9 }, f); y = K.subtitle(sh, f, w.sub, y + f.w * 0.03, { kind: 'plain', color: pal.ink, w: f.w * 0.92 }) + m.size * 0.2; }
    if (w.author) { var as = Math.max(11, Math.min(16, f.w * 0.05)); y += as * 1.4; sh.text(w.author, f.x, y, K.fitLine(w.author, 'sansBold', f.w, as), 'sansBold', pal.ink); }
    var top = y + f.w * 0.05, room = f.H - top, cs = Math.max(f.w * 0.17, Math.min(f.w * 0.2, room / 4.2));
    var cols = Math.ceil((f.X1 - f.X0) / cs) + 1, rows = Math.ceil(room / cs) + 1;
    var gx = f.X1 - cols * cs + cs * 0.4;
    var b = board(sh, gx, top, cs, cols, rows, Object.assign(boardInks(pal, rng), { clip: f, start: Math.floor(cols * 0.6) }));
    return { fits: room >= cs * 3 && bottom > top, avoid: [b] };
  };

  // Rounds all the way round the edge of the cover, the words inside.
  F.frame = function (sh, f, w, pal, opt, k, rng) {
    var cs = f.w * 0.1, ink = boardInks(pal, rng), r = cs * 0.4;
    var X0 = f.X0 + cs * 0.1, cols = Math.floor((f.X1 - f.X0 - cs * 0.2) / cs), rows = Math.floor((f.H - cs * 0.2) / cs);
    var stepX = (f.X1 - f.X0 - cs * 0.2) / cols, stepY = (f.H - cs * 0.2) / rows, n = 0, pts = [];
    function dotAt(c, rr) { pts.push([X0 + c * stepX + stepX / 2, cs * 0.1 + rr * stepY + stepY / 2]); }
    for (var c = 0; c < cols; c++) dotAt(c, 0);
    for (var rr = 1; rr < rows; rr++) dotAt(cols - 1, rr);
    for (c = cols - 2; c >= 0; c--) dotAt(c, rows - 1);
    for (rr = rows - 2; rr > 0; rr--) dotAt(0, rr);
    var hiFrom = Math.floor(pts.length * 0.08), hiTo = Math.floor(pts.length * 0.42), line = [];
    pts.forEach(function (pt, i) { if (i >= hiFrom && i <= hiTo) line.push(pt[0], pt[1]); });
    pts.forEach(function (pt, i) { if (!(i >= hiFrom && i <= hiTo)) sh.circle(pt[0], pt[1], r, ink.fill); });
    sh.path(line, ink.hi, cs * 0.3);
    for (n = 0; n < line.length; n += 2) sh.circle(line[n], line[n + 1], r, ink.hi);
    var box = { x: X0 + stepX * 1.05, y: cs * 0.1 + stepY * 1.05, w: f.X1 - f.X0 - cs * 0.2 - stepX * 2.1, h: f.H - cs * 0.2 - stepY * 2.1 };
    var inner = { x: Math.max(f.x, box.x), y: Math.max(f.y, box.y), w: 0, h: 0 };
    inner.w = Math.min(f.x + f.w, box.x + box.w) - inner.x; inner.h = Math.min(f.y + f.h, box.y + box.h) - inner.y;
    inner.cx = inner.x + inner.w / 2; inner.X0 = f.X0; inner.X1 = f.X1; inner.H = f.H;
    var bottom = K.flow(sh, inner, w, { kind: 'line', color: pal.ink, w: inner.w * 0.9 }, { color: pal.ink });
    var start = sh.items.length;
    var used = title(sh, inner, w, pal, k, inner.y, { x: inner.x, w: inner.w, max: inner.w * 0.17, lines: 5 });
    var fits = used <= bottom - inner.w * 0.05;
    center(sh, start, bottom, used, 0.42);
    return { fits: fits, avoid: [] };
  };

  // A huge puzzle count over a strip of the board.
  F.count = function (sh, f, w, pal, opt, k, rng) {
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: pal.ink }, { color: pal.ink });
    var start = sh.items.length, y = f.y, num = String(w.count);
    y = title(sh, f, w, pal, k, y, { max: f.w * 0.115, lines: 3 }) + f.w * 0.03;
    var ns = Math.min(K.fitLine(num, 'sansBold', f.w * 0.8, f.w * 0.45), (bottom - y) * 0.42) * k;
    var hi = K.visible(pal.bg, pal.a1, pal.a3, pal.title);
    y += K.capH('sansBold') * ns;
    sh.text(num, f.cx, y, ns, 'sansBold', hi, { align: 'center' });
    y += ns * 0.14;
    var pw = K.fitLine('PUZZLES', 'sansBold', f.w * 0.6, ns * 0.3, 0.1);
    y += K.capH('sansBold') * pw;
    sh.text('PUZZLES', f.cx, y, pw, 'sansBold', pal.ink, { align: 'center', ls: pw * 0.1 });
    y += f.w * 0.05;
    var room = bottom - y - f.w * 0.03, cs = Math.min(f.w / 6, room / 2), rows = Math.max(1, Math.min(3, Math.floor(room / cs))), b = null;
    if (rows >= 1 && cs >= f.w * 0.09) b = board(sh, f.cx - 3 * cs, y, cs, 6, rows, boardInks(pal, rng));
    var used = b ? y + rows * cs : y;
    var dy = center(sh, start, bottom - f.w * 0.02, used, 0.45);
    return { fits: !!b, avoid: b ? moved([b], dy) : [] };
  };

  // One thick winding trail across the whole cover, rounds along it, the words in the clear space.
  F.ribbon = function (sh, f, w, pal, opt, k) {
    var ink = boardInks(pal), bottom = K.flow(sh, f, w, { kind: 'ribbon', fill: ink.hi, color: ink.hiInk }, { color: pal.ink });
    var tH = K.measure(sh, function () { return title(sh, f, w, pal, k, 0, { max: f.w * 0.15 }); });
    var top = f.y + tH + f.w * 0.05, room = bottom - top - f.w * 0.04, r = Math.min(f.w * 0.075, room / 7), pts = [], rounds = [], n = 26;
    for (var i = 0; i <= n; i++) {
      var t = i / n, x = f.X0 - r + (f.X1 - f.X0 + r * 2) * t, y = top + room / 2 + Math.sin(t * Math.PI * 3.2) * (room / 2 - r * 1.2);
      pts.push(x, y);
      if (i % 3 === 1) rounds.push([x, y]);
    }
    sh.path(pts, ink.hi, r * 1.1);
    rounds.forEach(function (o, j) {
      sh.circle(o[0], o[1], r, ink.fill);
      var s = r * 1.05;
      if (s >= 7 && o[0] - s > f.x && o[0] + s < f.x + f.w) sh.text(TRAIL[j % TRAIL.length], o[0], o[1] + s * 0.35, s, 'sansBold', ink.ink, { align: 'center' });
    });
    title(sh, f, w, pal, k, f.y, { max: f.w * 0.15 });
    return { fits: room >= f.w * 0.5, avoid: [{ x: f.X0, y: top, w: f.X1 - f.X0, h: room }] };
  };

  // The first words of the title spelled in rounds on a trail, the rest of it below.
  F.spelled = function (sh, f, w, pal, opt, k, rng) {
    var words = String(w.title).split(/\s+/).filter(Boolean), head = [], letters = 0;
    while (words.length && head.length < 2 && words[0].replace(/[^A-Za-z]/g, '').length + letters <= 14 && words[0].replace(/[^A-Za-z]/g, '').length <= 7) {
      var one = words.shift(); head.push(one); letters += one.replace(/[^A-Za-z]/g, '').length;
    }
    if (!head.length) return F.bubbles(sh, f, w, pal, opt, k, rng);
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: pal.ink }, { color: pal.ink });
    var start = sh.items.length, ink = boardInks(pal, rng), y = f.y;
    var longest = Math.max.apply(null, head.map(function (x) { return x.replace(/[^A-Za-z]/g, '').length; }));
    var cs = Math.min(f.w / Math.max(longest, 4), f.w * 0.2) * k, r = cs * 0.45;
    var plates = [];
    head.forEach(function (word) {
      var ls = word.toUpperCase().replace(/[^A-Z]/g, '').split(''), x0 = f.cx - ls.length * cs / 2, line = [];
      ls.forEach(function (ch, i) {
        // each word reads left to right; the rounds step up and down so the line looks like a trail
        var cx = x0 + i * cs + cs / 2, cy = y + cs / 2 + (i % 2 ? cs * 0.08 : -cs * 0.08) + cs * 0.1;
        line.push(cx, cy); plates.push([cx, cy, ch]);
      });
      sh.path(line, ink.hi, cs * 0.3);
      y += cs * 1.15;
    });
    plates.forEach(function (o) {
      sh.circle(o[0], o[1], r, ink.hi);
      sh.text(o[2], o[0], o[1] + r * 0.72 * 0.35 * 2, r * 1.4, 'sansBold', ink.hiInk, { align: 'center' });
    });
    y += cs * 0.2;
    var rest = words.join(' ');
    if (rest) { y = K.textLines(sh, rest, f.x, y, f.w, { font: 'sansBold', lines: 3, color: pal.title, max: f.w * 0.11 * k, fill: 1.1 }) + f.w * 0.04; }
    var h = bottom - y - f.w * 0.03, av = [], fits = true;
    if (h >= f.w * 0.35) av = fittedBoard(sh, f, w, pal, k, rng, { minRows: 3, maxRows: 5, wide: 0.72 })(y, h).avoid;
    else fits = h > 0;
    var used = h >= f.w * 0.35 ? y + h : y;
    var dy = center(sh, start, bottom, used, 0.4);
    return { fits: fits, avoid: moved(av, dy) };
  };

  // Quiet: fine rings on a pale ground, one trail, a serif title.
  F.quiet = function (sh, f, w, pal, opt, k, rng) {
    var ink = boardInks(pal, rng);
    return artFlow(sh, f, w, pal, k, {
      sub: { kind: 'line', color: pal.ink, font: 'serif' }, foot: { color: pal.ink, font: 'serif' },
      title: { font: 'serifBold', max: f.w * 0.15, fill: 1.1 },
      art: fittedBoard(sh, f, w, pal, k, rng, { ink: { ring: true, fill: K.mix(pal.bg, pal.ink, 0.5), ink: pal.ink, hi: ink.hi, hiInk: ink.hiInk }, wide: 0.78 })
    });
  };

  // The whole front is a board; the words sit on a card in the middle.
  F.card = function (sh, f, w, pal, opt, k, rng) {
    var cs = (f.X1 - f.X0) / 6, rows = Math.ceil(f.H / cs), ink = boardInks(pal, rng);
    board(sh, f.X0, 0, cs, 6, rows, Object.assign(ink, { clip: { x: -1e6, y: -1e6, w: 0, h: 0 }, start: 1 }));
    var pad = f.w * 0.07, inner = { x: f.x + pad, w: f.w - pad * 2, y: 0, h: 0 };
    inner.cx = inner.x + inner.w / 2; inner.X0 = f.X0; inner.X1 = f.X1; inner.H = f.H;
    var tO = { x: inner.x, w: inner.w, color: pal.cardInk, max: inner.w * 0.17, lines: 5 };
    var tH = K.measure(sh, function () { return title(sh, inner, w, pal, k, 0, tO); });
    var m = w.sub ? K.subLines(w.sub, { kind: 'plain', w: inner.w }, inner) : { h: 0 };
    var as = w.author ? Math.max(11, Math.min(15, f.w * 0.05)) : 0;
    var cardH = tH + m.h + as * 2 + pad * 2.4, y = f.y + Math.max(0, (f.h - cardH) * 0.42);
    sh.rrect(f.x, y, f.w, cardH, pad * 0.5, pal.card);
    var yy = title(sh, inner, w, pal, k, y + pad, tO);
    if (w.sub) yy = K.subtitle(sh, inner, w.sub, yy + pad * 0.4, { kind: 'plain', color: pal.cardInk, w: inner.w });
    if (w.author) sh.text(w.author, f.cx, yy + as * 1.6, K.fitLine(w.author, 'sansBold', inner.w, as), 'sansBold', pal.cardInk, { align: 'center' });
    return { fits: cardH <= f.h, avoid: [] };
  };

  CX.coverFronts = F;
})(typeof window !== 'undefined' ? window : globalThis);
