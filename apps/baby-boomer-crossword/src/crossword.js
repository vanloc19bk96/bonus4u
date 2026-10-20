'use strict';

const { mulberry32, hashSeed, shuffle, pickBest } = require('./rng');

function emptyGrid(n) {
  return Array.from({ length: n }, () => Array(n).fill(null));
}

function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

function inBounds(grid, r, c) {
  return r >= 0 && c >= 0 && r < grid.length && c < grid[0].length;
}

function cell(grid, r, c) {
  if (!inBounds(grid, r, c)) return null;
  return grid[r][c];
}

function isEmpty(grid, r, c) {
  return !inBounds(grid, r, c) || grid[r][c] == null;
}

/**
 * Validate freeform crossword placement.
 * @param {object} [opts]
 * @param {boolean} [opts.requireIntersection] default true
 * @param {Array} [opts.placed] existing placements (to reject full overlap)
 */
function isValidPlacement(grid, word, row, col, dir, opts) {
  const requireIntersection = !opts || opts.requireIntersection !== false;
  const placed = (opts && opts.placed) || [];
  const dr = dir === 'D' ? 1 : 0;
  const dc = dir === 'A' ? 1 : 0;
  const len = word.length;
  const endR = row + dr * (len - 1);
  const endC = col + dc * (len - 1);
  if (!inBounds(grid, row, col) || !inBounds(grid, endR, endC)) return false;

  // Cells immediately before and after must be empty / OOB
  if (!isEmpty(grid, row - dr, col - dc)) return false;
  if (!isEmpty(grid, endR + dr, endC + dc)) return false;

  let intersections = 0;

  for (let i = 0; i < len; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const existing = grid[r][c];
    const ch = word[i];

    if (existing != null) {
      if (existing !== ch) return false;
      intersections++;
    } else {
      // Orthogonal neighbors must be empty (no parallel adjacency)
      if (dir === 'A') {
        if (!isEmpty(grid, r - 1, c)) return false;
        if (!isEmpty(grid, r + 1, c)) return false;
      } else {
        if (!isEmpty(grid, r, c - 1)) return false;
        if (!isEmpty(grid, r, c + 1)) return false;
      }
    }
  }

  if (requireIntersection && intersections < 1) return false;

  // Reject exact duplicate of an already-placed word
  for (const p of placed) {
    if (
      p.dir === dir &&
      p.row === row &&
      p.col === col &&
      p.word.length === word.length
    ) {
      return false;
    }
  }

  return true;
}

function placeWord(grid, word, row, col, dir) {
  const dr = dir === 'D' ? 1 : 0;
  const dc = dir === 'A' ? 1 : 0;
  for (let i = 0; i < word.length; i++) {
    grid[row + dr * i][col + dc * i] = word[i];
  }
}

function boundingBox(grid) {
  let minR = Infinity;
  let minC = Infinity;
  let maxR = -1;
  let maxC = -1;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      if (grid[r][c] != null) {
        if (r < minR) minR = r;
        if (c < minC) minC = c;
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR < 0) return { minR: 0, minC: 0, maxR: 0, maxC: 0, rows: 0, cols: 0 };
  return {
    minR,
    minC,
    maxR,
    maxC,
    rows: maxR - minR + 1,
    cols: maxC - minC + 1,
  };
}

function scorePlacement(grid, word, row, col, dir, maxGrid) {
  const dr = dir === 'D' ? 1 : 0;
  const dc = dir === 'A' ? 1 : 0;
  let intersections = 0;
  for (let i = 0; i < word.length; i++) {
    if (grid[row + dr * i][col + dc * i] != null) intersections++;
  }

  const before = boundingBox(grid);
  const tmp = cloneGrid(grid);
  placeWord(tmp, word, row, col, dir);
  const after = boundingBox(tmp);
  const bboxGrowth = after.rows + after.cols - (before.rows + before.cols);

  const center = (maxGrid - 1) / 2;
  const midR = row + (dr * (word.length - 1)) / 2;
  const midC = col + (dc * (word.length - 1)) / 2;
  const manhattan = Math.abs(midR - center) + Math.abs(midC - center);

  // Balance Across vs Down is applied by caller via acrossCount/downCount
  return {
    intersections,
    bboxGrowth,
    manhattan,
    raw: 10 * intersections - 2 * bboxGrowth - 1 * manhattan,
  };
}

