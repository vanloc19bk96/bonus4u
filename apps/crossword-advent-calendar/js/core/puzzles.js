/*
 * One puzzle per day: the grid built from the day's words, the answers printed as a head start,
 * and the thick square that holds the day's letter of the hidden sentence. Grids are cached by
 * everything they depend on, so the preview can lay the book out again on every keystroke.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan, U = CX.util;

  var cache = {};
  var cacheSize = 0;

  function keyOf(project, day, d) {
    var g = P.grid(project.plan.size);
    return [project.seed, day.id, d.v || 0, g.n, g.target, P.letterOf(project, day), P.givens(project, day),
      U.hashHex(d.words.map(function (x) { return x.w + '=' + x.c; }).join('|'))].join('~');
  }

  // Picks the head-start answers (short ones first, apart from each other) and the thick square.
  function decorate(g, project, day) {
    var rng = U.makeRng(project.seed + '|mark|' + day.id + '|' + ((project.days[day.id] || {}).v || 0));
    var letter = P.letterOf(project, day), want = P.givens(project, day);
    function cellsOf(e) {
      var out = [];
      for (var i = 0; i < e.w.length; i++) out.push(e.dir === 'A' ? e.r + ',' + (e.col + i) : (e.r + i) + ',' + e.col);
      return out;
    }
    var marks = [];
    if (letter) {
      // the letter squares, crossing squares first: both answers lead to the letter
      g.entries.forEach(function (e) { cellsOf(e).forEach(function (k, i) { if (e.w[i] === letter && marks.indexOf(k) === -1) marks.push(k); }); });
      var crossing = marks.filter(function (k) {
        var n = 0;
        g.entries.forEach(function (e) { if (cellsOf(e).indexOf(k) !== -1) n++; });
        return n > 1;
      });
      if (crossing.length) marks = crossing;
    }
    // givens: never the answers through the letter square candidates if it can be helped
    var given = [], taken = {};
    var order = g.entries.slice().sort(function (a, b) { return a.w.length - b.w.length || a.num - b.num; });
    function free(e) { return cellsOf(e).every(function (k) { return !taken[k]; }); }
    function clearOf(e, ks) { return cellsOf(e).every(function (k) { return ks.indexOf(k) === -1; }); }
    [true, false].forEach(function (strict) {
      order.forEach(function (e) {
        if (given.length >= want || given.indexOf(e) !== -1 || e.w.length > 6) return;
        if (strict && (!free(e) || !clearOf(e, marks))) return;
        if (!strict && !clearOf(e, marks.slice(0, 1))) return;
        given.push(e);
        cellsOf(e).forEach(function (k) { taken[k] = 1; });
      });
    });
    var markable = marks.filter(function (k) { return !taken[k]; });
    var mark = markable.length ? markable[rng.int(markable.length)] : null;
    g.mark = mark ? { r: +mark.split(',')[0], c: +mark.split(',')[1] } : null;
    g.letter = letter;
    g.given = given.map(function (e) { return e.dir + e.num; });
    g.givenCells = {};
    given.forEach(function (e) { cellsOf(e).forEach(function (k) { g.givenCells[k] = 1; }); });
    return g;
  }

  /*
   * The puzzle of a day: { grid (from CX.engine.build, plus mark, given, givenCells), ok, problems }
   * or null when the day has too few words to build anything.
   */
  function get(project, day) {
    var d = project.days[day.id];
    if (!d || d.words.length < 2) return null;
    var k = keyOf(project, day, d);
    if (cache[k]) return cache[k];
    var g = P.grid(project.plan.size);
    var grid = CX.engine.build(d.words, { size: g.n, target: g.target, letter: P.letterOf(project, day), seed: project.seed + '|' + day.id + '|' + (d.v || 0) });
    var res = null;
    if (grid) {
      decorate(grid, project, day);
      res = { grid: grid, problems: problems(project, day, grid) };
      res.ok = !res.problems.length;
    }
    if (cacheSize > 400) { cache = {}; cacheSize = 0; }
    cache[k] = res; cacheSize++;
    return res;
  }

  function problems(project, day, grid) {
    var out = [], g = P.grid(project.plan.size), letter = P.letterOf(project, day);
    if (grid.entries.length < g.min) out.push('only ' + grid.entries.length + ' answers fit (at least ' + g.min + ' make a full grid)');
    if (letter && !grid.mark) out.push('no square for the letter ' + letter);
    return out;
  }

  // How the day stands: 'empty', 'words' (some words, not enough), 'ok' (a good grid), 'weak' (all the words, but the grid is too small or misses the letter).
  function status(project, day) {
    var d = project.days[day.id], ask = P.grid(project.plan.size).ask;
    if (!d || !d.words.length) return { state: 'empty', words: 0, ask: ask };
    var pz = get(project, day);
    // a good grid is enough, however many words it was built from
    if (pz && pz.ok) return { state: 'ok', words: d.words.length, ask: ask, pz: pz };
    if (d.words.length < ask) return { state: 'words', words: d.words.length, ask: ask, pz: pz };
    return { state: 'weak', words: d.words.length, ask: ask, pz: pz };
  }

  function clearCache() { cache = {}; cacheSize = 0; }

  CX.puzzles = { get: get, status: status, clearCache: clearCache };
})(typeof window !== 'undefined' ? window : globalThis);
