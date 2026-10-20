/*
 * qa.js — the acceptance checklist from spec 9, run headlessly.
 *
 *   node test/qa.js          full run
 *   node test/qa.js --quick  skip the 100-puzzle book and the slow grids
 *
 * The browser scripts are loaded through test/harness.js exactly as
 * index.html loads them, so this exercises the shipped files, not a copy.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { loadApp, ROOT } = require('./harness.js');

const QUICK = process.argv.includes('--quick');

let passed = 0, failed = 0;
const failures = [];

function check(name, fn) {
  let ok, detail = '';
  try {
    const r = fn();
    if (r === true || r === undefined) ok = true;
    else { ok = false; detail = String(r); }
  } catch (err) {
    ok = false;
    detail = (err && err.stack) || String(err);
  }
  if (ok) { passed++; console.log('  ✓ ' + name); }
  else {
    failed++; failures.push(name + (detail ? '\n      ' + detail.split('\n').join('\n      ') : ''));
    console.log('  ✗ ' + name + (detail ? '  — ' + detail.split('\n')[0] : ''));
  }
}
function section(t) { console.log('\n' + t); }

const w = loadApp({ pdf: true, preview: true });
const C = w.BinarioCore, K = w.KdpLayout, P = w.PdfExport, V = w.Preview;

/* --------------------------------------------------------------- helpers -- */

function buildBook(n, count, difficulty, seed) {
  const rng = C.makeRng(seed || 12345);
  const ctx = C.makeCtx(n);
  const seen = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    const tier = C.tierFor(i, count, difficulty);
    const p = C.generate(n, tier, { rng, ctx, seen, index: i + 1 });
    p.index = i + 1;
    p.requested = tier;
    out.push(p);
  }
  return out;
}

/**
 * A deliberately naive counter: enumerate every 0/1 assignment of the empty
 * cells and test each complete grid with checkSolution. No pruning at all, so
 * it shares nothing with countSolutions beyond the rules themselves — which is
 * the point. Exponential in the number of empties, so callers keep that small.
 */
function bruteCount(cells, n, cap) {
  const empties = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] === null) empties.push(i);
  if (empties.length > 20) throw new Error('bruteCount: ' + empties.length + ' empties is too many');
  const g = cells.slice();
  let found = 0;
  const total = 1 << empties.length;
  for (let mask = 0; mask < total; mask++) {
    for (let b = 0; b < empties.length; b++) g[empties[b]] = (mask >> b) & 1;
    if (C.checkSolution(g, n) === null && ++found >= cap) break;
  }
  return found;
}

/** A solution with `holes` cells blanked — small enough for bruteCount. */
function punch(solution, holes, rng) {
  const cells = Array.prototype.slice.call(solution);
  const order = [];
  for (let i = 0; i < cells.length; i++) order.push(i);
  rng.shuffle(order);
  for (let i = 0; i < holes; i++) cells[order[i]] = null;
  return cells;
}

/* ================================================================ CORRECTNESS */
section('Correctness (spec 9)');

const BOOK_N = 10;
const BOOK_COUNT = QUICK ? 20 : 100;
const bookStart = Date.now();
const book = buildBook(BOOK_N, BOOK_COUNT, 'mixed', 20260826);
const bookMs = Date.now() - bookStart;

check(`every one of ${BOOK_COUNT} puzzles has exactly one solution`, () => {
  for (const p of book) {
    const c = C.countSolutions(p.clues, p.n, 2);
    if (c !== 1) return `puzzle #${p.index} counted ${c} solutions`;
  }
  return true;
});

check('every solution satisfies all three rules (independent checker)', () => {
  for (const p of book) {
    const err = C.checkSolution(p.solution, p.n);
    if (err) return `puzzle #${p.index}: ${err}`;
  }
  return true;
});

check('the clues of every puzzle agree with its stated solution', () => {
  for (const p of book) {
    for (let i = 0; i < p.clues.length; i++) {
      if (p.clues[i] !== null && p.clues[i] !== p.solution[i]) return `puzzle #${p.index} cell ${i}`;
    }
  }
  return true;
});

check('classified difficulty matches the requested tier', () => {
  const ctx = C.makeCtx(BOOK_N);
  for (const p of book) {
    if (p.fellBack) return `puzzle #${p.index} fell back to ${p.difficulty} (asked ${p.requested})`;
    const got = C.classify(p.clues, p.n, ctx);
    if (got !== p.requested) return `puzzle #${p.index}: asked ${p.requested}, classifies as ${got}`;
  }
  return true;
});

