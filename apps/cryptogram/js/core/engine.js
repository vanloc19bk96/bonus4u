/*
 * The cryptogram rules the app can prove. Any sentence with enough letters makes a fair puzzle:
 * every letter A to Z gets its own code letter (or number), no letter stands for itself and no two
 * letters swap with each other, and the same letter always has the same code inside one puzzle.
 * Each puzzle has its own code. Nothing about the sentence can stop a code from being made, so the
 * only things that keep a puzzle out of the book are no text, too few letters, or too much text
 * for a page (the layout checks that).
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var U = CX.util;

  var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var MIN_LETTERS = 15;     // fewer letters is not a puzzle: a few code letters give it all away
  var MAX_TEXT = 600;       // characters kept of one sentence (a page never holds more)
  var MARKS = '.,;:!?\'"-—–()&/%$#@*+=…';

  // Letters outside A to Z that plain capitals can stand in for.
  var SPELL = { 'ß': 'SS', 'Æ': 'AE', 'æ': 'ae', 'Œ': 'OE', 'œ': 'oe', 'Ø': 'O', 'ø': 'o', 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Þ': 'Th', 'þ': 'th' };

  /*
   * A sentence as the book prints it in the solutions: chat formatting gone, straight quotes,
   * single spaces, no quotation marks around the whole of it.
   */
  function clean(s) {
    var t = String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/\\n/g, ' ');
    t = t.replace(/[‘’‚‛′`´]/g, "'").replace(/[“”„‟″«»]/g, '"');
    t = t.replace(/<\/?[a-z][^>]*>/gi, '').replace(/\*{1,3}|_{2,}|~~|#+\s/g, '');
    t = t.replace(/\s*—\s*|\s+--?\s+|\s*---?\s*(?=\S)/g, ' — ').replace(/–/g, '-');
    t = t.replace(/\.\s?\.\s?\./g, '…');
    t = t.replace(/[ \t\n ]+/g, ' ').trim();
    // quotation marks around the whole sentence
    for (var i = 0; i < 2; i++) {
      var m = /^["'](.*)["']$/.exec(t);
      if (m && m[1].indexOf('"') < 0) t = m[1].trim();
    }
    t = t.replace(/^[-–—•*\s]+/, '').replace(/\s+([,.;:!?])/g, '$1');
    if (t.length > MAX_TEXT) t = CX.text.shortenAtWord(t, MAX_TEXT);
    return t;
  }

  // A name or reference under a sentence: no leading dash, no quotes, no trailing full stop.
  function cleanBy(s) {
    var t = clean(s).replace(/^(?:by|author|source|from)\s*[:\-–—]\s*/i, '').replace(/^[-–—\s]+/, '').replace(/^["']+|["']+$/g, '').trim();
    t = t.replace(/\s*\.$/, '');
    return t.slice(0, 80).trim();
  }

  // The capitals a puzzle is coded from: accents and odd letters spelled plainly, unknown signs out.
  function upper(s) {
    var t = String(s || '').replace(/[ßÆæŒœØøŁłĐđÞþ]/g, function (c) { return SPELL[c]; });
    t = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    var out = '';
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === ' ' || MARKS.indexOf(c) >= 0) out += c;
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  function letterCount(s) { var n = 0, t = upper(s); for (var i = 0; i < t.length; i++) if (t[i] >= 'A' && t[i] <= 'Z') n++; return n; }

  function freq(s) {
    var f = {}, t = upper(s);
    for (var i = 0; i < t.length; i++) { var c = t[i]; if (c >= 'A' && c <= 'Z') f[c] = (f[c] || 0) + 1; }
    return f;
  }

  /*
   * The words of a coded text, ready for the layout: [{ cells: [{ k: 'L' | 'P', ch }], glue }].
   * A word may break after a hyphen or a dash: the piece that follows has glue (no space before it).
   */
  function units(s) {
    var out = [];
    upper(s).split(' ').forEach(function (w) {
      if (!w) return;
      // pieces end after each hyphen or dash ("SELF-", "HELP"); no lookbehind, for older Safari
      var pieces = [], cur = '';
      for (var j0 = 0; j0 < w.length; j0++) {
        cur += w[j0];
        if ((w[j0] === '-' || w[j0] === '—') && j0 < w.length - 1) { pieces.push(cur); cur = ''; }
      }
      if (cur) pieces.push(cur);
      pieces.forEach(function (pc, i) {
        var cells = [];
        for (var j = 0; j < pc.length; j++) cells.push({ k: pc[j] >= 'A' && pc[j] <= 'Z' ? 'L' : 'P', ch: pc[j] });
        out.push({ cells: cells, glue: i > 0 });
      });
    });
    return out;
  }

  /*
   * The code of one puzzle: { A: 'Q', B: 'F', ... } or { A: 7, ... } for numbers. Seeded, so a
   * puzzle keeps its code. Letters: no letter stands for itself and no two letters swap with each
   * other (A=Q and Q=A would give two letters for one). Numbers: no letter gets its place in the
   * alphabet (A=1, B=2...).
   */
  function makeKey(seed, code) {
    var rng = U.makeRng(seed);
    if (code === 'numbers') {
      for (var t = 0; t < 500; t++) {
        var nums = rng.shuffle(U.range(1, 26));
        if (nums.every(function (n, i) { return n !== i + 1; })) return mapOf(nums);
      }
      return mapOf(U.range(2, 26).concat([1]));
    }
    for (var k = 0; k < 5000; k++) {
      var p = rng.shuffle(ABC.split(''));
      var ok = true;
      for (var i = 0; i < 26 && ok; i++) {
        if (p[i] === ABC[i]) ok = false;
        else if (p[ABC.indexOf(p[i])] === ABC[i]) ok = false;
      }
      if (ok) return mapOf(p);
    }
    // a shift by 3 always works: no letter on itself, no swaps
    return mapOf(ABC.split('').map(function (c, i) { return ABC[(i + 3) % 26]; }));
  }
  function mapOf(list) { var m = {}; for (var i = 0; i < 26; i++) m[ABC[i]] = list[i]; return m; }

  // The plain letter behind each code: { Q: 'A', ... } (or { 7: 'A' }).
  function invert(key) { var m = {}; Object.keys(key).forEach(function (k) { m[key[k]] = k; }); return m; }

  // Letters most used in the sentence first; ties go by the alphabet, so the choice never moves.
  function ranked(s) {
    var f = freq(s);
    return Object.keys(f).sort(function (a, b) { return f[b] - f[a] || (a < b ? -1 : 1); });
  }

  /*
   * The letters printed for the solver at the start: the most used ones, but always leaving at
   * least four different letters to find.
   */
  function given(s, n) {
    var r = ranked(s);
    return r.slice(0, Math.max(0, Math.min(n, r.length - 4)));
  }

  // The hint at the back: the most used letter that is not given (null when nothing is left).
  function hint(s, givenList) {
    var r = ranked(s).filter(function (c) { return (givenList || []).indexOf(c) < 0; });
    return r.length > 1 ? r[0] : null;
  }

  // The coded form of a text, for the check prompt and the tests: "QFRR GBMT..." / "7-3-12 ...".
  function encode(s, key) {
    var t = upper(s), out = '';
    for (var i = 0; i < t.length; i++) out += t[i] >= 'A' && t[i] <= 'Z' ? String(key[t[i]]) + (typeof key.A === 'number' ? '·' : '') : t[i];
    return out;
  }

  // Things that keep a puzzle out of the book, in plain words.
  function problems(d) {
    var text = String((d && d.text) || '').trim();
    if (!text) return ['it has no text yet'];
    var n = letterCount(text);
    if (n < MIN_LETTERS) return ['it is too short (' + n + ' letters; a puzzle needs at least ' + MIN_LETTERS + ')'];
    return [];
  }

  // A text as a key for spotting the same sentence twice.
  function sameKey(s) { return upper(s).replace(/[^A-Z]/g, ''); }

  CX.engine = {
    ABC: ABC, MIN_LETTERS: MIN_LETTERS, clean: clean, cleanBy: cleanBy, upper: upper, letterCount: letterCount, freq: freq, units: units,
    makeKey: makeKey, invert: invert, ranked: ranked, given: given, hint: hint, encode: encode, problems: problems, sameKey: sameKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
