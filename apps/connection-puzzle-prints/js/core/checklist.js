/* The checks before download: what the book still needs, in plain words, and which step fixes it. */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan;

  // book: the print layout. Returns [{ ok, label, detail, step }].
  function run(project, book) {
    var out = [], b = project.book;
    var author = (b.author || '').trim();
    out.push({ ok: !!author, step: 1, label: 'Pen name', detail: author ? author + '. Type it exactly the same on KDP: changing it after publishing is a chore.' : 'Type the name to print on the cover and title page.' });
    var all = P.puzzles(project), missing = [], weak = [], looks = [];
    all.forEach(function (x) {
      var st = CX.puzzles.status(project, x);
      if (st.state === 'empty' || st.state === 'part') missing.push(x.no);
      else if (st.state === 'weak') weak.push(x.no + ' (' + st.pz.problems[0] + ')');
      if (st.pz && st.pz.warnings.length) looks.push(x.no + ' (' + st.pz.warnings[0] + ')');
    });
    out.push({
      ok: !missing.length, step: 3, label: 'Puzzles written',
      detail: missing.length ? 'Still missing: puzzle ' + short(missing) + '. Copy the prompts in step 3.' : 'Every puzzle has four groups of four.'
    });
    out.push({
      ok: !weak.length, step: 3, label: 'Puzzles checked',
      detail: weak.length ? 'Not ready: puzzle ' + short(weak) + '. Click Edit to fix it, or copy its prompt again.' : 'Sixteen different answers on every board, each short enough for its tile.'
    });
    var print = CX.puzzles.printed(project).length;
    out.push({
      ok: print === all.length, step: 3, label: 'Puzzles in the PDF',
      detail: print === all.length ? 'All ' + print + ' puzzles.' : print ? 'The PDF has the ' + print + ' puzzles that are ready, numbered 1 to ' + print + ', with no blank page. The title page and cover say ' + print + ' too, so use ' + print + ' in your KDP listing.' : 'No puzzle is ready yet.'
    });
    out.push({ ok: !looks.length, step: 3, label: 'Worth a look', detail: looks.length ? 'Puzzle ' + short(looks) + '. Click Edit to change it, or use the check prompt.' : 'No link gives its own answer away, and no board has two forms of one word.' });
    var rep = CX.content.repeats(project);
    out.push({
      ok: !rep.length, step: 3, label: 'No repeated links',
      detail: rep.length ? rep.slice(0, 3).map(function (r) { return '“' + r.name + '” is on puzzles ' + r.nos.join(', '); }).join('. ') + (rep.length > 3 ? '; and ' + (rep.length - 3) + ' more' : '') + '.' : 'Every link in the book is used once.'
    });
    var ai = project.ai, miss = [];
    if (!ai.welcome.length) miss.push('welcome note');
    if (!ai.closing.length) miss.push('closing note');
    if (!ai.blurb.trim()) miss.push('back cover text');
    out.push({ ok: !miss.length, step: 3, label: 'Welcome, closing and back cover', detail: miss.length ? 'Missing: ' + miss.join(', ') + ' (last prompt in step 3)' : 'All in' });
    // large print: every letter in the book, tiles included, at least the text size
    if (book.S && book.S.large) {
      var low = 0, at = [];
      book.pages.forEach(function (pg) {
        pg.items.forEach(function (it) {
          if (it.t !== 'text' || it.size >= book.S.min - 0.01) return;
          low = low ? Math.min(low, it.size) : it.size;
          if (at.indexOf(pg.label) < 0) at.push(pg.label);
        });
      });
      out.push({
        ok: !low, step: 2, label: P.largePrint(project) ? 'Large print' : 'Text size',
        detail: low ? 'Some words are only ' + (Math.round(low * 10) / 10) + ' pt (' + short(at) + ') because they are too long for a tile at this page size. Pick a bigger page size or one puzzle a page in step 2, or shorter answers.' : 'Every letter in the book, tiles and solutions included, is ' + book.S.min + ' pt or bigger.' + (P.largePrint(project) ? ' KDP counts 16 pt as large print.' : '')
      });
    }
    var n = book.pages.length, max = CX.kdp.maxPages(b.trim, b.paper);
    out.push({
      ok: n >= CX.kdp.MIN_PAGES && n <= max, step: 2, label: 'Page count',
      detail: n < CX.kdp.MIN_PAGES ? n + ' pages. KDP needs at least ' + CX.kdp.MIN_PAGES + '.' : n > max ? n + ' pages. KDP prints at most ' + max + ' at this size: choose two puzzles a page or fewer puzzles.' : n + ' pages (KDP allows ' + CX.kdp.MIN_PAGES + ' to ' + max + ')'
    });
    return out;
  }

  function short(list) { return list.length > 8 ? list.slice(0, 8).join(', ') + ' and ' + (list.length - 8) + ' more' : list.join(', '); }

  function ready(items) { return items.every(function (i) { return i.ok; }); }

  CX.checklist = { run: run, ready: ready };
})(typeof window !== 'undefined' ? window : globalThis);
