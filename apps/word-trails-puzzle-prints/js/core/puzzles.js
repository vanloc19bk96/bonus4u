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
  var EXTRA_WORDS = 2; // how many words past the usual number a stuck puzzle may hold
  var SPARE_SPANS = 4; // how many of a stuck puzzle's own words are tried as its span word
  var SMALL = ['A', 'AN', 'AND', 'AT', 'BY', 'FOR', 'IN', 'OF', 'ON', 'OR', 'THE', 'TO', 'WITH'];   // a piece of a phrase never starts or ends on these

  // The words of a title, for leaving out a word the title would give away.
  function titleWords(d) {
    return String(d.title || '').toUpperCase().replace(/[^A-Z]+/g, ' ').split(' ').filter(Boolean);
  }

  // The words a puzzle can use: right length, no repeats, not part of the span word, not in the title.
  // span: the span word to measure against, when it is not the one the AI wrote.
  function usable(project, d, span) {
    var lim = P.limits(project), seen = {}, inTitle = titleWords(d);
    span = span == null ? P.letters(d.span) : span;
    return d.words.map(P.letters).filter(function (w) {
      if (!w || seen[w] || w.length < lim.minLen || w.length > lim.maxLen || (span && E.related(w, span))) return false;
      if (inTitle.some(function (t) { return E.sameWord(w, t); })) return false;
      seen[w] = 1;
      return true;
    });
  }

  function keyOf(project, pz, d) {
    return [project.seed, pz.id, d.v || 0, project.plan.size, P.levelOf(project, pz),
      U.hashHex(d.span + '|' + d.title + '=' + usable(project, d).join('|'))].join('~');
  }

  function spanProblem(project, d) {
    var lim = P.limits(project), n = P.letters(d.span).length;
    if (!n) return 'no span word yet';
    if (n < lim.spanMin) return 'the span word has ' + n + ' letters; it needs at least ' + lim.spanMin + ' to reach from edge to edge';
    if (n > lim.spanMax) return 'the span word has ' + n + ' letters; ' + lim.spanMax + ' is the most for this grid and reader';
    return '';
  }

  // Tries one span word with one range of word counts: { grid, sets, target }.
  function attempt(project, pz, d, span, counts, base) {
    var lim = P.limits(project), letters = P.letters(span), words = usable(project, d, letters), lvl = P.levelOf(project, pz), grid = null;
    var target = lim.cells - letters.length, sets = E.pick(words, target, { min: counts.min, max: counts.max, seed: base });
    for (var i = 0; i < Math.min(SETS, sets.length); i++) {
      var avoid = words.filter(function (w) { return sets[i].indexOf(w) === -1; });
      var g = E.build({ span: letters, words: sets[i], cols: lim.cols, rows: lim.rows, level: lvl, seed: base + '|' + i, avoid: avoid, tries: 50 });
      if (!g) continue;
      if (!grid || (grid.decoys.length && !g.decoys.length)) { grid = g; grid.unused = avoid; }
      if (!grid.decoys.length) break;
    }
    return { grid: grid, sets: sets.length, target: target };
  }

  // The shorter pieces of a phrase, its end first: the last word usually carries the meaning (WINTER BREAKFAST: BREAKFAST).
  function spanParts(span) {
    var w = span.split(/\s+/), out = [];
    for (var end = w.length; end > 0; end--) {
      for (var start = 0; start < end; start++) {
        if (end - start === w.length || SMALL.indexOf(w[start]) !== -1 || SMALL.indexOf(w[end - 1]) !== -1) continue;
        out.push(w.slice(start, end).join(' '));
      }
    }
    return out;
  }

  /*
   * The span words to try, best first: the AI's own, a piece of it, then one of the puzzle's own words
   * of each length (another length changes the letters left to fill, which is what a stuck set needs).
   */
  function spanChoices(project, d) {
    var lim = P.limits(project), own = d.span.trim().toUpperCase(), out = [], seen = {}, lens = {};
    function add(span, kind) {
      var l = P.letters(span);
      if (seen[l] || l.length < lim.spanMin || l.length > lim.spanMax) return false;
      if (kind && spoilsTitle(d, span)) return false;
      seen[l] = 1;
      out.push({ span: span, kind: kind });
      return true;
    }
    add(own, '');
    if (own) spanParts(own).forEach(function (s) { add(s, 'part'); });
    usable(project, d).forEach(function (w) {
      if (lens[w.length] || Object.keys(lens).length >= SPARE_SPANS) return;
      if (add(w, 'word')) lens[w.length] = 1;
    });
    return out;
  }

  // What the book did in the AI's place, in plain words for the buyer.
  function fixNote(project, d, c) {
    var own = d.span.trim(), bad = spanProblem(project, d);
    var why = !own ? 'There was no span word' : bad ? 'The span word ' + own + ' does not fit (' + bad.replace(/^the span word/, 'it') + ')' : 'The words could not fill the grid with the span word ' + own;
    return why + ', so the book uses ' + c.span + (c.kind === 'word' ? ', one of the puzzle’s own words,' : '') + ' as the span word.';
  }

  /*
   * The puzzle: { grid (from CX.engine.build), span (as printed), note (when the app had to change the
   * span word), level, unused (words left out), problems, ok } or null when there is nothing to build
   * yet. The AI's span word with the usual number of words comes first, under the same seed, so a
   * puzzle that works keeps its grid. Only a stuck puzzle goes on to the other ways.
   */
  function get(project, pz) {
    var d = project.puzzles[pz.id];
    if (!d || !d.words.length) return null;
    var k = keyOf(project, pz, d);
    if (cache[k] !== undefined) return cache[k];
    var lim = P.limits(project), lvl = P.levelOf(project, pz), base = project.seed + '|' + pz.id + '|' + (d.v || 0);
    var counts = [{ min: lim.min, max: lim.max }, { min: Math.max(2, lim.min - 1), max: lim.max + EXTRA_WORDS }];
    var choices = spanChoices(project, d), res = null, first = null, n = 0;
    for (var i = 0; i < choices.length && !res; i++) {
      for (var j = 0; j < counts.length && !res; j++) {
        var a = attempt(project, pz, d, choices[i].span, counts[j], n ? base + '|fix' + n : base);
        n++;
        if (!first && !choices[i].kind) first = a;
        if (a.grid) res = { grid: a.grid, span: choices[i].span, note: choices[i].kind ? fixNote(project, d, choices[i]) : '', level: lvl, problems: [], ok: true };
      }
    }
    if (!res) {
      var bad = spanProblem(project, d), problems = [];
      if (bad) problems.push(bad);
      else if (first && !first.sets) problems.push('no set of these words adds up to the ' + first.target + ' letters the grid needs');
      else problems.push('no grid with one clear solution came out of these words');
      res = { grid: null, span: d.span.trim(), note: '', level: lvl, problems: problems, ok: false };
    }
    if (cacheSize > 2000) { cache = {}; cacheSize = 0; }
    cache[k] = res; cacheSize++;
    return res;
  }

  // The span word as the book prints it.
  function spanOf(project, pz) {
    var res = get(project, pz), d = project.puzzles[pz.id];
    return res && res.grid ? res.span : d ? d.span.trim() : '';
  }

  /*
   * The puzzles the PDF prints: only those with a grid and a title, numbered without a gap, so a stuck
   * puzzle can never leave a blank page. The index stays the puzzle's own, because it sets the level.
   */
  function printed(project) {
    var out = [];
    P.puzzles(project).forEach(function (x) {
      var res = get(project, x), d = project.puzzles[x.id];
      if (res && res.grid && d.title.trim()) out.push({ id: x.id, no: out.length + 1, index: x.index });
    });
    return out;
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

  function spoilsTitle(d, spanText) {
    var span = P.letters(spanText);
    if (!span || !d.title.trim()) return false;
    return titleWords(d).some(function (t) { return E.sameWord(span, t); }) || P.letters(d.title).indexOf(span) !== -1;
  }

  // Does the title give the span word away? (Theme words in a title are simply never picked.)
  function titleSpoils(project, pz) {
    var d = project.puzzles[pz.id];
    if (!d) return '';
    var span = spanOf(project, pz);
    return spoilsTitle(d, span) ? span : '';
  }

  function clearCache() { cache = {}; cacheSize = 0; }

  CX.puzzles = { get: get, status: status, usable: usable, spanOf: spanOf, printed: printed, spanProblem: spanProblem, titleSpoils: titleSpoils, clearCache: clearCache };
})(typeof window !== 'undefined' ? window : globalThis);
