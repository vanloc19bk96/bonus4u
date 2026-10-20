'use strict';

const {
  IN, TRIM_SIZES, CELL_SIZE_LADDER, LARGE_PRINT_MIN_CELL, DIVIDER_GAP_IN, DIFFICULTY,
} = require('./constants');
const { computeGeometry, contentBoxPt, insetContentBox, gutterMinForPageCount } = require('./geometry');
const { mulberry32, parseSeed, shuffle } = require('./rng');
const { makePuzzle, buildDifficultyQueue, encode, encodeCells, invertKey } = require('./cipher');
const { collectQuotes, prepareQuotePool, filterByDifficulty } = require('./quotes');

function cellsToWords(cells) {
  const words = [];
  let cur = [];
  for (const cell of cells) {
    if (cell.kind === 'space') {
      if (cur.length) {
        words.push(cur);
        cur = [];
      }
    } else {
      cur.push(cell);
    }
  }
  if (cur.length) words.push(cur);
  return words;
}

/**
 * Word-atomic wrap into rows of cells.
 * cellW = advance width; gap between words = 1.5 * cellW
 */
function wrapPuzzle(cells, contentWPt, cellPt, numeric) {
  // Conservative advance so glyphs never spill past the content box
  const cellW = numeric ? cellPt * 0.95 : cellPt * 0.72;
  const wordGap = cellW * 1.5;
  const maxW = Math.max(0, contentWPt - 2);
  const words = cellsToWords(cells);
  const rows = [];
  let row = [];
  let rowW = 0;

  function wordWidth(tokens) {
    return tokens.length * cellW;
  }

  for (const word of words) {
    const ww = wordWidth(word);
    if (ww > maxW) return null;
    const need = row.length ? rowW + wordGap + ww : ww;
    if (need > maxW && row.length) {
      rows.push(row);
      row = word.slice();
      rowW = ww;
    } else {
      if (row.length) {
        row.push({ kind: 'space', cipher: ' ', plain: ' ' });
        rowW += wordGap;
      }
      for (const t of word) row.push(t);
      rowW += ww;
    }
  }
  if (row.length) rows.push(row);
  return { rows, cellW, cellPt, wordGap };
}

function puzzleBlockHeight(layout, opts) {
  const lineH = layout.cellPt * 2.95;
  let h = 18; // header
  h += layout.rows.length * lineH;
  if (opts.hintLine) h += 16;
  if (opts.miniWorksheet) h += 36;
  return h;
}

function autoFitPuzzle(cells, contentWPt, contentHPt, opts) {
  let ladder = CELL_SIZE_LADDER.slice();
  if (opts.cellSizeMax) {
    ladder = [opts.cellSizeMax, ...ladder.filter((x) => x < opts.cellSizeMax)];
  }
  if (opts.largePrint) {
    ladder = [Math.max(LARGE_PRINT_MIN_CELL, opts.cellSizeMax || LARGE_PRINT_MIN_CELL), 22, 20].filter(
      (v, i, a) => a.indexOf(v) === i
    );
  }
  for (const cellPt of ladder) {
    const layout = wrapPuzzle(cells, contentWPt, cellPt, opts.numeric);
    if (!layout) continue;
    const h = puzzleBlockHeight(layout, opts);
    if (h <= contentHPt) return { ok: true, layout, cellPt };
  }
  return { ok: false, reason: 'auto-fit failed at floor cell size' };
}

/** Rough character budget that can still fit at the floor cell size. */
function estimateMaxFitChars(contentWPt, contentHPt, cellPt, numeric) {
  const cellW = numeric ? cellPt * 0.95 : cellPt * 0.72;
  const lineH = cellPt * 2.95;
  const rows = Math.floor((contentHPt - 18) / lineH);
  if (rows < 1 || cellW <= 0) return 0;
  // Word gaps eat width; keep a conservative budget
  const charsPerRow = Math.floor(contentWPt / (cellW * 1.2));
  return Math.max(0, rows * Math.max(1, charsPerRow));
}

