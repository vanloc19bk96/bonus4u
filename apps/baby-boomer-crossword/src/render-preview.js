'use strict';

const { PT, MIN_LINE_PT } = require('./constants');
const { contentBox } = require('./layout');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapClueLines(clue, number, maxChars) {
  const prefix = `${number}. `;
  const indent = ' '.repeat(prefix.length);
  const words = String(clue).split(/\s+/);
  const lines = [];
  let cur = prefix;
  for (const w of words) {
    if (cur.length + 1 + w.length > maxChars && cur.length > prefix.length) {
      lines.push(cur);
      cur = indent + w;
    } else {
      cur = cur === prefix ? prefix + w : cur + ' ' + w;
    }
  }
  if (cur.trim()) lines.push(cur);
  return lines.length ? lines : [prefix];
}

function renderGridSvg(result, x, y, cellPt, showLetters, filledBlocks) {
  if (!result) return '';
  const parts = [];
  const stroke = MIN_LINE_PT;
  const numSize = Math.max(6, cellPt * 0.22);
  const letterSize = Math.max(8, cellPt * (showLetters ? 0.45 : 0.5));

  for (let r = 0; r < result.rows; r++) {
    for (let c = 0; c < result.cols; c++) {
      const ch = result.grid[r][c];
      if (ch == null) {
        if (filledBlocks) {
          parts.push(
            `<rect x="${x + c * cellPt}" y="${y + r * cellPt}" width="${cellPt}" height="${cellPt}" fill="#000"/>`
          );
        }
        continue;
      }
      const cx = x + c * cellPt;
      const cy = y + r * cellPt;
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${cellPt}" height="${cellPt}" fill="#fff" stroke="#000" stroke-width="${stroke}"/>`
      );
      const key = `${r},${c}`;
      const num =
        result.starts instanceof Map
          ? result.starts.get(key)
          : result.starts && result.starts[key];
      if (num) {
        parts.push(
          `<text x="${cx + 2}" y="${cy + numSize + 1}" font-size="${numSize}" font-family="Source Sans 3, Source Sans, Arial, sans-serif" fill="#000">${num}</text>`
        );
      }
      if (showLetters) {
        parts.push(
          `<text x="${cx + cellPt / 2}" y="${cy + cellPt * 0.72}" text-anchor="middle" font-size="${letterSize}" font-family="Source Sans 3, Source Sans, Arial, sans-serif" font-weight="700" fill="#000">${esc(ch)}</text>`
        );
      }
    }
  }
  return parts.join('');
}

function renderCluesBlock(result, x, y, w, columns, fontSize) {
  if (!result) return { svg: '', height: 0 };
  const lineH = fontSize * 1.35;
  const font = 'Source Sans 3, Source Sans, Arial, sans-serif';
  const parts = [];
  let yCursor = y;

  function centeredText(cx, ty, text, size, bold) {
    const weight = bold ? ' font-weight="700"' : '';
    return `<text x="${cx}" y="${ty}" text-anchor="middle" font-size="${size}"${weight} font-family="${font}">${esc(text)}</text>`;
  }

  if (columns === 2) {
    const gap = 14;
    const colW = (w - gap) / 2;
    const midA = x + colW / 2;
    const midD = x + colW + gap + colW / 2;
    const maxChars = Math.max(12, Math.floor(colW / (fontSize * 0.48)));

    parts.push(centeredText(midA, yCursor + fontSize, 'ACROSS', fontSize + 1, true));
    parts.push(centeredText(midD, yCursor + fontSize, 'DOWN', fontSize + 1, true));
    yCursor += lineH + 4;

    let yA = yCursor;
    let yD = yCursor;
    for (const c of result.across || []) {
      for (const line of wrapClueLines(c.clue, c.number, maxChars)) {
        parts.push(centeredText(midA, yA + fontSize, line, fontSize, false));
        yA += lineH;
      }
    }
    for (const c of result.down || []) {
      for (const line of wrapClueLines(c.clue, c.number, maxChars)) {
        parts.push(centeredText(midD, yD + fontSize, line, fontSize, false));
        yD += lineH;
      }
    }
    return { svg: parts.join(''), height: Math.max(yA, yD) - y };
  }

  // 1 column
  const mid = x + w / 2;
  const maxChars = Math.max(12, Math.floor(w / (fontSize * 0.48)));
  parts.push(centeredText(mid, yCursor + fontSize, 'ACROSS', fontSize + 1, true));
  yCursor += lineH + 2;
  for (const c of result.across || []) {
    for (const line of wrapClueLines(c.clue, c.number, maxChars)) {
      parts.push(centeredText(mid, yCursor + fontSize, line, fontSize, false));
      yCursor += lineH;
    }
  }
  yCursor += 8;
  parts.push(centeredText(mid, yCursor + fontSize, 'DOWN', fontSize + 1, true));
  yCursor += lineH + 2;
  for (const c of result.down || []) {
    for (const line of wrapClueLines(c.clue, c.number, maxChars)) {
      parts.push(centeredText(mid, yCursor + fontSize, line, fontSize, false));
      yCursor += lineH;
    }
  }
  return { svg: parts.join(''), height: yCursor - y };
}

