'use strict';

const {
  PT,
  OUTSIDE_IN,
  TOP_IN,
  BOTTOM_IN,
  BLEED_IN,
  CONTENT_INSET_IN,
  PAGE_NUM_BAND_IN,
  gutterForPageCount,
  pageSizePts,
} = require('./constants');

function puzzleTitle(settings, puzzle, index) {
  const n = index + 1;
  const title = puzzle.title || '';
  return String(settings.puzzleTitleFormat || 'Puzzle {n}')
    .replace(/\{n\}/g, String(n))
    .replace(/\{title\}/g, title || String(n));
}

/**
 * Boxes for a 1-based page index with mirrored margins.
 * - safe: KDP margin boundary (red dashed overlay)
 * - x/y/w/h: drawable content, inset from safe + page-number band
 * - pageNumY: baseline inside safe area (above bottom safe edge)
 */
function contentBox(pageIndex, opts) {
  const { pageW, pageH, gutter, outside, top, bottom, bleed } = opts;
  const isRecto = pageIndex % 2 === 1;
  let left = (isRecto ? gutter : outside) * PT;
  let right = (isRecto ? outside : gutter) * PT;
  let topPt = top * PT;
  let bottomPt = bottom * PT;

  // With bleed: shift content inward from outer/top bleed edges
  if (bleed) {
    const bleedPt = BLEED_IN * PT;
    topPt += bleedPt;
    if (isRecto) {
      right += bleedPt;
    } else {
      left += bleedPt;
    }
  }

  const safe = {
    x: left,
    y: topPt,
    w: pageW - left - right,
    h: pageH - topPt - bottomPt,
  };

  const inset = CONTENT_INSET_IN * PT;
  const pageNumBand = PAGE_NUM_BAND_IN * PT;
  // Page number baseline ~1/3 up from bottom of reserved band (still inside safe)
  const pageNumY = safe.y + safe.h - pageNumBand * 0.35;

  return {
    x: safe.x + inset,
    y: safe.y + inset,
    w: safe.w - inset * 2,
    h: safe.h - inset * 2 - pageNumBand,
    safe,
    pageNumY,
    isRecto,
  };
}

function estimateClueLines(clue, colWidthPt, fontSizePt) {
  // Approximate: average char width ~0.5em for sans
  const avgChar = fontSizePt * 0.5;
  const charsPerLine = Math.max(8, Math.floor(colWidthPt / avgChar));
  const prefix = 4; // "12. "
  const text = String(clue || '');
  const totalChars = prefix + text.length;
  return Math.max(1, Math.ceil(totalChars / charsPerLine));
}

// Match render-preview spacing: title baseline band + gap before grid
const PUZZLE_TITLE_BAND = 36;
const PUZZLE_GAP_AFTER_GRID = 16;
const PUZZLE_CLUE_BOTTOM_PAD = 8;
const MIN_CELL_IN = 0.28;
const MIN_CLUE_FONT = 10;

function cluesHeightForFont(result, settings, box, clueFont) {
  const colCount = settings.cluesColumns === 1 ? 1 : 2;
  const colW = (box.w - (colCount - 1) * 12) / colCount;
  let acrossLines = 1;
  let downLines = 1;
  for (const c of result.across || []) {
    acrossLines += estimateClueLines(c.clue, colW - 8, clueFont);
  }
  for (const c of result.down || []) {
    downLines += estimateClueLines(c.clue, colW - 8, clueFont);
  }
  const lineH = clueFont * 1.35;
  if (colCount === 2) return Math.max(acrossLines, downLines) * lineH;
  return (acrossLines + downLines + 1) * lineH;
}

/**
 * Largest odd grid that fits preferred cellSize inside KDP content/safe width.
 * Uses the wider of recto/verso gutters so every page stays inside margins.
 */
