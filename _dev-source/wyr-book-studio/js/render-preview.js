/* render-preview.js — draws the display list into the DOM.

   The preview uses the same fonts, the same font sizes and the same
   pre-wrapped lines as the PDF, so what you see is what gets printed.
   One page is shown at a time and the toolbar moves between them, so the
   size of the book makes no difference to how fast the preview feels.   */
(function () {
  var W = window.WYR;
  var C = W.config;
  var K = W.kdp;
  var T = W.typeset;

  var R = (W.preview = {});

  var PX = 96;                       // CSS pixels per inch at zoom 1
  var fontsInjected = false;

  /* Injects @font-face rules built from the very base64 the PDF embeds. */
  R.injectFonts = function () {
    if (fontsInjected) return;
    var css = [];
    for (var key in W.fonts) {
      if (!Object.prototype.hasOwnProperty.call(W.fonts, key)) continue;
      var f = W.fonts[key];
      var family = C.PREVIEW_FAMILY[f.family] || ('WYR' + f.family);
      css.push(
        '@font-face{font-family:"' + family + '";' +
        'font-weight:' + (f.style === 'bold' ? '700' : '400') + ';' +
        'font-style:' + (f.style === 'italic' ? 'italic' : 'normal') + ';' +
        'font-display:block;' +
        'src:url(data:font/ttf;base64,' + f.base64 + ') format("truetype");}'
      );
    }
    var style = document.createElement('style');
    style.id = 'wyr-font-faces';
    style.textContent = css.join('\n');
    document.head.appendChild(style);
    fontsInjected = true;
  };

  function grey(v) {
    if (typeof v === 'string') return v;
    var n = Math.round(Math.max(0, Math.min(1, v)) * 255);
    return 'rgb(' + n + ',' + n + ',' + n + ')';
  }

  /* --- one page -------------------------------------------------------- */
  R.renderPage = function (page, book, zoom, showMargins) {
    var trim = C.TRIMS[book.trim] || C.TRIMS[C.DEFAULT_TRIM];
    var el = document.createElement('div');
    el.className = 'page' + (page.no % 2 === 1 ? ' page--odd' : ' page--even');
    el.style.width = (trim.w * PX * zoom) + 'px';
    el.style.height = (trim.h * PX * zoom) + 'px';
    el.dataset.pageNo = page.no;
    R.fillPage(el, page, book, zoom, showMargins);
    return el;
  };

  R.fillPage = function (el, page, book, zoom, showMargins) {
    var k = PX * zoom;
    el.textContent = '';

    if (showMargins) {
      var s = K.safeArea(book.trim, page.no, book.margins);
      var guide = document.createElement('div');
      guide.className = 'page__safe';
      guide.style.left = (s.x * k) + 'px';
      guide.style.top = (s.y * k) + 'px';
      guide.style.width = (s.w * k) + 'px';
      guide.style.height = (s.h * k) + 'px';
      el.appendChild(guide);
    }

    for (var i = 0; i < page.ops.length; i++) {
      var node = R.renderOp(page.ops[i], k);
      if (node) el.appendChild(node);
    }
    el.dataset.filled = '1';
  };

  R.renderOp = function (op, k) {
    switch (op.type) {
      case 'text':   return textNode(op, k);
      case 'rect':   return rectNode(op, k);
      case 'circle': return circleNode(op, k);
      case 'line':   return lineNode(op, k);
      default:       return null;
    }
  };

  function textNode(op, k) {
    var wrap = document.createElement('div');
    wrap.className = 'op op--text';
    wrap.style.left = (op.x * k) + 'px';
    wrap.style.top = (op.y * k) + 'px';
    wrap.style.width = (op.w * k) + 'px';
    wrap.style.color = grey(op.color);
    wrap.style.textAlign = op.align;

    var family = C.PREVIEW_FAMILY[op.family] || ('WYR' + op.family);
    var sizePx = op.size / 72 * k;
    var lhPx = T.lineHeight(op.size) * k;
    wrap.style.fontFamily = '"' + family + '"';
    wrap.style.fontWeight = op.style === 'bold' ? '700' : '400';
    wrap.style.fontStyle = op.style === 'italic' ? 'italic' : 'normal';
    wrap.style.fontSize = sizePx + 'px';
    wrap.style.lineHeight = lhPx + 'px';

    for (var i = 0; i < op.lines.length; i++) {
      var lineEl = document.createElement('div');
      lineEl.className = 'op__line';
      lineEl.textContent = op.lines[i];
      wrap.appendChild(lineEl);
    }
    return wrap;
  }

  function rectNode(op, k) {
    var el = document.createElement('div');
    el.className = 'op op--rect';
    el.style.left = (op.x * k) + 'px';
    el.style.top = (op.y * k) + 'px';
    el.style.width = (op.w * k) + 'px';
    el.style.height = (op.h * k) + 'px';
    if (op.fill != null) el.style.background = grey(op.fill);
    if (op.stroke != null && op.lineWidth) {
      el.style.border = (op.lineWidth / 72 * k) + 'px solid ' + grey(op.stroke);
      el.style.boxSizing = 'border-box';
    }
    if (op.radius) el.style.borderRadius = (op.radius * k) + 'px';
    return el;
  }

  function circleNode(op, k) {
    var el = document.createElement('div');
    el.className = 'op op--circle';
    el.style.left = ((op.cx - op.r) * k) + 'px';
    el.style.top = ((op.cy - op.r) * k) + 'px';
    el.style.width = (op.r * 2 * k) + 'px';
    el.style.height = (op.r * 2 * k) + 'px';
    el.style.borderRadius = '50%';
    if (op.fill != null) el.style.background = grey(op.fill);
    if (op.stroke != null && op.lineWidth) {
      el.style.border = (op.lineWidth / 72 * k) + 'px solid ' + grey(op.stroke);
      el.style.boxSizing = 'border-box';
    }
    return el;
  }

  function lineNode(op, k) {
    var el = document.createElement('div');
    el.className = 'op op--line';
    var thick = Math.max(1, op.lineWidth / 72 * k);
    var horizontal = Math.abs(op.y2 - op.y1) < 0.0005;
    if (horizontal) {
      el.style.left = (Math.min(op.x1, op.x2) * k) + 'px';
      el.style.top = (op.y1 * k - thick / 2) + 'px';
      el.style.width = (Math.abs(op.x2 - op.x1) * k) + 'px';
      el.style.height = thick + 'px';
    } else {
      el.style.left = (op.x1 * k - thick / 2) + 'px';
      el.style.top = (Math.min(op.y1, op.y2) * k) + 'px';
      el.style.width = thick + 'px';
      el.style.height = (Math.abs(op.y2 - op.y1) * k) + 'px';
    }
    if (op.dash) {
      var dash = (op.dash[0] * k) + 'px';
      var gap = (op.dash[1] * k) + 'px';
      el.style.background = 'repeating-linear-gradient(' +
        (horizontal ? 'to right' : 'to bottom') + ',' +
        grey(op.color) + ' 0 ' + dash + ',transparent ' + dash + ' calc(' + dash + ' + ' + gap + '))';
    } else {
      el.style.background = grey(op.color);
    }
    return el;
  }

  /* --- one page at a time ---------------------------------------------- */

  /* Only the page being looked at is ever in the DOM. A 700 page book costs
     exactly as much to show as a 24 page one, and nothing has to be evicted
     again while scrolling. */
  R.render = function (container, book, ui) {
    R.injectFonts();
    var zoom = ui.zoom || 1;
    var trim = C.TRIMS[book.trim] || C.TRIMS[C.DEFAULT_TRIM];
    var no = R.clampPage(book, ui.page);
    var page = book.pages[no - 1];

    container.textContent = '';
    if (page) {
      var el = R.renderPage(page, book, zoom, ui.showMargins);
      container.appendChild(el);
      container.scrollTop = 0;
      container.scrollLeft = Math.max(0, (el.offsetWidth - container.clientWidth) / 2);
    }
    return { pageCount: book.pages.length, trim: trim, page: no };
  };

  /* A page number that exists in this book. */
  R.clampPage = function (book, no) {
    no = parseInt(no, 10);
    if (!no || no < 1) no = 1;
    return Math.min(no, Math.max(1, book.pages.length));
  };
})();
