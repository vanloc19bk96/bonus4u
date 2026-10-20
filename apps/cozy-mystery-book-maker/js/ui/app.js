/*
 * App controller: owns the project, runs the rebuild pipeline (word lists -> puzzles -> layout ->
 * checklist), saves after every change, and wires the sidebar, preview and editor together.
 */
(function (root) {
  'use strict';
  var Cozy = root.Cozy;
  var B = Cozy.book, U = Cozy.util, D = Cozy.dom, S = Cozy.store;

  var App = Cozy.app = {
    state: {
      project: null, d: null, prepared: {}, puzzles: {}, final: null, book: null, batches: [], checklist: null,
      building: false, buildDone: 0, buildTotal: 0
    },
    ui: { step: 'setup', openBatch: null, margins: false, answers: false, pdf: null, open: {} }
  };

  // ---------- saving ----------
  // Kept as a hook for callers; the project lives only in memory (a reload starts a new book).
  App.save = function () {};

  // ---------- changes ----------
  /*
   * Applies a change. opts.undo (default true) records an undo point first;
   * opts.snapshot passes a snapshot taken earlier (for typed fields).
   */
  App.commit = function (mutate, opts) {
    opts = opts || {};
    if (opts.undo !== false) S.pushUndo(opts.snapshot || App.state.project);
    mutate(App.state.project);
    App.rebuild();
    App.save();
  };

  App.undo = function () {
    var p = S.undo(App.state.project);
    if (!p) return;
    App.state.project = p; App.rebuild(); App.save(); D.toast('Undone');
  };
  App.redo = function () {
    var p = S.redo(App.state.project);
    if (!p) return;
    App.state.project = p; App.rebuild(); App.save(); D.toast('Redone');
  };

  // ---------- rebuild pipeline ----------
  var buildToken = 0;
  App.rebuild = function () {
    var st = App.state, p = st.project;
    st.d = B.derive(p);
    B.pruneCache(p, st.d);
    st.prepared = B.prepareAll(p, st.d);
    st.puzzles = {};
    var pending = [];
    for (var n = 1; n <= st.d.N; n++) {
      var prep = st.prepared[n];
      if (!prep) continue;
      if (B.needsBuild(p, st.d, n, prep)) pending.push(n);
      else st.puzzles[n] = p.cache.puzzles[n] || null;
    }
    var finalPending = B.finalNeedsBuild(p, st.d);
    st.final = finalPending ? null : (p.plan ? p.cache.final : null);
    layoutAndRender();
    if (pending.length || finalPending) runBuilds(pending, finalPending);
  };

  function runBuilds(pending, finalPending) {
    var token = ++buildToken;
    var st = App.state;
    st.building = true; st.buildDone = 0; st.buildTotal = pending.length + (finalPending ? 1 : 0);
    var i = 0;
    var lastPaint = Date.now();
    function step() {
      if (token !== buildToken) return;
      var t0 = Date.now();
      while (i < pending.length && Date.now() - t0 < 40) {
        var n = pending[i++];
        st.puzzles[n] = B.puzzleFor(st.project, st.d, n, st.prepared[n]);
        st.buildDone++;
      }
      if (i >= pending.length && finalPending) {
        st.final = B.finalFor(st.project, st.d);
        finalPending = false;
        st.buildDone++;
      }
      var finished = i >= pending.length && !finalPending;
      if (finished || Date.now() - lastPaint > 250) { lastPaint = Date.now(); if (finished) st.building = false; layoutAndRender(); }
      if (!finished) setTimeout(step, 0);
      else App.save();
    }
    setTimeout(step, 0);
  }

  function layoutAndRender() {
    var st = App.state;
    st.book = Cozy.layout.layoutBook({ project: st.project, d: st.d, prepared: st.prepared, puzzles: st.puzzles, final: st.final });
    st.batches = st.d.batches.map(function (b, bi) { return B.batchStatus(st.project, st.d, bi, st.prepared, st.book.fit); });
    st.checklist = st.project.plan ? Cozy.checklist.run(st) : null;
    Cozy.sidebar.render();
    Cozy.preview.update();
    Cozy.editor.refresh();
    updateUndoButtons();
  }
  App.repaint = layoutAndRender;

  function updateUndoButtons() {
    document.getElementById('btnUndo').disabled = !S.canUndo();
    document.getElementById('btnRedo').disabled = !S.canRedo();
  }

  // What the preview shows: always the user's book (placeholder pages until a plan is pasted).
  App.view = function () {
    return { sample: false, state: App.state };
  };

  // ---------- step states ----------
  App.steps = function () {
    var st = App.state, p = st.project;
    var mixOk = p.setup.difficulty !== 'mix' || B.mixTotal(p.setup.mix) === 100;
    var setupDone = !!p.setup.penName.trim() && !!String(p.setup.theme || '').trim() && mixOk;
    var planState = p.plan ? 'done' : (p.planCheck && p.planCheck.issues && p.planCheck.issues.some(function (i) { return i.level === 'error'; }) ? 'fix' : 'todo');
    var bStates = st.batches.map(function (b) { return b.state; });
    var chState = bStates.every(function (s) { return s === 'done'; }) ? 'done' : (bStates.some(function (s) { return s === 'fix'; }) ? 'fix' : 'todo');
    if (!p.plan) chState = 'todo';
    var reviewState = 'todo';
    if (chState === 'done' && st.checklist) reviewState = !st.checklist.ok ? 'fix' : (p.downloaded ? 'done' : 'todo');
    return {
      setup: { state: setupDone ? 'done' : ((p.setupTried || !mixOk) ? 'fix' : 'todo'), locked: false },
      plan: { state: planState, locked: !setupDone },
      chapters: { state: chState, locked: !setupDone || !p.plan },
      review: { state: reviewState, locked: !setupDone || !p.plan || chState !== 'done' }
    };
  };

  App.openStep = function (id) {
    App.ui.step = id;
    App.state.project.uiStep = id;
    App.save();
    Cozy.sidebar.render();
    var el = document.getElementById('step-' + id);
    if (el) el.scrollIntoView({ block: 'nearest' });
  };

  // ---------- pasting answers ----------
  App.pastePlan = function (text, isFix) {
    var p = App.state.project;
    if (!isFix) p.planText = text;
    if (!text.trim()) {
      if (!isFix) { p.planCheck = null; p.planDraft = null; }
      App.save(); Cozy.sidebar.render(); return;
    }
    var base = isFix ? (p.planDraft || p.plan) : (p.planDraft && !p.plan ? p.planDraft : null);
    var res = B.importPlan(p, text, base);
    if (!res.ok) {
      if (res.plan) p.planDraft = res.plan;
      p.planCheck = { issues: res.issues, fromFix: !!isFix };
      App.save(); Cozy.sidebar.render();
      return;
    }
    var hasChapters = Object.keys(p.chapters).length > 0;
    function apply() {
      App.commit(function (pp) {
        if (!res.partial && hasChapters) { pp.chapters = {}; pp.epilogue = null; pp.batchText = []; pp.batchIssues = []; pp.cache.puzzles = {}; }
        B.applyPlan(pp, res.plan);
        pp.planDraft = null;
        pp.planCheck = { issues: res.issues, ok: true };
        pp.downloaded = false;
      });
      D.toast('Story plan added. Pick your title, then continue to step 3 to add the chapters and build the puzzles.');
    }
    if (p.plan && !res.partial && hasChapters && !samePlanStory(p.plan, res.plan)) {
      D.confirm({
        title: 'Replace the story plan?',
        body: ['This is a new story plan. Your chapters were written for the old one, so they will be cleared.', 'You can undo this afterward.'],
        actions: [{ label: 'Keep the old plan', value: false }, { label: 'Replace and clear chapters', value: true, danger: true }]
      }).then(function (ok) { if (ok) apply(); });
      return;
    }
    if (p.plan && !res.partial && hasChapters) res.partial = true; // same story re-pasted: keep chapters
    apply();
  };

  function samePlanStory(a, b) {
    return a.killer === b.killer && a.sleuth.name === b.sleuth.name && a.outline.length === b.outline.length;
  }

  App.pasteBatch = function (bi, text, isFix) {
    var p = App.state.project;
    App.ui.openBatch = bi; // keep this part open so its result stays visible
    if (!isFix) { p.batchText[bi] = text; }
    p.batchIssues = p.batchIssues || [];
    if (!text.trim()) { if (!isFix) p.batchIssues[bi] = null; App.save(); Cozy.sidebar.render(); return; }
    var res = B.importBatch(p, bi, text);
    var count = Object.keys(res.chapters || {}).length;
    if (!count && !res.epilogue) {
      p.batchIssues[bi] = res.issues;
      App.save(); Cozy.sidebar.render(); return;
    }
    App.commit(function (pp) {
      B.applyBatch(pp, res);
      pp.batchIssues = pp.batchIssues || [];
      pp.batchIssues[bi] = res.issues.filter(function (i) { return i.level !== 'error' || !i.n; });
      pp.downloaded = false;
    });
    if (App.state.batches[bi] && App.state.batches[bi].state !== 'fix') {
      D.toast(count + ' chapter' + (count === 1 ? '' : 's') + ' added. Building the puzzles…');
    }
  };

  // ---------- setup with protected fields ----------
  App.unlockProtected = function () {
    return D.confirm({
      title: 'Change the story setup?',
      body: ['The theme and the number of chapters shape the whole story. Changing them clears your story plan and every chapter you pasted.', 'Tip: use “Export project” first if you might want this version back.'],
      actions: [{ label: 'Keep my story', value: false }, { label: 'Export first', value: 'export' }, { label: 'Clear and change', value: true, danger: true }]
    }).then(function (v) {
      if (v === 'export') { App.exportProject(); return false; }
      if (!v) return false;
      App.commit(function (p) {
        p.plan = null; p.planDraft = null; p.planCheck = null; p.planText = ''; p.chosenTitle = '';
        p.chapters = {}; p.epilogue = null; p.batchText = []; p.batchIssues = [];
        p.cache = { puzzles: {}, final: null }; p.downloaded = false;
      });
      D.toast('Story cleared. You can change the setup now.');
      return true;
    });
  };

  // ---------- puzzles ----------
  App.reshuffle = function (n) {
    App.commit(function (p) {
      if (n === 'final') p.finalReshuffle = (p.finalReshuffle || 0) + 1;
      else p.reshuffle[n] = (p.reshuffle[n] || 0) + 1;
      p.downloaded = false;
    });
    D.toast(n === 'final' ? 'The final puzzle was reshuffled.' : 'Puzzle ' + n + ' was reshuffled.');
  };

  // ---------- project files ----------
  App.exportProject = function () {
    var p = App.state.project;
    var data = JSON.stringify({ app: 'cozy-mystery-word-search-book-maker', version: 1, project: p });
    var name = U.slugify(p.plan ? B.title(p) : 'my-cozy-mystery') + '.cozymystery';
    D.download(data, name, 'application/json');
    D.toast('Project file saved: ' + name);
  };

  App.importProjectFile = function (file) {
    var reader = new FileReader();
    reader.onload = function () {
      var obj = null;
      try { obj = JSON.parse(String(reader.result)); } catch (e) { obj = null; }
      var proj = obj && (obj.project || (obj.setup ? obj : null));
      if (!proj || !proj.setup) { D.toast('That file is not a project from this app.'); return; }
      confirmReplace('Open this project?', 'It replaces the book you are working on now.').then(function (ok) {
        if (!ok) return;
        replaceProject(B.upgrade(proj));
        D.toast('Project opened: ' + (proj.plan ? B.title(proj) : 'untitled'));
      });
    };
    reader.readAsText(file);
  };

  function hasWork() {
    var p = App.state.project;
    return !!(p.plan || p.planText || Object.keys(p.chapters).length);
  }

  function confirmReplace(title, line) {
    if (!hasWork()) return Promise.resolve(true);
    return D.confirm({
      title: title,
      body: [line, 'Your current book will be lost unless you export it first.'],
      actions: [{ label: 'Cancel', value: false }, { label: 'Export first', value: 'export' }, { label: 'Continue', value: true, danger: true }]
    }).then(function (v) {
      if (v === 'export') { App.exportProject(); return false; }
      return !!v;
    });
  }

  function replaceProject(p) {
    App.state.project = p;
    S.resetHistory();
    App.ui.step = p.uiStep || firstOpenStep();
    App.rebuild();
    App.save();
    Cozy.preview.goTo(1, true);
  }

  App.startOver = function () {
    D.confirm({
      title: 'Start over?',
      body: ['This clears your setup, story plan and chapters so you can begin a new book.', 'Export the project first if you want to keep it.'],
      actions: [{ label: 'Cancel', value: false }, { label: 'Export first', value: 'export' }, { label: 'Start over', value: true, danger: true }]
    }).then(function (v) {
      if (v === 'export') { App.exportProject(); return; }
      if (!v) return;
      var keepPen = App.state.project.setup.penName;
      var p = B.newProject();
      p.setup.penName = keepPen;
      replaceProject(p);
      App.ui.step = 'setup';
      Cozy.sidebar.render();
      D.toast('A fresh book is ready.');
    });
  };

  // Loads the bundled sample as the user's own project (to try the whole flow and the PDF).
  App.projectFromSample = function () {
    var s = root.COZY_SAMPLE;
    var p = B.newProject(s.seed);
    p.createdAt = '2026-10-04T12:00:00.000Z';
    Object.assign(p.setup, s.setup);
    var pr = B.importPlan(p, s.planText, null);
    B.applyPlan(p, pr.plan);
    p.planText = s.planText;
    p.planCheck = { issues: pr.issues, ok: true };
    s.batchText.forEach(function (txt, bi) {
      var r = B.importBatch(p, bi, txt);
      B.applyBatch(p, r);
      p.batchText[bi] = txt;
    });
    return p;
  };

  App.loadSample = function () {
    confirmReplace('Open the sample book?', 'The finished sample replaces the book you are working on, so you can try every step and download its PDF.').then(function (ok) {
      if (!ok) return;
      var p = App.projectFromSample();
      p.uiStep = 'review';
      replaceProject(p);
      D.toast('The sample book is open. Every step can be explored and the PDF downloaded.');
    });
  };

  // Next book in the same series: keeps the sleuth, home town and settings.
  App.nextInSeries = function () {
    var cur = App.state.project;
    D.confirm({
      title: 'Start the next book in this series?',
      body: ['The new book keeps your pen name, series, settings, sleuth and home town. Its story plan and chapters start fresh.', 'We will save a project file of this book first.'],
      actions: [{ label: 'Cancel', value: false }, { label: 'Save and start book ' + ((parseInt(cur.setup.bookNumber, 10) || 1) + 1), value: true, primary: true }]
    }).then(function (ok) {
      if (!ok) return;
      App.exportProject();
      var plan = cur.plan;
      var p = B.newProject();
      Object.keys(p.setup).forEach(function (k) { if (['bookTitle', 'isbn', 'year'].indexOf(k) === -1) p.setup[k] = cur.setup[k]; });
      p.setup.bookNumber = String((parseInt(cur.setup.bookNumber, 10) || 1) + 1);
      if (!p.setup.seriesName && plan) p.setup.seriesName = plan.sleuth.name.split(' ').slice(-1)[0] + ' Mysteries';
      var prev = (cur.seriesBible && cur.seriesBible.previous) || [];
      p.seriesBible = {
        sleuth: plan.sleuth, setting: plan.setting, cast: plan.cast || [],
        previous: prev.concat(['"' + B.title(cur) + '" (victim ' + plan.victim.name + ', killer ' + plan.killer + ')'])
      };
      if (!cur.setup.bookNumber) { p.setup.bookNumber = '2'; }
      replaceProject(p);
      App.ui.step = 'plan';
      Cozy.sidebar.render();
      D.toast('Book ' + p.setup.bookNumber + ' is ready. Copy the story plan prompt to begin.');
    });
  };

  // ---------- PDF ----------
  App.downloadPdf = function () {
    var st = App.state;
    if (!st.checklist || !st.checklist.ok || App.ui.pdf) return;
    var p = st.project;
    var title = B.title(p);
    App.ui.pdf = { progress: 0 };
    Cozy.sidebar.render();
    var t0 = Date.now();
    Cozy.pdf.build(st.book.pages, {
      title: title, author: p.setup.penName.trim(), subject: B.subtitle(p),
      keywords: p.plan && p.plan.keywords ? p.plan.keywords.join(', ') : '',
      createdAt: p.createdAt, fileId: U.hashHex(p.seed + '|pdf') + U.hashHex(p.seed + '|id')
    }, function (f) {
      App.ui.pdf = { progress: f };
      var bar = document.getElementById('pdfBar');
      if (bar) bar.style.width = Math.round(f * 100) + '%';
    }).then(function (buf) {
      var name = U.slugify(title) + '-interior-6x9.pdf';
      D.download(new Blob([buf], { type: 'application/pdf' }), name);
      App.ui.pdf = null;
      App.commit(function (pp) { pp.downloaded = true; pp.publishOpen = true; }, { undo: false });
      D.toast('Downloaded ' + name + ' (' + st.book.pages.length + ' pages, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
    }).catch(function (e) {
      App.ui.pdf = null;
      Cozy.sidebar.render();
      D.toast('The PDF could not be made: ' + (e && e.message ? e.message : 'unknown problem') + '. Please try again.');
      if (root.console) console.error(e);
    });
  };

  function firstOpenStep() {
    var s = App.steps();
    if (s.setup.state !== 'done') return 'setup';
    if (s.plan.state !== 'done') return 'plan';
    if (s.chapters.state !== 'done') return 'chapters';
    return 'review';
  }

  // ---------- boot ----------
  function bindGlobal() {
    document.getElementById('btnExport').addEventListener('click', App.exportProject);
    var fileInput = document.getElementById('fileImport');
    document.getElementById('btnImport').addEventListener('click', function () { fileInput.value = ''; fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) App.importProjectFile(fileInput.files[0]); });
    document.getElementById('btnStartOver').addEventListener('click', App.startOver);
    document.getElementById('btnSample').addEventListener('click', App.loadSample);
    document.getElementById('btnUndo').addEventListener('click', App.undo);
    document.getElementById('btnRedo').addEventListener('click', App.redo);
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing) {
        var k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); App.undo(); }
        else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); App.redo(); }
      }
    });
  }

  function boot() {
    App.state.project = B.newProject();
    bindGlobal();
    Cozy.preview.init();
    Cozy.editor.init();
    App.state.d = B.derive(App.state.project);
    App.state.batches = [];
    App.ui.step = App.state.project.uiStep || 'setup';
    App.rebuild();
    App.ui.step = App.state.project.uiStep || firstOpenStep();
    Cozy.sidebar.render();
    document.getElementById('app').setAttribute('aria-busy', 'false');
    document.getElementById('loading').hidden = true;
  }

  D.registerFonts().then(boot, boot);
})(window);
