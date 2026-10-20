/*
 * run-tests.js: automated checks for the spec's acceptance list (engine, layout, PDF).
 *
 *   node tests/run-tests.js           (quick: ~30 s)
 *   node tests/run-tests.js --full    (more puzzles per difficulty)
 *
 * The browser side (file://, workers, progress, Cancel, download) is covered by
 * tests/browser-check.js.
 */
'use strict';
const env = require('./node-env');
['lib/jspdf.umd.min.js', 'js/fonts.js', 'js/generator.js', 'js/kdp.js', 'js/layout.js', 'js/pdf.js'].forEach(env.load);

const E = SS.engine, KDP = SS.KDP, Layout = SS.Layout;
const FULL = process.argv.includes('--full');
let passed = 0, failed = 0;

function test(name, fn) {
  const t0 = Date.now();
  try {
    const note = fn();
    passed++;
    console.log('PASS ' + name + (note ? ' - ' + note : '') + ' (' + (Date.now() - t0) + ' ms)');
  } catch (e) {
    failed++;
    console.log('FAIL ' + name + ' - ' + (e && e.message || e));
  }
}
async function testAsync(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    passed++;
    console.log('PASS ' + name + (note ? ' - ' + note : '') + ' (' + (Date.now() - t0) + ' ms)');
  } catch (e) {
    failed++;
    console.log('FAIL ' + name + ' - ' + (e && e.message || e));
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const DEFAULT_SETTINGS = {
  trim: '8.5x11', bleed: false, marginPreset: 'comfortable', count: 50, difficulty: 'medium', perPage: 1,
  includeSolutions: true, solutionsPerPage: 4, pageNumbers: true, shadeShared: true, howToPlay: true,
  titlePrefix: 'Puzzle', seed: '', symmetric: true
};

// ------------------------------------------------------------------ geometry
test('geometry: 369 active cells, 72 inactive, 131 units', () => {
  let active = 0;
  for (let c = 0; c < E.SIZE; c++) active += E.active[c];
  assert(active === 369, 'active ' + active);
  assert(E.SIZE - active === 72, 'inactive ' + (E.SIZE - active));
  assert(E.UNIT_COUNT === 131, 'units ' + E.UNIT_COUNT);
  const shared = E.unitInfo.filter(u => u.kind === 'box' && u.grids.length === 2).length;
  assert(shared === 4, 'shared boxes ' + shared);
  const origins = E.GRIDS.map(g => g.name + '(' + g.r + ',' + g.c + ')').join(' ');
  assert(origins === 'TL(0,0) TR(0,12) C(6,6) BL(12,0) BR(12,12)', origins);
});

// ------------------------------------------------------------------ generator
const perDiff = FULL ? 60 : 15;
const RANGES = { easy: [150, 170], medium: [125, 149], hard: [110, 125] };
const generated = {};
['easy', 'medium', 'hard', 'expert'].forEach(diff => {
  [true, false].forEach(sym => {
    test(`generate ${perDiff} ${diff} (${sym ? 'symmetric' : 'free'}): unique, valid, graded, in range`, () => {
      const list = [];
      const seen = new Set();
      let totalGivens = 0, maxMs = 0;
      for (let i = 0; i < perDiff; i++) {
        const t0 = Date.now();
        const p = E.generatePuzzle({ difficulty: diff, symmetric: sym, seed: E.hashString('t|' + diff + '|' + sym + '|' + i) });
        maxMs = Math.max(maxMs, Date.now() - t0);
        const g = E.fromString441(p.givens), s = E.fromString441(p.solution);
        assert(p.givens.length === 441 && p.solution.length === 441, 'string length');
        assert(E.isValidSolution(s), 'solution breaks a unit');
        for (let c = 0; c < 441; c++) {
          if (!E.active[c]) assert(p.givens[c] === '.' && p.solution[c] === '.', 'inactive marker');
          else if (g[c]) assert(g[c] === s[c], 'given != solution');
          if (sym && E.active[c]) assert((g[c] > 0) === (g[440 - c] > 0), 'not symmetric');
        }
        const a = E.countSolutionsIndependent(g, 2, 5e6), b = E.countSolutions(g, 2);
        assert(!a.aborted && a.count === 1, 'independent solver: ' + a.count + ' solutions');
        assert(!b.aborted && b.count === 1, 'propagation solver: ' + b.count + ' solutions');
        const grade = E.grade(g);
        assert(grade.difficulty === diff, 'graded ' + grade.difficulty);
        if (RANGES[diff]) assert(grade.givens >= RANGES[diff][0] - 1 && grade.givens <= RANGES[diff][1], 'givens ' + grade.givens);
        assert(!seen.has(p.givens), 'duplicate puzzle');
        seen.add(p.givens);
        totalGivens += grade.givens;
        list.push(p);
      }
      generated[diff + sym] = list;
      return 'avg givens ' + (totalGivens / perDiff).toFixed(1) + ', slowest ' + maxMs + ' ms';
    });
  });
});

test('solvers agree on non-unique and broken grids', () => {
  const p = E.generatePuzzle({ difficulty: 'expert', symmetric: false, seed: 77 });
  const rng = E.makeRng(5);
  for (let k = 1; k <= 30; k++) {
    const g = E.fromString441(p.givens);
    const filled = [];
    for (let c = 0; c < 441; c++) if (g[c] > 0) filled.push(c);
    rng.shuffle(filled);
    for (let r = 0; r < (k % 6) + 1; r++) g[filled[r]] = 0;
    if (k % 5 === 0) g[filled[10]] = g[filled[10]] % 9 + 1; // corrupt a given
    const a = E.countSolutionsIndependent(g, 2, 5e6).count, b = E.countSolutions(g, 2).count;
    assert(a === b, 'disagree: ' + a + ' vs ' + b);
  }
});

test('same seed + settings = identical puzzles', () => {
  const a = E.generatePuzzle({ difficulty: 'hard', symmetric: true, seed: 12345 });
  const b = E.generatePuzzle({ difficulty: 'hard', symmetric: true, seed: 12345 });
  const c = E.generatePuzzle({ difficulty: 'hard', symmetric: true, seed: 12346 });
  assert(a.givens === b.givens && a.solution === b.solution, 'not deterministic');
  assert(a.givens !== c.givens, 'different seeds gave the same puzzle');
});

test('mixed difficulty is ordered Easy to Expert', () => {
  const order = [];
  for (let i = 0; i < 37; i++) order.push(Layout.LEVELS.indexOf(Layout.difficultyForIndex(i, 37, 'mixed')));
  for (let i = 1; i < order.length; i++) assert(order[i] >= order[i - 1], 'not ascending at ' + i);
  assert(order[0] === 0 && order[36] === 3, 'does not span Easy..Expert');
});

// ------------------------------------------------------------------ layout
const pool = [].concat(generated['mediumtrue'] || [], generated['hardtrue'] || []);
function puzzles(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Object.assign({}, pool[i % pool.length], { id: i + 1 }));
  return out;
}

