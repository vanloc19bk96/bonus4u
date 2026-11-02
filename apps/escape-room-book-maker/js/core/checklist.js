/* The checks before download: what the book still needs, in plain words, and which step fixes it. */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan;

  function short(list) { return list.length > 8 ? list.slice(0, 8).join(', ') + ' and ' + (list.length - 8) + ' more' : list.join(', '); }

  // book: the print layout. Returns [{ ok, label, detail, step }].
  function run(project, book) {
    var out = [], b = project.book, author = (b.author || '').trim(), rooms = P.rooms(project);
    out.push({ ok: !!author, step: 1, label: 'Pen name', detail: author ? author : 'Type the name to print on the cover and title page.' });
    var need = CX.prompts.storyNeeds(project);
    out.push({ ok: !need.length, step: 3, label: 'The story', detail: need.length ? 'The first prompt in step 3 still has parts to write (' + need.length + ').' : 'The opening, the rooms, the ending and the notes are in.' });
    var wp = CX.puzzles.wordProblem(project);
    if (project.plan.finale === 'escape') out.push({ ok: !wp, step: 3, label: 'The final word', detail: wp ? cap(wp) + '. Copy the first prompt again, or type a word that fits in step 3.' : 'It fits: one key letter from each room.' });
    var missing = [], broken = [];
    rooms.forEach(function (r) {
      if (!CX.prompts.roomDone(project, r)) missing.push(r.no);
      r.slots.forEach(function (s) { var st = CX.puzzles.status(project, s); if (st.state === 'problem') broken.push(s.key + ' (' + st.problem + ')'); });
    });
    out.push({ ok: !missing.length, step: 3, label: 'The rooms', detail: missing.length ? 'Still to write: room ' + short(missing) + '.' : 'Every room has its story and its puzzles.' });
    out.push({ ok: !broken.length, step: 3, label: 'Puzzles', detail: broken.length ? 'Can’t be built yet: ' + short(broken) + '. Copy that prompt again.' : 'Every puzzle was built and proved to have one answer.' });
    if (book.pages && book.model) {
      var route = CX.layout.verifyRoute(project, book), tight = book.pages.filter(function (p) { return p.meta.tight; }).map(function (p) { return p.meta.tight; });
      out.push({ ok: !route.length, step: 3, label: 'The route through the book', detail: route.length ? route.slice(0, 2).join('. ') + (route.length > 2 ? '; and ' + (route.length - 2) + ' more' : '') + '.' : 'Played from the first room to the ending: every code, table and page number is right.' });
      if (tight.length) out.push({ ok: false, step: 2, label: 'Page fit', detail: 'These puzzles are cramped: ' + short(tight) + '. Shorten their story, or choose a bigger page or smaller text.' });
    }
    var rep = CX.content.repeats(project);
    out.push({ ok: !rep.length, step: 3, label: 'No repeats', detail: rep.length ? rep.slice(0, 3).map(function (r) { return 'The ' + r.what + ' "' + r.name + '" is on ' + r.where.join(', '); }).join('. ') + '.' : 'No room name or title is used twice.' });
    var n = book.pages ? book.pages.length : 0, max = CX.kdp.maxPages(b.trim, b.paper);
    out.push({
      ok: n >= CX.kdp.MIN_PAGES && n <= max, step: 2, label: 'Page count',
      detail: n < CX.kdp.MIN_PAGES ? n + ' pages. KDP needs at least ' + CX.kdp.MIN_PAGES + '.' : n > max ? n + ' pages. KDP prints at most ' + max + ' at this size.' : n + ' pages (KDP allows ' + CX.kdp.MIN_PAGES + ' to ' + max + ')'
    });
    return out;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function ready(items) { return items.every(function (i) { return i.ok; }); }

  CX.checklist = { run: run, ready: ready };
})(typeof window !== 'undefined' ? window : globalThis);