function pickFitFriendlyQuote(rng, list, maxChars) {
  if (!list.length) return null;
  const fittable = maxChars > 0 ? list.filter((q) => q.charLen <= maxChars) : list;
  const pool = fittable.length ? fittable : list;
  const sorted = pool.slice().sort((a, b) => a.charLen - b.charLen);
  // Prefer shorter quotes; still allow some variety in the shortest band
  const windowSize = Math.max(1, Math.ceil(sorted.length * 0.55));
  const window = sorted.slice(0, windowSize);
  return window[Math.floor(rng() * window.length)];
}

function buildAutofitUserError(puzzleIndex, perPage, config) {
  const tips = [];
  if (perPage >= 3) {
    tips.push(`Lower Per page to 2 or 1 (currently ${perPage}).`);
  } else if (perPage === 2) {
    tips.push('Lower Per page to 1 for the longest quotes.');
  }
  const mix = config.puzzles.mix || {};
  const hardish = (Number(mix.hard) || 0) + (Number(mix.expert) || 0);
  if (hardish > 30) {
    tips.push('Reduce Hard/Expert % and raise Easy/Medium (shorter quotes).');
  } else {
    tips.push('Use more Easy/Medium puzzles — longer Hard/Expert text needs more space.');
  }
  if (config.format.largePrint) tips.push('Turn off Large print.');
  if (config.puzzles.source === 'paste' || config.puzzles.source === 'import') {
    tips.push('Use shorter quotes in Paste/Import.');
  }
  return [
    `Couldn’t fit puzzle ${puzzleIndex} on the page — the quote is too long for the current layout.`,
    '',
    'Try one of these:',
    ...tips.map((t, i) => `${i + 1}. ${t}`),
  ].join('\n');
}

function buildHintLine(puzzle) {
  if (!puzzle.revealedPlain || !puzzle.revealedPlain.length) return '';
  const parts = puzzle.revealedPlain.map((p, i) => {
    const c = puzzle.revealed[i];
    return `${c} = ${p}`;
  });
  return 'Hint:  ' + parts.join(',  ');
}

function estimatePageCount(config) {
  let pages = 0;
  pages += 2; // title + copyright
  if (config.sections.dedication) pages += 1;
  if (config.sections.howToSolve) pages += 1;
  if (config.sections.worksheet) pages += 1;
  const perPage = config.format.largePrint
    ? 1
    : Math.max(1, Math.min(4, Number(config.puzzles.perPage) || 1));
  const puzzlePages = Math.ceil(config.puzzles.count / perPage);
  pages += puzzlePages;
  if (config.sections.notesEvery > 0) {
    pages += Math.floor(puzzlePages / config.sections.notesEvery);
  }
  const solPer = Math.max(2, Number(config.sections.solutionsPerPage) || 20);
  pages += Math.ceil(config.puzzles.count / solPer);
  return { pages, perPage, puzzlePages };
}