['8.5x11', '6x9', '8.27x11.69'].forEach(trim => {
  test(`layout ${trim}: every page inside live area, fonts >= 7 pt, lines >= 0.75 pt`, () => {
    let pages = 0;
    [false, true].forEach(bleed => ['comfortable', 'minimum'].forEach(preset => [1, 2].forEach(pp => [1, 2, 4, 6].forEach(sp => {
      const s = Object.assign({}, DEFAULT_SETTINGS, { trim, bleed, marginPreset: preset, perPage: pp, solutionsPerPage: sp, count: 12 });
      const book = Layout.build(s, puzzles(12));
      const v = Layout.validate(book);
      assert(v.ok, JSON.stringify({ bleed, preset, pp, sp, minFont: v.minFont, minLine: v.minLine, outside: v.outside[0] }));
      if (book.plan.perPage === 2) assert(book.plan.puzzleDigitPt >= 9, '2-up digits under 9 pt');
      pages += v.pagesChecked;
    }))));
    return pages + ' pages checked';
  });
});

test('every trim (incl. landscape): copyright, How to Play, headers and solutions stay inside the live area', () => {
  let checked = 0;
  KDP.TRIMS.forEach(t => [false, true].forEach(bleed => [false, true].forEach(pageNumbers => ['comfortable', 'minimum'].forEach(preset => {
    const s = Object.assign({}, DEFAULT_SETTINGS, {
      trim: t.key, bleed, pageNumbers, marginPreset: preset, howToPlay: true, count: 8,
      copyrightPage: true, bookTitle: 'Samurai Sudoku for Adults: 8 Brain-Busting Puzzles', copyrightHolder: 'Puzzle Press LLC',
      copyrightYear: 2026, copyrightNotes: 'ISBN: 979-8-000000-00-0\nFirst edition\nwww.example.com',
      difficulty: 'mixed', solutionsPerPage: 6, perPage: 2, titlePrefix: 'Brain Teaser Challenge'
    });
    const v = Layout.validate(Layout.build(s, puzzles(8)));
    assert(v.ok, t.key + ' bleed=' + bleed + ' pn=' + pageNumbers + ' ' + preset + ': ' + JSON.stringify(v.outside[0] || { minFont: v.minFont }));
    checked += v.pagesChecked;
  }))));
  return checked + ' pages on ' + KDP.TRIMS.length + ' trims';
});

