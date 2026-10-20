/*
 * The 50 cover designs. Each design is a front layout (how the front is drawn) plus its colors and
 * a few options; the spine and the back are shared (js/core/cover.js) and take the design's colors.
 * The layouts follow the looks that sell in the find-the-killer genre on Amazon: the redacted
 * register, the stacked name-list title, case files and evidence bags, newspaper front pages,
 * tickets and boarding passes, travel posters, hotel and hospital fronts, maps, CCTV stills,
 * line-ups, fingerprints, and seasonal editions. Every word stays inside KDP's safe area and at
 * 7 pt or more, and the front always shows real data from the case (names, numbers, times).
 *
 * A front layout receives a context c: { sh, kit, pal, opt, x, y, w, h (the front trim box),
 * bleed, W, H, title, author, kicker, line, question, N, K, cs, type, unit, project, rng }.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var A = LK.coverArt;
  var PT = 72, MIN = 7;
  var mix = A.mix;

  // ---------- helpers ----------
  function sc(c) { return c.w / (6 * PT); }
  // the front plus its bleed on the right, top and bottom
  function bg(c, color) { c.sh.rect(c.x, 0, c.W - c.x, c.H, color); }
  function inner(c, m) { m = m == null ? 0.36 * PT : m; return { x: c.x + m, y: c.y + m, w: c.w - 2 * m, h: c.h - 2 * m }; }
  // the size (and narrowing) at which a line fits maxW; under 7 pt it narrows instead of shrinking
  function fit(c, str, maxW, cap, font, lsK, hs) {
    var k = c.kit;
    hs = hs || 1; lsK = lsK || 0;
    var size = k.fitSize(str, font, maxW, cap, lsK, hs);
    if (size < MIN) {
      size = MIN;
      var w = k.width(str, MIN, font, MIN * lsK, hs);
      if (w > maxW) hs = hs * maxW / w;
    }
    return { size: size, hs: hs, ls: size * lsK };
  }
  // one line of text fitted to maxW; x is the left edge, center or right edge per o.align
  function say(c, str, x, y, maxW, cap, font, color, o) {
    o = o || {};
    if (!str) return 0;
    var f = fit(c, str, maxW, cap, font, o.lsK, o.hs);
    c.sh.spaced(str, x, y, f.size, font, color, f.ls, o.align || 'center', f.hs);
    return f.size;
  }
  // wrapped text, returns the baseline of the last line
  function para(c, str, x, y, maxW, size, font, color, lead, align, maxLines) {
    size = Math.max(MIN, size);
    var lines = c.kit.wrap(str, size, font, maxW).slice(0, maxLines || 99);
    lines.forEach(function (l, i) {
      var yy = y + i * size * (lead || 1.3);
      if (align === 'center') c.sh.center(l, x + maxW / 2, yy, size, font, color);
      else c.sh.text(l, x, yy, size, font, color);
    });
    return y + (lines.length - 1) * size * (lead || 1.3);
  }
  /*
   * The title in a box. o: { font, hs, cap, align, color, accent (last line), colors(i, n), lead,
   * keepCase, minLines, maxLines, valign }. Returns the lines, their widths and the box it used.
   */
  function title(c, b, o) {
    var k = c.kit, font = o.font || 'sansBold', hs = o.hs || 1, lead = o.lead || 0.96;
    var words = c.title.split(/\s+/).filter(Boolean).length;
    var tl = k.titleLines(c.title, b.w, b.h, (o.cap || 1.7 * PT) * sc(c), { font: font, hs: hs, lead: lead, keepCase: o.keepCase, minLines: Math.min(o.minLines || 1, words), maxLines: o.maxLines });
    var F = k.font(font), size = tl.size, n = tl.lines.length, capH = F.capHeight * size, gap = size * lead;
    var total = capH + gap * (n - 1);
    var y0 = b.y + (o.valign === 'center' ? (b.h - total) / 2 : o.valign === 'bottom' ? b.h - total : 0) + capH;
    var widths = [];
    tl.lines.forEach(function (l, i) {
      var w = k.width(l, size, font, 0, hs);
      widths.push(w);
      var x = o.align === 'left' ? b.x : o.align === 'right' ? b.x + b.w - w : b.x + (b.w - w) / 2;
      var col = o.colors ? o.colors(i, n, l) : (n > 1 && i === n - 1 && o.accent ? o.accent : o.color);
      if (!o.dry) c.sh.text(l, x, y0 + gap * i, size, font, col, 0, hs);
    });
    var descent = o.keepCase ? F.descent * size * 0.8 : 0;
    return { top: y0 - capH, base: y0, bottom: y0 + gap * (n - 1) + descent, size: size, lines: tl.lines, widths: widths, n: n, gap: gap, capH: capH, font: font, hs: hs };
  }
  // draws fn now but files its items under everything drawn since start, so art laid out
  // around the words never covers them
  function under(c, start, fn) {
    var mark = c.sh.items.length;
    fn();
    var art = c.sh.items.splice(mark);
    Array.prototype.splice.apply(c.sh.items, [start, 0].concat(art));
  }
  function upperFirst(s) { s = String(s).toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- data from the case ----------
  function columns(c) {
    if (c.type.id === 'lottery') return [{ key: 'ticket', head: 'TICKET #' }, { key: 'time', head: 'TIME' }, { key: 'place', head: c.cs.venue.placeShort }, { key: 'amount', head: 'PAID' }, { key: 'method', head: 'METHOD' }];
    return c.type.columns(c.cs);
  }
  function primary(c) {
    var cols = columns(c);
    for (var i = 0; i < cols.length; i++) if (cols[i].key === 'name') return 'name';
    return cols[0].key;
  }
  // n different records, never the killer's, the same ones every time for this book
  function picks(c, n, salt) {
    var rng = LK.util.makeRng('cover-pick:' + c.project.seed + ':' + (salt || '')), out = [], seen = {}, N = c.cs.records.length;
    for (var g = 0; out.length < Math.min(n, N - 1) && g < n * 30; g++) {
      var i = rng.int(N);
      if (i === c.cs.killerIndex || seen[i]) continue;
      seen[i] = 1; out.push(i);
    }
    return out;
  }
  function rows(c, n, salt) { return picks(c, n, salt).map(function (i) { return c.type.row(c.cs.records[i], c.cs); }); }
  function values(c, n, salt) {
    var key = primary(c);
    return rows(c, n, salt).map(function (r) { return c.type.id === 'lottery' ? 'No. ' + r[key] : String(r[key]); });
  }
  function field(c, keys, salt) {
    var r = rows(c, 1, salt)[0] || {};
    for (var i = 0; i < keys.length; i++) if (r[keys[i]]) return String(r[keys[i]]);
    return '';
  }
  function times(c, n) {
    var cols = columns(c).map(function (x) { return x.key; });
    var key = ['time', 'clock'].filter(function (k) { return cols.indexOf(k) !== -1; })[0];
    if (!key) return ['21:04', '21:37', '22:15', '22:48', '23:26', '23:59'].slice(0, n);
    return rows(c, n, 'times').map(function (r) { return String(r[key]); });
  }
  function caseNo(c) { return String(1000 + (LK.util.hashString ? LK.util.hashString(c.project.seed) % 9000 : 1704)); }
  function whoWord(c) { return c.type.target.who.replace(/^the /, '').toUpperCase(); }

  // a list of values in columns; some struck through, one circled. Returns the bottom.
  function nameGrid(c, b, o) {
    var sh = c.sh, k = c.kit, fs = Math.max(MIN, o.size || 9.5 * sc(c)), font = o.font || 'sans';
    var vals = values(c, 40, o.salt || 'grid');
    var colW = Math.max.apply(null, vals.map(function (v) { return k.width(v, fs, font); })) + fs * 1.6;
    var cols = Math.max(1, Math.min(o.maxCols || 3, Math.floor((b.w + fs * 1.6) / colW)));
    var lead = fs * (o.lead || 1.75), rowsN = Math.max(1, Math.min(o.maxRows || 6, Math.floor(b.h / lead)));
    var cw = b.w / cols, rng = LK.util.makeRng('grid:' + c.project.seed), circled = Math.floor(rowsN / 2) * cols + Math.min(1, cols - 1);
    for (var r = 0; r < rowsN; r++) for (var q = 0; q < cols; q++) {
      var i = r * cols + q, v = vals[i];
      if (!v) continue;
      var x = b.x + q * cw, y = b.y + r * lead + fs;
      sh.text(v, x, y, fs, font, o.color);
      var w = k.width(v, fs, font);
      if (i === circled) {
        sh.ellipse(x + w / 2, y - fs * 0.32, w / 2 + fs * 0.7, fs * 0.95, o.mark, Math.max(1.2, fs * 0.15));
        sh.ellipse(x + w / 2 + 1, y - fs * 0.36, w / 2 + fs * 0.62, fs * 0.86, o.mark, Math.max(0.6, fs * 0.06));
      } else if (rng.next() < (o.strike == null ? 0.45 : o.strike)) sh.line(x - 1, y - fs * 0.3, x + w + 1, y - fs * 0.3, o.strikeColor || o.color, Math.max(0.8, fs * 0.1));
    }
    return b.y + rowsN * lead;
  }
  // a short dashed line
  function dashed(sh, x1, y1, x2, y2, c, lw, dash) {
    var L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.floor(L / (dash * 2)));
    for (var i = 0; i < n; i++) {
      var t0 = i * 2 * dash / L, t1 = Math.min(1, (i * 2 + 1) * dash / L);
      sh.line(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0, x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1, c, lw);
    }
  }
  // the author's name, letterspaced, centered on cx
  function byline(c, cx, y, maxW, cap, color, font) {
    return say(c, c.author.toUpperCase(), cx, y, maxW, cap, font || 'serifBold', color, { lsK: 0.12 });
  }
  // a palette for the register snippet drawn on a light card
  function snippetPal(p, ink, paper) {
    return { head: ink, headInk: paper, band: mix(paper, ink, 0.09), ink: ink, mark: p.mark };
  }
  function snippet(c, cx, top, w, h, rowsN, pal) {
    var rowH = Math.min(22 * sc(c), h / (rowsN + 1));
    if (rowH < 9.5) return top;
    var t0 = top + (h - rowH * (rowsN + 1)) / 2;
    c.kit.registerSnippet(c.sh, pal, c.cs, cx, t0, w, rowH, rowsN, c.project.seed);
    return t0 + rowH * (rowsN + 1);
  }

  // ---------- 1. stacked: a huge flush-left title over a list of names (The Killer Isn't Alice) ----------
  function stacked(c) {
    var sh = c.sh, p = c.pal, s = sc(c), o = c.opt;
    bg(c, p.frame);
    var bw = 0.2 * PT, px = c.x + bw, py = c.y + bw, pw = c.w - bw * 2, ph = c.h - bw * 2;
    sh.rect(px, py, pw, ph, p.panel);
    var b = inner(c, 0.42 * PT);
    var ls = say(c, c.line, b.x, b.y + 9 * s, b.w, 11 * s, 'sansBold', p.accent, { align: 'left', lsK: 0.03 });
    var T = title(c, { x: b.x, y: b.y + ls + 16 * s, w: b.w, h: c.h * 0.42 }, { hs: 0.8, cap: 1.6 * PT, align: 'left', color: p.ink, accent: p.accent2 || p.accent, lead: 0.9, minLines: 3 });
    // a handwritten note beside the short lines of the title
    var note = o.note || upperFirst(c.question);
    var free = T.widths.map(function (w) { return b.w - w; }), best = null;
    for (var i = 0; i < T.n; i++) for (var j = i; j < T.n; j++) {
      var room = Math.min.apply(null, free.slice(i, j + 1));
      if (room >= b.w * 0.34 && (!best || j - i > best.j - best.i)) best = { i: i, j: j, room: room };
    }
    if (best) {
      var nw = best.room - 14 * s, ncx = b.x + b.w - best.room / 2 + 6 * s;
      var ncy = T.base + T.gap * (best.i + best.j) / 2 - T.capH / 2;
      var ns = Math.max(MIN, Math.min(15 * s, T.gap * (best.j - best.i + 1) / 4));
      var nl = c.kit.wrap(note, ns, 'serif', nw * 0.78).slice(0, 3);
      var nh = nl.length * ns * 1.15;
      nl.forEach(function (l, q) { sh.center(l, ncx, ncy - nh / 2 + ns * 0.85 + q * ns * 1.15, ns, 'serif', p.mark); });
      var nW = Math.max.apply(null, nl.map(function (l) { return c.kit.width(l, ns, 'serif'); }));
      sh.ellipse(ncx, ncy, nW / 2 + ns * 1.1, nh / 2 + ns * 0.9, p.mark, 1.6 * s);
      sh.ellipse(ncx + 1.5, ncy - 1, nW / 2 + ns * 1.0, nh / 2 + ns * 0.8, p.mark, 0.7 * s);
    }
    var ky = T.bottom + 18 * s;
    var ks = say(c, c.kicker, b.x, ky, b.w, 12.5 * s, 'sansBold', p.accent, { align: 'left', lsK: 0.02 });
    var ah = 0.44 * PT, areaTop = ky + ks + 10 * s, areaBot = py + ph - ah - 10 * s;
    var gw = o.figure ? b.w * 0.64 : b.w;
    nameGrid(c, { x: b.x, y: areaTop, w: gw, h: areaBot - areaTop }, { color: p.ink, mark: p.mark, size: 10.5 * s, maxRows: 16, lead: 1.8 });
    if (o.figure) {
      var fh = Math.min(areaBot - areaTop + ah * 0.2, c.h * 0.42);
      A.dress(sh, b.x + b.w * 0.83, py + ph - ah - fh + 2, fh, p.ink);
    }
    sh.rect(px, py + ph - ah, pw, ah, p.band2 || p.accent);
    byline(c, c.x + c.w / 2, py + ph - ah / 2 + 5 * s, pw - 0.5 * PT, 15 * s, p.bandInk || p.panel);
  }

  // ---------- 2. dossier: a case file on a desk, with a stamp ----------
  function dossier(c) {
    var sh = c.sh, p = c.pal, s = sc(c), rnd = c.rng.next;
    bg(c, p.frame);
    for (var g = 0; g < 14; g++) {
      var gy = rnd() * c.H;
      sh.line(c.x, gy, c.W, gy + (rnd() - 0.5) * 20, mix(p.frame, '#000000', 0.25), 0.6 + rnd());
    }
    var fx = c.x + 0.28 * PT, fy = c.y + 0.66 * PT, fB = c.y + c.h - 0.2 * PT;
    sh.rect(fx + 7 * s, fy - 5 * s, c.W - fx, fB - fy, mix(p.folder, '#000000', 0.22));
    var tabW = Math.min(c.w * 0.5, 2.5 * PT), tabH = 0.34 * PT;
    sh.poly([fx, fy + 1, fx + 8 * s, fy - tabH, fx + tabW - 8 * s, fy - tabH, fx + tabW, fy + 1], p.folder);
    sh.rect(fx, fy, c.W - fx, fB - fy, p.folder);
    say(c, 'CASE FILE  No. ' + caseNo(c), fx + tabW / 2, fy - tabH * 0.32, tabW - 24 * s, 10 * s, 'sansBold', p.tabInk || p.ink, { lsK: 0.08 });
    var px = fx + 0.2 * PT, py = fy + 0.24 * PT, pw = c.x + c.w - 0.26 * PT - px, ph = fB - 0.22 * PT - py;
    sh.poly(A.turn(A.box(px, py, pw, ph), px + pw / 2, py + ph / 2, -1.6), mix(p.paper, p.folder, 0.45));
    sh.rect(px, py, pw, ph, p.paper);
    var pad = 0.2 * PT, ix = px + pad, iw = pw - pad * 2;
    var hs0 = say(c, c.kicker, ix, py + pad + 6 * s, iw * 0.82, 8.5 * s, 'sans', p.ink, { align: 'left', lsK: 0.08 });
    sh.line(ix, py + pad + hs0 + 4 * s, ix + iw, py + pad + hs0 + 4 * s, p.ink, 0.75);
    A.paperclip(sh, px + pw - 0.55 * PT, py - 0.18 * PT, 0.9 * PT, p.clip, 1.8 * s);
    var T = title(c, { x: ix, y: py + pad + hs0 + 16 * s, w: iw, h: ph * 0.34 }, { hs: 0.82, align: 'left', color: p.ink, accent: p.accent, lead: 0.92, cap: 1.25 * PT });
    var ly = T.bottom + 20 * s;
    var lz = say(c, c.line, ix, ly, iw, 12 * s, 'sansBold', p.ink, { align: 'left', lsK: 0.03 });
    var foot = py + ph - pad;
    var as = byline(c, ix + iw / 2, foot, iw * 0.8, 14 * s, p.ink);
    var qy = foot - as - 12 * s;
    var qs = say(c, c.question, ix + iw / 2, qy, iw, 11.5 * s, 'sansBold', p.mark, { lsK: 0.05 });
    var top = ly + lz + 8 * s, bot = qy - qs - 40 * s;
    var end = snippet(c, ix + iw / 2, top, iw, bot - top, 6, snippetPal(p, p.ink, p.paper));
    A.stamp(sh, c.kit, c.opt.stamp || 'CONFIDENTIAL', ix + iw * 0.7, Math.min(end, bot) + 10 * s, 12 * s, p.mark, 9);
  }

  // ---------- 3. newspaper: the front page ----------
  function newspaper(c) {
    var sh = c.sh, p = c.pal, s = sc(c), o = c.opt, rnd = c.rng.next;
    bg(c, p.panel);
    var b = inner(c, 0.34 * PT), cx = b.x + b.w / 2, y = b.y;
    var mast = o.masthead || 'THE DAILY HERALD', mastInk = p.ink;
    if (o.tabloid) {
      sh.rect(c.x, 0, c.W - c.x, b.y + 0.82 * PT, p.accent);
      mastInk = p.onFrame;
    }
    var ms = fit(c, mast, b.w, 40 * s, 'serifBold', 0.02, o.tabloid ? 0.86 : 1);
    var F = c.kit.font('serifBold');
    y += ms.size * F.capHeight + 4 * s;
    sh.spaced(mast, cx, y, ms.size, 'serifBold', mastInk, ms.ls, 'center', ms.hs);
    y += 9 * s;
    if (!o.tabloid) { sh.line(b.x, y, b.x + b.w, y, p.ink, 1.6 * s); y += 3 * s; sh.line(b.x, y, b.x + b.w, y, p.ink, 0.6); }
    else y = b.y + 0.82 * PT - 2;
    var ds = Math.max(MIN, 7.5 * s);
    y += ds + 5 * s;
    sh.text(o.edition || 'LATE CITY EDITION', b.x, y, ds, 'sansBold', p.ink);
    sh.right('PRICE 5 CENTS', b.x + b.w, y, ds, 'sansBold', p.ink);
    sh.center('EXTRA', cx, y, ds, 'sansBold', p.mark);
    y += 5 * s;
    sh.line(b.x, y, b.x + b.w, y, p.ink, 0.75);
    var T = title(c, { x: b.x, y: y + 12 * s, w: b.w, h: c.h * 0.3 }, { font: o.serifHead ? 'serifBold' : 'sansBold', hs: o.serifHead ? 0.92 : 0.8, color: p.ink, accent: o.tabloid ? p.accent : null, lead: 0.93, cap: 1.4 * PT });
    y = T.bottom + 18 * s;
    var ls = say(c, c.line, cx, y, b.w, 13 * s, 'serifBold', p.ink, { lsK: 0.02 });
    y += 8 * s;
    sh.line(b.x, y, b.x + b.w, y, p.ink, 0.75);
    var foot = b.y + b.h, as = 13 * s;
    var boxH = 0.62 * PT, boxY = foot - as - 12 * s - boxH;
    var colTop = y + 10 * s, colBot = boxY - 12 * s;
    var gw = b.w * 0.4, phX = b.x + gw + 12 * s, phW = b.x + b.w - phX;
    // photo with a figure under a street lamp
    var capS = Math.max(MIN, 7.5 * s), phH = colBot - colTop - capS * 3.4;
    if (phH > 40) {
      sh.rect(phX, colTop, phW, phH, p.photo);
      var groundY = colTop + phH * 0.93;
      A.lamp(sh, phX + phW * 0.22, groundY, phH * 0.8, p.photoInk, mix(p.photo, '#FFFFFF', 0.55), p.photo, Math.min(0.55, phW * 0.42 / (phH * 0.8 * 0.42)));
      A.coat(sh, phX + phW * 0.6, groundY - phH * 0.62, phH * 0.62, p.photoInk);
      para(c, 'Police say ' + c.type.target.who + ' is one of the ' + c.N + ' ' + c.unit.many + '.', phX, colTop + phH + capS * 1.3, phW, capS, 'serif', p.ink, 1.2, 'left', 2);
    }
    // body copy as gray lines, with a byline
    var bs = Math.max(MIN, 8 * s);
    sh.text('BY ' + c.author.toUpperCase(), b.x, colTop + bs, bs, 'sansBold', p.ink);
    var lineC = mix(p.panel, p.ink, 0.38);
    for (var ly = colTop + bs * 2.4; ly < colBot - 2; ly += 5.6 * s) {
      var end = rnd() < 0.14 ? 0.35 + rnd() * 0.4 : 1;
      sh.rect(b.x, ly, gw * end, 2.2 * s, lineC);
    }
    sh.rect(b.x, boxY, b.w, boxH, p.ink);
    say(c, c.question, cx, boxY + boxH / 2 + 5 * s, b.w - 20 * s, 15 * s, 'sansBold', p.panel, { lsK: 0.04 });
    byline(c, cx, foot, b.w * 0.8, as, p.ink);
  }

  // ---------- 4. ticket: a lottery ticket, concert ticket or boarding pass ----------
  function ticket(c) {
    var sh = c.sh, p = c.pal, s = sc(c), o = c.opt, rnd = c.rng.next;
    bg(c, p.frame);
    var b = inner(c), cx = c.x + c.w / 2;
    var foot = b.y + b.h, tb0 = b.y + 9 * s;
    var ks0 = fit(c, c.kicker, b.w, 10 * s, 'sansBold', 0.12).size;
    var tb = { x: b.x, y: tb0 + ks0 + 9 * s, w: b.w, h: c.h * 0.3 };
    var dry = title(c, tb, { hs: 0.8, lead: 0.92, dry: true, cap: 1.5 * PT });
    var as0 = fit(c, c.author.toUpperCase(), b.w * 0.8, 15 * s, 'serifBold', 0.12).size;
    var qy = foot - as0 - 16 * s, qs0 = fit(c, c.question, b.w, 14 * s, 'sansBold', 0.05).size;
    // the ticket fills the room between the title and the question
    var zt = dry.bottom + 24 * s, zb = qy - qs0 - 22 * s;
    var th = Math.min(zb - zt, c.w * (o.boarding ? 0.5 : 0.56)), ty = zt + (zb - zt - th) / 2;
    var tx = c.x + 0.24 * PT, tw = c.w - 0.48 * PT, rcy = ty + th / 2;
    if (o.rays) {
      for (var i = 0; i < 28; i += 2) {
        var a0 = i / 28 * Math.PI * 2, a1 = (i + 1) / 28 * Math.PI * 2, R = c.h * 1.2;
        sh.poly([cx, rcy, cx + Math.cos(a0) * R, rcy + Math.sin(a0) * R, cx + Math.cos(a1) * R, rcy + Math.sin(a1) * R], mix(p.frame, p.rays || '#FFFFFF', 0.12));
      }
      sh.rect(c.x - 2 * PT, 0, 2 * PT, c.H, p.frame);
    }
    if (o.stripes) {
      var sw = 0.36 * PT;
      for (var x = c.x; x < c.W; x += sw * 2) sh.rect(x, 0, Math.min(sw, c.W - x), c.H, p.stripe);
    }
    say(c, c.kicker, cx, tb0, b.w, 10 * s, 'sansBold', p.onFrame, { lsK: 0.12 });
    if (o.banner) sh.poly(A.rbox(c.x + 0.2 * PT, dry.top - 16 * s, c.w - 0.4 * PT, dry.bottom - dry.top + 32 * s, 10 * s), p.banner);
    title(c, tb, { hs: 0.8, color: p.onFrame, accent: p.accent, lead: 0.92, cap: 1.5 * PT });
    // the ticket
    var tk = p.tk || p.panel;
    sh.poly(A.rbox(tx + 3 * s, ty + 4 * s, tw, th, 6 * s), mix(p.frame, '#000000', 0.35));
    sh.poly(A.rbox(tx, ty, tw, th, 6 * s), tk);
    var nr = Math.min(th * 0.09, 0.16 * PT);
    sh.ellipse(tx, rcy, nr, nr, null, 1, o.stripes ? p.stripe : p.frame);
    sh.ellipse(tx + tw, rcy, nr, nr, null, 1, o.stripes ? p.stripe : p.frame);
    var stubX = tx + tw * 0.74;
    dashed(sh, stubX, ty + 8 * s, stubX, ty + th - 8 * s, p.ink, 1 * s, 3.5 * s);
    var ix = tx + nr + 12 * s, iw = stubX - ix - 12 * s;
    var head = o.head || 'ADMIT ONE';
    var stw = tx + tw - stubX, scx = stubX + stw / 2;
    if (o.boarding) {
      var hb = Math.min(th * 0.22, 0.5 * PT);
      sh.poly(A.rbox(tx, ty, tw, hb, 6 * s), p.headBand || p.accent);
      sh.rect(tx, ty + hb * 0.5, tw, hb * 0.5, p.headBand || p.accent);
      say(c, head, ix, ty + hb * 0.66, iw, 14 * s, 'sansBold', p.headInk || '#FFFFFF', { align: 'left', lsK: 0.14 });
      A.plane(sh, scx, ty + hb / 2, hb * 0.85, p.headInk || '#FFFFFF', 0);
      var name = values(c, 1, 'pass')[0] || '';
      var body = th - hb, ls2 = Math.max(MIN, 7 * s), lab = mix(tk, p.ink, 0.55);
      var r1 = ty + hb + body * 0.2;
      sh.text('PASSENGER', ix, r1, ls2, 'sansBold', lab);
      say(c, name.toUpperCase(), ix, r1 + 18 * s, iw, 16 * s, 'sansBold', p.ink, { align: 'left' });
      var fl = [['FLIGHT', o.flight || 'MA 1704'], ['FROM', o.from || 'LHR'], ['TO', o.to || 'JFK'], ['SEAT', '??']];
      var cw = iw / 4, fy = ty + hb + body * 0.56;
      fl.forEach(function (f, q) {
        sh.text(f[0], ix + q * cw, fy, ls2, 'sansBold', lab);
        say(c, f[1], ix + q * cw, fy + 20 * s, cw - 6 * s, 19 * s, 'sansBold', q === 3 ? p.mark : p.ink, { align: 'left' });
      });
      say(c, c.line, ix, ty + th - 12 * s, iw, 10.5 * s, 'sansBold', p.ink, { align: 'left', lsK: 0.02 });
      A.barcode(sh, stubX + stw * 0.2, ty + hb + body * 0.16, stw * 0.6, body * 0.66, p.ink, rnd);
    } else {
      sh.frame(ix - 4 * s, ty + 9 * s, iw + 8 * s, th - 18 * s, mix(tk, p.ink, 0.5), 0.6);
      say(c, head, ix + iw / 2, ty + th * 0.22, iw, 14 * s, 'sansBold', p.headCol || p.mark, { lsK: 0.2 });
      var serial = field(c, ['ticket', 'code', 'badge', 'entry', 'phone'], 'serial') || caseNo(c);
      say(c, 'No. ' + serial.replace(/^No\. /, ''), ix + iw / 2, ty + th * 0.6, iw - 12 * s, Math.min(60 * s, th * 0.3), 'serifBold', p.ink, { lsK: 0.02 });
      say(c, c.line, ix + iw / 2, ty + th * 0.82, iw - 12 * s, 11 * s, 'sansBold', p.ink, { lsK: 0.03 });
      A.turnedText(sh, c.kit, 'No. ' + caseNo(c), scx - stw * 0.2, rcy, Math.max(MIN, Math.min(12 * s, stw * 0.22)), 'sansBold', p.ink, 90);
      A.barcode(sh, scx + stw * 0.02, ty + th * 0.16, stw * 0.3, th * 0.68, p.ink, rnd);
    }
    say(c, c.question, cx, qy, b.w, 14 * s, 'sansBold', p.q || p.accent, { lsK: 0.05 });
    byline(c, cx, foot, b.w * 0.8, 15 * s, p.onFrame);
  }

  // ---------- 5. noir: a figure under a street lamp ----------
  function noir(c) {
    var sh = c.sh, p = c.pal, s = sc(c), o = c.opt, rnd = c.rng.next;
    bg(c, p.frame);
    var b = inner(c), cx = c.x + c.w / 2;
    if (o.rain) for (var r = 0; r < 160; r++) {
      var rx = c.x + rnd() * (c.W - c.x), ry = rnd() * c.H, L = (8 + rnd() * 10) * s;
      sh.line(rx, ry, rx - L * 0.25, ry + L, mix(p.frame, p.onFrame, 0.13), 0.6);
    }
    var start = sh.items.length;
    var ks = say(c, c.kicker, cx, b.y + 8 * s, b.w, 9.5 * s, 'sansBold', mix(p.frame, p.onFrame, 0.7), { lsK: 0.14 });
    var T = title(c, { x: b.x, y: b.y + ks + 16 * s, w: b.w, h: c.h * 0.3 }, { hs: 0.8, color: p.onFrame, accent: p.accent, lead: 0.92, cap: 1.5 * PT });
    var ly = T.bottom + 22 * s;
    var lz = say(c, c.line, cx, ly, b.w, 12 * s, 'sansBold', p.onFrame, { lsK: 0.08 });
    var foot = b.y + b.h, as = byline(c, cx, foot, b.w * 0.8, 15 * s, p.onFrame);
    var qy = foot - as - 14 * s;
    var qs = say(c, c.question, cx, qy, b.w, 13 * s, 'sansBold', p.accent, { lsK: 0.06 });
    var zoneTop = ly + lz + 22 * s, gy = qy - qs - 30 * s, figH = Math.min(c.h * 0.42, gy - zoneTop);
    var fx = c.x + c.w * (o.figX || 0.6), lampH = Math.min(gy - zoneTop + 6 * s, figH * 1.4);
    under(c, start, function () {
      for (var i = 8; i >= 1; i--) sh.ellipse(fx, gy, c.w * 0.055 * i, c.w * 0.011 * i, null, 1, mix(p.frame, p.glow, (9 - i) / 9 * 0.42));
      A.lamp(sh, c.x + c.w * 0.25, gy, lampH, p.fig, p.glow, p.frame, 0.75);
      sh.poly([fx - figH * 0.08, gy, fx + figH * 0.08, gy, fx + figH * 0.9, gy + figH * 0.06, fx + figH * 0.62, gy + figH * 0.07], mix(p.frame, '#000000', 0.45));
      A.coat(sh, fx, gy - figH, figH, p.fig);
    });
  }

  // ---------- 6. line-up: five suspects against a height chart ----------
  function lineup(c) {
    var sh = c.sh, p = c.pal, s = sc(c);
    bg(c, p.panel);
    var b = inner(c), cx = c.x + c.w / 2;
    var stripH = 0.95 * PT, wallBot = c.y + c.h - stripH;
    var n = 4, slot = (c.w - 0.3 * PT) / n, h = Math.min(slot * 1.18, c.h * 0.32), wallTop = wallBot - h * 1.3;
    var ks = say(c, c.kicker, cx, b.y + 8 * s, b.w, 9.5 * s, 'sansBold', p.ink, { lsK: 0.12 });
    var zt = b.y + ks + 16 * s, zb = wallTop - 22 * s;
    title(c, { x: b.x, y: zt, w: b.w, h: zb - zt }, { hs: 0.8, color: p.ink, accent: p.mark, lead: 0.92, cap: 1.5 * PT, valign: 'center' });
    sh.rect(c.x, wallTop, c.W - c.x, wallBot - wallTop, p.wall);
    var marks = 8, step = (wallBot - wallTop) / marks, ls = Math.max(MIN, 7.5 * s);
    for (var i = 1; i < marks; i++) {
      var yy = wallBot - step * i;
      sh.line(c.x, yy, c.W, yy, mix(p.wall, p.ink, 0.4), (i % 2 ? 0.5 : 1) * s);
      if (i % 2 === 0) sh.text((4 + i / 2) + "'0", b.x, yy - 2.5 * s, ls, 'sansBold', mix(p.wall, p.ink, 0.65));
    }
    var top = wallBot - h, who = LK.util.makeRng('lineup:' + c.project.seed).int(n), xs = [];
    for (var k = 0; k < n; k++) {
      xs.push(c.x + 0.15 * PT + slot * (k + 0.5));
      A.bust(sh, xs[k], top, h * 0.96, p.fig, k % 2 === 1);
    }
    var pw = slot * 0.42, phh = Math.max(MIN * 1.9, h * 0.13);
    xs.forEach(function (fx, k) {
      sh.rect(fx - pw / 2, wallBot - phh - h * 0.06, pw, phh, p.panel);
      sh.center(String(k + 1), fx, wallBot - h * 0.06 - phh * 0.22, Math.max(MIN, phh * 0.7), 'sansBold', p.ink);
    });
    var hx = xs[who];
    sh.ellipse(hx, top + h * 0.3, slot * 0.46, h * 0.36, p.mark, 2.6 * s);
    sh.ellipse(hx + 1.5, top + h * 0.3 - 1, slot * 0.44, h * 0.34, p.mark, 1 * s);
    sh.rect(c.x, wallBot, c.W - c.x, c.H - wallBot, p.frame);
    var foot = b.y + b.h, as = byline(c, cx, foot, b.w * 0.8, 14 * s, p.onFrame);
    say(c, c.line, cx, foot - as - 10 * s, b.w, 12 * s, 'sansBold', p.onFrame2 || p.onFrame, { lsK: 0.05 });
  }

  // ---------- 7. bold: title words on labels over a neon background ----------
  function bold(c) {
    var sh = c.sh, p = c.pal, s = sc(c), k = c.kit;
    bg(c, p.frame);
    var b = inner(c, 0.34 * PT), cx = c.x + c.w / 2;
    var foot = b.y + b.h;
    var rs = Math.max(MIN, 13 * s), boxH = rs * 1.75 * 3 + 16 * s;
    var as0 = fit(c, c.author.toUpperCase(), b.w * 0.8, 14 * s, 'serifBold', 0.12).size;
    var boxY = foot - as0 - 14 * s - boxH;
    // faint columns of names down both sides
    var fs = Math.max(MIN, 7.5 * s), vals = values(c, 60, 'side'), faint = mix(p.frame, p.ink, 0.4);
    for (var i = 0; i < 30; i++) {
      var yy = b.y + 0.62 * PT + i * fs * 1.5;
      if (yy > boxY - 8 * s) break;
      sh.text(vals[i], b.x, yy, fs, 'sans', faint);
      sh.right(vals[i + 30], b.x + b.w, yy, fs, 'sans', faint);
    }
    var ks = say(c, c.kicker, cx, b.y + 8 * s, b.w, 10 * s, 'sansBold', p.ink, { lsK: 0.1 });
    // the title, line by line on labels, centered in the room above the checklist
    var font = 'sansBold', hs = 0.82, zt = b.y + ks + 22 * s, zb = boxY - 0.7 * PT;
    var tl = k.titleLines(c.title, b.w * 0.82 - 18 * s, (zb - zt) * 0.92, 1.6 * PT * s, { font: font, hs: hs, lead: 1.12, minLines: Math.min(3, c.title.split(/\s+/).length) });
    var capH = k.font(font).capHeight * tl.size, padY = tl.size * 0.16, rowH = capH + padY * 2, gap = tl.size * 0.09;
    var total = tl.lines.length * rowH + (tl.lines.length - 1) * gap;
    var y = zt + Math.max(0, (zb - zt - total) * 0.4);
    tl.lines.forEach(function (l, q) {
      var w = k.width(l, tl.size, font, 0, hs), last = q === tl.lines.length - 1;
      var fill = last ? p.accent : q % 2 ? p.ink : p.panel, ink = last ? p.panel : q % 2 ? p.panel : p.ink;
      var bx = cx - w / 2 - 9 * s + (q % 2 ? 7 : -7) * s;
      sh.rect(bx, y, w + 18 * s, rowH, fill);
      sh.text(l, bx + 9 * s, y + padY + capH, tl.size, font, ink, 0, hs);
      y += rowH + gap;
    });
    // the checklist box
    byline(c, cx, foot, b.w * 0.8, 14 * s, p.ink);
    var rowsT = [c.N + ' ' + c.unit.many.toUpperCase(), c.K + ' CLUES', '1 ' + whoWord(c)];
    var bw2 = Math.min(b.w * 0.86, 3.6 * PT), bx2 = cx - bw2 / 2 - 0.25 * PT;
    sh.rect(bx2, boxY, bw2, boxH, p.ink);
    rowsT.forEach(function (t, q) {
      var ry = boxY + 8 * s + rs * 1.75 * (q + 0.5) + rs * 0.35;
      A.check(sh, bx2 + 14 * s, ry - rs * 0.05, rs * 0.85, p.frame);
      say(c, t, bx2 + 14 * s + rs * 1.4, ry, bw2 * 0.7 - rs * 1.4, rs, 'sansBold', p.panel, { align: 'left', lsK: 0.03 });
    });
    // a sticker on the corner of the box
    var r = Math.min(0.72 * PT * s, (boxY - y) * 0.9 + boxH * 0.5);
    if (r > 0.4 * PT) {
      var scx = Math.min(bx2 + bw2, b.x + b.w - r * 0.9), scy = boxY + boxH * 0.1;
      A.burst(sh, scx, scy, r, p.sticker || p.mark, 16, 4);
      var u = c.unit.many.toUpperCase();
      A.turnedText(sh, k, c.N, scx, scy - r * 0.17, Math.max(MIN, Math.min(r * 0.38, r * 1.3 / Math.max(0.1, k.width(c.N, 1, 'sansBold')))), 'sansBold', p.stickerInk || p.ink, 12);
      A.turnedText(sh, k, u, scx + r * 0.06, scy + r * 0.26, Math.max(MIN, Math.min(r * 0.22, r * 1.25 / Math.max(0.1, k.width(u, 1, 'sansBold')))), 'sansBold', p.stickerInk || p.ink, 12);
    }
  }

  // ---------- 8. minimal: an elegant serif title and a magnifier over a fingerprint ----------
  function minimal(c) {
    var sh = c.sh, p = c.pal, s = sc(c);
    bg(c, p.panel);
    var f1 = 0.27 * PT, f2 = 0.33 * PT;
    sh.frame(c.x + f1, c.y + f1, c.w - f1 * 2, c.h - f1 * 2, p.ink, 1.1 * s);
    sh.frame(c.x + f2, c.y + f2, c.w - f2 * 2, c.h - f2 * 2, p.ink, 0.45);
    var b = inner(c, 0.56 * PT), cx = c.x + c.w / 2;
    var ks = say(c, c.kicker, cx, b.y + 6 * s, b.w, 8.5 * s, 'sans', p.accent, { lsK: 0.16 });
    var T = title(c, { x: b.x, y: b.y + ks + 22 * s, w: b.w, h: c.h * 0.33 }, { font: 'serifBold', keepCase: true, lead: 1.06, color: p.ink, accent: c.opt.accentLast ? p.accent : null, cap: 1.05 * PT });
    var oy = T.bottom + 18 * s, d = 4 * s;
    sh.line(cx - b.w * 0.28, oy, cx - d * 2, oy, p.ink, 0.6);
    sh.line(cx + d * 2, oy, cx + b.w * 0.28, oy, p.ink, 0.6);
    sh.poly([cx, oy - d, cx + d, oy, cx, oy + d, cx - d, oy], p.accent);
    var ly = oy + 20 * s, lz = say(c, c.line, cx, ly, b.w, 9.5 * s, 'serif', p.ink, { lsK: 0.12 });
    var foot = b.y + b.h, as = byline(c, cx, foot, b.w * 0.8, 13 * s, p.ink);
    var qy = foot - as - 16 * s, qs = say(c, upperFirst(c.question), cx, qy, b.w, 11 * s, 'serif', p.accent);
    var zt = ly + lz + 14 * s, zb = qy - qs - 18 * s, r = Math.min((zb - zt) * 0.34, c.w * 0.2);
    if (r > 18) {
      var mcx = cx - r * 0.18, mcy = zt + (zb - zt) * 0.42;
      A.fingerprint(sh, mcx, mcy + r * 0.05, r * 0.66, p.print || p.accent, Math.max(0.8, r * 0.028), c.rng.next);
      A.magnifier(sh, mcx, mcy, r, p.ink, Math.max(2, r * 0.07), null, -50);
    }
  }

  // ---------- 9. poster: a vintage travel poster (liner, train, plane, island) ----------
  function palm(sh, x, baseY, h, c, lean) {
    var pts = [], tx = 0, ty = 0;
    for (var i = 0; i <= 10; i++) { tx = x + Math.sin(i / 10 * 1.4) * h * 0.18 * lean; ty = baseY - h * i / 10; pts.push(tx, ty); }
    sh.poly(pts, null, c, h * 0.035, false, true);
    for (var f = 0; f < 7; f++) {
      var a = (-170 + f * 35) * Math.PI / 180, L = h * (0.32 + (f % 2) * 0.06);
      var ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.6 + L * 0.25;
      sh.poly([tx, ty, tx + Math.cos(a) * L * 0.5, ty + Math.sin(a) * L * 0.5 - h * 0.04, ex, ey, tx + Math.cos(a) * L * 0.5, ty + Math.sin(a) * L * 0.5 + h * 0.015], c);
    }
  }
  function poster(c) {
    var sh = c.sh, p = c.pal, s = sc(c), o = c.opt, rnd = c.rng.next;
    var cx = c.x + c.w / 2, hY = c.y + c.h * (o.motif === 'plane' ? 0.74 : 0.66);
    var bands = 10;
    for (var i = 0; i < bands; i++) sh.rect(c.x, hY * i / bands, c.W - c.x, hY / bands + 0.5, mix(p.sky1, p.sky2, i / (bands - 1)));
    var sunY = hY - c.h * 0.02, sunR = c.w * 0.26;
    if (o.rays) for (var q = 0; q < 18; q += 2) {
      var a0 = Math.PI + q / 18 * Math.PI, a1 = Math.PI + (q + 1) / 18 * Math.PI, R = c.h * 0.7;
      sh.poly([cx, sunY, cx + Math.cos(a0) * R, sunY + Math.sin(a0) * R, cx + Math.cos(a1) * R, sunY + Math.sin(a1) * R], mix(p.sky2, p.sun, 0.25));
    }
    sh.ellipse(cx, sunY, sunR, sunR, null, 1, p.sun);
    sh.rect(c.x, hY, c.W - c.x, c.H - hY, p.sea);
    if (o.motif !== 'train' && o.motif !== 'plane') for (var w = 0; w < 6; w++) A.waves(sh, c.x - 4, hY + (w + 0.6) * c.h * 0.03, c.W - c.x + 8, 1.6 * s, 9, mix(p.sea, p.sky2, 0.3), 0.9 * s);
    if (o.motif === 'ship') A.ship(sh, cx + c.w * 0.04, hY + c.w * 0.015, c.w * 0.92, p.ink, p.accent, p.light);
    else if (o.motif === 'train') {
      sh.line(c.x, hY + 2 * s, c.W, hY + 2 * s, p.ink, 2.2 * s);
      for (var t = c.x; t < c.W; t += 9 * s) sh.rect(t, hY + 3 * s, 4 * s, 3 * s, p.ink);
      var smokeX = c.x + c.w * 0.86;
      for (var m = 0; m < 6; m++) A.dot(sh, smokeX - m * c.w * 0.07, hY - c.w * 0.2 - m * c.w * 0.012, c.w * (0.03 + m * 0.008), mix(p.sky2, '#FFFFFF', 0.45 - m * 0.05));
      A.train(sh, c.x + c.w * 0.02, hY, c.w * 0.98, p.ink, p.light);
    } else if (o.motif === 'plane') {
      for (var cl = 0; cl < 5; cl++) {
        var ccx = c.x + c.w * (0.1 + cl * 0.22), ccy = hY - 4 * s;
        A.dot(sh, ccx, ccy, c.w * 0.12, p.sea); A.dot(sh, ccx + c.w * 0.1, ccy + 4 * s, c.w * 0.09, p.sea);
      }
      A.plane(sh, cx + c.w * 0.05, hY - c.h * 0.17, c.w * 0.82, p.ink, 22);
    } else if (o.motif === 'island') {
      sh.poly(A.arc(c.x + c.w * 0.3, hY + 2, c.w * 0.36, c.h * 0.05, 180, 360, 20), p.ink);
      palm(sh, c.x + c.w * 0.22, hY - c.h * 0.03, c.h * 0.3, p.ink, 1);
      palm(sh, c.x + c.w * 0.36, hY - c.h * 0.02, c.h * 0.22, p.ink, -0.8);
      var bx = c.x + c.w * 0.74;
      sh.poly([bx - c.w * 0.12, hY + c.h * 0.03, bx + c.w * 0.12, hY + c.h * 0.03, bx + c.w * 0.09, hY + c.h * 0.05, bx - c.w * 0.09, hY + c.h * 0.05], p.ink);
      sh.poly([bx, hY + c.h * 0.025, bx, hY - c.h * 0.16, bx + c.w * 0.1, hY + c.h * 0.02], p.light);
      sh.poly([bx - 2, hY + c.h * 0.025, bx - 2, hY - c.h * 0.12, bx - c.w * 0.08, hY + c.h * 0.02], mix(p.light, p.ink, 0.15));
    }
    // title block on top, banner at the foot
    var b = inner(c), tb = { x: b.x, y: b.y + 18 * s, w: b.w, h: c.h * 0.27 };
    var dry = title(c, tb, { hs: 0.8, lead: 0.92, cap: 1.4 * PT, dry: true });
    var blockB = dry.bottom + 16 * s;
    sh.rect(c.x, 0, c.W - c.x, blockB, p.head);
    sh.line(c.x, blockB - 5 * s, c.W, blockB - 5 * s, p.accent, 1.6 * s);
    say(c, c.kicker, c.x + c.w / 2, b.y + 7 * s, b.w, 9 * s, 'sansBold', p.accent, { lsK: 0.16 });
    title(c, tb, { hs: 0.8, lead: 0.92, cap: 1.4 * PT, color: p.headInk, accent: p.accent });
    var foot = b.y + b.h, bandT = c.y + c.h - 0.86 * PT;
    sh.rect(c.x, bandT, c.W - c.x, c.H - bandT, p.head);
    sh.line(c.x, bandT + 5 * s, c.W, bandT + 5 * s, p.accent, 1.6 * s);
    var as = byline(c, cx, foot, b.w * 0.8, 13 * s, p.headInk);
    say(c, c.line, cx, foot - as - 8 * s, b.w, 11 * s, 'sansBold', p.accent, { lsK: 0.06 });
  }

  // ---------- 10. facade: a hotel, hospital, museum or office tower at night ----------
  function facade(c) {
    var sh = c.sh, p = c.pal, s = sc(c), o = c.opt, rnd = c.rng.next;
    bg(c, p.frame);
    var b = inner(c), cx = c.x + c.w / 2;
    if (o.stars) for (var i = 0; i < 46; i++) A.dot(sh, c.x + rnd() * (c.W - c.x), rnd() * c.h * 0.6, (0.5 + rnd() * 0.9) * s, mix(p.frame, '#FFFFFF', 0.55));
    var ks = say(c, c.kicker, cx, b.y + 8 * s, b.w, 9.5 * s, 'sansBold', p.onFrame, { lsK: 0.12 });
    var T = title(c, { x: b.x, y: b.y + ks + 16 * s, w: b.w, h: c.h * 0.27 }, { hs: 0.8, color: p.onFrame, accent: p.accent, lead: 0.92, cap: 1.35 * PT });
    var ly = T.bottom + 20 * s, lz = say(c, c.line, cx, ly, b.w, 11.5 * s, 'sansBold', p.onFrame, { lsK: 0.05 });
    var strip = 0.62 * PT, ground = c.y + c.h - strip, top = ly + lz + 18 * s;
    var lit = LK.util.makeRng('lit:' + c.project.seed);
    if (o.kind === 'temple') {
      var tw = c.w * 0.86, t = A.temple(sh, cx - tw / 2, top, tw, ground, { body: p.bldg, win: p.win, lit: p.lit, litIndex: lit.int(5), figure: true, columns: 6 });
      say(c, o.sign || 'MUSEUM', cx, t.band.y + t.band.h * 0.5 + Math.min(t.band.h * 0.55, 18 * s) * 0.36, tw * 0.6, Math.min(t.band.h * 0.55, 18 * s), 'serifBold', p.signInk, { lsK: 0.3 });
    } else {
      var bw = c.w * (o.kind === 'tower' ? 0.62 : 0.8), bx = cx - bw / 2;
      var signH = Math.max(MIN * 2.2, 0.32 * PT), sy = top;
      var cols = o.kind === 'tower' ? 5 : 5, floors = Math.max(3, Math.min(o.kind === 'tower' ? 12 : 7, Math.round((ground - top - signH * 1.5) / (bw / cols * 0.95))));
      if (o.kind === 'tower') {
        sh.rect(c.x + c.w * 0.02, top + (ground - top) * 0.35, c.w * 0.16, ground - top, mix(p.frame, p.bldg, 0.6));
        sh.rect(c.x + c.w * 0.84, top + (ground - top) * 0.2, c.w * 0.14, ground - top, mix(p.frame, p.bldg, 0.6));
      }
      sh.rect(bx + bw * 0.18, sy, bw * 0.64, signH, p.sign);
      if (o.kind === 'hospital') {
        [bx + bw * 0.18 + signH * 0.55, bx + bw * 0.82 - signH * 0.55].forEach(function (x0) {
          sh.rect(x0 - signH * 0.12, sy + signH * 0.18, signH * 0.24, signH * 0.64, p.lit);
          sh.rect(x0 - signH * 0.32, sy + signH * 0.38, signH * 0.64, signH * 0.24, p.lit);
        });
      }
      say(c, o.sign || 'HOTEL', cx, sy + signH * 0.68, bw * 0.64 - signH * (o.kind === 'hospital' ? 2.4 : 0.8), signH * 0.55, 'sansBold', p.signInk, { lsK: 0.3 });
      sh.rect(bx + bw * 0.3, sy + signH, 2 * s, signH * 0.5, p.bldg);
      sh.rect(bx + bw * 0.7, sy + signH, 2 * s, signH * 0.5, p.bldg);
      var btop = sy + signH * 1.5;
      A.building(sh, bx, btop, bw, ground, { body: p.bldg, win: p.win, lit: p.lit, litIndex: lit.int(floors * cols), floors: floors, cols: cols, figure: true, door: o.kind !== 'tower', mullion: o.kind === 'tower' });
    }
    sh.rect(c.x, ground, c.W - c.x, c.H - ground, p.head);
    byline(c, cx, b.y + b.h, b.w * 0.8, 14 * s, p.headInk);
  }

  // ---------- 11. map: a street map or an old atlas with pins, one circled ----------
  function map(c) {
    var sh = c.sh, p = c.pal, s = sc(c), o = c.opt, rnd = c.rng.next;
    bg(c, o.atlas ? p.sea : p.panel);
    var X0 = c.x, X1 = c.W, Y1 = c.H;
    if (o.atlas) {
      for (var gx = c.x + 0.4 * PT; gx < X1; gx += 0.75 * PT) sh.line(gx, 0, gx, Y1, p.grid, 0.5);
      for (var gy = 0.4 * PT; gy < Y1; gy += 0.75 * PT) sh.line(X0, gy, X1, gy, p.grid, 0.5);
      for (var l = 0; l < 6; l++) {
        var lx = c.x + rnd() * c.w, lyy = c.y + rnd() * c.h, R = (0.5 + rnd() * 0.9) * PT, pts = [];
        for (var a = 0; a < 18; a++) { var rr = R * (0.65 + rnd() * 0.5), t = a / 18 * Math.PI * 2; pts.push(lx + Math.cos(t) * rr * 1.3, lyy + Math.sin(t) * rr); }
        sh.poly(pts, p.land);
      }
    } else {
      for (var k = 0; k < 7; k++) sh.rect(c.x + rnd() * c.w, rnd() * c.H, (0.4 + rnd() * 0.7) * PT, (0.3 + rnd() * 0.6) * PT, p.park);
      var river = [];
      for (var q = 0; q <= 20; q++) river.push(X0 - 10 + (X1 - X0 + 20) * q / 20, c.y + c.h * 0.58 + Math.sin(q / 20 * Math.PI * 2.2) * c.h * 0.06 + q * c.h * 0.008);
      sh.poly(river, null, p.water, 0.3 * PT, false, true);
      for (var vx = c.x - 0.2 * PT, n = 0; vx < X1; vx += (0.42 + rnd() * 0.3) * PT, n++) {
        var major = n % 3 === 1, tilt = (rnd() - 0.5) * 18;
        sh.line(vx, 0, vx + tilt, Y1, p.roadEdge, (major ? 7.5 : 3.6) * s);
        sh.line(vx, 0, vx + tilt, Y1, p.road, (major ? 6 : 2.4) * s);
      }
      for (var hy = 0.2 * PT, m = 0; hy < Y1; hy += (0.42 + rnd() * 0.3) * PT, m++) {
        var majorH = m % 3 === 2, tiltH = (rnd() - 0.5) * 18;
        sh.line(X0, hy, X1, hy + tiltH, p.roadEdge, (majorH ? 7.5 : 3.6) * s);
        sh.line(X0, hy, X1, hy + tiltH, p.road, (majorH ? 6 : 2.4) * s);
      }
    }
    var b = inner(c), cx = c.x + c.w / 2;
    // the title on a label
    var pad = 14 * s, tb = { x: b.x + pad, y: b.y + pad + 12 * s, w: b.w - pad * 2, h: c.h * 0.24 };
    var dry = title(c, tb, { hs: 0.82, lead: 0.92, cap: 1.25 * PT, dry: true });
    var ks = Math.max(MIN, 8.5 * s), lblB = dry.bottom + pad + 22 * s;
    sh.rect(b.x - 4 * s, b.y - 4 * s, b.w + 8 * s, lblB - b.y + 8 * s, p.label || p.panel);
    sh.frame(b.x, b.y, b.w, lblB - b.y, p.ink, 1.2 * s);
    say(c, c.kicker, cx, b.y + pad - 1 * s + ks * 0.4, b.w - pad * 2, ks, 'sansBold', p.accent, { lsK: 0.12 });
    title(c, tb, { hs: 0.82, lead: 0.92, cap: 1.25 * PT, color: p.ink, accent: p.mark });
    say(c, c.line, cx, dry.bottom + pad + 8 * s, b.w - pad * 2, 10.5 * s, 'sansBold', p.ink, { lsK: 0.04 });
    // pins and a route
    var foot = b.y + b.h, footH = 0.62 * PT, zt = lblB + 0.35 * PT, zb = foot - footH - 0.15 * PT;
    var pts2 = [], labels = values(c, 6, 'pins');
    for (var i = 0; i < 6; i++) pts2.push([b.x + 0.3 * PT + rnd() * (b.w - 0.6 * PT), zt + (zb - zt) * (i + 0.2 + rnd() * 0.6) / 6]);
    if (o.atlas) for (var r2 = 1; r2 < pts2.length; r2++) dashed(sh, pts2[r2 - 1][0], pts2[r2 - 1][1], pts2[r2][0], pts2[r2][1], p.route || p.mark, 1.6 * s, 4 * s);
    var ps = 0.34 * PT * Math.max(0.8, s), fs = Math.max(MIN, 7.5 * s);
    pts2.forEach(function (pt, j) {
      var last = j === pts2.length - 1;
      A.pin(sh, pt[0], pt[1], ps, last ? p.mark : p.pin || p.ink, o.atlas ? p.land : p.panel);
      if (!last) A.cross(sh, pt[0], pt[1] - ps * 0.68, ps * 0.28, p.mark, 1.6 * s);
      else {
        sh.ellipse(pt[0], pt[1] - ps * 0.55, ps * 1.1, ps * 0.95, p.mark, 2.2 * s);
        sh.ellipse(pt[0] + 1, pt[1] - ps * 0.58, ps * 1.03, ps * 0.88, p.mark, 0.9 * s);
      }
      var lab = labels[j] || '', lw = c.kit.width(lab, fs, 'sansBold');
      var lx2 = Math.min(Math.max(pt[0] + ps * 0.6, b.x + 2), b.x + b.w - lw - 6 * s);
      if (lx2 < pt[0] + ps * 0.4 && lx2 + lw > pt[0] - ps * 0.6) lx2 = Math.max(b.x + 2, pt[0] - ps * 0.6 - lw - 6 * s);
      sh.rect(lx2 - 2 * s, pt[1] - ps * 0.4 - fs, lw + 4 * s, fs * 1.35, p.label || p.panel);
      sh.text(lab, lx2, pt[1] - ps * 0.4, fs, 'sansBold', p.ink);
    });
    // compass
    var rx = b.x + 0.32 * PT, ry = foot - footH - 0.42 * PT, rr3 = 0.24 * PT;
    sh.poly([rx, ry - rr3, rx + rr3 * 0.22, ry, rx, ry + rr3, rx - rr3 * 0.22, ry], p.ink);
    sh.poly([rx - rr3, ry, rx, ry - rr3 * 0.22, rx + rr3, ry, rx, ry + rr3 * 0.22], p.ink);
    sh.center('N', rx, ry - rr3 - 3 * s, Math.max(MIN, 9 * s), 'sansBold', p.ink);
    // foot label with the pen name
    sh.rect(b.x - 4 * s, foot - footH, b.w + 8 * s, footH + 4 * s, p.label || p.panel);
    sh.frame(b.x, foot - footH + 4 * s, b.w, footH - 4 * s, p.ink, 1.2 * s);
    byline(c, cx, foot - footH / 2 + 7 * s, b.w * 0.8, 14 * s, p.ink);
  }

  // ---------- 12. ledger: a register book page under a title plate ----------
  function ledger(c) {
    var sh = c.sh, p = c.pal, s = sc(c), k = c.kit;
    bg(c, p.frame);
    var m = 0.22 * PT, px = c.x + m, py = c.y + m, pw = c.w - m * 2, ph = c.h - m * 2;
    sh.rect(px, py, pw, ph, p.panel);
    var b = inner(c, 0.42 * PT), cx = c.x + c.w / 2;
    // the plate
    var pad = 16 * s, tb = { x: b.x + pad, y: b.y + pad + 16 * s, w: b.w - pad * 2, h: c.h * 0.22 };
    var dry = title(c, tb, { font: 'serifBold', lead: 1.0, cap: 1.1 * PT, dry: true });
    var plateB = dry.bottom + pad + 24 * s;
    sh.rect(b.x - 6 * s, b.y - 6 * s, b.w + 12 * s, plateB - b.y + 12 * s, p.plate);
    sh.frame(b.x, b.y, b.w, plateB - b.y, p.plateRule, 1.2 * s);
    sh.frame(b.x + 3.5 * s, b.y + 3.5 * s, b.w - 7 * s, plateB - b.y - 7 * s, p.plateRule, 0.5);
    say(c, c.kicker, cx, b.y + pad + 3 * s, b.w - pad * 2, 8 * s, 'sansBold', p.plateRule, { lsK: 0.14 });
    title(c, tb, { font: 'serifBold', lead: 1.0, cap: 1.1 * PT, color: p.plateInk });
    say(c, c.line, cx, dry.bottom + pad + 10 * s, b.w - pad * 2, 9.5 * s, 'sansBold', p.plateRule, { lsK: 0.06 });
    // the page
    var foot = b.y + b.h, as = byline(c, cx, foot, b.w * 0.8, 13 * s, p.ink);
    var qy = foot - as - 12 * s, qs = say(c, c.question, cx, qy, b.w, 11.5 * s, 'sansBold', p.mark, { lsK: 0.05 });
    var top = plateB + 16 * s, bot = qy - qs - 14 * s;
    var cols = columns(c), fs = Math.max(MIN, 8.5 * s), hfs = Math.max(MIN, 7 * s), rowH = fs * 2.05;
    var n = Math.floor((bot - top - rowH) / rowH);
    if (n < 3) return;
    var data = rows(c, n, 'ledger');
    // the columns that fit
    var used = [], tot = 0;
    for (var i = 0; i < cols.length; i++) {
      var w = k.width(cols[i].head, hfs, 'sansBold');
      data.forEach(function (r) { w = Math.max(w, k.width(String(r[cols[i].key]), fs, 'serif')); });
      if (tot + w + 10 * s > b.w) break;
      used.push({ key: cols[i].key, head: cols[i].head, w: w }); tot += w + 10 * s;
    }
    var gap = (b.w - tot) / Math.max(1, used.length) + 10 * s;
    for (var ry = top + rowH; ry <= top + rowH * (n + 1) + 0.1; ry += rowH) sh.line(px, ry, px + pw, ry, p.rule, 0.6);
    sh.line(b.x - 5 * s, top - 4 * s, b.x - 5 * s, top + rowH * (n + 1), p.margin, 0.8);
    sh.line(b.x - 7.5 * s, top - 4 * s, b.x - 7.5 * s, top + rowH * (n + 1), p.margin, 0.8);
    var hit = Math.floor(n * 0.55), rng = LK.util.makeRng('ledger:' + c.project.seed);
    if (n > 1) sh.rect(px, top + rowH * (hit + 1), pw, rowH, p.hl);
    var x = b.x;
    used.forEach(function (col) {
      sh.text(col.head, x, top + rowH * 0.7, hfs, 'sansBold', p.accent);
      data.forEach(function (r, q) { sh.text(String(r[col.key]), x, top + rowH * (q + 1) + rowH * 0.68, fs, 'serif', p.ink); });
      x += col.w + gap;
    });
    data.forEach(function (r, q) {
      var yy = top + rowH * (q + 1) + rowH * 0.45;
      if (q !== hit && rng.next() < 0.45) sh.line(b.x - 2, yy, b.x + tot - 8 * s, yy, p.ink, 0.9 * s);
    });
    var hy = top + rowH * (hit + 1.5);
    sh.ellipse(cx, hy, b.w * 0.54, rowH * 0.85, p.mark, 2.2 * s);
    sh.ellipse(cx + 1.5, hy - 1, b.w * 0.53, rowH * 0.78, p.mark, 1 * s);
  }

  // ---------- 13. fingerprint: one huge print on a dark ground ----------
  function print(c) {
    var sh = c.sh, p = c.pal, s = sc(c);
    bg(c, p.frame);
    var b = inner(c), cx = c.x + c.w / 2;
    A.fingerprint(sh, c.x + c.w * 0.56, c.y + c.h * 0.66, c.w * 0.44, p.ridge, 2.4 * s, c.rng.next);
    var ks = say(c, c.kicker, cx, b.y + 8 * s, b.w, 9 * s, 'sansBold', p.accent, { lsK: 0.16 });
    var T = title(c, { x: b.x, y: b.y + ks + 18 * s, w: b.w, h: c.h * 0.34 }, { font: 'serifBold', color: p.onFrame, accent: p.accent, lead: 0.98, cap: 1.25 * PT });
    var ly = T.bottom + 22 * s;
    say(c, c.line, cx, ly, b.w, 11 * s, 'sansBold', p.onFrame, { lsK: 0.1 });
    var foot = b.y + b.h, as = byline(c, cx, foot, b.w * 0.8, 14 * s, p.onFrame);
    say(c, c.question, cx, foot - as - 14 * s, b.w, 12 * s, 'sansBold', p.accent, { lsK: 0.08 });
    // an evidence scale down the left edge
    var sx = c.x + 0.2 * PT, st = ly + 30 * s, sb = foot - as - 40 * s;
    sh.line(sx, st, sx, sb, mix(p.frame, p.onFrame, 0.5), 0.8);
    for (var y = st, i = 0; y <= sb; y += 4.5 * s, i++) sh.line(sx, y, sx + (i % 5 ? 4 : 9) * s, y, mix(p.frame, p.onFrame, 0.5), 0.6);
  }

  // ---------- 14. cctv: a security camera still ----------
  function cctv(c) {
    var sh = c.sh, p = c.pal, s = sc(c);
    bg(c, p.frame);
    var line = mix(p.frame, p.onFrame, 0.06);
    for (var y = 0; y < c.H; y += 3.4 * s) sh.line(c.x, y, c.W, y, line, 0.5);
    var b = inner(c, 0.3 * PT), L = 0.32 * PT, lw = 2 * s, oc = p.onFrame, cx = c.x + c.w / 2;
    [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]].forEach(function (q) {
      sh.line(q[0], q[1], q[0] + L * q[2], q[1], oc, lw); sh.line(q[0], q[1], q[0], q[1] + L * q[3], oc, lw);
    });
    var ts = Math.max(MIN, 9 * s), ix = b.x + 12 * s, iw = b.w - 24 * s, ty = b.y + 14 * s + ts;
    A.dot(sh, ix + ts * 0.4, ty - ts * 0.34, ts * 0.38, p.mark);
    sh.text('REC', ix + ts * 1.1, ty, ts, 'sansBold', oc);
    var tm = times(c, 6);
    sh.right('CAM 04   ' + tm[0], ix + iw, ty, ts, 'sansBold', oc);
    var T = title(c, { x: ix, y: ty + 18 * s, w: iw, h: c.h * 0.29 }, { hs: 0.8, color: oc, accent: p.mark, lead: 0.92, cap: 1.4 * PT });
    var ly = T.bottom + 20 * s, lz = say(c, c.line, cx, ly, iw, 11 * s, 'sansBold', oc, { lsK: 0.08 });
    var foot = b.y + b.h - 12 * s, as = byline(c, cx, foot, iw * 0.8, 13 * s, oc);
    // the timeline
    var tly = foot - as - 30 * s, tx0 = ix + 6 * s, tx1 = ix + iw - 6 * s, fs = Math.max(MIN, 7.5 * s);
    sh.line(tx0, tly, tx1, tly, oc, 1 * s);
    var labs = tm.slice(1, 6);
    labs.forEach(function (t, i) {
      var x = tx0 + (tx1 - tx0) * i / (labs.length - 1);
      sh.line(x, tly - 4 * s, x, tly + 4 * s, oc, 1 * s);
      var w = c.kit.width(t, fs, 'sans');
      var lx = Math.min(Math.max(x - w / 2, tx0), tx1 - w);
      sh.text(t, lx, tly + 6 * s + fs, fs, 'sans', oc);
    });
    var mk = tx0 + (tx1 - tx0) * 0.62;
    sh.poly([mk - 5 * s, tly - 12 * s, mk + 5 * s, tly - 12 * s, mk, tly - 3 * s], p.mark);
    // the subject in the reticle
    var zt = ly + lz + 14 * s, zb = tly - 20 * s, fh = Math.min(zb - zt, c.h * 0.36);
    if (fh > 30) {
      var fx = cx, ftop = zb - fh;
      A.hood(sh, fx, ftop, fh, p.fig, mix(p.fig, '#000000', 0.5));
      var rcy = ftop + fh * 0.42, rr = fh * 0.34;
      sh.ellipse(fx, rcy, rr, rr, p.mark, 1.6 * s);
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
        sh.line(fx + d[0] * rr * 0.75, rcy + d[1] * rr * 0.75, fx + d[0] * rr * 1.3, rcy + d[1] * rr * 1.3, p.mark, 1.4 * s);
      });
      var tag = 'SUBJECT ' + caseNo(c);
      var tw = c.kit.width(tag, fs, 'sansBold');
      sh.text(tag, Math.min(fx + rr * 1.05, ix + iw - tw), rcy - rr * 0.95, fs, 'sansBold', p.mark);
    }
  }

  // ---------- 15. evidence: an evidence bag with its form and the register inside ----------
  function evidence(c) {
    var sh = c.sh, p = c.pal, s = sc(c), o = c.opt, k = c.kit;
    bg(c, p.frame);
    var b = inner(c), cx = c.x + c.w / 2;
    var ks = say(c, c.kicker, cx, b.y + 8 * s, b.w, 9 * s, 'sansBold', p.onFrame, { lsK: 0.14 });
    var T = title(c, { x: b.x, y: b.y + ks + 16 * s, w: b.w, h: c.h * 0.27 }, { hs: 0.8, color: p.onFrame, accent: p.accent, lead: 0.92, cap: 1.35 * PT });
    var foot = b.y + b.h, as = byline(c, cx, foot, b.w * 0.8, 14 * s, p.onFrame);
    var bx = c.x + 0.3 * PT, bw = c.w - 0.6 * PT, by = T.bottom + 20 * s, bb = foot - as - 16 * s;
    sh.rect(bx, by, bw, bb - by, p.bag);
    sh.line(bx, by + 7 * s, bx + bw, by + 7 * s, p.zip, 1.4 * s);
    sh.line(bx, by + 10 * s, bx + bw, by + 10 * s, p.zip, 0.7);
    var hh = 0.34 * PT, hy = by + 16 * s;
    sh.rect(bx, hy, bw, hh, p.mark);
    say(c, 'EVIDENCE', bx + 14 * s, hy + hh * 0.7, bw * 0.55, hh * 0.62, 'sansBold', '#FFFFFF', { align: 'left', lsK: 0.25 });
    sh.right('DO NOT OPEN', bx + bw - 14 * s, hy + hh * 0.64, Math.max(MIN, 7.5 * s), 'sansBold', '#FFFFFF');
    var fy = hy + hh + 8 * s, fx = bx + 12 * s, fw = bw - 24 * s, ls = Math.max(MIN, 7 * s), vs = Math.max(MIN, 9 * s), rh = vs * 2.3;
    var fields = [['CASE NO.', caseNo(c), 'ITEM', c.unit.many.toUpperCase()], ['RECORDS', c.N, 'CLUES', String(c.K)], ['COLLECTED BY', c.author.toUpperCase(), 'SUSPECT', '?']];
    sh.rect(fx, fy, fw, rh * fields.length + 6 * s, p.panel);
    fields.forEach(function (f, i) {
      [0, 1].forEach(function (half) {
        var x = fx + 8 * s + half * fw / 2, y = fy + 4 * s + rh * i, w = fw / 2 - 16 * s;
        sh.text(f[half * 2], x, y + ls + 2 * s, ls, 'sansBold', mix(p.panel, p.ink, 0.6));
        var lw2 = k.width(f[half * 2], ls, 'sansBold') + 6 * s;
        say(c, f[half * 2 + 1], x + lw2, y + ls + 2 * s, w - lw2, vs, 'sans', p.ink, { align: 'left' });
        sh.line(x + lw2, y + ls + 4.5 * s, x + w, y + ls + 4.5 * s, mix(p.panel, p.ink, 0.35), 0.5);
      });
    });
    var top = fy + rh * fields.length + 18 * s, h = bb - 10 * s - top;
    if (h > 40) {
      sh.rect(fx, top - 4 * s, fw, h + 4 * s, p.panel);
      snippet(c, cx, top, fw - 16 * s, h - 4 * s, 6, snippetPal(p, p.ink, p.panel));
    }
    if (o.tape) {
      // crime scene tape across the lower corner, its words kept inside the safe area
      var t0x = c.x - 10, t0y = bb - 0.55 * PT, t1x = c.W, t1y = bb - 1.6 * PT, tw = 0.36 * PT;
      var ang = Math.atan2(t1y - t0y, t1x - t0x), nx = -Math.sin(ang) * tw / 2, ny = Math.cos(ang) * tw / 2;
      sh.poly([t0x + nx, t0y + ny, t1x + nx, t1y + ny, t1x - nx, t1y - ny, t0x - nx, t0y - ny], p.tape);
      var deg = -ang * 180 / Math.PI, mx = c.x + c.w * 0.5, my = t0y + (t1y - t0y) * ((mx - t0x) / (t1x - t0x));
      A.turnedText(sh, k, 'CRIME SCENE  DO NOT CROSS', mx, my, Math.max(MIN, tw * 0.5), 'sansBold', p.tapeInk, deg, tw * 0.06, 0.9);
    }
  }

  // ---------- 16. caller: a red-framed phone-records cover (Caller Unknown) ----------
  function caller(c) {
    var sh = c.sh, p = c.pal, s = sc(c), k = c.kit;
    bg(c, p.panel);
    var fw = 0.13 * PT, fi = 0.24 * PT;
    sh.frame(c.x + fi, c.y + fi, c.w - fi * 2, c.h - fi * 2, p.frame, fw);
    var b = inner(c, 0.48 * PT), cx = c.x + c.w / 2;
    var ks = say(c, c.kicker, b.x, b.y + 8 * s, b.w, 9.5 * s, 'sansBold', p.ink, { align: 'left', lsK: 0.06 });
    var T = title(c, { x: b.x, y: b.y + ks + 14 * s, w: b.w, h: c.h * 0.36 }, { hs: 0.8, align: 'left', color: p.ink, lead: 0.9, cap: 1.6 * PT, minLines: 2 });
    var ly = T.bottom + 20 * s, lz = say(c, c.line, b.x, ly, b.w, 14 * s, 'sansBold', p.ink, { align: 'left', lsK: 0.02 });
    var foot = b.y + b.h, as = byline(c, cx, foot, b.w * 0.8, 13 * s, p.ink);
    var qy = foot - as - 14 * s, qs = say(c, c.question, cx, qy, b.w, 14 * s, 'sansBold', p.mark, { lsK: 0.04 });
    var zt = ly + lz + 14 * s, zb = qy - qs - 16 * s, zh = zb - zt;
    if (zh < 50) return;
    // a slip of call records
    var slipW = b.w * 0.5, slipX = b.x, rowsN = Math.max(3, Math.min(6, Math.floor(zh * 0.8 / (16 * s)))), fs = Math.max(MIN, 8.5 * s);
    var slipH = rowsN * fs * 1.9 + 14 * s;
    sh.poly(A.turn(A.torn(slipX, zt + (zh - slipH) * 0.3, slipW, slipH, c.rng.next, 14), slipX + slipW / 2, zt + zh / 2, 0), mix(p.panel, '#FFFFFF', 0.6));
    sh.frame(slipX, zt + (zh - slipH) * 0.3, slipW, slipH * 0.97, mix(p.panel, p.ink, 0.25), 0.5);
    var vals = values(c, rowsN, 'slip'), tm = times(c, rowsN), sy0 = zt + (zh - slipH) * 0.3 + 8 * s;
    var hit = Math.floor(rowsN / 2);
    vals.forEach(function (v, i) {
      var y = sy0 + fs * 1.9 * i + fs * 1.2;
      var txt = v + (tm[i] && v.indexOf(tm[i]) === -1 ? '   ' + tm[i] : '');
      var sz = say(c, txt, slipX + 8 * s, y, slipW - 16 * s, fs, 'sans', p.ink, { align: 'left' });
      if (i === hit) {
        var tw = Math.min(k.width(txt, sz, 'sans'), slipW - 16 * s);
        sh.ellipse(slipX + 8 * s + tw / 2, y - sz * 0.32, tw / 2 + 6 * s, sz * 0.95, p.mark, 1.8 * s);
      } else if (i % 2 === 0) sh.line(slipX + 6 * s, y - sz * 0.3, slipX + slipW - 10 * s, y - sz * 0.3, p.ink, 0.8 * s);
    });
    // the handset, its cord and a question mark
    var hsz = Math.min(b.w * 0.42, zh * 0.5), hx = b.x + b.w * 0.76, hy = zt + zh * 0.3;
    var ends = A.phone(sh, hx, hy, hsz, p.ink);
    A.coil(sh, ends[1][0], ends[1][1] + hsz * 0.15, hx + hsz * 0.05, zb - zh * 0.08, hsz * 0.07, 7, p.ink, 1.4 * s);
    var qsz = Math.min(zh * 0.5, b.w * 0.3);
    sh.text('?', b.x + b.w - k.width('?', qsz, 'serifBold') - 2 * s, zb - 4 * s, qsz, 'serifBold', p.mark);
  }

  // ---------- 17. keyhole: a brass escutcheon on a door, someone on the other side ----------
  function keyholeDesign(c) {
    var sh = c.sh, p = c.pal, s = sc(c), k = c.kit;
    bg(c, p.frame);
    var b = inner(c), cx = c.x + c.w / 2;
    var mold = mix(p.frame, '#000000', 0.25);
    sh.frame(c.x + 0.22 * PT, c.y + c.h * 0.42, c.w - 0.44 * PT, c.h * 0.58 - 0.9 * PT, mold, 2.2 * s);
    sh.frame(c.x + 0.3 * PT, c.y + c.h * 0.42 + 0.08 * PT, c.w - 0.6 * PT, c.h * 0.58 - 1.06 * PT, mix(p.frame, '#FFFFFF', 0.08), 0.8 * s);
    var ks = say(c, c.kicker, cx, b.y + 8 * s, b.w, 9.5 * s, 'sansBold', p.accent, { lsK: 0.14 });
    var T = title(c, { x: b.x, y: b.y + ks + 16 * s, w: b.w, h: c.h * 0.29 }, { font: 'serifBold', color: p.onFrame, accent: p.accent, lead: 0.98, cap: 1.2 * PT });
    var ly = T.bottom + 20 * s, lz = say(c, c.line, cx, ly, b.w, 11 * s, 'sansBold', p.onFrame, { lsK: 0.06 });
    var foot = b.y + b.h, as = byline(c, cx, foot, b.w * 0.8, 14 * s, p.onFrame);
    var zt = ly + lz + 18 * s, zb = foot - as - 18 * s, zh = zb - zt;
    if (zh < 60) return;
    var pw = Math.min(c.w * 0.36, zh * 0.5), ph = Math.min(zh * 0.94, pw * 2.1), px = cx - pw / 2 - c.w * 0.08, py = zt + (zh - ph) / 2;
    sh.poly(A.rbox(px - 3 * s, py - 3 * s, pw + 6 * s, ph + 6 * s, pw * 0.45), p.plateEdge);
    sh.poly(A.rbox(px, py, pw, ph, pw * 0.42), p.plate);
    [py + ph * 0.08, py + ph * 0.92].forEach(function (yy) { A.dot(sh, px + pw / 2, yy, pw * 0.045, p.plateEdge); });
    var r = pw * 0.2, kcy = py + ph * 0.36;
    A.keyhole(sh, px + pw / 2, kcy, r, p.glow);
    A.coat(sh, px + pw / 2, kcy - r * 0.55, r * 2.95, p.hole);
    // a room key tag hanging beside it
    var room = field(c, ['room', 'loc', 'floor'], 'room') || caseNo(c);
    var tx = px + pw + c.w * 0.14, ty = py + ph * 0.12, tw = Math.min(c.w * 0.2, 1.1 * PT), th = tw * 1.75, ang = -9;
    sh.line(px + pw / 2 + r * 0.6, kcy, tx, ty, p.tagInk || p.ink, 1 * s);
    var tag = A.turn(A.rbox(tx - tw / 2, ty, tw, th, tw * 0.35), tx, ty, ang);
    sh.poly(tag, p.tag);
    var hole = A.turn([tx, ty + tw * 0.25], tx, ty, ang);
    A.dot(sh, hole[0], hole[1], tw * 0.08, p.frame);
    var tc = A.turn([tx, ty + th * 0.6], tx, ty, ang);
    A.turnedText(sh, k, 'ROOM', tc[0], tc[1] - th * 0.16, Math.max(MIN, tw * 0.16), 'sansBold', p.tagInk, ang, tw * 0.03);
    var rs = Math.max(MIN, Math.min(tw * 0.34, (tw * 0.8) / Math.max(0.1, k.width(room, 1, 'serifBold'))));
    A.turnedText(sh, k, room, tc[0] + th * 0.02, tc[1] + th * 0.1, rs, 'serifBold', p.tagInk, ang);
  }

  // ---------- 18. wanted: a poster nailed to a wall ----------
  function wanted(c) {
    var sh = c.sh, p = c.pal, s = sc(c), rnd = c.rng.next;
    bg(c, p.frame);
    for (var g = 0; g < 9; g++) sh.line(c.x, c.y + c.h * g / 9, c.W, c.y + c.h * g / 9, mix(p.frame, '#000000', 0.3), 1.2 * s);
    var m = 0.26 * PT, px = c.x + m, py = c.y + m, pw = c.w - m * 2, ph = c.h - m * 2;
    sh.poly(A.ragged(px, py, pw, ph, rnd, 6 * s), p.panel);
    [[px + 12 * s, py + 12 * s], [px + pw - 12 * s, py + 12 * s]].forEach(function (n) { A.dot(sh, n[0], n[1], 3.4 * s, mix(p.frame, '#000000', 0.2)); });
    var b = inner(c, 0.5 * PT), cx = c.x + c.w / 2, F = c.kit.font('serifBold');
    var ws = fit(c, c.opt.head || 'WANTED', b.w, 0.95 * PT, 'serifBold', 0.04, 0.9);
    var y = b.y + ws.size * F.capHeight + 2 * s;
    c.sh.spaced(c.opt.head || 'WANTED', cx, y, ws.size, 'serifBold', p.ink, ws.ls, 'center', ws.hs);
    y += 16 * s;
    var fs = say(c, c.opt.sub || 'FOR MURDER', cx, y, b.w * 0.7, 12 * s, 'sansBold', p.accent, { lsK: 0.3 });
    y += 8 * s;
    sh.line(b.x, y, b.x + b.w, y, p.ink, 1.4 * s);
    sh.line(b.x, y + 3 * s, b.x + b.w, y + 3 * s, p.ink, 0.5);
    var T = title(c, { x: b.x, y: y + 14 * s, w: b.w, h: c.h * 0.24 }, { hs: 0.82, color: p.ink, accent: p.mark, lead: 0.92, cap: 1.2 * PT });
    var foot = b.y + b.h, as = byline(c, cx, foot, b.w * 0.8, 14 * s, p.ink);
    var ly = foot - as - 12 * s, lz = say(c, c.line, cx, ly, b.w, 11.5 * s, 'sansBold', p.ink, { lsK: 0.05 });
    var ry = ly - lz - 10 * s, rs = say(c, 'REWARD', cx, ry, b.w * 0.6, 15 * s, 'serifBold', p.accent, { lsK: 0.3 });
    var zt = T.bottom + 16 * s, zb = ry - rs - 14 * s, zh = zb - zt;
    if (zh > 50) {
      var fw = Math.min(b.w * 0.62, zh * 0.86), fx = cx - fw / 2;
      sh.rect(fx, zt, fw, zh, mix(p.panel, p.ink, 0.12));
      sh.frame(fx, zt, fw, zh, p.ink, 2 * s);
      A.bust(sh, cx, zt + zh * 0.16, zh * 0.84, p.ink, false);
      var qs = Math.min(zh * 0.36, fw * 0.4);
      sh.center('?', cx, zt + zh * 0.16 + zh * 0.84 * 0.3 + qs * 0.36, qs, 'serifBold', p.panel);
    }
  }

  // ---------- 19. festive: Halloween, Christmas and cozy tea-time editions ----------
  function festive(c) {
    var sh = c.sh, p = c.pal, s = sc(c), o = c.opt, rnd = c.rng.next;
    var cozy = o.theme === 'cozy', xmas = o.theme === 'christmas', hall = o.theme === 'halloween';
    bg(c, p.frame);
    var b = inner(c), cx = c.x + c.w / 2;
    if (cozy) for (var dy = 0, row = 0; dy < c.H; dy += 0.3 * PT, row++) for (var dx = c.x + (row % 2) * 0.15 * PT; dx < c.W; dx += 0.3 * PT) A.dot(sh, dx, dy, 1.6 * s, p.dots);
    if (xmas) {
      var pts = [];
      for (var q = 0; q <= 24; q++) pts.push(c.x + c.w * q / 24, 3 + Math.sin(q / 24 * Math.PI) * (c.y + 0.16 * PT));
      sh.poly(pts, null, p.wire, 0.9 * s, false, true);
      var bulbs = [p.accent, '#3FA34D', '#F4F1EA', '#E05A47'];
      for (var bq = 1; bq < 24; bq += 2) A.dot(sh, pts[bq * 2], pts[bq * 2 + 1] + 3.5 * s, 3.2 * s, bulbs[(bq >> 1) % 4]);
    }
    var start = sh.items.length;
    var ks = say(c, c.kicker, cx, b.y + 10 * s, b.w, 9.5 * s, 'sansBold', p.accent, { lsK: 0.14 });
    var T = title(c, { x: b.x, y: b.y + ks + 20 * s, w: b.w, h: c.h * 0.3 }, cozy
      ? { font: 'serifBold', keepCase: true, color: p.ink, accent: p.accent, lead: 1.04, cap: 1.1 * PT }
      : { hs: 0.8, color: p.onFrame, accent: p.accent, lead: 0.92, cap: 1.45 * PT });
    var ly = T.bottom + 20 * s;
    var lz = say(c, c.line, cx, ly, b.w, 11.5 * s, 'sansBold', cozy ? p.ink : p.onFrame, { lsK: 0.06 });
    var foot = b.y + b.h;
    var as = byline(c, cx, foot, b.w * 0.8, 14 * s, hall ? p.onFrame : p.ink);
    var qy = foot - as - 12 * s;
    var qs = say(c, c.question, cx, qy, b.w, 12 * s, 'sansBold', xmas ? p.ink2 || p.ink : p.accent, { lsK: 0.06 });
    // the scene stands on a ground line just above the question
    var gy = qy - qs - 16 * s, zt = ly + lz + 14 * s, zh = gy - zt;
    under(c, start, function () {
      if (hall) {
        var mr = Math.min(zh * 0.36, c.w * 0.24);
        A.moon(sh, c.x + c.w * 0.66, zt + zh * 0.42, mr, p.moon, p.frame, false);
        for (var i = 0; i < 6; i++) A.bat(sh, c.x + c.w * (0.12 + rnd() * 0.76), zt + zh * (0.1 + rnd() * 0.5), c.w * (0.06 + rnd() * 0.05), p.bat);
        sh.poly([c.x, gy + 6 * s].concat(A.arc(cx, gy + c.h * 0.05, c.w * 0.75, c.h * 0.07, 200, 340, 20)).concat([c.W, gy + 4 * s, c.W, c.H, c.x, c.H]), p.ground);
        var pr = Math.min(c.w * 0.11, zh * 0.2);
        A.pumpkin(sh, c.x + c.w * 0.2, gy - pr * 0.55, pr, p.pump, p.ground, p.stem);
        A.pumpkin(sh, c.x + c.w * 0.82, gy - pr * 0.4, pr * 0.75, p.pump, p.ground, p.stem);
      } else if (xmas) {
        for (var f = 0; f < 24; f++) A.snowflake(sh, c.x + rnd() * c.w, zt + rnd() * zh * 0.9, (3 + rnd() * 6) * s, mix(p.frame, '#FFFFFF', 0.4 + rnd() * 0.3), 0.8 * s);
        sh.poly([c.x, gy + 4 * s].concat(A.arc(cx, gy + c.h * 0.05, c.w * 0.75, c.h * 0.065, 200, 340, 20)).concat([c.W, gy + 2 * s, c.W, c.H, c.x, c.H]), p.snow);
        [[0.1, 0.42], [0.25, 0.3], [0.78, 0.38], [0.92, 0.27]].forEach(function (t) { A.pine(sh, c.x + c.w * t[0], gy + 8 * s, zh * t[1], p.tree, p.snow); });
      } else {
        var cw = Math.min(c.w * 0.5, zh * 0.72), cupY = gy - cw * 0.1;
        A.steam(sh, cx - cw * 0.05, cupY - cw * 0.62, Math.min(cw * 0.4, zh - cw * 0.7), mix(p.frame, p.ink, 0.35), 1.2 * s);
        A.teacup(sh, cx - cw * 0.05, cupY, cw, p.cup, p.tea, p.accent);
        A.cat(sh, cx + cw * 0.8, cupY + cw * 0.08, cw * 0.62, p.cat);
      }
    });
  }

  var FRONTS = {
    stacked: stacked, dossier: dossier, newspaper: newspaper, ticket: ticket, noir: noir, lineup: lineup, bold: bold,
    minimal: minimal, poster: poster, facade: facade, map: map, ledger: ledger, print: print, cctv: cctv,
    evidence: evidence, caller: caller, keyhole: keyholeDesign, wanted: wanted, festive: festive
  };

  // ---------- the 50 designs ----------
  // pal needs, for the shared spine and back: frame, panel, ink, accent, mark, onFrame (head, headInk, band derive)
  function P(o) {
    return Object.assign({ head: o.ink, headInk: o.panel, band: mix(o.panel, o.ink, 0.1) }, o);
  }
  var GROUPS = [
    { id: 'classic', label: 'Classic' },
    { id: 'casefile', label: 'Case file' },
    { id: 'bold', label: 'Bold' },
    { id: 'travel', label: 'Tickets & travel' },
    { id: 'places', label: 'Places' },
    { id: 'night', label: 'Noir & seasonal' }
  ];
  var ALL = ['lottery', 'manifest', 'hotel', 'staff', 'guestlist', 'calls', 'coords', 'visitors'];
  var NAMED = ['manifest', 'hotel', 'staff', 'guestlist'];
  var S0 = function (id) { return LK.cover.STYLES[id]; };
  var DESIGNS = [
    // classic
    { id: 'classic', label: 'Classic red', group: 'classic', layout: 'register', fits: ALL, pal: S0('classic') },
    { id: 'noir', label: 'Noir gold', group: 'classic', layout: 'register', fits: ALL, pal: S0('noir') },
    { id: 'royal', label: 'Royal blue', group: 'classic', layout: 'register', fits: ALL, pal: S0('royal') },
    { id: 'emerald', label: 'Emerald', group: 'classic', layout: 'register', fits: ALL, pal: S0('emerald') },
    { id: 'casefile', label: 'Case file', group: 'classic', layout: 'register', fits: ALL, pal: S0('casefile') },
    { id: 'ivory', label: 'Ivory minimal', group: 'classic', layout: 'minimal', fits: ALL, opt: { accentLast: true },
      pal: P({ frame: '#E9E1D1', panel: '#F6F1E6', ink: '#1E1B18', accent: '#9C2A22', mark: '#9C2A22', onFrame: '#1E1B18' }) },
    { id: 'charcoal', label: 'Charcoal & gold', group: 'classic', layout: 'minimal', fits: ALL, opt: { accentLast: true },
      pal: P({ frame: '#191B1F', panel: '#22252A', ink: '#ECE4D2', accent: '#C9A55A', mark: '#C9A55A', onFrame: '#C9A55A', print: '#8C7440' }) },
    { id: 'sage', label: 'Sage minimal', group: 'classic', layout: 'minimal', fits: ALL,
      pal: P({ frame: '#CFD8C4', panel: '#E4E9DC', ink: '#1F2E28', accent: '#7A3B2E', mark: '#A3332A', onFrame: '#1F2E28' }) },
    { id: 'ledger', label: 'Green ledger', group: 'classic', layout: 'ledger', fits: ['hotel', 'lottery', 'visitors', 'staff', 'calls'],
      pal: P({ frame: '#1F4A36', panel: '#F2EEDC', ink: '#1D2A24', accent: '#1F4A36', mark: '#B3261E', onFrame: '#E9DFC0', plate: '#1F4A36', plateInk: '#F4EAD0', plateRule: '#D2B46A', rule: '#BCCDBB', margin: '#D88A80', hl: '#F5E6A3' }) },
    { id: 'leather', label: 'Leather register', group: 'classic', layout: 'ledger', fits: ['hotel', 'manifest', 'lottery', 'guestlist'],
      pal: P({ frame: '#5A1F1B', panel: '#F1E7D2', ink: '#22160F', accent: '#7A2A20', mark: '#B3261E', onFrame: '#E8D3A3', plate: '#3B1411', plateInk: '#F1DDA8', plateRule: '#C9A24E', rule: '#DCCAA8', margin: '#C98B7E', hl: '#F4DE9A' }) },
    // case file
    { id: 'dossier', label: 'Manila dossier', group: 'casefile', layout: 'dossier', fits: ALL,
      pal: P({ frame: '#2B2622', panel: '#F4EBD6', paper: '#F4EBD6', folder: '#D6B676', ink: '#1C1A17', accent: '#8E1F1F', mark: '#B3261E', onFrame: '#E7D3A6', clip: '#7E8288', tabInk: '#2B2622' }) },
    { id: 'coldcase', label: 'Cold case', group: 'casefile', layout: 'dossier', fits: ALL, opt: { stamp: 'COLD CASE' },
      pal: P({ frame: '#1E2630', panel: '#ECEFF1', paper: '#ECEFF1', folder: '#97A5B3', ink: '#151A20', accent: '#1F3B57', mark: '#C0392B', onFrame: '#C9D3DC', clip: '#4E5A66', tabInk: '#151A20' }) },
    { id: 'redtape', label: 'Red tape file', group: 'casefile', layout: 'dossier', fits: ALL, opt: { stamp: 'TOP SECRET' },
      pal: P({ frame: '#5B1212', panel: '#FAF5EA', paper: '#FAF5EA', folder: '#E3CF9F', ink: '#1A1414', accent: '#A11B1B', mark: '#C4161C', onFrame: '#F1DDB0', clip: '#8A8A8A', tabInk: '#5B1212' }) },
    { id: 'evidence', label: 'Evidence bag', group: 'casefile', layout: 'evidence', fits: ALL,
      pal: P({ frame: '#15171B', panel: '#F5F5F2', bag: '#C3C9D0', zip: '#7F8892', ink: '#16181C', accent: '#E04436', mark: '#C0392B', onFrame: '#ECECEC' }) },
    { id: 'crimescene', label: 'Crime scene tape', group: 'casefile', layout: 'evidence', fits: ALL, opt: { tape: true },
      pal: P({ frame: '#111111', panel: '#F4F2EA', bag: '#C4C4BC', zip: '#80807A', ink: '#121212', accent: '#F2C230', mark: '#D62828', onFrame: '#F4F2EA', tape: '#F2C230', tapeInk: '#121212' }) },
    { id: 'print', label: 'Fingerprint', group: 'casefile', layout: 'print', fits: ALL,
      pal: P({ frame: '#0E0E10', panel: '#1A1A1D', ink: '#EDE6DA', accent: '#D0312D', mark: '#D0312D', onFrame: '#EDE6DA', ridge: '#5E1517' }) },
    { id: 'cctv', label: 'CCTV still', group: 'casefile', layout: 'cctv', fits: ['visitors', 'calls', 'staff', 'hotel', 'guestlist', 'lottery'],
      pal: P({ frame: '#0B0C0E', panel: '#16181B', ink: '#E8E8E8', accent: '#E53935', mark: '#E53935', onFrame: '#E8E8E8', fig: '#2A2E35' }) },
    { id: 'nightvision', label: 'Night vision', group: 'casefile', layout: 'cctv', fits: ['visitors', 'calls', 'staff', 'coords'],
      pal: P({ frame: '#05150B', panel: '#0B2213', ink: '#C9F5CC', accent: '#8CF59A', mark: '#FF5A4F', onFrame: '#A6F2AE', fig: '#17462D' }) },
    { id: 'lineup', label: 'Police line-up', group: 'casefile', layout: 'lineup', fits: ['guestlist', 'staff', 'visitors', 'hotel', 'manifest'],
      pal: P({ frame: '#1E2227', panel: '#ECE9E2', wall: '#D8D4CA', ink: '#1E2227', accent: '#1E2227', mark: '#C0392B', onFrame: '#F1EEE7', fig: '#2A2E35' }) },
    { id: 'parade', label: 'Identity parade', group: 'casefile', layout: 'lineup', fits: ['guestlist', 'staff', 'visitors', 'hotel'],
      pal: P({ frame: '#B71C1C', panel: '#FFFFFF', wall: '#F0F0F0', ink: '#111111', accent: '#B71C1C', mark: '#B71C1C', onFrame: '#FFFFFF', fig: '#3A3A3A' }) },
    { id: 'wanted', label: 'Wanted poster', group: 'casefile', layout: 'wanted', fits: ['manifest', 'coords', 'guestlist', 'lottery'],
      pal: P({ frame: '#3B2A1E', panel: '#E9D8B4', ink: '#2A1D12', accent: '#8A2B1A', mark: '#9E2A1B', onFrame: '#E9D8B4' }) },
    // bold
    { id: 'alice', label: 'Pink name list', group: 'bold', layout: 'stacked', fits: NAMED.concat(['lottery']), opt: { figure: true },
      pal: P({ frame: '#E9579A', panel: '#FBF4E6', ink: '#141414', accent: '#E9579A', mark: '#D81B60', onFrame: '#FFFFFF', bandInk: '#FFFFFF' }) },
    { id: 'harm', label: 'Red & white list', group: 'bold', layout: 'stacked', fits: NAMED.concat(['calls', 'visitors']),
      pal: P({ frame: '#14213D', panel: '#FFFFFF', ink: '#111111', accent: '#C8102E', mark: '#C8102E', onFrame: '#FFFFFF', band2: '#14213D' }) },
    { id: 'lime', label: 'Neon lime', group: 'bold', layout: 'bold', fits: ALL,
      pal: P({ frame: '#94E03A', panel: '#FFFFFF', ink: '#111111', accent: '#111111', mark: '#E0217B', onFrame: '#111111', sticker: '#FFFFFF' }) },
    { id: 'warning', label: 'Warning yellow', group: 'bold', layout: 'bold', fits: ALL,
      pal: P({ frame: '#FFD21F', panel: '#FFFFFF', ink: '#111111', accent: '#D7263D', mark: '#D7263D', onFrame: '#111111', sticker: '#D7263D', stickerInk: '#FFFFFF' }) },
    { id: 'hotpink', label: 'Hot pink', group: 'bold', layout: 'bold', fits: ALL,
      pal: P({ frame: '#F0287A', panel: '#FFFFFF', ink: '#111111', accent: '#111111', mark: '#111111', onFrame: '#FFFFFF', sticker: '#FFE14D' }) },
    { id: 'caller', label: 'Caller unknown', group: 'bold', layout: 'caller', fits: ['calls', 'hotel', 'staff'],
      pal: P({ frame: '#C62828', panel: '#F6EFE0', ink: '#111111', accent: '#C62828', mark: '#C62828', onFrame: '#F6EFE0' }) },
    { id: 'herald', label: 'Daily Herald', group: 'bold', layout: 'newspaper', fits: ALL, opt: { serifHead: true },
      pal: P({ frame: '#E6E0D2', panel: '#F2EEE3', ink: '#151515', accent: '#151515', mark: '#B3261E', onFrame: '#151515', photo: '#77736B', photoInk: '#1B1B1B' }) },
    { id: 'gazette', label: 'Sepia gazette', group: 'bold', layout: 'newspaper', fits: ALL, opt: { serifHead: true, masthead: 'THE EVENING GAZETTE', edition: 'FINAL EDITION' },
      pal: P({ frame: '#DCCAA3', panel: '#EBDDBE', ink: '#2A2016', accent: '#6B3A1E', mark: '#8E1F1F', onFrame: '#2A2016', photo: '#8A775A', photoInk: '#2A2016' }) },
    { id: 'tabloid', label: 'Red tabloid', group: 'bold', layout: 'newspaper', fits: ALL, opt: { tabloid: true, masthead: 'THE DAILY CRIME', edition: 'SPECIAL EDITION' },
      pal: P({ frame: '#D81E26', panel: '#FFFFFF', ink: '#111111', accent: '#D81E26', mark: '#D81E26', onFrame: '#FFFFFF', photo: '#5A5A5A', photoInk: '#111111' }) },
    // tickets and travel
    { id: 'lottoticket', label: 'Lottery ticket', group: 'travel', layout: 'ticket', fits: ['lottery'], opt: { rays: true, head: 'LOTTERY TICKET' },
      pal: P({ frame: '#D9261C', panel: '#FFF6D6', tk: '#FFE36B', ink: '#111111', accent: '#FFE36B', mark: '#D9261C', onFrame: '#FFFFFF', q: '#FFE36B', rays: '#FFE36B' }) },
    { id: 'concert', label: 'Concert ticket', group: 'travel', layout: 'ticket', fits: ['guestlist', 'visitors', 'lottery'], opt: { head: 'ADMIT ONE' },
      pal: P({ frame: '#15101F', panel: '#FCEFF5', tk: '#FF4F9A', ink: '#15101F', accent: '#FF4F9A', mark: '#FF4F9A', onFrame: '#FFFFFF', q: '#FF4F9A' }) },
    { id: 'carnival', label: 'Carnival ticket', group: 'travel', layout: 'ticket', fits: ['visitors', 'guestlist', 'lottery'], opt: { stripes: true, banner: true, head: 'ADMIT ONE' },
      pal: P({ frame: '#B3201F', stripe: '#C9302C', banner: '#6E1110', panel: '#FBF0D9', tk: '#F8EBD0', ink: '#2B1810', accent: '#F6C445', mark: '#B3201F', onFrame: '#FFF4DC', q: '#FFF4DC' }) },
    { id: 'boarding', label: 'Boarding pass', group: 'travel', layout: 'ticket', fits: ['manifest', 'coords'], opt: { boarding: true, head: 'BOARDING PASS' },
      pal: P({ frame: '#0F3D6E', panel: '#FFFFFF', tk: '#FFFFFF', ink: '#0F1E2E', accent: '#F0A33A', mark: '#E4572E', onFrame: '#FFFFFF', headBand: '#E4572E', headInk: '#FFFFFF', q: '#F0A33A' }) },
    { id: 'liner', label: 'Ocean liner poster', group: 'travel', layout: 'poster', fits: ['manifest', 'calls'], opt: { motif: 'ship', rays: true },
      pal: P({ frame: '#0B1A2A', panel: '#F3E2BE', sky1: '#0E2A47', sky2: '#E9B872', sun: '#F5D28A', sea: '#123A5E', ink: '#0B1A2A', accent: '#E9B872', light: '#F6E7C1', head: '#0B1A2A', headInk: '#F3E2BE', mark: '#C8402E', onFrame: '#E9B872' }) },
    { id: 'express', label: 'Night express poster', group: 'travel', layout: 'poster', fits: ['manifest', 'coords'], opt: { motif: 'train' },
      pal: P({ frame: '#1F3B2D', panel: '#F1E3BF', sky1: '#1B2A23', sky2: '#C88B3A', sun: '#E9C46A', sea: '#2E2C22', ink: '#121410', accent: '#E9C46A', light: '#F4D58D', head: '#1F3B2D', headInk: '#F1E3BF', mark: '#B5452A', onFrame: '#E9C46A' }) },
    { id: 'airliner', label: 'Jet age poster', group: 'travel', layout: 'poster', fits: ['manifest', 'coords'], opt: { motif: 'plane' },
      pal: P({ frame: '#14324F', panel: '#F7F3EA', sky1: '#1F6FA8', sky2: '#BFE3F2', sun: '#FFF1C9', sea: '#F4F1E8', ink: '#14324F', accent: '#F0A33A', light: '#FFFFFF', head: '#14324F', headInk: '#FFFFFF', mark: '#E4572E', onFrame: '#FFFFFF' }) },
    { id: 'island', label: 'Island sunset poster', group: 'travel', layout: 'poster', fits: ['calls', 'coords', 'manifest', 'guestlist'], opt: { motif: 'island', rays: true },
      pal: P({ frame: '#1A1020', panel: '#FFF4DE', sky1: '#3B1D4A', sky2: '#F28C3A', sun: '#FFD27A', sea: '#1C5D6B', ink: '#1A1020', accent: '#FFB347', light: '#FFE7B0', head: '#1A1020', headInk: '#FFE7B0', mark: '#E4572E', onFrame: '#FFD27A' }) },
    // places
    { id: 'hotelfacade', label: 'Hotel windows', group: 'places', layout: 'facade', fits: ['hotel', 'calls', 'guestlist'], opt: { sign: 'HOTEL', stars: true },
      pal: P({ frame: '#4B2272', panel: '#F7F1FF', bldg: '#2B1745', win: '#7FD8BE', lit: '#FFD23F', sign: '#FFD23F', signInk: '#2B1745', ink: '#1F1230', accent: '#FFD23F', mark: '#FF4D6D', onFrame: '#FFFFFF', head: '#2B1745', headInk: '#FFFFFF' }) },
    { id: 'hospital', label: 'Hospital night shift', group: 'places', layout: 'facade', fits: ['staff'], opt: { sign: 'HOSPITAL', kind: 'hospital' },
      pal: P({ frame: '#D6E8F3', panel: '#FFFFFF', bldg: '#2F6690', win: '#D9EEF7', lit: '#E63946', sign: '#FFFFFF', signInk: '#2F6690', ink: '#12263A', accent: '#E63946', mark: '#E63946', onFrame: '#12263A', head: '#12263A', headInk: '#FFFFFF' }) },
    { id: 'museum', label: 'Museum after hours', group: 'places', layout: 'facade', fits: ['visitors', 'staff'], opt: { sign: 'MUSEUM', kind: 'temple', stars: true },
      pal: P({ frame: '#1C1A17', panel: '#F2EBDD', bldg: '#D8CCB4', win: '#3A342C', lit: '#F2C14E', signInk: '#1C1A17', ink: '#1C1A17', accent: '#D9B45A', mark: '#B3261E', onFrame: '#EFE6D2', head: '#D9B45A', headInk: '#1C1A17' }) },
    { id: 'tower', label: 'Glass tower', group: 'places', layout: 'facade', fits: ['calls', 'staff', 'coords'], opt: { sign: 'TOWER ONE', kind: 'tower', stars: true },
      pal: P({ frame: '#0B1426', panel: '#EEF2F8', bldg: '#16233D', win: '#2C4A73', lit: '#F4D35E', sign: '#4CC9F0', signInk: '#0B1426', ink: '#0B1426', accent: '#4CC9F0', mark: '#F72585', onFrame: '#EAF2FF', head: '#16233D', headInk: '#EAF2FF' }) },
    { id: 'citymap', label: 'City map', group: 'places', layout: 'map', fits: ['coords', 'calls', 'visitors'],
      pal: P({ frame: '#2B2D42', panel: '#F2EDE1', label: '#FFFFFF', road: '#FFFFFF', roadEdge: '#D6CEBC', park: '#CFE3C0', water: '#A9CFE5', ink: '#2B2D42', accent: '#2B2D42', mark: '#D62828', onFrame: '#F2EDE1', pin: '#2B2D42' }) },
    { id: 'atlas', label: 'Antique atlas', group: 'places', layout: 'map', fits: ['coords', 'manifest'], opt: { atlas: true },
      pal: P({ frame: '#3D2B1F', panel: '#F2E8CF', label: '#F7EFD9', sea: '#C9D9D3', land: '#E8D9B5', grid: '#A9BDB3', ink: '#3D2B1F', accent: '#8B2E16', mark: '#B3261E', onFrame: '#F2E8CF', route: '#8B2E16', pin: '#3D2B1F' }) },
    { id: 'keyhole', label: 'Room key', group: 'places', layout: 'keyhole', fits: ['hotel', 'staff', 'guestlist'],
      pal: P({ frame: '#27443A', panel: '#F2EAD8', plate: '#C9A24E', plateEdge: '#86672A', hole: '#141414', glow: '#F6D98B', ink: '#1A1A1A', accent: '#D9B45A', mark: '#B3261E', onFrame: '#F2EAD8', tag: '#F2EAD8', tagInk: '#27443A' }) },
    // noir and seasonal
    { id: 'midnight', label: 'Midnight street', group: 'night', layout: 'noir', fits: ALL, opt: { rain: true },
      pal: P({ frame: '#0C1A2B', panel: '#13243A', glow: '#8FBCDD', fig: '#04080E', ink: '#E7EEF5', accent: '#F2C14E', mark: '#E63946', onFrame: '#E7EEF5' }) },
    { id: 'bloodnoir', label: 'Black & red noir', group: 'night', layout: 'noir', fits: ALL, opt: { figX: 0.62 },
      pal: P({ frame: '#0D0D0D', panel: '#1A1A1A', glow: '#BDB6A8', fig: '#000000', ink: '#EEE9E0', accent: '#D0312D', mark: '#D0312D', onFrame: '#EEE9E0' }) },
    { id: 'halloween', label: 'Halloween night', group: 'night', layout: 'festive', fits: ALL, opt: { theme: 'halloween' },
      pal: P({ frame: '#2A1240', panel: '#FFF2E0', moon: '#F6D98B', ground: '#12081C', pump: '#F28C28', stem: '#3B5323', bat: '#12081C', ink: '#1A0B26', accent: '#F28C28', mark: '#F28C28', onFrame: '#FFF2E0' }) },
    { id: 'christmas', label: 'Christmas fair', group: 'night', layout: 'festive', fits: ALL, opt: { theme: 'christmas' },
      pal: P({ frame: '#7A1020', panel: '#FBF5E9', snow: '#F4F1EA', tree: '#0F3B2E', wire: '#2A0A10', ink: '#2A0A10', ink2: '#7A1020', accent: '#E8C15A', mark: '#E8C15A', onFrame: '#FBF5E9' }) },
    { id: 'cozy', label: 'Cozy tea time', group: 'night', layout: 'festive', fits: ['guestlist', 'hotel', 'staff', 'visitors'], opt: { theme: 'cozy' },
      pal: P({ frame: '#F7D6DC', panel: '#FFF6F2', dots: '#F2C4CD', cup: '#FFFFFF', tea: '#8A5A3C', cat: '#2B2B2B', ink: '#3A1F25', accent: '#C8102E', mark: '#C8102E', onFrame: '#3A1F25' }) }
  ];
  var BY = {};
  DESIGNS.forEach(function (d) { BY[d.id] = d; });

  // the designs that suit a book type come first
  function forType(typeId) {
    var good = [], rest = [];
    DESIGNS.forEach(function (d) { (d.fits.indexOf(typeId) !== -1 && d.fits !== ALL ? good : rest).push(d); });
    return good.concat(rest);
  }

  LK.coverDesigns = {
    list: DESIGNS, groups: GROUPS, fronts: FRONTS,
    ids: DESIGNS.map(function (d) { return d.id; }),
    get: function (id) { return BY[id] || null; },
    forType: forType
  };
})(typeof window !== 'undefined' ? window : globalThis);
