'use strict';

const fs = require('fs');
const path = require('path');
const { parseWordList } = require('../src/parser');
const {
  generateCrossword,
  isValidPlacement,
  emptyGrid,
} = require('../src/crossword');

const ui = fs.readFileSync(path.join(__dirname, '../src/ui.js'), 'utf8');
const start = ui.indexOf('const SAMPLE_RAW = `') + 'const SAMPLE_RAW = `'.length;
const end = ui.indexOf('`;', start);
const raw = ui.slice(start, end);
const { entries } = parseWordList(raw, 13);
const r = generateCrossword(entries, 13, 12345);

console.log('placed', r.placed.map((p) => p.word + p.dir));
console.log('unplaced', r.unplaced);
console.log('grid:');
for (const row of r.grid) {
  console.log(row.map((c) => c || '.').join(' '));
}

// Try to manually find any valid spot for SITAR on final grid
// Rebuild full max grid? result is trimmed — use placed to rebuild
const grid = emptyGrid(13);
// Can't easily — use trimmed grid
const word = 'SITAR';
let found = 0;
for (let dir of ['A', 'D']) {
  for (let row = 0; row < r.rows; row++) {
    for (let col = 0; col < r.cols; col++) {
      if (isValidPlacement(r.grid, word, row, col, dir, { placed: r.placed })) {
        found++;
        if (found <= 5) console.log('valid', dir, row, col);
      }
    }
  }
}
console.log('total valid spots for SITAR on trimmed grid', found);
