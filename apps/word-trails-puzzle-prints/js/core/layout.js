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
 * Book order: title, copyright, welcome and how to play with a worked example, the puzzle log, the
 * puzzles (a divider before each level in a mixed book), first hints, second hints, solutions and
 * the closing note. The hints come in two rounds on separate pages, so looking up the theme of a
 * puzzle never shows its words. Page numbers that point forward come from the previous pass.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var KDP = CX.kdp, P = CX.plan;
  var PT = 72;
  var F = null;

  var PRINT = {
    regular: { base: 12, label: 'Regular (12 pt text)' },
    large: { base: 14, label: 'Large print (14 pt text)' },
    xl: { base: 16, label: 'Extra large (16 pt text)' }
  };

  var MAX_CELL = 72;      // one inch: bigger only spreads the letters too far apart to link by eye
  var MIN_CELL_TWO = 26;  // two puzzles to a page only when the squares stay at least this big

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

  // ---------- small drawings (gray only) ----------
  function starPts(cx, cy, r) {
    var pts = [];
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    return pts;
  }
  function diamond(pg, cx, cy, r, ink) { pg.poly([cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy], ink); }

  // A short trail of linked rings: the ornament of the book.
  function trailMark(pg, cx, y, half) {
    var n = 5, step = Math.min(half / 2, 18), r = Math.max(2.4, step * 0.2), pts = [];
    for (var i = 0; i < n; i++) pts.push(cx + (i - (n - 1) / 2) * step, y + (i % 2 ? -step * 0.32 : step * 0.32));
    pg.path(pts, 1, 0.55);
    for (var k = 0; k < n; k++) pg.dot(pts[k * 2], pts[k * 2 + 1], r, k === 2 ? 1 : 0.55);
    if (half > step * 3) {
      pg.line(cx - half, y, pts[0] - step * 0.5, y, 0.75, 0.55);
      pg.line(pts[(n - 1) * 2] + step * 0.5, y, cx + half, y, 0.75, 0.55);
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
  function sizes(b) {
    return { b: b, lead: b * 1.36, fact: Math.max(9, b * 0.82), h1: b * 1.85, h2: b * 1.3, small: Math.max(8, b * 0.62), folio: Math.max(8.5, b * 0.68) };
  }

  function Layout(project, pages, draft, refs) {
    var t = KDP.trim(project.book.trim);
    this.project = project;
    this.draft = draft;
    this.refs = refs || {};
    this.out = {};
    this.W = t.w * PT; this.H = t.h * PT;
    var m = KDP.margins(pages);
    this.m = { inside: m.inside * PT, outside: m.outside * PT, top: m.top * PT, bottom: m.bottom * PT };
    this.safe = { inside: m.safe.inside * PT, outside: m.safe.outside * PT, top: m.safe.top * PT, bottom: m.safe.bottom * PT };
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

  // Section title block: small label, big title, optional subtitle, a rule or the trail ornament.
  Layout.prototype.heading = function (eyebrow, title, sub, align) {
    var S = this.S, pg = this.pg, y = this.y + S.b * 0.4, left = align === 'left';
    var x = left ? pg.x0 : pg.cx, o = { align: left ? null : 'center' };
    if (eyebrow) { y += S.small; pg.text(eyebrow.toUpperCase(), x, y, S.small * 1.05, 'sans', Object.assign({ ls: 2.2 }, o)); y += S.b * 0.9; }
    var t = fit(title, 'serifBold', pg.w * (left ? 1 : 0.92), S.h1, S.b * 1.2, 2);
    t.lines.forEach(function (l) { y += t.size * 1.05; pg.text(l, x, y, t.size, 'serifBold', o); y += t.size * 0.12; });
    if (sub) wrap(sub, S.b, 'serif', pg.w * (left ? 1 : 0.88)).forEach(function (l) { y += S.b * 1.32; pg.text(l, x, y, S.b, 'serif', o); });
    if (left) { y += S.b * 0.7; pg.line(pg.x0, y, pg.x1, y, 0.9); this.y = y + S.b * 0.9; return; }
    y += S.b * 1.2;
    trailMark(pg, pg.cx, y, Math.min(80, pg.w * 0.26));
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

  Layout.prototype.placeholder = function (title, note, h, x, w) {
    var S = this.S;
    this.need(h);
    var pg = this.pg, y = this.y + S.b * 0.4;
    x = x == null ? pg.x0 : x; w = w == null ? pg.w : w;
    pg.box(x, y, w, h - S.b * 0.8, 0.9, 0.35, [5, 4]);
    var ty = y + (h - S.b * 0.8) / 2 - S.b * 0.4;
    pg.text(title, x + w / 2, ty, S.b * 0.95, 'sansBold', { align: 'center', ink: 0.55 });
    wrap(note, S.small * 1.15, 'sans', w * 0.8).forEach(function (l, i) {
      pg.text(l, x + w / 2, ty + S.b * 1.2 + i * S.small * 1.5, S.small * 1.15, 'sans', { align: 'center', ink: 0.55 });
    });
    this.y += h;
  };

  // ---------- the grid ----------
  /*
   * Draws a grid with its top-left at x, y and squares of cs points. mode 'puzzle': a ring round
   * every letter, to draw the trails over. 'solution': each trail as a line through shaded rounds
   * (the way a solver draws it, so word ends stay clear), the span word heavier and darker.
   */
  function drawGrid(pg, g, x, y, cs, mode) {
    function cx(c) { return x + c * cs + cs / 2; }
    function cy(r) { return y + r * cs + cs / 2; }
    if (mode === 'solution') {
      g.trails.forEach(function (t) {
        var pts = [];
        t.path.forEach(function (rc) { pts.push(cx(rc[1]), cy(rc[0])); });
        pg.path(pts, Math.max(1, cs * (t.span ? 0.2 : 0.11)), t.span ? 1 : 0.75);
        t.path.forEach(function (rc) { pg.dot(cx(rc[1]), cy(rc[0]), cs * 0.4, t.span ? 0.42 : 0.13); });
      });
    }
    var size = cs * 0.5, lift = F.sansBold.capHeight * size / 2;
    for (var r = 0; r < g.rows; r++) {
      for (var c = 0; c < g.cols; c++) {
        if (mode !== 'solution') pg.ring(cx(c), cy(r), cs * 0.43, 0.75, 0.45);
        pg.text(g.cells[r][c], cx(c), cy(r) + lift, size, 'sansBold', { align: 'center' });
      }
    }
  }

  /*
   * The words to find, as writing slots under the grid. easy: first letter and length; medium:
   * length; hard: plain lines that give nothing away. The span word comes first, with a star.
   * Returns { rows: [[slot...]], h } so the caller can size the grid; draw with drawSlots.
   */
  function slotPlan(project, pz, res, w, ss) {
    var trails = res.grid.trails.slice().sort(function (a, b) {
      return (b.span ? 1 : 0) - (a.span ? 1 : 0) || b.w.length - a.w.length || (a.w < b.w ? -1 : 1);
    });
    var lvl = res.level, lw = ss * 1.15, star = ss * 1.25, gap = ss * 1.1, rows = [[]], x = 0;
    var plain = (w - gap * 2) / 3;
    trails.forEach(function (t) {
      var sw = (t.span ? star : 0) + (lvl === 'hard' ? plain - (t.span ? star : 0) : t.w.length * lw);
      if (x && x + sw > w + 0.01) { rows.push([]); x = 0; }
      rows[rows.length - 1].push({ t: t, x: x, w: sw });
      x += sw + gap;
    });
    return { rows: rows, h: rows.length * ss * 2.05, ss: ss, lw: lw, star: star, level: lvl };
  }
  function drawSlots(pg, plan, x0, y, w) {
    var ss = plan.ss, rowH = ss * 2.05;
    plan.rows.forEach(function (row, ri) {
      var last = row[row.length - 1], used = last.x + last.w, off = (w - used) / 2, base = y + (ri + 1) * rowH - ss * 0.4;
      row.forEach(function (s) {
        var x = x0 + off + s.x, sx = x + (s.t.span ? plan.star : 0);
        if (s.t.span) pg.poly(starPts(x + ss * 0.5, base - ss * 0.36, ss * 0.5));
        if (plan.level === 'hard') { pg.line(sx, base + 1, x + s.w, base + 1, 0.75, 0.7); return; }
        for (var i = 0; i < s.t.w.length; i++) {
          pg.line(sx + i * plan.lw + ss * 0.14, base + 1, sx + (i + 1) * plan.lw - ss * 0.14, base + 1, 0.75, 0.7);
          if (!i && plan.level === 'easy') pg.text(s.t.w[0], sx + plan.lw / 2, base - 1, ss, 'sansBold', { align: 'center' });
        }
      });
    });
  }

  // ---------- one puzzle, in the box from top to bottom of the page ----------
  function puzzleBlock(L, pg, pz, top, bottom, compact) {
    var p = L.project, S = L.S, d = p.puzzles[pz.id] || P.emptyPuzzle(), res = CX.puzzles.get(p, pz);
    var lvl = P.levelOf(p, pz), hs = Math.max(8, S.small), y = top + hs;
    var nameStr = 'PUZZLE ' + pz.no;
    pg.text(nameStr, pg.x0, y, hs, 'sansBold', { ls: 1.8 });
    if (p.plan.stars) stars(pg, pg.x1, y, P.level(lvl).stars, hs * 1.15);
    y += S.b * (compact ? 0.35 : 0.7);
    var title = d.title.trim() || (L.draft ? 'Puzzle ' + pz.no : '');
    var tl = fit(title, 'serifBold', pg.w * 0.94, compact ? S.h2 * 1.1 : S.h1, S.b, 2);
    tl.lines.forEach(function (l) { y += tl.size * 1.1; pg.text(l, pg.cx, y, tl.size, 'serifBold', { align: 'center', ink: d.title.trim() ? 1 : 0.5 }); });
    if (!res || !res.grid) {
      L.pg = pg; L.y = y + S.b * 0.5;
      L.flow = { kind: 'puzzle', label: 'Puzzle ' + pz.no };
      if (L.draft) {
        var h = Math.max(S.b * 6, bottom - L.y - S.b * 0.4);
        var stuck = res && res.problems.length;
        L.placeholder('Puzzle ' + pz.no + ' goes here', stuck ? 'No grid yet. Copy the prompt in step 3 for more words. Until then the PDF leaves this puzzle out and numbers the rest, so no page is blank.' : 'Copy the prompt in step 3, paste it into ChatGPT, then paste the reply back. The app builds the grid.', h);
      }
      return;
    }
    var g = res.grid, n = g.trails.length - 1;
    var line = n + ' theme words and 1 span word';
    var ls = Math.max(8, S.small * 1.1);
    y += ls * 1.5;
    pg.text(line, pg.cx, y, ls, 'sans', { align: 'center', ink: 0.85 });
    y += S.b * (compact ? 0.3 : 0.6);
    // slots first, what is left goes to the grid; the grid matters more, so slots shrink for it
    var ss = Math.max(8, S.b * (compact ? 0.68 : 0.85)), plan = slotPlan(p, pz, res, pg.w, ss), avail, cs;
    for (;;) {
      avail = bottom - y - plan.h - S.b * (compact ? 0.2 : 0.5);
      cs = Math.min(MAX_CELL, pg.w / g.cols, avail / g.rows);
      if (cs >= 28 || ss <= 8) break;
      ss = Math.max(8, ss - 0.5);
      plan = slotPlan(p, pz, res, pg.w, ss);
    }
    var gw = g.cols * cs, gh = g.rows * cs;
    var spare = Math.max(0, avail - gh), gy = y + spare * 0.3;
    drawGrid(pg, g, pg.cx - gw / 2, gy, cs, 'puzzle');
    drawSlots(pg, plan, pg.x0, gy + gh + Math.min(spare * 0.25, S.b * 0.7), pg.w);
    pg.meta.cell = Math.min(pg.meta.cell || 1e9, cs);
  }

  // Two puzzles to a page only when the squares stay big enough.
  function perPage(L) {
    if (L.project.plan.perPage !== 2) return 1;
    var g = P.grid(L.project.plan.size), pg = L.H - L.m.top - L.m.bottom - L.foot;
    return (pg / 2 - L.S.b * 8.5) / g.rows >= MIN_CELL_TWO ? 2 : 1;
  }

  function puzzlePages(L, list) {
    var p = L.project, per = perPage(L), mixed = p.plan.level === 'mixed', prev = '';
    var i = 0;
    while (i < list.length) {
      var lvl = P.levelOf(p, list[i]);
      if (mixed && lvl !== prev) levelPage(L, lvl);
      prev = lvl;
      var pg = L.page('puzzle', 'Puzzle ' + list[i].no);
      pg.meta.puzzle = list[i].id;
      // a second puzzle shares the page only if it is on the same level
      var two = per === 2 && list[i + 1] && P.levelOf(p, list[i + 1]) === lvl;
      if (!L.out.pages) L.out.pages = {};
      L.out.pages[list[i].id] = pg.num;
      if (two) {
        var mid = (pg.y0 + pg.cb) / 2;
        puzzleBlock(L, pg, list[i], pg.y0, mid - L.S.b * 0.5, true);
        pg.line(pg.x0, mid, pg.x1, mid, 0.75, 0.35, [2, 3]);
        puzzleBlock(L, pg, list[i + 1], mid + L.S.b * 0.5, pg.cb, true);
        L.out.pages[list[i + 1].id] = pg.num;
        i += 2;
      } else {
        puzzleBlock(L, pg, list[i], pg.y0, pg.cb, false);
        i++;
      }
    }
  }

  function levelPage(L, id) {
    var S = L.S, lv = P.level(id), pg = L.page('level', lv.section);
    var y = pg.y0 + pg.H * 0.26;
    stars(pg, pg.cx + S.h1 * 1.8, y, lv.stars, S.h1 * 1.05 * 3 / 3);
    y += S.b * 2;
    var t = fit(lv.section, 'serifBold', pg.w * 0.9, S.h1 * 1.5, S.b * 1.2, 2);
    t.lines.forEach(function (l) { y += t.size * 1.1; pg.text(l, pg.cx, y, t.size, 'serifBold', { align: 'center' }); });
    y += S.b * 1.6;
    pg.text(lv.label.toUpperCase() + ' PUZZLES', pg.cx, y, S.small * 1.1, 'sans', { align: 'center', ls: 2.2 });
    y += S.b * 0.8;
    wrap(lv.help, S.b, 'serif', pg.w * 0.82).forEach(function (l) { y += S.lead; pg.text(l, pg.cx, y, S.b, 'serif', { align: 'center' }); });
    trailMark(pg, pg.cx, y + S.b * 2.6, Math.min(90, pg.w * 0.3));
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
      var ss = Math.max(S.b * 0.88, 11);
      wrap(sub, ss, 'serif', pg.w * 0.84).forEach(function (l) { y += ss * 1.38; pg.text(l, pg.cx, y, ss, 'serif', { align: 'center' }); });
    }
    // a little worked grid, as on the cover
    var ex = example(), cs = Math.min(pg.w / 8, 30), gy = Math.max(y + S.b * 2.6, pg.y0 + pg.H * 0.4);
    if (gy + cs * ex.rows < pg.cb - S.b * 4) drawGrid(pg, ex, pg.cx - cs * ex.cols / 2, gy, cs, 'solution');
    else trailMark(pg, pg.cx, y + S.b * 3, 70);
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
      'Every grid in this book was built and checked by machine: every letter is used and each puzzle has exactly one solution.',
      'First edition'
    ];
    var lines = [];
    paras.forEach(function (t, i) { if (i) lines.push(''); Array.prototype.push.apply(lines, wrap(t, size, 'serif', pg.w * 0.85)); });
    var y = pg.cb - lines.length * lead;
    lines.forEach(function (l) { y += lead; if (l) pg.text(l, pg.cx, y - lead * 0.3, size, 'serif', { align: 'center' }); });
  }

  // The worked example of the how-to page: always the same small grid.
  var EXAMPLE = null;
  function example() {
    if (!EXAMPLE) EXAMPLE = CX.engine.build({ span: 'ORCHARD', words: ['APPLE', 'PLUM', 'PEAR', 'LEMON'], cols: 5, rows: 5, level: 'medium', seed: 'how-to-play', tries: 500 });
    return EXAMPLE;
  }

  function howPage(L) {
    var p = L.project, S = L.S, pl = p.plan, refs = L.refs, name = pl.name.trim() || 'Word Trails';
    L.page('how', 'How to Play', 'How to play');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Welcome to ' + name);
    var welcome = p.ai.welcome.length ? p.ai.welcome : ['Every puzzle in this book hides a set of words that share one theme. Work out the theme, trace the words through the letters and watch the grid fill up until no letter is left over.'];
    welcome.forEach(function (t, i) { if (i) L.y += S.b * 0.5; L.para(P.countText(p, t, L.draft), 'serif', S.b, S.lead); });
    L.label('How to play');
    var who = P.audience(pl.audience), min = who.minLen;
    L.bullets(who.kid ? [
      'The title is your first clue to what the words are about.',
      'Trace a word by joining letters that touch: up, down, sideways or on a diagonal. A word can turn at any letter.',
      'Every letter is used once. No letter is left over. Words are at least three letters long.',
      'Trails never cross, so each word you find makes the next one easier.',
      'One special word, the span word, tells you what the puzzle is about. It goes from one side of the grid to the other.',
      'A star marks the span word in the writing spaces under the grid.'
    ] : [
      'The title is your first hint. It points at the theme with a little wordplay.',
      'Trace a word by linking letters that touch: up, down, sideways or on a diagonal. A word can turn at any letter.',
      'Every letter belongs to exactly one word. No letter is left over and none is used twice. Words are at least ' + (min === 3 ? 'three' : 'four') + ' letters long.',
      'Trails never cross each other, so a found word walls off part of the grid and helps you with the rest.',
      'One word is the span word: it names the theme and runs from one edge of the grid to the opposite edge.',
      'A star marks the span word in the writing spaces under the grid.'
    ]);
    // the worked example: the same grid unsolved and solved
    var ex = example(), gap = S.b * 1.4, cs = Math.min(30, (L.pg.w - gap) / (ex.cols * 2));
    L.label('An example: Picked Fresh');
    L.para('The title hints at fruit. The span word is ORCHARD; the theme words are APPLE, PLUM, PEAR and LEMON.', 'serif', S.b, S.lead);
    var capS = Math.max(8, S.small * 1.05), h = cs * ex.rows + capS * 2.6;
    L.y += S.b * 0.4;
    L.need(h);
    var pg = L.pg, gw = cs * ex.cols, x1 = pg.cx - gap / 2 - gw, x2 = pg.cx + gap / 2;
    pg.text('The puzzle', x1 + gw / 2, L.y + capS, capS, 'sansBold', { align: 'center' });
    pg.text('Solved', x2 + gw / 2, L.y + capS, capS, 'sansBold', { align: 'center' });
    var gy = L.y + capS * 1.8;
    drawGrid(pg, ex, x1, gy, cs, 'puzzle');
    drawGrid(pg, ex, x2, gy, cs, 'solution');
    L.y = gy + cs * ex.rows + capS * 0.8;
    var more = [];
    if (pl.hints && refs.hints1) more.push('Stuck? The first hints start on page ' + refs.hints1 + ': the theme in plain words and how the span word starts. The second hints, on page ' + refs.hints2 + ', give you two of the words.');
    if (refs.solutions) more.push('All the solutions start on page ' + refs.solutions + '. In the solutions the span word is the darker, heavier trail.');
    more.forEach(function (t) { L.y += S.b * 0.4; L.para(t, 'serif', S.b, S.lead); });
    if (pl.level === 'mixed') {
      L.label('Three levels');
      P.LEVELS.forEach(function (lv) { L.para(lv.label + ': ' + lv.help, 'serif', S.b, S.lead); });
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

  // ---------- the hints ----------
  function hintRow(L, no, text) {
    var S = L.S, size = Math.max(9, S.b * 0.86), lead = size * 1.32, nw = wid('000', size, 'sansBold') + size * 0.6;
    var lines = wrap(text, size, 'serif', L.pg.w - nw);
    L.need(lines.length * lead + size * 0.45);
    var pg = L.pg;
    pg.text(String(no), pg.x0 + nw - size * 0.6, L.y + lead * 0.78, size, 'sansBold', { align: 'right' });
    lines.forEach(function (l, i) { pg.text(l, pg.x0 + nw, L.y + lead * (i + 0.78), size, 'serif'); });
    L.y += lines.length * lead + size * 0.45;
  }

  function firstHint(p, pz, res) {
    var d = p.puzzles[pz.id], g = res.grid, sp = g.trails.filter(function (t) { return t.span; })[0];
    var a = sp.path[0], how = g.axis === 'v' ? (a[0] === 0 ? 'runs top to bottom' : 'runs bottom to top') : (a[1] === 0 ? 'runs left to right' : 'runs right to left');
    var theme = d.theme.trim().replace(/[.\s]+$/, '');
    return (theme ? theme + '. ' : '') + 'The span word has ' + sp.w.length + ' letters, starts with ' + sp.w[0] + ' and ' + how + '.';
  }

  // Two words the solver gets for free: not the longest, so the hint gives a start, not the solution.
  function secondHint(res) {
    var ws = res.grid.trails.filter(function (t) { return !t.span; }).map(function (t) { return t.w; }).sort(function (a, b) { return a.length - b.length || (a < b ? -1 : 1); });
    return ws.slice(0, 2).join(' and ');
  }

  function hintsSection(L, list, round) {
    var p = L.project, ready = list.filter(function (x) { return x.res && x.res.grid; });
    if (!ready.length) return;
    var name = round === 1 ? 'First Hints' : 'Second Hints';
    L.page('hints', name, name);
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', name, round === 1 ? 'The theme in plain words, and where the span word starts.' : 'Two of the theme words, to get you going.', 'left');
    ready.forEach(function (x) { hintRow(L, x.pz.no, round === 1 ? firstHint(p, x.pz, x.res) : secondHint(x.res)); });
  }

  // ---------- the solutions: as many grids to a page as stay readable ----------
  function solutions(L, list) {
    var p = L.project, S = L.S;
    var ready = list.filter(function (x) { return x.res && x.res.grid; });
    if (!ready.length) return;
    L.page('solutions', 'Solutions', 'Solutions');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Solutions');
    var maxR = 1, maxC = 1;
    ready.forEach(function (x) { maxR = Math.max(maxR, x.res.grid.rows); maxC = Math.max(maxC, x.res.grid.cols); });
    var labS = Math.max(8, S.small * 1.1), labH = labS * 2.9, gapX = S.b * 1.2, gapY = S.b * 0.8;
    function cellFor(cols, rows, top) {
      var pg = L.pg, w = (pg.w - gapX * (cols - 1)) / cols, h = (pg.cb - top - gapY * (rows - 1)) / rows;
      return Math.min(30, w / maxC, (h - labH) / maxR);
    }
    var options = [[3, 4], [3, 3], [2, 3], [2, 2], [1, 2], [1, 1]];
    function pick(top) {
      for (var i = 0; i < options.length; i++) if (cellFor(options[i][0], options[i][1], top) >= 15) return options[i];
      return [1, 1];
    }
    var k = 0, first = true;
    while (k < ready.length) {
      if (!first) L.page('solutions', 'Solutions', 'Solutions');
      var top = L.y, opt = pick(top), cols = opt[0], rows = opt[1], cs = cellFor(cols, rows, top), pg = L.pg;
      var cw = (pg.w - gapX * (cols - 1)) / cols, rh = labH + maxR * cs;
      var rest = Math.max(0, (pg.cb - top - rows * rh) / rows);
      for (var r = 0; r < rows && k < ready.length; r++) {
        for (var c = 0; c < cols && k < ready.length; c++, k++) {
          var x = ready[k], g = x.res.grid, x0 = pg.x0 + c * (cw + gapX), y0 = top + r * (rh + Math.min(rest, gapY * 1.5));
          var d = p.puzzles[x.pz.id], title = x.pz.no + '  ' + (d.title.trim() || '');
          var tl = fit(title.trim(), 'sansBold', cw, labS, 7.5, 1), line = tl.lines[0];
          while (wid(line, tl.size, 'sansBold') > cw && line.length > 4) line = line.slice(0, -2).trim() + '…';
          pg.text(line, x0 + cw / 2, y0 + tl.size, tl.size, 'sansBold', { align: 'center' });
          var sw = fit(x.res.span, 'sans', cw, labS * 0.95, 7, 1);
          pg.text(sw.lines[0], x0 + cw / 2, y0 + labS * 2.2, sw.size, 'sans', { align: 'center', ls: 0 });
          drawGrid(pg, g, x0 + (cw - g.cols * cs) / 2, y0 + labH + (maxR - g.rows) * cs / 2, cs, 'solution');
          pg.meta.solCell = cs;
        }
      }
      first = false;
      L.y = pg.cb;
    }
  }

  function closingPage(L) {
    var p = L.project, S = L.S;
    L.page('closing', 'You Made It', 'You made it');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'You Made It!');
    if (p.ai.closing.length) p.ai.closing.forEach(function (t, i) { if (i) L.y += S.b * 0.5; L.para(P.countText(p, t, L.draft), 'serif', S.b, S.lead); });
    else if (L.draft) L.placeholder('Your closing note', 'It appears here after you paste the reply to the last prompt in step 3.', S.b * 7);
    else L.para('Every trail found and every letter used. Thank you for spending your puzzle time with this book. We hope you had as much fun solving these as we had making them.', 'serif', S.b, S.lead);
    if (L.pg.cb - L.y > S.b * 6) trailMark(L.pg, L.pg.cx, (L.y + L.pg.cb) / 2, Math.min(90, L.pg.w * 0.3));
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
    var ready = list.some(function (x) { return x.res && x.res.grid; });
    if (pl.hints && ready) {
      out.hints1 = L.pages.length + 1;
      sections.push({ page: out.hints1, title: 'First Hints' });
      hintsSection(L, list, 1);
      out.hints2 = L.pages.length + 1;
      sections.push({ page: out.hints2, title: 'Second Hints' });
      hintsSection(L, list, 2);
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

  CX.layout = { PRINT: PRINT, layoutBook: layoutBook, wrap: wrap, fit: fit, sizes: sizes, drawGrid: drawGrid };
})(typeof window !== 'undefined' ? window : globalThis);
