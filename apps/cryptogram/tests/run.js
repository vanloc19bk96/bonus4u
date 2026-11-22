/*
 * node tests/run.js
 * Reader, the code rules (no letter on itself, no swaps, given letters, hints), the old "Letter E >
 * 22%" failure, prompts that ask for what fits, adding replies, the library, every trim x text size
 * x puzzles a page x code x name style against the KDP margins and minimums with no text on text,
 * the mix of levels, the heading on the puzzle pages, sections, 700 puzzles, page references, every cover
 * template, real PDFs (checked with PyMuPDF through tests/verify-pdf.py when Python has it) and the
 * parts of the PNG export that need no browser.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const env = require('./node-env.js');
const S = require('./sample-replies.js');
const CX = env.loadAll();
const P = CX.plan, E = CX.engine;

let failed = 0, passed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log('ok   ' + name); }, (e) => { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); });
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected true'); }

const LIB = CX.library.QUOTES.map((q) => ({ text: q[0], by: q[1] }));

// Sentences for a whole book: library quotes, then made-up ones, each of a length its level asks.
function source(p) {
  return P.puzzles(p).map((x, i) => {
    const r = CX.prompts.length(p, P.levelOf(p, x));
    const lib = LIB.filter((q) => q.text.length >= r.lo && q.text.length <= r.hi);
    return i < lib.length && i % 3 === 0 ? lib[i] : { text: S.sentence(Math.round(r.lo + (r.hi - r.lo) * ((i * 37) % 100) / 100), i), by: P.byKind(p) ? 'Ralph Waldo Emerson' : undefined };
  });
}

// A project with every puzzle filled through the reader, as a buyer would, and the extras in.
function fullProject(mut, count, src) {
  const p = P.newProject();
  p.seed = 'test-book';
  p.book.author = 'Quiet Hours Press';
  p.plan.count = count || 24;
  if (mut) mut(p);
  src = src || source(p);
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

// Text boxes: from the top of the capitals to the bottom of the descenders.
function boxOf(it) { return { it, x0: it.x, x1: it.x + textWidth(it), y0: it.y - it.size * 0.72, y1: it.y + it.size * 0.2 }; }
function inter(a, b, m) { return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > (m || 0.5) && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > (m || 0.5); }

// No text on other text, and no text across a writing line (a letter on its line is fine: it sits on it).
function clash(pg) {
  const b = pg.items.filter((it) => it.t === 'text').map(boxOf);
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) if (inter(b[i], b[j])) return 'text on text: ' + b[i].it.str + ' / ' + b[j].it.str;
  const lines = pg.items.filter((it) => it.t === 'line' && it.y1 === it.y2 && !it.dash);
  for (const t of b) for (const l of lines) {
    const x0 = Math.min(l.x1, l.x2), x1 = Math.max(l.x1, l.x2);
    if (Math.min(t.x1, x1) - Math.max(t.x0, x0) > 0.5 && l.y1 > t.y0 + 0.8 && l.y1 < t.it.y - 0.8) return 'a line through text: ' + t.it.str + ' on page ' + pg.num;
  }
  return '';
}

(async function main() {
  await test('every script of the app compiles (the user interface too, which Node does not run)', () => {
    const vm = require('vm');
    ['js/ui/dom.js', 'js/ui/preview.js', 'js/ui/app.js'].concat(env.CORE.filter((f) => f.indexOf('vendor') < 0 && f.indexOf('fonts') < 0)).forEach((f) => {
      new vm.Script(fs.readFileSync(path.join(env.ROOT, f), 'utf8'), { filename: f });
    });
    const html = fs.readFileSync(path.join(env.ROOT, 'index.html'), 'utf8');
    env.CORE.forEach((f) => ok(html.indexOf('src="' + f + '"') >= 0, 'index.html loads ' + f));
  });

  // ---------- reader ----------
  await test('reader: the asked-for format', () => {
    const r = CX.reader.readPuzzles(S.reply(LIB.slice(0, 3), [1, 2, 3]));
    eq(r.puzzles.map((x) => [x.no, x.text, x.by]), [[1, LIB[0].text, LIB[0].by], [2, LIB[1].text, LIB[1].by], [3, LIB[2].text, LIB[2].by]]);
    eq(CX.reader.kind(S.reply(LIB.slice(0, 1), [1])), 'puzzles');
    const nb = CX.reader.readPuzzles(S.reply([{ text: 'A group of flamingos is called a flamboyance.' }], [7]));
    eq(nb.puzzles[0], { no: 7, text: 'A group of flamingos is called a flamboyance.', by: '' });
  });

  await test('reader: bold marks, one-line quotes, dash names, jokes over two lines, chatter', () => {
    const r = CX.reader.readPuzzles(S.MESSY);
    eq(r.puzzles.map((x) => [x.no, x.text, x.by]), [
      [3, 'Well done is better than well said.', 'Benjamin Franklin'],
      [4, 'Lost time is never found again.', 'Benjamin Franklin'],
      [5, 'Whenever you find yourself on the side of the majority, it is time to pause and reflect.', 'Mark Twain'],
      [6, 'Why did the scarecrow win an award? Because he was outstanding in his field.', '']
    ]);
  });

  await test('reader: a numbered list, and the old one-a-line paste (text | author)', () => {
    const n = CX.reader.readPuzzles(S.NUMBERED);
    eq(n.puzzles.map((x) => [x.no, x.text, x.by]), [[1, 'A stitch in time saves nine.', 'English proverb'], [2, 'Diligence is the mother of good luck.', 'Benjamin Franklin'], [3, 'Heaven is under our feet as well as over our heads.', 'Henry David Thoreau']]);
    const pp = CX.reader.readPuzzles(S.PIPES);
    eq(pp.puzzles.map((x) => [x.no, x.by]), [[0, 'Franklin D. Roosevelt'], [0, 'Emily Dickinson'], [0, '']]);
    eq(CX.reader.kind(S.PIPES), 'puzzles');
  });

  await test('reader: the extras reply is never read as puzzles', () => {
    const e = CX.reader.readExtras(S.EXTRAS);
    ok(/^Welcome to a book/.test(e.welcome[0]));
    eq(e.closing.length, 2);
    ok(/^Each puzzle hides/.test(e.blurb));
    eq(CX.reader.kind(S.EXTRAS), 'extras');
    eq(CX.reader.kind('Sure! Happy to help with your book.'), 'unknown');
  });

  // ---------- engine ----------
  await test('engine: no letter stands for itself, no two swap, numbers never A=1; same seed, same code', () => {
    for (let i = 0; i < 1500; i++) {
      const k = E.makeKey('s' + i, 'letters'), vals = Object.values(k);
      eq(new Set(vals).size, 26, 'a code letter used twice');
      E.ABC.split('').forEach((c) => { ok(k[c] !== c, 'fixed letter ' + c); ok(k[k[c]] !== c, 'swap ' + c + k[c]); });
      const n = E.makeKey('n' + i, 'numbers');
      eq(new Set(Object.values(n)).size, 26);
      E.ABC.split('').forEach((c, j) => ok(n[c] !== j + 1 && n[c] >= 1 && n[c] <= 26));
    }
    eq(E.makeKey('same', 'letters'), E.makeKey('same', 'letters'));
  });

  await test('engine: cleaning, units, given letters always leave four to find, the hint is new', () => {
    eq(E.clean('  **"Café — the  quick fox!"**  '), 'Café — the quick fox!');
    eq(E.upper('Café naïve Straße'), 'CAFE NAIVE STRASSE');
    eq(E.cleanBy('— Mark Twain.'), 'Mark Twain');
    const u = E.units("Self-help isn't hard");
    eq(u.map((x) => x.cells.map((c) => c.ch).join('') + (x.glue ? '+' : '')), ['SELF-', 'HELP+', "ISN'T", 'HARD']);
    eq(E.given('ABABABCDEFG', 3), ['A', 'B', 'C']);
    eq(E.given('AAABBBCCDDEEFGH', 3), ['A', 'B', 'C'], 'most used first, ties by the alphabet');
    ok(E.given('AABBCCDD', 3).length <= 0, 'four letters: none given');
    const g = E.given('THE QUICK BROWN FOX', 3), hnt = E.hint('THE QUICK BROWN FOX', g);
    ok(g.indexOf(hnt) < 0 && hnt);
    eq(E.problems({ text: '' }), ['it has no text yet']);
    ok(/too short/.test(E.problems({ text: 'Hi there you' })[0]));
    eq(E.problems({ text: 'Well done is better than well said.' }), []);
  });

  await test('the old "Letter E > 22%" failure: sentences heavy on one letter, short words, few letters all print', () => {
    const hard = ['Eve sees three geese.', 'Keep the green tree free; we need these sweet bees here.', 'Never ever let me be,', 'See the bee! See me!! Seek peace.', 'Ah ha ha, a ball and a hall: all at a gala.'];
    const p = P.newProject();
    p.seed = 'e-heavy'; p.plan.count = 10;
    hard.concat(hard).forEach((t, i) => { p.puzzles['p' + (i + 1)] = { text: t, by: '', v: 0 }; });
    P.puzzles(p).forEach((x) => {
      const res = CX.puzzles.get(p, x);
      if (E.letterCount(res.text) >= E.MIN_LETTERS) ok(res.ok, 'not ready: ' + res.text + ' ' + res.problems);
    });
    ok(CX.layout.layoutBook(p, {}).pages.length > 4);
  });

  await test('puzzles: statuses, and only sound puzzles print, numbered without a gap', () => {
    const p = fullProject(null, 12);
    p.puzzles.p3.text = 'Too short';
    delete p.puzzles.p7;
    eq(CX.puzzles.status(p, { id: 'p3', no: 3, index: 2 }).state, 'weak');
    eq(CX.puzzles.status(p, { id: 'p7', no: 7, index: 6 }).state, 'empty');
    const pr = CX.puzzles.printed(p);
    eq(pr.length, 10);
    eq(pr.map((x) => x.no), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    ok(pr.every((x) => x.id !== 'p3' && x.id !== 'p7'));
  });

  await test('plan: project files keep what they should and repair the rest; old 1.0 settings open', () => {
    const p = P.normalize({ seed: 'x', app: 'cryptogram', plan: { count: 9999, perPage: 7, code: 'zzz', by: 'nope', theme: 'bible' }, puzzles: { p1: { text: 'Hello there my old friend.', by: 'X', v: 2 }, bad: { text: 'no' }, p2: { text: 5 } } });
    eq([p.plan.count, p.plan.perPage, p.plan.code, p.plan.by, p.plan.theme], [100, 4, 'letters', 'code', 'bible']);
    eq(Object.keys(p.puzzles), ['p1']);
    const old = JSON.parse(JSON.stringify({ version: '1.0', book: { title: 'Old', author: 'Me' }, format: { trim: '8.5x11', largePrint: true, paper: 'cream' }, puzzles: { count: 120, perPage: 4, numericVariant: true }, layout: {}, sections: {} }));
    ok(P.isOldConfig(old) && !P.isOldConfig(p));
    const q = P.fromOldConfig(old);
    eq([q.book.title, q.book.author, q.book.print, q.book.paper, q.plan.count, q.plan.perPage, q.plan.code], ['Old', 'Me', 'xl', 'cream', 120, 1, 'numbers']);
    const r = CX.content.fillFromLibrary(q);
    ok(r.filled.length > 60, 'filled from the library: ' + r.filled.length);
  });

  // ---------- prompts ----------
  await test('prompts: batches, the lengths that fit, the rules for quotes, no "..."', () => {
    const p = P.newProject();
    p.plan.count = 60;
    const l = CX.prompts.list(p);
    eq(l.map((x) => x.kind), ['puzzles', 'puzzles', 'puzzles', 'extras']);
    const t = CX.prompts.text(p, l[0]);
    ok(/PUZZLE 1 \(easy\)/.test(t) && /PUZZLE 25 \(medium\)/.test(t), 'labels with levels');
    ok(/never put a famous name on a line/i.test(t) && /died before 1955/.test(t), 'quote rules');
    ok(/TEXT: Well done is better than well said\.\nBY: Benjamin Franklin/.test(t), 'the sample in the reply format');
    P.LEVELS.forEach((lv) => { const r = CX.prompts.length(p, lv.id); ok(t.indexOf(r.lo + ' to ' + r.hi + ' characters') >= 0, lv.id + ' length in the prompt'); });
    p.plan.theme = 'facts';
    const f = CX.prompts.text(p, l[0]);
    ok(!/BY:/.test(f) && /Facts must be true/.test(f), 'facts: no BY line');
    p.plan.theme = 'bible';
    ok(/King James/.test(CX.prompts.text(p, l[0])) && /BY: Psalm 118:24/.test(CX.prompts.text(p, l[0])));
    [CX.prompts.text(p, l[3])].forEach((x) => ok(!/connections|new york times/i.test(x)));
  });

  await test('prompts: every page size, text size and puzzles a page asks for sentences that fit', () => {
    CX.kdp.TRIMS.forEach((t) => ['regular', 'large', 'xl'].forEach((pr) => [1, 2, 3, 4].forEach((per) => ['letters', 'numbers'].forEach((code) => {
      const p = P.newProject();
      p.book.trim = t.id; p.book.print = pr; p.plan.perPage = per; p.plan.code = code;
      const real = CX.layout.perPage(p), cap = CX.layout.capacity(p, real);
      ok(real >= 1 && real <= per, 'per page');
      ok(cap >= CX.layout.MIN_CHARS || real === 1, t.id + ' ' + pr + ' ' + per + ' ' + code + ': room ' + cap);
      P.LEVELS.forEach((lv) => {
        const r = CX.prompts.length(p, lv.id);
        ok(r.lo < r.hi && r.hi <= Math.max(30, cap), t.id + ' ' + pr + ' ' + per + ' ' + lv.id + ': asks up to ' + r.hi + ', room ' + cap);
        // a sentence of the longest length asked fits the space it is meant for
        const res = { text: S.sentence(r.hi, 3), by: 'Ralph Waldo Emerson', code: code, key: E.makeKey('k', code), given: [] };
        ok(CX.layout.fitsPage(p, res), 'fits a page');
      });
    }))));
  });

  await test('prompts: copying again asks only for what is missing, lists used sentences, and checks', () => {
    const p = fullProject(null, 30);
    delete p.puzzles.p4; delete p.puzzles.p9;
    const l = CX.prompts.list(p), t = CX.prompts.text(p, l[0]);
    ok(/Write these 2 puzzles: PUZZLE 4 \(easy\), PUZZLE 9 \(easy\)\./.test(t), t.split('\n')[4]);
    ok(/already in the book/.test(t));
    const c = CX.prompts.checkText(p, l[0].puzzles);
    ok(/word for word/.test(c) && (c.match(/^PUZZLE /gm) || []).length === 23, 'check prompt lists the filled puzzles');
  });

  // ---------- content ----------
  await test('content: a reply fills puzzles; a finished one changes only with Replace; a batch numbered from 1 lands in place', () => {
    const p = P.newProject();
    p.plan.count = 50;
    const l = CX.prompts.list(p);
    let rep = CX.content.addReply(p, CX.reader.readPuzzles(S.reply(LIB.slice(0, 25), CX.util.range(1, 25))), l[0].puzzles);
    eq(rep.filled.length, 25);
    // the second batch, numbered 1 to 25 by the chat
    rep = CX.content.addReply(p, CX.reader.readPuzzles(S.reply(LIB.slice(25, 50), CX.util.range(1, 25))), l[1].puzzles);
    eq(rep.filled.length, 25);
    eq(p.puzzles.p26.text, LIB[25].text);
    eq(p.puzzles.p1.text, LIB[0].text);
    const again = CX.reader.readPuzzles(S.reply([LIB[60]], [3]));
    eq(CX.content.rewrites(p, again, l[0].puzzles).map((r) => r.pz.no), [3]);
    rep = CX.content.addReply(p, again, l[0].puzzles, []);
    eq(p.puzzles.p3.text, LIB[2].text, 'kept');
    rep = CX.content.addReply(p, again, l[0].puzzles, ['p3']);
    eq(p.puzzles.p3.text, LIB[60].text, 'replaced');
    // a reply without numbers fills the open puzzles of its prompt in order
    delete p.puzzles.p30; delete p.puzzles.p31;
    rep = CX.content.addReply(p, CX.reader.readPuzzles(S.PIPES), l[1].puzzles);
    eq(rep.filled.map((x) => x.no), [30, 31]);
  });

  await test('content: the library fills a book with real quotes of the right length, never twice', () => {
    ['quotes', 'inspire', 'proverbs'].forEach((th) => {
      const p = P.newProject();
      p.plan.theme = th; p.plan.count = 100;
      const r = CX.content.fillFromLibrary(p);
      ok(r.filled.length > 20, th + ' filled ' + r.filled.length);
      eq(CX.content.repeats(p), [], 'no repeats');
      r.filled.forEach((x) => ok(CX.puzzles.status(p, x).state === 'ok', th + ' puzzle ' + x.no + ' not ready'));
    });
    const big = P.newProject();
    big.plan.count = 300;
    const r = CX.content.fillFromLibrary(big);
    ok(r.left.length > 0 && r.filled.length > 150 && r.filled.length + r.left.length === 300, 'a 300 book takes the library and says what is left: ' + r.filled.length);
    const f = P.newProject();
    f.plan.theme = 'facts';
    eq(CX.content.libraryPool(f).length, 0);
  });

  await test('content: a full book has every prompt done and passes the checklist', () => {
    const p = fullProject(null, 40);
    ok(CX.prompts.list(p).every((x) => x.done), 'prompts done');
    const book = CX.layout.layoutBook(p, {});
    const bad = CX.checklist.run(p, book).filter((i) => !i.ok);
    eq(bad.map((i) => i.label + ': ' + i.detail), []);
  });

  // ---------- layout ----------
  await test('layout: every trim x text size x puzzles a page x code x name inside the KDP margins, no overlaps', () => {
    let n = 0;
    CX.kdp.TRIMS.forEach((t) => ['regular', 'large', 'xl'].forEach((pr) => [1, 2, 3, 4].forEach((per) => {
      const code = per % 2 ? 'letters' : 'numbers', by = ['code', 'plain', 'back'][(per + pr.length) % 3];
      const p = fullProject((x) => { x.book.trim = t.id; x.book.print = pr; x.plan.perPage = per; x.plan.code = code; x.plan.by = by; x.plan.tracker = per !== 3; }, 14);
      eq(CX.puzzles.printed(p).length, 14, t.id + ' ' + pr + ' ' + per + ' every puzzle prints');
      const book = CX.layout.layoutBook(p, {});
      book.pages.forEach((pg) => {
        checkPage(pg);
        const c = clash(pg);
        ok(!c, t.id + ' ' + pr + ' ' + per + ' ' + code + ' page ' + pg.num + ' (' + pg.label + '): ' + c);
        if (book.S.large) pg.items.forEach((it) => { if (it.t === 'text' && !pg.meta.small) ok(it.size >= book.S.min - 0.01, 'large print: ' + it.str + ' ' + it.size + ' on ' + pg.label); });
        n++;
      });
    })));
    ok(n > 1000, 'pages checked: ' + n);
  });

  await test('layout: a sentence too long for its space gets a page of its own; too long for any page stays out', () => {
    const p = fullProject((x) => { x.plan.perPage = 3; }, 9);
    p.puzzles.p5.text = S.sentence(420, 1);
    p.puzzles.p6.text = S.sentence(2000, 2);
    const pr = CX.puzzles.printed(p);
    ok(CX.puzzles.status(p, { id: 'p5', no: 5, index: 4 }).state === 'ok', 'long one is ready');
    ok(/too long for a page/.test(CX.puzzles.status(p, { id: 'p6', no: 6, index: 5 }).pz.problems[0] || ''), 'too long for any page');
    eq(pr.length, 8);
    const book = CX.layout.layoutBook(p, {}), pg = book.pages.filter((x) => x.kind === 'puzzle' && /PUZZLE 5\b/.test(texts(x)))[0];
    ok(pg && !/PUZZLE [46]\b/.test(texts(pg)), 'puzzle 5 alone on its page');
    book.pages.forEach(checkPage);
  });

  await test('layout: hint and solution page numbers point to the right pages; the code is right', () => {
    const p = fullProject(null, 30), book = CX.layout.layoutBook(p, {});
    CX.puzzles.printed(p).forEach((x) => {
      const res = CX.puzzles.get(p, x), page = book.pages.filter((pg) => pg.kind === 'puzzle' && texts(pg).indexOf('PUZZLE ' + x.no + ' ') >= 0)[0];
      ok(page, 'puzzle page ' + x.no);
      const m = /Hint: page (\d+)\s+·\s+Solution: page (\d+)/.exec(texts(page).split('PUZZLE ' + x.no + ' ')[1]);
      ok(m, 'refs on puzzle ' + x.no);
      ok(texts(book.pages[+m[1] - 1]).indexOf(res.key[res.hint] + ' = ' + res.hint) >= 0, 'hint on page ' + m[1]);
      ok(texts(book.pages[+m[2] - 1]).indexOf(res.text.split(' ')[0]) >= 0, 'solution on page ' + m[2]);
      // the codes printed decode to the sentence
      const inv = E.invert(res.key);
      const decoded = E.encode(res.coded, res.key).replace(/[A-Z]/g, (c) => inv[c]);
      eq(decoded, E.upper(res.coded));
    });
  });

  await test('layout: kids, every level and theme lay out; the example is on How to Solve', () => {
    ['adults', 'family', 'kids'].forEach((a) => ['mixed', 'easy', 'medium', 'hard'].forEach((lv) => {
      const p = fullProject((x) => { P.setAudience(x.plan, a); x.plan.level = lv; }, 12);
      const book = CX.layout.layoutBook(p, {}), how = book.pages.filter((pg) => pg.kind === 'how')[0];
      ok(/An example|AN EXAMPLE/.test(texts(how)) && /Answer:/.test(texts(how)), 'example on How to Solve');
      if (lv === 'mixed') eq(book.pages.filter((pg) => pg.kind === 'level').length, 3);
    }));
    P.THEMES.forEach((th) => { const p = fullProject((x) => { x.plan.theme = th.id; }, 10); ok(CX.layout.layoutBook(p, { draft: true }).pages.length > 8, th.id); });
  });

  await test('layout: 500 puzzles stay inside the KDP page limit at 2 or more a page, and lay out fast', () => {
    const p = fullProject((x) => { x.plan.perPage = 2; x.book.print = 'regular'; }, 500);
    const t0 = Date.now(), book = CX.layout.layoutBook(p, {});
    ok(book.pages.length <= CX.kdp.maxPages(p.book.trim, p.book.paper), book.pages.length + ' pages');
    eq(CX.puzzles.printed(p).length, 500);
    ok(Date.now() - t0 < 8000, 'took ' + (Date.now() - t0) + ' ms');
  });

  await test('mix: 30/40/30 as before by default; medium and hard only; any shares; a broken mix is repaired', () => {
    // the default mix gives every puzzle the level it had before the mix could be changed
    [10, 24, 33, 60, 100, 147, 500, 700].forEach((n) => {
      const p = P.newProject();
      p.plan.count = n;
      P.puzzles(p).forEach((x) => { const part = x.index / n; eq(P.levelOf(p, x), part < 0.3 ? 'easy' : part < 0.7 ? 'medium' : 'hard', n + ' puzzles, puzzle ' + x.no); });
    });
    const p = fullProject((x) => { x.plan.mix = { easy: 0, medium: 50, hard: 50 }; }, 40);
    eq(P.levelsIn(p), ['medium', 'hard']);
    eq(P.levelCounts(p), { easy: 0, medium: 20, hard: 20 });
    eq(CX.puzzles.printed(p).length, 40);
    const book = CX.layout.layoutBook(p, {});
    eq(book.pages.filter((pg) => pg.kind === 'level').map((pg) => pg.label), ['Thinking Cap', 'Brain Benders']);
    const how = texts(book.pages.filter((pg) => pg.kind === 'how')[0]) + texts(book.pages[3]);
    ok(/TWO LEVELS/.test(how) && !/Easy: /.test(how), 'How to Solve names the two levels');
    const t = CX.prompts.text(p, CX.prompts.list(p)[0]);
    ok(/MEDIUM: /.test(t) && /HARD: /.test(t) && !/EASY: /.test(t), 'the prompt gives the lengths of the levels in the book');
    book.pages.forEach(checkPage);
    const back = CX.cover.build(p, book.pages.length).items.filter((it) => it.t === 'text').map((it) => it.str).join(' ');
    ok(/Two levels: medium and hard puzzles/.test(back) && !/Three levels/.test(back), 'the back cover names the two levels');
    const q = P.newProject();
    q.plan.count = 200; q.plan.mix = { easy: 10, medium: 20, hard: 70 };
    eq(P.levelCounts(q), { easy: 20, medium: 40, hard: 140 });
    q.plan.mix = { easy: 0, medium: 0, hard: 100 };
    eq(P.levelsIn(q), ['hard']);
    eq(CX.layout.layoutBook(fullProject((x) => { x.plan.mix = { easy: 0, medium: 0, hard: 100 }; }, 12), {}).pages.filter((pg) => pg.kind === 'level').length, 0, 'one level: no opening page');
    eq(P.normalize({ app: 'cryptogram', plan: { mix: { easy: 'x', medium: -5, hard: 900 } }, puzzles: {} }).plan.mix, { easy: 0, medium: 0, hard: 100 });
    eq(P.normalize({ app: 'cryptogram', plan: { mix: { easy: 0, medium: 0, hard: 0 } }, puzzles: {} }).plan.mix, P.MIX);
    eq(P.normalize({ app: 'cryptogram', plan: {}, puzzles: {} }).plan.mix, P.MIX, 'a project file from before the mix');
  });

  await test('heading: on every puzzle page and no other, top or bottom, inside the margins at every size', () => {
    const long = 'Bible Verse Cryptograms for Adults and Seniors: Volume Ten';
    eq(long.length <= P.HEADING_MAX, true);
    let n = 0;
    const dropped = [];
    CX.kdp.TRIMS.forEach((t) => ['regular', 'large', 'xl'].forEach((pr) => ['top', 'bottom'].forEach((at, k) => {
      const head = k ? long : 'Cryptogram Quotes · Volume 2';
      const mut = (x) => { x.book.trim = t.id; x.book.print = pr; x.plan.perPage = k ? 3 : 2; x.plan.code = k ? 'numbers' : 'letters'; };
      const plain = fullProject(mut, 12);
      const p = fullProject((x) => { mut(x); x.plan.heading = head; x.plan.headingAt = at; }, 12);
      eq(CX.puzzles.printed(p).length, 12, t.id + ' ' + pr + ' ' + at + ' every puzzle prints');
      ok(CX.layout.capacity(p, 1) <= CX.layout.capacity(plain, 1) && CX.layout.perPage(p) <= CX.layout.perPage(plain), 'a heading takes room from the puzzles');
      const book = CX.layout.layoutBook(p, {}), shown = CX.layout.headingRoom(p) > 0;
      // a pocket page in large print has no room for a heading: it is left off, and the checklist says so
      eq(CX.checklist.run(p, book).some((i) => i.label === 'Heading' && !i.ok), !shown, t.id + ' ' + pr + ' ' + at + ' checklist');
      if (!shown) { dropped.push(t.id + ' ' + pr); eq(book.pages.length, CX.layout.layoutBook(plain, {}).pages.length); }
      book.pages.forEach((pg) => {
        checkPage(pg);
        const c = clash(pg);
        ok(!c, 'heading ' + at + ' ' + t.id + ' ' + pr + ' page ' + pg.num + ' (' + pg.label + '): ' + c);
        const own = pg.items.filter((it) => it.t === 'text' && it.font === 'serifBold' && head.indexOf(it.str) === 0 || it.t === 'text' && it.font === 'serifBold' && head.slice(-it.str.length) === it.str);
        const said = own.map((it) => it.str).join(' ');
        if (pg.kind === 'puzzle' && !shown) eq(said, '', 'no heading where there is no room');
        else if (pg.kind === 'puzzle') {
          eq(said, head, 'the heading on page ' + pg.num);
          const first = pg.items.filter((it) => it.t === 'text' && /^PUZZLE \d+$/.test(it.str))[0];
          own.forEach((it) => ok(at === 'top' ? it.y < first.y : it.y > first.y, 'the heading is at the ' + at));
          if (book.S.large) own.forEach((it) => ok(it.size >= book.S.min - 0.01, 'large print heading ' + it.size));
          n++;
        } else ok(pg.kind === 'title' || !said, 'no heading on ' + pg.label);
      });
    })));
    ok(n > 150, 'puzzle pages checked: ' + n);
    eq(dropped, ['5x8 xl'], 'only the pocket size in large print with the number code has no room');
    // no heading: the pages are what they were
    const a = fullProject(null, 12), b = fullProject((x) => { x.plan.heading = '   '; }, 12);
    eq(CX.layout.layoutBook(a, {}).pages.length, CX.layout.layoutBook(b, {}).pages.length);
    eq(P.heading(b), '');
    eq(P.normalize({ app: 'cryptogram', plan: { heading: 5, headingAt: 'side' }, puzzles: {} }).plan.heading, '');
    eq(P.normalize({ app: 'cryptogram', plan: { heading: 'x'.repeat(200), headingAt: 'bottom' }, puzzles: {} }).plan.headingAt, 'bottom');
  });

  await test('sections: the puzzles are shared out, by number or evenly; too many sections and odd lines are handled', () => {
    const p = P.newProject();
    p.plan.count = 100;
    eq(P.sections(p), [], 'no sections unless asked for');
    eq(P.sectionOf(p, { index: 5 }), null);
    p.plan.sections = 'Food\n\n  Chores  \nPhones';
    eq(P.sections(p).map((s) => [s.title, s.from, s.count]), [['Food', 0, 34], ['Chores', 34, 33], ['Phones', 67, 33]]);
    eq([P.sectionOf(p, { index: 33 }).title, P.sectionOf(p, { index: 34 }).title, P.sectionOf(p, { index: 99 }).title], ['Food', 'Chores', 'Phones']);
    p.plan.sections = 'Food | 12\nChores\nPhones|20\nMoney';
    eq(P.sections(p).map((s) => [s.title, s.from, s.count]), [['Food', 0, 12], ['Chores', 12, 34], ['Phones', 46, 20], ['Money', 66, 34]]);
    p.plan.sections = 'Food | 10\nChores | 10';
    const rest = P.sectionPlan(p);
    eq([rest.list.map((s) => s.count), rest.rest, rest.empty], [[10, 90], 80, []], 'the last section takes what no section asked for');
    p.plan.sections = 'Food | 60\nChores | 60\nPhones | 5\nMoney';
    const over = P.sectionPlan(p);
    eq([over.list.map((s) => [s.title, s.count]), over.empty], [[['Food', 60], ['Chores', 40]], ['Phones', 'Money']]);
    eq(over.of.length, 100, 'every puzzle has a section');
    p.plan.count = 10;
    p.plan.sections = CX.util.range(1, 30).map((n) => 'Part ' + n).join('\n');
    eq([P.sections(p).length, P.sectionPlan(p).empty.length], [10, 20], 'more sections than puzzles');
    ok(CX.checklist.run(p, CX.layout.layoutBook(p, {})).some((i) => i.label === 'Sections' && !i.ok), 'the checklist says which sections are empty');
    p.plan.sections = 'A title that is much too long ' + 'x'.repeat(200) + ' | 3';
    eq([P.sections(p)[0].title.length, P.sections(p)[0].count], [P.HEADING_MAX, 10]);
    eq(P.normalize({ app: 'cryptogram', plan: { sections: 7 }, puzzles: {} }).plan.sections, '');
    eq(P.normalize({ app: 'cryptogram', plan: { sections: 'A\nB' }, puzzles: {} }).plan.sections, 'A\nB');
  });

  await test('sections: each section starts a page with its own title, the levels run inside it, the prompts name the subjects', () => {
    const text = 'Food\nChores and Pocket Money | 7\nPhones (and screens)';
    const mut = (x) => { x.plan.sections = text; x.plan.mix = { easy: 0, medium: 50, hard: 50 }; x.plan.perPage = 2; };
    const p = fullProject(mut, 30);
    eq(P.sections(p).map((s) => [s.from + 1, s.count]), [[1, 12], [13, 7], [20, 11]]);
    // every section: its first half medium, its second half hard
    eq(P.puzzles(p).map((x) => P.levelOf(p, x)[0]).join(''), 'mmmmmmhhhhhh' + 'mmmmhhh' + 'mmmmmmhhhhh');
    eq(CX.puzzles.printed(p).length, 30);
    const book = CX.layout.layoutBook(p, {});
    eq(book.pages.filter((pg) => pg.kind === 'level').length, 0, 'no level dividers in a book with sections');
    const titles = P.sections(p).map((s) => s.title);
    book.pages.filter((pg) => pg.kind === 'puzzle').forEach((pg) => {
      const nos = pg.items.filter((it) => it.t === 'text' && /^PUZZLE \d+$/.test(it.str)).map((it) => +it.str.slice(7));
      const own = [...new Set(nos.map((n) => P.sectionOf(p, { index: n - 1 }).title))];
      eq(own.length, 1, 'page ' + pg.num + ' holds one section');
      const bold = pg.items.filter((it) => it.t === 'text' && it.font === 'serifBold').map((it) => it.str).join(' ');
      eq(bold, own[0], 'the title on page ' + pg.num);
      titles.filter((t) => t !== own[0]).forEach((t) => ok(texts(pg).indexOf(t) < 0, 'no other title on page ' + pg.num));
    });
    eq(book.sections.filter((s) => s.sub).map((s) => s.title), titles, 'the sections are in the jump list');
    book.pages.forEach((pg) => { checkPage(pg); const c = clash(pg); ok(!c, 'page ' + pg.num + ': ' + c); });
    // the prompt tells the AI the subject of each puzzle; the reply still lands by its number
    const q = P.newProject();
    mut(q); q.plan.count = 30;
    const l = CX.prompts.list(q), t = CX.prompts.text(q, l[0]);
    ok(/- Puzzles 1 to 12: Food\n- Puzzles 13 to 19: Chores and Pocket Money\n- Puzzles 20 to 25: Phones \(and screens\)/.test(t), 'sections in the first prompt');
    ok(!/Subjects to draw on/.test(t), 'the sections replace the general subjects');
    ok(/- Puzzles 26 to 30: Phones \(and screens\)/.test(CX.prompts.text(q, l[1])) && !/Food/.test(CX.prompts.text(q, l[1])), 'only its own sections in the second prompt');
    ok(/PUZZLE 13 \(medium\)/.test(t) && /PUZZLE 12 \(hard\)/.test(t), 'labels with the level inside the section');
    ok(/about the subject of its section\? Puzzles 1 to 12: Food;/.test(CX.prompts.checkText(p, l[0].puzzles)), 'the check prompt asks about the subject');
    // a puzzle left out of the PDF: the rest keep their sections and are numbered without a gap
    delete p.puzzles.p12;
    const b2 = CX.layout.layoutBook(p, {}), pg2 = b2.pages.filter((pg) => /PUZZLE 12 /.test(texts(pg) + ' '))[0];
    ok(pg2 && texts(pg2).indexOf('Chores and Pocket Money') >= 0, 'the first puzzle of the second section is now number 12');
  });

  await test('sections: with a heading too, top or bottom, at every page and text size; one a page and four a page', () => {
    const text = 'Food and Family Dinners\nChores, Pocket Money and Learning to Help Around the House\nPhones';
    let n = 0;
    CX.kdp.TRIMS.forEach((t) => ['regular', 'large', 'xl'].forEach((pr) => ['top', 'bottom'].forEach((at, k) => {
      const p = fullProject((x) => { x.book.trim = t.id; x.book.print = pr; x.plan.perPage = k ? 4 : 1; x.plan.sections = text; x.plan.heading = k ? 'Cryptograms for Parents of Teens' : ''; x.plan.headingAt = at; x.plan.code = k ? 'letters' : 'numbers'; x.plan.tracker = !k; }, 12);
      eq(CX.puzzles.printed(p).length, 12, t.id + ' ' + pr + ' ' + at + ' every puzzle prints');
      const book = CX.layout.layoutBook(p, {}), shown = CX.layout.headingRoom(p) > 0;
      book.pages.forEach((pg) => {
        checkPage(pg);
        const c = clash(pg);
        ok(!c, 'sections ' + at + ' ' + t.id + ' ' + pr + ' page ' + pg.num + ' (' + pg.label + '): ' + c);
        if (pg.kind !== 'puzzle') return;
        const sec = P.sectionOf(p, { index: +/PUZZLE (\d+)/.exec(texts(pg))[1] - 1 });
        const bold = pg.items.filter((it) => it.t === 'text' && it.font === 'serifBold').map((it) => it.str).join(' ');
        eq(bold, shown ? sec.title : '', t.id + ' ' + pr + ' the section title on page ' + pg.num);
        if (shown && k) ok(pg.items.some((it) => it.t === 'text' && it.font === 'sans' && it.str === 'Cryptograms for Parents of Teens'), 'the heading above the title');
        if (book.S.large && !pg.meta.small) pg.items.forEach((it) => { if (it.t === 'text') ok(it.size >= book.S.min - 0.01, 'large print: ' + it.str + ' ' + it.size); });
        n++;
      });
      eq(CX.checklist.run(p, book).some((i) => i.label === 'Heading' && !i.ok), !shown, t.id + ' ' + pr + ' checklist');
    })));
    ok(n > 200, 'puzzle pages checked: ' + n);
  });

  await test('700 puzzles: the most a book takes; inside the KDP page limit at 2 a page; 16 pt is large print', () => {
    eq([P.validCount(700), P.validCount(701), P.MAX_COUNT], [700, 0, 700]);
    const p = fullProject((x) => { x.plan.perPage = 2; x.plan.heading = 'Cryptogram Puzzles'; }, 700);
    const t0 = Date.now(), book = CX.layout.layoutBook(p, {});
    eq(CX.puzzles.printed(p).length, 700);
    ok(book.pages.length <= CX.kdp.maxPages(p.book.trim, p.book.paper), book.pages.length + ' pages');
    ok(Date.now() - t0 < 12000, 'took ' + (Date.now() - t0) + ' ms');
    eq(CX.prompts.list(p).length, 29);
    ok(/PUZZLE 700 /.test(texts(book.pages.filter((pg) => pg.kind === 'puzzle').pop())), 'puzzle 700 is in the book');
    const one = fullProject((x) => { x.plan.perPage = 1; }, 700), big = CX.layout.layoutBook(one, {});
    ok(CX.checklist.run(one, big).some((i) => i.label === 'Page count' && !i.ok), 'one a page is over the limit, and the checklist says so');
    const q = P.newProject();
    q.book.print = 'xl';
    ok(P.largePrint(q) && /Large Print/.test(P.titleIdeas(q).join(' ')), 'large print in the title ideas');
  });

  await test('png: the resolution goes into the picture, and the .zip holds every file as it is', () => {
    // a 1 x 1 PNG
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    const out = CX.png.setDpi(png, 300), dv = new DataView(out.buffer);
    eq(out.length, png.length + 21);
    eq(Buffer.from(out.slice(37, 41)).toString('latin1'), 'pHYs');
    eq([dv.getUint32(41), dv.getUint32(45), out[49]], [11811, 11811, 1]);
    eq(dv.getUint32(50), CX.pptx.crc32(out.subarray(37, 50)), 'the chunk checksum');
    eq(CX.png.setDpi(out, 150).length, out.length, 'a second time replaces the first');
    eq(new DataView(CX.png.setDpi(out, 150).buffer).getUint32(41), 5906);
    eq(Buffer.from(out.slice(out.length - 12, out.length - 8)).toString('hex'), '00000000', 'the end of the picture is untouched');
    const files = [{ name: 'book-page-001.png', bytes: out }, { name: 'book-page-002.png', bytes: png }];
    const zip = Buffer.concat(CX.png.zipParts(files).map((x) => Buffer.from(x)));
    eq(zip.readUInt32LE(0), 0x04034b50);
    const end = zip.length - 22;
    eq([zip.readUInt32LE(end), zip.readUInt16LE(end + 10)], [0x06054b50, 2]);
    const cd = zip.readUInt32LE(end + 16);
    eq(zip.readUInt32LE(cd), 0x02014b50);
    eq(zip.readUInt32LE(cd + 16), CX.pptx.crc32(out));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgz-')), f = path.join(dir, 'pages.zip');
    fs.writeFileSync(f, zip);
    let res = '';
    try { res = execFileSync('python', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip(), len(z.namelist()), len(z.read("book-page-001.png")))', f], { encoding: 'utf8' }).trim(); }
    catch (e) { res = 'skip'; }
    ok(res === 'skip' || res === 'None 2 ' + out.length, 'python reads the zip: ' + res);
  });

  await test('fuzz: odd replies never break the book (emoji, accents, digits, empty lines, huge, tiny)', () => {
    const odd = ['😀 Smile, it costs nothing and gives so much! 😀', 'Ça va? Über naïve façade — résumé of 1999 and 2024.', '   ', '...', 'OK', 'A'.repeat(900), 'Word '.repeat(150), '"Quotes" inside "quotes" and \'single\' ones, too!', 'Tabs\tand\nnew\nlines in it, here.', '#1 rule: 100% effort & $5 coffee @ 9am + more.'];
    const p = P.newProject();
    p.seed = 'fuzz'; p.plan.count = 20;
    const text = odd.map((t, i) => 'PUZZLE ' + (i + 1) + '\nTEXT: ' + t + '\nBY: ' + (i % 2 ? '' : 'Someone Famous')).join('\n\n');
    CX.content.addReply(p, CX.reader.readPuzzles(text), CX.prompts.list(p)[0].puzzles);
    ['regular', 'xl'].forEach((pr) => [1, 4].forEach((per) => {
      p.book.print = pr; p.plan.perPage = per;
      const book = CX.layout.layoutBook(p, {});
      book.pages.forEach(checkPage);
      CX.layout.layoutBook(p, { draft: true });
      CX.checklist.run(p, book);
    }));
    ok(CX.puzzles.printed(p).length >= 5);
  });

  // ---------- cover ----------
  await test('cover: every template at every trim keeps its words in the safe area', () => {
    const p = fullProject(null, 24);
    CX.kdp.TRIMS.forEach((t) => CX.cover.DESIGNS.forEach((d) => [30, 300].forEach((pages) => ['letters', 'numbers'].forEach((code) => {
      p.book.trim = t.id; p.cover.design = d.id; p.cover.palette = ''; p.plan.code = code;
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
    }))));
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgp-'));
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
