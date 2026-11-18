/*
 * One board per puzzle: checks the four groups, lays out the 16 tiles and says why a puzzle cannot
 * print yet. Boards are cached by everything they depend on, so the preview can lay the book out
 * again on every keystroke.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan, E = CX.engine;

  var cache = {}, cacheSize = 0;

  function complete(d) {
    return !!d && d.groups.length === 4 && d.groups.every(function (g) { return g.words.length === 4 && String(g.link || '').trim(); });
  }

  /*
   * { cells (4 x 4 of { w, g }) or null, level, problems (keep it out of the PDF), warnings (worth a
   * look), ok } or null when the puzzle has nothing yet.
   */
  function get(project, pz) {
    var d = project.puzzles[pz.id];
    if (!d || !d.groups.length) return null;
    var b = project.book, k = [project.seed, pz.id, d.v || 0, b.trim, b.print, project.plan.perPage, project.plan.audience, P.levelOf(project, pz), JSON.stringify(d.groups)].join('~');
    if (cache[k] !== undefined) return cache[k];
    var problems = E.problems(d, P.audience(project.plan.audience).maxLetters + 2);
    if (!problems.length && CX.layout) {
      d.groups.forEach(function (g) { g.words.forEach(function (w) { if (!CX.layout.fitsTile(project, w)) problems.push(w + ' is too wide for a tile at this page size'); }); });
    }
    var res = { cells: null, level: P.levelOf(project, pz), problems: problems, warnings: E.warnings(d), ok: !problems.length };
    if (res.ok) res.cells = E.arrange(d, project.seed + '|' + pz.id + '|' + (d.v || 0));
    if (cacheSize > 3000) { cache = {}; cacheSize = 0; }
    cache[k] = res; cacheSize++;
    return res;
  }

  /*
   * The puzzles the PDF prints: only complete, sound ones, numbered without a gap, so a puzzle that
   * is not ready can never leave a blank page. The index stays the puzzle's own: it sets the level.
   */
  function printed(project) {
    var out = [];
    P.puzzles(project).forEach(function (x) {
      var res = get(project, x);
      if (res && res.ok) out.push({ id: x.id, no: out.length + 1, index: x.index });
    });
    return out;
  }

  // 'empty', 'part' (some groups, not all), 'ok', or 'weak' (all four groups, but a problem).
  function status(project, pz) {
    var d = project.puzzles[pz.id];
    if (!d || !d.groups.length) return { state: 'empty', groups: 0 };
    var res = get(project, pz);
    if (res.ok) return { state: 'ok', groups: 4, pz: res };
    return { state: complete(d) ? 'weak' : 'part', groups: d.groups.length, pz: res };
  }

  function clearCache() { cache = {}; cacheSize = 0; }

  CX.puzzles = { get: get, printed: printed, status: status, complete: complete, clearCache: clearCache };
})(typeof window !== 'undefined' ? window : globalThis);
