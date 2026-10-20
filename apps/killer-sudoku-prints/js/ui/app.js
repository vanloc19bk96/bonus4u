/*
 * app.js: wires settings, puzzle generation, layout, checks, preview and export together.
 *
 * Flow: a settings change updates `state.settings` (what the form shows). Layout settings
 * take effect at once. Puzzle settings (count, difficulty and mix, seed) only take effect when the
 * user clicks Create puzzles, which copies them into `state.applied` and gives the
 * generator a new plan; until then the book keeps its current puzzles and Download waits.
 * The app opens with no puzzles: the preview shows a placeholder until the first Create.
 * Every change rebuilds the Book (cheap: it is pagination only); the preview redraws only
 * pages whose content changed. Nothing is stored in the browser: each visit starts from
 * the defaults.
 */
(function () {
  'use strict';
  var S = KS.Settings, L = KS.Layout, C = KS.Checks;

  var PUZZLE_KEYS = ['count', 'difficulty', 'mix', 'seed'];
  var state = {
    settings: S.defaults(),
    applied: null,       // the puzzle settings the current puzzles were made for; null until the first Create
    version: 1,
    gen: { puzzles: [], ready: 0, total: 0, failed: false, cancelled: false, running: false },
    book: null,
    scan: null,
    scanKey: '',
    stopScan: null,
    exporting: null,
    exportError: ''
  };
  var form, preview, status, generator;

  // The settings the book is built from: the form's layout settings with the puzzle
  // settings of the puzzles that exist.
  function bookSettings() { return Object.assign({}, state.settings, state.applied); }

  function isPending() {
    if (!state.applied) return true;
    return S.puzzleKey(state.settings) !== S.puzzleKey(state.applied);
  }

  // Called by the form. kind: 'puzzles' (count, difficulty, mix, seed) or 'layout'. Both only
  // re-lay out; puzzle settings wait for create().
  function update(mutate, kind) {
    mutate(state.settings);
    state.version++;
    state.exportError = '';
    rebuild();
  }

  // Create puzzles: apply the puzzle settings and generate what is missing.
  function create() {
    state.applied = {};
    PUZZLE_KEYS.forEach(function (k) { state.applied[k] = state.settings[k]; });
    state.applied.mix = Object.assign({}, state.settings.mix);
    state.version++;
    state.exportError = '';
    generator.setPlan(state.applied.seed, S.puzzlePlan(state.applied.count, state.applied.difficulty, state.applied.mix)); // rebuilds via onGenerated
  }

  function onGenerated(gen) {
    state.gen = gen;
    rebuild();
  }

  function rebuild() {
    var s = state.settings, pending = isPending();
    var options = L.perPageOptions(bookSettings());
    var current = options.filter(function (o) { return o.n === s.perPage; })[0];
    if (!current.ok) {
      // Keep the book valid: fall back to the most puzzles per page that still fit.
      var usable = options.filter(function (o) { return o.ok; });
      var alt = usable[usable.length - 1];
      if (alt) {
        form.show('perpage', 'note', 'Switched to ' + alt.n + ' per page: ' + s.perPage +
          ' per page would make cells too small to write in at ' + KS.KDP.trim(s.trim).label + '.');
        s.perPage = alt.n;
        options = L.perPageOptions(bookSettings());
      }
    }
    var book = L.build(bookSettings(), state.gen.puzzles, state.version);
    state.book = book;

    var notes = {};
    if (book.margins.raised) {
      notes.inside = { kind: 'note', text: 'Raised to ' + book.margins.inside + ' in, the KDP minimum for a ' + book.pageCount + '-page book.' };
    } else if (s.margins.autoInside) {
      notes.inside = { kind: 'hint', text: 'Automatic: ' + book.margins.inside + ' in for ' + book.pageCount + ' pages (KDP minimum ' + book.margins.kdpInside + ' in).' };
    }
    // Page-count problems belong next to the number of puzzles. They are judged on the
    // number typed in the form, so the advice comes before Create puzzles is clicked.
    var draft = pending ? L.build(s, [], state.version) : book;
    var empty = !state.applied;
    C.run(draft, { gen: state.gen, scan: null }).forEach(function (c) {
      if ((c.id === 'minPages' || c.id === 'maxPages') && c.status === 'fail') notes.count = { kind: 'error', text: c.message };
    });
    if (s.pages.title && !book.titleFit.title) notes.title = { kind: 'warn', text: 'The title is too long to fit on the title page in three lines. Shorten it.' };
    if (s.pages.title && !book.titleFit.subtitle) notes.subtitle = { kind: 'warn', text: 'The subtitle is too long to fit in three lines. Shorten it.' };

    form.render({ settings: s, book: book, perPage: options, notes: notes, pending: pending, empty: empty });
    preview.setBook(empty ? null : book);
    maybeScan(book);
    paintStatus();
  }

  // The page-content checks run once every puzzle exists, and again after layout changes.
  function maybeScan(book) {
    var g = state.gen, complete = !!state.applied && g.ready === g.total && !g.failed;
    var key = complete ? String(book.version) + '|' + g.total : '';
    if (key === state.scanKey) return;
    if (state.stopScan) state.stopScan();
    state.stopScan = null;
    state.scan = null;
    state.scanKey = key;
    if (!complete) return;
    state.stopScan = C.scanBook(book, function (summary) {
      state.stopScan = null;
      state.scan = summary;
      paintStatus();
    });
  }

  function paintStatus() {
    var book = state.book, g = state.gen;
    var checks = C.run(book, { gen: g, scan: state.scan, pending: isPending(), empty: !state.applied });
    var blocking = checks.filter(function (c) { return c.status === 'fail'; });
    var pending = checks.filter(function (c) { return c.status === 'pending'; });
    var model = { checks: checks, progress: null, action: null, canDownload: false };

    if (state.exporting) {
      var ex = state.exporting;
      model.tone = 'busy';
      model.text = ex.done < ex.total ? 'Building PDF · page ' + ex.done + ' / ' + ex.total : 'Building PDF · saving…';
      model.progress = ex.done / ex.total;
      model.action = { label: 'Cancel', run: function () { ex.cancelled = true; } };
    } else if (state.exportError) {
      model.tone = 'bad';
      model.text = state.exportError;
    } else if (blocking.length) {
      // Before the first Create nothing is wrong yet, so the dot stays neutral.
      model.tone = blocking[0].id === 'applied' && !state.applied ? 'idle' : 'bad';
      model.text = blocking[0].message;
      // 'applied' needs no action here: the Create puzzles button sits right below.
      if (blocking[0].id === 'generated' && g.cancelled) {
        model.action = { label: 'Resume', run: function () { generator.resume(); } };
      }
    } else if (g.running) {
      model.tone = 'busy';
      model.text = 'Creating puzzles ' + g.ready + ' / ' + g.total;
      model.progress = g.total ? g.ready / g.total : 0;
      model.action = { label: 'Cancel', run: function () { generator.cancel(); } };
    } else if (pending.length) {
      model.tone = 'busy';
      model.text = 'Checking pages…';
    } else {
      model.tone = 'ok';
      model.text = book.pageCount + ' pages · Ready for KDP';
      model.canDownload = true;
    }
    status.render(model);
  }

  // ---------------------------------------------------------------- download
  function download() {
    if (state.exporting || document.getElementById('download').disabled) return;
    var book = state.book;
    var job = state.exporting = { done: 0, total: book.pageCount, cancelled: false };
    paintStatus();
    KS.Pdf.exportBook(book, {
      onProgress: function (done) { job.done = done; paintStatus(); },
      isCancelled: function () { return job.cancelled; }
    }).then(function (res) {
      state.exporting = null;
      save(res.bytes, res.fileName);
      paintStatus();
      showKdp(book, res.fileName);
    }, function (err) {
      state.exporting = null;
      if (!job.cancelled) state.exportError = 'The PDF could not be created: ' + (err && err.message || err);
      paintStatus();
    });
  }

  function save(bytes, name) {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function showKdp(book, fileName) {
    var rows = [
      ['Trim size', book.trim.label],
      ['Bleed', 'No bleed'],
      ['Interior', 'Black & white, white paper'],
      ['Page count', String(book.pageCount)],
      ['Manuscript', fileName]
    ];
    var dl = document.getElementById('kdp-values');
    dl.textContent = '';
    rows.forEach(function (r) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = r[0];
      dd.textContent = r[1];
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    var dialog = document.getElementById('kdp-dialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  // ---------------------------------------------------------------- start
  function start() {
    form = new KS.Form(update, create);
    preview = new KS.Preview();
    status = new KS.Status();
    generator = new KS.Generator(onGenerated);
    KS.App.generator = generator;
    document.getElementById('download').addEventListener('click', download);
    // Nothing is created until the user asks: the preview opens on a placeholder.
    rebuild();
  }

  // Draw with the real fonts from the first frame, so the preview never reflows.
  KS.Svg.loadFonts().then(start, start);

  KS.App = { state: state };
})();
