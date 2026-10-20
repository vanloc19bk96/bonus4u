/*! app.js — wiring and state. */
(function (global) {
  'use strict';

  var U = global.MMUi;
  var state = {
    step: 1,
    setupDone: false,
    cases: [],
    quarantined: [],
    puzzles: [],
    flagged: [],
    plan: null,
    page: 1,
    zoom: 'fit',
    showAnswers: false,
    promptBatch: 0,
    built: false
  };

  function settings() { return U.readSettings(); }

  function engineSettings() {
    var s = settings();
    return {
      seed: s.seed,
      difficulty: s.difficulty,
      gridSize: global.MMLayout.defaultGridSize(s),
      trimId: s.trimId
    };
  }

  function wanted() { return settings().puzzleCount; }

  function locks() {
    return { 1: false, 2: !state.setupDone, 3: !(state.setupDone && state.cases.length) };
  }

  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (err) {}
      ta.remove();
    }
    if (global.navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(fallback);
    } else fallback();
  }

  function refreshStatus() {
    var batches = global.MMPrompt.batchCount(wanted());
    if (state.promptBatch >= batches) state.promptBatch = batches - 1;
    var s = settings();
    U.setPromptMeta(state.promptBatch, batches, global.MMPrompt.buildPrompt({
      batchIndex: state.promptBatch,
      total: wanted(),
      theme: s.theme,
      difficulty: s.difficulty
    }));
    U.setLoadStatus(state.cases.length, wanted(), state.quarantined.length);
    U.setStep(state.step, locks());
    U.$('btn-to-build').disabled = !state.cases.length;
  }

  function previewScale(plan) {
    if (state.zoom === '100') return 1;
    var stage = U.$('stage');
    var avail = Math.max(240, stage.clientWidth - 48);
    var native = plan.trim.w * 96;
    return Math.min(1, avail / native);
  }

  function currentPlan() {
    var s = settings();
    return global.MMLayout.planBook({
      trimId: s.trimId,
      caseCount: state.puzzles.length || Math.max(state.cases.length, 0),
      howto: s.howto,
      answers: s.answers,
      perKeyPage: s.perKeyPage,
      difficulty: s.difficulty,
      gridOverride: s.gridOverride,
      seed: s.seed,
      puzzles: state.puzzles
    });
  }

  function render() {
    if (!state.built) {
      U.renderPlaceholder();
      return;
    }
    var s = settings();
    var plan = currentPlan();
    state.plan = plan;
    if (!plan.pages.length) return;
    if (state.page > plan.pages.length) state.page = plan.pages.length;
    if (state.page < 1) state.page = 1;
    var page = plan.pages[state.page - 1];
    var book = { puzzles: state.puzzles };
    var html = global.MMPreview.renderPage(plan, page, book, s, state.showAnswers);
    if (page.kind === 'puzzle' && !book.puzzles[page.caseIndex]) {
      html = global.MMPreview.renderPage(plan, { kind: 'blank', number: page.number, margins: page.margins, showNumber: false, folio: page.folio }, book, s, false);
    }
    U.renderPreview(html, state.page, plan.pages.length, previewScale(plan));
  }

  function importPaste() {
    var parsed = global.MMValidate.parseReply(U.$('f-paste').value);
    if (!parsed.ok) {
      U.toastStatus(parsed.error, true);
      return;
    }
    var merged = global.MMValidate.mergeBatch(parsed.data, state.cases, engineSettings().gridSize);
    state.cases = state.cases.concat(merged.accepted).sort(function (a, b) { return a.id - b.id; });
    state.quarantined = merged.quarantined;
    if (merged.accepted.length && state.promptBatch < global.MMPrompt.batchCount(wanted()) - 1) {
      state.promptBatch += 1;
    }
    refreshStatus();
    if (merged.notes.length && !merged.accepted.length) U.toastStatus(merged.notes[0], true);
    U.$('f-paste').value = '';
    render();
  }

  function buildBook() {
    if (!state.cases.length) return;
    global.MMEngine.clearCache();
    var s = settings();
    var es = engineSettings();
    var list = state.cases.filter(function (c) { return c.id <= s.puzzleCount; });
    if (!list.length) list = state.cases.slice();
    state.puzzles = [];
    state.flagged = [];
    state.built = false;
    U.showPdfButton(false);
    U.setProgress(true, 'Building case 1 of ' + list.length, 0);
    var i = 0;
    function tick() {
      var end = Math.min(i + 5, list.length);
      for (; i < end; i++) {
        U.setProgress(true, 'Building case ' + (i + 1) + ' of ' + list.length, (i + 1) / list.length);
        var result = global.MMEngine.generate(list[i], es);
        if (result.ok) state.puzzles.push(result.puzzle);
        else state.flagged.push(result);
      }
      if (i < list.length) {
        requestAnimationFrame(tick);
      } else {
        state.built = true;
        var plan = currentPlan();
        state.plan = plan;
        var msg = plan.pageCount + ' pages · gutter ' + plan.gutter + ' in · trim ' + plan.trim.label;
        if (state.flagged.length) msg += '<br>' + state.flagged.length + ' cases need a content swap.';
        U.setReadout(msg);
        U.setProgress(false);
        U.showPdfButton(true);
        state.page = plan.firstPuzzle || 1;
        render();
      }
    }
    requestAnimationFrame(tick);
  }

  function downloadPdf() {
    if (!state.built || !state.puzzles.length) return;
    var s = settings();
    var plan = currentPlan();
    U.setProgress(true, 'Writing page 1 of ' + plan.pageCount, 0);
    global.MMPdf.exportPdf(plan, { puzzles: state.puzzles }, s, {
      onProgress: function (done, total, text) {
        U.setProgress(true, text, done / total);
      }
    }).then(function (file) {
      U.setProgress(false);
      var a = document.createElement('a');
      a.href = URL.createObjectURL(file.blob);
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    }).catch(function (err) {
      U.setProgress(false);
      U.setReadout(err.message || String(err));
    });
  }

  function runSelftest() {
    var panel = U.$('selftest');
    panel.classList.add('is-on');
    panel.innerHTML = '<h2>Self-test</h2><p>Generating 200 cases across random seeds...</p>';
    var samples = global.MMSample.cases;
    var rows = [];
    var i = 0;
    var pass = 0;
    function tick() {
      var end = Math.min(i + 4, 200);
      for (; i < end; i++) {
        var data = samples[i % samples.length];
        var clone = JSON.parse(JSON.stringify(data));
        clone.id = i + 1;
        var result = global.MMEngine.generate(clone, { seed: String(1000 + i), difficulty: i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'standard' : 'hard', gridSize: i % 3 === 0 ? 9 : 11 });
        var ok = !!(result.ok && global.MMEngine.verify(result.puzzle).ok);
        if (ok) pass++;
        rows.push({ i: i + 1, ok: ok, err: result.error || '' });
      }
      panel.innerHTML = '<h2>Self-test</h2><p class="' + (i === 200 && pass === 200 ? 'pass' : '') + '">' +
        pass + ' of ' + i + ' passed</p>';
      if (i < 200) requestAnimationFrame(tick);
      else {
        var html = '<h2>Self-test</h2><p class="' + (pass === 200 ? 'pass' : 'fail') + '">' + pass + ' of 200 passed</p><table><tr><th>#</th><th>Result</th></tr>';
        rows.forEach(function (r) {
          html += '<tr><td>' + r.i + '</td><td class="' + (r.ok ? 'pass' : 'fail') + '">' + (r.ok ? 'pass' : r.err || 'fail') + '</td></tr>';
        });
        panel.innerHTML = html + '</table>';
      }
    }
    requestAnimationFrame(tick);
  }

  function boot() {
    if (global.MMFonts && MMFonts.injectCss) MMFonts.injectCss();
    if (global.MMStore.clearLegacyAutosave) global.MMStore.clearLegacyAutosave();
    U.fillTrimSelect();
    U.fillHowto(global.MMPrompt.DEFAULT_HOWTO, global.MMPrompt.DEFAULT_HOWTO_TITLES);
    U.fillCopyright(global.MMLayout.defaultCopyrightText(''));
    state.cases = [];
    state.quarantined = [];
    state.setupDone = false;
    state.step = 1;
    state.built = false;
    state.puzzles = [];
    state.page = 1;
    U.bind({
      openStep: function (n) { if (!locks()[n]) { state.step = n; U.setStep(n, locks()); } },
      settingsChanged: function () { refreshStatus(); if (state.built) { state.built = false; U.showPdfButton(false); } render(); },
      continueSetup: function () { state.setupDone = true; state.step = 2; refreshStatus(); },
      continueToBuild: function () {
        if (!state.cases.length) return;
        state.step = 3;
        refreshStatus();
      },
      prevPrompt: function () {
        if (state.promptBatch <= 0) return;
        state.promptBatch -= 1;
        refreshStatus();
      },
      nextPrompt: function () {
        var max = global.MMPrompt.batchCount(wanted()) - 1;
        if (state.promptBatch >= max) return;
        state.promptBatch += 1;
        refreshStatus();
      },
      copyPrompt: function () {
        var text = U.$('prompt-preview-body').textContent;
        if (!text) {
          text = global.MMPrompt.buildPrompt({
            batchIndex: state.promptBatch,
            total: wanted(),
            theme: settings().theme,
            difficulty: settings().difficulty
          });
        }
        copyText(text);
        U.toastStatus('Prompt ' + (state.promptBatch + 1) + ' copied. Paste it into any chat.', false);
      },
      importPaste: importPaste,
      copyRepair: function () {
        if (!state.quarantined.length) return;
        copyText(global.MMPrompt.buildRepairPrompt(state.quarantined));
        U.toastStatus('Repair prompt copied. Paste it into the same chat.', false);
      },
      buildBook: buildBook,
      downloadPdf: downloadPdf,
      saveProject: function () { global.MMStore.downloadProject({ settings: settings(), cases: state.cases, quarantined: state.quarantined }); },
      openProject: function (ev) {
        var file = ev.target.files && ev.target.files[0];
        if (!file) return;
        global.MMStore.readFile(file, function (err, data) {
          if (err) { U.toastStatus(err.message, true); return; }
          if (data.settings) U.writeSettings(data.settings);
          state.cases = data.cases || [];
          state.quarantined = data.quarantined || [];
          state.setupDone = true;
          state.step = state.cases.length ? 3 : 2;
          state.built = false;
          refreshStatus();
          render();
        });
      },
      prevPage: function () { if (!state.built) return; state.page -= 1; render(); },
      nextPage: function () { if (!state.built) return; state.page += 1; render(); },
      jumpPage: function () { if (!state.built) return; state.page = Number(U.$('f-page').value) || 1; render(); },
      setZoom: function (z) { state.zoom = z; if (state.built) render(); },
      toggleAnswers: function () { state.showAnswers = U.$('f-show-answers').checked; if (state.built) render(); },
      toggleMargins: function () {
        document.body.classList.toggle('show-margins', U.$('f-show-margins').checked);
      },
      onResize: function () { if (state.built) render(); }
    });
    refreshStatus();
    render();
    if (/selftest=1/.test(location.search)) runSelftest();
  }

  global.MMApp = { boot: boot, state: state };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
