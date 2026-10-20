/*
 * Line and shape drawings for the cover designs: figures, vehicles, buildings, props and badges.
 * Everything is built from the cover sheet's simple items (rect, line, ellipse, poly, text), so the
 * preview and the PDF draw it the same way and nothing depends on an image file.
 * Shapes are written in unit coordinates and scaled into place; y points down, as on the page.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};

  // ---------- color and geometry ----------
  function rgb(c) { c = c.replace('#', ''); return [parseInt(c.substr(0, 2), 16), parseInt(c.substr(2, 2), 16), parseInt(c.substr(4, 2), 16)]; }
  // a solid blend of two colors (the PDF has no transparency), t = 0 gives a, 1 gives b
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return '#' + x.map(function (v, i) { var m = Math.round(v + (y[i] - v) * t); return (m < 16 ? '0' : '') + m.toString(16); }).join('').toUpperCase();
  }
  // turn flat points about (cx, cy); deg turns counterclockwise on the page, like text angles
  function turn(pts, cx, cy, deg) {
    var a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), out = [];
    for (var i = 0; i < pts.length; i += 2) {
      var dx = pts[i] - cx, dy = pts[i + 1] - cy;
      out.push(cx + dx * ca + dy * sa, cy - dx * sa + dy * ca);
    }
    return out;
  }
  function box(x, y, w, h) { return [x, y, x + w, y, x + w, y + h, x, y + h]; }
  // points on an ellipse; angles in degrees clockwise from 3 o'clock
  function arc(cx, cy, rx, ry, a0, a1, n) {
    var out = [];
    n = n || Math.max(6, Math.ceil(Math.abs(a1 - a0) / 8));
    for (var i = 0; i <= n; i++) {
      var t = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
      out.push(cx + rx * Math.cos(t), cy + ry * Math.sin(t));
    }
    return out;
  }
  function rbox(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return [].concat(arc(x + w - r, y + r, r, r, -90, 0, 5), arc(x + w - r, y + h - r, r, r, 0, 90, 5),
      arc(x + r, y + h - r, r, r, 90, 180, 5), arc(x + r, y + r, r, r, 180, 270, 5));
  }
  // unit shape -> page: x scaled by s (times sx, -1 mirrors), y by s
  function place(pts, x, y, s, sx) {
    var out = [];
    for (var i = 0; i < pts.length; i += 2) out.push(x + pts[i] * s * (sx || 1), y + pts[i + 1] * s);
    return out;
  }
  function dot(sh, cx, cy, r, c) { sh.ellipse(cx, cy, r, r, null, 1, c); }

  // ---------- figures (h is the full height; top is the top of the head) ----------
  // a man in a hat and trench coat, standing
  function coat(sh, cx, top, h, c) {
    var P = function (p) { return place(p, cx, top, h); };
    sh.poly(P([-0.06, 0.135, 0.06, 0.135, 0.14, 0.165, 0.175, 0.21, 0.19, 0.46, 0.215, 0.79, 0.035, 0.8, 0, 0.74, -0.035, 0.8, -0.215, 0.79, -0.19, 0.46, -0.175, 0.21, -0.14, 0.165]), c);
    sh.poly(P([-0.105, 0.78, -0.03, 0.78, -0.035, 0.985, -0.1, 0.985]), c);
    sh.poly(P([0.03, 0.78, 0.105, 0.78, 0.1, 0.985, 0.035, 0.985]), c);
    sh.ellipse(cx - 0.08 * h, top + 0.99 * h, 0.05 * h, 0.014 * h, null, 1, c);
    sh.ellipse(cx + 0.08 * h, top + 0.99 * h, 0.05 * h, 0.014 * h, null, 1, c);
    sh.poly(P([-0.03, 0.1, 0.03, 0.1, 0.036, 0.15, -0.036, 0.15]), c);
    sh.ellipse(cx, top + 0.088 * h, 0.046 * h, 0.056 * h, null, 1, c);
    sh.poly(P([-0.06, 0.072, -0.05, 0.008, 0, -0.002, 0.05, 0.008, 0.06, 0.072]), c);
    sh.ellipse(cx, top + 0.07 * h, 0.122 * h, 0.019 * h, null, 1, c);
  }
  // a hooded figure, head and shoulders (width about 0.96 h)
  function hood(sh, cx, top, h, c, face) {
    var pts = [-0.48, 1, -0.46, 0.8, -0.36, 0.66, -0.24, 0.6, -0.27, 0.42].concat(arc(0, 0.34, 0.27, 0.34, 180, 360, 16)).concat([0.27, 0.42, 0.24, 0.6, 0.36, 0.66, 0.46, 0.8, 0.48, 1]);
    sh.poly(place(pts, cx, top, h), c);
    if (face) sh.ellipse(cx, top + 0.42 * h, 0.13 * h, 0.17 * h, null, 1, face);
  }
  // head and shoulders for a line-up (width about 0.92 h)
  function bust(sh, cx, top, h, c, female) {
    if (female) sh.poly(place(arc(0, 0.25, 0.205, 0.235, 180, 360, 14).concat([0.235, 0.62, -0.235, 0.62]), cx, top, h), c);
    sh.ellipse(cx, top + 0.27 * h, 0.15 * h, 0.19 * h, null, 1, c);
    sh.poly(place([-0.07, 0.4, 0.07, 0.4, 0.08, 0.57, -0.08, 0.57], cx, top, h), c);
    sh.poly(place([-0.46, 1, -0.44, 0.74, -0.34, 0.63, -0.1, 0.56, 0.1, 0.56, 0.34, 0.63, 0.44, 0.74, 0.46, 1], cx, top, h), c);
  }
  // a woman in a dress, standing
  function dress(sh, cx, top, h, c) {
    var P = function (p) { return place(p, cx, top, h); };
    sh.ellipse(cx, top + 0.075 * h, 0.044 * h, 0.054 * h, null, 1, c);
    sh.ellipse(cx - 0.032 * h, top + 0.035 * h, 0.03 * h, 0.03 * h, null, 1, c);
    sh.poly(P([-0.022, 0.115, 0.022, 0.115, 0.028, 0.15, -0.028, 0.15]), c);
    sh.poly(P([-0.05, 0.145, 0.05, 0.145, 0.1, 0.17, 0.105, 0.3, 0.075, 0.36, 0.21, 0.67, -0.21, 0.67, -0.075, 0.36, -0.105, 0.3, -0.1, 0.17]), c);
    sh.poly(P([0.095, 0.17, 0.125, 0.2, 0.15, 0.43, 0.125, 0.44, 0.105, 0.26]), c);
    sh.poly(P([-0.095, 0.17, -0.125, 0.2, -0.15, 0.43, -0.125, 0.44, -0.105, 0.26]), c);
    sh.poly(P([-0.07, 0.66, -0.03, 0.66, -0.036, 0.965, -0.06, 0.965]), c);
    sh.poly(P([0.03, 0.66, 0.07, 0.66, 0.06, 0.965, 0.036, 0.965]), c);
    sh.poly(P([-0.064, 0.955, -0.02, 0.965, -0.018, 0.99, -0.078, 0.99]), c);
    sh.poly(P([0.02, 0.955, 0.064, 0.965, 0.078, 0.99, 0.018, 0.99]), c);
  }
  var FIGURES = { coat: coat, hood: hood, bust: bust, dress: dress };

  // ---------- vehicles and buildings ----------
  // an ocean liner seen from the side; wy is the waterline, w the length, bow to the right
  function ship(sh, cx, wy, w, c, accent, light) {
    var P = function (p) { return place(p, cx, wy, w); };
    sh.poly(P([-0.5, -0.1, 0.45, -0.1, 0.5, -0.135, 0.46, 0.02, -0.44, 0.02, -0.475, -0.035]), c);
    sh.poly(P([-0.37, -0.099, 0.33, -0.099, 0.31, -0.14, -0.35, -0.14]), c);
    sh.poly(P([-0.29, -0.139, 0.25, -0.139, 0.23, -0.175, -0.27, -0.175]), c);
    [-0.15, -0.01, 0.13].forEach(function (fx) {
      sh.poly(P([fx - 0.035, -0.174, fx + 0.035, -0.174, fx + 0.022, -0.29, fx - 0.048, -0.29]), c);
      sh.poly(P([fx - 0.046, -0.262, fx + 0.024, -0.262, fx + 0.022, -0.29, fx - 0.048, -0.29]), accent);
    });
    if (light) for (var i = 0; i < 24; i++) dot(sh, cx + (-0.4 + i * 0.034) * w, wy - 0.06 * w, 0.0065 * w, light);
    var lw = Math.max(0.8, w * 0.004);
    sh.line(cx - 0.39 * w, wy - 0.1 * w, cx - 0.41 * w, wy - 0.33 * w, c, lw);
    sh.line(cx + 0.37 * w, wy - 0.1 * w, cx + 0.35 * w, wy - 0.31 * w, c, lw);
    sh.line(cx - 0.41 * w, wy - 0.33 * w, cx + 0.35 * w, wy - 0.31 * w, c, lw * 0.5);
  }
  // a steam locomotive pulling two carriages; x0 is the left end, ry the rail, w the length
  function train(sh, x0, ry, w, c, light) {
    var P = function (p) { return place(p, x0, ry, w); };
    [0, 0.27].forEach(function (cx0) {
      sh.poly(P([cx0 + 0.01, -0.03, cx0 + 0.255, -0.03, cx0 + 0.255, -0.13, cx0 + 0.245, -0.148, cx0 + 0.02, -0.148, cx0 + 0.01, -0.13]), c);
      for (var i = 0; i < 5; i++) sh.rect(x0 + (cx0 + 0.035 + i * 0.044) * w, ry - 0.118 * w, 0.03 * w, 0.034 * w, light);
      dot(sh, x0 + (cx0 + 0.055) * w, ry - 0.022 * w, 0.02 * w, c);
      dot(sh, x0 + (cx0 + 0.21) * w, ry - 0.022 * w, 0.02 * w, c);
    });
    sh.poly(P([0.53, -0.03, 0.62, -0.03, 0.62, -0.17, 0.635, -0.17, 0.635, -0.185, 0.515, -0.185, 0.515, -0.17, 0.53, -0.17]), c);
    sh.rect(x0 + 0.545 * w, ry - 0.155 * w, 0.05 * w, 0.04 * w, light);
    sh.poly(P([0.62, -0.035, 0.9, -0.035, 0.9, -0.118, 0.62, -0.118]), c);
    sh.ellipse(x0 + 0.9 * w, ry - 0.0765 * w, 0.012 * w, 0.0415 * w, null, 1, c);
    sh.poly(P([0.835, -0.115, 0.865, -0.115, 0.87, -0.165, 0.885, -0.18, 0.815, -0.18, 0.83, -0.165]), c);
    sh.ellipse(x0 + 0.74 * w, ry - 0.118 * w, 0.025 * w, 0.02 * w, null, 1, c);
    sh.poly(P([0.9, -0.04, 0.975, -0.005, 0.975, 0, 0.9, 0]), c);
    dot(sh, x0 + 0.915 * w, ry - 0.11 * w, 0.011 * w, light);
    [0.66, 0.725, 0.79].forEach(function (wx) { dot(sh, x0 + wx * w, ry - 0.03 * w, 0.03 * w, c); });
    dot(sh, x0 + 0.87 * w, ry - 0.017 * w, 0.017 * w, c);
    sh.line(x0 + 0.66 * w, ry - 0.03 * w, x0 + 0.79 * w, ry - 0.03 * w, light, Math.max(0.8, w * 0.005));
  }
  // an airliner seen from above, nose to the right, turned by deg
  function plane(sh, cx, cy, w, c, deg) {
    var up = [0.5, 0, 0.47, -0.03, 0.1, -0.034, -0.07, -0.42, -0.14, -0.42, -0.04, -0.036, -0.36, -0.032, -0.44, -0.17, -0.49, -0.17, -0.46, -0.02];
    var pts = up.slice();
    for (var i = up.length - 2; i >= 2; i -= 2) pts.push(up[i], -up[i + 1]);
    pts.push(-0.5, 0);
    sh.poly(turn(place(pts, cx, cy, w), cx, cy, deg || 0), c);
  }
  // a building front with a grid of windows, one of them lit
  function building(sh, x, top, w, bottom, o) {
    var floors = o.floors || 6, cols = o.cols || 5;
    sh.rect(x, top, w, bottom - top, o.body);
    var mx = w * 0.09, gx = w * 0.05, ww = (w - mx * 2 - gx * (cols - 1)) / cols;
    var usable = (bottom - top) * (o.door ? 0.82 : 0.94), my = (bottom - top) * 0.05;
    var gy = Math.min(ww * 0.55, usable / floors * 0.32), wh = (usable - my - gy * (floors - 1)) / floors;
    var lit = o.litIndex == null ? -1 : o.litIndex;
    for (var f = 0; f < floors; f++) for (var k = 0; k < cols; k++) {
      var wx = x + mx + k * (ww + gx), wy = top + my + f * (wh + gy), i = f * cols + k;
      sh.rect(wx, wy, ww, wh, i === lit ? o.lit : o.win);
      if (i === lit && o.figure) bust(sh, wx + ww / 2, wy + wh * 0.3, wh * 0.7, o.body, false);
      if (o.mullion && i !== lit) sh.line(wx + ww / 2, wy, wx + ww / 2, wy + wh, o.body, Math.max(0.6, ww * 0.06));
    }
    if (o.door) {
      var dw = Math.min(w * 0.2, ww * 1.6), dh = (bottom - top) * 0.13;
      sh.rect(x + w / 2 - dw / 2, bottom - dh, dw, dh, o.win);
      sh.line(x + w / 2, bottom - dh, x + w / 2, bottom, o.body, Math.max(0.8, dw * 0.04));
    }
    return { winW: ww, winH: wh };
  }
  // a classical museum front: steps, columns and a pediment
  function temple(sh, x, top, w, bottom, o) {
    var h = bottom - top, pedH = h * 0.2, entH = h * 0.1, stepH = h * 0.1;
    sh.poly([x + w * 0.02, top + pedH, x + w / 2, top, x + w * 0.98, top + pedH], o.body);
    sh.poly([x + w * 0.12, top + pedH * 0.86, x + w / 2, top + pedH * 0.2, x + w * 0.88, top + pedH * 0.86], o.win);
    sh.rect(x, top + pedH, w, entH, o.body);
    var colTop = top + pedH + entH, colBot = bottom - stepH, n = o.columns || 6;
    var cw = w * 0.07, gap = (w * 0.9 - cw * n) / (n - 1);
    sh.rect(x + w * 0.05, colTop, w * 0.9, colBot - colTop, o.win);
    var lit = o.litIndex == null ? -1 : o.litIndex % (n - 1);
    for (var i = 0; i < n; i++) {
      var cx0 = x + w * 0.05 + i * (cw + gap);
      if (i < n - 1 && i === lit) {
        sh.rect(cx0 + cw, colTop + (colBot - colTop) * 0.35, gap, (colBot - colTop) * 0.65, o.lit);
        if (o.figure) { var fh = Math.min((colBot - colTop) * 0.55, gap * 0.85 / 0.43); coat(sh, cx0 + cw + gap / 2, colBot - fh, fh, o.win); }
      }
      sh.rect(cx0, colTop, cw, colBot - colTop, o.body);
      sh.rect(cx0 - cw * 0.18, colTop, cw * 1.36, (colBot - colTop) * 0.05, o.body);
      sh.rect(cx0 - cw * 0.18, colBot - (colBot - colTop) * 0.05, cw * 1.36, (colBot - colTop) * 0.05, o.body);
    }
    for (var s = 0; s < 3; s++) sh.rect(x - w * 0.03 * s, colBot + stepH / 3 * s, w + w * 0.06 * s, stepH / 3 + 0.5, s % 2 ? o.win : o.body);
    return { band: { x: x, y: top + pedH, w: w, h: entH } };
  }
  // a street lamp with a glow around its light
  function lamp(sh, x, baseY, h, c, glow, bg, gs) {
    var lw = Math.max(1.2, h * 0.018), hy = baseY - h;
    for (var i = 6; i >= 1; i--) dot(sh, x, hy + h * 0.06, h * 0.07 * i * (gs || 1), mix(bg, glow, (7 - i) / 7 * 0.45));
    sh.line(x, baseY, x, hy + h * 0.1, c, lw);
    sh.rect(x - lw * 2, baseY - h * 0.03, lw * 4, h * 0.03, c);
    sh.poly([x - h * 0.045, hy + h * 0.02, x + h * 0.045, hy + h * 0.02, x + h * 0.03, hy + h * 0.1, x - h * 0.03, hy + h * 0.1], glow);
    sh.poly([x - h * 0.06, hy + h * 0.025, x, hy - h * 0.02, x + h * 0.06, hy + h * 0.025], c);
  }

  // ---------- props ----------
  function magnifier(sh, cx, cy, r, c, lw, glass, deg) {
    if (glass) dot(sh, cx, cy, r, glass);
    sh.ellipse(cx, cy, r, r, c, lw);
    var a = (deg == null ? -45 : deg) * Math.PI / 180;
    var x1 = cx + Math.cos(a) * r, y1 = cy - Math.sin(a) * r, L = r * 1.25, hw = r * 0.14;
    var ux = Math.cos(a), uy = -Math.sin(a), nx = -uy, ny = ux;
    sh.poly([x1 + nx * hw * 0.6, y1 + ny * hw * 0.6, x1 + ux * L * 0.25 + nx * hw * 0.6, y1 + uy * L * 0.25 + ny * hw * 0.6,
      x1 + ux * L * 0.25 + nx * hw, y1 + uy * L * 0.25 + ny * hw, x1 + ux * L + nx * hw, y1 + uy * L + ny * hw,
      x1 + ux * L - nx * hw, y1 + uy * L - ny * hw, x1 + ux * L * 0.25 - nx * hw, y1 + uy * L * 0.25 - ny * hw,
      x1 + ux * L * 0.25 - nx * hw * 0.6, y1 + uy * L * 0.25 - ny * hw * 0.6, x1 - nx * hw * 0.6, y1 - ny * hw * 0.6], c);
  }
  // a loop fingerprint: nested hairpin ridges around a core, their tails running down,
  // trimmed to the oval of a fingertip, with a few breaks
  function fingerprint(sh, cx, cy, r, c, lw, rng) {
    var RY = r * 1.32, d = lw * 2.8, n = Math.ceil(r * 1.3 / d);
    var kx = cx + r * 0.03, ky = cy - r * 0.16, bottom = cy + RY + d;
    function inside(x, y) { var dx = (x - cx) / r, dy = (y - cy) / RY; return dx * dx + dy * dy <= 1; }
    function draw(pts) {
      var seg = [];
      function flush() { if (seg.length >= 6) sh.poly(seg, null, c, lw, false, true); seg = []; }
      for (var i = 0; i < pts.length; i += 2) {
        if (!inside(pts[i], pts[i + 1]) || rng() < 0.011) { flush(); continue; }
        seg.push(pts[i], pts[i + 1]);
      }
      flush();
    }
    draw([kx, ky - d * 0.1, kx + d * 0.04, ky + r * 0.3, kx + (bottom - ky) * 0.12, bottom]);
    for (var i = 1; i <= n; i++) {
      var w = i * d * 0.92, h = w * 1.22, pts = [], steps = 28;
      for (var t = steps; t >= 1; t--) { var yy = ky + (bottom - ky) * t / steps; pts.push(kx - w + (yy - ky) * 0.12, yy); }
      pts = pts.concat(arc(kx, ky, w, h, 180, 360, 14 + i * 2));
      for (var t2 = 1; t2 <= steps; t2++) { var y2 = ky + (bottom - ky) * t2 / steps; pts.push(kx + w + (y2 - ky) * 0.12, y2); }
      draw(pts);
    }
  }
  // a starburst badge
  function burst(sh, cx, cy, r, c, points, deg) {
    var pts = [], n = (points || 14) * 2;
    for (var i = 0; i < n; i++) {
      var a = (i / n * 360 + (deg || 0)) * Math.PI / 180, rr = i % 2 ? r * 0.84 : r;
      pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    sh.poly(pts, c);
  }
  // a map pin
  function pin(sh, cx, tipY, s, c, hole) {
    var r = s * 0.32, cy = tipY - s * 0.68;
    sh.poly(arc(cx, cy, r, r, 155, 385, 16).concat([cx, tipY]), c);
    if (hole) dot(sh, cx, cy, r * 0.42, hole);
  }
  function check(sh, x, y, s, c) { sh.poly([x, y - s * 0.45, x + s * 0.35, y - s * 0.1, x + s, y - s * 0.85], null, c, Math.max(1.2, s * 0.18), false, true); }
  function cross(sh, cx, cy, s, c, lw) {
    sh.line(cx - s, cy - s, cx + s, cy + s, c, lw, true);
    sh.line(cx - s, cy + s, cx + s, cy - s, c, lw, true);
  }
  function paperclip(sh, x, y, h, c, lw) {
    var w = h * 0.28;
    var wire = [x + w * 0.62, y + h * 0.32, x + w * 0.62, y + h * 0.82].concat(arc(x + w * 0.4, y + h * 0.82, w * 0.22, w * 0.22, 0, 180, 6))
      .concat([x + w * 0.18, y + h * 0.16]).concat(arc(x + w * 0.5, y + h * 0.16, w * 0.32, w * 0.32, 180, 360, 8))
      .concat([x + w * 0.82, y + h * 0.9]).concat(arc(x + w * 0.5, y + h * 0.9, w * 0.32, w * 0.32, 0, 180, 8)).concat([x + w * 0.18, y + h * 0.55]);
    sh.poly(wire, null, c, lw, false, true);
  }
  function snowflake(sh, cx, cy, r, c, lw) {
    for (var i = 0; i < 3; i++) {
      var a = (i * 60 + 90) * Math.PI / 180, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
      sh.line(cx - dx, cy - dy, cx + dx, cy + dy, c, lw, true);
      [-1, 1].forEach(function (sg) {
        var bx = cx + dx * 0.6 * sg, by = cy + dy * 0.6 * sg;
        [-1, 1].forEach(function (sd) {
          var b = a + sd * 0.7 + (sg < 0 ? Math.PI : 0);
          sh.line(bx, by, bx + Math.cos(b) * r * 0.32, by + Math.sin(b) * r * 0.32, c, lw * 0.8, true);
        });
      });
    }
  }
  function pine(sh, cx, baseY, h, c, snow) {
    var w = h * 0.62;
    [[0, 0.42, 1], [0.24, 0.62, 0.78], [0.46, 0.82, 0.56]].forEach(function (t) {
      var y0 = baseY - h * 0.14 - h * t[0] * 0.86, y1 = baseY - h * 0.14 - h * t[1] * 1.0;
      sh.poly([cx - w * t[2] / 2, y0, cx + w * t[2] / 2, y0, cx, y1 - h * 0.1], c);
      if (snow) sh.poly([cx - w * t[2] * 0.16, y1 + h * 0.04, cx + w * t[2] * 0.16, y1 + h * 0.04, cx, y1 - h * 0.1], snow);
    });
    sh.rect(cx - w * 0.06, baseY - h * 0.15, w * 0.12, h * 0.15, c);
  }
  function pumpkin(sh, cx, cy, r, c, dark, stem) {
    sh.ellipse(cx - r * 0.42, cy, r * 0.62, r * 0.8, null, 1, mix(c, dark, 0.18));
    sh.ellipse(cx + r * 0.42, cy, r * 0.62, r * 0.8, null, 1, mix(c, dark, 0.18));
    sh.ellipse(cx, cy, r * 0.62, r * 0.84, null, 1, c);
    sh.poly([cx - r * 0.08, cy - r * 0.78, cx + r * 0.06, cy - r * 0.78, cx + r * 0.2, cy - r * 1.12, cx + r * 0.08, cy - r * 1.14], stem);
    sh.poly([cx - r * 0.42, cy - r * 0.08, cx - r * 0.16, cy - r * 0.08, cx - r * 0.29, cy - r * 0.34], dark);
    sh.poly([cx + r * 0.16, cy - r * 0.08, cx + r * 0.42, cy - r * 0.08, cx + r * 0.29, cy - r * 0.34], dark);
    var m = [cx - r * 0.5, cy + r * 0.18];
    for (var i = 1; i <= 8; i++) m.push(cx - r * 0.5 + r * i / 8, cy + r * (i % 2 ? 0.34 : 0.24) + Math.sin(i / 8 * Math.PI) * r * 0.14);
    m.push(cx + r * 0.5, cy + r * 0.18);
    for (var j = 7; j >= 1; j--) m.push(cx - r * 0.5 + r * j / 8, cy + r * 0.22 + Math.sin(j / 8 * Math.PI) * r * 0.2 + (j % 2 ? 0.06 * r : 0.16 * r));
    sh.poly(m, dark);
  }
  function bat(sh, cx, cy, w, c) {
    var half = [0, -0.06, 0.06, -0.12, 0.08, -0.04, 0.22, -0.14, 0.36, -0.1, 0.5, 0.02, 0.4, 0.0, 0.33, 0.07, 0.24, 0.02, 0.16, 0.1, 0.08, 0.04, 0, 0.12];
    var pts = [];
    for (var i = 0; i < half.length; i += 2) pts.push(half[i], half[i + 1]);
    for (var k = half.length - 4; k >= 2; k -= 2) pts.push(-half[k], half[k + 1]);
    sh.poly(place(pts, cx, cy, w), c);
    sh.poly(place([-0.05, -0.08, -0.035, -0.16, -0.015, -0.1, 0.015, -0.1, 0.035, -0.16, 0.05, -0.08], cx, cy, w), c);
  }
  function teacup(sh, cx, baseY, w, c, inner, drop) {
    sh.ellipse(cx, baseY, w * 0.62, w * 0.1, null, 1, c);
    sh.ellipse(cx, baseY - w * 0.015, w * 0.46, w * 0.07, null, 1, inner);
    var top = baseY - w * 0.52;
    sh.ellipse(cx + w * 0.44, top + w * 0.2, w * 0.13, w * 0.12, c, w * 0.05);
    sh.poly([cx - w * 0.45, top].concat(arc(cx, top + w * 0.02, w * 0.45, w * 0.48, 180, 0, 18)).concat([cx + w * 0.45, top]), c);
    sh.ellipse(cx, top, w * 0.45, w * 0.07, null, 1, inner);
    sh.ellipse(cx, top + w * 0.01, w * 0.4, w * 0.05, null, 1, mix(inner, c, 0.35));
    if (drop) {
      sh.poly(arc(cx + w * 0.34, baseY - w * 0.035, w * 0.04, w * 0.04, 0, 180, 8).concat([cx + w * 0.34, baseY - w * 0.12]), drop);
      sh.ellipse(cx + w * 0.22, baseY + w * 0.02, w * 0.07, w * 0.02, null, 1, drop);
    }
  }
  function steam(sh, cx, bottom, h, c, lw) {
    [-1, 0, 1].forEach(function (k) {
      var pts = [];
      for (var i = 0; i <= 12; i++) pts.push(cx + k * h * 0.22 + Math.sin(i / 12 * Math.PI * 2 + k) * h * 0.07, bottom - h * i / 12);
      sh.poly(pts, null, c, lw, false, true);
    });
  }
  function cat(sh, cx, baseY, h, c) {
    sh.ellipse(cx, baseY - h * 0.3, h * 0.26, h * 0.3, null, 1, c);
    sh.ellipse(cx + h * 0.02, baseY - h * 0.74, h * 0.17, h * 0.15, null, 1, c);
    sh.poly([cx - h * 0.14, baseY - h * 0.8, cx - h * 0.12, baseY - h * 1.0, cx - h * 0.02, baseY - h * 0.86], c);
    sh.poly([cx + h * 0.06, baseY - h * 0.86, cx + h * 0.16, baseY - h * 1.0, cx + h * 0.18, baseY - h * 0.8], c);
    var tail = [];
    for (var i = 0; i <= 10; i++) tail.push(cx + h * 0.2 + h * 0.3 * i / 10, baseY - h * 0.05 - Math.sin(i / 10 * Math.PI) * h * 0.18 - (i > 7 ? (i - 7) * h * 0.06 : 0));
    sh.poly(tail, null, c, h * 0.07, false, true);
  }
  function phone(sh, cx, cy, s, c) {
    // a classic handset: two cups joined by a curved grip
    var grip = arc(cx, cy + s * 0.55, s * 0.62, s * 0.62, 205, 335, 14);
    sh.poly(grip, null, c, s * 0.2, false, true);
    var ends = [[grip[0], grip[1], 25], [grip[grip.length - 2], grip[grip.length - 1], -25]];
    ends.forEach(function (e) {
      sh.poly(turn(rbox(e[0] - s * 0.2, e[1] - s * 0.02, s * 0.4, s * 0.2, s * 0.08), e[0], e[1], e[2]), c);
    });
    return ends;
  }
  function coil(sh, x0, y0, x1, y1, r, loops, c, lw) {
    var pts = [], n = loops * 10;
    for (var i = 0; i <= n; i++) {
      var t = i / n, a = t * loops * Math.PI * 2;
      pts.push(x0 + (x1 - x0) * t + Math.cos(a) * r, y0 + (y1 - y0) * t + Math.sin(a) * r);
    }
    sh.poly(pts, null, c, lw, false, true);
  }
  function keyhole(sh, cx, cy, r, c) {
    dot(sh, cx, cy, r, c);
    sh.poly([cx - r * 0.42, cy + r * 0.5, cx + r * 0.42, cy + r * 0.5, cx + r * 0.75, cy + r * 2.4, cx - r * 0.75, cy + r * 2.4], c);
  }
  function waves(sh, x, y, w, amp, n, c, lw) {
    var pts = [];
    for (var i = 0; i <= n * 8; i++) pts.push(x + w * i / (n * 8), y + Math.sin(i / 8 * Math.PI * 2) * amp);
    sh.poly(pts, null, c, lw, false, true);
  }
  function moon(sh, cx, cy, r, c, bg, crescent) {
    dot(sh, cx, cy, r, c);
    if (crescent) dot(sh, cx + r * 0.42, cy - r * 0.2, r * 0.86, bg);
  }
  // a rubber stamp: two frames and a word, turned
  function stamp(sh, kit, str, cx, cy, size, c, deg) {
    var w = kit.width(str, size, 'sansBold', size * 0.12) + size * 1.4, h = size * 1.75;
    sh.poly(turn(box(cx - w / 2, cy - h / 2, w, h), cx, cy, deg), null, c, Math.max(1.2, size * 0.1), true);
    sh.poly(turn(box(cx - w / 2 + size * 0.22, cy - h / 2 + size * 0.22, w - size * 0.44, h - size * 0.44), cx, cy, deg), null, c, Math.max(0.6, size * 0.04), true);
    turnedText(sh, kit, str, cx, cy, size, 'sansBold', c, deg, size * 0.12);
    return { w: w, h: h };
  }
  // text centered on (cx, cy), turned by deg; letterspacing ls is approximated by spaces-free placement
  function turnedText(sh, kit, str, cx, cy, size, font, c, deg, ls, hs) {
    var F = kit.font(font), w = kit.width(str, size, font, ls || 0, hs), a = deg * Math.PI / 180;
    var ca = Math.cos(a), sa = Math.sin(a), half = F.capHeight * size / 2;
    // start of the baseline: back along the text direction, then down by half the cap height
    var x = cx - (w / 2) * ca + half * sa, y = cy + (w / 2) * sa + half * ca;
    if (!ls) { sh.text(str, x, y, size, font, c, deg, hs); return w; }
    var s = kit.txt(str, font);
    for (var i = 0; i < s.length; i++) {
      if (s[i] !== ' ') sh.text(s[i], x, y, size, font, c, deg, hs);
      var adv = (F.width(s[i], size) + ls) * (hs || 1);
      x += adv * ca; y -= adv * sa;
    }
    return w;
  }
  function barcode(sh, x, y, w, h, c, rng) {
    var cx = x;
    while (cx < x + w - 2) {
      var bw = [0.8, 1.2, 2][Math.floor(rng() * 3)];
      sh.rect(cx, y, bw, h, c);
      cx += bw + [0.9, 1.6][Math.floor(rng() * 2)];
    }
  }
  // a sheet with a torn bottom edge
  function torn(x, y, w, h, rng, teeth) {
    var pts = [x, y, x + w, y], n = teeth || 18;
    for (var i = n; i >= 0; i--) pts.push(x + w * i / n, y + h - (i % 2 ? h * 0.025 : 0) - rng() * h * 0.02);
    return pts;
  }
  // a rectangle with ragged edges, for posters and scraps of paper
  function ragged(x, y, w, h, rng, j) {
    var pts = [], n = 14;
    for (var i = 0; i < n; i++) pts.push(x + w * i / n, y + (rng() - 0.5) * j);
    for (var k = 0; k < n; k++) pts.push(x + w + (rng() - 0.5) * j, y + h * k / n);
    for (var m = n; m > 0; m--) pts.push(x + w * m / n, y + h + (rng() - 0.5) * j);
    for (var q = n; q > 0; q--) pts.push(x + (rng() - 0.5) * j, y + h * q / n);
    return pts;
  }

  LK.coverArt = {
    mix: mix, turn: turn, box: box, arc: arc, rbox: rbox, place: place, dot: dot,
    figures: FIGURES, coat: coat, hood: hood, bust: bust, dress: dress,
    ship: ship, train: train, plane: plane, building: building, temple: temple, lamp: lamp,
    magnifier: magnifier, fingerprint: fingerprint, burst: burst, pin: pin, check: check, cross: cross, paperclip: paperclip,
    snowflake: snowflake, pine: pine, pumpkin: pumpkin, bat: bat, teacup: teacup, steam: steam, cat: cat,
    phone: phone, coil: coil, keyhole: keyhole, waves: waves, moon: moon, stamp: stamp, turnedText: turnedText,
    barcode: barcode, torn: torn, ragged: ragged
  };
})(typeof window !== 'undefined' ? window : globalThis);
