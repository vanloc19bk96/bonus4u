/*
 * Puts the AI's writing into the book. A reply brings new text for what it names and leaves the rest
 * alone, so a top-up and a corrected version both go in the same way. A room with no number in the
 * reply goes to the first room of the prompt that has no text yet.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan, R = CX.reader;

  // Copies a story reply in: { got: [labels] }.
  function addStory(project, parsed) {
    var st = project.story, got = [], LABELS = { premise: 'premise', role: 'your role', titles: 'title ideas', opening: 'opening', roomNames: 'room names', word: 'final word', wordDecoys: 'decoys', wordClue: 'word clue', suspects: 'suspects', culprit: 'culprit', ending: 'ending', badEnding: 'wrong ending', alarms: 'dead end lines', closing: 'closing note', blurb: 'back cover' };
    // the first candidate with the right number of letters; the others can sit beside it as decoys
    if (parsed.word) {
      var n = project.plan.rooms, picks = parsed.word, best = picks.filter(function (w) { return P.letters(w).length === n; })[0] || picks[0];
      parsed = Object.assign({}, parsed, { word: best });
      var spare = picks.filter(function (w) { return w !== best; });
      if (spare.length) parsed.wordDecoys = (parsed.wordDecoys || st.wordDecoys).concat(spare);
    }
    Object.keys(parsed).forEach(function (k) {
      var v = parsed[k];
      if (Array.isArray(v) ? !v.length : !String(v || '').trim()) return;
      st[k] = v;
      got.push(LABELS[k] || k);
    });
    // room names given before the rooms themselves are written go to any room that has no name yet
    if (parsed.roomNames) parsed.roomNames.forEach(function (name, i) {
      var id = 'r' + (i + 1);
      if (i < project.plan.rooms && !(project.rooms[id] && project.rooms[id].name.trim())) P.room(project, id).name = name;
    });
    return { got: got };
  }

  /*
   * Adds a rooms reply. fallback: the rooms of the prompt, for parts with no room number. Returns
   * { rooms: [no], puzzles: n, unplaced: n }.
   */
  function addRooms(project, parsed, fallback) {
    var all = P.rooms(project), open = (fallback || []).slice(), rep = { rooms: [], puzzles: 0, unplaced: 0 };
    parsed.rooms.forEach(function (part) {
      var room = part.no ? all[part.no - 1] : open.shift();
      if (!room) { rep.unplaced += part.puzzles.length + 1; return; }
      open = open.filter(function (x) { return x.id !== room.id; });
      var d = P.room(project, room.id);
      Object.assign(d, R.roomFields(part.fields));
      part.puzzles.forEach(function (q, i) {
        var slot = room.slots[(q.no || i + 1) - 1];
        if (!slot) { rep.unplaced++; return; }
        Object.assign(P.puzzle(project, slot), R.puzzleFields(q.fields));
        rep.puzzles++;
      });
      if (rep.rooms.indexOf(room.no) === -1) rep.rooms.push(room.no);
    });
    return rep;
  }

  // Clears rooms so their prompt asks for all of them again. A type the user chose stays.
  function clearRooms(project, rooms) {
    rooms.forEach(function (room) {
      var old = project.rooms[room.id], name = (project.story.roomNames || [])[room.no - 1] || '', fresh = P.emptyRoom();
      fresh.name = name;
      room.slots.forEach(function (s) {
        var q = old && old.puzzles[s.id];
        if (q && q.kind) { fresh.puzzles[s.id] = P.emptyPuzzle(); fresh.puzzles[s.id].kind = q.kind; }
      });
      project.rooms[room.id] = fresh;
    });
  }

  // Titles or room names used twice: [{ what, name, where }].
  function repeats(project) {
    var out = [], rooms = P.rooms(project), names = {}, titles = {};
    rooms.forEach(function (r) {
      var n = CX.puzzles.roomName(project, r).toLowerCase();
      if (n) (names[n] = names[n] || []).push('room ' + r.no);
      r.slots.forEach(function (s) {
        var t = CX.puzzles.dataOf(project, s).title.trim().toLowerCase();
        if (t) (titles[t] = titles[t] || []).push('puzzle ' + s.key);
      });
    });
    Object.keys(names).forEach(function (n) { if (names[n].length > 1) out.push({ what: 'room name', name: n, where: names[n] }); });
    Object.keys(titles).forEach(function (n) { if (titles[n].length > 1) out.push({ what: 'title', name: n, where: titles[n] }); });
    return out;
  }

  // Puzzles over the whole book.
  function totals(project) {
    var t = { puzzles: 0, ready: 0, rooms: project.plan.rooms };
    P.rooms(project).forEach(function (r) {
      r.slots.forEach(function (s) { t.puzzles++; if (CX.puzzles.status(project, s).state === 'ok') t.ready++; });
    });
    return t;
  }

  CX.content = { addStory: addStory, addRooms: addRooms, clearRooms: clearRooms, repeats: repeats, totals: totals };
})(typeof window !== 'undefined' ? window : globalThis);
