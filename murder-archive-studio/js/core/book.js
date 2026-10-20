/*
 * The project: what the user set up, the story they pasted, and the case built from the seed.
 * The case (archive + clues) is never saved: it is rebuilt from the settings, so a saved
 * project stays small and always gives the same book.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var U = LK.util;

  var DEFAULT_TYPE = 'manifest';

  // Parts of the book the user can leave out. The title page, clues, archive, ledger and
  // solution are the puzzle itself and are always printed.
  var OPTIONAL_PAGES = ['copyright', 'contents', 'howto', 'practice', 'prologue', 'letter', 'hints', 'verdict', 'cards', 'stop', 'epilogue', 'certificate'];

  var REGISTER_MODES = ['chapters', 'list'];
  // the five original styles; the full set of 50 designs is in js/core/cover-designs.js
  var COVER_STYLES = ['classic', 'noir', 'royal', 'emerald', 'casefile'];

  function defaultPages() {
    var o = {};
    OPTIONAL_PAGES.forEach(function (k) { o[k] = true; });
    return o;
  }

  function type(p) { return LK.types.get(p.setup.type); }

  function defaults(typeId) {
    var t = LK.types.get(typeId || DEFAULT_TYPE);
    return {
      type: t.id, venue: t.settings[0].id, customVenue: '', tone: 'classic', ideas: '',
      title: '', author: '',
      trim: '6x9', print: 'regular',
      count: t.defaultCount, difficulty: 'medium', clues: LK.clues.difficulty(t.id, 'medium').clues,
      notesPages: 2, checkpoints: true, clueHelp: true, pages: defaultPages(),
      registerMode: 'chapters',
      cover: { style: 'classic', kicker: '', line: '', question: '' }
    };
  }

  function newProject(typeId) {
    return { v: 2, seed: U.randomSeed(), createdAt: new Date().toISOString(), setup: defaults(typeId), story: null, sample: false };
  }

  // Fills in anything missing from an imported or older project. Projects saved by the Lottery
  // Murder Book Maker have no type: they are lottery books and rebuild the same case.
  function upgrade(p) {
    if (!p || typeof p !== 'object' || !p.setup) return null;
    if (!p.setup.type || !LK.types.all().some(function (t) { return t.id === p.setup.type; })) p.setup.type = 'lottery';
    var t = LK.types.get(p.setup.type);
    var d = defaults(t.id);
    Object.keys(d).forEach(function (k) { if (p.setup[k] === undefined) p.setup[k] = d[k]; });
    if (!p.seed) p.seed = U.randomSeed();
    if (!p.createdAt) p.createdAt = new Date().toISOString();
    if (!t.settings.some(function (s) { return s.id === p.setup.venue; })) p.setup.venue = t.settings[0].id;
    p.setup.count = U.clamp(parseInt(p.setup.count, 10) || t.defaultCount, 100, 40000);
    if (!LK.clues.DIFFICULTY[p.setup.difficulty]) p.setup.difficulty = 'medium';
    var diff = LK.clues.difficulty(t.id, p.setup.difficulty);
    p.setup.clues = U.clamp(parseInt(p.setup.clues, 10) || diff.clues, diff.min, diff.max);
    p.setup.notesPages = U.clamp(parseInt(p.setup.notesPages, 10) || 0, 0, 6);
    p.setup.clueHelp = p.setup.clueHelp !== false;
    if (REGISTER_MODES.indexOf(p.setup.registerMode) === -1 || !t.hasChapters(t.setting(p.setup.venue))) p.setup.registerMode = t.hasChapters(t.setting(p.setup.venue)) ? 'chapters' : 'list';
    var cv = p.setup.cover && typeof p.setup.cover === 'object' ? p.setup.cover : {};
    p.setup.cover = {
      style: COVER_STYLES.indexOf(cv.style) !== -1 || (LK.coverDesigns && LK.coverDesigns.get(cv.style)) ? cv.style : 'classic',
      kicker: String(cv.kicker || '').slice(0, 60), line: String(cv.line || '').slice(0, 60), question: String(cv.question || '').slice(0, 40)
    };
    var pages = p.setup.pages && typeof p.setup.pages === 'object' ? p.setup.pages : {};
    p.setup.pages = {};
    OPTIONAL_PAGES.forEach(function (k) { p.setup.pages[k] = pages[k] !== false; });
    p.v = 2;
    return p;
  }

  // Changing the book type starts from that type's defaults, keeping the author's own choices.
  function setType(p, typeId) {
    var t = LK.types.get(typeId), s = p.setup;
    var keep = { author: s.author, title: s.title, tone: s.tone, ideas: s.ideas, trim: s.trim, print: s.print, difficulty: s.difficulty,
      notesPages: s.notesPages, checkpoints: s.checkpoints, clueHelp: s.clueHelp, pages: s.pages, cover: s.cover };
    p.setup = Object.assign(defaults(t.id), keep);
    p.setup.clues = LK.clues.difficulty(t.id, p.setup.difficulty).clues;
    if (!t.hasChapters(t.settings[0])) p.setup.registerMode = 'list';
    return p;
  }

  // Everything the case depends on. When this changes, the clues change.
  // Lottery books keep the key they always had, so their saved stories still match.
  function caseKey(p) {
    var s = p.setup;
    var k = [p.seed, s.count, s.venue, s.difficulty, s.clues];
    if (s.type && s.type !== 'lottery') k.push(s.type);
    return k.join('|');
  }

  var cache = { key: null, cs: null };
  function getCase(p) {
    var key = caseKey(p);
    if (cache.key === key) return cache.cs;
    var s = p.setup;
    var cs = LK.clues.buildCase({ type: s.type, seed: p.seed, count: s.count, venue: s.venue, difficulty: s.difficulty, clues: s.clues });
    cache = { key: key, cs: cs };
    return cs;
  }

  function hasPage(p, key) { return !p.setup.pages || p.setup.pages[key] !== false; }

  function title(p) {
    var s = p.setup;
    if (s.title && s.title.trim()) return LK.text.cleanTitle(s.title);
    if (p.story && p.story.titles && p.story.titles.length) return p.story.titles[0];
    return '';
  }

  function lastName(n) { var w = String(n).trim().split(/\s+/); return w[w.length - 1].toLowerCase(); }

  /*
   * The ledger (archives without names): each suspect with the records linked to them. The killer
   * owns the surviving record; the others own records that survive a long way, as red herrings.
   * Returns [{ name, role, note, items: [labels], killer }] or null.
   */
  function ledger(p, cs) {
    var st = p.story;
    if (cs.type.mode !== 'ledger' || !st || !st.patrons || !st.patrons.length) return null;
    var rng = U.makeRng('ledger:' + caseKey(p) + ':' + st.patrons.map(function (x) { return x.name; }).join('|'));
    var killerKey = LK.story.nameKey(st.killer);
    var taken = new Set([cs.killerIndex]);
    var herrings = LK.clues.lateSurvivors(cs, Math.min(cs.records.length - 1, st.patrons.length * 3), taken);
    rng.shuffle(herrings);
    function randomRecord() {
      for (var g = 0; g < 1000; g++) {
        var r = rng.int(cs.records.length);
        if (!taken.has(r)) { taken.add(r); return r; }
      }
      return -1;
    }
    var rows = st.patrons.map(function (pt) {
      var isKiller = LK.story.nameKey(pt.name) === killerKey;
      var idx = [];
      if (isKiller) idx.push(cs.killerIndex);
      else {
        while (herrings.length && taken.has(herrings[0])) herrings.shift();
        if (herrings.length) { idx.push(herrings[0]); taken.add(herrings.shift()); }
      }
      var extra = rng.int(3);
      for (var e = 0; e < extra; e++) { var r = randomRecord(); if (r >= 0) idx.push(r); }
      if (!idx.length) { var r2 = randomRecord(); if (r2 >= 0) idx.push(r2); }
      // records are in print order, so sorting their places keeps the archive's order
      idx.sort(function (a, b) { return a - b; });
      var items = idx.map(function (i) { return cs.type.ledgerLabel(cs.records[i], cs); });
      return { name: pt.name, role: pt.role, note: pt.note, items: items, killer: isKiller };
    });
    rows.sort(function (a, b) { return lastName(a.name).localeCompare(lastName(b.name)) || a.name.localeCompare(b.name); });
    return rows;
  }

  /*
   * Archives of people: the killer and the records that survive longest, as the story's cast.
   * Returns [{ name, details, killer, index }], in an order set by the seed.
   */
  function cast(p, cs, size) {
    if (cs.type.mode !== 'named') return [];
    var t = cs.type, want = size || 8;
    // the killer and the records that survive longest, with no two first names or surnames alike
    var idx = [cs.killerIndex], seen = {};
    seen['f' + cs.killer.first] = seen['l' + cs.killer.last] = true;
    LK.clues.lateSurvivors(cs, want * 8).forEach(function (i) {
      var r = cs.records[i];
      if (idx.length >= want || seen['f' + r.first] || seen['l' + r.last]) return;
      seen['f' + r.first] = seen['l' + r.last] = true;
      idx.push(i);
    });
    U.makeRng('cast:' + caseKey(p)).shuffle(idx);
    return idx.map(function (i) {
      var rec = cs.records[i], row = t.row(rec, cs);
      var details = t.columns(cs).filter(function (c) { return c.key !== 'name'; }).map(function (c) { return c.head.toLowerCase() + ' ' + row[c.key]; }).join('; ');
      return { name: t.recordLabel(rec, cs), details: details, killer: i === cs.killerIndex, index: i };
    });
  }

  // The killer's name: from the ledger, or straight from the archive for archives of people.
  function killerName(p, cs) {
    if (cs.type.mode === 'named') return cs.type.recordLabel(cs.killer, cs);
    var rows = ledger(p, cs);
    var k = rows ? rows.filter(function (r) { return r.killer; })[0] : null;
    return k ? k.name : '';
  }

  // A sample project with its story read through the same path as a pasted answer.
  function sampleIds() { return Object.keys(LK.SAMPLES || {}); }
  function sampleProject(id) {
    var smp = (LK.SAMPLES || {})[id] || LK.SAMPLES[sampleIds()[0]];
    var p = upgrade(U.clone(smp.project));
    var fields = LK.story.read(smp.answer);
    p.story = LK.story.merge(null, fields);
    p.story.caseKey = caseKey(p);
    return p;
  }

  function fileName(p, ext) {
    var t = title(p) || 'murder-mystery-puzzle-book';
    return U.slugify(t) + (ext || '');
  }

  LK.book = {
    DEFAULT_TYPE: DEFAULT_TYPE, OPTIONAL_PAGES: OPTIONAL_PAGES, REGISTER_MODES: REGISTER_MODES, COVER_STYLES: COVER_STYLES,
    type: type, killerName: killerName, hasPage: hasPage, defaults: defaults, newProject: newProject, upgrade: upgrade, setType: setType,
    caseKey: caseKey, getCase: getCase, title: title, ledger: ledger, cast: cast, fileName: fileName, sampleProject: sampleProject, sampleIds: sampleIds
  };
})(typeof window !== 'undefined' ? window : globalThis);
