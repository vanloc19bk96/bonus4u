/*
 * node tests/run.js
 * Reader (questions, decade pages, extras), the decade x round plan, prompts, answer balancing and
 * true-or-false questions, every trim x text size x answer placement against the KDP margins and
 * minimums, every cover layout x palette x trim, odd words, and real PDFs (checked with PyMuPDF
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

// A project with every round full, the decade pages and the extras in.
function fullProject(mut) {
  const p = CX.plan.newProject();
  p.book.author = 'Memory Lane Press';
  if (mut) mut(p);
  CX.plan.rounds(p).forEach((r, i) => CX.questions.addReply(p, CX.reader.readQuestions(S.fakeReply(r.full, p.plan.perRound, i)), []));
  CX.questions.addEras(p, CX.reader.readEras(S.fakeEras(p.plan.decades)));
  CX.questions.addExtras(p, CX.reader.readExtras(S.EXTRAS));
  return p;
}
const SMALL = (p) => { p.plan.decades = ['1950s', '1960s', '1970s']; p.plan.themes = ['music', 'movies', 'tv', 'toys']; p.plan.target = 0; p.plan.perRound = 8; };

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
function strings(pages) { return [].concat(...pages.map((pg) => pg.items.filter((it) => it.t === 'text').map((it) => it.str))); }

(async function main() {
  // ---------- reader ----------
  await test('reader: the asked-for format, two rounds, a true-or-false question', () => {
    const r = CX.reader.readQuestions(S.CLEAN);
    eq(r.groups.map((g) => [g.title, g.questions.length]), [['1950s – Music & Dance', 3], ['1950s – At the Movies', 2]]);
    eq(r.skipped.length, 0);
    const q = r.groups[0].questions[0];
    eq(q.o, ['Buddy Holly', 'Elvis Presley', 'Chuck Berry', 'Little Richard']);
    eq(q.a, 1);
    ok(/billion records/.test(q.f), 'fact kept');
    ok(q.q.indexOf('“The King of Rock and Roll”') !== -1, 'curly quotes: ' + q.q);
    const tf = r.groups[0].questions[2];
    eq(tf.o, ['True', 'False']); eq(tf.a, 0);
  });

  await test('reader: bold marks, numbers, inline choices, answer by text, a broken question', () => {
    const r = CX.reader.readQuestions(S.MESSY);
    eq(r.groups.length, 1);
    eq(r.groups[0].title, '’50s TV & Radio');
    const qs = r.groups[0].questions;
    eq(qs.length, 3);
    eq(qs[0].o, ['I Love Lucy', 'The Honeymooners', 'Leave It to Beaver', 'Father Knows Best']);
    eq(qs[0].a, 0);
    eq(qs[1].a, 0, 'answer given as text');
    eq(qs[2].o, ['False', 'True']); eq(qs[2].a, 0, 'false-first true/false read as written');
    ok(/mid-1960s/.test(qs[2].f), '"Did you know" is a fact');
    eq(r.skipped.map((s) => s.why), ['it had no ANSWER line']);
  });

  await test('reader: answer letters in every common shape', () => {
    const o = ['Jukebox', 'Radio', 'Record player', 'Eight-track'];
    ['B', 'b)', '(B)', 'B) Radio', 'B - Radio', 'Radio', '**B**', 'B.'].forEach((s) => eq(CX.reader.answerIndex(s, o), 1, s));
    eq(CX.reader.answerIndex('Walkman', o), -1);
    eq(CX.reader.answerIndex('True', ['True', 'False']), 0);
    eq(CX.reader.answerIndex('B) False', ['True', 'False']), 1);
  });

  await test('reader: decades in every shape', () => {
    const d = CX.reader.decadeIn;
    eq([d('1950s'), d("the '60s"), d('70s Music'), d('The Eighties'), d('2000s'), d('Round 3: ’90s TV'), d('Music & Dance')], ['1950s', '1960s', '1970s', '1980s', '2000s', '1990s', null]);
    eq(d('1955: Disneyland opens'), null, 'a year is not a decade');
  });

  await test('reader: the decade pages, in the asked-for format and drifted', () => {
    const e = CX.reader.readEras(S.ERAS);
    eq(Object.keys(e), ['1950s', '1960s', '2000s']);
    const a = e['1950s'];
    eq(a.intro.length, 2);
    eq(a.timeline[0], '1951|Color TV broadcasts begin in the United States.');
    eq(a.timeline.length, 6); eq(a.facts.length, 3); eq(a.memories.length, 4);
    const b = e['1960s'];
    eq(b.intro, ['The sixties brought the Beatles, the space race and a whole new kind of fun.']);
    eq(b.timeline.length, 5); eq(b.timeline[4], '1969|People walk on the Moon.');
    eq(b.facts.length, 3); eq(b.memories, ['Where were you when people walked on the Moon?', 'Which band did you love most?', 'What was your favorite TV show?']);
    eq(CX.reader.kind(S.ERAS), 'eras');
  });

  await test('reader: the extras reply, with ranks in every shape', () => {
    const e = CX.reader.readExtras(S.EXTRAS);
    eq(e.welcome.length, 3);
    eq(e.ranks, ['Young Whippersnapper|Every expert started right here.', 'Memory Maker|You know your way around the decades.', 'Golden Oldie|The good old days are in good hands.',
      'Trivia Treasure|You could have written this book.', 'Living Legend|You remember it all!']);
    ok(/^Do you remember\?/.test(e.blurb));
    eq(CX.reader.kind(S.EXTRAS), 'extras');
    eq(CX.reader.kind(S.CLEAN), 'questions');
    eq(CX.reader.kind('Sure! Here is some text about the fifties.'), 'unknown');
    const r2 = CX.reader.readExtras('RANKS:\n1. 0-20%: Rookie - Everyone starts somewhere.\n2. 21–40% Apprentice: Getting there.\n3. Know-It-All - Hyphens stay.\n4. Pro\n5. Legend — Wow.');
    eq(r2.ranks, ['Rookie|Everyone starts somewhere.', 'Apprentice|Getting there.', 'Know-It-All|Hyphens stay.', 'Pro', 'Legend|Wow.']);
  });

  // ---------- plan ----------
  await test('plan: decades x themes make the rounds; ids stay put', () => {
    const p = CX.plan.newProject();
    let rs = CX.plan.rounds(p);
    eq(rs.length, 30);
    eq(rs[0].id, '1950s-music'); eq(rs[0].full, '1950s – Music & Dance'); eq(rs[6].decade.id, '1960s'); eq(rs[6].no, 1);
    eq(CX.plan.questionCount(p), 300);
    p.plan.decades = ['1980s'];
    rs = CX.plan.rounds(p);
    eq(rs.length, 6); eq(rs[2].id, '1980s-tv');
    eq(CX.plan.span(p), 'the 1980s'); eq(CX.plan.range(p), '1980s');
    p.plan.decades = ['1950s', '1960s']; eq(CX.plan.span(p), 'the 1950s and 1960s');
    ok(CX.plan.THEMES.every((t) => t.title && t.sub && t.guide && t.keys), 'every theme complete');
    ok(CX.plan.DECADES.every((d) => d.nick && d.about && d.short), 'every decade complete');
  });

  await test('plan: titles, subtitle count, the big word and project files', () => {
    const p = CX.plan.newProject();
    eq(CX.plan.bookTitle(p), 'Nostalgia Trivia for Seniors');
    eq(CX.plan.hero(p), 'NOSTALGIA');
    ok(/^300 Fun Large-Print Questions from the 1950s to the 1990s, with Answers, Fun Facts and Memory Prompts$/.test(CX.plan.bookSubtitle(p)), CX.plan.bookSubtitle(p));
    p.book.print = 'large';
    ok(!/Large-Print/.test(CX.plan.bookSubtitle(p)), 'Large Print only at 16 pt');
    p.plan.decades = ['1980s'];
    eq(CX.plan.bookTitle(p), 'The Ultimate 1980s Trivia Book'); eq(CX.plan.hero(p), '1980s');
    p.book.hero = " 80s "; eq(CX.plan.hero(p), '80s');
    p.book.hero = 'retro'; eq(CX.plan.hero(p), 'RETRO');
    eq(CX.plan.upper("the '80s and 1990s"), "THE '80s AND 1990s");
    eq(CX.plan.roundCount(37), 30); eq(CX.plan.roundCount(12), 12); eq(CX.plan.roundCount(260), 250);
    const n = CX.plan.normalize({ book: { trim: '9x12', print: 'huge', author: 5, audience: 'aliens' }, plan: { perRound: 999, decades: ['1990s', 'nope', '1950s'], themes: ['tv', 'x', 'music'] },
      questions: { '1950s-music': [{ q: 'ok?', o: ['a', 'b'], a: 1 }, { q: 'bad', o: ['a'], a: 0 }, { q: 'bad2', o: ['a', 'b'], a: 5 }], 'hacked': [{ q: 'x', o: ['a', 'b'], a: 0 }], '1930s-music': [] },
      eras: { '1950s': { intro: ['Hi', 3], timeline: 'no' }, '1830s': { intro: ['x'] } }, ai: { ranks: 'nope', facts: ['a'] }, extras: { eras: 0, stories: true } });
    eq([n.book.trim, n.book.print, n.book.author, n.book.audience], ['8.5x11', 'xl', '', 'seniors']);
    eq(n.plan.perRound, 40, '300 over 4 rounds is more than a round holds'); eq(n.plan.target, 300); eq(n.plan.decades, ['1950s', '1990s']); eq(n.plan.themes, ['music', 'tv']);
    eq(Object.keys(n.questions), ['1950s-music']); eq(n.questions['1950s-music'].length, 1); eq(n.questions['1950s-music'][0].f, '');
    eq(Object.keys(n.eras), ['1950s']); eq(n.eras['1950s'], { intro: ['Hi'], timeline: [], facts: [], memories: [] });
    eq(n.ai, { welcome: [], ranks: [], blurb: '' }); eq(n.extras.eras, false); ok(!('stories' in n.extras));
    eq(CX.plan.normalize(null).plan.decades, CX.plan.DEFAULT_DECADES);
  });

  await test('plan: a total to aim for sets the questions per round', () => {
    const p = CX.plan.newProject();
    eq([p.plan.target, CX.plan.applyTarget(p), CX.plan.questionCount(p)], [300, 10, 300]);
    p.plan.target = 500; eq(CX.plan.applyTarget(p), 17); eq(CX.plan.targetInfo(p), { rounds: 30, per: 17, total: 510, target: 500, short: false, over: true });
    p.plan.target = 600; CX.plan.applyTarget(p); eq(CX.plan.questionCount(p), 600);
    p.plan.themes = ['music', 'tv']; CX.plan.applyTarget(p); eq(CX.plan.targetInfo(p), { rounds: 10, per: 60 > 40 ? 40 : 60, total: 400, target: 600, short: true, over: false });
    p.plan.target = 100; p.plan.decades = CX.plan.DECADES.map((d) => d.id); p.plan.themes = CX.plan.THEMES.map((t) => t.id);
    eq(CX.plan.applyTarget(p), 3, 'never under 3 a round');
    p.plan.target = 0; p.plan.perRound = 12; eq(CX.plan.applyTarget(p), 12, 'by hand: left alone');
    eq(CX.plan.normalize({ plan: { target: 333, perRound: 12 } }).plan.target, 0, 'an unknown total means by hand');
    const n = CX.plan.normalize({ plan: { target: 450, decades: ['1960s', '1970s', '1980s'], themes: ['music', 'tv', 'food', 'home', 'cars'] } });
    eq([n.plan.perRound, CX.plan.questionCount(n)], [30, 450]);
  });

  // ---------- questions ----------
  await test('questions: replies go to their rounds; repeats and extras are left out', () => {
    const p = CX.plan.newProject();
    p.plan.perRound = 5;
    const first = CX.prompts.list(p)[0];
    let rep = CX.questions.addReply(p, CX.reader.readQuestions(S.CLEAN), first.rounds);
    eq(rep.added.map((r) => [r.round.id, r.n]), [['1950s-music', 3], ['1950s-movies', 2]]);
    rep = CX.questions.addReply(p, CX.reader.readQuestions(S.CLEAN), first.rounds);
    eq(rep.repeats, 5);
    rep = CX.questions.addReply(p, CX.reader.readQuestions(S.MESSY), first.rounds);
    eq(rep.added[0].round.id, '1950s-tv'); eq(rep.added[0].n, 3);
    p.plan.perRound = 4;
    rep = CX.questions.addReply(p, CX.reader.readQuestions(S.fakeReply('1950s – TV & Radio', 3, 2)), first.rounds);
    eq(rep.added[0].n, 1); eq(rep.extra, 2);
  });

  await test('questions: round headings in every shape find their round', () => {
    const p = CX.plan.newProject();
    const rs = CX.plan.rounds(p), m = (t, fb) => (CX.questions.matchRound(t, rs, fb) || {}).id;
    eq(m('1950s – Music & Dance'), '1950s-music');
    eq(m('ROUND 3: 1960s TELEVISION'), '1960s-tv');
    eq(m("The '70s: Food & Drink"), '1970s-food');
    eq(m('Eighties toys and games'), '1980s-toys');
    eq(m('At the Movies', '1990s'), '1990s-movies', 'no decade: the prompt’s decade');
    eq(m('Everyday Life in the 1990s'), '1990s-home');
    eq(m('1940s – Music & Dance'), undefined, 'a decade not in the book');
    eq(m('Something else entirely', '1950s'), undefined);
  });

  await test('questions: a reply without round names fills the prompt’s rounds', () => {
    const p = CX.plan.newProject();
    const pr = CX.prompts.list(p)[1];
    const text = S.fakeReply('x', 3, 1).replace(/^ROUND: x\n/, '');
    const rep = CX.questions.addReply(p, CX.reader.readQuestions(text), pr.rounds);
    eq(rep.added[0].round.id, pr.rounds[0].id);
  });

  await test('questions: right answers spread evenly over A to D, choices travel with them', () => {
    const qs = [];
    for (let i = 0; i < 40; i++) qs.push({ q: 'Q' + i, o: ['w1 ' + i, 'right ' + i, 'w2 ' + i, 'w3 ' + i], a: 1, f: '' });
    const out = CX.questions.balance([], qs, 'seed');
    const c = [0, 0, 0, 0];
    out.forEach((q, i) => { c[q.a]++; eq(q.o[q.a], 'right ' + i); eq(q.o.length, 4); });
    eq(c, [10, 10, 10, 10]);
  });

  await test('questions: true-or-false keeps True first; prices and years keep their order', () => {
    const qs = [{ q: 't1', o: ['False', 'True'], a: 0, f: '' }, { q: 't2', o: ['True', 'False'], a: 1, f: '' }];
    for (let i = 0; i < 8; i++) qs.push({ q: 'Q' + i, o: ['a', 'right', 'c', 'd'], a: 1, f: '' });
    const out = CX.questions.balance([], qs, 's');
    eq(out[0].o, ['True', 'False']); eq(out[0].a, 1, 'False stays the answer after the swap');
    const c = [0, 0, 0, 0];
    out.slice(2).forEach((q) => c[q.a]++);
    eq(c, [2, 2, 2, 2]);
    ok(CX.questions.keepOrder({ o: ['1955', '1957', '1959', '1961'] }));
    ok(CX.questions.keepOrder({ o: ['5 cents', '10 cents', '25 cents', '50 cents'] }));
    ok(CX.questions.keepOrder({ o: ['$0.25', '$0.50', '$1.00', '$2.00'] }));
    const p = fullProject(SMALL);
    ok(CX.questions.trueFalseCount(p) > 0);
    const sp = CX.questions.letterSpread(p);
    ok(Math.max.apply(null, sp) - Math.min.apply(null, sp) <= CX.plan.rounds(p).length, 'even spread ' + sp);
  });

  await test('questions: decade pages go to their decades; others are reported', () => {
    const p = CX.plan.newProject();
    const r = CX.questions.addEras(p, CX.reader.readEras(S.ERAS));
    eq(r.got, ['1950s', '1960s']); eq(r.other, ['2000s']);
    eq(r.short.length, 0);
    eq(CX.prompts.eraMissing(p, '1950s'), []); eq(CX.prompts.eraMissing(p, '1970s'), ['intro', 'timeline', 'facts', 'memories']);
    const r2 = CX.questions.addEras(p, CX.reader.readEras('DECADE: 1970s\nINTRO:\nDisco!\nAT A GLANCE:\n- 1971: one\n- 1972: two'));
    eq(r2.got, ['1970s']); ok(/1970s still needs: at a glance, fun facts, memory prompts/.test(r2.short[0]), r2.short[0]);
    const r3 = CX.questions.addExtras(p, CX.reader.readExtras('RANKS:\n- Rookie - a\n- Pro - b\n\nBACK COVER:\nText.'));
    eq(p.ai.ranks, []); eq(r3.got, ['back cover text']); ok(r3.short.length === 1);
  });

  // ---------- prompts ----------
  await test('prompts: one decade at a time, at most 40 questions, decade pages and extras last', () => {
    const p = CX.plan.newProject();
    let l = CX.prompts.list(p);
    eq(l.length, 12);
    eq(l.map((x) => x.kind === 'questions' ? x.decade.id + ':' + x.rounds.length : x.kind), ['1950s:3', '1950s:3', '1960s:3', '1960s:3', '1970s:3', '1970s:3', '1980s:3', '1980s:3', '1990s:3', '1990s:3', 'eras', 'extras']);
    let t = CX.prompts.text(p, l[0]);
    ok(t.indexOf('ROUND: 1950s – Music & Dance — exactly 10 questions') !== -1, t.slice(0, 600));
    ok(/between 1950 and 1959/.test(t) && /true-or-false/.test(t) && /United States/.test(t) && /no wars/.test(t), 'decade, true/false, country and tone in the prompt');
    CX.questions.addReply(p, CX.reader.readQuestions(S.CLEAN), l[0].rounds);
    t = CX.prompts.text(p, CX.prompts.list(p)[0]);
    ok(t.indexOf('exactly 7 questions') !== -1 && t.indexOf('Do not repeat') !== -1 && t.indexOf('King of Rock and Roll') !== -1);
    p.plan.tf = false;
    ok(!/true-or-false/.test(CX.prompts.text(p, CX.prompts.list(p)[0])));
    p.plan.perRound = 20;
    eq(CX.prompts.list(p)[0].rounds.length, 2);
    p.plan.perRound = 25;
    eq(CX.prompts.list(p)[0].rounds.length, 1);
    eq(CX.prompts.chunks([1, 2, 3, 4, 5, 6, 7], 10).map((c) => c.length), [4, 3]);
    const er = CX.prompts.text(p, { kind: 'eras' });
    ok(/DECADE: 1950s/.test(er) && /AT A GLANCE/.test(er) && /MEMORY PROMPTS/.test(er) && /Decades: 1950s, 1960s, 1970s, 1980s, 1990s\./.test(er), er);
    CX.questions.addEras(p, CX.reader.readEras(S.ERAS));
    ok(/Decades: 1970s, 1980s, 1990s\./.test(CX.prompts.text(p, { kind: 'eras' })), 'only the decades still missing');
    p.extras.eras = false;
    ok(!/AT A GLANCE/.test(CX.prompts.text(p, { kind: 'eras' })) && /MEMORY PROMPTS/.test(CX.prompts.text(p, { kind: 'eras' })));
    p.extras.memories = false;
    ok(!CX.prompts.list(p).some((x) => x.kind === 'eras'), 'no decade pages prompt when nothing needs it');
    const ex = CX.prompts.text(p, { kind: 'extras' });
    ok(/WELCOME/.test(ex) && /RANKS/.test(ex) && /BACK COVER/.test(ex));
    p.extras.ranks = false;
    ok(!/RANKS/.test(CX.prompts.text(p, { kind: 'extras' })));
    p.book.country = 'world';
    ok(/all over the world/.test(CX.prompts.text(p, CX.prompts.list(p)[0])));
  });

  await test('prompts: a full book has every prompt done and passes the checklist', () => {
    const p = fullProject();
    ok(CX.prompts.list(p).every((x) => x.done), JSON.stringify(CX.prompts.list(p).filter((x) => !x.done).map(CX.prompts.label)));
    const book = CX.layout.layoutBook(p, {});
    const items = CX.checklist.run(p, book);
    ok(CX.checklist.ready(items), JSON.stringify(items.filter((i) => !i.ok)));
    p.book.author = ' ';
    ok(!CX.checklist.ready(CX.checklist.run(p, book)), 'a pen name is needed');
    p.book.author = 'x'; p.plan.decades.push('2000s');
    const it = CX.checklist.run(p, CX.layout.layoutBook(p, {}));
    ok(!CX.checklist.ready(it) && it.some((i) => i.label === 'Decade pages' && /2000s/.test(i.detail)), 'a new decade needs its pages');
  });

  // ---------- layout ----------
  await test('layout: every trim x text size x answer placement inside the KDP margins', () => {
    const counts = [];
    CX.kdp.TRIMS.forEach((t) => Object.keys(CX.layout.PRINT).forEach((pr) => ['decade', 'back'].forEach((ans) => {
      const p = fullProject((p) => { SMALL(p); p.book.trim = t.id; p.book.print = pr; p.plan.answers = ans; });
      const book = CX.layout.layoutBook(p, {});
      book.pages.forEach(checkPage);
      book.pages.forEach((pg) => { const o = overlaps(pg); ok(!o.length, 'overlapping words on page ' + pg.num + ' (' + pg.label + '): ' + o.slice(0, 3).join(' | ')); });
      const m = CX.kdp.margins(book.pages.length);
      ok(book.m.inside >= m.minInside * 72, 'gutter too small for ' + book.pages.length + ' pages');
      ok(book.pages.length <= CX.kdp.maxPages(t.id, 'white'), 'too many pages');
      counts.push(t.id + '/' + pr + '/' + ans + ':' + book.pages.length);
    })));
    console.log('     pages: ' + counts.filter((c) => /decade/.test(c)).join(' '));
  });

  await test('layout: the default book (300 questions, 8.5 x 11, 16 pt) fits KDP and passes every check', () => {
    const p = fullProject();
    const book = CX.layout.layoutBook(p, {});
    book.pages.forEach(checkPage);
    book.pages.forEach((pg) => { const o = overlaps(pg); ok(!o.length, 'overlap on page ' + pg.num + ': ' + o.slice(0, 2).join(' | ')); });
    ok(book.pages.length >= 100 && book.pages.length <= CX.kdp.maxPages('8.5x11', 'white'), 'pages ' + book.pages.length);
    console.log('     default book: ' + book.pages.length + ' pages');
  });

  await test('layout: the draft shows placeholders, the print leaves empty parts out', () => {
    const p = CX.plan.newProject();
    SMALL(p);
    const draft = CX.layout.layoutBook(p, { draft: true });
    const ds = strings(draft.pages);
    ['questions go here', 'Your ranks', 'Memory prompts', 'Your welcome letter', 'At a glance', 'Your pen name'].forEach((w) => ok(ds.some((s) => s.indexOf(w) !== -1), 'placeholder: ' + w));
    draft.pages.forEach(checkPage);
    const print = CX.layout.layoutBook(p, {});
    ok(strings(print.pages).every((s) => !/go here|Your pen name|Your ranks|Memory prompts|At a glance|welcome letter/.test(s)), 'no placeholder in print');
    ok(!print.pages.some((pg) => pg.kind === 'round' || pg.kind === 'era'), 'empty decades left out of the print');
    print.pages.forEach(checkPage);
  });

  await test('layout: contents page numbers point at their parts, rounds listed under their decade', () => {
    const p = fullProject(SMALL);
    const book = CX.layout.layoutBook(p, {});
    book.sections.forEach((s) => {
      const pg = book.pages[s.page - 1], before = book.pages[s.page - 2];
      ok(pg.label === s.title && before.label !== s.title, 'page ' + s.page + ' should start "' + s.title + '", it is ' + pg.label);
    });
    eq(book.sections.slice(0, 8).map((s) => (s.sub ? '  ' : '') + s.title), ['Welcome', 'The 1950s', '  1950s · Music & Dance', '  1950s · At the Movies', '  1950s · TV & Radio', '  1950s · Toys, Games & Fads', '  Remember When? · 1950s', '  Answers · 1950s']);
    eq(book.sections.slice(-2).map((s) => s.title), ['Score Card', 'Certificate of Achievement']);
    const cpages = book.pages.filter((pg) => pg.kind === 'contents'), cs = strings(cpages);
    ok(cs.indexOf('Contents') !== -1 && cs.indexOf('The 1960s') !== -1 && cs.indexOf('Toys, Games & Fads') !== -1 && cs.indexOf('Remember When?') !== -1);
    eq(cs.filter((s) => s === 'Answers').length, 3);
    eq(book.pages[2].kind, 'belongs');
    ok(cpages.every((pg) => pg.items.some((it) => it.str === 'Contents' || /^\d+$/.test(it.str))), 'no empty contents page');
  });

  await test('layout: decade openers print the intro, the decade at a glance and fun facts', () => {
    const p = fullProject(SMALL);
    const book = CX.layout.layoutBook(p, {});
    const era = book.pages.filter((pg) => pg.label === 'The 1960s');
    const s = strings(era);
    ['PART TWO', 'The 1960s', 'Moonshots & Flower Power', '1960s at a Glance', 'Did You Know?', '1967'].forEach((w) => ok(s.indexOf(w) !== -1, 'opener has ' + w + ': ' + s.slice(0, 12).join(' | ')));
    p.extras.eras = false;
    const plain = CX.layout.layoutBook(p, {}).pages.filter((pg) => pg.label === 'The 1960s');
    eq(plain.length, 1); ok(!strings(plain).some((x) => /Glance/.test(x)), 'a plain part title without the decade pages');
  });

  await test('layout: questions never split, the answers match the questions, one score line per round', () => {
    const p = fullProject(SMALL);
    const r = CX.plan.rounds(p)[0], q = p.questions[r.id][0];
    const book = CX.layout.layoutBook(p, {});
    const qPage = book.pages.find((pg) => pg.kind === 'round' && pg.items.some((it) => it.str === '1.'));
    ok(qPage.items.some((it) => it.str === q.o[q.a]), 'the right choice is printed with the question');
    const ans = book.pages.filter((pg) => pg.label === 'Answers · 1950s');
    const s = strings(ans);
    ok(s.indexOf('ABCD'[q.a] + ')') !== -1, 'answer letter on the answer page');
    eq(s.filter((x) => x === 'Score:').length, 4);
    eq(s.filter((x) => x === 'out of 8').length, 4);
    ok(s.indexOf('Round 1 · Music & Dance') !== -1);
  });

  await test('layout: true or false prints A) True and B) False on one line', () => {
    const p = fullProject(SMALL);
    const book = CX.layout.layoutBook(p, {});
    let found = 0;
    book.pages.filter((pg) => pg.kind === 'round').forEach((pg) => {
      pg.items.forEach((it, i) => {
        if (it.str !== 'True') return;
        const f = pg.items.find((x, j) => j > i && x.str === 'False');
        ok(f && Math.abs(f.y - it.y) < 0.01 && f.x > it.x, 'False on the same line, page ' + pg.num);
        found++;
      });
    });
    ok(found >= 10, 'true/false questions printed: ' + found);
  });

  await test('layout: score card by decade, ranks cover every score, best first; certificate and gift page', () => {
    const p = fullProject(SMALL);
    const book = CX.layout.layoutBook(p, {});
    const s = strings(book.pages.filter((pg) => pg.kind === 'scores'));
    ok(s.indexOf('Total (out of 96)') !== -1, 'total: ' + s.filter((x) => /Total/.test(x)));
    ok(s.indexOf('The 1950s') !== -1 && s.indexOf('The 1970s') !== -1);
    eq(s.filter((x) => /^\d+–\d+$/.test(x)), ['77–96', '58–76', '39–57', '20–38', '0–19']);
    ok(s.indexOf('Living Legend') < s.indexOf('Young Whippersnapper'));
    const cert = book.pages.filter((pg) => pg.kind === 'certificate');
    eq(cert.length, 1);
    ok(cert[0].items.some((it) => it.str === 'CERTIFICATE') && cert[0].items.some((it) => it.str === 'NOSTALGIA'), 'certificate words and seal');
    eq(cert[0].folio, false);
    const gift = book.pages.find((pg) => pg.kind === 'belongs');
    ok(gift && strings([gift]).indexOf('Belongs To') !== -1 && !gift.folio);
    p.extras = { eras: false, memories: false, belongs: false, ranks: false, certificate: false };
    const bare = CX.layout.layoutBook(p, {});
    ok(!bare.pages.some((pg) => /scores|certificate|belongs|memories/.test(pg.kind)), 'extras off');
    ok(!strings(bare.pages).some((x) => x === 'Score:'), 'no score lines without the score card');
    bare.pages.forEach(checkPage);
  });

  await test('layout: odd sizes and long words stay inside the pages', () => {
    const cases = [
      (p) => { p.plan.decades = ['1940s']; p.plan.themes = ['prices']; p.plan.perRound = 25; p.book.trim = '5.5x8.5'; },
      (p) => { p.plan.decades = CX.plan.DECADES.map((d) => d.id); p.plan.themes = ['music', 'tv']; p.plan.perRound = 5; p.book.print = 'regular'; p.book.trim = '6x9'; },
      (p) => { p.book.title = 'Remember When? The Big Nostalgia Trivia Book of Music, Movies, Television, Toys and Everyday Life from the Good Old Days'; p.book.trim = '5.5x8.5'; SMALL(p); },
      (p) => { SMALL(p); p.book.hero = 'SUPERCALIFRAGILISTIC'; p.book.author = 'A Very Long Pen Name Indeed For Testing Purposes Press'; p.plan.answers = 'back'; }
    ];
    cases.forEach((mut) => {
      const p = fullProject(mut);
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
      ok(d.hint && d.label && !/\bjob\b|\bage\b|nurse/i.test(d.hint + d.label), d.id + ': label and hint');
    });
    eq(new Set(CX.cover.PALETTES.map((p) => p.id)).size, CX.cover.PALETTES.length, 'palette ids unique');
    eq(CX.cover.paletteId({ design: 'vinyl', palette: '' }), 'aqua');
    eq(CX.cover.paletteId({ design: 'badge', palette: 'sunny' }), 'sunny');
    eq(CX.cover.paletteId({ design: 'gone', palette: 'nope' }), 'mustard');
    eq(CX.plan.newProject().cover.design, D[0].id);
  });

  await test('cover: the title splits around the big word, decades stay readable', () => {
    const t = CX.cover.titleParts;
    eq(t('Nostalgia Trivia for Seniors', 'NOSTALGIA'), { pre: '', num: 'NOSTALGIA', suf: '', post: 'Trivia for Seniors' });
    eq(t('The Ultimate 1980s Trivia Book', '1980s'), { pre: 'The Ultimate', num: '1980s', suf: '', post: 'Trivia Book' });
    eq(t('Remember the 1980s?', '1980S'), { pre: 'Remember the', num: '1980s?', suf: '', post: '' });
    eq(t('Back in the Day', 'NOSTALGIA'), { pre: '', num: 'NOSTALGIA', suf: '', post: 'Back in the Day' });
    eq(t('Big Book', '80s'), { pre: '', num: '80s', suf: '', post: 'Big Book' });
  });

  await test('cover: every template x trim, sized by KDP and inside the safe areas', () => {
    CX.kdp.TRIMS.forEach((t) => {
      const p = fullProject((p) => { SMALL(p); p.book.trim = t.id; });
      const pages = CX.layout.layoutBook(p, {}).pages.length;
      const dims = CX.kdp.cover(t.id, pages, 'white');
      CX.cover.DESIGNS.forEach((d) => {
        p.cover.design = d.id; p.cover.palette = '';
        const cv = CX.cover.build(p, pages);
        ok(Math.abs(cv.W - dims.width * 72) < 0.01 && Math.abs(cv.H - dims.height * 72) < 0.01, 'cover size');
        checkCover(cv, d.id + '/' + t.id);
        ok(cv.items.some((it) => it.t === 'text' && it.x >= cv.guides.spineX1 && /NOSTALGIA/.test(it.str)), d.id + '/' + t.id + ': the big word is on the front');
      });
    });
  });

  await test('cover: the quiz card and the timeline show the book’s decades', () => {
    const p = fullProject(SMALL);
    const pages = CX.layout.layoutBook(p, {}).pages.length;
    p.cover.design = 'timeline';
    let s = CX.cover.build(p, pages).items.filter((it) => it.t === 'text').map((it) => it.str);
    ok(['1950s', '1960s', '1970s'].every((d) => s.indexOf(d) !== -1), 'timeline: ' + s.join('|'));
    p.cover.design = 'quizcard';
    s = CX.cover.build(p, pages).items.filter((it) => it.t === 'text').map((it) => it.str);
    ok(['1950s', '1960s', '1970s', '1980s'].every((d) => s.indexOf(d) !== -1), 'quiz card: ' + s.join('|'));
  });

  await test('cover: every palette on every template stays inside the safe areas', () => {
    const p = fullProject(SMALL);
    const pages = CX.layout.layoutBook(p, {}).pages.length;
    CX.cover.DESIGNS.forEach((d, i) => CX.cover.PALETTES.forEach((pl, j) => {
      if ((i + j) % 5) return;   // a fifth of the pairs: every template and every palette several times
      p.cover.design = d.id; p.cover.palette = pl.id;
      checkCover(CX.cover.build(p, pages), d.id + '/' + pl.id);
    }));
  });

  await test('cover: odd words: decades as the big word, long or plain titles, no pen name or subtitle', () => {
    const cases = [
      (p) => { p.plan.decades = ['1980s']; },
      (p) => { p.plan.decades = ['1960s']; p.book.title = 'Remember the 1960s? The Groovy Trivia Book'; },
      (p) => { p.book.hero = "'50s–'90s"; p.book.title = 'The Big Book of Nostalgia Trivia from the Fifties, Sixties, Seventies, Eighties and Nineties for Seniors'; p.book.subtitle = 'Five hundred fun large print questions about music, movies, television, toys, fashion, food and everyday life, with answers, fun facts and memory prompts'; },
      (p) => { p.book.title = 'Back in the Day'; p.book.author = ''; p.book.subtitle = ' '; },
      (p) => { p.book.trim = '5.5x8.5'; p.book.hero = 'REMEMBER WHEN'; },
      (p) => { p.book.trim = '8.5x11'; p.book.author = 'A Very Long Pen Name Indeed For Testing Purposes Press'; },
      (p) => { p.book.hero = 'SUPERCALIFRAGILISTIC'; p.book.trim = '5.5x8.5'; }
    ];
    cases.forEach((mut, ci) => {
      const p = fullProject((p) => { SMALL(p); mut(p); });
      const pages = CX.layout.layoutBook(p, {}).pages.length;
      CX.cover.DESIGNS.forEach((d) => { p.cover.design = d.id; p.cover.palette = ''; checkCover(CX.cover.build(p, pages), 'case ' + ci + '/' + d.id); });
    });
  });

  await test('cover: spine text only from 79 pages, inside the spine', () => {
    const p = fullProject();
    const pages = CX.layout.layoutBook(p, {}).pages.length;
    ok(pages >= 79, 'pages ' + pages);
    const cv = CX.cover.build(p, pages), g = cv.guides;
    const sp = cv.items.filter((it) => it.angle === -90);
    ok(sp.length === 2, 'title and pen name on the spine');
    sp.forEach((it) => ok(it.x - 0.5 >= g.spineX0 && it.x + it.size <= g.spineX1 + 0.5, 'spine text inside the spine'));
    const small = CX.cover.build(fullProject((p) => { p.plan.perRound = 5; p.plan.decades = ['1950s']; p.plan.themes = ['music', 'tv']; }), 40);
    ok(!small.items.some((it) => it.angle), 'no spine text under 79 pages');
  });

  await test('svg: the preview renders every page and the cover without bad numbers', () => {
    const p = fullProject(SMALL);
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
    const p = fullProject();
    const book = CX.layout.layoutBook(p, {});
    const bytes = await CX.pdf.build(book, { fileId: CX.util.hashHex('a') + CX.util.hashHex('b') });
    const cv = CX.cover.build(p, book.pages.length);
    const cbytes = await CX.pdf.buildCover(cv, { fileId: CX.util.hashHex('c') + CX.util.hashHex('d') });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntb-'));
    const fi = path.join(dir, 'interior.pdf'), fc = path.join(dir, 'cover.pdf');
    fs.writeFileSync(fi, bytes); fs.writeFileSync(fc, cbytes);
    if (process.env.KEEP_PDF) { fs.copyFileSync(fi, process.env.KEEP_PDF + '-interior.pdf'); fs.copyFileSync(fc, process.env.KEEP_PDF + '-cover.pdf'); }
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
