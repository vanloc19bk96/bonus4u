/*
 * Puts the AI's puzzles into the book: matches each part of a reply to its puzzle and fills the
 * puzzles that are not ready. A finished puzzle only changes when the buyer chooses Replace, so a
 * pasted reply never undoes work by surprise.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan;

  // Which puzzle each part of a reply belongs to: [{ part, pz }], pz null when none fits.
  // fallback: the puzzles of the prompt the reply answers, used for parts without a PUZZLE line.
  function match(project, parsed, fallback) {
    var all = P.puzzles(project), out = [];
    var open = (fallback || []).filter(function (x) { return !CX.prompts.done(project, x); });
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

  function sameGroups(a, b) { return JSON.stringify(a.map(function (g) { return g.words; })) === JSON.stringify(b.map(function (g) { return g.words; })); }

  // Finished puzzles that a reply brings a new version of: [{ pz }].
  function rewrites(project, parsed, fallback) {
    var out = [];
    match(project, parsed, fallback).forEach(function (m) {
      if (!m.pz || !CX.prompts.done(project, m.pz) || m.part.groups.length < 4) return;
      if (sameGroups(project.puzzles[m.pz.id].groups, m.part.groups) || out.some(function (r) { return r.pz.id === m.pz.id; })) return;
      out.push({ pz: m.pz });
    });
    return out;
  }

  /*
   * Adds a puzzles reply. replace: ids of finished puzzles the reply may overwrite (from rewrites()).
   * A puzzle that is not ready takes the reply's version when it has at least as many groups.
   * Returns { filled: [pz], kept: [pz], unplaced, touched: [pz] }.
   */
  function addReply(project, parsed, fallback, replace) {
    var rep = { filled: [], kept: [], touched: [], unplaced: 0 };
    match(project, parsed, fallback).forEach(function (m) {
      var part = m.part, pz = m.pz;
      if (!pz) { rep.unplaced++; return; }
      var d = P.puzzle(project, pz.id), ready = CX.prompts.done(project, pz);
      if (rep.touched.indexOf(pz) === -1) rep.touched.push(pz);
      if (ready && (replace || []).indexOf(pz.id) === -1) { if (rep.kept.indexOf(pz) === -1) rep.kept.push(pz); return; }
      if (!ready && part.groups.length < d.groups.length) return;
      d.groups = part.groups.slice(0, 4).map(function (g) { return { link: g.link, words: g.words.slice(0, 8) }; });
      d.trap = part.trap || '';
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

  // Links on more than one puzzle: [{ name, nos }]. answers: the same for answers.
  function repeats(project, answers) {
    var seen = {}, names = {};
    P.puzzles(project).forEach(function (x) {
      var d = project.puzzles[x.id];
      if (!d) return;
      var mine = {};
      d.groups.forEach(function (g) {
        (answers ? g.words : [g.link]).forEach(function (s) {
          var k = answers ? P.letters(s) : String(s).trim().toLowerCase().replace(/[^a-z0-9_ ]+/g, '').replace(/\s+/g, ' ');
          if (!k || mine[k]) return;
          mine[k] = 1;
          names[k] = names[k] || String(s).trim();
          (seen[k] = seen[k] || []).push(x.no);
        });
      });
    });
    return Object.keys(seen).filter(function (k) { return seen[k].length > 1; }).map(function (k) { return { name: names[k], nos: seen[k] }; });
  }

  function totals(project) {
    var t = { puzzles: 0, ready: 0 };
    P.puzzles(project).forEach(function (x) { t.puzzles++; if (CX.puzzles.status(project, x).state === 'ok') t.ready++; });
    return t;
  }

  CX.content = { addReply: addReply, rewrites: rewrites, clearPuzzles: clearPuzzles, addExtras: addExtras, repeats: repeats, totals: totals };
})(typeof window !== 'undefined' ? window : globalThis);
