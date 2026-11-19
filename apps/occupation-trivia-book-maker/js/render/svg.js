/* Preview renderer: draws a laid-out page (or the cover) as SVG, item for item, with the PDF's fonts. */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var esc = CX.util.escapeHtml;
  var INFO = CX.metrics.FONT_INFO;

  function gray(ink) { var v = Math.round(255 * (1 - (ink == null ? 1 : ink))); return 'rgb(' + v + ',' + v + ',' + v + ')'; }
  function col(it) { return it.color || gray(it.ink); }

  function items(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it.t === 'text') {
        var tf = '', tx = it.x, ty = it.y;
        if (it.hs || it.angle) {
          tf = ' transform="translate(' + it.x + ' ' + it.y + ')' + (it.angle ? ' rotate(' + (-it.angle) + ')' : '') + (it.hs ? ' scale(' + it.hs + ' 1)' : '') + '"';
          tx = 0; ty = 0;
        }
        out.push('<text x="' + tx + '" y="' + ty + '" font-family="' + INFO[it.font].css + '" font-size="' + it.size + '"' +
          (it.ls ? ' letter-spacing="' + it.ls + '"' : '') + ' fill="' + col(it) + '"' + tf + ' xml:space="preserve">' + esc(it.str) + '</text>');
      } else if (it.t === 'line') {
        out.push('<line x1="' + it.x1 + '" y1="' + it.y1 + '" x2="' + it.x2 + '" y2="' + it.y2 + '" stroke="' + col(it) + '" stroke-width="' + it.w + '"' +
          (it.dash ? ' stroke-dasharray="' + it.dash.join(' ') + '"' : '') + (it.cap ? ' stroke-linecap="round"' : '') + '/>');
      } else if (it.t === 'rect') {
        out.push('<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" ' + paint(it) + '/>');
      } else if (it.t === 'ellipse') {
        out.push('<ellipse cx="' + it.cx + '" cy="' + it.cy + '" rx="' + it.rx + '" ry="' + it.ry + '" ' + paint(it) + '/>');
      } else if (it.t === 'poly') {
        out.push('<' + (it.closed ? 'polygon' : 'polyline') + ' points="' + it.pts.join(' ') + '" ' + paint(it) +
          (it.round ? ' stroke-linejoin="round" stroke-linecap="round"' : '') + '/>');
      }
    }
    return out.join('');
  }

  function paint(it) {
    if (it.mode === 'stroke') return 'fill="none" stroke="' + col(it) + '" stroke-width="' + it.lw + '"' + (it.dash ? ' stroke-dasharray="' + it.dash.join(' ') + '"' : '');
    return 'fill="' + col(it) + '" stroke="none"';
  }

  /* opts: { margins: bool, answer: bool } */
  function render(page, opts) {
    opts = opts || {};
    var W = page.W, H = page.H;
    var s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" class="page-svg" role="img" aria-label="' + esc('Page ' + page.num + ', ' + page.label) + '">'];
    s.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" class="paper"/>');
    if (opts.answer && page.meta.answerBox) {
      var a = page.meta.answerBox;
      s.push('<rect x="' + a.x + '" y="' + a.y + '" width="' + a.w + '" height="' + a.h + '" rx="3" class="answer-mark"/>');
    }
    s.push('<g>' + items(page.items) + '</g>');
    if (opts.margins) {
      s.push('<rect x="' + page.x0 + '" y="' + page.y0 + '" width="' + (page.x1 - page.x0) + '" height="' + (page.y1 - page.y0) + '" class="safe"/>');
      var gx = page.side === 'right' ? 0 : page.x1;
      var gw = page.side === 'right' ? page.x0 : W - page.x1;
      s.push('<rect x="' + gx + '" y="0" width="' + gw + '" height="' + H + '" class="gutter"/>');
    }
    s.push('</svg>');
    return s.join('');
  }

  // A full-wrap cover as one SVG. opts.guides draws the trim, spine folds, safe areas and barcode box.
  function renderCover(cv, opts) {
    opts = opts || {};
    var vb = opts.crop ? opts.crop.x + ' ' + opts.crop.y + ' ' + opts.crop.w + ' ' + opts.crop.h : '0 0 ' + cv.W + ' ' + cv.H;
    var s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" class="cover-svg" role="img" aria-label="Book cover: back, spine and front">'];
    s.push('<g>' + items(cv.items) + '</g>');
    if (opts.guides) {
      var g = cv.guides;
      s.push('<g class="guides">');
      s.push('<rect x="' + g.bleed + '" y="' + g.bleed + '" width="' + (cv.W - g.bleed * 2) + '" height="' + (cv.H - g.bleed * 2) + '" class="trim"/>');
      s.push('<line x1="' + g.spineX0 + '" y1="0" x2="' + g.spineX0 + '" y2="' + cv.H + '" class="trim"/>');
      s.push('<line x1="' + g.spineX1 + '" y1="0" x2="' + g.spineX1 + '" y2="' + cv.H + '" class="trim"/>');
      g.safe.forEach(function (r) { s.push('<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" class="safe"/>'); });
      if (g.barcode) s.push('<rect x="' + g.barcode.x + '" y="' + g.barcode.y + '" width="' + g.barcode.w + '" height="' + g.barcode.h + '" class="barcode"/>' +
        '<text x="' + (g.barcode.x + g.barcode.w / 2) + '" y="' + (g.barcode.y + g.barcode.h / 2 + 3) + '" text-anchor="middle" class="guide-label">KDP barcode area</text>');
      s.push('</g>');
    }
    s.push('</svg>');
    return s.join('');
  }

  CX.svg = { render: render, renderCover: renderCover, items: items };
})(typeof window !== 'undefined' ? window : globalThis);
