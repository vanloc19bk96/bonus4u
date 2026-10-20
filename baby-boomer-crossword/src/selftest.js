'use strict';

const { inBounds, isEmpty } = require('./crossword');

function readWord(grid, row, col, dir, len) {
  const dr = dir === 'D' ? 1 : 0;
  const dc = dir === 'A' ? 1 : 0;
  let s = '';
  for (let i = 0; i < len; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    if (!inBounds(grid, r, c) || grid[r][c] == null) return null;
    s += grid[r][c];
  }
  return s;
}

function collectSegments(grid) {
  const segs = [];
  const rows = grid.length;
  const cols = grid[0].length;

  // Horizontal runs ≥2
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      if (grid[r][c] == null) {
        c++;
        continue;
      }
      const start = c;
      while (c < cols && grid[r][c] != null) c++;
      if (c - start >= 2) {
        segs.push({ row: r, col: start, dir: 'A', len: c - start });
      }
    }
  }

  // Vertical runs ≥2
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      if (grid[r][c] == null) {
        r++;
        continue;
      }
      const start = r;
      while (r < rows && grid[r][c] != null) r++;
      if (r - start >= 2) {
        segs.push({ row: start, col: c, dir: 'D', len: r - start });
      }
    }
  }
  return segs;
}

/**
 * Self-test a generated puzzle result.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function testPuzzleResult(result) {
  const errors = [];
  if (!result || !result.grid) {
    return { ok: false, errors: ['Missing result'] };
  }
  const { grid, placed, across, down } = result;

  for (const p of placed) {
    const read = readWord(grid, p.row, p.col, p.dir, p.word.length);
    if (read !== p.word) {
      errors.push(`Placed word mismatch: expected ${p.word}, got ${read}`);
    }
  }

  // Intersections match
  const letterAt = new Map();
  for (const p of placed) {
    const dr = p.dir === 'D' ? 1 : 0;
    const dc = p.dir === 'A' ? 1 : 0;
    for (let i = 0; i < p.word.length; i++) {
      const key = `${p.row + dr * i},${p.col + dc * i}`;
      const ch = p.word[i];
      if (letterAt.has(key) && letterAt.get(key) !== ch) {
        errors.push(`Intersection conflict at ${key}`);
      }
      letterAt.set(key, ch);
    }
  }

  // No orphan segments ≥2
  const known = new Set(
    (across || [])
      .concat(down || [])
      .map((x) => `${x.number}:${x.word}`)
  );
  const placedKeys = new Set(placed.map((p) => `${p.dir}:${p.row},${p.col}:${p.word}`));
  for (const seg of collectSegments(grid)) {
    const word = readWord(grid, seg.row, seg.col, seg.dir, seg.len);
    const match = placed.find(
      (p) =>
        p.dir === seg.dir &&
        p.row === seg.row &&
        p.col === seg.col &&
        p.word === word
    );
    if (!match) {
      errors.push(`Orphan segment ${seg.dir} at ${seg.row},${seg.col}: ${word}`);
    }
  }

  // Numbering continuous 1..K
  const numbers = placed.map((p) => p.number).filter((n) => n > 0);
  const uniqueStarts = [...new Set(numbers)].sort((a, b) => a - b);
  for (let i = 0; i < uniqueStarts.length; i++) {
    if (uniqueStarts[i] !== i + 1) {
      errors.push(`Numbering gap/duplicate near ${uniqueStarts[i]}`);
      break;
    }
  }

  // Across/down lists match
  if ((across || []).length + (down || []).length !== placed.length) {
    errors.push('Across/Down count mismatch with placed');
  }

  void known;
  void placedKeys;
  void isEmpty;

  return { ok: errors.length === 0, errors };
}

function runSelfTest(puzzles) {
  const report = [];
  let pass = 0;
  let fail = 0;
  for (let i = 0; i < puzzles.length; i++) {
    const p = puzzles[i];
    const r = testPuzzleResult(p.result);
    if (r.ok) {
      pass++;
      report.push(`✅ Puzzle ${i + 1}: OK (${p.result.placed.length} words)`);
    } else {
      fail++;
      report.push(`❌ Puzzle ${i + 1}: ${r.errors.join('; ')}`);
    }
  }
  return { pass, fail, report, ok: fail === 0 };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testPuzzleResult, runSelfTest, readWord, collectSegments };
}
