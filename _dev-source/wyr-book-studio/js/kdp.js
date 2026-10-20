/* kdp.js — everything that depends on Amazon KDP's paperback rules:
   the gutter table, the mirrored margins and the compliance check. */
(function () {
  var W = window.WYR;
  var C = W.config;

  var K = (W.kdp = {});

  /* Minimum inside (gutter) margin KDP demands for a given page count. */
  /* "1 page" / "2 pages" */
  function count(n, word, plural) {
    return n + ' ' + (n === 1 ? word : (plural || word + 's'));
  }

  K.minGutter = function (pageCount) {
    var t = C.GUTTER_TABLE;
    for (var i = 0; i < t.length; i++) if (pageCount <= t[i].max) return t[i].gutter;
    return t[t.length - 1].gutter;
  };

  K.isLargeTrim = function (trimId) {
    var t = C.TRIMS[trimId] || C.TRIMS[C.DEFAULT_TRIM];
    return t.w >= C.LARGE_TRIM_FROM;
  };

  /* The margins we actually print with: KDP's minimum plus our own safety
     allowance, so a slightly misaligned trim still looks right. */
  K.margins = function (trimId, pageCount) {
    var outside = K.isLargeTrim(trimId) ? C.OUTSIDE_LARGE : C.OUTSIDE_SMALL;
    return {
      gutter: K.minGutter(pageCount) + C.GUTTER_SAFETY,
      minGutter: K.minGutter(pageCount),
      outside: outside,
      top: outside,
      bottom: outside
    };
  };

  /* Safe area for one physical page. Page 1 is a right-hand (odd) page, so
     odd pages carry the gutter on the left and even pages on the right. */
  K.safeArea = function (trimId, pageNo, margins) {
    var t = C.TRIMS[trimId] || C.TRIMS[C.DEFAULT_TRIM];
    var odd = pageNo % 2 === 1;
    var left = odd ? margins.gutter : margins.outside;
    var right = odd ? margins.outside : margins.gutter;
    return {
      x: left,
      y: margins.top,
      w: t.w - left - right,
      h: t.h - margins.top - margins.bottom,
      trimW: t.w,
      trimH: t.h
    };
  };

  /* Checks a finished book against the rules we can verify ourselves.
     Returns { ok, errors[], warnings[] } with messages ready to show. */
  K.audit = function (book) {
    var errors = [], warnings = [];
    var pages = book.pages, m = book.margins;
    var trim = C.TRIMS[book.trim] || C.TRIMS[C.DEFAULT_TRIM];

    if (pages.length < C.MIN_PAGES) {
      errors.push('The book is only ' + pages.length + ' pages. KDP needs at least ' +
        C.MIN_PAGES + ' — add more questions, or switch on "Write your own" pages.');
    }
    if (pages.length > C.MAX_PAGES) {
      errors.push('The book is ' + pages.length + ' pages, over the KDP maximum of ' +
        C.MAX_PAGES + '. Use fewer questions, or put two on a page.');
    }
    if (m.gutter < K.minGutter(pages.length)) {
      errors.push('Inside margin ' + m.gutter.toFixed(3) + '" is under the KDP minimum for ' +
        pages.length + ' pages.');
    }
    if (m.outside < C.MIN_OUTSIDE) {
      errors.push('Outside margin ' + m.outside.toFixed(3) + '" is under the 0.25" minimum.');
    }

    var outside = 0, tiny = 0, thin = 0, blankRun = 0, maxBlankRun = 0;
    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      var v = K.assertInSafeArea(page, book.trim, m);
      outside += v.length;
      if (v.length && outside <= 5) {
        warnings.push('Page ' + page.no + ': something sits outside the safe area (' +
          v[0].type + ').');
      }
      for (var j = 0; j < page.ops.length; j++) {
        var op = page.ops[j];
        if (op.type === 'text' && op.size < C.MIN_FONT_PT - 0.01) tiny++;
        if (op.lineWidth != null && op.lineWidth > 0 && op.lineWidth < C.MIN_LINE_PT - 0.001) thin++;
      }
      if (page.ops.length === 0) {
        blankRun++;
        if (blankRun > maxBlankRun) maxBlankRun = blankRun;
      } else blankRun = 0;
    }

    if (outside) errors.push(count(outside, 'item') + ' fall outside the safe area.');
    if (tiny) errors.push(count(tiny, 'piece') + ' of text are smaller than ' + C.MIN_FONT_PT + 'pt.');
    if (thin) errors.push(count(thin, 'line') + ' thinner than ' + C.MIN_LINE_PT + 'pt.');
    if (maxBlankRun > 1) warnings.push(count(maxBlankRun, 'blank page') + ' in a row — KDP flags that.');

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings,
      pageCount: pages.length,
      trimLabel: trim.label,
      gutter: m.gutter,
      outside: m.outside
    };
  };

  /* Returns the list of draw commands that stick out of the safe area.
     Used by the audit and by the test page. */
  K.assertInSafeArea = function (page, trimId, margins) {
    var s = K.safeArea(trimId, page.no, margins);
    var eps = 0.002;                       // ignore rounding noise
    var bad = [];
    for (var i = 0; i < page.ops.length; i++) {
      var op = page.ops[i], box = K.opBox(op);
      if (!box) continue;
      if (box.x < s.x - eps || box.y < s.y - eps ||
          box.x + box.w > s.x + s.w + eps || box.y + box.h > s.y + s.h + eps) {
        bad.push({ type: op.type, box: box, safe: s, op: op });
      }
    }
    return bad;
  };

  /* Bounding box of a draw command, in inches. */
  K.opBox = function (op) {
    switch (op.type) {
      case 'text': {
        var lh = (op.lineHeight || C.LINE_HEIGHT) * op.size / 72;
        var n = op.lines ? op.lines.length : 1;
        var x = op.x, w = op.w || 0;
        if (!op.w) {                        // unmeasured single line, be lenient
          w = op.width || 0;
          if (op.align === 'center') x -= w / 2;
          else if (op.align === 'right') x -= w;
        }
        return { x: x, y: op.y, w: w, h: n * lh };
      }
      case 'rect':
        return { x: op.x, y: op.y, w: op.w, h: op.h };
      case 'circle':
        return { x: op.cx - op.r, y: op.cy - op.r, w: op.r * 2, h: op.r * 2 };
      case 'line':
        return {
          x: Math.min(op.x1, op.x2), y: Math.min(op.y1, op.y2),
          w: Math.abs(op.x2 - op.x1), h: Math.abs(op.y2 - op.y1)
        };
      default:
        return null;
    }
  };
})();
