/*
 * Puts the AI's questions into the book: matches each group of questions to its chapter, drops
 * repeats, stops at the chapter's size and moves the right answer around so A, B, C and D are
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

  // Moves the right answer of each new question to the letter used least so far in the chapter.
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

  // The chapter a group heading names, from this list (null when unsure).
  function matchChapter(title, chapters) {
    var t = key(title);
    if (!t) return null;
    for (var i = 0; i < chapters.length; i++) if (key(chapters[i].title) === t) return chapters[i];
    var tw = words(title), best = null, bestScore = 0;
    chapters.forEach(function (ch) {
      var cw = words(ch.title), hit = cw.filter(function (w) { return tw.indexOf(w) !== -1; }).length;
      var score = cw.length ? hit / cw.length : 0;
      var yr = /\b(\d{4})s\b/.exec(title);
      if (yr && ch.title.indexOf(yr[1]) !== -1) score = Math.max(score, 0.9);
      if (score > bestScore) { bestScore = score; best = ch; }
    });
    return bestScore >= 0.5 ? best : null;
  }

  /*
   * Adds a reply's questions. fallback: the chapters of the prompt the reply answers, used for
   * groups without a recognizable chapter heading. Returns a report:
   *   { added: [{ chapter, n }], repeats, extra, unplaced, skipped }
   */
  function addReply(project, parsed, fallback) {
    var chapters = CX.plan.chapters(project), per = project.plan.perChapter;
    var report = { added: [], repeats: 0, extra: 0, unplaced: 0, skipped: parsed.skipped.length };
    var seen = {};
    chapters.forEach(function (ch) { (project.questions[ch.id] || []).forEach(function (q) { seen[key(q.q)] = 1; }); });
    var open = (fallback || []).filter(function (ch) { return CX.prompts.missing(project, ch) > 0; });
    parsed.groups.forEach(function (g) {
      var ch = matchChapter(g.title, chapters);
      if (!ch) ch = open.shift() || null;
      else open = open.filter(function (c) { return c.id !== ch.id; });
      if (!ch) { report.unplaced += g.questions.length; return; }
      var list = project.questions[ch.id] || (project.questions[ch.id] = []);
      var fresh = [];
      g.questions.forEach(function (q) {
        var k = key(q.q);
        if (seen[k]) { report.repeats++; return; }
        if (list.length + fresh.length >= per) { report.extra++; return; }
        seen[k] = 1;
        fresh.push(q);
      });
      if (!fresh.length) return;
      var placed = balance(list, fresh, project.seed + '|' + ch.id + '|' + list.length);
      Array.prototype.push.apply(list, placed);
      var row = report.added.filter(function (r) { return r.chapter.id === ch.id; })[0];
      if (row) row.n += placed.length; else report.added.push({ chapter: ch, n: placed.length });
    });
    return report;
  }

  // Returns what was added (for the message) and what is still short, e.g. too few ranks.
  function addExtras(project, ex) {
    var got = [], short = [];
    if (ex.welcome.length) { project.ai.welcome = ex.welcome; got.push('welcome letter'); }
    if (ex.facts.length) { project.ai.facts = ex.facts.slice(0, 24); got.push(U.plural(project.ai.facts.length, 'fun fact')); }
    if (ex.stories.length) { project.ai.stories = ex.stories.slice(0, 16); got.push(U.plural(project.ai.stories.length, 'story prompt')); }
    if (ex.ranks.length) {
      var R = CX.prompts.RANKS;
      if (ex.ranks.length >= R) { project.ai.ranks = ex.ranks.slice(0, R); got.push(U.plural(R, 'rank')); }
      else short.push('The reply had ' + U.plural(ex.ranks.length, 'rank') + '; the score card needs ' + R + '. Copy the prompt again.');
    }
    if (ex.blurb) { project.ai.blurb = ex.blurb; got.push('back cover text'); }
    return { got: got, short: short };
  }

  // How many times each letter is the right answer, over the multiple-choice questions.
  function letterSpread(project) {
    var c = [0, 0, 0, 0];
    CX.plan.chapters(project).forEach(function (ch) { (project.questions[ch.id] || []).forEach(function (q) { if (q.a < 4 && !isTrueFalse(q)) c[q.a]++; }); });
    return c;
  }

  // How many true-or-false questions the book has.
  function trueFalseCount(project) {
    return CX.plan.chapters(project).reduce(function (s, ch) { return s + (project.questions[ch.id] || []).filter(isTrueFalse).length; }, 0);
  }

  function total(project) {
    return CX.plan.chapters(project).reduce(function (s, ch) { return s + Math.min(project.plan.perChapter, (project.questions[ch.id] || []).length); }, 0);
  }

  CX.questions = { key: key, isTrueFalse: isTrueFalse, keepOrder: keepOrder, balance: balance, matchChapter: matchChapter, addReply: addReply, addExtras: addExtras, letterSpread: letterSpread, trueFalseCount: trueFalseCount, total: total };
})(typeof window !== 'undefined' ? window : globalThis);
