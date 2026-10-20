/*
 * The case engine. It picks the killer's ticket, writes the clues, and proves the puzzle is fair:
 *   - the killer's ticket passes every clue, and it is the only ticket that passes them all;
 *   - read in order, every clue rules out at least one ticket that was still in play;
 *   - every clue is needed: drop any one of them and more than one ticket survives.
 * Clues are written by this engine, never by the AI, so the logic cannot be wrong.
 * The same settings and seed always give the same case.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var U = LK.util, R = LK.register;
  var clock = LK.themes.clock;

  var DIFFICULTY = {
    easy: { label: 'Easy', clues: 12, min: 10, max: 16, tiers: [1, 2], tierCost: { 1: 0, 2: 0.25 }, tier3: [0, 0] },
    medium: { label: 'Medium', clues: 16, min: 12, max: 20, tiers: [1, 2, 3], tierCost: { 1: 0, 2: 0, 3: 0.35 }, tier3: [1, 3] },
    hard: { label: 'Hard', clues: 20, min: 14, max: 24, tiers: [1, 2, 3], tierCost: { 1: 0.35, 2: 0, 3: -0.15 }, tier3: [4, 8] }
  };

  // ---------- record helpers ----------
  function digits(t) { return String(t).split('').map(Number); }
  function digitSum(t) { return digits(t).reduce(function (a, b) { return a + b; }, 0); }
  function hasDouble(t) { return /(\d)\1/.test(String(t)); }
  function hasConsec(n) { for (var k = 1; k < n.length; k++) if (n[k] === n[k - 1] + 1) return true; return false; }
  function evenCount(n) { return n.filter(function (v) { return v % 2 === 0; }).length; }
  function numSum(n) { return n.reduce(function (a, b) { return a + b; }, 0); }
  function has(arr, v) { return arr.indexOf(v) !== -1; }
  var VOWELS = 'AEIOU';

  function list(arr, word) {
    if (arr.length === 1) return String(arr[0]);
    return arr.slice(0, -1).join(', ') + ' ' + (word || 'or') + ' ' + arr[arr.length - 1];
  }
  function q(s) { return '“' + s + '”'; }
  function round5Down(m) { return Math.floor(m / 5) * 5; }
  function round5Up(m) { return Math.ceil(m / 5) * 5; }

  function sample(c, fn, n) {
    var out = [];
    for (var k = 0; k < n; k++) out.push(fn(c.alive[c.rng.int(c.alive.length)]));
    return out;
  }
  function distinctPicks(rng, pool, n, avoid) {
    var p = pool.filter(function (v) { return !avoid || !avoid(v); });
    rng.shuffle(p);
    return p.slice(0, n);
  }
  function C(sig, text, test) { return { sig: sig, text: text, test: test }; }

  // ---------- clue templates ----------
  // Each gen(c) returns clues that the killer's ticket passes. c: { rng, k, alive, venue, places, place, n }
  var T = [];
  function tpl(id, fam, tier, gen) { T.push({ id: id, fam: fam, tier: tier, gen: gen }); }

  // time
  tpl('time_after', 'time', 1, function (c) {
    return sample(c, function (r) { return round5Down(r.m); }, c.n).filter(function (v) { return v <= c.k.m && v > c.venue.start; })
      .map(function (v) { return C('ta' + v, 'The killer’s ticket was bought at ' + clock(v) + ' or later.', function (r) { return r.m >= v; }); });
  });
  tpl('time_before', 'time', 1, function (c) {
    return sample(c, function (r) { return round5Up(r.m); }, c.n).filter(function (v) { return v >= c.k.m && v < c.venue.end; })
      .map(function (v) { return C('tb' + v, 'The killer’s ticket was bought at ' + clock(v) + ' or earlier.', function (r) { return r.m <= v; }); });
  });
  tpl('time_between', 'time', 2, function (c) {
    var out = [];
    for (var k = 0; k < c.n; k++) {
      var a = round5Down(c.alive[c.rng.int(c.alive.length)].m), b = round5Up(c.alive[c.rng.int(c.alive.length)].m);
      if (a > c.k.m || b < c.k.m || b - a < 30 || (a <= c.venue.start && b >= c.venue.end)) continue;
      (function (a, b) {
        out.push(C('tw' + a + '-' + b, 'The killer’s ticket was bought between ' + clock(a) + ' and ' + clock(b) + ', both times included.',
          function (r) { return r.m >= a && r.m <= b; }));
      })(a, b);
    }
    return out;
  });
  tpl('time_not_between', 'time', 2, function (c) {
    var out = [];
    for (var k = 0; k < c.n; k++) {
      var x = round5Down(c.alive[c.rng.int(c.alive.length)].m), y = round5Up(c.alive[c.rng.int(c.alive.length)].m);
      var a = Math.min(x, y), b = Math.max(x, y);
      if (b - a < 20 || (c.k.m >= a && c.k.m <= b)) continue;
      (function (a, b) {
        out.push(C('tn' + a + '-' + b, 'The killer’s ticket was not bought between ' + clock(a) + ' and ' + clock(b) + ' (both times included).',
          function (r) { return r.m < a || r.m > b; }));
      })(a, b);
    }
    return out;
  });
  tpl('time_hour', 'time', 1, function (c) {
    var kh = Math.floor(c.k.m / 60), out = [];
    for (var hh = Math.floor(c.venue.start / 60); hh <= Math.floor(c.venue.end / 60); hh++) {
      if (hh === kh) continue;
      (function (hh) {
        out.push(C('th' + hh, 'The killer’s ticket was not bought between ' + clock(hh * 60) + ' and ' + clock(hh * 60 + 59) + '.',
          function (r) { return Math.floor(r.m / 60) !== hh; }));
      })(hh);
    }
    return out;
  });
  tpl('time_minute_parity', 'time', 2, function (c) {
    var odd = (c.k.m % 60) % 2 === 1;
    return [C('tp' + odd, 'The minutes of the purchase time on the killer’s ticket end in an ' + (odd ? 'odd digit (as in 9:47).' : 'even digit (as in 9:46).'),
      function (r) { return ((r.m % 60) % 2 === 1) === odd; })];
  });
  tpl('time_round', 'time', 2, function (c) {
    var round = (c.k.m % 5) === 0;
    return [C('tr' + round, round ? 'The minutes of the purchase time on the killer’s ticket end in 0 or 5 (as in 9:45).'
      : 'The minutes of the purchase time on the killer’s ticket do not end in 0 or 5.',
      function (r) { return ((r.m % 5) === 0) === round; })];
  });

  // place (table, booth, stall...)
  tpl('place_parity', 'place', 1, function (c) {
    var even = c.k.p % 2 === 0;
    return [C('pp' + even, 'The ' + c.place + ' number on the killer’s ticket is ' + (even ? 'even.' : 'odd.'),
      function (r) { return (r.p % 2 === 0) === even; })];
  });
  tpl('place_ge', 'place', 1, function (c) {
    return sample(c, function (r) { return r.p; }, c.n).filter(function (v) { return v <= c.k.p && v > 1; })
      .map(function (v) { return C('pg' + v, 'The ' + c.place + ' number on the killer’s ticket is ' + v + ' or higher.', function (r) { return r.p >= v; }); });
  });
  tpl('place_le', 'place', 1, function (c) {
    return sample(c, function (r) { return r.p; }, c.n).filter(function (v) { return v >= c.k.p && v < c.places; })
      .map(function (v) { return C('pl' + v, 'The ' + c.place + ' number on the killer’s ticket is ' + v + ' or lower.', function (r) { return r.p <= v; }); });
  });
  tpl('place_not', 'place', 2, function (c) {
    var out = [];
    for (var k = 0; k < Math.ceil(c.n / 2); k++) {
      var size = 3 + c.rng.int(3);
      var picks = distinctPicks(c.rng, U.range(1, c.places), size, function (v) { return v === c.k.p; }).sort(function (a, b) { return a - b; });
      (function (picks) {
        out.push(C('pn' + picks.join('.'), 'The ' + c.place + ' number on the killer’s ticket is not ' + list(picks) + '.',
          function (r) { return !has(picks, r.p); }));
      })(picks);
    }
    return out;
  });
  tpl('place_mult', 'place', 2, function (c) {
    return [3, 4, 5].map(function (m) {
      var yes = c.k.p % m === 0;
      return C('pm' + m + yes, 'The ' + c.place + ' number on the killer’s ticket is ' + (yes ? '' : 'not ') + 'a multiple of ' + m + '.',
        function (r) { return (r.p % m === 0) === yes; });
    });
  });
  tpl('place_digit', 'place', 2, function (c) {
    var out = [];
    for (var k = 0; k < 3; k++) {
      var d = c.rng.int(10);
      var yes = String(c.k.p).indexOf(String(d)) !== -1;
      (function (d, yes) {
        out.push(C('pd' + d + yes, 'The ' + c.place + ' number on the killer’s ticket ' + (yes ? 'contains' : 'does not contain') + ' the digit ' + d + '.',
          function (r) { return (String(r.p).indexOf(String(d)) !== -1) === yes; }));
      })(d, yes);
    }
    return out;
  });

  // payment method
  tpl('pay_is', 'pay', 1, function (c) {
    var m = c.k.pay;
    return [C('py' + m, 'The payment method on the killer’s ticket is ' + q(c.venue.methods[m]) + '.', function (r) { return r.pay === m; })];
  });
  tpl('pay_not', 'pay', 1, function (c) {
    return [0, 1, 2, 3].filter(function (m) { return m !== c.k.pay; }).map(function (m) {
      return C('px' + m, 'The payment method on the killer’s ticket is not ' + q(c.venue.methods[m]) + '.', function (r) { return r.pay !== m; });
    });
  });
  tpl('pay_neither', 'pay', 2, function (c) {
    var o = [0, 1, 2, 3].filter(function (m) { return m !== c.k.pay; }), out = [];
    for (var a = 0; a < o.length; a++) for (var b = a + 1; b < o.length; b++) {
      (function (x, y) {
        out.push(C('pz' + x + y, 'The payment method on the killer’s ticket is neither ' + q(c.venue.methods[x]) + ' nor ' + q(c.venue.methods[y]) + '.',
          function (r) { return r.pay !== x && r.pay !== y; }));
      })(o[a], o[b]);
    }
    return out;
  });

  // amount paid
  tpl('amt_ge', 'amt', 1, function (c) {
    var out = [];
    for (var a = 1; a <= c.k.amt; a++) (function (a) {
      out.push(C('ag' + a, 'The killer paid ' + R.fmtAmount(c.venue.amounts[a]) + ' or more for the ticket.', function (r) { return r.amt >= a; }));
    })(a);
    return out;
  });
  tpl('amt_le', 'amt', 1, function (c) {
    var out = [];
    for (var a = c.k.amt; a < 3; a++) (function (a) {
      out.push(C('al' + a, 'The killer paid ' + R.fmtAmount(c.venue.amounts[a]) + ' or less for the ticket.', function (r) { return r.amt <= a; }));
    })(a);
    return out;
  });
  tpl('amt_not', 'amt', 1, function (c) {
    return [0, 1, 2, 3].filter(function (a) { return a !== c.k.amt; }).map(function (a) {
      return C('an' + a, 'The killer did not pay ' + R.fmtAmount(c.venue.amounts[a]) + ' for the ticket.', function (r) { return r.amt !== a; });
    });
  });

  // ticket number
  tpl('tk_parity', 'ticket', 1, function (c) {
    var odd = c.k.t % 2 === 1;
    return [C('kp' + odd, 'The killer’s ticket number is ' + (odd ? 'odd.' : 'even.'), function (r) { return (r.t % 2 === 1) === odd; })];
  });
  tpl('tk_has', 'ticket', 1, function (c) {
    var ds = digits(c.k.t);
    return ds.filter(function (d, i) { return ds.indexOf(d) === i; }).map(function (d) {
      return C('kh' + d, 'The killer’s ticket number contains the digit ' + d + '.', function (r) { return String(r.t).indexOf(String(d)) !== -1; });
    });
  });
  tpl('tk_hasnot', 'ticket', 1, function (c) {
    var s = String(c.k.t);
    return U.range(0, 9).filter(function (d) { return s.indexOf(String(d)) === -1; }).map(function (d) {
      return C('kn' + d, 'The killer’s ticket number does not contain the digit ' + d + '.', function (r) { return String(r.t).indexOf(String(d)) === -1; });
    });
  });
  tpl('tk_first', 'ticket', 1, function (c) {
    var f = Math.floor(c.k.t / 10000), out = [];
    for (var k = 0; k < c.n; k++) {
      var size = 2 + c.rng.int(4);
      var set = [f].concat(distinctPicks(c.rng, U.range(1, 9), size - 1, function (v) { return v === f; })).sort();
      (function (set) {
        out.push(C('kf' + set.join(''), 'The killer’s ticket number begins with ' + list(set) + '.',
          function (r) { return has(set, Math.floor(r.t / 10000)); }));
      })(set);
    }
    return out;
  });
  tpl('tk_last', 'ticket', 1, function (c) {
    var l = c.k.t % 10, out = [];
    for (var k = 0; k < c.n; k++) {
      var size = 2 + c.rng.int(4);
      var set = [l].concat(distinctPicks(c.rng, U.range(0, 9), size - 1, function (v) { return v === l; })).sort();
      (function (set) {
        out.push(C('kl' + set.join(''), 'The killer’s ticket number ends in ' + list(set) + '.', function (r) { return has(set, r.t % 10); }));
      })(set);
    }
    return out;
  });
  tpl('tk_sum', 'ticket', 2, function (c) {
    var ks = digitSum(c.k.t), out = [];
    sample(c, function (r) { return digitSum(r.t); }, c.n).forEach(function (v) {
      if (v <= ks && v > 6) out.push(C('ks+' + v, 'The digits of the killer’s ticket number add up to ' + v + ' or more.', function (r) { return digitSum(r.t) >= v; }));
      if (v >= ks && v < 40) out.push(C('ks-' + v, 'The digits of the killer’s ticket number add up to ' + v + ' or less.', function (r) { return digitSum(r.t) <= v; }));
    });
    return out;
  });
  tpl('tk_double', 'ticket', 2, function (c) {
    var yes = hasDouble(c.k.t);
    return [C('kd' + yes, yes ? 'The killer’s ticket number has two identical digits side by side (like the 44 in 12447).'
      : 'The killer’s ticket number has no identical digits side by side (no pair like the 44 in 12447).',
      function (r) { return hasDouble(r.t) === yes; })];
  });
  tpl('tk_firstlast', 'ticket', 2, function (c) {
    var f = Math.floor(c.k.t / 10000), l = c.k.t % 10;
    var rel = f > l ? 1 : f < l ? -1 : 0;
    var text = rel > 0 ? 'The first digit of the killer’s ticket number is larger than its last digit.'
      : rel < 0 ? 'The first digit of the killer’s ticket number is smaller than its last digit.'
        : 'The killer’s ticket number begins and ends with the same digit.';
    return [C('kr' + rel, text, function (r) { var a = Math.floor(r.t / 10000), b = r.t % 10; return (a > b ? 1 : a < b ? -1 : 0) === rel; })];
  });
  tpl('tk_div3', 'ticket', 2, function (c) {
    var yes = c.k.t % 3 === 0;
    return [C('k3' + yes, yes ? 'The killer’s ticket number is divisible by 3 (its digits add up to a multiple of 3).'
      : 'The killer’s ticket number is not divisible by 3 (its digits do not add up to a multiple of 3).',
      function (r) { return (r.t % 3 === 0) === yes; })];
  });

  // lucky numbers
  tpl('num_has', 'nums', 1, function (c) {
    return c.k.n.map(function (v) {
      return C('nh' + v, 'The lucky numbers on the killer’s ticket include ' + v + '.', function (r) { return has(r.n, v); });
    });
  });
  tpl('num_hasnot', 'nums', 1, function (c) {
    return distinctPicks(c.rng, U.range(1, R.NUM_MAX), c.n * 2, function (v) { return has(c.k.n, v); }).map(function (v) {
      return C('nx' + v, 'The lucky numbers on the killer’s ticket do not include ' + v + '.', function (r) { return !has(r.n, v); });
    });
  });
  tpl('num_any', 'nums', 2, function (c) {
    var out = [];
    for (var k = 0; k < c.n; k++) {
      var one = c.k.n[c.rng.int(6)];
      var set = [one].concat(distinctPicks(c.rng, U.range(1, R.NUM_MAX), 2, function (v) { return v === one; })).sort(function (a, b) { return a - b; });
      (function (set) {
        out.push(C('na' + set.join('.'), 'The lucky numbers on the killer’s ticket include at least one of ' + list(set) + '.',
          function (r) { return set.some(function (v) { return has(r.n, v); }); }));
      })(set);
    }
    return out;
  });
  tpl('num_none', 'nums', 2, function (c) {
    var out = [];
    for (var k = 0; k < c.n; k++) {
      var set = distinctPicks(c.rng, U.range(1, R.NUM_MAX), 3, function (v) { return has(c.k.n, v); }).sort(function (a, b) { return a - b; });
      (function (set) {
        out.push(C('no' + set.join('.'), 'The lucky numbers on the killer’s ticket include none of ' + list(set) + '.',
          function (r) { return !set.some(function (v) { return has(r.n, v); }); }));
      })(set);
    }
    return out;
  });
  tpl('num_max', 'nums', 1, function (c) {
    var km = c.k.n[5];
    return sample(c, function (r) { return r.n[5]; }, c.n).filter(function (v) { return v >= km && v < R.NUM_MAX; }).map(function (v) {
      return C('nm' + v, 'None of the lucky numbers on the killer’s ticket is higher than ' + v + '.', function (r) { return r.n[5] <= v; });
    });
  });
  tpl('num_min', 'nums', 1, function (c) {
    var km = c.k.n[0];
    return sample(c, function (r) { return r.n[0]; }, c.n).filter(function (v) { return v <= km && v > 1; }).map(function (v) {
      return C('nn' + v, 'The smallest lucky number on the killer’s ticket is ' + v + ' or higher.', function (r) { return r.n[0] >= v; });
    });
  });
  tpl('num_consec', 'nums', 2, function (c) {
    var yes = hasConsec(c.k.n);
    return [C('nc' + yes, yes ? 'The lucky numbers on the killer’s ticket include two consecutive numbers (like 14 and 15).'
      : 'The lucky numbers on the killer’s ticket include no two consecutive numbers (no pair like 14 and 15).',
      function (r) { return hasConsec(r.n) === yes; })];
  });
  tpl('num_even', 'nums', 2, function (c) {
    var e = evenCount(c.k.n), out = [];
    out.push(C('ne=' + e, 'Exactly ' + e + ' of the lucky numbers on the killer’s ticket ' + (e === 1 ? 'is' : 'are') + ' even.', function (r) { return evenCount(r.n) === e; }));
    if (e >= 2) out.push(C('ne>' + e, 'At least ' + e + ' of the lucky numbers on the killer’s ticket are even.', function (r) { return evenCount(r.n) >= e; }));
    if (e <= 4) out.push(C('ne<' + e, 'At most ' + e + ' of the lucky numbers on the killer’s ticket ' + (e === 1 ? 'is' : 'are') + ' even.', function (r) { return evenCount(r.n) <= e; }));
    return out;
  });
  tpl('num_sum', 'nums', 3, function (c) {
    var ks = numSum(c.k.n), out = [];
    sample(c, function (r) { return Math.round(numSum(r.n) / 5) * 5; }, c.n).forEach(function (v) {
      if (v <= ks && v > 40) out.push(C('ns+' + v, 'The six lucky numbers on the killer’s ticket add up to ' + v + ' or more.', function (r) { return numSum(r.n) >= v; }));
      if (v >= ks && v < 260) out.push(C('ns-' + v, 'The six lucky numbers on the killer’s ticket add up to ' + v + ' or less.', function (r) { return numSum(r.n) <= v; }));
    });
    return out;
  });
  tpl('num_decade', 'nums', 2, function (c) {
    return [0, 1, 2, 3, 4].map(function (d) {
      var lo = d === 0 ? 1 : d * 10, hi = d * 10 + 9;
      var yes = c.k.n.some(function (v) { return v >= lo && v <= hi; });
      return C('nd' + d + yes, yes ? 'At least one lucky number on the killer’s ticket is between ' + lo + ' and ' + hi + '.'
        : 'None of the lucky numbers on the killer’s ticket is between ' + lo + ' and ' + hi + '.',
        function (r) { return r.n.some(function (v) { return v >= lo && v <= hi; }) === yes; });
    });
  });
  tpl('num_enddigit', 'nums', 2, function (c) {
    var out = [];
    for (var k = 0; k < 3; k++) {
      var d = c.rng.int(10);
      var yes = c.k.n.some(function (v) { return v % 10 === d; });
      (function (d, yes) {
        out.push(C('ne' + d + yes, yes ? 'At least one lucky number on the killer’s ticket ends in the digit ' + d + '.'
          : 'None of the lucky numbers on the killer’s ticket ends in the digit ' + d + '.',
          function (r) { return r.n.some(function (v) { return v % 10 === d; }) === yes; }));
      })(d, yes);
    }
    return out;
  });

  // initials
  tpl('ini_half', 'initials', 1, function (c) {
    return [0, 1].map(function (pos) {
      var early = c.k.i[pos] <= 'M';
      var which = pos === 0 ? 'first' : 'second';
      return C('ih' + pos + early, 'The ' + which + ' initial on the killer’s ticket is a letter from ' + (early ? 'A to M.' : 'N to Z.'),
        function (r) { return (r.i[pos] <= 'M') === early; });
    });
  });
  tpl('ini_has', 'initials', 1, function (c) {
    var out = [];
    for (var k = 0; k < 3; k++) {
      var L = R.INITIALS[c.rng.int(R.INITIALS.length)];
      var yes = c.k.i.indexOf(L) !== -1;
      (function (L, yes) {
        out.push(C('ia' + L + yes, yes ? 'One of the initials on the killer’s ticket is ' + L + '.' : 'Neither initial on the killer’s ticket is ' + L + '.',
          function (r) { return (r.i.indexOf(L) !== -1) === yes; }));
      })(L, yes);
    }
    return out;
  });
  tpl('ini_same', 'initials', 2, function (c) {
    var same = c.k.i[0] === c.k.i[1];
    return [C('is' + same, same ? 'Both initials on the killer’s ticket are the same letter.' : 'The two initials on the killer’s ticket are different letters.',
      function (r) { return (r.i[0] === r.i[1]) === same; })];
  });
  tpl('ini_vowel', 'initials', 2, function (c) {
    var yes = VOWELS.indexOf(c.k.i[0]) !== -1 || VOWELS.indexOf(c.k.i[1]) !== -1;
    return [C('iv' + yes, yes ? 'At least one initial on the killer’s ticket is a vowel (A, E, I, O or U).'
      : 'Neither initial on the killer’s ticket is a vowel (A, E, I, O or U).',
      function (r) { return (VOWELS.indexOf(r.i[0]) !== -1 || VOWELS.indexOf(r.i[1]) !== -1) === yes; })];
  });
  tpl('ini_order', 'initials', 2, function (c) {
    if (c.k.i[0] === c.k.i[1]) return [];
    var before = c.k.i[0] < c.k.i[1];
    return [C('io' + before, 'On the killer’s ticket, the first initial comes ' + (before ? 'earlier' : 'later') + ' in the alphabet than the second.',
      function (r) { return before ? r.i[0] < r.i[1] : r.i[0] > r.i[1]; })];
  });

  // cross-field (hard)
  tpl('x_place_nums', 'cross', 3, function (c) {
    var yes = has(c.k.n, c.k.p);
    return [C('xp' + yes, 'The ' + c.place + ' number on the killer’s ticket ' + (yes ? 'is also' : 'is not') + ' one of its lucky numbers.',
      function (r) { return has(r.n, r.p) === yes; })];
  });
  tpl('x_lastdigit', 'cross', 3, function (c) {
    var same = c.k.t % 10 === c.k.p % 10;
    return [C('xl' + same, 'On the killer’s ticket, the ticket number and the ' + c.place + ' number end in ' + (same ? 'the same digit.' : 'different digits.'),
      function (r) { return (r.t % 10 === r.p % 10) === same; })];
  });
  tpl('x_minutes', 'cross', 3, function (c) {
    var yes = has(c.k.n, c.k.m % 60);
    return [C('xm' + yes, 'The minutes of the purchase time (47 for 9:47) ' + (yes ? 'are' : 'are not') + ' one of the lucky numbers on the killer’s ticket.',
      function (r) { return has(r.n, r.m % 60) === yes; })];
  });
  tpl('x_if_pay_time', 'cross', 3, function (c) {
    var out = [];
    for (var k = 0; k < c.n; k++) {
      var m = c.rng.int(4);
      var v = round5Up(c.alive[c.rng.int(c.alive.length)].m);
      if (v >= c.venue.end || v <= c.venue.start) continue;
      if (c.k.pay === m && c.k.m > v) continue;
      (function (m, v) {
        out.push(C('xi' + m + '.' + v, 'If the killer’s ticket was paid with ' + q(c.venue.methods[m]) + ', it was bought at ' + clock(v) + ' or earlier.',
          function (r) { return r.pay !== m || r.m <= v; }));
      })(m, v);
    }
    return out;
  });
  tpl('x_if_amt_place', 'cross', 3, function (c) {
    var out = [];
    for (var k = 0; k < c.n; k++) {
      var a = 1 + c.rng.int(3);
      var v = c.alive[c.rng.int(c.alive.length)].p;
      if (v >= c.places) continue;
      if (c.k.amt >= a && c.k.p > v) continue;
      (function (a, v) {
        out.push(C('xa' + a + '.' + v, 'If the killer paid ' + R.fmtAmount(c.venue.amounts[a]) + ' or more, the ' + c.place + ' number on the ticket is ' + v + ' or lower.',
          function (r) { return r.amt < a || r.p <= v; }));
      })(a, v);
    }
    return out;
  });
  tpl('x_or_pay_time', 'cross', 3, function (c) {
    var out = [];
    for (var k = 0; k < c.n; k++) {
      var m = c.rng.int(4);
      var v = round5Down(c.alive[c.rng.int(c.alive.length)].m);
      if (v <= c.venue.start) continue;
      if (c.k.pay !== m && c.k.m < v) continue;
      (function (m, v) {
        out.push(C('xo' + m + '.' + v, 'The killer’s ticket was paid with ' + q(c.venue.methods[m]) + ', or it was bought at ' + clock(v) + ' or later (or both).',
          function (r) { return r.pay === m || r.m >= v; }));
      })(m, v);
    }
    return out;
  });
  tpl('x_or_parity_amt', 'cross', 3, function (c) {
    var out = [];
    [0, 1, 2, 3].forEach(function (a) {
      [true, false].forEach(function (odd) {
        if ((c.k.t % 2 === 1) !== odd && c.k.amt !== a) return;
        out.push(C('xq' + a + odd, 'The killer’s ticket number is ' + (odd ? 'odd' : 'even') + ', or the killer paid exactly ' + R.fmtAmount(c.venue.amounts[a]) + ' (or both).',
          function (r) { return (r.t % 2 === 1) === odd || r.amt === a; }));
      });
    });
    return out;
  });

  var FAMILIES = ['time', 'place', 'pay', 'amt', 'ticket', 'nums', 'initials', 'cross'];

  // ---------- chain building ----------
  function countPass(alive, test) {
    var n = 0;
    for (var i = 0; i < alive.length; i++) if (test(alive[i])) n++;
    return n;
  }

  // True when the candidate implies an earlier clue or is implied by one, across the whole register.
  function implies(a, b, records) {
    for (var i = 0; i < records.length; i++) if (a(records[i]) && !b(records[i])) return false;
    return true;
  }
  function overlaps(test, chain, records) {
    for (var k = 0; k < chain.length; k++) {
      if (implies(test, chain[k].test, records) || implies(chain[k].test, test, records)) return true;
    }
    return false;
  }

  function buildChain(type, reg, killer, K, diff, rng) {
    var alive = reg.records.slice();
    var chain = [], used = {}, famCount = {}, tplCount = {}, tier3 = 0;
    var famCap = Math.ceil(K / 7) + 1;
    // too many clues about one part of a name leave no room for a near miss on that part
    var grpCount = {}, grpCap = type.groupCap ? type.groupCap(K) : null;
    var templates = type.templates(reg).filter(function (t) { return diff.tiers.indexOf(t.tier) !== -1; });
    for (var j = 1; j <= K; j++) {
      var left = K - j + 1, a0 = alive.length;
      // every later clue must still rule out at least one record, so keep one record per clue to come
      var floor = left;
      var target = j === K ? 1 : Math.max(floor, a0 * Math.pow(1 / a0, 1 / left));
      var c = type.context({ rng: rng, k: killer, alive: alive, n: left <= 3 ? 12 : 4, reg: reg }, reg);
      var picks = [];
      var last = chain.length ? chain[chain.length - 1] : null;
      var prev2 = chain.length > 1 ? chain[chain.length - 2] : null;
      var tier3Left = diff.tier3[1] - tier3;
      var tier3Need = Math.max(0, diff.tier3[0] - tier3);
      for (var ti = 0; ti < templates.length; ti++) {
        var tp = templates[ti];
        if (tp.tier === 3 && tier3Left <= 0) continue;
        var cands = tp.gen(c);
        for (var ci = 0; ci < cands.length; ci++) {
          var cl = cands[ci];
          if (used[cl.sig] || !cl.test(killer)) continue;
          var a = countPass(alive, cl.test);
          if (a >= a0) continue;
          if (j < K && a < floor) continue;
          if (j === K && a !== 1) continue;
          var score = j === K ? 0 : Math.abs(Math.log(a) - Math.log(target));
          if (last && last.fam === tp.fam) score += 3;
          if (prev2 && prev2.fam === tp.fam) score += 1.2;
          if ((famCount[tp.fam] || 0) >= famCap) score += 3;
          if (grpCap && tp.grp && (grpCount[tp.grp] || 0) >= grpCap[tp.grp]) score += 6;
          score += 0.8 * (tplCount[tp.id] || 0);
          score += diff.tierCost[tp.tier] || 0;
          if (tp.tier === 3 && tier3Need > 0 && left <= tier3Need + 2) score -= 0.6;
          score += rng.next() * 0.2;
          picks.push({ tp: tp, cl: cl, score: score });
        }
      }
      picks.sort(function (x, y) { return x.score - y.score; });
      // skip a clue that repeats what an earlier clue already says, or makes an earlier one pointless
      var best = null;
      for (var pi = 0; pi < picks.length && !best; pi++) {
        if (!overlaps(picks[pi].cl.test, chain, reg.records)) best = picks[pi];
      }
      if (!best) { if (LK.debugChain) LK.debugChain(j, picks.length, alive.length); return null; }
      var test = best.cl.test;
      alive = alive.filter(test);
      used[best.cl.sig] = true;
      famCount[best.tp.fam] = (famCount[best.tp.fam] || 0) + 1;
      tplCount[best.tp.id] = (tplCount[best.tp.id] || 0) + 1;
      if (best.tp.grp) grpCount[best.tp.grp] = (grpCount[best.tp.grp] || 0) + 1;
      if (best.tp.tier === 3) tier3++;
      chain.push({ id: best.tp.id, fam: best.tp.fam, tier: best.tp.tier, sig: best.cl.sig, text: best.cl.text, test: test, how: best.cl.how, why: best.cl.why });
    }
    if (tier3 < diff.tier3[0]) { if (LK.debugChain) LK.debugChain("tier3", tier3); return null; }
    return chain;
  }

  // ---------- fairness: make every clue necessary ----------
  function failsOnly(rec, chain, i) {
    if (chain[i].test(rec)) return false;
    for (var j = 0; j < chain.length; j++) if (j !== i && !chain[j].test(rec)) return false;
    return true;
  }

  // A random walk from the answer that keeps passing every clue except clue i, and ends on a
  // record that fails clue i. Its identity (ticket number, name...) moves away from the answer's,
  // so the result looks like any other record.
  function nearMiss(type, reg, killer, chain, i, rng) {
    if (type.nearMissSearch) return type.nearMissSearch(reg, killer, chain, i, rng);
    var passOthers = function (r) {
      for (var j = 0; j < chain.length; j++) if (j !== i && !chain[j].test(r)) return false;
      return true;
    };
    var must = type.mustMove(reg), moved = {};
    var rec = type.clone(killer), accepted = 0;
    for (var step = 0; step < 12000; step++) {
      var p = type.clone(rec);
      var f = type.mutate(p, rng, reg);
      if (f === null) continue;
      if (!passOthers(p)) continue;
      rec = p; accepted++;
      moved[f] = true;
      if (accepted >= 24 && must.every(function (k) { return moved[k]; }) && !chain[i].test(rec)) return rec;
    }
    return null;
  }

  function plantNearMisses(type, reg, killer, chain, rng) {
    var recs = reg.records;
    for (var i = 0; i < chain.length; i++) {
      var found = false;
      for (var r = 0; r < recs.length && !found; r++) if (recs[r] !== killer && failsOnly(recs[r], chain, i)) found = true;
      if (found) continue;
      var nm = nearMiss(type, reg, killer, chain, i, rng);
      if (!nm) return false;
      // replace a record that at least two clues rule out, so no other clue loses its witness
      var slot = -1;
      for (var tries = 0; tries < 400 && slot < 0; tries++) {
        var cand = rng.int(recs.length), rec = recs[cand];
        if (rec === killer) continue;
        var fails = 0;
        for (var j = 0; j < chain.length && fails < 2; j++) if (!chain[j].test(rec)) fails++;
        if (fails >= 2) slot = cand;
      }
      if (slot < 0) return false;
      type.keys(recs[slot], reg).forEach(function (k) { reg.used.delete(k); });
      type.keys(nm, reg).forEach(function (k) { reg.used.add(k); });
      type.assign(recs[slot], nm, reg);
    }
    return true;
  }

  // ---------- verification ----------
  /*
   * Checks a case from scratch. Returns { ok, survivors, killerSurvives, checkpoints[], stepOk[], necessary[], elimAt[] }.
   * elimAt[r] is the number of the clue (1-based) that first rules out record r, or 0 for the survivor.
   */
  function verify(records, chain, killerIndex) {
    var K = chain.length, n = records.length;
    var elimAt = new Array(n), failCount = new Array(n), onlyFail = new Array(n);
    var checkpoints = new Array(K).fill(0);
    for (var r = 0; r < n; r++) {
      var first = 0, fc = 0, only = -1;
      for (var j = 0; j < K; j++) {
        if (!chain[j].test(records[r])) { fc++; if (!first) first = j + 1; only = j; }
      }
      elimAt[r] = first; failCount[r] = fc; onlyFail[r] = fc === 1 ? only : -1;
      for (var s = 0; s < K; s++) if (!first || first > s + 1) checkpoints[s]++;
    }
    var survivors = [];
    for (var r2 = 0; r2 < n; r2++) if (failCount[r2] === 0) survivors.push(r2);
    var necessary = new Array(K).fill(false);
    for (var r3 = 0; r3 < n; r3++) if (onlyFail[r3] >= 0) necessary[onlyFail[r3]] = true;
    var stepOk = [];
    var before = n;
    for (var k = 0; k < K; k++) { stepOk.push(checkpoints[k] < before); before = checkpoints[k]; }
    var ok = survivors.length === 1 && survivors[0] === killerIndex &&
      stepOk.every(Boolean) && necessary.every(Boolean);
    return {
      ok: ok, survivors: survivors, killerSurvives: failCount[killerIndex] === 0,
      checkpoints: checkpoints, stepOk: stepOk, necessary: necessary, elimAt: elimAt
    };
  }

  /*
   * Builds the whole case. opts: { type, seed, count, venue (the setting id), difficulty, clues }
   * Returns { ok, type, setting, venue, fields, fieldList, places, records (in print order), killerIndex, killer, clues[], check, attempts }
   * or { ok:false, error }.
   */
  function buildCase(opts) {
    var type = LK.types.get(opts.type || 'lottery');
    var setting = type.setting(opts.venue);
    var diff = difficulty(type.id, opts.difficulty);
    var K = U.clamp(opts.clues || diff.clues, 8, 30);
    var stats = { chain: 0, plant: 0, verify: 0 };
    // the lottery keeps its original seeds, so saved books rebuild the same case
    var salt = type.id === 'lottery' ? '' : ':' + type.id;
    for (var attempt = 0; attempt < 40; attempt++) {
      var reg = type.generate(opts.seed, opts.count, setting);
      var rng = U.makeRng('case:' + opts.seed + ':' + opts.difficulty + ':' + K + ':' + attempt + salt);
      var killer = reg.records[rng.int(reg.records.length)];
      var chain = buildChain(type, reg, killer, K, diff, rng);
      if (!chain) { stats.chain++; continue; }
      if (!plantNearMisses(type, reg, killer, chain, rng)) { stats.plant++; continue; }
      reg.records.sort(type.sort(reg));
      type.finalize(reg.records, reg);
      var killerIndex = reg.records.indexOf(killer);
      var check = verify(reg.records, chain, killerIndex);
      if (!check.ok) { stats.verify++; continue; }
      return {
        ok: true, type: type, setting: setting, venue: setting, places: reg.places, fields: reg.fs ? reg.fs.byKey : {}, fieldList: reg.fs ? reg.fs.list : [],
        records: reg.records, killerIndex: killerIndex, killer: killer,
        clues: chain.map(function (c, i) { return { n: i + 1, id: c.id, fam: c.fam, tier: c.tier, sig: c.sig, text: c.text, test: c.test, how: c.how, why: c.why }; }),
        check: check, attempts: attempt + 1, stats: stats, difficulty: diff.label
      };
    }
    return { ok: false, stats: stats, error: 'Could not build a fair case with these settings. Try a different number of clues or records.' };
  }

  // Records that survive the longest without being the answer: good red herrings for the ledger or the cast.
  function lateSurvivors(cs, count, exclude) {
    var idx = [];
    for (var r = 0; r < cs.records.length; r++) {
      if (r === cs.killerIndex || (exclude && exclude.has(r))) continue;
      idx.push(r);
    }
    idx.sort(function (a, b) { return cs.check.elimAt[b] - cs.check.elimAt[a] || a - b; });
    return idx.slice(0, count);
  }

  // A difficulty level for an archive type: some types (a list of names only) carry less
  // information per record, so they set their own clue counts.
  function difficulty(typeId, id) {
    var base = DIFFICULTY[id] || DIFFICULTY.medium;
    var t = LK.types && LK.types.get(typeId);
    var o = t && t.difficulty && t.difficulty[DIFFICULTY[id] ? id : 'medium'];
    return o ? Object.assign({}, base, o) : base;
  }

  LK.clues = {
    DIFFICULTY: DIFFICULTY, difficulty: difficulty, TEMPLATES: T, FAMILIES: FAMILIES,
    buildCase: buildCase, verify: verify, lateSurvivors: lateSurvivors, _buildChain: buildChain,
    helpers: { digitSum: digitSum, hasDouble: hasDouble, hasConsec: hasConsec, evenCount: evenCount, numSum: numSum }
  };
})(typeof window !== 'undefined' ? window : globalThis);
