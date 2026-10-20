/* Text cleanup for print: word normalization, curly quotes, stripping AI formatting marks. */
(function (root) {
  'use strict';
  var Cozy = root.Cozy = root.Cozy || {};

  function stripAccents(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Grid form: uppercase A-Z only. "Mrs. Pettigrew's" -> "MRSPETTIGREWS"
  function normalizeWord(s) {
    return stripAccents(s).toUpperCase().replace(/[^A-Z]/g, '');
  }

  // Printed form of a list word: uppercase, original spaces/hyphens/apostrophes kept.
  function displayWord(s) {
    var t = String(s || '').replace(/[‘’ʼ`]/g, "'").replace(/[‐-―]/g, '-');
    t = t.replace(/[^A-Za-zÀ-ɏ' .\-&]/g, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/^[' .\-&]+|[' .\-&]+$/g, '');
    t = t.toUpperCase();
    return smartQuotes(t);
  }

  function reverse(s) { return s.split('').reverse().join(''); }

  function isPalindrome(s) { return s.length > 1 && s === reverse(s); }

  // True when b can be read inside a's placement in any direction (forward or backward).
  function containsEither(a, b) {
    return a.indexOf(b) !== -1 || reverse(a).indexOf(b) !== -1;
  }

  // Straight quotes to curly quotes, using the surrounding characters.
  function smartQuotes(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c !== '"' && c !== "'") { out += c; continue; }
      var prev = i > 0 ? s[i - 1] : '';
      var next = i < s.length - 1 ? s[i + 1] : '';
      var openCtx = prev === '' || /[\s(\[{—–\-\/“‘]/.test(prev);
      if (c === '"') {
        out += openCtx ? '“' : '”';
      } else {
        if (/[A-Za-z0-9À-ɏ]/.test(prev) && /[A-Za-zÀ-ɏ]/.test(next)) out += '’'; // don't, Hattie's
        else if (openCtx && /^(?:tis|twas|em|cause|til|round|n\b)/i.test(s.slice(i + 1, i + 6))) out += '’'; // 'em, 'twas
        else if (openCtx && /[0-9]/.test(next)) out += '’'; // '90s
        else if (openCtx) out += '‘';
        else out += '’';
      }
    }
    return out;
  }

  // Prose cleanup: strip markdown marks, fix dashes and quotes, split paragraphs.
  // Returns an array of paragraph strings.
  function cleanParagraphs(text) {
    var t = String(text || '').replace(/\r\n?/g, '\n');
    t = t.replace(/\\n/g, '\n'); // literal "\n" left by some chat tools
    t = t.replace(/[‘’]/g, "'").replace(/[“”„«»]/g, '"');
    t = t.replace(/<\/?[a-z][^>]*>/gi, ''); // stray html tags
    t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '');      // headings
    t = t.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, ''); // list bullets
    t = t.replace(/\*{1,3}|_{2,3}|`+|~~/g, '');      // emphasis marks
    t = t.replace(/(^|\s)_([^_\n]+)_(?=\s|[.,;:!?]|$)/g, '$1$2');
    t = t.replace(/[ \t]*---+[ \t]*/g, '—').replace(/[ \t]*--[ \t]*/g, '—');
    t = t.replace(/\s+—\s+/g, '—');
    t = t.replace(/\.\s?\.\s?\./g, '…');
    t = t.replace(/[ \t ]+/g, ' ');
    var paras = t.split(/\n+/).map(function (p) { return p.trim(); }).filter(Boolean);
    return paras.map(function (p) { return smartQuotes(p); });
  }

  function cleanTitle(s) {
    var t = String(s || '').replace(/[\r\n]+/g, ' ').replace(/[*#_`]/g, '');
    t = t.replace(/^\s*(?:chapter|ch\.?)\s*\d+\s*[:.\-–—]?\s*/i, '');
    t = t.replace(/^["'“‘]+|["'”’]+$/g, '').replace(/\s+/g, ' ').trim();
    return smartQuotes(t);
  }

  function cleanLine(s) {
    var t = String(s || '').replace(/[\r\n]+/g, ' ').replace(/[*#_`]/g, '').replace(/\s+/g, ' ').trim();
    t = t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    return smartQuotes(t);
  }

  // Shorten to max characters at a word boundary.
  function shortenAtWord(s, max) {
    if (s.length <= max) return s;
    var cut = s.slice(0, max + 1);
    var sp = cut.lastIndexOf(' ');
    return (sp > max * 0.5 ? cut.slice(0, sp) : s.slice(0, max)).replace(/[\s,;:—\-]+$/, '');
  }

  // Uppercase letters-only token stream, used to check a word appears in the text.
  function letterTokens(text) {
    return stripAccents(text).toUpperCase().replace(/['’]/g, '').split(/[^A-Z]+/).filter(Boolean);
  }

  function wordInText(display, tokens) {
    var parts = letterTokens(display);
    if (!parts.length) return false;
    for (var i = 0; i + parts.length <= tokens.length; i++) {
      var ok = true;
      for (var j = 0; j < parts.length; j++) {
        var t = tokens[i + j], p = parts[j];
        // allow simple plural/possessive in the text ("kettles", "Hattie's")
        if (!(t === p || (j === parts.length - 1 && (t === p + 'S' || t === p + 'ES')))) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  Cozy.text = {
    stripAccents: stripAccents, normalizeWord: normalizeWord, displayWord: displayWord,
    reverse: reverse, isPalindrome: isPalindrome, containsEither: containsEither,
    smartQuotes: smartQuotes, cleanParagraphs: cleanParagraphs, cleanTitle: cleanTitle,
    cleanLine: cleanLine, shortenAtWord: shortenAtWord, letterTokens: letterTokens, wordInText: wordInText
  };
})(typeof window !== 'undefined' ? window : globalThis);
