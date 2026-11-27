/*
 * bench.js: times puzzle generation and prints clue density and tiers per size and level.
 *   node tools/bench.js [count] [sizes] [levels]     e.g. node tools/bench.js 6 10,15 easy,hard
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.self = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'engine', 'engine.js'), 'utf8'));
const E = global.KS.engine;

const count = +(process.argv[2] || 4);
const sizes = (process.argv[3] || '5,7,10,15').split(',').map(Number);
const levels = (process.argv[4] || 'easy,medium,hard,expert').split(',');

for (const n of sizes) {
  for (const level of levels) {
    if (!E.levelRules(n, level)) continue;
    let ms = 0, ok = 0, dens = 0, att = 0, tiers = {}, worst = 0, problems = 0;
    for (let i = 0; i < count; i++) {
      const t0 = Date.now();
      const p = E.generate('bench', n, level, i, 0);
      const dt = Date.now() - t0;
      ms += dt; worst = Math.max(worst, dt);
      if (!p) continue;
      ok++;
      dens += p.clueCount / (n * n);
      att += p.attempt;
      tiers[p.tier] = (tiers[p.tier] || 0) + 1;
      if (E.validate(p).length) problems++;
    }
    console.log(`${n}x${n} ${level.padEnd(6)} ok ${ok}/${count}  avg ${(ms / count / 1000).toFixed(2)} s  worst ${(worst / 1000).toFixed(2)} s  clues ${(dens / Math.max(1, ok) * 100).toFixed(0)}%  attempts ${(att / Math.max(1, ok)).toFixed(1)}  tiers ${JSON.stringify(tiers)}  invalid ${problems}`);
  }
}
