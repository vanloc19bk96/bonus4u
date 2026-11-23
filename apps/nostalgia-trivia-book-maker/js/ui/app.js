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
    P.applyTarget(state.p);
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
  // A list of ids in the order of the full list (decades oldest first, themes as listed).
  function ordered(all, ids) { return all.map(function (x) { return x.id; }).filter(function (id) { return ids.indexOf(id) !== -1; }); }

  // ---------- step 1: the decades and the book ----------
  var QUICK = [
    { label: '1950s to 1990s', ids: ['1950s', '1960s', '1970s', '1980s', '1990s'] },
    { label: '1950s to 1970s', ids: ['1950s', '1960s', '1970s'] },
    { label: '1960s to 1980s', ids: ['1960s', '1970s', '1980s'] },
    { label: '1980s & 1990s', ids: ['1980s', '1990s'] },
    { label: 'All seven', ids: P.DECADES.map(function (d) { return d.id; }) }
  ];

  function body1() {
    var p = state.p, b = p.book, plan = p.plan;
    var out = [h('p', { class: 'lead' }, 'Which decades does the book visit? Each decade becomes one part of the book, with its own rounds of questions.')];
    var grid = h('div', { class: 'topic-grid decades-grid' }), count = h('span', { class: 'count-note' });
    function showCount() { count.textContent = plan.decades.length + ' picked'; }
    P.DECADES.forEach(function (d) {
      grid.appendChild(check(d.id, d.nick, plan.decades.indexOf(d.id) !== -1, function (on) {
        var ids = plan.decades.filter(function (x) { return x !== d.id; });
        if (on) ids.push(d.id);
        plan.decades = ordered(P.DECADES, ids);
        showCount();
        changed();
      }));
    });
    showCount();
    var quick = h('div', { class: 'chips' }, QUICK.map(function (q) {
      return h('button', { type: 'button', class: 'chip-btn small', onclick: function () { plan.decades = q.ids.slice(); changed(true); } }, q.label);
    }));
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, ['Decades ', count]), grid, h('div', { class: 'hint' }, 'Quick picks:'), quick]));
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Who reads it?'), h('div', { class: 'cards stacked' }, P.AUDIENCES.map(function (a) {
      return radio('audience', a.label, a.hint, b.audience === a.id, function () { b.audience = a.id; changed(true); });
    }))]));
    out.push(field('Where did the readers grow up?', select('fCountry', P.COUNTRIES.map(function (c) { return { v: c.id, t: c.label }; }), b.country, function (v) { b.country = v; changed(); }),
      'The music, TV, brands and prices in the questions follow this country.', 'fCountry'));

    out.push(h('h3', { class: 'sub-head' }, 'Title and author'));
    var title = text('fTitle', b.title, { maxlength: 120 }, function (v) { b.title = v; changed(); });
    var ideas = h('div', { class: 'chips ideas' });
    var sub = h('textarea', { class: 'textarea short', id: 'fSub', rows: 2, maxlength: 200 });
    sub.value = b.subtitle;
    sub.addEventListener('input', function () { b.subtitle = sub.value; changed(); });
    var hero = text('fHero', b.hero, { maxlength: 24, autocapitalize: 'characters' }, function (v) { b.hero = v; changed(); });
    var author = text('fAuthor', b.author, { maxlength: 80, placeholder: 'For example: Memory Lane Press' }, function (v) { b.author = v; changed(); });
    var derived = h('p', { class: 'derived' });
    live.push(function () {
      var ds = P.decades(p);
      title.placeholder = P.titleIdeas(p)[0];
      sub.placeholder = P.subtitleIdea(p);
      hero.placeholder = P.upper(P.heroIdea(p));
      derived.textContent = (ds.length ? 'The book has ' + U.plural(ds.length, 'part') + ': ' + ds.map(function (d) { return d.title; }).join(', ') + '.' : 'Pick at least one decade.') +
        ' The cover shows ' + P.hero(p) + ' in big letters.';
      ideas.innerHTML = '';
      P.titleIdeas(p).forEach(function (t) {
        ideas.appendChild(h('button', { type: 'button', class: 'chip-btn small', onclick: function () { b.title = t; title.value = t; changed(); } }, t));
      });
    });
    live[live.length - 1]();
    out.push(h('div', { class: 'field' }, [h('label', { for: 'fTitle' }, 'Book title'), title, h('div', { class: 'hint' }, 'Leave it empty to use the gray text, or click an idea:'), ideas]));
    out.push(field('Subtitle', sub, 'Leave it empty to use the gray text. The number in it follows your rounds.', 'fSub'));
    out.push(field('Big word on the cover', hero, 'One or two short words, for example NOSTALGIA, RETRO or 1980s. Leave it empty to use the gray text.', 'fHero'));
    out.push(field(h('span', null, ['Pen name ', h('span', { class: 'req' }, '*')]), author, 'Printed on the cover and the title page.', 'fAuthor'));
    out.push(derived);
    out.push(next(2, 'Next: rounds and pages'));
    return out;
  }

  // ---------- step 2: rounds and pages ----------
  function body2() {
    var p = state.p, plan = p.plan, b = p.book, e = p.extras;
    var out = [h('p', { class: 'lead' }, 'Pick the rounds every decade has. You can change this later; questions you already have stay with their round.')];
    var grid = h('div', { class: 'topic-grid' }), count = h('span', { class: 'count-note' });
    function showCount() { count.textContent = plan.themes.length + ' picked'; }
    P.THEMES.forEach(function (t) {
      grid.appendChild(check(t.title, t.sub, plan.themes.indexOf(t.id) !== -1, function (on) {
        var ids = plan.themes.filter(function (x) { return x !== t.id; });
        if (on) ids.push(t.id);
        plan.themes = ordered(P.THEMES, ids);
        showCount();
        changed();
      }));
    });
    showCount();
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, ['Rounds in every decade ', count]), grid,
      h('div', { class: 'hint' }, 'The bestsellers have 300 to 600 questions: for example 5 decades × 6 rounds × 10 questions = 300.')]));
    // the total to aim for, or the questions per round picked by hand
    var targetSel = select('fTarget', [{ v: 0, t: 'Pick per round myself' }].concat(P.TARGETS.map(function (n) { return { v: n, t: n + ' questions' }; })), plan.target, function (v) {
      plan.target = +v;
      changed(true);
    });
    var perOpts = P.PER_ROUND.slice();
    if (perOpts.indexOf(plan.perRound) === -1) { perOpts.push(plan.perRound); perOpts.sort(function (a, b) { return a - b; }); }
    var perSel = select('fPer', perOpts.map(function (n) { return { v: n, t: String(n) }; }), plan.perRound, function (v) { plan.perRound = +v; plan.target = 0; changed(true); });
    perSel.disabled = plan.target > 0;
    var totalNote = h('div', { class: 'derived' }), perNote = h('span', { class: 'unit' });
    live.push(function () {
      var t = P.targetInfo(p), nd = P.decades(p).length, nt = P.themes(p).length;
      if (String(perSel.value) !== String(t.per)) {
        if (![].some.call(perSel.options, function (o) { return o.value === String(t.per); })) perSel.appendChild(h('option', { value: t.per }, String(t.per)));
        perSel.value = String(t.per);
      }
      perNote.textContent = '× ' + U.plural(nt, 'round') + ' × ' + U.plural(nd, 'decade') + ' = ' + t.total + ' questions';
      totalNote.className = 'derived' + (t.short ? ' warn-text' : '');
      totalNote.textContent = !t.rounds ? 'Pick decades and rounds first.'
        : !t.target ? 'The book has ' + t.total + ' questions (' + t.per + ' in each of ' + U.plural(t.rounds, 'round') + ').'
          : t.short ? 'Only ' + t.total + ' questions fit: ' + U.plural(t.rounds, 'round') + ' hold at most ' + P.MAX_PER + ' each. Add rounds or decades to reach ' + t.target + '.'
            : t.per + ' questions in each of ' + U.plural(t.rounds, 'round') + ' = ' + t.total + ' questions' + (t.over ? ' (every round gets the same number, so the total is rounded up from ' + t.target + ').' : '.');
    });
    live[live.length - 1]();
    out.push(h('div', { class: 'field' }, [h('label', { for: 'fTarget' }, 'Total questions in the book'), targetSel, totalNote]));
    out.push(h('div', { class: 'field' }, [h('label', { for: 'fPer' }, 'Questions in each round'), h('div', { class: 'row' }, [perSel, perNote]),
      h('div', { class: 'hint' }, plan.target > 0 ? 'Set from the total above. Pick "Pick per round myself" to choose it by hand.' : 'Picking a number here sets the total yourself.')]));
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Kinds of question'), h('div', { class: 'cards' }, [
      radio('tf', 'Mixed', 'Multiple choice, plus about 1 in 5 true or false', plan.tf, function () { plan.tf = true; changed(true); }),
      radio('tf', 'Multiple choice only', 'Every question has A, B, C and D', !plan.tf, function () { plan.tf = false; changed(true); })
    ])]));
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Where the answers go'), h('div', { class: 'cards' }, [
      radio('answers', 'After each decade', 'With a fun fact and a score line for every round', plan.answers !== 'back', function () { plan.answers = 'decade'; changed(true); }),
      radio('answers', 'All at the back', 'One answer key at the end of the book', plan.answers === 'back', function () { plan.answers = 'back'; changed(true); })
    ])]));
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Extra pages'), h('div', { class: 'stack' }, [
      check('A look back at each decade', 'An opener for every decade: a short intro, the decade at a glance year by year, and fun facts', e.eras, function (v) { e.eras = v; changed(); }),
      check('Remember When? pages', 'Memory prompts with lines to write on, for every decade (a lovely gift for parents and grandparents)', e.memories, function (v) { e.memories = v; changed(); }),
      check('This book belongs to', 'A gift page at the front, with lines for the name, who gave it and the date', e.belongs, function (v) { e.belongs = v; changed(); }),
      check('Score card and ranks', 'A score table for up to 4 players and five ranks to earn', e.ranks, function (v) { e.ranks = v; changed(); }),
      check('Certificate of achievement', 'A framed page to fill in when the book is done', e.certificate, function (v) { e.certificate = v; changed(); })
    ])]));
    out.push(h('h3', { class: 'sub-head' }, 'Page size and print'));
    out.push(field('Page size', select('fTrim', CX.kdp.TRIMS.map(function (t) { return { v: t.id, t: t.label + ' – ' + t.hint }; }), b.trim, function (v) { b.trim = v; changed(); }), null, 'fTrim'));
    out.push(field('Text size', select('fPrint', Object.keys(CX.layout.PRINT).map(function (k) { return { v: k, t: CX.layout.PRINT[k].label }; }), b.print, function (v) { b.print = v; changed(); }),
      'Seniors read best at 14 or 16 pt. KDP lets you call a book "Large Print" only from 16 pt.', 'fPrint'));
    out.push(field('Paper', select('fPaper', CX.kdp.PAPERS.map(function (x) { return { v: x.id, t: x.label }; }), b.paper, function (v) { b.paper = v; changed(); }), null, 'fPaper'));
    var est = h('p', { class: 'derived' });
    live.push(function () {
      var n = estimatePages(), max = CX.kdp.maxPages(b.trim, b.paper);
      est.textContent = 'When every question is in, the book has about ' + n + ' pages.' +
        (n > max ? ' That is more than KDP prints at this size (' + max + '): pick fewer questions, rounds or decades.' : n < CX.kdp.SPINE_TEXT_MIN_PAGES ? ' The spine shows the title from ' + CX.kdp.SPINE_TEXT_MIN_PAGES + ' pages.' : '');
    });
    live[live.length - 1]();
    out.push(est);
    out.push(next(3, 'Next: write the questions'));
    return out;
  }

  // The page count with every round and page full, from a copy filled with typical content.
  function estimatePages() {
    var c = U.clone(state.p), per = c.plan.perRound;
    P.rounds(c).forEach(function (r) {
      var have = c.questions[r.id] || [];
      for (var k = have.length; k < per; k++) {
        have.push(c.plan.tf && k % 5 === 4
          ? { q: 'Drive-in movie theaters were at their most popular in the late 1950s.', o: ['True', 'False'], a: 0, f: 'A short fun fact about the answer that runs about one line long.' }
          : { q: 'Which singer was known around the world as the King of Rock and Roll?', o: ['Elvis Presley', 'Buddy Holly', 'Chuck Berry', 'Fats Domino'], a: k % 4, f: 'A short fun fact about the answer that runs about one line long.' });
      }
      c.questions[r.id] = have;
    });
    P.decades(c).forEach(function (d) {
      var e = c.eras[d.id] || (c.eras[d.id] = { intro: [], timeline: [], facts: [], memories: [] });
      if (!e.intro.length) e.intro = ['x '.repeat(45), 'x '.repeat(40)];
      if (e.timeline.length < 5) e.timeline = new Array(8).fill(d.year + '|A happy moment of the decade, about one line long.');
      if (e.facts.length < 3) e.facts = new Array(5).fill('A fun fact about everyday life in the decade, about one line long.');
      if (e.memories.length < 3) e.memories = new Array(4).fill('What was your favorite song on the radio back then, and why?');
    });
    if (!c.ai.welcome.length) c.ai.welcome = ['x '.repeat(50), 'x '.repeat(40), 'x '.repeat(30)];
    if (c.ai.ranks.length < CX.prompts.RANKS) c.ai.ranks = new Array(CX.prompts.RANKS).fill('A Rank Title|A short and kind comment about this score.');
    return CX.layout.layoutBook(c, {}).pages.length;
  }

  // ---------- step 3: the prompts ----------
  function erasNote(p) {
    var parts = [];
    if (p.extras.eras) parts.push('the intro, the decade at a glance and fun facts');
    if (p.extras.memories) parts.push('the Remember When? memory prompts');
    return 'For every decade: ' + parts.join(', and ') + '.';
  }
  function extrasNote(p) {
    return 'The welcome letter, ' + (p.extras.ranks ? 'five score ranks ' : '') + 'and the back cover text.';
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
    panel.appendChild(h('div', { class: 'pn-title' }, [h('b', null, 'Prompt ' + cur.no + ' of ' + list.length + (cur.kind === 'questions' ? ' · ' + cur.decade.id : cur.kind === 'eras' ? ' · Decade pages' : '')), cur.done ? h('span', { class: 'chip done' }, 'Done') : null]));
    if (cur.kind === 'questions') {
      var ul = h('ul', { class: 'pn-chapters' });
      cur.rounds.forEach(function (r) {
        var n = Math.min(p.plan.perRound, (p.questions[r.id] || []).length);
        ul.appendChild(h('li', { class: n >= p.plan.perRound ? 'full' : '' }, [h('span', null, r.full), h('span', { class: 'n' }, n + ' / ' + p.plan.perRound)]));
      });
      panel.appendChild(ul);
      if (cur.done) panel.appendChild(h('p', { class: 'hint' }, 'These rounds are full. To replace questions, remove some under "Your decades" first; the prompt then asks only for the missing ones.'));
    } else if (cur.kind === 'eras') {
      panel.appendChild(h('p', { class: 'pn-note' }, erasNote(p)));
      var ue = h('ul', { class: 'pn-chapters' });
      P.decades(p).forEach(function (d) {
        var miss = CX.prompts.eraMissing(p, d.id);
        ue.appendChild(h('li', { class: miss.length ? '' : 'full' }, [h('span', null, d.title), h('span', { class: 'n' }, miss.length ? 'needs ' + miss.map(function (k) { return CX.prompts.ERA[k].label; }).join(', ') : 'done')]));
      });
      panel.appendChild(ue);
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
    out.push(h('p', { class: 'hint' }, 'Claude, Gemini or Copilot work the same way. Any reply can go in this box: the app finds its decades and rounds by their names.'));

    // what the book has
    out.push(h('h3', { class: 'sub-head' }, 'Your decades'));
    var rows = h('ul', { class: 'ch-list' }), per = p.plan.perRound;
    P.decades(p).forEach(function (d, i) {
      var rs = P.roundsOf(p, d.id), want = rs.length * per;
      var n = rs.reduce(function (s, r) { return s + Math.min(per, (p.questions[r.id] || []).length); }, 0);
      var any = rs.some(function (r) { return (p.questions[r.id] || []).length; });
      rows.appendChild(h('li', { class: n >= want && want ? 'full' : '' }, [
        h('span', { class: 'no' }, String(i + 1)),
        h('span', { class: 'ct' }, d.title),
        h('span', { class: 'n' }, n + ' / ' + want),
        h('button', { type: 'button', class: 'mini', disabled: !any, onclick: function () { viewDecade(d); } }, 'View')
      ]));
    });
    out.push(rows);
    var ai = p.ai, ex = [];
    ex.push((ai.welcome.length ? '✓ ' : '– ') + 'Welcome letter');
    if (CX.prompts.eraWanted(p).length) {
      var eraDone = P.decades(p).filter(function (d) { return !CX.prompts.eraMissing(p, d.id).length; }).length;
      ex.push((eraDone && eraDone === P.decades(p).length ? '✓ ' : '– ') + 'Decade pages ' + eraDone + '/' + P.decades(p).length);
    }
    if (p.extras.ranks) ex.push((CX.prompts.hasExtra(p, 'ranks') ? '✓ ' : '– ') + 'ranks');
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
    } else if (kind === 'eras') {
      var er = CX.questions.addEras(p, CX.reader.readEras(text)), notes0 = er.short.slice();
      if (er.other.length) notes0.push('Left out ' + er.other.join(', ') + ': ' + (er.other.length === 1 ? 'that decade is' : 'those decades are') + ' not in the book (step 1).');
      if (!er.got.length) { state.result = msg('err', 'Nothing could be added from this reply.', notes0.length ? notes0 : ['Check that you pasted the reply to the "Decade pages" prompt.']); renderBody(); return; }
      state.result = msg(er.short.length ? 'warn' : 'ok', 'Added the decade pages for ' + er.got.join(', ') + '.', notes0);
    } else {
      var parsed = CX.reader.readQuestions(text);
      var rep = CX.questions.addReply(p, parsed, cur.kind === 'questions' ? cur.rounds : []);
      var n = rep.added.reduce(function (s, x) { return s + x.n; }, 0), notes = [];
      if (rep.repeats) notes.push(U.plural(rep.repeats, 'question was', 'questions were') + ' already in the book, so they were left out.');
      if (rep.extra) notes.push(U.plural(rep.extra, 'question was', 'questions were') + ' more than the round needs, so they were left out.');
      if (rep.skipped) {
        var why = {};
        parsed.skipped.forEach(function (s) { why[s.why] = (why[s.why] || 0) + 1; });
        notes.push(U.plural(rep.skipped, 'question was', 'questions were') + ' incomplete and left out (' + Object.keys(why).map(function (k) { return why[k] + ': ' + k; }).join('; ') + '). Copy the prompt again to get replacements.');
      }
      if (rep.unplaced) notes.push(U.plural(rep.unplaced, 'question', 'questions') + ' did not match a round. Select the prompt they answer, then paste again.');
      if (!n) {
        state.result = msg('err', 'No new questions were added.', notes.length ? notes : ['Check that you pasted the reply to this prompt.']);
        renderBody(); return;
      }
      state.result = msg('ok', 'Added ' + U.plural(n, 'question') + ': ' + rep.added.map(function (x) { return x.round.full + ' (' + x.n + ')'; }).join(', ') + '.', notes);
    }
    state.sel = CX.prompts.next(p);
    var l = CX.prompts.list(p);
    if (l.every(function (x) { return x.done; })) state.result.appendChild(h('div', { class: 'fix-help' }, 'Every prompt is done. Look through the book on the right, then go on to the cover.'));
    changed(true);
  }

  // The questions of one decade, round by round, with a remove button for each.
  function viewDecade(d) {
    var p = state.p, body = h('div', { class: 'q-rounds' });
    function draw() {
      body.innerHTML = '';
      P.roundsOf(p, d.id).forEach(function (r) {
        var list = p.questions[r.id] || [];
        body.appendChild(h('h3', { class: 'sub-head' }, r.title + ' (' + Math.min(list.length, p.plan.perRound) + ' / ' + p.plan.perRound + ')'));
        var ol = h('ol', { class: 'q-list' });
        list.forEach(function (q, i) {
          ol.appendChild(h('li', null, [
            h('div', { class: 'q' }, q.q),
            h('div', { class: 'a' }, 'Answer: ' + 'ABCDEF'[q.a] + ') ' + q.o[q.a]),
            h('button', { type: 'button', class: 'mini danger-text', onclick: function () { list.splice(i, 1); draw(); changed(true); } }, 'Remove')
          ]));
        });
        if (!list.length) ol.appendChild(h('li', { class: 'empty' }, 'No questions in this round yet.'));
        body.appendChild(ol);
      });
    }
    draw();
    openModal(d.title, body, [
      { label: 'Remove all', danger: true, run: function () { P.roundsOf(p, d.id).forEach(function (r) { delete p.questions[r.id]; }); draw(); changed(true); } },
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
      var key = JSON.stringify([b.title, b.subtitle, b.author, b.hero, b.audience, b.trim, b.print, b.paper, state.printPages, p.seed,
        p.plan.decades, p.plan.themes, p.plan.perRound, p.extras.memories, CX.questions.total(p), P.questionCount(p)]);
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
    var hero = text('cHero', b.hero, { maxlength: 24, placeholder: P.upper(P.heroIdea(p)), autocapitalize: 'characters' }, function (v) { b.hero = v; changed(); });
    var author = text('cAuthor', b.author, { maxlength: 80 }, function (v) { b.author = v; changed(); });
    var blurb = h('textarea', { class: 'textarea', id: 'cBlurb', rows: 5, maxlength: 900, placeholder: 'Comes from the last prompt in step 3, or type your own.' });
    blurb.value = p.ai.blurb;
    blurb.addEventListener('input', function () { p.ai.blurb = blurb.value; changed(); });
    out.push(field('Title', title, 'Leave it empty to use the gray text.', 'cTitle'));
    out.push(field('Big word on the front', hero, 'NOSTALGIA, RETRO, 1980s ... When the title contains this word, the title is split around it.', 'cHero'));
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
        h('li', null, 'Read the questions once before you publish: AI facts are usually right, but not always, and years and prices are easy to mix up.'),
        h('li', null, p.book.print === 'xl' ? 'Your text is 16 pt, so you may say "Large Print" in the title and pick the large print option on KDP.'
          : 'Your text is under 16 pt: leave "Large Print" out of the title and keywords (KDP needs 16 pt for that).'),
        h('li', null, 'Use words like nostalgia, the decades, trivia and seniors in your title and keywords, but no trademarks: no band, show, movie, toy or brand names, and no celebrity names.')
      ])
    ];
  }

  // ---------- steps ----------
  var STEPS = [
    { n: 1, title: 'Decades and title', body: body1, chip: function (p) { var ok = !!p.book.author.trim() && P.decades(p).length > 0; return { t: P.decades(p).length ? P.range(p) : 'Pick decades', ok: ok }; } },
    { n: 2, title: 'Rounds and pages', body: body2, chip: function (p) { var n = P.themes(p).length; return { t: U.plural(n, 'round') + ' · ' + P.questionCount(p) + ' questions', ok: n > 0 && P.decades(p).length > 0 }; } },
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
  function hasWork(p) { return Object.keys(p.questions).some(function (k) { return (p.questions[k] || []).length; }) || Object.keys(p.eras).length > 0 || p.ai.welcome.length > 0; }

  function exportProject() {
    dom.download(JSON.stringify(state.p, null, 1), slug() + '-project.json', 'application/json');
    dom.toast('Project file saved. Open it later with "Open project file".');
  }

  function importProject(file) {
    var fr = new FileReader();
    fr.onload = async function () {
      var data;
      try { data = JSON.parse(fr.result); } catch (e) { dom.toast('That file is not a project file from this app.'); return; }
      if (!data || !data.book || !data.plan || (data.app && data.app !== 'nostalgia-trivia')) { dom.toast('That file is not a project file from this app.'); return; }
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
    var ok = await dom.confirm({ title: 'Start a new book?', body: ['Everything in this book is cleared: settings, questions, decade pages and cover.', 'Save the project file first if you want to keep it.'], actions: [{ label: 'Cancel', value: false }, { label: 'Clear and start over', value: true, danger: true }] });
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
  // the activate key screen first; it opens the app once a NAZO BOX bonus key is typed (js/ui/gate.js)
  function go() { root.NZBGate.open(boot); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})(window);
