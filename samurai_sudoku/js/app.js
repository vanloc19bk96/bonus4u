/*
 * app.js: form state, validation, generation (Blob Web Workers, main-thread fallback),
 * preview navigation, live summary and PDF download.
 */
(function () {
  'use strict';
  var SS = window.SS, KDP = SS.KDP, Layout = SS.Layout, engine = SS.engine;

  var STORAGE_KEY = 'samuraiSudokuPrints.v1';
  var DEFAULTS = {
    trim: '8.5x11', bleed: false, marginPreset: 'comfortable',
    count: 50, difficulty: 'medium', perPage: 1,
    includeSolutions: true, solutionsPerPage: 4,
    pageNumbers: true, shadeShared: true, howToPlay: false, titlePrefix: 'Puzzle',
    copyrightPage: false, bookTitle: '', copyrightHolder: '', copyrightYear: new Date().getFullYear(), copyrightNotes: '',
    seed: '', symmetric: true
  };
  // Changing these needs a new Generate; everything else only re-lays out the pages.
  var REGEN_KEYS = ['count', 'difficulty', 'seed', 'symmetric'];
  var DIFFICULTY_HELP = {
    easy: 'Every step is a simple "only one digit fits here" move. About 150 to 170 digits given.',
    medium: 'Same simple moves, fewer digits given (about 125 to 149).',
    hard: 'Needs a few advanced moves (pairs, box and line eliminations). About 110 to 125 digits given.',
    expert: 'Needs moves beyond Hard, with as few digits given as possible.',
    mixed: 'The book gets harder as it goes: Easy, then Medium, Hard and Expert.'
  };

  var $ = function (id) { return document.getElementById(id); };
  var form = $('settings');

  var state = {
    settings: null,
    ui: { zoom: 'fit', view: 'single', guides: false },
    puzzles: null,          // generated puzzles (array)
    generatedWith: null,    // REGEN_KEYS snapshot of the last generation
    seedUsed: null,
    book: null,             // book built from the generated puzzles (for preview + export)
    page: 0,
    busy: null              // { kind: 'generate' | 'export', cancel: fn }
  };

  // ------------------------------------------------------------------ storage (optional)
  function loadStored() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveStored() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: state.settings, ui: state.ui }));
    } catch (e) { /* storage blocked: the app still works, it just won't remember */ }
  }
  function sanitize(s) {
    var out = {}, k;
    for (k in DEFAULTS) out[k] = s && s[k] !== undefined && typeof s[k] === typeof DEFAULTS[k] ? s[k] : DEFAULTS[k];
    if (!KDP.TRIMS.some(function (t) { return t.key === out.trim; })) out.trim = DEFAULTS.trim;
    if (['comfortable', 'minimum'].indexOf(out.marginPreset) < 0) out.marginPreset = DEFAULTS.marginPreset;
    if (['easy', 'medium', 'hard', 'expert', 'mixed'].indexOf(out.difficulty) < 0) out.difficulty = DEFAULTS.difficulty;
    if (!(out.count >= 1 && out.count <= 500)) out.count = DEFAULTS.count;
    out.count = Math.round(out.count);
    if ([1, 2].indexOf(out.perPage) < 0) out.perPage = 1;
    if ([1, 2, 4, 6].indexOf(out.solutionsPerPage) < 0) out.solutionsPerPage = 4;
    if (!(out.copyrightYear >= 1900 && out.copyrightYear <= 2100)) out.copyrightYear = DEFAULTS.copyrightYear;
    return out;
  }

  // ------------------------------------------------------------------ form <-> settings
  function buildTrimSelect() {
    var sel = $('trim');
    var groups = [['Recommended for puzzles', true], ['Other KDP sizes', false]];
    groups.forEach(function (g) {
      var og = document.createElement('optgroup');
      og.label = g[0];
      KDP.TRIMS.filter(function (t) { return !!t.recommended === g[1]; }).forEach(function (t) {
        var o = document.createElement('option');
        o.value = t.key; o.textContent = t.label;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  }

  function setRadio(name, value) {
    var inputs = form.querySelectorAll('input[name="' + name + '"]');
    Array.prototype.forEach.call(inputs, function (i) { i.checked = String(i.value) === String(value); });
  }
  function getRadio(name, fallback) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? Number(el.value) : fallback;
  }

  function writeForm(s) {
    $('trim').value = s.trim;
    $('bleed').checked = s.bleed;
    $('marginPreset').value = s.marginPreset;
    $('count').value = s.count;
    $('difficulty').value = s.difficulty;
    setRadio('perPage', s.perPage);
    $('includeSolutions').checked = s.includeSolutions;
    setRadio('solutionsPerPage', s.solutionsPerPage);
    $('pageNumbers').checked = s.pageNumbers;
    $('shadeShared').checked = s.shadeShared;
    $('howToPlay').checked = s.howToPlay;
    $('titlePrefix').value = s.titlePrefix;
    $('copyrightPage').checked = s.copyrightPage;
    $('bookTitle').value = s.bookTitle;
    $('copyrightHolder').value = s.copyrightHolder;
    $('copyrightYear').value = s.copyrightYear;
    $('copyrightNotes').value = s.copyrightNotes;
    $('seed').value = s.seed;
    $('symmetric').checked = s.symmetric;
  }

  function fieldError(id, msg) {
    var input = $(id), err = $(id + '-error');
    if (err) err.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }

  // Characters the embedded font can't draw (line breaks are fine, they split lines).
  function unprintable(str, bold) {
    var widths = SS.FONT_METRICS[bold ? 'bold' : 'regular'].widths, bad = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (ch !== '\n' && ch !== '\r' && widths[str.charCodeAt(i)] === undefined && bad.indexOf(ch) < 0) bad += ch;
    }
    return bad;
  }

  // Reads a free-text field; returns false (and shows an error) if it has characters the font lacks.
  function readText(id, bold) {
    var bad = unprintable($(id).value, bold);
    fieldError(id, bad ? 'These characters can’t be printed: ' + bad + '. Use letters, numbers and basic punctuation.' : '');
    if (!bad) state.settings[id] = $(id).value.trim();
    return !bad;
  }

  // Reads the form into settings. Invalid fields keep their last valid value and show an error.
  function readForm() {
    var s = state.settings, ok = true;
    s.trim = $('trim').value;
    s.bleed = $('bleed').checked;
    s.marginPreset = $('marginPreset').value;
    s.difficulty = $('difficulty').value;
    s.perPage = getRadio('perPage', s.perPage);
    s.includeSolutions = $('includeSolutions').checked;
    s.solutionsPerPage = getRadio('solutionsPerPage', s.solutionsPerPage);
    s.pageNumbers = $('pageNumbers').checked;
    s.shadeShared = $('shadeShared').checked;
    s.howToPlay = $('howToPlay').checked;
    s.copyrightPage = $('copyrightPage').checked;
    s.seed = $('seed').value.trim();
    s.symmetric = $('symmetric').checked;

    var raw = $('count').value.trim(), n = Number(raw);
    if (raw === '' || !isFinite(n) || n !== Math.floor(n) || n < 1 || n > 500) {
      fieldError('count', 'Enter a whole number from 1 to 500.');
      ok = false;
    } else {
      fieldError('count', '');
      s.count = n;
    }

    if (!readText('titlePrefix', true)) ok = false;
    if (!readText('bookTitle', true)) ok = false;
    if (!readText('copyrightHolder', false)) ok = false;
    if (!readText('copyrightNotes', false)) ok = false;

    var yRaw = $('copyrightYear').value.trim(), y = Number(yRaw);
    if (yRaw === '' || y !== Math.floor(y) || y < 1900 || y > 2100) {
      fieldError('copyrightYear', 'Enter a year such as ' + DEFAULTS.copyrightYear + '.');
      ok = false;
    } else {
      fieldError('copyrightYear', '');
      s.copyrightYear = y;
    }
    return ok;
  }

  // ------------------------------------------------------------------ derived state
  function isStale() {
    if (!state.puzzles) return false;
    var s = state.settings, g = state.generatedWith;
    return REGEN_KEYS.some(function (k) { return s[k] !== g[k]; });
  }

  function rebuildBook() {
    state.book = state.puzzles ? Layout.build(state.settings, state.puzzles) : null;
    if (state.book && state.page >= state.book.pageCount) state.page = state.book.pageCount - 1;
  }

  // The summary always describes what the current settings produce.
  function summaryBook() {
    return state.book && !isStale() ? state.book : Layout.build(state.settings, null);
  }

  function refresh() {
    rebuildBook();
    var book = summaryBook();
    updateOptionAvailability(book.plan);
    updateSummary(book);
    updateActions();
    renderPreview();
    saveStored();
  }

  function updateOptionAvailability(plan) {
    var s = state.settings;
    $('difficulty-help').textContent = DIFFICULTY_HELP[s.difficulty] || '';

    function apply(name, avail, requested, effective, helpId, unit) {
      Array.prototype.forEach.call(form.querySelectorAll('input[name="' + name + '"]'), function (input) {
        var a = avail[input.value];
        input.disabled = !a.ok;
        input.parentNode.title = a.ok ? '' : a.reason;
        input.checked = Number(input.value) === effective;
      });
      var help = $(helpId), off = Object.keys(avail).filter(function (k) { return !avail[k].ok; });
      help.classList.remove('warn');
      if (requested !== effective) {
        help.textContent = requested + ' ' + unit + ' is not available at this size (' + avail[requested].reason.replace(/^Digits/, 'digits') + '). Using ' + effective + '.';
        help.classList.add('warn');
      } else if (off.length) {
        help.textContent = off.join(' and ') + ' per page: off, because ' + avail[off[0]].reason.replace(/^Digits/, 'digits') + '.';
      } else {
        help.textContent = name === 'perPage' ? 'Two per page are stacked top and bottom.' : 'Filled-in digits print in gray, givens in bold black.';
      }
    }
    apply('perPage', plan.availability.perPage, s.perPage, plan.perPage, 'perPage-help', 'per page');
    apply('solutionsPerPage', plan.availability.solutionsPerPage, s.solutionsPerPage, plan.solutionsPerPage, 'solutionsPerPage-help', 'per page');
    $('solutionsPerPage-field').disabled = !s.includeSolutions;
    $('copyright-fields').hidden = !s.copyrightPage;
  }

  function inches(v) { return (Math.round(v * 1000) / 1000) + ' in'; }

  function updateSummary(book) {
    var plan = book.plan, pages = book.pageCount, m = book.margins;
    $('sum-pages').textContent = pages;
    $('sum-inside').textContent = inches(m.inside);
    $('sum-outside').textContent = inches(m.outside);

    // Check real draw commands on the first two pages of each kind (covers left + right pages).
    var sample = [], seen = {};
    book.pages.forEach(function (pg, i) {
      seen[pg.kind] = (seen[pg.kind] || 0) + 1;
      if (seen[pg.kind] <= 2) sample.push(i);
    });
    var v = Layout.validate(book, sample);
    var minFont = Math.min(v.minFont, plan.puzzleDigitPt, plan.solutionDigitPt || Infinity);
    var digits = 'Puzzle digits ' + plan.puzzleDigitPt.toFixed(1) + ' pt' +
      (plan.solutionDigitPt ? ', solution digits ' + plan.solutionDigitPt.toFixed(1) + ' pt' : '') + '.';

    // Each check: short chip label, full detail (tooltip + screen readers), fix text when failing.
    var checks = [];
    var pageFix = pages < KDP.MIN_PAGES
      ? 'Only ' + pages + ' pages. KDP needs at least 24: add ' + plan.puzzlesToAdd + ' more puzzle' + (plan.puzzlesToAdd === 1 ? '' : 's') + '.'
      : pages > KDP.MAX_PAGES
        ? pages + ' pages. KDP allows at most 828: use fewer puzzles or more solutions per page. Download is blocked until then.'
        : '';
    checks.push({ ok: !pageFix, label: '24\u2013828 pages', detail: 'Page count ' + pages + ' (24 to 828 allowed). Gutter set for ' + m.row.min + ' to ' + m.row.max + ' pages.', fix: pageFix });
    checks.push({ ok: minFont >= KDP.MIN_FONT_PT, label: 'Text \u2265 7 pt', detail: 'Smallest text ' + minFont.toFixed(1) + ' pt. ' + digits, fix: 'Some text is under 7 pt. ' + digits });
    checks.push({ ok: v.minLine >= KDP.MIN_LINE_PT, label: 'Lines \u2265 0.75 pt', detail: 'Thinnest line ' + v.minLine + ' pt.', fix: 'A line is thinner than 0.75 pt.' });
    checks.push({ ok: !!(SS.FONT_FILES && SS.FONT_FILES.regular), label: 'Fonts embedded', detail: 'Atkinson Hyperlegible is embedded in the PDF (SIL Open Font License).', fix: 'The font file did not load (js/fonts.js).' });
    checks.push({ ok: !v.outside.length, label: 'Inside margins', detail: 'Everything prints inside the live area.', fix: 'Something prints outside the margins. Try Comfortable margins.' });
    if (state.puzzles && !isStale()) {
      checks.push({ ok: true, label: 'One solution each', detail: state.puzzles.length + ' puzzles, each checked by a second, independent solver to have exactly one solution.' });
    }

    var ul = $('checks'), problems = $('check-problems');
    ul.innerHTML = '';
    problems.innerHTML = '';
    checks.forEach(function (c) {
      var li = document.createElement('li');
      li.className = c.ok ? 'ok' : 'bad';
      li.title = c.detail;
      li.textContent = c.label;
      var sr = document.createElement('span');
      sr.className = 'visually-hidden';
      sr.textContent = (c.ok ? ': passed. ' : ': problem. ') + c.detail;
      li.appendChild(sr);
      ul.appendChild(li);
      if (!c.ok) {
        var p = document.createElement('li');
        p.textContent = c.fix;
        problems.appendChild(p);
      }
    });
  }

  function updateActions() {
    var busy = !!state.busy, stale = isStale();
    $('stale-notice').hidden = !stale || busy;
    $('generate').disabled = busy;
    $('generate').textContent = state.busy && state.busy.kind === 'generate' ? 'Generating…' : 'Generate';
    var tooMany = !!state.book && state.book.pageCount > KDP.MAX_PAGES;
    $('download').disabled = busy || !state.book || stale || tooMany;
    $('download').title = !state.book ? 'Generate the puzzles first'
      : stale ? 'Click Generate to apply the new settings first'
      : tooMany ? 'KDP allows at most 828 pages' : '';
    if (state.seedUsed) {
      var el = $('seed-used');
      el.hidden = false;
      el.textContent = 'Last book used seed ' + state.seedUsed + '. Type it above to rebuild the same book.';
    }
  }

  // ------------------------------------------------------------------ progress UI
  function showProgress(text, done, total) {
    $('progress').hidden = false;
    $('progress-text').textContent = text;
    var pct = total ? Math.round(done / total * 100) : 0;
    $('progress-bar').setAttribute('aria-valuenow', pct);
    $('progress-bar').firstElementChild.style.width = pct + '%';
  }
  function hideProgress() { $('progress').hidden = true; }
  function actionError(msg) { $('action-error').textContent = msg || ''; }

  // ------------------------------------------------------------------ generation
  var workerUrl = null;
  function getWorkerUrl() {
    if (workerUrl) return workerUrl;
    // file:// pages can't start workers from a path, but a Blob URL works everywhere.
    var src = SamuraiEngineFactory.toString() +
      '\nvar engine = SamuraiEngineFactory();\n' +
      'self.onmessage = function (e) {\n' +
      '  var m = e.data;\n' +
      '  try { self.postMessage({ id: m.id, ok: true, puzzle: engine.generatePuzzle(m.opts) }); }\n' +
      '  catch (err) { self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }); }\n' +
      '};\n';
    workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    return workerUrl;
  }

  function jobsFor(s, seedStr) {
    var jobs = [];
    for (var i = 0; i < s.count; i++) {
      var d = Layout.difficultyForIndex(i, s.count, s.difficulty);
      jobs.push({ difficulty: d, symmetric: s.symmetric, seed: engine.hashString(seedStr + '|' + i + '|' + d + '|' + (s.symmetric ? 1 : 0)) });
    }
    return jobs;
  }

  // Runs jobs on a pool of Blob workers; falls back to async main-thread chunks if workers fail.
  function runJobs(jobs, onProgress) {
    var results = new Array(jobs.length), done = 0, cancelled = false, workers = [], fallbackTimer = null;
    var settle = {};
    var promise = new Promise(function (resolve, reject) { settle.resolve = resolve; settle.reject = reject; });

    function finishOne(id, puzzle) {
      if (results[id]) return;
      results[id] = puzzle;
      done++;
      onProgress(done, jobs.length);
      if (done === jobs.length) { stopWorkers(); settle.resolve(results); }
    }
    function stopWorkers() { workers.forEach(function (w) { w.terminate(); }); workers = []; }
    function fail(err) { cancelled = true; stopWorkers(); settle.reject(err); }

    function runOnMainThread() {
      SS.App.generationMode = 'main-thread';
      var pending = [];
      for (var i = 0; i < jobs.length; i++) if (!results[i]) pending.push(i);
      var k = 0;
      (function tick() {
        if (cancelled) return;
        var start = Date.now();
        try {
          // Do a slice of work, then yield so the page can repaint and Cancel stays clickable.
          while (k < pending.length && Date.now() - start < 40) {
            var id = pending[k++];
            finishOne(id, engine.generatePuzzle(jobs[id]));
          }
        } catch (e) { fail(e); return; }
        if (k < pending.length) fallbackTimer = setTimeout(tick, 0);
      })();
    }

    var size = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1, jobs.length));
    try {
      var url = getWorkerUrl(), next = 0;
      for (var w = 0; w < size; w++) {
        var worker = new Worker(url);
        worker.onmessage = function (e) {
          if (cancelled) return;
          var m = e.data;
          if (!m.ok) { fail(new Error(m.error)); return; }
          finishOne(m.id, m.puzzle);
          if (next < jobs.length) { var j = next++; this.postMessage({ id: j, opts: jobs[j] }); }
        };
        worker.onerror = function (e) {
          if (e && e.preventDefault) e.preventDefault();
          if (cancelled || !workers.length) return;
          stopWorkers();
          runOnMainThread();
        };
        workers.push(worker);
      }
      SS.App.generationMode = 'workers x' + size;
      workers.forEach(function (wk) { if (next < jobs.length) { var j = next++; wk.postMessage({ id: j, opts: jobs[j] }); } });
    } catch (e) {
      stopWorkers();
      runOnMainThread();
    }

    return {
      promise: promise,
      cancel: function () {
        cancelled = true;
        clearTimeout(fallbackTimer);
        stopWorkers();
        settle.reject(new Error('cancelled'));
      }
    };
  }

  function randomSeed() {
    var n;
    try {
      var a = new Uint32Array(1);
      window.crypto.getRandomValues(a);
      n = a[0];
    } catch (e) { n = Math.floor(Math.random() * 4294967296); }
    return String(n % 1000000000);
  }

  function startGenerate() {
    if (state.busy) return;
    actionError('');
    if (!readForm()) {
      var bad = form.querySelector('[aria-invalid="true"]');
      if (bad) bad.focus();
      actionError('Fix the highlighted field first.');
      return;
    }
    var s = JSON.parse(JSON.stringify(state.settings));
    var seedStr = s.seed || randomSeed();
    var jobs = jobsFor(s, seedStr);
    var run = runJobs(jobs, function (done, total) { showProgress('Generating ' + done + ' / ' + total, done, total); });
    state.busy = { kind: 'generate', cancel: run.cancel };
    showProgress('Generating 0 / ' + jobs.length, 0, jobs.length);
    updateActions();

    run.promise.then(function (puzzles) {
      // No duplicates within one book (astronomically unlikely, but checked anyway).
      var seen = {};
      puzzles.forEach(function (p, i) {
        var attempt = 0;
        while (seen[p.givens]) {
          attempt++;
          p = engine.generatePuzzle({ difficulty: jobs[i].difficulty, symmetric: s.symmetric, seed: engine.hashString(seedStr + '|' + i + '|dup' + attempt), exclude: seen });
          puzzles[i] = p;
        }
        seen[p.givens] = true;
        p.id = i + 1;
      });
      state.puzzles = puzzles;
      state.generatedWith = {};
      REGEN_KEYS.forEach(function (k) { state.generatedWith[k] = s[k]; });
      state.seedUsed = seedStr;
      state.page = 0;
      state.busy = null;
      hideProgress();
      refresh();
    }, function (err) {
      state.busy = null;
      hideProgress();
      if (err && err.message !== 'cancelled') actionError('Generation failed: ' + err.message);
      updateActions();
    });
  }

  // ------------------------------------------------------------------ export
  function startExport() {
    if (state.busy || !state.book || isStale()) return;
    actionError('');
    var book = state.book;
    if (book.pageCount > KDP.MAX_PAGES) {
      actionError('This book has ' + book.pageCount + ' pages. KDP allows at most 828. Use fewer puzzles or more solutions per page.');
      return;
    }
    // Independent checks before anything is written.
    for (var i = 0; i < state.puzzles.length; i++) {
      var p = state.puzzles[i];
      if (!p.verified || !engine.isValidSolution(engine.fromString441(p.solution))) {
        actionError('Puzzle ' + p.id + ' failed its check. Please click Generate again.');
        return;
      }
    }
    var cancelled = false;
    state.busy = { kind: 'export', cancel: function () { cancelled = true; } };
    updateActions();
    showProgress('Checking pages…', 0, 1);

    setTimeout(function () {
      var v = Layout.validate(book);
      if (!v.ok) {
        state.busy = null; hideProgress(); updateActions();
        actionError('Layout check failed (page ' + (v.outside[0] ? v.outside[0].page : '?') + '). Try the Comfortable margins.');
        return;
      }
      SS.Pdf.exportBook(book, {
        isCancelled: function () { return cancelled; },
        onProgress: function (done, total) { showProgress('Building PDF page ' + done + ' / ' + total, done, total); }
      }).then(function (res) {
        showProgress('Saving PDF…', 1, 1);
        setTimeout(function () {
          try {
            var blob = res.doc.output('blob');
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = res.fileName;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
          } catch (e) { actionError('Could not save the PDF: ' + e.message); }
          state.busy = null; hideProgress(); updateActions();
        }, 30);
      }, function (err) {
        state.busy = null; hideProgress(); updateActions();
        if (err && err.message !== 'cancelled') actionError('PDF export failed: ' + err.message);
      });
    }, 30);
  }

  // ------------------------------------------------------------------ preview
  function visibleIndices() {
    var book = state.book, p = state.page;
    if (state.ui.view === 'single') return [p];
    // Spread: even page numbers on the left, odd on the right. Page 1 stands alone on the right.
    var num = p + 1;
    var left = num % 2 === 0 ? p : p - 1, right = left + 1;
    return [left >= 0 ? left : null, right < book.pageCount ? right : null];
  }

  function renderPreview() {
    var book = state.book, stage = $('stage'), host = $('pages');
    $('empty').hidden = !!book;
    host.hidden = !book;
    stage.classList.toggle('fit', state.ui.zoom === 'fit');
    if (!book) {
      $('page-input').value = 0; $('page-input').disabled = true;
      $('page-total').textContent = '/ 0';
      $('prev').disabled = $('next').disabled = true;
      return;
    }
    $('page-input').disabled = false;
    $('page-input').max = book.pageCount;
    $('page-input').value = state.page + 1;
    $('page-total').textContent = '/ ' + book.pageCount;

    var idx = visibleIndices();
    $('prev').disabled = Math.min.apply(null, idx.filter(isNum)) <= 0;
    $('next').disabled = Math.max.apply(null, idx.filter(isNum)) >= book.pageCount - 1;

    var pageW = book.pageSize.w, pageH = book.pageSize.h, count = idx.length;
    var scale;
    if (state.ui.zoom === 'fit') {
      var availW = stage.clientWidth - 56, availH = stage.clientHeight - 64;
      scale = Math.max(20, Math.min(availW / (pageW * count), availH / pageH));
    } else scale = 96; // 100% = 96 CSS px per inch

    host.className = 'pages' + (count > 1 ? ' spread' : '');
    host.innerHTML = '';
    idx.forEach(function (i, k) {
      var sheet = document.createElement('div');
      sheet.style.width = Math.round(pageW * scale) + 'px';
      sheet.style.height = Math.round(pageH * scale) + 'px';
      if (i === null) { sheet.className = 'sheet blank'; host.appendChild(sheet); return; }
      var page = book.renderPage(i);
      sheet.className = 'sheet ' + (count > 1 ? (k === 0 ? 'left' : 'right') : '');
      sheet.innerHTML = SS.Preview.pageSVG(page, { showGuides: state.ui.guides });
      var label = document.createElement('div');
      label.className = 'sheet-label';
      label.textContent = 'Page ' + page.number + ' · ' + (page.side === 'right' ? 'right-hand' : 'left-hand');
      sheet.appendChild(label);
      host.appendChild(sheet);
    });
  }
  function isNum(v) { return typeof v === 'number'; }

  function goTo(index) {
    if (!state.book) return;
    state.page = Math.max(0, Math.min(state.book.pageCount - 1, index));
    renderPreview();
  }
  function step(dir) {
    if (!state.book) return;
    if (state.ui.view === 'single') { goTo(state.page + dir); return; }
    var idx = visibleIndices().filter(isNum);
    goTo(dir > 0 ? Math.max.apply(null, idx) + 1 : Math.min.apply(null, idx) - 1);
  }

  // ------------------------------------------------------------------ events
  function onFormChange() {
    readForm();
    refresh();
  }

  function init() {
    buildTrimSelect();
    var stored = loadStored() || {};
    state.settings = sanitize(stored.settings);
    if (stored.ui) {
      if (stored.ui.zoom === '100' || stored.ui.zoom === 'fit') state.ui.zoom = stored.ui.zoom;
      if (stored.ui.view === 'spread' || stored.ui.view === 'single') state.ui.view = stored.ui.view;
      state.ui.guides = !!stored.ui.guides;
    }
    writeForm(state.settings);
    setRadio('zoom', state.ui.zoom);
    setRadio('view', state.ui.view);
    $('show-margins').checked = state.ui.guides;

    form.addEventListener('change', onFormChange);
    form.addEventListener('input', function (e) {
      if (e.target.type === 'text' || e.target.type === 'number' || e.target.type === 'textarea') onFormChange();
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    $('generate').addEventListener('click', startGenerate);
    $('download').addEventListener('click', startExport);
    $('cancel').addEventListener('click', function () { if (state.busy) state.busy.cancel(); });

    $('prev').addEventListener('click', function () { step(-1); });
    $('next').addEventListener('click', function () { step(1); });
    $('page-input').addEventListener('change', function () {
      var v = parseInt($('page-input').value, 10);
      if (isFinite(v)) goTo(v - 1); else renderPreview();
    });
    document.querySelectorAll('input[name="zoom"]').forEach(function (r) {
      r.addEventListener('change', function () { state.ui.zoom = r.value; saveStored(); renderPreview(); });
    });
    document.querySelectorAll('input[name="view"]').forEach(function (r) {
      r.addEventListener('change', function () { state.ui.view = r.value; saveStored(); renderPreview(); });
    });
    $('show-margins').addEventListener('change', function () { state.ui.guides = $('show-margins').checked; saveStored(); renderPreview(); });
    $('stage').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { step(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { step(-1); e.preventDefault(); }
      else if (e.key === 'Home') { goTo(0); e.preventDefault(); }
      else if (e.key === 'End' && state.book) { goTo(state.book.pageCount - 1); e.preventDefault(); }
    });
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { if (state.ui.zoom === 'fit') renderPreview(); }, 80);
    });

    SS.Preview.installFonts();
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('400 12px ' + SS.Preview.FAMILY), document.fonts.load('700 12px ' + SS.Preview.FAMILY)])
        .then(renderPreview, function () {});
    }
    refresh();
  }

  // Test hook (used by the automated browser check; harmless otherwise).
  SS.App = { state: state, generate: startGenerate, exportPdf: startExport, refresh: refresh };

  init();
})();
