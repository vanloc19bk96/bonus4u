/* ui.js — the form, the stepper, the preview refresh and the PDF button.
   Every string the user reads lives in this file. */
(function () {
  var W = window.WYR;
  var C = W.config;
  var S = W.state;

  var U = (W.ui = {});

  var el = {};
  var currentBook = null;
  var layoutTimer = null;
  var selected = {};          // question ids ticked for the rewrite prompt

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* ====================== toast, modal, clipboard ====================== */
  U.toast = function (msg, kind) {
    var host = $('#toasts');
    var node = document.createElement('div');
    node.className = 'toast' + (kind ? ' toast--' + kind : '');
    node.textContent = msg;
    host.appendChild(node);
    setTimeout(function () {
      node.style.transition = 'opacity .25s ease';
      node.style.opacity = '0';
      setTimeout(function () { node.remove(); }, 260);
    }, kind === 'error' ? 6000 : 3200);
  };

  U.confirm = function (message, onYes, yesLabel) {
    U.modal('Are you sure?', '<p class="note">' + escapeHtml(message) + '</p>', [
      { label: 'Cancel', ghost: true },
      { label: yesLabel || 'Yes, do it', primary: true, action: onYes }
    ]);
  };

  U.modal = function (title, bodyHtml, actions, onOpen) {
    var host = $('#modal');
    host.innerHTML = '';
    var card = document.createElement('div');
    card.className = 'modal__card';
    card.innerHTML = '<h3></h3><div class="modal__body"></div>';
    card.querySelector('h3').textContent = title;
    card.querySelector('.modal__body').innerHTML = bodyHtml;

    var bar = document.createElement('div');
    bar.className = 'modal__actions';
    (actions || []).forEach(function (a) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (a.primary ? 'btn--primary' : 'btn--ghost');
      btn.textContent = a.label;
      btn.addEventListener('click', function () {
        var keepOpen = a.action ? a.action(card) : false;
        if (!keepOpen) U.closeModal();
      });
      bar.appendChild(btn);
    });
    card.appendChild(bar);
    host.appendChild(card);
    host.hidden = false;
    host.onclick = function (e) { if (e.target === host) U.closeModal(); };
    if (onOpen) onOpen(card);
  };

  U.closeModal = function () {
    var host = $('#modal');
    host.hidden = true;
    host.innerHTML = '';
  };

  /* file:// is not a secure context in every browser, so the async
     clipboard API may be missing. Fall back to the old textarea trick. */
  U.copy = function (str, okMessage) {
    function done() { U.toast(okMessage || 'Copied ✓'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = str;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (ok) done();
      else U.toast('This browser blocked the copy. Select the text and press Ctrl+C instead.', 'warn');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(str).then(done, fallback);
    } else fallback();
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ============================ the stepper =========================== */
  U.openStep = function (n) {
    S.data.ui.step = n;
    $$('.step').forEach(function (step) {
      var no = parseInt(step.dataset.step, 10);
      step.classList.toggle('step--open', no === n);
    });
  };

  function refreshBadges() {
    var d = S.data;
    var total = d.setup.count;
    var have = d.questions.length;

    $('#badge-1').textContent = C.find(C.AUDIENCES, d.setup.audience).label.split(' (')[0];
    $('#badge-2').textContent = have + '/' + total;
    $('#badge-3').textContent = currentBook ? count(currentBook.pages.length, 'page') : '';

    mark(1, true);
    mark(2, have >= total && total > 0);
    mark(3, !!currentBook && have > 0);
  }

  function mark(no, done) {
    var step = $('.step[data-step="' + no + '"]');
    if (step) step.classList.toggle('step--done', !!done);
  }

  /* ============================== step 1 ============================== */
  function buildStep1() {
    fillSelect(el.audience, C.AUDIENCES, function (a) { return a.label; });
    fillSelect(el.theme, C.THEMES, function (t) { return t.label; });
    fillSelect(el.language, C.LANGUAGES, function (l) { return l.label; });

    el.countChips.innerHTML = '';
    C.COUNT_CHIPS.forEach(function (n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = n;
      b.addEventListener('click', function () {
        el.count.value = n;
        S.update('setup', { count: n }, 'setup');
        syncStep1();
        onSetupChanged();
      });
      el.countChips.appendChild(b);
    });

    el.style.innerHTML = '';
    C.STYLES.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.value = s.id;
      b.textContent = s.emoji + ' ' + s.label;
      b.addEventListener('click', function () {
        S.update('setup', { style: s.id }, 'setup');
        syncStep1();
        onSetupChanged();
      });
      el.style.appendChild(b);
    });

    el.audience.addEventListener('change', function () {
      S.update('setup', { audience: el.audience.value }, 'setup');
      onSetupChanged();
    });
    el.theme.addEventListener('change', function () {
      S.update('setup', { theme: el.theme.value }, 'setup');
      syncStep1();
      onSetupChanged();
    });
    el.customTheme.addEventListener('input', function () {
      S.update('setup', { customTheme: el.customTheme.value }, 'setup');
      onSetupChanged();
    });
    el.language.addEventListener('change', function () {
      S.update('setup', { language: el.language.value }, 'setup');
      onSetupChanged();
      scheduleLayout();
    });
    el.count.addEventListener('change', function () {
      var n = clamp(parseInt(el.count.value, 10) || C.DEFAULT_COUNT, C.MIN_COUNT, C.MAX_COUNT);
      el.count.value = n;
      S.update('setup', { count: n }, 'setup');
      syncStep1();
      onSetupChanged();
    });

    $('#btn-make-prompt').addEventListener('click', function () {
      buildPrompt();
      U.openStep(2);
      U.toast('Prompt ready — hit “Copy prompt”.');
    });
  }

  function syncStep1() {
    var d = S.data.setup;
    el.audience.value = d.audience;
    el.theme.value = d.theme;
    el.language.value = C.find(C.LANGUAGES, d.language).id;
    el.count.value = d.count;
    el.customTheme.value = d.customTheme;
    $('#field-custom-theme').classList.toggle('field--hidden', d.theme !== 'custom');
    $$('#count-chips button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(parseInt(b.textContent, 10) === d.count));
    });
    $$('#f-style button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.value === d.style));
    });
  }

  function onSetupChanged() {
    buildPrompt();
    refreshBadges();
    updateProgress();
  }

  /* ==================== step 2 — half A, the prompt ==================== */
  function buildPromptHalf() {
    el.batch.addEventListener('change', function () {
      S.data.ui.promptBatch = parseInt(el.batch.value, 10) || 1;
      buildPrompt();
    });
    $('#btn-copy-prompt').addEventListener('click', function () {
      U.copy(el.promptText.textContent, 'Prompt copied ✓');
    });
    $('#btn-copy-next').addEventListener('click', function () {
      U.copy('next', 'Copied “next” ✓');
    });
    $('#btn-expand-prompt').addEventListener('click', function () {
      var box = $('.promptbox');
      var open = box.classList.toggle('promptbox--open');
      $('#btn-expand-prompt').textContent = open ? 'Show less' : 'Show all';
    });
  }

  function buildPrompt() {
    var setup = S.data.setup;
    var total = W.prompt.totalBatches(setup.count);
    var batch = clamp(S.data.ui.promptBatch || 1, 1, total);
    S.data.ui.promptBatch = batch;

    el.batch.innerHTML = '';
    for (var i = 1; i <= total; i++) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = 'Round ' + i + ' of ' + total;
      el.batch.appendChild(o);
    }
    el.batch.value = String(batch);
    $('#batch-picker-field').style.display = total > 1 ? '' : 'none';

    var perBatch = Math.min(C.BATCH_SIZE, setup.count);
    $('#batch-info').innerHTML = total > 1
      ? 'Your book needs <strong>' + count(total, 'round') + '</strong> with the AI, up to ' + perBatch + ' questions each.'
      : 'A <strong>single round</strong> with the AI covers all ' + setup.count + ' questions.';

    el.promptText.textContent = W.prompt.build(setup, batch);
  }

  /* ==================== step 2 — half B, the reply ===================== */
  function buildPasteHalf() {
    $('#btn-add-questions').addEventListener('click', addPasted);

    $('#btn-clear').addEventListener('click', function () {
      if (!S.data.questions.length) return;
      U.confirm('Delete all ' + count(S.data.questions.length, 'question') + '? This cannot be undone.',
        function () {
          S.clearQuestions();
          selected = {};
          U.toast('All questions deleted.');
        }, 'Delete all');
    });

    $('#btn-export').addEventListener('click', function () {
      var blob = new Blob([S.exportJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'wyr-book-backup.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      U.toast('Backup file downloaded ✓');
    });

    $('#btn-import').addEventListener('click', function () { $('#import-file').click(); });
    $('#import-file').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var n = S.importJSON(String(reader.result));
          selected = {};
          syncAll();
          U.toast('Imported ' + count(n, 'question') + ' from the backup ✓');
        } catch (err) {
          U.toast('Could not read that file: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('#btn-rewrite').addEventListener('click', function () {
      var picked = S.data.questions.filter(function (q) { return selected[q.id]; });
      if (!picked.length) {
        U.toast('Tick the questions you want the AI to rewrite first.', 'warn');
        return;
      }
      var text = W.prompt.buildReplacement(S.data.setup, picked);
      U.copy(text, 'Copied a prompt to rewrite ' + count(picked.length, 'question') + ' ✓');
    });

    $('#q-select-all').addEventListener('change', function (e) {
      selected = {};
      if (e.target.checked) {
        S.data.questions.forEach(function (q) { selected[q.id] = true; });
      }
      renderQuestionList();
    });
  }

  function addPasted() {
    var before = S.data.ui.promptBatch;
    var raw = el.pasteBox.value;
    var result = W.parser.parse(raw, S.data.questions);

    if (!result.ok) {
      U.toast(result.error, 'error');
      return;
    }

    var added;
    if (result.replace) {
      added = S.replaceQuestions(result.questions);
      U.toast('Replaced ' + count(added, 'question') + ' ✓');
    } else {
      var room = Math.max(0, S.data.setup.count - S.data.questions.length);
      var incoming = result.questions;
      if (room && incoming.length > room) {
        incoming = incoming.slice(0, room);
        result.notes.push('The book was nearly full, so only the first ' + count(room, 'question') + ' were kept.');
      }
      S.addQuestions(incoming);
      added = incoming.length;
      U.toast('Added ' + count(added, 'question') + ' (' + S.data.questions.length + '/' + S.data.setup.count + ' so far) ✓');
    }

    if (result.titleIdeas.length) {
      S.data.book.titleIdeas = result.titleIdeas;
      if (!S.data.book.title) S.data.book.title = result.titleIdeas[0].title;
      if (!S.data.book.subtitle) S.data.book.subtitle = result.titleIdeas[0].subtitle;
      syncStep3();
    }

    result.notes.forEach(function (n) { U.toast(n, 'warn'); });
    el.pasteBox.value = '';
    selected = {};
    syncAll();

    if (S.data.questions.length >= S.data.setup.count) {
      U.openStep(3);
      U.toast('All ' + S.data.setup.count + ' questions are in — time to lay it out and download!');
    } else {
      /* Load the next round into half A and point at it, so the next lap
         starts right where the user already is. */
      var total = W.prompt.totalBatches(S.data.setup.count);
      var next = Math.min(total, Math.floor(S.data.questions.length / C.BATCH_SIZE) + 1);
      S.data.ui.promptBatch = next;
      buildPrompt();
      if (next !== before) nudgeToPrompt(next, total);
    }
  }

  /* Scrolls half A back into view and flashes it, after a round lands. */
  function nudgeToPrompt(round, total) {
    var half = $('#half-prompt');
    half.scrollIntoView({ block: 'nearest' });
    half.classList.remove('half--nudge');
    void half.offsetWidth;                    // restart the animation
    half.classList.add('half--nudge');
    U.toast('Round ' + round + ' of ' + total + ' is ready above — copy it into the AI.');
  }

  function updateProgress() {
    var have = S.data.questions.length;
    var want = S.data.setup.count;
    var pct = want ? Math.min(100, Math.round(have / want * 100)) : 0;
    $('#progress-fill').style.width = pct + '%';
    $('#progress-text').textContent = have + ' / ' + want + ' questions';
    $('#paste-hint').innerHTML = have >= want
      ? 'That is the full set. Head to step 3 to lay the book out.'
      : count(want - have, 'question') + ' to go. Type <code>next</code> in the AI for another round, then paste it straight back here.';
  }

  function renderQuestionList() {
    var host = $('#qlist');
    host.innerHTML = '';
    var list = S.data.questions;
    var count = 0;

    list.forEach(function (q) {
      if (selected[q.id]) count++;
      var row = document.createElement('div');
      row.className = 'qitem';

      var check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !!selected[q.id];
      check.addEventListener('change', function () {
        if (check.checked) selected[q.id] = true; else delete selected[q.id];
        updateSelectedCount();
      });

      var body = document.createElement('div');
      body.className = 'qitem__body';
      var meta = document.createElement('div');
      meta.className = 'qitem__meta';
      meta.textContent = '#' + q.id + ' · ' + (q.cat || '');
      var txt = document.createElement('div');
      txt.className = 'qitem__text';
      txt.textContent = trimTo(q.a, 44) + '  /  ' + trimTo(q.b, 44);
      body.appendChild(meta);
      body.appendChild(txt);
      if (q.warnings && q.warnings.length) {
        var warn = document.createElement('div');
        warn.className = 'qitem__warn';
        warn.textContent = '⚠ ' + q.warnings.join('; ');
        body.appendChild(warn);
      }

      var actions = document.createElement('div');
      actions.className = 'qitem__actions';
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.title = 'Edit this question';
      edit.textContent = '✏️';
      edit.addEventListener('click', function () { openEditor(q); });
      var del = document.createElement('button');
      del.type = 'button';
      del.title = 'Delete this question';
      del.textContent = '🗑';
      del.addEventListener('click', function () {
        S.removeQuestion(q.id);
        delete selected[q.id];
        syncAll();
      });
      actions.appendChild(edit);
      actions.appendChild(del);

      row.appendChild(check);
      row.appendChild(body);
      row.appendChild(actions);
      host.appendChild(row);
    });

    $('#q-select-all').checked = list.length > 0 && count === list.length;
    updateSelectedCount();
  }

  function updateSelectedCount() {
    var n = Object.keys(selected).length;
    $('#q-selected-count').textContent = n ? n + ' selected' : '';
  }

  function openEditor(q) {
    var fields = [
      ['a', 'Option A'], ['b', 'Option B'], ['cat', 'Category'],
      ['why_hard', 'Why it is hard'], ['a_plus', 'Best argument for A'],
      ['b_plus', 'Best argument for B'], ['bonus', 'Follow-up question']
    ];
    var html = fields.map(function (f) {
      var tag = (f[0] === 'a' || f[0] === 'b')
        ? '<textarea rows="2" data-k="' + f[0] + '">' + escapeHtml(q[f[0]]) + '</textarea>'
        : '<input type="text" data-k="' + f[0] + '" value="' + escapeHtml(q[f[0]]) + '">';
      return '<label class="field"><span class="field__label">' + f[1] + '</span>' + tag + '</label>';
    }).join('');

    U.modal('Edit question #' + q.id, html, [
      { label: 'Cancel', ghost: true },
      { label: 'Save', primary: true, action: function (card) {
          card.querySelectorAll('[data-k]').forEach(function (input) {
            q[input.dataset.k] = input.value.trim();
          });
          q.warnings = [];
          S.emit('questions');
          syncAll();
          U.toast('Saved question #' + q.id + ' ✓');
        } }
    ]);
  }

  /* ============================== step 3 ============================== */
  function buildStep3() {
    fillSelect(el.trim, C.TRIM_ORDER.map(function (id) {
      return { id: id, label: C.TRIMS[id].label + (C.TRIMS[id].note ? ' — ' + C.TRIMS[id].note : '') };
    }), function (t) { return t.label; });

    bindText(el.title, 'title');
    bindText(el.subtitle, 'subtitle');
    bindText(el.author, 'author');

    el.year.addEventListener('change', function () {
      S.data.book.year = parseInt(el.year.value, 10) || new Date().getFullYear();
      S.emit('book');
      scheduleLayout();
    });

    el.trim.addEventListener('change', function () {
      var id = el.trim.value;
      var patch = { trim: id };
      if (!S.data.layout.perPageTouched) patch.perPage = C.TRIMS[id].perPage;
      S.update('layout', patch, 'layout');
      syncStep3();
      scheduleLayout();
    });

    $$('#f-perpage button').forEach(function (b) {
      b.addEventListener('click', function () {
        S.update('layout', { perPage: parseInt(b.dataset.value, 10), perPageTouched: true }, 'layout');
        syncStep3();
        scheduleLayout();
      });
    });

    [['s-howto', 'howTo'], ['s-answers', 'answers'], ['s-chapters', 'chapters'],
     ['s-yourturn', 'yourTurn'], ['s-thankyou', 'thankYou']].forEach(function (pair) {
      $('#' + pair[0]).addEventListener('change', function (e) {
        S.data.layout.sections[pair[1]] = e.target.checked;
        S.emit('layout');
        scheduleLayout();
      });
    });

    el.checkboxStyle.addEventListener('change', function () {
      S.update('layout', { checkboxStyle: el.checkboxStyle.value }, 'layout');
      scheduleLayout();
    });
    el.answersPlacement.addEventListener('change', function () {
      S.update('layout', { answersPlacement: el.answersPlacement.value }, 'layout');
      scheduleLayout();
    });
    $('#f-chapter-odd').addEventListener('change', function (e) {
      S.update('layout', { chapterOnOdd: e.target.checked }, 'layout');
      scheduleLayout();
    });

    $('#btn-download').addEventListener('click', downloadPdf);
    $('#btn-download-top').addEventListener('click', downloadPdf);
  }

  function bindText(input, key) {
    input.addEventListener('input', function () {
      S.data.book[key] = input.value;
      scheduleLayout();
    });
  }

  function syncStep3() {
    var d = S.data;
    el.title.value = d.book.title;
    el.subtitle.value = d.book.subtitle;
    el.author.value = d.book.author;
    el.year.value = d.book.year;
    el.trim.value = d.layout.trim;
    el.checkboxStyle.value = d.layout.checkboxStyle;
    el.answersPlacement.value = d.layout.answersPlacement;
    $('#f-chapter-odd').checked = !!d.layout.chapterOnOdd;

    $$('#f-perpage button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(parseInt(b.dataset.value, 10) === d.layout.perPage));
    });
    $('#s-howto').checked = d.layout.sections.howTo;
    $('#s-answers').checked = d.layout.sections.answers;
    $('#s-chapters').checked = d.layout.sections.chapters;
    $('#s-yourturn').checked = d.layout.sections.yourTurn;
    $('#s-thankyou').checked = d.layout.sections.thankYou;

    var ideas = $('#title-ideas');
    ideas.innerHTML = '';
    d.book.titleIdeas.forEach(function (idea) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<strong>' + escapeHtml(idea.title) + '</strong><br>' + escapeHtml(idea.subtitle);
      b.addEventListener('click', function () {
        S.data.book.title = idea.title;
        S.data.book.subtitle = idea.subtitle;
        S.emit('book');
        syncStep3();
        scheduleLayout();
      });
      ideas.appendChild(b);
    });
  }

  function renderKdpInfo() {
    var box = $('#kdp-info');
    if (!currentBook) {
      box.innerHTML = '<span class="note">Add questions to see the page count.</span>';
      return;
    }
    var a = currentBook.audit;
    var html = '<strong>' + count(a.pageCount, 'page') + '</strong> · Gutter ' + a.gutter.toFixed(3) +
      '" · Outside ' + a.outside.toFixed(2) + '" · ' + a.trimLabel + ' · ' +
      (a.ok ? '<span class="ok">✓ Meets KDP rules</span>' : '<span class="bad">✗ Does not meet KDP rules</span>');

    var problems = a.errors.concat(a.warnings, currentBook.warnings || []);
    if (problems.length) {
      html += '<ul>' + problems.slice(0, 6).map(function (p) {
        return '<li>' + escapeHtml(p) + '</li>';
      }).join('') + '</ul>';
    }
    box.innerHTML = html;
  }

  /* ============================== preview ============================= */
  function scheduleLayout() {
    if (layoutTimer) clearTimeout(layoutTimer);
    $('#layout-status').textContent = 'Laying out…';
    layoutTimer = setTimeout(runLayout, 300);
  }
  U.scheduleLayout = scheduleLayout;

  function runLayout() {
    layoutTimer = null;
    if (!S.data.questions.length) {
      currentBook = null;
      $('#empty').hidden = false;
      $('#preview').innerHTML = '';
      $('#layout-status').textContent = '';
      refreshBadges();
      renderKdpInfo();
      updatePageIndicator();
      return;
    }
    $('#empty').hidden = true;
    try {
      currentBook = W.layout.build(S.data);
    } catch (err) {
      console.error(err);
      $('#layout-status').textContent = '';
      U.toast('Layout failed: ' + err.message, 'error');
      return;
    }
    /* Stay on the page being read. Editing a question three quarters in
       should not throw the reader back to the title page. */
    S.data.ui.page = W.preview.clampPage(currentBook, S.data.ui.page);
    W.preview.render($('#preview'), currentBook, S.data.ui);
    $('#layout-status').textContent = '';
    updatePageIndicator();
    refreshBadges();
    renderKdpInfo();
  }

  function updatePageIndicator() {
    var total = currentBook ? currentBook.pages.length : 1;
    var no = currentBook ? W.preview.clampPage(currentBook, S.data.ui.page) : 1;
    el.pageInput.value = String(no);
    el.pageInput.max = String(total);
    el.pageInput.disabled = !currentBook;
    $('#page-total').textContent = 'of ' + total;
    $('#btn-first-page').disabled = $('#btn-prev-page').disabled = !currentBook || no <= 1;
    $('#btn-last-page').disabled = $('#btn-next-page').disabled = !currentBook || no >= total;
  }

  function buildToolbar() {
    $('#btn-first-page').addEventListener('click', function () { showPage(1); });
    $('#btn-prev-page').addEventListener('click', function () { stepPage(-1); });
    $('#btn-next-page').addEventListener('click', function () { stepPage(1); });
    $('#btn-last-page').addEventListener('click', function () {
      showPage(currentBook ? currentBook.pages.length : 1);
    });

    /* Typing a number jumps straight there; leaving the box puts back
       whatever page is actually on screen, so it can never lie. */
    el.pageInput.addEventListener('change', function () { showPage(el.pageInput.value); });
    el.pageInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); showPage(el.pageInput.value); }
    });
    el.pageInput.addEventListener('blur', function () { updatePageIndicator(); });

    $('#btn-zoom-in').addEventListener('click', function () { setZoom(S.data.ui.zoom + 0.1); });
    $('#btn-zoom-out').addEventListener('click', function () { setZoom(S.data.ui.zoom - 0.1); });
    $('#f-show-margins').addEventListener('change', function (e) {
      S.data.ui.showMargins = e.target.checked;
      redrawPage();
    });
    $('#btn-sample').addEventListener('click', loadSample);
  }

  /* Shows page `no`, clamped to a page the book actually has. */
  function showPage(no) {
    if (!currentBook) { updatePageIndicator(); return; }
    S.data.ui.page = W.preview.clampPage(currentBook, no);
    redrawPage();
  }

  function stepPage(delta) {
    if (!currentBook) return;
    showPage((S.data.ui.page || 1) + delta);
  }

  function redrawPage() {
    if (!currentBook) return;
    W.preview.render($('#preview'), currentBook, S.data.ui);
    updatePageIndicator();
  }

  function setZoom(z) {
    S.data.ui.zoom = clamp(Math.round(z * 10) / 10, 0.3, 2);
    $('#zoom-indicator').textContent = Math.round(S.data.ui.zoom * 100) + '%';
    redrawPage();
  }

  function loadSample() {
    if (!W.sample) return;
    S.data.questions = W.sample.questions.map(function (q) {
      return JSON.parse(JSON.stringify(q));
    });
    S.data.book.titleIdeas = W.sample.titleIdeas.slice();
    if (!S.data.book.title) S.data.book.title = W.sample.titleIdeas[0].title;
    if (!S.data.book.subtitle) S.data.book.subtitle = W.sample.titleIdeas[0].subtitle;
    S.data.setup.count = Math.max(S.data.setup.count, W.sample.questions.length);
    S.emit('sample');
    syncAll();
    U.openStep(3);
    U.toast('Loaded ' + count(W.sample.questions.length, 'sample question') + ' ✓');
  }

  /* ================================ PDF =============================== */
  var busy = false;

  function downloadPdf() {
    if (busy) return;
    if (!S.data.questions.length) {
      U.toast('There are no questions to put in a book yet.', 'warn');
      return;
    }
    if (layoutTimer) { clearTimeout(layoutTimer); runLayout(); }
    if (!currentBook) return;

    var audit = currentBook.audit;
    if (!audit.ok) {
      U.confirm('This book does not meet the KDP rules. ' + audit.errors.join(' ') +
        ' Download the PDF anyway?', doBuild, 'Download anyway');
      return;
    }
    doBuild();
  }

  function doBuild() {
    busy = true;
    var bar = $('#pdf-progress');
    bar.hidden = false;
    $('#btn-download').disabled = true;
    $('#btn-download-top').disabled = true;

    W.pdf.build(currentBook, S.data.book, function (done, total) {
      $('#pdf-fill').style.width = Math.round(done / total * 100) + '%';
      $('#pdf-text').textContent = 'Building page ' + done + ' of ' + total + '…';
    }).then(function (doc) {
      var name = W.pdf.filename(S.data.book, S.data.layout.trim);
      W.pdf.save(doc, name);
      $('#pdf-text').textContent = 'Xong: ' + name;
      showKdpChecklist(name);
    }).catch(function (err) {
      console.error(err);
      U.toast('Could not build the PDF: ' + err.message, 'error');
    }).then(function () {
      busy = false;
      $('#btn-download').disabled = false;
      $('#btn-download-top').disabled = false;
      setTimeout(function () { bar.hidden = true; }, 4000);
    });
  }

  function showKdpChecklist(name) {
    var a = currentBook.audit;
    var html =
      '<p class="note"><code>' + escapeHtml(name) + '</code> has been downloaded. ' +
      'When you upload it to KDP, choose exactly these settings:</p>' +
      '<ul class="note" style="padding-left:18px">' +
      '<li>Trim size: <strong>' + a.trimLabel + '</strong></li>' +
      '<li>Bleed: <strong>No bleed</strong></li>' +
      '<li>Interior: <strong>Black &amp; white</strong>, white or cream paper</li>' +
      '<li>Low-content book: <strong>No</strong> — this book has real written content</li>' +
      '<li>Page count for the cover spine calculator: <strong>' + a.pageCount + '</strong></li>' +
      '</ul>' +
      '<p class="note">After uploading, run the KDP <strong>Print Previewer</strong> and check there are no margin warnings.</p>';
    U.modal('PDF downloaded ✓', html, [{ label: 'Got it', primary: true }]);
  }

  /* ============================== helpers ============================= */
  function fillSelect(select, list, labelFn) {
    select.innerHTML = '';
    list.forEach(function (item) {
      var o = document.createElement('option');
      o.value = item.id;
      o.textContent = labelFn(item);
      select.appendChild(o);
    });
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* "1 question" / "2 questions" */
  function count(n, word, plural) {
    return n + ' ' + (n === 1 ? word : (plural || word + 's'));
  }

  function trimTo(s, n) {
    s = String(s || '');
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }

  function syncAll() {
    syncStep1();
    syncStep3();
    updateProgress();
    renderQuestionList();
    refreshBadges();
    scheduleLayout();
  }
  U.syncAll = syncAll;

  /* =============================== init =============================== */
  U.init = function () {
    el = {
      audience: $('#f-audience'), theme: $('#f-theme'), customTheme: $('#f-custom-theme'),
      count: $('#f-count'), countChips: $('#count-chips'), style: $('#f-style'),
      language: $('#f-language'), batch: $('#f-batch'), promptText: $('#prompt-text'),
      pasteBox: $('#paste-box'), title: $('#f-title'), subtitle: $('#f-subtitle'),
      author: $('#f-author'), year: $('#f-year'), trim: $('#f-trim'),
      checkboxStyle: $('#f-checkbox-style'), answersPlacement: $('#f-answers-placement'),
      pageInput: $('#f-page')
    };

    buildStep1();
    buildPromptHalf();
    buildPasteHalf();
    buildStep3();
    buildToolbar();

    $$('.step__head').forEach(function (head) {
      head.addEventListener('click', function () {
        var no = parseInt(head.parentElement.dataset.step, 10);
        U.openStep(S.data.ui.step === no ? 0 : no);
      });
    });

    $('#btn-new-project').addEventListener('click', function () {
      U.confirm('Start a new project? Every question and setting here will be deleted.', function () {
        S.reset();
        selected = {};
        currentBook = null;
        syncAll();
        U.openStep(1);
        U.toast('New project started.');
      }, 'New project');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { U.closeModal(); return; }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (!$('#modal').hidden) return;
      // Never steal the arrow keys from something the user is typing in.
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                t.tagName === 'SELECT' || t.isContentEditable)) return;
      stepPage(e.key === 'ArrowRight' ? 1 : -1);
    });

    $$('.hint').forEach(function (b) { b.title = b.dataset.hint; });

    $('#f-show-margins').checked = !!S.data.ui.showMargins;
    $('#zoom-indicator').textContent = Math.round((S.data.ui.zoom || 1) * 100) + '%';
    updatePageIndicator();

    syncAll();
    buildPrompt();
    U.openStep(S.data.ui.step || 1);
  };
})();
