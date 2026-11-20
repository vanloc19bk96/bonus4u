/*
 * node tests/run.js
 * Reader, job plan, prompts, answer balancing and true-or-false questions, every trim x text size
 * x answer placement against the KDP margins and minimums, every cover layout x palette x trim,
 * odd job words, and real PDFs (checked with PyMuPDF through tests/verify-pdf.py when Python has it).
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
  p.book.author = 'Night Shift Press';
  if (mut) mut(p);
  CX.plan.chapters(p).forEach((ch, i) => CX.questions.addReply(p, CX.reader.readQuestions(S.fakeReply(ch.title, p.plan.perChapter, i)), []));
  CX.questions.addExtras(p, CX.reader.readExtras(S.EXTRAS));
  return p;
}
const ALL_EXTRAS = (p) => { p.extras = { facts: true, ranks: true, stories: true, certificate: true }; };

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
      ok(it.y - it.size * 0.8 >= pg.y0 - tol && it.y <= pg.y1 + tol, 'text outside top/bottom on page ' + pg.num + ' (' + pg.label + '): ' + it.str);
    } else if (it.t === 'line') {
      ok(it.w >= CX.kdp.MIN_LINE_PT, 'thin line on page ' + pg.num);
      ok(Math.min(it.x1, it.x2) >= pg.x0 - tol && Math.max(it.x1, it.x2) <= pg.x1 + tol, 'line outside margins on page ' + pg.num + ' (' + pg.label + ')');
      ok(Math.min(it.y1, it.y2) >= pg.y0 - tol && Math.max(it.y1, it.y2) <= pg.y1 + tol, 'line outside top/bottom on page ' + pg.num + ' (' + pg.label + ')');
    } else if (it.t === 'rect') {
      if (it.mode === 'stroke') ok(it.lw >= CX.kdp.MIN_LINE_PT, 'thin box on page ' + pg.num);
      ok(it.x >= pg.x0 - tol && it.x + it.w <= pg.x1 + tol && it.y >= pg.y0 - tol && it.y + it.h <= pg.y1 + tol, 'box outside the margins on page ' + pg.num + ' (' + pg.label + ')');
    } else if (it.t === 'ellipse') {
      ok(it.cx - it.rx >= pg.x0 - tol && it.cx + it.rx <= pg.x1 + tol && it.cy - it.ry >= pg.y0 - tol && it.cy + it.ry <= pg.y1 + tol, 'ring outside the margins on page ' + pg.num + ' (' + pg.label + ')');
    } else if (it.t === 'poly') {
      for (let i = 0; i < it.pts.length; i += 2) ok(it.pts[i] >= pg.x0 - tol && it.pts[i] <= pg.x1 + tol && it.pts[i + 1] >= pg.y0 - tol && it.pts[i + 1] <= pg.y1 + tol, 'shape outside the margins on page ' + pg.num + ' (' + pg.label + ')');
    }
    if (it.ink != null) ok(it.ink >= CX.kdp.MIN_GRAY, 'ink lighter than 10% gray on page ' + pg.num);
  });
}

// Text items that overlap on one page (a sign that two blocks were drawn on top of each other).
function overlaps(pg) {
  const boxes = pg.items.filter((it) => it.t === 'text').map((it) => ({ s: it.str, x0: it.x, x1: it.x + textWidth(it), y0: it.y - it.size * 0.7, y1: it.y }));
  const bad = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5) bad.push(a.s + ' / ' + b.s);
  }
  return bad;
}

(async function main() {
  // ---------- reader ----------
  await test('reader: the asked-for format, two chapters, a true-or-false question', () => {
    const r = CX.reader.readQuestions(S.CLEAN);
    eq(r.groups.map((g) => [g.title, g.questions.length]), [['Through the Ages', 3], ['Famous Nurses', 2]]);
    eq(r.skipped.length, 0);
    const q = r.groups[0].questions[0];
    eq(q.o, ['Clara Barton', 'Florence Nightingale', 'Mary Seacole', 'Dorothea Dix']);
    eq(q.a, 1);
    ok(/night rounds/.test(q.f), 'fact kept');
    ok(q.q.indexOf('“The Lady with the Lamp”') !== -1, 'curly quotes: ' + q.q);
    const tf = r.groups[0].questions[2];
    eq(tf.o, ['True', 'False']); eq(tf.a, 0);
  });

  await test('reader: bold marks, numbers, inline choices, answer by text, a broken question', () => {
    const r = CX.reader.readQuestions(S.MESSY);
    eq(r.groups.length, 1);
    eq(r.groups[0].title, 'Famous Nurses');
    const qs = r.groups[0].questions;
    eq(qs.length, 3);
    eq(qs[0].o, ['Mary Mahoney', 'Harriet Tubman', 'Susie King Taylor', 'Mabel Staupers']);
    eq(qs[0].a, 0);
    eq(qs[1].a, 0, 'answer given as text');
    eq(qs[2].o, ['False', 'True']); eq(qs[2].a, 0, 'false-first true/false read as written');
    ok(/Belgium/.test(qs[2].f), '"Did you know" is a fact');
    eq(r.skipped.map((s) => s.why), ['it had no ANSWER line']);
  });

  await test('reader: a letter and a dot inside a choice ("Johnny B. Goode") is not a new choice', () => {
    const one = CX.reader.readQuestions(['Q: Which Chuck Berry hit is about a country boy?', 'A) Maybellene', 'B) Roll Over Beethoven',
      'C) Johnny B. Goode', 'D) Sweet Little Sixteen', 'ANSWER: C', 'FACT: It came out in 1958.'].join('\n')).groups[0].questions[0];
    eq(one.o, ['Maybellene', 'Roll Over Beethoven', 'Johnny B. Goode', 'Sweet Little Sixteen']);
    eq(one.a, 2);
    const first = CX.reader.readQuestions(['Q: Who sang it?', 'A) Johnny B. Goode', 'B) Chuck Berry', 'C) Elvis', 'D) Pat Boone', 'ANSWER: B'].join('\n')).groups[0].questions[0];
    eq(first.o, ['Johnny B. Goode', 'Chuck Berry', 'Elvis', 'Pat Boone'], 'choice A with "B." inside');
    const inline = CX.reader.readQuestions(['Q: Pick one.', 'A) Johnny B. Goode  B) Peggy Sue  C) Donna  D) Diana', 'ANSWER: A'].join('\n')).groups[0].questions[0];
    eq(inline.o, ['Johnny B. Goode', 'Peggy Sue', 'Donna', 'Diana'], 'inline choices still split');
    const pairs = CX.reader.readQuestions(['Q: Pick one.', 'A) Bing  B) Perry', 'C) Frank  D) Dean', 'ANSWER: C'].join('\n')).groups[0].questions[0];
    eq(pairs.o, ['Bing', 'Perry', 'Frank', 'Dean'], 'two choices per line');
  });

  await test('reader: answer letters in every common shape', () => {
    const o = ['Stethoscope', 'Otoscope', 'Thermometer', 'Sphygmomanometer'];
    ['B', 'b)', '(B)', 'B) Otoscope', 'B - Otoscope', 'Otoscope', '**B**', 'B.'].forEach((s) => eq(CX.reader.answerIndex(s, o), 1, s));
    eq(CX.reader.answerIndex('Scalpel', o), -1);
    eq(CX.reader.answerIndex('True', ['True', 'False']), 0);
    eq(CX.reader.answerIndex('B) False', ['True', 'False']), 1);
  });

  await test('reader: the extras reply, with ranks in every shape', () => {
    const e = CX.reader.readExtras(S.EXTRAS);
    eq(e.welcome.length, 3);
    eq(e.facts.length, 4);
    eq(e.stories, ['What made you want to become a nurse?', 'What do you remember about your very first shift?', 'Who was the best mentor you ever had?']);
    eq(e.ranks, ['Student Nurse|Every expert started right here.', 'New Grad|You know your way around the ward.', 'Charge Nurse|The floor runs smoothly with you on shift.',
      'Nurse Educator|You could teach this book.', 'Chief Nursing Officer|A true nursing legend!']);
    ok(/^Think you know nursing\?/.test(e.blurb));
    eq(CX.reader.kind(S.EXTRAS), 'extras');
    eq(CX.reader.kind(S.CLEAN), 'questions');
    eq(CX.reader.kind('Sure! Here is some text about nursing.'), 'unknown');
    const r2 = CX.reader.readExtras('RANKS:\n1. 0-20%: Rookie - Everyone starts somewhere.\n2. 21–40% Apprentice: Getting there.\n3. Know-It-All - Hyphens stay.\n4. Pro\n5. Legend — Wow.');
    eq(r2.ranks, ['Rookie|Everyone starts somewhere.', 'Apprentice|Getting there.', 'Know-It-All|Hyphens stay.', 'Pro', 'Legend|Wow.']);
  });

  await test('reader: a sentence in the letter that mentions fun facts stays in the letter', () => {
    const e = CX.reader.readExtras('WELCOME:\nWelcome to the break room, friend.\nFun facts about the job are everywhere in this book.\n\nBACK COVER:\nA fun book.');
    eq(e.welcome.length, 2);
    eq(e.facts.length, 0);
    eq(e.blurb, 'A fun book.');
  });

  // ---------- plan ----------
  await test('plan: chapters are written for the job; ids stay put', () => {
    const p = CX.plan.newProject();
    let ch = CX.plan.chapters(p);
    eq(ch.length, 10);
    eq(ch[1].title, 'Famous Nurses');
    ok(/every nurse/.test(ch[4].sub), ch[4].sub);
    ok(/nursing/.test(ch[0].guide));
    p.book.job = 'trucker';
    ch = CX.plan.chapters(p);
    eq(ch[1].title, 'Famous Truck Drivers');
    eq(ch[1].id, 'legends');
    p.book.job = 'jobs';
    ch = CX.plan.chapters(p);
    eq(ch[0].title, 'Work Through the Ages');
    eq(ch.find((c) => c.id === 'weird').title, 'Unusual Jobs');
    ok(!ch.some((c) => /\{|\}/.test(c.title + c.sub + c.guide)), 'no template marks left');
    CX.plan.JOBS.forEach((j) => { p.book.job = j.id; CX.plan.TOPICS.forEach((t) => { p.plan.topics = [t.id]; const c = CX.plan.chapters(p)[0]; ok(c.title && !/\{|\}/.test(c.title + c.sub + c.guide), j.id + '/' + t.id); }); });
  });

  await test('plan: a typed job, plurals and the cover word', () => {
    const p = CX.plan.newProject();
    p.book.job = 'custom'; p.book.jobName = 'dental hygienist';
    let j = CX.plan.job(p.book);
    eq([j.name, j.plural, j.hero], ['Dental Hygienist', 'Dental Hygienists', 'HYGIENIST']);
    eq(j.field, 'the work of dental hygienists');
    eq(CX.plan.titleIdeas(p)[2], 'Think You Know the Work of Dental Hygienists?');
    p.book.jobName = 'secretary'; eq(CX.plan.job(p.book).plural, 'Secretaries');
    p.book.jobName = 'coach'; eq(CX.plan.job(p.book).plural, 'Coaches');
    p.book.jobName = 'bus driver'; p.book.jobPlural = 'bus drivers'; p.book.jobField = 'public transport';
    j = CX.plan.job(p.book);
    eq([j.plural, j.field, j.hero], ['Bus Drivers', 'public transport', 'BUS DRIVER']);
    p.book.hero = ' driver '; eq(CX.plan.hero(p.book), 'DRIVER');
    p.book.jobName = ''; eq(CX.plan.job(p.book).name, 'Worker');
  });

  await test('plan: titles, subtitle count and project files', () => {
    const p = CX.plan.newProject();
    eq(CX.plan.bookTitle(p), 'The Ultimate Nurse Trivia Book');
    eq(CX.plan.titleIdeas(p)[2], 'Think You Know Nursing?');
    ok(/^200 Fun Questions/.test(CX.plan.bookSubtitle(p)), CX.plan.bookSubtitle(p));
    p.plan.perChapter = 15; p.plan.topics = p.plan.topics.slice(0, 7);
    ok(/^100 Fun/.test(CX.plan.bookSubtitle(p)), '105 rounds down to 100');
    eq(CX.plan.roundCount(37), 30); eq(CX.plan.roundCount(12), 12); eq(CX.plan.roundCount(260), 250);
    const n = CX.plan.normalize({ book: { job: 'astronaut', trim: '9x12', print: 'huge', author: 5 }, plan: { perChapter: 999, topics: ['legends', 'nope', 'history'] },
      questions: { history: [{ q: 'ok?', o: ['a', 'b'], a: 1 }, { q: 'bad', o: ['a'], a: 0 }, { q: 'bad2', o: ['a', 'b'], a: 5 }], hacked: [{ q: 'x', o: ['a', 'b'], a: 0 }] },
      ai: { ranks: 'nope', facts: ['a', 7, ' '] }, extras: { facts: 0 } });
    eq([n.book.job, n.book.trim, n.book.print, n.book.author], ['nurse', '6x9', 'regular', '']);
    eq(n.plan.perChapter, 40); eq(n.plan.topics, ['history', 'legends']);
    eq(Object.keys(n.questions), ['history']); eq(n.questions.history.length, 1); eq(n.questions.history[0].f, '');
    eq(n.ai.ranks, []); eq(n.ai.facts, ['a']); eq(n.extras.facts, false);
    eq(CX.plan.normalize(null).book.job, 'nurse');
  });

  // ---------- questions ----------
  await test('questions: replies go to their chapters; repeats and extras are left out', () => {
    const p = CX.plan.newProject();
    p.plan.perChapter = 4;
    const first = CX.prompts.list(p)[0];
    let rep = CX.questions.addReply(p, CX.reader.readQuestions(S.CLEAN), first.chapters);
    eq(rep.added.map((r) => [r.chapter.id, r.n]), [['history', 3], ['legends', 2]]);
    rep = CX.questions.addReply(p, CX.reader.readQuestions(S.CLEAN), first.chapters);
    eq(rep.repeats, 5);
    rep = CX.questions.addReply(p, CX.reader.readQuestions(S.MESSY), first.chapters);
    eq(rep.added[0].n, 2); eq(rep.extra, 1);
    eq((p.questions.legends || []).length, 4);
  });

  await test('questions: a reply without chapter names fills the prompt’s chapters', () => {
    const p = CX.plan.newProject();
    const pr = CX.prompts.list(p)[1];
    const text = S.fakeReply('x', 3, 1).replace(/^CHAPTER: x\n/, '');
    const rep = CX.questions.addReply(p, CX.reader.readQuestions(text), pr.chapters);
    eq(rep.added[0].chapter.id, pr.chapters[0].id);
    eq(CX.questions.matchChapter('Chapter 3: TOOLS OF THE TRADE', CX.plan.chapters(p)).id, 'tools');
    eq(CX.questions.matchChapter('Famous nurses', CX.plan.chapters(p)).id, 'legends');
  });

  await test('questions: right answers spread evenly over A to D, choices travel with them', () => {
    const qs = [];
    for (let i = 0; i < 40; i++) qs.push({ q: 'Q' + i, o: ['w1 ' + i, 'right ' + i, 'w2 ' + i, 'w3 ' + i], a: 1, f: '' });
    const out = CX.questions.balance([], qs, 'seed');
    const c = [0, 0, 0, 0];
    out.forEach((q, i) => { c[q.a]++; eq(q.o[q.a], 'right ' + i); eq(q.o.length, 4); });
    eq(c, [10, 10, 10, 10]);
  });

  await test('questions: true-or-false keeps True first and stays out of the A-D balance', () => {
    ok(CX.questions.isTrueFalse({ o: ['False', 'True'] }) && CX.questions.isTrueFalse({ o: ['Yes', 'No'] }) && !CX.questions.isTrueFalse({ o: ['True', 'Maybe'] }));
    const qs = [{ q: 't1', o: ['False', 'True'], a: 0, f: '' }, { q: 't2', o: ['True', 'False'], a: 1, f: '' }];
    for (let i = 0; i < 8; i++) qs.push({ q: 'Q' + i, o: ['a', 'right', 'c', 'd'], a: 1, f: '' });
    const out = CX.questions.balance([], qs, 's');
    eq(out[0].o, ['True', 'False']); eq(out[0].a, 1, 'False stays the answer after the swap');
    eq(out[1].o, ['True', 'False']); eq(out[1].a, 1);
    const c = [0, 0, 0, 0];
    out.slice(2).forEach((q) => c[q.a]++);
    eq(c, [2, 2, 2, 2]);
    const p = fullProject();
    ok(CX.questions.trueFalseCount(p) > 0);
    const sp = CX.questions.letterSpread(p);
    ok(Math.max.apply(null, sp) - Math.min.apply(null, sp) <= CX.plan.chapters(p).length, 'even spread ' + sp);
  });

  await test('questions: number choices and "all of the above" keep their order', () => {
    ok(CX.questions.keepOrder({ o: ['1854', '1860', '1873', '1901'] }));
    ok(CX.questions.keepOrder({ o: ['98.6 °F', '99 °F', '100 °F', '101 °F'] }) || CX.questions.keepOrder({ o: ['98.6°F', '99°F', '100°F', '101°F'] }));
    ok(CX.questions.keepOrder({ o: ['Gloves', 'Masks', 'Gowns', 'All of the above'] }));
    ok(!CX.questions.keepOrder({ o: ['Stethoscope', 'Otoscope', 'Scalpel', 'Forceps'] }));
    const out = CX.questions.balance([], [{ q: 'x', o: ['1854', '1860', '1873', '1901'], a: 2, f: '' }], 's');
    eq(out[0].o, ['1854', '1860', '1873', '1901']); eq(out[0].a, 2);
  });

  await test('questions: extras report a short list of ranks instead of using it', () => {
    const p = CX.plan.newProject();
    const r = CX.questions.addExtras(p, CX.reader.readExtras('RANKS:\n- Rookie - a\n- Pro - b\n\nBACK COVER:\nText.'));
    eq(p.ai.ranks, []); eq(r.got, ['back cover text']); ok(r.short.length === 1);
    ok(!CX.prompts.hasExtra(p, 'ranks'));
  });

  // ---------- prompts ----------
  await test('prompts: grouped chapters, only the missing questions, extras last', () => {
    const p = CX.plan.newProject();
    let l = CX.prompts.list(p);
    eq(l.length, 6);
    eq(l[0].chapters.length, 2);
    eq(l[5].kind, 'extras');
    let t = CX.prompts.text(p, l[0]);
    ok(t.indexOf('CHAPTER: Through the Ages — exactly 20 questions') !== -1, t.slice(0, 400));
    ok(/nursing/.test(t) && /true-or-false/.test(t) && /United States/.test(t), 'job, true/false and country in the prompt');
    CX.questions.addReply(p, CX.reader.readQuestions(S.CLEAN), l[0].chapters);
    t = CX.prompts.text(p, CX.prompts.list(p)[0]);
    ok(t.indexOf('exactly 17 questions') !== -1 && t.indexOf('Do not repeat') !== -1 && t.indexOf('Lady with the Lamp') !== -1);
    p.plan.tf = false;
    ok(!/true-or-false/.test(CX.prompts.text(p, CX.prompts.list(p)[0])));
    p.plan.perChapter = 10;
    eq(CX.prompts.list(p)[0].chapters.length, 4);
    p.plan.perChapter = 30;
    eq(CX.prompts.list(p)[0].chapters.length, 1);
    const ex = CX.prompts.text(p, { kind: 'extras' });
    ok(/FUN FACTS/.test(ex) && /RANKS/.test(ex) && /BACK COVER/.test(ex) && !/STORY PROMPTS/.test(ex));
    p.extras.facts = false; p.extras.ranks = false; p.extras.stories = true;
    const ex2 = CX.prompts.text(p, { kind: 'extras' });
    ok(!/FUN FACTS/.test(ex2) && !/RANKS/.test(ex2) && /STORY PROMPTS/.test(ex2));
    p.book.job = 'jobs'; p.book.country = 'world';
    ok(/jobs and careers/.test(CX.prompts.text(p, CX.prompts.list(p)[0])) && /all over the world/.test(CX.prompts.text(p, CX.prompts.list(p)[0])));
  });

  await test('prompts: a full book has every prompt done and passes the checklist', () => {
    const p = fullProject(ALL_EXTRAS);
    ok(CX.prompts.list(p).every((x) => x.done));
    const book = CX.layout.layoutBook(p, {});
    const items = CX.checklist.run(p, book);
    ok(CX.checklist.ready(items), JSON.stringify(items.filter((i) => !i.ok)));
    p.book.job = 'custom'; p.book.jobName = '';
    ok(!CX.checklist.ready(CX.checklist.run(p, book)), 'a typed job needs its name');
  });

  // ---------- layout ----------
  await test('layout: every trim x text size x answer placement inside the KDP margins', () => {
    const counts = [];
    CX.kdp.TRIMS.forEach((t) => Object.keys(CX.layout.PRINT).forEach((pr) => ['chapter', 'back'].forEach((ans) => {
      const p = fullProject((p) => { ALL_EXTRAS(p); p.book.trim = t.id; p.book.print = pr; p.plan.answers = ans; });
      const book = CX.layout.layoutBook(p, {});
      book.pages.forEach(checkPage);
      book.pages.forEach((pg) => { const o = overlaps(pg); ok(!o.length, 'overlapping words on page ' + pg.num + ' (' + pg.label + '): ' + o.slice(0, 3).join(' | ')); });
      const m = CX.kdp.margins(book.pages.length);
      ok(book.m.inside >= m.minInside * 72, 'gutter too small for ' + book.pages.length + ' pages');
      ok(book.pages.length <= CX.kdp.maxPages(t.id, 'white'), 'too many pages');
      counts.push(t.id + '/' + pr + '/' + ans + ':' + book.pages.length);
    })));
    console.log('     pages: ' + counts.filter((c) => /chapter/.test(c)).join(' '));
  });

  await test('layout: the draft shows placeholders, the print leaves empty parts out', () => {
    const p = CX.plan.newProject();
    ALL_EXTRAS(p);
    const draft = CX.layout.layoutBook(p, { draft: true });
    ok(draft.pages.some((pg) => pg.items.some((it) => it.t === 'text' && /questions go here/.test(it.str))), 'placeholder shown');
    ok(draft.pages.some((pg) => pg.items.some((it) => it.t === 'text' && /Your ranks/.test(it.str))), 'ranks placeholder shown');
    draft.pages.forEach(checkPage);
    const print = CX.layout.layoutBook(p, {});
    ok(print.pages.every((pg) => pg.items.every((it) => !(it.t === 'text' && /go here|Your pen name|Your ranks|Story prompts/.test(it.str)))), 'no placeholder in print');
    print.pages.forEach(checkPage);
  });

  await test('layout: contents page numbers point at their parts', () => {
    const p = fullProject(ALL_EXTRAS);
    const book = CX.layout.layoutBook(p, {});
    book.sections.forEach((s) => {
      const pg = book.pages[s.page - 1], before = book.pages[s.page - 2];
      const title = s.title.replace(/^\d+\. /, '');
      ok(pg.label === title && before.label !== title, 'page ' + s.page + ' should start "' + title + '", it is ' + pg.label);
    });
    const contents = book.pages[2].items.filter((it) => it.t === 'text').map((it) => it.str);
    ok(contents.indexOf('Contents') !== -1 && contents.indexOf('Famous Nurses') !== -1 && contents.indexOf('Did You Know?') !== -1);
    eq(book.sections.map((s) => s.title).slice(-3), ['Stories from the Job', 'Score Card', 'Certificate of Achievement']);
  });

  await test('layout: questions never split, the answer page matches the question', () => {
    const p = fullProject();
    const ch = CX.plan.chapters(p)[0], q = p.questions[ch.id][0];
    const book = CX.layout.layoutBook(p, {});
    const qPage = book.pages.find((pg) => pg.kind === 'chapter' && pg.items.some((it) => it.str === '1.'));
    const ansPage = book.pages.find((pg) => pg.kind === 'answers');
    const letter = 'ABCD'[q.a] + ')';
    ok(ansPage.items.findIndex((it) => it.str === letter) > 0, 'answer letter on the answer page');
    ok(qPage.items.some((it) => it.str === q.o[q.a]), 'the right choice is printed with the question');
  });

  await test('layout: true or false prints A) True and B) False on one line', () => {
    const p = fullProject();
    const book = CX.layout.layoutBook(p, {});
    let found = 0;
    book.pages.filter((pg) => pg.kind === 'chapter').forEach((pg) => {
      pg.items.forEach((it, i) => {
        if (it.str !== 'True') return;
        const f = pg.items.find((x, j) => j > i && x.str === 'False');
        ok(f && Math.abs(f.y - it.y) < 0.01 && f.x > it.x, 'False on the same line, page ' + pg.num);
        found++;
      });
    });
    ok(found >= 10, 'true/false questions printed: ' + found);
  });

  await test('layout: score card ranks cover every score, best first; certificate on one page', () => {
    const p = fullProject(ALL_EXTRAS);
    const book = CX.layout.layoutBook(p, {});
    const sc = book.pages.filter((pg) => pg.kind === 'scores');
    const strs = [].concat(...sc.map((pg) => pg.items.filter((it) => it.t === 'text').map((it) => it.str)));
    ok(strs.indexOf('Total (out of 200)') !== -1, 'total: ' + strs.filter((s) => /Total/.test(s)));
    const ranges = strs.filter((s) => /^\d+–\d+$/.test(s));
    eq(ranges, ['161–200', '121–160', '81–120', '41–80', '0–40']);
    eq(strs.indexOf('Chief Nursing Officer') < strs.indexOf('Student Nurse'), true);
    const cert = book.pages.filter((pg) => pg.kind === 'certificate');
    eq(cert.length, 1);
    ok(cert[0].items.some((it) => it.str === 'CERTIFICATE') && cert[0].items.some((it) => it.str === 'NURSE'), 'certificate words and seal');
    eq(cert[0].folio, false);
  });

  await test('layout: odd jobs and long words stay inside the pages', () => {
    const cases = [
      (p) => { p.book.job = 'custom'; p.book.jobName = 'Certified Registered Nurse Anesthetist'; },
      (p) => { p.book.job = 'jobs'; p.book.trim = '5.5x8.5'; p.book.print = 'xl'; },
      (p) => { p.book.job = 'realestate'; p.book.title = 'Real Estate Agents: The Big Book of Property, Paperwork and Open House Trivia for Agents and Brokers'; },
      (p) => { p.book.job = 'paramedic'; p.plan.perChapter = 40; p.plan.topics = CX.plan.TOPICS.map((t) => t.id); p.book.trim = '8.5x11'; }
    ];
    cases.forEach((mut) => {
      const p = fullProject((p) => { ALL_EXTRAS(p); mut(p); });
      const book = CX.layout.layoutBook(p, {});
      book.pages.forEach(checkPage);
      ok(book.pages.length <= CX.kdp.maxPages(p.book.trim, p.book.paper), 'page limit: ' + book.pages.length);
    });
  });

  // ---------- cover ----------
  // Every word inside KDP's safe area, at least 7 pt, nothing slanted on the front, lines thick enough.
  function checkCover(cv, name) {
    const g = cv.guides, B = g.bleed;
    ok(!cv.overlapsBarcode, name + ': back text runs into the barcode box');
    cv.items.forEach((it) => {
      if (it.t === 'line') ok(it.w >= CX.kdp.MIN_LINE_PT, name + ': thin line');
      if (it.mode === 'stroke') ok(it.lw >= CX.kdp.MIN_LINE_PT, name + ': thin outline');
      ['x', 'y', 'w', 'h', 'cx', 'cy', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'size'].forEach((k) => { if (k in it) ok(isFinite(it[k]), name + ': ' + k + ' is not a number'); });
      if (it.pts) ok(it.pts.every(isFinite), name + ': shape point is not a number');
      if (it.t !== 'text') return;
      ok(it.size >= CX.kdp.MIN_FONT_PT, name + ': "' + it.str + '" under 7 pt');
      if (it.angle) { ok(it.x < g.spineX1, name + ': slanted text on the front'); return; }
      const w = textWidth(it), front = it.x >= g.spineX1;
      const x0 = front ? g.spineX1 + 0.125 * 72 : B + 0.125 * 72, x1 = front ? cv.W - B - 0.125 * 72 : g.spineX0 - 0.125 * 72;
      ok(it.x >= x0 - 0.5 && it.x + w <= x1 + 0.5, name + ': "' + it.str + '" outside the safe area');
      ok(it.y - it.size * 0.75 >= B + 0.125 * 72 - 0.5 && it.y <= cv.H - B - 0.125 * 72 + 0.5, name + ': "' + it.str + '" too close to top/bottom');
    });
  }

  await test('cover: 44 templates in 5 groups, each with its own palette and layout', () => {
    const D = CX.cover.DESIGNS;
    eq(D.length, 44);
    eq(new Set(D.map((d) => d.id)).size, 44, 'ids unique');
    eq(CX.cover.GROUPS.map((gr) => D.filter((d) => d.group === gr.id).length), [10, 8, 8, 8, 10]);
    D.forEach((d) => {
      ok(CX.coverFronts[d.layout], d.id + ': layout ' + d.layout);
      ok(CX.cover.PALETTES.some((p) => p.id === d.pal), d.id + ': palette ' + d.pal);
      ok(d.hint && d.label && !/birthday|\bage\b/i.test(d.hint + d.label), d.id + ': label and hint');
    });
    eq(new Set(CX.cover.PALETTES.map((p) => p.id)).size, CX.cover.PALETTES.length, 'palette ids unique');
    eq(CX.cover.paletteId({ design: 'shield', palette: '' }), 'police');
    eq(CX.cover.paletteId({ design: 'badge', palette: 'sunny' }), 'sunny');
    eq(CX.cover.paletteId({ design: 'gone', palette: 'nope' }), 'scrubs');
    eq(CX.plan.newProject().cover.design, D[0].id);
  });

  await test('cover: the title splits around the job word', () => {
    const t = CX.cover.titleParts;
    eq(t('The Ultimate Nurse Trivia Book', 'NURSE'), { pre: 'The Ultimate', num: 'NURSE', suf: '', post: 'Trivia Book' });
    eq(t('Think You Know Nursing?', 'NURSE'), { pre: 'Think You Know', num: 'NURSING?', suf: '', post: '' });
    eq(t('Nurses: A Trivia Book', 'NURSE'), { pre: '', num: 'NURSES', suf: '', post: 'A Trivia Book' });
    eq(t('The Real Estate Agent Quiz', 'REAL ESTATE'), { pre: 'The', num: 'REAL ESTATE', suf: '', post: 'Agent Quiz' });
    eq(t('Code Blue Quiz', 'NURSE'), { pre: '', num: 'NURSE', suf: '', post: 'Code Blue Quiz' });
    eq(t('The Veterinarian Quiz', 'VET'), { pre: '', num: 'VET', suf: '', post: 'The Veterinarian Quiz' });
  });

  await test('cover: every template x trim, sized by KDP and inside the safe areas', () => {
    CX.kdp.TRIMS.forEach((t) => {
      const p = fullProject((p) => { ALL_EXTRAS(p); p.book.trim = t.id; });
      const pages = CX.layout.layoutBook(p, {}).pages.length;
      const dims = CX.kdp.cover(t.id, pages, 'white');
      CX.cover.DESIGNS.forEach((d) => {
        p.cover.design = d.id; p.cover.palette = '';
        const cv = CX.cover.build(p, pages);
        ok(Math.abs(cv.W - dims.width * 72) < 0.01 && Math.abs(cv.H - dims.height * 72) < 0.01, 'cover size');
        checkCover(cv, d.id + '/' + t.id);
        ok(cv.items.some((it) => it.t === 'text' && it.x >= cv.guides.spineX1 && /NURS/.test(it.str)), d.id + '/' + t.id + ': the job word is on the front');
      });
    });
  });

  await test('cover: every palette on every template stays inside the safe areas', () => {
    const p = fullProject();
    const pages = CX.layout.layoutBook(p, {}).pages.length;
    CX.cover.DESIGNS.forEach((d, i) => CX.cover.PALETTES.forEach((pl, j) => {
      if ((i + j) % 5) return;   // a fifth of the pairs: every template and every palette several times
      p.cover.design = d.id; p.cover.palette = pl.id;
      checkCover(CX.cover.build(p, pages), d.id + '/' + pl.id);
    }));
  });

  await test('cover: odd words: long jobs, two-word jobs, long or plain titles, no pen name or subtitle', () => {
    const cases = [
      (p) => { p.book.job = 'firefighter'; },
      (p) => { p.book.job = 'realestate'; p.book.title = 'The Big Real Estate Quiz'; },
      (p) => { p.book.job = 'custom'; p.book.jobName = 'Certified Registered Nurse Anesthetist'; p.book.title = 'The Certified Registered Nurse Anesthetist Trivia Challenge for CRNAs, Students and Their Families'; p.book.subtitle = 'Three hundred fun questions about anesthesia history, pharmacology, equipment, famous firsts and life in the operating room, with answers and fun facts'; },
      (p) => { p.book.title = 'Code Blue Quiz'; p.book.author = ''; p.book.subtitle = ' '; },
      (p) => { p.book.job = 'jobs'; p.book.trim = '5.5x8.5'; },
      (p) => { p.book.job = 'social'; p.book.trim = '8.5x11'; p.book.author = 'A Very Long Pen Name Indeed For Testing Purposes Press'; },
      (p) => { p.book.hero = 'SUPERCALIFRAGILISTIC'; p.book.trim = '5.5x8.5'; }
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
    const small = CX.cover.build(fullProject((p) => { p.plan.perChapter = 5; p.plan.topics = ['history', 'legends', 'tools']; }), 40);
    ok(!small.items.some((it) => it.angle), 'no spine text under 79 pages');
  });

  await test('svg: the preview renders every page and the cover without bad numbers', () => {
    const p = fullProject(ALL_EXTRAS);
    const book = CX.layout.layoutBook(p, { draft: true });
    book.pages.forEach((pg) => { const s = CX.svg.render(pg, { margins: true }); ok(typeof s === 'string' && s.indexOf('NaN') === -1 && s.indexOf('undefined') === -1, 'page ' + pg.num); });
    CX.cover.DESIGNS.forEach((d) => {
      p.cover.design = d.id;
      const s = CX.svg.renderCover(CX.cover.build(p, book.pages.length), {});
      ok(s.indexOf('NaN') === -1 && s.indexOf('undefined') === -1, d.id);
    });
  });

  // ---------- PDF ----------
  await test('pdf: interior and cover, checked with PyMuPDF', async () => {
    const p = fullProject(ALL_EXTRAS);
    const book = CX.layout.layoutBook(p, {});
    const bytes = await CX.pdf.build(book, { fileId: CX.util.hashHex('a') + CX.util.hashHex('b') });
    const cv = CX.cover.build(p, book.pages.length);
    const cbytes = await CX.pdf.buildCover(cv, { fileId: CX.util.hashHex('c') + CX.util.hashHex('d') });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otb-'));
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

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