function computeMaxGrid(settings, opts) {
  const pageCount = (opts && opts.pageCount) || 24;
  const gutter =
    opts && opts.gutter != null ? opts.gutter : gutterForPageCount(pageCount);
  const { pageW, pageH } = pageSizePts(settings.trim, settings.bleed);
  const box = contentBox(1, {
    pageW,
    pageH,
    gutter,
    outside: OUTSIDE_IN,
    top: TOP_IN,
    bottom: BOTTOM_IN,
    bleed: !!settings.bleed,
  });
  const cellIn = Math.max(MIN_CELL_IN, Number(settings.cellSize) || 0.45);
  let n = Math.floor(box.w / PT / cellIn);
  if (n % 2 === 0) n -= 1;
  return Math.max(9, Math.min(19, n));
}

function measurePuzzlePage(puzzle, settings, box, cellSizeIn) {
  const result = puzzle.result;
  if (!result) return { fits: false, cellSize: cellSizeIn, mode: 'same', overflow: true };

  const maxCellByWidth = box.w / result.cols / PT;
  const widthReduced = cellSizeIn > maxCellByWidth + 0.001;
  let cell = Math.min(cellSizeIn, maxCellByWidth);
  const preferredFont = cellSizeIn >= 0.45 ? 12 : 11;

  function pack(cellSize) {
    const gridH = result.rows * cellSize * PT;
    const availableClues =
      box.h - PUZZLE_TITLE_BAND - PUZZLE_GAP_AFTER_GRID - gridH - PUZZLE_CLUE_BOTTOM_PAD;
    return { gridH, availableClues };
  }

  const placement = settings.cluesPlacement || 'same';
  if (placement === 'next') {
    const cluesH = cluesHeightForFont(result, settings, box, preferredFont);
    const { gridH } = pack(cell);
    return {
      fits: true,
      cellSize: cell,
      mode: 'next',
      pages: 2,
      overflow: false,
      clueFont: preferredFont,
      gridH,
      cluesH,
      widthReduced,
    };
  }

  // 1) Keep preferred cell; shrink clue font first (large-print cell stays intact)
  for (let font = preferredFont; font >= MIN_CLUE_FONT; font--) {
    const cluesH = cluesHeightForFont(result, settings, box, font);
    const { gridH, availableClues } = pack(cell);
    if (cluesH <= availableClues + 0.01) {
      return {
        fits: true,
        cellSize: cell,
        mode: 'same',
        pages: 1,
        overflow: false,
        clueFont: font,
        gridH,
        cluesH,
        widthReduced,
      };
    }
  }

  // 2) Still tight: shrink cell just enough at the smallest readable clue font
  {
    const clueFont = MIN_CLUE_FONT;
    const cluesH = cluesHeightForFont(result, settings, box, clueFont);
    const maxGridH =
      box.h - PUZZLE_TITLE_BAND - PUZZLE_GAP_AFTER_GRID - PUZZLE_CLUE_BOTTOM_PAD - cluesH;
    if (maxGridH > 0) {
      const cellForClues = maxGridH / result.rows / PT;
      if (cellForClues >= MIN_CELL_IN) {
        cell = Math.min(cell, cellForClues);
        const { gridH } = pack(cell);
        return {
          fits: true,
          cellSize: cell,
          mode: 'same',
          pages: 1,
          overflow: false,
          clueFont,
          gridH,
          cluesH,
          widthReduced,
          cellReducedForClues: cell + 0.001 < Math.min(cellSizeIn, maxCellByWidth),
        };
      }
    }
  }

  // 3) Spill clues to next page; restore preferred (width-capped) cell on grid page
  cell = Math.min(cellSizeIn, maxCellByWidth);
  const clueFont = preferredFont;
  const cluesH = cluesHeightForFont(result, settings, box, clueFont);
  const { gridH, availableClues } = pack(cell);

  if (availableClues > 40) {
    return {
      fits: true,
      cellSize: cell,
      mode: 'next',
      pages: 2,
      overflow: true,
      warning: 'Clues overflow — using next page',
      clueFont,
      gridH,
      cluesH,
      widthReduced,
    };
  }

  return {
    fits: false,
    cellSize: cell,
    mode: 'same',
    pages: 1,
    overflow: true,
    warning: 'Clues may overflow safe area',
    clueFont,
    gridH,
    cluesH,
    widthReduced,
  };
}

