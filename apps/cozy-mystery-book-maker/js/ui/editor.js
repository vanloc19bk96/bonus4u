/* Chapter editor: edit a chapter's title, text or word list in place; its puzzle rebuilds automatically. */
(function (root) {
  'use strict';
  var Cozy = root.Cozy;
  var h = Cozy.dom.h, T = Cozy.text, U = Cozy.util;

  var drawer, target = null, fields = {}, pendingSnap = null, lastFocus = null;

  function init() {
    drawer = document.getElementById('drawer');
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !drawer.hidden && document.getElementById('modal').hidden) close();
    });
  }

  function chapterOf(t) {
    var p = Cozy.app.state.project;
    return t === 'epilogue' ? p.epilogue : p.chapters[t];
  }

  var commitSoon = Cozy.dom.debounce(function () {
    if (target == null || !pendingSnap) return;
    var snap = pendingSnap;
    pendingSnap = null;
    var t = target;
    Cozy.app.commit(function (p) {
      var ch = t === 'epilogue' ? p.epilogue : p.chapters[t];
      if (!ch) return;
      if (fields.title) ch.title = T.cleanTitle(fields.title.value).slice(0, 40);
      if (fields.text) ch.paragraphs = T.cleanParagraphs(fields.text.value);
      if (fields.words) ch.words = fields.words.value.split(/\n|,/).map(function (w) { return w.trim(); }).filter(Boolean);
      ch.edited = true;
      p.downloaded = false;
    }, { snapshot: snap });
  }, 450);

  function onEdit() {
    if (!pendingSnap) pendingSnap = Cozy.store.snapshot(Cozy.app.state.project);
    commitSoon();
  }

  function open(t, focusField) {
    var ch = chapterOf(t);
    if (!ch) return;
    if (target != null && target !== t) commitSoon.flush();
    lastFocus = document.activeElement;
    target = t;
    fields = {};
    drawer.innerHTML = '';
    var isEp = t === 'epilogue';
    var d = Cozy.app.state.d;
    var head = h('div', { class: 'drawer-head' }, [
      h('h2', { id: 'drawerTitle' }, isEp ? 'Edit the epilogue' : 'Edit chapter ' + t),
      h('button', { type: 'button', class: 'btn small', onclick: close }, 'Done')
    ]);
    var body = h('div', { class: 'drawer-body' });
    drawer.setAttribute('aria-labelledby', 'drawerTitle');

    fields.title = h('input', { class: 'input', id: 'edTitle', maxlength: 40, value: ch.title || '' });
    fields.title.addEventListener('input', function () { onEdit(); meterTitle(); });
    body.appendChild(h('div', { class: 'field' }, [h('label', { for: 'edTitle' }, 'Title'), fields.title, h('div', { class: 'meter', id: 'mTitle' })]));

    fields.text = h('textarea', { class: 'textarea text', id: 'edText', spellcheck: 'true' });
    fields.text.value = (ch.paragraphs || []).join('\n\n');
    fields.text.addEventListener('input', onEdit);
    body.appendChild(h('div', { class: 'field' }, [
      h('label', { for: 'edText' }, 'Text'),
      fields.text,
      h('div', { class: 'meter', id: 'mText' }),
      h('div', { class: 'hint' }, 'Leave a blank line between paragraphs.')
    ]));

    if (!isEp) {
      var clue = d.clueByChapter[t];
      if (clue && clue.word) {
        body.appendChild(h('p', { class: 'note' }, ['This chapter hides the clue ', h('strong', null, clue.display || clue.word),
          '. Keep it in the word list: the app prints it in the list but leaves it out of the grid.']));
      }
      fields.words = h('textarea', { class: 'textarea words', id: 'edWords', spellcheck: 'false' });
      fields.words.value = (ch.words || []).join('\n');
      fields.words.addEventListener('input', onEdit);
      body.appendChild(h('div', { class: 'field' }, [
        h('label', { for: 'edWords' }, 'Word list (one per line)'),
        fields.words,
        h('div', { class: 'meter', id: 'mWords' }),
        h('div', { id: 'wordNotes' })
      ]));
      body.appendChild(h('div', { class: 'actions' }, [
        h('button', { type: 'button', class: 'btn', onclick: function () { Cozy.app.reshuffle(t); } }, 'Reshuffle the puzzle'),
        h('button', { type: 'button', class: 'btn', onclick: function () { Cozy.preview.goTo(d.pages.puzzle(t)); } }, 'Show the puzzle')
      ]));
    }
    body.appendChild(h('div', { id: 'edFix' }));
    body.appendChild(h('p', { class: 'hint' }, 'Changes save as you type. Press Undo at the top of the preview to step back.'));
    drawer.appendChild(head);
    drawer.appendChild(body);
    drawer.hidden = false;
    refresh();
    var f = focusField === 'words' && fields.words ? fields.words : fields.title;
    setTimeout(function () { f.focus(); }, 30);
    Cozy.preview.goTo(isEp ? d.pages.epilogue : (focusField === 'words' ? d.pages.puzzle(t) : d.pages.chapter(t)), true);
  }

  function meterTitle() {
    var m = document.getElementById('mTitle');
    if (m) m.innerHTML = '<span></span><span>' + fields.title.value.length + ' / 40</span>';
  }

  function refresh() {
    if (target == null || drawer.hidden) return;
    var st = Cozy.app.state;
    var ch = chapterOf(target);
    if (!ch) { close(); return; }
    meterTitle();
    var wc = U.countWords((ch.paragraphs || []).join(' '));
    var f = st.book && st.book.fit[target];
    var mt = document.getElementById('mText');
    if (mt) {
      var fitTxt = !f ? '' : (f.fits ? (f.size >= 11 ? '<span class="good">Fits on one page</span>' : '<span class="good">Fits, at ' + f.size + ' pt</span>')
        : '<span class="bad">Too long: cut about ' + f.cut + ' words</span>');
      var aim = target === 'epilogue' ? 'aim for 200–250' : 'aim for 220–260';
      mt.innerHTML = '<span>' + wc + ' words (' + aim + ')</span>' + fitTxt;
    }
    var fix = document.getElementById('edFix');
    if (fix) {
      fix.innerHTML = '';
      if (f && !f.fits && target !== 'epilogue') {
        fix.appendChild(h('div', { class: 'msg err' }, [
          'Ask the AI to shorten it, or trim it here.',
          h('div', { class: 'actions' }, Cozy.dom.copyButton('Copy fix prompt', function () {
            return Cozy.prompts.chapterFixPrompt(st.project, st.d, target, 'Chapter ' + target + ' is about ' + f.cut + ' words too long to fit on its page. Shorten it to about ' + Math.max(200, wc - f.cut - 5) + ' words, keeping the story beats.');
          }, 'btn small'))
        ]));
      }
    }
    if (target !== 'epilogue') {
      var prep = st.prepared[target];
      var mw = document.getElementById('mWords');
      if (mw && prep) mw.innerHTML = '<span>' + prep.usable + ' of ' + st.d.wordsPerPuzzle + ' usable words</span>' +
        (prep.usable >= st.d.wordsPerPuzzle ? '<span class="good">Puzzle ready</span>' : '<span class="bad">Needs more words</span>');
      var notes = document.getElementById('wordNotes');
      if (notes && prep) {
        notes.innerHTML = '';
        prep.notes.forEach(function (n) {
          notes.appendChild(h('div', { class: 'msg ' + (n.level === 'error' ? 'err' : n.level === 'warning' ? 'warn' : 'ok') }, n.text));
        });
        var pz = st.puzzles[target];
        if (pz && pz.ok === false) notes.appendChild(h('div', { class: 'msg err' }, 'The puzzle could not be built: ' + pz.reason));
      }
    }
  }

  function close() {
    commitSoon.flush();
    drawer.hidden = true;
    target = null;
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  }

  Cozy.editor = { init: init, open: open, close: close, refresh: refresh };
})(window);
