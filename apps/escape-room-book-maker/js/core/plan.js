/*
 * The book plan: the setting the AI writes for, who plays, how many rooms, how many puzzles a room,
 * how it ends and which puzzle types are in. A room's id ('r1') and a puzzle's id ('r1p2') never
 * change, so what is already written stays with them. A puzzle's type and level come from the seed
 * unless the user chose another type for it.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  // guide: what the AI builds the story from; rooms: the kind of places it can use; art: the cover drawing.
  var SETTINGS = [
    { id: 'manor', title: 'The haunted manor', sub: 'Candles, portraits, a host who vanished', art: 'manor', guide: 'one night locked inside an old manor house after the host vanishes at a dinner party',
      rooms: 'grand hall, library, music room, conservatory, portrait gallery, kitchen, cellar, attic, nursery, clock tower, secret passage, chapel', kid: 'a sleepover in a creaky old house full of friendly mysteries, where a playful ghost has hidden the way out' },
    { id: 'casino', title: 'The casino at midnight', sub: 'A 1960s heist, and you are the fall guy', art: 'dial', guide: 'a 1960s casino sealed at midnight after its vault is emptied, and the house blames you',
      rooms: 'gaming floor, card room, counting room, security office, kitchen, cigar lounge, manager’s office, roof, boiler room, vault corridor, ballroom, staff tunnel', kid: 'a magician’s theater where the star magician has vanished and left a trail of tricks' },
    { id: 'train', title: 'The snowbound night train', sub: 'A sleeper car, a storm, a stranger', art: 'train', guide: 'an overnight express train stopped by a snowstorm, with the doors locked and something wrong on board',
      rooms: 'sleeping car, dining car, luggage van, conductor’s cabin, observation car, kitchen car, mail car, engine, smoking lounge, coal tender, first-class suite, roof hatch', kid: 'a magical holiday train that has stopped in the snow, with a missing conductor to find' },
    { id: 'temple', title: 'The lost temple', sub: 'Traps, torches and old gods', art: 'temple', guide: 'an archaeologist trapped inside a jungle temple that has sealed itself behind them',
      rooms: 'entrance hall, hall of pillars, flooded chamber, burial room, star room, rope bridge, treasury, carved stairway, mirror room, sand chamber, altar, hidden garden', kid: 'a young explorer finding the way out of a friendly old jungle temple full of clever monkeys' },
    { id: 'ship', title: 'The drifting ship', sub: 'A silent ocean liner at sea', art: 'ship', guide: 'waking alone on a grand ocean liner adrift at sea, its passengers and crew gone',
      rooms: 'bridge, radio room, engine room, grand staircase, captain’s cabin, cargo hold, galley, ballroom, lifeboat deck, chart room, boiler room, purser’s office', kid: 'a pirate ship with a friendly crew who left a treasure trail for you to follow' },
    { id: 'space', title: 'The silent space station', sub: 'Air is running out', art: 'station', guide: 'the last person awake on a deep-space research station as its systems fail one by one',
      rooms: 'airlock, command deck, hydroponics garden, reactor room, crew quarters, medical bay, cargo bay, observatory, server room, docking ring, lab, escape pod bay', kid: 'a robot helper who has locked the doors on a space station by mistake and needs your help' },
    { id: 'museum', title: 'The museum after dark', sub: 'Locked in with the exhibits', art: 'columns', guide: 'locked inside a great museum overnight on the night a famous treasure disappears',
      rooms: 'great hall, Egyptian gallery, map room, armory, dinosaur hall, restorer’s workshop, curator’s office, sculpture court, vault, gift shop, coin room, basement archive', kid: 'a sleepover at the museum, where the exhibits have been hiding clues for you' },
    { id: 'spy', title: 'The Cold War bunker', sub: 'Codes, dead drops, a mole', art: 'radar', guide: 'a retired spy pulled back in by a coded message and trapped in a Cold War bunker',
      rooms: 'radio room, map room, archive, interrogation room, generator room, armory, canteen, code room, tunnel, safe house, command center, lift shaft', kid: 'a junior spy school where the final test is getting out of the training bunker' },
    { id: 'hotel', title: 'The grand old hotel', sub: 'One rainy night, every door locked', art: 'door', guide: 'a stranded guest in a grand old hotel where the staff have disappeared and the doors lock behind you',
      rooms: 'lobby, front desk, elevator, ballroom, kitchen, laundry, wine cellar, rooftop, room 13, manager’s office, switchboard, staff stairs', kid: 'a funny old hotel run by a forgetful owner who has lost every key' },
    { id: 'lab', title: 'The mad inventor’s lab', sub: 'Machines, gears and bad ideas', art: 'gear', guide: 'locked in the workshop of a brilliant, unhinged inventor who built the house as a test',
      rooms: 'workshop, clock room, chemistry lab, greenhouse, generator room, library, automaton hall, drafting room, attic, elevator, boiler room, vault', kid: 'the workshop of a kind and silly inventor whose machines have locked the doors' },
    { id: 'halloween', title: 'Halloween night', sub: 'A carnival, masks, midnight', art: 'moon', guide: 'a Halloween carnival that locks its gates at dusk, and you have until midnight to get out',
      rooms: 'gates, hall of mirrors, fortune teller’s tent, ghost train, midway, big top, costume wagon, carousel, graveyard maze, pumpkin patch, ticket booth, ringmaster’s wagon', kid: 'a not-too-scary Halloween carnival where friendly monsters have hidden the keys' },
    { id: 'christmas', title: 'Christmas Eve', sub: 'Santa’s workshop is locked', art: 'star', guide: 'trapped in a snowed-in workshop on Christmas Eve, with one night to get out and save the delivery',
      rooms: 'toy workshop, wrapping room, reindeer stable, mail room, kitchen, sleigh shed, list office, attic, ice cellar, candy room, bell tower, chimney', kid: 'an elf helper who has one night to open every door in the workshop and save Christmas' },
    { id: 'custom', title: 'My own setting', sub: 'Type it in the box below', art: 'door', guide: '', rooms: 'whatever rooms fit the setting', kid: '' }
  ];

  // reader: who the writing is tested on; blurb: the back-cover tone.
  var AUDIENCES = [
    { id: 'adults', label: 'Adults', who: 'adults who love escape rooms, mysteries and a good puzzle', reader: 'an adult who loves escape rooms', blurb: 'tense and inviting', level: 'rising' },
    { id: 'family', label: 'Teens and families', who: 'teenagers and families playing together', reader: 'a curious 13-year-old', blurb: 'exciting and inviting', level: 'rising', clean: true },
    { id: 'kids', label: 'Kids (8 to 12)', who: 'children aged 8 to 12', reader: 'a 9-year-old', blurb: 'fun and exciting, written for the parents and grandparents who buy it', level: 'easy', clean: true, kid: true }
  ];

  var FINALES = [
    { id: 'escape', label: 'The way out', help: 'Every room gives one key letter. At the last door the letters make the word that opens it.' },
    { id: 'culprit', label: 'Name the culprit', help: 'The story hides a culprit. Each room clears one suspect, and at the end you make your accusation.' }
  ];

  // Locks on the page: how hard a puzzle is.
  var LEVELS = [
    { id: 'easy', no: 1, label: 'Easy', help: 'Friendly from start to finish. Good for a first escape book or for kids.' },
    { id: 'medium', no: 2, label: 'Medium', help: 'A steady challenge for people who like puzzles.' },
    { id: 'hard', no: 3, label: 'Hard', help: 'For people who find most puzzle books too easy.' }
  ];

  var ROOM_COUNTS = [6, 8, 10, 12], MIN_ROOMS = 4, MAX_ROOMS = 16;

  function setting(id) { return SETTINGS.filter(function (s) { return s.id === id; })[0] || SETTINGS[0]; }
  function audience(id) { return AUDIENCES.filter(function (a) { return a.id === id; })[0] || AUDIENCES[0]; }
  function finale(id) { return FINALES.filter(function (f) { return f.id === id; })[0] || FINALES[0]; }
  function level(id) { return LEVELS.filter(function (l) { return l.id === id; })[0] || LEVELS[1]; }
  function letters(s) { return String(s || '').toUpperCase().replace(/[^A-Z]/g, ''); }

  function setAudience(plan, id) {
    var a = audience(id);
    plan.audience = a.id;
    plan.level = a.level;
    if (a.kid) plan.finale = 'escape';
    plan.kinds = CX.engine.defaultKinds(a.id);
  }

  // The level of a room: in a rising book the first third is easy and the last third is hard.
  function roomLevel(project, no) {
    var l = project.plan.level;
    if (l !== 'rising') return level(l).no;
    return Math.min(3, Math.floor((no - 1) * 3 / Math.max(1, project.plan.rooms)) + 1);
  }

  /*
   * Which puzzle types go where. Every room gets different types, no more than two text codes, and
   * the book works through all the chosen types before it repeats one. Decided by the seed alone,
   * so the plan holds still while the AI writes for it.
   */
  function kindPlan(project) {
    var pl = project.plan, E = CX.engine, rng = CX.util.makeRng(project.seed + '|kinds|' + pl.rooms + '|' + pl.perRoom + '|' + pl.kinds.join());
    var chosen = pl.kinds.filter(function (k) { return E.kind(k); });
    if (chosen.length < pl.perRoom) chosen = E.defaultKinds(pl.audience);
    var deck = [], out = [];
    for (var r = 0; r < pl.rooms; r++) {
      var room = [];
      for (var s = 0; s < pl.perRoom; s++) {
        if (!deck.length) deck = rng.shuffle(chosen.slice());
        var at = -1;
        for (var i = 0; i < deck.length; i++) {
          var used = room.indexOf(deck[i]) !== -1, code = E.kind(deck[i]).group === 'code';
          if (!used && !(code && room.filter(function (x) { return E.kind(x).group === 'code'; }).length >= 2)) { at = i; break; }
        }
        // the rest of the deck only has types this room already holds: open a new one on top
        if (at < 0) { deck = deck.concat(rng.shuffle(chosen.filter(function (k) { return room.indexOf(k) === -1; }))); at = deck.findIndex(function (k) { return room.indexOf(k) === -1; }); }
        room.push(deck.splice(at, 1)[0]);
      }
      out.push(room);
    }
    return out;
  }

  // The rooms of the book in order: [{ id, no, level, slots: [{ id, key: '3.2', room, no, level, kind }] }].
  function rooms(project) {
    var plan = kindPlan(project), out = [];
    for (var r = 1; r <= project.plan.rooms; r++) {
      var lv = roomLevel(project, r), slots = [], stored = project.rooms['r' + r] || {};
      for (var s = 1; s <= project.plan.perRoom; s++) {
        var id = 'r' + r + 'p' + s, d = (stored.puzzles || {})[id] || {};
        slots.push({ id: id, roomId: 'r' + r, key: r + '.' + s, room: r, no: s, level: lv, kind: d.kind && CX.engine.kind(d.kind) ? d.kind : plan[r - 1][s - 1] });
      }
      out.push({ id: 'r' + r, no: r, level: lv, slots: slots });
    }
    return out;
  }

  function titleIdeas(project) {
    var s = setting(project.plan.setting), out = (project.story.titles || []).slice(0, 3);
    var who = project.plan.audience === 'kids' ? 'for Kids' : project.plan.audience === 'family' ? 'for Teens and Families' : 'for Adults';
    if (s.id !== 'custom') {
      var name = s.title.replace(/(^|\s)(\w)/g, function (m, a, c) { return a + c.toUpperCase(); }).replace(/ At /g, ' at ').replace(/^The /, 'the ');
      out.push('Escape ' + name + ': An Escape Room Book ' + who);
    }
    out.push('The Last Door: An Escape Room Puzzle Book ' + who);
    return out.slice(0, 4);
  }

  function subtitleIdea(project) {
    var pl = project.plan;
    return pl.rooms + ' Locked Rooms, ' + (pl.rooms * pl.perRoom) + ' Puzzles, One Way Out. No App, No Scissors, Just a Pencil';
  }

  function bookTitle(project) { return (project.book.title || '').trim() || titleIdeas(project)[0]; }
  function bookSubtitle(project) { return (project.book.subtitle || '').trim() || subtitleIdea(project); }

  function emptyStory() {
    return { premise: '', role: '', titles: [], opening: [], roomNames: [], word: '', wordDecoys: [], wordClue: '', suspects: [], culprit: '', ending: [], badEnding: [], alarms: [], closing: [], blurb: '' };
  }
  function emptyRoom() { return { name: '', enter: [], exit: [], evidence: '', puzzles: {} }; }
  function emptyPuzzle() { return { kind: '', v: 0, title: '', story: '', message: '', words: [], people: [], objects: [], place: '', riddle: '', answer: '', wrong: [], hint: '', why: '' }; }

  function newProject() {
    return {
      v: 1,
      seed: CX.util.randomSeed(),
      book: { title: '', subtitle: '', author: '', trim: '6x9', paper: 'white', print: 'regular' },
      plan: { setting: 'manor', customSetting: '', audience: 'adults', rooms: 10, perRoom: 4, level: 'rising', finale: 'escape', kinds: CX.engine.defaultKinds('adults'), shuffle: true, flip: true, notes: true },
      story: emptyStory(),
      rooms: {},
      cover: { design: 'manor-navy', palette: '' }
    };
  }

  function room(project, id) { return project.rooms[id] || (project.rooms[id] = emptyRoom()); }
  function puzzle(project, slot) {
    var r = room(project, slot.roomId);
    return r.puzzles[slot.id] || (r.puzzles[slot.id] = emptyPuzzle());
  }

  function validRooms(n) { n = Math.round(+n); return n >= MIN_ROOMS && n <= MAX_ROOMS ? n : 0; }

  function strings(a) { return Array.isArray(a) ? a.filter(function (s) { return typeof s === 'string' && s.trim(); }) : []; }

  // Fills in anything an older or hand-edited project file is missing.
  function normalize(p) {
    var d = newProject();
    p = p && typeof p === 'object' ? p : {};
    var out = { v: 1, seed: typeof p.seed === 'string' && p.seed ? p.seed : d.seed };
    ['book', 'plan', 'cover'].forEach(function (k) { out[k] = Object.assign({}, d[k], p[k] && typeof p[k] === 'object' ? p[k] : {}); });
    var pl = out.plan;
    pl.rooms = validRooms(pl.rooms) || 10;
    pl.perRoom = +pl.perRoom === 3 ? 3 : 4;
    pl.setting = setting(pl.setting).id;
    pl.audience = audience(pl.audience).id;
    pl.finale = finale(pl.finale).id;
    if (pl.level !== 'rising') pl.level = level(pl.level).id;
    pl.kinds = strings(pl.kinds).filter(function (k) { return CX.engine.kind(k); });
    if (pl.kinds.length < pl.perRoom) pl.kinds = CX.engine.defaultKinds(pl.audience);
    ['shuffle', 'flip', 'notes'].forEach(function (k) { pl[k] = !!pl[k]; });
    if (typeof pl.customSetting !== 'string') pl.customSetting = '';
    var st = emptyStory(), src = p.story && typeof p.story === 'object' ? p.story : {};
    ['premise', 'role', 'word', 'wordClue', 'culprit', 'blurb'].forEach(function (k) { if (typeof src[k] === 'string') st[k] = src[k]; });
    ['titles', 'opening', 'roomNames', 'wordDecoys', 'ending', 'badEnding', 'alarms', 'closing'].forEach(function (k) { st[k] = strings(src[k]); });
    st.suspects = Array.isArray(src.suspects) ? src.suspects.filter(function (s) { return s && typeof s.name === 'string' && s.name.trim(); }).map(function (s) { return { name: s.name, about: typeof s.about === 'string' ? s.about : '' }; }) : [];
    out.story = st;
    out.rooms = {};
    if (p.rooms && typeof p.rooms === 'object') {
      Object.keys(p.rooms).forEach(function (id) {
        if (!/^r\d{1,2}$/.test(id)) return;
        var s = p.rooms[id] || {}, e = emptyRoom();
        if (typeof s.name === 'string') e.name = s.name;
        if (typeof s.evidence === 'string') e.evidence = s.evidence;
        e.enter = strings(s.enter); e.exit = strings(s.exit);
        Object.keys(s.puzzles || {}).forEach(function (pid) {
          if (!/^r\d{1,2}p\d$/.test(pid)) return;
          var q = s.puzzles[pid] || {}, n = emptyPuzzle();
          ['kind', 'title', 'story', 'message', 'place', 'riddle', 'answer', 'hint', 'why'].forEach(function (k) { if (typeof q[k] === 'string') n[k] = q[k]; });
          ['words', 'people', 'objects', 'wrong'].forEach(function (k) { n[k] = strings(q[k]); });
          n.v = Math.max(0, Math.round(+q.v) || 0);
          e.puzzles[pid] = n;
        });
        out.rooms[id] = e;
      });
    }
    return out;
  }

  CX.plan = {
    SETTINGS: SETTINGS, AUDIENCES: AUDIENCES, FINALES: FINALES, LEVELS: LEVELS, ROOM_COUNTS: ROOM_COUNTS, MIN_ROOMS: MIN_ROOMS, MAX_ROOMS: MAX_ROOMS,
    setting: setting, audience: audience, finale: finale, level: level, letters: letters, setAudience: setAudience, roomLevel: roomLevel, kindPlan: kindPlan, rooms: rooms,
    titleIdeas: titleIdeas, subtitleIdea: subtitleIdea, bookTitle: bookTitle, bookSubtitle: bookSubtitle,
    newProject: newProject, normalize: normalize, room: room, puzzle: puzzle, emptyRoom: emptyRoom, emptyPuzzle: emptyPuzzle, emptyStory: emptyStory, validRooms: validRooms
  };
})(typeof window !== 'undefined' ? window : globalThis);
