/*
 * app.js: form state, the words dialog (prompt builder + paste box), generation (Blob Web
 * Workers with a main-thread fallback), preview navigation, live KDP summary and PDF download.
 */
(function () {
  'use strict';
  var WF = window.WF, KDP = WF.KDP, Layout = WF.Layout, engine = WF.engine, Words = WF.Words;

  var MIN_WORDS = 8;             // a list needs at least this many usable words to become a puzzle
  var DEFAULTS = {
    trim: '8.5x11', bleed: false, marginPreset: 'comfortable',
    difficulty: 'medium', gridStyle: 'open', largePrint: false, gridSize: 'auto',
    includeSolutions: true, solutionsPerPage: 4,
    pageNumbers: true, howToPlay: true, contentsPage: true,
    titlePage: false, copyrightPage: false, bookTitle: '', subtitle: '', copyrightHolder: '',
    copyrightYear: new Date().getFullYear(), copyrightNotes: '',
    titlePrefix: 'Puzzle', seed: '',
    noRepeats: true, stripAccents: true, minLen: 3
  };
  var WIZARD_DEFAULTS = { topic: '', audience: 'adults', language: 'English', count: 50, wordsPer: 40, themes: '' };

  var $ = function (id) { return document.getElementById(id); };
  var form = $('settings');

  var state = {
    settings: null,
    ui: { zoom: 'fit', view: 'single', guides: false },
    wordsText: '',
    wizard: null,
    prepared: null,         // Words.prepare() result for the current text + options
    puzzles: null,          // generated puzzles
    example: null,          // how-to example puzzle
    generatedKey: null,     // genKey() of the last generation
    genWarnings: [],
    seedUsed: null,
    book: null,
    page: 0,
    busy: null              // { kind: 'generate' | 'export', cancel: fn }
  };

  function sanitize(s, defaults) {
    var out = {}, k;
    for (k in defaults) out[k] = s && s[k] !== undefined && typeof s[k] === typeof defaults[k] ? s[k] : defaults[k];
    return out;
  }
  function sanitizeSettings(s) {
    var out = sanitize(s, DEFAULTS);
    if (!KDP.TRIMS.some(function (t) { return t.key === out.trim; })) out.trim = DEFAULTS.trim;
    if (['comfortable', 'minimum'].indexOf(out.marginPreset) < 0) out.marginPreset = DEFAULTS.marginPreset;
    if (['easy', 'medium', 'hard', 'mixed'].indexOf(out.difficulty) < 0) out.difficulty = DEFAULTS.difficulty;
    if (['open', 'blocks'].indexOf(out.gridStyle) < 0) out.gridStyle = DEFAULTS.gridStyle;
    if (['auto', '9', '11', '13', '15', '17'].indexOf(out.gridSize) < 0) out.gridSize = 'auto';
    if ([1, 2, 4, 6].indexOf(out.solutionsPerPage) < 0) out.solutionsPerPage = 4;
    if ([2, 3, 4].indexOf(out.minLen) < 0) out.minLen = 3;
    if (!(out.copyrightYear >= 1900 && out.copyrightYear <= 2100)) out.copyrightYear = DEFAULTS.copyrightYear;
    return out;
  }
  function sanitizeWizard(w) {
    var out = sanitize(w, WIZARD_DEFAULTS);
    if (!(out.count >= 1 && out.count <= 500)) out.count = WIZARD_DEFAULTS.count;
    if (!(out.wordsPer >= 15 && out.wordsPer <= 80)) out.wordsPer = WIZARD_DEFAULTS.wordsPer;
    return out;
  }

  // ------------------------------------------------------------------ form <-> settings
  function buildTrimSelect() {
    var sel = $('trim');
    [['Popular for puzzle books', true], ['Other KDP sizes', false]].forEach(function (g) {
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
    Array.prototype.forEach.call(document.querySelectorAll('input[name="' + name + '"]'), function (i) { i.checked = String(i.value) === String(value); });
  }
  function getRadio(name, fallback) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : fallback;
  }

  var TEXT_FIELDS = ['bookTitle', 'subtitle', 'copyrightHolder', 'copyrightNotes', 'titlePrefix'];
  var CHECKS = ['bleed', 'largePrint', 'includeSolutions', 'titlePage', 'copyrightPage', 'howToPlay', 'contentsPage', 'pageNumbers'];

  function writeForm(s) {
    $('trim').value = s.trim;
    $('marginPreset').value = s.marginPreset;
    $('difficulty').value = s.difficulty;
    $('gridSize').value = s.gridSize;
    setRadio('gridStyle', s.gridStyle);
    setRadio('solutionsPerPage', s.solutionsPerPage);
    CHECKS.forEach(function (k) { $(k).checked = s[k]; });
    TEXT_FIELDS.forEach(function (k) { $(k).value = s[k]; });
    $('copyrightYear').value = s.copyrightYear;
    $('seed').value = s.seed;
  }

  function fieldError(id, msg) {
    var input = $(id), err = $(id + '-error');
    if (err) err.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }

  // Characters the embedded font can't draw (line breaks are fine, they split lines).
  function unprintable(str, bold) {
    var widths = WF.FONT_METRICS[bold ? 'bold' : 'regular'].widths, bad = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (ch !== '\n' && ch !== '\r' && widths[str.charCodeAt(i)] === undefined && bad.indexOf(ch) < 0) bad += ch;
    }
    return bad;
  }

  function readText(id, bold) {
    var bad = unprintable($(id).value, bold);
    fieldError(id, bad ? 'These characters can’t be printed: ' + bad + '. Use letters, numbers and basic punctuation.' : '');
    if (!bad) state.settings[id] = $(id).value.trim();
    return !bad;
  }

  function readForm() {
    var s = state.settings, ok = true;
    s.trim = $('trim').value;
    s.marginPreset = $('marginPreset').value;
    s.difficulty = $('difficulty').value;
    s.gridSize = $('gridSize').value;
    s.gridStyle = getRadio('gridStyle', s.gridStyle);
    s.solutionsPerPage = Number(getRadio('solutionsPerPage', s.solutionsPerPage));
    CHECKS.forEach(function (k) { s[k] = $(k).checked; });
    s.seed = $('seed').value.trim();
    ok = readText('titlePrefix', false) && ok;
    ok = readText('bookTitle', true) && ok;
    ok = readText('subtitle', false) && ok;
    ok = readText('copyrightHolder', false) && ok;
    ok = readText('copyrightNotes', false) && ok;
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

  // ------------------------------------------------------------------ words
  function difficultiesUsed(s) { return s.difficulty === 'mixed' ? Layout.LEVELS : [s.difficulty]; }
  function maxGrid(s) {
    return Math.max.apply(null, difficultiesUsed(s).map(function (d) { return Layout.gridFor(s, d).n; }));
  }

  function wordOptions(s) {
    return {
      stripAccents: s.stripAccents, minLen: s.minLen, maxLen: maxGrid(s), noRepeats: s.noRepeats,
      minWords: MIN_WORDS, poolSize: Math.round(Layout.gridFor(s, 'medium').target * 1.8)
    };
  }

  function prepareWords(text, s) {
    var parsed = Words.parse(text);
    var prep = Words.prepare(parsed.puzzles, wordOptions(s));
    prep.errors = parsed.errors;
    prep.lists = parsed.puzzles.length;
    return prep;
  }

  function refreshPrepared() { state.prepared = prepareWords(state.wordsText, state.settings); }

  function nf(n) { return Number(n).toLocaleString('en-US'); }

  function updateWordsCard() {
    var p = state.prepared, card = $('words-card'), n = p ? p.puzzles.length : 0;
    card.classList.toggle('ready', n > 0);
    card.classList.toggle('problem', !n && !!state.wordsText.trim());
    if (n) {
      $('words-status').textContent = n + ' puzzle' + (n === 1 ? '' : 's') + ' · ' + nf(p.wordCount) + ' words';
      var titles = p.puzzles.filter(function (q) { return q.title; }).map(function (q) { return q.title; });
      $('words-detail').textContent = titles.length ? titles.slice(0, 4).join(', ') + (titles.length > 4 ? ', …' : '') : 'One word list, split into puzzles.';
      $('open-words').textContent = 'Edit words';
      $('open-words').classList.remove('btn-primary');
    } else {
      $('words-status').textContent = state.wordsText.trim() ? 'No usable word lists yet.' : 'No words yet.';
      $('words-detail').textContent = 'Your puzzles are built from your own word lists. Ask ChatGPT for them (free) or type your own.';
      $('open-words').textContent = 'Add words';
      $('open-words').classList.add('btn-primary');
    }
  }

  // ------------------------------------------------------------------ derived state
  function jobsFor(s, prep, seedStr) {
    var n = prep.puzzles.length;
    return prep.puzzles.map(function (p, i) {
      var d = Layout.difficultyForIndex(i, n, s.difficulty), g = Layout.gridFor(s, d);
      return {
        title: p.title, words: p.words, difficulty: d,
        maxRows: g.n, maxCols: g.n, target: g.target, starters: g.starters, maxGivens: g.maxGivens,
        minWords: Math.min(MIN_WORDS, Math.max(5, Math.round(g.target * 0.4))),
        attempts: 200, improveRounds: 80,
        seed: engine.hashString(seedStr + '|' + i + '|' + p.title + '|' + p.words.join(','))
      };
    });
  }

  // Everything that changes the puzzles themselves (not just how pages look).
  function genKey() {
    var s = state.settings, prep = state.prepared;
    var grids = difficultiesUsed(s).map(function (d) { return JSON.stringify(Layout.gridFor(s, d)); }).join(';');
    return engine.hashString(JSON.stringify(prep ? prep.puzzles : []) + '|' + s.difficulty + '|' + s.seed + '|' + grids);
  }

  function isStale() { return !!state.puzzles && state.generatedKey !== genKey(); }

  function rebuildBook() {
    state.book = state.puzzles && state.puzzles.length ? Layout.build(state.settings, state.puzzles, state.settings.howToPlay ? state.example : null) : null;
    if (state.book && state.page >= state.book.pageCount) state.page = state.book.pageCount - 1;
  }

  // Page plan for the summary before anything is generated (placeholder grids at full size).
  function previewPlan() {
    var s = state.settings, items = state.prepared ? state.prepared.puzzles : [], n = maxGrid(s);
    return Layout.plan(s, items, { rows: n, cols: n });
  }

  function refresh() {
    rebuildBook();
    var fresh = state.book && !isStale();
    var plan = fresh ? state.book.plan : previewPlan();
    updateHelp(plan);
    updateWordsCard();
    updateSummary(plan, fresh ? state.book : null);
    updateActions();
    renderPreview();
  }

  function updateHelp(plan) {
    var s = state.settings;
    function size(d) { var n = Layout.gridFor(s, d).n; return n + ' x ' + n; }
    var help = {
      easy: 'Grids up to ' + size('easy') + ', two starter words. Relaxing.',
      medium: 'Grids up to ' + size('medium') + ', one starter word.',
      hard: 'Grids up to ' + size('hard') + ' with more words, one starter word.',
      mixed: 'Gets harder as the book goes: Easy (' + size('easy') + '), Medium (' + size('medium') + '), Hard (' + size('hard') + ').'
    };
    $('difficulty-help').textContent = help[s.difficulty];
    var capped = difficultiesUsed(s).some(function (d) { return Layout.gridFor(s, d).capped; });
    var gh = $('gridSize-help');
    gh.classList.toggle('warn', capped && s.gridSize !== 'auto');
    gh.textContent = s.gridSize === 'auto'
      ? 'Now: ' + difficultiesUsed(s).map(size).join(', ') + '. Smaller trims get smaller grids.'
      : capped ? 'Too big for this trim' + (s.largePrint ? ' in large print' : '') + ': using ' + size(difficultiesUsed(s)[0]) + ' so the squares stay easy to write in.'
        : 'Same size for every difficulty.';
    $('gridStyle-help').textContent = s.gridStyle === 'open'
      ? 'Only the letter squares are printed. Clean, classic look.'
      : 'Unused squares are shaded dark, like a crossword. Uses more ink.';

    // Solutions per page: options whose letters would drop under 7 pt are disabled.
    var avail = plan.availability.solutionsPerPage;
    Array.prototype.forEach.call(form.querySelectorAll('input[name="solutionsPerPage"]'), function (input) {
      var a = avail[input.value];
      input.disabled = !a.ok;
      input.parentNode.title = a.ok ? '' : a.reason;
      input.checked = Number(input.value) === plan.solutionsPerPage;
    });
    var sh = $('solutionsPerPage-help');
    sh.classList.toggle('warn', plan.solutionsPerPage !== s.solutionsPerPage);
    sh.textContent = plan.solutionsPerPage !== s.solutionsPerPage
      ? s.solutionsPerPage + ' per page would make the letters too small (' + avail[s.solutionsPerPage].reason + '). Using ' + plan.solutionsPerPage + '.'
      : 'Starter-word letters print in bold.';
    $('solutionsPerPage-field').disabled = !s.includeSolutions;
    $('title-fields').hidden = !(s.titlePage || s.copyrightPage);
    $('subtitle-field').hidden = !s.titlePage;
    document.querySelector('.copyright-only').hidden = !s.copyrightPage;
    var ch = $('contentsPage-help');
    var titled = state.prepared && state.prepared.puzzles.some(function (p) { return p.title; });
    ch.textContent = titled || !state.prepared || !state.prepared.puzzles.length ? 'Lists every theme with its page number.' : 'Needs word lists with theme titles.';
    ch.classList.toggle('warn', !!(state.prepared && state.prepared.puzzles.length && !titled && s.contentsPage));
  }

  function inches(v) { return (Math.round(v * 1000) / 1000) + ' in'; }

  function updateSummary(plan, book) {
    var pages = plan.pageCount, m = plan.margins, n = state.prepared ? state.prepared.puzzles.length : 0;
    var count = book ? book.puzzleCount : n;
    $('sum-puzzles').textContent = count || '-';
    $('sum-pages').textContent = count ? pages : '-';
    $('sum-inside').textContent = inches(m.inside);

    var checks = [];
    if (!count) {
      checks.push({ ok: false, label: 'Words added', detail: 'Add your word lists first.', fix: 'Click "Add words" to add your word lists.' });
    } else {
      var maxP = plan.maxPages;
      var more = 0;
      while (Layout.countPages(state.settings, count + more, plan.solutionsPerPage, plan.contentsPages) < KDP.MIN_PAGES) more++;
      var pageFix = pages < KDP.MIN_PAGES
        ? 'Only ' + pages + ' pages. KDP needs at least 24: add ' + more + ' more word list' + (more === 1 ? '' : 's') + '.'
        : pages > maxP
          ? pages + ' pages. KDP allows at most ' + maxP + ' at this trim size: use fewer word lists or more solutions per page. Download is blocked until then.'
          : '';
      checks.push({ ok: !pageFix, label: '24–' + maxP + ' pages', detail: 'Page count ' + pages + ' (24 to ' + maxP + ' allowed). Gutter set for ' + m.row.min + ' to ' + m.row.max + ' pages.', fix: pageFix });
    }
    if (book) {
      var sample = [], seen = {};
      book.pages.forEach(function (pg, i) {
        seen[pg.kind] = (seen[pg.kind] || 0) + 1;
        if (seen[pg.kind] <= 2) sample.push(i);
      });
      var v = Layout.validate(book, sample), st = book.stats;
      var minFont = Math.min(v.minFont, st.minListPt, book.plan.solutionLetterPt || Infinity);
      checks.push({ ok: minFont >= KDP.MIN_FONT_PT, label: 'Text ≥ 7 pt', detail: 'Smallest text ' + minFont.toFixed(1) + ' pt.' + (book.plan.solutionLetterPt ? ' Solution letters ' + book.plan.solutionLetterPt.toFixed(1) + ' pt.' : ''), fix: 'Some text is under 7 pt. Use fewer solutions per page or a bigger trim.' });
      checks.push({ ok: v.minLine >= KDP.MIN_LINE_PT, label: 'Lines ≥ 0.75 pt', detail: 'Thinnest line ' + v.minLine + ' pt.', fix: 'A line is thinner than 0.75 pt.' });
      checks.push({ ok: !v.outside.length && !st.overflow.length, label: 'Inside margins', detail: 'Everything prints inside the live area.', fix: st.overflow.length ? 'Puzzle ' + st.overflow[0] + ' has too many words for the page. Use a bigger trim or turn off Large print.' : 'Something prints outside the margins. Try Comfortable margins.' });
      checks.push({ ok: st.minCell >= Layout.MIN_CELL - 1e-6, label: 'Room to write', detail: 'Smallest square ' + inches(st.minCell) + ' (0.25 in or more is comfortable).', fix: 'Some squares are only ' + inches(st.minCell) + ' wide: hard to write in. Pick a smaller "Largest grid" in Advanced or a bigger trim.' });
      checks.push({ ok: true, label: 'One solution each', detail: 'Every puzzle was checked by a solver: exactly one way to fill the grid.' });
    }
    checks.push({ ok: !!(WF.FONT_FILES && WF.FONT_FILES.regular), label: 'Fonts embedded', detail: 'Lato is embedded in the PDF (SIL Open Font License).', fix: 'The font file did not load (js/fonts.js).' });

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
      if (!c.ok && c.fix) {
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
    $('generate').textContent = state.busy && state.busy.kind === 'generate' ? 'Generating…' : state.puzzles ? 'Generate again' : 'Generate';
    var tooMany = !!state.book && state.book.pageCount > state.book.plan.maxPages;
    $('download').disabled = busy || !state.book || stale || tooMany;
    $('download').title = !state.book ? 'Generate the puzzles first'
      : stale ? 'Click Generate to apply the new settings first'
      : tooMany ? 'Too many pages for KDP at this trim size' : '';
    if (state.seedUsed) {
      var el = $('seed-used');
      el.hidden = false;
      el.textContent = 'Last book used seed ' + state.seedUsed + '. Type it above to rebuild the same layouts.';
    }
    var gw = $('gen-warnings');
    gw.hidden = !state.genWarnings.length || stale;
    if (state.genWarnings.length) {
      gw.textContent = state.genWarnings.length === 1 ? state.genWarnings[0] : state.genWarnings.length + ' lists were skipped (hover for details)';
      gw.title = state.genWarnings.join('\n');
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

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  // ------------------------------------------------------------------ generation
  var workerUrl = null;
  function getWorkerUrl() {
    if (workerUrl) return workerUrl;
    // file:// pages can't start workers from a path, but a Blob URL works everywhere.
    var src = FillInEngineFactory.toString() +
      '\nvar engine = FillInEngineFactory();\n' +
      'self.onmessage = function (e) {\n' +
      '  var m = e.data;\n' +
      '  try { self.postMessage({ id: m.id, ok: true, puzzle: engine.generatePuzzle(m.opts) }); }\n' +
      '  catch (err) { self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }); }\n' +
      '};\n';
    workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    return workerUrl;
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
      WF.App.generationMode = 'main-thread';
      var pending = [];
      for (var i = 0; i < jobs.length; i++) if (!results[i]) pending.push(i);
      var k = 0;
      (function tick() {
        if (cancelled) return;
        var start = Date.now();
        try {
          while (k < pending.length && Date.now() - start < 40) {
            var id = pending[k++];
            finishOne(id, engine.generatePuzzle(jobs[id]));
          }
        } catch (e) { fail(e); return; }
        if (k < pending.length) fallbackTimer = setTimeout(tick, 0);
      })();
    }

    if (!jobs.length) { settle.resolve([]); return { promise: promise, cancel: function () {} }; }
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
      WF.App.generationMode = 'workers x' + size;
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

  function randomSeed() { return String(WF.random.uint32() % 1000000000); }

  // A tiny solved example for the How to Play page, from words no puzzle uses.
  function makeExample(jobs, puzzles, seedStr) {
    var used = {}, spare = [];
    puzzles.forEach(function (p) { p.words.forEach(function (w) { used[w.w] = true; }); });
    jobs.forEach(function (j) { j.words.forEach(function (w) { if (!used[w] && w.length <= 8 && w.length >= 3) { used[w] = true; spare.push(w); } }); });
    if (spare.length < 6) return null;
    var ex = engine.generatePuzzle({
      title: '', words: spare.slice(0, 60), maxRows: 7, maxCols: 9, target: 7, minWords: 4, starters: 1, maxGivens: 3,
      attempts: 120, improveRounds: 40, seed: engine.hashString(seedStr + '|example')
    });
    return ex.error ? null : ex;
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
    if (!state.prepared || !state.prepared.puzzles.length) {
      actionError('Add your word lists first.');
      openWords();
      return;
    }
    var s = JSON.parse(JSON.stringify(state.settings));
    var seedStr = s.seed || randomSeed();
    var key = genKey();
    var jobs = jobsFor(s, state.prepared, seedStr);
    var run = runJobs(jobs, function (done, total) { showProgress('Building puzzle ' + done + ' / ' + total, done, total); });
    state.busy = { kind: 'generate', cancel: run.cancel };
    showProgress('Building puzzle 0 / ' + jobs.length, 0, jobs.length);
    updateActions();

    run.promise.then(function (results) {
      var puzzles = [], warnings = [], seen = {};
      results.forEach(function (p, i) {
        var name = jobs[i].title ? '"' + jobs[i].title + '"' : 'List ' + (i + 1);
        if (p.error) {
          warnings.push(name + ': only ' + p.placed + ' of ' + p.available + ' words fit in a grid. Add more words (short ones help) and generate again.');
          return;
        }
        if (seen[p.grid]) { warnings.push(name + ': same grid as another puzzle, skipped.'); return; }
        seen[p.grid] = true;
        p.difficulty = jobs[i].difficulty;
        p.id = puzzles.length + 1;
        puzzles.push(p);
      });
      state.puzzles = puzzles;
      state.example = makeExample(jobs, puzzles, seedStr);
      state.genWarnings = warnings;
      state.generatedKey = key;
      state.seedUsed = seedStr;
      state.page = 0;
      state.busy = null;
      hideProgress();
      refresh();
      if (!puzzles.length) actionError('No puzzle could be built. Add more words to each list.');
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
    if (book.pageCount > book.plan.maxPages) {
      actionError('This book has ' + book.pageCount + ' pages. KDP allows at most ' + book.plan.maxPages + ' at this trim size.');
      return;
    }
    var cancelled = false;
    state.busy = { kind: 'export', cancel: function () { cancelled = true; } };
    updateActions();

    // Independent re-check of every puzzle (fresh solver run), in small async slices.
    var i = 0, list = state.puzzles;
    (function verifyStep() {
      if (cancelled) { state.busy = null; hideProgress(); updateActions(); return; }
      var start = Date.now();
      for (; i < list.length && Date.now() - start < 30; i++) {
        if (!engine.verifyPuzzle(list[i])) {
          state.busy = null; hideProgress(); updateActions();
          actionError('Puzzle ' + list[i].id + ' failed its final check. Please click Generate again.');
          return;
        }
      }
      showProgress('Checking puzzles ' + i + ' / ' + list.length, i, list.length);
      if (i < list.length) { setTimeout(verifyStep, 0); return; }
      setTimeout(buildPdf, 20);
    })();

    function buildPdf() {
      showProgress('Checking pages…', 0, 1);
      var v = Layout.validate(book);
      if (!v.ok) {
        state.busy = null; hideProgress(); updateActions();
        actionError('Layout check failed (page ' + (v.outside[0] ? v.outside[0].page : '?') + '). Try Comfortable margins or a bigger trim.');
        return;
      }
      WF.Pdf.exportBook(book, {
        isCancelled: function () { return cancelled; },
        onProgress: function (done, total) { showProgress('Building PDF page ' + done + ' / ' + total, done, total); }
      }).then(function (res) {
        showProgress('Saving PDF…', 1, 1);
        setTimeout(function () {
          try {
            downloadBlob(res.doc.output('blob'), res.fileName);
          } catch (e) { actionError('Could not save the PDF: ' + e.message); }
          state.busy = null; hideProgress(); updateActions();
        }, 30);
      }, function (err) {
        state.busy = null; hideProgress(); updateActions();
        if (err && err.message !== 'cancelled') actionError('PDF export failed: ' + err.message);
      });
    }
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
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
    stage.classList.toggle('fit', state.ui.zoom === 'fit' && !!book);
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
      sheet.innerHTML = WF.Preview.pageSVG(page, { showGuides: state.ui.guides });
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

  // ------------------------------------------------------------------ words dialog
  var dlg = $('words-dialog');
  var draft = null;          // dialog-local copy of the word options until "Use these words"
  var copied = {};           // prompt index -> copied (for the check marks)
  var statusTimer = null;

  function openWords() {
    draft = { noRepeats: state.settings.noRepeats, stripAccents: state.settings.stripAccents, minLen: state.settings.minLen };
    var w = state.wizard;
    $('wz-topic').value = w.topic;
    $('wz-audience').value = w.audience;
    $('wz-language').value = w.language;
    $('wz-count').value = w.count;
    $('wz-wordsPer').value = w.wordsPer;
    $('wz-themes').value = w.themes;
    $('words-input').value = state.wordsText;
    $('noRepeats').checked = draft.noRepeats;
    $('stripAccents').checked = draft.stripAccents;
    $('minLen').value = String(draft.minLen);
    renderPrompts();
    renderWordsStatus();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(function () { (state.wordsText ? $('paste-input') : $('wz-topic')).focus(); }, 30);
  }
  function closeWords() {
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }

  function readWizard() {
    var w = state.wizard;
    w.topic = $('wz-topic').value;
    w.audience = $('wz-audience').value;
    w.language = $('wz-language').value;
    var c = Math.round(Number($('wz-count').value));
    if (c >= 1 && c <= 500) w.count = c;
    var wp = Math.round(Number($('wz-wordsPer').value));
    if (wp >= 15 && wp <= 80) w.wordsPer = wp;
    w.themes = $('wz-themes').value;
  }

  function draftSettings() {
    var s = JSON.parse(JSON.stringify(state.settings));
    s.noRepeats = draft.noRepeats; s.stripAccents = draft.stripAccents; s.minLen = draft.minLen;
    return s;
  }

  function currentPrompts() {
    var w = state.wizard, s = state.settings;
    var themes = Words.parseThemes(w.themes);
    return Words.buildPrompts({
      themes: themes, count: w.count, wordsPer: w.wordsPer, minLen: Math.max(3, s.minLen), maxLen: Math.min(12, maxGrid(s)),
      audience: w.audience, language: w.language, topic: w.topic, difficulty: s.difficulty === 'mixed' ? 'medium' : s.difficulty
    });
  }

  var promptCache = [];
  function renderPrompts() {
    var w = state.wizard, s = state.settings;
    var themes = Words.parseThemes(w.themes);
    $('wz-themes-count').textContent = '(' + themes.length + ' of ' + w.count + ')';
    var fit = Math.round(difficultiesUsed(s).map(function (d) { return Layout.gridFor(s, d).target; }).reduce(function (a, b) { return a + b; }, 0) / difficultiesUsed(s).length);
    $('wz-wordsPer-help').textContent = 'Up to about ' + fit + ' words fit in each grid. Asking for more gives the app more choice, so the grids come out fuller.';
    promptCache = currentPrompts();
    copied = {};
    var ol = $('prompt-list');
    ol.innerHTML = '';
    if (promptCache.length > 1 && themes.length < w.count) {
      var warn = document.createElement('li');
      warn.className = 'prompt-warn';
      warn.textContent = 'Only ' + themes.length + ' of ' + w.count + ' themes listed. Paste every prompt in the same chat so the AI can see the themes it already made up, or click "Fill with random ideas" first.';
      ol.appendChild(warn);
    }
    promptCache.forEach(function (p, i) {
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.className = 'plabel';
      span.textContent = p.label;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-small';
      btn.textContent = 'Copy';
      btn.addEventListener('click', function () {
        copyText(p.text).then(function (ok) {
          if (!ok) { showPrompt(i); toast('Copy blocked by the browser: select the prompt text below and copy it.'); return; }
          copied[i] = true;
          li.classList.add('copied');
          btn.textContent = 'Copied';
          showPrompt(i);
          toast('Prompt ' + (i + 1) + ' copied. Paste it in ' + (i ? 'the same chat' : 'ChatGPT, Claude, Gemini or Grok') + ', then Add the answer.');
        });
      });
      p.li = li;
      p.btn = btn;
      li.appendChild(span);
      li.appendChild(btn);
      ol.appendChild(li);
    });
    showPrompt(0);
    updateProgress();
  }

  // How far the added answers go: marks the prompts already answered and points at the next one.
  function listsAdded() { return Words.parse($('words-input').value).puzzles.length; }
  function nextPrompt(have) {
    for (var i = 0; i < promptCache.length; i++) if (promptCache[i].to > have) return i;
    return -1;
  }
  function updateProgress() {
    if (!promptCache.length) return;
    var have = listsAdded(), total = state.wizard.count, next = nextPrompt(have);
    promptCache.forEach(function (p, i) {
      p.li.classList.toggle('done', p.to <= have);
      p.btn.classList.toggle('btn-primary', i === next);
    });
    var out = $('add-progress');
    if (!have) out.textContent = promptCache.length > 1 ? promptCache.length + ' prompts to go. Start with prompt 1.' : '';
    else if (next < 0) out.textContent = '✓ ' + have + ' of ' + total + ' lists added. All done.';
    else out.textContent = have + ' of ' + total + ' lists added · next: prompt ' + (next + 1);
  }

  // Moves the pasted answer into the word lists. Returns false when it held no lists.
  function addPasted() {
    var box = $('paste-input'), text = box.value.replace(/```[a-zA-Z]*/g, '').trim();
    if (!text) { toast('Paste the AI’s answer in the box first.'); box.focus(); return false; }
    var n = Words.parse(text).puzzles.length;
    if (!n) { toast('No word lists found in that answer. Paste the whole answer, including the titles.'); box.focus(); return false; }
    var list = $('words-input'), cur = list.value.replace(/\s+$/, '');
    list.value = cur ? cur + '\n\n' + text : text;
    list.scrollTop = list.scrollHeight;
    box.value = '';
    renderWordsStatus();
    var next = nextPrompt(listsAdded());
    toast('Added ' + n + ' list' + (n === 1 ? '' : 's') + '.' + (next >= 0 ? ' Now copy prompt ' + (next + 1) + '.' : ' All prompts done: click "Use these words".'));
    box.focus();
    return true;
  }
  function showPrompt(i) {
    var p = promptCache[i];
    $('prompt-preview').textContent = p ? p.text : '';
    document.querySelector('.prompt-preview summary').textContent = p ? 'See prompt ' + (i + 1) : 'See prompt';
    if (i > 0) document.querySelector('.prompt-preview').open = true;
  }

  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      (dlg.open ? dlg : document.body).appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function renderWordsStatus() {
    var text = $('words-input').value, box = $('wd-status');
    updateProgress();
    if (!text.trim()) { box.innerHTML = ''; return; }
    var prep = prepareWords(text, draftSettings()), html = [], r = prep.report;
    var n = prep.puzzles.length;
    if (n) {
      html.push('<div class="ok-line">✓ ' + n + ' puzzle' + (n === 1 ? '' : 's') + ' · ' + nf(prep.wordCount) + ' words ready</div>');
      var titles = prep.puzzles.filter(function (p) { return p.title; }).map(function (p) { return p.title; });
      if (titles.length) html.push('<div class="themes">' + esc(titles.slice(0, 10).join(' · ')) + (titles.length > 10 ? ' · …' : '') + '</div>');
      else html.push('<div class="themes">No theme titles found: the words are split into ' + n + ' untitled puzzles.</div>');
    } else {
      html.push('<div class="bad-line">No usable word lists found yet.</div>');
    }
    prep.errors.forEach(function (e) { html.push('<div class="warn-line">' + esc(e) + '</div>'); });
    if (r.dropped.length) {
      html.push('<div class="warn-line">' + r.dropped.length + ' list' + (r.dropped.length === 1 ? ' has' : 's have') + ' fewer than ' + MIN_WORDS + ' usable words and will be skipped: ' +
        esc(r.dropped.slice(0, 6).map(function (d) { return d.title + ' (' + d.count + ')'; }).join(', ')) + (r.dropped.length > 6 ? ', …' : '') + '</div>');
    }
    if (r.duplicateTitles.length) html.push('<div class="warn-line">Theme used twice: ' + esc(r.duplicateTitles.slice(0, 6).join(', ')) + '</div>');
    if (r.repeats) html.push('<div class="warn-line">' + r.repeats + ' repeated word' + (r.repeats === 1 ? '' : 's') + ' removed so no word appears in two puzzles.</div>');
    if (r.skipped.length) {
      html.push('<details><summary>' + r.skipped.length + (r.skipped.length >= 400 ? '+' : '') + ' word' + (r.skipped.length === 1 ? '' : 's') + ' skipped (see why)</summary><ul>' +
        r.skipped.slice(0, 200).map(function (x) { return '<li>' + esc(x.raw) + ': ' + esc(x.reason) + '</li>'; }).join('') + '</ul></details>');
    }
    box.innerHTML = html.join('');
  }
  function scheduleStatus() { clearTimeout(statusTimer); statusTimer = setTimeout(renderWordsStatus, 250); }

  function applyWords() {
    // An answer left in the paste box is added rather than lost.
    if ($('paste-input').value.trim() && !addPasted()) return;
    var text = $('words-input').value;
    var prep = prepareWords(text, draftSettings());
    if (text.trim() && !prep.puzzles.length) {
      renderWordsStatus();
      $('words-input').focus();
      return;
    }
    state.settings.noRepeats = draft.noRepeats;
    state.settings.stripAccents = draft.stripAccents;
    state.settings.minLen = draft.minLen;
    state.wordsText = text;
    refreshPrepared();
    closeWords();
    actionError('');
    refresh();
    if (state.prepared.puzzles.length) toast(state.prepared.puzzles.length + ' puzzles ready. Click Generate.');
  }

  // After an edit: rebuild the prompts once typing pauses, and show that they changed
  // (a small "Updated" badge and a short highlight), since any earlier copy is now stale.
  var promptTimer = null, badgeTimer = null;
  function onWizardEdit(now) {
    readWizard();
    clearTimeout(promptTimer);
    promptTimer = setTimeout(function () {
      var before = promptCache.map(function (p) { return p.text.replace(/Variation code \w+/, ''); }).join('|');
      renderPrompts();
      var after = promptCache.map(function (p) { return p.text.replace(/Variation code \w+/, ''); }).join('|');
      if (before === after) return;
      var ol = $('prompt-list'), badge = $('prompts-updated');
      ol.classList.remove('flash');
      void ol.offsetWidth; // restart the highlight animation
      ol.classList.add('flash');
      badge.hidden = false;
      clearTimeout(badgeTimer);
      badgeTimer = setTimeout(function () { badge.hidden = true; ol.classList.remove('flash'); }, 2000);
    }, now ? 0 : 300);
  }

  function bindWordsDialog() {
    ['wz-topic', 'wz-audience', 'wz-language', 'wz-count', 'wz-wordsPer', 'wz-themes'].forEach(function (id) {
      $(id).addEventListener('input', function () { onWizardEdit(false); });
      $(id).addEventListener('change', function () { onWizardEdit(true); });
    });
    $('wz-ideas').addEventListener('click', function () {
      readWizard();
      var have = Words.parseThemes(state.wizard.themes);
      var need = Math.max(0, state.wizard.count - have.length);
      if (!need) { toast('You already have ' + have.length + ' themes.'); return; }
      var ideas = Words.suggestThemes(need, have);
      $('wz-themes').value = have.concat(ideas).join('\n');
      onWizardEdit(true);
      if (ideas.length < need) toast('Added ' + ideas.length + ' ideas. Type or ask ChatGPT for the rest.');
    });
    $('wz-theme-prompt').addEventListener('click', function () {
      readWizard();
      var w = state.wizard;
      copyText(Words.themePrompt({ count: w.count, topic: w.topic, audience: w.audience, language: w.language, wordsPer: w.wordsPer })).then(function (ok) {
        toast(ok ? 'Theme prompt copied. Paste ChatGPT’s list into the Themes box.' : 'Copy blocked by the browser.');
      });
    });
    $('words-input').addEventListener('input', scheduleStatus);
    $('wd-add').addEventListener('click', addPasted);
    $('paste-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addPasted(); }
    });
    ['noRepeats', 'stripAccents'].forEach(function (id) {
      $(id).addEventListener('change', function () { draft[id] = $(id).checked; renderWordsStatus(); });
    });
    $('minLen').addEventListener('change', function () { draft.minLen = Number($('minLen').value); renderWordsStatus(); });
    $('wd-clear').addEventListener('click', function () {
      if ($('words-input').value.trim() && !window.confirm('Remove all the words in the box?')) return;
      $('words-input').value = '';
      renderWordsStatus();
    });
    $('wd-load').addEventListener('click', function () { $('wd-file').click(); });
    $('wd-file').addEventListener('change', function () {
      var f = $('wd-file').files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var cur = $('words-input').value.trim();
        $('words-input').value = cur ? cur + '\n\n' + reader.result : String(reader.result);
        $('wd-file').value = '';
        renderWordsStatus();
      };
      reader.readAsText(f);
    });
    $('wd-save').addEventListener('click', function () {
      var text = $('words-input').value;
      if (!text.trim()) { toast('The box is empty.'); return; }
      downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'word-lists.txt');
    });
    $('wd-apply').addEventListener('click', applyWords);
    $('wd-cancel').addEventListener('click', closeWords);
    $('wd-close').addEventListener('click', closeWords);
    $('wd-form').addEventListener('submit', function (e) { e.preventDefault(); });
  }

  // ------------------------------------------------------------------ events
  function onFormChange() {
    readForm();
    refreshPrepared();   // grid size (difficulty, trim, large print) limits the word length
    refresh();
  }

  function init() {
    buildTrimSelect();
    // Nothing is kept between visits: a reload starts from the defaults.
    state.settings = sanitizeSettings(null);
    state.wizard = sanitizeWizard(null);
    refreshPrepared();

    writeForm(state.settings);
    setRadio('zoom', state.ui.zoom);
    setRadio('view', state.ui.view);
    $('show-margins').checked = state.ui.guides;

    form.addEventListener('change', onFormChange);
    form.addEventListener('input', function (e) {
      if (e.target.type === 'text' || e.target.type === 'number' || e.target.tagName === 'TEXTAREA') onFormChange();
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    $('open-words').addEventListener('click', openWords);
    $('empty-add-words').addEventListener('click', openWords);
    bindWordsDialog();

    $('generate').addEventListener('click', startGenerate);
    $('download').addEventListener('click', startExport);
    $('cancel').addEventListener('click', function () { if (state.busy) state.busy.cancel(); });

    $('prev').addEventListener('click', function () { step(-1); });
    $('next').addEventListener('click', function () { step(1); });
    $('page-input').addEventListener('change', function () {
      var v = parseInt($('page-input').value, 10);
      if (isFinite(v)) goTo(v - 1); else renderPreview();
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="zoom"]'), function (r) {
      r.addEventListener('change', function () { state.ui.zoom = r.value; renderPreview(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="view"]'), function (r) {
      r.addEventListener('change', function () { state.ui.view = r.value; renderPreview(); });
    });
    $('show-margins').addEventListener('change', function () { state.ui.guides = $('show-margins').checked; renderPreview(); });
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

    WF.Preview.installFonts();
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('400 12px ' + WF.Preview.FAMILY), document.fonts.load('700 12px ' + WF.Preview.FAMILY)])
        .then(renderPreview, function () {});
    }
    refresh();
  }

  // Test hook (used by the automated browser check; harmless otherwise).
  WF.App = { state: state, generate: startGenerate, exportPdf: startExport, refresh: refresh, openWords: openWords, applyWords: applyWords };

  init();
})();
