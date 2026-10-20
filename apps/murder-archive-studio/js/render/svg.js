/* Preview renderer: draws a laid-out page as SVG, item for item, with the same fonts as the PDF. */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var esc = LK.util.escapeHtml;
  var INFO = LK.metrics.FONT_INFO;

  function ink(g) { var v = Math.round(255 * (1 - g)); return 'rgb(' + v + ',' + v + ',' + v + ')'; }

  function items(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it.t === 'text') {
        var fillc = it.color || (it.paper ? '#fff' : null);
        var rot = it.angle ? ' transform="rotate(' + (-it.angle) + ' ' + it.x + ' ' + it.y + ')"' : '';
        var tx = it.x, ty = it.y;
        if (it.hs) {
          rot = ' transform="translate(' + it.x + ' ' + it.y + ')' + (it.angle ? ' rotate(' + (-it.angle) + ')' : '') + ' scale(' + it.hs + ' 1)"';
          tx = 0; ty = 0;
        }
        out.push('<text x="' + tx + '" y="' + ty + '" font-family="' + INFO[it.font].css + '" font-size="' + it.size + '"' +
          (fillc ? ' style="fill:' + fillc + '"' : '') + rot + '>' + esc(it.str) + '</text>');
      } else if (it.t === 'line') {
        var st = it.color || (it.gray ? ink(it.gray) : null);
        out.push('<line x1="' + it.x1 + '" y1="' + it.y1 + '" x2="' + it.x2 + '" y2="' + it.y2 + '" stroke-width="' + it.w + '"' +
          (st ? ' style="stroke:' + st + '"' : '') + (it.cap ? ' stroke-linecap="round"' : '') + '/>');
      } else if (it.t === 'rect') {
        if (it.color) {
          out.push('<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" style="fill:' + it.color + '"/>');
        } else if (it.stroke) {
          out.push('<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" style="fill:none;stroke:' + it.stroke + ';stroke-width:' + it.lw + '"/>');
        } else {
          out.push(it.fill
            ? '<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" fill="' + ink(it.fill) + '"/>'
            : '<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" stroke-width="' + it.lw + '" class="s"/>');
        }
      } else if (it.t === 'poly') {
        out.push('<' + (it.closed ? 'polygon' : 'polyline') + ' points="' + it.pts.join(' ') + '" style="' +
          (it.color ? 'fill:' + it.color + ';stroke:none' : 'fill:none;stroke:' + it.stroke + ';stroke-width:' + it.lw) +
          (it.round ? ';stroke-linejoin:round;stroke-linecap:round' : '') + '"/>');
      } else if (it.t === 'ellipse') {
        out.push('<ellipse cx="' + it.cx + '" cy="' + it.cy + '" rx="' + it.rx + '" ry="' + it.ry + '" style="' +
          (it.color ? 'fill:' + it.color + ';stroke:none' : 'fill:none;stroke:' + (it.stroke || '#000') + ';stroke-width:' + it.lw) + '"/>');
      }
    }
    return out.join('');
  }

  function wrapNote(t, max) {
    var words = String(t || '').split(' '), lines = [], cur = '';
    words.forEach(function (w) { if ((cur + ' ' + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) lines.push(cur);
    return lines.slice(0, 4);
  }

  /*
   * opts: { margins: bool, killer: bool }
   */
  function render(page, opts) {
    opts = opts || {};
    var W = page.W, H = page.H;
    var s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" class="page-svg" role="img" aria-label="' + esc('Page ' + page.num + ', ' + page.label) + '">'];
    s.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" class="paper"/>');
    if (opts.killer && page.meta.killerRow) {
      var k = page.meta.killerRow;
      s.push('<rect x="' + k.x + '" y="' + k.y + '" width="' + k.w + '" height="' + k.h + '" class="killer-row"/>');
    }
    s.push('<g class="ink">' + items(page.items) + '</g>');
    var ph = page.meta.placeholder;
    if (ph && (ph.title || ph.note)) {
      var cx = (page.x0 + page.x1) / 2, top = H * 0.36;
      s.push('<g class="ph">');
      s.push('<rect x="' + (page.x0 + 6) + '" y="' + top + '" width="' + (page.x1 - page.x0 - 12) + '" height="' + (H * 0.26) + '" rx="10" class="ph-box"/>');
      s.push('<text x="' + cx + '" y="' + (top + H * 0.09) + '" text-anchor="middle" class="ph-title">' + esc(ph.title) + '</text>');
      wrapNote(ph.note, Math.round((page.x1 - page.x0) / 6.4)).forEach(function (l, i) {
        s.push('<text x="' + cx + '" y="' + (top + H * 0.09 + 24 + i * 16) + '" text-anchor="middle" class="ph-note">' + esc(l) + '</text>');
      });
      s.push('</g>');
    }
    if (opts.margins) {
      s.push('<rect x="' + page.x0 + '" y="' + page.y0 + '" width="' + (page.x1 - page.x0) + '" height="' + (page.y1 - page.y0) + '" class="safe"/>');
      var gx = page.side === 'right' ? 0 : page.x1;
      var gw = page.side === 'right' ? page.x0 : W - page.x1;
      s.push('<rect x="' + gx + '" y="0" width="' + gw + '" height="' + H + '" class="gutter"/>');
    }
    s.push('</svg>');
    return s.join('');
  }

  /*
   * A full-wrap cover (from LK.cover.layout) as one SVG. opts.guides draws the trim, spine and safe lines.
   */
  function renderCover(cv, opts) {
    opts = opts || {};
    var vb = opts.crop ? opts.crop.x + ' ' + opts.crop.y + ' ' + opts.crop.w + ' ' + opts.crop.h : '0 0 ' + cv.W + ' ' + cv.H;
    var s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" class="cover-svg" role="img" aria-label="Book cover: back, spine and front">'];
    s.push('<g class="ink">' + items(cv.items) + '</g>');
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

  LK.svg = { render: render, renderCover: renderCover };
})(typeof window !== 'undefined' ? window : globalThis);
