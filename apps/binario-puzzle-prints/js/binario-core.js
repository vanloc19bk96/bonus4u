/*!
 * binario-core.js — Binario (Binairo / Takuzu) generator, solver and difficulty classifier.
 *
 * Rules (spec 1.2):
 *   1. Balance    — every row/column holds exactly n/2 white (0) and n/2 black (1) circles.
 *   2. No triples — never three or more of the same colour adjacent in a row or column.
 *   3. Uniqueness — no two rows identical, no two columns identical.
 *
 * Grid representation: a flat array of length n*n.
 *   Public puzzle objects use `null` for empty (spec 3.1); the hot loops use
 *   Int8Array with EMPTY = -1 to stay allocation-free.
 *
 * Exposes window.BinarioCore. Classic script, no modules (spec 2).
 */
(function (global) {
  'use strict';

  var EMPTY = -1;

  /* ---------------------------------------------------------------- RNG --
   * mulberry32: tiny, fast, seedable. No seed field is exposed in the UI
   * (spec 6.2), but a deterministic stream makes the QA suite reproducible.
   */
  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    function next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    next.int = function (n) { return Math.floor(next() * n); };
    next.shuffle = function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = next.int(i + 1), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };
    return next;
  }

  /* ------------------------------------------------------------ helpers -- */

  function at(g, n, r, c) { return g[r * n + c]; }

  function toPuzzleArray(g) {
    var out = new Array(g.length);
    for (var i = 0; i < g.length; i++) out[i] = g[i] === EMPTY ? null : g[i];
    return out;
  }

  function fromPuzzleArray(cells) {
    var g = new Int8Array(cells.length);
    for (var i = 0; i < cells.length; i++) {
      g[i] = (cells[i] === null || cells[i] === undefined) ? EMPTY : cells[i];
    }
    return g;
  }

  /**
   * Flat cell indices of one "line". Lines 0..n-1 are rows, n..2n-1 are columns.
   * Cached per n — the techniques walk all 2n lines many times per puzzle.
   */
  var lineCache = {};
  function linesFor(n) {
    if (lineCache[n]) return lineCache[n];
    var lines = [], r, c;
    for (r = 0; r < n; r++) {
      var row = new Int16Array(n);
      for (c = 0; c < n; c++) row[c] = r * n + c;
      lines.push(row);
    }
    for (c = 0; c < n; c++) {
      var col = new Int16Array(n);
      for (r = 0; r < n; r++) col[r] = r * n + c;
      lines.push(col);
    }
    lineCache[n] = lines;
    return lines;
  }

  /* -------------------------------------------------- independent checker --
   * Written straight from the rule text rather than sharing code with the
   * generator, so the QA suite validates one implementation against another.
   * Returns null when valid, otherwise a description of the first violation.
   */
  function checkSolution(cells, n) {
    var half = n / 2, r, c, i, v;
    if (!cells || cells.length !== n * n) return 'wrong length';
    for (i = 0; i < cells.length; i++) {
      v = cells[i];
      if (v !== 0 && v !== 1) return 'cell ' + i + ' is not 0/1';
    }
    for (r = 0; r < n; r++) {                                  // rule 1 — balance
      var rowSum = 0, colSum = 0;
      for (c = 0; c < n; c++) { rowSum += cells[r * n + c]; colSum += cells[c * n + r]; }
      if (rowSum !== half) return 'row ' + r + ' unbalanced';
      if (colSum !== half) return 'col ' + r + ' unbalanced';
    }
    for (r = 0; r < n; r++) {                                  // rule 2 — no triples
      for (c = 0; c < n; c++) {
        if (c >= 2 && cells[r * n + c] === cells[r * n + c - 1] &&
                      cells[r * n + c] === cells[r * n + c - 2]) {
          return 'horizontal triple at r' + r + 'c' + c;
        }
        if (r >= 2 && cells[r * n + c] === cells[(r - 1) * n + c] &&
                      cells[r * n + c] === cells[(r - 2) * n + c]) {
          return 'vertical triple at r' + r + 'c' + c;
        }
      }
    }
    var seenRow = {}, seenCol = {};                            // rule 3 — uniqueness
    for (r = 0; r < n; r++) {
      var rk = '', ck = '';
      for (c = 0; c < n; c++) { rk += cells[r * n + c]; ck += cells[c * n + r]; }
      if (seenRow[rk] !== undefined) return 'duplicate rows ' + seenRow[rk] + '/' + r;
      if (seenCol[ck] !== undefined) return 'duplicate cols ' + seenCol[ck] + '/' + r;
      seenRow[rk] = r; seenCol[ck] = r;
    }
    return null;
  }

  /* ------------------------------------------ spec 3.2 solution builder --
   * Randomised depth-first fill in row-major order with incremental pruning.
   */
  function fillSolution(n, rng) {
    var N = n * n, half = n / 2;
    var g = new Int8Array(N);
    var rowCnt = new Int8Array(n * 2);   // rowCnt[r * 2 + v]
    var colCnt = new Int8Array(n * 2);
    var rowKey = new Int32Array(n);      // completed rows/cols as bit patterns
    var colKey = new Int32Array(n);
    var budget;

    function rowKeyIfNew(r) {
      var k = 0, base = r * n, c, p;
      for (c = 0; c < n; c++) k = (k << 1) | g[base + c];
      for (p = 0; p < r; p++) if (rowKey[p] === k) return -1;
      return k;
    }
    function colKeyIfNew(c) {
      var k = 0, r, p;
      for (r = 0; r < n; r++) k = (k << 1) | g[r * n + c];
      for (p = 0; p < c; p++) if (colKey[p] === k) return -1;
      return k;
    }

    function dfs(i) {
      if (i === N) return true;
      if (--budget < 0) return false;
      var r = (i / n) | 0, c = i - r * n;
      var first = rng() < 0.5 ? 0 : 1;
      for (var k = 0; k < 2; k++) {
        var v = k === 0 ? first : 1 - first;
        if (rowCnt[r * 2 + v] >= half) continue;                      // rule 1
        if (colCnt[c * 2 + v] >= half) continue;
        if (c >= 2 && g[i - 1] === v && g[i - 2] === v) continue;     // rule 2
        if (r >= 2 && g[i - n] === v && g[i - 2 * n] === v) continue;

        g[i] = v; rowCnt[r * 2 + v]++; colCnt[c * 2 + v]++;
        var ok = true, rk = -1, ck = -1;
        if (c === n - 1) { rk = rowKeyIfNew(r); if (rk < 0) ok = false; }   // rule 3
        if (ok && r === n - 1) { ck = colKeyIfNew(c); if (ck < 0) ok = false; }
        if (ok) {
          if (rk >= 0) rowKey[r] = rk;
          if (ck >= 0) colKey[c] = ck;
          if (dfs(i + 1)) return true;
        }
        g[i] = EMPTY; rowCnt[r * 2 + v]--; colCnt[c * 2 + v]--;
      }
      return false;
    }

    // spec 3.2: node budget, then restart with a fresh shuffle.
    for (var attempt = 0; attempt < 500; attempt++) {
      g.fill(EMPTY); rowCnt.fill(0); colCnt.fill(0);
      budget = 200000;
      if (dfs(0)) return g;
    }
    throw new Error('fillSolution: could not build an ' + n + '×' + n + ' solution');
  }

  /* ------------------------------------------- valid row/column patterns --
   * Every legal row (and column) of an n×n Binario is an n-bit word with
   * exactly n/2 ones and no three equal bits in a row. There are few enough of
   * them (n <= 14 -> at most a couple of thousand) to enumerate once and cache,
   * which turns solution counting from a cell-by-cell search into a search over
   * whole lines. Bit for column c sits at position (n - 1 - c), so a pattern
   * reads left to right like the printed grid.
   */
  var patternCache = {};
  function rowPatterns(n) {
    if (patternCache[n]) return patternCache[n];
    var half = n / 2, out = [], total = 1 << n, p, c, bits;
    for (p = 0; p < total; p++) {
      bits = 0;
      for (c = 0; c < n; c++) bits += (p >> c) & 1;
      if (bits !== half) continue;                                   // rule 1
      var ok = true;
      for (c = 2; c < n; c++) {                                      // rule 2
        var a = (p >> (n - 1 - c)) & 1;
        if (a === ((p >> (n - c)) & 1) && a === ((p >> (n + 1 - c)) & 1)) { ok = false; break; }
      }
      if (ok) out.push(p);
    }
    patternCache[n] = Int32Array.from(out);
    return patternCache[n];
  }

  /* ------------------------------------------- column feasibility table --
   * While the counter fills rows top to bottom, each column holds a prefix.
   * This answers "can that prefix still grow into a legal column?" — enough
   * ones left to reach n/2, without ever making a third equal cell in a row.
   *
   * State: rows placed so far, ones placed so far, and the last two bits
   * (encoded 0, 1, or 2 for "not there yet"). A few hundred entries per n,
   * built once. Without this prune a sparse 14×14 explodes.
   */
  var feasCache = {};
  function feasTable(n) {
    if (feasCache[n]) return feasCache[n];
    var half = n / 2;
    // index: ((d * (half + 1) + ones) * 3 + b1) * 3 + b2
    var size = (n + 1) * (half + 1) * 9;
    var tbl = new Uint8Array(size);
    var idx = function (d, ones, b1, b2) { return ((d * (half + 1) + ones) * 3 + b1) * 3 + b2; };

    for (var d = n; d >= 0; d--) {
      for (var ones = 0; ones <= half; ones++) {
        for (var b1 = 0; b1 < 3; b1++) {
          for (var b2 = 0; b2 < 3; b2++) {
            var ok = 0;
            if (d === n) {
              ok = (ones === half) ? 1 : 0;
            } else {
              for (var v = 0; v < 2; v++) {
                if (b1 === v && b2 === v) continue;          // would be a third in a row
                var nOnes = ones + v;
                if (nOnes > half) continue;
                if ((d + 1) - nOnes > half) continue;        // too many zeros
                if (tbl[idx(d + 1, nOnes, v, b1)]) { ok = 1; break; }
              }
            }
            tbl[idx(d, ones, b1, b2)] = ok;
          }
        }
      }
    }
    feasCache[n] = { tbl: tbl, half: half, n: n };
    return feasCache[n];
  }

  /* ---------------------------------------- spec 3.3 solution counting --
   * Counts completed solutions consistent with `cells`, aborting the moment
   * `cap` of them are found. This is the uniqueness guarantee behind every
   * puzzle, so it is deliberately derived from the rules alone and shares no
   * code with the human-technique solver it exists to check.
   *
   * It works a whole line at a time rather than a cell at a time:
   *   1. Every legal row and column is one of the cached `rowPatterns(n)`.
   *   2. Propagate: keep only the patterns each line could still be, and fix
   *      any cell all of them agree on. Sound by construction — a cell that
   *      every surviving candidate agrees on is forced in every solution.
   *   3. Search what propagation could not settle, assigning one row per level,
   *      pruned by column balance, column triples and feasTable.
   *
   * A node-budget overrun returns `cap` — pessimistic on purpose, so a caller
   * asking "is this unique?" hears "no" rather than a false yes.
   */
  function countSolutions(cells, n, cap, nodeBudget) {
    cap = cap || 2;
    var N = n * n, half = n / 2, full = (1 << n) - 1;
    var g = (cells instanceof Int8Array) ? cells : fromPuzzleArray(cells);
    var pats = rowPatterns(n);
    var feasTbl = feasTable(n).tbl;
    var r, c, i, v, k, p;

    // Known cells as a bitmask per line: `mask` marks decided columns/rows,
    // `ones` marks which of those are black. Rows and columns obey the same
    // rules, so both use the same pattern list; bit for position j sits at
    // (n - 1 - j) in both, which keeps the two views symmetric.
    var rowMask = new Int32Array(n), rowOnes = new Int32Array(n);
    var colMask = new Int32Array(n), colOnes = new Int32Array(n);
    for (i = 0; i < N; i++) {
      v = g[i];
      if (v === EMPTY) continue;
      r = (i / n) | 0; c = i - r * n;
      rowMask[r] |= 1 << (n - 1 - c);
      colMask[c] |= 1 << (n - 1 - r);
      if (v === 1) {
        rowOnes[r] |= 1 << (n - 1 - c);
        colOnes[c] |= 1 << (n - 1 - r);
      }
    }

    // Candidate lists, shrinking monotonically as propagation decides cells.
    var cand = new Array(2 * n);
    for (k = 0; k < 2 * n; k++) {
      var m = k < n ? rowMask[k] : colMask[k - n];
      var o = k < n ? rowOnes[k] : colOnes[k - n];
      var list = [];
      for (i = 0; i < pats.length; i++) if ((pats[i] & m) === o) list.push(pats[i]);
      if (list.length === 0) return 0;
      cand[k] = list;
    }

    // --- propagate to a fixpoint -------------------------------------------
    for (var changed = true; changed;) {
      changed = false;
      for (k = 0; k < 2 * n; k++) {
        var isRow = k < n, li = isRow ? k : k - n;
        var lm = isRow ? rowMask[li] : colMask[li];
        var lo = isRow ? rowOnes[li] : colOnes[li];

        var src = cand[k], kept = [], andAll = full, orAll = 0;
        for (i = 0; i < src.length; i++) {
          p = src[i];
          if ((p & lm) !== lo) continue;
          kept.push(p); andAll &= p; orAll |= p;
        }
        if (kept.length === 0) return 0;
        cand[k] = kept;

        var newOnes = andAll & ~lm;              // every candidate is black here
        var newZeros = ~orAll & full & ~lm;      // every candidate is white here
        if (!newOnes && !newZeros) continue;
        changed = true;

        for (var j = 0; j < n; j++) {
          var bit = 1 << (n - 1 - j);
          var val = (newOnes & bit) ? 1 : ((newZeros & bit) ? 0 : -1);
          if (val < 0) continue;
          var rr = isRow ? li : j, ccc = isRow ? j : li;
          rowMask[rr] |= 1 << (n - 1 - ccc);
          colMask[ccc] |= 1 << (n - 1 - rr);
          if (val === 1) {
            rowOnes[rr] |= 1 << (n - 1 - ccc);
            colOnes[ccc] |= 1 << (n - 1 - rr);
          }
        }
      }
    }

    // --- search the remainder ----------------------------------------------
    var rowCand = new Array(n);
    for (r = 0; r < n; r++) rowCand[r] = Int32Array.from(cand[r]);

    var chosen = new Int32Array(n);
    var ones = new Int32Array(n);   // black count per column, during the search
    var found = 0, overrun = false;
    var budget = nodeBudget || (100000 + N * 2000);

    function dfs(row) {
      if (found >= cap || overrun) return;
      if (row === n) {
        for (var a = 0; a < n; a++) {            // rule 3 for columns
          for (var b = a + 1; b < n; b++) {
            var same = true;
            for (var rr = 0; rr < n; rr++) {
              if (((chosen[rr] >> (n - 1 - a)) & 1) !== ((chosen[rr] >> (n - 1 - b)) & 1)) {
                same = false; break;
              }
            }
            if (same) return;
          }
        }
        found++;
        return;
      }
      if (--budget < 0) { overrun = true; return; }

      // Columns that can take no more of a colour, plus rule 2 on the two
      // cells directly above.
      var satOnes = 0, satZeros = 0, cc;
      for (cc = 0; cc < n; cc++) {
        if (ones[cc] === half) satOnes |= 1 << (n - 1 - cc);
        else if (row - ones[cc] === half) satZeros |= 1 << (n - 1 - cc);
      }
      if (row >= 2) {
        var a2 = chosen[row - 1], b2 = chosen[row - 2];
        satOnes |= (a2 & b2);
        satZeros |= (~a2 & ~b2 & full);
      }

      var list = rowCand[row], len = list.length;
      for (var kk = 0; kk < len; kk++) {
        var pat = list[kk];
        if (pat & satOnes) continue;
        if (~pat & satZeros & full) continue;

        var dup = false;
        for (var q = 0; q < row; q++) if (chosen[q] === pat) { dup = true; break; }
        if (dup) continue;                        // rule 3 for rows

        for (cc = 0; cc < n; cc++) ones[cc] += (pat >> (n - 1 - cc)) & 1;
        chosen[row] = pat;

        var alive = true, d = row + 1;
        for (cc = 0; cc < n; cc++) {              // can every column still finish?
          var s = n - 1 - cc;
          var f1 = (pat >> s) & 1;
          var f2 = row >= 1 ? ((chosen[row - 1] >> s) & 1) : 2;
          if (!feasTbl[((d * (half + 1) + ones[cc]) * 3 + f1) * 3 + f2]) { alive = false; break; }
        }
        if (alive) dfs(row + 1);

        for (cc = 0; cc < n; cc++) ones[cc] -= (pat >> (n - 1 - cc)) & 1;
        if (found >= cap || overrun) return;
      }
    }

    dfs(0);
    return overrun ? cap : found;
  }

  /* =====================================================================
   * spec 3.4 — human-style solver. These techniques are what define
   * difficulty. Each takes (g, n, ctx) and returns true if it placed at
   * least one cell; each places every deduction it finds in a single sweep,
   * and the driver loop then restarts from the cheapest technique.
   * =================================================================== */

  /**
   * Per-size scratch space. The carve loop runs a full solve after every single
   * clue removal, so the techniques must not allocate; everything reusable
   * lives here.
   *
   * stampRow/stampCol turn the "is this completed line a duplicate?" test into
   * an O(1) lookup: a line's contents pack into an n-bit key (n <= 14, so at
   * most 16384 slots), and a monotonic `gen` counter marks the current sweep so
   * the tables never need clearing.
   */
  function makeCtx(n) {
    return {
      n: n,
      half: n / 2,
      lines: linesFor(n),
      buf: new Int8Array(n),
      buf2: new Int8Array(n),
      solve: new Int8Array(n * n),
      trial: new Int8Array(n * n),
      stampRow: new Int32Array(1 << n),
      stampCol: new Int32Array(1 << n),
      gen: 0,
      inTrial: false
    };
  }

  function lineHasTriple(buf, n) {
    for (var i = 2; i < n; i++) {
      if (buf[i] !== EMPTY && buf[i] === buf[i - 1] && buf[i] === buf[i - 2]) return true;
    }
    return false;
  }

  /** T1 Sandwich: X _ X -> the middle is !X. (no-triples, Easy) */
  function T1(g, n, ctx) {
    var lines = ctx.lines, placed = false;
    for (var li = 0; li < lines.length; li++) {
      var L = lines[li];
      for (var j = 1; j < n - 1; j++) {
        if (g[L[j]] !== EMPTY) continue;
        var a = g[L[j - 1]];
        if (a !== EMPTY && a === g[L[j + 1]]) { g[L[j]] = 1 - a; placed = true; }
      }
    }
    return placed;
  }

  /** T2 Pair extension: X X _ or _ X X -> the outer empty is !X. (no-triples, Easy) */
  function T2(g, n, ctx) {
    var lines = ctx.lines, placed = false;
    for (var li = 0; li < lines.length; li++) {
      var L = lines[li];
      for (var j = 0; j < n - 1; j++) {
        var a = g[L[j]];
        if (a === EMPTY || g[L[j + 1]] !== a) continue;
        if (j - 1 >= 0 && g[L[j - 1]] === EMPTY) { g[L[j - 1]] = 1 - a; placed = true; }
        if (j + 2 < n && g[L[j + 2]] === EMPTY) { g[L[j + 2]] = 1 - a; placed = true; }
      }
    }
    return placed;
  }

  /** T3 Count completion: a line already holds n/2 of X -> every empty is !X. (balance, Easy) */
  function T3(g, n, ctx) {
    var lines = ctx.lines, half = ctx.half, placed = false;
    for (var li = 0; li < lines.length; li++) {
      var L = lines[li], c0 = 0, c1 = 0, j, v;
      for (j = 0; j < n; j++) { v = g[L[j]]; if (v === 0) c0++; else if (v === 1) c1++; }
      if (c0 + c1 === n) continue;
      var full = c0 === half ? 0 : (c1 === half ? 1 : -1);
      if (full < 0) continue;
      for (j = 0; j < n; j++) if (g[L[j]] === EMPTY) { g[L[j]] = 1 - full; placed = true; }
    }
    return placed;
  }

  /**
   * T4 Forced-by-count: a line holds n/2 - 1 of colour X, so exactly one X is
   * still to be placed and every other empty must become !X. Try that single X
   * in each empty slot; a slot whose resulting line would contain a triple is
   * impossible, so that slot is !X. If only one slot survives, fill the line.
   * (balance + no-triples, Medium)
   */
  function T4(g, n, ctx) {
    var lines = ctx.lines, half = ctx.half, buf = ctx.buf, placed = false;
    for (var li = 0; li < lines.length; li++) {
      var L = lines[li], c0 = 0, c1 = 0, j, k, v;
      for (j = 0; j < n; j++) { v = g[L[j]]; if (v === 0) c0++; else if (v === 1) c1++; }
      if (n - c0 - c1 < 2) continue;          // 0 empties: done; 1 empty: T3 covers it

      for (var X = 0; X < 2; X++) {
        if ((X === 0 ? c0 : c1) !== half - 1) continue;   // exactly one X left to place
        var lastValid = -1, validCount = 0, impossibleCount = 0;
        for (j = 0; j < n; j++) {
          if (g[L[j]] !== EMPTY) continue;
          for (k = 0; k < n; k++) buf[k] = g[L[k]] === EMPTY ? (1 - X) : g[L[k]];
          buf[j] = X;
          if (lineHasTriple(buf, n)) { ctx.buf2[impossibleCount++] = j; }
          else { validCount++; lastValid = j; }
        }
        if (validCount === 0) continue;       // contradiction — hasContradiction reports it
        if (validCount === 1) {
          for (j = 0; j < n; j++) if (g[L[j]] === EMPTY) g[L[j]] = (j === lastValid) ? X : (1 - X);
          placed = true;
          break;                              // line is finished; counts are stale either way
        }
        if (impossibleCount) {
          for (var m = 0; m < impossibleCount; m++) g[L[ctx.buf2[m]]] = 1 - X;
          placed = true;
          // c0/c1 no longer describe this line. Re-deriving them here would let
          // the X = 1 pass run, but the driver restarts from T1 the moment any
          // technique reports progress, so this line gets revisited anyway.
          break;
        }
      }
    }
    return placed;
  }

  /**
   * T5 Almost-complete twin: a line with exactly two empties has at most two
   * legal fills; if one of them would duplicate an already-complete line of the
   * same orientation, rule 3 rules it out and the other fill must be correct.
   * (uniqueness, Medium)
   */
  function T5(g, n, ctx) {
    var lines = ctx.lines, half = ctx.half, buf = ctx.buf, placed = false;
    var stampRow = ctx.stampRow, stampCol = ctx.stampCol;
    var gen = ++ctx.gen;
    var li, L, j, k, v, key, full;

    for (li = 0; li < lines.length; li++) {          // mark finished lines, per orientation
      L = lines[li]; key = 0; full = true;
      for (j = 0; j < n; j++) {
        v = g[L[j]];
        if (v === EMPTY) { full = false; break; }
        key = (key << 1) | v;
      }
      if (full) (li < n ? stampRow : stampCol)[key] = gen;
    }

    for (li = 0; li < lines.length; li++) {
      L = lines[li];
      var e0 = -1, e1 = -1, empties = 0, c0 = 0;
      for (j = 0; j < n; j++) {
        v = g[L[j]];
        if (v === EMPTY) {
          empties++;
          if (empties > 2) break;
          if (e0 < 0) e0 = j; else e1 = j;
        } else if (v === 0) c0++;
      }
      if (empties !== 2) continue;

      var stamp = li < n ? stampRow : stampCol;
      var foundA = -1, candidates = 0;
      for (var p = 0; p < 2; p++) {
        var a = p, b = 1 - p;                        // balance rules out (p, p)
        if (c0 + (a === 0 ? 1 : 0) + (b === 0 ? 1 : 0) !== half) continue;
        for (k = 0; k < n; k++) buf[k] = g[L[k]];
        buf[e0] = a; buf[e1] = b;
        if (lineHasTriple(buf, n)) continue;
        key = 0;
        for (k = 0; k < n; k++) key = (key << 1) | buf[k];
        if (stamp[key] === gen) continue;            // rule 3 — would duplicate a finished line
        candidates++; foundA = a;
      }
      if (candidates === 1) {
        g[L[e0]] = foundA;
        g[L[e1]] = 1 - foundA;
        placed = true;
      }
    }
    return placed;
  }

  /**
   * T6 Contradiction, depth 1: assume a colour in one empty cell, run T1–T5 to
   * closure, and if that reaches a contradiction the opposite colour is forced.
   * Returns after the first cell it resolves — the driver restarts from T1
   * anyway, and the cheap techniques usually cascade from there. (Hard)
   */
  function T6(g, n, ctx) {
    var N = n * n, trial = ctx.trial, lines = ctx.lines;
    // A nested T6 would blow up exponentially; the spec asks for depth 1 only.
    if (ctx.inTrial) return false;

    // Walk the empty cells of the fullest lines first. Every empty cell still
    // gets tested, but a contradiction — if there is one — almost always turns
    // up where the constraints are tightest, and T6 returns on the first hit.
    var order = ctx.t6order, li, j, e;
    if (!order) order = ctx.t6order = { cells: new Int16Array(N), lineIdx: new Int16Array(2 * n), empties: new Int16Array(2 * n), seen: new Int32Array(N), gen: 0 };
    var seen = order.seen, gen = ++order.gen;
    var lineIdx = order.lineIdx, empties = order.empties, cells = order.cells;
    for (li = 0; li < lines.length; li++) {
      e = 0;
      for (j = 0; j < n; j++) if (g[lines[li][j]] === EMPTY) e++;
      lineIdx[li] = li; empties[li] = e === 0 ? 9999 : e;   // finished lines last
    }
    for (li = 1; li < lines.length; li++) {                 // insertion sort, 2n <= 28 items
      var kv = lineIdx[li], ke = empties[li], m = li - 1;
      while (m >= 0 && empties[m] > ke) { empties[m + 1] = empties[m]; lineIdx[m + 1] = lineIdx[m]; m--; }
      empties[m + 1] = ke; lineIdx[m + 1] = kv;
    }
    var count = 0;
    for (li = 0; li < lines.length; li++) {
      var L = lines[lineIdx[li]];
      for (j = 0; j < n; j++) {
        var idx = L[j];
        if (g[idx] !== EMPTY || seen[idx] === gen) continue;
        seen[idx] = gen; cells[count++] = idx;
      }
    }

    for (var ci = 0; ci < count; ci++) {
      var i = cells[ci];
      if (g[i] !== EMPTY) continue;
      for (var v = 0; v < 2; v++) {
        trial.set(g);
        trial[i] = v;
        ctx.inTrial = true;
        var bust = runUntilContradiction(trial, n, ctx, EASY_MEDIUM);
        ctx.inTrial = false;
        if (bust) { g[i] = 1 - v; return true; }
      }
    }
    return false;
  }

  /** Partial-grid rule check: true if `g` can no longer become a valid solution. */
  function hasContradiction(g, n, ctx) {
    var lines = ctx.lines, half = ctx.half;
    var stampRow = ctx.stampRow, stampCol = ctx.stampCol;
    var gen = ++ctx.gen;
    var li, L, j, v;
    for (li = 0; li < lines.length; li++) {
      L = lines[li];
      var c0 = 0, c1 = 0, key = 0, full = true;
      for (j = 0; j < n; j++) {
        v = g[L[j]];
        if (v === EMPTY) { full = false; continue; }
        if (v === 0) c0++; else c1++;
        if (j >= 2 && v === g[L[j - 1]] && v === g[L[j - 2]]) return true;   // rule 2
      }
      if (c0 > half || c1 > half) return true;                              // rule 1
      if (full) {
        for (j = 0; j < n; j++) key = (key << 1) | g[L[j]];
        var stamp = li < n ? stampRow : stampCol;
        if (stamp[key] === gen) return true;                                // rule 3
        stamp[key] = gen;
      }
    }
    return false;
  }

  var EASY = [T1, T2, T3];
  var EASY_MEDIUM = [T1, T2, T3, T4, T5];
  var ALL = [T1, T2, T3, T4, T5, T6];
  var TIER_TECHNIQUES = { easy: EASY, medium: EASY_MEDIUM, hard: ALL };

  function runTechniques(g, n, ctx, allowed) {
    // The stamp tables index by an n-bit key and compare against `gen`; reset
    // both long before the counter could wrap into a stale match.
    if (ctx.gen > 0x3FFFFFFF) { ctx.stampRow.fill(0); ctx.stampCol.fill(0); ctx.gen = 0; }
    for (;;) {
      var progress = false;
      for (var t = 0; t < allowed.length; t++) {
        if (allowed[t](g, n, ctx)) { progress = true; break; }   // restart from the cheapest
      }
      if (!progress) return;
    }
  }

  /**
   * The same loop, but for T6's trials: a trial only matters up to the moment
   * it breaks a rule, so check after every productive pass and stop there
   * instead of solving the rest of a grid that is already dead.
   */
  function runUntilContradiction(g, n, ctx, allowed) {
    if (hasContradiction(g, n, ctx)) return true;
    for (;;) {
      var progress = false;
      for (var t = 0; t < allowed.length; t++) {
        if (allowed[t](g, n, ctx)) { progress = true; break; }
      }
      if (!progress) return false;
      if (hasContradiction(g, n, ctx)) return true;
    }
  }

  function isFull(g) {
    for (var i = 0; i < g.length; i++) if (g[i] === EMPTY) return false;
    return true;
  }

  /**
   * spec 3.4 — can a solver close this puzzle using only the techniques of `tier`?
   *
   * Note for callers: every technique makes only forced deductions, so a `true`
   * here also proves the puzzle has exactly one solution. makePuzzle relies on
   * that; countSolutions still backs it up as an independent check.
   */
  function humanSolvable(cells, n, tier, ctx) {
    ctx = ctx || makeCtx(n);
    var g = ctx.solve;
    if (cells instanceof Int8Array) g.set(cells);
    else for (var i = 0; i < cells.length; i++) {
      g[i] = (cells[i] === null || cells[i] === undefined) ? EMPTY : cells[i];
    }
    runTechniques(g, n, ctx, TIER_TECHNIQUES[tier]);
    return isFull(g) && !hasContradiction(g, n, ctx);
  }

  /**
   * spec 3.4 — difficulty is the *cheapest* tier that closes the puzzle.
   * Returns 'easy' | 'medium' | 'hard', or null if even T1–T6 get stuck.
   */
  function classify(cells, n, ctx) {
    ctx = ctx || makeCtx(n);
    if (humanSolvable(cells, n, 'easy', ctx)) return 'easy';
    if (humanSolvable(cells, n, 'medium', ctx)) return 'medium';
    if (humanSolvable(cells, n, 'hard', ctx)) return 'hard';
    return null;
  }

  /* ------------------------------------------- spec 3.3 clue carving -- */

  /**
   * spec 3.3 — remove clues in random order, restoring any removal that breaks
   * uniqueness or pushes the puzzle past `tier`.
   *
   * The spec writes those as two tests (countSolutions === 1, then
   * humanSolvable). They collapse into one: the techniques only ever make
   * forced deductions, so a puzzle that solves logically to completion cannot
   * have a second solution — humanSolvable already implies uniqueness.
   * Keeping only the cheaper test is what makes 12×12 and 14×14 books
   * practical; generate() re-checks countSolutions once per finished puzzle so
   * a bug in a technique could never ship a non-unique puzzle silently.
   */
  function makePuzzle(solution, n, tier, rng, ctx) {
    var N = n * n;
    var clues = Int8Array.from(solution);
    var order = [];
    for (var i = 0; i < N; i++) order.push(i);
    rng.shuffle(order);

    // Tiers nest: anything the easy set solves, the medium set solves too. So
    // try the cheapest set first and only pay for T5 / T6 when it falls short.
    var cheaper = tier === 'hard' ? 'medium' : (tier === 'medium' ? 'easy' : null);

    for (var k = 0; k < N; k++) {
      var idx = order[k];
      var saved = clues[idx];
      clues[idx] = EMPTY;
      var ok = cheaper ? humanSolvable(clues, n, cheaper, ctx) : false;
      if (!ok) ok = humanSolvable(clues, n, tier, ctx);
      if (!ok) clues[idx] = saved;
    }
    return clues;
  }

  function countClues(cells) {
    var c = 0;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i] !== null && cells[i] !== undefined && cells[i] !== EMPTY) c++;
    }
    return c;
  }

  /* -------------------------------------------------- spec 3.5 the book -- */

  var MAX_TIER_ATTEMPTS = 40;

  /**
   * Generate one puzzle of the requested tier.
   * `opts.seen` is a Set of solution keys shared across the book (spec 3.5).
   *
   * If the requested tier is unreachable for this grid size — a 6×6 almost
   * never needs contradiction reasoning — the closest tier reached is returned
   * with `fellBack: true` so the UI can say so, rather than looping forever.
   */
  function generate(n, tier, opts) {
    opts = opts || {};
    var rng = opts.rng || makeRng((Math.random() * 4294967296) >>> 0);
    var seen = opts.seen || null;
    var ctx = opts.ctx || makeCtx(n);
    var best = null;

    for (var attempt = 0; attempt < MAX_TIER_ATTEMPTS; attempt++) {
      var solution = fillSolution(n, rng);
      var key = solution.join('');
      if (seen && seen.has(key)) continue;                  // spec 3.5

      var clues = makePuzzle(solution, n, tier, rng, ctx);
      var got = classify(clues, n, ctx);
      if (got === null) continue;
      // Independent re-check of the uniqueness guarantee (spec 3.3 / 9).
      if (countSolutions(clues, n, 2) !== 1) continue;

      var puzzle = {
        n: n,
        clues: toPuzzleArray(clues),
        solution: Array.prototype.slice.call(solution),
        difficulty: got,
        index: opts.index || 0,
        clueCount: countClues(clues),
        fellBack: false
      };
      if (got === tier) {
        if (seen) seen.add(key);
        return puzzle;
      }
      if (!best || tierDistance(got, tier) < tierDistance(best.difficulty, tier)) best = puzzle;
    }

    if (!best) throw new Error('generate: no ' + n + '×' + n + ' puzzle could be built');
    best.fellBack = true;
    if (seen) seen.add(best.solution.join(''));
    return best;
  }

  var TIER_ORDER = { easy: 0, medium: 1, hard: 2 };
  function tierDistance(a, b) { return Math.abs(TIER_ORDER[a] - TIER_ORDER[b]); }

  /** spec 6.2 "Mixed": first 40% easy, next 40% medium, last 20% hard. */
  function tierFor(i, count, difficulty) {
    if (difficulty !== 'mixed') return difficulty;
    var easyEnd = Math.round(count * 0.4);
    var mediumEnd = easyEnd + Math.round(count * 0.4);
    if (i < easyEnd) return 'easy';
    if (i < mediumEnd) return 'medium';
    return 'hard';
  }

  /**
   * spec 6.4 — chunked generation. Web Workers are blocked on file://, so the
   * loop runs in ~120 ms slices and yields to the browser with setTimeout(0)
   * between them, which keeps the progress bar painting.
   */
  function generateBook(opts, onProgress) {
    var n = opts.n, count = opts.count;
    var rng = makeRng(opts.seed || ((Math.random() * 4294967296) >>> 0));
    var ctx = makeCtx(n);
    var seen = new Set();
    var puzzles = [];
    var cancelled = false;

    var promise = new Promise(function (resolve, reject) {
      var i = 0;
      function step() {
        if (cancelled) { reject(new Error('cancelled')); return; }
        var sliceStart = Date.now();
        try {
          while (i < count && Date.now() - sliceStart < 120) {
            var p = generate(n, tierFor(i, count, opts.difficulty), {
              rng: rng, seen: seen, ctx: ctx, index: i + 1
            });
            p.index = i + 1;
            puzzles.push(p);
            i++;
          }
        } catch (err) { reject(err); return; }
        if (onProgress) onProgress(i / count, i, count);
        if (i >= count) { resolve(puzzles); return; }
        setTimeout(step, 0);
      }
      setTimeout(step, 0);
    });
    promise.cancel = function () { cancelled = true; };
    return promise;
  }

  /* ----------------------------------------------------------- exports -- */
  global.BinarioCore = {
    EMPTY: EMPTY,
    makeRng: makeRng,
    makeCtx: makeCtx,
    at: at,
    linesFor: linesFor,
    checkSolution: checkSolution,
    fillSolution: fillSolution,
    countSolutions: countSolutions,
    humanSolvable: humanSolvable,
    classify: classify,
    makePuzzle: makePuzzle,
    countClues: countClues,
    generate: generate,
    generateBook: generateBook,
    tierFor: tierFor,
    toPuzzleArray: toPuzzleArray,
    fromPuzzleArray: fromPuzzleArray,
    techniques: { T1: T1, T2: T2, T3: T3, T4: T4, T5: T5, T6: T6 }
  };
})(typeof window !== 'undefined' ? window : this);
