/*
 * svg.js: draws layout.js pages as SVG for the preview. Same commands as the PDF, same
 * embedded fonts (registered from js/fonts.js with the FontFace API), no kerning or
 * ligatures, so line breaks and positions match the printed page.
 * The viewBox is in points (72 per inch) so browser minimum-font-size settings never
 * apply to small user units.
 */
(function () {
  'use strict';
  window.KS = window.KS || {};
  var PT = 72;
  var FAMILY = {
    serif: ['KS Serif', 400], serifBold: ['KS Serif', 700],
    sans: ['KS Sans', 400], sansBold: ['KS Sans', 700]
  };

  function base64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Registers the bundled fonts with the document. Resolves when they are ready to draw.
  function loadFonts() {
    if (typeof FontFace !== 'function' || !document.fonts) return Promise.resolve();
    return Promise.all(Object.keys(FAMILY).map(function (face) {
      var f = new FontFace(FAMILY[face][0], base64ToBytes(KS.FONT_FILES[face].base64).buffer, {
        weight: String(FAMILY[face][1]), style: 'normal'
      });
      document.fonts.add(f);
      return f.load();
    }));
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function color(ink) {
    var h = Math.round((1 - ink) * 255).toString(16);
    if (h.length < 2) h = '0' + h;
    return '#' + h + h + h;
  }
  function n(v) { return Math.round(v * PT * 100) / 100; }

  function pageSVG(page, opts) {
    opts = opts || {};
    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" class="page-svg" viewBox="0 0 ' + n(page.w) + ' ' + n(page.h) +
      '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">');
    out.push('<rect width="' + n(page.w) + '" height="' + n(page.h) + '" fill="#fff"/>');
    page.commands.forEach(function (c) {
      var cls = c.preview ? ' class="screen-only"' : '';
      if (c.t === 'line') {
        out.push('<line' + cls + ' x1="' + n(c.x1) + '" y1="' + n(c.y1) + '" x2="' + n(c.x2) + '" y2="' + n(c.y2) +
          '" stroke="' + color(c.ink) + '" stroke-width="' + c.w + '" stroke-linecap="' + (c.cap || 'butt') + '"/>');
      } else if (c.t === 'path') {
        var d = 'M' + n(c.pts[0]) + ' ' + n(c.pts[1]);
        for (var i = 2; i < c.pts.length; i += 2) d += 'L' + n(c.pts[i]) + ' ' + n(c.pts[i + 1]);
        if (c.closed) d += 'Z';
        out.push('<path' + cls + ' d="' + d + '" fill="none" stroke="' + color(c.ink) + '" stroke-width="' + c.w +
          '" stroke-linejoin="miter"' + (c.dash ? ' stroke-dasharray="' + n(c.dash[0]) + ' ' + n(c.dash[1]) + '"' : '') + '/>');
      } else if (c.t === 'rect') {
        out.push('<rect' + cls + ' x="' + n(c.x) + '" y="' + n(c.y) + '" width="' + n(c.w) + '" height="' + n(c.h) + '" fill="' + color(c.fill) + '"/>');
      } else if (c.t === 'text') {
        var fam = FAMILY[c.face];
        out.push('<text' + cls + ' x="' + n(c.x) + '" y="' + n(c.y) + '" font-family="' + fam[0] + '" font-weight="' + fam[1] +
          '" font-size="' + c.size + '" fill="' + color(c.ink) + '">' + esc(c.text) + '</text>');
      }
    });
    if (opts.showMargins) {
      var l = page.live, g = page.gutter;
      out.push('<rect class="guide-gutter" x="' + n(g.x) + '" y="0" width="' + n(g.w) + '" height="' + n(page.h) + '"/>');
      out.push('<rect class="guide-live" x="' + n(l.x) + '" y="' + n(l.y) + '" width="' + n(l.w) + '" height="' + n(l.h) + '"/>');
      var label = 'Gutter';
      out.push('<text class="guide-label" x="' + n(g.x + g.w / 2) + '" y="' + n(page.h / 2) + '" transform="rotate(-90 ' +
        n(g.x + g.w / 2) + ' ' + n(page.h / 2) + ')">' + label + '</text>');
    }
    out.push('</svg>');
    return out.join('');
  }

  KS.Svg = { loadFonts: loadFonts, pageSVG: pageSVG };
})();
