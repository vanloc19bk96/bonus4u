/*
 * Puts the AI's puzzles into the book: matches each part of a reply to its puzzle, keeps a title,
 * theme and span word once they are set, adds the words a puzzle does not have yet and stops at
 * the number of words a puzzle can use. A reply that rewrites a finished puzzle can replace it.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan;

  var SPARE = 10;   // words a puzzle may hold beyond what the prompt asks for

  // Which puzzle each part of a reply belongs to: [{ part, pz }], pz null when none fits.
  // fallback: the puzzles of the prompt the reply answers, used for parts without a PUZZLE line.
  function match(project, parsed, fallback) {
    var all = P.puzzles(project), out = [];
    var open = (fallback || []).filter(function (x) { return !CX.prompts.puzzleDone(project, x); });
    parsed.puzzles.forEach(function (part) {
      var pz = null;
      if (part.no) {
        pz = all[part.no - 1] || null;
        if (pz) open = open.filter(function (x) { return x.id !== pz.id; });
      } else pz = open.shift() || null;
      out.push({ part: part, pz: pz });
    });
    return out;
  }

  /*
   * The puzzles a reply rewrites rather than tops up: puzzles that have words, given at least half
   * as many again, repeating some of them or for a puzzle that was finished. [{ pz, have, got, same }]
   */
  function rewrites(project, parsed, fallback) {
    var out = [];
    match(project, parsed, fallback).forEach(function (m) {
      var d = m.pz && project.puzzles[m.pz.id];
      if (!d || !d.words.length || !m.part.words.length || out.some(function (r) { return r.pz.id === m.pz.id; })) return;
      var same = m.part.words.filter(function (w) { return d.words.indexOf(w) !== -1; }).length;
      if (m.part.words.length * 2 >= d.words.length && (same || CX.prompts.puzzleDone(project, m.pz))) out.push({ pz: m.pz, have: d.words.length, got: m.part.words.length, same: same });
    });
    return out;
  }

  /*
   * Adds a puzzles reply. replace: ids of the puzzles the reply replaces (from rewrites()); those also
   * take the reply's title, theme and span word. A top-up never changes them, except a span word the
   * grid cannot use. Returns { added: [{ pz, n }], replaced: [pz], same, texts, extra, unplaced, skipped }.
   */
  function addReply(project, parsed, fallback, replace) {
    var ask = P.limits(project).ask;
    var rep = { added: [], replaced: [], same: 0, texts: 0, extra: 0, unplaced: 0, skipped: parsed.skipped.length };
    match(project, parsed, fallback).forEach(function (m) {
      var part = m.part, pz = m.pz;
      if (!pz) { rep.unplaced += part.words.length; return; }
      var d = P.puzzle(project, pz.id), n = 0;
      var swap = (replace || []).indexOf(pz.id) !== -1 && part.words.length && rep.replaced.indexOf(pz) === -1;
      if (swap) { d.words = []; rep.replaced.push(pz); }
      if (part.title && (swap || !d.title.trim())) { d.title = part.title; rep.texts++; }
      if (part.theme && (swap || !d.theme.trim())) { d.theme = part.theme; rep.texts++; }
      if (part.span && (swap || !d.span.trim() || CX.puzzles.spanProblem(project, d))) { d.span = part.span; rep.texts++; }
      part.words.forEach(function (w) {
        if (d.words.indexOf(w) !== -1) { rep.same++; return; }
        if (d.words.length >= ask + SPARE) { rep.extra++; return; }
        d.words.push(w);
        n++;
      });
      if (n) rep.added.push({ pz: pz, n: n });
    });
    return rep;
  }

  // Clears puzzles so their prompt asks for all of them again.
  function clearPuzzles(project, pzs) {
    pzs.forEach(function (x) { delete project.puzzles[x.id]; });
  }

  function addExtras(project, ex) {
    var got = [];
    if (ex.welcome.length) { project.ai.welcome = ex.welcome; got.push('welcome note'); }
    if (ex.closing.length) { project.ai.closing = ex.closing; got.push('closing note'); }
    if (ex.blurb) { project.ai.blurb = ex.blurb; got.push('back cover text'); }
    return got;
  }

  // Span words or titles that appear on more than one puzzle: [{ what, name, nos }].
  function repeats(project) {
    var out = [];
    [{ key: 'span', what: 'span word', norm: P.letters }, { key: 'title', what: 'title', norm: function (s) { return String(s).trim().toLowerCase(); } }].forEach(function (f) {
      var seen = {};
      P.puzzles(project).forEach(function (x) {
        var d = project.puzzles[x.id], v = d ? f.norm(d[f.key]) : '';
        if (v) (seen[v] = seen[v] || []).push(x.no);
      });
      Object.keys(seen).forEach(function (v) { if (seen[v].length > 1) out.push({ what: f.what, name: v, nos: seen[v] }); });
    });
    return out;
  }

  // Words and grids over the whole book.
  function totals(project) {
    var t = { puzzles: 0, ready: 0, words: 0, printed: 0 };
    P.puzzles(project).forEach(function (x) {
      t.puzzles++;
      var st = CX.puzzles.status(project, x);
      t.words += st.words;
      if (st.state === 'ok') { t.ready++; t.printed += st.pz.grid.trails.length; }
    });
    return t;
  }

  CX.content = { addReply: addReply, rewrites: rewrites, clearPuzzles: clearPuzzles, addExtras: addExtras, repeats: repeats, totals: totals };
})(typeof window !== 'undefined' ? window : globalThis);
