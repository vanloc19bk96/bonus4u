/*
 * form.js: the setup form. Reads user input into settings and shows each field's message
 * right next to it. Invalid values are never applied: a field keeps the last good value
 * until the input is valid again, and is tidied (clamped or restored) when it loses focus.
 */
(function () {
  'use strict';
  window.KS = window.KS || {};
  var S = KS.Settings, KDP = KS.KDP;

  function $(id) { return document.getElementById(id); }

  function fmtIn(v) { return String(Math.round(v * 1000) / 1000); }

  function Form(update, create) {
    // update(mutator, kind): kind 'puzzles' changes what Create puzzles will make,
    // 'layout' re-lays out at once. create(): make puzzles for the current settings.
    this.update = update;
    this.create = create;
    this.el = $('form');
    this.ctx = null;
    this.messages = {};
    this.mixDraft = false;      // the mix fields hold percentages that do not add up to 100 yet
    this.buildOptions();
    this.bind();
  }

  // ---------------------------------------------------------------- static options
  Form.prototype.buildOptions = function () {
    var presets = $('presets');
    S.PRESETS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.dataset.preset = p.key;
      b.innerHTML = '<strong></strong><span></span>';
      b.firstChild.textContent = p.label;
      b.lastChild.textContent = p.note;
      presets.appendChild(b);
    });
    var diff = $('f-difficulty');
    S.DIFFICULTIES.forEach(function (d) {
      var o = document.createElement('option');
      o.value = d.key; o.textContent = d.label;
      diff.appendChild(o);
    });
    function fill(id, list, label) {
      var sel = $(id);
      list.forEach(function (item) {
        var o = document.createElement('option');
        o.value = item.key != null ? item.key : item.n;
        o.textContent = label(item);
        sel.appendChild(o);
      });
    }
    fill('f-size', S.SIZES, function (z) { return z.label + ' (' + z.note + ')'; });
    fill('f-variant', S.VARIANTS, function (v) { return v.label; });
    fill('f-label', S.LABEL_STYLES, function (l) { return l.label; });
    fill('f-header', S.HEADERS, function (h) { return h.label; });
    var trim = $('f-trim');
    KDP.TRIMS.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t.key;
      o.textContent = t.label + (t.hint ? ' (' + t.hint + ')' : '');
      trim.appendChild(o);
    });
    var pp = $('perpage');
    S.PER_PAGE.forEach(function (n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.n = n;
      b.textContent = n;
      pp.appendChild(b);
    });
  };

  // ---------------------------------------------------------------- events
  Form.prototype.bind = function () {
    var self = this, el = this.el;
    el.addEventListener('submit', function (e) { e.preventDefault(); });

    $('presets').addEventListener('click', function (e) {
      var b = e.target.closest('[data-preset]');
      if (!b) return;
      var preset = S.PRESETS.filter(function (p) { return p.key === b.dataset.preset; })[0];
      self.clear('count'); self.clear('perpage'); self.dropMixDraft();
      self.update(function (s) { Object.assign(s, preset.values); }, 'puzzles');
    });
    radioKeys($('presets'), '[data-preset]');

    text('f-title', function (s, v) { s.title = v; }, function (v) {
      return v.trim() ? '' : 'Enter a title for the book.';
    });
    text('f-subtitle', function (s, v) { s.subtitle = v; s.subtitleAuto = false; });
    text('f-author', function (s, v) { s.author = v; });
    text('f-copyright', function (s, v) { s.copyrightText = v; });
    text('f-thanks', function (s, v) { s.thanksText = v; });
    $('subtitle-auto').addEventListener('click', function () {
      self.update(function (s) { s.subtitleAuto = true; s.subtitle = ''; }, 'layout');
      $('f-subtitle').focus();
    });

    integer('f-count', 'count', S.LIMITS.count, 'puzzles', 'Enter a whole number from 10 to 1000.');
    integer('f-seed', 'seed', S.LIMITS.seed, 'puzzles', 'Enter a whole number from 1 to 999999.');

    $('f-difficulty').addEventListener('change', function (e) {
      var v = e.target.value;
      self.dropMixDraft();
      self.update(function (s) { s.difficulty = v; }, 'puzzles');
    });

    // Difficulty mix: editing a percentage turns the difficulty into a custom mix. The
    // three fields only apply together, once they add up to 100.
    S.LEVELS.forEach(function (level) {
      var input = $('f-mix-' + level);
      input.addEventListener('input', applyMix);
      input.addEventListener('change', function () {
        if (input.value.trim() === '') { input.value = 0; applyMix(); }
      });
    });
    function applyMix() {
      var mix = {};
      S.LEVELS.forEach(function (level) {
        var raw = $('f-mix-' + level).value.trim();
        mix[level] = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
      });
      var err = S.mixError(mix);
      S.LEVELS.forEach(function (level) { $('f-mix-' + level).setAttribute('aria-invalid', err ? 'true' : 'false'); });
      if (err) {
        self.mixDraft = true;
        self.show('mix', 'error', err);
        $('create-puzzles').disabled = true;
        return;
      }
      self.mixDraft = false;
      self.clear('mix');
      self.update(function (s) { s.difficulty = 'mix'; s.mix = mix; }, 'puzzles');
    }
    $('f-size').addEventListener('change', function (e) {
      var v = +e.target.value;
      self.dropMixDraft();
      self.update(function (s) { s.size = v; }, 'puzzles');
    });
    $('f-variant').addEventListener('change', function (e) {
      var v = e.target.value;
      self.update(function (s) { s.variant = v; }, 'puzzles');
    });
    $('f-label').addEventListener('change', function (e) {
      var v = e.target.value;
      self.update(function (s) { s.labelStyle = v; }, 'layout');
    });
    $('f-header').addEventListener('change', function (e) {
      var v = e.target.value;
      self.update(function (s) { s.header = v; }, 'layout');
    });
    $('f-trim').addEventListener('change', function (e) {
      var v = e.target.value;
      self.update(function (s) { s.trim = v; }, 'layout');
    });

    $('perpage').addEventListener('click', function (e) {
      var b = e.target.closest('[data-n]');
      if (!b) return;
      if (b.getAttribute('aria-disabled') === 'true') {
        self.show('perpage', 'error', b.dataset.reason);
        return;
      }
      var n = +b.dataset.n;
      self.clear('perpage');
      self.update(function (s) { s.perPage = n; }, 'layout');
    });
    radioKeys($('perpage'), '[data-n]:not([aria-disabled="true"])');

    el.addEventListener('change', function (e) {
      var t = e.target;
      if (t.type !== 'checkbox' || !t.name) return;
      var path = t.name.split('.'), on = t.checked;
      self.update(function (s) {
        if (path[0] === 'margins' && path[1] === 'autoInside' && !on) {
          // Start the manual value from what the book uses now.
          s.margins.inside = self.ctx ? self.ctx.book.margins.inside : s.margins.inside;
        }
        if (path.length === 2) s[path[0]][path[1]] = on; else s[path[0]] = on;
      }, 'layout');
    });

    margin('f-inside', 'inside');
    margin('f-outside', 'outside');
    margin('f-top', 'top');
    margin('f-bottom', 'bottom');

    $('create-puzzles').addEventListener('click', function () { self.create(); });

    // A fresh seed is an explicit request for new puzzles, so it creates them at once.
    $('new-puzzles').addEventListener('click', function () {
      self.clear('seed');
      self.update(function (s) {
        var next = s.seed;
        while (next === s.seed) next = S.randomSeed();
        s.seed = next;
      }, 'puzzles');
      self.create();
    });

    // ---- field helpers
    function text(id, apply, validate) {
      var input = $(id), key = id.slice(2);
      input.addEventListener('input', function () {
        var v = input.value, err = validate ? validate(v) : '';
        if (err) self.show(key, 'error', err); else self.clear(key);
        input.setAttribute('aria-invalid', err ? 'true' : 'false');
        self.update(function (s) { apply(s, v); }, 'layout');
      });
    }

    function integer(id, key, lim, kind, errText) {
      var input = $(id);
      function parse() {
        var raw = input.value.trim();
        return /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
      }
      input.addEventListener('input', function () {
        var v = parse();
        if (v >= lim.min && v <= lim.max) {
          self.clear(key);
          input.setAttribute('aria-invalid', 'false');
          self.update(function (s) { s[key] = v; }, kind);
        } else if (input.value.trim() !== '') {
          self.show(key, 'error', errText);
          input.setAttribute('aria-invalid', 'true');
        }
      });
      input.addEventListener('change', function () {
        var v = parse(), cur = self.ctx.settings[key];
        input.setAttribute('aria-invalid', 'false');
        if (isNaN(v)) { input.value = cur; self.clear(key); return; }
        var clamped = Math.min(lim.max, Math.max(lim.min, v));
        input.value = clamped;
        if (clamped !== v) self.show(key, 'note', 'Changed to ' + clamped + ', the ' + (v < lim.min ? 'smallest' : 'largest') + ' allowed.');
        else self.clear(key);
        if (clamped !== cur) self.update(function (s) { s[key] = clamped; }, kind);
      });
    }

    function margin(id, key) {
      var input = $(id), msgKey = key === 'inside' ? 'inside' : 'margins';
      function low() { return key === 'inside' ? (self.ctx ? self.ctx.book.margins.kdpInside : 0.375) : KDP.MIN_MARGIN; }
      input.addEventListener('input', function () {
        var v = parseFloat(input.value);
        if (isNaN(v)) return;
        if (v > KDP.MAX_MARGIN) {
          self.show(msgKey, 'error', 'Use ' + KDP.MAX_MARGIN + ' in or less.');
          return;
        }
        if (key !== 'inside' && v < KDP.MIN_MARGIN) {
          self.show(msgKey, 'error', 'KDP needs at least ' + KDP.MIN_MARGIN + ' in.');
          return;
        }
        self.clear(msgKey);
        self.update(function (s) { s.margins[key] = v; }, 'layout');
      });
      input.addEventListener('change', function () {
        var v = parseFloat(input.value), cur = self.ctx.settings.margins[key];
        if (isNaN(v)) { input.value = fmtIn(cur); self.clear(msgKey); return; }
        var clamped = Math.round(Math.min(KDP.MAX_MARGIN, Math.max(low(), v)) * 1000) / 1000;
        input.value = fmtIn(clamped);
        if (clamped > v) self.show(msgKey, 'note', 'Raised to ' + fmtIn(clamped) + ' in, the KDP minimum.');
        else if (clamped < v) self.show(msgKey, 'note', 'Lowered to ' + KDP.MAX_MARGIN + ' in.');
        else self.clear(msgKey);
        if (clamped !== cur) self.update(function (s) { s.margins[key] = clamped; }, 'layout');
      });
    }

    // Arrow keys move between the options of a radio group; only the checked one is tabbable.
    function radioKeys(group, selector) {
      group.addEventListener('keydown', function (e) {
        var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        if (!keys[e.key]) return;
        var items = Array.prototype.slice.call(group.querySelectorAll(selector));
        var i = items.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        var next = items[(i + keys[e.key] + items.length) % items.length];
        next.focus();
        next.click();
      });
    }
  };

  // Choosing a difficulty or preset replaces percentages that did not add up.
  Form.prototype.dropMixDraft = function () {
    this.mixDraft = false;
    this.clear('mix');
    S.LEVELS.forEach(function (level) { $('f-mix-' + level).setAttribute('aria-invalid', 'false'); });
  };

  // ---------------------------------------------------------------- messages
  Form.prototype.show = function (key, kind, text) {
    this.messages[key] = { kind: kind, text: text };
    this.paintMessage(key);
  };
  Form.prototype.clear = function (key) {
    delete this.messages[key];
    this.paintMessage(key);
  };
  Form.prototype.paintMessage = function (key, fallback) {
    var el = $('m-' + key);
    if (!el) return;
    var m = this.messages[key] || fallback || null;
    if (!m && el.dataset.hint) { el.className = 'msg hint'; el.textContent = el.dataset.hint; return; }
    el.className = 'msg' + (m ? ' ' + m.kind : '');
    el.textContent = m ? m.text : '';
  };

  // ---------------------------------------------------------------- render
  // ctx: { settings, book, perPage: options from Layout.perPageOptions, notes: { key: msg },
  //        pending: puzzle settings differ from the puzzles in the book,
  //        empty: no puzzles created yet }
  Form.prototype.render = function (ctx) {
    this.ctx = ctx;
    var s = ctx.settings, active = document.activeElement;
    function set(id, value) {
      var input = $(id);
      if (input !== active && String(input.value) !== String(value)) input.value = value;
    }
    set('f-title', s.title);
    set('f-subtitle', S.subtitle(s));
    $('subtitle-auto').hidden = s.subtitleAuto;
    set('f-author', s.author);
    set('f-count', s.count);
    set('f-difficulty', s.difficulty);
    set('f-trim', s.trim);
    set('f-size', s.size);
    set('f-variant', s.variant);
    set('f-label', s.labelStyle);
    set('f-header', s.header);
    // Choices a grid size does not offer are shown but disabled.
    Array.prototype.forEach.call($('f-variant').options, function (o) { o.disabled = !S.variantOk(o.value, s.size); });
    Array.prototype.forEach.call($('f-difficulty').options, function (o) { o.disabled = !S.difficultyOk(o.value, s.size); });
    S.LEVELS.forEach(function (level) { $('f-mix-' + level).disabled = !S.levelOk(level, s.size); });
    set('f-copyright', s.copyrightText);
    set('f-thanks', s.thanksText);
    set('f-seed', s.seed);
    set('f-outside', fmtIn(s.margins.outside));
    set('f-top', fmtIn(s.margins.top));
    set('f-bottom', fmtIn(s.margins.bottom));
    $('create-puzzles').disabled = !ctx.pending || this.mixDraft;
    var mc = $('m-create');
    // The status line above says why; this only says what the button will make.
    mc.textContent = ctx.pending ? 'Makes ' + s.count + ' ' + S.difficultyLabel(s) + ' puzzles.' : '';

    // The mix is shown for every difficulty with more than one level, and for a custom mix.
    var mix = S.mixOf(s.difficulty, s.mix);
    $('mix').hidden = !(S.isMixed(s) || s.difficulty === 'mix');
    if (!this.mixDraft) S.LEVELS.forEach(function (level) { set('f-mix-' + level, mix[level]); });
    var counts = S.levelCounts(s.count, s.difficulty, s.mix);
    var split = S.LEVELS.filter(function (l) { return counts[l] > 0; })
      .map(function (l) { return counts[l] + ' ' + S.LEVEL_LABEL[l]; }).join(' · ');
    if (!S.levelOk('extreme', s.size)) split += '. ' + s.size + ' × ' + s.size + ' has no Extreme level';
    this.paintMessage('mix', { kind: 'hint', text: split + ' puzzles' });
    var inside = $('f-inside');
    inside.disabled = s.margins.autoInside;
    inside.min = ctx.book.margins.kdpInside;
    set('f-inside', fmtIn(s.margins.autoInside ? ctx.book.margins.inside : s.margins.inside));

    Array.prototype.forEach.call(this.el.querySelectorAll('input[type="checkbox"][name]'), function (cb) {
      var path = cb.name.split('.');
      cb.checked = path.length === 2 ? !!s[path[0]][path[1]] : !!s[path[0]];
    });

    var preset = S.matchingPreset(s);
    Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
      var on = b.dataset.preset === preset;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on || (!preset && b === b.parentNode.firstChild) ? 0 : -1;
    });

    var trimLabel = ctx.book.trim.label;
    ctx.perPage.forEach(function (o) {
      var b = document.querySelector('#perpage [data-n="' + o.n + '"]');
      var on = s.perPage === o.n;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.setAttribute('aria-disabled', o.ok ? 'false' : 'true');
      b.dataset.reason = o.ok ? '' : o.n + ' per page is not available at ' + trimLabel +
        ': cells would be too small to write in. Choose a larger book size or fewer per page.';
      b.title = o.ok ? o.n + ' per page' : b.dataset.reason;
      b.setAttribute('aria-label', o.n + ' per page' + (o.ok ? '' : ', unavailable'));
      b.tabIndex = on ? 0 : -1;
    });

    // Messages derived from the book (shown unless the user's own message is newer).
    var notes = ctx.notes || {};
    var self = this;
    ['title', 'subtitle', 'size', 'perpage', 'inside', 'margins', 'count', 'seed'].forEach(function (key) {
      self.paintMessage(key, notes[key]);
    });
  };

  KS.Form = Form;
})();
