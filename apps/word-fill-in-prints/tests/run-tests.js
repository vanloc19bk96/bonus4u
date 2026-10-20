/*
 * run-tests.js: automated checks for the engine, word handling, layout and PDF.
 *
 *   node tests/run-tests.js
 *
 * The browser side (file://, workers, dialog, progress, Cancel, download) is covered by
 * tests/browser-check.js. Word lists come from tests/fixtures (test data only).
 */
'use strict';
const env = require('./node-env');
const fs = require('fs');
const path = require('path');
['lib/jspdf.umd.min.js', 'js/fonts.js', 'js/generator.js', 'js/kdp.js', 'js/words.js', 'js/layout.js', 'js/pdf.js'].forEach(env.load);

const E = WF.engine, KDP = WF.KDP, Layout = WF.Layout, Words = WF.Words;
let passed = 0, failed = 0;
function test(name, fn) {
  const t0 = Date.now();
  try {
    const note = fn();
    passed++;
    console.log('PASS ' + name + (note ? ' - ' + note : '') + ' (' + (Date.now() - t0) + ' ms)');
  } catch (e) {
    failed++;
    console.log('FAIL ' + name + ' - ' + (e && e.stack || e));
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const FIXTURE = Words.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-words.json'), 'utf8')).puzzles;
const BASE = {
  trim: '8.5x11', bleed: false, marginPreset: 'comfortable', difficulty: 'medium', gridStyle: 'open', largePrint: false, gridSize: 'auto',
  includeSolutions: true, solutionsPerPage: 4, pageNumbers: true, howToPlay: true, contentsPage: true,
  titlePage: true, copyrightPage: true, bookTitle: 'Test Book', subtitle: 'Sub', copyrightHolder: 'Tester', copyrightYear: 2026, copyrightNotes: 'ISBN 000',
  titlePrefix: 'Puzzle', seed: '', noRepeats: false, stripAccents: true, minLen: 3
};

function makePuzzles(s, count, seedBase) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const src = FIXTURE[i % FIXTURE.length];
    const d = Layout.difficultyForIndex(i, count, s.difficulty), g = Layout.gridFor(s, d);
    const words = src.words.map(w => Words.cleanWord(w, { stripAccents: true, minLen: 3, maxLen: g.n }).word).filter(Boolean);
    const p = E.generatePuzzle({ title: src.title, words, maxRows: g.n, maxCols: g.n, target: g.target, minWords: 6, starters: g.starters, maxGivens: g.maxGivens, attempts: 120, improveRounds: 50, seed: E.hashString(seedBase + ':' + i) });
    assert(!p.error, 'puzzle ' + i + ' failed: ' + JSON.stringify(p));
    p.id = i + 1;
    out.push(p);
  }
  return out;
}

// Independent brute-force counter: tries words in list order per slot (no MRV, no shared code).
function bruteCount(p) {
  const L = p.rows * p.cols, letters = new Array(L).fill('');
  const slots = p.words.map(w => {
    const cells = [];
    for (let i = 0; i < w.w.length; i++) cells.push(w.d === 'a' ? w.r * p.cols + w.c + i : (w.r + i) * p.cols + w.c);
    return { cells, len: w.w.length, given: w.given, word: w.w };
  });
  const bank = p.words.map(w => w.w), used = new Set();
  slots.filter(s => s.given).forEach(s => { s.cells.forEach((c, k) => { letters[c] = s.word[k]; }); used.add(s.word); });
  const open = slots.filter(s => !s.given).sort((a, b) => b.len - a.len);
  let count = 0;
  (function rec(k) {
    if (count > 1) return;
    if (k === open.length) { count++; return; }
    const s = open[k];
    for (const w of bank) {
      if (used.has(w) || w.length !== s.len) continue;
      if (s.cells.some((c, i) => letters[c] && letters[c] !== w[i])) continue;
      const set = [];
      s.cells.forEach((c, i) => { if (!letters[c]) { letters[c] = w[i]; set.push(c); } });
      used.add(w);
      rec(k + 1);
      used.delete(w);
      set.forEach(c => { letters[c] = ''; });
      if (count > 1) return;
    }
  })(0);
  return count;
}

