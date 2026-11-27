/*
 * settings.js: the book's settings, defaults, presets and limits, plus the puzzle plan
 * (which level and grid size each puzzle number gets). Nothing here is ever stored: every
 * load starts from defaults().
 */
(function () {
  'use strict';
  window.KS = window.KS || {};

  // mix: percent of the book at each level. 'mix' takes its percentages from settings.mix.
  var LEVELS = ['easy', 'medium', 'hard', 'expert'];
  var DIFFICULTIES = [
    { key: 'easy', label: 'Easy', mix: { easy: 100, medium: 0, hard: 0, expert: 0 } },
    { key: 'medium', label: 'Medium', mix: { easy: 0, medium: 100, hard: 0, expert: 0 } },
    { key: 'hard', label: 'Hard', mix: { easy: 0, medium: 0, hard: 100, expert: 0 } },
    { key: 'expert', label: 'Expert', mix: { easy: 0, medium: 0, hard: 0, expert: 100 } },
    { key: 'easy-medium', label: 'Easy to Medium', mix: { easy: 50, medium: 50, hard: 0, expert: 0 } },
    { key: 'easy-hard', label: 'Easy to Hard', mix: { easy: 34, medium: 33, hard: 33, expert: 0 } },
    { key: 'medium-hard', label: 'Medium to Hard', mix: { easy: 0, medium: 50, hard: 50, expert: 0 } },
    { key: 'easy-expert', label: 'Easy to Expert', mix: { easy: 25, medium: 25, hard: 25, expert: 25 } },
    { key: 'hard-expert', label: 'Hard to Expert', mix: { easy: 0, medium: 0, hard: 50, expert: 50 } },
    { key: 'mix', label: 'Custom mix', mix: null }
  ];
  var LEVEL_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
  var DEFAULT_MIX = { easy: 25, medium: 35, hard: 25, expert: 15 };

  // Grid sizes. A mixed size runs each level's puzzles from the smallest grid to the
  // largest, like the "mixed grids" books.
  var SIZES = [
    { key: '5', sizes: [5], label: '5 × 5', note: 'beginner' },
    { key: '7', sizes: [7], label: '7 × 7', note: 'small' },
    { key: '10', sizes: [10], label: '10 × 10', note: 'classic' },
    { key: '12', sizes: [12], label: '12 × 12', note: '' },
    { key: '15', sizes: [15], label: '15 × 15', note: 'large' },
    { key: '20', sizes: [20], label: '20 × 20', note: 'big' },
    { key: '25', sizes: [25], label: '25 × 25', note: 'giant' },
    { key: 'mix-7-10-12', sizes: [7, 10, 12], label: 'Mixed 7, 10 and 12', note: '' },
    { key: 'mix-10-15-20', sizes: [10, 15, 20], label: 'Mixed 10, 15 and 20', note: '' },
    { key: 'mix-15-20-25', sizes: [15, 20, 25], label: 'Mixed 15, 20 and 25', note: '' }
  ];
  // Levels each single grid size offers (from the engine).
  var GRID_LEVELS = {
    5: ['easy', 'medium'],
    7: ['easy', 'medium', 'hard'],
    10: LEVELS, 12: LEVELS, 15: LEVELS, 20: LEVELS, 25: LEVELS
  };
  var PER_PAGE = [1, 2, 4, 6];
  var LABEL_STYLES = [
    { key: 'plain', label: 'Text: Puzzle 12 · Easy' },
    { key: 'badge', label: 'Number badge' }
  ];
  var HEADERS = [
    { key: 'none', label: 'None' },
    { key: 'title', label: 'Book title' },
    { key: 'level', label: 'Difficulty level (e.g. Easy Puzzles)' }
  ];

  var PRESETS = [
    { key: 'classic', label: 'Classic', note: '200 puzzles 10 × 10, 4 per page', values: { trim: '8.5x11', count: 200, perPage: 4, difficulty: 'easy-hard', size: '10' } },
    { key: 'big', label: 'Big Book', note: '600 puzzles 10 × 10, 6 per page', values: { trim: '8.5x11', count: 600, perPage: 6, difficulty: 'easy-expert', size: '10' } },
    { key: 'large', label: 'Large Print', note: '100 puzzles, 1 per page', values: { trim: '8.5x11', count: 100, perPage: 1, difficulty: 'easy-medium', size: '10' } },
    { key: 'mixed', label: 'Mixed Grids', note: '180 puzzles 10 to 20, 2 per page', values: { trim: '8.5x11', count: 180, perPage: 2, difficulty: 'easy-hard', size: 'mix-10-15-20', solutionClues: false } },
    { key: 'giant', label: 'Giant 25 × 25', note: '100 puzzles, 1 per page', values: { trim: '8.5x11', count: 100, perPage: 1, difficulty: 'medium-hard', size: '25', solutionClues: false } },
    { key: 'travel', label: 'Travel 6 x 9', note: '150 puzzles 7 × 7, 2 per page', values: { trim: '6x9', count: 150, perPage: 2, difficulty: 'easy-hard', size: '7' } }
  ];

  var LIMITS = { count: { min: 10, max: 1000 }, seed: { min: 1, max: 999999 } };

  var DEFAULT_COPYRIGHT = 'All rights reserved. No part of this book may be reproduced, stored or ' +
    'transmitted in any form or by any means without written permission from the publisher, ' +
    'except for brief quotations in a review.';
  var DEFAULT_THANKS = 'Thank you for choosing this book. We hope you enjoyed every puzzle.\n\n' +
    'If you did, please take a moment to leave a short review on Amazon. It helps other ' +
    'puzzle fans find the book and helps us make more like it.';

  function randomSeed() {
    return LIMITS.seed.min + Math.floor(Math.random() * (LIMITS.seed.max - LIMITS.seed.min + 1));
  }

  function defaults() {
    return {
      title: 'Slitherlink',
      subtitle: '',
      subtitleAuto: true,
      author: '',
      count: 200,
      difficulty: 'easy-hard',
      mix: Object.assign({}, DEFAULT_MIX), // used when difficulty is 'mix'
      size: '10',
      perPage: 4,
      trim: '8.5x11',
      labelStyle: 'plain',
      guides: false,         // light lines between the dots on puzzle pages
      solutionShade: true,   // shade the inside of the loop on solution pages
      solutionClues: true,   // print the numbers on solution pages
      pages: { title: true, copyright: true, contents: true, howTo: true, tips: true, thanks: true },
      pageNumbers: true,
      header: 'none',
      solutionRef: true,
      copyrightText: DEFAULT_COPYRIGHT,
      thanksText: DEFAULT_THANKS,
      margins: { autoInside: true, inside: 0.875, outside: 0.5, top: 0.5, bottom: 0.5 },
      // A fresh seed per visit, so two sellers starting from defaults never print the same
      // book. It is shown under Advanced and can be typed back in to reproduce a book.
      seed: randomSeed()
    };
  }

  function difficulty(key) {
    for (var i = 0; i < DIFFICULTIES.length; i++) if (DIFFICULTIES[i].key === key) return DIFFICULTIES[i];
    return DIFFICULTIES[5];
  }

  function sizeInfo(key) {
    for (var i = 0; i < SIZES.length; i++) if (SIZES[i].key === String(key)) return SIZES[i];
    return SIZES[2];
  }
  function sizesOf(key) { return sizeInfo(key).sizes; }
  function largest(key) { var s = sizesOf(key); return s[s.length - 1]; }
  function isMixedSize(key) { return sizesOf(key).length > 1; }

  // A level is offered when every grid of the size offers it.
  function levelOk(level, size) {
    return sizesOf(size).every(function (n) { return GRID_LEVELS[n].indexOf(level) >= 0; });
  }

  // A difficulty is offered at a size when it has puzzles at some level the size offers;
  // the named difficulties must not rely on a missing level at all.
  function difficultyOk(key, size) {
    var d = difficulty(key);
    if (!d.mix) return true;
    return LEVELS.every(function (l) { return !d.mix[l] || levelOk(l, size); });
  }

  // The percentages a book uses: the difficulty's own, or the custom mix. A level the size
  // does not offer hands its share to the hardest level it does offer.
  function mixOf(difficultyKey, mix, size) {
    var d = difficulty(difficultyKey);
    var m = Object.assign({}, d.mix || mix || DEFAULT_MIX);
    if (size) {
      var offered = LEVELS.filter(function (l) { return levelOk(l, size); });
      var top = offered[offered.length - 1];
      LEVELS.forEach(function (l) {
        if (!levelOk(l, size) && m[l]) { m[top] += m[l]; m[l] = 0; }
      });
    }
    return m;
  }

  function levelsOf(difficultyKey, mix, size) {
    var m = mixOf(difficultyKey, mix, size);
    return LEVELS.filter(function (l) { return m[l] > 0; });
  }

  // How the book's difficulty reads in text: "Easy to Hard" for a custom mix from easy to
  // hard, so the subtitle never says "Custom mix".
  function difficultyLabel(s) {
    if (s.difficulty !== 'mix' && difficultyOk(s.difficulty, s.size)) return difficulty(s.difficulty).label;
    var levels = levelsOf(s.difficulty, s.mix, s.size);
    return levels.length > 1
      ? LEVEL_LABEL[levels[0]] + ' to ' + LEVEL_LABEL[levels[levels.length - 1]]
      : LEVEL_LABEL[levels[0]];
  }

  function sizeText(key) {
    var list = sizesOf(key);
    if (list.length === 1) return list[0] + 'x' + list[0];
    return list[0] + 'x' + list[0] + ' to ' + list[list.length - 1] + 'x' + list[list.length - 1];
  }

  function autoSubtitle(s) {
    return s.count + ' ' + difficultyLabel(s) + ' ' + sizeText(s.size) + ' Loop Puzzles with Solutions';
  }

  function subtitle(s) {
    return s.subtitleAuto ? autoSubtitle(s) : s.subtitle;
  }

  // Splits `count` by shares (largest remainder; ties go to the earlier entry).
  function split(count, shares) {
    var out = [], given = 0, total = 0, i;
    shares.forEach(function (w) { total += w; });
    var rest = shares.map(function (w, k) {
      var exact = total ? count * w / total : 0;
      out[k] = Math.floor(exact);
      given += out[k];
      return { k: k, frac: exact - out[k], w: w };
    }).filter(function (r) { return r.w > 0; });
    rest.sort(function (a, b) { return b.frac - a.frac || a.k - b.k; });
    for (i = 0; given < count; i++, given++) out[rest[i % rest.length].k]++;
    return out;
  }

  // Puzzles per level for a book of `count`.
  function levelCounts(count, difficultyKey, mix, size) {
    var m = mixOf(difficultyKey, mix, size), parts = split(count, LEVELS.map(function (l) { return m[l]; })), out = {};
    LEVELS.forEach(function (l, i) { out[l] = parts[i]; });
    return out;
  }

  // Puzzle numbers 1..count in book order: easiest level first, and inside a level the
  // smallest grid first. A slot's identity (level, grid, ordinal) does not depend on the
  // count, so raising the count keeps every puzzle already made.
  function puzzlePlan(count, difficultyKey, mix, size) {
    var n = levelCounts(count, difficultyKey, mix, size), plan = [], grids = sizesOf(size);
    LEVELS.forEach(function (level) {
      var per = split(n[level], grids.map(function () { return 1; }));
      grids.forEach(function (g, gi) {
        for (var k = 0; k < per[gi]; k++) plan.push({ level: level, grid: g, ordinal: k });
      });
    });
    return plan;
  }

  // Percentages a user typed for a custom mix: whole numbers 0-100 that add up to 100.
  function mixError(mix) {
    var total = 0;
    for (var i = 0; i < LEVELS.length; i++) {
      var v = mix[LEVELS[i]];
      if (!(v >= 0 && v <= 100 && v === Math.floor(v))) return 'Enter whole percentages from 0 to 100.';
      total += v;
    }
    return total === 100 ? '' : 'The levels add up to ' + total + '%. Make them add up to 100%.';
  }

  // Everything that decides which puzzles a book gets; equal keys mean the same puzzles.
  function puzzleKey(s) {
    var m = mixOf(s.difficulty, s.mix, s.size);
    return [s.count, s.seed, s.size].concat(LEVELS.map(function (l) { return m[l]; })).join('|');
  }

  function matchingPreset(s) {
    for (var i = 0; i < PRESETS.length; i++) {
      var v = PRESETS[i].values;
      if (v.trim === s.trim && v.count === s.count && v.perPage === s.perPage && v.difficulty === s.difficulty &&
        v.size === String(s.size)) {
        return PRESETS[i].key;
      }
    }
    return null;
  }

  function isMixed(s) { return levelsOf(s.difficulty, s.mix, s.size).length > 1; }

  KS.Settings = {
    LEVELS: LEVELS,
    DIFFICULTIES: DIFFICULTIES,
    LEVEL_LABEL: LEVEL_LABEL,
    DEFAULT_MIX: DEFAULT_MIX,
    SIZES: SIZES,
    GRID_LEVELS: GRID_LEVELS,
    PER_PAGE: PER_PAGE,
    LABEL_STYLES: LABEL_STYLES,
    HEADERS: HEADERS,
    PRESETS: PRESETS,
    LIMITS: LIMITS,
    DEFAULT_COPYRIGHT: DEFAULT_COPYRIGHT,
    DEFAULT_THANKS: DEFAULT_THANKS,
    defaults: defaults,
    randomSeed: randomSeed,
    difficulty: difficulty,
    sizeInfo: sizeInfo,
    sizesOf: sizesOf,
    largest: largest,
    isMixedSize: isMixedSize,
    sizeText: sizeText,
    levelOk: levelOk,
    difficultyOk: difficultyOk,
    mixOf: mixOf,
    levelsOf: levelsOf,
    difficultyLabel: difficultyLabel,
    levelCounts: levelCounts,
    mixError: mixError,
    puzzleKey: puzzleKey,
    autoSubtitle: autoSubtitle,
    subtitle: subtitle,
    puzzlePlan: puzzlePlan,
    matchingPreset: matchingPreset,
    isMixed: isMixed
  };
})();
