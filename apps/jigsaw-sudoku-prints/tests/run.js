/*
 * run.js: automated checks for the Jigsaw Sudoku Book Maker (puzzles, layout, KDP rules, PDF).
 *
 *   node tests/run.js            full run (a few minutes on a 4-core laptop)
 *   node tests/run.js --quick    fewer puzzles, for a fast sanity check
 *
 * Puzzle generation is spread over Node worker threads running the app's own engine.js.
 * The PDF part also runs tests/verify-pdf.py (PyMuPDF) when Python has it, which reads the
 * exported files independently of the app's layout data.
 * The browser side (file://, Blob workers, UI) is covered by tests/browser-check.js.
 */
'use strict';
const { Worker } = require('worker_threads');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const env = require('./node-env');
env.CORE.concat(['js/render/pdf.js']).forEach(env.load);

const E = KS.engine, S = KS.Settings, L = KS.Layout, C = KS.Checks, KDP = KS.KDP, T = KS.Text, G = KS.Grid;
const QUICK = process.argv.includes('--quick');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'jigsaw-sudoku-tests-'));
let passed = 0, failed = 0;

function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function test(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    passed++;
    console.log('PASS ' + name + (note ? ' - ' + note : '') + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  } catch (e) {
    failed++;
    console.log('FAIL ' + name + ' - ' + (e && e.stack || e));
  }
}

// ---------------------------------------------------------------- worker pool
function pool(jobs) {
  const size = Math.max(1, Math.min(os.cpus().length - 1, 12));
  return new Promise((resolve, reject) => {
    const results = new Array(jobs.length);
    let next = 0, done = 0;
    const workers = [];
    for (let i = 0; i < Math.min(size, jobs.length); i++) {
      const w = new Worker(path.join(__dirname, 'gen-worker.js'));
      workers.push(w);
      w.on('message', msg => {
        results[msg.id] = msg;
        done++;
        if (next < jobs.length) w.postMessage(Object.assign({ id: next }, jobs[next++]));
        if (done === jobs.length) { workers.forEach(x => x.terminate()); resolve(results); }
      });
      w.on('error', reject);
      w.postMessage(Object.assign({ id: next }, jobs[next++]));
    }
  });
}

// Puzzles for a book in plan order.
async function makeBook(seed, count, difficulty, size, variant) {
  size = size || 9; variant = variant || 'classic';
  const slots = S.puzzlePlan(count, difficulty, null, size);
  const res = await pool(slots.map(sl => ({ seed: String(seed), size, variant, level: sl.level, ordinal: sl.ordinal })));
  return { slots, res, puzzles: res.map(r => r.puzzle) };
}

function settingsWith(over) {
  const s = S.defaults();
  s.seed = 4242;
  return Object.assign(s, over || {});
}

const EXAMPLES = {};
function fakePuzzles(n, size, variant) {
  const key = (size || 9) + (variant || 'classic');
  if (!EXAMPLES[key]) EXAMPLES[key] = L.exampleFor(size || 9, variant || 'classic');
  return new Array(n).fill(EXAMPLES[key]);
}

function scanAll(book) {
  const bad = [];
  for (let i = 0; i < book.pageCount; i++) {
    const page = book.renderPage(i);
    assert(page.w === book.trim.w && page.h === book.trim.h, 'page size');
    const r = C.scanPage(page);
    if (r.outside || r.smallFont || r.thinLine || r.lightInk) bad.push((i + 1) + ' ' + JSON.stringify(r));
  }
  return bad;
}

