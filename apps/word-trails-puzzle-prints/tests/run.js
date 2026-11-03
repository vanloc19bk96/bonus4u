/*
 * node tests/run.js
 * Reader, puzzle engine (the rules and the one-solution proof), prompts, adding replies, every trim
 * x text size x grid size against the KDP margins and minimums, every cover template, and real PDFs
 * (checked with PyMuPDF through tests/verify-pdf.py when Python has it).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const env = require('./node-env.js');
const S = require('./sample-replies.js');
const CX = env.loadAll();

let failed = 0, passed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log('ok   ' + name); }, (e) => { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); });
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected true'); }

// A project with every puzzle filled from the sample packs, and the extras in.
function fullProject(mut, count) {
  const p = CX.plan.newProject();
  p.seed = 'test-book';
  p.book.author = 'Bright Trail Press';
  p.plan.count = count || S.PACKS.length;
  if (mut) mut(p);
  CX.prompts.list(p).forEach((pr) => {
    if (pr.kind !== 'puzzles') return;
    CX.content.addReply(p, CX.reader.readPuzzles(S.reply(pr.puzzles.map((x) => x.no))), pr.puzzles);
  });
  CX.content.addExtras(p, CX.reader.readExtras(S.EXTRAS));
  return p;
}

const F = CX.metrics.load();
function textWidth(it) { return F[it.font].width(it.str, it.size, it.ls || 0); }

// Every item inside the page's safe area, and the KDP minimums.
function checkPage(pg) {
  const tol = 0.6;
  pg.items.forEach((it) => {
    if (it.t === 'text') {
      ok(it.size >= CX.kdp.MIN_FONT_PT, 'text under 7 pt on page ' + pg.num + ': ' + it.str + ' ' + it.size);
      const w = textWidth(it);
      ok(it.x >= pg.x0 - tol && it.x + w <= pg.x1 + tol, 'text outside the margins on page ' + pg.num + ' (' + pg.label + '): "' + it.str + '" x ' + it.x.toFixed(1) + '-' + (it.x + w).toFixed(1) + ' of ' + pg.x0.toFixed(1) + '-' + pg.x1.toFixed(1));
      ok(it.y - it.size * 0.8 >= pg.y0 - tol && it.y <= pg.y1 + tol, 'text outside top/bottom on page ' + pg.num + ' (' + pg.label + '): ' + it.str);
    } else if (it.t === 'line') {
      ok(it.w >= CX.kdp.MIN_LINE_PT, 'thin line on page ' + pg.num);
      ok(Math.min(it.x1, it.x2) >= pg.x0 - tol && Math.max(it.x1, it.x2) <= pg.x1 + tol, 'line outside margins on page ' + pg.num + ' (' + pg.label + ')');
      ok(Math.min(it.y1, it.y2) >= pg.y0 - tol && Math.max(it.y1, it.y2) <= pg.y1 + tol, 'line outside top/bottom on page ' + pg.num + ' (' + pg.label + ')');
    } else if (it.t === 'rect') {
      if (it.mode === 'stroke') ok(it.lw >= CX.kdp.MIN_LINE_PT, 'thin box on page ' + pg.num);
      ok(it.x >= pg.x0 - tol && it.x + it.w <= pg.x1 + tol && it.y >= pg.y0 - tol && it.y + it.h <= pg.y1 + tol, 'box outside the margins on page ' + pg.num + ' (' + pg.label + ')');
    } else if (it.t === 'poly' || it.t === 'ellipse') {
      if (it.mode === 'stroke') ok(it.lw >= CX.kdp.MIN_LINE_PT, 'thin outline on page ' + pg.num);
      const xs = it.t === 'poly' ? it.pts.filter((v, i) => i % 2 === 0) : [it.cx - it.rx, it.cx + it.rx];
      const ys = it.t === 'poly' ? it.pts.filter((v, i) => i % 2 === 1) : [it.cy - it.ry, it.cy + it.ry];
      const pad = (it.lw || 0) / 2 + 1;   // a band's own width counts too
      ok(Math.min.apply(null, xs) - pad >= pg.x0 - 2 && Math.max.apply(null, xs) + pad <= pg.x1 + 2 && Math.min.apply(null, ys) - pad >= pg.y0 - 2 && Math.max.apply(null, ys) + pad <= pg.y1 + 2,
        'drawing outside the margins on page ' + pg.num + ' (' + pg.label + ')');
    }
    if (it.ink != null) ok(it.ink >= CX.kdp.MIN_GRAY, 'ink lighter than 10% gray on page ' + pg.num);
  });
}

function clash(pg) {
  const b = pg.items.filter((it) => it.t === 'text').map((it) => ({ it, x0: it.x, x1: it.x + textWidth(it), y0: it.y - it.size * 0.72, y1: it.y + it.size * 0.2 }));
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    if (Math.min(b[i].x1, b[j].x1) - Math.max(b[i].x0, b[j].x0) > 0.5 && Math.min(b[i].y1, b[j].y1) - Math.max(b[i].y0, b[j].y0) > 0.5) return b[i].it.str + ' / ' + b[j].it.str;
  }
  return '';
}

(async function main() {
  // ---------- reader ----------
  await test('reader: the asked-for format', () => {
    const r = CX.reader.readPuzzles(S.reply([1, 2]));
    eq(r.puzzles.map((x) => [x.no, x.title, x.span, x.words.length]), [[1, 'Please Take a Seat', 'RECEPTION', 20], [2, 'Going Bananas', 'FRUITBOWL', 20]]);
    eq(r.skipped.length, 0);
    eq(r.puzzles[0].theme, 'Things found in a waiting room');
    eq(CX.reader.kind(S.reply([1])), 'puzzles');
  });

  await test('reader: bold marks, other names, one word to a line, phrases and leftovers', () => {
    const r = CX.reader.readPuzzles(S.MESSY);
    eq(r.puzzles.length, 2);
    const a = r.puzzles[0], b = r.puzzles[1];
    eq([a.no, a.title, a.theme, a.span], [3, 'Going Bananas', 'Fruit in a bowl', 'FRUIT BOWL']);
    eq(a.words, ['APPLE', 'BANANA', 'PEAR', 'ORANGE', 'CAFE']);
    eq(r.skipped.map((s) => s.w).sort(), ['GRAPE-FRUIT', 'K', 'ice cream'].sort());
    eq(b.no, 4);
    eq(b.title, 'Shore Thing');
    eq(b.span, 'SEASIDE');
    eq(b.words, ['SAND', 'TOWEL', 'BUCKET', 'SHELL'], 'the ... the sample leaves is no word');
  });

  await test('reader: a reply with no PUZZLE lines is cut at each new title', () => {
    const r = CX.reader.readPuzzles('TITLE: One\nSPAN: FIRSTWORD\nWORDS: AAAA, BBBB\n\nTITLE: Two\nSPAN: SECONDWORD\nWORDS: CCCC');
    eq(r.puzzles.map((x) => [x.title, x.span, x.words.length]), [['One', 'FIRSTWORD', 2], ['Two', 'SECONDWORD', 1]]);
  });

  await test('reader: the extras reply', () => {
    const e = CX.reader.readExtras(S.EXTRAS);
    ok(/^Welcome to a book/.test(e.welcome[0]));
    eq(e.closing.length, 2);
    ok(/^Each puzzle hides/.test(e.blurb));
    eq(CX.reader.kind(S.EXTRAS), 'extras');
    eq(CX.reader.kind('Sure! Happy to help with your book.'), 'unknown');
  });

  // ---------- engine ----------
  await test('engine: every grid keeps the rules, at every size and level', () => {
    const E = CX.engine;
    CX.plan.GRID_SIZES.forEach((g) => ['easy', 'medium', 'hard'].forEach((level) => {
      let made = 0;
      S.PACKS.forEach((pack, i) => {
        const span = CX.plan.letters(pack[2]);
        if (span.length < Math.min(g.cols, g.rows) || span.length > g.spanMax) return;
        const words = pack[3].split(',').filter((w) => !E.related(w, span) && w.length <= g.maxLen);
        const sets = E.pick(words, g.cols * g.rows - span.length, { min: g.min, max: g.max, seed: 's' + i });
        ok(sets.length, g.id + ' pack ' + i + ': no set adds up');
        sets[0].forEach((w, k) => sets[0].slice(k + 1).forEach((x) => ok(!E.related(w, x), w + ' and ' + x + ' are related')));
        let grid = null;
        for (let k = 0; k < Math.min(8, sets.length) && !grid; k++) grid = E.build({ span, words: sets[k], cols: g.cols, rows: g.rows, level, seed: 'a' + i + k, tries: 50 });
        ok(grid, g.id + '/' + level + ' pack ' + i + ': no grid');
        eq(E.check(grid), [], g.id + '/' + level + ' pack ' + i);
        ok(!E.rudeLines([].concat.apply([], grid.cells), g.cols, g.rows).length, 'no rude word in a line');
        if (level === 'hard') grid.trails.forEach((t) => ok(!E.isStraight(t.path.map((rc) => rc[0] * g.cols + rc[1]), g.cols) || t.w.length < 3, t.w + ' runs dead straight on hard'));
        made++;
      });
      ok(made >= 15, g.id + ' tried only ' + made + ' packs');
    }));
  });

  await test('engine: the same seed gives the same grid, another seed another', () => {
    const o = { span: 'RECEPTION', words: CX.engine.pick('MAGAZINE,CHAIR,CLOCK,DESK,CLIPBOARD,PLANT,LOBBY,SOFA,COFFEE,TELEVISION,POSTER,NURSE'.split(','), 39, { min: 5, max: 8, seed: 'x' })[0], cols: 6, rows: 8, level: 'medium', seed: 'same' };
    eq(CX.engine.build(o).cells, CX.engine.build(o).cells);
    ok(JSON.stringify(CX.engine.build(o).cells) !== JSON.stringify(CX.engine.build(Object.assign({}, o, { seed: 'other' })).cells));
  });

  await test('engine: the checker catches a broken grid and two ways to solve', () => {
    const E = CX.engine;
    // AB/BA read as AB twice in two ways
    eq(E.solutions(['A', 'B', 'B', 'A'], 2, 2, ['AB', 'BA'], 5) > 1, true, 'two ways are counted');
    const g = E.build({ span: 'ORCHARD', words: ['APPLE', 'PLUM', 'PEAR', 'LEMON'], cols: 5, rows: 5, level: 'medium', seed: 'how-to-play', tries: 500 });
    eq(E.check(g), []);
    const bad = JSON.parse(JSON.stringify(g));
    bad.cells[0][0] = bad.cells[0][0] === 'Z' ? 'Q' : 'Z';
    ok(E.check(bad).length, 'a changed letter is caught');
    const short = JSON.parse(JSON.stringify(g));
    short.trails[1].path.pop();
    ok(E.check(short).length, 'an unused square is caught');
    ok(E.rudeLines(['S', 'H', 'I', 'T'], 4, 1).length && E.rudeLines(['T', 'I', 'H', 'S'], 4, 1).length, 'rude words both ways');
  });

  await test('engine: pick only returns sets that add up exactly, and earlier words win', () => {
    const words = 'ALPHA,BRAVO,CHARLIE,DELTA,ECHOES,FOXTROT,GOLFER,HOTELS,INDIAN,JULIET,KILOS,LIMA'.split(',');
    const sets = CX.engine.pick(words, 30, { min: 3, max: 8, seed: 'a' });
    ok(sets.length > 3);
    sets.forEach((s) => eq(s.join('').length, 30));
    eq(CX.engine.pick(['AAAA', 'BBBB'], 5, { min: 1, max: 3 }), [], 'nothing adds up');
    ok(CX.engine.related('CAT', 'CATS') && CX.engine.related('TEA', 'TEAPOT') && CX.engine.related('BAKER', 'BAKERS') && !CX.engine.related('PEAR', 'PLUM'));
  });

  // ---------- puzzles and plan ----------
  await test('puzzles: statuses, levels and titles that give an answer away', () => {
    const p = CX.plan.newProject();
    p.seed = 's';
    p.plan.count = 10;
    const [a] = CX.plan.puzzles(p);
    eq(CX.puzzles.status(p, a).state, 'empty');
    p.puzzles.p1 = Object.assign(CX.plan.emptyPuzzle(), { title: 'Hi', span: 'FRUITBOWL', words: ['APPLE', 'PEAR'] });
    eq(CX.puzzles.status(p, a).state, 'words');
    CX.content.addReply(p, CX.reader.readPuzzles(S.reply([2])), []);
    const b = CX.plan.puzzles(p)[1];
    eq(CX.puzzles.status(p, b).state, 'ok');
    eq(CX.puzzles.titleSpoils(p, b), '');
    // a word in the title (also in another form) is never picked for the grid
    p.puzzles.p2.title = 'An Apple a Day Keeps Oranges Away';
    const inGrid = CX.puzzles.get(p, b).grid.trails.map((t) => t.w);
    ok(inGrid.indexOf('APPLE') === -1 && inGrid.indexOf('ORANGE') === -1, inGrid.join());
    eq(CX.puzzles.titleSpoils(p, b), '');
    p.puzzles.p2.title = 'A Fruitbowl';
    eq(CX.puzzles.titleSpoils(p, b), 'FRUITBOWL');
    // a span too short for the grid, with no word long enough to take its place
    p.puzzles.p3 = Object.assign(CX.plan.emptyPuzzle(), { title: 'x', theme: 'y', span: 'CAT', words: 'ABCD,EFGH,IJKL,MNOP,QRST,UVWX,ABDC,EFHG,IJLK,MNPO,QRTS,UVXW,ACBD,EGFH'.split(',') });
    const st = CX.puzzles.status(p, CX.plan.puzzles(p)[2]);
    eq(st.state, 'weak');
    ok(/at least 6/.test(st.pz.problems[0]), st.pz.problems[0]);
    ok(CX.prompts.needs(p, CX.plan.puzzles(p)[2]).span, 'the prompt asks for a new span word');
    // with a longer word in the list the app needs nobody: that word becomes the span word
    p.puzzles.p3.words = S.PACKS[0][3].split(',');
    const fixed = CX.puzzles.status(p, CX.plan.puzzles(p)[2]);
    eq(fixed.state, 'ok');
    ok(/one of the puzzle’s own words/.test(fixed.pz.note), fixed.pz.note);
    ok(!CX.prompts.needs(p, CX.plan.puzzles(p)[2]).span, 'nothing to ask for once it has a grid');
    // a mixed book moves through the levels
    p.plan.count = 100;
    const lv = CX.plan.puzzles(p).map((x) => CX.plan.levelOf(p, x));
    eq([lv[0], lv[29], lv[30], lv[69], lv[70], lv[99]], ['easy', 'easy', 'medium', 'medium', 'hard', 'hard']);
    p.plan.level = 'hard';
    eq(CX.plan.levelOf(p, CX.plan.puzzles(p)[0]), 'hard');
  });

  await test('puzzles: a stuck puzzle fixes itself, and a puzzle that works keeps its grid', () => {
    const P = CX.plan, E = CX.engine, pz = { id: 'p18', no: 18, index: 17 };
    const WORDS = 'OATMEAL,PANCAKES,COCOA,WAFFLES,TOAST,SYRUP,BACON,EGGS,COFFEE,SAUSAGE,GRITS,CINNAMON,BISCUITS,PORRIDGE'.split(',');
    const make = (span, words, mut) => {
      const p = P.newProject();
      p.seed = 'fix';
      if (mut) mut(p);
      p.puzzles.p18 = Object.assign(P.emptyPuzzle(), { title: 'Rise and Dine', theme: 'Warm food in the morning', span, words: words.slice() });
      return p;
    };
    // the customer's case: one letter too long
    let p = make('WINTER BREAKFAST', WORDS), res = CX.puzzles.get(p, pz);
    ok(res.ok, res.problems[0]);
    eq(res.span, 'BREAKFAST', 'the end of the phrase');
    ok(/WINTER BREAKFAST does not fit/.test(res.note), res.note);
    eq(res.grid.trails.find((t) => t.span).w, 'BREAKFAST');
    eq(E.check(res.grid), []);
    eq(CX.puzzles.spanOf(p, pz), 'BREAKFAST');
    ok(CX.prompts.puzzleDone(p, { id: 'p18', no: 18, index: 17 }), 'nothing left to ask ChatGPT');
    // a small word is never left at the end of a phrase
    p = make('A LONG COLD MORNING OF WINTER', WORDS);
    ok(CX.puzzles.get(p, pz).ok);
    ok(!/^(OF|A)\b|\b(OF|A)$/.test(CX.puzzles.get(p, pz).span), CX.puzzles.get(p, pz).span);
    // the piece of a phrase never gives the title away
    p = make('WINTER SUPERBREAKFAST', WORDS, null);
    p.puzzles.p18.title = 'Superbreakfast Time';
    ok(CX.puzzles.get(p, pz).ok);
    eq(CX.puzzles.titleSpoils(p, pz), '', 'the fix does not spoil the title');
    // words that cannot add up with the usual number of words
    p = make('HOT BREAKFAST', 'EGGS,OATS,MILK,HAMS,PEAR,PLUM,KIWI,LIME,BEAN,CORN,RICE,SOUP,CAKE,TART'.split(','));
    ok(CX.puzzles.get(p, pz).ok, 'one more word on the grid');
    eq(CX.puzzles.get(p, pz).note, '', 'the AI span word stays');
    eq(CX.puzzles.get(p, pz).grid.trails.length, 10, 'nine words of 4 letters and the span word');
    eq(E.check(CX.puzzles.get(p, pz).grid), []);
    // words that cannot add up at all with this span word: a piece of it changes the sum
    p = make('HOT BREAKFAST', 'TOAST,EGGS,BACON,COCOA,SYRUP,GRITS,OATS,HONEY,MILK,BAGEL,SCONE,APPLE'.split(','));
    eq(CX.puzzles.get(p, pz).span, 'BREAKFAST');
    ok(/could not fill the grid/.test(CX.puzzles.get(p, pz).note));
    // the middle of a phrase counts too
    p = make('THE GREAT OUTDOORS IN THE SNOW', WORDS, (x) => { x.plan.audience = 'kids'; });
    eq(CX.puzzles.get(p, pz).span, 'OUTDOORS');
    // no span word at all, and a span word that is one long run of letters
    ['', 'THEVERYBESTOFALLWINTERBREAKFASTS'].forEach((span) => {
      const q = make(span, WORDS), r = CX.puzzles.get(q, pz);
      ok(r.ok, JSON.stringify(span));
      ok(WORDS.indexOf(r.span) !== -1, r.span);
      eq(E.check(r.grid), []);
    });
    // a puzzle that works does not move, whatever else the app can do now
    const q = make('BREAKFAST', WORDS), g = CX.puzzles.get(q, pz).grid.cells;
    const lim = P.limits(q), base = 'fix|p18|0', sets = E.pick(CX.puzzles.usable(q, q.puzzles.p18), lim.cells - 9, { min: lim.min, max: lim.max, seed: base });
    const avoid = CX.puzzles.usable(q, q.puzzles.p18).filter((w) => sets[0].indexOf(w) === -1);
    eq(g, E.build({ span: 'BREAKFAST', words: sets[0], cols: lim.cols, rows: lim.rows, level: 'easy', seed: base + '|0', avoid, tries: 50 }).cells, 'the same grid as before the fix');
  });

  await test('puzzles: every kind of AI slip gets a grid, at every size and for every reader', () => {
    const P = CX.plan, pz = { id: 'p18', no: 18, index: 17 };
    const POOL = 'SNOW,ICE,MITTEN,SCARF,SLED,SKATE,COCOA,FROST,BLIZZARD,SNOWMAN,SWEATER,FIREPLACE,ICICLE,HOCKEY,GLOVES,BOOTS,PARKA,SHOVEL,CHIMNEY,WOOL,EARMUFFS,THERMOS,FLANNEL,QUILT,BLANKET,SKIING,TOBOGGAN,COAT,HATS,LODGE,SLEIGH,PINE,WINDY,CHILL,FREEZE,HAIL,DRIFT,FLAKE,WREATH,CANDLE,LANTERN,CABIN,TUNDRA,POLAR,WALRUS,PENGUIN,REINDEER,CARIBOU,MOOSE,ERMINE,TEA,JAM,HAM,PIE'.split(',');
    const SPANS = ['WINTER BREAKFAST', 'COZY WINTER MORNINGS AT HOME', 'WINTER', 'COLD', '', 'THE GREAT OUTDOORS IN THE SNOW', 'SNOWY'];
    let tried = 0, none = [];
    // the prompts ask for a third of the words long, so a list holds a word that can reach from edge to edge
    const mix = (list, lim, rng) => {
      const long = rng.shuffle(list.filter((w) => w.length >= lim.spanMin)).slice(0, Math.ceil(lim.ask / 3));
      return rng.shuffle(long.concat(rng.shuffle(list.filter((w) => long.indexOf(w) === -1)).slice(0, lim.ask - long.length)));
    };
    P.AUDIENCES.forEach((au) => P.GRID_SIZES.forEach((g) => SPANS.forEach((span, si) => {
      for (let i = 0; i < 6; i++) {
        const p = P.newProject();
        p.seed = 'slip' + i;
        P.setAudience(p.plan, au.id);
        p.plan.size = g.id;
        const lim = P.limits(p), rng = CX.util.makeRng('w' + au.id + g.id + si + i);
        const words = mix(POOL.filter((w) => w.length >= lim.minLen && w.length <= lim.maxLen), lim, rng);
        p.puzzles.p18 = Object.assign(P.emptyPuzzle(), { title: 'A Title', theme: 'A theme', span, words });
        const res = CX.puzzles.get(p, pz);
        // young kids on the big grids: no word of theirs is long enough, so only a span word that fits can work
        if (lim.maxLen < lim.spanMin && !(P.letters(span).length >= lim.spanMin && P.letters(span).length <= lim.spanMax)) continue;
        tried++;
        if (!res.ok) { none.push([au.id, g.id, span, res.problems[0]].join('/')); continue; }
        eq(CX.engine.check(res.grid), [], au.id + '/' + g.id + '/' + span);
      }
    })));
    ok(none.length === 0, none.length + ' of ' + tried + ' have no grid: ' + none.slice(0, 5).join('; '));
  });

  await test('layout: a puzzle with no grid never prints: no blank page, no gap in the numbers, the true count', () => {
    const stuck = 'ABCD,EFGH,IJKL,MNOP,QRST,UVWX,ABDC,EFHG,IJLK,MNPO,QRTS,UVXW,ACBD,EGFH'.split(',');
    const p = fullProject();
    const before = CX.plan.puzzles(p).length;
    p.ai.blurb = 'Enjoy ' + before + ' fun themed puzzles. Open since ' + before + ' years.';
    p.ai.welcome = ['Here are ' + before + ' word trails for you.'];
    p.puzzles.p3 = Object.assign(CX.plan.emptyPuzzle(), { title: 'Rise and Dine', theme: 'x', span: 'CAT', words: stuck });
    eq(CX.puzzles.status(p, CX.plan.puzzles(p)[2]).state, 'weak');
    const n = before - 1;
    const book = CX.layout.layoutBook(p, {});
    const texts = (pg) => pg.items.filter((it) => it.t === 'text').map((it) => it.str).join(' ');
    const puzzles = book.pages.filter((pg) => pg.kind === 'puzzle');
    eq(puzzles.length, n, 'one page a printed puzzle');
    puzzles.forEach((pg, i) => { ok(pg.meta.cell, 'a grid on page ' + pg.num); ok(texts(pg).includes('PUZZLE ' + (i + 1)), 'number ' + (i + 1) + ' on page ' + pg.num); });
    ok(!book.pages.some((pg) => /Rise and Dine/.test(texts(pg))), 'the stuck title is gone');
    book.pages.forEach((pg) => { checkPage(pg); ok(pg.items.some((it) => it.t === 'text'), 'page ' + pg.num + ' is blank'); });
    ok(texts(book.pages[0]).replace(/\s+/g, ' ').startsWith(CX.plan.bookTitle(p)), 'title page');
    ok(CX.plan.bookSubtitle(p).startsWith(n + ' '), 'the subtitle says ' + n);
    ok(texts(book.pages.find((pg) => pg.kind === 'how')).includes(n + ' word trails'), 'the welcome says ' + n);
    const cover = CX.cover.build(p, book.pages.length).items.filter((it) => it.t === 'text').map((it) => it.str).join(' ');
    ok(cover.includes('Enjoy ' + n + ' fun themed puzzles') && cover.includes('since ' + before + ' years') && cover.includes(n + ' large print'), cover.slice(0, 400));
    // the preview still shows the buyer what is missing, and the number they chose
    const draft = CX.layout.layoutBook(p, { draft: true });
    eq(draft.pages.filter((pg) => pg.kind === 'puzzle').length, before);
    ok(draft.pages.some((pg) => /Puzzle 3 goes here/.test(texts(pg))), 'placeholder for the stuck puzzle');
    ok(CX.plan.bookSubtitle(p, true).startsWith(before + ' '), 'the preview keeps the plan');
    // the checklist says why, and how the PDF deals with it
    const items = CX.checklist.run(p, book);
    ok(/puzzle 3 \(/.test(items.find((i) => i.label === 'Grids').detail), 'the reason is in the checklist');
    ok(new RegExp('numbered 1 to ' + n).test(items.find((i) => i.label === 'Puzzles in the PDF').detail));
    // a full stuck puzzle still takes new words, and a new span word
    const full = CX.plan.newProject();
    full.plan.count = 10;
    full.puzzles.p1 = Object.assign(CX.plan.emptyPuzzle(), { title: 'x', theme: 'y', span: 'CAT', words: stuck.concat('ABEF,ABGH,ABIJ,ABKL,ABMN,ABOP,ABQR,ABST,ABUV,ABWX'.split(',')) });
    eq(full.puzzles.p1.words.length, 24);
    CX.content.addReply(full, CX.reader.readPuzzles('PUZZLE 1\nSPAN: RECEPTION\nWORDS: ' + S.PACKS[0][3]), []);
    eq(full.puzzles.p1.span, 'RECEPTION');
    eq(full.puzzles.p1.words.length, 24);
    eq(CX.puzzles.status(full, CX.plan.puzzles(full)[0]).state, 'ok');
  });

  await test('plan: project files keep what they should and repair the rest', () => {
    const p = CX.plan.normalize({ seed: 'a', plan: { count: 9999, size: 'nope', perPage: 7, level: 'wild' }, puzzles: { p1: { title: 'T', theme: 'X', span: 'SPAN', words: ['one', 7, 'TWO'] }, bad: {} }, ai: { welcome: 'no' } });
    eq([p.plan.count, p.plan.size, p.plan.perPage, p.plan.level], [100, '6x8', 1, 'medium']);
    eq(p.puzzles.p1.words, ['ONE', 'TWO']);
    eq(Object.keys(p.puzzles), ['p1']);
    eq(p.ai.welcome, []);
    eq(CX.plan.normalize(JSON.parse(JSON.stringify(fullProject()))).plan.level, 'mixed');
  });

  // ---------- prompts ----------
  await test('prompts: batches, what they ask, and they follow the theme', () => {
    const p = CX.plan.newProject();
    p.plan.count = 25;
    const l = CX.prompts.list(p);
    eq(l.map((x) => x.kind === 'puzzles' ? x.puzzles.length : 'extras'), [10, 10, 5, 'extras']);
    const t = CX.prompts.text(p, l[0]);
    ok(/PUZZLE 1\b/.test(t) && /PUZZLE 10\b/.test(t) && !/PUZZLE 11\b/.test(t));
    ok(/6 by 8 grid of 48 letters/.test(t), 'tells the grid');
    ok(/exactly 14 words/.test(t), 'asks for more than the grid holds');
    ok(/6 to 14 letters/.test(t), 'span length');
    ok(/Snug as a Bug/.test(t), 'sample from the theme');
    ok(!/spangram|strands|new york/i.test(t), 'no game names in the prompts');
    p.plan.theme = 'faith';
    const f = CX.prompts.text(p, l[0]);
    ok(/Bible/.test(f) && /All Aboard/.test(f) && !/Snug as a Bug/.test(f), 'theme drives the sample');
    p.plan.theme = 'custom'; p.plan.customTheme = 'life by the sea';
    ok(/life by the sea/.test(CX.prompts.text(p, l[0])));
    p.plan.audience = 'young'; p.plan.size = '5x6'; p.plan.theme = 'kids';
    const y = CX.prompts.text(p, CX.prompts.list(p)[0]);
    eq(CX.prompts.list(p)[0].puzzles.length, 6, 'fewer puzzles a prompt for young kids');
    ok(/3 to 6 letters/.test(y) && /aged 6 to 8/.test(y), 'young kids rules');
    ok(/WELCOME/.test(CX.prompts.text(p, CX.prompts.list(p).slice(-1)[0])));
    // no game or brand name leaves through the extras either
    ok(/Do not name any newspaper/.test(CX.prompts.text(p, CX.prompts.list(p).slice(-1)[0])));
  });

  await test('prompts: kids get their own titles, words, subjects and notes; adults keep theirs', () => {
    const P = CX.plan;
    const make = (aud, theme) => { const p = P.newProject(); p.plan.count = 12; P.setAudience(p.plan, aud); if (theme) p.plan.theme = theme; return p; };
    ['kids', 'young'].forEach((aud) => P.THEMES.forEach((th) => {
      const p = make(aud, th.id), t = CX.prompts.text(p, CX.prompts.list(p)[0]), at = aud + '/' + th.id;
      ok(!/pun or a common saying|Snug as a Bug|make the solver think/.test(t), at + ': the grown-up title rule');
      ok(/easiest and best-known first/.test(t) && !/strongest first/.test(t), at + ': easy words first');
      ok(/TORNADO/.test(t) && /American/.test(t) && /only grown-ups know/.test(t) && /its own shape/.test(t), at + ': safe subjects, American words, varied titles');
      const ex = CX.prompts.text(p, CX.prompts.list(p).slice(-1)[0]);
      ok(/tell a grown-up/.test(ex) && /speaks to the child/.test(ex) && /for the grown-up who buys/.test(ex), at + ': notes for the child, cover for the buyer');
      ok(/could not read|be able to read/.test(t + CX.prompts.checkText(p, [])), at);
    }));
    const a = make('adults'), t = CX.prompts.text(a, CX.prompts.list(a)[0]);
    ok(/pun or a common saying/.test(t) && /Snug as a Bug/.test(t) && /strongest first/.test(t) && !/TORNADO/.test(t), 'adults keep their rules');
    const y = make('young'), yt = CX.prompts.text(y, CX.prompts.list(y)[0]);
    ok(/about half short \(3 or 4 letters\) and half longer \(5 or 6\)/.test(yt) && !/or more\)/.test(yt), 'no lengths past the limit for young kids');
    const k = make('kids'), kt = CX.prompts.text(k, CX.prompts.list(k)[0]);
    ok(/a third longer \(7 or 8\)/.test(kt), 'kids lengths stay inside the limit');
  });

  await test('prompts: every example obeys the rules it comes with', () => {
    const P = CX.plan, E = CX.engine;
    P.AUDIENCES.forEach((au) => P.GRID_SIZES.forEach((g) => P.THEMES.forEach((th) => {
      const p = P.newProject(); p.plan.count = 12; P.setAudience(p.plan, au.id); p.plan.size = g.id; p.plan.theme = th.id; p.plan.customTheme = 'life by the sea';
      const lim = P.limits(p), t = CX.prompts.text(p, CX.prompts.list(p)[0]), at = au.id + '/' + g.id + '/' + th.id;
      const words = t.match(/^WORDS: (.*), \.\.\.$/m)[1].split(', '), span = P.letters(t.match(/^SPAN: (.*)$/m)[1]), title = t.match(/^TITLE: (.*)$/m)[1].toUpperCase();
      ok(words.length >= 3, at + ': too few words in the example');
      words.forEach((w) => ok(w.length >= lim.minLen && w.length <= lim.maxLen, at + ': ' + w + ' breaks the length rule'));
      words.forEach((w, i) => { ok(!E.related(w, span), at + ': ' + w + ' inside the span word'); words.slice(i + 1).forEach((x) => ok(!E.related(w, x), at + ': ' + w + ' and ' + x)); });
      // the kids' examples are the ones a child-friendly book learns from, so they have to fit its usual grids
      if (au.kid && (g.id === '5x6' || g.id === '6x8')) {
        ok(span.length >= lim.spanMin && span.length <= lim.spanMax, at + ': span word ' + span);
        words.forEach((w) => ok(title.indexOf(w) === -1, at + ': ' + w + ' is in the title'));
        ok(words.length >= 6, at + ': too few words in the example');
      }
    })));
  });

  await test('plan: choosing who solves it sets what fits them, and only what fits', () => {
    const P = CX.plan, p = P.newProject(), pl = p.plan;
    P.setAudience(pl, 'young');
    eq([pl.size, pl.level, pl.theme], ['5x6', 'easy', 'kids']);
    P.setAudience(pl, 'kids');
    eq([pl.size, pl.level, pl.theme], ['6x8', 'easy', 'kids']);
    eq([P.limits(p).spanMin, P.limits(p).spanMax], [6, 10]);
    P.setAudience(pl, 'adults');
    eq([pl.size, pl.level, pl.theme], ['6x8', 'mixed', 'mix'], 'nothing left over from a kid book');
    eq(P.limits(p).spanMax, 14);
    pl.theme = 'faith';
    P.setAudience(pl, 'young');
    eq(pl.theme, 'faith', 'a theme chosen on purpose stays');
    eq([P.limits(p).spanMin, P.limits(p).spanMax], [5, 8]);
    pl.size = '7x9';
    eq(P.limits(p).spanMax, 15, 'short words in a big grid need the long span word');
    pl.size = '5x6';
    p.puzzles.p1 = Object.assign(P.emptyPuzzle(), { title: 'x', theme: 'y', span: 'FARM ANIMALS', words: [] });
    ok(/8 is the most/.test(CX.puzzles.spanProblem(p, p.puzzles.p1)), 'a long span word is sent back');
  });

  await test('layout: the kids How to Play page fits and speaks plainly', () => {
    ['kids', 'young'].forEach((aud) => CX.kdp.TRIMS.forEach((t) => Object.keys(CX.layout.PRINT).forEach((pr) => {
      const p = fullProject((q) => { q.book.trim = t.id; q.book.print = pr; CX.plan.setAudience(q.plan, aud); }, 12);
      const how = CX.layout.layoutBook(p, {}).pages.filter((pg) => pg.kind === 'how');
      ok(how.length, 'no How to Play page');
      how.forEach((pg) => { checkPage(pg); const c = clash(pg); ok(!c, aud + '/' + t.id + '/' + pr + ': ' + c); });
      const words = how.map((pg) => pg.items.filter((it) => it.t === 'text').map((it) => it.str).join(' ')).join(' ');
      ok(/first clue/.test(words) && !/walls/.test(words) && !/wordplay/.test(words), words.slice(0, 200));
    })));
  });

  await test('prompts: copying again tops up instead of starting over', () => {
    const p = CX.plan.newProject();
    p.plan.count = 10;
    CX.content.addReply(p, CX.reader.readPuzzles(S.reply([1], 6)), []);
    const l = CX.prompts.list(p);
    const t = CX.prompts.text(p, l[0]);
    ok(/PUZZLE 1: its title is "Please Take a Seat", its span word is RECEPTION/.test(t), t.slice(0, 900));
    ok(/exactly 8 more words \(it already has MAGAZINE/.test(t), 'asks for the rest');
    // subjects of other batches are off limits
    CX.content.addReply(p, CX.reader.readPuzzles(S.reply([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])), []);
    p.plan.count = 20;
    ok(/already in the book[^\n]*RECEPTION/.test(CX.prompts.text(p, CX.prompts.list(p)[1])), 'lists used subjects');
    // a finished batch can be sent back for checking
    const c = CX.prompts.checkText(p, CX.prompts.list(p)[0].puzzles);
    ok(/careful puzzle editor/.test(c) && /WORDS: MAGAZINE/.test(c));
  });

  await test('content: a reply fills its puzzles, keeps texts, and a rewrite can replace', () => {
    const p = CX.plan.newProject();
    p.plan.count = 10;
    const first = CX.prompts.list(p)[0];
    const r = CX.content.addReply(p, CX.reader.readPuzzles(S.reply([1, 2])), first.puzzles);
    eq(r.added.map((a) => a.n), [20, 20]);
    ok(CX.prompts.puzzleDone(p, first.puzzles[0]));
    // a top-up never changes the title
    CX.content.addReply(p, CX.reader.readPuzzles('PUZZLE 1\nTITLE: Other\nWORDS: EXTRAWORD'), first.puzzles);
    eq(p.puzzles.p1.title, 'Please Take a Seat');
    ok(p.puzzles.p1.words.indexOf('EXTRAWORD') !== -1);
    // a new version of a puzzle is spotted, and Replace takes its texts
    const again = CX.reader.readPuzzles('PUZZLE 1\nTITLE: New Title\nTHEME: New theme\nSPAN: BRANDNEWSPAN\n' + 'WORDS: MAGAZINE, CHAIR, CLOCK, DESK, CLIPBOARD, PLANT, LOBBY, SOFA, COFFEE, TELEVISION, POSTER, NURSE, PATIENT, VISITOR');
    eq(CX.content.rewrites(p, again, first.puzzles).map((x) => x.pz.id), ['p1']);
    CX.content.addReply(p, again, first.puzzles, ['p1']);
    eq([p.puzzles.p1.title, p.puzzles.p1.span, p.puzzles.p1.words.length], ['New Title', 'BRANDNEWSPAN', 14]);
    // a reply without numbers goes to the open puzzles of the prompt
    CX.content.addReply(p, CX.reader.readPuzzles('TITLE: Loose\nTHEME: T\nSPAN: LOOSESPAN\nWORDS: AAAA, BBBB'), first.puzzles);
    eq(p.puzzles.p3.title, 'Loose');
    // repeats are found
    p.puzzles.p4 = Object.assign(CX.plan.emptyPuzzle(), { title: 'Loose', span: 'loose span', words: [] });
    eq(CX.content.repeats(p).map((x) => x.what).sort(), ['span word', 'title']);
    CX.content.clearPuzzles(p, [first.puzzles[0]]);
    ok(!p.puzzles.p1);
  });

  await test('content: a full book has every prompt done and passes the checklist', () => {
    const p = fullProject();
    ok(CX.prompts.list(p).every((x) => x.done), CX.prompts.list(p).filter((x) => !x.done).map((x) => x.no).join());
    const book = CX.layout.layoutBook(p, {});
    const items = CX.checklist.run(p, book);
    ok(CX.checklist.ready(items), JSON.stringify(items.filter((i) => !i.ok)));
  });

  // ---------- layout ----------
  await test('layout: every trim x text size x grid size x puzzles a page inside the KDP margins, no overlaps', () => {
    const counts = [];
    CX.kdp.TRIMS.forEach((t) => Object.keys(CX.layout.PRINT).forEach((pr) => ['5x6', '6x8', '7x9', '8x10'].forEach((size) => [1, 2].forEach((per) => {
      const p = fullProject((q) => { q.book.trim = t.id; q.book.print = pr; q.plan.size = size; q.plan.perPage = per; });
      const book = CX.layout.layoutBook(p, {}), at = t.id + '/' + pr + '/' + size + '/' + per;
      book.pages.forEach((pg) => { checkPage(pg); const c = clash(pg); ok(!c, 'text overlaps on page ' + pg.num + ' (' + pg.label + ') of ' + at + ': ' + c); });
      ok(book.m.inside >= CX.kdp.margins(book.pages.length).minInside * 72, 'gutter too small for ' + book.pages.length + ' pages');
      const gap = CX.kdp.CLEARANCE * 72 - 0.01;
      book.pages.forEach((pg) => ok(pg.x0 - pg.safe.x0 >= gap && pg.safe.x1 - pg.x1 >= gap && pg.y0 - pg.safe.y0 >= gap && pg.safe.y1 - pg.y1 >= gap, 'content touches the safe area on page ' + pg.num));
      const puzzles = book.pages.filter((pg) => pg.kind === 'puzzle');
      // a span word too short for the big grids gives no grid: those pages have no squares to measure
      const drawn = puzzles.filter((pg) => pg.meta.cell);
      ok(drawn.length >= puzzles.length * 0.6, at + ': only ' + drawn.length + ' grids');
      drawn.forEach((pg) => ok(pg.meta.cell >= 20, at + ': squares ' + pg.meta.cell.toFixed(1) + ' pt on page ' + pg.num));
      // the solutions stay readable
      book.pages.filter((pg) => pg.kind === 'solutions' && pg.meta.solCell).forEach((pg) => ok(pg.meta.solCell >= 14, at + ': solution squares ' + pg.meta.solCell));
      if (size === '6x8' && per === 1 && pr === 'large') counts.push(t.id + ':' + book.pages.length);
    }))));
    console.log('     pages: ' + counts.join(' '));
  });

  await test('layout: book order, page references and what prints on a puzzle page', () => {
    const p = fullProject();
    const book = CX.layout.layoutBook(p, {});
    const kinds = book.pages.map((pg) => pg.kind);
    eq(kinds.slice(0, 2), ['title', 'copyright']);
    eq(kinds[kinds.length - 1], 'closing');
    eq(book.pages[book.refs.hints1 - 1].kind, 'hints');
    eq(book.pages[book.refs.hints2 - 1].kind, 'hints');
    eq(book.pages[book.refs.solutions - 1].kind, 'solutions');
    ok(book.refs.hints1 < book.refs.hints2 && book.refs.hints2 < book.refs.solutions, 'hints come before the solutions');
    const texts = (pg) => pg.items.filter((it) => it.t === 'text').map((it) => it.str).join(' ');
    const how = book.pages.filter((pg) => pg.kind === 'how').map(texts).join(' ');
    ok(how.indexOf('page ' + book.refs.solutions) !== -1 && how.indexOf('page ' + book.refs.hints1) !== -1, 'how-to points at hints and solutions');
    eq(book.pages.filter((pg) => pg.kind === 'level').length, 3, 'a divider before each level');
    // every letter of the grid is on its page, and easy prints first letters while hard prints none
    const easyP = book.pages.find((pg) => pg.meta.puzzle === 'p1');
    const list = CX.plan.puzzles(p);
    const res = CX.puzzles.get(p, list[0]);
    const big = easyP.items.filter((it) => it.t === 'text' && it.font === 'sansBold' && it.size >= 20).map((it) => it.str).join('');
    eq(big, [].concat.apply([], res.grid.cells).join(''), 'the grid letters');
    eq(easyP.items.filter((it) => it.t === 'ellipse').length, 48, 'one ring a letter');
    const small = (pg) => pg.items.filter((it) => it.t === 'text' && it.font === 'sansBold' && /^[A-Z]$/.test(it.str) && it.size < 20).length;
    eq(small(easyP), res.grid.trails.length, 'easy shows one first letter a word');
    const hardP = book.pages.find((pg) => pg.meta.puzzle === 'p' + p.plan.count);
    eq(small(hardP), 0, 'hard gives no letters away');
    ok(!texts(hardP).includes(CX.plan.letters(p.puzzles['p' + p.plan.count].span)), 'hard page does not print the span word');
    // the hints never spoil: the first round has no word of the puzzle except what is in the theme
    const h1 = book.pages[book.refs.hints1 - 1];
    ok(/starts with R and runs/.test(texts(h1)), texts(h1).slice(0, 300));
    ok(!/MAGAZINE/.test(texts(h1)), 'first hints keep the words back');
    // every solution draws its trails, the span word darker, and the letters on top
    const sol = book.pages[book.refs.solutions - 1];
    const rounds = sol.items.filter((it) => it.t === 'ellipse' && it.mode === 'fill');
    ok(rounds.some((b) => b.ink === 0.42) && rounds.some((b) => b.ink === 0.13), 'two grays');
    const firstLetter = sol.items.findIndex((it) => it.t === 'text' && it.font === 'sansBold' && /^[A-Z]$/.test(it.str));
    eq(sol.items[firstLetter - 1].t, 'ellipse', 'the letters go over the rounds');
  });

  await test('layout: the log, hints and stars can be switched off; two a page saves pages', () => {
    const base = CX.layout.layoutBook(fullProject((q) => { q.plan.level = 'medium'; }), {}).pages;
    const off = CX.layout.layoutBook(fullProject((q) => { q.plan.level = 'medium'; q.plan.log = false; q.plan.hints = false; q.plan.stars = false; }), {}).pages;
    ok(off.length < base.length);
    ok(!off.some((pg) => pg.kind === 'log' || pg.kind === 'hints'));
    const starCount = (pgs) => pgs.find((pg) => pg.kind === 'puzzle').items.filter((it) => it.t === 'poly' && it.closed && it.pts.length === 20).length;
    eq([starCount(off), starCount(base)], [1, 4], 'only the span word’s star without stars; three more with them');
    eq(base.filter((pg) => pg.kind === 'level').length, 0, 'no dividers in a one-level book');
    const two = CX.layout.layoutBook(fullProject((q) => { q.plan.level = 'medium'; q.plan.perPage = 2; }), {}).pages;
    eq(two.filter((pg) => pg.kind === 'puzzle').length, Math.ceil(S.PACKS.length / 2), 'two puzzles a page on 8.5 x 11');
    two.filter((pg) => pg.kind === 'puzzle').forEach((pg) => ok(pg.meta.cell >= 26, 'squares stay big'));
    const small = CX.layout.layoutBook(fullProject((q) => { q.book.trim = '6x9'; q.plan.perPage = 2; }), {}).pages;
    eq(small.filter((pg) => pg.kind === 'puzzle').length, S.PACKS.length, 'a small page keeps one');
  });

  await test('layout: a long book grows its gutter and stays within KDP limits', () => {
    const p = fullProject((q) => { q.plan.level = 'hard'; }, 300);
    const book = CX.layout.layoutBook(p, {});
    ok(book.pages.length > 300 && book.pages.length <= CX.kdp.maxPages(p.book.trim, p.book.paper), book.pages.length + ' pages');
    ok(book.m.inside >= CX.kdp.margins(book.pages.length).minInside * 72, 'gutter for ' + book.pages.length + ' pages');
    book.pages.forEach(checkPage);
  });

  await test('layout: long titles and themes stay on their page', () => {
    const LONG = 'A Very Long Puzzle Title That Keeps Going Well Past What Any One Line Could Ever Hold And Then Some More';
    CX.kdp.TRIMS.forEach((t) => {
      const p = fullProject((q) => { q.book.trim = t.id; q.book.print = 'xl'; q.plan.perPage = 2; });
      CX.plan.puzzles(p).forEach((x) => { p.puzzles[x.id].title = LONG; p.puzzles[x.id].theme = LONG + ' ' + LONG; });
      const book = CX.layout.layoutBook(p, {});
      book.pages.forEach((pg) => { checkPage(pg); const c = clash(pg); ok(!c, t.id + ' page ' + pg.num + ' (' + pg.label + '): ' + c); });
    });
  });

  await test('layout: the draft shows placeholders, the print leaves empty parts out', () => {
    const p = CX.plan.newProject();
    const draft = CX.layout.layoutBook(p, { draft: true });
    ok(draft.pages.some((pg) => pg.items.some((it) => it.t === 'text' && /goes here/.test(it.str))), 'placeholder shown');
    draft.pages.forEach(checkPage);
    const print = CX.layout.layoutBook(p, {});
    ok(print.pages.every((pg) => pg.items.every((it) => !(it.t === 'text' && /goes here|Your pen name/.test(it.str)))), 'no placeholder in print');
  });

  // ---------- cover ----------
  function checkCover(cv, name) {
    const g = cv.guides, B = g.bleed;
    ok(!cv.overlapsBarcode, name + ': back text runs into the barcode box');
    cv.items.forEach((it) => {
      if (it.t === 'line') ok(it.w >= CX.kdp.MIN_LINE_PT, name + ': thin line');
      if (it.mode === 'stroke') ok(it.lw >= CX.kdp.MIN_LINE_PT, name + ': thin outline');
      if (it.t !== 'text') return;
      ok(it.size >= CX.kdp.MIN_FONT_PT, name + ': "' + it.str + '" under 7 pt');
      if (it.angle) { ok(it.x < g.spineX1, name + ': slanted text on the front'); return; }
      const w = textWidth(it), front = it.x >= g.spineX1;
      const x0 = front ? g.spineX1 + 0.125 * 72 : B + 0.125 * 72, x1 = front ? cv.W - B - 0.125 * 72 : g.spineX0 - 0.125 * 72;
      ok(it.x >= x0 - 0.5 && it.x + w <= x1 + 0.5, name + ': "' + it.str + '" outside the safe area');
      ok(it.y - it.size * 0.75 >= B + 0.125 * 72 - 0.5 && it.y <= cv.H - B - 0.125 * 72 + 0.5, name + ': "' + it.str + '" too close to top/bottom');
    });
  }

  await test('cover: 30 templates in 3 groups, each with its own palette and layout', () => {
    const D = CX.cover.DESIGNS;
    eq(D.length, 30);
    eq(new Set(D.map((d) => d.id)).size, 30, 'ids unique');
    CX.cover.GROUPS.forEach((gr) => eq(D.filter((d) => d.group === gr.id).length, 10, gr.id));
    D.forEach((d) => {
      ok(CX.coverFronts[d.layout], d.id + ': layout ' + d.layout);
      ok(CX.cover.PALETTES.some((p) => p.id === d.pal), d.id + ': palette ' + d.pal);
    });
    eq(CX.cover.paletteId({ design: 'quiet', palette: '' }), 'cream');
    eq(CX.cover.paletteId({ design: 'bubbles', palette: 'noir' }), 'noir');
  });

  await test('cover: every template x trim, sized by KDP and inside the safe areas', () => {
    CX.kdp.TRIMS.forEach((t) => {
      const p = fullProject((q) => { q.book.trim = t.id; });
      const pages = CX.layout.layoutBook(p, {}).pages.length;
      const dims = CX.kdp.cover(t.id, pages, 'white');
      CX.cover.DESIGNS.forEach((d) => {
        p.cover.design = d.id; p.cover.palette = '';
        const cv = CX.cover.build(p, pages);
        ok(Math.abs(cv.W - dims.width * 72) < 0.01 && Math.abs(cv.H - dims.height * 72) < 0.01, 'cover size');
        checkCover(cv, d.id + '/' + t.id);
      });
    });
  });

  await test('cover: palettes and odd words', () => {
    const cases = [
      () => { },
      (p) => { p.book.title = 'Trails'; p.book.author = ''; p.book.subtitle = ' '; },
      (p) => { p.book.title = 'The Big Enormous Word Trails Puzzle Book for Grandma, Grandpa and the Whole Family'; p.book.subtitle = 'Three hundred large print puzzles with every letter used, hints that never spoil and every solution at the back of the book'; },
      (p) => { p.book.trim = '5x8'; p.book.print = 'regular'; p.book.author = 'A Very Long Pen Name Indeed For Testing Purposes Press'; },
      (p) => { p.book.title = 'Supercalifragilistic Extraordinarily Long Words'; p.book.trim = '6x9'; }
    ];
    cases.forEach((mut, ci) => {
      const p = fullProject(mut);
      const pages = CX.layout.layoutBook(p, {}).pages.length;
      CX.cover.DESIGNS.forEach((d, i) => {
        p.cover.design = d.id;
        p.cover.palette = ci === 0 ? CX.cover.PALETTES[i % CX.cover.PALETTES.length].id : '';
        checkCover(CX.cover.build(p, pages), 'case ' + ci + '/' + d.id + '/' + p.cover.palette);
      });
    });
  });

  await test('cover: spine text only from 79 pages, inside the spine; nothing from the book on the front', () => {
    const p = fullProject();
    const pages = CX.layout.layoutBook(p, {}).pages.length;
    const cv = CX.cover.build(p, Math.max(pages, 90)), g = cv.guides;
    const sp = cv.items.filter((it) => it.angle === -90);
    ok(sp.length === 2, 'title and pen name on the spine');
    sp.forEach((it) => ok(it.x - 0.5 >= g.spineX0 && it.x + it.size <= g.spineX1 + 0.5, 'spine text inside the spine'));
    ok(!CX.cover.build(p, 60).items.some((it) => it.angle), 'no spine text under 79 pages');
  });

  // ---------- PDF ----------
  await test('pdf: interior and cover, checked with PyMuPDF', async () => {
    const p = fullProject();
    const book = CX.layout.layoutBook(p, {});
    const bytes = await CX.pdf.build(book, { fileId: CX.util.hashHex('a') + CX.util.hashHex('b') });
    const cv = CX.cover.build(p, book.pages.length);
    const cbytes = await CX.pdf.buildCover(cv, { fileId: CX.util.hashHex('c') + CX.util.hashHex('d') });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-'));
    const fi = path.join(dir, 'interior.pdf'), fc = path.join(dir, 'cover.pdf');
    fs.writeFileSync(fi, bytes); fs.writeFileSync(fc, cbytes);
    eq(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
    ok(!/\/Producer \(jsPDF/.test(Buffer.from(bytes).toString('latin1')), 'metadata blanked');
    let out;
    try {
      out = execFileSync('python', [path.join(__dirname, 'verify-pdf.py'), fi, String(book.W), String(book.H), String(book.pages.length), fc, String(cv.W), String(cv.H)], { encoding: 'utf8' }).trim();
    } catch (e) {
      if (/No module named|not found|ENOENT/.test(String(e.message) + (e.stderr || ''))) { console.log('     (PyMuPDF not available, deep check skipped)'); return; }
      throw e;
    }
    ok(/^OK/.test(out), out);
    console.log('     ' + out);
  });

  await test('pptx: the Canva copy has every page and opens as a valid package', async () => {
    const zlib = require('zlib');
    function unzip(b) {
      const buf = Buffer.from(b), out = {};
      for (let o = 0; buf.readUInt32LE(o) === 0x04034b50;) {
        const method = buf.readUInt16LE(o + 8), size = buf.readUInt32LE(o + 18), n = buf.readUInt16LE(o + 26), x = buf.readUInt16LE(o + 28);
        const data = buf.slice(o + 30 + n + x, o + 30 + n + x + size);
        out[buf.toString('utf8', o + 30, o + 30 + n)] = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
        o += 30 + n + x + size;
      }
      return out;
    }
    const p = fullProject();
    const book = CX.layout.layoutBook(p, {});
    const files = unzip(await CX.pptx.build(book));
    const slides = Object.keys(files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    eq(slides.length, book.pages.length, 'one slide per page');
    eq(+/cx="(\d+)"/.exec(files['ppt/presentation.xml'].split('sldSz')[1])[1], Math.round(book.W * 12700), 'slide width is the trim width');
    Object.keys(files).forEach((f) => ok(!/[<&](?![a-zA-Z/?!#]|amp;|lt;|gt;|quot;)/.test(files[f]), 'bad XML in ' + f));
    const cfiles = unzip(await CX.pptx.buildCover(CX.cover.build(p, book.pages.length)));
    ok(cfiles['ppt/slides/slide1.xml'] && !cfiles['ppt/slides/slide2.xml'], 'cover is one slide');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
