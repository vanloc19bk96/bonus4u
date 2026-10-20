/*
 * The pre-download checklist: everything KDP checks that this app can check itself, plus the
 * puzzle's fairness proof. Plain words only; each item says what to do when it fails.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var KDP = LK.kdp;

  function inches(v) { return (Math.round(v * 1000) / 1000) + ' in'; }

  /*
   * Returns { items: [{ ok, title, detail }], warnings: [text], storyIssues, canDownload }
   */
  function build(project, cs, book) {
    var items = [], warnings = [];
    var story = project.story;
    var storyIssues = story ? LK.story.check(story, cs, project) : [];
    var storyErrors = storyIssues.filter(function (i) { return i.level === 'error'; });

    var author = (project.setup.author || '').trim();
    items.push({ ok: !!author, title: 'Pen name', detail: author ? 'Printed on the title page as “' + author + '”.' : 'Type your pen name in step 1.' });

    items.push({
      ok: !!story && !storyErrors.length,
      title: 'Story',
      detail: !story ? 'Paste your story in step 2.' : storyErrors.length ? storyErrors[0].text + (storyErrors.length > 1 ? ' (and ' + (storyErrors.length - 1) + ' more)' : '') : 'Pasted and checked.'
    });

    var c = cs.check;
    items.push({
      ok: c.ok,
      title: 'Fair puzzle',
      detail: c.ok ? 'Checked on all ' + cs.records.length.toLocaleString('en-US') + ' ' + cs.type.unit.many + ': exactly one answer, and every one of the ' + cs.clues.length + ' clues is needed.'
        : 'The puzzle check failed. Click “New case” in step 1.'
    });

    var n = book.pageCount;
    items.push({
      ok: n >= KDP.MIN_PAGES && n <= KDP.MAX_PAGES,
      title: 'Page count',
      detail: n + ' pages (KDP allows ' + KDP.MIN_PAGES + ' to ' + KDP.MAX_PAGES + ' for black ink on white paper).'
    });

    var m = book.margins, need = KDP.minGutter(n);
    items.push({
      ok: m.inside >= need && m.outside >= KDP.MIN_OUTSIDE && m.top >= KDP.MIN_OUTSIDE && m.bottom >= KDP.MIN_OUTSIDE,
      title: 'Margins',
      detail: 'Inside ' + inches(m.inside) + ' (KDP minimum for ' + n + ' pages: ' + inches(need) + '). Outside, top and bottom ' + inches(Math.min(m.outside, m.top, m.bottom)) + ' or more (minimum 0.25 in). No bleed.'
    });

    var a = LK.layout.audit(book);
    var smallest = Infinity;
    book.pages.forEach(function (pg) { pg.items.forEach(function (it) { if (it.t === 'text' && it.size < smallest) smallest = it.size; }); });
    var printOk = !a.outside.length && !a.tiny && !a.thin && !a.pale;
    var why = [];
    if (a.outside.length) why.push('something sits outside the margins on page ' + a.outside.slice(0, 5).join(', '));
    if (a.tiny) why.push(a.tiny + ' pieces of text are under 7 pt');
    if (a.thin) why.push(a.thin + ' lines are thinner than 0.75 pt');
    if (a.pale) why.push(a.pale + ' gray areas are too pale to print');
    items.push({
      ok: printOk,
      title: 'Print quality',
      detail: printOk ? 'Fonts embedded, smallest text ' + (Math.round(smallest * 10) / 10) + ' pt, lines 0.75 pt or thicker, everything inside the margins, ' + book.trim.label + ' pages.'
        : 'Problem: ' + why.join('; ') + '.'
    });

    var layoutErrors = book.problems.filter(function (p) { return p.level === 'error'; });
    if (layoutErrors.length) items.push({ ok: false, title: 'Layout', detail: layoutErrors[0].text });

    items.push({
      ok: !project.sample,
      title: 'Your own content',
      detail: project.sample ? 'This is the shared sample. Make your own book to download.' : 'Case file ' + project.seed.toUpperCase() + ': an archive and clues made only for this book.'
    });

    storyIssues.filter(function (i) { return i.level === 'warning'; }).forEach(function (i) { warnings.push(i.text); });
    book.problems.filter(function (p) { return p.level === 'warning'; }).forEach(function (p) { warnings.push(p.text); });

    return {
      items: items, warnings: warnings, storyIssues: storyIssues,
      canDownload: items.every(function (i) { return i.ok; })
    };
  }

  LK.checklist = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
