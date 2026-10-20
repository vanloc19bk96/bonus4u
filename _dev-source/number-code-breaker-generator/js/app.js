/*
 * app.js — wiring: form state, generation flow, preview, export.
 *
 * The book object below is the single source of truth. The DOM never stores
 * book data; it only reflects it.
 */
(function (global) {
  'use strict';

  var C = global.NCB_CONST;
  var U = global.NCB_UTILS;
  var RANDOM = global.NCB_RANDOM;
  var ENGINE = global.NCB_ENGINE;
  var VALIDATOR = global.NCB_VALIDATOR;
  var BOOK = global.NCB_BOOK;
  var COMPLIANCE = global.NCB_COMPLIANCE;
  var PREVIEW = global.NCB_PREVIEW;
  var PDF = global.NCB_PDF;
  var STORAGE = global.NCB_STORAGE;

  var DEFAULT_COPYRIGHT =
    'Copyright © {YEAR} {AUTHOR_OR_PUBLISHER}\n' +
    '\n' +
    'All rights reserved.\n' +
    '\n' +
    'No part of this publication may be reproduced or distributed without permission from the copyright holder, ' +
    'except as permitted by applicable law.';

  var DEFAULT_INSTRUCTIONS =
    'HOW TO PLAY\n' +
    '\n' +
    'Crack the hidden number code using the clues beside each guess.\n' +
    '\n' +
    '● = A correct number in the correct position.\n' +
    '○ = A correct number in the wrong position.\n' +
    '\n' +
    'The clue symbols tell you how many numbers match. Their order does not correspond to specific columns.\n' +
    '\n' +
    'Use all of the clues together to work out the one hidden code.';

  /**
   * Above this the live page estimate is skipped: no KDP trim size allows
   * anywhere near this many puzzles, so there is nothing useful to measure.
   */
  var ESTIMATE_PUZZLE_CAP = 6000;

  var ZOOM_MIN = 0.4;
  var ZOOM_MAX = 1.4;
  var ZOOM_STEP = 0.1;
  var SCREEN_PPI = 96;

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  function createDefaultBook() {
    var preset = C.MODE_PRESETS.classic;
    return {
      meta: { title: 'Number Code Breaker', subtitle: '', author: '', seed: '' },
      print: {
        format: 'paperback',
        trimSizeId: C.DEFAULT_TRIM_ID,
        trimWidthIn: C.KDP_TRIM_SIZES[C.DEFAULT_TRIM_ID].widthIn,
        trimHeightIn: C.KDP_TRIM_SIZES[C.DEFAULT_TRIM_ID].heightIn,
        bleed: false,
        ink: 'black',
        paper: 'white',
        direction: 'ltr',
        showPageNumbers: true
      },
      frontMatter: {
        copyright: { enabled: true, text: DEFAULT_COPYRIGHT },
        instructions: { enabled: true, text: DEFAULT_INSTRUCTIONS }
      },
      puzzleSettings: {
        count: 100,
        puzzlesPerPage: 'auto',
        mode: 'classic',
        codeLength: preset.codeLength,
        digitMin: preset.digitMin,
        digitMax: preset.digitMax,
        allowDuplicates: preset.allowDuplicates,
        minClues: preset.minClues,
        maxClues: preset.maxClues
      },
      answers: { enabled: true },
      puzzles: [],
      pages: []
    };
  }

  var book = createDefaultBook();
  var state = {
    space: null,
    built: null,
    validation: null,
    compliance: null,
    preview: null,
    zoom: 0.7,
    busy: false,
    cancelRequested: false,
    stale: false
  };

  var dom = {};

  function $(id) { return document.getElementById(id); }

  function cacheDom() {
    [
      'in-title', 'in-subtitle', 'in-author', 'in-trim', 'in-bleed', 'in-page-numbers',
      'in-count', 'in-density', 'in-mode', 'in-code-length', 'in-digit-min', 'in-digit-max',
      'in-duplicates', 'in-clues-min', 'in-clues-max',
      'in-copyright-on', 'in-copyright', 'in-instructions-on', 'in-instructions', 'in-answers-on',
      'custom-settings', 'field-copyright', 'field-instructions',
      'btn-generate', 'btn-cancel', 'btn-download', 'hint-download',
      'btn-zoom-in', 'btn-zoom-out', 'btn-zoom-fit', 'zoom-value', 'in-guides',
      'stat-pages', 'stat-size', 'kdp-badge', 'progress', 'progress-fill', 'progress-label',
      'messages', 'preview', 'preview-scroll', 'empty-state',
      'hint-trim', 'hint-bleed', 'hint-density', 'hint-mode', 'hint-universe'
    ].forEach(function (id) { dom[id] = $(id); });
  }

  /* ------------------------------------------------------------------ *
   * Messages and progress
   * ------------------------------------------------------------------ */

  var messages = [];

  function setMessages(list) {
    messages = list || [];
    dom['messages'].innerHTML = '';
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      var node = document.createElement('div');
      node.className = 'message is-' + m.type;
      var label = document.createElement('strong');
      label.textContent = m.type === 'error' ? 'Problem' : (m.type === 'warn' ? 'Heads up' : 'Note');
      var text = document.createElement('span');
      text.textContent = m.text;
      node.appendChild(label);
      node.appendChild(text);
      dom['messages'].appendChild(node);
    }
  }

  function showProgress(label, done, total) {
    dom['progress'].hidden = false;
    dom['progress-label'].textContent = total ? label + ': ' + done + ' / ' + total : label;
    dom['progress-fill'].style.width = total ? Math.round((done / total) * 100) + '%' : '100%';
  }

  function hideProgress() {
    dom['progress'].hidden = true;
    dom['progress-fill'].style.width = '0%';
  }

  function setBusy(busy) {
    state.busy = busy;
    state.cancelRequested = false;
    dom['btn-generate'].disabled = busy;
    dom['btn-cancel'].hidden = !busy;
    dom['btn-download'].disabled = busy || !(state.compliance && state.compliance.ok) || state.stale;
    if (busy) setBadge('busy', 'Working…');
  }

  function setBadge(status, text) {
    dom['kdp-badge'].dataset.status = status;
    dom['kdp-badge'].textContent = text;
  }

  /* ------------------------------------------------------------------ *
   * Form <-> state
   * ------------------------------------------------------------------ */

  function populateTrimSelect() {
    var select = dom['in-trim'];
    select.innerHTML = '';
    var groups = {
      regular: document.createElement('optgroup'),
      large: document.createElement('optgroup')
    };
    groups.regular.label = 'Regular Trim Sizes';
    groups.large.label = 'Large Trim Sizes';

    Object.keys(C.KDP_TRIM_SIZES).forEach(function (id) {
      var trim = C.KDP_TRIM_SIZES[id];
      var option = document.createElement('option');
      option.value = id;
      option.textContent = trim.label;
      groups[trim.category].appendChild(option);
    });

    select.appendChild(groups.regular);
    select.appendChild(groups.large);
    select.value = C.DEFAULT_TRIM_ID;
  }

  function numberValue(input, fallback) {
    var value = parseInt(input.value, 10);
    return isNaN(value) ? fallback : value;
  }

  function readForm() {
    book.meta.title = dom['in-title'].value;
    book.meta.subtitle = dom['in-subtitle'].value;
    book.meta.author = dom['in-author'].value;

    var trimId = dom['in-trim'].value;
    var trim = C.KDP_TRIM_SIZES[trimId];
    book.print.trimSizeId = trimId;
    book.print.trimWidthIn = trim.widthIn;
    book.print.trimHeightIn = trim.heightIn;
    book.print.bleed = dom['in-bleed'].checked;
    book.print.showPageNumbers = dom['in-page-numbers'].checked;

    var ps = book.puzzleSettings;
    ps.count = Math.max(1, numberValue(dom['in-count'], 100));
    ps.puzzlesPerPage = dom['in-density'].value === 'auto' ? 'auto' : Number(dom['in-density'].value);
    ps.mode = dom['in-mode'].value;

    if (ps.mode === 'custom') {
      ps.codeLength = U.clamp(numberValue(dom['in-code-length'], 4), C.PUZZLE_LIMITS.codeLengthMin, C.PUZZLE_LIMITS.codeLengthMax);
      ps.digitMin = U.clamp(numberValue(dom['in-digit-min'], 1), C.PUZZLE_LIMITS.digitMin, C.PUZZLE_LIMITS.digitMax);
      ps.digitMax = U.clamp(numberValue(dom['in-digit-max'], 7), C.PUZZLE_LIMITS.digitMin, C.PUZZLE_LIMITS.digitMax);
      if (ps.digitMax < ps.digitMin) { var swap = ps.digitMin; ps.digitMin = ps.digitMax; ps.digitMax = swap; }
      ps.allowDuplicates = dom['in-duplicates'].checked;
      ps.minClues = U.clamp(numberValue(dom['in-clues-min'], 5), C.PUZZLE_LIMITS.clueRowsMin, C.PUZZLE_LIMITS.clueRowsMax);
      ps.maxClues = U.clamp(numberValue(dom['in-clues-max'], 7), C.PUZZLE_LIMITS.clueRowsMin, C.PUZZLE_LIMITS.clueRowsMax);
      if (ps.maxClues < ps.minClues) ps.maxClues = ps.minClues;
    } else {
      var preset = C.MODE_PRESETS[ps.mode];
      ps.codeLength = preset.codeLength;
      ps.digitMin = preset.digitMin;
      ps.digitMax = preset.digitMax;
      ps.allowDuplicates = preset.allowDuplicates;
      ps.minClues = preset.minClues;
      ps.maxClues = preset.maxClues;
    }

    book.frontMatter.copyright.enabled = dom['in-copyright-on'].checked;
    book.frontMatter.copyright.text = dom['in-copyright'].value;
    book.frontMatter.instructions.enabled = dom['in-instructions-on'].checked;
    book.frontMatter.instructions.text = dom['in-instructions'].value;
    book.answers.enabled = dom['in-answers-on'].checked;
  }

  function syncForm() {
    dom['in-title'].value = book.meta.title || '';
    dom['in-subtitle'].value = book.meta.subtitle || '';
    dom['in-author'].value = book.meta.author || '';
    dom['in-trim'].value = book.print.trimSizeId;
    dom['in-bleed'].checked = !!book.print.bleed;
    dom['in-page-numbers'].checked = book.print.showPageNumbers !== false;

    var ps = book.puzzleSettings;
    dom['in-count'].value = ps.count;
    dom['in-density'].value = ps.puzzlesPerPage === 'auto' ? 'auto' : String(ps.puzzlesPerPage);
    dom['in-mode'].value = ps.mode;
    dom['in-code-length'].value = ps.codeLength;
    dom['in-digit-min'].value = ps.digitMin;
    dom['in-digit-max'].value = ps.digitMax;
    dom['in-duplicates'].checked = !!ps.allowDuplicates;
    dom['in-clues-min'].value = ps.minClues;
    dom['in-clues-max'].value = ps.maxClues;

    dom['in-copyright-on'].checked = !!book.frontMatter.copyright.enabled;
    dom['in-copyright'].value = book.frontMatter.copyright.text || '';
    dom['in-instructions-on'].checked = !!book.frontMatter.instructions.enabled;
    dom['in-instructions'].value = book.frontMatter.instructions.text || '';
    dom['in-answers-on'].checked = !!book.answers.enabled;

    updateConditionalFields();
  }

  function updateConditionalFields() {
    dom['custom-settings'].hidden = dom['in-mode'].value !== 'custom';
    dom['field-copyright'].hidden = !dom['in-copyright-on'].checked;
    dom['field-instructions'].hidden = !dom['in-instructions-on'].checked;
  }

  /* ------------------------------------------------------------------ *
   * Live hints and page estimate
   * ------------------------------------------------------------------ */

  /**
   * Stand-in puzzles used only to measure how many pages the current settings
   * would produce. They carry the worst-case clue count, so the estimate is
   * never optimistic.
   */
  function placeholderPuzzles(settings, count) {
    var out = [];
    var guess = [];
    for (var d = 0; d < settings.codeLength; d++) {
      guess.push(settings.digitMin + (d % (settings.digitMax - settings.digitMin + 1)));
    }
    for (var i = 0; i < count; i++) {
      var guesses = [];
      var feedback = [];
      for (var r = 0; r < settings.maxClues; r++) {
        guesses.push(guess.slice());
        feedback.push({ correctPlace: 0, correctNumberWrongPlace: 0 });
      }
      out.push({
        id: i + 1,
        secret: guess.slice(),
        guesses: guesses,
        feedback: feedback,
        settings: {
          codeLength: settings.codeLength,
          digitMin: settings.digitMin,
          digitMax: settings.digitMax,
          allowDuplicates: settings.allowDuplicates
        }
      });
    }
    return out;
  }

  function updateHints() {
    var trim = C.KDP_TRIM_SIZES[book.print.trimSizeId];

    dom['hint-trim'].textContent = trim.label + ' · ' + trim.category + ' trim · ' +
      trim.minPages + '–' + trim.maxPages + ' pages allowed for black ink on white paper.';

    dom['hint-bleed'].textContent = book.print.bleed
      ? 'On — PDF page ' + (trim.widthIn + C.BLEED_IN).toFixed(3) + ' × ' + (trim.heightIn + C.BLEED_IN * 2).toFixed(3) + ' in'
      : 'Off — PDF page equals the trim size';

    var ps = book.puzzleSettings;
    var problem = ENGINE.describeCodeSpaceProblem(ps);
    var universe = ENGINE.codeSpaceSize(ps);

    dom['hint-universe'].textContent = problem
      ? problem
      : 'These settings allow ' + universe.toLocaleString() + ' different hidden codes.';
    dom['hint-universe'].classList.toggle('is-warn', !!problem);

    dom['hint-mode'].textContent = ps.mode === 'custom'
      ? 'Custom settings are used exactly as entered. Uniqueness is still enforced.'
      : 'Code length ' + ps.codeLength + ' · digits ' + ps.digitMin + '–' + ps.digitMax + ' · ' +
        (ps.allowDuplicates ? 'repeats allowed' : 'no repeats') + ' · ' + ps.minClues + '–' + ps.maxClues + ' clue rows.';

    dom['stat-size'].textContent = trim.label + (book.print.bleed ? ' + bleed' : '');

    if (problem) {
      dom['hint-density'].textContent = '';
      dom['hint-density'].classList.remove('is-warn');
      return;
    }
    if (universe > 0 && ps.count > universe) {
      dom['hint-density'].textContent = 'Only ' + universe.toLocaleString() + ' different codes exist for these settings, ' +
        'so at most ' + universe.toLocaleString() + ' puzzles can be generated without repeating one.';
      dom['hint-density'].classList.add('is-warn');
      return;
    }
    if (ps.count > ESTIMATE_PUZZLE_CAP) {
      dom['hint-density'].textContent = ps.count.toLocaleString() + ' puzzles is far beyond the page limit of any KDP ' +
        'paperback trim size. Reduce the puzzle count.';
      dom['hint-density'].classList.add('is-warn');
      return;
    }

    // Measure the real page count using stand-in puzzles.
    try {
      var probe = {
        meta: book.meta,
        print: book.print,
        frontMatter: book.frontMatter,
        puzzleSettings: ps,
        answers: book.answers,
        puzzles: placeholderPuzzles(ps, ps.count)
      };
      var built = BOOK.buildBook(probe);
      var perPage = built.densityLayout ? built.densityLayout.cols * built.densityLayout.rows : 1;
      var pages = built.pages.length;
      var effective = pages % 2 === 0 ? pages : pages + 1;

      var parts = [];
      parts.push(built.density.auto
        ? 'Auto chose ' + perPage + ' puzzle' + (perPage === 1 ? '' : 's') + ' per page'
        : perPage + ' puzzle' + (perPage === 1 ? '' : 's') + ' per page');
      parts.push('digits ' + built.densityLayout.card.digitPt.toFixed(1) + ' pt');
      parts.push('≈ ' + pages + ' book page' + (pages === 1 ? '' : 's'));

      dom['hint-density'].textContent = parts.join(' · ') + '.';

      var outOfRange = effective < built.rules.minPages || effective > built.rules.maxPages;
      var densityBad = built.densityLayout && !built.densityLayout.fits;
      dom['hint-density'].classList.toggle('is-warn', outOfRange || densityBad);

      if (densityBad && built.density.recommended) {
        dom['hint-density'].textContent += ' That is below the ' + C.MIN_FONT_PT.puzzleDigit +
          ' pt minimum — try ' + built.density.recommended + ' per page.';
      } else if (outOfRange) {
        dom['hint-density'].textContent += ' Outside the allowed ' + built.rules.minPages + '–' +
          built.rules.maxPages + ' page range for this trim size.';
      }

      dom['stat-size'].textContent = trim.label + (book.print.bleed ? ' + bleed' : '');
      if (!book.puzzles.length) dom['stat-pages'].textContent = '≈ ' + pages + ' pages';
    } catch (err) {
      dom['hint-density'].textContent = err.message;
      dom['hint-density'].classList.add('is-warn');
    }
  }

  /* ------------------------------------------------------------------ *
   * Compliance report -> messages, badge, export gate
   * ------------------------------------------------------------------ */

  function applyReport(report) {
    state.compliance = report;

    var list = [];
    var i;
    for (i = 0; i < report.errors.length; i++) list.push({ type: 'error', text: report.errors[i] });
    for (i = 0; i < report.warnings.length; i++) list.push({ type: 'warn', text: report.warnings[i] });
    setMessages(list);

    setBadge(report.ok ? 'pass' : 'fail', report.ok ? 'KDP checks passed' : 'KDP checks failed');
    dom['stat-pages'].textContent = report.actualPageCount + ' pages / ' + report.effectivePageCount + ' effective';
    dom['btn-download'].disabled = !report.ok || state.stale;
    dom['hint-download'].textContent = report.ok
      ? (state.stale ? 'Settings changed — generate the book again before exporting.' : 'Exports a print-ready interior PDF at the exact trim size.')
      : 'Export is blocked until the problems listed above are resolved.';
  }

  /* ------------------------------------------------------------------ *
   * Build / render
   * ------------------------------------------------------------------ */

  function rebuildPages() {
    if (!book.puzzles.length) return;
    state.built = BOOK.buildBook(book);
    book.pages = state.built.pages;
    applyReport(COMPLIANCE.buildComplianceReport(book, state.built, state.validation));
    if (dom['empty-state']) dom['empty-state'].remove();
    state.preview = PREVIEW.renderBookPreview(dom['preview'], state.built, {
      showGuides: dom['in-guides'].checked,
      root: dom['preview-scroll']
    });
    applyZoom();
  }

  /* ------------------------------------------------------------------ *
   * Generation
   * ------------------------------------------------------------------ */

  function generate() {
    if (state.busy) return;
    readForm();

    var ps = book.puzzleSettings;
    var problem = ENGINE.describeCodeSpaceProblem(ps);
    if (problem) {
      setMessages([{ type: 'error', text: problem }]);
      setBadge('fail', 'Settings need attention');
      return;
    }

    // Every run draws a fresh random seed.
    var seed = RANDOM.generateSeed();
    book.meta.seed = seed;

    setBusy(true);
    setMessages([]);
    showProgress('Generating puzzles', 0, ps.count);

    var hooks = {
      shouldCancel: function () { return state.cancelRequested; },
      onProgress: function (done, total) { showProgress('Generating puzzles', done, total); }
    };

    ENGINE.generatePuzzles(ps, seed, hooks)
      .then(function (result) {
        book.puzzles = result.puzzles;
        state.space = result.space;
        showProgress('Checking every puzzle has one solution', 0, result.puzzles.length);
        return VALIDATOR.validateBook(result.puzzles, result.space, {
          shouldCancel: hooks.shouldCancel,
          onProgress: function (done, total) { showProgress('Checking every puzzle has one solution', done, total); }
        });
      })
      .then(function (validation) {
        state.validation = validation;
        showProgress('Building preview');
        return U.nextFrame();
      })
      .then(function () {
        state.stale = false;
        rebuildPages();
        hideProgress();
        setBusy(false);
        STORAGE.saveSettings(book);
      })
      .catch(function (err) {
        hideProgress();
        setBusy(false);
        setBadge('fail', 'Generation stopped');
        setMessages([{ type: 'error', text: err.message }]);
      });
  }

  /* ------------------------------------------------------------------ *
   * PDF export
   * ------------------------------------------------------------------ */

  function downloadPdf() {
    if (state.busy || !state.built || !state.compliance || !state.compliance.ok) return;

    setBusy(true);
    showProgress('Rendering PDF', 0, state.built.pages.length);

    PDF.exportBookToPdf(book, state.built, {
      shouldCancel: function () { return state.cancelRequested; },
      onProgress: function (done, total, stage) { showProgress(stage, done, total); }
    })
      .then(function (result) {
        if (!result.preflight.ok) {
          throw new Error('The PDF failed its internal preflight and was not saved. ' + result.preflight.issues.join(' '));
        }
        U.download(PDF.suggestFilename(book), result.blob);
        hideProgress();
        setBusy(false);
        setMessages([{
          type: 'info',
          text: 'PDF ready for KDP preflight — ' + result.preflight.pageCount + ' pages at ' +
            result.preflight.pageWidthPt.toFixed(2) + ' × ' + result.preflight.pageHeightPt.toFixed(2) +
            ' pt (' + state.built.rules.pageWidthIn + ' × ' + state.built.rules.pageHeightIn + ' in), ' +
            result.preflight.embeddedFonts + ' embedded font program' + (result.preflight.embeddedFonts === 1 ? '' : 's') +
            ', no non-embedded fonts, ' + Math.round(result.preflight.byteLength / 1024) + ' KB. ' +
            'Review it in Amazon’s Print Previewer before you publish.'
        }].concat(messages.filter(function (m) { return m.type === 'warn'; })));
      })
      .catch(function (err) {
        hideProgress();
        setBusy(false);
        setMessages([{ type: 'error', text: err.message }]);
      });
  }

  /* ------------------------------------------------------------------ *
   * Zoom
   * ------------------------------------------------------------------ */

  function applyZoom() {
    dom['preview'].style.setProperty('--ppi', String(U.round(SCREEN_PPI * state.zoom, 2)));
    dom['zoom-value'].textContent = Math.round(state.zoom * 100) + '%';
  }

  function setZoom(value) {
    state.zoom = U.clamp(value, ZOOM_MIN, ZOOM_MAX);
    applyZoom();
  }

  function fitWidth() {
    if (!state.built) return;
    var available = dom['preview-scroll'].clientWidth - 56;
    setZoom(available / (state.built.rules.pageWidthIn * SCREEN_PPI));
  }

  /* ------------------------------------------------------------------ *
   * Events
   * ------------------------------------------------------------------ */

  /** Settings that change the puzzles themselves make the current book stale. */
  var PUZZLE_INPUTS = ['in-count', 'in-mode', 'in-code-length', 'in-digit-min', 'in-digit-max',
    'in-duplicates', 'in-clues-min', 'in-clues-max'];

  /** Settings that only change layout — these repaginate without regenerating. */
  var LAYOUT_INPUTS = ['in-title', 'in-subtitle', 'in-author', 'in-trim', 'in-bleed', 'in-page-numbers',
    'in-density', 'in-copyright-on', 'in-copyright', 'in-instructions-on', 'in-instructions', 'in-answers-on'];

  function markStale() {
    if (!book.puzzles.length || state.stale) return;
    state.stale = true;
    dom['btn-download'].disabled = true;
    dom['hint-download'].textContent = 'Settings changed — generate the book again before exporting.';
    setMessages([{ type: 'info', text: 'Puzzle settings changed. Select Generate Book to rebuild the puzzles with the new settings.' }]);
  }

  var repaginateTimer = null;

  function scheduleRepaginate() {
    clearTimeout(repaginateTimer);
    repaginateTimer = setTimeout(function () {
      readForm();
      updateConditionalFields();
      updateHints();
      STORAGE.saveSettings(book);
      if (book.puzzles.length && !state.stale && !state.busy) {
        try {
          rebuildPages();
        } catch (err) {
          setMessages([{ type: 'error', text: err.message }]);
        }
      }
    }, 180);
  }

  function bindEvents() {
    PUZZLE_INPUTS.forEach(function (id) {
      dom[id].addEventListener('input', function () {
        readForm();
        updateConditionalFields();
        updateHints();
        markStale();
        STORAGE.saveSettings(book);
      });
      dom[id].addEventListener('change', updateConditionalFields);
    });

    LAYOUT_INPUTS.forEach(function (id) {
      dom[id].addEventListener('input', scheduleRepaginate);
      dom[id].addEventListener('change', scheduleRepaginate);
    });

    dom['btn-generate'].addEventListener('click', function () { generate(); });
    dom['btn-cancel'].addEventListener('click', function () { state.cancelRequested = true; });
    dom['btn-download'].addEventListener('click', downloadPdf);

    dom['btn-zoom-in'].addEventListener('click', function () { setZoom(state.zoom + ZOOM_STEP); });
    dom['btn-zoom-out'].addEventListener('click', function () { setZoom(state.zoom - ZOOM_STEP); });
    dom['btn-zoom-fit'].addEventListener('click', fitWidth);
    dom['in-guides'].addEventListener('change', function () {
      if (book.puzzles.length) rebuildPages();
    });
  }

  /* ------------------------------------------------------------------ *
   * Start-up
   * ------------------------------------------------------------------ */

  function init() {
    cacheDom();
    populateTrimSelect();

    if (!global.jspdf || !global.jspdf.jsPDF) {
      setMessages([{ type: 'error', text: 'The bundled PDF library did not load. Check that the vendor folder sits next to index.html.' }]);
      return;
    }
    if (!global.NOTO_SANS_BASE64) {
      setMessages([{ type: 'error', text: 'The bundled font did not load, so PDFs could not embed their fonts. Check vendor/font-notosans.js.' }]);
      return;
    }

    var saved = STORAGE.loadSettings();
    if (saved) {
      book.meta = saved.meta || book.meta;
      book.print = saved.print || book.print;
      book.frontMatter = saved.frontMatter || book.frontMatter;
      book.puzzleSettings = saved.puzzleSettings || book.puzzleSettings;
      book.answers = saved.answers || book.answers;
      book.puzzles = [];
      book.pages = [];
    }

    syncForm();
    readForm();
    bindEvents();
    updateHints();
    applyZoom();
    setBadge('idle', 'Not generated');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exposed for the test page and for inspecting a session from the console.
  global.NCB_APP = {
    createDefaultBook: createDefaultBook,
    DEFAULT_COPYRIGHT: DEFAULT_COPYRIGHT,
    DEFAULT_INSTRUCTIONS: DEFAULT_INSTRUCTIONS,
    getBook: function () { return book; },
    getState: function () { return state; },
    generate: generate
  };
})(window);
