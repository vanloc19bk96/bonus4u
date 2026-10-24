/*
 * The fronts of the cover templates. Each layout draws into the front's safe box
 * f = { x, y, w, h, cx } (every word stays inside it) and may paint shapes out to the bleed:
 * f.X0..f.X1 across, 0..f.H down. A layout gets the sheet, f, the cover's words
 * w = { tp (the title split around the age), sub, author, age, ord, born, year, total, large },
 * the palette, the template's options, a scale k (the cover shrinks k until res.fits) and a
 * seeded random. It returns { fits, avoid (shape boxes kept clear of confetti), confetti }.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var K = CX.cover.kit, PT = K.PT;
  var CAP = 0.66;

  // ---------- helpers ----------
  // Draws fn's shapes under everything drawn since item idx.
  function under(sh, idx, fn) {
    var n = sh.items.length;
    var r = fn();
    var added = sh.items.splice(n);
    Array.prototype.splice.apply(sh.items, [idx, 0].concat(added));
    return r;
  }
  // Centers what was drawn since start (from top down to used) in the space down to bottom.
  function center(sh, start, top, bottom, used, part) {
    var dy = Math.max(0, (bottom - used) * (part == null ? 0.45 : part));
    sh.shift(start, 0, dy);
    return dy;
  }
  function moved(boxes, dy) { return boxes.map(function (b) { return { x: b.x, y: b.y + dy, w: b.w, h: b.h }; }); }
  function inset(f, d) { return Object.assign({}, f, { x: f.x + d, y: f.y + d, w: f.w - 2 * d, h: f.h - 2 * d }); }
  function party(pal) { return [pal.a1, pal.a2, pal.a3, pal.title, pal.light].filter(function (c, i, a) { return a.indexOf(c) === i && Math.abs(K.lum(c) - K.lum(pal.bg)) > 0.12; }); }
  function decades(w) {
    var out = [], d0 = Math.floor(w.born / 10) * 10, d1 = Math.floor(w.year / 10) * 10;
    for (var d = d0; d <= d1; d += 10) out.push(d + 's');
    return out;
  }
  // the age, sized to fit a box w x h (cap height), as bigNum options
  function numIn(tp, bw, bh, n) { return Math.min(bw / K.numW(tp, 1, n), bh / CAP); }

  /*
   * The common shape: the words before the age on top, an illustration in the middle (art(y, h)
   * draws it in the height it is given and returns { avoid }), the words after the age under it,
   * then the subtitle and pen name. The group is centered in the space left.
   */
  function artFlow(sh, f, w, pal, k, o) {
    var bottom = K.flow(sh, f, w, o.sub, o.foot);
    var tp = w.tp, start = sh.items.length, y = f.y, gap = (o.gap || f.w * 0.04) * k;
    var preO = Object.assign({ upper: true, lines: 2, color: pal.ink, lsK: 0.1 }, o.pre || {});
    preO.max = (preO.max || f.w * 0.08) * k;
    if (tp.pre) y = K.textLines(sh, tp.pre, f.x, y, f.w, preO) + gap;
    var postO = Object.assign({ upper: true, lines: 3, fill: 1.25, color: pal.ink }, o.post || {});
    postO.max = (postO.max || f.w * 0.14) * k;
    var postH = tp.post ? K.measure(sh, function () { return K.textLines(sh, tp.post, f.x, 0, f.w, postO); }) + gap : 0;
    var h = Math.min(o.maxH, bottom - y - postH);
    var r = o.art(y, h) || {};
    y += h;
    if (tp.post) y = K.textLines(sh, tp.post, f.x, y + gap, f.w, postO);
    var dy = center(sh, start, f.y, bottom, y);
    return { fits: h >= o.minH, avoid: moved(r.avoid || [], dy) };
  }

  var F = {};

  // ---------- Bold & bright ----------
  F.badge = function (sh, f, w, pal, opt, k) {
    var ribbon = pal.a1 === pal.light ? pal.a2 : pal.a1;
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'ribbon', fill: ribbon }, foot: { color: pal.ink },
      pre: { max: Math.min(30, f.w * 0.09), lsK: 0.12 }, post: { max: f.w * 0.15 },
      maxH: f.w * 0.8 + 14, minH: f.w * 0.52 + 14, gap: f.w * 0.035,
      art: function (y, h) {
        var rad = Math.min(f.w * 0.4, h / 2 - 7), cy = y + h / 2;
        sh.circle(f.cx, cy, rad + 7, pal.light);
        sh.circle(f.cx, cy, rad, pal.title);
        var n = { color: K.contrastOn(pal.title) }, ns = Math.min(rad * 1.55 / K.numW(w.tp, 1, n), rad * 0.95 / CAP);
        K.bigNum(sh, w.tp, f.cx, cy - ns * CAP / 2, ns, n);
        return { avoid: [{ x: f.cx - rad - 9, y: cy - rad - 9, w: rad * 2 + 18, h: rad * 2 + 18 }] };
      }
    });
    res.confetti = { colors: [pal.a1, pal.a2, pal.title, pal.light], n: 46 };
    return res;
  };

  F.bold = function (sh, f, w, pal, opt, k) {
    var ribbon = pal.a1 === pal.light ? pal.a2 : pal.a1;
    var bottom = K.flow(sh, f, w, { kind: 'ribbon', fill: ribbon }, { color: pal.ink });
    K.headline(sh, { x: f.x, y: f.y, w: f.w, h: bottom - f.y }, w.tp, {
      scale: k, pre: { color: pal.ink, lsK: 0.12, size: Math.min(30, f.w * 0.09) },
      num: { color: pal.title, sufColor: pal.ink, wk: 0.96, max: f.h * 0.4 },
      post: { colors: [pal.ink, pal.title], max: f.w * 0.17 }
    });
    return { confetti: { colors: [pal.a1, pal.a2, pal.title, pal.light], n: 40 } };
  };

  F.burst = function (sh, f, w, pal, opt, k) {
    var idx = sh.items.length;
    var bottom = K.flow(sh, f, w, { kind: 'box', fill: pal.light, color: K.visible(pal.light, pal.bg, pal.ink) }, { color: pal.ink });
    var hd = K.headline(sh, { x: f.x, y: f.y, w: f.w, h: bottom - f.y }, w.tp, {
      scale: k, pre: { color: pal.ink, lsK: 0.12, size: Math.min(30, f.w * 0.09) },
      num: { color: pal.title, sufColor: pal.ink, wk: 0.92, max: f.h * 0.36, fx: { shadow: { color: pal.dark, dx: 0.025, dy: 0.03 } } },
      post: { color: pal.ink, max: f.w * 0.15 }
    });
    under(sh, idx, function () {
      var cx = f.cx, cy = (hd.num.top + hd.num.base) / 2, R = Math.max(f.X1 - f.X0, f.H) * 1.3, rays = 32, light = K.mix(pal.bg, pal.light, 0.16);
      for (var j = 0; j < rays; j += 2) {
        var a0 = j / rays * Math.PI * 2, a1 = (j + 1) / rays * Math.PI * 2;
        sh.poly([cx, cy, cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R], light);
      }
    });
    return { confetti: { colors: [pal.a1, pal.a2, pal.light], n: 22 } };
  };

  // Charlie Miller style: a white 3D age in party sunglasses, mixed-case words with shadows.
  F.challenge = function (sh, f, w, pal, opt, k) {
    var sw = { color: pal.dark, dx: 0.03, dy: 0.045 };
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: pal.light }, { color: pal.light });
    var hd = K.headline(sh, { x: f.x, y: f.y, w: f.w, h: bottom - f.y }, w.tp, {
      scale: k,
      pre: { upper: false, color: pal.light, size: f.w * 0.12, fx: { shadow: sw }, gap: 0.2 },
      num: { color: pal.light, sufColor: pal.light, sufLower: true, wk: 0.86, max: f.h * 0.34, fx: { shadow: sw, outline: { color: pal.dark, w: f.w * 0.006 } } },
      post: { upper: false, colors: [pal.light, pal.title], max: f.w * 0.17, fill: 1.35, fx: { shadow: sw }, lead: 0.12 }
    });
    // the sunglasses sit across the top of the digits, tipped a little
    var n = hd.num, dw = K.wid(w.tp.num, n.size, 'sansBold'), gx = n.x + dw * 0.55, gy = n.top + n.size * 0.06;
    var gw = dw * 0.8, lh = n.size * 0.17, lw = gw * 0.43, frame = '#151515';
    var parts = [
      K.rrectPts(gx - gw / 2, gy - lh * 0.15, gw, lh * 0.26, lh * 0.1),
      K.rrectPts(gx - gw / 2, gy, lw, lh, lh * 0.38),
      K.rrectPts(gx + gw / 2 - lw, gy, lw, lh, lh * 0.38)
    ];
    parts.forEach(function (p) { sh.poly(K.turn(p, gx, gy, -5), frame); });
    [gx - gw / 2 + lw * 0.3, gx + gw / 2 - lw * 0.7].forEach(function (x) {
      sh.poly(K.turn(K.rrectPts(x, gy + lh * 0.2, lw * 0.14, lh * 0.5, lw * 0.05), gx, gy, -5 + 25), K.mix(frame, '#FFFFFF', 0.55));
    });
    return { avoid: [{ x: gx - gw / 2, y: gy - lh * 0.2, w: gw, h: lh * 1.3 }], confetti: { colors: [pal.title, pal.light], n: 16, kinds: ['star', 'dot'] } };
  };

  // B N William style: THE on top, a giant yellow age, a gift seal and a subtitle bar.
  F.bigtrivia = function (sh, f, w, pal, opt, k) {
    var bottom = K.flow(sh, f, w, { kind: 'box', fill: pal.title, color: K.contrastOn(pal.title), w: f.w }, { color: pal.ink });
    var r = f.w * 0.13, sealFill = K.visible(pal.bg, pal.light, pal.title), sealInk = K.visible(sealFill, pal.bg, pal.ink);
    K.seal(sh, f.x + f.w - r, f.y + r, r, [w.ord.toUpperCase(), 'BIRTHDAY', 'GIFT'], sealFill, sealInk, { ring: true });
    var y = f.y + r * 0.5;
    if (w.tp.pre) y = Math.max(y, K.textLines(sh, w.tp.pre, f.x, f.y + r * 0.35, f.w - 2 * r - 8, { upper: true, lines: 2, max: f.w * 0.1 * k, color: pal.ink, align: 'left' }));
    y = Math.max(y, f.y + 2 * r * 0.8) + 6;
    K.headline(sh, { x: f.x, y: y, w: f.w, h: bottom - y }, w.tp, {
      scale: k, pre: false, valign: 'top',
      num: { color: pal.title, sufColor: pal.ink, sufK: 0.3, wk: 0.98, max: f.h * 0.42 },
      post: { colors: [pal.ink, pal.title], max: f.w * 0.17, fill: 1.3, lead: 0.14 }
    });
    return { avoid: [{ x: f.x + f.w - 2 * r, y: f.y, w: 2 * r, h: 2 * r }] };
  };

  // Wendy Foxworth style: outlined red letters with a deep shadow, balloons beside the age.
  F.ultimate = function (sh, f, w, pal, opt, k) {
    var fx = { outline: { color: pal.light, w: f.w * 0.008 }, shadow: { color: pal.dark, dx: 0.015, dy: 0.03 } };
    var bottom = K.flow(sh, f, w, { kind: 'box', fill: pal.light, color: K.visible(pal.light, pal.title, pal.dark) }, { color: K.visible(pal.bg, pal.title, pal.dark) });
    var hd = K.headline(sh, { x: f.x, y: f.y, w: f.w, h: bottom - f.y }, w.tp, {
      scale: k, pre: { color: pal.title, size: f.w * 0.11, fx: fx, gap: 0.25 },
      num: { color: pal.title, sufColor: pal.title, wk: 0.74, max: f.h * 0.34, fx: { outline: { color: pal.light, w: f.w * 0.012 }, shadow: { color: pal.dark, dx: 0.02, dy: 0.035 } } },
      post: { color: pal.title, max: f.w * 0.16, fill: 1.3, fx: fx, lead: 0.12 }
    });
    var n = hd.num, avoid = [], cols = [pal.a1, pal.a2, pal.a3];
    [-1, 1].forEach(function (s, i) {
      var room = s < 0 ? n.x - f.X0 : f.X1 - (n.x + n.w) - f.B;
      var r = Math.min(room * 0.36, n.size * 0.17);
      if (r < 8) return;
      var cx = s < 0 ? n.x - room / 2 : n.x + n.w + room / 2, cy = n.top + r * 1.2;
      K.balloon(sh, cx, cy, r, cols[i], pal.dark, r * 1.6);
      K.balloon(sh, cx + s * r * 0.5, cy + r * 1.9, r * 0.8, cols[i + 1], pal.dark, r * 1.2);
      avoid.push({ x: cx - r * 1.4, y: cy - r * 1.3, w: r * 2.8, h: r * 5 });
    });
    return { avoid: avoid, confetti: { colors: cols, n: 26 } };
  };

  // ---------- Retro ----------
  F.sunset = function (sh, f, w, pal, opt, k) {
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: pal.ink }, { color: pal.ink, upper: true, lsK: 0.12 });
    var R = Math.min(f.w * 0.46, f.h * 0.22) * Math.max(0.75, k);
    var es = Math.min(f.w * 0.05, 15), estY = bottom - es * 0.3, stripes = R * 0.05;
    var hz = estY - es * 1.6 - stripes * 5.5;   // the horizon
    sh.text('EST. ' + w.born, f.cx, estY, es, 'sansBold', pal.ink, { align: 'center', ls: es * 0.35 });
    var cols = [pal.title, pal.a1, pal.a2, pal.a3, K.mix(pal.a3, pal.bg, 0.45)];
    for (var i = 0; i < 5; i++) {
      var ya = hz - R + R * i / 5 + (i ? R * 0.022 * i : 0), yb = hz - R + R * (i + 1) / 5;
      sh.poly(K.circleBand(f.cx, hz, R, ya, yb), cols[i]);
    }
    [pal.title, pal.a1, pal.a2].forEach(function (c, i) { sh.rect(f.X0, hz + stripes * (0.6 + i * 1.7), f.X1 - f.X0, stripes, c); });
    K.headline(sh, { x: f.x, y: f.y, w: f.w, h: hz - R - f.w * 0.05 - f.y }, w.tp, {
      scale: k, pre: { color: pal.ink, lsK: 0.2, size: f.w * 0.07 },
      num: { color: pal.title, sufColor: pal.a1, wk: 0.9, max: f.h * 0.3, fx: { shadow: { color: pal.a2, dx: 0.03, dy: 0.03 } } },
      post: { colors: [pal.ink, pal.a1], max: f.w * 0.15 }
    });
    return { fits: R >= f.w * 0.3, avoid: [{ x: f.cx - R, y: hz - R, w: 2 * R, h: R + stripes * 6 }], confetti: { colors: [pal.light, pal.title], n: 22, kinds: ['star', 'dot'] } };
  };

  // Circus rays behind a framed cream card.
  F.rays = function (sh, f, w, pal, opt, k) {
    var idx = sh.items.length, card = pal.card, cardInk = pal.cardInk;
    var ribbon = K.visible(card, pal.a2, pal.a1, pal.ink);
    var bottom = K.flow(sh, f, w, { kind: 'ribbon', fill: ribbon }, { color: K.contrastOn(pal.a1), band: pal.a1 }, f.w * 0.05);
    var top = f.y + f.h * 0.04;
    var cy0 = sh.items.length;
    var hd = K.headline(sh, { x: f.x + f.w * 0.06, y: top + f.w * 0.07, w: f.w * 0.88, h: bottom - top - f.w * 0.14 }, w.tp, {
      scale: k, pre: { color: cardInk, lsK: 0.15, size: f.w * 0.065 },
      num: { color: K.visible(card, pal.title, pal.a1, cardInk), sufColor: cardInk, font: 'serifBold', wk: 0.85, max: f.h * 0.3, fx: { shadow: { color: K.visible(card, pal.a2, cardInk), dx: 0.02, dy: 0.025 } } },
      post: { font: 'serifBold', colors: [cardInk, K.visible(card, pal.a2, cardInk)], max: f.w * 0.13, fill: 1.15 }
    });
    var cTop = Math.max(f.y - f.w * 0.02, hd.top - f.w * 0.07), cBot = Math.min(bottom, hd.bottom + f.w * 0.07);
    under(sh, cy0, function () {
      sh.rrect(f.x - f.w * 0.03, cTop, f.w * 1.06, cBot - cTop, f.w * 0.04, card);
      sh.rframe(f.x - f.w * 0.03 + 5, cTop + 5, f.w * 1.06 - 10, cBot - cTop - 10, f.w * 0.03, K.visible(card, pal.a1, cardInk), 2.2);
    });
    under(sh, idx, function () {
      var cx = f.cx, cy = f.H * 0.56, R = Math.max(f.X1 - f.X0, f.H) * 1.4, n = 28, alt = pal.a1 === pal.bg ? K.shade(pal.bg, -0.12) : pal.a1;
      for (var j = 0; j < n; j += 2) {
        var a0 = j / n * Math.PI * 2, a1 = (j + 1) / n * Math.PI * 2;
        sh.poly([cx, cy, cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R], alt);
      }
    });
    return {};
  };

  F.cassette = function (sh, f, w, pal, opt, k) {
    var body = K.visible(pal.bg, pal.dark, pal.ink), label = pal.card;
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'box', fill: pal.a2, color: K.contrastOn(pal.a2) }, foot: { color: pal.ink },
      pre: { lsK: 0.14, max: f.w * 0.075 }, post: { colors: [pal.ink, K.visible(pal.bg, pal.a1, pal.ink)], max: f.w * 0.15 },
      maxH: f.w * 0.98 * 0.64, minH: f.w * 0.62 * 0.64,
      art: function (y, h) {
        var cw = Math.min(f.w * 0.98, h / 0.64), ch = cw * 0.64, x0 = f.cx - cw / 2, y0 = y + (h - ch) / 2;
        sh.rrect(x0, y0, cw, ch, cw * 0.045, body);
        sh.rrect(x0 + cw * 0.02, y0 + ch * 0.03, cw * 0.96, ch * 0.94, cw * 0.035, K.mix(body, '#FFFFFF', 0.08));
        [[0.04, 0.06], [0.96, 0.06], [0.04, 0.94], [0.96, 0.94]].forEach(function (p) { sh.circle(x0 + cw * p[0], y0 + ch * p[1], cw * 0.012, K.mix(body, '#FFFFFF', 0.4)); });
        var lx = x0 + cw * 0.07, ly = y0 + ch * 0.08, lw = cw * 0.86, lh = ch * 0.64;
        sh.rrect(lx, ly, lw, lh, cw * 0.02, label);
        sh.rect(lx, ly + lh * 0.8, lw, lh * 0.07, pal.a1);
        sh.rect(lx, ly + lh * 0.89, lw, lh * 0.07, pal.a2);
        var ww = lw * 0.56, wh = lh * 0.26, wx = f.cx - ww / 2, wy = ly + lh * 0.5;
        sh.rrect(wx, wy, ww, wh, wh * 0.5, body);
        sh.rect(f.cx - ww * 0.3, wy + wh * 0.3, ww * 0.6, wh * 0.4, K.mix(body, '#8B5A2B', 0.5));
        [-1, 1].forEach(function (s) {
          var rx = f.cx + s * ww * 0.3, ry = wy + wh / 2, rr = wh * 0.42;
          sh.circle(rx, ry, rr, K.mix(label, body, 0.1));
          sh.poly(K.starPts(rx, ry, rr * 0.62, rr * 0.36, 6, 0), body);
        });
        var n = { color: K.visible(label, pal.title, pal.a2, pal.ink) }, top = ly + lh * 0.07, nh = wy - top - lh * 0.07;
        var ns = numIn(w.tp, lw * 0.82, nh, n);
        K.bigNum(sh, w.tp, f.cx, top + (nh - ns * CAP) / 2, ns, n);
        sh.poly([x0 + cw * 0.2, y0 + ch, x0 + cw * 0.25, y0 + ch * 0.79, x0 + cw * 0.75, y0 + ch * 0.79, x0 + cw * 0.8, y0 + ch], K.mix(body, '#FFFFFF', 0.16));
        [0.36, 0.64].forEach(function (p) { sh.circle(x0 + cw * p, y0 + ch * 0.9, cw * 0.018, body); });
        return { avoid: [{ x: x0, y: y0, w: cw, h: ch }] };
      }
    });
    res.confetti = { colors: [pal.a1, pal.a2, pal.light], n: 20, kinds: ['dot', 'strip'] };
    return res;
  };

  F.vinyl = function (sh, f, w, pal, opt, k) {
    var rec = '#161616';
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'box', fill: pal.ink, color: K.contrastOn(pal.ink) }, foot: { color: pal.ink },
      pre: { lsK: 0.14, max: f.w * 0.075 }, post: { colors: [pal.ink, K.visible(pal.bg, pal.title, pal.ink)], max: f.w * 0.15 },
      maxH: f.w * 0.8, minH: f.w * 0.55,
      art: function (y, h) {
        var s = Math.min(f.w * 0.8, h), x0 = f.cx - s * 1.23 / 2, y0 = y + (h - s) / 2;
        sh.rect(x0, y0, s, s, pal.a1);
        sh.frame(x0 + s * 0.05, y0 + s * 0.05, s * 0.9, s * 0.9, pal.light, 1.4);
        sh.rect(x0 + s * 0.05, y0 + s * 0.72, s * 0.9, s * 0.05, pal.a2);
        sh.rect(x0 + s * 0.05, y0 + s * 0.8, s * 0.9, s * 0.05, pal.light);
        var R = s * 0.48, cx = x0 + s * 0.75, cy = y0 + s / 2;
        sh.circle(cx + 2, cy + 3, R, K.shade(pal.a1, -0.35));
        sh.circle(cx, cy, R, rec);
        [0.93, 0.85, 0.77, 0.69, 0.61].forEach(function (t) { sh.ring(cx, cy, R * t, '#363636', 0.8); });
        sh.poly(K.arcBand(cx, cy, R * 0.55, R * 0.95, 200, 235), '#2A2A2A');
        var lr = R * 0.46, lab = K.visible(rec, pal.a2, pal.title, pal.light), n = { color: K.contrastOn(lab) };
        sh.circle(cx, cy, lr, lab);
        var ns = numIn(w.tp, lr * 1.6, lr * 0.95, n);
        K.bigNum(sh, w.tp, cx, cy - ns * CAP / 2, ns, n);
        return { avoid: [{ x: x0, y: y0, w: s * 1.23, h: s }] };
      }
    });
    res.confetti = { colors: [pal.a1, pal.a2, pal.light], n: 18, kinds: ['dot', 'star'] };
    return res;
  };

  F.tv = function (sh, f, w, pal, opt, k) {
    var body = K.visible(pal.bg, pal.a2, pal.dark, pal.ink), screen = '#1E2A33';
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'box', fill: pal.a1, color: K.contrastOn(pal.a1) }, foot: { color: pal.ink },
      pre: { lsK: 0.14, max: f.w * 0.075 }, post: { colors: [pal.ink, K.visible(pal.bg, pal.a1, pal.ink)], max: f.w * 0.15 },
      maxH: f.w * 0.95 * 0.72 * 1.42, minH: f.w * 0.62 * 0.72 * 1.42,
      art: function (y, h) {
        var tw = Math.min(f.w * 0.95, h / (0.72 * 1.42)), th = tw * 0.72, ant = th * 0.3, x0 = f.cx - tw / 2, y0 = y + (h - th * 1.42) / 2 + ant;
        sh.line(f.cx, y0, f.cx - tw * 0.22, y0 - ant * 0.92, body, 2.4, true);
        sh.line(f.cx, y0, f.cx + tw * 0.17, y0 - ant * 0.98, body, 2.4, true);
        sh.circle(f.cx - tw * 0.22, y0 - ant * 0.92, 3.6, pal.a1);
        sh.circle(f.cx + tw * 0.17, y0 - ant * 0.98, 3.6, pal.a1);
        sh.ellipse(f.cx, y0, tw * 0.08, th * 0.06, body);
        sh.poly([x0 + tw * 0.14, y0 + th * 0.98, x0 + tw * 0.2, y0 + th * 0.98, x0 + tw * 0.16, y0 + th * 1.12, x0 + tw * 0.1, y0 + th * 1.12], body);
        sh.poly([x0 + tw * 0.8, y0 + th * 0.98, x0 + tw * 0.86, y0 + th * 0.98, x0 + tw * 0.9, y0 + th * 1.12, x0 + tw * 0.84, y0 + th * 1.12], body);
        sh.rrect(x0, y0, tw, th, th * 0.1, body);
        var sx = x0 + tw * 0.06, sy = y0 + th * 0.1, sw = tw * 0.64, shh = th * 0.8;
        sh.rrect(sx - 4, sy - 4, sw + 8, shh + 8, shh * 0.16, K.mix(body, '#FFFFFF', 0.3));
        sh.rrect(sx, sy, sw, shh, shh * 0.14, screen);
        for (var i = 1; i < 9; i++) sh.line(sx + 8, sy + shh * i / 9, sx + sw - 8, sy + shh * i / 9, K.mix(screen, '#FFFFFF', 0.07), 0.8);
        sh.poly([sx + sw * 0.06, sy + shh * 0.08, sx + sw * 0.32, sy + shh * 0.08, sx + sw * 0.1, sy + shh * 0.3], K.mix(screen, '#FFFFFF', 0.12));
        var n = { color: K.visible(screen, pal.title, pal.a1, pal.light), fx: { glow: [{ color: K.mix(screen, '#FFFFFF', 0.12), w: 3 }] } };
        var ns = numIn(w.tp, sw * 0.82, shh * 0.6, n);
        K.bigNum(sh, w.tp, sx + sw / 2, sy + (shh - ns * CAP) / 2, ns, n);
        var px = x0 + tw * 0.85, knob = K.mix(body, '#FFFFFF', 0.32);
        [0.25, 0.48].forEach(function (p) { sh.circle(px, y0 + th * p, tw * 0.055, knob); sh.circle(px, y0 + th * p, tw * 0.022, pal.a1); });
        for (var g = 0; g < 5; g++) sh.line(x0 + tw * 0.77, y0 + th * (0.66 + g * 0.05), x0 + tw * 0.93, y0 + th * (0.66 + g * 0.05), knob, 1.4, true);
        return { avoid: [{ x: x0, y: y0 - ant, w: tw, h: th * 1.42 }] };
      }
    });
    res.confetti = { colors: [pal.a1, pal.a2, pal.light], n: 22, kinds: ['dot', 'strip', 'star'] };
    return res;
  };

  F.rainbow = function (sh, f, w, pal, opt, k) {
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'box', fill: pal.a1, color: K.contrastOn(pal.a1) }, foot: { color: pal.ink },
      pre: { lsK: 0.14, max: f.w * 0.075, font: 'serifBold' }, post: { font: 'serifBold', colors: [pal.ink, pal.title], max: f.w * 0.14 },
      maxH: f.w * 0.52 * 1.14, minH: f.w * 0.36 * 1.14,
      art: function (y, h) {
        var R = Math.min(f.w * 0.52, h / 1.14), base = y + (h - R * 1.14) / 2 + R, bw = R * 0.12;
        [pal.title, pal.a3, pal.a1, pal.a2].forEach(function (c, i) { sh.poly(K.arcBand(f.cx, base, R - (i + 1) * bw, R - i * bw, 180, 360), c); });
        [-1, 1].forEach(function (s) {
          var cx = f.cx + s * (R - 2 * bw);
          sh.circle(cx - bw * 0.9, base + bw * 0.2, bw * 0.95, pal.light);
          sh.circle(cx + bw * 0.9, base + bw * 0.25, bw * 0.9, pal.light);
          sh.circle(cx, base - bw * 0.25, bw * 1.25, pal.light);
          sh.rect(cx - bw * 1.8, base + bw * 0.2, bw * 3.6, bw * 0.95, pal.light);
        });
        var ri = R - 4 * bw, n = { color: K.visible(pal.bg, pal.title, pal.ink), font: 'serifBold', sufColor: pal.a1 };
        var ns = numIn(w.tp, ri * 1.7, ri * 0.8, n);
        K.bigNum(sh, w.tp, f.cx, base - ns * CAP - R * 0.03, ns, n);
        return { avoid: [{ x: f.cx - R, y: base - R, w: 2 * R, h: R * 1.14 }] };
      }
    });
    res.confetti = { colors: [pal.a1, pal.a2, pal.a3], n: 18, kinds: ['star', 'dot'] };
    return res;
  };

  // BORN IN and the year, huge, over retro stripes; the title under it.
  F.bornin = function (sh, f, w, pal, opt, k) {
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: pal.ink, font: 'serif' }, { color: pal.ink, upper: true, lsK: 0.12 });
    var title = w.title.replace(/^\s*born\s+in\s+\d{4}\s*[:\-–—,.]?\s*/i, '');
    var start = sh.items.length, y = f.y;
    var ls = f.w * 0.075 * k;
    y = K.textLines(sh, 'BORN IN', f.x, y, f.w, { max: ls, lsK: 0.4, color: K.visible(pal.bg, pal.a1, pal.ink) }) + ls * 0.5;
    var yt = { num: String(w.born), suf: '' }, n = { color: pal.title, noSuf: true, lsK: -0.02, fx: { shadow: { color: pal.a3, dx: 0.025, dy: 0.03 } } };
    var ns = Math.min(f.w * 0.96 / K.numW(yt, 1, n), f.h * 0.3) * k;
    y = K.bigNum(sh, yt, f.cx, y, ns, n).bottom + ns * 0.08;
    var st = ns * 0.06;
    [pal.a1, pal.a3, pal.a2].forEach(function (c, i) { sh.rect(f.X0, y + i * st * 1.5, f.X1 - f.X0, st, c); });
    y += st * 4.5 + f.w * 0.05 * k;
    y = K.textLines(sh, title, f.x, y, f.w, { upper: true, lines: 4, max: f.w * 0.15 * k, fill: 1.25, colors: [pal.ink, pal.title] });
    center(sh, start, f.y, bottom, y);
    return { fits: y <= bottom, confetti: null };
  };

  // ---------- Elegant ----------
  function doubleFrame(sh, f, pal, c1, c2) {
    var X = f.X0, T = f.B, W = f.X1 - f.X0 - f.B, H = f.H - 2 * f.B;
    sh.frame(X + 0.2 * PT, T + 0.2 * PT, W - 0.4 * PT, H - 0.4 * PT, c1, 2);
    sh.frame(X + 0.27 * PT, T + 0.27 * PT, W - 0.54 * PT, H - 0.54 * PT, c2, 0.9);
    [[X + 0.27 * PT, T + 0.27 * PT], [X + W - 0.27 * PT, T + 0.27 * PT], [X + 0.27 * PT, T + H - 0.27 * PT], [X + W - 0.27 * PT, T + H - 0.27 * PT]].forEach(function (p) {
      var d = 0.07 * PT;
      sh.poly([p[0], p[1] - d, p[0] + d, p[1], p[0], p[1] + d, p[0] - d, p[1]], c2);
    });
  }
  function divider(sh, cx, y, wd, color) {
    sh.line(cx - wd / 2, y, cx - 7, y, color, 1);
    sh.line(cx + 7, y, cx + wd / 2, y, color, 1);
    sh.poly([cx, y - 4, cx + 4, y, cx, y + 4, cx - 4, y], color);
  }

  F.medallion = function (sh, f, w, pal, opt, k) {
    var fi = inset(f, 4);
    doubleFrame(sh, f, pal, pal.ink, K.visible(pal.bg, pal.a1, pal.ink));
    return artFlow(sh, fi, w, pal, k, {
      sub: { kind: 'plain', font: 'serif', color: pal.ink }, foot: { font: 'serif', upper: true, lsK: 0.15, color: pal.ink },
      pre: { font: 'serif', lsK: 0.2, max: fi.w * 0.06 }, post: { font: 'serifBold', max: fi.w * 0.12, fill: 1.15 },
      maxH: fi.w * 0.78, minH: fi.w * 0.5,
      art: function (y, h) {
        var R = Math.min(fi.w * 0.38, h / 2), cy = y + h / 2, cx = fi.cx;
        for (var i = 0; i < 44; i++) { var a = i / 44 * Math.PI * 2; sh.circle(cx + Math.cos(a) * R * 0.97, cy + Math.sin(a) * R * 0.97, R * 0.022, pal.a2); }
        sh.ring(cx, cy, R * 0.9, pal.title, 2.2);
        sh.circle(cx, cy, R * 0.86, pal.card);
        sh.ring(cx, cy, R * 0.79, K.visible(pal.card, pal.a1, pal.ink), 1);
        var n = { font: 'serifBold', color: K.visible(pal.card, pal.title, pal.ink), sufLower: true };
        var ns = numIn(w.tp, R * 1.3, R * 0.8, n);
        K.bigNum(sh, w.tp, cx, cy - ns * CAP / 2, ns, n);
        divider(sh, cx, cy + R * 0.58, R * 0.6, pal.a2);
        return {};
      }
    });
  };

  F.blackgold = function (sh, f, w, pal, opt, k) {
    var gold = pal.title, X = f.X0, T = f.B, W = f.X1 - f.X0 - f.B, H = f.H - 2 * f.B, d = 0.2 * PT, c = 0.55 * PT;
    sh.frame(X + d, T + d, W - 2 * d, H - 2 * d, gold, 0.9);
    [[X + d + 5, T + d + 5, 1, 1], [X + W - d - 5, T + d + 5, -1, 1], [X + d + 5, T + H - d - 5, 1, -1], [X + W - d - 5, T + H - d - 5, -1, -1]].forEach(function (p) {
      sh.path([p[0], p[1] + p[3] * c, p[0], p[1], p[0] + p[2] * c, p[1]], gold, 1.6);
      sh.path([p[0] + p[2] * 6, p[1] + p[3] * c * 0.6, p[0] + p[2] * 6, p[1] + p[3] * 6, p[0] + p[2] * c * 0.6, p[1] + p[3] * 6], gold, 0.9);
    });
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: K.mix(pal.ink, pal.bg, 0.12), upper: true, lsK: 0.1, size: K.subSize(f) * 0.9 }, { color: gold, upper: true, lsK: 0.25 });
    var hd = K.headline(sh, { x: f.x, y: f.y, w: f.w, h: bottom - f.y }, w.tp, {
      scale: k, pre: { font: 'serif', color: pal.ink, lsK: 0.22, size: f.w * 0.06, gap: 0.6 },
      num: { font: 'serifBold', color: gold, sufColor: gold, sufLower: true, wk: 0.86, max: f.h * 0.34 },
      post: { font: 'serif', upper: false, color: pal.ink, max: f.w * 0.13, fill: 1.1, gap: 0.6 }
    });
    if (w.tp.post) divider(sh, f.cx, hd.num.bottom + f.w * 0.045 * hd.scale, f.w * 0.5, gold);
    return { confetti: { colors: [gold, pal.light], n: 22, kinds: ['star', 'dot'] } };
  };

  F.laurel = function (sh, f, w, pal, opt, k) {
    var leaf = K.visible(pal.bg, pal.a1, pal.title, pal.ink);
    return artFlow(sh, f, w, pal, k, {
      sub: { kind: 'line', color: pal.ink, rule: leaf }, foot: { color: pal.ink, upper: true, lsK: 0.18 },
      pre: { lsK: 0.2, max: f.w * 0.065 }, post: { max: f.w * 0.14, fill: 1.2, colors: [pal.ink, K.visible(pal.bg, pal.title, pal.ink)] },
      maxH: f.w * 0.82, minH: f.w * 0.55,
      art: function (y, h) {
        var R = Math.min(f.w * 0.4, h / 2.1), cx = f.cx, cy = y + h / 2;
        [-1, 1].forEach(function (s) {
          var stem = [];
          for (var i = 0; i <= 20; i++) { var a = (90 + s * (12 + i * 6.5)) * Math.PI / 180; stem.push(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
          sh.path(stem, leaf, 1.6);
          for (var j = 0; j < 12; j++) {
            var deg = 90 + s * (16 + j * 10.5), a2 = deg * Math.PI / 180, out = j % 2 ? 1.1 : 0.9;
            var lx = cx + Math.cos(a2) * R * out, ly = cy + Math.sin(a2) * R * out;
            sh.poly(K.leafPts(lx, ly, R * 0.26, R * 0.1, deg + s * 90 + (j % 2 ? -s * 28 : s * 28) + 180), j % 3 === 1 ? K.mix(leaf, pal.bg, 0.25) : leaf);
          }
        });
        sh.poly(K.starPts(cx, cy - R * 1.08, R * 0.08, R * 0.035, 5), leaf);
        var n = { font: 'serifBold', color: K.visible(pal.bg, pal.title, pal.ink), sufLower: true };
        var ns = numIn(w.tp, R * 1.3, R * 0.75, n);
        K.bigNum(sh, w.tp, cx, cy - ns * CAP / 2, ns, n);
        return {};
      }
    });
  };

  // Quiet and modern: everything left-aligned, a big serif age and lots of space.
  F.minimal = function (sh, f, w, pal, opt, k) {
    var muted = K.mix(pal.ink, pal.bg, 0.4), accent = K.visible(pal.bg, pal.a1, pal.title);
    var bottom = K.footer(sh, f, w, { font: 'sans', upper: true, lsK: 0.22, size: Math.max(10, f.w * 0.033), color: pal.ink, align: 'left' });
    var y = f.y;
    if (w.tp.pre) y = K.textLines(sh, w.tp.pre, f.x, y, f.w * 0.8, { font: 'sans', upper: true, lsK: 0.25, max: f.w * 0.04, color: muted, align: 'left', lines: 2 });
    var start = sh.items.length, gy = y + f.w * 0.08;
    var n = { font: 'serif', color: pal.title, sufColor: accent, sufLower: true, align: 'left' };
    var ns = Math.min(f.w * 0.8 / K.numW(w.tp, 1, n), f.h * 0.34) * k;
    var r = K.bigNum(sh, w.tp, f.x - ns * 0.03, gy, ns, n), yy = r.bottom + ns * 0.12;
    sh.rect(f.x, yy, f.w * 0.16, Math.max(2.5, f.w * 0.009), accent);
    yy += f.w * 0.06;
    if (w.tp.post) yy = K.textLines(sh, w.tp.post, f.x, yy, f.w * 0.92, { font: 'serif', max: f.w * 0.125 * k, lines: 3, color: pal.ink, align: 'left', lead: 0.18 });
    if (w.sub) yy = K.textLines(sh, w.sub, f.x, yy + f.w * 0.05, f.w * 0.8, { font: 'sans', max: Math.max(10, f.w * 0.036), lines: 3, color: muted, align: 'left', lead: 0.35 });
    var free = bottom - f.w * 0.04 - yy;
    if (free > 0) sh.shift(start, 0, free * 0.4);
    return { fits: free >= 0, confetti: null };
  };

  F.deco = function (sh, f, w, pal, opt, k) {
    var gold = K.visible(pal.bg, pal.a1, pal.title), X = f.X0, T = f.B, W = f.X1 - f.X0 - f.B, H = f.H - 2 * f.B;
    var fr = f.w * 0.36, n = 17, soft = K.mix(pal.bg, gold, 0.3);
    for (var i = 0; i < n; i++) sh.poly(K.arcBand(f.cx, T, 0, fr, 8 + i * 164 / n, 8 + (i + 1) * 164 / n), i % 2 ? soft : gold);
    sh.poly(K.arcBand(f.cx, T, fr * 1.06, fr * 1.1, 0, 180), gold);
    sh.poly(K.arcBand(f.cx, T, fr * 1.16, fr * 1.18, 0, 180), gold);
    var d = 0.2 * PT, s = 0.2 * PT, x0 = X + d, y0 = T + d, x1 = X + W - d, y1 = T + H - d;
    sh.path([x0 + s, y0, x1 - s, y0, x1 - s, y0 + s, x1, y0 + s, x1, y1 - s, x1 - s, y1 - s, x1 - s, y1, x0 + s, y1, x0 + s, y1 - s, x0, y1 - s, x0, y0 + s, x0 + s, y0 + s], gold, 1.5, true);
    sh.frame(x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12, gold, 0.75);
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: pal.ink, upper: true, lsK: 0.1, size: K.subSize(f) * 0.9 }, { font: 'serif', color: gold, upper: true, lsK: 0.25 });
    var top = T + fr * 1.18 + f.w * 0.06;
    var hd = K.headline(sh, { x: f.x, y: top, w: f.w, h: bottom - top }, w.tp, {
      scale: k, pre: { font: 'serif', color: pal.ink, lsK: 0.25, size: f.w * 0.06, gap: 0.6 },
      num: { font: 'serifBold', color: K.visible(pal.bg, pal.title, gold), sufColor: gold, wk: 0.8, max: f.h * 0.3 },
      post: { font: 'serifBold', color: pal.ink, lsK: 0.08, max: f.w * 0.12, fill: 1.1, gap: 0.6 }
    });
    if (w.tp.post) divider(sh, f.cx, hd.num.bottom + f.w * 0.045 * hd.scale, f.w * 0.5, gold);
    return { fits: bottom - top > f.h * 0.35 };
  };

  // ---------- Party ----------
  F.cake = function (sh, f, w, pal, opt, k) {
    var numCol = K.visible(pal.bg, pal.a3, pal.title, pal.ink), flame = K.visible(pal.bg, pal.a2, pal.title);
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'ribbon', fill: pal.title, color: K.contrastOn(pal.title) }, foot: { color: pal.ink },
      pre: { lsK: 0.14, max: f.w * 0.075 }, post: { colors: [pal.ink, pal.title], max: f.w * 0.15 },
      maxH: f.w * 1.05, minH: f.w * 0.62,
      art: function (y, h) {
        var n = { color: numCol, sufColor: pal.title, fx: { outline: { color: pal.light, w: 2.5 } } }, nk = 0.66 / K.numW(w.tp, 1, n);
        var ratio = nk * 1.06 + 0.53, cw = Math.min(f.w * 0.84, h / ratio), ns = cw * nk, fh = ns * 0.42;
        var total = cw * ratio, y0 = y + (h - total) / 2, ntop = y0 + fh;
        var r = K.bigNum(sh, w.tp, f.cx, ntop, ns, n);
        var x = r.x;
        for (var i = 0; i < w.tp.num.length; i++) {
          var dw = K.wid(w.tp.num[i], ns, 'sansBold'), fx = x + dw / 2;
          sh.line(fx, ntop + 2, fx, ntop - fh * 0.3, pal.ink, 1.4);
          var fy = ntop - fh * 0.52, fr = fh * 0.17;
          sh.poly([fx, ntop - fh * 1.05, fx + fr, fy - fr * 0.2, fx + fr * 0.7, fy + fr * 0.7, fx, fy + fr, fx - fr * 0.7, fy + fr * 0.7, fx - fr, fy - fr * 0.2], flame);
          sh.circle(fx, fy + fr * 0.25, fr * 0.45, K.mix(flame, '#FFFFFF', 0.6));
          x += dw;
        }
        var t1 = cw * 0.2, t2 = cw * 0.26, top1 = r.bottom - 2, top2 = top1 + t1;
        var tiers = [[f.cx - cw * 0.36, top1, cw * 0.72, t1, pal.a1], [f.cx - cw / 2, top2, cw, t2, K.visible(pal.bg, pal.title, pal.a1)]];
        sh.ellipse(f.cx, top2 + t2, cw * 0.6, cw * 0.045, pal.light);
        tiers.forEach(function (t, j) {
          sh.rrect(t[0], t[1], t[2], t[3], t[3] * 0.12, t[4]);
          var fh2 = t[3] * 0.24;
          sh.rrect(t[0] - 2, t[1], t[2] + 4, fh2, fh2 * 0.4, pal.light);
          for (var d = 0, nd = Math.round(t[2] / (t[3] * 0.32)); d < nd; d++) sh.circle(t[0] + (d + 0.5) * t[2] / nd, t[1] + fh2, t[3] * (d % 2 ? 0.09 : 0.12), pal.light);
          var dots = j ? pal.a2 : pal.a3;
          for (var e = 0, ne = Math.round(t[2] / (t[3] * 0.5)); e < ne; e++) sh.circle(t[0] + (e + 0.5) * t[2] / ne, t[1] + t[3] * 0.66, t[3] * 0.07, K.visible(t[4], dots, pal.light));
        });
        return { avoid: [{ x: f.cx - cw / 2, y: y0 - 4, w: cw, h: total + 8 }] };
      }
    });
    res.confetti = { colors: party(pal), n: 34 };
    return res;
  };

  F.balloons = function (sh, f, w, pal, opt, k) {
    var bottom = K.flow(sh, f, w, { kind: 'box', fill: pal.title, color: K.contrastOn(pal.title) }, { color: pal.ink });
    var band = f.h * 0.3 * Math.max(0.8, k), cols = party(pal), FW = f.X1 - f.X0 - f.B;
    var spots = [[0.1, 0.48, 0.115], [0.3, 0.3, 0.13], [0.5, 0.5, 0.12], [0.7, 0.28, 0.135], [0.9, 0.46, 0.115], [0.2, 0.72, 0.09], [0.8, 0.74, 0.095], [0.6, 0.06, 0.08], [0.4, 0.04, 0.075]];
    var top = f.B + 4;
    spots.forEach(function (s, i) {
      var r = FW * s[2] * 0.85, cx = f.X0 + FW * s[0], cy = top + r * 1.1 + (band - r * 2.6) * s[1];
      K.balloon(sh, cx, cy, r, cols[i % cols.length], K.mix(pal.ink, pal.bg, 0.35), Math.max(4, f.y + band - (cy + r * 1.22)));
    });
    var hy = f.y + band + f.w * 0.03;
    K.headline(sh, { x: f.x, y: hy, w: f.w, h: bottom - hy }, w.tp, {
      scale: k, pre: { color: pal.ink, lsK: 0.12, size: f.w * 0.075 },
      num: { color: pal.title, sufColor: pal.ink, wk: 0.86, max: f.h * 0.32, fx: { outline: { color: pal.light, w: f.w * 0.008 } } },
      post: { colors: [pal.ink, pal.title], max: f.w * 0.15 }
    });
    return { avoid: [{ x: f.X0, y: 0, w: FW + f.B, h: f.y + band }], confetti: { colors: cols, n: 26 } };
  };

  function garland(sh, x0, x1, y, sag, size, cols, string) {
    var n = Math.max(5, Math.round((x1 - x0) / (size * 1.25))), pts = [];
    for (var i = 0; i <= 24; i++) { var t = i / 24; pts.push(x0 + (x1 - x0) * t, y + sag * 4 * t * (1 - t)); }
    sh.path(pts, string, 1.2);
    for (var j = 0; j < n; j++) {
      var t0 = (j + 0.12) / n, t1 = (j + 0.88) / n, tm = (j + 0.5) / n;
      var ax = x0 + (x1 - x0) * t0, ay = y + sag * 4 * t0 * (1 - t0), bx = x0 + (x1 - x0) * t1, by = y + sag * 4 * t1 * (1 - t1);
      var mx = x0 + (x1 - x0) * tm, my = y + sag * 4 * tm * (1 - tm);
      sh.poly([ax, ay, bx, by, mx, my + size * 1.1], cols[j % cols.length]);
    }
    return y + sag + size * 1.1;
  }

  F.bunting = function (sh, f, w, pal, opt, k) {
    var cols = party(pal), FW = f.X1 - f.X0 - f.B;
    var size = f.w * 0.075, gb = garland(sh, f.X0 - 6, f.X0 + FW + 6, f.B + 6, f.w * 0.1, size, cols, pal.ink);
    garland(sh, f.X0 + FW * 0.55, f.X0 + FW + 10, f.B + 2, f.w * 0.05, size * 0.7, cols.slice(1).concat(cols[0]), pal.ink);
    var subFill = K.visible(pal.bg, pal.a1, pal.title);
    var bottom = K.flow(sh, f, w, { kind: 'box', fill: subFill, color: K.contrastOn(subFill) }, { color: pal.ink });
    var hy = Math.max(f.y, gb + f.w * 0.04);
    K.headline(sh, { x: f.x, y: hy, w: f.w, h: bottom - hy }, w.tp, {
      scale: k, pre: { color: pal.ink, lsK: 0.12, size: f.w * 0.075 },
      num: { color: pal.title, sufColor: pal.ink, wk: 0.88, max: f.h * 0.34, fx: { shadow: { color: K.shade(pal.title, -0.4), dx: 0.025, dy: 0.03 } } },
      post: { colors: [pal.ink, pal.title], max: f.w * 0.15 }
    });
    return { fits: bottom - hy > f.h * 0.4, avoid: [{ x: f.X0, y: 0, w: FW + f.B, h: gb }], confetti: { colors: cols, n: 40 } };
  };

  F.ticket = function (sh, f, w, pal, opt, k) {
    var card = pal.card, ink = pal.cardInk, accent = K.visible(card, pal.a2, pal.a1, ink);
    var bottom = K.footer(sh, f, w, { color: pal.ink });
    var tx = f.x - 8, tw = f.w + 16, ty = f.y - 4, th = bottom - ty;
    var m = w.sub ? K.subLines(w.sub, { kind: 'plain', w: f.w - 24 }, f) : null, stub = (m ? m.h : 0) + f.w * 0.08;
    var sy = ty + th - stub, idx = sh.items.length;
    if (w.sub) K.subtitle(sh, f, w.sub, sy + (stub - m.h) / 2, { kind: 'plain', color: ink, w: f.w - 24 });
    var as = Math.max(8, f.w * 0.042), ay = ty + f.w * 0.05 + as * CAP;
    sh.text('ADMIT ONE', f.cx, ay, as, 'sansBold', accent, { align: 'center', ls: as * 0.35 });
    var aw = K.wid('ADMIT ONE', as, 'sansBold', as * 0.35);
    [-1, 1].forEach(function (s) { sh.poly(K.starPts(f.cx + s * (aw / 2 + as * 1.1), ay - as * 0.33, as * 0.55, as * 0.23, 5), accent); });
    var hy = ay + as * 0.9;
    K.headline(sh, { x: f.x + 10, y: hy, w: f.w - 20, h: sy - hy - f.w * 0.05 }, w.tp, {
      scale: k, pre: { color: ink, lsK: 0.12, size: f.w * 0.07 },
      num: { color: K.visible(card, pal.bg, pal.a2, pal.title, ink), sufColor: ink, wk: 0.86, max: f.h * 0.32 },
      post: { colors: [ink, accent], max: f.w * 0.14 }
    });
    under(sh, idx, function () {
      sh.rrect(tx + 3, ty + 4, tw, th, 12, pal.dark);
      sh.rrect(tx, ty, tw, th, 12, card);
      sh.rframe(tx + 8, ty + 8, tw - 16, th - stub - 16, 8, accent, 1.2);
      [tx, tx + tw].forEach(function (x) { sh.circle(x, sy, 13, pal.bg); });
      sh.line(tx + 18, sy, tx + tw - 18, sy, K.mix(ink, card, 0.5), 1.2, false, [5, 4]);
    });
    return { fits: sy - hy > f.h * 0.35, avoid: [{ x: tx, y: ty, w: tw, h: th }], confetti: { colors: [pal.light, pal.a1], n: 30, kinds: ['star', 'dot'] } };
  };

  F.gameshow = function (sh, f, w, pal, opt, k) {
    var subFill = K.visible(pal.bg, pal.a3, pal.a2, pal.light);
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'box', fill: subFill, color: K.contrastOn(subFill) }, foot: { color: pal.ink },
      pre: { lsK: 0.14, max: f.w * 0.075 }, post: { colors: [pal.ink, pal.title], max: f.w * 0.15 },
      maxH: f.w * 1.05, minH: f.w * 0.6,
      art: function (y, h) {
        var gap = f.w * 0.02, tw = (f.w - 3 * gap) / 4, tth = tw * 0.58, boardH = 2 * tth + gap;
        var mh = Math.min(f.w * 0.52, h - boardH - gap * 3), y0 = y + (h - boardH - gap * 3 - mh) / 2;
        for (var r = 0; r < 2; r++) for (var c = 0; c < 4; c++) {
          var x = f.x + c * (tw + gap), yy = y0 + r * (tth + gap);
          sh.rect(x, yy, tw, tth, pal.a1);
          sh.frame(x + 2, yy + 2, tw - 4, tth - 4, K.mix(pal.a1, '#FFFFFF', 0.3), 0.8);
          var qs = tth * 0.62;
          sh.text('?', x + tw / 2, yy + tth / 2 + qs * 0.36, qs, 'sansBold', pal.title, { align: 'center' });
        }
        var my = y0 + boardH + gap * 3, inner = pal.dark, frame = pal.a2;
        sh.rrect(f.x - 4, my, f.w + 8, mh, mh * 0.12, frame);
        sh.rrect(f.x + 12, my + 16, f.w - 24, mh - 32, mh * 0.08, inner);
        var bx0 = f.x + 2, bx1 = f.x + f.w - 2, nbx = Math.floor((bx1 - bx0) / 14), nby = Math.max(2, Math.floor((mh - 16) / 14));
        for (var i = 0; i <= nbx; i++) { sh.circle(bx0 + (bx1 - bx0) * i / nbx, my + 8, 2.6, pal.light); sh.circle(bx0 + (bx1 - bx0) * i / nbx, my + mh - 8, 2.6, pal.light); }
        for (var j = 1; j < nby; j++) { sh.circle(f.x + 2, my + 8 + (mh - 16) * j / nby, 2.6, pal.light); sh.circle(f.x + f.w - 2, my + 8 + (mh - 16) * j / nby, 2.6, pal.light); }
        var n = { color: K.visible(inner, pal.title, pal.light) }, ns = numIn(w.tp, (f.w - 24) * 0.84, (mh - 32) * 0.66, n);
        K.bigNum(sh, w.tp, f.cx, my + mh / 2 - ns * CAP / 2, ns, n);
        return { avoid: [{ x: f.x - 4, y: y0, w: f.w + 8, h: boardH + gap * 3 + mh }] };
      }
    });
    res.confetti = { colors: [pal.title, pal.light], n: 20, kinds: ['star', 'dot'] };
    return res;
  };

  F.neon = function (sh, f, w, pal, opt, k) {
    var brick = K.mix(pal.bg, '#FFFFFF', 0.07), bh = Math.max(12, f.w * 0.036), bw = bh * 2.3;
    for (var row = 0, y = 0; y < f.H; row++, y += bh) {
      sh.line(f.X0, y, f.X1, y, brick, 0.8);
      for (var x = f.X0 + (row % 2 ? bw / 2 : 0); x < f.X1; x += bw) sh.line(x, y, x, y + bh, brick, 0.8);
    }
    function glow(c, wpt) { return [{ color: K.mix(c, pal.bg, 0.8), w: wpt * 2 }, { color: K.mix(c, pal.bg, 0.5), w: wpt }]; }
    function lit(c) { return K.mix(c, '#FFFFFF', 0.55); }
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: pal.ink }, { color: pal.ink, upper: true, lsK: 0.15 }, f.w * 0.07);
    var fx0 = f.x - 8, fy0 = f.y - 4, fw = f.w + 16, fh = bottom - fy0;
    sh.rframe(fx0, fy0, fw, fh, 16, K.mix(pal.a1, pal.bg, 0.8), 7);
    sh.rframe(fx0, fy0, fw, fh, 16, K.mix(pal.a1, pal.bg, 0.5), 3.5);
    sh.rframe(fx0, fy0, fw, fh, 16, lit(pal.a1), 1.3);
    K.headline(sh, { x: f.x + 12, y: f.y + 14, w: f.w - 24, h: fh - 36 }, w.tp, {
      scale: k, pre: { color: lit(pal.a2), lsK: 0.14, size: f.w * 0.07, fx: { glow: glow(pal.a2, f.w * 0.004) } },
      num: { color: lit(pal.title), sufColor: lit(pal.a2), wk: 0.84, max: f.h * 0.32, fx: { glow: glow(pal.title, f.w * 0.008) } },
      post: { colors: [lit(pal.a1), lit(pal.a2)], max: f.w * 0.14, fx: { glow: glow(pal.a1, f.w * 0.0045) } }
    });
    return {};
  };

  // A trivia question with A-D answer buttons: the decades of their life, one ticked.
  F.quizcard = function (sh, f, w, pal, opt, k) {
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: pal.ink }, { color: pal.ink });
    var ph = Math.max(24, Math.min(54, f.w * 0.12)) * Math.max(0.8, k), gap = ph * 0.3, gridTop = bottom - (2 * ph + gap);
    var labels = decades(w).slice(0, 4), right = Math.min(2, labels.length - 1), pw = (f.w - gap) / 2;
    var good = K.visible(pal.card, pal.a2, pal.a1, pal.title), letterBg = K.visible(pal.card, pal.a1, pal.title, pal.cardInk);
    while (labels.length < 4) labels.push(labels[labels.length - 1].replace(/\d+/, function (d) { return +d + 10; }));
    labels.forEach(function (l, i) {
      var px = f.x + (i % 2) * (pw + gap), py = gridTop + Math.floor(i / 2) * (ph + gap), on = i === right;
      var fill = on ? good : pal.card, ink = on ? K.contrastOn(good) : pal.cardInk;
      sh.rrect(px, py, pw, ph, ph / 2, fill);
      var lr = ph * 0.34, lx = px + ph * 0.5;
      sh.circle(lx, py + ph / 2, lr, on ? ink : letterBg);
      var ls = ph * 0.4;
      sh.text('ABCD'[i], lx, py + ph / 2 + ls * CAP / 2, ls, 'sansBold', on ? fill : K.contrastOn(letterBg), { align: 'center' });
      var room = pw - ph * 1.05 - (on ? ph * 0.8 : ph * 0.3), ts = Math.min(ph * 0.42, K.fitLine(l, 'sansBold', room, ph * 0.42));
      sh.text(l, px + ph * 1.0, py + ph / 2 + ts * CAP / 2, ts, 'sansBold', ink);
      if (on) sh.path([px + pw - ph * 0.75, py + ph * 0.52, px + pw - ph * 0.55, py + ph * 0.72, px + pw - ph * 0.25, py + ph * 0.3], ink, Math.max(1.5, ph * 0.08));
    });
    var hb = gridTop - f.w * 0.06;
    K.headline(sh, { x: f.x, y: f.y, w: f.w, h: hb - f.y }, w.tp, {
      scale: k, pre: { color: pal.ink, lsK: 0.12, size: f.w * 0.075 },
      num: { color: pal.title, sufColor: pal.ink, wk: 0.86, max: f.h * 0.3, fx: { shadow: { color: pal.dark, dx: 0.025, dy: 0.035 } } },
      post: { colors: [pal.ink, pal.title], max: f.w * 0.14 }
    });
    return { fits: hb - f.y > f.h * 0.38, avoid: [{ x: f.x, y: gridTop, w: f.w, h: 2 * ph + gap }], confetti: { colors: party(pal), n: 18, kinds: ['star', 'dot'] } };
  };

  // ---------- Memory lane ----------
  F.newspaper = function (sh, f, w, pal, opt, k) {
    var ink = pal.ink, gray = K.mix(ink, pal.bg, 0.55), y = f.y;
    var mast = 'THE BIRTHDAY TIMES', ms = K.fitLine(mast, 'serifBold', f.w, f.w * 0.12);
    y += ms * 0.67;
    sh.text(mast, f.cx, y, ms, 'serifBold', ink, { align: 'center' });
    y += ms * 0.25;
    sh.rect(f.x, y, f.w, 2.4, ink); y += 4.4;
    var dl = 'EST. ' + w.born + '   •   SPECIAL ' + w.ord.toUpperCase() + ' BIRTHDAY EDITION   •   ' + w.year;
    var ds = Math.max(7, K.fitLine(dl, 'sansBold', f.w, f.w * 0.026, 0.06));
    if (K.wid(dl, ds, 'sansBold', ds * 0.06) > f.w) { dl = 'SPECIAL ' + w.ord.toUpperCase() + ' BIRTHDAY EDITION'; ds = K.fitLine(dl, 'sansBold', f.w, f.w * 0.026, 0.06); }
    sh.text(dl, f.cx, y + ds * 1.05, ds, 'sansBold', ink, { align: 'center', ls: ds * 0.06 });
    y += ds * 1.5;
    sh.rect(f.x, y, f.w, 1, ink); y += f.w * 0.04;
    var bottom = K.footer(sh, f, { author: w.author ? 'By ' + w.author : '' }, { font: 'serif', upper: true, lsK: 0.15, color: ink, size: Math.max(10, f.w * 0.035) });
    if (w.author) sh.rect(f.x, bottom + f.w * 0.01, f.w, 1, ink);
    y = K.textLines(sh, w.title, f.x, y, f.w, { font: 'serifBold', upper: true, max: f.w * 0.13 * k, lines: 4, fill: 1.1, color: ink, lead: 0.12 });
    if (w.sub) y = K.subtitle(sh, f, w.sub, y + f.w * 0.02, { kind: 'plain', font: 'serif', color: ink, size: K.subSize(f) * 1.05 });
    y += f.w * 0.035;
    sh.rect(f.x, y, f.w, 0.9, ink);
    y += f.w * 0.04;
    var ph = bottom - f.w * 0.03 - y, pw = f.w * 0.56, photo = K.visible(pal.bg, pal.a2, ink);
    sh.rect(f.x, y, pw, ph, photo);
    sh.frame(f.x + 4, y + 4, pw - 8, ph - 8, K.mix(photo, '#FFFFFF', 0.3), 0.8);
    var n = { color: K.visible(photo, pal.light, pal.bg) }, ns = numIn(w.tp, pw * 0.82, ph * 0.62, n);
    K.bigNum(sh, w.tp, f.x + pw / 2, y + ph / 2 - ns * CAP / 2, ns, n);
    var cx = f.x + pw + f.w * 0.04, cw = f.w - pw - f.w * 0.04, lead = Math.max(6, f.w * 0.017);
    sh.rect(cx, y, cw * 0.8, lead * 0.75, ink);
    for (var ly = y + lead * 2.2, i = 0; ly < y + ph; ly += lead, i++) sh.line(cx, ly, cx + (i % 7 === 6 ? cw * 0.55 : cw), ly, gray, 1.6);
    return { fits: ph >= f.w * 0.32 };
  };

  F.timeline = function (sh, f, w, pal, opt, k) {
    var subFill = K.visible(pal.bg, pal.a1, pal.title);
    var bottom = K.flow(sh, f, w, { kind: 'box', fill: subFill, color: K.contrastOn(subFill) }, { color: pal.ink });
    var ds = decades(w), n = ds.length, s = Math.min(14, f.w * 0.04), lw;
    for (;; s -= 0.25) { lw = K.wid('1990s', s, 'sansBold'); if (s <= 7 || n < 2 || 2 * (f.w - lw) / (n - 1) >= lw * 1.18) break; }
    var dot = s * 0.45, ty = bottom - s * 2.4 - dot, xa = f.x + lw / 2, xb = f.x + f.w - lw / 2;
    var cols = [pal.a1, pal.a2, pal.title].map(function (c) { return K.visible(pal.bg, c, pal.ink); });
    sh.line(f.X0 + 0.22 * PT, ty, f.X1 - f.B - 0.3 * PT, ty, pal.ink, 2);
    sh.poly([f.X1 - f.B - 0.3 * PT, ty - 5, f.X1 - f.B - 0.18 * PT, ty, f.X1 - f.B - 0.3 * PT, ty + 5], pal.ink);
    ds.forEach(function (d, i) {
      var x = n < 2 ? f.cx : xa + (xb - xa) * i / (n - 1), c = cols[i % 3];
      if (i === 0) sh.poly(K.starPts(x, ty, dot * 2, dot * 0.9, 5), c);
      else { sh.circle(x, ty, dot * 1.3, pal.bg); sh.circle(x, ty, dot, c); }
      sh.text(d, x, i % 2 ? ty + dot + s * 1.3 : ty - dot - s * 0.55, s, 'sansBold', pal.ink, { align: 'center' });
    });
    var hb = ty - dot - s * 2 - f.w * 0.06;
    K.headline(sh, { x: f.x, y: f.y, w: f.w, h: hb - f.y }, w.tp, {
      scale: k, pre: { color: pal.ink, lsK: 0.14, size: f.w * 0.07 },
      num: { color: pal.title, sufColor: K.visible(pal.bg, pal.a1, pal.ink), wk: 0.88, max: f.h * 0.34 },
      post: { colors: [pal.ink, K.visible(pal.bg, pal.a1, pal.ink)], max: f.w * 0.15 }
    });
    return { fits: hb - f.y > f.h * 0.4 };
  };

  F.polaroid = function (sh, f, w, pal, opt, k) {
    var card = pal.card === pal.bg ? '#FFFFFF' : pal.card, subFill = K.visible(pal.bg, pal.a1, pal.ink);
    var res = artFlow(sh, f, w, pal, k, {
      sub: { kind: 'box', fill: subFill, color: K.contrastOn(subFill) }, foot: { color: pal.ink },
      pre: { lsK: 0.14, max: f.w * 0.075 }, post: { colors: [pal.ink, K.visible(pal.bg, pal.a1, pal.ink)], max: f.w * 0.15 },
      maxH: f.w * 0.66 * 1.22, minH: f.w * 0.46 * 1.22,
      art: function (y, h) {
        var pw = Math.min(f.w * 0.66, h / 1.22), ph = pw * 1.18, x0 = f.cx - pw / 2, y0 = y + (h - ph) / 2, m = pw * 0.06;
        var shadow = K.shade(pal.bg, -0.25);
        function snap(x, yy, ww, deg, photo) {
          var hh = ww * 1.18, cx = x + ww / 2, cy = yy + hh / 2;
          sh.poly(K.turn([x + 3, yy + 4, x + ww + 3, yy + 4, x + ww + 3, yy + hh + 4, x + 3, yy + hh + 4], cx, cy, deg), shadow);
          sh.poly(K.turn([x, yy, x + ww, yy, x + ww, yy + hh, x, yy + hh], cx, cy, deg), card);
          sh.poly(K.turn([x + m, yy + m, x + ww - m, yy + m, x + ww - m, yy + hh - ww * 0.22, x + m, yy + hh - ww * 0.22], cx, cy, deg), photo);
        }
        snap(x0 - pw * 0.42, y0 + ph * 0.08, pw * 0.86, -10, K.visible(card, pal.a2, pal.ink));
        snap(x0 + pw * 0.56, y0 + ph * 0.02, pw * 0.86, 8, K.visible(card, pal.a3, pal.title));
        var photo = K.visible(card, pal.a1, pal.title, pal.ink);
        snap(x0, y0, pw, 0, photo);
        var px = x0 + m, py = y0 + m, pww = pw - 2 * m, phh = ph - m - pw * 0.22;
        sh.circle(px + pww * 0.8, py + phh * 0.2, pww * 0.09, K.mix(photo, '#FFFFFF', 0.35));
        sh.poly([px, py + phh, px, py + phh * 0.78, px + pww * 0.3, py + phh * 0.66, px + pww * 0.62, py + phh * 0.8, px + pww, py + phh * 0.7, px + pww, py + phh], K.shade(photo, -0.22));
        var n = { color: K.visible(photo, pal.light, '#FFFFFF', pal.ink), sufColor: null, fx: { shadow: { color: K.shade(photo, -0.4), dx: 0.02, dy: 0.03 } } };
        var ns = numIn(w.tp, pww * 0.84, phh * 0.55, n);
        K.bigNum(sh, w.tp, f.cx, py + phh * 0.46 - ns * CAP / 2, ns, n);
        var cap = w.born + ' – ' + w.year, cs = K.fitLine(cap, 'serif', pww, pw * 0.075);
        sh.text(cap, f.cx, y0 + ph - pw * 0.11 + cs * 0.33, cs, 'serif', K.contrastOn(card), { align: 'center' });
        sh.poly(K.turn([f.cx - pw * 0.16, y0 - pw * 0.045, f.cx + pw * 0.16, y0 - pw * 0.045, f.cx + pw * 0.16, y0 + pw * 0.05, f.cx - pw * 0.16, y0 + pw * 0.05], f.cx, y0, -4), K.mix(pal.light, pal.a3, 0.3));
        return { avoid: [{ x: x0 - pw * 0.5, y: y0 - 6, w: pw * 2, h: ph + 12 }] };
      }
    });
    return res;
  };

  F.americana = function (sh, f, w, pal, opt, k) {
    var navy = pal.a1, idx = sh.items.length;
    var bottom = K.footer(sh, f, w, { color: pal.light, band: navy, upper: true, lsK: 0.12 });
    var m = w.sub ? K.subLines(w.sub, { kind: 'box', fill: pal.card, color: pal.cardInk }, f) : { h: 0 };
    var stripesMin = Math.max(f.h * 0.2, m.h + f.w * 0.16);
    var hd = K.headline(sh, { x: f.x, y: f.y, w: f.w, h: bottom - stripesMin - f.y }, w.tp, {
      scale: k, pre: { color: pal.light, lsK: 0.14, size: f.w * 0.075 },
      num: { color: pal.title, sufColor: pal.light, wk: 0.88, max: f.h * 0.34, fx: { shadow: { color: pal.bg, dx: 0.03, dy: 0.04 } } },
      post: { colors: [pal.light], max: f.w * 0.14 }
    });
    var split = hd.bottom + f.w * 0.06;
    if (w.sub) K.subtitle(sh, f, w.sub, split + (bottom - split - m.h) / 2, { kind: 'box', fill: pal.card, color: pal.cardInk });
    under(sh, idx, function () {
      sh.rect(f.X0, 0, f.X1 - f.X0, split, navy);
      var sh7 = (f.H - split) / 9;
      for (var i = 0; i < 9; i += 2) sh.rect(f.X0, split + i * sh7 + sh7, f.X1 - f.X0, sh7, pal.light);
    });
    return { fits: bottom - split >= m.h + 20, confetti: { colors: [pal.light], n: 30, kinds: ['star'], box: { x: f.X0, y: 0, w: f.X1 - f.X0, h: split - 4 } } };
  };

  F.chalkboard = function (sh, f, w, pal, opt, k) {
    var wood = pal.card, X = f.X0, T = f.B, W = f.X1 - f.X0 - f.B, H = f.H - 2 * f.B, fr = 0.26 * PT;
    sh.rect(f.X0, 0, f.X1 - f.X0, f.H, wood);
    for (var g = 0; g < 6; g++) {
      sh.line(f.X0, T + fr * (0.2 + g * 0.11), f.X1, T + fr * (0.2 + g * 0.11) + 1.5, K.shade(wood, -0.18), 0.8);
      sh.line(f.X0, T + H - fr * (0.2 + g * 0.11), f.X1, T + H - fr * (0.2 + g * 0.11) - 1.5, K.shade(wood, -0.18), 0.8);
    }
    var bx = X + fr, by = T + fr, bw = W - 2 * fr, bh = H - 2 * fr;
    sh.rect(bx, by, bw, bh, pal.bg);
    sh.frame(bx, by, bw, bh, K.shade(wood, -0.3), 1.5);
    var cols = [pal.a1, pal.a2, pal.a3, pal.light];
    var gb = garland(sh, bx + 4, bx + bw - 4, by + 6, f.w * 0.06, f.w * 0.06, cols, pal.light);
    var fi = inset(f, 6);
    var bottom = K.flow(sh, fi, w, { kind: 'plain', color: pal.ink }, { color: pal.ink });
    var hy = Math.max(fi.y, gb + f.w * 0.04);
    K.headline(sh, { x: fi.x, y: hy, w: fi.w, h: bottom - hy }, w.tp, {
      scale: k, pre: { color: pal.ink, lsK: 0.12, size: f.w * 0.075 },
      num: { color: pal.bg, sufColor: pal.a1, wk: 0.86, max: f.h * 0.32, fx: { outline: { color: pal.light, w: Math.max(1.2, f.w * 0.0055) } } },
      post: { colors: [pal.a1, pal.light, pal.a3], max: f.w * 0.14 }
    });
    return { fits: bottom - hy > f.h * 0.4, avoid: [{ x: bx, y: by, w: bw, h: gb - by }], confetti: { colors: cols, n: 20, kinds: ['ostar', 'swirl', 'dot'], box: { x: bx + 4, y: by + 4, w: bw - 8, h: bh - 8 } } };
  };

  F.roadsign = function (sh, f, w, pal, opt, k) {
    var idx = sh.items.length, green = pal.a1, road = pal.a2;
    var bottom = K.footer(sh, f, w, { color: pal.light, upper: true, lsK: 0.12 });
    var m = w.sub ? K.subLines(w.sub, { kind: 'box', fill: pal.light, color: pal.ink }, f) : { h: 0 };
    var subY = bottom - m.h, hz = subY - f.w * 0.1;
    if (w.sub) K.subtitle(sh, f, w.sub, subY, { kind: 'box', fill: pal.light, color: pal.ink });
    var tabH = f.w * 0.1, signTop = f.y + tabH - 2, top = signTop + 14;
    var hd = K.headline(sh, { x: f.x + 10, y: top, w: f.w - 20, h: hz - f.w * 0.16 - top - 14 }, w.tp, {
      scale: k, valign: 'top', pre: { color: pal.light, lsK: 0.12, size: f.w * 0.07 },
      num: { color: pal.light, sufColor: pal.light, wk: 0.84, max: f.h * 0.3 },
      post: { colors: [pal.light], max: f.w * 0.13 }
    });
    var signBot = hd.bottom + 14;
    var tw = f.w * 0.34, tx = f.x + f.w - tw - 4, label = 'EXIT ' + w.age, ts = Math.min(tabH * 0.5, K.fitLine(label, 'sansBold', tw - 14, tabH * 0.5, 0.05));
    sh.text(label, tx + tw / 2, signTop - tabH + 2 + tabH / 2 + ts * CAP / 2, ts, 'sansBold', pal.light, { align: 'center', ls: ts * 0.05 });
    under(sh, idx, function () {
      var FW = f.X1 - f.X0;
      [[0.2, 0.12], [0.75, 0.06]].forEach(function (c) {
        var cx = f.X0 + FW * c[0], cy = f.B + f.H * c[1], r = f.w * 0.06;
        sh.ellipse(cx, cy, r * 1.6, r * 0.7, pal.light); sh.circle(cx - r * 0.6, cy - r * 0.3, r * 0.7, pal.light); sh.circle(cx + r * 0.4, cy - r * 0.5, r * 0.85, pal.light);
      });
      sh.rect(f.X0, hz, FW, f.H - hz, K.mix(green, '#7BB661', 0.55));
      sh.poly([f.cx - f.w * 0.05, hz, f.cx + f.w * 0.05, hz, f.cx + FW * 0.48, f.H, f.cx - FW * 0.48, f.H], road);
      for (var i = 0; i < 6; i++) {
        var t0 = i / 6 + 0.04, t1 = t0 + 0.08, y0 = hz + (f.H - hz) * t0, y1 = hz + (f.H - hz) * t1, w0 = 1 + 4 * t0, w1 = 1 + 4 * t1;
        sh.poly([f.cx - w0, y0, f.cx + w0, y0, f.cx + w1, y1, f.cx - w1, y1], pal.a3);
      }
      [-1, 1].forEach(function (s) { sh.rect(f.cx + s * f.w * 0.25 - f.w * 0.018, signBot - 4, f.w * 0.036, hz - signBot + 10, K.shade(road, -0.2)); });
      sh.rrect(tx, signTop - tabH + 2, tw, tabH + 8, 6, green);
      sh.rframe(tx + 3, signTop - tabH + 5, tw - 6, tabH + 2, 4, pal.light, 1.5);
      sh.rrect(f.x - 4, signTop, f.w + 8, signBot - signTop, 10, green);
      sh.rframe(f.x + 2, signTop + 6, f.w - 4, signBot - signTop - 12, 7, pal.light, 2.2);
    });
    return { fits: hz - signBot > f.w * 0.06 };
  };

  CX.coverFronts = F;
})(typeof window !== 'undefined' ? window : globalThis);