check('mixed tiers are distributed 40% easy / 40% medium / 20% hard', () => {
  const tally = { easy: 0, medium: 0, hard: 0 };
  for (const p of book) tally[p.difficulty]++;
  const want = {
    easy: Math.round(BOOK_COUNT * 0.4),
    medium: Math.round(BOOK_COUNT * 0.4)
  };
  want.hard = BOOK_COUNT - want.easy - want.medium;
  for (const k of ['easy', 'medium', 'hard']) {
    if (tally[k] !== want[k]) return `${k}: got ${tally[k]}, want ${want[k]}`;
  }
  return true;
});

check('no two puzzles in one book share a solution', () => {
  const seen = new Set();
  for (const p of book) {
    const key = p.solution.join('');
    if (seen.has(key)) return `puzzle #${p.index} duplicates an earlier solution`;
    seen.add(key);
  }
  return true;
});

check('the human techniques only ever deduce the true solution', () => {
  // If any technique were unsound it could still fill a grid — just a different
  // one. Solve each puzzle and compare cell by cell against its own solution.
  const ctx = C.makeCtx(BOOK_N);
  for (const p of book) {
    const g = C.fromPuzzleArray(p.clues);
    if (!C.humanSolvable(g, p.n, 'hard', ctx)) return `puzzle #${p.index} did not solve`;
    const solved = ctx.solve;
    for (let i = 0; i < solved.length; i++) {
      if (solved[i] !== p.solution[i]) return `puzzle #${p.index} solved to a different grid at cell ${i}`;
    }
  }
  return true;
});

check('countSolutions agrees with an unpruned brute force (6×6 and 8×8)', () => {
  const rng = C.makeRng(4242);
  let sawUnique = 0, sawMultiple = 0;
  for (const n of [6, 8]) {
    for (let t = 0; t < 25; t++) {
      // Vary the hole count so the comparison covers both unique clue sets and
      // deliberately ambiguous ones.
      const holes = 4 + (t % 15);
      const cells = punch(C.fillSolution(n, rng), holes, rng);
      const a = C.countSolutions(cells, n, 4);
      const b = bruteCount(cells, n, 4);
      if (a !== b) return `${n}×${n} with ${holes} holes: countSolutions=${a}, brute=${b}`;
      if (a === 1) sawUnique++; else if (a > 1) sawMultiple++;
    }
  }
  if (!sawUnique || !sawMultiple) {
    return `the comparison never saw both cases (unique=${sawUnique}, multiple=${sawMultiple})`;
  }
  return true;
});

check('real carved puzzles agree with brute force once shrunk to its range', () => {
  const rng = C.makeRng(9090);
  const ctx = C.makeCtx(6);
  for (let t = 0; t < 10; t++) {
    const sol = C.fillSolution(6, rng);
    const cells = C.toPuzzleArray(C.makePuzzle(sol, 6, 'easy', rng, ctx));

    // Hand back solution values until few enough cells are empty to enumerate.
    // Adding correct clues can never introduce a solution, so a genuinely
    // unique puzzle must still count as 1 under both counters.
    const empties = [];
    for (let i = 0; i < cells.length; i++) if (cells[i] === null) empties.push(i);
    rng.shuffle(empties);
    while (empties.length > 16) { const idx = empties.pop(); cells[idx] = sol[idx]; }

    const a = C.countSolutions(cells, 6, 4);
    const b = bruteCount(cells, 6, 4);
    if (a !== b) return `case ${t}: countSolutions=${a}, brute=${b}`;
    if (a !== 1) return `case ${t}: a carved puzzle should stay unique, got ${a}`;
  }
  return true;
});

check('a complete valid grid counts as exactly one solution', () => {
  const rng = C.makeRng(31337);
  for (const n of [6, 8, 10]) {
    const sol = C.fillSolution(n, rng);
    const c = C.countSolutions(C.toPuzzleArray(sol), n, 3);
    if (c !== 1) return `${n}×${n} full grid counted ${c}`;
  }
  return true;
});

check('an empty grid has many solutions (counter is not trivially returning 1)', () => {
  const empty = new Array(36).fill(null);
  const c = C.countSolutions(empty, 6, 2);
  if (c !== 2) return `expected the cap (2), got ${c}`;
  return true;
});

check('every grid size 6–14 generates at each tier', () => {
  const sizes = QUICK ? [6, 8, 10] : [6, 8, 10, 12, 14];
  for (const n of sizes) {
    const ctx = C.makeCtx(n);
    const rng = C.makeRng(900 + n);
    for (const tier of ['easy', 'medium', 'hard']) {
      const p = C.generate(n, tier, { rng, ctx, seen: new Set() });
      if (C.checkSolution(p.solution, n)) return `${n}×${n} ${tier}: invalid solution`;
      if (C.countSolutions(p.clues, n, 2) !== 1) return `${n}×${n} ${tier}: not unique`;
      if (!p.fellBack && p.difficulty !== tier) return `${n}×${n}: asked ${tier}, got ${p.difficulty}`;
    }
  }
  return true;
});

