/*
 * The paperback cover as one full-wrap sheet: back, spine and front with 0.125 in bleed, sized
 * from the trim, paper and page count (KDP's cover calculator formula).
 * A template is a front layout (drawn in cover-fronts.js) plus its own colors; the colors can be
 * swapped for any palette. The 30 templates follow the looks that sell this kind of puzzle book
 * on Amazon: a board of round letters with one bright trail, big titles, plain bold colors.
 * Every word on the front stays inside the safe box f (0.375 in from the trim).
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var KDP = CX.kdp, P = CX.plan;
  var PT = 72;
  var F = null;

  // bg: the cover; title: the big words; ink: words on bg; a1, a2, a3: accents; light: highlights;
  // card/cardInk: panels and their words; dark: shadows.
  var PALETTES = [
    { id: 'sky', label: 'Sky & sun', bg: '#EAF6FB', title: '#12355B', ink: '#12355B', a1: '#F5C518', a2: '#AEDFF0', a3: '#E4572E', light: '#FFFFFF', card: '#FFFFFF', cardInk: '#12355B', dark: '#12355B' },
    { id: 'ocean', label: 'Ocean', bg: '#0F4C75', title: '#FFFFFF', ink: '#FFFFFF', a1: '#F9C80E', a2: '#BBE1FA', a3: '#F86624', light: '#FFFFFF', card: '#FFFFFF', cardInk: '#0F4C75', dark: '#072A42' },
    { id: 'navy', label: 'Midnight', bg: '#14213D', title: '#FCA311', ink: '#FFFFFF', a1: '#FCA311', a2: '#E5E5E5', a3: '#E63946', light: '#FFFFFF', card: '#FDF6E3', cardInk: '#14213D', dark: '#070E1E' },
    { id: 'teal', label: 'Teal', bg: '#0E7C7B', title: '#FFFFFF', ink: '#FFFFFF', a1: '#FFD23F', a2: '#D4F1EF', a3: '#EE4266', light: '#FFFFFF', card: '#FFFFFF', cardInk: '#0B4F4E', dark: '#063B3A' },
    { id: 'forest', label: 'Forest', bg: '#1E4D2B', title: '#F7E7B4', ink: '#FFFFFF', a1: '#F2C14E', a2: '#CFE5C7', a3: '#E76F51', light: '#FFFFFF', card: '#FFF8E6', cardInk: '#1E4D2B', dark: '#0B2414' },
    { id: 'plum', label: 'Plum', bg: '#4B1D3F', title: '#F2C14E', ink: '#FFFFFF', a1: '#F2C14E', a2: '#E9C6DD', a3: '#F26A8D', light: '#FFFFFF', card: '#FFF6EA', cardInk: '#4B1D3F', dark: '#22091C' },
    { id: 'coral', label: 'Coral', bg: '#E4572E', title: '#FFFFFF', ink: '#FFFFFF', a1: '#FFC914', a2: '#FFE1D6', a3: '#17BEBB', light: '#FFFFFF', card: '#FFF8F2', cardInk: '#7C2410', dark: '#7C2410' },
    { id: 'sunny', label: 'Sunny', bg: '#FFD23F', title: '#1F2A44', ink: '#1F2A44', a1: '#E4572E', a2: '#FFFFFF', a3: '#2274A5', light: '#FFFFFF', card: '#FFFFFF', cardInk: '#1F2A44', dark: '#1F2A44' },
    { id: 'cream', label: 'Cream', bg: '#F7F1E3', title: '#22333B', ink: '#22333B', a1: '#C8553D', a2: '#E3D9C6', a3: '#2A7F62', light: '#FFFFFF', card: '#FFFDF7', cardInk: '#22333B', dark: '#22333B' },
    { id: 'mint', label: 'Mint', bg: '#DDF3E4', title: '#14532D', ink: '#14532D', a1: '#F97316', a2: '#FFFFFF', a3: '#0F766E', light: '#FFFFFF', card: '#FFFFFF', cardInk: '#14532D', dark: '#14532D' },
    { id: 'blush', label: 'Blush', bg: '#FBE4E6', title: '#8E2A4E', ink: '#4A1D2E', a1: '#D6336C', a2: '#FFFFFF', a3: '#6B9080', light: '#FFFFFF', card: '#FFFFFF', cardInk: '#4A1D2E', dark: '#4A1D2E' },
    { id: 'lavender', label: 'Lavender', bg: '#E8E3F7', title: '#3C2A77', ink: '#2C1F5C', a1: '#7C3AED', a2: '#FFFFFF', a3: '#EC4899', light: '#FFFFFF', card: '#FFFFFF', cardInk: '#2C1F5C', dark: '#2C1F5C' },
    { id: 'kraft', label: 'Kraft paper', bg: '#D2B48C', title: '#3B2A1A', ink: '#2A1C10', a1: '#9C2F1F', a2: '#F5E9D6', a3: '#2E5E4E', light: '#FFFDF7', card: '#FFFDF7', cardInk: '#2A1C10', dark: '#3B2A1A' },
    { id: 'noir', label: 'Black & gold', bg: '#151515', title: '#D4AF37', ink: '#F5E6B8', a1: '#D4AF37', a2: '#3A3A3A', a3: '#D4AF37', light: '#F7E7A9', card: '#F5E6B8', cardInk: '#151515', dark: '#000000' }
  ];

  var GROUPS = [
    { id: 'bright', label: 'Bright' },
    { id: 'bold', label: 'Bold' },
    { id: 'calm', label: 'Calm' }
  ];

  var DESIGNS = [
    { id: 'bubbles', label: 'Letter board', group: 'bright', layout: 'bubbles', pal: 'sky', hint: 'A board of round letters and one bright trail under the title.' },
    { id: 'tiles-sunny', label: 'Sunny tiles', group: 'bright', layout: 'tiles', pal: 'sunny', hint: 'Rounded letter tiles on yellow.' },
    { id: 'band-sky', label: 'Blue band', group: 'bright', layout: 'band', pal: 'sky', hint: 'The title in a band across the top.' },
    { id: 'corner-coral', label: 'Coral corner', group: 'bright', layout: 'corner', pal: 'coral', hint: 'The board runs off the corner of the book.' },
    { id: 'frame-sunny', label: 'Round frame', group: 'bright', layout: 'frame', pal: 'sunny', hint: 'Rounds all the way round the edge.' },
    { id: 'count-mint', label: 'Big count', group: 'bright', layout: 'count', pal: 'mint', hint: 'A huge number of puzzles.' },
    { id: 'ribbon-sky', label: 'Winding trail', group: 'bright', layout: 'ribbon', pal: 'sky', hint: 'One thick trail winding across the cover.' },
    { id: 'spelled-sunny', label: 'Spelled title', group: 'bright', layout: 'spelled', pal: 'sunny', hint: 'The first words of the title spelled in rounds.' },
    { id: 'card-coral', label: 'Title card', group: 'bright', layout: 'card', pal: 'coral', hint: 'A full board with the title on a card.' },
    { id: 'bubbles-mint', label: 'Mint board', group: 'bright', layout: 'bubbles', pal: 'mint', hint: 'The letter board on fresh green.' },

    { id: 'bubbles-navy', label: 'Night board', group: 'bold', layout: 'bubbles', pal: 'navy', hint: 'The letter board on midnight blue.' },
    { id: 'tiles-ocean', label: 'Ocean tiles', group: 'bold', layout: 'tiles', pal: 'ocean', hint: 'Letter tiles on deep blue.' },
    { id: 'band-noir', label: 'Black & gold band', group: 'bold', layout: 'band', pal: 'noir', hint: 'A gold band over black.' },
    { id: 'corner-navy', label: 'Night corner', group: 'bold', layout: 'corner', pal: 'navy', hint: 'The board runs off the corner on midnight blue.' },
    { id: 'frame-plum', label: 'Plum frame', group: 'bold', layout: 'frame', pal: 'plum', hint: 'Rounds round the edge on plum.' },
    { id: 'count-ocean', label: 'Ocean count', group: 'bold', layout: 'count', pal: 'ocean', hint: 'The big number of puzzles on deep blue.' },
    { id: 'ribbon-teal', label: 'Teal trail', group: 'bold', layout: 'ribbon', pal: 'teal', hint: 'The winding trail on teal.' },
    { id: 'spelled-navy', label: 'Night spelled', group: 'bold', layout: 'spelled', pal: 'navy', hint: 'The spelled title on midnight blue.' },
    { id: 'card-teal', label: 'Teal card', group: 'bold', layout: 'card', pal: 'teal', hint: 'A full board with a title card on teal.' },
    { id: 'bubbles-noir', label: 'Black & gold', group: 'bold', layout: 'bubbles', pal: 'noir', hint: 'The letter board in black and gold.' },

    { id: 'quiet', label: 'Quiet rings', group: 'calm', layout: 'quiet', pal: 'cream', hint: 'Fine rings, one trail and a serif title.' },
    { id: 'quiet-lavender', label: 'Quiet lavender', group: 'calm', layout: 'quiet', pal: 'lavender', hint: 'Fine rings on lavender.' },
    { id: 'quiet-blush', label: 'Quiet blush', group: 'calm', layout: 'quiet', pal: 'blush', hint: 'Fine rings on soft pink.' },
    { id: 'band-forest', label: 'Forest band', group: 'calm', layout: 'band', pal: 'forest', hint: 'The title band on forest green.' },
    { id: 'tiles-cream', label: 'Cream tiles', group: 'calm', layout: 'tiles', pal: 'cream', hint: 'Letter tiles on warm cream.' },
    { id: 'frame-cream', label: 'Cream frame', group: 'calm', layout: 'frame', pal: 'cream', hint: 'Rounds round the edge on cream.' },
    { id: 'count-kraft', label: 'Kraft count', group: 'calm', layout: 'count', pal: 'kraft', hint: 'The big count on kraft paper.' },
    { id: 'ribbon-lavender', label: 'Lavender trail', group: 'calm', layout: 'ribbon', pal: 'lavender', hint: 'The winding trail on lavender.' },
    { id: 'corner-forest', label: 'Forest corner', group: 'calm', layout: 'corner', pal: 'forest', hint: 'The board off the corner on forest green.' },
    { id: 'card-kraft', label: 'Kraft card', group: 'calm', layout: 'card', pal: 'kraft', hint: 'A full board with a title card on kraft.' }
  ];

  function design(id) { return DESIGNS.filter(function (d) { return d.id === id; })[0] || DESIGNS[0]; }
  function rawPalette(id) { return PALETTES.filter(function (p) { return p.id === id; })[0]; }
  // The palette in use: the one the user picked, else the template's own.
  function paletteId(c) { return c.palette && rawPalette(c.palette) ? c.palette : design(c.design).pal; }
  // A palette with every color filled in.
  function palette(id) {
    var p = Object.assign({}, rawPalette(id) || PALETTES[0]);
    p.a3 = p.a3 || p.title;
    p.card = p.card || p.light;
    p.cardInk = p.cardInk || contrastOn(p.card);
    p.dark = p.dark || shade(p.bg, -0.55);
    return p;
  }

  // ---------- colors ----------
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function hex(c) { return '#' + c.map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join('').toUpperCase(); }
  // Mixes a color with white (t > 0) or black (t < 0).
  function shade(h, t) { return hex(rgb(h).map(function (v) { return t >= 0 ? v + (255 - v) * t : v * (1 + t); })); }
  // a and b mixed: t = 0 is a, 1 is b.
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return hex(x.map(function (v, i) { return v + (y[i] - v) * t; })); }
  function lum(h) { var c = rgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function contrastOn(h) { return lum(h) > 0.59 ? '#1B1B3A' : '#FFFFFF'; }
  // the first color that stands out on bg
  function visible(bg) { for (var i = 1; i < arguments.length; i++) if (Math.abs(lum(arguments[i]) - lum(bg)) > 0.28) return arguments[i]; return contrastOn(bg); }

  // ---------- the sheet ----------
  function r2(v) { return Math.round(v * 100) / 100; }
  function txt(str, font) { return CX.metrics.printable(String(str == null ? '' : str), F[font]); }
  function wid(str, size, font, ls) { return F[font].width(txt(str, font), size, ls || 0); }

  function Sheet(W, H) { this.W = W; this.H = H; this.items = []; }
  Sheet.prototype.rect = function (x, y, w, h, color) { this.items.push({ t: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), mode: 'fill', color: color }); };
  Sheet.prototype.frame = function (x, y, w, h, color, lw, dash) {
    var it = { t: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), mode: 'stroke', color: color, lw: Math.max(0.75, lw || 1) };
    if (dash) it.dash = dash;
    this.items.push(it);
  };
  Sheet.prototype.line = function (x1, y1, x2, y2, color, w, round, dash) {
    var it = { t: 'line', x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), w: Math.max(0.75, w || 1), color: color };
    if (round) it.cap = true;
    if (dash) it.dash = dash;
    this.items.push(it);
  };
  Sheet.prototype.circle = function (cx, cy, r, color) { this.ellipse(cx, cy, r, r, color); };
  Sheet.prototype.ellipse = function (cx, cy, rx, ry, color) { this.items.push({ t: 'ellipse', cx: r2(cx), cy: r2(cy), rx: r2(rx), ry: r2(ry), mode: 'fill', color: color }); };
  Sheet.prototype.ring = function (cx, cy, r, color, lw, ry) { this.items.push({ t: 'ellipse', cx: r2(cx), cy: r2(cy), rx: r2(r), ry: r2(ry || r), mode: 'stroke', lw: Math.max(0.75, lw || 1), color: color }); };
  Sheet.prototype.poly = function (pts, color) { this.items.push({ t: 'poly', pts: pts.map(r2), closed: true, mode: 'fill', color: color }); };
  Sheet.prototype.path = function (pts, color, lw, closed) { this.items.push({ t: 'poly', pts: pts.map(r2), closed: !!closed, mode: 'stroke', lw: Math.max(0.75, lw || 1), color: color, round: true }); };
  Sheet.prototype.rrect = function (x, y, w, h, r, color) { this.poly(rrectPts(x, y, w, h, r), color); };
  Sheet.prototype.rframe = function (x, y, w, h, r, color, lw) { this.path(rrectPts(x, y, w, h, r), color, lw, true); };
  Sheet.prototype.text = function (str, x, y, size, font, color, o) {
    o = o || {};
    var s = txt(str, font);
    if (!s) return 0;
    var w = F[font].width(s, size, o.ls || 0);
    if (!o.angle) { if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w; }
    var it = { t: 'text', x: r2(x), y: r2(y), str: s, font: font, size: r2(size), color: color };
    if (o.ls) it.ls = r2(o.ls);
    if (!o.angle && (o.align === 'center' || o.align === 'right')) it.align = o.align; // kept for the editable (.pptx) copy
    if (o.angle) it.angle = o.angle;
    this.items.push(it);
    return w;
  };
  // Moves everything drawn since item start.
  Sheet.prototype.shift = function (start, dx, dy) {
    for (var i = start; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.t === 'line') { it.x1 = r2(it.x1 + dx); it.x2 = r2(it.x2 + dx); it.y1 = r2(it.y1 + dy); it.y2 = r2(it.y2 + dy); }
      else if (it.t === 'ellipse') { it.cx = r2(it.cx + dx); it.cy = r2(it.cy + dy); }
      else if (it.t === 'poly') { for (var k = 0; k < it.pts.length; k += 2) { it.pts[k] = r2(it.pts[k] + dx); it.pts[k + 1] = r2(it.pts[k + 1] + dy); } }
      else { it.x = r2(it.x + dx); it.y = r2(it.y + dy); }
    }
  };

  // ---------- shapes ----------
  function rrectPts(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    var pts = [], c = [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]];
    c.forEach(function (k) { for (var i = 0; i <= 6; i++) { var a = (k[2] + i * 15) * Math.PI / 180; pts.push(k[0] + Math.cos(a) * r, k[1] + Math.sin(a) * r); } });
    return pts;
  }
  function starPts(cx, cy, r, ri, n, rot) {
    var pts = [];
    for (var i = 0; i < n * 2; i++) { var a = (rot || -90) * Math.PI / 180 + i * Math.PI / n, rr = i % 2 ? ri : r; pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    return pts;
  }
  // a ring segment from angle a0 to a1 (degrees, 0 = right, 90 = down)
  function arcBand(cx, cy, r0, r1, a0, a1) {
    var pts = [], n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 4)), i, a;
    for (i = 0; i <= n; i++) { a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); }
    for (i = n; i >= 0; i--) { a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); }
    return pts;
  }
  // the part of a circle between heights ya and yb
  function circleBand(cx, cy, R, ya, yb) {
    ya = Math.max(ya, cy - R); yb = Math.min(yb, cy + R);
    var pts = [], n = 10, i, y;
    for (i = 0; i <= n; i++) { y = ya + (yb - ya) * i / n; pts.push(cx + Math.sqrt(Math.max(0, R * R - (y - cy) * (y - cy))), y); }
    for (i = n; i >= 0; i--) { y = ya + (yb - ya) * i / n; pts.push(cx - Math.sqrt(Math.max(0, R * R - (y - cy) * (y - cy))), y); }
    return pts;
  }
  // a pointed leaf of length len, centered on (cx, cy), turned by angle degrees
  function leafPts(cx, cy, len, w, angle) {
    var pts = [], a = angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    for (var i = 0; i <= 16; i++) {
      var t = i / 16 * Math.PI * 2, x = Math.cos(t) * len / 2, y = Math.sin(t) * w / 2 * Math.pow(Math.abs(Math.sin(t)), 0.15) * (1 - 0.35 * Math.abs(Math.cos(t)));
      pts.push(cx + x * ca - y * sa, cy + x * sa + y * ca);
    }
    return pts;
  }
  function turn(pts, cx, cy, deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), out = [];
    for (var i = 0; i < pts.length; i += 2) { var x = pts[i] - cx, y = pts[i + 1] - cy; out.push(cx + x * c - y * s, cy + x * s + y * c); }
    return out;
  }

  // ---------- type ----------
  function capH(font) { return F[font].capHeight; }
  // the height above the baseline: capitals, or a little more with lowercase ascenders
  function asc(str, font) { return /[a-z]/.test(str) ? capH(font) * 1.08 : capH(font); }
  function hasDesc(str) { return /[gjpqy,;]/.test(str); }
  function wrapK(str, size, font, maxW, lsK) {
    var words = String(str).split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur && wid(t, size, font, size * (lsK || 0)) > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  // The largest size (down to min) at which str fits maxLines lines of maxW.
  function fitK(str, font, maxW, maxSize, minSize, maxLines, lsK) {
    for (var s = maxSize; s > minSize; s -= Math.max(0.25, s * 0.02)) {
      var l = wrapK(str, s, font, maxW, lsK);
      if (l.length <= maxLines && l.every(function (x) { return wid(x, s, font, s * (lsK || 0)) <= maxW; })) return { size: s, lines: l };
    }
    return { size: minSize, lines: wrapK(str, minSize, font, maxW, lsK) };
  }
  // the size at which one line fills maxW, up to cap
  function fitLine(str, font, maxW, cap, lsK) { var w1 = wid(str, 1, font, lsK || 0); return Math.min(cap, w1 ? maxW / w1 : cap); }

  /*
   * Text with effects. fx: { shadow: { color, dx, dy } (offsets as parts of the size),
   * outline: { color, w } (points), glow: [{ color, w }] (outer first) }.
   */
  function fxText(sh, str, x, y, size, font, color, fx, o) {
    o = o || {};
    fx = fx || {};
    function ring(ox, oy, w, c, n) {
      n = n || 12;
      for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; sh.text(str, x + ox + Math.cos(a) * w, y + oy + Math.sin(a) * w, size, font, c, o); }
    }
    (fx.glow || []).forEach(function (g) { ring(0, 0, g.w, g.color, 16); });
    if (fx.shadow) {
      var dx = fx.shadow.dx * size, dy = fx.shadow.dy * size;
      var n = Math.max(1, Math.min(fx.outline ? 6 : 10, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 1.4)));
      for (var i = n; i >= 1; i--) {
        if (fx.outline) ring(dx * i / n, dy * i / n, fx.outline.w, fx.shadow.color, 8);
        sh.text(str, x + dx * i / n, y + dy * i / n, size, font, fx.shadow.color, o);
      }
    }
    if (fx.outline) ring(0, 0, fx.outline.w, fx.outline.color);
    return sh.text(str, x, y, size, font, color, o);
  }
  function fxExtent(fx, size) {
    fx = fx || {};
    var w = (fx.outline ? fx.outline.w : 0) + (fx.glow && fx.glow.length ? fx.glow[0].w : 0);
    return { top: w, bottom: w + (fx.shadow ? Math.max(0, fx.shadow.dy * size) : 0) };
  }

  /*
   * Lines of words stacked down from top (the top of the first line's letters); returns the
   * bottom. o: { font, color, colors (one per line, repeating), max, min, lines, upper, lsK,
   * fill (a line may grow up to max x fill to fill the width), fx, align ('center' | 'left'), lead }.
   */
  function textLines(sh, str, x, top, w, o) {
    str = String(str || '').trim();
    if (!str) return top;
    if (o.upper) str = str.toUpperCase();
    var font = o.font || 'sansBold', lsK = o.lsK || 0;
    var ft = fitK(str, font, w, o.max, Math.min(o.min || 8, o.max), o.lines || 3, lsK);
    var y = top, ext = fxExtent(o.fx, ft.size);
    y += ext.top;
    ft.lines.forEach(function (l, i) {
      var s = o.fill ? fitLine(l, font, w, ft.size * o.fill, lsK) : ft.size;
      if (i) y += s * (o.lead == null ? 0.2 : o.lead);
      y += asc(l, font) * s;
      var c = o.colors ? o.colors[i % o.colors.length] : o.color;
      fxText(sh, l, o.align === 'left' ? x : x + w / 2, y, s, font, c, o.fx, { align: o.align === 'left' ? null : 'center', ls: lsK * s });
      if (hasDesc(l)) y += s * 0.22;
    });
    return y + fxExtent(o.fx, ft.size).bottom;
  }
  function measure(sh, fn) { var n = sh.items.length, r = fn(); sh.items.length = n; return r; }

  // ---------- the subtitle and pen name ----------
  function subSize(f) { return Math.max(10, Math.min(15, f.w * 0.042)); }
  // st: { kind: 'plain' | 'ribbon' | 'box' | 'band' | 'line', fill, color, font, size, w, upper, lsK }
  function subLines(sub, st, f) {
    var size = st.size || subSize(f), maxW = (st.w || f.w) - (st.kind === 'plain' || st.kind === 'line' ? 0 : size * 2);
    var str = st.upper ? sub.toUpperCase() : sub, font = st.font || 'sansBold';
    var ft = fitK(str, font, maxW, size, Math.min(size, 8.5), 3, st.lsK);
    return { size: ft.size, lines: ft.lines, h: ft.lines.length * ft.size * 1.3 + ft.size * (st.kind === 'plain' ? 0.3 : 0.9) };
  }
  function subtitle(sh, f, sub, y, st) {
    if (!sub) return y;
    var m = subLines(sub, st, f), size = m.size, cx = st.cx || f.cx, w = st.w || f.w, font = st.font || 'sansBold';
    var tw = Math.max.apply(null, m.lines.map(function (l) { return wid(l, size, font, size * (st.lsK || 0)); }));
    var ink = st.color || (st.fill ? contrastOn(st.fill) : '#000000');
    if (st.kind === 'ribbon') {
      var rw = Math.min(w, tw + size * 3);
      sh.rect(cx - rw / 2, y, rw, m.h, st.fill);
      sh.poly([cx - rw / 2, y, cx - rw / 2 - size * 0.9, y + m.h / 2, cx - rw / 2, y + m.h], st.fill);
      sh.poly([cx + rw / 2, y, cx + rw / 2 + size * 0.9, y + m.h / 2, cx + rw / 2, y + m.h], st.fill);
    } else if (st.kind === 'box') {
      var bw = Math.min(w, tw + size * 2.2);
      sh.rrect(cx - bw / 2, y, bw, m.h, size * 0.5, st.fill);
    } else if (st.kind === 'band') {
      sh.rect(f.X0, y, f.X1 - f.X0, m.h, st.fill);
    } else if (st.kind === 'line') {
      sh.line(cx - Math.min(w, tw) / 2, y + size * 0.1, cx + Math.min(w, tw) / 2, y + size * 0.1, st.rule || ink, 1);
      sh.line(cx - Math.min(w, tw) / 2, y + m.h - size * 0.1, cx + Math.min(w, tw) / 2, y + m.h - size * 0.1, st.rule || ink, 1);
    }
    var ty = y + (st.kind === 'plain' ? size * 0.15 : size * 0.45);
    m.lines.forEach(function (l) { sh.text(l, cx, ty + size * 0.98, size, font, ink, { align: 'center', ls: size * (st.lsK || 0) }); ty += size * 1.3; });
    return y + m.h;
  }
  // The pen name at the bottom of the front; returns the height the rest must stay above.
  function footer(sh, f, w, st) {
    st = st || {};
    if (!w.author) return f.y + f.h;
    var font = st.font || 'sansBold', lsK = st.lsK == null ? 0.04 : st.lsK, str = st.upper ? w.author.toUpperCase() : w.author;
    var size = fitLine(str, font, f.w, st.size || Math.max(11, Math.min(17, f.w * 0.05)), lsK);
    var base = f.y + f.h - size * 0.25;
    if (st.band) sh.rect(f.X0, base - size * 1.25, f.X1 - f.X0, f.H - base + size * 1.25, st.band);
    sh.text(str, st.align === 'left' ? f.x : f.cx, base, size, font, st.color, { align: st.align === 'left' ? null : 'center', ls: size * lsK });
    return base - size * 0.75 - size * (st.gap == null ? 0.9 : st.gap) - (st.band ? size * 0.5 : 0);
  }
  // Pen name, then the subtitle above it; returns the bottom limit for the title block.
  function flow(sh, f, w, subSt, footSt, gap) {
    var bottom = footer(sh, f, w, footSt);
    if (!w.sub) return bottom;
    var m = subLines(w.sub, subSt, f);
    subtitle(sh, f, w.sub, bottom - m.h, subSt);
    return bottom - m.h - (gap == null ? m.size * 1.1 : gap);
  }

  // ---------- decorations ----------
  // A starburst seal with words; lines stacked inside it.
  function seal(sh, cx, cy, r, lines, fill, ink, o) {
    o = o || {};
    sh.poly(starPts(cx, cy, r, r * 0.87, o.points || 18, -90), fill);
    if (o.ring) sh.ring(cx, cy, r * 0.74, ink, Math.max(0.8, r * 0.025));
    var sizes = lines.map(function (l, i) { return Math.max(7, fitLine(l, 'sansBold', r * (i === 0 ? 1.25 : 1.3), r * (i === 0 ? 0.5 : 0.3))); });
    var h = sizes.reduce(function (a, s, i) { return a + s * 0.66 + (i ? s * 0.28 : 0); }, 0), y = cy - h / 2;
    lines.forEach(function (l, i) { if (i) y += sizes[i] * 0.28; y += sizes[i] * 0.66; sh.text(l, cx, y, sizes[i], 'sansBold', ink, { align: 'center' }); });
  }
  // Scattered confetti, kept out of the boxes in avoid. kinds: any of 'dot', 'strip', 'tri', 'star',
  // and the chalk doodles 'ostar' (an outlined star) and 'swirl'.
  function confetti(sh, box, colors, rng, avoid, n, kinds) {
    kinds = kinds || ['dot', 'strip', 'tri', 'star'];
    var placed = 0;
    for (var tries = 0; placed < n && tries < n * 30; tries++) {
      var x = box.x + rng.next() * box.w, y = box.y + rng.next() * box.h, s = 3 + rng.next() * 5;
      if (avoid.some(function (a) { return x > a.x - s && x < a.x + a.w + s && y > a.y - s && y < a.y + a.h + s; })) continue;
      var c = colors[rng.int(colors.length)], kind = kinds[rng.int(kinds.length)], a = rng.next() * 180;
      if (kind === 'dot') sh.circle(x, y, s * 0.7, c);
      else if (kind === 'strip') sh.poly(turn([x - s * 1.1, y - s * 0.4, x + s * 1.1, y - s * 0.4, x + s * 1.1, y + s * 0.4, x - s * 1.1, y + s * 0.4], x, y, a), c);
      else if (kind === 'tri') sh.poly(turn([x, y - s, x + s * 0.9, y + s * 0.6, x - s * 0.9, y + s * 0.6], x, y, a), c);
      else if (kind === 'ostar') sh.path(starPts(x, y, s * 1.3, s * 0.55, 5, a), c, 1.1, true);
      else if (kind === 'snow') sh.circle(x, y, s * 0.45, c);
      else if (kind === 'swirl') {
        var sp = [];
        for (var t = 0; t <= 26; t++) sp.push(x + Math.cos(t * 0.5 + a) * s * t / 22, y + Math.sin(t * 0.5 + a) * s * t / 22);
        sh.path(sp, c, 1.1);
      } else sh.poly(starPts(x, y, s, s * 0.45, 5, a), c);
      placed++;
    }
  }

  // ---------- the front ----------
  function front(sh, g, project, pal, tpl) {
    var H = sh.H, B = g.bleed;
    var f = { x: g.frontX + 0.375 * PT, y: B + 0.375 * PT, w: g.trimW - 0.75 * PT, h: H - 2 * B - 0.75 * PT, X0: g.frontX, X1: sh.W, H: H, B: B };
    f.cx = f.x + f.w / 2;
    var w = {
      title: P.bookTitle(project), sub: P.bookSubtitle(project), author: (project.book.author || '').trim(),
      count: project.plan.count, large: project.book.print !== 'regular'
    };
    var lay = CX.coverFronts[tpl.layout] || CX.coverFronts.bubbles;
    var start = sh.items.length, res = null;
    for (var k = 1, i = 0; i < 14; i++, k *= 0.93) {
      sh.items.length = start;
      res = lay(sh, f, w, pal, tpl.opt || {}, k, CX.util.makeRng(project.seed + '|cover|' + tpl.id)) || {};
      if (res.fits !== false) break;
    }
    if (!res.confetti) return;
    // little marks stay off the words and the drawings
    var avoid = (res.avoid || []).slice();
    for (var j = start; j < sh.items.length; j++) {
      var it = sh.items[j];
      if (it.t === 'text') avoid.push({ x: it.x, y: it.y - it.size * 0.8, w: F[it.font].width(it.str, it.size, it.ls || 0), h: it.size * 1.05 });
    }
    confetti(sh, res.confetti.box || { x: f.X0, y: 0, w: f.X1 - f.X0, h: H }, res.confetti.colors, CX.util.makeRng(project.seed + '|confetti|' + tpl.id), avoid, res.confetti.n, res.confetti.kinds);
  }

  function back(sh, g, project, pal) {
    var pl = project.plan;
    var x0 = g.bleed, bw = g.trimW, H = sh.H;
    var safe = { x: x0 + 0.5 * PT, y: g.bleed + 0.6 * PT, w: bw - PT, h: H - 2 * g.bleed - 1.2 * PT };
    var size = Math.max(10.5, Math.min(13, bw / 34)), lead = size * 1.45, y = safe.y;
    var headColor = visible(pal.bg, pal.title, pal.a1, pal.ink), dot = visible(pal.bg, pal.a1, pal.title, pal.a2, pal.ink);
    var head = 'Find the theme. Trace the words.';
    var hs = Math.min(24, safe.w / Math.max(1, wid(head, 1, 'serifBold')) * 0.95);
    y += hs;
    sh.text(head, safe.x + safe.w / 2, y, hs, 'serifBold', headColor, { align: 'center' });
    y += hs * 0.7;
    var blurb = project.ai.blurb || ('Every puzzle hides a set of words that share one theme. Work out what links them, trace each word through the letters and use every letter in the grid. One special word stretches from edge to edge and names the theme.');
    blurb.split('\n').forEach(function (para) {
      wrapK(para, size, 'serif', safe.w).forEach(function (l) { y += lead; sh.text(l, safe.x, y, size, 'serif', pal.ink); });
      y += lead * 0.4;
    });
    var items = [pl.count + ' ' + (project.book.print !== 'regular' ? 'large print ' : '') + 'puzzles, every one with its own theme'];
    items.push('Every grid has exactly one solution, and every letter is used');
    if (pl.level === 'mixed') items.push('Three levels, from easy warm-ups to expert trails');
    else items.push(P.level(pl.level).label + ' level from start to finish');
    if (pl.hints) items.push('Two rounds of hints that never spoil the answer');
    items.push('Full solutions at the back, trails marked');
    y += lead * 0.6;
    sh.text('Inside you’ll find:', safe.x, y + size, size * 1.1, 'sansBold', pal.ink);
    y += size * 1.4;
    items.forEach(function (it) {
      var lines = wrapK(it, size, 'serif', safe.w - size * 1.4);
      y += lead * 0.25;
      sh.poly(starPts(safe.x + size * 0.35, y + lead - size * 0.38, size * 0.36, size * 0.16, 5), dot);
      lines.forEach(function (l) { y += lead; sh.text(l, safe.x + size * 1.4, y, size, 'serif', pal.ink); });
    });
    g.backTextBottom = y;
  }

  function spine(sh, g, project, pal, ok) {
    var w = g.spineX1 - g.spineX0;
    if (!ok || w < 0.2 * PT) return;
    var b = project.book, title = P.bookTitle(project), author = (b.author || '').trim();
    // KDP's 7 pt minimum: the pen name is never smaller than that, and is left off if it does not fit
    var cx = (g.spineX0 + g.spineX1) / 2, size = Math.max(7, Math.min(w * 0.5, 15)), avail = sh.H - 2 * g.bleed - PT;
    function as(s) { return Math.max(7, s * 0.85); }
    var aw = author ? wid(author, as(size), 'sans') + size * 2 : 0;
    while (size > 7 && wid(title, size, 'sansBold') + aw > avail) { size -= 0.5; aw = author ? wid(author, as(size), 'sans') + size * 2 : 0; }
    if (wid(title, size, 'sansBold') + aw > avail) author = '';
    var top = g.bleed + 0.5 * PT, base = cx - size * 0.35;   // the letters stand to the right of the baseline
    // read top to bottom: rotated 90 degrees clockwise
    sh.text(title, base, top, size, 'sansBold', pal.ink, { angle: -90 });
    if (author) sh.text(author, base + size * 0.05, sh.H - g.bleed - 0.5 * PT - wid(author, as(size), 'sans'), as(size), 'sans', pal.ink, { angle: -90 });
  }

  /*
   * project: the project; pages: the interior page count. Returns the sheet with its guides.
   */
  function build(project, pages) {
    F = CX.metrics.load();
    var b = project.book, t = KDP.trim(b.trim), dims = KDP.cover(b.trim, pages, b.paper);
    var W = dims.width * PT, H = dims.height * PT, B = KDP.COVER_BLEED * PT;
    var sh = new Sheet(W, H);
    var g = { bleed: B, trimW: t.w * PT, spineX0: B + t.w * PT, spineX1: B + t.w * PT + dims.spine * PT };
    g.frontX = g.spineX1;
    var tpl = design(project.cover.design), pal = palette(paletteId(project.cover));
    sh.rect(0, 0, W, H, pal.bg);
    front(sh, g, project, pal, tpl);
    // anything the front painted past its fold is covered again by the back and the spine
    sh.rect(0, 0, g.frontX, H, pal.bg);
    back(sh, g, project, pal);
    spine(sh, g, project, pal, dims.spineText);
    var bc = { x: g.spineX0 - 0.25 * PT - 2 * PT, y: H - B - 0.25 * PT - 1.2 * PT, w: 2 * PT, h: 1.2 * PT };
    sh.guides = {
      bleed: B, spineX0: g.spineX0, spineX1: g.spineX1,
      safe: [
        { x: B + 0.125 * PT, y: B + 0.125 * PT, w: g.trimW - 0.25 * PT, h: H - 2 * B - 0.25 * PT },
        { x: g.frontX + 0.125 * PT, y: B + 0.125 * PT, w: g.trimW - 0.25 * PT, h: H - 2 * B - 0.25 * PT }
      ],
      barcode: bc
    };
    sh.overlapsBarcode = g.backTextBottom > bc.y - 4;
    sh.spine = dims.spine; sh.spineText = dims.spineText;
    return sh;
  }

  CX.cover = {
    DESIGNS: DESIGNS, PALETTES: PALETTES, GROUPS: GROUPS, build: build, shade: shade,
    design: design, palette: palette, paletteId: paletteId,
    kit: {
      PT: PT, wid: wid, capH: capH, asc: asc, wrap: wrapK, fit: fitK, fitLine: fitLine, fxText: fxText, textLines: textLines, measure: measure,
      subLines: subLines, subtitle: subtitle, subSize: subSize, footer: footer, flow: flow,
      seal: seal, confetti: confetti, rrectPts: rrectPts, starPts: starPts, arcBand: arcBand, circleBand: circleBand,
      leafPts: leafPts, turn: turn, shade: shade, mix: mix, lum: lum, contrastOn: contrastOn, visible: visible
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
