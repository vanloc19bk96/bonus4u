/*
 * The archive types beyond the lottery register, each with its settings.
 * A setting changes the labels (decks or coaches, departments, towers), the era of the names,
 * the opening hours and the story's background; the clue engine reads only the fields.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var T = LK.types, F = LK.fields;
  var list = F.helpers.list, pad = F.helpers.pad;
  var clock = function (m) { return LK.themes.clock(m); };
  function fmtN(n) { return n.toLocaleString('en-US'); }
  function words(s) { return s.split('|'); }
  function custom(base, extra) { return Object.assign({}, base, { id: 'custom', label: 'My own setting', hint: 'Describe it in one line' }, extra || {}); }

  // the original lottery register comes first
  T.register(T.lottery());

  function byName(a, b) { return a.last < b.last ? -1 : a.last > b.last ? 1 : a.first < b.first ? -1 : a.first > b.first ? 1 : 0; }

  // ---------- dates ----------
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dateField(key, noun, col, start, days, verb, verbNot) {
    var t0 = Date.UTC(start[0], start[1] - 1, start[2]);
    var d = function (day) { return new Date(t0 + day * 86400000); };
    return {
      key: key, kind: 'date', noun: noun, col: col, days: days, verb: verb, verbNot: verbNot,
      weekday: function (day) { return d(day).getUTCDay(); },
      fmt: function (day) { var x = d(day); return WD[x.getUTCDay()] + ' ' + MON[x.getUTCMonth()].slice(0, 3) + ' ' + x.getUTCDate(); },
      long: function (day) { var x = d(day); return MON[x.getUTCMonth()] + ' ' + x.getUTCDate(); }
    };
  }

  // ---------- shared readings ----------
  function clueReading(cs) {
    var kinds = {};
    cs.fieldList.forEach(function (f) { kinds[f.kind] = true; if (f.words) kinds.words = true; });
    var out = ['“Or later”, “or earlier”, “or higher”, “or lower”, “or more” and “or less” include the value itself.'];
    if (kinds.time || kinds.int || kinds.date || kinds.dur) out.push('“Between” includes both ends.');
    if (kinds.time) out.push('The minutes of a time are its last two digits: 9:47 PM has minutes 47.');
    if (kinds.code) out.push('The digits of 48213 are 4, 8, 2, 1 and 3, and they add up to 18.');
    if (kinds.name || kinds.words) out.push('Count letters only. The vowels are A, E, I, O and U; Y is not a vowel. Repeated letters count each time: ANNA has four letters and two vowels.');
    if (kinds.name || kinds.letter || kinds.words) out.push('“Before” and “after” in the alphabet are strict: a letter is never before or after itself.');
    if (kinds.lat) {
      out.push('Latitude (N or S) says how far north or south of the equator a place is; longitude (E or W) how far east or west of Greenwich.');
      out.push('“Farther north” means closer to the North Pole: 10.00°S is farther north than 20.00°S. “Farther east” works the same way: 10.00°W is farther east than 20.00°W.');
    }
    out.push('“If A, then B” clues rule out only rows where A is true and B is false.');
    out.push('“A, or B (or both)” clues keep every row where at least one part is true.');
    return out;
  }
  function moodsFor(setting, n) { return setting.moods || null; }

  // ---------- the passenger manifest ----------
  var OCC_1930 = words('Academic|Attendant|Banker|Clergyman|Diplomat|Engineer|Entertainer|Journalist|Merchant|Military|Physician|Trader');
  var OCC_NOW = words('Accountant|Architect|Consultant|Designer|Engineer|Journalist|Lawyer|Nurse|Pilot|Professor|Programmer|Teacher');

  var MANIFEST = [
    { id: 'liner', label: 'Ocean liner, 1934', hint: 'A luxury liner crossing the Atlantic', era: 'classic', vessel: 'the ocean liner',
      fixedEra: 'the 1930s', classes: ['First Class', 'Cabin Class', 'Third Class'], letters: 'ABCDEFGH', nums: [100, 899], fmt: 'L-N',
      loc: ['deck letter', 'cabin number', 'CABIN', 'deck'], ports: ['Southampton', 'Cherbourg', 'Queenstown', 'New York'], portVerb: 'boarded at', portCol: 'BOARDED',
      occupations: OCC_1930, chapters: ['First Class', 'Cabin Class', 'Third Class'], where: 'aboard a transatlantic ocean liner', props: 'a passenger manifest, a brass cabin key and a ship’s bell' },
    { id: 'express', label: 'Night express train, 1928', hint: 'A sleeper train across Europe', era: 'classic', vessel: 'the night express',
      fixedEra: 'the late 1920s', classes: ['First Class', 'Second Class', 'Third Class'], letters: 'ABCDEFGHJK', nums: [1, 48], fmt: 'L-N',
      loc: ['coach letter', 'berth number', 'BERTH', 'coach'], ports: ['Paris', 'Lausanne', 'Milan', 'Venice', 'Vienna'], portVerb: 'boarded at', portCol: 'BOARDED',
      occupations: OCC_1930, where: 'aboard a luxury sleeper train crossing Europe', props: 'a passenger list, a brass compartment key and a steam locomotive at night' },
    { id: 'riverboat', label: 'Mississippi riverboat, 1890s', hint: 'A paddle steamer, card games, the river at night', era: 'classic', vessel: 'the riverboat',
      fixedEra: 'the 1890s', classes: ['Saloon', 'Cabin', 'Deck'], letters: 'ABCDEF', nums: [1, 160], fmt: 'L-N',
      loc: ['deck letter', 'cabin number', 'CABIN', 'deck'], ports: ['St. Louis', 'Memphis', 'Natchez', 'Baton Rouge', 'New Orleans'], portVerb: 'boarded at', portCol: 'BOARDED',
      occupations: OCC_1930, where: 'aboard a Mississippi paddle steamer', props: 'a passenger ledger, playing cards and a paddle wheel' },
    { id: 'cruise', label: 'Modern cruise ship', hint: 'Ten decks, a casino, open sea', era: 'modern', vessel: 'the cruise ship',
      fixedEra: 'the present day', classes: ['Suite', 'Balcony', 'Ocean View', 'Inside'], letters: 'ABCDEFGHJK', nums: [100, 899], fmt: 'L-N',
      loc: ['deck letter', 'cabin number', 'CABIN', 'deck'], ports: ['Miami', 'Nassau', 'Cozumel', 'Roatan', 'Key West'], portVerb: 'boarded at', portCol: 'BOARDED',
      occupations: OCC_NOW, where: 'aboard a modern cruise ship', props: 'a cruise key card, a passenger list and a ship at sea at night' },
    { id: 'airliner', label: 'Overnight flight', hint: 'Thirty thousand feet, no way off', era: 'modern', vessel: 'the flight',
      fixedEra: 'the present day', classes: ['First', 'Business', 'Premium', 'Economy'], letters: 'ABCDEF', nums: [1, 42], fmt: 'NL',
      loc: ['seat letter', 'seat row', 'SEAT', 'seat'], ports: ['London', 'Dubai', 'Singapore', 'Sydney'], portVerb: 'checked in at', portCol: 'CHECKED IN',
      occupations: OCC_NOW, where: 'aboard an overnight long-haul flight', props: 'a boarding pass, a passenger list and a dark airplane cabin' }
  ];
  MANIFEST.push(custom(MANIFEST[0], { vessel: 'the ship', fixedEra: null, where: '' }));

  T.register(T.fromFields({
    id: 'manifest', label: 'Passenger manifest', short: 'Passenger manifest', icon: 'ship', mode: 'named', layout: 'table',
    blurb: 'Everyone on board: name, occupation, class and cabin. Like “The Killer Is Still On Board”.',
    example: '3,000 passengers',
    unit: ['passenger', 'passengers'],
    archive: { title: 'The Passenger Manifest', name: 'passenger manifest', kicker: 'Everyone on board' },
    counts: [500, 1000, 2000, 3000, 5000, 7500], defaultCount: 3000,
    settings: MANIFEST,
    keyField: 'ticket', keyLabel: 'ticket number',
    chapterLabel: ['Chapters by class', 'One list by surname'],
    chapterHint: 'Each class gets its own chapter, sorted by surname. Class clues then rule out whole chapters at once.',
    fields: function (s) {
      var cls = s.classes;
      return [
        { key: 'ticket', kind: 'code', len: 5, noun: 'ticket number', col: 'TICKET', unique: true },
        { key: 'name', kind: 'name', noun: 'name', col: 'NAME', unique: true },
        { key: 'occ', kind: 'enum', labels: s.occupations, words: true, noun: 'occupation', col: 'OCCUPATION' },
        { key: 'cls', kind: 'enum', labels: cls, noun: 'travel class', col: 'CLASS', weights: cls.map(function (c, i) { return 18 + i * 14; }),
          say: { is: 'The killer travelled in ' + (s.id === 'riverboat' ? 'the {v} class.' : '{v}.'), not: 'The killer did not travel in ' + (s.id === 'riverboat' ? 'the {v} class.' : '{v}.'),
            neither: 'The killer travelled in neither {a} nor {b}.', cond: 'the killer travelled in ' + (s.id === 'riverboat' ? 'the {v} class' : '{v}') } },
        { key: 'deck', kind: 'letter', letters: s.letters, noun: s.loc[0], col: s.loc[2] },
        { key: 'num', kind: 'int', min: s.nums[0], max: s.nums[1], noun: s.loc[1], col: s.loc[2] },
        { key: 'port', kind: 'enum', labels: s.ports, noun: 'place of boarding', col: s.portCol,
          say: { is: 'The killer ' + s.portVerb + ' {v}.', not: 'The killer did not ' + s.portVerb.replace('boarded', 'board').replace('checked', 'check') + ' {v}.',
            neither: 'The killer ' + s.portVerb + ' neither {a} nor {b}.', cond: 'the killer ' + s.portVerb + ' {v}' } }
      ];
    },
    columns: function (s, fs) {
      return [
        { key: 'ticket', head: 'TICKET', align: 'left', get: function (r) { return r.ticket; } },
        { key: 'name', head: 'NAME', align: 'left', get: function (r) { return r.first + ' ' + r.last; } },
        { key: 'occ', head: 'OCCUPATION', align: 'left', get: function (r) { return fs.occ.labels[r.occ]; } },
        { key: 'cls', head: 'CLASS', align: 'left', get: function (r) { return fs.cls.labels[r.cls]; } },
        { key: 'loc', head: s.loc[2], align: 'left', get: function (r) { return s.fmt === 'NL' ? r.num + r.deck : r.deck + '-' + r.num; } },
        { key: 'port', head: s.portCol, align: 'left', get: function (r) { return fs.port.labels[r.port]; } }
      ];
    },
    sort: byName,
    recordLabel: function (r) { return r.first + ' ' + r.last; },
    rangeText: function (a, b) { return a.last + ' to ' + b.last; },
    chapters: function (s) { return { mode: 'enum', field: 'cls', names: s.classes, note: 'Every passenger in this class, sorted by surname.' }; },
    reading: function (cs) {
      var s = cs.setting, fs = cs.fields, ex = s.fmt === 'NL' ? '14C' : (s.letters[2] + '-' + Math.round((s.nums[0] + s.nums[1]) / 3));
      return [
        'Ticket: the passenger’s five-digit ticket number.',
        'Name: first name, then surname. ' + (cs.chaptered ? 'Each class is its own chapter, sorted by surname.' : 'The manifest is sorted by surname.'),
        'Occupation: the job on the passenger’s papers: ' + list(fs.occ.labels, 'or') + '.',
        'Class: ' + list(s.classes, 'or') + '.',
        cap(s.loc[2].toLowerCase()) + ': the ' + s.loc[0] + ' (' + s.letters[0] + ' to ' + s.letters[s.letters.length - 1] + ') and the ' + s.loc[1] + ' (' + s.nums[0] + ' to ' + s.nums[1] + '). ' +
          (s.fmt === 'NL' ? 'In 14C, 14 is the row and C the seat letter.' : 'In ' + ex + ', ' + ex.split('-')[0] + ' is the ' + s.loc[3] + ' and ' + ex.split('-')[1] + ' the ' + s.loc[1] + '.'),
        cap(s.portCol.toLowerCase()) + ': where the passenger came aboard: ' + list(s.ports, 'or') + '.'
      ];
    },
    clueReading: clueReading,
    premise: function (cs) { return fmtN(cs.records.length) + ' passengers were ' + (cs.setting.where || 'on board') + ' when the murder happened. The book prints the complete passenger manifest.'; },
    recordLine: function (cs) {
      var s = cs.setting;
      return 'Each passenger record shows: a five-digit ticket number, the full name, occupation, travel class (' + s.classes.join(', ') + '), ' + s.loc[2].toLowerCase() + ' (' + s.loc[0] + ' and ' + s.loc[1] + ') and where they came aboard (' + s.ports.join(', ') + ').';
    },
    coverBack: 'EVERY PASSENGER IS A SUSPECT',
    twists: ['the killer travelled under a borrowed occupation', 'the killer swapped cabins with a stranger on the second night', 'the killer boarded at the last stop to build an alibi',
      'the victim had recognized the killer at dinner', 'the killer and the victim had once been close friends', 'the killer was thought to be confined to their cabin all night']
  }));

  // ---------- the hotel guest register ----------
  var HOTEL = [
    { id: 'seaside', label: 'Seaside grand hotel, summer 1926', hint: 'Jazz bands, the pier, a summer season', era: 'classic', fixedEra: 'the summer of 1926',
      start: [1926, 7, 1], days: 21, rooms: [6, 24], nights: 9, rates: ['$4', '$6', '$9', '$14'], paid: ['Cash', 'Cheque', 'Account', 'Banknote'],
      chapters: ['The First Arrivals', 'Bunting on the Pier', 'The Midsummer Ball', 'High Season', 'The Last Weekend'], where: 'at a grand seaside hotel', hotel: 'the Grand Hotel',
      props: 'a leather guest register, a brass room key and a seaside pier at night' },
    { id: 'winter', label: 'Grand hotel winter assembly, 1931', hint: 'Masked balls, snow, a locked records office', era: 'classic', fixedEra: 'the winter of 1931',
      start: [1931, 12, 18], days: 12, rooms: [8, 30], nights: 8, rates: ['$5', '$8', '$12', '$20'], paid: ['Cash', 'Cheque', 'Account', 'Banknote'],
      chapters: ['The Assembly Opens', 'Snow on the Steps', 'The Masked Ball', 'The Long Nights', 'The Final Night'], where: 'at a grand city hotel during its winter assembly', hotel: 'the Grand Hotel',
      props: 'a guest register, a hotel room key with a brass tag and a masked ball' },
    { id: 'ski', label: 'Alpine ski lodge', hint: 'Snowed in, one road down, no signal', era: 'modern', fixedEra: 'the present day',
      start: [2026, 2, 6], days: 14, rooms: [4, 18], nights: 7, rates: ['$180', '$260', '$340', '$520'], paid: ['Card', 'Cash', 'Points', 'Invoice'],
      chapters: ['First Tracks', 'Powder Days', 'The Storm', 'Snowed In', 'The Thaw'], where: 'at a remote alpine ski lodge', hotel: 'the lodge',
      props: 'a ski lodge guest book, a room key card and a snowy mountain at night' },
    { id: 'desert', label: 'Desert spa resort', hint: 'Palm trees, pools, a heatwave', era: 'modern', fixedEra: 'the present day',
      start: [2026, 4, 3], days: 10, rooms: [5, 22], nights: 6, rates: ['$220', '$310', '$450', '$780'], paid: ['Card', 'Cash', 'Points', 'Invoice'],
      chapters: ['Check-In', 'The Heatwave', 'The Gala Dinner', 'The Last Days'], where: 'at a luxury desert spa resort', hotel: 'the resort',
      props: 'a resort guest register, a key card and a swimming pool at night' },
    { id: 'manor', label: 'Victorian inn on the moors, 1890s', hint: 'Fog, candlelight, a lonely road', era: 'classic', fixedEra: 'the 1890s',
      start: [1893, 10, 2], days: 18, rooms: [3, 16], nights: 6, rates: ['1s', '2s', '3s', '5s'], paid: ['Coin', 'Note', 'Account', 'Credit'],
      chapters: ['Fog on the Moor', 'The Hunt Week', 'The Storm', 'The Long Night', 'The Last Coach'], where: 'at a lonely coaching inn on the moors', hotel: 'the inn',
      props: 'an old inn register, an iron key and a lantern on the moors' }
  ];
  HOTEL.push(custom(HOTEL[0], { where: '', fixedEra: null }));

  T.register(T.fromFields({
    id: 'hotel', label: 'Hotel guest register', short: 'Guest register', icon: 'key', mode: 'named', layout: 'table',
    blurb: 'Every guest who signed in: arrival date, room, nights, rate. Like “The Killer Never Checked In”.',
    example: '3,000 guests',
    unit: ['guest', 'guests'],
    archive: { title: 'The Guest Register', name: 'guest register', kicker: 'Everyone who signed in' },
    counts: [500, 1000, 2000, 3000, 5000], defaultCount: 3000,
    settings: HOTEL,
    keyField: 'entry', keyLabel: 'entry number',
    chapterLabel: ['Chapters by arrival date', 'One register by entry'],
    chapterHint: 'The register is told day by day, in the order guests arrived. Date clues then rule out whole chapters at once.',
    fields: function (s) {
      return [
        { key: 'entry', kind: 'code', len: 4, noun: 'entry number', col: 'ENTRY', seq: 1001, fixed: true },
        { key: 'name', kind: 'name', noun: 'name', col: 'GUEST', unique: true },
        dateField('day', 'arrival date', 'ARRIVED', s.start, s.days, 'The killer arrived', 'The killer did not arrive'),
        { key: 'room', kind: 'int', min: 101, max: s.rooms[0] * 100 + s.rooms[1], rooms: s.rooms, noun: 'room number', col: 'ROOM' },
        { key: 'nights', kind: 'int', min: 1, max: s.nights, noun: 'nights', np: 'the number of nights the killer stayed', col: 'NIGHTS', more: 'more', less: 'fewer' },
        { key: 'rate', kind: 'ord', labels: s.rates, noun: 'room rate', col: 'RATE', more: 'more', less: 'less', weights: [36, 30, 22, 12] },
        { key: 'paid', kind: 'enum', labels: s.paid, words: true, noun: 'payment method', col: 'PAID BY',
          say: { is: 'The killer paid by “{v}”.', not: 'The killer did not pay by “{v}”.', neither: 'The killer paid by neither “{a}” nor “{b}”.', cond: 'the killer paid by “{v}”' } }
      ];
    },
    columns: function (s, fs) {
      return [
        { key: 'entry', head: 'ENTRY', align: 'left', get: function (r) { return String(r.entry); } },
        { key: 'name', head: 'GUEST', align: 'left', get: function (r) { return r.first + ' ' + r.last; } },
        { key: 'day', head: 'ARRIVED', align: 'left', get: function (r) { return fs.day.fmt(r.day); } },
        { key: 'room', head: 'ROOM', align: 'right', get: function (r) { return String(r.room); } },
        { key: 'nights', head: 'NIGHTS', align: 'right', get: function (r) { return String(r.nights); } },
        { key: 'rate', head: 'RATE', align: 'right', get: function (r) { return fs.rate.labels[r.rate]; } },
        { key: 'paid', head: 'PAID BY', align: 'left', get: function (r) { return fs.paid.labels[r.paid]; } }
      ];
    },
    // guests sign in by arrival date; entry numbers follow that order
    sort: function (a, b) { return a.day - b.day || byName(a, b); },
    recordLabel: function (r) { return r.first + ' ' + r.last; },
    rangeText: function (a, b) { return 'Entries ' + a.entry + ' to ' + b.entry; },
    chapters: function (s) { return { mode: 'date', field: 'day', count: s.chapters.length, names: s.chapters, note: 'Every guest who arrived on these days, in the order they signed in.' }; },
    reading: function (cs) {
      var s = cs.setting, fs = cs.fields;
      return [
        'Entry: the line number in the register. Guests are numbered in the order they signed in.',
        'Guest: first name, then surname.',
        'Arrived: the day of the week and the date the guest signed in, from ' + fs.day.long(0) + ' to ' + fs.day.long(s.days - 1) + '.',
        'Room: the floor (the first digit) and the room on that floor. Room 412 is room 12 on floor 4.',
        'Nights: how many nights the guest stayed, from 1 to ' + s.nights + '.',
        'Rate: the price per night: ' + list(s.rates, 'or') + '.',
        'Paid by: ' + list(s.paid, 'or') + '.'
      ];
    },
    clueReading: clueReading,
    premise: function (cs) { return fmtN(cs.records.length) + ' guests signed the register ' + (cs.setting.where || 'at the hotel') + ' during the season of the murder. The book prints the complete guest register.'; },
    recordLine: function (cs) {
      var s = cs.setting;
      return 'Each register entry shows: the entry number, the guest’s full name, the arrival date, the room number, the number of nights, the rate (' + s.rates.join(', ') + ') and how they paid (' + s.paid.join(', ') + ').';
    },
    coverBack: 'EVERY GUEST IS A SUSPECT',
    twists: ['the killer signed in under a false name built from real guests', 'the killer checked out the day before the murder and came back', 'the killer’s room was booked by the victim',
      'the killer bribed the night clerk to change one entry', 'the killer and the victim had once been close friends', 'the killer was thought to have left the hotel early']
  }));

  // ---------- the staff roster ----------
  var STAFF = [
    { id: 'hospital', label: 'City hospital', hint: 'A night shift, a toxicology report', era: 'modern', fixedEra: 'the present day', start: 5 * 60, end: 23 * 60 + 59,
      depts: ['Cardiology', 'Emergency', 'Oncology', 'Pediatrics', 'Radiology', 'Surgery', 'Pharmacy', 'Maternity'],
      roles: ['Doctor', 'Nurse', 'Porter', 'Technician', 'Clerk', 'Cleaner'], floors: 12, where: 'at a busy city hospital', place: 'the hospital',
      props: 'a hospital staff badge, a clipboard and a dark hospital corridor' },
    { id: 'museum', label: 'Museum of antiquities', hint: 'Night galleries, a missing artifact', era: 'modern', fixedEra: 'the present day', start: 6 * 60, end: 22 * 60 + 59,
      depts: ['Antiquities', 'Conservation', 'Security', 'Education', 'Archives', 'Events', 'Retail', 'Facilities'],
      roles: ['Curator', 'Guard', 'Guide', 'Restorer', 'Clerk', 'Cleaner'], floors: 5, where: 'at a grand museum of antiquities', place: 'the museum',
      props: 'a museum staff pass, an ancient vase and a dark gallery' },
    { id: 'casino', label: 'Casino resort staff', hint: 'Neon, a counting room, a vanished chip', era: 'modern', fixedEra: 'the present day', start: 0, end: 23 * 60 + 59,
      depts: ['Gaming', 'Security', 'Cage', 'Kitchen', 'Housekeeping', 'Valet', 'Showroom', 'Surveillance'],
      roles: ['Dealer', 'Guard', 'Cashier', 'Chef', 'Porter', 'Manager'], floors: 30, where: 'at a glittering casino resort', place: 'the casino',
      props: 'a casino staff badge, poker chips and a roulette wheel' },
    { id: 'estate', label: 'Country estate household, 1930s', hint: 'Servants, a will, a locked study', era: 'classic', fixedEra: 'the 1930s', start: 5 * 60, end: 23 * 60 + 59,
      depts: ['Kitchen', 'Stables', 'Gardens', 'Pantry', 'Laundry', 'Garage', 'Nursery', 'Cellar'],
      roles: ['Butler', 'Maid', 'Cook', 'Groom', 'Gardener', 'Footman'], floors: 4, where: 'on a great country estate', place: 'the estate',
      props: 'a servants’ bell board, a pocket watch and a country house at night' },
    { id: 'studio', label: 'Film studio, 1950s', hint: 'Klieg lights, a star found dead on set', era: 'classic', fixedEra: 'the 1950s', start: 5 * 60, end: 23 * 60 + 59,
      depts: ['Lighting', 'Wardrobe', 'Makeup', 'Props', 'Sound', 'Camera', 'Catering', 'Publicity'],
      roles: ['Director', 'Actor', 'Grip', 'Writer', 'Runner', 'Editor'], floors: 6, where: 'at a Hollywood film studio', place: 'the studio',
      props: 'a film clapperboard, a studio pass and a spotlight' }
  ];
  STAFF.push(custom(STAFF[0], { where: '', fixedEra: null }));

  T.register(T.fromFields({
    id: 'staff', label: 'Staff roster', short: 'Staff roster', icon: 'badge', mode: 'named', layout: 'table',
    blurb: 'Everyone on duty: badge, department, role, floor, clock-in time. Like the hospital puzzle “Do No Harm”.',
    example: '4,000 staff',
    unit: ['staff member', 'staff members'],
    archive: { title: 'The Staff Roster', name: 'staff roster', kicker: 'Everyone on duty' },
    counts: [500, 1000, 2000, 4000, 6000, 10000], defaultCount: 4000,
    settings: STAFF,
    keyField: 'badge', keyLabel: 'badge number',
    chapterLabel: ['Chapters by department', 'One list by surname'],
    chapterHint: 'Each department is its own chapter, sorted by surname. Department clues then rule out whole chapters at once.',
    fields: function (s) {
      return [
        { key: 'badge', kind: 'code', len: 5, noun: 'badge number', col: 'BADGE', unique: true },
        { key: 'name', kind: 'name', noun: 'name', col: 'NAME', unique: true },
        { key: 'dept', kind: 'enum', labels: s.depts, words: true, noun: 'department', col: 'DEPARTMENT',
          say: { is: 'The killer works in {v}.', not: 'The killer does not work in {v}.', neither: 'The killer works in neither {a} nor {b}.', cond: 'the killer works in {v}' } },
        { key: 'role', kind: 'enum', labels: s.roles, words: true, noun: 'role', col: 'ROLE',
          say: { is: 'The killer’s role is “{v}”.', not: 'The killer’s role is not “{v}”.', neither: 'The killer’s role is neither “{a}” nor “{b}”.', cond: 'the killer’s role is “{v}”' } },
        { key: 'floor', kind: 'int', min: 1, max: s.floors, noun: 'floor', np: 'the floor the killer works on', col: 'FLOOR' },
        { key: 'clock', kind: 'time', start: s.start, end: s.end, noun: 'clock-in time', np: 'the killer’s clock-in time', col: 'CLOCK-IN',
          verb: 'The killer clocked in', verbNot: 'The killer did not clock in' },
        { key: 'years', kind: 'int', min: 1, max: 38, noun: 'years of service', np: 'the number of years the killer has served', col: 'YEARS', more: 'more', less: 'fewer' }
      ];
    },
    columns: function (s, fs) {
      return [
        { key: 'badge', head: 'BADGE', align: 'left', get: function (r) { return r.badge; } },
        { key: 'name', head: 'NAME', align: 'left', get: function (r) { return r.first + ' ' + r.last; } },
        { key: 'dept', head: 'DEPARTMENT', align: 'left', get: function (r) { return fs.dept.labels[r.dept]; } },
        { key: 'role', head: 'ROLE', align: 'left', get: function (r) { return fs.role.labels[r.role]; } },
        { key: 'floor', head: 'FLOOR', align: 'right', get: function (r) { return String(r.floor); } },
        { key: 'clock', head: 'CLOCK-IN', align: 'right', get: function (r) { return clock(r.clock); } },
        { key: 'years', head: 'YEARS', align: 'right', get: function (r) { return String(r.years); } }
      ];
    },
    sort: byName,
    recordLabel: function (r) { return r.first + ' ' + r.last; },
    rangeText: function (a, b) { return a.last + ' to ' + b.last; },
    chapters: function (s) { return { mode: 'enum', field: 'dept', note: 'Everyone in this department, sorted by surname.' }; },
    reading: function (cs) {
      var s = cs.setting;
      return [
        'Badge: the five-digit staff badge number.',
        'Name: first name, then surname. ' + (cs.chaptered ? 'Each department is its own chapter, sorted by surname.' : 'The roster is sorted by surname.'),
        'Department: ' + list(s.depts, 'or') + '.',
        'Role: ' + list(s.roles, 'or') + '.',
        'Floor: where the staff member works, from 1 to ' + s.floors + '.',
        'Clock-in: the time they arrived for work that day, between ' + clock(s.start) + ' and ' + clock(s.end) + '.',
        'Years: how many years they have worked there.'
      ];
    },
    clueReading: clueReading,
    premise: function (cs) { return fmtN(cs.records.length) + ' people were on the staff ' + (cs.setting.where || 'that day') + ' on the day of the murder. The book prints the complete staff roster.'; },
    recordLine: function (cs) {
      var s = cs.setting;
      return 'Each staff record shows: a five-digit badge number, the full name, the department (' + s.depts.join(', ') + '), the role (' + s.roles.join(', ') + '), the floor, the clock-in time and the years of service.';
    },
    coverBack: 'EVERYONE ON DUTY IS A SUSPECT',
    twists: ['the killer clocked in on a colleague’s badge', 'the killer was supposed to be off duty that day', 'the killer changed departments a week before the murder',
      'the victim had reported the killer the day before', 'the killer and the victim had once been close friends', 'the killer raised the alarm themselves']
  }));

  // ---------- the guest list: names only ----------
  var GUESTLIST = [
    { id: 'gala', label: 'Society gala guest list', hint: 'Black tie, a ballroom, a famous host', era: 'mixed', who: 'guests', where: 'at a glittering society gala',
      props: 'an engraved invitation, a champagne glass and a ballroom', listName: 'guest list' },
    { id: 'concert', label: 'Stadium concert ticket holders', hint: 'A world tour’s final night', era: 'mixed', who: 'ticket holders', where: 'at a sold-out stadium concert',
      props: 'a concert ticket, a microphone and stage lights', listName: 'ticket holder list' },
    { id: 'wedding', label: 'Society wedding', hint: 'A cliffside chapel, a jilted ex', era: 'mixed', who: 'wedding guests', where: 'at a lavish society wedding',
      props: 'a wedding invitation, a champagne flute and a bouquet', listName: 'guest list' },
    { id: 'festival', label: 'Harvest festival visitors', hint: 'Bonfires, a market, a small town', era: 'mixed', who: 'festival visitors', where: 'at a small-town harvest festival',
      props: 'an autumn leaf, a festival ticket and a bonfire', listName: 'visitor list' },
    { id: 'conference', label: 'Conference delegates', hint: 'Lanyards, a keynote, a stolen invention', era: 'mixed', who: 'delegates', where: 'at an international conference',
      props: 'a conference lanyard, a laptop and a lecture hall', listName: 'delegate list' }
  ];
  GUESTLIST.push(custom(GUESTLIST[0], { where: '' }));

  T.register(T.fromFields({
    id: 'guestlist', label: 'Guest list (names only)', short: 'Names list', icon: 'list', mode: 'named', layout: 'grid', exhaustive: true,
    blurb: 'Tens of thousands of names and nothing else: every clue is about the letters. The format of “The Killer Isn’t Alice”.',
    example: '10,000 names',
    unit: ['name', 'names'],
    archive: { title: 'The Guest List', name: 'guest list', kicker: 'Every name on the list' },
    counts: [2000, 5000, 10000, 15000, 20000], defaultCount: 10000,
    settings: GUESTLIST,
    // a name carries less information than a full record, so the lists use fewer, harder clues
    difficulty: {
      easy: { clues: 11, min: 10, max: 12 },
      medium: { clues: 13, min: 11, max: 14 },
      hard: { clues: 14, min: 12, max: 16, tier3: [3, 6] }
    },
    keyField: null, keyLabel: 'place in the list',
    chapterLabel: ['Files by surname', 'One alphabetical list'],
    chapterHint: 'The list is split into files by the first letter of the surname. Surname clues then rule out whole files at once.',
    fields: function () { return [{ key: 'name', kind: 'name', noun: 'name', col: 'NAME', unique: true }]; },
    columns: function () { return [{ key: 'name', head: 'NAME', align: 'left', get: function (r) { return r.first + ' ' + r.last; } }]; },
    cell: function (r) { return r.first + ' ' + r.last; },
    gridOrder: 'columns',
    sort: byName,
    recordLabel: function (r) { return r.first + ' ' + r.last; },
    rangeText: function (a, b) { return a.last + ' to ' + b.last; },
    chapters: function () { return { mode: 'initial', count: 6, note: 'Every name in this file, in alphabetical order by surname.' }; },
    reading: function (cs) {
      return [
        'Every entry is a full name: first name, then surname.',
        'The list is alphabetical by surname' + (cs.chaptered ? ', split into files.' : '.'),
        'Line numbers run down the left of each page, and column numbers along the top, so you can say exactly where a name sits.'
      ];
    },
    clueReading: clueReading,
    premise: function (cs) { return fmtN(cs.records.length) + ' ' + (cs.setting.who || 'guests') + ' were ' + (cs.setting.where || 'there') + ' on the night of the murder. The book prints every one of their names.'; },
    recordLine: function () { return 'The list shows full names only (first name and surname), so every clue is about the letters of the killer’s name.'; },
    coverBack: 'EVERY NAME IS A SUSPECT',
    twists: ['the killer’s name was added to the list at the last minute', 'the killer came as someone’s plus-one', 'the killer had been publicly turned away at the door earlier',
      'the victim had written the killer’s initials in a diary', 'the killer and the victim had once been close friends', 'the killer was thought to have left early']
  }));

  // ---------- phone records ----------
  var CALLS = [
    { id: 'hotel', label: 'Grand hotel phone records', hint: 'Three towers, a blackout, a missing call', era: 'modern', fixedEra: 'the present day', start: 18 * 60, end: 23 * 60 + 59,
      towers: ['North Tower', 'South Tower', 'Harbor Tower', 'Garden Tower', 'Central Tower'], called: ['Taxi', 'Front Desk', 'Room Service', 'Voicemail', 'Restaurant', 'Private Line'],
      chapters: ['Cocktail Hour', 'Dinner', 'The Speeches', 'The Blackout', 'Last Orders', 'Midnight'], where: 'at a grand harbor hotel', props: 'a vintage telephone receiver, a hotel key and a city skyline at night' },
    { id: 'island', label: 'Island festival weekend', hint: 'One ferry, three masts, a storm', era: 'modern', fixedEra: 'the present day', start: 10 * 60, end: 23 * 60 + 59,
      towers: ['Lighthouse Mast', 'Harbor Mast', 'Village Mast', 'Ridge Mast'], called: ['Ferry Office', 'Taxi', 'Pub', 'Voicemail', 'Doctor', 'Private Line'],
      chapters: ['Morning Ferry', 'The Market', 'Afternoon', 'The Storm', 'Bonfire Night', 'Last Calls'], where: 'on a small island during its summer festival', props: 'a phone with a cracked screen, a lighthouse and a ferry' },
    { id: 'campus', label: 'University campus', hint: 'Exams, a secret society, a bell tower', era: 'modern', fixedEra: 'the present day', start: 8 * 60, end: 23 * 60 + 59,
      towers: ['Library Mast', 'Stadium Mast', 'Bell Tower', 'Science Park', 'Halls Mast'], called: ['Campus Police', 'Taxi', 'Pizza', 'Voicemail', 'Library Desk', 'Private Line'],
      chapters: ['First Lecture', 'Midday', 'Afternoon Labs', 'Evening', 'The Party', 'After Midnight'], where: 'at an old university', props: 'a phone, a bell tower and old university books' },
    { id: 'city', label: 'Financial district', hint: 'Glass towers, a trading floor, a fall', era: 'modern', fixedEra: 'the present day', start: 6 * 60, end: 23 * 60 + 59,
      towers: ['Exchange Tower', 'River Tower', 'Station Tower', 'Plaza Tower', 'Bridge Tower'], called: ['Car Service', 'Trading Desk', 'Voicemail', 'Restaurant', 'Front Desk', 'Private Line'],
      chapters: ['Market Open', 'Mid-Morning', 'Lunch', 'Closing Bell', 'Evening', 'Late Night'], where: 'in a city financial district', props: 'a smartphone, glass skyscrapers and a stock ticker' }
  ];
  CALLS.push(custom(CALLS[0], { where: '' }));

  T.register(T.fromFields({
    id: 'calls', label: 'Phone records', short: 'Phone records', icon: 'phone', mode: 'ledger', layout: 'table',
    blurb: 'The last call from every phone that night: time, length, tower, who was called. Like “Caller Unknown”.',
    example: '3,000 calls',
    unit: ['call', 'calls'],
    archive: { title: 'The Call Records', name: 'call records', kicker: 'Every call that night' },
    counts: [1000, 2000, 3000, 5000, 8000], defaultCount: 3000,
    settings: CALLS,
    keyField: 'phone', keyLabel: 'phone ID',
    chapterLabel: ['Chapters hour by hour', 'One log by time'],
    chapterHint: 'The calls are told hour by hour, the way the night unfolded. Time clues then rule out whole chapters at once.',
    ledger: {
      title: 'The Phone Ledger', kicker: 'Whose phone is whose', item: 'phone', items: 'phones', owner: 'owned',
      intro: function () { return 'Every suspect and the phones registered to them. When only one call is left in play, find its phone ID here to learn whose phone made it.'; },
      prompt: 'A Phone Ledger lists the named suspects and the phone IDs registered to each one.'
    },
    fields: function (s) {
      return [
        { key: 'phone', kind: 'code', len: 5, noun: 'phone ID', col: 'PHONE', unique: true },
        { key: 'time', kind: 'time', start: s.start, end: s.end, noun: 'time of the call', np: 'the time of the killer’s call', col: 'TIME',
          verb: 'The killer’s call was made', verbNot: 'The killer’s call was not made' },
        { key: 'len', kind: 'dur', min: 4, max: 1500, noun: 'call length', np: 'the length of the killer’s call', col: 'LENGTH', subj: 'The killer’s call' },
        { key: 'tower', kind: 'enum', labels: s.towers, noun: 'tower', col: 'TOWER',
          say: { is: 'The killer’s call went through the {v}.', not: 'The killer’s call did not go through the {v}.', neither: 'The killer’s call went through neither the {a} nor the {b}.', cond: 'the killer’s call went through the {v}' } },
        { key: 'called', kind: 'enum', labels: s.called, words: true, noun: 'number called', col: 'CALLED',
          say: { is: 'The killer called “{v}”.', not: 'The killer did not call “{v}”.', neither: 'The killer called neither “{a}” nor “{b}”.', cond: 'the killer called “{v}”' } },
        { key: 'bars', kind: 'int', min: 1, max: 5, noun: 'signal strength', np: 'the signal strength of the killer’s call', col: 'SIGNAL', noParity: true, more: 'stronger', less: 'weaker' }
      ];
    },
    columns: function (s, fs) {
      return [
        { key: 'phone', head: 'PHONE', align: 'left', get: function (r) { return r.phone; } },
        { key: 'time', head: 'TIME', align: 'right', get: function (r) { return clock(r.time); } },
        { key: 'len', head: 'LENGTH', align: 'right', get: function (r) { return F.fmtDur(r.len); } },
        { key: 'tower', head: 'TOWER', align: 'left', get: function (r) { return fs.tower.labels[r.tower]; } },
        { key: 'called', head: 'CALLED', align: 'left', get: function (r) { return fs.called.labels[r.called]; } },
        { key: 'bars', head: 'SIGNAL', align: 'right', get: function (r) { return String(r.bars); } }
      ];
    },
    sort: function (a, b) { return a.time - b.time || (a.phone < b.phone ? -1 : 1); },
    recordLabel: function (r) { return 'Phone ' + r.phone; },
    rangeText: function (a, b) { return 'Calls from ' + clock(a.time) + ' to ' + clock(b.time); },
    ledgerLabel: function (r) { return r.phone; },
    chapters: function (s) { return { mode: 'time', field: 'time', count: s.chapters.length, names: s.chapters, note: 'Every call made in these hours, in time order.' }; },
    reading: function (cs) {
      var s = cs.setting, fs = cs.fields;
      return [
        'Phone: the five-digit ID of the phone that made the call. Each phone appears once: this is its last call of the night.',
        'Time: when the call was made, between ' + clock(s.start) + ' and ' + clock(s.end) + '. The records are in time order.',
        'Length: how long the call lasted, in minutes and seconds. 2:05 is two minutes and five seconds.',
        'Tower: the mast that carried the call: ' + list(s.towers, 'or') + '.',
        'Called: who or what the phone called: ' + list(fs.called.labels, 'or') + '.',
        'Signal: the signal strength, from 1 bar (weak) to 5 bars (strong).'
      ];
    },
    clueReading: clueReading,
    premise: function (cs) { return 'On the night of the murder, ' + fmtN(cs.records.length) + ' phones made a call ' + (cs.setting.where || 'nearby') + '. The book prints the last call of every one of them, from the phone company’s records.'; },
    recordLine: function (cs) {
      var s = cs.setting;
      return 'Each call record shows: a five-digit phone ID, the time, the length (minutes and seconds), the tower (' + s.towers.join(', ') + '), who was called (' + s.called.join(', ') + ') and the signal strength (1 to 5 bars).';
    },
    coverBack: 'EVERY CALL IS EVIDENCE',
    twists: ['the killer made the call from a phone registered to someone else', 'the killer’s call was to the victim’s own voicemail', 'the killer staged a call to build an alibi',
      'the victim had recognized the killer’s number', 'the killer and the victim had once been close friends', 'the killer was thought to have lost their phone that afternoon']
  }));

  // ---------- coordinates ----------
  function city(name, lat, lon) { return { name: name, lat: Math.round(lat * 100), lon: Math.round(lon * 100) }; }
  var ATLAS = {
    europe: [city('London', 51.51, -0.13), city('Paris', 48.86, 2.35), city('Berlin', 52.52, 13.40), city('Madrid', 40.42, -3.70), city('Rome', 41.90, 12.50),
      city('Vienna', 48.21, 16.37), city('Prague', 50.08, 14.44), city('Amsterdam', 52.37, 4.90), city('Brussels', 50.85, 4.35), city('Lisbon', 38.72, -9.14),
      city('Dublin', 53.35, -6.26), city('Edinburgh', 55.95, -3.19), city('Oslo', 59.91, 10.75), city('Stockholm', 59.33, 18.07), city('Copenhagen', 55.68, 12.57),
      city('Helsinki', 60.17, 24.94), city('Warsaw', 52.23, 21.01), city('Budapest', 47.50, 19.04), city('Athens', 37.98, 23.73), city('Istanbul', 41.01, 28.98),
      city('Zurich', 47.38, 8.54), city('Geneva', 46.20, 6.14), city('Munich', 48.14, 11.58), city('Milan', 45.46, 9.19), city('Venice', 45.44, 12.32),
      city('Barcelona', 41.39, 2.17), city('Marseille', 43.30, 5.37), city('Belgrade', 44.79, 20.45), city('Bucharest', 44.43, 26.10), city('Krakow', 50.06, 19.94)],
    americas: [city('New York', 40.71, -74.01), city('Boston', 42.36, -71.06), city('Washington', 38.91, -77.04), city('Chicago', 41.88, -87.63), city('Toronto', 43.65, -79.38),
      city('Montreal', 45.50, -73.57), city('Miami', 25.76, -80.19), city('New Orleans', 29.95, -90.07), city('Houston', 29.76, -95.37), city('Dallas', 32.78, -96.80),
      city('Denver', 39.74, -104.99), city('Phoenix', 33.45, -112.07), city('Los Angeles', 34.05, -118.24), city('San Francisco', 37.77, -122.42), city('Seattle', 47.61, -122.33),
      city('Vancouver', 49.28, -123.12), city('Mexico City', 19.43, -99.13), city('Havana', 23.11, -82.37), city('Atlanta', 33.75, -84.39), city('Nashville', 36.16, -86.78),
      city('Las Vegas', 36.17, -115.14), city('Salt Lake City', 40.76, -111.89), city('Minneapolis', 44.98, -93.27), city('St. Louis', 38.63, -90.20), city('Philadelphia', 39.95, -75.17)],
    med: [city('Gibraltar', 36.14, -5.35), city('Malaga', 36.72, -4.42), city('Valencia', 39.47, -0.38), city('Palma', 39.57, 2.65), city('Barcelona', 41.39, 2.17),
      city('Marseille', 43.30, 5.37), city('Nice', 43.70, 7.27), city('Monaco', 43.74, 7.42), city('Genoa', 44.41, 8.93), city('Rome', 41.90, 12.50),
      city('Naples', 40.85, 14.27), city('Palermo', 38.12, 13.36), city('Valletta', 35.90, 14.51), city('Tunis', 36.81, 10.18), city('Algiers', 36.75, 3.06),
      city('Dubrovnik', 42.65, 18.09), city('Split', 43.51, 16.44), city('Corfu', 39.62, 19.92), city('Athens', 37.98, 23.73), city('Heraklion', 35.34, 25.13),
      city('Rhodes', 36.43, 28.22), city('Izmir', 38.42, 27.13), city('Istanbul', 41.01, 28.98), city('Nicosia', 35.19, 33.38), city('Beirut', 33.89, 35.50),
      city('Alexandria', 31.20, 29.92), city('Cairo', 30.04, 31.24), city('Tripoli', 32.89, 13.19)],
    asia: [city('Tokyo', 35.68, 139.69), city('Osaka', 34.69, 135.50), city('Seoul', 37.57, 126.98), city('Beijing', 39.90, 116.41), city('Shanghai', 31.23, 121.47),
      city('Hong Kong', 22.32, 114.17), city('Taipei', 25.03, 121.57), city('Manila', 14.60, 120.98), city('Hanoi', 21.03, 105.85), city('Bangkok', 13.76, 100.50),
      city('Singapore', 1.35, 103.82), city('Kuala Lumpur', 3.14, 101.69), city('Jakarta', -6.21, 106.85), city('Denpasar', -8.65, 115.22), city('Ho Chi Minh City', 10.82, 106.63),
      city('Sydney', -33.87, 151.21), city('Melbourne', -37.81, 144.96), city('Brisbane', -27.47, 153.03), city('Perth', -31.95, 115.86), city('Darwin', -12.46, 130.84),
      city('Port Moresby', -9.44, 147.18), city('Cebu', 10.32, 123.89), city('Phnom Penh', 11.56, 104.93), city('Yangon', 16.87, 96.20), city('Busan', 35.18, 129.08)],
    world: [city('London', 51.51, -0.13), city('Paris', 48.86, 2.35), city('New York', 40.71, -74.01), city('Tokyo', 35.68, 139.69), city('Sydney', -33.87, 151.21),
      city('Cairo', 30.04, 31.24), city('Rio de Janeiro', -22.91, -43.17), city('Buenos Aires', -34.60, -58.38), city('Lima', -12.05, -77.04), city('Cape Town', -33.92, 18.42),
      city('Nairobi', -1.29, 36.82), city('Lagos', 6.52, 3.38), city('Mumbai', 19.08, 72.88), city('Delhi', 28.61, 77.21), city('Dubai', 25.20, 55.27),
      city('Moscow', 55.76, 37.62), city('Singapore', 1.35, 103.82), city('Hong Kong', 22.32, 114.17), city('Los Angeles', 34.05, -118.24), city('Mexico City', 19.43, -99.13),
      city('Toronto', 43.65, -79.38), city('Reykjavik', 64.15, -21.94), city('Istanbul', 41.01, 28.98), city('Bangkok', 13.76, 100.50), city('Beijing', 39.90, 116.41),
      city('Anchorage', 61.22, -149.90), city('Honolulu', 21.31, -157.86), city('Santiago', -33.45, -70.67), city('Bogota', 4.71, -74.07), city('Casablanca', 33.57, -7.59)]
  };
  var COORDS = [
    { id: 'europe', label: 'A trail across Europe', hint: 'Night trains, safe houses, a stolen painting', geo: { local: 0.9, lat: [3600, 6000], lon: [-900, 3000] }, atlas: ATLAS.europe,
      fixedEra: 'the present day', where: 'across Europe', props: 'a folded map of Europe, a compass and pins on a map' },
    { id: 'americas', label: 'A road trip across America', hint: 'Motels, highways, a getaway car', geo: { local: 0.9, lat: [2500, 5000], lon: [-12300, -7000] }, atlas: ATLAS.americas,
      fixedEra: 'the present day', where: 'across North America', props: 'a road map of America, car keys and a motel sign' },
    { id: 'med', label: 'A Mediterranean yacht chase', hint: 'Harbors, islands, a vanished yacht', geo: { local: 0.9, lat: [3000, 4600], lon: [-600, 3600] }, atlas: ATLAS.med,
      fixedEra: 'the present day', where: 'around the Mediterranean', props: 'a nautical chart, a compass and a yacht at night' },
    { id: 'asia', label: 'Asia and the Pacific', hint: 'Ports, night markets, a smuggling ring', geo: { local: 0.9, lat: [-3500, 4000], lon: [9500, 15500] }, atlas: ATLAS.asia,
      fixedEra: 'the present day', where: 'across Asia and the Pacific', props: 'a map of the Pacific, a compass and a cargo ship' },
    { id: 'world', label: 'Around the world', hint: 'A global network, one hideout', geo: { local: 0, lat: [0, 0], lon: [0, 0] }, atlas: ATLAS.world,
      fixedEra: 'the present day', where: 'all around the world', props: 'a globe, a compass and map pins' }
  ];
  COORDS.push(custom(COORDS[0], { where: '' }));

  T.register(T.fromFields({
    id: 'coords', label: 'Coordinates archive', short: 'Coordinates', icon: 'pin', mode: 'ledger', layout: 'grid',
    blurb: 'Thousands of map coordinates and an Atlas of real cities. Like “The Lottery Killer Volume 3”.',
    example: '8,000 coordinates',
    unit: ['coordinate', 'coordinates'],
    archive: { title: 'The Coordinate Archive', name: 'coordinate archive', kicker: 'Every place on record' },
    target: { who: 'the hideout', poss: 'the hideout’s' }, answer: 'the hideout',
    counts: [3000, 5000, 8000, 10000, 15000], defaultCount: 8000,
    settings: COORDS,
    // two numbers per record: fewer clues than a full register, as in the coordinate books on Amazon
    difficulty: {
      easy: { clues: 10, min: 9, max: 12 },
      medium: { clues: 12, min: 10, max: 14 },
      hard: { clues: 14, min: 12, max: 16, tier3: [2, 5] }
    },
    keyField: null, keyLabel: 'place in the archive',
    chapterLabel: null,
    ledger: {
      title: 'The Movement Ledger', kicker: 'Who was where', item: 'coordinate', items: 'coordinates', owner: 'was logged at',
      intro: function () { return 'Every suspect and the places their car, card or phone was logged. When only one coordinate is left in play, find it here to learn who was there.'; },
      prompt: 'A Movement Ledger lists the named suspects and the coordinates where each one was logged.'
    },
    fields: function () {
      return [
        { key: 'lat', kind: 'lat', noun: 'latitude', col: 'LATITUDE', unique: true },
        { key: 'lon', kind: 'lon', noun: 'longitude', col: 'LONGITUDE' }
      ];
    },
    columns: function () { return [{ key: 'coord', head: 'COORDINATE', align: 'left', get: function (r) { return F.fmtLat(r.lat) + ', ' + F.fmtLon(r.lon); } }]; },
    cell: function (r) { return F.fmtLat(r.lat) + ', ' + F.fmtLon(r.lon); },
    // the archive keeps the order the records were seized in
    sort: function () { return 0; },
    recordLabel: function (r) { return F.fmtLat(r.lat) + ', ' + F.fmtLon(r.lon); },
    chapters: null,
    reading: function (cs) {
      return [
        'Every entry is one coordinate: the latitude (N or S), then the longitude (E or W), to two decimal places.',
        'Read the archive like a book: left to right along each line, then down the page.',
        'Line numbers run down the left of each page, and column numbers along the top, so you can say exactly where a coordinate sits.',
        'The Atlas lists real cities with their coordinates. Some clues compare the hideout with an Atlas city.'
      ];
    },
    clueReading: clueReading,
    premise: function (cs) { return 'Police seized an archive of ' + fmtN(cs.records.length) + ' map coordinates logged ' + (cs.setting.where || '') + ' by the network behind the murder. One of them is the hideout where the killer went to ground.'; },
    recordLine: function () { return 'Each record is one coordinate: latitude and longitude to two decimal places (for example 44.80°N, 20.47°E). An Atlas of real cities is printed for reference.'; },
    coverBack: 'EVERY COORDINATE IS A LEAD',
    twists: ['the hideout was hidden in plain sight, near the victim’s home', 'the killer logged false coordinates to lay a trail', 'the killer had used the hideout once before, years ago',
      'the victim had found the hideout and written its coordinate down', 'the killer and the victim had once been close friends', 'the killer was thought to have left the country']
  }));

  // ---------- visitor log ----------
  var VISITORS = [
    { id: 'museum', label: 'Museum visitor log', hint: 'Six wings, a curator dead after hours', start: 9 * 60, end: 17 * 60 + 59,
      wings: ['Egyptian', 'Greek', 'Medieval', 'Renaissance', 'Modern', 'Nature'], wingNoun: 'Wing', doors: ['North', 'South', 'East', 'River'],
      tickets: ['Adult', 'Student', 'Senior', 'Member', 'Family'], where: 'at a great city museum', place: 'the museum',
      chapters: null, props: 'a museum ticket, a marble statue and a magnifying glass' },
    { id: 'park', label: 'Theme park visitors', hint: 'Roller coasters, a parade, a body in the haunted house', start: 9 * 60, end: 22 * 60 + 59,
      wings: ['Frontier', 'Pirate Cove', 'Space Zone', 'Fairy Woods', 'Main Street', 'Haunted Hill'], wingNoun: 'land', doors: ['Main', 'East', 'West', 'Hotel'],
      tickets: ['Day Pass', 'Fast Pass', 'Season', 'Child', 'VIP'], where: 'at a busy theme park', place: 'the park',
      props: 'a theme park ticket, a roller coaster and fireworks' },
    { id: 'zoo', label: 'City zoo visitors', hint: 'Feeding time, a keeper found dead', start: 9 * 60, end: 18 * 60 + 59,
      wings: ['Big Cats', 'Reptiles', 'Aquarium', 'Birds', 'Primates', 'Savanna'], wingNoun: 'house', doors: ['Main', 'North', 'Lake', 'Car Park'],
      tickets: ['Adult', 'Child', 'Senior', 'Member', 'Family'], where: 'at a city zoo', place: 'the zoo',
      props: 'a zoo ticket, a tiger’s eye and a magnifying glass' },
    { id: 'festival', label: 'Film festival screenings', hint: 'Red carpet, a premiere, poison in the champagne', start: 10 * 60, end: 23 * 60 + 59,
      wings: ['Palace', 'Lumiere', 'Riviera', 'Grand', 'Studio', 'Garden'], wingNoun: 'screen', doors: ['Red Carpet', 'Side', 'Press', 'Beach'],
      tickets: ['Press', 'Industry', 'Public', 'Jury', 'Guest'], where: 'at a glamorous film festival', place: 'the festival',
      props: 'a film reel, a red carpet and a festival badge' }
  ];
  VISITORS.push(custom(VISITORS[0], { where: '' }));

  T.register(T.fromFields({
    id: 'visitors', label: 'Visitor log', short: 'Visitor log', icon: 'ticket', mode: 'ledger', layout: 'table',
    blurb: 'Every scan at the gates: visitor number, entry time, wing, entrance, ticket type, group. Like “The Killer Was in the Museum”.',
    example: '4,000 visitors',
    unit: ['visitor', 'visitors'], answer: 'the killer’s pass',
    archive: { title: 'The Visitor Log', name: 'visitor log', kicker: 'Every scan at the gates' },
    counts: [1000, 2000, 4000, 6000, 8000], defaultCount: 4000,
    settings: VISITORS,
    keyField: 'code', keyLabel: 'visitor number',
    chapterLabel: ['Chapters hour by hour', 'One log by time'],
    chapterHint: 'The log is told hour by hour, the way the day unfolded. Time clues then rule out whole chapters at once.',
    ledger: {
      title: 'The Visitor Ledger', kicker: 'Who held which pass', item: 'visitor number', items: 'visitor numbers', owner: 'held',
      intro: function () { return 'Every suspect and the passes bought in their name. When only one visitor is left in play, find the visitor number here to learn who it was.'; },
      prompt: 'A Visitor Ledger lists the named suspects and the visitor numbers of the passes bought in their name.'
    },
    fields: function (s) {
      var wn = s.wingNoun;
      return [
        { key: 'code', kind: 'code', len: 5, noun: 'visitor number', col: 'VISITOR', unique: true, prefix: 'V-' },
        { key: 'time', kind: 'time', start: s.start, end: s.end, noun: 'entry time', np: 'the killer’s entry time', col: 'ENTERED',
          verb: 'The killer came in', verbNot: 'The killer did not come in' },
        { key: 'wing', kind: 'enum', labels: s.wings, words: true, noun: wn.toLowerCase(), col: wn.toUpperCase(),
          say: { is: 'The killer’s pass was scanned in the {v} ' + wn + '.', not: 'The killer’s pass was not scanned in the {v} ' + wn + '.',
            neither: 'The killer’s pass was scanned in neither the {a} nor the {b} ' + wn + '.', cond: 'the killer’s pass was scanned in the {v} ' + wn } },
        { key: 'door', kind: 'enum', labels: s.doors, noun: 'entrance', col: 'GATE',
          say: { is: 'The killer came through the {v} gate.', not: 'The killer did not come through the {v} gate.', neither: 'The killer came through neither the {a} gate nor the {b} gate.', cond: 'the killer came through the {v} gate' } },
        { key: 'ticket', kind: 'enum', labels: s.tickets, words: true, noun: 'ticket type', col: 'TICKET' },
        { key: 'group', kind: 'int', min: 1, max: 8, noun: 'group size', np: 'the size of the killer’s group', col: 'GROUP' }
      ];
    },
    columns: function (s, fs) {
      return [
        { key: 'code', head: 'VISITOR', align: 'left', get: function (r) { return 'V-' + r.code; } },
        { key: 'time', head: 'ENTERED', align: 'right', get: function (r) { return clock(r.time); } },
        { key: 'wing', head: s.wingNoun.toUpperCase(), align: 'left', get: function (r) { return fs.wing.labels[r.wing]; } },
        { key: 'door', head: 'GATE', align: 'left', get: function (r) { return fs.door.labels[r.door]; } },
        { key: 'ticket', head: 'TICKET', align: 'left', get: function (r) { return fs.ticket.labels[r.ticket]; } },
        { key: 'group', head: 'GROUP', align: 'right', get: function (r) { return String(r.group); } }
      ];
    },
    sort: function (a, b) { return a.time - b.time || (a.code < b.code ? -1 : 1); },
    recordLabel: function (r) { return 'Visitor V-' + r.code; },
    rangeText: function (a, b) { return 'Entries from ' + clock(a.time) + ' to ' + clock(b.time); },
    ledgerLabel: function (r) { return 'V-' + r.code; },
    chapters: function (s) { return { mode: 'time', field: 'time', count: 6, note: 'Every visitor who came in during these hours, in time order.' }; },
    reading: function (cs) {
      var s = cs.setting;
      return [
        'Visitor: the number printed on the pass, V- and five digits. Clues about the visitor number use the five digits only.',
        'Entered: when the pass was scanned at the gate, between ' + clock(s.start) + ' and ' + clock(s.end) + '. The log is in time order.',
        s.wingNoun.charAt(0).toUpperCase() + s.wingNoun.slice(1) + ': where the pass was scanned next: ' + list(s.wings, 'or') + '.',
        'Gate: the entrance used: ' + list(s.doors, 'or') + '.',
        'Ticket: ' + list(s.tickets, 'or') + '.',
        'Group: how many people came in on the pass, from 1 to 8.'
      ];
    },
    clueReading: clueReading,
    premise: function (cs) { return fmtN(cs.records.length) + ' visitors passed through the gates ' + (cs.setting.where || '') + ' on the day of the murder. The book prints the complete visitor log.'; },
    recordLine: function (cs) {
      var s = cs.setting;
      return 'Each visitor record shows: the visitor number (V- and five digits), the entry time, the ' + s.wingNoun.toLowerCase() + ' (' + s.wings.join(', ') + '), the gate (' + s.doors.join(', ') + '), the ticket type (' + s.tickets.join(', ') + ') and the group size (1 to 8).';
    },
    coverBack: 'EVERY VISITOR IS A SUSPECT',
    twists: ['the killer bought the pass under a false name', 'the killer came in with a group of strangers', 'the killer entered hours before the murder to build an alibi',
      'the victim had recognized the killer in the crowd', 'the killer and the victim had once been close friends', 'the killer was thought to have left early']
  }));

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  LK.ATLAS = ATLAS;
})(typeof window !== 'undefined' ? window : globalThis);