// ------------------------------------------------------------------ engine
let medium;
test('engine: 24 medium puzzles build and verify', () => {
  medium = makePuzzles(BASE, 24, 'm');
  medium.forEach(p => assert(E.verifyPuzzle(p), 'verify failed ' + p.id));
  const avg = medium.reduce((a, p) => a + p.stats.words, 0) / medium.length;
  return 'avg ' + avg.toFixed(1) + ' words per grid';
});

test('engine: every grid run is a listed word and words are unique', () => {
  medium.forEach(p => {
    const slots = E.slotsFromGrid(p.grid, p.rows, p.cols);
    const runs = slots.map(s => s.cells.map(c => p.grid[c]).join('')).sort();
    const listed = p.words.map(w => w.w).sort();
    assert(JSON.stringify(runs) === JSON.stringify(listed), 'runs != words in ' + p.id);
    assert(new Set(listed).size === listed.length, 'duplicate word in ' + p.id);
    assert(p.words.some(w => w.given), 'no starter in ' + p.id);
  });
});

test('engine: an independent brute-force solver finds exactly one solution', () => {
  medium.slice(0, 12).forEach(p => { const n = bruteCount(p); assert(n === 1, 'puzzle ' + p.id + ' has ' + n + ' solutions'); });
});

test('engine: grids stay inside the size limit for every difficulty', () => {
  ['easy', 'medium', 'hard'].forEach(d => {
    const s = Object.assign({}, BASE, { difficulty: d }), g = Layout.gridFor(s, d);
    makePuzzles(s, 4, d).forEach(p => assert(p.rows <= g.n && p.cols <= g.n, d + ' grid ' + p.rows + 'x' + p.cols + ' > ' + g.n));
  });
});

test('engine: same seed gives the same puzzle, different seeds differ', () => {
  const job = { title: 'T', words: FIXTURE[0].words, maxRows: 13, maxCols: 13, target: 24, minWords: 6, starters: 1, maxGivens: 4, attempts: 80, seed: 12345 };
  const a = E.generatePuzzle(job), b = E.generatePuzzle(Object.assign({}, job)), c = E.generatePuzzle(Object.assign({}, job, { seed: 999 }));
  assert(a.grid === b.grid, 'same seed differs');
  assert(a.grid !== c.grid, 'different seeds match');
});

test('engine: too few words reports an error instead of a bad puzzle', () => {
  const p = E.generatePuzzle({ title: 'T', words: ['CAT', 'DOG', 'OWL'], maxRows: 11, maxCols: 11, target: 16, minWords: 6, starters: 1, maxGivens: 4, attempts: 20, seed: 1 });
  assert(p.error === 'too-few', JSON.stringify(p));
});

test('engine: a hand-made ambiguous grid is detected', () => {
  // Two 3-letter spaces that don't cross: CAT and DOG can swap, so it is not unique
  // until one of them is printed as a starter.
  const p = { rows: 1, cols: 7, grid: 'CAT.DOG', words: [{ w: 'CAT', r: 0, c: 0, d: 'a' }, { w: 'DOG', r: 0, c: 4, d: 'a' }] };
  const slots = E.mapSlots(p);
  const res = E.solve(slots, ['CAT', 'DOG'], 7, [], 2, 1000);
  assert(res.solutions.length === 2, 'expected 2 solutions, got ' + res.solutions.length);
  const withStarter = E.solve(slots, ['CAT', 'DOG'], 7, [0], 2, 1000);
  assert(withStarter.solutions.length === 1, 'a starter should make it unique');
  p.words[0].given = true;
  assert(E.verifyPuzzle(p), 'verifyPuzzle should accept it with the starter');
  p.words[0].given = false;
  assert(!E.verifyPuzzle(p), 'verifyPuzzle should reject it without the starter');
});

