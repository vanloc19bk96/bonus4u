'use strict';

const { PT, MIN_LINE_PT } = require('./constants');
const { contentBox } = require('./layout');
const { wrapClueLines } = require('./render-preview');

function getJsPDF() {
  if (typeof jspdf !== 'undefined' && jspdf.jsPDF) return jspdf.jsPDF;
  if (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) {
    return window.jspdf.jsPDF;
  }
  throw new Error('jsPDF not loaded');
}

function registerFonts(doc) {
  const regular =
    typeof FONT_REGULAR_B64 !== 'undefined' ? FONT_REGULAR_B64 : null;
  const bold = typeof FONT_BOLD_B64 !== 'undefined' ? FONT_BOLD_B64 : null;
  if (!regular || !bold) throw new Error('Embedded fonts missing');
  // Source Sans — clean, highly legible sans for KDP large-print puzzle books
  doc.addFileToVFS('SourceSans.ttf', regular);
  doc.addFont('SourceSans.ttf', 'SourceSans', 'normal');
  doc.addFileToVFS('SourceSans-Bold.ttf', bold);
  doc.addFont('SourceSans-Bold.ttf', 'SourceSans', 'bold');
  doc.setFont('SourceSans', 'normal');
}

function drawGrid(doc, result, x, y, cellPt, showLetters, filledBlocks) {
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(0, 0, 0);
  doc.setLineWidth(MIN_LINE_PT);

  for (let r = 0; r < result.rows; r++) {
    for (let c = 0; c < result.cols; c++) {
      const ch = result.grid[r][c];
      const cx = x + c * cellPt;
      const cy = y + r * cellPt;
      if (ch == null) {
        if (filledBlocks) {
          doc.rect(cx, cy, cellPt, cellPt, 'F');
        }
        continue;
      }
      doc.setFillColor(255, 255, 255);
      doc.rect(cx, cy, cellPt, cellPt, 'FD');
      doc.setFillColor(0, 0, 0);

      const key = `${r},${c}`;
      const num =
        result.starts instanceof Map
          ? result.starts.get(key)
          : result.starts && result.starts[key];
      if (num) {
        const numSize = Math.max(6, cellPt * 0.22);
        doc.setFont('SourceSans', 'normal');
        doc.setFontSize(numSize);
        doc.text(String(num), cx + 1.5, cy + numSize + 0.5);
      }
      if (showLetters) {
        const letterSize = Math.max(8, cellPt * 0.45);
        doc.setFont('SourceSans', 'bold');
        doc.setFontSize(letterSize);
        doc.text(ch, cx + cellPt / 2, cy + cellPt * 0.68, {
          align: 'center',
        });
      }
    }
  }
}

function drawClues(doc, result, x, y, w, columns, fontSize) {
  const lineH = fontSize * 1.35;
  let yCursor = y;

  doc.setFont('SourceSans', 'bold');
  doc.setFontSize(fontSize + 1);

  if (columns === 2) {
    const gap = 14;
    const colW = (w - gap) / 2;
    const midA = x + colW / 2;
    const midD = x + colW + gap + colW / 2;
    const maxChars = Math.max(12, Math.floor(colW / (fontSize * 0.48)));
    doc.text('ACROSS', midA, yCursor + fontSize, { align: 'center' });
    doc.text('DOWN', midD, yCursor + fontSize, { align: 'center' });
    yCursor += lineH + 4;

    doc.setFont('SourceSans', 'normal');
    doc.setFontSize(fontSize);
    let yA = yCursor;
    let yD = yCursor;
    for (const c of result.across || []) {
      for (const line of wrapClueLines(c.clue, c.number, maxChars)) {
        doc.text(line, midA, yA + fontSize, { align: 'center' });
        yA += lineH;
      }
    }
    for (const c of result.down || []) {
      for (const line of wrapClueLines(c.clue, c.number, maxChars)) {
        doc.text(line, midD, yD + fontSize, { align: 'center' });
        yD += lineH;
      }
    }
    return Math.max(yA, yD);
  }

  const mid = x + w / 2;
  const maxChars = Math.max(12, Math.floor(w / (fontSize * 0.48)));
  doc.text('ACROSS', mid, yCursor + fontSize, { align: 'center' });
  yCursor += lineH + 2;
  doc.setFont('SourceSans', 'normal');
  doc.setFontSize(fontSize);
  for (const c of result.across || []) {
    for (const line of wrapClueLines(c.clue, c.number, maxChars)) {
      doc.text(line, mid, yCursor + fontSize, { align: 'center' });
      yCursor += lineH;
    }
  }
  yCursor += 8;
  doc.setFont('SourceSans', 'bold');
  doc.setFontSize(fontSize + 1);
  doc.text('DOWN', mid, yCursor + fontSize, { align: 'center' });
  yCursor += lineH + 2;
  doc.setFont('SourceSans', 'normal');
  doc.setFontSize(fontSize);
  for (const c of result.down || []) {
    for (const line of wrapClueLines(c.clue, c.number, maxChars)) {
      doc.text(line, mid, yCursor + fontSize, { align: 'center' });
      yCursor += lineH;
    }
  }
  return yCursor;
}