function findCandidates(grid, word, placed, maxGrid) {
  const candidates = [];
  const seen = new Set();

  function tryAdd(row, col, dir) {
    const key = `${row},${col},${dir}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!isValidPlacement(grid, word, row, col, dir, { placed })) return;
    const s = scorePlacement(grid, word, row, col, dir, maxGrid);
    candidates.push({ row, col, dir, ...s });
  }

  for (const p of placed) {
    for (let i = 0; i < word.length; i++) {
      for (let j = 0; j < p.word.length; j++) {
        if (word[i] !== p.word[j]) continue;
        // Place perpendicular at intersection
        if (p.dir === 'A') {
          tryAdd(p.row - i, p.col + j, 'D');
        } else {
          tryAdd(p.row + j, p.col - i, 'A');
        }
        // Also allow same-direction extension only via shared letters
        // (perpendicular is preferred; same dir rarely valid due to before/after)
        if (p.dir === 'A') tryAdd(p.row, p.col + j - i, 'A');
        else tryAdd(p.row + j - i, p.col, 'D');
      }
    }
  }
  return candidates;
}

function trimResult(grid, placed) {
  const box = boundingBox(grid);
  if (box.rows === 0) {
    return { grid: [[null]], placed: [], rows: 1, cols: 1 };
  }
  const trimmed = [];
  for (let r = box.minR; r <= box.maxR; r++) {
    trimmed.push(grid[r].slice(box.minC, box.maxC + 1));
  }
  const shifted = placed.map((p) => ({
    ...p,
    row: p.row - box.minR,
    col: p.col - box.minC,
  }));
  return { grid: trimmed, placed: shifted, rows: box.rows, cols: box.cols };
}

function numberGrid(grid, placed) {
  const starts = new Map(); // "r,c" -> number
  let next = 1;
  const rows = grid.length;
  const cols = grid[0].length;

  function isStartAcross(r, c) {
    if (grid[r][c] == null) return false;
    if (!isEmpty(grid, r, c - 1)) return false;
    return inBounds(grid, r, c + 1) && grid[r][c + 1] != null;
  }

  function isStartDown(r, c) {
    if (grid[r][c] == null) return false;
    if (!isEmpty(grid, r - 1, c)) return false;
    return inBounds(grid, r + 1, c) && grid[r + 1][c] != null;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isStartAcross(r, c) || isStartDown(r, c)) {
        starts.set(`${r},${c}`, next++);
      }
    }
  }

  const numbered = placed.map((p) => ({
    ...p,
    number: starts.get(`${p.row},${p.col}`) || 0,
  }));

  const across = numbered
    .filter((p) => p.dir === 'A')
    .sort((a, b) => a.number - b.number)
    .map((p) => ({ number: p.number, clue: p.clue, word: p.word }));

  const down = numbered
    .filter((p) => p.dir === 'D')
    .sort((a, b) => a.number - b.number)
    .map((p) => ({ number: p.number, clue: p.clue, word: p.word }));

  return { placed: numbered, across, down, starts };
}

function connectivityScore(word, all) {
  let score = 0;
  for (const other of all) {
    if (other === word) continue;
    const set = new Set(other.split(''));
    for (const ch of word) {
      if (set.has(ch)) score++;
    }
  }
  return score;
}

function orderWords(entries, rng) {
  const words = entries.slice().sort((a, b) => {
    if (b.word.length !== a.word.length) return b.word.length - a.word.length;
    const cb = connectivityScore(
      b.word,
      entries.map((w) => w.word)
    );
    const ca = connectivityScore(
      a.word,
      entries.map((w) => w.word)
    );
    if (cb !== ca) return cb - ca;
    return rng() < 0.5 ? -1 : 1;
  });

  // Shuffle within equal lengths for diversity across attempts
  const ordered = [];
  let i = 0;
  while (i < words.length) {
    let j = i + 1;
    while (j < words.length && words[j].word.length === words[i].word.length) j++;
    ordered.push(...shuffle(rng, words.slice(i, j)));
    i = j;
  }
  return ordered;
}

function placeWithUndo(grid, placed, entry, row, col, dir) {
  const dr = dir === 'D' ? 1 : 0;
  const dc = dir === 'A' ? 1 : 0;
  const cells = [];
  for (let i = 0; i < entry.word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    cells.push([r, c, grid[r][c]]);
    grid[r][c] = entry.word[i];
  }
  placed.push({
    word: entry.word,
    clue: entry.clue,
    row,
    col,
    dir,
    _cells: cells,
  });
}

function undoPlace(grid, placed) {
  const p = placed.pop();
  for (const [r, c, prev] of p._cells) grid[r][c] = prev;
}

function stripUndoCells(placed) {
  return placed.map(({ word, clue, row, col, dir }) => ({
    word,
    clue,
    row,
    col,
    dir,
  }));
}

function firstWordCandidates(word, maxGrid) {
  const mid = Math.floor(maxGrid / 2);
  const acrossCol = Math.max(0, Math.floor((maxGrid - word.length) / 2));
  const downRow = Math.max(0, Math.floor((maxGrid - word.length) / 2));
  const out = [
    { row: mid, col: acrossCol, dir: 'A', raw: 0 },
    { row: downRow, col: mid, dir: 'D', raw: 0 },
  ];
  // A few near-center offsets so retries explore different skeletons
  for (const d of [-1, 1, -2, 2]) {
    const col = Math.max(0, Math.min(maxGrid - word.length, acrossCol + d));
    out.push({ row: mid, col, dir: 'A', raw: -Math.abs(d) });
    const row = Math.max(0, Math.min(maxGrid - word.length, downRow + d));
    out.push({ row, col: mid, dir: 'D', raw: -Math.abs(d) });
  }
  return out;
}

/**
 * DFS backtracking placer — aims for full placement.
 * If a full solve fails, falls back to maximize-placed search then greedy.
 */
function attemptGenerate(entries, maxGrid, rng, timeBudgetMs) {
  const words = orderWords(entries, rng);
  const t0 = Date.now();
  const budget = timeBudgetMs || 300;

  if (!words.length) {
    return {
      grid: emptyGrid(maxGrid),
      placed: [],
      unplaced: [],
      rows: maxGrid,
      cols: maxGrid,
    };
  }

  // --- Phase 1: full solve (no skips) ---
  {
    const grid = emptyGrid(maxGrid);
    const placed = [];

    function dfsFull(idx) {
      if (idx === words.length) return true;
      if (Date.now() - t0 > budget * 0.65) return false;

      const entry = words[idx];
      let candidates;
      if (!placed.length) {
        candidates = firstWordCandidates(entry.word, maxGrid);
      } else {
        candidates = findCandidates(grid, entry.word, placed, maxGrid);
        candidates.sort((a, b) => b.raw - a.raw);
      }

      const limit = Math.min(candidates.length, idx === 0 ? 8 : 36);
      // Light shuffle of near-ties so attempts diverge
      for (let i = 1; i < limit; i++) {
        if (Math.abs(candidates[i].raw - candidates[0].raw) <= 2 && rng() < 0.35) {
          const j = (i + ((rng() * 3) | 0)) % limit;
          const tmp = candidates[i];
          candidates[i] = candidates[j];
          candidates[j] = tmp;
        }
      }

      for (let i = 0; i < limit; i++) {
        const c = candidates[i];
        placeWithUndo(grid, placed, entry, c.row, c.col, c.dir);
        if (dfsFull(idx + 1)) return true;
        undoPlace(grid, placed);
      }
      return false;
    }

    if (dfsFull(0)) {
      return { grid, placed: stripUndoCells(placed), unplaced: [] };
    }
  }

  // --- Phase 2: DFS with forced-skip only (no candidates → skip, keep searching) ---
  {
    const grid = emptyGrid(maxGrid);
    const placed = [];
    let bestPlaced = null;
    let bestUnplaced = words.map((w) => w.word);

    function dfsMax(idx, skipped) {
      if (Date.now() - t0 > budget) return;

      if (idx === words.length) {
        if (!bestPlaced || placed.length > bestPlaced.length) {
          bestPlaced = stripUndoCells(placed);
          bestUnplaced = skipped.map((e) => e.word);
        }
        return;
      }

      if (bestPlaced && placed.length + (words.length - idx) <= bestPlaced.length) {
        return;
      }

      const entry = words[idx];
      let candidates;
      if (!placed.length) {
        candidates = firstWordCandidates(entry.word, maxGrid);
      } else {
        candidates = findCandidates(grid, entry.word, placed, maxGrid);
        candidates.sort((a, b) => b.raw - a.raw);
      }

      if (!candidates.length) {
        skipped.push(entry);
        dfsMax(idx + 1, skipped);
        skipped.pop();
        return;
      }

      const limit = Math.min(candidates.length, idx === 0 ? 6 : 24);
      for (let i = 0; i < limit; i++) {
        const c = candidates[i];
        placeWithUndo(grid, placed, entry, c.row, c.col, c.dir);
        dfsMax(idx + 1, skipped);
        undoPlace(grid, placed);
        if (bestPlaced && bestPlaced.length === words.length) return;
      }
    }

    dfsMax(0, []);

    if (bestPlaced && bestPlaced.length) {
      const g = emptyGrid(maxGrid);
      for (const p of bestPlaced) placeWord(g, p.word, p.row, p.col, p.dir);
      return { grid: g, placed: bestPlaced, unplaced: bestUnplaced };
    }
  }

  return greedyGenerate(entries, maxGrid, rng);
}

function greedyGenerate(entries, maxGrid, rng) {
  const words = orderWords(entries, rng);
  const grid = emptyGrid(maxGrid);
  const placed = [];
  const unplaced = [];

  if (!words.length) {
    return { grid, placed, unplaced };
  }

  const first = words[0];
  const starters = firstWordCandidates(first.word, maxGrid);
  const start = starters[0];
  placeWord(grid, first.word, start.row, start.col, start.dir);
  placed.push({
    word: first.word,
    clue: first.clue,
    row: start.row,
    col: start.col,
    dir: start.dir,
  });

  let acrossCount = start.dir === 'A' ? 1 : 0;
  let downCount = start.dir === 'D' ? 1 : 0;
  let pending = words.slice(1);

  for (let pass = 0; pass < 6 && pending.length; pass++) {
    const next = [];
    // Place easiest (most candidates) first within this pass
    const scored = pending.map((entry) => {
      const candidates = findCandidates(grid, entry.word, placed, maxGrid);
      return { entry, candidates };
    });
    scored.sort((a, b) => b.candidates.length - a.candidates.length);

    for (const { entry, candidates } of scored) {
      if (!candidates.length) {
        next.push(entry);
        continue;
      }
      const best = pickBest(rng, candidates, (c) => {
        const balance =
          (c.dir === 'A' && acrossCount <= downCount) ||
          (c.dir === 'D' && downCount <= acrossCount)
            ? 3
            : 0;
        return c.raw + balance;
      });
      placeWord(grid, entry.word, best.row, best.col, best.dir);
      placed.push({
        word: entry.word,
        clue: entry.clue,
        row: best.row,
        col: best.col,
        dir: best.dir,
      });
      if (best.dir === 'A') acrossCount++;
      else downCount++;
    }
    if (next.length === pending.length) break;
    pending = next;
  }

  for (const entry of pending) unplaced.push(entry.word);
  return { grid, placed, unplaced };
}

function finalizeResult(raw) {
  const trimmed = trimResult(raw.grid, raw.placed);
  const numbered = numberGrid(trimmed.grid, trimmed.placed);
  const startsObj = {};
  if (numbered.starts && numbered.starts.forEach) {
    numbered.starts.forEach((v, k) => {
      startsObj[k] = v;
    });
  }
  return {
    rows: trimmed.rows,
    cols: trimmed.cols,
    grid: trimmed.grid,
    placed: numbered.placed,
    unplaced: raw.unplaced,
    across: numbered.across,
    down: numbered.down,
    starts: startsObj,
  };
}

function isBetterResult(a, b) {
  if (!b) return true;
  if (a.placed.length !== b.placed.length) return a.placed.length > b.placed.length;
  const areaA = a.rows * a.cols;
  const areaB = b.rows * b.cols;
  if (areaA !== areaB) return areaA < areaB;
  return a.rows < b.rows;
}

/**
 * Generate a freeform crossword with DFS + retries.
 * Board size is capped at maxGrid (KDP safe-area fit at preferred cell size).
 */
function generateCrossword(entries, maxGrid, seed) {
  const baseSeed = seed >>> 0 || 1;
  const board = Math.max(5, maxGrid | 0);
  const n = (entries && entries.length) || 0;
  // Per-attempt + total caps so bulk generate stays responsive
  const budgetMs = Math.min(280, 100 + n * 12);
  const maxTotalMs = Math.min(2200, 350 + n * 70);
  const tStart = Date.now();
  let best = null;

  for (let attempt = 0; attempt < 16; attempt++) {
    if (Date.now() - tStart > maxTotalMs) break;
    const rng = mulberry32((baseSeed + board * 131 + attempt * 9973) >>> 0 || 1);
    const raw = attemptGenerate(entries, board, rng, budgetMs);
    const result = finalizeResult(raw);
    if (isBetterResult(result, best)) best = result;
    if (result.unplaced.length === 0) {
      if (attempt >= 1 && result.rows <= Math.ceil(board * 0.9)) break;
      if (attempt >= 3) break;
    }
  }

  return (
    best || {
      rows: 1,
      cols: 1,
      grid: [[null]],
      placed: [],
      unplaced: entries.map((e) => e.word),
      across: [],
      down: [],
      starts: {},
    }
  );
}

function generatePuzzle(puzzle, maxGrid, globalSeed, index) {
  const seed = hashSeed(globalSeed, index);
  const result = generateCrossword(puzzle.entries || [], maxGrid, seed);
  return { ...puzzle, result };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    emptyGrid,
    isValidPlacement,
    generateCrossword,
    generatePuzzle,
    numberGrid,
    trimResult,
    cell,
    inBounds,
    isEmpty,
  };
}
