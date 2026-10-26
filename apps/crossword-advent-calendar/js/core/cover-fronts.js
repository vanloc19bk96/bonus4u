/*
 * The fronts of the cover templates. Each layout draws into the front's safe box
 * f = { x, y, w, h, cx } (every word stays inside it) and may paint shapes out to the bleed:
 * f.X0..f.X1 across, 0..f.H down. A layout gets the sheet, f, the cover's words
 * w = { title, sub, author, days, bonus, large, sentence }, the palette, the template's options,
 * a scale k (the cover shrinks k until res.fits) and a seeded random. It returns
 * { fits, avoid (shape boxes kept clear of snow), confetti }.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var K = CX.cover.kit, PT = K.PT;

  // ---------- helpers ----------
  function center(sh, start, top, bottom, used, part) {
    var dy = Math.max(0, (bottom - used) * (part == null ? 0.45 : part));
    sh.shift(start, 0, dy);
    return dy;
  }
  function moved(boxes, dy) { return boxes.map(function (b) { return { x: b.x, y: b.y + dy, w: b.w, h: b.h }; }); }
  function on(pal, c) { return Math.abs(K.lum(c) - K.lum(pal.bg)) > 0.12; }
  function festive(pal) { return [pal.a1, pal.a2, pal.a3, pal.title, pal.light].filter(function (c, i, a) { return a.indexOf(c) === i && on(pal, c); }); }
  function snowColor(pal) { return K.lum(pal.bg) > 0.7 ? K.mix(pal.bg, pal.ink, 0.25) : pal.light; }
  function title(sh, f, w, pal, k, top, o) {
    return K.textLines(sh, w.title, o.x == null ? f.x : o.x, top, o.w || f.w, Object.assign({ font: 'sansBold', upper: false, lines: 4, color: pal.title, fill: 1.25, lead: 0.12 }, o, { max: (o.max || f.w * 0.14) * k }));
  }

  /*
   * The common shape: the title on top (or under the art with o.artTop), an illustration
   * (art(y, h) draws it in the height it is given and returns { avoid }), then the subtitle and
   * pen name. The group is centered in the space left.
   */
  function artFlow(sh, f, w, pal, k, o) {
    var bottom = K.flow(sh, f, w, o.sub, o.foot);
    var start = sh.items.length, gap = (o.gap || f.w * 0.05) * k, y = f.y, r;
    var tO = o.title || {};
    var tH = K.measure(sh, function () { return title(sh, f, w, pal, k, 0, tO); });
    var h = Math.min(o.maxH, bottom - f.y - tH - gap * 2);
    if (o.artTop) {
      r = o.art(y, h) || {};
      y = title(sh, f, w, pal, k, y + h + gap, tO);
    } else {
      y = title(sh, f, w, pal, k, y, tO) + gap;
      r = o.art(y, h) || {};
      y += h;
    }
    var dy = center(sh, start, f.y, bottom - gap * 0.5, y, o.part);
    return { fits: h >= o.minH, avoid: moved(r.avoid || [], dy), dy: dy };
  }

  // Corner seals: LARGE PRINT and the bonus, kept inside f.
  function seals(sh, f, w, pal, box, k) {
    var out = [], r = Math.min(f.w * 0.15, box.h * 0.36) * Math.max(0.8, k);
    if (r < 22) return out;
    var fill = on(pal, pal.a1) ? pal.a1 : pal.a2, ink = K.contrastOn(fill);
    if (w.large) {
      var cx = Math.max(f.x + r, box.x - r * 0.35), cy = Math.min(f.y + f.h - r, box.y + box.h - r * 0.9);
      K.seal(sh, cx, cy, r, ['LARGE', 'PRINT'], fill, ink, { ring: true });
      out.push({ x: cx - r, y: cy - r, w: r * 2, h: r * 2 });
    }
    if (w.bonus) {
      var fill2 = on(pal, pal.a2) ? pal.a2 : pal.light, cx2 = Math.min(f.x + f.w - r, box.x + box.w + r * 0.35), cy2 = Math.min(f.y + f.h - r, box.y + box.h - r * 0.9);
      K.seal(sh, cx2, cy2, r * 0.92, ['BONUS', '12 DAYS'], fill2, K.contrastOn(fill2), { points: 14 });
      out.push({ x: cx2 - r, y: cy2 - r, w: r * 2, h: r * 2 });
    }
    return out;
  }

  // A crossword grid of cols x rows with MERRY across and NOEL down, a few black squares.
  function miniGrid(sh, x, y, cs, cols, rows, o) {
    var black = o.black || '#1B1B1B', white = o.white || '#FFFFFF', line = o.line || '#1B1B1B', ink = o.ink || '#1B1B1B';
    var r0 = Math.min(rows - 1, Math.max(2, Math.floor(rows * 0.35))), c0 = Math.max(0, Math.floor((cols - 5) / 2));
    var letters = {};
    'MERRY'.split('').forEach(function (ch, i) { if (c0 + i < cols) letters[r0 + ',' + (c0 + i)] = ch; });
    'NOEL'.split('').forEach(function (ch, i) { var r = r0 - 2 + i; if (r >= 0 && r < rows) letters[r + ',' + (c0 + 1)] = ch; });
    if (rows > r0 + 3 && cols > c0 + 4) 'YES'.split('').forEach(function (ch, i) { letters[(r0 + i) + ',' + (c0 + 4)] = ch; });
    sh.rect(x - cs * 0.12, y - cs * 0.12, cols * cs + cs * 0.24, rows * cs + cs * 0.24, line);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var k = r + ',' + c, isBlack = !letters[k] && ((r * 7 + c * 3 + (o.seed || 0)) % 5 === 0 || (r * 3 + c * 5) % 11 === 0);
        sh.rect(x + c * cs + 0.6, y + r * cs + 0.6, cs - 1.2, cs - 1.2, isBlack ? black : white);
        if (letters[k] && cs * 0.6 >= 7) sh.text(letters[k], x + c * cs + cs / 2, y + r * cs + cs * 0.72, cs * 0.6, 'sansBold', ink, { align: 'center' });
      }
    }
    return { x: x, y: y, w: cols * cs, h: rows * cs };
  }

  function hollySprig(sh, cx, cy, s, leaf, berry) {
    sh.poly(K.leafPts(cx - s * 0.24, cy, s * 0.52, s * 0.22, -14), leaf);
    sh.poly(K.leafPts(cx + s * 0.24, cy, s * 0.52, s * 0.22, 14), leaf);
    sh.poly(K.leafPts(cx, cy - s * 0.12, s * 0.46, s * 0.2, 90), K.mix(leaf, '#000000', 0.15));
    [[-0.07, -0.02], [0.07, -0.02], [0, 0.09]].forEach(function (d) { sh.circle(cx + d[0] * s, cy + d[1] * s, s * 0.075, berry); });
  }

  function flame(sh, cx, base, fw, fh, color, core) {
    var pts = [];
    for (var i = 0; i <= 20; i++) {
      var t = i / 20 * Math.PI * 2, s = Math.sin(t), c = Math.cos(t);
      pts.push(cx + s * fw * (1 - 0.2 * c), base - fh * 0.45 + c * fh * (c < 0 ? 0.55 : 0.45));
    }
    sh.poly(pts, color);
    if (core) sh.ellipse(cx, base - fh * 0.3, fw * 0.4, fh * 0.22, core);
  }

  var F = {};

  // ---------- Cozy ----------
  // The bestseller: the title on a cream card in a red frame dotted with marquee bulbs, a
  // crossword grid under it, a LARGE PRINT starburst.
  F.marquee = function (sh, f, w, pal, opt, k) {
    var rib = on(pal, pal.a1) ? pal.a1 : pal.a2;
    var bottom = K.flow(sh, f, w, { kind: 'ribbon', fill: rib, color: K.contrastOn(rib) }, { color: pal.ink });
    var start = sh.items.length, pad = f.w * 0.085, frame = on(pal, pal.a1) ? pal.a1 : pal.dark, bulb = pal.a2;
    var tO = { colors: [pal.cardInk, K.visible(pal.card, pal.a1, pal.cardInk)], max: f.w * 0.135, font: 'sansBold', lines: 4 };
    var inW = f.w - pad * 2;
    var tH = K.measure(sh, function () { return title(sh, f, w, pal, k, 0, Object.assign({ x: f.x + pad, w: inW }, tO)); });
    var boxH = tH + pad * 1.6, y = f.y;
    sh.rrect(f.x, y, f.w, boxH, pad * 0.6, frame);
    sh.rrect(f.x + pad * 0.45, y + pad * 0.45, f.w - pad * 0.9, boxH - pad * 0.9, pad * 0.35, pal.card);
    // bulbs round the frame
    var per = f.w * 2 + boxH * 2, n = Math.max(16, Math.round(per / (pad * 0.95))), step = per / n;
    for (var i = 0; i < n; i++) {
      var d = i * step + step / 2, bx, by, inset = pad * 0.225;
      if (d < f.w) { bx = f.x + d; by = y + inset; }
      else if (d < f.w + boxH) { bx = f.x + f.w - inset; by = y + d - f.w; }
      else if (d < f.w * 2 + boxH) { bx = f.x + f.w - (d - f.w - boxH); by = y + boxH - inset; }
      else { bx = f.x + inset; by = y + boxH - (d - f.w * 2 - boxH); }
      bx = Math.max(f.x + inset, Math.min(f.x + f.w - inset, bx)); by = Math.max(y + inset, Math.min(y + boxH - inset, by));
      sh.circle(bx, by, pad * 0.16, K.mix(bulb, '#FFFFFF', 0.35));
      sh.circle(bx, by, pad * 0.1, bulb);
    }
    title(sh, f, w, pal, k, y + pad * 0.8, Object.assign({ x: f.x + pad, w: inW }, tO));
    y += boxH + f.w * 0.05;
    // the grid below, as big as the room allows
    var room = bottom - y - f.w * 0.05, cols = 9, cs = Math.min(f.w * 0.7 / cols, room / 7.2);
    var fits = cs * 7 >= f.w * 0.3;
    var rows = Math.max(4, Math.min(8, Math.floor(room / cs))), gx = f.cx - cols * cs / 2;
    var g = miniGrid(sh, gx, y + (room - rows * cs) / 2, cs, cols, rows, { black: pal.dark, line: pal.dark, ink: '#1B1B1B' });
    var av = [{ x: g.x - 4, y: g.y - 4, w: g.w + 8, h: g.h + 8 }].concat(seals(sh, f, w, pal, g, k));
    var used = Math.max(y + room, g.y + g.h);
    var dy = center(sh, start, f.y, bottom, used, 0.4);
    return { fits: fits, avoid: moved(av, dy).concat([{ x: f.x, y: f.y + dy, w: f.w, h: boxH }]), confetti: { colors: [snowColor(pal), pal.a2], n: 28, kinds: ['star', 'snow', 'snow'] } };
  };

  // Red and black buffalo plaid with a cream label.
  F.plaid = function (sh, f, w, pal, opt, k) {
    var s = (f.X1 - f.X0) / 7, dark = K.mix(pal.bg, pal.a1, 0.45), darker = K.mix(pal.bg, pal.a1, 0.8);
    for (var y = 0; y < f.H; y += s * 2) sh.rect(f.X0, y + s, f.X1 - f.X0, s, dark);
    for (var x = f.X0; x < f.X1; x += s * 2) {
      sh.rect(x + s, 0, s, f.H, dark);
      for (var y2 = 0; y2 < f.H; y2 += s * 2) sh.rect(x + s, y2 + s, s, s, darker);
    }
    var bottom = K.footer(sh, f, w, { color: pal.ink, band: K.mix(pal.a1, '#000000', 0.2) });
    var pad = f.w * 0.08, inW = f.w - pad * 2, start = sh.items.length;
    var tO = { x: f.x + pad, w: inW, colors: [pal.cardInk], font: 'serifBold', max: f.w * 0.13 };
    var sprig = f.w * 0.22;
    var tH = K.measure(sh, function () { return title(sh, f, w, pal, k, 0, tO); });
    var sm = w.sub ? K.subLines(w.sub, { kind: 'plain', w: inW }, f) : { h: 0 };
    var cardH = sprig * 0.75 + tH + (w.sub ? f.w * 0.05 + sm.h : 0) + pad * 1.4;
    var avail = bottom - f.y - f.w * 0.04;
    var cy = f.y + Math.max(0, (avail - cardH) / 2);
    sh.rrect(f.x, cy, f.w, cardH, pad * 0.5, pal.card);
    sh.rframe(f.x + pad * 0.3, cy + pad * 0.3, f.w - pad * 0.6, cardH - pad * 0.6, pad * 0.35, K.mix(pal.card, pal.cardInk, 0.5), 1);
    hollySprig(sh, f.cx, cy + pad * 0.7 + sprig * 0.2, sprig, pal.a3 === pal.title || !on({ bg: pal.card }, pal.a3) ? '#2F6B3A' : pal.a3, '#C8102E');
    var ty = title(sh, f, w, pal, k, cy + pad * 0.7 + sprig * 0.55, tO);
    if (w.sub) K.subtitle(sh, f, w.sub, ty + f.w * 0.04, { kind: 'plain', color: K.mix(pal.cardInk, pal.card, 0.15), w: inW });
    return { fits: cardH <= avail };
  };

  // A mug of cocoa with steam beside a crossword.
  F.mug = function (sh, f, w, pal, opt, k) {
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'plain', color: pal.ink }, foot: { color: pal.ink },
      title: { colors: [pal.title, pal.ink], font: 'serifBold' },
      maxH: f.w * 0.82, minH: f.w * 0.5,
      art: function (y, h) {
        var cs = Math.min(h * 0.75 / 7, f.w * 0.6 / 7), gx = f.x + f.w - cs * 7, gy = y + h - cs * 7 - h * 0.04;
        var g = miniGrid(sh, gx, gy, cs, 7, 7, { black: pal.dark, line: pal.dark, seed: 2 });
        var mw = Math.min(f.w * 0.42, h * 0.5), mh = mw * 1.0, mx = f.x + f.w * 0.05, my = y + h - mh - h * 0.02;
        var cup = on(pal, pal.light) ? pal.light : pal.card, rim = pal.a1;
        sh.ring(mx + mw, my + mh * 0.45, mh * 0.22, cup, mw * 0.09, mh * 0.26);
        sh.rrect(mx, my, mw, mh, mw * 0.14, cup);
        sh.rect(mx, my + mh * 0.25, mw, mh * 0.16, rim);
        sh.ellipse(mx + mw / 2, my + mw * 0.02, mw / 2, mw * 0.1, K.mix(cup, '#000000', 0.12));
        sh.ellipse(mx + mw / 2, my + mw * 0.03, mw * 0.44, mw * 0.075, '#6B3E26');
        [[0.32, -0.02], [0.52, 0.0], [0.66, -0.03]].forEach(function (m) { sh.rrect(mx + mw * m[0] - mw * 0.07, my + mw * m[1] - mw * 0.03, mw * 0.14, mw * 0.09, mw * 0.03, '#FFFFFF'); });
        var steam = K.mix(pal.bg, pal.light, 0.45);
        [0.3, 0.5, 0.7].forEach(function (t, i) {
          var pts = [], x0 = mx + mw * t, top = Math.max(y, my - mh * 0.75);
          for (var j = 0; j <= 14; j++) pts.push(x0 + Math.sin(j / 14 * Math.PI * 2 + i) * mw * 0.05, my - mw * 0.08 - (my - mw * 0.08 - top) * j / 14);
          sh.path(pts, steam, Math.max(1.2, mw * 0.03));
        });
        hollySprig(sh, mx + mw * 0.5, my + mh * 0.65, mw * 0.45, '#2F6B3A', '#C8102E');
        return { avoid: [{ x: g.x - 4, y: g.y - 4, w: g.w + 8, h: g.h + 8 }, { x: mx - 4, y: my - mh * 0.8, w: mw * 1.3, h: mh * 1.8 }] };
      }
    });
    res.confetti = { colors: [snowColor(pal)], n: 26, kinds: ['snow', 'flake'] };
    return res;
  };

  // A frosted window at night, snow outside.
  F.window = function (sh, f, w, pal, opt, k) {
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'plain', color: pal.ink }, foot: { color: pal.ink },
      title: { colors: [pal.title, pal.ink], font: 'serifBold' },
      maxH: f.w * 0.95, minH: f.w * 0.55, artTop: false,
      art: function (y, h) {
        var ww = Math.min(f.w * 0.82, h * 0.82), wh = h * 0.92, wx = f.cx - ww / 2, fr = ww * 0.06, wood = on(pal, pal.card) ? pal.card : pal.light;
        var night = K.mix(pal.dark, '#0A1430', 0.4);
        sh.rrect(wx, y, ww, wh, ww * 0.5, wood);
        sh.poly(archPts(wx + fr, y + fr, ww - fr * 2, wh - fr * 2), night);
        var rng = CX.util.makeRng('win' + ww);
        for (var i = 0; i < 46; i++) sh.circle(wx + fr * 1.5 + rng.next() * (ww - fr * 3), y + fr + ww * 0.3 + rng.next() * (wh - fr * 2 - ww * 0.35), 0.8 + rng.next() * 1.8, '#FFFFFF');
        // a moon and a tree outside
        sh.circle(wx + ww * 0.7, y + ww * 0.42, ww * 0.07, '#FFF4C4');
        sh.poly([wx + ww * 0.3, y + wh * 0.42, wx + ww * 0.42, y + wh - fr * 1.6, wx + ww * 0.18, y + wh - fr * 1.6], '#1E4D2B');
        sh.rect(wx + fr, y + wh * 0.5 - fr * 0.25, ww - fr * 2, fr * 0.5, wood);
        sh.rect(f.cx - fr * 0.25, y + fr, fr * 0.5, wh - fr * 2, wood);
        sh.rrect(wx - fr * 0.8, y + wh - fr * 0.5, ww + fr * 1.6, fr * 1.4, fr * 0.4, K.mix(wood, '#000000', 0.12));
        sh.ellipse(f.cx, y + wh - fr * 0.5, ww * 0.52, fr * 0.6, '#FFFFFF');
        // a candle on the sill
        var cx = wx + ww * 0.82, base = y + wh - fr * 0.6;
        sh.rect(cx - fr * 0.45, base - fr * 2.6, fr * 0.9, fr * 2.6, pal.a1 === pal.light ? '#C8102E' : pal.a1);
        flame(sh, cx, base - fr * 2.7, fr * 0.32, fr * 1.1, '#F2C14E', '#FFF4C4');
        return { avoid: [{ x: wx - fr, y: y - fr, w: ww + fr * 2, h: wh + fr * 2 }] };
      }
    });
    res.confetti = { colors: [snowColor(pal)], n: 30, kinds: ['snow', 'flake', 'snow'] };
    return res;
  };
  function archPts(x, y, w, h) {
    var pts = [], r = w / 2;
    for (var i = 0; i <= 18; i++) { var a = Math.PI + i / 18 * Math.PI; pts.push(x + r + Math.cos(a) * r, y + r + Math.sin(a) * r); }
    pts.push(x + w, y + h, x, y + h);
    return pts;
  }

  // The four Advent candles in a ring of greenery.
  F.candles = function (sh, f, w, pal, opt, k) {
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'box', fill: pal.card, color: pal.cardInk }, foot: { color: pal.ink },
      title: { colors: [pal.title, pal.ink], font: 'serifBold', max: f.w * 0.15 },
      maxH: f.w * 0.75, minH: f.w * 0.45,
      art: function (y, h) {
        var cw = Math.min(f.w * 0.12, h * 0.2), gap = cw * 0.9, total = cw * 4 + gap * 3, x0 = f.cx - total / 2;
        var wax = on(pal, pal.light) ? pal.light : pal.card, purple = ['#6A3D9A', '#6A3D9A', '#E58FB0', '#6A3D9A'];
        var base = y + h - h * 0.14;
        for (var i = 0; i < 4; i++) {
          var ch = h * (0.62 - Math.abs(i - 1.5) * 0.06), cx = x0 + i * (cw + gap) + cw / 2;
          sh.rrect(cx - cw / 2, base - ch, cw, ch, cw * 0.12, opt.wax === 'white' ? wax : purple[i]);
          sh.rect(cx - cw * 0.06, base - ch - cw * 0.3, cw * 0.12, cw * 0.32, '#3A2A1A');
          flame(sh, cx, base - ch - cw * 0.25, cw * 0.28, cw * 0.95, '#F2C14E', '#FFF4C4');
        }
        var leaf = on(pal, '#2F6B3A') ? '#2F6B3A' : '#4C8C5A';
        for (var j = 0; j < 14; j++) {
          var lx = f.cx - total * 0.62 + j / 13 * total * 1.24;
          sh.poly(K.leafPts(lx, base + h * 0.04 + (j % 2) * h * 0.035, h * 0.16, h * 0.06, (j % 2 ? 20 : -20)), leaf);
        }
        [0.1, 0.35, 0.6, 0.88].forEach(function (t) { sh.circle(f.cx - total * 0.55 + t * total * 1.1, base + h * 0.06, h * 0.022, '#C8102E'); });
        return { avoid: [{ x: x0 - cw, y: y, w: total + cw * 2, h: h }] };
      }
    });
    res.confetti = { colors: [pal.a2, snowColor(pal)], n: 18, kinds: ['star', 'snow'] };
    return res;
  };

  // ---------- Classic ----------
  // A cream card in a double frame, holly in the corners, the day count in a medallion.
  F.vintage = function (sh, f, w, pal, opt, k) {
    var c1 = pal.title, c2 = pal.a1;
    var fx = f.x - 0.12 * PT, fy = f.y - 0.12 * PT, fw = f.w + 0.24 * PT, fh = f.h + 0.24 * PT;
    sh.frame(fx, fy, fw, fh, c1, 2.2);
    sh.frame(fx + 5, fy + 5, fw - 10, fh - 10, c2, 0.9);
    [[fx + 5, fy + 5], [fx + fw - 5, fy + 5], [fx + 5, fy + fh - 5], [fx + fw - 5, fy + fh - 5]].forEach(function (p) { hollySprig(sh, p[0], p[1], f.w * 0.16, pal.a1, pal.title); });
    var inner = Object.assign({}, f, { x: f.x + f.w * 0.06, w: f.w * 0.88, y: f.y + f.w * 0.1, h: f.h - f.w * 0.16 });
    inner.cx = f.cx;
    var res = artFlow(sh, inner, w, pal, k, {
      sub: { kind: 'line', color: pal.ink, font: 'serif', rule: c2 }, foot: { color: pal.ink, font: 'serif', upper: true, lsK: 0.12 },
      title: { colors: [pal.title], font: 'serifBold', max: f.w * 0.13 },
      maxH: f.w * 0.5, minH: f.w * 0.3,
      art: function (y, h) {
        var r = Math.min(h / 2, f.w * 0.22), cy = y + h / 2;
        sh.circle(f.cx, cy, r, c1);
        sh.ring(f.cx, cy, r * 0.86, pal.bg, Math.max(1, r * 0.04));
        var tp = { num: String(w.days), suf: '' }, n = { color: pal.bg, noSuf: true, font: 'serifBold' };
        var size = Math.min(r * 1.05 / K.numW(tp, 1, n), r * 0.75 / K.capH('serifBold'));
        K.bigNum(sh, tp, f.cx, cy - size * K.capH('serifBold') * 0.72, size, n);
        var ls = Math.max(7, r * 0.17);
        sh.text('DAYS', f.cx, cy + r * 0.58, ls, 'sansBold', pal.bg, { align: 'center', ls: ls * 0.2 });
        return { avoid: [{ x: f.cx - r, y: cy - r, w: r * 2, h: r * 2 }] };
      }
    });
    return res;
  };

  // The title inside a holly wreath.
  F.wreath = function (sh, f, w, pal, opt, k) {
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: pal.ink }, { color: pal.ink });
    var start = sh.items.length, avail = bottom - f.y - f.w * 0.03;
    var R = Math.min(f.w * 0.5, avail / 2) * Math.min(1, 0.85 + k * 0.15), cy = f.y + R;
    var leaf = on(pal, '#2F6B3A') ? '#2F6B3A' : '#6FA77A', leaf2 = K.mix(leaf, '#000000', 0.25), card = pal.card;
    sh.circle(f.cx, cy, R * 0.8, card);
    for (var i = 0; i < 40; i++) {
      var a = i / 40 * 360, rad = a * Math.PI / 180, rr = R * (0.86 + (i % 3) * 0.04);
      sh.poly(K.leafPts(f.cx + Math.cos(rad) * rr, cy + Math.sin(rad) * rr, R * 0.26, R * 0.1, a + 70 + (i % 2) * 40), i % 2 ? leaf : leaf2);
    }
    for (var j = 0; j < 9; j++) { var b = (j / 9 * 360 + 20) * Math.PI / 180; sh.circle(f.cx + Math.cos(b) * R * 0.9, cy + Math.sin(b) * R * 0.9, R * 0.035, '#C8102E'); }
    // a bow at the bottom
    var bx = f.cx, by = cy + R * 0.9, bs = R * 0.2, bow = pal.a1 === pal.light ? '#C8102E' : pal.a1;
    sh.poly([bx, by, bx - bs * 1.3, by - bs * 0.7, bx - bs * 1.3, by + bs * 0.7], bow);
    sh.poly([bx, by, bx + bs * 1.3, by - bs * 0.7, bx + bs * 1.3, by + bs * 0.7], bow);
    sh.poly([bx - bs * 0.2, by, bx - bs * 0.8, by + bs * 1.8, bx - bs * 0.3, by + bs * 1.6], bow);
    sh.poly([bx + bs * 0.2, by, bx + bs * 0.8, by + bs * 1.8, bx + bs * 0.3, by + bs * 1.6], bow);
    sh.circle(bx, by, bs * 0.35, K.mix(bow, '#000000', 0.2));
    // the title, as big as fits inside the ring
    var tw = R * 1.22, maxH = R * 1.05, tO = { x: f.cx - tw / 2, w: tw, colors: [pal.cardInk, K.visible(card, pal.a1, pal.title, pal.cardInk)], font: 'serifBold', max: R * 0.3, lines: 5, fill: 1.15 };
    var kk = 1, th = 0;
    for (var t = 0; t < 16; t++) { th = K.measure(sh, function () { return title(sh, f, w, pal, kk, 0, tO); }); if (th <= maxH) break; kk *= 0.92; }
    title(sh, f, w, pal, kk, cy - th / 2 - R * 0.04, tO);
    var used = cy + R + bs * 1.8;
    var dy = center(sh, start, f.y, bottom, used, 0.4);
    return { fits: th <= maxH && used <= bottom + 1, avoid: [{ x: f.cx - R * 1.1, y: f.y + dy - R * 0.1, w: R * 2.2, h: R * 2.3 }], confetti: { colors: [snowColor(pal)], n: 22, kinds: ['snow', 'flake'] } };
  };

  // Snowflakes on a night sky, the title between fine rules.
  F.snowflakes = function (sh, f, w, pal, opt, k) {
    var gold = pal.title;
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'line', color: pal.ink, font: 'serif', rule: gold }, foot: { color: pal.ink, upper: true, lsK: 0.14, font: 'sans' },
      title: { colors: [gold], font: 'serifBold', max: f.w * 0.14 },
      maxH: f.w * 0.62, minH: f.w * 0.34, artTop: true,
      art: function (y, h) {
        var r = Math.min(h * 0.42, f.w * 0.3), cy = y + h / 2;
        K.flake(sh, f.cx, cy, r, gold, 0);
        K.flake(sh, f.cx - r * 1.35, cy + r * 0.45, r * 0.38, pal.ink, 15);
        K.flake(sh, f.cx + r * 1.35, cy - r * 0.35, r * 0.32, pal.ink, 25);
        sh.line(f.x + f.w * 0.1, y + h, f.x + f.w * 0.9, y + h, gold, 1);
        return { avoid: [{ x: f.cx - r * 1.8, y: cy - r * 1.1, w: r * 3.6, h: r * 2.2 }] };
      }
    });
    res.confetti = { colors: [K.mix(pal.bg, pal.ink, 0.55), K.mix(pal.bg, gold, 0.6)], n: 34, kinds: ['flake', 'snow', 'snow'] };
    return res;
  };

  // A huge day count: "24" with DAYS TO CHRISTMAS under it.
  F.bignum = function (sh, f, w, pal, opt, k) {
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'ribbon', fill: on(pal, pal.a2) ? pal.a2 : pal.light, color: pal.dark }, foot: { color: pal.ink },
      title: { colors: [pal.ink, pal.title], font: 'sansBold', upper: true, max: f.w * 0.12, lsK: 0.02 },
      maxH: f.w * 0.75, minH: f.w * 0.42,
      art: function (y, h) {
        var tp = { num: String(w.days), suf: '' }, n = { color: pal.title, noSuf: true, font: 'serifBold', fx: { shadow: { color: pal.dark, dx: 0.025, dy: 0.03 } } };
        var lab = 'DAYS TO CHRISTMAS', ls = Math.min(f.w * 0.07, K.fitLine(lab, 'sansBold', f.w * 0.8, 30, 0.18));
        var size = Math.min(f.w * 0.8 / K.numW(tp, 1, n), (h - ls * 2.2) / (K.capH('serifBold') * 1.06));
        var top = y + Math.max(0, (h - size * K.capH('serifBold') * 1.06 - ls * 2.2) / 2);
        var r = K.bigNum(sh, tp, f.cx, top, size, n);
        sh.text(lab, f.cx, r.bottom + ls * 1.6, ls, 'sansBold', pal.ink, { align: 'center', ls: ls * 0.18 });
        hollySprig(sh, r.x + r.w + size * 0.02, r.top + size * 0.05, size * 0.3, '#2F6B3A', on(pal, '#C8102E') ? '#C8102E' : '#FFFFFF');
        return { avoid: [{ x: r.x - 6, y: r.top - 6, w: r.w + size * 0.25, h: r.bottom - r.top + ls * 2 }] };
      }
    });
    res.confetti = { colors: [snowColor(pal), pal.a2], n: 26, kinds: ['snow', 'star'] };
    return res;
  };

  // A big crossword grid with the season's words filled in.
  F.gridpage = function (sh, f, w, pal, opt, k) {
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'box', fill: pal.a1, color: K.contrastOn(pal.a1) }, foot: { color: pal.ink },
      title: { colors: [pal.title, pal.ink], font: 'sansBold', max: f.w * 0.14 },
      maxH: f.w * 0.9, minH: f.w * 0.5,
      art: function (y, h) {
        var cols = 9, rows = Math.max(5, Math.min(9, Math.floor(h / (f.w * 0.9 / cols)))), cs = Math.min(f.w * 0.9 / cols, h / rows);
        var g = miniGrid(sh, f.cx - cols * cs / 2, y + (h - rows * cs) / 2, cs, cols, rows, { black: '#1B1B1B', line: '#1B1B1B', seed: 4 });
        // a pencil lying across the corner
        var px = g.x + g.w * 0.62, py = g.y + g.h * 0.9, L = g.w * 0.5, a = -32 * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), pw = cs * 0.38;
        function at(t, o) { return [px + ca * t - sa * o, py + sa * t + ca * o]; }
        var body = [].concat(at(0, -pw / 2), at(L, -pw / 2), at(L, pw / 2), at(0, pw / 2));
        sh.poly(body, '#F2C14E');
        sh.poly([].concat(at(L, -pw / 2), at(L + pw * 0.6, -pw / 2), at(L + pw * 0.6, pw / 2), at(L, pw / 2)), '#E9A6B7');
        sh.poly([].concat(at(0, -pw / 2), at(-pw * 1.1, 0), at(0, pw / 2)), '#F3D9B1');
        sh.poly([].concat(at(-pw * 0.75, -pw * 0.16), at(-pw * 1.1, 0), at(-pw * 0.75, pw * 0.16)), '#333333');
        var av = [{ x: g.x - 4, y: g.y - 4, w: g.w + 8, h: g.h + 8 }].concat(seals(sh, f, w, pal, g, k));
        return { avoid: av };
      }
    });
    res.confetti = { colors: festive(pal), n: 20, kinds: ['star', 'snow'] };
    return res;
  };

  // ---------- Festive ----------
  // Advent calendar doors, numbered, under the title.
  F.doors = function (sh, f, w, pal, opt, k) {
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'plain', color: pal.ink }, foot: { color: pal.ink },
      title: { colors: [pal.title, pal.ink], font: 'sansBold', max: f.w * 0.14 },
      maxH: f.w * 1.1, minH: f.w * 0.55,
      art: function (y, h) {
        var n = w.days, cols = n === 12 ? 3 : n === 25 ? 5 : 4, rows = Math.ceil(n / cols);
        var gap = f.w * 0.025, dw = Math.min((f.w * 0.96 - gap * (cols - 1)) / cols, (h - gap * (rows - 1)) / rows * 1.25), dh = dw * 0.8;
        var tw = cols * dw + (cols - 1) * gap, th = rows * dh + (rows - 1) * gap, x0 = f.cx - tw / 2, y0 = y + (h - th) / 2;
        var colors = [pal.card, K.mix(pal.card, pal.a2, 0.35), K.mix(pal.card, pal.a1, 0.2)];
        sh.rrect(x0 - gap, y0 - gap, tw + gap * 2, th + gap * 2, gap, pal.dark);
        var order = [];
        for (var i = 0; i < n; i++) order.push(i + 1);
        CX.util.makeRng('doors' + n).shuffle(order);
        for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
          var idx = r * cols + c;
          if (idx >= n) continue;
          // a short last row sits in the middle
          var x = x0 + c * (dw + gap) + (r === rows - 1 ? (rows * cols - n) * (dw + gap) / 2 : 0), yy = y0 + r * (dh + gap), fill = colors[(r + c * 2) % 3], ink = pal.cardInk;
          sh.rrect(x, yy, dw, dh, dw * 0.08, fill);
          var ns = Math.max(7, Math.min(dh * 0.5, dw * 0.4));
          sh.text(String(order[idx]), x + dw / 2, yy + dh / 2 + ns * 0.36, ns, 'serifBold', ink, { align: 'center' });
          sh.circle(x + dw * 0.86, yy + dh * 0.5, Math.max(1, dw * 0.035), pal.a2 === pal.card ? pal.a1 : pal.a2);
        }
        return { avoid: [{ x: x0 - gap, y: y0 - gap, w: tw + gap * 2, h: th + gap * 2 }] };
      }
    });
    res.confetti = { colors: [snowColor(pal), pal.a2], n: 24, kinds: ['snow', 'star', 'flake'] };
    return res;
  };

  // A Christmas tree made of crossword squares, a star on top.
  F.tree = function (sh, f, w, pal, opt, k) {
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'ribbon', fill: on(pal, pal.a1) ? pal.a1 : pal.title, color: K.contrastOn(on(pal, pal.a1) ? pal.a1 : pal.title) }, foot: { color: pal.ink },
      title: { colors: [pal.title, pal.ink], font: 'sansBold', max: f.w * 0.14 },
      maxH: f.w * 1.0, minH: f.w * 0.55,
      art: function (y, h) {
        var rows = 7, cs = Math.min(f.w * 0.9 / (rows * 2 - 1), h / (rows + 2.2)), top = y + cs * 1.2;
        var word = 'NOELJOYSTARMERRYPEACEGIFTSNOW', li = 0, green = on(pal, '#2F6B3A') ? '#2F6B3A' : '#3C7D4C';
        sh.poly(K.starPts(f.cx, y + cs * 0.55, cs * 0.75, cs * 0.32, 5, -90), '#F2C14E');
        for (var r = 0; r < rows; r++) {
          var n = r * 2 + 1, x0 = f.cx - n * cs / 2, yy = top + r * cs;
          sh.rect(x0 - 1, yy - 1, n * cs + 2, cs + 2, green);
          for (var c = 0; c < n; c++) {
            var lit = (r * 5 + c * 3) % 7 === 0, filled = (r + c) % 3 === 1;
            sh.rect(x0 + c * cs + 0.8, yy + 0.8, cs - 1.6, cs - 1.6, lit ? (c % 2 ? '#C8102E' : '#F2C14E') : '#FFFFFF');
            if (filled && !lit && cs * 0.58 >= 7) sh.text(word[li++ % word.length], x0 + c * cs + cs / 2, yy + cs * 0.72, cs * 0.58, 'sansBold', green, { align: 'center' });
          }
        }
        var ty = top + rows * cs;
        sh.rect(f.cx - cs * 0.6, ty, cs * 1.2, cs * 0.9, '#6B3E26');
        return { avoid: [{ x: f.cx - rows * cs, y: y, w: rows * cs * 2, h: rows * cs + cs * 2.2 }] };
      }
    });
    res.confetti = { colors: [snowColor(pal)], n: 30, kinds: ['snow', 'flake', 'snow'] };
    return res;
  };

  // Baubles hanging from the top edge on ribbons.
  F.baubles = function (sh, f, w, pal, opt, k) {
    var cols = festive(pal).concat(['#C8102E', '#F2C14E']).filter(function (c) { return on(pal, c); });
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'box', fill: pal.card, color: pal.cardInk }, foot: { color: pal.ink },
      title: { colors: [pal.title, pal.ink], font: 'serifBold', max: f.w * 0.14 },
      maxH: f.w * 0.7, minH: f.w * 0.38, artTop: true, part: 0.2,
      art: function (y, h) {
        var n = 5, xs = [0.1, 0.3, 0.5, 0.7, 0.9], drops = [0.55, 0.85, 0.45, 0.75, 0.6], av = [];
        for (var i = 0; i < n; i++) {
          var r = Math.min(f.w * 0.085, h * 0.2) * (i % 2 ? 0.9 : 1.1), cx = f.x + xs[i] * f.w, cy = y + h * drops[i] - r;
          cx = Math.max(f.x + r, Math.min(f.x + f.w - r, cx));
          sh.line(cx, 0, cx, cy - r * 1.1, K.mix(pal.bg, pal.ink, 0.5), 1);
          sh.rect(cx - r * 0.25, cy - r * 1.2, r * 0.5, r * 0.3, '#C9A227');
          var c = cols[i % cols.length];
          sh.circle(cx, cy, r, c);
          sh.rect(cx - r * 0.98, cy - r * 0.12, r * 1.96, r * 0.24, K.mix(c, '#FFFFFF', 0.35));
          sh.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.18, r * 0.28, K.mix(c, '#FFFFFF', 0.6));
          av.push({ x: cx - r, y: cy - r * 1.3, w: r * 2, h: r * 2.3 });
        }
        return { avoid: av };
      }
    });
    res.confetti = { colors: [snowColor(pal)], n: 24, kinds: ['snow', 'star'], box: { x: f.X0, y: f.H * 0.35, w: f.X1 - f.X0, h: f.H * 0.65 } };
    return res;
  };

  // A wrapped present with a big bow.
  F.gift = function (sh, f, w, pal, opt, k) {
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'plain', color: pal.ink }, foot: { color: pal.ink },
      title: { colors: [pal.title, pal.ink], font: 'sansBold', max: f.w * 0.14 },
      maxH: f.w * 0.8, minH: f.w * 0.42,
      art: function (y, h) {
        var bw = Math.min(f.w * 0.7, h * 1.1), bh = Math.min(bw * 0.62, h * 0.66), bx = f.cx - bw / 2, by = y + h - bh;
        // red or gold paper reads as a present on any background except its own color
        var box = pal.a1 !== pal.bg && Math.abs(K.lum(pal.a1) - K.lum(pal.bg)) > 0.04 ? pal.a1 : pal.card, rib = on({ bg: box }, pal.a2) ? pal.a2 : pal.light, rw = bw * 0.12;
        sh.rect(bx, by, bw, bh, box);
        sh.rect(bx - bw * 0.04, by - bh * 0.18, bw * 1.08, bh * 0.22, K.mix(box, '#000000', 0.12));
        sh.rect(f.cx - rw / 2, by - bh * 0.18, rw, bh * 1.18, rib);
        sh.rect(bx, by + bh * 0.45, bw, rw * 0.8, rib);
        var top = by - bh * 0.18, ls = bw * 0.28;
        sh.poly([f.cx, top, f.cx - ls, top - ls * 0.65, f.cx - ls * 0.95, top + ls * 0.05], rib);
        sh.poly([f.cx, top, f.cx + ls, top - ls * 0.65, f.cx + ls * 0.95, top + ls * 0.05], rib);
        sh.circle(f.cx, top, rw * 0.55, K.mix(rib, '#000000', 0.15));
        // a gift tag with a mini grid
        var cs = bw * 0.055;
        miniGrid(sh, bx + bw * 0.62, by + bh * 0.58 + rw * 0.4, cs, 5, 4, { black: '#1B1B1B', seed: 1 });
        return { avoid: [{ x: bx - bw * 0.05, y: top - ls * 0.7, w: bw * 1.1, h: bh + bh * 0.2 + ls * 0.7 }] };
      }
    });
    res.confetti = { colors: [snowColor(pal), pal.a2], n: 28, kinds: ['snow', 'star', 'flake'] };
    return res;
  };

  // Candy cane stripes round the edge of a white cover.
  F.candycane = function (sh, f, w, pal, opt, k) {
    var red = pal.a1, band = 0.3 * PT, X0 = f.X0, X1 = f.X1, H = f.H, s = band * 0.9;
    // stripes in four bands, out to the bleed
    sh.rect(X0, 0, X1 - X0, H, '#FFFFFF');
    for (var x = X0 - band * 2; x < X1 + band; x += s * 2) {
      sh.poly([x, 0, x + s, 0, x + s + band + f.B, band + f.B, x + band + f.B, band + f.B], red);
      sh.poly([x, H - band - f.B, x + s, H - band - f.B, x + s + band + f.B, H, x + band + f.B, H], red);
    }
    for (var y = -band * 2; y < H + band; y += s * 2) {
      sh.poly([X0, y, X0 + band + f.B, y + band + f.B, X0 + band + f.B, y + band + f.B + s, X0, y + s], red);
      sh.poly([X1 - band - f.B, y, X1, y + band + f.B, X1, y + band + f.B + s, X1 - band - f.B, y + s], red);
    }
    sh.rect(X0 + band + f.B, band + f.B, X1 - X0 - (band + f.B) * 2, H - (band + f.B) * 2, pal.bg);
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'box', fill: red, color: K.contrastOn(red) }, foot: { color: pal.ink },
      title: { colors: [pal.title, pal.a2], font: 'serifBold', max: f.w * 0.14 },
      maxH: f.w * 0.55, minH: f.w * 0.3,
      art: function (y, h) {
        var ch = h * 0.9, cw = ch * 0.4, lw = Math.max(3, cw * 0.28), av = [];
        [-1, 1].forEach(function (side) {
          // a stem going up, the hook curling outward, a short tail
          var hx = f.cx + side * cw * 0.9, hy = y + cw / 2 + lw / 2, sx = hx - side * cw / 2, pts = [], i;
          for (i = 0; i <= 10; i++) pts.push(sx, y + ch - lw / 2 - (y + ch - lw / 2 - hy) * i / 10);
          for (i = 1; i <= 16; i++) { var a = Math.PI - i / 16 * Math.PI; pts.push(hx + side * Math.cos(a) * cw / 2, hy - Math.sin(a) * cw / 2); }
          for (i = 1; i <= 3; i++) pts.push(hx + side * cw / 2, hy + cw * 0.1 * i);
          for (var j = 0; j < pts.length - 2; j += 2) sh.line(pts[j], pts[j + 1], pts[j + 2], pts[j + 3], (j / 2) % 4 < 2 ? red : '#FFFFFF', lw, true);
          av.push({ x: Math.min(sx, hx + side * cw / 2) - lw, y: y, w: cw + lw * 2, h: ch });
        });
        hollySprig(sh, f.cx, y + h * 0.62, h * 0.4, pal.a2, red);
        return { avoid: av };
      }
    });
    return res;
  };

  CX.coverFronts = F;
})(typeof window !== 'undefined' ? window : globalThis);
