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

  /*
   * Fill-in-the-blank gaps ("Silent ___, holy night") must survive the markdown cleanup, which
   * strips underscores. A gap is a run of three or more underscores, or one or two standing on
   * their own ("Silent __"); __bold__ and _italic_ are not gaps. hideBlanks swaps each gap
   * underscore for a placeholder, showBlanks brings them back (a one- or two-mark gap becomes ___).
   */
  var GAP = '\u0001';
  function hideBlanks(s) {
    return String(s || '')
      .replace(/_{3,}/g, function (m) { return m.replace(/_/g, GAP); })
      .replace(/(^|[\s(\[{"'“‘\/—–-])_{1,2}(?=$|[\s,.;:!?)\]}"'”’\/—–-])/g, '$1' + GAP + GAP + GAP);
  }
  function showBlanks(s) { return String(s || '').replace(/\u0001/g, '_'); }

  // Prose cleanup: strip markdown marks, fix dashes and quotes, split paragraphs.
  // Returns an array of paragraph strings.
  function cleanParagraphs(text) {
    var t = hideBlanks(String(text || '').replace(/\r\n?/g, '\n'));
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
    return paras.map(function (p) { return smartQuotes(showBlanks(p)); });
  }

  function cleanTitle(s) {
    var t = hideBlanks(String(s || '').replace(/[\r\n]+/g, ' ')).replace(/[*#_`]/g, '');
    t = t.replace(/^\s*(?:chapter|ch\.?)\s*\d+\s*[:.\-–—]?\s*/i, '');
    t = t.replace(/^["'“‘]+|["'”’]+$/g, '').replace(/\s+/g, ' ').trim();
    return smartQuotes(showBlanks(t));
  }

  function cleanLine(s) {
    var t = hideBlanks(String(s || '').replace(/[\r\n]+/g, ' ')).replace(/[*#_`]/g, '').replace(/\s+/g, ' ').trim();
    t = t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    return smartQuotes(showBlanks(t));
  }

  // Shorten to max characters at a word boundary.
  function shortenAtWord(s, max) {
    if (s.length <= max) return s;
    var cut = s.slice(0, max + 1);
    var sp = cut.lastIndexOf(' ');
    return (sp > max * 0.5 ? cut.slice(0, sp) : s.slice(0, max)).replace(/[\s,;:—\-]+$/, '');
  }

  CX.text = {
    stripAccents: stripAccents, smartQuotes: smartQuotes, cleanParagraphs: cleanParagraphs,
    cleanTitle: cleanTitle, cleanLine: cleanLine, hideBlanks: hideBlanks, showBlanks: showBlanks, shortenAtWord: shortenAtWord
  };
})(typeof window !== 'undefined' ? window : globalThis);
