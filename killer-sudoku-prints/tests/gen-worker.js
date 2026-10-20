/*
 * gen-worker.js: a Node worker thread for the tests. It runs the app's own engine.js
 * (the same file the browser's Blob workers run) and returns puzzles plus a full check.
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
  const p = E.generate(job.seed, job.level, job.ordinal, job.salt || 0);
  const ms = Date.now() - t0;
  let problems = ['generation failed'], tier = 0, singles = 0;
  if (p) {
    problems = E.validate(p);
    tier = E.rate(E.fromWire(p)).tier;
    const sizes = {};
    p.cageOf.forEach(c => { sizes[c] = (sizes[c] || 0) + 1; });
    singles = Object.values(sizes).filter(n => n === 1).length;
  }
  parentPort.postMessage({ id: job.id, puzzle: p, problems, tier, singles, ms });
});
