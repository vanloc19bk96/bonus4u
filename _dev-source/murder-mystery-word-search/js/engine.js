/*! engine.js — pair mapping, placement, filler, scan, circles, invariants. */
(function (global) {
  'use strict';

  var R = global.MMRng;
  var DIRS8 = [[0, 1, 'across'], [0, -1, 'back'], [1, 0, 'down'], [-1, 0, 'up'],
    [1, 1, 'diagonal'], [1, -1, 'diagonal'], [-1, -1, 'up-diagonal'], [-1, 1, 'up-diagonal']];

  function difficultyDirs(level) {
    if (level === 'easy') return [DIRS8[0], DIRS8[2]];
    if (level === 'hard') return DIRS8.slice();
    return [DIRS8[0], DIRS8[2], DIRS8[4], DIRS8[5]];
  }

  function decoyRatio(level) {
    if (level === 'easy') return 0.25;
    if (level === 'hard') return 0.65;
    return 0.50;
  }

  function emptyGrid(n) {
    var g = [], r, c;
    for (r = 0; r < n; r++) {
      g[r] = [];
      for (c = 0; c < n; c++) g[r][c] = '';
    }
    return g;
  }

  function cloneGrid(grid) {
    return grid.map(function (row) { return row.slice(); });
  }

  function pairsOfFour() {
    return [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  }

  function cellKey(r, c) { return r + ',' + c; }

  function setKey(cells) {
    return cells.map(function (p) { return cellKey(p[0], p[1]); }).sort().join('|');
  }

  function fits(grid, word, r, c, dr, dc) {
    var n = grid.length, i, rr, cc, overlap = 0, ch;
    for (i = 0; i < word.length; i++) {
      rr = r + dr * i;
      cc = c + dc * i;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) return null;
      ch = grid[rr][cc];
      if (ch && ch !== word[i]) return null;
      if (ch === word[i]) overlap++;
    }
    return overlap;
  }

  function commitWord(grid, word, r, c, dr, dc) {
    var cells = [], i, rr, cc;
    for (i = 0; i < word.length; i++) {
      rr = r + dr * i;
      cc = c + dc * i;
      grid[rr][cc] = word[i];
      cells.push([rr, cc]);
    }
    return cells;
  }

  function dirName(dr, dc) {
    for (var i = 0; i < DIRS8.length; i++) {
      if (DIRS8[i][0] === dr && DIRS8[i][1] === dc) return DIRS8[i][2];
    }
    return 'across';
  }

  function placeWords(n, items, dirs, rng) {
    var grid = emptyGrid(n);
    var placed = [];
    var sorted = items.slice().sort(function (a, b) { return b.word.length - a.word.length; });
    var tries = 0;
    var MAX = 4000;

    function candidates(word) {
      var starts = [], r, c, d, ov, list = [];
      for (r = 0; r < n; r++) for (c = 0; c < n; c++) starts.push([r, c]);
      starts = R.shuffle(starts, rng);
      var dlist = R.shuffle(dirs, rng);
      for (r = 0; r < starts.length; r++) {
        for (d = 0; d < dlist.length; d++) {
          ov = fits(grid, word, starts[r][0], starts[r][1], dlist[d][0], dlist[d][1]);
          if (ov !== null) list.push({ r: starts[r][0], c: starts[r][1], dr: dlist[d][0], dc: dlist[d][1], overlap: ov });
        }
      }
      list.sort(function (a, b) { return b.overlap - a.overlap; });
      return list;
    }

    function backtrack(idx) {
      if (idx >= sorted.length) return true;
      if (tries++ > MAX) return false;
      var item = sorted[idx];
      var list = candidates(item.word);
      var limit = Math.min(list.length, 36);
      var i, p, snap, cells, k, rec;
      for (i = 0; i < limit; i++) {
        p = list[i];
        snap = [];
        cells = [];
        for (k = 0; k < item.word.length; k++) {
          snap.push(grid[p.r + p.dr * k][p.c + p.dc * k]);
          grid[p.r + p.dr * k][p.c + p.dc * k] = item.word[k];
          cells.push([p.r + p.dr * k, p.c + p.dc * k]);
        }
        rec = {
          word: item.word, kind: item.kind, cells: cells,
          r: p.r, c: p.c, dr: p.dr, dc: p.dc, dir: dirName(p.dr, p.dc)
        };
        placed.push(rec);
        if (backtrack(idx + 1)) return true;
        placed.pop();
        for (k = 0; k < cells.length; k++) grid[cells[k][0]][cells[k][1]] = snap[k];
      }
      return false;
    }

    if (!backtrack(0)) return null;
    return { grid: grid, placed: placed };
  }

  function intendedKeys(placed) {
    var map = {};
    placed.forEach(function (p) {
      if (!map[p.word]) map[p.word] = {};
      map[p.word][setKey(p.cells)] = true;
    });
    return map;
  }

  function extraHits(grid, answers, intended, n) {
    var extras = [], a, r, c, d, i, rr, cc, ok, cells, key, word;
    for (a = 0; a < answers.length; a++) {
      word = answers[a];
      for (r = 0; r < n; r++) {
        for (c = 0; c < n; c++) {
          if (grid[r][c] !== word[0]) continue;
          for (d = 0; d < DIRS8.length; d++) {
            ok = true;
            cells = [[r, c]];
            for (i = 1; i < word.length; i++) {
              rr = r + DIRS8[d][0] * i;
              cc = c + DIRS8[d][1] * i;
              if (rr < 0 || cc < 0 || rr >= n || cc >= n || grid[rr][cc] !== word[i]) {
                ok = false;
                break;
              }
              cells.push([rr, cc]);
            }
            if (!ok) continue;
            key = setKey(cells);
            if (!intended[word] || !intended[word][key]) extras.push({ word: word, cells: cells });
          }
        }
      }
    }
    return extras;
  }

  function extrasThrough(grid, r, c, answers, intended, n) {
    var extras = [], a, d, k, i, sr, sc, er, ec, rr, cc, ok, cells, key, word, L, dr, dc;
    for (a = 0; a < answers.length; a++) {
      word = answers[a];
      L = word.length;
      for (d = 0; d < DIRS8.length; d++) {
        dr = DIRS8[d][0];
        dc = DIRS8[d][1];
        for (k = 0; k < L; k++) {
          if (word[k] !== grid[r][c]) continue;
          sr = r - dr * k;
          sc = c - dc * k;
          if (sr < 0 || sc < 0 || sr >= n || sc >= n) continue;
          er = sr + dr * (L - 1);
          ec = sc + dc * (L - 1);
          if (er < 0 || ec < 0 || er >= n || ec >= n) continue;
          ok = true;
          cells = [];
          for (i = 0; i < L; i++) {
            rr = sr + dr * i;
            cc = sc + dc * i;
            if (grid[rr][cc] !== word[i]) { ok = false; break; }
            cells.push([rr, cc]);
          }
          if (!ok) continue;
          key = setKey(cells);
          if (!intended[word] || !intended[word][key]) extras.push({ word: word, cells: cells });
        }
      }
    }
    return extras;
  }

  function letterCreatesExtra(grid, r, c, letter, answers, intended, n) {
    var prev = grid[r][c];
    grid[r][c] = letter;
    var hits = extrasThrough(grid, r, c, answers, intended, n);
    grid[r][c] = prev;
    return hits.length > 0;
  }

  function fillGrid(grid, covered, answers, intended, rng) {
    var n = grid.length, r, c, letters, i, ch, found;
    for (r = 0; r < n; r++) {
      for (c = 0; c < n; c++) {
        if (grid[r][c]) continue;
        letters = R.shuffle('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), rng);
        found = false;
        for (i = 0; i < letters.length; i++) {
          ch = letters[i];
          if (!letterCreatesExtra(grid, r, c, ch, answers, intended, n)) {
            grid[r][c] = ch;
            found = true;
            break;
          }
        }
        if (!found) grid[r][c] = letters[0];
      }
    }
  }

  function repairExtras(grid, locked, answers, intended, rng, n) {
    var pass, extras, e, k, cell, letters, i, ch, fixed;
    for (pass = 0; pass < 50; pass++) {
      extras = extraHits(grid, answers, intended, n);
      if (!extras.length) return true;
      fixed = false;
      for (e = 0; e < extras.length; e++) {
        for (k = 0; k < extras[e].cells.length; k++) {
          cell = extras[e].cells[k];
          if (locked[cellKey(cell[0], cell[1])]) continue;
          letters = R.shuffle('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), rng);
          for (i = 0; i < letters.length; i++) {
            ch = letters[i];
            if (ch === grid[cell[0]][cell[1]]) continue;
            if (!letterCreatesExtra(grid, cell[0], cell[1], ch, answers, intended, n)) {
              grid[cell[0]][cell[1]] = ch;
              fixed = true;
              break;
            }
          }
        }
      }
      if (!fixed) return false;
    }
    return extraHits(grid, answers, intended, n).length === 0;
  }

  function coveredMap(placed) {
    var map = {};
    placed.forEach(function (p) {
      p.cells.forEach(function (cell) { map[cellKey(cell[0], cell[1])] = true; });
    });
    return map;
  }

  function placeCircles(grids, victim, answers, rng, ratio) {
    var letters = victim.split('');
    var slots = [0, 1, 2, 3];
    while (slots.length < letters.length) slots.push(Math.floor(rng() * 4));
    slots = R.shuffle(slots, rng);
    var circles = [[], [], [], []];
    var g, list, r, c, n, intended, tries, placed, i, cell;

    for (i = 0; i < letters.length; i++) {
      g = slots[i];
      n = grids[g].letters.length;
      intended = intendedKeys(grids[g].placed);
      list = [];
      for (r = 0; r < n; r++) {
        for (c = 0; c < n; c++) {
          if (!grids[g].covered[cellKey(r, c)]) list.push([r, c]);
        }
      }
      list = R.shuffle(list, rng);
      placed = false;
      for (tries = 0; tries < list.length; tries++) {
        cell = list[tries];
        if (!letterCreatesExtra(grids[g].letters, cell[0], cell[1], letters[i], answers, intended, n)) {
          grids[g].letters[cell[0]][cell[1]] = letters[i];
          circles[g].push({ r: cell[0], c: cell[1], letter: letters[i], decoy: false });
          placed = true;
          break;
        }
      }
      if (!placed) return null;
    }

    var victimCount = letters.length;
    var decoyCount = Math.round((ratio / Math.max(0.05, 1 - ratio)) * victimCount);
    var pool = [];
    for (g = 0; g < 4; g++) {
      n = grids[g].letters.length;
      for (r = 0; r < n; r++) {
        for (c = 0; c < n; c++) {
          if (grids[g].covered[cellKey(r, c)]) pool.push({ g: g, r: r, c: c, letter: grids[g].letters[r][c] });
        }
      }
    }
    pool = R.shuffle(pool, rng);
    for (i = 0; i < pool.length && decoyCount > 0; i++) {
      circles[pool[i].g].push({ r: pool[i].r, c: pool[i].c, letter: pool[i].letter, decoy: true });
      decoyCount--;
    }
    return circles;
  }

  function leftoverLetters(grids, circles) {
    var out = [];
    for (var g = 0; g < 4; g++) {
      (circles[g] || []).forEach(function (cir) {
        if (!grids[g].covered[cellKey(cir.r, cir.c)]) out.push(cir.letter);
      });
    }
    return out.sort().join('');
  }

  function countWordInGrid(grid, word) {
    return extraHits(grid, [word], {}, grid.length).length;
  }

  function verify(puzzle) {
    var inv = [true, true, true, true, true, true];
    var suspectCount = {};
    var evidenceCount = {};
    var i, g, word, locHits, leftover, victimSorted, other;

    puzzle.suspects.forEach(function (s) { suspectCount[s] = 0; });
    puzzle.evidence.forEach(function (e) { evidenceCount[e] = 0; });

    for (g = 0; g < 4; g++) {
      if (puzzle.grids[g].suspects.length !== 3) inv[0] = false;
      puzzle.grids[g].suspects.forEach(function (s) { suspectCount[s] = (suspectCount[s] || 0) + 1; });
      puzzle.grids[g].evidence.forEach(function (e) { evidenceCount[e] = (evidenceCount[e] || 0) + 1; });
    }
    Object.keys(suspectCount).forEach(function (s) { if (suspectCount[s] !== 2) inv[0] = false; });

    var two = 0, seven = 0;
    Object.keys(evidenceCount).forEach(function (e) {
      seven += evidenceCount[e];
      if (evidenceCount[e] === 2) two++;
      else if (evidenceCount[e] !== 1) inv[1] = false;
    });
    if (two !== 1 || seven !== 7) inv[1] = false;
    if (evidenceCount[puzzle.weapon] !== 2) inv[1] = false;

    var share = puzzle.grids[puzzle.weaponScenes[0]].suspects.filter(function (s) {
      return puzzle.grids[puzzle.weaponScenes[1]].suspects.indexOf(s) !== -1;
    });
    if (share.length !== 1 || share[0] !== puzzle.killer) inv[2] = false;

    locHits = 0;
    for (g = 0; g < 4; g++) {
      i = countWordInGrid(puzzle.grids[g].letters, puzzle.victimLetters);
      if (g === puzzle.locationIndex) {
        if (i < 1) inv[3] = false;
      } else if (i > 0) inv[3] = false;
      locHits += i;
    }
    if (locHits < 1) inv[3] = false;

    leftover = leftoverLetters(
      puzzle.grids.map(function (gr) { return { covered: gr.covered }; }),
      puzzle.grids.map(function (gr) { return gr.circles; })
    );
    victimSorted = puzzle.victimLetters.split('').sort().join('');
    if (leftover !== victimSorted) inv[4] = false;
    other = puzzle.suspects.concat(puzzle.evidence).some(function (w) {
      return w !== puzzle.victimLetters && w.split('').sort().join('') === leftover;
    });
    if (other) inv[4] = false;

    var answers = puzzle.suspects.concat(puzzle.evidence, [puzzle.victimLetters]);
    for (g = 0; g < 4; g++) {
      var intended = intendedKeys(puzzle.grids[g].placed);
      if (extraHits(puzzle.grids[g].letters, answers, intended, puzzle.grids[g].letters.length).length) {
        inv[5] = false;
      }
    }

    return { ok: inv.every(Boolean), flags: inv };
  }

  function buildOnce(data, settings, rng) {
    var n = settings.gridSize;
    var dirs = difficultyDirs(settings.difficulty);
    var suspects = (data.suspects || []).map(function (w) { return String(w).toUpperCase().replace(/[^A-Z]/g, ''); });
    var evidence = (data.evidence || []).map(function (w) { return String(w).toUpperCase().replace(/[^A-Z]/g, ''); });
    var victim = data.victimLetters || String(data.victim || '').toUpperCase().replace(/[^A-Z]/g, '');
    var pairs = R.shuffle(pairsOfFour(), rng);
    var sceneSuspects = [[], [], [], []];
    var i, s0, s1;

    for (i = 0; i < 6; i++) {
      s0 = pairs[i][0];
      s1 = pairs[i][1];
      sceneSuspects[s0].push(suspects[i]);
      sceneSuspects[s1].push(suspects[i]);
    }

    var weapon = R.pick(evidence, rng);
    var weaponPair = R.pick(pairs, rng);
    var pairIndex = -1;
    for (i = 0; i < 6; i++) {
      if (pairs[i][0] === weaponPair[0] && pairs[i][1] === weaponPair[1]) pairIndex = i;
    }
    var killer = suspects[pairIndex];
    var nonWeapon = [];
    for (i = 0; i < 4; i++) {
      if (i !== weaponPair[0] && i !== weaponPair[1]) nonWeapon.push(i);
    }
    var locationIndex = R.pick(nonWeapon, rng);
    var others = evidence.filter(function (e) { return e !== weapon; });
    others = R.shuffle(others, rng);
    var sceneEvidence = [[], [], [], []];
    sceneEvidence[weaponPair[0]].push(weapon);
    sceneEvidence[weaponPair[1]].push(weapon);
    for (i = 0; i < 4; i++) sceneEvidence[i].push(others[i]);
    var spareScene = nonWeapon[0] === locationIndex ? nonWeapon[1] : nonWeapon[0];
    sceneEvidence[spareScene].push(others[4]);

    var answers = suspects.concat(evidence, [victim]);
    var grids = [];
    for (i = 0; i < 4; i++) {
      var items = sceneSuspects[i].map(function (w) { return { word: w, kind: 'suspect' }; })
        .concat(sceneEvidence[i].map(function (w) { return { word: w, kind: 'evidence' }; }));
      if (i === locationIndex) items.push({ word: victim, kind: 'victim' });
      var placed = placeWords(n, items, dirs, rng);
      if (!placed) return null;
      var covered = coveredMap(placed.placed);
      var intended = intendedKeys(placed.placed);
      fillGrid(placed.grid, covered, answers, intended, rng);
      if (!repairExtras(placed.grid, covered, answers, intended, rng, n)) return null;
      grids.push({
        scene: data.scenes[i],
        letters: placed.grid,
        placed: placed.placed,
        covered: covered,
        suspects: sceneSuspects[i].slice(),
        evidence: sceneEvidence[i].slice()
      });
    }

    var circles = placeCircles(grids, victim, answers, rng, decoyRatio(settings.difficulty));
    if (!circles) return null;
    for (i = 0; i < 4; i++) {
      var locked = {};
      Object.keys(grids[i].covered).forEach(function (k) { locked[k] = true; });
      circles[i].forEach(function (cir) {
        if (!cir.decoy) locked[cellKey(cir.r, cir.c)] = true;
      });
      if (!repairExtras(grids[i].letters, locked, answers, intendedKeys(grids[i].placed), rng, n)) return null;
      grids[i].circles = circles[i];
      grids[i].circleMap = {};
      circles[i].forEach(function (cir) {
        grids[i].circleMap[cellKey(cir.r, cir.c)] = cir;
      });
    }

    var puzzle = {
      id: data.id,
      theme: data.theme,
      flavor: data.flavor,
      scenes: data.scenes,
      suspects: suspects,
      evidence: evidence,
      victim: data.victim || victim,
      victimLetters: victim,
      weapon: weapon,
      killer: killer,
      location: data.scenes[locationIndex],
      locationIndex: locationIndex,
      weaponScenes: [weaponPair[0], weaponPair[1]],
      grids: grids
    };
    var checked = verify(puzzle);
    if (!checked.ok) return null;
    return puzzle;
  }

  var cache = {};

  function settingsKey(settings) {
    return [settings.difficulty || 'standard', settings.gridSize || 11, settings.seed || ''].join('|');
  }

  function generate(data, settings) {
    var key = data.id + '|' + settingsKey(settings);
    if (cache[key]) return cache[key];
    var rng = R.caseRng(settings.seed, data.id);
    var attempt, puzzle;
    for (attempt = 0; attempt < 200; attempt++) {
      puzzle = buildOnce(data, settings, rng);
      if (puzzle) {
        cache[key] = { ok: true, puzzle: puzzle, attempts: attempt + 1 };
        return cache[key];
      }
    }
    var failed = { ok: false, id: data.id, attempts: 200, error: 'Could not build a unique-solution grid for case ' + data.id + '. Ask the AI for a replacement with different words.' };
    cache[key] = failed;
    return failed;
  }

  function clearCache() { cache = {}; }

  function generateMany(cases, settings, onEach) {
    var results = [];
    for (var i = 0; i < cases.length; i++) {
      var result = generate(cases[i], settings);
      results.push(result);
      if (onEach) onEach(i, cases.length, result);
    }
    return results;
  }

  global.MMEngine = {
    generate: generate,
    generateMany: generateMany,
    verify: verify,
    clearCache: clearCache,
    difficultyDirs: difficultyDirs,
    decoyRatio: decoyRatio,
    extraHits: extraHits
  };
})(typeof window !== 'undefined' ? window : globalThis);