test('copyright page: page 1, no page number, text fits even with long extra lines', () => {
  const s = Object.assign({}, DEFAULT_SETTINGS, { count: 6, copyrightPage: true, copyrightHolder: 'Jane Doe', copyrightYear: 2026 });
  const book = Layout.build(s, puzzles(6));
  assert(book.pages[0].kind === 'copyright' && book.pages[1].kind === 'howto', 'page order ' + book.pages.slice(0, 2).map(p => p.kind));
  const withOut = Layout.build(Object.assign({}, s, { copyrightPage: false }), puzzles(6));
  assert(book.pageCount === withOut.pageCount + 1, 'page count');
  const texts = book.renderPage(0).commands.filter(c => c.t === 'text').map(c => c.text);
  assert(texts.some(t => t === 'Copyright \u00A9 2026 Jane Doe'), 'notice line: ' + texts[0]);
  assert(!texts.includes('1'), 'copyright page shows a page number');
  assert(book.renderPage(1).commands.some(c => c.t === 'text' && c.text === '2'), 'page 2 lost its number');
  const long = Array.from({ length: 12 }, (_, i) => 'Line ' + (i + 1) + ' with some extra words to make it wrap onto a second line').join('\n') +
    '\nhttps://www.example.com/a-very-long-url-without-any-spaces-that-cannot-wrap-normally/' + 'x'.repeat(80);
  let checked = 0;
  KDP.TRIMS.forEach(t => {
    const b = Layout.build(Object.assign({}, s, { trim: t.key, marginPreset: 'minimum', bookTitle: 'A Title', copyrightNotes: long }), puzzles(6));
    const v = Layout.validate(b, [0]);
    assert(v.ok, t.key + ': ' + JSON.stringify(v.outside[0] || { minFont: v.minFont }));
    checked++;
  });
  return checked + ' trims with 13 extra lines';
});

test('gutter follows the page-count table; mirrored on odd/even pages', () => {
  const bands = [[24, 150, 0.375], [151, 300, 0.5], [301, 500, 0.625], [501, 700, 0.75], [701, 828, 0.875]];
  bands.forEach(([lo, hi, inside]) => {
    [lo, hi].forEach(target => {
      // 1 puzzle per page, no solutions, no extras: pages == puzzles (up to 500), then add solutions.
      const s = Object.assign({}, DEFAULT_SETTINGS, { howToPlay: false, includeSolutions: target > 500, solutionsPerPage: 1, perPage: 1 });
      const n = target > 500 ? 0 : target;
      let count = n;
      if (target > 500) { // 1 + 2n pages with solutions at 1 per page, plus maybe a How to Play page
        count = Math.floor((target - 1) / 2);
        s.howToPlay = (target - 1) % 2 === 1;
      }
      s.count = count;
      const book = Layout.build(s, puzzles(count));
      assert(book.pageCount === target, 'wanted ' + target + ' pages, got ' + book.pageCount);
      [false, true].forEach(bleed => ['comfortable', 'minimum'].forEach(preset => {
        s.bleed = bleed; s.marginPreset = preset;
        const b = Layout.build(s, puzzles(count));
        const extra = preset === 'comfortable' ? 0.125 : 0;
        const outside = (bleed ? 0.375 : 0.25) + extra;
        assert(Math.abs(b.margins.inside - (inside + extra)) < 1e-9, target + ' pages: inside ' + b.margins.inside);
        assert(Math.abs(b.margins.outside - outside) < 1e-9, 'outside ' + b.margins.outside);
        const odd = b.renderPage(0), even = b.renderPage(1);
        assert(odd.side === 'right' && even.side === 'left', 'page sides');
        assert(Math.abs(odd.live.x - odd.trim.x - (inside + extra)) < 1e-9, 'odd page gutter not on the left');
        assert(Math.abs(even.trim.x + even.trim.w - (even.live.x + even.live.w) - (inside + extra)) < 1e-9, 'even page gutter not on the right');
        assert(Math.abs(odd.live.y - odd.trim.y - outside) < 1e-9, 'top margin');
      }));
    });
  });
  return '5 bands x 2 edges x bleed x preset';
});

test('bleed ON enlarges the page by 0.125 x 0.25 in', () => {
  ['8.5x11', '6x9', '8.27x11.69'].forEach(trim => {
    const t = KDP.trimByKey(trim);
    const off = Layout.build(Object.assign({}, DEFAULT_SETTINGS, { trim, bleed: false }), puzzles(30));
    const on = Layout.build(Object.assign({}, DEFAULT_SETTINGS, { trim, bleed: true }), puzzles(30));
    assert(off.pageSize.w === t.w && off.pageSize.h === t.h, 'no-bleed size');
    assert(Math.abs(on.pageSize.w - (t.w + 0.125)) < 1e-9 && Math.abs(on.pageSize.h - (t.h + 0.25)) < 1e-9, 'bleed size');
    const right = on.renderPage(0), left = on.renderPage(1);
    assert(right.trim.x === 0 && Math.abs(left.trim.x - 0.125) < 1e-9, 'bleed not on the outside edge');
  });
});

