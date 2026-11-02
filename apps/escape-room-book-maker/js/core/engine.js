/*
 * The puzzles. The AI only gives a puzzle its words (a message, some names, a riddle); everything
 * that has to be right is made and proved here: the code, the grid, the clues, the three hints, the
 * worked answer and the likely slip that a Dead End page talks about. Every puzzle gives exactly one
 * digit. build() returns { kind, level, digit, task: [..], draw: {..}, hints: [3], steps: [..],
 * trap: { digit, note } } or { problem: 'what is missing' }.
 * "{kit}" in a text is the page number of the Field Kit: the layout fills it in.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var U = CX.util;

  var NUMS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
  var LOOKALIKE = [9, 9, 3, 2, 5, 4, 7, 6, 3, 1];   // number words a slipped letter turns into
  var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..' };
  var SYMBOLS = ['key', 'coin', 'star', 'moon', 'diamond'];
  var SYMBOL_NAME = { key: 'key', coin: 'coin', star: 'star', moon: 'moon', diamond: 'diamond' };

  function range(a, b) { return U.range(a, b); }
  function otherOf(list, not, rng) { var l = list.filter(function (x) { return x !== not; }); return l[rng.int(l.length)]; }

  // ---------- messages ----------
  var RE_SLOT = /[\[{(<]\s*(?:N|NUM|NUMBER|DIGIT)\s*[\]})>]/i;
  function cleanWords(s) { return CX.text.stripAccents(String(s || '')).toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim(); }

  // The other number words in a message: they would make it unclear which digit is meant.
  function strayNumbers(msg) {
    var bare = String(msg || '').replace(RE_SLOT, ' ');
    return cleanWords(bare).split(' ').filter(function (w) { return NUMS.indexOf(w) !== -1 || w === 'TEN' || w === 'ELEVEN' || w === 'TWELVE' || w === 'HUNDRED'; });
  }

  /*
   * The message with its number word put in. { words, plain, problem }.
   */
  function message(data, digit, max) {
    var m = String((data && data.message) || '').trim();
    if (!m) return { problem: 'no message yet' };
    var stray = strayNumbers(m);
    if (stray.length) return { problem: 'its message also names the number ' + stray[0] };
    var filled = RE_SLOT.test(m) ? m.replace(RE_SLOT, ' ' + NUMS[digit] + ' ') : m + ' ' + NUMS[digit];
    var plain = cleanWords(filled), n = plain.replace(/ /g, '').length;
    if (n > max) return { problem: 'its message is ' + n + ' letters long (at most ' + max + ')' };
    return { plain: plain, words: plain.split(' '), letters: plain.replace(/ /g, '') };
  }

  // The message with its number word blanked out, for the last hint.
  function masked(msg, digit) {
    var w = NUMS[digit], at = msg.words.lastIndexOf(w);
    return msg.words.map(function (x, i) { return i === at ? w[0] + '_'.repeat(w.length - 1) : x; }).join(' ');
  }

  function textTrap(digit) {
    return { digit: LOOKALIKE[digit], note: 'decode the number word again, letter by letter: one slipped letter gives a different number' };
  }

  function caesarShift(ch, k) { return ABC[(ABC.indexOf(ch) + k + 26) % 26]; }

  // ---------- the kinds ----------
  var KINDS = {};
  function kind(id, def) { def.id = id; KINDS[id] = def; }
  var anyDigit = function () { return range(0, 9); };

  kind('caesar', {
    label: 'Shift code', sub: 'Every letter moved along the alphabet', group: 'code', kid: true, needs: ['message'], maxLetters: 42, digits: anyDigit,
    brief: 'a coded note: the reader undoes a letter shift to read your MESSAGE',
    make: function (c) {
      var msg = message(c.data, c.digit, 42);
      if (msg.problem) return msg;
      var k = 2 + c.rng.int(c.level === 1 ? 4 : 10);
      var coded = msg.words.map(function (w) { return w.split('').map(function (ch) { return caesarShift(ch, k); }).join(''); });
      var first = msg.letters[0], firstCode = caesarShift(first, k);
      var told = c.level === 1 ? 'Every letter was moved ' + k + ' places forward along the alphabet, so move each one back ' + k + ' places.' :
        c.level === 2 ? 'Every letter was moved the same number of places along the alphabet. You know one thing: A became ' + caesarShift('A', k) + '.' :
        'Every letter was moved the same number of places along the alphabet, and nobody wrote down how many. The note names a number near its end.';
      return {
        task: [told, 'Write each real letter in the box under it. Your digit is the number the note names.'],
        draw: { type: 'letters', words: coded, strip: true },
        hints: ['All the letters moved the same distance, so one shift undoes them all. After A, go round to Z.',
          'The shift is ' + k + ': going back ' + k + ' places turns ' + firstCode + ' into ' + first + '.',
          'The note reads: ' + masked(msg, c.digit) + '.'],
        steps: ['Move every letter back ' + k + ' places. The note reads: ' + msg.plain + '.', 'It names ' + NUMS[c.digit] + ', so the digit is ' + c.digit + '.'],
        trap: textTrap(c.digit), solved: { words: msg.words }
      };
    }
  });

  kind('pigpen', {
    label: 'Shape code', sub: 'Letters written as little shapes', group: 'code', kid: true, needs: ['message'], maxLetters: 34, digits: anyDigit,
    brief: 'a note written in a secret shape alphabet, which spells out your MESSAGE',
    make: function (c) {
      var msg = message(c.data, c.digit, 34);
      if (msg.problem) return msg;
      var onPage = c.level < 3;
      return {
        task: ['Each shape stands for one letter. The shape around a letter in the key is the shape that means that letter, and a dot matters.', (onPage ? '' : 'The key is in the Field Kit on page {kit}. ') + 'Write each letter under its shape. Your digit is the number the note names.'],
        draw: { type: 'pigpen', words: msg.words, key: onPage },
        hints: ['Find the shape in the key: the lines around each letter there are the lines you see here. Letters with a dot use the second grid or the second X.',
          'The first word of the note is ' + msg.words[0] + '.',
          'The note reads: ' + masked(msg, c.digit) + '.'],
        steps: ['Read each shape from the key. The note reads: ' + msg.plain + '.', 'It names ' + NUMS[c.digit] + ', so the digit is ' + c.digit + '.'],
        trap: textTrap(c.digit), solved: { words: msg.words }
      };
    }
  });

  kind('morse', {
    label: 'Morse code', sub: 'Dots and dashes', group: 'code', kid: true, needs: ['message'], maxLetters: 20, short: true, digits: anyDigit,
    brief: 'a message tapped out in Morse code, which spells out your MESSAGE. Keep this one very short',
    make: function (c) {
      var msg = message(c.data, c.digit, 20);
      if (msg.problem) return msg;
      var onPage = c.level === 1;
      return {
        task: ['Each group of dots and dashes is one letter.' + (onPage ? ' The chart is below.' : ' The chart is in the Field Kit on page {kit}.'), 'Write each letter in the box under it. Your digit is the number the message names.'],
        draw: { type: 'morse', words: msg.words.map(function (w) { return w.split('').map(function (ch) { return MORSE[ch]; }); }), chart: onPage },
        hints: ['Take one group at a time and look it up. A single dot is E and a single dash is T.',
          'The first word is ' + msg.words[0] + '.',
          'The message reads: ' + masked(msg, c.digit) + '.'],
        steps: ['Look up each group in the chart. The message reads: ' + msg.plain + '.', 'It names ' + NUMS[c.digit] + ', so the digit is ' + c.digit + '.'],
        trap: textTrap(c.digit), solved: { words: msg.words }
      };
    }
  });

  kind('numbers', {
    label: 'Number code', sub: 'Letters written as numbers', group: 'code', kid: true, needs: ['message'], maxLetters: 34, digits: anyDigit,
    brief: 'a list of numbers that stand for letters and spell out your MESSAGE',
    make: function (c) {
      var msg = message(c.data, c.digit, 34);
      if (msg.problem) return msg;
      var add = c.level === 3 ? 2 + c.rng.int(5) : 0, back = c.level === 2;
      function code(ch) { var i = ABC.indexOf(ch) + 1; if (back) return 27 - i; return i + add; }
      var rule = back ? 'Here the alphabet runs backward: Z = 1, Y = 2, and so on up to A = 26.' : add ? 'A number is the letter’s place in the alphabet plus ' + add + ': A = ' + (1 + add) + ', B = ' + (2 + add) + ', and so on.' : 'A number is the letter’s place in the alphabet: A = 1, B = 2, and so on up to Z = 26.';
      return {
        task: [rule, 'Write each letter in the box under its number. Your digit is the number the message names.'],
        draw: { type: 'codes', words: msg.words.map(function (w) { return w.split('').map(code); }) },
        hints: ['Write the alphabet out with its numbers first, the way the rule says. The Field Kit on page {kit} has the plain alphabet.',
          'The first word is ' + msg.words[0] + '.',
          'The message reads: ' + masked(msg, c.digit) + '.'],
        steps: [rule + ' The message reads: ' + msg.plain + '.', 'It names ' + NUMS[c.digit] + ', so the digit is ' + c.digit + '.'],
        trap: textTrap(c.digit), solved: { words: msg.words }
      };
    }
  });

  kind('grille', {
    label: 'Stencil code', sub: 'A stencil shows which letters count', group: 'code', needs: ['message'], maxLetters: 34, digits: anyDigit,
    brief: 'a square of jumbled letters and a stencil card: the letters under the stencil holes spell out your MESSAGE',
    make: function (c) {
      var msg = message(c.data, c.digit, 34);
      if (msg.problem) return msg;
      var L = msg.letters.length, n = Math.max(6, Math.ceil(Math.sqrt(L * 2)));
      var cells = [], r, q;
      for (r = 0; r < n; r++) for (q = 0; q < n; q++) cells.push([r, q]);
      var holes = c.rng.shuffle(cells).slice(0, L).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      var grid = [], FILL = 'BCDFGHJKLMNPQRSTVWXZ';
      for (r = 0; r < n; r++) { grid.push([]); for (q = 0; q < n; q++) grid[r].push(FILL[c.rng.int(FILL.length)]); }
      holes.forEach(function (h, i) { grid[h[0]][h[1]] = msg.letters[i]; });
      var turn = c.level === 3;
      // the card is printed a quarter turn off, so the reader has to turn it clockwise to line it up
      var card = holes.map(function (h) { return turn ? [n - 1 - h[1], h[0]] : h; });
      return {
        task: ['Lay the stencil over the letters: only the letters under its black holes count.' + (turn ? ' The stencil has been printed a quarter turn out of true. Turn it a quarter clockwise first.' : ''), 'Read those letters row by row, left to right. Your digit is the number they name.'],
        draw: { type: 'grille', n: n, grid: grid, card: card },
        hints: [turn ? 'Copy the holes onto the letter square after turning the card a quarter clockwise: its top row becomes the right-hand column.' : 'Copy the holes onto the letter square, or shade the matching squares, then read across.',
          'The first letters you read are ' + msg.letters.slice(0, 3) + '.',
          'The message reads: ' + masked(msg, c.digit) + '.'],
        steps: ['The holes uncover: ' + msg.plain + '.', 'It names ' + NUMS[c.digit] + ', so the digit is ' + c.digit + '.'],
        trap: textTrap(c.digit), solved: { type: 'grille', n: n, grid: grid, card: holes }
      };
    }
  });

  // ---------- sudoku ----------
  function sudokuBox(n) { return n === 4 ? [2, 2] : [2, 3]; }
  function sudokuCount(g, n, limit) {
    var bx = sudokuBox(n), count = 0;
    function can(r, c, v) {
      for (var i = 0; i < n; i++) if (g[r][i] === v || g[i][c] === v) return false;
      var r0 = r - r % bx[0], c0 = c - c % bx[1];
      for (var a = 0; a < bx[0]; a++) for (var b = 0; b < bx[1]; b++) if (g[r0 + a][c0 + b] === v) return false;
      return true;
    }
    function go() {
      var br = -1, bc = -1, best = 99, opts = null;
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
        if (g[r][c]) continue;
        var o = [];
        for (var v = 1; v <= n; v++) if (can(r, c, v)) o.push(v);
        if (o.length < best) { best = o.length; br = r; bc = c; opts = o; }
      }
      if (br < 0) { count++; return; }
      for (var i = 0; i < opts.length && count < limit; i++) { g[br][bc] = opts[i]; go(); g[br][bc] = 0; }
    }
    go();
    return count;
  }
  function sudokuFill(n, rng) {
    var bx = sudokuBox(n), g = [];
    for (var r = 0; r < n; r++) { g.push([]); for (var c = 0; c < n; c++) g[r].push(0); }
    function can(r, c, v) {
      for (var i = 0; i < n; i++) if (g[r][i] === v || g[i][c] === v) return false;
      var r0 = r - r % bx[0], c0 = c - c % bx[1];
      for (var a = 0; a < bx[0]; a++) for (var b = 0; b < bx[1]; b++) if (g[r0 + a][c0 + b] === v) return false;
      return true;
    }
    function go(i) {
      if (i === n * n) return true;
      var r = Math.floor(i / n), c = i % n, vs = rng.shuffle(range(1, n));
      for (var k = 0; k < n; k++) if (can(r, c, vs[k])) { g[r][c] = vs[k]; if (go(i + 1)) return true; g[r][c] = 0; }
      return false;
    }
    go(0);
    return g;
  }

  kind('sudoku', {
    label: 'Mini sudoku', sub: 'A small grid with one marked square', group: 'logic', kid: true, needs: [], digits: function (level) { return range(1, level === 1 ? 4 : 6); },
    brief: 'a small number square on a wall panel or a tile floor, with one square marked',
    make: function (c) {
      var n = c.level === 1 ? 4 : 6, full = sudokuFill(n, c.rng), spots = [], r, q;
      for (r = 0; r < n; r++) for (q = 0; q < n; q++) if (full[r][q] === c.digit) spots.push([r, q]);
      var mark = spots[c.rng.int(spots.length)];
      var g = full.map(function (x) { return x.slice(); }), cells = [];
      for (r = 0; r < n; r++) for (q = 0; q < n; q++) cells.push([r, q]);
      c.rng.shuffle(cells);
      g[mark[0]][mark[1]] = 0;
      var keep = n === 4 ? 6 : c.level === 2 ? 15 : 10, left = n * n - 1;
      cells.forEach(function (k) {
        if (left <= keep || (k[0] === mark[0] && k[1] === mark[1])) return;
        var v = g[k[0]][k[1]];
        g[k[0]][k[1]] = 0;
        if (sudokuCount(g, n, 2) === 1) left--; else g[k[0]][k[1]] = v;
      });
      var bx = sudokuBox(n), name = n === 4 ? 'each of the four 2 × 2 boxes' : 'each of the six 2 × 3 boxes';
      var rowVals = g[mark[0]].filter(Boolean), colVals = g.map(function (x) { return x[mark[1]]; }).filter(Boolean);
      var trapD = otherOf(range(1, n), c.digit, c.rng);
      return {
        task: ['Fill the square so that every row, every column and ' + name + ' holds the numbers 1 to ' + n + ' once each.', 'Your digit is the number in the ringed square.'],
        draw: { type: 'sudoku', n: n, box: bx, grid: g, mark: mark },
        hints: ['Start with the row, column or box that is nearly full: it leaves one number to place.',
          'The ringed square’s row already holds ' + (rowVals.join(', ') || 'nothing') + ' and its column holds ' + (colVals.join(', ') || 'nothing') + '.',
          'The top row of the finished square reads ' + full[0].join(' ') + '.'],
        steps: ['The finished square has a single solution, shown here. The ringed square holds ' + c.digit + '.'],
        trap: { digit: trapD, note: 'check the ringed square against its row, column and box' },
        solved: { type: 'sudoku', n: n, box: bx, grid: full, given: g, mark: mark }
      };
    }
  });

  // ---------- logic grid ----------
  function permutations(n) {
    var out = [];
    (function go(a, rest) {
      if (!rest.length) { out.push(a); return; }
      rest.forEach(function (x, i) { go(a.concat([x]), rest.slice(0, i).concat(rest.slice(i + 1))); });
    })([], range(0, n - 1));
    return out;
  }

  // A clue is a test on (who: person -> number, what: object -> number) with the words to print.
  function logicClues(n, P, O, place, who, what, level) {
    var out = [], p, o, k;
    function add(weight, text, test) { out.push({ w: weight, text: text, test: test }); }
    for (p = 0; p < n; p++) (function (p) {
      for (k = 0; k < n; k++) (function (k) {
        if (who[p] === k) add(level === 1 ? 3 : 1, P[p] + ' took ' + place + ' ' + (k + 1) + '.', function (W) { return W[p] === k; });
        else add(2, P[p] + ' did not take ' + place + ' ' + (k + 1) + '.', function (W) { return W[p] !== k; });
      })(k);
      for (var q = 0; q < n; q++) (function (q) {
        if (p === q) return;
        if (who[p] > who[q]) add(level === 1 ? 1 : 3, P[p] + '’s ' + place + ' has a higher number than ' + P[q] + '’s.', function (W) { return W[p] > W[q]; });
        if (who[p] === who[q] + 1) add(level === 1 ? 1 : 3, P[p] + '’s ' + place + ' is the very next one after ' + P[q] + '’s.', function (W) { return W[p] === W[q] + 1; });
      })(q);
      for (o = 0; o < n; o++) (function (o) {
        if (who[p] === what[o]) add(level === 1 ? 3 : 1, P[p] + ' found the ' + O[o] + '.', function (W, X) { return W[p] === X[o]; });
        else add(2, P[p] + ' did not find the ' + O[o] + '.', function (W, X) { return W[p] !== X[o]; });
        if (what[o] === who[p] + 1) add(level === 1 ? 1 : 3, 'The ' + O[o] + ' was in the ' + place + ' right after ' + P[p] + '’s.', function (W, X) { return X[o] === W[p] + 1; });
      })(o);
    })(p);
    for (o = 0; o < n; o++) (function (o) {
      for (k = 0; k < n; k++) (function (k) {
        if (what[o] !== k) add(2, 'The ' + O[o] + ' was not in ' + place + ' ' + (k + 1) + '.', function (W, X) { return X[o] !== k; });
      })(k);
    })(o);
    return out;
  }

  kind('logic', {
    label: 'Logic grid', sub: 'Who, what and which number', group: 'logic', needs: ['people', 'objects', 'place'], digits: function (level) { return range(1, level === 1 ? 3 : 4); },
    brief: 'a deduction grid: your PEOPLE each took one numbered PLACE and found one of your OBJECTS in it',
    make: function (c) {
      var n = c.level === 1 ? 3 : 4, d = c.data || {};
      if ((d.people || []).length < n) return { problem: 'it needs ' + n + ' people' };
      if ((d.objects || []).length < n) return { problem: 'it needs ' + n + ' objects' };
      if (!(d.place || '').trim()) return { problem: 'it needs a numbered place' };
      var P = d.people.slice(0, n), O = d.objects.slice(0, n).map(function (s) { return s.toLowerCase(); }), place = d.place.trim().toLowerCase();
      var perms = permutations(n), rng = c.rng, who = perms[rng.int(perms.length)], what = perms[rng.int(perms.length)];
      var target = what.indexOf(c.digit - 1);   // the object asked about is the one at the digit
      function candidates(cl) {
        var count = 0;
        perms.forEach(function (W) { perms.forEach(function (X) { if (cl.every(function (t) { return t.test(W, X); })) count++; }); });
        return count;
      }
      var pool = logicClues(n, P, O, place, who, what, c.level);
      var bag = [];
      pool.forEach(function (x) { for (var i = 0; i < x.w; i++) bag.push(x); });
      rng.shuffle(bag);
      var chosen = [];
      for (var i = 0; i < bag.length && candidates(chosen) > 1; i++) {
        if (chosen.indexOf(bag[i]) !== -1) continue;
        var before = candidates(chosen), next = chosen.concat([bag[i]]);
        if (candidates(next) < before) chosen = next;
      }
      for (var k = chosen.length - 1; k >= 0; k--) {
        var without = chosen.slice(0, k).concat(chosen.slice(k + 1));
        if (candidates(without) === 1) chosen = without;
      }
      if (candidates(chosen) !== 1) return { retry: true };
      rng.shuffle(chosen);
      var byNo = range(0, n - 1).map(function (no) { return { no: no + 1, person: P[who.indexOf(no)], object: O[what.indexOf(no)] }; });
      var trapNo = otherOf(range(1, n), c.digit, rng);
      return {
        task: ['Each of ' + (n === 3 ? 'three' : 'four') + ' people took one ' + place + ', numbered 1 to ' + n + ', and found one thing inside. Mark the grid as the clues rule things out.', 'Your digit is the number of the ' + place + ' that held the ' + O[target] + '.'],
        draw: { type: 'logic', n: n, people: P, objects: O, place: place, clues: chosen.map(function (x) { return x.text; }) },
        hints: ['Put an X in the grid for everything a clue rules out. When only one square is left in a row, the rest of that column can go too.',
          byNo[0].person + ' took ' + place + ' 1.',
          byNo.filter(function (x) { return x.no !== c.digit; }).map(function (x) { return place.charAt(0).toUpperCase() + place.slice(1) + ' ' + x.no + ' held the ' + x.object; }).join('. ') + '.'],
        steps: byNo.map(function (x) { return place.charAt(0).toUpperCase() + place.slice(1) + ' ' + x.no + ': ' + x.person + ' found the ' + x.object + '.'; }).concat(['The ' + O[target] + ' was in ' + place + ' ' + c.digit + ', so the digit is ' + c.digit + '.']),
        trap: { digit: trapNo, note: 'the clues leave only one way to fill the grid, so check each one again' }
      };
    }
  });

  // ---------- the padlock ----------
  function lockScore(guess, code) {
    var right = 0, near = 0;
    guess.forEach(function (d, i) { if (code[i] === d) right++; else if (code.indexOf(d) !== -1) near++; });
    return [right, near];
  }
  function allCodes(n) {
    var out = [];
    (function go(a) {
      if (a.length === n) { out.push(a); return; }
      for (var d = 0; d < 10; d++) if (a.indexOf(d) === -1) go(a.concat([d]));
    })([]);
    return out;
  }

  kind('lock', {
    label: 'Padlock', sub: 'Deduce the dials from failed tries', group: 'logic', needs: [], digits: anyDigit,
    brief: 'a padlock with number dials, and a list of failed tries somebody scratched nearby, each with how close it came',
    make: function (c) {
      var n = c.level === 3 ? 4 : 3, rng = c.rng, spot = rng.int(n), rest = rng.shuffle(range(0, 9).filter(function (x) { return x !== c.digit; }));
      var code = rest.slice(0, n - 1);
      code.splice(spot, 0, c.digit);
      var all = allCodes(n), left = all, rows = [], limit = c.level === 1 ? 6 : 8;
      // the first try scores nothing on the easier locks: a way in for the solver
      if (c.level < 3) {
        var miss = rest.slice(n - 1, n - 1 + n);
        rows.push({ guess: miss, right: 0, near: 0 });
        left = left.filter(function (x) { var s = lockScore(miss, x); return s[0] === 0 && s[1] === 0; });
      }
      for (var t = 0; t < 400 && left.length > 1 && rows.length < limit; t++) {
        var tries = [], best = null, bestLeft = null;
        for (var i = 0; i < 24; i++) tries.push(all[rng.int(all.length)]);
        tries.forEach(function (g) {
          var s = lockScore(g, code), k = g.join('') === code.join('');
          if (k) return;
          var f = left.filter(function (x) { var q = lockScore(g, x); return q[0] === s[0] && q[1] === s[1]; });
          if (f.length < left.length && (!bestLeft || f.length < bestLeft.length)) { best = g; bestLeft = f; }
        });
        if (!best) continue;
        var sc = lockScore(best, code);
        rows.push({ guess: best, right: sc[0], near: sc[1] });
        left = bestLeft;
      }
      if (left.length !== 1 || left[0].join('') !== code.join('')) return { retry: true };
      var pos = n === 3 ? ['left', 'middle', 'right'] : ['first', 'second', 'third', 'last'];
      var others = code.map(function (d, i) { return i === spot ? '?' : d; }).join(' ');
      var trapD = code[(spot + 1) % n];
      return {
        task: ['No digit is used twice on this lock. Each try shows how many of its digits are right and in the right place, and how many are right but in the wrong place.', 'Work out the code. Your digit is the one on the ' + pos[spot] + ' dial.'],
        draw: { type: 'lock', n: n, rows: rows, spot: spot },
        hints: [rows[0].right + rows[0].near === 0 ? 'The first try scored nothing, so cross all its digits off everywhere.' : 'Compare two tries that share digits: what changes in the score tells you about the digits that changed.',
          'The lock’s digits include ' + code[(spot + 1) % n] + '.',
          'The code reads ' + others + '.'],
        steps: ['Only one code fits every try: ' + code.join(' ') + '.', 'The ' + pos[spot] + ' dial shows ' + c.digit + '.'],
        trap: { digit: trapD, note: 'you may have the right code but read the wrong dial' }
      };
    }
  });

  // ---------- symbol sums ----------
  kind('symbols', {
    label: 'Symbol sums', sub: 'What is each symbol worth?', group: 'logic', kid: true, needs: [], digits: function () { return range(1, 9); },
    brief: 'rows of small symbols with totals: each symbol stands for a number',
    make: function (c) {
      var n = c.level + 2, rng = c.rng, syms = rng.shuffle(SYMBOLS.slice()).slice(0, n), vals = {}, target = syms[n - 1];
      vals[target] = c.digit;
      syms.slice(0, n - 1).forEach(function (s) { vals[s] = 1 + rng.int(9); });
      var eqs = [];
      function total(e) { return e.terms.reduce(function (t, x) { return t + (x.times ? vals[x.s] * vals[x.times] : vals[x.s]); }, 0); }
      eqs.push({ terms: [{ s: syms[0] }, { s: syms[0] }] });
      for (var i = 1; i < n; i++) {
        var known = syms[rng.int(i)], cur = syms[i];
        if (c.level === 3 && i === n - 1 && vals[known] > 1) eqs.push({ terms: [{ s: cur, times: known }] });
        else eqs.push({ terms: rng.next() < 0.5 ? [{ s: known }, { s: cur }] : [{ s: cur }, { s: known }, { s: cur }] });
      }
      eqs.forEach(function (e) { e.total = total(e); });
      // proved by trying every value from 1 to 9
      var sols = 0;
      (function go(i, map) {
        if (sols > 1) return;
        if (i === n) {
          if (eqs.every(function (e) { return e.terms.reduce(function (t, x) { return t + (x.times ? map[x.s] * map[x.times] : map[x.s]); }, 0) === e.total; })) sols++;
          return;
        }
        for (var v = 1; v <= 9; v++) { map[syms[i]] = v; go(i + 1, map); }
      })(0, {});
      if (sols !== 1) return { retry: true };
      var shown = c.level === 3 ? rng.shuffle(eqs.slice()) : eqs;
      var name = SYMBOL_NAME[target];
      var solved = syms.slice(0, n - 1).map(function (s) { return 'a ' + SYMBOL_NAME[s] + ' is worth ' + vals[s]; }).join(', ');
      var trapS = syms[0] === target ? syms[1] : syms[0], trapD = vals[trapS] !== c.digit ? vals[trapS] : (c.digit % 9) + 1;
      return {
        task: ['Each symbol stands for one whole number from 1 to 9. The same symbol always has the same value.', 'Your digit is the value of the ' + name + '.'],
        draw: { type: 'symbols', eqs: shown, target: target },
        hints: ['Start with the line that uses only one kind of symbol.',
          'A ' + SYMBOL_NAME[syms[0]] + ' is worth ' + vals[syms[0]] + '.',
          solved.charAt(0).toUpperCase() + solved.slice(1) + '.'],
        steps: [solved.charAt(0).toUpperCase() + solved.slice(1) + '.', 'That leaves the ' + name + ' worth ' + c.digit + '.'],
        trap: { digit: trapD, note: 'make sure you wrote down the value of the ' + name + ', not of another symbol' }
      };
    }
  });

  // ---------- number patterns ----------
  kind('sequence', {
    label: 'Number pattern', sub: 'What comes next?', group: 'logic', kid: true, needs: [], digits: anyDigit,
    brief: 'a row of numbers that follow a hidden pattern, with the next one missing',
    make: function (c) {
      var rng = c.rng, kindNo = c.level === 1 ? 0 : c.level === 2 ? 1 + rng.int(2) : 3 + rng.int(3), s = [], rule = '', next, wrong, a, b, i;
      var start = 1 + rng.int(9);
      if (kindNo === 0) {
        a = 2 + rng.int(8); for (i = 0; i < 5; i++) s.push(start + a * i);
        next = start + a * 5; wrong = next + a; rule = 'Each number is ' + a + ' more than the one before.';
      } else if (kindNo === 1) {
        a = 2 + rng.int(4); for (i = 0, b = start; i < 6; i++) { s.push(b); b += a + i; }
        s = s.slice(0, 5); next = s[4] + a + 4; wrong = s[4] + a + 3; rule = 'The step grows by one each time: +' + a + ', +' + (a + 1) + ', +' + (a + 2) + ', and so on.';
      } else if (kindNo === 2) {
        a = 3 + rng.int(6); b = 1 + rng.int(a - 1); var v = start + 5; s = [v];
        for (i = 1; i < 6; i++) { v += i % 2 ? a : -b; s.push(v); }
        next = v - b; wrong = v + a; rule = 'The steps take turns: +' + a + ', then -' + b + '.';
      } else if (kindNo === 3) {
        a = 2; var w = start; s = [w];
        for (i = 1; i < 5; i++) { w = w * a + 1; s.push(w); }
        next = w * a + 1; wrong = w * a; rule = 'Each number is the one before, doubled, plus 1.';
      } else if (kindNo === 4) {
        var x = 1 + rng.int(5), y = 2 + rng.int(6); s = [x, y];
        for (i = 2; i < 6; i++) s.push(s[i - 1] + s[i - 2]);
        next = s[5] + s[4]; wrong = next + s[1]; rule = 'Each number is the two before it added together.';
      } else {
        a = 2 + rng.int(4); b = 3 + rng.int(5); var p = start, q = start + 10; s = [];
        for (i = 0; i < 6; i++) s.push(i % 2 ? q + b * (i - 1) / 2 : p + a * i / 2);
        next = p + a * 3; wrong = q + b * 3; rule = 'Two patterns take turns. The odd places go up by ' + a + ', the even places by ' + b + '.';
      }
      if (next % 10 !== c.digit) return { retry: true };
      var trapD = wrong % 10 !== c.digit ? wrong % 10 : (c.digit + 1) % 10;
      return {
        task: ['Work out the pattern and find the number that comes next.', 'Your digit is the last digit of that number.'],
        draw: { type: 'sequence', nums: s },
        hints: ['Write the difference between each number and the next, and look at those.', rule, 'The number after ' + s[s.length - 1] + ' has ' + String(next).length + ' digit' + (next > 9 ? 's' : '') + '.'],
        steps: [rule + ' The next number is ' + next + '.', 'Its last digit is ' + c.digit + '.'],
        trap: { digit: trapD, note: 'check the rule on every number in the row, not only the last two' }
      };
    }
  });

  // ---------- maze ----------
  function mazeBuild(cols, rows, rng) {
    var seen = {}, open = {}, stack = [[Math.floor(rows / 2), Math.floor(cols / 2)]], parent = {};
    function key(r, c) { return r + ',' + c; }
    seen[key(stack[0][0], stack[0][1])] = 1;
    while (stack.length) {
      var cur = stack[stack.length - 1], opts = [];
      [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(function (d) {
        var r = cur[0] + d[0], c = cur[1] + d[1];
        if (r >= 0 && c >= 0 && r < rows && c < cols && !seen[key(r, c)]) opts.push([r, c]);
      });
      if (!opts.length) { stack.pop(); continue; }
      var nx = opts[rng.int(opts.length)];
      seen[key(nx[0], nx[1])] = 1;
      open[key(cur[0], cur[1]) + '|' + key(nx[0], nx[1])] = open[key(nx[0], nx[1]) + '|' + key(cur[0], cur[1])] = 1;
      parent[key(nx[0], nx[1])] = key(cur[0], cur[1]);
      stack.push(nx);
    }
    return { open: open, parent: parent };
  }
  function mazePathTo(parent, target) {
    var out = [target];
    while (parent[out[out.length - 1]]) out.push(parent[out[out.length - 1]]);
    return out.reverse();
  }
  function mazeReach(cols, rows, open, start) {
    var seen = {}, q = [start];
    seen[start] = 1;
    while (q.length) {
      var cur = q.shift(), p = cur.split(',').map(Number);
      [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(function (d) {
        var k = (p[0] + d[0]) + ',' + (p[1] + d[1]);
        if (open[cur + '|' + k] && !seen[k]) { seen[k] = 1; q.push(k); }
      });
    }
    return seen;
  }

  kind('maze', {
    label: 'Maze', sub: 'Only one way out is open', group: 'picture', kid: true, needs: [], digits: function () { return range(1, 9); },
    brief: 'a maze (a floor plan, a hedge, tunnels): several numbered exits, only one of them can be reached from where you stand',
    make: function (c) {
      var n = c.level === 1 ? 9 : c.level === 2 ? 12 : 15, rng = c.rng, m = mazeBuild(n, n, rng);
      var start = Math.floor(n / 2) + ',' + Math.floor(n / 2);
      var sides = rng.shuffle(['top', 'right', 'bottom', 'left']).slice(0, c.level === 1 ? 3 : 4);
      var exits = sides.map(function (side) {
        var along = 1 + rng.int(n - 2);
        return side === 'top' ? { r: 0, c: along, side: side } : side === 'bottom' ? { r: n - 1, c: along, side: side } : side === 'left' ? { r: along, c: 0, side: side } : { r: along, c: n - 1, side: side };
      });
      var labels = rng.shuffle(range(1, 9).filter(function (x) { return x !== c.digit; }));
      exits.forEach(function (e, i) { e.label = i ? labels[i] : c.digit; });
      var pathTrue = mazePathTo(m.parent, exits[0].r + ',' + exits[0].c), onTrue = {};
      pathTrue.forEach(function (k) { onTrue[k] = 1; });
      var cutOk = true;
      exits.slice(1).forEach(function (e) {
        var path = mazePathTo(m.parent, e.r + ',' + e.c), edges = [];
        for (var i = 1; i < path.length; i++) if (!onTrue[path[i]]) edges.push([path[i - 1], path[i]]);
        if (!edges.length) { cutOk = false; return; }
        var cut = edges[Math.floor(edges.length * (0.45 + rng.next() * 0.5))] || edges[edges.length - 1];
        delete m.open[cut[0] + '|' + cut[1]]; delete m.open[cut[1] + '|' + cut[0]];
      });
      if (!cutOk) return { retry: true };
      var reach = mazeReach(n, n, m.open, start), reachable = exits.filter(function (e) { return reach[e.r + ',' + e.c]; });
      if (reachable.length !== 1 || reachable[0].label !== c.digit) return { retry: true };
      if (pathTrue.length < n) return { retry: true };
      var walls = { h: [], v: [] }, r, q;
      for (r = 0; r <= n; r++) { walls.h.push([]); for (q = 0; q < n; q++) walls.h[r].push(r === 0 || r === n || !m.open[(r - 1) + ',' + q + '|' + r + ',' + q]); }
      for (r = 0; r < n; r++) { walls.v.push([]); for (q = 0; q <= n; q++) walls.v[r].push(q === 0 || q === n || !m.open[r + ',' + (q - 1) + '|' + r + ',' + q]); }
      exits.forEach(function (e) {
        if (e.side === 'top') walls.h[0][e.c] = false;
        if (e.side === 'bottom') walls.h[n][e.c] = false;
        if (e.side === 'left') walls.v[e.r][0] = false;
        if (e.side === 'right') walls.v[e.r][n] = false;
      });
      var side = exits[0].side, trapD = exits[1].label;
      return {
        task: ['Start at the star in the middle and draw your way through. Several exits look open, but only one can be reached.', 'Your digit is the number on that exit.'],
        draw: { type: 'maze', n: n, walls: walls, exits: exits.map(function (e) { return { r: e.r, c: e.c, side: e.side, label: e.label }; }), start: [Math.floor(n / 2), Math.floor(n / 2)] },
        hints: ['Try it backward: start at each exit and follow the path in. A wrong exit soon closes off.',
          'The open exit is not number ' + trapD + '.',
          'The open exit is on the ' + side + ' side of the maze.'],
        steps: ['Only the exit on the ' + side + ' side can be reached from the star, as the line shows. It is number ' + c.digit + '.'],
        trap: { digit: trapD, note: 'follow your line again from the star: a wall closes off that exit' },
        solved: { type: 'maze', n: n, walls: walls, exits: exits.map(function (e) { return { r: e.r, c: e.c, side: e.side, label: e.label }; }), start: [Math.floor(n / 2), Math.floor(n / 2)], path: pathTrue.map(function (k) { return k.split(',').map(Number); }) }
      };
    }
  });

  // ---------- picture grid ----------
  var DIGITS = [
    ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    ['01110', '10001', '00001', '00110', '01000', '10000', '11111'], ['01110', '10001', '00001', '00110', '00001', '10001', '01110'],
    ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], ['01110', '10001', '10001', '01111', '00001', '00010', '01100']
  ];
  function runs(line) {
    var out = [], n = 0;
    line.forEach(function (v) { if (v) n++; else if (n) { out.push(n); n = 0; } });
    if (n) out.push(n);
    return out.length ? out : [0];
  }
  function linePatterns(clue, len) {
    var out = [], parts = clue[0] === 0 ? [] : clue;
    (function go(i, at, a) {
      if (i === parts.length) { var r = a.slice(); while (r.length < len) r.push(0); out.push(r); return; }
      var rest = parts.slice(i + 1).reduce(function (s, x) { return s + x + 1; }, 0);
      for (var s = at; s + parts[i] + rest <= len; s++) {
        var b = a.slice();
        while (b.length < s) b.push(0);
        for (var k = 0; k < parts[i]; k++) b.push(1);
        if (i < parts.length - 1) b.push(0);
        go(i + 1, b.length, b);
      }
    })(0, 0, []);
    return out;
  }
  /* All solutions of a picture grid, up to limit. given: { 'r,c': 1 } squares known to be filled. */
  function picSolve(rowClues, colClues, given, limit) {
    var R = rowClues.length, C = colClues.length, found = [];
    var rowOpts = rowClues.map(function (cl, r) {
      return linePatterns(cl, C).filter(function (p) { return p.every(function (v, c) { return !given[r + ',' + c] || v === 1; }); });
    });
    var grid = [];
    function colOk(c, upto) {
      var col = [];
      for (var r = 0; r <= upto; r++) col.push(grid[r][c]);
      var cl = colClues[c][0] === 0 ? [] : colClues[c], idx = 0, cur = 0;
      for (var i = 0; i < col.length; i++) {
        if (col[i]) { cur++; if (idx >= cl.length || cur > cl[idx]) return false; }
        else if (cur) { if (cur !== cl[idx]) return false; idx++; cur = 0; }
      }
      if (upto === R - 1) { if (cur) { if (cur !== cl[idx]) return false; idx++; } return idx === cl.length; }
      var left = R - 1 - upto, need = 0;
      for (var k = idx; k < cl.length; k++) need += cl[k] + (k > idx ? 1 : 0);
      return need - cur <= left;
    }
    (function go(r) {
      if (found.length >= limit) return;
      if (r === R) { found.push(grid.map(function (x) { return x.slice(); })); return; }
      for (var i = 0; i < rowOpts[r].length; i++) {
        grid[r] = rowOpts[r][i];
        var ok = true;
        for (var c = 0; c < C && ok; c++) ok = colOk(c, r);
        if (ok) go(r + 1);
      }
      grid.length = r;
    })(0);
    return found;
  }

  kind('picture', {
    label: 'Picture grid', sub: 'Shade squares, a digit appears', group: 'picture', kid: true, needs: [], digits: anyDigit,
    brief: 'a grid of squares with numbers around the edge: shading the right squares reveals a hidden number (like a stained glass panel or a tile floor)',
    make: function (c) {
      var bmp = DIGITS[c.digit].map(function (row) { return row.split('').map(Number); }), pic;
      if (c.level === 1) pic = bmp;
      else if (c.level === 2) {
        // the digit left white in a black panel
        pic = [];
        for (var r = 0; r < 9; r++) { pic.push([]); for (var q = 0; q < 7; q++) pic[r].push(r === 0 || r === 8 || q === 0 || q === 6 ? 1 : bmp[r - 1][q - 1] ? 0 : 1); }
      } else {
        pic = [];
        bmp.forEach(function (row) { for (var a = 0; a < 2; a++) { var l = []; row.forEach(function (v) { l.push(v, v); }); pic.push(l); } });
      }
      var rowClues = pic.map(runs), colClues = pic[0].map(function (_, x) { return runs(pic.map(function (row) { return row[x]; })); }), given = {};
      for (var t = 0; t < 40; t++) {
        var sols = picSolve(rowClues, colClues, given, 2);
        if (sols.length === 1) break;
        var diff = [];
        for (var y = 0; y < pic.length; y++) for (var x = 0; x < pic[0].length; x++) if (sols[0][y][x] !== sols[1][y][x] && pic[y][x]) diff.push(y + ',' + x);
        if (!diff.length) for (var y2 = 0; y2 < pic.length; y2++) for (var x2 = 0; x2 < pic[0].length; x2++) if (pic[y2][x2] && !given[y2 + ',' + x2]) diff.push(y2 + ',' + x2);
        given[diff[c.rng.int(diff.length)]] = 1;
      }
      if (picSolve(rowClues, colClues, given, 2).length !== 1) return { retry: true };
      var look = [8, 7, 3, 8, 1, 6, 8, 1, 0, 3];
      var inv = c.level === 2;
      return {
        task: ['The numbers beside each row and above each column give the runs of black squares, in order, with at least one white square between runs. Shaded squares are already filled.', 'Shade the grid. The picture is your digit' + (inv ? ', left white in a black panel.' : '.')],
        draw: { type: 'picture', rows: rowClues, cols: colClues, given: Object.keys(given), R: pic.length, C: pic[0].length },
        hints: ['Start with the biggest numbers. A run longer than half a line always covers the middle of that line.',
          'The top row reads ' + pic[0].map(function (v) { return v ? 'black' : 'white'; }).join(', ') + '.',
          'The first three rows of the picture read: ' + pic.slice(0, 3).map(function (row) { return row.map(function (v) { return v ? '#' : '.'; }).join(''); }).join('  ') + ' (# is black).'],
        steps: ['Only one picture fits the numbers, as shown. It is the digit ' + c.digit + '.'],
        trap: { digit: look[c.digit], note: 'the picture is close, so check each row’s runs: one wrong square turns one digit into another' },
        solved: { type: 'picture', rows: rowClues, cols: colClues, given: Object.keys(given), R: pic.length, C: pic[0].length, pic: pic }
      };
    }
  });

  // ---------- the walk ----------
  var DIRS = { N: [-1, 0, 'north'], E: [0, 1, 'east'], S: [1, 0, 'south'], W: [0, -1, 'west'] };
  var ORDER = ['N', 'E', 'S', 'W'];

  kind('walk', {
    label: 'Floor plan walk', sub: 'Follow the directions square by square', group: 'picture', kid: true, needs: [], digits: anyDigit,
    brief: 'a numbered floor plan and written directions (a map, a page from a guard’s notebook): following them leads to one square',
    make: function (c) {
      var n = c.level + 5, rng = c.rng, steps = c.level === 1 ? 4 : c.level === 2 ? 6 : 8;
      var at = [rng.int(n), rng.int(n)], start = at.slice(), moves = [], facing = rng.int(4), heading = ORDER[facing], swapped = at.slice();
      var last = -1;
      for (var i = 0, t = 0; i < steps && t < 200; t++) {
        var dirI = c.level === 3 ? (rng.next() < 0.5 ? (last < 0 ? facing : last) + 1 : (last < 0 ? facing : last) + 3) % 4 : rng.int(4);
        if (last >= 0 && (dirI === (last + 2) % 4 || dirI === last)) continue;
        var d = DIRS[ORDER[dirI]], len = 1 + rng.int(3), r = at[0] + d[0] * len, q = at[1] + d[1] * len;
        if (r < 0 || q < 0 || r >= n || q >= n) continue;
        at = [r, q];
        moves.push({ dir: ORDER[dirI], len: len, turn: last < 0 ? (dirI === (facing + 1) % 4 ? 'right' : 'left') : (dirI === (last + 1) % 4 ? 'right' : 'left') });
        last = dirI; i++;
      }
      if (moves.length < steps || (at[0] === start[0] && at[1] === start[1])) return { retry: true };
      moves.forEach(function (m) { var d = DIRS[m.dir], rr = swapped[0] - d[0] * m.len, qq = swapped[1] + d[1] * m.len; swapped = [Math.max(0, Math.min(n - 1, rr)), Math.max(0, Math.min(n - 1, qq))]; });
      var grid = [], x, y;
      for (x = 0; x < n; x++) { grid.push([]); for (y = 0; y < n; y++) grid[x].push(rng.int(10)); }
      var slip = (swapped[0] === at[0] && swapped[1] === at[1]) ? [(at[0] + 1) % n, at[1]] : swapped;
      if (slip[0] === start[0] && slip[1] === start[1]) return { retry: true };
      grid[at[0]][at[1]] = c.digit;
      var trapD = otherOf(range(0, 9), c.digit, rng);
      grid[slip[0]][slip[1]] = trapD;
      var words = c.level === 3
        ? ['Start at the star, facing ' + DIRS[heading][2] + '.'].concat(moves.map(function (m) { return 'Turn ' + m.turn + ' and walk ' + m.len + (m.len === 1 ? ' square.' : ' squares.'); }))
        : ['Start at the star.'].concat(moves.map(function (m) { return 'Go ' + m.len + ' ' + DIRS[m.dir][2] + '.'; }));
      var route = [start.slice()], pos = start.slice();
      moves.forEach(function (m) { var d = DIRS[m.dir]; for (var k = 0; k < m.len; k++) { pos = [pos[0] + d[0], pos[1] + d[1]]; route.push(pos.slice()); } });
      return {
        task: ['Follow the directions from the star, one square at a time. North is at the top of the plan.', 'Your digit is the number in the square where you stop.'],
        draw: { type: 'walk', n: n, grid: grid, start: start, words: words },
        hints: ['Move a pencil dot along the plan and tick off each line of the directions as you go.',
          'After the first move you are in row ' + (route[moves[0].len][0] + 1) + ' from the top, column ' + (route[moves[0].len][1] + 1) + ' from the left.',
          'You stop in row ' + (at[0] + 1) + ' from the top.'],
        steps: ['The directions end in row ' + (at[0] + 1) + ', column ' + (at[1] + 1) + ', as the line shows. That square holds ' + c.digit + '.'],
        trap: { digit: trapD, note: 'check north and south: that is where you land if you mix them up' },
        solved: { type: 'walk', n: n, grid: grid, start: start, route: route, end: at }
      };
    }
  });

  // ---------- gears ----------
  kind('gears', {
    label: 'Gear train', sub: 'Which way does each cog turn?', group: 'picture', kid: true, needs: [], digits: function (level) { return level === 1 ? range(2, 4) : level === 2 ? range(3, 5) : range(3, 6); },
    brief: 'a wall of meshed cogs: the crank turns the first one, and only the right count of turning cogs lifts the latch',
    make: function (c) {
      var rng = c.rng, size = c.level === 3 ? 5 : 4, count = c.level === 1 ? 5 + rng.int(3) : c.level === 2 ? 7 + rng.int(3) : 9 + rng.int(4);
      var gears = [{ r: rng.int(size), c: rng.int(size), parent: -1, cw: true }], taken = {};
      taken[gears[0].r + ',' + gears[0].c] = 0;
      function near(r, q) { return [[r - 1, q], [r + 1, q], [r, q - 1], [r, q + 1]].filter(function (p) { return p[0] >= 0 && p[1] >= 0 && p[0] < size && p[1] < size; }); }
      for (var t = 0; t < 300 && gears.length < count; t++) {
        var from = rng.int(gears.length), g = gears[from], opts = near(g.r, g.c).filter(function (p) {
          if (taken[p[0] + ',' + p[1]] != null) return false;
          // a new cog touches only the one it grows from, or it would jam or be ambiguous
          return near(p[0], p[1]).filter(function (x) { return taken[x[0] + ',' + x[1]] != null; }).length === 1;
        });
        if (!opts.length) continue;
        var o = opts[rng.int(opts.length)];
        taken[o[0] + ',' + o[1]] = gears.length;
        gears.push({ r: o[0], c: o[1], parent: from, cw: !g.cw });
      }
      if (gears.length < count) return { retry: true };
      var cw = gears.filter(function (x) { return x.cw; }).length, ccw = gears.length - cw, against = c.level === 3;
      var value = against ? ccw : cw, other = against ? cw : ccw;
      if (value !== c.digit || other === c.digit) return { retry: true };
      return {
        task: ['The crank turns the gear with the arrow, in the way the arrow shows. Gears that touch turn opposite ways.', against ? 'Your digit is how many gears turn the opposite way to the crank.' : 'Your digit is how many gears turn the same way as the crank, counting the first one.'],
        draw: { type: 'gears', size: size, gears: gears.map(function (x) { return { r: x.r, c: x.c, parent: x.parent }; }) },
        hints: ['Mark the first gear, then mark each gear it touches the other way, and go on along the chain.',
          'There are ' + gears.length + ' gears in all.',
          (against ? 'Gears turning the same way as the crank: ' + cw : 'Gears turning the opposite way: ' + ccw) + '. Subtract that from the total.'],
        steps: ['Of the ' + gears.length + ' gears, ' + cw + ' turn with the crank and ' + ccw + ' turn against it.', 'So the digit is ' + c.digit + '.'],
        trap: { digit: other, note: 'that is the count of the gears turning the other way' }
      };
    }
  });

  // ---------- clocks ----------
  function wrapHour(h) { h = ((h - 1) % 12 + 12) % 12 + 1; return h; }

  kind('clocks', {
    label: 'Stopped clocks', sub: 'What should the last clock show?', group: 'picture', kid: true, needs: [], digits: function () { return range(1, 9); },
    brief: 'a row of stopped clocks whose hands follow a pattern, with the last clock missing its hands',
    make: function (c) {
      var rng = c.rng, steps, rule;
      if (c.level === 1) { var k = 2 + rng.int(3); steps = [k, k, k, k]; rule = 'Each clock is ' + k + ' hours later than the one before.'; }
      else if (c.level === 2) { var a = 2 + rng.int(3), b = a + 1 + rng.int(3); steps = [a, b, a, b]; rule = 'The steps take turns: ' + a + ' hours, then ' + b + ' hours.'; }
      else { var s = 1 + rng.int(2); steps = [s, s + 1, s + 2, s + 3]; rule = 'The step grows by one hour each time: ' + steps.join(', ') + '.'; }
      var hours = [c.digit];
      for (var i = steps.length - 1; i >= 0; i--) hours.unshift(wrapHour(hours[0] - steps[i]));
      var shown = hours.slice(0, 4), slip = wrapHour(hours[3] + steps[2]);
      if (slip === c.digit) slip = wrapHour(c.digit + 1);
      if (slip > 9) slip = slip % 10;
      if (slip === c.digit) slip = (c.digit % 9) + 1;
      return {
        task: ['The four stopped clocks follow a pattern in the hours they show. The fifth clock has lost its hands.', 'Your digit is the hour the fifth clock should show.'],
        draw: { type: 'clocks', hours: shown },
        hints: ['Write down each clock’s hour, then count the hours from one clock to the next. Clocks wrap round after 12.', rule, 'The fourth clock shows ' + shown[3] + ' o’clock. Add the next step to it.'],
        steps: [rule + ' After ' + shown[3] + ' o’clock comes ' + c.digit + ' o’clock.', 'So the digit is ' + c.digit + '.'],
        trap: { digit: slip, note: 'look at how the steps change from clock to clock: the last step may not be the same as the one before' }
      };
    }
  });

  // ---------- the evidence board ----------
  kind('count', {
    label: 'Evidence board', sub: 'Count what the rule says', group: 'picture', kid: true, needs: [], digits: function () { return range(3, 8); },
    brief: 'a board or wall covered in small tokens (keys, coins, stars, moons, diamonds): only some of them count',
    make: function (c) {
      var rng = c.rng, R = 6, C = 6, syms = SYMBOLS.slice(), target = syms[rng.int(syms.length)], moonlike = otherOf(syms, target, rng);
      var cells = [], r, q, bias = c.level === 1 ? 0 : c.level === 2 ? 0.2 : 0.5;
      // the harder rules count fewer tokens, so the tokens they name come up more often
      function token() { var t = rng.next(); return t < bias / (c.level === 3 ? 2 : 1) ? target : c.level === 3 && t < bias ? moonlike : syms[rng.int(syms.length)]; }
      for (r = 0; r < R; r++) { cells.push([]); for (q = 0; q < C; q++) cells[r].push({ s: token(), dot: rng.next() < 0.5 }); }
      var value, other, rule, trapNote;
      function total(test) { var n = 0; for (var a = 0; a < R; a++) for (var b = 0; b < C; b++) if (test(a, b)) n++; return n; }
      var name = SYMBOL_NAME[target], nameB = SYMBOL_NAME[moonlike];
      if (c.level === 1) {
        value = total(function (a, b) { return cells[a][b].s === target; });
        other = total(function (a, b) { return cells[a][b].s === moonlike; });
        rule = 'Count the ' + name + 's on the board.';
        trapNote = 'count the ' + name + 's again, row by row, and tick each one';
      } else if (c.level === 2) {
        value = total(function (a, b) { return cells[a][b].s === target && cells[a][b].dot; });
        other = total(function (a, b) { return cells[a][b].s === target && !cells[a][b].dot; });
        rule = 'Count only the ' + name + 's with a dot beside them.';
        trapNote = 'only the ' + name + 's with a dot count';
      } else {
        value = total(function (a, b) { return cells[a][b].s === target && a > 0 && cells[a - 1][b].s === moonlike; });
        other = total(function (a, b) { return cells[a][b].s === target; });
        rule = 'Count only the ' + name + 's that have a ' + nameB + ' directly above them.';
        trapNote = 'a ' + name + ' counts only with a ' + nameB + ' directly above it';
      }
      if (value !== c.digit || other === c.digit) return { retry: true };
      var firstRow = -1;
      for (r = 0; r < R && firstRow < 0; r++) for (q = 0; q < C; q++) {
        var x = cells[r][q];
        if (x.s === target && (c.level === 1 || (c.level === 2 && x.dot) || (c.level === 3 && r > 0 && cells[r - 1][q].s === moonlike))) { firstRow = r; break; }
      }
      return {
        task: [rule, 'Your digit is how many there are.'],
        draw: { type: 'count', R: R, C: C, cells: cells },
        hints: ['Go along one row at a time and tick the ones that count, so none is counted twice.',
          'The first one that counts is in row ' + (firstRow + 1) + ' from the top.',
          'There are more than ' + (c.digit - 2) + '.'],
        steps: [rule + ' There are ' + c.digit + ' of them.', 'So the digit is ' + c.digit + '.'],
        trap: { digit: other, note: trapNote }
      };
    }
  });

  // ---------- word search with a hidden message ----------
  kind('search', {
    label: 'Word search', sub: 'The leftover letters spell the digit', group: 'words', kid: true, needs: ['words', 'message'], maxLetters: 22, short: true, digits: anyDigit,
    brief: 'a small word search of your WORDS on a poster, a crate or a wall: the letters left over spell out your MESSAGE. Keep this message very short',
    make: function (c) {
      var msg = message(c.data, c.digit, 22);
      if (msg.problem) return msg;
      var d = c.data || {}, rng = c.rng;
      var words = (d.words || []).map(CX.plan.letters).filter(function (w) { return w.length >= 3 && w.length <= 12; });
      // a word inside another could be found twice, so it can't be used
      words = words.filter(function (w, i) { return words.indexOf(w) === i && !words.some(function (x) { return x !== w && x.indexOf(w) !== -1; }); });
      if (words.length < 5) return { problem: 'it needs at least 6 words' };
      // the grid is sized to its words, so hardly any squares are left spare
      var fill = words.reduce(function (t, w) { return t + w.length; }, 0) + msg.letters.length;
      var longest = Math.max.apply(null, words.map(function (w) { return w.length; }));
      var n = Math.max(longest, 6, Math.min(12, Math.ceil(Math.sqrt(fill * 0.85)) + rng.int(2)));
      var dirs = c.level === 1 ? [[0, 1], [1, 0]] : c.level === 2 ? [[0, 1], [1, 0], [1, 1], [-1, 1]] : [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
      var grid = [], r, q, placed = [];
      for (r = 0; r < n; r++) { grid.push([]); for (q = 0; q < n; q++) grid[r].push(''); }
      var chosen = words.slice().sort(function (a, b) { return b.length - a.length; });
      for (var w = 0; w < chosen.length; w++) {
        var word = chosen[w], done = false;
        for (var t = 0; t < 80 && !done; t++) {
          var dd = dirs[rng.int(dirs.length)], r0 = rng.int(n), q0 = rng.int(n), er = r0 + dd[0] * (word.length - 1), eq = q0 + dd[1] * (word.length - 1), fit = er >= 0 && eq >= 0 && er < n && eq < n;
          for (var i = 0; fit && i < word.length; i++) { var cell = grid[r0 + dd[0] * i][q0 + dd[1] * i]; if (cell && cell !== word[i]) fit = false; }
          if (!fit) continue;
          for (var j = 0; j < word.length; j++) grid[r0 + dd[0] * j][q0 + dd[1] * j] = word[j];
          placed.push({ w: word, r: r0, c: q0, dr: dd[0], dc: dd[1] });
          done = true;
        }
      }
      if (placed.length < 5) return { retry: true };
      var free = [];
      for (r = 0; r < n; r++) for (q = 0; q < n; q++) if (!grid[r][q]) free.push([r, q]);
      // few spare squares: they are grayed out, and too many would look like a hole in the grid
      if (free.length < msg.letters.length || free.length - msg.letters.length > n + 2 + c.attempt / 40) return { retry: true };
      var keep = rng.shuffle(free.slice()).slice(0, msg.letters.length).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      keep.forEach(function (k, i) { grid[k[0]][k[1]] = msg.letters[i]; });
      free.forEach(function (k) { if (!grid[k[0]][k[1]]) grid[k[0]][k[1]] = '#'; });
      // every word must be there exactly once, so the leftover letters cannot come out two ways
      function occurrences(wd) {
        var hits = 0;
        [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]].forEach(function (dv) {
          for (var a = 0; a < n; a++) for (var b = 0; b < n; b++) {
            var ok = true;
            for (var k = 0; k < wd.length && ok; k++) { var x = a + dv[0] * k, y = b + dv[1] * k; ok = x >= 0 && y >= 0 && x < n && y < n && grid[x][y] === wd[k]; }
            if (ok) hits++;
          }
        });
        return hits;
      }
      if (placed.some(function (p) { return occurrences(p.w) !== 1; })) return { retry: true };
      var how = c.level === 1 ? 'Words run across or down.' : c.level === 2 ? 'Words run across, down or on a diagonal.' : 'Words run in any of the eight directions, even backward.';
      return {
        task: ['Find every word in the list and cross off its letters. ' + how + ' Gray squares are not used.', 'Read the letters left over, row by row, left to right. Your digit is the number they name.'],
        draw: { type: 'search', n: n, grid: grid, words: placed.map(function (p) { return p.w; }).sort() },
        hints: ['Find the longest word first: its letters help you find the rest. Letters can be shared between words.',
          'The leftover letters start ' + msg.letters.slice(0, 3) + '.',
          'The leftover letters read: ' + masked(msg, c.digit) + '.'],
        steps: ['With every word crossed off, the letters left read: ' + msg.plain + '.', 'It names ' + NUMS[c.digit] + ', so the digit is ' + c.digit + '.'],
        trap: textTrap(c.digit), solved: { type: 'search', n: n, grid: grid, placed: placed, keep: keep }
      };
    }
  });

  // ---------- riddle ----------
  kind('riddle', {
    label: 'Riddle', sub: 'Written by the AI, so read it yourself', group: 'words', kid: true, ai: true, needs: ['riddle', 'answer', 'wrong', 'hint', 'why'], digits: anyDigit,
    brief: 'a riddle carved or written somewhere in the room, with four numbered answers to choose from',
    make: function (c) {
      var d = c.data || {};
      if (!(d.riddle || '').trim()) return { problem: 'no riddle yet' };
      if (!(d.answer || '').trim()) return { problem: 'its riddle has no answer' };
      var wrong = (d.wrong || []).map(function (s) { return s.trim(); }).filter(function (s) { return s && s.toLowerCase() !== d.answer.trim().toLowerCase(); });
      if (wrong.length < 3) return { problem: 'its riddle needs 3 wrong answers' };
      var rng = c.rng, labels = rng.shuffle(range(0, 9).filter(function (x) { return x !== c.digit; })).slice(0, 3);
      var opts = [{ label: c.digit, text: d.answer.trim() }].concat(wrong.slice(0, 3).map(function (t, i) { return { label: labels[i], text: t }; }));
      opts.sort(function (a, b) { return a.label - b.label; });
      return {
        task: ['Solve the riddle and choose the answer that fits. Your digit is the number beside that answer.'],
        draw: { type: 'riddle', text: d.riddle.trim(), options: opts },
        hints: [(d.hint || '').trim() || 'Read each line of the riddle against each answer in turn.',
          'It is not ' + wrong[0] + '.',
          'It is not ' + wrong[1] + ' either. That leaves ' + [d.answer.trim(), wrong[2]].sort().join(' and ') + '.'],
        steps: ['The answer is ' + d.answer.trim() + '. ' + ((d.why || '').trim()), 'Its number is ' + c.digit + '.'],
        trap: { digit: labels[0], note: 'read the riddle again, line by line: every line has to fit the answer' }
      };
    }
  });

  // ---------- building ----------
  function def(id) { return KINDS[id] || null; }
  function list() { return Object.keys(KINDS).map(function (k) { return KINDS[k]; }); }

  // Every type for grown-ups, the gentler ones for kids.
  function defaultKinds(aud) {
    return list().filter(function (k) { return aud === 'kids' ? k.kid : true; }).map(function (k) { return k.id; });
  }

  // The digit a puzzle gives: from the seed, or a set one (for tests).
  function digitFor(kindId, level, seed) {
    var opts = def(kindId).digits(level);
    return opts[U.makeRng(seed + '|digit').int(opts.length)];
  }

  /*
   * spec: { kind, level, seed, data, digit? }. The seed alone decides the result, and a generator
   * that drew a dead end tries again with the next attempt number.
   */
  function build(spec) {
    var k = def(spec.kind);
    if (!k) return { problem: 'unknown puzzle type' };
    var digit = spec.digit != null ? spec.digit : digitFor(spec.kind, spec.level, spec.seed);
    for (var i = 0; i < 4000; i++) {
      var r = k.make({ level: spec.level, digit: digit, data: spec.data, attempt: i, rng: U.makeRng(spec.seed + '|try|' + i) });
      if (r.problem) return { problem: r.problem };
      if (r.retry) continue;
      r.kind = spec.kind; r.level = spec.level; r.digit = digit;
      // a door code is single digits, and the slip always differs from the real one
      if (!(r.trap.digit >= 0 && r.trap.digit <= 9) || r.trap.digit === digit) r.trap.digit = (digit + 1) % 10;
      return r;
    }
    return { problem: 'no puzzle could be built' };
  }

  CX.engine = {
    KINDS: KINDS, kind: def, list: list, defaultKinds: defaultKinds, digitFor: digitFor, build: build,
    NUMS: NUMS, MORSE: MORSE, ABC: ABC, SYMBOLS: SYMBOLS, strayNumbers: strayNumbers, picSolve: picSolve, runs: runs, sudokuCount: sudokuCount, lockScore: lockScore, allCodes: allCodes, permutations: permutations, mazeReach: mazeReach
  };
})(typeof window !== 'undefined' ? window : globalThis);
