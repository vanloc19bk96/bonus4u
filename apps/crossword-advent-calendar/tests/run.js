/*
 * node tests/run.js
 * Reader, crossword engine, prompts, adding replies, every trim x text size x grid size against
 * the KDP margins and minimums, every cover template, and real PDFs (checked with PyMuPDF
 * through tests/verify-pdf.py when Python has it).
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

// A project with every day filled from made-up replies, and the extras in.
function fullProject(mut) {
  const p = CX.plan.newProject();
  p.seed = 'test-book';
  p.book.author = 'Snowy Lane Press';
  S.reset();
  if (mut) mut(p);
  const ask = CX.plan.grid(p.plan.size).ask;
  CX.prompts.list(p).forEach((pr) => {
    if (pr.kind !== 'days') return;
    CX.content.addReply(p, CX.reader.readDays(S.fakeReply(pr.days.map((d) => CX.prompts.label(d)), ask, pr.no)), pr.days);
  });
  // a day whose grid came out small gets a few more words, as the user would
  CX.plan.days(p).forEach((d) => {
    for (let i = 0; i < 4 && CX.puzzles.status(p, d).state !== 'ok'; i++) CX.content.addReply(p, CX.reader.readDays(S.fakeReply([CX.prompts.label(d)], 8, 99)), [d]);
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
      const pad = 2;
      ok(Math.min.apply(null, xs) >= pg.x0 - pad && Math.max.apply(null, xs) <= pg.x1 + pad && Math.min.apply(null, ys) >= pg.y0 - pad && Math.max.apply(null, ys) <= pg.y1 + pad,
        'drawing outside the margins on page ' + pg.num + ' (' + pg.label + ')');
    }
    if (it.ink != null) ok(it.ink >= CX.kdp.MIN_GRAY, 'ink lighter than 10% gray on page ' + pg.num);
  });
}

(async function main() {
  // ---------- reader ----------
  await test('reader: the asked-for format, two days', () => {
    const r = CX.reader.readDays(S.CLEAN);
    eq(r.days.map((d) => [d.set, d.no, d.title, d.words.length]), [['main', 1, 'The First Evening', 24], ['main', 2, 'Boots in the Hall', 4]]);
    eq(r.skipped.length, 0);
    ok(/before five/.test(r.days[0].story), 'story kept');
    ok(/December has actually begun\?$/.test(r.days[0].question), 'question kept');
    eq(r.days[0].words[0], { w: 'LAMPLIGHT', c: 'Shine thrown across a dark room' });
    ok(r.days[1].story.indexOf('everyone’s') !== -1, 'curly apostrophe');
  });

  await test('reader: bold marks, numbers, dashes, lengths, two-word answers, give-aways', () => {
    const r = CX.reader.readDays(S.MESSY);
    eq(r.days.length, 1);
    const d = r.days[0];
    eq([d.no, d.title], [3, 'Up Before the Others']);
    eq(d.question, 'Who was always first up in your house?');
    eq(d.words.map((x) => x.w), ['KETTLE', 'TOAST', 'DAWN', 'SUNRISE', 'RADIATOR']);
    eq(d.words[4].c, 'Warm metal panel under the window', 'length in parentheses removed');
    eq(r.skipped.map((s) => s.why).sort(), ['it is more than one word', 'it is shorter than 3 letters', 'its clue gives the answer away'].sort());
    ok(CX.reader.givesAway('SNOWMAN', 'A snowman made of snow') && CX.reader.givesAway('BAKING', 'The bakings of the day') && !CX.reader.givesAway('LAMP', 'It lights the corner of a room'));
  });

  await test('reader: bonus days and the extras reply', () => {
    const r = CX.reader.readDays('BONUS DAY 2: Quiet Morning\nWORDS:\nTEAPOT | Pot for brewing a hot drink\n');
    eq([r.days[0].set, r.days[0].no, r.days[0].words.length], ['bonus', 2, 1]);
    const e = CX.reader.readExtras(S.EXTRAS);
    eq(e.weeks.length, 4);
    ok(/waking up\. Take your time/.test(e.weeks[0]), e.weeks[0]);
    eq(e.eve.length, 2);
    ok(/^Open one crossword/.test(e.blurb));
    eq(CX.reader.kind(S.EXTRAS), 'extras');
    eq(CX.reader.kind(S.CLEAN), 'days');
    eq(CX.reader.kind('Sure! Happy to help with your book.'), 'unknown');
  });

  // ---------- engine ----------
  await test('engine: grids keep the rules, every time', () => {
    const words = CX.reader.readDays(S.CLEAN).days[0].words;
    for (let s = 0; s < 12; s++) {
      const g = CX.engine.build(words, { size: 13, target: 18, letter: 'H', seed: 'e' + s });
      eq(CX.engine.check(g), [], 'seed ' + s);
      ok(g.rows <= 13 && g.cols <= 13, 'fits 13 x 13');
      ok(g.entries.length >= 13, 'only ' + g.entries.length + ' answers');
      ok(g.entries.some((e) => e.w.indexOf('H') !== -1), 'holds the letter');
      const a = g.entries.filter((e) => e.dir === 'A').length;
      ok(a >= 4 && g.entries.length - a >= 4, 'across and down mixed');
      g.entries.forEach((e) => ok(e.num > 0, 'numbered'));
    }
    const g1 = CX.engine.build(words, { size: 13, target: 18, letter: '', seed: 'same' });
    const g2 = CX.engine.build(words, { size: 13, target: 18, letter: '', seed: 'same' });
    eq(g1.cells, g2.cells, 'the same seed gives the same grid');
    eq(CX.engine.check({ rows: 1, cols: 4, cells: [['C', 'A', 'T', 'S']], entries: [{ w: 'CAT', r: 0, col: 0, dir: 'A' }] }).length > 0, true, 'a stray letter is caught');
  });

  await test('puzzles: head start answers, the thick square and the stars', () => {
    const p = fullProject();
    const days = CX.plan.days(p);
    [[0, 3, 1], [6, 2, 2], [12, 0, 3], [23, 0, 3]].forEach(([i, given, stars]) => {
      const pz = CX.puzzles.get(p, days[i]);
      eq(pz.grid.given.length, given, 'day ' + (i + 1) + ' givens');
      eq(CX.plan.stars(p, days[i]), stars, 'day ' + (i + 1) + ' stars');
      const m = pz.grid.mark;
      ok(m, 'day ' + (i + 1) + ' has a thick square');
      eq(pz.grid.cells[m.r][m.c], CX.plan.letterOf(p, days[i]), 'the thick square holds the day’s letter');
      ok(!pz.grid.givenCells[m.r + ',' + m.c], 'the thick square is never printed');
    });
    eq(CX.plan.letterOf(p, days[0]) + CX.plan.letterOf(p, days[1]) + CX.plan.letterOf(p, days[23]), 'HAS');
  });

  // ---------- plan ----------
  await test('plan: days, weeks, sentences and project files', () => {
    const p = CX.plan.newProject();
    eq(CX.plan.days(p).length, 24);
    eq(CX.plan.weeks(p).map((w) => [w.from, w.to]), [[1, 7], [8, 14], [15, 21], [22, 24]]);
    p.plan.days = 25; eq(CX.plan.weeks(p).slice(-1)[0].to, 25);
    p.plan.days = 12; eq(CX.plan.weeks(p).map((w) => w.title), ['The First Days', 'The Last Days']);
    eq(CX.plan.weeks(p).map((w) => [w.from, w.to]), [[1, 6], [7, 12]]);
    p.plan.bonus = true;
    const ds = CX.plan.days(p);
    eq(ds.length, 24); eq(ds[12].id, 'b1'); eq(ds[12].date, 'December 26'); eq(ds[23].date, 'January 6');
    // every countdown ends on Christmas Eve, the 25 days on Christmas Day
    eq([ds[0].date, ds[11].date], ['December 13', 'December 24']);
    [[24, 1, 24], [25, 1, 25], [12, 13, 24], [7, 18, 24], [18, 7, 24]].forEach(([n, a, z]) => {
      p.plan.days = n;
      const main = CX.plan.days(p).filter((d) => d.set === 'main');
      eq([main.length, main[0].date, main[n - 1].date], [n, 'December ' + a, 'December ' + z], n + ' days');
    });
    // the weeks cover every day once, with no block shorter than three days, and the candles follow the calendar
    for (let n = CX.plan.MIN_DAYS; n <= 25; n++) {
      p.plan.days = n;
      const wk = CX.plan.weeks(p).filter((w) => w.set === 'main');
      eq(wk.map((w) => w.to - w.from + 1).reduce((a, b) => a + b, 0), n, 'weeks of ' + n);
      wk.forEach((w, i) => { ok(w.to - w.from + 1 >= 3, n + ' days: block ' + w.from + '-' + w.to); if (i) eq(w.from, wk[i - 1].to + 1); });
      const last = wk[wk.length - 1];
      eq(last.title, n >= 14 && last.to - last.from === 6 ? ['', 'The Second Week', 'The Third Week'][wk.length - 1] : 'The Last Days', 'last block of ' + n);
      wk.forEach((w) => eq(w.candles, Math.min(4, Math.ceil((CX.plan.firstDate(p) + w.from - 1) / 7))));
      ok(CX.plan.sentencesFor(n).length >= 1, 'ideas for ' + n);
    }
    p.plan.days = 24; eq(CX.plan.weeks(p).map((w) => w.candles).slice(0, 4), [1, 2, 3, 4]);
    p.plan.days = 12; eq(CX.plan.weeks(p).map((w) => w.candles).slice(0, 2), [2, 3]);
    [12, 24, 25].forEach((n) => ok(CX.plan.sentencesFor(n).length >= 2, 'ideas for ' + n));
    CX.plan.SENTENCES.forEach((s) => { const k = CX.plan.letters(s).length; ok(k >= CX.plan.MIN_DAYS && k <= 25, '"' + s + '" has ' + k + ' letters'); });
    // New Year sentences are ideas for the Twelve Days only
    ok(CX.plan.sentencesFor(12).every((s) => CX.plan.NEW_YEAR.indexOf(s) === -1), 'no New Year ideas for a December countdown');
    eq(CX.plan.sentencesFor(12, 'bonus')[0], 'Twelfth Night');
    const n = CX.plan.normalize({ book: {}, plan: { days: 99, size: 'x', lines: 50 }, days: { d1: { title: 'A', words: [{ w: 'snow', c: 'Cold' }, { w: 3 }] }, evil: {} } });
    eq([n.plan.days, n.plan.size, n.plan.lines], [24, 13, 6]);
    eq([17, '9', 6, 26, 0, 'x'].map((d) => CX.plan.normalize({ plan: { days: d } }).plan.days), [17, 9, 24, 24, 24, 24]);
    eq(n.days.d1.words, [{ w: 'SNOW', c: 'Cold' }]);
    ok(!n.days.evil, 'unknown keys dropped');
  });

  // ---------- prompts and replies ----------
  await test('prompts: grouped days, only what is missing, letters asked for, extras last', () => {
    const p = CX.plan.newProject();
    let l = CX.prompts.list(p);
    eq(l.length, 7);
    eq(l[0].days.length, 4);
    eq(l[6].kind, 'extras');
    let t = CX.prompts.text(p, l[0]);
    ok(t.indexOf('DAY 1 (December 1): exactly 30 words, at least 5 of them contain the letter H') !== -1, t.slice(0, 700));
    ok(t.indexOf('DAY 4 (December 4)') !== -1 && t.indexOf('letter E') !== -1 && t.indexOf('at least 3 of them contain the letter V') !== -1, 'rare letters ask for fewer words');
    CX.content.addReply(p, CX.reader.readDays(S.CLEAN), l[0].days);
    t = CX.prompts.text(p, CX.prompts.list(p)[0]);
    ok(t.indexOf('DAY 1 (December 1)') === -1 || /DAY 1 \(December 1\): its title is "The First Evening", exactly 6 more words/.test(t), 'day 1 only tops up: ' + t.slice(0, 900));
    ok(t.indexOf('LAMPLIGHT') !== -1, 'existing words listed');
    p.plan.size = 11; eq(CX.prompts.list(p)[0].days.length, 5);
    p.plan.size = 15; eq(CX.prompts.list(p)[0].days.length, 3);
    p.plan.bonus = true;
    ok(CX.prompts.list(p).some((x) => x.kind === 'days' && x.set === 'bonus'), 'bonus prompts');
    const ex = CX.prompts.text(p, { kind: 'extras' });
    ok(/WEEK 1:/.test(ex) && /WEEK 5:/.test(ex) && /CHRISTMAS EVE:/.test(ex) && /BACK COVER:/.test(ex));
  });

  await test('prompts: the chosen theme drives the day themes, the word mix and the examples', () => {
    const p = CX.plan.newProject();
    p.plan.theme = 'kids'; p.plan.audience = 'kids';
    let t = CX.prompts.text(p, CX.prompts.list(p)[0]);
    ok(/Santa’s sleigh on Christmas Eve/.test(t) && /SLEIGH \|/.test(t) && /a child aged 8 to 12 knows/.test(t), t);
    ok(!/dark evenings|winter and December words|EMBERS/.test(t), 'no cozy-at-home leftovers');
    p.plan.theme = 'custom'; p.plan.customTheme = 'Christmas by the sea: lighthouses, boats and harbours';
    t = CX.prompts.text(p, CX.prompts.list(p)[0]);
    ok(/The theme: Christmas by the sea: lighthouses, boats and harbours\. Everything must suit children aged 8 to 12\./.test(t) && !/dark evenings|LAMP \|/.test(t), t);
  });

  await test('young kids: short words, more head-start answers, a full book that passes the checklist', () => {
    const p = CX.plan.newProject();
    p.plan.audience = 'young'; Object.assign(p.plan, CX.plan.audience('young').defaults);
    eq(p.plan.size, 9);
    const t = CX.prompts.text(p, CX.prompts.list(p)[0]);
    ok(/3 to 7 letters/.test(t) && /half short \(3 or 4 letters\) and half longer \(5 to 7\)/.test(t) && /a child aged 6 to 8 can read and spell/.test(t), t);
    eq(CX.plan.days(p).map((d) => CX.plan.givens(p, d)).join(''), '333333333333222222222222');
    const book = fullProject((q) => { q.plan.audience = 'young'; Object.assign(q.plan, CX.plan.audience('young').defaults); });
    const items = CX.checklist.run(book, CX.layout.layoutBook(book, {}));
    ok(CX.checklist.ready(items), JSON.stringify(items.filter((i) => !i.ok)));
  });

  await test('content: days by number, repeats dropped, replies without day lines fill the prompt’s days', () => {
    const p = CX.plan.newProject();
    const pr = CX.prompts.list(p)[0];
    let rep = CX.content.addReply(p, CX.reader.readDays(S.CLEAN), pr.days);
    eq(rep.added.map((r) => [r.day.id, r.n]), [['d1', 24], ['d2', 4]]);
    rep = CX.content.addReply(p, CX.reader.readDays(S.CLEAN), pr.days);
    eq(rep.repeats, 28);
    rep = CX.content.addReply(p, CX.reader.readDays('WORDS:\nSPRUCE | Evergreen tree\nTINSEL | Shiny strands for the tree'), pr.days);
    eq(rep.added[0].day.id, 'd2', 'first open day of the prompt (day 1 already has a good grid)');
    p.plan.bonus = true;
    rep = CX.content.addReply(p, CX.reader.readDays('DAY 1: Quiet\nWORDS:\nTEAPOT | Pot for brewing'), CX.prompts.list(p).filter((x) => x.set === 'bonus')[0].days);
    eq(rep.added[0].day.id, 'b1', 'a bonus prompt’s DAY 1 is bonus day 1');
  });

  await test('content: a full book has every prompt done and passes the checklist', () => {
    const p = fullProject();
    ok(CX.prompts.list(p).every((x) => x.done), CX.prompts.list(p).filter((x) => !x.done).map((x) => x.no).join());
    const book = CX.layout.layoutBook(p, {});
    const items = CX.checklist.run(p, book);
    ok(CX.checklist.ready(items), JSON.stringify(items.filter((i) => !i.ok)));
  });

  // ---------- layout ----------
  await test('layout: every trim x text size x grid size inside the KDP margins', () => {
    const counts = [];
    CX.kdp.TRIMS.forEach((t) => Object.keys(CX.layout.PRINT).forEach((pr) => [9, 11, 13, 15].forEach((size) => {
      if (size !== 13 && pr === 'regular') return;
      const p = fullProject((p) => { p.book.trim = t.id; p.book.print = pr; p.plan.size = size; });
      const book = CX.layout.layoutBook(p, {});
      book.pages.forEach(checkPage);
      ok(book.m.inside >= CX.kdp.margins(book.pages.length).minInside * 72, 'gutter too small for ' + book.pages.length + ' pages');
      book.pages.filter((pg) => pg.kind === 'day').forEach((pg) => ok(pg.meta.cell >= 18, 'grid squares ' + (pg.meta.cell || 0).toFixed(1) + ' pt on ' + t.id));
      book.pages.filter((pg) => pg.kind === 'clues').forEach((pg) => ok(pg.meta.clueSize >= 7.5, 'clues ' + pg.meta.clueSize + ' pt'));
      counts.push(t.id + '/' + pr + '/' + size + ':' + book.pages.length);
    })));
    console.log('     pages: ' + counts.filter((c) => /\/13:/.test(c)).join(' '));
  });

  await test('layout: every day is a spread, grid on the left, clues on the right', () => {
    [(p) => { }, (p) => { p.plan.days = 25; p.plan.bonus = true; }, (p) => { p.plan.days = 12; p.plan.headStart = false; p.plan.memory = false; },
      (p) => { p.plan.days = 17; p.plan.sentence = 'Christmas is coming'; p.plan.bonus = true; }, (p) => { p.plan.days = 7; p.plan.sentence = 'Be merry'; }].forEach((mut) => {
      const p = fullProject(mut);
      const book = CX.layout.layoutBook(p, {});
      CX.plan.days(p).forEach((d) => {
        const at = book.refs.days[d.id];
        ok(at % 2 === 0, d.id + ' starts on page ' + at + ', a right-hand page');
        eq([book.pages[at - 1].kind, book.pages[at].kind], ['day', 'clues']);
        eq([book.pages[at - 1].meta.day, book.pages[at].meta.day], [d.id, d.id]);
      });
      book.pages.filter((pg) => pg.kind === 'gate').forEach((pg, i) => eq(pg.side, i % 2 ? 'right' : 'left', 'gates open on a left page'));
      eq(book.pages.filter((pg) => pg.kind === 'gate').length, CX.plan.weeks(p).length * 2);
    });
  });

  await test('layout: the contents, the strip page and the solutions point at the right pages', () => {
    const p = fullProject();
    const book = CX.layout.layoutBook(p, {});
    eq(book.pages[book.refs.strip - 1].kind, 'strip');
    eq(book.pages[book.refs.solutions - 1].kind, 'solutions');
    const strs = [].concat.apply([], book.pages.filter((pg) => pg.kind === 'days').map((pg) => pg.items.filter((it) => it.t === 'text').map((it) => it.str)));
    ok(strs.indexOf('page ' + book.refs.days.d1) !== -1 && strs.indexOf('page ' + book.refs.days.d24) !== -1, 'day pages listed');
    const clues = book.pages[book.refs.days.d5];
    ok(clues.items.some((it) => it.t === 'text' && it.str === 'Letter strip on page ' + book.refs.strip + '.'), 'clue page points at the strip');
    const how = book.pages.find((pg) => pg.kind === 'how').items.filter((it) => it.t === 'text').map((it) => it.str).join(' ');
    ok(how.indexOf('(page ' + book.refs.strip + ')') !== -1, 'how-to points at the strip');
    const sent = book.pages.find((pg) => pg.kind === 'sentence').items.filter((it) => it.t === 'text').map((it) => it.str).join(' ');
    ok(sent.indexOf('HAVE A HOLLY JOLLY CHRISTMAS') !== -1, 'the sentence is revealed at the back');
    // every clue of a day is on its clue page
    const pz = CX.puzzles.get(p, CX.plan.days(p)[4]);
    const texts = clues.items.filter((it) => it.t === 'text').map((it) => it.str).join(' ');
    pz.grid.entries.forEach((e) => ok(texts.indexOf('(' + e.w.length + ')') !== -1, 'clue for ' + e.w));
  });

  await test('layout: the draft shows placeholders, the print leaves empty parts out', () => {
    const p = CX.plan.newProject();
    const draft = CX.layout.layoutBook(p, { draft: true });
    ok(draft.pages.some((pg) => pg.items.some((it) => it.t === 'text' && /crossword goes here/.test(it.str))), 'placeholder shown');
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
    eq(CX.cover.paletteId({ design: 'plaid', palette: '' }), 'plaid');
    eq(CX.cover.paletteId({ design: 'marquee', palette: 'noir' }), 'noir');
  });

  await test('cover: every template x trim, sized by KDP and inside the safe areas', () => {
    CX.kdp.TRIMS.forEach((t) => {
      const p = fullProject((p) => { p.book.trim = t.id; });
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

  await test('cover: palettes, odd words, 12 and 25 days, the bonus seal', () => {
    const cases = [
      (p) => { },
      (p) => { p.plan.days = 12; p.book.title = 'Advent'; p.book.author = ''; p.book.subtitle = ' '; },
      (p) => { p.plan.days = 25; p.plan.bonus = true; p.book.title = 'The Big Cozy Christmas Crossword Advent Calendar for Grandma, Grandpa and the Whole Family'; p.book.subtitle = 'Twenty-five days of large print puzzles with a hidden sentence, memory questions and every solution at the back of the book'; },
      (p) => { p.book.trim = '5.5x8.5'; p.book.print = 'regular'; p.book.author = 'A Very Long Pen Name Indeed For Testing Purposes Press'; },
      (p) => { p.plan.days = 17; p.plan.sentence = 'Christmas is coming'; p.book.trim = '8.5x11'; }
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

  await test('cover: spine text only from 79 pages, inside the spine', () => {
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cac-'));
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

  await test('pptx: the Canva copy has every page, each line as text, and opens as a valid package', async () => {
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
    ok(/<p:sldSz cx="\d+" cy="\d+"\/>/.test(files['ppt/presentation.xml']), 'slide size');
    eq(+/cx="(\d+)"/.exec(files['ppt/presentation.xml'].split('sldSz')[1])[1], Math.round(book.W * 12700), 'slide width is the trim width');
    Object.keys(files).forEach((f) => ok(!/[<&](?![a-zA-Z/?!#]|amp;|lt;|gt;|quot;)/.test(files[f]), 'bad XML in ' + f));
    const words = book.pages[9].items.filter((it) => it.t === 'text').map((it) => it.str);
    const s10 = files['ppt/slides/slide10.xml'];
    words.forEach((w) => ok(s10.includes(w.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')), 'missing text on slide 10: ' + w));
    ok(/<a:prstGeom prst="rect">/.test(s10), 'shapes kept');
    const cfiles = unzip(await CX.pptx.buildCover(CX.cover.build(p, book.pages.length)));
    ok(cfiles['ppt/slides/slide1.xml'] && !cfiles['ppt/slides/slide2.xml'], 'cover is one slide');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
