/* Shared by tests: builds a whole project from pasted answers, the same steps the app runs. */
'use strict';
module.exports = function buildBook(Cozy, sample, opts) {
  opts = opts || {};
  const B = Cozy.book;
  const project = B.newProject(sample.seed);
  Object.assign(project.setup, sample.setup);
  const log = [];
  const pr = B.importPlan(project, sample.planText);
  log.push({ step: 'plan', ok: pr.ok, issues: pr.issues });
  if (!pr.ok) return { project, log };
  B.applyPlan(project, pr.plan);
  let d = B.derive(project);
  sample.batchText.forEach((txt, bi) => {
    const r = B.importBatch(project, bi, txt);
    log.push({ step: 'batch' + (bi + 1), ok: r.ok, issues: r.issues });
    B.applyBatch(project, r);
  });
  d = B.derive(project);
  const t0 = Date.now();
  const prepared = B.prepareAll(project, d);
  const puzzles = {};
  for (let n = 1; n <= d.N; n++) puzzles[n] = B.puzzleFor(project, d, n, prepared[n]);
  const tPuzzles = Date.now() - t0;
  const t1 = Date.now();
  const final = B.finalFor(project, d);
  const tFinal = Date.now() - t1;
  const t2 = Date.now();
  const book = Cozy.layout.layoutBook({ project, d, prepared, puzzles, final });
  const tLayout = Date.now() - t2;
  const batches = d.batches.map((b, bi) => B.batchStatus(project, d, bi, prepared, book.fit));
  return { project, d, prepared, puzzles, final, book, batches, log, timing: { tPuzzles, tFinal, tLayout } };
};
