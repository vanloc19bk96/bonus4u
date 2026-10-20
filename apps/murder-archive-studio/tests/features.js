/* Checks the book features end to end in Node: node tests/features.js */
'use strict';
const assert = require('assert');
const load = require('./load.js');
const LK = load(['js/data/sample.js', 'js/data/sample-manifest.js', 'js/core/cover.js']);

function build(p) {
  const cs = LK.book.getCase(p);
  return { cs, book: LK.layout.layoutBook(p, cs) };
}
const clean = { outside: [], tiny: 0, thin: 0, pale: 0 };

LK.book.sampleIds().forEach(function (id) {
  // the sample book, with every feature on
  const p = LK.book.sampleProject(id);
  const { cs, book } = build(p);
  console.log('\n== sample', id, book.pageCount, 'pages');
  console.log(book.sections.map(s => (s.sub ? '  ' : '') + s.title + ' p' + s.page).join('\n'));
  assert.deepStrictEqual(LK.layout.audit(book), clean, 'print audit');
  assert(!book.problems.some(x => x.level === 'error'), 'layout errors');
  const issues = LK.story.check(p.story, cs, p);
  assert(!issues.some(i => i.level === 'error'), id + ' story errors: ' + JSON.stringify(issues));
  issues.forEach(i => console.log('  note:', i.text));

  // every record lands on exactly one archive page
  assert.strictEqual(book.recPos.filter(Boolean).length, cs.records.length);

  // chapters cover all records once
  const ch = LK.extras.chapters(cs);
  if (ch) assert.strictEqual(ch.reduce((a, c) => a + c.idx.length, 0), cs.records.length, 'chapters hold every record');

  // hints never show the answer, and near the end never show a record still in play
  const label = cs.type.recordLabel(cs.killer, cs);
  const hints = LK.extras.hints(cs, () => 1, true, p.seed);
  assert.strictEqual(hints.length, cs.clues.length);
  hints.forEach(h => assert(h.second.indexOf(label) === -1, 'hint ' + h.n + ' reveals the answer'));
  hints.forEach((h, k) => { if (cs.check.checkpoints[k] < 40) assert(h.second.indexOf('stays in play') === -1, 'hint ' + h.n + ' shows a late survivor'); });

  // the verdict cipher opens only with the answer's key
  const v = book.verdict;
  assert.strictEqual(LK.extras.unlock(v, v.key), v.message);
  assert(v.named, 'the verdict locks a name');
  v.cipher.forEach(x => { if (x.pos) assert.notStrictEqual(x.c, x.plain, 'a letter printed as itself'); });
  if (cs.type.keyDigits(cs.killer, cs)) {
    let wrong = 0;
    cs.records.forEach((r, i) => { if (i !== cs.killerIndex && LK.extras.unlock(v, cs.type.keyDigits(r, cs)) === v.message) wrong++; });
    assert.strictEqual(wrong, 0, 'another record opens the verdict');
  }
  console.log('verdict:', v.message, '->', v.cipher.map(x => x.c).join(''));

  // the practice case leaves exactly one record
  const pr = LK.extras.practice(cs, p.seed);
  assert(pr && pr.clues.length === 4);
  assert.strictEqual(pr.cs.records.filter(r => pr.clues.every(c => c.test(r))).length, 1);

  // list mode and every optional page off still lays out
  const q = LK.book.sampleProject(id);
  q.setup.registerMode = 'list';
  LK.book.OPTIONAL_PAGES.forEach(k => { q.setup.pages[k] = false; });
  const b2 = build(q).book;
  assert.deepStrictEqual(LK.layout.audit(b2), clean);
  console.log('minimal pages', b2.pageCount);

  // every trim and print size passes the audit
  LK.kdp.TRIMS.forEach(t => ['regular', 'large'].forEach(pr2 => {
    const r = LK.book.sampleProject(id);
    r.setup.trim = t.id; r.setup.print = pr2;
    const bk = build(r).book;
    const a = LK.layout.audit(bk);
    assert.deepStrictEqual(a, clean, t.id + ' ' + pr2 + ' ' + JSON.stringify(a));
    // clue cards start on a right-hand page, with a blank back
    bk.pages.filter(pg => pg.label === 'Clue Cards').forEach(pg => assert.strictEqual(pg.num % 2, 1, 'clue card page ' + pg.num + ' is a left page'));
    console.log(t.id, pr2, bk.pageCount, 'pages');
  }));

  // covers: every style, inside the bleed, barcode area clear
  LK.book.COVER_STYLES.forEach(style => {
    const r = LK.book.sampleProject(id);
    r.setup.cover.style = style;
    const { cs: c2, book: bk } = build(r);
    const cv = LK.cover.layout(r, c2, bk);
    const issues2 = LK.cover.audit(cv);
    assert.deepStrictEqual(issues2, [], style + ': ' + issues2.join('; '));
  });
});

// an old Lottery Murder Book Maker project opens as a lottery book with the same case
const old = { v: 1, seed: 'sample-gala', createdAt: '2026-10-01T09:00:00.000Z', setup: { venue: 'gala', count: 3000, difficulty: 'medium', clues: 16, trim: '6x9' }, story: null };
const up = LK.book.upgrade(JSON.parse(JSON.stringify(old)));
assert.strictEqual(up.setup.type, 'lottery');
assert.strictEqual(LK.book.caseKey(up), 'sample-gala|3000|gala|medium|16');
assert.strictEqual(LK.book.getCase(up).killer.t, 11380, 'old project rebuilds the same killer ticket');
console.log('\nall feature checks passed');
