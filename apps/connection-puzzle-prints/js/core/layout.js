/*
 * Page layout: turns the project into pages of simple drawing items, measured with the real font
 * metrics, so the SVG preview and the PDF place every word identically.
 *
 * Items (lengths in points, y down):
 *   { t:'text', x, y, str, font, size, ink?, ls? }
 *   { t:'line', x1, y1, x2, y2, w, ink?, dash? }
 *   { t:'rect', x, y, w, h, mode:'fill'|'stroke', ink?, lw?, dash? }
 *   { t:'ellipse', cx, cy, rx, ry, mode, ink?, lw? }
 *   { t:'poly', pts:[x,y,...], closed, mode, ink?, lw? }
 * ink is the gray level (1 = black, default). Nothing is lighter than 10% gray, no line is thinner
 * than 0.75 pt and no text is smaller than 7 pt: the KDP rules. A large print book goes further:
 * no text is smaller than its text size (S.min), tiles included, unless a word cannot fit a tile at
 * that size on this page; the checklist then says so.
 *
 * Book order: title, copyright, welcome and how to play with a worked example, the puzzle log, the
 * puzzles (a divider before each level in a mixed book), hints, solutions and the closing note.
 * Page numbers that point forward come from the previous pass.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var KDP = CX.kdp, P = CX.plan;
  var PT = 72;
  var F = null;

  var PRINT = {
    regular: { base: 12, label: 'Regular (12 pt text)' },
    large: { base: 14, label: 'Easy to read (14 pt text)' },
    xl: { base: 16, label: 'Large print (16 pt text)' }
  };
  var TILE_MIN_H = 0.5;   // a tile is at least this tall for its width
  var TILE_MIN_H2 = 0.28; // two puzzles a page: flatter tiles, still room for the ring and a line
  var TILE_MAX_H = 0.72;  // and at most this tall, so the board stays a board

  function r2(v) { return Math.round(v * 100) / 100; }
  function fonts() { return F || (F = CX.metrics.load()); }
  function txt(str, font) { return CX.metrics.printable(String(str == null ? '' : str), fonts()[font]); }
  function wid(str, size, font, ls) { return fonts()[font].width(txt(str, font), size, ls || 0); }

  function wrap(str, size, font, maxW) {
    var words = String(str).split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur && wid(t, size, font) > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  /*
   * Lines made of whole units (links, answers): a unit never breaks across lines unless it is wider
   * than a line by itself, and then it breaks evenly ("Ways to cook / an egg", never "Dutch / ___").
   * sep joins units on a line; mark ends a line that a unit follows (',' for answers).
   */
  function wrapUnits(units, sep, mark, size, font, maxW) {
    var lines = [], cur = '';
    units.forEach(function (u, i) {
      var tail = i < units.length - 1 ? mark : '', t = cur ? cur + sep + u : u;
      if (wid(t + tail, size, font) <= maxW) { cur = t; return; }
      if (cur) lines.push(cur + mark);
      if (wid(u + tail, size, font) <= maxW) { cur = u; return; }
      var parts = fit(u + tail, font, maxW, size, size, 6).lines;
      Array.prototype.push.apply(lines, parts.slice(0, -1));
      var last = parts[parts.length - 1];
      cur = tail && last.slice(-tail.length) === tail ? last.slice(0, -tail.length) : last;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // The largest size (down to min) at which str fits in maxLines lines of maxW, the lines balanced.
  // lead: words that may take the first line to themselves (the puzzle's name in a title).
  function fit(str, font, maxW, maxSize, minSize, maxLines, lead) {
    function even(l, s) {
      return l.length > 1 && CX.text.balance(String(str).split(/\s+/).filter(Boolean), function (x) { return wid(x, s, font); }, maxW, l.length, lead) || l;
    }
    for (var s = maxSize; s > minSize; s -= 0.5) {
      var l = wrap(str, s, font, maxW);
      if (l.length <= maxLines && l.every(function (x) { return wid(x, s, font) <= maxW; })) return { size: s, lines: even(l, s) };
    }
    return { size: minSize, lines: even(wrap(str, minSize, font, maxW), minSize) };
  }

  // ---------- pages ----------
  function Page(L, kind, label) {
    this.num = L.pages.length + 1;
    this.side = this.num % 2 === 1 ? 'right' : 'left';
    this.W = L.W; this.H = L.H;
    var m = L.m;
    this.x0 = this.side === 'right' ? m.inside : m.outside;
    this.x1 = L.W - (this.side === 'right' ? m.outside : m.inside);
    this.y0 = m.top; this.y1 = L.H - m.bottom;
    var s = L.safe;
    this.safe = {
      x0: this.side === 'right' ? s.inside : s.outside,
      x1: L.W - (this.side === 'right' ? s.outside : s.inside),
      y0: s.top, y1: L.H - s.bottom
    };
    this.cb = this.y1 - L.foot;
    this.cx = (this.x0 + this.x1) / 2;
    this.w = this.x1 - this.x0;
    this.items = []; this.kind = kind; this.label = label || kind; this.meta = {};
    this.folio = true;
    L.pages.push(this);
  }
  Page.prototype.text = function (str, x, y, size, font, o) {
    o = o || {};
    var s = txt(String(str), font);
    if (!s) return 0;
    var w = F[font].width(s, size, o.ls || 0);
    if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w;
    var it = { t: 'text', x: r2(x), y: r2(y), str: s, font: font, size: r2(size) };
    if (o.ls) it.ls = r2(o.ls);
    if (o.align === 'center' || o.align === 'right') it.align = o.align; // kept for the editable (.pptx) copy
    if (o.ink != null && o.ink !== 1) it.ink = o.ink;
    this.items.push(it);
    return w;
  };
  Page.prototype.line = function (x1, y1, x2, y2, w, ink, dash) {
    var it = { t: 'line', x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), w: Math.max(KDP.MIN_LINE_PT, w || 0.75) };
    if (ink != null && ink !== 1) it.ink = ink;
    if (dash) it.dash = dash;
    this.items.push(it);
  };
  Page.prototype.box = function (x, y, w, h, lw, ink, dash) {
    var it = { t: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), mode: 'stroke', lw: Math.max(KDP.MIN_LINE_PT, lw || 0.75) };
    if (ink != null && ink !== 1) it.ink = ink;
    if (dash) it.dash = dash;
    this.items.push(it);
  };
  Page.prototype.ring = function (cx, cy, r, lw, ink) {
    var it = { t: 'ellipse', cx: r2(cx), cy: r2(cy), rx: r2(r), ry: r2(r), mode: 'stroke', lw: Math.max(KDP.MIN_LINE_PT, lw || 1) };
    if (ink != null && ink !== 1) it.ink = ink;
    this.items.push(it);
  };
  Page.prototype.poly = function (pts, ink) {
    var it = { t: 'poly', pts: pts.map(r2), closed: true, mode: 'fill' };
    if (ink != null && ink !== 1) it.ink = ink;
    this.items.push(it);
  };
  Page.prototype.path = function (pts, lw, ink, closed) {
    var it = { t: 'poly', pts: pts.map(r2), closed: !!closed, mode: 'stroke', lw: Math.max(KDP.MIN_LINE_PT, lw || 1), round: true };
    if (ink != null && ink !== 1) it.ink = ink;
    this.items.push(it);
  };

  // ---------- small drawings (gray only) ----------
  function rrectPts(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    var pts = [], c = [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]];
    c.forEach(function (k) { for (var i = 0; i <= 6; i++) { var a = (k[2] + i * 15) * Math.PI / 180; pts.push(k[0] + Math.cos(a) * r, k[1] + Math.sin(a) * r); } });
    return pts;
  }
  function starPts(cx, cy, r) {
    var pts = [];
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    return pts;
  }
  function diamond(pg, cx, cy, r, ink) { pg.poly([cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy], ink); }

  // Four little tiles in four grays between two rules: the ornament of the book.
  function ornament(pg, cx, y, half) {
    var s = Math.min(12, half / 4), gap = s * 0.45, w = 4 * s + 3 * gap, x = cx - w / 2;
    [0.18, 0.36, 0.56, 0.8].forEach(function (ink, i) { pg.poly(rrectPts(x + i * (s + gap), y - s / 2, s, s, s * 0.25), ink); });
    if (half > w / 2 + s) {
      pg.line(cx - half, y, x - s * 0.6, y, 0.75, 0.55);
      pg.line(x + w + s * 0.6, y, cx + half, y, 0.75, 0.55);
    }
  }

  function stars(pg, xRight, y, n, size) {
    for (var i = 0; i < 3; i++) {
      var cx = xRight - size * 0.5 - (2 - i) * size * 1.15, cy = y - size * 0.36;
      if (i < n) pg.poly(starPts(cx, cy, size * 0.52));
      else pg.path(starPts(cx, cy, size * 0.48), 0.75, 1, true);
    }
  }

  // A round badge with a group number, its center at cx, cy.
  function badge(pg, cx, cy, r, n, size) {
    pg.ring(cx, cy, r, 0.9, 0.85);
    pg.text(String(n), cx, cy + F.sansBold.capHeight * size / 2, size, 'sansBold', { align: 'center' });
  }

  // ---------- the layout state ----------
  // large: a large print book, where the small labels, page numbers and notes are the text size too
  function sizes(b, large) {
    var fl = large ? b : 0;
    return {
      b: b, lead: b * 1.36, h1: b * 1.85, h2: b * 1.3,
      small: Math.max(8, b * 0.62, fl), folio: Math.max(8.5, b * 0.68, fl),
      large: !!large, min: large ? b : 7
    };
  }
  function printSizes(project) { return sizes(PRINT[project.book.print] ? PRINT[project.book.print].base : 14, project.book.print !== 'regular'); }

  function Layout(project, pages, draft, refs) {
    var t = KDP.trim(project.book.trim);
    this.project = project;
    this.draft = draft;
    this.refs = refs || {};
    this.out = { sol: {}, hint: {} };
    this.W = t.w * PT; this.H = t.h * PT;
    var m = KDP.margins(pages);
    this.m = { inside: m.inside * PT, outside: m.outside * PT, top: m.top * PT, bottom: m.bottom * PT };
    this.safe = { inside: m.safe.inside * PT, outside: m.safe.outside * PT, top: m.safe.top * PT, bottom: m.safe.bottom * PT };
    this.S = printSizes(project);
    this.foot = this.S.folio + 12;
    this.pages = [];
    this.flow = null;
    this.pg = null; this.y = 0;
  }

  Layout.prototype.page = function (kind, label, head) {
    var pg = new Page(this, kind, label);
    this.pg = pg; this.y = pg.y0;
    this.flow = { kind: kind, label: label, head: head };
    if (head) {
      var S = this.S;
      pg.text(head.toUpperCase(), pg.cx, pg.y0 + S.small, S.small, 'sans', { align: 'center', ls: 1.6 });
      this.y = pg.y0 + S.small + S.b * 1.1;
    }
    return pg;
  };

  Layout.prototype.need = function (h) {
    if (this.y + h <= this.pg.cb + 0.01) return false;
    var f = this.flow;
    this.page(f.kind, f.label, f.head);
    return true;
  };

  // Section title block: small label, big title, optional subtitle, then a rule or the ornament.
  Layout.prototype.heading = function (eyebrow, title, sub, align) {
    var S = this.S, pg = this.pg, y = this.y + S.b * 0.4, left = align === 'left';
    var x = left ? pg.x0 : pg.cx, o = { align: left ? null : 'center' };
    if (eyebrow) { y += S.small; pg.text(eyebrow.toUpperCase(), x, y, S.small * 1.05, 'sans', Object.assign({ ls: 2.2 }, o)); y += S.b * 0.9; }
    var t = fit(title, 'serifBold', pg.w * (left ? 1 : 0.92), S.h1, S.b * 1.2, 2);
    t.lines.forEach(function (l) { y += t.size * 1.05; pg.text(l, x, y, t.size, 'serifBold', o); y += t.size * 0.12; });
    if (sub) wrap(sub, S.b, 'serif', pg.w * (left ? 1 : 0.88)).forEach(function (l) { y += S.b * 1.32; pg.text(l, x, y, S.b, 'serif', o); });
    if (left) { y += S.b * 0.7; pg.line(pg.x0, y, pg.x1, y, 0.9); this.y = y + S.b * 0.9; return; }
    y += S.b * 1.2;
    ornament(pg, pg.cx, y, Math.min(80, pg.w * 0.26));
    this.y = y + S.b * 1.7;
  };

  Layout.prototype.para = function (text, font, size, lead, indent, ink) {
    var self = this;
    indent = indent || 0;
    wrap(text, size, font, this.pg.w - indent).forEach(function (l) {
      self.need(lead);
      self.y += lead;
      self.pg.text(l, self.pg.x0 + indent, self.y - lead * 0.26, size, font, { ink: ink });
    });
  };

  Layout.prototype.bullets = function (items) {
    var S = this.S, self = this;
    items.forEach(function (t) {
      var ind = S.b * 1.2, lines = wrap(t, S.b, 'serif', self.pg.w - ind);
      self.need(lines.length * S.lead + S.b * 0.35);
      self.y += S.b * 0.35;
      diamond(self.pg, self.pg.x0 + S.b * 0.4, self.y + S.lead * 0.74 - S.b * 0.32, S.b * 0.24);
      lines.forEach(function (l) { self.y += S.lead; self.pg.text(l, self.pg.x0 + ind, self.y - S.lead * 0.26, S.b, 'serif'); });
    });
  };

  Layout.prototype.label = function (str) {
    var S = this.S;
    this.need(S.b * 2.6);
    this.y += S.b * 1.5;
    this.pg.text(str.toUpperCase(), this.pg.x0, this.y, S.small * 1.05, 'sansBold', { ls: 2 });
    this.y += S.b * 0.5;
  };

  Layout.prototype.placeholder = function (title, note, h) {
    var S = this.S;
    this.need(h);
    var pg = this.pg, y = this.y + S.b * 0.4, x = pg.x0, w = pg.w;
    pg.box(x, y, w, h - S.b * 0.8, 0.9, 0.35, [5, 4]);
    var ty = y + (h - S.b * 0.8) / 2 - S.b * 0.4;
    pg.text(title, x + w / 2, ty, S.b * 0.95, 'sansBold', { align: 'center', ink: 0.55 });
    wrap(note, S.small * 1.15, 'sans', w * 0.8).forEach(function (l, i) {
      pg.text(l, x + w / 2, ty + S.b * 1.2 + i * S.small * 1.5, S.small * 1.15, 'sans', { align: 'center', ink: 0.55 });
    });
    this.y += h;
  };

  // ---------- tiles ----------
  function tilePad(tw) { return Math.max(3, tw * 0.05); }
  function ringR(tw, th) { return Math.max(3.2, Math.min(6.5, th * 0.1, tw * 0.06)); }

  /*
   * Where a word goes on a tile tw x th: { size, lines, top (of the first line's capitals, from the
   * tile top), lead } at the biggest size from max down to min, or null when it does not fit. The
   * text stays clear of the pencil ring in the top-left corner and inside the tile's padding.
   */
  function fitTile(word, tw, th, max, min) {
    fonts();
    var pad = tilePad(tw), r = ringR(tw, th), ringRight = pad + r * 2 + 1.5, ringBottom = pad + r * 2 + 1.5;
    var parts = String(word).split(' ').length, maxLines = parts >= 3 ? 3 : 2, innerW = tw - pad * 2;
    for (var s = max; s >= min - 0.001; s -= 0.5) {
      var lines = wrap(word, s, 'sansBold', innerW);
      if (lines.length > maxLines || lines.some(function (l) { return wid(l, s, 'sansBold') > innerW; })) continue;
      var lead = s * 1.12, cap = F.sansBold.capHeight * s, blockH = (lines.length - 1) * lead + cap;
      var top = (th - blockH) / 2, widest = Math.max.apply(null, lines.map(function (l) { return wid(l, s, 'sansBold'); }));
      if ((tw - widest) / 2 < ringRight && top < ringBottom) top = ringBottom;
      if (top + blockH > th - pad) continue;
      return { size: s, lines: lines, top: top, lead: lead };
    }
    return null;
  }

  function tileGeom(w, S) { var gap = Math.max(5, S.b * 0.35); return { gap: gap, tw: (w - gap * 3) / 4 }; }

  // The narrowest tile this book can have: the widest inside margin KDP may ask for.
  function narrowTile(project) {
    var t = KDP.trim(project.book.trim), m = KDP.margins(KDP.maxPages(t.id, project.book.paper));
    var g = tileGeom((t.w - m.inside - m.outside) * PT, printSizes(project));
    return { tw: g.tw, th: g.tw * (project.plan.perPage === 2 ? TILE_MIN_H2 : TILE_MIN_H) };
  }

  // Does a word fit a tile of this book at 7 pt, on the narrowest page the book can have?
  function fitsTile(project, word) {
    var n = narrowTile(project);
    return !!fitTile(word, n.tw, n.th, KDP.MIN_FONT_PT, KDP.MIN_FONT_PT);
  }

  // About how many capitals fit across a tile at the book's text size: what the prompts ask for.
  function tileLetters(project) {
    fonts();
    var n = narrowTile(project), S = printSizes(project), avg = wid('ABCDEFGHIJKLMNOPQRSTUVWXYZ', S.min, 'sansBold') / 26;
    return Math.floor((n.tw - tilePad(n.tw) * 2) / (avg * 1.08));
  }

  // One tile: a rounded box, the pencil ring and the word.
  function tile(pg, x, y, tw, th, word, S, max) {
    var r = ringR(tw, th), pad = tilePad(tw);
    pg.path(rrectPts(x, y, tw, th, Math.min(6, th * 0.14)), 1, 0.85, true);
    pg.ring(x + pad + r, y + pad + r, r, 0.75, 0.5);
    var ft = fitTile(word, tw, th, max, S.min) || fitTile(word, tw, th, Math.min(max, S.min), KDP.MIN_FONT_PT);
    if (!ft) return;
    if (ft.size < S.min - 0.01) pg.meta.small = Math.min(pg.meta.small || 99, ft.size);
    var base = y + ft.top + F.sansBold.capHeight * ft.size;
    ft.lines.forEach(function (l, i) { pg.text(l, x + tw / 2, base + i * ft.lead, ft.size, 'sansBold', { align: 'center' }); });
  }

  // The 4 x 4 board, its top-left at x, y.
  function board(pg, cells, x, y, tw, th, gap, S) {
    var max = Math.min(S.b * 1.15, th * 0.36);
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) tile(pg, x + c * (tw + gap), y + r * (th + gap), tw, th, cells[r][c].w, S, max);
  }

  // ---------- the answer lines under the board ----------
  // full: per group a badge and a line for the link, then four boxes under the tile columns.
  function answerH(S, full) { return full ? 4 * S.b * 4.4 : 4 * S.b * 2.05; }
  function answers(pg, x, y, w, tw, gap, S, full) {
    var r = S.b * 0.62, bs = Math.max(8, S.b * 0.8, S.min);
    for (var i = 0; i < 4; i++) {
      var row = y + i * S.b * (full ? 4.4 : 2.05), cy = row + S.b * 0.95;
      badge(pg, x + r, cy, r, i + 1, bs);
      pg.line(x + r * 2 + S.b * 0.6, cy + r * 0.85, x + w, cy + r * 0.85, 0.75, 0.6);
      if (!full) continue;
      var by = row + S.b * 2.05, bh = S.b * 1.85;
      for (var c = 0; c < 4; c++) pg.path(rrectPts(x + c * (tw + gap), by, tw, bh, 3), 0.75, 0.45, true);
    }
  }

  // ---------- one puzzle, in the box from top to bottom of the page ----------
  // The block's parts for this width and height: { tw, th, gap, full } or null when it cannot fit.
  function plan(S, w, h, headH, footH, minH) {
    var g = tileGeom(w, S), rest;
    minH = minH || TILE_MIN_H;
    for (var k = 0; k < 2; k++) {
      var full = k === 0;
      rest = h - headH - footH - answerH(S, full) - S.b * 1.2;
      var th = Math.min(g.tw * TILE_MAX_H, (rest - g.gap * 3) / 4);
      if (th >= g.tw * minH && (!full || th >= g.tw * 0.58)) return { tw: g.tw, th: th, gap: g.gap, full: full, spare: rest - th * 4 - g.gap * 3 };
    }
    return null;
  }
  function headH(S) { return Math.max(8, S.small, S.b * 0.8) * 1.2 + S.b * 0.9; }
  function footH(S) { return S.small * 1.6; }

  function puzzleBlock(L, pg, pz, top, bottom, two) {
    var p = L.project, S = L.S, res = CX.puzzles.get(p, pz), lvl = P.levelOf(p, pz), hs = Math.max(8, S.small, S.b * 0.8), y = top + hs;
    pg.text('PUZZLE ' + pz.no, pg.x0, y, hs * 1.15, 'sansBold', { ls: 1.8 });
    if (p.plan.stars) stars(pg, pg.x1, y, P.level(lvl).stars, hs * 1.15);
    y = top + headH(S);
    if (!res || !res.ok) {
      L.pg = pg; L.y = y;
      L.flow = { kind: 'puzzle', label: 'Puzzle ' + pz.no };
      if (L.draft) {
        var why = res && res.problems.length ? 'Not ready: ' + res.problems[0] + '. Until it is fixed, the PDF leaves this puzzle out and numbers the rest, so no page is blank.' : 'Copy the prompt in step 3, paste it into ChatGPT, then paste the reply back. The app checks the groups and lays out the board.';
        L.placeholder('Puzzle ' + pz.no + ' goes here', why, Math.max(S.b * 6, bottom - L.y - S.b * 0.4));
      }
      return;
    }
    var g0 = tileGeom(pg.w, S), lay = plan(S, pg.w, bottom - top, headH(S), footH(S), two ? TILE_MIN_H2 : TILE_MIN_H) || { tw: g0.tw, th: g0.tw * (two ? TILE_MIN_H2 : TILE_MIN_H), gap: g0.gap, full: false, spare: 0 };
    var gy = y + Math.min(lay.spare * 0.25, S.b * 1.2);
    board(pg, res.cells, pg.x0, gy, lay.tw, lay.th, lay.gap, S);
    var ay = gy + lay.th * 4 + lay.gap * 3 + S.b * 0.9 + Math.min(lay.spare * 0.3, S.b * 1.5);
    answers(pg, pg.x0, ay, pg.w, lay.tw, lay.gap, S, lay.full);
    var refs = [], sol = L.refs.sol && L.refs.sol[pz.id], hint = L.refs.hint && L.refs.hint[pz.id];
    if (hint) refs.push('Hint: page ' + hint);
    refs.push(sol ? 'Solution: page ' + sol : 'Solution at the back');
    pg.text(refs.join('   ·   '), pg.x1, bottom - S.small * 0.3, S.small, 'sans', { align: 'right', ink: 0.8 });
    pg.meta.tile = Math.min(pg.meta.tile || 1e9, lay.th);
  }

  // Two puzzles to a page only when both still get a board with real tiles.
  function perPage(L) {
    if (L.project.plan.perPage !== 2) return 1;
    var S = L.S, h = L.H - L.m.top - L.m.bottom - L.foot, w = L.W - L.m.inside - L.m.outside;
    return plan(S, w, h / 2 - S.b * 0.6, headH(S), footH(S), TILE_MIN_H2) ? 2 : 1;
  }

  function puzzlePages(L, list) {
    var p = L.project, per = perPage(L), mixed = p.plan.level === 'mixed', prev = '', i = 0;
    while (i < list.length) {
      var lvl = P.levelOf(p, list[i]);
      if (mixed && lvl !== prev) levelPage(L, lvl);
      prev = lvl;
      var pg = L.page('puzzle', 'Puzzle ' + list[i].no);
      pg.meta.puzzle = list[i].id;
      // a second puzzle shares the page only if it is on the same level
      var two = per === 2 && list[i + 1] && P.levelOf(p, list[i + 1]) === lvl;
      L.out.pages = L.out.pages || {};
      L.out.pages[list[i].id] = pg.num;
      if (two) {
        var mid = (pg.y0 + pg.cb) / 2;
        puzzleBlock(L, pg, list[i], pg.y0, mid - L.S.b * 0.6, true);
        pg.line(pg.x0, mid, pg.x1, mid, 0.75, 0.35, [2, 3]);
        puzzleBlock(L, pg, list[i + 1], mid + L.S.b * 0.6, pg.cb, true);
        L.out.pages[list[i + 1].id] = pg.num;
        i += 2;
      } else {
        puzzleBlock(L, pg, list[i], pg.y0, pg.cb);
        i++;
      }
    }
  }

  function levelPage(L, id) {
    var S = L.S, lv = P.level(id), pg = L.page('level', lv.section);
    var y = pg.y0 + pg.H * 0.26;
    stars(pg, pg.cx + S.h1 * 1.8, y, lv.stars, S.h1 * 1.05);
    y += S.b * 2;
    var t = fit(lv.section, 'serifBold', pg.w * 0.9, S.h1 * 1.5, S.b * 1.2, 2);
    t.lines.forEach(function (l) { y += t.size * 1.1; pg.text(l, pg.cx, y, t.size, 'serifBold', { align: 'center' }); });
    y += S.b * 1.6;
    pg.text(lv.label.toUpperCase() + ' PUZZLES', pg.cx, y, S.small * 1.1, 'sans', { align: 'center', ls: 2.2 });
    y += S.b * 0.8;
    wrap(lv.help, S.b, 'serif', pg.w * 0.82).forEach(function (l) { y += S.lead; pg.text(l, pg.cx, y, S.b, 'serif', { align: 'center' }); });
    ornament(pg, pg.cx, y + S.b * 2.6, Math.min(90, pg.w * 0.3));
  }

  // ---------- front matter ----------
  function titlePage(L) {
    var p = L.project, S = L.S;
    var pg = L.page('title', 'Title page');
    pg.folio = false;
    var title = P.bookTitle(p, L.draft), sub = P.bookSubtitle(p, L.draft);
    var y = pg.y0 + pg.H * 0.08;
    var t = fit(title, 'serifBold', pg.w * 0.9, Math.min(34, pg.w / 8.5), S.b * 1.3, 4, p.plan.name);
    t.lines.forEach(function (l) { y += t.size * 1.1; pg.text(l, pg.cx, y, t.size, 'serifBold', { align: 'center' }); });
    if (sub) {
      y += S.b * 0.7;
      var ss = Math.max(S.b * 0.88, 11, S.min);
      fit(sub, 'serif', pg.w * 0.84, ss, ss, 6).lines.forEach(function (l) { y += ss * 1.38; pg.text(l, pg.cx, y, ss, 'serif', { align: 'center' }); });
    }
    // a little board of empty tiles, one row of them shaded: a group found
    var bw = Math.min(pg.w * 0.55, 220), gap = bw * 0.04, tw = (bw - gap * 3) / 4, th = tw * 0.6, by = Math.max(y + S.b * 3, pg.y0 + pg.H * 0.42);
    if (by + th * 4 + gap * 3 < pg.cb - S.b * 4) {
      var x0 = pg.cx - bw / 2;
      for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
        var pts = rrectPts(x0 + c * (tw + gap), by + r * (th + gap), tw, th, th * 0.18);
        if (r === 1) pg.poly(pts, 0.3); else pg.path(pts, 1, 0.7, true);
      }
    } else ornament(pg, pg.cx, y + S.b * 3, 70);
    var author = (p.book.author || '').trim();
    if (author || L.draft) pg.text(author || 'Your pen name', pg.cx, pg.cb - S.b, S.b * 1.05, 'serif', { align: 'center', ink: author ? 1 : 0.45 });
  }

  function copyrightPage(L) {
    var p = L.project, S = L.S;
    var pg = L.page('copyright', 'Copyright');
    pg.folio = false;
    var size = Math.max(8.5, S.b * 0.66, S.min), lead = size * 1.5;
    var year = new Date().getFullYear(), author = (p.book.author || '').trim();
    var paras = [
      'Copyright © ' + year + (author ? ' ' + author : '') + '. All rights reserved.',
      'No part of this book may be copied or shared in any form without written permission from the author, except for short quotations in reviews.',
      'First edition'
    ];
    var lines = [];
    paras.forEach(function (t, i) { if (i) lines.push(''); Array.prototype.push.apply(lines, wrap(t, size, 'serif', pg.w * 0.85)); });
    var y = pg.cb - lines.length * lead;
    lines.forEach(function (l) { y += lead; if (l) pg.text(l, pg.cx, y - lead * 0.3, size, 'serif', { align: 'center' }); });
  }

  // The worked example of the how-to page: always the same puzzle.
  // The worked example of the how-to page: the one that gives nothing of this book away.
  function example(project) {
    var ex = P.asPuzzle(P.example(project));
    ex.cells = CX.engine.arrange(ex, 'how-to-play');
    return ex;
  }

  // One solved puzzle as rows: badge, link, answers. Returns the height; draws only when pg is given.
  function solvedRows(pg, d, x, y, w, S, size) {
    var r = size * 0.62, ind = r * 2 + size * 0.55, lead = size * 1.25, h = 0;
    d.groups.forEach(function (g, i) {
      var link = fit(g.link, 'sansBold', w - ind, size, size, 6).lines, ans = wrapUnits(g.words, ', ', ',', size, 'sans', w - ind);
      var rowH = (link.length + ans.length) * lead + size * 0.45;
      if (pg) {
        badge(pg, x + r, y + h + lead * 0.5, r, i + 1, Math.max(KDP.MIN_FONT_PT, size * 0.8, S.min));
        link.forEach(function (l, k) { pg.text(l, x + ind, y + h + lead * (k + 0.78), size, 'sansBold'); });
        ans.forEach(function (l, k) { pg.text(l, x + ind, y + h + lead * (link.length + k + 0.78), size, 'sans'); });
      }
      h += rowH;
    });
    return h;
  }

  function howPage(L) {
    var p = L.project, S = L.S, pl = p.plan, refs = L.refs, name = pl.name.trim() || 'Word Links', kid = P.audience(pl.audience).kid;
    L.page('how', 'How to Play', 'How to play');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Welcome to ' + name);
    var welcome = p.ai.welcome.length ? p.ai.welcome : ['Every puzzle in this book is a board of sixteen words. Hidden among them are four groups of four that share a link. Find the links, and the board sorts itself.'];
    welcome.forEach(function (t, i) { if (i) L.y += S.b * 0.5; L.para(P.countText(p, t, L.draft), 'serif', S.b, S.lead); });
    L.label('How to play');
    L.bullets(kid ? [
      'Each puzzle has 16 words. Sort them into four groups of four words that go together.',
      'The link is what the four words have in common, like Fruit or Farm animals.',
      'Watch out for tricks: some words seem to fit two groups. Only one way uses all 16 words.',
      'Write a group number in the little circle of each word, then write the groups on the lines.'
    ] : [
      'Each puzzle has 16 words. Sort them into four groups of four, so that the words in each group share a link.',
      'A link can be anything: a kind of thing, a word that fits a blank (___ cake), a hidden word, a sound.',
      'Watch out for traps: some words seem to fit two groups. Only one way of sorting uses all 16 words.',
      'Pencil a group number in the little circle of each tile as you go, then write each group and its link on the lines.',
      'Start with the group you are surest of. The last group often falls into place by itself.'
    ]);
    // the worked example: the board, then the same board solved
    // a little smaller than a puzzle page, and the heading never stays behind without its board
    var ex = example(p), bw = L.pg.w * 0.88, g = tileGeom(bw, S), th = g.tw * 0.55, bh = th * 4 + g.gap * 3;
    L.need(S.b * 2.6 + bh + S.b);
    L.label('An example');
    L.y += S.b * 0.3;
    board(L.pg, ex.cells, L.pg.cx - bw / 2, L.y, g.tw, th, g.gap, S);
    L.y += bh + S.b * 0.2;
    var size = Math.max(S.min, S.b * 0.9), h = solvedRows(null, ex, 0, 0, L.pg.w, S, size);
    L.need(S.b * 2.6 + h);
    L.label('Solved');
    solvedRows(L.pg, ex, L.pg.x0, L.y + S.b * 0.2, L.pg.w, S, size);
    L.y += h + S.b * 0.2;
    L.para('The traps: ' + ex.trap, 'serif', S.b, S.lead);
    var more = ['In the solutions, group 1 is the most direct link and group 4 the trickiest.'];
    if (pl.hints && refs.hints) more.push('Stuck? The hints start on page ' + refs.hints + ': they give the four links of each puzzle, but not which words go where.');
    if (refs.solutions) more.push('All the solutions start on page ' + refs.solutions + '.');
    more.forEach(function (t) { L.y += S.b * 0.4; L.para(t, 'serif', S.b, S.lead); });
    if (pl.level === 'mixed') {
      L.label('Three levels');
      L.bullets(P.LEVELS.map(function (lv) { return lv.label + ': ' + lv.help; }));
    }
  }

  // Tick off the puzzles as they are solved.
  function logPage(L, list) {
    var S = L.S;
    L.page('log', 'Puzzle Log', 'Puzzle log');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Puzzle Log', 'Tick off each puzzle as you solve it.', 'left');
    var ns = Math.max(8, S.small * 1.1), bs = ns * 1.25, nw = wid(String(list.length), ns, 'sans') + ns * 0.5;
    var cw = nw + bs + S.b * 0.9, cols = Math.max(1, Math.min(10, Math.floor(L.pg.w / cw))), rowH = bs * 1.5;
    cw = L.pg.w / cols;
    for (var i = 0; i < list.length; i += cols) {
      L.need(rowH);
      var pg = L.pg;
      for (var c = 0; c < cols && i + c < list.length; c++) {
        var x = pg.x0 + c * cw;
        pg.text(String(list[i + c].no), x + nw - ns * 0.3, L.y + bs * 0.88, ns, 'sans', { align: 'right' });
        pg.box(x + nw, L.y + bs * 0.1, bs * 0.9, bs * 0.9, 0.75);
      }
      L.y += rowH;
    }
  }

  // ---------- hints: the four links of each puzzle, shuffled ----------
  function hintsSection(L, list) {
    var p = L.project, S = L.S, ready = list.filter(function (x) { return x.res && x.res.ok; });
    if (!ready.length) return;
    L.page('hints', 'Hints', 'Hints');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Hints', 'The four links of each puzzle, in no special order.', 'left');
    var size = Math.max(9, S.b * 0.86, S.min), lead = size * 1.32, nw = wid('000', size, 'sansBold') + size * 0.6;
    ready.forEach(function (x) {
      var d = p.puzzles[x.pz.id], rng = CX.util.makeRng(p.seed + '|hint|' + x.pz.id);
      var lines = wrapUnits(rng.shuffle(d.groups.map(function (g) { return g.link.trim(); })), '  ·  ', '', size, 'serif', L.pg.w - nw);
      L.need(lines.length * lead + size * 0.5);
      var pg = L.pg;
      L.out.hint[x.pz.id] = pg.num;
      pg.text(String(x.pz.no), pg.x0 + nw - size * 0.6, L.y + lead * 0.78, size, 'sansBold', { align: 'right' });
      lines.forEach(function (l, i) { pg.text(l, pg.x0 + nw, L.y + lead * (i + 0.78), size, 'serif'); });
      L.y += lines.length * lead + size * 0.5;
    });
  }

  // ---------- solutions: blocks that flow down one or two columns ----------
  function solutions(L, list) {
    var p = L.project, S = L.S, ready = list.filter(function (x) { return x.res && x.res.ok; });
    if (!ready.length) return;
    L.page('solutions', 'Solutions', 'Solutions');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Solutions');
    var cols = L.pg.w >= 380 ? 2 : 1, gapX = S.b * 1.4, cw = (L.pg.w - gapX * (cols - 1)) / cols;
    var size = Math.max(S.min, Math.min(S.b * 0.8, 11)), hs = Math.max(8, S.small, size), col = 0, top = L.y;
    ready.forEach(function (x) {
      var d = p.puzzles[x.pz.id], h = hs * 1.5 + solvedRows(null, d, 0, 0, cw, S, size) + S.b * 0.9;
      if (L.y + h > L.pg.cb) {
        if (++col >= cols) { L.page('solutions', 'Solutions', 'Solutions'); col = 0; top = L.y; }
        L.y = top;
      }
      var pg = L.pg, x0 = pg.x0 + col * (cw + gapX);
      L.out.sol[x.pz.id] = pg.num;
      pg.text('PUZZLE ' + x.pz.no, x0, L.y + hs, hs, 'sansBold', { ls: 1.4 });
      pg.line(x0, L.y + hs * 1.3, x0 + cw, L.y + hs * 1.3, 0.75, 0.5);
      solvedRows(pg, d, x0, L.y + hs * 1.5, cw, S, size);
      L.y += h;
    });
    L.y = L.pg.cb;
  }

  function closingPage(L) {
    var p = L.project, S = L.S;
    L.page('closing', 'You Made It', 'You made it');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'You Made It!');
    if (p.ai.closing.length) p.ai.closing.forEach(function (t, i) { if (i) L.y += S.b * 0.5; L.para(P.countText(p, t, L.draft), 'serif', S.b, S.lead); });
    else if (L.draft) L.placeholder('Your closing note', 'It appears here after you paste the reply to the last prompt in step 3.', S.b * 7);
    else L.para('Every board sorted and every link found. Thank you for spending your puzzle time with this book. We hope you had as much fun solving these as we had making them.', 'serif', S.b, S.lead);
    if (L.pg.cb - L.y > S.b * 6) ornament(L.pg, L.pg.cx, (L.y + L.pg.cb) / 2, Math.min(90, L.pg.w * 0.3));
  }

  function folios(L) {
    var S = L.S;
    L.pages.forEach(function (pg) {
      if (!pg.folio) return;
      pg.text(String(pg.num), pg.cx, pg.y1 - 2, S.folio, 'serif', { align: 'center' });
    });
  }

  function pass(project, pageGuess, draft, refs) {
    fonts();
    var L = new Layout(project, pageGuess, draft, refs);
    // the preview shows every puzzle with what it still needs; the print only the ones it can print
    var out = L.out, sections = [], all = draft ? P.puzzles(project) : CX.puzzles.printed(project), pl = project.plan;
    var list = all.map(function (pz) { return { pz: pz, res: CX.puzzles.get(project, pz) }; });
    titlePage(L);
    copyrightPage(L);
    var front = [{ page: 1, title: 'Title page' }];
    sections.push({ page: L.pages.length + 1, title: 'How to Play' });
    howPage(L);
    if (pl.log) { sections.push({ page: L.pages.length + 1, title: 'Puzzle Log' }); logPage(L, all); }
    sections.push({ page: L.pages.length + 1, title: 'The Puzzles' });
    puzzlePages(L, all);
    var ready = list.some(function (x) { return x.res && x.res.ok; });
    if (pl.hints && ready) {
      out.hints = L.pages.length + 1;
      sections.push({ page: out.hints, title: 'Hints' });
      hintsSection(L, list);
    }
    if (ready) {
      out.solutions = L.pages.length + 1;
      sections.push({ page: out.solutions, title: 'Solutions' });
      solutions(L, list);
    }
    sections.push({ page: L.pages.length + 1, title: 'You Made It' });
    closingPage(L);
    folios(L);
    return { W: L.W, H: L.H, pages: L.pages, m: L.m, S: L.S, refs: out, front: front, sections: sections };
  }

  function refsKey(r) { return JSON.stringify(r || {}); }

  /*
   * The whole book. opts.draft: placeholders for missing content (the preview).
   * The inside margin grows with the page count, and forward page numbers come from the last
   * pass, so the layout runs again until both settle.
   */
  function layoutBook(project, opts) {
    opts = opts || {};
    var guess = 150, refs = {}, book = null;
    for (var i = 0; i < 6; i++) {
      book = pass(project, guess, !!opts.draft, refs);
      var same = KDP.minGutter(book.pages.length) === KDP.minGutter(guess) && refsKey(book.refs) === refsKey(refs);
      guess = book.pages.length;
      refs = book.refs;
      if (same) break;
    }
    book.pageCount = book.pages.length;
    return book;
  }

  CX.layout = { PRINT: PRINT, layoutBook: layoutBook, wrap: wrap, wrapUnits: wrapUnits, fit: fit, sizes: sizes, fitTile: fitTile, fitsTile: fitsTile, tileLetters: tileLetters, rrectPts: rrectPts };
})(typeof window !== 'undefined' ? window : globalThis);
