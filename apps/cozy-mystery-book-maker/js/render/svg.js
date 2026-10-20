/* Preview renderer: draws a laid-out page as SVG, item for item, using the same fonts as the PDF. */
(function (root) {
  'use strict';
  var Cozy = root.Cozy = root.Cozy || {};
  var esc = Cozy.util.escapeHtml;
  var INFO = Cozy.metrics.FONT_INFO;

  function pathD(d) {
    return d.map(function (c) { return c[0] + (c.length > 1 ? c.slice(1).join(' ') : ''); }).join(' ');
  }

  function items(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it.t === 'text') {
        out.push('<text x="' + it.x + '" y="' + it.y + '" font-family="' + INFO[it.font].css + '" font-size="' + it.size + '">' + esc(it.str) + '</text>');
      } else if (it.t === 'line') {
        out.push('<line x1="' + it.x1 + '" y1="' + it.y1 + '" x2="' + it.x2 + '" y2="' + it.y2 + '" stroke-width="' + it.w + '"/>');
      } else if (it.t === 'rect') {
        out.push(it.fill
          ? '<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" class="f"/>'
          : '<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" stroke-width="' + it.lw + '" class="s"/>');
      } else if (it.t === 'path') {
        out.push(it.fill ? '<path d="' + pathD(it.d) + '" class="f"/>' : '<path d="' + pathD(it.d) + '" stroke-width="' + it.lw + '" class="s"/>');
      }
    }
    return out.join('');
  }

  function capsules(g, extraClass) {
    var D = Cozy.puzzle.DIRS, out = [];
    g.placements.forEach(function (pl) {
      var ax = g.x + pl.c * g.cell + g.cell / 2, ay = g.y + pl.r * g.cell + g.cell / 2;
      var n = pl.word.length - 1;
      var bx = ax + D[pl.d][1] * g.cell * n, by = ay + D[pl.d][0] * g.cell * n;
      out.push('<line x1="' + ax + '" y1="' + ay + '" x2="' + bx + '" y2="' + by + '" class="ans ' + (extraClass || '') + '" stroke-width="' + (g.cell * 0.72) + '"/>');
    });
    return out.join('');
  }

  /*
   * opts: { margins: bool, answers: bool }
   */
  function render(page, opts) {
    opts = opts || {};
    var s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 432 648" class="page-svg" role="img" aria-label="' + esc('Page ' + page.num + ', ' + page.label) + '">'];
    s.push('<rect x="0" y="0" width="432" height="648" class="paper"/>');
    if (opts.answers && page.meta.grid) s.push('<g class="answers">' + capsules(page.meta.grid) + '</g>');
    s.push('<g class="ink">' + items(page.items) + '</g>');
    if (page.meta.placeholder) {
      var cx = (page.x0 + page.x1) / 2;
      s.push('<g class="ph">');
      s.push('<rect x="' + (page.x0 + 8) + '" y="170" width="' + (page.x1 - page.x0 - 16) + '" height="250" rx="10" class="ph-box"/>');
      s.push('<text x="' + cx + '" y="270" text-anchor="middle" class="ph-title">' + esc(page.meta.placeholderTitle || '') + '</text>');
      wrapNote(page.meta.note || '', 44).forEach(function (l, i) {
        s.push('<text x="' + cx + '" y="' + (300 + i * 18) + '" text-anchor="middle" class="ph-note">' + esc(l) + '</text>');
      });
      s.push('</g>');
    }
    if (opts.margins) {
      s.push('<rect x="' + page.x0 + '" y="' + page.y0 + '" width="' + (page.x1 - page.x0) + '" height="' + (page.y1 - page.y0) + '" class="safe"/>');
      var gutterX = page.side === 'right' ? 0 : page.x1;
      var gutterW = page.side === 'right' ? page.x0 : 432 - page.x1;
      s.push('<rect x="' + gutterX + '" y="0" width="' + gutterW + '" height="648" class="gutter"/>');
    }
    s.push('</svg>');
    return s.join('');
  }

  function wrapNote(t, max) {
    var words = t.split(' '), lines = [], cur = '';
    words.forEach(function (w) { if ((cur + ' ' + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) lines.push(cur);
    return lines.slice(0, 5);
  }

  Cozy.svg = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
