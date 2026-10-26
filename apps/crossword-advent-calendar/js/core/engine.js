/*
 * The crossword builder: a free-form criss-cross grid from a word list, the kind the advent
 * crossword books print (white squares only where letters go, no black squares to fill).
 *
 * Rules every grid keeps:
 *   - every answer crosses at least one other, and the grid is all one piece;
 *   - two answers never run side by side or end to end, so the grid holds no stray words;
 *   - a crossing is always one across and one down answer.
 * Many seeded attempts are made; the best keeps the most answers (up to the target), the most
 * crossings, a fair split of across and down, and fills the square it is built in.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  var ACROSS = 1, DOWN = 2;

  function Board(n) {
    this.n = n;
    this.ch = [];
    this.dir = [];
    for (var i = 0; i < n * n; i++) { this.ch.push(''); this.dir.push(0); }
    this.placed = [];
    this.filled = [];      // the squares with a letter, so spots() never scans the empty ones
  }
  Board.prototype.get = function (r, c) { return r < 0 || c < 0 || r >= this.n || c >= this.n ? '' : this.ch[r * this.n + c]; };

  // The number of crossings if word fits at r, c going d, or -1.
  Board.prototype.fits = function (word, r, c, d) {
    var n = this.n, dr = d === DOWN ? 1 : 0, dc = d === ACROSS ? 1 : 0, len = word.length;
    var er = r + dr * (len - 1), ec = c + dc * (len - 1);
    if (r < 0 || c < 0 || er >= n || ec >= n) return -1;
    if (this.get(r - dr, c - dc) || this.get(er + dr, ec + dc)) return -1;
    var cross = 0;
    for (var i = 0; i < len; i++) {
      var rr = r + dr * i, cc = c + dc * i, k = rr * n + cc, have = this.ch[k];
      if (have) {
        if (have !== word[i] || (this.dir[k] & d)) return -1;
        cross++;
      } else if (d === ACROSS ? (this.get(rr - 1, cc) || this.get(rr + 1, cc)) : (this.get(rr, cc - 1) || this.get(rr, cc + 1))) {
        return -1;
      }
    }
    return cross === len ? -1 : cross;
  };

  Board.prototype.put = function (entry, r, c, d) {
    var dr = d === DOWN ? 1 : 0, dc = d === ACROSS ? 1 : 0;
    for (var i = 0; i < entry.w.length; i++) {
      var k = (r + dr * i) * this.n + c + dc * i;
      if (!this.ch[k]) this.filled.push(k);
      this.ch[k] = entry.w[i];
      this.dir[k] |= d;
    }
    this.placed.push({ w: entry.w, c: entry.c, r: r, col: c, d: d });
  };

  // Every place word can cross the grid, with its crossing count.
  Board.prototype.spots = function (word) {
    var out = [], seen = {}, n = this.n;
    for (var f = 0; f < this.filled.length; f++) {
      var k = this.filled[f], have = this.ch[k];
      var r = Math.floor(k / n), c = k % n, free = this.dir[k] === ACROSS ? DOWN : this.dir[k] === DOWN ? ACROSS : 0;
      if (!free) continue;
      for (var i = 0; i < word.length; i++) {
        if (word[i] !== have) continue;
        var sr = free === DOWN ? r - i : r, sc = free === ACROSS ? c - i : c, key = sr * 64 + sc;
        if (seen[key + '|' + free]) continue;
        seen[key + '|' + free] = 1;
        var x = this.fits(word, sr, sc, free);
        if (x > 0) out.push({ r: sr, c: sc, d: free, x: x });
      }
    }
    return out;
  };

  Board.prototype.box = function () {
    var n = this.n, r0 = n, r1 = -1, c0 = n, c1 = -1;
    for (var k = 0; k < n * n; k++) {
      if (!this.ch[k]) continue;
      var r = Math.floor(k / n), c = k % n;
      if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c;
    }
    return { r0: r0, r1: r1, c0: c0, c1: c1, rows: r1 - r0 + 1, cols: c1 - c0 + 1 };
  };

  // The usable words: letters only, 3 letters up to the grid size, each answer once.
  function pool(words, n) {
    var seen = {}, out = [];
    words.forEach(function (x) {
      var w = String(x.w || '').toUpperCase();
      if (!/^[A-Z]+$/.test(w) || w.length < 3 || w.length > n || seen[w]) return;
      seen[w] = 1;
      out.push({ w: w, c: x.c });
    });
    return out;
  }

  // Adds words one at a time, each at the best place left, until none fits or the target is met.
  function grow(b, words, opt, rng) {
    var n = opt.size, mid = Math.floor(n / 2), counts = [0, 0, 0];
    b.placed.forEach(function (p) { counts[p.d]++; });
    while (b.placed.length < opt.target && words.length) {
      var best = null;
      for (var i = 0; i < words.length; i++) {
        var spots = b.spots(words[i].w);
        for (var j = 0; j < spots.length; j++) {
          var s = spots[j], len = words[i].w.length;
          var cr = s.r + (s.d === DOWN ? len / 2 : 0), cc = s.c + (s.d === ACROSS ? len / 2 : 0);
          var score = s.x * 6 + len * 0.6 - (Math.abs(cr - mid) + Math.abs(cc - mid)) * 0.35 +
            (counts[s.d] <= counts[3 - s.d] ? 2.5 : 0) + rng.next() * 5;
          if (!best || score > best.score) best = { i: i, s: s, score: score };
        }
      }
      if (!best) break;
      b.put(words[best.i], best.s.r, best.s.c, best.s.d);
      counts[best.s.d]++;
      words.splice(best.i, 1);
    }
    return words;
  }

  function attempt(list, opt, rng) {
    var n = opt.size, b = new Board(n), mid = Math.floor(n / 2);
    var words = rng.shuffle(list.slice());
    // longest first, with a little shuffle among similar lengths
    words.sort(function (a, z) { return z.w.length - a.w.length + (rng.next() - 0.5) * 2.2; });
    var first = 0;
    if (opt.letter) {
      var withL = words.map(function (x, i) { return x.w.indexOf(opt.letter) !== -1 ? i : -1; }).filter(function (i) { return i >= 0; });
      if (withL.length) first = withL[rng.int(Math.min(3, withL.length))];
    } else first = rng.int(Math.min(3, words.length));
    var w0 = words.splice(first, 1)[0], d0 = rng.next() < 0.5 ? ACROSS : DOWN;
    var off = Math.floor((n - w0.w.length) / 2) + (rng.int(3) - 1);
    off = Math.max(0, Math.min(n - w0.w.length, off));
    var row = mid + rng.int(3) - 1;
    if (d0 === ACROSS) b.put(w0, row, off, ACROSS); else b.put(w0, off, row, DOWN);
    b.rest = grow(b, words, opt, rng);
    return b;
  }

  // A board with these answers at their places.
  function rebuild(n, placed) {
    var b = new Board(n);
    placed.forEach(function (p) { b.put(p, p.r, p.col, p.d); });
    return b;
  }

  function connected(b) {
    if (!b.filled.length) return true;
    var n = b.n, seen = {}, stack = [b.filled[0]], count = 0;
    seen[b.filled[0]] = 1;
    while (stack.length) {
      var k = stack.pop(), r = Math.floor(k / n), c = k % n;
      count++;
      [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]].forEach(function (q) {
        if (q[0] < 0 || q[1] < 0 || q[0] >= n || q[1] >= n) return;
        var kk = q[0] * n + q[1];
        if (b.ch[kk] && !seen[kk]) { seen[kk] = 1; stack.push(kk); }
      });
    }
    return count === b.filled.length;
  }

  /*
   * Local repair: take one answer out (when the grid stays in one piece) and grow again with
   * every word left over. Kept when more answers fit, or as many with more crossings.
   */
  function improve(b, opt, rng) {
    var tried = 0;
    for (var round = 0; round < 10 && b.placed.length < opt.target && b.rest.length; round++) {
      var order = rng.shuffle(b.placed.map(function (p, i) { return i; })), better = null;
      for (var k = 0; k < order.length && !better; k++) {
        var keep = b.placed.filter(function (p, i) { return i !== order[k]; });
        var nb = rebuild(b.n, keep);
        if (!connected(nb)) continue;
        tried++;
        var out = b.placed[order[k]];
        nb.rest = grow(nb, b.rest.slice().concat([{ w: out.w, c: out.c }]), opt, rng);
        if (nb.placed.length > b.placed.length || (nb.placed.length === b.placed.length && crossings(nb) > crossings(b) && !opt.letterMissing(nb))) better = nb;
      }
      if (!better || opt.letterMissing(better)) break;
      b = better;
    }
    return b;
  }

  function crossings(b) { var x = 0; for (var k = 0; k < b.dir.length; k++) if (b.dir[k] === 3) x++; return x; }

  function rate(b, opt) {
    var bx = b.box(), a = 0, d = 0, hasL = !opt.letter;
    b.placed.forEach(function (p) { if (p.d === ACROSS) a++; else d++; if (!hasL && p.w.indexOf(opt.letter) !== -1) hasL = true; });
    return b.placed.length * 100 + crossings(b) * 5 + (bx.rows + bx.cols) * 2.5 - Math.abs(a - d) * 6 - Math.abs(bx.rows - bx.cols) * 2 - (hasL ? 0 : 100000);
  }

  // Numbers in reading order where an answer starts; entries trimmed to the grid's box.
  function finish(b) {
    var bx = b.box(), n = b.n, rows = bx.rows, cols = bx.cols, cells = [], r, c;
    for (r = 0; r < rows; r++) { var line = []; for (c = 0; c < cols; c++) line.push(b.ch[(r + bx.r0) * n + c + bx.c0]); cells.push(line); }
    var entries = b.placed.map(function (p) { return { w: p.w, c: p.c, r: p.r - bx.r0, col: p.col - bx.c0, dir: p.d === ACROSS ? 'A' : 'D' }; });
    var starts = {};
    entries.forEach(function (e) { starts[e.r + ',' + e.col] = 1; });
    var num = 0, nums = {};
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) if (starts[r + ',' + c]) nums[r + ',' + c] = ++num;
    entries.forEach(function (e) { e.num = nums[e.r + ',' + e.col]; });
    entries.sort(function (x, y) { return x.dir === y.dir ? x.num - y.num : x.dir === 'A' ? -1 : 1; });
    return { rows: rows, cols: cols, cells: cells, entries: entries, nums: nums, crossings: crossings(b) };
  }

  /*
   * words: [{ w, c }]; opt: { size, target, letter (one the grid must hold), seed, attempts }.
   * Returns { rows, cols, cells (letters, '' for no square), entries: [{ w, c, r, col, dir, num }],
   * nums, crossings, unused: [{ w, c }] } or null when fewer than two words can be used.
   */
  function build(words, opt) {
    var list = pool(words, opt.size);
    if (list.length < 2) return null;
    var rng = CX.util.makeRng(opt.seed), tries = opt.attempts || 40, all = [];
    opt = Object.assign({}, opt, {
      letterMissing: function (b) { return !!opt.letter && !b.placed.some(function (p) { return p.w.indexOf(opt.letter) !== -1; }); }
    });
    for (var t = 0; t < tries; t++) { var b = attempt(list, opt, rng); all.push({ b: b, s: rate(b, opt) }); }
    // the best few attempts get the repair pass
    all.sort(function (x, y) { return y.s - x.s; });
    var best = all[0].b, bestScore = all[0].s;
    all.slice(0, 8).forEach(function (x) {
      var nb = improve(x.b, opt, rng), s = rate(nb, opt);
      if (s > bestScore) { bestScore = s; best = nb; }
    });
    var out = finish(best), used = {};
    out.entries.forEach(function (e) { used[e.w] = 1; });
    out.unused = list.filter(function (x) { return !used[x.w]; });
    return out;
  }

  // Checks a finished grid against the rules above (used by the tests and the app's self-check).
  function check(g) {
    var problems = [], rows = g.rows, cols = g.cols, cover = [];
    for (var r = 0; r < rows; r++) { cover.push([]); for (var c = 0; c < cols; c++) cover[r].push(0); }
    function at(r, c) { return r < 0 || c < 0 || r >= rows || c >= cols ? '' : g.cells[r][c]; }
    g.entries.forEach(function (e) {
      var dr = e.dir === 'D' ? 1 : 0, dc = e.dir === 'A' ? 1 : 0;
      if (at(e.r - dr, e.col - dc) || at(e.r + dr * e.w.length, e.col + dc * e.w.length)) problems.push(e.w + ' runs into another answer');
      for (var i = 0; i < e.w.length; i++) {
        var rr = e.r + dr * i, cc = e.col + dc * i;
        if (at(rr, cc) !== e.w[i]) problems.push(e.w + ' does not match the grid');
        cover[rr][cc] |= dc ? 1 : 2;
      }
    });
    // every run of two or more letters is an answer
    var runs = {};
    g.entries.forEach(function (e) { runs[e.dir + e.r + ',' + e.col + ',' + e.w.length] = 1; });
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      if (!at(r, c)) continue;
      if (!at(r, c - 1) && at(r, c + 1)) { var l = 0; while (at(r, c + l)) l++; if (!runs['A' + r + ',' + c + ',' + l]) problems.push('stray across letters at ' + r + ',' + c); }
      if (!at(r - 1, c) && at(r + 1, c)) { var m = 0; while (at(r + m, c)) m++; if (!runs['D' + r + ',' + c + ',' + m]) problems.push('stray down letters at ' + r + ',' + c); }
      if (!cover[r][c]) problems.push('a square with no answer at ' + r + ',' + c);
    }
    // one piece
    var seen = {}, stack = [], total = 0;
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) if (at(r, c)) { total++; if (!stack.length && !Object.keys(seen).length) { stack.push([r, c]); seen[r + ',' + c] = 1; } }
    while (stack.length) {
      var p = stack.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var k = (p[0] + d[0]) + ',' + (p[1] + d[1]);
        if (at(p[0] + d[0], p[1] + d[1]) && !seen[k]) { seen[k] = 1; stack.push([p[0] + d[0], p[1] + d[1]]); }
      });
    }
    if (Object.keys(seen).length !== total) problems.push('the grid is in more than one piece');
    return problems;
  }

  CX.engine = { build: build, check: check, pool: pool };
})(typeof window !== 'undefined' ? window : globalThis);
