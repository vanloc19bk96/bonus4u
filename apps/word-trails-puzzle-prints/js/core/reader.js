/*
 * Reads what the AI chat sent back. It is forgiving on purpose: people paste the whole reply, with
 * or without the code block, and chat models drift from the format (bold marks, numbers, one word
 * to a line, "Spangram" for "Span"). Words it cannot use are counted and explained, never guessed.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var T = CX.text;

  // Plain lines without chat formatting.
  function lines(text) {
    var t = String(text || '').replace(/\r\n?/g, '\n').replace(/\\n/g, '\n');
    t = t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ');
    return t.split('\n').map(function (l) {
      return l.replace(/^\s*```.*$/, '').replace(/^\s{0,3}#{1,6}\s*/, '').replace(/\*\*|__/g, '').replace(/^\s*>\s?/, '').trim();
    });
  }

  function clean(s) { return T.cleanLine(String(s || '').replace(/^\s*[*_"]+|[*_"]+\s*$/g, '')); }

  var RE_PUZZLE = /^(?:puzzle|set|pack)\s*(?:no\.?\s*|#\s*)?(\d{1,3})\b\s*(?:\([^)]*\))?\s*(?:[:.\-–—]\s*(.*))?$/i;
  var RE_WORDS = /^(?:(?:theme\s+)?words?(?:\s+list)?|list)\s*(?:\([^)]*\))?\s*:\s*(.*)$/i;
  var RE_TITLE = /^(?:title|clue|hint\s+title)\s*[:\-–—]\s*(.+)$/i;
  var RE_THEME = /^(?:theme|meaning|plain\s+theme|plain\s+meaning)\s*[:\-–—]\s*(.+)$/i;
  var RE_SPAN = /^(?:span(?:\s*word)?|spangram|edge\s*word)\s*(?:\([^)]*\))?\s*[:\-–—]\s*(.+)$/i;

  // The word part of a list item: "1. TOWEL", "- Towel (5)", "TOWEL - something soft".
  function wordOf(item) {
    return T.stripAccents(String(item || '')).replace(/^\s*(?:[-*•]\s*|\d{1,2}[.)]\s*)/, '').replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/\s+[-–—:]\s.*$/, '').replace(/[.,;!]+$/, '').trim();
  }

  function addWord(cur, raw, skipped) {
    var s = wordOf(raw);
    if (!s || /^\.+$|^…$/.test(s) || /^(?:etc|and so on)$/i.test(s)) return;
    var w = s.toUpperCase();
    if (/[ \-']/.test(w)) { skipped.push({ w: s, why: 'it is more than one word' }); return; }
    if (!/^[A-Z]+$/.test(w)) { skipped.push({ w: s, why: 'it has more than letters in it' }); return; }
    if (w.length < 3) { skipped.push({ w: s, why: 'it is shorter than 3 letters' }); return; }
    if (cur.words.indexOf(w) === -1) cur.words.push(w);
  }

  function addWordLine(cur, line, skipped) {
    line.split(/[,;|/]/).forEach(function (x) { addWord(cur, x, skipped); });
  }

  // A span word stays as the AI wrote it for print ("BE MY GUEST"); the grid only uses its letters.
  function cleanSpan(s) {
    return T.stripAccents(clean(s)).toUpperCase().replace(/\s*\([^)]*\)\s*$/, '').replace(/['’]/g, '').replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /*
   * A puzzles reply. Returns {
   *   puzzles: [{ no (0 when the reply has no PUZZLE lines), title, theme, span, words: [] }],
   *   skipped: [{ w, why }]
   * }
   */
  function readPuzzles(text) {
    var out = [], skipped = [], cur = null, field = null;
    function start(no, title) { cur = { no: no, title: title || '', theme: '', span: '', words: [] }; out.push(cur); }
    // a field that is already set on a puzzle starts the next one, when the reply has no PUZZLE lines
    function need(key) { if (!cur || (cur[key] && (key !== 'words' || cur[key].length))) start(0, ''); return cur; }
    lines(text).forEach(function (l) {
      if (!l) { if (field !== 'words' || (cur && cur.words.length)) field = null; return; }
      var m;
      if ((m = RE_PUZZLE.exec(l))) { start(+m[1], clean(m[2] || '')); field = null; return; }
      if ((m = RE_WORDS.exec(l))) { if (!cur) start(0, ''); field = 'words'; if (m[1]) addWordLine(cur, m[1], skipped); return; }
      if ((m = RE_SPAN.exec(l))) { need('span').span = cleanSpan(m[1]); field = null; return; }
      if ((m = RE_TITLE.exec(l))) { need('title').title = T.cleanTitle(m[1]); field = null; return; }
      if ((m = RE_THEME.exec(l))) { need('theme').theme = clean(m[1]); field = null; return; }
      if (field === 'words') addWordLine(cur, l, skipped);
    });
    return { puzzles: out.filter(function (p) { return p.words.length || p.span || p.title || p.theme; }), skipped: skipped };
  }

  var SECTIONS = [
    { key: 'welcome', re: /^(?:welcome|intro(?:duction)?|opening(?:\s+note)?)\s*(?:note)?\s*(?::\s*(.*))?$/i },
    { key: 'closing', re: /^(?:closing|thank\s*you|last\s+page)\s*(?:note)?\s*(?::\s*(.*))?$/i },
    { key: 'blurb', re: /^(?:back\s+cover(?:\s+(?:text|description|blurb))?|blurb|book\s+description)\s*(?::\s*(.*))?$/i }
  ];

  // The extras reply: { welcome: [paragraphs], closing: [paragraphs], blurb: '' }.
  function readExtras(text) {
    var buf = { welcome: [], closing: [], blurb: [] }, key = null;
    lines(text).forEach(function (l) {
      for (var i = 0; i < SECTIONS.length; i++) {
        var m = SECTIONS[i].re.exec(l);
        if (!m) continue;
        key = SECTIONS[i].key;
        if (m[1]) buf[key].push(m[1]);
        return;
      }
      if (key) buf[key].push(l);
    });
    return { welcome: T.cleanParagraphs(buf.welcome.join('\n')), closing: T.cleanParagraphs(buf.closing.join('\n')), blurb: T.cleanParagraphs(buf.blurb.join('\n')).join('\n') };
  }

  // Which kind of reply this looks like.
  function kind(text) {
    var r = readPuzzles(text);
    if (r.puzzles.some(function (p) { return p.words.length || p.span || p.no; })) return 'puzzles';
    var e = readExtras(text);
    if (e.welcome.length || e.closing.length || e.blurb) return 'extras';
    return r.skipped.length ? 'puzzles' : 'unknown';
  }

  CX.reader = { lines: lines, readPuzzles: readPuzzles, readExtras: readExtras, kind: kind, cleanSpan: cleanSpan };
})(typeof window !== 'undefined' ? window : globalThis);
