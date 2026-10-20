/*
 * tests.js — the developer test suite, run from tests.html in a browser.
 *
 * No Node, no build step, no test framework. Open the file and read the result.
 */
(function (global) {
  'use strict';

  var C = global.NCB_CONST;
  var U = global.NCB_UTILS;
  var RANDOM = global.NCB_RANDOM;
  var ENGINE = global.NCB_ENGINE;
  var VALIDATOR = global.NCB_VALIDATOR;
  var LAYOUT = global.NCB_LAYOUT;
  var BOOK = global.NCB_BOOK;
  var COMPLIANCE = global.NCB_COMPLIANCE;
  var PDF = global.NCB_PDF;

  var results = [];
  var currentGroup = null;

  function group(name) {
    currentGroup = { name: name, tests: [] };
    results.push(currentGroup);
    return currentGroup;
  }

  function record(name, ok, detail) {
    currentGroup.tests.push({ name: name, ok: ok, detail: detail || '' });
  }

  function ok(name, condition, detail) {
    record(name, !!condition, condition ? detail : (detail || 'expected a true condition'));
  }

  function equal(name, actual, expected) {
    var a = JSON.stringify(actual);
    var b = JSON.stringify(expected);
    record(name, a === b, a === b ? '' : 'got ' + a + ', expected ' + b);
  }

  function near(name, actual, expected, tolerance) {
    var diff = Math.abs(actual - expected);
    record(name, diff <= tolerance, diff <= tolerance ? '' : 'got ' + actual + ', expected ' + expected + ' ±' + tolerance);
  }

  function throws(name, fn) {
    try {
      fn();
      record(name, false, 'expected an error, but none was thrown');
    } catch (err) {
      record(name, true, '');
    }
  }

  /* ================================================================== *
   * Scoring
   * ================================================================== */

  function testScoring() {
    group('Scoring');
    var s = ENGINE.scoreGuess;

    equal('all wrong', s([1, 2, 3, 4], [5, 6, 7, 8]), { correctPlace: 0, correctNumberWrongPlace: 0 });
    equal('all correct positions', s([3, 6, 2, 1], [3, 6, 2, 1]), { correctPlace: 4, correctNumberWrongPlace: 0 });
    equal('all correct digits, wrong positions', s([1, 2, 3, 4], [4, 3, 2, 1]), { correctPlace: 0, correctNumberWrongPlace: 4 });
    equal('mixed score', s([4, 3, 1, 6], [3, 6, 2, 1]), { correctPlace: 0, correctNumberWrongPlace: 3 });

    // The spec's worked example: secret 1 5 1 3, guess 1 1 7 5.
    equal('duplicate digits in secret', s([1, 1, 7, 5], [1, 5, 1, 3]), { correctPlace: 1, correctNumberWrongPlace: 2 });
    equal('duplicate digits in guess', s([2, 2, 2, 5], [1, 5, 2, 3]), { correctPlace: 1, correctNumberWrongPlace: 1 });
    equal('more duplicates in guess than the secret holds', s([1, 1, 1, 1], [1, 5, 1, 3]), { correctPlace: 2, correctNumberWrongPlace: 0 });
    equal('more duplicates in secret than the guess holds', s([1, 5, 1, 3], [1, 1, 1, 1]), { correctPlace: 2, correctNumberWrongPlace: 0 });
    equal('paired duplicates, all displaced', s([2, 2, 3, 3], [3, 3, 2, 2]), { correctPlace: 0, correctNumberWrongPlace: 4 });

    ok('a score never exceeds the code length', (function () {
      var rng = RANDOM.createSeededRandom('score-bounds');
      for (var i = 0; i < 4000; i++) {
        var a = [], b = [];
        for (var p = 0; p < 4; p++) { a.push(rng.int(0, 9)); b.push(rng.int(0, 9)); }
        var r = s(a, b);
        if (r.correctPlace < 0 || r.correctNumberWrongPlace < 0) return false;
        if (r.correctPlace + r.correctNumberWrongPlace > 4) return false;
      }
      return true;
    })(), '4000 random pairs');

    throws('mismatched lengths are rejected', function () { s([1, 2, 3], [1, 2, 3, 4]); });
  }

  /* ================================================================== *
   * Solver
   * ================================================================== */

  function testSolver() {
    group('Solver');
    var space = ENGINE.createCodeSpace(C.MODE_PRESETS.classic);
    equal('classic universe is 7^4', space.size, 2401);

    var noDup = ENGINE.createCodeSpace(C.MODE_PRESETS.easy);
    equal('easy universe is 6·5·4·3 permutations', noDup.size, 360);

    var secret = [3, 6, 2, 1];
    function clue(guess) { return { guess: guess, feedback: ENGINE.scoreGuess(guess, secret) }; }

    var ambiguous = ENGINE.solve(space, [clue([1, 2, 3, 4])]);
    ok('one clue leaves many candidates', ambiguous.length > 1, ambiguous.length + ' candidates');
    ok('the true secret survives its own clue', ambiguous.some(function (c) { return ENGINE.sameCode(c, secret); }));

    var inconsistent = ENGINE.solve(space, [
      { guess: [1, 1, 1, 1], feedback: { correctPlace: 4, correctNumberWrongPlace: 0 } },
      { guess: [2, 2, 2, 2], feedback: { correctPlace: 4, correctNumberWrongPlace: 0 } }
    ]);
    equal('contradictory clues yield no solution', inconsistent.length, 0);

    // A clue set built from a generated puzzle must resolve to exactly one code.
    var rng = RANDOM.createSeededRandom('solver-unique');
    var built = ENGINE.buildPuzzle(space, rng, { secretIndex: space.indexOf(secret), minClues: 5, maxClues: 7 });
    ok('the generator produced a puzzle', !!built);
    if (built) {
      var solutions = ENGINE.solve(space, built.clues);
      equal('a generated clue set has exactly one solution', solutions.length, 1);
      equal('that solution is the intended secret', solutions[0], secret);
    }
  }

  /* ================================================================== *
   * Generator — 1000 puzzles across the presets
   * ================================================================== */

  function testGenerator(onProgress) {
    group('Generator (1000 puzzles across presets)');
    var modes = ['classic', 'easy', 'medium', 'hard'];
    var perMode = 250;
    var modeIndex = 0;

    return new Promise(function (resolve) {
      function runMode() {
        if (modeIndex >= modes.length) { resolve(); return; }

        var mode = modes[modeIndex];
        var preset = C.MODE_PRESETS[mode];
        var space = ENGINE.createCodeSpace(preset);
        var rng = RANDOM.createSeededRandom('tests-' + mode);
        var usedSecrets = {};
        var made = 0;
        var failures = [];
        var attempts = 0;

        function chunk() {
          var start = Date.now();
          while (made < perMode && attempts < perMode * 40) {
            attempts++;
            var secretIndex = rng.int(0, space.size - 1);
            if (usedSecrets[secretIndex]) continue;

            var built = ENGINE.buildPuzzle(space, rng, {
              secretIndex: secretIndex,
              minClues: preset.minClues,
              maxClues: preset.maxClues
            });
            if (!built) continue;

            usedSecrets[secretIndex] = true;
            made++;

            var puzzle = {
              id: made,
              secret: built.secret,
              guesses: built.clues.map(function (c) { return c.guess; }),
              feedback: built.clues.map(function (c) { return c.feedback; }),
              settings: preset
            };
            var check = VALIDATOR.validatePuzzle(puzzle, space, null);
            if (!check.ok && failures.length < 4) failures.push(check.issues[0]);
            if (built.clues.length < preset.minClues || built.clues.length > preset.maxClues) {
              if (failures.length < 4) failures.push('clue row count ' + built.clues.length + ' is outside ' + preset.minClues + '–' + preset.maxClues);
            }
            if (Date.now() - start > 80) break;
          }

          if (onProgress) onProgress(mode, made, perMode);

          if (made < perMode && attempts < perMode * 40) {
            requestAnimationFrame(chunk);
            return;
          }

          record(mode + ': ' + perMode + ' puzzles each with exactly one solution',
            made === perMode && failures.length === 0,
            failures.length ? failures.join('; ') : (made < perMode ? 'only produced ' + made : ''));

          modeIndex++;
          requestAnimationFrame(runMode);
        }
        chunk();
      }
      runMode();
    });
  }

  /* ================================================================== *
   * Seed determinism
   * ================================================================== */

  function fingerprint(seed, count) {
    var settings = {
      count: count,
      codeLength: 4, digitMin: 1, digitMax: 7, allowDuplicates: true,
      minClues: 5, maxClues: 7
    };
    var space = ENGINE.createCodeSpace(settings);
    var rng = RANDOM.createSeededRandom(seed);
    var used = {};
    var out = [];
    var guard = 0;

    while (out.length < count && guard < count * 50) {
      guard++;
      var index = rng.int(0, space.size - 1);
      if (used[index]) continue;
      var built = ENGINE.buildPuzzle(space, rng, { secretIndex: index, minClues: 5, maxClues: 7 });
      if (!built) continue;
      used[index] = true;
      out.push(built.secret.join('') + ':' + built.clues.map(function (c) {
        return c.guess.join('') + '-' + c.feedback.correctPlace + c.feedback.correctNumberWrongPlace;
      }).join('|'));
    }
    return out.join('/');
  }

  function testDeterminism() {
    group('Seed determinism');
    var a = fingerprint('SEED-ALPHA', 25);
    var b = fingerprint('SEED-ALPHA', 25);
    var c = fingerprint('SEED-BETA', 25);

    ok('the same seed rebuilds identical puzzle data', a === b);
    ok('a different seed produces different puzzle data', a !== c);
    ok('seed hashing is stable', RANDOM.hashSeed('SEED-ALPHA') === RANDOM.hashSeed('SEED-ALPHA'));
  }

  /* ================================================================== *
   * KDP page-count and margin rules
   * ================================================================== */

  function testKdpRules() {
    group('KDP margin brackets');
    var cases = [
      [24, 0.375], [150, 0.375], [151, 0.5], [300, 0.5],
      [301, 0.625], [500, 0.625], [501, 0.75], [700, 0.75], [701, 0.875], [828, 0.875]
    ];
    for (var i = 0; i < cases.length; i++) {
      equal('gutter at ' + cases[i][0] + ' pages', LAYOUT.getKdpMinGutterIn(cases[i][0]), cases[i][1]);
    }

    equal('design inside margin at 24 pages', rulesFor('8.5x11', 24, false).marginInsideIn, 0.5);
    equal('design inside margin at 151 pages', rulesFor('8.5x11', 151, false).marginInsideIn, 0.625);
    equal('design inside margin at 301 pages', rulesFor('8.5x11', 301, false).marginInsideIn, 0.75);
    equal('design inside margin at 501 pages', rulesFor('8.5x11', 501, false).marginInsideIn, 0.875);

    equal('an odd page count rounds up to even', LAYOUT.getEffectivePageCount(33), 34);
    equal('an even page count is unchanged', LAYOUT.getEffectivePageCount(34), 34);

    group('KDP page-count limits');
    var report = reportFor('8.5x11', 10, false);
    ok('a book below the 24-page minimum is blocked', !report.ok &&
      report.errors.join(' ').indexOf('at least 24') !== -1, report.errors[0] || '');

    // 2600 puzzles at four per page runs past the 590-page ceiling for 8.5 × 11.
    var big = reportFor('8.5x11', 2600, false);
    ok('a book over the 8.5 × 11 limit of 590 pages is blocked', !big.ok &&
      big.errors.join(' ').indexOf('590') !== -1, big.errors[0] || '');

    // The same manuscript fits at 5 × 8, whose ceiling is 828 — proof the limit
    // comes from the trim profile and not from one global number.
    var small = reportFor('5x8', 700, false);
    ok('the limit comes from the trim profile, not a global maximum',
      small.maxPages === 828 && big.maxPages === 590,
      '5 × 8 allows ' + small.maxPages + ', 8.5 × 11 allows ' + big.maxPages);
  }

  function rulesFor(trimId, pageCount, bleed) {
    var trim = C.KDP_TRIM_SIZES[trimId];
    return LAYOUT.getKdpLayoutRules({
      trimSizeId: trimId,
      trimWidthIn: trim.widthIn,
      trimHeightIn: trim.heightIn,
      pageCount: pageCount,
      bleed: bleed
    });
  }

  /** A book with `pageTarget` puzzle pages' worth of stand-in puzzles. */
  function bookFor(trimId, puzzleCount, bleed) {
    return {
      meta: { title: 'Number Code Breaker', subtitle: '', author: 'Test', seed: 'TEST' },
      print: {
        format: 'paperback', trimSizeId: trimId,
        trimWidthIn: C.KDP_TRIM_SIZES[trimId].widthIn,
        trimHeightIn: C.KDP_TRIM_SIZES[trimId].heightIn,
        bleed: bleed, ink: 'black', paper: 'white', direction: 'ltr', showPageNumbers: true
      },
      frontMatter: {
        copyright: { enabled: true, text: 'Copyright © {YEAR} {AUTHOR_OR_PUBLISHER}\n\nAll rights reserved.' },
        instructions: { enabled: true, text: 'HOW TO PLAY\n\nCrack the hidden code.\n\n● = right number, right place.\n○ = right number, wrong place.' }
      },
      puzzleSettings: {
        count: puzzleCount, puzzlesPerPage: 'auto', mode: 'classic',
        codeLength: 4, digitMin: 1, digitMax: 7, allowDuplicates: true, minClues: 5, maxClues: 7
      },
      answers: { enabled: true },
      puzzles: stubPuzzles(puzzleCount),
      pages: []
    };
  }

  function stubPuzzles(count) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var guesses = [];
      var feedback = [];
      for (var r = 0; r < 6; r++) {
        guesses.push([1, 2, 3, 4]);
        feedback.push({ correctPlace: r % 3, correctNumberWrongPlace: (r + 1) % 3 });
      }
      out.push({
        id: i + 1, secret: [3, 6, 2, 1], guesses: guesses, feedback: feedback,
        settings: { codeLength: 4, digitMin: 1, digitMax: 7, allowDuplicates: true }
      });
    }
    return out;
  }

  function reportFor(trimId, puzzleCount, bleed) {
    var b = bookFor(trimId, puzzleCount, bleed);
    var built = BOOK.buildBook(b);
    return COMPLIANCE.buildComplianceReport(b, built, {
      ok: true, uniqueCount: b.puzzles.length, total: b.puzzles.length, issues: []
    });
  }

  /* ================================================================== *
   * Page size and facing pages
   * ================================================================== */

  function testPageGeometry() {
    group('PDF page dimensions');
    var noBleed = rulesFor('8.5x11', 40, false);
    near('8.5 × 11 no bleed is 612 pt wide', noBleed.pageWidthPt, 612, 0.001);
    near('8.5 × 11 no bleed is 792 pt tall', noBleed.pageHeightPt, 792, 0.001);

    var bleed = rulesFor('8.5x11', 40, true);
    near('8.5 × 11 with bleed is 8.625 in wide', bleed.pageWidthIn, 8.625, 1e-9);
    near('8.5 × 11 with bleed is 11.25 in tall', bleed.pageHeightIn, 11.25, 1e-9);
    near('8.5 × 11 with bleed is 621 pt wide', bleed.pageWidthPt, 621, 0.001);
    near('8.5 × 11 with bleed is 810 pt tall', bleed.pageHeightPt, 810, 0.001);

    group('Facing pages');
    var rules = rulesFor('8.5x11', 40, false);
    var p1 = LAYOUT.getContentBox(rules, 1);
    var p2 = LAYOUT.getContentBox(rules, 2);
    var p3 = LAYOUT.getContentBox(rules, 3);

    equal('page 1 is a right-hand page with the gutter on the left', p1.gutterSide, 'left');
    equal('page 2 is a left-hand page with the gutter on the right', p2.gutterSide, 'right');
    equal('page 3 mirrors page 1', p3.gutterSide, 'left');
    near('page 1 content starts at the inside margin', p1.x, rules.marginInsideIn, 1e-9);
    near('page 2 content starts at the outside margin', p2.x, rules.marginOutsideIn, 1e-9);

    // Up to 150 pages the safe inside and outside margins are both 0.5 in, so the
    // two content boxes coincide by design; the offset appears once the gutter grows.
    var wide = rulesFor('8.5x11', 200, false);
    var w1 = LAYOUT.getContentBox(wide, 1);
    var w2 = LAYOUT.getContentBox(wide, 2);
    near('at 200 pages the gutter widens to 0.625 in', wide.marginInsideIn, 0.625, 1e-9);
    ok('the two facing pages are mirror images once the gutter widens',
      Math.abs(w1.x - w2.x) > 1e-9 && Math.abs(w1.w - w2.w) < 1e-9,
      'page 1 x=' + w1.x + ', page 2 x=' + w2.x);
    near('mirrored pages leave the same trailing edge', wide.pageWidthIn - (w2.x + w2.w), wide.marginInsideIn, 1e-9);

    group('Bleed placement');
    var bRules = rulesFor('8.5x11', 40, true);
    var b1 = LAYOUT.getContentBox(bRules, 1);
    var b2 = LAYOUT.getContentBox(bRules, 2);
    near('bleed is never added to the gutter on a right-hand page', b1.trimX0, 0, 1e-9);
    near('bleed sits on the outside edge of a left-hand page', b2.trimX0, C.BLEED_IN, 1e-9);
    near('bleed is added above the trim on every page', b1.trimY0, C.BLEED_IN, 1e-9);
    near('the gutter margin is unchanged by bleed', b1.x, bRules.marginInsideIn, 1e-9);

    var g1 = LAYOUT.getGutterRect(bRules, b1);
    var g2 = LAYOUT.getGutterRect(bRules, b2);
    near('odd-page gutter with bleed stays on the trim left', g1.x, b1.trimX0, 1e-9);
    near('even-page gutter with bleed stays on the trim right', g2.x + g2.w, bRules.pageWidthIn, 1e-9);
    near('even-page gutter with bleed does not overlap the safe area', g2.x, b2.x + b2.w, 1e-9);

    var answerBands = LAYOUT.getPageBands(b2, { header: true, footer: true });
    near('the running-head rule is inset from the safe-area edge',
      answerBands.header.x, b2.x + C.BOOK_LAYOUT.bodyInsetIn, 1e-9);
    ok('the running-head rule stays clear of the gutter overlay',
      answerBands.header.x + answerBands.header.w <= g2.x + 1e-9);
  }

  /* ================================================================== *
   * Every supported trim size
   * ================================================================== */

  function testAllTrimSizes() {
    group('All ' + Object.keys(C.KDP_TRIM_SIZES).length + ' supported trim sizes');

    var problems = [];
    Object.keys(C.KDP_TRIM_SIZES).forEach(function (id) {
      var trim = C.KDP_TRIM_SIZES[id];

      var plain = rulesFor(id, 100, false);
      if (Math.abs(plain.pageWidthIn - trim.widthIn) > 1e-9 || Math.abs(plain.pageHeightIn - trim.heightIn) > 1e-9) {
        problems.push(id + ': no-bleed page is not the trim size');
      }
      if (Math.abs(plain.pageWidthIn / plain.pageHeightIn - trim.widthIn / trim.heightIn) > 1e-9) {
        problems.push(id + ': preview aspect ratio does not match the trim ratio');
      }

      var withBleed = rulesFor(id, 100, true);
      if (Math.abs(withBleed.pageWidthIn - (trim.widthIn + 0.125)) > 1e-9) problems.push(id + ': bleed width is wrong');
      if (Math.abs(withBleed.pageHeightIn - (trim.heightIn + 0.25)) > 1e-9) problems.push(id + ': bleed height is wrong');

      if (plain.minPages !== trim.minPages || plain.maxPages !== trim.maxPages) {
        problems.push(id + ': page limits do not come from the trim profile');
      }

      // The safe content area must stay inside the physical page, both facings,
      // with and without bleed.
      [plain, withBleed].forEach(function (rules) {
        [1, 2].forEach(function (pageIndex) {
          var boxRect = LAYOUT.getContentBox(rules, pageIndex);
          if (boxRect.x < -1e-9 || boxRect.y < -1e-9 ||
              boxRect.x + boxRect.w > rules.pageWidthIn + 1e-9 ||
              boxRect.y + boxRect.h > rules.pageHeightIn + 1e-9) {
            problems.push(id + ': content escapes the page on page ' + pageIndex + (rules.bleed ? ' with bleed' : ''));
          }
        });
      });

      // Density either fits, or nothing fits and the layout says so.
      var box = LAYOUT.getContentBox(plain, 1);
      var bands = LAYOUT.getPageBands(box, { header: true, footer: true });
      var auto = LAYOUT.chooseDensity(bands.body, 'auto', 4, 7);
      if (!auto.layout) {
        problems.push(id + ': auto density returned no layout');
      } else if (auto.layout.fits) {
        if (auto.layout.card.digitPt < C.MIN_FONT_PT.puzzleDigit - 1e-9) {
          problems.push(id + ': accepted a density with digits under ' + C.MIN_FONT_PT.puzzleDigit + ' pt');
        }
      } else {
        var single = LAYOUT.measureDensity(bands.body, 1, 4, 7);
        if (single && single.fits) problems.push(id + ': auto rejected a density that actually fits');
      }
    });

    ok('every trim size produces correct page sizes, limits and layouts', problems.length === 0,
      problems.slice(0, 5).join('; '));

    // Report what Auto picks, as a readable summary rather than a pass/fail.
    var summary = Object.keys(C.KDP_TRIM_SIZES).map(function (id) {
      var rules = rulesFor(id, 100, false);
      var bands = LAYOUT.getPageBands(LAYOUT.getContentBox(rules, 1), { header: true, footer: true });
      var auto = LAYOUT.chooseDensity(bands.body, 'auto', 4, 7);
      return C.KDP_TRIM_SIZES[id].label + ' → ' + (auto.layout ? auto.layout.density : '?') +
        '/page @ ' + (auto.layout ? auto.layout.card.digitPt.toFixed(1) : '?') + ' pt';
    });
    record('Auto density per trim size', true, summary.join(' · '));
  }

  /* ================================================================== *
   * Page model, front matter and overflow
   * ================================================================== */

  function testBookModel() {
    group('Book and page model');
    var b = bookFor('8.5x11', 100, false);
    var built = BOOK.buildBook(b);

    var kinds = built.pages.map(function (p) { return p.kind; });
    equal('page 1 is the copyright page', kinds[0], 'copyright');
    equal('page 2 is the instruction page', kinds[1], 'instructions');
    ok('puzzle pages follow the front matter', kinds[2] === 'puzzles');
    var lastKind = kinds[kinds.length - 1];
    ok('answer pages come last, before any even-page pad',
      lastKind === 'answers' || (lastKind === 'blank' && kinds[kinds.length - 2] === 'answers'));
    ok('the book ends on an even page', built.pages.length % 2 === 0, built.pages.length + ' pages');

    ok('front matter carries no page number', !built.pages[0].showPageNumber && !built.pages[1].showPageNumber);
    ok('puzzle pages carry a page number', built.pages[2].showPageNumber);

    var indices = built.pages.map(function (p) { return p.index; });
    var sequential = indices.every(function (value, i) { return value === i + 1; });
    ok('page indices are sequential physical numbers', sequential);

    var ids = {};
    var duplicateId = built.pages.some(function (p) {
      if (ids[p.id]) return true;
      ids[p.id] = true;
      return false;
    });
    ok('page ids are unique', !duplicateId);

    var everyPuzzlePlaced = built.pages.reduce(function (sum, p) {
      return sum + (p.cards ? p.cards.length : 0);
    }, 0);
    equal('every puzzle appears exactly once', everyPuzzlePlaced, 100);

    var everyAnswerPlaced = built.pages.reduce(function (sum, p) {
      return sum + (p.answers ? p.answers.length : 0);
    }, 0);
    equal('every answer appears exactly once', everyAnswerPlaced, 100);

    ok('no page overflows its content box', built.pages.every(function (p) { return !p.overflow; }));

    // Content stays inside the safe area on every page.
    var escaped = built.pages.filter(function (p) {
      if (!p.cards) return false;
      return p.cards.some(function (card) {
        return card.box.x < p.box.x - 1e-9 ||
          card.box.y < p.box.y - 1e-9 ||
          card.box.x + card.box.w > p.box.x + p.box.w + 1e-9 ||
          card.box.y + card.box.h > p.box.y + p.box.h + 1e-9;
      });
    });
    ok('no puzzle card escapes the safe area', escaped.length === 0, escaped.length + ' page(s) affected');

    group('Front-matter overflow');
    var longBook = bookFor('5x8', 40, false);
    var filler = [];
    for (var i = 0; i < 60; i++) filler.push('Line ' + i + ': this instruction text is deliberately long so that it cannot fit on a single page.');
    longBook.frontMatter.instructions.text = 'HOW TO PLAY\n\n' + filler.join('\n\n');

    var longBuilt = BOOK.buildBook(longBook);
    var instructionPages = longBuilt.pages.filter(function (p) { return p.kind === 'instructions'; });
    ok('long instruction text continues onto extra pages', instructionPages.length > 1, instructionPages.length + ' instruction pages');
    ok('a continuation warning is raised', longBuilt.warnings.some(function (w) {
      return w.indexOf('continuation page') !== -1;
    }));

    var longKinds = longBuilt.pages.map(function (p) { return p.kind; });
    var lastInstruction = longKinds.lastIndexOf('instructions');
    var firstPuzzle = longKinds.indexOf('puzzles');
    ok('continuation pages count toward the total, so the puzzles start after them',
      firstPuzzle === lastInstruction + 1 &&
      longBuilt.pages[firstPuzzle].index === firstPuzzle + 1 &&
      longBuilt.pages[firstPuzzle].index > instructionPages.length,
      'first puzzle page is physical page ' + longBuilt.pages[firstPuzzle].index);

    group('Editable front matter');
    var edited = bookFor('8.5x11', 30, false);
    edited.meta.author = 'Jordan Vale';
    edited.frontMatter.copyright.text = 'Copyright © {YEAR} {AUTHOR_OR_PUBLISHER}';
    var editedBuilt = BOOK.buildBook(edited);
    var text = editedBuilt.pages[0].lines.map(function (line) {
      return U.lineToPlainText(line.tokens);
    }).join(' ');
    ok('the author placeholder is filled in', text.indexOf('Jordan Vale') !== -1, text);
    ok('the year placeholder is filled in', text.indexOf(String(new Date().getFullYear())) !== -1);

    group('Repagination without regenerating');
    var repaginated = bookFor('8.5x11', 100, false);
    var before = BOOK.buildBook(repaginated);
    repaginated.print.trimSizeId = '5x8';
    repaginated.print.trimWidthIn = 5;
    repaginated.print.trimHeightIn = 8;
    var after = BOOK.buildBook(repaginated);
    ok('changing the trim size repaginates the same puzzles', after.pages.length !== before.pages.length &&
      after.pages.reduce(function (s, p) { return s + (p.cards ? p.cards.length : 0); }, 0) === 100,
      before.pages.length + ' pages at 8.5 × 11, ' + after.pages.length + ' at 5 × 8');
  }

  /* ================================================================== *
   * PDF export and preflight
   * ================================================================== */

  function testPdfExport() {
    group('PDF export');
    var b = bookFor('8.5x11', 24, false);
    var built = BOOK.buildBook(b);

    return PDF.exportBookToPdf(b, built, {}).then(function (result) {
      ok('the PDF passes its own preflight', result.preflight.ok, result.preflight.issues.join('; '));
      equal('the PDF has one page per book page', result.preflight.pageCount, built.pages.length);
      near('PDF pages are 612 pt wide', result.preflight.pageWidthPt, 612, 0.001);
      near('PDF pages are 792 pt tall', result.preflight.pageHeightPt, 792, 0.001);

      ok('the PDF is produced as a file', result.blob && result.blob.size > 1000,
        result.blob ? (Math.round(result.blob.size / 1024) + ' KB') : 'no blob');

      ok('the PDF embeds its font programs', result.preflight.embeddedFonts >= 1,
        result.preflight.embeddedFonts + ' embedded TrueType program(s)');
      equal('no non-embedded font is left in the PDF resources', result.preflight.coreFontsInResources, 0);
      equal('the interior contains no raster images', result.preflight.rasterImages, 0);
      equal('the interior contains no annotations or links', result.preflight.annotations, 0);

      // The standard-14 strip must keep the file byte-for-byte the same length,
      // otherwise the cross-reference offsets would no longer line up.
      var untouched = result.doc.output();
      var stripped = PDF.stripUnusedCoreFonts(untouched);
      equal('removing the core fonts preserves the file length', stripped.length, untouched.length);
      ok('the core font dictionaries are actually removed',
        (untouched.match(/\/BaseFont\s*\/Helvetica/g) || []).length > 0 &&
        (stripped.match(/\/BaseFont\s*\/Helvetica/g) || []).length === 0);

      // A bleed book must come out at the larger physical size.
      var bleedBook = bookFor('8.5x11', 24, true);
      var bleedBuilt = BOOK.buildBook(bleedBook);
      return PDF.exportBookToPdf(bleedBook, bleedBuilt, {}).then(function (bleedResult) {
        ok('a bleed interior passes preflight', bleedResult.preflight.ok, bleedResult.preflight.issues.join('; '));
        near('bleed PDF pages are 621 pt wide', bleedResult.preflight.pageWidthPt, 621, 0.001);
        near('bleed PDF pages are 810 pt tall', bleedResult.preflight.pageHeightPt, 810, 0.001);
      });
    }).catch(function (err) {
      record('PDF export ran without throwing', false, err.message);
    });
  }

  /* ================================================================== *
   * Reporting
   * ================================================================== */

  function render() {
    var container = document.getElementById('results');
    container.innerHTML = '';

    var total = 0;
    var passed = 0;

    for (var g = 0; g < results.length; g++) {
      var groupData = results[g];
      var section = document.createElement('section');
      section.className = 'test-group';

      var groupPassed = groupData.tests.filter(function (t) { return t.ok; }).length;
      total += groupData.tests.length;
      passed += groupPassed;

      var heading = document.createElement('h2');
      heading.textContent = groupData.name;
      var tally = document.createElement('span');
      tally.className = 'tally' + (groupPassed === groupData.tests.length ? ' is-pass' : ' is-fail');
      tally.textContent = groupPassed + ' / ' + groupData.tests.length;
      heading.appendChild(tally);
      section.appendChild(heading);

      var list = document.createElement('ul');
      for (var t = 0; t < groupData.tests.length; t++) {
        var test = groupData.tests[t];
        var li = document.createElement('li');
        li.className = test.ok ? 'is-pass' : 'is-fail';
        var mark = document.createElement('span');
        mark.className = 'mark';
        mark.textContent = test.ok ? '✓' : '✕';
        var name = document.createElement('span');
        name.textContent = test.name;
        li.appendChild(mark);
        li.appendChild(name);
        if (test.detail) {
          var detail = document.createElement('span');
          detail.className = 'detail';
          detail.textContent = test.detail;
          li.appendChild(detail);
        }
        list.appendChild(li);
      }
      section.appendChild(list);
      container.appendChild(section);
    }

    var summary = document.getElementById('summary');
    summary.dataset.status = passed === total ? 'pass' : 'fail';
    summary.textContent = passed === total
      ? 'All ' + total + ' checks passed'
      : (total - passed) + ' of ' + total + ' checks failed';
  }

  function setStatus(text) {
    document.getElementById('status').textContent = text;
  }

  function run() {
    results = [];
    setStatus('Running…');
    document.getElementById('summary').dataset.status = 'busy';
    document.getElementById('summary').textContent = 'Running…';

    return Promise.resolve()
      .then(function () {
        testScoring();
        testSolver();
        testDeterminism();
        testKdpRules();
        testPageGeometry();
        testAllTrimSizes();
        testBookModel();
        render();
        setStatus('Running PDF export…');
        return testPdfExport();
      })
      .then(function () {
        render();
        setStatus('Generating 1000 puzzles…');
        return testGenerator(function (mode, done, total) {
          setStatus('Generating puzzles — ' + mode + ' ' + done + ' / ' + total);
        });
      })
      .then(function () {
        render();
        setStatus('Done.');
      })
      .catch(function (err) {
        group('Test runner');
        record('the suite ran to completion', false, err.message);
        render();
        setStatus('The suite stopped early: ' + err.message);
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('btn-rerun').addEventListener('click', run);
    run();
  });

  global.NCB_TESTS = { run: run };
})(window);
