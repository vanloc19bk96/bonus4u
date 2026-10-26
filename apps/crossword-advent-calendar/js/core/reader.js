/*
 * Reads what the AI chat sent back. It is forgiving on purpose: people paste the whole reply,
 * with or without the code block, and chat models drift from the format (bold marks, numbers,
 * "LAMP - clue", "Lamp (4): clue"). Words it cannot use are counted and explained, never guessed.
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

  var RE_DAY = /^(bonus\s*day|bonus|day)\s*(\d{1,2})\b\s*(?:\([^)]*\))?\s*(?:[:.\-–—]\s*(.*))?$/i;
  var RE_TITLE = /^(?:title|theme)\s*[:\-–—]\s*(.+)$/i;
  var RE_STORY = /^(?:story|scene|intro|setting)\s*[:\-–—]\s*(.*)$/i;
  var RE_QUESTION = /^(?:(?:memory\s+)?question|memory|prompt)\s*[:\-–—]\s*(.*)$/i;
  var RE_WORDS = /^(?:words?(?:\s+and\s+clues)?|clues|answers)\s*:?\s*$/i;
  // "LAMP | clue", "1. LAMP - clue", "Lamp (4): clue", "LAMP — clue"
  var RE_WORD = /^(?:[-*•]\s*|\d{1,2}[.)]\s*)?([A-Za-z][A-Za-z' \-]{1,24}?)\s*(?:\(\s*\d{1,2}\s*\))?\s*(?:\||:|\s[-–—]\s|\t)\s*(.+)$/;

  function cleanClue(c) {
    var s = clean(c).replace(/\s*\(\s*\d{1,2}(?:\s*letters?)?\s*\)\s*\.?$/i, '').replace(/\s*\[\s*\d{1,2}\s*\]\s*$/, '');
    if (s && /[a-z]/.test(s)) s = s.charAt(0).toUpperCase() + s.slice(1);
    return s.replace(/[.;,]+$/, '');
  }

  // Does the clue give the answer away? (the word itself, or its stem of five letters or more)
  function givesAway(word, clue) {
    var c = clue.toUpperCase().replace(/[^A-Z]+/g, ' '), w = word.toUpperCase();
    if ((' ' + c + ' ').indexOf(' ' + w + ' ') !== -1) return true;
    var stem = w.length >= 6 ? w.slice(0, Math.max(5, w.length - 2)) : '';
    return !!stem && c.split(' ').some(function (x) { return x.length >= stem.length && x.indexOf(stem) === 0; });
  }

  /*
   * A days reply. Returns {
   *   days: [{ set: 'main'|'bonus'|'', no (0 when the reply has no day lines), title, story, question, words: [{ w, c }] }],
   *   skipped: [{ w, why }]
   * }
   */
  function readDays(text) {
    var days = [], skipped = [], cur = null;
    function start(set, no, title) { cur = { set: set, no: no, title: title || '', story: '', question: '', words: [] }; days.push(cur); }
    function ensure() { if (!cur) start('', 0, ''); return cur; }
    var field = null;
    lines(text).forEach(function (l) {
      if (!l) { field = null; return; }
      var m;
      if ((m = RE_DAY.exec(l))) {
        var set = /bonus/i.test(m[1]) ? 'bonus' : 'main';
        start(set, +m[2], clean(m[3] || '').replace(/^title\s*[:\-–—]\s*/i, ''));
        field = null; return;
      }
      if ((m = RE_TITLE.exec(l))) { ensure().title = clean(m[1]); field = null; return; }
      if ((m = RE_STORY.exec(l))) { ensure().story = clean(m[1]); field = 'story'; return; }
      if ((m = RE_QUESTION.exec(l))) { ensure().question = clean(m[1]); field = 'question'; return; }
      if (RE_WORDS.test(l)) { ensure(); field = 'words'; return; }
      if ((m = RE_WORD.exec(l))) {
        var raw = m[1].trim(), clue = cleanClue(m[2]);
        if (/^(story|scene|question|memory|title|words?|clues?)$/i.test(raw) || raw.split(/\s+/).length > 2) return;
        var w = raw.toUpperCase();
        var why = '';
        if (/[ \-']/.test(w)) why = 'it is more than one word';
        else if (w.length < 3) why = 'it is shorter than 3 letters';
        else if (!clue) why = 'it has no clue';
        else if (givesAway(w, clue)) why = 'its clue gives the answer away';
        if (why) { skipped.push({ w: raw, why: why }); return; }
        ensure().words.push({ w: w, c: clue });
        field = 'words'; return;
      }
      if (cur && (field === 'story' || field === 'question')) cur[field] += (cur[field] ? ' ' : '') + clean(l);
    });
    return { days: days.filter(function (d) { return d.words.length || d.title || d.story || d.question; }), skipped: skipped };
  }

  var SECTIONS = [
    { key: 'week', re: /^(?:week|bonus\s+week)\s*(\d)\s*(?::\s*(.*))?$/i },
    { key: 'twelve', re: /^(?:the\s+)?twelve\s+days\s*(?::\s*(.*))?$/i },
    { key: 'eve', re: /^(?:christmas\s+eve(?:\s+note)?|closing\s+note|last\s+page)\s*(?::\s*(.*))?$/i },
    { key: 'blurb', re: /^(?:back\s+cover(?:\s+(?:text|description|blurb))?|blurb|book\s+description)\s*(?::\s*(.*))?$/i }
  ];

  // The extras reply: { weeks: [text by week number - 1], eve: [paragraphs], blurb: '' }.
  function readExtras(text) {
    var buf = { eve: [], blurb: [] }, weeks = {}, key = null, wk = 0;
    lines(text).forEach(function (l) {
      for (var i = 0; i < SECTIONS.length; i++) {
        var m = SECTIONS[i].re.exec(l);
        if (!m) continue;
        key = SECTIONS[i].key;
        if (key === 'week') { wk = +m[1]; weeks[wk] = weeks[wk] || []; if (m[2]) weeks[wk].push(m[2]); }
        else if (key === 'twelve') { key = 'week'; wk = 99; weeks[wk] = weeks[wk] || []; if (m[1]) weeks[wk].push(m[1]); }
        else if (m[1]) buf[key].push(m[1]);
        return;
      }
      if (!key) return;
      if (key === 'week') weeks[wk].push(l); else buf[key].push(l);
    });
    var nums = Object.keys(weeks).map(Number).sort(function (a, b) { return a - b; });
    var out = { weeks: [], eve: T.cleanParagraphs(buf.eve.join('\n')), blurb: T.cleanParagraphs(buf.blurb.join('\n')).join('\n') };
    nums.forEach(function (n) {
      var t = T.cleanParagraphs(weeks[n].join('\n')).join(' ');
      if (t) out.weeks.push(t);
    });
    return out;
  }

  // Which kind of reply this looks like.
  function kind(text) {
    var r = readDays(text);
    if (r.days.some(function (d) { return d.words.length || d.no; })) return 'days';
    var e = readExtras(text);
    if (e.weeks.length || e.eve.length || e.blurb) return 'extras';
    return r.skipped.length ? 'days' : 'unknown';
  }

  CX.reader = { lines: lines, readDays: readDays, readExtras: readExtras, givesAway: givesAway, kind: kind };
})(typeof window !== 'undefined' ? window : globalThis);
