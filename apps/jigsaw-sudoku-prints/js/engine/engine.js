/*
 * engine.js: the Jigsaw Sudoku engine. Pure computation, no DOM, no globals.
 *
 * Everything lives inside one factory function so the exact same source can run on the
 * page (for checks and the fallback path) and inside a Blob worker: workers.js turns
 * JigsawEngineFactory.toString() into the worker script, which is the only way to start a
 * worker from a page opened over file://.
 *
 * A puzzle is an N x N grid (N = 6, 8, 9 or 10) cut into N irregular regions of N cells.
 * Every row, column and region (and both main diagonals in the Diagonal variant) holds each
 * symbol once. Digits are stored as 1..N and as bit masks: digit d is bit 1 << (d - 1).
 *
 * Determinism: every random choice comes from a PRNG seeded by a string key, and there are
 * no time-based limits (only step counters), so the same key always gives the same puzzle.
 */
function JigsawEngineFactory() {
  'use strict';

  // Standard boxes of each size: the starting point the irregular regions grow from.
  var SIZES = {
    6: { bh: 2, bw: 3 },
    8: { bh: 2, bw: 4 },
    9: { bh: 3, bw: 3 },
    10: { bh: 2, bw: 5 }
  };
  var VARIANTS = { classic: false, diagonal: true };

  var POP = new Int8Array(1024);
  (function () { for (var m = 1; m < 1024; m++) POP[m] = POP[m >> 1] + (m & 1); })();
  function bit(d) { return 1 << (d - 1); }
  function digitOf(mask) { return 32 - Math.clz32(mask); } // only meaningful for single-bit masks
  function bitsOf(mask) {
    var out = [];
    for (var d = 1; mask; d++, mask >>= 1) if (mask & 1) out.push(d);
    return out;
  }

  // ------------------------------------------------------------------ seeded random
  // cyrb128-style string hash feeding an sfc32 generator.
  function hashString(str) {
    var h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (var i = 0; i < str.length; i++) {
      var k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  }

  function makeRng(key) {
    var s = hashString(String(key)), a = s[0], b = s[1], c = s[2], d = s[3];
    function next() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      var t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return t >>> 0;
    }
    for (var i = 0; i < 12; i++) next();
    var rng = {
      next: next,
      int: function (n) { return Math.floor(next() / 4294967296 * n); },
      pick: function (arr) { return arr[rng.int(arr.length)]; },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = rng.int(i + 1), tmp = arr[i];
          arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
      }
    };
    return rng;
  }

  // ------------------------------------------------------------------ difficulty levels
  // tier: the hardest technique family the logic rater may need (and must need):
  //   1 singles; 2 locked candidates, pairs; 3 triples, X-Wing; 4 quads, Swordfish, XY-Wing,
  //   XYZ-Wing. floor: Easy stops removing givens at this share of the cells so it stays
  //   friendly. fill: after removing every given it can, a level adds givens back (only
  //   ones that keep it at its tier) up to this share, so Medium and Hard read like the
  //   bestselling books (about 27 and 24 givens on 9 x 9); Extreme stays minimal.
  var LEVELS = {
    easy: { tier: 1, floor: 0.46, fill: 0 },
    medium: { tier: 2, floor: 0, fill: 0.34 },
    hard: { tier: 3, floor: 0, fill: 0.29 },
    extreme: { tier: 4, floor: 0, fill: 0 }
  };
  // Levels each size offers. 6 x 6 grids are too small to need exactly Hard-tier logic
  // often, so their Hard accepts tier 3 or 4 and there is no Extreme. The Diagonal variant
  // needs 8 x 8 or larger: small diagonal jigsaw grids rarely have a solution.
  var SIZE_LEVELS = {
    6: ['easy', 'medium', 'hard'],
    8: ['easy', 'medium', 'hard', 'extreme'],
    9: ['easy', 'medium', 'hard', 'extreme'],
    10: ['easy', 'medium', 'hard', 'extreme']
  };
  var DIAGONAL_SIZES = [8, 9, 10];

  // The rules a level follows at a size: dig with tiers up to `tier`, accept minTier..tier.
  function levelRules(n, level) {
    var P = LEVELS[level];
    if (!P || SIZE_LEVELS[n].indexOf(level) < 0) return null;
    if (n === 6 && level === 'hard') return { tier: 4, minTier: 3, floor: P.floor, fill: P.fill };
    return { tier: P.tier, minTier: P.tier, floor: P.floor, fill: P.fill };
  }
  var MAX_ATTEMPTS = 120;     // fresh grids per puzzle before reporting failure
  var REGION_TRIES = 40;      // region layouts per attempt before giving up on it
  var SEARCH_CAP = 60000;     // nodes per brute-force search (hitting it counts as ambiguous)

  // ------------------------------------------------------------------ geometry
  var GEO = {};
  function geo(n) {
    if (GEO[n]) return GEO[n];
    var N2 = n * n, row = [], col = [], nb = [];
    for (var i = 0; i < N2; i++) {
      var r = (i / n) | 0, c = i % n, list = [];
      row.push(r); col.push(c);
      if (r > 0) list.push(i - n);
      if (c > 0) list.push(i - 1);
      if (c < n - 1) list.push(i + 1);
      if (r < n - 1) list.push(i + n);
      nb.push(list);
    }
    GEO[n] = { n: n, N2: N2, row: row, col: col, nb: nb, all: (1 << n) - 1 };
    return GEO[n];
  }

  // The constraint structure of one puzzle: rows, columns, regions (+ diagonals).
  function makeBoard(n, regionOf, diagonal) {
    var g = geo(n), N2 = g.N2, houses = [], i, h, k;
    for (i = 0; i < n; i++) {
      var rw = [], cl = [];
      for (k = 0; k < n; k++) { rw.push(i * n + k); cl.push(k * n + i); }
      houses.push(rw);
      houses.push(cl);
    }
    // rows are even indices, columns odd; regions follow from 2n.
    var reg = [];
    for (i = 0; i < n; i++) reg.push([]);
    for (i = 0; i < N2; i++) reg[regionOf[i]].push(i);
    houses = houses.concat(reg);
    if (diagonal) {
      var d1 = [], d2 = [];
      for (i = 0; i < n; i++) { d1.push(i * n + i); d2.push(i * n + (n - 1 - i)); }
      houses.push(d1, d2);
    }
    var H = houses.length, housesOf = [], inHouse = [];
    for (i = 0; i < N2; i++) housesOf.push([]);
    for (h = 0; h < H; h++) {
      var mark = new Uint8Array(N2);
      houses[h].forEach(function (c) { housesOf[c].push(h); mark[c] = 1; });
      inHouse.push(mark);
    }
    var peerOf = new Uint8Array(N2 * N2), peers = [];
    for (i = 0; i < N2; i++) {
      var p = [];
      housesOf[i].forEach(function (hh) {
        houses[hh].forEach(function (c) {
          if (c !== i && !peerOf[i * N2 + c]) { peerOf[i * N2 + c] = 1; p.push(c); }
        });
      });
      peers.push(p);
    }
    // Ordered pairs of houses that overlap without one containing the other: where locked
    // candidates (pointing / claiming, generalised to irregular regions) can act.
    var pairs = [];
    for (var a = 0; a < H; a++) {
      for (var b = 0; b < H; b++) {
        if (a === b) continue;
        var over = 0;
        houses[a].forEach(function (c) { over += inHouse[b][c]; });
        if (over > 0 && over < houses[a].length) pairs.push([a, b]);
      }
    }
    return {
      n: n, N2: N2, all: g.all, diagonal: !!diagonal, regionOf: regionOf,
      houses: houses, housesOf: housesOf, inHouse: inHouse, peers: peers, peerOf: peerOf, pairs: pairs
    };
  }

  // ------------------------------------------------------------------ regions
  function standardRegions(n) {
    var s = SIZES[n], g = geo(n), out = new Int8Array(g.N2), perRow = n / s.bw;
    for (var i = 0; i < g.N2; i++) out[i] = ((g.row[i] / s.bh) | 0) * perRow + ((g.col[i] / s.bw) | 0);
    return out;
  }

  function connected(n, reg, id) {
    var g = geo(n), start = -1, total = 0, i;
    for (i = 0; i < g.N2; i++) if (reg[i] === id) { total++; if (start < 0) start = i; }
    if (start < 0) return false;
    var seen = new Uint8Array(g.N2), stack = [start], count = 0;
    seen[start] = 1;
    while (stack.length) {
      var c = stack.pop();
      count++;
      var nb = g.nb[c];
      for (var k = 0; k < nb.length; k++) {
        var q = nb[k];
        if (!seen[q] && reg[q] === id) { seen[q] = 1; stack.push(q); }
      }
    }
    return count === total;
  }

  // Random irregular regions: start from the standard boxes and trade cells between
  // neighbouring regions many times, keeping every region connected and of size n.
  function randomRegions(n, rng) {
    var g = geo(n), N2 = g.N2, reg = standardRegions(n);
    var target = N2 * 6, done = 0;
    for (var t = 0; t < target * 6 && done < target; t++) {
      var a = rng.int(N2), A = reg[a];
      var out = g.nb[a].filter(function (q) { return reg[q] !== A; });
      if (!out.length) continue;
      var B = reg[rng.pick(out)];
      // A cell of B (other than a) that touches A once a has left: it moves to A.
      var back = [];
      for (var i = 0; i < N2; i++) {
        if (reg[i] !== B) continue;
        if (g.nb[i].some(function (q) { return q !== a && reg[q] === A; })) back.push(i);
      }
      if (!back.length) continue;
      var d = rng.pick(back);
      reg[a] = B; reg[d] = A;
      if (connected(n, reg, A) && connected(n, reg, B)) done++;
      else { reg[a] = A; reg[d] = B; }
    }
    return regionsOk(n, reg) ? reg : null;
  }

  // Every region spans at least two rows and two columns (none is a straight line, so no
  // region is a copy of a row or column), and most of them differ from the standard boxes.
  function regionsOk(n, reg) {
    var g = geo(n), std = standardRegions(n), sameAsBox = 0;
    for (var id = 0; id < n; id++) {
      var rows = 0, cols = 0, cells = [];
      for (var i = 0; i < g.N2; i++) {
        if (reg[i] !== id) continue;
        cells.push(i);
        rows |= 1 << g.row[i];
        cols |= 1 << g.col[i];
      }
      if (cells.length !== n || POP[rows] < 2 || POP[cols] < 2) return false;
      var box = std[cells[0]];
      if (cells.every(function (c) { return std[c] === box; })) sameAsBox++;
    }
    return sameAsBox <= 1;
  }

  // ------------------------------------------------------------------ brute-force search
  // Backtracking with most-constrained-cell choice and hidden singles. grid: Int8Array of
  // digits (0 = empty). Stops after `limit` solutions or `cap` nodes. With an rng the digit
  // order is shuffled (used to make random solution grids).
  function search(B, grid, limit, rng, cap) {
    var n = B.n, N2 = B.N2, all = B.all, H = B.houses.length, houses = B.houses, housesOf = B.housesOf;
    var used = new Int32Array(H), g = new Int8Array(N2), i, k;
    for (i = 0; i < N2; i++) {
      var v = grid[i];
      if (!v) continue;
      var bv = bit(v), hs = housesOf[i];
      for (k = 0; k < hs.length; k++) {
        if (used[hs[k]] & bv) return { count: 0, solution: null, capped: false };
        used[hs[k]] |= bv;
      }
      g[i] = v;
    }
    var count = 0, first = null, nodes = 0, capped = false;
    var candStack = [];
    for (i = 0; i <= N2; i++) candStack.push(new Int16Array(N2));

    function set(cell, d) {
      var b = bit(d), hs = housesOf[cell];
      g[cell] = d;
      for (var j = 0; j < hs.length; j++) used[hs[j]] |= b;
    }
    function unset(cell, d) {
      var b = ~bit(d), hs = housesOf[cell];
      g[cell] = 0;
      for (var j = 0; j < hs.length; j++) used[hs[j]] &= b;
    }

    function rec(depth) {
      if (count >= limit || capped) return;
      if (++nodes > cap) { capped = true; return; }
      var cand = candStack[depth], best = -1, bestP = 99, c, m, p, j;
      for (c = 0; c < N2; c++) {
        if (g[c]) continue;
        m = all;
        var hs = housesOf[c];
        for (j = 0; j < hs.length; j++) m &= ~used[hs[j]];
        cand[c] = m;
        p = POP[m];
        if (p === 0) return;
        if (p < bestP) { bestP = p; best = c; }
      }
      if (best < 0) {
        count++;
        if (!first) first = Int8Array.from(g);
        return;
      }
      var forcedCell = -1, forcedDigit = 0;
      if (bestP > 1) {
        for (var h = 0; h < H && forcedCell < 0; h++) {
          var need = all & ~used[h];
          if (!need) continue;
          var once = 0, twice = 0, cells = houses[h];
          for (j = 0; j < cells.length; j++) {
            c = cells[j];
            if (g[c]) continue;
            twice |= once & cand[c];
            once |= cand[c];
          }
          if (need & ~once) return; // a digit with nowhere to go
          var lone = once & ~twice & need;
          if (lone) {
            forcedDigit = digitOf(lone & -lone);
            var fb = bit(forcedDigit);
            for (j = 0; j < cells.length; j++) {
              if (!g[cells[j]] && (cand[cells[j]] & fb)) { forcedCell = cells[j]; break; }
            }
          }
        }
      }
      if (forcedCell >= 0) {
        set(forcedCell, forcedDigit);
        rec(depth + 1);
        unset(forcedCell, forcedDigit);
        return;
      }
      var digits = bitsOf(cand[best]);
      if (rng) rng.shuffle(digits);
      for (j = 0; j < digits.length; j++) {
        set(best, digits[j]);
        rec(depth + 1);
        unset(best, digits[j]);
        if (count >= limit || capped) return;
      }
    }
    rec(0);
    return { count: count, solution: first, capped: capped };
  }

  // Number of solutions, up to `limit`. A search that hits its node cap counts as `limit`
  // (ambiguous), so a puzzle is only ever accepted on a complete proof of uniqueness.
  function countSolutions(B, grid, limit) {
    var r = search(B, grid, limit || 2, null, SEARCH_CAP * 4);
    return r.capped ? (limit || 2) : r.count;
  }

  function randomSolution(B, rng) {
    var r = search(B, new Int8Array(B.N2), 1, rng, SEARCH_CAP);
    return r.count ? r.solution : null;
  }

  // ------------------------------------------------------------------ logic rater
  // Solves like a person: always the simplest technique that makes progress. Returns the
  // hardest tier it needed. With maxTier it gives up rather than use harder techniques.
  function rate(B, grid, maxTier) {
    maxTier = maxTier || 4;
    var n = B.n, N2 = B.N2, all = B.all, houses = B.houses, H = houses.length, peers = B.peers, peerOf = B.peerOf;
    var val = new Int8Array(N2), cand = new Int16Array(N2), broken = false, open = N2, tier = 1, steps = 0, i;
    for (i = 0; i < N2; i++) cand[i] = all;

    function place(c, d) {
      var b = bit(d);
      if (val[c] || !(cand[c] & b)) { broken = true; return; }
      val[c] = d; cand[c] = 0; open--;
      var p = peers[c];
      for (var k = 0; k < p.length; k++) {
        var q = p[k];
        if (!val[q]) {
          cand[q] &= ~b;
          if (!cand[q]) broken = true;
        } else if (val[q] === d) broken = true;
      }
    }
    function elim(c, mask) {
      if (val[c] || !(cand[c] & mask)) return false;
      cand[c] &= ~mask;
      if (!cand[c]) broken = true;
      return true;
    }
    for (i = 0; i < N2 && !broken; i++) if (grid[i]) place(i, grid[i]);

    function placedIn(h) {
      var m = 0, cells = houses[h];
      for (var k = 0; k < cells.length; k++) if (val[cells[k]]) m |= bit(val[cells[k]]);
      return m;
    }
    function openOf(h) {
      var out = [], cells = houses[h];
      for (var k = 0; k < cells.length; k++) if (!val[cells[k]]) out.push(cells[k]);
      return out;
    }

    // Tier 1: naked and hidden singles.
    function singles() {
      var progress = false;
      for (var c = 0; c < N2 && !broken; c++) {
        if (!val[c] && POP[cand[c]] === 1) { place(c, digitOf(cand[c])); progress = true; }
      }
      for (var h = 0; h < H && !broken; h++) {
        var need = all & ~placedIn(h), once = 0, twice = 0, cells = houses[h], k;
        if (!need) continue;
        for (k = 0; k < cells.length; k++) {
          var q = cells[k];
          if (val[q]) continue;
          twice |= once & cand[q];
          once |= cand[q];
        }
        if (need & ~once) { broken = true; return false; }
        var lone = once & ~twice & need;
        while (lone && !broken) {
          var b = lone & -lone;
          lone &= ~b;
          for (k = 0; k < cells.length; k++) {
            if (!val[cells[k]] && (cand[cells[k]] & b)) { place(cells[k], digitOf(b)); progress = true; break; }
          }
        }
      }
      return progress;
    }

    // Tier 2: when a digit's spots in one house all lie in a second house, the digit is
    // gone from the rest of the second house (box-line and region-line interactions).
    function locked() {
      var progress = false, pairs = B.pairs;
      for (var p = 0; p < pairs.length; p++) {
        var A = houses[pairs[p][0]], inB = B.inHouse[pairs[p][1]], inA = B.inHouse[pairs[p][0]];
        var free = 0, k;
        for (k = 0; k < A.length; k++) if (!val[A[k]]) free |= cand[A[k]];
        while (free) {
          var b = free & -free;
          free &= ~b;
          var inside = true;
          for (k = 0; k < A.length; k++) {
            if (!val[A[k]] && (cand[A[k]] & b) && !inB[A[k]]) { inside = false; break; }
          }
          if (!inside) continue;
          var Bc = houses[pairs[p][1]];
          for (k = 0; k < Bc.length; k++) if (!inA[Bc[k]] && elim(Bc[k], b)) progress = true;
          if (progress) return true;
        }
      }
      return false;
    }

    function combos(list, size, fn) {
      var pick = [];
      (function rec(from) {
        if (pick.length === size) return fn(pick);
        for (var k = from; k < list.length; k++) {
          pick.push(list[k]);
          if (rec(k + 1)) return true;
          pick.pop();
        }
        return false;
      })(0);
    }

    // Naked subsets: k cells of a house holding only k digits between them.
    function nakedSubset(size) {
      for (var h = 0; h < H; h++) {
        var cells = openOf(h).filter(function (c) { return POP[cand[c]] <= size; });
        var allOpen = openOf(h);
        if (allOpen.length <= size || cells.length < size) continue;
        var hit = false;
        combos(cells, size, function (pick) {
          var m = 0;
          for (var k = 0; k < pick.length; k++) m |= cand[pick[k]];
          if (POP[m] !== size) return false;
          allOpen.forEach(function (c) { if (pick.indexOf(c) < 0 && elim(c, m)) hit = true; });
          return hit;
        });
        if (hit) return true;
      }
      return false;
    }

    // Hidden subsets: k digits of a house that fit only in the same k cells.
    function hiddenSubset(size) {
      for (var h = 0; h < H; h++) {
        var cells = openOf(h);
        if (cells.length <= size) continue;
        var digits = bitsOf(all & ~placedIn(h)).filter(function (d) {
          var b = bit(d), spots = 0;
          cells.forEach(function (c) { if (cand[c] & b) spots++; });
          return spots >= 1 && spots <= size;
        });
        var hit = false;
        combos(digits, size, function (pick) {
          var m = 0, spots = [];
          pick.forEach(function (d) { m |= bit(d); });
          cells.forEach(function (c) { if (cand[c] & m) spots.push(c); });
          if (spots.length !== size) return false;
          spots.forEach(function (c) { if (elim(c, all & ~m)) hit = true; });
          return hit;
        });
        if (hit) return true;
      }
      return false;
    }

    // Fish on rows/columns: X-Wing (2) and Swordfish (3).
    function fish(size) {
      for (var d = 1; d <= n; d++) {
        var b = bit(d);
        for (var orient = 0; orient < 2; orient++) {
          var lines = [];
          for (var L = 0; L < n; L++) {
            var m = 0;
            for (var k = 0; k < n; k++) {
              var c = orient ? k * n + L : L * n + k;
              if (!val[c] && (cand[c] & b)) m |= 1 << k;
            }
            if (POP[m] >= 2 && POP[m] <= size) lines.push({ L: L, m: m });
          }
          if (lines.length < size) continue;
          var hit = false;
          combos(lines, size, function (pick) {
            var cover = 0, base = 0;
            pick.forEach(function (x) { cover |= x.m; base |= 1 << x.L; });
            if (POP[cover] !== size) return false;
            for (var k2 = 0; k2 < n; k2++) {
              if (!(cover & (1 << k2))) continue;
              for (var L2 = 0; L2 < n; L2++) {
                if (base & (1 << L2)) continue;
                var c2 = orient ? k2 * n + L2 : L2 * n + k2;
                if (elim(c2, b)) hit = true;
              }
            }
            return hit;
          });
          if (hit) return true;
        }
      }
      return false;
    }

    function seesAll(c, list) {
      for (var k = 0; k < list.length; k++) if (c === list[k] || !peerOf[c * N2 + list[k]]) return false;
      return true;
    }

    // XY-Wing: pivot {a,b}, pincers {a,c} and {b,c} that the pivot sees; c leaves every
    // cell that sees both pincers.
    function xyWing() {
      for (var p = 0; p < N2; p++) {
        if (val[p] || POP[cand[p]] !== 2) continue;
        var pc = cand[p];
        var wings = peers[p].filter(function (q) { return !val[q] && POP[cand[q]] === 2 && POP[cand[q] & pc] === 1; });
        for (var x = 0; x < wings.length; x++) {
          for (var y = x + 1; y < wings.length; y++) {
            var q1 = cand[wings[x]], q2 = cand[wings[y]];
            if (q1 === q2) continue;
            var z = q1 & q2 & ~pc;
            if (POP[z] !== 1 || (q1 | q2) !== (pc | z)) continue;
            var hit = false, pair = [wings[x], wings[y]];
            for (var c = 0; c < N2; c++) if (!val[c] && (cand[c] & z) && seesAll(c, pair) && elim(c, z)) hit = true;
            if (hit) return true;
          }
        }
      }
      return false;
    }

    // XYZ-Wing: pivot {a,b,c}, pincers {a,c} and {b,c}; c leaves cells that see all three.
    function xyzWing() {
      for (var p = 0; p < N2; p++) {
        if (val[p] || POP[cand[p]] !== 3) continue;
        var pc = cand[p];
        var wings = peers[p].filter(function (q) { return !val[q] && POP[cand[q]] === 2 && (cand[q] & ~pc) === 0; });
        for (var x = 0; x < wings.length; x++) {
          for (var y = x + 1; y < wings.length; y++) {
            var q1 = cand[wings[x]], q2 = cand[wings[y]];
            if ((q1 | q2) !== pc) continue;
            var z = q1 & q2;
            if (POP[z] !== 1) continue;
            var hit = false, trio = [p, wings[x], wings[y]];
            for (var c = 0; c < N2; c++) if (!val[c] && (cand[c] & z) && seesAll(c, trio) && elim(c, z)) hit = true;
            if (hit) return true;
          }
        }
      }
      return false;
    }

    var TECHNIQUES = [
      { tier: 2, fn: locked },
      { tier: 2, fn: function () { return nakedSubset(2); } },
      { tier: 2, fn: function () { return hiddenSubset(2); } },
      { tier: 3, fn: function () { return nakedSubset(3); } },
      { tier: 3, fn: function () { return hiddenSubset(3); } },
      { tier: 3, fn: function () { return fish(2); } },
      { tier: 4, fn: function () { return nakedSubset(4); } },
      { tier: 4, fn: function () { return hiddenSubset(4); } },
      { tier: 4, fn: function () { return fish(3); } },
      { tier: 4, fn: xyWing },
      { tier: 4, fn: xyzWing }
    ];

    while (!broken && open > 0) {
      if (singles()) continue;
      if (broken) break;
      var progress = false;
      for (var t = 0; t < TECHNIQUES.length; t++) {
        if (TECHNIQUES[t].tier > maxTier) break;
        if (TECHNIQUES[t].fn()) {
          progress = true;
          steps++;
          if (TECHNIQUES[t].tier > tier) tier = TECHNIQUES[t].tier;
          break;
        }
      }
      if (!progress) break;
    }
    return { solved: !broken && open === 0, broken: broken, tier: tier, steps: steps, open: open };
  }

  // ------------------------------------------------------------------ puzzle generation
  function boardFor(n, variant, rng) {
    for (var t = 0; t < REGION_TRIES; t++) {
      var reg = randomRegions(n, rng);
      if (reg) return makeBoard(n, reg, VARIANTS[variant]);
    }
    return null;
  }

  // Removes givens in random order, keeping each removal only while the puzzle stays
  // solvable by logic at or below the target tier. A puzzle solved purely by sound
  // deductions has exactly one solution; generate() confirms that independently.
  function dig(B, sol, P, rng) {
    var N2 = B.N2, givens = Int8Array.from(sol), clues = N2;
    var floor = Math.round(P.floor * N2);
    var order = [];
    for (var i = 0; i < N2; i++) order.push(i);
    rng.shuffle(order);
    for (var k = 0; k < order.length; k++) {
      if (clues <= floor) break;
      var c = order[k], d = givens[c];
      givens[c] = 0;
      if (rate(B, givens, P.tier).solved) clues--;
      else givens[c] = d;
    }
    return givens;
  }

  // Adds givens back, in random order, while the puzzle keeps needing its level's logic.
  function refill(B, sol, givens, P, rng, rating) {
    var N2 = B.N2, target = Math.round(P.fill * N2), clues = 0, open = [], i;
    for (i = 0; i < N2; i++) if (givens[i]) clues++; else open.push(i);
    rng.shuffle(open);
    for (var k = 0; k < open.length && clues < target; k++) {
      var c = open[k];
      givens[c] = sol[c];
      var r = rate(B, givens, P.tier);
      if (r.solved && r.tier >= P.minTier) { clues++; rating = r; } else givens[c] = 0;
    }
    return rating;
  }

  // One puzzle for a book slot. Same arguments, same puzzle, on any machine.
  function generate(seed, size, variant, level, ordinal, salt) {
    var n = +size;
    if (!SIZES[n]) throw new Error('Unknown size ' + size);
    if (!(variant in VARIANTS)) throw new Error('Unknown variant ' + variant);
    if (VARIANTS[variant] && DIAGONAL_SIZES.indexOf(n) < 0) throw new Error('Diagonal needs 8 x 8 or larger');
    var P = levelRules(n, level);
    if (!P) throw new Error('Level ' + level + ' is not offered at ' + n + ' x ' + n);
    for (var attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      var rng = makeRng(['js1', seed, n, variant, level, ordinal, salt || 0, attempt].join('/'));
      var B = boardFor(n, variant, rng);
      if (!B) continue;
      var sol = randomSolution(B, rng);
      if (!sol) continue;
      var givens = dig(B, sol, P, rng);
      var r = rate(B, givens, P.tier);
      if (!r.solved || r.tier < P.minTier) continue;
      if (P.fill) r = refill(B, sol, givens, P, rng, r);
      if (countSolutions(B, givens, 2) !== 1) continue;
      return toWire(B, sol, givens, variant, level, r, { ordinal: ordinal, salt: salt || 0, attempt: attempt });
    }
    return null;
  }

  // ------------------------------------------------------------------ wire format
  var CH = '0123456789abcdefghijklmnopqrstuvwxyz';

  // Plain-data form (structured-clone and JSON friendly) used everywhere outside the engine.
  function toWire(B, sol, givens, variant, level, rating, meta) {
    var regions = '', solution = '', g = '', clues = 0;
    for (var i = 0; i < B.N2; i++) {
      regions += CH[B.regionOf[i]];
      solution += CH[sol[i]];
      g += givens[i] ? CH[givens[i]] : '.';
      if (givens[i]) clues++;
    }
    return {
      size: B.n,
      variant: variant,
      level: level,
      ordinal: meta.ordinal,
      salt: meta.salt,
      attempt: meta.attempt,
      regions: regions,
      solution: solution,
      givens: g,
      clues: clues,
      tier: rating.tier,
      steps: rating.steps,
      key: B.n + variant + '|' + regions + '|' + g
    };
  }

  function fromWire(w) {
    var n = w.size, N2 = n * n, reg = new Int8Array(N2), sol = new Int8Array(N2), giv = new Int8Array(N2);
    for (var i = 0; i < N2; i++) {
      reg[i] = CH.indexOf(w.regions[i]);
      sol[i] = CH.indexOf(w.solution[i]);
      giv[i] = w.givens[i] === '.' ? 0 : CH.indexOf(w.givens[i]);
    }
    return { board: makeBoard(n, reg, VARIANTS[w.variant]), solution: sol, givens: giv };
  }

  // What is printed for digit d (1..n): 1-9, and 0-9 on 10 x 10 grids.
  function symbol(n, d) { return String(n === 10 ? d - 1 : d); }

  // Full check of a wire puzzle. Returns a list of problems (empty = valid).
  // opts.structureOnly skips the (slower) solution count, for re-checking on the page a
  // puzzle that a worker has already counted.
  function validate(w, opts) {
    var problems = [];
    if (!w || !SIZES[w.size]) return ['bad size'];
    if (!(w.variant in VARIANTS)) return ['bad variant'];
    var n = w.size, N2 = n * n, i;
    if (typeof w.solution !== 'string' || w.solution.length !== N2) return ['bad solution string'];
    if (typeof w.regions !== 'string' || w.regions.length !== N2) return ['bad region map'];
    if (typeof w.givens !== 'string' || w.givens.length !== N2) return ['bad givens string'];
    var reg = new Int8Array(N2), sizes = new Array(n).fill(0);
    for (i = 0; i < N2; i++) {
      var r = CH.indexOf(w.regions[i]);
      if (!(r >= 0 && r < n)) return ['cell ' + i + ' has no region'];
      reg[i] = r; sizes[r]++;
    }
    for (var id = 0; id < n; id++) {
      if (sizes[id] !== n) problems.push('region ' + id + ' has ' + sizes[id] + ' cells');
      else if (!connected(n, reg, id)) problems.push('region ' + id + ' is not connected');
    }
    if (problems.length) return problems;
    var pz = fromWire(w), B = pz.board, all = B.all;
    for (i = 0; i < N2; i++) {
      if (!(pz.solution[i] >= 1 && pz.solution[i] <= n)) problems.push('cell ' + i + ' has no digit');
      if (pz.givens[i] && pz.givens[i] !== pz.solution[i]) problems.push('given at cell ' + i + ' differs from the solution');
    }
    B.houses.forEach(function (cells, h) {
      var m = 0;
      cells.forEach(function (c) { m |= bit(pz.solution[c]); });
      if (m !== all) problems.push('house ' + h + ' does not hold every digit');
    });
    if (!problems.length && !(opts && opts.structureOnly)) {
      var count = countSolutions(B, pz.givens, 2);
      if (count !== 1) problems.push(count === 0 ? 'no solution' : 'more than one solution');
    }
    return problems;
  }

  return {
    SIZES: SIZES,
    VARIANTS: VARIANTS,
    LEVELS: LEVELS,
    SIZE_LEVELS: SIZE_LEVELS,
    DIAGONAL_SIZES: DIAGONAL_SIZES,
    levelRules: levelRules,
    makeRng: makeRng,
    hashString: hashString,
    generate: generate,
    validate: validate,
    fromWire: fromWire,
    makeBoard: makeBoard,
    countSolutions: countSolutions,
    rate: rate,
    symbol: symbol,
    // Building blocks, exposed for the test and tuning scripts.
    internals: { randomRegions: randomRegions, randomSolution: randomSolution, dig: dig, standardRegions: standardRegions }
  };
}

(function (root) {
  root.KS = root.KS || {};
  root.KS.engineFactory = JigsawEngineFactory;
  root.KS.engine = JigsawEngineFactory();
})(typeof self !== 'undefined' ? self : this);
