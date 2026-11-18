/*
 * The puzzle rules the app can prove: four groups of four, sixteen different answers, answers short
 * enough for a tile, and a fair spread of the tiles (no row or column holds more than two words of
 * one group, so no group is handed over in a line). Whether a link is fair is the writer's job: the
 * prompts ask for it, the check prompt tests it, and the warnings here catch the plain slips.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var U = CX.util;

  var MAX_PARTS = 3;     // words in one answer ("ICE CREAM", "JACK IN THE BOX" is too many)
  var MAX_CHARS = 16;    // characters of a whole answer, spaces included
  var MAX_LINE = 2;      // per row and per column: the most words of one group

  function letters(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  // A word without a plain plural ending: CATS -> CAT, BOXES -> BOX, BERRIES -> BERRY.
  function stem(w) {
    w = letters(w);
    if (w.length > 4 && /IES$/.test(w)) return w.slice(0, -3) + 'Y';
    if (w.length > 4 && /(?:S|X|Z|CH|SH)ES$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /S$/.test(w) && !/(?:SS|US|IS)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function sameWord(a, b) { a = letters(a); b = letters(b); return !!a && !!b && (a === b || stem(a) === stem(b)); }

  // Things that keep a puzzle out of the book, in plain words.
  function problems(d, maxLetters) {
    var out = [], gs = (d && d.groups) || [], seen = {};
    if (gs.length < 4) out.push(gs.length ? 'it has ' + gs.length + ' of the 4 groups' : 'it has no groups yet');
    gs.forEach(function (g, i) {
      if (!String(g.link || '').trim()) out.push('group ' + (i + 1) + ' has no link');
      if (g.words.length !== 4) out.push('group ' + (i + 1) + ' has ' + g.words.length + ' answers, not 4');
      g.words.forEach(function (w) {
        var k = letters(w);
        if (!k) return;
        if (seen[k]) out.push(w + ' is in it twice');
        seen[k] = 1;
        var parts = w.split(' ').length, longest = Math.max.apply(null, w.split(' ').map(function (x) { return letters(x).length; }));
        if (parts > MAX_PARTS || w.length > MAX_CHARS || longest > (maxLetters || 14)) out.push(w + ' is too long for a tile');
      });
    });
    return out.filter(function (x, i, a) { return a.indexOf(x) === i; });
  }

  // Slips worth a look that still print: a link that names its own answer, two forms of one word.
  function warnings(d) {
    var out = [], gs = (d && d.groups) || [], all = [];
    gs.forEach(function (g) {
      var linkWords = String(g.link || '').toUpperCase().split(/[^A-Z]+/).filter(function (x) { return x.length >= 3; });
      g.words.forEach(function (w) {
        w.split(' ').forEach(function (part) {
          if (letters(part).length >= 3 && linkWords.some(function (l) { return sameWord(l, part); })) out.push('the link “' + g.link + '” gives away ' + w);
        });
        all.push(w);
      });
    });
    for (var i = 0; i < all.length; i++) for (var j = i + 1; j < all.length; j++) {
      if (letters(all[i]) !== letters(all[j]) && sameWord(all[i], all[j])) out.push(all[i] + ' and ' + all[j] + ' are two forms of one word');
    }
    return out.filter(function (x, k, a) { return a.indexOf(x) === k; });
  }

  function spreadOk(cells) {
    for (var k = 0; k < 4; k++) {
      var row = [0, 0, 0, 0], col = [0, 0, 0, 0];
      for (var m = 0; m < 4; m++) { row[cells[k][m].g]++; col[cells[m][k].g]++; }
      if (Math.max.apply(null, row) > MAX_LINE || Math.max.apply(null, col) > MAX_LINE) return false;
    }
    return true;
  }

  /*
   * The 16 tiles of a complete puzzle as 4 rows of { w (the answer), g (its group, 0-3) }. The same
   * seed always gives the same board; no row or column holds more than two answers of one group.
   */
  function arrange(d, seed) {
    var rng = U.makeRng(seed), list = [];
    d.groups.forEach(function (g, gi) { g.words.forEach(function (w) { list.push({ w: w, g: gi }); }); });
    for (var t = 0; t < 600; t++) {
      rng.shuffle(list);
      var cells = [list.slice(0, 4), list.slice(4, 8), list.slice(8, 12), list.slice(12, 16)];
      if (spreadOk(cells)) return cells;
    }
    // a Latin square is always fair: one answer of each group in every row and column
    var by = [0, 1, 2, 3].map(function (gi) { return rng.shuffle(list.filter(function (x) { return x.g === gi; })); });
    var rows = rng.shuffle([0, 1, 2, 3]), cols = rng.shuffle([0, 1, 2, 3]);
    return rows.map(function (r, ri) { return cols.map(function (c) { return by[(r + c) % 4][ri]; }); });
  }

  CX.engine = { problems: problems, warnings: warnings, arrange: arrange, spreadOk: spreadOk, sameWord: sameWord, stem: stem, letters: letters, MAX_CHARS: MAX_CHARS, MAX_PARTS: MAX_PARTS };
})(typeof window !== 'undefined' ? window : globalThis);
