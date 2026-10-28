/*
 * The app: a header switch between the book pages (four steps) and the cover, each with its own
 * sidebar and preview. Nothing is kept in the browser: the work lives in the open tab until it is
 * saved to a project file. Each step body is rebuilt only when its structure changes, so typing never loses focus.
 */
(function (root) {
  'use strict';
  var CX = root.CX, U = CX.util, P = CX.plan, dom = CX.dom, h = dom.h;
  var CHATGPT = 'https://chatgpt.com/';

  var state = { p: null, mode: 'book', open: 1, sel: null, result: null, printPages: 0, busy: false, otherDays: false };
  var live = [];          // small updaters for the open step (derived text that follows typing)
  var thumbs = {};        // cover template thumbnails (SVG) by words, size, page count and template

  var refresh = dom.debounce(renderPreview, 220);

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

  // A sentence box with a live letter count and ideas of the right length.
  function sentenceField(id, label, key, n, set) {
    var pl = state.p.plan;
    var inp = h('input', { class: 'input', id: id, value: pl[key], maxlength: 80, spellcheck: 'false' });
    var count = h('div', { class: 'letter-count' });
    var ideas = h('div', { class: 'chips ideas' });
    function show() {
      var have = P.letters(pl[key]).length, ok = have === n;
      count.className = 'letter-count ' + (ok ? 'ok' : 'bad');
      count.textContent = ok ? '✓ ' + n + ' letters, one for each day' : have + ' letters: it needs exactly ' + n + (have < n ? ' (' + (n - have) + ' more)' : ' (' + (have - n) + ' too many)');
    }
    inp.addEventListener('input', function () { pl[key] = inp.value; show(); changed(); });
    P.sentencesFor(n, set).forEach(function (s) {
      ideas.appendChild(h('button', { type: 'button', class: 'chip-btn small', onclick: function () { pl[key] = s; inp.value = s; show(); changed(); } }, s));
    });
    show();
    return h('div', { class: 'field' }, [h('label', { for: id }, label), inp, count,
      h('div', { class: 'hint' }, 'Spaces and punctuation do not count. Change it before you copy the prompts: each day’s words are asked to include its letter. Ideas:'), ideas]);
  }

  // ---------- step 1: the book ----------
  function body1() {
    var p = state.p, pl = p.plan, b = p.book;
    var out = [h('p', { class: 'lead' }, 'Who is the book for, how long is the countdown and what does the letter strip spell?')];
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Who will solve it?'), h('div', { class: 'cards' }, P.AUDIENCES.map(function (a) {
      return radio('aud', a.label, null, pl.audience === a.id, function () { pl.audience = a.id; Object.assign(pl, a.defaults); changed(true); });
    }))]));
    var custom = h('textarea', { class: 'textarea short', id: 'fCustom', rows: 2, maxlength: 300, placeholder: 'For example: a Christmas by the sea, with lighthouses, boats and seaside villages' });
    custom.value = pl.customTheme;
    custom.addEventListener('input', function () { pl.customTheme = custom.value; changed(); });
    out.push(field('Theme of the words', select('fTheme', P.THEMES.map(function (t) { return { v: t.id, t: t.title + ' – ' + t.sub }; }), pl.theme, function (v) { pl.theme = v; changed(true); }),
      null, 'fTheme'));
    if (pl.theme === 'custom') out.push(field('Your theme', custom, 'ChatGPT writes every day’s words around it.', 'fCustom'));
    var other = state.otherDays || P.PRESET_DAYS.indexOf(pl.days) === -1;
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Countdown'), h('div', { class: 'cards' }, [
      radio('days', '24 days', 'Dec 1–24, the classic Advent calendar', !other && pl.days === 24, function () { setDays(24); }),
      radio('days', '25 days', 'Dec 1–25, up to Christmas Day', !other && pl.days === 25, function () { setDays(25); }),
      radio('days', '12 days', 'Dec 13–24, the last twelve days', !other && pl.days === 12, function () { setDays(12); }),
      radio('days', 'Other length', P.MIN_DAYS + ' to 24 days, ending on Christmas Eve', other, function () { setDays(P.PRESET_DAYS.indexOf(pl.days) === -1 ? pl.days : 18, true); })
    ])]));
    if (other) {
      var opts = [];
      for (var n = P.MIN_DAYS; n <= 24; n++) opts.push({ v: n, t: n + ' days: December ' + (25 - n) + '–24' });
      out.push(field('How many days?', select('fDays', opts, pl.days, function (v) { setDays(+v, true); }),
        'The countdown always ends on Christmas Eve, so the book starts on December ' + P.firstDate(p) + '.', 'fDays'));
    }
    out.push(check('Add the Twelve Days bonus', '12 more grids from December 26 to January 6, with a strip of their own', pl.bonus, function (v) { pl.bonus = v; changed(true); }));
    out.push(h('h3', { class: 'sub-head' }, 'The hidden sentence'));
    out.push(h('p', { class: 'hint' }, 'One square in every grid has a thick border. Its letter goes on the letter strip, and on the last day the strip reads as this sentence.'));
    out.push(sentenceField('fSentence', 'Sentence for the ' + pl.days + ' days', 'sentence', pl.days));
    if (pl.bonus) out.push(sentenceField('fBonusSentence', 'Sentence for the Twelve Days', 'bonusSentence', 12, 'bonus'));

    out.push(h('h3', { class: 'sub-head' }, 'Title and author'));
    var title = h('input', { class: 'input', id: 'fTitle', value: b.title, maxlength: 140 });
    title.addEventListener('input', function () { b.title = title.value; changed(); });
    var ideas = h('div', { class: 'chips ideas' });
    var sub = h('textarea', { class: 'textarea short', id: 'fSub', rows: 2, maxlength: 220 });
    sub.value = b.subtitle;
    sub.addEventListener('input', function () { b.subtitle = sub.value; changed(); });
    var author = h('input', { class: 'input', id: 'fAuthor', value: b.author, maxlength: 80, placeholder: 'For example: Snowy Lane Press' });
    author.addEventListener('input', function () { b.author = author.value; changed(); });
    live.push(function () {
      title.placeholder = P.titleIdeas(p)[0];
      sub.placeholder = P.subtitleIdea(p);
      ideas.innerHTML = '';
      P.titleIdeas(p).forEach(function (t) {
        ideas.appendChild(h('button', { type: 'button', class: 'chip-btn small', onclick: function () { b.title = t; title.value = t; changed(); } }, t));
      });
    });
    live[live.length - 1]();
    out.push(h('div', { class: 'field' }, [h('label', { for: 'fTitle' }, 'Book title'), title, h('div', { class: 'hint' }, 'Leave it empty to use the gray text, or click an idea:'), ideas]));
    out.push(field('Subtitle', sub, 'Leave it empty to use the gray text.', 'fSub'));
    out.push(field(h('span', null, ['Pen name ', h('span', { class: 'req' }, '*')]), author, 'Printed on the cover and the title page.', 'fAuthor'));
    out.push(next(2, 'Next: puzzles and pages'));
    return out;
  }

  // other: the "Other length" card, which stays chosen even on 12 or 24 days
  function setDays(n, other) {
    var pl = state.p.plan;
    pl.days = P.validDays(n) || 24;
    state.otherDays = !!other;
    // swap in a sentence of the right length when the old one no longer fits
    if (P.letters(pl.sentence).length !== pl.days && P.sentencesFor(pl.days).length) pl.sentence = P.sentencesFor(pl.days)[0];
    changed(true);
  }

  // ---------- step 2: puzzles and pages ----------
  function body2() {
    var p = state.p, pl = p.plan, b = p.book;
    var out = [h('p', { class: 'lead' }, 'How big the grids are and what each day’s spread holds: the grid on the left page, the clues on the right.')];
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Grid size'), h('div', { class: 'cards' }, P.GRID_SIZES.map(function (g) {
      return radio('size', g.label, g.hint, pl.size === g.n, function () { pl.size = g.n; changed(true); });
    }))]));
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Each day'), h('div', { class: 'stack' }, [
      check('Easy start', P.audience(pl.audience).more ? 'Three answers printed in each grid in the first half, two after that' : pl.days >= 20 ? 'Three answers printed in each grid on days 1 to 6, two on days 7 to 12, then none' : 'A few answers printed in the first grids, fewer as the days go on', pl.headStart, function (v) { pl.headStart = v; changed(); }),
      check('A story line', 'One warm sentence that sets the scene for the day', pl.story, function (v) { pl.story = v; changed(); }),
      check('A memory question', 'A friendly question under the clues, with lines to write on', pl.memory, function (v) { pl.memory = v; changed(true); })
    ])]));
    if (pl.memory) out.push(field('Writing lines under the question', select('fLines', [0, 2, 3, 4, 5, 6].map(function (n) { return { v: n, t: n ? n + ' lines' : 'No lines' }; }), pl.lines, function (v) { pl.lines = +v; changed(); }),
      'Lines are dropped automatically on a day whose clues need the room.', 'fLines'));
    out.push(h('h3', { class: 'sub-head' }, 'Page size and print'));
    out.push(field('Page size', select('fTrim', CX.kdp.TRIMS.map(function (t) { return { v: t.id, t: t.label + ' – ' + t.hint }; }), b.trim, function (v) { b.trim = v; changed(); }), null, 'fTrim'));
    out.push(field('Text size', select('fPrint', Object.keys(CX.layout.PRINT).map(function (k) { return { v: k, t: CX.layout.PRINT[k].label }; }), b.print, function (v) { b.print = v; changed(); }),
      'Large print suits older eyes. The grid squares are always as big as the page allows.', 'fPrint'));
    out.push(field('Paper', select('fPaper', CX.kdp.PAPERS.map(function (x) { return { v: x.id, t: x.label }; }), b.paper, function (v) { b.paper = v; changed(); }), null, 'fPaper'));
    var est = h('p', { class: 'derived' });
    live.push(function () { est.textContent = 'When every day is in, the book has about ' + estimatePages() + ' pages: ' + P.days(p).length + ' two-page days, the week pages and the solutions.'; });
    live[live.length - 1]();
    out.push(est);
    out.push(next(3, 'Next: write the words'));
    return out;
  }

  // A rough page count for a finished book (without building every grid).
  function estimatePages() {
    var p = state.p, wk = P.weeks(p).length, days = P.days(p).length, t = CX.kdp.trim(p.book.trim);
    var perSol = t.w >= 7.5 ? 6 : t.w >= 6.5 ? 4 : 2;
    return 6 + wk * 2 + days * 2 + 2 + Math.ceil(days / perSol) + 1 + wk;
  }

  // ---------- step 3: the prompts ----------
  function body3() {
    var p = state.p, list = CX.prompts.list(p);
    if (state.sel == null || state.sel >= list.length) state.sel = CX.prompts.next(p);
    var cur = list[state.sel];
    var out = [h('ol', { class: 'howto' }, [
      h('li', null, ['Click ', h('b', null, 'Copy prompt'), '.']),
      h('li', null, ['Click ', h('b', null, 'Open ChatGPT'), ', paste (Ctrl+V) and press Enter.']),
      h('li', null, ['When it has finished, click ', h('b', null, 'Copy code'), ' on its reply (or select the whole reply and copy it).']),
      h('li', null, ['Paste it in the box below and click ', h('b', null, 'Add to book'), '. The app builds the grids.'])
    ])];
    var dots = h('div', { class: 'pn-dots' });
    list.forEach(function (pr, i) {
      dots.appendChild(h('button', {
        type: 'button', class: 'pn-dot' + (pr.done ? ' done' : '') + (i === state.sel ? ' sel' : ''), title: CX.prompts.title(pr) + (pr.done ? ' (done)' : ''),
        'aria-label': 'Prompt ' + pr.no + (pr.done ? ', done' : ''), onclick: function () { state.sel = i; state.result = null; renderBody(); }
      }, pr.done ? '✓' : String(pr.no)));
    });
    var doneN = list.filter(function (x) { return x.done; }).length;
    out.push(h('div', { class: 'pn-head' }, [h('b', null, 'Your prompts'), h('span', { class: 'chip ' + (doneN === list.length ? 'done' : 'todo') }, doneN + ' of ' + list.length + ' done')]));
    out.push(dots);

    var panel = h('div', { class: 'prompt-panel' });
    panel.appendChild(h('div', { class: 'pn-title' }, [h('b', null, 'Prompt ' + cur.no + ' of ' + list.length + ': ' + CX.prompts.title(cur)), cur.done ? h('span', { class: 'chip done' }, 'Done') : null]));
    if (cur.kind === 'days') {
      var ul = h('ul', { class: 'pn-chapters' });
      cur.days.forEach(function (day) {
        var st = CX.puzzles.status(p, day), d = p.days[day.id];
        ul.appendChild(h('li', { class: CX.prompts.dayDone(p, day) ? 'full' : '' }, [
          h('span', null, (day.set === 'bonus' ? 'Bonus ' : 'Day ') + day.no + (d && d.title ? ' · ' + d.title : '')),
          h('span', { class: 'n' }, st.state === 'ok' ? '✓ ' + st.pz.grid.entries.length + ' answers' : st.words + ' / ' + st.ask + ' words')]));
      });
      panel.appendChild(ul);
      var gs = P.grid(p.plan.size);
      panel.appendChild(h('p', { class: 'pn-note' }, 'ChatGPT is asked for ' + gs.ask + ' words a day, more than a ' + gs.label + ' grid holds: the app keeps the ones that cross best, so each puzzle has about ' + gs.target + ' answers.'));
      if (cur.done) panel.appendChild(h('p', { class: 'hint' }, 'These days are done. To replace words, open a day under "Your days" and remove some; the prompt then asks only for what is missing.'));
    } else {
      panel.appendChild(h('p', { class: 'pn-note' }, 'A welcome for each week page (' + P.weeks(p).length + '), the Christmas Eve note and the back cover text. Without them the book prints ready-made texts.'));
    }
    panel.appendChild(h('div', { class: 'actions first' }, [
      dom.copyButton('Copy prompt', function () { return CX.prompts.text(state.p, cur); }, 'btn btn-primary'),
      h('a', { class: 'btn', href: CHATGPT, target: '_blank', rel: 'noopener noreferrer' }, 'Open ChatGPT ↗')
    ]));
    var peek = h('details', { class: 'peek' }, [h('summary', null, 'See the prompt'), h('textarea', { class: 'textarea', readonly: true, rows: 8 })]);
    peek.addEventListener('toggle', function () { if (peek.open) peek.querySelector('textarea').value = CX.prompts.text(state.p, cur); });
    panel.appendChild(peek);
    out.push(panel);

    var ta = h('textarea', { class: 'textarea paste', id: 'fPaste', placeholder: 'Paste ChatGPT’s whole reply here', spellcheck: 'false' });
    out.push(h('div', { class: 'field' }, [h('label', { for: 'fPaste' }, 'ChatGPT’s reply'), ta]));
    out.push(h('div', { class: 'actions first' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { addReply(ta.value, cur); } }, 'Add to book')));
    var res = h('div', { class: 'result' });
    if (state.result) res.appendChild(state.result);
    out.push(res);
    out.push(h('p', { class: 'hint' }, 'Claude, Gemini or Copilot work the same way. The app reads the day numbers in any reply, so a reply can go in while another prompt is selected.'));

    out.push(h('h3', { class: 'sub-head' }, 'Your days'));
    var rows = h('ul', { class: 'ch-list days-list' });
    P.days(p).forEach(function (day) {
      var st = CX.puzzles.status(p, day), d = p.days[day.id];
      var gridTxt = st.pz ? st.pz.grid.entries.length + ' answers' : '–', cls = st.state === 'ok' ? 'full' : st.state === 'weak' ? 'weak' : st.state === 'empty' ? 'empty' : '';
      rows.appendChild(h('li', { class: cls }, [
        h('span', { class: 'no' }, (day.set === 'bonus' ? 'B' : '') + day.no),
        h('span', { class: 'ct' }, d && d.title ? d.title : h('i', { class: 'muted' }, day.date)),
        h('span', { class: 'n', title: st.words + ' words, ' + gridTxt + ' in the grid' }, st.state === 'empty' ? 'no words yet' : st.state === 'ok' ? '✓ ' + gridTxt : st.state === 'weak' ? gridTxt + ': too few' : st.words + ' of ' + st.ask + ' words'),
        h('button', { type: 'button', class: 'mini', disabled: !(d && d.words.length), onclick: function () { viewDay(day); } }, 'View')
      ]));
    });
    out.push(rows);
    var ai = p.ai, ex = [];
    ex.push((ai.weeks.length >= P.weeks(p).length ? '✓ ' : '– ') + 'Week pages');
    ex.push((ai.eve.length ? '✓ ' : '– ') + 'Christmas Eve note');
    ex.push((ai.blurb ? '✓ ' : '– ') + 'Back cover text');
    out.push(h('p', { class: 'extras-line' }, ex.join('   ·   ')));
    var t = CX.content.totals(p);
    if (t.clues) out.push(h('p', { class: 'hint' }, t.ready + ' of ' + t.days + ' grids ready · ' + t.clues + ' clues in the book so far.'));
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
      var got = CX.content.addExtras(p, CX.reader.readExtras(text));
      state.result = msg('ok', 'Added: ' + got.join(', ') + '.');
    } else {
      var parsed = CX.reader.readDays(text);
      var rep = CX.content.addReply(p, parsed, cur.kind === 'days' ? cur.days : []);
      var n = rep.added.reduce(function (s, r) { return s + r.n; }, 0), notes = [];
      if (rep.repeats) notes.push(U.plural(rep.repeats, 'word was', 'words were') + ' already in the book, so they were left out.');
      if (rep.extra) notes.push(U.plural(rep.extra, 'word was', 'words were') + ' more than a day can use, so they were left out.');
      if (rep.skipped) {
        var why = {};
        parsed.skipped.forEach(function (s) { why[s.why] = (why[s.why] || 0) + 1; });
        notes.push(U.plural(rep.skipped, 'word was', 'words were') + ' left out (' + Object.keys(why).map(function (k) { return why[k] + ': ' + k; }).join('; ') + ').');
      }
      if (rep.unplaced) notes.push(U.plural(rep.unplaced, 'word', 'words') + ' did not match a day. Select the prompt they answer, then paste again.');
      if (!n && !rep.texts) {
        state.result = msg('err', 'Nothing new was added.', notes.length ? notes : ['Check that you pasted the reply to this prompt.']);
        renderBody(); return;
      }
      var weak = rep.added.filter(function (r) { return CX.puzzles.status(p, r.day).state === 'weak'; });
      if (weak.length) notes.push('The grid for ' + weak.map(function (r) { return (r.day.set === 'bonus' ? 'bonus day ' : 'day ') + r.day.no; }).join(', ') + ' came out small. Copy the prompt again: it asks for a few more words.');
      state.result = msg('ok', n ? 'Added ' + U.plural(n, 'word') + ': ' + rep.added.map(function (r) { return (r.day.set === 'bonus' ? 'Bonus ' : 'Day ') + r.day.no + ' (' + r.n + ')'; }).join(', ') + '.' : 'Updated the day texts.', notes);
    }
    state.sel = CX.prompts.next(p);
    if (CX.prompts.list(p).every(function (x) { return x.done; })) state.result.appendChild(h('div', { class: 'fix-help' }, 'Every prompt is done. Look through the book on the right, then go on to the cover.'));
    changed(true);
  }

  // A small SVG of a day's grid (the solution, with the head-start answers and the thick square marked).
  function gridSvg(pz) {
    var g = pz.grid, cs = 22, W = g.cols * cs + 8, H = g.rows * cs + 8, s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" class="grid-svg" role="img" aria-label="The grid">'];
    for (var r = 0; r < g.rows; r++) for (var c = 0; c < g.cols; c++) {
      var ch = g.cells[r][c];
      if (!ch) continue;
      var x = 4 + c * cs, y = 4 + r * cs, k = r + ',' + c;
      s.push('<rect x="' + x + '" y="' + y + '" width="' + cs + '" height="' + cs + '" class="' + (g.givenCells[k] ? 'given' : 'sq') + '"/>');
      if (g.nums[k]) s.push('<text x="' + (x + 1.5) + '" y="' + (y + 7) + '" class="num">' + g.nums[k] + '</text>');
      s.push('<text x="' + (x + cs / 2) + '" y="' + (y + cs * 0.74) + '" class="ltr">' + ch + '</text>');
    }
    if (g.mark) s.push('<rect x="' + (4 + g.mark.c * cs + 1.5) + '" y="' + (4 + g.mark.r * cs + 1.5) + '" width="' + (cs - 3) + '" height="' + (cs - 3) + '" class="mark"/>');
    s.push('</svg>');
    return s.join('');
  }

  // One day: its grid, its words with a remove button each, a new grid.
  function viewDay(day) {
    var p = state.p, d = P.day(p, day.id);
    var body = h('div', { class: 'day-view' });
    function draw() {
      body.innerHTML = '';
      var st = CX.puzzles.status(p, day), pz = st.pz;
      var head = h('div', { class: 'day-view-head' });
      if (pz) {
        var art = h('div', { class: 'day-grid' });
        art.innerHTML = gridSvg(pz);
        head.appendChild(art);
      }
      var facts = [];
      if (pz) {
        facts.push(pz.grid.entries.length + ' of ' + d.words.length + ' words fit the grid (' + pz.grid.crossings + ' crossings).');
        if (pz.grid.letter) facts.push(pz.grid.mark ? 'The thick square holds ' + pz.grid.letter + ', letter ' + day.no + ' of the sentence.' : 'No square holds ' + pz.grid.letter + ': add words with that letter, or click New grid.');
        if (pz.grid.given.length) facts.push('Printed as a head start: ' + pz.grid.entries.filter(function (e) { return pz.grid.given.indexOf(e.dir + e.num) !== -1; }).map(function (e) { return e.w; }).join(', ') + ' (shaded).');
        pz.problems.forEach(function (x) { facts.push('⚠ ' + x.charAt(0).toUpperCase() + x.slice(1) + '.'); });
      }
      head.appendChild(h('div', { class: 'day-facts' }, [
        d.story ? h('p', { class: 'story' }, d.story) : null,
        d.question ? h('p', null, [h('b', null, 'Question: '), d.question]) : null,
        h('ul', null, facts.map(function (f) { return h('li', null, f); }))
      ]));
      body.appendChild(head);
      var used = {};
      if (pz) pz.grid.entries.forEach(function (e) { used[e.w] = e; });
      var ol = h('ol', { class: 'q-list words' });
      d.words.forEach(function (x, i) {
        var e = used[x.w];
        ol.appendChild(h('li', { class: e ? '' : 'unused' }, [
          h('div', { class: 'q' }, x.w + ' (' + x.w.length + ')'),
          h('div', { class: 'a' }, x.c + (e ? ' · ' + e.num + (e.dir === 'A' ? ' Across' : ' Down') : ' · not in this grid')),
          h('button', { type: 'button', class: 'mini danger-text', onclick: function () { d.words.splice(i, 1); draw(); changed(true); } }, 'Remove')
        ]));
      });
      body.appendChild(ol);
    }
    draw();
    openModal((day.set === 'bonus' ? 'Bonus day ' : 'Day ') + day.no + (d.title ? ': ' + d.title : ''), body, [
      { label: 'Remove all words', danger: true, run: function () { d.words.length = 0; draw(); changed(true); } },
      { label: 'New grid', run: function () { d.v = (d.v || 0) + 1; draw(); changed(true); } },
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

    var group = state.coverGroup || 'all', btns = [], current = h('span', { class: 'design-current' });
    var designs = h('div', { class: 'designs', role: 'radiogroup', 'aria-label': 'Cover template' });
    var filters = h('div', { class: 'design-filters', role: 'group', 'aria-label': 'Show templates' });
    [{ id: 'all', label: 'All ' + D.DESIGNS.length }].concat(D.GROUPS).forEach(function (g) {
      var bt = h('button', { type: 'button', class: 'chip-btn', 'aria-pressed': String(group === g.id) }, g.label);
      bt.addEventListener('click', function () {
        group = state.coverGroup = g.id;
        Array.prototype.forEach.call(filters.children, function (x) { x.setAttribute('aria-pressed', String(x === bt)); });
        showDesigns();
      });
      filters.appendChild(bt);
    });
    D.DESIGNS.forEach(function (d) {
      var art = h('span', { class: 'design-art' });
      var bt = h('button', { type: 'button', class: 'design', role: 'radio', title: d.hint }, [art, h('span', { class: 'design-label' }, d.label)]);
      bt.addEventListener('click', function () {
        if (c.design === d.id && !c.palette) return;
        c.design = d.id; c.palette = '';
        markCover(); changed();
      });
      btns.push({ d: d, el: bt, art: art });
      designs.appendChild(bt);
    });
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, ['Template ', current]), filters, designs]));

    var pals = h('div', { class: 'palettes', role: 'radiogroup', 'aria-label': 'Colors' }), palBtns = [], own = h('i');
    [''].concat(D.PALETTES.map(function (pl) { return pl.id; })).forEach(function (id) {
      var pl = id ? D.palette(id) : null;
      var bt = h('button', { type: 'button', class: 'pal', role: 'radio', title: id ? null : 'The colors the template was made with' },
        [id ? h('i', { style: 'background:' + pl.bg + ';box-shadow:inset -9px 0 0 ' + pl.title }) : own, id ? pl.label : 'Template']);
      bt.addEventListener('click', function () { if (c.palette === id) return; c.palette = id; markCover(); changed(); });
      palBtns.push({ id: id, el: bt });
      pals.appendChild(bt);
    });
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Colors'), pals]));

    function markCover() {
      var d = D.design(c.design), mine = D.palette(d.pal);
      current.textContent = '· ' + d.label + (c.palette ? ' in ' + D.palette(c.palette).label : '');
      btns.forEach(function (x) { var on = x.d.id === d.id; x.el.classList.toggle('on', on); x.el.setAttribute('aria-checked', String(on)); });
      palBtns.forEach(function (x) { var on = x.id === (c.palette && D.palette(c.palette).id === c.palette ? c.palette : ''); x.el.classList.toggle('on', on); x.el.setAttribute('aria-checked', String(on)); });
      palBtns[0].el.firstChild.setAttribute('style', 'background:' + mine.bg + ';box-shadow:inset -9px 0 0 ' + mine.title);
    }
    function showDesigns() {
      var pl = p.plan, key = JSON.stringify([b.title, b.subtitle, b.author, b.trim, b.print, b.paper, pl.days, pl.bonus, pl.audience, pl.theme, state.printPages, p.seed]);
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

    out.push(h('h3', { class: 'sub-head' }, 'Words on the cover'));
    var title = h('input', { class: 'input', id: 'cTitle', value: b.title, maxlength: 140, placeholder: P.titleIdeas(p)[0] });
    title.addEventListener('input', function () { b.title = title.value; changed(); });
    var sub = h('textarea', { class: 'textarea short', id: 'cSub', rows: 2, maxlength: 220, placeholder: P.subtitleIdea(p) });
    sub.value = b.subtitle;
    sub.addEventListener('input', function () { b.subtitle = sub.value; changed(); });
    var author = h('input', { class: 'input', id: 'cAuthor', value: b.author, maxlength: 80 });
    author.addEventListener('input', function () { b.author = author.value; changed(); });
    var blurb = h('textarea', { class: 'textarea', id: 'cBlurb', rows: 5, maxlength: 900, placeholder: 'Comes from the last prompt in step 3, or type your own.' });
    blurb.value = p.ai.blurb;
    blurb.addEventListener('input', function () { p.ai.blurb = blurb.value; changed(); });
    out.push(field('Title', title, 'Leave it empty to use the gray text.', 'cTitle'));
    out.push(field('Subtitle', sub, null, 'cSub'));
    out.push(field('Pen name', author, null, 'cAuthor'));
    out.push(field('Back cover text', blurb, 'The list of what is inside is added under it.', 'cBlurb'));

    var dims = CX.kdp.cover(b.trim, pages, b.paper);
    out.push(h('p', { class: 'derived' }, 'Full cover ' + dims.width.toFixed(3) + ' × ' + dims.height.toFixed(3) + ' in, spine ' + dims.spine.toFixed(3) + ' in for ' + pages + ' pages.' +
      (dims.spineText ? ' The title is printed on the spine.' : ' KDP prints spine text from ' + CX.kdp.SPINE_TEXT_MIN_PAGES + ' pages, so the spine stays plain.')));
    out.push(h('p', { class: 'hint' }, 'Download the cover again whenever the page count changes: the spine width follows it.'));
    out.push(h('div', { class: 'actions' }, [
      h('button', { type: 'button', class: 'btn btn-primary', onclick: downloadCover }, 'Download cover PDF'),
      h('button', { type: 'button', class: 'btn', onclick: function () { downloadCanva('cover'); } }, 'Cover for Canva (.pptx)'),
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
        h('li', null, 'KDP asks whether AI helped make the book. The words and clues were written with an AI chat, so answer yes for the text.'),
        h('li', null, 'Solve two or three grids yourself before you publish: AI clues are usually right, but not always.')
      ]),
      h('h3', { class: 'sub-head' }, 'Edit in Canva'),
      h('div', { class: 'actions first' }, [
        h('button', { type: 'button', class: 'btn', onclick: function () { downloadCanva('book'); } }, 'Book for Canva (.pptx)')
      ]),
      h('ul', { class: 'safety' }, [
        h('li', null, 'Canva turns an uploaded PDF into its own text boxes and often jumbles them. Upload this .pptx instead: every page comes in at the trim size with each line of text editable and the grids as shapes.'),
        h('li', null, 'The book uses the fonts Source Serif 4 and Source Sans 3. If Canva says a font is missing, pick it (or a close one) in the font list.'),
        h('li', null, 'From Canva, download as "PDF Print" for KDP. The PDF from this app stays the safest file to upload.')
      ])
    ];
  }

  // ---------- steps ----------
  var STEPS = [
    { n: 1, title: 'The book', body: body1, chip: function (p) { return { t: p.plan.days + ' days' + (p.plan.bonus ? ' + 12' : '') + ' · ' + P.audience(p.plan.audience).label, ok: !!p.book.author.trim() && P.sentenceOk(p, 'main') && (!p.plan.bonus || P.sentenceOk(p, 'bonus')) }; } },
    { n: 2, title: 'Puzzles and pages', body: body2, chip: function (p) { return { t: p.plan.size + '×' + p.plan.size + ' · ' + CX.kdp.trim(p.book.trim).label, ok: true }; } },
    { n: 3, title: 'Write the words with ChatGPT', body: body3, chip: function (p) { var l = CX.prompts.list(p), d = l.filter(function (x) { return x.done; }).length; return { t: d + ' of ' + l.length + ' prompts', ok: d === l.length }; } },
    { n: 4, title: 'Check and download', body: body4, chip: function (p) { var it = CX.checklist.run(p, { pages: { length: state.printPages } }), bad = it.filter(function (x) { return !x.ok; }).length; return { t: bad ? bad + ' to fix' : 'Ready', ok: !bad }; } }
  ];

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
  // Grids take a moment to build the first time, so the busy note shows before the work starts.
  function renderPreview() {
    var busy = document.getElementById('busy');
    busy.hidden = false;
    setTimeout(function () {
      try {
        var p = state.p;
        var print = CX.layout.layoutBook(p, {});
        state.printPages = print.pages.length;
        if (state.mode === 'cover') CX.preview.showCover(CX.cover.build(p, print.pages.length));
        else CX.preview.update(CX.layout.layoutBook(p, { draft: true }), p.seed);
        renderHeads();
      } finally { busy.hidden = true; }
    }, 16);
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
      var id = U.hashHex('interior|' + p.seed + '|' + book.pages.length) + U.hashHex(JSON.stringify(p.days).length + '|' + p.seed);
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
    if (pages < CX.kdp.MIN_PAGES) { dom.toast('Add the days first: the cover needs the final page count (at least ' + CX.kdp.MIN_PAGES + ' pages).'); return; }
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

  // An editable copy of the same pages for Canva (a .pptx, which Canva imports box by box).
  async function downloadCanva(kind) {
    if (state.busy) return;
    var p = state.p, book = CX.layout.layoutBook(p, {}), PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (kind === 'cover' && book.pages.length < CX.kdp.MIN_PAGES) { dom.toast('Add the days first: the cover needs the final page count (at least ' + CX.kdp.MIN_PAGES + ' pages).'); return; }
    state.busy = true;
    try {
      if (kind === 'cover') {
        dom.download(await CX.pptx.buildCover(CX.cover.build(p, book.pages.length)), slug() + '-cover-canva.pptx', PPTX);
        dom.toast('Cover saved for Canva. In Canva: Create a design > Import file.');
      } else {
        dom.download(await CX.pptx.build(book, progress), slug() + '-interior-canva.pptx', PPTX);
        dom.toast('Book saved for Canva: ' + book.pages.length + ' pages. In Canva: Create a design > Import file.');
      }
    } catch (e) {
      dom.toast('The Canva file could not be made: ' + e.message);
    } finally { state.busy = false; progress(null); }
  }

  // ---------- project file ----------
  function hasWork(p) { return Object.keys(p.days).some(function (k) { return (p.days[k].words || []).length; }) || p.ai.weeks.length > 0; }

  function exportProject() {
    dom.download(JSON.stringify(state.p, null, 1), slug() + '-project.json', 'application/json');
    dom.toast('Project file saved. Open it later with "Open project file".');
  }

  function importProject(file) {
    var fr = new FileReader();
    fr.onload = async function () {
      var data;
      try { data = JSON.parse(fr.result); } catch (e) { dom.toast('That file is not a project file from this app.'); return; }
      if (!data || !data.book || !data.plan || !data.days) { dom.toast('That file is not a project file from this app.'); return; }
      if (hasWork(state.p)) {
        var ok = await dom.confirm({ title: 'Open this project?', body: 'The book you have open now is replaced. Save it first if you want to keep it.', actions: [{ label: 'Cancel', value: false }, { label: 'Open it', value: true, primary: true }] });
        if (!ok) return;
      }
      state.p = P.normalize(data); state.otherDays = false;
      state.sel = null; state.result = null;
      openStep(firstOpenStep()); renderPreview();
      dom.toast('Project opened.');
    };
    fr.readAsText(file);
  }

  async function startOver() {
    var ok = await dom.confirm({ title: 'Start a new book?', body: ['Everything in this book is cleared: settings, words and cover.', 'Save the project file first if you want to keep it.'], actions: [{ label: 'Cancel', value: false }, { label: 'Clear and start over', value: true, danger: true }] });
    if (!ok) return;
    state.p = P.newProject(); state.otherDays = false;
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
    state.p = P.newProject(); state.otherDays = false;
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
    document.getElementById('app').setAttribute('aria-busy', 'false');
  }

  function boot() { dom.registerFonts().then(start, start); }

  CX.app = { state: state, openStep: openStep, setMode: setMode, addReply: addReply, renderPreview: renderPreview, viewDay: viewDay };
  boot();
})(window);
