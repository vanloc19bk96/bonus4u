/*
 * Puts the AI's words into the book: matches each day of a reply to its day, keeps titles and
 * texts, drops words the book already has on another day (unless the audience may reuse them),
 * takes a new clue for a word the day already has, and stops a day at the number of words a grid
 * can use. A reply that rewrites a finished day can replace its words instead of adding to them.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan, U = CX.util;

  var SPARE = 10;   // words a day may hold beyond what the prompt asks for

  // Which day each part of a reply belongs to: [{ pd, day }], day null when none fits.
  // fallback: the days of the prompt the reply answers, used for parts without a DAY line.
  function match(project, parsed, fallback) {
    var all = P.days(project), out = [];
    var open = (fallback || []).filter(function (d) { return !CX.prompts.dayDone(project, d); });
    parsed.days.forEach(function (pd) {
      var day = null;
      if (pd.no) {
        var set = pd.set || (fallback && fallback[0] ? fallback[0].set : 'main');
        day = all.filter(function (d) { return d.set === set && d.no === pd.no; })[0] || null;
        // a reply that numbers the bonus days 1 to 12 without the word BONUS
        if (!day || (fallback && fallback.length && fallback[0].set === 'bonus' && pd.set === 'main' && !fallback.some(function (f) { return f.id === day.id; }))) {
          day = all.filter(function (d) { return d.set === 'bonus' && d.no === pd.no; })[0] || day;
        }
        if (day) open = open.filter(function (d) { return d.id !== day.id; });
      } else day = open.shift() || null;
      out.push({ pd: pd, day: day });
    });
    return out;
  }

  /*
   * The days a reply rewrites rather than tops up: days that have words, given at least half as
   * many again, repeating some of them or for a day that was finished (a top-up asks only for
   * a few new words). [{ day, have, got, same }]
   */
  function rewrites(project, parsed, fallback) {
    var out = [];
    match(project, parsed, fallback).forEach(function (m) {
      var d = m.day && project.days[m.day.id];
      if (!d || !d.words.length || !m.pd.words.length || out.some(function (r) { return r.day.id === m.day.id; })) return;
      var mine = {}, same = 0;
      d.words.forEach(function (x) { mine[x.w] = 1; });
      m.pd.words.forEach(function (x) { if (mine[x.w]) same++; });
      if (m.pd.words.length * 2 >= d.words.length && (same || CX.prompts.dayDone(project, m.day))) out.push({ day: m.day, have: d.words.length, got: m.pd.words.length, same: same });
    });
    return out;
  }

  /*
   * Adds a days reply. replace: ids of the days whose words the reply replaces (from rewrites()).
   * A day keeps its title: the prompts tell the AI to use it, and pictures may be made for it.
   * Returns { added: [{ day, n }], replaced: [day], updated (clues), same, texts, repeats, extra, unplaced, skipped }.
   */
  function addReply(project, parsed, fallback, replace) {
    var all = P.days(project), ask = P.grid(project.plan.size).ask, reuse = P.audience(project.plan.audience).reuse;
    var rep = { added: [], replaced: [], updated: 0, same: 0, texts: 0, repeats: 0, extra: 0, unplaced: 0, skipped: parsed.skipped.length };
    var used = {};
    all.forEach(function (d) { ((project.days[d.id] || {}).words || []).forEach(function (x) { used[x.w] = d.id; }); });
    match(project, parsed, fallback).forEach(function (m) {
      var pd = m.pd, day = m.day;
      if (!day) { rep.unplaced += pd.words.length; return; }
      var d = P.day(project, day.id), n = 0, seen = {};
      if ((replace || []).indexOf(day.id) !== -1 && pd.words.length && rep.replaced.indexOf(day) === -1) {
        d.words.forEach(function (x) { if (used[x.w] === day.id) delete used[x.w]; });
        d.words = [];
        rep.replaced.push(day);
      }
      if (pd.title && !d.title.trim()) { d.title = pd.title; rep.texts++; }
      if (pd.story) { d.story = pd.story; rep.texts++; }
      if (pd.question) { d.question = pd.question; rep.texts++; }
      var mine = {};
      d.words.forEach(function (x) { mine[x.w] = x; });
      pd.words.forEach(function (x) {
        if (seen[x.w]) return;
        seen[x.w] = 1;
        // the day has the word: a changed clue is a correction
        if (mine[x.w]) { if (mine[x.w].c !== x.c) { mine[x.w].c = x.c; rep.updated++; } else rep.same++; return; }
        if (used[x.w] && !reuse) { rep.repeats++; return; }
        if (d.words.length >= ask + SPARE) { rep.extra++; return; }
        used[x.w] = day.id;
        mine[x.w] = { w: x.w, c: x.c };
        d.words.push(mine[x.w]);
        n++;
      });
      if (n) rep.added.push({ day: day, n: n });
    });
    return rep;
  }

  // Clears the words of days so their prompt asks for all of them again (titles and texts stay).
  function clearDays(project, days) {
    days.forEach(function (day) { if (project.days[day.id]) project.days[day.id].words = []; });
  }

  function addExtras(project, ex) {
    var got = [], need = P.weeks(project).length;
    if (ex.weeks.length) { project.ai.weeks = ex.weeks.slice(0, need); got.push(U.plural(Math.min(need, ex.weeks.length), 'week page')); }
    if (ex.eve.length) { project.ai.eve = ex.eve; got.push('Christmas Eve note'); }
    if (ex.blurb) { project.ai.blurb = ex.blurb; got.push('back cover text'); }
    return got;
  }

  // Words, clues and grids over the whole book.
  function totals(project) {
    var t = { days: 0, ready: 0, words: 0, clues: 0 };
    P.days(project).forEach(function (day) {
      t.days++;
      var st = CX.puzzles.status(project, day);
      t.words += st.words;
      if (st.pz) t.clues += st.pz.grid.entries.length;
      if (st.state === 'ok') t.ready++;
    });
    return t;
  }

  CX.content = { addReply: addReply, rewrites: rewrites, clearDays: clearDays, addExtras: addExtras, totals: totals };
})(typeof window !== 'undefined' ? window : globalThis);
