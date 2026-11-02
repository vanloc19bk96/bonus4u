/*
 * The prompts the user copies into ChatGPT (or any AI chat). The AI writes the story and the words a
 * puzzle shows; the app makes the puzzles, the hints, the answers and the code tables. A prompt only
 * asks for what its rooms still miss, so copying the same prompt again tops them up.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan, Z = CX.puzzles, E = CX.engine;

  var PER_PROMPT = 2;   // rooms a prompt asks for: long replies get thin

  // The fields a slot's puzzle can't use, going by what it reports.
  function badFields(problem) {
    if (/message/.test(problem)) return ['message'];
    if (/needs? .*words|at least/.test(problem)) return ['words'];
    if (/people/.test(problem)) return ['people'];
    if (/objects/.test(problem)) return ['objects'];
    if (/place/.test(problem)) return ['place'];
    if (/riddle/.test(problem)) return ['riddle', 'answer', 'wrong'];
    return [];
  }

  // What a slot still needs from the AI.
  function slotNeeds(project, slot) {
    var st = Z.status(project, slot), out = st.missing.slice();
    if (st.state === 'problem') badFields(st.problem).forEach(function (f) { if (out.indexOf(f) === -1) out.push(f); });
    return out;
  }

  function evidenceFor(project, room) {
    if (project.plan.finale !== 'culprit') return '';
    var r = Z.rewards(project)[room.no - 1];
    return r && r.clears || '';
  }

  // What a room still needs: { name, enter, exit, evidence, slots: { id: [fields] } }.
  function roomNeeds(project, room) {
    var d = project.rooms[room.id] || P.emptyRoom(), out = { name: !d.name.trim(), enter: !d.enter.length, exit: !d.exit.length, evidence: false, slots: {} };
    if (evidenceFor(project, room) && !d.evidence.trim()) out.evidence = true;
    room.slots.forEach(function (s) { var n = slotNeeds(project, s); if (n.length) out.slots[s.id] = n; });
    return out;
  }
  function roomDone(project, room) {
    var n = roomNeeds(project, room);
    return !n.name && !n.enter && !n.exit && !n.evidence && !Object.keys(n.slots).length;
  }

  function storyNeeds(project) {
    var s = project.story, n = [], culprit = project.plan.finale === 'culprit';
    if (!s.premise.trim()) n.push('premise');
    if (!s.role.trim()) n.push('role');
    if (!s.opening.length) n.push('opening');
    if (s.roomNames.length < project.plan.rooms) n.push('rooms');
    if (culprit) {
      if (s.suspects.length < 4) n.push('suspects');
      if (!s.culprit.trim() || !s.suspects.some(function (x) { return x.name === s.culprit; })) n.push('culprit');
      if (!s.badEnding.length) n.push('badEnding');
    } else {
      if (Z.wordProblem(project)) n.push('word');
      if (Z.goodDecoys(project).length < 3) n.push('decoys');
    }
    if (!s.ending.length) n.push('ending');
    if (s.alarms.length < 4) n.push('alarms');
    if (!s.closing.length) n.push('closing');
    if (!s.blurb.trim()) n.push('blurb');
    return n;
  }

  // [{ kind: 'story' }, { kind: 'rooms', rooms: [...] }...]
  function list(project) {
    var out = [{ kind: 'story' }], all = P.rooms(project);
    for (var i = 0; i < all.length; i += PER_PROMPT) out.push({ kind: 'rooms', rooms: all.slice(i, i + PER_PROMPT) });
    out.forEach(function (p, k) { p.no = k + 1; p.done = isDone(project, p); });
    return out;
  }
  function isDone(project, p) {
    if (p.kind === 'story') return !storyNeeds(project).length;
    return p.rooms.every(function (r) { return roomDone(project, r); });
  }
  function next(project) {
    var l = list(project);
    for (var i = 0; i < l.length; i++) if (!l[i].done) return i;
    return l.length - 1;
  }

  function title(p) {
    if (p.kind === 'story') return 'The story';
    var a = p.rooms[0], z = p.rooms[p.rooms.length - 1];
    return a === z ? 'Room ' + a.no : 'Rooms ' + a.no + ' and ' + z.no;
  }

  // ---------- shared words ----------
  function seedOf(project) {
    var pl = project.plan, s = P.setting(pl.setting), a = P.audience(pl.audience), own = pl.customSetting.trim();
    if (s.id === 'custom') return own || 'one night locked in a place with one way out';
    return (a.kid && s.kid) || s.guide;
  }

  function about(project) {
    var a = P.audience(project.plan.audience);
    return 'You are writing an escape room puzzle book for ' + a.who + '. It is a paperback, played with only a pencil. The reader is locked in and has to get out, room by room. The setting: ' + seedOf(project) + '.';
  }

  function voice(project) {
    var a = P.audience(project.plan.audience), L = [];
    L.push('How to write:');
    L.push('- Speak to the reader as "you", in the present tense. Short, clear, vivid sentences that ' + a.reader + ' would enjoy. Keep one plain tone from start to finish.');
    L.push('- Be specific: real objects, sounds and small details of this place. No stock phrases such as "shivers down your spine", "little did you know" or "the air was thick with". No em dashes.');
    L.push('- No brand names, no real living people, no song lyrics or quotes.');
    if (a.kid) L.push('- This is for children: nothing frightening or violent, no death, weapons, alcohol or romance. Adventure and silliness instead. Use words a 9-year-old can read.');
    else if (a.clean) L.push('- Teens and families read this: tension is fine, but no gore, swearing, alcohol or romance.');
    else L.push('- Tension and danger are welcome, but no gore or swearing.');
    return L;
  }

  // ---------- the story prompt ----------
  function storyPrompt(project) {
    var pl = project.plan, s = P.setting(pl.setting), a = P.audience(pl.audience), st = project.story, need = storyNeeds(project), culprit = pl.finale === 'culprit', L = [about(project), ''];
    var badWord = P.letters(st.word) && Z.wordProblem(project);
    function asked(f) { return !need.length || need.indexOf(f) !== -1; }
    L.push('The book has ' + pl.rooms + ' rooms with ' + pl.perRoom + ' puzzles each. An app makes all the puzzles, so you only write the story around them.');
    L.push('');
    if (need.length && need.length < 10) {
      L.push('Some of it is already written, and you must stay consistent with it:');
      if (st.premise.trim()) L.push('The premise: ' + st.premise.trim());
      if (st.role.trim()) L.push('The reader is: ' + st.role.trim());
      if (st.roomNames.length) L.push('The rooms: ' + st.roomNames.join(', ') + '.');
      L.push('Write only the parts asked for below.');
      L.push('');
    }
    L.push('Write these parts:');
    if (asked('premise')) L.push('- PREMISE: the whole story in 2 or 3 sentences, including how it ends. This stays between you and the author.');
    if (asked('role')) L.push('- YOU: who the reader is in this story, in one sentence.');
    L.push('- TITLE IDEAS: 3 ideas for the book’s title, each with a hook, 2 to 6 words. Do not use a title that already exists as a well-known book, and leave out the words "escape room".');
    if (asked('opening')) L.push('- OPENING: the first pages of the story, 120 to 180 words in 2 to 4 short paragraphs. It ends with the reader locked in and the first door in front of them.');
    if (asked('rooms')) L.push('- ROOMS: a numbered list of exactly ' + pl.rooms + ' room names, in the order the reader passes through them, each 1 to 4 words with no room number in it. Each has to be a clearly different place. Ideas: ' + s.rooms + '.');
    if (culprit) {
      if (asked('suspects')) L.push('- SUSPECTS: 5 people who could be behind it, one to a line, as: Full Name | one sentence on who they are and why they might have done it. Use names that look different from one another.');
      if (asked('culprit')) L.push('- CULPRIT: the full name of the one who did it, spelled exactly as in SUSPECTS. The app will clear the others one by one.');
      if (asked('badEnding')) L.push('- WRONG ENDING: 1 or 2 sentences for when the reader accuses the wrong person. Do not name anybody.');
    } else {
      if (asked('word')) L.push('- FINAL WORD: the word that opens the last door and names the secret of the story. Give 3 candidates, the best first, each with exactly ' + pl.rooms + ' letters, and write the count after each one like this: WORD (' + pl.rooms + '). Spell each one out letter by letter before you trust it. A two-word phrase is fine if the letters add up to ' + pl.rooms + '.' + (badWord ? ' Your last word could not be used: ' + badWord + '.' : ''));
      if (asked('decoys')) L.push('- DECOYS: 6 other words or phrases with exactly ' + pl.rooms + ' letters each that could also fit the story, to sit beside it in the last door’s list. Write the count after each one too. A word of any other length gives the answer away.');
      L.push('- WORD CLUE: one sentence shown at the last door that hints what the word means in the story, without using the word.');
    }
    if (asked('ending')) L.push('- ENDING: the moment the reader gets out, 100 to 150 words. Make it pay off the premise.');
    if (asked('alarms')) L.push('- DEAD END LINES: 8 different one-sentence moments, one to a line, for when a wrong code fails in this place, such as a sound, a light or a small threat. Do not mention a specific room or puzzle.');
    if (asked('closing')) L.push('- CLOSING: a short thank-you note to the reader for the last page, about 60 words, out of the story. You may kindly ask for an honest review, but never offer anything in return.' + (a.kid ? ' If you mention a review, ask the child to tell a grown-up, because a grown-up has to write it.' : ''));
    if (asked('blurb')) L.push('- BACK COVER: the back-cover description, about 70 words, ' + a.blurb + '. Start with a hook. Do not mention any other book, game or brand, and promise nothing that is not in the book. The app adds a list of what is inside.');
    L.push('');
    Array.prototype.push.apply(L, voice(project));
    L.push('');
    L.push('Reply with one code block in exactly this format, with these labels:');
    L.push('');
    var format = [];
    if (asked('premise')) format.push('PREMISE: ...');
    if (asked('role')) format.push('YOU: ...');
    format.push('TITLE IDEAS:', '...', '...', '...');
    if (asked('opening')) format.push('OPENING:', 'First paragraph.', 'Second paragraph.');
    if (asked('rooms')) format.push('ROOMS:', '1. ...', '2. ...');
    if (culprit) {
      if (asked('suspects')) format.push('SUSPECTS:', 'Full Name | who they are');
      if (asked('culprit')) format.push('CULPRIT: Full Name');
      if (asked('badEnding')) format.push('WRONG ENDING: ...');
    } else {
      if (asked('word')) format.push('FINAL WORD: WORD (' + pl.rooms + '), WORD (' + pl.rooms + '), WORD (' + pl.rooms + ')');
      if (asked('decoys')) format.push('DECOYS: WORD (' + pl.rooms + '), WORD (' + pl.rooms + '), WORD (' + pl.rooms + '), WORD (' + pl.rooms + '), WORD (' + pl.rooms + '), WORD (' + pl.rooms + ')');
      format.push('WORD CLUE: ...');
    }
    if (asked('ending')) format.push('ENDING:', 'First paragraph.');
    if (asked('alarms')) format.push('DEAD END LINES:', 'A line.', 'A line.');
    if (asked('closing')) format.push('CLOSING: ...');
    if (asked('blurb')) format.push('BACK COVER: ...');
    Array.prototype.push.apply(L, format);
    L.push('');
    L.push('Write out every part in full: never leave "..." in your reply.');
    return L.join('\n');
  }

  // ---------- the room prompts ----------
  // What the AI should know about the book so a room fits the story.
  function bible(project, rooms) {
    var st = project.story, L = [];
    if (st.premise.trim()) L.push('The story so far, which you must stay true to: ' + st.premise.trim());
    if (st.role.trim()) L.push('The reader is: ' + st.role.trim());
    if (st.roomNames.length) L.push('The rooms in order: ' + st.roomNames.map(function (n, i) { return (i + 1) + '. ' + n; }).join('; ') + '.');
    if (project.plan.finale === 'culprit' && st.suspects.length) L.push('The suspects: ' + st.suspects.map(function (x) { return x.name; }).join(', ') + '. The culprit is ' + (st.culprit || 'not named yet') + ', which the reader must not learn until the end.');
    var first = rooms[0], before = first.no > 1 ? project.rooms['r' + (first.no - 1)] : null;
    if (before && before.exit.length) L.push('The reader has just left room ' + (first.no - 1) + ': ' + before.exit.join(' '));
    else if (first.no === 1 && st.opening.length) L.push('The opening the reader has just read: ' + st.opening.join(' '));
    return L;
  }

  var FIELD_RULES = {
    message: function () {
      return 'MESSAGE: what the code spells out once it is solved, in plain words only: a short line that belongs in this place and stays within the letters given above. It must contain the marker [N] exactly once where a number word goes: the app decides the number and puts it in, so do not count the marker. Do not write any other number word in it.';
    },
    words: function () { return 'WORDS: 10 words that belong in this room, comma separated, each one word of 4 to 8 letters, and no word inside another.'; },
    people: function () { return 'PEOPLE: 4 first names for people in this story, comma separated, each starting with a different letter.'; },
    objects: function () { return 'OBJECTS: 4 small things they could find, comma separated, 1 or 2 plain words each with no "a" or "the".'; },
    place: function () { return 'PLACE: one singular word for the numbered things they took (locker, drawer, cabin, crate). Lowercase, no number.'; },
    riddle: function () { return 'RIDDLE: 2 to 4 short lines, fair and clever, whose answer fits this room. Line breaks allowed.'; },
    answer: function () { return 'ANSWER: the one answer to the riddle, 1 or 2 words.'; },
    wrong: function () { return 'WRONG: 3 tempting wrong answers, comma separated. Each must clearly fail at least one line of the riddle.'; },
    hint: function () { return 'HINT: one sentence that nudges the reader toward the answer without naming it.'; },
    why: function () { return 'WHY: one sentence on how each line of the riddle points to the answer.'; }
  };

  function roomsPrompt(project, p) {
    var pl = project.plan, todo = p.rooms.filter(function (r) { return !roomDone(project, r); }), L = [about(project), ''];
    if (!todo.length) todo = p.rooms;
    Array.prototype.push.apply(L, bible(project, todo));
    L.push('');
    L.push('An app makes the puzzles and prints how each one works, so you never explain a puzzle or give its answer. You write the room around it.');
    L.push('');
    L.push('Write ' + (todo.length > 1 ? 'these ' + todo.length + ' rooms' : 'this room') + ':');
    todo.forEach(function (room) {
      var n = roomNeeds(project, room), name = Z.roomName(project, room), clears = evidenceFor(project, room);
      L.push('');
      L.push('ROOM ' + room.no + (name ? ' (' + name + ')' : '') + ':');
      if (n.name) L.push('- NAME: the room’s name' + (name ? ', which is ' + name : '') + '.');
      if (n.enter) L.push('- ENTER: walking in and what is there, 50 to 90 words, ending with the door the reader has to open.');
      if (n.exit) L.push('- EXIT: what happens as the door finally opens, 30 to 60 words. It moves the story on and leads toward ' + (room.no < pl.rooms ? 'the next room' : 'the last door') + '.');
      if (n.evidence) L.push('- EVIDENCE: one sentence, a fact found here that proves ' + clears + ' could not have done it, naming them.');
      room.slots.forEach(function (slot) {
        var need = n.slots[slot.id];
        if (!need) return;
        var k = E.kind(slot.kind), st = Z.status(project, slot), line = '- PUZZLE ' + slot.key + ': the page shows ' + k.brief + '.';
        if (st.state === 'problem') line += ' Your last version could not be used: ' + st.problem + '.';
        L.push(line + ' Write ' + need.map(function (f) { return f === 'message' ? 'MESSAGE (at most ' + (k.maxLetters - 5) + ' letters)' : f.toUpperCase(); }).join(', ') + '.');
      });
    });
    L.push('');
    L.push('What goes in a puzzle:');
    L.push('- TITLE: 2 to 5 words, the name of this thing in the room ("The Butler’s Note"). It must not explain the puzzle.');
    L.push('- STORY: 1 or 2 sentences, at most 35 words, on why this thing is here and why it matters to you. No instructions, no numbers and no answers: the app prints how to solve it right below your words.');
    var seen = {};
    todo.forEach(function (room) {
      var n = roomNeeds(project, room);
      Object.keys(n.slots).forEach(function (id) {
        var slot = room.slots.filter(function (s) { return s.id === id; })[0], k = E.kind(slot.kind);
        n.slots[id].forEach(function (f) {
          if (f === 'title' || f === 'story') return;
          if (FIELD_RULES[f]) seen[f] = { rule: FIELD_RULES[f](k) };
        });
      });
    });
    ['message', 'words', 'people', 'objects', 'place', 'riddle', 'answer', 'wrong', 'hint', 'why'].forEach(function (f) { if (seen[f]) L.push('- ' + seen[f].rule); });
    if (seen.message) L.push('- MESSAGE examples: DRAWER [N] (a short one), THE SPARE KEY IS IN DRAWER [N] (a long one). Keep [N] exactly like that.');
    L.push('');
    Array.prototype.push.apply(L, voice(project));
    L.push('- Each puzzle’s TITLE and STORY has to feel like a different thing in the room. Never mention puzzle types such as "cipher" or "sudoku".');
    L.push('');
    L.push('Reply with one code block in exactly this format, with these labels:');
    L.push('');
    var room = todo[0], n0 = roomNeeds(project, room);
    L.push('ROOM ' + room.no);
    if (n0.name) L.push('NAME: ...');
    if (n0.enter) L.push('ENTER: ...');
    if (n0.exit) L.push('EXIT: ...');
    if (n0.evidence) L.push('EVIDENCE: ...');
    var sample = room.slots.filter(function (s) { return n0.slots[s.id]; })[0];
    if (sample) {
      L.push('PUZZLE ' + sample.key);
      n0.slots[sample.id].forEach(function (f) { L.push(f.toUpperCase() + ': ...'); });
    }
    L.push('');
    L.push('Start each room with its ROOM line and each puzzle with its PUZZLE line, in order, and give every puzzle only the labels asked for above. Write everything out in full: never leave "..." in your reply.');
    return L.join('\n');
  }

  /*
   * Sends rooms the book already has back to the AI for a careful edit. Its reply replaces them.
   */
  function checkPrompt(project, rooms) {
    var L = [about(project), ''];
    Array.prototype.push.apply(L, bible(project, rooms));
    L.push('');
    L.push('Below ' + (rooms.length > 1 ? 'are ' + rooms.length + ' rooms' : 'is one room') + ' of the book. Edit them as a careful editor. Puzzle fields are not yours to explain: an app makes the puzzles and prints how they work.');
    L.push('');
    L.push('How to check:');
    L.push('- Fix spelling, grammar and any word that is not what it should be. In a puzzle book every word matters.');
    L.push('- Does each room flow from the one before and fit the story? Does each EXIT lead on?');
    L.push('- Cut stock phrases and anything that explains a puzzle or gives an answer away.');
    L.push('- MESSAGE lines keep the marker [N] exactly once and contain no other number word.');
    L.push('- A RIDDLE has to be fair: every line fits the ANSWER, and every WRONG answer fails at least one line.');
    L.push('- Keep what is already good exactly as it is.');
    L.push('');
    Array.prototype.push.apply(L, voice(project));
    L.push('');
    L.push('Reply with one code block in the same format: every room and puzzle in full.');
    L.push('');
    rooms.forEach(function (room) {
      var d = project.rooms[room.id] || P.emptyRoom();
      L.push('ROOM ' + room.no);
      L.push('NAME: ' + d.name);
      L.push('ENTER: ' + d.enter.join(' '));
      L.push('EXIT: ' + d.exit.join(' '));
      if (d.evidence) L.push('EVIDENCE: ' + d.evidence);
      room.slots.forEach(function (slot) {
        var q = Z.dataOf(project, slot);
        L.push('PUZZLE ' + slot.key);
        L.push('TITLE: ' + q.title);
        L.push('STORY: ' + q.story);
        E.kind(slot.kind).needs.forEach(function (f) {
          var v = q[f];
          L.push(f.toUpperCase() + ': ' + (Array.isArray(v) ? v.join(', ') : v));
        });
      });
      L.push('');
    });
    return L.join('\n').trim();
  }

  function text(project, p) { return p.kind === 'story' ? storyPrompt(project) : roomsPrompt(project, p); }

  CX.prompts = { PER_PROMPT: PER_PROMPT, slotNeeds: slotNeeds, roomNeeds: roomNeeds, roomDone: roomDone, storyNeeds: storyNeeds, list: list, next: next, isDone: isDone, title: title, text: text, checkText: checkPrompt, evidenceFor: evidenceFor };
})(typeof window !== 'undefined' ? window : globalThis);