check('the hard-coded 6×6 How-to-Play example is valid and unique', () => {
  const ex = P.EXAMPLE;
  const err = C.checkSolution(ex.solution, ex.n);
  if (err) return 'solution invalid: ' + err;
  for (let i = 0; i < ex.clues.length; i++) {
    if (ex.clues[i] !== null && ex.clues[i] !== ex.solution[i]) return `clue ${i} contradicts the solution`;
  }
  const c = C.countSolutions(ex.clues, ex.n, 2);
  if (c !== 1) return `example admits ${c} solutions`;
  return true;
});

/* ============================================================ KDP COMPLIANCE */
section('KDP compliance (spec 9)');

check('the trim table matches spec 4.1 (16 sizes, correct page ceilings)', () => {
  if (K.TRIMS.length !== 16) return `expected 16 trims, found ${K.TRIMS.length}`;
  const spot = { '8.5x11': 590, '8.5x8.5': 590, '8.25x6': 800, '8.25x8.25': 800, 'a4': 780, '6x9': 828 };
  for (const id in spot) {
    const t = K.trimById(id);
    if (!t) return `missing trim ${id}`;
    if (t.max !== spot[id]) return `${id}: max ${t.max}, expected ${spot[id]}`;
    if (t.min !== 24) return `${id}: min ${t.min}, expected 24`;
  }
  if (K.DEFAULT_TRIM !== '8.5x11') return 'default trim should be 8.5 × 11';
  return true;
});

check('gutter tiers follow spec 4.3', () => {
  const cases = [[24, 0.375], [150, 0.375], [151, 0.5], [300, 0.5], [301, 0.625],
                 [500, 0.625], [501, 0.75], [700, 0.75], [701, 0.875], [828, 0.875]];
  for (const [pages, want] of cases) {
    if (K.gutterMin(pages) !== want) return `${pages} pages -> ${K.gutterMin(pages)}, expected ${want}`;
  }
  return true;
});

check('margins mirror: gutter left on recto, right on verso (spec 4.5)', () => {
  for (const pageCount of [24, 120, 210, 400, 820]) {
    const inside = K.gutterMin(pageCount) + 0.25;
    for (const n of [1, 2, 7, 8]) {
      const m = K.pageMargins(n, pageCount);
      const recto = n % 2 === 1;
      if (recto && (m.left !== inside || m.right !== 0.5)) return `p${n}/${pageCount} recto wrong`;
      if (!recto && (m.right !== inside || m.left !== 0.5)) return `p${n}/${pageCount} verso wrong`;
      if (m.top !== 0.65 || m.bottom !== 0.65) return `p${n} top/bottom wrong`;
    }
  }
  return true;
});

check('layout matches the worked examples in spec 5.3', () => {
  const m = K.pageMargins(1, 120);
  const near = (a, b) => Math.abs(a - b) < 0.0005;
  const A = id => K.layoutPage({ trimW: 8.5, trimH: 11, margins: m, perPage: id, n: 10 });
  if (!near(A(1).contentW, 7.375)) return 'contentW 8.5×11';
  if (!near(A(1).contentH, 8.90)) return 'contentH 8.5×11';
  // EDGE_PAD (0.08) inset from the safe area on every density; 1/page still hits MAX_CELL.
  if (!near(A(1).cell, 0.600)) return `1/page cell ${A(1).cell}`;
  if (!near(A(2).cell, 0.3895)) return `2/page cell ${A(2).cell}`;
  if (!near(A(4).cell, 0.33525)) return `4/page cell ${A(4).cell}`;

  const B = id => K.layoutPage({ trimW: 6, trimH: 9, margins: m, perPage: id, n: 10 });
  if (!near(B(2).contentW, 4.875)) return 'contentW 6×9';
  if (!near(B(2).contentH, 6.90)) return 'contentH 6×9';
  if (!near(B(2).cell, 0.2895)) return `6×9 2/page cell ${B(2).cell}`;
  if (!near(B(4).cell, 0.21025)) return `6×9 4/page cell ${B(4).cell}`;
  return true;
});

check('puzzle grids keep a side inset from the safe area at every density', () => {
  const m = K.pageMargins(1, 120);
  for (const perPage of [1, 2, 4]) {
    for (const n of [6, 8, 10, 12, 14]) {
      const L = K.layoutPage({ trimW: 8.5, trimH: 11, margins: m, perPage, n });
      const sideGap = (L.blockW - L.gridSize) / 2;
      if (sideGap + 1e-9 < K.EDGE_PAD) {
        return `${perPage}/page ${n}×${n}: side gap ${sideGap.toFixed(4)}" < EDGE_PAD ${K.EDGE_PAD}"`;
      }
    }
  }
  return true;
});

