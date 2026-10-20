/*
 * generator.js: Samurai Sudoku engine (geometry, fill, solve, dig, grade, verify).
 *
 * Everything lives inside ONE self-contained factory function. The page calls it directly
 * (fallback + tests), and app.js turns its source text into a Blob Web Worker, because
 * file:// pages cannot start a worker from a script path. So: no references to anything
 * outside this function.
 *
 * Cell space: 21 x 21 = 441 indices (idx = row * 21 + col). 369 are active.
 * Puzzle strings are 441 chars: '.' = inactive cell, '0' = empty cell, '1'-'9' = digit.
 */
function SamuraiEngineFactory() {
  'use strict';

  var N = 21, SIZE = N * N, ALL = 0x1FF;

  // ---------------------------------------------------------------- geometry
  var GRIDS = [
    { name: 'TL', r: 0, c: 0 },
    { name: 'TR', r: 0, c: 12 },
    { name: 'C', r: 6, c: 6 },
    { name: 'BL', r: 12, c: 0 },
    { name: 'BR', r: 12, c: 12 }
  ];

  var active = new Uint8Array(SIZE);
  var units = [];        // each: array of 9 cell indices
  var unitInfo = [];     // { kind: 'row'|'col'|'box', grids: [gridIndex...] }
  var boxByKey = {};

  GRIDS.forEach(function (g, gi) {
    var i, j, k;
    for (i = 0; i < 9; i++) {
      for (j = 0; j < 9; j++) active[(g.r + i) * N + g.c + j] = 1;
    }
    for (i = 0; i < 9; i++) {
      var row = [], col = [];
      for (j = 0; j < 9; j++) {
        row.push((g.r + i) * N + g.c + j);
        col.push((g.r + j) * N + g.c + i);
      }
      units.push(row); unitInfo.push({ kind: 'row', grids: [gi] });
      units.push(col); unitInfo.push({ kind: 'col', grids: [gi] });
    }
    for (i = 0; i < 3; i++) {
      for (j = 0; j < 3; j++) {
        var top = g.r + i * 3, left = g.c + j * 3, key = top * N + left;
        if (boxByKey[key] !== undefined) { unitInfo[boxByKey[key]].grids.push(gi); continue; }
        var box = [];
        for (k = 0; k < 9; k++) box.push((top + ((k / 3) | 0)) * N + left + (k % 3));
        boxByKey[key] = units.length;
        units.push(box); unitInfo.push({ kind: 'box', grids: [gi] });
      }
    }
  });

  var UNIT_COUNT = units.length; // 131
  var activeCells = [];
  for (var ci = 0; ci < SIZE; ci++) if (active[ci]) activeCells.push(ci);
  var ACTIVE_COUNT = activeCells.length; // 369

  var cellUnits = [];
  var peers = [];
  (function () {
    for (var c = 0; c < SIZE; c++) cellUnits.push([]);
    units.forEach(function (u, ui) { u.forEach(function (c) { cellUnits[c].push(ui); }); });
    for (var c2 = 0; c2 < SIZE; c2++) {
      var seen = {}, list = [];
      cellUnits[c2].forEach(function (ui) {
        units[ui].forEach(function (p) { if (p !== c2 && !seen[p]) { seen[p] = 1; list.push(p); } });
      });
      peers.push(Int16Array.from(list));
    }
  })();

  // The 36 cells of the four shared boxes (they sit in 5 units: 2 rows, 2 columns, 1 box).
  var sharedCells = activeCells.filter(function (c) { return cellUnits[c].length === 5; });
  var gridCells = GRIDS.map(function (g) {
    var list = [];
    for (var i = 0; i < 9; i++) for (var j = 0; j < 9; j++) list.push((g.r + i) * N + g.c + j);
    return list;
  });
  var gridUnits = GRIDS.map(function (g, gi) {
    var list = [];
    unitInfo.forEach(function (info, ui) { if (info.grids.indexOf(gi) >= 0) list.push(ui); });
    return list;
  });

  // Box/line intersections for locked candidates (pointing + claiming).
  var intersections = [];
  (function () {
    units.forEach(function (box, bi) {
      if (unitInfo[bi].kind !== 'box') return;
      units.forEach(function (line, li) {
        if (unitInfo[li].kind === 'box') return;
        var inter = box.filter(function (c) { return line.indexOf(c) >= 0; });
        if (inter.length !== 3) return;
        intersections.push({
          inter: inter,
          boxRest: box.filter(function (c) { return inter.indexOf(c) < 0; }),
          lineRest: line.filter(function (c) { return inter.indexOf(c) < 0; })
        });
      });
    });
  })();

  // Bit helpers: digit d (1..9) <-> bit 1 << (d - 1).
  var POP = new Uint8Array(512), DIGIT = new Uint8Array(512);
  for (var m = 1; m < 512; m++) {
    POP[m] = POP[m >> 1] + (m & 1);
    for (var d0 = 0; d0 < 9; d0++) if (m === (1 << d0)) DIGIT[m] = d0 + 1;
  }

  function mirror(c) { return SIZE - 1 - c; } // 180-degree rotation of the 21x21 area

  // ---------------------------------------------------------------- seeded RNG
  function hashString(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    // final avalanche
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }

  function makeRng(seed) {
    var a = seed >>> 0;
    function next() { // mulberry32
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      int: function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = Math.floor(next() * (i + 1)), t = arr[i];
          arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      }
    };
  }

  // ---------------------------------------------------------------- search solver
  // Candidate-propagation solver (naked + hidden singles during propagation, MRV search).
  // Used to fill grids and to prove uniqueness while digging Expert puzzles.
  function elim(cand, c, b) {
    var v = cand[c];
    if (!(v & b)) return true;
    v &= ~b;
    cand[c] = v;
    if (v === 0) return false;
    var i, j;
    if (POP[v] === 1) {
      var ps = peers[c];
      for (i = 0; i < ps.length; i++) if (!elim(cand, ps[i], v)) return false;
    }
    var us = cellUnits[c];
    for (i = 0; i < us.length; i++) {
      var u = units[us[i]], place = -1, n = 0;
      for (j = 0; j < 9; j++) {
        if (cand[u[j]] & b) { n++; place = u[j]; if (n > 1) break; }
      }
      if (n === 0) return false;
      if (n === 1 && POP[cand[place]] > 1 && !assign(cand, place, b)) return false;
    }
    return true;
  }

  function assign(cand, c, b) {
    var others = cand[c] & ~b;
    while (others) {
      var low = others & -others;
      others ^= low;
      if (!elim(cand, c, low)) return false;
    }
    return true;
  }

  function candFromGrid(grid) {
    var cand = new Uint16Array(SIZE), i;
    for (i = 0; i < ACTIVE_COUNT; i++) cand[activeCells[i]] = ALL;
    for (i = 0; i < ACTIVE_COUNT; i++) {
      var c = activeCells[i];
      if (grid[c] > 0 && !assign(cand, c, 1 << (grid[c] - 1))) return null;
    }
    return cand;
  }

  function mrvCell(cand, cells) {
    var best = -1, bestN = 10;
    for (var i = 0; i < cells.length; i++) {
      var n = POP[cand[cells[i]]];
      if (n > 1 && n < bestN) { bestN = n; best = cells[i]; if (n === 2) break; }
    }
    return best;
  }

  function branchBits(cand, c, rng) {
    var bits = [], v = cand[c];
    while (v) { var low = v & -v; v ^= low; bits.push(low); }
    return rng ? rng.shuffle(bits) : bits;
  }

  // Counts solutions (stops at ctx.limit); the first one found goes to ctx.first.
  // Branches on shared-box cells first. Once those are fixed the five grids no longer
  // interact, so each grid is searched on its own and the counts multiply. Without this,
  // chronological backtracking thrashes between unrelated grids on low-clue puzzles.
  function search(cand, ctx) {
    if (++ctx.nodes > ctx.maxNodes) { ctx.aborted = true; return 0; }
    var best = mrvCell(cand, sharedCells), i;
    if (best >= 0) {
      var bits = branchBits(cand, best, ctx.rng), total = 0;
      for (i = 0; i < bits.length; i++) {
        var copy = cand.slice();
        if (assign(copy, best, bits[i])) {
          total += search(copy, ctx);
          if (total >= ctx.limit || ctx.aborted) return Math.min(total, ctx.limit);
        }
      }
      return total;
    }
    var combined = cand.slice(), product = 1;
    for (var g = 0; g < GRIDS.length; g++) {
      var rec = { first: null };
      var n = searchCells(cand.slice(), gridCells[g], ctx, rec);
      if (ctx.aborted || n === 0) return 0;
      product = Math.min(ctx.limit, product * n);
      for (i = 0; i < gridCells[g].length; i++) combined[gridCells[g][i]] = rec.first[gridCells[g][i]];
    }
    if (!ctx.first) ctx.first = combined;
    return product;
  }

  function searchCells(cand, cells, ctx, rec) {
    if (++ctx.nodes > ctx.maxNodes) { ctx.aborted = true; return 0; }
    var best = mrvCell(cand, cells);
    if (best < 0) {
      if (!rec.first) rec.first = cand;
      return 1;
    }
    var bits = branchBits(cand, best, ctx.rng), total = 0;
    for (var i = 0; i < bits.length; i++) {
      var copy = cand.slice();
      if (assign(copy, best, bits[i])) {
        total += searchCells(copy, cells, ctx, rec);
        if (total >= ctx.limit || ctx.aborted) return Math.min(total, ctx.limit);
      }
    }
    return total;
  }

  function candToGrid(cand) {
    var g = new Int8Array(SIZE);
    for (var i = 0; i < ACTIVE_COUNT; i++) g[activeCells[i]] = DIGIT[cand[activeCells[i]]];
    return g;
  }

  function countSolutions(grid, limit) {
    var cand = candFromGrid(grid);
    if (!cand) return { count: 0, aborted: false };
    var ctx = { limit: limit, nodes: 0, maxNodes: 5000000, rng: null, first: null, aborted: false };
    var count = search(cand, ctx);
    return { count: count, aborted: ctx.aborted, solution: ctx.first ? candToGrid(ctx.first) : null };
  }

  function fillSolution(rng) {
    for (var attempt = 0; attempt < 50; attempt++) {
      var cand = new Uint16Array(SIZE);
      for (var i = 0; i < ACTIVE_COUNT; i++) cand[activeCells[i]] = ALL;
      var ctx = { limit: 1, nodes: 0, maxNodes: 20000, rng: rng, first: null, aborted: false };
      if (search(cand, ctx) && ctx.first) return candToGrid(ctx.first);
    }
    throw new Error('Could not fill a Samurai grid');
  }

  // True if some solution differs from `solution` in at least one of `removed` cells
  // (all other givens fixed). Assumes the puzzle before removal was unique.
  function hasOtherSolution(grid, removed, solution) {
    for (var k = 0; k < removed.length; k++) {
      // Cells before k keep their solution value, cell k must differ.
      var cand = candFromGrid(grid);
      if (!cand) return false;
      var ok = true;
      for (var j = 0; j < k && ok; j++) ok = assign(cand, removed[j], 1 << (solution[removed[j]] - 1));
      if (!ok) continue;
      if (!elim(cand, removed[k], 1 << (solution[removed[k]] - 1))) continue;
      var ctx = { limit: 1, nodes: 0, maxNodes: 200000, rng: null, first: null, aborted: false };
      if (search(cand, ctx) > 0 || ctx.aborted) return true; // aborted = treat as not provably unique
    }
    return false;
  }

  // ---------------------------------------------------------------- human-style solver
  // Levels: 1 = naked + hidden singles; 2 = + locked candidates, naked pairs, hidden pairs.
  // Returns { solved, level (hardest technique used), contradiction }.
  function logicSolve(grid, maxLevel) {
    var vals = new Int8Array(SIZE), cand = new Uint16Array(SIZE), empty = 0, i, j;
    for (i = 0; i < ACTIVE_COUNT; i++) cand[activeCells[i]] = ALL;

    function place(c, d) {
      var b = 1 << (d - 1), ps = peers[c];
      vals[c] = d; cand[c] = 0;
      for (var p = 0; p < ps.length; p++) cand[ps[p]] &= ~b;
    }

    for (i = 0; i < ACTIVE_COUNT; i++) {
      var c0 = activeCells[i];
      if (grid[c0] > 0) place(c0, grid[c0]); else empty++;
    }

    var used = 1, contradiction = false;

    function nakedSingles() {
      var progress = false;
      for (var a = 0; a < ACTIVE_COUNT; a++) {
        var c = activeCells[a];
        if (vals[c]) continue;
        var v = cand[c];
        if (v === 0) { contradiction = true; return false; }
        if (POP[v] === 1) { place(c, DIGIT[v]); empty--; progress = true; }
      }
      return progress;
    }

    function hiddenSingles() {
      var progress = false;
      for (var ui = 0; ui < UNIT_COUNT; ui++) {
        var u = units[ui], once = 0, twice = 0, placed = 0, k;
        for (k = 0; k < 9; k++) {
          var c = u[k];
          if (vals[c]) { placed |= 1 << (vals[c] - 1); continue; }
          twice |= once & cand[c];
          once |= cand[c];
        }
        if ((once | placed) !== ALL) { contradiction = true; return false; }
        var hidden = once & ~twice;
        if (!hidden) continue;
        var bit = hidden & -hidden;
        for (k = 0; k < 9; k++) {
          if (!vals[u[k]] && (cand[u[k]] & bit)) { place(u[k], DIGIT[bit]); empty--; progress = true; break; }
        }
      }
      return progress;
    }

    function removeFrom(cells, mask) {
      var changed = false;
      for (var k = 0; k < cells.length; k++) {
        var c = cells[k];
        if (!vals[c] && (cand[c] & mask)) { cand[c] &= ~mask; changed = true; }
      }
      return changed;
    }

    function lockedCandidates() {
      var progress = false;
      for (var x = 0; x < intersections.length; x++) {
        var it = intersections[x], mI = 0, mB = 0, mL = 0, k;
        for (k = 0; k < 3; k++) mI |= cand[it.inter[k]];
        if (!mI) continue;
        for (k = 0; k < 6; k++) { mB |= cand[it.boxRest[k]]; mL |= cand[it.lineRest[k]]; }
        var pointing = mI & ~mB & mL;   // digit confined to the line inside this box
        var claiming = mI & ~mL & mB;   // digit confined to the box inside this line
        if (pointing && removeFrom(it.lineRest, pointing)) progress = true;
        if (claiming && removeFrom(it.boxRest, claiming)) progress = true;
      }
      return progress;
    }

    function nakedPairs() {
      var progress = false;
      for (var ui = 0; ui < UNIT_COUNT; ui++) {
        var u = units[ui];
        for (var a = 0; a < 9; a++) {
          var va = cand[u[a]];
          if (vals[u[a]] || POP[va] !== 2) continue;
          for (var b = a + 1; b < 9; b++) {
            if (vals[u[b]] || cand[u[b]] !== va) continue;
            for (var k = 0; k < 9; k++) {
              if (k === a || k === b || vals[u[k]]) continue;
              if (cand[u[k]] & va) { cand[u[k]] &= ~va; progress = true; }
            }
          }
        }
      }
      return progress;
    }

    function hiddenPairs() {
      var progress = false;
      for (var ui = 0; ui < UNIT_COUNT; ui++) {
        var u = units[ui], pos = [0, 0, 0, 0, 0, 0, 0, 0, 0], d, k;
        for (k = 0; k < 9; k++) {
          if (vals[u[k]]) continue;
          for (d = 0; d < 9; d++) if (cand[u[k]] & (1 << d)) pos[d] |= 1 << k;
        }
        for (d = 0; d < 9; d++) {
          if (POP[pos[d]] !== 2) continue;
          for (var e = d + 1; e < 9; e++) {
            if (pos[e] !== pos[d]) continue;
            var keep = (1 << d) | (1 << e);
            for (k = 0; k < 9; k++) {
              if (!(pos[d] & (1 << k))) continue;
              var c = u[k];
              if (cand[c] & ~keep) { cand[c] &= keep; progress = true; }
            }
          }
        }
      }
      return progress;
    }

    while (empty > 0 && !contradiction) {
      if (nakedSingles()) continue;
      if (contradiction) break;
      if (hiddenSingles()) continue;
      if (contradiction || maxLevel < 2) break;
      if (lockedCandidates() || nakedPairs() || hiddenPairs()) { used = 2; continue; }
      break;
    }
    return { solved: empty === 0 && !contradiction, level: used, contradiction: contradiction };
  }

  // ---------------------------------------------------------------- independent verifier
  // Deliberately a different implementation from the generator's solver: in-place digits with
  // per-unit "digits used" masks and an undo trail, instead of candidate arrays and copies.
  // Each node applies forced moves (a cell with one digit left, a unit digit with one place
  // left), then branches. A bug in one solver is unlikely to hide in the other.
  // It shares only the geometry, and uses the same shared-cells-first decomposition.
  function countSolutionsIndependent(grid, limit, maxNodes) {
    var used = new Uint16Array(UNIT_COUNT), vals = new Int8Array(SIZE), trail = [], i, k;
    for (i = 0; i < ACTIVE_COUNT; i++) {
      var c0 = activeCells[i], d0 = grid[c0];
      if (!(d0 > 0)) continue;
      var b0 = 1 << (d0 - 1), us0 = cellUnits[c0];
      for (k = 0; k < us0.length; k++) {
        if (used[us0[k]] & b0) return { count: 0, aborted: false, solution: null }; // clashing givens
        used[us0[k]] |= b0;
      }
      vals[c0] = d0;
    }
    var nodes = 0, aborted = false, solution = null;
    var ALL_SCOPE = { cells: activeCells, units: units.map(function (u, ui) { return ui; }) };
    var GRID_SCOPES = GRIDS.map(function (g, gi) { return { cells: gridCells[gi], units: gridUnits[gi] }; });

    function candOf(c) {
      var us = cellUnits[c], m = 0;
      for (var q = 0; q < us.length; q++) m |= used[us[q]];
      return ALL & ~m;
    }
    function place(c, bit) {
      var us = cellUnits[c];
      vals[c] = DIGIT[bit];
      for (var q = 0; q < us.length; q++) used[us[q]] |= bit;
      trail.push(c);
    }
    function undoTo(mark) {
      while (trail.length > mark) {
        var c = trail.pop(), bit = 1 << (vals[c] - 1), us = cellUnits[c];
        for (var q = 0; q < us.length; q++) used[us[q]] &= ~bit;
        vals[c] = 0;
      }
    }
    // Forced moves until nothing changes. False = dead end.
    function propagate(scope) {
      var changed = true;
      while (changed) {
        changed = false;
        for (var a = 0; a < scope.cells.length; a++) {
          var c = scope.cells[a];
          if (vals[c]) continue;
          var m = candOf(c);
          if (m === 0) return false;
          if (POP[m] === 1) { place(c, m); changed = true; }
        }
        for (var b = 0; b < scope.units.length; b++) {
          var ui = scope.units[b], u = units[ui], missing = ALL & ~used[ui];
          while (missing) {
            var bit = missing & -missing, spot = -1, n = 0;
            missing ^= bit;
            for (var x = 0; x < 9; x++) {
              if (!vals[u[x]] && (candOf(u[x]) & bit)) { n++; spot = u[x]; }
            }
            if (n === 0) return false;
            if (n === 1) { place(spot, bit); changed = true; }
          }
        }
      }
      return true;
    }
    function pickCell(cells) {
      var best = -1, bestN = 10;
      for (var a = 0; a < cells.length; a++) {
        if (vals[cells[a]]) continue;
        var n = POP[candOf(cells[a])];
        if (n < bestN) { bestN = n; best = cells[a]; }
      }
      return best;
    }
    // Exhaustive count inside one scope, up to `lim`. First solution's cells go to rec.buf.
    function countScope(scope, cells, lim, rec, onLeaf) {
      if (++nodes > maxNodes) { aborted = true; return 0; }
      var mark = trail.length;
      if (!propagate(scope)) { undoTo(mark); return 0; }
      var c = pickCell(cells), total = 0;
      if (c < 0) {
        total = onLeaf ? onLeaf(lim) : 1;
        if (!onLeaf && !rec.done) {
          for (var a = 0; a < scope.cells.length; a++) rec.buf[scope.cells[a]] = vals[scope.cells[a]];
          rec.done = true;
        }
        undoTo(mark);
        return total;
      }
      var m = candOf(c);
      while (m) {
        var bit = m & -m;
        m ^= bit;
        var before = trail.length;
        place(c, bit);
        total += countScope(scope, cells, lim - total, rec, onLeaf);
        undoTo(before);
        if (total >= lim || aborted) break;
      }
      undoTo(mark);
      return total;
    }
    // Leaf of the shared phase: every shared cell is fixed, so the grids are independent.
    function countGrids(lim) {
      var buf = vals.slice(), product = 1;
      for (var g = 0; g < GRID_SCOPES.length; g++) {
        var rec = { buf: buf, done: false };
        var n = countScope(GRID_SCOPES[g], GRID_SCOPES[g].cells, lim, rec, null);
        if (aborted || n === 0) return 0;
        product = Math.min(lim, product * n);
      }
      if (!solution) solution = buf;
      return product;
    }

    var count = countScope(ALL_SCOPE, sharedCells, limit, null, countGrids);
    return { count: count, aborted: aborted, solution: solution };
  }

  // Every one of the 131 units holds 1-9 exactly once, and every active cell is filled.
  function isValidSolution(grid) {
    for (var ui = 0; ui < UNIT_COUNT; ui++) {
      var seen = 0, u = units[ui];
      for (var k = 0; k < 9; k++) {
        var d = grid[u[k]];
        if (!(d >= 1 && d <= 9)) return false;
        seen |= 1 << (d - 1);
      }
      if (seen !== ALL) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- strings
  function toString441(grid) {
    var s = '';
    for (var c = 0; c < SIZE; c++) s += active[c] ? String(grid[c] || 0) : '.';
    return s;
  }
  function fromString441(str) {
    var g = new Int8Array(SIZE);
    for (var c = 0; c < SIZE; c++) {
      var ch = str.charCodeAt(c);
      g[c] = ch >= 49 && ch <= 57 ? ch - 48 : 0;
    }
    return g;
  }

  // ---------------------------------------------------------------- digging + grading
  // Tunable starting points (see spec section 3). Grading, not the clue count, decides the label.
  //   target:   stop digging once the given count reaches a random value in this range.
  //   backfill: after digging, add givens back (from the solution) up to a random value in this
  //             range, keeping only additions that leave the puzzle unsolvable by singles.
  // Measured: singles-only digging bottoms out around 90-110 givens on a Samurai, and the Hard
  // techniques only remove a few more. Hard puzzles are therefore dug to the bottom and then
  // backfilled, so they need the Hard techniques yet are not starved of givens.
  var DIFFICULTY = {
    easy: { label: 'Easy', phases: ['singles'], target: [150, 170] },
    medium: { label: 'Medium', phases: ['singles'], target: [125, 149] },
    hard: { label: 'Hard', phases: ['singles', 'hard'], backfill: [110, 125] },
    expert: { label: 'Expert', phases: ['singles', 'hard', 'unique'] }
  };
  var EASY_MIN_GIVENS = 150; // singles-only puzzles with at least this many givens grade Easy

  function removalGroups(rng, symmetric) {
    var groups = [];
    for (var i = 0; i < ACTIVE_COUNT; i++) {
      var c = activeCells[i], mc = mirror(c);
      if (!symmetric) groups.push([c]);
      else if (c < mc) groups.push([c, mc]);
      else if (c === mc) groups.push([c]);
    }
    return rng.shuffle(groups);
  }

  function accepts(phase, grid, removed, solution) {
    if (phase === 'singles') return logicSolve(grid, 1).solved;
    if (phase === 'hard') return logicSolve(grid, 2).solved;
    return !hasOtherSolution(grid, removed, solution);
  }

  // Digs in phases: each later phase only removes what the earlier (easier) solver could
  // not. So any removal made in phase 'hard' produces a puzzle singles cannot finish, and
  // any removal made in phase 'unique' produces one the Hard techniques cannot finish.
  function dig(solution, cfg, rng, symmetric) {
    var grid = solution.slice(), count = ACTIVE_COUNT;
    var target = cfg.target ? rng.int(cfg.target[0], cfg.target[1]) : 0;
    var removedInLastPhase = 0;
    for (var p = 0; p < cfg.phases.length; p++) {
      var phase = cfg.phases[p], isLast = p === cfg.phases.length - 1;
      var groups = removalGroups(rng, symmetric);
      removedInLastPhase = 0;
      for (var g = 0; g < groups.length; g++) {
        if (isLast && count <= target) break;
        var grp = groups[g];
        if (grid[grp[0]] === 0) continue;
        if (isLast && count - grp.length < target - 1) continue;
        for (var k = 0; k < grp.length; k++) grid[grp[k]] = 0;
        if (accepts(phase, grid, grp, solution)) {
          count -= grp.length;
          if (isLast) removedInLastPhase++;
        } else {
          for (k = 0; k < grp.length; k++) grid[grp[k]] = solution[grp[k]];
        }
      }
    }
    if (cfg.backfill && removedInLastPhase > 0) {
      var fillTo = rng.int(cfg.backfill[0], cfg.backfill[1]);
      var adds = removalGroups(rng, symmetric);
      for (var a = 0; a < adds.length && count < fillTo; a++) {
        var add = adds[a];
        if (grid[add[0]] !== 0 || count + add.length > cfg.backfill[1]) continue;
        for (var q = 0; q < add.length; q++) grid[add[q]] = solution[add[q]];
        if (logicSolve(grid, 1).solved) {
          for (q = 0; q < add.length; q++) grid[add[q]] = 0;
        } else {
          count += add.length;
        }
      }
    }
    return { grid: grid, givens: count, lastPhaseRemovals: removedInLastPhase };
  }

  function grade(grid) {
    var givens = 0;
    for (var i = 0; i < ACTIVE_COUNT; i++) if (grid[activeCells[i]] > 0) givens++;
    var technique;
    if (logicSolve(grid, 1).solved) technique = 'singles';
    else if (logicSolve(grid, 2).solved) technique = 'hard';
    else technique = 'expert';
    var difficulty = technique === 'singles' ? (givens >= EASY_MIN_GIVENS ? 'easy' : 'medium') : technique;
    return { difficulty: difficulty, technique: technique, givens: givens };
  }

  // Generates one verified puzzle. Deterministic for a given (seed, difficulty, symmetric).
  function generatePuzzle(opts) {
    var difficulty = opts.difficulty, cfg = DIFFICULTY[difficulty];
    if (!cfg) throw new Error('Unknown difficulty: ' + difficulty);
    var seed = opts.seed >>> 0, rng = makeRng(seed), exclude = opts.exclude || {};
    var maxAttempts = opts.maxAttempts || 60;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      var solution = fillSolution(rng);
      var dug = dig(solution, cfg, rng, !!opts.symmetric);
      if (cfg.phases.length > 1 && dug.lastPhaseRemovals === 0) continue;
      var g = grade(dug.grid);
      if (g.difficulty !== difficulty) continue;
      var givensStr = toString441(dug.grid);
      if (exclude[givensStr]) continue;
      var check = verify(givensStr, toString441(solution));
      if (!check.ok) continue;
      return {
        difficulty: difficulty,
        givens: givensStr,
        solution: toString441(solution),
        seed: seed,
        givensCount: g.givens,
        technique: g.technique,
        attempts: attempt,
        verified: true
      };
    }
    throw new Error('Could not generate a ' + difficulty + ' puzzle after ' + maxAttempts + ' attempts');
  }

  // Independent check used before export: exactly one solution, and it equals `solutionStr`.
  function verify(givensStr, solutionStr) {
    var givens = fromString441(givensStr), sol = fromString441(solutionStr);
    if (!isValidSolution(sol)) return { ok: false, reason: 'solution breaks a row, column or box' };
    for (var i = 0; i < ACTIVE_COUNT; i++) {
      var c = activeCells[i];
      if (givens[c] && givens[c] !== sol[c]) return { ok: false, reason: 'given does not match solution' };
    }
    var res = countSolutionsIndependent(givens, 2, 5000000);
    if (res.aborted) return { ok: false, reason: 'verifier gave up' };
    if (res.count !== 1) return { ok: false, reason: res.count + ' solutions' };
    for (var j = 0; j < ACTIVE_COUNT; j++) {
      if (res.solution[activeCells[j]] !== sol[activeCells[j]]) return { ok: false, reason: 'solution mismatch' };
    }
    return { ok: true };
  }

  return {
    N: N,
    SIZE: SIZE,
    ACTIVE_COUNT: ACTIVE_COUNT,
    UNIT_COUNT: UNIT_COUNT,
    GRIDS: GRIDS,
    DIFFICULTY: DIFFICULTY,
    active: active,
    units: units,
    unitInfo: unitInfo,
    hashString: hashString,
    makeRng: makeRng,
    fillSolution: fillSolution,
    logicSolve: logicSolve,
    countSolutions: countSolutions,
    countSolutionsIndependent: countSolutionsIndependent,
    isValidSolution: isValidSolution,
    toString441: toString441,
    fromString441: fromString441,
    dig: dig,
    grade: grade,
    generatePuzzle: generatePuzzle,
    verify: verify
  };
}

if (typeof window !== 'undefined') {
  window.SS = window.SS || {};
  window.SS.engine = SamuraiEngineFactory();
}
