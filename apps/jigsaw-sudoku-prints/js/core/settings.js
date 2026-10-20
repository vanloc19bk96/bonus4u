/*
 * settings.js: the book's settings, defaults, presets and limits, plus the puzzle plan
 * (which level each puzzle number gets). Nothing here is ever stored: every load starts
 * from defaults().
 */
(function () {
  'use strict';
  window.KS = window.KS || {};

  // mix: percent of the book at each level. 'mix' takes its percentages from settings.mix.
  var LEVELS = ['easy', 'medium', 'hard', 'extreme'];
  var DIFFICULTIES = [
    { key: 'easy', label: 'Easy', mix: { easy: 100, medium: 0, hard: 0, extreme: 0 } },
    { key: 'medium', label: 'Medium', mix: { easy: 0, medium: 100, hard: 0, extreme: 0 } },
    { key: 'hard', label: 'Hard', mix: { easy: 0, medium: 0, hard: 100, extreme: 0 } },
    { key: 'extreme', label: 'Extreme', mix: { easy: 0, medium: 0, hard: 0, extreme: 100 } },
    { key: 'easy-hard', label: 'Easy to Hard', mix: { easy: 34, medium: 33, hard: 33, extreme: 0 } },
    { key: 'medium-hard', label: 'Medium to Hard', mix: { easy: 0, medium: 50, hard: 50, extreme: 0 } },
    { key: 'easy-extreme', label: 'Easy to Extreme', mix: { easy: 25, medium: 25, hard: 25, extreme: 25 } },
    { key: 'hard-extreme', label: 'Hard to Extreme', mix: { easy: 0, medium: 0, hard: 50, extreme: 50 } },
    { key: 'mix', label: 'Custom mix', mix: null }
  ];
  var LEVEL_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', extreme: 'Extreme' };
  var DEFAULT_MIX = { easy: 25, medium: 35, hard: 25, extreme: 15 };

  // Grid sizes. 9 x 9 is the classic; 6 x 6 suits beginners and children.
  var SIZES = [
    { n: 6, label: '6 × 6', note: 'easy' },
    { n: 8, label: '8 × 8', note: '1-8' },
    { n: 9, label: '9 × 9', note: 'classic' },
    { n: 10, label: '10 × 10', note: '0-9' }
  ];
  // Levels each size offers (6 x 6 has no Extreme) and sizes the Diagonal variant needs.
  var SIZE_LEVELS = {
    6: ['easy', 'medium', 'hard'],
    8: LEVELS, 9: LEVELS, 10: LEVELS
  };
  var VARIANTS = [
    { key: 'classic', label: 'Jigsaw', note: 'rows, columns and regions' },
    { key: 'diagonal', label: 'Jigsaw Diagonal (X)', note: 'also both long diagonals', sizes: [8, 9, 10] }
  ];
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
    { key: 'classic', label: 'Classic', note: '200 puzzles, 2 per page', values: { trim: '8.5x11', count: 200, perPage: 2, difficulty: 'easy-hard', size: 9, variant: 'classic' } },
    { key: 'large', label: 'Large Print', note: '100 puzzles, 1 per page', values: { trim: '8.5x11', count: 100, perPage: 1, difficulty: 'easy-hard', size: 9, variant: 'classic' } },
    { key: 'big', label: 'Big Book', note: '600 puzzles, 6 per page', values: { trim: '8.5x11', count: 600, perPage: 6, difficulty: 'easy-extreme', size: 9, variant: 'classic' } },
    { key: 'pocket', label: 'Travel 6 x 9', note: '200 puzzles, 2 per page', values: { trim: '6x9', count: 200, perPage: 2, difficulty: 'medium-hard', size: 9, variant: 'classic' } },
    { key: 'kids', label: 'Beginner 6 x 6', note: '200 puzzles, 4 per page', values: { trim: '8.5x11', count: 200, perPage: 4, difficulty: 'easy-hard', size: 6, variant: 'classic' } },
    { key: 'diagonal', label: 'Diagonal', note: '200 puzzles, 2 per page', values: { trim: '8.5x11', count: 200, perPage: 2, difficulty: 'medium-hard', size: 9, variant: 'diagonal' } }
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
      title: 'Jigsaw Sudoku',
      subtitle: '',
      subtitleAuto: true,
      author: '',
      count: 200,
      difficulty: 'easy-hard',
      mix: Object.assign({}, DEFAULT_MIX), // used when difficulty is 'mix'
      size: 9,
      variant: 'classic',
      perPage: 2,
      trim: '8.5x11',
      labelStyle: 'plain',
      shade: false,
      pages: { title: true, copyright: true, contents: true, howTo: true, thanks: true },
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
    return DIFFICULTIES[4];
  }

  function variant(key) {
    for (var i = 0; i < VARIANTS.length; i++) if (VARIANTS[i].key === key) return VARIANTS[i];
    return VARIANTS[0];
  }

  function variantOk(variantKey, size) {
    var v = variant(variantKey);
    return !v.sizes || v.sizes.indexOf(+size) >= 0;
  }

  function levelOk(level, size) { return (SIZE_LEVELS[size] || LEVELS).indexOf(level) >= 0; }

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

  function sizeLabel(n) { return n + 'x' + n; }

  function autoSubtitle(s) {
    var kind = s.variant === 'diagonal' ? 'Diagonal Jigsaw Sudoku' : 'Irregular Sudoku';
    var size = +s.size === 9 ? '' : sizeLabel(s.size) + ' ';
    return s.count + ' ' + difficultyLabel(s) + ' ' + size + kind + ' Puzzles with Solutions';
  }

  function subtitle(s) {
    return s.subtitleAuto ? autoSubtitle(s) : s.subtitle;
  }

  // Puzzles per level for a book of `count`: the percentages rounded so they add up to the
  // count (largest remainder; ties go to the easier level).
  function levelCounts(count, difficultyKey, mix, size) {
    var m = mixOf(difficultyKey, mix, size), out = {}, given = 0;
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
  function puzzlePlan(count, difficultyKey, mix, size) {
    var n = levelCounts(count, difficultyKey, mix, size), plan = [];
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
    return total === 100 ? '' : 'The levels add up to ' + total + '%. Make them add up to 100%.';
  }

  // Everything that decides which puzzles a book gets; equal keys mean the same puzzles.
  function puzzleKey(s) {
    var m = mixOf(s.difficulty, s.mix, s.size);
    return [s.count, s.seed, s.size, s.variant].concat(LEVELS.map(function (l) { return m[l]; })).join('|');
  }

  function matchingPreset(s) {
    for (var i = 0; i < PRESETS.length; i++) {
      var v = PRESETS[i].values;
      if (v.trim === s.trim && v.count === s.count && v.perPage === s.perPage && v.difficulty === s.difficulty &&
        v.size === +s.size && v.variant === s.variant) {
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
    SIZE_LEVELS: SIZE_LEVELS,
    VARIANTS: VARIANTS,
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
    variant: variant,
    variantOk: variantOk,
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
