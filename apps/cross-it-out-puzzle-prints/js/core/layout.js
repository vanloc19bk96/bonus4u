/*
 * Page layout: turns the project and its puzzles into pages of simple drawing items, measured
 * with the real font metrics, so the SVG preview and the PDF place every word identically.
 *
 * Items (lengths in points, y down):
 *   { t:'text', x, y, str, font, size, ink?, ls? (letter spacing), hs? (horizontal scale) }
 *   { t:'line', x1, y1, x2, y2, w, ink?, dash?, cap? }
 *   { t:'rect', x, y, w, h, mode:'fill'|'stroke', ink?, lw?, dash? }
 *   { t:'ellipse', cx, cy, rx, ry, mode, ink?, lw? }
 *   { t:'poly', pts:[x,y,...], closed, mode, ink?, lw? }
 * ink is the gray level (1 = black, default). Nothing is lighter than 10% gray, no line is
 * thinner than 0.75 pt and no text is smaller than 7 pt: the KDP rules.
 *
 * Book order: title, copyright, welcome and how to play (with a worked example), clue guide,
 * good to know, contents, then each level as a part (divider, puzzles), solutions, notes, thanks.
 * In the two-page layout every puzzle starts on a left-hand page so its clues and line-up face
 * each other.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var KDP = CX.kdp, C = CX.clues, U = CX.util;
  var PT = 72;
  var F = null;

  function r2(v) { return Math.round(v * 100) / 100; }
  function txt(str, font) { return CX.metrics.printable(String(str == null ? '' : str), F[font]); }
  function wid(str, size, font, ls, hs) { return F[font].width(txt(str, font), size, ls || 0) * (hs || 1); }

  function wrap(str, size, font, maxW, ls) {
    var words = String(str).split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur && wid(t, size, font, ls) > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // Mixed runs [{ str, font, size, ink }] wrapped to a width. Returns lines of placed pieces.
  function wrapRuns(runs, maxW) {
    var words = [];
    runs.forEach(function (r) {
      String(r.str).split(/(\s+)/).forEach(function (w) {
        if (!w) return;
        if (/^\s+$/.test(w)) { if (words.length) words[words.length - 1].space = true; return; }
        words.push({ str: w, font: r.font, size: r.size, ink: r.ink, space: false });
      });
    });
    var lines = [], cur = [], x = 0;
    words.forEach(function (w) {
      var ww = wid(w.str, w.size, w.font);
      var prev = cur[cur.length - 1];
      var gap = prev && prev.space ? wid(' ', prev.size, prev.font) : 0;
      if (cur.length && x + gap + ww > maxW) { lines.push(cur); cur = []; x = 0; gap = 0; }
      cur.push({ str: w.str, font: w.font, size: w.size, ink: w.ink, x: x + gap, space: w.space });
      x += gap + ww;
    });
    if (cur.length) lines.push(cur);
    return lines;
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
    this.cb = this.y1 - L.foot;          // content bottom, above the page number
    this.cx = (this.x0 + this.x1) / 2;
    this.w = this.x1 - this.x0;
    this.items = []; this.kind = kind; this.label = label || kind; this.meta = {};
    this.folio = false;
    L.pages.push(this);
  }
  Page.prototype.text = function (str, x, y, size, font, o) {
    o = o || {};
    var s = txt(String(str), font);
    if (!s) return 0;
    var w = F[font].width(s, size, o.ls || 0) * (o.hs || 1);
    if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w;
    var it = { t: 'text', x: r2(x), y: r2(y), str: s, font: font, size: r2(size) };
    if (o.ls) it.ls = r2(o.ls);
    if (o.hs && o.hs !== 1) it.hs = r2(o.hs);
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
    this.items.push({ t: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), mode: 'fill', ink: ink });
  };
  Page.prototype.dot = function (cx, cy, r, filled, lw) {
    this.items.push(filled
      ? { t: 'ellipse', cx: r2(cx), cy: r2(cy), rx: r2(r), ry: r2(r), mode: 'fill' }
      : { t: 'ellipse', cx: r2(cx), cy: r2(cy), rx: r2(r), ry: r2(r), mode: 'stroke', lw: Math.max(KDP.MIN_LINE_PT, lw || 0.9) });
  };
  Page.prototype.ring = function (cx, cy, rx, ry, lw, ink) {
    var it = { t: 'ellipse', cx: r2(cx), cy: r2(cy), rx: r2(rx), ry: r2(ry), mode: 'stroke', lw: Math.max(KDP.MIN_LINE_PT, lw || 1) };
    if (ink != null && ink !== 1) it.ink = ink;
    this.items.push(it);
  };
  Page.prototype.poly = function (pts, ink, mode, lw) {
    var it = { t: 'poly', pts: pts.map(r2), closed: true, mode: mode || 'fill' };
    if (ink != null && ink !== 1) it.ink = ink;
    if (mode === 'stroke') it.lw = Math.max(KDP.MIN_LINE_PT, lw || 0.75);
    this.items.push(it);
  };

  // ---------- small pieces ----------
  // A rotated rectangle (the tape on the note card).
  function tape(pg, cx, cy, w, h, deg, ink) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), pts = [];
    [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].forEach(function (p) { pts.push(cx + p[0] * c - p[1] * s, cy + p[0] * s + p[1] * c); });
    pg.poly(pts, ink);
  }

  // Level dots, right-aligned at x (or centered); returns the width used.
  function dots(pg, x, y, n, size, align) {
    var r = size * 0.32, gap = size * 0.95, total = gap * 3 + r * 2;
    var x0 = align === 'center' ? x - total / 2 : align === 'left' ? x : x - total;
    for (var i = 0; i < 4; i++) pg.dot(x0 + r + i * gap, y - size * 0.33, r, i < n, 0.9);
    return total;
  }

  function ornament(pg, cx, y, half, ink) {
    pg.line(cx - half, y, cx - 7, y, 0.75, ink);
    pg.line(cx + 7, y, cx + half, y, 0.75, ink);
    pg.poly([cx, y - 3.4, cx + 3.4, y, cx, y + 3.4, cx - 3.4, y], ink);
  }

  function labelRule(pg, label, y, size) {
    var ls = size * 0.18, w = wid(label, size, 'sansBold', ls);
    pg.text(label, pg.cx, y, size, 'sansBold', { align: 'center', ls: ls });
    var half = Math.min(pg.w / 2 - 6, w / 2 + 70);
    pg.line(pg.cx - half, y - size * 0.33, pg.cx - w / 2 - 10, y - size * 0.33, 0.75, 0.5);
    pg.line(pg.cx + w / 2 + 10, y - size * 0.33, pg.cx + half, y - size * 0.33, 0.75, 0.5);
  }

  // A heading with room under it, used by the text pages.
  function heading(pg, str, y, L) {
    var size = L.sz(22);
    var lines = wrap(str, size, 'serifBold', pg.w);
    lines.forEach(function (l, i) { pg.text(l, pg.cx, y + i * size * 1.15, size, 'serifBold', { align: 'center' }); });
    y += (lines.length - 1) * size * 1.15 + size * 0.75;
    ornament(pg, pg.cx, y, 46, 0.6);
    return y + size * 1.1;
  }

  // Text that flows from page to page. newPage() makes the next page.
  function Flow(L, kind, label, newPage) {
    this.L = L; this.kind = kind; this.label = label;
    this.make = newPage || function () { var p = new Page(L, kind, label); p.folio = true; return p; };
    this.pg = this.make();
    this.y = this.pg.y0 + 6;
  }
  Flow.prototype.room = function (h) {
    if (this.y + h > this.pg.cb) { this.pg = this.make(); this.y = this.pg.y0 + 6; return true; }
    return false;
  };
  Flow.prototype.para = function (str, size, font, o) {
    o = o || {};
    var pg = this.pg, lead = size * (o.lead || 1.42), indent = o.indent || 0;
    var lines = wrap(str, size, font, pg.w - indent * 2);
    this.room(Math.min(lines.length, 3) * lead);
    for (var i = 0; i < lines.length; i++) {
      if (this.room(lead)) pg = this.pg;
      pg = this.pg;
      this.y += lead;
      pg.text(lines[i], o.align === 'center' ? pg.cx : pg.x0 + indent, this.y - lead * 0.28, size, font, { align: o.align, ink: o.ink });
    }
    this.y += o.after == null ? size * 0.6 : o.after;
  };
  Flow.prototype.runs = function (runs, o) {
    o = o || {};
    var pg = this.pg, indent = o.indent || 0, hang = o.hang || 0;
    var size = runs[0].size, lead = size * (o.lead || 1.42);
    var lines = wrapRuns(runs, pg.w - indent - hang);
    if (o.keep) this.room(lines.length * lead);
    var self = this;
    lines.forEach(function (ln, li) {
      self.room(lead);
      pg = self.pg;
      self.y += lead;
      var x0 = pg.x0 + indent + (li ? hang : 0);
      ln.forEach(function (w) { pg.text(w.str, x0 + w.x, self.y - lead * 0.28, w.size, w.font, { ink: w.ink }); });
    });
    this.y += o.after == null ? size * 0.5 : o.after;
  };

  // ---------- the worked example on the how-to page ----------
  var EXAMPLE = {
    title: 'The Picnic Basket',
    story: 'One thing never made it into the picnic basket. What was left behind?',
    options: ['Apple', 'Blanket', 'Cheese', 'Fork', 'Grapes', 'Napkin', 'Plate', 'Sandwich'],
    clues: [{ type: 'longer', param: 5 }, { type: 'has', param: 'P' }]
  };
  function example() {
    var infos = EXAMPLE.options.map(C.info);
    var by = EXAMPLE.options.map(function () { return 0; });
    var clues = EXAMPLE.clues.map(function (c, ci) {
      var r = C.evaluate(c, infos, []);
      r.forEach(function (v, i) { if (v === C.YES && !by[i]) by[i] = ci + 1; });
      return { text: C.TYPES[c.type].text(c.param), result: r };
    });
    var answer = by.indexOf(0);
    return { title: EXAMPLE.title, story: EXAMPLE.story, options: EXAMPLE.options, clues: clues, by: by, answer: answer };
  }

  function exampleBox(fl, L) {
    var ex = example(), pg, s = L.sz(10.5);
    var cols = 4, bw, bh = s * 2.2, gap = 6;
    var clueH = ex.clues.length * s * 1.5;
    var n1 = ex.by.filter(function (b) { return b === 1; }).length, n2 = ex.by.filter(function (b) { return b === 2; }).length;
    var expl = 'Clue 1 crosses out ' + C.num(n1) + ' options (the little numbers show which clue struck each one). Clue 2 crosses out ' + C.num(n2) +
      ' more. Only ' + ex.options[ex.answer].toUpperCase() + ' is left standing, so the answer is ' + ex.options[ex.answer] + '.';
    var explLines = wrap(expl, s * 0.88, 'serif', fl.pg.w - 36);
    var storyN = wrap(EXAMPLE.story, s * 0.92, 'serif', fl.pg.w - 24).length;
    var h = s * 1.9 + s * 1.6 + s * 1.45 + s * 1.6 + (storyN - 1) * s * 1.25 + clueH + 12 + 2 * (bh + gap) + s * 0.9 + explLines.length * s * 1.25 + s * 1.2;
    if (fl.room(h + 10)) {
      // the example starts a fresh page: give it a heading of its own
      fl.y = heading(fl.pg, 'A Worked Example', fl.pg.y0 + L.sz(26), L);
    }
    pg = fl.pg;
    var top = fl.y + 6, x = pg.x0, w = pg.w;
    pg.box(x, top, w, h, 1);
    var y = top + s * 1.9;
    pg.text('WORKED EXAMPLE', pg.cx, y, s * 0.82, 'sansBold', { align: 'center', ls: s * 0.18, ink: 0.75 });
    y += s * 1.6;
    pg.text(ex.title, pg.cx, y, s * 1.2, 'serifBold', { align: 'center' });
    y += s * 1.45;
    var storyLines = wrap(ex.story, s * 0.92, 'serif', w - 24);
    storyLines.forEach(function (l, i) { pg.text(l, pg.cx, y + i * s * 1.25, s * 0.92, 'serif', { align: 'center', ink: 0.85 }); });
    y += s * 1.6 + (storyLines.length - 1) * s * 1.25;
    pg.text('CROSS IT OUT IF…', pg.cx, y, s * 0.82, 'sansBold', { align: 'center', ls: s * 0.15 });
    ex.clues.forEach(function (c, i) {
      y += s * 1.5;
      pg.text((i + 1) + '.  ' + c.text, pg.cx, y, s, 'serif', { align: 'center' });
    });
    y += 12;
    bw = (w - 28 - gap * (cols - 1)) / cols;
    ex.options.forEach(function (o, i) {
      var cx0 = x + 14 + (i % cols) * (bw + gap), cy0 = y + Math.floor(i / cols) * (bh + gap);
      var isAns = i === ex.answer;
      pg.box(cx0, cy0, bw, bh, isAns ? 2 : 0.75, isAns ? 1 : 0.6);
      var label = o.toUpperCase(), fs = Math.min(s * 0.9, (bw - 16) / Math.max(1, wid(label, 1, 'sansBold')));
      var tw = pg.text(label, cx0 + bw / 2, cy0 + bh / 2 + fs * 0.35, fs, 'sansBold', { align: 'center', ink: isAns ? 1 : 0.7 });
      if (!isAns) {
        pg.line(cx0 + bw / 2 - tw / 2 - 3, cy0 + bh / 2, cx0 + bw / 2 + tw / 2 + 3, cy0 + bh / 2, 1.2);
        // which clue crossed it out: a small number in the corner
        pg.fill(cx0 + bw - 9.5, cy0 - 3.5, 11, 11, 1);
        pg.text(String(ex.by[i]), cx0 + bw - 4, cy0 + 4.6, 7.5, 'sansBold', { align: 'center', ink: 0 });
      } else pg.box(cx0 + 2.5, cy0 + 2.5, bw - 5, bh - 5, 0.75);
    });
    y += 2 * (bh + gap) + s * 0.9;
    explLines.forEach(function (l) { y += s * 1.25; pg.text(l, pg.cx, y, s * 0.88, 'serif', { align: 'center' }); });
    fl.y = top + h + 8;
    // the same steps in words, when the page has room for them
    var ss = L.sz(10.5), lead = ss * 1.42;
    var steps = ex.clues.map(function (c, ci) {
      var gone = ex.options.filter(function (o, i) { return ex.by[i] === ci + 1; }).map(function (o) { return o.toUpperCase(); });
      return [{ str: 'Clue ' + (ci + 1) + '.', font: 'sansBold', size: ss }, { str: ' “' + c.text + '” crosses out ' + gone.join(', ') + '.', font: 'serif', size: ss }];
    });
    steps.push([{ str: 'Answer.', font: 'sansBold', size: ss }, { str: ' ' + ex.options[ex.answer].toUpperCase() + ' is the only option no clue describes.', font: 'serif', size: ss }]);
    var need = steps.reduce(function (a, r) { return a + wrapRuns(r, fl.pg.w).length * lead + 3; }, ss * 3);
    if (fl.y + need > fl.pg.cb) return;
    fl.y += ss * 0.8;
    fl.para('STEP BY STEP', L.sz(9.5), 'sansBold', { after: 2 });
    steps.forEach(function (r) { fl.runs(r, { hang: ss * 1.2, after: 3 }); });
  }

  // ---------- front matter ----------
  function titlePage(L) {
    var s = L.setup, pg = new Page(L, 'title', 'Title page');
    var title = (s.title || '').trim() || 'Cross It Out If…';
    var maxW = pg.w * 0.92, size = L.sz(54), lines;
    for (; size > 20; size -= 1) {
      lines = wrap(title.toUpperCase(), size, 'sansBold', maxW / 0.86);
      if (lines.length <= 3 && lines.every(function (l) { return wid(l, size, 'sansBold', 0, 0.86) <= maxW; })) break;
    }
    var y = pg.y0 + pg.H * 0.16;
    lines.forEach(function (l) { y += size * 0.95; pg.text(l, pg.cx, y, size, 'sansBold', { align: 'center', hs: 0.86 }); });
    y += size * 0.5;
    var sub = CX.book.subtitle(L.project, L.built);
    if (sub) {
      var ss = L.sz(13);
      wrap(sub, ss, 'serif', pg.w * 0.85).forEach(function (l) { y += ss * 1.4; pg.text(l, pg.cx, y, ss, 'serif', { align: 'center' }); });
    }
    y += 26;
    ornament(pg, pg.cx, y, 60, 0.7);
    // a tiny line-up with two options crossed out
    var first = L.built.all[0], words = first ? first.options.slice(0, 6).map(function (o) { return o.toUpperCase(); }) : ['APPLE', 'BOOK', 'PENCIL', 'TEDDY', 'BOTTLE', 'NOTEPAD'];
    var ws = L.sz(12), rowY = y + 40;
    [[0, 1, 2], [3, 4, 5]].forEach(function (row, ri) {
      var parts = row.map(function (i) { return words[i]; }).filter(Boolean);
      var gapW = 18, total = parts.reduce(function (a, p) { return a + wid(p, ws, 'sans', ws * 0.12); }, 0) + gapW * (parts.length - 1);
      var x = pg.cx - total / 2;
      parts.forEach(function (p, i) {
        var w = pg.text(p, x, rowY + ri * ws * 2.1, ws, 'sans', { ls: ws * 0.12 });
        if ((ri === 0 && i === 0) || (ri === 1 && i === 1)) pg.line(x - 3, rowY + ri * ws * 2.1 - ws * 0.32, x + w + 3, rowY + ri * ws * 2.1 - ws * 0.38, 1.6);
        x += w + gapW;
      });
    });
    var author = (s.author || '').trim();
    if (author) {
      var as = L.sz(13);
      while (as > KDP.MIN_FONT_PT + 1 && wid(author.toUpperCase(), as, 'sansBold', as * 0.2) > pg.w) as -= 0.25;
      pg.text(author.toUpperCase(), pg.cx, pg.cb - 10, as, 'sansBold', { align: 'center', ls: as * 0.2 });
    }
  }

  function copyrightPage(L) {
    var s = L.setup, pg = new Page(L, 'copyright', 'Copyright');
    var year = String(L.project.createdAt || '').slice(0, 4) || String(new Date().getFullYear());
    var author = (s.author || '').trim() || 'The author';
    var size = L.sz(9.5), lead = size * 1.5;
    var paras = [
      (s.title || 'Cross It Out If…').trim(),
      'Copyright © ' + year + ' ' + author + '. All rights reserved.',
      'No part of this book may be reproduced, stored or shared in any form or by any means without the written permission of the author, except for the reader’s personal use of the puzzles inside.',
      'Every puzzle, story and clue in this book is an original creation. Any resemblance to real people or events is a coincidence.',
      'Every puzzle was checked option by option: each one has exactly one answer, and every clue is needed to find it.',
      'First edition.'
    ];
    var lines = [];
    paras.forEach(function (p, i) { if (i) lines.push(null); lines = lines.concat(wrap(p, size, 'serif', pg.w * 0.9)); });
    var y = pg.cb - lines.length * lead;
    lines.forEach(function (l) { y += lead; if (l) pg.text(l, pg.x0, y, size, 'serif'); });
  }

  function welcome(L) {
    var s = L.setup, sz = L.sz;
    var fl = new Flow(L, 'welcome', 'How to play');
    L.front.push({ title: 'How to play', page: fl.pg.num });
    fl.y = heading(fl.pg, s.audience === 'kids' ? 'Welcome, Young Detective!' : 'Welcome, Detective!', fl.pg.y0 + sz(26), L);
    var body = sz(11.5);
    fl.para('Every case in this book gives you three things: a little mystery, a line-up of possible answers and a short list of “Cross it out if…” clues. Your job is to rule out the wrong answers until only one is left standing.', body, 'serif');
    fl.y += 4;
    fl.para('HOW TO PLAY', sz(10), 'sansBold', { after: 2 });
    var steps = [
      'Read the mystery. It sets the scene, but it never hides a clue.',
      'Read the first “Cross it out if…” clue.',
      'Cross out every option in the line-up that the clue describes.',
      'Do the same with each clue in turn. Options already crossed out stay crossed out.',
      'When every clue is used, exactly one option is left. Write it in the answer box. Case closed!'
    ];
    steps.forEach(function (st, i) {
      fl.runs([{ str: (i + 1) + '.', font: 'sansBold', size: body }, { str: ' ' + st, font: 'serif', size: body }], { hang: body * 1.2, after: 2 });
    });
    fl.y += 8;
    // the golden rule
    var gr = 'Cross out what a clue describes. Never cross out what it does not describe. The answer is the one option no clue describes.';
    var gs = sz(10.5), gl = wrap(gr, gs, 'serif', fl.pg.w - 36), gh = gl.length * gs * 1.42 + gs * 2.6;
    fl.room(gh + 6);
    var pg = fl.pg, top = fl.y;
    pg.fill(pg.x0, top, pg.w, gh, 0.12);
    pg.text('THE GOLDEN RULE', pg.cx, top + gs * 1.55, gs * 0.85, 'sansBold', { align: 'center', ls: gs * 0.16 });
    gl.forEach(function (l, i) { pg.text(l, pg.cx, top + gs * 1.55 + (i + 1) * gs * 1.42, gs, 'serif', { align: 'center' }); });
    fl.y = top + gh + 12;
    fl.para(s.layout === 'spread'
      ? 'In this book the clues sit on the left-hand page and the line-up faces them on the right, so you can see both at once.'
      : 'Each case fits on a single page: the mystery, the clues and the line-up together.', sz(10.5), 'serif', { ink: 0.85 });
    fl.y += 4;
    exampleBox(fl, L);
  }

  function guide(L) {
    var sz = L.sz;
    var fl = new Flow(L, 'guide', 'Clue guide');
    L.front.push({ title: 'Clue guide', page: fl.pg.num });
    fl.y = heading(fl.pg, 'Clue Guide', fl.pg.y0 + sz(26), L);
    fl.para('How every kind of clue in this book works. Come back to this page whenever a clue makes you pause.', sz(11), 'serif', { align: 'center', ink: 0.85 });
    fl.y += 6;
    C.guideFor(L.built.usedTypes).forEach(function (g) {
      fl.room(sz(10) * 5);
      fl.para(g.head.toUpperCase(), sz(9.5), 'sansBold', { after: 1 });
      fl.para(g.text, sz(11), 'serif', { after: sz(8) });
    });
    if (!L.built.all.length) fl.para('The clue types used in your puzzles appear here.', sz(11), 'serif');
  }

  function faq(L) {
    var s = L.setup, sz = L.sz;
    var fl = new Flow(L, 'faq', 'Good to know');
    L.front.push({ title: 'Good to know', page: fl.pg.num });
    fl.y = heading(fl.pg, 'Good to Know', fl.pg.y0 + sz(26), L);
    var qa = [
      ['Do the titles and stories give the answer away?', 'No. They set the scene and nothing more. Every answer comes from the “Cross it out if…” clues alone.'],
      [s.layout === 'spread' ? 'Where does one option end and the next begin?' : 'How do I mark the line-up?',
        s.layout === 'spread' ? 'Options are separated by dots ( • ), and an option never breaks across two lines. Some options are two or three words long: everything between two dots, or between a dot and the end of a line, is one option.' : 'Each option sits in its own box. Draw a line through the boxes you cross out, and circle the one that is left.'],
      ['What do the dots next to each case mean?', 'They show how tricky the case is, from one dot for a warm-up to four dots for a master file. ' + levelsLine(L) + '.'],
      ['What if two options are still standing?', 'Read the clues again slowly and check every option against each one. When every clue is applied, exactly one option is always left.'],
      ['Pen or pencil?', 'Whatever you like. A pencil lets you start again; a pen makes the final cross-out very satisfying.'],
      ['Where are the solutions?', 'At the back of the book, listed by case number' + (s.pages.solutions === 'explained' ? ', with every crossing-out explained' : '') + '. No peeking until your answer is written in!']
    ];
    qa.forEach(function (q) {
      fl.room(sz(11) * 5);
      fl.para(q[0], sz(11.5), 'serifBold', { after: 1 });
      fl.para(q[1], sz(11), 'serif', { after: sz(9) });
    });
  }

  function levelsLine(L) {
    return L.built.levels.filter(function (lv) { return lv.puzzles.length; }).map(function (lv) {
      return lv.level.name.replace(/^The /, '') + ': ' + C.num(lv.level.clues) + ' clues';
    }).join('; ');
  }

  function contents(L) {
    var sz = L.sz;
    var pg = new Page(L, 'contents', 'Contents');
    pg.folio = true;
    L.front.push({ title: 'Contents', page: pg.num });
    var y = heading(pg, 'Contents', pg.y0 + sz(26), L) + 6;
    var rows = [];
    L.front.forEach(function (f) { if (f.title !== 'Contents' && f.page > 0) rows.push({ t: f.title, p: f.page }); });
    (L.refs.parts || []).forEach(function (pt) { rows.push({ t: pt.title, sub: pt.sub, p: pt.page, strong: true }); });
    if (L.refs.solutions) rows.push({ t: 'Solutions', p: L.refs.solutions, strong: true });
    if (L.refs.notes) rows.push({ t: 'Notes', p: L.refs.notes });
    var size = sz(11.5), lead = size * (rows.length > 12 ? 1.9 : 2.3);
    rows.forEach(function (r) {
      y += lead;
      var w = pg.text(r.t, pg.x0, y, size, r.strong ? 'serifBold' : 'serif');
      var pw = wid(String(r.p), size, 'sans');
      pg.text(String(r.p), pg.x1, y, size, 'sans', { align: 'right' });
      if (r.sub) {
        var sw = pg.text(r.sub, pg.x0 + w + 8, y, size * 0.82, 'sans', { ink: 0.7 });
        w += 8 + sw;
      }
      if (pg.x1 - pw - 6 > pg.x0 + w + 6) pg.line(pg.x0 + w + 6, y - 1, pg.x1 - pw - 6, y - 1, 0.75, 0.5, [0.75, 2.6]);
    });
  }

  // ---------- parts ----------
  var PART_WORDS = ['One', 'Two', 'Three', 'Four'];
  function divider(L, lv, idx, from, to) {
    var sz = L.sz, pg = new Page(L, 'part', 'Part ' + PART_WORDS[idx]);
    var x = pg.x0, y = pg.y0, w = pg.w, h = pg.cb - pg.y0;
    pg.box(x + 1, y + 1, w - 2, h - 2, 1.4);
    pg.box(x + 6, y + 6, w - 12, h - 12, 0.75);
    var cy = y + h * 0.36;
    pg.text('PART ' + PART_WORDS[idx].toUpperCase(), pg.cx, cy, sz(11), 'sansBold', { align: 'center', ls: sz(11) * 0.3 });
    ornament(pg, pg.cx, cy + sz(14), 56, 0.7);
    var ts = sz(30);
    while (ts > 16 && wid(lv.name, ts, 'serifBold') > w - 40) ts -= 1;
    pg.text(lv.name, pg.cx, cy + sz(14) + ts * 1.25, ts, 'serifBold', { align: 'center' });
    var yy = cy + sz(14) + ts * 1.25 + sz(26);
    pg.text('CASES ' + from + '–' + to, pg.cx, yy, sz(11), 'sansBold', { align: 'center', ls: sz(11) * 0.25 });
    dots(pg, pg.cx, yy + sz(26), lv.dots, sz(16), 'center');
    var bs = sz(12);
    yy += sz(26) + sz(18);
    wrap(lv.blurb, bs, 'serif', w - 70).forEach(function (l) { yy += bs * 1.45; pg.text(l, pg.cx, yy, bs, 'serif', { align: 'center', ink: 0.85 }); });
    yy += bs * 1.6;
    var spec = C.num(lv.clues).replace(/^./, function (c) { return c.toUpperCase(); }) + ' clues  ·  ' + lv.lineup[0] + ' to ' + lv.lineup[1] + ' options';
    pg.text(spec, pg.cx, yy, sz(10), 'sans', { align: 'center', ink: 0.7 });
    return pg;
  }

  // ---------- a puzzle across two pages ----------
  function caseHeader(pg, label, pz, L, s) {
    var y = pg.y0 + s * 1.05;
    pg.text(label, pg.x0, y, s, 'sansBold', { ls: s * 0.18, ink: 0.85 });
    var lv = CX.engine.level(pz.level, L.setup.audience);
    var dw = dots(pg, pg.x1, y, lv.dots, s);
    pg.text(lv.short.toUpperCase(), pg.x1 - dw - 7, y, s * 0.85, 'sansBold', { align: 'right', ls: s * 0.14, ink: 0.7 });
    pg.line(pg.x0, y + s * 0.75, pg.x1, y + s * 0.75, 0.75, 0.4);
    return y + s * 0.75;
  }

  function spreadLeft(L, pz, k) {
    var sz = function (v) { return L.sz(v) * k; };
    var pg = new Page(L, 'puzzle', 'Case ' + pz.no);
    pg.folio = true;
    pg.meta = { caseNo: pz.no, answer: null };
    var y = caseHeader(pg, 'CASE ' + pz.no, pz, L, L.sz(9));
    // title
    var tsz = sz(23), title = pz.title.toUpperCase(), tl;
    for (; tsz > sz(14); tsz -= 0.5) { tl = wrap(title, tsz, 'sansBold', pg.w / 0.9); if (tl.length <= 2 && tl.every(function (l) { return wid(l, tsz, 'sansBold', tsz * 0.03, 0.9) <= pg.w; })) break; }
    y += tsz * 1.55;
    tl.forEach(function (l, i) { pg.text(l, pg.cx, y + i * tsz * 1.05, tsz, 'sansBold', { align: 'center', hs: 0.9, ls: tsz * 0.03 }); });
    y += (tl.length - 1) * tsz * 1.05;
    // story
    var ss = sz(12.2);
    if (pz.story) {
      y += ss * 0.7;
      wrap(pz.story, ss, 'serif', pg.w * 0.94).forEach(function (l) { y += ss * 1.38; pg.text(l, pg.cx, y, ss, 'serif', { align: 'center' }); });
    }
    // the note card
    var ansH = sz(40), cardTop = y + sz(30), cardBot = pg.cb - ansH - sz(22);
    var cx0 = pg.x0 + 8, cw = pg.w - 16;
    var cs = sz(12.5), lead = cs * 1.36, pad = sz(20);
    var hs = sz(13.5);
    var blocks = pz.clues.map(function (c) { return wrap(c.text, cs, 'sans', cw - pad * 2 - cs * 2); });
    var need = pad + hs * 1.2 + sz(14) + blocks.reduce(function (a, b) { return a + b.length * lead + cs * 0.55; }, 0) + pad * 0.6;
    if (cardBot - cardTop < need) return null;   // does not fit at this scale
    pg.fill(cx0 + 3.5, cardTop + 3.5, cw, cardBot - cardTop, 0.18);
    pg.fill(cx0, cardTop, cw, cardBot - cardTop, 0);
    pg.box(cx0, cardTop, cw, cardBot - cardTop, 0.75, 0.6);
    // the tape strips stay inside the card's width and below the text above it
    var tw = Math.min(sz(56), cw * 0.22), th = Math.min(sz(15), tw * 0.27);
    tape(pg, cx0 + tw * 0.5, cardTop + 2, tw, th, -32, 0.32);
    tape(pg, cx0 + cw - tw * 0.5, cardTop + 2, tw, th, 32, 0.32);
    var yy = cardTop + pad + hs;
    pg.text('CROSS IT OUT IF…', cx0 + pad, yy, hs, 'sansBold', { ls: hs * 0.08 });
    yy += sz(14);
    blocks.forEach(function (lines, i) {
      lines.forEach(function (l, li) {
        yy += lead;
        if (li === 0) {
          pg.ring(cx0 + pad + cs * 0.55, yy - cs * 0.34, cs * 0.62, cs * 0.62, 0.9);
          pg.text(String(i + 1), cx0 + pad + cs * 0.55, yy, cs * 0.8, 'sansBold', { align: 'center' });
        }
        pg.text(l, cx0 + pad + cs * 1.9, yy, cs, 'sans');
      });
      yy += cs * 0.55;
    });
    // scribble lines below the clues
    for (var ly = yy + sz(26); ly < cardBot - sz(14); ly += sz(22)) pg.line(cx0 + pad, ly, cx0 + cw - pad, ly, 0.75, 0.2);
    answerBox(pg, pg.cb - ansH, ansH, L, k);
    return pg;
  }

  function answerBox(pg, top, h, L, k) {
    var s = L.sz(10.5) * (k || 1);
    var x = pg.x0 + 8, w = pg.w - 16;
    pg.box(x, top, w, h, 1, 1, [4, 3]);
    var by = top + h / 2 + s * 0.36;
    var lw = pg.text('THE ANSWER IS…', x + 14, by, s, 'sansBold', { ls: s * 0.14 });
    pg.line(x + 14 + lw + 12, by + 2, x + w - 14, by + 2, 0.75, 0.7);
  }

  function spreadRight(L, pz) {
    var pg = new Page(L, 'lineup', 'Case ' + pz.no + ' line-up');
    pg.folio = true;
    pg.meta = { caseNo: pz.no, answerIndex: pz.answer };
    var y = caseHeader(pg, 'THE LINE-UP  ·  CASE ' + pz.no, pz, L, L.sz(9));
    var top = y + L.sz(16), bottom = pg.cb - L.sz(30);
    var words = pz.options.map(function (o) { return o.toUpperCase(); });
    // the biggest type at which the line-up fills the page with comfortable room to cross out
    var size = L.sz(24), lines, lead, ls;
    for (; size >= L.sz(9.5); size -= 0.25) {
      ls = size * 0.08;
      lines = flowWords(words, size, ls, pg.w);
      lead = Math.min(size * 3.1, (bottom - top) / Math.max(1, lines.length));
      if (lead >= size * 2.2) break;
    }
    var blockTop = top + Math.max(0, (bottom - top - lead * lines.length) * 0.35);
    lines.forEach(function (ln, li) {
      var by = blockTop + lead * li + lead * 0.62;
      var off = (pg.w - ln.width) / 2;
      ln.items.forEach(function (w) {
        if (w.bullet) pg.dot(pg.x0 + off + w.x + w.w / 2, by - size * 0.33, size * 0.11, true);
        else {
          pg.text(w.str, pg.x0 + off + w.x, by, size, 'sans', { ls: ls });
          if (w.idx === pz.answer) pg.meta.answerBox = { x: pg.x0 + off + w.x - 3, y: by - size, w: w.w + 6, h: size * 1.35 };
        }
      });
    });
    var note = 'Cross out every option a clue describes. Circle the one left standing.', ns = L.sz(9.5);
    while (ns > KDP.MIN_FONT_PT && wid(note, ns, 'serif') > pg.w) ns -= 0.25;
    pg.text(note, pg.cx, pg.cb - ns * 0.4, ns, 'serif', { align: 'center', ink: 0.7 });
    return pg;
  }

  /*
   * Options in reading order, centred line by line, with a dot between neighbours on the same
   * line. An option never breaks across lines (unless it is wider than the page on its own),
   * so a line end separates options just as a dot does.
   */
  function flowWords(words, size, ls, maxW) {
    var gap = size * 0.6, bw = size * 0.24, lines = [], cur = null;
    function newLine() { cur = { items: [], width: 0 }; lines.push(cur); }
    newLine();
    words.forEach(function (w, i) {
      var ww = wid(w, size, 'sans', ls);
      var lead = cur.items.length ? gap * 2 + bw : 0;
      if (cur.items.length && cur.width + lead + ww > maxW) { newLine(); lead = 0; }
      if (lead) { cur.items.push({ bullet: true, x: cur.width + gap, w: bw }); cur.width += lead; }
      if (ww > maxW) { // a very long option: split at its spaces
        var parts = w.split(' ');
        parts.forEach(function (p, pi) {
          var pw = wid(p, size, 'sans', ls);
          if (cur.items.length && cur.width + pw > maxW) newLine();
          cur.items.push({ str: p, x: cur.width, w: pw, idx: i });
          cur.width += pw + (pi < parts.length - 1 ? wid(' ', size, 'sans') : 0);
        });
      } else {
        cur.items.push({ str: w, x: cur.width, w: ww, idx: i });
        cur.width += ww;
      }
    });
    return lines.filter(function (l) { return l.items.length; });
  }

  // ---------- a puzzle on one page ----------
  function single(L, pz, k) {
    var sz = function (v) { return L.sz(v) * k; };
    var pg = new Page(L, 'puzzle', 'Case ' + pz.no);
    pg.folio = true;
    pg.meta = { caseNo: pz.no, answerIndex: pz.answer };
    var y = caseHeader(pg, 'CASE No. ' + (pz.no < 10 ? '0' : '') + pz.no, pz, L, L.sz(9));
    var ts = sz(19), tl;
    for (; ts > sz(13); ts -= 0.5) { tl = wrap(pz.title, ts, 'serifBold', pg.w); if (tl.length <= 2) break; }
    y += ts * 1.4;
    tl.forEach(function (l, i) { pg.text(l, pg.cx, y + i * ts * 1.1, ts, 'serifBold', { align: 'center' }); });
    y += (tl.length - 1) * ts * 1.1 + ts * 0.6;
    ornament(pg, pg.cx, y, 40, 0.6);
    var ss = sz(11.2);
    if (pz.story) wrap(pz.story, ss, 'serif', pg.w * 0.9).forEach(function (l) { y += ss * 1.36; pg.text(l, pg.cx, y + ss * 0.4, ss, 'serif', { align: 'center', ink: 0.9 }); });
    y += ss * 2.1;
    var hs = sz(10);
    pg.text('CROSS IT OUT IF…', pg.cx, y, hs, 'sansBold', { align: 'center', ls: hs * 0.2 });
    var cs = sz(11.5), bx = pg.x0 + pg.w * 0.07, bw = pg.w * 0.86;
    y += cs * 0.4;
    pz.clues.forEach(function (c, i) {
      wrap(c.text, cs, 'serif', bw - cs * 1.8).forEach(function (l, li) {
        y += cs * 1.38;
        if (!li) pg.text(String(i + 1), bx + cs * 0.4, y, cs, 'sansBold', { align: 'center' });
        pg.text(l, bx + cs * 1.4, y, cs, 'serif');
      });
    });
    y += cs * 1.9;
    labelRule(pg, 'THE LINE-UP', y, sz(9.5));
    y += sz(10);
    // the grid: as many columns as the longest option allows
    var labels = pz.options.map(function (o) { return o.toUpperCase(); });
    var longest = labels.reduce(function (a, l) { return wid(l, 1, 'sansBold', 0.05) > wid(a, 1, 'sansBold', 0.05) ? l : a; }, '');
    var gap = sz(6), cols = labels.length > 24 ? 4 : 3, fsz;
    for (; cols >= 2; cols--) {
      var cw = (pg.w - gap * (cols - 1)) / cols;
      fsz = Math.min(sz(11.5), (cw - 10) / wid(longest, 1, 'sansBold', 0.05));
      if (fsz >= Math.max(KDP.MIN_FONT_PT + 1, sz(8))) break;
    }
    cols = Math.max(2, cols);
    var cellW = (pg.w - gap * (cols - 1)) / cols;
    var rows = Math.ceil(labels.length / cols);
    var ansH = sz(34);
    var room = pg.cb - ansH - sz(14) - y;
    // cells grow to fill the page (room to strike through), up to about three lines of type
    var cellH = Math.min(fsz * 3.2, sz(34), (room + gap) / rows - gap);
    cellH = Math.max(cellH, Math.min(fsz * 2.1, sz(19)));
    if (rows * (cellH + gap) - gap > room) {
      cellH = (room + gap) / rows - gap;
      if (cellH < fsz * 1.6) return null;
    }
    y += Math.max(0, room - rows * (cellH + gap) + gap) * 0.3;
    labels.forEach(function (l, i) {
      var r = Math.floor(i / cols), c = i % cols;
      var inRow = Math.min(cols, labels.length - r * cols);
      var off = (cols - inRow) * (cellW + gap) / 2;
      var x = pg.x0 + off + c * (cellW + gap), yy = y + r * (cellH + gap);
      pg.box(x, yy, cellW, cellH, 0.85, 0.75);
      pg.text(l, x + cellW / 2, yy + cellH / 2 + fsz * 0.36, fsz, 'sansBold', { align: 'center', ls: fsz * 0.05 });
      if (i === pz.answer) pg.meta.answerBox = { x: x - 2, y: yy - 2, w: cellW + 4, h: cellH + 4 };
    });
    answerBox(pg, pg.cb - ansH, ansH, L, k);
    return pg;
  }

  // Lays a puzzle out at the largest scale that fits (large print shrinks only when it must).
  function placePuzzle(L, pz) {
    var mark = L.pages.length;
    for (var k = 1; k >= 0.62; k -= 0.06) {
      var ok = L.setup.layout === 'spread' ? spreadLeft(L, pz, k) : single(L, pz, k);
      if (ok) {
        if (L.setup.layout === 'spread') spreadRight(L, pz);
        L.casePage[pz.no] = ok.num;
        return;
      }
      L.pages.length = mark;
    }
    // last resort: the smallest scale, whatever happens
    var pg = L.setup.layout === 'spread' ? spreadLeft(L, pz, 0.6) : single(L, pz, 0.6);
    if (!pg) { pg = new Page(L, 'puzzle', 'Case ' + pz.no); pg.text('Case ' + pz.no + ' is too long for this page size.', pg.cx, pg.cb / 2, 12, 'sans', { align: 'center' }); pg.meta.overflow = true; }
    if (L.setup.layout === 'spread') spreadRight(L, pz);
    L.casePage[pz.no] = pg.num;
  }

  // ---------- solutions ----------
  function solutions(L) {
    var s = L.setup, sz = L.sz;
    if (L.pages.length % 2 === 1) filler(L);
    var fl = new Flow(L, 'solutions', 'Solutions');
    L.refs.solutionsNow = fl.pg.num;
    fl.y = heading(fl.pg, 'Solutions', fl.pg.y0 + sz(26), L);
    if (s.pages.solutions === 'explained') {
      fl.para('For each case: the answer, then what every clue crosses out, in order.', sz(10.5), 'serif', { align: 'center', ink: 0.85, after: sz(10) });
      L.built.levels.forEach(function (lv) {
        if (!lv.puzzles.length) return;
        fl.room(sz(40));
        fl.para(lv.level.name.toUpperCase(), sz(9.5), 'sansBold', { after: sz(4) });
        lv.puzzles.forEach(function (pz) { explained(fl, pz, L); });
      });
    } else compact(fl, L);
  }

  function explained(fl, pz, L) {
    var sz = L.sz, ns = sz(9.2), steps = CX.engine.steps(pz);
    // keep a case together on one page
    var est = sz(11) * 1.6 + steps.reduce(function (a, st, i) {
      var runs = stepRuns(pz, st, i, ns);
      return a + wrapRuns(runs, fl.pg.w - ns * 1.6).length * ns * 1.42;
    }, 0) + sz(10);
    fl.room(est);
    var pg = fl.pg, hs = sz(10.5);
    fl.y += hs * 1.3;
    var lw = pg.text('CASE ' + pz.no, pg.x0, fl.y, hs * 0.85, 'sansBold', { ls: hs * 0.1 });
    var ans = pz.options[pz.answer].toUpperCase();
    var aw = wid(ans, hs, 'sansBold', hs * 0.06), lab = wid('ANSWER  ', hs * 0.78, 'sansBold', hs * 0.08);
    var titleRoom = pg.w - lw - 10 - aw - lab - 12;
    var title = pz.title;
    while (title.length > 4 && wid(title, hs, 'serifBold') > titleRoom) title = title.slice(0, -2).replace(/\s+\S*$/, '') + '…';
    pg.text(title, pg.x0 + lw + 10, fl.y, hs, 'serifBold');
    pg.text(ans, pg.x1, fl.y, hs, 'sansBold', { align: 'right', ls: hs * 0.06 });
    pg.text('ANSWER', pg.x1 - aw - 6, fl.y, hs * 0.78, 'sansBold', { align: 'right', ls: hs * 0.08, ink: 0.7 });
    fl.y += hs * 0.35;
    steps.forEach(function (st, i) { fl.runs(stepRuns(pz, st, i, ns), { hang: ns * 1.6, after: 0, lead: 1.42 }); });
    fl.y += sz(6);
    fl.pg.line(fl.pg.x0, fl.y, fl.pg.x1, fl.y, 0.75, 0.35, [0.75, 2.4]);
    fl.y += sz(2);
  }

  function stepRuns(pz, st, i, ns) {
    var crossed = st.map(function (p) { return pz.options[p].toUpperCase(); });
    return [
      { str: (i + 1) + '.', font: 'sansBold', size: ns },
      { str: ' ' + pz.clues[i].text + ':', font: 'serif', size: ns },
      { str: ' ' + crossed.join(', '), font: 'sans', size: ns * 0.95, ink: 0.85 }
    ];
  }

  function compact(fl, L) {
    var sz = L.sz, rs = sz(10.5), rowH = rs * 1.85;
    var items = [];
    L.built.levels.forEach(function (lv) {
      if (!lv.puzzles.length) return;
      items.push({ head: lv.level.name });
      lv.puzzles.forEach(function (pz) { items.push({ pz: pz }); });
    });
    var i = 0;
    while (i < items.length) {
      var pg = fl.pg, top = fl.y + 4, rows = Math.max(1, Math.floor((pg.cb - top) / rowH));
      var colW = (pg.w - 18) / 2;
      for (var col = 0; col < 2 && i < items.length; col++) {
        var x = pg.x0 + col * (colW + 18);
        for (var r = 0; r < rows && i < items.length; r++, i++) {
          var it = items[i], y = top + (r + 1) * rowH - rowH * 0.3;
          if (it.head) { pg.text(it.head.toUpperCase(), x, y, rs * 0.82, 'sansBold', { ls: rs * 0.12, ink: 0.75 }); continue; }
          var pz = it.pz;
          var nw = pg.text(String(pz.no), x + rs * 1.8, y, rs, 'sansBold', { align: 'right' });
          pg.text(pz.options[pz.answer].toUpperCase(), x + rs * 2.6, y, rs, 'sans', { ls: rs * 0.05 });
          pg.line(x, y + rowH * 0.32, x + colW, y + rowH * 0.32, 0.75, 0.25);
          void nw;
        }
      }
      if (i < items.length) { fl.pg = fl.make(); fl.y = fl.pg.y0 + 6; }
    }
  }

  // ---------- back matter ----------
  function notesPage(L, title) {
    var sz = L.sz, pg = new Page(L, 'notes', title || 'Notes');
    pg.folio = true;
    var y = heading(pg, title || 'Notes', pg.y0 + sz(26), L);
    for (var ly = y + sz(18); ly < pg.cb - 4; ly += sz(24)) pg.line(pg.x0, ly, pg.x1, ly, 0.75, 0.3);
    return pg;
  }

  // A page that only keeps the next page on the correct side.
  function filler(L) { return notesPage(L, 'Notes'); }

  function thanks(L) {
    var s = L.setup, sz = L.sz;
    var fl = new Flow(L, 'thanks', 'Thank you');
    fl.y = heading(fl.pg, s.audience === 'kids' ? 'Great Work, Detective!' : 'Thank You, Detective!', fl.pg.y0 + sz(60), L);
    fl.y += sz(10);
    var n = L.built.all.length;
    fl.para('You have reached the end of ' + (n ? n + ' cases' : 'the casebook') + '. We hope you enjoyed every satisfying cross-out as much as we enjoyed making them.', sz(12), 'serif', { align: 'center' });
    fl.y += sz(6);
    fl.para('If you did, a short review on Amazon would mean a lot. It helps other puzzle lovers find this book, and it tells us which kinds of cases you would like to see next.', sz(12), 'serif', { align: 'center' });
    fl.y += sz(16);
    ornament(fl.pg, fl.pg.cx, fl.y, 60, 0.7);
    if ((s.author || '').trim()) { fl.y += sz(30); fl.pg.text('— ' + s.author.trim(), fl.pg.cx, fl.y, sz(12), 'serif', { align: 'center' }); }
  }

  // ---------- the whole book ----------
  function compose(project, built, m, refs) {
    var s = project.setup, trim = KDP.trim(s.trim);
    var W = trim.w * PT, H = trim.h * PT;
    var base = Math.max(0.94, Math.min(1.18, Math.sqrt(W / 432)));
    var big = s.largePrint ? 1.22 : 1;
    var L = {
      project: project, setup: s, built: built, W: W, H: H, trim: trim,
      m: { inside: m.inside * PT, outside: m.outside * PT, top: m.top * PT, bottom: m.bottom * PT },
      foot: 22, pages: [], front: [], sections: [], refs: refs, casePage: {},
      sz: function (v) { return Math.round(v * base * big * 4) / 4; }
    };
    var pages = s.pages;
    titlePage(L);
    copyrightPage(L);
    if (pages.welcome) welcome(L);
    if (pages.guide) guide(L);
    if (pages.faq) faq(L);
    if (pages.contents) contents(L);
    var newRefs = { parts: [], solutions: 0, notes: 0 };
    built.levels.forEach(function (lv, idx) {
      if (!lv.puzzles.length) return;
      var from = lv.puzzles[0].no, to = lv.puzzles[lv.puzzles.length - 1].no;
      if (pages.parts) {
        if (L.pages.length % 2 === 1) filler(L); // a divider is a right-hand page
        var d = divider(L, lv.level, newRefs.parts.length, from, to);
        newRefs.parts.push({ title: 'Part ' + PART_WORDS[newRefs.parts.length] + ': ' + lv.level.name.replace(/^The /, ''), sub: 'Cases ' + from + '–' + to, page: d.num });
        L.sections.push({ title: lv.level.name, page: d.num });
      } else {
        L.sections.push({ title: lv.level.name, page: L.pages.length + 1 + (s.layout === 'spread' && L.pages.length % 2 === 0 ? 1 : 0) });
      }
      lv.puzzles.forEach(function (pz) {
        if (s.layout === 'spread' && L.pages.length % 2 === 0) filler(L); // clues on a left-hand page
        placePuzzle(L, pz);
      });
    });
    if (built.all.length) {
      solutions(L);
      newRefs.solutions = L.refs.solutionsNow;
      L.sections.push({ title: 'Solutions', page: newRefs.solutions });
    }
    var nNotes = Math.max(0, Math.min(6, parseInt(pages.notes, 10) || 0));
    for (var i = 0; i < nNotes; i++) {
      var np = notesPage(L, 'Notes');
      if (!i) { newRefs.notes = np.num; L.sections.push({ title: 'Notes', page: np.num }); }
    }
    if (pages.thanks) thanks(L);
    while (L.pages.length < KDP.MIN_PAGES || L.pages.length % 2 === 1) notesPage(L, 'Notes');
    // page numbers
    L.pages.forEach(function (pg) {
      if (!pg.folio) return;
      pg.text(String(pg.num), pg.cx, pg.y1 - F.sans.descent * L.sz(9) - 0.5, L.sz(9), 'sans', { align: 'center', ink: 0.8 });
    });
    return { L: L, refs: newRefs };
  }

  function sameRefs(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /*
   * The laid-out book: { W, H, trim, pages, pageCount, margins (in), front, sections, casePage }.
   * The gutter depends on the page count and the contents page on where sections land, so the
   * layout repeats until both settle (two or three passes).
   */
  function layoutBook(project, built) {
    F = F || CX.metrics.load();
    var guess = 120, refs = { parts: [], solutions: 0, notes: 0 }, out = null;
    for (var pass = 0; pass < 6; pass++) {
      var m = KDP.margins(guess);
      out = compose(project, built, m, refs);
      var n = out.L.pages.length;
      var stable = KDP.minGutter(n) === KDP.minGutter(guess) && sameRefs(out.refs, refs);
      guess = n; refs = out.refs;
      if (stable) { out.margins = m; break; }
      out.margins = m;
    }
    var L = out.L;
    return {
      W: L.W, H: L.H, trim: L.trim, pages: L.pages, pageCount: L.pages.length, margins: out.margins,
      front: L.front, sections: L.sections, casePage: L.casePage
    };
  }

  /*
   * KDP checks on the laid-out pages: everything inside the margins, text at least 7 pt, lines at
   * least 0.75 pt, ink at least 10% gray where it is not white. Returns a list of problems.
   */
  function audit(book) {
    F = F || CX.metrics.load();
    var out = [];
    book.pages.forEach(function (pg) {
      var x0 = pg.x0 - 0.5, x1 = pg.x1 + 0.5, y0 = pg.y0 - 0.5, y1 = pg.y1 + 0.5;
      pg.items.forEach(function (it) {
        var b;
        if (it.t === 'text') {
          var f = F[it.font], w = f.width(it.str, it.size, it.ls || 0) * (it.hs || 1);
          b = [it.x, it.y - f.ascent * it.size, it.x + w, it.y + f.descent * it.size];
          if (it.size < KDP.MIN_FONT_PT - 0.01) out.push('Page ' + pg.num + ': text smaller than 7 pt (“' + it.str + '”)');
          if (it.ink != null && it.ink > 0 && it.ink < KDP.MIN_GRAY) out.push('Page ' + pg.num + ': text too light');
        } else if (it.t === 'line') {
          var hw = it.w / 2;
          b = [Math.min(it.x1, it.x2) - hw, Math.min(it.y1, it.y2) - hw, Math.max(it.x1, it.x2) + hw, Math.max(it.y1, it.y2) + hw];
          if (it.w < KDP.MIN_LINE_PT - 0.001) out.push('Page ' + pg.num + ': a line thinner than 0.75 pt');
        } else if (it.t === 'rect') {
          var e = it.mode === 'stroke' ? it.lw / 2 : 0;
          b = [it.x - e, it.y - e, it.x + it.w + e, it.y + it.h + e];
          if (it.mode === 'fill' && it.ink > 0 && it.ink < KDP.MIN_GRAY) out.push('Page ' + pg.num + ': a fill too light to print');
        } else if (it.t === 'ellipse') {
          var e2 = it.mode === 'stroke' ? it.lw / 2 : 0;
          b = [it.cx - it.rx - e2, it.cy - it.ry - e2, it.cx + it.rx + e2, it.cy + it.ry + e2];
        } else if (it.t === 'poly') {
          var xs = it.pts.filter(function (v, i) { return i % 2 === 0; }), ys = it.pts.filter(function (v, i) { return i % 2 === 1; });
          b = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
        }
        if (b && (b[0] < x0 || b[1] < y0 || b[2] > x1 || b[3] > y1)) out.push('Page ' + pg.num + ': ' + (it.t === 'text' ? '“' + it.str + '”' : 'a ' + it.t) + ' is outside the margins');
      });
      if (pg.meta.overflow) out.push('Page ' + pg.num + ': a case does not fit the page');
    });
    return out;
  }

  CX.layout = { layoutBook: layoutBook, audit: audit, example: example, wrap: wrap };
})(typeof window !== 'undefined' ? window : globalThis);
