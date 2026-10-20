/*
 * The features that turn an archive and a clue list into a book readers recommend:
 *   - chapters: the archive split into parts (hours of the night, classes, departments...);
 *   - hints: three hints for every clue, written by the engine from the case itself;
 *   - the Verdict Cipher: the killer's name locked with digits only the right answer gives, so a
 *     reader can prove the answer without a spoiler anywhere in the book.
 * Everything here is worked out from the case and the seed, never by the AI.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var U = LK.util, R = LK.register;
  var clock = function (m) { return LK.themes.clock(m); };

  // ---------- chapters ----------
  var CHAPTER_MOODS = [
    'It begins. Nobody knows yet.',
    'The crowd grows. Somebody is watching.',
    'Every ticket remembers the minute it was bought.',
    'Somewhere in this hour, a decision is made.',
    'Not long now.',
    'The last tickets. The last chance.'
  ];
  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

  /*
   * Splits the register into chapters by purchase time: whole-hour blocks across the event.
   * Returns [{ n, roman, title, mood, from, to, idx: [record indexes sorted by ticket] }].
   */
  function lotteryChapters(cs) {
    var v = cs.venue;
    var names = LK.themes.chapterNames(v.id);
    var startH = Math.floor(v.start / 60), endH = Math.floor(v.end / 60);
    var hours = endH - startH + 1;
    var n = Math.min(names.length, hours);
    var out = [];
    for (var c = 0; c < n; c++) {
      var h0 = startH + Math.round(c * hours / n), h1 = startH + Math.round((c + 1) * hours / n) - 1;
      out.push({ n: c + 1, roman: ROMAN[c], title: names[c], mood: CHAPTER_MOODS[Math.min(c, CHAPTER_MOODS.length - 1)],
        from: h0 * 60, to: c === n - 1 ? v.end : h1 * 60 + 59, idx: [], note: 'Every ticket bought in these hours, in ticket-number order.' });
    }
    for (var r = 0; r < cs.records.length; r++) {
      var m = cs.records[r].m;
      for (var k = 0; k < out.length; k++) if (m <= out[k].to) { out[k].idx.push(r); break; }
    }
    // records are already sorted by ticket, so each chapter's list is too
    return out.filter(function (ch) { return ch.idx.length; }).map(function (ch, i) {
      ch.n = i + 1; ch.roman = ROMAN[i]; ch.sub = clock(ch.from) + ' to ' + clock(ch.to); return ch;
    });
  }

  // The chapters of any archive, or null when its type has none.
  function chapters(cs) { return cs.type.chapters(cs); }

  // ---------- hints ----------
  var LOOK = {
    time: 'TIME', place: null, pay: 'METHOD', amt: 'PAID', ticket: 'TICKET', nums: 'LUCKY NUMBERS', initials: 'INITIALS'
  };

  // First hint: where to look and how to read the clue. Never names a ticket.
  function firstHint(clue, cs, chaptered) {
    var v = cs.venue, place = v.place.toLowerCase(), PLACE = v.placeShort;
    var id = clue.id;
    var col = function (name) { return 'Look only at the ' + name + ' column. '; };
    switch (id) {
      case 'time_after': case 'time_before': case 'time_between': case 'time_not_between': case 'time_hour':
        return col('TIME') + 'Times run through the day, so 11:59 AM comes just before 12:00 PM (noon).' +
          (id === 'time_hour' ? ' A whole hour is ruled out: every time from :00 to :59 of that hour.' : ' The times named in the clue count as matching.') +
          (chaptered ? ' Tip: the register is split into chapters by time, so this clue can rule out whole chapters at a glance.' : '');
      case 'time_minute_parity':
        return col('TIME') + 'Only the last digit of the minutes matters: 9:47 ends in 7, which is odd. The hour makes no difference.';
      case 'time_round':
        return col('TIME') + 'Only the last digit of the minutes matters. 0 and 5 are “round”; every other digit is not.';
      case 'place_parity': case 'place_ge': case 'place_le': case 'place_not':
        return col(PLACE) + 'The ' + place + ' number is the only thing that matters for this clue.';
      case 'place_mult':
        return col(PLACE) + 'A multiple of a number divides by it with nothing left over: the multiples of 4 are 4, 8, 12, 16, 20 and so on.';
      case 'place_digit':
        return col(PLACE) + 'Check each digit of the ' + place + ' number: 13 contains the digits 1 and 3.';
      case 'pay_is': case 'pay_not': case 'pay_neither':
        return col('METHOD') + 'This is one of the quickest clues: a single word to compare on each row.';
      case 'amt_ge': case 'amt_le': case 'amt_not':
        return col('PAID') + '“Or more” and “or less” include the amount named in the clue.';
      case 'tk_parity':
        return col('TICKET') + 'Only the last digit decides: 0, 2, 4, 6 and 8 are even; 1, 3, 5, 7 and 9 are odd.';
      case 'tk_has': case 'tk_hasnot':
        return col('TICKET') + 'Read all five digits of the ticket number, not just the first or last one.';
      case 'tk_first':
        return col('TICKET') + 'Only the first digit matters. The register is sorted by ticket number, so whole runs of rows share a first digit.';
      case 'tk_last':
        return col('TICKET') + 'Only the last digit of the ticket number matters.';
      case 'tk_sum':
        return col('TICKET') + 'Add up the five digits: 48213 gives 4 + 8 + 2 + 1 + 3 = 18. When a total is clearly far from the limit, you can move on quickly.';
      case 'tk_double':
        return col('TICKET') + 'Look for two identical digits side by side, like the 44 in 12447. Identical digits apart from each other, like the two 1s in 12145, do not count.';
      case 'tk_firstlast':
        return col('TICKET') + 'Compare only the first and the last digit of the ticket number.';
      case 'tk_div3':
        return col('TICKET') + 'Add up the five digits. If the total divides by 3 (3, 6, 9, 12, 15 …), the ticket number does too.';
      case 'num_has': case 'num_hasnot': case 'num_any': case 'num_none':
        return col('LUCKY NUMBERS') + 'The six numbers are sorted smallest first, so you can stop reading once you pass the number you are looking for.';
      case 'num_max':
        return col('LUCKY NUMBERS') + 'The numbers are sorted, so the last of the six is the highest. You only need to read that one.';
      case 'num_min':
        return col('LUCKY NUMBERS') + 'The numbers are sorted, so the first of the six is the smallest. You only need to read that one.';
      case 'num_consec':
        return col('LUCKY NUMBERS') + 'Two consecutive numbers follow each other, like 14 and 15. Because the six are sorted, such a pair always sits side by side.';
      case 'num_even':
        return col('LUCKY NUMBERS') + 'Count how many of the six numbers are even (they end in 0, 2, 4, 6 or 8).';
      case 'num_sum':
        return col('LUCKY NUMBERS') + 'Add up all six numbers. Rounding each one to the nearest ten gives a quick estimate; only add exactly when the total is close.';
      case 'num_decade':
        return col('LUCKY NUMBERS') + 'Check whether any of the six numbers falls inside the range named in the clue.';
      case 'num_enddigit':
        return col('LUCKY NUMBERS') + 'Look at the last digit of each of the six numbers.';
      case 'ini_half':
        return col('INITIALS') + 'A to M is the first half of the alphabet, N to Z the second. The clue says which initial to read.';
      case 'ini_has':
        return col('INITIALS') + 'Check both initials for the letter named in the clue.';
      case 'ini_same': case 'ini_vowel': case 'ini_order':
        return col('INITIALS') + 'Both initials matter for this clue. The first initial is the first name, the second is the last name.';
      case 'x_place_nums':
        return 'Compare two columns on the same row: is the ' + place + ' number one of the six lucky numbers?';
      case 'x_lastdigit':
        return 'Compare two columns on the same row: the last digit of the ticket number and the last digit of the ' + place + ' number.';
      case 'x_minutes':
        return 'Compare two columns on the same row: the minutes of the time (47 for 9:47) and the six lucky numbers.';
      case 'x_if_pay_time': case 'x_if_amt_place':
        return 'This is an “if … then” clue. It can only rule out tickets where the “if” part is true. Every other ticket stays in play, whatever its other columns say.';
      case 'x_or_pay_time': case 'x_or_parity_amt':
        return 'This is an “either … or” clue. A ticket stays in play when at least one part is true. Cross it out only when both parts are false.';
    }
    return 'Read the clue slowly and check each ticket still in play against it.';
  }

  // What a record shows for the columns a clue reads, in plain words.
  function describe(clue, rec, cs) {
    var v = cs.venue, place = v.place.toLowerCase();
    var row = R.row(rec, v);
    var H = LK.clues.helpers;
    switch (clue.fam) {
      case 'time': return 'its time is ' + row.time;
      case 'place': return 'its ' + place + ' number is ' + row.place;
      case 'pay': return 'it was paid by ' + row.method;
      case 'amt': return 'its buyer paid ' + row.amount;
      case 'ticket':
        var t = row.ticket;
        if (clue.id === 'tk_sum' || clue.id === 'tk_div3') return 'its digits add up to ' + H.digitSum(rec.t);
        if (clue.id === 'tk_parity' || clue.id === 'tk_last') return 'its number ends in ' + t[4];
        if (clue.id === 'tk_first') return 'its number begins with ' + t[0];
        if (clue.id === 'tk_firstlast') return 'its number begins with ' + t[0] + ' and ends with ' + t[4];
        return 'its number is ' + t;
      case 'nums':
        if (clue.id === 'num_sum') return 'its lucky numbers (' + row.numbers + ') add up to ' + H.numSum(rec.n);
        return 'its lucky numbers are ' + row.numbers;
      case 'initials': return 'its initials are ' + row.initials;
    }
    switch (clue.id) {
      case 'x_place_nums': return 'its ' + place + ' number is ' + row.place + ' and its lucky numbers are ' + row.numbers;
      case 'x_lastdigit': return 'it has ticket ' + row.ticket + ' at ' + place + ' ' + row.place;
      case 'x_minutes': return 'its time is ' + row.time + ' and its lucky numbers are ' + row.numbers;
      case 'x_if_pay_time': case 'x_or_pay_time': return 'it was paid by ' + row.method + ' at ' + row.time;
      case 'x_if_amt_place': return 'its buyer paid ' + row.amount + ' at ' + place + ' ' + row.place;
      case 'x_or_parity_amt': return 'it has ticket ' + row.ticket + ' and its buyer paid ' + row.amount;
    }
    return 'it is ' + row.ticket;
  }

  /*
   * Three hints per clue: how to read it, a worked example, and the count after it.
   * pageOf(recordIndex) gives the archive page of a record. Examples only ever show records that are
   * ruled out, by this clue or a later one, so no hint can give the answer away.
   */
  var KEEP_MIN = 40;

  function hints(cs, pageOf, chaptered, seed) {
    var t = cs.type, u = t.unit;
    var rng = U.makeRng('hints:' + seed + ':' + cs.clues.length);
    var elimAt = cs.check.elimAt, K = cs.clues.length;
    return cs.clues.map(function (clue, k) {
      var n = k + 1, out = [], kept = [];
      for (var r = 0; r < elimAt.length; r++) {
        if (elimAt[r] === n) out.push(r);
        else if (elimAt[r] > n) kept.push(r);
      }
      var second = [];
      if (out.length) {
        var o = out[rng.int(out.length)];
        second.push(t.recordLabel(cs.records[o], cs) + ' (page ' + pageOf(o) + ') does not match, because ' + t.describe(clue, cs.records[o], cs) + '. Cross it out.');
      }
      // a kept record is shown only while plenty are still in play: near the end it would point at the answer
      if (kept.length && cs.check.checkpoints[k] >= KEEP_MIN) {
        // a record that survives this clue but falls later: proof the clue is read the right way round
        var near = kept.filter(function (r) { return elimAt[r] > n + 1; });
        var pool = near.length ? near : kept;
        var e = pool[rng.int(pool.length)];
        second.push(t.recordLabel(cs.records[e], cs) + ' (page ' + pageOf(e) + ') matches, because ' + t.describe(clue, cs.records[e], cs) + '. It stays in play for now.');
      }
      var left = cs.check.checkpoints[k];
      var third = n === K ? 'After this clue, exactly one ' + u.one + ' is left in play.'
        : 'After this clue, ' + left.toLocaleString('en-US') + ' ' + (left === 1 ? u.one + ' is' : u.many + ' are') + ' left in play.';
      return { n: n, first: t.firstHint(clue, cs, chaptered), second: second.concat([third]).join(' '), third: third };
    });
  }

  // ---------- the practice case ----------
  /*
   * A two-minute warm-up: seven records of the book's own kind (but not from its archive) and four
   * easy clues that leave exactly one, so a new reader learns the method before the real thing.
   * Returns { cs (a small case to print with the book's columns), clues: [{ n, text, out: [records] }], killer } or null.
   */
  function practice(cs, seed) {
    var t = cs.type, SIZE = 7, K = 4;
    for (var attempt = 0; attempt < 40; attempt++) {
      var reg = t.generate('practice:' + seed + ':' + attempt, 80, cs.setting);
      var rng = U.makeRng('practice:' + seed + ':' + attempt);
      var recs = rng.shuffle(reg.records.slice()).slice(0, SIZE);
      var killer = recs[0];
      var templates = t.templates(reg).filter(function (tp) { return tp.tier === 1; });
      var alive = recs.slice(), chain = [], usedFam = {};
      for (var j = 1; j <= K; j++) {
        var left = K - j + 1, best = null;
        var c = t.context({ rng: rng, k: killer, alive: alive, n: 4, reg: reg }, reg);
        var want = j === K ? 1 : Math.max(left, Math.round(alive.length * 0.6));
        templates.forEach(function (tp) {
          if (usedFam[tp.fam]) return;
          tp.gen(c).forEach(function (cl) {
            if (!cl.test(killer)) return;
            var a = alive.filter(cl.test).length;
            if (a >= alive.length || (j < K && a < left) || (j === K && a !== 1)) return;
            var score = Math.abs(a - want) + rng.next() * 0.5;
            if (!best || score < best.score) best = { tp: tp, cl: cl, score: score };
          });
        });
        if (!best) break;
        var out = alive.filter(function (r) { return !best.cl.test(r); });
        alive = alive.filter(best.cl.test);
        usedFam[best.tp.fam] = true;
        chain.push({ n: j, id: best.tp.id, fam: best.tp.fam, tier: 1, text: best.cl.text, test: best.cl.test, how: best.cl.how, why: best.cl.why, out: out });
      }
      if (chain.length !== K || alive.length !== 1) continue;
      recs.sort(t.sort(reg));
      var mini = { type: t, setting: cs.setting, venue: cs.setting, places: reg.places, fields: reg.fs ? reg.fs.byKey : {}, fieldList: reg.fs ? reg.fs.list : [], records: recs };
      return { cs: mini, clues: chain, killer: killer };
    }
    return null;
  }

  // ---------- the Verdict Cipher ----------
  /*
   * The killer's name, locked letter by letter with the digits of the answer's key (a ticket or
   * badge number, or where the answer sits on the page). Each digit 0-9 has its own secret shift
   * (1-25, never 0, so no letter is ever printed as itself), chosen from the seed.
   * key: a string of 3 to 6 digits. Returns { message, key, cipher: [{ c, pos (digit of the key to use, or 0), plain }],
   * shifts[10], table: rows[10] of 26 letters }.
   */
  function verdict(key, killerName, seed) {
    key = String(key);
    var rng = U.makeRng('verdict:' + seed + ':' + key);
    var pool = U.range(1, 25);
    rng.shuffle(pool);
    var shifts = pool.slice(0, 10);
    var name = stripName(killerName);
    // only the name is locked: a fixed opening like "THE KILLER IS" would let a reader work the key out backwards
    var message = name || 'CASE CLOSED';
    var digits = key.split('').map(Number), L = digits.length;
    var j = 0, cipher = [];
    for (var i = 0; i < message.length; i++) {
      var ch = message[i], code = ch.charCodeAt(0) - 65;
      if (code >= 0 && code < 26) {
        var d = digits[j % L];
        cipher.push({ c: String.fromCharCode(65 + (code + shifts[d]) % 26), pos: (j % L) + 1, plain: ch });
        j++;
      } else cipher.push({ c: ch, pos: 0, plain: ch });
    }
    var table = shifts.map(function (s) {
      var row = [];
      for (var a = 0; a < 26; a++) row.push(String.fromCharCode(65 + (a + s) % 26));
      return row;
    });
    return { message: message, key: key, cipher: cipher, shifts: shifts, table: table, named: !!name };
  }

  // Unlocks a message with a key: what a reader would write down.
  function unlock(v, key) {
    var digits = String(key).split('').map(Number);
    return v.cipher.map(function (x) {
      if (!x.pos) return x.c;
      var s = v.shifts[digits[x.pos - 1]];
      return String.fromCharCode(65 + ((x.c.charCodeAt(0) - 65 - s) % 26 + 26) % 26);
    }).join('');
  }

  function stripName(n) {
    return String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
      .replace(/[^A-Z' .-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  LK.extras = { chapters: chapters, lotteryChapters: lotteryChapters, hints: hints, practice: practice, firstHint: firstHint, describe: describe, verdict: verdict, unlock: unlock };
})(typeof window !== 'undefined' ? window : globalThis);
