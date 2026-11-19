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
 * Book order: title, copyright, "this book belongs to", contents, welcome and how to play, then
 * one part per decade (an opener page with the intro, the decade at a glance and fun facts, the
 * themed rounds, the "Remember When?" memory page and the decade's answers), or one answer key at
 * the back, then the score card with ranks and the certificate. In draft mode (the preview)
 * missing content shows as a dashed box that says which prompt fills it; the print layout leaves
 * empty parts out.
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
    // a single word wider than the line is cut so nothing runs into the margin
    return lines.map(function (l) {
      if (wid(l, size, font) <= maxW) return l;
      var s = l;
      while (s.length > 2 && wid(s + '…', size, font) > maxW) s = s.slice(0, -1);
      return s + '…';
    });
  }

  // The largest size (down to min) at which str fits in maxLines lines of maxW.
  function fit(str, font, maxW, maxSize, minSize, maxLines) {
    for (var s = maxSize; s > minSize; s -= 0.5) {
      var l = wrap(str, s, font, maxW);
      if (l.length <= maxLines && l.every(function (x) { return wid(x, s, font) <= maxW; })) return { size: s, lines: l };
    }
    return { size: minSize, lines: wrap(str, minSize, font, maxW) };
  }

  // Shortens a label with an ellipsis until it fits maxW.
  function clip(s, size, font, maxW) {
    var t = s;
    while (t.length > 4 && wid(t, size, font) > maxW) t = t.slice(0, -2).replace(/\s+$/, '') + '…';
    return t;
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
      pg.text(clip(head.toUpperCase(), S.small, 'sans', pg.w / 1.1), pg.cx, pg.y0 + S.small, S.small, 'sans', { align: 'center', ls: 1.1 });
      this.y = pg.y0 + S.small + S.b * 1.1;
    }
    return pg;
  };

  // The first page of a part: no running head on it.
  Layout.prototype.opening = function (kind, label, head) {
    var pg = this.page(kind, label, head);
    pg.items.length = 0; this.y = pg.y0;
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
    if (eyebrow) { y += S.small; pg.text(clip(eyebrow.toUpperCase(), S.small * 1.05, 'sansBold', pg.w / 1.15), pg.cx, y, S.small * 1.05, 'sansBold', { align: 'center', ls: 2 }); y += S.b * 0.9; }
    var t = fit(title, 'serifBold', pg.w * 0.92, S.h1, S.b * 1.2, 2);
    t.lines.forEach(function (l) { y += t.size * 1.05; pg.text(l, pg.cx, y, t.size, 'serifBold', { align: 'center' }); y += t.size * 0.12; });
    if (sub) {
      wrap(sub, S.b * 0.95, 'serif', pg.w * 0.85).forEach(function (l) { y += S.b * 1.3; pg.text(l, pg.cx, y, S.b * 0.95, 'serif', { align: 'center' }); });
    }
    y += S.b * 1.1;
    ornament(pg, pg.cx, y, Math.min(70, pg.w * 0.22));
    this.y = y + S.b * 1.6;
  };

  // A left-aligned subheading with a rule under it, kept with the first lines that follow.
  Layout.prototype.subhead = function (str, keep) {
    var S = this.S;
    this.need(S.h2 * 2 + S.b * 0.9 + (keep || S.lead * 2));
    this.y += S.b * 0.7 + S.h2;
    var pg = this.pg;
    pg.text(clip(str, S.h2, 'serifBold', pg.w), pg.x0, this.y, S.h2, 'serifBold');
    this.y += S.b * 0.45;
    pg.line(pg.x0, this.y, pg.x1, this.y, 0.8);
    this.y += S.b * 0.2;
  };

  // A paragraph that may run onto the next page, line by line.
  Layout.prototype.para = function (text, font, size, lead, indent) {
    var self = this;
    indent = indent || 0;
    wrap(text, size, font, this.pg.w - indent).forEach(function (l) {
      self.need(lead);
      self.y += lead;
      self.pg.text(l, self.pg.x0 + indent, self.y - lead * 0.26, size, font);
    });
  };

  // A dashed box that tells the user what fills this space (preview only).
  Layout.prototype.placeholder = function (title, note, h) {
    var S = this.S;
    this.need(h);
    var pg = this.pg, y = this.y + S.b * 0.4;
    pg.box(pg.x0, y, pg.w, h - S.b * 0.8, 0.9, 0.35, [5, 4]);
    var ty = y + (h - S.b * 0.8) / 2 - S.b * 0.4;
    pg.text(clip(title, S.b * 0.95, 'sansBold', pg.w * 0.9), pg.cx, ty, S.b * 0.95, 'sansBold', { align: 'center', ink: 0.55 });
    wrap(note, S.small * 1.15, 'sans', pg.w * 0.8).forEach(function (l, i) {
      pg.text(l, pg.cx, ty + S.b * 1.2 + i * S.small * 1.5, S.small * 1.15, 'sans', { align: 'center', ink: 0.55 });
    });
    this.y += h;
  };

  // Bullets (a small diamond) or a numbered list.
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

  function writingLines(L, n, gap) {
    var pg = L.pg;
    for (var i = 0; i < n; i++) { L.y += gap; pg.line(pg.x0, L.y, pg.x1, L.y, 0.75, 0.6); }
  }

  // ---------- what goes in the book ----------
  // Per decade: its rounds with the questions the book prints, and its decade page content.
  function contentOf(project) {
    var per = project.plan.perRound;
    return P.decades(project).map(function (d) {
      var rs = P.roundsOf(project, d.id).map(function (r) { return { r: r, qs: (project.questions[r.id] || []).slice(0, per) }; });
      var e = project.eras[d.id] || { intro: [], timeline: [], facts: [], memories: [] };
      return { d: d, rounds: rs, era: e, n: rs.reduce(function (s, x) { return s + x.qs.length; }, 0) };
    });
  }

  function promptNo(project, roundId) {
    var l = CX.prompts.list(project);
    for (var i = 0; i < l.length; i++) {
      if (l[i].kind === 'questions' && l[i].rounds.some(function (r) { return r.id === roundId; })) return l[i].no;
    }
    return 1;
  }
  function erasNo(project) {
    var l = CX.prompts.list(project);
    for (var i = 0; i < l.length; i++) if (l[i].kind === 'eras') return l[i].no;
    return l.length;
  }
  function extrasNo(project) { return CX.prompts.list(project).length; }

  /*
   * The parts of the book, in order. Each has the toc entries it adds: { title (as listed),
   * label (the label of the page it starts on), no (part number), sub }.
   */
  function parts(project, draft) {
    var e = project.extras, out = [], back = project.plan.answers === 'back';
    out.push({ type: 'welcome', toc: [{ title: 'Welcome', label: 'Welcome' }] });
    contentOf(project).forEach(function (c, i) {
      var hasEra = e.eras && (c.era.intro.length || c.era.timeline.length || c.era.facts.length);
      if (!draft && !c.n && !hasEra) return;
      out.push({ type: 'era', c: c, toc: [{ title: c.d.title, label: c.d.title, no: i + 1 }] });
      c.rounds.forEach(function (x) {
        if (!draft && !x.qs.length) return;
        out.push({ type: 'round', c: c, x: x, toc: [{ title: x.r.title, label: roundLabel(x.r), sub: true }] });
      });
      if (e.memories && (draft || c.era.memories.length)) out.push({ type: 'memories', c: c, toc: [{ title: 'Remember When?', label: 'Remember When? · ' + c.d.id, sub: true }] });
      if (!back && (draft || c.n)) out.push({ type: 'answers', c: c, toc: [{ title: 'Answers', label: 'Answers · ' + c.d.id, sub: true }] });
    });
    if (back) out.push({ type: 'key', toc: [{ title: 'Answer Key', label: 'Answer Key' }] });
    if (e.ranks) out.push({ type: 'scores', toc: [{ title: 'Score Card', label: 'Score Card' }] });
    if (e.certificate) out.push({ type: 'certificate', toc: [{ title: 'Certificate of Achievement', label: 'Certificate of Achievement' }] });
    return out;
  }

  function roundLabel(r) { return r.decade.id + ' · ' + r.title; }

  // ---------- front matter ----------
  function titlePage(L) {
    var p = L.project, S = L.S;
    var pg = L.page('title', 'Title page');
    pg.folio = false;
    var title = P.bookTitle(p), sub = P.bookSubtitle(p);
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
    var rad = Math.min(pg.w * 0.2, 62), cy = Math.min(Math.max(y + rad + S.b * 2.4, pg.y0 + pg.H * 0.5), pg.cb - S.b * 3 - rad);
    if (cy - rad > y + S.b) emblem(pg, cy, rad, P.hero(p), P.range(p));
    var author = (p.book.author || '').trim();
    if (author || L.draft) pg.text(clip(author || 'Your pen name', S.b * 1.05, 'serif', pg.w), pg.cx, pg.cb - S.b, S.b * 1.05, 'serif', { align: 'center', ink: author ? 1 : 0.45 });
  }

  // A double ring with the cover word across it and TRIVIA (and the decades) under it.
  function emblem(pg, cy, rad, word, range) {
    pg.ring(pg.cx, cy, rad, 1.6);
    pg.ring(pg.cx, cy, rad - 5, 0.8);
    var lines = word.indexOf(' ') !== -1 ? word.split(/\s+/).slice(0, 3) : [word];
    var maxW = rad * 1.45, size = Math.min(rad * 0.5, rad * 0.95 / lines.length);
    lines.forEach(function (l) { size = Math.min(size, maxW / Math.max(1, wid(l, 1, 'serifBold'))); });
    size = Math.max(7, size);
    var h = lines.length * size * 0.72 + (lines.length - 1) * size * 0.28, y = cy - h / 2 - rad * 0.08;
    lines.forEach(function (l, i) { y += size * 0.72; pg.text(l, pg.cx, y, size, 'serifBold', { align: 'center' }); if (i < lines.length - 1) y += size * 0.28; });
    var ts = Math.max(7.5, rad * 0.15);
    pg.text('TRIVIA', pg.cx, cy + rad * 0.62, ts, 'sansBold', { align: 'center', ls: 1.6 });
    [-1, 1].forEach(function (s) { star(pg, pg.cx + s * (wid('TRIVIA', ts, 'sansBold', 1.6) / 2 + ts * 0.9), cy + rad * 0.62 - ts * 0.35, ts * 0.4); });
    if (range && range !== word) {
      var rs = Math.max(7, Math.min(ts * 0.9, rad * 1.1 / Math.max(1, wid(range, 1, 'sans'))));
      pg.text(range, pg.cx, cy - rad * 0.5, rs, 'sans', { align: 'center' });
    }
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
      'This book is for entertainment only. The facts were checked with care, but dates, prices and details are given as they are commonly remembered and may differ from place to place.',
      'The names of people, songs, films, shows, products and companies are used only to identify them and for trivia purposes. All trademarks belong to their owners; no sponsorship or endorsement is implied.',
      'First edition'
    ];
    var lines = [];
    paras.forEach(function (p, i) { if (i) lines.push(''); Array.prototype.push.apply(lines, wrap(p, size, 'serif', pg.w * 0.85)); });
    var y = pg.cb - lines.length * lead;
    lines.forEach(function (l) { y += lead; if (l) pg.text(l, pg.cx, y - lead * 0.3, size, 'serif', { align: 'center' }); });
  }

  // "This book belongs to", with lines for the name, who gave it and when.
  function belongsPage(L) {
    var S = L.S;
    var pg = L.page('belongs', 'This Book Belongs To');
    pg.folio = false;
    var top = pg.y0, bot = pg.y1, inner = pg.w - S.b * 2.6;
    pg.box(pg.x0, top, pg.w, bot - top, 2);
    pg.box(pg.x0 + 5, top + 5, pg.w - 10, bot - top - 10, 0.8);
    [[pg.x0 + 5, top + 5], [pg.x1 - 5, top + 5], [pg.x0 + 5, bot - 5], [pg.x1 - 5, bot - 5]].forEach(function (c) { diamond(pg, c[0], c[1], 4.2); });
    var y = top + (bot - top) * 0.22;
    [-1, 0, 1].forEach(function (k) { star(pg, pg.cx + k * 18, y + (k ? 3 : 0), k ? 4.5 : 6.5); });
    var hs = Math.min(S.h1 * 1.2, inner / Math.max(1, wid('This Book', 1, 'serifBold')));
    y += S.b * 1.4 + hs * 0.75;
    pg.text('This Book', pg.cx, y, hs, 'serifBold', { align: 'center' });
    y += hs * 1.1;
    pg.text('Belongs To', pg.cx, y, hs, 'serifBold', { align: 'center' });
    y += S.b * 1.8;
    ornament(pg, pg.cx, y, Math.min(70, inner * 0.3));
    y += S.b * 3.6;
    pg.line(pg.cx - inner * 0.42, y, pg.cx + inner * 0.42, y, 0.9);
    var ls = Math.max(7.5, S.small);
    [['A gift from', 0.42], ['Date', 0.3]].forEach(function (row) {
      y += S.b * 3.4;
      pg.line(pg.cx - inner * row[1], y, pg.cx + inner * row[1], y, 0.9);
      pg.text(row[0].toUpperCase(), pg.cx, y + ls * 1.5, ls, 'sansBold', { align: 'center', ls: 0.8 });
    });
  }

  /*
   * Reserves the contents pages; they are drawn once every page number is known. Parts are main
   * rows, rounds and the decade's other pages are smaller indented rows under them.
   */
  function rowH(S, e) { return e.sub ? S.lead * 1.02 : S.lead * 1.3; }
  function contentsPages(L, entries) {
    var S = L.S;
    var first = L.page('contents', 'Contents');
    var headH = S.b * 0.6 + S.h1 * 1.17 + S.b * 2.7;
    var pages = [first], counts = [0], y = first.y0 + headH, pg = first;
    entries.forEach(function (e) {
      var h = rowH(S, e);
      if (y + h > pg.cb + 0.01 && counts[counts.length - 1]) { pg = L.page('contents', 'Contents'); pages.push(pg); counts.push(0); y = pg.y0 + S.b; }
      y += h;
      counts[counts.length - 1]++;
    });
    return { pages: pages, counts: counts };
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
      // the rows reserved for this page, so the page count never changes after the reservation
      for (var end = i + res.counts[k]; i < end;) {
        var e = entries[i++], h = rowH(S, e);
        y += h;
        var by = y - h * 0.3, size = e.sub ? S.b * 0.92 : S.b, font = e.sub ? 'serif' : 'serifBold';
        var x = pg.x0 + (e.sub ? S.b * 2.2 : 0);
        if (e.no) { pg.text(String(e.no), pg.x0, by, S.b * 0.85, 'sansBold'); x += wid('00', S.b * 0.85, 'sansBold') + S.b * 0.6; }
        else if (!e.sub && res.numbered) x += wid('00', S.b * 0.85, 'sansBold') + S.b * 0.6;
        var num = String(e.page), nw = wid(num, size, 'serif');
        var lw = pg.text(clip(e.title, size, font, pg.x1 - nw - S.b * 1.2 - x), x, by, size, font);
        pg.text(num, pg.x1, by, size, 'serif', { align: 'right' });
        var d0 = x + lw + S.b * 0.4, d1 = pg.x1 - nw - S.b * 0.4;
        if (d1 - d0 > 10) pg.line(d0, by - 1, d1, by - 1, 0.9, 0.7, [0.9, 3.2]);
      }
    });
  }

  function welcome(L) {
    var p = L.project, S = L.S, e = p.extras;
    L.opening('welcome', 'Welcome', 'Welcome');
    L.heading('Welcome', 'Welcome to Memory Lane!');
    var paras = p.ai.welcome;
    if (paras.length) {
      paras.forEach(function (t, i) { if (i) L.y += S.b * 0.55; L.para(t, 'serif', S.b, S.lead); });
    } else if (L.draft) {
      L.placeholder('Your welcome letter', 'It appears here after you paste the reply to prompt ' + extrasNo(p) + ' in step 3.', S.b * 8);
    }
    var tips = ['Play on your own, or read the questions out loud to family and friends and take turns answering.'];
    tips.push('Each decade has its own rounds: music, movies, everyday life and more. Start anywhere you like.');
    tips.push(p.plan.answers === 'back' ? 'The answers, each with a fun fact, are in the Answer Key at the back of the book.'
      : 'The answers, each with a fun fact, are at the end of every decade.');
    if (p.plan.tf) tips.push('Some questions are true or false: answer A for True or B for False.');
    tips.push('When a question brings back a memory, stop and share the story. That is half the fun!');
    if (e.memories) tips.push('Use the Remember When? pages to write down your own memories of each decade.');
    if (e.ranks) tips.push('Score one point for every right answer, add up the totals on the Score Card and see which rank you earn.');
    if (e.certificate) tips.push('Finished the book? Fill in your Certificate of Achievement at the back.');
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

  // ---------- the decades ----------
  // The decade's opener: part number, the decade and its nickname, then the decade pages.
  function eraOpener(L, c) {
    var p = L.project, S = L.S, d = c.d, e = c.era;
    L.opening('era', d.title, d.title);
    L.heading('Part ' + (P.NUM[d.n] || d.n), d.title, d.nick);
    if (!p.extras.eras) return;
    if (e.intro.length) e.intro.forEach(function (t, i) { if (i) L.y += S.b * 0.55; L.para(t, 'serif', S.b, S.lead); });
    else if (L.draft) L.placeholder('About the ' + d.id, 'A short intro appears here after you paste the reply to prompt ' + erasNo(p) + ' in step 3.', S.b * 6);
    // a block under a subheading stays together when it takes up to half a page
    var half = (L.pg.cb - L.pg.y0) * 0.5;
    var yw = wid('0000', S.b, 'sansBold') + S.b * 0.8;
    function moment(m) {
      var parts = m.split('|'), yr = parts.length > 1 ? parts[0] : '', t = parts.length > 1 ? parts.slice(1).join('|') : m;
      return { yr: yr, lines: wrap(t, S.b, 'serif', L.pg.w - (yr ? yw : 0)) };
    }
    if (e.timeline.length || L.draft) {
      var tH = e.timeline.reduce(function (sum, m) { return sum + moment(m).lines.length * S.lead + S.b * 0.25; }, 0);
      L.subhead(d.id + ' at a Glance', Math.min(half, tH || S.b * 6));
      if (!e.timeline.length) L.placeholder('At a glance', 'Year-by-year moments of the ' + d.id + ' from prompt ' + erasNo(p) + '.', S.b * 6);
      e.timeline.forEach(function (m) {
        var mm = moment(m), yr = mm.yr, ind = yr ? yw : 0, lines = mm.lines;
        L.need(lines.length * S.lead + S.b * 0.25);
        L.y += S.b * 0.25;
        var pg = L.pg;
        if (yr) pg.text(yr, pg.x0, L.y + S.lead * 0.74, S.b, 'sansBold');
        lines.forEach(function (l) { L.y += S.lead; pg.text(l, pg.x0 + ind, L.y - S.lead * 0.26, S.b, 'serif'); });
      });
    }
    if (e.facts.length || L.draft) {
      var fH = e.facts.reduce(function (sum, t) { return sum + wrap(t, S.b, 'serif', L.pg.w - S.b * 1.2).length * S.lead + S.b * 0.45; }, 0);
      L.subhead('Did You Know?', Math.min(half, fH || S.b * 5));
      if (e.facts.length) bulletList(L, e.facts, false);
      else L.placeholder('Fun facts', 'Fun facts about the ' + d.id + ' from prompt ' + erasNo(p) + '.', S.b * 5);
    }
  }

  // Question metrics: two columns of choices when every choice fits on one line.
  function qMetrics(L, q) {
    var S = L.S, pg = L.pg;
    var ind = wid('30.', S.b, 'sansBold') + S.b * 0.45;
    var labW = wid('D)', S.b, 'sansBold') + S.b * 0.35;
    var qLines = wrap(q.q, S.b, 'sansBold', pg.w - ind);
    var colGap = S.b * 1.2, colW = (pg.w - ind - colGap) / 2;
    var two = (q.o.length === 4 || q.o.length === 2) && q.o.every(function (o) { return wid(o, S.b, 'serif') <= colW - labW; });
    var opts = q.o.map(function (o) { return wrap(o, S.b, 'serif', two ? colW - labW : pg.w - ind - labW); });
    var optH = 0;
    if (two) optH = q.o.length / 2 * S.lead;
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
      (q.o.length === 2 ? [0] : [0, 1]).forEach(function (row) {
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

  function round(L, x) {
    var p = L.project, S = L.S, per = p.plan.perRound, r = x.r;
    L.opening('round', roundLabel(r), roundLabel(r));
    L.heading(r.decade.id + ' · Round ' + r.no, r.title, r.sub);
    x.qs.forEach(function (q, i) { question(L, q, i + 1); });
    var miss = per - x.qs.length;
    if (miss > 0 && L.draft) {
      L.placeholder(miss === per ? per + ' questions go here' : miss + ' more questions go here',
        'Copy prompt ' + promptNo(p, r.id) + ' in step 3, paste it into ChatGPT, then paste the reply back.', S.b * 9);
    }
  }

  // Memory prompts of one decade, each with lines to write on.
  function memories(L, c) {
    var p = L.project, S = L.S, d = c.d, list = c.era.memories;
    L.opening('memories', 'Remember When? · ' + d.id, 'Remember when? · ' + d.id);
    L.heading(d.title, 'Remember When?', 'Write down your own memories of the ' + d.id + ', or ask someone who was there to share theirs.');
    if (!list.length) {
      if (L.draft) L.placeholder('Memory prompts', 'They appear here after you paste the reply to prompt ' + erasNo(p) + ' in step 3.', S.b * 9);
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

  // "Score: ____ out of 10" on baseline y, starting at x.
  function scoreLine(L, pg, x, y, total) {
    var S = L.S, out = 'out of ' + total;
    var lw = wid('Score:', S.b, 'sansBold'), gap = S.b * 0.5, rule = S.b * 4;
    pg.text('Score:', x, y, S.b, 'sansBold');
    var x0 = x + lw + gap, x1 = x0 + rule;
    pg.line(x0, y + 2, x1, y + 2, 0.9);
    pg.text(out, x1 + gap, y, S.b, 'serif');
  }

  // The answers of one round, under a subheading, with a score line when the book keeps score.
  function roundAnswers(L, x, title) {
    var S = L.S, per = L.project.plan.perRound, scores = L.project.extras.ranks;
    var total = Math.max(per, x.qs.length), scoreH = S.lead * 2.2;
    L.subhead(title, S.lead * 2);
    var letters = 'ABCDEF';
    x.qs.forEach(function (q, i) {
      var pg0 = L.pg;
      var ind = wid('30.', S.b, 'sansBold') + S.b * 0.45;
      var labW = wid('D)', S.b, 'sansBold') + S.b * 0.35;
      var aLines = wrap(q.o[q.a], S.b, 'serif', pg0.w - ind - labW);
      var fLines = q.f ? wrap(q.f, S.fact, 'serif', pg0.w - ind - labW) : [];
      var h = aLines.length * S.lead + fLines.length * S.fact * 1.35 + S.b * 0.55;
      // the score stays with the last answer
      L.need(h + (scores && i === x.qs.length - 1 ? scoreH : 0));
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
    if (!x.qs.length && L.draft) L.placeholder('Answers go here', 'They fill in with the questions.', S.b * 4);
    if (scores && (x.qs.length || L.draft)) {
      L.need(scoreH);
      L.y += S.lead * 1.4;
      scoreLine(L, L.pg, L.pg.x0, L.y, total);
      L.y += S.lead * 0.8;
    }
  }

  function answers(L, c) {
    L.opening('answers', 'Answers · ' + c.d.id, 'Answers · ' + c.d.id);
    L.heading('Answers', c.d.title);
    c.rounds.forEach(function (x) { if (x.qs.length || L.draft) roundAnswers(L, x, 'Round ' + x.r.no + ' · ' + x.r.title); });
  }

  function answerKey(L, content) {
    var S = L.S;
    L.opening('key', 'Answer Key', 'Answer key');
    L.heading('', 'Answer Key');
    content.forEach(function (c, i) {
      if (!c.n && !L.draft) return;
      // the decade's name stays with its first round
      L.need(S.h1 * 1.8 + S.h2 * 2 + S.lead * 3);
      if (i) L.y += S.b * 1.2;
      L.y += S.h1 * 0.9;
      L.pg.text(c.d.title, L.pg.cx, L.y, S.h1 * 0.8, 'serifBold', { align: 'center' });
      L.y += S.b * 0.4;
      c.rounds.forEach(function (x) { if (x.qs.length || L.draft) roundAnswers(L, x, c.d.id + ' · ' + x.r.title); });
    });
  }

  // ---------- back matter ----------
  // The score bands for the ranks: equal parts of the total, lowest first.
  function bands(total, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push({ lo: i ? Math.floor(total * i / n) + 1 : 0, hi: Math.floor(total * (i + 1) / n) });
    return out;
  }

  var PLAYERS = 4;

  // A score table for up to four players, one row per decade, then the ranks the total earns.
  function scoreCard(L, content) {
    var p = L.project, S = L.S, per = p.plan.perRound;
    L.opening('scores', 'Score Card', 'Score card');
    var rows = content.filter(function (c) { return c.n || L.draft; });
    var each = per * P.themes(p).length;
    L.heading('Keep score', 'Score Card', 'Up to ' + PLAYERS + ' players: write your names at the top, then add up your right answers in each decade (' + each + ' questions in each).');
    var total = each * rows.length, rowH = S.lead * 1.45, gap = S.b * 0.4;
    function cols(pg) {
      var cw = Math.min(S.b * 3.4, (pg.w * 0.56 - gap * (PLAYERS - 1)) / PLAYERS), x = [];
      for (var i = 0; i < PLAYERS; i++) x.push(pg.x1 - (PLAYERS - i) * cw - (PLAYERS - 1 - i) * gap);
      return { w: cw, x: x, label: x[0] - S.b * 0.6 - pg.x0 };
    }
    function header() {
      L.need(rowH * 1.3);
      var pg = L.pg, c = cols(pg), y = L.y + rowH;
      pg.text('Players', pg.x0, y - rowH * 0.3, S.b, 'sansBold');
      c.x.forEach(function (x) { pg.line(x, y - rowH * 0.22, x + c.w, y - rowH * 0.22, 0.9); });
      L.y = y + S.b * 0.3;
    }
    header();
    rows.forEach(function (c) {
      if (L.need(rowH)) header();
      var pg = L.pg, k = cols(pg), y = L.y + rowH;
      pg.text(clip(c.d.title, S.b, 'serif', k.label), pg.x0, y - rowH * 0.3, S.b, 'serif');
      k.x.forEach(function (x) { pg.box(x, y - rowH * 0.86, k.w, rowH * 0.72, 0.75, 0.6); });
      L.y = y;
    });
    L.need(rowH * 1.5);
    var pg = L.pg, k = cols(pg), y = L.y + rowH * 1.35;
    pg.line(pg.x0, L.y + rowH * 0.2, pg.x1, L.y + rowH * 0.2, 0.9, 0.6);
    pg.text(clip('Total (out of ' + total + ')', S.b, 'sansBold', k.label), pg.x0, y - rowH * 0.3, S.b, 'sansBold');
    k.x.forEach(function (x) { pg.box(x, y - rowH * 0.86, k.w, rowH * 0.72, 1.4); });
    L.y = y;
    ranks(L, total);
  }

  function ranks(L, total) {
    var p = L.project, S = L.S, list = p.ai.ranks.slice(0, CX.prompts.RANKS);
    // the heading and all the ranks stay together on one page
    var rw0 = wid(total + '–' + total, S.b, 'sansBold') + S.b * 0.9, blockH = S.h2 + S.b * 0.4;
    if (list.length < CX.prompts.RANKS) blockH += S.b * 7;
    else list.forEach(function (r) {
      var parts = r.split('|');
      blockH += wrap(parts[0], S.b, 'sansBold', L.pg.w - rw0).length * S.lead + (parts[1] ? wrap(parts[1], S.fact, 'serif', L.pg.w - rw0).length * S.fact * 1.35 : 0) + S.b * 0.8;
    });
    L.y += S.b * 1.6;
    if (L.need(Math.min(blockH, L.pg.cb - L.pg.y0 - S.b * 3))) L.y += S.b * 0.4;
    L.y += S.h2;
    L.pg.text('What Is Your Rank?', L.pg.cx, L.y, S.h2, 'serifBold', { align: 'center' });
    L.y += S.b * 0.4;
    if (list.length < CX.prompts.RANKS) {
      if (L.draft) L.placeholder('Your ranks', 'Five rank titles appear here after you paste the reply to prompt ' + extrasNo(p) + ' in step 3.', S.b * 7);
      return;
    }
    var b = bands(total, list.length), rw = wid(total + '–' + total, S.b, 'sansBold') + S.b * 0.9;
    // the best rank first
    list.map(function (r, i) { return { r: r, b: b[i] }; }).reverse().forEach(function (x) {
      var parts = x.r.split('|'), pg0 = L.pg;
      var tl = wrap(parts[0], S.b, 'sansBold', pg0.w - rw), cl = parts[1] ? wrap(parts[1], S.fact, 'serif', pg0.w - rw) : [];
      L.need(tl.length * S.lead + cl.length * S.fact * 1.35 + S.b * 0.8);
      var pg = L.pg, y = L.y + S.b * 0.5;
      tl.forEach(function (l, i) {
        y += S.lead;
        if (!i) pg.text(x.b.lo + '–' + x.b.hi, pg.x0, y - S.lead * 0.26, S.b, 'sansBold');
        pg.text(l, pg.x0 + rw, y - S.lead * 0.26, S.b, 'sansBold');
      });
      cl.forEach(function (l) { y += S.fact * 1.35; pg.text(l, pg.x0 + rw, y - S.fact * 0.3, S.fact, 'serif', { ink: 0.85 }); });
      y += S.b * 0.3;
      pg.line(pg.x0, y, pg.x1, y, 0.75, 0.35);
      L.y = y;
    });
  }

  // One framed page to fill in when the book is done.
  function certificate(L) {
    var p = L.project, S = L.S;
    var pg = L.page('certificate', 'Certificate of Achievement');
    pg.folio = false;
    var top = pg.y0, bot = pg.y1, pad = S.b * 1.3;
    pg.box(pg.x0, top, pg.w, bot - top, 2.2);
    pg.box(pg.x0 + 5, top + 5, pg.w - 10, bot - top - 10, 0.8);
    [[pg.x0 + 5, top + 5], [pg.x1 - 5, top + 5], [pg.x0 + 5, bot - 5], [pg.x1 - 5, bot - 5]].forEach(function (c) { diamond(pg, c[0], c[1], 4.2); });
    var inner = pg.w - 2 * pad, cx = pg.cx, items = [];
    // everything is measured first, then the column is centered in the frame
    function add(h, draw) { items.push({ h: h, draw: draw }); }
    function textRow(str, size, font, gapBefore, o) {
      add(gapBefore + size, function (y) { pg.text(str, cx, y + gapBefore + size * 0.75, size, font, Object.assign({ align: 'center' }, o || {})); });
    }
    function blank(wk, gapBefore) { add(gapBefore + S.b * 1.2, function (y) { pg.line(cx - inner * wk / 2, y + gapBefore + S.b * 1.2, cx + inner * wk / 2, y + gapBefore + S.b * 1.2, 0.9); }); }
    add(S.b * 1.2, function (y) { [-1, 0, 1].forEach(function (k) { star(pg, cx + k * 16, y + S.b * 0.6 + (k ? 2 : 0), k ? 4 : 6); }); });
    var cs = Math.min(S.b * 1.05, inner / Math.max(1, wid('CERTIFICATE', 1, 'sansBold', 0.25)));
    add(S.b * 0.8 + cs, function (y) { pg.text('CERTIFICATE', cx, y + S.b * 0.8 + cs * 0.75, cs, 'sansBold', { align: 'center', ls: cs * 0.25 }); });
    var hs = Math.min(S.h1 * 1.1, inner / Math.max(1, wid('of Achievement', 1, 'serifBold')));
    textRow('of Achievement', hs, 'serifBold', S.b * 0.3);
    add(S.b * 1.6, function (y) { ornament(pg, cx, y + S.b * 0.9, Math.min(70, inner * 0.3)); });
    textRow('This certifies that', S.b, 'serif', S.b * 0.6);
    blank(0.8, S.b * 0.6);
    var span = P.span(p), lines = wrap('took a trip down memory lane through ' + span + ' and answered every question in', S.b, 'serif', inner);
    lines.forEach(function (l, i) { textRow(l, S.b, 'serif', i ? S.b * 0.3 : S.b * 1.1); });
    var t = fit(P.bookTitle(p), 'serifBold', inner * 0.92, S.h2 * 1.1, S.b, 3);
    t.lines.forEach(function (l, i) { textRow(l, t.size, 'serifBold', i ? t.size * 0.2 : S.b * 0.6); });
    if (p.extras.ranks) {
      textRow('and earned the rank of', S.b, 'serif', S.b * 1.1);
      blank(0.66, S.b * 0.5);
    }
    // date and signature side by side
    var lw = inner * 0.42, ls = Math.max(7.5, S.small);
    add(S.b * 2.6 + ls * 1.6, function (y) {
      var ly = y + S.b * 2.6;
      [-1, 1].forEach(function (s, i) {
        var mx = cx + s * inner * 0.26;
        pg.line(mx - lw / 2, ly, mx + lw / 2, ly, 0.9);
        pg.text(i ? 'Signed' : 'Date', mx, ly + ls * 1.4, ls, 'sansBold', { align: 'center', ls: 0.8 });
      });
    });
    var used = items.reduce(function (s, it) { return s + it.h; }, 0), room = bot - top - 2 * pad;
    var rad = Math.min(inner * 0.16, 46), withSeal = room - used > rad * 2 + S.b * 2.4;
    if (withSeal) used += rad * 2 + S.b * 1.6;
    var y = top + pad + Math.max(0, (room - used) / 2);
    items.forEach(function (it) { it.draw(y); y += it.h; });
    if (withSeal) emblem(pg, y + S.b * 1.6 + rad, rad, P.hero(p), '');
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
    if (project.extras.belongs) belongsPage(L);
    var entries = [];
    list.forEach(function (pt) { pt.toc.forEach(function (e) { entries.push(Object.assign({ page: 0 }, e)); pt.entry = entries[entries.length - 1]; }); });
    var toc = contentsPages(L, entries);
    toc.numbered = entries.some(function (e) { return e.no; });
    list.forEach(function (pt) {
      var start = L.pages.length + 1;
      if (pt.type === 'welcome') welcome(L);
      else if (pt.type === 'era') eraOpener(L, pt.c);
      else if (pt.type === 'round') round(L, pt.x);
      else if (pt.type === 'memories') memories(L, pt.c);
      else if (pt.type === 'answers') answers(L, pt.c);
      else if (pt.type === 'key') answerKey(L, content);
      else if (pt.type === 'scores') scoreCard(L, content);
      else if (pt.type === 'certificate') certificate(L);
      pt.entry.page = start;
    });
    drawContents(L, toc, entries);
    folios(L);
    var front = [{ page: 1, title: 'Title page' }];
    if (project.extras.belongs) front.push({ page: 3, title: 'This Book Belongs To' });
    front.push({ page: toc.pages[0].num, title: 'Contents' });
    return {
      W: L.W, H: L.H, pages: L.pages, m: L.m, S: L.S,
      front: front,
      sections: entries.map(function (e) { return { page: e.page, title: e.label, sub: !!e.sub }; })
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

  CX.layout = { PRINT: PRINT, layoutBook: layoutBook, wrap: wrap, fit: fit, parts: parts, sizes: sizes, bands: bands };
})(typeof window !== 'undefined' ? window : globalThis);
