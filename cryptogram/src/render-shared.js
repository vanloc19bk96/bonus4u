'use strict';

const { IN, DIVIDER_GAP_IN, LETTERS, printTypeScale } = require('./constants');
const { contentBoxPt, insetContentBox } = require('./geometry');

function typeScaleFor(cfg) {
  return printTypeScale(cfg.format.trim, !!cfg.format.largePrint);
}

function proseMeasure(box, scale) {
  return Math.min(box.w, scale.measureIn * IN);
}

function pageMeta(book, pageIndex1) {
  const page = book.pages[pageIndex1 - 1];
  const box = contentBoxPt(pageIndex1, book.geometry);
  return { page, box };
}

/**
 * Abstract draw API: ctx must implement text, line, rect, setFont, setFill, setStroke, measure.
 * Units: points.
 */
function drawPuzzleBlock(api, puzzle, x, y, w, h, opts) {
  const layout = puzzle.layout;
  const cellPt = puzzle.cellPt;
  // Fit stored layout into the live content width (never spill past right margin)
  let cellW = layout.cellW;
  let wordGap = layout.wordGap;
  let maxRowW = 0;
  for (const row of layout.rows) {
    let rw = 0;
    for (const tok of row) {
      if (tok.kind === 'space') rw += wordGap;
      else rw += cellW;
    }
    if (rw > maxRowW) maxRowW = rw;
  }
  if (maxRowW > w && maxRowW > 0) {
    const scale = w / maxRowW;
    cellW *= scale;
    wordGap *= scale;
  }
  let cy = y;

  api.setFont('sans', 'bold', 11);
  api.setFill('#000000');
  api.text(`PUZZLE ${puzzle.n}`, x, cy + 11);
  cy += 20;

  const revealMap = {};
  if (puzzle.revealed && puzzle.revealedPlain) {
    for (let i = 0; i < puzzle.revealed.length; i++) {
      revealMap[String(puzzle.revealed[i])] = puzzle.revealedPlain[i];
    }
  }

  // Extra gap so cipher descenders (Q, J, …) clear the answer / underline
  const lineH = cellPt * 2.95;
  const cipherSize = puzzle.numeric ? cellPt * 0.72 : cellPt;
  for (const row of layout.rows) {
    let cx = x;
    for (const tok of row) {
      if (tok.kind === 'space') {
        cx += wordGap;
        continue;
      }
      const isLetter = tok.kind === 'letter';
      api.setFont('mono', 'normal', isLetter ? cipherSize : cellPt);
      api.setFill('#000000');
      api.text(String(tok.cipher), cx + cellW / 2, cy + cellPt * 0.85, { align: 'center' });
      if (isLetter) {
        api.setStroke('#000000', Math.max(0.5, 0.75));
        api.line(cx + 1, cy + cellPt * 2.05, cx + cellW - 1, cy + cellPt * 2.05);
        const revealedPlain = revealMap[String(tok.cipher)];
        if (revealedPlain) {
          api.setFont('sans', 'normal', cellPt * 0.75);
          api.text(revealedPlain, cx + cellW / 2, cy + cellPt * 1.95, { align: 'center' });
        }
      }
      cx += cellW;
    }
    cy += lineH;
  }

  if (opts.showHint && puzzle.hintLine) {
    cy += 4;
    api.setFont('sans', 'normal', 9);
    api.text(puzzle.hintLine, x, cy + 10);
    cy += 16;
  }

  if (opts.showWorksheet && puzzle.difficulty === 'easy') {
    cy += 4;
    drawMiniWorksheet(api, x, cy, w);
    cy += 34;
  }

  return cy - y;
}

function drawMiniWorksheet(api, x, y, w) {
  const cell = Math.min(14, w / 14);
  api.setFont('sans', 'normal', 8);
  api.setStroke('#000000', 0.5);
  for (let i = 0; i < 26; i++) {
    const col = i % 13;
    const row = (i / 13) | 0;
    const cx = x + col * (cell + 2);
    const cy = y + row * (cell + 4);
    api.text(LETTERS[i], cx + 2, cy + 8);
    api.line(cx + 10, cy + 9, cx + cell + 2, cy + 9);
  }
}

