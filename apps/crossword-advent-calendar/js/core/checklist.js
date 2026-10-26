/* The checks before download: what the book still needs, in plain words, and which step fixes it. */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan;

  // book: the print layout. Returns [{ ok, label, detail, step }].
  function run(project, book) {
    var out = [], b = project.book, pl = project.plan;
    var author = (b.author || '').trim();
    out.push({ ok: !!author, step: 1, label: 'Pen name', detail: author ? author : 'Type the name to print on the cover and title page.' });
    [{ set: 'main', n: pl.days, label: 'Hidden sentence' }, { set: 'bonus', n: 12, label: 'Twelve Days sentence' }].forEach(function (s) {
      if (s.set === 'bonus' && !pl.bonus) return;
      var have = P.sentenceOf(project, s.set).length;
      out.push({ ok: have === s.n, step: 1, label: s.label, detail: have === s.n ? '“' + (s.set === 'bonus' ? pl.bonusSentence : pl.sentence).trim() + '”' : have + ' letters; it needs exactly ' + s.n + ', one for each day.' });
    });
    var days = P.days(project), missing = [], weak = [];
    days.forEach(function (day) {
      var st = CX.puzzles.status(project, day), d = project.days[day.id] || P.emptyDay();
      var label = (day.set === 'bonus' ? 'bonus ' : 'day ') + day.no;
      if (st.state === 'empty' || st.state === 'words' || !d.title.trim()) missing.push(label);
      else if (st.state === 'weak') weak.push(label + ' (' + st.pz.problems.join('; ') + ')');
    });
    out.push({
      ok: !missing.length, step: 3, label: 'Words and clues',
      detail: missing.length ? 'Still missing for ' + short(missing) + '. Copy the prompts in step 3.' : 'Every day has its title, words and clues.'
    });
    out.push({
      ok: !weak.length && !missing.length, step: 3, label: 'Grids',
      detail: weak.length ? 'Too small: ' + short(weak) + '. Copy that day’s prompt again for a few more words, or click New grid.' : missing.length ? 'Built as the words come in.' : days.length + ' grids, all checked.'
    });
    var texts = [];
    if (pl.story) days.forEach(function (day) { var d = project.days[day.id]; if (d && d.words.length && !d.story.trim()) texts.push((day.set === 'bonus' ? 'bonus ' : 'day ') + day.no); });
    var qs = [];
    if (pl.memory) days.forEach(function (day) { var d = project.days[day.id]; if (d && d.words.length && !d.question.trim()) qs.push((day.set === 'bonus' ? 'bonus ' : 'day ') + day.no); });
    if (pl.story || pl.memory) out.push({ ok: !texts.length && !qs.length, step: 3, label: 'Stories and questions', detail: texts.length || qs.length ? 'Missing for ' + short(texts.concat(qs).filter(function (x, i, a) { return a.indexOf(x) === i; })) + '.' : 'All in' });
    var ai = project.ai, miss = [];
    if (ai.weeks.length < P.weeks(project).length) miss.push('week pages');
    if (!ai.eve.length) miss.push('Christmas Eve note');
    if (!ai.blurb.trim()) miss.push('back cover text');
    out.push({ ok: !miss.length, step: 3, label: 'Week pages and back cover', detail: miss.length ? 'Missing: ' + miss.join(', ') + ' (last prompt in step 3)' : 'All in' });
    var n = book.pages.length, max = CX.kdp.maxPages(b.trim, b.paper);
    out.push({
      ok: n >= CX.kdp.MIN_PAGES && n <= max, step: 2, label: 'Page count',
      detail: n < CX.kdp.MIN_PAGES ? n + ' pages. KDP needs at least ' + CX.kdp.MIN_PAGES + '.' : n > max ? n + ' pages. KDP prints at most ' + max + ' at this size.' : n + ' pages (KDP allows ' + CX.kdp.MIN_PAGES + ' to ' + max + ')'
    });
    return out;
  }

  function short(list) { return list.length > 6 ? list.slice(0, 6).join(', ') + ' and ' + (list.length - 6) + ' more' : list.join(', '); }

  function ready(items) { return items.every(function (i) { return i.ok; }); }

  CX.checklist = { run: run, ready: ready };
})(typeof window !== 'undefined' ? window : globalThis);
