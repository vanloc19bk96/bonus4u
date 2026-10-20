'use strict';

const fs = require('fs');
const path = require('path');
const { parseWordList } = require('../src/parser');
const { generateCrossword } = require('../src/crossword');

const ui = fs.readFileSync(path.join(__dirname, '../src/ui.js'), 'utf8');
const start = ui.indexOf('const SAMPLE_RAW = `') + 'const SAMPLE_RAW = `'.length;
const end = ui.indexOf('`;', start);
const raw = ui.slice(start, end);
const { entries } = parseWordList(raw, 13);

let best = 0;
for (let seed = 1; seed <= 40; seed++) {
  const r = generateCrossword(entries, 13, seed * 111);
  best = Math.max(best, r.placed.length);
  if (seed <= 10 || r.placed.length >= 15) {
    console.log('seed', seed * 111, 'placed', r.placed.length, 'unplaced', r.unplaced);
  }
}
console.log('best placed', best, '/', entries.length);
