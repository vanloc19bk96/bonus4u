/*! ui.js — sidebar accordion, toolbar, messages. */
(function (global) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function fillTrimSelect() {
    var sel = $('f-trim');
    sel.innerHTML = '';
    global.MMLayout.TRIMS.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label;
      if (t.id === '8.5x11') opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function fillHowto(paragraphs, titles) {
    var defaultTitles = global.MMPrompt.DEFAULT_HOWTO_TITLES;
    for (var i = 0; i < 5; i++) {
      $('h' + (i + 1)).value = (paragraphs && paragraphs[i]) || '';
      $('ht' + (i + 1)).value = (titles && titles[i]) || defaultTitles[i] || '';
    }
  }

  function fillCopyright(text) {
    $('f-copyright').value = text || global.MMLayout.defaultCopyrightText($('f-author').value.trim());
  }

  function readSettings() {
    var diff = 'standard';
    document.querySelectorAll('input[name="diff"]').forEach(function (el) {
      if (el.checked) diff = el.value;
    });
    var author = $('f-author').value.trim();
    return {
      bookTitle: $('f-title').value.trim() || 'Murder Search',
      author: author,
      copyrightText: $('f-copyright').value.trim() || global.MMLayout.defaultCopyrightText(author),
      puzzleCount: Math.max(1, Math.min(200, Number($('f-count').value) || 60)),
      trimId: $('f-trim').value,
      difficulty: diff,
      theme: $('f-theme').value.trim(),
      answers: $('f-answers').checked,
      seed: $('f-seed').value.trim() || '1',
      gridOverride: $('f-grid').value,
      howto: $('f-howto').checked,
      pagePos: $('f-pagepos').value,
      perKeyPage: Math.max(4, Math.min(20, Number($('f-perkey').value) || 12)),
      howtoTitles: [1, 2, 3, 4, 5].map(function (n) {
        return $('ht' + n).value.trim() || global.MMPrompt.DEFAULT_HOWTO_TITLES[n - 1];
      }),
      howtoText: [1, 2, 3, 4, 5].map(function (n) { return $('h' + n).value.trim(); })
    };
  }

  function writeSettings(s) {
    if (!s) return;
    $('f-title').value = s.bookTitle || 'Murder Search';
    $('f-author').value = s.author || '';
    fillCopyright(s.copyrightText || global.MMLayout.defaultCopyrightText(s.author || ''));
    $('f-count').value = s.puzzleCount || 60;
    if (s.trimId) $('f-trim').value = s.trimId;
    document.querySelectorAll('input[name="diff"]').forEach(function (el) {
      el.checked = el.value === (s.difficulty || 'standard');
    });
    $('f-theme').value = s.theme || '';
    $('f-answers').checked = s.answers !== false;
    $('f-seed').value = s.seed || '184729';
    $('f-grid').value = s.gridOverride || 'auto';
    $('f-howto').checked = s.howto !== false;
    $('f-pagepos').value = s.pagePos === 'outside' ? 'center' : (s.pagePos || 'center');
    $('f-perkey').value = s.perKeyPage || 12;
    if (s.howtoText || s.howtoTitles) fillHowto(s.howtoText, s.howtoTitles);
  }

  function setStep(n, locks) {
    [1, 2, 3].forEach(function (i) {
      var el = $('step-' + i);
      el.classList.toggle('is-open', i === n);
      el.classList.toggle('is-locked', !!locks[i]);
    });
  }

  function setLoadStatus(loaded, wanted, quarantined) {
    var el = $('load-status');
    var text = loaded + ' of ' + wanted + ' cases loaded';
    if (quarantined) text += ', ' + quarantined + ' need a fix';
    el.textContent = text;
    el.className = 'status ' + (quarantined ? 'is-bad' : loaded ? 'is-ok' : '');
    $('btn-fix').hidden = !quarantined;
  }

  function setPromptMeta(index, total, text) {
    $('prompt-meta').textContent = 'Prompt ' + (index + 1) + ' of ' + total;
    $('prompt-preview-body').textContent = text || '';
    $('btn-prompt-prev').disabled = index <= 0;
    $('btn-prompt-next').disabled = index >= total - 1;
  }

  function setProgress(on, text, pct) {
    $('progress-wrap').hidden = !on;
    $('progress-text').textContent = text || '';
    $('progress-bar').style.width = Math.round((pct || 0) * 100) + '%';
  }

  function setReadout(html) {
    var el = $('readout');
    el.hidden = !html;
    el.innerHTML = html || '';
  }

  function showPdfButton(on) { $('btn-pdf').hidden = !on; }

  function renderPreview(html, page, total, scale) {
    var inner = $('stage-inner');
    inner.classList.remove('is-placeholder');
    inner.innerHTML = html;
    inner.style.transform = 'scale(' + scale + ')';
    var pageEl = inner.querySelector('.mm-page');
    if (pageEl) {
      var w = pageEl.offsetWidth * scale;
      var h = pageEl.offsetHeight * scale;
      inner.style.width = w + 'px';
      inner.style.height = h + 'px';
    }
    $('f-page').disabled = false;
    $('f-page').value = page;
    $('page-of').textContent = '/ ' + total;
  }

  function renderPlaceholder() {
    var inner = $('stage-inner');
    inner.classList.add('is-placeholder');
    inner.style.transform = '';
    inner.style.width = '';
    inner.style.height = '';
    inner.innerHTML =
      '<div class="stage-placeholder">' +
      '<p class="stage-placeholder-title">Page preview</p>' +
      '<p class="stage-placeholder-body">Build a book to see pages here. Setup, paste cases, then press Build book.</p>' +
      '</div>';
    $('f-page').disabled = true;
    $('f-page').value = '';
    $('page-of').textContent = '';
  }

  function toastStatus(msg, bad) {
    var el = $('load-status');
    el.textContent = msg;
    el.className = 'status ' + (bad ? 'is-bad' : 'is-ok');
  }

  function bind(handlers) {
    document.querySelectorAll('.step-h').forEach(function (btn) {
      btn.addEventListener('click', function () { handlers.openStep(Number(btn.getAttribute('data-open'))); });
    });
    ['f-title', 'f-author', 'f-copyright', 'f-count', 'f-trim', 'f-theme', 'f-answers', 'f-seed', 'f-grid', 'f-howto', 'f-pagepos', 'f-perkey', 'ht1', 'ht2', 'ht3', 'ht4', 'ht5', 'h1', 'h2', 'h3', 'h4', 'h5'].forEach(function (id) {
      $(id).addEventListener('change', handlers.settingsChanged);
      $(id).addEventListener('input', handlers.settingsChanged);
    });
    document.querySelectorAll('input[name="diff"]').forEach(function (el) {
      el.addEventListener('change', handlers.settingsChanged);
    });
    $('btn-continue').addEventListener('click', handlers.continueSetup);
    $('btn-to-build').addEventListener('click', handlers.continueToBuild);
    $('btn-prompt-prev').addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      handlers.prevPrompt();
    });
    $('btn-prompt-next').addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      handlers.nextPrompt();
    });
    $('prompt-preview-nav').addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); });
    $('btn-copy').addEventListener('click', handlers.copyPrompt);
    $('btn-import').addEventListener('click', handlers.importPaste);
    $('btn-fix').addEventListener('click', handlers.copyRepair);
    $('btn-build').addEventListener('click', handlers.buildBook);
    $('btn-pdf').addEventListener('click', handlers.downloadPdf);
    $('btn-save').addEventListener('click', handlers.saveProject);
    $('btn-open').addEventListener('click', function () { $('f-open').click(); });
    $('f-open').addEventListener('change', handlers.openProject);
    $('btn-prev').addEventListener('click', handlers.prevPage);
    $('btn-next').addEventListener('click', handlers.nextPage);
    $('f-page').addEventListener('change', handlers.jumpPage);
    $('btn-fit').addEventListener('click', function () { handlers.setZoom('fit'); });
    $('btn-100').addEventListener('click', function () { handlers.setZoom('100'); });
    $('f-show-answers').addEventListener('change', handlers.toggleAnswers);
    $('f-show-margins').addEventListener('change', handlers.toggleMargins);
    window.addEventListener('resize', handlers.onResize);
  }

  global.MMUi = {
    fillTrimSelect: fillTrimSelect,
    fillHowto: fillHowto,
    fillCopyright: fillCopyright,
    readSettings: readSettings,
    writeSettings: writeSettings,
    setStep: setStep,
    setLoadStatus: setLoadStatus,
    setPromptMeta: setPromptMeta,
    setProgress: setProgress,
    setReadout: setReadout,
    showPdfButton: showPdfButton,
    renderPreview: renderPreview,
    renderPlaceholder: renderPlaceholder,
    toastStatus: toastStatus,
    bind: bind,
    $: $
  };
})(typeof window !== 'undefined' ? window : globalThis);
