/*
 * settings.js: the book's settings, defaults, presets and limits, plus the puzzle plan
 * (which level each puzzle number gets). Nothing here is ever stored: every load starts
 * from defaults().
 */
(function () {
  'use strict';
  window.KS = window.KS || {};

  // mix: percent of the book at each level. 'mix' takes its percentages from settings.mix.
  var LEVELS = ['easy', 'medium', 'hard'];
  var DIFFICULTIES = [
    { key: 'easy', label: 'Easy', mix: { easy: 100, medium: 0, hard: 0 } },
    { key: 'medium', label: 'Medium', mix: { easy: 0, medium: 100, hard: 0 } },
    { key: 'hard', label: 'Hard', mix: { easy: 0, medium: 0, hard: 100 } },
    { key: 'easy-hard', label: 'Easy to Hard', mix: { easy: 34, medium: 33, hard: 33 } },
    { key: 'medium-hard', label: 'Medium to Hard', mix: { easy: 0, medium: 50, hard: 50 } },
    { key: 'mix', label: 'Custom mix', mix: null }
  ];
  var LEVEL_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  var DEFAULT_MIX = { easy: 30, medium: 40, hard: 30 };

  var PRESETS = [
    { key: 'classic', label: 'Classic', note: '200 puzzles, 2 per page', values: { trim: '8.5x11', count: 200, perPage: 2, difficulty: 'easy-hard' } },
    { key: 'large', label: 'Large Print', note: '100 puzzles, 1 per page', values: { trim: '8.5x11', count: 100, perPage: 1, difficulty: 'easy-hard' } },
    { key: 'big', label: 'Big Book', note: '500 puzzles, 4 per page', values: { trim: '8.5x11', count: 500, perPage: 4, difficulty: 'medium-hard' } }
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
      title: 'Killer Sudoku',
      subtitle: '',
      subtitleAuto: true,
      author: '',
      count: 200,
      difficulty: 'easy-hard',
      mix: Object.assign({}, DEFAULT_MIX), // used when difficulty is 'mix'
      perPage: 2,
      trim: '8.5x11',
      pages: { title: true, copyright: true, howTo: true, thanks: false },
      pageNumbers: true,
      header: false,
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
    return DIFFICULTIES[3];
  }

  // The percentages a book uses: the difficulty's own, or the custom mix.
  function mixOf(difficultyKey, mix) {
    var d = difficulty(difficultyKey);
    return Object.assign({}, d.mix || mix || DEFAULT_MIX);
  }

  function levelsOf(difficultyKey, mix) {
    var m = mixOf(difficultyKey, mix);
    return LEVELS.filter(function (l) { return m[l] > 0; });
  }

  // How the book's difficulty reads in text: "Easy to Hard" for a custom mix from easy to
  // hard, so the subtitle never says "Custom mix".
  function difficultyLabel(s) {
    if (s.difficulty !== 'mix') return difficulty(s.difficulty).label;
    var levels = levelsOf(s.difficulty, s.mix);
    return levels.length > 1
      ? LEVEL_LABEL[levels[0]] + ' to ' + LEVEL_LABEL[levels[levels.length - 1]]
      : LEVEL_LABEL[levels[0]];
  }

  function autoSubtitle(s) {
    return s.count + ' ' + difficultyLabel(s) + ' Puzzles with Solutions';
  }

  function subtitle(s) {
    return s.subtitleAuto ? autoSubtitle(s) : s.subtitle;
  }

  // Puzzles per level for a book of `count`: the percentages rounded so they add up to the
  // count (largest remainder; ties go to the easier level).
  function levelCounts(count, difficultyKey, mix) {
    var m = mixOf(difficultyKey, mix), out = {}, given = 0;
    var rest = LEVELS.map(function (l, i) {
      var exact = count * m[l] / 100;
      out[l] = Math.floor(exact);
      given += out[l];
      return { level: l, frac: exact - out[l], i: i };
    }).filter(function (r) { return m[r.level] > 0; });
    rest.sort(function (a, b) { return b.frac - a.frac || a.i - b.i; });
    for (var k = 0; given < count; k++, given++) out[rest[k % rest.length].level]++;
    return out;
  }

  // Puzzle numbers 1..count in book order, easiest level first. A slot's identity (level,
  // ordinal) does not depend on the count, so raising the count keeps every puzzle already made.
  function puzzlePlan(count, difficultyKey, mix) {
    var n = levelCounts(count, difficultyKey, mix), plan = [];
    LEVELS.forEach(function (level) {
      for (var k = 0; k < n[level]; k++) plan.push({ level: level, ordinal: k });
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
    return total === 100 ? '' : 'The three levels add up to ' + total + '%. Make them add up to 100%.';
  }

  // Everything that decides which puzzles a book gets; equal keys mean the same puzzles.
  function puzzleKey(s) {
    var m = mixOf(s.difficulty, s.mix);
    return [s.count, s.seed].concat(LEVELS.map(function (l) { return m[l]; })).join('|');
  }

  function matchingPreset(s) {
    for (var i = 0; i < PRESETS.length; i++) {
      var v = PRESETS[i].values;
      if (v.trim === s.trim && v.count === s.count && v.perPage === s.perPage && v.difficulty === s.difficulty) {
        return PRESETS[i].key;
      }
    }
    return null;
  }

  function isMixed(s) { return levelsOf(s.difficulty, s.mix).length > 1; }

  KS.Settings = {
    LEVELS: LEVELS,
    DIFFICULTIES: DIFFICULTIES,
    LEVEL_LABEL: LEVEL_LABEL,
    DEFAULT_MIX: DEFAULT_MIX,
    PRESETS: PRESETS,
    LIMITS: LIMITS,
    DEFAULT_COPYRIGHT: DEFAULT_COPYRIGHT,
    DEFAULT_THANKS: DEFAULT_THANKS,
    defaults: defaults,
    randomSeed: randomSeed,
    difficulty: difficulty,
    mixOf: mixOf,
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
