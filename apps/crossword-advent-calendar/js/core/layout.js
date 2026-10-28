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
 * ink is the gray level (1 = black, default). Nothing is lighter than 10% gray, no line is
 * thinner than 0.75 pt and no text is smaller than 7 pt: the KDP rules.
 *
 * Book order (the bestseller's): title, copyright, how this book works, the list of days, the
 * letter strip, then for every week a two-page gate (how the week runs | the candles) and one
 * spread a day (grid on the left page, clues on the right), the Christmas Eve page, the Twelve
 * Days bonus, the solutions and the hidden sentence. Every gate and day starts on a left-hand
 * page; when one would not, a Notes page fills the gap. Page numbers that point forward (the
 * strip, the days, the solutions) come from the previous layout pass.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var KDP = CX.kdp, P = CX.plan;
  var PT = 72;
  var F = null;

  var PRINT = {
    regular: { base: 12, label: 'Regular (12 pt clues)' },
    large: { base: 14, label: 'Large print (14 pt clues)' },
    xl: { base: 16, label: 'Extra large (16 pt clues)' }
  };

  var NUMW = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
    'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five'];
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function capWords(s) { return s.split('-').map(cap).join('-'); }

  function r2(v) { return Math.round(v * 100) / 100; }
  function txt(str, font) { return CX.metrics.printable(String(str == null ? '' : str), F[font]); }
  function wid(str, size, font, ls) { return F[font].width(txt(str, font), size, ls || 0); }

  function wrap(str, size, font, maxW) {
    var words = String(str).split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur && wid(t, size, font) > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // The largest size (down to min) at which str fits in maxLines lines of maxW.
  function fit(str, font, maxW, maxSize, minSize, maxLines) {
    for (var s = maxSize; s > minSize; s -= 0.5) {
      var l = wrap(str, s, font, maxW);
      if (l.length <= maxLines && l.every(function (x) { return wid(x, s, font) <= maxW; })) return { size: s, lines: l };
    }
    return { size: minSize, lines: wrap(str, minSize, font, maxW) };
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
  Page.prototype.fill = function (x, y, w, h, ink) {
    var it = { t: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), mode: 'fill' };
    if (ink != null && ink !== 1) it.ink = ink;
    this.items.push(it);
  };
  Page.prototype.ring = function (cx, cy, r, lw, ink) {
    var it = { t: 'ellipse', cx: r2(cx), cy: r2(cy), rx: r2(r), ry: r2(r), mode: 'stroke', lw: Math.max(KDP.MIN_LINE_PT, lw || 1) };
    if (ink != null && ink !== 1) it.ink = ink;
    this.items.push(it);
  };
  Page.prototype.dot = function (cx, cy, r, ink) {
    var it = { t: 'ellipse', cx: r2(cx), cy: r2(cy), rx: r2(r), ry: r2(r), mode: 'fill' };
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
  Page.prototype.rbox = function (x, y, w, h, r, lw, ink) { this.path(rrectPts(x, y, w, h, r), lw, ink, true); };

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
  function leafPts(cx, cy, len, w, angle) {
    var pts = [], a = angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    for (var i = 0; i <= 18; i++) {
      var t = i / 18 * Math.PI * 2, x = Math.cos(t) * len / 2;
      // a holly leaf: a pointed oval with three little points on each side
      var y = Math.sin(t) * w / 2 * (1 - 0.3 * Math.abs(Math.cos(t))) * (1 + 0.18 * Math.abs(Math.sin(t * 3)));
      pts.push(cx + x * ca - y * sa, cy + x * sa + y * ca);
    }
    return pts;
  }
  function diamond(pg, cx, cy, r, ink) { pg.poly([cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy], ink); }

  // A holly sprig: two leaves and three berries, s wide.
  function holly(pg, cx, cy, s) {
    pg.poly(leafPts(cx - s * 0.24, cy, s * 0.5, s * 0.22, -12), 0.55);
    pg.poly(leafPts(cx + s * 0.24, cy, s * 0.5, s * 0.22, 12), 0.55);
    pg.line(cx - s * 0.46, cy + s * 0.05, cx - s * 0.02, cy - s * 0.02, 0.8, 0.8);
    pg.line(cx + s * 0.46, cy + s * 0.05, cx + s * 0.02, cy - s * 0.02, 0.8, 0.8);
    [[-0.07, -0.05], [0.07, -0.05], [0, 0.07]].forEach(function (d) { pg.dot(cx + d[0] * s, cy + d[1] * s, s * 0.065, 1); });
  }
  // A garland: a rule with a holly sprig in the middle.
  function garland(pg, cx, y, half) {
    pg.line(cx - half, y, cx - half * 0.32, y, 0.9, 0.7);
    pg.line(cx + half * 0.32, y, cx + half, y, 0.9, 0.7);
    holly(pg, cx, y, Math.min(48, half * 0.5));
  }
  // A small wreath: a ring dressed with leaves.
  function wreath(pg, cx, cy, r) {
    pg.ring(cx, cy, r, 0.9, 0.8);
    for (var i = 0; i < 14; i++) {
      var a = i / 14 * 360, rad = a * Math.PI / 180;
      pg.poly(leafPts(cx + Math.cos(rad) * r, cy + Math.sin(rad) * r, r * 0.42, r * 0.2, a + 60), 0.6);
    }
    pg.dot(cx, cy + r, r * 0.13, 1);
  }
  function stars(pg, x, y, n, size) {
    for (var i = 0; i < 3; i++) {
      var cx = x + size * 0.55 + i * size * 1.2, cy = y - size * 0.36;
      if (i < n) pg.poly(starPts(cx, cy, size * 0.52));
      else pg.path(starPts(cx, cy, size * 0.48), 0.75, 1, true);
    }
    return size * 3.6;
  }
  function candle(pg, cx, base, h, lit) {
    var w = h * 0.24;
    pg.box(cx - w / 2, base - h, w, h, 1.1);
    pg.line(cx, base - h, cx, base - h - h * 0.1, 1, 1);
    if (lit) {
      var fy = base - h - h * 0.1, fh = h * 0.3, pts = [];
      for (var i = 0; i <= 16; i++) {
        var t = i / 16 * Math.PI * 2, s = Math.sin(t), c = Math.cos(t);
        pts.push(cx + s * w * 0.32 * (1 - 0.15 * c), fy - fh * 0.5 + c * fh * 0.5 * (c < 0 ? 1.15 : 0.8));
      }
      pg.poly(pts, 0.75);
    }
  }

  // ---------- the layout state ----------
  function sizes(b) {
    return { b: b, lead: b * 1.36, fact: Math.max(9, b * 0.82), h1: b * 1.85, h2: b * 1.3, small: Math.max(8, b * 0.62), folio: Math.max(8.5, b * 0.68) };
  }

  function Layout(project, pages, draft, refs) {
    var t = KDP.trim(project.book.trim);
    this.project = project;
    this.draft = draft;
    this.refs = refs || {};
    this.out = { days: {} };
    this.W = t.w * PT; this.H = t.h * PT;
    var m = KDP.margins(pages);
    this.m = { inside: m.inside * PT, outside: m.outside * PT, top: m.top * PT, bottom: m.bottom * PT };
    this.S = sizes(PRINT[project.book.print] ? PRINT[project.book.print].base : 14);
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

  // The next page is a left-hand page: a Notes page fills the gap when it would not be.
  Layout.prototype.toLeft = function () {
    if ((this.pages.length + 1) % 2 === 0) return;
    var S = this.S, pg = this.page('notes', 'Notes');
    this.heading('', 'Notes');
    var gap = S.b * 2.1;
    for (var y = this.y + gap * 0.4; y < pg.cb - S.b * 4; y += gap) pg.line(pg.x0, y, pg.x1, y, 0.75, 0.55);
    holly(pg, pg.cx, pg.cb - S.b * 1.6, Math.min(54, pg.w * 0.22));
  };

  // Section title block: small label, big title, optional subtitle, garland.
  Layout.prototype.heading = function (eyebrow, title, sub, align) {
    var S = this.S, pg = this.pg, y = this.y + S.b * 0.4, left = align === 'left';
    var x = left ? pg.x0 : pg.cx, o = { align: left ? null : 'center' };
    if (eyebrow) { y += S.small; pg.text(eyebrow.toUpperCase(), x, y, S.small * 1.05, 'sans', Object.assign({ ls: 2.2 }, o)); y += S.b * 0.9; }
    var t = fit(title, 'serifBold', pg.w * (left ? 1 : 0.92), S.h1, S.b * 1.2, 2);
    t.lines.forEach(function (l) { y += t.size * 1.05; pg.text(l, x, y, t.size, 'serifBold', o); y += t.size * 0.12; });
    if (sub) wrap(sub, S.b, 'serif', pg.w * (left ? 1 : 0.88)).forEach(function (l) { y += S.b * 1.32; pg.text(l, x, y, S.b, 'serif', o); });
    if (left) { y += S.b * 0.7; pg.line(pg.x0, y, pg.x1, y, 0.9); this.y = y + S.b * 0.9; return; }
    y += S.b * 1.2;
    garland(pg, pg.cx, y, Math.min(80, pg.w * 0.26));
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
    var pg = this.pg, y = this.y + S.b * 0.4;
    pg.box(pg.x0, y, pg.w, h - S.b * 0.8, 0.9, 0.35, [5, 4]);
    var ty = y + (h - S.b * 0.8) / 2 - S.b * 0.4;
    pg.text(title, pg.cx, ty, S.b * 0.95, 'sansBold', { align: 'center', ink: 0.55 });
    wrap(note, S.small * 1.15, 'sans', pg.w * 0.8).forEach(function (l, i) {
      pg.text(l, pg.cx, ty + S.b * 1.2 + i * S.small * 1.5, S.small * 1.15, 'sans', { align: 'center', ink: 0.55 });
    });
    this.y += h;
  };

  // A row of numbered letter boxes (12 to a row), filled with letters when given.
  Layout.prototype.strip = function (n, letters) {
    var S = this.S, pg = this.pg, per = Math.min(12, n), gap = Math.max(2, S.b * 0.18);
    var bw = Math.min(S.b * 2.3, (pg.w - gap * (per - 1)) / per), bh = bw * 1.1;
    var rows = Math.ceil(n / per), rowW = per * bw + (per - 1) * gap, x0 = pg.cx - rowW / 2;
    this.need(rows * (bh + gap * 2) + S.b);
    var y = this.y + S.b * 0.4;
    var ns = Math.max(7, bw * 0.26);
    for (var i = 0; i < n; i++) {
      var r = Math.floor(i / per), c = i % per, x = x0 + c * (bw + gap), yy = y + r * (bh + gap * 2);
      pg.rbox(x, yy, bw, bh, Math.min(3, bw * 0.12), 0.9);
      pg.text(String(i + 1), x + bw * 0.1, yy + ns * 1.05, ns, 'sans');
      if (letters) pg.text(letters[i], x + bw / 2, yy + bh * 0.78, bw * 0.55, 'sansBold', { align: 'center' });
    }
    this.y = y + rows * (bh + gap * 2) - gap;
  };

  // ---------- the grid ----------
  var GRID_PAD = 7;     // the most room the rounded frame takes around a grid
  /*
   * Draws a puzzle grid with its top-left at x, y and squares of cs points. mode: 'puzzle'
   * (numbers, head-start letters, the thick square) or 'solution' (every letter).
   */
  function drawGrid(pg, pz, x, y, cs, mode) {
    var g = pz.grid, pad = Math.max(4, Math.min(GRID_PAD, cs * 0.28));
    pg.rbox(x - pad, y - pad, g.cols * cs + pad * 2, g.rows * cs + pad * 2, pad * 1.2, Math.max(1, cs * 0.05));
    var ns = Math.max(7, cs * 0.3), ls = mode === 'solution' ? cs * 0.62 : cs * 0.6;
    for (var r = 0; r < g.rows; r++) {
      for (var c = 0; c < g.cols; c++) {
        var ch = g.cells[r][c];
        if (!ch) continue;
        var cx = x + c * cs, cy = y + r * cs, k = r + ',' + c;
        pg.box(cx, cy, cs, cs, mode === 'solution' ? 0.75 : 0.9);
        var num = g.nums[k];
        if (num && mode !== 'solution') pg.text(String(num), cx + Math.max(1.2, cs * 0.06), cy + ns * 0.95, ns, 'sans');
        var show = mode === 'solution' || g.givenCells[k];
        if (show) pg.text(ch, cx + cs / 2, cy + cs * 0.5 + ls * 0.36 + (mode === 'solution' ? 0 : cs * 0.06), ls, 'sans', { align: 'center' });
      }
    }
    if (g.mark) {
      var mx = x + g.mark.c * cs, my = y + g.mark.r * cs, lw = Math.max(1.8, cs * 0.09);
      pg.box(mx + lw / 2, my + lw / 2, cs - lw, cs - lw, lw);
      if (mode !== 'solution') pg.dot(mx + cs - lw - cs * 0.12, my + lw + cs * 0.12, Math.max(1, cs * 0.06));
    }
    return { w: g.cols * cs, h: g.rows * cs, pad: pad };
  }

  // ---------- front matter ----------
  function titlePage(L) {
    var p = L.project, S = L.S;
    var pg = L.page('title', 'Title page');
    pg.folio = false;
    var title = P.bookTitle(p), sub = P.bookSubtitle(p);
    var y = pg.y0 + pg.H * 0.08;
    var t = fit(title, 'serifBold', pg.w * 0.9, Math.min(34, pg.w / 8.5), S.b * 1.3, 4);
    t.lines.forEach(function (l) { y += t.size * 1.1; pg.text(l, pg.cx, y, t.size, 'serifBold', { align: 'center' }); });
    if (sub) {
      y += S.b * 0.7;
      var ss = Math.max(S.b * 0.88, 11);
      wrap(sub, ss, 'serif', pg.w * 0.84).forEach(function (l) { y += ss * 1.38; pg.text(l, pg.cx, y, ss, 'serif', { align: 'center' }); });
    }
    // a little crossing of NOEL and MERRY, like the cover
    var cs = Math.min(pg.w / 9, 30), gx = pg.cx - cs * 2.5, gy = Math.max(y + S.b * 2.6, pg.y0 + pg.H * 0.42);
    if (gy + cs * 5 < pg.cb - S.b * 4) {
      // MERRY across, NOEL down through its E
      var word = 'MERRY', down = 'NOEL';
      for (var i = 0; i < 5; i++) { pg.box(gx + i * cs, gy + cs * 2, cs, cs, 1); pg.text(word[i], gx + i * cs + cs / 2, gy + cs * 2.72, cs * 0.55, 'sans', { align: 'center' }); }
      for (var j = 0; j < 4; j++) { if (j === 2) continue; pg.box(gx + cs, gy + j * cs, cs, cs, 1); pg.text(down[j], gx + cs * 1.5, gy + j * cs + cs * 0.72, cs * 0.55, 'sans', { align: 'center' }); }
      pg.box(gx + cs + 1.2, gy + cs * 2 + 1.2, cs - 2.4, cs - 2.4, 2.4);
      holly(pg, gx + cs * 3.6, gy + cs * 3.6, cs * 2);
    } else holly(pg, pg.cx, y + S.b * 3, 50);
    var author = (p.book.author || '').trim();
    if (author || L.draft) pg.text(author || 'Your pen name', pg.cx, pg.cb - S.b, S.b * 1.05, 'serif', { align: 'center', ink: author ? 1 : 0.45 });
  }

  function copyrightPage(L) {
    var p = L.project, S = L.S;
    var pg = L.page('copyright', 'Copyright');
    pg.folio = false;
    var size = Math.max(8.5, S.b * 0.66), lead = size * 1.5;
    var year = new Date().getFullYear(), author = (p.book.author || '').trim();
    var paras = [
      'Copyright © ' + year + (author ? ' ' + author : '') + '. All rights reserved.',
      'No part of this book may be copied or shared in any form without written permission from the author, except for short quotations in reviews.',
      'Every grid in this book was built and checked by machine: every answer crosses another and no stray words hide in the grid.',
      'First edition'
    ];
    var lines = [];
    paras.forEach(function (t, i) { if (i) lines.push(''); Array.prototype.push.apply(lines, wrap(t, size, 'serif', pg.w * 0.85)); });
    var y = pg.cb - lines.length * lead;
    lines.forEach(function (l) { y += lead; if (l) pg.text(l, pg.cx, y - lead * 0.3, size, 'serif', { align: 'center' }); });
  }

  // "Days one to six give you three answers…" from the head-start rule.
  function givenRuns(p, set) {
    var ds = P.days(p).filter(function (d) { return d.set === set; }), runs = [];
    ds.forEach(function (d) {
      var g = P.givens(p, d), last = runs[runs.length - 1];
      if (last && last.g === g) last.to = d.no; else runs.push({ g: g, from: d.no, to: d.no });
    });
    return runs;
  }
  function runText(runs) {
    var words = ['', 'one answer', 'two answers', 'three answers'];
    return runs.map(function (r, i) {
      var span = r.from === r.to ? 'day ' + NUMW[r.from] : 'days ' + NUMW[r.from] + ' to ' + NUMW[r.to];
      if (!r.g) return (i ? 'and from day ' + NUMW[r.from] : 'From day ' + NUMW[r.from]) + ' every square is yours to fill';
      return (i ? '' : cap(span)) + (i ? span : '') + ' give you ' + words[r.g] + (i ? '' : ' to start with');
    }).join(', ') + '.';
  }

  function howPage(L) {
    var p = L.project, S = L.S, pl = p.plan, refs = L.refs;
    L.page('how', 'How This Book Works', 'How this book works');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('Advent crosswords', 'How This Book Works', null, 'left');
    var t = 'Every day is one puzzle. Read the clues, fill the grid, and look for the one square with a thick border. Write that letter in the matching box on the letter strip' +
      (refs.strip ? ' (page ' + refs.strip + ')' : '') + '. On December ' + P.lastDate(p) + ' the strip spells a single sentence.';
    if (pl.headStart) t += ' ' + runText(givenRuns(p, 'main'));
    L.para(t, 'serif', S.b, S.lead);
    // the example: a tiny grid beside the rules
    L.y += S.b * 0.8;
    var cs = Math.max(13, Math.min(22, L.pg.w * 0.07)), gw = cs * 5 + 12, room = L.pg.w - gw - S.b;
    var rules = ['A number sits in the first square of every answer.', 'A shared square belongs to two answers at once.',
      'The number in parentheses is the answer length.', 'The thick square holds the letter of the day.'];
    if (pl.memory && pl.lines) rules.push('Lines under each day’s question are for whoever wants them.');
    var rl = rules.map(function (r) { return wrap(r, S.b * 0.95, 'serif', room - S.b); });
    var rh = rl.reduce(function (a, l) { return a + l.length * S.lead * 0.95 + S.b * 0.3; }, 0);
    var h = Math.max(cs * 5 + 12 + S.b * 2.4, rh);
    L.need(h);
    var pg = L.pg, x = pg.x0 + 6, y = L.y + 6;
    pg.rbox(x - 6, y - 6, gw, cs * 5 + 12, 5, 1);
    [[0, 1], [1, 1], [2, 1], [3, 1], [1, 0], [1, 2], [1, 3], [1, 4]].forEach(function (k) { pg.box(x + k[0] * cs, y + k[1] * cs, cs, cs, 0.8); });
    pg.text('1', x + cs + 1.5, y + 7.6, 7, 'sans');
    pg.text('2', x + 1.5, y + cs + 7.6, 7, 'sans');
    pg.box(x + cs + 1, y + cs + 1, cs - 2, cs - 2, 1.8);
    wrap('Write the thick square letter in today’s box.', Math.max(7.5, S.small), 'sans', gw).forEach(function (l, i) {
      pg.text(l, x - 6, y + cs * 5 + 12 + S.b * 0.4 + (i + 1) * S.small * 1.3, Math.max(7.5, S.small), 'sans');
    });
    var ry = L.y, rx = pg.x0 + gw + S.b;
    rl.forEach(function (lines) {
      ry += S.b * 0.3;
      diamond(pg, rx + S.b * 0.3, ry + S.lead * 0.95 * 0.74 - S.b * 0.3, S.b * 0.22);
      lines.forEach(function (l) { ry += S.lead * 0.95; pg.text(l, rx + S.b, ry - S.lead * 0.25, S.b * 0.95, 'serif'); });
    });
    L.y += h;
    // the stars
    L.label('How hard is today?');
    var ss = S.b * 0.9;
    L.need(S.lead * 2.6);
    pg = L.pg;
    var sx = pg.x0;
    [1, 2, 3].forEach(function (n) { sx += stars(pg, sx, L.y + S.lead, n, ss) + S.b * 0.4; });
    L.y += S.lead;
    L.para('One star is a gentle day, two a full sitting, three a long evening.', 'serif', S.b, S.lead);
  }

  // The list of days with check boxes (the bestseller's "The Twenty-Four Days").
  function daysPage(L) {
    var p = L.project, S = L.S, refs = L.refs, n = p.plan.days, ds = P.days(p);
    L.page('days', 'The Days', 'The days');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('Advent crosswords', 'The ' + capWords(NUMW[n]) + ' Days', 'One grid a day. Check the box when the grid is full.', 'left');
    var gap = S.b * 0.6, rowsAll = Math.ceil(n / 2) + (p.plan.bonus ? 6 : 0);
    // rows shrink (down to two lines of small type) so the whole list fits one page when it can
    // (a row advances rowH + gap * 0.2; the solutions line and the bonus label need their room too)
    var room = L.pg.cb - L.y - S.b * 0.8 - S.lead - 4 - (p.plan.bonus ? S.b * 2.6 : 0);
    var minH = S.b * 1.9 + gap * 0.3, fitH = function (rows) { return room / rows - gap * 0.2; };
    var rowH = Math.max(minH, Math.min(Math.max(S.b * 2.7, S.lead * 1.95), fitH(Math.ceil(n / 2))));
    if (p.plan.bonus && (rowH + gap * 0.2) * rowsAll > room) rowH = Math.max(minH, fitH(rowsAll));
    ['main', 'bonus'].forEach(function (set) {
      var list = ds.filter(function (d) { return d.set === set; });
      if (!list.length) return;
      if (set === 'bonus') L.label('The Twelve Days');
      for (var i = 0; i < list.length; i += 2) {
        L.need(rowH + gap * 0.5);
        var pg = L.pg, colW = (pg.w - gap) / 2, y = L.y + gap * 0.5;
        [list[i], list[i + 1]].forEach(function (d, k) {
          if (!d) return;
          var x = pg.x0 + k * (colW + gap);
          pg.rbox(x, y, colW, rowH - gap * 0.3, 4, 0.8, 0.7);
          var ns = S.b * 1.25, nw = wid('00', ns, 'serifBold');
          pg.text(String(d.no), x + S.b * 0.45 + nw / 2, y + rowH * 0.5 + ns * 0.33, ns, 'serifBold', { align: 'center' });
          var bs = S.b * 1.05, tx = x + S.b * 0.7 + nw, tw = colW - (tx - x) - bs - S.b * 0.9;
          var title = ((p.days[d.id] || {}).title || '').trim() || (L.draft ? 'Day ' + d.no : d.date);
          var ts = Math.max(8, S.b * 0.8), tl = fit(title, 'serif', tw, ts, Math.max(7.5, ts * 0.8), 2);
          var page = refs.days && refs.days[d.id] ? 'page ' + refs.days[d.id] : d.date;
          var lh = tl.size * 1.15, blockH = tl.lines.length * lh + S.small * 1.2, ty = y + (rowH - gap * 0.3 - blockH) / 2;
          tl.lines.forEach(function (l, j) { pg.text(l, tx, ty + (j + 0.82) * lh, tl.size, 'serif'); });
          pg.text(page, tx, ty + tl.lines.length * lh + S.small * 0.95, Math.max(7, S.small * 0.95), 'sans', { ink: 0.8 });
          pg.rbox(x + colW - bs - S.b * 0.45, y + (rowH - gap * 0.3 - bs) / 2, bs, bs, 2, 0.9);
        });
        L.y = y + rowH - gap * 0.3;
      }
    });
    if (refs.solutions) { L.y += S.b * 0.8; L.need(S.lead); L.y += S.lead; L.pg.text('Solutions start on page ' + refs.solutions + '.', L.pg.x0, L.y - S.lead * 0.26, S.fact, 'serif', { ink: 0.85 }); }
  }

  function stripPage(L) {
    var p = L.project, S = L.S, n = p.plan.days;
    L.page('strip', 'The Letter Strip', 'The letter strip');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('Advent crosswords', 'The Letter Strip', 'One letter a day, in the box with the same number.', 'left');
    L.strip(n);
    L.y += S.b * 0.6;
    L.para('On December ' + P.lastDate(p) + ' the strip reads as one sentence.', 'sans', S.small * 1.2, S.lead * 0.9);
    L.label('Why the strip is empty');
    L.para('Nothing is printed here in advance. Every one of the ' + NUMW[n] + ' boxes waits for a letter you worked out yourself, and the sentence is not finished until the last day is done.', 'serif', S.b, S.lead);
    L.y += S.b * 1.2;
    ['This book belongs to', 'Started on', 'Finished on'].forEach(function (lab) {
      L.need(S.b * 3);
      L.y += S.b * 2.6;
      var pg = L.pg, lw = pg.text(lab, pg.x0, L.y, S.small * 1.15, 'sans');
      pg.line(pg.x0 + lw + S.b * 0.6, L.y + 2, pg.x1, L.y + 2, 0.75, 0.7);
    });
    if (L.pg.cb - L.y > S.b * 6) garland(L.pg, L.pg.cx, L.pg.cb - S.b * 2, Math.min(90, L.pg.w * 0.3));
  }

  // ---------- the week gates ----------
  var WEEK_TEXT = [
    'The strip is empty, the first grids are the gentlest in the book, and the house is waking up to December. Take your time: every letter you collect goes in its box on the letter strip.',
    'The candles are lit in the evenings now and the cards have started to arrive. The grids give you a little less each day; you are more than ready for it.',
    'The busiest week of the year, and the grids open up. Pour something warm, find a quiet corner and give yourself one puzzle of peace a day.',
    'The last few days. The strip is nearly full and the sentence is taking shape. One more grid a day, and then it is Christmas.'
  ];
  // The first welcome of a countdown that starts after December 1.
  var LATE_TEXT = 'The strip is empty, the first grids are the gentlest in the book, and Christmas is close now. Take your time: every letter you collect goes in its box on the letter strip.';
  var BONUS_TEXT = 'Christmas is done, the wrapping is folded and the days are quiet. Twelve more grids carry you from December 26 to Twelfth Night, with a strip of their own.';

  // The ready-made welcome: the first block opens the book, the last one closes the countdown and
  // the ones between follow the calendar week they start in.
  function weekText(p, wk, index) {
    if (wk.set === 'bonus') return BONUS_TEXT;
    var last = P.weeks(p).filter(function (w) { return w.set === 'main'; }).length - 1;
    if (!index) return P.firstDate(p) === 1 ? WEEK_TEXT[0] : LATE_TEXT;
    return index === last ? WEEK_TEXT[3] : WEEK_TEXT[Math.min(2, Math.max(1, wk.candles - 1))];
  }

  function gate(L, wk, index) {
    var p = L.project, S = L.S, ds = P.days(p).filter(function (d) { return d.set === wk.set && d.no >= wk.from && d.no <= wk.to; });
    var total = wk.set === 'bonus' ? 12 : p.plan.days, done = wk.set === 'bonus' ? 0 : wk.from - 1;
    L.toLeft();
    // left: how the week runs. It must stay one page: a tighter level is tried when it runs over.
    var pg, mark = L.pages.length;
    function left(level) {
      var pg = L.page('gate', wk.title, wk.set === 'bonus' ? 'The twelve days' : 'Advent crosswords');
      pg.items.length = 0; L.y = pg.y0;
      var st = P.stars(p, ds[0]), runs = [];
      ds.forEach(function (d) { var g = P.givens(p, d), last = runs[runs.length - 1]; if (last && last.g === g) last.to = d.no; else runs.push({ g: g, from: d.no, to: d.no }); });
      var many = ['no answers', 'one answer', 'two answers', 'three answers'];
      var sub = runs.length === 1 ? (runs[0].g ? cap(many[runs[0].g]) + ' a day are printed for you.' : 'Every square is yours to fill.')
        : runs.map(function (r, i) {
          var t = r.g ? many[r.g] + (i ? '' : ' a day') : 'none';
          if (!i) return r.from === r.to ? cap(many[r.g]) + ' on day ' + NUMW[r.from] : cap(t) + ' through day ' + NUMW[r.to];
          return r.from === r.to ? t + ' on day ' + NUMW[r.from] : t + ' from day ' + NUMW[r.from];
        }).join(', then ') + '.';
      var unit = /Week/.test(wk.title) ? 'week' : 'part';
      L.heading('Advent crosswords', 'How ' + wk.title.replace(/^The /, 'the ') + ' Run' + (/Week$/.test(wk.title) ? 's' : ''), sub, 'left');
      var notes = [];
      runs.forEach(function (r) {
        var span = r.from === r.to ? 'on day ' + NUMW[r.from] : (r.from === wk.from && r.to === wk.to ? 'every day this ' + unit : 'on days ' + NUMW[r.from] + ' to ' + NUMW[r.to]);
        notes.push(r.g ? cap(many[r.g]) + (r.g > 1 ? ' are' : ' is') + ' printed for you ' + span + '.' : 'No answers are printed ' + span + ': the grids are all yours.');
      });
      notes.push(['', 'One star means a gentle grid.', 'Two stars mean a full sitting.', 'Three stars mean a long evening.'][st] + (P.stars(p, ds[ds.length - 1]) !== st ? ' The stars go up during these days.' : ''));
      notes.push('The letter strip fills boxes ' + wk.from + (wk.to !== wk.from ? ' to ' + wk.to : '') + (wk.set === 'bonus' ? ' of the bonus strip.' : ' this ' + unit + '.'));
      L.bullets(notes);
      if (level < 2) L.label('The days of this ' + unit);
      var rowH = S.lead * (level ? 1.45 : 1.8), colW = (L.pg.w - S.b) / 2;
      for (var i = 0; level < 2 && i < ds.length; i += 2) {
        L.need(rowH);
        pg = L.pg;
        [ds[i], ds[i + 1]].forEach(function (d, k) {
          if (!d) return;
          var x = pg.x0 + k * (colW + S.b), ns = S.b * 1.15, nw = wid('00', ns, 'serifBold');
          pg.text(String(d.no), x + nw, L.y + S.lead * 0.95, ns, 'serifBold', { align: 'right' });
          var title = ((p.days[d.id] || {}).title || '').trim() || d.date;
          var tl = fit(title, 'serif', colW - nw - S.b * 0.6, S.b * 0.9, 7.5, 1);
          pg.text(tl.lines[0], x + nw + S.b * 0.5, L.y + S.lead * 0.95, tl.size, 'serif');
          var page = L.refs.days && L.refs.days[d.id];
          pg.text(page ? 'page ' + page : d.date, x + nw + S.b * 0.5, L.y + S.lead * 0.95 + S.small * 1.3, Math.max(7, S.small * 0.95), 'sans', { ink: 0.8 });
        });
        L.y += rowH;
      }
      L.label(wk.set === 'bonus' ? 'The Twelve Days strip' : 'The strip so far');
      L.strip(total);
      L.y += S.b * 0.4;
      var rest = total - done;
      var msg = wk.set === 'bonus' ? 'One letter a day from December 26. On January 6 the strip reads as one sentence.'
        : done ? cap(NUMW[done]) + ' of the ' + NUMW[total] + ' boxes should be filled by now. ' + cap(NUMW[rest]) + ' days are still to come.'
          : 'None of the ' + NUMW[total] + ' boxes are filled. ' + cap(NUMW[total]) + ' days are still to come.';
      L.para(msg, 'sans', S.small * 1.15, S.lead * 0.9);
    }
    for (var level = 0; level < 3; level++) {
      left(level);
      if (L.pages.length === mark + 1 || level === 2) break;
      L.pages.length = mark;
    }

    // right: the candles
    pg = L.page('gate', wk.title, 'Advent crosswords');
    pg.items.length = 0;
    pg.text((wk.set === 'bonus' ? 'The twelve days' : 'Advent crosswords').toUpperCase(), pg.x1, pg.y0 + S.small, S.small, 'sans', { align: 'right', ls: 2.2 });
    var ch = Math.min(pg.H * 0.13, 74), base = pg.y0 + pg.H * 0.3;
    if (wk.set === 'bonus') {
      pg.poly(starPts(pg.cx, base - ch * 0.55, ch * 0.5), 0.8);
      pg.path(starPts(pg.cx, base - ch * 0.55, ch * 0.62), 0.9, 1, true);
    } else {
      var nC = 4, sp = Math.min(pg.w / 5.5, ch * 0.75);
      for (var c = 0; c < nC; c++) candle(pg, pg.cx + (c - (nC - 1) / 2) * sp, base, ch, c < wk.candles);
    }
    var y = base + S.b * 1.8;
    var tt = fit(wk.title, 'serifBold', pg.w * 0.9, S.h1 * 1.1, S.b * 1.2, 2);
    tt.lines.forEach(function (l) { y += tt.size * 1.08; pg.text(l, pg.cx, y, tt.size, 'serifBold', { align: 'center' }); });
    var text = p.ai.weeks[index] || (L.draft && !p.ai.weeks.length ? null : weekText(p, wk, index));
    y += S.b * 0.6;
    if (text) {
      var ft = S.b * 1.02, lead = ft * 1.42, lines = wrap(text, ft, 'serif', pg.w * 0.86);
      while (lines.length * lead > pg.cb - y - S.b * 7 && ft > S.b * 0.8) { ft -= 0.5; lead = ft * 1.42; lines = wrap(text, ft, 'serif', pg.w * 0.86); }
      lines.forEach(function (l) { y += lead; pg.text(l, pg.cx, y - lead * 0.26, ft, 'serif', { align: 'center' }); });
    } else {
      L.y = y; L.pg = pg; L.flow = { kind: 'gate', label: wk.title };
      L.placeholder('This week’s welcome', 'It appears here after you paste the reply to the last prompt in step 3. Without it, the book prints a ready-made welcome.', S.b * 6.5);
      y = L.y;
    }
    if (pg.cb - y > S.b * 5) garland(pg, pg.cx, pg.cb - S.b * 2, Math.min(90, pg.w * 0.32));
  }

  // ---------- one day: grid page and clue page ----------
  function dayHead(L, pg, day, pz) {
    var p = L.project, S = L.S, d = p.days[day.id] || P.emptyDay();
    pg.text((day.set === 'bonus' ? 'The twelve days' : 'Advent crosswords').toUpperCase(), pg.x0, pg.y0 + S.small, S.small, 'sans', { ls: 2.2 });
    var top = pg.y0 + S.small + S.b * 0.9, bs = S.b * 3.5;
    pg.rbox(pg.x0, top, bs, bs, bs * 0.16, 1.1);
    pg.text(String(day.no), pg.x0 + bs / 2, top + bs * 0.5 + bs * 0.62 * 0.35, bs * 0.62, 'serifBold', { align: 'center' });
    var tx = pg.x0 + bs + S.b * 0.9, tw = pg.x1 - tx;
    var title = d.title.trim() || (L.draft ? 'Day ' + day.no : day.date);
    var tl = fit(title, 'serifBold', tw, S.h1 * 0.95, S.b * 1.05, 2);
    var lh = tl.size * 1.08, blockH = tl.lines.length * lh + S.small * 1.7, ty = top + Math.max(0, (bs - blockH) / 2);
    tl.lines.forEach(function (l, i) { pg.text(l, tx, ty + (i + 0.85) * lh, tl.size, 'serifBold', { ink: d.title.trim() ? 1 : 0.5 }); });
    var dy = ty + tl.lines.length * lh + S.small * 1.35, dw = pg.text(day.date + '  ', tx, dy, Math.max(7.5, S.small * 1.05), 'sans', { ls: 1 });
    stars(pg, tx + dw, dy + 0.5, P.stars(p, day), Math.max(7.5, S.small * 1.05));
    return top + bs + S.b * 1.2;
  }

  function gridPage(L, day, pz) {
    var p = L.project, S = L.S;
    var pg = L.page('day', 'Day ' + day.no, null);
    pg.meta.day = day.id;
    var y = dayHead(L, pg, day, pz);
    var letterOk = !!P.letterOf(p, day);
    var foot = letterOk ? S.b * 2.6 : S.b;
    if (!pz) {
      L.y = y;
      if (L.draft) L.placeholder('Day ' + day.no + '’s crossword goes here', 'Copy prompt ' + promptNo(p, day) + ' in step 3, paste it into ChatGPT, then paste the reply back. The app builds the grid.', Math.min(pg.cb - y - S.b, pg.w));
      return;
    }
    var g = pz.grid, availH = pg.cb - y - foot, pad = GRID_PAD;
    var cs = Math.min(36, (pg.w - pad * 2 - 2) / g.cols, (availH - pad * 2) / g.rows);
    var gw = g.cols * cs, gh = g.rows * cs;
    var gx = pg.cx - gw / 2, gy = y + pad + Math.max(0, Math.min(S.b * 1.2, (availH - gh - pad * 2) * 0.3));
    var res = drawGrid(pg, pz, gx, gy, cs, 'puzzle');
    var by = gy + gh + res.pad;
    if (letterOk) pg.text('Write the thick square letter in box ' + day.no + '.', pg.cx, by + S.b * 1.7, Math.max(8, S.small * 1.2), 'sans', { align: 'center' });
    if (pg.cb - by > S.b * 7) garland(pg, pg.cx, (by + S.b * 2.2 + pg.cb) / 2, Math.min(90, pg.w * 0.3));
    pg.meta.cell = cs;
  }

  function promptNo(p, day) {
    var l = CX.prompts.list(p);
    for (var i = 0; i < l.length; i++) if (l[i].kind === 'days' && l[i].days.some(function (d) { return d.id === day.id; })) return l[i].no;
    return 1;
  }

  // Clue blocks in two columns, Across then Down; returns the height used or -1 when they do not fit.
  function clueColumns(pg, pz, x0, y0, w, h, size, draw) {
    var gap = size * 1.2, colW = (w - gap) / 2, nw = wid('00', size, 'sansBold') + size * 0.45;
    var lead = size * 1.24, items = [];
    ['A', 'D'].forEach(function (dir) {
      var es = pz.grid.entries.filter(function (e) { return e.dir === dir; });
      if (!es.length) return;
      items.push({ head: dir === 'A' ? 'ACROSS' : 'DOWN' });
      es.forEach(function (e) { items.push({ e: e, lines: wrap(e.c + ' (' + e.w.length + ')', size, 'serif', colW - nw) }); });
    });
    var col = 0, y = 0, used = 0, hs = Math.max(7.5, size * 0.72);
    for (var i = 0; i < items.length; i++) {
      var it = items[i], ih = it.head ? hs * 2.2 : it.lines.length * lead + size * 0.28;
      var keep = it.head && items[i + 1] ? items[i + 1].lines.length * lead + size * 0.28 : 0;
      if (y + ih + keep > h + 0.01) { col++; y = 0; if (col > 1) return -1; }
      var x = x0 + col * (colW + gap);
      if (it.head) {
        if (draw) pg.text(it.head, x, y0 + y + (y ? hs * 1.6 : hs), hs, 'sansBold', { ls: 2 });
        y += y ? hs * 2.2 : hs * 1.6;
      } else {
        if (draw) {
          pg.text(String(it.e.num), x + nw - size * 0.45, y0 + y + lead * 0.8, size, 'sansBold', { align: 'right' });
          it.lines.forEach(function (l, k) { pg.text(l, x + nw, y0 + y + lead * (k + 0.8), size, 'serif'); });
        }
        y += ih;
      }
      used = Math.max(used, y);
    }
    return used;
  }

  function cluePage(L, day, pz) {
    var p = L.project, S = L.S, pl = p.plan, d = p.days[day.id] || P.emptyDay();
    var pg = L.page('clues', 'Day ' + day.no + ' clues', null);
    pg.meta.day = day.id;
    var hs = S.small * 1.05, wr = S.b * 1.05, top = pg.y0 + wr;
    var dw = wid(day.date.toUpperCase(), hs, 'sans', 2.2);
    wreath(pg, pg.x1 - dw - S.b * 0.8 - wr, top, wr * 0.82);
    pg.text(day.date.toUpperCase(), pg.x1, top + hs * 0.36, hs, 'sans', { align: 'right', ls: 2.2 });
    var y = top + wr + S.b * 0.4;
    pg.line(pg.x0, y, pg.x1, y, 0.9);
    y += S.b * 0.6;
    // the bottom block: today's letter, the story and the memory question with lines
    var letterOk = !!P.letterOf(p, day), g = P.givens(p, day);
    function bottomBlock(nLines, withStory, draw, yTop) {
      var h = 0, by = yTop;
      if (letterOk) {
        var bs = S.b * 2.3, ms = Math.max(7.5, S.small * 1.05), ml = ms * 1.42;
        var lines = ['Today’s letter, for box ' + day.no + '.',
          g ? cap(NUMW[g]) + ' answer' + (g > 1 ? 's are' : ' is') + ' filled in for you.' : 'Every square is yours today.',
          L.refs.strip ? 'Letter strip on page ' + (day.set === 'bonus' ? L.refs.bonusStrip || L.refs.strip : L.refs.strip) + '.' : ''].filter(Boolean);
        var bh = Math.max(bs, lines.length * ml);
        if (draw) {
          pg.rbox(pg.x0, by, bs, bs, 3, 1.1);
          pg.text(String(day.no), pg.x0 + 3, by + Math.max(7, bs * 0.22) + 1.5, Math.max(7, bs * 0.22), 'sans');
          lines.forEach(function (l, i) { pg.text(l, pg.x0 + bs + S.b * 0.7, by + (bh - lines.length * ml) / 2 + ml * (i + 0.78), ms, 'sans'); });
        }
        h += bh + S.b * 0.7; by += bh + S.b * 0.7;
      }
      var story = withStory && pl.story ? d.story.trim() : '', q = pl.memory ? d.question.trim() : '';
      if (story || q) {
        if (draw) pg.line(pg.x0, by, pg.x1, by, 0.75, 0.6);
        h += S.b * 0.5; by += S.b * 0.5;
        if (story) wrap(story, S.fact, 'serif', pg.w).forEach(function (l) { h += S.fact * 1.34; by += S.fact * 1.34; if (draw) pg.text(l, pg.x0, by - S.fact * 0.3, S.fact, 'serif', { ink: 0.85 }); });
        if (story && q) { h += S.b * 0.35; by += S.b * 0.35; }
        if (q) wrap(q, S.b, 'serif', pg.w).forEach(function (l) { h += S.lead; by += S.lead; if (draw) pg.text(l, pg.x0, by - S.lead * 0.26, S.b, 'serif'); });
        if (q) for (var i = 0; i < nLines; i++) { h += S.b * 1.75; by += S.b * 1.75; if (draw) pg.line(pg.x0, by, pg.x1, by, 0.75, 0.55); }
      }
      return h;
    }
    if (!pz) {
      L.y = y;
      if (L.draft) L.placeholder('The clues go here', 'Across and Down, with the length of every answer.', Math.min(pg.cb - y - S.b * 8, pg.w * 0.9));
      var bh0 = bottomBlock(pl.lines, true, false, 0);
      if (pg.cb - bh0 > L.y) bottomBlock(pl.lines, true, true, pg.cb - bh0);
      return;
    }
    // shrink the clues, then the lines, then drop the story, until everything fits
    var nLines = pl.memory ? pl.lines : 0, withStory = true, size = S.b, h = -1, bh = 0;
    for (var tries = 0; tries < 40; tries++) {
      bh = bottomBlock(nLines, withStory, false, 0);
      var room = pg.cb - y - bh - S.b * 0.6;
      h = room > 0 ? clueColumns(pg, pz, pg.x0, y, pg.w, room, size, false) : -1;
      if (h >= 0) break;
      if (size > Math.max(9, S.b * 0.78)) size -= 0.5;
      else if (nLines > 2) nLines--;
      else if (withStory && pl.story && d.story) withStory = false;
      else if (nLines > 0) nLines--;
      else if (size > 7.5) size -= 0.5;
      else break;
    }
    clueColumns(pg, pz, pg.x0, y, pg.w, Math.max(h, pg.cb - y - bh), size, true);
    bottomBlock(nLines, withStory, true, pg.cb - bh);
    pg.meta.clueSize = size;
  }

  // ---------- after the countdown ----------
  function evePage(L) {
    var p = L.project, S = L.S;
    L.page('eve', 'You Made It', 'You made it');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('December ' + P.lastDate(p), 'You Made It!');
    if (p.ai.eve.length) p.ai.eve.forEach(function (t, i) { if (i) L.y += S.b * 0.5; L.para(t, 'serif', S.b, S.lead); });
    else if (L.draft) L.placeholder('Your Christmas Eve note', 'It appears here after you paste the reply to the last prompt in step 3.', S.b * 7);
    else L.para('Every grid is full and every box on the strip has its letter. Thank you for spending a few quiet minutes of each December day with this book. Merry Christmas!', 'serif', S.b, S.lead);
    L.label('The sentence, in your own hand');
    var pg = L.pg;
    for (var i = 0; i < 2; i++) { L.need(S.b * 2.4); L.y += S.b * 2.2; L.pg.line(L.pg.x0, L.y, L.pg.x1, L.y, 0.9, 0.7); }
    pg = L.pg;
    if (pg.cb - L.y > S.b * 6) holly(pg, pg.cx, (L.y + pg.cb) / 2, Math.min(70, pg.w * 0.25));
  }

  // The solutions: as many grids to a page as stay readable.
  function solutions(L, list) {
    var p = L.project, S = L.S;
    var withGrid = list.filter(function (x) { return x.pz; });
    if (!withGrid.length) return;
    L.page('solutions', 'Solutions', 'Solutions');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Solutions');
    var maxR = 1, maxC = 1;
    withGrid.forEach(function (x) { maxR = Math.max(maxR, x.pz.grid.rows); maxC = Math.max(maxC, x.pz.grid.cols); });
    var labH = S.b * 1.9, gapX = S.b * 1.2, gapY = S.b * 0.9, pad = GRID_PAD;
    function cellFor(cols, rows, top) {
      var pg = L.pg, w = (pg.w - gapX * (cols - 1)) / cols, h = (pg.cb - top - gapY * (rows - 1)) / rows;
      return Math.min(24, (w - pad * 2) / maxC, (h - labH - pad * 2) / maxR);
    }
    var options = [[3, 4], [3, 3], [2, 3], [2, 2], [1, 2], [1, 1]];
    function pick(top) {
      for (var i = 0; i < options.length; i++) if (cellFor(options[i][0], options[i][1], top) >= 11.5) return options[i];
      return [1, 1];
    }
    var k = 0, first = true;
    while (k < withGrid.length) {
      if (!first) { L.page('solutions', 'Solutions', 'Solutions'); }
      var top = L.y, opt = pick(top), cols = opt[0], rows = opt[1], cs = cellFor(cols, rows, top), pg = L.pg;
      var cw = (pg.w - gapX * (cols - 1)) / cols, rh = labH + maxR * cs + pad * 2;
      var restH = (pg.cb - top - rows * rh) / Math.max(1, rows);
      for (var r = 0; r < rows && k < withGrid.length; r++) {
        for (var c = 0; c < cols && k < withGrid.length; c++, k++) {
          var x = withGrid[k], g = x.pz.grid, cx0 = pg.x0 + c * (cw + gapX), y0 = top + r * (rh + Math.min(restH, gapY * 2));
          var title = String(x.day.no) + '  ' + (((p.days[x.day.id] || {}).title || '').trim() || x.day.date);
          var tl = fit(title, 'sansBold', cw, Math.max(8, S.small * 1.15), 7.5, 1);
          pg.text(tl.lines[0], cx0 + cw / 2, y0 + tl.size, tl.size, 'sansBold', { align: 'center' });
          drawGrid(pg, x.pz, cx0 + (cw - g.cols * cs) / 2, y0 + labH + pad + (maxR - g.rows) * cs / 2, cs, 'solution');
        }
      }
      first = false;
      L.y = pg.cb;
    }
  }

  function sentencePage(L) {
    var p = L.project, S = L.S;
    L.page('sentence', 'The Hidden Sentence', 'The hidden sentence');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'The Hidden Sentence', 'Did your strip spell it out?');
    [{ set: 'main', n: p.plan.days, label: 'The ' + capWords(NUMW[p.plan.days]) + ' Days' }, { set: 'bonus', n: 12, label: 'The Twelve Days' }].forEach(function (s) {
      if (s.set === 'bonus' && !p.plan.bonus) return;
      var ok = P.sentenceOk(p, s.set);
      if (!ok && !L.draft) return;
      if (p.plan.bonus) L.label(s.label);
      L.strip(s.n, ok ? P.sentenceOf(p, s.set) : null);
      var text = ok ? (s.set === 'bonus' ? p.plan.bonusSentence : p.plan.sentence).trim().replace(/\s+/g, ' ') : 'The sentence has the wrong number of letters (step 1).';
      L.y += S.b * 0.6;
      L.need(S.h2 * 1.6);
      L.y += S.h2 * 1.2;
      var ft = fit(text.toUpperCase(), 'serifBold', L.pg.w, S.h2, 8, 2);
      ft.lines.forEach(function (l, i) { if (i) L.y += ft.size * 1.2; L.pg.text(l, L.pg.cx, L.y, ft.size, 'serifBold', { align: 'center', ink: ok ? 1 : 0.5 }); });
      L.y += S.b * 0.6;
    });
    if (L.pg.cb - L.y > S.b * 6) garland(L.pg, L.pg.cx, L.pg.cb - S.b * 2, Math.min(90, L.pg.w * 0.3));
  }

  function folios(L) {
    var S = L.S;
    L.pages.forEach(function (pg) {
      if (!pg.folio) return;
      pg.text(String(pg.num), pg.cx, pg.y1 - 2, S.folio, 'serif', { align: 'center' });
    });
  }

  function pass(project, pageGuess, draft, refs) {
    F = CX.metrics.load();
    var L = new Layout(project, pageGuess, draft, refs);
    var out = L.out, sections = [], all = P.days(project);
    var list = all.map(function (day) { return { day: day, pz: CX.puzzles.get(project, day) }; });
    titlePage(L);
    copyrightPage(L);
    var front = [{ page: 1, title: 'Title page' }];
    sections.push({ page: L.pages.length + 1, title: 'How This Book Works' });
    howPage(L);
    sections.push({ page: L.pages.length + 1, title: 'The Days' });
    daysPage(L);
    out.strip = L.pages.length + 1;
    sections.push({ page: out.strip, title: 'The Letter Strip' });
    stripPage(L);
    P.weeks(project).forEach(function (wk, i) {
      if (wk.set === 'bonus') {
        sections.push({ page: L.pages.length + 1, title: 'You Made It' });
        evePage(L);
      }
      gate(L, wk, i);
      var gp = L.pages.length - 1;
      if (wk.set === 'bonus') out.bonusStrip = gp;
      sections.push({ page: gp, title: wk.title });
      list.filter(function (x) { return x.day.set === wk.set && x.day.no >= wk.from && x.day.no <= wk.to; }).forEach(function (x) {
        L.toLeft();
        out.days[x.day.id] = L.pages.length + 1;
        sections.push({ page: L.pages.length + 1, title: (x.day.set === 'bonus' ? 'Bonus ' : 'Day ') + x.day.no, sub: true });
        gridPage(L, x.day, x.pz);
        cluePage(L, x.day, x.pz);
      });
    });
    if (!project.plan.bonus) { sections.push({ page: L.pages.length + 1, title: 'You Made It' }); evePage(L); }
    if (list.some(function (x) { return x.pz; })) {
      out.solutions = L.pages.length + 1;
      sections.push({ page: out.solutions, title: 'Solutions' });
      solutions(L, list);
    }
    sections.push({ page: L.pages.length + 1, title: 'The Hidden Sentence' });
    sentencePage(L);
    folios(L);
    return {
      W: L.W, H: L.H, pages: L.pages, m: L.m, S: L.S, refs: out,
      front: front, sections: sections
    };
  }

  function refsKey(r) { return JSON.stringify(r || {}); }

  /*
   * The whole book. opts.draft: placeholders for missing content (the preview).
   * The inside margin grows with the page count, and forward page numbers come from the last
   * pass, so the layout runs again until both settle.
   */
  function layoutBook(project, opts) {
    opts = opts || {};
    var guess = 120, refs = {}, book = null;
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

  CX.layout = { PRINT: PRINT, NUMW: NUMW, layoutBook: layoutBook, wrap: wrap, fit: fit, sizes: sizes, drawGrid: drawGrid, runText: runText, givenRuns: givenRuns };
})(typeof window !== 'undefined' ? window : globalThis);
