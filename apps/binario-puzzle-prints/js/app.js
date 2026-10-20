/*!
 * app.js — form wiring, live preview, progress, and the two downloads.
 *
 * State lives in this closure only. Web storage is unreliable on the file://
 * origin (spec 2), so "remember the last settings" means for this session, in
 * memory — which is what the page already does by never reloading.
 *
 * Exposes window.App. Classic script, no modules (spec 2).
 */
(function (global) {
  'use strict';

  var C = global.BinarioCore;
  var K = global.KdpLayout;
  var P = global.PdfExport;
  var V = global.Preview;

  var $ = function (id) { return document.getElementById(id); };

  var el = {};
  var state = {
    plan: null,
    puzzles: null,          // generated puzzles, or null before Generate
    puzzleKey: null,        // the settings the current puzzles were built for
    previewKind: 'puzzles',
    previewPage: 1,         // 1-based page number currently shown
    generating: false
  };
  var previewTimer = null;

  /* --------------------------------------------------------------- form -- */

  function fillTrimOptions() {
    var html = '';
    for (var i = 0; i < K.TRIMS.length; i++) {
      var t = K.TRIMS[i];
      html += '<option value="' + t.id + '"' + (t.id === K.DEFAULT_TRIM ? ' selected' : '') + '>' +
        K.trimLabel(t) + '</option>';
    }
    el.trim.innerHTML = html;
  }

  function readForm() {
    var perPage = 2;
    var radios = document.getElementsByName('perpage');
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) perPage = parseInt(radios[i].value, 10);

    var count = parseInt(el.count.value, 10);
    if (!isFinite(count)) count = 100;
    count = Math.max(10, Math.min(500, count));

    return {
      title: el.title.value.trim() || 'Binario Puzzles',
      subtitle: el.subtitle.value.trim(),
      trimId: el.trim.value,
      n: parseInt(el.size.value, 10),
      difficulty: el.diff.value,
      count: count,
      perPage: perPage,
      howTo: el.howto.checked
    };
  }

  /** The settings that decide whether existing puzzles can be reused. */
  function puzzleKeyOf(o) { return o.n + '|' + o.difficulty + '|' + o.count; }

  /* ------------------------------------------------------------ messages -- */

  function showProblems(plan, opts, autoNote) {
    var html = '';
    var i;
    for (i = 0; i < plan.errors.length; i++) {
      html += '<div class="problem">' + escapeHtml(plan.errors[i]) + '</div>';
    }
    for (i = 0; i < plan.warnings.length; i++) {
      html += '<div class="problem is-warn">' + escapeHtml(plan.warnings[i]) + '</div>';
    }
    if (autoNote) {
      html += '<div class="problem is-warn">' + escapeHtml(autoNote) + '</div>';
    }
    var slow = estimateSeconds(opts);
    if (plan.ok && slow > 45) {
      html += '<div class="problem is-warn">⏳ A ' + opts.n + '×' + opts.n +
        ' hard grid needs a lot of computation — expect about ' + formatDuration(slow) +
        ' to generate ' + opts.count + ' puzzles. You can still click “Generate puzzles”; just wait for the progress bar.</div>';
    }
    el.problems.innerHTML = html;
  }

  /**
   * Keep layout printable: shrink grid and/or puzzles-per-page when the
   * current trim cannot clear MIN_CELL, and disable options that would fail.
   * Returns a short note when anything was auto-adjusted (or null).
   */
  function syncPrintFit(o) {
    var notes = [];
    var i, opt, n, ok;

    // --- grid size --------------------------------------------------------
    for (i = 0; i < el.size.options.length; i++) {
      opt = el.size.options[i];
      n = parseInt(opt.value, 10);
      ok = K.gridFitsTrim(o, n);
      opt.disabled = !ok;
    }
    var clampedN = K.clampGridSize(o);
    if (clampedN !== o.n) {
      el.size.value = String(clampedN);
      for (i = 0; i < el.size.options.length; i++) {
        if (parseInt(el.size.options[i].value, 10) === clampedN) {
          el.size.options[i].disabled = false;
          break;
        }
      }
      notes.push('grid ' + clampedN + '×' + clampedN);
      o.n = clampedN;
    }

    // --- puzzles per page -------------------------------------------------
    var fit = K.fittingPerPages(o);
    var radios = document.getElementsByName('perpage');
    var r, val, label;
    for (i = 0; i < radios.length; i++) {
      r = radios[i];
      val = parseInt(r.value, 10);
      r.disabled = !fit[val];
      label = r.closest ? r.closest('.radio') : r.parentNode;
      if (label && label.classList) {
        if (fit[val]) label.classList.remove('is-disabled');
        else label.classList.add('is-disabled');
      }
    }

    var clampedPP = K.clampPerPage(o);
    if (clampedPP !== o.perPage) {
      for (i = 0; i < radios.length; i++) {
        if (parseInt(radios[i].value, 10) === clampedPP) {
          radios[i].checked = true;
          radios[i].disabled = false;
          label = radios[i].closest ? radios[i].closest('.radio') : radios[i].parentNode;
          if (label && label.classList) label.classList.remove('is-disabled');
          break;
        }
      }
      notes.push(clampedPP + '/page');
    }

    if (!notes.length) return null;
    return 'Adjusted to ' + notes.join(' · ') +
      ' so cells stay at least ' + K.MIN_CELL.toFixed(2) + '" (print-clear minimum).';
  }

  /**
   * Rough cost per puzzle in milliseconds, measured on a mid-range laptop.
   * Only used to warn before a long run — never to block anything.
   */
  var COST_MS = {
    6:  { easy: 1,   medium: 1,   hard: 7 },
    8:  { easy: 1,   medium: 1,   hard: 14 },
    10: { easy: 10,  medium: 11,  hard: 53 },
    12: { easy: 15,  medium: 17,  hard: 148 },
    14: { easy: 125, medium: 142, hard: 503 }
  };
  function estimateSeconds(o) {
    var row = COST_MS[o.n] || COST_MS[10];
    var per;
    if (o.difficulty === 'mixed') per = row.easy * 0.4 + row.medium * 0.4 + row.hard * 0.2;
    else per = row[o.difficulty];
    return per * o.count / 1000;
  }
  function formatDuration(sec) {
    if (sec < 60) return Math.max(1, Math.round(sec)) + ' sec';
    return Math.round(sec / 60) + ' min';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ------------------------------------------------------------- refresh -- */

  function refresh() {
    var o = readForm();
    var autoNote = syncPrintFit(o);
    if (autoNote) o = readForm();   // re-read after radios / grid were clamped

    var plan = K.planBook(o);
    state.plan = plan;
    state.opts = o;

    var trim = plan.trim;
    el.trimHint.textContent = trim.mm + ' mm · max ' + trim.max + ' pages · ' +
      (trim.cls === 'Large' ? 'Large trim' : 'Regular trim');

    el.summary.textContent = K.summaryLine(plan);
    el.summary.className = 'summary' + (plan.ok ? '' : ' is-bad');
    showProblems(plan, o, autoNote);

    // Puzzles are only valid for the grid size / difficulty / count they were
    // built with; the trim and layout can change freely without regenerating.
    var key = puzzleKeyOf(o);
    if (state.puzzles && state.puzzleKey !== key) {
      state.puzzles = null;
      el.genNote.textContent = 'Puzzle settings changed — click “Generate puzzles” again.';
      el.genNote.className = 'gen-note is-warn';
    }

    var ready = !!state.puzzles && plan.ok && !state.generating;
    el.download.disabled = !ready;
    el.sample.disabled = !ready;
    el.generate.disabled = state.generating;

    renderPreview();
  }

  function renderPreview() {
    var plan = state.plan;
    if (!plan || !plan.pages.length) {
      el.previewBox.innerHTML = '';
      el.previewNote.textContent = '';
      syncNav();
      return;
    }

    // Keep the page index valid when the plan shrinks/grows with form changes.
    if (state.previewPage < 1) state.previewPage = 1;
    if (state.previewPage > plan.pageCount) state.previewPage = plan.pageCount;

    var page = plan.pages[state.previewPage - 1];
    if (page.kind === 'divider') state.previewKind = 'solutions';
    else if (page.kind !== 'blank') state.previewKind = page.kind;
    syncTabs();
    syncNav();

    try {
      el.previewBox.innerHTML = V.renderPageSvg(plan, state.puzzles, page, {
        title: (state.opts && state.opts.title) || '',
        subtitle: (state.opts && state.opts.subtitle) || ''
      });
    } catch (err) {
      el.previewBox.innerHTML = '<p class="preview-empty">Preview could not be rendered.</p>';
      el.previewNote.textContent = err && err.message ? err.message : String(err);
      return;
    }

    var kindLabel = ({
      title: 'title', howto: 'how to play', puzzles: 'puzzles',
      solutions: 'solutions', divider: 'solutions divider', blank: 'blank'
    })[page.kind] || page.kind;
    var note = kindLabel;
    if (!state.puzzles && (page.kind === 'puzzles' || page.kind === 'solutions')) {
      note += ' · sample puzzles';
    }
    el.previewNote.textContent = note;
  }

  function syncNav() {
    var total = state.plan ? state.plan.pageCount : 1;
    var page = state.previewPage;
    el.previewPageInput.value = String(page);
    el.previewPageInput.max = String(total);
    el.previewOf.textContent = '/ ' + total;
    el.prev.disabled = page <= 1;
    el.next.disabled = page >= total;
  }

  function syncTabs() {
    var kind = state.previewKind;
    var all = el.tabs.getElementsByClassName('tab');
    for (var t = 0; t < all.length; t++) {
      var on = all[t].getAttribute('data-kind') === kind;
      all[t].className = 'tab' + (on ? ' is-on' : '');
    }
  }

  function goToPage(n) {
    if (!state.plan) return;
    var total = state.plan.pageCount;
    n = Math.max(1, Math.min(total, n | 0));
    if (n === state.previewPage) { syncNav(); return; }
    state.previewPage = n;
    renderPreview();
  }

  function jumpToKind(kind) {
    if (!state.plan) return;
    var page = V.firstPageOfKind(state.plan, kind);
    if (!page) return;
    state.previewKind = kind;
    state.previewPage = page.number;
    renderPreview();
  }

  function scheduleRefresh() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(refresh, 200);      // spec 6.3 — debounce 200 ms
  }

  /* ---------------------------------------------------------- generating -- */

  function onGenerate(ev) {
    if (ev) ev.preventDefault();
    if (state.generating) return;

    if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
    var o = readForm();
    var autoNote = syncPrintFit(o);
    if (autoNote) o = readForm();
    state.opts = o;
    state.plan = K.planBook(o);

    // Keep any previous puzzles until the new batch succeeds, so a failed
    // generate still leaves the preview (and downloads) usable.
    state.generating = true;
    el.generate.disabled = true;
    el.download.disabled = true;
    el.sample.disabled = true;
    el.progressWrap.hidden = false;
    el.genNote.textContent = '';
    el.genNote.className = 'gen-note';
    setProgress(0, 0, o.count);

    var started = Date.now();

    C.generateBook(o, function (frac, done, total) {
      setProgress(frac, done, total);
    }).then(function (puzzles) {
      state.puzzles = puzzles;
      state.puzzleKey = puzzleKeyOf(o);
      state.generating = false;
      el.progressWrap.hidden = true;

      var secs = ((Date.now() - started) / 1000).toFixed(1);
      var fellBack = puzzles.filter(function (p) { return p.fellBack; }).length;
      var noteClass = fellBack ? 'gen-note is-warn' : 'gen-note';
      var noteText;
      if (fellBack) {
        noteText = 'Generated ' + puzzles.length + ' puzzles in ' + secs + ' sec. ' +
          fellBack + ' puzzle(s) could not hit the exact requested difficulty (a ' + o.n + '×' + o.n +
          ' grid is too small to always need that much deduction), so the nearest tier was used — the difficulty printed on each puzzle is still accurate.';
      } else {
        noteText = 'Generated ' + puzzles.length + ' puzzles in ' + secs +
          ' sec — each has exactly one solution and can be solved by logic alone.';
      }
      refresh();
      el.genNote.className = noteClass;
      el.genNote.textContent = noteText;
    }).catch(function (err) {
      state.generating = false;
      el.progressWrap.hidden = true;
      refresh();
      el.genNote.className = 'gen-note is-warn';
      el.genNote.textContent = 'Could not generate puzzles: ' + (err && err.message ? err.message : err);
    });
  }

  function setProgress(frac, done, total) {
    el.progressBar.style.width = Math.round(frac * 100) + '%';
    el.progressText.textContent = 'Generating puzzle ' + done + '/' + total + '…';
  }

  /* ----------------------------------------------------------- downloads -- */

  function meta() {
    return { title: state.opts.title, subtitle: state.opts.subtitle };
  }

  function withBusy(button, label, fn) {
    var old = button.textContent;
    button.textContent = label;
    button.disabled = true;
    // Let the browser paint the busy label before the export blocks the thread.
    setTimeout(function () {
      try {
        fn();
      } catch (err) {
        el.genNote.className = 'gen-note is-warn';
        el.genNote.textContent = 'PDF export error: ' + (err && err.message ? err.message : err);
      }
      button.textContent = old;
      button.disabled = false;
    }, 30);
  }

  function onDownload() {
    if (!state.puzzles || !state.plan.ok) return;
    withBusy(el.download, 'Building PDF…', function () {
      P.save(state.plan, state.puzzles, meta());
    });
  }

  function onSample() {
    if (!state.puzzles || !state.plan.ok) return;
    withBusy(el.sample, 'Building PDF…', function () {
      P.saveSample(state.plan, state.puzzles, meta());
    });
  }

  /* ------------------------------------------------------------- startup -- */

  function init() {
    el = {
      form: $('book-form'),
      title: $('f-title'), subtitle: $('f-subtitle'), trim: $('f-trim'),
      size: $('f-size'), diff: $('f-diff'), count: $('f-count'), howto: $('f-howto'),
      trimHint: $('trim-hint'), summary: $('summary'), problems: $('problems'),
      generate: $('btn-generate'), download: $('btn-download'), sample: $('btn-sample'),
      progressWrap: $('progress-wrap'), progressBar: $('progress-bar'), progressText: $('progress-text'),
      genNote: $('gen-note'),
      previewBox: $('preview-box'), previewNote: $('preview-note'), tabs: $('preview-tabs'),
      prev: $('btn-prev'), next: $('btn-next'),
      previewPageInput: $('f-preview-page'), previewOf: $('preview-of')
    };

    fillTrimOptions();

    el.form.addEventListener('submit', onGenerate);
    el.download.addEventListener('click', onDownload);
    el.sample.addEventListener('click', onSample);

    var inputs = [el.title, el.subtitle, el.trim, el.size, el.diff, el.count, el.howto];
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('input', scheduleRefresh);
      inputs[i].addEventListener('change', scheduleRefresh);
    }
    var radios = document.getElementsByName('perpage');
    for (var r = 0; r < radios.length; r++) radios[r].addEventListener('change', scheduleRefresh);

    el.tabs.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('.tab') : null;
      if (!btn) return;
      jumpToKind(btn.getAttribute('data-kind'));
    });

    el.prev.addEventListener('click', function () { goToPage(state.previewPage - 1); });
    el.next.addEventListener('click', function () { goToPage(state.previewPage + 1); });
    el.previewPageInput.addEventListener('change', function () {
      goToPage(parseInt(el.previewPageInput.value, 10) || 1);
    });
    el.previewPageInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        goToPage(parseInt(el.previewPageInput.value, 10) || 1);
      }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT' ||
          ev.target.tagName === 'TEXTAREA')) return;
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); goToPage(state.previewPage - 1); }
      if (ev.key === 'ArrowRight') { ev.preventDefault(); goToPage(state.previewPage + 1); }
    });

    // Start on the first puzzle page once the plan exists.
    refresh();
    jumpToKind('puzzles');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.App = { refresh: refresh, state: state, readForm: readForm };
})(typeof window !== 'undefined' ? window : this);
