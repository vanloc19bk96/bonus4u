/*
 * generator.js: builds Word Fill-In puzzles (a crossword with no clues: the solver gets the
 * word list grouped by length and must fit every word into the grid).
 *
 * FillInEngineFactory is fully self-contained (no outside references) because app.js turns
 * it into a Blob Web Worker with Function.prototype.toString(). Keep it that way.
 *
 * Pipeline for one puzzle:
 *   1. construct: many seeded attempts at a criss-cross layout inside maxRows x maxCols,
 *      using strict crossword rules (words only touch where they cross), so every run of
 *      two or more letters in the grid is exactly one listed word.
 *   2. starters: pre-fill 1-2 words (the classic "one word to get you started").
 *   3. uniqueness: a backtracking solver counts solutions (stops at 2). While more than one
 *      solution exists, the word that differs is added as another starter. The printed
 *      puzzle therefore always has exactly one solution.
 */
function FillInEngineFactory() {
  'use strict';
  var H = 0, V = 1;
  var NODE_LIMIT = 40000;   // solver budget per check; running out counts as "not proven unique"

  function hashString(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // mulberry32: small, fast, good enough for layout randomness; same seed = same puzzle.
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1)), t = arr[i];
      arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ------------------------------------------------------------------ construction board
  // A square canvas big enough to grow in any direction; the bounding box of the letters
  // is capped at maxRows x maxCols. One empty ring is always kept around the canvas edge.
  function newBoard(maxRows, maxCols) {
    var D = Math.max(maxRows, maxCols) * 2 + 3, cells = [];
    for (var i = 0; i < D * D; i++) cells.push('');
    return {
      D: D, maxRows: maxRows, maxCols: maxCols,
      cells: cells,
      used: new Uint8Array(D * D),   // bit 1: part of an across word, bit 2: part of a down word
      byLetter: {},
      placed: [],
      minR: Infinity, maxR: -Infinity, minC: Infinity, maxC: -Infinity
    };
  }

  // Number of crossings if the word fits at (r, c) going d, or -1 if it breaks a rule.
  function canPlace(b, word, r, c, d) {
    var len = word.length, D = b.D, dr = d === V ? 1 : 0, dc = d === H ? 1 : 0;
    var r2 = r + dr * (len - 1), c2 = c + dc * (len - 1);
    if (r < 1 || c < 1 || r2 > D - 2 || c2 > D - 2) return -1;
    if (b.placed.length) {
      var h = Math.max(b.maxR, r2) - Math.min(b.minR, r) + 1;
      var w = Math.max(b.maxC, c2) - Math.min(b.minC, c) + 1;
      if (h > b.maxRows || w > b.maxCols) return -1;
    } else if (r2 - r + 1 > b.maxRows || c2 - c + 1 > b.maxCols) return -1;
    // The cells just before and just after the word must stay empty.
    if (b.cells[(r - dr) * D + (c - dc)] || b.cells[(r2 + dr) * D + (c2 + dc)]) return -1;
    var cross = 0, bit = d === H ? 1 : 2;
    for (var i = 0; i < len; i++) {
      var idx = (r + dr * i) * D + (c + dc * i), ch = b.cells[idx];
      if (ch) {
        if (ch !== word.charAt(i) || (b.used[idx] & bit)) return -1;
        cross++;
      } else if (d === H ? (b.cells[idx - D] || b.cells[idx + D]) : (b.cells[idx - 1] || b.cells[idx + 1])) {
        return -1; // would touch a parallel word side by side
      }
    }
    if (cross === len) return -1;
    return cross;
  }

  function place(b, word, r, c, d) {
    var D = b.D, dr = d === V ? 1 : 0, dc = d === H ? 1 : 0, bit = d === H ? 1 : 2;
    for (var i = 0; i < word.length; i++) {
      var idx = (r + dr * i) * D + (c + dc * i);
      if (!b.cells[idx]) {
        var ch = word.charAt(i);
        b.cells[idx] = ch;
        (b.byLetter[ch] = b.byLetter[ch] || []).push(idx);
      }
      b.used[idx] |= bit;
    }
    b.minR = Math.min(b.minR, r); b.maxR = Math.max(b.maxR, r + dr * (word.length - 1));
    b.minC = Math.min(b.minC, c); b.maxC = Math.max(b.maxC, c + dc * (word.length - 1));
    b.placed.push({ w: word, r: r, c: c, d: d });
  }

  // Best crossing placement for a word: more crossings, little bounding-box growth, and a
  // box shape that follows maxRows x maxCols. Random jitter varies the layouts.
  function findBest(b, word, rand) {
    var D = b.D, best = null;
    var oldArea = (b.maxR - b.minR + 1) * (b.maxC - b.minC + 1);
    function consider(r, c, d) {
      var cross = canPlace(b, word, r, c, d);
      if (cross < 1) return;
      var r2 = r + (d === V ? word.length - 1 : 0), c2 = c + (d === H ? word.length - 1 : 0);
      var h = Math.max(b.maxR, r2) - Math.min(b.minR, r) + 1;
      var w = Math.max(b.maxC, c2) - Math.min(b.minC, c) + 1;
      var shape = Math.abs(h / b.maxRows - w / b.maxCols);
      var score = cross * 6 - (h * w - oldArea) * 0.3 - shape * 6 + rand() * 2.5;
      if (!best || score > best.score) best = { r: r, c: c, d: d, score: score };
    }
    for (var i = 0; i < word.length; i++) {
      var list = b.byLetter[word.charAt(i)];
      if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        var idx = list[k], r = Math.floor(idx / D), c = idx % D;
        if (!(b.used[idx] & 1)) consider(r, c - i, H);
        if (!(b.used[idx] & 2)) consider(r - i, c, V);
      }
    }
    return best;
  }

  function construct(words, opts, rand) {
    var b = newBoard(opts.maxRows, opts.maxCols);
    // Mostly longest-first (long words make a good skeleton), with noise for variety.
    var spread = opts.spread;
    var keyed = words.map(function (w) { return { w: w, k: w.length + rand() * spread }; });
    keyed.sort(function (p, q) { return q.k - p.k; });
    var order = keyed.map(function (x) { return x.w; });

    var first = order[0], D = b.D, mid = Math.floor(D / 2);
    var d = opts.maxCols > opts.maxRows ? H : opts.maxRows > opts.maxCols ? V : (rand() < 0.5 ? H : V);
    if (first.length > (d === H ? opts.maxCols : opts.maxRows)) d = 1 - d;
    place(b, first, d === V ? mid - Math.floor(first.length / 2) : mid, d === H ? mid - Math.floor(first.length / 2) : mid, d);

    fill(b, order.slice(1), opts, rand);
    return b;
  }

  // Greedy passes: each pending word goes to its best crossing spot, if it has one.
  function fill(b, pending, opts, rand) {
    for (var pass = 0; pass < 3 && b.placed.length < opts.target; pass++) {
      var progress = false, rest = [];
      for (var i = 0; i < pending.length; i++) {
        if (b.placed.length >= opts.target) { rest.push(pending[i]); continue; }
        var spot = findBest(b, pending[i], rand);
        if (spot) { place(b, pending[i], spot.r, spot.c, spot.d); progress = true; }
        else rest.push(pending[i]);
      }
      pending = rest;
      if (!progress) break;
    }
    return pending;
  }

  function rebuild(placed, opts) {
    var b = newBoard(opts.maxRows, opts.maxCols);
    placed.forEach(function (p) { place(b, p.w, p.r, p.c, p.d); });
    return b;
  }

  // After removing words: every pair of side-by-side letters must still belong to one word
  // (a removed word may have been the only thing joining two neighbours).
  function noStrayRuns(b) {
    var D = b.D;
    for (var i = 0; i < b.cells.length; i++) {
      if (!b.cells[i]) continue;
      if (b.cells[i + 1] && !((b.used[i] & 1) && (b.used[i + 1] & 1))) return false;
      if (b.cells[i + D] && !((b.used[i] & 2) && (b.used[i + D] & 2))) return false;
    }
    return true;
  }

  // All letter squares reachable from the first one? (Removing a word can split the grid.)
  function connected(b) {
    var D = b.D, start = -1, total = 0;
    for (var i = 0; i < b.cells.length; i++) if (b.cells[i]) { total++; if (start < 0) start = i; }
    if (start < 0) return false;
    var seen = new Uint8Array(D * D), stack = [start], count = 0;
    seen[start] = 1;
    while (stack.length) {
      var k = stack.pop(); count++;
      [k - 1, k + 1, k - D, k + D].forEach(function (n) {
        if (!seen[n] && b.cells[n]) { seen[n] = 1; stack.push(n); }
      });
    }
    return count === total;
  }

  // Local search: pull out one or two words, refill greedily, keep the result if it scores
  // better. Opens room for words the first greedy pass boxed out.
  function improve(b, words, opts, rand, rounds) {
    var best = b, bestScore = boardScore(b, opts.target);
    for (var it = 0; it < rounds; it++) {
      var placed = best.placed.slice(), drop = 1 + (rand() < 0.5 ? 1 : 0);
      for (var d = 0; d < drop && placed.length > 2; d++) placed.splice(1 + Math.floor(rand() * (placed.length - 1)), 1);
      var nb = rebuild(placed, opts);
      if (!connected(nb) || !noStrayRuns(nb)) continue;
      var inGrid = {};
      placed.forEach(function (p) { inGrid[p.w] = true; });
      var pending = shuffle(words.filter(function (w) { return !inGrid[w]; }), rand);
      pending.sort(function (x, y) { return x.length - y.length; }); // short words fit gaps best
      fill(nb, pending, opts, rand);
      var sc = boardScore(nb, opts.target);
      if (sc > bestScore) { best = nb; bestScore = sc; }
    }
    return best;
  }

  function boardScore(b, target) {
    var crossings = 0, letters = 0;
    for (var i = 0; i < b.used.length; i++) {
      if (b.used[i] === 3) crossings++;
      if (b.used[i]) letters++;
    }
    var area = (b.maxR - b.minR + 1) * (b.maxC - b.minC + 1);
    return Math.min(b.placed.length, target) * 100 + crossings * 5 - (area - letters) * 0.2;
  }

  // Crops the board to its letters: { rows, cols, grid: 'ABC..' ('.' = no square), words }.
  function crop(b) {
    var rows = b.maxR - b.minR + 1, cols = b.maxC - b.minC + 1, grid = '';
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) grid += b.cells[(r + b.minR) * b.D + (c + b.minC)] || '.';
    }
    var words = b.placed.map(function (p) {
      return { w: p.w, r: p.r - b.minR, c: p.c - b.minC, d: p.d === H ? 'a' : 'd' };
    });
    return { rows: rows, cols: cols, grid: grid, words: words };
  }

  // ------------------------------------------------------------------ slots + solver
  // Every maximal run of 2+ letter squares, across then down.
  function slotsFromGrid(grid, rows, cols) {
    var slots = [];
    function at(r, c) { return r >= 0 && c >= 0 && r < rows && c < cols && grid.charAt(r * cols + c) !== '.'; }
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols;) {
        if (!at(r, c)) { c++; continue; }
        var s = c;
        while (at(r, c)) c++;
        if (c - s >= 2) slots.push(makeSlot(r, s, 'a', c - s, cols));
      }
    }
    for (c = 0; c < cols; c++) {
      for (r = 0; r < rows;) {
        if (!at(r, c)) { r++; continue; }
        var s2 = r;
        while (at(r, c)) r++;
        if (r - s2 >= 2) slots.push(makeSlot(s2, c, 'd', r - s2, cols));
      }
    }
    return slots;
  }
  function makeSlot(r, c, d, len, cols) {
    var cells = [];
    for (var i = 0; i < len; i++) cells.push(d === 'a' ? r * cols + c + i : (r + i) * cols + c);
    return { r: r, c: c, d: d, len: len, cells: cells };
  }

  // Matches each slot to its word. Throws if the grid holds a run that is not a listed word.
  function mapSlots(p) {
    var slots = slotsFromGrid(p.grid, p.rows, p.cols), byPos = {};
    p.words.forEach(function (w, i) { byPos[w.r + ',' + w.c + ',' + w.d] = i; });
    if (slots.length !== p.words.length) throw new Error('grid has ' + slots.length + ' runs for ' + p.words.length + ' words');
    slots.forEach(function (s) {
      var i = byPos[s.r + ',' + s.c + ',' + s.d];
      if (i === undefined) throw new Error('unlisted run at ' + s.r + ',' + s.c);
      var text = '';
      s.cells.forEach(function (cell) { text += p.grid.charAt(cell); });
      if (text !== p.words[i].w) throw new Error('run ' + text + ' does not match ' + p.words[i].w);
      s.word = i;
    });
    return slots;
  }

  // Counts solutions (up to `limit`) of the fill-in: every word used once, crossings agree.
  // givenSlots: slot indices whose word is printed in the grid.
  function solve(slots, words, cellCount, givenSlots, limit, nodeLimit) {
    var bank = {}, used = {}, letters = [], assign = [], solutions = [], nodes = 0, aborted = false;
    words.forEach(function (w) { (bank[w.length] = bank[w.length] || []).push(w); });
    for (var i = 0; i < cellCount; i++) letters.push('');
    for (i = 0; i < slots.length; i++) assign.push(null);
    givenSlots.forEach(function (si) {
      var s = slots[si], w = words[s.word];
      assign[si] = w; used[w] = true;
      s.cells.forEach(function (cell, k) { letters[cell] = w.charAt(k); });
    });

    function candidates(s) {
      var list = bank[s.len] || [], out = [];
      outer: for (var j = 0; j < list.length; j++) {
        var w = list[j];
        if (used[w]) continue;
        for (var k = 0; k < s.len; k++) {
          var ch = letters[s.cells[k]];
          if (ch && ch !== w.charAt(k)) continue outer;
        }
        out.push(w);
      }
      return out;
    }

    function rec() {
      if (++nodes > nodeLimit) { aborted = true; return true; }
      var best = -1, bestC = null;
      for (var si = 0; si < slots.length; si++) {
        if (assign[si] !== null) continue;
        var cand = candidates(slots[si]);
        if (!cand.length) return false;
        if (!bestC || cand.length < bestC.length) { best = si; bestC = cand; if (cand.length === 1) break; }
      }
      if (best < 0) { solutions.push(assign.slice()); return solutions.length >= limit; }
      var s = slots[best];
      for (var j = 0; j < bestC.length; j++) {
        var w = bestC[j], changed = [];
        for (var k = 0; k < s.len; k++) {
          if (!letters[s.cells[k]]) { letters[s.cells[k]] = w.charAt(k); changed.push(s.cells[k]); }
        }
        assign[best] = w; used[w] = true;
        var stop = rec();
        assign[best] = null; used[w] = false;
        for (k = 0; k < changed.length; k++) letters[changed[k]] = '';
        if (stop) return true;
      }
      return false;
    }
    rec();
    return { solutions: solutions, aborted: aborted, nodes: nodes };
  }

  // Adds starter words until the solver proves a single solution. Returns the starter slot
  // indices, or null if it would need more than maxGivens.
  function makeUnique(p, slots, starters, maxGivens, rand) {
    var words = p.words.map(function (w) { return w.w; });
    var truth = slots.map(function (s) { return words[s.word]; });
    var lenCount = {};
    words.forEach(function (w) { lenCount[w.length] = (lenCount[w.length] || 0) + 1; });
    var crossCount = slots.map(function (s) {
      var n = 0;
      s.cells.forEach(function (cell) {
        slots.forEach(function (o) { if (o !== s && o.cells.indexOf(cell) >= 0) n++; });
      });
      return n;
    });
    // Starters come from the most crowded length groups, preferring well-crossed words.
    function rank(exclude) {
      var order = slots.map(function (s, i) { return i; }).filter(function (i) { return exclude.indexOf(i) < 0; });
      var keys = order.map(function (i) { return lenCount[slots[i].len] * 10 + crossCount[i] * 2 + slots[i].len + rand() * 6; });
      return order.map(function (i, k) { return { i: i, k: keys[k] }; })
        .sort(function (a, b) { return b.k - a.k; }).map(function (x) { return x.i; });
    }
    var givens = [];
    while (givens.length < Math.min(starters, slots.length)) {
      var next = rank(givens), pick = next[0];
      // A second starter from a different length group spreads the help around the grid.
      for (var n = 0; n < next.length; n++) {
        if (!givens.some(function (g) { return slots[g].len === slots[next[n]].len; })) { pick = next[n]; break; }
      }
      givens.push(pick);
    }

    for (var iter = 0; iter < 60; iter++) {
      var res = solve(slots, words, p.rows * p.cols, givens, 2, NODE_LIMIT);
      if (!res.aborted && res.solutions.length === 1) {
        var sol = res.solutions[0];
        for (var i = 0; i < sol.length; i++) if (sol[i] !== truth[i]) throw new Error('solver disagrees with layout');
        return givens;
      }
      if (givens.length >= maxGivens) return null;
      var add = -1;
      if (!res.aborted) {
        var alt = res.solutions[0].join('|') === truth.join('|') ? res.solutions[1] : res.solutions[0];
        var diff = [];
        for (i = 0; i < alt.length; i++) if (alt[i] !== truth[i] && givens.indexOf(i) < 0) diff.push(i);
        diff.sort(function (a, b) { return slots[b].len - slots[a].len || crossCount[b] - crossCount[a]; });
        add = diff.length ? diff[0] : -1;
      }
      if (add < 0) add = rank(givens)[0];
      if (add === undefined || add < 0) return null;
      givens.push(add);
    }
    return null;
  }

  // ------------------------------------------------------------------ public API
  /*
   * job: { title, words[], maxRows, maxCols, target, minWords, starters, maxGivens, attempts, seed }
   * returns: { title, rows, cols, grid, words: [{w, r, c, d, given}], stats } or { error, placed }
   */
  function generatePuzzle(job) {
    var rand = makeRng(job.seed);
    var maxLen = Math.max(job.maxRows, job.maxCols), seen = {}, words = [];
    job.words.forEach(function (w) {
      if (w.length >= 2 && w.length <= maxLen && !seen[w]) { seen[w] = true; words.push(w); }
    });
    if (words.length < job.minWords) return { error: 'too-few', placed: 0, available: words.length };

    var attempts = [];
    for (var a = 0; a < job.attempts; a++) {
      job.spread = [4, 8, 30][a % 3];
      var b = construct(shuffle(words.slice(), rand), job, rand);
      attempts.push({ b: b, score: boardScore(b, job.target) });
    }
    attempts.sort(function (p, q) { return q.score - p.score; });
    attempts = attempts.slice(0, 6).map(function (at) {
      var b2 = improve(at.b, words, job, rand, job.improveRounds || 80);
      return { b: b2, score: boardScore(b2, job.target) };
    });
    attempts.sort(function (p, q) { return q.score - p.score; });

    // Try the best layouts; if none is unique with few starters, allow a few more starters.
    var best = null;
    [job.maxGivens, job.maxGivens + 4].forEach(function (maxGivens) {
      if (best) return;
      var tried = 0;
      for (var k = 0; k < attempts.length && tried < 6; k++) {
        var at = attempts[k];
        if (at.b.placed.length < job.minWords) break;
        tried++;
        var p = crop(at.b), slots = mapSlots(p);
        var givens = makeUnique(p, slots, job.starters, maxGivens, rand);
        if (!givens) continue;
        var final = at.score - (givens.length - job.starters) * 80;
        if (!best || final > best.final) best = { final: final, p: p, slots: slots, givens: givens };
        if (givens.length === job.starters) break; // nothing better to find: fewest possible starters
      }
    });
    if (!best) {
      return { error: 'no-fit', placed: attempts.length ? attempts[0].b.placed.length : 0, available: words.length };
    }

    var out = best.p;
    best.givens.forEach(function (si) { out.words[best.slots[si].word].given = true; });
    out.words.forEach(function (w) { w.given = !!w.given; });
    out.words.sort(function (x, y) { return x.w.length - y.w.length || (x.w < y.w ? -1 : x.w > y.w ? 1 : 0); });
    var crossings = 0;
    var counts = {};
    out.words.forEach(function (w) {
      for (var i = 0; i < w.w.length; i++) {
        var cell = w.d === 'a' ? w.r * out.cols + w.c + i : (w.r + i) * out.cols + w.c;
        counts[cell] = (counts[cell] || 0) + 1;
      }
    });
    for (var cell in counts) if (counts[cell] > 1) crossings++;
    out.title = job.title || '';
    out.stats = { words: out.words.length, givens: best.givens.length, crossings: crossings, offered: words.length };
    out.verified = true;
    return out;
  }

  // Independent re-check used before export: grid runs == word list, starters match the
  // grid, and the solver still finds exactly one solution.
  function verifyPuzzle(p) {
    try {
      if (p.grid.length !== p.rows * p.cols) return false;
      var slots = mapSlots(p), givens = [];
      slots.forEach(function (s, i) { if (p.words[s.word].given) givens.push(i); });
      var res = solve(slots, p.words.map(function (w) { return w.w; }), p.rows * p.cols, givens, 2, NODE_LIMIT * 5);
      return !res.aborted && res.solutions.length === 1;
    } catch (e) { return false; }
  }

  return {
    hashString: hashString,
    makeRng: makeRng,
    slotsFromGrid: slotsFromGrid,
    solve: solve,
    mapSlots: mapSlots,
    generatePuzzle: generatePuzzle,
    verifyPuzzle: verifyPuzzle
  };
}

(function () {
  'use strict';
  window.WF = window.WF || {};
  WF.engine = FillInEngineFactory();
})();
