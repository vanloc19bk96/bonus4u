/*
 * run.js: automated checks for Slitherlink Puzzle Prints (puzzles, layout, KDP rules, PDF).
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

const E = KS.engine, S = KS.Settings, L = KS.Layout, C = KS.Checks, KDP = KS.KDP, G = KS.Grid;
const QUICK = process.argv.includes('--quick');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'slitherlink-tests-'));
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
async function makeBook(seed, count, difficulty, size) {
  size = size || '10';
  const slots = S.puzzlePlan(count, difficulty, null, size);
  const res = await pool(slots.map(sl => ({ seed: String(seed), size: sl.grid, level: sl.level, ordinal: sl.ordinal })));
  return { slots, res, puzzles: res.map(r => r.puzzle) };
}

function settingsWith(over) {
  const s = S.defaults();
  s.seed = 4242;
  return Object.assign(s, over || {});
}

// Stand-in puzzles for layout tests: one real puzzle per grid size, reused.
const EXAMPLES = {};
function fakePuzzles(n, size) {
  const plan = S.puzzlePlan(n, 'easy', null, size || '10');
  return plan.map(sl => {
    if (!EXAMPLES[sl.grid]) EXAMPLES[sl.grid] = E.generate('layout-example', sl.grid, 'easy', 0, 0);
    return EXAMPLES[sl.grid];
  });
}

function scanAll(book) {
  const bad = [];
  for (let i = 0; i < book.pageCount; i++) {
    const page = book.renderPage(i);
    assert(page.w === book.trim.w && page.h === book.trim.h, 'page size');
    const r = C.scanPage(page);
    if (r.outside || r.smallFont || r.thinLine || r.lightInk) bad.push((i + 1) + ' ' + book.pages[i].type + ' ' + JSON.stringify(r));
  }
  return bad;
}

async function main() {
  console.log('Output folder: ' + OUT);
  let bigBook = null;

  // ---------------------------------------------------------------- puzzles
  const BIG = QUICK ? 120 : 600;
  await test('a ' + BIG + '-puzzle 10x10 Easy to Expert book: every puzzle valid, proved unique by logic and by brute force', async () => {
    bigBook = await makeBook(777, BIG, 'easy-expert');
    const bad = bigBook.res.filter(r => r.problems.length);
    assert(!bad.length, bad.length + ' bad puzzles, e.g. ' + JSON.stringify(bad[0] && bad[0].problems));
    const per = {}, clues = {};
    bigBook.slots.forEach((sl, i) => {
      per[sl.level] = (per[sl.level] || 0) + 1;
      clues[sl.level] = (clues[sl.level] || 0) + bigBook.puzzles[i].clueCount;
    });
    Object.keys(clues).forEach(l => { clues[l] = Math.round(clues[l] / per[l]) + '%'; });
    const ms = bigBook.res.map(r => r.ms);
    return JSON.stringify(per) + ', clues per 100 cells ' + JSON.stringify(clues) + '; checks: one closed loop, numbers match it, logic finishes on that loop, brute-force count = 1; avg ' +
      Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) + ' ms/puzzle';
  });

  await test('difficulty: each puzzle needs its level\'s techniques and nothing harder', () => {
    const wrong = bigBook.res.filter((r, i) => {
      const rules = E.levelRules(10, bigBook.slots[i].level);
      return r.tier < rules.minTier || r.tier > rules.tier;
    });
    assert(!wrong.length, wrong.length + ' puzzles rated at another level');
    const lower = bigBook.res.filter(r => r.lower).length;
    assert(!lower, lower + ' puzzles solvable with simpler techniques than their level');
    return 'all ' + bigBook.res.length + ' rated at their level; none solvable a level lower';
  });

  await test('no duplicate puzzles or loops', () => {
    const keys = new Set(bigBook.puzzles.map(p => p.key));
    assert(keys.size === bigBook.puzzles.length, (bigBook.puzzles.length - keys.size) + ' duplicates');
    const loops = new Set(bigBook.puzzles.map(p => p.inside));
    assert(loops.size === bigBook.puzzles.length, 'loops repeat: ' + loops.size);
    return keys.size + ' distinct puzzles, ' + loops.size + ' distinct loops';
  });

  await test('the numbers look like the bestsellers: mostly 1s, 2s and 3s, few 0s', () => {
    const hist = [0, 0, 0, 0];
    bigBook.puzzles.forEach(p => { for (const ch of p.clues) if (ch !== '.') hist[+ch]++; });
    const tot = hist.reduce((a, b) => a + b);
    const pct = hist.map(h => Math.round(h / tot * 100));
    assert(pct[0] <= 15 && pct[2] >= 25 && pct[3] >= 12, 'number mix ' + pct.join('/'));
    return '0/1/2/3 = ' + pct.join('% / ') + '%';
  });

  await test('every grid size and level: valid, unique, at its level', async () => {
    const out = [];
    for (const n of E.SIZES) {
      const per = n >= 20 ? (QUICK ? 1 : 2) : (QUICK ? 2 : 6);
      const jobs = [];
      E.SIZE_LEVELS[n].forEach(level => { for (let k = 0; k < per; k++) jobs.push({ seed: 'sv', size: n, level, ordinal: k }); });
      const res = await pool(jobs);
      const bad = res.filter(r => r.problems.length || r.lower);
      assert(!bad.length, bad.length && n + ': ' + bad.length + ' bad, e.g. ' + JSON.stringify(bad[0].problems) + ' lower=' + bad[0].lower);
      res.forEach(r => {
        const rules = E.levelRules(n, r.puzzle.level);
        assert(r.tier >= rules.minTier && r.tier <= rules.tier, 'tier ' + r.tier + ' for ' + n + ' ' + r.puzzle.level);
        assert(r.puzzle.size === n, 'size');
      });
      const worst = Math.max.apply(null, res.map(r => r.ms));
      out.push(n + 'x' + n + ' ' + res.length + ' (slowest ' + (worst / 1000).toFixed(1) + ' s)');
    }
    let threw = false;
    try { E.generate(1, 5, 'hard', 0, 0); } catch (e) { threw = true; }
    assert(threw, '5x5 hard should be refused');
    return out.join(', ');
  });

  await test('the logic solver is sound: on random number sets it never contradicts the real loop', () => {
    // Every number set taken from a real loop has that loop as a solution, so every edge
    // the solver decides must agree with it, and it may never report a contradiction.
    let sets = 0, decided = 0;
    for (const n of [5, 7, 10, 15]) {
      for (let s = 0; s < (QUICK ? 30 : 120); s++) {
        const rng = E.makeRng('sound' + n + '/' + s), g = E.geo(n, n);
        const inside = E.internals.randomLoop(n, n, rng), on = E.internals.loopEdges(g, inside), full = E.internals.cluesOf(g, on);
        const clues = Int8Array.from(full).map(v => (rng.float() < 0.2 + rng.float() * 0.5 ? v : -1));
        for (const t of [1, 2, 3, 4]) {
          const r = E.rate(g, clues, t);
          assert(!r.broken, 'false contradiction at ' + n + '/' + s + ' tier ' + t);
          for (let e = 0; e < g.E; e++) {
            if (!r.state.e[e]) continue;
            decided++;
            assert((r.state.e[e] === 1) === (on[e] === 1), 'wrong edge at ' + n + '/' + s + ' tier ' + t);
          }
        }
        sets++;
      }
    }
    return sets + ' number sets x 4 tiers, ' + decided + ' decided edges, all agree with the loop';
  });

  await test('logic and brute force agree: whenever logic finishes, brute force finds exactly one loop', () => {
    let solved = 0, total = 0;
    for (const n of [5, 6, 7]) {
      for (let s = 0; s < (QUICK ? 50 : 200); s++) {
        const rng = E.makeRng('agree' + n + '/' + s), g = E.geo(n, n);
        const inside = E.internals.randomLoop(n, n, rng), on = E.internals.loopEdges(g, inside), full = E.internals.cluesOf(g, on);
        const clues = Int8Array.from(full).map(v => (rng.float() < 0.35 + rng.float() * 0.3 ? v : -1));
        total++;
        const r = E.rate(g, clues, 4);
        const count = E.countSolutions(g, clues, 2, 3000000);
        assert(count >= 1, 'brute force found no loop at ' + n + '/' + s);
        if (r.solved) { solved++; assert(count === 1, 'logic finished but there are ' + count + ' loops at ' + n + '/' + s); }
      }
    }
    return total + ' number sets, logic finished ' + solved + ', each confirmed unique';
  });

  await test('same seed and settings give the same puzzles (two runs)', async () => {
    const a = await makeBook(31337, 24, 'easy-hard');
    const b = await makeBook(31337, 24, 'easy-hard');
    a.puzzles.forEach((p, i) => assert(p.key === b.puzzles[i].key && p.inside === b.puzzles[i].inside, 'puzzle ' + (i + 1) + ' differs'));
    const c = await makeBook(31338, 24, 'easy-hard');
    assert(c.puzzles.every((p, i) => p.key !== a.puzzles[i].key), 'a new seed should give new puzzles');
    const d = await makeBook(31337, 24, 'easy-hard', '7');
    assert(d.puzzles.every(p => p.size === 7), 'size ignored');
    return '24 puzzles identical; a different seed or size gives different puzzles';
  });

  await test('generator orchestration (page fallback path) is deterministic and reuses work', async () => {
    function run(count, difficulty, gen, size) {
      return new Promise(resolve => {
        gen = gen || new KS.Generator(() => {});
        gen.onChange = st => { if (!st.running && st.ready === st.total) resolve({ gen, st }); };
        gen.setPlan(99, S.puzzlePlan(count, difficulty, null, size || '7'));
      });
    }
    const first = await run(12, 'easy');
    const second = await run(12, 'easy');
    first.st.puzzles.forEach((p, i) => assert(p.key === second.st.puzzles[i].key, 'slot ' + i + ' differs'));
    const cached = first.gen.cache.size;
    const more = await run(15, 'easy', first.gen);
    assert(first.gen.cache.size === cached + 3, 'raising the count should only make the 3 new puzzles');
    more.st.puzzles.slice(0, 12).forEach((p, i) => assert(p.key === first.st.puzzles[i].key, 'kept puzzle changed'));
    const mixed = await run(12, 'easy', first.gen, 'mix-7-10-12');
    assert(mixed.st.puzzles.map(p => p.size).join(',') === '7,7,7,7,10,10,10,10,12,12,12,12', 'mixed sizes ' + mixed.st.puzzles.map(p => p.size));
    return 'raising 12 to 15 generated only 3 puzzles; a mixed book runs 7, 10, 12';
  });

  await test('puzzle plan: levels easiest first, grids smallest first inside a level, small grids fold levels', () => {
    const p = S.puzzlePlan(200, 'easy-expert');
    const order = { easy: 0, medium: 1, hard: 2, expert: 3 };
    for (let i = 1; i < p.length; i++) assert(order[p[i].level] >= order[p[i - 1].level], 'not ordered at ' + i);
    ['easy', 'medium', 'hard', 'expert'].forEach(l => assert(p.filter(x => x.level === l).length === 50, l));
    const m = S.puzzlePlan(180, 'easy-hard', null, 'mix-10-15-20');
    for (let i = 1; i < m.length; i++) {
      if (m[i].level === m[i - 1].level) assert(m[i].grid >= m[i - 1].grid, 'grids not ascending at ' + i);
    }
    assert(m.filter(x => x.level === 'easy' && x.grid === 15).length === 20, 'even split per grid');
    const five = S.puzzlePlan(100, 'mix', { easy: 25, medium: 25, hard: 25, expert: 25 }, '5');
    assert(!five.some(x => x.level === 'hard' || x.level === 'expert') && five.filter(x => x.level === 'medium').length === 75, 'levels not folded');
    assert(!S.difficultyOk('easy-hard', '5') && S.difficultyOk('easy-medium', '5') && !S.difficultyOk('easy-expert', '7') && !S.difficultyOk('hard-expert', 'mix-7-10-12'), 'difficultyOk');
    assert(S.mixError({ easy: 25, medium: 25, hard: 25, expert: 25 }) === '', 'valid mix rejected');
    assert(/add up to 90%/.test(S.mixError({ easy: 30, medium: 30, hard: 30, expert: 0 })), 'sum not checked');
    const q = S.puzzlePlan(210, 'easy-expert');
    const keys = new Set(q.map(x => x.level + x.grid + '/' + x.ordinal));
    assert(p.every(x => keys.has(x.level + x.grid + '/' + x.ordinal)), 'a bigger book should contain every slot of the smaller one');
    const sub = S.autoSubtitle(settingsWith({ count: 120, size: '7' }));
    assert(sub === '120 Easy to Hard 7x7 Loop Puzzles with Solutions', sub);
    const subMix = S.autoSubtitle(settingsWith({ count: 180, size: 'mix-10-15-20' }));
    assert(subMix === '180 Easy to Hard 10x10 to 20x20 Loop Puzzles with Solutions', subMix);
    assert(S.puzzleKey(settingsWith({ size: '7' })) !== S.puzzleKey(settingsWith({ size: '10' })), 'size not in the puzzle key');
  });

  await test('every preset builds a valid book', () => {
    const out = [];
    S.PRESETS.forEach(p => {
      const s = settingsWith(p.values);
      const opt = L.perPageOptions(s).filter(o => o.n === s.perPage)[0];
      assert(opt.ok, p.key + ': ' + s.perPage + ' per page unavailable (' + opt.cellPt.toFixed(1) + ' pt)');
      assert(S.difficultyOk(s.difficulty, s.size), p.key + ': invalid combination');
      const book = L.build(s, fakePuzzles(s.count, s.size), 1);
      assert(book.pageCount >= 24 && book.pageCount <= book.trim.maxPages, p.key + ' pages ' + book.pageCount);
      const bad = scanAll(book);
      assert(!bad.length, p.key + ': ' + bad[0]);
      out.push(p.key + ' ' + book.pageCount + 'p ' + opt.cellPt.toFixed(0) + 'pt');
    });
    return out.join(', ');
  });

  // ---------------------------------------------------------------- layout
  await test('puzzle numbers match solution labels, "Solution on page N" is right, the right grid is printed', () => {
    const n = Math.min(200, bigBook.puzzles.length);
    const s = settingsWith({ count: n, difficulty: 'easy-expert' });
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
        checked++;
      }
    });
    // The puzzle page prints exactly the puzzle's numbers, in reading order.
    const pz = book.puzzles[0], out = [];
    G.puzzle(out, pz, 0, 0, 4);
    const printed = out.filter(c => c.t === 'text').map(c => c.text).join('');
    assert(printed === pz.clues.replace(/\./g, ''), 'printed numbers differ');
    return checked + ' puzzles cross-checked';
  });

  await test('solution grids: one closed line along the loop, inside shaded, numbers in gray', () => {
    let checked = 0;
    bigBook.puzzles.slice(0, 60).forEach(pz => {
      const out = [], shape = G.shapeOf(pz), n = pz.size;
      G.solution(out, pz, 0, 0, 3, { shade: true });
      const paths = out.filter(c => c.t === 'path' && c.w > 1.1);
      assert(paths.length === 1 && paths[0].closed, 'expected one closed loop line');
      const pts = paths[0].pts, cell = 3 / (n + 2 * G.MARGIN), o = G.MARGIN * cell;
      const loopLen = shape.on.reduce((a, b) => a + b, 0);
      assert(pts.length / 2 === loopLen, 'loop has ' + pts.length / 2 + ' corners, expected ' + loopLen);
      const g = E.geo(n, n), seen = new Set();
      for (let k = 0; k < pts.length / 2; k++) {
        const a = [Math.round((pts[k * 2 + 1] - o) / cell), Math.round((pts[k * 2] - o) / cell)];
        const j = (k + 1) % (pts.length / 2);
        const b = [Math.round((pts[j * 2 + 1] - o) / cell), Math.round((pts[j * 2] - o) / cell)];
        assert(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1, 'segment is not between neighbouring dots');
        const e = a[0] === b[0] ? g.h(a[0], Math.min(a[1], b[1])) : g.v(Math.min(a[0], b[0]), a[1]);
        assert(shape.on[e] && !seen.has(e), 'segment off the loop or repeated');
        seen.add(e);
      }
      const shaded = out.filter(c => c.t === 'rect').length;
      assert(shaded === pz.inside.split('').filter(x => x === '1').length, 'shading');
      assert(out.filter(c => c.t === 'text').every(c => c.ink < 1 && c.ink >= 0.1), 'numbers should be gray');
      checked++;
    });
    return checked + ' solutions traced edge by edge';
  });

  await test('levels and grid sizes start on fresh pages; the contents page lists the right pages', () => {
    const s = settingsWith({ count: 101, difficulty: 'easy-expert', perPage: 4, header: 'level' });
    const book = L.build(s, bigBook.puzzles.slice(0, 101), 1);
    book.pages.forEach(pg => {
      if (pg.type !== 'puzzles') return;
      for (let k = 0; k < pg.n; k++) assert(book.slots[pg.first + k].level === pg.level, 'mixed levels on one page');
    });
    const rows = L.contentsRows(book);
    rows.forEach(r => {
      const pg = book.pages[r.page - 1];
      if (r.text === 'How to Play') assert(pg.type === 'howto', 'how to play page');
      else if (r.text === 'Solving Tips') assert(pg.type === 'tips', 'tips page');
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
    // A mixed-size book: every page holds one grid size; contents name each size.
    const ms = settingsWith({ count: 60, size: 'mix-7-10-12', perPage: 4 });
    const mb = L.build(ms, fakePuzzles(60, 'mix-7-10-12'), 1);
    mb.pages.forEach(pg => {
      if (pg.type !== 'puzzles') return;
      for (let k = 0; k < pg.n; k++) assert(mb.slots[pg.first + k].grid === pg.grid, 'two grid sizes on one page');
    });
    const mrows = L.contentsRows(mb).filter(r => / Puzzles /.test(r.text)).map(r => r.text);
    assert(mrows.length === 9 && mrows[0] === 'Easy Puzzles 7 × 7' && mrows[8] === 'Hard Puzzles 12 × 12', mrows.join(' | '));
    return rows.map(r => r.text + ' p' + r.page).join(', ');
  });

  await test('How to Play and Solving Tips pages: example puzzle and all eight patterns drawn', () => {
    const book = L.build(settingsWith({ count: 60 }), fakePuzzles(60), 1);
    const howto = book.renderPage(book.pages.findIndex(p => p.type === 'howto'));
    const tips = book.renderPage(book.pages.findIndex(p => p.type === 'tips'));
    const ht = howto.commands.filter(c => c.t === 'text').map(c => c.text);
    assert(ht.indexOf('How to Play') >= 0 && ht.indexOf('Example puzzle') >= 0 && ht.indexOf('Its solution') >= 0, 'how to play text');
    assert(howto.commands.filter(c => c.t === 'path' && c.w > 1.1).length === 1, 'example solution loop');
    const ex = L.exampleFor();
    assert(ex && ex.size === 7 && !E.validate(ex, { count: true }).length, 'example puzzle invalid');
    const tt = tips.commands.filter(c => c.t === 'text').map(c => c.text).join(' ');
    assert(/Solving Tips/.test(tt) && /small loop/.test(tt) && /0 has no line/.test(tt), 'tips text');
    const discs = tips.commands.filter(c => c.t === 'disc').length;
    assert(discs > 40, 'tip diagrams missing (' + discs + ' dots)');
    const off = L.build(settingsWith({ count: 60, pages: Object.assign({}, S.defaults().pages, { tips: false }) }), fakePuzzles(60), 1);
    assert(!off.pages.some(p => p.type === 'tips'), 'tips page should be optional');
    return discs + ' dots in the tip diagrams';
  });

  await test('every book size, layout, grid and option: nothing crosses the margins, text >= 7 pt, lines >= 0.75 pt', () => {
    const rows = [];
    KDP.TRIMS.forEach(trim => {
      S.PER_PAGE.forEach(pp => {
        [false, true].forEach(extras => {
          ['5', '10', '25', 'mix-10-15-20'].forEach(size => {
            const s = settingsWith({
              trim: trim.key, perPage: pp, count: 40, size, difficulty: size === '5' ? 'easy-medium' : 'easy-hard',
              author: extras ? 'A Very Long Author Name Indeed' : '', header: extras ? 'level' : 'none',
              labelStyle: extras ? 'badge' : 'plain', guides: extras, solutionShade: !extras, solutionClues: !extras
            });
            const opt = L.perPageOptions(s).filter(o => o.n === pp)[0];
            if (!opt.ok) return;
            const book = L.build(s, fakePuzzles(40, size), 1);
            const bad = scanAll(book);
            assert(!bad.length, trim.key + ' ' + pp + '/page ' + size + ': ' + bad[0]);
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
      ['10', '25'].forEach(size => {
        const opts = L.perPageOptions(settingsWith({ trim: trim.key, size }));
        opts.forEach(o => assert(o.ok === (o.cellPt >= KDP.MIN_CELL_PT - 1e-9), 'threshold'));
        out.push(trim.key + ' ' + size + ': ' + opts.filter(o => o.ok).map(o => o.n).join('/'));
      });
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
      const size = rng.pick(S.SIZES).key;
      const s = settingsWith({
        trim: rng.pick(KDP.TRIMS).key,
        perPage: rng.pick(S.PER_PAGE),
        count: rng.pick([10, 11, 23, 40, 57, 99, 150, 151, 333, 500, 777, 1000]),
        difficulty: rng.pick(S.DIFFICULTIES.filter(d => S.difficultyOk(d.key, size))).key,
        size,
        header: rng.pick(['none', 'title', 'level']),
        labelStyle: rng.pick(['plain', 'badge']),
        guides: rng.int(2) === 1,
        solutionShade: rng.int(2) === 1,
        solutionClues: rng.int(2) === 1,
        pageNumbers: rng.int(4) > 0,
        solutionRef: rng.int(4) > 0,
        author: rng.pick(['', 'Jo', 'Professor Bartholomew Montgomery-Smythe the Third']),
        title: rng.pick(['Slitherlink', 'The Enormous Ultimate Collection of Fiendishly Hard Loop the Loop Puzzles for Clever Adults and Seniors'])
      });
      s.pages = { title: rng.int(5) > 0, copyright: rng.int(5) > 0, contents: rng.int(2) === 1, howTo: rng.int(5) > 0, tips: rng.int(3) > 0, thanks: rng.int(2) === 1 };
      s.margins = {
        autoInside: rng.int(2) === 1, inside: rng.pick([0.375, 0.5, 0.9, 1.5]),
        outside: rng.pick([0.25, 0.5, 1, 1.5]), top: rng.pick([0.25, 0.5, 1.5]), bottom: rng.pick([0.25, 0.75, 1.5])
      };
      const ok = L.perPageOptions(s).filter(o => o.n === s.perPage)[0].ok;
      if (!ok) continue; // the app switches to an available option before building
      const book = L.build(s, fakePuzzles(s.count, s.size), 1);
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
      assert(!scan.outside.length && !scan.smallFont.length && !scan.thinLine.length && !scan.lightInk.length, 'content problem allowed: ' + JSON.stringify(scan).slice(0, 200));
      assert(book.margins.inside >= KDP.minGutter(book.pageCount) && Math.min(s.margins.outside, s.margins.top, s.margins.bottom) >= 0.25, 'margins');
      assert(L.perPageOptions(s).filter(o => o.n === s.perPage)[0].cellPt >= KDP.MIN_CELL_PT, 'cells');
    }
    return N + ' random settings, ' + allowed + ' downloadable, all within the rules';
  });

  // ---------------------------------------------------------------- PDF
  const python = findPython();
  for (const trim of KDP.TRIMS) {
    await test('PDF ' + trim.label + ': trim-size pages, embedded fonts, vector only, clean file' + (python ? ' (verified with PyMuPDF)' : ''), async () => {
      const s = settingsWith({ trim: trim.key, count: 120, author: 'Jane Doe', header: 'title', difficulty: 'easy-expert', labelStyle: 'badge', guides: true });
      if (!L.perPageOptions(s).filter(o => o.n === s.perPage)[0].ok) s.perPage = 2;
      const book = L.build(s, bigBook.puzzles.slice(0, 120), 1);
      const t0 = Date.now();
      const res = await KS.Pdf.exportBook(book, {});
      const ms = Date.now() - t0;
      const file = path.join(OUT, res.fileName);
      fs.writeFileSync(file, Buffer.from(res.bytes));
      assert(res.fileName === 'slitherlink-interior-' + trim.key + '-' + book.pageCount + 'p.pdf', res.fileName);
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
    const s = settingsWith({ count: 560, perPage: 2, difficulty: 'easy-expert' });
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
