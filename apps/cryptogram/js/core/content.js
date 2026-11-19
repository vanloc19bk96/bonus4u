/*
 * Puts the AI's sentences into the book: matches each part of a reply to its puzzle and fills the
 * puzzles that are not ready. A finished puzzle only changes when the buyer chooses Replace, so a
 * pasted reply never undoes work by surprise. The app's own library can fill puzzles too.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan, E = CX.engine;

  /*
   * Which puzzle each part of a reply belongs to: [{ part, pz }], pz null when none fits.
   * fallback: the puzzles of the prompt the reply answers, for parts without a number. A chat that
   * numbered a later batch from 1 again (1 to 25 for puzzles 26 to 50) is read in order.
   */
  function match(project, parsed, fallback) {
    var all = P.puzzles(project), out = [], fb = fallback || [];
    var open = fb.filter(function (x) { return !CX.prompts.done(project, x); });
    var nos = parsed.puzzles.map(function (p) { return p.no; });
    var renumbered = fb.length > 1 && fb[0].no > 1 && nos.length > 1 && nos.every(function (n, i) { return n === i + 1; }) && nos.length <= fb.length;
    parsed.puzzles.forEach(function (part, i) {
      var pz = null;
      if (renumbered) pz = fb[i] || null;
      else if (part.no) {
        pz = all[part.no - 1] || null;
        if (pz) open = open.filter(function (x) { return x.id !== pz.id; });
      } else pz = open.shift() || null;
      out.push({ part: part, pz: pz });
    });
    return out;
  }

  function same(a, b) { return E.sameKey(a.text) === E.sameKey(b.text) && E.sameKey(a.by) === E.sameKey(b.by); }

  // Finished puzzles that a reply brings a new version of: [{ pz }].
  function rewrites(project, parsed, fallback) {
    var out = [];
    match(project, parsed, fallback).forEach(function (m) {
      if (!m.pz || !CX.prompts.done(project, m.pz) || !m.part.text) return;
      if (same(project.puzzles[m.pz.id], m.part) || out.some(function (r) { return r.pz.id === m.pz.id; })) return;
      out.push({ pz: m.pz });
    });
    return out;
  }

  /*
   * Adds a puzzles reply. replace: ids of finished puzzles the reply may overwrite (from rewrites()).
   * Returns { filled: [pz], kept: [pz], unplaced, touched: [pz] }.
   */
  function addReply(project, parsed, fallback, replace) {
    var rep = { filled: [], kept: [], touched: [], unplaced: 0 };
    match(project, parsed, fallback).forEach(function (m) {
      var part = m.part, pz = m.pz;
      if (!pz) { rep.unplaced++; return; }
      var ready = CX.prompts.done(project, pz);
      if (rep.touched.indexOf(pz) === -1) rep.touched.push(pz);
      if (ready && (replace || []).indexOf(pz.id) === -1) { if (rep.kept.indexOf(pz) === -1) rep.kept.push(pz); return; }
      var d = P.puzzle(project, pz.id), changed = !same(d, part);
      d.text = part.text;
      d.by = part.by || '';
      if (changed) d.v = (d.v || 0) + 1;
      if (rep.filled.indexOf(pz) === -1) rep.filled.push(pz);
    });
    rep.kept = rep.kept.filter(function (x) { return rep.filled.indexOf(x) === -1; });
    return rep;
  }

  // Clears puzzles so their prompt asks for them again.
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

  // The same sentence on more than one puzzle: [{ name, nos }].
  function repeats(project) {
    var seen = {}, names = {};
    P.puzzles(project).forEach(function (x) {
      var d = project.puzzles[x.id];
      if (!d || !d.text.trim()) return;
      var k = E.sameKey(d.text);
      if (!k) return;
      names[k] = names[k] || E.clean(d.text);
      (seen[k] = seen[k] || []).push(x.no);
    });
    return Object.keys(seen).filter(function (k) { return seen[k].length > 1; }).map(function (k) { return { name: CX.text.shortenAtWord(names[k], 48) + (names[k].length > 48 ? '…' : ''), nos: seen[k] }; });
  }

  function totals(project) {
    var t = { puzzles: 0, ready: 0, letters: 0 };
    P.puzzles(project).forEach(function (x) {
      t.puzzles++;
      var st = CX.puzzles.status(project, x);
      if (st.state === 'ok') { t.ready++; t.letters += E.letterCount(st.pz.coded); }
    });
    return t;
  }

  // ---------- the app's own library ----------
  var INSPIRE = ['hope', 'courage', 'action', 'character', 'kindness', 'gratitude', 'happiness', 'life', 'friendship', 'patience', 'nature'];
  function libraryPool(project) {
    var t = P.theme(project.plan.theme), q = CX.library.QUOTES;
    if (t.library === 'all') return q;
    if (t.library === 'inspire') return q.filter(function (x) { return INSPIRE.indexOf(x[2]) >= 0 && !/proverb/i.test(x[1]); });
    if (t.library === 'proverbs') return q.filter(function (x) { return /proverb/i.test(x[1]) || x[1] === 'Aesop'; });
    return [];
  }

  // How many library quotes this book could still take.
  function libraryLeft(project) {
    var used = {};
    Object.keys(project.puzzles).forEach(function (k) { used[E.sameKey(project.puzzles[k].text)] = 1; });
    return libraryPool(project).filter(function (x) { return !used[E.sameKey(x[0])]; }).length;
  }

  /*
   * Fills the puzzles that have no sentence with quotes from the library: for each puzzle, one of
   * the length its level asks for when there is one, else the longest that still fits. Never a
   * quote the book already has. Returns { filled: [pz], left: [pz] (still empty) }.
   */
  function fillFromLibrary(project, pzs) {
    var used = {}, rng = CX.util.makeRng(project.seed + '|library');
    Object.keys(project.puzzles).forEach(function (k) { used[E.sameKey(project.puzzles[k].text)] = 1; });
    var pool = rng.shuffle(libraryPool(project).filter(function (x) { return !used[E.sameKey(x[0])]; }).slice());
    var out = { filled: [], left: [] };
    (pzs || P.puzzles(project)).forEach(function (x) {
      var d = project.puzzles[x.id];
      if (d && d.text.trim()) return;
      var r = CX.prompts.length(project, P.levelOf(project, x)), pick = -1, best = -1;
      for (var i = 0; i < pool.length; i++) {
        var n = pool[i][0].length;
        if (n >= r.lo && n <= r.hi) { pick = i; break; }
        if (n <= r.hi && (best < 0 || n > pool[best][0].length)) best = i;
      }
      if (pick < 0) pick = best;
      if (pick < 0) { out.left.push(x); return; }
      var q = pool.splice(pick, 1)[0], e = P.puzzle(project, x.id);
      e.text = q[0]; e.by = q[1]; e.v = (e.v || 0) + 1;
      out.filled.push(x);
    });
    return out;
  }

  CX.content = { match: match, addReply: addReply, rewrites: rewrites, clearPuzzles: clearPuzzles, addExtras: addExtras, repeats: repeats, totals: totals, libraryPool: libraryPool, libraryLeft: libraryLeft, fillFromLibrary: fillFromLibrary };
})(typeof window !== 'undefined' ? window : globalThis);
