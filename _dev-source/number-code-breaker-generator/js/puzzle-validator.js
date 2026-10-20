/*
 * puzzle-validator.js — independent re-verification of generated puzzles.
 *
 * The generator already tracks its surviving candidates, but a puzzle is only
 * accepted after it has been re-solved from scratch against the full code
 * space. A puzzle that fails here never reaches the PDF.
 */
(function (global) {
  'use strict';

  var ENGINE = global.NCB_ENGINE;
  var U = global.NCB_UTILS;

  /**
   * Check one puzzle against every rule in the spec's quality list.
   *
   * @returns {{ok: boolean, issues: string[], solutionCount: number}}
   */
  function validatePuzzle(puzzle, space, seenSecrets) {
    var issues = [];
    var L = space.codeLength;
    var label = 'Puzzle ' + U.padNumber(puzzle.id, 3);
    var i;

    function digitsAllowed(code) {
      for (var k = 0; k < code.length; k++) {
        if (typeof code[k] !== 'number' || !isFinite(code[k])) return false;
        if (code[k] < space.digitMin || code[k] > space.digitMax) return false;
      }
      return true;
    }

    function hasRepeats(code) {
      var seen = {};
      for (var k = 0; k < code.length; k++) {
        if (seen[code[k]]) return true;
        seen[code[k]] = true;
      }
      return false;
    }

    // --- secret ---
    if (!puzzle.secret || puzzle.secret.length !== L) {
      issues.push(label + ': the hidden code has the wrong length.');
      return { ok: false, issues: issues, solutionCount: 0 };
    }
    if (!digitsAllowed(puzzle.secret)) issues.push(label + ': the hidden code uses digits outside the allowed range.');
    if (!space.allowDuplicates && hasRepeats(puzzle.secret)) {
      issues.push(label + ': the hidden code repeats a digit, but repeated digits are turned off.');
    }
    if (seenSecrets) {
      var key = puzzle.secret.join(',');
      if (seenSecrets[key]) issues.push(label + ': this hidden code already appears earlier in the book.');
      seenSecrets[key] = true;
    }

    // --- clue rows ---
    if (!puzzle.guesses || !puzzle.feedback || puzzle.guesses.length !== puzzle.feedback.length) {
      issues.push(label + ': clue rows and clue results do not match up.');
      return { ok: false, issues: issues, solutionCount: 0 };
    }
    if (puzzle.guesses.length === 0) issues.push(label + ': the puzzle has no clue rows.');

    var seenGuesses = {};
    for (i = 0; i < puzzle.guesses.length; i++) {
      var guess = puzzle.guesses[i];
      var rowLabel = label + ', row ' + (i + 1);

      if (!guess || guess.length !== L) { issues.push(rowLabel + ': wrong number of positions.'); continue; }
      if (!digitsAllowed(guess)) issues.push(rowLabel + ': uses digits outside the allowed range.');
      if (!space.allowDuplicates && hasRepeats(guess)) issues.push(rowLabel + ': repeats a digit, but repeated digits are turned off.');

      var gk = guess.join(',');
      if (seenGuesses[gk]) issues.push(rowLabel + ': duplicates an earlier clue row.');
      seenGuesses[gk] = true;

      if (ENGINE.sameCode(guess, puzzle.secret)) issues.push(rowLabel + ': is identical to the hidden code.');

      var expected = ENGINE.scoreGuess(guess, puzzle.secret);
      var actual = puzzle.feedback[i];
      if (!actual || actual.correctPlace !== expected.correctPlace ||
          actual.correctNumberWrongPlace !== expected.correctNumberWrongPlace) {
        issues.push(rowLabel + ': the printed clue result does not match the hidden code.');
      }
      if (expected.correctPlace === L) issues.push(rowLabel + ': gives away every position.');
    }

    // --- uniqueness, re-solved from scratch ---
    var clues = [];
    for (i = 0; i < puzzle.guesses.length; i++) {
      clues.push({ guess: puzzle.guesses[i], feedback: puzzle.feedback[i] });
    }
    var solutions = ENGINE.solve(space, clues, 3);

    if (solutions.length === 0) {
      issues.push(label + ' has no possible solution — the clues contradict each other.');
    } else if (solutions.length > 1) {
      issues.push(label + ' is ambiguous and has ' + (solutions.length >= 3 ? '3 or more' : solutions.length) + ' possible solutions.');
    } else if (!ENGINE.sameCode(solutions[0], puzzle.secret)) {
      issues.push(label + ' resolves to a different code than the one in the answer key.');
    }

    return { ok: issues.length === 0, issues: issues, solutionCount: solutions.length };
  }

  /**
   * Validate a whole book, yielding to the browser between chunks.
   *
   * @returns {Promise<{ok, uniqueCount, total, issues}>}
   */
  function validateBook(puzzles, space, hooks) {
    hooks = hooks || {};
    var seenSecrets = {};
    var issues = [];
    var uniqueCount = 0;
    var index = 0;

    return new Promise(function (resolve, reject) {
      function step() {
        if (hooks.shouldCancel && hooks.shouldCancel()) {
          reject(new Error('Validation cancelled.'));
          return;
        }
        var sliceStart = Date.now();

        while (index < puzzles.length) {
          var result = validatePuzzle(puzzles[index], space, seenSecrets);
          if (result.solutionCount === 1 && result.ok) uniqueCount++;
          if (result.issues.length) {
            // Keep the report readable on very broken books.
            for (var i = 0; i < result.issues.length && issues.length < 40; i++) issues.push(result.issues[i]);
          }
          index++;
          if (Date.now() - sliceStart > 60) break;
        }

        if (hooks.onProgress) hooks.onProgress(index, puzzles.length);

        if (index < puzzles.length) {
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(step);
          else setTimeout(step, 0);
        } else {
          resolve({ ok: issues.length === 0, uniqueCount: uniqueCount, total: puzzles.length, issues: issues });
        }
      }
      step();
    });
  }

  global.NCB_VALIDATOR = {
    validatePuzzle: validatePuzzle,
    validateBook: validateBook
  };
})(window);
