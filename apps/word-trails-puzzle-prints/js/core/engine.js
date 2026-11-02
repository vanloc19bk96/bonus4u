/*
 * The puzzle maker. Every letter of a grid belongs to exactly one word, each word is a trail of
 * neighbouring squares (any of 8 directions, free to turn), trails never cross, and the span word
 * runs from one edge to the opposite edge.
 *
 * The AI gives more words than a grid holds. pick() keeps a set whose letters add up exactly to the
 * grid, build() cuts the grid into trails of those lengths with the span first, then proves the
 * result: solutions() reads the printed letters back and counts how the words can be placed, and
 * only a grid with exactly one way out is kept.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var U = CX.util;

  // Never left in a straight line for a reader to stumble on (forwards or backwards).
  var RUDE = ['ANUS', 'ARSE', 'CLIT', 'COCK', 'CUM', 'CUNT', 'DAMN', 'DICK', 'DYKE', 'FAG', 'FUCK', 'GOOK', 'HELL', 'HOMO', 'JIZZ', 'KIKE', 'NAZI', 'NIGGER', 'PAKI', 'PISS', 'PORN', 'PUSSY', 'RAPE', 'SEX', 'SHIT', 'SLUT', 'SPIC', 'TIT', 'TITS', 'TURD', 'TWAT', 'WANK', 'WHORE'];

  // How the trails feel at each level: straight is the chance weight of carrying straight on,
  // maxStraight how many words may run dead straight (as a part of the words) and maxRun the
  // longest straight stretch in a word.
  var LEVELS = {
    easy: { straight: 2.2, maxStraight: 0.5, maxRun: 7 },
    medium: { straight: 0.8, maxStraight: 0.2, maxRun: 5 },
    hard: { straight: 0.15, maxStraight: 0, maxRun: 3 }
  };

  // ---------- the board ----------
  function Board(cols, rows) {
    this.cols = cols; this.rows = rows; this.n = cols * rows;
    this.used = new Int16Array(this.n).fill(-1);
    // the two diagonals of each 2 x 2 block: 0 free, 1 "\" taken, 2 "/" taken
    this.block = new Uint8Array(this.n);
    this.near = [];
    for (var i = 0; i < this.n; i++) {
      var r = Math.floor(i / cols), c = i % cols, list = [];
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var R = r + dr, C = c + dc;
        if (R >= 0 && R < rows && C >= 0 && C < cols) list.push(R * cols + C);
      }
      this.near.push(list);
    }
  }
  // The block a diagonal step lies in, with the kind of diagonal, or null for a straight step.
  Board.prototype.diag = function (a, b) {
    var ra = Math.floor(a / this.cols), rb = Math.floor(b / this.cols), ca = a % this.cols, cb = b % this.cols;
    if (ra === rb || ca === cb) return null;
    var top = Math.min(ra, rb), left = Math.min(ca, cb);
    return { at: top * this.cols + left, kind: (ra < rb) === (ca < cb) ? 1 : 2 };
  };
  Board.prototype.can = function (a, b) {
    var d = this.diag(a, b);
    return !d || !this.block[d.at] || this.block[d.at] === d.kind;
  };
  Board.prototype.link = function (a, b) {
    var d = this.diag(a, b);
    if (!d || this.block[d.at]) return null;  // already set by an earlier step of the same kind
    this.block[d.at] = d.kind;
    return d.at;
  };
  // Free squares that can be stepped to from a.
  Board.prototype.exits = function (a) {
    var out = [], near = this.near[a];
    for (var i = 0; i < near.length; i++) if (this.used[near[i]] < 0 && this.can(a, near[i])) out.push(near[i]);
    return out;
  };

  // The sums some of these lengths can add up to, as an array of booleans up to max.
  function sums(lengths, max) {
    var can = new Uint8Array(max + 1);
    can[0] = 1;
    lengths.forEach(function (l) { for (var s = max; s >= l; s--) if (can[s - l]) can[s] = 1; });
    return can;
  }

  // Every group of free squares must be fillable by some of the words that are left.
  function regionsOk(bd, lengths, free) {
    var can = sums(lengths, free), seen = new Uint8Array(bd.n), stack = [];
    for (var i = 0; i < bd.n; i++) {
      if (seen[i] || bd.used[i] >= 0) continue;
      var size = 0;
      stack.push(i); seen[i] = 1;
      while (stack.length) {
        var a = stack.pop();
        size++;
        var ex = bd.exits(a);
        for (var k = 0; k < ex.length; k++) if (!seen[ex[k]]) { seen[ex[k]] = 1; stack.push(ex[k]); }
      }
      if (!can[size]) return false;
    }
    return true;
  }

  // Orders the next squares of a trail: tight squares first, with the level's taste for going straight.
  function order(bd, from, prev, list, rng, level) {
    return list.map(function (b) {
      var s = rng.next() * 2 - bd.exits(b).length * 0.25;
      if (prev != null) {
        var same = from - prev === b - from && Math.abs((from % bd.cols) - (b % bd.cols)) <= 1;
        if (same) s += level.straight - 1;
      }
      return { b: b, s: s };
    }).sort(function (x, y) { return y.s - x.s; }).map(function (x) { return x.b; });
  }

  // Lays down a found trail; returns what to undo.
  function mark(bd, trail, id) {
    var undo = [];
    trail.forEach(function (a, i) {
      bd.used[a] = id;
      if (i) { var at = bd.link(trail[i - 1], a); if (at != null) undo.push(at); }
    });
    return undo;
  }
  function unmark(bd, trail, undo) {
    trail.forEach(function (a) { bd.used[a] = -1; });
    undo.forEach(function (at) { bd.block[at] = 0; });
  }

  /*
   * Trails of exactly len squares that begin at start, walked at random and handed one at a time
   * to visit(trail); visit returns true to stop. allowed(square, stepsLeft) can limit where a trail may go.
   */
  function walk(bd, start, len, rng, level, limit, visit, allowed) {
    var trail = [start], count = 0;
    bd.used[start] = 9999;
    function step(from, prev) {
      if (trail.length === len) { count++; return visit(trail.slice()); }
      var opts = order(bd, from, prev, bd.exits(from), rng, level);
      for (var i = 0; i < opts.length; i++) {
        var b = opts[i];
        if (allowed && !allowed(b, len - trail.length - 1)) continue;
        var at = bd.link(from, b);
        bd.used[b] = 9999;
        trail.push(b);
        var stop = step(b, from);
        trail.pop();
        bd.used[b] = -1;
        if (at != null) bd.block[at] = 0;
        if (stop || count >= limit) return stop;
      }
      return false;
    }
    var res = step(start, null);
    bd.used[start] = -1;
    return res;
  }

  // The span word from one edge to the opposite one. axis: 'v' top to bottom, 'h' left to right.
  function spanTrail(bd, len, axis, rng, level, visit) {
    var starts = [], i;
    if (axis === 'v') for (i = 0; i < bd.cols; i++) starts.push(i);
    else for (i = 0; i < bd.rows; i++) starts.push(i * bd.cols);
    rng.shuffle(starts);
    for (var s = 0; s < starts.length; s++) {
      var stop = walk(bd, starts[s], len, rng, level, 8, function (t) {
        var end = t[t.length - 1];
        var there = axis === 'v' ? Math.floor(end / bd.cols) === bd.rows - 1 : end % bd.cols === bd.cols - 1;
        return there ? visit(t) : false;
      }, function (b, left) {
        // can it still reach the far edge in the steps left?
        var dist = axis === 'v' ? bd.rows - 1 - Math.floor(b / bd.cols) : bd.cols - 1 - (b % bd.cols);
        return dist <= left;
      });
      if (stop) return true;
    }
    return false;
  }

  // Cuts the free squares into trails of the given lengths. Fills out[] and returns true, or false.
  function fill(bd, lengths, out, rng, level, budget) {
    if (!lengths.length) return true;
    if (--budget.left < 0) return false;
    var free = lengths.reduce(function (a, b) { return a + b; }, 0);
    if (!regionsOk(bd, lengths, free)) return false;
    // the tightest free square has to be the end of some trail
    var best = -1, bestN = 99, ties = 0;
    for (var i = 0; i < bd.n; i++) {
      if (bd.used[i] >= 0) continue;
      var n = bd.exits(i).length;
      if (n < bestN) { best = i; bestN = n; ties = 1; }
      else if (n === bestN && rng.int(++ties) === 0) best = i;
    }
    var kinds = rng.shuffle(lengths.filter(function (l, k) { return lengths.indexOf(l) === k; }));
    for (var j = 0; j < kinds.length; j++) {
      var len = kinds[j], rest = lengths.slice();
      rest.splice(rest.indexOf(len), 1);
      var stop = walk(bd, best, len, rng, level, 6, function (trail) {
        if (budget.left < 0) return true;
        var undo = mark(bd, trail, out.length);
        out.push(trail);
        if (fill(bd, rest, out, rng, level, budget)) return true;
        out.pop();
        unmark(bd, trail, undo);
        return false;
      });
      if (stop && out.length && budget.left >= 0) return true;
      if (budget.left < 0) return false;
    }
    return false;
  }

  // ---------- reading the grid back ----------
  // Every trail in the grid that spells word: [[square...]...], one for each set of squares.
  function traces(cells, cols, rows, word) {
    var out = [], seen = {}, n = cols * rows, path = [], on = new Uint8Array(n);
    function go(a, i) {
      if (cells[a] !== word[i] || on[a]) return;
      on[a] = 1; path.push(a);
      if (i === word.length - 1) {
        var key = path.slice().sort(function (x, y) { return x - y; }).join(',');
        if (!seen[key]) { seen[key] = 1; out.push(path.slice()); }
      } else {
        var r = Math.floor(a / cols), c = a % cols;
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          var R = r + dr, C = c + dc;
          if (R >= 0 && R < rows && C >= 0 && C < cols) go(R * cols + C, i + 1);
        }
      }
      path.pop(); on[a] = 0;
    }
    for (var a = 0; a < n; a++) go(a, 0);
    return out;
  }

  /*
   * In how many ways can these words cover the whole grid, each square once? Stops counting at
   * limit. cells: the letters square by square. A word that can only lie across the same squares
   * in another order counts once: the solver colours the same squares either way.
   */
  function solutions(cells, cols, rows, words, limit) {
    limit = limit || 2;
    var n = cols * rows, byCell = [], count = 0, used = new Uint8Array(n), wordUsed = new Uint8Array(words.length);
    for (var i = 0; i < n; i++) byCell.push([]);
    words.forEach(function (w, wi) {
      traces(cells, cols, rows, w).forEach(function (t) { t.forEach(function (a) { byCell[a].push({ wi: wi, t: t }); }); });
    });
    function go() {
      var a = -1, bestN = 1e9;
      for (var i = 0; i < n; i++) {
        if (used[i]) continue;
        var m = 0;
        for (var k = 0; k < byCell[i].length; k++) {
          var o = byCell[i][k];
          if (!wordUsed[o.wi] && o.t.every(function (x) { return !used[x]; })) m++;
        }
        if (m < bestN) { bestN = m; a = i; }
      }
      if (a < 0) { count++; return count >= limit; }
      if (!bestN) return false;
      for (var j = 0; j < byCell[a].length; j++) {
        var opt = byCell[a][j];
        if (wordUsed[opt.wi] || !opt.t.every(function (x) { return !used[x]; })) continue;
        wordUsed[opt.wi] = 1; opt.t.forEach(function (x) { used[x] = 1; });
        var stop = go();
        wordUsed[opt.wi] = 0; opt.t.forEach(function (x) { used[x] = 0; });
        if (stop) return true;
      }
      return false;
    }
    go();
    return count;
  }

  // Rude words in a straight line, forwards or backwards (found ones are returned).
  function rudeLines(cells, cols, rows) {
    var found = [], dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    RUDE.forEach(function (w) {
      var back = w.split('').reverse().join('');
      [w, back].forEach(function (x) {
        for (var a = 0; a < cols * rows; a++) {
          var r = Math.floor(a / cols), c = a % cols;
          for (var d = 0; d < 4; d++) {
            var ok = true;
            for (var i = 0; i < x.length; i++) {
              var R = r + dirs[d][0] * i, C = c + dirs[d][1] * i;
              if (R < 0 || R >= rows || C < 0 || C >= cols || cells[R * cols + C] !== x[i]) { ok = false; break; }
            }
            if (ok && found.indexOf(w) === -1) found.push(w);
          }
        }
      });
    });
    return found;
  }

  function isStraight(t, cols) {
    if (t.length < 3) return true;
    var d = t[1] - t[0];
    for (var i = 2; i < t.length; i++) if (t[i] - t[i - 1] !== d) return false;
    return true;
  }
  function longestRun(t) {
    var best = 2, run = 2;
    for (var i = 2; i < t.length; i++) {
      run = t[i] - t[i - 1] === t[i - 1] - t[i - 2] ? run + 1 : 2;
      if (run > best) best = run;
    }
    return t.length < 2 ? t.length : best;
  }

  // Do the trails feel like the level asks?
  function feelOk(trails, cols, level) {
    var straight = 0;
    for (var i = 0; i < trails.length; i++) {
      if (isStraight(trails[i], cols)) straight++;
      if (longestRun(trails[i]) > Math.max(level.maxRun, 3)) return false;
    }
    return straight <= Math.floor(level.maxStraight * trails.length);
  }

  // ---------- choosing the words ----------
  // Same word in another form, or one word inside the other: never two of these in one puzzle.
  function stem(w) { return w.replace(/(ING|ERS|ED|ES|ER|S|E)$/, ''); }
  // One word in two forms (GUEST, GUESTS).
  function sameWord(a, b) { return a === b || (stem(a).length >= 3 && stem(a) === stem(b)); }
  function related(a, b) { return a.indexOf(b) !== -1 || b.indexOf(a) !== -1 || sameWord(a, b); }

  /*
   * Sets of words whose letters add up to target, best first: earlier words are preferred (the AI
   * lists its best first) and so is a mix of lengths. opts: { min, max (how many words), seed, limit }.
   */
  function pick(words, target, opts) {
    var min = opts.min || 1, max = opts.max || 99, limit = opts.limit || 40, found = [], nodes = 0;
    var list = words.slice(0, 40);
    function go(i, chosen, left) {
      if (found.length >= 400 || ++nodes > 60000) return;
      if (!left) {
        if (chosen.length >= min && chosen.length <= max) found.push(chosen.slice());
        return;
      }
      if (i >= list.length || chosen.length >= max) return;
      var w = list[i];
      if (w.length <= left && !chosen.some(function (c) { return related(list[c], w); })) {
        chosen.push(i);
        go(i + 1, chosen, left - w.length);
        chosen.pop();
      }
      go(i + 1, chosen, left);
    }
    go(0, [], target);
    var rng = U.makeRng(String(opts.seed || 'pick'));
    return found.map(function (set) {
      var lens = {}, order = 0;
      set.forEach(function (i) { lens[list[i].length] = 1; order += i; });
      return { words: set.map(function (i) { return list[i]; }), score: order / set.length - Object.keys(lens).length * 1.2 + rng.next() * 0.5 };
    }).sort(function (a, b) { return a.score - b.score; }).slice(0, limit).map(function (x) { return x.words; });
  }

  /*
   * One puzzle. opts: { span (letters), words (chosen, adding up with the span to the grid), cols,
   * rows, level ('easy'|'medium'|'hard'), seed, avoid (words the solver must not find), tries }.
   * Returns { cols, rows, cells (letters by row), trails: [{ w, span, path: [[r, c]...] }], axis,
   * unique, decoys, tries } or null when no grid came out in the tries allowed.
   */
  function build(opts) {
    var cols = opts.cols, rows = opts.rows, span = opts.span, words = opts.words;
    var level = LEVELS[opts.level] || LEVELS.medium, rng = U.makeRng(String(opts.seed));
    var total = span.length + words.reduce(function (a, w) { return a + w.length; }, 0);
    if (total !== cols * rows) return null;
    var axes = [];
    if (span.length >= rows) axes.push('v');
    if (span.length >= cols) axes.push('h');
    if (!axes.length) return null;
    var lengths = words.map(function (w) { return w.length; });
    var tries = opts.tries || 300, all = [span].concat(words), fallback = null;
    for (var attempt = 0; attempt < tries; attempt++) {
      var bd = new Board(cols, rows), axis = rng.pick(axes), found = null, usedLevel = attempt > tries * 0.6 ? LEVELS.easy : level;
      spanTrail(bd, span.length, axis, rng, usedLevel, function (t) {
        var undo = mark(bd, t, 0);
        var out = [t], budget = { left: 400 };
        if (regionsOk(bd, lengths, cols * rows - span.length) && fill(bd, lengths, out, rng, usedLevel, budget) && budget.left >= 0 && out.length === words.length + 1) {
          found = out;
          return true;
        }
        unmark(bd, t, undo);
        return ++budget.left < -1e6;
      });
      if (!found) continue;
      if (!feelOk(found, cols, usedLevel)) continue;
      // which word goes on which trail: a few goes at one cutting of the grid
      for (var a = 0; a < 6; a++) {
        var cells = new Array(cols * rows), bag = {};
        words.forEach(function (w) { (bag[w.length] = bag[w.length] || []).push(w); });
        Object.keys(bag).forEach(function (k) { rng.shuffle(bag[k]); });
        var trails = found.map(function (t, i) {
          var w = i === 0 ? span : bag[t.length].pop();
          // the span reads from either edge; a word from either end
          var path = rng.next() < 0.5 ? t.slice() : t.slice().reverse();
          path.forEach(function (sq, k) { cells[sq] = w[k]; });
          return { w: w, span: i === 0, path: path };
        });
        if (rudeLines(cells, cols, rows).length) continue;
        var ways = solutions(cells, cols, rows, all, 2);
        if (ways !== 1) continue;
        var decoys = (opts.avoid || []).filter(function (w) { return traces(cells, cols, rows, w).length; });
        var grid = {
          cols: cols, rows: rows, axis: axis, unique: true, decoys: decoys, tries: attempt + 1,
          cells: U.range(0, rows - 1).map(function (r) { return cells.slice(r * cols, (r + 1) * cols); }),
          trails: trails.map(function (x) { return { w: x.w, span: x.span, path: x.path.map(function (sq) { return [Math.floor(sq / cols), sq % cols]; }) }; })
        };
        if (!decoys.length) return grid;
        if (!fallback) fallback = grid;
      }
    }
    return fallback;
  }

  /*
   * The whole check, from scratch, on a finished grid: for the tests and the safety net before printing.
   * Returns a list of problems (empty when the grid keeps every rule).
   */
  function check(g) {
    var out = [], cols = g.cols, rows = g.rows, seen = {}, block = {};
    g.trails.forEach(function (t) {
      if (t.path.length !== t.w.length) out.push(t.w + ': trail length');
      t.path.forEach(function (rc, i) {
        var k = rc[0] + ',' + rc[1];
        if (seen[k]) out.push('square ' + k + ' used twice');
        seen[k] = 1;
        if (g.cells[rc[0]][rc[1]] !== t.w[i]) out.push(t.w + ': letter ' + i + ' does not match');
        if (!i) return;
        var p = t.path[i - 1], dr = rc[0] - p[0], dc = rc[1] - p[1];
        if (Math.abs(dr) > 1 || Math.abs(dc) > 1 || (!dr && !dc)) out.push(t.w + ': squares not neighbours');
        if (dr && dc) {
          var key = Math.min(rc[0], p[0]) + ',' + Math.min(rc[1], p[1]), kind = dr === dc ? 'a' : 'b';
          if (block[key] && block[key] !== kind) out.push('lines cross at ' + key);
          block[key] = kind;
        }
      });
    });
    if (Object.keys(seen).length !== cols * rows) out.push('only ' + Object.keys(seen).length + ' of ' + cols * rows + ' squares used');
    var span = g.trails.filter(function (t) { return t.span; })[0];
    if (!span) out.push('no span word');
    else {
      var a = span.path[0], z = span.path[span.path.length - 1];
      var vert = (a[0] === 0 && z[0] === rows - 1) || (z[0] === 0 && a[0] === rows - 1);
      var horiz = (a[1] === 0 && z[1] === cols - 1) || (z[1] === 0 && a[1] === cols - 1);
      if (!vert && !horiz) out.push('the span word does not run edge to edge');
    }
    var flat = [];
    g.cells.forEach(function (row) { flat = flat.concat(row); });
    if (solutions(flat, cols, rows, g.trails.map(function (t) { return t.w; }), 2) !== 1) out.push('more than one way to solve it');
    return out;
  }

  CX.engine = { LEVELS: LEVELS, RUDE: RUDE, build: build, pick: pick, check: check, solutions: solutions, traces: traces, rudeLines: rudeLines, related: related, sameWord: sameWord, longestRun: longestRun, isStraight: isStraight };
})(typeof window !== 'undefined' ? window : globalThis);
