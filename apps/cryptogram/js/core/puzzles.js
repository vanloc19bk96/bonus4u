/*
 * One code per puzzle: cleans the sentence, makes its code, picks the given letters and the hint,
 * and says why a puzzle cannot print yet. Results are cached by everything they depend on, so the
 * preview can lay the book out again on every keystroke.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan, E = CX.engine;

  var cache = {}, cacheSize = 0;

  // How the name under a sentence is printed. A verse reference is never put in code.
  function byMode(project) {
    var kind = P.byKind(project), m = project.plan.by;
    if (!kind && project.plan.theme !== 'custom') return 'back';
    if (kind === 'ref' && m === 'code') return 'plain';
    return m;
  }

  // What the solver decodes: the sentence, and the name after a dash when it is in code.
  function codedText(project, text, by) {
    return by && byMode(project) === 'code' ? text + ' — ' + by : text;
  }

  var BY_WORD = { person: 'name', origin: 'origin (like “Irish proverb”)', ref: 'verse reference' };

  /*
   * { text, by, level, code, key, given (plain letters), hint (a plain letter or null), coded (what
   * is in code), problems (keep it out of the PDF), warnings (worth a look), ok } or null when the
   * puzzle has no text yet.
   */
  function get(project, pz) {
    var d = project.puzzles[pz.id];
    if (!d || !String(d.text || '').trim()) return null;
    var b = project.book, pl = project.plan, lvl = P.levelOf(project, pz);
    var k = [project.seed, pz.id, d.v || 0, b.trim, b.print, b.paper, pl.perPage, pl.tracker, pl.code, pl.by, pl.theme, pl.audience, lvl, d.text, d.by, CX.layout ? CX.layout.headingRoom(project) : 0].join('~');
    if (cache[k] !== undefined) return cache[k];
    var text = E.clean(d.text), by = E.cleanBy(d.by);
    var res = { text: text, by: by, level: lvl, code: pl.code, key: null, given: [], hint: null, coded: '', problems: E.problems({ text: text }), warnings: [], ok: false };
    if (!res.problems.length) {
      res.coded = codedText(project, text, by);
      res.key = E.makeKey(project.seed + '|' + pz.id + '|' + (d.v || 0) + '|' + pl.code, pl.code);
      res.given = E.given(res.coded, P.givenCount(project, lvl));
      res.hint = E.hint(res.coded, res.given);
      if (CX.layout && !CX.layout.fitsPage(project, res)) res.problems.push('it is too long for a page at this page and text size (' + E.letterCount(res.coded) + ' letters)');
    }
    var kind = P.byKind(project);
    if (kind && !by) res.warnings.push('it has no ' + BY_WORD[kind] + ' to go with it');
    res.ok = !res.problems.length;
    if (cacheSize > 4000) { cache = {}; cacheSize = 0; }
    cache[k] = res; cacheSize++;
    return res;
  }

  /*
   * The puzzles the PDF prints: only sound ones, numbered without a gap, so a puzzle that is not
   * ready can never leave a blank page. The index stays the puzzle's own: it sets the level.
   */
  function printed(project) {
    var out = [];
    P.puzzles(project).forEach(function (x) {
      var res = get(project, x);
      if (res && res.ok) out.push({ id: x.id, no: out.length + 1, index: x.index });
    });
    return out;
  }

  // 'empty', 'ok', or 'weak' (has text, but a problem keeps it out).
  function status(project, pz) {
    var res = get(project, pz);
    if (!res) return { state: 'empty' };
    return { state: res.ok ? 'ok' : 'weak', pz: res };
  }

  function clearCache() { cache = {}; cacheSize = 0; }

  CX.puzzles = { get: get, printed: printed, status: status, clearCache: clearCache, byMode: byMode, codedText: codedText };
})(typeof window !== 'undefined' ? window : globalThis);
