/* The checks before download: what the book still needs, in plain words, and which step fixes it. */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan;

  // book: the print layout. Returns [{ ok, label, detail, step }].
  function run(project, book) {
    var out = [], b = project.book, per = project.plan.perChapter;
    var chs = P.chapters(project);
    var author = (b.author || '').trim();
    out.push({ ok: !!author, step: 1, label: 'Pen name', detail: author ? author : 'Type the name to print on the cover and title page.' });
    out.push({ ok: chs.length > 0, step: 2, label: 'Chapters', detail: chs.length ? P.NUM[chs.length] ? cap(P.NUM[chs.length]) + ' chapters' : chs.length + ' chapters' : 'Pick at least one chapter.' });
    var short = chs.filter(function (ch) { return (project.questions[ch.id] || []).length < per; });
    var have = CX.questions.total(project), want = chs.length * per;
    out.push({
      ok: chs.length > 0 && !short.length, step: 3, label: 'Questions',
      detail: !short.length ? have + ' questions, all chapters full'
        : have + ' of ' + want + ' questions. Still missing: ' + short.map(function (ch) { return ch.title + ' (' + CX.prompts.missing(project, ch) + ')'; }).join(', ')
    });
    var want2 = CX.prompts.extrasWanted(project), ai = project.ai;
    var miss = want2.filter(function (k) { return k === 'blurb' ? !ai.blurb.trim() : !ai[k].length; });
    var names = { welcome: 'welcome letter', born: 'year facts', memories: 'memory prompts', blurb: 'back cover text' };
    out.push({ ok: !miss.length, step: 3, label: 'Welcome letter and extras', detail: miss.length ? 'Missing: ' + miss.map(function (k) { return names[k]; }).join(', ') + ' (last prompt in step 3)' : 'All in' });
    var n = book.pages.length, max = CX.kdp.maxPages(b.trim, b.paper);
    out.push({
      ok: n >= CX.kdp.MIN_PAGES && n <= max, step: 2, label: 'Page count',
      detail: n < CX.kdp.MIN_PAGES ? n + ' pages. KDP needs at least ' + CX.kdp.MIN_PAGES + ': add chapters or questions.'
        : n > max ? n + ' pages. KDP prints at most ' + max + ' at this size.' : n + ' pages (KDP allows ' + CX.kdp.MIN_PAGES + ' to ' + max + ')'
    });
    return out;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function ready(items) { return items.every(function (i) { return i.ok; }); }

  CX.checklist = { run: run, ready: ready };
})(typeof window !== 'undefined' ? window : globalThis);