function buildPagePlan(state) {
  const settings = state.settings;
  const { pageW, pageH } = pageSizePts(settings.trim, settings.bleed);
  const outside = OUTSIDE_IN;
  const top = TOP_IN;
  const bottom = BOTTOM_IN;

  let gutter = gutterForPageCount(24);
  let pages = [];
  let warnings = [];

  function layoutOnce(gutterIn) {
    const localPages = [];
    const localWarnings = [];
    const boxOpts = {
      pageW,
      pageH,
      gutter: gutterIn,
      outside,
      top,
      bottom,
      bleed: settings.bleed,
    };
    const measureBox = contentBox(1, boxOpts);

    for (let i = 0; i < state.puzzles.length; i++) {
      const puzzle = state.puzzles[i];
      if (!puzzle.result) continue;
      const measure = measurePuzzlePage(
        puzzle,
        settings,
        measureBox,
        settings.cellSize
      );
      // Auto cell-size shrink is normal layout — do not surface as a warning.
      // Only report real layout problems (e.g. clues forced onto next page).
      if (measure.warning) {
        localWarnings.push({
          level: 'warn',
          msg: `Puzzle ${i + 1}: ${measure.warning}`,
        });
      }

      const title = puzzleTitle(settings, puzzle, i);
      if (measure.mode === 'same') {
        localPages.push({
          type: 'puzzle',
          puzzleIndex: i,
          title,
          cellSize: measure.cellSize,
          clueFont: measure.clueFont,
          includeClues: true,
          measure,
        });
      } else {
        localPages.push({
          type: 'puzzle',
          puzzleIndex: i,
          title,
          cellSize: measure.cellSize,
          clueFont: measure.clueFont,
          includeClues: false,
          measure,
        });
        localPages.push({
          type: 'clues',
          puzzleIndex: i,
          title,
          clueFont: measure.clueFont,
          measure,
        });
      }
    }

    if (settings.answerKey) {
      const per = settings.answersPerPage || 4;
      const withResults = state.puzzles
        .map((p, idx) => ({ p, idx }))
        .filter((x) => x.p.result && x.p.result.placed.length);
      for (let i = 0; i < withResults.length; i += per) {
        const chunk = withResults.slice(i, i + per);
        localPages.push({
          type: 'answers',
          isFirstAnswers: i === 0,
          items: chunk.map((x) => ({
            puzzleIndex: x.idx,
            title: puzzleTitle(settings, x.p, x.idx),
          })),
          perPage: per,
        });
      }
    }

    // Pad at most 1 blank so page count is even (KDP prefers even); do NOT pad to 24.
    // Silent — expected automatic behavior, not a user-facing warning.
    if (localPages.length % 2 === 1) {
      localPages.push({ type: 'blank' });
    }

    return { pages: localPages, warnings: localWarnings };
  }

  for (let iter = 0; iter < 3; iter++) {
    const laid = layoutOnce(gutter);
    pages = laid.pages;
    warnings = laid.warnings;
    const newGutter = gutterForPageCount(pages.length);
    if (newGutter === gutter) break;
    if (iter === 2) {
      gutter = Math.max(gutter, newGutter);
      const finalLaid = layoutOnce(gutter);
      pages = finalLaid.pages;
      warnings = finalLaid.warnings;
      break;
    }
    gutter = newGutter;
  }

  const boxOpts = {
    pageW,
    pageH,
    gutter,
    outside,
    top,
    bottom,
    bleed: settings.bleed,
  };

  return {
    pages,
    pageCount: pages.length,
    gutter,
    outside,
    top,
    bottom,
    pageW,
    pageH,
    boxOpts,
    warnings,
    // Fallback; renderers prefer contentBox(...).pageNumY per page
    pageNumY: contentBox(1, boxOpts).pageNumY,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    contentBox,
    buildPagePlan,
    puzzleTitle,
    measurePuzzlePage,
    estimateClueLines,
    computeMaxGrid,
  };
}