// ------------------------------------------------------------------ words
test('words: JSON with chatter, fences, typed lines and cut-off parts', () => {
  const raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-words.json'), 'utf8');
  const r = Words.parse('Here you go!\n```json\n' + raw + '\n```\nTrees: oak, pine, elm, ash');
  assert(r.puzzles.length === 7 && r.puzzles[6].title === 'Trees', 'got ' + r.puzzles.map(p => p.title));
  const cut = Words.parse('{"puzzles":[{"title":"A","words":["X","Y"]},{"title":"B","words":["Z"');
  assert(cut.puzzles.length === 1 && cut.errors.length === 1, JSON.stringify(cut));
  const txt = Words.parse('Farm: cow, pig, hen\nKitchen:\nspoon\nfork\n\nice cream\nhot dog');
  assert(txt.puzzles.length === 3 && txt.puzzles[2].title === '' && txt.puzzles[2].words[0] === 'ice cream', JSON.stringify(txt));
});

test('words: cleaning, accents, repeats and short lists', () => {
  const o = { stripAccents: true, minLen: 3, maxLen: 13 };
  assert(Words.cleanWord('Crème brûlée', o).word === 'CREMEBRULEE', 'accents');
  assert(Words.cleanWord('ice-cream', o).word === 'ICECREAM', 'hyphen');
  assert(Words.cleanWord('Straße', o).word === 'STRASSE', 'eszett');
  assert(Words.cleanWord('R2D2', o).reason, 'digits');
  assert(Words.cleanWord('ab', o).reason, 'too short');
  assert(Words.cleanWord('supercalifragilistic', o).reason, 'too long');
  const prep = Words.prepare([{ title: 'A', words: 'one two three four five six seven eight nine'.split(' ') }, { title: 'B', words: 'one two three ten'.split(' ') }],
    { stripAccents: true, minLen: 3, maxLen: 13, noRepeats: true, minWords: 8, poolSize: 30 });
  assert(prep.puzzles.length === 1 && prep.report.repeats === 3 && prep.report.dropped.length === 1, JSON.stringify(prep.report));
  const pool = Words.prepare([{ title: '', words: Array.from({ length: 70 }, (_, i) => 'WORD' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + Math.floor(i / 26))) }],
    { stripAccents: true, minLen: 3, maxLen: 13, noRepeats: true, minWords: 8, poolSize: 30 });
  assert(pool.puzzles.length === 3, 'pool split into ' + pool.puzzles.length);
});

