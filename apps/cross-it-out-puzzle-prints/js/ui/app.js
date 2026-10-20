/*
 * The app: holds the project, rebuilds the puzzles, the pages and the cover when something
 * changes, and runs the actions the sidebar offers. Nothing is stored in the browser; work is
 * kept in a project file.
 */
(function (root) {
  'use strict';
  var CX = root.CX;
  var U = CX.util, dom = CX.dom;

  var state = {
    project: null,
    user: { built: null, book: null, check: null, cover: null, coverIssues: [] },
    view: 'book',             // 'book' (the pages) or 'cover'
    touchedAuthor: false,
    downloading: false,
    audit: { built: null, done: {} }  // the book the fact-check prompts were copied from, and the parts pasted back
  };

  function hasWork() {
    var p = state.project;
    return !!(p && (p.packs.length || (p.setup.author || '').trim() || Object.keys(p.tweaks).length));
  }

  // ---------- rebuilding ----------
  var busyEl;
  function rebuild() {
    var p = state.project;
    var built = CX.book.build(p);
    var book = CX.layout.layoutBook(p, built);
    var cover = CX.cover.layout(p, built, book);
    state.user = { built: built, book: book, check: CX.checklist.build(p, built, book), cover: cover, coverIssues: CX.cover.audit(cover) };
  }

  function coverBlock() {
    var p = state.project, u = state.user;
    if (!u.cover) return 'The cover is not ready yet.';
    if (!(p.setup.author || '').trim()) return 'Type your pen name in step 1 first.';
    if (!(p.setup.title || '').trim()) return 'Type a title in step 1 first.';
    if (u.coverIssues.length) return 'Fix the cover problem shown in the sidebar first.';
    return '';
  }

  // Whether the book has at least one case from the user's own packs (starter packs alone are only filler).
  function hasOwnPuzzles() {
    var b = state.user.built;
    return !!b && b.all.some(function (pz) { return pz.pack.source !== 'starter'; });
  }

  function render() {
    if (!hasOwnPuzzles()) CX.preview.showEmpty(function () { CX.sidebar.setOpen(1); });
    else if (state.view === 'cover' && state.user.cover) CX.preview.showCover(state.user.cover);
    else if (state.user.book) CX.preview.update(state.user.book, 'user:' + state.project.seed);
    document.getElementById('btnViewBook').setAttribute('aria-pressed', String(state.view !== 'cover'));
    document.getElementById('btnViewCover').setAttribute('aria-pressed', String(state.view === 'cover'));
    refreshUi();
  }

  function refreshUi() {
    CX.sidebar.refresh(sidebarState());
    refreshDownload();
  }

  function sidebarState() {
    var u = state.user;
    return {
      view: state.view, built: u.built, book: u.book, check: u.check, cover: u.cover, coverIssues: u.coverIssues,
      coverBlock: coverBlock(), touchedAuthor: state.touchedAuthor, downloading: state.downloading, audit: state.audit
    };
  }

  // ---------- the download button: the interior with the pages, the cover with the cover ----------
  function downloadBlock() {
    if (state.view === 'cover') return coverBlock();
    return state.user.check && state.user.check.canDownload ? '' : 'Fix the items marked “!” in step 4 first.';
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
      if (state.view !== 'cover') CX.sidebar.setOpen(4);
      return;
    }
    if (state.view === 'cover') downloadCover(); else downloadPdf();
  }

  function update() {
    busyEl.hidden = false;
    setTimeout(function () {
      try { rebuild(); render(); } catch (e) { console.error(e); dom.toast('Something went wrong while updating the book: ' + e.message); }
      busyEl.hidden = true;
    }, 20);
  }
  var updateSoon = dom.debounce(update, 350);

  function changed(typing) {
    if (typing) { updateSoon(); refreshUi(); } else { updateSoon.cancel(); update(); }
  }

  // ---------- settings ----------
  function setSetup(key, value, opts) {
    var s = state.project.setup;
    if (s[key] === value) return;
    s[key] = value;
    if (key === 'author') state.touchedAuthor = true;
    changed(opts && opts.typing);
  }

  function setCount(level, n) {
    var c = state.project.setup.counts;
    n = U.clamp(parseInt(n, 10) || 0, 0, 300);
    if (c[level] === n) return;
    c[level] = n;
    changed(false);
  }

  function setPage(key, value) {
    var pages = state.project.setup.pages;
    if (pages[key] === value) return;
    pages[key] = value;
    changed(false);
  }

  function setCover(key, value, typing) {
    var c = state.project.setup.cover;
    if (c[key] === value) return;
    c[key] = value;
    if (state.view !== 'cover') state.view = 'cover';
    changed(typing);
  }

  function setView(v) {
    if (state.view === v) return;
    state.view = v;
    render();
  }

  // A new shuffle: new line-ups, answers and clues for every case.
  function reshuffle() {
    var p = state.project;
    var go = function () {
      p.seed = U.randomSeed();
      p.tweaks = Object.keys(p.tweaks).reduce(function (o, k) { if (p.tweaks[k].off) o[k] = { off: true }; return o; }, {});
      changed(false);
      dom.toast('New puzzle set ' + p.seed.toUpperCase() + ': new line-ups, answers and clues for every case.');
    };
    if (!Object.keys(p.tweaks).some(function (k) { return p.tweaks[k].v; })) { go(); return; }
    dom.confirm({
      title: 'Shuffle every puzzle?',
      body: ['Every case gets a new line-up, answer and clues, including the ones you re-rolled one by one. Removed cases stay removed.'],
      actions: [{ label: 'Cancel', value: false }, { label: 'Shuffle all', value: true, primary: true }]
    }).then(function (ok) { if (ok) go(); });
  }

  // ---------- packs ----------
  /*
   * Adds the packs in a pasted AI reply. Returns { ok, message, result } for the sidebar.
   */
  function addPacks(text) {
    if (!String(text || '').trim()) return { ok: false, message: 'Paste the AI’s reply in the box first.' };
    var res = CX.packs.read(text);
    if (!res.found) {
      return { ok: false, result: res, message: 'I could not find any puzzle packs in that text. Copy the AI’s whole reply (it starts with { and ends with }) and paste it again.' };
    }
    var p = state.project, have = {}, added = 0, dupes = 0;
    p.packs.forEach(function (pk) { have[pk.id] = 1; });
    res.packs.forEach(function (pk) {
      if (have[pk.id]) { dupes++; return; }
      have[pk.id] = 1;
      p.packs.push(pk);
      added++;
    });
    if (added) changed(false);
    var msg = added ? 'Added ' + U.plural(added, 'pack') + ' (' + U.plural(added * 2, 'case') + ').' : 'No new packs were added.';
    if (dupes) msg += ' ' + U.plural(dupes, 'pack') + ' you already had ' + (dupes === 1 ? 'was' : 'were') + ' skipped.';
    return { ok: added > 0, message: msg, result: res };
  }

  function togglePack(id) {
    var pk = state.project.packs.filter(function (x) { return x.id === id; })[0];
    if (!pk) return;
    pk.off = !pk.off;
    changed(false);
  }

  function removePack(id) {
    var p = state.project, pk = p.packs.filter(function (x) { return x.id === id; })[0];
    if (!pk) return;
    dom.confirm({
      title: 'Remove this pack?',
      body: ['“' + pk.topic + '” and its two cases leave the book. To keep it for later, untick it instead.'],
      actions: [{ label: 'Cancel', value: false }, { label: 'Remove pack', value: true, danger: true }]
    }).then(function (ok) {
      if (!ok) return;
      p.packs = p.packs.filter(function (x) { return x !== pk; });
      changed(false);
    });
  }

  // ---------- cases ----------
  function caseNewClues(key) {
    var tw = state.project.tweaks[key] = state.project.tweaks[key] || {};
    tw.v = (tw.v || 0) + 1;
    changed(false);
  }
  function caseRemove(key) {
    var tw = state.project.tweaks[key] = state.project.tweaks[key] || {};
    tw.off = true;
    changed(false);
  }
  function restoreCases() {
    var t = state.project.tweaks;
    Object.keys(t).forEach(function (k) { delete t[k].off; if (!Object.keys(t[k]).length) delete t[k]; });
    changed(false);
  }

  // ---------- fact-check ----------
  function auditPrompt(part) {
    if (!state.audit.built || state.audit.built !== state.user.built) state.audit = { built: state.user.built, done: {} };
    return CX.prompts.auditPrompt(state.project, state.audit.built, part).text;
  }

  function applyAudit(text, part) {
    var r = CX.prompts.readAudit(text);
    if (!r.ok) return { ok: false, message: 'I could not find the fact-check result in that text. Copy the AI’s whole reply and paste it again.' };
    var built = state.audit.built || state.user.built;
    var res = CX.book.applyFactIssues(state.project, built, r.issues);
    state.audit.done[part] = true;
    var parts = CX.prompts.auditPrompt(state.project, built, 0).parts;
    var all = true;
    for (var i = 0; i < parts; i++) if (!state.audit.done[i]) all = false;
    rebuild();
    if (all) {
      state.project.factCheck = { sig: CX.checklist.factSig(state.user.built) };
      state.audit = { built: null, done: {} };
      rebuild();
    }
    render();
    var msg = !r.issues.length ? 'The AI found no problems' + (parts > 1 ? ' in part ' + (part + 1) : '') + '.'
      : U.plural(res.applied, 'correction') + ' applied. The cases they touched now have new clues.';
    if (res.skipped.length) msg += ' ' + U.plural(res.skipped.length, 'note') + ' could not be matched: ' + res.skipped.slice(0, 2).join(' ');
    if (!all) msg += ' Now copy part ' + (nextPart(parts) + 1) + '.';
    else msg += ' Fact-check complete.';
    return { ok: true, message: msg };
  }
  function nextPart(parts) { for (var i = 0; i < parts; i++) if (!state.audit.done[i]) return i; return 0; }

  // ---------- downloads ----------
  function downloadPdf() {
    if (state.downloading) return;
    var p = state.project;
    rebuild();
    if (!state.user.check.canDownload) { render(); dom.toast('Fix the items marked “!” first.'); return; }
    state.downloading = true;
    refreshUi();
    setProgress(0);
    var meta = { fileId: U.hashHex(p.seed + '|' + p.createdAt) + U.hashHex('pdf:' + p.seed + JSON.stringify(p.setup.counts)) };
    setTimeout(function () {
      CX.pdf.build(state.user.book, meta, setProgress).then(function (buf) {
        dom.download(new Blob([buf], { type: 'application/pdf' }), CX.book.fileName(p, '-interior-{trim}.pdf'));
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

  function downloadCover() {
    if (state.downloading) return;
    var p = state.project;
    rebuild();
    var why = coverBlock();
    if (why) { render(); dom.toast(why); return; }
    state.downloading = true;
    refreshUi();
    document.getElementById('btnDownloadLabel').textContent = 'Building cover…';
    var meta = { fileId: U.hashHex('cover:' + p.seed) + U.hashHex(p.createdAt + state.user.book.pageCount) };
    setTimeout(function () {
      CX.pdf.buildCover(state.user.cover, meta).then(function (buf) {
        dom.download(new Blob([buf], { type: 'application/pdf' }), CX.book.fileName(p, '-cover-{trim}.pdf'));
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

  // ---------- project files ----------
  function exportProject() {
    var data = JSON.stringify({ app: 'cross-it-out-puzzle-prints', version: CX.book.VERSION, project: CX.book.toSave(state.project) }, null, 1);
    dom.download(new Blob([data], { type: 'application/json' }), CX.book.fileName(state.project, '.cross-it-out.json'));
    dom.toast('Project file saved. Open it later with “Open project file”.');
  }

  function importProject(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var p = null;
      try {
        var o = JSON.parse(String(reader.result));
        p = CX.book.upgrade(o && o.project ? o.project : o);
      } catch (e) { p = null; }
      if (!p) { dom.toast('That file is not a project from this app.'); return; }
      var go = function () {
        state.project = p;
        state.touchedAuthor = false;
        state.audit = { built: null, done: {} };
        CX.sidebar.reset();
        changed(false);
        dom.toast('Project opened: ' + U.plural(p.packs.length, 'pack') + ' of your own.');
      };
      if (hasWork()) {
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
      body: ['Your settings, your puzzle packs and your case changes are cleared. Save a project file first if you want to keep this book.'],
      actions: [{ label: 'Cancel', value: false }, { label: 'Start over', value: true, danger: true }]
    }).then(function (ok) {
      if (!ok) return;
      state.project = CX.book.newProject();
      state.view = 'book';
      state.touchedAuthor = false;
      state.audit = { built: null, done: {} };
      CX.sidebar.reset();
      CX.sidebar.setOpen(1);
      changed(false);
    });
  }

  // ---------- start ----------
  var api = {
    project: function () { return state.project; },
    built: function () { return state.user.built; },
    book: function () { return state.user.book; },
    setSetup: setSetup, setCount: setCount, setPage: setPage, setCover: setCover, setView: setView, reshuffle: reshuffle,
    addPacks: addPacks, togglePack: togglePack, removePack: removePack,
    caseNewClues: caseNewClues, caseRemove: caseRemove, restoreCases: restoreCases,
    auditPrompt: auditPrompt, applyAudit: applyAudit,
    goToCase: function (no) { var b = state.user.book; if (state.view !== 'book') setView('book'); if (b && b.casePage[no]) CX.preview.goTo(b.casePage[no]); },
    refresh: function () { refreshUi(); }
  };
  CX.app = api;

  function start() {
    busyEl = document.getElementById('busy');
    state.project = CX.book.newProject();
    CX.preview.init();
    CX.sidebar.init(api);
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
    if (!root.CX_FONT_DATA || !(root.jspdf && root.jspdf.jsPDF)) {
      document.getElementById('loading').textContent = 'Some app files are missing. Unzip the whole folder and open index.html again.';
      return;
    }
    dom.registerFonts().then(start, start);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
