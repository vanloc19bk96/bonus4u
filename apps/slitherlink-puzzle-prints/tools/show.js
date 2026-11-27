'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
global.self = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'engine', 'engine.js'), 'utf8'));
const E = global.KS.engine;
const n = +(process.argv[2] || 10), level = process.argv[3] || 'medium';
const p = E.generate(process.argv[4] || 'show', n, level, 0, 0);
const pz = E.fromWire(p), g = pz.geo;
let out = '';
for (let r = 0; r <= n; r++) {
  let line = '';
  for (let c = 0; c <= n; c++) { line += '+'; if (c < n) line += pz.on[g.h(r, c)] ? '---' : '   '; }
  out += line + '\n';
  if (r === n) break;
  line = '';
  for (let c = 0; c <= n; c++) {
    line += pz.on[g.v(r, c)] ? '|' : ' ';
    if (c < n) { const k = pz.clues[r * n + c]; line += ' ' + (k >= 0 ? k : ' ') + ' '; }
  }
  out += line + '\n';
}
console.log(out, p.clueCount, 'clues, tier', p.tier);