check('6×9 + 4 per page + 10×10 is blocked with the MIN_CELL message (spec 9)', () => {
  const plan = K.planBook({ trimId: '6x9', n: 10, perPage: 4, count: 100, howTo: true });
  if (plan.ok) return 'plan reported ok, expected it to be blocked';
  if (!plan.errors.some(e => e.includes('too small to print'))) return 'missing the cell-too-small message';
  return true;
});

check('clampPerPage steps 5.06×7.81 + 10×10 + 2/page down to 1/page', () => {
  const opts = { trimId: '5.06x7.81', n: 10, perPage: 2, count: 100, howTo: true };
  const fit = K.fittingPerPages(opts);
  if (fit[2]) return 'expected 2/page to fail MIN_CELL on 5.06×7.81';
  if (!fit[1]) return 'expected 1/page to fit on 5.06×7.81';
  if (K.clampPerPage(opts) !== 1) return `clamp returned ${K.clampPerPage(opts)}, expected 1`;
  const plan = K.planBook({ ...opts, perPage: 1 });
  if (!plan.ok) return 'clamped 1/page plan should be KDP-ready: ' + plan.errors.join('; ');
  if (plan.puzzleLayout.cell < K.MIN_CELL) return `cell ${plan.puzzleLayout.cell} still below MIN_CELL`;
  return true;
});

check('clampGridSize steps 5.06×7.81 + 14×14 down to a printable grid', () => {
  const opts = { trimId: '5.06x7.81', n: 14, perPage: 1, count: 100, howTo: true };
  if (K.gridFitsTrim(opts, 14)) return 'expected 14×14 to fail on 5.06×7.81';
  const n = K.clampGridSize(opts);
  if (n >= 14) return `clampGridSize returned ${n}, expected smaller`;
  if (!K.gridFitsTrim(opts, n)) return `clamped grid ${n} still fails MIN_CELL`;
  const plan = K.planBook({ ...opts, n, perPage: K.clampPerPage({ ...opts, n }) });
  if (!plan.ok) return 'clamped plan should be KDP-ready: ' + plan.errors.join('; ');
  return true;
});

check('every shipped trim has at least one printable grid + perPage combo', () => {
  for (const t of K.TRIMS) {
    const n = K.clampGridSize({ trimId: t.id, n: 14, count: 100, howTo: true, perPage: 1 });
    const pp = K.clampPerPage({ trimId: t.id, n, count: 100, howTo: true, perPage: 4 });
    const plan = K.planBook({ trimId: t.id, n, perPage: pp, count: 100, howTo: true });
    if (!plan.ok) return `${t.id}: still not KDP-ready after clamps (${plan.errors.join('; ')})`;
  }
  return true;
});

check('clampPerPage leaves a printable density alone', () => {
  const opts = { trimId: '8.5x11', n: 10, perPage: 2, count: 100, howTo: true };
  if (K.clampPerPage(opts) !== 2) return 'should keep 2/page on 8.5×11';
  const fit = K.fittingPerPages(opts);
  if (!fit[1] || !fit[2] || !fit[4]) return 'all densities should fit on 8.5×11 with 10×10';
  return true;
});

check('a page count over the trim maximum is a hard error (spec 4.6)', () => {
  const plan = K.planBook({ trimId: '8.5x11', n: 12, perPage: 1, count: 500, howTo: true });
  if (plan.pageCount <= 590) return `expected over 590 pages, got ${plan.pageCount}`;
  if (plan.ok) return 'plan reported ok despite exceeding the maximum';
  if (!plan.errors.some(e => e.includes('over the'))) return 'missing the page-limit message';
  // ...and a book that fits must not trip the same error.
  const fine = K.planBook({ trimId: '8.5x11', n: 10, perPage: 2, count: 100, howTo: true });
  if (!fine.ok) return 'a 72-page book was wrongly rejected';
  return true;
});

check('page counts are always >= 24 and even, for many settings', () => {
  for (const trimId of ['8.5x11', '6x9', '7x10', '8.25x6']) {
    for (const n of [6, 8, 10, 12, 14]) {
      for (const perPage of [1, 2, 4]) {
        for (const count of [10, 11, 37, 100, 250]) {
          for (const howTo of [true, false]) {
            const plan = K.planBook({ trimId, n, perPage, count, howTo });
            if (plan.pageCount < 24) return `${trimId}/${n}/${perPage}/${count}: ${plan.pageCount} pages`;
            if (plan.pageCount % 2 !== 0) return `${trimId}/${n}/${perPage}/${count}: odd (${plan.pageCount})`;
            if (plan.gutter !== K.gutterMin(plan.pageCount)) return 'gutter tier does not match final page count';
            if (plan.inside !== plan.gutter + 0.25) return 'inside margin is not gutter + 0.25';
          }
        }
      }
    }
  }
  return true;
});

