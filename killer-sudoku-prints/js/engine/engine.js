/*
 * engine.js: the Killer Sudoku engine. Pure computation, no DOM, no globals.
 *
 * Everything lives inside one factory function so the exact same source can run on the
 * page (for checks and the fallback path) and inside a Blob worker: workers.js turns
 * KillerEngineFactory.toString() into the worker script, which is the only way to start a
 * worker from a page opened over file://.
 *
 * Determinism: every random choice comes from a PRNG seeded by a string key, and there are
 * no time-based limits (only step counters), so the same key always gives the same puzzle.
 *
 * Digits are stored as bit masks: digit d (1..9) is bit 1 << (d - 1).
 */
function KillerEngineFactory() {
  'use strict';

  // ------------------------------------------------------------------ geometry
  var ROW = [], COL = [], BOX = [];
  var HOUSES = [];      // 27 houses: rows 0-8, columns 9-17, boxes 18-26
  var HOUSES_OF = [];   // the three houses of each cell
  var PEERS = [];       // the 20 cells sharing a house with each cell
  var NEIGHBOURS = [];  // orthogonal neighbours
  var POP = new Int8Array(512);
  var MASK_SUM = new Int8Array(512);
  var COMBOS = [];      // COMBOS[size][sum] = digit masks of `size` distinct digits adding to `sum`
  var ALL = 511;

  (function init() {
    var i, h, m, d;
    for (i = 0; i < 27; i++) HOUSES.push([]);
    for (i = 0; i < 81; i++) {
      var r = (i / 9) | 0, c = i % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      ROW.push(r); COL.push(c); BOX.push(b);
      HOUSES[r].push(i); HOUSES[9 + c].push(i); HOUSES[18 + b].push(i);
      HOUSES_OF.push([r, 9 + c, 18 + b]);
      var nb = [];
      if (r > 0) nb.push(i - 9);
      if (c > 0) nb.push(i - 1);
      if (c < 8) nb.push(i + 1);
      if (r < 8) nb.push(i + 9);
      NEIGHBOURS.push(nb);
    }
    for (i = 0; i < 81; i++) {
      var p = [];
      for (var j = 0; j < 81; j++) {
        if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) p.push(j);
      }
      PEERS.push(p);
    }
    for (m = 0; m < 512; m++) {
      var pc = 0, s = 0;
      for (d = 1; d <= 9; d++) if (m & (1 << (d - 1))) { pc++; s += d; }
      POP[m] = pc; MASK_SUM[m] = s;
    }
    for (h = 0; h <= 9; h++) {
      COMBOS.push([]);
      for (var t = 0; t <= 45; t++) COMBOS[h].push([]);
    }
    for (m = 1; m < 512; m++) COMBOS[POP[m]][MASK_SUM[m]].push(m);
  })();

  function bit(d) { return 1 << (d - 1); }
  function digitOf(mask) { return 32 - Math.clz32(mask); } // only meaningful for single-bit masks

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
      },
      weighted: function (pairs) { // [[value, weight], ...]
        var total = 0, k;
        for (k = 0; k < pairs.length; k++) total += pairs[k][1];
        var x = rng.int(total);
        for (k = 0; k < pairs.length; k++) {
          x -= pairs[k][1];
          if (x < 0) return pairs[k][0];
        }
        return pairs[pairs.length - 1][0];
      }
    };
    return rng;
  }

  // ------------------------------------------------------------------ difficulty levels
  // Cage sizes per level ([size, weight]). Easy uses small cages and some single cells, Hard
  // uses larger cages and never a single cell. The final level is decided by the logic
  // rater below, not by these numbers.
  var LEVELS = {
    easy: { tier: 1, minSize: 1, maxSize: 4, polish: 0, sizes: [[1, 9], [2, 42], [3, 34], [4, 15]] },
    medium: { tier: 2, minSize: 2, maxSize: 5, polish: 4, sizes: [[2, 30], [3, 38], [4, 24], [5, 8]] },
    hard: { tier: 3, minSize: 2, maxSize: 6, polish: 10, sizes: [[2, 8], [3, 28], [4, 32], [5, 20], [6, 12]] }
  };
  var MAX_ATTEMPTS = 80;    // fresh grids per puzzle before reporting failure
  var MAX_REPAIRS = 24;     // cage edits per grid while steering to unique + target level

  // ------------------------------------------------------------------ solution grid
  function randomSolution(rng) {
    var grid = new Int8Array(81);
    var rowM = new Uint16Array(9), colM = new Uint16Array(9), boxM = new Uint16Array(9);
    var orders = [];
    for (var i = 0; i < 81; i++) orders.push(rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    var steps = 0;
    function fill(i) {
      if (i === 81) return true;
      if (++steps > 200000) return false;
      var r = ROW[i], c = COL[i], b = BOX[i], used = rowM[r] | colM[c] | boxM[b];
      var order = orders[i];
      for (var k = 0; k < 9; k++) {
        var d = order[k], m = bit(d);
        if (used & m) continue;
        grid[i] = d; rowM[r] |= m; colM[c] |= m; boxM[b] |= m;
        if (fill(i + 1)) return true;
        rowM[r] &= ~m; colM[c] &= ~m; boxM[b] &= ~m;
      }
      grid[i] = 0;
      return false;
    }
    return fill(0) ? grid : null;
  }

  // ------------------------------------------------------------------ cages
  // A puzzle is { cageOf: Int8Array(81), cages: [{ cells: [...], sum }] } plus its solution.

  function freeNeighbours(cell, cageOf) {
    var n = 0, nb = NEIGHBOURS[cell];
    for (var k = 0; k < nb.length; k++) if (cageOf[nb[k]] < 0) n++;
    return n;
  }

  // Grows cages over the solved grid. Each cage holds distinct digits. Cells are seeded in
  // "most cornered first" order so few cells get stranded as leftovers.
  function partition(sol, P, rng) {
    var cageOf = new Int8Array(81).fill(-1), cages = [], left = 81;
    while (left > 0) {
      var best = 9, seeds = [];
      for (var i = 0; i < 81; i++) {
        if (cageOf[i] >= 0) continue;
        var f = freeNeighbours(i, cageOf);
        if (f < best) { best = f; seeds = [i]; } else if (f === best) seeds.push(i);
      }
      var start = rng.pick(seeds), target = rng.weighted(P.sizes), id = cages.length;
      var cells = [start], mask = bit(sol[start]);
      cageOf[start] = id;
      while (cells.length < target) {
        var frontier = [];
        for (var k = 0; k < cells.length; k++) {
          var nb = NEIGHBOURS[cells[k]];
          for (var q = 0; q < nb.length; q++) {
            var n = nb[q];
            if (cageOf[n] < 0 && !(mask & bit(sol[n])) && frontier.indexOf(n) < 0) frontier.push(n);
          }
        }
        if (!frontier.length) break;
        var add = rng.pick(frontier);
        cells.push(add); cageOf[add] = id; mask |= bit(sol[add]);
      }
      cages.push(cells);
      left -= cells.length;
    }
    if (!absorbSmallCages(sol, cageOf, cages, P, rng)) return null;
    return buildPuzzle(sol, cages);
  }

  function cageMask(sol, cells) {
    var m = 0;
    for (var k = 0; k < cells.length; k++) m |= bit(sol[cells[k]]);
    return m;
  }

  // Merges cages below the level's minimum size into a neighbouring cage.
  function absorbSmallCages(sol, cageOf, cages, P, rng) {
    for (var id = 0; id < cages.length; id++) {
      var cells = cages[id];
      if (!cells || cells.length >= P.minSize) continue;
      var options = adjacentCages(cells, cageOf, id).filter(function (o) {
        var other = cages[o];
        return other && other.length + cells.length <= P.maxSize + 1 &&
          !(cageMask(sol, other) & cageMask(sol, cells));
      });
      if (!options.length) return false;
      var into = rng.pick(options);
      for (var k = 0; k < cells.length; k++) { cages[into].push(cells[k]); cageOf[cells[k]] = into; }
      cages[id] = null;
    }
    return true;
  }

  function adjacentCages(cells, cageOf, self) {
    var out = [];
    for (var k = 0; k < cells.length; k++) {
      var nb = NEIGHBOURS[cells[k]];
      for (var q = 0; q < nb.length; q++) {
        var o = cageOf[nb[q]];
        if (o !== self && o >= 0 && out.indexOf(o) < 0) out.push(o);
      }
    }
    return out;
  }

  // Canonical form: cages ordered by their first cell (reading order), cells sorted.
  function buildPuzzle(sol, cageLists) {
    var lists = cageLists.filter(Boolean).map(function (cells) {
      return cells.slice().sort(function (a, b) { return a - b; });
    });
    lists.sort(function (a, b) { return a[0] - b[0]; });
    var cageOf = new Int8Array(81), cages = [];
    lists.forEach(function (cells, id) {
      var sum = 0;
      cells.forEach(function (c) { cageOf[c] = id; sum += sol[c]; });
      cages.push({ cells: cells, sum: sum });
    });
    return { solution: sol, cageOf: cageOf, cages: cages };
  }

  function cageListsOf(pz) { return pz.cages.map(function (c) { return c.cells.slice(); }); }

  function isConnected(cells) {
    if (!cells.length) return false;
    var seen = [cells[0]], stack = [cells[0]];
    while (stack.length) {
      var nb = NEIGHBOURS[stack.pop()];
      for (var q = 0; q < nb.length; q++) {
        if (cells.indexOf(nb[q]) >= 0 && seen.indexOf(nb[q]) < 0) { seen.push(nb[q]); stack.push(nb[q]); }
      }
    }
    return seen.length === cells.length;
  }

  // Splits the cage holding `cell` into two connected parts (each at least minSize).
  // Splitting adds information, so it is used to make a puzzle unique or easier.
  // `marked` cells (where a second solution differs) never join `cell`'s part, so that
  // part's sum can no longer hide the swap.
  function splitCage(pz, cell, P, rng, marked) {
    var id = pz.cageOf[cell], cells = pz.cages[id].cells;
    var minSize = Math.max(1, P.minSize);
    if (cells.length < minSize * 2) return null;
    for (var tries = 0; tries < 12; tries++) {
      var size = minSize + rng.int(cells.length - minSize * 2 + 1);
      var part = [cell];
      while (part.length < size) {
        var frontier = [];
        part.forEach(function (c) {
          NEIGHBOURS[c].forEach(function (n) {
            if (cells.indexOf(n) >= 0 && part.indexOf(n) < 0 && frontier.indexOf(n) < 0 &&
                !(marked && marked.indexOf(n) >= 0)) frontier.push(n);
          });
        });
        if (!frontier.length) break;
        part.push(rng.pick(frontier));
      }
      if (part.length !== size) continue;
      var rest = cells.filter(function (c) { return part.indexOf(c) < 0; });
      if (!isConnected(rest)) continue;
      var lists = cageListsOf(pz);
      lists[id] = part;
      lists.push(rest);
      return buildPuzzle(pz.solution, lists);
    }
    return null;
  }

  // Re-grows the cages around `cell` with a new shape: first its cage plus one neighbour
  // cage, then its cage plus all neighbours. No new cage gets more than one `marked` cell.
  function reshapeAround(pz, cell, P, rng, marked) {
    var id = pz.cageOf[cell];
    var others = adjacentCages(pz.cages[id].cells, pz.cageOf, id);
    if (!others.length) return null;
    for (var tries = 0; tries < 16; tries++) {
      var take = tries < 8 ? [rng.pick(others)] : others;
      var region = pz.cages[id].cells.slice();
      take.forEach(function (o) { region = region.concat(pz.cages[o].cells); });
      var pieces = growInside(region, pz.solution, P, rng, marked || [cell]);
      if (!pieces) continue;
      var lists = cageListsOf(pz).filter(function (_, k) { return k !== id && take.indexOf(k) < 0; });
      return buildPuzzle(pz.solution, lists.concat(pieces));
    }
    return null;
  }

  function growInside(region, sol, P, rng, marked) {
    var free = region.slice(), pieces = [];
    var marks = function (cells) {
      var n = 0;
      for (var k = 0; k < cells.length; k++) if (marked.indexOf(cells[k]) >= 0) n++;
      return n;
    };
    while (free.length) {
      var start = rng.pick(free), target = rng.weighted(P.sizes);
      var cells = [start], mask = bit(sol[start]), hasMark = marks(cells) > 0;
      free.splice(free.indexOf(start), 1);
      while (cells.length < target) {
        var frontier = [];
        cells.forEach(function (c) {
          NEIGHBOURS[c].forEach(function (n) {
            if (free.indexOf(n) >= 0 && !(mask & bit(sol[n])) && frontier.indexOf(n) < 0 &&
                !(hasMark && marked.indexOf(n) >= 0)) frontier.push(n);
          });
        });
        if (!frontier.length) break;
        var add = rng.pick(frontier);
        cells.push(add); mask |= bit(sol[add]); free.splice(free.indexOf(add), 1);
        if (marked.indexOf(add) >= 0) hasMark = true;
      }
      pieces.push(cells);
    }
    // Fold pieces below the minimum size into a touching piece, keeping the rules.
    for (var i = 0; i < pieces.length; i++) {
      var small = pieces[i];
      if (!small || small.length >= P.minSize) continue;
      var homes = [];
      pieces.forEach(function (other, j) {
        if (!other || j === i || other.length + small.length > P.maxSize + 1) return;
        if (cageMask(sol, other) & cageMask(sol, small)) return;
        if (marks(other) + marks(small) > 1) return;
        var touches = small.some(function (c) {
          return NEIGHBOURS[c].some(function (n) { return other.indexOf(n) >= 0; });
        });
        if (touches) homes.push(j);
      });
      if (!homes.length) return null;
      var into = rng.pick(homes);
      pieces[into] = pieces[into].concat(small);
      pieces[i] = null;
    }
    return pieces.filter(Boolean);
  }

  // Joins two neighbouring cages (distinct digits, within the size limit). Merging removes
  // information, so it is used to make a puzzle harder.
  function mergeCages(pz, P, rng) {
    var pairs = [];
    pz.cages.forEach(function (cage, id) {
      adjacentCages(cage.cells, pz.cageOf, id).forEach(function (o) {
        if (o < id) return;
        var other = pz.cages[o];
        if (cage.cells.length + other.cells.length > P.maxSize) return;
        if (cageMask(pz.solution, cage.cells) & cageMask(pz.solution, other.cells)) return;
        pairs.push([id, o]);
      });
    });
    if (!pairs.length) return null;
    // Prefer absorbing the smallest cages, so harder puzzles lose their give-away pairs first.
    var sizeOf = function (p) { return Math.min(pz.cages[p[0]].cells.length, pz.cages[p[1]].cells.length); };
    var smallest = Math.min.apply(null, pairs.map(sizeOf));
    var pair = rng.pick(pairs.filter(function (p) { return sizeOf(p) === smallest; }));
    var lists = cageListsOf(pz);
    lists[pair[0]] = lists[pair[0]].concat(lists[pair[1]]);
    lists[pair[1]] = null;
    return buildPuzzle(pz.solution, lists);
  }

  // ------------------------------------------------------------------ brute-force solver
  // Counts solutions (up to `limit`) using candidate masks, singles and cage-sum pruning.
  // This is the independent uniqueness check: no puzzle is accepted unless it returns 1.
  // `start` (optional) seeds the search with candidates already narrowed by sound logic.
  function countSolutions(pz, limit, found, start) {
    var cages = pz.cages, nC = cages.length;
    var cand = start ? Uint16Array.from(start) : new Uint16Array(81).fill(ALL), val = new Int8Array(81);
    var count = 0, nodes = 0;
    // Houses that contain each cage completely: its required digits cannot appear elsewhere there.
    var cageHouses = cages.map(function (cage) {
      return [0, 1, 2].map(function (hk) { return HOUSES_OF[cage.cells[0]][hk]; }).filter(function (h, hk) {
        return cage.cells.every(function (c) { return HOUSES_OF[c][hk] === h; });
      });
    });

    function assign(cd, vl, cell, d) {
      var m = bit(d);
      if (!(cd[cell] & m)) return false;
      cd[cell] = m; vl[cell] = d;
      var p = PEERS[cell];
      for (var k = 0; k < 20; k++) {
        var q = p[k];
        if (cd[q] & m) {
          if (vl[q]) return false;
          cd[q] &= ~m;
          if (!cd[q]) return false;
        }
      }
      var mates = cages[pz.cageOf[cell]].cells;
      for (k = 0; k < mates.length; k++) {
        q = mates[k];
        if (q !== cell && (cd[q] & m)) {
          if (vl[q]) return false;
          cd[q] &= ~m;
          if (!cd[q]) return false;
        }
      }
      return true;
    }

    function propagate(cd, vl) {
      var changed = true;
      while (changed) {
        changed = false;
        for (var i = 0; i < 81; i++) {
          if (!vl[i] && POP[cd[i]] === 1) {
            if (!assign(cd, vl, i, digitOf(cd[i]))) return false;
            changed = true;
          }
        }
        for (var h = 0; h < 27; h++) {
          var cells = HOUSES[h], once = 0, twice = 0, placed = 0;
          for (var k = 0; k < 9; k++) {
            var c = cells[k];
            if (vl[c]) { placed |= bit(vl[c]); continue; }
            twice |= once & cd[c]; once |= cd[c];
          }
          if ((once | placed) !== ALL) return false;
          var single = once & ~twice & ~placed;
          while (single) {
            var m = single & -single;
            single &= ~m;
            for (k = 0; k < 9; k++) {
              c = cells[k];
              if (!vl[c] && (cd[c] & m)) {
                if (!assign(cd, vl, c, digitOf(m))) return false;
                changed = true;
                break;
              }
            }
          }
        }
        for (var g = 0; g < nC; g++) {
          var cc = cages[g].cells, rem = cages[g].sum, used = 0, open = 0, union = 0;
          for (k = 0; k < cc.length; k++) {
            c = cc[k];
            if (vl[c]) { rem -= vl[c]; used |= bit(vl[c]); } else { open++; union |= cd[c]; }
          }
          if (!open) { if (rem !== 0) return false; continue; }
          if (rem <= 0 || rem > 45) return false;
          var combos = COMBOS[open][rem], allowed = 0, required = ALL;
          for (k = 0; k < combos.length; k++) {
            var cm = combos[k];
            if ((cm & used) || (cm & ~union)) continue;
            var fits = true;
            for (var q = 0; q < cc.length && fits; q++) if (!vl[cc[q]] && !(cd[cc[q]] & cm)) fits = false;
            if (!fits) continue;
            allowed |= cm; required &= cm;
          }
          if (!allowed) return false;
          for (k = 0; k < cc.length; k++) {
            c = cc[k];
            if (vl[c]) continue;
            var nm = cd[c] & allowed;
            if (nm !== cd[c]) {
              if (!nm) return false;
              cd[c] = nm; changed = true;
            }
          }
          // A digit every combination needs is locked out of the rest of any house holding the cage.
          var lock = required, hs = cageHouses[g];
          for (var hi = 0; hi < hs.length && lock; hi++) {
            var hc = HOUSES[hs[hi]];
            for (k = 0; k < 9; k++) {
              c = hc[k];
              if (pz.cageOf[c] === g || !(cd[c] & lock)) continue;
              if (vl[c]) return false;
              cd[c] &= ~lock; changed = true;
              if (!cd[c]) return false;
            }
          }
          // A digit every combination needs, with one possible cell left, goes there.
          while (required) {
            var rm = required & -required, spot = -1, spots = 0;
            required &= ~rm;
            for (k = 0; k < cc.length; k++) {
              c = cc[k];
              if (!vl[c] && (cd[c] & rm)) { spots++; spot = c; }
            }
            if (!spots) return false;
            if (spots === 1 && POP[cd[spot]] > 1) {
              if (!assign(cd, vl, spot, digitOf(rm))) return false;
              changed = true;
            }
          }
        }
      }
      return true;
    }

    function search(cd, vl) {
      if (count >= limit || ++nodes > 400000) return;
      if (!propagate(cd, vl)) return;
      var best = -1, bestPop = 10;
      for (var i = 0; i < 81; i++) {
        if (vl[i]) continue;
        var p = POP[cd[i]];
        if (p < bestPop) { bestPop = p; best = i; if (p === 2) break; }
      }
      if (best < 0) {
        count++;
        if (found) found.push(Int8Array.from(vl));
        return;
      }
      var m = cd[best];
      while (m && count < limit) {
        var b = m & -m;
        m &= ~b;
        var cd2 = Uint16Array.from(cd), vl2 = Int8Array.from(vl);
        if (assign(cd2, vl2, best, digitOf(b))) search(cd2, vl2);
      }
    }

    search(cand, val);
    // Hitting the node cap means "not proven unique"; report it as ambiguous.
    if (nodes > 400000 && count < limit) return limit;
    return count;
  }

  // ------------------------------------------------------------------ logic rater
  // Solves like a person would, trying the simplest technique first and only moving up a
  // tier when nothing simpler works. The puzzle's level is the highest tier it needed.
  //   Tier 1 (Easy):   singles, cage combinations, a cage's digit locked into one house.
  //   Tier 2 (Medium): rule of 45 on one row/column/box, locked candidates, naked/hidden pairs
  //                    and naked triples.
  //   Tier 3 (Hard):   rule of 45 across several rows, columns or boxes, X-wings.
  // If it gets stuck, the puzzle would need guessing and is rejected.

  // Static "rule of 45" sum constraints for a set of regions (unions of whole houses).
  function sumConstraints(pz, regions, tier) {
    var out = [], seen = {};
    regions.forEach(function (region) {
      var inR = new Uint8Array(81), total = 45 * region.houses;
      region.cells.forEach(function (c) { inR[c] = 1; });
      var inside = 0, touching = 0, innies = [], outies = [];
      pz.cages.forEach(function (cage) {
        var n = 0;
        cage.cells.forEach(function (c) { n += inR[c]; });
        if (!n) return;
        touching += cage.sum;
        if (n === cage.cells.length) inside += cage.sum;
        else {
          cage.cells.forEach(function (c) { (inR[c] ? innies : outies).push(c); });
        }
      });
      add(innies, total - inside);
      add(outies, touching - total);
    });
    function add(cells, sum) {
      if (!cells.length || cells.length > 9) return;
      cells.sort(function (a, b) { return a - b; });
      var key = cells.join(',') + '=' + sum;
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ id: 's' + tier + '.' + out.length, cells: cells, sum: sum, tier: tier });
    }
    return out;
  }

  function regionOfHouses(list) {
    var cells = [];
    list.forEach(function (h) { cells = cells.concat(HOUSES[h]); });
    return { cells: cells, houses: list.length };
  }

  var SINGLE_REGIONS = [], MULTI_REGIONS = [];
  (function () {
    var h, k, n;
    for (h = 0; h < 27; h++) SINGLE_REGIONS.push(regionOfHouses([h]));
    // 2 to 4 adjacent rows / columns (larger unions are the complements of these).
    for (n = 2; n <= 4; n++) {
      for (k = 0; k + n <= 9; k++) {
        var rows = [], cols = [];
        for (h = 0; h < n; h++) { rows.push(k + h); cols.push(9 + k + h); }
        MULTI_REGIONS.push(regionOfHouses(rows), regionOfHouses(cols));
      }
    }
    // Two neighbouring boxes, and 2 x 2 blocks of boxes.
    for (var b = 0; b < 9; b++) {
      if (b % 3 < 2) MULTI_REGIONS.push(regionOfHouses([18 + b, 19 + b]));
      if (b < 6) MULTI_REGIONS.push(regionOfHouses([18 + b, 21 + b]));
      if (b % 3 < 2 && b < 6) MULTI_REGIONS.push(regionOfHouses([18 + b, 19 + b, 21 + b, 22 + b]));
    }
  })();

  function rate(pz, opts) {
    opts = opts || {};
    var cages = pz.cages;
    var cand = new Uint16Array(81).fill(ALL), val = new Int8Array(81);
    var solvedCount = 0, broken = false;
    var used = [0, 0, 0, 0];
    var constraints2 = sumConstraints(pz, SINGLE_REGIONS, 2);
    var constraints3 = sumConstraints(pz, MULTI_REGIONS, 3);
    // Memo of checks that found nothing, keyed by the candidates they looked at. Candidates
    // only ever shrink, so the same key means the same (empty) result.
    var quiet = {};
    function stateKey(cells) {
      var k = '';
      for (var i = 0; i < cells.length; i++) k += cand[cells[i]] + ',';
      return k;
    }
    var sees = function (a, b) {
      return ROW[a] === ROW[b] || COL[a] === COL[b] || BOX[a] === BOX[b] || pz.cageOf[a] === pz.cageOf[b];
    };

    function place(cell, d) {
      var m = bit(d);
      if (!(cand[cell] & m)) { broken = true; return; }
      cand[cell] = m; val[cell] = d; solvedCount++;
      PEERS[cell].forEach(function (q) { if (!val[q]) cand[q] &= ~m; if (!cand[q]) broken = true; });
      cages[pz.cageOf[cell]].cells.forEach(function (q) {
        if (q !== cell && !val[q]) { cand[q] &= ~m; if (!cand[q]) broken = true; }
      });
    }
    function eliminate(cell, mask) {
      if (val[cell] || !(cand[cell] & mask)) return false;
      cand[cell] &= ~mask;
      if (!cand[cell]) broken = true;
      return true;
    }

    // --- tier 1
    function nakedSingle() {
      for (var i = 0; i < 81; i++) {
        if (!val[i] && POP[cand[i]] === 1) { place(i, digitOf(cand[i])); return true; }
      }
      return false;
    }
    function hiddenSingle() {
      for (var h = 0; h < 27; h++) {
        var cells = HOUSES[h];
        for (var d = 1; d <= 9; d++) {
          var m = bit(d), spot = -1, n = 0;
          for (var k = 0; k < 9; k++) {
            var c = cells[k];
            if (val[c] === d) { n = -1; break; }
            if (!val[c] && (cand[c] & m)) { n++; spot = c; }
          }
          if (n === 1) { place(spot, d); return true; }
        }
      }
      return false;
    }
    // Cage combinations: keep only digits from sums that can still be made, and lock a digit
    // every combination needs into the house its possible cells share.
    function cageCombos() {
      var progress = false;
      for (var g = 0; g < cages.length; g++) {
        var cc = cages[g].cells, rem = cages[g].sum, usedM = 0, open = [];
        var key = stateKey(cc);
        if (quiet['c' + g] === key) continue;
        cc.forEach(function (c) {
          if (val[c]) { rem -= val[c]; usedM |= bit(val[c]); } else open.push(c);
        });
        if (!open.length) continue;
        var allowed = 0, required = ALL, perCell = open.map(function () { return 0; });
        var combos = COMBOS[open.length][rem] || [];
        for (var k = 0; k < combos.length; k++) {
          var cm = combos[k];
          if (cm & usedM) continue;
          var fit = matchDigits(open, cm);
          if (!fit) continue;
          allowed |= cm; required &= cm;
          for (var j = 0; j < open.length; j++) perCell[j] |= fit[j];
        }
        if (!allowed) { broken = true; return false; }
        for (j = 0; j < open.length; j++) {
          if (eliminate(open[j], cand[open[j]] & ~perCell[j])) progress = true;
        }
        var req = required;
        while (req) {
          var m = req & -req;
          req &= ~m;
          var spots = open.filter(function (c) { return cand[c] & m; });
          if (!spots.length) continue;
          for (var hk = 0; hk < 3; hk++) {
            var h = HOUSES_OF[spots[0]][hk];
            if (!spots.every(function (c) { return HOUSES_OF[c][hk] === h; })) continue;
            HOUSES[h].forEach(function (q) {
              if (pz.cageOf[q] !== g && eliminate(q, m)) progress = true;
            });
          }
        }
        if (progress) return true;
        quiet['c' + g] = key;
      }
      return progress;
    }
    // For a digit set, the digits each open cell can take in some complete assignment.
    function matchDigits(cells, mask) {
      var n = cells.length, res = new Array(n), ok = false;
      for (var i = 0; i < n; i++) { res[i] = 0; if (!(cand[cells[i]] & mask)) return null; }
      var taken = 0, pick = new Array(n), full = false;
      (function rec(i) {
        if (i === n) {
          ok = true;
          full = true;
          for (var j = 0; j < n; j++) {
            res[j] |= pick[j];
            if (res[j] !== (cand[cells[j]] & mask)) full = false;
          }
          return;
        }
        var m = cand[cells[i]] & mask & ~taken;
        while (m && !full) {
          var b = m & -m;
          m &= ~b;
          pick[i] = b; taken |= b;
          rec(i + 1);
          taken &= ~b;
        }
      })(0);
      return ok ? res : null;
    }

    // --- tier 2
    function lockedCandidates() {
      for (var b = 0; b < 9; b++) {
        var box = HOUSES[18 + b];
        for (var d = 1; d <= 9; d++) {
          var m = bit(d), spots = box.filter(function (c) { return !val[c] && (cand[c] & m); });
          if (spots.length < 2) continue;
          var r = ROW[spots[0]], c = COL[spots[0]], progress = false;
          if (spots.every(function (s) { return ROW[s] === r; })) {
            HOUSES[r].forEach(function (q) { if (BOX[q] !== b && eliminate(q, m)) progress = true; });
          }
          if (spots.every(function (s) { return COL[s] === c; })) {
            HOUSES[9 + c].forEach(function (q) { if (BOX[q] !== b && eliminate(q, m)) progress = true; });
          }
          if (progress) return true;
        }
      }
      for (var h = 0; h < 18; h++) {
        var line = HOUSES[h];
        for (d = 1; d <= 9; d++) {
          m = bit(d);
          spots = line.filter(function (c) { return !val[c] && (cand[c] & m); });
          if (spots.length < 2) continue;
          var bx = BOX[spots[0]];
          if (!spots.every(function (s) { return BOX[s] === bx; })) continue;
          progress = false;
          HOUSES[18 + bx].forEach(function (q) { if (line.indexOf(q) < 0 && eliminate(q, m)) progress = true; });
          if (progress) return true;
        }
      }
      return false;
    }
    function nakedSubsets(maxSize) {
      for (var h = 0; h < 27; h++) {
        var open = HOUSES[h].filter(function (c) { return !val[c]; });
        for (var size = 2; size <= maxSize; size++) {
          if (open.length <= size) break;
          if (subsetSearch(open, size, 0, 0, [])) return true;
        }
      }
      return false;
      function subsetSearch(open, size, from, mask, chosen) {
        if (chosen.length === size) {
          if (POP[mask] !== size) return false;
          var progress = false;
          open.forEach(function (c) { if (chosen.indexOf(c) < 0 && eliminate(c, mask)) progress = true; });
          return progress;
        }
        for (var i = from; i < open.length; i++) {
          var nm = mask | cand[open[i]];
          if (POP[nm] > size) continue;
          chosen.push(open[i]);
          if (subsetSearch(open, size, i + 1, nm, chosen)) return true;
          chosen.pop();
        }
        return false;
      }
    }
    function hiddenPairs() {
      for (var h = 0; h < 27; h++) {
        var open = HOUSES[h].filter(function (c) { return !val[c]; });
        var where = [];
        for (var d = 1; d <= 9; d++) {
          where.push(open.filter(function (c) { return cand[c] & bit(d); }));
        }
        for (var a = 0; a < 9; a++) {
          if (where[a].length !== 2) continue;
          for (var b = a + 1; b < 9; b++) {
            if (where[b].length !== 2 || where[b][0] !== where[a][0] || where[b][1] !== where[a][1]) continue;
            var keep = bit(a + 1) | bit(b + 1), progress = false;
            where[a].forEach(function (c) { if (eliminate(c, cand[c] & ~keep)) progress = true; });
            if (progress) return true;
          }
        }
      }
      return false;
    }
    // A rule-of-45 constraint: the open cells must add up to what is left of the sum.
    function applySums(list, maxOpen) {
      for (var i = 0; i < list.length; i++) {
        var con = list[i], rem = con.sum, open = [];
        con.cells.forEach(function (c) { if (val[c]) rem -= val[c]; else open.push(c); });
        if (!open.length || open.length > maxOpen) continue;
        var key = stateKey(con.cells);
        if (quiet[con.id] === key) continue;
        quiet[con.id] = key;
        var support = sumSupport(open, rem);
        if (!support) continue;
        var progress = false;
        for (var k = 0; k < open.length; k++) {
          if (eliminate(open[k], cand[open[k]] & ~support[k])) progress = true;
        }
        // A digit every assignment uses, whose possible cells share a house, is locked there.
        if (!progress) progress = lockRequired(open, support.required, con.cells);
        if (progress) return true;
      }
      return false;
    }
    function lockRequired(open, required, owners) {
      var progress = false;
      while (required) {
        var m = required & -required;
        required &= ~m;
        var spots = open.filter(function (c) { return cand[c] & m; });
        if (!spots.length) continue;
        for (var hk = 0; hk < 3; hk++) {
          var h = HOUSES_OF[spots[0]][hk];
          if (!spots.every(function (c) { return HOUSES_OF[c][hk] === h; })) continue;
          HOUSES[h].forEach(function (q) {
            if (owners.indexOf(q) < 0 && eliminate(q, m)) progress = true;
          });
        }
      }
      return progress;
    }
    // Combination clash: cages lying inside one house cannot share digits, so a combination
    // that leaves no disjoint choice for the other cages there is impossible.
    function houseCombos() {
      for (var h = 0; h < 27; h++) {
        var house = HOUSES[h], placed = 0, groups = [], seenCage = {};
        var key = stateKey(house);
        if (quiet['h' + h] === key) continue;
        quiet['h' + h] = key;
        house.forEach(function (c) { if (val[c]) placed |= bit(val[c]); });
        for (var k = 0; k < 9; k++) {
          var g = pz.cageOf[house[k]];
          if (seenCage[g]) continue;
          seenCage[g] = 1;
          var cc = cages[g].cells;
          if (!cc.every(function (c) { return HOUSES_OF[c].indexOf(h) >= 0; })) continue;
          var rem = cages[g].sum, usedM = 0, open = [];
          cc.forEach(function (c) { if (val[c]) { rem -= val[c]; usedM |= bit(val[c]); } else open.push(c); });
          if (!open.length) continue;
          var options = [];
          (COMBOS[open.length][rem] || []).forEach(function (cm) {
            if (cm & (usedM | placed)) return;
            var fit = matchDigits(open, cm);
            if (fit) options.push({ mask: cm, fit: fit, ok: false });
          });
          if (!options.length) { broken = true; return false; }
          groups.push({ open: open, options: options });
        }
        if (groups.length < 2) continue;
        var work = 0, tooBig = false;
        (function rec(i, taken, chosen) {
          if (tooBig || ++work > 20000) { tooBig = true; return; }
          if (i === groups.length) { chosen.forEach(function (o) { o.ok = true; }); return; }
          groups[i].options.forEach(function (o) {
            if (o.mask & taken) return;
            chosen.push(o);
            rec(i + 1, taken | o.mask, chosen);
            chosen.pop();
          });
        })(0, 0, []);
        if (tooBig) continue;
        var progress = false;
        groups.forEach(function (gr) {
          var allow = gr.open.map(function () { return 0; });
          gr.options.forEach(function (o) {
            if (o.ok) o.fit.forEach(function (f, j) { allow[j] |= f; });
          });
          gr.open.forEach(function (c, j) { if (eliminate(c, cand[c] & ~allow[j])) progress = true; });
        });
        if (progress) return true;
      }
      return false;
    }
    // Digits each cell can take in some assignment hitting `target`, respecting cells that
    // see each other, plus the digits every assignment uses (`.required`). Returns null if
    // the search is too large to be a sensible human step.
    function sumSupport(input, target) {
      // Fewest candidates first: the sum bounds then prune most of the tree.
      var order = input.map(function (c, k) { return k; });
      order.sort(function (a, b) { return POP[cand[input[a]]] - POP[cand[input[b]]] || a - b; });
      var cells = order.map(function (k) { return input[k]; });
      var n = cells.length, found = new Array(n).fill(0), pick = new Array(n), work = 0;
      var required = ALL, full = false;
      var conflict = [];
      for (var i = 0; i < n; i++) {
        conflict.push([]);
        for (var j = 0; j < i; j++) if (sees(cells[i], cells[j])) conflict[i].push(j);
      }
      var lo = [], hi = [];
      lo[n] = 0; hi[n] = 0;
      for (i = n - 1; i >= 0; i--) {
        var cm = cand[cells[i]];
        lo[i] = lo[i + 1] + (31 - Math.clz32(cm & -cm)) + 1;
        hi[i] = hi[i + 1] + digitOf(cm);
      }
      var tooBig = false;
      (function rec(i, left) {
        if (tooBig || full) return;
        if (++work > 12000) { tooBig = true; return; }
        if (i === n) {
          if (left !== 0) return;
          var usedDigits = 0, complete = true;
          for (var j = 0; j < n; j++) {
            found[j] |= bit(pick[j]); usedDigits |= bit(pick[j]);
            if (found[j] !== cand[cells[j]]) complete = false;
          }
          required &= usedDigits;
          full = complete && !required; // nothing left to eliminate or lock
          return;
        }
        if (left < lo[i] || left > hi[i]) return;
        var m = cand[cells[i]];
        while (m) {
          var b = m & -m;
          m &= ~b;
          var d = digitOf(b), clash = false;
          for (var k = 0; k < conflict[i].length; k++) if (pick[conflict[i][k]] === d) { clash = true; break; }
          if (clash) continue;
          pick[i] = d;
          rec(i + 1, left - d);
        }
      })(0, target);
      if (tooBig) return null;
      var support = new Array(n);
      order.forEach(function (k, j) { support[k] = found[j]; });
      support.required = found[0] ? required : 0;
      return support;
    }

    // --- tier 3
    function xWing() {
      for (var d = 1; d <= 9; d++) {
        var m = bit(d);
        for (var dir = 0; dir < 2; dir++) {
          var base = dir ? 9 : 0, cover = dir ? 0 : 9, lines = [];
          for (var h = 0; h < 9; h++) {
            var spots = HOUSES[base + h].filter(function (c) { return !val[c] && (cand[c] & m); });
            lines.push(spots.length === 2 ? spots.map(function (c) { return dir ? ROW[c] : COL[c]; }) : null);
          }
          for (var a = 0; a < 9; a++) {
            if (!lines[a]) continue;
            for (var b = a + 1; b < 9; b++) {
              if (!lines[b] || lines[b][0] !== lines[a][0] || lines[b][1] !== lines[a][1]) continue;
              var progress = false;
              lines[a].forEach(function (x) {
                HOUSES[cover + x].forEach(function (q) {
                  var line = dir ? COL[q] : ROW[q];
                  if (line !== a && line !== b && eliminate(q, m)) progress = true;
                });
              });
              if (progress) return true;
            }
          }
        }
      }
      return false;
    }

    var STEPS = [
      { tier: 1, run: nakedSingle },
      { tier: 1, run: hiddenSingle },
      { tier: 1, run: cageCombos },
      { tier: 2, run: function () { return applySums(constraints2, 4); } },
      { tier: 2, run: lockedCandidates },
      { tier: 2, run: hiddenPairs },
      { tier: 2, run: function () { return nakedSubsets(3); } },
      { tier: 3, run: function () { return applySums(constraints2, 6); } },
      { tier: 3, run: function () { return applySums(constraints3, 6); } },
      { tier: 3, run: houseCombos },
      { tier: 3, run: xWing }
    ];

    var maxTier = 1, steps = 0, limitTier = opts.maxTier || 3;
    while (solvedCount < 81 && !broken) {
      var progress = false;
      for (var s = 0; s < STEPS.length; s++) {
        if (STEPS[s].tier > limitTier) break;
        if (STEPS[s].run()) {
          progress = true; steps++;
          used[STEPS[s].tier]++;
          if (STEPS[s].tier > maxTier) maxTier = STEPS[s].tier;
          break;
        }
      }
      if (!progress) break;
    }
    var solved = solvedCount === 81 && !broken;
    if (solved) {
      for (var i = 0; i < 81; i++) if (val[i] !== pz.solution[i]) { solved = false; broken = true; }
    }
    return {
      solved: solved,
      broken: broken,
      tier: solved ? maxTier : 4,
      steps: steps,
      used: used.slice(1),
      open: solved ? [] : openCells(),
      cand: solved ? null : cand
    };
    function openCells() {
      var out = [];
      for (var i = 0; i < 81; i++) if (!val[i]) out.push(i);
      return out;
    }
  }

  // ------------------------------------------------------------------ puzzle generation
  function signature(pz) {
    var ids = [], sums = [];
    for (var i = 0; i < 81; i++) ids.push(pz.cageOf[i]);
    pz.cages.forEach(function (c) { sums.push(c.sum); });
    return ids.join('.') + '|' + sums.join('.');
  }

  // Steers one grid towards a puzzle the logic rater solves at exactly the target tier:
  // split cages where it gets stuck (more information), merge cages when it is too easy.
  // A puzzle solved purely by sound deductions has exactly one solution; the brute-force
  // count in generate() then confirms that independently.
  function steer(pz, P, rng) {
    var fallback = null; // last version that was solvable but too easy, to merge from again
    for (var step = 0; step < MAX_REPAIRS && pz; step++) {
      var r = rate(pz);
      if (r.broken) return null;
      if (r.solved && r.tier === P.tier) return polish(pz, r, P, rng);
      if (r.solved && r.tier < P.tier) {
        fallback = pz;
        pz = mergeCages(pz, P, rng);
        continue;
      }
      // Stuck. If the puzzle has a second solution, the fix belongs where the two differ;
      // otherwise the logic just needs more help where it stopped. When only a few cells are
      // open (typically a "deadly pattern"), seeding the brute-force search with the solver's
      // candidates makes that check cheap.
      var targets = r.open, marked = null;
      var found = [];
      if (r.open.length <= 24 && countSolutions(pz, 2, found, r.cand) > 1) {
        var diff = [];
        for (var f = 0; f < found.length && !diff.length; f++) {
          for (var i = 0; i < 81; i++) if (found[f][i] !== pz.solution[i]) diff.push(i);
        }
        if (diff.length) targets = marked = diff;
      }
      if (!targets.length) targets = [rng.int(81)];
      // Big cages first (they can be split); then any target cell that can be reshaped.
      var order = rng.shuffle(targets.slice());
      order.sort(function (a, b) { return pz.cages[pz.cageOf[b]].cells.length - pz.cages[pz.cageOf[a]].cells.length; });
      var next = null;
      for (var t = 0; t < order.length && t < 6 && !next; t++) {
        next = splitCage(pz, order[t], P, rng, marked) || reshapeAround(pz, order[t], P, rng, marked);
      }
      if (!next && fallback) next = mergeCages(fallback, P, rng);
      pz = next;
    }
    return null;
  }

  // One puzzle for a book slot. Same arguments, same puzzle, on any machine.
  function generate(seed, level, ordinal, salt) {
    var P = LEVELS[level];
    if (!P) throw new Error('Unknown level ' + level);
    for (var attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      var rng = makeRng(['ks1', seed, level, ordinal, salt || 0, attempt].join('/'));
      var sol = randomSolution(rng);
      if (!sol) continue;
      var pz = partition(sol, P, rng);
      if (!pz) continue;
      var res = steer(pz, P, rng);
      if (!res) continue;
      if (!levelShapeOk(res.puzzle, P)) continue;
      if (countSolutions(res.puzzle, 2) !== 1) continue;
      return toWire(res.puzzle, level, res.rating, { seed: seed, ordinal: ordinal, salt: salt || 0, attempt: attempt });
    }
    return null;
  }

  // Once a puzzle is at its level, try a few more merges of the smallest cages and keep
  // each one that leaves the puzzle solvable at the same level: bigger cages, fewer
  // give-away pairs, same logic.
  function polish(pz, rating, P, rng) {
    for (var t = 0; t < P.polish; t++) {
      var next = mergeCages(pz, P, rng);
      if (!next) break;
      var r = rate(next);
      if (r.solved && r.tier === P.tier) { pz = next; rating = r; }
    }
    return { puzzle: pz, rating: rating };
  }

  function levelShapeOk(pz, P) {
    for (var g = 0; g < pz.cages.length; g++) {
      var n = pz.cages[g].cells.length;
      if (n < P.minSize || n > P.maxSize + 1) return false;
    }
    return true;
  }

  // Plain-data form (structured-clone and JSON friendly) used everywhere outside the engine.
  function toWire(pz, level, rating, meta) {
    return {
      level: level,
      ordinal: meta.ordinal,
      salt: meta.salt,
      attempt: meta.attempt,
      solution: Array.prototype.join.call(pz.solution, ''),
      cageOf: Array.prototype.slice.call(pz.cageOf),
      sums: pz.cages.map(function (c) { return c.sum; }),
      tier: rating.tier,
      steps: rating.steps,
      key: signature(pz)
    };
  }

  function fromWire(w) {
    var sol = new Int8Array(81), lists = [];
    for (var i = 0; i < 81; i++) {
      sol[i] = +w.solution[i];
      var id = w.cageOf[i];
      (lists[id] = lists[id] || []).push(i);
    }
    return buildPuzzle(sol, lists);
  }

  // Full check of a wire puzzle. Returns a list of problems (empty = valid).
  // opts.structureOnly skips the (slower) solution count, for re-checking on the page a
  // puzzle that a worker has already counted.
  function validate(w, opts) {
    var problems = [];
    if (!w || typeof w.solution !== 'string' || w.solution.length !== 81) return ['bad solution string'];
    if (!w.cageOf || w.cageOf.length !== 81) return ['bad cage map'];
    var sol = [];
    for (var i = 0; i < 81; i++) {
      var d = +w.solution[i];
      if (!(d >= 1 && d <= 9)) problems.push('cell ' + i + ' has no digit');
      sol.push(d);
    }
    HOUSES.forEach(function (cells, h) {
      var m = 0;
      cells.forEach(function (c) { m |= bit(sol[c]); });
      if (m !== ALL) problems.push('house ' + h + ' is not 1-9');
    });
    var lists = [];
    for (i = 0; i < 81; i++) {
      var id = w.cageOf[i];
      if (!(id >= 0 && id < w.sums.length)) { problems.push('cell ' + i + ' has no cage'); continue; }
      (lists[id] = lists[id] || []).push(i);
    }
    for (var g = 0; g < w.sums.length; g++) {
      var cells = lists[g];
      if (!cells) { problems.push('cage ' + g + ' is empty'); continue; }
      if (!isConnected(cells)) problems.push('cage ' + g + ' is not connected');
      var seen = 0, sum = 0;
      cells.forEach(function (c) {
        if (seen & bit(sol[c])) problems.push('cage ' + g + ' repeats ' + sol[c]);
        seen |= bit(sol[c]); sum += sol[c];
      });
      if (sum !== w.sums[g]) problems.push('cage ' + g + ' sum ' + w.sums[g] + ' should be ' + sum);
    }
    if (!problems.length && !(opts && opts.structureOnly)) {
      var n = countSolutions(fromWire(w), 2);
      if (n !== 1) problems.push(n === 0 ? 'no solution' : 'more than one solution');
    }
    return problems;
  }

  return {
    LEVELS: LEVELS,
    makeRng: makeRng,
    hashString: hashString,
    generate: generate,
    validate: validate,
    fromWire: fromWire,
    countSolutions: countSolutions,
    rate: rate,
    // Building blocks, exposed for the test and tuning scripts.
    internals: { randomSolution: randomSolution, partition: partition, steer: steer }
  };
}

(function (root) {
  root.KS = root.KS || {};
  root.KS.engineFactory = KillerEngineFactory;
  root.KS.engine = KillerEngineFactory();
})(typeof self !== 'undefined' ? self : this);
