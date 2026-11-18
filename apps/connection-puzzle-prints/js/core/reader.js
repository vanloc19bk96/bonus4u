/*
 * Reads what the AI chat sent back. It is forgiving on purpose: people paste the whole reply, with
 * or without the code block, and chat models drift from the format (bold marks, numbered groups,
 * color names for groups, the answers on the next line). Nothing is guessed: what does not read as
 * a group is left out, and the app says which puzzles are not complete.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var T = CX.text, P = CX.plan;

  // Plain lines without chat formatting.
  function lines(text) {
    var t = String(text || '').replace(/\r\n?/g, '\n').replace(/\\n/g, '\n');
    t = t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ');
    return t.split('\n').map(function (l) {
      return l.replace(/^\s*```.*$/, '').replace(/^\s{0,3}#{1,6}\s*/, '').replace(/\*\*/g, '').replace(/^\s*>\s?/, '').replace(/^\s*[-*•]\s+/, '').trim();
    });
  }

  function clean(s) { return T.cleanLine(String(s || '').replace(/^\s*[*"]+|[*"]+\s*$/g, '')); }

  // A link keeps its blank: "___ cake", "Snow___". Chat formatting is stripped around it.
  function cleanLink(s) {
    var t = String(s || '').replace(/_{2,}|…|\.{3}|\[blank\]/gi, '\u0001');
    t = clean(t).replace(/^["'“‘(]+|["'”’)]+$/g, '').replace(/[\s:;,.=\-–—]+$/, '').trim();
    return t.replace(/\u0001/g, '___');
  }

  var RE_PUZZLE = /^(?:puzzle|wall|grid|set)\s*(?:no\.?\s*|#\s*)?(\d{1,3})\b\s*(?:\([^)]*\))?\s*(?:[:.\-–—]\s*(.*))?$/i;
  var COLORS = { yellow: 1, green: 2, blue: 3, purple: 4 };
  var RE_GROUP = /^(?:(?:group|link|connection|category)\s*#?\s*(\d)|(yellow|green|blue|purple)|(\d)\s*[.)])\s*(?:\([^)]*\))?\s*(?:[:.\-–—]\s*)?(.*)$/i;
  var RE_TRAP = /^(?:traps?|red\s*herrings?|decoys?)\s*[:\-–—]\s*(.+)$/i;
  var RE_WORDS = /^(?:words|answers|tiles)\s*[:\-–—]\s*(.+)$/i;

  // The answer part of a list item: "1. OAK", "Oak (a tree)", "SCATTER - hides CAT".
  function wordOf(item) {
    return P.cleanWord(String(item || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+[-–—:]\s.*$/, ''));
  }
  function words(s) {
    return String(s || '').split(/[,;|·•]|\s\/\s/).map(wordOf).filter(function (w) { return w && !/^(?:ETC|AND SO ON)$/.test(w) && !/^\.+$/.test(w); });
  }

  // "Trees = OAK, PINE" / "Trees: OAK, PINE" / "Trees - OAK, PINE" / "Trees" (answers on the next line)
  function splitGroup(rest) {
    var m = /^(.*?)\s*=\s*(.*)$/.exec(rest) || /^(.*):\s*(.*,.*)$/.exec(rest) || /^(.*?)\s+[-–—]\s+(.*,.*)$/.exec(rest);
    if (m) return { link: cleanLink(m[1]), words: words(m[2]) };
    if (/,/.test(rest) && !/[a-z]/.test(rest.replace(/\([^)]*\)/g, ''))) return { link: '', words: words(rest) };
    return { link: cleanLink(rest), words: [] };
  }

  /*
   * A puzzles reply: { puzzles: [{ no (0 when the reply has no PUZZLE lines), groups: [{ link, words }], trap }] }.
   */
  function readPuzzles(text) {
    var out = [], cur = null, open = null;
    function start(no) { cur = { no: no, groups: [], trap: '' }; out.push(cur); open = null; }
    lines(text).forEach(function (l) {
      if (!l) return;
      var m;
      if ((m = RE_PUZZLE.exec(l))) { start(+m[1]); return; }
      if ((m = RE_TRAP.exec(l))) { if (cur) cur.trap = clean(m[1]); return; }
      if ((m = RE_GROUP.exec(l)) && (m[1] || m[2] || (cur && m[3]))) {
        var n = +(m[1] || m[3]) || COLORS[String(m[2]).toLowerCase()];
        if (!cur || cur.groups.length >= 4 || (n === 1 && cur.groups.length && !cur.no)) start(0);
        var g = splitGroup(m[4] || '');
        cur.groups.push(g);
        open = g.words.length ? null : g;
        return;
      }
      if (open && ((m = RE_WORDS.exec(l)) || /,/.test(l))) { open.words = words(m ? m[1] : l); open = null; return; }
      // a group without its GROUP label: "Trees = OAK, PINE, PALM, MAPLE"
      if (cur && cur.groups.length < 4 && /=/.test(l) && /,/.test(l)) cur.groups.push(splitGroup(l));
    });
    return { puzzles: out.filter(function (p) { return p.groups.length; }) };
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
    if (readPuzzles(text).puzzles.length) return 'puzzles';
    var e = readExtras(text);
    if (e.welcome.length || e.closing.length || e.blurb) return 'extras';
    return 'unknown';
  }

  CX.reader = { lines: lines, readPuzzles: readPuzzles, readExtras: readExtras, kind: kind, cleanLink: cleanLink, words: words };
})(typeof window !== 'undefined' ? window : globalThis);
