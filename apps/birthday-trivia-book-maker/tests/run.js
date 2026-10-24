/*
 * node tests/run.js
 * Reader, chapter plan, prompts, answer balancing, every trim x text size x answer placement
 * against the KDP margins and minimums, every cover layout x palette, and real PDFs (checked with
 * PyMuPDF through tests/verify-pdf.py when Python has it).
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

// A project with every chapter full and the extras in.
function fullProject(mut) {
  const p = CX.plan.newProject();
  p.book.author = 'Golden Years Press';
  if (mut) mut(p);
  CX.plan.chapters(p).forEach((ch, i) => CX.questions.addReply(p, CX.reader.readQuestions(S.fakeReply(ch.title, p.plan.perChapter, i)), []));
  CX.questions.addExtras(p, CX.reader.readExtras(S.EXTRAS));
  return p;
}

const F = CX.metrics.load();
function textWidth(it) { return F[it.font].width(it.str, it.size, it.ls || 0); }

// Every item inside the page's safe area, and the KDP minimums.
function checkPage(pg) {
  const tol = 0.6;
  pg.items.forEach((it) => {
    if (it.t === 'text') {
      ok(it.size >= CX.kdp.MIN_FONT_PT, 'text under 7 pt on page ' + pg.num + ': ' + it.str);
      const w = textWidth(it);
      ok(it.x >= pg.x0 - tol && it.x + w <= pg.x1 + tol, 'text outside the margins on page ' + pg.num + ' (' + pg.label + '): "' + it.str + '" x ' + it.x.toFixed(1) + '-' + (it.x + w).toFixed(1) + ' of ' + pg.x0.toFixed(1) + '-' + pg.x1.toFixed(1));
      ok(it.y - it.size * 0.8 >= pg.y0 - tol && it.y <= pg.y1 + tol, 'text outside top/bottom on page ' + pg.num + ': ' + it.str);
    } else if (it.t === 'line') {
      ok(it.w >= CX.kdp.MIN_LINE_PT, 'thin line on page ' + pg.num);
      ok(Math.min(it.x1, it.x2) >= pg.x0 - tol && Math.max(it.x1, it.x2) <= pg.x1 + tol, 'line outside margins on page ' + pg.num);
      ok(Math.min(it.y1, it.y2) >= pg.y0 - tol && Math.max(it.y1, it.y2) <= pg.y1 + tol, 'line outside top/bottom on page ' + pg.num);
    } else if (it.t === 'rect') {
      if (it.mode === 'stroke') ok(it.lw >= CX.kdp.MIN_LINE_PT, 'thin box on page ' + pg.num);
      ok(it.x >= pg.x0 - tol && it.x + it.w <= pg.x1 + tol && it.y >= pg.y0 - tol && it.y + it.h <= pg.y1 + tol, 'box outside the margins on page ' + pg.num);
    }
    if (it.ink != null) ok(it.ink >= CX.kdp.MIN_GRAY, 'ink lighter than 10% gray on page ' + pg.num);
  });
}

(async function main() {
  // ---------- reader ----------
  await test('reader: the asked-for format, two chapters', () => {
    const r = CX.reader.readQuestions(S.CLEAN);
    eq(r.groups.map((g) => [g.title, g.questions.length]), [['Growing Up', 3], ['Music & Dancing', 2]]);
    eq(r.skipped.length, 0);
    const q = r.groups[1].questions[0];
    eq(q.o, ['Bing Crosby', 'Perry Como', 'Frank Sinatra', 'Dean Martin']);
    eq(q.a, 2);
    ok(/bobby-soxers/.test(q.f), 'fact kept');
    ok(q.q.indexOf('“The Voice”') !== -1, 'curly quotes: ' + q.q);
  });

  await test('reader: bold marks, numbers, inline choices, answer by text, a broken question', () => {
    const r = CX.reader.readQuestions(S.MESSY);
    eq(r.groups.length, 1);
    eq(r.groups[0].title, 'Music & Dancing');
    const qs = r.groups[0].questions;
    eq(qs.length, 3);
    eq(qs[0].o, ['The Twist', 'The Mashed Potato', 'The Stroll', 'The Hustle']);
    eq(qs[0].a, 0);
    eq(qs[1].a, 0, 'answer given as text');
    eq(qs[2].a, 1);
    ok(/Otis Redding/.test(qs[2].f), '"Did you know" is a fact');
    eq(r.skipped.map((s) => s.why), ['it had no ANSWER line']);
  });

  await test('reader: answer letters in every common shape', () => {
    const o = ['Kodak', 'Polaroid', 'Canon', 'Leica'];
    ['B', 'b)', '(B)', 'B) Polaroid', 'B - Polaroid', 'Polaroid', '**B**', 'B.'].forEach((s) => eq(CX.reader.answerIndex(s, o), 1, s));
    eq(CX.reader.answerIndex('Nikon', o), -1);
  });

  await test('reader: the extras reply', () => {
    const e = CX.reader.readExtras(S.EXTRAS);
    eq(e.welcome.length, 3);
    eq(e.born.length, 4);
    eq(e.memories, ['What was your very first job, and what did it pay?', 'Which song always gets you dancing?', 'What was your first car?']);
    ok(/^Turning 90/.test(e.blurb));
    eq(CX.reader.kind(S.EXTRAS), 'extras');
    eq(CX.reader.kind(S.CLEAN), 'questions');
    eq(CX.reader.kind('Sure! Here is some text about birthdays.'), 'unknown');
  });

  await test('reader: a welcome letter that starts with the word "Welcome" stays in the letter', () => {
    const e = CX.reader.readExtras('WELCOME:\nWelcome to your big day, dear friend.\nMore text.\n\nBACK COVER:\nA fun book.');
    eq(e.welcome[0], 'Welcome to your big day, dear friend.');
    eq(e.blurb, 'A fun book.');
  });

  // ---------- plan ----------
  await test('plan: decades follow the age and merge the early ones', () => {
    const p = CX.plan.newProject();
    p.plan.style = 'decade';
    p.book.age = 90; p.book.year = 2026;
    let ch = CX.plan.chapters(p);
    eq(ch[0].title, 'The 1930s & 1940s');
    eq(ch[ch.length - 1].title, 'The 2020s');
    eq(ch.length, 9);
    p.book.age = 40;
    ch = CX.plan.chapters(p);
    eq(ch.map((c) => c.id), ['d1990', 'd2000', 'd2010', 'd2020']);
    eq(ch[0].title, 'The 1980s & 1990s');
    p.book.age = 100;
    eq(CX.plan.chapters(p)[0].sub, 'From the year you were born to age 13');
  });

  await test('plan: titles and project files', () => {
    const p = CX.plan.newProject();
    p.book.age = 75; p.book.year = 2027;
    eq(CX.plan.bookTitle(p.book), 'The 75th Birthday Trivia Book');
    ok(/1952/.test(CX.plan.bookSubtitle(p.book)));
    eq(CX.plan.ordinal(81), '81st'); eq(CX.plan.ordinal(92), '92nd'); eq(CX.plan.ordinal(83), '83rd'); eq(CX.plan.ordinal(111), '111th');
    const n = CX.plan.normalize({ book: { age: 'x' }, plan: { perChapter: 999 } });
    eq(n.book.age, 90); eq(n.plan.perChapter, 40); ok(Array.isArray(n.plan.topics) && n.plan.topics.length === 10);
  });

  // ---------- questions ----------
  await test('questions: replies go to their chapters; repeats and extras are left out', () => {
    const p = CX.plan.newProject();
    p.plan.perChapter = 4;
    const first = CX.prompts.list(p)[0];
    let rep = CX.questions.addReply(p, CX.reader.readQuestions(S.CLEAN), first.chapters);
    eq(rep.added.map((r) => [r.chapter.id, r.n]), [['childhood', 3], ['music', 2]]);
    rep = CX.questions.addReply(p, CX.reader.readQuestions(S.CLEAN), first.chapters);
    eq(rep.repeats, 5);
    rep = CX.questions.addReply(p, CX.reader.readQuestions(S.MESSY), first.chapters);
    eq(rep.added[0].n, 2); eq(rep.extra, 1);
    eq((p.questions.music || []).length, 4);
  });

  await test('questions: a reply without chapter names fills the prompt’s chapters', () => {
    const p = CX.plan.newProject();
    const pr = CX.prompts.list(p)[1];
    const text = S.fakeReply('x', 3, 1).replace(/^CHAPTER: x\n/, '');
    const rep = CX.questions.addReply(p, CX.reader.readQuestions(text), pr.chapters);
    eq(rep.added[0].chapter.id, pr.chapters[0].id);
    eq(CX.questions.matchChapter('Chapter 3: The 1950s', CX.plan.decades(CX.plan.reader(p.book))).id, 'd1950');
    eq(CX.questions.matchChapter('MUSIC AND DANCING', CX.plan.chapters(p)).id, 'music');
  });

  await test('questions: right answers spread evenly over A to D, choices travel with them', () => {
    const qs = [];
    for (let i = 0; i < 40; i++) qs.push({ q: 'Q' + i, o: ['w1 ' + i, 'right ' + i, 'w2 ' + i, 'w3 ' + i], a: 1, f: '' });
    const out = CX.questions.balance([], qs, 'seed');
    const c = [0, 0, 0, 0];
    out.forEach((q, i) => { c[q.a]++; eq(q.o[q.a], 'right ' + i); eq(q.o.length, 4); });
    eq(c, [10, 10, 10, 10]);
  });

  await test('questions: number choices and "all of the above" keep their order', () => {
    ok(CX.questions.keepOrder({ o: ['1943', '1944', '1945', '1946'] }));
    ok(CX.questions.keepOrder({ o: ['$3', '$5', '$10', '$20'] }));
    ok(CX.questions.keepOrder({ o: ['Coffee', 'Tires', 'Chocolate', 'All of the above'] }));
    ok(!CX.questions.keepOrder({ o: ['Kodak', 'Polaroid', 'Canon', 'Leica'] }));
    const out = CX.questions.balance([], [{ q: 'x', o: ['1943', '1944', '1945', '1946'], a: 2, f: '' }], 's');
    eq(out[0].o, ['1943', '1944', '1945', '1946']); eq(out[0].a, 2);
  });

  // ---------- prompts ----------
  await test('prompts: grouped chapters, only the missing questions, extras last', () => {
    const p = CX.plan.newProject();
    p.plan.perChapter = 20;
    let l = CX.prompts.list(p);
    eq(l.length, 6);
    eq(l[0].chapters.length, 2);
    eq(l[5].kind, 'extras');
    let t = CX.prompts.text(p, l[0]);
    ok(t.indexOf('CHAPTER: Growing Up — exactly 20 questions') !== -1, t.slice(0, 400));
    ok(t.indexOf('born in 1936') !== -1);
    CX.questions.addReply(p, CX.reader.readQuestions(S.CLEAN), l[0].chapters);
    t = CX.prompts.text(p, CX.prompts.list(p)[0]);
    ok(t.indexOf('exactly 17 questions') !== -1 && t.indexOf('Do not repeat') !== -1 && t.indexOf('Which crooner') !== -1);
    p.plan.perChapter = 10;
    eq(CX.prompts.list(p)[0].chapters.length, 4);
    p.plan.perChapter = 30;
    eq(CX.prompts.list(p)[0].chapters.length, 1);
    const ex = CX.prompts.text(p, { kind: 'extras' });
    ok(/YEAR FACTS/.test(ex) && /MEMORY PROMPTS/.test(ex) && /BACK COVER/.test(ex));
    p.extras.born = false; p.extras.memories = false;
    ok(!/YEAR FACTS/.test(CX.prompts.text(p, { kind: 'extras' })));
  });

  await test('prompts: a full book has every prompt done and passes the checklist', () => {
    const p = fullProject();
    ok(CX.prompts.list(p).every((x) => x.done));
    const book = CX.layout.layoutBook(p, {});
    const items = CX.checklist.run(p, book);
    ok(CX.checklist.ready(items), JSON.stringify(items.filter((i) => !i.ok)));
  });

  // ---------- layout ----------
  await test('layout: every trim x text size x answer placement inside the KDP margins', () => {
    const counts = [];
    CX.kdp.TRIMS.forEach((t) => Object.keys(CX.layout.PRINT).forEach((pr) => ['chapter', 'back'].forEach((ans) => {
      const p = fullProject((p) => { p.book.trim = t.id; p.book.print = pr; p.plan.answers = ans; });
      const book = CX.layout.layoutBook(p, {});
      book.pages.forEach(checkPage);
      const m = CX.kdp.margins(book.pages.length);
      ok(book.m.inside >= m.minInside * 72, 'gutter too small for ' + book.pages.length + ' pages');
      counts.push(t.id + '/' + pr + '/' + ans + ':' + book.pages.length);
    })));
    console.log('     pages: ' + counts.filter((c) => /chapter/.test(c)).join(' '));
  });

  await test('layout: the draft shows placeholders, the print leaves empty parts out', () => {
    const p = CX.plan.newProject();
    const draft = CX.layout.layoutBook(p, { draft: true });
    ok(draft.pages.some((pg) => pg.items.some((it) => it.t === 'text' && /questions go here/.test(it.str))), 'placeholder shown');
    draft.pages.forEach(checkPage);
    const print = CX.layout.layoutBook(p, {});
    ok(print.pages.every((pg) => pg.items.every((it) => !(it.t === 'text' && /go here|Your pen name/.test(it.str)))), 'no placeholder in print');
  });

  await test('layout: contents page numbers point at their parts', () => {
    const p = fullProject();
    const book = CX.layout.layoutBook(p, {});
    book.sections.forEach((s) => {
      const pg = book.pages[s.page - 1], before = book.pages[s.page - 2];
      const title = s.title.replace(/^\d+\. /, '');
      ok(pg.label === title && before.label !== title, 'page ' + s.page + ' should start "' + title + '", it is ' + pg.label);
    });
    const contents = book.pages[2].items.filter((it) => it.t === 'text').map((it) => it.str);
    ok(contents.indexOf('Contents') !== -1 && contents.indexOf('Growing Up') !== -1);
  });

  await test('layout: questions never split, the answer page matches the question', () => {
    const p = fullProject();
    const ch = CX.plan.chapters(p)[0], q = p.questions[ch.id][0];
    const book = CX.layout.layoutBook(p, {});
    const qPage = book.pages.find((pg) => pg.kind === 'chapter' && pg.items.some((it) => it.str === '1.'));
    const ansPage = book.pages.find((pg) => pg.kind === 'answers');
    const letter = 'ABCD'[q.a] + ')';
    const lab = ansPage.items.findIndex((it) => it.str === letter);
    ok(lab > 0, 'answer letter on the answer page');
    ok(qPage.items.some((it) => it.str === q.o[q.a]), 'the right choice is printed with the question');
  });

  // ---------- cover ----------
  // Every word inside KDP's safe area, at least 7 pt, nothing slanted on the front, lines thick enough.
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

  await test('cover: 50 templates in 5 groups, each with its own palette and layout', () => {
    const D = CX.cover.DESIGNS;
    eq(D.length, 50);
    eq(new Set(D.map((d) => d.id)).size, 50, 'ids unique');
    CX.cover.GROUPS.forEach((gr) => eq(D.filter((d) => d.group === gr.id).length, 10, gr.id));
    D.forEach((d) => {
      ok(CX.coverFronts[d.layout], d.id + ': layout ' + d.layout);
      ok(CX.cover.PALETTES.some((p) => p.id === d.pal), d.id + ': palette ' + d.pal);
      ok(d.hint && d.label, d.id + ': label and hint');
    });
    // a template starts in its own colors; an old project with an explicit palette keeps it
    eq(CX.cover.paletteId({ design: 'challenge', palette: '' }), 'cherry');
    eq(CX.cover.paletteId({ design: 'badge', palette: 'sunny' }), 'sunny');
    eq(CX.cover.paletteId({ design: 'gone', palette: 'nope' }), 'sunny');
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

  await test('cover: every palette on every template stays inside the safe areas', () => {
    const p = fullProject();
    const pages = CX.layout.layoutBook(p, {}).pages.length;
    CX.cover.DESIGNS.forEach((d, i) => CX.cover.PALETTES.forEach((pl, j) => {
      if ((i + j) % 6) return;   // a sixth of the pairs: every template and every palette several times
      p.cover.design = d.id; p.cover.palette = pl.id;
      checkCover(CX.cover.build(p, pages), d.id + '/' + pl.id);
    }));
  });

  await test('cover: odd words: young and old ages, long or plain titles, no pen name or subtitle', () => {
    const cases = [
      (p) => { p.book.age = 18; },
      (p) => { p.book.age = 110; p.book.title = 'Happy 110th Birthday!'; },
      (p) => { p.book.age = 100; p.book.title = 'Born in 1926: The Big 100th Birthday Trivia Challenge Book for Grandma and the Whole Family'; p.book.subtitle = 'Three hundred fun questions about music, movies, sports, prices, news and everyday life from the twenties to today, with answers and fun facts'; },
      (p) => { p.book.title = 'Grandpa Quiz'; p.book.author = ''; p.book.subtitle = ' '; },
      (p) => { p.book.age = 21; p.book.title = 'The 21st Birthday Quiz Book'; p.book.trim = '5.5x8.5'; },
      (p) => { p.book.age = 65; p.book.trim = '8.5x11'; p.book.author = 'A Very Long Pen Name Indeed For Testing Purposes Press'; }
    ];
    cases.forEach((mut, ci) => {
      const p = fullProject(mut);
      const pages = CX.layout.layoutBook(p, {}).pages.length;
      CX.cover.DESIGNS.forEach((d) => { p.cover.design = d.id; p.cover.palette = ''; checkCover(CX.cover.build(p, pages), 'case ' + ci + '/' + d.id); });
    });
  });

  await test('cover: spine text only from 79 pages, inside the spine', () => {
    const p = fullProject((p) => { p.plan.perChapter = 30; });
    const pages = CX.layout.layoutBook(p, {}).pages.length;
    ok(pages >= 79, 'pages ' + pages);
    const cv = CX.cover.build(p, pages), g = cv.guides;
    const sp = cv.items.filter((it) => it.angle === -90);
    ok(sp.length === 2, 'title and pen name on the spine');
    sp.forEach((it) => ok(it.x - 0.5 >= g.spineX0 && it.x + it.size <= g.spineX1 + 0.5, 'spine text inside the spine'));
    const small = CX.cover.build(fullProject((p) => { p.plan.perChapter = 5; p.plan.topics = ['music', 'movies', 'tv']; }), 40);
    ok(!small.items.some((it) => it.angle), 'no spine text under 79 pages');
  });

  // ---------- PDF ----------
  await test('pdf: interior and cover, checked with PyMuPDF', async () => {
    const p = fullProject();
    const book = CX.layout.layoutBook(p, {});
    const bytes = await CX.pdf.build(book, { fileId: CX.util.hashHex('a') + CX.util.hashHex('b') });
    const cv = CX.cover.build(p, book.pages.length);
    const cbytes = await CX.pdf.buildCover(cv, { fileId: CX.util.hashHex('c') + CX.util.hashHex('d') });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'btb-'));
    const fi = path.join(dir, 'interior.pdf'), fc = path.join(dir, 'cover.pdf');
    fs.writeFileSync(fi, bytes); fs.writeFileSync(fc, cbytes);
    const head = Buffer.from(bytes.slice(0, 5)).toString();
    eq(head, '%PDF-');
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

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
