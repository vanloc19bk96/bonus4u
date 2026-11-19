/*
 * The app: a header switch between the book pages (four steps) and the cover, each with its own
 * sidebar and preview. Nothing is kept in the browser: the work lives in the open tab until it is
 * saved to a project file. Each step body is rebuilt only when its structure changes, so typing never loses focus.
 */
(function (root) {
  'use strict';
  var CX = root.CX, U = CX.util, P = CX.plan, dom = CX.dom, h = dom.h;
  var CHATGPT = 'https://chatgpt.com/';

  var state = { p: null, mode: 'book', open: 1, sel: null, result: null, printPages: 0, busy: false };
  var live = [];          // small updaters for the open step (derived text that follows typing)
  var thumbs = {};        // cover template thumbnails (SVG) by words, size, page count and template

  var refresh = dom.debounce(renderPreview, 180);

  // rebuild: rebuild the open step's body (after a choice that changes what it shows)
  function changed(rebuild) {
    live.forEach(function (f) { f(); });
    renderHeads();
    if (rebuild) renderBody();
    refresh();
  }

  // ---------- small form pieces ----------
  function field(label, control, hint, id) {
    return h('div', { class: 'field' }, [h('label', { for: id }, label), control, hint ? h('div', { class: 'hint' }, hint) : null]);
  }
  function select(id, options, value, onchange) {
    var s = h('select', { class: 'input', id: id });
    options.forEach(function (o) { s.appendChild(h('option', { value: o.v, selected: String(o.v) === String(value) }, o.t)); });
    s.addEventListener('change', function () { onchange(s.value); });
    return s;
  }
  function text(id, value, attrs, oninput) {
    var i = h('input', Object.assign({ class: 'input', id: id, value: value, type: 'text' }, attrs || {}));
    i.addEventListener('input', function () { oninput(i.value); });
    return i;
  }
  function check(label, small, checked, onchange) {
    var i = h('input', { type: 'checkbox', checked: !!checked });
    i.addEventListener('change', function () { onchange(i.checked); });
    return h('label', { class: 'check' }, [i, h('span', null, [label, small ? h('small', null, small) : null])]);
  }
  function radio(name, label, small, checked, onchange) {
    var i = h('input', { type: 'radio', name: name, checked: !!checked });
    i.addEventListener('change', function () { if (i.checked) onchange(); });
    return h('label', { class: 'radio card' + (checked ? ' on' : '') }, [i, h('span', null, [h('b', null, label), small ? h('small', null, small) : null])]);
  }
  function next(n, label) {
    return h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { openStep(n); } }, label + ' →'));
  }
  function msg(kind, title, items) {
    return h('div', { class: 'msg ' + kind }, [h('div', null, title), items && items.length ? h('ul', null, items.map(function (t) { return h('li', null, t); })) : null]);
  }

  // The job list, grouped the way people look for a job.
  function jobSelect(value, onchange) {
    var s = h('select', { class: 'input', id: 'fJob' }), groups = {};
    P.JOBS.forEach(function (j) {
      if (!groups[j.group]) { groups[j.group] = h('optgroup', { label: j.group }); s.appendChild(groups[j.group]); }
      var label = j.id === 'custom' ? 'Another job (type it in)…' : j.general ? 'Jobs & careers of every kind' : j.name;
      groups[j.group].appendChild(h('option', { value: j.id, selected: j.id === value }, label));
    });
    s.addEventListener('change', function () { onchange(s.value); });
    return s;
  }

  // ---------- step 1: the job ----------
  function body1() {
    var p = state.p, b = p.book, j = P.job(b);
    var out = [h('p', { class: 'lead' }, 'Which job is the book about? Every chapter, prompt and cover is written for it.')];
    out.push(field('The job', jobSelect(b.job, function (v) { b.job = v; changed(true); }), j.custom ? null : 'Not in the list? Pick "Another job" at the bottom.', 'fJob'));
    if (j.custom) {
      var plural = text('fJobPlural', b.jobPlural, { maxlength: 60 }, function (v) { b.jobPlural = v; changed(); });
      var fieldIn = text('fJobField', b.jobField, { maxlength: 80 }, function (v) { b.jobField = v; changed(); });
      out.push(h('div', { class: 'sub-box' }, [
        field(h('span', null, ['Job title, for one person ', h('span', { class: 'req' }, '*')]),
          text('fJobName', b.jobName, { maxlength: 60, placeholder: 'For example: Dental Hygienist' }, function (v) { b.jobName = v; changed(); }), null, 'fJobName'),
        field('More than one', plural, 'Leave it empty to use the gray text.', 'fJobPlural'),
        field('The line of work, in a few words', fieldIn, 'For example: dental hygiene. Used in the prompts and chapter notes.', 'fJobField'),
        (function () {
          var ta = h('textarea', { class: 'textarea short', id: 'fJobAbout', rows: 2, maxlength: 300, placeholder: 'For example: they clean teeth, take X-rays and teach patients about oral health.' });
          ta.value = b.jobAbout;
          ta.addEventListener('input', function () { b.jobAbout = ta.value; changed(); });
          return field('What the job is about (optional)', ta, 'A sentence for the AI chat, so its questions fit the job.', 'fJobAbout');
        })()
      ]));
      live.push(function () { var jj = P.job(b); plural.placeholder = P.pluralOf(jj.name); fieldIn.placeholder = 'the work of ' + P.pluralOf(jj.name).toLowerCase(); });
    }
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Who reads it?'), h('div', { class: 'cards stacked' }, P.AUDIENCES.map(function (a) {
      return radio('audience', a.label, a.hint, b.audience === a.id, function () { b.audience = a.id; changed(true); });
    }))]));
    out.push(field('Where do the readers live?', select('fCountry', P.COUNTRIES.map(function (c) { return { v: c.id, t: c.label }; }), b.country, function (v) { b.country = v; changed(); }),
      'Laws, ranks, licenses and spelling follow this country.', 'fCountry'));

    out.push(h('h3', { class: 'sub-head' }, 'Title and author'));
    var title = text('fTitle', b.title, { maxlength: 120 }, function (v) { b.title = v; changed(); });
    var ideas = h('div', { class: 'chips ideas' });
    var sub = h('textarea', { class: 'textarea short', id: 'fSub', rows: 2, maxlength: 200 });
    sub.value = b.subtitle;
    sub.addEventListener('input', function () { b.subtitle = sub.value; changed(); });
    var hero = text('fHero', b.hero, { maxlength: 24, autocapitalize: 'characters' }, function (v) { b.hero = v; changed(); });
    var author = text('fAuthor', b.author, { maxlength: 80, placeholder: 'For example: Break Room Press' }, function (v) { b.author = v; changed(); });
    var derived = h('p', { class: 'derived' });
    live.push(function () {
      var jj = P.job(b), chs = P.chapters(p);
      title.placeholder = P.titleIdeas(p)[0];
      sub.placeholder = P.subtitleIdea(p);
      hero.placeholder = jj.hero;
      derived.textContent = 'Chapters will read like "' + chs.slice(0, 3).map(function (c) { return c.title; }).join('", "') + '". The cover shows ' + P.hero(b) + ' in big letters.';
      ideas.innerHTML = '';
      P.titleIdeas(p).forEach(function (t) {
        ideas.appendChild(h('button', { type: 'button', class: 'chip-btn small', onclick: function () { b.title = t; title.value = t; changed(); } }, t));
      });
    });
    live[live.length - 1]();
    if (live.length > 1) live[0]();
    out.push(h('div', { class: 'field' }, [h('label', { for: 'fTitle' }, 'Book title'), title, h('div', { class: 'hint' }, 'Leave it empty to use the gray text, or click an idea:'), ideas]));
    out.push(field('Subtitle', sub, 'Leave it empty to use the gray text. The number in it follows your chapters.', 'fSub'));
    out.push(field('Big word on the cover', hero, 'The job in one or two short words. Leave it empty to use the gray text.', 'fHero'));
    out.push(field(h('span', null, ['Pen name ', h('span', { class: 'req' }, '*')]), author, 'Printed on the cover and the title page.', 'fAuthor'));
    out.push(derived);
    out.push(next(2, 'Next: chapters'));
    return out;
  }

  // ---------- step 2: chapters and pages ----------
  function body2() {
    var p = state.p, plan = p.plan, b = p.book, e = p.extras;
    var out = [h('p', { class: 'lead' }, 'Pick what the book covers. You can change this later; questions you already have stay with their chapter.')];
    // the chapter names as they read for this job
    var named = P.chapters(Object.assign({}, p, { plan: Object.assign({}, plan, { topics: P.TOPICS.map(function (t) { return t.id; }) }) }));
    var grid = h('div', { class: 'topic-grid' }), count = h('span', { class: 'count-note' });
    function showCount() { count.textContent = plan.topics.length + ' picked'; }
    named.forEach(function (t) {
      grid.appendChild(check(t.title, t.sub, plan.topics.indexOf(t.id) !== -1, function (on) {
        var ids = plan.topics.filter(function (x) { return x !== t.id; });
        if (on) ids.push(t.id);
        plan.topics = P.TOPICS.map(function (x) { return x.id; }).filter(function (id) { return ids.indexOf(id) !== -1; });
        showCount();
        changed();
      }));
    });
    showCount();
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, ['Chapters ', count]), grid, h('div', { class: 'hint' }, '8 to 12 chapters makes a book like the bestsellers (200 to 400 questions).')]));
    var perNote = h('span', { class: 'unit' });
    live.push(function () { var n = P.chapters(p).length; perNote.textContent = '× ' + n + (n === 1 ? ' chapter = ' : ' chapters = ') + n * plan.perChapter + ' questions'; });
    live[live.length - 1]();
    out.push(h('div', { class: 'field' }, [h('label', { for: 'fPer' }, 'Questions in each chapter'), h('div', { class: 'row' }, [
      select('fPer', [10, 15, 20, 25, 30, 40].map(function (n) { return { v: n, t: String(n) }; }), plan.perChapter, function (v) { plan.perChapter = +v; changed(); }), perNote])]));
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Kinds of question'), h('div', { class: 'cards' }, [
      radio('tf', 'Mixed', 'Multiple choice, plus about 1 in 5 true or false', plan.tf, function () { plan.tf = true; changed(true); }),
      radio('tf', 'Multiple choice only', 'Every question has A, B, C and D', !plan.tf, function () { plan.tf = false; changed(true); })
    ])]));
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Where the answers go'), h('div', { class: 'cards' }, [
      radio('answers', 'After each chapter', 'With a fun fact and a score line', plan.answers !== 'back', function () { plan.answers = 'chapter'; changed(true); }),
      radio('answers', 'All at the back', 'One answer key at the end', plan.answers === 'back', function () { plan.answers = 'back'; changed(true); })
    ])]));
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Extra pages'), h('div', { class: 'stack' }, [
      check('Did You Know?', 'A page of fun facts about the job, before chapter 1', e.facts, function (v) { e.facts = v; changed(); }),
      check('Score card and ranks', 'A score table for up to 4 players and five ranks to earn, from rookie to legend', e.ranks, function (v) { e.ranks = v; changed(); }),
      check('Stories from the job', 'Story questions with lines to write on (good for retirement gifts)', e.stories, function (v) { e.stories = v; changed(); }),
      check('Certificate of achievement', 'A framed page to fill in when the book is done', e.certificate, function (v) { e.certificate = v; changed(); })
    ])]));
    out.push(h('h3', { class: 'sub-head' }, 'Page size and print'));
    out.push(field('Page size', select('fTrim', CX.kdp.TRIMS.map(function (t) { return { v: t.id, t: t.label + ' – ' + t.hint }; }), b.trim, function (v) { b.trim = v; changed(); }), null, 'fTrim'));
    out.push(field('Text size', select('fPrint', Object.keys(CX.layout.PRINT).map(function (k) { return { v: k, t: CX.layout.PRINT[k].label }; }), b.print, function (v) { b.print = v; changed(); }),
      'Regular suits most readers. 16 pt is the size KDP asks for when a book is labeled "Large Print".', 'fPrint'));
    out.push(field('Paper', select('fPaper', CX.kdp.PAPERS.map(function (x) { return { v: x.id, t: x.label }; }), b.paper, function (v) { b.paper = v; changed(); }), null, 'fPaper'));
    var est = h('p', { class: 'derived' });
    live.push(function () {
      var n = estimatePages(), max = CX.kdp.maxPages(b.trim, b.paper);
      est.textContent = 'When every question is in, the book has about ' + n + ' pages.' +
        (n > max ? ' That is more than KDP prints at this size (' + max + '): pick fewer questions.' : n < CX.kdp.SPINE_TEXT_MIN_PAGES ? ' The spine shows the title from ' + CX.kdp.SPINE_TEXT_MIN_PAGES + ' pages.' : '');
    });
    live[live.length - 1]();
    out.push(est);
    out.push(next(3, 'Next: write the questions'));
    return out;
  }

  // The page count with every chapter full, from a copy filled with typical questions.
  function estimatePages() {
    var c = U.clone(state.p), per = c.plan.perChapter;
    P.chapters(c).forEach(function (ch) {
      var have = c.questions[ch.id] || [];
      for (var k = have.length; k < per; k++) {
        have.push(c.plan.tf && k % 5 === 4
          ? { q: 'The first nursing school in the United States opened its doors in the year 1873.', o: ['True', 'False'], a: 0, f: 'A short fun fact about the answer that runs about one line long.' }
          : { q: 'Which famous nurse founded the first professional school of nursing at a London hospital?', o: ['Clara Barton', 'Florence Nightingale', 'Mary Seacole', 'Edith Cavell'], a: k % 4, f: 'A short fun fact about the answer that runs about one line long.' });
      }
      c.questions[ch.id] = have;
    });
    if (!c.ai.welcome.length) c.ai.welcome = ['x '.repeat(50), 'x '.repeat(40), 'x '.repeat(30)];
    if (!c.ai.facts.length) c.ai.facts = new Array(16).fill('A fun fact about the job, with a real number in it, about one line long.');
    if (!c.ai.stories.length) c.ai.stories = new Array(12).fill('What do you remember most about your very first day on the job?');
    if (c.ai.ranks.length < CX.prompts.RANKS) c.ai.ranks = new Array(CX.prompts.RANKS).fill('A Rank Title|A short and kind comment about this score.');
    return CX.layout.layoutBook(c, {}).pages.length;
  }

  // ---------- step 3: the prompts ----------
  function extrasNote(p) {
    var e = p.extras, parts = ['the welcome letter'];
    if (e.facts) parts.push('the fun facts');
    if (e.ranks) parts.push('five score ranks');
    if (e.stories) parts.push('the story prompts');
    parts.push('the back cover text');
    var t = parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] + '.';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function body3() {
    var p = state.p, list = CX.prompts.list(p);
    if (state.sel == null || state.sel >= list.length) state.sel = CX.prompts.next(p);
    var cur = list[state.sel];
    var out = [h('ol', { class: 'howto' }, [
      h('li', null, ['Click ', h('b', null, 'Copy prompt'), '.']),
      h('li', null, ['Click ', h('b', null, 'Open ChatGPT'), ', paste (Ctrl+V) and press Enter.']),
      h('li', null, ['When it has finished, click ', h('b', null, 'Copy code'), ' on its reply (or select the whole reply and copy it).']),
      h('li', null, ['Paste it in the box below and click ', h('b', null, 'Add to book'), '.'])
    ])];
    // which prompt
    var dots = h('div', { class: 'pn-dots' });
    list.forEach(function (pr, i) {
      dots.appendChild(h('button', {
        type: 'button', class: 'pn-dot' + (pr.done ? ' done' : '') + (i === state.sel ? ' sel' : ''), title: CX.prompts.label(pr) + (pr.done ? ' (done)' : ''),
        'aria-label': 'Prompt ' + pr.no + (pr.done ? ', done' : ''), onclick: function () { state.sel = i; state.result = null; renderBody(); }
      }, pr.done ? '✓' : String(pr.no)));
    });
    var doneN = list.filter(function (x) { return x.done; }).length;
    out.push(h('div', { class: 'pn-head' }, [h('b', null, 'Your prompts'), h('span', { class: 'chip ' + (doneN === list.length ? 'done' : 'todo') }, doneN + ' of ' + list.length + ' done')]));
    out.push(dots);

    var panel = h('div', { class: 'prompt-panel' });
    panel.appendChild(h('div', { class: 'pn-title' }, [h('b', null, 'Prompt ' + cur.no + ' of ' + list.length), cur.done ? h('span', { class: 'chip done' }, 'Done') : null]));
    if (cur.kind === 'questions') {
      var ul = h('ul', { class: 'pn-chapters' });
      cur.chapters.forEach(function (ch) {
        var n = Math.min(p.plan.perChapter, (p.questions[ch.id] || []).length);
        ul.appendChild(h('li', { class: n >= p.plan.perChapter ? 'full' : '' }, [h('span', null, ch.title), h('span', { class: 'n' }, n + ' / ' + p.plan.perChapter)]));
      });
      panel.appendChild(ul);
      if (cur.done) panel.appendChild(h('p', { class: 'hint' }, 'These chapters are full. To replace questions, remove some under "Your chapters" first; the prompt then asks only for the missing ones.'));
    } else {
      panel.appendChild(h('p', { class: 'pn-note' }, extrasNote(p)));
    }
    var promptText = CX.prompts.text(p, cur);
    panel.appendChild(h('div', { class: 'actions first' }, [
      dom.copyButton('Copy prompt', function () { return CX.prompts.text(state.p, cur); }, 'btn btn-primary'),
      h('a', { class: 'btn', href: CHATGPT, target: '_blank', rel: 'noopener noreferrer' }, 'Open ChatGPT ↗')
    ]));
    var peek = h('details', { class: 'peek' }, [h('summary', null, 'See the prompt'), h('textarea', { class: 'textarea', readonly: true, rows: 8, 'aria-label': 'The prompt' })]);
    peek.querySelector('textarea').value = promptText;
    panel.appendChild(peek);
    out.push(panel);

    var ta = h('textarea', { class: 'textarea paste', id: 'fPaste', placeholder: 'Paste ChatGPT’s whole reply here', spellcheck: 'false' });
    out.push(h('div', { class: 'field' }, [h('label', { for: 'fPaste' }, 'ChatGPT’s reply'), ta]));
    out.push(h('div', { class: 'actions first' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { addReply(ta.value, cur); } }, 'Add to book')));
    var res = h('div', { class: 'result' });
    if (state.result) res.appendChild(state.result);
    out.push(res);
    out.push(h('p', { class: 'hint' }, 'Claude, Gemini or Copilot work the same way. Any reply can go in this box: the app finds its chapters by their names.'));

    // what the book has
    out.push(h('h3', { class: 'sub-head' }, 'Your chapters'));
    var rows = h('ul', { class: 'ch-list' });
    P.chapters(p).forEach(function (ch, i) {
      var n = Math.min(p.plan.perChapter, (p.questions[ch.id] || []).length), full = n >= p.plan.perChapter;
      rows.appendChild(h('li', { class: full ? 'full' : '' }, [
        h('span', { class: 'no' }, String(i + 1)),
        h('span', { class: 'ct' }, ch.title),
        h('span', { class: 'n' }, n + ' / ' + p.plan.perChapter),
        h('button', { type: 'button', class: 'mini', disabled: !(p.questions[ch.id] || []).length, onclick: function () { viewChapter(ch); } }, 'View')
      ]));
    });
    out.push(rows);
    var ai = p.ai, ex = [];
    ex.push((ai.welcome.length ? '✓ ' : '– ') + 'Welcome letter');
    if (p.extras.facts) ex.push((ai.facts.length ? '✓ ' + ai.facts.length + ' ' : '– ') + 'fun facts');
    if (p.extras.ranks) ex.push((CX.prompts.hasExtra(p, 'ranks') ? '✓ ' : '– ') + 'ranks');
    if (p.extras.stories) ex.push((ai.stories.length ? '✓ ' + ai.stories.length + ' ' : '– ') + 'story prompts');
    ex.push((ai.blurb ? '✓ ' : '– ') + 'Back cover text');
    out.push(h('p', { class: 'extras-line' }, ex.join('   ·   ')));
    var spread = CX.questions.letterSpread(p), tf = CX.questions.trueFalseCount(p);
    if (spread.some(Boolean)) {
      out.push(h('p', { class: 'hint' }, 'Right answers by letter: A ' + spread[0] + ' · B ' + spread[1] + ' · C ' + spread[2] + ' · D ' + spread[3] +
        (tf ? ', plus ' + U.plural(tf, 'true-or-false question') : '') + '. The app shuffles the choices so no letter gives the game away.'));
    }
    out.push(next(4, 'Next: check and download'));
    return out;
  }

  function addReply(text, cur) {
    var p = state.p;
    if (!text.trim()) { state.result = msg('err', 'The box is empty. Paste ChatGPT’s reply into it first.'); renderBody(); return; }
    var kind = CX.reader.kind(text);
    if (kind === 'unknown') {
      state.result = msg('err', 'This does not look like a reply to one of the prompts.', ['Copy the whole reply: the Copy code button above ChatGPT’s block copies all of it.', 'Make sure you pasted the reply, not the prompt.']);
      renderBody(); return;
    }
    if (kind === 'extras') {
      var r = CX.questions.addExtras(p, CX.reader.readExtras(text));
      if (!r.got.length) { state.result = msg('err', 'Nothing could be added from this reply.', r.short.length ? r.short : ['Check that you pasted the reply to the last prompt.']); renderBody(); return; }
      state.result = msg(r.short.length ? 'warn' : 'ok', 'Added: ' + r.got.join(', ') + '.', r.short);
    } else {
      var parsed = CX.reader.readQuestions(text);
      var rep = CX.questions.addReply(p, parsed, cur.kind === 'questions' ? cur.chapters : []);
      var n = rep.added.reduce(function (s, x) { return s + x.n; }, 0), notes = [];
      if (rep.repeats) notes.push(U.plural(rep.repeats, 'question was', 'questions were') + ' already in the book, so they were left out.');
      if (rep.extra) notes.push(U.plural(rep.extra, 'question was', 'questions were') + ' more than the chapter needs, so they were left out.');
      if (rep.skipped) {
        var why = {};
        parsed.skipped.forEach(function (s) { why[s.why] = (why[s.why] || 0) + 1; });
        notes.push(U.plural(rep.skipped, 'question was', 'questions were') + ' incomplete and left out (' + Object.keys(why).map(function (k) { return why[k] + ': ' + k; }).join('; ') + '). Copy the prompt again to get replacements.');
      }
      if (rep.unplaced) notes.push(U.plural(rep.unplaced, 'question', 'questions') + ' did not match a chapter. Select the prompt they answer, then paste again.');
      if (!n) {
        state.result = msg('err', 'No new questions were added.', notes.length ? notes : ['Check that you pasted the reply to this prompt.']);
        renderBody(); return;
      }
      state.result = msg('ok', 'Added ' + U.plural(n, 'question') + ': ' + rep.added.map(function (x) { return x.chapter.title + ' (' + x.n + ')'; }).join(', ') + '.', notes);
    }
    state.sel = CX.prompts.next(p);
    var l = CX.prompts.list(p);
    if (l.every(function (x) { return x.done; })) state.result.appendChild(h('div', { class: 'fix-help' }, 'Every prompt is done. Look through the book on the right, then go on to the cover.'));
    changed(true);
  }

  // The questions of one chapter, with a remove button for each.
  function viewChapter(ch) {
    var p = state.p, list = p.questions[ch.id] || [];
    var body = h('ol', { class: 'q-list' });
    function draw() {
      body.innerHTML = '';
      list.forEach(function (q, i) {
        body.appendChild(h('li', null, [
          h('div', { class: 'q' }, q.q),
          h('div', { class: 'a' }, 'Answer: ' + 'ABCDEF'[q.a] + ') ' + q.o[q.a]),
          h('button', { type: 'button', class: 'mini danger-text', onclick: function () { list.splice(i, 1); draw(); changed(true); } }, 'Remove')
        ]));
      });
      if (!list.length) body.appendChild(h('li', { class: 'empty' }, 'No questions in this chapter.'));
    }
    draw();
    openModal(ch.title, body, [
      { label: 'Remove all', danger: true, run: function () { list.length = 0; draw(); changed(true); } },
      { label: 'Close', primary: true }
    ]);
  }

  function openModal(title, bodyEl, actions) {
    var back = document.getElementById('modal'), prev = document.activeElement;
    document.getElementById('modalTitle').textContent = title;
    var body = document.getElementById('modalBody');
    body.innerHTML = '';
    body.appendChild(bodyEl);
    var acts = document.getElementById('modalActions');
    acts.innerHTML = '';
    function close() { back.hidden = true; back.classList.remove('wide'); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    actions.forEach(function (a) {
      acts.appendChild(h('button', { type: 'button', class: a.primary ? 'btn btn-primary' : 'btn' + (a.danger ? ' danger-text' : ''), onclick: function () { if (a.run) a.run(); if (!a.run || a.close) close(); } }, a.label));
    });
    document.addEventListener('keydown', onKey, true);
    back.classList.add('wide');
    back.hidden = false;
    acts.lastChild.focus();
  }

  // ---------- cover mode ----------
  function coverBody() {
    var p = state.p, c = p.cover, b = p.book, pages = state.printPages || estimatePages();
    var D = CX.cover, out = [h('p', { class: 'lead' }, 'Pick one of ' + D.DESIGNS.length + ' templates. The cover is made for your page size and page count, with the spine width KDP asks for.')];

    // the templates: real thumbnails of this book's front, filtered by group
    var group = state.coverGroup || 'all', btns = [], current = h('span', { class: 'design-current' });
    var designs = h('div', { class: 'designs', role: 'radiogroup', 'aria-label': 'Cover template' });
    var filters = h('div', { class: 'design-filters', role: 'group', 'aria-label': 'Show templates' });
    [{ id: 'all', label: 'All ' + D.DESIGNS.length }].concat(D.GROUPS).forEach(function (g) {
      var fb = h('button', { type: 'button', class: 'chip-btn', 'aria-pressed': String(group === g.id) }, g.label);
      fb.addEventListener('click', function () {
        group = state.coverGroup = g.id;
        Array.prototype.forEach.call(filters.children, function (x) { x.setAttribute('aria-pressed', String(x === fb)); });
        showDesigns();
      });
      filters.appendChild(fb);
    });
    D.DESIGNS.forEach(function (d) {
      var art = h('span', { class: 'design-art' });
      var db = h('button', { type: 'button', class: 'design', role: 'radio', title: d.hint }, [art, h('span', { class: 'design-label' }, d.label)]);
      db.addEventListener('click', function () {
        // a new template starts in its own colors
        if (c.design === d.id && !c.palette) return;
        c.design = d.id; c.palette = '';
        markCover(); changed();
      });
      btns.push({ d: d, el: db, art: art });
      designs.appendChild(db);
    });
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, ['Template ', current]), filters, designs]));

    var pals = h('div', { class: 'palettes', role: 'radiogroup', 'aria-label': 'Colors' }), palBtns = [], own = h('i');
    [''].concat(D.PALETTES.map(function (pl) { return pl.id; })).forEach(function (id) {
      var pl = id ? D.palette(id) : null;
      var pb = h('button', { type: 'button', class: 'pal', role: 'radio', title: id ? null : 'The colors the template was made with' },
        [id ? h('i', { style: 'background:' + pl.bg + ';box-shadow:inset -9px 0 0 ' + pl.title }) : own, id ? pl.label : 'Template']);
      pb.addEventListener('click', function () { if (c.palette === id) return; c.palette = id; markCover(); changed(); });
      palBtns.push({ id: id, el: pb });
      pals.appendChild(pb);
    });
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Colors'), pals]));

    function markCover() {
      var d = D.design(c.design), ownPal = D.palette(d.pal);
      current.textContent = '· ' + d.label + (c.palette ? ' in ' + D.palette(c.palette).label : '');
      btns.forEach(function (x) { var on = x.d.id === d.id; x.el.classList.toggle('on', on); x.el.setAttribute('aria-checked', String(on)); });
      palBtns.forEach(function (x) { var on = x.id === (c.palette && D.palette(c.palette).id === c.palette ? c.palette : ''); x.el.classList.toggle('on', on); x.el.setAttribute('aria-checked', String(on)); });
      palBtns[0].el.firstChild.setAttribute('style', 'background:' + ownPal.bg + ';box-shadow:inset -9px 0 0 ' + ownPal.title);
    }
    // thumbnails in each template's own colors, drawn only for the templates on show and kept
    // until the words, size or page count change
    function showDesigns() {
      var key = JSON.stringify([b.title, b.subtitle, b.author, b.hero, b.job, b.jobName, b.jobPlural, b.audience, b.trim, b.print, b.paper, state.printPages, p.seed,
        CX.questions.total(p), P.questionCount(p)]);
      var copy = null;
      btns.forEach(function (x) {
        x.el.hidden = group !== 'all' && x.d.group !== group;
        if (x.el.hidden || x.key === key) return;
        var ck = key + '|' + x.d.id;
        if (!thumbs[ck]) {
          copy = copy || U.clone(p);
          copy.cover.design = x.d.id; copy.cover.palette = '';
          var cv = CX.cover.build(copy, state.printPages || pages);
          thumbs[ck] = CX.svg.renderCover(cv, { crop: { x: cv.guides.spineX1, y: 0, w: cv.W - cv.guides.spineX1, h: cv.H } });
        }
        x.art.innerHTML = thumbs[ck];
        x.key = key;
      });
    }
    markCover();
    showDesigns();
    live.push(dom.debounce(showDesigns, 400));

    // the words on the cover: the same fields as the book pages, so both always match
    out.push(h('h3', { class: 'sub-head' }, 'Words on the cover'));
    var title = text('cTitle', b.title, { maxlength: 120, placeholder: P.titleIdeas(p)[0] }, function (v) { b.title = v; changed(); });
    var sub = h('textarea', { class: 'textarea short', id: 'cSub', rows: 2, maxlength: 200, placeholder: P.subtitleIdea(p) });
    sub.value = b.subtitle;
    sub.addEventListener('input', function () { b.subtitle = sub.value; changed(); });
    var hero = text('cHero', b.hero, { maxlength: 24, placeholder: P.job(b).hero, autocapitalize: 'characters' }, function (v) { b.hero = v; changed(); });
    var author = text('cAuthor', b.author, { maxlength: 80 }, function (v) { b.author = v; changed(); });
    var blurb = h('textarea', { class: 'textarea', id: 'cBlurb', rows: 5, maxlength: 900, placeholder: 'Comes from the last prompt in step 3, or type your own.' });
    blurb.value = p.ai.blurb;
    blurb.addEventListener('input', function () { p.ai.blurb = blurb.value; changed(); });
    out.push(field('Title', title, 'Leave it empty to use the gray text.', 'cTitle'));
    out.push(field('Big word on the front', hero, 'When the title contains this word, the title is split around it.', 'cHero'));
    out.push(field('Subtitle', sub, null, 'cSub'));
    out.push(field('Pen name', author, null, 'cAuthor'));
    out.push(field('Back cover text', blurb, 'The list of what is inside is added under it.', 'cBlurb'));

    var dims = CX.kdp.cover(b.trim, pages, b.paper);
    out.push(h('p', { class: 'derived' }, 'Full cover ' + dims.width.toFixed(3) + ' × ' + dims.height.toFixed(3) + ' in, spine ' + dims.spine.toFixed(3) + ' in for ' + pages + ' pages.' +
      (dims.spineText ? ' The title is printed on the spine.' : ' KDP prints spine text from ' + CX.kdp.SPINE_TEXT_MIN_PAGES + ' pages, so the spine stays plain.')));
    out.push(h('p', { class: 'hint' }, 'Download the cover again whenever the page count changes: the spine width follows it.'));
    out.push(h('div', { class: 'actions' }, [
      h('button', { type: 'button', class: 'btn btn-primary', onclick: downloadCover }, 'Download cover PDF'),
      h('button', { type: 'button', class: 'btn', onclick: function () { openStep(4); } }, 'Back to the book pages')
    ]));
    return out;
  }

  // ---------- step 4: check and download ----------
  function body4() {
    var p = state.p, book = CX.layout.layoutBook(p, {}), items = CX.checklist.run(p, book);
    var ul = h('ul', { class: 'checklist' });
    items.forEach(function (it) {
      ul.appendChild(h('li', { class: it.ok ? 'ok' : 'bad' }, [
        h('span', { class: 'mark' }, it.ok ? '✓' : '!'),
        h('span', null, [h('b', null, it.label), h('span', { class: 'detail' }, it.detail),
          it.ok ? null : h('button', { type: 'button', class: 'link-btn', onclick: function () { openStep(it.step); } }, 'Go to step ' + it.step)])
      ]));
    });
    var t = CX.kdp.trim(p.book.trim);
    return [
      ul,
      h('div', { class: 'actions first' }, [
        h('button', { type: 'button', class: 'btn btn-primary', onclick: downloadBook }, 'Download book PDF'),
        h('button', { type: 'button', class: 'btn', onclick: function () { setMode('cover'); } }, 'Make the cover')
      ]),
      h('h3', { class: 'sub-head' }, 'Upload to KDP'),
      h('ul', { class: 'safety' }, [
        h('li', null, 'Ink and paper: Black & white interior, ' + CX.kdp.paper(p.book.paper).label.toLowerCase() + '.'),
        h('li', null, 'Trim size: ' + t.label + '. Bleed: No bleed.'),
        h('li', null, 'Manuscript: the book PDF. Cover: "Upload a cover you already have", the cover PDF.'),
        h('li', null, 'KDP asks whether AI helped make the book. The questions were written with an AI chat, so answer yes for the text.'),
        h('li', null, 'Read the questions once before you publish: AI facts are usually right, but not always. Rules and ranks differ between countries.'),
        h('li', null, 'Use the job in your title and keywords, but not trademarks (brand names, logos or the names of associations).')
      ])
    ];
  }

  // ---------- steps ----------
  var STEPS = [
    { n: 1, title: 'The job', body: body1, chip: function (p) { var j = P.job(p.book), ok = !!p.book.author.trim() && (!j.custom || !!p.book.jobName.trim()); return { t: (j.general ? 'Jobs & careers' : j.custom && !p.book.jobName.trim() ? 'Type the job' : j.name), ok: ok }; } },
    { n: 2, title: 'Chapters and pages', body: body2, chip: function (p) { var n = P.chapters(p).length; return { t: n + (n === 1 ? ' chapter · ' : ' chapters · ') + n * p.plan.perChapter + ' questions', ok: n > 0 }; } },
    { n: 3, title: 'Write the questions with ChatGPT', body: body3, chip: function (p) { var l = CX.prompts.list(p), d = l.filter(function (x) { return x.done; }).length; return { t: d + ' of ' + l.length + ' prompts', ok: d === l.length }; } },
    { n: 4, title: 'Check and download', body: body4, chip: function (p) { var it = CX.checklist.run(p, { pages: { length: state.printPages } }), bad = it.filter(function (x) { return !x.ok; }).length; return { t: bad ? bad + ' to fix' : 'Ready', ok: !bad }; } }
  ];

  // The sidebar: the book steps, or in cover mode the one cover panel.
  function renderSteps() {
    var ol = document.getElementById('steps');
    ol.innerHTML = '';
    if (state.mode === 'cover') {
      ol.appendChild(h('li', { class: 'step open solo', id: 'stepCover' }, [
        h('div', { class: 'step-head' }, [h('span', { class: 'step-title' }, 'Book cover'), h('span', { class: 'chip todo' })]),
        h('div', { class: 'step-body' })
      ]));
    } else {
      STEPS.forEach(function (s) {
        var head = h('button', { type: 'button', class: 'step-head', 'aria-expanded': String(state.open === s.n), onclick: function () { openStep(state.open === s.n ? 0 : s.n); } }, [
          h('span', { class: 'step-num' }, String(s.n)), h('span', { class: 'step-title' }, s.title), h('span', { class: 'chip todo' })
        ]);
        ol.appendChild(h('li', { class: 'step' + (state.open === s.n ? ' open' : ''), id: 'step' + s.n }, [head, h('div', { class: 'step-body', hidden: state.open !== s.n })]));
      });
    }
    renderHeads();
    renderBody();
  }

  function renderHeads() {
    if (state.mode === 'cover') {
      var cc = document.querySelector('#stepCover .chip');
      if (cc) cc.textContent = CX.cover.design(state.p.cover.design).label + ' · ' + state.printPages + ' pages';
      return;
    }
    STEPS.forEach(function (s) {
      var li = document.getElementById('step' + s.n);
      if (!li) return;
      var c = s.chip(state.p), chip = li.querySelector('.chip');
      chip.textContent = c.t;
      chip.className = 'chip ' + (c.ok === true ? 'done' : c.ok === false && s.n === 4 ? 'fix' : 'todo');
      li.classList.toggle('state-done', c.ok === true);
    });
  }

  function renderBody() {
    live = [];
    if (state.mode === 'cover') {
      var cb = document.querySelector('#stepCover .step-body');
      cb.innerHTML = '';
      dom.append(cb, coverBody());
      return;
    }
    STEPS.forEach(function (s) {
      var body = document.getElementById('step' + s.n).querySelector('.step-body');
      body.innerHTML = '';
      if (state.open === s.n) dom.append(body, s.body());
    });
  }

  function openStep(n) {
    state.open = n;
    state.result = null;
    if (state.mode !== 'book') { setMode('book'); return; }
    renderSteps();
    var li = document.getElementById('step' + n);
    if (li) li.scrollIntoView({ block: 'nearest' });
  }

  // Book pages or book cover: the header switch swaps the sidebar, the preview and the download.
  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    state.result = null;
    document.getElementById('btnViewBook').setAttribute('aria-pressed', String(mode === 'book'));
    document.getElementById('btnViewCover').setAttribute('aria-pressed', String(mode === 'cover'));
    document.getElementById('app').classList.toggle('mode-cover', mode === 'cover');
    document.getElementById('btnDownloadLabel').textContent = mode === 'cover' ? 'Download cover PDF' : 'Download book PDF';
    renderSteps();
    document.getElementById('steps').scrollTop = 0;
    renderPreview();
  }

  // ---------- preview ----------
  function renderPreview() {
    var p = state.p;
    var print = CX.layout.layoutBook(p, {});
    state.printPages = print.pages.length;
    if (state.mode === 'cover') CX.preview.showCover(CX.cover.build(p, print.pages.length));
    else CX.preview.update(CX.layout.layoutBook(p, { draft: true }), p.seed);
    renderHeads();
  }

  // ---------- downloads ----------
  function slug() { return U.slugify(P.bookTitle(state.p)); }

  function progress(f) {
    var b = document.getElementById('btnDownload');
    if (f == null) { b.classList.remove('is-busy'); b.style.removeProperty('--p'); return; }
    b.classList.add('is-busy');
    b.style.setProperty('--p', Math.round(f * 100) + '%');
  }

  async function downloadBook() {
    if (state.busy) return;
    var p = state.p, book = CX.layout.layoutBook(p, {}), items = CX.checklist.run(p, book);
    var bad = items.filter(function (i) { return !i.ok; });
    if (bad.length) {
      var go = await dom.confirm({
        title: 'The book is not finished yet',
        body: bad.map(function (i) { return i.label + ': ' + i.detail; }).concat(['You can download it anyway to have a look.']),
        actions: [{ label: 'Keep working', value: false }, { label: 'Download anyway', value: true, primary: true }]
      });
      if (!go) return;
    }
    state.busy = true;
    try {
      var id = U.hashHex('interior|' + p.seed + '|' + book.pages.length) + U.hashHex(JSON.stringify(p.questions).length + '|' + p.seed);
      var bytes = await CX.pdf.build(book, { fileId: id }, progress);
      dom.download(bytes, slug() + '-interior.pdf', 'application/pdf');
      dom.toast('Book PDF saved: ' + book.pages.length + ' pages.');
    } catch (e) {
      dom.toast('The PDF could not be made: ' + e.message);
    } finally { state.busy = false; progress(null); }
  }

  async function downloadCover() {
    if (state.busy) return;
    var p = state.p, pages = CX.layout.layoutBook(p, {}).pages.length;
    if (pages < CX.kdp.MIN_PAGES) { dom.toast('Add questions first: the cover needs the final page count (at least ' + CX.kdp.MIN_PAGES + ' pages).'); return; }
    state.busy = true;
    try {
      var cv = CX.cover.build(p, pages);
      var bytes = await CX.pdf.buildCover(cv, { fileId: U.hashHex('cover|' + p.seed) + U.hashHex(pages + '|' + p.cover.design + p.cover.palette) });
      dom.download(bytes, slug() + '-cover.pdf', 'application/pdf');
      dom.toast('Cover PDF saved for ' + pages + ' pages. Download it again if the page count changes.');
    } catch (e) {
      dom.toast('The cover PDF could not be made: ' + e.message);
    } finally { state.busy = false; }
  }

  // ---------- project file ----------
  function hasWork(p) { return Object.keys(p.questions).some(function (k) { return (p.questions[k] || []).length; }) || p.ai.welcome.length > 0; }

  function exportProject() {
    dom.download(JSON.stringify(state.p, null, 1), slug() + '-project.json', 'application/json');
    dom.toast('Project file saved. Open it later with "Open project file".');
  }

  function importProject(file) {
    var fr = new FileReader();
    fr.onload = async function () {
      var data;
      try { data = JSON.parse(fr.result); } catch (e) { dom.toast('That file is not a project file from this app.'); return; }
      if (!data || !data.book || !data.plan || (data.app && data.app !== 'occupation-trivia')) { dom.toast('That file is not a project file from this app.'); return; }
      if (hasWork(state.p)) {
        var ok = await dom.confirm({ title: 'Open this project?', body: 'The book you have open now is replaced. Save it first if you want to keep it.', actions: [{ label: 'Cancel', value: false }, { label: 'Open it', value: true, primary: true }] });
        if (!ok) return;
      }
      state.p = P.normalize(data);
      state.sel = null; state.result = null;
      openStep(firstOpenStep()); renderPreview();
      dom.toast('Project opened.');
    };
    fr.onerror = function () { dom.toast('That file could not be read.'); };
    fr.readAsText(file);
  }

  async function startOver() {
    var ok = await dom.confirm({ title: 'Start a new book?', body: ['Everything in this book is cleared: settings, questions and cover.', 'Save the project file first if you want to keep it.'], actions: [{ label: 'Cancel', value: false }, { label: 'Clear and start over', value: true, danger: true }] });
    if (!ok) return;
    state.p = P.newProject();
    state.sel = null; state.result = null;
    openStep(1); renderPreview();
  }

  function firstOpenStep() {
    var p = state.p;
    if (!hasWork(p)) return 1;
    return CX.prompts.list(p).every(function (x) { return x.done; }) ? 4 : 3;
  }

  // ---------- start ----------
  function start() {
    state.p = P.newProject();
    state.open = firstOpenStep();
    CX.preview.init();
    renderSteps();
    renderPreview();
    document.getElementById('btnDownload').addEventListener('click', function () { if (state.mode === 'cover') downloadCover(); else downloadBook(); });
    document.getElementById('btnViewBook').addEventListener('click', function () { setMode('book'); });
    document.getElementById('btnViewCover').addEventListener('click', function () { setMode('cover'); });
    document.getElementById('btnExport').addEventListener('click', exportProject);
    var fi = document.getElementById('fileImport');
    document.getElementById('btnImport').addEventListener('click', function () { fi.value = ''; fi.click(); });
    fi.addEventListener('change', function () { if (fi.files[0]) importProject(fi.files[0]); });
    document.getElementById('btnStartOver').addEventListener('click', startOver);
    // the work is lost with the tab, so ask before leaving once there is some
    root.addEventListener('beforeunload', function (e) { if (hasWork(state.p)) { e.preventDefault(); e.returnValue = ''; } });
    document.getElementById('loading').hidden = true;
    var app = document.getElementById('app');
    app.hidden = false;
    app.setAttribute('aria-busy', 'false');
  }

  function boot() { dom.registerFonts().then(start, start); }

  CX.app = { state: state, openStep: openStep, setMode: setMode, addReply: addReply, renderPreview: renderPreview };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
