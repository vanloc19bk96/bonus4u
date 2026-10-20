/*
 * puzzle-engine.js — scoring, the candidate universe, the solver, and the
 * unique-solution puzzle generator.
 *
 * Uniqueness is proved, never assumed: every puzzle is checked against a
 * complete enumeration of the codes its settings allow.
 */
(function (global) {
  'use strict';

  var C = global.NCB_CONST;
  var RANDOM = global.NCB_RANDOM;

  /** Guesses evaluated per clue round. */
  var POOL_MAX = 60;
  /** Candidate sample used to rank guesses (the real filter always uses all). */
  var EVAL_SAMPLE = 800;
  /** Raw enumeration ceiling before duplicate filtering. */
  var RAW_ENUMERATION_MAX = 2000000;
  /** Attempts before a puzzle request is abandoned. */
  var MAX_PUZZLE_ATTEMPTS = 40;

  /* ------------------------------------------------------------------ *
   * Scoring
   * ------------------------------------------------------------------ */

  /**
   * Duplicate-safe Mastermind scoring.
   *
   * correctPlace           — digits right in the right position
   * correctNumberWrongPlace — remaining digits present but misplaced
   *
   * Counting each guessed digit with includes() over-counts duplicates, so the
   * shared total is taken as the sum of per-digit min(secretFreq, guessFreq).
   */
  function scoreGuess(guess, secret) {
    if (!guess || !secret || guess.length !== secret.length) {
      throw new Error('scoreGuess: guess and secret must be the same length.');
    }

    var correctPlace = 0;
    var secretFreq = {};
    var guessFreq = {};
    var i;

    for (i = 0; i < secret.length; i++) {
      if (guess[i] === secret[i]) correctPlace++;
      secretFreq[secret[i]] = (secretFreq[secret[i]] || 0) + 1;
      guessFreq[guess[i]] = (guessFreq[guess[i]] || 0) + 1;
    }

    var common = 0;
    for (var digit in guessFreq) {
      if (!Object.prototype.hasOwnProperty.call(guessFreq, digit)) continue;
      var inSecret = secretFreq[digit] || 0;
      common += Math.min(inSecret, guessFreq[digit]);
    }

    return { correctPlace: correctPlace, correctNumberWrongPlace: common - correctPlace };
  }

  /* ------------------------------------------------------------------ *
   * Code space
   * ------------------------------------------------------------------ */

  function codeSpaceSize(settings) {
    var base = settings.digitMax - settings.digitMin + 1;
    var L = settings.codeLength;
    if (settings.allowDuplicates) return Math.pow(base, L);
    if (L > base) return 0;
    var n = 1;
    for (var i = 0; i < L; i++) n *= (base - i);
    return n;
  }

  /**
   * Explain why a configuration cannot be enumerated, or null if it is fine.
   */
  function describeCodeSpaceProblem(settings) {
    var base = settings.digitMax - settings.digitMin + 1;
    var L = settings.codeLength;

    if (base < 2) return 'The digit range must contain at least two digits.';
    if (!settings.allowDuplicates && L > base) {
      return 'With repeated digits turned off, the code length (' + L + ') cannot exceed the number of ' +
        'available digits (' + base + '). Widen the digit range or shorten the code.';
    }

    var raw = Math.pow(base, L);
    var size = codeSpaceSize(settings);
    if (raw > RAW_ENUMERATION_MAX || size > C.PUZZLE_LIMITS.maxUniverse) {
      return 'This configuration allows ' + size.toLocaleString() + ' possible codes. Uniqueness is proved by ' +
        'checking every possible code, which stays reliable up to ' + C.PUZZLE_LIMITS.maxUniverse.toLocaleString() +
        '. Shorten the code length or narrow the digit range.';
    }
    return null;
  }

  /**
   * Enumerate every code the settings permit.
   *
   * Codes are held as indices into flat typed arrays so the solver can scan
   * hundreds of thousands of them without allocating.
   */
  function createCodeSpace(settings) {
    var problem = describeCodeSpaceProblem(settings);
    if (problem) throw new Error(problem);

    var L = settings.codeLength;
    var digitMin = settings.digitMin;
    var base = settings.digitMax - digitMin + 1;
    var allowDuplicates = !!settings.allowDuplicates;
    var raw = Math.pow(base, L);

    var size = codeSpaceSize(settings);
    var digits = new Uint8Array(size * L);
    var freqs = new Uint8Array(size * base);

    var work = new Uint8Array(L);
    var seen = new Uint8Array(base);
    var count = 0;

    for (var n = 0; n < raw; n++) {
      var rest = n;
      var ok = true;
      var p;
      for (p = 0; p < base; p++) seen[p] = 0;

      for (p = L - 1; p >= 0; p--) {
        var d = rest % base;
        rest = (rest - d) / base;
        work[p] = d;
        if (!allowDuplicates) {
          if (seen[d]) { ok = false; break; }
          seen[d] = 1;
        }
      }
      if (!ok) continue;

      var dOff = count * L;
      var fOff = count * base;
      for (p = 0; p < L; p++) {
        digits[dOff + p] = work[p] + digitMin;
        freqs[fOff + work[p]]++;
      }
      count++;
    }

    return {
      codeLength: L,
      digitMin: digitMin,
      digitMax: settings.digitMax,
      base: base,
      allowDuplicates: allowDuplicates,
      size: count,
      digits: digits,
      freqs: freqs,

      /** Code at `index` as a plain array of digit values. */
      decode: function (index) {
        var out = new Array(L);
        var off = index * L;
        for (var i = 0; i < L; i++) out[i] = digits[off + i];
        return out;
      },

      /** Index of a plain digit array, or -1 when the code is not allowed. */
      indexOf: function (code) {
        for (var i = 0; i < count; i++) {
          var off = i * L;
          var match = true;
          for (var p = 0; p < L; p++) {
            if (digits[off + p] !== code[p]) { match = false; break; }
          }
          if (match) return i;
        }
        return -1;
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * Fast index-based scoring
   * ------------------------------------------------------------------ */

  /** Pack a score into one integer so it can be compared cheaply. */
  function packScore(correctPlace, wrongPlace, codeLength) {
    return correctPlace * (codeLength + 1) + wrongPlace;
  }

  function unpackScore(packed, codeLength) {
    var correctPlace = Math.floor(packed / (codeLength + 1));
    return { correctPlace: correctPlace, correctNumberWrongPlace: packed - correctPlace * (codeLength + 1) };
  }

  /** Frequency table of a guess, indexed by (digit - digitMin). */
  function guessFrequency(space, guessDigits, out) {
    var freq = out || new Uint8Array(space.base);
    for (var i = 0; i < space.base; i++) freq[i] = 0;
    for (var p = 0; p < space.codeLength; p++) freq[guessDigits[p] - space.digitMin]++;
    return freq;
  }

  /** Packed score of the code at `candIndex` against a guess. */
  function scoreIndex(space, candIndex, guessDigits, gFreq) {
    var L = space.codeLength;
    var base = space.base;
    var dOff = candIndex * L;
    var correctPlace = 0;
    var i;

    for (i = 0; i < L; i++) {
      if (space.digits[dOff + i] === guessDigits[i]) correctPlace++;
    }

    var fOff = candIndex * base;
    var common = 0;
    for (i = 0; i < base; i++) {
      var a = space.freqs[fOff + i];
      var b = gFreq[i];
      common += a < b ? a : b;
    }

    return packScore(correctPlace, common - correctPlace, L);
  }

  /* ------------------------------------------------------------------ *
   * Solver
   * ------------------------------------------------------------------ */

  /**
   * Every code consistent with all clues.
   *
   * @param {object} space
   * @param {Array} clues  [{ guess: number[], feedback: {correctPlace, correctNumberWrongPlace} }]
   * @param {number} [limit] stop early once this many solutions are found
   * @returns {number[][]} matching codes
   */
  function solve(space, clues, limit) {
    var prepared = [];
    var i;
    for (i = 0; i < clues.length; i++) {
      var clue = clues[i];
      prepared.push({
        digits: clue.guess,
        freq: guessFrequency(space, clue.guess),
        packed: packScore(clue.feedback.correctPlace, clue.feedback.correctNumberWrongPlace, space.codeLength)
      });
    }

    var out = [];
    for (var c = 0; c < space.size; c++) {
      var ok = true;
      for (i = 0; i < prepared.length; i++) {
        if (scoreIndex(space, c, prepared[i].digits, prepared[i].freq) !== prepared[i].packed) { ok = false; break; }
      }
      if (ok) {
        out.push(space.decode(c));
        if (limit && out.length >= limit) return out;
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Generator
   * ------------------------------------------------------------------ */

  function sameCode(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function formatCode(code) { return code.join(' '); }

  /**
   * Build one puzzle with exactly one solution.
   *
   * Clues are chosen by information reduction, paced so the candidate set
   * collapses to a single code on the last planned row rather than three rows
   * early. Returns null when this secret could not be made unique in budget.
   */
  function buildPuzzle(space, rng, options) {
    var L = space.codeLength;
    var minClues = options.minClues;
    var maxClues = options.maxClues;
    var secretIndex = options.secretIndex;
    var secret = space.decode(secretIndex);

    var targetRows = rng.int(minClues, maxClues);
    var maxZeroClues = Math.max(1, Math.floor(targetRows / 4));

    // Working candidate set, compacted in place as clues are added.
    var candidates = new Int32Array(space.size);
    for (var i = 0; i < space.size; i++) candidates[i] = i;
    var n = space.size;

    var clues = [];
    var usedGuesses = {};
    var zeroClues = 0;
    var gFreq = new Uint8Array(space.base);
    var secretFreqScratch = new Uint8Array(space.base);

    usedGuesses[secretIndex] = true; // a clue must never be the secret itself

    while (clues.length < maxClues) {
      var rowsPlanned = Math.max(0, targetRows - clues.length - 1);
      var isFinalPlannedRow = rowsPlanned === 0 && clues.length + 1 >= minClues;

      // Geometric pacing: aim to reach exactly one candidate on the last row.
      var targetRemaining = rowsPlanned > 0 ? Math.pow(n, rowsPlanned / (rowsPlanned + 1)) : 1;

      var pool = buildGuessPool(space, rng, candidates, n, usedGuesses);
      if (!pool.length) break;

      var evalSet = candidates;
      var evalCount = n;
      var scale = 1;
      if (n > EVAL_SAMPLE) {
        evalSet = sampleIndices(rng, candidates, n, EVAL_SAMPLE);
        evalCount = EVAL_SAMPLE;
        scale = n / EVAL_SAMPLE;
      }

      var best = null;
      var bestFallback = null;

      for (var gi = 0; gi < pool.length; gi++) {
        var guessIndex = pool[gi];
        var guess = space.decode(guessIndex);
        guessFrequency(space, guess, gFreq);

        var packed = scoreIndex(space, secretIndex, guess, gFreq);
        var score = unpackScore(packed, L);

        var survivors = 0;
        for (var e = 0; e < evalCount; e++) {
          if (scoreIndex(space, evalSet[e], guess, gFreq) === packed) survivors++;
        }
        var estimated = Math.max(1, survivors * scale);

        var isZeroClue = score.correctPlace === 0 && score.correctNumberWrongPlace === 0;
        var candidate = {
          index: guessIndex,
          guess: guess,
          packed: packed,
          score: score,
          estimated: estimated,
          isZeroClue: isZeroClue,
          cost: Math.abs(Math.log(estimated) - Math.log(targetRemaining))
        };

        // A guess that reveals every position would print the answer.
        if (score.correctPlace === L) continue;

        if (!bestFallback || candidate.cost < bestFallback.cost) bestFallback = candidate;
        if (isZeroClue && zeroClues >= maxZeroClues) continue;
        if (!best || candidate.cost < best.cost) best = candidate;
      }

      var chosen = best || bestFallback;
      if (!chosen) break;

      // Apply the clue for real against the full candidate set.
      guessFrequency(space, chosen.guess, gFreq);
      var write = 0;
      for (var c = 0; c < n; c++) {
        if (scoreIndex(space, candidates[c], chosen.guess, gFreq) === chosen.packed) {
          candidates[write++] = candidates[c];
        }
      }
      n = write;

      clues.push({ guess: chosen.guess, feedback: chosen.score });
      usedGuesses[chosen.index] = true;
      if (chosen.isZeroClue) zeroClues++;

      if (n === 1 && clues.length >= minClues) break;
      if (n === 1) {
        // Unique early: top up with clues that add no new information.
        while (clues.length < minClues) {
          var filler = pickFillerClue(space, rng, secret, secretIndex, usedGuesses, zeroClues, maxZeroClues, secretFreqScratch);
          if (!filler) break;
          clues.push({ guess: filler.guess, feedback: filler.score });
          usedGuesses[filler.index] = true;
          if (filler.score.correctPlace === 0 && filler.score.correctNumberWrongPlace === 0) zeroClues++;
        }
        break;
      }
      if (isFinalPlannedRow && n > 1) {
        // Pacing missed; keep going with whatever rows remain in the budget.
        targetRows = maxClues;
      }
    }

    if (n !== 1 || clues.length < minClues) return null;
    if (!sameCode(space.decode(candidates[0]), secret)) return null;

    return { secret: secret, clues: clues };
  }

  /** Guesses to evaluate this round: mostly live candidates, plus some variety. */
  function buildGuessPool(space, rng, candidates, n, usedGuesses) {
    var pool = [];
    var seen = {};
    var i;

    function add(index) {
      if (usedGuesses[index] || seen[index]) return;
      seen[index] = true;
      pool.push(index);
    }

    if (n <= POOL_MAX) {
      for (i = 0; i < n; i++) add(candidates[i]);
    } else {
      for (i = 0; i < POOL_MAX; i++) add(candidates[rng.int(0, n - 1)]);
    }

    // A handful of codes from outside the surviving set often splits it better.
    var extras = Math.min(20, Math.max(6, Math.floor(POOL_MAX / 3)));
    for (i = 0; i < extras; i++) add(rng.int(0, space.size - 1));

    return pool;
  }

  /** A seeded random subset of the live candidates, used only for ranking. */
  function sampleIndices(rng, candidates, n, sampleSize) {
    var out = new Int32Array(sampleSize);
    for (var i = 0; i < sampleSize; i++) out[i] = candidates[rng.int(0, n - 1)];
    return out;
  }

  /**
   * An extra clue for a puzzle that became unique before the minimum row count.
   * Any valid guess keeps the solution set at one, so this only has to avoid
   * revealing rows, duplicates and a pile of trivial zero-match rows.
   */
  function pickFillerClue(space, rng, secret, secretIndex, usedGuesses, zeroClues, maxZeroClues, freqScratch) {
    var L = space.codeLength;
    for (var attempt = 0; attempt < 200; attempt++) {
      var index = rng.int(0, space.size - 1);
      if (usedGuesses[index] || index === secretIndex) continue;

      var guess = space.decode(index);
      guessFrequency(space, guess, freqScratch);
      var packed = scoreIndex(space, secretIndex, guess, freqScratch);
      var score = unpackScore(packed, L);

      if (score.correctPlace === L) continue;
      if (score.correctPlace === 0 && score.correctNumberWrongPlace === 0 && zeroClues >= maxZeroClues) continue;

      return { index: index, guess: guess, score: score };
    }
    return null;
  }

  /**
   * Generate a whole book of puzzles.
   *
   * @param {object} settings  puzzle settings (see book model)
   * @param {string} seed
   * @param {object} [hooks]   { onProgress(done, total), shouldCancel() }
   * @returns {Promise<{puzzles: Array, space: object}>}
   */
  function generatePuzzles(settings, seed, hooks) {
    hooks = hooks || {};
    var space = createCodeSpace(settings);
    var count = settings.count;

    if (count > space.size) {
      return Promise.reject(new Error(
        'You asked for ' + count.toLocaleString() + ' puzzles, but these settings only allow ' +
        space.size.toLocaleString() + ' different hidden codes. Puzzles would have to repeat, so nothing was generated. ' +
        'Reduce the puzzle count or widen the digit range.'
      ));
    }

    var rng = RANDOM.createSeededRandom(seed);
    var puzzles = [];
    var usedSecrets = {};

    return new Promise(function (resolve, reject) {
      function step() {
        if (hooks.shouldCancel && hooks.shouldCancel()) {
          reject(new Error('Generation cancelled.'));
          return;
        }

        var sliceStart = Date.now();
        while (puzzles.length < count) {
          var built = null;
          var attempts = 0;

          while (!built && attempts < MAX_PUZZLE_ATTEMPTS) {
            attempts++;
            var secretIndex = rng.int(0, space.size - 1);
            if (usedSecrets[secretIndex]) continue; // no duplicate secrets in one book
            built = buildPuzzle(space, rng, {
              secretIndex: secretIndex,
              minClues: settings.minClues,
              maxClues: settings.maxClues
            });
            if (built) usedSecrets[secretIndex] = true;
          }

          if (!built) {
            reject(new Error(
              'Could not build a puzzle with exactly one solution after ' + MAX_PUZZLE_ATTEMPTS + ' attempts. ' +
              'Allow more clue rows (raise the maximum) or widen the digit range.'
            ));
            return;
          }

          puzzles.push({
            id: puzzles.length + 1,
            secret: built.secret,
            guesses: built.clues.map(function (c) { return c.guess; }),
            feedback: built.clues.map(function (c) { return c.feedback; }),
            settings: {
              codeLength: settings.codeLength,
              digitMin: settings.digitMin,
              digitMax: settings.digitMax,
              allowDuplicates: settings.allowDuplicates
            }
          });

          // Hand the frame back roughly every 60 ms so the UI stays alive.
          if (Date.now() - sliceStart > 60) break;
        }

        if (hooks.onProgress) hooks.onProgress(puzzles.length, count);

        if (puzzles.length < count) {
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(step);
          else setTimeout(step, 0);
        } else {
          resolve({ puzzles: puzzles, space: space });
        }
      }
      step();
    });
  }

  global.NCB_ENGINE = {
    POOL_MAX: POOL_MAX,
    scoreGuess: scoreGuess,
    codeSpaceSize: codeSpaceSize,
    describeCodeSpaceProblem: describeCodeSpaceProblem,
    createCodeSpace: createCodeSpace,
    packScore: packScore,
    unpackScore: unpackScore,
    guessFrequency: guessFrequency,
    scoreIndex: scoreIndex,
    solve: solve,
    buildPuzzle: buildPuzzle,
    generatePuzzles: generatePuzzles,
    sameCode: sameCode,
    formatCode: formatCode
  };
})(window);
