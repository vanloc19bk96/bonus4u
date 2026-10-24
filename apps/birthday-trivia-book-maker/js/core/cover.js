/*
 * The paperback cover as one full-wrap sheet: back, spine and front with 0.125 in bleed, sized
 * from the trim, paper and page count (KDP's cover calculator formula).
 * A template is a front layout (drawn in cover-fronts.js) plus its own colors; the colors can be
 * swapped for any palette. The 50 templates follow the looks that sell birthday trivia books on
 * Amazon: huge age numbers in red and yellow, 3D and outlined type, retro sunsets, cassettes and
 * TVs, vintage medallions, black and gold, party balloons and cakes, newspapers and timelines.
 * Every word on the front stays inside the safe box f (0.375 in from the trim).
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var KDP = CX.kdp, P = CX.plan;
  var PT = 72;
  var F = null;

  // bg: the cover; title: the big number; ink: words on bg; a1, a2, a3: accents; light: highlights;
  // card/cardInk: panels and their words; dark: shadows and 3D type.
  var PALETTES = [
    { id: 'sunny', label: 'Sunny', bg: '#FFD23F', title: '#D7263D', ink: '#1B1B3A', a1: '#1F8A70', a2: '#2E86DE', light: '#FFFFFF' },
    { id: 'ruby', label: 'Ruby', bg: '#C8102E', title: '#FFD23F', ink: '#FFFFFF', a1: '#FFFFFF', a2: '#FF9F1C', light: '#FFFFFF' },
    { id: 'navy', label: 'Navy & gold', bg: '#14213D', title: '#FCA311', ink: '#FFFFFF', a1: '#FCA311', a2: '#8FB8DE', light: '#FFFFFF', card: '#FDF6E3' },
    { id: 'teal', label: 'Teal', bg: '#0B7A75', title: '#FFFFFF', ink: '#FFFFFF', a1: '#F2C14E', a2: '#F78154', light: '#FFFFFF' },
    { id: 'rose', label: 'Rose', bg: '#F9D3E1', title: '#A4135E', ink: '#3A0F2A', a1: '#E0479E', a2: '#2E86DE', light: '#FFFFFF' },
    { id: 'vintage', label: 'Vintage', bg: '#F3E9D2', title: '#C1440E', ink: '#2B2D42', a1: '#1B998B', a2: '#E9A23B', light: '#FFFFFF', card: '#FFF9EC' },
    { id: 'cherry', label: 'Cherry', bg: '#D62828', title: '#FFD60A', ink: '#FFFFFF', a1: '#FFD60A', a2: '#1D3557', light: '#FFFFFF', dark: '#6E0E10' },
    { id: 'royal', label: 'Royal blue', bg: '#1E4FD8', title: '#FFD23F', ink: '#FFFFFF', a1: '#FF4D6D', a2: '#FFD23F', light: '#FFFFFF', dark: '#0B1F5C' },
    { id: 'lemon', label: 'Lemon', bg: '#FFE14D', title: '#E63946', ink: '#E63946', a1: '#2E86DE', a2: '#FF8C42', a3: '#2BB673', light: '#FFFFFF', dark: '#8E1B24' },
    { id: 'tangerine', label: 'Tangerine', bg: '#FF7A1A', title: '#FFFFFF', ink: '#FFFFFF', a1: '#FFE066', a2: '#1B1B3A', light: '#FFFFFF', dark: '#8A3300' },
    { id: 'bubblegum', label: 'Hot pink', bg: '#FF5FA2', title: '#FFFFFF', ink: '#FFFFFF', a1: '#FFE14D', a2: '#5B2A86', a3: '#2EC4B6', light: '#FFFFFF', dark: '#8E1453' },
    { id: 'grape', label: 'Grape', bg: '#5B2A86', title: '#FFD23F', ink: '#FFFFFF', a1: '#FF5FA2', a2: '#2EC4B6', a3: '#FF8C42', light: '#FFFFFF', dark: '#2A0F44' },
    { id: 'retro', label: 'Retro night', bg: '#2B2140', title: '#FFC145', ink: '#FFF4E0', a1: '#FF7A45', a2: '#E8475F', a3: '#B33771', light: '#FFF4E0', dark: '#120C1E' },
    { id: 'synth', label: 'Synthwave', bg: '#1A1040', title: '#FF4FD8', ink: '#FFFFFF', a1: '#FFB300', a2: '#FF4FD8', a3: '#7B2FF7', light: '#FFFFFF', dark: '#05020F' },
    { id: 'circus', label: 'Circus', bg: '#F4E8D0', title: '#C62E2E', ink: '#1E2A44', a1: '#C62E2E', a2: '#1E5A8C', light: '#FFFFFF', card: '#FFF8E8' },
    { id: 'mustard', label: 'Mustard', bg: '#E9B44C', title: '#C8553D', ink: '#1B1B1B', a1: '#C8553D', a2: '#1B4965', a3: '#5FA8D3', light: '#FFF6E0', card: '#FFF6E0', dark: '#2A2A2A' },
    { id: 'aqua', label: 'Aqua', bg: '#2EC4B6', title: '#FFFFFF', ink: '#0B3C49', a1: '#FF9F1C', a2: '#E71D36', light: '#FFFFFF', dark: '#0B3C49' },
    { id: 'seventies', label: '70s', bg: '#F6E7C8', title: '#8C3B1E', ink: '#3B2414', a1: '#E07A2E', a2: '#D9A43A', a3: '#A8432A', light: '#FFFFFF', card: '#FFF6E2' },
    { id: 'noir', label: 'Black & gold', bg: '#121212', title: '#D4AF37', ink: '#F5E6B8', a1: '#D4AF37', a2: '#8A6D1D', light: '#F7E7A9', card: '#1E1E1E', cardInk: '#F5E6B8' },
    { id: 'emerald', label: 'Emerald', bg: '#0F4D3A', title: '#E6C068', ink: '#FFFFFF', a1: '#E6C068', a2: '#9BC9A8', light: '#FFF3D1', card: '#FFF8E6' },
    { id: 'wine', label: 'Wine', bg: '#5C1A2B', title: '#E8C27A', ink: '#FFF3E3', a1: '#E8C27A', a2: '#C98A9A', light: '#FFF3E3', card: '#FFF6EA' },
    { id: 'sage', label: 'Sage', bg: '#DDE5D3', title: '#2F4A3A', ink: '#2F4A3A', a1: '#A26B4A', a2: '#7C9A7E', light: '#FFFFFF', card: '#F7F9F2' },
    { id: 'paper', label: 'White', bg: '#FAF7F0', title: '#1F1F1F', ink: '#1F1F1F', a1: '#B5402A', a2: '#8A8A8A', light: '#FFFFFF' },
    { id: 'blush', label: 'Rose gold', bg: '#F6DDD8', title: '#B76E79', ink: '#4A2C33', a1: '#C9A27E', a2: '#E8A6B0', light: '#FFFFFF' },
    { id: 'party', label: 'Party pink', bg: '#FFE3EE', title: '#E0218A', ink: '#3D1A4F', a1: '#22B5C9', a2: '#FFC145', a3: '#7B4FD6', light: '#FFFFFF' },
    { id: 'sky', label: 'Sky', bg: '#BDE3FA', title: '#1652A8', ink: '#12305E', a1: '#FF5A5F', a2: '#FFC145', a3: '#2BB673', light: '#FFFFFF' },
    { id: 'confetti', label: 'Confetti', bg: '#FFFFFF', title: '#F04E37', ink: '#1B1B3A', a1: '#2E86DE', a2: '#FFC145', a3: '#2BB673', light: '#FFFFFF', card: '#FFF4D6' },
    { id: 'mint', label: 'Mint', bg: '#CFF2E4', title: '#0F7C6B', ink: '#12352D', a1: '#FF7A59', a2: '#FFC145', a3: '#7B4FD6', light: '#FFFFFF' },
    { id: 'neon', label: 'Neon', bg: '#0B0B1E', title: '#39FF88', ink: '#FFFFFF', a1: '#FF3EA5', a2: '#33D6FF', light: '#FFFFFF' },
    { id: 'gameshow', label: 'Game show', bg: '#0A1F7A', title: '#FFC93C', ink: '#FFFFFF', a1: '#2347D6', a2: '#FFC93C', a3: '#FF5A5F', light: '#FFFFFF', card: '#FFFFFF' },
    { id: 'newsprint', label: 'Newsprint', bg: '#EFE9DC', title: '#1A1A1A', ink: '#1A1A1A', a1: '#8C1C13', a2: '#6F6A60', light: '#FFFFFF', card: '#F8F4EA' },
    { id: 'sepia', label: 'Sepia', bg: '#E8D9BF', title: '#5A3A1E', ink: '#3A2614', a1: '#A8432A', a2: '#8C6A3F', a3: '#C99A4B', light: '#FFF8EA', card: '#F6EEDC' },
    { id: 'usa', label: 'Stars & stripes', bg: '#B22234', title: '#FFFFFF', ink: '#FFFFFF', a1: '#3C3B6E', a2: '#FFFFFF', light: '#FFFFFF', card: '#FFFFFF', cardInk: '#B22234', dark: '#5E0F1A' },
    { id: 'chalk', label: 'Chalk', bg: '#2E3B33', title: '#FFFFFF', ink: '#F4F1E6', a1: '#F2C14E', a2: '#F59A8F', a3: '#8FD3E8', light: '#F4F1E6', card: '#7A5230' },
    { id: 'highway', label: 'Highway', bg: '#9ED0EA', title: '#FFFFFF', ink: '#123B5E', a1: '#1F6E43', a2: '#5A5A5A', a3: '#F2C14E', light: '#FFFFFF' },
    { id: 'kraft', label: 'Kraft', bg: '#C69C6D', title: '#8C2F1B', ink: '#2A1C10', a1: '#8C2F1B', a2: '#2E5E4E', a3: '#E0A43A', light: '#FFFDF7', card: '#FFFDF7' }
  ];

  var GROUPS = [
    { id: 'bright', label: 'Bold & bright' },
    { id: 'retro', label: 'Retro' },
    { id: 'elegant', label: 'Elegant' },
    { id: 'party', label: 'Party' },
    { id: 'memory', label: 'Memory lane' }
  ];

  // The templates. layout names a front in CX.coverFronts; pal is the template's own colors.
  var DESIGNS = [
    { id: 'badge', label: 'Party badge', group: 'bright', layout: 'badge', pal: 'sunny', hint: 'The age in a round badge, a ribbon and confetti.' },
    { id: 'bold', label: 'Big number', group: 'bright', layout: 'bold', pal: 'ruby', hint: 'A huge age over a big stacked title.' },
    { id: 'burst', label: 'Sunburst', group: 'bright', layout: 'burst', pal: 'teal', hint: 'The age on a sunburst of rays.' },
    { id: 'challenge', label: 'Trivia challenge', group: 'bright', layout: 'challenge', pal: 'cherry', hint: 'A 3D age in party sunglasses, like the bestselling challenge books.' },
    { id: 'bigtrivia', label: 'Big trivia', group: 'bright', layout: 'bigtrivia', pal: 'cherry', hint: 'A giant yellow age, a gift seal and a subtitle bar.' },
    { id: 'ultimate', label: 'The ultimate', group: 'bright', layout: 'ultimate', pal: 'lemon', hint: 'Outlined red letters, balloons and question marks on yellow.' },
    { id: 'challenge-royal', label: 'Challenge blue', group: 'bright', layout: 'challenge', pal: 'royal', hint: 'The 3D sunglasses age on royal blue.' },
    { id: 'bigtrivia-orange', label: 'Big trivia orange', group: 'bright', layout: 'bigtrivia', pal: 'tangerine', hint: 'The big trivia look on orange.' },
    { id: 'ultimate-pink', label: 'Ultimate pink', group: 'bright', layout: 'ultimate', pal: 'bubblegum', hint: 'The outlined look on bubblegum pink.' },
    { id: 'burst-grape', label: 'Sunburst grape', group: 'bright', layout: 'burst', pal: 'grape', hint: 'The sunburst on purple and gold.' },

    { id: 'sunset', label: 'Retro sunset', group: 'retro', layout: 'sunset', pal: 'retro', hint: 'A striped retro sun with the year they were born.' },
    { id: 'rays', label: 'Vintage rays', group: 'retro', layout: 'rays', pal: 'circus', hint: 'Red and cream rays behind a framed title card.' },
    { id: 'cassette', label: 'Mixtape', group: 'retro', layout: 'cassette', pal: 'mustard', hint: 'The age on the label of a cassette tape.' },
    { id: 'vinyl', label: 'Vinyl record', group: 'retro', layout: 'vinyl', pal: 'aqua', hint: 'A record sliding out of its sleeve, the age on the label.' },
    { id: 'tv', label: 'Retro TV', group: 'retro', layout: 'tv', pal: 'tangerine', hint: 'The age on the screen of an old TV set.' },
    { id: 'rainbow', label: '70s rainbow', group: 'retro', layout: 'rainbow', pal: 'seventies', hint: 'A groovy rainbow arch over the age.' },
    { id: 'bornin', label: 'Born in', group: 'retro', layout: 'bornin', pal: 'sepia', hint: 'BORN IN and the year, big, over retro stripes.' },
    { id: 'sunset-synth', label: 'Synthwave', group: 'retro', layout: 'sunset', pal: 'synth', hint: 'The retro sun in neon pink and purple.' },
    { id: 'rays-navy', label: 'Rays navy', group: 'retro', layout: 'rays', pal: 'navy', hint: 'The vintage rays in navy and gold.' },
    { id: 'cassette-pink', label: 'Mixtape pink', group: 'retro', layout: 'cassette', pal: 'bubblegum', hint: 'The cassette on pink.' },

    { id: 'medallion', label: 'Vintage medallion', group: 'elegant', layout: 'medallion', pal: 'vintage', hint: 'A framed cream cover with the age in a medallion.' },
    { id: 'blackgold', label: 'Black & gold', group: 'elegant', layout: 'blackgold', pal: 'noir', hint: 'A gold serif age on black, fine rules.' },
    { id: 'laurel', label: 'Laurel wreath', group: 'elegant', layout: 'laurel', pal: 'navy', hint: 'The age inside a laurel wreath.' },
    { id: 'minimal', label: 'Minimal', group: 'elegant', layout: 'minimal', pal: 'paper', hint: 'Quiet and modern: a big serif age and lots of space.' },
    { id: 'deco', label: 'Art deco', group: 'elegant', layout: 'deco', pal: 'emerald', hint: 'A deco fan and stepped gold frame.' },
    { id: 'medallion-sage', label: 'Medallion sage', group: 'elegant', layout: 'medallion', pal: 'sage', hint: 'The medallion in soft green.' },
    { id: 'blackgold-wine', label: 'Wine & gold', group: 'elegant', layout: 'blackgold', pal: 'wine', hint: 'The gold serif look on deep wine.' },
    { id: 'laurel-rose', label: 'Rose gold laurel', group: 'elegant', layout: 'laurel', pal: 'blush', hint: 'The laurel wreath in rose gold.' },
    { id: 'deco-noir', label: 'Deco noir', group: 'elegant', layout: 'deco', pal: 'noir', hint: 'The art deco frame on black.' },
    { id: 'minimal-blush', label: 'Minimal blush', group: 'elegant', layout: 'minimal', pal: 'blush', hint: 'The minimal look in blush and rose.' },

    { id: 'cake', label: 'Birthday cake', group: 'party', layout: 'cake', pal: 'party', hint: 'The age as candles on a layered cake.' },
    { id: 'balloons', label: 'Balloons', group: 'party', layout: 'balloons', pal: 'sky', hint: 'A bunch of balloons over the title.' },
    { id: 'bunting', label: 'Bunting', group: 'party', layout: 'bunting', pal: 'confetti', hint: 'Party flags and confetti on white.' },
    { id: 'balloons-gold', label: 'Gold balloons', group: 'party', layout: 'balloons', pal: 'noir', hint: 'Gold balloons on black.' },
    { id: 'ticket', label: 'Party ticket', group: 'party', layout: 'ticket', pal: 'bubblegum', hint: 'An admit-one ticket with the age.' },
    { id: 'gameshow', label: 'Game show', group: 'party', layout: 'gameshow', pal: 'gameshow', hint: 'A quiz board and a marquee with light bulbs.' },
    { id: 'neon', label: 'Neon sign', group: 'party', layout: 'neon', pal: 'neon', hint: 'A glowing neon age on a dark brick wall.' },
    { id: 'cake-mint', label: 'Cake mint', group: 'party', layout: 'cake', pal: 'mint', hint: 'The birthday cake on mint.' },
    { id: 'bunting-kraft', label: 'Bunting kraft', group: 'party', layout: 'bunting', pal: 'kraft', hint: 'Party flags on kraft paper.' },
    { id: 'quizcard', label: 'Quiz card', group: 'party', layout: 'quizcard', pal: 'grape', hint: 'A trivia question with A, B, C and D answer buttons.' },

    { id: 'newspaper', label: 'Newspaper', group: 'memory', layout: 'newspaper', pal: 'newsprint', hint: 'A birthday front page from the year they were born.' },
    { id: 'timeline', label: 'Timeline', group: 'memory', layout: 'timeline', pal: 'paper', hint: 'Every decade of their life on a timeline.' },
    { id: 'polaroid', label: 'Photo memories', group: 'memory', layout: 'polaroid', pal: 'kraft', hint: 'Instant photos pinned with tape.' },
    { id: 'americana', label: 'Stars & stripes', group: 'memory', layout: 'americana', pal: 'usa', hint: 'Red, white and blue with stars.' },
    { id: 'chalkboard', label: 'Chalkboard', group: 'memory', layout: 'chalkboard', pal: 'chalk', hint: 'Chalk letters, flags and doodles in a wooden frame.' },
    { id: 'roadsign', label: 'Milestone sign', group: 'memory', layout: 'roadsign', pal: 'highway', hint: 'A highway sign: the next exit is this birthday.' },
    { id: 'quizcard-navy', label: 'Quiz card navy', group: 'memory', layout: 'quizcard', pal: 'navy', hint: 'The quiz card in navy and gold.' },
    { id: 'newspaper-sepia', label: 'Old newspaper', group: 'memory', layout: 'newspaper', pal: 'sepia', hint: 'The front page, aged to sepia.' },
    { id: 'timeline-teal', label: 'Timeline teal', group: 'memory', layout: 'timeline', pal: 'teal', hint: 'The decade timeline on teal.' },
    { id: 'polaroid-sage', label: 'Photo album', group: 'memory', layout: 'polaroid', pal: 'sage', hint: 'The instant photos on soft green.' }
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

  // the width of the age with its ordinal suffix
  function numW(tp, size, n) {
    var font = n.font || 'sansBold';
    return wid(tp.num, size, font, size * (n.lsK || 0)) + (n.noSuf ? 0 : wid(sufStr(tp, n), size * (n.sufK || 0.34), font) + size * 0.03);
  }
  function sufStr(tp, n) { return n.sufLower ? tp.suf.toLowerCase() : tp.suf; }
  /*
   * The big age, its top at top, centered on cx (or from x when n.align is 'left'). Returns
   * { top, bottom, x, w }. n: { font, color, sufColor, fx, sufK, sufLower, noSuf, lsK }.
   */
  function bigNum(sh, tp, cx, top, size, n) {
    var font = n.font || 'sansBold', w = numW(tp, size, n), x = n.align === 'left' ? cx : cx - w / 2;
    var ext = fxExtent(n.fx, size), base = top + ext.top + capH(font) * size;
    var nw = fxText(sh, tp.num, x, base, size, font, n.color, n.fx, { ls: size * (n.lsK || 0) });
    if (!n.noSuf) {
      var ss = size * (n.sufK || 0.34);
      fxText(sh, sufStr(tp, n), x + nw + size * 0.03, top + ext.top + capH(font) * ss + size * 0.02, ss, font, n.sufColor || n.color, n.fx);
    }
    return { top: top, bottom: base + ext.bottom, x: x, w: w, base: base, size: size };
  }

  /*
   * The title block: the words before the age, the big age, the words after it, stacked and
   * shrunk until they fit box { x, y, w, h }. st: { pre, num, post, valign ('top' | 'center' |
   * 'bottom') } with pre/post as for textLines (pre.size, post.max) and num as for bigNum plus
   * num.wk (part of the width the age may take) and num.max. Returns { top, bottom, num }.
   */
  function headline(sh, box, tp, st) {
    var start = sh.items.length, s = st.scale || 1, res, total = 0;
    var pre = st.pre || {}, n = st.num || {}, post = st.post || {};
    for (var i = 0; i < 22; i++) {
      sh.items.length = start;
      res = {};
      var y = 0;
      if (tp.pre && st.pre !== false) {
        var ps = (pre.size || box.w * 0.085) * s;
        y = textLines(sh, tp.pre, box.x, y, box.w, Object.assign({ upper: true, lines: 2 }, pre, { max: ps }));
        y += ps * (pre.gap == null ? 0.45 : pre.gap);
      }
      var size = Math.min(box.w * (n.wk || 0.9) / numW(tp, 1, n), n.max || 1e9) * s;
      res.num = bigNum(sh, tp, box.x + box.w / 2, y, size, n);
      y = res.num.bottom;
      if (tp.post && st.post !== false) {
        var pm = (post.max || box.w * 0.15) * s;
        y += pm * (post.gap == null ? 0.22 : post.gap);
        y = textLines(sh, tp.post, box.x, y, box.w, Object.assign({ upper: true, lines: 3, fill: 1.25 }, post, { max: pm }));
      }
      total = y;
      if (total <= box.h + 0.01) break;
      s *= Math.max(0.55, Math.min(0.97, box.h / total));
    }
    var dy = box.y + (st.valign === 'top' ? 0 : st.valign === 'bottom' ? box.h - total : Math.max(0, (box.h - total) / 2));
    sh.shift(start, 0, dy);
    res.num.top += dy; res.num.bottom += dy; res.num.base += dy;
    res.top = dy; res.bottom = dy + total; res.scale = s;
    return res;
  }

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
  function balloon(sh, cx, cy, r, color, string, len) {
    if (len) {
      var pts = [], n = 10;
      for (var i = 0; i <= n; i++) pts.push(cx + Math.sin(i / n * Math.PI * 2) * r * 0.12, cy + r * 1.22 + len * i / n);
      sh.path(pts, string, Math.max(0.8, r * 0.025));
    }
    sh.ellipse(cx, cy, r, r * 1.18, color);
    sh.poly([cx, cy + r * 1.1, cx - r * 0.13, cy + r * 1.32, cx + r * 0.13, cy + r * 1.32], color);
    sh.ellipse(cx - r * 0.38, cy - r * 0.45, r * 0.16, r * 0.26, mix(color, '#FFFFFF', 0.55));
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
      else if (kind === 'swirl') {
        var sp = [];
        for (var t = 0; t <= 26; t++) sp.push(x + Math.cos(t * 0.5 + a) * s * t / 22, y + Math.sin(t * 0.5 + a) * s * t / 22);
        sh.path(sp, c, 1.1);
      } else sh.poly(starPts(x, y, s, s * 0.45, 5, a), c);
      placed++;
    }
  }

  // Splits the title around the age: "The 90th Birthday Trivia Book" -> pre "The", 90, "th", post "Birthday Trivia Book".
  function titleParts(title, age) {
    var words = title.split(/\s+/).filter(Boolean);
    for (var i = 0; i < words.length; i++) {
      var m = /^(\d{1,3})(st|nd|rd|th)([:,!.]?)$/i.exec(words[i]);
      if (m) return { pre: words.slice(0, i).join(' '), num: m[1], suf: m[2].toUpperCase(), post: words.slice(i + 1).join(' ') };
    }
    var ord = P.ordinal(age);
    return { pre: '', num: String(age), suf: ord.slice(-2).toUpperCase(), post: title };
  }

  // ---------- the front ----------
  function front(sh, g, project, pal, tpl) {
    var b = project.book, r = P.reader(b), H = sh.H, B = g.bleed;
    var f = { x: g.frontX + 0.375 * PT, y: B + 0.375 * PT, w: g.trimW - 0.75 * PT, h: H - 2 * B - 0.75 * PT, X0: g.frontX, X1: sh.W, H: H, B: B };
    f.cx = f.x + f.w / 2;
    var title = P.bookTitle(b);
    var w = {
      title: title, tp: titleParts(title, r.age), sub: P.bookSubtitle(b), author: (b.author || '').trim(),
      age: r.age, ord: r.ord, born: r.born, year: r.year, total: CX.questions.total(project) || 0, large: b.print !== 'regular'
    };
    var lay = CX.coverFronts[tpl.layout] || CX.coverFronts.badge;
    var start = sh.items.length, res = null;
    for (var k = 1, i = 0; i < 14; i++, k *= 0.93) {
      sh.items.length = start;
      res = lay(sh, f, w, pal, tpl.opt || {}, k, CX.util.makeRng(project.seed + '|cover|' + tpl.id)) || {};
      if (res.fits !== false) break;
    }
    if (!res.confetti) return;
    // confetti stays off the words and the drawings
    var avoid = (res.avoid || []).slice();
    for (var j = start; j < sh.items.length; j++) {
      var it = sh.items[j];
      if (it.t === 'text') avoid.push({ x: it.x, y: it.y - it.size * 0.8, w: F[it.font].width(it.str, it.size, it.ls || 0), h: it.size * 1.05 });
    }
    confetti(sh, res.confetti.box || { x: f.X0, y: 0, w: f.X1 - f.X0, h: H }, res.confetti.colors, CX.util.makeRng(project.seed + '|confetti|' + tpl.id), avoid, res.confetti.n, res.confetti.kinds);
  }

  function back(sh, g, project, pal) {
    var b = project.book, r = P.reader(b), e = project.extras;
    var x0 = g.bleed, bw = g.trimW, H = sh.H;
    var safe = { x: x0 + 0.5 * PT, y: g.bleed + 0.6 * PT, w: bw - PT, h: H - 2 * g.bleed - 1.2 * PT };
    var size = Math.max(10.5, Math.min(13, bw / 34)), lead = size * 1.45, y = safe.y;
    var headColor = visible(pal.bg, pal.title, pal.a1, pal.ink), dot = visible(pal.bg, pal.title, pal.a1, pal.a2, pal.ink);
    var head = 'Happy ' + r.ord + ' Birthday!';
    var hs = Math.min(26, safe.w / Math.max(1, wid(head, 1, 'serifBold')) * 0.95);
    y += hs;
    sh.text(head, safe.x + safe.w / 2, y, hs, 'serifBold', headColor, { align: 'center' });
    y += hs * 0.7;
    var blurb = project.ai.blurb || ('A cheerful trip down memory lane for anyone turning ' + r.age + '. Music, movies, sports, prices and the big moments from ' + r.born +
      ' to today, as a game the whole family can play together at the party and long after.');
    blurb.split('\n').forEach(function (para) {
      wrapK(para, size, 'serif', safe.w).forEach(function (l) { y += lead; sh.text(l, safe.x, y, size, 'serif', pal.ink); });
      y += lead * 0.4;
    });
    var chs = P.chapters(project), total = CX.questions.total(project) || chs.length * project.plan.perChapter;
    var items = [total + ' trivia questions in ' + chs.length + ' chapters', 'Answers with a fun fact for every question'];
    if (e.born) items.push('Fun facts about ' + r.born + ', the year you were born');
    if (e.memories) items.push('Memory Lane questions that bring out the best stories');
    if (e.scores || e.wishes) items.push([e.scores ? 'A score card' : '', e.wishes ? 'birthday wishes pages' : ''].filter(Boolean).join(' and '));
    if (b.print !== 'regular') items.push('Large, easy-to-read print');
    y += lead * 0.6;
    sh.text('Inside you’ll find:', safe.x, y + size, size * 1.1, 'sansBold', pal.ink);
    y += size * 1.4;
    items.forEach(function (it) {
      var lines = wrapK(it.charAt(0).toUpperCase() + it.slice(1), size, 'serif', safe.w - size * 1.4);
      y += lead * 0.25;
      sh.circle(safe.x + size * 0.35, y + lead - size * 0.35, size * 0.22, dot);
      lines.forEach(function (l) { y += lead; sh.text(l, safe.x + size * 1.4, y, size, 'serif', pal.ink); });
    });
    g.backTextBottom = y;
  }

  function spine(sh, g, project, pal, ok) {
    var w = g.spineX1 - g.spineX0;
    if (!ok || w < 0.2 * PT) return;
    var b = project.book, title = P.bookTitle(b), author = (b.author || '').trim();
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
    DESIGNS: DESIGNS, PALETTES: PALETTES, GROUPS: GROUPS, build: build, titleParts: titleParts, shade: shade,
    design: design, palette: palette, paletteId: paletteId,
    kit: {
      PT: PT, wid: wid, capH: capH, asc: asc, wrap: wrapK, fit: fitK, fitLine: fitLine, fxText: fxText, textLines: textLines, measure: measure,
      numW: numW, bigNum: bigNum, headline: headline, subLines: subLines, subtitle: subtitle, subSize: subSize, footer: footer, flow: flow,
      seal: seal, balloon: balloon, confetti: confetti, rrectPts: rrectPts, starPts: starPts, arcBand: arcBand, circleBand: circleBand,
      leafPts: leafPts, turn: turn, shade: shade, mix: mix, lum: lum, contrastOn: contrastOn, visible: visible
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
