/* Book preview: two-page spreads drawn as SVG, true to scale, rendered lazily as they scroll into view. */
(function (root) {
  'use strict';
  var Cozy = root.Cozy;
  var h = Cozy.dom.h;

  var els = {};
  var spreads = [];      // [{ left: pageIndex|null, right: pageIndex|null, el, dirty }]
  var pages = [];
  var signature = '';
  var zoom = 1;          // multiplier on top of "fit"
  var fitPx = 360;       // page width in CSS px that fits the window
  var observer = null;
  var visible = {};
  var current = 0;
  var isSample = false;

  function init() {
    els.wrap = document.getElementById('spreads');
    els.nav = document.getElementById('navSelect');
    els.ind = document.getElementById('pageIndicator');
    els.zoom = document.getElementById('btnZoomFit');
    els.banner = document.getElementById('sampleBanner');
    els.toolbar = document.querySelector('.viewer .toolbar');
    document.getElementById('btnPrev').addEventListener('click', function () { step(-1); });
    document.getElementById('btnNext').addEventListener('click', function () { step(1); });
    document.getElementById('btnZoomIn').addEventListener('click', function () { setZoom(zoom * 1.2); });
    document.getElementById('btnZoomOut').addEventListener('click', function () { setZoom(zoom / 1.2); });
    els.zoom.addEventListener('click', function () { setZoom(1); });
    var tm = document.getElementById('tglMargins'), ta = document.getElementById('tglAnswers');
    tm.addEventListener('change', function () { Cozy.app.ui.margins = tm.checked; markAllDirty(); });
    ta.addEventListener('change', function () { Cozy.app.ui.answers = ta.checked; markAllDirty(); });
    els.nav.addEventListener('change', function () { goTo(parseInt(els.nav.value, 10)); });
    els.wrap.addEventListener('scroll', onScroll, { passive: true });
    els.wrap.addEventListener('keydown', function (e) {
      if (e.target !== els.wrap) return;
      if (e.key === 'PageDown' || e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'PageUp' || e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(zoom * 1.2); }
      else if (e.key === '-') { e.preventDefault(); setZoom(zoom / 1.2); }
      else if (e.key === 'Home') { e.preventDefault(); goTo(1); }
      else if (e.key === 'End') { e.preventDefault(); goTo(pages.length); }
    });
    root.addEventListener('resize', Cozy.dom.debounce(function () { computeFit(); applySize(); }, 120));
    if ('IntersectionObserver' in root) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var i = +en.target.getAttribute('data-i');
          visible[i] = en.isIntersecting;
          if (en.isIntersecting) renderSpread(i);
        });
      }, { root: els.wrap, rootMargin: '600px 0px' });
    }
    computeFit();
  }

  function computeFit() {
    var w = els.wrap.clientWidth - 48, hgt = els.wrap.clientHeight - 64;
    var byW = (w - 20) / 2, byH = hgt / 1.5; // 20px = gap between the two pages
    fitPx = Math.max(180, Math.floor(Math.min(byW, byH)));
  }

  function applySize() {
    var px = Math.round(fitPx * zoom);
    els.wrap.style.setProperty('--pw', px + 'px');
    // 100% means true print size: 432 pt = 6 in = 576 CSS px
    els.zoom.textContent = Math.round(px / 576 * 100) + '%';
    els.zoom.title = 'Fit to window (now ' + Math.round(px / 576 * 100) + '% of print size)';
  }

  function setZoom(z) {
    var keep = current;
    zoom = Math.max(0.4, Math.min(4, z));
    applySize();
    scrollToSpread(keep);
  }

  function buildSpreads(n) {
    spreads = [];
    spreads.push({ left: null, right: 0 });
    for (var i = 1; i < n; i += 2) spreads.push({ left: i, right: i + 1 < n ? i + 1 : null });
    els.wrap.innerHTML = '';
    visible = {};
    spreads.forEach(function (sp, si) {
      var inner = h('div', { class: 'spread-inner' });
      var el = h('div', { class: 'spread', 'data-i': si }, inner);
      sp.el = el; sp.inner = inner; sp.dirty = true;
      [sp.left, sp.right].forEach(function (pi, side) {
        var cls = 'page ' + (side === 0 ? 'left' : 'right') + (pi == null ? ' blank' : '');
        var pe = h('div', { class: cls });
        inner.appendChild(pe);
        if (side === 0) sp.leftEl = pe; else sp.rightEl = pe;
      });
      els.wrap.appendChild(el);
      if (observer) observer.observe(el);
    });
  }

  function markAllDirty() {
    spreads.forEach(function (sp, i) { sp.dirty = true; if (visible[i] || !observer) renderSpread(i); });
  }

  function renderSpread(i) {
    var sp = spreads[i];
    if (!sp || !sp.dirty) return;
    sp.dirty = false;
    [[sp.left, sp.leftEl], [sp.right, sp.rightEl]].forEach(function (pair) {
      if (pair[0] == null) return;
      renderPage(pages[pair[0]], pair[1]);
    });
  }

  function renderPage(page, el) {
    var ui = Cozy.app.ui;
    el.innerHTML = Cozy.svg.render(page, { margins: ui.margins, answers: ui.answers });
    el.setAttribute('data-page', page.num);
    el.classList.toggle('has-problem', !!page.meta.problem && !isSample);
    el.classList.remove('clickable');
    el.onclick = null;
    if (isSample) el.appendChild(h('span', { class: 'page-badge' }, 'Sample'));
    if (ui.answers && page.meta.hiddenDisplay) el.appendChild(h('span', { class: 'page-badge clue' }, 'Hidden clue: ' + page.meta.hiddenDisplay));
    if (page.meta.problem && !isSample) el.appendChild(h('div', { class: 'page-problem' }, page.meta.problem));
    if (isSample) return;
    var tools = h('div', { class: 'page-tools' });
    var A = Cozy.app;
    if (page.meta.chapter && A.state.project.chapters[page.meta.chapter]) {
      el.classList.add('clickable');
      el.onclick = function (e) { if (e.target.closest('.page-tools')) return; Cozy.editor.open(page.meta.chapter); };
      tools.appendChild(h('button', { type: 'button', onclick: function () { Cozy.editor.open(page.meta.chapter); } }, 'Edit chapter ' + page.meta.chapter));
    }
    if (page.meta.epilogue && A.state.project.epilogue) {
      el.classList.add('clickable');
      el.onclick = function (e) { if (e.target.closest('.page-tools')) return; Cozy.editor.open('epilogue'); };
      tools.appendChild(h('button', { type: 'button', onclick: function () { Cozy.editor.open('epilogue'); } }, 'Edit epilogue'));
    }
    if (typeof page.meta.puzzle === 'number' && A.state.project.chapters[page.meta.puzzle]) {
      var n = page.meta.puzzle;
      tools.appendChild(h('button', { type: 'button', onclick: function () { Cozy.editor.open(n, 'words'); } }, 'Edit words'));
      if (page.meta.grid) tools.appendChild(h('button', { type: 'button', onclick: function () { A.reshuffle(n); } }, 'Reshuffle'));
    }
    if (page.meta.puzzle === 'final' && page.meta.grid) {
      tools.appendChild(h('button', { type: 'button', onclick: function () { A.reshuffle('final'); } }, 'Reshuffle'));
    }
    if (tools.childNodes.length) el.appendChild(tools);
  }

  function navOptions(d) {
    var opts = [{ v: 1, t: 'Front matter' }];
    for (var n = 1; n <= d.N; n++) {
      var ch = (Cozy.app.view().state.project.chapters || {})[n];
      opts.push({ v: d.pages.chapter(n), t: 'Chapter ' + n + (ch && ch.title ? ': ' + ch.title : '') });
    }
    opts.push({ v: d.pages.notebook, t: 'Detective’s Notebook' });
    opts.push({ v: d.pages.final, t: 'Final Reveal' });
    opts.push({ v: d.pages.epilogue, t: 'Epilogue' });
    opts.push({ v: d.pages.solutionsStart, t: 'Solutions' });
    opts.push({ v: d.pages.closing, t: 'Closing page' });
    return opts;
  }

  // Before a story plan exists the preview shows one placeholder instead of a book of empty pages.
  function showEmpty() {
    els.toolbar.hidden = true;
    els.banner.hidden = true;
    if (signature === 'empty') return;
    signature = 'empty';
    spreads = []; pages = []; visible = {}; current = 0;
    if (observer) observer.disconnect();
    els.wrap.innerHTML = '';
    els.wrap.appendChild(h('div', { class: 'preview-empty' }, [
      h('h2', null, 'Your book will appear here'),
      h('p', null, 'Follow the steps in the sidebar. The pages fill in as you go.'),
      h('ol', null, [
        h('li', null, 'Setup: type your pen name and pick a theme.'),
        h('li', null, 'Story plan: copy the prompt, paste it into an AI chat, then paste the reply back.'),
        h('li', null, 'Chapters: do the same for each part. The puzzles are built after every paste.'),
        h('li', null, 'Review and download your print-ready PDF.')
      ])
    ]));
  }

  function update() {
    var view = Cozy.app.view();
    var st = view.state;
    if (!view.sample && !Cozy.app.state.project.plan) { showEmpty(); return; }
    if (!st || !st.book) return;
    els.toolbar.hidden = false;
    var wasSample = isSample;
    isSample = view.sample;
    els.banner.hidden = !isSample;
    pages = st.book.pages;
    var sig = (isSample ? 's' : 'u') + pages.length;
    if (sig !== signature) {
      signature = sig;
      buildSpreads(pages.length);
      applySize();
      if (wasSample !== isSample) { current = 0; els.wrap.scrollTop = 0; }
    }
    // navigator
    var opts = navOptions(st.d);
    els.nav.innerHTML = '';
    opts.forEach(function (o) { els.nav.appendChild(h('option', { value: o.v }, o.t)); });
    markAllDirty();
    updateIndicator();
  }

  function spreadOfPage(num) { return num <= 1 ? 0 : Math.floor(num / 2); }

  function scrollToSpread(si) {
    var sp = spreads[si];
    if (!sp) return;
    current = si;
    els.wrap.scrollTop = sp.el.offsetTop - 16;
    renderSpread(si);
    updateIndicator();
  }

  function goTo(num, instant) {
    var si = spreadOfPage(num);
    scrollToSpread(si);
    var sp = spreads[si];
    if (!sp) return;
    var el = (sp.left != null && pages[sp.left].num === num) ? sp.leftEl : sp.rightEl;
    if (el && !instant) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }

  function step(dir) { scrollToSpread(Math.max(0, Math.min(spreads.length - 1, current + dir))); }

  function onScroll() {
    var top = els.wrap.scrollTop + 40;
    var best = 0;
    for (var i = 0; i < spreads.length; i++) { if (spreads[i].el.offsetTop <= top) best = i; else break; }
    if (best !== current) { current = best; updateIndicator(); }
  }

  function updateIndicator() {
    var sp = spreads[current];
    if (!sp) return;
    var nums = [sp.left, sp.right].filter(function (x) { return x != null; }).map(function (x) { return pages[x].num; });
    els.ind.textContent = (nums.length > 1 ? 'Pages ' + nums.join('–') : 'Page ' + nums[0]) + ' of ' + pages.length;
    // keep the navigator on the nearest section at or before this page
    var val = null;
    Array.prototype.forEach.call(els.nav.options, function (o) { if (+o.value <= nums[nums.length - 1]) val = o.value; });
    if (val != null && document.activeElement !== els.nav) els.nav.value = val;
  }

  Cozy.preview = { init: init, update: update, goTo: goTo };
})(window);