async function generateBook(config, extras, onProgress) {
  const cancelFlag = extras && extras.cancelFlag;
  const seed = parseSeed(config.puzzles.seed);
  const rng = mulberry32(seed);
  const trim = TRIM_SIZES.find((t) => t.id === '8.5x11') || TRIM_SIZES.find((t) => t.id === config.format.trim);

  const maxLen = DIFFICULTY.expert.maxLen;
  const source = config.puzzles.source;
  const isUserContent = source === 'paste' || source === 'import';
  // User-pasted quotes: accept slightly shorter / less diverse text than the built-in bank
  const quoteOpts = isUserContent ? { minDistinct: 10 } : { minDistinct: 12 };
  const puzzleOptsBase = isUserContent
    ? { minDistinct: 10, minWordLen: 4 }
    : { minDistinct: 12, minWordLen: 6 };
  const poolRaw = collectQuotes(
    source,
    extras && extras.pasteText,
    extras && extras.importedRows,
    config.puzzles.theme
  );
  const { ready, skipped } = prepareQuotePool(poolRaw, maxLen, quoteOpts);
  const requestedCount = config.puzzles.count;
  let puzzleCount = requestedCount;
  let countClamped = false;
  if (isUserContent && ready.length > 0 && ready.length < puzzleCount) {
    puzzleCount = ready.length;
    countClamped = true;
    config.puzzles.count = puzzleCount;
  }

  const est = estimatePageCount(config);
  let pageCount = est.pages;

  if (ready.length === 0) {
    const reqHint = isUserContent
      ? 'Need ≥20 characters, ≥10 different letters, and a word of ≥4 letters.'
      : 'Need ≥20 characters, ≥12 different letters, and a word of ≥6 letters.';
    return {
      error: `No valid quotes available. ${reqHint}`,
      skipped,
    };
  }

  if (ready.length < puzzleCount) {
    return {
      error: `Only ${ready.length} valid quotes available; need ${puzzleCount}.`,
      skipped,
    };
  }

  const difficultyQueue = buildDifficultyQueue(
    puzzleCount,
    config.puzzles.mix,
    config.puzzles.order,
    rng
  );

  const used = new Set();
  const puzzles = [];
  const fitErrors = [];
  let masterKey = null;

  const perPage = config.format.largePrint
    ? 1
    : Math.max(1, Math.min(4, Number(config.puzzles.perPage) || 1));
  // provisional geometry for fit checks
  let geoFn = computeGeometry({
    trimW: trim.w,
    trimH: trim.h,
    bleed: !!config.format.bleed,
    pageCount,
    gutterPad: config.layout.gutterPad,
    outerMargin: config.layout.outerMargin,
  });
  const sampleBox = insetContentBox(contentBoxPt(3, geoFn));
  const folioPad = config.layout.showPageNumbers ? 14 : 0;
  const usableH = sampleBox.h - folioPad;
  const gapCount = Math.max(0, perPage - 1);
  const blockH = (usableH - gapCount * DIVIDER_GAP_IN * IN) / perPage;
  const fitHeight = blockH - 8;
  const floorCell = CELL_SIZE_LADDER[CELL_SIZE_LADDER.length - 1];
  const maxFitChars = estimateMaxFitChars(sampleBox.w, fitHeight, floorCell, false);
  const maxFitCharsNumeric = estimateMaxFitChars(sampleBox.w, fitHeight, floorCell, true);

  for (let i = 0; i < puzzleCount; i++) {
    if (cancelFlag && cancelFlag.cancelled) return { cancelled: true };
    if (onProgress && i % 8 === 0) {
      onProgress(i / puzzleCount * 0.7, `Generating puzzle ${i + 1}`);
      await new Promise((r) => setTimeout(r, 0));
    }
    const difficulty = difficultyQueue[i];
    const candidates = filterByDifficulty(ready, difficulty).filter((q) => !used.has(q.hash));
    let made = null;
    let lastErr = 'no candidates';
    for (let attempt = 0; attempt < 50; attempt++) {
      const list = candidates.length ? candidates : ready.filter((q) => !used.has(q.hash));
      if (!list.length) {
        lastErr = 'exhausted quote pool';
        break;
      }
      const willBeNumeric = !!config.puzzles.numericVariant || difficulty === 'expert';
      const charBudget = willBeNumeric ? maxFitCharsNumeric : maxFitChars;
      const quote = pickFitFriendlyQuote(rng, list, charBudget);
      if (!quote) {
        lastErr = 'exhausted quote pool';
        break;
      }
      const opts = {
        allowReciprocal: !!config.puzzles.allowReciprocal,
        numericVariant: willBeNumeric,
        stripPunctuation: !!config.puzzles.stripPunctuation,
        forceStrip: difficulty === 'expert' && !!config.puzzles.stripPunctuation,
        minDistinct: puzzleOptsBase.minDistinct,
        minWordLen: puzzleOptsBase.minWordLen,
      };
      if (!config.puzzles.freshKeyPerPuzzle && masterKey) {
        // reuse master key path via temporary make then override
      }
      const puzzle = makePuzzle(rng, quote, difficulty, opts);
      if (puzzle.error) {
        lastErr = puzzle.error;
        continue;
      }
      if (!config.puzzles.freshKeyPerPuzzle) {
        if (!masterKey) masterKey = puzzle.key;
        else {
          puzzle.key = masterKey;
          puzzle.cipher = encode(puzzle.plain, masterKey, puzzle.numeric);
          puzzle.cells = encodeCells(puzzle.plain, masterKey, puzzle.numeric);
          puzzle.revealed = (puzzle.revealedPlain || []).map((p) => String(masterKey[p]));
          puzzle.invKey = invertKey(masterKey);
        }
      }
      // Puzzle pages no longer render hint / mini-worksheet aids
      const fitOpts = {
        largePrint: !!config.format.largePrint,
        cellSizeMax: config.layout.cellSizeMax,
        hintLine: false,
        miniWorksheet: false,
        numeric: puzzle.numeric,
      };
      const fit = autoFitPuzzle(puzzle.cells, sampleBox.w, fitHeight, fitOpts);
      if (!fit.ok) {
        lastErr = fit.reason;
        // Don't retry the same quote forever when it simply cannot fit
        used.add(quote.hash);
        continue;
      }
      used.add(quote.hash);
      made = {
        n: i + 1,
        difficulty,
        plain: puzzle.plain,
        author: puzzle.author,
        key: puzzle.key,
        invKey: puzzle.invKey,
        revealed: puzzle.revealed,
        revealedPlain: puzzle.revealedPlain,
        cipher: puzzle.cipher,
        cells: puzzle.cells,
        numeric: puzzle.numeric,
        aids: puzzle.aids,
        hintLine: buildHintLine(puzzle),
        layout: fit.layout,
        cellPt: fit.cellPt,
      };
      break;
    }
    if (!made) {
      fitErrors.push({ index: i + 1, reason: lastErr });
      const isAutofit = String(lastErr).includes('auto-fit');
      return {
        error: isAutofit
          ? buildAutofitUserError(i + 1, perPage, config)
          : `Puzzle ${i + 1} failed after 50 attempts: ${lastErr}`,
        errorKind: isAutofit ? 'autofit' : 'generate',
        skipped,
        fitErrors,
      };
    }
    puzzles.push(made);
  }

  // Assemble pages
  const pages = [];
  function addPage(kind, payload) {
    pages.push({ index: pages.length + 1, kind, payload });
  }

  addPage('title', { title: config.book.title, subtitle: config.book.subtitle, volume: config.book.volume, author: config.book.author });
  addPage('copyright', {
    year: config.book.year,
    publisher: config.book.publisher || config.book.author,
    isbn: config.book.isbn,
    author: config.book.author,
  });
  if (config.sections.dedication) addPage('dedication', {});
  if (config.sections.howToSolve) {
    addPage('howto', {});
  }
  if (config.sections.worksheet) addPage('worksheet', {});

  let puzzlesOnPage = [];
  let puzzlePageOrdinal = 0;
  for (let i = 0; i < puzzles.length; i++) {
    puzzlesOnPage.push(puzzles[i]);
    if (puzzlesOnPage.length === perPage || i === puzzles.length - 1) {
      puzzlePageOrdinal++;
      addPage('puzzle', { puzzles: puzzlesOnPage.slice() });
      puzzlesOnPage = [];
      if (config.sections.notesEvery > 0 && puzzlePageOrdinal % config.sections.notesEvery === 0) {
        addPage('notes', {});
      }
    }
  }

  const solPer = Math.max(2, Number(config.sections.solutionsPerPage) || 20);
  for (let i = 0; i < puzzles.length; i += solPer) {
    addPage('solution', {
      items: puzzles.slice(i, i + solPer),
    });
  }

  pageCount = pages.length;
  geoFn = computeGeometry({
    trimW: trim.w,
    trimH: trim.h,
    bleed: !!config.format.bleed,
    pageCount,
    gutterPad: config.layout.gutterPad,
    outerMargin: config.layout.outerMargin,
  });
  const g0 = geoFn(true);

  if (onProgress) onProgress(1, 'Done');

  return {
    pages,
    puzzles,
    geometry: geoFn,
    trim,
    config,
    stats: {
      pageCount,
      gutter: g0.gutter,
      gutterMin: g0.gutterMin,
      outer: g0.outer,
      outerMin: g0.outerMin,
      skipped,
      seed,
      perPage,
      countClamped,
      requestedCount,
    },
  };
}

function sanitizeFilename(s) {
  return String(s || 'cryptogram')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'cryptogram';
}

function formatKeyLine(key, numeric) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return letters
    .split('')
    .map((L) => `${L}=${key[L]}`)
    .join(' ');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cellsToWords,
    wrapPuzzle,
    autoFitPuzzle,
    buildHintLine,
    estimatePageCount,
    generateBook,
    sanitizeFilename,
    formatKeyLine,
    puzzleBlockHeight,
  };
}
