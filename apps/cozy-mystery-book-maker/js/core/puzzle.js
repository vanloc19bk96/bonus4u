/*
 * Word search builder and verifier.
 *  - buildRegular: places the listed words, fills the rest, then proves every listed word occurs
 *    exactly once (all 8 directions), the hidden clue occurs 0 times, and no blocked word shows up.
 *  - buildFinal: places the clue words so the uncovered cells exactly hold the reveal message.
 * Everything is driven by a seeded RNG and fixed attempt budgets, so the same input always
 * produces the same grid on every machine.
 */
(function (root) {
  'use strict';
  var Cozy = root.Cozy = root.Cozy || {};
  var U = Cozy.util;

  // [dRow, dCol]. Axis = index % 4, so a direction and its opposite share an axis.
  var DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
  var DIR_NAMES = ['across', 'down', 'diagonal down', 'diagonal up', 'backward', 'up', 'diagonal up backward', 'diagonal down backward'];
  var DIFFICULTY_DIRS = { easy: [0, 1], medium: [0, 1, 2, 3], hard: [0, 1, 2, 3, 4, 5, 6, 7] };
  var MAX_SIDE = 15;

  var FREQ = 'EEEEEEEEEEEETTTTTTTTTAAAAAAAAOOOOOOOIIIIIIINNNNNNNSSSSSSHHHHHHRRRRRRDDDDLLLLCCCUUUMMWWFFGGYYPPBBVKJXQZ';

  // ---------- scanning ----------
  function buildTrie(words) {
    var rootNode = { k: {}, end: null };
    words.forEach(function (w, idx) {
      var n = rootNode;
      for (var i = 0; i < w.length; i++) {
        var ch = w[i];
        n = n.k[ch] || (n.k[ch] = { k: {}, end: null });
      }
      (n.end || (n.end = [])).push(idx);
    });
    return rootNode;
  }

  // grid: array of length rows*cols, each a letter or '' / '#'. Returns every match in 8 directions.
  function scan(grid, rows, cols, trie) {
    var found = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var first = trie.k[grid[r * cols + c]];
        if (!first) continue;
        for (var d = 0; d < 8; d++) {
          var dr = DIRS[d][0], dc = DIRS[d][1];
          var n = first, rr = r, cc = c, len = 1;
          while (n) {
            if (n.end) for (var e = 0; e < n.end.length; e++) found.push({ w: n.end[e], r: r, c: c, d: d, len: len });
            rr += dr; cc += dc;
            if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) break;
            n = n.k[grid[rr * cols + cc]];
            len++;
          }
        }
      }
    }
    return found;
  }

  function matchCells(m, cols) {
    var out = [];
    for (var i = 0; i < m.len; i++) out.push((m.r + DIRS[m.d][0] * i) * cols + (m.c + DIRS[m.d][1] * i));
    return out;
  }

  // ---------- layout state ----------
  function Layout(rows, cols) {
    this.rows = rows; this.cols = cols;
    this.letters = new Array(rows * cols).fill('');
    this.count = new Int16Array(rows * cols);
    this.axes = new Int16Array(rows * cols * 4);
    this.covered = 0;
    this.placed = [];
    this.usage = [0, 0, 0, 0, 0, 0, 0, 0];
  }

  // Valid placements for a word. A shared cell must hold the same letter and the two words must
  // not run along the same line (no collinear overlaps).
  Layout.prototype.candidates = function (word, dirs) {
    var rows = this.rows, cols = this.cols, L = word.length, out = [];
    for (var di = 0; di < dirs.length; di++) {
      var d = dirs[di], dr = DIRS[d][0], dc = DIRS[d][1], axis = d % 4;
      var rMin = dr < 0 ? L - 1 : 0, rMax = dr > 0 ? rows - L : rows - 1;
      var cMin = dc < 0 ? L - 1 : 0, cMax = dc > 0 ? cols - L : cols - 1;
      for (var r = rMin; r <= rMax; r++) {
        for (var c = cMin; c <= cMax; c++) {
          var ok = true, cross = 0, fresh = 0;
          for (var i = 0; i < L; i++) {
            var idx = (r + dr * i) * cols + (c + dc * i);
            if (this.count[idx] > 0) {
              if (this.letters[idx] !== word[i] || this.axes[idx * 4 + axis] > 0) { ok = false; break; }
              cross++;
            } else fresh++;
          }
          if (ok) out.push({ r: r, c: c, d: d, cross: cross, fresh: fresh });
        }
      }
    }
    return out;
  };

  Layout.prototype.apply = function (word, p) {
    var dr = DIRS[p.d][0], dc = DIRS[p.d][1], axis = p.d % 4;
    for (var i = 0; i < word.length; i++) {
      var idx = (p.r + dr * i) * this.cols + (p.c + dc * i);
      if (this.count[idx] === 0) this.covered++;
      this.count[idx]++;
      this.letters[idx] = word[i];
      this.axes[idx * 4 + axis]++;
    }
    this.usage[p.d]++;
  };

  Layout.prototype.remove = function (word, p) {
    var dr = DIRS[p.d][0], dc = DIRS[p.d][1], axis = p.d % 4;
    for (var i = 0; i < word.length; i++) {
      var idx = (p.r + dr * i) * this.cols + (p.c + dc * i);
      this.count[idx]--;
      this.axes[idx * 4 + axis]--;
      if (this.count[idx] === 0) { this.covered--; this.letters[idx] = ''; }
    }
    this.usage[p.d]--;
  };

  // ---------- regular puzzle ----------
  function placeAllBacktracking(words, size, dirs, rng, budget) {
    var lay = new Layout(size, size);
    var slots = new Array(words.length);
    var steps = { left: budget };
    function rec(i) {
      if (i === words.length) return true;
      if (steps.left-- <= 0) return false;
      var cands = lay.candidates(words[i], dirs);
      if (!cands.length) return false;
      for (var k = 0; k < cands.length; k++) {
        var cd = cands[k];
        // balance directions; a mild preference for crossings keeps the grid lively
        cd.s = lay.usage[cd.d] * 1.25 - Math.min(cd.cross, 2) * 0.45 + rng.next() * 1.6;
      }
      cands.sort(function (a, b) { return a.s - b.s; });
      var tries = Math.min(cands.length, 24);
      for (var t = 0; t < tries; t++) {
        lay.apply(words[i], cands[t]);
        slots[i] = cands[t];
        if (rec(i + 1)) return true;
        lay.remove(words[i], cands[t]);
        if (steps.left <= 0) return false;
      }
      return false;
    }
    if (!rec(0)) return null;
    lay.slots = slots;
    return lay;
  }

  function fillLetters(lay, rng, pool) {
    var g = lay.letters.slice();
    for (var i = 0; i < g.length; i++) {
      if (lay.count[i] > 0) continue;
      g[i] = (pool.length && rng.next() < 0.5) ? pool[rng.int(pool.length)] : FREQ[rng.int(FREQ.length)];
    }
    return g;
  }

  // Shared verification for any finished grid.
  //  expect: map word -> required count (1 for placed words, 0 for the hidden clue)
  //  wordCells: Uint8Array marking cells that belong to placed words (blocked words fully inside a
  //  placed word are allowed, e.g. a list word that happens to contain a short blocked word)
  function verifyGrid(grid, rows, cols, expect, wordCells) {
    var keys = Object.keys(expect);
    var block = (Cozy.blocklist ? Cozy.blocklist.grid : []).filter(function (w) { return !expect.hasOwnProperty(w); });
    var all = keys.concat(block);
    var trie = buildTrie(all);
    var matches = scan(grid, rows, cols, trie);
    var counts = {}, found = {};
    var problems = [];
    var refillCanFix = true; // false when a problem lies entirely inside placed words
    function onlyWordCells(m) { return matchCells(m, cols).every(function (ci) { return !!wordCells[ci]; }); }
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i], w = all[m.w];
      if (m.w < keys.length) {
        counts[w] = (counts[w] || 0) + 1;
        (found[w] || (found[w] = [])).push(m);
      } else if (!onlyWordCells(m)) {
        problems.push('a blocked word appeared');
      }
    }
    keys.forEach(function (w) {
      var n = counts[w] || 0;
      if (n === expect[w]) return;
      problems.push(w + ' occurs ' + n + ' times (needs ' + expect[w] + ')');
      if (n < expect[w]) { refillCanFix = false; return; }
      var solid = (found[w] || []).filter(onlyWordCells).length;
      if (solid > expect[w]) refillCanFix = false;
    });
    return { ok: problems.length === 0, problems: problems, found: found, refillCanFix: refillCanFix };
  }

  /*
   * opts: { words: [normalized words to place], hidden: normalized clue or null, size, dirs, seed }
   */
  function buildRegular(opts) {
    var words = opts.words.slice().sort(function (a, b) { return b.length - a.length || (a < b ? -1 : 1); });
    var hidden = opts.hidden || null;
    var dirs = opts.dirs || DIFFICULTY_DIRS.medium;
    var longest = words.length ? words[0].length : 4;
    var start = Math.max(opts.size || 13, longest);
    var pool = words.join('') + (hidden || '');
    var lastProblem = 'the words would not fit';
    if (longest > MAX_SIDE) return { ok: false, reason: 'A word is longer than 15 letters.' };
    for (var size = start; size <= MAX_SIDE; size++) {
      for (var la = 0; la < 24; la++) {
        var rng = U.makeRng(opts.seed + '|r|' + size + '|' + la);
        var lay = placeAllBacktracking(words, size, dirs, rng, 2500);
        if (!lay) continue;
        var wordCells = new Uint8Array(size * size);
        for (var i = 0; i < wordCells.length; i++) wordCells[i] = lay.count[i] > 0 ? 1 : 0;
        var expect = {};
        words.forEach(function (w) { expect[w] = 1; });
        if (hidden) expect[hidden] = 0;
        for (var fa = 0; fa < 30; fa++) {
          var grid = fillLetters(lay, rng, pool);
          var v = verifyGrid(grid, size, size, expect, wordCells);
          if (v.ok) {
            var placements = words.map(function (w) {
              var m = v.found[w][0];
              return { word: w, r: m.r, c: m.c, d: m.d };
            });
            return {
              ok: true, rows: size, cols: size, grid: toRows(grid, size, size),
              placements: placements, hidden: hidden, grew: size > (opts.size || 13)
            };
          }
          lastProblem = v.problems[0];
          if (!v.refillCanFix) break;
        }
      }
    }
    return { ok: false, reason: 'The words could not be fitted into a 15 x 15 grid (' + lastProblem + ').' };
  }

  function toRows(grid, rows, cols) {
    var out = [];
    for (var r = 0; r < rows; r++) {
      var s = '';
      for (var c = 0; c < cols; c++) s += grid[r * cols + c] || '#';
      out.push(s);
    }
    return out;
  }

  // ---------- final puzzle ----------
  // crossW: how strongly to prefer crossings (dense grids need more of them)
  function greedyPlace(words, rows, cols, dirs, rng, crossW) {
    crossW = crossW == null ? 0.7 : crossW;
    var lay = new Layout(rows, cols);
    var slots = [];
    for (var i = 0; i < words.length; i++) {
      var cands = lay.candidates(words[i], dirs);
      if (!cands.length) return null;
      var best = null, bestS = Infinity;
      for (var k = 0; k < cands.length; k++) {
        var s = lay.usage[cands[k].d] * 0.8 - cands[k].cross * crossW + rng.next() * 2.2;
        if (s < bestS) { bestS = s; best = cands[k]; }
      }
      lay.apply(words[i], best);
      slots.push(best);
    }
    lay.slots = slots;
    return lay;
  }

  // Move words around until uncovered cells == target. Returns the final uncovered count.
  function climb(lay, words, dirs, target, rng, iterations) {
    var area = lay.rows * lay.cols;
    for (var it = 0; it < iterations; it++) {
      var Ucur = area - lay.covered;
      if (Ucur === target) return Ucur;
      var wi = rng.int(words.length);
      var w = words[wi], old = lay.slots[wi];
      lay.remove(w, old);
      var base = area - lay.covered;
      var cands = lay.candidates(w, dirs);
      var pick = null;
      if (rng.next() < 0.12) pick = cands[rng.int(cands.length)];
      else {
        var bestD = Infinity, ties = [];
        for (var k = 0; k < cands.length; k++) {
          var dist = Math.abs(base - cands[k].fresh - target) + lay.usage[cands[k].d] * 0.05;
          if (dist < bestD - 1e-9) { bestD = dist; ties = [cands[k]]; }
          else if (Math.abs(dist - bestD) < 1e-9) ties.push(cands[k]);
        }
        pick = ties.length ? ties[rng.int(ties.length)] : old;
      }
      lay.apply(w, pick || old);
      lay.slots[wi] = pick || old;
    }
    return area - lay.covered;
  }

  function finishFinal(lay, words, message) {
    var rows = lay.rows, cols = lay.cols;
    var grid = lay.letters.slice();
    var wordCells = new Uint8Array(rows * cols);
    var mi = 0, spare = 0;
    for (var i = 0; i < grid.length; i++) {
      if (lay.count[i] > 0) { wordCells[i] = 1; continue; }
      if (mi < message.length) grid[i] = message[mi++];
      else { grid[i] = '#'; spare++; }
    }
    if (mi < message.length) return null;
    var expect = {};
    words.forEach(function (w) { expect[w] = 1; });
    var v = verifyGrid(grid, rows, cols, expect, wordCells);
    if (!v.ok) return null;
    // Independent check: cross out every found word and read what is left.
    var crossed = new Uint8Array(rows * cols);
    var placements = words.map(function (w) {
      var m = v.found[w][0];
      matchCells(m, cols).forEach(function (ci) { crossed[ci] = 1; });
      return { word: w, r: m.r, c: m.c, d: m.d };
    });
    var left = '';
    for (var j = 0; j < grid.length; j++) if (!crossed[j] && grid[j] !== '#') left += grid[j];
    if (left !== message) return null;
    return { grid: toRows(grid, rows, cols), placements: placements, spare: spare };
  }

  // Longest stretch of uncovered cells side by side in one row. Long stretches would let the
  // message (and the killer's name) be read straight off the grid, so short ones are preferred.
  function longestRun(lay) {
    var best = 0;
    for (var r = 0; r < lay.rows; r++) {
      var run = 0;
      for (var c = 0; c < lay.cols; c++) {
        if (lay.count[r * lay.cols + c] === 0) { run++; if (run > best) best = run; } else run = 0;
      }
    }
    return best;
  }

  /*
   * opts: { words: [normalized clues], messages: [{ text: 'THEKILLERIS...', spaced: 'THE KILLER IS ...' }],
   *         dirs, seed }
   * messages are tried in the given order (longest first).
   */
  function buildFinal(opts) {
    var words = opts.words.slice().sort(function (a, b) { return b.length - a.length || (a < b ? -1 : 1); });
    var dirs = opts.dirs || DIFFICULTY_DIRS.medium;
    var S = words.reduce(function (s, w) { return s + w.length; }, 0);
    var longest = words.length ? words[0].length : 4;
    var sizes = [];
    for (var h = 10; h <= MAX_SIDE; h++) for (var w = 10; w <= MAX_SIDE; w++) {
      if (Math.min(h, w) < longest && dirs.length > 2) continue;
      if (Math.max(h, w) < longest) continue;
      if (w < h) continue; // landscape or square reads better under a title
      sizes.push({ rows: h, cols: w, area: h * w });
    }
    var fallback = null;
    var tried = 0;
    var deadline = Date.now() + (opts.timeLimit || 3000);
    var bestExact = null, GOOD_RUN = 3, exactHits = 0;
    function consider(sz, mIdx, at, exactOnly) {
      var msg = opts.messages[mIdx], target = msg.text.length;
      tried++;
      var rng = U.makeRng(opts.seed + '|f|' + mIdx + '|' + sz.rows + 'x' + sz.cols + '|' + at);
      var lay = greedyPlace(words, sz.rows, sz.cols, dirs, rng, at % 2 ? 2.2 : 0.7);
      if (!lay) return null;
      var Uleft = climb(lay, words, dirs, target, rng, 1500);
      if (Uleft === target) {
        var run = longestRun(lay);
        if (bestExact && run >= bestExact.run) return null;
        var done = finishFinal(lay, words, msg.text);
        if (done) {
          bestExact = {
            ok: true, exact: true, rows: sz.rows, cols: sz.cols, grid: done.grid, placements: done.placements,
            message: msg.text, messageSpaced: msg.spaced, spare: 0, attempts: tried, run: run
          };
          if (run <= GOOD_RUN) return bestExact;
        }
      } else if (!exactOnly && Uleft > target && (!fallback || Uleft - target < fallback.extra)) {
        var fin = finishFinal(lay, words, msg.text);
        if (fin) fallback = { extra: Uleft - target, rows: sz.rows, cols: sz.cols, fin: fin, msg: msg };
      }
      return null;
    }
    function sizesFor(target, lo, hi) {
      return sizes.map(function (s) {
        var ratio = (s.area - target) / S;
        return { s: s, ratio: ratio, score: Math.abs(ratio - 0.8) + 0.015 * (s.cols - s.rows) };
      }).filter(function (x) { return x.ratio >= lo && x.ratio <= hi; })
        .sort(function (a, b) { return a.score - b.score; });
    }
    // 1) exact fits, longest message first, within the time budget
    for (var mIdx = 0; mIdx < opts.messages.length && Date.now() < deadline; mIdx++) {
      var cands = sizesFor(opts.messages[mIdx].text.length, 0.56, 1.0).slice(0, 24);
      for (var ci = 0; ci < cands.length && Date.now() < deadline; ci++) {
        for (var at = 0; at < 40; at++) {
          var had = bestExact;
          var r = consider(cands[ci].s, mIdx, at, false);
          if (r && r.run <= GOOD_RUN) return r;
          if (bestExact !== had) exactHits++;
        }
        // an exact fit exists for this message; stop once enough alternatives were compared
        if (bestExact && (exactHits >= 12 || ci >= 12)) return bestExact;
      }
      if (bestExact) return bestExact;
    }
    if (bestExact) return bestExact;
    // 2) no exact fit: roomier grids, where the spare cells become solid black squares
    if (!fallback) {
      for (var m2 = 0; m2 < opts.messages.length && !fallback; m2++) {
        var roomy = sizesFor(opts.messages[m2].text.length, 1.0, 1.6).sort(function (a, b) { return a.ratio - b.ratio; }).slice(0, 10);
        for (var c2 = 0; c2 < roomy.length; c2++) for (var a2 = 0; a2 < 8; a2++) consider(roomy[c2].s, m2, 100 + a2, false);
      }
    }
    if (fallback) {
      return {
        ok: true, exact: false, rows: fallback.rows, cols: fallback.cols, grid: fallback.fin.grid,
        placements: fallback.fin.placements, message: fallback.msg.text, messageSpaced: fallback.msg.spaced,
        spare: fallback.fin.spare, attempts: tried
      };
    }
    return { ok: false, reason: 'The clue words could not be arranged into the final grid. Try shorter clue words.' };
  }

  // Re-verify a stored puzzle (used by the checklist, independent of how it was built).
  function verifyStored(p) {
    if (!p || !p.grid) return { ok: false, problems: ['not built'] };
    var rows = p.rows, cols = p.cols;
    var grid = p.grid.join('').split('');
    var expect = {};
    p.placements.forEach(function (pl) { expect[pl.word] = 1; });
    if (p.hidden) expect[p.hidden] = 0;
    var wordCells = new Uint8Array(rows * cols);
    p.placements.forEach(function (pl) {
      matchCells({ r: pl.r, c: pl.c, d: pl.d, len: pl.word.length }, cols).forEach(function (ci) { wordCells[ci] = 1; });
    });
    var v = verifyGrid(grid, rows, cols, expect, wordCells);
    var res = { ok: v.ok, problems: v.problems.slice() };
    if (p.message) {
      var crossed = new Uint8Array(rows * cols);
      Object.keys(v.found).forEach(function (w) { v.found[w].forEach(function (m) { matchCells(m, cols).forEach(function (ci) { crossed[ci] = 1; }); }); });
      var left = '';
      for (var j = 0; j < grid.length; j++) if (!crossed[j] && grid[j] !== '#') left += grid[j];
      if (left !== p.message) { res.ok = false; res.problems.push('leftover letters read "' + left + '"'); }
    }
    return res;
  }

  Cozy.puzzle = {
    DIRS: DIRS, DIR_NAMES: DIR_NAMES, DIFFICULTY_DIRS: DIFFICULTY_DIRS, MAX_SIDE: MAX_SIDE,
    buildRegular: buildRegular, buildFinal: buildFinal, verifyStored: verifyStored,
    buildTrie: buildTrie, scan: scan
  };
})(typeof window !== 'undefined' ? window : globalThis);
