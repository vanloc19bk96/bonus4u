/* The checks before download: what the book still needs, in plain words, and which step fixes it. */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan;

  // book: the print layout. Returns [{ ok, label, detail, step }].
  function run(project, book) {
    var out = [], b = project.book;
    var author = (b.author || '').trim();
    out.push({ ok: !!author, step: 1, label: 'Pen name', detail: author ? author : 'Type the name to print on the cover and title page.' });
    var all = P.puzzles(project), missing = [], weak = [], spoils = [];
    all.forEach(function (x) {
      var st = CX.puzzles.status(project, x), d = project.puzzles[x.id] || P.emptyPuzzle();
      if (st.state === 'empty' || st.state === 'words' || !d.title.trim() || !d.theme.trim()) missing.push(x.no);
      else if (st.state === 'weak') weak.push(x.no);
      var s = CX.puzzles.titleSpoils(project, x);
      if (s) spoils.push(x.no + ' (' + s + ')');
    });
    out.push({
      ok: !missing.length, step: 3, label: 'Themes and words',
      detail: missing.length ? 'Still missing for puzzle ' + short(missing) + '. Copy the prompts in step 3.' : 'Every puzzle has its title, theme, span word and words.'
    });
    out.push({
      ok: !weak.length && !missing.length, step: 3, label: 'Grids',
      detail: weak.length ? 'No grid yet for puzzle ' + short(weak) + '. Copy that prompt again for a few more words.' : missing.length ? 'Built as the words come in.' : all.length + ' grids. Every letter is used and each has exactly one solution.'
    });
    out.push({ ok: !spoils.length, step: 3, label: 'Titles', detail: spoils.length ? 'These titles give the span word away: puzzle ' + short(spoils) + '. Click Edit to change them.' : 'No title names its own span word.' });
    var rep = CX.content.repeats(project);
    out.push({
      ok: !rep.length, step: 3, label: 'No repeats',
      detail: rep.length ? rep.slice(0, 3).map(function (r) { return 'The ' + r.what + ' ' + r.name + ' is on puzzles ' + r.nos.join(', '); }).join('. ') + (rep.length > 3 ? '; and ' + (rep.length - 3) + ' more' : '') + '.' : 'No span word or title is used twice.'
    });
    var ai = project.ai, miss = [];
    if (!ai.welcome.length) miss.push('welcome note');
    if (!ai.closing.length) miss.push('closing note');
    if (!ai.blurb.trim()) miss.push('back cover text');
    out.push({ ok: !miss.length, step: 3, label: 'Welcome, closing and back cover', detail: miss.length ? 'Missing: ' + miss.join(', ') + ' (last prompt in step 3)' : 'All in' });
    var n = book.pages.length, max = CX.kdp.maxPages(b.trim, b.paper);
    out.push({
      ok: n >= CX.kdp.MIN_PAGES && n <= max, step: 2, label: 'Page count',
      detail: n < CX.kdp.MIN_PAGES ? n + ' pages. KDP needs at least ' + CX.kdp.MIN_PAGES + '.' : n > max ? n + ' pages. KDP prints at most ' + max + ' at this size.' : n + ' pages (KDP allows ' + CX.kdp.MIN_PAGES + ' to ' + max + ')'
    });
    return out;
  }

  function short(list) { return list.length > 8 ? list.slice(0, 8).join(', ') + ' and ' + (list.length - 8) + ' more' : list.join(', '); }

  function ready(items) { return items.every(function (i) { return i.ok; }); }

  CX.checklist = { run: run, ready: ready };
})(typeof window !== 'undefined' ? window : globalThis);
