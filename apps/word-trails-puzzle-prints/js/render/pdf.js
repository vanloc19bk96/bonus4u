/*
 * PDF export with jsPDF: real text with embedded fonts (TrueType subsets), vector shapes, one page
 * per laid-out page at the exact trim size. The interior is gray only; the cover is in color.
 * No links, forms, bookmarks or transparency, and the document metadata is blanked (KDP asks for
 * none). The file ID comes from the project, so the same project gives the same file.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var INFO = CX.metrics.FONT_INFO;

  function jsPDFCtor() {
    var j = root.jspdf && root.jspdf.jsPDF;
    if (!j) throw new Error('The PDF tool did not load (js/vendor/jspdf.umd.min.js).');
    return j;
  }

  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function level(ink) { return Math.round(255 * (1 - (ink == null ? 1 : ink))); }

  function setup(doc) {
    var data = root.CX_FONT_DATA;
    Object.keys(INFO).forEach(function (key) {
      doc.addFileToVFS(data[key].file, data[key].data);
      doc.addFont(data[key].file, INFO[key].pdf, 'normal');
    });
    doc.setLineCap('butt'); doc.setLineJoin('miter');
  }

  // Draws one page; only state changes are written to the content stream.
  function drawPage(doc, page) {
    var st = { font: '', size: -1, text: null, draw: null, fill: null, lw: -1, dash: '', cap: 'butt' };
    function color(it) { return it.color || level(it.ink); }
    function draw(c) { if (st.draw !== c) { doc.setDrawColor(c); st.draw = c; } }
    function fill(c) { if (st.fill !== c) { doc.setFillColor(c); st.fill = c; } }
    function width(w) { if (st.lw !== w) { doc.setLineWidth(w); st.lw = w; } }
    function dash(d) { var k = d ? d.join(',') : ''; if (st.dash !== k) { doc.setLineDashPattern(d || [], 0); st.dash = k; } }
    function cap(c) { if (st.cap !== c) { doc.setLineCap(c); st.cap = c; } }
    var items = page.items;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.t === 'text') {
        var name = INFO[it.font].pdf;
        if (st.font !== name) { doc.setFont(name, 'normal'); st.font = name; }
        if (st.size !== it.size) { doc.setFontSize(it.size); st.size = it.size; }
        var tc = color(it);
        if (st.text !== tc) { doc.setTextColor(tc); st.text = tc; }
        var o = { baseline: 'alphabetic' };
        if (it.ls) o.charSpace = it.ls;
        if (it.angle) o.angle = it.angle;
        if (it.hs) o.horizontalScale = it.hs;
        doc.text(it.str, it.x, it.y, o);
        st.fill = null; // text paints with the fill color, so the next filled shape sets its own again
      } else if (it.t === 'line') {
        draw(color(it)); width(it.w); dash(it.dash); cap(it.cap ? 'round' : 'butt');
        doc.line(it.x1, it.y1, it.x2, it.y2);
      } else if (it.t === 'rect') {
        if (it.mode === 'stroke') { draw(color(it)); width(it.lw); dash(it.dash); doc.rect(it.x, it.y, it.w, it.h, 'S'); }
        else { fill(color(it)); doc.rect(it.x, it.y, it.w, it.h, 'F'); }
      } else if (it.t === 'ellipse') {
        if (it.mode === 'stroke') { draw(color(it)); width(it.lw); dash(null); doc.ellipse(it.cx, it.cy, it.rx, it.ry, 'S'); }
        else { fill(color(it)); doc.ellipse(it.cx, it.cy, it.rx, it.ry, 'F'); }
      } else if (it.t === 'poly') {
        var p = it.pts, d = [];
        for (var k = 2; k < p.length; k += 2) d.push([p[k] - p[k - 2], p[k + 1] - p[k - 1]]);
        if (it.mode === 'stroke') {
          draw(color(it)); width(it.lw); dash(null);
          if (it.round) { cap('round'); doc.setLineJoin('round'); }
          doc.lines(d, p[0], p[1], [1, 1], 'S', !!it.closed);
          if (it.round) doc.setLineJoin('miter');
        } else { fill(color(it)); doc.lines(d, p[0], p[1], [1, 1], 'F', true); }
      }
    }
    if (st.dash) doc.setLineDashPattern([], 0);
    if (st.cap !== 'butt') doc.setLineCap('butt');
  }

  // KDP asks for no document metadata. jsPDF writes /Producer and /CreationDate in the Info
  // dictionary and an /OpenAction in the catalog; blank them with spaces of the same length so
  // every byte offset in the cross-reference table stays valid.
  function stripMetadata(bytes) {
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

  /*
   * The interior. book: from CX.layout.layoutBook; meta: { fileId }; onProgress(fraction).
   * Resolves with a Uint8Array.
   */
  async function build(book, meta, onProgress) {
    var JsPDF = jsPDFCtor();
    var doc = new JsPDF({ unit: 'pt', format: [book.W, book.H], orientation: 'portrait', compress: true, putOnlyUsedFonts: true });
    setup(doc);
    if (meta.fileId && doc.setFileId) doc.setFileId(meta.fileId);
    for (var i = 0; i < book.pages.length; i++) {
      if (i > 0) doc.addPage([book.W, book.H], 'portrait');
      drawPage(doc, book.pages[i]);
      if (onProgress && i % 8 === 7) { onProgress((i + 1) / book.pages.length * 0.9); await tick(); }
    }
    if (onProgress) { onProgress(0.95); await tick(); }
    var bytes = stripMetadata(new Uint8Array(doc.output('arraybuffer')));
    if (onProgress) onProgress(1);
    return bytes;
  }

  // The full-wrap paperback cover as one page at the exact size KDP asks for.
  async function buildCover(cv, meta) {
    var JsPDF = jsPDFCtor();
    var doc = new JsPDF({ unit: 'pt', format: [cv.W, cv.H], orientation: cv.W > cv.H ? 'landscape' : 'portrait', compress: true, putOnlyUsedFonts: true });
    setup(doc);
    if (meta.fileId && doc.setFileId) doc.setFileId(meta.fileId);
    drawPage(doc, cv);
    return stripMetadata(new Uint8Array(doc.output('arraybuffer')));
  }

  CX.pdf = { build: build, buildCover: buildCover, stripMetadata: stripMetadata };
})(typeof window !== 'undefined' ? window : globalThis);
