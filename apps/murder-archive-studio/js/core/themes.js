/*
 * Venues and story sparks.
 * A venue decides what the ticket register looks like (the place column, payment methods,
 * prices and the hours the draw was open). Story sparks are picked from the project seed and
 * handed to the AI, so two people who choose the same venue still get different stories.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};

  // Times are minutes after midnight. A draw never runs past midnight, so "later" is never ambiguous.
  var VENUES = [
    {
      id: 'gala', label: 'Charity gala raffle', hint: 'Black tie, champagne, a manor house',
      event: 'a charity gala', draw: 'the gala raffle', place: 'Table', placeShort: 'TABLE', places: [40, 72],
      methods: ['Cash', 'Card', 'Check', 'Voucher'], amounts: [10, 20, 50, 100], start: 18 * 60, end: 23 * 60 + 59
    },
    {
      id: 'fair', label: 'County fair prize draw', hint: 'Livestock, pie contests, a Ferris wheel',
      event: 'the county fair', draw: 'the fair prize draw', place: 'Booth', placeShort: 'BOOTH', places: [30, 60],
      methods: ['Cash', 'Card', 'Phone', 'Token'], amounts: [2, 5, 10, 20], start: 10 * 60, end: 21 * 60 + 59
    },
    {
      id: 'cruise', label: 'Cruise ship jackpot night', hint: 'A luxury liner, a ballroom, open sea',
      event: 'a cruise ship jackpot night', draw: 'the jackpot draw', place: 'Lounge seat', placeShort: 'SEAT', places: [40, 80],
      methods: ['Cash', 'Card', 'Cabin', 'Chips'], amounts: [5, 10, 25, 50], start: 17 * 60, end: 23 * 60 + 59
    },
    {
      id: 'casino', label: 'Casino lottery evening', hint: 'Neon, roulette wheels, high rollers',
      event: 'a casino lottery evening', draw: 'the casino lottery', place: 'Table', placeShort: 'TABLE', places: [40, 70],
      methods: ['Cash', 'Card', 'Chips', 'Marker'], amounts: [25, 50, 100, 250], start: 16 * 60, end: 23 * 60 + 59
    },
    {
      id: 'fete', label: 'Village fete tombola', hint: 'Bunting, a brass band, a quiet village',
      event: 'the village fete', draw: 'the tombola', place: 'Stall', placeShort: 'STALL', places: [24, 48],
      methods: ['Cash', 'Card', 'Coupon', 'Voucher'], amounts: [1, 2, 5, 10], start: 9 * 60, end: 17 * 60 + 59
    },
    {
      id: 'derby', label: 'Derby day sweepstake', hint: 'Racehorses, hats, a grandstand',
      event: 'derby day at the racecourse', draw: 'the derby sweepstake', place: 'Box', placeShort: 'BOX', places: [30, 60],
      methods: ['Cash', 'Card', 'Credit', 'Voucher'], amounts: [5, 10, 20, 50], start: 11 * 60, end: 18 * 60 + 59
    },
    {
      id: 'school', label: 'School reunion raffle', hint: 'Old classmates, old secrets, a gym hall',
      event: 'a twenty-year school reunion', draw: 'the reunion raffle', place: 'Table', placeShort: 'TABLE', places: [24, 50],
      methods: ['Cash', 'Card', 'Phone', 'Voucher'], amounts: [5, 10, 20, 50], start: 17 * 60, end: 23 * 60 + 59
    },
    {
      id: 'custom', label: 'My own setting', hint: 'Describe it in one line',
      event: '', draw: 'the raffle', place: 'Table', placeShort: 'TABLE', places: [30, 64],
      methods: ['Cash', 'Card', 'Check', 'Voucher'], amounts: [5, 10, 20, 50], start: 17 * 60, end: 23 * 60 + 59
    }
  ];

  var SPARKS = {
    era: ['the present day', 'the present day', 'the late 1980s', 'the 1950s', 'the 1920s', 'the late 1990s', 'the 1960s'],
    region: [
      'a windswept harbor town in Maine', 'a vineyard valley in Northern California', 'a lakeside resort town in Michigan',
      'a horse-country estate in Kentucky', 'a historic river town in Louisiana', 'a mountain town in Colorado',
      'a seaside village in Cornwall', 'a cathedral city in Yorkshire', 'a ski village in Vermont', 'a desert spa town in Arizona',
      'a fishing town on the Oregon coast', 'a college town in New England', 'a tobacco-road town in the Carolinas',
      'a Scottish island with one ferry a day', 'a Hudson Valley mill town', 'a Texas Hill Country ranch town'
    ],
    victim: [
      'a beloved philanthropist with a hidden ledger', 'the event\'s charming organizer', 'a self-made millionaire who hated surprises',
      'the town\'s retired judge', 'a celebrated chef who never forgave anyone', 'the heir to a failing family business',
      'a famous inventor who had just signed a deal', 'the owner of the grandest house in town', 'a local newspaper publisher',
      'a former champion with debts nobody knew about', 'the venue\'s long-serving manager', 'a widowed art collector'
    ],
    client: [
      'the victim\'s spouse, now the main suspect', 'the victim\'s estranged daughter', 'the victim\'s loyal driver',
      'the victim\'s business partner', 'the young assistant who found the body', 'the victim\'s younger brother',
      'the event caterer who served the last drink', 'the victim\'s oldest friend'
    ],
    method: [
      'poison slipped into a drink', 'a fall from a balcony that was no accident', 'a blow from a heavy trophy',
      'a doctored heart medicine', 'a locked room and a missing key', 'a car brake line, discovered too late',
      'a poisoned chocolate from a gift box', 'a push into the cold lake'
    ],
    motive: [
      'an inheritance about to be rewritten', 'blackmail over an old scandal', 'revenge for a ruined career',
      'a forged painting about to be exposed', 'a secret second family', 'a stolen invention', 'embezzled charity money',
      'a land deal that would bankrupt a rival', 'a decades-old hit-and-run', 'a broken engagement and a public humiliation'
    ],
    twist: [
      'the killer bought the ticket under a false name', 'the killer bought the ticket hours before the murder to build an alibi',
      'the victim had recognized the killer earlier that day', 'the killer was thought to have left the event early',
      'the killer and the victim had once been close friends', 'the killer had helped organize the draw'
    ]
  };

  // Chapter titles for a register split by the hours of the event, in order.
  var CHAPTERS = {
    gala: ['Arrivals', 'The Champagne Hour', 'Dinner Is Served', 'The Auction', 'The Last Dance', 'Before the Draw'],
    fair: ['Gates Open', 'The Midday Crowd', 'The Pie Contest', 'The Afternoon Rush', 'Lights on the Midway', 'The Final Call'],
    cruise: ['All Aboard', 'Sunset on Deck', 'The Captain’s Dinner', 'Jackpot Fever', 'The Ballroom', 'Last Orders'],
    casino: ['Doors Open', 'Happy Hour', 'The High Rollers', 'The Big Table', 'Neon Midnight', 'Last Call'],
    fete: ['Bunting Up', 'The Brass Band', 'Cream Teas', 'The Dog Show', 'The Raffle Rush', 'Packing Up'],
    derby: ['Gates Open', 'The Parade Ring', 'Hats and Champagne', 'The Big Race', 'The Last Race', 'Final Bets'],
    school: ['Name Tags', 'Old Photographs', 'Dinner and Speeches', 'The Slideshow', 'The Last Song', 'The Final Draw'],
    custom: ['Arrivals', 'The Evening Begins', 'The Crowd Gathers', 'The Main Event', 'The Late Hours', 'Last Call']
  };

  function chapterNames(id) { return CHAPTERS[id] || CHAPTERS.custom; }

  function venue(id) {
    for (var i = 0; i < VENUES.length; i++) if (VENUES[i].id === id) return VENUES[i];
    return VENUES[0];
  }

  // Story sparks are fixed by the seed: the same project always gets the same sparks.
  function sparks(seed) {
    var rng = LK.util.makeRng('sparks:' + seed);
    var out = {};
    Object.keys(SPARKS).forEach(function (k) { out[k] = rng.pick(SPARKS[k]); });
    return out;
  }

  function clock(min) {
    var hh = Math.floor(min / 60) % 24, mm = min % 60;
    var ap = hh >= 12 ? 'PM' : 'AM';
    var h12 = hh % 12 === 0 ? 12 : hh % 12;
    return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ap;
  }

  LK.themes = { VENUES: VENUES, SPARKS: SPARKS, CHAPTERS: CHAPTERS, chapterNames: chapterNames, venue: venue, sparks: sparks, clock: clock };
})(typeof window !== 'undefined' ? window : globalThis);
