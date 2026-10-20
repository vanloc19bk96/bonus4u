/* render-pdf.js — draws the same display list into a jsPDF document.

   Text stays real text (vector, selectable, searchable) with the TTFs
   embedded as a subset, which is what KDP requires. No html2canvas, no
   transparency and no document outline, all of which KDP rejects or
   degrades.                                                              */
(function () {
  var W = window.WYR;
  var C = W.config;
  var T = W.typeset;

  var R = (W.pdf = {});

  function grey(v, doc, kind) {
    var n = Math.round(Math.max(0, Math.min(1, v)) * 255);
    if (kind === 'text') doc.setTextColor(n, n, n);
    else if (kind === 'fill') doc.setFillColor(n, n, n);
    else doc.setDrawColor(n, n, n);
  }

  R.drawOp = function (doc, op) {
    switch (op.type) {
      case 'text':   return drawText(doc, op);
      case 'rect':   return drawRect(doc, op);
      case 'circle': return drawCircle(doc, op);
      case 'line':   return drawLine(doc, op);
      default:       return;
    }
  };

  function drawText(doc, op) {
    doc.setFont(op.family, op.style);
    doc.setFontSize(op.size);
    grey(typeof op.color === 'number' ? op.color : 0, doc, 'text');

    var key = C.FONT_KEY(op.family, op.style);
    var lh = T.lineHeight(op.size);
    var base = T.baselineOffset(key, op.size);

    var x = op.x;
    if (op.align === 'center') x = op.x + op.w / 2;
    else if (op.align === 'right') x = op.x + op.w;

    for (var i = 0; i < op.lines.length; i++) {
      var str = op.lines[i];
      if (!str) continue;
      doc.text(str, x, op.y + i * lh + base, { align: op.align, baseline: 'alphabetic' });
    }
  }

  function drawRect(doc, op) {
    var mode = '';
    if (op.fill != null) { grey(op.fill, doc, 'fill'); mode += 'F'; }
    if (op.stroke != null && op.lineWidth) {
      grey(op.stroke, doc, 'draw');
      doc.setLineWidth(op.lineWidth / 72);
      mode = mode ? 'FD' : 'S';
    }
    if (!mode) return;
    if (op.radius) doc.roundedRect(op.x, op.y, op.w, op.h, op.radius, op.radius, mode);
    else doc.rect(op.x, op.y, op.w, op.h, mode);
  }

  function drawCircle(doc, op) {
    var mode = '';
    if (op.fill != null) { grey(op.fill, doc, 'fill'); mode += 'F'; }
    if (op.stroke != null && op.lineWidth) {
      grey(op.stroke, doc, 'draw');
      doc.setLineWidth(op.lineWidth / 72);
      mode = mode ? 'FD' : 'S';
    }
    if (!mode) return;
    doc.circle(op.cx, op.cy, op.r, mode);
  }

  function drawLine(doc, op) {
    grey(typeof op.color === 'number' ? op.color : 0, doc, 'draw');
    doc.setLineWidth(Math.max(C.MIN_LINE_PT, op.lineWidth) / 72);
    if (op.dash) doc.setLineDashPattern(op.dash, 0);
    doc.line(op.x1, op.y1, op.x2, op.y2);
    if (op.dash) doc.setLineDashPattern([], 0);
  }

  /* Builds the whole PDF. onProgress(done, total) is called between pages
     and the loop yields to the browser, so the UI never freezes.        */
  R.build = function (book, meta, onProgress) {
    var trim = C.TRIMS[book.trim] || C.TRIMS[C.DEFAULT_TRIM];
    var doc = T.newDoc(trim.w, trim.h);

    doc.setProperties({
      title: meta.title || 'Would You Rather',
      author: meta.author || '',
      subject: meta.subtitle || '',
      creator: 'WYR Book Studio'
    });

    var i = 0;
    var total = book.pages.length;

    function step() {
      var deadline = Date.now() + 40;          // stay responsive
      while (i < total && Date.now() < deadline) {
        if (i > 0) doc.addPage([trim.w, trim.h], 'portrait');
        var page = book.pages[i];
        for (var j = 0; j < page.ops.length; j++) R.drawOp(doc, page.ops[j]);
        i++;
      }
      if (onProgress) onProgress(i, total);
      if (i < total) {
        return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(step);
      }
      return Promise.resolve(doc);
    }

    return Promise.resolve().then(step);
  };

  /* A safe, KDP-friendly filename: ascii only, no spaces, no emoji. */
  R.filename = function (meta, trimId) {
    var base = (meta.title || 'would-you-rather')
      .normalize ? (meta.title || 'would-you-rather').normalize('NFD') : (meta.title || 'would-you-rather');
    base = base
      .replace(/[\u0300-\u036F]/g, '')
      .replace(/\u0110/g, 'D').replace(/\u0111/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'would-you-rather';
    return base + '-' + String(trimId).replace(/[^0-9x.]/g, '') + '-interior.pdf';
  };

  R.save = function (doc, filename) { doc.save(filename); };
})();
