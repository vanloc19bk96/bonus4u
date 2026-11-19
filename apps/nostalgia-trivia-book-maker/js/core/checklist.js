/* The checks before download: what the book still needs, in plain words, and which step fixes it. */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan;

  var NAMES = { welcome: 'welcome letter', ranks: 'score card ranks', blurb: 'back cover text' };

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function count(n, one, many) { return (P.NUM[n] ? cap(P.NUM[n]) : n) + ' ' + (n === 1 ? one : many); }

  // book: the print layout. Returns [{ ok, label, detail, step }].
  function run(project, book) {
    var out = [], b = project.book, per = project.plan.perRound;
    var ds = P.decades(project), ts = P.themes(project), rs = P.rounds(project);
    var author = (b.author || '').trim();
    out.push({ ok: ds.length > 0, step: 1, label: 'Decades', detail: ds.length ? ds.map(function (d) { return d.id; }).join(', ') : 'Pick at least one decade.' });
    out.push({ ok: !!author, step: 1, label: 'Pen name', detail: author ? author : 'Type the name to print on the cover and title page.' });
    out.push({ ok: ts.length > 0, step: 2, label: 'Rounds', detail: ts.length ? count(ts.length, 'round', 'rounds') + ' in every decade' : 'Pick at least one theme.' });
    var short = rs.filter(function (r) { return (project.questions[r.id] || []).length < per; });
    var have = CX.questions.total(project), want = rs.length * per;
    var list = short.slice(0, 6).map(function (r) { return r.full + ' (' + CX.prompts.missing(project, r) + ')'; }).join(', ') + (short.length > 6 ? ' and ' + (short.length - 6) + ' more rounds' : '');
    out.push({
      ok: rs.length > 0 && !short.length, step: 3, label: 'Questions',
      detail: !rs.length ? 'Pick decades and themes first.' : !short.length ? have + ' questions, every round full' : have + ' of ' + want + ' questions. Still missing: ' + list
    });
    if (CX.prompts.eraWanted(project).length && ds.length) {
      var missE = ds.filter(function (d) { return CX.prompts.eraMissing(project, d.id).length; });
      out.push({ ok: !missE.length, step: 3, label: 'Decade pages', detail: missE.length ? 'Missing for ' + missE.map(function (d) { return d.id; }).join(', ') + ' (the "Decade pages" prompt in step 3)' : 'All in' });
    }
    var miss = CX.prompts.extrasWanted(project).filter(function (k) { return !CX.prompts.hasExtra(project, k); });
    out.push({ ok: !miss.length, step: 3, label: 'Welcome letter and extras', detail: miss.length ? 'Missing: ' + miss.map(function (k) { return NAMES[k]; }).join(', ') + ' (last prompt in step 3)' : 'All in' });
    var n = book.pages.length, max = CX.kdp.maxPages(b.trim, b.paper);
    out.push({
      ok: n >= CX.kdp.MIN_PAGES && n <= max, step: 2, label: 'Page count',
      detail: n < CX.kdp.MIN_PAGES ? n + ' pages. KDP needs at least ' + CX.kdp.MIN_PAGES + ': add rounds or questions.'
        : n > max ? n + ' pages. KDP prints at most ' + max + ' at this size: fewer questions, rounds or decades.' : n + ' pages (KDP allows ' + CX.kdp.MIN_PAGES + ' to ' + max + ')'
    });
    return out;
  }

  function ready(items) { return items.every(function (i) { return i.ok; }); }

  CX.checklist = { run: run, ready: ready };
})(typeof window !== 'undefined' ? window : globalThis);
