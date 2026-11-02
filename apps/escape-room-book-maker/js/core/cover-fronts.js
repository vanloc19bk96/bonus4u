/*
 * The fronts of the cover templates. A front is one drawing of the setting plus one way of laying
 * out the words around it. Every word stays inside the safe box f = { x, y, w, h, cx }; shapes may
 * run out to the bleed (f.X0..f.X1 across, 0..f.H down). A layout returns { fits }: the cover shrinks
 * the words by k until the drawing has room. The words follow what sells this kind of book: a big
 * title, what's inside as numbers, and the promise that no phone is needed.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var K = CX.cover.kit;

  function deg(a) { return a * Math.PI / 180; }

  // ---------- the drawings: each fills the box b = { x, y, w, h } ----------
  var ART = {};

  // A big keyhole with light coming through it.
  ART.keyhole = function (sh, b, pal) {
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.min(b.w, b.h) * 0.48;
    sh.circle(cx, cy, R, K.mix(pal.bg, pal.a1, 0.12));
    sh.ring(cx, cy, R, pal.a1, Math.max(1.5, R * 0.03));
    sh.ring(cx, cy, R * 0.9, pal.a1, 1);
    for (var i = 0; i < 24; i++) { var a = deg(i * 15); sh.circle(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95, Math.max(1, R * 0.012), pal.a1); }
    var s = R * 0.52;
    sh.circle(cx, cy - s * 0.42, s * 0.55, pal.a1);
    sh.poly([cx - s * 0.26, cy - s * 0.2, cx + s * 0.26, cy - s * 0.2, cx + s * 0.5, cy + s * 1.05, cx - s * 0.5, cy + s * 1.05], pal.a1);
    sh.circle(cx, cy - s * 0.42, s * 0.34, pal.bg);
    sh.poly([cx - s * 0.13, cy - s * 0.22, cx + s * 0.13, cy - s * 0.22, cx + s * 0.28, cy + s * 0.85, cx - s * 0.28, cy + s * 0.85], pal.bg);
  };

  // A safe dial with a handle.
  ART.dial = function (sh, b, pal) {
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.min(b.w, b.h) * 0.48, i, a;
    sh.circle(cx, cy, R, pal.a1);
    sh.circle(cx, cy, R * 0.93, K.shade(pal.bg, 0.08));
    for (i = 0; i < 40; i++) {
      a = deg(i * 9 - 90);
      var big = i % 5 === 0;
      sh.line(cx + Math.cos(a) * R * 0.91, cy + Math.sin(a) * R * 0.91, cx + Math.cos(a) * R * (big ? 0.78 : 0.84), cy + Math.sin(a) * R * (big ? 0.78 : 0.84), pal.a1, big ? Math.max(1.5, R * 0.016) : 1);
      if (big) { var size = Math.max(7, R * 0.075); sh.text(String(i), cx + Math.cos(a) * R * 0.68, cy + Math.sin(a) * R * 0.68 + size * 0.34, size, 'sansBold', pal.a2, { align: 'center' }); }
    }
    sh.ring(cx, cy, R * 0.56, pal.a1, Math.max(1.5, R * 0.02));
    sh.circle(cx, cy, R * 0.34, pal.a1);
    sh.circle(cx, cy, R * 0.12, pal.bg);
    for (i = 0; i < 3; i++) {
      a = deg(i * 120 - 90);
      sh.line(cx + Math.cos(a) * R * 0.12, cy + Math.sin(a) * R * 0.12, cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, pal.a3, Math.max(2.5, R * 0.05), true);
      sh.circle(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, R * 0.06, pal.a3);
    }
  };

  // A door standing ajar, light falling out of it.
  ART.door = function (sh, b, pal) {
    var h = b.h, w = Math.min(b.w * 0.56, h * 0.56), cx = b.x + b.w / 2, x = cx - w / 2, base = b.y + h, rad = w / 2, top = b.y + rad, pts = [x, base, x, top], a;
        for (a = 180; a <= 360; a += 8) pts.push(cx + Math.cos(deg(a)) * rad, top + Math.sin(deg(a)) * rad);
    pts.push(x + w, base);
    sh.poly(pts, pal.a1);
    // the door leaf swings in, with a dark edge
    var leaf = [x + w * 0.08, base, x + w * 0.08, top - rad * 0.05];
    for (a = 180; a <= 300; a += 10) leaf.push(cx + Math.cos(deg(a)) * rad * 0.9, top + Math.sin(deg(a)) * rad * 0.9);
    leaf.push(x + w * 0.56, base);
    sh.poly(leaf, K.shade(pal.bg, -0.25));
    sh.path(pts, pal.a2, Math.max(2, w * 0.016));
    for (var i = 1; i < 4; i++) sh.line(x + w * (0.08 + i * 0.12), top - rad * 0.3, x + w * (0.08 + i * 0.12), base, pal.bg, 1);
    sh.ring(x + w * 0.46, top + (base - top) * 0.5, w * 0.03, pal.a1, 1.5);
    sh.rect(cx - b.w * 0.46, base - 1.5, b.w * 0.92, 3, pal.a1);
  };

  // An old key across the whole cover.
  ART.key = function (sh, b, pal) {
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2, L = Math.min(b.h * 0.92, b.w * 1.25), R = L * 0.2, top = cy - L / 2 + R;
    sh.ring(cx, top, R * 0.72, pal.a1, R * 0.36);
    sh.ring(cx, top, R * 1.02, pal.a2, 1.2);
    sh.rect(cx - L * 0.035, top + R * 0.86, L * 0.07, L * 0.68 - R, pal.a1);
    [0.26, 0.31].forEach(function (t) { sh.rect(cx - L * 0.06, top + L * t, L * 0.12, L * 0.022, pal.a1); });
    var end = cy + L / 2;
    [0, 0.12].forEach(function (t, i) { sh.rect(cx, end - L * (0.1 + t), L * (i ? 0.13 : 0.2), L * 0.07, pal.a1); });
  };

  // A padlock with dials.
  ART.padlock = function (sh, b, pal) {
    var cx = b.x + b.w / 2, W = Math.min(b.w * 0.72, b.h * 0.72), H = W * 0.72, y1 = b.y + b.h - H - b.h * 0.02, R = W * 0.3, pts = [];
    for (var a = 180; a <= 360; a += 8) pts.push(cx + Math.cos(deg(a)) * R, y1 - R * 0.1 + Math.sin(deg(a)) * R);
    pts.unshift(cx - R, y1 + H * 0.1); pts.push(cx + R, y1 + H * 0.1);
    sh.path(pts, pal.a2, W * 0.075);
    sh.rrect(cx - W / 2, y1, W, H, W * 0.06, pal.a1);
    sh.rrect(cx - W * 0.42, y1 + H * 0.12, W * 0.84, H * 0.76, W * 0.04, K.shade(pal.bg, 0.06));
    var ds = W * 0.2, digits = '7305';
    for (var i = 0; i < 4; i++) {
      var dx = cx - ds * 2 + i * ds + ds * 0.08;
      sh.rrect(dx, y1 + H * 0.28, ds * 0.84, H * 0.44, ds * 0.08, pal.card);
      sh.text(digits[i], dx + ds * 0.42, y1 + H * 0.28 + H * 0.31, ds * 0.72, 'sansBold', pal.cardInk, { align: 'center' });
    }
  };

  // A big house against the moon.
  ART.manor = function (sh, b, pal, rng) {
    var w = b.w, h = b.h, x = b.x, base = b.y + h, sil = K.shade(pal.bg, -0.45), lit = pal.a1;
    var mr = Math.min(w, h) * 0.36;
    sh.circle(x + w * 0.5, b.y + h * 0.38, mr, K.mix(pal.bg, pal.light, 0.82));
    [[-0.35, -0.3, 0.16], [0.3, -0.42, 0.1], [0.4, 0.05, 0.13], [-0.1, 0.25, 0.09]].forEach(function (c) { sh.circle(x + w * 0.5 + c[0] * mr, b.y + h * 0.38 + c[1] * mr, c[2] * mr, K.mix(pal.bg, pal.light, 0.68)); });
    var body = [x, base, x, base - h * 0.28, x + w * 0.1, base - h * 0.28, x + w * 0.1, base - h * 0.52, x + w * 0.16, base - h * 0.64, x + w * 0.22, base - h * 0.52, x + w * 0.22, base - h * 0.4, x + w * 0.36, base - h * 0.4, x + w * 0.5, base - h * 0.72, x + w * 0.64, base - h * 0.4, x + w * 0.76, base - h * 0.4, x + w * 0.76, base - h * 0.58, x + w * 0.82, base - h * 0.7, x + w * 0.88, base - h * 0.58, x + w * 0.88, base - h * 0.3, x + w, base - h * 0.3, x + w, base];
    sh.poly(body, sil);
    sh.rect(x + w * 0.66, base - h * 0.62, w * 0.03, h * 0.2, sil);
    var rows = [0.34, 0.24, 0.14], cols = [0.05, 0.16, 0.28, 0.4, 0.5, 0.6, 0.71, 0.82, 0.93];
    rows.forEach(function (r) { cols.forEach(function (c) { if (rng.next() < 0.55) sh.rect(x + w * c - w * 0.012, base - h * r, w * 0.024, h * 0.05, lit); }); });
    sh.poly([x + w * 0.46, base, x + w * 0.46, base - h * 0.1, x + w * 0.5, base - h * 0.14, x + w * 0.54, base - h * 0.1, x + w * 0.54, base], lit);
  };

  // A night train in the snow.
  ART.train = function (sh, b, pal, rng) {
    var x = b.X0, w = b.X1 - b.X0, base = b.y + b.h, h = b.h, sil = K.shade(pal.bg, -0.5), lit = pal.a1, i;
    sh.circle(b.x + b.w * 0.76, b.y + h * 0.26, Math.min(b.w, h) * 0.17, pal.a2);
    for (i = 0; i < 70; i++) sh.circle(x + rng.next() * w, b.y + rng.next() * h * 0.82, 0.8 + rng.next() * 1.6, pal.light);
    var hill = [x, base - h * 0.2];
    for (i = 0; i <= 12; i++) hill.push(x + w * i / 12, base - h * (0.26 + 0.1 * Math.sin(i * 1.1)));
    hill.push(x + w, base, x, base);
    sh.poly(hill, K.mix(pal.bg, pal.a2, 0.3));
    var carH = h * 0.2, y = base - carH - h * 0.1, carW = w * 0.33;
    for (i = 0; i < 3; i++) {
      var cx = x + i * (carW + w * 0.012);
      sh.rrect(cx, y, carW, carH, carH * 0.14, sil);
      for (var k = 0; k < 4; k++) sh.rect(cx + carW * (0.09 + k * 0.22), y + carH * 0.2, carW * 0.13, carH * 0.32, lit);
      [0.2, 0.8].forEach(function (t) { sh.circle(cx + carW * t, y + carH + h * 0.02, h * 0.024, sil); });
    }
    sh.rect(x, base - h * 0.075, w, h * 0.012, pal.a2);
    sh.rect(x, base - h * 0.06, w, h * 0.06, K.mix(pal.bg, pal.light, 0.9));
  };

  // A stepped temple with a sun behind it.
  ART.temple = function (sh, b, pal) {
    var cx = b.x + b.w / 2, base = b.y + b.h, h = b.h, w = b.w, sil = K.shade(pal.bg, -0.4), steps = 6, i;
    sh.circle(cx, base - h * 0.54, Math.min(w, h) * 0.38, pal.a1);
    for (i = 0; i < 16; i++) {
      var a = deg(i * 22.5), R = Math.min(w, h) * 0.42;
      sh.line(cx + Math.cos(a) * R, base - h * 0.54 + Math.sin(a) * R, cx + Math.cos(a) * R * 1.13, base - h * 0.54 + Math.sin(a) * R * 1.13, pal.a1, 2.4, true);
    }
    for (i = 0; i < steps; i++) {
      var sw = w * (0.98 - i * 0.13), st = h * 0.1;
      sh.rect(cx - sw / 2, base - (i + 1) * st, sw, st - 1, i % 2 ? sil : K.mix(sil, pal.bg, 0.35));
    }
    sh.rect(cx - w * 0.07, base - h * 0.74, w * 0.14, h * 0.14, sil);
    sh.poly([cx - w * 0.05, base, cx - w * 0.05, base - h * 0.2, cx, base - h * 0.26, cx + w * 0.05, base - h * 0.2, cx + w * 0.05, base], pal.a1);
  };

  // A liner on the swell.
  ART.ship = function (sh, b, pal, rng) {
    var x = b.x, w = b.w, h = b.h, base = b.y + h, sil = K.shade(pal.bg, -0.45), i, k;
    sh.circle(x + w * 0.22, b.y + h * 0.2, Math.min(w, h) * 0.13, pal.a2);
    sh.poly([x + w * 0.02, base - h * 0.36, x + w * 0.98, base - h * 0.36, x + w * 0.86, base - h * 0.12, x + w * 0.12, base - h * 0.12], sil);
    sh.rect(x + w * 0.16, base - h * 0.46, w * 0.68, h * 0.1, sil);
    sh.rect(x + w * 0.26, base - h * 0.54, w * 0.46, h * 0.08, sil);
    [0.34, 0.5, 0.66].forEach(function (t) {
      sh.poly([x + w * t - w * 0.035, base - h * 0.54, x + w * t + w * 0.035, base - h * 0.54, x + w * t + w * 0.045, base - h * 0.74, x + w * t - w * 0.025, base - h * 0.74], pal.a3);
      sh.rect(x + w * t - w * 0.025, base - h * 0.74, w * 0.07, h * 0.03, sil);
    });
    for (i = 0; i < 14; i++) sh.circle(x + w * (0.16 + i * 0.05), base - h * 0.28, w * 0.008, pal.a1);
    for (i = 0; i < 12; i++) if (rng.next() < 0.75) sh.rect(x + w * (0.18 + i * 0.055), base - h * 0.43, w * 0.022, h * 0.04, pal.a1);
    for (k = 0; k < 3; k++) {
      var wave = [b.X0, base, b.X0, base - h * (0.16 - k * 0.05)];
      for (i = 0; i <= 24; i++) wave.push(b.X0 + (b.X1 - b.X0) * i / 24, base - h * (0.16 - k * 0.05) + Math.sin(i * 1.3 + k) * h * 0.012);
      wave.push(b.X1, base);
      sh.poly(wave, K.mix(pal.bg, pal.a2, 0.2 + k * 0.14));
    }
  };

  // A station turning over a planet.
  ART.station = function (sh, b, pal, rng) {
    var cx = b.x + b.w / 2, cy = b.y + b.h * 0.46, R = Math.min(b.w, b.h) * 0.38, i;
    for (i = 0; i < 90; i++) sh.circle(b.X0 + rng.next() * (b.X1 - b.X0), b.y + rng.next() * b.h, 0.6 + rng.next() * 1.2, pal.light);
    sh.poly(K.circleBand(cx, b.y + b.h + R * 0.72, R * 1.05 + R * 0.17, b.y, b.y + b.h), pal.a3);
    sh.poly(K.circleBand(cx, b.y + b.h + R * 0.82, R * 1.05 + R * 0.17, b.y, b.y + b.h), K.mix(pal.bg, pal.a3, 0.45));
    sh.ring(cx, cy, R, pal.a1, R * 0.16);
    sh.ring(cx, cy, R * 1.09, pal.a2, 1);
    sh.ring(cx, cy, R * 0.91, pal.a2, 1);
    for (i = 0; i < 16; i++) { var a = deg(i * 22.5); sh.circle(cx + Math.cos(a) * R, cy + Math.sin(a) * R, Math.max(1.3, R * 0.03), pal.bg); }
    for (i = 0; i < 4; i++) { var t = deg(i * 90 + 45); sh.line(cx, cy, cx + Math.cos(t) * R * 0.9, cy + Math.sin(t) * R * 0.9, pal.a2, Math.max(2, R * 0.05)); }
    sh.circle(cx, cy, R * 0.24, pal.a2);
    sh.circle(cx, cy, R * 0.13, pal.bg);
  };

  // A museum front.
  ART.columns = function (sh, b, pal) {
    var x = b.x + b.w * 0.03, w = b.w * 0.94, base = b.y + b.h, h = b.h, roof = base - h * 0.76, n = 6, i;
    sh.poly([x + w * 0.5, b.y + h * 0.02, x + w, roof, x, roof], pal.a1);
    sh.poly([x + w * 0.5, b.y + h * 0.1, x + w * 0.88, roof - h * 0.012, x + w * 0.12, roof - h * 0.012], K.shade(pal.bg, 0.05));
    sh.rect(x, roof, w, h * 0.05, pal.a1);
    for (i = 0; i < n; i++) {
      var cw = w * 0.085, cx = x + w * 0.05 + i * (w * 0.9 - cw) / (n - 1);
      sh.rect(cx, roof + h * 0.05, cw, h * 0.6, K.mix(pal.bg, pal.a2, 0.72));
      sh.rect(cx - cw * 0.14, roof + h * 0.05, cw * 1.28, h * 0.02, pal.a1);
      sh.rect(cx - cw * 0.14, base - h * 0.11, cw * 1.28, h * 0.02, pal.a1);
    }
    sh.rect(x - b.w * 0.02, base - h * 0.09, w + b.w * 0.04, h * 0.045, pal.a1);
    sh.rect(x - b.w * 0.03, base - h * 0.045, w + b.w * 0.06, h * 0.045, K.shade(pal.a1, -0.2));
  };

  // A radar scope, one blip on it.
  ART.radar = function (sh, b, pal) {
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.min(b.w, b.h) * 0.48, i;
    sh.circle(cx, cy, R, K.shade(pal.bg, -0.3));
    [1, 0.75, 0.5, 0.25].forEach(function (t) { sh.ring(cx, cy, R * t, pal.a2, t === 1 ? 2.5 : 1); });
    for (i = 0; i < 6; i++) { var a = deg(i * 30); sh.line(cx - Math.cos(a) * R, cy - Math.sin(a) * R, cx + Math.cos(a) * R, cy + Math.sin(a) * R, pal.a2, 0.9); }
    sh.poly(K.arcBand(cx, cy, 0, R, -80, -30), K.mix(pal.bg, pal.a1, 0.6));
    sh.line(cx, cy, cx + Math.cos(deg(-30)) * R, cy + Math.sin(deg(-30)) * R, pal.a1, 2.5, true);
    sh.circle(cx + R * 0.38, cy - R * 0.42, R * 0.05, pal.a3);
    sh.circle(cx - R * 0.45, cy + R * 0.3, R * 0.03, pal.a1);
  };

  // A wall of cogs.
  function cog(sh, cx, cy, r, color, hole, odd) {
    var pts = [], n = 12, s = Math.PI / n;
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2 + (odd ? s : 0);
      [[-0.5, 0.8], [-0.28, 1], [0.28, 1], [0.5, 0.8]].forEach(function (k) { pts.push(cx + Math.cos(a + k[0] * s) * r * k[1], cy + Math.sin(a + k[0] * s) * r * k[1]); });
    }
    sh.poly(pts, color);
    sh.circle(cx, cy, r * 0.28, hole);
  }
  ART.gear = function (sh, b, pal) {
    var cs = Math.min(b.w / 3, b.h / 3), x = b.x + b.w / 2 - cs * 1.5, y = b.y + b.h / 2 - cs * 1.5, spots = [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1], [2, 2], [0, 0]];
    spots.forEach(function (s, i) { cog(sh, x + (s[1] + 0.5) * cs, y + (s[0] + 0.5) * cs, cs * 0.54, i % 2 ? pal.a1 : pal.a2, pal.bg, (s[0] + s[1]) % 2 === 1); });
  };

  // A carnival tent under a big moon.
  ART.moon = function (sh, b, pal, rng) {
    var cx = b.x + b.w / 2, base = b.y + b.h, h = b.h, w = b.w, sil = K.shade(pal.bg, -0.5), i;
    sh.circle(cx, b.y + h * 0.36, Math.min(w, h) * 0.34, pal.a1);
    for (i = 0; i < 40; i++) sh.circle(b.X0 + rng.next() * (b.X1 - b.X0), b.y + rng.next() * h * 0.5, 0.6 + rng.next(), pal.light);
    sh.poly([cx, base - h * 0.66, cx + w * 0.42, base - h * 0.34, cx + w * 0.42, base, cx - w * 0.42, base, cx - w * 0.42, base - h * 0.34], sil);
    for (i = 0; i < 6; i += 2) {
      var x0 = cx - w * 0.42 + i * w * 0.14;
      sh.poly([cx, base - h * 0.66, x0, base - h * 0.34, x0 + w * 0.14, base - h * 0.34], pal.a3);
      sh.rect(x0, base - h * 0.34, w * 0.14, h * 0.34, K.mix(sil, pal.a3, 0.55));
    }
    sh.poly([cx - w * 0.07, base, cx, base - h * 0.2, cx + w * 0.07, base], pal.a1);
    sh.line(cx, base - h * 0.66, cx, base - h * 0.76, sil, 2);
    sh.poly([cx, base - h * 0.76, cx + w * 0.08, base - h * 0.725, cx, base - h * 0.69], pal.a3);
  };

  // A tree and a star in the snow.
  ART.star = function (sh, b, pal, rng) {
    var cx = b.x + b.w / 2, base = b.y + b.h, h = b.h, w = Math.min(b.w, h * 0.9), i;
    for (i = 0; i < 80; i++) sh.circle(b.X0 + rng.next() * (b.X1 - b.X0), b.y + rng.next() * h, 0.8 + rng.next() * 1.6, pal.light);
    [[0, 0.46, 0.44], [0.26, 0.38, 0.4], [0.5, 0.28, 0.34]].forEach(function (t) {
      sh.poly([cx, base - h * (t[0] + t[2] + 0.08), cx + w * t[1], base - h * (t[0] + 0.08), cx - w * t[1], base - h * (t[0] + 0.08)], pal.a2);
    });
    sh.rect(cx - w * 0.05, base - h * 0.08, w * 0.1, h * 0.08, K.shade(pal.a1, -0.4));
    sh.poly(K.starPts(cx, base - h * 0.93, h * 0.07, h * 0.03, 5), pal.a1);
    for (i = 0; i < 18; i++) {
      var t = 0.15 + rng.next() * 0.65, sp = (1 - t) * w * 0.38;
      sh.circle(cx + (rng.next() - 0.5) * sp * 1.6, base - h * (0.08 + t * 0.8), Math.max(1.5, h * 0.012), i % 2 ? pal.a1 : pal.a3);
    }
  };

  // ---------- the words ----------
  // Rooms, puzzles and the way out, in one line.
  function strip(w) { return w.rooms + ' ROOMS  ·  ' + w.puzzles + ' PUZZLES  ·  1 WAY OUT'; }

  function sealAt(sh, f, pal, y, side) {
    var r = f.w * 0.135;
    if (r < 22) return;
    K.seal(sh, side === 'left' ? f.x + r : f.x + f.w - r, y, r, ['NO APP', 'JUST A', 'PENCIL'], pal.a3, K.contrastOn(pal.a3), { ring: true });
  }

  function frameLines(sh, f, pal) {
    var m = 0.13 * 72, x = f.X0 + m, y = f.B + m, w = f.X1 - f.X0 - f.B - m * 2, h = f.H - 2 * f.B - m * 2;
    sh.frame(x, y, w, h, pal.a1, 2);
    sh.frame(x + 4, y + 4, w - 8, h - 8, pal.a1, 0.9);
  }

  /*
   * Title on top, the drawing under it, the numbers and the pen name at the foot.
   * opt: { art, frame, band (title on a colored band), low (words under the drawing), seal }
   */
  function poster(sh, f, w, pal, o, k, rng) {
    if (o.frame) frameLines(sh, f, pal);
    var inset = o.frame ? f.w * 0.05 : 0, tx = f.x + inset, tw = f.w - inset * 2, y = f.y + (o.frame ? f.h * 0.012 : 0), ink = pal.ink, ey = Math.max(8.5, Math.min(12.5, f.w * 0.033));
    var line = 'AN ESCAPE ROOM PUZZLE BOOK';
    sh.text(line, f.cx, y + ey, ey, 'sansBold', K.visible(pal.bg, pal.a1, ink), { align: 'center', ls: ey * 0.16 });
    y += ey * 1.8;
    var start = sh.items.length, titleTop = y;
    var color = o.band ? K.contrastOn(pal.a3) : pal.title;
    function words(top) {
      return K.textLines(sh, w.title, tx, top, tw, { font: 'sansBold', upper: true, lines: 4, color: color, max: f.w * 0.15 * k, min: 12, fill: 1.2, lead: 0.1 });
    }
    var titleBottom = words(titleTop + (o.band ? ey : 0));
    if (o.band) {
      var keep = sh.items.splice(start);
      sh.rect(f.X0, titleTop, f.X1 - f.X0, titleBottom - titleTop + ey, pal.a3);
      keep.forEach(function (it) { sh.items.push(it); });
      titleBottom += ey;
    }
    y = titleBottom + f.h * 0.012;
    // the foot, from the bottom up
    var bottom = K.footer(sh, f, w, { color: ink, upper: false, font: 'sansBold', gap: 0.7 });
    var sSize = Math.max(9, Math.min(13, f.w * 0.038));
    var st = K.fitLine(strip(w), 'sansBold', tw, sSize, 0.03);
    sh.text(strip(w), f.cx, bottom - st * 0.1, st, 'sansBold', K.visible(pal.bg, pal.a1, ink), { align: 'center', ls: st * 0.03 });
    bottom -= st * 1.5;
    var m = K.subLines(w.sub, { kind: 'plain', font: 'sans', w: tw }, f);
    K.subtitle(sh, f, w.sub, bottom - m.h, { kind: 'plain', font: 'sans', color: ink, w: tw });
    bottom -= m.h + f.h * 0.012;
    var artH = bottom - y;
    if (artH < f.h * 0.26) return { fits: false };
    var box = { x: f.x + inset, y: y, w: tw, h: artH, X0: f.X0, X1: f.X1 };
    // the drawing goes under the words already placed
    var mark = sh.items.length;
    ART[o.art](sh, box, pal, rng);
    var art = sh.items.splice(mark);
    Array.prototype.splice.apply(sh.items, [start, 0].concat(art));
    if (o.seal) sealAt(sh, f, pal, y + artH * 0.14, o.seal);
    return { fits: true };
  }

  CX.coverFronts = { poster: poster, ART: ART };
})(typeof window !== 'undefined' ? window : globalThis);
