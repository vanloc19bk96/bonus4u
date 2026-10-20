/* state.js — the single source of truth. Every write goes through
   WYR.state.set / update so the change notification stays in one place.

   Nothing is written to localStorage: each time index.html is opened the
   app starts empty. "Export JSON" / "Import JSON" is the only way a project
   survives closing the tab, and that stays an explicit choice. */
(function () {
  var W = window.WYR;
  var C = W.config;

  var listeners = [];

  function defaults() {
    return {
      v: C.STORAGE_VERSION,
      setup: {
        audience: C.DEFAULT_AUDIENCE,
        theme: C.DEFAULT_THEME,
        customTheme: '',
        count: C.DEFAULT_COUNT,
        style: C.DEFAULT_STYLE,
        language: C.DEFAULT_LANGUAGE
      },
      book: {
        title: '',
        subtitle: '',
        author: '',
        year: new Date().getFullYear(),
        titleIdeas: []
      },
      layout: {
        trim: C.DEFAULT_TRIM,
        perPage: C.TRIMS[C.DEFAULT_TRIM].perPage,
        perPageTouched: false,
        sections: { howTo: true, answers: true, chapters: true, yourTurn: true, thankYou: true },
        checkboxStyle: 'players',      // 'players' | 'single' | 'none'
        answersPlacement: 'end',       // 'end' | 'chapter'
        chapterOnOdd: false
      },
      questions: [],
      ui: { step: 1, zoom: 1, page: 1, showMargins: false, promptBatch: 1 }
    };
  }

  var S = (W.state = {
    data: defaults(),

    defaults: defaults,

    /* Subscribe to changes. cb(data, reason) */
    onChange: function (cb) { listeners.push(cb); },

    emit: function (reason) {
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](S.data, reason); }
        catch (e) { console.error('state listener failed', e); }
      }
    },

    /* Shallow-merge a patch into one top-level branch, then notify. */
    update: function (branch, patch, reason) {
      var target = S.data[branch];
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) target[k] = patch[k];
      S.emit(reason || branch);
    },

    set: function (branch, value, reason) {
      S.data[branch] = value;
      S.emit(reason || branch);
    },

    reset: function () {
      S.data = defaults();
      S.emit('reset');
    },

    /* --- question helpers ----------------------------------------------- */
    questionCount: function () { return S.data.questions.length; },

    /* Re-numbers questions 1..n in book order, keeping sourceId for the
       "rewrite these" flow. */
    renumber: function () {
      var q = S.data.questions;
      for (var i = 0; i < q.length; i++) q[i].id = i + 1;
    },

    addQuestions: function (list) {
      S.data.questions = S.data.questions.concat(list);
      S.renumber();
      S.emit('questions');
    },

    replaceQuestions: function (list) {
      var byId = {}, i;
      for (i = 0; i < S.data.questions.length; i++) byId[S.data.questions[i].id] = S.data.questions[i];
      var replaced = 0;
      for (i = 0; i < list.length; i++) {
        var incoming = list[i], target = byId[incoming.id];
        if (!target) continue;
        ['cat', 'a', 'b', 'why_hard', 'a_plus', 'b_plus', 'bonus'].forEach(function (k) {
          if (incoming[k]) target[k] = incoming[k];
        });
        target.warnings = incoming.warnings || [];
        replaced++;
      }
      S.emit('questions');
      return replaced;
    },

    removeQuestion: function (id) {
      S.data.questions = S.data.questions.filter(function (q) { return q.id !== id; });
      S.renumber();
      S.emit('questions');
    },

    clearQuestions: function () {
      S.data.questions = [];
      S.data.book.titleIdeas = [];
      S.emit('questions');
    },

    /* --- backup file ----------------------------------------------------- */
    exportJSON: function () {
      return JSON.stringify({
        v: C.STORAGE_VERSION,
        setup: S.data.setup,
        book: S.data.book,
        layout: S.data.layout,
        questions: S.data.questions
      }, null, 2);
    },

    importJSON: function (text) {
      var parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.questions)) {
        throw new Error('That backup file is not in the right format.');
      }
      var fresh = defaults();
      S.data = migrate({
        v: parsed.v || C.STORAGE_VERSION,
        setup: merge(fresh.setup, parsed.setup),
        book: merge(fresh.book, parsed.book),
        layout: merge(fresh.layout, parsed.layout),
        questions: parsed.questions,
        ui: fresh.ui
      });
      S.renumber();
      S.emit('import');
      return S.data.questions.length;
    }
  });

  function merge(base, patch) {
    var out = {}, k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    if (patch) for (k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) out[k] = patch[k];
    return out;
  }

  /* Fills in anything a saved file predates, so an old project still opens. */
  function migrate(saved) {
    var fresh = defaults();
    var out = {
      v: C.STORAGE_VERSION,
      setup: merge(fresh.setup, saved.setup),
      book: merge(fresh.book, saved.book),
      layout: merge(fresh.layout, saved.layout),
      questions: Array.isArray(saved.questions) ? saved.questions : [],
      ui: merge(fresh.ui, saved.ui)
    };
    out.layout.sections = merge(fresh.layout.sections, saved.layout && saved.layout.sections);
    if (!Array.isArray(out.book.titleIdeas)) out.book.titleIdeas = [];
    for (var i = 0; i < out.questions.length; i++) {
      var q = out.questions[i];
      q.id = i + 1;
      if (!Array.isArray(q.warnings)) q.warnings = [];
    }
    return out;
  }
})();
