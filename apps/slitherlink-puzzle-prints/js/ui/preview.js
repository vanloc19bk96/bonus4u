/*
 * preview.js: the book as facing pages. Page 1 sits alone on the right, like a printed
 * book. Only spreads near the viewport hold an SVG; the rest are empty boxes of the right
 * size, so a long book scrolls smoothly. A page is re-drawn only when its content key
 * (layout version + which of its puzzles are ready) or the margin overlay changes.
 */
(function () {
  'use strict';
  window.KS = window.KS || {};

  var STEPS = [25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300];
  var CSS_PX_PER_IN = 96;
  var PAGES_PER_FRAME = 4;

  function $(id) { return document.getElementById(id); }

  function Preview() {
    this.scroller = $('scroller');
    this.root = $('spreads');
    this.book = null;
    this.structure = '';
    this.spreads = [];          // [{ el, pages: [index | -1, index | -1] }]
    this.pageEls = [];          // index -> page element
    this.drawn = [];            // index -> key last drawn
    this.visible = new Set();   // spread indexes near the viewport
    this.queue = [];
    this.frame = 0;
    this.showMargins = false;
    this.fit = true;
    this.zoom = 1;              // CSS px per inch = zoom * 96
    this.current = 1;
    var self = this;
    this.observer = new IntersectionObserver(function (entries) { self.onIntersect(entries); },
      { root: this.scroller, rootMargin: '120% 0px 120% 0px' });
    this.bindControls();
  }

  Preview.prototype.bindControls = function () {
    var self = this;
    $('prev').addEventListener('click', function () { self.step(-1); });
    $('next').addEventListener('click', function () { self.step(1); });
    $('page-input').addEventListener('change', function (e) {
      var n = parseInt(e.target.value, 10);
      if (!self.book) return;
      if (isNaN(n)) { e.target.value = self.current; return; }
      n = Math.max(1, Math.min(self.book.pageCount, n));
      e.target.value = n;
      self.goTo(n);
    });
    $('zoom-in').addEventListener('click', function () { self.stepZoom(1); });
    $('zoom-out').addEventListener('click', function () { self.stepZoom(-1); });
    $('zoom-fit').addEventListener('click', function () { self.fit = true; self.relayout(true); });
    $('show-margins').addEventListener('change', function (e) {
      self.showMargins = e.target.checked;
      self.redrawVisible();
    });
    var tick = 0;
    this.scroller.addEventListener('scroll', function () {
      if (tick) return;
      tick = requestAnimationFrame(function () { tick = 0; self.trackCurrent(); });
    }, { passive: true });
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(function () { if (self.fit && self.book) self.relayout(true); }).observe(this.scroller);
    }
    this.scroller.addEventListener('keydown', function (e) {
      if (e.target !== self.scroller) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); self.step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); self.step(-1); }
    });
  };

  // ---------------------------------------------------------------- book updates
  // book: null before any puzzles exist; the preview then shows a placeholder.
  Preview.prototype.setBook = function (book) {
    var empty = !book;
    $('preview-empty').hidden = !empty;
    this.scroller.hidden = empty;
    ['prev', 'next', 'page-input', 'zoom-in', 'zoom-out', 'zoom-fit', 'show-margins'].forEach(function (id) {
      $(id).disabled = empty;
    });
    if (empty) {
      if (this.book) this.clear();
      this.book = null;
      this.structure = '';
      $('page-of').textContent = 'of 0';
      $('page-input').value = '';
      return;
    }
    this.book = book;
    var structure = book.pageCount + '|' + book.trim.key;
    if (structure !== this.structure) {
      this.structure = structure;
      this.build();
    } else {
      this.redrawVisible();
    }
    $('page-of').textContent = 'of ' + book.pageCount;
    $('page-input').max = book.pageCount;
    this.updateButtons();
  };

  Preview.prototype.clear = function () {
    this.observer.disconnect();
    this.root.textContent = '';
    this.spreads = [];
    this.pageEls = [];
    this.drawn = [];
    this.visible.clear();
    this.queue = [];
  };

  Preview.prototype.build = function () {
    var keep = this.current, book = this.book, self = this;
    this.clear();
    var n = book.pageCount, groups = [[-1, 0]];
    for (var i = 1; i < n; i += 2) groups.push([i, i + 1 < n ? i + 1 : -1]);
    var frag = document.createDocumentFragment();
    groups.forEach(function (pair, s) {
      var el = document.createElement('div');
      el.className = 'spread';
      el.dataset.spread = s;
      var pages = document.createElement('div');
      pages.className = 'spread-pages';
      pair.forEach(function (idx, side) {
        var p = document.createElement('div');
        p.className = 'page ' + (side ? 'right' : 'left') + (idx < 0 ? ' empty' : '');
        if (idx >= 0) {
          p.dataset.index = idx;
          p.setAttribute('role', 'img');
          p.setAttribute('aria-label', 'Page ' + (idx + 1));
          self.pageEls[idx] = p;
        }
        pages.appendChild(p);
      });
      var label = document.createElement('div');
      label.className = 'spread-label';
      var nums = pair.filter(function (x) { return x >= 0; }).map(function (x) { return x + 1; });
      label.textContent = nums.length > 1 ? 'Pages ' + nums[0] + '–' + nums[1] : 'Page ' + nums[0];
      el.appendChild(pages);
      el.appendChild(label);
      frag.appendChild(el);
      self.spreads.push({ el: el, pages: pair });
    });
    this.root.appendChild(frag);
    this.relayout(false);
    this.spreads.forEach(function (sp) { self.observer.observe(sp.el); });
    this.goTo(Math.min(keep, n), true);
  };

  // Sizes every page box for the current zoom (fit or fixed).
  Preview.prototype.relayout = function (keepPlace) {
    if (!this.book) return;
    var keep = this.current, t = this.book.trim;
    if (this.fit) {
      // Room for the spread padding, the gap between the pages and the label under the spread.
      var gap = parseFloat(getComputedStyle(this.root).getPropertyValue('--page-gap')) || 0;
      var w = this.scroller.clientWidth - 64 - gap, h = this.scroller.clientHeight - 84;
      this.zoom = Math.max(0.2, Math.min(w / (2 * t.w), h / t.h) / CSS_PX_PER_IN);
    }
    var pw = Math.round(t.w * this.zoom * CSS_PX_PER_IN), ph = Math.round(t.h * this.zoom * CSS_PX_PER_IN);
    Array.prototype.forEach.call(this.root.querySelectorAll('.page'), function (p) {
      p.style.width = pw + 'px';
      p.style.height = ph + 'px';
    });
    $('zoom-value').textContent = Math.round(this.zoom * 100) + '%';
    if (keepPlace) this.goTo(keep, true);
  };

  Preview.prototype.stepZoom = function (dir) {
    var pct = this.zoom * 100, next = pct;
    if (dir > 0) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i] > pct + 0.5) { next = STEPS[i]; break; } }
    else { for (var j = STEPS.length - 1; j >= 0; j--) if (STEPS[j] < pct - 0.5) { next = STEPS[j]; break; } }
    this.fit = false;
    this.zoom = next / 100;
    this.relayout(true);
  };

  // ---------------------------------------------------------------- drawing
  Preview.prototype.onIntersect = function (entries) {
    var self = this;
    entries.forEach(function (en) {
      var s = +en.target.dataset.spread;
      if (en.isIntersecting) {
        self.visible.add(s);
        self.spreads[s].pages.forEach(function (idx) { if (idx >= 0) self.enqueue(idx); });
      } else {
        self.visible.delete(s);
        self.spreads[s].pages.forEach(function (idx) {
          if (idx < 0) return;
          self.pageEls[idx].textContent = '';
          self.drawn[idx] = null;
        });
      }
    });
    this.schedule();
  };

  Preview.prototype.enqueue = function (idx) {
    if (this.queue.indexOf(idx) < 0) this.queue.push(idx);
  };

  Preview.prototype.redrawVisible = function () {
    var self = this;
    this.visible.forEach(function (s) {
      self.spreads[s].pages.forEach(function (idx) { if (idx >= 0) self.enqueue(idx); });
    });
    this.schedule();
  };

  Preview.prototype.schedule = function () {
    if (this.frame || !this.queue.length) return;
    var self = this;
    this.frame = requestAnimationFrame(function () {
      self.frame = 0;
      // Nearest pages first.
      self.queue.sort(function (a, b) { return Math.abs(a + 1 - self.current) - Math.abs(b + 1 - self.current); });
      var done = 0;
      while (self.queue.length && done < PAGES_PER_FRAME) {
        var idx = self.queue.shift();
        if (self.draw(idx)) done++;
      }
      self.schedule();
    });
  };

  Preview.prototype.draw = function (idx) {
    var book = this.book, el = this.pageEls[idx];
    if (!book || !el || idx >= book.pageCount) return false;
    var key = book.pageKey(idx) + (this.showMargins ? ':m' : '');
    if (this.drawn[idx] === key) return false;
    this.drawn[idx] = key;
    el.innerHTML = KS.Svg.pageSVG(book.renderPage(idx), { showMargins: this.showMargins });
    return true;
  };

  // ---------------------------------------------------------------- navigation
  Preview.prototype.spreadOf = function (pageNumber) { return Math.floor(pageNumber / 2); };

  Preview.prototype.goTo = function (pageNumber, instant) {
    if (!this.spreads.length) return;
    var s = Math.max(0, Math.min(this.spreads.length - 1, this.spreadOf(pageNumber)));
    var el = this.spreads[s].el;
    this.scroller.scrollTo({ top: el.offsetTop - 16, behavior: instant ? 'auto' : 'smooth' });
    this.current = pageNumber;
    $('page-input').value = pageNumber;
    this.updateButtons();
  };

  Preview.prototype.step = function (dir) {
    if (!this.book) return;
    var s = this.spreadOf(this.current) + dir;
    s = Math.max(0, Math.min(this.spreads.length - 1, s));
    var first = this.spreads[s].pages.filter(function (x) { return x >= 0; })[0] + 1;
    this.goTo(first);
  };

  Preview.prototype.trackCurrent = function () {
    if (!this.spreads.length) return;
    var top = this.scroller.scrollTop + this.scroller.clientHeight * 0.3, best = 0;
    for (var s = 0; s < this.spreads.length; s++) {
      if (this.spreads[s].el.offsetTop <= top) best = s; else break;
    }
    var first = this.spreads[best].pages.filter(function (x) { return x >= 0; })[0] + 1;
    if (first !== this.current) {
      this.current = first;
      if (document.activeElement !== $('page-input')) $('page-input').value = first;
      this.updateButtons();
    }
  };

  Preview.prototype.updateButtons = function () {
    var s = this.spreadOf(this.current);
    $('prev').disabled = s <= 0;
    $('next').disabled = s >= this.spreads.length - 1;
  };

  KS.Preview = Preview;
})();
