/*
 * The pre-download checklist: everything KDP checks that this app can check itself, plus the
 * fairness proof of every puzzle. Plain words only; each item says what to do when it fails.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var KDP = CX.kdp;

  // The share of cases that may come from the starter library every user of the app has.
  var MAX_STARTER_SHARE = 1 / 3;

  function inches(v) { return (Math.round(v * 1000) / 1000) + ' in'; }

  /*
   * Returns { items: [{ ok, title, detail, step }], warnings: [text], canDownload, unfair: [text] }
   * step: the sidebar step that fixes the item.
   */
  function build(project, built, book) {
    var s = project.setup, items = [], warnings = [];

    var author = (s.author || '').trim();
    items.push({ ok: !!author, step: 1, title: 'Pen name', detail: author ? 'Printed on the title page as “' + author + '”.' : 'Type your pen name in step 1.' });
    var title = (s.title || '').trim();
    items.push({ ok: !!title, step: 1, title: 'Title', detail: title ? '“' + title + '”.' : 'Type a title in step 1.' });

    var n = built.all.length, want = built.want;
    var missing = Object.keys(built.short).reduce(function (a, k) { return a + built.short[k]; }, 0);
    items.push({
      ok: n > 0 && !missing,
      step: 2,
      title: 'Puzzles',
      detail: !n ? 'There are no puzzles yet. Add puzzle packs in step 2, or set how many cases each level has in step 1.'
        : missing ? 'The book asks for ' + want + ' cases but your packs give only ' + n + '. Add more packs in step 2 (each pack gives two cases), or lower the counts in step 1.'
          : n + ' cases in ' + built.levels.filter(function (l) { return l.puzzles.length; }).length + ' levels.'
    });

    // every puzzle checked again, clue by clue, from scratch
    var unfair = [];
    built.all.forEach(function (pz) {
      var probs = CX.engine.verify(pz.pack, pz);
      if (probs.length) unfair.push('Case ' + pz.no + ': ' + probs[0]);
    });
    items.push({
      ok: n > 0 && !unfair.length,
      step: 3,
      title: 'Fair puzzles',
      detail: unfair.length ? unfair[0] + (unfair.length > 1 ? ' (and ' + (unfair.length - 1) + ' more). Click “New clues” on that case in step 3.' : '. Click “New clues” on that case in step 3.')
        : 'Checked one by one: every case has exactly one answer, the answer is never touched by a clue, and every clue is needed.'
    });

    var share = built.starterShare;
    items.push({
      ok: n > 0 && share <= MAX_STARTER_SHARE + 1e-9,
      step: 2,
      title: 'Your own content',
      detail: share <= MAX_STARTER_SHARE + 1e-9
        ? (share > 0 ? Math.round(share * 100) + '% of the cases come from the starter library; the rest are your own.' : 'Every case comes from your own packs.')
        : Math.round(share * 100) + '% of the cases come from the starter library that every user of this app has. KDP can reject books that repeat other books, so at least two thirds must come from your own packs. Add packs in step 2, or turn the starter library off.'
    });

    var pages = book.pageCount, maxP = KDP.maxPages(s.trim, s.paper);
    items.push({
      ok: pages >= KDP.MIN_PAGES && pages <= maxP,
      step: 1,
      title: 'Page count',
      detail: pages + ' pages (KDP prints ' + KDP.MIN_PAGES + ' to ' + maxP + ' for ' + book.trim.label + ' on ' + KDP.paper(s.paper).label.toLowerCase() + ').'
    });

    var m = book.margins, need = KDP.minGutter(pages);
    items.push({
      ok: m.inside >= need && m.outside >= KDP.MIN_OUTSIDE && m.top >= KDP.MIN_OUTSIDE && m.bottom >= KDP.MIN_OUTSIDE,
      step: 1,
      title: 'Margins',
      detail: 'Inside ' + inches(m.inside) + ' (KDP minimum for ' + pages + ' pages: ' + inches(need) + '). Outside, top and bottom ' + inches(Math.min(m.outside, m.top, m.bottom)) + ' or more (minimum 0.25 in). No bleed.'
    });

    var a = CX.layout.audit(book);
    var smallest = Infinity;
    book.pages.forEach(function (pg) { pg.items.forEach(function (it) { if (it.t === 'text' && it.size < smallest) smallest = it.size; }); });
    items.push({
      ok: !a.length,
      step: 1,
      title: 'Print quality',
      detail: a.length ? a[0] + (a.length > 1 ? ' (and ' + (a.length - 1) + ' more).' : '.')
        : 'Fonts embedded, smallest text ' + (Math.round(smallest * 10) / 10) + ' pt, lines 0.75 pt or thicker, everything inside the margins.'
    });

    // recommended, not required
    var factCases = CX.prompts.auditCases(built).length;
    var checked = project.factCheck && project.factCheck.sig === factSig(built);
    if (factCases && !checked) warnings.push('Recommended: have an AI fact-check the ' + factCases + ' cases with knowledge clues (step 3). It catches clues a reader could argue with.');
    if (s.pages.welcome === false) warnings.push('The “How to play” pages are off. First-time readers rely on them.');

    return {
      items: items, warnings: warnings, unfair: unfair, factChecked: !!checked, factCases: factCases,
      canDownload: items.every(function (i) { return i.ok; })
    };
  }

  // A signature of the knowledge clues in the book, so a fact-check stays valid until they change.
  function factSig(built) {
    var parts = [];
    CX.prompts.auditCases(built).forEach(function (pz) {
      pz.clues.forEach(function (c) { if (c.type === 'fact' || c.type === 'notFact') parts.push(pz.key + ':' + c.text + ':' + c.yes + ':' + c.maybe); });
    });
    return CX.util.hashHex(parts.join('|'));
  }

  CX.checklist = { build: build, factSig: factSig, MAX_STARTER_SHARE: MAX_STARTER_SHARE };
})(typeof window !== 'undefined' ? window : globalThis);
