/*
 * run.js: automated checks for the spec's acceptance list (puzzles, layout, PDF).
 *
 *   node tests/run.js            full run (about a minute on a 4-core laptop)
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

const E = KS.engine, S = KS.Settings, L = KS.Layout, C = KS.Checks, KDP = KS.KDP, T = KS.Text;
const QUICK = process.argv.includes('--quick');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'killer-sudoku-tests-'));
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

// Puzzles for a book in plan order, with the same book-order duplicate rule the app uses.
async function makeBook(seed, count, difficulty) {
  const slots = S.puzzlePlan(count, difficulty);
  const res = await pool(slots.map(sl => ({ seed: String(seed), level: sl.level, ordinal: sl.ordinal })));
  return { slots, res, puzzles: res.map(r => r.puzzle) };
}

function settingsWith(over) {
  const s = S.defaults();
  s.seed = 4242;
  return Object.assign(s, over || {});
}

function fakePuzzles(n) { return new Array(n).fill(L.EXAMPLE); }

async function main() {
  console.log('Output folder: ' + OUT);
  let bigBook = null;

  // ---------------------------------------------------------------- puzzles
  const BIG = QUICK ? 150 : 1000;
  await test('a ' + BIG + '-puzzle Easy to Hard book: every puzzle valid with exactly one solution', async () => {
    bigBook = await makeBook(777, BIG, 'easy-hard');
    const bad = bigBook.res.filter(r => r.problems.length);
    assert(!bad.length, bad.length + ' bad puzzles, e.g. ' + JSON.stringify(bad[0] && bad[0].problems));
    const per = {};
    bigBook.slots.forEach(sl => { per[sl.level] = (per[sl.level] || 0) + 1; });
    assert(Object.values(per).every(n => n >= (QUICK ? 50 : 100)), 'not enough per level ' + JSON.stringify(per));
    const ms = bigBook.res.map(r => r.ms);
    return JSON.stringify(per) + ', checks: sudoku rows/cols/boxes, cages cover all 81 cells once, connected, no repeats, sums, solution count = 1; avg ' +
      Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) + ' ms/puzzle';
  });

  await test('difficulty: each puzzle is rated at its level by the logic solver', async () => {
    const wrong = bigBook.res.filter((r, i) => r.tier !== E.LEVELS[bigBook.slots[i].level].tier);
    assert(!wrong.length, wrong.length + ' puzzles rated at another level');
    const hardSingles = bigBook.res.filter((r, i) => bigBook.slots[i].level === 'hard' && r.singles > 0).length;
    const medSingles = bigBook.res.filter((r, i) => bigBook.slots[i].level === 'medium' && r.singles > 0).length;
    assert(!hardSingles && !medSingles, 'single-cell cages in Hard/Medium: ' + hardSingles + '/' + medSingles);
    const avg = lvl => {
      const xs = bigBook.res.filter((r, i) => bigBook.slots[i].level === lvl).map(r => 81 / r.puzzle.sums.length);
      return (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2);
    };
    const lower = bigBook.res.filter((r, i) => {
      const lv = E.LEVELS[bigBook.slots[i].level].tier;
      return lv > 1 && E.rate(E.fromWire(r.puzzle), { maxTier: lv - 1 }).solved;
    }).length;
    assert(!lower, lower + ' puzzles solvable with simpler techniques than their level');
    return 'average cage size easy ' + avg('easy') + ', medium ' + avg('medium') + ', hard ' + avg('hard') + '; none solvable a level lower';
  });

  await test('no duplicate puzzles in the ' + BIG + '-puzzle book', () => {
    const keys = new Set(bigBook.puzzles.map(p => p.key));
    assert(keys.size === bigBook.puzzles.length, (bigBook.puzzles.length - keys.size) + ' duplicates');
    const grids = new Set(bigBook.puzzles.map(p => p.solution));
    return keys.size + ' distinct puzzles, ' + grids.size + ' distinct solution grids';
  });

  await test('same seed and settings give the same puzzles (two runs)', async () => {
    const a = await makeBook(31337, 24, 'easy-hard');
    const b = await makeBook(31337, 24, 'easy-hard');
    a.puzzles.forEach((p, i) => assert(p.key === b.puzzles[i].key && p.solution === b.puzzles[i].solution, 'puzzle ' + (i + 1) + ' differs'));
    const c = await makeBook(31338, 24, 'easy-hard');
    assert(c.puzzles.every((p, i) => p.key !== a.puzzles[i].key), 'a new seed should give new puzzles');
    return '24 puzzles identical; a different seed gives different puzzles';
  });

  await test('generator orchestration (page fallback path) is deterministic and reuses work', async () => {
    function run(count, difficulty, gen) {
      return new Promise(resolve => {
        gen = gen || new KS.Generator(st => { if (!st.running && st.ready === st.total) resolve({ gen, st }); });
        gen.onChange = st => { if (!st.running && st.ready === st.total) resolve({ gen, st }); };
        gen.setPlan(99, S.puzzlePlan(count, difficulty));
      });
    }
    const first = await run(12, 'easy');
    const second = await run(12, 'easy');
    first.st.puzzles.forEach((p, i) => assert(p.key === second.st.puzzles[i].key, 'slot ' + i + ' differs'));
    const cached = first.gen.cache.size;
    const more = await run(15, 'easy', first.gen);
    assert(first.gen.cache.size === cached + 3, 'raising the count should only make the 3 new puzzles');
    more.st.puzzles.slice(0, 12).forEach((p, i) => assert(p.key === first.st.puzzles[i].key, 'kept puzzle changed'));
    return 'raising 12 to 15 generated only 3 puzzles';
  });

  await test('puzzle plan: mixed books run easiest to hardest, slots are stable when the count grows', () => {
    const p = S.puzzlePlan(200, 'easy-hard');
    const order = { easy: 0, medium: 1, hard: 2 };
    for (let i = 1; i < p.length; i++) assert(order[p[i].level] >= order[p[i - 1].level], 'not ordered at ' + i);
    assert(p.filter(x => x.level === 'easy').length === 68 && p.filter(x => x.level === 'hard').length === 66, 'split');
    const q = S.puzzlePlan(210, 'easy-hard');
    const keys = new Set(q.map(x => x.level + x.ordinal));
    assert(p.every(x => keys.has(x.level + x.ordinal)), 'a bigger book should contain every slot of the smaller one');
  });

  await test('custom mix: percentages set the split, always add up to the count, and are validated', () => {
    const count = (n, mix) => { const c = { easy: 0, medium: 0, hard: 0 }; S.puzzlePlan(n, 'mix', mix).forEach(x => c[x.level]++); return c; };
    const a = count(200, { easy: 30, medium: 40, hard: 30 });
    assert(a.easy === 60 && a.medium === 80 && a.hard === 60, JSON.stringify(a));
    const b = count(10, { easy: 0, medium: 25, hard: 75 });
    assert(b.easy === 0 && b.medium + b.hard === 10 && b.hard >= 7, JSON.stringify(b));
    for (let n = 10; n <= 1000; n += 37) {
      const c = count(n, { easy: 33, medium: 33, hard: 34 });
      assert(c.easy + c.medium + c.hard === n, 'total at ' + n);
    }
    assert(S.mixError({ easy: 30, medium: 40, hard: 30 }) === '', 'valid mix rejected');
    assert(/add up to 90%/.test(S.mixError({ easy: 30, medium: 30, hard: 30 })), 'sum not checked');
    assert(S.mixError({ easy: NaN, medium: 50, hard: 50 }) !== '', 'empty field allowed');
    const s = settingsWith({ difficulty: 'mix', mix: { easy: 50, medium: 0, hard: 50 } });
    assert(S.autoSubtitle(s) === '200 Easy to Hard Puzzles with Solutions', S.autoSubtitle(s));
    assert(S.puzzleKey(settingsWith({ difficulty: 'mix', mix: { easy: 34, medium: 33, hard: 33 } })) === S.puzzleKey(settingsWith({ difficulty: 'easy-hard' })),
      'the same split should keep the same puzzles');
    return '200 at 30/40/30 = 60/80/60';
  });

  // ---------------------------------------------------------------- layout
  await test('puzzle numbers match solution labels and "Solution on page N" is right', () => {
    const n = Math.min(200, bigBook.puzzles.length);
    const s = settingsWith({ count: n });
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

  await test('every book size: page size = trim, nothing crosses the margins, text >= 7 pt, lines >= 0.75 pt', () => {
    const rows = [];
    KDP.TRIMS.forEach(trim => {
      [1, 2, 4].forEach(pp => {
        [false, true].forEach(extras => {
          const s = settingsWith({ trim: trim.key, perPage: pp, count: 120, author: extras ? 'A Very Long Author Name Indeed' : '', header: extras });
          s.pages.thanks = extras;
          const opts = L.perPageOptions(s).filter(o => o.n === pp)[0];
          if (!opts.ok) return;
          const book = L.build(s, fakePuzzles(120), 1);
          for (let i = 0; i < book.pageCount; i++) {
            const page = book.renderPage(i);
            assert(page.w === trim.w && page.h === trim.h, 'size');
            const r = C.scanPage(page);
            assert(!r.outside && !r.smallFont && !r.thinLine && !r.lightInk, trim.key + ' ' + pp + '/page, page ' + (i + 1) + ': ' + JSON.stringify(r));
          }
          rows.push(trim.key + ':' + pp);
        });
      });
    });
    return rows.length + ' size/layout combinations';
  });

  await test('per-page options: cells never below 24 pt; unavailable choices reported', () => {
    const out = [];
    KDP.TRIMS.forEach(trim => {
      const opts = L.perPageOptions(settingsWith({ trim: trim.key }));
      opts.forEach(o => assert(o.ok === (o.cellPt >= 24 - 1e-9), 'threshold'));
      out.push(trim.key + ' ' + opts.filter(o => o.ok).map(o => o.n).join('/'));
    });
    return out.join(', ');
  });

  await test('gutter steps at 150/152, 300/302, 500/502 pages and sits on the correct side', () => {
    const found = {};
    const s = settingsWith({ perPage: 1 });
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
      assert(odd.gutter.x === 0 && even.gutter.x === book.trim.w - book.margins.inside, 'gutter strip side');
      out.push(t + 'p=' + book.margins.inside);
    });
    assert(KDP.minGutter(24) === 0.375 && KDP.minGutter(828) === 0.875 && KDP.minGutter(701) === 0.875, 'table ends');
    return out.join(' ');
  });

  await test('manual inner margin below the KDP minimum is raised automatically', () => {
    const s = settingsWith({ count: 600, perPage: 2 });
    s.margins = Object.assign({}, s.margins, { autoInside: false, inside: 0.4 });
    const book = L.build(s, [], 1);
    assert(book.margins.raised && book.margins.inside === book.margins.kdpInside, 'not raised');
    const c = C.run(book, { gen: { ready: 600, total: 600 }, scan: null }).filter(x => x.id === 'gutter')[0];
    assert(c.status === 'auto' && /Raised to/.test(c.message), c.message);
    return book.pageCount + ' pages: ' + c.message;
  });

  await test('page count rules: blocked below 24 and above the size limit, always even', () => {
    const few = L.build(settingsWith({ count: 10, perPage: 4 }), fakePuzzles(10), 1);
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
    const N = QUICK ? 40 : 160;
    let allowed = 0;
    for (let k = 0; k < N; k++) {
      const s = settingsWith({
        trim: rng.pick(KDP.TRIMS).key,
        perPage: rng.pick([1, 2, 4]),
        count: rng.pick([10, 11, 23, 40, 57, 99, 150, 151, 333, 500, 777, 1000]),
        difficulty: rng.pick(S.DIFFICULTIES).key,
        header: rng.int(2) === 1,
        pageNumbers: rng.int(4) > 0,
        solutionRef: rng.int(4) > 0,
        author: rng.pick(['', 'Jo', 'Professor Bartholomew Montgomery-Smythe the Third']),
        title: rng.pick(['Killer Sudoku', 'The Enormous Ultimate Collection of Fiendishly Hard Killer Sudoku Puzzles for Clever Adults and Seniors'])
      });
      s.pages = { title: rng.int(5) > 0, copyright: rng.int(5) > 0, howTo: rng.int(5) > 0, thanks: rng.int(2) === 1 };
      s.margins = {
        autoInside: rng.int(2) === 1, inside: rng.pick([0.375, 0.5, 0.9, 1.5]),
        outside: rng.pick([0.25, 0.5, 1, 1.5]), top: rng.pick([0.25, 0.5, 1.5]), bottom: rng.pick([0.25, 0.75, 1.5])
      };
      const ok = L.perPageOptions(s).filter(o => o.n === s.perPage)[0].ok;
      if (!ok) continue; // the app switches to an available option before building
      const book = L.build(s, fakePuzzles(s.count), 1);
      const scan = { pages: book.pageCount, outside: [], smallFont: [], thinLine: [], lightInk: [], minFont: 99, minLine: 99 };
      for (let i = 0; i < book.pageCount; i++) {
        const r = C.scanPage(book.renderPage(i));
        ['outside', 'smallFont', 'thinLine', 'lightInk'].forEach(f => { if (r[f]) scan[f].push(i + 1); });
      }
      const checks = C.run(book, { gen: { ready: s.count, total: s.count }, scan });
      const blocked = checks.some(C.isBlocking);
      assert(book.pageCount % 2 === 0, 'odd page count');
      if (blocked) continue;
      allowed++;
      assert(book.pageCount >= 24 && book.pageCount <= book.trim.maxPages, 'page count ' + book.pageCount);
      assert(!scan.outside.length && !scan.smallFont.length && !scan.thinLine.length, 'content problem allowed');
      assert(book.margins.inside >= KDP.minGutter(book.pageCount) && Math.min(s.margins.outside, s.margins.top, s.margins.bottom) >= 0.25, 'margins');
      assert(L.perPageOptions(s).filter(o => o.n === s.perPage)[0].cellPt >= 24, 'cells');
    }
    return N + ' random settings, ' + allowed + ' downloadable, all within the rules';
  });

  await test('text: unsupported characters are removed, long words wrap', () => {
    assert(T.clean('Killer\u{1F600} Sudoku\t  Book') === 'Killer Sudoku Book', T.clean('Killer\u{1F600} Sudoku\t  Book'));
    const lines = T.wrap('Supercalifragilisticexpialidocious', 'serifBold', 40, 3);
    assert(lines.length > 1 && lines.every(l => T.width(l, 'serifBold', 40) <= 3 + 1e-9), 'wrap');
  });

  // ---------------------------------------------------------------- PDF
  const python = findPython();
  for (const trim of KDP.TRIMS) {
    await test('PDF ' + trim.label + ': trim-size pages, embedded fonts, vector only, clean file' + (python ? ' (verified with PyMuPDF)' : ''), async () => {
      const s = settingsWith({ trim: trim.key, count: 120, author: 'Jane Doe', header: true });
      s.pages.thanks = true;
      if (!L.perPageOptions(s).filter(o => o.n === s.perPage)[0].ok) s.perPage = 1;
      const book = L.build(s, bigBook.puzzles.slice(0, 120), 1);
      const t0 = Date.now();
      const res = await KS.Pdf.exportBook(book, {});
      const ms = Date.now() - t0;
      const file = path.join(OUT, res.fileName);
      fs.writeFileSync(file, Buffer.from(res.bytes));
      assert(res.fileName === 'killer-sudoku-interior-' + trim.key + '-' + book.pageCount + 'p.pdf', res.fileName);
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
    const s = settingsWith({ count: 520, perPage: 2 });
    const book = L.build(s, bigBook.puzzles.length >= 520 ? bigBook.puzzles.slice(0, 520) : fakePuzzles(520), 1);
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
