/*
 * workers.js: creates the book's puzzles in the background.
 *
 * Workers are started from a Blob built out of JigsawEngineFactory's own source, which is
 * the one way to run a worker from a page opened over file://. If workers are unavailable
 * the same jobs run on the page in small time slices instead.
 *
 * Every puzzle is identified by (seed, size, variant, level, ordinal, salt). Puzzles are accepted in book
 * order: a slot takes the first salt whose puzzle is not already in the book, so the
 * result never depends on which worker finished first, and the same seed and settings
 * always give the same book. Generated puzzles stay cached, so raising the count or
 * switching back to a previous difficulty only creates what is missing.
 */
(function () {
  'use strict';
  window.KS = window.KS || {};
  var E = KS.engine;
  var MAX_SALTS = 3;

  function workerSource() {
    return 'var JigsawEngineFactory = ' + KS.engineFactory.toString() + ';\n' +
      'var E = JigsawEngineFactory();\n' +
      'self.onmessage = function (e) {\n' +
      '  var j = e.data, p = null, err = null;\n' +
      '  try { p = E.generate(j.seed, j.size, j.variant, j.level, j.ordinal, j.salt); } catch (x) { err = String(x && x.message || x); }\n' +
      '  self.postMessage({ key: j.key, puzzle: p, error: err });\n' +
      '};\n';
  }

  function jobKey(seed, size, variant, level, ordinal, salt) {
    return seed + '/' + size + '/' + variant + '/' + level + '/' + ordinal + '/' + salt;
  }

  function Generator(onChange) {
    this.onChange = onChange;
    this.cache = new Map();      // job key -> wire puzzle, or { failed: true }
    this.slots = [];
    this.seed = '';
    this.size = 9;
    this.variant = 'classic';
    this.workers = [];           // { w: Worker, job: key | null }
    this.inline = null;          // pending timer when running without workers
    this.inlineJob = null;
    this.useWorkers = typeof Worker === 'function' && typeof Blob === 'function' && typeof URL !== 'undefined';
    this.url = null;
    this.cancelled = false;
    this.snapshot = { puzzles: [], ready: 0, total: 0, failed: false, needed: [] };
    this.notifyTimer = null;
    var cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    this.poolSize = Math.max(1, Math.min(6, cores - 1));
  }

  // The plan: the seed, the book's slots in order ({ level, ordinal }), grid size, variant.
  Generator.prototype.setPlan = function (seed, slots, size, variant) {
    this.seed = String(seed);
    this.size = +size || 9;
    this.variant = variant || 'classic';
    this.slots = slots;
    this.cancelled = false;
    this.resolve();
    // Stop work the new plan no longer needs (e.g. after a seed change).
    var needed = this.snapshot.needed, self = this;
    this.workers.forEach(function (slot) {
      if (slot.job && needed.indexOf(slot.job) < 0) self.restart(slot);
    });
    this.pump();
    this.notify(true);
  };

  // Stops at once: terminating a worker abandons its puzzle mid-way.
  Generator.prototype.cancel = function () {
    this.cancelled = true;
    this.workers.forEach(function (slot) { slot.w.terminate(); });
    this.workers = [];
    if (this.inline) { clearTimeout(this.inline); this.inline = null; this.inlineJob = null; }
    this.notify(true);
  };

  Generator.prototype.resume = function () {
    this.cancelled = false;
    this.pump();
    this.notify(true);
  };

  Generator.prototype.isRunning = function () {
    return !this.cancelled && this.snapshot.needed.length > 0;
  };

  // Walks the plan in book order and decides each slot's puzzle from the cache.
  Generator.prototype.resolve = function () {
    var seen = new Set(), puzzles = new Array(this.slots.length), needed = [], ready = 0;
    var failedByLevel = {}, totalByLevel = {};
    for (var i = 0; i < this.slots.length; i++) {
      var sl = this.slots[i];
      totalByLevel[sl.level] = (totalByLevel[sl.level] || 0) + 1;
      for (var salt = 0; salt < MAX_SALTS; salt++) {
        var key = jobKey(this.seed, this.size, this.variant, sl.level, sl.ordinal, salt), hit = this.cache.get(key);
        if (!hit) { needed.push(key); break; }
        if (hit.failed || seen.has(hit.key)) {
          if (salt === MAX_SALTS - 1) failedByLevel[sl.level] = (failedByLevel[sl.level] || 0) + 1;
          continue;
        }
        seen.add(hit.key);
        puzzles[i] = hit;
        ready++;
        break;
      }
    }
    var failedLevels = Object.keys(failedByLevel);
    this.snapshot = {
      puzzles: puzzles,
      ready: ready,
      total: this.slots.length,
      needed: needed,
      failed: failedLevels.length > 0,
      failedMessage: failedLevels.length ? failureMessage(failedLevels, failedByLevel, totalByLevel) : ''
    };
  };

  function failureMessage(levels, failed, total) {
    var names = { easy: 'Easy', medium: 'Medium', hard: 'Hard', extreme: 'Extreme' };
    var parts = levels.map(function (l) {
      return (total[l] - failed[l]) + ' of ' + total[l] + ' ' + names[l];
    });
    return 'Could only create ' + parts.join(' and ') + ' puzzles. Choose fewer puzzles or a different difficulty.';
  }

  Generator.prototype.parseKey = function (key) {
    var p = key.split('/');
    return { key: key, seed: p[0], size: +p[1], variant: p[2], level: p[3], ordinal: +p[4], salt: +p[5] };
  };

  Generator.prototype.inFlight = function () {
    var keys = this.workers.map(function (s) { return s.job; }).filter(Boolean);
    if (this.inlineJob) keys.push(this.inlineJob);
    return keys;
  };

  Generator.prototype.nextJob = function () {
    var busy = this.inFlight();
    for (var i = 0; i < this.snapshot.needed.length; i++) {
      if (busy.indexOf(this.snapshot.needed[i]) < 0) return this.snapshot.needed[i];
    }
    return null;
  };

  Generator.prototype.pump = function () {
    if (this.cancelled) return;
    if (this.useWorkers) {
      while (this.workers.length < this.poolSize) {
        if (!this.spawn()) break;
      }
    }
    if (!this.useWorkers) { this.pumpInline(); return; }
    for (var i = 0; i < this.workers.length; i++) {
      var slot = this.workers[i];
      if (slot.job) continue;
      var key = this.nextJob();
      if (!key) break;
      slot.job = key;
      slot.w.postMessage(this.parseKey(key));
    }
  };

  Generator.prototype.spawn = function () {
    try {
      if (!this.url) this.url = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
      var slot = { w: null, job: null };
      this.attach(slot);
      this.workers.push(slot);
      return true;
    } catch (err) {
      this.fallBackToInline();
      return false;
    }
  };

  Generator.prototype.attach = function (slot) {
    var self = this, w = new Worker(this.url);
    slot.w = w;
    slot.job = null;
    w.onmessage = function (e) { if (slot.w === w) self.receive(slot, e.data); };
    w.onerror = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      self.fallBackToInline();
    };
  };

  // Replaces a busy worker whose job is no longer wanted.
  Generator.prototype.restart = function (slot) {
    slot.w.terminate();
    try { this.attach(slot); } catch (err) { this.fallBackToInline(); }
  };

  Generator.prototype.fallBackToInline = function () {
    if (!this.useWorkers) return;
    this.useWorkers = false;
    this.workers.forEach(function (s) { if (s.w) s.w.terminate(); });
    this.workers = [];
    this.pump();
  };

  // Without workers: one puzzle per timer tick so the page can repaint between puzzles.
  Generator.prototype.pumpInline = function () {
    if (this.inline || this.cancelled) return;
    var key = this.nextJob(), self = this;
    if (!key) return;
    this.inlineJob = key;
    this.inline = setTimeout(function () {
      var j = self.parseKey(key), p = null;
      try { p = E.generate(j.seed, j.size, j.variant, j.level, j.ordinal, j.salt); } catch (e) { p = null; }
      self.inline = null;
      self.inlineJob = null;
      self.store(key, p);
      self.pumpInline();
    }, 0);
  };

  Generator.prototype.receive = function (slot, msg) {
    slot.job = null;
    this.store(msg.key, msg.error ? null : msg.puzzle);
    this.pump();
  };

  Generator.prototype.store = function (key, puzzle) {
    // A cheap structural re-check on the page (the worker already counted solutions).
    if (puzzle && E.validate(puzzle, { structureOnly: true }).length) puzzle = null;
    this.cache.set(key, puzzle || { failed: true });
    this.resolve();
    this.notify(false);
  };

  // Coalesces updates so a burst of finished puzzles costs one repaint.
  Generator.prototype.notify = function (now) {
    var self = this;
    if (now) {
      if (this.notifyTimer) { clearTimeout(this.notifyTimer); this.notifyTimer = null; }
      this.onChange(this.status());
      return;
    }
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(function () {
      self.notifyTimer = null;
      self.onChange(self.status());
    }, 120);
  };

  Generator.prototype.status = function () {
    var s = this.snapshot;
    return {
      puzzles: s.puzzles,
      ready: s.ready,
      total: s.total,
      failed: s.failed,
      failedMessage: s.failedMessage,
      cancelled: this.cancelled,
      running: this.isRunning()
    };
  };

  KS.Generator = Generator;
  KS.Generator.workerSource = workerSource;
})();