function drawPageContent(api, book, pageIndex1, overlays) {
  const { page, box } = pageMeta(book, pageIndex1);
  const cfg = book.config;
  // Soft pad inside margin/safe box — breathing room, not flush to the line
  const draw = insetContentBox(box);

  api.setFill('#ffffff');
  api.rect(0, 0, box.pageW, box.pageH, true);

  // Clip to full content box; type lives in the padded draw box
  if (api.clipRect) api.clipRect(box.x, box.y, box.w, box.h);

  switch (page.kind) {
    case 'title':
      drawTitle(api, draw, page.payload);
      break;
    case 'copyright':
      drawCopyright(api, draw, page.payload, cfg);
      break;
    case 'dedication':
      api.setFont('sans', 'normal', 12);
      api.setFill('#000000');
      api.text('Dedication', draw.x + draw.w / 2, draw.y + draw.h * 0.4, { align: 'center' });
      break;
    case 'howto':
      drawHowto(api, draw, page.payload, cfg);
      break;
    case 'worksheet':
      drawWorksheet(api, draw, cfg);
      break;
    case 'puzzle':
      drawPuzzlePage(api, draw, page.payload, cfg);
      break;
    case 'solution':
      drawSolutions(api, draw, page.payload);
      break;
    case 'notes':
      drawNotes(api, draw, cfg);
      break;
    case 'blank':
    default:
      break;
  }

  // Folio inside padded box (still inside KDP margins)
  if (cfg.layout.showPageNumbers && page.kind !== 'blank' && page.kind !== 'title') {
    api.setFont('sans', 'normal', 9);
    api.setFill('#000000');
    api.text(String(pageIndex1), draw.x + draw.w / 2, draw.y + draw.h - 4, {
      align: 'center',
    });
  }

  if (api.clearClip) api.clearClip();

  if (overlays) {
    // Margin lines = inner edges of KDP margins (content / safe box)
    if (overlays.showMargins) {
      api.setStroke('#666666', 0.5, [4, 3]);
      api.rect(box.x, box.y, box.w, box.h, false);
      api.setStroke('#000000', 0.5, null);
    }
    // Safe / trim: page trim edge; with bleed, also show bleed extent
    if (overlays.showSafe) {
      const bleed = book.config.format.bleed ? 0.125 * IN : 0;
      api.setStroke('#999999', 0.5, [1, 2]);
      if (bleed > 0) {
        api.rect(bleed, bleed, box.pageW - bleed - bleed, box.pageH - bleed * 2, false);
        api.setStroke('#bbbbbb', 0.5, [6, 3]);
        api.rect(0.5, 0.5, box.pageW - 1, box.pageH - 1, false);
      } else {
        api.rect(0.5, 0.5, box.pageW - 1, box.pageH - 1, false);
        api.setStroke('#666666', 0.5, [4, 3]);
        api.rect(box.x, box.y, box.w, box.h, false);
      }
      api.setStroke('#000000', 0.5, null);
    }
  }
}

function drawTitle(api, box, p) {
  api.setFill('#000000');
  api.setFont('sans', 'bold', 26);
  api.text(p.title || 'Cryptogram Puzzles', box.x + box.w / 2, box.y + box.h * 0.35, {
    align: 'center',
    maxWidth: box.w * 0.9,
  });
  if (p.subtitle) {
    api.setFont('sans', 'normal', 13);
    api.text(p.subtitle, box.x + box.w / 2, box.y + box.h * 0.35 + 32, {
      align: 'center',
      maxWidth: box.w * 0.85,
    });
  }
  if (p.volume) {
    api.setFont('sans', 'normal', 12);
    api.text('Volume ' + p.volume, box.x + box.w / 2, box.y + box.h * 0.35 + 56, {
      align: 'center',
    });
  }
  if (p.author) {
    api.setFont('sans', 'normal', 12);
    api.text(p.author, box.x + box.w / 2, box.y + box.h * 0.72, { align: 'center' });
  }
}

function drawCopyright(api, box, p, cfg) {
  const scale = typeScaleFor(cfg);
  const textW = proseMeasure(box, scale);
  api.setFill('#000000');
  api.setFont('sans', 'normal', scale.body);
  const lines = [
    `© ${p.year || ''} ${p.publisher || p.author || 'Author'}. All rights reserved.`,
    '',
    'No part of this publication may be reproduced, distributed, or transmitted',
    'in any form without prior written permission, except for brief quotations',
    'in critical reviews and certain other noncommercial uses permitted by law.',
  ];
  if (p.isbn) lines.push('', 'ISBN: ' + p.isbn);
  let y = box.y + box.h * 0.35;
  for (const line of lines) {
    api.text(line, box.x + box.w / 2, y, { align: 'center', maxWidth: textW });
    y += scale.bodyLead;
  }
}

function drawHowto(api, box, p, cfg) {
  const scale = typeScaleFor(cfg);
  const textW = proseMeasure(box, scale);
  api.setFill('#000000');
  api.setFont('sans', 'bold', scale.sectionTitle);
  api.text('How to Solve a Cryptogram', box.x, box.y + scale.sectionTitle);
  api.setFont('sans', 'normal', scale.body);
  let y = box.y + scale.sectionTitle + scale.paraGap + 4;
  const paras = [
    'A cryptogram is a short quotation written in a simple letter-substitution cipher. Each letter of the alphabet is replaced by a different letter (or number) throughout the puzzle.',
    'Start with one-letter words (A or I), common short words (THE, AND, OF), and letter frequency. In English, E, T, A, O, I, N are among the most common letters.',
    'Write guesses lightly in pencil. When a letter seems certain, fill every occurrence of its cipher symbol.',
  ];
  for (const para of paras) {
    y = wrapText(api, para, box.x, y, textW, scale.bodyLead) + scale.paraGap;
  }
}