check('the SOLUTIONS divider always lands on a recto page', () => {
  for (const n of [6, 10, 14]) {
    for (const perPage of [1, 2, 4]) {
      for (const count of [10, 23, 50, 100, 137]) {
        for (const howTo of [true, false]) {
          const plan = K.planBook({ trimId: '8.5x11', n, perPage, count, howTo });
          const d = plan.pages.find(p => p.kind === 'divider');
          if (!d) return 'no divider page';
          if (d.number % 2 !== 1) return `divider on page ${d.number} (verso)`;
        }
      }
    }
  }
  return true;
});

check('every puzzle and every solution appears exactly once in the plan', () => {
  for (const n of [8, 10, 12]) {
    for (const perPage of [1, 2, 4]) {
      const count = 47;
      const plan = K.planBook({ trimId: '8.5x11', n, perPage, count, howTo: true });
      for (const kind of ['puzzles', 'solutions']) {
        const seen = new Set();
        for (const pg of plan.pages) {
          if (pg.kind !== kind) continue;
          for (let i = pg.from; i <= pg.to; i++) {
            if (seen.has(i)) return `${kind} #${i} appears twice`;
            seen.add(i);
          }
        }
        if (seen.size !== count) return `${kind}: ${seen.size} of ${count} placed`;
      }
    }
  }
  return true;
});

check('front matter carries no page number, and blanks stay blank', () => {
  const plan = K.planBook({ trimId: '8.5x11', n: 10, perPage: 2, count: 40, howTo: true });
  const kinds = plan.pages.map(p => p.kind).slice(0, 4).join(',');
  if (kinds !== 'title,howto,puzzles,puzzles') {
    return `expected title→howto→puzzles with no blanks, got ${kinds}`;
  }
  for (const pg of plan.pages) {
    if ((pg.kind === 'title' || pg.kind === 'howto' || pg.kind === 'blank') && pg.footer) {
      return `page ${pg.number} (${pg.kind}) should have no folio`;
    }
    if ((pg.kind === 'puzzles' || pg.kind === 'solutions' || pg.kind === 'divider') && !pg.footer) {
      return `page ${pg.number} (${pg.kind}) should show a page number`;
    }
  }
  return true;
});

/* ---- the produced PDF ---- */

function inflateStreams(buf) {
  const out = [];
  const s = buf.toString('latin1');
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endstream', start);
    if (end < 0) continue;
    const raw = Buffer.from(s.slice(start, end), 'latin1');
    try { out.push(zlib.inflateSync(raw).toString('latin1')); }
    catch (e) { out.push(raw.toString('latin1')); }
  }
  return out;
}

const PDF_CASES = [
  { trimId: '8.5x11', n: 10, perPage: 2, count: 12 },
  { trimId: '6x9', n: 8, perPage: 1, count: 10 },
  { trimId: '8.25x6', n: 8, perPage: 2, count: 10 }   // the one landscape trim
];
const built = PDF_CASES.map(cfg => {
  const plan = K.planBook({ ...cfg, howTo: true });
  const puzzles = buildBook(cfg.n, cfg.count, 'mixed', 555);
  const doc = P.build(plan, puzzles, { title: 'Binario Puzzles', subtitle: 'Logic Puzzles' });
  const buf = Buffer.from(doc.output('arraybuffer'));
  return { cfg, plan, puzzles, buf, text: buf.toString('latin1') };
});

check('PDF page size equals the trim size to within 0.001 in', () => {
  for (const b of built) {
    const boxes = [...new Set(b.text.match(/\/MediaBox\s*\[([^\]]*)\]/g) || [])];
    if (boxes.length !== 1) return `${b.cfg.trimId}: ${boxes.length} distinct MediaBox values`;
    const nums = boxes[0].match(/-?[\d.]+/g).map(Number);
    const wIn = nums[2] / 72, hIn = nums[3] / 72;
    if (Math.abs(wIn - b.plan.trim.w) > 0.001) return `${b.cfg.trimId}: width ${wIn} vs ${b.plan.trim.w}`;
    if (Math.abs(hIn - b.plan.trim.h) > 0.001) return `${b.cfg.trimId}: height ${hIn} vs ${b.plan.trim.h}`;
  }
  return true;
});

