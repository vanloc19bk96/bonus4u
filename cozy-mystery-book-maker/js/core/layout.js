/*
 * Page layout to KDP standards: 6 x 9 in (432 x 648 pt), no bleed, mirrored margins.
 * Produces a list of pages made of simple drawing items in points (origin top-left):
 *   { t:'text', x, y(baseline), size, font, str }
 *   { t:'line', x1, y1, x2, y2, w }
 *   { t:'rect', x, y, w, h, lw } (outline) or { ..., fill:true }
 *   { t:'path', d:[['M',x,y],['L',x,y],['C',x1,y1,x2,y2,x,y],['Z']], lw } or { ..., fill:true }
 * The preview (SVG) and the PDF both draw exactly these items, so they match line for line.
 */
(function (root) {
  'use strict';
  var Cozy = root.Cozy = root.Cozy || {};
  var U = Cozy.util;

  var W = 432, H = 648, PT = 72;
  var MARGIN_TOP = 36, MARGIN_BOTTOM = 36, MARGIN_OUT = 36; // 0.5 in
  var LIVE_BOTTOM = H - MARGIN_BOTTOM;                     // 612
  var FOLIO_Y = LIVE_BOTTOM - 3;                           // page number baseline
  var BODY_BOTTOM = LIVE_BOTTOM - 22;                      // text stops above the folio
  var MIN_LINE = 0.75;
  var BODY = { size: 11, leading: 15.5, floor: 10, step: 0.25, indent: 0.2 * PT };

  var F; // fonts, loaded lazily

  // ---------- small drawing helpers ----------
  function Page(num, kind, label, insideMargin) {
    this.num = num; this.kind = kind; this.label = label;
    this.side = num % 2 === 1 ? 'right' : 'left';
    var inside = insideMargin;
    this.x0 = this.side === 'right' ? inside : MARGIN_OUT;
    this.x1 = W - (this.side === 'right' ? MARGIN_OUT : inside);
    this.y0 = MARGIN_TOP; this.y1 = LIVE_BOTTOM;
    this.cx = (this.x0 + this.x1) / 2;
    this.width = this.x1 - this.x0;
    this.items = [];
    this.meta = {};
  }
  Page.prototype.text = function (str, x, y, size, font) {
    var s = Cozy.metrics.printable(str, F[font]);
    if (s) this.items.push({ t: 'text', x: r2(x), y: r2(y), size: size, font: font, str: s });
    return F[font].width(s, size);
  };
  Page.prototype.center = function (str, y, size, font, cx) {
    var s = Cozy.metrics.printable(str, F[font]);
    var w = F[font].width(s, size);
    this.text(s, (cx == null ? this.cx : cx) - w / 2, y, size, font);
    return w;
  };
  // Letterspaced label: each character drawn at its own position (identical in SVG and PDF).
  Page.prototype.spaced = function (str, y, size, font, ls, cx) {
    var s = Cozy.metrics.printable(str, F[font]);
    var total = F[font].width(s, size, ls);
    var x = (cx == null ? this.cx : cx) - total / 2;
    for (var i = 0; i < s.length; i++) {
      if (s[i] !== ' ') this.items.push({ t: 'text', x: r2(x), y: r2(y), size: size, font: font, str: s[i] });
      x += F[font].width(s[i], size) + ls;
    }
    return total;
  };
  Page.prototype.line = function (x1, y1, x2, y2, w) {
    this.items.push({ t: 'line', x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), w: Math.max(MIN_LINE, w || MIN_LINE) });
  };
  Page.prototype.rect = function (x, y, w, h, lw) {
    this.items.push({ t: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), lw: Math.max(MIN_LINE, lw || MIN_LINE) });
  };
  Page.prototype.fillRect = function (x, y, w, h) {
    this.items.push({ t: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), fill: true });
  };
  Page.prototype.path = function (d, lw, fill) {
    var o = { t: 'path', d: d.map(function (c) { return [c[0]].concat(c.slice(1).map(r2)); }) };
    if (fill) o.fill = true; else o.lw = Math.max(MIN_LINE, lw || MIN_LINE);
    this.items.push(o);
  };
  function r2(v) { return Math.round(v * 100) / 100; }

  // Wraps a single line of text (titles) to a max width. Returns array of lines.
  function wrap(str, size, font, maxW) {
    var words = String(str).split(/\s+/).filter(Boolean);
    var lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (F[font].width(t, size) <= maxW || !cur) cur = t;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // Balanced wrap for titles: avoids a lonely last word.
  function wrapBalanced(str, size, font, maxW) {
    var lines = wrap(str, size, font, maxW);
    if (lines.length !== 2) return lines;
    var words = str.split(/\s+/).filter(Boolean);
    var best = lines, bestDiff = Infinity;
    for (var k = 1; k < words.length; k++) {
      var a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
      if (F[font].width(a, size) > maxW || F[font].width(b, size) > maxW) continue;
      var diff = Math.abs(F[font].width(a, size) - F[font].width(b, size));
      if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
    }
    return best;
  }

  function ornament(pg, cy, half) {
    half = half || 34;
    var cx = pg.cx;
    pg.line(cx - half, cy, cx - 9, cy, 0.75);
    pg.line(cx + 9, cy, cx + half, cy, 0.75);
    pg.path([['M', cx, cy - 4], ['L', cx + 4, cy], ['L', cx, cy + 4], ['L', cx - 4, cy], ['Z']], 0, true);
    pg.path([['M', cx - 13, cy - 1.6], ['L', cx - 11.4, cy], ['L', cx - 13, cy + 1.6], ['L', cx - 14.6, cy], ['Z']], 0, true);
    pg.path([['M', cx + 13, cy - 1.6], ['L', cx + 14.6, cy], ['L', cx + 13, cy + 1.6], ['L', cx + 11.4, cy], ['Z']], 0, true);
  }

  // A magnifying glass drawn with paths (title and closing pages).
  function magnifier(pg, cx, cy, r) {
    var k = 0.5523 * r;
    pg.path([['M', cx + r, cy], ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r], ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
      ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r], ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy], ['Z']], 1.6);
    var g = r * 0.78;
    // glint
    pg.path([['M', cx - g * 0.72, cy - g * 0.18], ['C', cx - g * 0.7, cy - g * 0.5, cx - g * 0.45, cy - g * 0.72, cx - g * 0.15, cy - g * 0.74]], 1);
    // handle: a rounded bar at 45 degrees
    var a = Math.PI / 4, ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
    var sx = cx + ux * (r + 1), sy = cy + uy * (r + 1), len = r * 1.25, hw = r * 0.16;
    var ex = sx + ux * len, ey = sy + uy * len;
    pg.path([['M', sx + px * hw, sy + py * hw], ['L', ex + px * hw, ey + py * hw],
      ['C', ex + px * hw + ux * hw * 1.3, ey + py * hw + uy * hw * 1.3, ex - px * hw + ux * hw * 1.3, ey - py * hw + uy * hw * 1.3, ex - px * hw, ey - py * hw],
      ['L', sx - px * hw, sy - py * hw], ['Z']], 0, true);
  }

  // ---------- body text ----------
  /*
   * Justified paragraphs with a first-line indent of 0.2 in (not on the first paragraph, which
   * gets a two-line drop cap). Returns { items, lastY, overflowAt (word index or -1), words }.
   */
  function setBody(pg, paragraphs, top, bottom, size, leading, opts) {
    opts = opts || {};
    var font = F.serif, items = [];
    var sw = font.width(' ', size);
    var x0 = pg.x0, maxW = pg.width;
    var y = top + size * 0.72; // first baseline: cap height below the top edge
    var wordIndex = 0, overflowAt = -1;
    var desc = font.descent * size;
    for (var pi = 0; pi < paragraphs.length; pi++) {
      var words = paragraphs[pi].split(/\s+/).filter(Boolean).map(function (w) { return Cozy.metrics.printable(w, font); }).filter(Boolean);
      if (!words.length) continue;
      var dropW = 0, dropLines = 0;
      if (pi === 0 && opts.dropCap && /^[A-Za-z]/.test(words[0]) && words[0].length > 1) {
        var dsize = (leading + F.serif.capHeight * size) / F.serifBold.capHeight;
        var letter = words[0][0];
        var lw = F.serifBold.width(letter, dsize);
        items.push({ t: 'text', x: r2(x0), y: r2(y + leading), size: r2(dsize), font: 'serifBold', str: letter });
        dropW = lw + 3; dropLines = 2;
        words[0] = words[0].slice(1);
      }
      var lineNo = 0, i = 0;
      while (i < words.length) {
        var indent = (lineNo < dropLines) ? dropW : (lineNo === 0 && pi > 0 ? BODY.indent : 0);
        var avail = maxW - indent;
        var line = [words[i]], lineW = font.width(words[i], size);
        var j = i + 1;
        while (j < words.length) {
          var ww = font.width(words[j], size);
          if (lineW + sw + ww > avail + 0.01) break;
          line.push(words[j]); lineW += sw + ww; j++;
        }
        var last = j >= words.length;
        var gap = sw;
        if (!last && line.length > 1) gap = sw + (avail - lineW) / (line.length - 1);
        if (y + desc > bottom && overflowAt < 0) overflowAt = wordIndex;
        var x = x0 + indent;
        for (var k = 0; k < line.length; k++) {
          // the first fragment after a drop cap hugs the cap
          items.push({ t: 'text', x: r2(x), y: r2(y), size: size, font: 'serif', str: line[k] });
          x += font.width(line[k], size) + gap;
        }
        wordIndex += line.length;
        i = j; lineNo++;
        y += leading;
      }
      if (lineNo < dropLines) y += leading * (dropLines - lineNo);
    }
    return { items: items, lastY: y - leading, overflowAt: overflowAt, words: wordIndex };
  }

  // Tries 11 pt, then smaller in 0.25 pt steps down to 10 pt.
  function fitBody(pg, paragraphs, top, opts) {
    for (var size = BODY.size; size >= BODY.floor - 1e-9; size -= BODY.step) {
      var leading = size * BODY.leading / BODY.size;
      var res = setBody(pg, paragraphs, top, BODY_BOTTOM, size, leading, opts);
      if (res.overflowAt < 0) return { fits: true, size: size, items: res.items, lastY: res.lastY };
    }
    var tight = setBody(pg, paragraphs, top, BODY_BOTTOM, BODY.floor, BODY.floor * BODY.leading / BODY.size, opts);
    var cut = Math.max(1, tight.words - tight.overflowAt) + 2;
    // show only what fits; the page is flagged and the rest waits for the chapter to be shortened
    var limit = BODY_BOTTOM - F.serif.descent * BODY.floor;
    var shown = tight.items.filter(function (it) { return it.y <= limit + 0.01; });
    return { fits: false, size: BODY.floor, items: shown, lastY: tight.lastY, cut: cut };
  }

  function folio(pg) {
    if (pg.num >= 4) pg.center(String(pg.num), FOLIO_Y, 9, 'serif');
  }

  // ---------- chapter-like pages ----------
  function chapterHeader(pg, label, title) {
    var y = MARGIN_TOP + 58;
    pg.spaced(label, y, 10, 'sans', 2.2);
    var lines = wrapBalanced(title, 18, 'serifBold', pg.width - 20);
    y += 30;
    lines.forEach(function (l, i) { pg.center(l, y + i * 23, 18, 'serifBold'); });
    y += (lines.length - 1) * 23 + 18;
    ornament(pg, y);
    return y + 22;
  }

  function chapterPage(pg, label, title, paragraphs) {
    var top = chapterHeader(pg, label, title);
    var fit = fitBody(pg, paragraphs, top, { dropCap: true });
    fit.items.forEach(function (it) { pg.items.push(it); });
    folio(pg);
    return fit;
  }

  // ---------- grids ----------
  function drawGrid(pg, pz, x, y, cell, opts) {
    opts = opts || {};
    var rows = pz.rows, cols = pz.cols;
    var size = Math.max(opts.minLetter || 0, Math.round(cell * (opts.ratio || 0.58) * 4) / 4);
    var font = opts.font || 'sansBold';
    var f = F[font];
    for (var r = 0; r < rows; r++) {
      var row = pz.grid[r];
      for (var c = 0; c < cols; c++) {
        var ch = row[c];
        var cx = x + c * cell + cell / 2, cy = y + r * cell + cell / 2;
        if (ch === '#') { pg.fillRect(x + c * cell + cell * 0.12, y + r * cell + cell * 0.12, cell * 0.76, cell * 0.76); continue; }
        var w = f.width(ch, size);
        pg.items.push({ t: 'text', x: r2(cx - w / 2), y: r2(cy + f.capHeight * size / 2), size: size, font: font, str: ch });
      }
    }
    var pad = opts.pad == null ? 4 : opts.pad;
    pg.rect(x - pad, y - pad, cols * cell + pad * 2, rows * cell + pad * 2, opts.frame || 1);
    return size;
  }

  // Outline around a word (solutions): a capsule from the first to the last letter.
  function capsule(pg, x, y, cell, pl, lw) {
    var D = Cozy.puzzle.DIRS[pl.d];
    var ax = x + pl.c * cell + cell / 2, ay = y + pl.r * cell + cell / 2;
    var n = pl.word.length - 1;
    var bx = ax + D[1] * cell * n, by = ay + D[0] * cell * n;
    var len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    var ux = len ? (bx - ax) / len : 1, uy = len ? (by - ay) / len : 0;
    var px = -uy, py = ux;
    var rad = cell * 0.43, k = 0.5523 * rad;
    function P(s, t) { return [ax + ux * s + px * t, ay + uy * s + py * t]; }
    var L = len;
    var d = [];
    var p = P(0, -rad); d.push(['M', p[0], p[1]]);
    p = P(L, -rad); d.push(['L', p[0], p[1]]);
    var c1 = P(L + k, -rad), c2 = P(L + rad, -k), e = P(L + rad, 0); d.push(['C', c1[0], c1[1], c2[0], c2[1], e[0], e[1]]);
    c1 = P(L + rad, k); c2 = P(L + k, rad); e = P(L, rad); d.push(['C', c1[0], c1[1], c2[0], c2[1], e[0], e[1]]);
    p = P(0, rad); d.push(['L', p[0], p[1]]);
    c1 = P(-k, rad); c2 = P(-rad, k); e = P(-rad, 0); d.push(['C', c1[0], c1[1], c2[0], c2[1], e[0], e[1]]);
    c1 = P(-rad, -k); c2 = P(-k, -rad); e = P(0, -rad); d.push(['C', c1[0], c1[1], c2[0], c2[1], e[0], e[1]]);
    d.push(['Z']);
    pg.path(d, lw || 0.75);
  }

  // Word list in 3 columns, alphabetical, column by column.
  function wordList(pg, words, x, y, totalW, size, leading) {
    var sorted = words.slice().sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
    var cols = 3, rows = Math.ceil(sorted.length / cols);
    var colW = totalW / cols;
    var font = F.sans;
    var maxW = sorted.reduce(function (m, w) { return Math.max(m, font.width(w, size)); }, 0);
    while (maxW > colW - 6 && size > 8) { size -= 0.25; maxW = sorted.reduce(function (m, w) { return Math.max(m, font.width(w, size)); }, 0); }
    for (var c = 0; c < cols; c++) {
      var colWords = sorted.slice(c * rows, (c + 1) * rows);
      var cw = colWords.reduce(function (m, w) { return Math.max(m, font.width(w, size)); }, 0);
      var cx = x + c * colW + (colW - cw) / 2;
      colWords.forEach(function (w, r) { pg.text(w, cx, y + r * leading, size, 'sans'); });
    }
    return rows * leading;
  }

  function puzzlePage(pg, label, title, pz, words, opts) {
    opts = opts || {};
    var y = MARGIN_TOP + 26;
    pg.spaced(label, y, 10, 'sans', 2.2);
    var lines = wrapBalanced(title, 18, 'serifBold', pg.width - 20);
    y += 26;
    lines.forEach(function (l, i) { pg.center(l, y + i * 22, 18, 'serifBold'); });
    y += (lines.length - 1) * 22;
    var after = y + 8;
    if (opts.instruction) {
      var ins = wrap(opts.instruction, 10.5, 'serifItalic', pg.width - 10);
      ins.forEach(function (l, i) { pg.center(l, after + 18 + i * 14, 10.5, 'serifItalic'); });
      after += 18 + (ins.length - 1) * 14 + 4;
    }
    var gridTop = after + 20;
    var listLeading = 17, listSize = 10.5;
    var listRows = words ? Math.ceil(words.length / 3) : 0;
    var below = words ? listRows * listLeading + 22 : (opts.belowHeight || 0);
    var availH = BODY_BOTTOM - below - gridTop - 4;
    var pad = 4;
    var cell = Math.min((pg.width - pad * 2) / pz.cols, availH / pz.rows, 28);
    cell = Math.floor(cell * 4) / 4;
    var gw = cell * pz.cols;
    var gx = pg.cx - gw / 2;
    drawGrid(pg, pz, gx, gridTop, cell, { pad: pad, frame: 1.25 });
    pg.meta.grid = { x: gx, y: gridTop, cell: cell, rows: pz.rows, cols: pz.cols, placements: pz.placements };
    var gridBottom = gridTop + pz.rows * cell + pad;
    if (words) {
      wordList(pg, words, gx, gridBottom + 24, gw, listSize, listLeading);
    }
    folio(pg);
    return { gridBottom: gridBottom, gx: gx, gw: gw };
  }

  // ---------- fixed pages ----------
  function titlePage(pg, ctx) {
    var y = MARGIN_TOP + 92;
    if (ctx.seriesLine) { pg.spaced(ctx.seriesLine.toUpperCase(), y, 9.5, 'sans', 1.8); y += 36; } else y += 20;
    var tSize = 30;
    var lines = wrapBalanced(ctx.title, tSize, 'serifBold', pg.width - 24);
    while (lines.length > 3 && tSize > 22) { tSize -= 2; lines = wrapBalanced(ctx.title, tSize, 'serifBold', pg.width - 24); }
    lines.forEach(function (l, i) { pg.center(l, y + i * tSize * 1.18, tSize, 'serifBold'); });
    y += (lines.length - 1) * tSize * 1.18 + 26;
    ornament(pg, y, 46);
    y += 30;
    if (ctx.subtitle) {
      var sub = wrapBalanced(ctx.subtitle, 13, 'serifItalic', pg.width - 40);
      sub.forEach(function (l, i) { pg.center(l, y + i * 18, 13, 'serifItalic'); });
      y += sub.length * 18;
    }
    magnifier(pg, pg.cx - 8, 404, 26);
    pg.spaced((ctx.penName || 'Your Pen Name').toUpperCase(), 520, 13, 'sans', 2.4);
    if (ctx.imprint) pg.center(ctx.imprint, 572, 9.5, 'serif');
  }

  function copyrightPage(pg, ctx) {
    var lines = [];
    lines.push({ s: ctx.title, f: 'serifBold' });
    if (ctx.seriesLine) lines.push({ s: ctx.seriesLine, f: 'serifItalic' });
    lines.push({ s: '' });
    lines.push({ s: 'Copyright © ' + ctx.year + ' ' + (ctx.penName || 'Your Pen Name') + '. All rights reserved.' });
    lines.push({ s: '' });
    lines.push({ s: 'No part of this book may be reproduced, stored or shared in any form or by any means without written permission from the author, except for brief quotations in a book review.', wrap: true });
    lines.push({ s: '' });
    lines.push({ s: 'This is a work of fiction. Names, characters, businesses, places and events are the products of the author’s imagination. Any resemblance to actual persons, living or dead, or to actual events is purely coincidental.', wrap: true });
    lines.push({ s: '' });
    if (ctx.isbn) lines.push({ s: 'ISBN: ' + ctx.isbn });
    if (ctx.imprint) lines.push({ s: 'Published by ' + ctx.imprint });
    lines.push({ s: 'First edition, ' + ctx.year });
    var out = [];
    lines.forEach(function (l) {
      if (!l.s) { out.push({ s: '', f: 'serif' }); return; }
      wrap(l.s, 9, l.f || 'serif', pg.width).forEach(function (w) { out.push({ s: w, f: l.f || 'serif' }); });
    });
    var lead = 13;
    var y = BODY_BOTTOM - (out.length - 1) * lead - 6;
    out.forEach(function (l, i) { if (l.s) pg.text(l.s, pg.x0, y + i * lead, 9, l.f); });
  }

  function paragraphBlock(pg, text, y, size, lead, font) {
    var lines = wrap(text, size, font || 'serif', pg.width);
    lines.forEach(function (l, i) { pg.text(l, pg.x0, y + i * lead, size, font || 'serif'); });
    return y + lines.length * lead;
  }

  function howToPage(pg, ctx) {
    var y = MARGIN_TOP + 40;
    pg.center('How to Play', y, 18, 'serifBold');
    ornament(pg, y + 18);
    y += 46;
    var DIR_TEXT = { easy: 'across from left to right or straight down', medium: 'across, down or diagonally, always reading forward', hard: 'in any direction: across, down, diagonally, and even backward' };
    // with a Mix the puzzles get harder as the story goes on
    var MIX_TEXT = { easy: 'run across and down', medium: 'run across, down and diagonally', hard: 'run in any direction, even backward' };
    var lv = ctx.levels;
    var runText = lv.length === 1 ? 'Words run ' + DIR_TEXT[lv[0]] + '.'
      : 'The puzzles get harder as the story goes on: words ' + MIX_TEXT[lv[0]] + ' in the early puzzles' +
        (lv.length === 3 ? ', ' + MIX_TEXT[lv[1]] + ' in the middle ones,' : '') + ' and ' + MIX_TEXT[lv[lv.length - 1]] + ' in the last ones.';
    var sections = [
      ['Read, then search', 'Each chapter of the mystery faces a word search. Every word in the list comes from the chapter you just read. ' + runText + ' Circle each word as you find it.'],
      ['Spot the missing word', 'In ' + ctx.C + ' of the ' + ctx.N + ' puzzles, one word on the list is not in the grid at all. That missing word is a clue! Write it in the Detective’s Notebook on page ' + ctx.pages.notebook + '.'],
      ['Unmask the killer', 'Once you have all ' + ctx.C + ' clues, turn to the Final Reveal on page ' + ctx.pages.final + '. Find every clue in its grid and cross it out. Then read the leftover letters from left to right, top to bottom. They spell out the name of the killer.'],
      ['Stuck?', 'Every solution starts on page ' + ctx.pages.solutionsStart + ', and each one names the missing clue.']
    ];
    sections.forEach(function (s) {
      pg.text(s[0], pg.x0, y, 12, 'serifBold');
      y = paragraphBlock(pg, s[1], y + 17, 10.5, 14.5) + 10;
    });
    // worked example: a small grid with one word circled and one word missing
    var ex = { rows: 5, cols: 7, grid: ['TQSCONE', 'AJBRMLW', 'MOAUTEA', 'PLMKIDH', 'CUPGRNF'] };
    var cell = 17, gx = pg.x0 + 8, gy = y + 8;
    drawGrid(pg, ex, gx, gy, cell, { ratio: 0.56, pad: 3, frame: 1 });
    capsule(pg, gx, gy, cell, { word: 'SCONE', r: 0, c: 2, d: 0 }, 0.9);
    capsule(pg, gx, gy, cell, { word: 'JAM', r: 1, c: 1, d: 2 }, 0.9);
    var lx = gx + ex.cols * cell + 26, ly = gy + 12;
    pg.text('Word list:', lx, ly, 10, 'serifBold');
    ['JAM', 'KEY', 'SCONE'].forEach(function (w, i) {
      pg.text(w, lx, ly + 17 + i * 15, 10, 'sans');
    });
    var kx = lx + F.sans.width('SCONE', 10) + 14;
    pg.text('← KEY is not in the grid.', kx, ly + 32, 9.5, 'serifItalic');
    pg.text('It is a clue!', kx, ly + 45, 9.5, 'serifItalic');
  }

  function notebookPage(pg, ctx) {
    var y = MARGIN_TOP + 26;
    pg.spaced('CASE FILE', y, 10, 'sans', 2.2);
    y += 26;
    pg.center('Detective’s Notebook', y, 18, 'serifBold');
    y += 22;
    var intro = 'Each time a word from a puzzle’s list is missing from its grid, you have found a clue. Write it here, then take all ' + ctx.C + ' clues to the Final Reveal.';
    var introLines = wrap(intro, 10.5, 'serifItalic', pg.width - 10);
    introLines.forEach(function (l, i) { pg.center(l, y + i * 14, 10.5, 'serifItalic'); });
    y += (introLines.length - 1) * 14 + 26;
    var C = ctx.C, rows = Math.ceil(C / 2);
    var colW = (pg.width - 18) / 2;
    var avail = 230;
    var rowH = Math.min(21, Math.floor(avail / rows));
    for (var i = 0; i < C; i++) {
      var col = i < rows ? 0 : 1, r = col ? i - rows : i;
      var x = pg.x0 + col * (colW + 18), ly = y + r * rowH;
      var num = (i + 1) + '.';
      pg.text(num, x + 16 - F.serif.width(num, 10.5), ly, 10.5, 'serif');
      pg.line(x + 22, ly + 2, x + colW, ly + 2, 0.75);
    }
    y += rows * rowH + 14;
    pg.text('The Suspects', pg.x0, y, 13, 'serifBold');
    pg.text('Tick a box when you rule someone out.', pg.x0 + F.serifBold.width('The Suspects', 13) + 10, y, 9.5, 'serifItalic');
    y += 20;
    var sus = ctx.suspects || [];
    var room = BODY_BOTTOM - y - 30;
    var sH = Math.min(30, Math.max(22, Math.floor(room / Math.max(1, sus.length))));
    sus.forEach(function (s, k) {
      var sy = y + k * sH;
      pg.rect(pg.x0, sy - 8.5, 9, 9, 0.75);
      pg.text(s.name, pg.x0 + 17, sy, 11, 'serifBold');
      if (s.role && sH >= 26) {
        var role = s.role;
        while (F.serif.width(role, 9.5) > pg.width - 17 && role.length > 10) role = role.slice(0, -2).replace(/\s+\S*$/, '') + '…';
        pg.text(role, pg.x0 + 17, sy + 12, 9.5, 'serif');
      }
    });
    y += sus.length * sH + 10;
    if (y + 4 < BODY_BOTTOM) {
      var lab = 'My prime suspect:';
      pg.text(lab, pg.x0, y, 11, 'serifBold');
      pg.line(pg.x0 + F.serifBold.width(lab, 11) + 8, y + 2, pg.x1, y + 2, 0.75);
    }
    folio(pg);
  }

  function finalPage(pg, ctx) {
    var pz = ctx.final;
    var instruction = ctx.printClueList
      ? 'Cross out all ' + ctx.C + ' clue words. Then read the leftover letters from left to right, top to bottom.'
      : 'Find the ' + ctx.C + ' clues from your Detective’s Notebook and cross them out. Then read the leftover letters from left to right, top to bottom.';
    var groups = ctx.messageSpaced.split(' ').map(function (w) { return w.length; });
    var boxRowsH = 64;
    var res = puzzlePage(pg, 'THE FINAL PUZZLE', 'The Final Reveal', pz, ctx.printClueList ? ctx.clueDisplays : null, {
      instruction: instruction, belowHeight: ctx.printClueList ? 0 : boxRowsH + 26
    });
    if (!ctx.printClueList) {
      // answer boxes, grouped by word
      var box = 15, gap = 2.5, wordGap = 10;
      var rowsOut = [[]], rowW = 0, maxW = pg.width;
      groups.forEach(function (n) {
        var w = n * box + (n - 1) * gap;
        if (rowW && rowW + wordGap + w > maxW) { rowsOut.push([]); rowW = 0; }
        rowsOut[rowsOut.length - 1].push(n);
        rowW += (rowW ? wordGap : 0) + w;
      });
      var by = res.gridBottom + 30;
      pg.center('The leftover letters spell:', by, 10.5, 'serifItalic');
      by += 12;
      rowsOut.forEach(function (row, ri) {
        var w = row.reduce(function (s, n, i) { return s + n * box + (n - 1) * gap + (i ? wordGap : 0); }, 0);
        var x = pg.cx - w / 2, yy = by + ri * (box + 8);
        row.forEach(function (n) {
          for (var i = 0; i < n; i++) { pg.rect(x, yy, box, box, 0.75); x += box + gap; }
          x += wordGap - gap;
        });
      });
    }
  }

  function solutionsPages(pages, ctx, startNum, inside) {
    var entries = ctx.solutions;
    var perPage = 4;
    var out = [];
    for (var p = 0; p * perPage < entries.length; p++) {
      var pg = new Page(startNum + p, 'solutions', 'Solutions', inside);
      pg.spaced(p === 0 ? 'SOLUTIONS' : 'SOLUTIONS (CONTINUED)', MARGIN_TOP + 20, 10, 'sans', 2.2);
      var gapX = 20, bw = (pg.width - gapX) / 2;
      var top = MARGIN_TOP + 44, bh = (BODY_BOTTOM - top) / 2;
      entries.slice(p * perPage, p * perPage + perPage).forEach(function (e, k) {
        var col = k % 2, row = Math.floor(k / 2);
        var bx = pg.x0 + col * (bw + gapX), by = top + row * bh;
        var bcx = bx + bw / 2;
        pg.center(e.caption, by + 9, 9.5, 'sansBold', bcx);
        var sub = e.sub || '';
        if (sub) {
          var s = sub;
          while (F.serif.width(s, 9) > bw && s.length > 8) s = s.slice(0, -2) + '…';
          pg.center(s, by + 22, 9, e.subFont || 'serif', bcx);
        }
        var gTop = by + 32;
        if (!e.pz || !e.pz.grid) {
          pg.center('Not built yet', gTop + 40, 9, 'serifItalic', bcx);
          return;
        }
        var pad = 2.5;
        var cell = Math.min((bw - pad * 2) / e.pz.cols, (bh - 44) / e.pz.rows);
        cell = Math.floor(cell * 4) / 4;
        var gx = bcx - (cell * e.pz.cols) / 2;
        drawGrid(pg, e.pz, gx, gTop, cell, { font: 'sans', ratio: 0.58, minLetter: 7.5, pad: pad, frame: 0.75 });
        e.pz.placements.forEach(function (pl) { capsule(pg, gx, gTop, cell, pl, 0.75); });
      });
      folio(pg);
      out.push(pg);
    }
    out.forEach(function (pg) { pages.push(pg); });
  }

  function closingPage(pg, ctx) {
    var y = MARGIN_TOP + 120;
    pg.center('Thank You for Reading', y, 18, 'serifBold');
    ornament(pg, y + 20);
    y += 52;
    var paras = [
      'We hope you enjoyed solving ' + ctx.title + '. If the final reveal made you smile, a short review on Amazon would mean the world. It helps other puzzle lovers find this book, and every review is read with a cup of tea.',
      ctx.seriesName
        ? ctx.sleuthName + ' will be back with a new case in the next ' + ctx.seriesName + ' mystery. Keep your pencil sharp.'
        : 'Look for more cozy mystery puzzle books by ' + (ctx.penName || 'the author') + '.'
    ];
    paras.forEach(function (t) {
      var lines = wrap(t, 11, 'serif', pg.width - 30);
      lines.forEach(function (l, i) { pg.center(l, y + i * 16, 11, 'serif'); });
      y += lines.length * 16 + 12;
    });
    y += 6;
    pg.center('— ' + (ctx.penName || 'Your Pen Name'), y, 11, 'serifItalic');
    magnifier(pg, pg.cx - 6, y + 70, 18);
    folio(pg);
  }

  function placeholderPage(pg, title, note) {
    pg.meta.placeholder = true;
    pg.meta.note = note;
    pg.meta.placeholderTitle = title;
    folio(pg);
  }

  // ---------- the whole book ----------
  /*
   * state: { project, d, prepared, puzzles: {n: puzzle}, final, sample: bool }
   */
  function layoutBook(state) {
    F = Cozy.metrics.load();
    var project = state.project, d = state.d, plan = project.plan;
    var s = project.setup;
    var inside = d.insideMarginIn * PT;
    var pages = [];
    var fit = {};
    var bookTitle = Cozy.book.title(project);
    var seriesLine = s.seriesName ? ('A ' + s.seriesName + ' Mystery' + (s.bookNumber ? ' · Book ' + s.bookNumber : '')) : '';
    if (s.seriesName && /mystery|mysteries/i.test(s.seriesName)) seriesLine = s.seriesName + (s.bookNumber ? ' · Book ' + s.bookNumber : '');
    var ctx = {
      title: bookTitle, subtitle: Cozy.book.subtitle(project), seriesLine: seriesLine, penName: s.penName,
      imprint: s.imprint, isbn: s.isbn, year: s.year, levels: d.levelsUsed, N: d.N, C: d.C, pages: d.pages,
      seriesName: s.seriesName, sleuthName: plan ? plan.sleuth.name : 'Our sleuth', printClueList: s.printClueList,
      suspects: plan ? plan.suspects : []
    };

    var pg = new Page(1, 'front', 'Title page', inside); titlePage(pg, ctx); pages.push(pg);
    pg = new Page(2, 'front', 'Copyright', inside); copyrightPage(pg, ctx); pages.push(pg);
    pg = new Page(3, 'front', 'How to Play', inside); howToPage(pg, ctx); pages.push(pg);

    for (var n = 1; n <= d.N; n++) {
      var ch = project.chapters[n];
      var outline = plan && plan.outline.find(function (o) { return o.n === n; });
      var cp = new Page(d.pages.chapter(n), 'chapter', 'Chapter ' + n, inside);
      cp.meta.chapter = n;
      if (ch && ch.paragraphs && ch.paragraphs.length) {
        var f = chapterPage(cp, 'CHAPTER ' + n, ch.title || (outline && outline.title) || '', ch.paragraphs);
        fit[n] = { fits: f.fits, size: f.size, cut: f.cut || 0 };
        cp.meta.bodySize = f.size;
        if (!f.fits) cp.meta.problem = 'Too long for one page: cut about ' + f.cut + ' words.';
      } else {
        var part = d.batches.findIndex(function (b) { return n >= b.from && n <= b.to; }) + 1;
        placeholderPage(cp, 'Chapter ' + n + (outline ? ': ' + outline.title : ''), plan
          ? 'The story plan only lists chapter titles. In step 3 (Chapters), copy the prompt for part ' + part + ' and paste the AI’s reply to fill this page.'
          : 'Start in the sidebar: fill in Setup, then paste your story plan in step 2. This chapter is written in step 3, part ' + part + '.');
      }
      pages.push(cp);

      var pp = new Page(d.pages.puzzle(n), 'puzzle', 'Puzzle ' + n, inside);
      pp.meta.puzzle = n;
      var pz = state.puzzles[n];
      var prep = state.prepared[n];
      if (pz && pz.ok && prep) {
        puzzlePage(pp, 'PUZZLE ' + n, ch.title || '', pz, prep.list.map(function (x) { return x.display; }));
        pp.meta.hidden = pz.hidden;
        pp.meta.hiddenDisplay = (prep.list.find(function (x) { return x.isClue; }) || {}).display;
      } else if (pz && pz.ok === false) {
        placeholderPage(pp, 'Puzzle ' + n, 'This puzzle could not be built: ' + pz.reason);
        pp.meta.problem = pz.reason;
      } else if (prep && prep.usable < d.wordsPerPuzzle) {
        placeholderPage(pp, 'Puzzle ' + n, 'This puzzle needs ' + d.wordsPerPuzzle + ' words; it has ' + prep.usable + '.');
        pp.meta.problem = 'Not enough words.';
      } else {
        placeholderPage(pp, 'Puzzle ' + n, ch ? 'Building the puzzle…' : 'This puzzle is built automatically from the text of chapter ' + n + ', once you paste it in step 3.');
      }
      pages.push(pp);
    }

    pg = new Page(d.pages.notebook, 'notebook', 'Detective’s Notebook', inside); notebookPage(pg, ctx); pages.push(pg);

    pg = new Page(d.pages.final, 'final', 'Final Reveal', inside);
    pg.meta.puzzle = 'final';
    if (state.final && state.final.ok) {
      ctx.final = state.final;
      ctx.messageSpaced = state.final.messageSpaced;
      ctx.clueDisplays = plan.clues.map(function (c) { return c.display || c.word; });
      finalPage(pg, ctx);
    } else {
      placeholderPage(pg, 'The Final Reveal', state.final && !state.final.ok ? state.final.reason : 'The final puzzle is built from the story plan’s clues.');
      if (state.final && !state.final.ok) pg.meta.problem = state.final.reason;
    }
    pages.push(pg);

    pg = new Page(d.pages.epilogue, 'epilogue', 'Epilogue', inside);
    pg.meta.epilogue = true;
    if (project.epilogue && project.epilogue.paragraphs.length) {
      var et = project.epilogue.title.replace(/^epilogue\s*[:—\-–]\s*/i, '') || 'Epilogue';
      var ef = chapterPage(pg, 'EPILOGUE', et, project.epilogue.paragraphs);
      fit.epilogue = { fits: ef.fits, size: ef.size, cut: ef.cut || 0 };
      if (!ef.fits) pg.meta.problem = 'Too long for one page: cut about ' + ef.cut + ' words.';
    } else {
      placeholderPage(pg, 'Epilogue', 'The epilogue arrives with the last part of the chapters.');
    }
    pages.push(pg);

    var sol = [];
    for (var m = 1; m <= d.N; m++) {
      var pzm = state.puzzles[m];
      var prepm = state.prepared[m];
      var clueDisp = prepm && (prepm.list.find(function (x) { return x.isClue; }) || {}).display;
      sol.push({ caption: 'Puzzle ' + m, sub: clueDisp ? 'Missing clue: ' + clueDisp : (project.chapters[m] ? project.chapters[m].title : ''), subFont: clueDisp ? 'serifBold' : 'serifItalic', pz: pzm && pzm.ok ? pzm : null });
    }
    sol.push({ caption: 'The Final Reveal', sub: state.final && state.final.ok ? state.final.messageSpaced : '', subFont: 'serifBold', pz: state.final && state.final.ok ? state.final : null });
    ctx.solutions = sol;
    solutionsPages(pages, ctx, d.pages.solutionsStart, inside);

    pg = new Page(d.pages.closing, 'closing', 'Thank you', inside); closingPage(pg, ctx); pages.push(pg);

    // checks: margins, minimum font size, line weights
    var minFont = Infinity, outside = [];
    pages.forEach(function (p) {
      var bad = 0;
      p.items.forEach(function (it) {
        var b = bbox(it);
        if (it.t === 'text') minFont = Math.min(minFont, it.size);
        if (b.x0 < p.x0 - 0.5 || b.x1 > p.x1 + 0.5 || b.y0 < p.y0 - 0.5 || b.y1 > p.y1 + 0.5) bad++;
      });
      if (bad) { outside.push(p.num); p.meta.outside = bad; }
    });
    return { pages: pages, fit: fit, minFont: minFont === Infinity ? 0 : minFont, outside: outside, insideMargin: inside };
  }

  function bbox(it) {
    if (it.t === 'text') {
      var f = F[it.font];
      var w = f.width(it.str, it.size);
      return { x0: it.x, x1: it.x + w, y0: it.y - f.ascent * it.size * 0.92, y1: it.y + f.descent * it.size };
    }
    if (it.t === 'line') {
      var h = it.w / 2;
      return { x0: Math.min(it.x1, it.x2) - h, x1: Math.max(it.x1, it.x2) + h, y0: Math.min(it.y1, it.y2) - h, y1: Math.max(it.y1, it.y2) + h };
    }
    if (it.t === 'rect') {
      var hw = it.fill ? 0 : it.lw / 2;
      return { x0: it.x - hw, x1: it.x + it.w + hw, y0: it.y - hw, y1: it.y + it.h + hw };
    }
    var xs = [], ys = [];
    it.d.forEach(function (c) { for (var i = 1; i < c.length; i += 2) { xs.push(c[i]); ys.push(c[i + 1]); } });
    var pad = it.fill ? 0 : (it.lw || 0) / 2;
    return { x0: Math.min.apply(null, xs) - pad, x1: Math.max.apply(null, xs) + pad, y0: Math.min.apply(null, ys) - pad, y1: Math.max.apply(null, ys) + pad };
  }

  Cozy.layout = { W: W, H: H, layoutBook: layoutBook, bbox: bbox, BODY_BOTTOM: BODY_BOTTOM };
})(typeof window !== 'undefined' ? window : globalThis);
