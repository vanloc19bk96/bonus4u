/*
 * Puts the AI's questions into the book: matches each group of questions to its round, drops
 * repeats, stops at the round's size and moves the right answer around so A, B, C and D are
 * each right about as often (chat models put most answers on B or C).
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var U = CX.util;

  function key(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|a|an|of|and|in|was|is|which|what|who)\b/g, '').replace(/\s+/g, ' ').trim(); }

  // A true-or-false question: two choices, True and False (or Yes and No), in any order.
  function isTrueFalse(q) {
    if (q.o.length !== 2) return false;
    var s = q.o.map(function (o) { return String(o).toLowerCase().replace(/[^a-z]/g, ''); }).sort().join(',');
    return s === 'false,true' || s === 'no,yes' || s === 'fact,myth';
  }

  // Choices that only make sense in their written order: true/false, "All of the above", numbers and years.
  function keepOrder(q) {
    if (isTrueFalse(q)) return true;
    if (q.o.some(function (o) { return /\b(all|none|both|neither) of the (above|these)\b|^both\b|^[A-D] and [A-D]$/i.test(o); })) return true;
    return q.o.every(function (o) { return /^[$£€]?\s?[\d.,]+\s*(?:%|cents?|s|million|billion|years?|pence|p|°[CF]?|mph|km|miles?|feet|ft|inches|in|lbs?|kg|volts?|v|amps?|hours?|days?)?$/i.test(o.trim()); });
  }

  // True first, then False, whatever order the AI wrote them in.
  function trueFirst(q) {
    var first = /^(true|yes|fact)$/i.test(q.o[0].replace(/[^A-Za-z]/g, ''));
    if (first) return q;
    return { q: q.q, o: [q.o[1], q.o[0]], a: 1 - q.a, f: q.f };
  }

  // Moves the right answer of each new question to the letter used least so far in the round.
  // True-or-false questions keep True as A and do not count towards the A to D balance.
  function balance(existing, added, seed) {
    var n = Math.max(2, added.reduce(function (m, q) { return Math.max(m, q.o.length); }, 4));
    var count = [];
    for (var i = 0; i < n; i++) count.push(0);
    existing.forEach(function (q) { if (q.a < n && !isTrueFalse(q)) count[q.a]++; });
    var rng = U.makeRng(seed);
    return added.map(function (q) {
      if (isTrueFalse(q)) return trueFirst(q);
      if (keepOrder(q)) { if (q.a < n) count[q.a]++; return q; }
      var k = q.o.length, min = Infinity, best = [];
      for (var s = 0; s < k; s++) {
        if (count[s] < min) { min = count[s]; best = [s]; } else if (count[s] === min) best.push(s);
      }
      var target = best[rng.int(best.length)];
      var o = q.o.slice(), right = o.splice(q.a, 1)[0];
      o.splice(target, 0, right);
      count[target]++;
      return { q: q.q, o: o, a: target, f: q.f };
    });
  }

  function words(s) { return key(s).split(' ').filter(function (w) { return w.length > 2; }); }

  /*
   * The round a group heading names ("1950s – Music & Dance", "ROUND 2: '50s TV"), from this list
   * (null when unsure). A heading without a decade is read as the fallback decade when given.
   */
  function matchRound(title, rounds, fallbackDecade) {
    var t = key(title);
    if (!t) return null;
    for (var i = 0; i < rounds.length; i++) if (key(rounds[i].full) === t) return rounds[i];
    var dec = CX.reader.decadeIn(title) || fallbackDecade || null;
    var pool = rounds.filter(function (r) { return !dec || r.decade.id === dec; });
    if (!pool.length) return null;
    var bare = title.replace(/(?:19|20)\d0['’]?s|['’]?\d0['’]?s/gi, ' ');
    var tw = words(bare), all = key(bare).split(' '), best = null, bestScore = 0;
    pool.forEach(function (r) {
      var cw = words(r.title), hit = cw.filter(function (w) { return tw.indexOf(w) !== -1; }).length;
      var score = cw.length ? hit / cw.length : 0;
      var keys = r.theme.keys.split(' ');
      if (all.some(function (w) { return keys.indexOf(w) !== -1; })) score = Math.max(score, 0.6);
      if (score > bestScore) { bestScore = score; best = r; }
    });
    return bestScore >= 0.5 ? best : null;
  }

  /*
   * Adds a reply's questions. fallback: the rounds of the prompt the reply answers, used for
   * groups without a recognizable round heading. Returns a report:
   *   { added: [{ round, n }], repeats, extra, unplaced, skipped }
   */
  function addReply(project, parsed, fallback) {
    var rounds = CX.plan.rounds(project), per = project.plan.perRound;
    var report = { added: [], repeats: 0, extra: 0, unplaced: 0, skipped: parsed.skipped.length };
    var seen = {};
    rounds.forEach(function (r) { (project.questions[r.id] || []).forEach(function (q) { seen[key(q.q)] = 1; }); });
    var open = (fallback || []).filter(function (r) { return CX.prompts.missing(project, r) > 0; });
    var fbDecade = fallback && fallback.length ? fallback[0].decade.id : null;
    parsed.groups.forEach(function (g) {
      var r = matchRound(g.title, rounds, fbDecade);
      if (!r) r = open.shift() || null;
      else open = open.filter(function (x) { return x.id !== r.id; });
      if (!r) { report.unplaced += g.questions.length; return; }
      var list = project.questions[r.id] || (project.questions[r.id] = []);
      var fresh = [];
      g.questions.forEach(function (q) {
        var k = key(q.q);
        if (seen[k]) { report.repeats++; return; }
        if (list.length + fresh.length >= per) { report.extra++; return; }
        seen[k] = 1;
        fresh.push(q);
      });
      if (!fresh.length) return;
      var placed = balance(list, fresh, project.seed + '|' + r.id + '|' + list.length);
      Array.prototype.push.apply(list, placed);
      var row = report.added.filter(function (x) { return x.round.id === r.id; })[0];
      if (row) row.n += placed.length; else report.added.push({ round: r, n: placed.length });
    });
    return report;
  }

  // Returns what was added (for the message) and what is still short, e.g. too few ranks.
  function addExtras(project, ex) {
    var got = [], short = [];
    if (ex.welcome.length) { project.ai.welcome = ex.welcome; got.push('welcome letter'); }
    if (ex.ranks.length) {
      var R = CX.prompts.RANKS;
      if (ex.ranks.length >= R) { project.ai.ranks = ex.ranks.slice(0, R); got.push(U.plural(R, 'rank')); }
      else short.push('The reply had ' + U.plural(ex.ranks.length, 'rank') + '; the score card needs ' + R + '. Copy the prompt again.');
    }
    if (ex.blurb) { project.ai.blurb = ex.blurb; got.push('back cover text'); }
    return { got: got, short: short };
  }

  /*
   * Adds the decade pages. Each part a reply brings replaces that part of its decade.
   * Returns { got: ['1950s', ...], other: decades not in the book, short: [notes] }.
   */
  function addEras(project, eras) {
    var E = CX.prompts.ERA, inBook = CX.plan.decades(project).map(function (d) { return d.id; });
    var got = [], other = [], short = [];
    Object.keys(eras).forEach(function (id) {
      if (inBook.indexOf(id) === -1) { other.push(id); return; }
      var cur = project.eras[id] || (project.eras[id] = { intro: [], timeline: [], facts: [], memories: [] });
      var e = eras[id], any = false;
      Object.keys(E).forEach(function (k) { if (e[k] && e[k].length) { cur[k] = e[k].slice(0, E[k].max); any = true; } });
      if (any) got.push(id);
      var miss = CX.prompts.eraMissing(project, id);
      if (any && miss.length) short.push(id + ' still needs: ' + miss.map(function (k) { return E[k].label; }).join(', ') + '. Copy the prompt again.');
    });
    return { got: got, other: other, short: short };
  }

  // How many times each letter is the right answer, over the multiple-choice questions.
  function letterSpread(project) {
    var c = [0, 0, 0, 0];
    CX.plan.rounds(project).forEach(function (r) { (project.questions[r.id] || []).forEach(function (q) { if (q.a < 4 && !isTrueFalse(q)) c[q.a]++; }); });
    return c;
  }

  // How many true-or-false questions the book has.
  function trueFalseCount(project) {
    return CX.plan.rounds(project).reduce(function (s, r) { return s + (project.questions[r.id] || []).filter(isTrueFalse).length; }, 0);
  }

  function total(project) {
    return CX.plan.rounds(project).reduce(function (s, r) { return s + Math.min(project.plan.perRound, (project.questions[r.id] || []).length); }, 0);
  }

  CX.questions = {
    key: key, isTrueFalse: isTrueFalse, keepOrder: keepOrder, balance: balance, matchRound: matchRound, addReply: addReply, addExtras: addExtras, addEras: addEras,
    letterSpread: letterSpread, trueFalseCount: trueFalseCount, total: total
  };
})(typeof window !== 'undefined' ? window : globalThis);