function renderPageSvg(page, pageIndex, plan, state, opts) {
  const settings = state.settings;
  const box = contentBox(pageIndex, plan.boxOpts);
  const { pageW, pageH } = plan;
  const showMargins = opts && opts.showMargins;
  const parts = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageW} ${pageH}" width="100%" style="background:#fff;display:block;">`
  );
  parts.push(
    `<rect x="0" y="0" width="${pageW}" height="${pageH}" fill="#fff"/>`
  );

  if (showMargins) {
    if (settings.bleed) {
      parts.push(
        `<rect x="0" y="0" width="${pageW}" height="${pageH}" fill="#eee"/>`
      );
      const tw = settings.trim.w * PT;
      const th = settings.trim.h * PT;
      const ox = box.isRecto ? 0 : plan.pageW - tw;
      parts.push(
        `<rect x="${ox}" y="${(pageH - th) / 2}" width="${tw}" height="${th}" fill="#fff" stroke="#06c" stroke-width="1" stroke-dasharray="4 3"/>`
      );
    }
    const safe = box.safe || box;
    parts.push(
      `<rect x="${safe.x}" y="${safe.y}" width="${safe.w}" height="${safe.h}" fill="none" stroke="#c00" stroke-width="1" stroke-dasharray="6 4"/>`
    );
  }

  if (page.type === 'blank') {
    // empty
  } else if (page.type === 'puzzle') {
    const puzzle = state.puzzles[page.puzzleIndex];
    const result = puzzle.result;
    const titleSize = 18;
    parts.push(
      `<text x="${box.x + box.w / 2}" y="${box.y + titleSize}" text-anchor="middle" font-size="${titleSize}" font-weight="700" font-family="Source Sans 3, Source Sans, Arial, sans-serif">${esc(page.title)}</text>`
    );
    const cellPt = page.cellSize * PT;
    const gridW = result.cols * cellPt;
    const gridH = result.rows * cellPt;
    const gx = box.x + (box.w - gridW) / 2;
    const gy = box.y + titleSize + 18;
    parts.push(renderGridSvg(result, gx, gy, cellPt, false, settings.filledBlocks));

    if (page.includeClues) {
      const cluesY = gy + gridH + 16;
      const clueFont = page.clueFont || 12;
      const block = renderCluesBlock(
        result,
        box.x,
        cluesY,
        box.w,
        settings.cluesColumns,
        clueFont
      );
      parts.push(block.svg);
    }
  } else if (page.type === 'clues') {
    const puzzle = state.puzzles[page.puzzleIndex];
    parts.push(
      `<text x="${box.x + box.w / 2}" y="${box.y + 18}" text-anchor="middle" font-size="18" font-weight="700" font-family="Source Sans 3, Source Sans, Arial, sans-serif">${esc(page.title)} — Clues</text>`
    );
    const block = renderCluesBlock(
      puzzle.result,
      box.x,
      box.y + 36,
      box.w,
      settings.cluesColumns,
      page.clueFont || 12
    );
    parts.push(block.svg);
  } else if (page.type === 'answers') {
    if (page.isFirstAnswers) {
      parts.push(
        `<text x="${box.x + box.w / 2}" y="${box.y + 16}" text-anchor="middle" font-size="16" font-weight="700" font-family="Source Sans 3, Source Sans, Arial, sans-serif">ANSWERS</text>`
      );
    }
    const per = page.perPage || 4;
    // 1 → 1×1, 2 → 2×1 vertical, 4 → 2×2
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
      parts.push(
        `<text x="${ox + cellW / 2}" y="${oy + 12}" text-anchor="middle" font-size="11" font-weight="700" font-family="Source Sans 3, Source Sans, Arial, sans-serif">${esc(item.title)}</text>`
      );
      const pad = 8;
      const maxW = cellW - pad * 2;
      const maxH = cellH - 28;
      const cellPt = Math.min(maxW / result.cols, maxH / result.rows);
      const gw = result.cols * cellPt;
      const gh = result.rows * cellPt;
      const gx = ox + (cellW - gw) / 2;
      const gy = oy + 18;
      parts.push(renderGridSvg(result, gx, gy, cellPt, true, settings.filledBlocks));
    });
  }

  if (settings.pageNumbers) {
    const pageNumY = box.pageNumY != null ? box.pageNumY : plan.pageNumY;
    parts.push(
      `<text x="${pageW / 2}" y="${pageNumY}" text-anchor="middle" font-size="10" font-family="Source Sans 3, Source Sans, Arial, sans-serif">${pageIndex}</text>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderPageSvg,
    renderGridSvg,
    renderCluesBlock,
    wrapClueLines,
  };
}
