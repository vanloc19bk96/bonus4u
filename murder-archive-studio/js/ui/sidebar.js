/* The sidebar: four steps, built once and refreshed in place so typing never loses focus. */
(function (root) {
  'use strict';
  var LK = root.LK;
  var h = LK.dom.h;
  var A;                     // LK.app
  var refs = {};
  var openStep = 1;          // the open book step (1, 2 or 4)
  var mode = 'book';         // 'book' or 'cover', the tab on screen
  var chipSets = [];         // [{ key, buttons: [{ value, el }] }]

  var AI_LINKS = [
    { name: 'ChatGPT', url: 'https://chatgpt.com/' },
    { name: 'Claude', url: 'https://claude.ai/new' },
    { name: 'Gemini', url: 'https://gemini.google.com/app' }
  ];

  // Small line icons for the book types (24 x 24, drawn with the current text color).
  var ICON_PATHS = {
    ticket: '<path d="M3 7h18v3.2a1.8 1.8 0 0 0 0 3.6V17H3v-3.2a1.8 1.8 0 0 0 0-3.6z"/><path d="M9 7v10" stroke-dasharray="1.6 1.6"/><path d="M12 10.5h6M12 13.5h4"/>',
    ship: '<path d="M2.5 15h19l-3.2 4.5H5.7z"/><path d="M6.5 15v-4h11v4"/><path d="M10.5 11V6.5h3V11"/><path d="M9 13h.01M12 13h.01M15 13h.01"/>',
    key: '<circle cx="7.5" cy="12" r="3.5"/><path d="M11 12h10.5M18 12v3M21 12v2.2"/>',
    badge: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="2.6"/><path d="M8.5 15.5h7M9.5 18h5"/>',
    list: '<rect x="4.5" y="3" width="15" height="18" rx="1.5"/><path d="M8 7.5h8M8 11h8M8 14.5h8M8 18h5"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 5.5h4M11.5 18.5h1"/>',
    pin: '<path d="M12 21.5s-6.5-6.2-6.5-11.5a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11.5-6.5 11.5z"/><circle cx="12" cy="10" r="2.4"/>'
  };
  function icon(name) {
    var span = h('span', { class: 'type-icon', 'aria-hidden': 'true' });
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name] || ICON_PATHS.list) + '</svg>';
    return span;
  }

  // ---------- small builders ----------
  function field(label, control, hint, required, id) {
    var lab = h('label', { for: id || null }, [label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null]);
    return h('div', { class: 'field' }, [lab, control, hint ? h('div', { class: 'hint' }, hint) : null]);
  }

  function chips(key, options, onPick) {
    var set = { key: key, buttons: [] };
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

  function setValue(el, v) { if (document.activeElement !== el && el.value !== String(v)) el.value = v; }

  // n is the step's id (3 is the cover); shown is the number printed on it
  function stepShell(n, title, shown) {
    var num = h('span', { class: 'step-num' }, String(shown));
    var chip = h('span', { class: 'chip todo' }, '');
    var head = h('button', { type: 'button', class: 'step-head', 'aria-expanded': 'false' }, [num, h('span', { class: 'step-title' }, title), chip]);
    var body = h('div', { class: 'step-body', hidden: true });
    var li = h('li', { class: 'step' }, [head, body]);
    head.addEventListener('click', function () { if (n !== 3) setOpen(openStep === n ? 0 : n); });
    return { li: li, head: head, body: body, chip: chip, num: num };
  }

  // The sidebar follows the Pages / Cover tabs: the book steps with the pages, the cover step
  // alone with the cover. Opening the cover step switches to the cover; a book step, to the pages.
  function setOpen(n) {
    if (n === 3) { A.setView('cover'); return; }
    openStep = n;
    var toPages = mode !== 'book';
    mode = 'book';
    applyMode();
    if (toPages) A.setView('book');
    if (n === 4) A.refresh();
  }

  function applyMode() {
    var cover = mode === 'cover';
    [[1, refs.s1], [2, refs.s2], [3, refs.s3], [4, refs.s4]].forEach(function (x) {
      var s = x[1], show = cover ? x[0] === 3 : x[0] !== 3, open = show && (cover || x[0] === openStep);
      s.li.hidden = !show;
      s.body.hidden = !open;
      s.li.classList.toggle('open', open);
      s.head.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function type() { return LK.book.type(A.project()); }
  function an(word) { return (/^[aeiou]/i.test(word) ? 'an ' : 'a ') + word; }

  // ---------- step 1: setup ----------
  function buildSetup(body) {
    body.appendChild(h('p', { class: 'lead' }, 'Choose the kind of book you want, then create it. The puzzle builds itself, and the preview on the right shows every page and updates as you go.'));

    // the book type
    refs.types = [];
    var grid = h('div', { class: 'type-grid', role: 'radiogroup', 'aria-label': 'Book type' });
    LK.types.all().forEach(function (t) {
      var b = h('button', { type: 'button', class: 'type-card', role: 'radio', 'aria-checked': 'false', title: t.blurb }, [
        icon(t.icon), h('span', { class: 'type-text' }, [h('span', { class: 'type-name' }, t.short), h('span', { class: 'type-ex' }, t.example)])
      ]);
      b.addEventListener('click', function () { A.setType(t.id); });
      refs.types.push({ id: t.id, el: b });
      grid.appendChild(b);
    });
    refs.typeBlurb = h('div', { class: 'hint type-blurb' });
    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, ['Book type', h('span', { class: 'badge' }, 'New')]), grid, refs.typeBlurb]));

    refs.author = h('input', { class: 'input', id: 'fAuthor', type: 'text', maxlength: 80, autocomplete: 'off', placeholder: 'e.g. J. R. Hartwell' });
    refs.author.addEventListener('input', function () { A.setSetup('author', refs.author.value, { typing: true }); });
    body.appendChild(field('Pen name', refs.author, 'Printed on the title page. Use your own name or a pen name, never a famous author’s.', true, 'fAuthor'));

    refs.title = h('input', { class: 'input', id: 'fTitle', type: 'text', maxlength: 90, autocomplete: 'off', placeholder: 'Leave empty: the AI will suggest titles' });
    refs.title.addEventListener('input', function () { A.setSetup('title', refs.title.value, { typing: true }); });
    body.appendChild(field('Book title', refs.title, null, false, 'fTitle'));

    refs.venue = h('select', { class: 'input', id: 'fVenue' });
    refs.venue.addEventListener('change', function () { A.setSetup('venue', refs.venue.value, { affectsCase: true }); });
    refs.customVenue = h('input', { class: 'input', type: 'text', maxlength: 140, placeholder: 'e.g. A lighthouse keepers’ reunion on a stormy coast' });
    refs.customVenue.addEventListener('input', function () { A.setSetup('customVenue', refs.customVenue.value, { typing: true }); });
    refs.customWrap = h('div', { class: 'custom-venue' }, refs.customVenue);
    refs.venueHint = h('div', { class: 'hint' });
    var vf = h('div', { class: 'field' }, [h('label', { for: 'fVenue' }, 'Where the murder happens'), refs.venue, refs.customWrap, refs.venueHint]);
    body.appendChild(vf);

    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Story tone'),
      chips('tone', [{ value: 'cozy', label: 'Cozy' }, { value: 'classic', label: 'Classic whodunit' }, { value: 'dark', label: 'Dark and tense' }],
        function (v) { A.setSetup('tone', v); })]));

    refs.diffHint = h('div', { class: 'hint' });
    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Difficulty'),
      chips('difficulty', [{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }],
        function (v) { A.setDifficulty(v); }), refs.diffHint]));

    refs.count = h('select', { class: 'input', id: 'fCount' });
    refs.count.addEventListener('change', function () { A.setSetup('count', parseInt(refs.count.value, 10), { affectsCase: true }); });
    refs.countHint = h('div', { class: 'hint' });
    refs.countLabel = h('label', { for: 'fCount' }, 'Records in the archive');
    body.appendChild(h('div', { class: 'field' }, [refs.countLabel, refs.count, refs.countHint]));

    refs.modeHint = h('div', { class: 'hint' });
    refs.modeField = h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Archive layout'),
      chips('registerMode', [{ value: 'chapters', label: 'Chapters' }, { value: 'list', label: 'One list' }],
        function (v) { A.setSetup('registerMode', v); }),
      refs.modeHint]);
    refs.modeChips = chipSets[chipSets.length - 1];
    body.appendChild(refs.modeField);

    refs.trim = h('select', { class: 'input', id: 'fTrim' });
    LK.kdp.TRIMS.forEach(function (t) { refs.trim.appendChild(h('option', { value: t.id }, t.label + ' — ' + t.hint)); });
    refs.trim.addEventListener('change', function () { A.setSetup('trim', refs.trim.value); });
    body.appendChild(field('Book size', refs.trim, null, false, 'fTrim'));

    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Print size'),
      chips('print', [{ value: 'regular', label: 'Regular' }, { value: 'large', label: 'Large print', title: 'Bigger text for older readers' }],
        function (v) { A.setSetup('print', v); })]));

    refs.ideas = h('textarea', { class: 'textarea', id: 'fIdeas', rows: 3, maxlength: 1200, placeholder: 'Optional. e.g. The victim is a retired magician; the killer is the person nobody suspects; set it at Christmas.' });
    refs.ideas.addEventListener('input', function () { A.setSetup('ideas', refs.ideas.value, { typing: true }); });
    body.appendChild(field('Your story ideas', refs.ideas, 'The AI follows these first. Leave empty for a surprise.', false, 'fIdeas'));

    // pages in the book, in book order
    function pageToggle(label, hint, onChange, isNew) {
      var box = h('input', { type: 'checkbox' });
      box.addEventListener('change', function () { onChange(box.checked); });
      var small = h('small', null, hint);
      return { box: box, small: small, el: h('div', { class: 'field' }, [h('label', { class: 'check' }, [box, h('span', null, [label, isNew ? h('span', { class: 'badge' }, 'New') : null, small])])]) };
    }
    refs.pages = {};
    refs.pageHints = {};
    var pageList = [];
    function addPages(list) {
      list.forEach(function (o) {
        var t = pageToggle(o[1], o[2], function (on) { A.setPage(o[0], on); }, o[3]);
        refs.pages[o[0]] = t.box;
        refs.pageHints[o[0]] = t.small;
        pageList.push(t.el);
      });
    }
    addPages([
      ['copyright', 'Copyright page', 'Your rights notice and the case file number. Recommended for KDP.'],
      ['contents', 'Contents', 'The parts of the book with their page numbers.'],
      ['howto', 'How to Play', 'The rules, and how to read the archive and the clues.'],
      ['practice', 'The Practice Case', 'A two-minute warm-up: seven records, four clues, worked through. First-time readers love it.', true],
      ['prologue', 'Prologue', 'The story opening: the event and the death.'],
      ['letter', 'The Letter', 'The letter that hands the case to the reader.']
    ]);
    var help = pageToggle('Reading tip under each clue', 'One plain line under every clue on how to apply it, like the top-selling books.', function (on) { A.setSetup('clueHelp', on); }, true);
    refs.clueHelp = help.box;
    pageList.push(help.el);
    refs.notes = h('select', { class: 'input narrow', id: 'fNotes' });
    [0, 1, 2, 3, 4, 6].forEach(function (n) { refs.notes.appendChild(h('option', { value: n }, n === 0 ? 'None' : n + (n === 1 ? ' page' : ' pages'))); });
    refs.notes.addEventListener('change', function () { A.setSetup('notesPages', parseInt(refs.notes.value, 10)); });
    pageList.push(h('div', { class: 'field' }, [h('label', { for: 'fNotes' }, 'Lined notes pages'), refs.notes]));
    var cp = pageToggle('Checkpoints page', 'How many records should be left after each clue. Readers love it.', function (on) { A.setSetup('checkpoints', on); });
    refs.checkpoints = cp.box;
    refs.cpHint = cp.small;
    pageList.push(cp.el);
    addPages([
      ['hints', 'Detective’s Hints', 'Two hints for every clue, written from your case. They never give the answer away.'],
      ['verdict', 'The Verdict Cipher', 'Readers unlock the killer’s name with their answer: a spoiler-free check.'],
      ['cards', 'Clue cards', 'Every clue on a cut-out card, printed with a blank back so nothing is lost.'],
      ['stop', 'Stop page', 'Warns the reader before the solution.'],
      ['epilogue', 'Epilogue', 'The big reveal, after the solution.'],
      ['certificate', 'Certificate of Detection', 'A certificate the reader fills in when the case is solved.', true]
    ]);
    refs.pagesSummary = h('span', { class: 'summary-note' });
    refs.pagesNote = h('p', { class: 'hint' });
    body.appendChild(h('details', { class: 'advanced' }, [
      h('summary', null, ['Pages in the book', refs.pagesSummary]),
      refs.pagesNote
    ].concat(pageList)));

    // advanced
    refs.clues = h('input', { class: 'input narrow', id: 'fClues', type: 'number', min: 8, max: 24, step: 1 });
    refs.clues.addEventListener('change', function () { A.setSetup('clues', parseInt(refs.clues.value, 10), { affectsCase: true }); });
    refs.cluesHint = h('div', { class: 'hint' });
    refs.seed = h('code', { class: 'seed' });
    var newCase = h('button', { type: 'button', class: 'btn small' }, 'New case');
    newCase.addEventListener('click', function () { A.newCase(); });
    body.appendChild(h('details', { class: 'advanced' }, [
      h('summary', null, 'More options'),
      h('div', { class: 'field' }, [h('label', { for: 'fClues' }, 'Number of clues'), refs.clues, refs.cluesHint]),
      h('div', { class: 'field' }, [h('span', { class: 'field-label' }, 'Case file'), h('div', { class: 'row seed-row' }, [refs.seed, newCase]),
        h('div', { class: 'hint' }, 'Each case file is an archive, an answer and a set of clues made only for your book. “New case” builds a different one.')])
    ]));

    refs.summary1 = h('div', { class: 'derived' });
    body.appendChild(refs.summary1);
    var next = h('button', { type: 'button', class: 'btn btn-primary block' }, 'Next: write the story');
    next.addEventListener('click', function () { A.createBook(); setOpen(2); });
    body.appendChild(next);
  }

  // Options that depend on the book type: settings and record counts.
  function rebuildTypeOptions(t) {
    refs.venue.innerHTML = '';
    t.settings.forEach(function (v) { refs.venue.appendChild(h('option', { value: v.id }, v.label + (v.id === 'custom' ? '' : ' — ' + v.hint))); });
    refs.count.innerHTML = '';
    t.counts.forEach(function (c) { refs.count.appendChild(h('option', { value: c }, c.toLocaleString('en-US') + ' ' + t.unit.many)); });
    refs.countLabel.textContent = t.unit.Many + ' in the ' + t.archive.name;
    refs.venueHint.textContent = t.id === 'lottery'
      ? 'The setting decides what the ticket register shows: tables or booths, prices, payment methods and opening hours.'
      : 'The setting decides the labels in the ' + t.archive.name + ' and the background of the story.';
    refs.typeBlurb.textContent = t.blurb;
    var labels = t.chapterLabel || ['Chapters', 'One list'];
    refs.modeChips.buttons[0].el.textContent = labels[0];
    refs.modeChips.buttons[1].el.textContent = labels[1];
    refs.modeHint.textContent = t.chapterHint || '';
    refs.pagesNote.textContent = 'The title page, the clues, the ' + t.archive.name + (t.mode === 'ledger' ? ', the ledger' : '') + ' and the solution are the puzzle itself, so they are always included.';
    refs.cpHint.textContent = 'How many ' + t.unit.many + ' should be left after each clue. Readers love it.';
    refs.pageHints.verdict.textContent = 'Readers unlock the killer’s name with ' + (t.keyField === null || t.keyDigits === undefined ? 'their answer' : 'their answer’s ' + (t.keyLabel || 'number')) + ': a spoiler-free check.';
    refs.storyLead.textContent = 'Your puzzle is ready. Now an AI chat writes the story around it: the prologue, the letter, a title and a note for every clue, three short interludes, ' +
      (t.mode === 'ledger' ? 'twenty suspects for the ledger' : 'the cast, taken from your ' + t.archive.name) + ' and the big reveal.';
  }

  // ---------- step 2: story ----------
  function aiLinksLine() {
    var parts = ['Open a new chat in '];
    AI_LINKS.forEach(function (l, i) {
      if (i) parts.push(i === AI_LINKS.length - 1 ? ' or ' : ', ');
      parts.push(h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.name));
    });
    parts.push(', paste it and send.');
    return parts;
  }

  function buildStory(body) {
    refs.storyLead = h('p', { class: 'lead' }, '');
    body.appendChild(refs.storyLead);
    body.appendChild(h('ol', { class: 'howto-mini' }, [
      h('li', null, 'Click “Copy prompt”.'),
      h('li', null, aiLinksLine()),
      h('li', null, 'Copy the whole reply, paste it below and click “Use this story”.')
    ]));
    refs.copyPrompt = LK.dom.copyButton('Copy prompt', function () { return LK.prompts.storyPrompt(A.project(), A.caseNow()); }, 'btn btn-primary');
    body.appendChild(h('div', { class: 'actions first' }, [refs.copyPrompt]));
    var peekArea = h('textarea', { class: 'textarea', readonly: true, rows: 8, 'aria-label': 'The prompt' });
    var peek = h('details', { class: 'peek' }, [h('summary', null, 'See the prompt'), peekArea]);
    peek.addEventListener('toggle', function () { if (peek.open) peekArea.value = LK.prompts.storyPrompt(A.project(), A.caseNow()); });
    body.appendChild(peek);

    refs.stale = h('div', { class: 'note', hidden: true }, [
      h('p', null, 'You changed a setting that rebuilt the clues, so the clue notes in your story no longer match. Copy this short prompt into the same chat, then paste the reply below.'),
      LK.dom.copyButton('Copy clue-notes prompt', function () { return LK.prompts.cluesPrompt(A.project(), A.caseNow()); }, 'btn small')
    ]);
    body.appendChild(refs.stale);

    refs.paste = h('textarea', { class: 'textarea paste', id: 'fPaste', rows: 6, placeholder: 'Paste the AI’s reply here…' });
    body.appendChild(field('The AI’s reply', refs.paste, null, false, 'fPaste'));
    var use = h('button', { type: 'button', class: 'btn btn-primary' }, 'Use this story');
    use.addEventListener('click', function () {
      var res = A.applyPaste(refs.paste.value);
      if (res.ok) refs.paste.value = '';
      showResult(res);
    });
    body.appendChild(h('div', { class: 'actions' }, [use]));
    refs.result2 = h('div', { class: 'result', 'aria-live': 'polite' });
    body.appendChild(refs.result2);
    refs.summary2 = h('div', { class: 'summary' });
    body.appendChild(refs.summary2);
  }

  function showResult(res) {
    var box = refs.result2;
    box.innerHTML = '';
    if (!res) return;
    var errs = (res.issues || []).filter(function (i) { return i.level === 'error'; });
    var warns = (res.issues || []).filter(function (i) { return i.level === 'warning'; });
    if (!res.ok) { box.appendChild(h('div', { class: 'msg err' }, res.message)); return; }
    if (!errs.length) {
      box.appendChild(h('div', { class: 'msg ok' }, res.message || 'Story added. Check the preview, then open the Cover tab to design the cover.'));
    } else {
      box.appendChild(h('div', { class: 'msg err' }, [
        h('strong', null, 'Almost there. A few parts need fixing:'),
        h('ul', null, errs.map(function (i) { return h('li', null, i.text); })),
        h('p', { class: 'fix-help' }, 'Copy the fix prompt into the same chat, then paste the new reply above. Only the broken parts are replaced.'),
        h('div', { class: 'actions' }, [LK.dom.copyButton('Copy fix prompt', function () { return LK.prompts.fixPrompt(A.project(), A.caseNow(), res.issues); }, 'btn small')])
      ]));
    }
    if (warns.length) {
      box.appendChild(h('details', { class: 'fixed-notes' }, [h('summary', null, warns.length + ' small note' + (warns.length > 1 ? 's' : '') + ' (optional)'),
        h('ul', null, warns.map(function (i) { return h('li', null, i.text); }))]));
    }
  }

  function renderStorySummary() {
    var p = A.project(), st = p.story, box = refs.summary2;
    box.innerHTML = '';
    if (!st) return;
    var cs = A.caseNow(), t = cs.type;
    var cur = LK.book.title(p);
    if (st.titles && st.titles.length) {
      box.appendChild(h('h3', null, 'Pick your title'));
      var opts = h('div', { class: 'title-options', role: 'radiogroup' });
      st.titles.forEach(function (ti) {
        var r = h('input', { type: 'radio', name: 'titlePick', value: ti });
        r.checked = ti === cur;
        r.addEventListener('change', function () { A.setSetup('title', ti); });
        opts.appendChild(h('label', { class: 'radio' }, [r, h('span', null, ti)]));
      });
      box.appendChild(opts);
      box.appendChild(h('p', { class: 'hint' }, 'Or type your own title in step 1.'));
    }
    box.appendChild(h('h3', null, 'The case'));
    if (st.victim) box.appendChild(h('p', null, [h('strong', null, 'Victim: '), st.victim.name + (st.victim.who ? ', ' + st.victim.who : '')]));
    if (st.client) box.appendChild(h('p', null, [h('strong', null, 'Letter from: '), st.client.name]));
    if (t.mode === 'ledger') {
      var ledger = LK.book.ledger(p, cs) || [];
      if (ledger.length) {
        box.appendChild(h('p', null, [h('strong', null, 'Suspects: '), ledger.length + ' in ' + t.ledger.title]));
        var k = ledger.filter(function (r) { return r.killer; })[0];
        if (k) box.appendChild(h('details', { class: 'spoiler' }, [h('summary', null, 'Show the killer (spoiler)'),
          h('p', null, k.name + (k.role ? ', ' + k.role : '') + '. ' + cap(t.ledger.item) + ' ' + t.ledgerLabel(cs.killer, cs) + '.')]));
      }
    } else {
      box.appendChild(h('p', null, [h('strong', null, 'Cast: '), LK.prompts.CAST + ' people from the ' + t.archive.name]));
      box.appendChild(h('details', { class: 'spoiler' }, [h('summary', null, 'Show the killer (spoiler)'),
        h('p', null, LK.book.killerName(p, cs) + '. ' + t.columns(cs).filter(function (c) { return c.key !== 'name'; }).map(function (c) { return c.head.charAt(0) + c.head.slice(1).toLowerCase() + ' ' + t.row(cs.killer, cs)[c.key]; }).join(', ') + '.')]));
    }
    var clear = h('button', { type: 'button', class: 'link-btn' }, 'Remove this story and start the story again');
    clear.addEventListener('click', function () { A.clearStory(); });
    box.appendChild(h('p', { class: 'small-actions' }, clear));
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- step 3: the cover ----------
  function buildCoverStep(body) {
    body.appendChild(h('p', { class: 'lead' }, 'A complete paperback cover, ready for KDP: front, spine and back on one sheet, sized to your page count. Your title, pen name and description are filled in for you.'));
    // the design picker: real thumbnails of the user's own front cover, filtered by group
    var D = LK.coverDesigns;
    refs.designFilter = 'fit';
    refs.designChips = [];
    var filters = [{ id: 'fit', label: 'For your book' }, { id: 'all', label: 'All ' + D.list.length }].concat(D.groups);
    var fbar = h('div', { class: 'design-filters', role: 'group', 'aria-label': 'Show designs' });
    filters.forEach(function (fl) {
      var b = h('button', { type: 'button', class: 'chip-btn', 'aria-pressed': 'false' }, fl.label);
      b.addEventListener('click', function () { refs.designFilter = fl.id; refs.thumbKey = null; A.refresh(); });
      refs.designChips.push({ id: fl.id, el: b });
      fbar.appendChild(b);
    });
    refs.designGrid = h('div', { class: 'designs', role: 'radiogroup', 'aria-label': 'Cover design' });
    refs.designName = h('span', { class: 'design-current' });
    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'field-label' }, ['Design ', refs.designName]), fbar, refs.designGrid]));


    function coverField(key, label, placeholder, max) {
      var el = h('input', { class: 'input', type: 'text', maxlength: max, autocomplete: 'off', placeholder: placeholder, id: 'fCover' + key });
      el.addEventListener('input', function () { A.setCover(key, el.value, true); });
      refs['cover_' + key] = el;
      return field(label, el, null, false, 'fCover' + key);
    }
    body.appendChild(h('details', { class: 'advanced' }, [
      h('summary', null, 'Cover wording'),
      h('p', { class: 'hint' }, 'Leave a box empty to use the wording shown in grey.'),
      coverField('kicker', 'Top line', 'An elimination murder mystery puzzle', 60),
      coverField('line', 'Cover line', '3,000 passengers. 16 clues. One killer.', 60),
      coverField('question', 'Question', 'Can you find the killer?', 40)
    ]));
    refs.coverInfo = h('div', { class: 'derived' });
    body.appendChild(refs.coverInfo);
    refs.coverIssues = h('div');
    body.appendChild(refs.coverIssues);
    refs.coverNote = h('p', { class: 'hint' });
    body.appendChild(refs.coverNote);
    body.appendChild(h('div', { class: 'actions' }, [
      LK.dom.copyButton('Copy cover art prompt', function () { return LK.prompts.coverPrompt(A.project(), A.caseNow()); }, 'btn small')]));
    body.appendChild(h('p', { class: 'hint' }, 'On KDP choose “Upload a cover you already have” and upload this PDF. KDP prints the barcode in the clear box at the bottom right of the back. The art prompt is optional, for a picture you want to add in your own design tool.'));
    var next = h('button', { type: 'button', class: 'btn block next-step' }, 'Next: check and download');
    next.addEventListener('click', function () { setOpen(4); });
    body.appendChild(next);
  }

  function refreshCover(state) {
    var p = A.project(), c = p.setup.cover;
    renderDesigns(state);
    ['kicker', 'line', 'question'].forEach(function (k) { setValue(refs['cover_' + k], c[k] || ''); });
    if (state.cs) {
      var t = state.cs.type, who = t.target.who;
      refs.cover_line.placeholder = state.cs.records.length.toLocaleString('en-US') + ' ' + t.unit.many + '. ' + state.cs.clues.length + ' clues. One ' + who.replace(/^the /, '') + '.';
      refs.cover_question.placeholder = 'Can you find ' + who + '?';
    }
    var cv = state.cover;
    refs.coverInfo.textContent = cv
      ? 'Full cover ' + (cv.W / 72).toFixed(3) + ' x ' + (cv.H / 72).toFixed(3) + ' in, bleed included. Spine ' + cv.spine.toFixed(3) + ' in' +
        (cv.spineText ? ', with your title on it.' : ' (too thin for spine text, so it stays plain).')
      : '';
    refs.coverIssues.innerHTML = '';
    if (state.coverIssues && state.coverIssues.length) {
      refs.coverIssues.appendChild(h('div', { class: 'msg err' }, [h('strong', null, 'The cover needs a fix:'), h('ul', null, state.coverIssues.map(function (t) { return h('li', null, t); }))]));
    }
    refs.coverNote.textContent = state.coverBlock || 'Ready. Click “Download cover PDF” at the top right: one PDF file for your KDP paperback cover.';
  }

  // The thumbnails are drawn only while the cover step is open, and again only when something
  // they show changes (title, pen name, cover lines, the case, the trim or the filter).
  var thumbTimer = null;
  function designList(state) {
    var D = LK.coverDesigns, f = refs.designFilter, t = state.cs && state.cs.type.id;
    if (f === 'all') return D.list;
    if (f === 'fit') return D.list.filter(function (d) { return t && d.fits.indexOf(t) !== -1 && d.fits.length < 8; });
    return D.list.filter(function (d) { return d.group === f; });
  }
  function renderDesigns(state) {
    var p = A.project(), c = p.setup.cover, D = LK.coverDesigns;
    var cur = D.get(c.style);
    refs.designName.textContent = cur ? '(' + cur.label + ')' : '';
    refs.designChips.forEach(function (b) { b.el.setAttribute('aria-pressed', String(b.id === refs.designFilter)); });
    var key = mode === 'cover' && state.cs && state.book ? JSON.stringify([refs.designFilter, LK.book.title(p), p.setup.author, c.kicker, c.line, c.question, p.seed, LK.book.caseKey(p), p.setup.trim, state.book.pageCount]) : null;
    if (key && key !== refs.thumbKey) {
      refs.thumbKey = key;
      clearTimeout(thumbTimer);
      refs.designGrid.innerHTML = '';
      refs.thumbs = [];
      var list = designList(state);
      if (!list.length) { refs.designFilter = 'all'; refs.thumbKey = null; renderDesigns(state); return; }
      var proj = JSON.parse(JSON.stringify(p)), i = 0;
      // a few at a time, so the page stays responsive
      (function next() {
        var stop = Math.min(list.length, i + 10);
        for (; i < stop; i++) {
          var d = list[i];
          proj.setup.cover.style = d.id;
          var cv = LK.cover.layout(proj, state.cs, state.book), g = cv.guides;
          var art = h('span', { class: 'design-art' });
          art.innerHTML = LK.svg.renderCover(cv, { crop: { x: g.spineX1, y: 0, w: cv.W - g.spineX1, h: cv.H } });
          var b = h('button', { type: 'button', class: 'design', role: 'radio', 'aria-checked': 'false', title: d.label }, [art, h('span', { class: 'design-label' }, d.label)]);
          b.addEventListener('click', (function (id) { return function () { A.setCover('style', id); }; })(d.id));
          refs.thumbs.push({ id: d.id, el: b });
          refs.designGrid.appendChild(b);
        }
        markDesign();
        if (i < list.length) thumbTimer = setTimeout(next, 16);
      })();
    }
    markDesign();
  }
  function markDesign() {
    var id = A.project().setup.cover.style;
    (refs.thumbs || []).forEach(function (t) { t.el.setAttribute('aria-checked', String(t.id === id)); t.el.classList.toggle('on', t.id === id); });
  }

  // ---------- step 4: check and download ----------
  function buildDownload(body) {
    body.appendChild(h('p', { class: 'lead' }, 'The app checks your book against Amazon KDP’s printing rules before you download it.'));
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
      copy === false ? null : LK.dom.copyButton('Copy', v, 'btn small')]);
  }

  function renderPublish(state) {
    var p = A.project(), st = p.story || {}, box = refs.publish, book = state.book;
    box.innerHTML = '';
    box.appendChild(h('h3', null, 'Your Amazon KDP listing'));
    box.appendChild(h('p', { class: 'hint' }, 'Copy each part into the matching box on kdp.amazon.com when you create the paperback.'));
    box.appendChild(h('div', { class: 'pub-group' }, 'Book details'));
    var title = LK.book.title(p);
    if (title) box.appendChild(pubRow('Title', title));
    if (st.subtitle) box.appendChild(pubRow('Subtitle', st.subtitle));
    if (p.setup.author) box.appendChild(pubRow('Author', p.setup.author.trim()));
    if (st.blurb) box.appendChild(pubRow('Description', st.blurb));
    (st.keywords || []).slice(0, 7).forEach(function (k, i) { box.appendChild(pubRow('Keyword ' + (i + 1), k)); });
    box.appendChild(pubRow('Categories', 'Puzzles & Games › Logic & Brain Teasers\nMystery, Thriller & Suspense › Mystery\nPuzzles & Games › Puzzles', false));
    box.appendChild(h('div', { class: 'pub-group' }, 'Print options'));
    box.appendChild(pubRow('Ink & paper', 'Black & white interior with white paper', false));
    box.appendChild(pubRow('Trim size', book.trim.label, false));
    box.appendChild(pubRow('Bleed', 'No bleed', false));
    box.appendChild(pubRow('Pages', String(book.pageCount), false));
    var cv = LK.kdp.cover(p.setup.trim, book.pageCount);
    box.appendChild(h('div', { class: 'pub-group' }, 'Cover'));
    box.appendChild(pubRow('Full cover', cv.width.toFixed(3) + ' x ' + cv.height.toFixed(3) + ' in, with 0.125 in bleed. Spine ' + cv.spine.toFixed(3) + ' in' +
      (cv.spineText ? ' (spine text allowed).' : ' (too thin for spine text).'), false));
    var editCover = h('button', { type: 'button', class: 'btn small' }, 'Open the cover');
    editCover.addEventListener('click', function () { setOpen(3); });
    box.appendChild(h('div', { class: 'actions' }, [editCover]));
    box.appendChild(h('div', { class: 'pub-group' }, 'Keep your account safe'));
    box.appendChild(h('ul', { class: 'safety' }, [
      h('li', null, [h('strong', null, 'AI disclosure: '), 'KDP asks whether you used AI. Answer “Yes” for text, because the story was written with an AI tool. The puzzle data was made by this app.']),
      h('li', null, [h('strong', null, 'Original book: '), 'Your case file (' + p.seed.toUpperCase() + ') gives an archive, an answer and clues no one else has. Never upload the same PDF twice, and click “New case” for each new book.']),
      h('li', null, [h('strong', null, 'Names and titles: '), 'Never use another author’s name, a series name or a famous title in your title, subtitle or keywords.']),
      h('li', null, [h('strong', null, 'Read it once: '), 'Skim the story pages in the preview before you publish. You are the author; KDP holds you responsible for the text.']),
      h('li', null, [h('strong', null, 'Order a proof: '), 'Order one printed proof copy from KDP and check it before you press Publish.'])
    ]));
  }

  // ---------- refresh ----------
  function refresh(state) {
    var p = A.project(), s = p.setup, t = type();
    if (state.view && state.view !== mode) { mode = state.view; applyMode(); }
    if (refs.lastType !== t.id) { refs.lastType = t.id; rebuildTypeOptions(t); }
    refs.types.forEach(function (x) { x.el.setAttribute('aria-checked', String(x.id === t.id)); x.el.classList.toggle('on', x.id === t.id); });
    setValue(refs.author, s.author || '');
    setValue(refs.title, s.title || '');
    setValue(refs.venue, s.venue);
    refs.customWrap.hidden = s.venue !== 'custom';
    setValue(refs.customVenue, s.customVenue || '');
    setValue(refs.count, s.count);
    setValue(refs.trim, s.trim);
    setValue(refs.ideas, s.ideas || '');
    setValue(refs.clues, s.clues);
    setValue(refs.notes, s.notesPages);
    refs.checkpoints.checked = !!s.checkpoints;
    refs.clueHelp.checked = s.clueHelp !== false;
    refs.modeField.hidden = !t.hasChapters(t.setting(s.venue));
    var off = 0;
    Object.keys(refs.pages).forEach(function (k) {
      var on = LK.book.hasPage(p, k);
      refs.pages[k].checked = on;
      if (!on) off++;
    });
    if (!s.checkpoints) off++;
    refs.pagesSummary.textContent = off ? off + ' left out' : '';
    refs.seed.textContent = p.seed.toUpperCase();
    chipSets.forEach(function (set) {
      set.buttons.forEach(function (b) { b.el.setAttribute('aria-pressed', String(s[set.key] === b.value)); });
    });
    var diff = LK.clues.difficulty(t.id, s.difficulty);
    var dh = { easy: 'Clear, one-fact clues. A relaxing first case.', medium: 'A mix of simple and trickier clues, with a few “if…then” rules.', hard: 'Many clues combine two facts. For seasoned detectives.' };
    refs.diffHint.textContent = s.clues + ' clues. ' + dh[s.difficulty];
    refs.clues.min = diff.min; refs.clues.max = diff.max;
    refs.cluesHint.textContent = diff.label + ' allows ' + diff.min + ' to ' + diff.max + ' clues.';
    refs.author.classList.toggle('invalid', !!state.touchedAuthor && !(s.author || '').trim());

    var book = state.book;
    refs.countHint.textContent = book ? 'More ' + t.unit.many + ' means a longer, more challenging book. This one makes ' + book.pageCount + ' pages.' : 'More ' + t.unit.many + ' means a longer, more challenging book.';
    refs.summary1.textContent = book
      ? 'Your book: ' + book.pageCount + ' pages, ' + book.trim.label + ', ' + state.cs.records.length.toLocaleString('en-US') + ' ' + t.unit.many + ', ' + state.cs.clues.length + ' clues.'
      : '';

    // step states
    var hasAuthor = !!(s.author || '').trim();
    var st = p.story;
    var stale = !!(st && st.caseKey && st.caseKey !== LK.book.caseKey(p));
    var storyErrors = state.check ? state.check.storyIssues.filter(function (i) { return i.level === 'error'; }) : [];
    chipState(refs.s1, hasAuthor ? 'done' : 'todo', hasAuthor ? 'Done' : 'Pen name needed');
    chipState(refs.s2, !st ? 'todo' : storyErrors.length ? 'fix' : 'done', !st ? 'To do' : storyErrors.length ? 'Needs a fix' : 'Done');
    var can = state.check && state.check.canDownload;
    var coverOk = !!state.cover && !state.coverBlock;
    chipState(refs.s3, coverOk ? 'done' : 'todo', coverOk ? 'Ready' : st ? 'Pick a style' : 'After the story');
    chipState(refs.s4, can ? 'done' : 'todo', can ? 'Ready' : 'Not ready yet');

    refs.stale.hidden = !stale;
    renderStorySummary();
    refreshCover(state);

    // step 4
    if (openStep === 4 && state.check) {
      refs.checklist.innerHTML = '';
      state.check.items.forEach(function (it) {
        refs.checklist.appendChild(h('li', { class: it.ok ? 'ok' : 'bad' }, [
          h('span', { class: 'mark', 'aria-hidden': 'true' }, it.ok ? '✓' : '!'),
          h('span', null, [h('strong', null, it.title), h('span', { class: 'detail' }, it.detail)])
        ]));
      });
      refs.warnings.innerHTML = '';
      if (state.check.warnings.length) {
        refs.warnings.appendChild(h('details', { class: 'fixed-notes' }, [h('summary', null, state.check.warnings.length + ' note' + (state.check.warnings.length > 1 ? 's' : '') + ' worth a look'),
          h('ul', { class: 'warn-list' }, state.check.warnings.map(function (w) { return h('li', null, w); }))]));
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

  function init(app) {
    A = app;
    var list = document.getElementById('steps');
    refs.s1 = stepShell(1, 'Set up your book', 1);
    refs.s2 = stepShell(2, 'Write the story with AI', 2);
    refs.s3 = stepShell(3, 'Design the cover', '');
    refs.s4 = stepShell(4, 'Check and download', 3);
    refs.s3.li.classList.add('solo');
    buildSetup(refs.s1.body);
    buildStory(refs.s2.body);
    buildCoverStep(refs.s3.body);
    buildDownload(refs.s4.body);
    [refs.s1, refs.s2, refs.s3, refs.s4].forEach(function (s) { list.appendChild(s.li); });
    setOpen(A.project().story ? 2 : 1);
  }

  LK.sidebar = { init: init, refresh: refresh, setOpen: setOpen, showResult: showResult };
})(window);
