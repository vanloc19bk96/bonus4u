/*
 * engine.js: the Slitherlink engine. Pure computation, no DOM, no globals.
 *
 * Everything lives inside one factory function so the exact same source can run on the
 * page (for checks and the fallback path) and inside a Blob worker: workers.js turns
 * SlitherEngineFactory.toString() into the worker script, which is the only way to start a
 * worker from a page opened over file://.
 *
 * A puzzle is a grid of R x C cells between (R + 1) x (C + 1) dots. The answer is one
 * closed loop along the dotted lines; a number in a cell says how many of its four sides
 * the loop uses. The loop is made as the border of a random region of cells (the inside),
 * so it is always a single loop that never crosses or branches.
 *
 * Levels come from the techniques a person needs (see rate()):
 *   tier 1  Easy    counting a cell's sides, a dot takes 0 or 2 lines, never close a small loop
 *   tier 2  Medium  corner logic: two lines at a dot that go "together" or "one of two"
 *                   (3 or 1 in a corner, 3 next to 3, diagonal 3s, 2s passing it on)
 *   tier 3  Hard    inside / outside: cells on the same side of the loop, followed far away
 *   tier 4  Expert  short what-ifs: try a line, follow the easy rules, see it break
 * Every deduction is sound, so a puzzle the rater finishes has exactly one solution.
 * generate() confirms that with a separate brute-force counter that shares no code with
 * the rater.
 *
 * Determinism: every random choice comes from a PRNG seeded by a string key, and there are
 * no time-based limits (only step counters), so the same key always gives the same puzzle.
 */
