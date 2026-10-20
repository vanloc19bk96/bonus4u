/*
 * The app: holds the project, rebuilds the case and the layout when something changes, and runs
 * the actions the sidebar offers. Every page load starts a new book; work is kept only in a
 * project file.
 */
(function (root) {
  'use strict';
  var LK = root.LK;
  var U = LK.util, dom = LK.dom;

  var state = {
    project: null,
    sample: null,            // the sample project while it is on screen
    created: false,          // the preview shows the book only once the user has created it
    user: { cs: null, book: null, check: null, cover: null },
    view: 'book',            // 'book' (the pages) or 'cover'
    touchedAuthor: false,
    downloading: false
  };

  // Nothing is stored in the browser, so a reload loses work the user has put in.
  function hasWork() {
    var p = state.project;
    return !!(p && (p.story || (p.setup.author || '').trim() || (p.setup.title || '').trim() || (p.setup.ideas || '').trim()));
  }

  // ---------- rebuilding ----------
  var busyEl;
  function rebuild() {
    var p = state.project;
    var cs = LK.book.getCase(p);
    if (!cs.ok) { dom.toast(cs.error); return false; }
    var book = LK.layout.layoutBook(p, cs);
    var cover = LK.cover.layout(p, cs, book);
    state.user = { cs: cs, book: book, check: LK.checklist.build(p, cs, book), cover: cover, coverIssues: LK.cover.audit(cover) };
    return true;
  }

  // Why the cover cannot be downloaded yet, or '' when it can.
  function coverBlock() {
    var p = state.project, u = state.user;
    if (!u.cover) return 'Create your book first.';
    if (!(p.setup.author || '').trim()) return 'Type your pen name in step 1 first.';
    if (!p.story || !p.story.blurb) return 'Add the story in step 2 first: the back cover uses its description.';
    if (!LK.book.title(p)) return 'Pick or type a title first.';
    if (u.coverIssues && u.coverIssues.length) return 'Fix the cover problem shown in the sidebar first.';
    return '';
  }

  function render() {
    if (state.sample) {
      var cs = LK.book.getCase(state.sample);
      var sbook = LK.layout.layoutBook(state.sample, cs);
      if (state.view === 'cover') LK.preview.showCover(LK.cover.layout(state.sample, cs, sbook));
      else LK.preview.update(sbook, 'sample');
      LK.book.getCase(state.project); // keep the user's case warm in the cache
    } else if (!state.created) {
      LK.preview.empty({ create: createBook, sample: showSample });
    } else if (state.view === 'cover' && state.user.cover) {
      LK.preview.showCover(state.user.cover);
    } else if (state.user.book) {
      LK.preview.update(state.user.book, 'user:' + state.project.seed);
    }
    var vb = document.getElementById('btnViewBook'), vc = document.getElementById('btnViewCover');
    vb.setAttribute('aria-pressed', String(state.view !== 'cover'));
    vc.setAttribute('aria-pressed', String(state.view === 'cover'));
    refreshUi();
  }

  function refreshUi() {
    LK.sidebar.refresh(sidebarState());
    refreshDownload();
  }

  // ---------- the download button in the toolbar: the book PDF with the pages, the cover PDF with the cover ----------
  function downloadBlock() {
    if (state.sample) return 'This is a sample book. It cannot be downloaded. Click “Back to my book” first.';
    if (!state.created) return 'Create your book first.';
    if (state.view === 'cover') return coverBlock();
    return state.user.check && state.user.check.canDownload ? '' : 'Fix the items marked “!” in step 3 first.';
  }
  function refreshDownload() {
    var btn = document.getElementById('btnDownload');
    var why = downloadBlock();
    btn.classList.toggle('is-busy', state.downloading);
    btn.setAttribute('aria-disabled', String(!!why || state.downloading));
    btn.title = why || (state.view === 'cover' ? 'One PDF file, ready to upload as your KDP paperback cover.' : 'One print-ready PDF file, ready to upload as your KDP manuscript.');
    if (!state.downloading) {
      btn.style.setProperty('--p', '0%');
      document.getElementById('btnDownloadLabel').textContent = state.view === 'cover' ? 'Download cover PDF' : 'Download PDF';
    }
  }
  function setProgress(f) {
    document.getElementById('btnDownload').style.setProperty('--p', Math.round(f * 100) + '%');
    document.getElementById('btnDownloadLabel').textContent = 'Building PDF… ' + Math.round(f * 100) + '%';
  }
  function onDownload() {
    if (state.downloading) return;
    var why = downloadBlock();
    if (why) {
      dom.toast(why);
      if (state.created && !state.sample && state.view !== 'cover') LK.sidebar.setOpen(4);
      return;
    }
    if (state.view === 'cover') downloadCover(); else downloadPdf();
  }

  function sidebarState() {
    return {
      view: state.view, cs: state.user.cs, book: state.user.book, check: state.user.check, touchedAuthor: state.touchedAuthor, downloading: state.downloading,
      cover: state.user.cover, coverIssues: state.user.coverIssues, coverBlock: state.project.sample ? 'This is the sample.' : coverBlock()
    };
  }

  function update() {
    busyEl.hidden = false;
    setTimeout(function () {
      try { rebuild(); render(); } catch (e) { console.error(e); dom.toast('Something went wrong while updating the book: ' + e.message); }
      busyEl.hidden = true;
    }, 20);
  }
  var updateSoon = dom.debounce(update, 300);

  function changed(typing) {
    if (typing) { updateSoon(); refreshUi(); } else { updateSoon.cancel(); update(); }
  }

  // ---------- actions ----------
  function createBook() {
    if (state.created) return;
    state.created = true;
    render();
  }

  function storyMatchesCase() {
    var st = state.project.story;
    return !!(st && st.caseKey === LK.book.caseKey(state.project));
  }

  function confirmCaseChange() {
    if (!storyMatchesCase()) return Promise.resolve(true);
    return dom.confirm({
      title: 'Build new clues?',
      body: ['This change builds a new register and new clues. Your story stays, but its clue notes will need a quick refresh: one short prompt in step 2.'],
      actions: [{ label: 'Cancel', value: false }, { label: 'Build new clues', value: true, primary: true }]
    });
  }

  function setSetup(key, value, opts) {
    opts = opts || {};
    var s = state.project.setup;
    if (s[key] === value) return;
    var apply = function () {
      s[key] = value;
      if (key === 'author') state.touchedAuthor = true;
      changed(opts.typing);
    };
    if (opts.affectsCase) {
      confirmCaseChange().then(function (ok) { if (ok) apply(); else refreshUi(); });
    } else apply();
  }

  // A new book type starts from that type's defaults. A story written for another type is removed.
  function setType(id) {
    var p = state.project;
    if (p.setup.type === id) return;
    var t = LK.types.get(id);
    var go = function () {
      LK.book.setType(p, id);
      p.story = null;
      LK.sidebar.showResult(null);
      changed(false);
      dom.toast(t.label + ': ' + t.blurb);
    };
    if (!p.story) { go(); return; }
    dom.confirm({
      title: 'Change the book type?',
      body: ['Your story was written for a ' + LK.book.type(p).label.toLowerCase() + ' book, so it will be removed. Your pen name, title and page choices stay.'],
      actions: [{ label: 'Cancel', value: false }, { label: 'Change to ' + t.short, value: true, primary: true }]
    }).then(function (ok) { if (ok) go(); });
  }

  function setCover(key, value, typing) {
    var c = state.project.setup.cover;
    if (c[key] === value) return;
    c[key] = value;
    if (state.created && state.view !== 'cover') state.view = 'cover';
    changed(typing);
  }

  function setView(v) {
    if (state.view === v) return;
    state.view = v;
    if (v === 'cover' && !state.created && !state.sample) state.created = true;
    render();
  }

  function downloadCover() {
    if (state.downloading) return;
    var p = state.project;
    rebuild();
    var why = coverBlock();
    if (p.sample || why) { render(); dom.toast(why || 'The sample cannot be downloaded.'); return; }
    state.downloading = true;
    refreshUi();
    document.getElementById('btnDownloadLabel').textContent = 'Building cover…';
    var meta = { title: LK.book.title(p), author: (p.setup.author || '').trim(), createdAt: p.createdAt, fileId: U.hashHex('cover:' + p.seed) + U.hashHex(LK.book.caseKey(p)) };
    setTimeout(function () {
      LK.pdf.buildCover(state.user.cover, meta).then(function (buf) {
        dom.download(new Blob([buf], { type: 'application/pdf' }), LK.book.fileName(p, '-cover.pdf'));
        dom.toast('Your cover PDF is downloading. Upload it to KDP as the paperback cover.');
      }).catch(function (e) {
        console.error(e);
        dom.toast('The cover could not be built: ' + e.message);
      }).then(function () {
        state.downloading = false;
        refreshUi();
      });
    }, 40);
  }

  function setPage(key, on) {
    var pages = state.project.setup.pages;
    if (pages[key] === on) return;
    pages[key] = on;
    changed(false);
  }

  function setDifficulty(v) {
    var s = state.project.setup;
    if (s.difficulty === v) return;
    confirmCaseChange().then(function (ok) {
      if (!ok) return;
      s.difficulty = v;
      s.clues = LK.clues.difficulty(s.type, v).clues;
      changed(false);
    });
  }

  function newCase() {
    confirmCaseChange().then(function (ok) {
      if (!ok) return;
      state.project.seed = U.randomSeed();
      changed(false);
      dom.toast('New case file ' + state.project.seed.toUpperCase() + ': a new archive, a new answer and new clues.');
    });
  }

  function applyPaste(text) {
    if (!String(text || '').trim()) return { ok: false, message: 'Paste the AI’s reply in the box first.' };
    var fields = LK.story.read(text);
    if (!fields) {
      return { ok: false, message: 'I could not find the story in that text. Copy the AI’s whole reply (it starts with { and ends with }) and paste it again.' };
    }
    var p = state.project, key = LK.book.caseKey(p);
    var full = ['prologue', 'letter', 'patrons', 'epilogue', 'clueNotes'].filter(function (k) { return fields[k] !== undefined; }).length >= 3;
    if (full || !p.story) {
      p.story = LK.story.merge(null, fields);
      p.story.caseKey = key;
    } else {
      p.story = LK.story.merge(p.story, fields);
      if (fields.clueNotes) p.story.caseKey = key;
    }
    if (state.sample) closeSample(true);
    state.created = true;
    rebuild(); render();
    var issues = LK.story.check(p.story, state.user.cs, p);
    var errs = issues.filter(function (i) { return i.level === 'error'; }).length;
    return { ok: true, issues: issues, message: full ? 'Story added. Read it in the preview, then open the Cover tab to design the cover.' : (errs ? '' : 'Fix applied. Everything checks out now.') };
  }

  function clearStory() {
    dom.confirm({
      title: 'Remove the story?',
      body: ['The prologue, letter, clue notes, interludes, suspects and epilogue are removed. Your settings and your puzzle stay.'],
      actions: [{ label: 'Cancel', value: false }, { label: 'Remove story', value: true, danger: true }]
    }).then(function (ok) {
      if (!ok) return;
      state.project.story = null;
      LK.sidebar.showResult(null);
      changed(false);
    });
  }

  function downloadPdf() {
    if (state.downloading) return;
    var p = state.project;
    if (!rebuild() || !state.user.check.canDownload) { render(); dom.toast('Fix the items marked “!” first.'); return; }
    state.downloading = true;
    refreshUi();
    setProgress(0);
    var st = p.story || {};
    var meta = {
      title: LK.book.title(p), author: (p.setup.author || '').trim(), subject: st.subtitle || '',
      keywords: (st.keywords || []).join(', '), createdAt: p.createdAt,
      fileId: U.hashHex(p.seed + LK.book.caseKey(p)) + U.hashHex('pdf:' + p.seed)
    };
    // let the progress bar paint before the heavy work starts
    setTimeout(function () {
      LK.pdf.build(state.user.book, meta, setProgress).then(function (buf) {
        dom.download(new Blob([buf], { type: 'application/pdf' }), LK.book.fileName(p, '-interior.pdf'));
        dom.toast('Your PDF is downloading. Upload it to KDP as the paperback manuscript.');
      }).catch(function (e) {
        console.error(e);
        dom.toast('The PDF could not be built: ' + e.message);
      }).then(function () {
        state.downloading = false;
        refreshUi();
      });
    }, 40);
  }

  function exportProject() {
    var data = JSON.stringify({ app: 'murder-archive-studio', version: 2, project: state.project }, null, 1);
    dom.download(new Blob([data], { type: 'application/json' }), LK.book.fileName(state.project, '.murder-archive.json'));
    dom.toast('Project file saved. Open it later with “Open project file”.');
  }

  function importProject(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var p = null;
      try {
        var o = JSON.parse(String(reader.result));
        p = LK.book.upgrade(o && o.project ? o.project : o);
      } catch (e) { p = null; }
      if (!p || p.sample) { dom.toast('That file is not a project from this app.'); return; }
      var go = function () {
        state.project = p;
        state.created = true;
        state.touchedAuthor = false;
        if (state.sample) closeSample(true);
        LK.sidebar.showResult(null);
        changed(false);
        dom.toast('Project opened.');
      };
      if (state.project.story || (state.project.setup.author || '').trim()) {
        dom.confirm({
          title: 'Open this project?',
          body: ['The book you have open now will be replaced. Save it first with “Save project file” if you want to keep it.'],
          actions: [{ label: 'Cancel', value: false }, { label: 'Open project', value: true, primary: true }]
        }).then(function (ok) { if (ok) go(); });
      } else go();
    };
    reader.readAsText(file);
  }

  function startOver() {
    dom.confirm({
      title: 'Start a new book?',
      body: ['Your current settings and story are cleared, and a brand-new case file is made. Save a project file first if you want to keep this book.'],
      actions: [{ label: 'Cancel', value: false }, { label: 'Start over', value: true, danger: true }]
    }).then(function (ok) {
      if (!ok) return;
      state.project = LK.book.newProject();
      state.created = false;
      state.view = 'book';
      state.touchedAuthor = false;
      if (state.sample) closeSample(true);
      LK.sidebar.showResult(null);
      LK.sidebar.setOpen(1);
      changed(false);
    });
  }

  // The sample for the book type on screen, or the first one there is.
  function showSample(id) {
    var ids = LK.book.sampleIds();
    if (!id || ids.indexOf(id) === -1) id = ids.indexOf(state.project.setup.type) !== -1 ? state.project.setup.type : ids[0];
    state.sample = LK.book.sampleProject(id);
    document.getElementById('samplePick').value = id;
    document.getElementById('sampleBanner').hidden = false;
    document.getElementById('btnSample').textContent = 'Back to my book';
    update();
  }

  function closeSample(quiet) {
    state.sample = null;
    document.getElementById('sampleBanner').hidden = true;
    document.getElementById('btnSample').textContent = 'See a finished sample';
    if (!quiet) update();
  }

  // ---------- start ----------
  var api = {
    project: function () { return state.project; },
    caseNow: function () { return LK.book.getCase(state.project); },
    createBook: createBook, setSetup: setSetup, setType: setType, setPage: setPage, setCover: setCover, setView: setView, downloadCover: downloadCover, setDifficulty: setDifficulty, newCase: newCase, applyPaste: applyPaste,
    clearStory: clearStory, downloadPdf: downloadPdf, refresh: function () { refreshUi(); }
  };
  LK.app = api;

  function start() {
    busyEl = document.getElementById('busy');
    state.project = LK.book.newProject();
    LK.preview.init();
    LK.sidebar.init(api);
    document.getElementById('btnSample').addEventListener('click', function () { if (state.sample) closeSample(); else showSample(); });
    var pick = document.getElementById('samplePick');
    LK.book.sampleIds().forEach(function (id) { pick.appendChild(dom.h('option', { value: id }, LK.SAMPLES[id].label)); });
    pick.addEventListener('change', function () { showSample(pick.value); });
    document.getElementById('btnCloseSample').addEventListener('click', function () { closeSample(); });
    document.getElementById('btnExport').addEventListener('click', exportProject);
    var fi = document.getElementById('fileImport');
    document.getElementById('btnImport').addEventListener('click', function () { fi.value = ''; fi.click(); });
    fi.addEventListener('change', function () { if (fi.files && fi.files[0]) importProject(fi.files[0]); });
    document.getElementById('btnStartOver').addEventListener('click', startOver);
    document.getElementById('btnViewBook').addEventListener('click', function () { setView('book'); });
    document.getElementById('btnViewCover').addEventListener('click', function () { setView('cover'); });
    document.getElementById('btnDownload').addEventListener('click', onDownload);
    try { rebuild(); render(); } catch (e) { console.error(e); dom.toast('Something went wrong: ' + e.message); }
    root.addEventListener('beforeunload', function (e) {
      if (!hasWork()) return;
      e.preventDefault();
      e.returnValue = '';
    });
    document.getElementById('loading').hidden = true;
    document.getElementById('app').setAttribute('aria-busy', 'false');
  }

  function boot() {
    if (!root.LK_FONT_DATA || !(root.jspdf && root.jspdf.jsPDF)) {
      document.getElementById('loading').textContent = 'Some app files are missing. Unzip the whole folder and open index.html again.';
      return;
    }
    // fonts first, so the preview measures and draws with the book's real typefaces
    dom.registerFonts().then(start, start);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
