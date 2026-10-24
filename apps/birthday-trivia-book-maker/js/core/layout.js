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
 * Book order: title, copyright, contents, welcome and how to play, the year you were born, the
 * chapters (each followed by its answers, or one answer key at the back), memory lane, score
 * card, birthday wishes. In draft mode (the preview) missing content shows as a dashed box that
 * says which prompt fills it; the print layout leaves empty parts out.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var KDP = CX.kdp, P = CX.plan;
  var PT = 72;
  var F = null;

  var PRINT = {
    regular: { base: 12, label: 'Regular (12 pt)' },
    large: { base: 14, label: 'Large print (14 pt)' },
    xl: { base: 16, label: 'Extra large (16 pt)' }
  };

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

  function star(pg, cx, cy, r, ink) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    pg.poly(pts, ink);
  }

  function diamond(pg, cx, cy, r, ink) { pg.poly([cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy], ink); }

  // A short rule with a diamond in the middle.
  function ornament(pg, cx, y, half) {
    pg.line(cx - half, y, cx - 7, y, 0.9);
    pg.line(cx + 7, y, cx + half, y, 0.9);
    diamond(pg, cx, y, 3.4);
  }

  // ---------- the layout state ----------
  function sizes(b) {
    return { b: b, lead: b * 1.36, fact: Math.max(9, b * 0.8), h1: b * 1.85, h2: b * 1.3, small: Math.max(8, b * 0.62), folio: Math.max(8.5, b * 0.68) };
  }

  function Layout(project, pages, draft) {
    var t = KDP.trim(project.book.trim);
    this.project = project;
    this.draft = draft;
    this.W = t.w * PT; this.H = t.h * PT;
    var m = KDP.margins(pages);
    this.m = { inside: m.inside * PT, outside: m.outside * PT, top: m.top * PT, bottom: m.bottom * PT };
    this.S = sizes(PRINT[project.book.print] ? PRINT[project.book.print].base : 14);
    this.foot = this.S.folio + 12;
    this.pages = [];
    this.toc = [];
    this.flow = null;
    this.pg = null; this.y = 0;
  }

  // A new page; head is the running head printed at the top of continued pages.
  Layout.prototype.page = function (kind, label, head) {
    var pg = new Page(this, kind, label);
    this.pg = pg; this.y = pg.y0;
    this.flow = { kind: kind, label: label, head: head };
    if (head) {
      var S = this.S;
      pg.text(head.toUpperCase(), pg.cx, pg.y0 + S.small, S.small, 'sans', { align: 'center', ls: 1.1 });
      this.y = pg.y0 + S.small + S.b * 1.1;
    }
    return pg;
  };

  // Room for h more points on this page, or a fresh continued page.
  Layout.prototype.need = function (h) {
    if (this.y + h <= this.pg.cb + 0.01) return false;
    var f = this.flow;
    this.page(f.kind, f.label, f.head);
    return true;
  };

  // Section title block at the top of a page: small label, big title, optional subtitle, ornament.
  Layout.prototype.heading = function (eyebrow, title, sub) {
    var S = this.S, pg = this.pg, y = this.y + S.b * 0.6;
    if (eyebrow) { y += S.small; pg.text(eyebrow.toUpperCase(), pg.cx, y, S.small * 1.05, 'sansBold', { align: 'center', ls: 2 }); y += S.b * 0.9; }
    var t = fit(title, 'serifBold', pg.w * 0.92, S.h1, S.b * 1.2, 2);
    t.lines.forEach(function (l) { y += t.size * 1.05; pg.text(l, pg.cx, y, t.size, 'serifBold', { align: 'center' }); y += t.size * 0.12; });
    if (sub) {
      wrap(sub, S.b * 0.95, 'serif', pg.w * 0.85).forEach(function (l) { y += S.b * 1.3; pg.text(l, pg.cx, y, S.b * 0.95, 'serif', { align: 'center' }); });
    }
    y += S.b * 1.1;
    ornament(pg, pg.cx, y, Math.min(70, pg.w * 0.22));
    this.y = y + S.b * 1.6;
  };

  // A paragraph that may run onto the next page, line by line.
  Layout.prototype.para = function (text, font, size, lead, indent) {
    var self = this, pg0 = this.pg;
    indent = indent || 0;
    wrap(text, size, font, this.pg.w - indent).forEach(function (l) {
      self.need(lead);
      self.y += lead;
      self.pg.text(l, self.pg.x0 + indent, self.y - lead * 0.26, size, font);
    });
    return pg0;
  };

  // A dashed box that tells the user what fills this space (preview only).
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

  // ---------- what goes in the book ----------
  function contentOf(project) {
    var per = project.plan.perChapter;
    return P.chapters(project).map(function (ch, i) {
      return { ch: ch, n: i + 1, qs: (project.questions[ch.id] || []).slice(0, per) };
    });
  }

  function promptNo(project, chId) {
    var l = CX.prompts.list(project);
    for (var i = 0; i < l.length; i++) {
      if (l[i].kind === 'questions' && l[i].chapters.some(function (c) { return c.id === chId; })) return l[i].no;
    }
    return 1;
  }

  function extrasNo(project) { return CX.prompts.list(project).length; }

  // The parts of the book, in order; the contents page lists those with a toc title.
  function parts(project, draft) {
    var e = project.extras, ai = project.ai, out = [];
    out.push({ type: 'welcome', toc: 'Welcome' });
    if (e.born && (draft || ai.born.length)) out.push({ type: 'born', toc: 'The Year You Were Born' });
    contentOf(project).forEach(function (c) {
      if (!draft && !c.qs.length) return;
      out.push({ type: 'chapter', toc: c.ch.title, c: c });
    });
    if (project.plan.answers === 'back') out.push({ type: 'key', toc: 'Answer Key' });
    if (e.memories && (draft || ai.memories.length)) out.push({ type: 'memories', toc: 'Memory Lane' });
    if (e.scores) out.push({ type: 'scores', toc: 'Score Card' });
    if (e.wishes) out.push({ type: 'wishes', toc: 'Birthday Wishes' });
    return out;
  }

  // ---------- front matter ----------
  function titlePage(L) {
    var b = L.project.book, r = P.reader(b), S = L.S;
    var pg = L.page('title', 'Title page');
    pg.folio = false;
    var title = P.bookTitle(b), sub = P.bookSubtitle(b);
    var y = pg.y0 + pg.H * 0.1;
    [-1, 0, 1].forEach(function (k) { star(pg, pg.cx + k * 18, y + (k ? 3 : 0), k ? 4.5 : 6.5); });
    y += S.b * 2.2;
    var t = fit(title, 'serifBold', pg.w * 0.9, Math.min(34, pg.w / 9), S.b * 1.3, 4);
    t.lines.forEach(function (l) { y += t.size * 1.08; pg.text(l, pg.cx, y, t.size, 'serifBold', { align: 'center' }); });
    if (sub) {
      y += S.b * 0.6;
      var ss = Math.max(S.b * 0.9, 11);
      wrap(sub, ss, 'serif', pg.w * 0.82).forEach(function (l) { y += ss * 1.35; pg.text(l, pg.cx, y, ss, 'serif', { align: 'center' }); });
    }
    // the age badge
    var rad = Math.min(pg.w * 0.2, 62), cy = Math.min(Math.max(y + rad + S.b * 2.4, pg.y0 + pg.H * 0.5), pg.cb - S.b * 3 - rad);
    if (cy - rad > y + S.b) badge(pg, cy, rad, r);
    var author = (b.author || '').trim();
    if (author || L.draft) pg.text(author || 'Your pen name', pg.cx, pg.cb - S.b, S.b * 1.05, 'serif', { align: 'center', ink: author ? 1 : 0.45 });
  }

  function badge(pg, cy, rad, r) {
    pg.ring(pg.cx, cy, rad, 1.6);
    pg.ring(pg.cx, cy, rad - 5, 0.8);
    var num = String(r.age), ns = rad * 0.95, suf = r.ord.slice(-2).toUpperCase();
    var nw = wid(num, ns, 'serifBold'), sw = wid(suf, ns * 0.32, 'sansBold');
    pg.text(num, pg.cx - (nw + sw) / 2, cy + ns * 0.34, ns, 'serifBold');
    pg.text(suf, pg.cx - (nw + sw) / 2 + nw + 1.5, cy - ns * 0.12, ns * 0.32, 'sansBold');
    pg.text('BIRTHDAY', pg.cx, cy + rad * 0.62, Math.max(7.5, rad * 0.15), 'sansBold', { align: 'center', ls: 1.6 });
  }

  function copyrightPage(L) {
    var b = L.project.book, S = L.S;
    var pg = L.page('copyright', 'Copyright');
    pg.folio = false;
    var size = Math.max(8.5, S.b * 0.66), lead = size * 1.5;
    var year = new Date().getFullYear(), author = (b.author || '').trim();
    var paras = [
      'Copyright © ' + year + (author ? ' ' + author : '') + '. All rights reserved.',
      'No part of this book may be copied or shared in any form without written permission from the author, except for short quotations in reviews.',
      'This book is for entertainment. The facts and prices were checked with care, but some details differ between sources, and prices are typical values for the time.',
      'First edition'
    ];
    var lines = [];
    paras.forEach(function (p, i) { if (i) lines.push(''); Array.prototype.push.apply(lines, wrap(p, size, 'serif', pg.w * 0.85)); });
    var y = pg.cb - lines.length * lead;
    lines.forEach(function (l) { y += lead; if (l) pg.text(l, pg.cx, y - lead * 0.3, size, 'serif', { align: 'center' }); });
  }

  // Reserves the contents pages; they are drawn once every page number is known.
  function contentsPages(L, entries) {
    var S = L.S, rowH = S.lead * 1.2;
    var first = L.page('contents', 'Contents');
    var headH = S.b * 0.6 + S.h1 * 1.17 + S.b * 2.7;
    var cap1 = Math.floor((first.cb - first.y0 - headH) / rowH);
    var pages = [first], left = entries.length - cap1;
    while (left > 0) {
      var pg = L.page('contents', 'Contents');
      var cap = Math.floor((pg.cb - pg.y0 - S.b * 2) / rowH);
      pages.push(pg); left -= cap;
    }
    return { pages: pages, rowH: rowH, headH: headH };
  }

  function drawContents(L, res, entries) {
    var S = L.S, i = 0;
    res.pages.forEach(function (pg, k) {
      var y;
      if (k === 0) {
        L.pg = pg; L.y = pg.y0;
        L.heading('', 'Contents');
        y = L.y - S.b * 0.6;
      } else y = pg.y0 + S.b;
      while (i < entries.length && y + res.rowH <= pg.cb + 0.01) {
        var e = entries[i++];
        y += res.rowH;
        var by = y - res.rowH * 0.3;
        var x = pg.x0;
        if (e.no) { pg.text(String(e.no), x, by, S.b * 0.85, 'sansBold'); x += wid('00', S.b * 0.85, 'sansBold') + S.b * 0.6; }
        var num = String(e.page), nw = wid(num, S.b, 'serif');
        var room = pg.x1 - nw - S.b * 1.2 - x;
        var label = e.title;
        while (label.length > 4 && wid(label, S.b, 'serif') > room) label = label.slice(0, -2).replace(/\s+\S*$/, '') + '…';
        var lw = pg.text(label, x, by, S.b, 'serif');
        pg.text(num, pg.x1, by, S.b, 'serif', { align: 'right' });
        var d0 = x + lw + S.b * 0.4, d1 = pg.x1 - nw - S.b * 0.4;
        if (d1 - d0 > 10) pg.line(d0, by - 1, d1, by - 1, 0.9, 0.7, [0.9, 3.2]);
      }
    });
  }

  function welcome(L) {
    var p = L.project, S = L.S, r = P.reader(p.book), e = p.extras;
    L.page('welcome', 'Welcome');
    L.heading('Welcome', 'Happy ' + r.ord + ' Birthday!');
    var paras = p.ai.welcome;
    if (paras.length) {
      paras.forEach(function (t, i) { if (i) L.y += S.b * 0.55; L.para(t, 'serif', S.b, S.lead); });
    } else if (L.draft) {
      L.placeholder('Your welcome letter', 'It appears here after you paste the reply to prompt ' + extrasNo(p) + ' in step 3.', S.b * 8);
    }
    var tips = ['Read each question out loud and give the birthday star the first try.'];
    tips.push(p.plan.answers === 'back' ? 'The answers, each with a fun fact, are in the Answer Key at the back of the book.'
      : 'The answers, each with a fun fact, are on the page after every chapter.');
    if (e.scores) tips.push('Score one point for every right answer and keep the totals on the Score Card.');
    if (e.memories) tips.push('Turn to Memory Lane for questions that bring out the best stories.');
    if (e.wishes) tips.push('Pass the book around so everyone can write a note on the Birthday Wishes pages.');
    L.y += S.b * 1.2;
    L.need(S.h2 * 1.6 + S.lead * 2);
    L.y += S.h2;
    L.pg.text('How to play', L.pg.x0, L.y, S.h2, 'serifBold');
    L.y += S.b * 0.5;
    tips.forEach(function (t) {
      var ind = S.b * 1.2, lines = wrap(t, S.b, 'serif', L.pg.w - ind);
      L.need(lines.length * S.lead + S.b * 0.3);
      L.y += S.b * 0.3;
      star(L.pg, L.pg.x0 + S.b * 0.4, L.y + S.lead * 0.74 - S.b * 0.34, S.b * 0.33);
      lines.forEach(function (l) { L.y += S.lead; L.pg.text(l, L.pg.x0 + ind, L.y - S.lead * 0.26, S.b, 'serif'); });
    });
  }

  function bulletList(L, items, numbered) {
    var S = L.S;
    items.forEach(function (t, i) {
      var label = numbered ? (i + 1) + '.' : '';
      var ind = numbered ? wid('00.', S.b, 'sansBold') + S.b * 0.5 : S.b * 1.2;
      var lines = wrap(t, S.b, 'serif', L.pg.w - ind);
      L.need(lines.length * S.lead + S.b * 0.45);
      L.y += S.b * 0.45;
      var pg = L.pg;
      if (numbered) pg.text(label, pg.x0, L.y + S.lead * 0.74, S.b, 'sansBold');
      else diamond(pg, pg.x0 + S.b * 0.4, L.y + S.lead * 0.74 - S.b * 0.32, S.b * 0.24);
      lines.forEach(function (l) { L.y += S.lead; pg.text(l, pg.x0 + ind, L.y - S.lead * 0.26, S.b, 'serif'); });
    });
  }

  function bornPage(L) {
    var p = L.project, S = L.S, r = P.reader(p.book);
    L.page('born', 'The Year You Were Born', 'The year you were born');
    L.pg.items.length = 0; L.y = L.pg.y0;    // no running head on the first page
    L.heading('The year you were born', String(r.born));
    if (p.ai.born.length) bulletList(L, p.ai.born, false);
    else if (L.draft) L.placeholder('Fun facts about ' + r.born, 'They appear here after you paste the reply to prompt ' + extrasNo(p) + ' in step 3.', S.b * 10);
  }

  // ---------- chapters ----------
  function qMetrics(L, q) {
    var S = L.S, pg = L.pg;
    var ind = wid('30.', S.b, 'sansBold') + S.b * 0.45;
    var labW = wid('D)', S.b, 'sansBold') + S.b * 0.35;
    var qLines = wrap(q.q, S.b, 'sansBold', pg.w - ind);
    var colGap = S.b * 1.2, colW = (pg.w - ind - colGap) / 2;
    var two = q.o.length === 4 && q.o.every(function (o) { return wid(o, S.b, 'serif') <= colW - labW; });
    var opts = q.o.map(function (o) { return wrap(o, S.b, 'serif', two ? colW - labW : pg.w - ind - labW); });
    var optH = 0;
    if (two) optH = 2 * S.lead;
    else opts.forEach(function (l) { optH += l.length * S.lead; });
    var gapQO = S.b * 0.35;
    return { ind: ind, labW: labW, qLines: qLines, two: two, colW: colW, colGap: colGap, opts: opts, h: qLines.length * S.lead + gapQO + optH, gapQO: gapQO };
  }

  function question(L, q, no) {
    var S = L.S, after = S.b * 1.25;
    var m = qMetrics(L, q);
    if (L.need(m.h + after)) m = qMetrics(L, q);
    var pg = L.pg, x = pg.x0, y = L.y;
    m.qLines.forEach(function (l, i) {
      y += S.lead;
      if (!i) pg.text(no + '.', x, y - S.lead * 0.26, S.b, 'sansBold');
      pg.text(l, x + m.ind, y - S.lead * 0.26, S.b, 'sansBold');
    });
    y += m.gapQO;
    var letters = 'ABCDEF';
    if (m.two) {
      [0, 1].forEach(function (row) {
        y += S.lead;
        [0, 1].forEach(function (col) {
          var k = row * 2 + col, ox = x + m.ind + col * (m.colW + m.colGap);
          pg.text(letters[k] + ')', ox, y - S.lead * 0.26, S.b, 'sansBold');
          pg.text(m.opts[k][0], ox + m.labW, y - S.lead * 0.26, S.b, 'serif');
        });
      });
    } else {
      m.opts.forEach(function (lines, k) {
        lines.forEach(function (l, i) {
          y += S.lead;
          if (!i) pg.text(letters[k] + ')', x + m.ind, y - S.lead * 0.26, S.b, 'sansBold');
          pg.text(l, x + m.ind + m.labW, y - S.lead * 0.26, S.b, 'serif');
        });
      });
    }
    L.y = y + after;
  }

  function chapter(L, c) {
    var p = L.project, S = L.S, per = p.plan.perChapter;
    var pg = L.page('chapter', c.ch.title, c.ch.title);
    pg.items.length = 0; L.y = pg.y0;
    L.heading('Chapter ' + c.n, c.ch.title, c.ch.sub);
    c.qs.forEach(function (q, i) { question(L, q, i + 1); });
    var miss = per - c.qs.length;
    if (miss > 0 && L.draft) {
      L.placeholder(miss === per ? per + ' questions go here' : miss + ' more questions go here',
        'Copy prompt ' + promptNo(p, c.ch.id) + ' in step 3, paste it into ChatGPT, then paste the reply back.', S.b * 9);
    }
    if (p.plan.answers !== 'back' && (c.qs.length || L.draft)) answers(L, c, true);
  }

  // "Score: ____ out of 20" on baseline y, starting at x (or centred on x).
  function scoreLine(L, pg, x, y, total, center) {
    var S = L.S, out = 'out of ' + total;
    var lw = wid('Score:', S.b, 'sansBold'), gap = S.b * 0.5, rule = S.b * 4;
    if (center) x -= (lw + gap + rule + gap + wid(out, S.b, 'serif')) / 2;
    pg.text('Score:', x, y, S.b, 'sansBold');
    var x0 = x + lw + gap, x1 = x0 + rule;
    pg.line(x0, y + 2, x1, y + 2, 0.9);
    pg.text(out, x1 + gap, y, S.b, 'serif');
  }

  // The answers of one chapter: on their own page after the chapter, or in the answer key.
  // On its own page the score sits under the heading, so it never spills onto a page by itself.
  function answers(L, c, ownPage) {
    var S = L.S, per = L.project.plan.perChapter, scores = L.project.extras.scores;
    var total = Math.max(per, c.qs.length), scoreH = S.lead * 2.6;
    if (ownPage) {
      var pg = L.page('answers', 'Answers: ' + c.ch.title, 'Answers · ' + c.ch.title);
      pg.items.length = 0; L.y = pg.y0;
      L.heading('Answers', c.ch.title);
      if (scores) {
        scoreLine(L, pg, pg.cx, L.y, total, true);
        L.y += S.b * 0.9;
      }
    } else {
      L.need(S.h2 * 2.4 + S.lead * 3);
      L.y += S.b * 0.8 + S.h2;
      L.pg.text(c.n + '. ' + c.ch.title, L.pg.x0, L.y, S.h2, 'serifBold');
      L.y += S.b * 0.5;
      L.pg.line(L.pg.x0, L.y, L.pg.x1, L.y, 0.8);
      L.y += S.b * 0.3;
    }
    var letters = 'ABCDEF';
    c.qs.forEach(function (q, i) {
      var pg0 = L.pg;
      var ind = wid('30.', S.b, 'sansBold') + S.b * 0.45;
      var labW = wid('D)', S.b, 'sansBold') + S.b * 0.35;
      var aLines = wrap(q.o[q.a], S.b, 'serif', pg0.w - ind - labW);
      var fLines = q.f ? wrap(q.f, S.fact, 'serif', pg0.w - ind - labW) : [];
      var h = aLines.length * S.lead + fLines.length * S.fact * 1.35 + S.b * 0.55;
      // in the answer key the score stays with the last answer
      L.need(h + (scores && !ownPage && i === c.qs.length - 1 ? scoreH : 0));
      var pg = L.pg, y = L.y + S.b * 0.55;
      aLines.forEach(function (l, k) {
        y += S.lead;
        if (!k) {
          pg.text((i + 1) + '.', pg.x0, y - S.lead * 0.26, S.b, 'sansBold');
          pg.text(letters[q.a] + ')', pg.x0 + ind, y - S.lead * 0.26, S.b, 'sansBold');
        }
        pg.text(l, pg.x0 + ind + labW, y - S.lead * 0.26, S.b, 'serif');
      });
      fLines.forEach(function (l) { y += S.fact * 1.35; pg.text(l, pg.x0 + ind + labW, y - S.fact * 0.3, S.fact, 'serif', { ink: 0.85 }); });
      L.y = y;
    });
    if (!c.qs.length && L.draft) L.placeholder('Answers go here', 'They fill in with the questions.', S.b * 5);
    if (scores && !ownPage) {
      L.need(scoreH);
      L.y += S.lead * 1.6;
      scoreLine(L, L.pg, L.pg.x0, L.y, total);
      L.y += S.lead;
    }
  }

  function answerKey(L, content) {
    L.page('key', 'Answer Key', 'Answer key');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Answer Key');
    content.forEach(function (c) { if (c.qs.length || L.draft) answers(L, c, false); });
  }

  // ---------- back matter ----------
  function writingLines(L, n, gap) {
    var pg = L.pg;
    for (var i = 0; i < n; i++) { L.y += gap; pg.line(pg.x0, L.y, pg.x1, L.y, 0.75, 0.6); }
  }

  function memories(L) {
    var p = L.project, S = L.S;
    L.page('memories', 'Memory Lane', 'Memory Lane');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('Share your stories', 'Memory Lane', 'Questions that bring back the best stories. Write the answers here, or tell them while someone else writes.');
    var list = p.ai.memories;
    if (!list.length) {
      if (L.draft) L.placeholder('Memory prompts', 'They appear here after you paste the reply to prompt ' + extrasNo(p) + ' in step 3.', S.b * 9);
      return;
    }
    var gap = S.b * 2.1;
    list.forEach(function (t) {
      var lines = wrap(t, S.b, 'sansBold', L.pg.w);
      L.need(lines.length * S.lead + 4 * gap + S.b * 1.6);
      L.y += S.b * 0.6;
      lines.forEach(function (l) { L.y += S.lead; L.pg.text(l, L.pg.x0, L.y - S.lead * 0.26, S.b, 'sansBold'); });
      writingLines(L, 4, gap);
      L.y += S.b;
    });
  }

  function scoreCard(L, content) {
    var p = L.project, S = L.S, per = p.plan.perChapter;
    L.page('scores', 'Score Card', 'Score card');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('Keep score', 'Score Card');
    var rowH = S.lead * 1.55;
    var rows = content.filter(function (c) { return c.qs.length || L.draft; });
    rows.forEach(function (c) {
      L.need(rowH);
      var pg = L.pg, y = L.y + rowH;
      var scoreW = wid('out of 00', S.b, 'serif') + S.b * 4.5;
      var label = c.n + '. ' + c.ch.title;
      while (label.length > 4 && wid(label, S.b, 'serif') > pg.w - scoreW - S.b) label = label.slice(0, -2) + '…';
      pg.text(label, pg.x0, y - rowH * 0.3, S.b, 'serif');
      var lx = pg.x1 - wid('out of ' + per, S.b, 'serif') - S.b * 0.4;
      pg.line(lx - S.b * 3.4, y - rowH * 0.28, lx, y - rowH * 0.28, 0.9);
      pg.text('out of ' + per, pg.x1, y - rowH * 0.3, S.b, 'serif', { align: 'right' });
      pg.line(pg.x0, y, pg.x1, y, 0.75, 0.45);
      L.y = y;
    });
    L.need(rowH * 1.4);
    var pg = L.pg, y = L.y + rowH * 1.3;
    pg.text('Total', pg.x0, y - rowH * 0.3, S.b * 1.1, 'sansBold');
    var tot = 'out of ' + per * rows.length, lx = pg.x1 - wid(tot, S.b, 'serif') - S.b * 0.4;
    pg.line(lx - S.b * 3.4, y - rowH * 0.28, lx, y - rowH * 0.28, 1.2);
    pg.text(tot, pg.x1, y - rowH * 0.3, S.b, 'serif', { align: 'right' });
    L.y = y;
  }

  function wishes(L) {
    var S = L.S, r = P.reader(L.project.book);
    for (var k = 0; k < 2; k++) {
      L.page('wishes', 'Birthday Wishes', 'Birthday wishes');
      var pg = L.pg;
      pg.items.length = 0; L.y = pg.y0;
      if (k === 0) L.heading('Happy ' + r.ord + ' birthday', 'Birthday Wishes', 'A note from everyone at the party.');
      else L.y += S.b * 0.5;
      var avail = pg.cb - L.y, n = avail > S.b * 26 ? 3 : 2, gapB = S.b * 0.9, bh = (avail - gapB * (n - 1)) / n;
      for (var i = 0; i < n; i++) {
        var y = L.y;
        pg.box(pg.x0, y, pg.w, bh, 0.9);
        var pad = S.b * 0.8;
        var ly = y + pad + S.b, lineGap = S.b * 2;
        pg.text('From:', pg.x0 + pad, ly, S.b * 0.9, 'sansBold');
        pg.line(pg.x0 + pad + wid('From:', S.b * 0.9, 'sansBold') + 6, ly + 1.5, pg.x1 - pad, ly + 1.5, 0.75, 0.6);
        for (ly += lineGap; ly < y + bh - pad * 0.8; ly += lineGap) pg.line(pg.x0 + pad, ly, pg.x1 - pad, ly, 0.75, 0.6);
        L.y = y + bh + gapB;
      }
    }
  }

  function folios(L) {
    var S = L.S;
    L.pages.forEach(function (pg) {
      if (!pg.folio) return;
      pg.text(String(pg.num), pg.cx, pg.y1 - 2, S.folio, 'serif', { align: 'center' });
    });
  }

  function pass(project, pageGuess, draft) {
    F = CX.metrics.load();
    var L = new Layout(project, pageGuess, draft);
    var list = parts(project, draft), content = contentOf(project);
    titlePage(L);
    copyrightPage(L);
    var tocEntries = list.map(function (pt) { return { title: pt.toc, no: pt.type === 'chapter' ? pt.c.n : 0, page: 0 }; });
    var toc = contentsPages(L, tocEntries);
    var sections = [];
    list.forEach(function (pt, i) {
      var start = L.pages.length + 1;
      if (pt.type === 'welcome') welcome(L);
      else if (pt.type === 'born') bornPage(L);
      else if (pt.type === 'chapter') chapter(L, pt.c);
      else if (pt.type === 'key') answerKey(L, content);
      else if (pt.type === 'memories') memories(L);
      else if (pt.type === 'scores') scoreCard(L, content);
      else if (pt.type === 'wishes') wishes(L);
      tocEntries[i].page = start;
      sections.push({ page: tocEntries[i].page, title: (pt.type === 'chapter' ? pt.c.n + '. ' : '') + pt.toc });
    });
    drawContents(L, toc, tocEntries);
    folios(L);
    return {
      W: L.W, H: L.H, pages: L.pages, m: L.m, S: L.S,
      front: [{ page: 1, title: 'Title page' }, { page: toc.pages[0].num, title: 'Contents' }],
      sections: sections
    };
  }

  /*
   * The whole book. opts.draft: placeholders for missing content (the preview).
   * The inside margin grows with the page count, so the layout runs again when the count crosses
   * one of KDP's steps.
   */
  function layoutBook(project, opts) {
    opts = opts || {};
    var guess = 120, book = null;
    for (var i = 0; i < 4; i++) {
      book = pass(project, guess, !!opts.draft);
      if (KDP.minGutter(book.pages.length) === KDP.minGutter(guess)) break;
      guess = book.pages.length;
    }
    book.pageCount = book.pages.length;
    return book;
  }

  CX.layout = { PRINT: PRINT, layoutBook: layoutBook, wrap: wrap, fit: fit, parts: parts, sizes: sizes };
})(typeof window !== 'undefined' ? window : globalThis);