test('page-count limits: warning under 24 pages, over 828 flagged', () => {
  const small = Layout.plan(Object.assign({}, DEFAULT_SETTINGS, { count: 5, howToPlay: false, solutionsPerPage: 4 }), 5);
  assert(small.pageCount < 24 && small.puzzlesToAdd > 0, 'no add-puzzles hint');
  const fixed = Layout.plan(Object.assign({}, DEFAULT_SETTINGS, { howToPlay: false, solutionsPerPage: 4 }), 5 + small.puzzlesToAdd);
  assert(fixed.pageCount >= 24, 'hint does not reach 24 pages');
  const fewer = Layout.plan(Object.assign({}, DEFAULT_SETTINGS, { howToPlay: false, solutionsPerPage: 4 }), 4 + small.puzzlesToAdd);
  assert(fewer.pageCount < 24, 'hint is not the minimum');
  const big = Layout.plan(Object.assign({}, DEFAULT_SETTINGS, { count: 500, solutionsPerPage: 1 }), 500);
  assert(big.pageCount > 828, 'expected > 828 pages');
  return '5 puzzles: add ' + small.puzzlesToAdd + '; 500 at 1 solution/page = ' + big.pageCount + ' pages';
});

test('options that would print digits under 7 pt are disabled', () => {
  KDP.TRIMS.forEach(t => {
    const p = Layout.plan(Object.assign({}, DEFAULT_SETTINGS, { trim: t.key, solutionsPerPage: 6, perPage: 2 }), 50);
    Object.keys(p.availability.solutionsPerPage).forEach(k => {
      const a = p.availability.solutionsPerPage[k];
      assert(a.ok === (a.pt >= 7), t.key + ' sol ' + k);
    });
    assert(p.solutionDigitPt >= 7 && p.puzzleDigitPt >= 7, t.key + ' effective digits too small');
  });
});

// ------------------------------------------------------------------ PDF
function pdfBytes(book) {
  return SS.Pdf.exportBook(book, {}).then(r => Buffer.from(r.doc.output('arraybuffer')));
}
function stripDates(buf) {
  return buf.toString('latin1').replace(/\/(CreationDate|ModDate) \(D:[^)]*\)/g, '');
}

(async () => {
  await testAsync('PDF: fonts embedded, no standard-14 fonts, grayscale, right page size', async () => {
    const s = Object.assign({}, DEFAULT_SETTINGS, { bleed: true, trim: '6x9', count: 10 });
    const book = Layout.build(s, puzzles(10));
    const txt = (await pdfBytes(book)).toString('latin1');
    const fontFiles = (txt.match(/\/FontFile2 /g) || []).length;
    assert(fontFiles === 2, 'embedded font files: ' + fontFiles);
    assert(!/\/BaseFont \/(Helvetica|Times|Courier|Symbol|ZapfDingbats)/.test(txt), 'standard-14 font referenced');
    assert(/\/Title \(Samurai Sudoku\)/.test(txt) && /\/Creator \(Samurai Sudoku Prints\)/.test(txt), 'metadata');
    const boxes = new Set((txt.match(/\/MediaBox \[[^\]]*\]/g) || []));
    assert(boxes.size === 1, 'mixed page sizes');
    const nums = [...boxes][0].match(/[\d.]+/g).map(Number);
    assert(Math.abs(nums[2] - 6.125 * 72) < 0.01 && Math.abs(nums[3] - 9.25 * 72) < 0.01, 'MediaBox ' + nums);
    assert(SS.Pdf.fileName(book) === 'samurai-sudoku_6x9_10-puzzles_medium.pdf', SS.Pdf.fileName(book));
    return (txt.length / 1024).toFixed(0) + ' KB';
  });

  await testAsync('PDF: same seed + settings = identical content', async () => {
    function bookFor(seed) {
      const list = [];
      for (let i = 0; i < 6; i++) {
        const d = Layout.difficultyForIndex(i, 6, 'mixed');
        const p = E.generatePuzzle({ difficulty: d, symmetric: true, seed: E.hashString(seed + '|' + i + '|' + d + '|1') });
        p.id = i + 1;
        list.push(p);
      }
      return Layout.build(Object.assign({}, DEFAULT_SETTINGS, { difficulty: 'mixed', count: 6 }), list);
    }
    const a = stripDates(await pdfBytes(bookFor('abc'))), b = stripDates(await pdfBytes(bookFor('abc')));
    const c = stripDates(await pdfBytes(bookFor('abd')));
    assert(a === b, 'same seed produced different PDFs');
    assert(a !== c, 'different seeds produced the same PDF');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
