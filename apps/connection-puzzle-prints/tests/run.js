/*
 * node tests/run.js
 * Reader, puzzle rules and the fair board shuffle, prompts, adding replies, every trim x text size x
 * puzzles a page against the KDP margins and minimums with no text on text and no word on a tile's
 * ring, page references, every cover template, and real PDFs (checked with PyMuPDF through
 * tests/verify-pdf.py when Python has it).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const env = require('./node-env.js');
const S = require('./sample-replies.js');
const CX = env.loadAll();
const P = CX.plan;

let failed = 0, passed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log('ok   ' + name); }, (e) => { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); });
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected true'); }

const REAL = P.THEMES.filter((t) => t.sample).map((t) => P.asPuzzle(t.sample));

// A project with every puzzle filled through the reader, as a buyer would, and the extras in.
function fullProject(mut, count, puzzles) {
  const p = P.newProject();
  p.seed = 'test-book';
  p.book.author = 'Four Corners Press';
  p.plan.count = count || 24;
  if (mut) mut(p);
  const src = puzzles || REAL.concat(S.synth(p.plan.count, 'book', P.audience(p.plan.audience).maxLetters));
  CX.prompts.list(p).forEach((pr) => {
    if (pr.kind !== 'puzzles') return;
    const nos = pr.puzzles.map((x) => x.no);
    CX.content.addReply(p, CX.reader.readPuzzles(S.reply(nos.map((n) => src[(n - 1) % src.length]), nos)), pr.puzzles);
  });
  CX.content.addExtras(p, CX.reader.readExtras(S.EXTRAS));
  return p;
}

const F = CX.metrics.load();
function textWidth(it) { return F[it.font].width(it.str, it.size, it.ls || 0); }
function texts(pg) { return pg.items.filter((i) => i.t === 'text').map((i) => i.str).join(' '); }

// Every item inside the page's margins, and the KDP minimums.
function checkPage(pg) {
  const tol = 0.6;
  pg.items.forEach((it) => {
    if (it.t === 'text') {
      ok(it.size >= CX.kdp.MIN_FONT_PT, 'text under 7 pt on page ' + pg.num + ': ' + it.str + ' ' + it.size);
      const w = textWidth(it);
      ok(it.x >= pg.x0 - tol && it.x + w <= pg.x1 + tol, 'text outside the margins on page ' + pg.num + ' (' + pg.label + '): "' + it.str + '"');
      ok(it.y - it.size * 0.8 >= pg.y0 - tol && it.y <= pg.y1 + tol, 'text outside top/bottom on page ' + pg.num + ' (' + pg.label + '): ' + it.str);
    } else if (it.t === 'line') {
      ok(it.w >= CX.kdp.MIN_LINE_PT, 'thin line on page ' + pg.num);
      ok(Math.min(it.x1, it.x2) >= pg.x0 - tol && Math.max(it.x1, it.x2) <= pg.x1 + tol && Math.min(it.y1, it.y2) >= pg.y0 - tol && Math.max(it.y1, it.y2) <= pg.y1 + tol, 'line outside the margins on page ' + pg.num + ' (' + pg.label + ')');
    } else if (it.t === 'rect') {
      if (it.mode === 'stroke') ok(it.lw >= CX.kdp.MIN_LINE_PT, 'thin box on page ' + pg.num);
      ok(it.x >= pg.x0 - tol && it.x + it.w <= pg.x1 + tol && it.y >= pg.y0 - tol && it.y + it.h <= pg.y1 + tol, 'box outside the margins on page ' + pg.num + ' (' + pg.label + ')');
    } else if (it.t === 'poly' || it.t === 'ellipse') {
      if (it.mode === 'stroke') ok(it.lw >= CX.kdp.MIN_LINE_PT, 'thin outline on page ' + pg.num);
      const xs = it.t === 'poly' ? it.pts.filter((v, i) => i % 2 === 0) : [it.cx - it.rx, it.cx + it.rx];
      const ys = it.t === 'poly' ? it.pts.filter((v, i) => i % 2 === 1) : [it.cy - it.ry, it.cy + it.ry];
      const pad = (it.lw || 0) / 2;
      ok(Math.min.apply(null, xs) - pad >= pg.x0 - 1 && Math.max.apply(null, xs) + pad <= pg.x1 + 1 && Math.min.apply(null, ys) - pad >= pg.y0 - 1 && Math.max.apply(null, ys) + pad <= pg.y1 + 1,
        'drawing outside the margins on page ' + pg.num + ' (' + pg.label + ')');
    }
    if (it.ink != null) ok(it.ink >= CX.kdp.MIN_GRAY, 'ink lighter than 10% gray on page ' + pg.num);
  });
}

// Text boxes: from the top of the capitals (or ascenders) to the bottom of the descenders.
function boxOf(it) { return { it, x0: it.x, x1: it.x + textWidth(it), y0: it.y - it.size * 0.72, y1: it.y + it.size * 0.2 }; }
function inter(a, b, m) { return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > (m || 0.5) && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > (m || 0.5); }

// No text on other text, no text across a small ring (the pencil rings and badges) unless it is
// the number inside that badge, and every tile word inside its tile.
function clash(pg) {
  const b = pg.items.filter((it) => it.t === 'text').map(boxOf);
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) if (inter(b[i], b[j])) return 'text on text: ' + b[i].it.str + ' / ' + b[j].it.str;
  const rings = pg.items.filter((it) => it.t === 'ellipse' && it.mode === 'stroke' && it.rx < 14);
  for (const t of b) for (const r of rings) {
    const rb = { x0: r.cx - r.rx, x1: r.cx + r.rx, y0: r.cy - r.ry, y1: r.cy + r.ry };
    const inside = t.x0 >= rb.x0 - 1 && t.x1 <= rb.x1 + 1 && t.y0 >= rb.y0 - 2 && t.y1 <= rb.y1 + 2;
    if (inter(t, rb, 0.3) && !inside) return 'text on a ring: ' + t.it.str;
  }
  return '';
}

(async function main() {
  await test('every script of the app compiles (the user interface too, which Node does not run)', () => {
    const vm = require('vm');
    ['js/ui/dom.js', 'js/ui/preview.js', 'js/ui/app.js'].concat(env.CORE.filter((f) => f.indexOf('vendor') < 0 && f.indexOf('fonts') < 0)).forEach((f) => {
      new vm.Script(fs.readFileSync(path.join(env.ROOT, f), 'utf8'), { filename: f });
    });
  });

  // ---------- reader ----------
  await test('reader: the asked-for format', () => {
    const r = CX.reader.readPuzzles(S.reply(REAL.slice(0, 2), [1, 2]));
    eq(r.puzzles.map((x) => [x.no, x.groups.length, x.groups[0].words.length]), [[1, 4, 4], [2, 4, 4]]);
    eq(r.puzzles[0].groups[3].link, '___ tie');
    eq(r.puzzles[0].groups[0].words, ['TOAST', 'CEREAL', 'BACON', 'WAFFLE']);
    ok(/EGG/.test(r.puzzles[0].trap));
    eq(CX.reader.kind(S.reply(REAL.slice(0, 1), [1])), 'puzzles');
  });

  await test('reader: bold marks, colors, numbers, answers on the next line, notes in brackets', () => {
    const r = CX.reader.readPuzzles(S.MESSY);
    eq(r.puzzles.length, 2);
    const a = r.puzzles[0], b = r.puzzles[1];
    eq(a.no, 3);
    eq(a.groups.map((g) => g.link), ['Breakfast foods', 'Things you crack', 'Card games', '___ tie']);
    eq(a.groups[1].words, ['EGG', 'CODE', 'JOKE', 'SAFE']);
    eq(a.groups[0].words, ['TOAST', 'CEREAL', 'BACON', 'WAFFLE']);
    eq(a.trap, 'EGG looks like a breakfast food.');
    eq(b.no, 4);
    eq(b.groups.map((g) => g.link), ['Trees', 'Things that have a key', '___ cake', 'Hidden body part']);
    eq(b.groups.map((g) => g.words.length), [4, 4, 4, 4]);
  });

  await test('reader: a reply with no PUZZLE lines is cut at each new group 1, and blanks survive', () => {
    const t = 'GROUP 1: A = W, X, Y, Z\nGROUP 2: B = Q, R, S, T\nGROUP 1: Snow__ = BALL, MAN, FLAKE, DRIFT\nGROUP 2: [blank] fish = STAR, SWORD, CAT, GOLD';
    const r = CX.reader.readPuzzles(t);
    eq(r.puzzles.map((x) => x.groups.length), [2, 2]);
    eq(r.puzzles[1].groups.map((g) => g.link), ['Snow___', '___ fish']);
  });

  await test('reader: the extras reply', () => {
    const e = CX.reader.readExtras(S.EXTRAS);
    ok(/^Welcome to a book/.test(e.welcome[0]));
    eq(e.closing.length, 2);
    ok(/^Each puzzle hides/.test(e.blurb));
    eq(CX.reader.kind(S.EXTRAS), 'extras');
    eq(CX.reader.kind('Sure! Happy to help with your book.'), 'unknown');
  });

  // ---------- rules and board ----------
  await test('engine: every sample and example puzzle is sound, the problems are caught', () => {
    const E = CX.engine;
    REAL.concat([P.asPuzzle(P.EXAMPLE)]).forEach((d) => { eq(E.problems(d, 14), [], d.groups[0].link); eq(E.warnings(d), [], d.groups[0].link); });
    const d = P.asPuzzle(P.EXAMPLE);
    d.groups[1].words[3] = 'OAK';
    ok(/OAK is in it twice/.test(E.problems(d, 14).join()), 'a repeat');
    d.groups[1].words.pop();
    ok(/group 2 has 3 answers/.test(E.problems(d, 14).join()));
    ok(/no link/.test(E.problems({ groups: [{ link: '', words: ['A', 'B', 'C', 'D'] }] }, 14).join()));
    ok(/3 of the 4 groups/.test(E.problems({ groups: d.groups.slice(0, 3) }, 14).join()));
    ok(/too long/.test(E.problems({ groups: [{ link: 'x', words: ['ABCDEFGHIJKLMNOPQ', 'B', 'C', 'D'] }] }, 14).join()));
    ok(/gives away FISH/.test(E.warnings({ groups: [{ link: 'Kinds of fish', words: ['FISH', 'COD', 'EEL', 'TUNA'] }] }).join()), 'giveaway');
    ok(/CAT and CATS/.test(E.warnings({ groups: [{ link: 'x', words: ['CAT', 'CATS', 'BERRY', 'BERRIES'] }] }).join()), 'two forms');
    ok(E.sameWord('BERRY', 'BERRIES') && E.sameWord('BOX', 'BOXES') && !E.sameWord('GLASS', 'GLAS') && !E.sameWord('BUS', 'BU'));
  });

  await test('engine: the board is fair and the same seed gives the same board', () => {
    const E = CX.engine, d = P.asPuzzle(P.EXAMPLE);
    for (let i = 0; i < 300; i++) {
      const c = E.arrange(d, 'seed' + i);
      ok(E.spreadOk(c), 'a row or column holds three of a group');
      eq(c.flat().map((x) => x.w).sort(), d.groups.flatMap((g) => g.words).sort(), 'every answer once');
    }
    eq(E.arrange(d, 'same'), E.arrange(d, 'same'));
    ok(JSON.stringify(E.arrange(d, 'one')) !== JSON.stringify(E.arrange(d, 'two')));
  });

  // ---------- puzzles, plan, prompts, content ----------
  await test('puzzles: statuses, and only sound puzzles print, numbered without a gap', () => {
    const p = P.newProject();
    p.seed = 's';
    p.plan.count = 10;
    const [a, b, c] = P.puzzles(p);
    eq(CX.puzzles.status(p, a).state, 'empty');
    p.puzzles.p1 = { groups: REAL[0].groups.slice(0, 2), trap: '', v: 0 };
    eq(CX.puzzles.status(p, a).state, 'part');
    p.puzzles.p2 = JSON.parse(JSON.stringify(REAL[1]));
    eq(CX.puzzles.status(p, b).state, 'ok');
    p.puzzles.p3 = JSON.parse(JSON.stringify(REAL[2]));
    p.puzzles.p3.groups[0].words[0] = p.puzzles.p3.groups[1].words[0];
    eq(CX.puzzles.status(p, c).state, 'weak');
    p.puzzles.p4 = JSON.parse(JSON.stringify(REAL[3]));
    eq(CX.puzzles.printed(p).map((x) => [x.id, x.no]), [['p2', 1], ['p4', 2]]);
  });

  await test('plan: project files keep what they should and repair the rest', () => {
    const p = fullProject(null, 12);
    const back = P.normalize(JSON.parse(JSON.stringify(p)));
    eq(back.puzzles, p.puzzles);
    eq(back.plan, p.plan);
    const bad = P.normalize({ plan: { count: 9999, perPage: 7, level: 'x', audience: 'y', theme: 'z' }, puzzles: { p1: { groups: [{ link: 5, words: ['ok', 3, 'two words'] }] }, evil: {} } });
    eq([bad.plan.count, bad.plan.perPage, bad.plan.level, bad.plan.audience, bad.plan.theme], [100, 1, 'medium', 'adults', 'mix']);
    eq(bad.puzzles, { p1: { groups: [{ link: '', words: ['OK', 'TWO WORDS'] }], trap: '', v: 0 } });
  });

  await test('prompts: batches, levels, rules, the theme sample, no game names', () => {
    const p = P.newProject();
    p.plan.count = 25;
    const l = CX.prompts.list(p);
    eq(l.length, 4);
    const t = CX.prompts.text(p, l[0]);
    ok(/PUZZLE 1 \(easy\)/.test(t) && /PUZZLE 8 \(easy\)/.test(t) && /PUZZLE 10 \(medium\)/.test(t) && !/PUZZLE 11\b/.test(t));
    ok(/Exactly 4 groups of exactly 4/.test(t) && /TRAP/.test(t) && /Only one way to sort/.test(t), 'the rules');
    ok(/Breakfast foods = TOAST/.test(t), 'the theme sample');
    ok(/do not use its groups/.test(t));
    ok(!/connections|new york|nyt|wyna/i.test(t + CX.prompts.text(p, l[3]) + CX.prompts.checkText(p, l[0].puzzles)), 'no game or newspaper names in the prompts');
    ok(/PUZZLE 21 \(hard\)/.test(CX.prompts.text(p, l[2])), 'levels follow the book');
    p.plan.theme = 'faith';
    ok(/Disciples = PETER/.test(CX.prompts.text(p, l[0])));
    p.plan.theme = 'custom'; p.plan.customTheme = 'life by the sea';
    ok(/life by the sea/.test(CX.prompts.text(p, l[0])));
    ok(/WELCOME/.test(CX.prompts.text(p, l[3])) && /Do not name any newspaper/.test(CX.prompts.text(p, l[3])));
  });

  await test('prompts: kids get their own rules and sample; adults keep theirs', () => {
    const p = P.newProject();
    P.setAudience(p.plan, 'kids');
    eq([p.plan.theme, p.plan.level], ['kids', 'easy']);
    const t = CX.prompts.text(p, CX.prompts.list(p)[0]);
    ok(/Farm animals = COW/.test(t) && /safe for children/.test(t) && /at most 9 letters/.test(t) && /No hidden words or anagrams/.test(t), 'kids');
    P.setAudience(p.plan, 'adults');
    const a = CX.prompts.text(p, CX.prompts.list(p)[0]);
    ok(!/safe for children/.test(a) && /hidden words, sound-alikes/.test(a) && /at most 1[01] letters/.test(a), 'adults');
    p.book.print = 'regular';
    ok(/at most 12 letters/.test(CX.prompts.text(p, CX.prompts.list(p)[0])), 'regular print allows the audience limit');
  });

  await test('prompts: copying again asks only for what is missing, lists used links, and checks', () => {
    const p = fullProject(null, 20);
    p.puzzles.p3.groups.pop();
    p.puzzles.p12.groups[0].words[0] = p.puzzles.p12.groups[1].words[1];
    const l = CX.prompts.list(p);
    ok(!l[0].done && !l[1].done && l[2].done);
    const t = CX.prompts.text(p, l[0]);
    ok(/Write this puzzle: PUZZLE 3 \(easy\)/.test(t), t.slice(0, 600));
    ok(/PUZZLE 3 came back unfinished/.test(t));
    ok(/already in the book[^\n]*Card games/.test(CX.prompts.text(p, l[1])), 'lists used links');
    ok(/twice/.test(CX.prompts.text(p, l[1])), 'says what went wrong');
    const c = CX.prompts.checkText(p, l[0].puzzles);
    ok(/careful puzzle editor/.test(c) && /GROUP 1: Breakfast foods = TOAST/.test(c));
  });

  await test('content: a reply fills puzzles; a finished puzzle changes only with Replace', () => {
    const p = P.newProject();
    p.plan.count = 10;
    const pr = CX.prompts.list(p)[0];
    let rep = CX.content.addReply(p, CX.reader.readPuzzles(S.reply(REAL.slice(0, 3), [1, 2, 3])), pr.puzzles);
    eq(rep.filled.length, 3);
    // no PUZZLE lines: the reply fills the open puzzles of the prompt in order
    rep = CX.content.addReply(p, CX.reader.readPuzzles(S.reply([REAL[4]], [1]).replace(/PUZZLE 1 \(easy\)\n/, '')), pr.puzzles);
    eq(rep.filled.map((x) => x.id), ['p4']);
    const again = CX.reader.readPuzzles(S.reply([REAL[5]], [1]));
    eq(CX.content.rewrites(p, again, pr.puzzles).map((r) => r.pz.id), ['p1']);
    rep = CX.content.addReply(p, again, pr.puzzles, []);
    eq([rep.filled.length, rep.kept.length], [0, 1]);
    eq(p.puzzles.p1.groups[0].link, REAL[0].groups[0].link, 'kept');
    rep = CX.content.addReply(p, again, pr.puzzles, ['p1']);
    eq(p.puzzles.p1.groups[0].link, REAL[5].groups[0].link, 'replaced');
    p.puzzles.p2.groups[0].link = REAL[5].groups[0].link;
    ok(CX.content.repeats(p).some((r) => r.nos.join() === '1,2'), 'a repeated link is found');
  });

  await test('content: a full book has every prompt done and passes the checklist', () => {
    const p = fullProject(null, 30, REAL.concat(S.synth(30, 'book', 9)));
    ok(CX.prompts.list(p).every((x) => x.done));
    const items = CX.checklist.run(p, CX.layout.layoutBook(p, {}));
    eq(items.filter((i) => !i.ok).map((i) => i.label + ': ' + i.detail), []);
  });

  // ---------- layout ----------
  await test('layout: every trim x text size x puzzles a page inside the KDP margins, no overlaps', () => {
    const synth = REAL.concat(S.synth(40, 'layout', 12));
    let checked = 0;
    CX.kdp.TRIMS.forEach((t) => Object.keys(CX.layout.PRINT).forEach((print) => [1, 2].forEach((per) => {
      const p = fullProject((x) => { x.book.trim = t.id; x.book.print = print; x.plan.perPage = per; }, 30, synth);
      const book = CX.layout.layoutBook(p, {});
      ok(book.pages.length >= CX.kdp.MIN_PAGES, 'too few pages');
      book.pages.forEach((pg) => {
        checkPage(pg);
        const c = clash(pg);
        ok(!c, t.id + '/' + print + '/' + per + ' page ' + pg.num + ' (' + pg.label + '): ' + c);
      });
      const printed = CX.puzzles.printed(p).length;
      ok(book.pages.filter((pg) => pg.kind === 'puzzle').length >= Math.ceil(printed / 2), 'puzzle pages');
      checked++;
    })));
    eq(checked, 36);
  });

  await test('layout: tiles keep their words at the text size with real answers; large print everywhere', () => {
    // REAL has answers up to 10 letters (PERCOLATOR): the big pages keep them at the text size
    [['8.5x11', 'large'], ['8.5x11', 'xl'], ['8x10', 'large'], ['8x10', 'xl'], ['7x10', 'large'], ['6x9', 'large']].forEach(([trim, print]) => {
      const p = fullProject((x) => { x.book.trim = trim; x.book.print = print; }, 22, REAL);
      const book = CX.layout.layoutBook(p, {});
      const small = [];
      book.pages.forEach((pg) => pg.items.forEach((it) => { if (it.t === 'text' && it.size < book.S.min - 0.01) small.push(pg.label + ' ' + it.str + ' ' + it.size); }));
      if (CX.prompts.maxLetters(p) >= 10) eq(small, [], trim + '/' + print);
      ok(CX.checklist.run(p, book).find((i) => i.label === 'Large print' || i.label === 'Text size').ok === !small.length, 'the checklist tells the truth');
      // the longest answer the prompt allows, in wide letters, stays at the text size
      const n = CX.prompts.maxLetters(p), wide = 'NORTHAMPTONSHIRE'.slice(0, n);
      const pz = { groups: [{ link: 'a', words: [wide, 'B', 'C', 'D'] }, { link: 'b', words: ['E', 'F', 'G', 'H'] }, { link: 'c', words: ['I', 'J', 'K', 'L'] }, { link: 'd', words: ['M', 'N', 'O', 'P'] }], trap: '', v: 0 };
      const q = fullProject((x) => { x.book.trim = trim; x.book.print = print; }, 12, [pz]);
      const sizes = [];
      CX.layout.layoutBook(q, {}).pages.filter((pg) => pg.kind === 'puzzle').forEach((pg) => pg.items.forEach((it) => { if (it.str === wide) sizes.push(it.size); }));
      ok(sizes.length && sizes.every((s) => s >= book.S.min - 0.01), trim + '/' + print + ': ' + wide + ' at ' + sizes[0]);
    });
  });

  await test('layout: a puzzle that is not ready never prints: no blank page, no gap, the true count', () => {
    const p = fullProject(null, 12);
    p.puzzles.p3.groups[2].words.pop();
    delete p.puzzles.p7;
    const book = CX.layout.layoutBook(p, {});
    const nos = book.pages.filter((pg) => pg.kind === 'puzzle').map((pg) => +/PUZZLE (\d+)/.exec(texts(pg))[1]);
    eq(nos, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    ok(book.pages.every((pg) => pg.items.some((i) => i.t === 'text' && i.str !== String(pg.num)) || pg.kind === 'closing'), 'no blank page');
    eq(P.bookCount(p), 10);
    ok(/^10 Large Print/.test(P.bookSubtitle(p)));
    const draft = CX.layout.layoutBook(p, { draft: true });
    ok(draft.pages.some((pg) => /Puzzle 3 goes here/.test(texts(pg))) && draft.pages.some((pg) => /Puzzle 7 goes here/.test(texts(pg))));
    const items = CX.checklist.run(p, book);
    ok(/numbered 1 to 10/.test(items.find((i) => i.label === 'Puzzles in the PDF').detail));
  });

  await test('layout: hint and solution page numbers point to the right pages', () => {
    const p = fullProject((x) => { x.book.trim = '6x9'; }, 40);
    const book = CX.layout.layoutBook(p, {});
    let n = 0;
    book.pages.filter((pg) => pg.kind === 'puzzle').forEach((pg) => {
      const no = /PUZZLE (\d+)/.exec(texts(pg))[1], m = /Hint: page (\d+)\s+·\s+Solution: page (\d+)/.exec(texts(pg));
      ok(m, 'refs on page ' + pg.num);
      ok(book.pages[m[1] - 1].kind === 'hints' && new RegExp('(^| )' + no + ' ').test(texts(book.pages[m[1] - 1])), 'hint page for ' + no);
      ok(book.pages[m[2] - 1].kind === 'solutions' && new RegExp('PUZZLE ' + no + '( |$)').test(texts(book.pages[m[2] - 1])), 'solution page for ' + no);
      n++;
    });
    eq(n, 40);
    const how = book.pages.find((pg) => pg.kind === 'how');
    ok(new RegExp('hints start on page ' + book.refs.hints).test(texts(how).replace(/\s+/g, ' ')) || /hints start on page/.test(book.pages.filter((pg) => pg.kind === 'how').map(texts).join(' ')), 'how-to points at the hints');
  });

  await test('layout: kids, families and every level lay out; the example board is on How to Play', () => {
    ['kids', 'family', 'adults'].forEach((a) => ['easy', 'hard', 'mixed'].forEach((lv) => {
      const p = fullProject((x) => { P.setAudience(x.plan, a); x.plan.level = lv; }, 15, REAL);
      const book = CX.layout.layoutBook(p, {});
      book.pages.forEach((pg) => { checkPage(pg); ok(!clash(pg), a + '/' + lv + ' ' + clash(pg)); });
      ok(new RegExp(P.example(p).groups[0][1].split(', ')[0]).test(book.pages.filter((pg) => pg.kind === 'how').map(texts).join(' ')), 'the example');
      eq(book.pages.filter((pg) => pg.kind === 'level').length, lv === 'mixed' ? 3 : 0);
    }));
  });

  await test('layout: 500 puzzles at two a page stay inside the KDP page limit', () => {
    const p = fullProject((x) => { x.plan.perPage = 2; x.book.print = 'regular'; }, 500, REAL.concat(S.synth(60, 'big', 12)));
    const book = CX.layout.layoutBook(p, {});
    ok(book.pages.length <= CX.kdp.maxPages('8.5x11', 'white'), book.pages.length + ' pages');
    // the made-up book repeats its 71 puzzles, so only the repeated links may complain
    const bad = CX.checklist.run(p, book).filter((i) => !i.ok && i.label !== 'No repeated links');
    eq(bad.map((i) => i.detail), []);
    eq(book.pages.filter((pg) => pg.kind === 'puzzle').length, 250, 'two a page');
  });

  // ---------- a real AI-written book (50 puzzles from Claude), and the review it got ----------
  // A real 50-puzzle book a buyer had Claude write. It stays on this computer (the repo is public),
  // so these tests are skipped where the file is missing.
  const HAS_AI_BOOK = fs.existsSync(path.join(__dirname, 'word-links-ai-generated-content.json'));
  if (!HAS_AI_BOOK) console.log('skip ai book tests: tests/word-links-ai-generated-content.json is not here');
  function aiBook(mut) {
    const src = require('./word-links-ai-generated-content.json');
    const p = P.newProject();
    p.seed = 'ai-book'; p.book.author = 'David Miles'; p.plan.count = src.puzzles.length;
    if (mut) mut(p);
    const reply = src.puzzles.map((z) => ['PUZZLE ' + z.number + ' (' + z.level + ')'].concat(z.groups.map((g) => 'GROUP ' + g.group + ': ' + g.link + ' = ' + g.answers.join(', ')), ['TRAP: ' + z.trap]).join('\n')).join('\n\n');
    CX.content.addReply(p, CX.reader.readPuzzles(reply), []);
    CX.content.addExtras(p, CX.reader.readExtras('WELCOME:\n' + src.texts.welcome + '\n\nCLOSING:\n' + src.texts.closing.join('\n') + '\n\nBACK COVER:\n' + src.texts.back_cover));
    return p;
  }

  if (HAS_AI_BOOK) await test('ai book: every puzzle reads in, and the checklist passes', () => {
    const p = aiBook();
    eq(CX.puzzles.printed(p).length, 50);
    const book = CX.layout.layoutBook(p, {});
    eq(CX.checklist.run(p, book).filter((i) => !i.ok).map((i) => i.label + ': ' + i.detail), []);
    book.pages.forEach((pg) => { checkPage(pg); ok(!clash(pg), 'page ' + pg.num + ': ' + clash(pg)); });
  });

  if (HAS_AI_BOOK) await test('ai book: the How to Play example and the cover give nothing of the book away', () => {
    const p = aiBook();
    const ex = P.example(p);
    ok(P.overlap(p, ex.groups) < 10, 'example ' + ex.groups[0][0] + ' gives a group away: ' + P.overlap(p, ex.groups));
    ok(ex !== P.EXAMPLES[0], 'the first example clashes with puzzles 5, 16, 21 and 44');
    const book = CX.layout.layoutBook(p, {}), how = book.pages.filter((pg) => pg.kind === 'how').map(texts).join(' ');
    ok(!/CHEESE|CARROT|LEGEND/.test(how), 'the old example is gone');
    // the cover's decoration groups: none gives a group of the book away, and no answer is in the book
    const cg = CX.coverFronts.groups({ project: p });
    eq(cg.length, 4);
    ok(P.overlap(p, cg) < 10, cg.map((g) => g.link).join() + ' gives a group away');
  });

  if (HAS_AI_BOOK) await test('ai book: no link or answer is cut across lines; titles break well; 16 pt is large print', () => {
    const p = aiBook();
    const book = CX.layout.layoutBook(p, {});
    const links = Object.values(p.puzzles).flatMap((d) => d.groups.map((g) => g.link));
    book.pages.filter((pg) => pg.kind === 'hints').forEach((pg) => pg.items.filter((it) => it.t === 'text' && it.font === 'serif' && /·|[a-z]/.test(it.str)).forEach((it) => {
      if (/^\d+$/.test(it.str) || /^Hints|links of each/.test(it.str)) return;
      it.str.split('  ·  ').forEach((part) => ok(links.includes(part), 'a link is cut: "' + part + '" on page ' + pg.num));
    }));
    const answers = new Set(Object.values(p.puzzles).flatMap((d) => d.groups.flatMap((g) => g.words)));
    book.pages.filter((pg) => pg.kind === 'solutions').forEach((pg) => pg.items.filter((it) => it.t === 'text' && it.font === 'sans' && it.str !== 'SOLUTIONS' && /,|^[A-Z' ]+$/.test(it.str)).forEach((it) => {
      it.str.split(/,\s*/).filter(Boolean).forEach((a) => ok(answers.has(a), 'an answer is cut: "' + a + '" on page ' + pg.num));
    }));
    const title = book.pages[0].items.filter((it) => it.font === 'serifBold').map((it) => it.str);
    eq(title, ['Word Links', 'Puzzle Book for Adults']);
    ok(/^50 Large Print/.test(P.bookSubtitle(p)) && book.S.min === 16, 'the default is 16 pt large print');
    const easy = aiBook((x) => { x.book.print = 'large'; });
    ok(!/Large Print/i.test(P.bookSubtitle(easy)), '14 pt is not sold as large print');
    ok(!/checked by machine/.test(texts(book.pages[1])), 'no machine line on the copyright page');
    ok(/hints at the back/.test(CX.prompts.text(p, CX.prompts.list(p).slice(-1)[0])) && !/a page of hints/.test(CX.prompts.text(p, CX.prompts.list(p).slice(-1)[0])));
  });

  // ---------- cover ----------
  await test('cover: every template at every trim keeps its words in the safe area', () => {
    const p = fullProject(null, 24);
    CX.kdp.TRIMS.forEach((t) => CX.cover.DESIGNS.forEach((d) => [30, 300].forEach((pages) => {
      p.book.trim = t.id; p.cover.design = d.id; p.cover.palette = '';
      const cv = CX.cover.build(p, pages), g = cv.guides, front = g.safe[1], B = g.bleed;
      ok(!cv.overlapsBarcode, d.id + ' back text over the barcode');
      cv.items.forEach((it) => {
        if (it.t !== 'text' || it.angle) return;
        const w = textWidth(it), inFront = it.x >= g.spineX1;
        if (!inFront) return;
        ok(it.x >= front.x + 0.25 * 72 - 1 && it.x + w <= front.x + front.w - 0.25 * 72 + 1, d.id + '/' + t.id + ': "' + it.str + '" outside the front safe box');
        ok(it.y - it.size * 0.75 >= B + 0.25 * 72 && it.y <= cv.H - B - 0.25 * 72, d.id + '/' + t.id + ': "' + it.str + '" too close to the top or bottom');
        ok(it.size >= 6, d.id + ' tiny text ' + it.str);
      });
    })));
  });

  // ---------- real PDFs ----------
  await test('pdf: the book and cover PDFs open, with the right size, pages and fonts', async () => {
    const p = fullProject((x) => { x.book.trim = '6x9'; }, 30);
    const book = CX.layout.layoutBook(p, {});
    const bytes = await CX.pdf.build(book, { fileId: 'a'.repeat(32) });
    const cv = CX.cover.build(p, book.pages.length);
    const cbytes = await CX.pdf.buildCover(cv, { fileId: 'b'.repeat(32) });
    const head = Buffer.from(bytes.slice(0, 8)).toString('latin1');
    ok(/^%PDF-1\./.test(head));
    const s = Buffer.from(bytes).toString('latin1');
    ok(!/\/Producer \(/.test(s) && !/\/CreationDate \(/.test(s), 'no metadata');
    const pptx = await CX.pptx.build(book);
    ok(pptx.length > 1000, 'the Canva copy');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cxp-'));
    const f = path.join(dir, 'in.pdf'), cf = path.join(dir, 'cover.pdf');
    fs.writeFileSync(f, bytes); fs.writeFileSync(cf, cbytes);
    let out = '';
    try { out = execFileSync('python', [path.join(__dirname, 'verify-pdf.py'), f, String(book.W), String(book.H), String(book.pages.length), cf, String(cv.W), String(cv.H)], { encoding: 'utf8' }).trim(); }
    catch (e) { out = 'skip: ' + (e.stderr || e.message).split('\n').slice(-2).join(' '); }
    console.log('     ' + out);
    ok(/^OK|^skip/.test(out), out);
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