async function main() {
  console.log('Output folder: ' + OUT);
  let bigBook = null;

  // ---------------------------------------------------------------- puzzles
  const BIG = QUICK ? 120 : 600;
  await test('a ' + BIG + '-puzzle 9x9 Easy to Extreme book: every puzzle valid with exactly one solution', async () => {
    bigBook = await makeBook(777, BIG, 'easy-extreme');
    const bad = bigBook.res.filter(r => r.problems.length);
    assert(!bad.length, bad.length + ' bad puzzles, e.g. ' + JSON.stringify(bad[0] && bad[0].problems));
    const per = {}, clues = {};
    bigBook.slots.forEach((sl, i) => {
      per[sl.level] = (per[sl.level] || 0) + 1;
      clues[sl.level] = (clues[sl.level] || 0) + bigBook.puzzles[i].clues;
    });
    Object.keys(clues).forEach(l => { clues[l] = (clues[l] / per[l]).toFixed(1); });
    const ms = bigBook.res.map(r => r.ms);
    return JSON.stringify(per) + ', average givens ' + JSON.stringify(clues) + '; checks: regions of 9 connected cells, rows/cols/regions 1-9, givens match, solution count = 1; avg ' +
      Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) + ' ms/puzzle';
  });

  await test('difficulty: each puzzle needs its level\'s techniques and nothing harder', () => {
    const wrong = bigBook.res.filter((r, i) => r.tier !== E.LEVELS[bigBook.slots[i].level].tier);
    assert(!wrong.length, wrong.length + ' puzzles rated at another level');
    const lower = bigBook.res.filter(r => r.lower).length;
    assert(!lower, lower + ' puzzles solvable with simpler techniques than their level');
    return 'all ' + bigBook.res.length + ' rated at their level; none solvable a level lower';
  });

  await test('no duplicate puzzles or region layouts repeat too often', () => {
    const keys = new Set(bigBook.puzzles.map(p => p.key));
    assert(keys.size === bigBook.puzzles.length, (bigBook.puzzles.length - keys.size) + ' duplicates');
    const layouts = new Set(bigBook.puzzles.map(p => p.regions));
    assert(layouts.size === bigBook.puzzles.length, 'region layouts repeat: ' + layouts.size);
    return keys.size + ' distinct puzzles, ' + layouts.size + ' distinct region layouts';
  });

  await test('every size and variant: valid, unique, at its level', async () => {
    const out = [];
    const combos = [[6, 'classic'], [8, 'classic'], [10, 'classic'], [8, 'diagonal'], [9, 'diagonal'], [10, 'diagonal']];
    for (const [size, variant] of combos) {
      const levels = S.SIZE_LEVELS[size];
      const per = QUICK ? 3 : 8;
      const jobs = [];
      levels.forEach(level => { for (let k = 0; k < per; k++) jobs.push({ seed: 'sv', size, variant, level, ordinal: k }); });
      const res = await pool(jobs);
      const bad = res.filter(r => r.problems.length || r.lower);
      assert(!bad.length, bad.length && size + ' ' + variant + ': ' + bad.length + ' bad, e.g. ' + JSON.stringify(bad[0].problems) + ' lower=' + bad[0].lower);
      res.forEach(r => {
        const rules = E.levelRules(size, r.puzzle.level);
        assert(r.tier >= rules.minTier && r.tier <= rules.tier, 'tier ' + r.tier + ' for ' + r.puzzle.level);
        assert(r.puzzle.size === size && r.puzzle.variant === variant, 'kind');
      });
      out.push(size + 'x' + size + ' ' + variant + ' ' + res.length);
    }
    assert(S.SIZE_LEVELS[6].indexOf('extreme') < 0, '6x6 must not offer Extreme');
    let threw = false;
    try { E.generate(1, 6, 'diagonal', 'easy', 0, 0); } catch (e) { threw = true; }
    assert(threw, '6x6 diagonal should be refused');
    return out.join(', ');
  });

  await test('diagonal puzzles hold every digit once on both long diagonals', () => {
    const p = E.generate('diag-check', 9, 'diagonal', 'medium', 0, 0);
    const sol = p.solution;
    const d1 = new Set(), d2 = new Set();
    for (let i = 0; i < 9; i++) { d1.add(sol[i * 9 + i]); d2.add(sol[i * 9 + 8 - i]); }
    assert(d1.size === 9 && d2.size === 9, 'diagonals repeat');
    const pz = E.fromWire(p);
    assert(pz.board.houses.length === 29, 'expected 29 houses, got ' + pz.board.houses.length);
  });

  await test('same seed and settings give the same puzzles (two runs)', async () => {
    const a = await makeBook(31337, 24, 'easy-hard');
    const b = await makeBook(31337, 24, 'easy-hard');
    a.puzzles.forEach((p, i) => assert(p.key === b.puzzles[i].key && p.solution === b.puzzles[i].solution, 'puzzle ' + (i + 1) + ' differs'));
    const c = await makeBook(31338, 24, 'easy-hard');
    assert(c.puzzles.every((p, i) => p.key !== a.puzzles[i].key), 'a new seed should give new puzzles');
    const d = await makeBook(31337, 24, 'easy-hard', 8);
    assert(d.puzzles.every(p => p.size === 8), 'size ignored');
    return '24 puzzles identical; a different seed or size gives different puzzles';
  });

  await test('generator orchestration (page fallback path) is deterministic and reuses work', async () => {
    function run(count, difficulty, gen, size) {
      return new Promise(resolve => {
        gen = gen || new KS.Generator(() => {});
        gen.onChange = st => { if (!st.running && st.ready === st.total) resolve({ gen, st }); };
        gen.setPlan(99, S.puzzlePlan(count, difficulty, null, size || 9), size || 9, 'classic');
      });
    }
    const first = await run(12, 'easy');
    const second = await run(12, 'easy');
    first.st.puzzles.forEach((p, i) => assert(p.key === second.st.puzzles[i].key, 'slot ' + i + ' differs'));
    const cached = first.gen.cache.size;
    const more = await run(15, 'easy', first.gen);
    assert(first.gen.cache.size === cached + 3, 'raising the count should only make the 3 new puzzles');
    more.st.puzzles.slice(0, 12).forEach((p, i) => assert(p.key === first.st.puzzles[i].key, 'kept puzzle changed'));
    const six = await run(12, 'easy', first.gen, 6);
    assert(six.st.puzzles.every(p => p.size === 6), 'size change not applied');
    return 'raising 12 to 15 generated only 3 puzzles; switching size makes new ones';
  });

  await test('puzzle plan: levels run easiest to hardest, 6x6 folds Extreme into Hard, mixes validated', () => {
    const p = S.puzzlePlan(200, 'easy-extreme');
    const order = { easy: 0, medium: 1, hard: 2, extreme: 3 };
    for (let i = 1; i < p.length; i++) assert(order[p[i].level] >= order[p[i - 1].level], 'not ordered at ' + i);
    ['easy', 'medium', 'hard', 'extreme'].forEach(l => assert(p.filter(x => x.level === l).length === 50, l));
    const six = S.puzzlePlan(100, 'mix', { easy: 25, medium: 25, hard: 25, extreme: 25 }, 6);
    assert(!six.some(x => x.level === 'extreme') && six.filter(x => x.level === 'hard').length === 50, 'extreme not folded');
    assert(!S.difficultyOk('extreme', 6) && S.difficultyOk('easy-hard', 6) && S.difficultyOk('mix', 6), 'difficultyOk');
    assert(!S.variantOk('diagonal', 6) && S.variantOk('diagonal', 8), 'variantOk');
    assert(S.mixError({ easy: 25, medium: 25, hard: 25, extreme: 25 }) === '', 'valid mix rejected');
    assert(/add up to 90%/.test(S.mixError({ easy: 30, medium: 30, hard: 30, extreme: 0 })), 'sum not checked');
    const q = S.puzzlePlan(210, 'easy-extreme');
    const keys = new Set(q.map(x => x.level + x.ordinal));
    assert(p.every(x => keys.has(x.level + x.ordinal)), 'a bigger book should contain every slot of the smaller one');
    assert(S.autoSubtitle(settingsWith({ count: 120, size: 6 })) === '120 Easy to Hard 6x6 Irregular Sudoku Puzzles with Solutions', S.autoSubtitle(settingsWith({ count: 120, size: 6 })));
    assert(S.puzzleKey(settingsWith({ size: 8 })) !== S.puzzleKey(settingsWith({ size: 9 })), 'size not in the puzzle key');
    assert(S.puzzleKey(settingsWith({ variant: 'diagonal' })) !== S.puzzleKey(settingsWith({})), 'variant not in the puzzle key');
  });

  await test('every preset builds a valid book', () => {
    const out = [];
    S.PRESETS.forEach(p => {
      const s = settingsWith(p.values);
      const opt = L.perPageOptions(s).filter(o => o.n === s.perPage)[0];
      assert(opt.ok, p.key + ': ' + s.perPage + ' per page unavailable (' + opt.cellPt.toFixed(1) + ' pt)');
      assert(S.variantOk(s.variant, s.size) && S.difficultyOk(s.difficulty, s.size), p.key + ': invalid combination');
      const book = L.build(s, fakePuzzles(s.count, s.size, s.variant), 1);
      assert(book.pageCount >= 24 && book.pageCount <= book.trim.maxPages, p.key + ' pages ' + book.pageCount);
      out.push(p.key + ' ' + book.pageCount + 'p ' + opt.cellPt.toFixed(0) + 'pt');
    });
    return out.join(', ');
  });

  // ---------------------------------------------------------------- layout
  await test('puzzle numbers match solution labels and "Solution on page N" is right', () => {
    const n = Math.min(200, bigBook.puzzles.length);
    const s = settingsWith({ count: n, difficulty: 'easy-extreme' });
    const book = L.build(s, bigBook.puzzles.slice(0, n), 1);
    const texts = i => book.renderPage(i).commands.filter(c => c.t === 'text').map(c => c.text);
    let checked = 0;
    book.pages.forEach((pg, idx) => {
      if (pg.type !== 'puzzles') return;
      const t = texts(idx);
      for (let k = 0; k < pg.n; k++) {
        const num = pg.first + k + 1;
        assert(t.some(x => x === 'Puzzle ' + num || x.indexOf('Puzzle ' + num + ' ·') === 0), 'label for ' + num);
        const ref = t.filter(x => /^Solution on page \d+$/.test(x))[k];
        const target = +ref.match(/\d+/)[0];
        assert(texts(target - 1).indexOf('Puzzle ' + num) >= 0, 'solution of ' + num + ' is not on page ' + target);
        const pz = book.puzzles[num - 1];
        const digits = book.renderPage(target - 1).commands.filter(c => c.t === 'text' && /^\d$/.test(c.text)).map(c => c.text).join('');
        assert(digits.indexOf(pz.solution) >= 0, 'grid printed under the label is not puzzle ' + num + '’s solution');
        checked++;
      }
    });
    return checked + ' puzzles cross-checked';
  });

  await test('levels start on fresh pages and the contents page lists the right pages', () => {
    const s = settingsWith({ count: 101, difficulty: 'easy-extreme', perPage: 4, header: 'level' });
    const book = L.build(s, bigBook.puzzles.slice(0, 101), 1);
    book.pages.forEach(pg => {
      if (pg.type !== 'puzzles') return;
      for (let k = 0; k < pg.n; k++) assert(book.slots[pg.first + k].level === pg.level, 'mixed levels on one page');
    });
    const rows = L.contentsRows(book);
    rows.forEach(r => {
      const pg = book.pages[r.page - 1];
      if (r.text === 'How to Play') assert(pg.type === 'howto', 'how to play page');
      else if (r.text === 'Solutions') assert(pg.type === 'solutions' && pg.heading, 'solutions page');
      else if (r.text === 'Thank You') assert(pg.type === 'thanks', 'thanks page');
      else {
        assert(pg.type === 'puzzles' && S.LEVEL_LABEL[pg.level] + ' Puzzles' === r.text && pg.first + 1 === +r.note.split('–')[0], 'section ' + r.text);
        const head = book.renderPage(r.page - 1).commands.filter(c => c.t === 'text').map(c => c.text);
        assert(head.indexOf(r.text) >= 0, 'level header missing on page ' + r.page);
      }
    });
    const contents = book.renderPage(book.pages.findIndex(p => p.type === 'contents')).commands.filter(c => c.t === 'text').map(c => c.text);
    rows.forEach(r => assert(contents.indexOf(r.text) >= 0 && contents.indexOf(String(r.page)) >= 0, 'contents row ' + r.text));
    return rows.map(r => r.text + ' p' + r.page).join(', ');
  });

  await test('region borders: every border between two regions is drawn thick, none inside a region', () => {
    const pz = bigBook.puzzles[5], shape = G.shapeOf(pz), n = 9;
    const thick = new Set();
    shape.segs.forEach(sg => {
      if (sg[1] === sg[3]) for (let c = sg[0]; c < sg[2]; c++) thick.add('h' + sg[1] + ',' + c);
      else for (let r = sg[1]; r < sg[3]; r++) thick.add('v' + sg[0] + ',' + r);
    });
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (c < n - 1) assert((shape.reg[i] !== shape.reg[i + 1]) === thick.has('v' + (c + 1) + ',' + r), 'vertical edge ' + r + ',' + c);
      if (r < n - 1) assert((shape.reg[i] !== shape.reg[i + n]) === thick.has('h' + (r + 1) + ',' + c), 'horizontal edge ' + r + ',' + c);
    }
    const out = [];
    G.jigsaw(out, pz, 0, 0, 3);
    const lines = out.filter(c => c.t === 'line' && c.w > 1);
    assert(lines.length === shape.segs.length && lines.every(l => l.cap === 'square'), 'thick lines');
    const shades = shape.shades;
    for (let i = 0; i < 81; i++) {
      if (i % 9 < 8 && shape.reg[i] !== shape.reg[i + 1]) assert(shades[shape.reg[i]] !== shades[shape.reg[i + 1]], 'neighbouring regions share a shade');
      if (i < 72 && shape.reg[i] !== shape.reg[i + 9]) assert(shades[shape.reg[i]] !== shades[shape.reg[i + 9]], 'neighbouring regions share a shade');
    }
    return shape.segs.length + ' border runs; shades ' + Array.from(new Set(shades)).join('/');
  });

  await test('every book size, layout and option: nothing crosses the margins, text >= 7 pt, lines >= 0.75 pt', () => {
    const rows = [];
    KDP.TRIMS.forEach(trim => {
      S.PER_PAGE.forEach(pp => {
        [false, true].forEach(extras => {
          [6, 9, 10].forEach(size => {
            const variant = extras && size !== 6 ? 'diagonal' : 'classic';
            const s = settingsWith({
              trim: trim.key, perPage: pp, count: 60, size, variant, difficulty: 'easy-hard',
              author: extras ? 'A Very Long Author Name Indeed' : '', header: extras ? 'level' : 'none',
              labelStyle: extras ? 'badge' : 'plain', shade: extras
            });
            const opt = L.perPageOptions(s).filter(o => o.n === pp)[0];
            if (!opt.ok) return;
            const book = L.build(s, fakePuzzles(60, size, variant), 1);
            const bad = scanAll(book);
            assert(!bad.length, trim.key + ' ' + pp + '/page ' + size + ' ' + variant + ': ' + bad[0]);
            rows.push(1);
          });
        });
      });
    });
    return rows.length + ' size/layout combinations';
  });

  await test('per-page options: cells never below ' + KDP.MIN_CELL_PT + ' pt; unavailable choices reported', () => {
    const out = [];
    KDP.TRIMS.forEach(trim => {
      const opts = L.perPageOptions(settingsWith({ trim: trim.key }));
      opts.forEach(o => assert(o.ok === (o.cellPt >= KDP.MIN_CELL_PT - 1e-9), 'threshold'));
      out.push(trim.key + ' ' + opts.filter(o => o.ok).map(o => o.n).join('/'));
    });
    return out.join(', ');
  });

  await test('gutter steps at 150/152, 300/302, 500/502 pages and sits on the correct side', () => {
    const found = {};
    const s = settingsWith({ perPage: 1, difficulty: 'easy' });
    for (let c = 10; c <= 1000 && Object.keys(found).length < 6; c++) {
      const n = L.pageCountFor(s, c);
      [150, 152, 300, 302, 500, 502].forEach(t => { if (n === t && !found[t]) found[t] = c; });
    }
    const expect = { 150: 0.375, 152: 0.5, 300: 0.5, 302: 0.625, 500: 0.625, 502: 0.75 };
    const out = [];
    Object.keys(expect).forEach(t => {
      assert(found[t], 'no puzzle count gives ' + t + ' pages');
      const book = L.build(Object.assign({}, s, { count: found[t] }), [], 1);
      assert(book.pageCount === +t, 'page count');
      assert(book.margins.kdpInside === expect[t] && book.margins.inside === expect[t] + 0.25, t + ' pages: gutter ' + book.margins.inside);
      const odd = book.renderPage(0), even = book.renderPage(1);
      assert(odd.live.x === book.margins.inside && even.live.x === book.margins.outside, 'mirrored sides');
      out.push(t + 'p=' + book.margins.inside);
    });
    return out.join(' ');
  });

  await test('page count rules: blocked below 24 and above the size limit, always even', () => {
    const few = L.build(settingsWith({ count: 10, perPage: 6 }), fakePuzzles(10), 1);
    const c1 = C.run(few, { gen: { ready: 10, total: 10 }, scan: null }).filter(x => x.id === 'minPages')[0];
    assert(few.pageCount < 24 && c1.status === 'fail' && /^Add at least \d+ more puzzles? to reach 24 pages\.$/.test(c1.message), c1.message);
    const need = +c1.message.match(/\d+/)[0];
    assert(L.pageCountFor(few.settings, 10 + need) >= 24 && L.pageCountFor(few.settings, 10 + need - 1) < 24, 'the advice is exact');
    const many = L.build(settingsWith({ count: 1000, perPage: 1 }), [], 1);
    const c2 = C.run(many, { gen: { ready: 1000, total: 1000 }, scan: null }).filter(x => x.id === 'maxPages')[0];
    assert(many.pageCount > 590 && c2.status === 'fail' && /Choose 2 puzzles per page/.test(c2.message), c2.message);
    return '"' + c1.message + '" / "' + c2.message + '"';
  });

  await test('no combination of settings passes the checks yet breaks a KDP rule (randomised)', () => {
    const rng = E.makeRng('settings-fuzz');
    const N = QUICK ? 30 : 120;
    let allowed = 0;
    for (let k = 0; k < N; k++) {
      const size = rng.pick([6, 8, 9, 10]);
      const s = settingsWith({
        trim: rng.pick(KDP.TRIMS).key,
        perPage: rng.pick(S.PER_PAGE),
        count: rng.pick([10, 11, 23, 40, 57, 99, 150, 151, 333, 500, 777, 1000]),
        difficulty: rng.pick(S.DIFFICULTIES.filter(d => S.difficultyOk(d.key, size))).key,
        size, variant: size === 6 ? 'classic' : rng.pick(['classic', 'diagonal']),
        header: rng.pick(['none', 'title', 'level']),
        labelStyle: rng.pick(['plain', 'badge']),
        shade: rng.int(2) === 1,
        pageNumbers: rng.int(4) > 0,
        solutionRef: rng.int(4) > 0,
        author: rng.pick(['', 'Jo', 'Professor Bartholomew Montgomery-Smythe the Third']),
        title: rng.pick(['Jigsaw Sudoku', 'The Enormous Ultimate Collection of Fiendishly Hard Irregular Jigsaw Sudoku Puzzles for Clever Adults and Seniors'])
      });
      s.pages = { title: rng.int(5) > 0, copyright: rng.int(5) > 0, contents: rng.int(2) === 1, howTo: rng.int(5) > 0, thanks: rng.int(2) === 1 };
      s.margins = {
        autoInside: rng.int(2) === 1, inside: rng.pick([0.375, 0.5, 0.9, 1.5]),
        outside: rng.pick([0.25, 0.5, 1, 1.5]), top: rng.pick([0.25, 0.5, 1.5]), bottom: rng.pick([0.25, 0.75, 1.5])
      };
      const ok = L.perPageOptions(s).filter(o => o.n === s.perPage)[0].ok;
      if (!ok) continue; // the app switches to an available option before building
      const book = L.build(s, fakePuzzles(s.count, s.size, s.variant), 1);
      const scan = { pages: book.pageCount, outside: [], smallFont: [], thinLine: [], lightInk: [], minFont: 99, minLine: 99 };
      for (let i = 0; i < book.pageCount; i++) {
        const r = C.scanPage(book.renderPage(i));
        ['outside', 'smallFont', 'thinLine', 'lightInk'].forEach(f => { if (r[f]) scan[f].push(i + 1); });
      }
      const checks = C.run(book, { gen: { ready: s.count, total: s.count }, scan });
      assert(book.pageCount % 2 === 0, 'odd page count');
      if (checks.some(C.isBlocking)) continue;
      allowed++;
      assert(book.pageCount >= 24 && book.pageCount <= book.trim.maxPages, 'page count ' + book.pageCount);
      assert(!scan.outside.length && !scan.smallFont.length && !scan.thinLine.length && !scan.lightInk.length, 'content problem allowed');
      assert(book.margins.inside >= KDP.minGutter(book.pageCount) && Math.min(s.margins.outside, s.margins.top, s.margins.bottom) >= 0.25, 'margins');
      assert(L.perPageOptions(s).filter(o => o.n === s.perPage)[0].cellPt >= KDP.MIN_CELL_PT, 'cells');
    }
    return N + ' random settings, ' + allowed + ' downloadable, all within the rules';
  });

  // ---------------------------------------------------------------- PDF
  const python = findPython();
  for (const trim of KDP.TRIMS) {
    await test('PDF ' + trim.label + ': trim-size pages, embedded fonts, vector only, clean file' + (python ? ' (verified with PyMuPDF)' : ''), async () => {
      const s = settingsWith({ trim: trim.key, count: 120, author: 'Jane Doe', header: 'title', difficulty: 'easy-extreme', labelStyle: 'badge', shade: true });
      if (!L.perPageOptions(s).filter(o => o.n === s.perPage)[0].ok) s.perPage = 1;
      const book = L.build(s, bigBook.puzzles.slice(0, 120), 1);
      const t0 = Date.now();
      const res = await KS.Pdf.exportBook(book, {});
      const ms = Date.now() - t0;
      const file = path.join(OUT, res.fileName);
      fs.writeFileSync(file, Buffer.from(res.bytes));
      assert(res.fileName === 'jigsaw-sudoku-interior-' + trim.key + '-' + book.pageCount + 'p.pdf', res.fileName);
      const raw = Buffer.from(res.bytes).toString('latin1');
      const w = +(trim.w * 72).toFixed(2), h = +(trim.h * 72).toFixed(2);
      const boxes = raw.match(/\/MediaBox \[[^\]]+\]/g) || [];
      assert(boxes.length === book.pageCount, 'MediaBox count ' + boxes.length);
      boxes.forEach(b => {
        const v = b.match(/[\d.]+/g).map(Number);
        assert(v[0] === 0 && v[1] === 0 && Math.abs(v[2] - w) < 0.01 && Math.abs(v[3] - h) < 0.01, b);
      });
      assert(!/\/Subtype \/Image/.test(raw), 'contains an image');
      assert((raw.match(/\/FontFile2/g) || []).length === 4, 'expected 4 embedded TrueType fonts');
      assert(!/\/BaseFont \/(Helvetica|Times|Courier|Symbol|ZapfDingbats)/.test(raw), 'a non-embedded standard font is referenced');
      assert(!/\/Producer|\/CreationDate|\/OpenAction|\/Outlines|\/Annots|\/Encrypt|\/ca |\/CA |\/SMask/.test(raw), 'metadata, actions, annotations, encryption or transparency found');
      let note = book.pageCount + ' pages, ' + (res.bytes.length / 1024 / 1024).toFixed(1) + ' MB, ' + ms + ' ms';
      if (python) {
        const spec = JSON.stringify({ w: trim.w, h: trim.h, pages: book.pageCount, margins: book.margins });
        const r = spawnSync(python, [path.join(__dirname, 'verify-pdf.py'), file, spec], { encoding: 'utf8' });
        const report = JSON.parse((r.stdout || '{}').trim().split('\n').pop() || '{}');
        assert(report.ok, 'PyMuPDF: ' + JSON.stringify(report.problems || r.stderr));
        note += '; PyMuPDF: smallest text ' + report.stats.minFont.toFixed(2) + ' pt, thinnest stroke ' + report.stats.minStroke.toFixed(2) + ' pt, ' + report.stats.images + ' images';
      }
      return note;
    });
  }

  await test('a 300-page book exports in under 20 seconds', async () => {
    const s = settingsWith({ count: 560, perPage: 2, difficulty: 'easy-extreme' });
    const book = L.build(s, bigBook.puzzles.length >= 560 ? bigBook.puzzles.slice(0, 560) : fakePuzzles(560), 1);
    assert(book.pageCount >= 300, 'only ' + book.pageCount + ' pages');
    const t0 = Date.now();
    const res = await KS.Pdf.exportBook(book, {});
    const ms = Date.now() - t0;
    assert(ms < 20000, ms + ' ms');
    return book.pageCount + ' pages in ' + (ms / 1000).toFixed(1) + ' s (Node), ' + (res.bytes.length / 1024 / 1024).toFixed(1) + ' MB';
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed. PDFs in ' + OUT);
  process.exit(failed ? 1 : 0);
}

function findPython() {
  for (const cmd of ['python', 'python3', 'py']) {
    const r = spawnSync(cmd, ['-c', 'import fitz; print(1)'], { encoding: 'utf8' });
    if (r.status === 0 && /1/.test(r.stdout)) return cmd;
  }
  console.log('(PyMuPDF not found: PDF files are checked by the Node assertions only)');
  return null;
}

main().catch(e => { console.error(e); process.exit(2); });
