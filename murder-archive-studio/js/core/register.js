/*
 * The ticket register: thousands of lottery tickets made from the project seed.
 * Every project gets its own seed, so no two books share a register.
 *
 * A record: { t: ticket number (5 digits), m: minutes after midnight, p: place number,
 *             pay: payment index, amt: amount index, n: [6 lucky numbers, sorted], i: 'EP' (initials) }
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var U = LK.util;

  var NUM_MAX = 49;      // a classic 6-from-49 lottery
  var NUM_PICK = 6;

  // Rough frequency of English first letters of given names and surnames, so initials look natural.
  var INITIALS = 'AAAAABBBBBCCCCCDDDDEEEFFFGGGGHHHHHIJJJJJJKKKLLLLLMMMMMMNNNOOPPPPQRRRRRSSSSSSSTTTTTUVVWWWWWXYYZ';

  function weighted(rng, weights) {
    var r = rng.next() * weights.reduce(function (a, b) { return a + b; }, 0);
    for (var i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
    return weights.length - 1;
  }

  function randomNumbers(rng) {
    var pool = [];
    while (pool.length < NUM_PICK) {
      var v = 1 + rng.int(NUM_MAX);
      if (pool.indexOf(v) === -1) pool.push(v);
    }
    return pool.sort(function (a, b) { return a - b; });
  }

  // Purchase time: steady trickle all evening plus a rush around the middle.
  function randomTime(rng, venue) {
    var span = venue.end - venue.start;
    if (rng.next() < 0.55) return venue.start + rng.int(span + 1);
    var peak = venue.start + span * (0.35 + rng.next() * 0.3);
    var v = Math.round(peak + (rng.next() + rng.next() + rng.next() - 1.5) * span * 0.35);
    return Math.max(venue.start, Math.min(venue.end, v));
  }

  function randomRecord(rng, ctx) {
    return {
      t: 0,
      m: randomTime(rng, ctx.venue),
      p: 1 + rng.int(ctx.places),
      pay: weighted(rng, ctx.payWeights),
      amt: weighted(rng, ctx.amtWeights),
      n: randomNumbers(rng),
      i: INITIALS[rng.int(INITIALS.length)] + INITIALS[rng.int(INITIALS.length)]
    };
  }

  /*
   * Builds the register. Returns { venue, places, payWeights, amtWeights, records, used }.
   * records are not sorted yet; LK.clues.buildCase sorts them once the case is final.
   */
  function generate(seed, count, venue) {
    var rng = U.makeRng('register:' + seed);
    var places = venue.places[0] + rng.int(venue.places[1] - venue.places[0] + 1);
    var payWeights = rng.shuffle([34, 30, 20, 16]);
    var amtWeights = [38, 30, 20, 12];
    var ctx = { venue: venue, places: places, payWeights: payWeights, amtWeights: amtWeights };
    var used = new Set();
    var records = [];
    for (var k = 0; k < count; k++) {
      var r = randomRecord(rng, ctx);
      r.t = freshTicket(rng, used);
      records.push(r);
    }
    return { venue: venue, places: places, payWeights: payWeights, amtWeights: amtWeights, records: records, used: used };
  }

  function freshTicket(rng, used) {
    for (;;) {
      var t = 10000 + rng.int(90000);
      if (!used.has(t)) { used.add(t); return t; }
    }
  }

  // ---------- printed forms ----------
  function pad2(v) { return (v < 10 ? '0' : '') + v; }
  function fmtNumbers(n) { return n.map(pad2).join(' '); }
  function fmtInitials(i) { return i[0] + '.' + i[1] + '.'; }
  function fmtAmount(v) { return '$' + v; }

  function row(rec, venue) {
    return {
      ticket: String(rec.t),
      time: LK.themes.clock(rec.m),
      place: String(rec.p),
      amount: fmtAmount(venue.amounts[rec.amt]),
      method: venue.methods[rec.pay],
      numbers: fmtNumbers(rec.n),
      initials: fmtInitials(rec.i)
    };
  }

  LK.register = {
    NUM_MAX: NUM_MAX, NUM_PICK: NUM_PICK, INITIALS: INITIALS,
    generate: generate, randomRecord: randomRecord, randomNumbers: randomNumbers, freshTicket: freshTicket,
    row: row, pad2: pad2, fmtNumbers: fmtNumbers, fmtInitials: fmtInitials, fmtAmount: fmtAmount
  };
})(typeof window !== 'undefined' ? window : globalThis);
