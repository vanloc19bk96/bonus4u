/*
 * The book model: project defaults, derived numbers (clue chapters, batches, page map, margins),
 * importing answers, building puzzles with a cache, and the step states.
 */
(function (root) {
  'use strict';
  var Cozy = root.Cozy = root.Cozy || {};
  var U = Cozy.util, V = Cozy.validate, T = Cozy.text;

  var LIMITS = { chaptersMin: 30, chaptersMax: 60, wordsMin: 8, wordsMax: 15, gridMin: 11, gridMax: 15 };
  var LEVELS = ['easy', 'medium', 'hard'];
  var DEFAULT_MIX = { easy: 30, medium: 40, hard: 30 };

  function newProject(seed) {
    var now = new Date();
    return {
      app: 'cozy-mystery-word-search-book-maker', version: 1,
      seed: seed || U.randomSeed(),
      createdAt: now.toISOString(),
      setup: {
        penName: '', theme: 'Surprise me', bookTitle: '',
        chapters: 50, wordsPerPuzzle: 12, gridSize: 13, difficulty: 'medium',
        mix: Object.assign({}, DEFAULT_MIX),
        seriesName: '', bookNumber: '', imprint: '', isbn: '',
        year: now.getFullYear(), printClueList: false
      },
      plan: null, planText: '', chosenTitle: '', subtitleOverride: '',
      batchText: [], chapters: {}, epilogue: null,
      reshuffle: {}, finalReshuffle: 0,
      seriesBible: null,
      cache: { puzzles: {}, final: null },
      downloaded: false
    };
  }

  // Fill in anything missing from an older or hand-edited project file.
  function upgrade(p) {
    var base = newProject(p && p.seed);
    if (!p || typeof p !== 'object') return base;
    var out = Object.assign({}, base, p);
    out.setup = Object.assign({}, base.setup, p.setup || {});
    out.cache = Object.assign({ puzzles: {}, final: null }, p.cache || {});
    out.chapters = p.chapters || {};
    out.reshuffle = p.reshuffle || {};
    out.batchText = p.batchText || [];
    var s = out.setup;
    s.chapters = U.clamp(parseInt(s.chapters, 10) || 50, LIMITS.chaptersMin, LIMITS.chaptersMax);
    s.wordsPerPuzzle = U.clamp(parseInt(s.wordsPerPuzzle, 10) || 12, LIMITS.wordsMin, LIMITS.wordsMax);
    s.gridSize = U.clamp(parseInt(s.gridSize, 10) || 13, LIMITS.gridMin, LIMITS.gridMax);
    if (LEVELS.concat('mix').indexOf(s.difficulty) === -1) s.difficulty = 'medium';
    var mix = s.mix && typeof s.mix === 'object' ? s.mix : DEFAULT_MIX;
    s.mix = {};
    LEVELS.forEach(function (k) { s.mix[k] = U.clamp(parseInt(mix[k], 10) || 0, 0, 100); });
    return out;
  }

  function mixTotal(mix) { return LEVELS.reduce(function (t, k) { return t + (mix[k] || 0); }, 0); }

  // Whole puzzle counts per level for N puzzles. Largest-remainder rounding, so they always add up to N.
  function mixCounts(mix, N) {
    var total = mixTotal(mix);
    if (!total) return { easy: 0, medium: N, hard: 0 };
    var out = {}, rest = N;
    var parts = LEVELS.map(function (k, i) {
      var exact = N * (mix[k] || 0) / total;
      out[k] = Math.floor(exact);
      rest -= out[k];
      return { k: k, frac: exact - out[k], i: i };
    });
    parts.sort(function (a, b) { return b.frac - a.frac || a.i - b.i; });
    for (var j = 0; j < rest; j++) out[parts[j].k]++;
    return out;
  }

  // The level of every chapter puzzle (index 1..N). With Mix, puzzles get harder as the story goes on.
  function puzzleLevels(s, N) {
    var levels = [null];
    if (s.difficulty !== 'mix') {
      for (var n = 1; n <= N; n++) levels.push(s.difficulty);
      return levels;
    }
    var counts = mixCounts(s.mix, N);
    LEVELS.forEach(function (k) { for (var i = 0; i < counts[k]; i++) levels.push(k); });
    return levels;
  }

  function clueCountFor(N) { return Math.round(N * 0.42); }

  function solutionPages(N) { return Math.ceil((N + 1) / 4); }

  // KDP minimum inside margin (no bleed) by page count, in inches.
  function kdpMinInside(pages) {
    if (pages <= 150) return 0.375;
    if (pages <= 300) return 0.5;
    if (pages <= 500) return 0.625;
    if (pages <= 700) return 0.75;
    return 0.875;
  }

  function derive(project) {
    var s = project.setup;
    var N = s.chapters;
    var C = clueCountFor(N);
    var planned = V.clueChapters(N, C);
    var clueList = project.plan ? project.plan.clues : planned.map(function (n) { return { chapter: n, word: '', display: '' }; });
    var clueByChapter = {};
    clueList.forEach(function (c) { clueByChapter[c.chapter] = c; });
    var batches = [];
    for (var from = 1, i = 0; from <= N; from += 10, i++) batches.push({ index: i, from: from, to: Math.min(N, from + 9) });
    var S = solutionPages(N);
    var total = 3 + 2 * N + 3 + S + 1;
    var inside = kdpMinInside(total) + 0.375;
    var levels = puzzleLevels(s, N);
    var levelsUsed = LEVELS.filter(function (k) { return levels.indexOf(k) !== -1; });
    return {
      N: N, C: C, clueChapters: project.plan ? clueList.map(function (c) { return c.chapter; }) : planned,
      clueList: clueList, clueByChapter: clueByChapter, batches: batches,
      wordsPerPuzzle: s.wordsPerPuzzle, maxWordLen: Math.min(10, s.gridSize), gridSize: s.gridSize,
      difficulty: s.difficulty, levels: levels, levelsUsed: levelsUsed,
      mixCounts: s.difficulty === 'mix' ? mixCounts(s.mix, N) : null,
      // the final puzzle uses the hardest level in the book
      finalLevel: levelsUsed[levelsUsed.length - 1] || 'medium',
      pages: {
        title: 1, copyright: 2, howTo: 3,
        chapter: function (n) { return 4 + 2 * (n - 1); },
        puzzle: function (n) { return 5 + 2 * (n - 1); },
        notebook: 4 + 2 * N, final: 5 + 2 * N, epilogue: 6 + 2 * N,
        solutionsStart: 7 + 2 * N, solutionPages: S, closing: 7 + 2 * N + S, total: total
      },
      insideMarginIn: inside, kdpMinInsideIn: kdpMinInside(total)
    };
  }

  function title(project) {
    if (project.chosenTitle) return project.chosenTitle;
    if (project.setup.bookTitle) return project.setup.bookTitle.trim();
    if (project.plan && project.plan.titles && project.plan.titles[0]) return project.plan.titles[0];
    return 'Your Cozy Mystery';
  }

  function subtitle(project) {
    if (project.subtitleOverride) return project.subtitleOverride;
    return project.plan ? project.plan.subtitle : 'A Cozy Mystery Word Search Book';
  }

  // ---------- importing answers ----------
  // base: an earlier plan (or a draft that still has problems) that a partial fix answer merges onto
  function importPlan(project, text, base) {
    var raw = V.pickAnswer(text, ['outline', 'clues', 'suspects', 'titles', 'killer']);
    if (!raw) {
      return { ok: false, issues: [V.issue('error', 'Answer', 'We could not find the story plan in what you pasted. Copy the AI’s whole reply and paste it again.', { fix: 'none' })] };
    }
    var d = derive(project);
    base = base === undefined ? project.plan : base;
    var full = raw.outline && raw.outline.length >= d.N * 0.6 && raw.suspects;
    var isPartial = !!base && !full;
    var res = V.checkPlan(raw, { chapters: d.N, clueCount: d.C, bookTitle: project.setup.bookTitle }, isPartial ? base : null);
    return { ok: res.ok, plan: res.plan, issues: res.issues, partial: isPartial };
  }

  function applyPlan(project, plan) {
    project.plan = plan;
    if (project.setup.bookTitle) project.chosenTitle = project.setup.bookTitle.trim();
    else if (!project.chosenTitle || plan.titles.indexOf(project.chosenTitle) === -1) project.chosenTitle = plan.titles[0] || '';
    project.cache.final = null;
  }

  function importBatch(project, bi, text) {
    var d = derive(project);
    var b = d.batches[bi];
    var raw = V.pickAnswer(text, ['chapters', 'epilogue']);
    if (!raw) {
      return { ok: false, issues: [V.issue('error', 'Answer', 'We could not find any chapters in what you pasted. Copy the AI’s whole reply and paste it again.', { fix: 'none' })] };
    }
    // a story plan pasted into a chapters box: say so instead of "no chapters found"
    if (!raw.chapters && !raw.epilogue && (raw.outline || raw.clues || raw.suspects)) {
      var samePlan = project.plan && raw.killer && String(raw.killer).trim() === project.plan.killer;
      return { ok: false, issues: [V.issue('error', 'Answer', 'This is a story plan (the answer for step 2), not chapters. ' +
        (samePlan ? '' : 'It is also a different story from the one in step 2. To use this story instead, paste it into the Story plan box in step 2. Otherwise, ') +
        (samePlan ? 'Click' : 'click') + ' “Copy prompt for part ' + (bi + 1) + '” above, paste that prompt into the same AI chat, then paste the AI’s new reply here. It will contain chapters ' + b.from + ' to ' + b.to + '.', { fix: 'none' })] };
    }
    var isLast = bi === d.batches.length - 1;
    var res = V.checkBatch(raw, { N: d.N, from: b.from, to: b.to, isLast: isLast });
    return { ok: !res.issues.some(function (i) { return i.level === 'error'; }), chapters: res.chapters, epilogue: res.epilogue, issues: res.issues };
  }

  function applyBatch(project, res) {
    Object.keys(res.chapters).forEach(function (n) {
      var c = res.chapters[n];
      if (!c.title && project.chapters[n]) c.title = project.chapters[n].title;
      if (!c.paragraphs.length && project.chapters[n]) c.paragraphs = project.chapters[n].paragraphs;
      project.chapters[n] = c;
    });
    if (res.epilogue) project.epilogue = res.epilogue;
  }

  // ---------- word lists and puzzles ----------
  function prepareAll(project, d) {
    var out = {};
    for (var n = 1; n <= d.N; n++) {
      var ch = project.chapters[n];
      if (!ch) continue;
      out[n] = V.prepareWords(ch, { wordsPerPuzzle: d.wordsPerPuzzle, maxLen: d.maxWordLen, clue: d.clueByChapter[n] && d.clueByChapter[n].word ? d.clueByChapter[n] : null });
    }
    return out;
  }

  function puzzleKey(project, d, n, prep) {
    var placed = prep.list.filter(function (x) { return !x.isClue; }).map(function (x) { return x.norm; });
    var hidden = (prep.list.find(function (x) { return x.isClue; }) || {}).norm || null;
    return {
      key: U.hashHex(JSON.stringify([project.seed, n, project.reshuffle[n] || 0, d.levels[n], d.gridSize, placed, hidden])),
      placed: placed, hidden: hidden
    };
  }

  // Returns the cached puzzle when its inputs did not change, otherwise builds it.
  function puzzleFor(project, d, n, prep) {
    if (!prep || prep.usable < d.wordsPerPuzzle) return null;
    var k = puzzleKey(project, d, n, prep);
    var cached = project.cache.puzzles[n];
    if (cached && cached.key === k.key) return cached;
    var res = Cozy.puzzle.buildRegular({
      words: k.placed, hidden: k.hidden, size: d.gridSize, dirs: Cozy.puzzle.DIFFICULTY_DIRS[d.levels[n]],
      seed: project.seed + '|p' + n + '|' + (project.reshuffle[n] || 0)
    });
    res.key = k.key;
    project.cache.puzzles[n] = res;
    return res;
  }

  function needsBuild(project, d, n, prep) {
    if (!prep || prep.usable < d.wordsPerPuzzle) return false;
    var cached = project.cache.puzzles[n];
    return !cached || cached.key !== puzzleKey(project, d, n, prep).key;
  }

  function messageForms(killer) {
    var name = T.normalizeWord(killer);
    var spacedName = T.stripAccents(killer).toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
    return [
      { text: 'THEKILLERIS' + name, spaced: 'THE KILLER IS ' + spacedName },
      { text: 'ITWAS' + name, spaced: 'IT WAS ' + spacedName },
      { text: name, spaced: spacedName }
    ];
  }

  function finalKey(project, d) {
    var p = project.plan;
    return U.hashHex(JSON.stringify([project.seed, 'final', project.finalReshuffle || 0, d.finalLevel, p.clues.map(function (c) { return c.word; }), p.killer]));
  }

  function finalFor(project, d) {
    if (!project.plan || !project.plan.killer || !project.plan.clues.length) return null;
    var key = finalKey(project, d);
    var cached = project.cache.final;
    if (cached && cached.key === key) return cached;
    var res = Cozy.puzzle.buildFinal({
      words: project.plan.clues.map(function (c) { return c.word; }),
      messages: messageForms(project.plan.killer), dirs: Cozy.puzzle.DIFFICULTY_DIRS[d.finalLevel],
      seed: project.seed + '|final|' + (project.finalReshuffle || 0)
    });
    res.key = key;
    project.cache.final = res;
    return res;
  }

  function finalNeedsBuild(project, d) {
    if (!project.plan || !project.plan.killer) return false;
    return !project.cache.final || project.cache.final.key !== finalKey(project, d);
  }

  // Drop cache entries for chapters that no longer exist (keeps saved projects small).
  function pruneCache(project, d) {
    Object.keys(project.cache.puzzles).forEach(function (n) { if (+n > d.N || !project.chapters[n]) delete project.cache.puzzles[n]; });
  }

  // ---------- batch status ----------
  function batchStatus(project, d, bi, prepared, fit) {
    var b = d.batches[bi];
    var issues = [];
    var have = 0;
    for (var n = b.from; n <= b.to; n++) {
      var ch = project.chapters[n];
      if (!ch) continue;
      have++;
      if (!ch.title) issues.push(V.issue('error', 'Chapter ' + n, 'Chapter ' + n + ' has no title.', { n: n }));
      if (!ch.paragraphs || !ch.paragraphs.length) issues.push(V.issue('error', 'Chapter ' + n, 'Chapter ' + n + ' has no text.', { n: n }));
      if (prepared[n]) prepared[n].notes.forEach(function (x) { issues.push(x); });
      issues = issues.concat(V.chapterContentIssues(ch, { clueByChapter: d.clueByChapter, N: d.N }));
      var pz = project.cache.puzzles[n];
      if (pz && pz.ok === false) issues.push(V.issue('error', 'Chapter ' + n, 'The puzzle for chapter ' + n + ' could not be built: ' + pz.reason + ' Try fewer or shorter words.', { n: n }));
      if (fit && fit[n] && !fit[n].fits) {
        issues.push(V.issue('error', 'Chapter ' + n, 'Chapter ' + n + ' is too long for one page. Cut about ' + fit[n].cut + ' words.', { n: n, fix: 'length' }));
      }
    }
    if (have && have < b.to - b.from + 1) {
      for (var m = b.from; m <= b.to; m++) if (!project.chapters[m]) issues.push(V.issue('error', 'Chapter ' + m, 'Chapter ' + m + ' is missing.', { n: m }));
    }
    var isLast = bi === d.batches.length - 1;
    if (isLast && have) {
      if (!project.epilogue) issues.push(V.issue('error', 'Epilogue', 'The epilogue is missing.', { fix: 'epilogue' }));
      else {
        issues = issues.concat(V.epilogueIssues(project.epilogue, { killer: project.plan && project.plan.killer }));
        if (fit && fit.epilogue && !fit.epilogue.fits) issues.push(V.issue('error', 'Epilogue', 'The epilogue is too long for one page. Cut about ' + fit.epilogue.cut + ' words.', { fix: 'epilogue' }));
      }
    }
    var state = !have ? 'todo' : (issues.some(function (i) { return i.level === 'error'; }) ? 'fix' : 'done');
    return { state: state, have: have, size: b.to - b.from + 1, issues: issues };
  }

  Cozy.book = {
    LIMITS: LIMITS, LEVELS: LEVELS, mixTotal: mixTotal, mixCounts: mixCounts, newProject: newProject, upgrade: upgrade, derive: derive, clueCountFor: clueCountFor,
    title: title, subtitle: subtitle, importPlan: importPlan, applyPlan: applyPlan, importBatch: importBatch,
    applyBatch: applyBatch, prepareAll: prepareAll, puzzleFor: puzzleFor, needsBuild: needsBuild,
    finalFor: finalFor, finalNeedsBuild: finalNeedsBuild, messageForms: messageForms, pruneCache: pruneCache,
    batchStatus: batchStatus, kdpMinInside: kdpMinInside, solutionPages: solutionPages
  };
})(typeof window !== 'undefined' ? window : globalThis);
