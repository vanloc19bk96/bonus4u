/*
 * One grid per puzzle: picks a set of the AI's words whose letters fill the grid exactly, builds the
 * trails and keeps the first grid with one way out. Grids are cached by everything they depend on,
 * so the preview can lay the book out again on every keystroke.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan, U = CX.util, E = CX.engine;

  var cache = {};
  var cacheSize = 0;
  var SETS = 8;        // how many word sets are tried before a puzzle counts as stuck

  // The words of a title, for leaving out a word the title would give away.
  function titleWords(d) {
    return String(d.title || '').toUpperCase().replace(/[^A-Z]+/g, ' ').split(' ').filter(Boolean);
  }

  // The words a puzzle can use: right length, no repeats, not part of the span word, not in the title.
  function usable(project, d) {
    var lim = P.limits(project), span = P.letters(d.span), seen = {}, inTitle = titleWords(d);
    return d.words.map(P.letters).filter(function (w) {
      if (!w || seen[w] || w.length < lim.minLen || w.length > lim.maxLen || (span && E.related(w, span))) return false;
      if (inTitle.some(function (t) { return E.sameWord(w, t); })) return false;
      seen[w] = 1;
      return true;
    });
  }

  function keyOf(project, pz, d) {
    return [project.seed, pz.id, d.v || 0, project.plan.size, P.levelOf(project, pz),
      U.hashHex(P.letters(d.span) + '=' + usable(project, d).join('|'))].join('~');
  }

  function spanProblem(project, d) {
    var lim = P.limits(project), n = P.letters(d.span).length;
    if (!n) return 'no span word yet';
    if (n < lim.spanMin) return 'the span word has ' + n + ' letters; it needs at least ' + lim.spanMin + ' to reach from edge to edge';
    if (n > lim.spanMax) return 'the span word has ' + n + ' letters; ' + lim.spanMax + ' is the most for this grid and reader';
    return '';
  }

  /*
   * The puzzle: { grid (from CX.engine.build), level, unused (words left out), problems, ok } or
   * null when there is nothing to build yet.
   */
  function get(project, pz) {
    var d = project.puzzles[pz.id];
    if (!d || !P.letters(d.span) || !d.words.length) return null;
    var k = keyOf(project, pz, d);
    if (cache[k] !== undefined) return cache[k];
    var lim = P.limits(project), span = P.letters(d.span), lvl = P.levelOf(project, pz), problems = [], grid = null, words = usable(project, d);
    var bad = spanProblem(project, d);
    if (bad) problems.push(bad);
    else {
      var target = lim.cells - span.length, base = project.seed + '|' + pz.id + '|' + (d.v || 0);
      var sets = E.pick(words, target, { min: lim.min, max: lim.max, seed: base });
      if (!sets.length) problems.push('no set of these words adds up to the ' + target + ' letters the grid needs');
      for (var i = 0; i < Math.min(SETS, sets.length); i++) {
        var avoid = words.filter(function (w) { return sets[i].indexOf(w) === -1; });
        var g = E.build({ span: span, words: sets[i], cols: lim.cols, rows: lim.rows, level: lvl, seed: base + '|' + i, avoid: avoid, tries: 50 });
        if (!g) continue;
        if (!grid || (grid.decoys.length && !g.decoys.length)) { grid = g; grid.unused = avoid; }
        if (!grid.decoys.length) break;
      }
      if (sets.length && !grid) problems.push('no grid with one clear solution came out of these words');
    }
    var res = grid || problems.length ? { grid: grid, level: lvl, problems: problems, ok: !!grid && !problems.length } : null;
    if (cacheSize > 2000) { cache = {}; cacheSize = 0; }
    cache[k] = res; cacheSize++;
    return res;
  }

  // How the puzzle stands: 'empty', 'words' (some of it, not enough), 'ok' (a good grid), 'weak' (all the words, but no grid).
  function status(project, pz) {
    var d = project.puzzles[pz.id], ask = P.limits(project).ask;
    if (!d || (!d.words.length && !d.span.trim())) return { state: 'empty', words: 0, ask: ask };
    var res = get(project, pz);
    // a good grid is enough, however many words it was built from
    if (res && res.ok) return { state: 'ok', words: d.words.length, ask: ask, pz: res };
    if (!P.letters(d.span) || d.words.length < ask) return { state: 'words', words: d.words.length, ask: ask, pz: res };
    return { state: 'weak', words: d.words.length, ask: ask, pz: res };
  }

  // Does the title give the span word away? (Theme words in a title are simply never picked.)
  function titleSpoils(project, pz) {
    var d = project.puzzles[pz.id];
    if (!d || !d.title.trim()) return '';
    var span = P.letters(d.span), hit = titleWords(d).some(function (t) { return E.sameWord(span, t); });
    return hit || (span && P.letters(d.title).indexOf(span) !== -1) ? d.span.trim() : '';
  }

  function clearCache() { cache = {}; cacheSize = 0; }

  CX.puzzles = { get: get, status: status, usable: usable, spanProblem: spanProblem, titleSpoils: titleSpoils, clearCache: clearCache };
})(typeof window !== 'undefined' ? window : globalThis);
