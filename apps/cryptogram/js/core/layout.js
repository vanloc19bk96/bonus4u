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
 * no text is smaller than its text size (S.min) unless a sentence is too long for a page at that
 * size; the checklist then says so.
 *
 * A puzzle is rows of cells: a writing line with room above it for the solver's letter, and the
 * code letter (or number) under it. Words never break across rows (only after a hyphen or dash).
 * A page holds up to the chosen number of puzzles, as many as fit; a sentence too long to share a
 * page gets a page of its own. Book order: title, copyright, how to solve with a worked example,
 * the puzzle log, the puzzles (a divider before each level in a mixed book), hints, solutions and
 * the closing note. Page numbers that point forward come from the previous pass. A book can have a
 * heading: one line (two when it is long) at the top or the bottom of every puzzle page.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var KDP = CX.kdp, P = CX.plan, E = CX.engine;
  var PT = 72;
  var F = null;

  var PRINT = {
    regular: { base: 12, label: 'Regular (12 pt text)' },
    large: { base: 14, label: 'Easy to read (14 pt text)' },
    xl: { base: 16, label: 'Large print (16 pt text)' }
  };
  var MIN_CHARS = 60;     // a puzzle space smaller than this many characters is no use

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

  // The largest size (down to min) at which str fits in maxLines lines of maxW, the lines balanced.
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

  // Four little code cells in four grays between two rules: the ornament of the book.
  function ornament(pg, cx, y, half) {
    var s = Math.min(11, half / 4), gap = s * 0.5, w = 4 * s + 3 * gap, x = cx - w / 2;
    [0.18, 0.36, 0.56, 0.8].forEach(function (ink, i) {
      pg.poly(rrectPts(x + i * (s + gap), y - s * 0.75, s, s * 0.9, s * 0.2), ink);
      pg.line(x + i * (s + gap), y + s * 0.5, x + i * (s + gap) + s, y + s * 0.5, 0.75, ink);
    });
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

  // A dashed box that says what goes here (the preview only).
  function placeholder(pg, x, y, w, h, title, note, S) {
    pg.box(x, y, w, h, 0.9, 0.35, [5, 4]);
    var lines = wrap(note, S.small * 1.15, 'sans', w * 0.8), ty = y + h / 2 - (S.b * 1.2 + lines.length * S.small * 1.5) / 2 + S.b * 0.7;
    pg.text(title, x + w / 2, ty, S.b * 0.95, 'sansBold', { align: 'center', ink: 0.55 });
    lines.forEach(function (l, i) { pg.text(l, x + w / 2, ty + S.b * 1.2 + i * S.small * 1.5, S.small * 1.15, 'sans', { align: 'center', ink: 0.55 }); });
  }
  Layout.prototype.placeholder = function (title, note, h) {
    var S = this.S;
    this.need(h);
    placeholder(this.pg, this.pg.x0, this.y + S.b * 0.4, this.pg.w, h - S.b * 0.8, title, note, S);
    this.y += h;
  };

  // ---------- the code cells ----------
  // The size of the code letters: the text size of the book. Regular print with three or four
  // puzzles a page uses a little smaller letters (11 and 10 pt), as printed puzzle books do.
  function codeSize(S, per) { return S.large ? S.b : per >= 4 ? 10 : per === 3 ? 11 : S.b; }
  // The smallest a sentence may shrink to when it is too long for a page at the text size.
  function floorSize(S) { return S.large ? Math.max(KDP.MIN_FONT_PT + 2, S.min * 0.75) : 9; }

  /*
   * Cells at code size cs: cw (a letter cell's width), ws (the gap between words), wz (the room
   * to write in above the line), cy (the code letter's baseline below the row top), rowH.
   */
  // min: the smallest a code number may be (large print keeps it at the text size).
  function geom(code, cs, min) {
    fonts();
    var num = code === 'numbers', ns = num ? Math.max(cs * 0.8, Math.min(cs, min || 0)) : cs;
    var cw = num ? Math.max(wid('26', ns, 'sansBold') + cs * 0.45, cs * 1.15, 15) : Math.max(wid('W', cs, 'sansBold') + cs * 0.14, 14.5);
    var wz = Math.max(cs * 1.4, 17), cap = F.sansBold.capHeight;
    return { cs: cs, ns: ns, cw: cw, ws: Math.max(cw * 0.6, 7), wz: wz, cy: wz + cs * 0.3 + cap * ns, rowH: wz + cs * 0.3 + cap * ns + cs * 0.72, num: num };
  }
  function cellW(c, g) { return c.k === 'L' ? g.cw : Math.max(wid(c.ch, g.cs, 'sansBold') + g.cs * 0.16, g.cs * 0.34); }
  function unitW(u, g) { return u.cells.reduce(function (s, c) { return s + cellW(c, g); }, 0); }

  // Units into rows no wider than w: [[unit...]...], or null when one unit is wider than a row.
  function rowsOf(units, g, w) {
    var rows = [], cur = [], cw = 0;
    for (var i = 0; i < units.length; i++) {
      var u = units[i], uw = unitW(u, g);
      if (uw > w + 0.01) return null;
      var add = (cur.length && !u.glue ? g.ws : 0) + uw;
      if (cur.length && cw + add > w + 0.01) { rows.push(cur); cur = [u]; cw = uw; continue; }
      cur.push(u); cw += cur.length > 1 ? add : uw;
    }
    if (cur.length) rows.push(cur);
    return rows;
  }
  function rowW(row, g) { return row.reduce(function (s, u, i) { return s + (i && !u.glue ? g.ws : 0) + unitW(u, g); }, 0); }

  /*
   * One row of cells, its top at y. given: { plain letter: true } printed on the line for the solver;
   * key: plain letter -> code. align 'right' puts the row against the right edge (the name).
   */
  function drawRow(pg, row, x, y, w, g, key, given, align) {
    var cx = align === 'right' ? x + w - rowW(row, g) : x, lw = 0.75, pad = Math.max(1.2, g.cw * 0.09);
    row.forEach(function (u, i) {
      if (i && !u.glue) cx += g.ws;
      u.cells.forEach(function (c) {
        var cw = cellW(c, g);
        if (c.k === 'L') {
          pg.line(cx + pad, y + g.wz, cx + cw - pad, y + g.wz, lw);
          var code = String(key[c.ch]);
          pg.text(code, cx + cw / 2, y + g.cy, g.ns, 'sansBold', { align: 'center' });
          if (given[c.ch]) pg.text(c.ch, cx + cw / 2, y + g.wz - Math.max(2.5, g.cs * 0.22), g.cs, 'sans', { align: 'center', ink: 0.85 });
        } else {
          pg.text(c.ch, cx + cw / 2, y + g.cy, g.cs, 'sansBold', { align: 'center' });
        }
        cx += cw;
      });
    });
  }

  // ---------- the letter tracker: every code with a box for the letter it stands for ----------
  function trackerPlan(S, code, w) {
    var ls = Math.max(S.min, 8, S.b * 0.72), num = code === 'numbers';
    var tw = Math.max(wid(num ? '26' : 'W', ls, 'sansBold') + ls * 0.28, num ? 17 : 14);
    var fitN = Math.max(1, Math.floor(w / tw)), rows = Math.ceil(26 / Math.min(26, fitN)), per = Math.ceil(26 / rows);
    var cw = w / per, bh = Math.max(14, Math.min(cw - 3, ls * 1.35)), rowH = ls * 1.15 + bh + S.b * 0.3;
    return { ls: ls, rows: rows, per: per, cw: cw, bh: bh, rowH: rowH, h: S.b * 0.45 + rows * rowH };
  }
  function drawTracker(pg, t, x, y, res) {
    var inv = E.invert(res.key), given = {};
    res.given.forEach(function (c) { given[String(res.key[c])] = c; });
    var codes = res.code === 'numbers' ? CX.util.range(1, 26).map(String) : E.ABC.split('');
    y += t.ls * 0.2;
    codes.forEach(function (c, i) {
      var r = Math.floor(i / t.per), k = i % t.per, cx = x + k * t.cw + t.cw / 2, top = y + r * t.rowH;
      pg.text(c, cx, top + F.sansBold.capHeight * t.ls + 1, t.ls, 'sansBold', { align: 'center' });
      var bw = Math.min(t.cw - 3, t.bh), by = top + t.ls * 1.15;
      pg.box(cx - bw / 2, by, bw, t.bh, 0.75, 0.6);
      if (given[c] && inv[c]) pg.text(given[c], cx, by + t.bh / 2 + F.sans.capHeight * t.ls / 2, t.ls, 'sans', { align: 'center', ink: 0.85 });
    });
  }

  // ---------- one puzzle block ----------
  // The header: PUZZLE n, the stars and the page references on one line, or the references on a
  // second line when the page is too narrow for all of it (small pages in large print).
  function headSize(S) { return Math.max(8, S.small, S.b * 0.8); }
  function headOneLine(S, w) {
    var hs = headSize(S) * 1.15, left = wid('PUZZLE 000', hs, 'sansBold', 1.8) + hs * 7.6;
    return left + S.b + wid('Hint: page 000   ·   Solution: page 000', S.small, 'sans') <= w;
  }
  function headH(S, w) { return headSize(S) * 1.2 + S.b * 0.6 + (w && !headOneLine(S, w) ? S.small * 1.45 : 0); }
  function bySize(S, g) { return Math.max(S.min, Math.min(g.cs, S.b) * 0.95); }

  /*
   * The block of one puzzle at code size cs in width w: { g, rows, byRows, byLines, tracker, h } or
   * null when a word is wider than a row.
   */
  function blockPlan(project, S, res, cs, w) {
    var g = geom(res.code, cs, S.large ? S.min : 0), mode = CX.puzzles.byMode(project);
    var rows = rowsOf(E.units(res.text), g, w);
    if (!rows) return null;
    var byRows = [], byLines = [], inline = false;
    if (res.by && mode === 'code') {
      byRows = rowsOf(E.units('— ' + res.by), g, w);
      if (!byRows) return null;
      // the name shares the last row when it fits there, against the right edge
      inline = byRows.length === 1 && rowW(rows[rows.length - 1], g) + g.ws * 2.5 + rowW(byRows[0], g) <= w;
    }
    if (res.by && mode === 'plain') byLines = wrap('— ' + res.by, bySize(S, g), 'serif', w * 0.9);
    var tr = project.plan.tracker ? trackerPlan(S, res.code, w) : null;
    var h = headH(S, w) + (rows.length + (inline ? 0 : byRows.length)) * g.rowH + byLines.length * bySize(S, g) * 1.3 + (byLines.length ? S.b * 0.2 : 0) + (tr ? tr.h : 0);
    return { g: g, rows: rows, byRows: byRows, inline: inline, byLines: byLines, tracker: tr, h: h, cs: cs };
  }

  // The plan at the text size, or the biggest smaller size that fits height h (null: none fits).
  function planIn(project, S, res, w, h, shrink) {
    var base = codeSize(S, perPage(project)), bp = blockPlan(project, S, res, base, w);
    if (bp && bp.h <= h) return bp;
    if (!shrink) return null;
    for (var cs = base - 0.5; cs >= floorSize(S) - 0.001; cs -= 0.5) {
      bp = blockPlan(project, S, res, cs, w);
      if (bp && bp.h <= h) return bp;
    }
    return null;
  }

  function drawBlock(L, pg, x, top, w, item) {
    var S = L.S, res = item.res, pz = item.pz, bp = item.bp, g = bp.g, hs = Math.max(8, S.small, S.b * 0.8), y = top + hs;
    var nw = pg.text('PUZZLE ' + pz.no, x, y, hs * 1.15, 'sansBold', { ls: 1.8 });
    if (L.project.plan.stars) stars(pg, x + nw + hs * 1.15 * 4.1, y, P.level(res.level).stars, hs * 1.15);
    var refs = [], sol = L.refs.sol && L.refs.sol[pz.id], hint = L.refs.hint && L.refs.hint[pz.id];
    if (hint) refs.push('Hint: page ' + hint);
    refs.push(sol ? 'Solution: page ' + sol : 'Solution at the back');
    if (headOneLine(S, w)) pg.text(refs.join('   ·   '), x + w, y, S.small, 'sans', { align: 'right', ink: 0.8 });
    else pg.text(refs.join('   ·   '), x, y + S.small * 1.45, S.small, 'sans', { ink: 0.8 });
    y = top + headH(S, w);
    var given = {};
    res.given.forEach(function (c) { given[c] = true; });
    bp.rows.forEach(function (row) { drawRow(pg, row, x, y, w, g, res.key, given); y += g.rowH; });
    if (bp.inline) drawRow(pg, bp.byRows[0], x, y - g.rowH, w, g, res.key, given, 'right');
    else bp.byRows.forEach(function (row) { drawRow(pg, row, x, y, w, g, res.key, given, 'right'); y += g.rowH; });
    if (bp.byLines.length) {
      var bs = bySize(S, g);
      y += S.b * 0.2;
      bp.byLines.forEach(function (l) { y += bs * 1.3; pg.text(l, x + w, y - bs * 0.3, bs, 'serif', { align: 'right' }); });
    }
    if (bp.tracker) { drawTracker(pg, bp.tracker, x, y + S.b * 0.45, res); y += bp.tracker.h; }
    if (g.cs < S.min - 0.01) pg.meta.small = Math.min(pg.meta.small || 99, g.cs);
    pg.meta.cell = Math.min(pg.meta.cell || 99, g.cs);
  }

  // ---------- the heading of the puzzle pages ----------
  /*
   * The heading in width w: { lines, size, h (the room it takes, with the rule and the gap to the
   * puzzles) }, or null when the book has none. It is the text size of the book, smaller only when
   * it would need more than two lines.
   */
  function headingPlan(project, S, w) {
    var str = txt(P.heading(project), 'serifBold');
    if (!str.trim()) return null;
    var max = S.large ? S.b : Math.max(10, S.b * 0.9), min = S.large ? S.min : 8.5;
    var t = fit(str, 'serifBold', w, max, min, 2), size = t.size;
    // one word wider than the page: smaller still, so nothing leaves the margins
    var widest = Math.max.apply(null, t.lines.map(function (l) { return wid(l, size, 'serifBold'); }));
    if (widest > w) size = Math.max(KDP.MIN_FONT_PT, Math.floor(size * w / widest * 10) / 10);
    return { lines: t.lines, size: size, h: t.lines.length * size * 1.25 + S.b * 1.3 };
  }
  function drawHeading(pg, hp, bottom) {
    var lead = hp.size * 1.25, n = hp.lines.length;
    var y = bottom ? pg.cb - hp.size * 0.25 - (n - 1) * lead : pg.y0 + hp.size * 0.8;
    var rule = bottom ? pg.cb - n * lead - hp.size * 0.15 : y + (n - 1) * lead + hp.size * 0.5;
    hp.lines.forEach(function (l, i) { pg.text(l, pg.cx, y + i * lead, hp.size, 'serifBold', { align: 'center' }); });
    pg.line(pg.x0, rule, pg.x1, rule, 0.75, 0.55);
  }

  // ---------- the room a puzzle gets ----------
  function gapH(S) { return S.b * 1.7; }

  // Does a short sentence (the shortest the prompts ask for, and a little more) fit height h?
  function roomFor(project, S, w, h) {
    var mode = CX.puzzles.byMode(project);
    var res = { text: FILLER.slice(0, 47), by: mode === 'code' ? 'RALPH WALDO EMERSON' : mode === 'plain' ? 'Ralph Waldo Emerson' : '', code: project.plan.code, key: {}, given: [] };
    for (var cs = S.b; cs >= floorSize(S) - 0.001; cs -= 0.5) {
      var bp = blockPlan(project, S, res, cs, w);
      if (bp && bp.h <= h) return true;
    }
    return false;
  }

  /*
   * Width and height of the puzzle area on the narrowest page this book can have. head: the room
   * the heading takes. A heading that would leave a short sentence no room (a pocket page in large
   * print with the tracker) is left off: head is 0, and the checklist says so.
   */
  var areaMemo = { key: '', a: null };
  function area(project) {
    var b = project.book, pl = project.plan, key = [b.trim, b.paper, b.print, P.heading(project), pl.tracker, pl.code, CX.puzzles.byMode(project)].join('|');
    if (areaMemo.key === key) return areaMemo.a;
    var t = KDP.trim(b.trim), m = KDP.margins(KDP.maxPages(t.id, b.paper)), S = printSizes(project);
    var mm = KDP.margins(24), foot = S.folio + 12, w = (t.w - m.inside - m.outside) * PT, h = (t.h - mm.top - mm.bottom) * PT - foot;
    var hp = headingPlan(project, S, w);
    if (hp && !roomFor(project, S, w, h - hp.h)) hp = null;
    areaMemo = { key: key, a: { w: w, h: h - (hp ? hp.h : 0), S: S, head: hp ? Math.round(hp.h * 10) / 10 : 0 } };
    return areaMemo.a;
  }

  // The room the heading takes on a puzzle page, in points (0: no heading, or no room for one).
  function headingRoom(project) { return area(project).head; }

  // A stand-in sentence for measuring: everyday English word lengths.
  var FILLER = 'THE BEST THING ABOUT A GOOD BOOK IS THAT IT CAN TAKE YOU FAR AWAY WHILE YOU SIT STILL IN YOUR FAVORITE CHAIR, AND WHEN YOU COME BACK THE WORLD LOOKS A LITTLE KINDER THAN BEFORE. EVERY DAY BRINGS SOMETHING NEW TO LEARN AND SOMEONE DEAR TO THANK FOR IT, SO KEEP YOUR HEART OPEN AND YOUR PENCIL SHARP, BECAUSE THE NEXT GREAT IDEA MAY BE WAITING ON THE VERY NEXT PAGE OF THE STORY THAT YOU ARE WRITING WITH YOUR OWN LIFE. '.repeat(3);

  /*
   * How many characters (spaces included) of everyday text fit one puzzle space when per puzzles
   * share a page, at the text size, with the name and the tracker. Cached by the settings it reads.
   */
  var capCache = {};
  function capacity(project, per) {
    var a = area(project), pl = project.plan, mode = CX.puzzles.byMode(project);
    var key = [project.book.trim, project.book.paper, project.book.print, pl.tracker, pl.code, mode, per, Math.round(a.h)].join('|');
    if (capCache[key] != null) return capCache[key];
    var slot = (a.h - (per - 1) * gapH(a.S)) / per, words = FILLER.trim().split(' '), lo = 1, hi = words.length;
    var by = mode === 'code' ? 'RALPH WALDO EMERSON' : mode === 'plain' ? 'Ralph Waldo Emerson' : '';
    function fits(n) {
      var res = { text: words.slice(0, n).join(' '), by: by, code: pl.code, key: {}, given: [] };
      var bp = blockPlan(project, a.S, res, codeSize(a.S, per), a.w);
      return !!bp && bp.h <= slot;
    }
    if (!fits(1)) { capCache[key] = 0; return 0; }
    while (lo < hi) { var mid = Math.ceil((lo + hi) / 2); if (fits(mid)) lo = mid; else hi = mid - 1; }
    capCache[key] = words.slice(0, lo).join(' ').length;
    return capCache[key];
  }

  // Puzzles a page: the chosen number, or fewer when the spaces would be too small to use.
  function perPage(project) {
    for (var n = project.plan.perPage; n > 1; n--) if (capacity(project, n) >= MIN_CHARS) return n;
    return 1;
  }

  // Does a puzzle fit a page of its own (shrunk if it must)?
  function fitsPage(project, res) {
    var a = area(project);
    return !!planIn(project, a.S, res, a.w, a.h, true);
  }

  // ---------- the puzzle pages ----------
  function puzzlePages(L, list) {
    var p = L.project, S = L.S, per = perPage(p), mixed = P.levelsIn(p).length > 1, prev = '', i = 0;
    var bottom = p.plan.headingAt === 'bottom', headed = headingRoom(p) > 0;
    while (i < list.length) {
      var lvl = P.levelOf(p, list[i].pz);
      if (mixed && lvl !== prev) levelPage(L, lvl);
      prev = lvl;
      var pg = L.page('puzzle', 'Puzzle ' + list[i].pz.no), w = pg.w, hp = headed ? headingPlan(p, S, w) : null;
      var avail = pg.cb - pg.y0 - (hp ? hp.h : 0), slot = (avail - (per - 1) * gapH(S)) / per;
      if (hp) drawHeading(pg, hp, bottom);
      var group = [], used = 0;
      while (group.length < per && i < list.length && P.levelOf(p, list[i].pz) === lvl) {
        var x = list[i], ok = x.res && x.res.ok, bp = ok ? planIn(p, S, x.res, w, avail, false) : null;
        if (ok && !bp) {
          // too long for a page at the text size: a page of its own, the letters a little smaller
          if (!group.length) {
            bp = planIn(p, S, x.res, w, avail, true);
            group.push({ pz: x.pz, res: x.res, bp: bp, h: bp ? bp.h : avail });
            used = bp ? bp.h : avail;
            i++;
          }
          break;
        }
        var need = bp ? bp.h : slot, add = (group.length ? gapH(S) : 0) + need;
        if (used + add <= avail + 0.01) { group.push({ pz: x.pz, res: x.res, bp: bp, h: need }); used += add; i++; continue; }
        if (!group.length) { group.push({ pz: x.pz, res: x.res, bp: bp, h: Math.min(need, avail) }); used = Math.min(need, avail); i++; }
        break;
      }
      if (group.length > 1) pg.label = 'Puzzles ' + group[0].pz.no + '–' + group[group.length - 1].pz.no;
      L.out.pages = L.out.pages || {};
      var extra = Math.max(0, (avail - used) / group.length), y = pg.y0 + (hp && !bottom ? hp.h : 0);
      group.forEach(function (it, k) {
        L.out.pages[it.pz.id] = pg.num;
        if (k) {
          pg.line(pg.x0, y + gapH(S) / 2, pg.x1, y + gapH(S) / 2, 0.75, 0.35, [2, 3]);
          y += gapH(S);
        }
        if (it.bp) drawBlock(L, pg, pg.x0, y, w, it);
        else if (L.draft) {
          var why = it.res && it.res.problems.length ? 'Not ready: ' + it.res.problems[0] + '. Until it is fixed, the PDF leaves this puzzle out and numbers the rest, so no page is blank.' : 'Copy the prompt in step 3, paste it into ChatGPT, then paste the reply back. The app puts the sentence in code.';
          placeholder(pg, pg.x0, y + S.b * 0.3, w, Math.max(S.b * 5, it.h + extra - S.b * 0.6), 'Puzzle ' + it.pz.no + ' goes here', why, S);
        }
        y += it.h + extra;
      });
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
    wrap(levelHelp(L.project, id), S.b, 'serif', pg.w * 0.82).forEach(function (l) { y += S.lead; pg.text(l, pg.cx, y, S.b, 'serif', { align: 'center' }); });
    ornament(pg, pg.cx, y + S.b * 2.6, Math.min(90, pg.w * 0.3));
  }

  // What a level means in this book (kids get one letter more).
  function levelHelp(project, id) {
    var n = P.givenCount(project, id), lv = P.level(id), words = ['no', 'one', 'two', 'three', 'four'];
    if (id === 'hard') return lv.help;
    return (id === 'easy' ? 'Short sentences' : 'Longer sentences') + ', with ' + words[n] + ' letter' + (n === 1 ? '' : 's') + ' given to start you off.';
  }

  // ---------- front matter ----------
  function titlePage(L) {
    var p = L.project, S = L.S;
    var pg = L.page('title', 'Title page');
    pg.folio = false;
    var title = P.bookTitle(p, L.draft), sub = P.bookSubtitle(p, L.draft);
    var y = pg.y0 + pg.H * 0.08;
    var t = fit(title, 'serifBold', pg.w * 0.9, Math.min(34, pg.w / 8.5), S.b * 1.3, 4);
    t.lines.forEach(function (l) { y += t.size * 1.1; pg.text(l, pg.cx, y, t.size, 'serifBold', { align: 'center' }); });
    if (sub) {
      y += S.b * 0.7;
      var ss = Math.max(S.b * 0.88, 11, S.min);
      fit(sub, 'serif', pg.w * 0.84, ss, ss, 6).lines.forEach(function (l) { y += ss * 1.38; pg.text(l, pg.cx, y, ss, 'serif', { align: 'center' }); });
    }
    // a little coded word: four cells, one of them solved
    var cs = Math.min(26, pg.w / 12), g = geom('letters', cs), word = 'CODE', key = { C: 'X', O: 'R', D: 'M', E: 'Q' };
    var by = Math.max(y + S.b * 3, pg.y0 + pg.H * 0.42), units = [{ cells: word.split('').map(function (c) { return { k: 'L', ch: c }; }) }];
    if (by + g.rowH < pg.cb - S.b * 4) drawRow(pg, units, pg.cx - unitW(units[0], g) / 2, by, 0, g, key, { E: true });
    else ornament(pg, pg.cx, y + S.b * 3, 70);
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

  // The worked example of the how-to page: the first one whose sentence is not in the book.
  function example(project) {
    var used = {};
    Object.keys(project.puzzles).forEach(function (k) { used[E.sameKey(project.puzzles[k].text)] = 1; });
    var ex = P.EXAMPLES.filter(function (e) { return !used[E.sameKey(e.text)]; })[0] || P.EXAMPLES[0];
    var res = { text: ex.text, by: ex.by, code: project.plan.code, level: 'easy' };
    res.coded = CX.puzzles.codedText(project, ex.text, ex.by);
    res.key = E.makeKey('how-to-solve|' + project.plan.code, project.plan.code);
    res.given = E.given(res.coded, 2);
    return res;
  }

  function howPage(L) {
    var p = L.project, S = L.S, pl = p.plan, refs = L.refs, kid = P.audience(pl.audience).kid, num = pl.code === 'numbers';
    L.page('how', 'How to Solve', 'How to solve');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Welcome to Cryptograms');
    var welcome = p.ai.welcome.length ? p.ai.welcome : ['Every puzzle in this book is a sentence written in a secret code. Crack the code, and the hidden words appear one letter at a time.'];
    welcome.forEach(function (t, i) { if (i) L.y += S.b * 0.5; L.para(P.countText(p, t, L.draft), 'serif', S.b, S.lead); });
    L.label('How to solve');
    var steps = [
      num ? 'Every letter of the sentence has been swapped for a number from 1 to 26. The same number always stands for the same letter, all through one puzzle.'
        : 'Every letter of the sentence has been swapped for another letter. The same code letter always stands for the same real letter, all through one puzzle.',
      'Each puzzle has its own code' + (num ? '.' : ', and no letter ever stands for itself.'),
      'Write each letter you find on the line above its code, everywhere that code appears.'
    ];
    if (kid) steps.push('Start with short words: a word of one letter is A or I, and THE and AND are the most used words of three letters.');
    else {
      steps.push('Start with short words: a word of one letter is A or I; THE and AND are the most common three-letter words.');
      steps.push('Look at apostrophes: one letter after them is often S, T or D (IT\'S, DON\'T, I\'D); two letters are often LL, RE or VE.');
      steps.push('E, T, A, O, I and N are the most common letters in English.');
    }
    if (pl.tracker) steps.push('Under each puzzle, the letter tracker lists every code. Write the letter you find in its box, so you never lose track.');
    L.bullets(steps);
    // the worked example: the coded sentence with two letters given, then the answer
    var ex = example(p), w = L.pg.w * 0.94, bp = blockPlan(Object.assign({}, p, { plan: Object.assign({}, pl, { tracker: false }) }), S, ex, codeSize(S, 1), w);
    if (bp) {
      var exH = (bp.rows.length + (bp.inline ? 0 : bp.byRows.length)) * bp.g.rowH + bp.byLines.length * bySize(S, bp.g) * 1.3;
      L.need(S.b * 2.6 + exH + S.b * 4);
      L.label('An example');
      L.y += S.b * 0.4;
      var given = {};
      ex.given.forEach(function (c) { given[c] = true; });
      var x = L.pg.x0 + (L.pg.w - w) / 2;
      bp.rows.forEach(function (row) { drawRow(L.pg, row, x, L.y, w, bp.g, ex.key, given); L.y += bp.g.rowH; });
      if (bp.inline) drawRow(L.pg, bp.byRows[0], x, L.y - bp.g.rowH, w, bp.g, ex.key, given, 'right');
      else bp.byRows.forEach(function (row) { drawRow(L.pg, row, x, L.y, w, bp.g, ex.key, given, 'right'); L.y += bp.g.rowH; });
      bp.byLines.forEach(function (l) { var bs = bySize(S, bp.g); L.y += bs * 1.3; L.pg.text(l, x + w, L.y - bs * 0.3, bs, 'serif', { align: 'right' }); });
      var gv = ex.given.map(function (c) { return ex.key[c] + ' = ' + c; }).join(' and ');
      L.y += S.b * 0.3;
      L.para('The letters ' + gv + ' are given. Answer: ' + ex.text + (ex.by ? ' — ' + ex.by : ''), 'serif', S.b, S.lead);
    }
    var more = [];
    if (pl.hints && refs.hints) more.push('Stuck? The hints start on page ' + refs.hints + ': each gives one more letter of a puzzle.');
    if (refs.solutions) more.push('All the solutions start on page ' + refs.solutions + '.');
    more.forEach(function (t) { L.y += S.b * 0.4; L.para(t, 'serif', S.b, S.lead); });
    var lvls = P.levelsIn(p);
    if (lvls.length > 1) {
      L.label(lvls.length === 2 ? 'Two levels' : 'Three levels');
      L.bullets(lvls.map(function (id) { return P.level(id).label + ': ' + levelHelp(p, id); }));
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

  // ---------- hints: one more letter for each puzzle ----------
  function hintsSection(L, list) {
    var S = L.S, ready = list.filter(function (x) { return x.res && x.res.ok && x.res.hint; });
    if (!ready.length) return;
    L.page('hints', 'Hints', 'Hints');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Hints', 'One more letter for each puzzle: the code on the left stands for the letter on the right.', 'left');
    var size = Math.max(9, S.b * 0.86, S.min), lead = size * 1.7, nw = wid('000', size, 'sansBold') + size * 0.8;
    var ew = nw + wid('26 = W', size, 'serif') + size * 2.2, cols = Math.max(1, Math.floor(L.pg.w / ew)), cw = L.pg.w / cols;
    for (var i = 0; i < ready.length; i += cols) {
      L.need(lead);
      var pg = L.pg;
      for (var c = 0; c < cols && i + c < ready.length; c++) {
        var x = ready[i + c], x0 = pg.x0 + c * cw;
        L.out.hint[x.pz.id] = pg.num;
        pg.text(String(x.pz.no), x0 + nw - size * 0.8, L.y + lead * 0.7, size, 'sansBold', { align: 'right' });
        pg.text(x.res.key[x.res.hint] + ' = ' + x.res.hint, x0 + nw, L.y + lead * 0.7, size, 'serif');
      }
      L.y += lead;
    }
  }

  // ---------- solutions: the sentences, flowing down one or two columns ----------
  function solutions(L, list) {
    var p = L.project, S = L.S, ready = list.filter(function (x) { return x.res && x.res.ok; });
    if (!ready.length) return;
    L.page('solutions', 'Solutions', 'Solutions');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Solutions');
    var cols = L.pg.w >= 380 ? 2 : 1, gapX = S.b * 1.4, cw = (L.pg.w - gapX * (cols - 1)) / cols;
    var size = Math.max(S.min, Math.min(S.b * 0.85, 11)), lead = size * 1.3, nw = wid('000', size, 'sansBold') + size * 0.6, col = 0, top = L.y;
    ready.forEach(function (x) {
      var lines = wrap(x.res.text + (x.res.by ? ' — ' + x.res.by : ''), size, 'serif', cw - nw), h = lines.length * lead + size * 0.75;
      if (L.y + h > L.pg.cb) {
        if (++col >= cols) { L.page('solutions', 'Solutions', 'Solutions'); col = 0; top = L.y; }
        L.y = top;
      }
      var pg = L.pg, x0 = pg.x0 + col * (cw + gapX);
      L.out.sol[x.pz.id] = pg.num;
      pg.text(String(x.pz.no), x0 + nw - size * 0.6, L.y + lead * 0.78, size, 'sansBold', { align: 'right' });
      lines.forEach(function (l, k) { pg.text(l, x0 + nw, L.y + lead * (k + 0.78), size, 'serif'); });
      L.y += h;
    });
    L.y = L.pg.cb;
  }

  function closingPage(L) {
    var p = L.project, S = L.S;
    L.page('closing', 'You Cracked It', 'You cracked it');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'You Cracked the Code!');
    if (p.ai.closing.length) p.ai.closing.forEach(function (t, i) { if (i) L.y += S.b * 0.5; L.para(P.countText(p, t, L.draft), 'serif', S.b, S.lead); });
    else if (L.draft) L.placeholder('Your closing note', 'It appears here after you paste the reply to the last prompt in step 3.', S.b * 7);
    else L.para('Every code cracked and every sentence found. Thank you for spending your puzzle time with this book. We hope you had as much fun solving these as we had making them.', 'serif', S.b, S.lead);
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
    sections.push({ page: L.pages.length + 1, title: 'How to Solve' });
    howPage(L);
    if (pl.log) { sections.push({ page: L.pages.length + 1, title: 'Puzzle Log' }); logPage(L, all); }
    sections.push({ page: L.pages.length + 1, title: 'The Puzzles' });
    puzzlePages(L, list);
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
    sections.push({ page: L.pages.length + 1, title: 'You Cracked It' });
    closingPage(L);
    folios(L);
    return { W: L.W, H: L.H, pages: L.pages, m: L.m, S: L.S, refs: out, front: front, sections: sections, perPage: perPage(project) };
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

  CX.layout = {
    PRINT: PRINT, MIN_CHARS: MIN_CHARS, layoutBook: layoutBook, wrap: wrap, fit: fit, sizes: sizes, printSizes: printSizes, rrectPts: rrectPts,
    capacity: capacity, perPage: perPage, fitsPage: fitsPage, geom: geom, rowsOf: rowsOf, blockPlan: blockPlan, headingPlan: headingPlan, headingRoom: headingRoom
  };
})(typeof window !== 'undefined' ? window : globalThis);
