/*
 * preview.js: renders layout.js pages to SVG. Same commands as the PDF, same embedded
 * font (loaded from js/fonts.js as a data-URL @font-face), kerning off like jsPDF.
 * The SVG viewBox is in points (72 per inch) so browser minimum-font-size settings
 * never kick in on small user units.
 */
(function () {
  'use strict';
  window.SS = window.SS || {};
  var FAMILY = 'SSAtkinson';
  var PT = 72;

  function installFonts() {
    if (document.getElementById('ss-font-faces')) return;
    var style = document.createElement('style');
    style.id = 'ss-font-faces';
    style.textContent =
      '@font-face{font-family:' + FAMILY + ';font-weight:400;src:url(data:font/ttf;base64,' + SS.FONT_FILES.regular.base64 + ') format("truetype");}' +
      '@font-face{font-family:' + FAMILY + ';font-weight:700;src:url(data:font/ttf;base64,' + SS.FONT_FILES.bold.base64 + ') format("truetype");}';
    document.head.appendChild(style);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function gray(v) {
    var h = Math.round(v * 255).toString(16);
    if (h.length < 2) h = '0' + h;
    return '#' + h + h + h;
  }
  function n(v) { return Math.round(v * PT * 1000) / 1000; }

  var ANCHOR = { left: 'start', center: 'middle', right: 'end' };

  function pageSVG(page, opts) {
    opts = opts || {};
    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" class="page-svg" viewBox="0 0 ' + n(page.w) + ' ' + n(page.h) +
      '" role="img" aria-label="Page ' + page.number + '">');
    out.push('<rect x="0" y="0" width="' + n(page.w) + '" height="' + n(page.h) + '" fill="#fff"/>');
    page.commands.forEach(function (c) {
      if (c.t === 'rect') {
        out.push('<rect x="' + n(c.x) + '" y="' + n(c.y) + '" width="' + n(c.w) + '" height="' + n(c.h) + '" fill="' + gray(c.fill) + '"/>');
      } else if (c.t === 'line') {
        out.push('<line x1="' + n(c.x1) + '" y1="' + n(c.y1) + '" x2="' + n(c.x2) + '" y2="' + n(c.y2) +
          '" stroke="' + gray(c.gray) + '" stroke-width="' + c.w + '" stroke-linecap="' + c.cap + '"/>');
      } else if (c.t === 'text') {
        out.push('<text x="' + n(c.x) + '" y="' + n(c.y) + '" font-size="' + c.size + '" font-weight="' + (c.bold ? 700 : 400) +
          '" text-anchor="' + ANCHOR[c.align] + '" fill="' + gray(c.gray) + '">' + esc(c.text) + '</text>');
      }
    });
    if (opts.showGuides) {
      var t = page.trim, l = page.live;
      if (t.x > 0 || t.y > 0 || t.w < page.w) {
        out.push('<rect class="guide-trim" x="' + n(t.x) + '" y="' + n(t.y) + '" width="' + n(t.w) + '" height="' + n(t.h) + '"/>');
      }
      out.push('<rect class="guide-live" x="' + n(l.x) + '" y="' + n(l.y) + '" width="' + n(l.w) + '" height="' + n(l.h) + '"/>');
      var gutterX = page.side === 'right' ? t.x : t.x + t.w;
      out.push('<text class="guide-label" x="' + n(gutterX + (page.side === 'right' ? 0.06 : -0.06)) + '" y="' + n(t.y + t.h / 2) +
        '" text-anchor="' + (page.side === 'right' ? 'start' : 'end') + '">gutter</text>');
    }
    out.push('</svg>');
    return out.join('');
  }

  SS.Preview = { FAMILY: FAMILY, installFonts: installFonts, pageSVG: pageSVG };
})();
