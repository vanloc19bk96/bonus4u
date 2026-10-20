/* The sidebar: the book steps, built once and refreshed in place so typing never loses focus. */
(function (root) {
  'use strict';
  var CX = root.CX;
  var h = CX.dom.h, U = CX.util;
  var A;                     // CX.app
  var refs = {};
  var openStep = 1;          // the open book step (1-4); the cover step (5) shows with the cover
  var mode = 'book';
  var chipSets = [];         // [{ get, buttons: [{ value, el }] }]
  var ai = { theme: 'everyday', custom: '', count: 10 };

  var AI_LINKS = [
    { name: 'ChatGPT', url: 'https://chatgpt.com/' },
    { name: 'Claude', url: 'https://claude.ai/new' },
    { name: 'Gemini', url: 'https://gemini.google.com/app' }
  ];

  // ---------- small builders ----------
  function field(label, control, hint, required, id) {
    var lab = h('label', { for: id || null }, [label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null]);
    return h('div', { class: 'field' }, [lab, control, hint ? h('div', { class: 'hint' }, hint) : null]);
  }

  // get(): the current value, for the pressed state
  function chips(options, get, onPick) {
    var set = { get: get, buttons: [] };
    var wrap = h('div', { class: 'chips', role: 'group' });
    options.forEach(function (o) {
      var b = h('button', { type: 'button', class: 'chip-btn', 'aria-pressed': 'false', title: o.title || null }, o.label);
      b.addEventListener('click', function () { onPick(o.value); });
      set.buttons.push({ value: o.value, el: b });
      wrap.appendChild(b);
    });
    chipSets.push(set);
    return wrap;
  }

  function checkbox(label, hint, onChange) {
    var box = h('input', { type: 'checkbox' });
    box.addEventListener('change', function () { onChange(box.checked); });
    return { box: box, el: h('div', { class: 'field' }, [h('label', { class: 'check' }, [box, h('span', null, [label, hint ? h('small', null, hint) : null])])]) };
  }

  function setValue(el, v) { if (document.activeElement !== el && el.value !== String(v)) el.value = v; }

  function stepShell(n, title, shown) {
    var num = h('span', { class: 'step-num' }, String(shown));
    var chip = h('span', { class: 'chip todo' }, '');
    var head = h('button', { type: 'button', class: 'step-head', 'aria-expanded': 'false' }, [num, h('span', { class: 'step-title' }, title), chip]);
    var body = h('div', { class: 'step-body', hidden: true });
    var li = h('li', { class: 'step' }, [head, body]);
    head.addEventListener('click', function () { if (n !== 5) setOpen(openStep === n ? 0 : n); });
    return { li: li, head: head, body: body, chip: chip, num: num };
  }

  // The book steps show with the pages, the cover step alone with the cover.
  function setOpen(n) {
    if (n === 5) { A.setView('cover'); return; }
    openStep = n;
    var toPages = mode !== 'book';
    mode = 'book';
    applyMode();
    if (toPages) A.setView('book');
    else A.refresh();
  }

  function applyMode() {
    var cover = mode === 'cover';
    [[1, refs.s1], [2, refs.s2], [3, refs.s3], [5, refs.s5], [4, refs.s4]].forEach(function (x) {
      var s = x[1], show = cover ? x[0] === 5 : x[0] !== 5, open = show && (cover || x[0] === openStep);
      s.li.hidden = !show;
      s.body.hidden = !open;
      s.li.classList.toggle('open', open);
      s.head.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function aiLinksLine(after) {
    var parts = ['Open a new chat in '];
    AI_LINKS.forEach(function (l, i) {
      if (i) parts.push(i === AI_LINKS.length - 1 ? ' or ' : ', ');
      parts.push(h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.name));
    });
    parts.push(after || ', paste it and send.');
    return parts;
  }

  // ---------- step 1: the book ----------
  function buildSetup(body) {
    var P = function () { return A.project().setup; };
    body.appendChild(h('p', { class: 'lead' }, 'Set up your book. The preview on the right shows every page and updates as you go. It fills in once you add your own puzzles in step 2.'));

    refs.title = h('input', { class: 'input', id: 'fTitle', type: 'text', maxlength: 80, autocomplete: 'off', placeholder: 'e.g. Last One Standing' });
    refs.title.addEventListener('input', function () { A.setSetup('title', refs.title.value, { typing: true }); });
    body.appendChild(field('Book title', refs.title, 'Your own title. Do not copy the exact title of a bestselling book.', true, 'fTitle'));

    refs.subtitle = h('input', { class: 'input', id: 'fSubtitle', type: 'text', maxlength: 160, autocomplete: 'off' });
    refs.subtitle.addEventListener('input', function () { A.setSetup('subtitle', refs.subtitle.value, { typing: true }); });
    body.appendChild(field('Subtitle', refs.subtitle, 'Printed on the title page and the cover. Leave empty for the wording shown in grey.', false, 'fSubtitle'));

    refs.author = h('input', { class: 'input', id: 'fAuthor', type: 'text', maxlength: 80, autocomplete: 'off', placeholder: 'e.g. Ruth Ellery' });
    refs.author.addEventListener('input', function () { A.setSetup('author', refs.author.value, { typing: true }); });
    body.appendChild(field('Pen name', refs.author, 'Your own name or a pen name, never a famous author’s.', true, 'fAuthor'));

    refs.audHint = h('div', { class: 'hint' });
    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Readers'),
      chips([{ value: 'adults', label: 'Adults' }, { value: 'seniors', label: 'Seniors', title: 'Large print and familiar words' }, { value: 'kids', label: 'Kids 8–12' }],
        function () { return P().audience; },
        function (v) { if (v === 'seniors' && P().audience !== 'seniors') P().largePrint = true; A.setSetup('audience', v); }), refs.audHint]));

    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Spelling'),
      chips([{ value: 'us', label: 'American' }, { value: 'uk', label: 'British' }], function () { return P().spelling; }, function (v) { A.setSetup('spelling', v); }),
      h('div', { class: 'hint' }, 'Used by the AI prompts. The starter puzzles read the same in both.')]));

    refs.layoutHint = h('div', { class: 'hint' });
    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Page layout'),
      chips([{ value: 'spread', label: 'Two-page spread' }, { value: 'single', label: 'One page per case' }], function () { return P().layout; }, function (v) { A.setSetup('layout', v); }),
      refs.layoutHint]));

    // cases per level
    refs.counts = {};
    var grid = h('div', { class: 'counts' });
    CX.engine.LEVELS.forEach(function (lv) {
      var inp = h('input', { type: 'number', min: 0, max: 300, step: 1, 'aria-label': lv.name + ': number of cases' });
      inp.addEventListener('change', function () { A.setCount(lv.id, inp.value); });
      var small = h('small');
      var row = h('label', { class: 'count-row' }, [h('span', { class: 'lv' }, [h('strong', null, lv.name.replace(/^The /, '')), small]), inp]);
      refs.counts[lv.id] = { input: inp, small: small, row: row };
      grid.appendChild(row);
    });
    refs.countsHint = h('div', { class: 'hint' });
    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Cases in each level'), grid, refs.countsHint]));

    refs.trim = h('select', { class: 'input', id: 'fTrim' });
    CX.kdp.TRIMS.forEach(function (t) { refs.trim.appendChild(h('option', { value: t.id }, t.label + ' — ' + t.hint)); });
    refs.trim.addEventListener('change', function () { A.setSetup('trim', refs.trim.value); });
    body.appendChild(field('Book size', refs.trim, null, false, 'fTrim'));

    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Paper'),
      chips([{ value: 'white', label: 'White' }, { value: 'cream', label: 'Cream' }], function () { return P().paper; }, function (v) { A.setSetup('paper', v); })]));

    var lp = checkbox('Large print', 'Every text about a fifth bigger. Loved by seniors.', function (on) { A.setSetup('largePrint', on); });
    refs.largePrint = lp.box;
    body.appendChild(lp.el);

    // pages
    refs.pages = {};
    var list = [];
    [['welcome', 'How to play', 'The rules, the golden rule and a worked example.'],
      ['guide', 'Clue guide', 'How each kind of clue in the book works.'],
      ['faq', 'Good to know', 'Short answers to the questions new readers ask.'],
      ['contents', 'Contents', 'The parts of the book with page numbers.'],
      ['parts', 'Part dividers', 'A title page before each level.'],
      ['thanks', 'Thank-you page', 'A friendly last page that asks for a review.']].forEach(function (o) {
      var c = checkbox(o[1], o[2], function (on) { A.setPage(o[0], on); });
      refs.pages[o[0]] = c.box;
      list.push(c.el);
    });
    refs.solutions = h('select', { class: 'input', id: 'fSolutions' });
    [['explained', 'Explained: what every clue crosses out'], ['compact', 'Compact: answers only, two columns']].forEach(function (o) { refs.solutions.appendChild(h('option', { value: o[0] }, o[1])); });
    refs.solutions.addEventListener('change', function () { A.setPage('solutions', refs.solutions.value); });
    list.push(field('Solutions', refs.solutions, null, false, 'fSolutions'));
    refs.notes = h('select', { class: 'input narrow', id: 'fNotes' });
    [0, 1, 2, 3, 4, 6].forEach(function (n) { refs.notes.appendChild(h('option', { value: n }, n === 0 ? 'None' : n + (n === 1 ? ' page' : ' pages'))); });
    refs.notes.addEventListener('change', function () { A.setPage('notes', parseInt(refs.notes.value, 10)); });
    list.push(field('Lined notes pages', refs.notes, null, false, 'fNotes'));
    refs.pagesSummary = h('span', { class: 'summary-note' });
    body.appendChild(h('details', { class: 'advanced' }, [h('summary', null, ['Pages in the book', refs.pagesSummary])].concat(list)));

    refs.seed = h('code', { class: 'seed' });
    var shuffle = h('button', { type: 'button', class: 'btn small' }, 'Shuffle all puzzles');
    shuffle.addEventListener('click', function () { A.reshuffle(); });
    body.appendChild(h('details', { class: 'advanced' }, [
      h('summary', null, 'Puzzle set'),
      h('div', { class: 'field' }, [h('div', { class: 'row seed-row' }, [refs.seed, shuffle]),
        h('div', { class: 'hint' }, 'The puzzle set decides every line-up, answer and clue. The same project always builds the same book; “Shuffle all puzzles” builds a different one from the same packs.')])
    ]));

    refs.summary1 = h('div', { class: 'derived' });
    body.appendChild(refs.summary1);
    var next = h('button', { type: 'button', class: 'btn btn-primary block' }, 'Next: add your own puzzles');
    next.addEventListener('click', function () { setOpen(2); });
    body.appendChild(next);
  }

  // ---------- step 2: packs with AI ----------
  function promptText() {
    var p = A.project();
    var avoid = CX.book.activePacks(p).map(function (pk) { return pk.topic; });
    return CX.prompts.packPrompt(p, { theme: ai.theme, custom: ai.custom, count: ai.count, avoid: avoid });
  }

  function buildPacks(body) {
    body.appendChild(h('p', { class: 'lead' }, 'An AI chat writes the raw material: topics, little mysteries, lists of everyday things and plain facts about them. The app builds every puzzle itself, writes the letter clues and proves each case has exactly one answer.'));

    refs.theme = h('select', { class: 'input', id: 'fTheme' });
    CX.prompts.THEMES.forEach(function (t) { refs.theme.appendChild(h('option', { value: t.id }, t.label)); });
    refs.theme.addEventListener('change', function () { ai.theme = refs.theme.value; refs.customWrap.hidden = ai.theme !== 'custom'; });
    refs.custom = h('input', { class: 'input', type: 'text', maxlength: 160, placeholder: 'e.g. Gardening through the seasons' });
    refs.custom.addEventListener('input', function () { ai.custom = refs.custom.value; });
    refs.customWrap = h('div', { class: 'custom-venue', hidden: true }, refs.custom);
    body.appendChild(h('div', { class: 'field' }, [h('label', { for: 'fTheme' }, 'Theme'), refs.theme, refs.customWrap]));

    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Packs per reply'),
      chips([5, 8, 10, 12].map(function (n) { return { value: n, label: String(n) }; }), function () { return ai.count; }, function (v) { ai.count = v; A.refresh(); }),
      h('div', { class: 'hint' }, 'Each pack gives two cases. Free AI plans may cut off very long replies; 5 to 8 is safest there.')]));

    body.appendChild(h('ol', { class: 'howto-mini' }, [
      h('li', null, 'Click “Copy prompt”.'),
      h('li', null, aiLinksLine()),
      h('li', null, 'Copy the whole reply, paste it below and click “Add these packs”.'),
      h('li', null, 'Repeat until the book has all its cases. Each new prompt asks for new topics.')
    ]));
    body.appendChild(h('div', { class: 'actions first' }, [CX.dom.copyButton('Copy prompt', promptText, 'btn btn-primary')]));
    var peekArea = h('textarea', { class: 'textarea', readonly: true, rows: 8, 'aria-label': 'The prompt' });
    var peek = h('details', { class: 'peek' }, [h('summary', null, 'See the prompt'), peekArea]);
    peek.addEventListener('toggle', function () { if (peek.open) peekArea.value = promptText(); });
    body.appendChild(peek);

    refs.paste = h('textarea', { class: 'textarea paste', id: 'fPaste', rows: 6, placeholder: 'Paste the AI’s reply here…' });
    body.appendChild(field('The AI’s reply', refs.paste, null, false, 'fPaste'));
    var add = h('button', { type: 'button', class: 'btn btn-primary' }, 'Add these packs');
    add.addEventListener('click', function () {
      var res = A.addPacks(refs.paste.value);
      if (res.ok) refs.paste.value = '';
      showPackResult(res);
    });
    body.appendChild(h('div', { class: 'actions' }, [add]));
    refs.result2 = h('div', { class: 'result', 'aria-live': 'polite' });
    body.appendChild(refs.result2);

    refs.meter = h('div', { class: 'meter' });
    body.appendChild(refs.meter);
    refs.packHead = h('h3', { class: 'pub-group' }, 'Your packs');
    refs.packList = h('ul', { class: 'pack-list' });
    body.appendChild(refs.packHead);
    body.appendChild(refs.packList);
    var st = checkbox('Use the starter library', CX.starter.count + ' ready-made packs (' + CX.starter.count * 2 + ' cases) that come with the app. Every user of the app has them, so at most a third of a book you publish may come from here.', function (on) { A.setSetup('starter', on); });
    refs.starter = st.box;
    body.appendChild(st.el);
    var next = h('button', { type: 'button', class: 'btn block next-step' }, 'Next: review and fact-check');
    next.addEventListener('click', function () { setOpen(3); });
    body.appendChild(next);
  }

  function showPackResult(res) {
    var box = refs.result2;
    box.innerHTML = '';
    if (!res) return;
    var r = res.result;
    box.appendChild(h('div', { class: 'msg ' + (res.ok ? 'ok' : 'err') }, res.message));
    if (r && (r.errors.length || r.cutOff)) {
      box.appendChild(h('div', { class: 'msg err' }, [
        h('strong', null, r.cutOff ? 'The reply was cut off, so the last pack was lost.' : 'Some packs could not be used:'),
        r.errors.length ? h('ul', null, r.errors.slice(0, 6).map(function (e) { return h('li', null, e); })) : null,
        h('p', { class: 'fix-help' }, 'Copy the fix prompt into the same chat, then paste the new reply above.'),
        h('div', { class: 'actions' }, [CX.dom.copyButton('Copy fix prompt', function () { return CX.prompts.fixPrompt(r); }, 'btn small')])
      ]));
    }
    if (r && r.notes.length) {
      box.appendChild(h('details', { class: 'fixed-notes' }, [h('summary', null, r.notes.length + ' thing' + (r.notes.length > 1 ? 's were' : ' was') + ' tidied up (optional reading)'),
        h('ul', null, r.notes.map(function (n) { return h('li', null, n); }))]));
    }
  }

  function renderPacks(state) {
    var p = A.project(), built = state.built;
    refs.packList.innerHTML = '';
    refs.packHead.hidden = !p.packs.length;
    p.packs.forEach(function (pk) {
      var sm = CX.packs.summary(pk);
      var box = h('input', { type: 'checkbox', 'aria-label': 'Use “' + pk.topic + '” in the book' });
      box.checked = !pk.off;
      box.addEventListener('change', function () { A.togglePack(pk.id); });
      var x = h('button', { type: 'button', class: 'pk-x', title: 'Remove this pack', 'aria-label': 'Remove “' + pk.topic + '”' }, '×');
      x.addEventListener('click', function () { A.removePack(pk.id); });
      var hard = sm.levels.indexOf('master') === -1 ? ' · too short for Master' : '';
      refs.packList.appendChild(h('li', { class: pk.off ? 'off' : '' }, [box,
        h('span', { class: 'pk-text' }, [h('span', { class: 'pk-name', title: pk.topic }, pk.topic),
          h('span', { class: 'pk-meta' }, sm.cases + ' cases · ' + sm.options + ' options · ' + sm.facts + ' facts' + hard)]), x]));
    });
    if (!built) { refs.meter.innerHTML = ''; return; }
    var own = built.all.filter(function (pz) { return pz.pack.source !== 'starter'; }).length, n = built.all.length;
    var starter = n - own, want = built.want;
    var missing = Object.keys(built.short).reduce(function (a, k) { return a + built.short[k]; }, 0);
    var base = Math.max(want, n, 1);
    refs.meter.innerHTML = '';
    refs.meter.appendChild(h('div', null, [h('strong', null, n + ' of ' + want + ' cases'), missing ? ' · ' + missing + ' still missing: add ' + Math.ceil(missing / 2) + ' or more packs' : ' · all filled']));
    refs.meter.appendChild(h('div', { class: 'bar' }, [h('span', { class: 'own', style: 'width:' + (own / base * 100) + '%' }), h('span', { class: 'starter', style: 'width:' + (starter / base * 100) + '%' })]));
    refs.meter.appendChild(h('div', { class: 'legend' }, [h('span', null, [h('i', { style: 'background:var(--ok)' }), 'Your packs ' + own]), h('span', null, [h('i', { style: 'background:#d7a64a' }), 'Starter ' + starter])]));
  }

  // ---------- step 3: review and fact-check ----------
  function buildReview(body) {
    body.appendChild(h('p', { class: 'lead' }, 'Every puzzle is already proven to have one answer. What a program cannot judge is whether readers agree with a knowledge clue (“It is green”, “It has four legs”). A second AI chat checks those for you.'));
    refs.factStatus = h('div', { class: 'derived' });
    body.appendChild(refs.factStatus);
    refs.factParts = h('div', { class: 'part-pick' });
    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Fact-check prompt'), refs.factParts,
      h('div', { class: 'hint' }, aiLinksLine(', paste the prompt and send. Use a new chat for the fact-check; a fresh pair of eyes is stricter.'))]));
    refs.auditPaste = h('textarea', { class: 'textarea paste', id: 'fAudit', rows: 5, placeholder: 'Paste the fact-check reply here…' });
    refs.auditLabel = h('label', { for: 'fAudit' }, 'The fact-check reply');
    body.appendChild(h('div', { class: 'field' }, [refs.auditLabel, refs.auditPaste]));
    var apply = h('button', { type: 'button', class: 'btn btn-primary' }, 'Apply the fact-check');
    apply.addEventListener('click', function () {
      var res = A.applyAudit(refs.auditPaste.value, refs.auditPart || 0);
      if (res.ok) refs.auditPaste.value = '';
      refs.result3.innerHTML = '';
      refs.result3.appendChild(h('div', { class: 'msg ' + (res.ok ? 'ok' : 'err') }, res.message));
    });
    body.appendChild(h('div', { class: 'actions' }, [apply]));
    refs.result3 = h('div', { class: 'result', 'aria-live': 'polite' });
    body.appendChild(refs.result3);

    body.appendChild(h('h3', { class: 'pub-group' }, 'The cases'));
    body.appendChild(h('p', { class: 'hint' }, 'Click a case to see it. “New clues” builds a new line-up and clues from the same pack; “Remove” takes the case out of the book.'));
    refs.caseList = h('ul', { class: 'case-list' });
    body.appendChild(refs.caseList);
    refs.removed = h('p', { class: 'removed-note' });
    body.appendChild(refs.removed);
    var next = h('button', { type: 'button', class: 'btn block next-step' }, 'Next: design the cover');
    next.addEventListener('click', function () { setOpen(5); });
    body.appendChild(next);
  }

  function renderReview(state) {
    var p = A.project(), built = state.built, check = state.check;
    if (!built) return;
    var info = CX.prompts.auditPrompt(p, built, 0);
    var audit = state.audit || { done: {} };
    refs.factParts.innerHTML = '';
    if (!info.count) {
      refs.factStatus.textContent = 'No case in the book uses a knowledge clue, so there is nothing to fact-check.';
    } else {
      refs.factStatus.textContent = check && check.factChecked
        ? 'Fact-checked: all ' + info.count + ' cases with knowledge clues.'
        : info.count + ' cases use knowledge clues' + (info.parts > 1 ? ', in ' + info.parts + ' prompts of up to ' + CX.prompts.AUDIT_CHUNK + ' cases each.' : '.') + ' Not fact-checked yet.';
      for (var i = 0; i < info.parts; i++) {
        (function (part) {
          var chunk = CX.prompts.auditPrompt(p, built, part);
          var label = info.parts > 1 ? 'Copy part ' + (part + 1) + ' (cases ' + chunk.from + '–' + chunk.to + ')' : 'Copy fact-check prompt';
          var b = CX.dom.copyButton(label, function () { refs.auditPart = part; refs.auditLabel.textContent = 'The fact-check reply' + (info.parts > 1 ? ' for part ' + (part + 1) : ''); return A.auditPrompt(part); }, 'chip-btn' + (audit.done[part] ? ' done' : ''));
          refs.factParts.appendChild(b);
        })(i);
      }
    }
    // the cases, level by level
    var key = JSON.stringify(built.all.map(function (pz) { return pz.key + pz.v + pz.answer + pz.clues.length; }));
    if (key !== refs.caseKey) {
      refs.caseKey = key;
      refs.caseList.innerHTML = '';
      built.levels.forEach(function (lv) {
        if (!lv.puzzles.length) return;
        refs.caseList.appendChild(h('li', { class: 'lv-head' }, lv.level.name + ' · ' + lv.puzzles.length));
        lv.puzzles.forEach(function (pz) {
          var go = h('button', { type: 'button', title: 'Show this case' }, 'View');
          go.addEventListener('click', function () { A.goToCase(pz.no); });
          var re = h('button', { type: 'button', title: 'A new line-up, answer and clues from the same pack' }, 'New clues');
          re.addEventListener('click', function () { A.caseNewClues(pz.key); });
          var rm = h('button', { type: 'button', title: 'Take this case out of the book' }, 'Remove');
          rm.addEventListener('click', function () { A.caseRemove(pz.key); });
          refs.caseList.appendChild(h('li', null, [h('span', { class: 'no' }, String(pz.no)),
            h('span', { class: 'ct' }, [h('b', { title: pz.title }, pz.title), h('span', null, pz.pack.topic + ' · answer ' + pz.options[pz.answer])]),
            h('span', { class: 'acts' }, [go, re, rm])]));
        });
      });
    }
    var removed = Object.keys(p.tweaks).filter(function (k) { return p.tweaks[k].off; }).length;
    refs.removed.innerHTML = '';
    if (removed) {
      var back = h('button', { type: 'button', class: 'link-btn' }, 'Put them back');
      back.addEventListener('click', function () { A.restoreCases(); });
      refs.removed.appendChild(h('span', null, [U.plural(removed, 'case') + ' removed. ', back]));
    }
  }

  // ---------- the cover ----------
  function buildCover(body) {
    body.appendChild(h('p', { class: 'lead' }, 'A complete paperback cover: front, spine and back on one sheet at KDP’s exact size for your page count. Your title, subtitle and pen name are filled in for you.'));
    refs.designs = [];
    var dg = h('div', { class: 'designs', role: 'radiogroup', 'aria-label': 'Cover design' });
    CX.cover.DESIGNS.forEach(function (d) {
      var art = h('span', { class: 'design-art' });
      var b = h('button', { type: 'button', class: 'design', role: 'radio', 'aria-checked': 'false', title: d.hint }, [art, h('span', { class: 'design-label' }, d.label)]);
      b.addEventListener('click', function () { A.setCover('design', d.id); });
      refs.designs.push({ id: d.id, el: b, art: art });
      dg.appendChild(b);
    });
    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Design'), dg]));
    refs.pals = [];
    var pg = h('div', { class: 'palettes', role: 'radiogroup', 'aria-label': 'Colors' });
    Object.keys(CX.cover.PALETTES).forEach(function (id) {
      var pal = CX.cover.PALETTES[id];
      var b = h('button', { type: 'button', class: 'pal', role: 'radio', 'aria-checked': 'false' }, [h('i', { style: 'background:' + pal.bg }), pal.label]);
      b.addEventListener('click', function () { A.setCover('palette', id); });
      refs.pals.push({ id: id, el: b });
      pg.appendChild(b);
    });
    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Colors'), pg]));
    refs.badge = h('input', { class: 'input', id: 'fBadge', type: 'text', maxlength: 22, autocomplete: 'off' });
    refs.badge.addEventListener('input', function () { A.setCover('badge', refs.badge.value, true); });
    body.appendChild(field('Badge', refs.badge, 'The round sticker on the front, e.g. “150 CASES” or “LARGE PRINT”.', false, 'fBadge'));
    refs.blurb = h('textarea', { class: 'textarea', id: 'fBlurb', rows: 5, maxlength: 900 });
    refs.blurb.addEventListener('input', function () { A.setCover('blurb', refs.blurb.value, true); });
    body.appendChild(field('Back cover text', refs.blurb, 'Leave empty for the text shown in grey. A blank line starts a new paragraph.', false, 'fBlurb'));
    refs.coverInfo = h('div', { class: 'derived' });
    body.appendChild(refs.coverInfo);
    refs.coverIssues = h('div');
    body.appendChild(refs.coverIssues);
    refs.coverNote = h('p', { class: 'hint' });
    body.appendChild(refs.coverNote);
    body.appendChild(h('p', { class: 'hint' }, 'On KDP choose “Upload a cover you already have” and upload this PDF. KDP prints the barcode in the clear box at the bottom right of the back.'));
    var next = h('button', { type: 'button', class: 'btn block next-step' }, 'Next: check and download');
    next.addEventListener('click', function () { setOpen(4); });
    body.appendChild(next);
  }

  function refreshCover(state) {
    var p = A.project(), c = p.setup.cover;
    refs.designs.forEach(function (d) { d.el.setAttribute('aria-checked', String(d.id === c.design)); d.el.classList.toggle('on', d.id === c.design); });
    refs.pals.forEach(function (d) { d.el.setAttribute('aria-checked', String(d.id === c.palette)); d.el.classList.toggle('on', d.id === c.palette); });
    setValue(refs.badge, c.badge || '');
    setValue(refs.blurb, c.blurb || '');
    if (state.built) {
      var wd = CX.cover.words(p, state.built);
      refs.badge.placeholder = p.setup.largePrint ? 'LARGE PRINT' : (state.built.all.length ? state.built.all.length + ' CASES' : '');
      refs.blurb.placeholder = CX.cover.defaultBlurb(p, state.built).replace('\n', '\n\n');
      refs.subtitle.placeholder = wd.subtitle;
    }
    var cv = state.cover;
    refs.coverInfo.textContent = cv ? 'Full cover ' + cv.inches.w.toFixed(3) + ' x ' + cv.inches.h.toFixed(3) + ' in, bleed included. Spine ' + cv.spine.toFixed(3) + ' in' +
      (cv.spineText ? ', with your title on it.' : ' (too thin for spine text, so it stays plain).') : '';
    refs.coverIssues.innerHTML = '';
    if (state.coverIssues && state.coverIssues.length) {
      refs.coverIssues.appendChild(h('div', { class: 'msg err' }, [h('strong', null, 'The cover needs a fix:'), h('ul', null, state.coverIssues.map(function (t) { return h('li', null, t); }))]));
    }
    refs.coverNote.textContent = state.coverBlock || 'Ready. Click “Download cover PDF” at the top right.';
    // thumbnails of the three fronts, only while the cover step is open
    if (mode === 'cover' && cv && state.book) {
      var key = JSON.stringify([c.palette, p.setup.title, p.setup.subtitle, p.setup.author, c.badge, p.setup.trim, state.book.pageCount, p.seed, state.built.all.length]);
      if (key !== refs.thumbKey) {
        refs.thumbKey = key;
        var proj = JSON.parse(JSON.stringify(CX.book.toSave(p)));
        refs.designs.forEach(function (d) {
          proj.setup.cover.design = d.id;
          var t = CX.cover.layout(proj, state.built, state.book), g = t.guides;
          d.art.innerHTML = CX.svg.renderCover(t, { crop: { x: g.spineX1, y: 0, w: t.W - g.spineX1, h: t.H } });
        });
      }
    }
  }

  // ---------- step 4: check and download ----------
  function buildDownload(body) {
    body.appendChild(h('p', { class: 'lead' }, 'The app checks your book against Amazon KDP’s printing rules, and every puzzle once more, before you download it.'));
    refs.checklist = h('ul', { class: 'checklist' });
    body.appendChild(refs.checklist);
    refs.warnings = h('div');
    body.appendChild(refs.warnings);
    refs.dlNote = h('p', { class: 'hint' });
    body.appendChild(refs.dlNote);
    refs.publish = h('div', { class: 'publish' });
    body.appendChild(refs.publish);
  }

  function pubRow(k, v, copy) {
    return h('div', { class: 'pub-row' }, [h('span', { class: 'k' }, k), h('span', { class: 'v' }, v),
      copy === false ? null : CX.dom.copyButton('Copy', v, 'btn small')]);
  }

  function listingInfo(state) {
    var p = A.project(), built = state.built, book = state.book;
    var topics = [], seen = {};
    built.all.forEach(function (pz) { if (!seen[pz.pack.topic]) { seen[pz.pack.topic] = 1; topics.push(pz.pack.topic.toLowerCase()); } });
    return {
      total: built.all.length, trim: book.trim.label, pages: book.pageCount,
      levels: built.levels.filter(function (l) { return l.puzzles.length; }).map(function (l) { return l.level.name.replace(/^The /, '') + ' (' + l.puzzles.length + ' cases, ' + l.level.clues + ' clues each)'; }),
      themes: topics.slice(0, 12).join(', ')
    };
  }

  function renderPublish(state) {
    var p = A.project(), s = p.setup, box = refs.publish, book = state.book;
    box.innerHTML = '';
    box.appendChild(h('h3', null, 'Your Amazon KDP listing'));
    box.appendChild(h('p', { class: 'hint' }, 'Copy each part into the matching box on kdp.amazon.com when you create the paperback. For the description and keywords, copy the listing prompt into an AI chat.'));
    box.appendChild(h('div', { class: 'actions first' }, [CX.dom.copyButton('Copy listing prompt', function () { return CX.prompts.listingPrompt(p, listingInfo(state)); }, 'btn small')]));
    box.appendChild(h('div', { class: 'pub-group' }, 'Book details'));
    if ((s.title || '').trim()) box.appendChild(pubRow('Title', s.title.trim()));
    var sub = (s.subtitle || '').trim() || CX.cover.words(p, state.built).subtitle;
    box.appendChild(pubRow('Subtitle', sub));
    if ((s.author || '').trim()) box.appendChild(pubRow('Author', s.author.trim()));
    box.appendChild(pubRow('Categories', 'Crafts, Hobbies & Home › Games & Activities › Puzzles\nCrafts, Hobbies & Home › Games & Activities › Logic & Brain Teasers' + (s.audience === 'kids' ? '\nJuvenile Nonfiction › Games & Activities › Puzzles' : ''), false));
    box.appendChild(h('div', { class: 'pub-group' }, 'Print options'));
    box.appendChild(pubRow('Ink & paper', 'Black & white interior with ' + CX.kdp.paper(s.paper).label.toLowerCase(), false));
    box.appendChild(pubRow('Trim size', book.trim.label, false));
    box.appendChild(pubRow('Bleed', 'No bleed', false));
    box.appendChild(pubRow('Cover finish', 'Matte or glossy, as you like', false));
    box.appendChild(pubRow('Pages', String(book.pageCount), false));
    var cv = CX.kdp.cover(s.trim, book.pageCount, s.paper);
    box.appendChild(pubRow('Full cover', cv.width.toFixed(3) + ' x ' + cv.height.toFixed(3) + ' in with 0.125 in bleed. Spine ' + cv.spine.toFixed(3) + ' in' +
      (cv.spineText ? ' (spine text allowed).' : ' (too thin for spine text).'), false));
    var openCover = h('button', { type: 'button', class: 'btn small' }, 'Open the cover');
    openCover.addEventListener('click', function () { setOpen(5); });
    box.appendChild(h('div', { class: 'actions' }, [openCover]));
    box.appendChild(h('div', { class: 'pub-group' }, 'Keep your account safe'));
    box.appendChild(h('ul', { class: 'safety' }, [
      h('li', null, [h('strong', null, 'AI disclosure: '), 'KDP asks whether you used AI. Answer “Yes” for text: the topics, stories and lists were written with an AI tool. The puzzles themselves were built by this app.']),
      h('li', null, [h('strong', null, 'Original book: '), 'Use your own packs for most of the book, and click “Shuffle all puzzles” for each new book. Never upload the same PDF twice.']),
      h('li', null, [h('strong', null, 'Names and titles: '), 'Never use another author’s name, a series name or a famous title in your title, subtitle or keywords.']),
      h('li', null, [h('strong', null, 'Read it once: '), 'Skim the cases in the preview before you publish. You are the author; KDP holds you responsible for the text.']),
      h('li', null, [h('strong', null, 'Order a proof: '), 'Order one printed proof copy from KDP and check it before you press Publish.'])
    ]));
  }

  // ---------- refresh ----------
  function refresh(state) {
    var p = A.project(), s = p.setup;
    if (state.view && state.view !== mode) { mode = state.view; applyMode(); }
    setValue(refs.title, s.title || '');
    setValue(refs.subtitle, s.subtitle || '');
    setValue(refs.author, s.author || '');
    setValue(refs.trim, s.trim);
    setValue(refs.solutions, s.pages.solutions);
    setValue(refs.notes, s.pages.notes);
    refs.largePrint.checked = !!s.largePrint;
    refs.starter.checked = !!s.starter;
    var off = 0;
    Object.keys(refs.pages).forEach(function (k) { refs.pages[k].checked = !!s.pages[k]; if (!s.pages[k]) off++; });
    refs.pagesSummary.textContent = off ? off + ' left out' : '';
    refs.seed.textContent = p.seed.toUpperCase();
    chipSets.forEach(function (set) { var v = set.get(); set.buttons.forEach(function (b) { b.el.setAttribute('aria-pressed', String(v === b.value)); }); });
    refs.author.classList.toggle('invalid', !!state.touchedAuthor && !(s.author || '').trim());
    refs.title.classList.toggle('invalid', !!state.touchedAuthor && !(s.title || '').trim());
    refs.audHint.textContent = { adults: 'Everyday words and the full range of clues.', seniors: 'Large print and familiar, timeless words.', kids: 'Shorter line-ups and the plainer kinds of clue.' }[s.audience] || '';
    refs.layoutHint.textContent = s.layout === 'spread'
      ? 'Clues on the left-hand page, the line-up facing them on the right, like the bestselling books. Two pages per case.'
      : 'The mystery, the clues and the line-up on one page. Half the pages, a lower print cost.';

    var built = state.built, book = state.book;
    CX.engine.LEVELS.forEach(function (lv0) {
      var r = refs.counts[lv0.id], lv = CX.engine.level(lv0.id, s.audience);
      setValue(r.input, s.counts[lv0.id]);
      r.small.textContent = lv.clues + ' clues · ' + lv.lineup[0] + '–' + lv.lineup[1] + ' options';
      r.row.classList.toggle('short', !!(built && built.short[lv0.id]));
    });
    if (built) {
      var missing = Object.keys(built.short).reduce(function (a, k) { return a + built.short[k]; }, 0);
      refs.countsHint.textContent = missing ? 'Your packs fill ' + built.all.length + ' of ' + built.want + ' cases. Add packs in step 2 to fill the rest.' : 'Each pack gives two cases. The hardest levels need packs with 24 or more options.';
      refs.summary1.textContent = 'Your book: ' + book.pageCount + ' pages, ' + book.trim.label + ', ' + U.plural(built.all.length, 'case') + '.';
    }

    // step states
    var hasBasics = !!(s.author || '').trim() && !!(s.title || '').trim();
    chipState(refs.s1, hasBasics ? 'done' : 'todo', hasBasics ? 'Done' : !(s.title || '').trim() ? 'Title needed' : 'Pen name needed');
    var check = state.check;
    var ownOk = check && check.items.filter(function (i) { return i.title === 'Your own content' || i.title === 'Puzzles'; }).every(function (i) { return i.ok; });
    chipState(refs.s2, ownOk ? 'done' : p.packs.length ? 'fix' : 'todo', ownOk ? 'Done' : p.packs.length ? 'Add more' : 'To do');
    var unfair = check && check.unfair.length;
    chipState(refs.s3, unfair ? 'fix' : check && (check.factChecked || !check.factCases) ? 'done' : 'todo', unfair ? 'Needs a fix' : check && (check.factChecked || !check.factCases) ? 'Done' : 'Recommended');
    var coverOk = !!state.cover && !state.coverBlock;
    chipState(refs.s5, coverOk ? 'done' : 'todo', coverOk ? 'Ready' : 'To do');
    var can = check && check.canDownload;
    chipState(refs.s4, can ? 'done' : 'todo', can ? 'Ready' : 'Not ready yet');

    if (openStep === 2) renderPacks(state);
    if (openStep === 3) renderReview(state);
    refreshCover(state);
    if (openStep === 4 && check) {
      refs.checklist.innerHTML = '';
      check.items.forEach(function (it) {
        refs.checklist.appendChild(h('li', { class: it.ok ? 'ok' : 'bad' }, [
          h('span', { class: 'mark', 'aria-hidden': 'true' }, it.ok ? '✓' : '!'),
          h('span', null, [h('strong', null, it.title), h('span', { class: 'detail' }, it.detail)])
        ]));
      });
      refs.warnings.innerHTML = '';
      if (check.warnings.length) {
        refs.warnings.appendChild(h('details', { class: 'fixed-notes', open: true }, [h('summary', null, check.warnings.length + ' note' + (check.warnings.length > 1 ? 's' : '') + ' worth a look'),
          h('ul', { class: 'warn-list' }, check.warnings.map(function (w) { return h('li', null, w); }))]));
      }
      refs.dlNote.textContent = can ? 'All set. Click “Download PDF” at the top right: one PDF file for your KDP manuscript.' : 'Fix the items marked “!” to unlock “Download PDF” at the top right.';
      renderPublish(state);
    }
  }

  function chipState(step, cls, text) {
    step.chip.className = 'chip ' + cls;
    step.chip.textContent = text;
    step.li.classList.toggle('state-done', cls === 'done');
    step.li.classList.toggle('state-fix', cls === 'fix');
  }

  // Forget per-project screen state (a new or opened project).
  function reset() {
    refs.caseKey = null; refs.thumbKey = null; refs.auditPart = 0;
    refs.result2.innerHTML = ''; refs.result3.innerHTML = '';
    refs.paste.value = ''; refs.auditPaste.value = '';
  }

  function init(app) {
    A = app;
    var list = document.getElementById('steps');
    refs.s1 = stepShell(1, 'Set up your book', 1);
    refs.s2 = stepShell(2, 'Add your own puzzles with AI', 2);
    refs.s3 = stepShell(3, 'Review and fact-check', 3);
    refs.s5 = stepShell(5, 'Design the cover', '');
    refs.s4 = stepShell(4, 'Check and download', 4);
    refs.s5.li.classList.add('solo');
    buildSetup(refs.s1.body);
    buildPacks(refs.s2.body);
    buildReview(refs.s3.body);
    buildCover(refs.s5.body);
    buildDownload(refs.s4.body);
    [refs.s1, refs.s2, refs.s3, refs.s5, refs.s4].forEach(function (s) { list.appendChild(s.li); });
    setOpen(1);
  }

  CX.sidebar = { init: init, refresh: refresh, setOpen: setOpen, reset: reset };
})(window);
