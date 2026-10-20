/*
 * The clue library. A clue answers, for every option in a line-up: YES (the clue describes it,
 * so the reader crosses it out), NO (it stays), or MAYBE (a careful reader could go either way).
 *
 * Letter clues are worked out here, by the rules the book prints in its clue guide:
 *   - only the letters A-Z count; spaces, hyphens and apostrophes are ignored
 *   - A, E, I, O and U are vowels; Y never is
 *   - "a word" is a run of letters between spaces
 * Where a reader could still slip (a Y that looks like a vowel, a hyphenated name that might be
 * one word or two, a double letter across a space) the answer is MAYBE. The puzzle engine never
 * lets a MAYBE decide anything: the answer must be a firm NO for every clue, and every other
 * option must be crossed out firmly by at least one clue.
 *
 * Knowledge clues ("It grows underground") come from the AI packs as a list of the options they
 * describe, plus the debatable ones.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  var NO = 0, YES = 1, MAYBE = 2;
  var VOWELS = 'AEIOU';
  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  function num(n) { return NUM_WORDS[n] || String(n); }

  // ---------- options ----------
  /*
   * Cleans one option as typed by a person or an AI. Returns { ok, text, reason }.
   * Accents are dropped (CAFÉ prints as CAFE) so every letter clue stays unambiguous.
   */
  function cleanOption(raw) {
    var t = String(raw == null ? '' : raw).normalize('NFD').replace(/[̀-ͯ]/g, '');
    t = t.replace(/[‘’`´]/g, "'").replace(/[‐‑‒–—]/g, '-').replace(/[*_#"“”]/g, '');
    t = t.replace(/^\s*(?:\d+[.)]\s+|[-•·]\s+)/, '').replace(/\s+/g, ' ').trim();
    t = t.replace(/\s*-\s*/g, '-').replace(/[.,;:!?]+$/, '');
    if (!t) return { ok: false, text: '', reason: 'empty' };
    if (/\d/.test(t)) return { ok: false, text: t, reason: 'has a number' };
    if (/[^A-Za-z' \-&]/.test(t)) return { ok: false, text: t, reason: 'has a symbol the clue rules cannot count' };
    if (/&/.test(t)) return { ok: false, text: t, reason: 'has an “&”' };
    var letters = t.toUpperCase().replace(/[^A-Z]/g, '');
    if (letters.length < 2) return { ok: false, text: t, reason: 'is too short' };
    if (letters.length > 20) return { ok: false, text: t, reason: 'is longer than 20 letters' };
    if (t.split(' ').length > 3) return { ok: false, text: t, reason: 'is more than three words' };
    // Title Case unless the AI already chose capitals inside the word (e.g. "McFlurry" stays)
    if (t === t.toUpperCase() || t === t.toLowerCase()) {
      t = t.toLowerCase().replace(/(^|[ \-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
    }
    return { ok: true, text: t };
  }

  // Everything the letter clues need to know about one option.
  function info(text) {
    var up = String(text).toUpperCase();
    var letters = up.replace(/[^A-Z]/g, '');
    var spaced = up.split(' ').filter(Boolean);
    var parts = []; // runs of letters between spaces and hyphens
    spaced.forEach(function (w) { w.split('-').forEach(function (p) { var l = p.replace(/[^A-Z]/g, ''); if (l) parts.push(l); }); });
    return {
      text: text, upper: up, letters: letters, len: letters.length,
      words: spaced.length, hyphen: up.indexOf('-') !== -1, parts: parts
    };
  }

  function vowelCount(s, yVowel) {
    var n = 0;
    for (var i = 0; i < s.length; i++) if (VOWELS.indexOf(s[i]) !== -1 || (yVowel && s[i] === 'Y')) n++;
    return n;
  }
  function isVowel(c, yVowel) { return VOWELS.indexOf(c) !== -1 || (yVowel && c === 'Y'); }
  function pairIn(parts, test) { for (var p = 0; p < parts.length; p++) for (var i = 1; i < parts[p].length; i++) if (test(parts[p][i - 1], parts[p][i])) return true; return false; }
  function pairAcross(letters, test) { for (var i = 1; i < letters.length; i++) if (test(letters[i - 1], letters[i])) return true; return false; }
  // YES/NO when both readings agree, MAYBE when they do not
  function either(a, b) { return a === b ? (a ? YES : NO) : MAYBE; }

  // ---------- clue types ----------
  /*
   * tier: how tricky the clue feels (1 = anyone gets it, 4 = a seasoned solver).
   * family: clues of one family are rationed per puzzle, so a puzzle never has four letter clues.
   * guide: the clue-guide entry printed in the book when the clue type is used.
   */
  var TYPES = {
    has: {
      tier: 1, family: 'has', params: function () { return ALPHA.split(''); },
      text: function (L) { return 'It contains the letter ' + L; },
      test: function (o, L) { return o.letters.indexOf(L) !== -1 ? YES : NO; },
      guide: ['Letters', '“It contains the letter T” means a T appears anywhere in the option, once or more.']
    },
    starts: {
      tier: 1, family: 'start', params: function () { return ALPHA.split(''); },
      text: function (L) { return 'It starts with the letter ' + L; },
      test: function (o, L) { return o.letters[0] === L ? YES : NO; },
      guide: ['First and last letters', '“It starts with…” and “It ends with…” look at the very first and the very last letter of the whole option.']
    },
    ends: {
      tier: 1.5, family: 'end', params: function () { return ALPHA.split(''); },
      text: function (L) { return 'It ends with the letter ' + L; },
      test: function (o, L) { return o.letters[o.len - 1] === L ? YES : NO; },
      guide: ['First and last letters', '“It starts with…” and “It ends with…” look at the very first and the very last letter of the whole option.']
    },
    longer: {
      tier: 1, family: 'length', params: function () { return [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; },
      text: function (n) { return 'It has more than ' + num(n) + ' letters'; },
      test: function (o, n) { return o.len > n ? YES : NO; },
      guide: ['Counting letters', 'Count only the letters. Spaces, hyphens and apostrophes are ignored, so ICE CREAM has eight letters.']
    },
    shorter: {
      tier: 1, family: 'length', params: function () { return [4, 5, 6, 7, 8, 9, 10, 11, 12]; },
      text: function (n) { return 'It has fewer than ' + num(n) + ' letters'; },
      test: function (o, n) { return o.len < n ? YES : NO; },
      guide: ['Counting letters', 'Count only the letters. Spaces, hyphens and apostrophes are ignored, so ICE CREAM has eight letters.']
    },
    exactly: {
      tier: 2, family: 'length', params: function () { return [3, 4, 5, 6, 7, 8, 9, 10]; },
      text: function (n) { return 'It has exactly ' + num(n) + ' letters'; },
      test: function (o, n) { return o.len === n ? YES : NO; },
      guide: ['Counting letters', 'Count only the letters. Spaces, hyphens and apostrophes are ignored, so ICE CREAM has eight letters.']
    },
    even: {
      tier: 2, family: 'parity', params: function () { return [0]; },
      text: function () { return 'It has an even number of letters'; },
      test: function (o) { return o.len % 2 === 0 ? YES : NO; },
      guide: ['Even and odd', 'An even number of letters is 2, 4, 6, 8 and so on; odd is 3, 5, 7, 9. Spaces and hyphens are not counted.']
    },
    odd: {
      tier: 2, family: 'parity', params: function () { return [0]; },
      text: function () { return 'It has an odd number of letters'; },
      test: function (o) { return o.len % 2 === 1 ? YES : NO; },
      guide: ['Even and odd', 'An even number of letters is 2, 4, 6, 8 and so on; odd is 3, 5, 7, 9. Spaces and hyphens are not counted.']
    },
    multi: {
      tier: 2, family: 'words', params: function () { return [0]; },
      text: function () { return 'It is more than one word'; },
      test: function (o) { return o.words > 1 ? YES : o.hyphen ? MAYBE : NO; },
      guide: ['One word or more', 'Words are separated by spaces. FIRE STATION is two words; LIBRARY is one.']
    },
    single: {
      tier: 2, family: 'words', params: function () { return [0]; },
      text: function () { return 'It is a single word'; },
      test: function (o) { return o.words > 1 ? NO : o.hyphen ? MAYBE : YES; },
      guide: ['One word or more', 'Words are separated by spaces. FIRE STATION is two words; LIBRARY is one.']
    },
    double: {
      tier: 2, family: 'pattern', params: function () { return [0]; },
      text: function () { return 'It has a double letter'; },
      test: function (o) {
        var same = function (a, b) { return a === b; };
        if (pairIn(o.parts, same)) return YES;
        return pairAcross(o.letters, same) ? MAYBE : NO;
      },
      guide: ['Double letters', 'A double letter is the same letter twice in a row inside one word, like the LL in BALL or the EE in TREE.']
    },
    vowelPair: {
      tier: 3, family: 'vowels', params: function () { return [0]; },
      text: function () { return 'It has two vowels in a row'; },
      test: function (o) {
        var strict = pairIn(o.parts, function (a, b) { return isVowel(a) && isVowel(b); });
        var loose = pairAcross(o.letters, function (a, b) { return isVowel(a, true) && isVowel(b, true); });
        return strict ? YES : loose ? MAYBE : NO;
      },
      guide: ['Two vowels in a row', 'Two vowels side by side inside one word, like the OO in BOOT or the EA in TEAPOT.']
    },
    vowelsMin: {
      tier: 3, family: 'vowels', params: function () { return [3, 4, 5]; },
      text: function (k) { return 'It has ' + num(k) + ' or more vowels'; },
      test: function (o, k) { return either(vowelCount(o.letters) >= k, vowelCount(o.letters, true) >= k); },
      guide: ['Vowels', 'Only A, E, I, O and U are vowels. The letter Y never counts as a vowel in this book. Count every vowel, even repeats: BANANA has three.']
    },
    vowelsMax: {
      tier: 3, family: 'vowels', params: function () { return [2, 3]; },
      text: function (k) { return 'It has fewer than ' + num(k) + ' vowels'; },
      test: function (o, k) { return either(vowelCount(o.letters) < k, vowelCount(o.letters, true) < k); },
      guide: ['Vowels', 'Only A, E, I, O and U are vowels. The letter Y never counts as a vowel in this book. Count every vowel, even repeats: BANANA has three.']
    },
    startsVowel: {
      tier: 2, family: 'start', params: function () { return [0]; },
      text: function () { return 'It starts with a vowel'; },
      test: function (o) { return either(isVowel(o.letters[0]), isVowel(o.letters[0], true)); },
      guide: ['Vowels', 'Only A, E, I, O and U are vowels. The letter Y never counts as a vowel in this book. Count every vowel, even repeats: BANANA has three.']
    },
    endsVowel: {
      tier: 2, family: 'end', params: function () { return [0]; },
      text: function () { return 'It ends with a vowel'; },
      test: function (o) { var c = o.letters[o.len - 1]; return either(isVowel(c), isVowel(c, true)); },
      guide: ['Vowels', 'Only A, E, I, O and U are vowels. The letter Y never counts as a vowel in this book. Count every vowel, even repeats: BANANA has three.']
    },
    sameEnds: {
      tier: 3, family: 'pattern', params: function () { return [0]; },
      text: function () { return 'It starts and ends with the same letter'; },
      test: function (o) { return o.letters[0] === o.letters[o.len - 1] ? YES : NO; },
      guide: ['Same first and last letter', 'The very first and the very last letter match, like TOAST or ROLLER.']
    },
    firstHalf: {
      tier: 2.5, family: 'alpha', params: function () { return [0]; },
      text: function () { return 'It starts with a letter from A to M'; },
      test: function (o) { return o.letters[0] <= 'M' ? YES : NO; },
      guide: ['A to M, N to Z', '“A to M” means the first letter is one of A B C D E F G H I J K L M. “N to Z” means N O P Q R S T U V W X Y Z.']
    },
    secondHalf: {
      tier: 2.5, family: 'alpha', params: function () { return [0]; },
      text: function () { return 'It starts with a letter from N to Z'; },
      test: function (o) { return o.letters[0] >= 'N' ? YES : NO; },
      guide: ['A to M, N to Z', '“A to M” means the first letter is one of A B C D E F G H I J K L M. “N to Z” means N O P Q R S T U V W X Y Z.']
    },
    lacks: {
      tier: 3, family: 'lacks', params: function () { return 'AEIOURSTLN'.split(''); },
      text: function (L) { return 'It does not contain the letter ' + L; },
      test: function (o, L) { return o.letters.indexOf(L) === -1 ? YES : NO; },
      guide: ['“Does not” clues', '“Cross it out if it does not contain the letter E” means you cross out every option with no E in it. The options that do have an E stay.']
    },
    both: {
      tier: 3.5, family: 'has', params: null, // built per line-up from the letters that are there
      text: function (p) { return 'It contains both ' + p[0] + ' and ' + p[1]; },
      test: function (o, p) { return o.letters.indexOf(p[0]) !== -1 && o.letters.indexOf(p[1]) !== -1 ? YES : NO; },
      guide: ['Two letters', '“It contains both R and T” needs both letters somewhere in the option, in any order.']
    },
    twice: {
      tier: 3.5, family: 'pattern', params: function () { return 'AEIORSTLNPC'.split(''); },
      text: function (L) { return 'It contains the letter ' + L + ' at least twice'; },
      test: function (o, L) { var n = 0; for (var i = 0; i < o.len; i++) if (o.letters[i] === L) n++; return n >= 2 ? YES : NO; },
      guide: ['Repeated letters', '“At least twice” means the letter appears two or more times anywhere in the option, like the Ps in PUPPET.']
    },
    // knowledge clues from the pack; param = index of the fact in the pack
    fact: {
      tier: 1, family: 'fact', params: null,
      guide: ['Everyday knowledge', 'Clues such as “It is a fruit” or “It has four legs” use plain common sense. They are only used where the answer is clear for every option in the line-up.']
    },
    notFact: {
      tier: 3, family: 'fact', params: null,
      guide: ['“It is not…” clues', '“Cross it out if it is not a fruit” means you cross out everything that is not a fruit. The fruits stay.']
    }
  };

  // The order clue-guide entries are printed in.
  var GUIDE_ORDER = ['has', 'starts', 'ends', 'longer', 'shorter', 'exactly', 'even', 'odd', 'multi', 'single', 'double',
    'vowelPair', 'vowelsMin', 'vowelsMax', 'startsVowel', 'endsVowel', 'sameEnds', 'firstHalf', 'secondHalf', 'lacks', 'both', 'twice', 'fact', 'notFact'];

  /*
   * Every clue that can be used on this line-up, with its masks.
   * opts: { answer (index), facts: [{ clue, not, yes:[idx], maybe:[idx], fi }], maxTier, types (allowed type ids) }
   * Returns [{ id, type, param, text, tier, family, yes, maybe }] where yes/maybe are bit masks.
   * A clue is left out when it touches the answer (YES or MAYBE) or crosses nothing out.
   */
  function candidates(infos, opts) {
    var n = infos.length, ans = 1 << opts.answer, out = [], seen = {};
    var allowed = opts.types || null;
    function add(type, param, text, tier, family, yes, maybe) {
      if (!yes || (yes & ans) || (maybe & ans)) return;
      var key = yes + ':' + maybe;
      // two clues with the same effect: keep the plainer one
      if (seen[key] && seen[key].tier <= tier) return;
      var c = { id: type + ':' + (Array.isArray(param) ? param.join('') : param), type: type, param: param, text: text, tier: tier, family: family, yes: yes, maybe: maybe };
      if (seen[key]) out[out.indexOf(seen[key])] = c; else out.push(c);
      seen[key] = c;
    }
    function masks(test, param) {
      var yes = 0, maybe = 0;
      for (var i = 0; i < n; i++) {
        var r = test(infos[i], param);
        if (r === YES) yes |= 1 << i; else if (r === MAYBE) maybe |= 1 << i;
      }
      return [yes, maybe];
    }
    Object.keys(TYPES).forEach(function (type) {
      var T = TYPES[type];
      if (type === 'fact' || type === 'notFact') return;
      if (allowed && allowed.indexOf(type) === -1) return;
      if (T.tier > opts.maxTier) return;
      var params = T.params ? T.params() : pairParams(infos);
      params.forEach(function (p) {
        var m = masks(T.test, p);
        add(type, p, T.text(p), T.tier, T.family, m[0], m[1]);
      });
    });
    (opts.facts || []).forEach(function (f) {
      var yes = 0, maybe = 0, i;
      for (i = 0; i < f.yes.length; i++) yes |= 1 << f.yes[i];
      for (i = 0; i < f.maybe.length; i++) maybe |= 1 << f.maybe[i];
      if (!allowed || allowed.indexOf('fact') !== -1) add('fact', f.fi, f.clue, TYPES.fact.tier, 'fact', yes, maybe);
      if (f.not && TYPES.notFact.tier <= opts.maxTier && (!allowed || allowed.indexOf('notFact') !== -1)) {
        var all = (n >= 31 ? -1 : (1 << n) - 1);
        add('notFact', f.fi, f.not, TYPES.notFact.tier, 'fact', all & ~yes & ~maybe, maybe);
      }
    });
    return out;
  }

  // "contains both" pairs: letters that each appear in at least a quarter of the line-up
  function pairParams(infos) {
    var counts = {};
    infos.forEach(function (o) {
      var seen = {};
      for (var i = 0; i < o.len; i++) { var c = o.letters[i]; if (!seen[c]) { seen[c] = 1; counts[c] = (counts[c] || 0) + 1; } }
    });
    var common = Object.keys(counts).filter(function (c) { return counts[c] >= Math.max(3, infos.length / 4); }).sort();
    var out = [];
    for (var a = 0; a < common.length; a++) for (var b = a + 1; b < common.length; b++) out.push([common[a], common[b]]);
    return out;
  }

  // Re-evaluates a clue on a line-up from its type and parameter (used by the checks).
  function evaluate(clue, infos, facts) {
    var out = [];
    if (clue.type === 'fact' || clue.type === 'notFact') {
      var f = facts[clue.param];
      for (var i = 0; i < infos.length; i++) {
        var r = f.yes.indexOf(i) !== -1 ? YES : f.maybe.indexOf(i) !== -1 ? MAYBE : NO;
        if (clue.type === 'notFact' && r !== MAYBE) r = r === YES ? NO : YES;
        out.push(r);
      }
      return out;
    }
    var T = TYPES[clue.type];
    for (var j = 0; j < infos.length; j++) out.push(T.test(infos[j], clue.param));
    return out;
  }

  // The clue-guide entries for a set of used clue types, merged by heading, in print order.
  function guideFor(usedTypes) {
    var seen = {}, out = [];
    GUIDE_ORDER.forEach(function (t) {
      if (!usedTypes[t]) return;
      var g = TYPES[t].guide;
      if (seen[g[0]]) return;
      seen[g[0]] = true;
      out.push({ head: g[0], text: g[1] });
    });
    return out;
  }

  function popcount(x) { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }

  CX.clues = {
    NO: NO, YES: YES, MAYBE: MAYBE, TYPES: TYPES, VOWELS: VOWELS,
    cleanOption: cleanOption, info: info, candidates: candidates, evaluate: evaluate, guideFor: guideFor,
    popcount: popcount, num: num
  };
})(typeof window !== 'undefined' ? window : globalThis);
