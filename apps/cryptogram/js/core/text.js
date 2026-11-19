/* Text cleanup for print: curly quotes, dashes, and stripping the formatting marks AI chats add. */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  function stripAccents(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
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

  var SMALL = /^(?:a|an|and|at|by|for|from|in|of|on|or|the|to|with|&)$/i;

  /*
   * Breaks words into n lines whose widest line is as narrow as it can be, so a title reads
   * "Word Links / Puzzle Book for Adults", not "Word Links Puzzle Book for / Adults". No line ends on
   * a small word like "for", and when lead (the puzzle's name) starts the text it gets the first line
   * to itself. width(str) measures a line; null when no break keeps every line within maxW.
   */
  function balance(words, width, maxW, n, lead) {
    var best = null, bestCost = 1e9, lw = lead ? String(lead).trim().toLowerCase().split(/\s+/) : [], at = -1;
    for (var k = 0; lw.length && k + lw.length <= words.length; k++) {
      if (words.slice(k, k + lw.length).join(' ').toLowerCase() === lw.join(' ')) { at = k; break; }
    }
    // breaks: the index of the first word of every line after the first
    function go(start, left, breaks) {
      if (left === 1) {
        var starts = [0].concat(breaks), widest = 0, cost = 0;
        for (var i = 0; i < starts.length; i++) {
          var line = words.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : words.length);
          var wd = width(line.join(' '));
          if (wd > maxW) return;
          widest = Math.max(widest, wd);
          if (i < starts.length - 1 && SMALL.test(line[line.length - 1])) cost += maxW * 0.5;
        }
        if (at >= 0) {
          breaks.forEach(function (b) { if (b > at && b < at + lw.length) cost += maxW; });           // never split the name
          if (at === 0 && breaks[0] === lw.length) cost -= maxW * 0.35;                                // the name on a line of its own
        }
        cost += widest;
        if (cost < bestCost) { bestCost = cost; best = starts.map(function (st, i) { return words.slice(st, i + 1 < starts.length ? starts[i + 1] : words.length).join(' '); }); }
        return;
      }
      for (var end = start + 1; end <= words.length - left + 1; end++) go(end, left - 1, breaks.concat([end]));
    }
    if (n <= 1 || words.length < n || words.length > 16) return null;
    go(0, n, []);
    return best;
  }

  CX.text = {
    balance: balance,
    stripAccents: stripAccents, smartQuotes: smartQuotes, cleanParagraphs: cleanParagraphs,
    cleanTitle: cleanTitle, cleanLine: cleanLine, shortenAtWord: shortenAtWord
  };
})(typeof window !== 'undefined' ? window : globalThis);
