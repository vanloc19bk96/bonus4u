/*
 * PDF export with jsPDF: real text with embedded fonts, vector lines, one page per laid-out page
 * at the exact trim size, black and gray ink only, no links, forms, passwords or transparency.
 * The creation date and file ID come from the project, so the same project gives the same file.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var INFO = LK.metrics.FONT_INFO;

  function jsPDFCtor() {
    var j = root.jspdf && root.jspdf.jsPDF;
    if (!j && typeof root.jsPDF === 'function') j = root.jsPDF;
    if (!j) throw new Error('The PDF tool did not load');
    return j;
  }

  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  function level(g) { return Math.round(255 * (1 - g)); }

  function drawPage(doc, page, cur) {
    var items = page.items;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.t === 'text') {
        var name = INFO[it.font].pdf;
        if (cur.font !== name) { doc.setFont(name, 'normal'); cur.font = name; }
        if (cur.size !== it.size) { doc.setFontSize(it.size); cur.size = it.size; }
        var tc = it.color || (it.paper ? 255 : 0);
        if (cur.text !== tc) { doc.setTextColor(tc); cur.text = tc; }
        if (it.angle || it.hs) {
          var to = {};
          if (it.angle) to.angle = it.angle;
          if (it.hs) to.horizontalScale = it.hs;
          doc.text(it.str, it.x, it.y, to);
        } else doc.text(it.str, it.x, it.y);
        // PDF text paints with the fill color, so the next filled shape must set its own again
        cur.fill = null;
      } else if (it.t === 'line') {
        var g = it.color || (it.gray ? level(it.gray) : 0);
        if (cur.draw !== g) { doc.setDrawColor(g); cur.draw = g; }
        doc.setLineWidth(it.w);
        if (it.cap) doc.setLineCap('round');
        doc.line(it.x1, it.y1, it.x2, it.y2);
        if (it.cap) doc.setLineCap('butt');
      } else if (it.t === 'rect') {
        if (it.color) {
          if (cur.fill !== it.color) { doc.setFillColor(it.color); cur.fill = it.color; }
          doc.rect(it.x, it.y, it.w, it.h, 'F');
        } else if (it.stroke) {
          if (cur.draw !== it.stroke) { doc.setDrawColor(it.stroke); cur.draw = it.stroke; }
          doc.setLineWidth(it.lw);
          doc.rect(it.x, it.y, it.w, it.h, 'S');
        } else if (it.fill) {
          var f = level(it.fill);
          if (cur.fill !== f) { doc.setFillColor(f); cur.fill = f; }
          doc.rect(it.x, it.y, it.w, it.h, 'F');
        } else {
          if (cur.draw !== 0) { doc.setDrawColor(0); cur.draw = 0; }
          doc.setLineWidth(it.lw);
          doc.rect(it.x, it.y, it.w, it.h, 'S');
        }
      } else if (it.t === 'poly') {
        var p = it.pts, d = [];
        for (var k = 2; k < p.length; k += 2) d.push([p[k] - p[k - 2], p[k + 1] - p[k - 1]]);
        if (it.color) {
          if (cur.fill !== it.color) { doc.setFillColor(it.color); cur.fill = it.color; }
          doc.lines(d, p[0], p[1], [1, 1], 'F', true);
        } else {
          if (cur.draw !== it.stroke) { doc.setDrawColor(it.stroke); cur.draw = it.stroke; }
          doc.setLineWidth(it.lw);
          if (it.round) { doc.setLineCap('round'); doc.setLineJoin('round'); }
          doc.lines(d, p[0], p[1], [1, 1], 'S', !!it.closed);
          if (it.round) { doc.setLineCap('butt'); doc.setLineJoin('miter'); }
        }
      } else if (it.t === 'ellipse') {
        if (it.color) {
          if (cur.fill !== it.color) { doc.setFillColor(it.color); cur.fill = it.color; }
          doc.ellipse(it.cx, it.cy, it.rx, it.ry, 'F');
        } else {
          var sc = it.stroke || 0;
          if (cur.draw !== sc) { doc.setDrawColor(sc); cur.draw = sc; }
          doc.setLineWidth(it.lw);
          doc.ellipse(it.cx, it.cy, it.rx, it.ry, 'S');
        }
      }
    }
  }

  /*
   * book: from LK.layout.layoutBook; meta: { title, author, subject, keywords, createdAt, fileId }
   * onProgress(fraction). Resolves with an ArrayBuffer.
   */
  async function build(book, meta, onProgress) {
    var JsPDF = jsPDFCtor();
    var W = book.W, H = book.H;
    var doc = new JsPDF({ unit: 'pt', format: [W, H], orientation: 'portrait', compress: true, putOnlyUsedFonts: true });
    var data = root.LK_FONT_DATA;
    Object.keys(INFO).forEach(function (key) {
      var file = data[key].file;
      doc.addFileToVFS(file, data[key].data);
      doc.addFont(file, INFO[key].pdf, 'normal');
    });
    doc.setDocumentProperties({
      title: meta.title || '', author: meta.author || '', subject: meta.subject || '',
      keywords: meta.keywords || '', creator: 'Murder Archive Studio'
    });
    if (meta.createdAt) doc.setCreationDate(new Date(meta.createdAt));
    if (meta.fileId) doc.setFileId(meta.fileId);
    doc.setLineCap('butt'); doc.setLineJoin('miter');
    for (var i = 0; i < book.pages.length; i++) {
      if (i > 0) doc.addPage([W, H], 'portrait');
      doc.setDrawColor(0); doc.setFillColor(0); doc.setTextColor(0);
      drawPage(doc, book.pages[i], { draw: 0, fill: 0, text: 0 });
      if (onProgress && i % 6 === 5) { onProgress((i + 1) / book.pages.length * 0.9); await tick(); }
    }
    if (onProgress) { onProgress(0.95); await tick(); }
    var buf = doc.output('arraybuffer');
    if (onProgress) onProgress(1);
    return buf;
  }

  /*
   * The full-wrap paperback cover as a one-page PDF at the exact size KDP asks for.
   * cv: from LK.cover.layout; meta as for build().
   */
  async function buildCover(cv, meta) {
    var JsPDF = jsPDFCtor();
    var doc = new JsPDF({ unit: 'pt', format: [cv.W, cv.H], orientation: cv.W > cv.H ? 'landscape' : 'portrait', compress: true, putOnlyUsedFonts: true });
    var data = root.LK_FONT_DATA;
    Object.keys(INFO).forEach(function (key) {
      var file = data[key].file;
      doc.addFileToVFS(file, data[key].data);
      doc.addFont(file, INFO[key].pdf, 'normal');
    });
    doc.setDocumentProperties({ title: (meta.title || '') + ' (cover)', author: meta.author || '', creator: 'Murder Archive Studio' });
    if (meta.createdAt) doc.setCreationDate(new Date(meta.createdAt));
    if (meta.fileId) doc.setFileId(meta.fileId);
    doc.setLineCap('butt'); doc.setLineJoin('miter');
    doc.setDrawColor(0); doc.setFillColor(0); doc.setTextColor(0);
    drawPage(doc, cv, { draw: 0, fill: 0, text: 0 });
    return doc.output('arraybuffer');
  }

  LK.pdf = { build: build, buildCover: buildCover };
})(typeof window !== 'undefined' ? window : globalThis);
