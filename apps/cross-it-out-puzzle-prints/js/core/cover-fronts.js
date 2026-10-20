/*
 * The front covers. Each layout draws into the front's safe box f = { x, y, w, h, cx } (all words
 * stay inside it) and may paint shapes out to the bleed: f.x0..f.x1 across, 0..f.H down.
 * A layout gets the palette, the cover's words, the built book and the template's options
 * ({ deco: 'pumpkin' | 'ornament' | 'spider' | 'leaf' | 'star', scatter: 'snow' | 'confetti' | 'stars' | 'hearts' }).
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var K = CX.cover.kit;
  var width = K.width, wrap = K.wrap, titleLines = K.titleLines, mix = K.mix, badge = K.badge;
  var FUN = ['#E63946', '#1D7FD6', '#2BA84A', '#8E44AD', '#F77F00', '#D6336C'];
  var ASC = 1.04; // a little over the fonts' ascent: the first baseline sits this many sizes below a top

  // ---------- small helpers ----------
  // the biggest size, up to cap, at which str fits maxW (k: letter spacing per point of size)
  function fitSize(str, font, maxW, cap, k, hs) { var w1 = width(str, 1, font, k || 0, hs); return Math.min(cap, w1 ? maxW / w1 : cap); }
  // str shortened with … until it fits maxW at this size
  function clip(str, size, font, maxW) {
    var t = String(str);
    while (t.length > 3 && width(t, size, font) > maxW) t = t.replace(/\s*\S+…?$/, '') + '…';
    return t;
  }
  function strike(sh, x, y, w, size, color, n) {
    var d = (n || 0) % 2 ? size * 0.05 : -size * 0.04;
    sh.line(x - size * 0.15, y - size * 0.3 + d, x + w + size * 0.15, y - size * 0.36 - d, color, Math.max(1.4, size * 0.12), true);
  }
  function ringWord(sh, x, y, w, size, color, lw) { sh.ring(x + w / 2, y - size * 0.34, w / 2 + size * 0.5, size * 0.8, color, lw || Math.max(1.3, size * 0.09)); }
  function tick(sh, x, y, s, color, lw) {
    sh.path([x, y + s * 0.5, x + s * 0.35, y + s * 0.85, x + s, y], color, lw || Math.max(1.4, s * 0.16));
  }
  function cross(sh, cx, cy, s, color, lw) {
    sh.line(cx - s, cy - s, cx + s, cy + s, color, lw, true);
    sh.line(cx - s, cy + s, cx + s, cy - s, color, lw, true);
  }
  // Lines stacked from a top edge; returns the bottom of the last line (descent included).
  function stack(sh, lines, size, x, top, lead, font, colors, o) {
    var y = top + size * ASC - size * lead, last = 0;
    lines.forEach(function (l, i) {
      y += size * lead;
      last = sh.text(l, x, y, size, font, typeof colors === 'string' ? colors : colors(i), o);
    });
    return { bottom: y + size * 0.4, base: y, lastW: last };
  }
  // the height stack() gives a title: first ascent, the leads between, the last descent
  function stackH(tl, lead) { return tl.size * (ASC + (tl.lines.length - 1) * lead + 0.4); }
  // a seeded random, so a cover is drawn the same every time
  function rnd(seed) { var s = seed % 2147483647 || 1; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }

  /*
   * The line-up as rows of words in a box: crossed out, the answer ringed. The size shrinks until
   * the rows fit; o = { size, font, color, strike, ring, ringW, lead, gap, align, partial, column (one word a row), hilite (a band behind the answer) }.
   */
  function lineupRows(sh, list, box, o) {
    var font = o.font || 'sansBold', k = o.ls == null ? 0.05 : o.ls, lead = o.lead || 2, gapK = o.gap || 1.1;
    var size = o.size, rows;
    for (;;) {
      rows = [];
      var cur = [], curW = 0;
      list.forEach(function (it) {
        var w = width(it.text, size, font, size * k), add = (cur.length ? size * gapK : 0) + w;
        if (cur.length && (o.column || curW + add > box.w - size * 0.4)) { rows.push({ items: cur, w: curW }); cur = []; curW = 0; add = w; }
        cur.push(it); curW += add;
      });
      if (cur.length) rows.push({ items: cur, w: curW });
      var widest = Math.max.apply(null, rows.map(function (r) { return r.w; }));
      if ((rows.length * size * lead <= box.bottom - box.top && widest <= box.w - size * 0.4) || size <= 7.5) break;
      size = Math.max(7.5, size - 0.25);
    }
    var maxRows = Math.max(1, Math.floor((box.bottom - box.top) / (size * lead)));
    rows = rows.slice(0, maxRows);
    var total = rows.length * size * lead;
    var y = box.top + (box.bottom - box.top - total) / 2 + size * lead / 2 + size * 0.35;
    var n = 0;
    rows.forEach(function (r) {
      var x = o.align === 'left' ? box.x + size * 0.2 : box.x + (box.w - r.w) / 2;
      r.items.forEach(function (it) {
        if (it.ans && o.hilite) {
          var hw = width(it.text, size, font, size * k);
          sh.poly([x - size * 0.25, y - size * 0.95, x + hw + size * 0.3, y - size * 1.02, x + hw + size * 0.25, y + size * 0.3, x - size * 0.3, y + size * 0.35], o.hilite);
        }
        var w = sh.text(it.text, x, y, size, font, o.color, { ls: size * k });
        if (it.ans) ringWord(sh, x, y, w, size, o.ring, o.ringW);
        else if (!o.partial || n % 4 !== 2) strike(sh, x, y, w, size, o.strike, n);
        n++;
        x += w + size * gapK;
      });
      y += size * lead;
    });
    return { size: size, bottom: box.top + total };
  }

  // ---------- little pictures ----------
  function star(sh, cx, cy, r, color, inner) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * (inner || 0.45) : r;
      pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    sh.poly(pts, color);
  }
  function heart(sh, cx, cy, r, color) {
    var pts = [];
    for (var i = 0; i < 28; i++) {
      var t = i / 28 * Math.PI * 2;
      var x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push(cx + x * r / 17, cy - y * r / 17);
    }
    sh.poly(pts, color);
  }
  function triangle(sh, cx, cy, r, color) { sh.poly([cx, cy - r, cx + r * 0.95, cy + r * 0.75, cx - r * 0.95, cy + r * 0.75], color); }
  function diamond(sh, cx, cy, r, color) { sh.poly([cx, cy - r, cx + r * 0.8, cy, cx, cy + r, cx - r * 0.8, cy], color); }
  function leaf(sh, cx, cy, r, color, vein) {
    var pts = [];
    for (var i = 0; i <= 20; i++) { var t = i / 20 * Math.PI * 2; pts.push(cx + Math.sin(t) * r * 0.5 * Math.abs(Math.sin(t / 2) + 0.2), cy - Math.cos(t) * r); }
    sh.poly(pts, color);
    sh.line(cx, cy - r * 0.8, cx, cy + r * 1.25, vein, Math.max(0.8, r * 0.08), true);
  }
  function snowflake(sh, cx, cy, r, color) {
    var lw = Math.max(0.8, r * 0.12);
    for (var i = 0; i < 3; i++) {
      var a = i * Math.PI / 3, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
      sh.line(cx - dx, cy - dy, cx + dx, cy + dy, color, lw, true);
    }
  }
  function magnifier(sh, cx, cy, r, ring, handle, lens) {
    sh.line(cx + r * 0.7, cy + r * 0.7, cx + r * 1.55, cy + r * 1.55, handle, r * 0.3, true);
    if (lens) sh.disc(cx, cy, r, lens);
    sh.ring(cx, cy, r, r, ring, r * 0.16);
  }
  function pencil(sh, tx, ty, len, wid, deg) {
    var a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, hw = wid / 2;
    function at(d, s) { return [tx + ux * d + nx * s, ty + uy * d + ny * s]; }
    var tip = len * 0.16;
    var p = [].concat(at(tip, -hw), at(len * 0.86, -hw), at(len * 0.86, hw), at(tip, hw));
    sh.poly(p, '#F6C445');
    sh.poly([].concat(at(tip, -hw * 0.33), at(len * 0.86, -hw * 0.33), at(len * 0.86, hw * 0.33), at(tip, hw * 0.33)), '#E8B22F');
    sh.poly([].concat(at(0, 0), at(tip, -hw), at(tip, hw)), '#F1D9A8');
    sh.poly([].concat(at(0, 0), at(tip * 0.4, -hw * 0.4), at(tip * 0.4, hw * 0.4)), '#2B2B2B');
    sh.poly([].concat(at(len * 0.86, -hw), at(len * 0.9, -hw), at(len * 0.9, hw), at(len * 0.86, hw)), '#A3ABB5');
    sh.poly([].concat(at(len * 0.9, -hw), at(len, -hw), at(len, hw), at(len * 0.9, hw)), '#EE8E8E');
  }
  function icon(sh, kind, cx, cy, r, pal) {
    if (kind === 'pumpkin') {
      sh.rect(cx - r * 0.09, cy - r * 1.05, r * 0.18, r * 0.35, '#4E7A2E');
      sh.disc(cx - r * 0.45, cy, r * 0.6, '#D96F12', r * 0.78);
      sh.disc(cx + r * 0.45, cy, r * 0.6, '#D96F12', r * 0.78);
      sh.disc(cx, cy, r * 0.62, '#F28C28', r * 0.82);
      triangle(sh, cx - r * 0.28, cy - r * 0.18, r * 0.14, '#3A2410');
      triangle(sh, cx + r * 0.28, cy - r * 0.18, r * 0.14, '#3A2410');
      sh.poly([cx - r * 0.38, cy + r * 0.25, cx + r * 0.38, cy + r * 0.25, cx + r * 0.2, cy + r * 0.42, cx - r * 0.2, cy + r * 0.42], '#3A2410');
    } else if (kind === 'ornament') {
      sh.ring(cx, cy - r * 1.18, r * 0.16, r * 0.16, '#E8B83A', Math.max(1, r * 0.07));
      sh.rect(cx - r * 0.24, cy - r * 1.08, r * 0.48, r * 0.2, '#E8B83A');
      sh.disc(cx, cy, r * 0.92, '#D7302A');
      sh.line(cx - r * 0.86, cy + r * 0.1, cx + r * 0.86, cy + r * 0.1, '#F2C14E', r * 0.12);
      sh.disc(cx - r * 0.32, cy - r * 0.38, r * 0.16, '#FFFFFF');
    } else if (kind === 'spider') {
      sh.line(cx, cy - r * 3.2, cx, cy, pal.mark === pal.bg ? pal.ink : pal.mark, Math.max(0.8, r * 0.06));
      var leg = Math.max(1, r * 0.11);
      [-1, 1].forEach(function (s) {
        [-0.5, -0.15, 0.2, 0.55].forEach(function (k, i) {
          sh.path([cx, cy + r * 0.1, cx + s * r * 0.75, cy + r * (k - 0.25), cx + s * r * (1.05 + i * 0.05), cy + r * (k + 0.35)], '#1A1A1A', leg);
        });
      });
      sh.disc(cx, cy + r * 0.15, r * 0.48, '#1A1A1A');
      sh.disc(cx, cy - r * 0.38, r * 0.3, '#1A1A1A');
      sh.disc(cx - r * 0.1, cy - r * 0.42, r * 0.06, '#FFFFFF');
      sh.disc(cx + r * 0.1, cy - r * 0.42, r * 0.06, '#FFFFFF');
    } else if (kind === 'leaf') {
      leaf(sh, cx, cy, r, '#D9622B', '#8A3A14');
    } else if (kind === 'star') {
      star(sh, cx, cy, r, '#F5C518');
    }
  }
  // Little shapes sprinkled over the whole front, under the words.
  function scatter(sh, f, kind, pal) {
    if (!kind) return;
    var R = rnd(7919), n = kind === 'snow' ? 34 : 26;
    for (var i = 0; i < n; i++) {
      var x = f.x0 + R() * (f.x1 - f.x0), y = R() * f.H, r = f.w * (0.012 + R() * 0.022);
      if (kind === 'snow') snowflake(sh, x, y, r, mix(pal.bg, '#FFFFFF', 0.55));
      else if (kind === 'stars') star(sh, x, y, r, mix(pal.bg, '#FFFFFF', 0.35));
      else if (kind === 'hearts') heart(sh, x, y, r, mix(pal.bg, '#FFFFFF', 0.3));
      else if (kind === 'confetti') {
        var c = FUN[i % FUN.length];
        if (i % 3 === 0) sh.disc(x, y, r * 0.6, c);
        else if (i % 3 === 1) sh.poly(K.tilted(x, y, r * 1.6, r * 0.6, R() * 180), c);
        else star(sh, x, y, r * 0.8, c);
      }
    }
  }

  // ======================================================================
  // The three original fronts
  // ======================================================================
  function notecard(sh, f, pal, wd, built) {
    var y = K.titleBlock(sh, f, pal, wd, f.y, f.h * 0.3, pal.ink);
    var lu = K.frontLineup(built, 9);
    // the note card with the clues; with a badge, the card sits left and the badge beside it
    var br = Math.min(f.w * 0.1, f.w * 0.11 - 3);
    var cw = wd.badge ? f.w - br * 2 - 10 : f.w * 0.9, cx0 = wd.badge ? f.x : f.cx - cw / 2, cs = Math.max(8.5, f.w * 0.04);
    var clueLines = lu.clues.map(function (t) { return wrap(t, cs, 'sans', cw - cs * 4.4); });
    var nLines = clueLines.reduce(function (a, l) { return a + l.length; }, 0);
    var top = y + f.h * 0.05, ch = cs * 4.2 + nLines * cs * 1.45 + cs * 0.6;
    sh.rect(cx0 + 4, top + 4, cw, ch, pal.dark);
    sh.rect(cx0, top, cw, ch, pal.card);
    K.tape(sh, cx0 + cw * 0.12, top + 2, cw * 0.2, cs * 1.1, -28, pal.soft);
    K.tape(sh, cx0 + cw * 0.88, top + 2, cw * 0.2, cs * 1.1, 28, pal.soft);
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
    var authorRoom = wd.author ? K.authorSize(f) * 2.4 : 0;
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
    K.authorLine(sh, f, pal.ink, wd);
  }

  function tiles(sh, f, pal, wd, built) {
    var y = K.titleBlock(sh, f, pal, wd, f.y, f.h * 0.3, pal.ink);
    var lu = K.frontLineup(built, 12);
    var authorRoom = wd.author ? K.authorSize(f) * 2.6 : 0;
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
    K.authorLine(sh, f, pal.ink, wd);
  }

  function bold(sh, f, pal, wd, built) {
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
    var lu = K.frontLineup(built, 6);
    var line = lu.list.map(function (o) { return o.text; });
    var authorTop = f.y + f.h - (wd.author ? K.authorSize(f) * 2.4 : 0);
    var ls = Math.max(8, Math.min(f.w * 0.06, (authorTop - yy) / 5.2));
    var rowY = yy + (authorTop - yy - ls * 2.3) / 2 - ls * 0.2;
    var sep = '   •   ';
    [line.slice(0, 3), line.slice(3, 6)].forEach(function (row, ri) {
      var size = ls;
      while (size > 7 && width(row.join(sep), size, 'sans', size * 0.06) > f.w) size -= 0.25;
      var total = width(row.join(sep), size, 'sans', size * 0.06), x = f.cx - total / 2;
      row.forEach(function (t, i) {
        var w = sh.text(t, x, rowY + ri * size * 2.3, size, 'sans', pal.ink, { ls: size * 0.06 });
        var isAns = lu.list.filter(function (o) { return o.text === t; })[0].ans;
        if (!isAns) sh.line(x - 2, rowY + ri * size * 2.3 - size * 0.33, x + w + 2, rowY + ri * size * 2.3 - size * 0.36, pal.strike, 1.6, true);
        else sh.ring(x + w / 2, rowY + ri * size * 2.3 - size * 0.35, w / 2 + size * 0.5, size * 0.85, pal.ink, 1.4);
        x += w + width(sep, size, 'sans', size * 0.06);
        if (i < row.length - 1) sh.disc(x - width(sep, size, 'sans', size * 0.06) / 2, rowY + ri * size * 2.3 - size * 0.33, size * 0.1, pal.ink);
      });
    });
    badge(sh, f.x + f.w - f.w * 0.1, bandTop + bandH - f.w * 0.02, f.w * 0.1, pal, wd.badge);
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ======================================================================
  // Notebook: a big left title, a round sticker and a lined notebook page with a pencil
  // ======================================================================
  function notebook(sh, f, pal, wd, built, opt) {
    var br = wd.badge ? f.w * 0.135 : 0;
    var tw = f.w - (br ? br * 2 + f.w * 0.03 : 0);
    var tl = titleLines(wd.title.toUpperCase(), tw, f.h * 0.33, f.w * 0.25, 'sansBold', 0.9, 0.93);
    var t = stack(sh, tl.lines, tl.size, f.x, f.y, 0.93, 'sansBold', pal.ink, { hs: 0.9, ls: tl.size * 0.02 });
    if (br) badge(sh, f.x + f.w - br, f.y + br + 2, br, pal, wd.badge, pal.dark, '#FFFFFF');
    var ss = Math.max(9, f.w * 0.04), y = Math.max(t.bottom, br ? f.y + br * 2 + 4 : 0);
    wrap(wd.subtitle, ss, 'serif', f.w).slice(0, 2).forEach(function (l) { y += ss * 1.35; sh.text(l, f.x, y, ss, 'serif', pal.ink); });
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var top = y + f.h * 0.05, bottom = f.y + f.h - ar - f.h * 0.02;
    var pw = f.w * 0.92, px = f.x, ph = Math.min(bottom - top, f.h * 0.56);
    // the page: shadow, paper, rules, margin line and holes
    sh.rect(px + 5, top + 5, pw, ph, pal.dark);
    sh.rect(px, top, pw, ph, '#FFFDF7');
    var rule = ph / 10;
    for (var ry = top + rule * 1.6; ry < top + ph - 2; ry += rule) sh.line(px, ry, px + pw, ry, '#A9C6DE', 0.6);
    sh.line(px + pw * 0.12, top, px + pw * 0.12, top + ph, '#E58E80', 0.9);
    for (var hx = px + pw * 0.05; hx < px + pw; hx += pw / 12) sh.disc(hx, top + rule * 0.65, rule * 0.17, pal.bg);
    var lu = K.frontLineup(built, 9);
    var hsz = Math.max(8, Math.min(f.w * 0.05, rule * 0.7));
    var head = clip(lu.title.toUpperCase(), hsz, 'sansBold', pw * 0.8);
    sh.text(head, px + pw * 0.56, top + rule * 2.6 - hsz * 0.2, hsz, 'sansBold', '#1E1B18', { align: 'center', ls: hsz * 0.06 });
    lineupRows(sh, lu.list, { x: px + pw * 0.14, w: pw * 0.84, top: top + rule * 3, bottom: top + ph - rule * 0.4 },
      { size: Math.min(f.w * 0.05, rule * 0.75), font: 'sans', color: '#1E1B18', strike: '#1E1B18', ring: pal.mark === '#1E1712' ? '#C8321D' : pal.mark, lead: 1.9, gap: 1.4, partial: true });
    pencil(sh, px + pw * 0.9, top + ph * 0.78, f.w * 0.42, f.w * 0.06, 38);
    if (opt.deco) icon(sh, opt.deco, px + pw * 0.95, top + f.w * 0.01, f.w * 0.075, pal);
    K.authorLine(sh, f, pal.ink, wd, 'left');
  }

  // ======================================================================
  // Sticky note: a two-color title over a pattern of Xs and Os, a sticky note list, a magnifier
  // ======================================================================
  function xoPattern(sh, f, color, step) {
    var R = rnd(4243), i = 0;
    for (var y = step * 0.5; y < f.H; y += step) {
      for (var x = f.x0 + step * 0.4; x < f.x1; x += step) {
        var jx = (R() - 0.5) * step * 0.3, jy = (R() - 0.5) * step * 0.3, s = step * 0.16;
        if ((i++ + Math.floor(y / step)) % 2) cross(sh, x + jx, y + jy, s, color, Math.max(1, step * 0.05));
        else sh.ring(x + jx, y + jy, s * 1.1, s * 1.1, color, Math.max(1, step * 0.05));
      }
    }
  }

  function sticky(sh, f, pal, wd, built) {
    xoPattern(sh, f, pal.soft, f.w / 6);
    var ks = Math.max(8, f.w * 0.03);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + ks, ks, 'sansBold', pal.ink, { align: 'center', ls: ks * 0.2 });
    var tl = titleLines(wd.title.toUpperCase(), f.w, f.h * 0.3, f.w * 0.22, 'sansBold', 0.88, 0.92);
    var n = tl.lines.length;
    var t = stack(sh, tl.lines, tl.size, f.cx, f.y + ks * 1.9, 0.92, 'sansBold', function (i) { return n > 1 && i === n - 1 ? pal.mark : pal.ink; }, { align: 'center', hs: 0.88 });
    // a wavy underline under the title
    var wy = t.bottom + 3, pts = [];
    for (var i = 0; i <= 16; i++) pts.push(f.cx - f.w * 0.3 + i * f.w * 0.6 / 16, wy + (i % 2 ? 3 : -3));
    sh.path(pts, pal.mark, 2);
    var ss = Math.max(9, f.w * 0.038), y = wy + 4;
    wrap(wd.subtitle, ss, 'serif', f.w * 0.94).slice(0, 2).forEach(function (l) { y += ss * 1.35; sh.text(l, f.cx, y, ss, 'serif', pal.ink, { align: 'center' }); });
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var top = y + f.h * 0.05, nw = f.w * 0.64, nx = f.x + f.w * 0.02, nh = Math.min(f.y + f.h - ar - top - f.h * 0.02, f.h * 0.5);
    var ncx = nx + nw / 2, ncy = top + nh / 2;
    sh.poly(K.tilted(ncx + 5, ncy + 6, nw, nh, -2), pal.dark);
    sh.poly(K.tilted(ncx, ncy, nw, nh, -2), pal.card);
    K.tape(sh, ncx, top + 2, nw * 0.34, f.w * 0.045, 2, mix(pal.card, '#FFFFFF', 0.5));
    var lu = K.frontLineup(built, 6), pad = nw * 0.1;
    var ls = Math.max(8, f.w * 0.03);
    sh.text('CASE 1', nx + pad, top + nh * 0.08 + ls * ASC + 6, ls, 'sansBold', pal.mark, { ls: ls * 0.15 });
    var qs = Math.max(8.5, f.w * 0.042);
    var q = wrap(lu.title, qs, 'serifBold', nw - pad * 2).slice(0, 2);
    var qy = top + nh * 0.08 + ls * 2.4 + 6;
    q.forEach(function (l) { qy += qs * 1.25; sh.text(l, nx + pad, qy, qs, 'serifBold', pal.cardInk); });
    lineupRows(sh, lu.list, { x: nx + pad, w: nw - pad * 2, top: qy + qs * 0.6, bottom: top + nh - pad * 0.8 },
      { size: Math.min(f.w * 0.05, 15), color: pal.cardInk, strike: pal.mark, ring: pal.mark, lead: 1.75, align: 'left', column: true });
    var mr = f.w * 0.1, mcx = f.x + f.w - mr * 1.7, mcy = top + nh * 0.62;
    if (wd.badge) {
      var br = f.w * 0.11;
      badge(sh, f.x + f.w - br, top + br * 0.6, br, pal, wd.badge);
      mcy = Math.max(mcy, top + br * 1.6 + mr * 1.3);
    }
    magnifier(sh, mcx, mcy, mr, pal.ink, pal.dark, pal.card);
    cross(sh, mcx, mcy, mr * 0.42, pal.mark, mr * 0.16);
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ======================================================================
  // Checklist: a huge left title and a ticked list on a card, one answer ringed
  // ======================================================================
  function checklist(sh, f, pal, wd, built) {
    var ks = Math.max(8, f.w * 0.03);
    sh.text(wd.kicker.toUpperCase(), f.x, f.y + ks, ks, 'sansBold', pal.ink, { ls: ks * 0.2 });
    var tl = titleLines(wd.title.toUpperCase(), f.w, f.h * 0.32, f.w * 0.28, 'sansBold', 0.82, 0.9);
    var n = tl.lines.length;
    var t = stack(sh, tl.lines, tl.size, f.x, f.y + ks * 1.8, 0.9, 'sansBold', function (i) { return n > 1 && i === n - 1 ? pal.mark : pal.ink; }, { hs: 0.82 });
    var ss = Math.max(9, f.w * 0.04), y = t.bottom;
    wrap(wd.subtitle, ss, 'serifBold', f.w).slice(0, 2).forEach(function (l) { y += ss * 1.35; sh.text(l, f.x, y, ss, 'serifBold', pal.ink); });
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var top = y + f.h * 0.05, bottom = f.y + f.h - ar - f.h * 0.01;
    var lu = K.frontLineup(built, 6), rows = lu.list.length;
    var ch = bottom - top, rowH = Math.min(ch / rows, f.w * 0.13), cardH = rowH * rows + rowH * 0.3;
    sh.rect(f.x0, top + 5, f.x1 - f.x0, cardH, pal.dark);
    sh.rect(f.x0, top, f.x1 - f.x0, cardH, pal.card);
    var br = wd.badge ? f.w * 0.12 : 0;
    var box = rowH * 0.34, size = Math.min(rowH * 0.44, fitSize(lu.list.reduce(function (a, o) { return width(o.text, 1, 'sansBold', 0.04) > width(a, 1, 'sansBold', 0.04) ? o.text : a; }, ''), 'sansBold', f.w * 0.72 - box * 2 - br * 0.8, 99, 0.04));
    lu.list.forEach(function (o, i) {
      var cy = top + rowH * 0.15 + rowH * (i + 0.5);
      sh.frame(f.x + 2, cy - box / 2, box, box, pal.cardInk, 1.4);
      var x = f.x + box * 2.1, base = cy + size * 0.35;
      var w = sh.text(o.text, x, base, size, 'sansBold', pal.cardInk, { ls: size * 0.04 });
      if (o.ans) { ringWord(sh, x, base, w, size, pal.mark, Math.max(2, size * 0.1)); tick(sh, f.x + 2 + box * 0.1, cy - box * 0.55, box, pal.mark); }
      else { strike(sh, x, base, w, size, pal.mark, i); cross(sh, f.x + 2 + box / 2, cy, box * 0.32, pal.cardInk, 1.2); }
      if (i < rows - 1) sh.line(f.x, cy + rowH / 2, f.x + f.w, cy + rowH / 2, mix(pal.card, pal.cardInk, 0.15), 0.6);
    });
    if (br) badge(sh, f.x + f.w - br, top + cardH - br * 0.9, br, pal, wd.badge);
    K.authorLine(sh, f, pal.ink, wd, 'left');
  }

  // ======================================================================
  // Sunburst poster: rays, a framed title panel, a ribbon and a line-up strip
  // ======================================================================
  function poster(sh, f, pal, wd, built, opt) {
    var ccx = f.cx, ccy = f.y + f.h * 0.36, R = Math.max(f.w, f.H) * 1.6, N = 32;
    for (var i = 0; i < N; i += 2) {
      var a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
      sh.poly([ccx, ccy, ccx + Math.cos(a0) * R, ccy + Math.sin(a0) * R, ccx + Math.cos(a1) * R, ccy + Math.sin(a1) * R], mix(pal.bg, pal.soft, 0.45));
    }
    scatter(sh, f, opt.scatter, pal);
    var ks = Math.max(8, f.w * 0.032);
    var kw = width(wd.kicker.toUpperCase(), ks, 'sansBold', ks * 0.2);
    sh.rect(f.cx - kw / 2 - ks, f.y, kw + ks * 2, ks * 1.9, pal.dark);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + ks * 1.3, ks, 'sansBold', '#FFFFFF', { align: 'center', ls: ks * 0.2 });
    var pad = f.w * 0.05, top = f.y + ks * 2.8;
    var tl = titleLines(wd.title.toUpperCase(), f.w - pad * 2, f.h * 0.3, f.w * 0.22, 'sansBold', 0.86, 0.95);
    var ph = tl.lines.length * tl.size * 0.95 + tl.size * 0.35 + pad * 1.6;
    sh.rect(f.x + 5, top + 5, f.w, ph, pal.dark);
    sh.rect(f.x, top, f.w, ph, pal.card);
    sh.frame(f.x + 5, top + 5, f.w - 10, ph - 10, pal.cardInk, 1.2);
    var t = stack(sh, tl.lines, tl.size, f.cx, top + pad * 0.8, 0.95, 'sansBold', pal.cardInk, { align: 'center', hs: 0.86 });
    if (tl.lines.length > 1) {
      var w0 = width(tl.lines[0], tl.size, 'sansBold', 0, 0.86), b0 = t.base - (tl.lines.length - 1) * tl.size * 0.95;
      sh.line(f.cx - w0 / 2 - 4, b0 - tl.size * 0.28, f.cx + w0 / 2 + 4, b0 - tl.size * 0.4, pal.mark, Math.max(3, tl.size * 0.09), true);
    }
    // the ribbon with the subtitle
    var ss = Math.max(9, f.w * 0.036), sl = wrap(wd.subtitle, ss, 'sansBold', f.w * 0.8).slice(0, 2);
    var rt = top + ph + f.h * 0.025, rh = sl.length * ss * 1.3 + ss * 0.9, ex = f.w * 0.07;
    var tail = mix(pal.mark, '#000000', 0.3);
    sh.poly([f.x - ex * 0.4, rt + rh * 0.3, f.x + ex, rt + rh * 0.3, f.x + ex, rt + rh * 1.3, f.x - ex * 0.4, rt + rh * 1.3, f.x + ex * 0.2, rt + rh * 0.8], tail);
    sh.poly([f.x + f.w + ex * 0.4, rt + rh * 0.3, f.x + f.w - ex, rt + rh * 0.3, f.x + f.w - ex, rt + rh * 1.3, f.x + f.w + ex * 0.4, rt + rh * 1.3, f.x + f.w - ex * 0.2, rt + rh * 0.8], tail);
    sh.rect(f.x + ex * 0.6, rt, f.w - ex * 1.2, rh, pal.mark);
    sl.forEach(function (l, i) { sh.text(l, f.cx, rt + ss * 0.45 + ss * ASC + i * ss * 1.3 - ss * 0.15, ss, 'sansBold', pal.markInk, { align: 'center' }); });
    // the line-up on a strip
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var st = rt + rh * 1.3 + f.h * 0.04, sb = f.y + f.h - ar - f.h * 0.01;
    var br = wd.badge ? f.w * 0.11 : 0;
    if (sb - st > 30) {
      sh.rect(f.x, st, f.w, sb - st, pal.card);
      sh.frame(f.x + 4, st + 4, f.w - 8, sb - st - 8, pal.cardInk, 0.8, [3, 3]);
      lineupRows(sh, K.frontLineup(built, 9).list, { x: f.x + f.w * 0.04, w: f.w * 0.92 - br * 1.6, top: st + 8, bottom: sb - 8 },
        { size: f.w * 0.05, color: pal.cardInk, strike: pal.mark, ring: pal.mark, lead: 2 });
      if (br) badge(sh, f.x + f.w - br * 0.9, st + (sb - st) / 2, br, pal, wd.badge);
    } else if (br) badge(sh, f.x + f.w - br, top, br, pal, wd.badge);
    if (wd.author) {
      var as = K.authorSize(f), aw = width(wd.author.toUpperCase(), as, 'sansBold', as * 0.18);
      sh.rect(f.cx - Math.min(f.w, aw) / 2 - as, f.y + f.h - as * 1.7, Math.min(f.w, aw) + as * 2, as * 2.1, pal.dark);
      K.authorLine(sh, f, '#FFFFFF', wd);
    }
  }

  // ======================================================================
  // Name table: a ruled table of words, a big title with a struck line, and a seal
  // ======================================================================
  function grid(sh, f, pal, wd, built) {
    var ks = Math.max(8, f.w * 0.03);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + ks, ks, 'sansBold', pal.ink, { align: 'center', ls: ks * 0.2 });
    var tl = titleLines(wd.title.toUpperCase(), f.w, f.h * 0.3, f.w * 0.25, 'sansBold', 0.84, 0.92);
    var t = stack(sh, tl.lines, tl.size, f.cx, f.y + ks * 1.8, 0.92, 'sansBold', function (i) { return i === tl.lines.length - 1 && tl.lines.length > 1 ? pal.mark : pal.ink; }, { align: 'center', hs: 0.84 });
    if (tl.lines.length > 1) {
      var wl = width(tl.lines[0], tl.size, 'sansBold', 0, 0.84), b0 = f.y + ks * 1.8 + tl.size * ASC;
      sh.line(f.cx - wl / 2 - 3, b0 - tl.size * 0.3, f.cx + wl / 2 + 3, b0 - tl.size * 0.36, pal.mark, Math.max(2.5, tl.size * 0.08), true);
    }
    // the subtitle on a dark pill
    var ss = Math.max(9, f.w * 0.036), sl = wrap(wd.subtitle, ss, 'sansBold', f.w * 0.88).slice(0, 2);
    var pt = t.bottom + ss * 0.6, phh = sl.length * ss * 1.3 + ss * 0.8;
    sh.rect(f.x, pt, f.w, phh, pal.ink);
    sl.forEach(function (l, i) { sh.text(l, f.cx, pt + ss * 0.4 + ss * ASC - ss * 0.12 + i * ss * 1.3, ss, 'sansBold', pal.bg, { align: 'center' }); });
    // the table
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var top = pt + phh + f.h * 0.03, bottom = f.y + f.h - ar;
    var cols = 3, fs = Math.max(7.5, Math.min(10, f.w * 0.026)), rh = fs * 1.9;
    var rowsN = Math.max(1, Math.floor((bottom - top) / rh));
    var all = K.manyWords(built, rowsN * cols);
    var cw = f.w / cols, tint = mix(pal.bg, pal.ink, 0.5), rule = mix(pal.bg, pal.ink, 0.2);
    sh.frame(f.x - 3, top, f.w + 6, rowsN * rh, rule, 0.8);
    for (var r = 0; r < rowsN; r++) {
      if (r % 2) sh.rect(f.x - 3, top + r * rh, f.w + 6, rh, mix(pal.bg, pal.ink, 0.06));
      for (var c = 0; c < cols; c++) {
        var word = all[(r * cols + c) % all.length];
        var s = clip(word, fs, 'sans', cw - fs * 1.2);
        var x = f.x + c * cw + fs * 0.4, base = top + r * rh + rh / 2 + fs * 0.35;
        var w = sh.text(s, x, base, fs, 'sans', tint);
        if ((r * 5 + c * 3) % 4) sh.line(x - 1, base - fs * 0.32, x + w + 1, base - fs * 0.32, pal.mark, 0.9);
      }
    }
    for (var cc = 1; cc < cols; cc++) sh.line(f.x + cc * cw - fs * 0.2, top, f.x + cc * cw - fs * 0.2, top + rowsN * rh, rule, 0.6);
    var sr = Math.min(f.w * 0.15, rowsN * rh * 0.4);
    if (wd.badge && sr > 18) {
      var sx = f.cx, sy = top + rowsN * rh / 2;
      sh.disc(sx, sy, sr + 6, pal.bg);
      badge(sh, sx, sy, sr, pal, wd.badge);
    }
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ======================================================================
  // Magnifier: a crossed-out list down the left and a magnifier on the answer
  // ======================================================================
  function magnify(sh, f, pal, wd, built) {
    var y = K.titleBlock(sh, f, pal, wd, f.y, f.h * 0.3, pal.ink);
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var br = wd.badge ? f.w * 0.1 : 0;
    var top = y + f.h * 0.05, bottom = f.y + f.h - ar - (br ? br * 2 + 8 : 0);
    var lu = K.frontLineup(built, 7), others = lu.list.filter(function (o) { return !o.ans; }), ans = lu.list.filter(function (o) { return o.ans; })[0];
    var lead = 1.7, size = Math.min(f.w * 0.065, (bottom - top) / (others.length * lead));
    var longest = others.reduce(function (a, o) { return Math.max(a, width(o.text, 1, 'sansBold', 0.04)); }, 0);
    size = Math.max(7.5, Math.min(size, f.w * 0.48 / longest));
    var yy = top + size * ASC;
    others.forEach(function (o, i) {
      var w = sh.text(o.text, f.x, yy, size, 'sansBold', pal.ink, { ls: size * 0.04 });
      strike(sh, f.x, yy, w, size, pal.strike, i);
      yy += size * lead;
    });
    var listBot = yy - size * lead + size * 0.4;
    var r = Math.min(f.w * 0.22, (listBot - top) * 0.42), cx = f.x + f.w * 0.72, cy = top + (listBot - top) * 0.42;
    magnifier(sh, cx, cy, r, pal.card, pal.mark, mix(pal.card, pal.bg, 0.08));
    sh.ring(cx, cy, r * 0.92, r * 0.92, pal.dark, 1);
    var as = fitSize(ans.text, 'sansBold', r * 1.45, r * 0.42, 0.04);
    var aw = sh.text(ans.text, cx, cy + as * 0.35, as, 'sansBold', pal.cardInk, { align: 'center', ls: as * 0.04 });
    ringWord(sh, cx - aw / 2, cy + as * 0.35, aw, as, pal.mark, Math.max(1.6, as * 0.1));
    if (br) badge(sh, f.x + br, f.y + f.h - ar - br - 4, br, pal, wd.badge);
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ======================================================================
  // Minimal: a serif title on the left, a crossed-out list down the right side
  // ======================================================================
  function minimal(sh, f, pal, wd, built) {
    var ks = Math.max(8, f.w * 0.028);
    sh.text(wd.kicker.toUpperCase(), f.x, f.y + ks, ks, 'sansBold', pal.ink, { ls: ks * 0.25 });
    sh.line(f.x, f.y + ks * 2, f.x + f.w, f.y + ks * 2, pal.ink, 1.2);
    var colX = f.x + f.w * 0.68, colW = f.x + f.w - colX;
    var top = f.y + ks * 3.2;
    var tl = titleLines(wd.title, f.w * 0.62, f.h * 0.42, f.w * 0.2, 'serifBold', 1, 1.02);
    var t = stack(sh, tl.lines, tl.size, f.x, top, 1.02, 'serifBold', pal.ink);
    var ss = Math.max(9, f.w * 0.036), y = t.bottom + ss * 0.4;
    wrap(wd.subtitle, ss, 'sans', f.w * 0.6).slice(0, 3).forEach(function (l) { y += ss * 1.35; sh.text(l, f.x, y, ss, 'sans', pal.ink); });
    var lu = K.frontLineup(built, 10);
    var listBot = f.y + f.h * 0.66, n = lu.list.length;
    var longest = lu.list.reduce(function (a, o) { return Math.max(a, width(o.text, 1, 'sans', 0.12)); }, 0);
    var size = Math.max(7.5, Math.min(f.w * 0.04, colW * 0.9 / longest, (listBot - top) / (n * 1.9)));
    var yy = top + size * ASC;
    lu.list.forEach(function (o, i) {
      var w = sh.text(o.text, colX, yy, size, 'sans', pal.ink, { ls: size * 0.12 });
      if (o.ans) sh.frame(colX - size * 0.35, yy - size * 1.05, w + size * 0.7, size * 1.5, pal.mark, 1.4);
      else sh.line(colX - 2, yy - size * 0.33, colX + w + 2, yy - size * 0.33, pal.mark, 1);
      yy += size * 1.9;
    });
    var qy = yy - size * 0.6, qs = size * 2.2;
    sh.frame(colX, qy, qs, qs, pal.ink, 1);
    sh.text('?', colX + qs / 2, qy + qs * 0.72, qs * 0.62, 'serifBold', pal.ink, { align: 'center' });
    // the foot: a rule, the badge line, a promise and the author
    var ry = Math.max(f.y + f.h * 0.74, qy + qs + f.h * 0.04, y + f.h * 0.04);
    sh.line(f.x, ry, f.x + f.w, ry, pal.ink, 0.8);
    var bs = Math.max(9, f.w * 0.05);
    if (wd.badge) sh.text(wd.badge, f.x, ry + bs * 1.6, bs, 'sansBold', pal.mark, { ls: bs * 0.08 });
    var ps = Math.max(8, f.w * 0.028);
    sh.text('EVERY CASE HAS EXACTLY ONE ANSWER', f.x, ry + bs * 1.6 + ps * 2, ps, 'sans', pal.ink, { ls: ps * 0.18 });
    K.authorLine(sh, f, pal.ink, wd, 'left');
  }

  // ======================================================================
  // Big number: the number of cases, huge, over a title bar
  // ======================================================================
  function bignumber(sh, f, pal, wd, built) {
    var ks = Math.max(8, f.w * 0.03);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + ks, ks, 'sansBold', pal.ink, { align: 'center', ls: ks * 0.22 });
    var num = wd.count ? String(wd.count) : '?';
    var ns = fitSize(num, 'sansBold', f.w * 0.9, f.h * 0.3, 0, 0.92);
    var nb = Math.max(f.y + ns * ASC, f.y + ks * 1.8 + ns * 0.7);
    sh.text(num, f.cx, nb, ns, 'sansBold', pal.ink, { align: 'center', hs: 0.92 });
    var ls = Math.max(9, f.w * 0.045);
    var lab = wd.count === 1 ? 'CASE TO CRACK' : 'CASES TO CRACK';
    sh.text(lab, f.cx, nb + ls * 1.9, ls, 'sansBold', pal.ink, { align: 'center', ls: ls * 0.3 });
    var bt = nb + ls * 3.2;
    var tl = titleLines(wd.title.toUpperCase(), f.w * 0.94, f.h * 0.24, f.w * 0.16, 'sansBold', 0.86, 0.95);
    var bh = tl.lines.length * tl.size * 0.95 + tl.size * 0.6;
    sh.rect(f.x0, bt, f.x1 - f.x0, bh, pal.mark);
    stack(sh, tl.lines, tl.size, f.cx, bt + tl.size * 0.22, 0.95, 'sansBold', pal.markInk, { align: 'center', hs: 0.86 });
    var br = wd.customBadge && wd.badge ? f.w * 0.1 : 0;
    var ss = Math.max(9, f.w * 0.038), y = bt + bh + ss * 0.4;
    wrap(wd.subtitle, ss, 'serif', f.w * 0.94 - br * 2).slice(0, 2).forEach(function (l) { y += ss * 1.35; sh.text(l, f.cx - br, y, ss, 'serif', pal.ink, { align: 'center' }); });
    if (br) badge(sh, f.x + f.w - br, bt + bh + br * 0.7, br, pal, wd.badge, pal.dark, '#FFFFFF');
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var top = Math.max(y + f.h * 0.03, br ? bt + bh + br * 1.8 : 0), bottom = f.y + f.h - ar;
    if (bottom - top > 20) lineupRows(sh, K.frontLineup(built, 6).list, { x: f.x, w: f.w, top: top, bottom: bottom }, { size: f.w * 0.05, color: pal.ink, strike: pal.strike, ring: pal.ink, lead: 2.1 });
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ======================================================================
  // Ticket: an admission ticket with a perforated stub
  // ======================================================================
  function ticket(sh, f, pal, wd, built, opt) {
    scatter(sh, f, opt.scatter, pal);
    var ks = Math.max(8, f.w * 0.03);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + ks, ks, 'sansBold', pal.ink, { align: 'center', ls: ks * 0.22 });
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var top = f.y + ks * 2.4, th = f.y + f.h - ar - top - f.h * 0.03;
    var notch = f.w * 0.055, perf = top + th * 0.68;
    sh.rect(f.x + 5, top + 6, f.w, th, pal.dark);
    sh.rect(f.x, top, f.w, th, pal.card);
    sh.frame(f.x + 7, top + 7, f.w - 14, th - 14, pal.mark, 1.2, [5, 3]);
    [f.x, f.x + f.w].forEach(function (x) { sh.disc(x, perf, notch, pal.bg); });
    sh.line(f.x + notch * 1.4, perf, f.x + f.w - notch * 1.4, perf, pal.cardInk, 1, false, [2, 4]);
    var pad = f.w * 0.08;
    var as = Math.max(8, f.w * 0.032);
    sh.text('ADMIT ONE DETECTIVE', f.cx, top + pad + as, as, 'sansBold', pal.mark, { align: 'center', ls: as * 0.3 });
    star(sh, f.cx - width('ADMIT ONE DETECTIVE', as, 'sansBold', as * 0.3) / 2 - as * 1.2, top + pad + as * 0.62, as * 0.55, pal.mark);
    star(sh, f.cx + width('ADMIT ONE DETECTIVE', as, 'sansBold', as * 0.3) / 2 + as * 1.2, top + pad + as * 0.62, as * 0.55, pal.mark);
    var tTop = top + pad + as * 2.2;
    var ss = Math.max(9, f.w * 0.036), sl = wrap(wd.subtitle, ss, 'serif', f.w - pad * 2).slice(0, 2);
    var room = perf - tTop - sl.length * ss * 1.35 - pad * 0.9;
    var tl = titleLines(wd.title.toUpperCase(), f.w - pad * 2, room, f.w * 0.2, 'sansBold', 0.86, 0.95);
    var t = stack(sh, tl.lines, tl.size, f.cx, tTop + Math.max(0, (room - tl.lines.length * tl.size * 0.95) / 2), 0.95, 'sansBold', pal.cardInk, { align: 'center', hs: 0.86 });
    var y = t.bottom;
    sl.forEach(function (l) { y += ss * 1.35; sh.text(l, f.cx, y, ss, 'serif', pal.cardInk, { align: 'center' }); });
    // the stub: a number box and the line-up
    var sb = top + th - pad * 0.6, st = perf + pad * 0.5;
    var nbw = wd.badge ? f.w * 0.26 : 0;
    if (nbw) {
      sh.rect(f.x + pad * 0.7, st, nbw, sb - st, pal.mark);
      var bt = wd.badge.split(' '), big = /^\d+$/.test(bt[0]) ? bt[0] : '', small = big ? bt.slice(1).join(' ') : wd.badge;
      var mid = st + (sb - st) / 2;
      if (big) {
        var bsz = fitSize(big, 'sansBold', nbw * 0.8, (sb - st) * 0.5, 0);
        sh.text(big, f.x + pad * 0.7 + nbw / 2, mid + bsz * 0.2, bsz, 'sansBold', pal.markInk, { align: 'center' });
        var ssz = Math.max(7.5, fitSize(small, 'sansBold', nbw * 0.8, bsz * 0.32, 0.1));
        sh.text(small, f.x + pad * 0.7 + nbw / 2, mid + bsz * 0.2 + ssz * 1.5, ssz, 'sansBold', pal.markInk, { align: 'center', ls: ssz * 0.1 });
      } else {
        var lines = wrap(small, Math.max(8, nbw * 0.13), 'sansBold', nbw * 0.84).slice(0, 3), lz = Math.max(7.5, Math.min(nbw * 0.13, fitSize(lines.reduce(function (a, l) { return l.length > a.length ? l : a; }, ''), 'sansBold', nbw * 0.84, 99)));
        lines.forEach(function (l, i) { sh.text(l, f.x + pad * 0.7 + nbw / 2, mid - (lines.length - 1) * lz * 0.6 + i * lz * 1.2 + lz * 0.35, lz, 'sansBold', pal.markInk, { align: 'center' }); });
      }
    }
    lineupRows(sh, K.frontLineup(built, 6).list, { x: f.x + pad * 0.7 + nbw + pad * 0.3, w: f.w - pad * 1.7 - nbw, top: st, bottom: sb },
      { size: f.w * 0.042, color: pal.cardInk, strike: pal.mark, ring: pal.mark, lead: 1.9 });
    if (opt.deco) icon(sh, opt.deco, f.x + f.w - f.w * 0.1, top + f.w * 0.03, f.w * 0.07, pal);
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ======================================================================
  // Letter tiles: the title spelled in word-game tiles
  // ======================================================================
  var POINTS = { A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10 };
  // a word's width in tiles: letters and digits get a tile, punctuation a third of one
  function wordW(w, s) {
    var n = 0;
    for (var i = 0; i < w.length; i++) n += (/[A-Z0-9]/.test(w[i]) ? s : s * 0.42) + s * 0.1;
    return n - s * 0.1;
  }
  function tileRows(words, s, maxW) {
    var rows = [], cur = [], curW = 0, wgap = s * 0.45;
    words.forEach(function (w) {
      var ww = wordW(w, s);
      if (cur.length && curW + wgap + ww > maxW) { rows.push({ words: cur, w: curW }); cur = []; curW = 0; }
      curW += (cur.length ? wgap : 0) + ww; cur.push(w);
    });
    if (cur.length) rows.push({ words: cur, w: curW });
    return rows;
  }
  function letters(sh, f, pal, wd, built, opt) {
    scatter(sh, f, opt.scatter, pal);
    var ks = Math.max(8, f.w * 0.03);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + ks, ks, 'sansBold', pal.ink, { align: 'center', ls: ks * 0.22 });
    var ws = wd.title.toUpperCase().replace(/\.\.\./g, '…').split(/\s+/).filter(Boolean);
    var maxH = f.h * 0.42, maxW = f.w, s = f.w / 4.2, rows;
    for (; s > 12; s -= 0.5) {
      var longest = Math.max.apply(null, ws.map(function (w) { return wordW(w, s); }));
      rows = tileRows(ws, s, maxW);
      if (longest <= maxW && rows.length * s * 1.18 <= maxH) break;
    }
    var top = f.y + ks * 2.2, gap = s * 0.1, ink = pal.cardInk;
    rows.forEach(function (r, ri) {
      var x = f.cx - r.w / 2, y = top + ri * s * 1.18;
      r.words.forEach(function (w) {
        for (var i = 0; i < w.length; i++) {
          var ch = w[i], isTile = /[A-Z0-9]/.test(ch);
          if (isTile) {
            sh.rect(x + s * 0.05, y + s * 0.07, s, s, pal.dark);
            sh.rect(x, y, s, s, pal.card);
            sh.text(ch, x + s * 0.47, y + s * 0.74, s * 0.66, 'sansBold', ink, { align: 'center' });
            var p = POINTS[ch];
            if (p && s * 0.22 >= 7) sh.text(String(p), x + s * 0.92, y + s * 0.9, s * 0.22, 'sansBold', ink, { align: 'right' });
          } else {
            // punctuation sits between tiles at a third of a tile's width
            if (ch === '…') [0.18, 0.5, 0.82].forEach(function (k) { sh.disc(x + s * 0.4 * k, y + s * 0.82, s * 0.055, pal.ink); });
            else if (/[.!?,:;'’-]/.test(ch)) sh.text(ch, x, y + s * 0.85, s * 0.6, 'sansBold', pal.ink);
            x += s * 0.42 + gap;
            continue;
          }
          x += s + gap;
        }
        x += s * 0.45 - gap;
      });
    });
    var y = top + rows.length * s * 1.18;
    var ss = Math.max(9, f.w * 0.04);
    wrap(wd.subtitle, ss, 'serif', f.w * 0.94).slice(0, 2).forEach(function (l) { y += ss * 1.35; sh.text(l, f.cx, y, ss, 'serif', pal.ink, { align: 'center' }); });
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var br = wd.badge ? f.w * 0.1 : 0;
    // a tile rack under the line-up
    var rackY = f.y + f.h - ar - f.h * 0.03, top2 = y + f.h * 0.04;
    sh.poly([f.x0, rackY, f.x1, rackY, f.x1, rackY + f.h * 0.022, f.x0, rackY + f.h * 0.022], pal.dark);
    lineupRows(sh, K.frontLineup(built, 8).list, { x: f.x, w: f.w - br * 2.2, top: top2, bottom: rackY - 4 },
      { size: f.w * 0.05, color: pal.ink, strike: pal.strike, ring: pal.ink, lead: 2 });
    if (br) badge(sh, f.x + f.w - br, top2 + (rackY - top2) / 2, br, pal, wd.badge);
    if (opt.deco) icon(sh, opt.deco, f.x + f.w * 0.06, f.y + ks * 0.6, f.w * 0.045, pal);
    if (opt.deco) icon(sh, opt.deco, f.x + f.w * 0.94, f.y + ks * 0.6, f.w * 0.045, pal);
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ======================================================================
  // X and O: a noughts-and-crosses grid, every word crossed but one
  // ======================================================================
  function xo(sh, f, pal, wd, built) {
    xoPattern(sh, f, pal.soft === pal.bg ? mix(pal.bg, pal.ink, 0.1) : mix(pal.bg, pal.soft, 0.35), f.w / 7);
    var pad = f.w * 0.05;
    var ks = Math.max(8, f.w * 0.03);
    var tl = titleLines(wd.title.toUpperCase(), f.w - pad * 2, f.h * 0.26, f.w * 0.2, 'sansBold', 0.86, 0.95);
    var ss = Math.max(9, f.w * 0.036), sl = wrap(wd.subtitle, ss, 'serif', f.w - pad * 2).slice(0, 2);
    var ch = pad + ks * 1.2 + stackH(tl, 0.95) + sl.length * ss * 1.35 + pad * 0.8;
    sh.rect(f.x + 5, f.y + 5, f.w, ch, pal.dark);
    sh.rect(f.x, f.y, f.w, ch, pal.card);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + pad + ks * 0.2, ks, 'sansBold', pal.mark, { align: 'center', ls: ks * 0.22 });
    var t = stack(sh, tl.lines, tl.size, f.cx, f.y + pad + ks * 1.2, 0.95, 'sansBold', pal.cardInk, { align: 'center', hs: 0.86 });
    var y = t.bottom;
    sl.forEach(function (l) { y += ss * 1.35; sh.text(l, f.cx, y, ss, 'serif', pal.cardInk, { align: 'center' }); });
    // the grid
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var gt = f.y + ch + f.h * 0.05, gb = f.y + f.h - ar - f.h * 0.02;
    var side = Math.min(f.w, gb - gt), cell = side / 3, gx = f.cx - side / 2;
    var lw = Math.max(2.5, side * 0.018);
    sh.rect(gx - 6, gt - 6, side + 12, side + 12, mix(pal.bg, pal.dark, 0.5));
    for (var i = 1; i < 3; i++) {
      sh.line(gx + cell * i, gt + 4, gx + cell * i, gt + side - 4, pal.ink, lw, true);
      sh.line(gx + 4, gt + cell * i, gx + side - 4, gt + cell * i, pal.ink, lw, true);
    }
    // each word on one or two lines, as big as the widest part allows
    var lu = K.frontLineup(built, 9).list;
    var cellLines = lu.map(function (o) {
      var ws = o.text.split(' ');
      if (ws.length < 2) return [o.text];
      var best = null;
      for (var c = 1; c < ws.length; c++) {
        var l = [ws.slice(0, c).join(' '), ws.slice(c).join(' ')], wmax = Math.max(width(l[0], 1, 'sansBold'), width(l[1], 1, 'sansBold'));
        if (!best || wmax < best.w) best = { l: l, w: wmax };
      }
      return width(o.text, 1, 'sansBold') <= best.w * 1.25 ? [o.text] : best.l;
    });
    var widest = cellLines.reduce(function (a, ls) { return Math.max(a, Math.max.apply(null, ls.map(function (l) { return width(l, 1, 'sansBold'); }))); }, 0);
    var fs = Math.max(7.5, Math.min(cell * 0.17, cell * 0.8 / widest));
    var plate = mix(pal.bg, pal.dark, 0.5);
    lu.forEach(function (o, k) {
      var cx = gx + cell * (k % 3 + 0.5), cy = gt + cell * (Math.floor(k / 3) + 0.5), ls = cellLines[k];
      if (!o.ans) cross(sh, cx, cy, cell * 0.3, mix(pal.strike, pal.bg, 0.35), Math.max(2, cell * 0.045));
      var lw = Math.max.apply(null, ls.map(function (l) { return width(l, fs, 'sansBold'); })), lh = ls.length * fs * 1.1;
      if (!o.ans) sh.rect(cx - lw / 2 - fs * 0.3, cy - lh / 2 - fs * 0.15, lw + fs * 0.6, lh + fs * 0.3, plate);
      ls.forEach(function (l, i) { sh.text(l, cx, cy - lh / 2 + fs * 0.85 + i * fs * 1.1, fs, 'sansBold', pal.ink, { align: 'center' }); });
      if (o.ans) sh.ring(cx, cy, Math.max(lw / 2 + fs * 0.6, cell * 0.36), cell * 0.36, pal.mark, Math.max(2.5, cell * 0.05));
    });
    if (wd.badge) badge(sh, f.x + f.w - f.w * 0.1, f.y + ch + f.w * 0.06, f.w * 0.1, pal, wd.badge);
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ======================================================================
  // Shapes: rows of colorful shapes crossed out until one is left
  // ======================================================================
  function shapes(sh, f, pal, wd) {
    var br = wd.badge ? f.w * 0.1 : 0;
    if (br) badge(sh, f.x + f.w - br, f.y + br, br, pal, wd.badge);
    var tl = titleLines(wd.title, f.w - br * 2.3, f.h * 0.28, f.w * 0.19, 'serifBold', 1, 1);
    var t = stack(sh, tl.lines, tl.size, f.x, f.y, 1, 'serifBold', pal.ink);
    var ss = Math.max(9, f.w * 0.038), y = Math.max(t.bottom, f.y + br * 2);
    wrap(wd.subtitle, ss, 'sans', f.w).slice(0, 2).forEach(function (l) { y += ss * 1.35; sh.text(l, f.x, y, ss, 'sans', pal.ink); });
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var top = y + f.h * 0.04, bottom = f.y + f.h - ar - f.h * 0.02;
    var cols = 5, rows = Math.max(3, Math.min(6, Math.floor((bottom - top) / (f.w / cols))));
    var cell = Math.min(f.w / cols, (bottom - top) / rows), r = cell * 0.32;
    var gx = f.cx - cell * cols / 2;
    var draw = [function (x, yy, c) { sh.disc(x, yy, r, c); }, function (x, yy, c) { sh.rect(x - r * 0.9, yy - r * 0.9, r * 1.8, r * 1.8, c); },
      function (x, yy, c) { triangle(sh, x, yy + r * 0.1, r * 1.05, c); }, function (x, yy, c) { star(sh, x, yy, r * 1.15, c); },
      function (x, yy, c) { heart(sh, x, yy + r * 0.05, r * 1.05, c); }, function (x, yy, c) { diamond(sh, x, yy, r * 1.1, c); }];
    for (var k = 0; k < cols * rows; k++) {
      var cx = gx + cell * (k % cols + 0.5), cy = top + cell * (Math.floor(k / cols) + 0.5);
      draw[(k * 7 + Math.floor(k / cols)) % draw.length](cx, cy, FUN[(k * 5 + 1) % FUN.length]);
      if (k === cols * rows - 3) sh.ring(cx, cy, r * 1.45, r * 1.45, pal.mark, Math.max(2, r * 0.18));
      else if ((k * 3) % 7 !== 1 || k > cols * 2) cross(sh, cx, cy, r * 1.05, pal.ink, Math.max(1.6, r * 0.14));
    }
    K.authorLine(sh, f, pal.ink, wd, 'left');
  }

  // ======================================================================
  // Classic frame: a double frame, a serif title, ornaments and a two-column line-up
  // ======================================================================
  function ornament(sh, cx, y, w, color) {
    sh.line(cx - w / 2, y, cx - 7, y, color, 0.9);
    sh.line(cx + 7, y, cx + w / 2, y, color, 0.9);
    diamond(sh, cx, y, 4.5, color);
  }
  function classic(sh, f, pal, wd, built, opt) {
    var fx = f.x - 8, fy = f.y - 8, fw = f.w + 16, fh = f.h + 16;
    sh.frame(fx, fy, fw, fh, pal.ink, 2.2);
    sh.frame(fx + 5, fy + 5, fw - 10, fh - 10, pal.ink, 0.7);
    [[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh]].forEach(function (p) { diamond(sh, p[0], p[1], 7, pal.mark); });
    var inX = f.x + 10, inW = f.w - 20;
    var ks = Math.max(8, f.w * 0.028);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + 12 + ks, ks, 'sans', pal.ink, { align: 'center', ls: ks * 0.3 });
    ornament(sh, f.cx, f.y + 12 + ks * 2.4, f.w * 0.5, pal.mark);
    var top = f.y + 12 + ks * 3.4;
    var tl = titleLines(wd.title, inW, f.h * 0.3, f.w * 0.17, 'serifBold', 1, 1.08);
    var t = stack(sh, tl.lines, tl.size, f.cx, top, 1.08, 'serifBold', pal.ink, { align: 'center' });
    var oy = t.bottom + 10;
    ornament(sh, f.cx, oy, f.w * 0.5, pal.mark);
    var ss = Math.max(9, f.w * 0.038), y = oy + 4;
    wrap(wd.subtitle, ss, 'serif', inW).slice(0, 2).forEach(function (l) { y += ss * 1.4; sh.text(l, f.cx, y, ss, 'serif', pal.ink, { align: 'center' }); });
    if (wd.badge) {
      var bs = Math.max(8.5, f.w * 0.034);
      y += bs * 2.2;
      var bw = sh.text(wd.badge, f.cx, y, bs, 'sansBold', pal.mark, { align: 'center', ls: bs * 0.25 });
      sh.line(f.cx - bw / 2 - bs * 3, y - bs * 0.33, f.cx - bw / 2 - bs * 0.8, y - bs * 0.33, pal.mark, 0.9);
      sh.line(f.cx + bw / 2 + bs * 0.8, y - bs * 0.33, f.cx + bw / 2 + bs * 3, y - bs * 0.33, pal.mark, 0.9);
    }
    var ar = wd.author ? K.authorSize(f) * 2.6 : 0;
    var ct = y + f.h * 0.05, cb = f.y + f.h - ar - 10;
    if (cb - ct > 30) {
      sh.rect(inX, ct, inW, cb - ct, pal.card);
      sh.frame(inX + 4, ct + 4, inW - 8, cb - ct - 8, pal.soft, 0.8);
      lineupRows(sh, K.frontLineup(built, 8).list, { x: inX + 8, w: inW - 16, top: ct + 8, bottom: cb - 8 },
        { size: f.w * 0.048, font: 'serif', ls: 0.04, color: pal.cardInk, strike: pal.mark, ring: pal.mark, lead: 2 });
    }
    if (opt.deco) {
      icon(sh, opt.deco, fx + fw * 0.07, fy + fh - fw * 0.08, f.w * 0.05, pal);
      icon(sh, opt.deco, fx + fw * 0.93, fy + fh - fw * 0.08, f.w * 0.05, pal);
    }
    if (wd.author) {
      var as = K.authorSize(f);
      sh.text(wd.author.toUpperCase(), f.cx, f.y + f.h - 10 - as * 0.4, Math.max(8, Math.min(as, fitSize(wd.author.toUpperCase(), 'sans', inW * 0.8, as, 0.25))), 'sans', pal.ink, { align: 'center', ls: Math.min(as, fitSize(wd.author.toUpperCase(), 'sans', inW * 0.8, as, 0.25)) * 0.25 });
    }
  }

  // ======================================================================
  // Diagonal split: the title on color above a slanted card with the line-up
  // ======================================================================
  function split(sh, f, pal, wd, built) {
    var ks = Math.max(8, f.w * 0.03);
    sh.text(wd.kicker.toUpperCase(), f.x, f.y + ks, ks, 'sansBold', pal.soft, { ls: ks * 0.22 });
    var tl = titleLines(wd.title.toUpperCase(), f.w, f.h * 0.33, f.w * 0.26, 'sansBold', 0.84, 0.92);
    var t = stack(sh, tl.lines, tl.size, f.x, f.y + ks * 1.8, 0.92, 'sansBold', pal.ink, { hs: 0.84 });
    var ss = Math.max(9, f.w * 0.04), y = t.bottom;
    wrap(wd.subtitle, ss, 'serif', f.w * 0.9).slice(0, 2).forEach(function (l) { y += ss * 1.35; sh.text(l, f.x, y, ss, 'serif', pal.ink); });
    var yl = y + f.h * 0.1, yr = y + f.h * 0.03;
    var at = function (x) { return yl + (yr - yl) * (x - f.x0) / (f.x1 - f.x0); };
    sh.poly([f.x0, at(f.x0), f.x1, at(f.x1), f.x1, f.H, f.x0, f.H], pal.card);
    sh.line(f.x0, at(f.x0) - 4, f.x1, at(f.x1) - 4, pal.mark, 5);
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var br = wd.badge ? f.w * 0.11 : 0;
    if (br) badge(sh, f.x + f.w - br, at(f.x + f.w - br) - 4, br, pal, wd.badge);
    var top = Math.max(at(f.x), at(f.x + f.w)) + (br ? br + 6 : f.h * 0.04), bottom = f.y + f.h - ar;
    lineupRows(sh, K.frontLineup(built, 9).list, { x: f.x, w: f.w, top: top, bottom: bottom },
      { size: f.w * 0.07, color: pal.cardInk, strike: pal.mark, ring: pal.mark, lead: 1.9, ringW: 2.4 });
    K.authorLine(sh, f, pal.cardInk, wd);
  }

  // ======================================================================
  // Confetti (kids): rainbow letters on a cloud and a speech bubble with the line-up
  // ======================================================================
  function kids(sh, f, pal, wd, built, opt) {
    scatter(sh, f, opt.scatter, pal);
    var ks = Math.max(8, f.w * 0.032);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + ks, ks, 'sansBold', pal.ink, { align: 'center', ls: ks * 0.22 });
    var bump = f.w / 9, pad = f.w * 0.06, top = f.y + ks * 1.8 + bump * 0.62;
    var tl = titleLines(wd.title.toUpperCase(), f.w - pad * 2, f.h * 0.3, f.w * 0.22, 'sansBold', 1, 1);
    var chh = tl.lines.length * tl.size + pad * 1.6;
    // the cloud: a card with bumps along its top and bottom
    for (var bx = f.x + bump * 0.5; bx < f.x + f.w; bx += bump) { sh.disc(bx, top + 4, bump * 0.62, pal.card); sh.disc(bx, top + chh - 4, bump * 0.62, pal.card); }
    sh.rect(f.x, top, f.w, chh, pal.card);
    var y = top + pad * 0.8 + tl.size * ASC - tl.size * 0.12, k = 0;
    tl.lines.forEach(function (l) {
      var lw = width(l, tl.size, 'sansBold'), x = f.cx - lw / 2;
      for (var i = 0; i < l.length; i++) {
        var ch = l[i], cw = width(l.slice(0, i + 1), tl.size, 'sansBold') - width(l.slice(0, i), tl.size, 'sansBold');
        if (ch !== ' ') sh.text(ch, x, y, tl.size, 'sansBold', FUN[k++ % FUN.length]);
        x += cw;
      }
      y += tl.size;
    });
    var ss = Math.max(9, f.w * 0.04), yy = top + chh + bump * 0.6 + 4;
    wrap(wd.subtitle, ss, 'sansBold', f.w * 0.94).slice(0, 2).forEach(function (l) { yy += ss * 1.35; sh.text(l, f.cx, yy, ss, 'sansBold', pal.ink, { align: 'center' }); });
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var br = wd.badge ? f.w * 0.11 : 0;
    var bt = yy + f.h * 0.05, bb = f.y + f.h - ar - f.h * 0.06;
    if (bb - bt > 30) {
      var bw = f.w - br * 1.4;
      sh.rect(f.x + 4, bt + 5, bw, bb - bt, pal.dark);
      sh.rect(f.x, bt, bw, bb - bt, '#FFFFFF');
      sh.poly([f.x + bw * 0.18, bb - 1, f.x + bw * 0.34, bb - 1, f.x + bw * 0.12, bb + f.h * 0.045], '#FFFFFF');
      lineupRows(sh, K.frontLineup(built, 6).list, { x: f.x + 6, w: bw - 12, top: bt + 6, bottom: bb - 6 },
        { size: f.w * 0.055, color: '#1E1B18', strike: '#E63946', ring: '#1D7FD6', lead: 1.9, ringW: 2.2 });
      magnifier(sh, f.x + f.w - br * 0.9, bb + f.h * 0.0, br * 0.55, pal.ink, pal.dark, '#FFFFFF');
    }
    if (br) badge(sh, f.x + f.w - br, bt + br * 0.4, br, pal, wd.badge);
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ======================================================================
  // Case file: a manila folder with a stamp and a clipped list
  // ======================================================================
  function casefile(sh, f, pal, wd, built) {
    var manila = '#E4C68A', manilaDark = '#C9A562', folderInk = '#2A2016';
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var top = f.y + f.h * 0.05, bottom = f.y + f.h - ar - f.h * 0.01, tabH = f.h * 0.045;
    // back of the folder with its tab, a sheet peeking out, then the front of the folder
    sh.poly([f.x - 6, top + tabH, f.x - 6, top + 4, f.x + 2, top - tabH * 0.1, f.x + f.w * 0.38, top - tabH * 0.1, f.x + f.w * 0.44, top + tabH, f.x + f.w + 6, top + tabH, f.x + f.w + 6, bottom, f.x - 6, bottom], manilaDark);
    sh.poly(K.tilted(f.x + f.w * 0.62, top + tabH + f.h * 0.06, f.w * 0.7, f.h * 0.16, 3), '#FBFAF6');
    var ft = top + tabH * 2.2;
    sh.rect(f.x - 6, ft, f.w + 12, bottom - ft, manila);
    var ls = Math.max(8, f.w * 0.032);
    sh.text('CASE FILES', f.x + f.w * 0.04, top + tabH * 0.75, ls, 'sansBold', folderInk, { ls: ls * 0.25 });
    var pad = f.w * 0.06;
    var ks = Math.max(8, f.w * 0.028);
    sh.text(wd.kicker.toUpperCase(), f.cx, ft + pad + ks * 0.4, ks, 'sansBold', folderInk, { align: 'center', ls: ks * 0.25 });
    var tl = titleLines(wd.title.toUpperCase(), f.w - pad * 2, f.h * 0.26, f.w * 0.2, 'sansBold', 0.86, 0.95);
    var t = stack(sh, tl.lines, tl.size, f.cx, ft + pad + ks * 1.4, 0.95, 'sansBold', folderInk, { align: 'center', hs: 0.86 });
    var ss = Math.max(9, f.w * 0.036), y = t.bottom;
    wrap(wd.subtitle, ss, 'serif', f.w - pad * 2).slice(0, 2).forEach(function (l) { y += ss * 1.35; sh.text(l, f.cx, y, ss, 'serif', folderInk, { align: 'center' }); });
    // the stamp
    var sw = 0;
    if (wd.badge) {
      var bs = Math.max(9, f.w * 0.05);
      var bw = width(wd.badge, bs, 'sansBold', bs * 0.15);
      if (bw > f.w * 0.6) { bs = fitSize(wd.badge, 'sansBold', f.w * 0.6, bs, 0.15); bw = width(wd.badge, bs, 'sansBold', bs * 0.15); }
      y += bs * 1.2;
      sw = bw + bs * 1.6;
      sh.frame(f.cx - sw / 2, y, sw, bs * 1.9, pal.mark, 2.4);
      sh.frame(f.cx - sw / 2 + 3, y + 3, sw - 6, bs * 1.9 - 6, pal.mark, 0.8);
      sh.text(wd.badge, f.cx, y + bs * 1.3, bs, 'sansBold', pal.mark, { align: 'center', ls: bs * 0.15 });
      y += bs * 1.9;
    }
    // the clipped sheet with the line-up
    var it = y + f.h * 0.04, ib = bottom - pad * 0.8;
    if (ib - it > 30) {
      var ix = f.x + pad * 0.4, iw = f.w - pad * 0.8;
      sh.rect(ix + 3, it + 3, iw, ib - it, manilaDark);
      sh.rect(ix, it, iw, ib - it, '#FFFFFF');
      for (var ry = it + 14; ry < ib - 4; ry += 14) sh.line(ix + 6, ry, ix + iw - 6, ry, '#E3E7EE', 0.5);
      var cx = ix + iw * 0.12, cu = f.w * 0.022;
      sh.path([cx - cu, it + cu * 2.6, cx - cu, it - cu * 1.6, cx + cu, it - cu * 1.6, cx + cu, it + cu * 2, cx - cu * 0.35, it + cu * 2, cx - cu * 0.35, it - cu * 0.8], '#7E868F', Math.max(1.6, cu * 0.3));
      lineupRows(sh, K.frontLineup(built, 8).list, { x: ix + 8, w: iw - 16, top: it + 10, bottom: ib - 6 },
        { size: f.w * 0.045, font: 'sans', color: '#1E1B18', strike: pal.mark, ring: pal.mark, lead: 2 });
    }
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ======================================================================
  // Chalkboard: chalk words crossed out on a framed board
  // ======================================================================
  function chalk(sh, f, pal, wd, built) {
    sh.rect(f.x0, 0, f.x1 - f.x0, f.H, pal.dark);
    var bx = f.x - 9, by = f.y - 9, bw = f.w + 18, bh = f.h + 18;
    sh.rect(bx, by, bw, bh, pal.bg);
    sh.frame(bx + 1, by + 1, bw - 2, bh - 2, mix(pal.dark, '#000000', 0.3), 1.5);
    var R = rnd(1201);
    for (var i = 0; i < 7; i++) sh.disc(bx + R() * bw, by + R() * bh, f.w * (0.08 + R() * 0.1), mix(pal.bg, pal.ink, 0.04), f.w * 0.04);
    var y = K.titleBlock(sh, f, pal, wd, f.y + 4, f.h * 0.3, pal.ink);
    var pts = [];
    for (var j = 0; j <= 10; j++) pts.push(f.cx - f.w * 0.32 + j * f.w * 0.064, y + 8 + (j % 2 ? 2.5 : -2.5));
    sh.path(pts, pal.mark, 2.2);
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var br = wd.badge ? f.w * 0.1 : 0;
    var top = y + f.h * 0.06, bottom = f.y + f.h - ar - f.h * 0.06;
    lineupRows(sh, K.frontLineup(built, 9).list, { x: f.x, w: f.w, top: top, bottom: bottom - (br ? br * 1.2 : 0) },
      { size: f.w * 0.06, font: 'sans', color: pal.ink, strike: pal.strike, ring: pal.mark, lead: 2, ringW: 2 });
    // a stick of chalk and an eraser on the ledge
    var ly = f.y + f.h - ar - f.h * 0.025;
    sh.rect(f.x - 9, ly, f.w + 18, f.h * 0.018, mix(pal.dark, '#000000', 0.2));
    sh.rect(f.x + f.w * 0.62, ly - f.h * 0.012, f.w * 0.12, f.h * 0.012, pal.ink);
    sh.rect(f.x + f.w * 0.8, ly - f.h * 0.02, f.w * 0.16, f.h * 0.02, '#C9A06A');
    if (br) badge(sh, f.x + br, ly - br - 6, br, pal, wd.badge);
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ======================================================================
  // The cross-out set: ten fronts built around crossing things out
  // ======================================================================
  var HILITE = '#FFE45C';
  var NOTES = ['#FFE66D', '#FFB8C6', '#A9D8F2', '#BDE6A8', '#FFD49C'];

  // a hand-drawn zigzag through a word set at baseline y
  function scribble(sh, x, y, w, size, color) {
    var pts = [], step = size * 0.3, amp = size * 0.2, cy = y - size * 0.34, i = 0;
    for (var xx = x - size * 0.12; xx < x + w + size * 0.12; xx += step) pts.push(xx, cy + (i++ % 2 ? amp : -amp));
    pts.push(x + w + size * 0.12, cy);
    sh.path(pts, color, Math.max(1.6, size * 0.1));
  }
  // a hand-drawn loop that overshoots where it closes
  function handLoop(sh, cx, cy, rx, ry, color, lw) {
    var pts = [];
    for (var i = 0; i <= 38; i++) {
      var t = -0.6 + i / 34 * Math.PI * 2, k = 1 + 0.05 * Math.sin(i * 0.8);
      pts.push(cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k - i * 0.04);
    }
    sh.path(pts, color, lw);
  }
  // a felt-tip pen or a highlighter, tip at (tx, ty), body along deg
  function pen(sh, tx, ty, len, wid, deg, ink, body, cap) {
    var a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, hw = wid / 2;
    function q(d0, s0, d1, s1) {
      return [tx + ux * d0 + nx * -s0, ty + uy * d0 + ny * -s0, tx + ux * d1 + nx * -s1, ty + uy * d1 + ny * -s1,
        tx + ux * d1 + nx * s1, ty + uy * d1 + ny * s1, tx + ux * d0 + nx * s0, ty + uy * d0 + ny * s0];
    }
    sh.poly(q(0, hw * 0.22, len * 0.07, hw * 0.4), ink);
    sh.poly(q(len * 0.07, hw * 0.5, len * 0.15, hw), '#D9D9D9');
    sh.poly(q(len * 0.15, hw, len * 0.8, hw), body);
    sh.poly(q(len * 0.42, hw, len * 0.58, hw), cap);
    sh.poly(q(len * 0.8, hw * 1.08, len, hw * 1.08), cap);
  }
  function pinHead(sh, cx, cy, r, color) {
    sh.disc(cx + r * 0.25, cy + r * 0.3, r, mix(color, '#000000', 0.45));
    sh.disc(cx, cy, r, color);
    sh.disc(cx - r * 0.3, cy - r * 0.3, r * 0.3, '#FFFFFF');
  }
  // one or two lines for a word in a box, as big as the box allows
  function boxLines(text, font, maxW, cap) {
    var ws = text.split(' '), lines = [text];
    if (ws.length > 1) {
      var best = null;
      for (var c = 1; c < ws.length; c++) {
        var l = [ws.slice(0, c).join(' '), ws.slice(c).join(' ')], wm = Math.max(width(l[0], 1, font), width(l[1], 1, font));
        if (!best || wm < best.w) best = { l: l, w: wm };
      }
      if (width(text, 1, font) > best.w * 1.25) lines = best.l;
    }
    var widest = Math.max.apply(null, lines.map(function (l) { return width(l, 1, font); }));
    return { lines: lines, size: Math.max(7.5, Math.min(cap, maxW / widest)) };
  }
  function drawBoxLines(sh, bl, cx, cy, font, color) {
    var lh = bl.lines.length * bl.size * 1.08, ws = [];
    bl.lines.forEach(function (l, i) { ws.push(sh.text(l, cx, cy - lh / 2 + bl.size * 0.8 + i * bl.size * 1.08, bl.size, font, color, { align: 'center' })); });
    return { w: Math.max.apply(null, ws), h: lh };
  }
  function subtitleLines(sh, wd, x, y, ss, font, maxW, color, align, max) {
    wrap(wd.subtitle, ss, font, maxW).slice(0, max || 2).forEach(function (l) { y += ss * 1.35; sh.text(l, x, y, ss, font, color, { align: align }); });
    return y;
  }

  // ---------- 1. Red marker: big words scribbled out, the answer looped, a felt-tip pen ----------
  function marker(sh, f, pal, wd, built) {
    var ks = Math.max(8, f.w * 0.03);
    sh.text(wd.kicker.toUpperCase(), f.x, f.y + ks, ks, 'sansBold', pal.ink, { ls: ks * 0.22 });
    var br = wd.badge ? f.w * 0.11 : 0;
    if (br) badge(sh, f.x + f.w - br, f.y + br, br, pal, wd.badge);
    var tl = titleLines(wd.title.toUpperCase(), f.w - br * 2.2, f.h * 0.3, f.w * 0.24, 'sansBold', 0.86, 0.92);
    var t = stack(sh, tl.lines, tl.size, f.x, f.y + ks * 1.8, 0.92, 'sansBold', pal.ink, { hs: 0.86 });
    var lw = width(tl.lines[tl.lines.length - 1], tl.size, 'sansBold', 0, 0.86);
    sh.path([f.x, t.base + tl.size * 0.2, f.x + lw * 0.5, t.base + tl.size * 0.14, f.x + lw, t.base + tl.size * 0.22], pal.mark, Math.max(3, tl.size * 0.08));
    var y = subtitleLines(sh, wd, f.x, Math.max(t.bottom + tl.size * 0.15, br ? f.y + br * 2 : 0), Math.max(9, f.w * 0.04), 'serif', f.w, pal.ink, 'left');
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var top = y + f.h * 0.05, bottom = f.y + f.h - ar - f.h * 0.02;
    var lu = K.frontLineup(built, 6).list, lead = 1.55;
    var longest = lu.reduce(function (a, o) { return Math.max(a, width(o.text, 1, 'serifBold')); }, 0);
    var size = Math.max(8, Math.min(f.w * 0.1, (bottom - top) / (lu.length * lead), f.w * 0.66 / longest));
    var yy = top + size * ASC;
    lu.forEach(function (o) {
      var w = sh.text(o.text, f.x, yy, size, 'serifBold', pal.ink);
      if (o.ans) handLoop(sh, f.x + w / 2, yy - size * 0.34, w / 2 + size * 0.45, size * 0.72, pal.mark, Math.max(2, size * 0.08));
      else scribble(sh, f.x, yy, w, size, pal.mark);
      yy += size * lead;
    });
    pen(sh, f.x + f.w * 0.76, top + (bottom - top) * 0.32, f.w * 0.55, f.w * 0.085, 58, pal.mark, '#2B2B2B', pal.mark);
    K.authorLine(sh, f, pal.ink, wd, 'left');
  }

  // ---------- 2. Highlighter: a clue sheet with highlighted clues and the answer marked ----------
  function highlighter(sh, f, pal, wd, built) {
    var y = K.titleBlock(sh, f, pal, wd, f.y, f.h * 0.27, pal.ink);
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var top = y + f.h * 0.045, bottom = f.y + f.h - ar - f.h * 0.02;
    sh.rect(f.x + 5, top + 6, f.w, bottom - top, pal.dark);
    sh.rect(f.x, top, f.w, bottom - top, '#FFFFFF');
    var pad = f.w * 0.06, iw = f.w - pad * 2, cs = Math.max(8.5, f.w * 0.04);
    var lu = K.frontLineup(built, 8);
    var yy = top + pad + cs * 0.8;
    sh.text('CROSS IT OUT IF…', f.x + pad, yy, cs * 1.05, 'sansBold', '#1E1B18', { ls: cs * 0.08 });
    yy += cs * 0.6;
    lu.clues.forEach(function (c, i) {
      wrap((i + 1) + '.  ' + c, cs, 'sans', iw).slice(0, 2).forEach(function (l, li) {
        yy += cs * 1.55;
        var w = width(l, cs, 'sans');
        if (!li) sh.poly([f.x + pad - 3, yy - cs * 0.92, f.x + pad + w + 4, yy - cs * 0.98, f.x + pad + w + 2, yy + cs * 0.3, f.x + pad - 4, yy + cs * 0.34], HILITE);
        sh.text(l, f.x + pad, yy, cs, 'sans', '#1E1B18');
      });
    });
    yy += cs * 1.1;
    sh.line(f.x + pad, yy, f.x + f.w - pad, yy, '#C9CDD3', 0.8, false, [3, 3]);
    var br = wd.badge ? f.w * 0.1 : 0;
    lineupRows(sh, lu.list, { x: f.x + pad * 0.5, w: f.w - pad - br * 1.6, top: yy + cs * 0.4, bottom: bottom - pad * 0.6 },
      { size: f.w * 0.05, color: '#1E1B18', strike: '#7A7F87', ring: pal.mark, lead: 2, hilite: HILITE });
    if (br) badge(sh, f.x + f.w - br * 0.95, bottom - br * 1.15, br, pal, wd.badge);
    pen(sh, f.x + f.w * 0.86, top + f.w * 0.035, f.w * 0.42, f.w * 0.09, -12, '#F2C200', HILITE, '#F2C200');
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ---------- 3. Clue cards: a fanned stack of clue cards, the top one readable ----------
  function cluecards(sh, f, pal, wd, built) {
    var y = K.titleBlock(sh, f, pal, wd, f.y, f.h * 0.27, pal.ink);
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var lu = K.frontLineup(built, 6);
    var cw = f.w * 0.84, pad = cw * 0.08, cs = Math.max(9, f.w * 0.05);
    var lines = wrap(lu.clues[0] || '', cs, 'serifBold', cw - pad * 2).slice(0, 3);
    var ch = pad * 2 + cs * 2.4 + lines.length * cs * 1.3 + cs * 1.4;
    var top = y + f.h * 0.06, ccx = f.cx, ccy = top + ch / 2;
    sh.poly(K.tilted(ccx + 10, ccy + 4, cw, ch, 7), mix(pal.card, pal.dark, 0.35));
    sh.poly(K.tilted(ccx + 4, ccy + 2, cw, ch, 3.5), mix(pal.card, pal.dark, 0.18));
    sh.rect(ccx - cw / 2 + 4, top + 5, cw, ch, pal.dark);
    sh.rect(ccx - cw / 2, top, cw, ch, pal.card);
    sh.rect(ccx - cw / 2, top, cw, cs * 0.5, pal.mark);
    var x0 = ccx - cw / 2 + pad, yy = top + cs * 0.5 + pad * 0.6 + cs;
    sh.text('CLUE 1', x0, yy, cs * 0.75, 'sansBold', pal.cardMark, { ls: cs * 0.12 });
    sh.text('of ' + Math.max(1, lu.clues.length), ccx + cw / 2 - pad, yy, cs * 0.75, 'sans', pal.cardInk, { align: 'right' });
    yy += cs * 1.4;
    sh.text('Cross it out if…', x0, yy, cs * 0.85, 'sansBold', pal.cardInk);
    lines.forEach(function (l) { yy += cs * 1.3; sh.text(l, x0, yy, cs, 'serifBold', pal.cardInk); });
    var br = wd.badge ? f.w * 0.1 : 0;
    if (br) badge(sh, f.x + f.w - br, top + ch - br * 0.4, br, pal, wd.badge);
    var lt = top + ch + f.h * 0.04 + (br ? br * 0.7 : 0), lb = f.y + f.h - ar - f.h * 0.01;
    if (lb - lt > 20) lineupRows(sh, lu.list, { x: f.x, w: f.w, top: lt, bottom: lb }, { size: f.w * 0.055, color: pal.ink, strike: pal.strike, ring: pal.ink, lead: 2 });
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ---------- 4. Line-up board: placards against a height chart, all crossed but one ----------
  function lineupboard(sh, f, pal, wd, built) {
    var y = K.titleBlock(sh, f, pal, wd, f.y, f.h * 0.27, pal.ink);
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var wt = y + f.h * 0.04, wb = f.y + f.h - ar - f.h * 0.015;
    sh.rect(f.x0, wt, f.x1 - f.x0, wb - wt, pal.card);
    var rule = mix(pal.card, pal.cardInk, 0.3), n = 8, step = (wb - wt) / n, ls = Math.max(7.5, Math.min(10, step * 0.3));
    for (var i = 1; i < n; i++) {
      var ly = wt + step * i;
      sh.line(f.x0, ly, f.x1, ly, rule, i % 2 ? 0.6 : 1.2);
      if (!(i % 2)) sh.text((n - i) + "'", f.x, ly - 3, ls, 'sansBold', mix(pal.card, pal.cardInk, 0.6));
    }
    var lu = K.frontLineup(built, 6).list, cols = 3, rows = Math.ceil(lu.length / cols);
    var gx = f.x + f.w * 0.07, gw = f.w * 0.93, gap = f.w * 0.035, pw = (gw - gap * (cols - 1)) / cols;
    var ph = Math.min(pw * 0.62, (wb - wt) / rows * 0.5);
    var fit = lu.map(function (o) { return boxLines(o.text, 'sansBold', pw * 0.82, ph * 0.3); });
    var fs = Math.min.apply(null, fit.map(function (b) { return b.size; }));
    lu.forEach(function (o, k) {
      var r = Math.floor(k / cols), c = k % cols;
      var px = gx + c * (pw + gap), py = wt + (wb - wt) * (r + 0.5) / rows - ph / 2 + (wb - wt) * 0.06;
      sh.rect(px, py, pw, ph, pal.cardInk);
      sh.line(px + pw * 0.5, py, px + pw * 0.5, py - (wb - wt) * 0.06, pal.cardInk, 1.2);
      var bl = fit[k]; bl.size = fs;
      sh.text('No. ' + (k + 1), px + pw / 2, py + ph * 0.24, Math.max(7.5, ph * 0.14), 'sans', pal.card, { align: 'center' });
      drawBoxLines(sh, bl, px + pw / 2, py + ph * 0.6, 'sansBold', pal.card);
      if (o.ans) sh.ring(px + pw / 2, py + ph / 2, pw * 0.62, ph * 0.82, pal.mark, Math.max(2.5, pw * 0.03));
      else cross(sh, px + pw / 2, py + ph / 2, Math.min(pw, ph) * 0.48, pal.mark, Math.max(2.5, pw * 0.035));
    });
    if (wd.badge) badge(sh, f.x + f.w - f.w * 0.1, wt + f.w * 0.045, f.w * 0.1, pal, wd.badge);
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ---------- 5. Knockout bracket: eight words knocked out round by round, one left ----------
  function bracket(sh, f, pal, wd, built) {
    var y = K.titleBlock(sh, f, pal, wd, f.y, f.h * 0.27, pal.ink);
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var lu = K.frontLineup(built, 8).list;
    var n = lu.length >= 8 ? 8 : lu.length >= 4 ? 4 : 2;
    lu = lu.slice(0, n);
    if (!lu.some(function (o) { return o.ans; })) lu[n - 1] = K.frontLineup(built, 8).list.filter(function (o) { return o.ans; })[0];
    var top = y + f.h * 0.05, bottom = f.y + f.h - ar - f.h * 0.02, rowH = (bottom - top) / n;
    var colW = f.w * 0.42, step = f.w * 0.065;
    var longest = lu.reduce(function (a, o) { return Math.max(a, width(o.text, 1, 'sansBold', 0.03)); }, 0);
    var size = Math.max(7.5, Math.min(rowH * 0.45, (colW - 8) / longest));
    var thin = mix(pal.bg, pal.ink, 0.55), lw = Math.max(1.2, size * 0.09);
    var ys = [], win = [], ends = [];
    lu.forEach(function (o, i) {
      var cy = top + rowH * (i + 0.5), base = cy + size * 0.35;
      var w = sh.text(o.text, f.x, base, size, 'sansBold', pal.ink, { ls: size * 0.03 });
      if (!o.ans) strike(sh, f.x, base, w, size, pal.strike, i);
      ys.push(cy); win.push(!!o.ans); ends.push(f.x + w + size * 0.4);
    });
    var xPrev = null, x = f.x + colW;
    while (ys.length > 1) {
      var ny = [], nw = [];
      for (var j = 0; j < ys.length; j += 2) {
        [0, 1].forEach(function (k) {
          var from = xPrev == null ? ends[j + k] : xPrev;
          sh.line(from, ys[j + k], x, ys[j + k], win[j + k] ? pal.mark : thin, win[j + k] ? lw * 2 : lw);
        });
        var hot = win[j] || win[j + 1];
        sh.line(x, ys[j], x, ys[j + 1], thin, lw);
        if (hot) sh.line(x, win[j] ? ys[j] : ys[j + 1], x, (ys[j] + ys[j + 1]) / 2, pal.mark, lw * 2);
        ny.push((ys[j] + ys[j + 1]) / 2); nw.push(hot);
      }
      ys = ny; win = nw; xPrev = x; x += step;
    }
    var bx = x + step * 0.3, bw = f.x + f.w - bx, bh = Math.min(rowH * 2, bw * 0.75), by = ys[0] - bh / 2;
    sh.line(xPrev, ys[0], bx, ys[0], pal.mark, lw * 2);
    sh.rect(bx + 3, by + 4, bw, bh, pal.dark);
    sh.rect(bx, by, bw, bh, pal.card);
    sh.frame(bx + 3, by + 3, bw - 6, bh - 6, pal.cardMark, 1.6);
    var ans = lu.filter(function (o) { return o.ans; })[0];
    var bl = boxLines(ans.text, 'sansBold', bw * 0.8, bh * 0.3);
    drawBoxLines(sh, bl, bx + bw / 2, by + bh * 0.58, 'sansBold', pal.cardInk);
    var lab = 'LAST ONE STANDING', lz = Math.max(7.5, Math.min(bh * 0.11, fitSize(lab, 'sansBold', bw * 0.84, 99, 0.1)));
    sh.text(lab, bx + bw / 2, by + bh * 0.08 + lz, lz, 'sansBold', pal.cardMark, { align: 'center', ls: lz * 0.1 });
    if (wd.badge) { var br = Math.min(f.w * 0.1, bw * 0.4); badge(sh, bx + bw / 2, Math.max(by - br - 6, top + br), br, pal, wd.badge); }
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ---------- 6. Elimination funnel: rows of words narrowing down to the one answer ----------
  function funnel(sh, f, pal, wd, built) {
    var y = K.titleBlock(sh, f, pal, wd, f.y, f.h * 0.27, pal.ink);
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var top = y + f.h * 0.04, bottom = f.y + f.h - ar - f.h * 0.02, rowsH = (bottom - top) * 0.74, narrow = 0.34;
    var widthAt = function (yy) { return f.w * (1 - (1 - narrow) * Math.min(1, (yy - top) / rowsH)); };
    var lu = K.frontLineup(built, 9).list, others = lu.filter(function (o) { return !o.ans; }), ans = lu.filter(function (o) { return o.ans; })[0];
    // the answer on a pill at the very bottom, the spout of the funnel above it
    var as = Math.max(8, Math.min(f.w * 0.07, (bottom - top - rowsH) * 0.32, fitSize(ans.text, 'sansBold', f.w * 0.62, 99, 0.04)));
    var aw = width(ans.text, as, 'sansBold', as * 0.04), pw = Math.min(f.w, aw + as * 1.6), ph = as * 1.7, pTop = bottom - ph;
    var sw = f.w * narrow, sBot = Math.max(top + rowsH + 4, pTop - as * 0.9);
    sh.poly([f.x - 4, top, f.x + f.w + 4, top, f.cx + sw / 2, top + rowsH, f.cx + sw / 2, sBot, f.cx - sw / 2, sBot, f.cx - sw / 2, top + rowsH], pal.card);
    var rows = [others.slice(0, 3), others.slice(3, 6), others.slice(6, 8)].filter(function (r) { return r.length; });
    rows.forEach(function (row, r) {
      var cy = top + rowsH * (r + 0.5) / rows.length, avail = widthAt(cy + rowsH * 0.25 / rows.length) * 0.86;
      var size = Math.max(7.5, Math.min(f.w * 0.075, rowsH / rows.length * 0.38));
      var tot = function (z) { return row.reduce(function (a, o) { return a + width(o.text, z, 'sansBold', z * 0.03); }, 0) + z * 1.1 * (row.length - 1); };
      while (size > 7.5 && tot(size) > avail) size -= 0.25;
      var x = f.cx - tot(size) / 2, base = cy + size * 0.35;
      row.forEach(function (o, i) {
        var w = sh.text(o.text, x, base, size, 'sansBold', pal.cardInk, { ls: size * 0.03 });
        strike(sh, x, base, w, size, pal.cardMark, i + r);
        x += w + size * 1.1;
      });
    });
    triangle(sh, f.cx, sBot - as * 0.05, as * 0.42, pal.cardInk);
    sh.rect(f.cx - pw / 2, pTop, pw, ph, pal.mark);
    sh.text(ans.text, f.cx, pTop + ph / 2 + as * 0.35, as, 'sansBold', pal.markInk, { align: 'center', ls: as * 0.04 });
    var br = wd.badge ? f.w * 0.1 : 0;
    if (br) badge(sh, f.x + f.w - br, top + rowsH * 0.72, br, pal, wd.badge, pal.dark, '#FFFFFF');
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ---------- 7. Clipboard: a case sheet clipped to a board, ticked off ----------
  function clipboard(sh, f, pal, wd, built) {
    var ks = Math.max(8, f.w * 0.03);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + ks, ks, 'sansBold', pal.ink, { align: 'center', ls: ks * 0.22 });
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var clipH = f.w * 0.09, bt = f.y + ks * 2 + clipH * 0.5, bb = f.y + f.h - ar - 2;
    var board = '#9C6B3C';
    sh.rect(f.x - 5, bt + 5, f.w + 10, bb - bt, mix(board, '#000000', 0.35));
    sh.rect(f.x - 9, bt, f.w + 18, bb - bt, board);
    var px = f.x + 2, pw = f.w - 4, pt = bt + clipH * 0.7, pb = bb - 9;
    sh.rect(px, pt, pw, pb - pt, pal.card);
    // the clip
    var cw = f.w * 0.38;
    sh.rect(f.cx - cw / 2, bt - clipH * 0.45, cw, clipH, '#8E969F');
    sh.rect(f.cx - cw / 2 + 3, bt - clipH * 0.45 + 3, cw - 6, clipH * 0.35, '#B8BFC6');
    sh.ring(f.cx, bt - clipH * 0.45, cw * 0.14, clipH * 0.42, '#8E969F', Math.max(2, clipH * 0.12));
    var pad = pw * 0.07, iw = pw - pad * 2;
    var tl = titleLines(wd.title.toUpperCase(), iw, f.h * 0.22, f.w * 0.17, 'sansBold', 0.86, 0.95);
    var t = stack(sh, tl.lines, tl.size, f.cx, pt + clipH * 0.6 + pad * 0.4, 0.95, 'sansBold', pal.cardInk, { align: 'center', hs: 0.86 });
    var yy = subtitleLines(sh, wd, f.cx, t.bottom, Math.max(9, f.w * 0.036), 'serif', iw, pal.cardInk, 'center');
    yy += f.h * 0.02;
    sh.line(px + pad, yy, px + pw - pad, yy, pal.cardInk, 1);
    var lu = K.frontLineup(built, 6).list, br = wd.badge ? f.w * 0.1 : 0;
    var rowH = Math.min((pb - pad * 0.5 - yy) / lu.length, f.w * 0.1), box = rowH * 0.36;
    var longest = lu.reduce(function (a, o) { return Math.max(a, width(o.text, 1, 'sansBold', 0.04)); }, 0);
    var size = Math.max(7.5, Math.min(rowH * 0.45, (iw - box * 2.4 - br * 1.6) / longest));
    lu.forEach(function (o, i) {
      var cy = yy + rowH * (i + 0.5) + pad * 0.2, x = px + pad + box * 2, base = cy + size * 0.35;
      sh.frame(px + pad, cy - box / 2, box, box, pal.cardInk, 1.2);
      var w = sh.text(o.text, x, base, size, 'sansBold', pal.cardInk, { ls: size * 0.04 });
      if (o.ans) { ringWord(sh, x, base, w, size, pal.cardMark, Math.max(1.8, size * 0.1)); tick(sh, px + pad + box * 0.1, cy - box * 0.5, box, pal.cardMark); }
      else { strike(sh, x, base, w, size, pal.cardMark, i); cross(sh, px + pad + box / 2, cy, box * 0.3, pal.cardInk, 1.1); }
    });
    if (br) badge(sh, px + pw - br * 1.05, pb - br * 1.1, br, pal, wd.badge);
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ---------- 8. Big X: a giant cross behind a title panel ----------
  function bigx(sh, f, pal, wd, built) {
    var xc = mix(pal.bg, pal.dark, 0.55), lw = f.w * 0.17;
    sh.line(f.x0, 0, f.x1, f.H, xc, lw, true);
    sh.line(f.x1, 0, f.x0, f.H, xc, lw, true);
    var ks = Math.max(8, f.w * 0.03);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + ks, ks, 'sansBold', pal.ink, { align: 'center', ls: ks * 0.22 });
    var pad = f.w * 0.06;
    var tl = titleLines(wd.title.toUpperCase(), f.w - pad * 2, f.h * 0.28, f.w * 0.22, 'sansBold', 0.86, 0.95);
    var ss = Math.max(9, f.w * 0.038), sl = wrap(wd.subtitle, ss, 'serif', f.w - pad * 2).slice(0, 2);
    var ph = pad * 1.6 + stackH(tl, 0.95) + sl.length * ss * 1.35 + ss * 0.2;
    var pt = f.y + ks * 2.6;
    sh.rect(f.x + 6, pt + 6, f.w, ph, pal.dark);
    sh.rect(f.x, pt, f.w, ph, pal.card);
    sh.rect(f.x, pt, f.w, 6, pal.mark);
    var t = stack(sh, tl.lines, tl.size, f.cx, pt + pad, 0.95, 'sansBold', pal.cardInk, { align: 'center', hs: 0.86 });
    subtitleLines(sh, wd, f.cx, t.bottom, ss, 'serif', f.w - pad * 2, pal.cardInk, 'center');
    var br = wd.badge ? f.w * 0.11 : 0;
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var st = pt + ph + f.h * 0.04 + br * 0.9, sb = f.y + f.h - ar - f.h * 0.01;
    if (sb - st > 30) {
      sh.rect(f.x0, st, f.x1 - f.x0, sb - st, pal.card);
      lineupRows(sh, K.frontLineup(built, 9).list, { x: f.x, w: f.w, top: st + 6, bottom: sb - 6 },
        { size: f.w * 0.06, color: pal.cardInk, strike: pal.cardMark, ring: pal.cardMark, lead: 1.9, ringW: 2.4 });
    }
    if (br) badge(sh, f.x + f.w - br, pt + ph + br * 0.75, br, pal, wd.badge, pal.dark, '#FFFFFF');
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ---------- 9. Receipt: every option rung up as OUT, one KEPT ----------
  function receipt(sh, f, pal, wd, built) {
    var ks = Math.max(8, f.w * 0.03);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + ks, ks, 'sansBold', pal.ink, { align: 'center', ls: ks * 0.22 });
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var rw = f.w * 0.84, rx = f.cx - rw / 2, top = f.y + ks * 2.2, bottom = f.y + f.h - ar - f.h * 0.02;
    var tooth = rw / 20, th = tooth * 0.5, pts = [];
    for (var i = 0; i <= 20; i++) pts.push(rx + i * tooth, top + (i % 2 ? th : 0));
    for (var k = 20; k >= 0; k--) pts.push(rx + k * tooth, bottom - (k % 2 ? th : 0));
    sh.poly(pts.map(function (v, idx) { return v + (idx % 2 ? 6 : 5); }), pal.dark);
    sh.poly(pts, '#FFFFFF');
    var ink = '#1E1B18', pad = rw * 0.08, ix = rx + pad, iw = rw - pad * 2;
    var tl = titleLines(wd.title.toUpperCase(), iw, f.h * 0.18, f.w * 0.13, 'sansBold', 0.86, 0.95);
    var ss = Math.max(8, f.w * 0.03), sl = wrap(wd.subtitle, ss, 'sans', iw).slice(0, 2);
    var fixed = pad * 1.4 + tl.lines.length * tl.size * 0.95 + sl.length * ss * 1.35 + pad * 0.8;
    var lu = K.frontLineup(built, 8).list, rs;
    for (var n = lu.length; n >= 3; n--) {
      rs = Math.min(f.w * 0.04, (bottom - top - fixed) / (1.6 * (n + 6) + 4 * 1.0 + 3.4));
      if (rs >= 7.5) break;
    }
    rs = Math.max(7.5, rs);
    var shown = lu.filter(function (o) { return o.ans; }).concat(lu.filter(function (o) { return !o.ans; })).slice(0, n);
    shown = lu.filter(function (o) { return shown.indexOf(o) !== -1; });
    var t = stack(sh, tl.lines, tl.size, f.cx, top + pad * 1.2, 0.95, 'sansBold', ink, { align: 'center', hs: 0.86 });
    var y = t.bottom;
    sl.forEach(function (l) { y += ss * 1.35; sh.text(l, f.cx, y, ss, 'sans', ink, { align: 'center' }); });
    y += pad * 0.5;
    var dash = function () { y += rs * 0.5; sh.line(ix, y, ix + iw, y, ink, 0.8, false, [3, 2.5]); y += rs * 0.5; };
    var row = function (l, r, o) {
      o = o || {};
      y += rs * 1.6;
      var font = o.bold ? 'sansBold' : 'sans', col = o.color || ink;
      var w = sh.text(clip(l, rs, font, iw * 0.7), ix, y, rs, font, col, { ls: rs * 0.06 });
      sh.text(r, ix + iw, y, rs, font, col, { align: 'right', ls: rs * 0.06 });
      if (o.strike) sh.line(ix - 1, y - rs * 0.32, ix + w + 1, y - rs * 0.32, ink, 0.9);
    };
    dash();
    row('ITEM', 'RESULT', { bold: true });
    dash();
    shown.forEach(function (o) { row(o.text, o.ans ? 'KEPT' : 'OUT', o.ans ? { bold: true, color: pal.cardMark } : { strike: true }); });
    dash();
    row('OPTIONS', String(shown.length));
    row('CROSSED OUT', String(shown.length - 1));
    row('LEFT STANDING', '1', { bold: true });
    dash();
    y += rs * 1.4;
    sh.text('THANK YOU, DETECTIVE!', f.cx, y, rs, 'sansBold', ink, { align: 'center', ls: rs * 0.12 });
    // a barcode
    var R = rnd(3571), bx = ix + iw * 0.18, bEnd = ix + iw * 0.82, bt = y + rs * 0.8, bh = Math.max(4, Math.min(rs * 2.2, bottom - th - 4 - bt));
    while (bx < bEnd) { var bw = 0.6 + R() * 2.2; sh.rect(bx, bt, bw, bh, ink); bx += bw + 0.8 + R() * 1.8; }
    var br = wd.badge ? f.w * 0.1 : 0;
    if (br) badge(sh, f.x + f.w - br, top + f.h * 0.04 + br, br, pal, wd.badge);
    K.authorLine(sh, f, pal.ink, wd);
  }

  // ---------- 10. Note wall: sticky notes pinned to a board, crossed off one by one ----------
  function notewall(sh, f, pal, wd, built) {
    var R = rnd(911);
    for (var i = 0; i < 90; i++) sh.disc(f.x0 + R() * (f.x1 - f.x0), R() * f.H, 0.6 + R() * 1.6, mix(pal.bg, pal.dark, 0.3 + R() * 0.3));
    var pad = f.w * 0.06, ks = Math.max(8, f.w * 0.028);
    var tl = titleLines(wd.title.toUpperCase(), f.w - pad * 2, f.h * 0.24, f.w * 0.2, 'sansBold', 0.86, 0.95);
    var ss = Math.max(9, f.w * 0.036), sl = wrap(wd.subtitle, ss, 'serif', f.w - pad * 2).slice(0, 2);
    var bh = pad * 1.2 + ks * 1.9 + stackH(tl, 0.95) + sl.length * ss * 1.35 + pad * 0.5;
    sh.rect(f.x + 4, f.y + 5, f.w, bh, mix(pal.bg, '#000000', 0.35));
    sh.rect(f.x, f.y, f.w, bh, pal.card);
    pinHead(sh, f.x + pad * 0.6, f.y + pad * 0.5, f.w * 0.018, pal.mark);
    pinHead(sh, f.x + f.w - pad * 0.6, f.y + pad * 0.5, f.w * 0.018, pal.mark);
    sh.text(wd.kicker.toUpperCase(), f.cx, f.y + pad * 0.6 + ks, ks, 'sansBold', pal.cardMark, { align: 'center', ls: ks * 0.22 });
    var t = stack(sh, tl.lines, tl.size, f.cx, f.y + pad * 0.6 + ks * 1.9, 0.95, 'sansBold', pal.cardInk, { align: 'center', hs: 0.86 });
    subtitleLines(sh, wd, f.cx, t.bottom, ss, 'serif', f.w - pad * 2, pal.cardInk, 'center');
    var br = wd.badge ? f.w * 0.1 : 0;
    var ar = wd.author ? K.authorSize(f) * 2.4 : 0;
    var gt = f.y + bh + f.h * 0.04 + br * 0.45, gb = f.y + f.h - ar - f.h * 0.015;
    var gap = f.w * 0.045, s = Math.min((f.w - gap * 2) / 3, (gb - gt - gap * 2) / 3), gx = f.cx - (s * 3 + gap * 2) / 2;
    var lu = K.frontLineup(built, 9).list;
    var fit = lu.map(function (o) { return boxLines(o.text, 'sansBold', s * 0.8, s * 0.2); });
    lu.forEach(function (o, k) {
      var cx = gx + (k % 3) * (s + gap) + s / 2, cy = gt + Math.floor(k / 3) * (s + gap) + s / 2, tilt = [-3, 2, -1.5, 3, -2.5, 1.5, 2.5, -3, 1][k % 9];
      sh.poly(K.tilted(cx + 3, cy + 4, s, s, tilt), mix(pal.bg, '#000000', 0.35));
      sh.poly(K.tilted(cx, cy, s, s, tilt), NOTES[k % NOTES.length]);
      pinHead(sh, cx, cy - s * 0.4, s * 0.06, k % 2 ? '#2B7BD8' : '#D7302A');
      var bl = fit[k], fs = bl.size;
      var d = drawBoxLines(sh, bl, cx, cy + s * 0.06, 'sansBold', '#1E1B18');
      if (o.ans) handLoop(sh, cx, cy + s * 0.04, Math.min(s * 0.46, d.w / 2 + fs * 0.6), Math.min(s * 0.4, d.h / 2 + fs * 0.6), '#D7302A', Math.max(2, s * 0.03));
      else cross(sh, cx, cy + s * 0.05, s * 0.3, '#D7302A', Math.max(1.8, s * 0.035));
    });
    if (br) badge(sh, f.x + f.w - br, f.y + bh + br * 0.75, br, pal, wd.badge);
    K.authorLine(sh, f, pal.ink, wd);
  }

  CX.coverFronts = {
    notecard: notecard, tiles: tiles, bold: bold, notebook: notebook, sticky: sticky, checklist: checklist,
    poster: poster, grid: grid, magnifier: magnify, minimal: minimal, bignumber: bignumber, ticket: ticket,
    letters: letters, xo: xo, shapes: shapes, classic: classic, split: split, kids: kids, casefile: casefile, chalk: chalk,
    marker: marker, highlighter: highlighter, cluecards: cluecards, lineupboard: lineupboard, bracket: bracket, funnel: funnel,
    clipboard: clipboard, bigx: bigx, receipt: receipt, notewall: notewall
  };
})(typeof window !== 'undefined' ? window : globalThis);
