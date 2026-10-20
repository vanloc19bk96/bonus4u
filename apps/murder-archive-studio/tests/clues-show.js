/* Prints the clues of one case per type for reading: node tests/clues-show.js [medium|hard] [type] */
'use strict';
const LK = require('./load.js')();
const diff = process.argv[2] || 'medium', only = process.argv[3];
LK.types.all().forEach(function (t) {
  if (only && t.id !== only) return;
  const s = t.settings[1];
  const cs = LK.clues.buildCase({ type: t.id, seed: 'show-' + diff, count: t.defaultCount, venue: s.id, difficulty: diff, clues: LK.clues.difficulty(t.id, diff).clues });
  console.log('\n== ' + t.label + ' / ' + s.label + ' (' + diff + ') answer: ' + t.recordLabel(cs.killer, cs));
  cs.clues.forEach(function (c) { console.log('  ' + c.n + '. [' + c.tier + '] ' + c.text); });
});
