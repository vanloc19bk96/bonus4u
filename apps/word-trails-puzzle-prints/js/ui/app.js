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
      return radio('aud', a.label, null, pl.audience === a.id, function () { pl.audience = a.id; Object.assign(pl, a.defaults); changed(true); });
    }))]));
    var custom = h('textarea', { class: 'textarea short', id: 'fCustom', rows: 2, maxlength: 300, placeholder: 'For example: life by the sea, with boats, lighthouses, fish and seaside towns' });
    custom.value = pl.customTheme;
    custom.addEventListener('input', function () { pl.customTheme = custom.value; changed(); });
    out.push(field('Theme of the book', select('fTheme', P.THEMES.map(function (t) { return { v: t.id, t: t.title + ' – ' + t.sub }; }), pl.theme, function (v) { pl.theme = v; changed(true); }),
      'Every puzzle gets its own subject inside this theme.', 'fTheme'));
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
    var author = h('input', { class: 'input', id: 'fAuthor', value: b.author, maxlength: 80, placeholder: 'For example: Bright Trail Press' });
    author.addEventListener('input', function () { b.author = author.value; changed(); });
    var name = h('input', { class: 'input', id: 'fName', value: pl.name, maxlength: 40 });
    name.addEventListener('input', function () { pl.name = name.value; changed(); });
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
    out.push(field('What the book calls this puzzle', name, 'Used on the how-to-play page. Choose your own name: game names like Strands belong to their owners, so keep them off your title and cover.', 'fName'));
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
    var out = [h('p', { class: 'lead' }, 'How big the grids are, how hard they get and what goes in the book.')];
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Grid size'), h('div', { class: 'cards' }, P.GRID_SIZES.map(function (g) {
      return radio('size', g.label, g.hint, pl.size === g.id, function () { pl.size = g.id; changed(true); });
    }))]));
    var levels = [{ id: 'mixed', label: 'Mixed', help: 'Easy first, then medium, then hard, each with its own opening page.' }].concat(P.LEVELS);
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Level'), h('div', { class: 'cards' }, levels.map(function (l) {
      return radio('level', l.label, l.help, pl.level === l.id, function () { pl.level = l.id; changed(true); });
    }))]));
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'In the book'), h('div', { class: 'stack' }, [
      check('Hints', 'Two rounds at the back: the theme in plain words and where the span word starts, then two free words', pl.hints, function (v) { pl.hints = v; changed(); }),
      check('Puzzle log', 'A page to tick off each puzzle', pl.log, function (v) { pl.log = v; changed(); }),
      check('Difficulty stars', 'One to three stars by each puzzle number', pl.stars, function (v) { pl.stars = v; changed(); })
    ])]));
    out.push(h('h3', { class: 'sub-head' }, 'Page size and print'));
    out.push(field('Page size', select('fTrim', CX.kdp.TRIMS.map(function (t) { return { v: t.id, t: t.label + ' – ' + t.hint }; }), b.trim, function (v) { b.trim = v; changed(true); }), null, 'fTrim'));
    var tall = CX.kdp.trim(b.trim).h >= 10;
    out.push(field('Puzzles on a page', select('fPer', [{ v: 1, t: 'One puzzle a page: big letters' }, { v: 2, t: 'Two puzzles a page: more puzzles, fewer pages' }], pl.perPage, function (v) { pl.perPage = +v; changed(); }),
      tall ? 'Two to a page is used only when the letters stay easy to read.' : 'Two to a page needs a taller page (7 x 10 in or more), so this size keeps one.', 'fPer'));
    out.push(field('Text size', select('fPrint', Object.keys(CX.layout.PRINT).map(function (k) { return { v: k, t: CX.layout.PRINT[k].label }; }), b.print, function (v) { b.print = v; changed(); }),
      'For the titles, hints and notes. The grid letters are always as big as the page allows.', 'fPrint'));
    out.push(field('Paper', select('fPaper', CX.kdp.PAPERS.map(function (x) { return { v: x.id, t: x.label }; }), b.paper, function (v) { b.paper = v; changed(); }), null, 'fPaper'));
    var est = h('p', { class: 'derived' });
    live.push(function () { est.textContent = 'When every puzzle is in, the book has about ' + estimatePages() + ' pages.'; });
    live[live.length - 1]();
    out.push(est);
    out.push(next(3, 'Next: write the puzzles'));
    return out;
  }

  // A rough page count for a finished book (without building every grid).
  function estimatePages() {
    var p = state.p, n = p.plan.count, t = CX.kdp.trim(p.book.trim);
    var perSol = t.w >= 7.5 ? 9 : t.w >= 6.5 ? 6 : 4, per = p.plan.perPage === 2 && t.h >= 10 ? 2 : 1;
    return 5 + (p.plan.log ? 1 : 0) + (p.plan.level === 'mixed' ? 3 : 0) + Math.ceil(n / per) + (p.plan.hints ? Math.ceil(n / 12) + Math.ceil(n / 24) : 0) + Math.ceil(n / perSol);
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
    if (cur.kind === 'puzzles') {
      var ul = h('ul', { class: 'pn-chapters' });
      cur.puzzles.forEach(function (x) {
        var st = CX.puzzles.status(p, x), d = p.puzzles[x.id];
        ul.appendChild(h('li', { class: CX.prompts.puzzleDone(p, x) ? 'full' : '' }, [
          h('span', null, 'Puzzle ' + x.no + (d && d.title ? ' · ' + d.title : '')),
          h('span', { class: 'n' }, st.state === 'ok' ? '✓ ' + (st.pz.grid.trails.length - 1) + ' words' : st.words + ' / ' + st.ask + ' words')]));
      });
      panel.appendChild(ul);
      var lim = P.limits(p);
      panel.appendChild(h('p', { class: 'pn-note' }, 'ChatGPT is asked for ' + lim.ask + ' words a puzzle, more than the grid holds: the app picks the ones whose letters fill the ' + lim.cells + ' squares exactly, then checks the grid has one solution.'));
      if (cur.done) panel.appendChild(h('p', { class: 'hint' }, 'These puzzles are done. Found a weak word or title? Copy the check prompt: it sends these puzzles back to ChatGPT and asks for a corrected version. Paste the reply below and choose Replace.'));
    } else {
      panel.appendChild(h('p', { class: 'pn-note' }, 'The welcome note, the closing note and the back cover text. Without them the book prints ready-made texts.'));
    }
    // a finished prompt asks for nothing, so its main button checks the puzzles instead
    var filled = cur.kind === 'puzzles' ? cur.puzzles.filter(function (x) { return ((p.puzzles[x.id] || {}).words || []).length; }) : [];
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
        h('p', { class: 'hint' }, 'The check prompt has ChatGPT test every word and title and send the puzzles back corrected. Or clear them and write them again.'),
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
      var cls = st.state === 'ok' ? 'full' : st.state === 'weak' ? 'weak' : st.state === 'empty' ? 'empty' : '';
      rows.appendChild(h('li', { class: cls }, [
        h('span', { class: 'no' }, String(x.no)),
        h('span', { class: 'ct' }, d && d.title ? d.title : h('i', { class: 'muted' }, 'not written yet')),
        h('span', { class: 'n' }, st.state === 'empty' ? '' : st.state === 'ok' ? '✓ ' + P.level(st.pz.level).label : st.state === 'weak' ? 'no grid' : st.words + ' of ' + st.ask + ' words'),
        h('button', { type: 'button', class: 'mini', onclick: function () { viewPuzzle(x); } }, 'Edit')
      ]));
    });
    out.push(rows);
    var ai = p.ai, ex = [];
    ex.push((ai.welcome.length ? '✓ ' : '– ') + 'Welcome');
    ex.push((ai.closing.length ? '✓ ' : '– ') + 'Closing note');
    ex.push((ai.blurb ? '✓ ' : '– ') + 'Back cover text');
    out.push(h('p', { class: 'extras-line' }, ex.join('   ·   ')));
    var t = CX.content.totals(p);
    if (t.ready) out.push(h('p', { class: 'hint' }, t.ready + ' of ' + t.puzzles + ' grids ready · ' + t.printed + ' words hidden in the book so far.'));
    out.push(next(4, 'Next: check and download'));
    return out;
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
      // a corrected or rewritten puzzle: replace it, or add to it?
      var again = CX.content.rewrites(p, parsed, fallback), replace = [];
      if (again.length) {
        var one = again.length === 1;
        var pick = await dom.confirm({
          title: one ? pzName(again[0].pz) + ' already has words' : 'These puzzles already have words',
          body: [
            'This reply brings a new version of ' + again.slice(0, 6).map(function (r) { return pzName(r.pz) + ' (' + r.got + ' words in the reply, ' + r.have + ' in the book)'; }).join(', ') + (again.length > 6 ? ' and ' + (again.length - 6) + ' more' : '') + '.',
            'Replace: ' + (one ? 'the puzzle takes' : 'the puzzles take') + ' the title, theme, span word and words of this reply. Choose it when you asked ChatGPT to fix or rewrite ' + (one ? 'it' : 'them') + '.',
            'Add: everything stays and new words are added. Choose it when you asked for more words.'
          ],
          actions: [{ label: 'Cancel', value: null }, { label: 'Add', value: 'add' }, { label: 'Replace', value: 'replace', primary: true }]
        });
        if (!pick) return;
        if (pick === 'replace') replace = again.map(function (r) { return r.pz.id; });
      }
      var rep = CX.content.addReply(p, parsed, fallback, replace);
      var plain = rep.added.filter(function (r) { return rep.replaced.indexOf(r.pz) === -1; });
      var n = plain.reduce(function (s, r) { return s + r.n; }, 0), notes = [], heads = [];
      if (rep.replaced.length) heads.push('Replaced ' + U.plural(rep.replaced.length, 'puzzle') + ' with this reply.');
      if (n) heads.push('Added ' + U.plural(n, 'word') + ' to ' + U.plural(plain.length, 'puzzle') + '.');
      if (rep.extra) notes.push(U.plural(rep.extra, 'word was', 'words were') + ' more than a puzzle can use, so they were left out.');
      if (rep.skipped) {
        var why = {};
        parsed.skipped.forEach(function (s) { why[s.why] = (why[s.why] || 0) + 1; });
        notes.push(U.plural(rep.skipped, 'word was', 'words were') + ' left out (' + Object.keys(why).map(function (k) { return why[k] + ': ' + k; }).join('; ') + ').');
      }
      if (rep.unplaced) notes.push(U.plural(rep.unplaced, 'word', 'words') + ' did not match a puzzle. Select the prompt they answer, then paste again.');
      if (!heads.length && !rep.texts) {
        if (rep.same) notes.unshift(U.plural(rep.same, 'word is', 'words are') + ' already in the book.');
        state.result = msg('err', 'Nothing new was added.', notes.length ? notes : ['Check that you pasted the reply to this prompt.']);
        renderBody(); return;
      }
      var stuck = rep.added.filter(function (r) { var st = CX.puzzles.status(p, r.pz); return st.state === 'weak'; });
      if (stuck.length) notes.push('No grid yet for ' + stuck.map(function (r) { return pzName(r.pz).toLowerCase(); }).join(', ') + '. Copy the prompt again: it asks for a few more words.');
      var dups = CX.content.repeats(p);
      if (dups.length) notes.push(dups.slice(0, 3).map(function (r) { return 'The ' + r.what + ' ' + r.name + ' is on puzzles ' + r.nos.join(', '); }).join('. ') + '. Click Edit to change one, or write it again.');
      state.result = msg('ok', heads.length ? heads.join(' ') : 'Updated the puzzle texts.', notes);
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
      body: ['The title, theme, span word and words of ' + names + ' are cleared.', 'Then copy the prompt again. Save the project file first if you may want the old words back.'],
      actions: [{ label: 'Cancel', value: false }, { label: 'Clear them', value: true, danger: true }]
    });
    if (!ok) return;
    CX.content.clearPuzzles(state.p, pzs);
    state.sel = CX.prompts.list(state.p).findIndex(function (pr) { return pr.kind === 'puzzles' && pr.puzzles.some(function (x) { return x.id === pzs[0].id; }); });
    state.result = msg('ok', 'Cleared ' + names + '. Copy the prompt again and paste the new reply.');
    changed(true);
  }

  // A small SVG of a solved grid: the trails under the letters, the span word in the accent color.
  function gridSvg(g) {
    var cs = 26, W = g.cols * cs + 4, H = g.rows * cs + 4, s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" class="grid-svg" role="img" aria-label="The solved grid">'];
    g.trails.forEach(function (t, i) {
      s.push('<polyline points="' + t.path.map(function (rc) { return (2 + rc[1] * cs + cs / 2) + ',' + (2 + rc[0] * cs + cs / 2); }).join(' ') + '"' + (t.span ? ' class="span"' : ' stroke="hsl(' + (190 + i * 47) % 360 + ',60%,82%)"') + '/>');
    });
    for (var r = 0; r < g.rows; r++) for (var c = 0; c < g.cols; c++) {
      s.push('<text x="' + (2 + c * cs + cs / 2) + '" y="' + (2 + r * cs + cs * 0.68) + '" class="ltr">' + g.cells[r][c] + '</text>');
    }
    s.push('</svg>');
    return s.join('');
  }

  /*
   * One puzzle, to fix by hand: its solved grid, title, theme, span word and the list of words.
   * Typing goes straight into the book. The grid is drawn again when the words change; the step
   * list is rebuilt when the window closes.
   */
  function viewPuzzle(x) {
    var p = state.p, d = P.puzzle(p, x.id), body = h('div', { class: 'day-view' }), top = h('div');
    function heading() { return pzName(x) + (d.title.trim() ? ': ' + d.title.trim() : ''); }
    var redraw = dom.debounce(draw, 250);
    function text(key, label, hint, on) {
      var el = h('input', { class: 'input', id: 'd-' + key, maxlength: 90 });
      el.value = d[key];
      el.addEventListener('input', function () { d[key] = key === 'span' ? CX.reader.cleanSpan(el.value) : el.value; document.getElementById('modalTitle').textContent = heading(); changed(); if (on) on(); });
      return field(label, el, hint, 'd-' + key);
    }
    function draw() {
      top.innerHTML = '';
      var st = CX.puzzles.status(p, x), pz = st.pz, lim = P.limits(p), head = h('div', { class: 'day-view-head' }), facts = [];
      if (pz && pz.grid) {
        var art = h('div', { class: 'day-grid' });
        art.innerHTML = gridSvg(pz.grid);
        head.appendChild(art);
        var words = pz.grid.trails.filter(function (t) { return !t.span; }).map(function (t) { return t.w; });
        facts.push('In the grid: ' + words.join(', ') + '.');
        facts.push('The span word runs ' + (pz.grid.axis === 'v' ? 'top to bottom' : 'left to right') + '. Level: ' + P.level(pz.level).label + '.');
        facts.push('Checked: every letter is used and there is exactly one solution.');
        if (pz.grid.unused.length) facts.push('Not used this time: ' + pz.grid.unused.join(', ') + '.');
        if (pz.grid.decoys.length) facts.push('⚠ A spare word can also be traced in this grid: ' + pz.grid.decoys.join(', ') + '. It can mislead a solver: click New grid or remove it.');
      } else facts.push(d.words.length ? 'No grid yet. The grid needs ' + lim.min + ' to ' + lim.max + ' words that fill all ' + lim.cells + ' squares together with the span word.' : 'No words yet: copy the prompt in step 3, or type them below.');
      if (pz) pz.problems.forEach(function (t) { facts.push('⚠ ' + t.charAt(0).toUpperCase() + t.slice(1) + '.'); });
      var spoil = CX.puzzles.titleSpoils(p, x);
      if (spoil) facts.push('⚠ The title gives away the span word, ' + spoil + '.');
      head.appendChild(h('div', { class: 'day-facts' }, h('ul', null, facts.map(function (f) { return h('li', null, f); }))));
      top.appendChild(head);
    }
    body.appendChild(top);
    var wordsBox = h('textarea', { class: 'textarea', id: 'd-words', rows: 4, spellcheck: 'false' });
    wordsBox.value = d.words.join(', ');
    wordsBox.addEventListener('input', function () {
      var seen = {};
      d.words = wordsBox.value.split(/[\s,;]+/).map(P.letters).filter(function (w) { if (!w || seen[w]) return false; seen[w] = 1; return true; });
      changed(); redraw();
    });
    body.appendChild(h('div', { class: 'day-texts' }, [
      text('title', 'Title', 'The playful hint printed over the grid. It must not name its answers.', redraw),
      text('theme', 'Theme in plain words', 'Printed in the first hints.'),
      text('span', 'Span word', P.limits(p).spanMin + ' to ' + P.limits(p).spanMax + ' letters. It runs from edge to edge and names the theme.', redraw),
      field('Words', wordsBox, 'Separated by commas, the best first. Keep more than the grid holds: the app picks the set that fits exactly.', 'd-words')
    ]));
    var bar = h('div', { class: 'words-head' }, [d.words.length ? dom.copyButton('Copy check prompt', function () { return CX.prompts.checkText(p, [x]); }, 'mini') : null]);
    body.appendChild(bar);
    draw();
    openModal(heading(), body, [
      { label: 'Clear this puzzle', danger: true, run: function () { d.words.length = 0; d.span = d.title = d.theme = ''; wordsBox.value = ''; ['title', 'theme', 'span'].forEach(function (k) { document.getElementById('d-' + k).value = ''; }); draw(); changed(); } },
      { label: 'New grid', run: function () { d.v = (d.v || 0) + 1; draw(); changed(); } },
      { label: 'Close', primary: true }
    ], function () { changed(true); });
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
      var pl = p.plan, key = JSON.stringify([b.title, b.subtitle, b.author, b.trim, b.print, b.paper, pl.count, pl.level, pl.hints, state.printPages, p.seed]);
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
        h('li', null, 'KDP asks whether AI helped make the book. The themes and words were written with an AI chat, so answer yes for the text.'),
        h('li', null, 'Keep game names such as Strands and any newspaper name out of your title, subtitle, cover and keywords.'),
        h('li', null, 'Solve two or three puzzles yourself before you publish: the app proves each grid has one solution, but only a reader can tell whether a theme feels fair.')
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
    { n: 1, title: 'The book', body: body1, chip: function (p) { return { t: p.plan.count + ' puzzles · ' + P.audience(p.plan.audience).label, ok: !!p.book.author.trim() }; } },
    { n: 2, title: 'Puzzles and pages', body: body2, chip: function (p) { return { t: P.grid(p.plan.size).label + ' · ' + CX.kdp.trim(p.book.trim).label, ok: true }; } },
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
  function hasWork(p) { return Object.keys(p.puzzles).some(function (k) { return (p.puzzles[k].words || []).length; }) || p.ai.welcome.length > 0; }

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