test('words: prompts batch themes and always ask for JSON', () => {
  const themes = Array.from({ length: 30 }, (_, i) => 'Theme ' + i);
  const ps = Words.buildPrompts({ themes, count: 30, wordsPer: 40, minLen: 3, maxLen: 13, audience: 'adults', language: 'English', topic: '', difficulty: 'medium' });
  assert(ps.length === Math.ceil(30 / Words.BATCH), ps.length + ' prompts');
  ps.forEach(p => assert(/\{"puzzles":\[/.test(p.text) && /Exactly 40/.test(p.text), 'prompt text'));
  const codes = new Set(ps.map(p => p.text.match(/Variation code (\w+)/)[1]));
  assert(codes.size === ps.length, 'variation codes repeat');
  assert(Words.suggestThemes(40, []).length === 40, 'theme ideas');
});

// ------------------------------------------------------------------ layout
test('layout: every trim, both styles, large print: all KDP checks pass', () => {
  const puzzles = medium.slice(0, 10);
  let pages = 0;
  KDP.TRIMS.forEach(t => {
    [{ gridStyle: 'open', largePrint: false }, { gridStyle: 'blocks', largePrint: true, bleed: true, marginPreset: 'minimum' }].forEach(o => {
      const s = Object.assign({}, BASE, o, { trim: t.key });
      const book = Layout.build(s, puzzles, puzzles[0]);
      const v = Layout.validate(book);
      pages += v.pagesChecked;
      assert(v.ok, t.key + ' ' + JSON.stringify(o) + ': ' + JSON.stringify({ minFont: v.minFont, minLine: v.minLine, outside: v.outside.slice(0, 2) }));
      assert(!book.stats.overflow.length, t.key + ' overflow ' + book.stats.overflow);
    });
  });
  return pages + ' pages scanned';
});

test('layout: margins follow the KDP gutter table as the page count grows', () => {
  const many = [];
  for (let i = 0; i < 180; i++) many.push(Object.assign({}, medium[i % medium.length], { id: i + 1 }));
  const book = Layout.build(BASE, many, null);
  assert(book.pageCount > 150 && book.margins.kdpInside === 0.5, 'pages ' + book.pageCount + ' inside ' + book.margins.kdpInside);
  const few = Layout.build(BASE, medium.slice(0, 20), null);
  assert(few.margins.kdpInside === 0.375, 'inside ' + few.margins.kdpInside);
});

test('layout: contents page lists every puzzle with the right page', () => {
  const book = Layout.build(BASE, medium.slice(0, 20), null);
  const contents = book.pages.filter(p => p.kind === 'contents');
  const entries = contents.flatMap(p => p.entries);
  const first = book.pages.find(p => p.kind === 'puzzle');
  const e1 = entries.find(e => /^1\./.test(e.label));
  assert(e1 && e1.page === first.number, 'entry page ' + (e1 && e1.page) + ' vs ' + first.number);
  assert(entries.length === 20 + 2, 'entries ' + entries.length);
});

test('layout: solutions per page falls back when letters would be under 7 pt', () => {
  const s = Object.assign({}, BASE, { trim: '5x8', solutionsPerPage: 6, gridSize: '17' });
  const plan = Layout.plan(s, medium, { rows: 17, cols: 17 });
  assert(plan.solutionLetterPt >= KDP.MIN_FONT_PT, 'solution letters ' + plan.solutionLetterPt);
  return 'using ' + plan.solutionsPerPage + ' per page at ' + plan.solutionLetterPt.toFixed(1) + ' pt';
});

// ------------------------------------------------------------------ pdf
test('pdf: exports with both fonts embedded and the right page size', () => {
  let done = false, err = null, out = null;
  const book = Layout.build(Object.assign({}, BASE, { trim: '6x9' }), medium.slice(0, 6), medium[0]);
  WF.Pdf.exportBook(book).then(r => { out = r; done = true; }, e => { err = e; done = true; });
  const deadline = Date.now() + 20000;
  // exportBook yields with setTimeout; spin the event loop synchronously is not possible, so
  // this test finishes in the async block below.
  global.__pdfCheck = { book, get: () => ({ done, err, out }) };
  return 'started';
});

(async function () {
  const t0 = Date.now();
  while (!global.__pdfCheck.get().done && Date.now() - t0 < 30000) await new Promise(r => setTimeout(r, 50));
  const { err, out } = global.__pdfCheck.get();
  test('pdf: finished', () => {
    assert(!err && out, 'export failed ' + err);
    const bytes = Buffer.from(out.doc.output('arraybuffer'));
    const text = bytes.toString('latin1');
    assert(/\/FontFile2/.test(text), 'no embedded TrueType font');
    assert(/Lato-Regular/.test(text) && /Lato-Bold/.test(text), 'font names missing');
    const box = text.match(/\/MediaBox \[([^\]]+)\]/);
    const nums = box[1].trim().split(/\s+/).map(Number);
    assert(Math.abs(nums[2] - 432) < 0.1 && Math.abs(nums[3] - 648) < 0.1, 'media box ' + box[1]);
    const pages = (text.match(/\/Type \/Page\b/g) || []).length;
    assert(pages === global.__pdfCheck.book.pageCount, 'pages ' + pages);
    return (bytes.length / 1024).toFixed(0) + ' KB, ' + pages + ' pages';
  });
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
