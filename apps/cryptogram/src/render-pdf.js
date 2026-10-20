'use strict';

const { drawPageContent, pageMeta } = require('./render-shared');
const { sanitizeFilename } = require('./layout');
const { renderPageToCanvas } = require('./render-canvas');

const PDF_FONT = 'AtkinsonHyperlegible';

function setupFonts(doc) {
  if (typeof FONT_REGULAR_B64 !== 'undefined') {
    doc.addFileToVFS('AtkinsonHyperlegible-Regular.ttf', FONT_REGULAR_B64);
    doc.addFont('AtkinsonHyperlegible-Regular.ttf', PDF_FONT, 'normal');
  }
  if (typeof FONT_BOLD_B64 !== 'undefined') {
    doc.addFileToVFS('AtkinsonHyperlegible-Bold.ttf', FONT_BOLD_B64);
    doc.addFont('AtkinsonHyperlegible-Bold.ttf', PDF_FONT, 'bold');
  }
  // Cipher cells use fixed-width layout; glyphs are centered in each cell
  doc.setFont(PDF_FONT, 'normal');
}

function makePdfApi(doc) {
  let fontFamily = 'sans';
  let fontWeight = 'normal';
  let fontSize = 12;

  function applyFont() {
    doc.setFont(PDF_FONT, fontWeight === 'bold' ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
  }

  return {
    setFont(family, weight, size) {
      fontFamily = family;
      fontWeight = weight;
      fontSize = size;
      applyFont();
    },
    setFill(color) {
      const n = parseInt(String(color).replace('#', ''), 16);
      if (Number.isFinite(n)) {
        doc.setFillColor((n >> 16) & 255, (n >> 8) & 255, n & 255);
        doc.setTextColor((n >> 16) & 255, (n >> 8) & 255, n & 255);
      } else {
        doc.setFillColor(0);
        doc.setTextColor(0);
      }
    },
    setStroke(color, width, dash) {
      doc.setDrawColor(0);
      doc.setLineWidth(width || 0.75);
      if (doc.setLineDash) {
        try {
          doc.setLineDash(dash || []);
        } catch (e) {
          /* older jsPDF */
        }
      }
    },
    text(str, x, y, opts) {
      applyFont();
      opts = opts || {};
      const o = {};
      if (opts.align) o.align = opts.align;
      if (opts.maxWidth) o.maxWidth = opts.maxWidth;
      doc.text(String(str), x, y, o);
    },
    measure(str) {
      applyFont();
      return doc.getTextWidth(String(str));
    },
    line(x1, y1, x2, y2) {
      doc.line(x1, y1, x2, y2);
      if (doc.setLineDash) {
        try {
          doc.setLineDash([]);
        } catch (e) {
          /* ignore */
        }
      }
    },
    rect(x, y, w, h, fill) {
      if (fill) {
        doc.setFillColor(255);
        doc.rect(x, y, w, h, 'F');
        doc.setFillColor(0);
        doc.setTextColor(0);
      } else {
        doc.rect(x, y, w, h);
      }
    },
    clipRect(x, y, w, h) {
      // jsPDF has no general clip stack; content is laid out inside the box instead.
    },
    clearClip() {},
  };
}

async function exportVectorPdf(book, onProgress, cancelFlag) {
  const { box } = pageMeta(book, 1);
  const jspdf = window.jspdf;
  if (!jspdf || !jspdf.jsPDF) throw new Error('jsPDF not loaded');
  const doc = new jspdf.jsPDF({
    unit: 'pt',
    format: [box.pageW, box.pageH],
    orientation: box.pageW > box.pageH ? 'landscape' : 'portrait',
    compress: true,
    putOnlyUsedFonts: true,
  });
  setupFonts(doc);
  const cfg = book.config;
  doc.setProperties({
    title: cfg.book.title || 'Cryptogram Puzzles',
    author: cfg.book.author || '',
    creator: 'Cryptogram Prints 1.0',
  });

  const api = makePdfApi(doc);
  const n = book.pages.length;
  for (let i = 1; i <= n; i++) {
    if (cancelFlag && cancelFlag.cancelled) return null;
    if (i > 1) doc.addPage([box.pageW, box.pageH]);
    drawPageContent(api, book, i, null);
    if (onProgress && i % 8 === 0) {
      onProgress(i / n, `PDF page ${i}/${n}`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (onProgress) onProgress(1, 'Saving PDF');
  const slug = sanitizeFilename(cfg.book.title);
  const fname = `${slug}_${book.trim.w}x${book.trim.h}_${n}p_interior.pdf`;
  doc.save(fname);
  return fname;
}

async function exportRasterPdf(book, onProgress, cancelFlag) {
  const { box } = pageMeta(book, 1);
  const jspdf = window.jspdf;
  const doc = new jspdf.jsPDF({
    unit: 'pt',
    format: [box.pageW, box.pageH],
    compress: true,
  });
  const n = book.pages.length;
  for (let i = 1; i <= n; i++) {
    if (cancelFlag && cancelFlag.cancelled) return null;
    if (i > 1) doc.addPage([box.pageW, box.pageH]);
    const canvas = renderPageToCanvas(book, i, 300, null);
    const data = canvas.toDataURL('image/jpeg', 0.95);
    doc.addImage(data, 'JPEG', 0, 0, box.pageW, box.pageH);
    if (onProgress && i % 4 === 0) {
      onProgress(i / n, `Raster PDF ${i}/${n}`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const slug = sanitizeFilename(book.config.book.title);
  const fname = `${slug}_${book.trim.w}x${book.trim.h}_${n}p_flat.pdf`;
  doc.save(fname);
  return fname;
}

async function exportQcSheet(book) {
  const jspdf = window.jspdf;
  const pageW = 8.5 * 72;
  const pageH = 11 * 72;
  const doc = new jspdf.jsPDF({ unit: 'pt', format: [pageW, pageH] });
  setupFonts(doc);
  const thumbs = Math.min(book.pages.length, 16);
  const cols = 2;
  const rows = 2;
  const cellW = pageW / cols - 24;
  const cellH = pageH / rows - 24;
  for (let i = 0; i < thumbs; i++) {
    if (i > 0 && i % 4 === 0) doc.addPage();
    const slot = i % 4;
    const col = slot % cols;
    const row = (slot / cols) | 0;
    const canvas = renderPageToCanvas(book, i + 1, 72, null);
    const data = canvas.toDataURL('image/jpeg', 0.85);
    const x = 12 + col * (cellW + 12);
    const y = 12 + row * (cellH + 12);
    doc.addImage(data, 'JPEG', x, y, cellW, cellH);
  }
  doc.save(sanitizeFilename(book.config.book.title) + '_qc-sheet.pdf');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { exportVectorPdf, exportRasterPdf, exportQcSheet, setupFonts };
}
