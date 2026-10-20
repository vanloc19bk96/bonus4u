/*
 * The puzzle engine. From one pack (topic, options, knowledge facts) and one level it builds a
 * puzzle and proves it fair:
 *   - the answer is a firm NO for every clue (no clue could tempt a reader to cross it out)
 *   - every other option is crossed out firmly (YES) by at least one clue
 *   - every clue is needed: each one crosses out at least one option no other clue does
 *   - no clue crosses out too much of the line-up on its own
 * The search is an exact-cover style backtrack over bit masks, steered by the level's mix of
 * clue types, and scored so the chosen set reads well (varied, knowledge first, balanced).
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var C = CX.clues, U = CX.util;
  var pop = C.popcount;

  /*
   * The four parts of a book. lineup: [min, max] options; clues: clues per case;
   * tricky: [min, max] clues at or above trickyTier; facts: [min, max] knowledge clues.
   */
  var LEVELS = [
    { id: 'warmup', name: 'The Warm-Ups', short: 'Warm-up', dots: 1, clues: 3, lineup: [12, 15], maxTier: 1.5, trickyTier: 9, tricky: [0, 0],
      facts: [0, 2], maxShare: 0.7, target: 1.1, hasMax: 3,
      blurb: 'Short line-ups and three clues each. Perfect for finding your feet and getting a taste of the game.' },
    { id: 'casework', name: 'The Casework', short: 'Medium', dots: 2, clues: 4, lineup: [16, 20], maxTier: 2.5, trickyTier: 2, tricky: [1, 2],
      facts: [1, 2], maxShare: 0.62, target: 1.6, hasMax: 2,
      blurb: 'Longer line-ups, four clues and a few new kinds of clue to keep you on your toes.' },
    { id: 'tough', name: 'The Tough Cases', short: 'Hard', dots: 3, clues: 5, lineup: [20, 24], maxTier: 3, trickyTier: 3, tricky: [1, 2],
      facts: [1, 2], maxShare: 0.52, target: 2.1, hasMax: 2,
      blurb: 'Five clues, vowel counts and “does not” clues. Read every word and take your time.' },
    { id: 'master', name: 'The Master Files', short: 'Expert', dots: 4, clues: 6, lineup: [24, 30], maxTier: 4, trickyTier: 3, tricky: [2, 4],
      facts: [1, 3], maxShare: 0.46, target: 2.6, hasMax: 2,
      blurb: 'Six clues, the longest line-ups and the trickiest rules. Only the sharpest detectives clear every file.' }
  ];

  // Children get shorter line-ups and the plainer clue types.
  var KIDS = {
    warmup: { lineup: [8, 10], maxTier: 1 },
    casework: { lineup: [10, 13], maxTier: 2, clues: 3, tricky: [1, 1] },
    tough: { lineup: [12, 15], maxTier: 2.5, clues: 4, trickyTier: 2, tricky: [1, 2] },
    master: { lineup: [14, 18], maxTier: 3, clues: 5, tricky: [1, 3] }
  };

  function level(id, audience) {
    var base = LEVELS.filter(function (l) { return l.id === id; })[0] || LEVELS[0];
    if (audience === 'kids') return Object.assign({}, base, KIDS[base.id]);
    return base;
  }

  // Per-puzzle limits on each clue family.
  function familyLimit(lv, fam) {
    switch (fam) {
      case 'has': return lv.hasMax;
      case 'fact': return lv.facts[1];
      case 'length': return 2;
      case 'pattern': return lv.dots >= 4 ? 2 : 1;
      default: return 1;
    }
  }

  /*
   * A pack made ready for the engine: option info for the letter clues, facts as index lists,
   * and for each case the options its title or story mentions (never used as that case's answer).
   */
  function prepare(pack) {
    if (pack._prep) return pack._prep;
    var infos = pack.options.map(function (t) { return C.info(t); });
    var mentions = (pack.cases || []).map(function (cs) {
      var words = ((cs.title || '') + ' ' + (cs.story || '')).toLowerCase().replace(/[^a-z' ]+/g, ' ').split(' ');
      var set = {};
      words.forEach(function (w) { if (w.length >= 3) { set[w] = 1; set[w.replace(/'s$/, '')] = 1; set[w.replace(/(es|s)$/, '')] = 1; } });
      var out = [];
      pack.options.forEach(function (o, i) {
        var hit = o.toLowerCase().split(/[ \-]+/).some(function (w) { return w.length >= 3 && (set[w] || set[w + 's'] || set[w.replace(/y$/, 'ies')]); });
        if (hit) out.push(i);
      });
      return out;
    });
    var prep = { infos: infos, facts: pack.facts || [], mentions: mentions };
    Object.defineProperty(pack, '_prep', { value: prep, enumerable: false, configurable: true });
    return prep;
  }

  /*
   * Builds one puzzle.
   * opts: { seed, level (id), audience, avoid: [option index], budget }
   * Returns { ok, lineup:[option index], answer (position in lineup), clues:[...], score } or { ok:false, reason }.
   */
  function make(pack, caseIdx, opts) {
    var lv = level(opts.level, opts.audience);
    var prep = prepare(pack);
    var rng = U.makeRng(opts.seed);
    var nOpt = pack.options.length;
    if (nOpt < lv.lineup[0]) return { ok: false, reason: 'needs ' + lv.lineup[0] + ' options, the pack has ' + nOpt };
    var banned = {};
    (opts.avoid || []).forEach(function (i) { banned[i] = 1; });
    (prep.mentions[caseIdx] || []).forEach(function (i) { banned[i] = 1; });
    var answers = [];
    for (var i = 0; i < nOpt; i++) if (!banned[i]) answers.push(i);
    if (!answers.length) return { ok: false, reason: 'no option can be the answer' };
    rng.shuffle(answers);

    var best = null, tries = 0, maxTries = opts.tries || 14;
    var budget = opts.budget || 2500;
    for (var a = 0; tries < maxTries && a < answers.length * 3; a++) {
      tries++;
      var ansOpt = answers[a % answers.length];
      var size = Math.min(nOpt, lv.lineup[0] + rng.int(lv.lineup[1] - lv.lineup[0] + 1));
      var others = [];
      for (var j = 0; j < nOpt; j++) if (j !== ansOpt) others.push(j);
      rng.shuffle(others);
      var lineup = others.slice(0, size - 1);
      lineup.push(ansOpt);
      rng.shuffle(lineup);
      var res = solveLineup(pack, prep, lineup, lineup.indexOf(ansOpt), lv, rng, budget);
      if (res && (!best || res.score > best.score)) best = res;
      if (best && best.score >= 14 && tries >= 3) break;
    }
    if (!best) return { ok: false, reason: 'no fair set of ' + lv.clues + ' clues found' };
    return best;
  }

  function solveLineup(pack, prep, lineup, answer, lv, rng, budget) {
    var n = lineup.length;
    var infos = lineup.map(function (oi) { return prep.infos[oi]; });
    // facts mapped onto line-up positions; a fact where the answer is debatable cannot be used
    var pos = {};
    lineup.forEach(function (oi, p) { pos[oi] = p; });
    var facts = prep.facts.map(function (f, fi) {
      var yes = [], maybe = [];
      f.yes.forEach(function (oi) { if (pos[oi] !== undefined) yes.push(pos[oi]); });
      f.maybe.forEach(function (oi) { if (pos[oi] !== undefined) maybe.push(pos[oi]); });
      return { clue: f.clue, not: f.not, yes: yes, maybe: maybe, fi: fi };
    });
    var cands = C.candidates(infos, { answer: answer, facts: facts, maxTier: lv.maxTier });
    var others = n - 1;
    var maxCover = Math.max(2, Math.floor(lv.maxShare * others));
    cands = cands.filter(function (c) { c.n = pop(c.yes); return c.n <= maxCover; });
    var usableFacts = 0, factIds = {};
    cands.forEach(function (c) { if (c.family === 'fact' && !factIds[c.param]) { factIds[c.param] = 1; usableFacts++; } });
    var minFacts = Math.min(lv.facts[0], usableFacts);
    var full = ((1 << n) - 1) & ~(1 << answer);

    // coverers per option, each list in its own random order with facts and well-fitting tiers first
    var cov = [];
    for (var e = 0; e < n; e++) cov.push([]);
    cands.forEach(function (c) {
      c.r = rng.next() * 3 + (c.family === 'fact' ? (minFacts ? 2.2 : 1) : 0) - Math.abs(c.tier - lv.target) * 0.8 + c.n / Math.max(1, others) * 1.5;
      for (var b = 0; b < n; b++) if (c.yes & (1 << b)) cov[b].push(c);
    });
    for (var e2 = 0; e2 < n; e2++) {
      if (e2 !== answer && !cov[e2].length) return null; // this option can never be crossed out
      cov[e2].sort(function (x, y) { return y.r - x.r; });
    }

    var k = lv.clues, chosen = [], fam = {}, nodes = 0, found = [];
    function consider() {
      // every clue needed
      for (var i = 0; i < k; i++) {
        var rest = 0;
        for (var j = 0; j < k; j++) if (j !== i) rest |= chosen[j].yes;
        if (!(chosen[i].yes & ~rest & full)) return;
      }
      var nf = 0, tr = 0, tiers = 0, fams = {}, sizes = [];
      chosen.forEach(function (c) {
        if (c.family === 'fact') nf++;
        if (c.tier >= lv.trickyTier) tr++;
        tiers += c.tier; fams[c.family] = 1; sizes.push(c.n);
      });
      if (nf < minFacts || nf > lv.facts[1]) return;
      if (tr < lv.tricky[0] || tr > lv.tricky[1]) return;
      var uniq = chosen.map(function (c, i) {
        var rest = 0;
        for (var j = 0; j < k; j++) if (j !== i) rest |= chosen[j].yes;
        return pop(c.yes & ~rest & full);
      });
      var mean = sizes.reduce(function (s, v) { return s + v; }, 0) / k;
      var spread = Math.sqrt(sizes.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / k) / Math.max(1, others);
      var score = Object.keys(fams).length * 2 + Math.min(nf, 2) * 2.5 - Math.abs(tiers / k - lv.target) * 3 +
        (Math.min.apply(null, uniq) >= 2 ? 2 : 0) - spread * 6 + rng.next() * 1.5;
      found.push({ clues: chosen.slice(), score: score });
    }
    function rec(unc, depth) {
      if (++nodes > budget || found.length >= 8) return true;
      if (!unc) { if (depth === k) consider(); return false; }
      if (depth === k) return false;
      var rem = k - depth;
      if (pop(unc) > rem * maxCover) return false;
      // the option with the fewest ways to be crossed out
      var pick = -1, fewest = 1e9;
      for (var b = 0; b < n; b++) {
        if (!(unc & (1 << b))) continue;
        var cnt = cov[b].length;
        if (cnt < fewest) { fewest = cnt; pick = b; }
      }
      var list = cov[pick];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.used) continue;
        if ((fam[c.family] || 0) >= familyLimit(lv, c.family)) continue;
        if (rem > 1 && !(unc & ~c.yes)) continue; // would finish early: the remaining clues could not be needed
        // a clue must not swallow everything an earlier clue does alone
        var ok = true;
        for (var q = 0; q < chosen.length && ok; q++) if (!(chosen[q].yes & ~c.yes & full)) ok = false;
        if (!ok) continue;
        c.used = true; fam[c.family] = (fam[c.family] || 0) + 1; chosen.push(c);
        var stop = rec(unc & ~c.yes, depth + 1);
        chosen.pop(); fam[c.family]--; c.used = false;
        if (stop) return true;
      }
      return false;
    }
    rec(full, 0);
    if (!found.length) return null;
    found.sort(function (x, y) { return y.score - x.score; });
    var win = found[0];
    return {
      ok: true, lineup: lineup, answer: answer, score: win.score,
      clues: order(win.clues, rng).map(function (c) {
        return { type: c.type, param: c.param, text: c.text, tier: c.tier, family: c.family, yes: c.yes, maybe: c.maybe };
      })
    };
  }

  // Print order: knowledge clues first, then the rest from plain to tricky, ties shuffled.
  function order(clues, rng) {
    return clues.map(function (c) { return { c: c, k: (c.type === 'fact' ? 0 : c.type === 'notFact' ? 2.9 : c.tier) + rng.next() * 0.6 }; })
      .sort(function (a, b) { return a.k - b.k; }).map(function (x) { return x.c; });
  }

  /*
   * Independent check of a finished puzzle: re-evaluates each clue from its type and parameter.
   * Returns a list of problems (empty when the puzzle is fair).
   */
  function verify(pack, pz) {
    var prep = prepare(pack);
    var infos = pz.lineup.map(function (oi) { return prep.infos[oi]; });
    var pos = {};
    pz.lineup.forEach(function (oi, p) { pos[oi] = p; });
    var facts = prep.facts.map(function (f) {
      return { yes: f.yes.filter(function (oi) { return pos[oi] !== undefined; }).map(function (oi) { return pos[oi]; }),
        maybe: f.maybe.filter(function (oi) { return pos[oi] !== undefined; }).map(function (oi) { return pos[oi]; }) };
    });
    var n = infos.length, crossed = [], problems = [];
    var firm = pz.clues.map(function (c) {
      var r = C.evaluate(c, infos, facts);
      if (r[pz.answer] !== C.NO) problems.push('clue “' + c.text + '” could cross out the answer');
      return r;
    });
    for (var i = 0; i < n; i++) {
      if (i === pz.answer) continue;
      var by = [];
      firm.forEach(function (r, ci) { if (r[i] === C.YES) by.push(ci); });
      if (!by.length) problems.push(pack.options[pz.lineup[i]] + ' is never crossed out');
      crossed.push(by);
    }
    pz.clues.forEach(function (c, ci) {
      var alone = crossed.some(function (by) { return by.length === 1 && by[0] === ci; });
      if (!alone) problems.push('clue “' + c.text + '” is not needed');
    });
    return problems;
  }

  /*
   * What each clue crosses out, in print order: the options still standing that it describes.
   * Returns [[position, ...] per clue].
   */
  function steps(pz) {
    var gone = 0;
    return pz.clues.map(function (c) {
      var now = c.yes & ~gone;
      gone |= c.yes;
      var out = [];
      for (var i = 0; i < pz.lineup.length; i++) if (now & (1 << i)) out.push(i);
      return out;
    });
  }

  CX.engine = { LEVELS: LEVELS, level: level, prepare: prepare, make: make, verify: verify, steps: steps };
})(typeof window !== 'undefined' ? window : globalThis);
