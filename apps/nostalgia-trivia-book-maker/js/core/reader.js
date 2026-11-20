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
    { key: 'welcome', re: /^(?:welcome(?:\s+letter)?|welcome\s+to\s+the\s+book)\s*(?::\s*(.*))?$/i },
    { key: 'ranks', re: /^(?:ranks|rank\s+titles|score\s+ranks|score\s+card\s+ranks)\s*(?::\s*(.*))?$/i },
    { key: 'blurb', re: /^(?:back\s+cover(?:\s+(?:text|description|blurb))?|blurb|book\s+description)\s*(?::\s*(.*))?$/i }
  ];

  function items(arr) {
    return arr.filter(Boolean).map(function (l) { return clean(l.replace(/^(?:[-*•–]|\d{1,2}[.)])\s+/, '')); }).filter(Boolean);
  }

  // "Rookie - Every expert started here." -> "Rookie|Every expert started here." A score range
  // in front ("0-20%: Rookie - ...") is dropped: the app prints its own ranges.
  function rank(l) {
    var s = l.replace(/^\d{1,3}\s*%?\s*(?:[-–—]|to)\s*\d{1,3}\s*%?\s*(?:points?|correct)?\s*[:.)\-–—]?\s*/i, '');
    var m = /^(.{2,40}?)\s*(?:\s[-–—]\s|:\s|\s[-–—]|[-–—]\s)\s*(.+)$/.exec(s);
    var t = (m ? m[1] : s).replace(/^["'“]+|["'”]+$/g, '').trim();
    return t + '|' + (m ? m[2].trim() : '');
  }

  // The extras reply: { welcome: [paragraphs], ranks: ['title|comment'], blurb: '' }.
  function readExtras(text) {
    var out = { welcome: [], ranks: [], blurb: '' }, buf = { welcome: [], ranks: [], blurb: [] };
    var key = null;
    lines(text).forEach(function (l) {
      if (!l) { if (key) buf[key].push(''); return; }
      for (var i = 0; i < SECTIONS.length; i++) {
        var m = SECTIONS[i].re.exec(l);
        if (m) { key = SECTIONS[i].key; if (m[1]) buf[key].push(m[1]); return; }
      }
      if (key) buf[key].push(l);
    });
    out.ranks = buf.ranks.filter(Boolean).map(function (l) { return rank(l.replace(/^(?:[-*•–]|\d{1,2}[.)])\s+/, '')); })
      .map(function (s) { var p = s.split('|'); return clean(p[0]) + (p[1] ? '|' + clean(p[1]) : ''); })
      .filter(function (s) { return s.split('|')[0]; });
    out.welcome = T.cleanParagraphs(buf.welcome.join('\n'));
    out.blurb = T.cleanParagraphs(buf.blurb.join('\n')).join('\n');
    return out;
  }

  // ---------- the decade pages ----------
  var WORDS = { forties: '1940s', fifties: '1950s', sixties: '1960s', seventies: '1970s', eighties: '1980s', nineties: '1990s', noughties: '2000s', aughts: '2000s' };

  // "1950s", "the '50s", "50s", "Fifties" -> "1950s" (null when the text names no decade).
  function decadeIn(s) {
    var m = /(?:^|[^0-9])((?:19|20)\d0|['’]?\d0)['’]?s\b/i.exec(s);
    if (m) {
      var d = m[1].replace(/['’]/g, '');
      if (d.length === 2) d = (d === '00' ? '20' : '19') + d;
      return d + 's';
    }
    var w = /\b(forties|fifties|sixties|seventies|eighties|nineties|noughties|aughts)\b/i.exec(s);
    return w ? WORDS[w[1].toLowerCase()] : null;
  }

  // A decade heading: "DECADE: 1950s", "The 1950s", "1950s – Rock 'n' Roll" (a line that is not a list item).
  var RE_DECADE_LABEL = /^(?:decade|era|part|chapter)\s*\d*\s*[:.\-–—]\s*(.+)$/i;
  var RE_DECADE_LINE = /^(?:the\s+)?(?:(?:19|20)\d0|['’]\d0)['’]?s\b\s*(?:[:\-–—]\s*[^:]{0,60})?:?$/i;
  var ERA_SECTIONS = [
    { key: 'intro', re: /^(?:intro(?:duction)?|opening|about\s+the\s+decade)$/i },
    { key: 'timeline', re: /^(?:(?:decade\s+)?at\s+a\s+glance|timeline|mini\s+timeline|key\s+moments|moments)$/i },
    { key: 'facts', re: /^(?:did\s+you\s+know\??|fun\s+facts|facts)$/i },
    { key: 'memories', re: /^(?:memory\s+prompts|memories|remember\s+when\??|your\s+memories|writing\s+prompts)$/i }
  ];

  // "1955: Disneyland opens." -> "1955|Disneyland opens."; a line without a year keeps "|text".
  function moment(l) {
    var m = /^(?:in\s+)?((?:19|20)\d\d)\s*(?:[:\-–—.)]|,)?\s+(.+)$/i.exec(l);
    return m ? m[1] + '|' + clean(m[2]) : '|' + clean(l);
  }

  /*
   * The decade pages reply: { '1950s': { intro: [paragraphs], timeline: ['1955|text'], facts: [], memories: [] } }.
   * A section header may carry its decade ("The 1950s at a glance:") and its first item after a colon.
   */
  function readEras(text) {
    var out = {}, buf = {}, cur = null, key = null;
    function open(id) {
      if (!buf[id]) buf[id] = { intro: [], timeline: [], facts: [], memories: [] };
      cur = id; key = null;
    }
    lines(text).forEach(function (l) {
      if (!l) { if (cur && key === 'intro') buf[cur].intro.push(''); return; }
      var m, d;
      if ((m = RE_DECADE_LABEL.exec(l)) && (d = decadeIn(m[1])) && !/^\s*[-*•]/.test(l)) { open(d); return; }
      if (RE_DECADE_LINE.test(l) && (d = decadeIn(l))) { open(d); return; }
      // "AT A GLANCE:", "The 1950s at a glance: first item"
      var h = /^(?:(?:the\s+)?(?:(?:19|20)\d0|['’]\d0)['’]?s\s+)?([a-z][a-z\s?']{2,30}?)\s*(?::\s*(.*))?$/i.exec(l);
      if (h && (h[2] != null || /^[A-Z\s?']+$/.test(h[1]) || !/[.!]$/.test(l))) {
        for (var i = 0; i < ERA_SECTIONS.length; i++) {
          if (!ERA_SECTIONS[i].re.test(h[1].trim())) continue;
          d = decadeIn(l.slice(0, l.length - (h[2] || '').length));
          if (d) open(d);
          if (!cur) open('?');
          key = ERA_SECTIONS[i].key;
          if (h[2]) buf[cur][key].push(h[2]);
          return;
        }
      }
      if (cur && key) buf[cur][key].push(l);
    });
    Object.keys(buf).forEach(function (id) {
      if (id === '?' || !CX.plan.decade(id)) return;
      var b = buf[id], e = {
        intro: T.cleanParagraphs(b.intro.join('\n')),
        timeline: b.timeline.filter(Boolean).map(function (l) { return moment(l.replace(/^(?:[-*•–]|\d{1,2}[.)])\s+/, '')); }).filter(function (s) { return s.split('|')[1]; }),
        facts: items(b.facts),
        memories: items(b.memories)
      };
      if (e.intro.length || e.timeline.length || e.facts.length || e.memories.length) out[id] = e;
    });
    return out;
  }

  // Which kind of reply this looks like: 'questions', 'eras', 'extras' or 'unknown'.
  function kind(text) {
    var r = readQuestions(text);
    var n = r.groups.reduce(function (s, g) { return s + g.questions.length; }, 0);
    if (n > 0) return 'questions';
    if (Object.keys(readEras(text)).length) return 'eras';
    var e = readExtras(text);
    if (e.welcome.length || e.ranks.length || e.blurb) return 'extras';
    return r.skipped.length && r.skipped.some(function (s) { return s.why !== 'it had no answer choices'; }) ? 'questions' : 'unknown';
  }

  CX.reader = { lines: lines, readQuestions: readQuestions, readExtras: readExtras, readEras: readEras, decadeIn: decadeIn, answerIndex: answerIndex, kind: kind };
})(typeof window !== 'undefined' ? window : globalThis);
