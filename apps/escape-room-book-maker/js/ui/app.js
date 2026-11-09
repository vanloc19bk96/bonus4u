/*
 * The app: a header switch between the book pages (four steps) and the cover, each with its own
 * sidebar and preview. Nothing is kept in the browser: the work lives in the open tab until it is
 * saved to a project file. Each step body is rebuilt only when its structure changes, so typing never loses focus.
 */
(function (root) {
  'use strict';
  var CX = root.CX, U = CX.util, P = CX.plan, Z = CX.puzzles, E = CX.engine, dom = CX.dom, h = dom.h;
  var AI_CHATS = [
    { name: 'ChatGPT', url: 'https://chatgpt.com/' },
    { name: 'Claude', url: 'https://claude.ai/new' },
    { name: 'Gemini', url: 'https://gemini.google.com/app' }
  ];

  var state = { p: null, mode: 'book', open: 1, sel: null, result: null, printPages: 0, busy: false, otherRooms: false };
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
    var out = [h('p', { class: 'lead' }, 'Who plays, where are they locked in, and how does it end?')];
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Who will play?'), h('div', { class: 'cards three' }, P.AUDIENCES.map(function (a) {
      return radio('aud', a.label, null, pl.audience === a.id, function () { P.setAudience(pl, a.id); changed(true); });
    }))]));
    var custom = h('textarea', { class: 'textarea short', id: 'fCustom', rows: 2, maxlength: 300, placeholder: 'For example: a lighthouse on a storm-cut island, with the keeper gone and the lamp out' });
    custom.value = pl.customSetting;
    custom.addEventListener('input', function () { pl.customSetting = custom.value; changed(); });
    out.push(field('Where does it happen?', select('fSetting', P.SETTINGS.map(function (s) { return { v: s.id, t: s.title + ' – ' + s.sub }; }), pl.setting, function (v) {
      pl.setting = v;
      p.cover.design = CX.cover.designForArt(P.setting(v).art);
      p.cover.palette = '';
      changed(true);
    }), 'The AI writes the whole story for this place. The cover starts with a matching picture.', 'fSetting'));
    if (pl.setting === 'custom') out.push(field('Your setting', custom, 'One or two sentences: the place, and why the reader is locked in.', 'fCustom'));

    var other = state.otherRooms || P.ROOM_COUNTS.indexOf(pl.rooms) === -1;
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'How many rooms?'), h('div', { class: 'cards' }, P.ROOM_COUNTS.map(function (n) {
      return radio('rooms', String(n), n * pl.perRoom + ' puzzles', !other && pl.rooms === n, function () { setRooms(n); });
    }).concat([radio('rooms', 'Other', P.MIN_ROOMS + ' to ' + P.MAX_ROOMS, other, function () { setRooms(pl.rooms, true); })]))]));
    if (other) {
      var cnt = h('input', { class: 'input', id: 'fRooms', type: 'number', min: P.MIN_ROOMS, max: P.MAX_ROOMS, value: pl.rooms });
      cnt.addEventListener('change', function () { setRooms(+cnt.value, true); });
      out.push(field('Number of rooms', cnt, null, 'fRooms'));
    }
    var kid = P.audience(pl.audience).kid;
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'How does it end?'), h('div', { class: 'cards' }, P.FINALES.filter(function (f) { return !kid || f.id === 'escape'; }).map(function (f) {
      return radio('finale', f.label, f.help, pl.finale === f.id, function () { pl.finale = f.id; changed(true); });
    }))]));

    out.push(h('h3', { class: 'sub-head' }, 'Title and author'));
    var title = h('input', { class: 'input', id: 'fTitle', value: b.title, maxlength: 140 });
    title.addEventListener('input', function () { b.title = title.value; changed(); });
    var ideas = h('div', { class: 'chips ideas' });
    var sub = h('textarea', { class: 'textarea short', id: 'fSub', rows: 2, maxlength: 220 });
    sub.value = b.subtitle;
    sub.addEventListener('input', function () { b.subtitle = sub.value; changed(); });
    var author = h('input', { class: 'input', id: 'fAuthor', value: b.author, maxlength: 80, placeholder: 'For example: Blackthorn Press' });
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
    out.push(h('div', { class: 'field' }, [h('label', { for: 'fTitle' }, 'Book title'), title, h('div', { class: 'hint' }, 'Leave it empty to use the gray text, or click an idea. The AI adds its own ideas here after the first prompt.'), ideas]));
    out.push(field('Subtitle', sub, 'Leave it empty to use the gray text.', 'fSub'));
    out.push(field(h('span', null, ['Pen name ', h('span', { class: 'req' }, '*')]), author, 'Printed on the cover and the title page.', 'fAuthor'));
    out.push(next(2, 'Next: puzzles and pages'));
    return out;
  }

  // other: the "Other" card, which stays chosen even on a preset number
  function setRooms(n, other) {
    state.p.plan.rooms = P.validRooms(n) || U.clamp(Math.round(+n) || 10, P.MIN_ROOMS, P.MAX_ROOMS);
    state.otherRooms = !!other;
    changed(true);
  }

  // ---------- step 2: puzzles and pages ----------
  var GROUPS = [{ id: 'code', label: 'Secret codes' }, { id: 'logic', label: 'Logic' }, { id: 'picture', label: 'Picture puzzles' }, { id: 'words', label: 'Words' }];

  function body2() {
    var p = state.p, pl = p.plan, b = p.book;
    var out = [h('p', { class: 'lead' }, 'How hard it gets, which puzzles are in and how the pages are set.')];
    var levels = [{ id: 'rising', label: 'Rising', help: 'Easy rooms first, hard rooms last. The most satisfying way to play.' }].concat(P.LEVELS);
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Level'), h('div', { class: 'cards' }, levels.map(function (l) {
      return radio('level', l.label, l.help, pl.level === l.id, function () { pl.level = l.id; changed(true); });
    }))]));
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Puzzles in a room'), h('div', { class: 'cards three' }, [3, 4].map(function (n) {
      return radio('per', n + ' puzzles', n + ' digit code on each door', pl.perRoom === n, function () { pl.perRoom = n; changed(true); });
    }))]));
    var kindsBox = h('div', { class: 'kinds' });
    GROUPS.forEach(function (g) {
      kindsBox.appendChild(h('div', { class: 'kinds-head' }, g.label));
      E.list().filter(function (k) { return k.group === g.id; }).forEach(function (k) {
        kindsBox.appendChild(check(k.label, k.sub, pl.kinds.indexOf(k.id) !== -1, function (on) {
          var a = pl.kinds.filter(function (x) { return x !== k.id; });
          if (on) a.push(k.id);
          if (a.length < pl.perRoom) { dom.toast('Keep at least ' + pl.perRoom + ' types, so a room has no repeats.'); renderBody(); return; }
          pl.kinds = a;
          changed(true);
        }));
      });
    });
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'Puzzle types'), kindsBox,
      h('div', { class: 'hint' }, 'A mix sells best: reviews of other books ask for variety. Changing types after writing a room may ask the AI for a few more words. Riddles are the one type the app can’t prove, so read those yourself.')]));
    out.push(h('div', { class: 'field' }, [h('div', { class: 'field-label' }, 'In the book'), h('div', { class: 'stack' }, [
      check('Shuffle the rooms', 'The next room is never the next page, so only the right code gets you there. Recommended.', pl.shuffle, function (v) { pl.shuffle = v; changed(); }),
      check('Answers upside down', 'A stray glance can’t spoil an answer.', pl.flip, function (v) { pl.flip = v; changed(); }),
      check('Two notes pages', 'Lined pages for working, right after the Escape Log.', pl.notes, function (v) { pl.notes = v; changed(); })
    ])]));
    out.push(h('h3', { class: 'sub-head' }, 'Page size and print'));
    out.push(field('Page size', select('fTrim', CX.kdp.TRIMS.map(function (t) { return { v: t.id, t: t.label + ' – ' + t.hint }; }), b.trim, function (v) { b.trim = v; changed(true); }), '6 x 9 in is what most escape room books use.', 'fTrim'));
    out.push(field('Text size', select('fPrint', Object.keys(CX.layout.PRINT).map(function (k) { return { v: k, t: CX.layout.PRINT[k].label }; }), b.print, function (v) { b.print = v; changed(); }),
      'For the story, hints and notes. Puzzles are always as big as the page allows.', 'fPrint'));
    out.push(field('Paper', select('fPaper', CX.kdp.PAPERS.map(function (x) { return { v: x.id, t: x.label }; }), b.paper, function (v) { b.paper = v; changed(); }), null, 'fPaper'));
    var est = h('p', { class: 'derived' });
    live.push(function () { est.textContent = 'The book has about ' + (state.printPages || 0) + ' pages so far. It grows a little as the writing comes in.'; });
    live[live.length - 1]();
    out.push(est);
    out.push(next(3, 'Next: write the story'));
    return out;
  }

  // ---------- step 3: the prompts ----------
  function roomState(room) {
    var p = state.p, slots = room.slots.map(function (s) { return Z.status(p, s); }), ok = slots.filter(function (s) { return s.state === 'ok'; }).length, bad = slots.filter(function (s) { return s.state === 'problem'; }).length;
    return { ok: ok, bad: bad, total: slots.length, done: CX.prompts.roomDone(p, room) };
  }

  function body3() {
    var p = state.p, list = CX.prompts.list(p);
    if (state.sel == null || state.sel >= list.length) state.sel = CX.prompts.next(p);
    var cur = list[state.sel];
    var out = [h('ol', { class: 'howto' }, [
      h('li', null, ['Click ', h('b', null, 'Copy prompt'), '.']),
      h('li', null, ['Open ', h('b', null, 'ChatGPT'), ', ', h('b', null, 'Claude'), ' or ', h('b', null, 'Gemini'), ', paste (Ctrl+V) and press Enter.']),
      h('li', null, ['When it has finished, click the ', h('b', null, 'copy'), ' button on its code block (or select the whole reply and copy it).']),
      h('li', null, ['Paste it in the box below and click ', h('b', null, 'Add to book'), '. The app builds the puzzles.'])
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
    if (cur.kind === 'rooms') {
      var ul = h('ul', { class: 'pn-chapters' });
      cur.rooms.forEach(function (room) {
        var st = roomState(room), name = Z.roomName(p, room);
        ul.appendChild(h('li', { class: st.done ? 'full' : '' }, [h('span', null, 'Room ' + room.no + (name ? ' · ' + name : '')), h('span', { class: 'n' }, st.done ? '✓ ' + st.total + ' puzzles' : st.ok + ' of ' + st.total + ' puzzles')]));
      });
      panel.appendChild(ul);
      panel.appendChild(h('p', { class: 'pn-note' }, 'The AI writes each room and the words its puzzles show. The app makes the puzzles, the hints and the answers, and proves they work.'));
    } else {
      panel.appendChild(h('p', { class: 'pn-note' }, 'The story, the rooms, ' + (p.plan.finale === 'culprit' ? 'the suspects, the culprit' : 'the final word') + ', the ending and the back cover. Do this one first: the other prompts build on it.'));
    }
    var isRooms = cur.kind === 'rooms', filled = isRooms ? cur.rooms.filter(function (r) { return (p.rooms[r.id] || {}).enter && p.rooms[r.id].enter.length; }) : [];
    var checker = function () { return CX.prompts.checkText(state.p, cur.rooms); };
    var main = cur.done && filled.length ? checker : function () { return CX.prompts.text(state.p, cur); };
    panel.appendChild(h('div', { class: 'actions first' }, [
      dom.copyButton(cur.done && filled.length ? 'Copy check prompt' : 'Copy prompt', main, 'btn btn-primary')
    ].concat(AI_CHATS.map(function (ai) {
      return h('a', { class: 'btn', href: ai.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open ' + ai.name + ' ↗');
    }))));
    if (cur.done && filled.length) panel.appendChild(h('p', { class: 'hint' }, 'These rooms are done. The check prompt has the AI edit them as a careful editor. Its reply replaces what it sends back.'));
    var peek = h('details', { class: 'peek' }, [h('summary', null, 'See the prompt'), h('textarea', { class: 'textarea', readonly: true, rows: 8 })]);
    peek.addEventListener('toggle', function () { if (peek.open) peek.querySelector('textarea').value = main(); });
    panel.appendChild(peek);
    if (filled.length) {
      panel.appendChild(h('div', { class: 'fix-days' }, [
        h('b', null, 'Fix these rooms'),
        h('p', { class: 'hint' }, 'Send them to the AI for an edit, or clear them and write them again.'),
        h('div', { class: 'actions first' }, [
          cur.done ? null : dom.copyButton('Copy check prompt', checker, 'btn'),
          h('button', { type: 'button', class: 'btn danger-text', onclick: function () { redo(filled); } }, filled.length > 1 ? 'Write these rooms again' : 'Write this room again')
        ])
      ]));
    }
    out.push(panel);

    var ta = h('textarea', { class: 'textarea paste', id: 'fPaste', placeholder: 'Paste the AI’s whole reply here', spellcheck: 'false' });
    out.push(h('div', { class: 'field' }, [h('label', { for: 'fPaste' }, 'The AI’s reply'), ta]));
    out.push(h('div', { class: 'actions first' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { addReply(ta.value, cur); } }, 'Add to book')));
    var res = h('div', { class: 'result' });
    if (state.result) res.appendChild(state.result);
    out.push(res);
    out.push(h('p', { class: 'hint' }, 'Copilot and other AI chats work the same way. The app reads the room numbers in any reply, so a reply can go in while another prompt is selected.'));

    out.push(h('h3', { class: 'sub-head' }, 'Your story'));
    var need = CX.prompts.storyNeeds(p);
    out.push(h('p', { class: 'extras-line' }, need.length ? 'Still to write: ' + need.length + ' parts (the first prompt asks for them).' : 'The story is in.'));
    out.push(h('div', { class: 'actions first' }, h('button', { type: 'button', class: 'btn', onclick: viewStory }, 'Edit the story')));
    out.push(h('h3', { class: 'sub-head' }, 'Your rooms'));
    var rows = h('ul', { class: 'ch-list days-list' });
    P.rooms(p).forEach(function (room) {
      var st = roomState(room), name = Z.roomName(p, room), cls = st.done ? 'full' : st.bad ? 'weak' : st.ok ? '' : 'empty';
      rows.appendChild(h('li', { class: cls }, [
        h('span', { class: 'no' }, String(room.no)),
        h('span', { class: 'ct' }, name || h('i', { class: 'muted' }, 'not written yet')),
        h('span', { class: 'n' }, st.done ? '✓ ' + st.total + ' puzzles' : st.bad ? st.bad + ' to fix' : st.ok + ' of ' + st.total),
        h('button', { type: 'button', class: 'mini', onclick: function () { viewRoom(room); } }, 'Edit')
      ]));
    });
    out.push(rows);
    var t = CX.content.totals(p);
    if (t.ready) out.push(h('p', { class: 'hint' }, t.ready + ' of ' + t.puzzles + ' puzzles ready.'));
    out.push(next(4, 'Next: check and download'));
    return out;
  }

  function addReply(text, cur) {
    var p = state.p;
    if (!text.trim()) { state.result = msg('err', 'The box is empty. Paste the AI’s reply into it first.'); renderBody(); return; }
    var kind = CX.reader.kind(text);
    if (kind === 'unknown') {
      state.result = msg('err', 'This does not look like a reply to one of the prompts.', ['Copy the whole reply: the copy button on the AI’s code block copies all of it.', 'Make sure you pasted the reply, not the prompt.']);
      renderBody(); return;
    }
    if (kind === 'story') {
      var got = CX.content.addStory(p, CX.reader.readStory(text)).got, notes = [], wp = Z.wordProblem(p);
      if (got.length && wp && CX.reader.readStory(text).word) notes.push(wp.charAt(0).toUpperCase() + wp.slice(1) + '. Copy the prompt again: it asks for a new word.');
      if (p.plan.finale === 'culprit' && p.story.culprit && !p.story.suspects.some(function (s) { return s.name === p.story.culprit; })) notes.push('The culprit’s name is not spelled as in the list of suspects. Click Edit the story to fix it.');
      state.result = got.length ? msg('ok', 'Added: ' + got.join(', ') + '.', notes) : msg('err', 'Nothing new was added.', ['Check that you pasted the reply to this prompt.']);
    } else {
      var parsed = CX.reader.readRooms(text), rep = CX.content.addRooms(p, parsed, cur.kind === 'rooms' ? cur.rooms : []);
      if (!rep.rooms.length) { state.result = msg('err', 'Nothing new was added.', ['Check that you pasted the reply to this prompt.']); renderBody(); return; }
      var note = [], rooms = P.rooms(p), problems = [];
      rep.rooms.forEach(function (no) {
        rooms[no - 1].slots.forEach(function (s) { var st = Z.status(p, s); if (st.state === 'problem') problems.push(s.key + ': ' + st.problem); });
      });
      if (problems.length) note.push('Can’t be built yet: ' + problems.slice(0, 4).join('; ') + '. Copy the prompt again: it asks for those parts only.');
      if (rep.unplaced) note.push(U.plural(rep.unplaced, 'part', 'parts') + ' of the reply did not match a room or puzzle of this book.');
      var dups = CX.content.repeats(p);
      if (dups.length) note.push(dups.slice(0, 3).map(function (r) { return 'The ' + r.what + ' "' + r.name + '" is on ' + r.where.join(', '); }).join('. ') + '. Click Edit to change one.');
      state.result = msg('ok', 'Added ' + U.plural(rep.rooms.length, 'room') + ' and ' + U.plural(rep.puzzles, 'puzzle') + '.', note);
    }
    state.sel = CX.prompts.next(p);
    if (CX.prompts.list(p).every(function (x) { return x.done; })) state.result.appendChild(h('div', { class: 'fix-help' }, 'Every prompt is done. Look through the book on the right, then go on to the cover.'));
    changed(true);
  }

  // Clears rooms so the prompt asks the AI for all of them again.
  async function redo(rooms) {
    var names = rooms.map(function (r) { return 'room ' + r.no; }).join(' and ');
    var ok = await dom.confirm({
      title: rooms.length > 1 ? 'Write these rooms again?' : 'Write this room again?',
      body: ['The story and the puzzle words of ' + names + ' are cleared.', 'Then copy the prompt again. Save the project file first if you may want the old text back.'],
      actions: [{ label: 'Cancel', value: false }, { label: 'Clear them', value: true, danger: true }]
    });
    if (!ok) return;
    CX.content.clearRooms(state.p, rooms);
    state.result = msg('ok', 'Cleared ' + names + '. Copy the prompt again and paste the new reply.');
    changed(true);
  }

  // ---------- editing by hand ----------
  function textField(id, label, value, hint, onchange, rows) {
    var el = h(rows ? 'textarea' : 'input', { class: rows ? 'textarea' : 'input', id: id });
    if (rows) el.rows = rows;
    el.value = value;
    el.addEventListener('input', function () { onchange(el.value); changed(); });
    return field(label, el, hint, id);
  }
  function paragraphs(s) { return s.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function commas(s) { return s.split(',').map(function (x) { return x.trim(); }).filter(Boolean); }

  function viewStory() {
    var p = state.p, st = p.story, pl = p.plan, body = h('div', { class: 'day-texts' }), add = function (x) { body.appendChild(x); };
    add(textField('sPremise', 'Premise', st.premise, 'The whole story in a few sentences. Not printed: the AI uses it to stay on track.', function (v) { st.premise = v; }, 3));
    add(textField('sRole', 'Who the reader is', st.role, null, function (v) { st.role = v; }));
    add(textField('sOpening', 'Opening', st.opening.join('\n\n'), null, function (v) { st.opening = paragraphs(v); }, 6));
    if (pl.finale === 'culprit') {
      add(textField('sSuspects', 'Suspects', st.suspects.map(function (s) { return s.name + ' | ' + s.about; }).join('\n'), 'One to a line: Name | who they are.', function (v) {
        st.suspects = v.split('\n').map(function (l) { var q = l.split('|'); return { name: q[0].trim(), about: (q[1] || '').trim() }; }).filter(function (s) { return s.name; });
      }, 5));
      add(textField('sCulprit', 'Culprit', st.culprit, 'Spelled exactly as in the suspects.', function (v) { st.culprit = v.trim(); }));
      add(textField('sBad', 'When the reader names the wrong person', st.badEnding.join(' '), null, function (v) { st.badEnding = paragraphs(v); }, 2));
    } else {
      add(textField('sWord', 'Final word', st.word, 'It needs exactly ' + pl.rooms + ' letters, one from each room.', function (v) { st.word = v.toUpperCase(); }));
      add(textField('sDecoys', 'Decoys', st.wordDecoys.join(', '), 'Other words with the same number of letters, for the last door’s list.', function (v) { st.wordDecoys = commas(v.toUpperCase()); }));
      add(textField('sClue', 'Clue at the last door', st.wordClue, null, function (v) { st.wordClue = v; }));
    }
    add(textField('sEnding', 'Ending', st.ending.join('\n\n'), null, function (v) { st.ending = paragraphs(v); }, 5));
    add(textField('sAlarms', 'Dead End lines', st.alarms.join('\n'), 'One to a line. Each Dead End page opens with one.', function (v) { st.alarms = paragraphs(v); }, 5));
    add(textField('sClosing', 'Closing note', st.closing.join('\n\n'), null, function (v) { st.closing = paragraphs(v); }, 3));
    add(textField('sBlurb', 'Back cover', st.blurb, null, function (v) { st.blurb = v; }, 4));
    openModal('The story', body, [{ label: 'Close', primary: true }], function () { changed(true); });
  }

  /*
   * One room, to fix by hand: its texts, and each puzzle with its type, its words and what the app
   * made of them. Typing goes straight into the book.
   */
  function viewRoom(room) {
    var p = state.p, d = P.room(p, room.id), body = h('div', { class: 'day-view' }), clears = CX.prompts.evidenceFor(p, room);
    body.appendChild(textField('rName', 'Room name', d.name || Z.roomName(p, room), null, function (v) { d.name = v; }));
    body.appendChild(textField('rEnter', 'Going in', d.enter.join('\n\n'), 'Printed on the room’s first page.', function (v) { d.enter = paragraphs(v); }, 4));
    body.appendChild(textField('rExit', 'Getting out', d.exit.join('\n\n'), 'Printed on the next room’s first page, once the right code gets the reader there.', function (v) { d.exit = paragraphs(v); }, 3));
    if (clears) body.appendChild(textField('rEv', 'Evidence that clears ' + clears, d.evidence, null, function (v) { d.evidence = v; }, 2));
    room.slots.forEach(function (slot) {
      var q = P.puzzle(p, slot), box = h('details', { class: 'puzzle-edit', open: Z.status(p, slot).state !== 'ok' });
      var facts = h('div', { class: 'day-facts' });
      function showFacts() {
        var st = Z.status(p, slot), pz = st.pz;
        facts.innerHTML = '';
        if (st.state === 'problem') facts.appendChild(h('p', { class: 'warn-line' }, 'Can’t be built yet: ' + st.problem + '.'));
        else if (pz && !pz.problem) {
          facts.appendChild(h('p', null, 'Digit ' + pz.digit + '. ' + pz.steps.join(' ')));
          facts.appendChild(h('ul', null, pz.hints.map(function (t) { return h('li', null, t.replace(/\{kit\}/g, 'the Field Kit')); })));
        } else facts.appendChild(h('p', { class: 'muted' }, 'Not written yet.'));
      }
      var kindSel = select('k-' + slot.id, E.list().map(function (k) { return { v: k.id, t: k.label }; }), slot.kind, function (v) {
        q.kind = v; slot.kind = v; changed(); close(); viewRoom(P.rooms(p)[room.no - 1]);
      });
      box.appendChild(h('summary', null, slot.key + '  ' + (q.title || E.kind(slot.kind).label) + '  ·  ' + E.kind(slot.kind).label));
      box.appendChild(field('Puzzle type', kindSel, E.kind(slot.kind).sub, 'k-' + slot.id));
      box.appendChild(textField('t-' + slot.id, 'Title', q.title, null, function (v) { q.title = v; showFacts(); }));
      box.appendChild(textField('s-' + slot.id, 'Story', q.story, 'Printed above the puzzle. Keep it short: the puzzle gets what is left of the page.', function (v) { q.story = v; showFacts(); }, 2));
      E.kind(slot.kind).needs.forEach(function (f) {
        var isList = Array.isArray(q[f]), names = { message: 'Message', words: 'Words', people: 'People', objects: 'Objects', place: 'Numbered place', riddle: 'Riddle', answer: 'Answer', wrong: 'Wrong answers', hint: 'Hint', why: 'Why it is right' };
        var hints = { message: 'Keep [N] once, where the number word goes. At most ' + E.kind(slot.kind).maxLetters + ' letters, and no other number words.', words: 'Separated by commas.', people: 'Separated by commas.', objects: 'Separated by commas.', wrong: 'Separated by commas.' };
        box.appendChild(textField(f + '-' + slot.id, names[f], isList ? q[f].join(', ') : q[f], hints[f], function (v) { q[f] = isList ? commas(f === 'words' ? v.toUpperCase() : v) : v; showFacts(); }, f === 'riddle' ? 3 : 0));
      });
      showFacts();
      box.appendChild(facts);
      box.appendChild(h('div', { class: 'actions first' }, h('button', { type: 'button', class: 'mini', onclick: function () { q.v = (q.v || 0) + 1; showFacts(); changed(); } }, 'New version of this puzzle')));
      body.appendChild(box);
    });
    var close = openModal('Room ' + room.no + (Z.roomName(p, room) ? ': ' + Z.roomName(p, room) : ''), body, [
      { label: 'Copy check prompt', run: function () { dom.copyText(CX.prompts.checkText(p, [room])); dom.toast('Check prompt copied.'); } },
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
    function close(quiet) { back.hidden = true; back.classList.remove('wide'); document.removeEventListener('keydown', onKey, true); if (onClose && !quiet) onClose(); if (prev && prev.focus && document.contains(prev)) prev.focus(); }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    actions.forEach(function (a) {
      acts.appendChild(h('button', { type: 'button', class: a.primary ? 'btn btn-primary' : 'btn' + (a.danger ? ' danger-text' : ''), onclick: function () { if (a.run) a.run(); if (!a.run || a.close) close(); } }, a.label));
    });
    document.addEventListener('keydown', onKey, true);
    back.classList.add('wide');
    back.hidden = false;
    acts.lastChild.focus();
    return function () { close(true); };
  }

  // ---------- cover mode ----------
  function coverBody() {
    var p = state.p, c = p.cover, b = p.book, pages = state.printPages || 100;
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
      var pl = p.plan, key = JSON.stringify([b.title, b.subtitle, b.author, b.trim, b.print, b.paper, pl.rooms, pl.perRoom, state.printPages, p.seed]);
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
    var blurb = h('textarea', { class: 'textarea', id: 'cBlurb', rows: 5, maxlength: 900, placeholder: 'Comes from the first prompt in step 3, or type your own.' });
    blurb.value = p.story.blurb;
    blurb.addEventListener('input', function () { p.story.blurb = blurb.value; changed(); });
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
    var t = CX.kdp.trim(p.book.trim), hasRiddle = p.plan.kinds.indexOf('riddle') !== -1;
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
        h('li', null, 'KDP asks whether AI helped make the book. The story was written with an AI chat, so answer yes for the text.'),
        h('li', null, 'Say "no app, just a pencil" in your description if you can: reviews of QR-code books complain about this more than anything else.'),
        h('li', null, 'Keep other books’ and games’ names out of your title, subtitle, cover and keywords.'),
        h('li', null, (hasRiddle ? 'Read every riddle yourself: it is the one puzzle the app can’t prove. ' : '') + 'Play at least one room with a pencil before you publish. The app proves the puzzles and the route, but only a reader can tell whether a story feels fair.')
      ]),
      h('h3', { class: 'sub-head' }, 'Edit in Canva'),
      h('div', { class: 'actions first' }, [
        h('button', { type: 'button', class: 'btn', onclick: function () { downloadCanva('book'); } }, 'Book for Canva (.pptx)')
      ]),
      h('ul', { class: 'safety' }, [
        h('li', null, 'Upload this .pptx rather than a PDF: Canva jumbles PDFs. Every page comes in at the trim size, with each line of text editable and the puzzles as shapes.'),
        h('li', null, 'Careful: page numbers in the tables are plain text, so moving or adding pages in Canva breaks the route. Change the words, not the order.'),
        h('li', null, 'From Canva, download as "PDF Print" for KDP. The PDF from this app stays the safest file to upload.')
      ])
    ];
  }

  // ---------- steps ----------
  var STEPS = [
    { n: 1, title: 'The book', body: body1, chip: function (p) { return { t: p.plan.rooms + ' rooms · ' + P.audience(p.plan.audience).label, ok: !!p.book.author.trim() }; } },
    { n: 2, title: 'Puzzles and pages', body: body2, chip: function (p) { return { t: p.plan.kinds.length + ' puzzle types · ' + CX.kdp.trim(p.book.trim).label, ok: true }; } },
    { n: 3, title: 'Write the story with AI', body: body3, chip: function (p) { var l = CX.prompts.list(p), d = l.filter(function (x) { return x.done; }).length; return { t: d + ' of ' + l.length + ' prompts', ok: d === l.length }; } },
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
        live.forEach(function (f) { f(); });
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
      var id = U.hashHex('interior|' + p.seed + '|' + book.pages.length) + U.hashHex(JSON.stringify(p.rooms).length + '|' + p.seed);
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
  function hasWork(p) { return p.story.opening.length > 0 || Object.keys(p.rooms).some(function (k) { return p.rooms[k].enter.length || Object.keys(p.rooms[k].puzzles).length; }); }

  function exportProject() {
    dom.download(JSON.stringify(state.p, null, 1), slug() + '-project.json', 'application/json');
    dom.toast('Project file saved. Open it later with "Open project file".');
  }

  function importProject(file) {
    var fr = new FileReader();
    fr.onload = async function () {
      var data;
      try { data = JSON.parse(fr.result); } catch (e) { dom.toast('That file is not a project file from this app.'); return; }
      if (!data || !data.book || !data.plan || !data.story) { dom.toast('That file is not a project file from this app.'); return; }
      if (hasWork(state.p)) {
        var ok = await dom.confirm({ title: 'Open this project?', body: 'The book you have open now is replaced. Save it first if you want to keep it.', actions: [{ label: 'Cancel', value: false }, { label: 'Open it', value: true, primary: true }] });
        if (!ok) return;
      }
      state.p = P.normalize(data); state.otherRooms = false;
      state.sel = null; state.result = null;
      openStep(firstOpenStep()); renderPreview();
      dom.toast('Project opened.');
    };
    fr.readAsText(file);
  }

  async function startOver() {
    var ok = await dom.confirm({ title: 'Start a new book?', body: ['Everything in this book is cleared: settings, story, puzzles and cover.', 'Save the project file first if you want to keep it.'], actions: [{ label: 'Cancel', value: false }, { label: 'Clear and start over', value: true, danger: true }] });
    if (!ok) return;
    state.p = P.newProject(); state.otherRooms = false;
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
    state.p = P.newProject(); state.otherRooms = false;
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

  CX.app = { state: state, openStep: openStep, setMode: setMode, addReply: addReply, renderPreview: renderPreview, viewRoom: viewRoom, viewStory: viewStory, changed: changed };
  boot();
})(window);
