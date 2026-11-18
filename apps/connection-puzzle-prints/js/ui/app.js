/*
 * The app: a header switch between the book pages (four steps) and the cover, each with its own
 * sidebar and preview. Nothing is kept in the browser: the work lives in the open tab until it is
 * saved to a project file. Each step body is rebuilt only when its structure changes, so typing never loses focus.
 */
(function (root) {
  'use strict';
  var CX = root.CX, U = CX.util, P = CX.plan, dom = CX.dom, h = dom.h;
  var CHATGPT = 'https://chatgpt.com/';

  var state = { p: null, mode: 'book', open: 1, sel: null, result: null, printPages: 0, busy: false, otherCount: false };
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

  // ---------- step 1: the book ----------
  function body1() {
    var p = state.p, pl = p.plan, b = p.book;
    var out = [h('p', { class: 'lead' }, 'Who is the book for, what is it about and how many puzzles does it hold?')];
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Who will solve it?'), h('div', { class: 'cards' }, P.AUDIENCES.map(function (a) {
      return radio('aud', a.label, null, pl.audience === a.id, function () { P.setAudience(pl, a.id); changed(true); });
    }))]));
    var custom = h('textarea', { class: 'textarea short', id: 'fCustom', rows: 2, maxlength: 300, placeholder: 'For example: life by the sea, with boats, lighthouses, fish and seaside towns' });
    custom.value = pl.customTheme;
    custom.addEventListener('input', function () { pl.customTheme = custom.value; changed(); });
    out.push(field('Theme of the book', select('fTheme', P.THEMES.map(function (t) { return { v: t.id, t: t.title + ' – ' + t.sub }; }), pl.theme, function (v) { pl.theme = v; changed(true); }),
      'Every puzzle gets its own subject inside this theme.' + (P.audience(pl.audience).kid ? ' For kids, ChatGPT gets a child-friendly version of the theme.' : ''), 'fTheme'));
    if (pl.theme === 'custom') out.push(field('Your theme', custom, 'ChatGPT writes every puzzle around it.', 'fCustom'));
    var other = state.otherCount || P.COUNTS.indexOf(pl.count) === -1;
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'How many puzzles?'), h('div', { class: 'cards' }, P.COUNTS.map(function (n) {
      return radio('count', String(n), null, !other && pl.count === n, function () { setCount(n); });
    }).concat([radio('count', 'Other', P.MIN_COUNT + ' to ' + P.MAX_COUNT, other, function () { setCount(pl.count, true); })]))]));
    if (other) {
      var cnt = h('input', { class: 'input', id: 'fCount', type: 'number', min: P.MIN_COUNT, max: P.MAX_COUNT, value: pl.count });
      cnt.addEventListener('change', function () { setCount(+cnt.value, true); });
      out.push(field('Number of puzzles', cnt, null, 'fCount'));
    }

    out.push(h('h3', { class: 'sub-head' }, 'Title and author'));
    var title = h('input', { class: 'input', id: 'fTitle', value: b.title, maxlength: 140 });
    title.addEventListener('input', function () { b.title = title.value; changed(); });
    var ideas = h('div', { class: 'chips ideas' });
    var sub = h('textarea', { class: 'textarea short', id: 'fSub', rows: 2, maxlength: 220 });
    sub.value = b.subtitle;
    sub.addEventListener('input', function () { b.subtitle = sub.value; changed(); });
    var author = h('input', { class: 'input', id: 'fAuthor', value: b.author, maxlength: 80, placeholder: 'For example: Four Corners Press' });
    author.addEventListener('input', function () { b.author = author.value; changed(); });
    var name = h('input', { class: 'input', id: 'fName', value: pl.name, maxlength: 40 });
    name.addEventListener('input', function () { pl.name = name.value; changed(); });
    live.push(function () {
      title.placeholder = P.titleIdeas(p)[0];
      sub.placeholder = P.subtitleIdea(p, true);
      ideas.innerHTML = '';
      P.titleIdeas(p).forEach(function (t) {
        ideas.appendChild(h('button', { type: 'button', class: 'chip-btn small', onclick: function () { b.title = t; title.value = t; changed(); } }, t));
      });
    });
    live[live.length - 1]();
    out.push(h('div', { class: 'field' }, [h('label', { for: 'fTitle' }, 'Book title'), title, h('div', { class: 'hint' }, 'Leave it empty to use the gray text, or click an idea:'), ideas]));
    out.push(field('Subtitle', sub, 'Leave it empty to use the gray text.', 'fSub'));
    out.push(field(h('span', null, ['Pen name ', h('span', { class: 'req' }, '*')]), author, 'Printed on the cover and the title page.', 'fAuthor'));
    out.push(field('What the book calls this puzzle', name, 'Used on the how-to-play page. Choose your own name: the newspaper game "Connections" belongs to its owner, so keep its name and the newspaper\'s off your title and cover.', 'fName'));
    out.push(next(2, 'Next: puzzles and pages'));
    return out;
  }

  // other: the "Other" card, which stays chosen even on a preset number
  function setCount(n, other) {
    state.p.plan.count = P.validCount(n) || U.clamp(Math.round(+n) || 100, P.MIN_COUNT, P.MAX_COUNT);
    state.otherCount = !!other;
    changed(true);
  }

  // ---------- step 2: puzzles and pages ----------
  function body2() {
    var p = state.p, pl = p.plan, b = p.book;
    var out = [h('p', { class: 'lead' }, 'How hard the puzzles get, what goes in the book and how it is printed.')];
    var levels = [{ id: 'mixed', label: 'Mixed', help: 'Easy first, then medium, then hard, each with its own opening page.' }].concat(P.LEVELS);
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Level'), h('div', { class: 'cards' }, levels.map(function (l) {
      return radio('level', l.label, l.help, pl.level === l.id, function () { pl.level = l.id; changed(true); });
    })), h('div', { class: 'hint' }, 'The prompts tell ChatGPT the level of each puzzle. Inside every puzzle the four groups run from the most direct link to the trickiest.')]));
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'In the book'), h('div', { class: 'stack' }, [
      check('Hints', 'A section at the back with the four links of each puzzle, not which words go where', pl.hints, function (v) { pl.hints = v; changed(); }),
      check('Puzzle log', 'A page to tick off each puzzle', pl.log, function (v) { pl.log = v; changed(); }),
      check('Difficulty stars', 'One to three stars by each puzzle number', pl.stars, function (v) { pl.stars = v; changed(); })
    ])]));
    out.push(h('h3', { class: 'sub-head' }, 'Page size and print'));
    out.push(field('Page size', select('fTrim', CX.kdp.TRIMS.map(function (t) { return { v: t.id, t: t.label + ' – ' + t.hint }; }), b.trim, function (v) { b.trim = v; changed(true); }), null, 'fTrim'));
    out.push(field('Puzzles on a page', select('fPer', [{ v: 1, t: 'One puzzle a page: big tiles, a box for every answer' }, { v: 2, t: 'Two puzzles a page: more puzzles, fewer pages' }], pl.perPage, function (v) { pl.perPage = +v; changed(); }),
      'Two to a page is used only when the tiles stay big enough for the text size. Each puzzle then gets one writing line per group.', 'fPer'));
    out.push(field('Text size', select('fPrint', Object.keys(CX.layout.PRINT).map(function (k) { return { v: k, t: CX.layout.PRINT[k].label }; }), b.print, function (v) { b.print = v; changed(true); }),
      b.print === 'regular' ? 'For the titles, hints and notes. The words on the tiles are as big as the tiles allow.' : 'Every letter in the book is this size or bigger: titles, labels, page numbers, hints, tiles and solutions. A word too long for its tile is the only exception, and step 4 lists it.', 'fPrint'));
    out.push(field('Paper', select('fPaper', CX.kdp.PAPERS.map(function (x) { return { v: x.id, t: x.label }; }), b.paper, function (v) { b.paper = v; changed(); }), null, 'fPaper'));
    var est = h('p', { class: 'derived' });
    live.push(function () {
      est.textContent = 'When every puzzle is in, the book has about ' + estimatePages() + ' pages. At this page and text size a tile holds about ' +
        CX.layout.tileLetters(p) + ' letters, so ChatGPT is asked for answers of at most ' + CX.prompts.maxLetters(p) + ' letters.';
    });
    live[live.length - 1]();
    out.push(est);
    out.push(next(3, 'Next: write the puzzles'));
    return out;
  }

  // A rough page count for a finished book: a stand-in puzzle in every slot, laid out for real.
  var estimate = { key: '', pages: 0 };
  function estimatePages() {
    var b = state.p.book, pl = state.p.plan, key = JSON.stringify([b.trim, b.print, b.paper, pl.count, pl.perPage, pl.level, pl.hints, pl.log, pl.audience, state.p.ai.welcome.length]);
    if (estimate.key === key) return estimate.pages;
    var p = U.clone(state.p), stand = P.asPuzzle(P.EXAMPLE);
    P.puzzles(p).forEach(function (x) { p.puzzles[x.id] = stand; });
    estimate = { key: key, pages: CX.layout.layoutBook(p, {}).pages.length };
    return estimate.pages;
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
      h('li', null, ['Paste it in the box below and click ', h('b', null, 'Add to book'), '. The app checks every puzzle and lays out the boards.'])
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
    if (cur.kind === 'puzzles') {
      var ul = h('ul', { class: 'pn-chapters' });
      cur.puzzles.forEach(function (x) {
        var st = CX.puzzles.status(p, x);
        ul.appendChild(h('li', { class: st.state === 'ok' ? 'full' : '' }, [
          h('span', null, 'Puzzle ' + x.no + ' · ' + P.level(P.levelOf(p, x)).label),
          h('span', { class: 'n' }, stateText(st))]));
      });
      panel.appendChild(ul);
      panel.appendChild(h('p', { class: 'pn-note' }, 'ChatGPT writes four groups of four for each puzzle, with the traps named. The app checks that every board has 16 different answers that fit their tiles, then shuffles the board so no row or column gives a group away.'));
      if (cur.done) panel.appendChild(h('p', { class: 'hint' }, 'These puzzles are done. Found a weak link or a word that fits two groups? Copy the check prompt: it sends these puzzles back to ChatGPT and asks for a corrected version. Paste the reply below and choose Replace.'));
    } else {
      panel.appendChild(h('p', { class: 'pn-note' }, 'The welcome note, the closing note and the back cover text. Without them the book prints ready-made texts.'));
    }
    // a finished prompt asks for nothing, so its main button checks the puzzles instead
    var filled = cur.kind === 'puzzles' ? cur.puzzles.filter(function (x) { return ((p.puzzles[x.id] || {}).groups || []).length; }) : [];
    var checker = function () { return CX.prompts.checkText(state.p, cur.puzzles); };
    var main = cur.done && filled.length ? checker : function () { return CX.prompts.text(state.p, cur); };
    panel.appendChild(h('div', { class: 'actions first' }, [
      dom.copyButton(cur.done && filled.length ? 'Copy check prompt' : 'Copy prompt', main, 'btn btn-primary'),
      h('a', { class: 'btn', href: CHATGPT, target: '_blank', rel: 'noopener noreferrer' }, 'Open ChatGPT ↗')
    ]));
    var peek = h('details', { class: 'peek' }, [h('summary', null, 'See the prompt'), h('textarea', { class: 'textarea', readonly: true, rows: 8 })]);
    peek.addEventListener('toggle', function () { if (peek.open) peek.querySelector('textarea').value = main(); });
    panel.appendChild(peek);
    if (filled.length) {
      panel.appendChild(h('div', { class: 'fix-days' }, [
        h('b', null, 'Fix these puzzles'),
        h('p', { class: 'hint' }, 'The check prompt has ChatGPT try to sort every board another way, test every fact and send the puzzles back corrected. Or clear them and write them again.'),
        h('div', { class: 'actions first' }, [
          cur.done ? null : dom.copyButton('Copy check prompt', checker, 'btn'),
          h('button', { type: 'button', class: 'btn danger-text', onclick: function () { redo(filled); } }, filled.length > 1 ? 'Write these puzzles again' : 'Write this puzzle again')
        ])
      ]));
    }
    out.push(panel);

    var ta = h('textarea', { class: 'textarea paste', id: 'fPaste', placeholder: 'Paste ChatGPT’s whole reply here', spellcheck: 'false' });
    out.push(h('div', { class: 'field' }, [h('label', { for: 'fPaste' }, 'ChatGPT’s reply'), ta]));
    out.push(h('div', { class: 'actions first' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { addReply(ta.value, cur); } }, 'Add to book')));
    var res = h('div', { class: 'result' });
    if (state.result) res.appendChild(state.result);
    out.push(res);
    out.push(h('p', { class: 'hint' }, 'Claude, Gemini or Copilot work the same way. The app reads the puzzle numbers in any reply, so a reply can go in while another prompt is selected.'));

    out.push(h('h3', { class: 'sub-head' }, 'Your puzzles'));
    var rows = h('ul', { class: 'ch-list days-list' });
    P.puzzles(p).forEach(function (x) {
      var st = CX.puzzles.status(p, x), d = p.puzzles[x.id];
      var cls = st.state === 'ok' ? (st.pz.warnings.length ? 'full look' : 'full') : st.state === 'weak' ? 'weak' : st.state === 'empty' ? 'empty' : '';
      rows.appendChild(h('li', { class: cls }, [
        h('span', { class: 'no' }, String(x.no)),
        h('span', { class: 'ct' }, d && d.groups.length ? d.groups.map(function (g) { return g.link; }).join(' · ') : h('i', { class: 'muted' }, 'not written yet')),
        h('span', { class: 'n' }, st.state === 'empty' ? '' : st.state === 'ok' && st.pz.warnings.length ? '⚠ look' : stateText(st)),
        h('button', { type: 'button', class: 'mini', onclick: function () { viewPuzzle(x); } }, 'Edit')
      ]));
    });
    out.push(rows);
    var ai = p.ai, ex = [];
    ex.push((ai.welcome.length ? '✓ ' : '– ') + 'Welcome');
    ex.push((ai.closing.length ? '✓ ' : '– ') + 'Closing note');
    ex.push((ai.blurb ? '✓ ' : '– ') + 'Back cover text');
    out.push(h('p', { class: 'extras-line' }, ex.join('   ·   ')));
    // the AI's notes can be changed by hand; a blank line starts a new paragraph
    [['welcome', 'Welcome note', 'Printed on the How to Play page.'], ['closing', 'Closing note', 'Printed on the last page.']].forEach(function (x) {
      var ta = h('textarea', { class: 'textarea short', id: 'f-' + x[0], rows: 3, maxlength: 1200, placeholder: 'Comes from the last prompt above, or type your own.' });
      ta.value = ai[x[0]].join('\n\n');
      ta.addEventListener('input', function () { ai[x[0]] = CX.text.cleanParagraphs(ta.value); changed(); });
      out.push(field(x[1], ta, x[2] + ' A blank line starts a new paragraph.', 'f-' + x[0]));
    });
    var t = CX.content.totals(p);
    if (t.ready) out.push(h('p', { class: 'hint' }, t.ready + ' of ' + t.puzzles + ' puzzles ready · ' + (t.ready * 16).toLocaleString('en-US') + ' words to sort so far.'));
    out.push(next(4, 'Next: check and download'));
    return out;
  }

  function stateText(st) {
    if (st.state === 'ok') return '✓ ready';
    if (st.state === 'weak') return 'not ready';
    if (st.state === 'part') return st.groups + ' of 4 groups';
    return 'to write';
  }

  function pzName(x) { return 'Puzzle ' + x.no; }

  async function addReply(text, cur) {
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
      var parsed = CX.reader.readPuzzles(text), fallback = cur.kind === 'puzzles' ? cur.puzzles : [];
      // a corrected or rewritten puzzle that was already finished: replace it, or keep it?
      var again = CX.content.rewrites(p, parsed, fallback), replace = [];
      if (again.length) {
        var one = again.length === 1;
        var pick = await dom.confirm({
          title: one ? pzName(again[0].pz) + ' is already finished' : 'These puzzles are already finished',
          body: [
            'This reply brings a new version of ' + again.slice(0, 8).map(function (r) { return pzName(r.pz); }).join(', ') + (again.length > 8 ? ' and ' + (again.length - 8) + ' more' : '') + '.',
            'Replace: ' + (one ? 'the puzzle takes' : 'the puzzles take') + ' the groups of this reply. Choose it when you asked ChatGPT to check or rewrite ' + (one ? 'it' : 'them') + '.',
            'Keep: the finished ' + (one ? 'puzzle stays' : 'puzzles stay') + ' as ' + (one ? 'it is' : 'they are') + '; the rest of the reply still goes in.'
          ],
          actions: [{ label: 'Cancel', value: null }, { label: 'Keep', value: 'keep' }, { label: 'Replace', value: 'replace', primary: true }]
        });
        if (!pick) return;
        if (pick === 'replace') replace = again.map(function (r) { return r.pz.id; });
      }
      var rep = CX.content.addReply(p, parsed, fallback, replace), notes = [];
      if (rep.unplaced) notes.push(U.plural(rep.unplaced, 'puzzle', 'puzzles') + ' in the reply did not match a puzzle of the book. Select the prompt it answers, then paste again.');
      if (rep.kept.length && !again.length) notes.push(rep.kept.map(pzName).join(', ') + (rep.kept.length > 1 ? ' were' : ' was') + ' already finished and stayed as ' + (rep.kept.length > 1 ? 'they were' : 'it was') + '.');
      if (!rep.filled.length) {
        state.result = msg('err', 'Nothing new was added.', notes.length ? notes : ['Check that you pasted the reply to this prompt.']);
        renderBody(); return;
      }
      rep.filled.forEach(function (x) {
        var st = CX.puzzles.status(p, x);
        if (st.state === 'part') notes.push(pzName(x) + ' came with ' + st.groups + ' of its 4 groups. Copy the prompt again for the rest.');
        else if (st.state === 'weak') notes.push(pzName(x) + ' is not ready: ' + st.pz.problems[0] + '. Click Edit to fix it, or copy the prompt again. Until then the PDF leaves it out and numbers the rest.');
        else if (st.pz.warnings.length) notes.push(pzName(x) + ': ' + st.pz.warnings[0] + '. Worth a look (click Edit).');
      });
      var dups = CX.content.repeats(p);
      if (dups.length) notes.push(dups.slice(0, 3).map(function (r) { return 'The link “' + r.name + '” is on puzzles ' + r.nos.join(', '); }).join('. ') + '. Click Edit to change one, or write it again.');
      var ready = rep.filled.filter(function (x) { return CX.puzzles.status(p, x).state === 'ok'; }).length;
      state.result = msg('ok', 'Added ' + U.plural(rep.filled.length, 'puzzle') + (ready < rep.filled.length ? ' (' + ready + ' ready)' : '') + '.', notes);
    }
    state.sel = CX.prompts.next(p);
    if (CX.prompts.list(p).every(function (x) { return x.done; })) state.result.appendChild(h('div', { class: 'fix-help' }, 'Every prompt is done. Look through the book on the right, then go on to the cover.'));
    changed(true);
  }

  // Clears puzzles so the prompt asks ChatGPT for all of them again.
  async function redo(pzs) {
    var names = pzs.map(pzName).join(', ');
    var ok = await dom.confirm({
      title: pzs.length > 1 ? 'Write these puzzles again?' : 'Write this puzzle again?',
      body: ['The groups of ' + names + ' are cleared.', 'Then copy the prompt again. Save the project file first if you may want the old puzzles back.'],
      actions: [{ label: 'Cancel', value: false }, { label: 'Clear them', value: true, danger: true }]
    });
    if (!ok) return;
    CX.content.clearPuzzles(state.p, pzs);
    state.sel = CX.prompts.list(state.p).findIndex(function (pr) { return pr.kind === 'puzzles' && pr.puzzles.some(function (x) { return x.id === pzs[0].id; }); });
    state.result = msg('ok', 'Cleared ' + names + '. Copy the prompt again and paste the new reply.');
    changed(true);
  }

  var GROUP_COLORS = ['#F6E3A1', '#CFE5B4', '#C8DCF5', '#E3CFF0'];

  // The shuffled board as the book prints it, each tile tinted with its group's color.
  function boardSvg(cells) {
    var tw = 92, th = 46, gap = 6, W = tw * 4 + gap * 3, H = th * 4 + gap * 3, s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" class="board-svg" role="img" aria-label="The board, tinted by group">'];
    cells.forEach(function (row, r) {
      row.forEach(function (c, k) {
        var x = k * (tw + gap), y = r * (th + gap), fs = Math.min(13, 150 / Math.max(6, c.w.length));
        s.push('<rect x="' + x + '" y="' + y + '" width="' + tw + '" height="' + th + '" rx="6" fill="' + GROUP_COLORS[c.g] + '" stroke="#1f2430" stroke-width=".8"/>');
        s.push('<text x="' + (x + tw / 2) + '" y="' + (y + th / 2 + fs * 0.36) + '" font-size="' + fs + '">' + U.escapeHtml(c.w) + '</text>');
      });
    });
    s.push('</svg>');
    return s.join('');
  }

  /*
   * One puzzle, to fix by hand: the board tinted by group, what the checks found, and the four
   * groups to edit. Typing goes straight into the book. The step list is rebuilt when the window closes.
   */
  function viewPuzzle(x) {
    var p = state.p, d = P.puzzle(p, x.id), body = h('div', { class: 'day-view' }), top = h('div');
    var redraw = dom.debounce(draw, 250);
    while (d.groups.length < 4) d.groups.push({ link: '', words: [] });
    function draw() {
      top.innerHTML = '';
      var st = CX.puzzles.status(p, x), pz = st.pz, facts = [];
      if (pz && pz.ok) {
        var art = h('div', { class: 'day-grid' });
        art.innerHTML = boardSvg(pz.cells);
        top.appendChild(art);
        facts.push('Level: ' + P.level(pz.level).label + '. Checked: 16 different answers, each fits its tile, and no row or column holds more than two of one group.');
      } else facts.push(pz && pz.problems.length ? 'Not ready: ' + pz.problems.join('; ') + '.' : 'Nothing yet: copy the prompt in step 3, or type the groups below.');
      if (pz) pz.warnings.forEach(function (t) { facts.push('⚠ ' + CX.prompts.cap(t) + '.'); });
      if (d.trap) facts.push('Traps (from ChatGPT, not printed): ' + d.trap);
      top.appendChild(h('div', { class: 'day-facts' }, h('ul', null, facts.map(function (f) { return h('li', null, f); }))));
    }
    body.appendChild(top);
    var rows = h('div', { class: 'group-edit' });
    d.groups.forEach(function (g, i) {
      var link = h('input', { class: 'input', id: 'g-link-' + i, maxlength: 60, value: g.link, placeholder: 'The link, like Card games or ___ fish' });
      var words = h('input', { class: 'input', id: 'g-words-' + i, maxlength: 120, value: g.words.join(', '), placeholder: 'Four answers, separated by commas', spellcheck: 'false' });
      link.addEventListener('input', function () { g.link = link.value; changed(); redraw(); });
      words.addEventListener('input', function () { g.words = words.value.split(',').map(P.cleanWord).filter(Boolean); changed(); redraw(); });
      rows.appendChild(h('div', { class: 'group-row' }, [
        h('span', { class: 'group-no', style: 'background:' + GROUP_COLORS[i] }, String(i + 1)),
        h('div', null, [h('label', { class: 'sr-only', for: 'g-link-' + i }, 'Link of group ' + (i + 1)), link, h('label', { class: 'sr-only', for: 'g-words-' + i }, 'Answers of group ' + (i + 1)), words])
      ]));
    });
    body.appendChild(h('p', { class: 'hint' }, 'Group 1 is the most direct link, group 4 the trickiest. Write a blank as ___ (three underscores).'));
    body.appendChild(rows);
    body.appendChild(h('div', { class: 'words-head' }, [dom.copyButton('Copy check prompt', function () { return CX.prompts.checkText(p, [x]); }, 'mini')]));
    draw();
    openModal(pzName(x) + ' · ' + P.level(P.levelOf(p, x)).label, body, [
      { label: 'Clear this puzzle', danger: true, run: function () { d.groups.forEach(function (g) { g.link = ''; g.words = []; }); d.trap = ''; Array.prototype.forEach.call(rows.querySelectorAll('input'), function (el) { el.value = ''; }); draw(); changed(); } },
      { label: 'Shuffle the board', run: function () { d.v = (d.v || 0) + 1; draw(); changed(); } },
      { label: 'Close', primary: true }
    ], function () {
      // groups left empty in the editor are not kept
      d.groups = d.groups.filter(function (g) { return g.link.trim() || g.words.length; });
      if (!d.groups.length) delete p.puzzles[x.id];
      changed(true);
    });
  }

  function openModal(title, bodyEl, actions, onClose) {
    var back = document.getElementById('modal'), prev = document.activeElement;
    document.getElementById('modalTitle').textContent = title;
    var body = document.getElementById('modalBody');
    body.innerHTML = '';
    body.appendChild(bodyEl);
    var acts = document.getElementById('modalActions');
    acts.innerHTML = '';
    function close() { back.hidden = true; back.classList.remove('wide'); document.removeEventListener('keydown', onKey, true); if (onClose) onClose(); if (prev && prev.focus && document.contains(prev)) prev.focus(); }
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
      var pl = p.plan, key = JSON.stringify([b.title, b.subtitle, b.author, b.trim, b.print, b.paper, P.bookCount(p), pl.level, pl.hints, pl.audience, state.printPages, p.seed]);
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
        h('li', null, 'KDP asks whether AI helped make the book. The groups were written with an AI chat, so answer yes for the text.'),
        h('li', null, 'Keep the newspaper game name "Connections" and any newspaper name out of your title, subtitle, cover and keywords. Plain words like connection puzzles or word groups are fine.'),
        h('li', null, 'Solve a few puzzles from each level before you publish: the app checks every board, but only a reader can tell whether a link feels fair and a trap does not open a second way to sort.')
      ]),
      h('h3', { class: 'sub-head' }, 'Edit in Canva'),
      h('div', { class: 'actions first' }, [
        h('button', { type: 'button', class: 'btn', onclick: function () { downloadCanva('book'); } }, 'Book for Canva (.pptx)')
      ]),
      h('ul', { class: 'safety' }, [
        h('li', null, 'Canva turns an uploaded PDF into its own text boxes and often jumbles them. Upload this .pptx instead: every page comes in at the trim size with each line of text editable and the tiles as shapes.'),
        h('li', null, 'The book uses the fonts Source Serif 4 and Source Sans 3. If Canva says a font is missing, pick it (or a close one) in the font list.'),
        h('li', null, 'From Canva, download as "PDF Print" for KDP. The PDF from this app stays the safest file to upload.')
      ])
    ];
  }

  // ---------- steps ----------
  var STEPS = [
    { n: 1, title: 'The book', body: body1, chip: function (p) { return { t: p.plan.count + ' puzzles · ' + P.audience(p.plan.audience).label, ok: !!p.book.author.trim() }; } },
    { n: 2, title: 'Puzzles and pages', body: body2, chip: function (p) { return { t: (p.plan.level === 'mixed' ? 'Mixed' : P.level(p.plan.level).label) + ' · ' + CX.kdp.trim(p.book.trim).label, ok: true }; } },
    { n: 3, title: 'Write the puzzles with ChatGPT', body: body3, chip: function (p) { var l = CX.prompts.list(p), d = l.filter(function (x) { return x.done; }).length; return { t: d + ' of ' + l.length + ' prompts', ok: d === l.length }; } },
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
  // A big book takes a moment to lay out, so the busy note shows before the work starts.
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
      // what is left is never a blank page, so only these two stop the book from being ready for KDP
      var blocked = !p.book.author.trim() || book.pages.length < CX.kdp.MIN_PAGES || book.pages.length > CX.kdp.maxPages(p.book.trim, p.book.paper);
      var go = await dom.confirm({
        title: blocked ? 'The book is not finished yet' : 'Before you download',
        body: bad.map(function (i) { return i.label + ': ' + i.detail; }).concat([blocked ? 'You can download it anyway to have a look.' : 'The PDF is ready for KDP as it is: no page is blank and the puzzle numbers run without a gap.']),
        actions: [{ label: 'Keep working', value: false }, { label: blocked ? 'Download anyway' : 'Download the book', value: true, primary: true }]
      });
      if (!go) return;
    }
    state.busy = true;
    try {
      var id = U.hashHex('interior|' + p.seed + '|' + book.pages.length) + U.hashHex(JSON.stringify(p.puzzles).length + '|' + p.seed);
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
    if (pages < CX.kdp.MIN_PAGES) { dom.toast('Add the puzzles first: the cover needs the final page count (at least ' + CX.kdp.MIN_PAGES + ' pages).'); return; }
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
    if (kind === 'cover' && book.pages.length < CX.kdp.MIN_PAGES) { dom.toast('Add the puzzles first: the cover needs the final page count (at least ' + CX.kdp.MIN_PAGES + ' pages).'); return; }
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
  function hasWork(p) { return Object.keys(p.puzzles).some(function (k) { return (p.puzzles[k].groups || []).length; }) || p.ai.welcome.length > 0; }

  function exportProject() {
    dom.download(JSON.stringify(state.p, null, 1), slug() + '-project.json', 'application/json');
    dom.toast('Project file saved. Open it later with "Open project file".');
  }

  function importProject(file) {
    var fr = new FileReader();
    fr.onload = async function () {
      var data;
      try { data = JSON.parse(fr.result); } catch (e) { dom.toast('That file is not a project file from this app.'); return; }
      if (!data || !data.book || !data.plan || !data.puzzles) { dom.toast('That file is not a project file from this app.'); return; }
      if (hasWork(state.p)) {
        var ok = await dom.confirm({ title: 'Open this project?', body: 'The book you have open now is replaced. Save it first if you want to keep it.', actions: [{ label: 'Cancel', value: false }, { label: 'Open it', value: true, primary: true }] });
        if (!ok) return;
      }
      state.p = P.normalize(data); state.otherCount = false;
      state.sel = null; state.result = null;
      openStep(firstOpenStep()); renderPreview();
      dom.toast('Project opened.');
    };
    fr.readAsText(file);
  }

  async function startOver() {
    var ok = await dom.confirm({ title: 'Start a new book?', body: ['Everything in this book is cleared: settings, puzzles and cover.', 'Save the project file first if you want to keep it.'], actions: [{ label: 'Cancel', value: false }, { label: 'Clear and start over', value: true, danger: true }] });
    if (!ok) return;
    state.p = P.newProject(); state.otherCount = false;
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
    state.p = P.newProject(); state.otherCount = false;
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

  CX.app = { state: state, openStep: openStep, setMode: setMode, addReply: addReply, renderPreview: renderPreview, viewPuzzle: viewPuzzle };
  boot();
})(window);
