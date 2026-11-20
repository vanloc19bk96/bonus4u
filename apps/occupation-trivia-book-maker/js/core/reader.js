/*
 * Reads what the AI chat sent back. It is forgiving on purpose: people paste the whole reply,
 * with or without the code block, and chat models drift from the format (bold marks, numbers,
 * "Answer: C) Frank Sinatra", options on one line). Questions it cannot use are counted and
 * explained, never guessed at.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var T = CX.text;

  // Plain lines without chat formatting.
  function lines(text) {
    var t = String(text || '').replace(/\r\n?/g, '\n').replace(/\\n/g, '\n');
    t = t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ');
    return t.split('\n').map(function (l) {
      return l.replace(/^\s*```.*$/, '').replace(/^\s{0,3}#{1,6}\s*/, '').replace(/\*\*|__/g, '').replace(/^\s*>\s?/, '').trim();
    });
  }

  function clean(s) { return T.cleanLine(String(s || '').replace(/^\s*[*_]+|[*_]+\s*$/g, '')); }

  var RE_CHAPTER = /^(?:chapter|round|section|category|topic)\s*\d*\s*[:.\-–—]\s*(.+)$/i;
  var RE_QUESTION = /^(?:q(?:uestion)?\s*\d*\s*[:.)\-–]|\d{1,3}\s*[.):]|\d{1,3}\s*-\s)\s*(.*)$/i;
  var RE_OPTION = /^\(?([A-Fa-f])\s*[).:\]]\s*(.+)$/;
  var RE_ANSWER = /^(?:correct\s+)?(?:answer|ans|solution|correct)\s*(?:is)?\s*[:\-–=]\s*(.*)$/i;
  var RE_FACT = /^(?:fun\s+fact|fact|did\s+you\s+know\??|note|explanation)\s*[:\-–]\s*(.*)$/i;

  // "A) Bing  B) Perry  C) Frank  D) Dean" on one line. A split needs the next letter in order
  // (after C comes D) written with the same mark as the line's own letter, so a letter inside
  // an answer is left alone: "C) Johnny B. Goode" stays one choice.
  function splitInline(s) {
    var head = /^\(?([A-Fa-f])\s*([).:\]])/.exec(s);
    if (!head) return null;
    var expect = head[1].toUpperCase().charCodeAt(0) + 1, cuts = [], m;
    var re = /\s+(?=\(?([B-F])\s*([).:])\s)/g;
    while ((m = re.exec(s))) {
      if (m[1].charCodeAt(0) === expect && m[2] === head[2]) { cuts.push(m.index); expect++; }
      re.lastIndex = m.index + m[0].length;
    }
    if (!cuts.length) return null;
    var parts = [], from = 0;
    cuts.forEach(function (c) { parts.push(s.slice(from, c)); from = c; });
    parts.push(s.slice(from));
    return parts.map(function (p) { return p.trim(); });
  }

  function answerIndex(raw, options) {
    var s = String(raw || '').trim().replace(/^[*_"']+|[*_"'.]+$/g, '');
    var m = /^\(?([A-Fa-f])(?:\s*[).:\]]|\s*$|\s+[-–—]|\s)/.exec(s);
    if (m) {
      var i = m[1].toUpperCase().charCodeAt(0) - 65;
      if (i < options.length) return i;
    }
    var norm = function (x) { return String(x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
    var target = norm(s.replace(/^\(?[A-Fa-f]\s*[).:\]]\s*/, ''));
    if (!target) return -1;
    for (var k = 0; k < options.length; k++) if (norm(options[k]) === target) return k;
    for (k = 0; k < options.length; k++) if (target.indexOf(norm(options[k])) !== -1 && norm(options[k]).length > 2) return k;
    return -1;
  }

  /*
   * Questions from a reply. Returns {
   *   groups: [{ title, questions: [{ q, o, a, f }] }],
   *   skipped: [{ q, why }]
   * }
   */
  function readQuestions(text) {
    var groups = [], skipped = [];
    var group = null, cur = null, field = null;

    function startGroup(title) { group = { title: title, questions: [] }; groups.push(group); }
    function finish() {
      if (!cur) return;
      var q = clean(cur.q), o = cur.o.map(clean).filter(Boolean);
      var why = '';
      if (!q) why = 'it had no question text';
      else if (o.length < 2) why = 'it had no answer choices';
      else if (o.length > 6) why = 'it had too many answer choices';
      var a = why ? -1 : answerIndex(cur.ans, o);
      if (!why && cur.ans == null) why = 'it had no ANSWER line';
      else if (!why && a < 0) why = 'its ANSWER did not match a choice';
      if (why) skipped.push({ q: q || '(empty)', why: why });
      else {
        if (!group) startGroup('');
        group.questions.push({ q: q, o: o, a: a, f: clean(cur.f) });
      }
      cur = null; field = null;
    }

    lines(text).forEach(function (l) {
      if (!l) { if (field === 'f') field = null; return; }
      var m;
      if ((m = RE_CHAPTER.exec(l))) { finish(); startGroup(clean(m[1])); return; }
      if ((m = RE_ANSWER.exec(l)) && cur) {
        cur.ans = m[1];
        // "Answer: C - fun fact" keeps the rest as a fact when there is no FACT line
        var rest = /^\(?[A-Fa-f]\s*[).:\]]?\s+[-–—]\s+(.+)$/.exec(m[1].trim());
        if (rest && !cur.f) cur.f = rest[1];
        field = 'ans'; return;
      }
      if ((m = RE_FACT.exec(l)) && cur) { cur.f = m[1]; field = 'f'; return; }
      if ((m = RE_OPTION.exec(l)) && cur && cur.ans == null) {
        var inline = splitInline(l);
        if (inline) inline.forEach(function (part) { var mm = RE_OPTION.exec(part.trim()); if (mm) cur.o.push(mm[2]); });
        else cur.o.push(m[2]);
        field = 'o'; return;
      }
      if ((m = RE_QUESTION.exec(l))) { finish(); cur = { q: m[1], o: [], ans: null, f: '' }; field = 'q'; return; }
      if (cur) {
        if (field === 'q' && !cur.o.length) cur.q += ' ' + l;
        else if (field === 'f') cur.f += ' ' + l;
        else if (field === 'o' && cur.o.length && cur.ans == null && !/\?$/.test(l)) cur.o[cur.o.length - 1] += ' ' + l;
        return;
      }
      // a question line without "Q:" right before its options: "Which crooner...?"
      if (/\?\s*$/.test(l)) { cur = { q: l, o: [], ans: null, f: '' }; field = 'q'; }
    });
    finish();
    return { groups: groups.filter(function (g) { return g.questions.length; }), skipped: skipped };
  }

  // A header is the label alone on its line, or the label, a colon and the first item.
  var SECTIONS = [
    { key: 'welcome', re: /^(?:welcome(?:\s+letter)?|introduction|intro)\s*(?::\s*(.*))?$/i },
    // "FUN FACTS:", "16 Fun Facts", "Fun facts about nursing: first fact" (a sentence without a colon is not a header)
    { key: 'facts', re: /^(?:\d+\s+)?fun\s+facts(?:(?:\s+about\s+[^:]{1,60})?\s*:\s*(.*)|\s*)$/i },
    { key: 'stories', re: /^(?:story\s+prompts|career\s+stories|stories\s+from\s+the\s+job|writing\s+prompts|reflection\s+prompts|memory\s+prompts)\s*(?::\s*(.*))?$/i },
    { key: 'ranks', re: /^(?:ranks|rank\s+titles|score\s+ranks|score\s+card\s+ranks)\s*(?::\s*(.*))?$/i },
    { key: 'blurb', re: /^(?:back\s+cover(?:\s+(?:text|description|blurb))?|blurb|book\s+description)\s*(?::\s*(.*))?$/i }
  ];

  // "Rookie - Every expert started here." -> "Rookie|Every expert started here." A score range
  // in front ("0-20%: Rookie - ...") is dropped: the app prints its own ranges.
  function rank(l) {
    var s = l.replace(/^\d{1,3}\s*%?\s*(?:[-–—]|to)\s*\d{1,3}\s*%?\s*(?:points?|correct)?\s*[:.)\-–—]?\s*/i, '');
    var m = /^(.{2,40}?)\s*(?:\s[-–—]\s|:\s|\s[-–—]|[-–—]\s)\s*(.+)$/.exec(s);
    var t = (m ? m[1] : s).replace(/^["'“]+|["'”]+$/g, '').trim();
    return t + '|' + (m ? m[2].trim() : '');
  }

  // The extras reply: { welcome: [paragraphs], facts: [facts], stories: [prompts], ranks: ['title|comment'], blurb: '' }.
  function readExtras(text) {
    var out = { welcome: [], facts: [], stories: [], ranks: [], blurb: '' }, buf = { welcome: [], facts: [], stories: [], ranks: [], blurb: [] };
    var key = null;
    lines(text).forEach(function (l) {
      if (!l) { if (key) buf[key].push(''); return; }
      for (var i = 0; i < SECTIONS.length; i++) {
        var m = SECTIONS[i].re.exec(l);
        if (m) { key = SECTIONS[i].key; if (m[1]) buf[key].push(m[1]); return; }
      }
      if (key) buf[key].push(l);
    });
    var items = function (arr) {
      return arr.filter(Boolean).map(function (l) { return clean(l.replace(/^(?:[-*•–]|\d{1,2}[.)])\s+/, '')); }).filter(Boolean);
    };
    out.facts = items(buf.facts);
    out.stories = items(buf.stories);
    out.ranks = buf.ranks.filter(Boolean).map(function (l) { return rank(l.replace(/^(?:[-*•–]|\d{1,2}[.)])\s+/, '')); })
      .map(function (s) { var p = s.split('|'); return clean(p[0]) + (p[1] ? '|' + clean(p[1]) : ''); })
      .filter(function (s) { return s.split('|')[0]; });
    out.welcome = T.cleanParagraphs(buf.welcome.join('\n'));
    out.blurb = T.cleanParagraphs(buf.blurb.join('\n')).join('\n');
    return out;
  }

  // Which kind of reply this looks like.
  function kind(text) {
    var r = readQuestions(text);
    var n = r.groups.reduce(function (s, g) { return s + g.questions.length; }, 0);
    if (n > 0) return 'questions';
    var e = readExtras(text);
    if (e.welcome.length || e.facts.length || e.stories.length || e.ranks.length || e.blurb) return 'extras';
    return r.skipped.length ? 'questions' : 'unknown';
  }

  CX.reader = { lines: lines, readQuestions: readQuestions, readExtras: readExtras, answerIndex: answerIndex, kind: kind };
})(typeof window !== 'undefined' ? window : globalThis);
