/*
 * pdf.js: draws layout.js pages with jsPDF. Same commands as the SVG preview.
 *
 * Output rules (KDP): page size = trim size, vector only, every font embedded (TTF subsets),
 * DeviceGray only, no transparency, no bookmarks, annotations or document metadata.
 */
(function () {
  'use strict';
  window.KS = window.KS || {};
  var FONT_NAMES = {
    serif: 'SourceSerif4-Regular',
    serifBold: 'SourceSerif4-Bold',
    sans: 'SourceSans3-Regular',
    sansBold: 'SourceSans3-Bold'
  };
  var PAGES_PER_SLICE = 6;

  function JsPDF() {
    var ns = window.jspdf;
    if (!ns || !ns.jsPDF) throw new Error('The PDF library did not load (js/vendor/jspdf.umd.min.js).');
    return ns.jsPDF;
  }

  function gray(ink) { return Math.round((1 - ink) * 255); }

  function createDoc(book) {
    var Ctor = JsPDF(), doc = new Ctor({
      unit: 'in', format: [book.trim.w, book.trim.h], orientation: 'portrait', compress: true, putOnlyUsedFonts: true
    });
    Object.keys(FONT_NAMES).forEach(function (face) {
      var f = KS.FONT_FILES[face];
      doc.addFileToVFS(f.file, f.base64);
      doc.addFont(f.file, FONT_NAMES[face], 'normal');
    });
    doc.setFont(FONT_NAMES.sans, 'normal');
    doc.setLineJoin('miter');
    if (doc.setFileId) doc.setFileId(fileId(book));
    return doc;
  }

  // Emits only state changes so the content streams stay small.
  function drawPage(doc, page) {
    var st = { lw: -1, cap: '', stroke: -1, fill: -1, font: '', size: -1, dash: '' };
    function lineState(c) {
      if (st.lw !== c.w) { doc.setLineWidth(c.w / 72); st.lw = c.w; }
      var g = gray(c.ink);
      if (st.stroke !== g) { doc.setDrawColor(g); st.stroke = g; }
      var dash = c.dash ? c.dash.join(',') : '';
      if (st.dash !== dash) { doc.setLineDashPattern(c.dash || [], 0); st.dash = dash; }
    }
    page.commands.forEach(function (c) {
      if (c.preview) return;
      if (c.t === 'line') {
        lineState(c);
        var cap = c.cap || 'butt';
        if (st.cap !== cap) { doc.setLineCap(cap); st.cap = cap; }
        doc.line(c.x1, c.y1, c.x2, c.y2);
      } else if (c.t === 'path') {
        lineState(c);
        doc.moveTo(c.pts[0], c.pts[1]);
        for (var i = 2; i < c.pts.length; i += 2) doc.lineTo(c.pts[i], c.pts[i + 1]);
        if (c.closed) doc.close();
        doc.stroke();
      } else if (c.t === 'rect') {
        var f = gray(c.fill);
        if (st.fill !== f) { doc.setFillColor(f); st.fill = f; }
        doc.rect(c.x, c.y, c.w, c.h, 'F');
      } else if (c.t === 'disc') {
        var df = gray(c.fill);
        if (st.fill !== df) { doc.setFillColor(df); st.fill = df; }
        doc.circle(c.cx, c.cy, c.r, 'F');
      } else if (c.t === 'text') {
        var name = FONT_NAMES[c.face];
        if (st.font !== name) { doc.setFont(name, 'normal'); st.font = name; }
        if (st.size !== c.size) { doc.setFontSize(c.size); st.size = c.size; }
        doc.setTextColor(gray(c.ink));
        doc.text(c.text, c.x, c.y, { baseline: 'alphabetic' });
        st.fill = -1; // text colour is the fill colour in PDF, so the next rect must set it
      }
    });
  }

  // KDP asks for no document metadata. jsPDF always writes /Producer and /CreationDate in
  // the Info dictionary and an /OpenAction in the catalog; blank them with spaces of the
  // same length so every byte offset in the cross-reference table stays valid.
  function stripMetadata(bytes) {
    // jsPDF writes the Info and Catalog objects just before the xref table, whose offset
    // the file's last line ("startxref N") gives.
    var end = '';
    for (var j = Math.max(0, bytes.length - 64); j < bytes.length; j++) end += String.fromCharCode(bytes[j]);
    var m0 = /startxref\s+(\d+)/.exec(end), xref = m0 ? +m0[1] : bytes.length;
    var text = '', tailStart = Math.max(0, xref - 4096);
    for (var i = tailStart; i < xref; i++) text += String.fromCharCode(bytes[i]);
    [/\/Producer \((?:[^()\\]|\\.)*\)/, /\/CreationDate \((?:[^()\\]|\\.)*\)/, /\/OpenAction \[[^\]]*\]/].forEach(function (re) {
      var m = re.exec(text);
      if (!m) return;
      for (var k = 0; k < m[0].length; k++) bytes[tailStart + m.index + k] = 0x20;
    });
    return bytes;
  }

  // Same book, same file ID, so the same seed and settings give the same PDF.
  function fileId(book) {
    var key = JSON.stringify(book.settings) + '|' + book.puzzles.map(function (p) { return p ? p.key : ''; }).join(';');
    var h = KS.engine.hashString(key), hex = '';
    for (var i = 0; i < 4; i++) hex += ('00000000' + h[i].toString(16)).slice(-8);
    return hex.toUpperCase();
  }

  function fileName(book) {
    var slug = (book.text.title || 'book').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'book';
    return slug + '-interior-' + book.trim.key + '-' + book.pageCount + 'p.pdf';
  }

  // Renders the book in slices so the page keeps painting progress. Every page is checked
  // as it is drawn; a page that would break a KDP rule stops the export.
  // hooks: { onProgress(done, total), isCancelled() }
  function exportBook(book, hooks) {
    hooks = hooks || {};
    return new Promise(function (resolve, reject) {
      var doc, i = 0, total = book.pageCount;
      try { doc = createDoc(book); } catch (e) { reject(e); return; }
      function slice() {
        if (hooks.isCancelled && hooks.isCancelled()) { reject(new Error('cancelled')); return; }
        try {
          var end = Math.min(total, i + PAGES_PER_SLICE);
          for (; i < end; i++) {
            var page = book.renderPage(i);
            var scan = KS.Checks.scanPage(page);
            if (scan.outside || scan.smallFont || scan.thinLine || scan.lightInk) {
              throw new Error('Page ' + page.number + ' does not meet KDP rules, so the PDF was not created.');
            }
            if (i > 0) doc.addPage([book.trim.w, book.trim.h], 'portrait');
            drawPage(doc, page);
          }
          if (hooks.onProgress) hooks.onProgress(i, total);
          if (i < total) { setTimeout(slice, 0); return; }
          setTimeout(function () {
            try {
              var bytes = stripMetadata(new Uint8Array(doc.output('arraybuffer')));
              resolve({ bytes: bytes, fileName: fileName(book), pageCount: total });
            } catch (e) { reject(e); }
          }, 0);
        } catch (e) { reject(e); }
      }
      slice();
    });
  }

  KS.Pdf = { FONT_NAMES: FONT_NAMES, exportBook: exportBook, fileName: fileName, stripMetadata: stripMetadata };
})();
