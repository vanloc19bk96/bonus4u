/* Book preview: two-page spreads drawn as SVG, true to scale, rendered lazily as they scroll into view. */
(function (root) {
  'use strict';
  var LK = root.LK;
  var h = LK.dom.h;

  var els = {};
  var spreads = [];      // [{ left: pageIndex|null, right: pageIndex|null, el, dirty }]
  var pages = [];
  var signature = '';
  var ratio = 1.5;       // page height / width
  var widthPt = 432;
  var zoom = 1;          // multiplier on top of "fit"
  var fitPx = 360;
  var observer = null;
  var visible = {};
  var current = 0;
  var opts = { margins: false, killer: false };
  var lastCover = null;    // the cover on screen, while the cover view is open

  function init() {
    els.wrap = document.getElementById('spreads');
    els.nav = document.getElementById('navSelect');
    els.ind = document.getElementById('pageIndicator');
    els.zoom = document.getElementById('btnZoomFit');
    document.getElementById('btnPrev').addEventListener('click', function () { step(-1); });
    document.getElementById('btnNext').addEventListener('click', function () { step(1); });
    document.getElementById('btnZoomIn').addEventListener('click', function () { setZoom(zoom * 1.2); });
    document.getElementById('btnZoomOut').addEventListener('click', function () { setZoom(zoom / 1.2); });
    els.zoom.addEventListener('click', function () { setZoom(1); });
    var tm = document.getElementById('tglMargins'), tk = document.getElementById('tglKiller');
    tm.addEventListener('change', function () { opts.margins = tm.checked; if (lastCover) showCover(lastCover); else markAllDirty(); });
    tk.addEventListener('change', function () {
      opts.killer = tk.checked; markAllDirty();
      if (tk.checked) { var pg = pages.filter(function (p) { return p.meta.killerRow; })[0]; if (pg) goTo(pg.num); }
    });
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
    root.addEventListener('resize', LK.dom.debounce(function () { computeFit(); applySize(); }, 120));
    if ('IntersectionObserver' in root) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var i = +en.target.getAttribute('data-i');
          visible[i] = en.isIntersecting;
          if (en.isIntersecting) renderSpread(i);
        });
      }, { root: els.wrap, rootMargin: '800px 0px' });
    }
    computeFit();
  }

  function computeFit() {
    var w = els.wrap.clientWidth - 48, hgt = els.wrap.clientHeight - 56;
    var byW = (w - 20) / 2, byH = hgt / ratio;
    fitPx = Math.max(180, Math.floor(Math.min(byW, byH)));
  }

  function applySize() {
    var px = Math.round(fitPx * zoom);
    els.wrap.style.setProperty('--pw', px + 'px');
    els.wrap.style.setProperty('--ratio', ratio);
    // 100% means true print size: 72 pt = 1 in = 96 CSS px
    var pct = Math.round(px / (widthPt / 72 * 96) * 100);
    els.zoom.textContent = pct + '%';
    els.zoom.title = 'Fit to window (now ' + pct + '% of print size)';
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
    if (observer) observer.disconnect();
    spreads.forEach(function (sp, si) {
      var inner = h('div', { class: 'spread-inner' });
      var el = h('div', { class: 'spread', 'data-i': si }, inner);
      sp.el = el; sp.dirty = true;
      [sp.left, sp.right].forEach(function (pi, side) {
        var pe = h('div', { class: 'page ' + (side === 0 ? 'left' : 'right') + (pi == null ? ' blank' : '') });
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
      var page = pages[pair[0]];
      pair[1].innerHTML = LK.svg.render(page, opts);
      pair[1].setAttribute('data-page', page.num);
    });
  }

  function navOptions(book) {
    var o = book.front.map(function (f) { return { v: f.page, t: f.title }; });
    book.sections.forEach(function (s) { o.push({ v: s.page, t: (s.sub ? ' – ' : '') + s.title + '  (p. ' + s.page + ')' }); });
    return o;
  }

  /*
   * book: the layout result; key: changes when a different project is shown (resets the scroll).
   */
  function update(book, key) {
    lastCover = null;
    els.wrap.parentNode.classList.remove('is-cover');
    pages = book.pages;
    widthPt = book.W;
    ratio = book.H / book.W;
    var sig = key + '|' + pages.length + '|' + ratio;
    els.wrap.parentNode.classList.remove('is-empty');
    if (sig !== signature) {
      var resetScroll = signature.split('|')[0] !== key;
      signature = sig;
      computeFit();
      buildSpreads(pages.length);
      applySize();
      if (resetScroll) { current = 0; els.wrap.scrollTop = 0; }
      else scrollToSpread(Math.min(current, spreads.length - 1));
    }
    els.nav.innerHTML = '';
    navOptions(book).forEach(function (o) { els.nav.appendChild(h('option', { value: o.v }, o.t)); });
    markAllDirty();
    updateIndicator();
  }

  /*
   * No book yet: a message in place of the pages. actions: { create, sample }.
   */
  function empty(actions) {
    if (signature === 'empty') return;
    signature = 'empty';
    lastCover = null;
    els.wrap.parentNode.classList.remove('is-cover');
    pages = []; spreads = []; visible = {}; current = 0;
    if (observer) observer.disconnect();
    var create = h('button', { type: 'button', class: 'btn btn-primary' }, 'Create my book');
    var sample = h('button', { type: 'button', class: 'btn' }, 'See a finished sample');
    create.addEventListener('click', actions.create);
    sample.addEventListener('click', function () { actions.sample(); });
    els.wrap.innerHTML = '';
    els.wrap.scrollTop = 0;
    var feats = [
      ['Eight kinds of book', 'Lottery tickets, passenger manifests, hotel registers, staff rosters, name lists, phone records, coordinates and visitor logs.'],
      ['A fair puzzle, proven', 'Every case is checked record by record: one answer, and every clue needed.'],
      ['Chapters and a practice case', 'The archive told in chapters, plus a two-minute warm-up for new readers.'],
      ['Hints and checkpoints', 'Two hints for every clue and a count after each one. No reader gets stuck.'],
      ['The Verdict Cipher', 'Readers unlock the killer’s name with their answer. Zero spoilers.'],
      ['Print-ready cover', 'Front, spine and back at KDP’s exact size, in 50 designs.']
    ];
    els.wrap.appendChild(h('div', { class: 'empty-state' }, [
      h('p', { class: 'eyebrow' }, 'Murder Archive Studio'),
      h('h2', null, 'Make the murder mystery puzzle books readers can’t put down'),
      h('p', null, 'Thousands of suspects, one killer, and a set of clues that leads to exactly one name. Pick a book type in step 1, then every page and the cover appear here.'),
      h('div', { class: 'empty-actions' }, [create, sample]),
      h('ul', { class: 'feature-grid' }, feats.map(function (f) { return h('li', null, [h('strong', null, f[0]), h('span', null, f[1])]); }))
    ]));
    els.nav.innerHTML = '';
    els.ind.textContent = '';
    els.wrap.parentNode.classList.add('is-empty');
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

  function goTo(num) {
    var si = spreadOfPage(num);
    scrollToSpread(si);
    var sp = spreads[si];
    if (!sp) return;
    var el = (sp.left != null && pages[sp.left].num === num) ? sp.leftEl : sp.rightEl;
    if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
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
    var val = null;
    Array.prototype.forEach.call(els.nav.options, function (o) { if (+o.value <= nums[nums.length - 1]) val = o.value; });
    if (val != null && document.activeElement !== els.nav) els.nav.value = val;
  }

  /*
   * The full-wrap cover, back to front, in place of the pages.
   */
  function showCover(cv) {
    lastCover = cv;
    signature = 'cover';
    pages = []; spreads = []; visible = {}; current = 0;
    if (observer) observer.disconnect();
    var viewer = els.wrap.parentNode;
    viewer.classList.remove('is-empty');
    viewer.classList.add('is-cover');
    els.wrap.innerHTML = '';
    var art = h('div', { class: 'cover-art' });
    art.innerHTML = LK.svg.renderCover(cv, { guides: opts.margins });
    var g = cv.guides, W = cv.W;
    var legend = h('div', { class: 'cover-legend' }, [
      h('span', { style: 'width:' + (g.spineX0 / W * 100) + '%' }, 'Back cover'),
      h('span', { class: 'spine', style: 'width:' + ((g.spineX1 - g.spineX0) / W * 100) + '%', title: 'Spine' }, (g.spineX1 - g.spineX0) / W > 0.045 ? 'Spine' : ''),
      h('span', { style: 'width:' + ((W - g.spineX1) / W * 100) + '%' }, 'Front cover')
    ]);
    // as wide as the window allows while the whole sheet stays in view
    els.wrap.appendChild(h('div', { class: 'cover-view', style: 'max-width:min(1280px, calc((100vh - 210px) * ' + (cv.W / cv.H).toFixed(4) + '))' }, [legend, art,
      h('p', { class: 'cover-note' }, opts.margins
        ? 'Blue lines: trim edges and spine folds. Dashed boxes: the safe area for text. The box on the back is kept clear for the KDP barcode.'
        : 'Tick “Show margins” to see the trim, the spine folds, the safe area and the barcode box.')]));
    els.wrap.scrollTop = 0;
    els.nav.innerHTML = '';
    els.ind.textContent = 'Full cover ' + (cv.W / 72).toFixed(2) + ' × ' + (cv.H / 72).toFixed(2) + ' in';
  }

  LK.preview = { init: init, update: update, empty: empty, goTo: goTo, showCover: showCover };
})(window);