function SlitherEngineFactory() {
  'use strict';

  var SIZES = [5, 7, 10, 12, 15, 20, 25];
  var LEVELS = ['easy', 'medium', 'hard', 'expert'];
  // Levels each grid size offers. Small grids are too small for the hardest logic.
  var SIZE_LEVELS = {
    5: ['easy', 'medium'],
    7: ['easy', 'medium', 'hard'],
    10: LEVELS, 12: LEVELS, 15: LEVELS, 20: LEVELS, 25: LEVELS
  };
  var MAX_ATTEMPTS = 40;
  var COUNT_NODES = 400000;   // brute-force counter budget
  var COUNT_MAX_SIZE = 10;
  var EXPERT_TRIES = 60;      // removals tried with what-if logic after the Hard dig    // grids the counter double-checks while generating

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
    var rng = {
      next: next,
      float: function () { return next() / 4294967296; },
      int: function (n) { return Math.floor(next() / 4294967296 * n); },
      pick: function (arr) { return arr[rng.int(arr.length)]; },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = rng.int(i + 1), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      }
    };
    return rng;
  }

  // ------------------------------------------------------------------ level rules
  // tier: the hardest technique allowed. minTier: the puzzle must need at least this.
  // fill: after digging to a minimal set, clues are added back up to this share of the
  // cells (only while the puzzle still needs its level's logic), so easy books feel easy.
  function levelRules(n, level) {
    if (!SIZE_LEVELS[n] || SIZE_LEVELS[n].indexOf(level) < 0) return null;
    switch (level) {
      case 'easy': return { tier: 1, minTier: 1, fill: n <= 5 ? 0.6 : 0.5 };
      case 'medium': return { tier: 2, minTier: 2, fill: n <= 5 ? 0.5 : 0.4 };
      case 'hard': return { tier: 3, minTier: n <= 7 ? 2 : 3, fill: 0 };
      case 'expert': return { tier: 4, minTier: 4, fill: 0 };
    }
    return null;
  }

  // ------------------------------------------------------------------ geometry
  // Edges: horizontal ones first (row r = 0..R of dots, column c = 0..C-1), then vertical
  // ones (row r = 0..R-1, dot column c = 0..C). Dots: r * (C + 1) + c.
  var geoCache = {};
  function geo(R, C) {
    var key = R + 'x' + C;
    if (geoCache[key]) return geoCache[key];
    var HN = (R + 1) * C, E = HN + R * (C + 1), V = (R + 1) * (C + 1), N = R * C, r, c, i;
    function h(r, c) { return r * C + c; }
    function v(r, c) { return HN + r * (C + 1) + c; }
    function dot(r, c) { return r * (C + 1) + c; }
    var cellE = new Int32Array(N * 4), edgeV = new Int32Array(E * 2), edgeC = new Int32Array(E * 2);
    var dotE = new Int32Array(V * 4).fill(-1), dotC = new Int32Array(V * 4);
    for (r = 0; r < R; r++) {
      for (c = 0; c < C; c++) {
        i = r * C + c;
        cellE[i * 4] = h(r, c); cellE[i * 4 + 1] = v(r, c + 1); cellE[i * 4 + 2] = h(r + 1, c); cellE[i * 4 + 3] = v(r, c);
      }
    }
    for (r = 0; r <= R; r++) {
      for (c = 0; c < C; c++) {
        i = h(r, c);
        edgeV[i * 2] = dot(r, c); edgeV[i * 2 + 1] = dot(r, c + 1);
        edgeC[i * 2] = r > 0 ? (r - 1) * C + c : N; edgeC[i * 2 + 1] = r < R ? r * C + c : N;
      }
    }
    for (r = 0; r < R; r++) {
      for (c = 0; c <= C; c++) {
        i = v(r, c);
        edgeV[i * 2] = dot(r, c); edgeV[i * 2 + 1] = dot(r + 1, c);
        edgeC[i * 2] = c > 0 ? r * C + c - 1 : N; edgeC[i * 2 + 1] = c < C ? r * C + c : N;
      }
    }
    function cellAt(r, c) { return r >= 0 && r < R && c >= 0 && c < C ? r * C + c : N; }
    for (r = 0; r <= R; r++) {
      for (c = 0; c <= C; c++) {
        i = dot(r, c);
        if (r > 0) dotE[i * 4] = v(r - 1, c);       // up
        if (c < C) dotE[i * 4 + 1] = h(r, c);       // right
        if (r < R) dotE[i * 4 + 2] = v(r, c);       // down
        if (c > 0) dotE[i * 4 + 3] = h(r, c - 1);   // left
        // The four cells around the dot: NW, NE, SE, SW (N = outside the grid).
        dotC[i * 4] = cellAt(r - 1, c - 1); dotC[i * 4 + 1] = cellAt(r - 1, c);
        dotC[i * 4 + 2] = cellAt(r, c); dotC[i * 4 + 3] = cellAt(r, c - 1);
      }
    }
    // Corners of each cell: [dot, slot of the cell's first side, slot of its second side,
    // index of the first side in the cell (0 top, 1 right, 2 bottom, 3 left), second side].
    var corner = new Int32Array(N * 4 * 5);
    for (r = 0; r < R; r++) {
      for (c = 0; c < C; c++) {
        i = r * C + c;
        var defs = [
          [dot(r, c), 1, 2, 0, 3],          // top-left: top is the dot's right, left its down
          [dot(r, c + 1), 3, 2, 0, 1],      // top-right: top is the dot's left, right its down
          [dot(r + 1, c + 1), 3, 0, 2, 1],  // bottom-right: bottom is left, right is up
          [dot(r + 1, c), 1, 0, 2, 3]       // bottom-left: bottom is right, left is up
        ];
        for (var k = 0; k < 4; k++) for (var q = 0; q < 5; q++) corner[(i * 4 + k) * 5 + q] = defs[k][q];
      }
    }
    var g = {
      R: R, C: C, HN: HN, E: E, V: V, N: N,
      cellE: cellE, edgeV: edgeV, edgeC: edgeC, dotE: dotE, dotC: dotC, corner: corner,
      h: h, v: v, dot: dot
    };
    geoCache[key] = g;
    return g;
  }

  // Edge joining two neighbouring dots, or -1.
  function edgeBetween(g, a, b) {
    var C1 = g.C + 1, ra = (a / C1) | 0, ca = a % C1, rb = (b / C1) | 0, cb = b % C1;
    if (ra === rb && Math.abs(ca - cb) === 1) return g.h(ra, Math.min(ca, cb));
    if (ca === cb && Math.abs(ra - rb) === 1) return g.v(Math.min(ra, rb), ca);
    return -1;
  }

  // Pair index of two of a dot's four slots.
  var PAIR = [[-1, 0, 1, 2], [0, -1, 3, 4], [1, 3, -1, 5], [2, 4, 5, -1]];
  var POP4 = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

  // ------------------------------------------------------------------ the loop
  // A random region of cells whose border is one simple loop: the region is connected,
  // the cells outside it stay connected to the outside of the grid (no holes), and no two
  // region cells touch only at a corner (that dot would take four lines).
  function randomLoop(R, C, rng) {
    var N = R * C, inside = new Uint8Array(N), count = 0;
    var target = Math.round(N * (0.5 + rng.float() * 0.14));
    var start = (1 + rng.int(Math.max(1, R - 2))) * C + 1 + rng.int(Math.max(1, C - 2));
    if (R < 3 || C < 3) start = rng.int(N);
    inside[start] = 1; count = 1;
    var frontier = [], inF = new Uint8Array(N), seen = new Int32Array(N), stamp = 0, queue = new Int32Array(N);
    function at(r, c) { return r >= 0 && r < R && c >= 0 && c < C ? inside[r * C + c] : 0; }
    function addFrontier(i) {
      var r = (i / C) | 0, c = i % C;
      [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(function (p) {
        if (p[0] < 0 || p[0] >= R || p[1] < 0 || p[1] >= C) return;
        var j = p[0] * C + p[1];
        if (!inside[j] && !inF[j]) { inF[j] = 1; frontier.push(j); }
      });
    }
    function insideNeighbours(i) {
      var r = (i / C) | 0, c = i % C;
      return at(r - 1, c) + at(r + 1, c) + at(r, c - 1) + at(r, c + 1);
    }
    function pinches(i) {
      var r = (i / C) | 0, c = i % C;
      inside[i] = 1;
      var bad = false;
      for (var dr = -1; dr <= 0 && !bad; dr++) {
        for (var dc = -1; dc <= 0 && !bad; dc++) {
          var a = at(r + dr, c + dc), b = at(r + dr, c + dc + 1), d = at(r + dr + 1, c + dc), e = at(r + dr + 1, c + dc + 1);
          if (a === e && b === d && a !== b) bad = true;
        }
      }
      inside[i] = 0;
      return bad;
    }
    // Would the outside still be one piece, connected to the grid's edge, without cell x?
    function outsideStaysWhole(x) {
      stamp++;
      var head = 0, tail = 0, reached = 0, total = N - count - 1, i, r, c;
      seen[x] = stamp;
      for (i = 0; i < N; i++) {
        r = (i / C) | 0; c = i % C;
        if ((r === 0 || c === 0 || r === R - 1 || c === C - 1) && !inside[i] && seen[i] !== stamp) {
          seen[i] = stamp; queue[tail++] = i; reached++;
        }
      }
      while (head < tail) {
        i = queue[head++]; r = (i / C) | 0; c = i % C;
        if (r > 0) visit(i - C);
        if (r < R - 1) visit(i + C);
        if (c > 0) visit(i - 1);
        if (c < C - 1) visit(i + 1);
      }
      function visit(j) {
        if (inside[j] || seen[j] === stamp) return;
        seen[j] = stamp; queue[tail++] = j; reached++;
      }
      return reached === total;
    }
    addFrontier(start);
    var fails = 0;
    while (count < target && frontier.length && fails < N * 4) {
      // Prefer cells with few region neighbours: the loop snakes instead of making a blob.
      var best = -1, bestN = 9;
      var tries = rng.float() < 0.9 ? 5 : 1;
      for (var t = 0; t < tries; t++) {
        var k = rng.int(frontier.length), cand = frontier[k];
        if (inside[cand]) { frontier[k] = frontier[frontier.length - 1]; frontier.pop(); t--; if (!frontier.length) break; continue; }
        var nb = insideNeighbours(cand);
        if (nb < bestN) { bestN = nb; best = k; }
      }
      if (best < 0 || !frontier.length) break;
      var x = frontier[best];
      if (pinches(x) || !outsideStaysWhole(x)) { fails++; continue; }
      inside[x] = 1; count++;
      frontier[best] = frontier[frontier.length - 1]; frontier.pop();
      inF[x] = 0;
      addFrontier(x);
    }
    return inside;
  }

  function loopEdges(g, inside) {
    var on = new Uint8Array(g.E);
    for (var e = 0; e < g.E; e++) {
      var a = g.edgeC[e * 2], b = g.edgeC[e * 2 + 1];
      on[e] = (a < g.N ? inside[a] : 0) !== (b < g.N ? inside[b] : 0) ? 1 : 0;
    }
    return on;
  }

  function cluesOf(g, on) {
    var clues = new Int8Array(g.N);
    for (var i = 0; i < g.N; i++) {
      clues[i] = on[g.cellE[i * 4]] + on[g.cellE[i * 4 + 1]] + on[g.cellE[i * 4 + 2]] + on[g.cellE[i * 4 + 3]];
    }
    return clues;
  }

  // ------------------------------------------------------------------ the rater
  // Edge states: 0 unknown, 1 line, 2 cross (no line).
  function newState(g) {
    var st = {
      e: new Int8Array(g.E), vl: new Int8Array(g.V), vu: new Int8Array(g.V),
      cl: new Int8Array(g.N), cu: new Int8Array(g.N).fill(4),
      partner: new Int32Array(g.V).fill(-1), plen: new Int32Array(g.V),
      rel: new Int8Array(g.V * 6),                         // 0 unknown, 1 same, 2 different
      ufp: null, ufx: null,                                // inside/outside classes (tier 3)
      lines: 0, unknown: g.E, closed: false, sweep: false, bad: false, budget: 1e9,
      q: new Int32Array(g.N + g.V), qh: 0, qt: 0, inQ: new Uint8Array(g.N + g.V), ends: []
    };
    for (var d = 0; d < g.V; d++) {
      var n = 0;
      for (var k = 0; k < 4; k++) if (g.dotE[d * 4 + k] >= 0) n++;
      st.vu[d] = n;
    }
    return st;
  }

  function copyState(g, s) {
    return {
      e: s.e.slice(), vl: s.vl.slice(), vu: s.vu.slice(), cl: s.cl.slice(), cu: s.cu.slice(),
      partner: s.partner.slice(), plen: s.plen.slice(), rel: s.rel.slice(),
      ufp: s.ufp ? s.ufp.slice() : null, ufx: s.ufx ? s.ufx.slice() : null,
      lines: s.lines, unknown: s.unknown, closed: s.closed, sweep: s.sweep, bad: s.bad, budget: 1e9,
      q: new Int32Array(g.N + g.V), qh: 0, qt: 0, inQ: new Uint8Array(g.N + g.V), ends: []
    };
  }

  function push(st, item) {
    if (st.inQ[item]) return;
    st.inQ[item] = 1;
    st.q[st.qt++] = item;
    if (st.qt === st.q.length) st.qt = 0;
  }

  // Sets edge e to 1 (line) or 2 (cross). Returns true when it changed anything.
  function setEdge(g, st, e, val) {
    var cur = st.e[e];
    if (cur === val) return false;
    if (cur) { st.bad = true; return false; }
    st.e[e] = val;
    st.unknown--;
    st.budget--;
    var u = g.edgeV[e * 2], w = g.edgeV[e * 2 + 1], a = g.edgeC[e * 2], b = g.edgeC[e * 2 + 1];
    st.vu[u]--; st.vu[w]--;
    if (a < g.N) st.cu[a]--;
    if (b < g.N) st.cu[b]--;
    if (val === 1) {
      if (st.vl[u] >= 2 || st.vl[w] >= 2) { st.bad = true; return true; }
      if (a < g.N) st.cl[a]++;
      if (b < g.N) st.cl[b]++;
      st.lines++;
      if (st.vl[u] === 1 && st.vl[w] === 1 && st.partner[u] === w) {
        // The line closes a loop: it must hold every line of the puzzle.
        st.closed = true;
        st.sweep = true;
        if (st.plen[u] + 1 !== st.lines) st.bad = true;
      } else {
        var ea = st.vl[u] ? st.partner[u] : u, eb = st.vl[w] ? st.partner[w] : w;
        var len = (st.vl[u] ? st.plen[u] : 0) + (st.vl[w] ? st.plen[w] : 0) + 1;
        st.partner[ea] = eb; st.partner[eb] = ea; st.plen[ea] = len; st.plen[eb] = len;
        st.ends.push(ea);
      }
      st.vl[u]++; st.vl[w]++;
    }
    push(st, g.N + u); push(st, g.N + w);
    if (a < g.N) push(st, a);
    if (b < g.N) push(st, b);
    return true;
  }

  // Would closing the path that ends at dot a (through edge f) finish the puzzle?
  function closingFinishes(g, st, clues, f) {
    if (st.plen[g.edgeV[f * 2]] !== st.lines) return false;
    var a = g.edgeC[f * 2], b = g.edgeC[f * 2 + 1];
    for (var i = 0; i < g.N; i++) {
      if (clues[i] < 0) continue;
      var n = st.cl[i] + (i === a || i === b ? 1 : 0);
      if (n !== clues[i]) return false;
    }
    return true;
  }

  // Never close a loop early: if the two ends of a path are neighbours, the edge between
  // them stays empty unless that loop would be the whole answer.
  function checkEnd(g, st, clues, d) {
    if (st.vl[d] !== 1) return;
    var p = st.partner[d];
    if (p < 0 || st.vl[p] !== 1) return;
    var f = edgeBetween(g, d, p);
    if (f < 0 || st.e[f]) return;
    if (!closingFinishes(g, st, clues, f)) setEdge(g, st, f, 2);
  }

  // Tier 1: counting rules on cells and dots, plus the small-loop rule. Runs to a fixpoint.
  function propagate(g, st, clues) {
    var e, k, d, i;
    while (!st.bad && st.budget > 0) {
      if (st.qh === st.qt && !st.inQ[st.q[st.qh]]) {
        // Queue empty: check new path ends, then stop if nothing was added.
        if (st.sweep) { st.sweep = false; for (e = 0; e < g.E; e++) if (!st.e[e]) setEdge(g, st, e, 2); continue; }
        if (!st.ends.length) break;
        var ends = st.ends; st.ends = [];
        for (k = 0; k < ends.length; k++) checkEnd(g, st, clues, ends[k]);
        continue;
      }
      var item = st.q[st.qh];
      st.inQ[item] = 0;
      st.qh++;
      if (st.qh === st.q.length) st.qh = 0;
      if (st.sweep) {
        // The loop is closed: every other edge is empty.
        st.sweep = false;
        for (e = 0; e < g.E; e++) if (!st.e[e]) setEdge(g, st, e, 2);
      }
      if (item < g.N) {
        i = item;
        var n = clues[i];
        if (n < 0) continue;
        if (st.cl[i] > n || st.cl[i] + st.cu[i] < n) { st.bad = true; break; }
        if (!st.cu[i]) continue;
        var fill = st.cl[i] === n ? 2 : st.cl[i] + st.cu[i] === n ? 1 : 0;
        if (fill) for (k = 0; k < 4; k++) { e = g.cellE[i * 4 + k]; if (!st.e[e]) setEdge(g, st, e, fill); }
      } else {
        d = item - g.N;
        var l = st.vl[d], u = st.vu[d];
        if (l > 2 || (l === 1 && u === 0)) { st.bad = true; break; }
        if (!u) continue;
        var val = l === 2 ? 2 : l === 1 && u === 1 ? 1 : l === 0 && u === 1 ? 2 : 0;
        if (val) for (k = 0; k < 4; k++) { e = g.dotE[d * 4 + k]; if (e >= 0 && !st.e[e]) setEdge(g, st, e, val); }
      }
    }
    return !st.bad;
  }

  function seedQueue(g, st, clues) {
    for (var i = 0; i < g.N; i++) if (clues[i] >= 0) push(st, i);
    for (var d = 0; d < g.V; d++) push(st, g.N + d);
  }

  // ---- tier 2: corner logic. For each dot, the six pairs of its lines are "same" (both
  // lines or both empty) or "different" (exactly one line). Dots and numbered cells are
  // solved by trying every way their sides can be, keeping only what fits everything known.
  function setRel(st, d, p, val) {
    var cur = st.rel[d * 6 + p];
    if (cur === val) return false;
    if (cur) { st.bad = true; return false; }
    st.rel[d * 6 + p] = val;
    return true;
  }

  function dotPass(g, st, useColor) {
    var progress = false, d, k, m, j;
    var slots = [0, 0, 0, 0], exist = [0, 0, 0, 0];
    for (d = 0; d < g.V && !st.bad; d++) {
      if (!st.vu[d] && !useColor) continue;
      for (k = 0; k < 4; k++) { slots[k] = g.dotE[d * 4 + k]; exist[k] = slots[k] >= 0 ? 1 : 0; }
      // Colour classes of the four cells around the dot, for tier 3.
      var cls = null;
      if (useColor) {
        cls = [];
        for (k = 0; k < 4; k++) { var cc = g.dotC[d * 4 + k]; cls.push(find(st, cc)); cls.push(parityTo(st, cc)); }
      }
      var okAll = 15, okNone = 15, okSame = 63, okDiff = 63, any = false, xorOk = [3, 3, 3, 3, 3, 3];
      for (m = 0; m < 16; m++) {
        var pc = POP4[m];
        if (pc !== 0 && pc !== 2) continue;
        var fits = true;
        for (k = 0; k < 4 && fits; k++) {
          var bit = (m >> k) & 1;
          if (!exist[k]) { if (bit) fits = false; continue; }
          var s = st.e[slots[k]];
          if (s && (s === 1) !== (bit === 1)) fits = false;
        }
        for (k = 0; k < 4 && fits; k++) {
          for (j = k + 1; j < 4 && fits; j++) {
            if (!exist[k] || !exist[j]) continue;
            var rv = st.rel[d * 6 + PAIR[k][j]];
            if (rv === 1 && ((m >> k) & 1) !== ((m >> j) & 1)) fits = false;
            if (rv === 2 && ((m >> k) & 1) === ((m >> j) & 1)) fits = false;
          }
        }
        // Edges around a dot in order up, right, down, left sit between cells
        // NW|NE, NE|SE, SE|SW, SW|NW. Cells known to be on the same side (or opposite
        // sides) fix the parity of the edges between them.
        var cellBits = null;
        if (fits && cls) {
          // Walk NW -> NE -> SE -> SW: colour of cell k relative to NW.
          cellBits = [0, (m & 1), (m & 1) ^ ((m >> 1) & 1), (m & 1) ^ ((m >> 1) & 1) ^ ((m >> 2) & 1)];
          for (k = 0; k < 4 && fits; k++) {
            for (j = k + 1; j < 4 && fits; j++) {
              if (cls[k * 2] === cls[j * 2] && ((cls[k * 2 + 1] ^ cls[j * 2 + 1]) !== (cellBits[k] ^ cellBits[j]))) fits = false;
            }
          }
        }
        if (!fits) continue;
        any = true;
        okAll &= m; okNone &= ~m;
        for (k = 0; k < 4; k++) {
          for (j = k + 1; j < 4; j++) {
            var same = ((m >> k) & 1) === ((m >> j) & 1), p = PAIR[k][j];
            if (same) okDiff &= ~(1 << p); else okSame &= ~(1 << p);
          }
        }
        if (cellBits) {
          for (k = 0; k < 4; k++) for (j = k + 1; j < 4; j++) xorOk[PAIR[k][j]] &= (cellBits[k] ^ cellBits[j]) ? 2 : 1;
        }
      }
      if (!any) { st.bad = true; break; }
      for (k = 0; k < 4; k++) {
        if (!exist[k] || st.e[slots[k]]) continue;
        if ((okAll >> k) & 1) progress = setEdge(g, st, slots[k], 1) || progress;
        else if ((okNone >> k) & 1) progress = setEdge(g, st, slots[k], 2) || progress;
      }
      for (k = 0; k < 4; k++) {
        for (j = k + 1; j < 4; j++) {
          if (!exist[k] || !exist[j]) continue;
          var pp = PAIR[k][j];
          if ((okSame >> pp) & 1) progress = setRel(st, d, pp, 1) || progress;
          else if ((okDiff >> pp) & 1) progress = setRel(st, d, pp, 2) || progress;
        }
      }
      if (cls) {
        for (k = 0; k < 4; k++) {
          for (j = k + 1; j < 4; j++) {
            var xo = xorOk[PAIR[k][j]];
            if (xo === 1 || xo === 2) progress = union(st, g.dotC[d * 4 + k], g.dotC[d * 4 + j], xo === 2 ? 1 : 0) || progress;
          }
        }
      }
    }
    return progress;
  }

  function cellPass(g, st, clues, useColor) {
    var progress = false, i, k, j, m;
    var es = [0, 0, 0, 0], nb = [0, 0, 0, 0];
    for (i = 0; i < g.N && !st.bad; i++) {
      var n = clues[i];
      if (n < 0) continue;
      if (!st.cu[i] && !useColor) continue;
      for (k = 0; k < 4; k++) {
        es[k] = g.cellE[i * 4 + k];
        var a = g.edgeC[es[k] * 2], b = g.edgeC[es[k] * 2 + 1];
        nb[k] = a === i ? b : a;
      }
      var cls = null;
      if (useColor) { cls = []; for (k = 0; k < 4; k++) { cls.push(find(st, nb[k])); cls.push(parityTo(st, nb[k])); } }
      var okAll = 15, okNone = 15, any = false, sameOk = [1, 1, 1, 1], diffOk = [1, 1, 1, 1];
      var xorOk = [3, 3, 3, 3, 3, 3];
      for (m = 0; m < 16; m++) {
        if (POP4[m] !== n) continue;
        var fits = true;
        for (k = 0; k < 4 && fits; k++) {
          var s = st.e[es[k]];
          if (s && (s === 1) !== (((m >> k) & 1) === 1)) fits = false;
        }
        for (k = 0; k < 4 && fits; k++) {
          var base = (i * 4 + k) * 5, dd = g.corner[base];
          var bx = (m >> g.corner[base + 3]) & 1, by = (m >> g.corner[base + 4]) & 1;
          var rv = st.rel[dd * 6 + PAIR[g.corner[base + 1]][g.corner[base + 2]]];
          if (rv === 1 && bx !== by) fits = false;
          if (rv === 2 && bx === by) fits = false;
        }
        if (fits && cls) {
          for (k = 0; k < 4 && fits; k++) {
            for (j = k + 1; j < 4 && fits; j++) {
              if (cls[k * 2] === cls[j * 2] && ((cls[k * 2 + 1] ^ cls[j * 2 + 1]) !== (((m >> k) & 1) ^ ((m >> j) & 1)))) fits = false;
            }
          }
        }
        if (!fits) continue;
        any = true;
        okAll &= m; okNone &= ~m;
        for (k = 0; k < 4; k++) {
          var base2 = (i * 4 + k) * 5;
          var x2 = (m >> g.corner[base2 + 3]) & 1, y2 = (m >> g.corner[base2 + 4]) & 1;
          if (x2 === y2) diffOk[k] = 0; else sameOk[k] = 0;
        }
        if (cls) for (k = 0; k < 4; k++) for (j = k + 1; j < 4; j++) xorOk[PAIR[k][j]] &= (((m >> k) ^ (m >> j)) & 1) ? 2 : 1;
      }
      if (!any) { st.bad = true; break; }
      for (k = 0; k < 4; k++) {
        if (st.e[es[k]]) continue;
        if ((okAll >> k) & 1) progress = setEdge(g, st, es[k], 1) || progress;
        else if ((okNone >> k) & 1) progress = setEdge(g, st, es[k], 2) || progress;
      }
      for (k = 0; k < 4; k++) {
        var b3 = (i * 4 + k) * 5, p = PAIR[g.corner[b3 + 1]][g.corner[b3 + 2]];
        if (sameOk[k]) progress = setRel(st, g.corner[b3], p, 1) || progress;
        else if (diffOk[k]) progress = setRel(st, g.corner[b3], p, 2) || progress;
      }
      if (cls) {
        for (k = 0; k < 4; k++) {
          for (j = k + 1; j < 4; j++) {
            var xo = xorOk[PAIR[k][j]];
            if (xo === 1 || xo === 2) progress = union(st, nb[k], nb[j], xo === 2 ? 1 : 0) || progress;
          }
        }
      }
    }
    return progress;
  }

  // ---- tier 3: inside / outside. Cells form classes with a known parity between them
  // (union-find); N is the outside of the grid, which is "outside the loop".
  function find(st, x) {
    var p = st.ufp;
    while (p[x] !== x) x = p[x];
    return x;
  }
  // Parity of x relative to its class root.
  function parityTo(st, x) {
    var p = st.ufp, par = 0;
    while (p[x] !== x) { par ^= st.ufx[x]; x = p[x]; }
    return par;
  }
  function union(st, a, b, diff) {
    var ra = find(st, a), rb = find(st, b), pa = parityTo(st, a), pb = parityTo(st, b);
    if (ra === rb) { if ((pa ^ pb) !== diff) st.bad = true; return false; }
    st.ufp[ra] = rb;
    st.ufx[ra] = pa ^ pb ^ diff;
    return true;
  }

  function colorPass(g, st, clues) {
    if (!st.ufp) {
      st.ufp = new Int32Array(g.N + 1);
      st.ufx = new Int8Array(g.N + 1);
      for (var i = 0; i <= g.N; i++) st.ufp[i] = i;
    }
    var progress = false, e;
    // Known edges tie their two cells together.
    for (e = 0; e < g.E && !st.bad; e++) {
      if (st.e[e]) progress = union(st, g.edgeC[e * 2], g.edgeC[e * 2 + 1], st.e[e] === 1 ? 1 : 0) || progress;
    }
    // Two cells in one class decide the edge between them.
    for (e = 0; e < g.E && !st.bad; e++) {
      if (st.e[e]) continue;
      var a = g.edgeC[e * 2], b = g.edgeC[e * 2 + 1];
      if (find(st, a) === find(st, b)) progress = setEdge(g, st, e, (parityTo(st, a) ^ parityTo(st, b)) ? 1 : 2) || progress;
    }
    if (st.bad) return false;
    progress = cellPass(g, st, clues, true) || progress;
    if (!st.bad) progress = dotPass(g, st, true) || progress;
    return progress;
  }

  // ---- tier 4: what-ifs. Assume a line (or a cross) on an edge next to the known lines,
  // follow the tier 1 rules and see whether the puzzle breaks.
  function trialPass(g, st, clues) {
    var t = g.scratch || (g.scratch = newState(g)), E = g.E, pass, k, e;
    // Edges at a loose end first; only if none of those helps, edges of numbered cells.
    for (pass = 0; pass < 2; pass++) {
      var from = st.tcur || 0;
      for (k = 0; k < E; k++) {
        e = (from + k) % E;
        if (st.e[e]) continue;
        var u = g.edgeV[e * 2], w = g.edgeV[e * 2 + 1];
        if (pass === 0) { if (st.vl[u] !== 1 && st.vl[w] !== 1) continue; }
        else {
          var a = g.edgeC[e * 2], b = g.edgeC[e * 2 + 1];
          if (!((a < g.N && clues[a] >= 0) || (b < g.N && clues[b] >= 0))) continue;
        }
        for (var val = 1; val <= 2; val++) {
          copyInto(t, st);
          t.budget = TRIAL_STEPS;
          setEdge(g, t, e, val);
          if (!t.bad) propagate(g, t, clues);
          if (t.bad) { st.tcur = e; setEdge(g, st, e, val === 1 ? 2 : 1); return true; }
        }
      }
    }
    return false;
  }

  function copyInto(t, s) {
    t.e.set(s.e); t.vl.set(s.vl); t.vu.set(s.vu); t.cl.set(s.cl); t.cu.set(s.cu);
    t.partner.set(s.partner); t.plen.set(s.plen);
    t.lines = s.lines; t.unknown = s.unknown; t.closed = s.closed; t.sweep = s.sweep; t.bad = s.bad;
    t.qh = 0; t.qt = 0; t.inQ.fill(0); t.ends = [];
  }
  // A what-if follows at most this many forced edges before it is given up.
  var TRIAL_STEPS = 40;

  function isSolved(g, st, clues) {
    if (st.bad || st.unknown || !st.closed) return false;
    for (var i = 0; i < g.N; i++) if (clues[i] >= 0 && st.cl[i] !== clues[i]) return false;
    return true;
  }

  // Solves with techniques up to maxTier. Returns { solved, broken, tier, steps }.
  function rate(g, clues, maxTier) {
    maxTier = maxTier || 4;
    var st = newState(g), tier = 1, steps = 0;
    seedQueue(g, st, clues);
    for (;;) {
      steps++;
      if (!propagate(g, st, clues)) break;
      if (!st.unknown) break;
      if (maxTier >= 2 && (cellPass(g, st, clues, false) || dotPass(g, st, false))) { tier = Math.max(tier, 2); continue; }
      if (st.bad) break;
      if (maxTier >= 3 && colorPass(g, st, clues)) { tier = Math.max(tier, 3); continue; }
      if (st.bad) break;
      if (maxTier >= 4 && trialPass(g, st, clues)) { tier = 4; continue; }
      break;
    }
    return { solved: isSolved(g, st, clues), broken: st.bad, tier: tier, steps: steps, state: st };
  }

  // ------------------------------------------------------------------ brute-force counter
  // Independent of the rater: plain depth-first search along the loop's open end, with
  // only the counting rules. Returns 0, 1, 2 (two or more) or -1 (over the step budget).
  function countSolutions(g, clues, limit, budget) {
    limit = limit || 2;
    budget = budget || COUNT_NODES;
    var E = g.E, N = g.N, V = g.V;
    var e = new Int8Array(E), found = 0, nodes = 0, over = false;
    var deg = new Int8Array(V), open = new Int8Array(V), on = new Int8Array(N), off = new Int8Array(N);
    var i, k, d;
    for (d = 0; d < V; d++) for (k = 0; k < 4; k++) if (g.dotE[d * 4 + k] >= 0) open[d]++;
    var trail = [];
    function assign(x, val) {
      e[x] = val; trail.push(x);
      var u = g.edgeV[x * 2], w = g.edgeV[x * 2 + 1], a = g.edgeC[x * 2], b = g.edgeC[x * 2 + 1];
      open[u]--; open[w]--;
      if (val === 1) { deg[u]++; deg[w]++; if (a < N) on[a]++; if (b < N) on[b]++; } else { if (a < N) off[a]++; if (b < N) off[b]++; }
    }
    function undo(to) {
      while (trail.length > to) {
        var x = trail.pop(), val = e[x];
        var u = g.edgeV[x * 2], w = g.edgeV[x * 2 + 1], a = g.edgeC[x * 2], b = g.edgeC[x * 2 + 1];
        open[u]++; open[w]++;
        if (val === 1) { deg[u]--; deg[w]--; if (a < N) on[a]--; if (b < N) on[b]--; } else { if (a < N) off[a]--; if (b < N) off[b]--; }
        e[x] = 0;
      }
    }
    // Simple rules to a fixpoint; false on a contradiction.
    function settle() {
      var changed = true;
      while (changed) {
        changed = false;
        for (i = 0; i < N; i++) {
          var n = clues[i];
          if (n < 0) continue;
          var free = 4 - on[i] - off[i];
          if (on[i] > n || on[i] + free < n) return false;
          if (!free) continue;
          if (on[i] === n || on[i] + free === n) {
            for (k = 0; k < 4; k++) { var x = g.cellE[i * 4 + k]; if (!e[x]) assign(x, on[i] === n ? 2 : 1); }
            changed = true;
          }
        }
        for (d = 0; d < V; d++) {
          if (deg[d] > 2 || (deg[d] === 1 && !open[d])) return false;
          if (!open[d]) continue;
          var v = deg[d] === 2 ? 2 : deg[d] === 1 && open[d] === 1 ? 1 : deg[d] === 0 && open[d] === 1 ? 2 : 0;
          if (v) {
            for (k = 0; k < 4; k++) { var y = g.dotE[d * 4 + k]; if (y >= 0 && !e[y]) assign(y, v); }
            changed = true;
          }
        }
      }
      return true;
    }
    // Lines must form exactly one loop when every edge is set; a closed loop may never
    // exist while other lines are elsewhere, and the two ends of a piece that are next to
    // each other may not be joined unless that finishes the puzzle.
    // Returns -1 on a contradiction, else how many edges it crossed out.
    var compOf = new Int32Array(V), stackD = new Int32Array(V);
    function pieces(final) {
      var total = 0, x, count = 0, stamp, made = 0, joins = [];
      for (x = 0; x < E; x++) if (e[x] === 1) total++;
      compOf.fill(0);
      for (d = 0; d < V; d++) {
        if (!deg[d] || compOf[d]) continue;
        count++; stamp = count;
        var top = 0, edges2 = 0, cycle = true, endA = -1, endB = -1;
        compOf[d] = stamp; stackD[top++] = d;
        while (top) {
          var q = stackD[--top];
          if (deg[q] !== 2) { cycle = false; if (endA < 0) endA = q; else endB = q; }
          for (k = 0; k < 4; k++) {
            var z = g.dotE[q * 4 + k];
            if (z < 0 || e[z] !== 1) continue;
            edges2++;
            var o = g.edgeV[z * 2] === q ? g.edgeV[z * 2 + 1] : g.edgeV[z * 2];
            if (!compOf[o]) { compOf[o] = stamp; stackD[top++] = o; }
          }
        }
        if (cycle && edges2 / 2 !== total) return -1;
        if (!cycle && endB >= 0) joins.push(endA, endB, edges2 / 2);
      }
      if (final) return count === 1 ? 0 : -1;
      for (var j = 0; j < joins.length; j += 3) {
        var f = edgeBetween(g, joins[j], joins[j + 1]);
        if (f < 0 || e[f]) continue;
        var finishes = joins[j + 2] === total;
        if (finishes) {
          var a = g.edgeC[f * 2], b = g.edgeC[f * 2 + 1];
          for (i = 0; i < N && finishes; i++) {
            if (clues[i] >= 0 && on[i] + (i === a || i === b ? 1 : 0) !== clues[i]) finishes = false;
          }
        }
        if (!finishes) { assign(f, 2); made++; }
      }
      return made;
    }
    function pick() {
      // An open edge at a loose end of a line, else an open edge of a numbered cell.
      var best = -1, bestOpen = 9, x;
      for (d = 0; d < V; d++) {
        if (deg[d] !== 1 || !open[d]) continue;
        if (open[d] < bestOpen) {
          bestOpen = open[d];
          for (k = 0; k < 4; k++) { x = g.dotE[d * 4 + k]; if (x >= 0 && !e[x]) { best = x; break; } }
          if (bestOpen === 2) break;
        }
      }
      if (best >= 0) return best;
      for (i = 0; i < N; i++) {
        if (clues[i] < 1) continue;
        for (k = 0; k < 4; k++) { x = g.cellE[i * 4 + k]; if (!e[x]) return x; }
      }
      for (x = 0; x < E; x++) if (!e[x]) return x;
      return -1;
    }
    function rec() {
      if (over || found >= limit) return;
      if (++nodes > budget) { over = true; return; }
      var mark = trail.length;
      for (;;) {
        if (!settle()) { undo(mark); return; }
        var made = pieces(false);
        if (made < 0) { undo(mark); return; }
        if (!made) break;
      }
      var x = pick();
      if (x < 0) {
        var good = pieces(true) === 0;
        for (i = 0; i < N && good; i++) if (clues[i] >= 0 && on[i] !== clues[i]) good = false;
        if (good) found++;
        undo(mark);
        return;
      }
      var m2 = trail.length;
      assign(x, 1); rec(); undo(m2);
      if (over || found >= limit) { undo(mark); return; }
      assign(x, 2); rec(); undo(m2);
      undo(mark);
    }
    rec();
    return over ? -1 : found;
  }

  // ------------------------------------------------------------------ generation
  function clueCount(clues) { var n = 0; for (var i = 0; i < clues.length; i++) if (clues[i] >= 0) n++; return n; }

  // Removes clues in random order (several at a time while that keeps working), keeping a
  // removal only while the puzzle stays solvable with the level's techniques.
  function dig(g, full, P, rng) {
    var clues = Int8Array.from(full), order = [], i;
    for (i = 0; i < g.N; i++) order.push(i);
    rng.shuffle(order);
    var batch = Math.max(1, Math.round(g.N / 25)), k = 0;
    while (k < order.length) {
      var take = order.slice(k, k + batch);
      take.forEach(function (c) { clues[c] = -1; });
      if (rate(g, clues, P.tier).solved) { k += take.length; continue; }
      take.forEach(function (c) { clues[c] = full[c]; });
      if (batch > 1) batch = Math.max(1, batch >> 1);
      else k++;
    }
    return clues;
  }

  // Tries to remove up to `tries` more clues one at a time.
  function digMore(g, clues, P, rng, tries) {
    var order = [], i;
    for (i = 0; i < g.N; i++) if (clues[i] >= 0) order.push(i);
    rng.shuffle(order);
    for (var k = 0; k < order.length && k < tries; k++) {
      var c = order[k], v = clues[c];
      clues[c] = -1;
      if (!rate(g, clues, P.tier).solved) clues[c] = v;
    }
    return clues;
  }

  // Adds clues back, in random order, while the puzzle keeps needing its level's logic.
  function refill(g, full, clues, P, rng) {
    var target = Math.round(P.fill * g.N), have = clueCount(clues), open = [], i;
    for (i = 0; i < g.N; i++) if (clues[i] < 0) open.push(i);
    rng.shuffle(open);
    for (var k = 0; k < open.length && have < target; k++) {
      var c = open[k];
      clues[c] = full[c];
      if (P.minTier > 1 && rate(g, clues, P.minTier - 1).solved) clues[c] = -1;
      else have++;
    }
  }

  function sameLoop(g, st, on) {
    for (var e = 0; e < g.E; e++) if ((st.e[e] === 1) !== (on[e] === 1)) return false;
    return true;
  }

  // One puzzle for a book slot. Same arguments, same puzzle, on any machine.
  function generate(seed, size, level, ordinal, salt) {
    var n = +size;
    var P = levelRules(n, level);
    if (!P) throw new Error('Level ' + level + ' is not offered at ' + n + ' x ' + n);
    var g = geo(n, n);
    for (var attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      var rng = makeRng(['sl1', seed, n, level, ordinal, salt || 0, attempt].join('/'));
      var inside = randomLoop(n, n, rng);
      var on = loopEdges(g, inside), full = cluesOf(g, on);
      // Expert: dig with Hard logic first (fast), then try a limited number of further
      // removals that need what-ifs.
      var clues = P.tier === 4 ? digMore(g, dig(g, full, { tier: 3 }, rng), P, rng, EXPERT_TRIES) : dig(g, full, P, rng);
      var r = rate(g, clues, P.tier);
      if (!r.solved || r.tier < P.minTier) continue;
      if (P.fill) {
        refill(g, full, clues, P, rng);
        r = rate(g, clues, P.tier);
        if (!r.solved) continue;
      }
      // The rater's answer must be the loop the clues came from.
      if (!sameLoop(g, r.state, on)) continue;
      // Second opinion from the brute-force counter where it is fast enough.
      if (n <= COUNT_MAX_SIZE && countSolutions(g, clues, 2) !== 1) continue;
      return toWire(g, inside, clues, level, r, { ordinal: ordinal, salt: salt || 0, attempt: attempt });
    }
    return null;
  }

  // ------------------------------------------------------------------ wire format
  // Plain-data form (structured-clone and JSON friendly) used everywhere outside the engine.
  function toWire(g, inside, clues, level, rating, meta) {
    var c = '', ins = '', count = 0;
    for (var i = 0; i < g.N; i++) {
      c += clues[i] >= 0 ? String(clues[i]) : '.';
      ins += inside[i] ? '1' : '0';
      if (clues[i] >= 0) count++;
    }
    return {
      size: g.R,
      level: level,
      ordinal: meta.ordinal,
      salt: meta.salt,
      attempt: meta.attempt,
      clues: c,
      inside: ins,
      clueCount: count,
      tier: rating.tier,
      steps: rating.steps,
      key: g.R + '|' + c
    };
  }

  function fromWire(w) {
    var n = w.size, g = geo(n, n), clues = new Int8Array(g.N), inside = new Uint8Array(g.N);
    for (var i = 0; i < g.N; i++) {
      clues[i] = w.clues[i] === '.' ? -1 : +w.clues[i];
      inside[i] = w.inside[i] === '1' ? 1 : 0;
    }
    return { geo: g, clues: clues, inside: inside, on: loopEdges(g, inside) };
  }

  // Is this set of edges one closed loop? (Every dot 0 or 2 lines, all lines connected.)
  function singleLoop(g, on) {
    var total = 0, e, d, k, start = -1;
    for (d = 0; d < g.V; d++) {
      var n = 0;
      for (k = 0; k < 4; k++) { e = g.dotE[d * 4 + k]; if (e >= 0 && on[e]) n++; }
      if (n !== 0 && n !== 2) return false;
    }
    for (e = 0; e < g.E; e++) if (on[e]) { total++; if (start < 0) start = e; }
    if (!total) return false;
    var seen = new Uint8Array(g.E), stack = [start], count = 0;
    seen[start] = 1;
    while (stack.length) {
      var x = stack.pop(); count++;
      for (var s = 0; s < 2; s++) {
        d = g.edgeV[x * 2 + s];
        for (k = 0; k < 4; k++) { e = g.dotE[d * 4 + k]; if (e >= 0 && on[e] && !seen[e]) { seen[e] = 1; stack.push(e); } }
      }
    }
    return count === total;
  }

  // Full check of a wire puzzle. Returns a list of problems (empty = valid).
  // opts.structureOnly skips the (slower) logic proof, for re-checking on the page a
  // puzzle that a worker has already proved. opts.count also runs the brute-force counter.
  function validate(w, opts) {
    var problems = [];
    if (!w || SIZES.indexOf(+w.size) < 0) return ['unknown size'];
    var N2 = w.size * w.size;
    if (typeof w.clues !== 'string' || w.clues.length !== N2 || !/^[0-3.]+$/.test(w.clues)) return ['bad clues'];
    if (typeof w.inside !== 'string' || w.inside.length !== N2 || !/^[01]+$/.test(w.inside)) return ['bad loop'];
    var pz = fromWire(w), g = pz.geo;
    if (!singleLoop(g, pz.on)) problems.push('the answer is not one closed loop');
    var real = cluesOf(g, pz.on);
    for (var i = 0; i < g.N; i++) {
      if (pz.clues[i] >= 0 && pz.clues[i] !== real[i]) { problems.push('clue at cell ' + i + ' does not match the loop'); break; }
    }
    if (!problems.length && !(opts && opts.structureOnly)) {
      // Logic proof: every deduction holds in every solution, so finishing the grid shows
      // the answer is the only one.
      var r = rate(g, pz.clues, 4);
      if (!r.solved || !sameLoop(g, r.state, pz.on)) problems.push('not solvable by logic');
      if (opts && opts.count) {
        var count = countSolutions(g, pz.clues, 2, opts.budget);
        if (count !== 1) problems.push(count === 0 ? 'no solution' : count < 0 ? 'solution count over budget' : 'more than one solution');
      }
    }
    return problems;
  }

  return {
    SIZES: SIZES,
    LEVELS: LEVELS,
    SIZE_LEVELS: SIZE_LEVELS,
    levelRules: levelRules,
    makeRng: makeRng,
    hashString: hashString,
    geo: geo,
    generate: generate,
    validate: validate,
    fromWire: fromWire,
    rate: rate,
    countSolutions: countSolutions,
    singleLoop: singleLoop,
    // Building blocks, exposed for the test and tuning scripts.
    internals: { randomLoop: randomLoop, loopEdges: loopEdges, cluesOf: cluesOf, dig: dig }
  };
}

(function (root) {
  root.KS = root.KS || {};
  root.KS.engineFactory = SlitherEngineFactory;
  root.KS.engine = SlitherEngineFactory();
})(typeof self !== 'undefined' ? self : this);
