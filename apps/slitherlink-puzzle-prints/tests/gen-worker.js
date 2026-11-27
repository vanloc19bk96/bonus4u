/*
 * gen-worker.js: a Node worker thread for the tests. It runs the app's own engine.js
 * (the same file the browser's Blob workers run) and returns puzzles plus a full check:
 * the logic proof, and for grids up to 10 x 10 the brute-force solution count.
 */
'use strict';
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.self = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'engine', 'engine.js'), 'utf8'));
const E = global.KS.engine;

parentPort.on('message', job => {
  const t0 = Date.now();
  const p = E.generate(job.seed, job.size, job.level, job.ordinal, job.salt || 0);
  const ms = Date.now() - t0;
  let problems = ['generation failed'], tier = 0, lower = false;
  if (p) {
    problems = E.validate(p, { count: p.size <= 10, budget: 3000000 });
    const pz = E.fromWire(p);
    tier = E.rate(pz.geo, pz.clues).tier;
    // Solvable with only the techniques of the level below?
    const min = E.levelRules(p.size, p.level).minTier;
    lower = min > 1 && E.rate(pz.geo, pz.clues, min - 1).solved;
  }
  parentPort.postMessage({ id: job.id, puzzle: p, problems, tier, lower, ms });
});
