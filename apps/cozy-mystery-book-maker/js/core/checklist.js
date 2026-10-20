/* The pre-download checklist. Each failing item points at the exact page to fix. */
(function (root) {
  'use strict';
  var Cozy = root.Cozy = root.Cozy || {};
  var P = Cozy.puzzle, V = Cozy.validate;

  /*
   * state: { project, d, prepared, puzzles, final, book, batches }
   * Returns { items, warnings, ok }
   */
  function run(state) {
    var project = state.project, d = state.d, book = state.book;
    var items = [];
    function add(id, label, ok, detail, page, extra) {
      var o = { id: id, label: label, ok: !!ok, detail: detail || '', page: page || null };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      items.push(o);
    }

    var s = project.setup;
    var titleOk = !!Cozy.book.title(project) && !!project.plan;
    add('names', 'The pen name and book title are filled in', s.penName.trim() && titleOk,
      !s.penName.trim() ? 'Add your pen name in Setup.' : (!titleOk ? 'Choose a title in Story plan.' : ''), 1, { step: !s.penName.trim() ? 'setup' : 'plan' });

    var missing = [];
    for (var n = 1; n <= d.N; n++) {
      var ch = project.chapters[n];
      if (!ch || !ch.title || !ch.paragraphs || !ch.paragraphs.length) missing.push(n);
    }
    var epOk = project.epilogue && project.epilogue.paragraphs.length;
    add('present', 'All chapters are present and there is an epilogue', !missing.length && epOk,
      missing.length ? 'Missing: chapter ' + listShort(missing) + '.' : (!epOk ? 'The epilogue is missing. It comes with the last part of the chapters.' : ''),
      missing.length ? d.pages.chapter(missing[0]) : (!epOk ? d.pages.epilogue : null), { step: 'chapters' });

    var tooLong = [];
    Object.keys(book.fit).forEach(function (k) { if (!book.fit[k].fits) tooLong.push(k); });
    add('fit', 'Every chapter fits on one page', !tooLong.length,
      tooLong.length ? tooLong.map(function (k) { return (k === 'epilogue' ? 'The epilogue' : 'Chapter ' + k) + ' needs about ' + book.fit[k].cut + ' fewer words'; }).join('; ') + '.' : '',
      tooLong.length ? (tooLong[0] === 'epilogue' ? d.pages.epilogue : d.pages.chapter(+tooLong[0])) : null,
      { fixChapter: tooLong.length && tooLong[0] !== 'epilogue' ? +tooLong[0] : null });

    var badPuzzles = [], clueBad = [];
    for (var m = 1; m <= d.N; m++) {
      var pz = state.puzzles[m];
      if (!pz || !pz.ok) { badPuzzles.push(m); continue; }
      var v = P.verifyStored(pz);
      if (!v.ok) badPuzzles.push(m);
      var clue = d.clueByChapter[m];
      if (clue && clue.word) {
        var prep = state.prepared[m];
        var listed = prep && prep.list.some(function (x) { return x.isClue && x.norm === clue.word; });
        if (!listed || pz.hidden !== clue.word || !v.ok) clueBad.push(m);
      }
    }
    add('puzzles', 'Every puzzle is built and passed its checks', !badPuzzles.length,
      badPuzzles.length ? 'Puzzle ' + listShort(badPuzzles) + ' ' + (badPuzzles.length === 1 ? 'needs' : 'need') + ' attention.' : '',
      badPuzzles.length ? d.pages.puzzle(badPuzzles[0]) : null);
    add('clues', 'Every hidden clue is listed and missing from its grid', !clueBad.length,
      clueBad.length ? 'Check puzzle ' + listShort(clueBad) + '.' : '', clueBad.length ? d.pages.puzzle(clueBad[0]) : null);

    var f = state.final, fOk = false, fDetail = '';
    if (f && f.ok) {
      var fv = P.verifyStored(f);
      fOk = fv.ok;
      fDetail = fOk ? (f.exact ? 'Leftover letters: ' + f.messageSpaced + '.' : 'Leftover letters: ' + f.messageSpaced + ' (' + f.spare + ' spare squares are printed solid black).') : 'The final grid did not pass its check. Use Reshuffle on the Final Reveal page.';
    } else fDetail = f && f.reason ? f.reason : 'The final puzzle has not been built yet.';
    add('final', 'The final puzzle spells the message with the killer’s name', fOk, fDetail, d.pages.final, { info: fOk });

    var pagesOk = book.pages.length === d.pages.total && d.pages.total >= 24 && d.pages.total <= 828;
    var insideOk = Math.abs(d.insideMarginIn - (Cozy.book.kdpMinInside(book.pages.length) + 0.375)) < 1e-9;
    add('pages', 'The page count is within 24 to 828 and the inside margin matches it', pagesOk && insideOk,
      book.pages.length + ' pages, inside margin ' + d.insideMarginIn + ' in (KDP minimum ' + Cozy.book.kdpMinInside(book.pages.length) + ' in).', null, { info: pagesOk && insideOk });

    add('margins', 'Nothing extends outside the margins', !book.outside.length,
      book.outside.length ? 'Check page ' + listShort(book.outside) + '.' : '', book.outside[0] || null);
    add('fonts', 'No text is set below 7 pt', book.minFont >= 7,
      'Smallest text: ' + book.minFont + ' pt.', null, { info: book.minFont >= 7 });

    // non-blocking notes worth a look
    var warnings = [];
    (state.batches || []).forEach(function (b) {
      b.issues.forEach(function (i) {
        if (i.level === 'warning') warnings.push({ text: i.text, page: i.n ? d.pages.chapter(i.n) : (i.where === 'Epilogue' ? d.pages.epilogue : null) });
      });
    });
    if (project.plan) {
      V.famousNameIssues([project.plan.sleuth.name, project.plan.victim.name].concat(project.plan.suspects.map(function (x) { return x.name; })))
        .forEach(function (i) { warnings.push({ text: i.text, page: null }); });
    }
    var grown = [];
    for (var k = 1; k <= d.N; k++) if (state.puzzles[k] && state.puzzles[k].grew) grown.push(k);
    if (grown.length) warnings.push({ text: 'Puzzle ' + listShort(grown) + ' needed a larger grid than ' + d.gridSize + ' x ' + d.gridSize + ' to fit its words.', page: d.pages.puzzle(grown[0]) });

    return { items: items, warnings: warnings, ok: items.every(function (i) { return i.ok; }) };
  }

  function listShort(arr) {
    if (arr.length <= 6) return arr.join(', ');
    return arr.slice(0, 6).join(', ') + ' and ' + (arr.length - 6) + ' more';
  }

  Cozy.checklist = { run: run };
})(typeof window !== 'undefined' ? window : globalThis);
