/*
 * Reads what the AI chat sent back. It is forgiving on purpose: people paste the whole reply, with
 * or without the code block, and chat models drift from the format (bold marks, numbered labels,
 * a label on its own line). What it cannot use is reported later as missing, never guessed.
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
  function listOf(s) { return String(s || '').split(/[,;|]/).map(function (x) { return clean(x).replace(/^(?:\d{1,2}[.)]\s*|[-*•]\s*)/, '').replace(/[.]+$/, ''); }).filter(function (x) { return x && !/^\.+$|^…$/.test(x); }); }
  function isDots(s) { return /^\s*(?:\.{2,}|…)\s*$/.test(String(s)); }

  // ---------- the story ----------
  var STORY_KEYS = [
    ['premise', /^premise\s*:\s*(.*)$/i], ['role', /^(?:you|your role|the reader|reader)\s*:\s*(.*)$/i], ['titles', /^(?:title ideas?|titles?|book titles?)\s*:\s*(.*)$/i],
    ['opening', /^(?:opening|the opening|intro(?:duction)?)\s*:\s*(.*)$/i], ['roomNames', /^(?:rooms|room names|the rooms)\s*:\s*(.*)$/i],
    ['word', /^(?:final word|the final word|last word|key word)\s*:\s*(.*)$/i], ['wordDecoys', /^(?:decoys?|decoy words?)\s*:\s*(.*)$/i], ['wordClue', /^(?:word clue|final clue|clue)\s*:\s*(.*)$/i],
    ['suspects', /^(?:suspects|the suspects)\s*:\s*(.*)$/i], ['culprit', /^(?:culprit|the culprit)\s*:\s*(.*)$/i],
    ['badEnding', /^(?:wrong ending|bad ending|false ending)\s*:\s*(.*)$/i], ['ending', /^(?:ending|the ending|true ending)\s*:\s*(.*)$/i],
    ['alarms', /^(?:dead end lines?|dead ends?|alarm lines?|alarms?)\s*:\s*(.*)$/i], ['closing', /^(?:closing|closing note|thank you|last page)\s*:\s*(.*)$/i],
    ['blurb', /^(?:back cover(?:\s+(?:text|description|blurb))?|blurb|book description)\s*:\s*(.*)$/i]
  ];

  function readStory(text) {
    var buf = {}, key = null;
    lines(text).forEach(function (l) {
      for (var i = 0; i < STORY_KEYS.length; i++) {
        var m = STORY_KEYS[i][1].exec(l);
        if (!m) continue;
        key = STORY_KEYS[i][0];
        buf[key] = buf[key] || [];
        if (m[1]) buf[key].push(m[1]);
        return;
      }
      if (key && l && !isDots(l)) { buf[key] = buf[key] || []; buf[key].push(l); }
    });
    var out = {};
    function join(k) { return (buf[k] || []).join(' '); }
    function bare(s) { return clean(s).replace(/^(?:\d{1,2}[.)]\s*|[-*•]\s*)/, ''); }
    ['premise', 'role', 'wordClue', 'culprit'].forEach(function (k) { if (buf[k]) out[k] = clean(join(k)); });
    // candidates, the best first: which one fits is decided where the room count is known
    if (buf.word) out.word = buf.word.join(',').split(/[,;|]/).map(function (x) { return T.stripAccents(bare(x)).toUpperCase().replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[^A-Z ]+/g, '').trim(); }).filter(Boolean);
    if (buf.titles) out.titles = buf.titles.map(function (x) { return T.cleanTitle(bare(x)); }).filter(Boolean);
    if (buf.roomNames) out.roomNames = buf.roomNames.map(function (x) { return clean(bare(x)).replace(/[.:]+$/, ''); }).filter(Boolean);
    if (buf.wordDecoys) out.wordDecoys = buf.wordDecoys.join(',').split(/[,;|\n]/).map(function (x) { return bare(x).toUpperCase().replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[^A-Z ]+/g, '').trim(); }).filter(Boolean);
    if (buf.suspects) out.suspects = buf.suspects.map(function (x) {
      var s = bare(x), m = /^(.+?)\s*(?:\||:|\s[-–—]\s)\s*(.*)$/.exec(s);
      return m ? { name: clean(m[1]), about: clean(m[2]) } : { name: clean(s), about: '' };
    }).filter(function (x) { return x.name; });
    if (buf.alarms) out.alarms = buf.alarms.map(bare).filter(Boolean);
    ['opening', 'ending', 'badEnding', 'closing'].forEach(function (k) { if (buf[k]) out[k] = T.cleanParagraphs(buf[k].join('\n')); });
    if (buf.blurb) out.blurb = T.cleanParagraphs(buf.blurb.join('\n')).join('\n');
    return out;
  }

  // ---------- the rooms ----------
  var RE_ROOM = /^room\s*(?:no\.?\s*|#\s*)?(\d{1,2})\b\s*(?:\(([^)]*)\))?\s*(?:[:.\-–—]\s*(.*))?$/i;
  var RE_PUZZLE = /^(?:puzzle\s*(?:no\.?\s*|#\s*)?)?(\d{1,2})\s*[.\-]\s*(\d)\b\s*(?:\([^)]*\))?\s*(?:[:\-–—]\s*(.*))?$/i;
  var RE_PUZZLE2 = /^puzzle\s*(?:no\.?\s*|#\s*)?(\d)\b\s*(?:\([^)]*\))?\s*(?:[:\-–—]\s*(.*))?$/i;
  var RE_FIELD = /^(name|enter|exit|evidence|title|story|message|words?|people|objects|place|riddle|answer|wrong(?:\s+answers?)?|hint|why)\s*(?:\([^)]*\))?\s*:\s*(.*)$/i;

  function newPuzzle(no) { return { no: no, fields: {} }; }

  /*
   * A rooms reply: { rooms: [{ no, fields: { name, enter, exit, evidence }, puzzles: [{ no, fields }] }] }.
   */
  function readRooms(text) {
    var out = [], room = null, puzzle = null, field = null;
    function target() { return puzzle || room; }
    function start(no, name) { room = { no: no, fields: {}, puzzles: [] }; puzzle = null; field = null; if (name) room.fields.name = [name]; out.push(room); }
    lines(text).forEach(function (l) {
      var m;
      if (!l) { if (field && !/^(enter|exit|riddle)$/.test(field)) field = null; return; }
      if ((m = RE_ROOM.exec(l))) { start(+m[1], clean(m[2] || m[3] || '')); return; }
      if ((m = RE_PUZZLE.exec(l)) && /puzzle|^\d/i.test(l) && !/^\d{1,2}\s*[.\-]\s*\d\s+\D{0,3}\d/.test(l)) {
        if (!room || room.no !== +m[1]) start(+m[1], '');
        puzzle = newPuzzle(+m[2]); room.puzzles.push(puzzle); field = null;
        if (m[3]) puzzle.fields.title = [m[3]];
        return;
      }
      if ((m = RE_PUZZLE2.exec(l)) && room) {
        puzzle = newPuzzle(+m[1]); room.puzzles.push(puzzle); field = null;
        if (m[2]) puzzle.fields.title = [m[2]];
        return;
      }
      if ((m = RE_FIELD.exec(l))) {
        var key = m[1].toLowerCase().replace(/^wrong.*$/, 'wrong').replace(/^word$/, 'words');
        if (!room) start(0, '');
        // room fields end a puzzle
        if (key === 'exit' || key === 'enter' || key === 'name' || key === 'evidence') puzzle = null;
        field = key;
        var t = target();
        t.fields[key] = t.fields[key] || [];
        if (m[2] && !isDots(m[2])) t.fields[key].push(m[2]);
        return;
      }
      if (field && !isDots(l)) target().fields[field].push(l);
    });
    return { rooms: out.filter(function (r) { return Object.keys(r.fields).length || r.puzzles.length; }) };
  }

  // The fields of a reply as they go in the book.
  function roomFields(f) {
    var o = {};
    if (f.name) o.name = clean(f.name.join(' ')).replace(/[.:]+$/, '');
    if (f.enter) o.enter = T.cleanParagraphs(f.enter.join('\n'));
    if (f.exit) o.exit = T.cleanParagraphs(f.exit.join('\n'));
    if (f.evidence) o.evidence = clean(f.evidence.join(' '));
    return o;
  }
  function puzzleFields(f) {
    var o = {};
    if (f.title) o.title = T.cleanTitle(f.title.join(' '));
    if (f.story) o.story = clean(f.story.join(' '));
    if (f.message) o.message = clean(f.message.join(' ')).replace(/[“”"]/g, '');
    if (f.words) o.words = listOf(f.words.join(',')).map(function (w) { return T.stripAccents(w).toUpperCase().replace(/[^A-Z]/g, ''); }).filter(Boolean);
    if (f.people) o.people = listOf(f.people.join(','));
    if (f.objects) o.objects = listOf(f.objects.join(',')).map(function (w) { return w.replace(/^(?:a|an|the)\s+/i, ''); });
    if (f.place) o.place = clean(f.place.join(' ')).replace(/^(?:a|an|the)\s+/i, '').replace(/[.]+$/, '').toLowerCase();
    if (f.riddle) o.riddle = f.riddle.map(clean).join('\n');
    if (f.answer) o.answer = clean(f.answer.join(' ')).replace(/[.]+$/, '').replace(/^(?:a|an|the)\s+/i, function (s) { return s; });
    if (f.wrong) o.wrong = listOf(f.wrong.join(','));
    if (f.hint) o.hint = clean(f.hint.join(' '));
    if (f.why) o.why = clean(f.why.join(' '));
    return o;
  }

  // Which kind of reply this looks like.
  function kind(text) {
    var r = readRooms(text);
    if (r.rooms.some(function (x) { return x.no && (x.puzzles.length || x.fields.enter || x.fields.exit); })) return 'rooms';
    var s = readStory(text);
    if (s.premise || s.opening || s.ending || s.word || s.roomNames || s.blurb || s.suspects || s.alarms || s.closing || s.titles) return 'story';
    return r.rooms.length ? 'rooms' : 'unknown';
  }

  CX.reader = { lines: lines, readStory: readStory, readRooms: readRooms, roomFields: roomFields, puzzleFields: puzzleFields, kind: kind };
})(typeof window !== 'undefined' ? window : globalThis);
