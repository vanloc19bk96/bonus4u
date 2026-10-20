/*
 * pdf.js: renders layout.js pages with jsPDF. Same commands as the SVG preview.
 * Units: inches. Fonts: Atkinson Hyperlegible TTF, embedded. Colors: DeviceGray only.
 */
(function () {
  'use strict';
  window.SS = window.SS || {};
  // Distinct names per weight so each embedded font has its own BaseFont (clean pdffonts output).
  var FONT = { normal: 'AtkinsonHyperlegible-Regular', bold: 'AtkinsonHyperlegible-Bold' };
  var PAGES_PER_TICK = 8;

  function jsPDFCtor() {
    var ns = (typeof window !== 'undefined' && window.jspdf) || null;
    if (!ns || !ns.jsPDF) throw new Error('jsPDF is missing (lib/jspdf.umd.min.js did not load).');
    return ns.jsPDF;
  }

  function registerFonts(doc) {
    var f = SS.FONT_FILES;
    doc.addFileToVFS(f.regular.file, f.regular.base64);
    doc.addFont(f.regular.file, FONT.normal, 'normal');
    doc.addFileToVFS(f.bold.file, f.bold.base64);
    doc.addFont(f.bold.file, FONT.bold, 'normal');
    doc.setFont(FONT.normal, 'normal');
  }

  function g255(v) { return Math.round(v * 255); }

  function drawPage(doc, page) {
    // Only emit state changes, which keeps the content streams small.
    var st = { lw: -1, cap: '', draw: -1, fill: -1, text: -1, font: '', size: -1 };
    page.commands.forEach(function (c) {
      if (c.t === 'rect') {
        var f = g255(c.fill);
        if (st.fill !== f) { doc.setFillColor(f); st.fill = f; }
        doc.rect(c.x, c.y, c.w, c.h, 'F');
      } else if (c.t === 'line') {
        if (st.lw !== c.w) { doc.setLineWidth(c.w / 72); st.lw = c.w; }
        if (st.cap !== c.cap) { doc.setLineCap(c.cap); st.cap = c.cap; }
        var d = g255(c.gray);
        if (st.draw !== d) { doc.setDrawColor(d); st.draw = d; }
        doc.line(c.x1, c.y1, c.x2, c.y2);
      } else if (c.t === 'text') {
        var style = c.bold ? 'bold' : 'normal';
        if (st.font !== style) { doc.setFont(FONT[style], 'normal'); st.font = style; }
        if (st.size !== c.size) { doc.setFontSize(c.size); st.size = c.size; }
        var tg = g255(c.gray);
        if (st.text !== tg) { doc.setTextColor(tg); st.text = tg; }
        doc.text(c.text, c.x, c.y, { align: c.align, baseline: 'alphabetic' });
        st.fill = -1; // PDF text color IS the fill color ('g'), so the next rect must set it again

      }
    });
  }

  function fileName(book) {
    var s = book.settings;
    return 'samurai-sudoku_' + book.trim.key + '_' + book.puzzleCount + '-puzzles_' + s.difficulty + '.pdf';
  }

  // Stable 32-hex file ID from the book content, so the same seed + settings give the same PDF.
  function fileId(book) {
    var E = SS.engine, key = JSON.stringify(book.settings) + '|' + book.fingerprint;
    var hex = '';
    for (var i = 0; i < 4; i++) hex += ('00000000' + E.hashString(i + ':' + key).toString(16)).slice(-8);
    return hex.toUpperCase();
  }

  function createDoc(book) {
    var JsPDF = jsPDFCtor(), size = book.pageSize;
    var orientation = size.w > size.h ? 'landscape' : 'portrait';
    var doc = new JsPDF({ unit: 'in', format: [size.w, size.h], orientation: orientation, compress: true, putOnlyUsedFonts: true });
    registerFonts(doc);
    doc.setProperties({ title: 'Samurai Sudoku', creator: 'Samurai Sudoku Prints', subject: 'Samurai Sudoku puzzle book interior' });
    if (doc.setFileId) doc.setFileId(fileId(book));
    doc.setLineJoin('miter');
    return { doc: doc, orientation: orientation };
  }

  // Renders every page in small async chunks so the UI keeps painting the progress bar.
  function exportBook(book, hooks) {
    hooks = hooks || {};
    return new Promise(function (resolve, reject) {
      var made, i = 0, total = book.pageCount;
      try { made = createDoc(book); } catch (e) { reject(e); return; }
      function step() {
        if (hooks.isCancelled && hooks.isCancelled()) { reject(new Error('cancelled')); return; }
        try {
          var end = Math.min(total, i + PAGES_PER_TICK);
          for (; i < end; i++) {
            if (i > 0) made.doc.addPage([book.pageSize.w, book.pageSize.h], made.orientation);
            drawPage(made.doc, book.renderPage(i));
          }
          if (hooks.onProgress) hooks.onProgress(i, total);
          if (i < total) { setTimeout(step, 0); return; }
          resolve({ doc: made.doc, fileName: fileName(book) });
        } catch (e) { reject(e); }
      }
      step();
    });
  }

  SS.Pdf = { FONT: FONT, exportBook: exportBook, fileName: fileName };
})();
