/* Builds a case for every archive type and setting and checks it is fair: node tests/types.js [quick] */
'use strict';
const assert = require('assert');
const load = require('./load.js');
const LK = load();
const quick = process.argv[2] === 'quick';

const diffs = ['easy', 'medium', 'hard'];
let total = 0, slow = [];
LK.types.all().forEach(function (t) {
  t.settings.forEach(function (s, si) {
    const difficulty = diffs[si % 3];
    const counts = quick ? [t.counts[0]] : [t.counts[0], t.defaultCount];
    counts.forEach(function (count) {
      const t0 = Date.now();
      const cs = LK.clues.buildCase({ type: t.id, seed: 'types-' + s.id, count, venue: s.id, difficulty, clues: LK.clues.difficulty(t.id, difficulty).clues });
      const ms = Date.now() - t0;
      assert(cs.ok, t.id + '/' + s.id + ' ' + count + ': ' + (cs.error || '') + ' ' + JSON.stringify(cs.stats));
      // re-check fairness independently of the builder
      const v = LK.clues.verify(cs.records, cs.clues, cs.killerIndex);
      assert(v.ok, t.id + '/' + s.id + ' verify');
      assert.strictEqual(cs.records.length, count, t.id + ' record count');
      // every record unique by its keys
      const seen = new Set();
      cs.records.forEach(function (r) {
        const k = JSON.stringify(t.keys(r, { fs: t.fieldsFor ? t.fieldsFor(s) : null }));
        assert(!seen.has(k), t.id + ' duplicate record ' + k);
        seen.add(k);
      });
      // the same settings give the same case
      const again = LK.clues.buildCase({ type: t.id, seed: 'types-' + s.id, count, venue: s.id, difficulty, clues: LK.clues.difficulty(t.id, difficulty).clues });
      assert.strictEqual(again.killerIndex, cs.killerIndex, t.id + ' deterministic');
      total++;
      if (ms > 4000) slow.push(t.id + '/' + s.id + ' ' + count + ' ' + ms + 'ms');
      console.log(t.id.padEnd(9), s.id.padEnd(11), String(count).padStart(6), difficulty.padEnd(6), cs.clues.length + ' clues', 'attempts ' + cs.attempts, ms + 'ms',
        '| answer:', t.recordLabel(cs.killer, cs));
      if (!quick && si === 0 && count === t.defaultCount) cs.clues.forEach(function (c) { console.log('    ' + c.n + '. [' + c.tier + '] ' + c.text + (c.how ? '  — ' + c.how : '')); });
    });
  });
});
if (slow.length) console.log('SLOW:', slow.join('; '));
console.log(total + ' cases built and verified');
