/*
 * A room's puzzles as they go in the book: each slot built once from what the AI wrote (and built
 * again only when that changes), the room's door code, and the codes in its table. A table lists
 * the real code among seven false ones. In every position the slip digit shows up as often as the
 * real digit, so a reader can't work the code out by looking for what most rows share.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan, E = CX.engine, U = CX.util;

  var cache = {};   // puzzle key -> built puzzle
  var ROWS = 8;     // lines in a door's table

  function dataOf(project, slot) {
    var r = project.rooms[slot.roomId];
    return (r && r.puzzles && r.puzzles[slot.id]) || P.emptyPuzzle();
  }

  function get(project, slot) {
    var d = dataOf(project, slot);
    var spec = { kind: slot.kind, level: slot.level, seed: project.seed + '|' + slot.id + '|' + slot.kind + '|' + (d.v || 0), data: d };
    var k = JSON.stringify([spec.kind, spec.level, spec.seed, d.message, d.words, d.people, d.objects, d.place, d.riddle, d.answer, d.wrong, d.hint, d.why]);
    if (!cache[k]) cache[k] = E.build(spec);
    return cache[k];
  }

  // What the AI still has to write for a slot: a list of field names.
  function missing(project, slot) {
    var d = dataOf(project, slot), out = [];
    if (!d.title.trim()) out.push('title');
    if (!d.story.trim()) out.push('story');
    E.kind(slot.kind).needs.forEach(function (f) {
      var v = d[f];
      if (Array.isArray(v) ? !v.length : !String(v || '').trim()) out.push(f);
    });
    return out;
  }

  /*
   * One slot: { state: 'empty' | 'text' | 'problem' | 'ok', missing, problem, pz }. 'problem' means
   * the AI wrote something the puzzle can't use, so the prompt asks for it again.
   */
  function status(project, slot) {
    var miss = missing(project, slot), pz = get(project, slot);
    var needs = E.kind(slot.kind).needs;
    if (needs.some(function (f) { return miss.indexOf(f) !== -1; })) return { state: miss.length >= needs.length + 2 ? 'empty' : 'text', missing: miss, pz: null };
    if (pz.problem) return { state: 'problem', missing: miss, problem: pz.problem, pz: null };
    if (miss.length) return { state: 'text', missing: miss, pz: pz };
    return { state: 'ok', missing: [], pz: pz };
  }

  // The puzzles of a room, and whether all of them can be built.
  function roomPuzzles(project, room) { return room.slots.map(function (s) { return { slot: s, pz: get(project, s) }; }); }

  function isBuilt(pz) { return pz && !pz.problem; }

  // Every choice of seven masks that swaps each position in exactly half the rows.
  var MASK_SETS = {};
  function maskSets(n) {
    if (MASK_SETS[n]) return MASK_SETS[n];
    var all = U.range(1, Math.pow(2, n) - 1), out = [];
    (function go(at, chosen) {
      if (chosen.length === ROWS - 1) {
        var even = U.range(0, n - 1).every(function (i) { return chosen.filter(function (m) { return m & (1 << i); }).length === ROWS / 2; });
        var singles = chosen.filter(function (m) { return (m & (m - 1)) === 0; }).length;
        if (even && singles >= 2) out.push(chosen);
        return;
      }
      for (var k = at; k < all.length; k++) go(k + 1, chosen.concat([all[k]]));
    })(0, []);
    return (MASK_SETS[n] = out);
  }

  /*
   * The door of a room: { code: 'digits', table: [{ code, real, wrong: [slot indexes] }] sorted }, or
   * null while a puzzle is missing. Seven masks of positions to swap for the slip digit: two of them
   * change one digit (a slip the Dead End can talk about directly), and overall each position is
   * swapped in half the rows.
   */
  function door(project, room) {
    var built = roomPuzzles(project, room);
    if (!built.every(function (b) { return isBuilt(b.pz); })) return null;
    var n = built.length, real = built.map(function (b) { return b.pz.digit; }), alt = built.map(function (b) { return b.pz.trap.digit; });
    var rng = U.makeRng(project.seed + '|door|' + room.id + '|' + real.join('') + alt.join(''));
    var sets = maskSets(n), pick = sets[rng.int(sets.length)];
    var rows = [{ code: real.join(''), real: true, wrong: [] }];
    pick.forEach(function (m) {
      var code = real.slice(), wrong = [];
      for (var i = 0; i < n; i++) if (m & (1 << i)) { code[i] = alt[i]; wrong.push(i); }
      rows.push({ code: code.join(''), real: false, wrong: wrong });
    });
    rows.sort(function (a, b) { return a.code < b.code ? -1 : 1; });
    return { code: real.join(''), table: rows };
  }

  /*
   * What each room hands over at its way out. Escape books: one letter of the final word, the letters
   * dealt out of order. Culprit books: a clue clearing one suspect, spread evenly through the rooms.
   * Returns [{ letter } | { clears, evidence } | {}] by room.
   */
  function rewards(project) {
    var pl = project.plan, st = project.story, out = [], n = pl.rooms, i;
    for (i = 0; i < n; i++) out.push({});
    if (pl.finale === 'culprit') {
      var innocent = st.suspects.filter(function (s) { return s.name !== st.culprit; });
      innocent.forEach(function (s, k) {
        var at = Math.min(n - 1, Math.round((k + 1) * n / innocent.length) - 1);
        while (out[at].clears && at > 0) at--;
        out[at].clears = s.name;
        out[at].evidence = ((project.rooms['r' + (at + 1)] || {}).evidence || '').trim();
      });
    } else {
      var word = P.letters(st.word);
      if (word.length === n) {
        var order = U.makeRng(project.seed + '|letters|' + word).shuffle(U.range(0, n - 1));
        // never in the word's own order: the log would simply spell it out
        if (order.join() === U.range(0, n - 1).join()) order.reverse();
        order.forEach(function (w, r) { out[r].letter = word[w]; });
      }
    }
    return out;
  }

  // Room or suspect names, so a book doesn't need to carry a placeholder forever.
  function roomName(project, room) {
    var r = project.rooms[room.id];
    return (r && r.name.trim()) || project.story.roomNames[room.no - 1] || '';
  }

  // The problem with the story's final word, or ''.
  function wordProblem(project) {
    var w = P.letters(project.story.word), n = project.plan.rooms;
    if (project.plan.finale !== 'escape') return '';
    if (!w) return 'no final word yet';
    if (w.length !== n) return 'the final word has ' + w.length + ' letters and the book has ' + n + ' rooms';
    return '';
  }

  // The decoys of the right length: any other length would give the real word away.
  function goodDecoys(project) {
    var word = P.letters(project.story.word), n = project.plan.rooms;
    return project.story.wordDecoys.map(P.letters).filter(function (w, i, a) { return w.length === n && w !== word && a.indexOf(w) === i; });
  }

  CX.puzzles = { goodDecoys: goodDecoys, ROWS: ROWS, dataOf: dataOf, get: get, missing: missing, status: status, roomPuzzles: roomPuzzles, isBuilt: isBuilt, door: door, rewards: rewards, roomName: roomName, wordProblem: wordProblem };
})(typeof window !== 'undefined' ? window : globalThis);
