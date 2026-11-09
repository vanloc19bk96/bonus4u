/*
 * Page layout: turns the project into pages of simple drawing items, measured with the real font
 * metrics, so the SVG preview and the PDF place every word identically.
 *
 * Items (lengths in points, y down):
 *   { t:'text', x, y, str, font, size, ink?, ls?, angle? }
 *   { t:'line', x1, y1, x2, y2, w, ink?, dash? }
 *   { t:'rect', x, y, w, h, mode:'fill'|'stroke', ink?, lw?, dash? }
 *   { t:'ellipse', cx, cy, rx, ry, mode, ink?, lw? }
 *   { t:'poly', pts:[x,y,...], closed, mode, ink?, lw? }
 * ink is the gray level (1 = black, default). Nothing is lighter than 10% gray, no line is thinner
 * than 0.75 pt and no text is smaller than 7 pt: the KDP rules.
 *
 * Book order: title, copyright, how to play, the escape log, notes and the opening story; room 1;
 * then the other rooms, the Dead End pages, the last door and the ending, shuffled so the next room
 * is never the next page; then the Field Kit, three rounds of hints, the answers (upside down) and
 * the master key. Each table row goes to a page of its own, so no row stands out. Page numbers that
 * point forward come from the previous pass.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var KDP = CX.kdp, P = CX.plan, Z = CX.puzzles, U = CX.util, D = CX.draw;
  var PT = 72;
  var F = null;

  var PRINT = {
    regular: { base: 11, label: 'Regular (11 pt text)' },
    comfort: { base: 12.5, label: 'Comfortable (12.5 pt text)' },
    large: { base: 14, label: 'Large print (14 pt text)' }
  };

  var ALARMS = ['Something clicks in the wall behind you. That was not the right code.', 'The lock does not move. Somewhere far off, a door slams.', 'Wrong. The lights flicker once, and the room feels smaller.', 'Nothing happens, and that is the worst part.', 'The handle turns and stops. Whatever you did, it was not enough.', 'A low sound runs through the floor. The door stays shut.'];

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
  function Page(L, kind, label, flip) {
    this.num = L.pages.length + 1;
    this.side = this.num % 2 === 1 ? 'right' : 'left';
    this.W = L.W; this.H = L.H;
    var m = L.m, s = L.safe, inner = this.side === 'right' ? m.inside : m.outside, outer = this.side === 'right' ? m.outside : m.inside;
    // an upside-down page has to clear the gutter on both sides, and the page number at both ends
    if (flip) inner = outer = Math.max(m.inside, m.outside);
    this.x0 = inner; this.x1 = L.W - outer;
    this.y0 = m.top; this.y1 = L.H - m.bottom;
    this.safe = {
      x0: this.side === 'right' ? s.inside : s.outside,
      x1: L.W - (this.side === 'right' ? s.outside : s.inside),
      y0: s.top, y1: L.H - s.bottom
    };
    this.cb = this.y1 - L.foot;
    if (flip) this.y0 += L.foot;
    this.cx = (this.x0 + this.x1) / 2;
    this.w = this.x1 - this.x0;
    this.items = []; this.kind = kind; this.label = label || kind; this.meta = {};
    this.folio = true;
    this.flip = !!flip;
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
  Page.prototype.rectFill = function (x, y, w, h, ink) {
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

  // Turns everything on a page a half turn round its center: the answers read upside down.
  function turnOver(pg) {
    var W = pg.W, H = pg.H;
    pg.items.forEach(function (it) {
      if (it.upright) return;
      if (it.t === 'text') { it.x = r2(W - it.x); it.y = r2(H - it.y); it.angle = 180 + (it.angle || 0); delete it.align; }
      else if (it.t === 'line') { it.x1 = r2(W - it.x1); it.x2 = r2(W - it.x2); it.y1 = r2(H - it.y1); it.y2 = r2(H - it.y2); }
      else if (it.t === 'rect') { it.x = r2(W - it.x - it.w); it.y = r2(H - it.y - it.h); }
      else if (it.t === 'ellipse') { it.cx = r2(W - it.cx); it.cy = r2(H - it.cy); }
      else if (it.t === 'poly') { it.pts = it.pts.map(function (v, i) { return r2(i % 2 ? H - v : W - v); }); }
    });
  }

  // ---------- small drawings (gray only) ----------
  function keyhole(pg, cx, cy, r, ink) {
    pg.dot(cx, cy - r * 0.32, r * 0.5, ink);
    pg.poly([cx - r * 0.24, cy - r * 0.1, cx + r * 0.24, cy - r * 0.1, cx + r * 0.42, cy + r * 0.95, cx - r * 0.42, cy + r * 0.95], ink);
  }
  // The ornament of the book: a keyhole between two rules.
  function mark(pg, cx, y, half) {
    pg.line(cx - half, y, cx - 11, y, 0.9, 0.7);
    pg.line(cx + 11, y, cx + half, y, 0.9, 0.7);
    keyhole(pg, cx, y, 8, 0.85);
  }
  function padlock(pg, x, y, s, filled) {
    var w = s, h = s * 0.68, top = y + s * 0.32;
    pg.path([x + w * 0.24, top, x + w * 0.24, y + s * 0.12, x + w * 0.38, y, x + w * 0.62, y, x + w * 0.76, y + s * 0.12, x + w * 0.76, top], Math.max(0.9, s * 0.1), filled ? 1 : 0.55);
    if (filled) pg.rectFill(x, top, w, h);
    else pg.box(x, top, w, h, 0.9, 0.55);
  }
  // The lock meter: one to three locks out of three.
  function meter(pg, xRight, y, level, s) {
    for (var i = 0; i < 3; i++) padlock(pg, xRight - (3 - i) * s * 1.28 + s * 0.28, y - s * 0.86, s, i < level);
  }
  /*
   * A door to fill the foot of a room's first page, in the height it is given. Four kinds, so the
   * rooms don't all look alike.
   */
  function doorArt(pg, cx, bottom, h, no) {
    var kind = (no - 1) % 4, w = h * 0.56, x = cx - w / 2, y = bottom - h, i, a;
    if (kind === 3) {
      // a vault door
      var R = h * 0.46, cy = bottom - R;
      pg.ring(cx, cy, R, 2);
      pg.ring(cx, cy, R * 0.88, 0.9, 0.7);
      for (i = 0; i < 12; i++) { a = i * Math.PI / 6; pg.dot(cx + Math.cos(a) * R * 0.94, cy + Math.sin(a) * R * 0.94, Math.max(1, R * 0.018), 0.8); }
      pg.ring(cx, cy, R * 0.5, 1.4);
      pg.ring(cx, cy, R * 0.12, 1.4);
      for (i = 0; i < 3; i++) { a = i * Math.PI * 2 / 3 - Math.PI / 2; pg.line(cx + Math.cos(a) * R * 0.12, cy + Math.sin(a) * R * 0.12, cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, 2.2); pg.dot(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, R * 0.05); }
      for (i = 0; i < 24; i++) { a = i * Math.PI / 12; pg.line(cx + Math.cos(a) * R * 0.68, cy + Math.sin(a) * R * 0.68, cx + Math.cos(a) * R * (i % 2 ? 0.72 : 0.76), cy + Math.sin(a) * R * (i % 2 ? 0.72 : 0.76), 0.9, 0.8); }
      return;
    }
    var rad = kind === 0 ? w / 2 : 0, top = y + rad, arch = [x, bottom, x, top];
    if (rad) for (a = 180; a <= 360; a += 10) arch.push(cx + Math.cos(a * Math.PI / 180) * rad, top + Math.sin(a * Math.PI / 180) * rad);
    else arch.push(x + w, y);
    arch.push(x + w, top, x + w, bottom);
    pg.path(arch, 2);
    pg.line(x - w * 0.14, bottom, x + w * 1.14, bottom, 2);
    var inset = w * 0.06, ix = x + inset, iw = w - inset * 2, iy = y + inset + (rad ? rad * 0.25 : 0);
    if (kind === 1) {
      // double doors
      pg.line(cx, y + 2, cx, bottom, 1.2);
      [x + w * 0.07, cx + w * 0.07].forEach(function (px) {
        var pw = w * 0.36, ph = (h - w * 0.2) / 2.4;
        pg.box(px, y + w * 0.08, pw, ph, 0.9, 0.7);
        pg.box(px, y + w * 0.08 + ph + w * 0.08, pw, ph, 0.9, 0.7);
      });
      pg.dot(cx - w * 0.05, y + h * 0.56, Math.max(1.5, w * 0.022));
      pg.dot(cx + w * 0.05, y + h * 0.56, Math.max(1.5, w * 0.022));
      return;
    }
    if (kind === 2) {
      // an iron gate
      for (i = 1; i < 7; i++) pg.line(x + i * w / 7, y + 2, x + i * w / 7, bottom, 1.1, 0.85);
      [0.16, 0.5, 0.86].forEach(function (t) { pg.line(x, y + h * t, x + w, y + h * t, 1.6); });
      pg.rectFill(cx - w * 0.07, y + h * 0.46, w * 0.14, h * 0.09, 1);
      keyhole({ dot: function (a2, b, c2) { pg.dot(a2, b, c2, 0.14); }, poly: function (q) { pg.poly(q, 0.14); } }, cx, y + h * 0.5, w * 0.03);
      return;
    }
    // planks and a ring handle
    for (i = 1; i < 5; i++) pg.line(x + i * w / 5, iy - (rad ? rad * 0.2 : 0), x + i * w / 5, bottom, 0.8, 0.45);
    [0.42, 0.76].forEach(function (t) { pg.rectFill(ix - inset, y + h * t, iw + inset * 1.2, Math.max(2, h * 0.018), 0.85); });
    pg.ring(x + w * 0.82, y + h * 0.6, Math.max(2.5, w * 0.045), 1.3);
    keyhole(pg, x + w * 0.82, y + h * 0.67, Math.max(2.5, w * 0.03), 1);
  }

  function diamond(pg, cx, cy, r, ink) { pg.poly([cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy], ink); }

  // ---------- the layout state ----------
  function sizes(b) {
    return { b: b, lead: b * 1.38, h1: b * 2.05, h2: b * 1.5, small: Math.max(8, b * 0.72), folio: Math.max(8.5, b * 0.76) };
  }

  function Layout(project, pages, draft, refs) {
    var t = KDP.trim(project.book.trim);
    this.project = project;
    this.draft = draft;
    this.refs = refs || {};
    this.out = { hint: [{}, {}, {}], sol: {}, room: {}, door: {}, dead: {}, puzzle: {} };
    this.W = t.w * PT; this.H = t.h * PT;
    var m = KDP.margins(pages);
    this.m = { inside: m.inside * PT, outside: m.outside * PT, top: m.top * PT, bottom: m.bottom * PT };
    this.safe = { inside: m.safe.inside * PT, outside: m.safe.outside * PT, top: m.safe.top * PT, bottom: m.safe.bottom * PT };
    this.S = sizes(PRINT[project.book.print] ? PRINT[project.book.print].base : 11);
    this.foot = this.S.folio + 10;
    this.pages = [];
    this.flow = null;
    this.pg = null; this.y = 0;
  }

  Layout.prototype.page = function (kind, label, head, flip) {
    var pg = new Page(this, kind, label, flip);
    this.pg = pg; this.y = pg.y0;
    this.flow = { kind: kind, label: label, head: head, flip: flip };
    if (head) {
      var S = this.S;
      pg.text(head.toUpperCase(), pg.cx, pg.y0 + S.small, S.small, 'sans', { align: 'center', ls: 1.6 });
      this.y = pg.y0 + S.small + S.b * 1.1;
    }
    return pg;
  };

  Layout.prototype.need = function (h) {
    if (this.y + h <= this.pg.cb + 0.01) return false;
    var f = this.flow, meta = this.pg.meta;
    this.page(f.kind, f.label, f.head, f.flip);
    if (meta.room) this.pg.meta.room2 = meta.room;
    return true;
  };

  // Section title block: small label, big title, optional subtitle, a rule or the ornament.
  Layout.prototype.heading = function (eyebrow, title, sub, align) {
    var S = this.S, pg = this.pg, y = this.y + S.b * 0.4, left = align === 'left';
    var x = left ? pg.x0 : pg.cx, o = { align: left ? null : 'center' };
    if (eyebrow) { y += S.small; pg.text(eyebrow.toUpperCase(), x, y, S.small * 1.05, 'sans', Object.assign({ ls: 2.2 }, o)); y += S.b * 0.7; }
    var t = fit(title, 'serifBold', pg.w * (left ? 1 : 0.92), S.h1, S.b * 1.2, 2);
    t.lines.forEach(function (l) { y += t.size * 1.05; pg.text(l, x, y, t.size, 'serifBold', o); y += t.size * 0.12; });
    if (sub) { y += S.b * 0.3; wrap(sub, S.b, 'serif', pg.w * (left ? 1 : 0.88)).forEach(function (l) { y += S.b * 1.32; pg.text(l, x, y, S.b, 'serif', o); }); }
    if (left) { y += S.b * 0.7; pg.line(pg.x0, y, pg.x1, y, 0.9); this.y = y + S.b * 0.8; return; }
    y += S.b * 1.3;
    mark(pg, pg.cx, y, Math.min(70, pg.w * 0.24));
    this.y = y + S.b * 1.5;
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
  Layout.prototype.paras = function (list, gap) {
    var S = this.S, self = this;
    list.forEach(function (t, i) { if (i) self.y += gap == null ? S.b * 0.5 : gap; self.para(t, 'serif', S.b, S.lead); });
  };

  Layout.prototype.bullets = function (items) {
    var S = this.S, self = this;
    items.forEach(function (t) {
      var ind = S.b * 1.2, lines = wrap(t, S.b, 'serif', self.pg.w - ind);
      self.need(lines.length * S.lead + S.b * 0.3);
      self.y += S.b * 0.3;
      diamond(self.pg, self.pg.x0 + S.b * 0.4, self.y + S.lead * 0.74 - S.b * 0.32, S.b * 0.24);
      lines.forEach(function (l) { self.y += S.lead; self.pg.text(l, self.pg.x0 + ind, self.y - S.lead * 0.26, S.b, 'serif'); });
    });
  };

  Layout.prototype.label = function (str) {
    var S = this.S;
    this.need(S.b * 2.6);
    this.y += S.b * 1.3;
    this.pg.text(str.toUpperCase(), this.pg.x0, this.y, S.small * 1.05, 'sansBold', { ls: 2 });
    this.y += S.b * 0.4;
  };

  Layout.prototype.placeholder = function (title, note, h, x, w) {
    var S = this.S;
    this.need(h);
    var pg = this.pg, y = this.y + S.b * 0.4;
    x = x == null ? pg.x0 : x; w = w == null ? pg.w : w;
    pg.box(x, y, w, h - S.b * 0.8, 0.9, 0.35, [5, 4]);
    var ty = y + (h - S.b * 0.8) / 2 - S.b * 0.4;
    pg.text(title, x + w / 2, ty, S.b * 0.95, 'sansBold', { align: 'center', ink: 0.55 });
    wrap(note, S.small * 1.05, 'sans', w * 0.8).forEach(function (l, i) {
      pg.text(l, x + w / 2, ty + S.b * 1.2 + i * S.small * 1.45, S.small * 1.05, 'sans', { align: 'center', ink: 0.55 });
    });
    this.y += h;
  };

  function fillKit(L, s) { return String(s).replace(/\{kit\}/g, String(L.refs.kit || '00')); }
  function roomName(L, room) { return Z.roomName(L.project, room) || 'Room ' + room.no; }

  // ---------- front matter ----------
  function titlePage(L) {
    var p = L.project, S = L.S, pg = L.page('title', 'Title page');
    pg.folio = false;
    var title = P.bookTitle(p), sub = P.bookSubtitle(p), y = pg.y0 + pg.H * 0.1;
    var t = fit(title, 'serifBold', pg.w * 0.9, Math.min(32, pg.w / 8.5), S.b * 1.3, 4);
    t.lines.forEach(function (l) { y += t.size * 1.1; pg.text(l, pg.cx, y, t.size, 'serifBold', { align: 'center' }); });
    if (sub) {
      y += S.b * 0.7;
      var ss = Math.max(S.b * 0.95, 10.5);
      wrap(sub, ss, 'serif', pg.w * 0.84).forEach(function (l) { y += ss * 1.38; pg.text(l, pg.cx, y, ss, 'serif', { align: 'center' }); });
    }
    keyhole(pg, pg.cx, Math.max(y + 60, pg.y0 + pg.H * 0.45), 34, 0.85);
    var author = (p.book.author || '').trim();
    if (author || L.draft) pg.text(author || 'Your pen name', pg.cx, pg.cb - S.b, S.b * 1.05, 'serif', { align: 'center', ink: author ? 1 : 0.45 });
  }

  function copyrightPage(L) {
    var p = L.project, S = L.S, pg = L.page('copyright', 'Copyright');
    pg.folio = false;
    var size = Math.max(8.5, S.b * 0.78), lead = size * 1.5, year = new Date().getFullYear(), author = (p.book.author || '').trim();
    var paras = [
      'Copyright © ' + year + (author ? ' ' + author : '') + '. All rights reserved.',
      'No part of this book may be copied or shared in any form without written permission from the author, except for short quotations in reviews.',
      'This is a work of fiction. Names, characters and places are products of the imagination.',
      'Every code, route and page reference in this book was checked by machine before printing.',
      'First edition'
    ];
    var lines = [];
    paras.forEach(function (t, i) { if (i) lines.push(''); Array.prototype.push.apply(lines, wrap(t, size, 'serif', pg.w * 0.85)); });
    var y = pg.cb - lines.length * lead;
    lines.forEach(function (l) { y += lead; if (l) pg.text(l, pg.cx, y - lead * 0.3, size, 'serif', { align: 'center' }); });
  }

  function howPage(L) {
    var p = L.project, S = L.S, pl = p.plan, refs = L.refs, kid = P.audience(pl.audience).kid;
    L.page('how', 'How to Play', 'How to play');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Read This First', 'All you need is a pencil. No phone, no app and no scissors.');
    L.bullets([
      'Each room holds ' + pl.perRoom + ' puzzles, and every puzzle gives you one digit. Write it in the box at the foot of the page.',
      'The last page of each room is the door. Your ' + pl.perRoom + ' digits, in order, make its code. Find that code in the door’s table and turn to the page it names.',
      'The right code takes you to the next room. A wrong code lands on a Dead End page, which tells you where to look and sends you back. Nothing is lost.',
      'The rooms are not in order. ' + (kid ? 'Please do not flip ahead: it spoils the surprise!' : 'Only follow the page numbers your codes give you, or you will read what you have not earned.'),
      pl.finale === 'culprit' ? 'Every room you leave can clear a suspect. Cross them off in your Escape Log on page ' + (refs.log || 0) + '. When one is left, the last door lets you name them.'
        : 'Every room you leave hands you a key letter. Keep them in your Escape Log on page ' + (refs.log || 0) + '. At the last door, the letters make one word.'
    ]);
    L.label('Stuck?');
    L.para('At the foot of every puzzle you will find four page numbers: three hints that get more and more helpful, and the full answer. Take only as much help as you want.', 'serif', S.b, S.lead);
    L.y += S.b * 0.3;
    L.para(pl.flip ? 'The answers are printed upside down, so a stray glance can’t spoil them.' : 'Hints and answers sit in separate parts of the book, so a stray glance can’t spoil them.', 'serif', S.b, S.lead);
    if (refs.kit) { L.y += S.b * 0.3; L.para('The Field Kit on page ' + refs.kit + ' holds the alphabet and the codes you may need.', 'serif', S.b, S.lead); }
    L.label('How hard is it?');
    var s = S.b * 1.05;
    L.need(s * 1.8);
    meter(L.pg, L.pg.x0 + s * 3.9, L.y + s * 1.25, 1, s);
    L.pg.text('A gentle one', L.pg.x0 + s * 4.5, L.y + s * 1.2, S.b, 'serif');
    meter(L.pg, L.pg.x0 + L.pg.w * 0.5 + s * 3.9, L.y + s * 1.25, 3, s);
    L.pg.text('A tough one', L.pg.x0 + L.pg.w * 0.5 + s * 4.5, L.y + s * 1.2, S.b, 'serif');
    L.y += s * 1.8;
    howExample(L);
  }

  // How a door works, step by step, with made-up digits.
  function howExample(L) {
    var S = L.S;
    L.page('how', 'How to Play', 'How to play');
    L.heading('', 'A Door, Step by Step');
    L.para('Say a room has four puzzles, and they give you 7, 3, 0 and 5. Write the digits in the boxes on the door page, in order:', 'serif', S.b, S.lead);
    L.y += S.b * 0.5;
    var pg = L.pg, ds = Math.min(34, pg.w / 6), digits = ['7', '3', '0', '5'], x = pg.cx - ds * 2;
    digits.forEach(function (d, i) {
      pg.box(x + i * ds + 2, L.y, ds - 4, ds - 4, 1.5);
      pg.text(d, x + (i + 0.5) * ds, L.y + ds * 0.66, ds * 0.56, 'sansBold', { align: 'center' });
    });
    L.y += ds + S.b * 0.3;
    L.para('Then look for 7 3 0 5 in the table:', 'serif', S.b, S.lead);
    L.y += S.b * 0.4;
    var rows = [['7 3 0 1', '43'], ['7 3 0 5', '18'], ['7 8 0 5', '62']], rh = S.b * 1.9, tx0 = pg.x0 + pg.w * 0.14, tx1 = pg.x1 - pg.w * 0.14;
    pg.box(pg.x0 + pg.w * 0.08, L.y, pg.w * 0.84, rh * rows.length + 6, 1.2);
    rows.forEach(function (r, i) {
      var cy = L.y + 3 + (i + 0.72) * rh, turn = 'turn to page ' + r[1], w = wid(turn, S.b, 'serif');
      if (i === 1) pg.rectFill(pg.x0 + pg.w * 0.09, L.y + 3 + i * rh, pg.w * 0.82, rh, 0.12);
      pg.text(r[0], tx0, cy, S.b, 'sansBold');
      pg.line(tx0 + wid(r[0], S.b, 'sansBold') + 7, cy - 1, tx1 - w - 7, cy - 1, 0.75, 0.35, [1, 3]);
      pg.text(turn, tx1 - w, cy, S.b, 'serif');
    });
    L.y += rh * rows.length + 6 + S.b * 0.4;
    L.para('Off you go to page 18. If that is the right code, the next room is waiting there. If not, a Dead End page tells you which puzzle to look at again, and sends you back to the door.', 'serif', S.b, S.lead);
    L.y += S.b * 0.4;
    L.para('If your code is not in the table at all, one of your digits is off. Go back through the room’s puzzles, and use the hints if you like.', 'serif', S.b, S.lead);
    L.label('Playing together?');
    L.para('Most puzzles stand alone, so a group can split up the pages of a room and bring the digits back to the door. Keep your time in the log and try to beat it.', 'serif', S.b, S.lead);
    L.label('Your pencil is your only tool');
    L.para('Write in the book as much as you like: the margins are for your working. There is nothing to cut out, scan or look up.', 'serif', S.b, S.lead);
  }

  function logPage(L, M) {
    var p = L.project, S = L.S, pl = p.plan, kid = P.audience(pl.audience).kid;
    L.page('log', 'Escape Log', 'Escape log');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Your Escape Log', kid ? 'Write down your codes here as you go.' : 'Your way through the book. Write it all down: you will need it.', 'left');
    var pg = L.pg, n = pl.perRoom, ds = Math.max(13, S.b * 1.3), culprit = pl.finale === 'culprit', rowH = ds + 5, small = Math.max(8, S.b * 0.84);
    var colKey = pg.x1 - ds, colDigits = colKey - (culprit ? 0 : S.b * 1.2) - n * ds;
    if (culprit) colDigits = pg.x1 - n * ds;
    L.pg.text('ROOM', pg.x0, L.y + small, small * 0.86, 'sansBold', { ls: 1.2 });
    L.pg.text('CODE', colDigits + n * ds / 2, L.y + small, small * 0.86, 'sansBold', { align: 'center', ls: 1.2 });
    if (!culprit) L.pg.text('KEY', colKey + ds / 2, L.y + small, small * 0.86, 'sansBold', { align: 'center', ls: 1 });
    L.y += small * 1.5;
    M.rooms.forEach(function (room) {
      L.need(rowH);
      var pgn = L.pg, cy = L.y + rowH / 2, name = room.no + '. ' + roomName(L, room), maxW = colDigits - pgn.x0 - 6;
      var ft = fit(name, 'serif', maxW, small, 7.5, 1), line = ft.lines[0] || '';
      while (wid(line, ft.size, 'serif') > maxW && line.length > 4) line = line.slice(0, -2).trim() + '…';
      pgn.text(line, pgn.x0, cy + ft.size * 0.32, ft.size, 'serif');
      for (var i = 0; i < n; i++) pgn.box(colDigits + i * ds, cy - ds / 2 + 1, ds, ds - 2, 0.75, 0.7);
      if (!culprit) pgn.box(colKey, cy - ds / 2 + 1, ds, ds - 2, 1.2);
      L.y += rowH;
    });
    if (culprit) {
      L.label('The suspects: cross them off');
      var list = p.story.suspects.length ? p.story.suspects : (L.draft ? [{ name: 'A suspect', about: 'They come from the story prompt in step 3.' }] : []);
      list.forEach(function (s) {
        var lines = wrap(s.about || '', small, 'serif', L.pg.w - S.b * 1.8);
        L.need(S.lead + lines.length * small * 1.3 + 6);
        var pgn = L.pg;
        pgn.box(pgn.x0, L.y + 3, S.b, S.b, 0.9);
        pgn.text(s.name, pgn.x0 + S.b * 1.6, L.y + S.b, S.b, 'sansBold');
        L.y += S.lead;
        lines.forEach(function (l) { pgn.text(l, pgn.x0 + S.b * 1.6, L.y + small * 0.9, small, 'serif'); L.y += small * 1.3; });
        L.y += 5;
      });
    } else {
      L.label('Key letters');
      var w = pl.rooms, ks = Math.min(L.pg.w / w, ds * 1.3);
      L.need(ks + 8);
      var kx = L.pg.cx - ks * w / 2;
      for (var k = 0; k < w; k++) L.pg.box(kx + k * ks + 1, L.y + 3, ks - 2, ks - 2, 1.1);
      L.y += ks + 8;
    }
    L.label('Time');
    L.need(S.b * 2.2);
    var pg2 = L.pg, y = L.y + S.b * 1.5;
    pg2.text('Start:', pg2.x0, y, S.b, 'serif');
    pg2.line(pg2.x0 + S.b * 3, y + 2, pg2.x0 + pg2.w * 0.46, y + 2, 0.75, 0.6);
    pg2.text('Out:', pg2.x0 + pg2.w * 0.54, y, S.b, 'serif');
    pg2.line(pg2.x0 + pg2.w * 0.54 + S.b * 2.2, y + 2, pg2.x1, y + 2, 0.75, 0.6);
    L.y = y + S.b;
  }

  function notesPage(L) {
    var S = L.S, pg = L.page('notes', 'Notes', 'Notes');
    var y = pg.y0 + S.b * 2.6;
    while (y < pg.cb - 2) { pg.line(pg.x0, y, pg.x1, y, 0.75, 0.4); y += S.b * 2.05; }
  }

  function openingPage(L) {
    var p = L.project, S = L.S, st = p.story;
    L.page('opening', 'The Story Begins');
    L.heading('', 'It Begins');
    if (st.opening.length) L.paras(st.opening);
    else if (L.draft) L.placeholder('Your opening story', 'It comes from the first prompt in step 3.', S.b * 9);
    L.y += S.b;
    L.para('When you are ready, turn the page and step into the first room.', 'sans', S.b * 0.94, S.lead, 0, 0.8);
  }

  // ---------- the rooms ----------
  // What the last room handed over, and the way into this one.
  function rewardPanel(L, reward) {
    var S = L.S;
    if (reward.letter) {
      var h = S.b * 3.4;
      L.need(h + S.b);
      var pg = L.pg, y = L.y + S.b * 0.4, tile = h - S.b * 0.9;
      pg.box(pg.x0, y, pg.w, h, 1.2);
      pg.box(pg.x0 + S.b * 0.5, y + S.b * 0.45, tile, tile, 1.4);
      pg.text(reward.letter, pg.x0 + S.b * 0.5 + tile / 2, y + S.b * 0.45 + tile * 0.72, tile * 0.72, 'sansBold', { align: 'center' });
      pg.text('KEY LETTER', pg.x0 + tile + S.b * 1.2, y + S.b * 1.45, S.small, 'sansBold', { ls: 1.8 });
      pg.text('Write it in your Escape Log on page ' + (L.refs.log || 0) + '.', pg.x0 + tile + S.b * 1.2, y + S.b * 2.65, S.b * 0.96, 'serif');
      L.y = y + h + S.b * 0.6;
    } else if (reward.clears) {
      var tx = reward.evidence || (L.draft ? 'The clue that clears this suspect comes from the room prompt.' : ''), lines = wrap(tx, S.b, 'serif', L.pg.w - S.b * 1.6);
      var eh = S.b * 2.6 + lines.length * S.lead;
      L.need(eh + S.b);
      var pe = L.pg, ey = L.y + S.b * 0.4;
      pe.box(pe.x0, ey, pe.w, eh, 1.2);
      pe.text('EVIDENCE', pe.x0 + S.b * 0.8, ey + S.b * 1.3, S.small, 'sansBold', { ls: 1.8 });
      lines.forEach(function (l, i) { pe.text(l, pe.x0 + S.b * 0.8, ey + S.b * 2.2 + S.lead * (i + 0.6), S.b, 'serif'); });
      L.y = ey + eh + S.b * 0.6;
      L.para('Cross ' + reward.clears + ' off your list.', 'sansBold', S.b * 0.94, S.lead);
    }
  }

  function roomOpener(L, room, M) {
    var p = L.project, S = L.S, d = p.rooms[room.id] || P.emptyRoom(), prev = M.rooms[room.no - 2], name = roomName(L, room);
    var pg = L.page('room', name);
    pg.meta.room = room.no;
    L.out.room[room.id] = pg.num;
    if (prev) {
      var pd = p.rooms[prev.id] || P.emptyRoom();
      if (pd.exit.length) { L.paras(pd.exit); L.y += S.b * 0.4; }
      else if (L.draft) L.placeholder('How you got out of ' + roomName(L, prev), 'From the room prompts in step 3.', S.b * 5);
      rewardPanel(L, M.rewards[prev.no - 1]);
      L.y += S.b * 0.3;
    }
    L.need(S.b * 8);
    L.heading('Room ' + room.no, name);
    if (d.enter.length) L.paras(d.enter);
    else if (L.draft) L.placeholder('Your way into this room', 'From the room prompts in step 3.', S.b * 7);
    L.y += S.b * 0.7;
    L.para(room.slots.length + ' puzzles stand between you and the door. Turn the page.', 'sans', S.b * 0.94, S.lead, 0, 0.8);
    var room4art = L.pg.cb - L.y - S.b * 1.5;
    if (room4art > 60) doorArt(L.pg, L.pg.cx, L.pg.cb - 2, Math.min(room4art, L.pg.w * 0.72), room.no);
  }

  function puzzlePage(L, room, slot) {
    var p = L.project, S = L.S, d = Z.dataOf(p, slot), built = Z.get(p, slot), ok = Z.isBuilt(built);
    var name = 'Puzzle ' + slot.key, pg = L.page('puzzle', name);
    pg.meta.slot = slot.id; pg.meta.key = slot.key;
    L.out.puzzle[slot.id] = pg.num;
    var hs = S.small, y = pg.y0 + hs;
    pg.text('ROOM ' + room.no + '  ·  PUZZLE ' + slot.key, pg.x0, y, hs, 'sansBold', { ls: 1.5 });
    meter(pg, pg.x1, y + 1, slot.level, hs * 1.05);
    y += S.b * 0.55;
    var title = d.title.trim() || (L.draft ? CX.engine.kind(slot.kind).label : '');
    var tl = fit(title, 'serifBold', pg.w * 0.96, S.h2 * 1.1, S.b * 1.1, 2);
    tl.lines.forEach(function (l) { y += tl.size * 1.1; pg.text(l, pg.cx, y, tl.size, 'serifBold', { align: 'center', ink: d.title.trim() ? 1 : 0.5 }); });
    y += S.b * 0.25;

    // the foot of the page: the digit box, then the way to the hints
    var R = L.refs, rs = Math.max(7.5, S.b * 0.72), footY = pg.cb, box = Math.max(24, S.b * 2.2);
    var rescue = 'Stuck? Hints: page ' + ((R.hint && R.hint[0][slot.id]) || 0) + ', page ' + ((R.hint && R.hint[1][slot.id]) || 0) + ', page ' + ((R.hint && R.hint[2][slot.id]) || 0) + '. Answer: page ' + ((R.sol && R.sol[slot.id]) || 0) + '.';
    pg.text(rescue, pg.cx, footY - 1, rs, 'sans', { align: 'center', ink: 0.85 });
    var by = footY - rs - 5 - box;
    pg.line(pg.x0, by - 5, pg.x1, by - 5, 0.75, 0.4);
    var lab = 'YOUR DIGIT', lw = wid(lab, S.small, 'sansBold', 1.5), tot = lw + 10 + box, bx = pg.cx - tot / 2;
    pg.text(lab, bx, by + box / 2 + S.small * 0.33, S.small, 'sansBold', { ls: 1.5 });
    pg.box(bx + lw + 10, by, box, box, 1.5);
    var bottom = by - 12;

    if (!ok) {
      L.pg = pg; L.y = y;
      L.flow = { kind: 'puzzle', label: name };
      if (L.draft) L.placeholder(CX.engine.kind(slot.kind).label + ' goes here', built.problem === 'no message yet' || !built.problem ? 'Copy the room prompts in step 3, then paste the replies back. The app builds the puzzle.' : 'It can’t be built yet: ' + built.problem + '.', Math.max(S.b * 6, bottom - y - S.b));
      return;
    }

    // the story and the task take what they need, and the drawing gets the rest
    var story = d.story.trim(), task = built.task.map(function (t) { return fillKit(L, t); }).join(' ');
    var minDraw = { logic: 250, search: 220, picture: 200, maze: 200, walk: 210, lock: 190, count: 190 }[slot.kind] || 150, sz = S.b, lines1, lines2, lead;
    for (;;) {
      lead = sz * 1.32;
      lines1 = wrap(story, sz, 'serif', pg.w);
      lines2 = wrap(task, sz * 0.94, 'sans', pg.w);
      if (bottom - y - (lines1.length + lines2.length) * lead - sz <= minDraw - 1 && sz > Math.max(8.5, S.b * 0.72)) sz -= 0.25; else break;
    }
    // as much space around the words as the drawing can spare: each try is drawn, checked and taken back
    var textH = (lines1.length + lines2.length) * lead, drawn = pg.items.length, air = 1;
    function drawBox(a) { var top = y + textH + sz * (0.95 + 1.5 * a); return { x: pg.x0, y: top, w: pg.w, h: bottom - top }; }
    while (air > 0 && !D.draw(pg, built.draw, drawBox(air), { b: S.b })) { pg.items.length = drawn; air -= 0.25; }
    pg.items.length = drawn;
    y += sz * 0.65 * air;
    lines1.forEach(function (l) { y += lead; pg.text(l, pg.x0, y - lead * 0.2, sz, 'serif'); });
    y += sz * (0.4 + 0.35 * air);
    lines2.forEach(function (l) { y += lead; pg.text(l, pg.x0, y - lead * 0.2, sz * 0.94, 'sans'); });
    y += sz * (0.55 + 0.5 * air);
    var fine = D.draw(pg, built.draw, { x: pg.x0, y: y, w: pg.w, h: bottom - y }, { b: S.b });
    if (!fine) pg.meta.tight = slot.key;
  }

  function doorPage(L, room, M) {
    var S = L.S, name = roomName(L, room), pg = L.page('door', 'The door of ' + name), door = M.doors[room.id];
    pg.meta.door = room.no;
    L.out.door[room.id] = pg.num;
    L.heading('Room ' + room.no, 'The Door', 'Write your ' + room.slots.length + ' digits in order, then find the code in the table.');
    var ds = Math.min(40, pg.w / (room.slots.length + 1.5)), W = ds * room.slots.length, x = pg.cx - W / 2, y = L.y + S.small;
    room.slots.forEach(function (s, i) {
      pg.text(s.key, x + (i + 0.5) * ds, y, S.small, 'sans', { align: 'center' });
      pg.box(x + i * ds + 2, y + 4, ds - 4, ds - 4, 1.5);
    });
    y += ds + 14;
    L.y = y;
    if (!door) {
      if (L.draft) L.placeholder('The code table goes here', 'It is built when every puzzle of this room is in.', S.b * 9);
      return;
    }
    var rowH = Math.min(S.b * 1.9, (pg.cb - y - S.b * 5) / door.table.length), size = Math.max(9, Math.min(S.b * 1.05, rowH * 0.62));
    pg.box(pg.x0 + pg.w * 0.08, y, pg.w * 0.84, rowH * door.table.length + 8, 1.2);
    var tx0 = pg.x0 + pg.w * 0.13, tx1 = pg.x1 - pg.w * 0.13, rows = [];
    door.table.forEach(function (row, i) {
      var cy = y + 4 + (i + 0.72) * rowH, target = row.real ? nextPage(L, room, M) : deadPage(L, room, row.code);
      pg.text(row.code.split('').join(' '), tx0, cy, size, 'sansBold');
      var turn = 'turn to page ' + (target || 0), w = wid(turn, size, 'serif');
      pg.line(tx0 + wid(row.code.split('').join(' '), size, 'sansBold') + 7, cy - 1, tx1 - w - 7, cy - 1, 0.75, 0.35, [1, 3]);
      pg.text(turn, tx1 - w, cy, size, 'serif');
      rows.push({ code: row.code, page: target, real: row.real });
    });
    pg.meta.rows = rows;
    L.y = y + rowH * door.table.length + 8 + S.b * 0.6;
    var small = Math.max(8.5, S.b * 0.86);
    wrap('Code not in the table? At least one digit is off. The hints for each puzzle are named at the foot of its page.', small, 'serif', pg.w).forEach(function (l) { L.y += small * 1.32; pg.text(l, pg.x0, L.y, small, 'serif', { ink: 0.85 }); });
  }

  // The page a right code goes to.
  function nextPage(L, room, M) {
    var next = M.rooms[room.no];
    return next ? L.refs.room && L.refs.room[next.id] : L.refs.final;
  }
  function deadPage(L, room, code) { return L.refs.dead && L.refs.dead[room.id + '|' + code]; }

  // ---------- the Dead End pages ----------
  /*
   * Every false code gets a short entry on a Dead End page. A door's rows always go to different
   * pages, and so do the false answers at the last door. Returns the pages as lists of entries.
   */
  function planDead(L, M) {
    var S = L.S, inner = L.W - L.m.inside - L.m.outside, size = Math.max(8.5, S.b * 0.92), lead = size * 1.3;
    var capacity = L.H - L.m.top - L.m.bottom - L.foot - S.b * 8.5, entries = [];
    M.rooms.forEach(function (room) {
      var door = M.doors[room.id];
      if (!door) return;
      door.table.forEach(function (row) {
        if (row.real) return;
        var pz = Z.roomPuzzles(L.project, room), text;
        if (row.wrong.length === 1) {
          var q = pz[row.wrong[0]];
          text = 'Look at puzzle ' + q.slot.key + ' again: ' + fillKit(L, q.pz.trap.note) + '.';
        } else {
          text = 'More than one digit is off. Look again at puzzles ' + row.wrong.map(function (i) { return pz[i].slot.key; }).join(', ').replace(/, ([^,]*)$/, ' and $1') + '.';
        }
        entries.push({ group: room.id, id: room.id + '|' + row.code, head: 'Room ' + room.no + ': ' + row.code.split('').join(' '), text: text, back: function (R) { return R.door && R.door[room.id]; } });
      });
    });
    M.finalWrong.forEach(function (x) {
      entries.push({ group: 'final', id: 'final|' + x.id, head: x.head, text: x.text, back: function (R) { return R.final; } });
    });
    entries.forEach(function (e) {
      e.lines = wrap(e.text + ' Back to page 000.', size, 'serif', inner);
      e.h = lead * (e.lines.length + 1) + size * 0.75;
    });
    var pool = [], total = entries.reduce(function (s, e) { return s + e.h; }, 0);
    // enough pages from the start, so they come out evenly full
    var start = Math.max(CX.puzzles.ROWS - 1, Math.ceil(total / capacity * 1.08));
    for (var i = 0; i < start; i++) pool.push({ used: 0, list: [], groups: {} });
    entries.forEach(function (e) {
      var best = null;
      pool.forEach(function (pg) { if (!pg.groups[e.group] && pg.used + e.h <= capacity && (!best || pg.used < best.used)) best = pg; });
      if (!best) { best = { used: 0, list: [], groups: {} }; pool.push(best); }
      best.used += e.h; best.groups[e.group] = 1; best.list.push(e);
    });
    pool.forEach(function (pg, k) { pg.index = k; pg.list.forEach(function (e) { e.page = k; }); });
    M.deadSize = size; M.deadLead = lead;
    return pool;
  }

  function deadEndPage(L, M, info) {
    var S = L.S, st = L.project.story, alarms = st.alarms.length ? st.alarms : ALARMS, alarm = alarms[info.index % alarms.length];
    var pg = L.page('dead', 'Dead End');
    pg.meta.entries = [];
    var y = pg.y0 + S.b * 1.2;
    keyhole(pg, pg.cx, y + 8, 14, 0.85);
    y += S.b * 2.6;
    pg.text('DEAD END', pg.cx, y + S.h1 * 0.72, S.h1 * 1.05, 'sansBold', { align: 'center', ls: 2.4 });
    y += S.h1 * 1.1;
    wrap(alarm, S.b, 'serif', pg.w * 0.9).forEach(function (l) { y += S.lead; pg.text(l, pg.cx, y - 3, S.b, 'serif', { align: 'center', ink: 0.85 }); });
    y += S.b * 0.7;
    pg.line(pg.x0, y, pg.x1, y, 0.9, 0.6);
    y += S.b * 0.5;
    var size = M.deadSize, lead = M.deadLead;
    info.list.forEach(function (e) {
      L.out.dead[e.id] = pg.num;
      var back = e.back(L.refs) || 0;
      pg.text(e.head, pg.x0, y + lead * 0.8, size, 'sansBold');
      y += lead;
      wrap(e.text + ' Back to page ' + back + '.', size, 'serif', pg.w).forEach(function (l) { pg.text(l, pg.x0, y + lead * 0.8, size, 'serif'); y += lead; });
      y += size * 0.75;
      pg.meta.entries.push({ id: e.id, back: back });
    });
  }

  // ---------- the last door and the ending ----------
  function finalPage(L, M) {
    var p = L.project, S = L.S, st = p.story, last = M.rooms[M.rooms.length - 1], pd = p.rooms[last.id] || P.emptyRoom(), culprit = p.plan.finale === 'culprit';
    var pg = L.page('final', 'The Last Door');
    pg.meta.final = true;
    L.out.final = pg.num;
    if (pd.exit.length) { L.paras(pd.exit); L.y += S.b * 0.3; }
    rewardPanel(L, M.rewards[last.no - 1]);
    L.need(S.b * 16);
    L.heading('', 'The Last Door', culprit ? 'One name is left on your list. Say it.' : 'Your key letters make one word. Find it below.');
    if (!culprit && st.wordClue.trim()) { L.para(st.wordClue.trim(), 'serif', S.b, S.lead); L.y += S.b * 0.3; }
    var rows = M.finalRows;
    if (!rows.length) {
      if (L.draft) L.placeholder('The last lock goes here', 'It comes from the first prompt in step 3.', S.b * 8);
      return;
    }
    var y = L.y + S.b * 0.3, rowH = S.b * 2, size = S.b * 1.05, tx0 = L.pg.x0 + L.pg.w * 0.1, tx1 = L.pg.x1 - L.pg.w * 0.1, out = [];
    L.pg.meta.rows = out;
    L.pg.box(tx0 - L.pg.w * 0.03, y, L.pg.w * 0.86, rowH * rows.length + 6, 1.2);
    rows.forEach(function (row, i) {
      var cy = y + 3 + (i + 0.72) * rowH, target = row.real ? L.refs.ending : (L.refs.dead && L.refs.dead['final|' + row.id]);
      L.pg.text(row.label, tx0, cy, size, 'sansBold');
      var turn = 'turn to page ' + (target || 0), w = wid(turn, size, 'serif');
      L.pg.line(tx0 + wid(row.label, size, 'sansBold') + 7, cy - 1, tx1 - w - 7, cy - 1, 0.75, 0.35, [1, 3]);
      L.pg.text(turn, tx1 - w, cy, size, 'serif');
      out.push({ code: row.id, page: target, real: row.real });
    });
    L.y = y + rowH * rows.length + 6;
  }

  function endingPage(L) {
    var p = L.project, S = L.S, st = p.story, kid = P.audience(p.plan.audience).kid;
    var pg = L.page('ending', 'The Way Out');
    pg.meta.ending = true;
    L.out.ending = pg.num;
    L.heading('', p.plan.finale === 'culprit' ? 'Case Closed' : 'You Got Out');
    if (st.ending.length) L.paras(st.ending);
    else if (L.draft) L.placeholder('Your ending', 'It comes from the first prompt in step 3.', S.b * 9);
    L.y += S.b;
    var h = S.b * 10.5;
    if (L.y + h > L.pg.cb) { L.page('ending', 'The Way Out'); }
    var c = L.pg, y = Math.max(L.y, c.cb - h);
    c.box(c.x0, y, c.w, h, 1.4);
    c.box(c.x0 + 4, y + 4, c.w - 8, h - 8, 0.75, 0.5);
    c.text(kid ? 'ESCAPE EXPERT' : 'ESCAPED', c.cx, y + S.b * 2.1, S.b * 1.4, 'sansBold', { align: 'center', ls: 3 });
    [kid ? 'Name' : 'Escaped by', 'Date', 'Time', 'Hints used'].forEach(function (lab, i) {
      var ly = y + S.b * (4 + i * 1.5);
      c.text(lab + ':', c.x0 + S.b, ly, S.b, 'serif');
      c.line(c.x0 + S.b + wid(lab + ':', S.b, 'serif') + 6, ly + 2, c.x1 - S.b, ly + 2, 0.75, 0.6);
    });
  }

  // ---------- back matter ----------
  function fieldKit(L) {
    var S = L.S;
    L.out.kit = L.pages.length + 1;
    L.page('kit', 'Field Kit', 'Field kit');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Field Kit', 'Everything here is fair to use at any time.', 'left');
    var pg = L.pg;
    L.label('The alphabet');
    L.y += S.b * 0.4;
    L.y += D.alphabetTable(pg, pg.x0, L.y, pg.w) + S.b * 0.4;
    L.label('Morse code');
    L.y += S.b * 0.4;
    L.y += D.morseChart(pg, pg.x0, L.y, pg.w, Math.max(9, S.b * 0.9)) + S.b * 0.2;
    L.label('The shape code');
    L.y += S.b * 0.5;
    L.y += D.pigKey(pg, pg.x0, L.y, pg.w, 72);
  }

  function hintRow(L, key, text, flipSize) {
    var S = L.S, size = flipSize || Math.max(8.5, S.b * 0.92), lead = size * 1.3, nw = wid('00.0', size, 'sansBold') + size * 0.7;
    var lines = wrap(text, size, 'serif', L.pg.w - nw);
    L.need(lines.length * lead + size * 0.45);
    var pg = L.pg;
    pg.text(key, pg.x0 + nw - size * 0.7, L.y + lead * 0.78, size, 'sansBold', { align: 'right' });
    lines.forEach(function (l, i) { pg.text(l, pg.x0 + nw, L.y + lead * (i + 0.78), size, 'serif'); });
    L.y += lines.length * lead + size * 0.45;
    return pg;
  }

  var HINT_NAMES = [['First Hints', 'A nudge: what to look at first.'], ['Second Hints', 'The way in: how the puzzle works.'], ['Last Hints', 'Nearly there: everything but the digit.']];

  function hintsSection(L, M, round) {
    var ready = M.slots.filter(function (s) { return Z.isBuilt(Z.get(L.project, s)); });
    if (!ready.length) return;
    var name = HINT_NAMES[round];
    L.page('hints', name[0], name[0]);
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', name[0], name[1], 'left');
    ready.forEach(function (s) {
      var pg = hintRow(L, s.key, fillKit(L, Z.get(L.project, s).hints[round]));
      L.out.hint[round][s.id] = pg.num;
    });
  }

  function solutions(L, M) {
    var p = L.project, S = L.S, flip = p.plan.flip, ready = M.slots.filter(function (s) { return Z.isBuilt(Z.get(p, s)); });
    if (!ready.length) return;
    L.page('answers', 'Answers', 'Answers', flip);
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Answers', null, 'left');
    var size = Math.max(8.5, S.b * 0.92), lead = size * 1.3;
    ready.forEach(function (s) {
      var built = Z.get(p, s), d = Z.dataOf(p, s), body = [], solved = built.solved && built.solved.type ? built.solved : null;
      built.steps.forEach(function (t) { Array.prototype.push.apply(body, wrap(fillKit(L, t), size, 'serif', L.pg.w)); });
      var picH = solved ? D.SOLVED_H[solved.type] : 0, need = lead * (1 + body.length) + picH + size * 1.2;
      L.need(need);
      var pg = L.pg, title = s.key + (d.title.trim() ? '  ' + d.title.trim() : '');
      L.out.sol[s.id] = pg.num;
      pg.text(title, pg.x0, L.y + lead * 0.8, size, 'sansBold');
      var dg = 'Digit: ' + built.digit;
      pg.text(dg, pg.x1, L.y + lead * 0.8, size, 'sansBold', { align: 'right' });
      L.y += lead;
      body.forEach(function (l) { pg.text(l, pg.x0, L.y + lead * 0.8, size, 'serif'); L.y += lead; });
      if (solved) { L.y += 3; D.draw(pg, solved, { x: pg.x0, y: L.y, w: pg.w, h: picH - 5 }, { b: S.b, solved: true }); L.y += picH - 3; }
      L.y += size * 1.2;
    });
    // the safety net: every code and every page in one place
    L.out.master = L.pages.length + 1;
    L.page('master', 'Master Key', 'Master key', flip);
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'The Master Key', 'Completely stuck at a door? Here is every code and where it leads.', 'left');
    M.rooms.forEach(function (room) {
      var door = M.doors[room.id];
      if (!door) return;
      var next = nextPage(L, room, M);
      L.need(lead * 1.25);
      var pg = L.pg;
      pg.text(room.no + '. ' + fit(roomName(L, room), 'serif', pg.w * 0.5, size, 7.5, 1).lines[0], pg.x0, L.y + lead, size, 'serif');
      pg.text(door.code.split('').join(' '), pg.x0 + pg.w * 0.62, L.y + lead, size, 'sansBold');
      pg.text('page ' + (next || 0), pg.x1, L.y + lead, size, 'serif', { align: 'right' });
      L.y += lead * 1.25;
    });
    if (M.finalRows.length) {
      var answer = M.finalRows.filter(function (r) { return r.real; })[0];
      L.need(lead * 1.6);
      L.y += lead * 0.4;
      L.pg.text((p.plan.finale === 'culprit' ? 'The culprit: ' : 'The last word: ') + answer.label, L.pg.x0, L.y + lead, size, 'sansBold');
      L.pg.text('page ' + (L.refs.ending || 0), L.pg.x1, L.y + lead, size, 'serif', { align: 'right' });
      L.y += lead * 1.25;
    }
    // the preview says why rows are missing, in words that read the right way up
    if (L.draft && M.rooms.some(function (room) { return !M.doors[room.id]; })) {
      var noteH = S.b * 6;
      L.need(noteH);
      var from = L.pg.items.length;
      L.placeholder('The other codes go here', 'A room’s code appears here once all its puzzles are written.', noteH);
      L.pg.items.slice(from).forEach(function (it) { it.upright = true; });
    }
  }

  function closingPage(L) {
    var p = L.project, S = L.S;
    L.page('closing', 'Thank You', 'Thank you');
    L.pg.items.length = 0; L.y = L.pg.y0;
    L.heading('', 'Thank You for Playing');
    if (p.story.closing.length) L.paras(p.story.closing);
    else if (L.draft) L.placeholder('Your closing note', 'It comes from the first prompt in step 3.', S.b * 7);
    else L.para('You made it all the way through. Thank you for spending your evening in this book. We hope you had as much fun getting out as we had locking you in.', 'serif', S.b, S.lead);
  }

  function folios(L) {
    var S = L.S;
    L.pages.forEach(function (pg) {
      if (pg.flip) turnOver(pg);
      if (!pg.folio) return;
      pg.text(String(pg.num), pg.W / 2 + (pg.side === 'right' ? (L.m.inside - L.m.outside) / 2 : (L.m.outside - L.m.inside) / 2), pg.y1 - 2, S.folio, 'serif', { align: 'center' });
    });
  }

  // ---------- what the whole book is made of ----------
  function model(project) {
    var pl = project.plan, st = project.story, rooms = P.rooms(project), M = { rooms: rooms, slots: [], doors: {}, rewards: Z.rewards(project), finalRows: [], finalWrong: [] };
    rooms.forEach(function (room) {
      room.slots.forEach(function (s) { M.slots.push(s); });
      M.doors[room.id] = Z.door(project, room);
    });
    if (pl.finale === 'culprit') {
      var innocent = st.suspects.filter(function (s) { return s.name !== st.culprit; });
      var names = st.suspects.map(function (s) { return s.name; }).sort();
      if (st.culprit && names.indexOf(st.culprit) !== -1) {
        M.finalRows = names.map(function (n) { return { id: n, label: n, real: n === st.culprit }; });
        var bad = (st.badEnding[0] || '').trim();
        innocent.forEach(function (s) {
          var at = M.rewards.findIndex(function (r) { return r.clears === s.name; });
          M.finalWrong.push({ id: s.name, head: 'You name ' + s.name, text: (bad ? bad + ' ' : '') + (at >= 0 ? 'The evidence from room ' + (at + 1) + ' cleared them.' : 'Look at your list again.') });
        });
      }
    } else if (P.letters(st.word).length === pl.rooms) {
      var word = P.letters(st.word), decoys = Z.goodDecoys(project).slice(0, 5);
      M.finalRows = decoys.map(function (w) { return { id: w, label: w, real: false }; }).concat([{ id: word, label: word, real: true }]).sort(function (a, b) { return a.id < b.id ? -1 : 1; });
      decoys.forEach(function (w) {
        M.finalWrong.push({ id: w, head: 'You try ' + w, text: 'The dial turns and stops. Use each of your key letters exactly once.' });
      });
    }
    return M;
  }

  /*
   * The order of the middle of the book: room 1 comes first, then rooms, Dead End pages, the last
   * door and the ending, shuffled by the seed. A room is never followed by the next room, and the
   * last door is never followed by the ending.
   */
  function blockOrder(project, M, deadCount) {
    var ids = [];
    M.rooms.slice(1).forEach(function (r) { ids.push({ t: 'room', room: r }); });
    for (var i = 0; i < deadCount; i++) ids.push({ t: 'dead', index: i });
    ids.push({ t: 'final' }, { t: 'ending' });
    if (!project.plan.shuffle) return ids.filter(function (b) { return b.t === 'room'; }).concat(ids.filter(function (b) { return b.t === 'final' || b.t === 'ending'; }), ids.filter(function (b) { return b.t === 'dead'; }));
    var rng = U.makeRng(project.seed + '|order|' + deadCount + '|' + M.rooms.length), best = null;
    function clashes(order) {
      var seq = [{ t: 'room', room: M.rooms[0] }].concat(order), n = 0;
      for (var k = 1; k < seq.length; k++) {
        var a = seq[k - 1], b = seq[k];
        if (a.t === 'room' && b.t === 'room' && b.room.no === a.room.no + 1) n++;
        if (a.t === 'room' && a.room.no === M.rooms.length && b.t === 'final') n++;
        if (a.t === 'final' && b.t === 'ending') n++;
      }
      return n;
    }
    for (var t = 0; t < 200; t++) {
      var order = rng.shuffle(ids.slice()), c = clashes(order);
      if (!best || c < best.c) best = { order: order, c: c };
      if (!c) break;
    }
    return best.order;
  }

  function pass(project, pageGuess, draft, refs, M) {
    F = CX.metrics.load();
    var L = new Layout(project, pageGuess, draft, refs), out = L.out, sections = [], pl = project.plan;
    var pool = planDead(L, M), order = blockOrder(project, M, pool.length);
    function roomBlock(room) {
      roomOpener(L, room, M);
      room.slots.forEach(function (s) { puzzlePage(L, room, s); });
      doorPage(L, room, M);
    }
    titlePage(L);
    copyrightPage(L);
    sections.push({ page: L.pages.length + 1, title: 'How to Play' });
    howPage(L);
    out.log = L.pages.length + 1;
    sections.push({ page: out.log, title: 'Escape Log' });
    logPage(L, M);
    if (pl.notes) { notesPage(L); notesPage(L); }
    sections.push({ page: L.pages.length + 1, title: 'The Story Begins' });
    openingPage(L);
    sections.push({ page: L.pages.length + 1, title: 'Room 1: ' + roomName(L, M.rooms[0]) });
    roomBlock(M.rooms[0]);
    order.forEach(function (b) {
      if (b.t === 'room') { sections.push({ page: L.pages.length + 1, title: 'Room ' + b.room.no + ': ' + roomName(L, b.room) }); roomBlock(b.room); }
      else if (b.t === 'dead') { deadEndPage(L, M, pool[b.index]); }
      else if (b.t === 'final') { sections.push({ page: L.pages.length + 1, title: 'The Last Door' }); finalPage(L, M); }
      else { sections.push({ page: L.pages.length + 1, title: 'The Way Out' }); endingPage(L); }
    });
    sections.push({ page: L.pages.length + 1, title: 'Field Kit' });
    fieldKit(L);
    hintsSection(L, M, 0); hintsSection(L, M, 1); hintsSection(L, M, 2);
    if (Object.keys(out.hint[0]).length) sections.push({ page: Math.min.apply(null, Object.keys(out.hint[0]).map(function (k) { return out.hint[0][k]; })), title: 'Hints' });
    var before = L.pages.length + 1;
    solutions(L, M);
    if (L.pages.length + 1 > before) sections.push({ page: before, title: 'Answers' });
    sections.push({ page: L.pages.length + 1, title: 'Thank You' });
    closingPage(L);
    folios(L);
    sections.sort(function (a, b) { return a.page - b.page; });
    return { W: L.W, H: L.H, pages: L.pages, m: L.m, S: L.S, refs: out, front: [{ page: 1, title: 'Title page' }], sections: sections, model: M };
  }

  function refsKey(r) { return JSON.stringify(r || {}); }

  /*
   * The whole book. opts.draft: placeholders for missing content (the preview). The inside margin
   * grows with the page count, and forward page numbers come from the last pass, so the layout runs
   * again until both settle.
   */
  function layoutBook(project, opts) {
    opts = opts || {};
    var guess = 150, refs = {}, book = null, M = model(project);
    for (var i = 0; i < 8; i++) {
      book = pass(project, guess, !!opts.draft, refs, M);
      var same = KDP.minGutter(book.pages.length) === KDP.minGutter(guess) && refsKey(book.refs) === refsKey(refs);
      guess = book.pages.length;
      refs = book.refs;
      if (same) break;
    }
    book.pageCount = book.pages.length;
    return book;
  }

  /*
   * Plays the printed book from the first room to the ending, following the page numbers on the
   * pages and nothing else. Returns [problems]; an empty list means the route is sound.
   */
  function verifyRoute(project, book) {
    var problems = [], M = book.model, byNum = function (n) { return book.pages[n - 1]; };
    M.rooms.forEach(function (room, i) {
      var door = M.doors[room.id], name = 'Room ' + room.no;
      if (!door) { problems.push(name + ' has no door table yet'); return; }
      var pg = book.pages.filter(function (x) { return x.meta.door === room.no; })[0];
      if (!pg || !pg.meta.rows) { problems.push(name + ': the door page is missing'); return; }
      var pages = pg.meta.rows.map(function (r) { return r.page; }), real = pg.meta.rows.filter(function (r) { return r.real; });
      if (real.length !== 1 || real[0].code !== door.code) problems.push(name + ': the table does not hold the right code once');
      if (pages.some(function (n) { return !n; })) problems.push(name + ': a row has no page');
      if (new Set(pages).size !== pages.length) problems.push(name + ': two rows go to the same page, so the right one could stand out');
      var codes = pg.meta.rows.map(function (r) { return r.code; });
      if (new Set(codes).size !== codes.length) problems.push(name + ': a code is listed twice');
      pg.meta.rows.forEach(function (r) {
        var to = byNum(r.page);
        if (!to) { problems.push(name + ': code ' + r.code + ' goes to a page that does not exist'); return; }
        if (r.real) {
          var next = M.rooms[i + 1];
          if (next ? to.meta.room !== next.no : !to.meta.final) problems.push(name + ': the right code does not lead to the next room');
        } else {
          var hit = (to.meta.entries || []).filter(function (e) { return e.id === room.id + '|' + r.code; })[0];
          if (!hit) problems.push(name + ': the page for code ' + r.code + ' does not mention it');
          else if (hit.back !== pg.num) problems.push(name + ': the Dead End for code ' + r.code + ' sends you to the wrong page');
        }
      });
      if (pg.num + 1 === (real[0] && real[0].page) && project.plan.shuffle) problems.push(name + ': the next room is simply the next page');
    });
    var fin = book.pages.filter(function (x) { return x.meta.final && x.meta.rows; })[0];
    if (!fin) problems.push('The last door has no lock yet');
    else fin.meta.rows.forEach(function (r) {
      var to = byNum(r.page);
      if (!to) problems.push('At the last door, ' + r.code + ' goes nowhere');
      else if (r.real ? !to.meta.ending : !(to.meta.entries || []).some(function (e) { return e.id === 'final|' + r.code && e.back === fin.num; })) problems.push('At the last door, ' + r.code + ' goes to the wrong page');
    });
    return problems;
  }

  CX.layout = { PRINT: PRINT, layoutBook: layoutBook, verifyRoute: verifyRoute, wrap: wrap, fit: fit, sizes: sizes };
})(typeof window !== 'undefined' ? window : globalThis);