function drawWorksheet(api, box, cfg) {
  const scale = typeScaleFor(cfg);
  api.setFill('#000000');
  api.setFont('sans', 'bold', scale.sectionTitle);
  api.text('Cipher Worksheet', box.x, box.y + scale.sectionTitle);
  api.setFont('sans', 'normal', scale.caption);
  api.text('Photocopy this page as needed.', box.x, box.y + scale.sectionTitle + scale.paraGap);
  const cols = 2;
  const rows = 13;
  const headerH = scale.sectionTitle + scale.paraGap + scale.caption + 12;
  const cellW = box.w / cols - 8;
  const cellH = (box.h - headerH) / rows;
  const letterSize = Math.min(scale.body + 1, Math.max(11, cellH * 0.45));
  api.setStroke('#000000', 0.75);
  for (let i = 0; i < 26; i++) {
    const col = (i / rows) | 0;
    const row = i % rows;
    const x = box.x + col * (cellW + 16);
    const y = box.y + headerH + row * cellH;
    const baseline = y + Math.min(letterSize + 2, cellH * 0.55);
    api.setFont('sans', 'bold', letterSize);
    api.text(LETTERS[i], x, baseline);
    api.text('=', x + letterSize + 6, baseline);
    api.line(x + letterSize + 18, baseline, x + cellW - 4, baseline);
  }
}

function drawNotes(api, box, cfg) {
  const scale = typeScaleFor(cfg);
  const folioPad = cfg.layout.showPageNumbers ? 14 : 0;
  api.setFill('#000000');
  api.setFont('sans', 'bold', scale.sectionTitle);
  api.text('Notes', box.x, box.y + scale.sectionTitle);
  api.setFont('sans', 'normal', scale.caption);
  api.text('Use this page for working out substitutions.', box.x, box.y + scale.sectionTitle + scale.paraGap);
  const top = box.y + scale.sectionTitle + scale.paraGap + scale.caption + 14;
  const bottom = box.y + box.h - folioPad - 4;
  const lineGap = Math.max(18, scale.bodyLead + 4);
  api.setStroke('#000000', 0.75);
  for (let y = top; y <= bottom; y += lineGap) {
    api.line(box.x, y, box.x + box.w, y);
  }
}

function drawPuzzlePage(api, box, payload, cfg) {
  const list = payload.puzzles || [];
  if (!list.length) return;
  const folioPad = cfg.layout.showPageNumbers ? 14 : 0;
  const contentH = box.h - folioPad;
  const n = list.length;
  const gap = DIVIDER_GAP_IN * IN;
  const slotH = (contentH - (n - 1) * gap) / n;
  const aidOpts = { showHint: false, showWorksheet: false };
  for (let i = 0; i < n; i++) {
    const y = box.y + i * (slotH + gap);
    drawPuzzleBlock(api, list[i], box.x, y, box.w, slotH, aidOpts);
    if (i < n - 1) {
      api.setStroke('#000000', 0.5);
      api.line(box.x, y + slotH + gap / 2, box.x + box.w, y + slotH + gap / 2);
    }
  }
}

function countWrapLines(api, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let line = '';
  let lines = 0;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (api.measure(test) > maxW && line) {
      lines += 1;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines += 1;
  return Math.max(1, lines);
}

function drawSolutions(api, box, payload) {
  api.setFill('#000000');
  api.setFont('sans', 'bold', 12);
  api.text('Solutions', box.x + box.w / 2, box.y + 14, { align: 'center' });
  const items = payload.items || [];
  const cols = items.length >= 3 ? 2 : 1;
  const colW = (box.w - (cols - 1) * 12) / cols;
  const perCol = Math.ceil(items.length / cols);
  const numW = 18;
  const bodyLineH = 11;
  for (let c = 0; c < cols; c++) {
    let y = box.y + 30;
    const x = box.x + c * (colW + 12);
    const slice = items.slice(c * perCol, c * perCol + perCol);
    for (const item of slice) {
      const body = item.plain + (item.author ? ' — ' + item.author : '');
      api.setFont('sans', 'normal', 9);
      const bodyH = countWrapLines(api, body, colW - numW) * bodyLineH;
      // Center the ordinal on the quote block (first…last baseline)
      const numBaseline = y + (bodyLineH + bodyH) / 2;
      api.setFont('sans', 'bold', 9);
      api.text(`${item.n}.`, x, numBaseline);
      api.setFont('sans', 'normal', 9);
      const cy = wrapText(api, body, x + numW, y, colW - numW, bodyLineH);
      y = cy + 10;
    }
  }
}

function wrapText(api, text, x, y, maxW, lineH) {
  const words = String(text).split(/\s+/);
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    const tw = api.measure(test);
    if (tw > maxW && line) {
      api.text(line, x, cy + lineH);
      cy += lineH;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    api.text(line, x, cy + lineH);
    cy += lineH;
  }
  return cy;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    drawPageContent,
    pageMeta,
  };
}
