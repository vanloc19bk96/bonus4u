/*
 * The four steps in the left sidebar: Setup, Story plan, Chapters, Review and download.
 * The sidebar is rebuilt after every change; focus, text selection and open sections are restored.
 */
(function (root) {
  'use strict';
  var Cozy = root.Cozy;
  var D = Cozy.dom, h = D.h, B = Cozy.book, S = Cozy.store, U = Cozy.util;
  var App = function () { return Cozy.app; };

  var rebuildSoon = D.debounce(function () { App().rebuild(); }, 300);
  var pasteTimers = {};

  var STEP_META = [
    { id: 'setup', n: 1, title: 'Setup' },
    { id: 'plan', n: 2, title: 'Story plan' },
    { id: 'chapters', n: 3, title: 'Chapters' },
    { id: 'review', n: 4, title: 'Review and download' }
  ];
  var CHIP = { todo: 'To do', done: 'Done', fix: 'Needs fixing' };
  var LOCK_SVG = '<svg viewBox="0 0 12 14" width="10" height="12" aria-hidden="true"><rect x="1" y="6" width="10" height="7.5" rx="1.5" fill="currentColor"/><path d="M3.3 6V4.3a2.7 2.7 0 0 1 5.4 0V6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

  // Three states only (To do, Done, Needs fixing); a locked step shows "To do" with a lock.
  function chip(state, locked) {
    if (locked) {
      var c = h('span', { class: 'chip locked', title: 'Finish the step before this one first' });
      c.innerHTML = LOCK_SVG + ' To do<span class="sr-only"> (locked until the step before is done)</span>';
      return c;
    }
    return h('span', { class: 'chip ' + state }, CHIP[state]);
  }

  // ---------- generic bits ----------
  function bindText(input, apply, opts) {
    opts = opts || {};
    var snap = null;
    input.addEventListener('focus', function () { snap = S.snapshot(App().state.project); });
    input.addEventListener('input', function () {
      apply(App().state.project, input.value);
      App().state.project.downloaded = false;
      App().save();
      if (opts.rebuild !== false) rebuildSoon();
    });
    input.addEventListener('change', function () {
      if (snap && snap !== S.snapshot(App().state.project)) S.pushUndo(snap);
      snap = S.snapshot(App().state.project);
      rebuildSoon.flush();
    });
  }

  function field(label, input, hint, extra) {
    var id = input.id;
    return h('div', { class: 'field' }, [h('label', { for: id }, label), input, extra || null, hint ? h('div', { class: 'hint', id: id + 'Hint' }, hint) : null]);
  }

  function detailsKeep(id, summary, children, cls, defaultOpen) {
    var ui = App().ui;
    var open = ui.open[id] != null ? ui.open[id] : !!defaultOpen;
    var d = h('details', { class: cls || 'advanced', id: id, open: open });
    d.appendChild(h('summary', null, summary));
    D.append(d, children);
    d.addEventListener('toggle', function () { ui.open[id] = d.open; });
    return d;
  }

  function issueList(issues, level) {
    return h('ul', null, issues.filter(function (i) { return i.level === level; }).map(function (i) {
      var li = h('li', null, i.text);
      if (i.n && App().state.project.chapters[i.n]) {
        li.appendChild(document.createTextNode(' '));
        li.appendChild(h('button', { type: 'button', class: 'link-btn', onclick: function () { Cozy.editor.open(i.n); } }, 'Open chapter ' + i.n));
      }
      return li;
    }));
  }

  function fixedNotes(issues, id) {
    var fixed = issues.filter(function (i) { return i.level === 'fixed'; });
    if (!fixed.length) return null;
    return detailsKeep(id, U.plural(fixed.length, 'small fix was', 'small fixes were') + ' made automatically',
      h('ul', null, fixed.map(function (i) { return h('li', null, i.text); })), 'fixed-notes');
  }

  function pasteBox(id, label, value, onText, rows) {
    var ta = h('textarea', { class: 'textarea paste', id: id, rows: rows || 5, spellcheck: 'false', placeholder: 'Paste the whole reply here. Extra text around it is fine.' });
    ta.value = value || '';
    ta.addEventListener('input', function () {
      clearTimeout(pasteTimers[id]);
      pasteTimers[id] = setTimeout(function () { onText(ta.value); }, 350);
    });
    return h('div', { class: 'field' }, [h('label', { for: id }, label), ta]);
  }

  function aiLinks() {
    return h('p', { class: 'ai-links' }, ['Open a new chat: ',
      h('a', { href: 'https://chatgpt.com/', target: '_blank', rel: 'noopener' }, 'ChatGPT'), ' · ',
      h('a', { href: 'https://claude.ai/new', target: '_blank', rel: 'noopener' }, 'Claude'), ' · ',
      h('a', { href: 'https://gemini.google.com/app', target: '_blank', rel: 'noopener' }, 'Gemini')]);
  }

  function promptPeek(id, getText) {
    var ta = h('textarea', { class: 'textarea', readonly: true, 'aria-label': 'Prompt text' });
    var d = detailsKeep(id, 'Read the prompt', ta, 'peek');
    function fill() { if (d.open) ta.value = getText(); }
    d.addEventListener('toggle', fill);
    fill();
    return d;
  }

  // ---------- step 1: setup ----------
  function setupBody() {
    var p = App().state.project, s = p.setup, d = App().state.d;
    var body = [];
    var hasStory = !!p.plan || Object.keys(p.chapters).length > 0;
    body.push(h('p', { class: 'lead' }, 'Two quick choices and you are ready. Everything else already has a good default.'));

    var pen = h('input', { class: 'input' + (p.setupTried && !s.penName.trim() ? ' invalid' : ''), id: 'fPen', value: s.penName, autocomplete: 'off', 'aria-required': 'true', placeholder: 'e.g. Margaret Hollis' });
    bindText(pen, function (pp, v) { pp.setup.penName = v; });
    body.push(field(h('span', null, ['Pen name ', h('span', { class: 'req', 'aria-hidden': 'true' }, '*')]), pen,
      p.setupTried && !s.penName.trim() ? 'Add a pen name to continue. It is printed on the title page.' : 'Printed on the title page and used as the author on Amazon.'));

    var theme = h('input', { class: 'input', id: 'fTheme', value: s.theme, autocomplete: 'off', disabled: hasStory });
    bindText(theme, function (pp, v) { pp.setup.theme = v; }, { rebuild: false });
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Theme ideas' },
      Cozy.themes.CHIPS.concat(['Surprise me']).map(function (c) {
        var pressed = String(s.theme).toLowerCase() === c.toLowerCase();
        return h('button', { type: 'button', class: 'chip-btn', 'aria-pressed': pressed ? 'true' : 'false', disabled: hasStory, onclick: function () {
          App().commit(function (pp) { pp.setup.theme = c; });
        } }, c);
      }));
    var themeHint = Cozy.themes.isSurprise(s.theme)
      ? 'The app will pick a cozy theme for you: ' + Cozy.themes.resolve(s.theme, p.seed).toLowerCase() + '.'
      : 'Any short idea works, like “a lighthouse tea room”.';
    var lockNote = hasStory ? h('div', { class: 'locked-note' }, ['Locked because your story is built on it.',
      h('button', { type: 'button', class: 'link-btn', onclick: function () { App().unlockProtected(); } }, 'Change')]) : null;
    body.push(h('div', { class: 'field' }, [h('label', { for: 'fTheme' }, 'Theme'), theme, chips, lockNote, h('div', { class: 'hint' }, themeHint)]));

    var title = h('input', { class: 'input', id: 'fTitle', value: s.bookTitle, autocomplete: 'off', placeholder: 'Leave blank and the AI suggests 3', maxlength: 80 });
    bindText(title, function (pp, v) { pp.setup.bookTitle = v; if (pp.plan && v.trim()) pp.chosenTitle = v.trim(); });
    body.push(field(h('span', null, ['Book title ', h('span', { class: 'hint' }, '(optional)')]), title));

    // advanced
    var adv = [];
    var chapters = h('input', { class: 'input', id: 'fChapters', type: 'number', min: 30, max: 60, step: 1, value: s.chapters, disabled: hasStory });
    chapters.addEventListener('change', function () {
      var v = U.clamp(parseInt(chapters.value, 10) || 50, 30, 60);
      App().commit(function (pp) { pp.setup.chapters = v; });
    });
    adv.push(field('Chapters', chapters, null, hasStory ? h('div', { class: 'locked-note' }, ['Locked because your story is built on it.',
      h('button', { type: 'button', class: 'link-btn', onclick: function () { App().unlockProtected(); } }, 'Change')]) : null));
    adv.push(h('div', { class: 'derived', 'aria-live': 'polite' }, d.C + ' hidden clues (42% of the chapters) · ' + d.pages.total + ' pages · inside margin ' + d.insideMarginIn + ' in'));

    var wpp = h('select', { class: 'input', id: 'fWords' }, U.range(8, 15).map(function (n) { return h('option', { value: n, selected: n === s.wordsPerPuzzle }, n + ' words'); }));
    wpp.addEventListener('change', function () { App().commit(function (pp) { pp.setup.wordsPerPuzzle = +wpp.value; pp.downloaded = false; }); });
    var grid = h('select', { class: 'input', id: 'fGrid' }, U.range(11, 15).map(function (n) { return h('option', { value: n, selected: n === s.gridSize }, n + ' x ' + n); }));
    grid.addEventListener('change', function () { App().commit(function (pp) { pp.setup.gridSize = +grid.value; pp.downloaded = false; }); });
    adv.push(h('div', { class: 'row' }, [field('Words per puzzle', wpp), field('Grid size', grid)]));

    var diffs = [['easy', 'Easy', 'Across and down only'], ['medium', 'Medium', 'Adds diagonals, all reading forward'], ['hard', 'Hard', 'All 8 directions, including backward'], ['mix', 'Mix', 'You choose the share of Easy, Medium and Hard puzzles']];
    adv.push(h('div', { class: 'field', role: 'radiogroup', 'aria-labelledby': 'diffLabel' }, [h('span', { class: 'field-label', id: 'diffLabel' }, 'Difficulty'),
      h('div', { class: 'radio-list' }, diffs.map(function (x) {
        var r = h('input', { type: 'radio', name: 'difficulty', value: x[0], checked: s.difficulty === x[0] });
        r.addEventListener('change', function () { if (r.checked) App().commit(function (pp) { pp.setup.difficulty = x[0]; pp.downloaded = false; }); });
        return h('label', { class: 'radio' }, [r, h('span', null, [x[1], h('small', null, x[2])])]);
      }))]));
    if (s.difficulty === 'mix') adv = adv.concat(mixFields(p, d));

    var series = h('input', { class: 'input', id: 'fSeries', value: s.seriesName, placeholder: 'e.g. Rolling Pin Mysteries' });
    bindText(series, function (pp, v) { pp.setup.seriesName = v; });
    var num = h('input', { class: 'input', id: 'fBookNo', value: s.bookNumber, inputmode: 'numeric', placeholder: '1' });
    bindText(num, function (pp, v) { pp.setup.bookNumber = v.replace(/[^0-9]/g, '').slice(0, 3); });
    adv.push(h('div', { class: 'row' }, [field('Series name', series), h('div', { style: 'flex:0 0 90px' }, field('Book no.', num))]));

    var imprint = h('input', { class: 'input', id: 'fImprint', value: s.imprint, placeholder: 'Optional' });
    bindText(imprint, function (pp, v) { pp.setup.imprint = v; });
    var isbn = h('input', { class: 'input', id: 'fIsbn', value: s.isbn, placeholder: 'Optional; KDP can assign a free one' });
    bindText(isbn, function (pp, v) { pp.setup.isbn = v.replace(/[^0-9Xx\- ]/g, '').slice(0, 20); });
    adv.push(field('Publisher name', imprint, 'Printed on the title and copyright pages if filled in.'));
    adv.push(field('ISBN', isbn, 'Printed on the copyright page. Leave blank if KDP assigns one.'));
    var year = h('input', { class: 'input', id: 'fYear', type: 'number', min: 2000, max: 2100, value: s.year });
    year.addEventListener('change', function () { var v = U.clamp(parseInt(year.value, 10) || new Date().getFullYear(), 2000, 2100); App().commit(function (pp) { pp.setup.year = v; }); });
    adv.push(h('div', { style: 'max-width:150px' }, field('Copyright year', year)));

    var pcl = h('input', { type: 'checkbox', id: 'fClueList', checked: s.printClueList });
    pcl.addEventListener('change', function () { App().commit(function (pp) { pp.setup.printClueList = pcl.checked; pp.downloaded = false; }); });
    adv.push(h('div', { class: 'field' }, h('label', { class: 'check', for: 'fClueList' }, [pcl, h('span', null, ['Print the clue list under the final puzzle',
      h('small', { class: 'hint', style: 'display:block' }, 'Off by default: readers use the clues they collected in the Detective’s Notebook, which keeps the hunt meaningful. The solutions always list them.')])])));
    adv.push(h('div', { class: 'derived' }, 'Fixed for KDP: 6 x 9 in trim · black and white on white paper · no bleed'));
    body.push(detailsKeep('advSetup', 'Advanced', adv));

    body.push(h('button', { type: 'button', class: 'btn btn-primary block', onclick: function () {
      var su = App().state.project.setup;
      if (!su.penName.trim()) {
        App().state.project.setupTried = true;
        render();
        var el = document.getElementById('fPen'); if (el) el.focus();
        return;
      }
      if (su.difficulty === 'mix' && B.mixTotal(su.mix) !== 100) {
        App().ui.open.advSetup = true;
        render();
        var mx = document.getElementById('fMix-easy'); if (mx) mx.focus();
        return;
      }
      App().openStep('plan');
    } }, 'Continue to story plan'));
    return body;
  }

  function mixFields(p, d) {
    var s = p.setup;
    var total = B.mixTotal(s.mix);
    var bad = total !== 100;
    var inputs = [['easy', 'Easy %'], ['medium', 'Medium %'], ['hard', 'Hard %']].map(function (x) {
      var inp = h('input', { class: 'input' + (bad ? ' invalid' : ''), id: 'fMix-' + x[0], type: 'number', min: 0, max: 100, step: 5, value: s.mix[x[0]], 'aria-describedby': 'mixLine' });
      inp.addEventListener('change', function () {
        var v = U.clamp(Math.round((parseInt(inp.value, 10) || 0) / 5) * 5, 0, 100);
        App().commit(function (pp) { var m = Object.assign({}, pp.setup.mix); m[x[0]] = v; pp.setup.mix = m; pp.downloaded = false; });
      });
      return field(x[1], inp);
    });
    var c = d.mixCounts;
    var line = bad
      ? 'The three shares add up to ' + total + '%, ' + Math.abs(total - 100) + (total > 100 ? '% too much' : '% short') + '. Make them add up to 100%.'
      : c.easy + ' Easy, ' + c.medium + ' Medium, ' + c.hard + ' Hard. The puzzles get harder as the story goes on; the final puzzle is ' + d.finalLevel.charAt(0).toUpperCase() + d.finalLevel.slice(1) + '.';
    return [h('div', { class: 'row' }, inputs), h('div', { class: 'derived' + (bad ? ' bad' : ''), id: 'mixLine', 'aria-live': 'polite' }, line)];
  }

  // ---------- step 2: story plan ----------
  function planBody() {
    var st = App().state, p = st.project, d = st.d;
    var body = [];
    body.push(h('ol', { class: 'howto-mini' }, [
      h('li', null, 'Copy the prompt.'),
      h('li', null, 'Paste it into a new chat in ChatGPT, Claude or Gemini.'),
      h('li', null, 'Copy the AI’s whole reply and paste it below.')
    ]));
    body.push(h('div', { class: 'actions' }, D.copyButton('Copy prompt', function () { return Cozy.prompts.planPrompt(p, d); }, 'btn btn-primary')));
    body.push(aiLinks());
    body.push(promptPeek('peekPlan', function () { return Cozy.prompts.planPrompt(p, d); }));
    body.push(pasteBox('planPaste', 'Paste the AI’s answer here', p.planText, function (v) { App().pastePlan(v, false); }));

    var res = h('div', { class: 'result', 'aria-live': 'polite' });
    var check = p.planCheck;
    if (check && check.issues) {
      var errs = check.issues.filter(function (i) { return i.level === 'error'; });
      var warns = check.issues.filter(function (i) { return i.level === 'warning'; });
      if (errs.length && !p.plan) {
        var errBox = h('div', { class: 'msg err' }, [h('strong', null, 'This answer needs a fix before you go on:'), issueList(check.issues, 'error')]);
        if (errs.every(function (e) { return e.fix !== 'none'; })) {
          errBox.appendChild(h('div', { class: 'actions' }, D.copyButton('Copy fix prompt', function () {
            return Cozy.prompts.planFixPrompt(p, d, check.issues, p.planDraft || {});
          }, 'btn small')));
          errBox.appendChild(h('div', { class: 'fix-box' }, pasteBox('planFix', 'Then paste the AI’s fix here', '', function (v) { App().pastePlan(v, true); }, 3)));
        }
        res.appendChild(errBox);
      } else if (p.plan) {
        res.appendChild(h('div', { class: 'msg ok' }, 'Story plan checked: ' + p.plan.outline.length + ' chapters, ' + p.plan.suspects.length + ' suspects and ' + p.plan.clues.length + ' hidden clues. Next: step 3 (Chapters). The puzzles are built from the chapter text, so they appear after you paste each part there.'));
      }
      var fn = fixedNotes(check.issues, 'planFixed');
      if (fn) res.appendChild(fn);
      if (warns.length) res.appendChild(h('div', { class: 'msg warn' }, [h('strong', null, 'Worth a look:'), issueList(check.issues, 'warning')]));
    }
    body.push(res);
    if (p.plan) body.push(planSummary());
    body.push(h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-primary block', disabled: !p.plan, onclick: function () { App().openStep('chapters'); } }, 'Continue to chapters')));
    return body;
  }

  function planSummary() {
    var p = App().state.project, plan = p.plan;
    var sum = h('div', { class: 'summary' });
    sum.appendChild(h('h3', null, 'Choose your title'));
    var opts = plan.titles.slice();
    if (p.setup.bookTitle && opts.indexOf(p.setup.bookTitle.trim()) === -1) opts.unshift(p.setup.bookTitle.trim());
    var current = B.title(p);
    var custom = opts.indexOf(current) === -1;
    var group = h('div', { class: 'title-options', role: 'radiogroup', 'aria-label': 'Book title' });
    opts.forEach(function (t, i) {
      var r = h('input', { type: 'radio', name: 'titlePick', id: 'tp' + i, checked: !custom && current === t });
      r.addEventListener('change', function () { if (r.checked) App().commit(function (pp) { pp.chosenTitle = t; pp.downloaded = false; }); });
      group.appendChild(h('label', { class: 'radio', for: 'tp' + i }, [r, h('span', null, t)]));
    });
    var cr = h('input', { type: 'radio', name: 'titlePick', id: 'tpCustom', checked: custom });
    var ci = h('input', { class: 'input', id: 'tpCustomText', value: custom ? current : '', placeholder: 'Or type your own title', maxlength: 80 });
    bindText(ci, function (pp, v) { if (v.trim()) pp.chosenTitle = v.trim(); });
    ci.addEventListener('focus', function () { cr.checked = true; });
    cr.addEventListener('change', function () { if (cr.checked) ci.focus(); });
    group.appendChild(h('label', { class: 'radio', for: 'tpCustom' }, [cr, ci]));
    sum.appendChild(group);

    var sub = h('input', { class: 'input', id: 'fSubtitle', value: B.subtitle(p), maxlength: 200 });
    bindText(sub, function (pp, v) { pp.subtitleOverride = v.trim() === pp.plan.subtitle ? '' : v; });
    sum.appendChild(h('div', { class: 'field', style: 'margin-top:10px' }, [h('label', { for: 'fSubtitle' }, 'Subtitle'), sub]));

    sum.appendChild(h('h3', null, 'The sleuth'));
    sum.appendChild(h('p', null, [h('strong', null, plan.sleuth.name), (plan.sleuth.age ? ', ' + plan.sleuth.age : '') + (plan.sleuth.job ? ', ' + plan.sleuth.job : '')]));
    if (plan.sleuth.trait) sum.appendChild(h('p', { class: 'hint' }, plan.sleuth.trait));
    sum.appendChild(h('h3', null, 'Setting'));
    sum.appendChild(h('p', null, plan.setting));
    sum.appendChild(h('h3', null, 'The victim'));
    sum.appendChild(h('p', null, [h('strong', null, plan.victim.name), plan.victim.who ? ', ' + plan.victim.who : '']));
    sum.appendChild(h('h3', null, 'Suspects'));
    sum.appendChild(h('ul', { class: 'people' }, plan.suspects.map(function (s) {
      return h('li', null, [h('strong', null, s.name), s.name === plan.killer ? h('span', { class: 'badge-killer' }, 'the killer · secret') : null,
        h('div', { class: 'who' }, [s.role, s.motive ? ' — ' + s.motive : ''].join(''))]);
    })));
    sum.appendChild(h('h3', null, 'Hidden clues'));
    sum.appendChild(h('div', { class: 'clue-list' }, plan.clues.map(function (c) { return h('span', null, 'Ch. ' + c.chapter + ' · ' + (c.display || c.word)); })));
    var clueSet = {};
    plan.clues.forEach(function (c) { clueSet[c.chapter] = c.display || c.word; });
    sum.appendChild(detailsKeep('outlineList', 'Chapter outline (' + plan.outline.length + ')', h('ol', { class: 'outline-list' }, plan.outline.map(function (o) {
      return h('li', null, [h('strong', null, o.title), clueSet[o.n] ? h('span', { class: 'clue-tag' }, ' · clue: ' + clueSet[o.n]) : null, h('div', { class: 'who' }, o.beat)]);
    })), 'peek'));
    return sum;
  }

  // ---------- step 3: chapters ----------
  function chaptersBody() {
    var st = App().state, p = st.project, d = st.d;
    var body = [];
    var have = 0;
    for (var n = 1; n <= d.N; n++) if (p.chapters[n]) have++;
    body.push(h('p', { class: 'lead' }, 'The chapters come in ' + d.batches.length + ' parts of up to 10, so every AI can answer in full. After each paste, the puzzles for those chapters appear in the preview.'));
    body.push(h('div', { class: 'progress-label' }, [h('span', null, have + ' of ' + d.N + ' chapters'),
      st.building ? h('span', null, 'Building puzzles…') : (p.epilogue ? h('span', null, 'Epilogue ✓') : null)]));
    body.push(h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': d.N, 'aria-valuenow': have, 'aria-label': 'Chapters added' },
      h('span', { style: 'width:' + Math.round(have / d.N * 100) + '%' })));

    var openBi = App().ui.openBatch;
    if (openBi == null || openBi >= d.batches.length) {
      openBi = st.batches.findIndex(function (b) { return b.state !== 'done'; });
      if (openBi < 0) openBi = -1;
    }
    d.batches.forEach(function (b, bi) {
      var status = st.batches[bi] || { state: 'todo', issues: [] };
      var locked = bi > 0 && (!st.batches[bi - 1] || st.batches[bi - 1].have === 0);
      var isOpen = bi === openBi && !locked;
      var wrap = h('div', { class: 'batch' + (isOpen ? ' open' : ''), id: 'batch-' + bi });
      var isLast = bi === d.batches.length - 1;
      var head = h('button', { type: 'button', class: 'batch-head', 'aria-expanded': isOpen ? 'true' : 'false', disabled: locked, onclick: function () {
        App().ui.openBatch = isOpen ? -1 : bi; render();
      } }, [h('span', { class: 't' }, 'Part ' + (bi + 1) + ' · Chapters ' + b.from + '–' + b.to + (isLast ? ' + epilogue' : '')), chip(status.state, locked)]);
      wrap.appendChild(head);
      if (locked) wrap.appendChild(h('div', { class: 'batch-body hint' }, 'Paste part ' + bi + ' first, so this part can continue the story.'));
      if (isOpen) wrap.appendChild(batchBody(bi, status));
      body.push(wrap);
    });
    var chState = App().steps().chapters.state;
    body.push(h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-primary block', disabled: chState !== 'done', onclick: function () { App().openStep('review'); } }, 'Continue to review')));
    return body;
  }

  function batchBody(bi, status) {
    var st = App().state, p = st.project, d = st.d;
    var el = h('div', { class: 'batch-body' });
    el.appendChild(h('div', { class: 'actions', style: 'margin-top:0' }, D.copyButton('Copy prompt for part ' + (bi + 1), function () { return Cozy.prompts.batchPrompt(p, d, bi); }, 'btn btn-primary')));
    el.appendChild(aiLinks());
    el.appendChild(promptPeek('peekBatch' + bi, function () { return Cozy.prompts.batchPrompt(p, d, bi); }));
    el.appendChild(pasteBox('batchPaste' + bi, 'Paste the AI’s answer here', p.batchText[bi], function (v) { App().pasteBatch(bi, v, false); }));
    var res = h('div', { class: 'result', 'aria-live': 'polite' });
    var importIssues = (p.batchIssues && p.batchIssues[bi]) || [];
    var all = importIssues.concat(status.issues);
    var errs = all.filter(function (i) { return i.level === 'error'; });
    if (status.have || errs.length) {
      if (errs.length) {
        var box = h('div', { class: 'msg err' }, [h('strong', null, 'Needs a fix:'), issueList(all, 'error')]);
        var fixable = errs.filter(function (e) { return e.fix !== 'none'; });
        if (fixable.length) {
          box.appendChild(h('div', { class: 'actions' }, D.copyButton('Copy fix prompt', function () { return Cozy.prompts.batchFixPrompt(p, d, bi, all); }, 'btn small')));
          box.appendChild(h('div', { class: 'fix-box' }, pasteBox('batchFix' + bi, 'Then paste the AI’s fix here', '', function (v) { App().pasteBatch(bi, v, true); }, 3)));
        }
        res.appendChild(box);
      } else {
        var built = 0;
        for (var n = d.batches[bi].from; n <= d.batches[bi].to; n++) if (st.puzzles[n] && st.puzzles[n].ok) built++;
        res.appendChild(h('div', { class: 'msg ok' }, status.have + ' chapters added and ' + built + ' puzzles built' + (st.building ? ' so far…' : '.') +
          (bi === d.batches.length - 1 && p.epilogue ? ' The epilogue is in too.' : '')));
      }
      var fn = fixedNotes(all, 'batchFixed' + bi);
      if (fn) res.appendChild(fn);
      var warns = all.filter(function (i) { return i.level === 'warning'; });
      if (warns.length) res.appendChild(detailsKeep('batchWarn' + bi, 'Worth a look (' + warns.length + ')', h('div', { class: 'msg warn' }, issueList(all, 'warning')), 'fixed-notes'));
    }
    el.appendChild(res);
    if (status.state === 'done' && bi < d.batches.length - 1) {
      el.appendChild(h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn block', onclick: function () { App().ui.openBatch = bi + 1; render(); } }, 'Next: part ' + (bi + 2))));
    }
    return el;
  }

  // ---------- step 4: review and download ----------
  function reviewBody() {
    var st = App().state, p = st.project, d = st.d;
    var body = [];
    var cl = st.checklist;
    if (!cl) return body;
    body.push(h('p', { class: 'lead' }, cl.ok ? 'Everything checks out. Your interior is ready for Amazon KDP.' : 'A few things need attention before the PDF is ready.'));
    body.push(h('ul', { class: 'checklist' }, cl.items.map(function (it) {
      var detail = h('span', { class: 'detail' }, it.detail || '');
      var li = h('li', { class: it.ok ? 'ok' : 'bad' }, [h('span', { class: 'mark', 'aria-hidden': 'true' }, it.ok ? '✓' : '!'),
        h('span', null, [h('span', { class: 'sr-only' }, it.ok ? 'Passed: ' : 'Needs fixing: '), it.label, detail])]);
      if (!it.ok) {
        var acts = h('span', { class: 'detail' });
        if (it.page) acts.appendChild(h('button', { type: 'button', class: 'link-btn', onclick: function () { Cozy.preview.goTo(it.page); } }, 'Go to page ' + it.page));
        if (it.step) { acts.appendChild(document.createTextNode(' ')); acts.appendChild(h('button', { type: 'button', class: 'link-btn', onclick: function () { App().openStep(it.step); } }, 'Open ' + (it.step === 'setup' ? 'Setup' : it.step === 'plan' ? 'Story plan' : 'Chapters'))); }
        if (it.fixChapter) { acts.appendChild(document.createTextNode(' ')); acts.appendChild(h('button', { type: 'button', class: 'link-btn', onclick: function () { Cozy.editor.open(it.fixChapter); } }, 'Edit chapter ' + it.fixChapter)); }
        li.lastChild.appendChild(acts);
      }
      return li;
    })));
    if (cl.warnings.length) {
      body.push(detailsKeep('reviewWarn', 'Worth a look (' + cl.warnings.length + '), optional', h('ul', { class: 'warn-list' }, cl.warnings.map(function (w) {
        return h('li', null, [w.text, w.page ? ' ' : null, w.page ? h('button', { type: 'button', class: 'link-btn', onclick: function () { Cozy.preview.goTo(w.page); } }, 'Page ' + w.page) : null]);
      })), 'fixed-notes'));
    }
    var pdf = App().ui.pdf;
    body.push(h('button', { type: 'button', class: 'btn btn-primary block', id: 'btnPdf', disabled: !cl.ok || !!pdf || st.building, onclick: App().downloadPdf },
      pdf ? 'Making your PDF…' : 'Download PDF'));
    if (pdf) body.push(h('div', { class: 'download-progress' }, h('div', { class: 'progress' }, h('span', { id: 'pdfBar', style: 'width:' + Math.round(pdf.progress * 100) + '%' }))));
    body.push(h('p', { class: 'hint' }, 'A print-ready ' + st.book.pages.length + '-page, 6 x 9 in interior with every font embedded. It is made right here on your computer; nothing is uploaded.'));

    if (p.downloaded || p.publishOpen) body.push(publishPanel());
    else body.push(h('p', null, h('button', { type: 'button', class: 'link-btn', onclick: function () { App().commit(function (pp) { pp.publishOpen = true; }, { undo: false }); } }, 'Show the publishing details now')));
    body.push(h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn block', onclick: App().nextInSeries }, 'Start the next book in this series')));
    return body;
  }

  function pubRow(k, v, copyVal) {
    return h('div', { class: 'pub-row' }, [h('span', { class: 'k' }, k), h('span', { class: 'v' }, v),
      copyVal === false ? null : D.copyButton('Copy', copyVal != null ? copyVal : v, 'btn small')]);
  }

  function publishPanel() {
    var st = App().state, p = st.project, plan = p.plan;
    var pages = st.book.pages.length;
    var spine = pages * 0.002252;
    var coverW = 0.125 + 6 + spine + 6 + 0.125;
    var el = h('section', { class: 'publish', 'aria-labelledby': 'pubTitle' });
    el.appendChild(h('h3', { id: 'pubTitle' }, 'Publishing details for KDP'));
    el.appendChild(h('p', { class: 'hint' }, 'Copy each value into the matching box of the KDP paperback form.'));
    el.appendChild(h('div', { class: 'pub-group' }, 'Paperback details'));
    el.appendChild(pubRow('Title', B.title(p)));
    el.appendChild(pubRow('Subtitle', B.subtitle(p)));
    if (p.setup.seriesName) el.appendChild(pubRow('Series', p.setup.seriesName + (p.setup.bookNumber ? ' (book ' + p.setup.bookNumber + ')' : ''), p.setup.seriesName));
    el.appendChild(pubRow('Author', p.setup.penName.trim()));
    if (plan.blurb) el.appendChild(pubRow('Description', plan.blurb));
    (plan.keywords || []).forEach(function (k, i) { el.appendChild(pubRow('Keyword ' + (i + 1), k)); });
    el.appendChild(pubRow('Categories', 'Humor & Entertainment › Puzzles & Games › Word Search\nMystery, Thriller & Suspense › Mystery › Cozy\nCrafts, Hobbies & Home › Games & Activities', false));
    el.appendChild(h('div', { class: 'pub-group' }, 'Print options'));
    el.appendChild(pubRow('Ink and paper', 'Black & white interior with white paper', false));
    el.appendChild(pubRow('Trim size', '6 x 9 in (15.24 x 22.86 cm)', false));
    el.appendChild(pubRow('Bleed', 'No bleed', false));
    el.appendChild(pubRow('Cover finish', 'Matte suits cozy covers (your choice)', false));
    el.appendChild(pubRow('Page count', pages + ' pages', String(pages)));
    el.appendChild(h('div', { class: 'pub-group' }, 'Cover (made in another tool)'));
    el.appendChild(pubRow('Spine width', spine.toFixed(3) + ' in (white paper, ' + pages + ' pages)', spine.toFixed(3)));
    el.appendChild(pubRow('Full cover', coverW.toFixed(3) + ' x 9.250 in, including 0.125 in bleed on every side', coverW.toFixed(3) + ' x 9.25 in'));
    el.appendChild(pubRow('Spine text', pages >= 80 ? 'Allowed: KDP permits spine text from 80 pages' : 'Not allowed below 80 pages', false));
    el.appendChild(pubRow('Cover art idea', 'A prompt for an image AI, with space left for your title.', Cozy.prompts.coverPrompt(p)));
    el.appendChild(h('p', { class: 'note' }, [h('strong', null, 'AI disclosure. '),
      'During upload KDP asks whether the book contains AI-generated content. Answer Yes for the text, because the story was written with an AI chat tool. The word search grids were built by this app’s own puzzle generator.']));
    el.appendChild(h('p', { class: 'hint' }, 'Cover sizes follow KDP’s white-paper formula. Check them with KDP’s cover calculator before you order a proof.'));
    return el;
  }

  // ---------- render ----------
  function render() {
    var A = App();
    if (!A || !A.state.d) return;
    var host = document.getElementById('steps');
    var active = document.activeElement;
    var focusId = active && host.contains(active) ? active.id : null;
    var sel = focusId && active.setSelectionRange && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    var innerScroll = focusId && active.scrollTop;
    var scroll = host.scrollTop;
    var steps = A.steps();
    var frag = document.createDocumentFragment();
    STEP_META.forEach(function (m) {
      var s = steps[m.id];
      var open = A.ui.step === m.id && !s.locked;
      var li = h('li', { class: 'step state-' + (s.locked ? 'locked' : s.state) + (open ? ' open' : '') + (s.locked ? ' step-locked' : ''), id: 'step-' + m.id });
      var head = h('button', { type: 'button', class: 'step-head', id: 'head-' + m.id, 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'body-' + m.id, disabled: s.locked,
        onclick: function () { A.openStep(open ? '' : m.id); } },
      [h('span', { class: 'step-num', 'aria-hidden': 'true' }, s.state === 'done' && !s.locked ? '✓' : String(m.n)), h('span', { class: 'step-title' }, m.title), chip(s.state, s.locked)]);
      li.appendChild(head);
      var body = h('div', { class: 'step-body', id: 'body-' + m.id, role: 'region', 'aria-labelledby': 'head-' + m.id, hidden: !open });
      if (open) {
        var content = m.id === 'setup' ? setupBody() : m.id === 'plan' ? planBody() : m.id === 'chapters' ? chaptersBody() : reviewBody();
        D.append(body, content);
      }
      li.appendChild(body);
      frag.appendChild(li);
    });
    host.innerHTML = '';
    host.appendChild(frag);
    host.scrollTop = scroll;
    if (focusId) {
      var el = document.getElementById(focusId);
      if (el && !el.disabled) {
        el.focus({ preventScroll: true });
        if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* number inputs */ } }
        if (innerScroll) el.scrollTop = innerScroll;
      }
    }
  }

  Cozy.sidebar = { render: render };
})(window);
