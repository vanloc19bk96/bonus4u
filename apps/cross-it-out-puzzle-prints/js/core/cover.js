/*
 * The paperback cover: back, spine and front on one sheet at the exact size KDP asks for
 * (trim, page count, paper, 0.125 in bleed on every side). Drawn from the same simple items as
 * the interior, in color:
 *   { t:'text', ..., color, angle? }  { t:'rect', ..., mode, color }  { t:'line', ..., color }
 *   { t:'ellipse', ..., mode, color } { t:'poly', pts, closed, mode, color }
 * Three front designs, each in six palettes. Every word sits inside KDP's safe area (0.25 in
 * from the trim, 0.0625 in inside the spine folds), and the barcode corner of the back is kept
 * clear. The little line-up on the front is taken from the book's own first case.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var KDP = CX.kdp, C = CX.clues;
  var PT = 72;
  var F;

  var PALETTES = {
    tomato: { label: 'Tomato', bg: '#E04F35', ink: '#FFFFFF', card: '#FFF8EA', cardInk: '#1E1B18', mark: '#C8321D', soft: '#F6B9A9', dark: '#7A2416', strike: '#2A1410' },
    navy: { label: 'Navy', bg: '#1C2E4A', ink: '#FFFFFF', card: '#FDF8EC', cardInk: '#1C2E4A', mark: '#D9412B', soft: '#9FB2CE', dark: '#0F1A2B', strike: '#F06A4F' },
    teal: { label: 'Teal', bg: '#0F7C7A', ink: '#FFFFFF', card: '#FFFBF0', cardInk: '#123433', mark: '#E0543A', soft: '#9BD3CF', dark: '#0A4F4E', strike: '#FFC44D' },
    mustard: { label: 'Mustard', bg: '#F2B632', ink: '#1F1A12', card: '#FFFDF6', cardInk: '#1F1A12', mark: '#C73A22', soft: '#FADB8E', dark: '#7A5A0F', strike: '#C73A22' },
    plum: { label: 'Plum', bg: '#5B2A5E', ink: '#FFFFFF', card: '#FFF7F0', cardInk: '#2C1530', mark: '#E0573F', soft: '#C9A2CB', dark: '#33163A', strike: '#FF8A65' },
    forest: { label: 'Forest', bg: '#2F5D3A', ink: '#FFFFFF', card: '#FBF7EA', cardInk: '#1B2B1F', mark: '#D8472E', soft: '#A9C9AE', dark: '#1A3621', strike: '#FFC44D' }
  };

  var DESIGNS = [
    { id: 'notecard', label: 'Note card', hint: 'A taped note card with the clues, and a line-up below.' },
    { id: 'tiles', label: 'Word tiles', hint: 'A grid of word tiles, crossed out one by one.' },
    { id: 'bold', label: 'Bold type', hint: 'A big stacked title and a striking red cross-out.' }
  ];

  function r2(v) { return Math.round(v * 100) / 100; }
  function txt(str, font) { return CX.metrics.printable(String(str == null ? '' : str), F[font]); }
  function width(str, size, font, ls, hs) { var s = txt(str, font); return (F[font].width(s, size) + (ls || 0) * Math.max(0, s.length - 1)) * (hs || 1); }

  function Sheet(W, H) { this.W = W; this.H = H; this.items = []; }
  Sheet.prototype.rect = function (x, y, w, h, color) { this.items.push({ t: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), mode: 'fill', color: color }); };
  Sheet.prototype.frame = function (x, y, w, h, color, lw, dash) {
    var it = { t: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), mode: 'stroke', color: color, lw: lw || 1 };
    if (dash) it.dash = dash;
    this.items.push(it);
  };
  Sheet.prototype.line = function (x1, y1, x2, y2, color, w, cap) {
    var it = { t: 'line', x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), w: w || 1, color: color };
    if (cap) it.cap = true;
    this.items.push(it);
  };
  Sheet.prototype.ring = function (cx, cy, rx, ry, color, lw) { this.items.push({ t: 'ellipse', cx: r2(cx), cy: r2(cy), rx: r2(rx), ry: r2(ry), mode: 'stroke', color: color, lw: lw || 1 }); };
  Sheet.prototype.disc = function (cx, cy, r, color) { this.items.push({ t: 'ellipse', cx: r2(cx), cy: r2(cy), rx: r2(r), ry: r2(r), mode: 'fill', color: color }); };
  Sheet.prototype.poly = function (pts, color) { this.items.push({ t: 'poly', pts: pts.map(r2), closed: true, mode: 'fill', color: color }); };
  // align: 'left' | 'center' | 'right'; returns the width drawn
  Sheet.prototype.text = function (str, x, y, size, font, color, o) {
    o = o || {};
    var s = txt(str, font);
    if (!s) return 0;
    var w = width(s, size, font, o.ls, o.hs);
    if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w;
    var it = { t: 'text', x: r2(x), y: r2(y), str: s, font: font, size: r2(size), color: color };
    if (o.ls) it.ls = r2(o.ls);
    if (o.hs && o.hs !== 1) it.hs = r2(o.hs);
    if (o.angle) it.angle = o.angle;
    this.items.push(it);
    return w;
  };

  function wrap(str, size, font, maxW) {
    var words = String(str).split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur && width(t, size, font) > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // The title split into 1-3 lines at the biggest size that fits the box.
  function titleLines(title, maxW, maxH, cap, font, hs, lead) {
    var words = title.split(/\s+/).filter(Boolean), best = { lines: [title], size: 8 };
    for (var n = 1; n <= Math.min(3, words.length); n++) {
      parts(words, n).forEach(function (lines) {
        var widest = Math.max.apply(null, lines.map(function (l) { return width(l, 1, font, 0, hs); }));
        var size = Math.min(cap, maxW / widest, maxH / (n * lead));
        if (size > best.size + 0.01) best = { lines: lines, size: size };
      });
    }
    return best;
  }
  function parts(words, n) {
    if (n === 1) return [[words.join(' ')]];
    var out = [];
    for (var k = 1; k <= words.length - n + 1; k++) {
      parts(words.slice(k), n - 1).forEach(function (rest) { out.push([words.slice(0, k).join(' ')].concat(rest)); });
    }
    return out;
  }

  // ---------- what the cover says ----------
  function words(project, built) {
    var s = project.setup, c = s.cover || {};
    var n = built.all.length;
    var title = (s.title || '').trim() || 'Cross It Out If…';
    var levels = built.levels.filter(function (l) { return l.puzzles.length; }).length;
    return {
      title: title,
      subtitle: CX.book.subtitle(project, built),
      author: (s.author || '').trim(),
      badge: (c.badge || '').trim() || (s.largePrint ? 'LARGE PRINT' : (n ? n + ' CASES' : '')),
      kicker: s.audience === 'kids' ? 'A detective puzzle book' : 'A brain-teasing puzzle book',
      blurb: (c.blurb || '').trim(),
      count: n, levels: levels
    };
  }

  function defaultBlurb(project, built) {
    var s = project.setup, n = built.all.length;
    return [
      'Every case in this book is a little mystery with a line-up of possible answers. Read each “Cross it out if…” clue, cross out everything it describes, and the one option left standing is your answer.',
      (n ? n + ' original cases' : 'Original cases') + ' move from gentle warm-ups to master files that will test the sharpest detective. ' +
        (s.audience === 'kids' ? 'Perfect for young detectives, car journeys and rainy afternoons.' : 'Perfect for a quiet coffee break, a long journey or a cozy evening in.')
    ].join('\n');
  }

  function insideList(project, built) {
    var s = project.setup, out = [];
    var lv = built.levels.filter(function (l) { return l.puzzles.length; });
    out.push(built.all.length + ' puzzles in ' + lv.length + ' level' + (lv.length === 1 ? '' : 's') + ', from easy to expert');
    if (s.pages.welcome) out.push('How to play, with a worked example');
    if (s.pages.guide) out.push('A clue guide for every kind of clue');
    out.push('Every puzzle checked: exactly one answer');
    out.push(s.pages.solutions === 'explained' ? 'Solutions with every step explained' : 'All the answers at the back');
    if (s.largePrint) out.push('Large, easy-to-read print');
    return out;
  }

  // A little line-up for the front: the first case's options, most crossed out, one circled.
  function frontLineup(built, max) {
    var pz = built.all[0];
    var opts = pz ? pz.options.slice() : ['Apple', 'Blanket', 'Cheese', 'Fork', 'Grapes', 'Napkin', 'Plate', 'Sandwich', 'Teapot'];
    var ans = pz ? pz.answer : 3;
    var list = [];
    for (var i = 0; i < opts.length && list.length < max; i++) if (i !== ans) list.push({ text: opts[i].toUpperCase(), ans: false });
    list.splice(Math.min(list.length, Math.floor(max / 2) + 1), 0, { text: opts[ans].toUpperCase(), ans: true });
    list = list.slice(0, max);
    var clues = pz ? pz.clues.slice(0, 3).map(function (c) { return c.text; }) : ['It has more than five letters', 'It contains the letter P'];
    return { list: list, clues: clues };
  }

  // ---------- the sheet ----------
  function layout(project, built, book) {
    F = F || CX.metrics.load();
    var s = project.setup, c = s.cover || {};
    var pal = PALETTES[c.palette] || PALETTES.tomato;
    var design = DESIGNS.filter(function (d) { return d.id === c.design; })[0] || DESIGNS[0];
    var trim = KDP.trim(s.trim);
    var dims = KDP.cover(s.trim, book.pageCount, s.paper);
    var W = dims.width * PT, H = dims.height * PT;
    var b = KDP.COVER_BLEED * PT, tw = trim.w * PT;
    var spineX0 = b + tw, spineX1 = spineX0 + dims.spine * PT;
    var safeIn = 0.25 * PT;
    var sh = new Sheet(W, H);
    var wd = words(project, built);

    var guides = {
      bleed: b, spineX0: spineX0, spineX1: spineX1,
      safe: [
        { x: b + safeIn, y: b + safeIn, w: tw - safeIn * 2, h: H - 2 * b - safeIn * 2 },
        { x: spineX1 + safeIn, y: b + safeIn, w: tw - safeIn * 2, h: H - 2 * b - safeIn * 2 }
      ],
      barcode: { x: spineX0 - safeIn - 2 * PT, y: H - b - safeIn - 1.2 * PT, w: 2 * PT, h: 1.2 * PT }
    };
    if (dims.spineText) guides.safe.push({ x: spineX0 + 0.0625 * PT, y: b + safeIn, w: spineX1 - spineX0 - 0.125 * PT, h: H - 2 * b - safeIn * 2 });

    // background over the whole sheet, bleed included
    sh.rect(0, 0, W, H, pal.bg);

    var front = { x: spineX1 + safeIn, y: b + safeIn, w: tw - safeIn * 2, h: H - 2 * b - safeIn * 2 };
    front.cx = front.x + front.w / 2;
    front.x0 = spineX1; front.x1 = W;
    if (design.id === 'tiles') frontTiles(sh, front, pal, wd, built);
    else if (design.id === 'bold') frontBold(sh, front, pal, wd, built);
    else frontNotecard(sh, front, pal, wd, built);

    spine(sh, spineX0, spineX1, b, H, pal, wd, dims);
    back(sh, { x: b + safeIn, y: b + safeIn, w: tw - safeIn * 2, h: H - 2 * b - safeIn * 2 }, pal, wd, project, built, guides.barcode);

    return {
      W: W, H: H, items: sh.items, guides: guides, spine: dims.spine, spineText: dims.spineText,
      inches: { w: dims.width, h: dims.height }, design: design.id, palette: c.palette in PALETTES ? c.palette : 'tomato'
    };
  }

  // ---------- fronts ----------
  function badge(sh, cx, cy, r, pal, text) {
    if (!text) return;
    sh.disc(cx, cy, r, pal.mark);
    sh.ring(cx, cy, r - 3.5, r - 3.5, '#FFFFFF', 1);
    var ws = text.split(' ');
    var lines = ws.length > 1 && /^\d+$/.test(ws[0]) ? [ws[0], ws.slice(1).join(' ')] : [text];
    if (lines.length === 2) {
      var big = Math.min(r * 0.82, (r * 1.45) / Math.max(0.1, width(lines[0], 1, 'sansBold')));
      var small = Math.min(r * 0.3, (r * 1.4) / Math.max(0.1, width(lines[1], 1, 'sansBold', 0.08)));
      sh.text(lines[0], cx, cy + big * 0.22, big, 'sansBold', '#FFFFFF', { align: 'center' });
      sh.text(lines[1], cx, cy + big * 0.22 + small * 1.25, small, 'sansBold', '#FFFFFF', { align: 'center', ls: small * 0.08 });
    } else {
      var size = Math.min(r * 0.36, (r * 1.45) / Math.max(0.1, width(text, 1, 'sansBold')));
      if (size < r * 0.24 && text.indexOf(' ') !== -1) {
        var half = text.split(' '), mid = Math.ceil(half.length / 2);
        var l1 = half.slice(0, mid).join(' '), l2 = half.slice(mid).join(' ');
        size = Math.min(r * 0.36, (r * 1.45) / Math.max(width(l1, 1, 'sansBold'), width(l2, 1, 'sansBold')));
        sh.text(l1, cx, cy - size * 0.2, size, 'sansBold', '#FFFFFF', { align: 'center' });
        sh.text(l2, cx, cy + size * 0.95, size, 'sansBold', '#FFFFFF', { align: 'center' });
      } else sh.text(text, cx, cy + size * 0.35, size, 'sansBold', '#FFFFFF', { align: 'center' });
    }
  }

  function tape(sh, cx, cy, w, h, deg, color) {
    var a = deg * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), pts = [];
    [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].forEach(function (p) { pts.push(cx + p[0] * co - p[1] * si, cy + p[0] * si + p[1] * co); });
    sh.poly(pts, color);
  }

  // Title block at the top of a front: kicker, title, subtitle. Returns the y below it.
  function titleBlock(sh, f, pal, wd, top, maxH, color) {
    var ks = Math.max(8, f.w * 0.032);
    sh.text(wd.kicker.toUpperCase(), f.cx, top + ks, ks, 'sansBold', color, { align: 'center', ls: ks * 0.22 });
    var y = top + ks * 2.1;
    var tl = titleLines(wd.title.toUpperCase(), f.w, maxH, f.w * 0.2, 'sansBold', 0.84, 0.98);
    tl.lines.forEach(function (l) { y += tl.size * 0.98; sh.text(l, f.cx, y - tl.size * 0.16, tl.size, 'sansBold', color, { align: 'center', hs: 0.84 }); });
    y += tl.size * 0.1;
    var ss = Math.max(9, f.w * 0.04);
    wrap(wd.subtitle, ss, 'serif', f.w * 0.92).slice(0, 2).forEach(function (l) { y += ss * 1.32; sh.text(l, f.cx, y, ss, 'serif', color, { align: 'center' }); });
    return y;
  }

  function authorLine(sh, f, color, wd) {
    if (!wd.author) return;
    var as = Math.max(9, f.w * 0.042);
    while (as > 8 && width(wd.author.toUpperCase(), as, 'sansBold', as * 0.18) > f.w) as -= 0.5;
    sh.text(wd.author.toUpperCase(), f.cx, f.y + f.h - F.sansBold.descent * as - 0.5, as, 'sansBold', color, { align: 'center', ls: as * 0.18 });
  }

  function frontNotecard(sh, f, pal, wd, built) {
    var y = titleBlock(sh, f, pal, wd, f.y, f.h * 0.3, pal.ink);
    var lu = frontLineup(built, 9);
    // the note card with the clues
    // with a badge, the card sits left and the badge beside it
    var br = Math.min(f.w * 0.1, f.w * 0.11 - 3);
    var cw = wd.badge ? f.w - br * 2 - 10 : f.w * 0.9, cx0 = wd.badge ? f.x : f.cx - cw / 2, cs = Math.max(8.5, f.w * 0.04);
    var clueLines = lu.clues.map(function (t) { return wrap(t, cs, 'sans', cw - cs * 4.4); });
    var nLines = clueLines.reduce(function (a, l) { return a + l.length; }, 0);
    var top = y + f.h * 0.05, ch = cs * 4.2 + nLines * cs * 1.45 + cs * 0.6;
    sh.rect(cx0 + 4, top + 4, cw, ch, pal.dark);
    sh.rect(cx0, top, cw, ch, pal.card);
    tape(sh, cx0 + cw * 0.12, top + 2, cw * 0.2, cs * 1.1, -28, pal.soft);
    tape(sh, cx0 + cw * 0.88, top + 2, cw * 0.2, cs * 1.1, 28, pal.soft);
    var yy = top + cs * 2.6;
    sh.text('CROSS IT OUT IF…', cx0 + cs * 1.4, yy, cs * 1.05, 'sansBold', pal.cardInk, { ls: cs * 0.08 });
    yy += cs * 0.5;
    clueLines.forEach(function (ls, i) {
      ls.forEach(function (l, li) {
        yy += cs * 1.45;
        if (!li) {
          sh.ring(cx0 + cs * 2, yy - cs * 0.34, cs * 0.6, cs * 0.6, pal.cardInk, 0.9);
          sh.text(String(i + 1), cx0 + cs * 2, yy, cs * 0.78, 'sansBold', pal.cardInk, { align: 'center' });
        }
        sh.text(l, cx0 + cs * 3.2, yy, cs, 'sans', pal.cardInk);
      });
    });
    // the line-up below, on the background
    var authorRoom = wd.author ? Math.max(9, f.w * 0.042) * 2.4 : 0;
    var areaTop = top + ch + f.h * 0.05, areaBot = f.y + f.h - authorRoom;
    var rows = [lu.list.slice(0, 3), lu.list.slice(3, 6), lu.list.slice(6, 9)].filter(function (r) { return r.length; });
    var ws = Math.min(f.w * 0.06, (areaBot - areaTop) / (rows.length * 2.1));
    rows.forEach(function (row, ri) {
      var gap = ws * 1.2;
      var size = ws;
      var tot = function (z) { return row.reduce(function (a, o) { return a + width(o.text, z, 'sansBold', z * 0.05); }, 0) + gap * (row.length - 1) * z / ws; };
      while (tot(size) > f.w * 0.96 && size > 7) size -= 0.25;
      var g = gap * size / ws, x = f.cx - tot(size) / 2, by = areaTop + (ri + 0.75) * ws * 2.1;
      row.forEach(function (o, oi) {
        var w = sh.text(o.text, x, by, size, 'sansBold', pal.ink, { ls: size * 0.05 });
        if (o.ans) sh.ring(x + w / 2, by - size * 0.35, w / 2 + size * 0.45, size * 0.85, pal.ink, 1.6);
        else sh.line(x - 2, by - size * 0.3 + (oi % 2 ? 1 : -1), x + w + 2, by - size * 0.38, pal.strike, Math.max(1.6, size * 0.13), true);
        x += w + g;
      });
    });
    badge(sh, f.x + f.w - br, top + ch / 2, br, pal, wd.badge);
    authorLine(sh, f, pal.ink, wd);
  }

  function frontTiles(sh, f, pal, wd, built) {
    var y = titleBlock(sh, f, pal, wd, f.y, f.h * 0.3, pal.ink);
    var lu = frontLineup(built, 12);
    var authorRoom = wd.author ? Math.max(9, f.w * 0.042) * 2.6 : 0;
    var br = f.w * 0.1, top = y + f.h * 0.06, bot = f.y + f.h - authorRoom - f.h * 0.02 - (wd.badge ? br * 2 + 6 : 0);
    var cols = 3, rows = Math.ceil(lu.list.length / cols), gap = f.w * 0.025;
    var cw = (f.w - gap * (cols - 1)) / cols, chh = Math.min(cw * 0.42, (bot - top - gap * (rows - 1)) / rows);
    var longest = lu.list.reduce(function (a, o) { return Math.max(a, width(o.text, 1, 'sansBold', 0.05)); }, 0);
    var fs = Math.min(chh * 0.36, (cw - 12) / longest);
    lu.list.forEach(function (o, i) {
      var r = Math.floor(i / cols), cc = i % cols;
      var x = f.x + cc * (cw + gap), yy = top + r * (chh + gap);
      sh.rect(x, yy, cw, chh, pal.card);
      var w = sh.text(o.text, x + cw / 2, yy + chh / 2 + fs * 0.35, fs, 'sansBold', pal.cardInk, { align: 'center', ls: fs * 0.05 });
      if (o.ans) { sh.frame(x + 3, yy + 3, cw - 6, chh - 6, pal.mark, 2.2); }
      else if ((i * 7) % 5 !== 1) sh.line(x + cw / 2 - w / 2 - 4, yy + chh / 2 + 1, x + cw / 2 + w / 2 + 4, yy + chh / 2 - 2, pal.mark, Math.max(1.8, fs * 0.16), true);
    });
    var gridBot = top + rows * (chh + gap) - gap;
    var free = f.y + f.h - authorRoom - gridBot;
    badge(sh, f.x + f.w - br, gridBot + Math.max(br + 4, free / 2), br, pal, wd.badge);
    authorLine(sh, f, pal.ink, wd);
  }

  function frontBold(sh, f, pal, wd, built) {
    // a band of card colour behind the title
    var ks = Math.max(8, f.w * 0.032);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + ks, ks, 'sansBold', pal.ink, { align: 'center', ls: ks * 0.22 });
    var bandTop = f.y + ks * 2.2, bandH = f.h * 0.46;
    sh.rect(f.x0, bandTop, f.x1 - f.x0, bandH, pal.card);
    var tl = titleLines(wd.title.toUpperCase(), f.w * 0.94, bandH * 0.86, f.w * 0.3, 'sansBold', 0.8, 0.95);
    var y = bandTop + (bandH - tl.lines.length * tl.size * 0.95) / 2 - tl.size * 0.12;
    tl.lines.forEach(function (l, i) {
      y += tl.size * 0.95;
      var w = sh.text(l, f.cx, y, tl.size, 'sansBold', pal.cardInk, { align: 'center', hs: 0.8 });
      if (i === 0 && tl.lines.length > 1) sh.line(f.cx - w / 2 - 4, y - tl.size * 0.3, f.cx + w / 2 + 4, y - tl.size * 0.42, pal.mark, Math.max(3, tl.size * 0.09), true);
    });
    var ss = Math.max(9, f.w * 0.05);
    var yy = bandTop + bandH + ss * 2.1;
    wrap(wd.subtitle, ss, 'serifBold', f.w * 0.94).slice(0, 2).forEach(function (l) { sh.text(l, f.cx, yy, ss, 'serifBold', pal.ink, { align: 'center' }); yy += ss * 1.3; });
    var lu = frontLineup(built, 6);
    var line = lu.list.map(function (o) { return o.text; });
    var authorTop = f.y + f.h - (wd.author ? Math.max(9, f.w * 0.042) * 2.4 : 0);
    var ls = Math.max(8, Math.min(f.w * 0.06, (authorTop - yy) / 5.2));
    var rowY = yy + (authorTop - yy - ls * 2.3) / 2 - ls * 0.2;
    [line.slice(0, 3), line.slice(3, 6)].forEach(function (row, ri) {
      var size = ls;
      while (size > 7 && width(row.join('   •   '), size, 'sans', size * 0.06) > f.w) size -= 0.25;
      var total = width(row.join('   •   '), size, 'sans', size * 0.06), x = f.cx - total / 2;
      row.forEach(function (t, i) {
        var w = sh.text(t, x, rowY + ri * size * 2.3, size, 'sans', pal.ink, { ls: size * 0.06 });
        var isAns = lu.list.filter(function (o) { return o.text === t; })[0].ans;
        if (!isAns) sh.line(x - 2, rowY + ri * size * 2.3 - size * 0.33, x + w + 2, rowY + ri * size * 2.3 - size * 0.36, pal.strike, 1.6, true);
        else sh.ring(x + w / 2, rowY + ri * size * 2.3 - size * 0.35, w / 2 + size * 0.5, size * 0.85, pal.ink, 1.4);
        x += w + width('   •   ', size, 'sans', size * 0.06);
        if (i < row.length - 1) sh.disc(x - width('   •   ', size, 'sans', size * 0.06) / 2, rowY + ri * size * 2.3 - size * 0.33, size * 0.1, pal.ink);
      });
    });
    badge(sh, f.x + f.w - f.w * 0.1, bandTop + bandH - f.w * 0.02, f.w * 0.1, pal, wd.badge);
    authorLine(sh, f, pal.ink, wd);
  }

  // ---------- spine ----------
  function spine(sh, x0, x1, b, H, pal, wd, dims) {
    var sw = x1 - x0;
    if (!dims.spineText) return;
    var room = sw - 0.125 * PT;          // 0.0625 in from each fold
    var capH = F.sansBold.capHeight;
    var size = Math.min(room * 0.8 / capH, 15);
    if (size < KDP.MIN_FONT_PT) return;
    var cx = (x0 + x1) / 2;
    var title = wd.title.toUpperCase(), author = wd.author.toUpperCase();
    var maxLen = H - 2 * b - 0.5 * PT;
    var gap = size * 2;
    while (size > KDP.MIN_FONT_PT && width(title, size, 'sansBold', size * 0.06) + (author ? width(author, size * 0.8, 'sans', size * 0.1) + gap : 0) > maxLen) size -= 0.25;
    var tw = width(title, size, 'sansBold', size * 0.06), aw = author ? width(author, size * 0.8, 'sans', size * 0.1) : 0;
    var total = tw + (author ? gap + aw : 0);
    var y0 = H / 2 - total / 2;
    // rotated 90° clockwise: text runs top to bottom, baseline toward the back cover
    var as = Math.max(KDP.MIN_FONT_PT, size * 0.8);
    sh.text(title, cx - size * capH / 2, y0, size, 'sansBold', pal.ink, { ls: size * 0.06, angle: -90 });
    if (author) sh.text(author, cx - as * F.sans.capHeight / 2, y0 + tw + gap, as, 'sans', pal.ink, { ls: as * 0.1, angle: -90 });
  }

  // ---------- back ----------
  function back(sh, r, pal, wd, project, built, bar) {
    var cx = r.x + r.w / 2;
    var hs = Math.max(11, r.w * 0.065);
    var y = r.y + hs * 1.1;
    var head = 'CAN YOU FIND THE LAST ONE STANDING?', hl;
    for (; hs > 9; hs -= 0.25) { hl = balanced(head, hs, 'sansBold', r.w * 0.94, 0.86); if (hl.length <= 2) break; }
    hl.forEach(function (l, i) { sh.text(l, cx, y + i * hs * 1.08, hs, 'sansBold', pal.ink, { align: 'center', hs: 0.86 }); });
    y += (hl.length - 1) * hs * 1.08 + hs * 0.9;

    var bs = Math.max(8.5, Math.min(12.5, r.w * 0.036));
    var blurb = wd.blurb || defaultBlurb(project, built);
    var paras = blurb.split(/\n+/).map(function (p) { return p.trim(); }).filter(Boolean);
    var inside = insideList(project, built);
    // the space down to the barcode, shared by the blurb, the list and a sample clue card
    var bottom = bar.y - r.w * 0.04;
    var fit;
    for (; bs >= 8; bs -= 0.25) {
      fit = [];
      paras.forEach(function (p, i) { if (i) fit.push(null); fit = fit.concat(wrap(p, bs, 'serif', r.w)); });
      var hh = fit.reduce(function (a, l) { return a + (l === null ? bs * 0.6 : bs * 1.42); }, 0) + bs * 3.4 + inside.length * bs * 1.6 + bs * 1.5;
      if (y + hh <= bottom) break;
    }
    fit.forEach(function (l) {
      if (l === null) { y += bs * 0.6; return; }
      y += bs * 1.42;
      sh.text(l, r.x, y, bs, 'serif', pal.ink);
    });
    y += bs * 2;
    sh.text('INSIDE THIS BOOK', r.x, y, bs * 0.95, 'sansBold', pal.ink, { ls: bs * 0.16 });
    y += bs * 0.4;
    inside.forEach(function (t) {
      y += bs * 1.6;
      // a small check box, ticked
      var s = bs * 0.8;
      sh.frame(r.x, y - s * 0.95, s, s, pal.ink, 0.9);
      sh.line(r.x + s * 0.2, y - s * 0.5, r.x + s * 0.42, y - s * 0.22, pal.ink, 1.2, true);
      sh.line(r.x + s * 0.42, y - s * 0.22, r.x + s * 0.9, y - s * 0.95, pal.ink, 1.2, true);
      sh.text(t, r.x + s * 1.7, y, bs, 'sans', pal.ink);
    });
    tryCase(sh, { x: r.x, y: y + bs * 1.8, w: r.w, bottom: bottom }, pal, built);
    // the publisher line at the bottom left, beside the barcode box
    var room = bar.x - r.x - 10;
    var line = wd.author ? 'By ' + wd.author : '';
    if (line) {
      var ps = Math.min(bs, 10);
      while (ps > 7 && width(line, ps, 'sansBold') > room) ps -= 0.25;
      sh.text(line, r.x, r.y + r.h - F.sansBold.descent * ps - 0.5, ps, 'sansBold', pal.ink);
    }
  }

  // Lines of about equal length at one size (for short headlines).
  function balanced(str, size, font, maxW, hs) {
    var ws = String(str).split(/\s+/).filter(Boolean), best = null;
    for (var n = 1; n <= Math.min(3, ws.length); n++) {
      parts(ws, n).forEach(function (lines) {
        var widest = Math.max.apply(null, lines.map(function (l) { return width(l, size, font, 0, hs); }));
        if (widest > maxW) return;
        if (!best || lines.length < best.lines.length || (lines.length === best.lines.length && widest < best.w)) best = { lines: lines, w: widest };
      });
      if (best) return best.lines;
    }
    return [str, '', '', ''];
  }

  // A small sample case on a card, from the book's second case, when the back has room for it.
  function tryCase(sh, r, pal, built) {
    var pz = built.all[1] || built.all[0];
    if (!pz) return;
    var cs = Math.max(8, Math.min(10.5, r.w * 0.03)), pad = cs * 1.3;
    var clues = pz.clues;
    var opts = pz.options.map(function (o) { return o.toUpperCase(); });
    var inner = r.w - pad * 2;
    var lineup = wrap(opts.join('  ·  '), cs * 0.92, 'sans', inner);
    var clueLines = clues.map(function (c, i) { return wrap((i + 1) + '.  ' + c.text, cs, 'sans', inner); });
    var nCl = clueLines.reduce(function (a, l) { return a + l.length; }, 0);
    var h = pad + cs * 1.2 + cs * 1.6 + cs * 1.4 * nCl + cs * 0.8 + lineup.length * cs * 1.35 + pad;
    if (r.y + h > r.bottom) return;
    sh.rect(r.x + 3, r.y + 3, r.w, h, pal.dark);
    sh.rect(r.x, r.y, r.w, h, pal.card);
    var y = r.y + pad + cs * 0.9;
    var lab = 'TRY A CASE', lw = sh.text(lab, r.x + pad, y, cs * 0.9, 'sansBold', pal.mark, { ls: cs * 0.14 });
    var t = pz.title, room = inner - lw - cs;
    while (t.length > 4 && width(t, cs * 1.05, 'serifBold') > room) t = t.slice(0, -2).replace(/\s+\S*$/, '') + '…';
    sh.text(t, r.x + r.w - pad, y, cs * 1.05, 'serifBold', pal.cardInk, { align: 'right' });
    y += cs * 1.6;
    sh.text('Cross it out if…', r.x + pad, y, cs, 'sansBold', pal.cardInk);
    clueLines.forEach(function (ls) { ls.forEach(function (l) { y += cs * 1.4; sh.text(l, r.x + pad, y, cs, 'sans', pal.cardInk); }); });
    y += cs * 0.8;
    lineup.forEach(function (l) { y += cs * 1.35; sh.text(l, r.x + pad, y, cs * 0.92, 'sans', pal.cardInk); });
  }

  /*
   * Cover checks: text inside a safe area, nothing over the barcode box, no text under 7 pt.
   * Returns a list of problems in plain words.
   */
  function audit(cv) {
    F = F || CX.metrics.load();
    var out = [], g = cv.guides, seen = {};
    function inside(bx, rr) { return bx.x >= rr.x - 0.5 && bx.y >= rr.y - 0.5 && bx.x + bx.w <= rr.x + rr.w + 0.5 && bx.y + bx.h <= rr.y + rr.h + 0.5; }
    function overlaps(bx, rr) { return bx.x < rr.x + rr.w && bx.x + bx.w > rr.x && bx.y < rr.y + rr.h && bx.y + bx.h > rr.y; }
    cv.items.forEach(function (it) {
      if (it.t !== 'text') return;
      var f = F[it.font], w = f.width(it.str, it.size, it.ls || 0) * (it.hs || 1);
      var bx;
      if (it.angle === -90) bx = { x: it.x - 0.05 * it.size, y: it.y, w: (f.capHeight + 0.1) * it.size, h: w };
      else bx = { x: it.x, y: it.y - f.ascent * it.size, w: w, h: (f.ascent + f.descent) * it.size };
      var msg = null;
      if (it.size < KDP.MIN_FONT_PT - 0.01) msg = '“' + it.str + '” is smaller than 7 pt';
      else if (!g.safe.some(function (rr) { return inside(bx, rr); })) msg = '“' + it.str + '” is outside the safe area';
      else if (g.barcode && overlaps(bx, g.barcode)) msg = '“' + it.str + '” covers the barcode area';
      if (msg && !seen[msg]) { seen[msg] = 1; out.push(msg); }
    });
    return out;
  }

  CX.cover = { PALETTES: PALETTES, DESIGNS: DESIGNS, layout: layout, audit: audit, words: words, defaultBlurb: defaultBlurb };
})(typeof window !== 'undefined' ? window : globalThis);