function drawPage(doc, page, pageIndex, plan, state) {
  const settings = state.settings;
  const box = contentBox(pageIndex, plan.boxOpts);

  if (page.type === 'blank') {
    // intentionally empty
  } else if (page.type === 'puzzle') {
    const puzzle = state.puzzles[page.puzzleIndex];
    const result = puzzle.result;
    doc.setFont('SourceSans', 'bold');
    doc.setFontSize(18);
    doc.text(page.title, box.x + box.w / 2, box.y + 18, { align: 'center' });

    const cellPt = page.cellSize * PT;
    const gridW = result.cols * cellPt;
    const gridH = result.rows * cellPt;
    const gx = box.x + (box.w - gridW) / 2;
    const gy = box.y + 36;
    drawGrid(doc, result, gx, gy, cellPt, false, settings.filledBlocks);

    if (page.includeClues) {
      drawClues(
        doc,
        result,
        box.x,
        gy + gridH + 16,
        box.w,
        settings.cluesColumns,
        page.clueFont || 12
      );
    }
  } else if (page.type === 'clues') {
    const puzzle = state.puzzles[page.puzzleIndex];
    doc.setFont('SourceSans', 'bold');
    doc.setFontSize(18);
    doc.text(page.title + ' — Clues', box.x + box.w / 2, box.y + 18, {
      align: 'center',
    });
    drawClues(
      doc,
      puzzle.result,
      box.x,
      box.y + 36,
      box.w,
      settings.cluesColumns,
      page.clueFont || 12
    );
  } else if (page.type === 'answers') {
    if (page.isFirstAnswers) {
      doc.setFont('SourceSans', 'bold');
      doc.setFontSize(16);
      doc.text('ANSWERS', box.x + box.w / 2, box.y + 16, { align: 'center' });
    }
    const per = page.perPage || 4;
    const cols = per === 4 ? 2 : 1;
    const rows = per === 1 ? 1 : 2;
    const headerOffset = page.isFirstAnswers ? 28 : 8;
    const cellW = box.w / cols;
    const cellH = (box.h - headerOffset) / rows;

    page.items.forEach((item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const puzzle = state.puzzles[item.puzzleIndex];
      const result = puzzle.result;
      const ox = box.x + col * cellW;
      const oy = box.y + headerOffset + row * cellH;
      doc.setFont('SourceSans', 'bold');
      doc.setFontSize(11);
      doc.text(item.title, ox + cellW / 2, oy + 12, { align: 'center' });
      const pad = 8;
      const maxW = cellW - pad * 2;
      const maxH = cellH - 28;
      const cellPt = Math.min(maxW / result.cols, maxH / result.rows);
      const gw = result.cols * cellPt;
      const gx = ox + (cellW - gw) / 2;
      const gy = oy + 18;
      drawGrid(doc, result, gx, gy, cellPt, true, settings.filledBlocks);
    });
  }

  if (settings.pageNumbers) {
    doc.setFont('SourceSans', 'normal');
    doc.setFontSize(10);
    const pageNumY = box.pageNumY != null ? box.pageNumY : plan.pageNumY;
    doc.text(String(pageIndex), plan.pageW / 2, pageNumY, {
      align: 'center',
    });
  }
}

function exportPdf(state, plan) {
  const jsPDF = getJsPDF();
  const doc = new jsPDF({
    unit: 'pt',
    format: [plan.pageW, plan.pageH],
    orientation: 'portrait',
    compress: true,
  });
  registerFonts(doc);
  doc.setProperties({
    title: state.settings.bookTitle || 'crossword-interior',
    creator: '',
  });

  for (let i = 0; i < plan.pages.length; i++) {
    if (i > 0) doc.addPage([plan.pageW, plan.pageH], 'portrait');
    drawPage(doc, plan.pages[i], i + 1, plan, state);
  }

  const name = `${(state.settings.bookTitle || 'crossword').replace(/[^\w\-]+/g, '_')}-interior.pdf`;
  doc.save(name);
  return { pageCount: plan.pages.length, name };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { exportPdf, registerFonts, drawGrid };
}
