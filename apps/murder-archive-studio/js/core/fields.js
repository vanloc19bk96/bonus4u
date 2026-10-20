/*
 * Field kinds and the clues they make.
 * An archive type (manifest, guest register, phone records...) only declares its fields; this file
 * turns each field into clue templates, record generators and plain-word explanations:
 *   code    a fixed-length number such as a badge or ticket number ("48213")
 *   int     a number in a range (cabin 100-899, floor 1-12)
 *   ord     ordered labels ($80 < $120 < $180)
 *   enum    labels with no order (occupations, departments, towers)
 *   letter  one letter from a set (deck A-H)
 *   time    minutes after midnight, within opening hours
 *   date    a day of the event, with its weekday
 *   dur     a length of time in seconds, shown as m:ss
 *   name    a first name and a surname
 *   lat/lon a coordinate, in hundredths of a degree
 * Every clue carries test(record), how (one line on how to apply it) and why(record) (what a
 * record shows for this clue, used by the hints and the practice case).
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var U = LK.util, N = LK.names;

  // ---------- small helpers ----------
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function list(arr, word) {
    arr = arr.map(String);
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(', ') + ' ' + (word || 'or') + ' ' + arr[arr.length - 1];
  }
  function q(s) { return '“' + s + '”'; }
  function has(arr, v) { return arr.indexOf(v) !== -1; }
  function C(sig, text, test, how, why) { return { sig: sig, text: text, test: test, how: how, why: why }; }
  function pick(c) { return c.alive[c.rng.int(c.alive.length)]; }
  // True when a condition is true for some records still in play and false for others, so an
  // "if" or "or" clue built on it says more than a plain clue would.
  function splits(c, fn) {
    var t = false, f = false, n = c.alive.length, step = Math.max(1, Math.floor(n / 400));
    for (var i = 0; i < n && !(t && f); i += step) { if (fn(c.alive[i])) t = true; else f = true; }
    return t && f;
  }
  function sample(c, fn, n) { var out = []; for (var k = 0; k < n; k++) out.push(fn(pick(c))); return out; }
  function distinct(rng, pool, n, avoid) {
    var p = pool.filter(function (v) { return !avoid || !avoid(v); });
    rng.shuffle(p);
    return p.slice(0, n);
  }
  function numSort(a, b) { return a - b; }
  // "a 7", "an 8"
  function an(d, capital) { var w = (String(d) === '8' || String(d) === '18' ? 'an ' : 'a ') + d; return capital ? cap(w) : w; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function pad(v, len) { var s = String(v); while (s.length < len) s = '0' + s; return s; }
  var clock = function (m) { return LK.themes.clock(m); };
  function round5Down(m) { return Math.floor(m / 5) * 5; }
  function round5Up(m) { return Math.ceil(m / 5) * 5; }
  function digitSum(s) { var t = 0; for (var i = 0; i < s.length; i++) t += +s[i]; return t; }
  function adjDouble(s) { return /(\d)\1/.test(s); }
  function allDiff(s) { return new Set(s.split('')).size === s.length; }
  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // letters weighted by how often they appear in names, so "contains the letter" clues bite
  var NAME_LETTERS = 'AAAAEEEEEIIIOOORRRRNNNNLLLLSSSTTTDDHHMMCCBBGKPWYUVF';

  // ---------- field definitions ----------
  /*
   * Fills in the defaults of a field. target: { poss: 'the killer’s' } gives the noun phrase.
   */
  function define(f, target) {
    var d = Object.assign({}, f);
    d.get = d.get || function (r) { return r[d.key]; };
    d.np = d.np || (target.poss + ' ' + d.noun);
    d.col = d.col || d.noun.toUpperCase();
    if (d.kind === 'code') d.fmt = d.fmt || function (v) { return (d.prefix || '') + v; };
    else if (d.kind === 'enum' || d.kind === 'ord') d.fmt = d.fmt || function (v) { return d.labels[v]; };
    else if (d.kind === 'time') d.fmt = d.fmt || clock;
    else if (d.kind === 'dur') d.fmt = d.fmt || fmtDur;
    else if (d.kind === 'lat') d.fmt = d.fmt || fmtLat;
    else if (d.kind === 'lon') d.fmt = d.fmt || fmtLon;
    else d.fmt = d.fmt || function (v) { return String(v); };
    d.more = d.more || 'higher';
    d.less = d.less || 'lower';
    return d;
  }

  function fmtDur(s) { return Math.floor(s / 60) + ':' + pad(s % 60, 2); }
  function fmtDeg(v, pos, neg) { return (Math.abs(v) / 100).toFixed(2) + '°' + (v >= 0 ? pos : neg); }
  function fmtLat(v) { return fmtDeg(v, 'N', 'S'); }
  function fmtLon(v) { return fmtDeg(v, 'E', 'W'); }

  // ---------- random values ----------
  function weighted(rng, weights) {
    var r = rng.next() * weights.reduce(function (a, b) { return a + b; }, 0);
    for (var i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
    return weights.length - 1;
  }

  // ctx: per-register values set up once (weights, name pools), see prepare()
  function rand(f, rng, ctx) {
    switch (f.kind) {
      case 'code':
        var s = String(1 + rng.int(9));
        for (var i = 1; i < f.len; i++) s += rng.int(10);
        return s;
      case 'int':
        if (f.rooms) return (1 + rng.int(f.rooms[0])) * 100 + 1 + rng.int(f.rooms[1]);
        return f.min + rng.int(f.max - f.min + 1);
      case 'ord': case 'enum':
        return ctx.weights[f.key] ? weighted(rng, ctx.weights[f.key]) : rng.int(f.labels.length);
      case 'letter': return f.letters[rng.int(f.letters.length)];
      case 'time':
        var span = f.end - f.start;
        if (rng.next() < 0.55) return f.start + rng.int(span + 1);
        var peak = f.start + span * (0.35 + rng.next() * 0.3);
        var v = Math.round(peak + (rng.next() + rng.next() + rng.next() - 1.5) * span * 0.35);
        return Math.max(f.start, Math.min(f.end, v));
      case 'date': return rng.int(f.days);
      case 'dur':
        // most calls are short; a few run long
        var t = rng.next();
        return Math.max(f.min, Math.min(f.max, Math.round(f.min + Math.pow(t, 2.2) * (f.max - f.min))));
      case 'name': return null; // set by setName
      case 'lat': case 'lon': return null; // set by setCoord
    }
    return null;
  }

  function setName(rec, rng, ctx, which) {
    if (which !== 'last') rec.first = ctx.first[rng.int(ctx.first.length)];
    if (which !== 'first') rec.last = N.randomLast(rng);
  }

  function setCoord(rec, rng, ctx) {
    var g = ctx.geo;
    var lat, lon;
    if (rng.next() < g.local) {
      lat = g.lat[0] + rng.int(g.lat[1] - g.lat[0] + 1);
      lon = g.lon[0] + rng.int(g.lon[1] - g.lon[0] + 1);
    } else {
      lat = -4500 + rng.int(11001);
      lon = -12500 + rng.int(27501);
    }
    rec.lat = lat; rec.lon = lon;
  }

  // ---------- clue templates ----------
  // Each returns [{ id, fam, tier, gen(c) }]. c: { rng, k (the answer), alive, n, reg }
  function T(id, fam, tier, gen) { return { id: id, fam: fam, tier: tier, gen: gen }; }

  function codeTemplates(f) {
    var g = f.get, L = f.len, noun = f.noun, NP = cap(f.np);
    var why = function (r) { return 'the ' + noun + ' is ' + f.fmt(g(r)); };
    var out = [];
    out.push(T('code_parity:' + f.key, f.key, 1, function (c) {
      var odd = +g(c.k).slice(-1) % 2 === 1;
      return [C(f.key + 'p' + odd, NP + ' is ' + (odd ? 'odd.' : 'even.'),
        function (r) { return (+g(r).slice(-1) % 2 === 1) === odd; },
        'Only the last digit of the ' + noun + ' decides: 0, 2, 4, 6 and 8 are even; 1, 3, 5, 7 and 9 are odd.',
        function (r) { return 'the ' + noun + ' ' + f.fmt(g(r)) + ' ends in ' + g(r).slice(-1); })];
    }));
    out.push(T('code_has:' + f.key, f.key, 1, function (c) {
      var s = g(c.k);
      return s.split('').filter(function (d, i) { return s.indexOf(d) === i; }).map(function (d) {
        return C(f.key + 'h' + d, NP + ' contains the digit ' + d + '.', function (r) { return g(r).indexOf(d) !== -1; },
          'Read all ' + L + ' digits of the ' + noun + '. ' + an(d, true) + ' anywhere counts.', why);
      });
    }));
    out.push(T('code_hasnot:' + f.key, f.key, 1, function (c) {
      var s = g(c.k);
      return U.range(0, 9).map(String).filter(function (d) { return s.indexOf(d) === -1; }).map(function (d) {
        return C(f.key + 'n' + d, NP + ' does not contain the digit ' + d + '.', function (r) { return g(r).indexOf(d) === -1; },
          'Read all ' + L + ' digits of the ' + noun + '. Cross it out if ' + an(d) + ' appears anywhere.', why);
      });
    }));
    out.push(T('code_first:' + f.key, f.key, 1, function (c) {
      var d0 = +g(c.k)[0], res = [];
      for (var k = 0; k < c.n; k++) {
        var set = [d0].concat(distinct(c.rng, U.range(1, 9), 1 + c.rng.int(4), function (v) { return v === d0; })).sort(numSort);
        (function (set) {
          res.push(C(f.key + 'f' + set.join(''), NP + ' begins with ' + list(set) + '.', function (r) { return has(set, +g(r)[0]); },
            'Only the first digit of the ' + noun + ' matters.', function (r) { return 'the ' + noun + ' ' + f.fmt(g(r)) + ' begins with ' + g(r)[0]; }));
        })(set);
      }
      return res;
    }));
    out.push(T('code_last:' + f.key, f.key, 1, function (c) {
      var d0 = +g(c.k).slice(-1), res = [];
      for (var k = 0; k < c.n; k++) {
        var set = [d0].concat(distinct(c.rng, U.range(0, 9), 1 + c.rng.int(4), function (v) { return v === d0; })).sort(numSort);
        (function (set) {
          res.push(C(f.key + 'l' + set.join(''), NP + ' ends in ' + list(set) + '.', function (r) { return has(set, +g(r).slice(-1)); },
            'Only the last digit of the ' + noun + ' matters.', function (r) { return 'the ' + noun + ' ' + f.fmt(g(r)) + ' ends in ' + g(r).slice(-1); }));
        })(set);
      }
      return res;
    }));
    out.push(T('code_sum:' + f.key, f.key, 2, function (c) {
      var ks = digitSum(g(c.k)), res = [];
      sample(c, function (r) { return digitSum(g(r)); }, c.n).forEach(function (v) {
        if (v <= ks && v > L) res.push(C(f.key + 's+' + v, 'The digits of ' + f.np + ' add up to ' + v + ' or more.', function (r) { return digitSum(g(r)) >= v; },
          'Add up the ' + L + ' digits of the ' + noun + '. A total of exactly ' + v + ' counts.', function (r) { return 'the digits of ' + f.fmt(g(r)) + ' add up to ' + digitSum(g(r)); }));
        if (v >= ks && v < L * 8) res.push(C(f.key + 's-' + v, 'The digits of ' + f.np + ' add up to ' + v + ' or less.', function (r) { return digitSum(g(r)) <= v; },
          'Add up the ' + L + ' digits of the ' + noun + '. A total of exactly ' + v + ' counts.', function (r) { return 'the digits of ' + f.fmt(g(r)) + ' add up to ' + digitSum(g(r)); }));
      });
      return res;
    }));
    out.push(T('code_double:' + f.key, f.key, 2, function (c) {
      var yes = adjDouble(g(c.k));
      return [C(f.key + 'd' + yes, yes ? NP + ' has two identical digits side by side (like the 44 in 12447).'
        : NP + ' has no identical digits side by side (no pair like the 44 in 12447).',
        function (r) { return adjDouble(g(r)) === yes; },
        'Look for two identical digits next to each other. Identical digits apart from each other, like the two 1s in 12145, do not count.', why)];
    }));
    out.push(T('code_alldiff:' + f.key, f.key, 2, function (c) {
      var yes = allDiff(g(c.k));
      return [C(f.key + 'a' + yes, yes ? 'All ' + L + ' digits of ' + f.np + ' are different.' : 'At least one digit appears twice in ' + f.np + '.',
        function (r) { return allDiff(g(r)) === yes; },
        yes ? 'If any digit appears more than once, anywhere in the ' + noun + ', cross it out.' : 'Keep the ' + noun + ' only if some digit appears at least twice.', why)];
    }));
    out.push(T('code_firstlast:' + f.key, f.key, 2, function (c) {
      var s = g(c.k), a = +s[0], b = +s.slice(-1), rel = a > b ? 1 : a < b ? -1 : 0;
      var text = rel > 0 ? 'The first digit of ' + f.np + ' is larger than its last digit.'
        : rel < 0 ? 'The first digit of ' + f.np + ' is smaller than its last digit.' : NP + ' begins and ends with the same digit.';
      return [C(f.key + 'r' + rel, text, function (r) { var t = g(r), x = +t[0], y = +t.slice(-1); return (x > y ? 1 : x < y ? -1 : 0) === rel; },
        'Compare only the first and the last digit of the ' + noun + '.', function (r) { return 'the ' + noun + ' ' + f.fmt(g(r)) + ' begins with ' + g(r)[0] + ' and ends with ' + g(r).slice(-1); })];
    }));
    if (L >= 3) out.push(T('code_div3:' + f.key, f.key, 2, function (c) {
      var yes = digitSum(g(c.k)) % 3 === 0;
      return [C(f.key + '3' + yes, yes ? NP + ' is divisible by 3 (its digits add up to a multiple of 3).' : NP + ' is not divisible by 3 (its digits do not add up to a multiple of 3).',
        function (r) { return (digitSum(g(r)) % 3 === 0) === yes; },
        'Add up the digits. If the total divides by 3 (3, 6, 9, 12, 15 …), so does the number.', function (r) { return 'the digits of ' + f.fmt(g(r)) + ' add up to ' + digitSum(g(r)); })];
    }));
    return out;
  }

  function intTemplates(f) {
    var g = f.get, noun = f.noun, NP = cap(f.np), span = f.max - f.min;
    var why = function (r) { return 'the ' + noun + ' is ' + f.fmt(g(r)); };
    var out = [];
    if (!f.noParity) out.push(T('int_parity:' + f.key, f.key, 1, function (c) {
      var even = g(c.k) % 2 === 0;
      return [C(f.key + 'p' + even, NP + ' is ' + (even ? 'even.' : 'odd.'), function (r) { return (g(r) % 2 === 0) === even; },
        f.max < 10 ? 'Look only at the ' + f.col + ' column. 2, 4, 6 and 8 are even; 1, 3, 5, 7 and 9 are odd.'
          : 'Only the last digit of the ' + noun + ' decides: 0, 2, 4, 6 and 8 are even.', why)];
    }));
    out.push(T('int_ge:' + f.key, f.key, 1, function (c) {
      var kv = g(c.k);
      return sample(c, g, c.n).filter(function (v) { return v <= kv && v > f.min; }).map(function (v) {
        return C(f.key + 'g' + v, NP + ' is ' + f.fmt(v) + ' or ' + f.more + '.', function (r) { return g(r) >= v; },
          'Look only at the ' + noun + '. ' + f.fmt(v) + ' itself counts.', why);
      });
    }));
    out.push(T('int_le:' + f.key, f.key, 1, function (c) {
      var kv = g(c.k);
      return sample(c, g, c.n).filter(function (v) { return v >= kv && v < f.max; }).map(function (v) {
        return C(f.key + 'l' + v, NP + ' is ' + f.fmt(v) + ' or ' + f.less + '.', function (r) { return g(r) <= v; },
          'Look only at the ' + noun + '. ' + f.fmt(v) + ' itself counts.', why);
      });
    }));
    out.push(T('int_between:' + f.key, f.key, 2, function (c) {
      var kv = g(c.k), res = [];
      for (var k = 0; k < c.n; k++) {
        var a = g(pick(c)), b = g(pick(c));
        if (a > b) { var t = a; a = b; b = t; }
        if (a > kv || b < kv || b - a < span * 0.12 || (a <= f.min && b >= f.max)) continue;
        (function (a, b) {
          res.push(C(f.key + 'b' + a + '-' + b, NP + ' is between ' + f.fmt(a) + ' and ' + f.fmt(b) + ', both included.',
            function (r) { var v = g(r); return v >= a && v <= b; }, 'Look only at the ' + noun + '. ' + f.fmt(a) + ' and ' + f.fmt(b) + ' both count.', why));
        })(a, b);
      }
      return res;
    }));
    if (span <= 80) out.push(T('int_not:' + f.key, f.key, 2, function (c) {
      var res = [], kv = g(c.k);
      for (var k = 0; k < Math.ceil(c.n / 2); k++) {
        var picks = distinct(c.rng, U.range(f.min, f.max), 3 + c.rng.int(3), function (v) { return v === kv; }).sort(numSort);
        (function (picks) {
          res.push(C(f.key + 'x' + picks.join('.'), NP + ' is not ' + list(picks.map(f.fmt)) + '.', function (r) { return !has(picks, g(r)); },
            'Look only at the ' + noun + '. Cross out the values named in the clue.', why));
        })(picks);
      }
      return res;
    }));
    if (f.max >= 12) out.push(T('int_mult:' + f.key, f.key, 2, function (c) {
      var kv = g(c.k);
      return [3, 4, 5].map(function (m) {
        var yes = kv % m === 0;
        return C(f.key + 'm' + m + yes, NP + ' is ' + (yes ? '' : 'not ') + 'a multiple of ' + m + '.', function (r) { return (g(r) % m === 0) === yes; },
          'A multiple of ' + m + ' divides by ' + m + ' with nothing left over: ' + [1, 2, 3, 4].map(function (i) { return i * m; }).join(', ') + ' and so on.', why);
      });
    }));
    if (f.max >= 10) out.push(T('int_digit:' + f.key, f.key, 2, function (c) {
      var res = [], ks = String(g(c.k));
      for (var k = 0; k < 3; k++) {
        var d = String(c.rng.int(10)), yes = ks.indexOf(d) !== -1;
        (function (d, yes) {
          res.push(C(f.key + 'd' + d + yes, NP + ' ' + (yes ? 'contains' : 'does not contain') + ' the digit ' + d + '.',
            function (r) { return (String(g(r)).indexOf(d) !== -1) === yes; }, 'Check every digit of the ' + noun + ': 13 contains the digits 1 and 3.', why));
        })(d, yes);
      }
      return res;
    }));
    if (f.min >= 100) {
      out.push(T('int_first:' + f.key, f.key, 1, function (c) {
        var d0 = +String(g(c.k))[0], res = [];
        var firsts = U.range(+String(f.min)[0], +String(f.max)[0]);
        for (var k = 0; k < c.n; k++) {
          var set = [d0].concat(distinct(c.rng, firsts, 1 + c.rng.int(3), function (v) { return v === d0; })).sort(numSort);
          if (set.length >= firsts.length) continue;
          (function (set) {
            res.push(C(f.key + 'f' + set.join(''), NP + ' begins with ' + list(set) + '.', function (r) { return has(set, +String(g(r))[0]); },
              'Only the first digit of the ' + noun + ' matters.', function (r) { return 'the ' + noun + ' ' + f.fmt(g(r)) + ' begins with ' + String(g(r))[0]; }));
          })(set);
        }
        return res;
      }));
      out.push(T('int_alldiff:' + f.key, f.key, 2, function (c) {
        var yes = allDiff(String(g(c.k)));
        return [C(f.key + 'a' + yes, yes ? 'All the digits of ' + f.np + ' are different.' : 'A digit repeats in ' + f.np + '.',
          function (r) { return allDiff(String(g(r))) === yes; },
          yes ? 'If any digit of the ' + noun + ' repeats, cross it out: 105 passes, 101 does not.' : 'Keep the ' + noun + ' only if a digit repeats: 101 passes, 105 does not.', why)];
      }));
    }
    return out;
  }

  // what an ordered or unordered label says, in a sentence
  function say(f, kind, a, b) {
    var s = f.say || {};
    if (kind === 'is') return s.is ? s.is.replace('{v}', a) : cap(f.np) + ' is ' + q(a) + '.';
    if (kind === 'not') return s.not ? s.not.replace('{v}', a) : cap(f.np) + ' is not ' + q(a) + '.';
    if (kind === 'neither') return s.neither ? s.neither.replace('{a}', a).replace('{b}', b) : cap(f.np) + ' is neither ' + q(a) + ' nor ' + q(b) + '.';
    if (kind === 'cond') return s.cond ? s.cond.replace('{v}', a) : f.np + ' is ' + (f.kind === 'ord' ? a : q(a));
    return '';
  }

  function enumTemplates(f) {
    var g = f.get, n = f.labels.length, noun = f.noun;
    var why = function (r) { return 'the ' + noun + ' is ' + f.labels[g(r)]; };
    var look = 'Look only at the ' + f.col + ' column.';
    var out = [];
    out.push(T('enum_is:' + f.key, f.key, 1, function (c) {
      var m = g(c.k);
      return [C(f.key + 'i' + m, say(f, 'is', f.labels[m]), function (r) { return g(r) === m; }, look + ' One word to compare on each row.', why)];
    }));
    out.push(T('enum_not:' + f.key, f.key, 1, function (c) {
      var m = g(c.k);
      return U.range(0, n - 1).filter(function (v) { return v !== m; }).map(function (v) {
        return C(f.key + 'x' + v, say(f, 'not', f.labels[v]), function (r) { return g(r) !== v; }, look + ' Cross out every ' + q(f.labels[v]) + '.', why);
      });
    }));
    if (n >= 4) out.push(T('enum_neither:' + f.key, f.key, 2, function (c) {
      var o = U.range(0, n - 1).filter(function (v) { return v !== g(c.k); }), res = [];
      for (var a = 0; a < o.length; a++) for (var b = a + 1; b < o.length; b++) {
        (function (x, y) {
          res.push(C(f.key + 'z' + x + '.' + y, say(f, 'neither', f.labels[x], f.labels[y]), function (r) { var v = g(r); return v !== x && v !== y; },
            look + ' Cross out both labels named in the clue.', why));
        })(o[a], o[b]);
      }
      return res;
    }));
    if (f.words) {
      var word = function (r) { return N.facts(f.labels[g(r)]); };
      out.push(T('enum_wlen:' + f.key, f.key, 2, function (c) {
        var kl = word(c.k).len, res = [];
        U.range(4, 11).forEach(function (v) {
          if (v <= kl) res.push(C(f.key + 'L+' + v, 'The word for ' + f.np + ' has ' + v + ' or more letters.', function (r) { return word(r).len >= v; },
            'Count the letters of the ' + noun + ' word itself. ' + v + ' letters count.', function (r) { return f.labels[g(r)] + ' has ' + word(r).len + ' letters'; }));
          if (v >= kl) res.push(C(f.key + 'L-' + v, 'The word for ' + f.np + ' has ' + v + ' or fewer letters.', function (r) { return word(r).len <= v; },
            'Count the letters of the ' + noun + ' word itself. ' + v + ' letters count.', function (r) { return f.labels[g(r)] + ' has ' + word(r).len + ' letters'; }));
        });
        return res;
      }));
      out.push(T('enum_wlet:' + f.key, f.key, 2, function (c) {
        var res = [];
        for (var k = 0; k < 3; k++) {
          var L = NAME_LETTERS[c.rng.int(NAME_LETTERS.length)], yes = N.letterIn(word(c.k), L);
          (function (L, yes) {
            res.push(C(f.key + 'w' + L + yes, 'The word for ' + f.np + ' ' + (yes ? 'contains' : 'does not contain') + ' the letter ' + L + '.',
              function (r) { return N.letterIn(word(r), L) === yes; }, 'Spell out the ' + noun + ' and look for the letter ' + L + '.', function (r) { return 'the ' + noun + ' is ' + f.labels[g(r)]; }));
          })(L, yes);
        }
        return res;
      }));
    }
    return out;
  }

  function ordTemplates(f) {
    var g = f.get, n = f.labels.length, noun = f.noun;
    var why = function (r) { return 'the ' + noun + ' is ' + f.labels[g(r)]; };
    var look = 'Look only at the ' + f.col + ' column.';
    var out = [];
    out.push(T('ord_ge:' + f.key, f.key, 1, function (c) {
      var res = [];
      for (var a = 1; a <= g(c.k); a++) (function (a) {
        res.push(C(f.key + 'g' + a, cap(f.np) + ' is ' + f.labels[a] + ' or ' + f.more + '.', function (r) { return g(r) >= a; }, look + ' ' + f.labels[a] + ' itself counts.', why));
      })(a);
      return res;
    }));
    out.push(T('ord_le:' + f.key, f.key, 1, function (c) {
      var res = [];
      for (var a = g(c.k); a < n - 1; a++) (function (a) {
        res.push(C(f.key + 'l' + a, cap(f.np) + ' is ' + f.labels[a] + ' or ' + f.less + '.', function (r) { return g(r) <= a; }, look + ' ' + f.labels[a] + ' itself counts.', why));
      })(a);
      return res;
    }));
    out.push(T('ord_not:' + f.key, f.key, 1, function (c) {
      return U.range(0, n - 1).filter(function (v) { return v !== g(c.k); }).map(function (v) {
        return C(f.key + 'x' + v, cap(f.np) + ' is not ' + f.labels[v] + '.', function (r) { return g(r) !== v; }, look + ' Cross out every ' + f.labels[v] + '.', why);
      });
    }));
    return out;
  }

  function letterTemplates(f) {
    var g = f.get, noun = f.noun, NP = cap(f.np), Ls = f.letters.split('');
    var why = function (r) { return 'the ' + noun + ' is ' + g(r); };
    var out = [];
    out.push(T('let_in:' + f.key, f.key, 1, function (c) {
      var kv = g(c.k), res = [];
      for (var k = 0; k < c.n; k++) {
        var set = [kv].concat(distinct(c.rng, Ls, 1 + c.rng.int(3), function (v) { return v === kv; })).sort();
        if (set.length >= Ls.length - 1) continue;
        (function (set) {
          res.push(C(f.key + 'i' + set.join(''), NP + ' is ' + list(set) + '.', function (r) { return has(set, g(r)); },
            'Look only at the ' + noun + '. Every other letter is crossed out.', why));
        })(set);
      }
      return res;
    }));
    out.push(T('let_not:' + f.key, f.key, 1, function (c) {
      var kv = g(c.k);
      return Ls.filter(function (v) { return v !== kv; }).map(function (v) {
        return C(f.key + 'x' + v, NP + ' is not ' + v + '.', function (r) { return g(r) !== v; }, 'Look only at the ' + noun + '.', why);
      });
    }));
    out.push(T('let_order:' + f.key, f.key, 1, function (c) {
      var kv = g(c.k), res = [];
      Ls.forEach(function (L) {
        if (L > kv) res.push(C(f.key + '<' + L, NP + ' comes before ' + L + ' in the alphabet.', function (r) { return g(r) < L; },
          'Look only at the ' + noun + '. ' + L + ' itself does not count.', why));
        if (L < kv) res.push(C(f.key + '>' + L, NP + ' comes after ' + L + ' in the alphabet.', function (r) { return g(r) > L; },
          'Look only at the ' + noun + '. ' + L + ' itself does not count.', why));
      });
      return res;
    }));
    return out;
  }

  function timeTemplates(f) {
    var g = f.get, V = f.verb, VN = f.verbNot;
    var why = function (r) { return 'the ' + f.noun + ' is ' + clock(g(r)); };
    var look = 'Look only at the ' + f.col + ' column. Times run through the day, so 11:59 AM comes just before 12:00 PM (noon).';
    var out = [];
    out.push(T('time_after:' + f.key, f.key, 1, function (c) {
      var kv = g(c.k);
      return sample(c, function (r) { return round5Down(g(r)); }, c.n).filter(function (v) { return v <= kv && v > f.start; }).map(function (v) {
        return C(f.key + 'a' + v, V + ' at ' + clock(v) + ' or later.', function (r) { return g(r) >= v; }, look + ' ' + clock(v) + ' itself counts.', why);
      });
    }));
    out.push(T('time_before:' + f.key, f.key, 1, function (c) {
      var kv = g(c.k);
      return sample(c, function (r) { return round5Up(g(r)); }, c.n).filter(function (v) { return v >= kv && v < f.end; }).map(function (v) {
        return C(f.key + 'b' + v, V + ' at ' + clock(v) + ' or earlier.', function (r) { return g(r) <= v; }, look + ' ' + clock(v) + ' itself counts.', why);
      });
    }));
    out.push(T('time_between:' + f.key, f.key, 2, function (c) {
      var kv = g(c.k), res = [];
      for (var k = 0; k < c.n; k++) {
        var a = round5Down(g(pick(c))), b = round5Up(g(pick(c)));
        if (a > kv || b < kv || b - a < 30 || (a <= f.start && b >= f.end)) continue;
        (function (a, b) {
          res.push(C(f.key + 'w' + a + '-' + b, V + ' between ' + clock(a) + ' and ' + clock(b) + ', both times included.',
            function (r) { var v = g(r); return v >= a && v <= b; }, look + ' Both times named in the clue count.', why));
        })(a, b);
      }
      return res;
    }));
    out.push(T('time_notbetween:' + f.key, f.key, 2, function (c) {
      var kv = g(c.k), res = [];
      for (var k = 0; k < c.n; k++) {
        var x = round5Down(g(pick(c))), y = round5Up(g(pick(c))), a = Math.min(x, y), b = Math.max(x, y);
        if (b - a < 20 || (kv >= a && kv <= b)) continue;
        (function (a, b) {
          res.push(C(f.key + 'n' + a + '-' + b, VN + ' between ' + clock(a) + ' and ' + clock(b) + ' (both times included).',
            function (r) { var v = g(r); return v < a || v > b; }, look + ' Cross out every time from ' + clock(a) + ' to ' + clock(b) + '.', why));
        })(a, b);
      }
      return res;
    }));
    out.push(T('time_hour:' + f.key, f.key, 1, function (c) {
      var kh = Math.floor(g(c.k) / 60), res = [];
      for (var hh = Math.floor(f.start / 60); hh <= Math.floor(f.end / 60); hh++) {
        if (hh === kh) continue;
        (function (hh) {
          res.push(C(f.key + 'h' + hh, VN + ' between ' + clock(hh * 60) + ' and ' + clock(hh * 60 + 59) + '.',
            function (r) { return Math.floor(g(r) / 60) !== hh; }, look + ' A whole hour is ruled out: every time from :00 to :59.', why));
        })(hh);
      }
      return res;
    }));
    out.push(T('time_parity:' + f.key, f.key, 2, function (c) {
      var odd = (g(c.k) % 60) % 2 === 1;
      return [C(f.key + 'p' + odd, 'The minutes of ' + f.np + ' end in an ' + (odd ? 'odd digit (as in 9:47).' : 'even digit (as in 9:46).'),
        function (r) { return ((g(r) % 60) % 2 === 1) === odd; }, 'Only the last digit of the minutes matters: 9:47 ends in 7, which is odd. The hour makes no difference.', why)];
    }));
    out.push(T('time_round:' + f.key, f.key, 2, function (c) {
      var round = (g(c.k) % 5) === 0;
      return [C(f.key + 'r' + round, round ? 'The minutes of ' + f.np + ' end in 0 or 5 (as in 9:45).' : 'The minutes of ' + f.np + ' do not end in 0 or 5.',
        function (r) { return ((g(r) % 5) === 0) === round; }, 'Only the last digit of the minutes matters. 0 and 5 are “round”; every other digit is not.', why)];
    }));
    return out;
  }

  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function dateTemplates(f) {
    var g = f.get, V = f.verb, VN = f.verbNot;
    var wd = function (r) { return f.weekday(g(r)); };
    var why = function (r) { return 'the ' + f.noun + ' is ' + f.fmt(g(r)); };
    var look = 'Look only at the ' + f.col + ' column.';
    var out = [];
    out.push(T('date_after:' + f.key, f.key, 1, function (c) {
      var kv = g(c.k);
      return sample(c, g, c.n).filter(function (v) { return v <= kv && v > 0; }).map(function (v) {
        return C(f.key + 'a' + v, V + ' on ' + f.long(v) + ' or later.', function (r) { return g(r) >= v; }, look + ' ' + f.long(v) + ' itself counts.', why);
      });
    }));
    out.push(T('date_before:' + f.key, f.key, 1, function (c) {
      var kv = g(c.k);
      return sample(c, g, c.n).filter(function (v) { return v >= kv && v < f.days - 1; }).map(function (v) {
        return C(f.key + 'b' + v, V + ' on ' + f.long(v) + ' or earlier.', function (r) { return g(r) <= v; }, look + ' ' + f.long(v) + ' itself counts.', why);
      });
    }));
    out.push(T('date_weekend:' + f.key, f.key, 2, function (c) {
      var yes = wd(c.k) === 0 || wd(c.k) === 6;
      return [C(f.key + 'e' + yes, (yes ? V : VN) + ' on a weekend (a Saturday or a Sunday).', function (r) { var d = wd(r); return (d === 0 || d === 6) === yes; },
        look + ' The day of the week is printed before each date.', function (r) { return 'the ' + f.noun + ' is ' + f.fmt(g(r)) + ', a ' + WEEKDAYS[wd(r)]; })];
    }));
    out.push(T('date_wdnot:' + f.key, f.key, 2, function (c) {
      var res = [];
      for (var k = 0; k < 3; k++) {
        var set = distinct(c.rng, U.range(0, 6), 2, function (v) { return v === wd(c.k); }).sort(numSort);
        (function (set) {
          res.push(C(f.key + 'w' + set.join(''), VN + ' on a ' + set.map(function (d) { return WEEKDAYS[d]; }).join(' or a ') + '.', function (r) { return !has(set, wd(r)); },
            look + ' The day of the week is printed before each date.', function (r) { return 'the ' + f.noun + ' is ' + f.fmt(g(r)) + ', a ' + WEEKDAYS[wd(r)]; }));
        })(set);
      }
      return res;
    }));
    return out;
  }

  function durTemplates(f) {
    var g = f.get;
    var why = function (r) { return 'the ' + f.noun + ' is ' + fmtDur(g(r)); };
    var look = 'Look only at the ' + f.col + ' column. 2:05 means two minutes and five seconds.';
    var out = [];
    out.push(T('dur_ge:' + f.key, f.key, 1, function (c) {
      var kv = g(c.k);
      return sample(c, function (r) { return Math.floor(g(r) / 15) * 15; }, c.n).filter(function (v) { return v <= kv && v > f.min; }).map(function (v) {
        return C(f.key + 'g' + v, f.subj + ' lasted ' + fmtDur(v) + ' or longer.', function (r) { return g(r) >= v; }, look + ' Exactly ' + fmtDur(v) + ' counts.', why);
      });
    }));
    out.push(T('dur_le:' + f.key, f.key, 1, function (c) {
      var kv = g(c.k);
      return sample(c, function (r) { return Math.ceil(g(r) / 15) * 15; }, c.n).filter(function (v) { return v >= kv && v < f.max; }).map(function (v) {
        return C(f.key + 'l' + v, f.subj + ' lasted ' + fmtDur(v) + ' or less.', function (r) { return g(r) <= v; }, look + ' Exactly ' + fmtDur(v) + ' counts.', why);
      });
    }));
    out.push(T('dur_parity:' + f.key, f.key, 2, function (c) {
      var odd = g(c.k) % 2 === 1;
      return [C(f.key + 'p' + odd, 'The seconds of ' + f.np + ' end in an ' + (odd ? 'odd digit (as in 2:37).' : 'even digit (as in 2:36).'),
        function (r) { return (g(r) % 2 === 1) === odd; }, look + ' Only the very last digit matters.', why)];
    }));
    out.push(T('dur_min:' + f.key, f.key, 2, function (c) {
      var km = Math.floor(g(c.k) / 60), res = [];
      for (var k = 0; k < 3; k++) {
        var m = Math.floor(g(pick(c)) / 60);
        if (m === km) continue;
        (function (m) {
          res.push(C(f.key + 'm' + m, f.subj + ' did not last between ' + m + ':00 and ' + m + ':59.', function (r) { return Math.floor(g(r) / 60) !== m; },
            look + ' Cross out every length that starts with ' + m + ':.', why));
        })(m);
      }
      return res;
    }));
    return out;
  }

  // ---------- names ----------
  function nameTemplates(f, target) {
    var P = target.poss, who = target.who;
    var FN = P + ' first name', LN = P + ' surname';
    var fi = function (r) { return N.facts(r.first); }, la = function (r) { return N.facts(r.last); };
    var full = function (r) { return r.first + ' ' + r.last; };
    var out = [];
    function lenWord(n) { return n + ' letter' + (n === 1 ? '' : 's'); }

    // which letters a range clue can use: a span around the answer's letter that leaves letters out on both sides
    function range(c, L) {
      var i = ALPHA.indexOf(L), lo = Math.max(0, i - 2 - c.rng.int(10)), hi = Math.min(25, i + 2 + c.rng.int(10));
      if (lo === 0 && hi === 25) { if (c.rng.int(2)) lo = 1 + c.rng.int(Math.max(1, i)); else hi = Math.max(i, 25 - 1 - c.rng.int(4)); }
      return [ALPHA[lo], ALPHA[hi]];
    }
    [['nf', FN, fi, 'first name', 'first'], ['nl', LN, la, 'surname', 'last']].forEach(function (part) {
      var id = part[0], NP = part[1], get = part[2], noun = part[3], prop = part[4];
      var whyWord = function (r) { return 'the ' + noun + ' ' + r[prop]; };
      out.push(T(id + '_init:' + f.key, id + 'i', 1, function (c) {
        var res = [];
        for (var k = 0; k < c.n; k++) {
          var rg = range(c, get(c.k).first);
          (function (a, b) {
            res.push(C(id + 'i' + a + b, cap(NP) + ' begins with a letter from ' + a + ' to ' + b + '.', function (r) { var L = get(r).first; return L >= a && L <= b; },
              'Look only at the first letter of the ' + noun + '. ' + a + ' and ' + b + ' both count.', function (r) { return whyWord(r) + ' begins with ' + get(r).first; }));
          })(rg[0], rg[1]);
        }
        return res;
      }));
      out.push(T(id + '_len:' + f.key, id + 'n', 1, function (c) {
        var kl = get(c.k).len, res = [];
        sample(c, function (r) { return get(r).len; }, c.n).forEach(function (v) {
          if (v <= kl && v > 3) res.push(C(id + 'n+' + v, cap(NP) + ' has ' + v + ' or more letters.', function (r) { return get(r).len >= v; },
            'Count the letters of the ' + noun + '. Exactly ' + v + ' counts.', function (r) { return whyWord(r) + ' has ' + lenWord(get(r).len); }));
          if (v >= kl && v < 10) res.push(C(id + 'n-' + v, cap(NP) + ' has ' + v + ' or fewer letters.', function (r) { return get(r).len <= v; },
            'Count the letters of the ' + noun + '. Exactly ' + v + ' counts.', function (r) { return whyWord(r) + ' has ' + lenWord(get(r).len); }));
        });
        return res;
      }));
      out.push(T(id + '_let:' + f.key, id + 'l', 1, function (c) {
        var res = [];
        for (var k = 0; k < 4; k++) {
          var L = NAME_LETTERS[c.rng.int(NAME_LETTERS.length)], yes = N.letterIn(get(c.k), L);
          (function (L, yes) {
            res.push(C(id + 'l' + L + yes, cap(NP) + (yes ? ' contains the letter ' : ' does not contain the letter ') + L + '.',
              function (r) { return N.letterIn(get(r), L) === yes; }, 'Read every letter of the ' + noun + ', not just the first one.', function (r) { return 'the ' + noun + ' is ' + r[prop]; }));
          })(L, yes);
        }
        return res;
      }));
      out.push(T(id + '_vow:' + f.key, id + 'v', 2, function (c) {
        var kv = get(c.k).vowels, res = [];
        res.push(C(id + 'v=' + kv, cap(NP) + ' contains exactly ' + kv + ' vowel' + (kv === 1 ? '' : 's') + '.', function (r) { return get(r).vowels === kv; },
          'Count the vowels A, E, I, O and U in the ' + noun + ' (Y is not a vowel). Count repeats: ANNA has 2.', function (r) { return whyWord(r) + ' has ' + get(r).vowels + ' vowels'; }));
        if (kv >= 2) res.push(C(id + 'v+' + kv, cap(NP) + ' contains at least ' + kv + ' vowels.', function (r) { return get(r).vowels >= kv; },
          'Count the vowels A, E, I, O and U in the ' + noun + ' (Y is not a vowel). Count repeats: ANNA has 2.', function (r) { return whyWord(r) + ' has ' + get(r).vowels + ' vowels'; }));
        if (kv <= 3) res.push(C(id + 'v-' + kv, cap(NP) + ' contains at most ' + kv + ' vowel' + (kv === 1 ? '' : 's') + '.', function (r) { return get(r).vowels <= kv; },
          'Count the vowels A, E, I, O and U in the ' + noun + ' (Y is not a vowel). Count repeats: ANNA has 2.', function (r) { return whyWord(r) + ' has ' + get(r).vowels + ' vowels'; }));
        return res;
      }));
      out.push(T(id + '_end:' + f.key, id + 'e', 1, function (c) {
        var kl = get(c.k).last, res = [], isV = N.VOWELS.indexOf(kl) !== -1;
        res.push(C(id + 'ev' + isV, cap(NP) + (isV ? ' ends in a vowel (A, E, I, O or U).' : ' does not end in a vowel (A, E, I, O or U).'),
          function (r) { return (N.VOWELS.indexOf(get(r).last) !== -1) === isV; }, 'Look only at the last letter of the ' + noun + '. Y is not a vowel.', function (r) { return whyWord(r) + ' ends in ' + get(r).last; }));
        for (var k = 0; k < 2; k++) {
          var set = [kl].concat(distinct(c.rng, 'ADEHKLNRSTY'.split(''), 2, function (v) { return v === kl; })).sort();
          (function (set) {
            res.push(C(id + 'e' + set.join(''), cap(NP) + ' ends in ' + list(set) + '.', function (r) { return has(set, get(r).last); },
              'Look only at the last letter of the ' + noun + '.', function (r) { return whyWord(r) + ' ends in ' + get(r).last; }));
          })(set);
        }
        return res;
      }));
    });
    out.push(T('nl_dbl:' + f.key, 'nld', 2, function (c) {
      var yes = la(c.k).dbl;
      return [C('nld' + yes, yes ? cap(LN) + ' has two identical letters side by side (like the LL in Russell).' : cap(LN) + ' has no identical letters side by side (no pair like the LL in Russell).',
        function (r) { return la(r).dbl === yes; }, 'Look for the same letter twice in a row in the surname. Letters apart from each other do not count.',
        function (r) { return 'the surname is ' + r.last; })];
    }));
    out.push(T('nl_rep:' + f.key, 'nlr', 2, function (c) {
      var few = la(c.k).rep <= 1;
      return [C('nlr' + few, few ? 'At most one kind of letter repeats in ' + LN + '.' : 'At least two different letters repeat in ' + LN + '.',
        function (r) { return (la(r).rep <= 1) === few; },
        'A letter “repeats” when it appears more than once anywhere in the surname. FENN passes (only N repeats); MERRITT has two (R and T).',
        function (r) { return 'the surname is ' + r.last; })];
    }));
    out.push(T('nb_same:' + f.key, 'nbs', 2, function (c) {
      var same = fi(c.k).first === la(c.k).first;
      return [C('nbs' + same, same ? cap(P) + ' first name and surname begin with the same letter.' : cap(P) + ' first name and surname begin with different letters.',
        function (r) { return (fi(r).first === la(r).first) === same; }, 'Compare the two initials only.', function (r) { return 'the initials are ' + fi(r).first + '. ' + la(r).first + '.'; })];
    }));
    out.push(T('nb_order:' + f.key, 'nbo', 2, function (c) {
      var a = fi(c.k).first, b = la(c.k).first;
      if (a === b) return [];
      var before = a < b;
      return [C('nbo' + before, 'The first letter of ' + FN + ' comes ' + (before ? 'earlier' : 'later') + ' in the alphabet than the first letter of the surname.',
        function (r) { var x = fi(r).first, y = la(r).first; return before ? x < y : x > y; }, 'Compare the two initials only. The same letter twice does not pass.',
        function (r) { return 'the initials are ' + fi(r).first + '. ' + la(r).first + '.'; })];
    }));
    out.push(T('nb_len:' + f.key, 'nbl', 2, function (c) {
      var a = fi(c.k).len, b = la(c.k).len, rel = a > b ? 1 : a < b ? -1 : 0;
      var text = rel > 0 ? cap(FN) + ' is longer than the surname.' : rel < 0 ? cap(FN) + ' is shorter than the surname.' : cap(FN) + ' and surname have the same number of letters.';
      return [C('nbl' + rel, text, function (r) { var x = fi(r).len, y = la(r).len; return (x > y ? 1 : x < y ? -1 : 0) === rel; },
        'Count the letters of each name and compare.', function (r) { return r.first + ' has ' + lenWord(fi(r).len) + ' and ' + r.last + ' has ' + lenWord(la(r).len); })];
    }));
    out.push(T('nb_share:' + f.key, 'nbh', 2, function (c) {
      var s = N.shared(fi(c.k), la(c.k)), res = [];
      if (s === 0) res.push(C('nbh0', cap(FN) + ' and surname share no letters at all.', function (r) { return N.shared(fi(r), la(r)) === 0; },
        'Check each letter of the first name against the surname. One shared letter is enough to cross the name out.', function (r) { return 'the name is ' + full(r); }));
      else {
        res.push(C('nbh1', cap(FN) + ' and surname share at least one letter.', function (r) { return N.shared(fi(r), la(r)) >= 1; },
          'Look for any letter that appears in both names.', function (r) { return 'the name is ' + full(r); }));
        if (s >= 2) res.push(C('nbh2', cap(FN) + ' and surname share at least two different letters.', function (r) { return N.shared(fi(r), la(r)) >= 2; },
          'Count shared letter kinds, not repeats: EDGAR and GRANT share G, A and R.', function (r) { return 'the name is ' + full(r); }));
        if (s <= 2) res.push(C('nbh-' + s, cap(FN) + ' and surname share at most ' + (s === 1 ? 'one letter' : 'two different letters') + '.', function (r) { return N.shared(fi(r), la(r)) <= s; },
          'Count shared letter kinds, not repeats: EDGAR and GRANT share G, A and R (three).', function (r) { return 'the name is ' + full(r); }));
      }
      return res;
    }));
    out.push(T('nb_initin:' + f.key, 'nbi', 2, function (c) {
      var yes = N.letterIn(fi(c.k), la(c.k).first);
      return [C('nbi' + yes, 'The first letter of ' + LN + (yes ? ' also appears in the first name.' : ' does not appear anywhere in the first name.'),
        function (r) { return N.letterIn(fi(r), la(r).first) === yes; }, 'Take the surname’s first letter and look for it in the first name.',
        function (r) { return 'the name is ' + full(r); })];
    }));
    out.push(T('nb_endin:' + f.key, 'nbe', 2, function (c) {
      var yes = N.letterIn(la(c.k), fi(c.k).last);
      return [C('nbe' + yes, 'The last letter of ' + FN + (yes ? ' also appears in the surname.' : ' does not appear anywhere in the surname.'),
        function (r) { return N.letterIn(la(r), fi(r).last) === yes; }, 'Take the last letter of the first name and look for it in the surname.',
        function (r) { return 'the name is ' + full(r); })];
    }));
    out.push(T('nl_vstart:' + f.key, 'nlb', 1, function (c) {
      var yes = N.VOWELS.indexOf(la(c.k).first) !== -1;
      return [C('nlb' + yes, cap(LN) + (yes ? ' begins with a vowel (A, E, I, O or U).' : ' does not begin with a vowel (A, E, I, O or U).'),
        function (r) { return (N.VOWELS.indexOf(la(r).first) !== -1) === yes; }, 'Look only at the first letter of the surname.', function (r) { return 'the surname ' + r.last + ' begins with ' + la(r).first; })];
    }));
    out.push(T('nf_kinds:' + f.key, 'nfk', 2, function (c) {
      var kk = fi(c.k).kinds, res = [];
      res.push(C('nfk=' + kk, cap(FN) + ' uses exactly ' + kk + ' different letters.', function (r) { return fi(r).kinds === kk; },
        'Count each letter of the first name once, however often it appears: ANNA uses 2 different letters.', function (r) { return 'the first name ' + r.first + ' uses ' + fi(r).kinds + ' different letters'; }));
      return res;
    }));
    out.push(T('nb_count:' + f.key, 'nbc', 2, function (c) {
      var res = [];
      'AEINRL'.split('').forEach(function (L) {
        var cnt = function (r) { var s = fi(r).u + la(r).u, n = 0; for (var i = 0; i < s.length; i++) if (s[i] === L) n++; return n; };
        var kc = cnt(c.k);
        if (kc > 3) return;
        res.push(C('nbc' + L + kc, kc === 0 ? 'The letter ' + L + ' does not appear anywhere in ' + P + ' full name.' : 'The letter ' + L + ' appears exactly ' + (kc === 1 ? 'once' : kc === 2 ? 'twice' : 'three times') + ' in ' + P + ' full name.',
          function (r) { return cnt(r) === kc; }, 'Count every ' + L + ' in the first name and the surname together.', function (r) { return full(r) + ' has ' + cnt(r) + ' of the letter ' + L; }));
      });
      return res;
    }));
    // hard: two facts joined
    out.push(T('nb_if:' + f.key, 'cross', 3, function (c) {
      var res = [];
      for (var k = 0; k < c.n; k++) {
        var early = c.rng.int(2) === 1, v = la(pick(c)).len, longer = c.rng.int(2) === 1;
        var cond = function (r) { return (fi(r).first <= 'M') === early; };
        var then = function (r) { return longer ? la(r).len >= v : la(r).len <= v; };
        if ((cond(c.k) && !then(c.k)) || !splits(c, cond) || !splits(c, then)) continue;
        (function (early, v, longer, cond, then) {
          res.push(C('nbf' + early + v + longer, 'If ' + FN + ' begins with a letter from ' + (early ? 'A to M' : 'N to Z') + ', the surname has ' + v + ' or ' + (longer ? 'more' : 'fewer') + ' letters.',
            function (r) { return !cond(r) || then(r); },
            'This is an “if … then” clue. It can only rule out names whose first name begins with ' + (early ? 'A to M' : 'N to Z') + '. Every other name stays in play.',
            function (r) { return 'the name is ' + full(r) + ' (' + la(r).len + ' letters in the surname)'; }));
        })(early, v, longer, cond, then);
      }
      return res;
    }));
    out.push(T('nb_or:' + f.key, 'cross', 3, function (c) {
      var res = [];
      for (var k = 0; k < c.n; k++) {
        var endV = c.rng.int(2) === 1, L = NAME_LETTERS[c.rng.int(NAME_LETTERS.length)];
        var a = function (r) { return (N.VOWELS.indexOf(fi(r).last) !== -1) === endV; }, b = function (r) { return N.letterIn(la(r), L); };
        if ((!a(c.k) && !b(c.k)) || !splits(c, a) || !splits(c, b)) continue;
        (function (endV, L, a, b) {
          res.push(C('nbr' + endV + L, cap(FN) + (endV ? ' ends in a vowel' : ' ends in a consonant') + ', or the surname contains the letter ' + L + ' (or both).',
            function (r) { return a(r) || b(r); },
            'This is an “either … or” clue. A name stays in play when at least one part is true. Cross it out only when both parts are false.',
            function (r) { return 'the name is ' + full(r); }));
        })(endV, L, a, b);
      }
      return res;
    }));
    out.push(T('nb_if2:' + f.key, 'cross', 3, function (c) {
      var res = [];
      for (var k = 0; k < c.n; k++) {
        var v = la(pick(c)).len, longer = c.rng.int(2) === 1, L = NAME_LETTERS[c.rng.int(NAME_LETTERS.length)];
        var cond = function (r) { return longer ? la(r).len >= v : la(r).len <= v; };
        if ((cond(c.k) && !N.letterIn(fi(c.k), L)) || !splits(c, cond) || !splits(c, function (r) { return N.letterIn(fi(r), L); })) continue;
        (function (v, longer, L, cond) {
          res.push(C('nbg' + v + longer + L, 'If ' + LN + ' has ' + v + ' or ' + (longer ? 'more' : 'fewer') + ' letters, the first name contains the letter ' + L + '.',
            function (r) { return !cond(r) || N.letterIn(fi(r), L); },
            'This is an “if … then” clue. It can only rule out names whose surname has ' + v + ' or ' + (longer ? 'more' : 'fewer') + ' letters. Every other name stays in play.',
            function (r) { return 'the name is ' + full(r) + ' (' + la(r).len + ' letters in the surname)'; }));
        })(v, longer, L, cond);
      }
      return res;
    }));
    out.push(T('nb_both:' + f.key, 'cross', 3, function (c) {
      var ev = function (x) { return N.VOWELS.indexOf(x.last) !== -1; };
      var same = ev(fi(c.k)) === ev(la(c.k));
      return [C('nbb' + same, same ? 'Either both of ' + P + ' names end in a vowel, or neither does.' : 'Exactly one of ' + P + ' two names ends in a vowel.',
        function (r) { return (ev(fi(r)) === ev(la(r))) === same; },
        'Look at the last letter of the first name and of the surname. Vowels are A, E, I, O and U.', function (r) { return 'the name is ' + full(r); })];
    }));
    out.push(T('nb_par:' + f.key, 'nbp', 2, function (c) {
      var even = (fi(c.k).len + la(c.k).len) % 2 === 0;
      return [C('nbp' + even, 'The number of letters in ' + P + ' full name (first name and surname together) is ' + (even ? 'even.' : 'odd.'),
        function (r) { return ((fi(r).len + la(r).len) % 2 === 0) === even; }, 'Add the letters of both names. 4, 6, 8, 10 … are even.',
        function (r) { return full(r) + ' has ' + (fi(r).len + la(r).len) + ' letters'; })];
    }));
    out.push(T('nb_vcmp:' + f.key, 'cross', 3, function (c) {
      var a = fi(c.k).vowels, b = la(c.k).vowels, rel = a > b ? 1 : a < b ? -1 : 0;
      var text = rel > 0 ? cap(FN) + ' contains more vowels than the surname.' : rel < 0 ? cap(FN) + ' contains fewer vowels than the surname.' : cap(FN) + ' and surname contain the same number of vowels.';
      return [C('nbv' + rel, text, function (r) { var x = fi(r).vowels, y = la(r).vowels; return (x > y ? 1 : x < y ? -1 : 0) === rel; },
        'Count A, E, I, O and U in each name (Y is not a vowel) and compare.', function (r) { return r.first + ' has ' + fi(r).vowels + ' vowels and ' + r.last + ' has ' + la(r).vowels; })];
    }));
    out.push(T('nb_total:' + f.key, 'nbt', 2, function (c) {
      var kt = fi(c.k).len + la(c.k).len, res = [];
      sample(c, function (r) { return fi(r).len + la(r).len; }, c.n).forEach(function (v) {
        if (v <= kt && v > 7) res.push(C('nbt+' + v, cap(P) + ' full name (first name and surname) has ' + v + ' or more letters.', function (r) { return fi(r).len + la(r).len >= v; },
          'Add the letters of both names. Exactly ' + v + ' counts.', function (r) { return full(r) + ' has ' + (fi(r).len + la(r).len) + ' letters'; }));
        if (v >= kt && v < 18) res.push(C('nbt-' + v, cap(P) + ' full name (first name and surname) has ' + v + ' or fewer letters.', function (r) { return fi(r).len + la(r).len <= v; },
          'Add the letters of both names. Exactly ' + v + ' counts.', function (r) { return full(r) + ' has ' + (fi(r).len + la(r).len) + ' letters'; }));
      });
      return res;
    }));
    return out;
  }

  // ---------- coordinates ----------
  function geoTemplates(fl, fo, atlas, target) {
    var P = target.poss, W = cap(target.who);
    var lat = fl.get, lon = fo.get;
    var coord = function (r) { return fmtLat(lat(r)) + ', ' + fmtLon(lon(r)); };
    var why = function (r) { return 'the coordinate reads ' + coord(r); };
    var whyLat = function (r) { return 'its latitude is ' + fmtLat(lat(r)); };
    var whyLon = function (r) { return 'its longitude is ' + fmtLon(lon(r)); };
    var whyBoth = function (r) { return 'its latitude is ' + fmtLat(lat(r)) + ' and its longitude ' + fmtLon(lon(r)); };
    var decs = function (r) { return pad(Math.abs(lat(r)) % 100, 2) + pad(Math.abs(lon(r)) % 100, 2); };
    var firstDigit = function (v) { return String(Math.abs(v))[0]; };
    var deg = function (v) { return Math.floor(Math.abs(v) / 100); };
    var out = [];
    out.push(T('geo_ns', 'gns', 1, function (c) {
      var n = lat(c.k) >= 0;
      return [C('gns' + n, W + ' is in the ' + (n ? 'Northern' : 'Southern') + ' Hemisphere: its latitude ends in ' + (n ? 'N.' : 'S.'),
        function (r) { return (lat(r) >= 0) === n; }, 'Look only at the letter after the latitude: N or S.', function (r) { return 'its latitude ends in ' + (lat(r) >= 0 ? 'N' : 'S'); })];
    }));
    out.push(T('geo_ew', 'gew', 1, function (c) {
      var e = lon(c.k) >= 0;
      return [C('gew' + e, W + ' is in the ' + (e ? 'Eastern' : 'Western') + ' Hemisphere: its longitude ends in ' + (e ? 'E.' : 'W.'),
        function (r) { return (lon(r) >= 0) === e; }, 'Look only at the letter after the longitude: E or W.', function (r) { return 'its longitude ends in ' + (lon(r) >= 0 ? 'E' : 'W'); })];
    }));
    out.push(T('geo_latcut', 'gla', 1, function (c) {
      var kv = lat(c.k), res = [];
      sample(c, function (r) { return Math.round(lat(r) / 50) * 50; }, c.n).forEach(function (v) {
        if (v < kv) res.push(C('gla>' + v, W + ' lies farther north than ' + fmtLat(v) + '.', function (r) { return lat(r) > v; },
          'North latitudes grow toward the North Pole; south latitudes count down toward the equator, so 10.00°S is farther north than 20.00°S.', whyLat));
        if (v > kv) res.push(C('gla<' + v, W + ' lies farther south than ' + fmtLat(v) + '.', function (r) { return lat(r) < v; },
          'North latitudes shrink toward the equator; south latitudes grow toward the South Pole, so 20.00°S is farther south than 10.00°S.', whyLat));
      });
      return res;
    }));
    out.push(T('geo_loncut', 'glo', 1, function (c) {
      var kv = lon(c.k), res = [];
      sample(c, function (r) { return Math.round(lon(r) / 100) * 100; }, c.n).forEach(function (v) {
        if (v < kv) res.push(C('glo>' + v, W + ' lies farther east than ' + fmtLon(v) + '.', function (r) { return lon(r) > v; },
          'East longitudes grow going east; west longitudes count down going east, so 10.00°W is farther east than 20.00°W.', whyLon));
        if (v > kv) res.push(C('glo<' + v, W + ' lies farther west than ' + fmtLon(v) + '.', function (r) { return lon(r) < v; },
          'East longitudes shrink going west; west longitudes grow going west, so 20.00°W is farther west than 10.00°W.', whyLon));
      });
      return res;
    }));
    if (atlas && atlas.length) {
      var see = ' (see the Atlas)';
      out.push(T('geo_atlat', 'gal', 2, function (c) {
        var res = [];
        distinct(c.rng, atlas, 6).forEach(function (city) {
          var v = city.lat;
          if (v < lat(c.k)) res.push(C('gal>' + city.name, W + ' lies farther north than ' + city.name + see + '.', function (r) { return lat(r) > v; },
            'Find ' + city.name + ' in the Atlas and compare latitudes only. Equal does not pass.', whyLat));
          if (v > lat(c.k)) res.push(C('gal<' + city.name, W + ' lies farther south than ' + city.name + see + '.', function (r) { return lat(r) < v; },
            'Find ' + city.name + ' in the Atlas and compare latitudes only. Equal does not pass.', whyLat));
        });
        return res;
      }));
      out.push(T('geo_atlon', 'gao', 2, function (c) {
        var res = [];
        distinct(c.rng, atlas, 6).forEach(function (city) {
          var v = city.lon;
          if (v < lon(c.k)) res.push(C('gao>' + city.name, W + ' lies farther east than ' + city.name + see + '.', function (r) { return lon(r) > v; },
            'Find ' + city.name + ' in the Atlas and compare longitudes only. Equal does not pass.', whyLon));
          if (v > lon(c.k)) res.push(C('gao<' + city.name, W + ' lies farther west than ' + city.name + see + '.', function (r) { return lon(r) < v; },
            'Find ' + city.name + ' in the Atlas and compare longitudes only. Equal does not pass.', whyLon));
        });
        return res;
      }));
    }
    if (atlas && atlas.length) {
      out.push(T('geo_atband', 'gab', 2, function (c) {
        var res = [], cities = distinct(c.rng, atlas, 8);
        for (var a = 0; a < cities.length; a++) for (var b = a + 1; b < cities.length; b++) {
          var lo = Math.min(cities[a].lat, cities[b].lat), hi = Math.max(cities[a].lat, cities[b].lat);
          if (hi - lo < 300 || lat(c.k) <= lo || lat(c.k) >= hi) continue;
          (function (A, B, lo, hi) {
            res.push(C('gab' + A.name + B.name, W + ' lies farther north than ' + A.name + ' but farther south than ' + B.name + ' (see the Atlas).',
              function (r) { return lat(r) > lo && lat(r) < hi; }, 'Find both cities in the Atlas. Keep only latitudes strictly between theirs.', whyLat));
          })(cities[a].lat < cities[b].lat ? cities[a] : cities[b], cities[a].lat < cities[b].lat ? cities[b] : cities[a], lo, hi);
        }
        return res.slice(0, 6);
      }));
      out.push(T('geo_atlonband', 'gob', 2, function (c) {
        var res = [], cities = distinct(c.rng, atlas, 8);
        for (var a = 0; a < cities.length; a++) for (var b = a + 1; b < cities.length; b++) {
          var lo = Math.min(cities[a].lon, cities[b].lon), hi = Math.max(cities[a].lon, cities[b].lon);
          if (hi - lo < 500 || lon(c.k) <= lo || lon(c.k) >= hi) continue;
          (function (A, B, lo, hi) {
            res.push(C('gob' + A.name + B.name, W + ' lies farther east than ' + A.name + ' but farther west than ' + B.name + ' (see the Atlas).',
              function (r) { return lon(r) > lo && lon(r) < hi; }, 'Find both cities in the Atlas. Keep only longitudes strictly between theirs.', whyLon));
          })(cities[a].lon < cities[b].lon ? cities[a] : cities[b], cities[a].lon < cities[b].lon ? cities[b] : cities[a], lo, hi);
        }
        return res.slice(0, 6);
      }));
      out.push(T('geo_near', 'gne', 2, function (c) {
        var res = [];
        distinct(c.rng, atlas, 6).forEach(function (city) {
          [300, 500, 800].forEach(function (d) {
            var near = Math.abs(lat(c.k) - city.lat) <= d;
            res.push(C('gne' + city.name + d + near, 'The latitude of ' + target.who + ' is ' + (near ? 'within ' : 'more than ') + (d / 100) + ' degrees of the latitude of ' + city.name + ' (see the Atlas).',
              function (r) { return (Math.abs(lat(r) - city.lat) <= d) === near; },
              'Find ' + city.name + ' in the Atlas and compare latitudes only: ' + (d / 100) + ' degrees means a difference of ' + (d / 100) + '.00 or less.', whyLat));
          });
        });
        return res;
      }));
      out.push(T('geo_equator', 'geq', 2, function (c) {
        var res = [];
        distinct(c.rng, atlas, 6).forEach(function (city) {
          var a = Math.abs(lat(c.k)), b = Math.abs(city.lat);
          if (a === b) return;
          var closer = a < b;
          res.push(C('geq' + city.name + closer, W + ' lies ' + (closer ? 'closer to' : 'farther from') + ' the equator than ' + city.name + ' (see the Atlas).',
            function (r) { return closer ? Math.abs(lat(r)) < b : Math.abs(lat(r)) > b; },
            'Compare latitudes without N or S: 12.00°S is closer to the equator than 30.00°N.', whyLat));
        });
        return res;
      }));
    }
    out.push(T('geo_degpar', 'gdp', 2, function (c) {
      var even = deg(lat(c.k)) % 2 === 0;
      return [C('gdp' + even, 'The whole degrees of ' + P + ' latitude (the 44 in 44.80°N) are ' + (even ? 'even.' : 'odd.'),
        function (r) { return (deg(lat(r)) % 2 === 0) === even; }, 'Look only at the number before the decimal point in the latitude.', function (r) { return 'its latitude has ' + deg(lat(r)) + (deg(lat(r)) === 1 ? ' whole degree' : ' whole degrees'); })];
    }));
    out.push(T('geo_lastpar', 'glast', 2, function (c) {
      var res = [];
      [['latitude', lat], ['longitude', lon]].forEach(function (p) {
        var odd = Math.abs(p[1](c.k)) % 2 === 1;
        res.push(C('glp' + p[0] + odd, 'The last digit of ' + P + ' ' + p[0] + ' is ' + (odd ? 'odd.' : 'even.'),
          function (r) { return (Math.abs(p[1](r)) % 2 === 1) === odd; }, 'Look only at the very last digit of the ' + p[0] + ', just before the ° sign.', function (r) { return 'its ' + p[0] + ' ends in ' + (Math.abs(p[1](r)) % 10); }));
      });
      return res;
    }));
    out.push(T('geo_first', 'gfi', 2, function (c) {
      var same = firstDigit(lat(c.k)) === firstDigit(lon(c.k));
      return [C('gfi' + same, 'The first digit of ' + P + ' latitude is ' + (same ? 'the same as' : 'different from') + ' the first digit of its longitude.',
        function (r) { return (firstDigit(lat(r)) === firstDigit(lon(r))) === same; }, 'Compare the very first digit of each number: 44.80°N, 20.47°E begins with 4 and 2.', function (r) { return 'its latitude begins with ' + firstDigit(lat(r)) + ' and its longitude with ' + firstDigit(lon(r)); })];
    }));
    out.push(T('geo_degcmp', 'gdc', 2, function (c) {
      var a = deg(lat(c.k)), b = deg(lon(c.k));
      if (a === b) return [];
      var bigger = a > b;
      return [C('gdc' + bigger, 'The whole degrees of ' + P + ' latitude are ' + (bigger ? 'larger' : 'smaller') + ' than the whole degrees of its longitude.',
        function (r) { var x = deg(lat(r)), y = deg(lon(r)); return bigger ? x > y : x < y; }, 'Compare only the numbers before the decimal points. Ignore N, S, E and W.', function (r) { return 'its latitude has ' + deg(lat(r)) + ' whole degrees and its longitude ' + deg(lon(r)); })];
    }));
    out.push(T('geo_digit', 'gdg', 2, function (c) {
      var res = [], s = String(Math.abs(lat(c.k))) + String(Math.abs(lon(c.k)));
      for (var k = 0; k < 3; k++) {
        var d = String(c.rng.int(10)), yes = s.indexOf(d) !== -1;
        (function (d, yes) {
          res.push(C('gdg' + d + yes, 'The digit ' + d + (yes ? ' appears somewhere in ' : ' appears nowhere in ') + P + ' coordinate.',
            function (r) { return ((String(Math.abs(lat(r))) + String(Math.abs(lon(r)))).indexOf(d) !== -1) === yes; }, 'Check every digit of both numbers.', why));
        })(d, yes);
      }
      return res;
    }));
    out.push(T('geo_decsum', 'gds', 2, function (c) {
      var ks = digitSum(decs(c.k)), res = [];
      sample(c, function (r) { return digitSum(decs(r)); }, c.n).forEach(function (v) {
        if (v <= ks && v > 4) res.push(C('gds+' + v, 'The four digits after the decimal points of ' + P + ' coordinate add up to ' + v + ' or more.', function (r) { return digitSum(decs(r)) >= v; },
          'Add the two digits after each decimal point: 44.80°N, 20.47°E gives 8 + 0 + 4 + 7 = 19.', function (r) { return 'the decimals of ' + coord(r) + ' add up to ' + digitSum(decs(r)); }));
        if (v >= ks && v < 32) res.push(C('gds-' + v, 'The four digits after the decimal points of ' + P + ' coordinate add up to ' + v + ' or less.', function (r) { return digitSum(decs(r)) <= v; },
          'Add the two digits after each decimal point: 44.80°N, 20.47°E gives 8 + 0 + 4 + 7 = 19.', function (r) { return 'the decimals of ' + coord(r) + ' add up to ' + digitSum(decs(r)); }));
      });
      return res;
    }));
    out.push(T('geo_latband', 'glb', 2, function (c) {
      var kv = lat(c.k), res = [];
      for (var k = 0; k < c.n; k++) {
        var a = Math.floor(lat(pick(c)) / 50) * 50, b = Math.ceil(lat(pick(c)) / 50) * 50;
        if (a > b) { var t = a; a = b; b = t; }
        if (a > kv || b < kv || b - a < 300) continue;
        (function (a, b) {
          res.push(C('glb' + a + '-' + b, W + ' lies between ' + fmtLat(a) + ' and ' + fmtLat(b) + ' (both included).', function (r) { return lat(r) >= a && lat(r) <= b; },
            'Look only at the latitude. Both values named in the clue count.', whyLat));
        })(a, b);
      }
      return res;
    }));
    out.push(T('geo_lastset', 'glast', 1, function (c) {
      var res = [];
      [c.rng.int(2) ? ['latitude', lat] : ['longitude', lon]].forEach(function (p) {
        var d0 = Math.abs(p[1](c.k)) % 10;
        for (var k = 0; k < 2; k++) {
          var set = [d0].concat(distinct(c.rng, U.range(0, 9), 2 + c.rng.int(3), function (v) { return v === d0; })).sort(numSort);
          (function (set) {
            res.push(C('gls' + p[0] + set.join(''), 'The last digit of ' + P + ' ' + p[0] + ' is ' + list(set) + '.', function (r) { return has(set, Math.abs(p[1](r)) % 10); },
              'Look only at the very last digit of the ' + p[0] + ', just before the ° sign.', function (r) { return 'its ' + p[0] + ' ends in ' + (Math.abs(p[1](r)) % 10); }));
          })(set);
        }
      });
      return res;
    }));
    out.push(T('geo_londeg', 'gld', 2, function (c) {
      var even = deg(lon(c.k)) % 2 === 0;
      return [C('gld' + even, 'The whole degrees of ' + P + ' longitude (the 20 in 20.47°E) are ' + (even ? 'even.' : 'odd.'),
        function (r) { return (deg(lon(r)) % 2 === 0) === even; }, 'Look only at the number before the decimal point in the longitude.', function (r) { return 'its longitude has ' + deg(lon(r)) + (deg(lon(r)) === 1 ? ' whole degree' : ' whole degrees'); })];
    }));
    out.push(T('geo_deccmp', 'gdx', 2, function (c) {
      var a = Math.abs(lat(c.k)) % 100, b = Math.abs(lon(c.k)) % 100;
      if (a === b) return [];
      var bigger = a > b;
      return [C('gdx' + bigger, 'The two digits after the decimal point of ' + P + ' latitude make a ' + (bigger ? 'larger' : 'smaller') + ' number than those of its longitude.',
        function (r) { var x = Math.abs(lat(r)) % 100, y = Math.abs(lon(r)) % 100; return bigger ? x > y : x < y; },
        'Compare the decimals only: 44.80°N, 20.47°E compares 80 with 47.', function (r) { return 'its decimals are ' + pad(Math.abs(lat(r)) % 100, 2) + ' and ' + pad(Math.abs(lon(r)) % 100, 2); })];
    }));
    out.push(T('geo_or', 'cross', 3, function (c) {
      var res = [];
      for (var k = 0; k < c.n; k++) {
        var v = Math.round(lat(pick(c)) / 100) * 100, north = c.rng.int(2) === 1, odd = c.rng.int(2) === 1;
        var a = function (r) { return north ? lat(r) > v : lat(r) < v; }, b = function (r) { return (Math.abs(lon(r)) % 2 === 1) === odd; };
        if ((!a(c.k) && !b(c.k)) || !splits(c, a) || !splits(c, b)) continue;
        (function (v, north, odd, a, b) {
          res.push(C('gor' + v + north + odd, W + ' lies farther ' + (north ? 'north' : 'south') + ' than ' + fmtLat(v) + ', or the last digit of its longitude is ' + (odd ? 'odd' : 'even') + ' (or both).',
            function (r) { return a(r) || b(r); }, 'This is an “either … or” clue. A coordinate stays in play when at least one part is true. Cross it out only when both parts are false.', whyBoth));
        })(v, north, odd, a, b);
      }
      return res;
    }));
    out.push(T('geo_ifcut', 'cross', 3, function (c) {
      var res = [];
      for (var k = 0; k < c.n; k++) {
        var v = Math.round(lat(pick(c)) / 50) * 50, w = Math.round(lon(pick(c)) / 100) * 100, north = c.rng.int(2) === 1, west = c.rng.int(2) === 1;
        var cond = function (r) { return north ? lat(r) > v : lat(r) < v; }, then = function (r) { return west ? lon(r) < w : lon(r) > w; };
        if ((cond(c.k) && !then(c.k)) || !splits(c, cond) || !splits(c, then)) continue;
        (function (v, w, north, west, cond, then) {
          res.push(C('gic' + v + w + north + west, 'If ' + target.who + ' lies farther ' + (north ? 'north' : 'south') + ' than ' + fmtLat(v) + ', it also lies farther ' + (west ? 'west' : 'east') + ' than ' + fmtLon(w) + '.',
            function (r) { return !cond(r) || then(r); },
            'This is an “if … then” clue. It can only rule out coordinates farther ' + (north ? 'north' : 'south') + ' than ' + fmtLat(v) + '. Every other coordinate stays in play.', whyBoth));
        })(v, w, north, west, cond, then);
      }
      return res;
    }));
    out.push(T('geo_ifdig', 'cross', 3, function (c) {
      var res = [];
      [[true, false], [false, true], [true, true], [false, false]].forEach(function (pr) {
        var cond = function (r) { return (Math.abs(lat(r)) % 2 === 0) === pr[0]; }, then = function (r) { return (Math.abs(lon(r)) % 2 === 0) === pr[1]; };
        if ((cond(c.k) && !then(c.k)) || !splits(c, cond) || !splits(c, then)) return;
        res.push(C('gid' + pr.join(''), 'If the last digit of ' + P + ' latitude is ' + (pr[0] ? 'even' : 'odd') + ', the last digit of its longitude is ' + (pr[1] ? 'even' : 'odd') + '.',
          function (r) { return !cond(r) || then(r); },
          'This is an “if … then” clue. It can only rule out coordinates whose latitude ends in an ' + (pr[0] ? 'even' : 'odd') + ' digit.', whyBoth));
      });
      return res;
    }));
    out.push(T('geo_if', 'cross', 3, function (c) {
      var res = [];
      for (var k = 0; k < c.n; k++) {
        var south = c.rng.int(2) === 1, v = Math.round(lon(pick(c)) / 500) * 500;
        if ((lat(c.k) < 0) === south && lon(c.k) <= v) continue;
        if (!splits(c, function (r) { return (lat(r) < 0) === south; }) || !splits(c, function (r) { return lon(r) > v; })) continue;
        (function (south, v) {
          res.push(C('gif' + south + v, 'If ' + target.who + ' is in the ' + (south ? 'Southern' : 'Northern') + ' Hemisphere, it lies farther east than ' + fmtLon(v) + '.',
            function (r) { return (lat(r) < 0) !== south || lon(r) > v; }, 'This is an “if … then” clue: it can only rule out coordinates in the ' + (south ? 'Southern' : 'Northern') + ' Hemisphere.', whyBoth));
        })(south, v);
      }
      return res;
    }));
    return out;
  }

  // ---------- clues that join two fields (hard) ----------
  function crossTemplates(fs, target) {
    var out = [];
    var enums = fs.filter(function (f) { return (f.kind === 'enum' || f.kind === 'ord') && f.labels.length >= 3; });
    var nums = fs.filter(function (f) { return f.kind === 'int' || f.kind === 'time' || f.kind === 'dur' || f.kind === 'date'; });
    var codes = fs.filter(function (f) { return f.kind === 'code'; });
    var words = fs.filter(function (f) { return f.kind === 'enum' && f.words; });
    var letters = fs.filter(function (f) { return f.kind === 'letter'; });
    var name = fs.filter(function (f) { return f.kind === 'name'; })[0];
    var P = target.poss;

    function numText(f, v) { return f.kind === 'time' ? clock(v) : f.kind === 'dur' ? fmtDur(v) : f.kind === 'date' ? f.long(v) : f.fmt(v); }
    function lc(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
    function bound(f, v, upper) {
      if (f.kind === 'time') return lc(f.verb) + ' at ' + clock(v) + (upper ? ' or earlier' : ' or later');
      if (f.kind === 'dur') return lc(f.subj) + ' lasted ' + fmtDur(v) + (upper ? ' or less' : ' or longer');
      if (f.kind === 'date') return lc(f.verb) + ' on ' + f.long(v) + (upper ? ' or earlier' : ' or later');
      return lc(f.np) + ' is ' + f.fmt(v) + ' or ' + (upper ? f.less : f.more);
    }

    enums.forEach(function (e) {
      nums.forEach(function (nf) {
        var splitsBoth = function (c, m, v, upper) {
          return splits(c, function (r) { return e.get(r) === m; }) && splits(c, function (r) { return upper ? nf.get(r) <= v : nf.get(r) >= v; });
        };
        out.push(T('x_if:' + e.key + '>' + nf.key, 'cross', 3, function (c) {
          var res = [];
          for (var k = 0; k < c.n; k++) {
            var m = c.rng.int(e.labels.length), upper = c.rng.int(2) === 1, v = nf.get(pick(c));
            if (nf.kind === 'time') v = upper ? round5Up(v) : round5Down(v);
            var kOk = e.get(c.k) !== m || (upper ? nf.get(c.k) <= v : nf.get(c.k) >= v);
            if (!kOk || !splitsBoth(c, m, v, upper)) continue;
            (function (m, v, upper) {
              res.push(C('xi' + e.key + m + nf.key + (upper ? '<' : '>') + v, 'If ' + say(e, 'cond', e.labels[m]) + ', ' + bound(nf, v, upper) + '.',
                function (r) { return e.get(r) !== m || (upper ? nf.get(r) <= v : nf.get(r) >= v); },
                'This is an “if … then” clue. It can only rule out rows where the ' + e.noun + ' is ' + (e.kind === 'ord' ? e.labels[m] : q(e.labels[m])) + '. Every other row stays in play.',
                function (r) { return 'the ' + e.noun + ' is ' + e.labels[e.get(r)] + ' and the ' + nf.noun + ' is ' + numText(nf, nf.get(r)); }));
            })(m, v, upper);
          }
          return res;
        }));
        out.push(T('x_or:' + e.key + '|' + nf.key, 'cross', 3, function (c) {
          var res = [];
          for (var k = 0; k < c.n; k++) {
            var m = c.rng.int(e.labels.length), upper = c.rng.int(2) === 1, v = nf.get(pick(c));
            if (nf.kind === 'time') v = upper ? round5Up(v) : round5Down(v);
            var kOk = e.get(c.k) === m || (upper ? nf.get(c.k) <= v : nf.get(c.k) >= v);
            if (!kOk || !splitsBoth(c, m, v, upper)) continue;
            (function (m, v, upper) {
              res.push(C('xo' + e.key + m + nf.key + (upper ? '<' : '>') + v, cap(say(e, 'cond', e.labels[m])) + ', or ' + bound(nf, v, upper) + ' (or both).',
                function (r) { return e.get(r) === m || (upper ? nf.get(r) <= v : nf.get(r) >= v); },
                'This is an “either … or” clue. A row stays in play when at least one part is true. Cross it out only when both parts are false.',
                function (r) { return 'the ' + e.noun + ' is ' + e.labels[e.get(r)] + ' and the ' + nf.noun + ' is ' + numText(nf, nf.get(r)); }));
            })(m, v, upper);
          }
          return res;
        }));
      });
    });
    codes.forEach(function (cf) {
      nums.filter(function (nf) { return nf.kind === 'int' && nf.max >= 10; }).forEach(function (nf) {
        out.push(T('x_last:' + cf.key + '=' + nf.key, 'cross', 3, function (c) {
          var same = cf.get(c.k).slice(-1) === String(nf.get(c.k)).slice(-1);
          return [C('xl' + cf.key + nf.key + same, 'The ' + cf.noun + ' and the ' + nf.noun + ' on ' + P + ' row end in ' + (same ? 'the same digit.' : 'different digits.'),
            function (r) { return (cf.get(r).slice(-1) === String(nf.get(r)).slice(-1)) === same; },
            'Compare two columns on the same row: the last digit of the ' + cf.noun + ' and the last digit of the ' + nf.noun + '.',
            function (r) { return 'the ' + cf.noun + ' is ' + cf.fmt(cf.get(r)) + ' and the ' + nf.noun + ' is ' + nf.fmt(nf.get(r)); })];
        }));
      });
    });
    if (name) {
      var fi = function (r) { return N.facts(r.first); }, la = function (r) { return N.facts(r.last); };
      nums.concat(codes).filter(function (f) { return f.kind === 'code' || (f.kind === 'int' && f.max >= 10); }).forEach(function (nf) {
        out.push(T('x_lenin:' + nf.key, 'cross', 3, function (c) {
          var str = function (r) { return nf.kind === 'code' ? nf.get(r) : String(nf.get(r)); };
          var yes = str(c.k).indexOf(String(fi(c.k).len)) !== -1;
          return [C('xn' + nf.key + yes, 'The number of letters in ' + P + ' first name ' + (yes ? 'appears' : 'does not appear') + ' among the digits of the ' + nf.noun + '.',
            function (r) { return (str(r).indexOf(String(fi(r).len)) !== -1) === yes; },
            'Count the letters in the first name, then look for that number inside the ' + nf.noun + '. A five-letter name passes with 105.',
            function (r) { return r.first + ' has ' + fi(r).len + ' letters and the ' + nf.noun + ' is ' + nf.fmt(nf.get(r)); })];
        }));
      });
      letters.forEach(function (lf) {
        out.push(T('x_letinit:' + lf.key, 'cross', 3, function (c) {
          var res = [];
          [['first name', fi, 'first'], ['surname', la, 'last']].forEach(function (p) {
            var a = lf.get(c.k), b = p[1](c.k).first;
            if (a === b) return;
            var before = a < b;
            res.push(C('xb' + lf.key + p[2] + before, cap(P) + ' ' + lf.noun + ' comes ' + (before ? 'before' : 'after') + ' the first letter of the ' + p[0] + ' in the alphabet.',
              function (r) { var x = lf.get(r), y = p[1](r).first; return before ? x < y : x > y; },
              'Compare the ' + lf.noun + ' with the first letter of the ' + p[0] + '. The same letter does not pass.',
              function (r) { return 'the ' + lf.noun + ' is ' + lf.get(r) + ' and the ' + p[0] + ' is ' + r[p[2]]; }));
          });
          return res;
        }));
      });
      words.forEach(function (wf) {
        var w = function (r) { return N.facts(wf.labels[wf.get(r)]); };
        out.push(T('x_word:' + wf.key, 'cross', 3, function (c) {
          var res = [], wk = w(c.k), F0 = fi(c.k), L0 = la(c.k), lbl = 'the word for ' + P + ' ' + wf.noun;
          var s = N.shared(wk, F0);
          if (s >= 2) res.push(C('xw2' + wf.key, cap(P) + ' first name and ' + wf.noun + ' share at least two different letters.', function (r) { return N.shared(w(r), fi(r)) >= 2; },
            'Count shared letter kinds, not repeats: MIRA and TRADER share A and R, exactly two.', function (r) { return 'the name is ' + r.first + ' and the ' + wf.noun + ' is ' + wf.labels[wf.get(r)]; }));
          if (s <= 1) res.push(C('xw1' + wf.key, cap(P) + ' first name and ' + wf.noun + ' share at most one letter.', function (r) { return N.shared(w(r), fi(r)) <= 1; },
            'Count shared letter kinds, not repeats.', function (r) { return 'the name is ' + r.first + ' and the ' + wf.noun + ' is ' + wf.labels[wf.get(r)]; }));
          if (wk.len !== F0.len) {
            var longer = wk.len > F0.len;
            res.push(C('xwl' + wf.key + longer, cap(lbl) + ' has ' + (longer ? 'more' : 'fewer') + ' letters than ' + P + ' first name.',
              function (r) { return longer ? w(r).len > fi(r).len : w(r).len < fi(r).len; }, 'Count the letters in both words. A tie does not pass.',
              function (r) { return wf.labels[wf.get(r)] + ' has ' + w(r).len + ' letters and ' + r.first + ' has ' + fi(r).len; }));
          }
          if (wk.vowels !== L0.vowels) {
            var more = wk.vowels > L0.vowels;
            res.push(C('xwv' + wf.key + more, cap(lbl) + ' contains ' + (more ? 'more' : 'fewer') + ' vowels than ' + P + ' surname.',
              function (r) { return more ? w(r).vowels > la(r).vowels : w(r).vowels < la(r).vowels; }, 'Count A, E, I, O and U in both words (Y is not a vowel). A tie does not pass.',
              function (r) { return wf.labels[wf.get(r)] + ' has ' + w(r).vowels + ' vowels and ' + r.last + ' has ' + la(r).vowels; }));
          }
          if (wk.first !== L0.first) {
            var bef = wk.first < L0.first;
            res.push(C('xwo' + wf.key + bef, 'The first letter of ' + lbl + ' comes ' + (bef ? 'before' : 'after') + ' the first letter of the surname in the alphabet.',
              function (r) { return bef ? w(r).first < la(r).first : w(r).first > la(r).first; }, 'Compare only the two first letters. The same letter does not pass.',
              function (r) { return 'the ' + wf.noun + ' is ' + wf.labels[wf.get(r)] + ' and the surname is ' + r.last; }));
          }
          letters.forEach(function (lf) {
            var same = lf.get(c.k) === wk.first;
            res.push(C('xwd' + wf.key + lf.key + same, cap(P) + ' ' + lf.noun + ' is ' + (same ? 'the same as' : 'different from') + ' the first letter of the ' + wf.noun + '.',
              function (r) { return (lf.get(r) === w(r).first) === same; }, 'Compare the ' + lf.noun + ' with the first letter of the ' + wf.noun + '.',
              function (r) { return 'the ' + lf.noun + ' is ' + lf.get(r) + ' and the ' + wf.noun + ' is ' + wf.labels[wf.get(r)]; }));
          });
          return res;
        }));
      });
    }
    return out;
  }

  /*
   * All clue templates for a list of defined fields.
   */
  function templates(fs, target, atlas) {
    var out = [];
    var latF = null, lonF = null;
    fs.forEach(function (f) {
      if (f.fixed) return;
      switch (f.kind) {
        case 'code': out = out.concat(codeTemplates(f)); break;
        case 'int': out = out.concat(intTemplates(f)); break;
        case 'ord': out = out.concat(ordTemplates(f)); break;
        case 'enum': out = out.concat(enumTemplates(f)); break;
        case 'letter': out = out.concat(letterTemplates(f)); break;
        case 'time': out = out.concat(timeTemplates(f)); break;
        case 'date': out = out.concat(dateTemplates(f)); break;
        case 'dur': out = out.concat(durTemplates(f)); break;
        case 'name': out = out.concat(nameTemplates(f, target)); break;
        case 'lat': latF = f; break;
        case 'lon': lonF = f; break;
      }
    });
    if (latF && lonF) out = out.concat(geoTemplates(latF, lonF, atlas, target));
    out = out.concat(crossTemplates(fs.filter(function (f) { return !f.fixed; }), target));
    // clues about one part of a name only, so a chain can keep a balance between the parts
    // and between the clues that each set a range on the same number (latitude, longitude)
    var LATR = /^geo_(ns|latcut|atlat|latband|atband|near|equator)$/, LONR = /^geo_(ew|loncut|atlon|atlonband)$/;
    out.forEach(function (t) {
      t.grp = /^nf_/.test(t.id) ? 'first' : /^nl_/.test(t.id) ? 'last' : LATR.test(t.id) ? 'lat' : LONR.test(t.id) ? 'lon' : null;
    });
    return out;
  }

  // ---------- records ----------
  /*
   * Prepares per-register randomness that every record shares (weights of labels, the name pool).
   */
  function prepare(fs, rng, opts) {
    var ctx = { weights: {}, first: N.pool(opts.era || 'classic'), geo: opts.geo || null };
    fs.forEach(function (f) {
      if ((f.kind === 'enum' || f.kind === 'ord') && f.weights !== false) {
        var w = f.weights || f.labels.map(function () { return 10 + rng.int(30); });
        ctx.weights[f.key] = w;
      }
    });
    return ctx;
  }

  function randomRecord(fs, rng, ctx, i) {
    var r = {};
    fs.forEach(function (f) {
      if (f.kind === 'name') setName(r, rng, ctx);
      else if (f.kind === 'lat') setCoord(r, rng, ctx);
      else if (f.kind === 'lon') { /* set with lat */ }
      else if (f.seq) r[f.key] = f.seq + i;
      else r[f.key] = rand(f, rng, ctx);
    });
    return r;
  }

  // Changes one field at random: used to plant near-miss records. Returns the field changed, or null.
  function mutateRecord(fs, p, rng, ctx) {
    var mut = fs.filter(function (f) { return !f.fixed && !f.seq && f.kind !== 'lon'; });
    var f = mut[rng.int(mut.length)];
    if (f.kind === 'name') setName(p, rng, ctx, rng.int(2) ? 'first' : 'last');
    else if (f.kind === 'lat') {
      // one small change: a decimal digit, or a few whole degrees
      var which = rng.int(2) ? 'lat' : 'lon', v = p[which], sign = v < 0 ? -1 : 1, a = Math.abs(v);
      var dg = Math.floor(a / 100), d1 = Math.floor(a / 10) % 10, d2 = a % 10, pick3 = rng.int(3);
      if (pick3 === 0) d2 = rng.int(10);
      else if (pick3 === 1) d1 = rng.int(10);
      else dg = Math.max(0, dg + rng.int(7) - 3);
      var lim = which === 'lat' ? 7000 : 17999;
      p[which] = Math.max(-lim, Math.min(lim, sign * (dg * 100 + d1 * 10 + d2)));
    } else if (f.kind === 'code' && rng.next() < 0.5) {
      var s = p[f.key].split(''), pos = rng.int(s.length);
      s[pos] = String(pos === 0 ? 1 + rng.int(9) : rng.int(10));
      p[f.key] = s.join('');
    } else p[f.key] = rand(f, rng, ctx);
    return f;
  }

  LK.fields = {
    define: define, templates: templates, prepare: prepare, randomRecord: randomRecord, mutateRecord: mutateRecord,
    setName: setName, fmtDur: fmtDur, fmtLat: fmtLat, fmtLon: fmtLon, WEEKDAYS: WEEKDAYS, helpers: { digitSum: digitSum, list: list, cap: cap, pad: pad }
  };
})(typeof window !== 'undefined' ? window : globalThis);