check('the PDF has exactly the planned number of pages', () => {
  for (const b of built) {
    const m = b.text.match(/\/Type\s*\/Pages[\s\S]{0,300}?\/Count\s+(\d+)/);
    if (!m) return `${b.cfg.trimId}: could not read /Count`;
    if (Number(m[1]) !== b.plan.pageCount) return `${b.cfg.trimId}: ${m[1]} pages, planned ${b.plan.pageCount}`;
  }
  return true;
});

check('the PDF has a bookmarks navigator for the main sections', () => {
  for (const b of built) {
    if (!/\/Outlines\s+\d+\s+0\s+R/.test(b.text)) {
      return `${b.cfg.trimId}: missing /Outlines dictionary`;
    }
    for (const label of ['Title page', 'How to play', 'Puzzles', 'Solutions']) {
      if (!b.text.includes(label)) return `${b.cfg.trimId}: bookmark "${label}" missing`;
    }
  }
  return true;
});

check('all fonts are embedded, and no standard-14 font is referenced (spec 4.7)', () => {
  for (const b of built) {
    if (!/FontFile2/.test(b.text)) return `${b.cfg.trimId}: no embedded font programme`;
    for (const bad of ['Helvetica', 'Times-Roman', 'Courier', 'Symbol', 'ZapfDingbats', 'Arial']) {
      if (b.text.includes('/BaseFont /' + bad) || b.text.includes('/BaseFont/' + bad)) {
        return `${b.cfg.trimId}: references non-embedded ${bad}`;
      }
    }
    const bases = [...new Set(b.text.match(/\/BaseFont\s*\/([A-Za-z0-9+#-]+)/g) || [])];
    if (!bases.length) return `${b.cfg.trimId}: no /BaseFont at all`;
    if (!bases.every(x => /NotoSans/.test(x))) return `${b.cfg.trimId}: unexpected fonts ${bases.join(', ')}`;
  }
  return true;
});

check('content uses pure black and pure white only, with no transparency (spec 4.8)', () => {
  for (const b of built) {
    for (const stream of inflateStreams(b.buf)) {
      // grey operators
      for (const m of stream.matchAll(/(-?[\d.]+)\s+(g|G)[\s\n]/g)) {
        const v = Number(m[1]);
        if (v !== 0 && v !== 1) return `${b.cfg.trimId}: grey level ${v}`;
      }
      // rgb operators
      for (const m of stream.matchAll(/(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(rg|RG)[\s\n]/g)) {
        const c = [Number(m[1]), Number(m[2]), Number(m[3])];
        if (!c.every(v => v === 0 || v === 1)) return `${b.cfg.trimId}: rgb ${c.join(',')}`;
        if (!(c.every(v => v === 0) || c.every(v => v === 1))) return `${b.cfg.trimId}: non-neutral rgb ${c.join(',')}`;
      }
      if (/\/CA\s+0?\.\d/.test(stream) || /\/ca\s+0?\.\d/.test(stream)) {
        return `${b.cfg.trimId}: transparency in a content stream`;
      }
    }
    if (/\/SMask\s*\/?[^N]/.test(b.text) && !/\/SMask\s*\/None/.test(b.text)) {
      return `${b.cfg.trimId}: soft mask present`;
    }
    if (/\/ca\s+0?\.\d/.test(b.text) || /\/CA\s+0?\.\d/.test(b.text)) {
      return `${b.cfg.trimId}: transparency in an ExtGState`;
    }
  }
  return true;
});

check('nothing is drawn as a raster image (spec 5.5 — vectors only)', () => {
  for (const b of built) {
    if (/\/Subtype\s*\/Image/.test(b.text)) return `${b.cfg.trimId}: contains an image XObject`;
    if (/\/DCTDecode|\/JPXDecode/.test(b.text)) return `${b.cfg.trimId}: contains encoded image data`;
  }
  return true;
});

check('every drawn element stays inside the page margins', () => {
  // Re-derive the geometry the exporter uses and bound-check it, on both a
  // recto and a verso page of each layout.
  for (const b of built) {
    const { plan } = b;
    const trim = plan.trim;
    for (const pg of plan.pages) {
      const m = pg.margins;
      const boxes = [];
      const L = pg.kind === 'solutions' ? plan.solutionLayout : plan.puzzleLayout;
      const originY = pg.kind === 'solutions' ? m.top : m.top + K.HEADER_H;

      if (pg.kind === 'puzzles' || pg.kind === 'solutions') {
        for (let slot = 0; slot + pg.from <= pg.to; slot++) {
          const col = slot % L.cols, row = (slot / L.cols) | 0;
          const bx = m.left + col * (L.blockW + K.GAP);
          const by = originY + row * (L.blockH + K.GAP);
          const gx = bx + (L.blockW - L.gridSize) / 2;
          const gy = by + (L.blockH - L.captionH - L.gridSize) / 2;
          boxes.push([gx, gy, gx + L.gridSize, gy + L.gridSize]);
          if (L.captionH > 0) boxes.push([bx, gy + L.gridSize, bx + L.blockW, gy + L.gridSize + 0.20]);
        }
        if (pg.kind === 'puzzles') boxes.push([m.left, m.top + 0.06, trim.w - m.right, m.top + 0.24]);
      }
      if (pg.footer) boxes.push([m.left, trim.h - m.bottom - 0.24, trim.w - m.right, trim.h - m.bottom]);

      const EPS = 1e-6;
      for (const [x0, y0, x1, y1] of boxes) {
        if (x0 < m.left - EPS) return `${b.cfg.trimId} p${pg.number} (${pg.kind}): crosses the left margin`;
        if (x1 > trim.w - m.right + EPS) return `${b.cfg.trimId} p${pg.number} (${pg.kind}): crosses the right margin`;
        if (y0 < m.top - EPS) return `${b.cfg.trimId} p${pg.number} (${pg.kind}): crosses the top margin`;
        if (y1 > trim.h - m.bottom + EPS) return `${b.cfg.trimId} p${pg.number} (${pg.kind}): crosses the bottom margin`;
      }

      // spec 4.3 hard minimums, and the gutter on the binding side
      const inside = K.gutterMin(plan.pageCount) + 0.25;
      const gutter = pg.number % 2 === 1 ? m.left : m.right;
      if (gutter + 1e-9 < K.gutterMin(plan.pageCount)) return `p${pg.number}: gutter below the KDP minimum`;
      if (Math.abs(gutter - inside) > 1e-9) return `p${pg.number}: gutter is not the value the plan promises`;
      for (const v of [m.top, m.bottom, pg.number % 2 === 1 ? m.right : m.left]) {
        if (v < 0.25) return `p${pg.number}: a margin is under the 0.25 in minimum`;
      }
    }
  }
  return true;
});

check('the 4-page sample keeps mirrored margins in its own page order (spec 8)', () => {
  const b = built[0];
  const pages = P.samplePages(b.plan);
  if (pages.length !== 4) return `sample has ${pages.length} pages`;
  if (pages.map(p => p.kind).join(',') !== 'title,howto,puzzles,solutions') {
    return 'sample pages are not title/howto/puzzles/solutions';
  }
  for (let i = 0; i < pages.length; i++) {
    const want = (i + 1) % 2 === 1 ? 'left' : 'right';
    if (pages[i].margins.gutterSide !== want) return `sample page ${i + 1}: gutter on the ${pages[i].margins.gutterSide}`;
  }
  const doc = P.build(b.plan, b.puzzles, { title: 'Binario Puzzles' }, pages);
  const text = Buffer.from(doc.output('arraybuffer')).toString('latin1');
  const m = text.match(/\/Type\s*\/Pages[\s\S]{0,300}?\/Count\s+(\d+)/);
  if (!m || Number(m[1]) !== 4) return 'sample PDF is not 4 pages';
  return true;
});

check('the exported file name is a safe slug', () => {
  const trim = K.trimById('8.5x11');
  const name = P.fileName({ title: 'Bí kíp Binario: Tập 2 / 2024!' }, trim);
  if (!/^[a-z0-9_.\-x]+\.pdf$/.test(name)) return `unsafe file name: ${name}`;
  if (!name.includes('8.5x11')) return `file name lost the trim size: ${name}`;
  return true;
});

/* =============================================================== OFFLINE / UI */
section('Offline and usability (spec 9)');

const SHIPPED = ['index.html', 'css/style.css', 'js/binario-core.js', 'js/kdp-layout.js',
                 'js/pdf-export.js', 'js/preview.js', 'js/app.js'];

check('every shipped file exists, plus the two vendor files', () => {
  for (const f of SHIPPED.concat(['vendor/jspdf.umd.min.js', 'vendor/font-notosans.js'])) {
    if (!fs.existsSync(path.join(ROOT, f))) return `missing ${f}`;
  }
  return true;
});

check('no external URL is referenced anywhere (spec 9 — zero network requests)', () => {
  for (const f of SHIPPED) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // Ignore the xmlns identifier, which is a name and never fetched.
    const cleaned = src.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
    const hits = cleaned.match(/\b(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/gi);
    if (hits) return `${f} references ${hits[0]}`;
  }
  return true;
});

check('no ES modules, fetch, Worker or localStorage in the shipped code (spec 2)', () => {
  for (const f of SHIPPED) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (/<script[^>]*type=["']module["']/.test(src)) return `${f} uses a module script`;
    if (/^\s*(import|export)\s/m.test(src)) return `${f} uses import/export`;
    if (/\bfetch\s*\(/.test(src)) return `${f} calls fetch()`;
    if (/\bXMLHttpRequest\b/.test(src)) return `${f} uses XMLHttpRequest`;
    if (/new\s+Worker\s*\(/.test(src)) return `${f} creates a Worker`;
    if (/\blocalStorage\b|\bsessionStorage\b/.test(src)) return `${f} touches web storage`;
    if (/@font-face/.test(src)) return `${f} declares @font-face`;
  }
  return true;
});

check('index.html loads the scripts as classic tags in dependency order', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const order = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const want = ['vendor/jspdf.umd.min.js', 'vendor/font-notosans.js', 'js/binario-core.js',
                'js/kdp-layout.js', 'js/pdf-export.js', 'js/preview.js', 'js/app.js'];
  if (order.join(',') !== want.join(',')) return `got ${order.join(', ')}`;
  return true;
});

check('the form has exactly the eight fields from spec 6.2', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));
  const ids = [...form.matchAll(/<(?:input|select)[^>]*\bid="(f-[^"]+)"/g)].map(m => m[1]);
  const radios = /name="perpage"/.test(form);
  const want = ['f-title', 'f-subtitle', 'f-trim', 'f-size', 'f-diff', 'f-count', 'f-howto'];
  for (const id of want) if (!ids.includes(id)) return `missing field ${id}`;
  const extra = ids.filter(i => !want.includes(i));
  if (extra.length) return `unexpected extra fields: ${extra.join(', ')}`;
  if (!radios) return 'missing the puzzles-per-page radios';
  return true;
});

check('the preview renders every page kind, before any puzzle exists', () => {
  const plan = K.planBook({ trimId: '8.5x11', n: 10, perPage: 2, count: 60, howTo: true });
  for (const kind of ['title', 'howto', 'puzzles', 'divider', 'solutions']) {
    const page = V.firstPageOfKind(plan, kind);
    if (!page) return `plan has no ${kind} page`;
    const svg = V.renderPageSvg(plan, null, page, { title: 'T', subtitle: 'S' });
    if (!/^<svg[\s\S]*<\/svg>$/.test(svg)) return `${kind}: not a complete SVG`;
    if (!svg.includes('safe area')) return `${kind}: safe-area guide missing`;
    if ((kind === 'puzzles' || kind === 'solutions') && !svg.includes('<circle')) {
      return `${kind}: no circles drawn`;
    }
  }
  // Padding blanks only appear when the book needs them (≥24 / even). Use a
  // tiny count so the plan still has a blank we can render.
  const padded = K.planBook({ trimId: '8.5x11', n: 10, perPage: 4, count: 10, howTo: true });
  const blank = V.firstPageOfKind(padded, 'blank');
  if (!blank) return 'padded plan has no blank page';
  const blankSvg = V.renderPageSvg(padded, null, blank, {});
  if (!blankSvg.includes('blank page')) return 'blank preview missing its label';
  return true;
});

check('the preview uses the same cell size as the PDF', () => {
  const plan = K.planBook({ trimId: '7x10', n: 12, perPage: 2, count: 40, howTo: true });
  const page = V.firstPageOfKind(plan, 'puzzles');
  const svg = V.renderPageSvg(plan, null, page, {});
  const r = plan.puzzleLayout.cell * K.CIRCLE_R_RATIO;
  if (!svg.includes('r="' + (Math.round(r * 10000) / 10000) + '"')) {
    return 'circle radius in the preview does not match the layout';
  }
  return true;
});

check('the summary line reports the same numbers as the plan', () => {
  const plan = K.planBook({ trimId: '8.5x11', n: 10, perPage: 2, count: 100, howTo: true });
  const line = K.summaryLine(plan);
  if (!line.includes(plan.pageCount + ' pages')) return `page count missing from: ${line}`;
  if (!line.includes('inside margin 0.625"')) return `inside margin missing from: ${line}`;
  if (!line.includes('✅')) return 'a valid plan should read as compliant';
  return true;
});

if (!QUICK) {
  check(`100 × 10×10 puzzles generate in under 20 s (took ${(bookMs / 1000).toFixed(1)} s)`, () => {
    if (bookMs > 20000) return `${(bookMs / 1000).toFixed(1)} s`;
    return true;
  });
}

/* ------------------------------------------------------------------ report -- */
console.log('\n' + '-'.repeat(64));
console.log(`${passed} passed, ${failed} failed` + (QUICK ? '  (quick run)' : ''));
if (failed) {
  console.log('\nFailures:\n');
  for (const f of failures) console.log('  • ' + f + '\n');
}
process.exit(failed ? 1 : 0);
