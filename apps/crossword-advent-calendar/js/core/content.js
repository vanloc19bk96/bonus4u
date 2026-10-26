/*
 * Puts the AI's words into the book: matches each day of a reply to its day, keeps titles and
 * texts, drops words the book already has (on that day or another) and stops a day at the number
 * of words a grid can use.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan, U = CX.util;

  var SPARE = 10;   // words a day may hold beyond what the prompt asks for

  /*
   * Adds a days reply. fallback: the days of the prompt the reply answers, used for parts without
   * a DAY line. Returns { added: [{ day, n }], texts, repeats, extra, unplaced, skipped }.
   */
  function addReply(project, parsed, fallback) {
    var all = P.days(project), ask = P.grid(project.plan.size).ask;
    var rep = { added: [], texts: 0, repeats: 0, extra: 0, unplaced: 0, skipped: parsed.skipped.length };
    var used = {};
    all.forEach(function (d) { ((project.days[d.id] || {}).words || []).forEach(function (x) { used[x.w] = d.id; }); });
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
      if (!day) { rep.unplaced += pd.words.length; return; }
      var d = P.day(project, day.id), n = 0;
      if (pd.title) { d.title = pd.title; rep.texts++; }
      if (pd.story) { d.story = pd.story; rep.texts++; }
      if (pd.question) { d.question = pd.question; rep.texts++; }
      pd.words.forEach(function (x) {
        if (used[x.w]) { rep.repeats++; return; }
        if (d.words.length >= ask + SPARE) { rep.extra++; return; }
        used[x.w] = day.id;
        d.words.push({ w: x.w, c: x.c });
        n++;
      });
      if (n) rep.added.push({ day: day, n: n });
    });
    return rep;
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

  CX.content = { addReply: addReply, addExtras: addExtras, totals: totals };
})(typeof window !== 'undefined' ? window : globalThis);
