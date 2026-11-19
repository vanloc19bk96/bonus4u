/*
 * Reads what the AI chat sent back. It is forgiving on purpose: people paste the whole reply, with
 * or without the code block, and chat models drift from the format (bold marks, numbered lists,
 * "quote" — Author on one line, a joke's answer on the next line). Nothing is guessed beyond that:
 * what does not read as a sentence is left out, and the app says which puzzles are still empty.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var T = CX.text, E = CX.engine;

  // Plain lines without chat formatting.
  function lines(text) {
    var t = String(text || '').replace(/\r\n?/g, '\n').replace(/\\n/g, '\n');
    t = t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ');
    return t.split('\n').map(function (l) {
      return l.replace(/^\s*```.*$/, '').replace(/^\s{0,3}#{1,6}\s*/, '').replace(/\*\*/g, '').replace(/^\s*>\s?/, '').replace(/^\s*[-*•]\s+(?=\S)/, '').trim();
    });
  }

  var RE_PUZZLE = /^(?:puzzle|cryptogram|quote|code)\s*(?:no\.?\s*|#\s*)?(\d{1,3})\b\s*(?:\([^)]*\))?\s*(?:[:.\-–—]\s*(.*))?$/i;
  var RE_TEXT = /^(?:text|quote|quotation|sentence|verse|fact|fun\s*fact|joke|riddle|saying|proverb|message|q|question)\s*[:\-–—]\s*(.*)$/i;
  var RE_BY = /^(?:by|author|source|reference|ref|origin|attribution|said\s+by|name|credit)\s*[:\-–—]\s*(.*)$/i;
  var RE_ANSWER = /^(?:a|answer|punchline)\s*[:\-–—]\s*(.+)$/i;
  var RE_NUM = /^(\d{1,3})\s*[.):]\s+(.+)$/;
  var RE_DASH_BY = /^[-–—~]+\s*(.+)$/;
  var RE_CHATTER = /^(?:here(?:'s| is| are)|sure|certainly|of course|below|absolutely|great|i (?:hope|have|can)|let me|these|enjoy|happy)\b|:\s*$/i;

  // "Mark Twain", "Irish proverb", "Psalm 23:1", "William Shakespeare, Hamlet": a name, not more text.
  function looksLikeBy(s) {
    s = String(s || '').trim().replace(/^["']|["']$/g, '');
    if (!s || s.length > 60 || /[.!?]$/.test(s) && !/\b[A-Z]\.$/.test(s)) return false;
    var w = s.split(/\s+/);
    if (w.length > 7) return false;
    return /^[A-Z0-9]/.test(s) && w.every(function (x) { return /^[A-Z0-9(]/.test(x) || /^(?:of|the|de|van|von|da|du|la|le|and|proverb|saying|wisdom|folk|tradition|traditional|unknown)[,)]?$/i.test(x) || /^\d/.test(x); });
  }

  // One line that holds a sentence and maybe its name: '"Well done..." — Benjamin Franklin'.
  function inline(rest) {
    var s = String(rest || '').trim(), m;
    if ((m = /^"(.+)"\s*(?:[-–—~]+|,|\(|by\b)\s*(.+?)\)?\s*$/i.exec(s)) && looksLikeBy(m[2])) return { text: m[1], by: m[2] };
    if ((m = /^(.+?)\s+[-–—~]{1,2}\s+([^–—]+)$/.exec(s)) && looksLikeBy(m[2])) return { text: m[1], by: m[2] };
    if ((m = /^(.+?)\s*\|\s*(.*)$/.exec(s))) return { text: m[1], by: m[2] };
    return { text: s, by: '' };
  }

  function stripQA(l) { return String(l).replace(/^(?:q|question|a|answer|punchline)\s*[:\-–—]\s*/i, ''); }

  /*
   * A puzzles reply: { puzzles: [{ no (0 when the reply has no numbers), text, by }], structured }.
   * structured: the reply used PUZZLE / TEXT lines or a numbered list (not just loose lines).
   */
  function readPuzzles(text) {
    var out = [], cur = null, open = false, structured = false, loose = [];
    function start(no) { cur = { no: no, text: '', by: '' }; out.push(cur); open = false; }
    lines(text).forEach(function (l) {
      var m;
      if (!l) { open = false; return; }
      if ((m = RE_PUZZLE.exec(l))) {
        structured = true;
        start(+m[1]);
        if (m[2] && m[2].trim()) { var x = inline(m[2]); cur.text = x.text; cur.by = x.by; open = true; }
        return;
      }
      if ((m = RE_BY.exec(l))) { if (cur) { cur.by = m[1]; open = false; } return; }
      if ((m = RE_TEXT.exec(l))) {
        structured = true;
        if (!cur || cur.text) start(0);
        var y = inline(m[1]);
        cur.text = y.text; if (y.by && !cur.by) cur.by = y.by;
        open = true;
        return;
      }
      if (cur && cur.text && (m = RE_ANSWER.exec(l))) { cur.text += ' ' + m[1]; return; }
      if (cur && cur.text && !cur.by && (m = RE_DASH_BY.exec(l)) && looksLikeBy(m[1])) { cur.by = m[1]; open = false; return; }
      if ((m = RE_NUM.exec(l))) {
        structured = true;
        start(+m[1]);
        var z = inline(stripQA(m[2]));
        cur.text = z.text; cur.by = z.by;
        open = true;
        return;
      }
      if (cur && open) { cur.text += ' ' + stripQA(l); return; }
      if (!RE_CHATTER.test(l)) loose.push(l);
    });
    var res = out.filter(function (p) { return E.clean(p.text).length > 0; });
    // a plain list of sentences, one a line (the old "text | author" paste)
    if (!res.length && loose.length) {
      res = loose.map(function (l) { var x = inline(l); return { no: 0, text: x.text, by: x.by }; }).filter(function (p) { return E.letterCount(p.text) >= 8; });
    }
    res.forEach(function (p) { p.text = E.clean(p.text); p.by = E.cleanBy(p.by); });
    return { puzzles: res, structured: structured };
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

  // Which kind of reply this looks like: a numbered or labeled list of puzzles comes first, then the
  // extras, then a loose list of sentences.
  function kind(text) {
    var r = readPuzzles(text);
    if (r.puzzles.length && r.structured) return 'puzzles';
    var e = readExtras(text);
    if (e.welcome.length || e.closing.length || e.blurb) return 'extras';
    if (r.puzzles.length) return 'puzzles';
    return 'unknown';
  }

  CX.reader = { lines: lines, readPuzzles: readPuzzles, readExtras: readExtras, kind: kind, inline: inline, looksLikeBy: looksLikeBy };
})(typeof window !== 'undefined' ? window : globalThis);
