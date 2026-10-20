/*
 * Acceptance tests for the engine (no browser needed).
 * Usage: node tests/run.js
 */
'use strict';
const path = require('path');
const load = require('./load');
const Cozy = load(['js/render/pdf.js']);
global.jspdf = require(path.join(load.ROOT, 'js/vendor/jspdf.umd.min.js'));
const buildBook = require('./build-book');
const sample = global.COZY_SAMPLE;

let failed = 0, passed = 0;
function check(name, ok, info) {
  if (ok) { passed++; console.log('  ok   ' + name + (info ? '  (' + info + ')' : '')); }
  else { failed++; console.log('  FAIL ' + name + (info ? '  (' + info + ')' : '')); }
}

(async function main() {
  console.log('Sample book');
  const r = buildBook(Cozy, sample);
  check('story plan imports', r.log[0].ok);
  check('all 5 chapter parts import', r.log.slice(1).every(l => l.ok));
  const pages = r.book.pages;
  check('120 pages', pages.length === 120, pages.length);
  check('chapter 1 on page 4 (left)', pages[3].meta.chapter === 1 && pages[3].side === 'left');
  check('puzzle 1 on page 5 (right)', pages[4].meta.puzzle === 1 && pages[4].side === 'right');
  check('notebook 104, final 105, epilogue 106, solutions 107-119, closing 120',
    pages[103].kind === 'notebook' && pages[104].kind === 'final' && pages[105].kind === 'epilogue' &&
    pages.slice(106, 119).every(p => p.kind === 'solutions') && pages[119].kind === 'closing');
  let allOnce = true, hiddenOk = 0;
  for (let n = 1; n <= 50; n++) {
    const pz = r.puzzles[n];
    const v = Cozy.puzzle.verifyStored(pz);
    if (!v.ok) allOnce = false;
    if (pz.hidden) hiddenOk++;
  }
  check('every placed word occurs exactly once in all 50 grids', allOnce);
  check('21 puzzles hide a clue that occurs 0 times', hiddenOk === 21, hiddenOk);
  const fv = Cozy.puzzle.verifyStored(r.final);
  check('final puzzle: leftover letters spell the message', fv.ok && /COLETTEMARSH$/.test(r.final.message), r.final.messageSpaced);
  check('every chapter fits on one page', Object.values(r.book.fit).every(f => f.fits));
  check('nothing outside the margins', r.book.outside.length === 0, r.book.outside.join(','));
  check('smallest text >= 7.5 pt', r.book.minFont >= 7.5, r.book.minFont);
  check('every line is at least 0.75 pt', pages.every(p => p.items.every(it => (it.t === 'line' ? it.w : it.lw == null ? 1 : it.lw) >= 0.75)));
  check('puzzles build in under 2 s', r.timing.tPuzzles < 2000, r.timing.tPuzzles + ' ms');
  check('final puzzle builds in under 3 s', r.timing.tFinal < 3000, r.timing.tFinal + ' ms');
  const cl = Cozy.checklist.run(r);
  check('pre-download checklist passes', cl.ok, cl.items.filter(i => !i.ok).map(i => i.label).join('; '));

  console.log('Stability');
  const r2 = buildBook(Cozy, sample);
  check('same seed and data give the same grids', [1, 7, 33, 50].every(n => r.puzzles[n].grid.join('') === r2.puzzles[n].grid.join('')) && r.final.grid.join('') === r2.final.grid.join(''));
  const shuffled = Cozy.util.clone(r.project); shuffled.reshuffle[7] = 1;
  const d = Cozy.book.derive(shuffled);
  const prep = Cozy.book.prepareAll(shuffled, d);
  const p7 = Cozy.book.puzzleFor(shuffled, d, 7, prep[7]);
  check('reshuffle changes that puzzle only', p7.grid.join('') !== r.puzzles[7].grid.join('') && Cozy.puzzle.verifyStored(p7).ok);

  console.log('Pasted answers');
  const plan = JSON.parse(sample.planText);
  const messy = 'Sure! Here is the plan you asked for:\n```json\n' +
    JSON.stringify(plan, null, 2).replace('"setting"', '“setting”').replace(/\]\n\}$/, '],\n}') + '\n```\nHope this helps!';
  let p = Cozy.book.newProject('t1'); p.setup.penName = 'T';
  let res = Cozy.book.importPlan(p, messy);
  check('code fence, chatter, curly quotes and trailing commas still import', res.ok, res.issues.filter(i => i.level === 'error').map(i => i.text).join(' '));
  const quotes = '{"chapters":[{"n":1,"title":"Tea","text":"She said "hello" to the cat.\nThen she left.","words":["kettle","teapot"],}]}';
  const qr = Cozy.validate.readObjects(quotes)[0];
  check('unescaped quotes and raw line breaks inside text are read', qr && qr.chapters[0].text.indexOf('"hello"') > 0, qr && qr.chapters[0].text.slice(0, 30));
  res = Cozy.book.importPlan(p, 'Sorry, I cannot do that.');
  check('no answer found: plain error', !res.ok && /could not find/.test(res.issues[0].text));
  const bad = Cozy.util.clone(plan); bad.killer = 'Nobody Known'; bad.clues = bad.clues.slice(0, 19); bad.clues[3].word = 'GLOVE';
  bad.clues[4].word = 'FOXGLOVES';
  res = Cozy.book.importPlan(p, JSON.stringify(bad));
  const msgs = res.issues.filter(i => i.level === 'error').map(i => i.text);
  check('bad plan: killer, clue count and clue inside clue reported', !res.ok && msgs.some(m => /not one of the suspects/.test(m)) && msgs.some(m => /19 hidden clues/.test(m)) && msgs.some(m => /hidden inside/.test(m)), msgs.length + ' errors');
  const fix = Cozy.prompts.planFixPrompt(p, Cozy.book.derive(p), res.issues, res.plan);
  check('fix prompt names the problem and asks only for the broken part', /not one of the suspects/.test(fix) && /Return only the corrected parts/.test(fix) && !/"outline"/.test(fix.split('Return only')[1]));
  const merged = Cozy.book.importPlan(p, JSON.stringify({ killer: plan.killer, clues: plan.clues }), res.plan);
  check('a partial fix merges onto the earlier answer', merged.ok, merged.issues.filter(i => i.level === 'error').map(i => i.text).join(' '));
  const shortName = Cozy.util.clone(plan); shortName.suspects[2].name = 'Ann Li'; shortName.killer = 'Ann Li';
  res = Cozy.book.importPlan(p, JSON.stringify(shortName));
  check('killer name under 6 letters is an error', !res.ok && res.issues.some(i => /6 to 16/.test(i.text)));

  console.log('Word lists');
  const wl = Cozy.validate.prepareWords({ n: 3, paragraphs: ['The teapot and the tea cup sat by the kettle while Biscuit slept near the LEVEL window. Hattie found the ledger.'], words: ['tea', 'Teapot', 'teapot', 'Biscuit', 'level', 'ab', 'extraordinarily', 'Mrs. O’Hara', 'ledger', 'kettle'] },
    { wordsPerPuzzle: 6, maxLen: 10, clue: { word: 'LEDGER', display: 'LEDGER' } });
  const norms = wl.list.map(x => x.norm);
  check('duplicates, palindromes, short, long and contained words are dropped', !norms.includes('TEA') && !norms.includes('LEVEL') && norms.filter(x => x === 'TEAPOT').length === 1 && !norms.includes('EXTRAORDINARILY'), norms.join(' '));
  check('printed list keeps the original form', wl.list.some(x => x.display === 'MRS. O’HARA'));
  check('clue word stays in the list', wl.list.some(x => x.isClue && x.norm === 'LEDGER'));
  check('short lists are topped up from the chapter text', wl.list.length === 6, wl.notes.map(n => n.text).join(' | '));

  console.log('Chapter counts');
  for (const N of [30, 45, 51, 60]) {
    const q = Cozy.book.newProject('n' + N); q.setup.chapters = N;
    const dq = Cozy.book.derive(q);
    const lay = Cozy.layout.layoutBook({ project: q, d: dq, prepared: {}, puzzles: {}, final: null });
    const expected = 3 + 2 * N + 3 + Math.ceil((N + 1) / 4) + 1;
    check('N=' + N + ': ' + dq.C + ' clues, ' + expected + ' pages', lay.pages.length === expected && dq.pages.total === expected && dq.C === Math.round(0.42 * N), lay.pages.length + ' laid out');
  }

  console.log('Difficulty mix');
  const mixCase = Cozy.util.clone(sample);
  mixCase.setup = Object.assign({}, sample.setup, { difficulty: 'mix', mix: { easy: 30, medium: 40, hard: 30 } });
  const rm = buildBook(Cozy, mixCase);
  const allowed = Cozy.puzzle.DIFFICULTY_DIRS;
  const want = n => n <= 15 ? 'easy' : n <= 35 ? 'medium' : 'hard';
  let mixOk = true;
  for (let n = 1; n <= 50; n++) {
    const pz = rm.puzzles[n];
    if (rm.d.levels[n] !== want(n) || !Cozy.puzzle.verifyStored(pz).ok || !pz.placements.every(pl => allowed[want(n)].includes(pl.d))) mixOk = false;
  }
  check('30/40/30: chapters 1-15 Easy, 16-35 Medium, 36-50 Hard', mixOk, JSON.stringify(rm.d.mixCounts));
  check('final puzzle uses the hardest level', rm.d.finalLevel === 'hard' && Cozy.puzzle.verifyStored(rm.final).ok);
  check('mix book still passes the checklist', Cozy.checklist.run(rm).ok, Cozy.checklist.run(rm).items.filter(i => !i.ok).map(i => i.label).join('; '));
  const mc = Cozy.book.mixCounts({ easy: 35, medium: 35, hard: 30 }, 37);
  check('largest-remainder counts add up to N', mc.easy + mc.medium + mc.hard === 37, JSON.stringify(mc));
  const em = Cozy.book.derive(Cozy.book.newProject('m'));
  check('easy + hard only: final is Hard', Cozy.book.derive(Cozy.book.upgrade({ seed: 'm', setup: { difficulty: 'mix', mix: { easy: 50, medium: 0, hard: 50 } } })).finalLevel === 'hard' && em.finalLevel === 'medium');

  console.log('PDF');
  const meta = { title: 'A Crumb of Suspicion', author: 'Sample Author', createdAt: '2026-10-04T12:00:00.000Z', fileId: '00112233445566778899AABBCCDDEEFF' };
  const t0 = Date.now();
  const a = Buffer.from(await Cozy.pdf.build(pages, meta));
  const ms = Date.now() - t0;
  const b = Buffer.from(await Cozy.pdf.build(pages, meta));
  const s = a.toString('latin1');
  check('builds in under 10 s', ms < 10000, ms + ' ms');
  check('120 pages of 432 x 648 pt', (s.match(/\/Type \/Page\b/g) || []).length === 120 && new Set(s.match(/\/MediaBox \[[^\]]+\]/g)).size === 1 && /\/MediaBox \[0 0 432\.? 648\.?\]/.test(s));
  const baseFonts = [...new Set(s.match(/\/BaseFont \/[^\s/]+/g))];
  check('only the 5 bundled fonts, each embedded', baseFonts.length === 5 && (s.match(/\/FontFile2/g) || []).length === 5 && !/Helvetica|Times-Roman|Courier/.test(s), baseFonts.join(' '));
  check('no links, forms, encryption or transparency', !/\/Annots|\/AcroForm|\/Encrypt|\/SMask|\/CA /.test(s));
  check('same project gives an identical file', a.equals(b));
  check('title and author properties set', /\/Title \(A Crumb of Suspicion\)/.test(s) && /\/Author \(Sample Author\)/.test(s));

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
