/*
 * The project (everything a saved file holds) and the puzzle set built from it.
 * The same project always builds the same book: every random choice comes from the project
 * seed, the case and its version number. Built puzzles are cached, so typing a title or
 * changing the trim never rebuilds a puzzle.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var U = CX.util, E = CX.engine;

  var VERSION = 1;
  var LEVEL_IDS = ['warmup', 'casework', 'tough', 'master'];

  function newProject() {
    return {
      app: 'cross-it-out-puzzle-prints', version: VERSION,
      seed: U.randomSeed(),
      createdAt: new Date().toISOString().slice(0, 10),
      setup: {
        title: '', subtitle: '', author: '',
        audience: 'adults', spelling: 'us',
        trim: '6x9', paper: 'white', layout: 'spread', largePrint: false,
        counts: { warmup: 10, casework: 10, tough: 10, master: 10 },
        starter: true,
        pages: { welcome: true, guide: true, faq: true, contents: true, parts: true, solutions: 'explained', thanks: true, notes: 2 },
        cover: { design: 'notecard', palette: 'tomato', badge: '', blurb: '' }
      },
      packs: [],
      tweaks: {},
      starterFixes: {},   // fact-check corrections to starter packs: { packId: [[factIndex, optionIndex]] }
      factCheck: null     // { sig } once an AI has fact-checked the knowledge clues
    };
  }

  // A project from a saved file, filled in with today's defaults for anything missing.
  function upgrade(o) {
    if (!o || typeof o !== 'object' || !o.setup) return null;
    var p = newProject();
    p.seed = String(o.seed || p.seed);
    p.createdAt = String(o.createdAt || p.createdAt);
    var s = o.setup;
    Object.keys(p.setup).forEach(function (k) {
      if (s[k] === undefined) return;
      if (k === 'counts' || k === 'pages' || k === 'cover') Object.keys(p.setup[k]).forEach(function (k2) { if (s[k][k2] !== undefined) p.setup[k][k2] = s[k][k2]; });
      else p.setup[k] = s[k];
    });
    LEVEL_IDS.forEach(function (id) { p.setup.counts[id] = U.clamp(parseInt(p.setup.counts[id], 10) || 0, 0, 300); });
    p.packs = CX.packs.fromSaved(o.packs);
    p.tweaks = o.tweaks && typeof o.tweaks === 'object' ? o.tweaks : {};
    p.starterFixes = o.starterFixes && typeof o.starterFixes === 'object' ? o.starterFixes : {};
    p.factCheck = o.factCheck && typeof o.factCheck === 'object' ? { sig: String(o.factCheck.sig || '') } : null;
    return p;
  }

  // What a project file holds: the packs without the engine's cached data.
  function toSave(project) {
    var out = U.clone(Object.assign({}, project, { packs: [] }));
    out.packs = project.packs.map(CX.packs.plain);
    return out;
  }

  // The subtitle printed on the title page and the cover: the user's, or one made from the book.
  function subtitle(p, built) {
    var s = p.setup, own = String(s.subtitle || '').trim();
    if (own) return own;
    var n = built ? built.all.length : 0;
    var aud = s.audience === 'kids' ? 'for Kids' : s.audience === 'seniors' ? 'for Seniors' : 'for Adults';
    return (n ? n + ' ' : '') + 'Elimination Logic Puzzles ' + aud + (s.largePrint ? ' in Large Print' : '');
  }

  function title(p) { return String(p.setup.title || '').trim(); }

  function fileName(p, suffix) {
    var s = p.setup, t = KDP().trim(s.trim);
    return U.slugify(title(p) || 'cross-it-out-if') + suffix.replace('{trim}', t.id);
  }
  function KDP() { return CX.kdp; }

  // Every pack the book draws from: the starter library (when on) and the user's own.
  function activePacks(p) {
    var out = [];
    if (p.setup.starter) out = out.concat(CX.starter.packs().map(function (pk) { return withFixes(pk, (p.starterFixes || {})[pk.id]); }));
    p.packs.forEach(function (pk) { if (!pk.off) out.push(pk); });
    return out;
  }

  // A starter pack with this project's fact-check corrections (the shared pack stays untouched).
  var fixedCache = new Map();
  function withFixes(pk, fixes) {
    if (!fixes || !fixes.length) return pk;
    var key = pk.id + JSON.stringify(fixes), hit = fixedCache.get(key);
    if (hit) return hit;
    var copy = { id: pk.id, topic: pk.topic, cases: pk.cases, options: pk.options, facts: U.clone(pk.facts), source: 'starter' };
    fixes.forEach(function (f) { CX.packs.markDebatable(copy, f[0], f[1]); });
    if (fixedCache.size > 200) fixedCache.clear();
    fixedCache.set(key, copy);
    return copy;
  }

  function packHash(pk) {
    if (pk._hash) return pk._hash;
    var h = U.hashHex(JSON.stringify([pk.topic, pk.cases, pk.options, pk.facts]));
    Object.defineProperty(pk, '_hash', { value: h, enumerable: false, configurable: true });
    return h;
  }

  var cache = new Map();
  function makeCached(pk, ci, lv, seed, audience, avoid) {
    var key = [packHash(pk), ci, lv, seed, audience, avoid.join('.')].join('|');
    var hit = cache.get(key);
    if (hit) return hit;
    var res = E.make(pk, ci, { seed: seed + '|' + pk.id + '|' + ci + '|' + lv, level: lv, audience: audience, avoid: avoid });
    if (cache.size > 6000) cache.clear();
    cache.set(key, res);
    return res;
  }

  function caseKey(pk, ci) { return pk.id + ':' + ci; }

  /*
   * The puzzle set. Returns {
   *   levels: [{ level, want, puzzles:[pz] }], all:[pz in book order], want, available (cases),
   *   short: { levelId: missing }, starterShare (0..1), usedTypes: { type: true }
   * }
   * pz: { no, key, level, pack, ci, title, story, options:[text], answer, clues:[...], v }
   */
  function build(p) {
    var s = p.setup, packs = activePacks(p);
    var cases = [];
    packs.forEach(function (pk) {
      pk.cases.forEach(function (cs, ci) {
        var k = caseKey(pk, ci), tw = p.tweaks[k] || {};
        if (tw.off) return;
        cases.push({ pack: pk, ci: ci, key: k, v: tw.v || 0 });
      });
    });
    // the user's own cases first; the starter library only fills what is left
    var rng = U.makeRng('order:' + p.seed);
    rng.shuffle(cases);
    cases = cases.filter(function (c) { return c.pack.source !== 'starter'; }).concat(cases.filter(function (c) { return c.pack.source === 'starter'; }));
    var used = {}, answers = {}, byLevel = {}, short = {};
    // hardest first: the master files take the cases that can carry them
    LEVEL_IDS.slice().reverse().forEach(function (lv) {
      var want = s.counts[lv] || 0, got = [];
      var minOpt = E.level(lv, s.audience).lineup[0];
      for (var i = 0; i < cases.length && got.length < want; i++) {
        var c = cases[i];
        if (used[c.key] || c.pack.options.length < minOpt) continue;
        var avoid = answers[c.pack.id] || [];
        var res = makeCached(c.pack, c.ci, lv, p.seed + (c.v ? '~' + c.v : ''), s.audience, avoid);
        if (!res.ok) continue;
        used[c.key] = true;
        answers[c.pack.id] = avoid.concat([res.lineup[res.answer]]);
        got.push({ c: c, res: res });
      }
      byLevel[lv] = spaceOut(got, U.makeRng('space:' + p.seed + lv));
      if (got.length < want) short[lv] = want - got.length;
    });
    var all = [], levels = [], no = 0, usedTypes = {}, starter = 0;
    LEVEL_IDS.forEach(function (lv) {
      var list = byLevel[lv].map(function (g) {
        var pk = g.c.pack, cs = pk.cases[g.c.ci], res = g.res;
        var pz = {
          no: ++no, key: g.c.key, level: lv, pack: pk, ci: g.c.ci, v: g.c.v,
          title: cs.title, story: cs.story,
          options: res.lineup.map(function (oi) { return pk.options[oi]; }),
          lineup: res.lineup, answer: res.answer, clues: res.clues
        };
        pz.clues.forEach(function (c) { usedTypes[c.type] = true; });
        if (pk.source === 'starter') starter++;
        all.push(pz);
        return pz;
      });
      levels.push({ level: E.level(lv, s.audience), want: s.counts[lv] || 0, puzzles: list });
    });
    var want = LEVEL_IDS.reduce(function (a, lv) { return a + (s.counts[lv] || 0); }, 0);
    return { levels: levels, all: all, want: want, available: cases.length, short: short, starterShare: all.length ? starter / all.length : 0, usedTypes: usedTypes, packs: packs };
  }

  // Book order within a level: shuffled, with two cases from one pack never side by side.
  function spaceOut(list, rng) {
    var pool = rng.shuffle(list.slice()), out = [];
    while (pool.length) {
      var last = out.length ? out[out.length - 1].c.pack.id : null;
      var i = 0;
      while (i < pool.length && pool[i].c.pack.id === last) i++;
      if (i === pool.length) i = 0;
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  }

  /*
   * Applies the problems an AI fact-check found: each named option becomes debatable for that
   * clue's fact, so the engine never relies on it again and the case gets new clues.
   * issues: from CX.prompts.readAudit. Returns { applied, skipped:[text] }.
   */
  function applyFactIssues(p, built, issues) {
    var applied = 0, skipped = [];
    function norm(t) { return String(t || '').toLowerCase().replace(/[^a-z ]+/g, '').replace(/\s+/g, ' ').trim(); }
    issues.forEach(function (is) {
      var pz = built.all.filter(function (z) { return z.no === is.case; })[0];
      if (!pz) { skipped.push('Case ' + is.case + ' is not in the book.'); return; }
      var facts = pz.clues.filter(function (c) { return c.type === 'fact' || c.type === 'notFact'; });
      var want = norm(is.clue).replace(/^cross it out if /, '');
      var clue = facts.filter(function (c) { return norm(c.text) === want; })[0] ||
        facts.filter(function (c) { var t = norm(c.text); return want && (t.indexOf(want) !== -1 || want.indexOf(t) !== -1); })[0] ||
        (facts.length === 1 ? facts[0] : null);
      if (!clue) { skipped.push('Case ' + is.case + ': no clue “' + is.clue + '”.'); return; }
      var pk = pz.pack, k = CX.packs.key(is.option), oi = -1;
      pk.options.forEach(function (o, i) { if (oi === -1 && CX.packs.key(o) === k) oi = i; });
      if (oi === -1) { skipped.push('Case ' + is.case + ': no option “' + is.option + '”.'); return; }
      var fi = clue.param;
      if (pk.source === 'starter') {
        var list = p.starterFixes[pk.id] = p.starterFixes[pk.id] || [];
        if (!list.some(function (f) { return f[0] === fi && f[1] === oi; })) { list.push([fi, oi]); applied++; }
      } else {
        var own = p.packs.filter(function (x) { return x.id === pk.id; })[0];
        if (own && CX.packs.markDebatable(own, fi, oi)) applied++;
      }
    });
    return { applied: applied, skipped: skipped };
  }

  CX.book = {
    VERSION: VERSION, LEVEL_IDS: LEVEL_IDS, newProject: newProject, upgrade: upgrade, toSave: toSave,
    title: title, subtitle: subtitle, fileName: fileName, activePacks: activePacks, build: build, caseKey: caseKey, packHash: packHash,
    applyFactIssues: applyFactIssues, clearCache: function () { cache.clear(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
