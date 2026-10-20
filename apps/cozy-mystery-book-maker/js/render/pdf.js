/*
 * PDF export with jsPDF: real text with fully embedded fonts, vector grids, one 6 x 9 in page per
 * laid-out page, 100% black only, no links, forms, passwords or transparency.
 * The creation date and file ID come from the project, so the same project gives the same file.
 */
(function (root) {
  'use strict';
  var Cozy = root.Cozy = root.Cozy || {};
  var INFO = Cozy.metrics.FONT_INFO;

  function jsPDFCtor() {
    var j = root.jspdf && root.jspdf.jsPDF;
    if (!j && typeof root.jsPDF === 'function') j = root.jsPDF;
    if (!j) throw new Error('The PDF tool did not load');
    return j;
  }

  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  function drawPage(doc, page, current) {
    var items = page.items;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.t === 'text') {
        var name = INFO[it.font].pdf;
        if (current.font !== name) { doc.setFont(name, 'normal'); current.font = name; }
        if (current.size !== it.size) { doc.setFontSize(it.size); current.size = it.size; }
        doc.text(it.str, it.x, it.y);
      } else if (it.t === 'line') {
        doc.setLineWidth(it.w);
        doc.line(it.x1, it.y1, it.x2, it.y2);
      } else if (it.t === 'rect') {
        if (it.fill) doc.rect(it.x, it.y, it.w, it.h, 'F');
        else { doc.setLineWidth(it.lw); doc.rect(it.x, it.y, it.w, it.h, 'S'); }
      } else if (it.t === 'path') {
        if (!it.fill) doc.setLineWidth(it.lw);
        for (var k = 0; k < it.d.length; k++) {
          var c = it.d[k];
          if (c[0] === 'M') doc.moveTo(c[1], c[2]);
          else if (c[0] === 'L') doc.lineTo(c[1], c[2]);
          else if (c[0] === 'C') doc.curveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
          else if (c[0] === 'Z') doc.close();
        }
        if (it.fill) doc.fill(); else doc.stroke();
      }
    }
  }

  /*
   * pages: from Cozy.layout.layoutBook; meta: { title, author, subject, keywords, createdAt, fileId }
   * onProgress(fraction)
   */
  async function build(pages, meta, onProgress) {
    var JsPDF = jsPDFCtor();
    var doc = new JsPDF({ unit: 'pt', format: [432, 648], orientation: 'portrait', compress: true, putOnlyUsedFonts: true });
    var data = root.COZY_FONT_DATA;
    Object.keys(INFO).forEach(function (key) {
      var file = data[key].file;
      doc.addFileToVFS(file, data[key].data);
      doc.addFont(file, INFO[key].pdf, 'normal');
    });
    doc.setDocumentProperties({
      title: meta.title, author: meta.author, subject: meta.subject || '',
      keywords: meta.keywords || '', creator: 'Cozy Mystery Word Search Book Maker'
    });
    if (meta.createdAt) doc.setCreationDate(new Date(meta.createdAt));
    if (meta.fileId) doc.setFileId(meta.fileId);
    doc.setDrawColor(0); doc.setFillColor(0); doc.setTextColor(0);
    doc.setLineCap('round'); doc.setLineJoin('round');
    var current = {};
    for (var i = 0; i < pages.length; i++) {
      if (i > 0) { doc.addPage([432, 648], 'portrait'); current = {}; }
      doc.setDrawColor(0); doc.setFillColor(0); doc.setTextColor(0);
      drawPage(doc, pages[i], current);
      if (onProgress && i % 4 === 3) { onProgress((i + 1) / pages.length * 0.9); await tick(); }
    }
    if (onProgress) { onProgress(0.95); await tick(); }
    var buf = doc.output('arraybuffer');
    if (onProgress) onProgress(1);
    return buf;
  }

  Cozy.pdf = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
