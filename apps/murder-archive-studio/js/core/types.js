/*
 * Archive types: what kind of records the book prints and the reader eliminates.
 * A type is either built from a list of fields (manifests, guest registers, phone records...) by
 * LK.types.fromFields(), or, for the original lottery register, wired to its own hand-tuned engine.
 *
 * Two story modes:
 *   ledger  the records carry no names (tickets, phones, coordinates). The AI invents twenty suspects
 *           and the app hands each of them records; the last record standing points to a name.
 *   named   the records are people (passengers, guests, staff). The last name standing is the killer,
 *           and the AI writes the story around the cast the app gives it.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var U = LK.util, F = LK.fields;

  var REG = {}, ORDER = [];
  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  function register(t) {
    if (!REG[t.id]) ORDER.push(t.id);
    REG[t.id] = t;
    t.setting = t.setting || function (id) {
      for (var i = 0; i < t.settings.length; i++) if (t.settings[i].id === id) return t.settings[i];
      return t.settings[0];
    };
    return t;
  }
  function get(id) { return REG[id] || REG.lottery; }
  function all() { return ORDER.map(function (id) { return REG[id]; }); }

  function units(one, many) { return { one: one, many: many, One: cap(one), Many: cap(many) }; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function fmtN(n) { return n.toLocaleString('en-US'); }

  // ---------- chapters ----------
  var MOODS = [
    'It begins. Nobody knows yet.',
    'The crowd grows. Somebody is watching.',
    'Every record remembers something.',
    'Somewhere in here, a decision is made.',
    'Not long now.',
    'The last pages. The last chance.'
  ];
  function mood(i) { return MOODS[Math.min(i, MOODS.length - 1)]; }

  // Splits records into chapters by a field. Records are already in print order, so each chapter is too.
  function chaptersBy(cs, spec) {
    var t = cs.type, f = spec.field ? cs.fields[spec.field] : null;
    var groups = [];
    if (spec.mode === 'enum') {
      f.labels.forEach(function (lab, i) { groups.push({ title: (spec.names && spec.names[i]) || lab, test: function (r) { return f.get(r) === i; } }); });
    } else if (spec.mode === 'time' || spec.mode === 'date') {
      var lo = spec.mode === 'time' ? Math.floor(f.start / 60) : 0;
      var hi = spec.mode === 'time' ? Math.floor(f.end / 60) : f.days - 1;
      var span = hi - lo + 1, n = Math.min(spec.count || 6, span);
      for (var c = 0; c < n; c++) (function (c) {
        var a = lo + Math.round(c * span / n), b = lo + Math.round((c + 1) * span / n) - 1;
        var from = spec.mode === 'time' ? a * 60 : a, to = spec.mode === 'time' ? (c === n - 1 ? f.end : b * 60 + 59) : b;
        groups.push({ title: (spec.names && spec.names[c]) || 'Part ' + (c + 1), from: from, to: to,
          test: function (r) { var v = f.get(r); return v >= from && v <= to; } });
      })(c);
    } else if (spec.mode === 'initial') {
      // surname letters split into parts of about the same size
      var counts = {}, total = cs.records.length;
      cs.records.forEach(function (r) { var L = r.last[0]; counts[L] = (counts[L] || 0) + 1; });
      var parts = spec.count || 6, letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(function (L) { return counts[L]; });
      var cur = [], run = 0;
      letters.forEach(function (L, i) {
        cur.push(L); run += counts[L];
        var left = letters.length - i - 1;
        if ((run >= total / parts * (groups.length + 1) && left >= parts - groups.length - 1) || !left) {
          (function (set) {
            groups.push({ title: 'Surnames ' + set[0] + (set.length > 1 ? ' to ' + set[set.length - 1] : ''), letters: set,
              test: function (r) { return set.indexOf(r.last[0]) !== -1; } });
          })(cur);
          cur = [];
        }
      });
    }
    var out = groups.map(function (g, i) { return { title: g.title, g: g, idx: [] }; });
    for (var r = 0; r < cs.records.length; r++) {
      for (var k = 0; k < out.length; k++) if (out[k].g.test(cs.records[r])) { out[k].idx.push(r); break; }
    }
    return out.filter(function (ch) { return ch.idx.length; }).map(function (ch, i) {
      var g = ch.g, sub;
      if (spec.mode === 'time') sub = LK.themes.clock(g.from) + ' to ' + LK.themes.clock(g.to);
      else if (spec.mode === 'date') sub = f.fmt(g.from) + (g.to > g.from ? ' to ' + f.fmt(g.to) : '');
      else if (spec.mode === 'initial') sub = 'Surnames ' + g.letters[0] + (g.letters.length > 1 ? ' to ' + g.letters[g.letters.length - 1] : '');
      else sub = null;
      return {
        n: i + 1, roman: ROMAN[i] || String(i + 1), title: ch.title, mood: (spec.moods && spec.moods[i]) || mood(i), idx: ch.idx,
        sub: sub, note: spec.note || ('Every ' + t.unit.one + ' in this part, in the order of the ' + t.archive.name + '.'), from: g.from, to: g.to
      };
    });
  }

  // ---------- types made of fields ----------
  /*
   * def: { id, label, short, blurb, mode, layout, unit: [one, many], archive: { title, name },
   *        target, counts, defaultCount, settings[], fields(setting) -> raw field list,
   *        columns(setting) -> [{ key, head, align, fields:[keys], get(rec, fs) }], sort(a, b, fs),
   *        keyField (unique code printed for the verdict) or null (use the record's place on the page),
   *        recordLabel(rec, fs), chapters(setting) -> spec or null, ... }
   */
  function fromFields(def) {
    var t = Object.assign({}, def);
    t.unit = units(def.unit[0], def.unit[1]);
    t.target = def.target || { who: 'the killer', poss: 'the killer’s' };
    // what the reader is looking for, in the rules: "the killer", "the killer’s call", "the hideout"
    t.answer = def.answer || (def.mode === 'named' ? 'the killer' : 'the killer’s ' + t.unit.one);
    var fieldCache = {}, tplCache = {};

    t.fieldsFor = function (setting) {
      var key = setting.id;
      if (!fieldCache[key]) {
        var list = def.fields(setting).map(function (f) { return F.define(f, t.target); });
        var byKey = {};
        list.forEach(function (f) { byKey[f.key] = f; });
        fieldCache[key] = { list: list, byKey: byKey };
      }
      return fieldCache[key];
    };
    var keyFields = function (fs) { return fs.list.filter(function (f) { return f.unique; }); };
    function keyOf(f, r) {
      if (f.kind === 'name') return 'n:' + r.first + ' ' + r.last;
      if (f.kind === 'lat') return 'g:' + r.lat + ',' + r.lon;
      return 'c:' + f.key + ':' + r[f.key];
    }
    t.keys = function (r, reg) { return keyFields(reg.fs).map(function (f) { return keyOf(f, r); }); };

    t.generate = function (seed, count, setting) {
      var fs = t.fieldsFor(setting);
      var rng = U.makeRng('archive:' + t.id + ':' + seed);
      var ctx = F.prepare(fs.list, rng, { era: setting.era || def.era || 'classic', geo: setting.geo });
      var used = new Set(), records = [];
      var reg = { records: records, used: used, setting: setting, venue: setting, fs: fs, ctx: ctx };
      for (var i = 0; i < count; i++) {
        var r = null;
        for (var tries = 0; tries < 400; tries++) {
          r = F.randomRecord(fs.list, rng, ctx, i);
          if (def.fix) def.fix(r, rng, setting);
          var ks = t.keys(r, reg);
          if (ks.every(function (k) { return !used.has(k); }) && !famous(r)) { ks.forEach(function (k) { used.add(k); }); break; }
          r = null;
        }
        if (!r) break;
        records.push(r);
      }
      return reg;
    };
    function famous(r) { return r.first && LK.names.isFamous(r.first, r.last); }

    t.templates = function (reg) {
      var key = reg.setting.id;
      if (!tplCache[key]) tplCache[key] = F.templates(reg.fs.list, t.target, reg.setting.atlas);
      return tplCache[key];
    };
    t.context = function (c) { return c; };
    t.groupCap = function (K) { return { first: Math.ceil(K * 0.3), last: Math.ceil(K * 0.35), lat: 2, lon: 2 }; };
    t.clone = function (r) { return Object.assign({}, r); };
    // one random change for the near-miss walk; returns the field changed, or null when the change clashes
    t.mutate = function (p, rng, reg) {
      var f = F.mutateRecord(reg.fs.list, p, rng, reg.ctx);
      if (f.unique || (f.kind === 'lat' && reg.fs.byKey.lat.unique)) {
        var k = keyOf(f.kind === 'lat' ? reg.fs.byKey.lat : f, p);
        if (reg.used.has(k)) return null;
      }
      if (famous(p)) return null;
      return f.kind === 'lat' ? 'lat' : f.key;
    };
    t.mustMove = function (reg) { return keyFields(reg.fs).map(function (f) { return f.key; }); };
    // Names only: a random walk rarely finds a name that fails exactly one clue, so try every
    // first name and surname pair, in an order set by the seed.
    if (def.exhaustive) t.nearMissSearch = function (reg, killer, chain, i, rng) {
      var firsts = rng.shuffle(reg.ctx.first.slice()), lasts = rng.shuffle(LK.names.ALL_LAST.slice());
      var p = { first: '', last: '' }, K = chain.length;
      for (var a = 0; a < firsts.length; a++) {
        p.first = firsts[a];
        for (var b = 0; b < lasts.length; b++) {
          p.last = lasts[b];
          if (chain[i].test(p)) continue;
          var ok = true;
          for (var j = 0; j < K && ok; j++) if (j !== i && !chain[j].test(p)) ok = false;
          if (!ok || reg.used.has('n:' + p.first + ' ' + p.last) || famous(p)) continue;
          return { first: p.first, last: p.last };
        }
      }
      return null;
    };
    t.assign = function (target, src, reg) {
      reg.fs.list.forEach(function (f) {
        if (f.seq) return;
        if (f.kind === 'name') { target.first = src.first; target.last = src.last; }
        else if (f.kind === 'lat') { target.lat = src.lat; target.lon = src.lon; }
        else if (f.kind !== 'lon') target[f.key] = src[f.key];
      });
    };
    t.sort = function (reg) { return function (a, b) { return def.sort(a, b, reg.fs.byKey); }; };
    t.finalize = function (records, reg) {
      reg.fs.list.forEach(function (f) { if (f.seq) records.forEach(function (r, i) { r[f.key] = f.seq + i; }); });
    };

    // ---------- printing ----------
    t.columns = function (cs) { return def.columns(cs.setting, cs.fields); };
    t.row = function (rec, cs) {
      var o = {};
      t.columns(cs).forEach(function (c) { o[c.key] = c.get(rec, cs.fields); });
      return o;
    };
    t.cell = function (rec, cs) { return def.cell(rec, cs.fields); };
    t.gridOrder = def.gridOrder || 'rows';
    t.rangeText = function (a, b, cs) { return def.rangeText ? def.rangeText(a, b, cs.fields) : ''; };
    t.recordLabel = function (rec, cs) { return def.recordLabel(rec, cs && cs.fields); };
    t.ledgerLabel = def.ledgerLabel ? function (rec, cs) { return def.ledgerLabel(rec, cs && cs.fields); } : t.recordLabel;
    t.chapters = function (cs) {
      var spec = def.chapters ? def.chapters(cs.setting, cs.fields) : null;
      return spec ? chaptersBy(cs, spec) : null;
    };
    t.hasChapters = function (setting) { return !!(def.chapters && def.chapters(setting, t.fieldsFor(setting).byKey)); };
    t.keyDigits = function (rec, cs) {
      if (!def.keyField) return null;
      var f = cs.fields[def.keyField];
      return String(f.get(rec)).replace(/\D/g, '');
    };
    // the first hint: where to look and how to read the clue
    t.firstHint = function (clue) { return clue.how || 'Read the clue slowly and check each ' + t.unit.one + ' still in play against it.'; };
    t.describe = function (clue, rec) { return clue.why ? clue.why(rec) : t.recordLabel(rec, null); };
    return t;
  }

  // ---------- the original lottery register ----------
  function lotteryType() {
    var R = LK.register;
    var t = {
      id: 'lottery', label: 'Lottery & raffle tickets', short: 'Lottery tickets', icon: 'ticket', mode: 'ledger', layout: 'table',
      blurb: 'Thousands of raffle tickets: time, table, price, payment and six lucky numbers. The classic “find the killer’s ticket” book.',
      example: '6,000 tickets',
      unit: units('ticket', 'tickets'),
      archive: { title: 'The Ticket Register', name: 'ticket register', kicker: 'Every ticket sold' },
      target: { who: 'the killer', poss: 'the killer’s' }, answer: 'the killer’s ticket',
      counts: [1000, 2000, 3000, 4000, 6000, 8000, 10000], defaultCount: 6000,
      settings: LK.themes.VENUES,
      chapterLabel: ['Chapters through the night', 'One list by ticket number'],
      chapterHint: 'Chapters tell the night hour by hour, the way top-selling puzzle books do. Time clues then rule out whole chapters at once.',
      keyLabel: 'ticket number',
      ledger: {
        title: 'The Patron Ledger', kicker: 'Who bought what', item: 'ticket', items: 'tickets', owner: 'bought',
        intro: function (cs) { return 'These guests bought tickets for ' + cs.venue.draw + '. When only one ticket is left in play, find its number here to learn who bought it.'; },
        prompt: 'A Patron Ledger lists the named guests and the ticket numbers each one bought.'
      },
      generate: function (seed, count, setting) { return R.generate(seed, count, setting); },
      templates: function () { return LK.clues.TEMPLATES; },
      context: function (c, reg) {
        c.venue = reg.venue; c.places = reg.places; c.place = reg.venue.place.toLowerCase();
        return c;
      },
      clone: function (r) { return { t: r.t, m: r.m, p: r.p, pay: r.pay, amt: r.amt, n: r.n.slice(), i: r.i }; },
      // the original walk: one random change to the ticket, time, place, payment, amount, numbers or initials
      mutate: function (p, rng, reg) {
        var venue = reg.venue, f = rng.int(7);
        if (f === 0) {
          if (rng.next() < 0.5) p.t = 10000 + rng.int(90000);
          else {
            var s = String(p.t).split(''), pos = rng.int(5);
            s[pos] = String(pos === 0 ? 1 + rng.int(9) : rng.int(10));
            p.t = Number(s.join(''));
          }
          if (reg.used.has(p.t)) return null;
          return 't';
        }
        if (f === 1) p.m = venue.start + rng.int(venue.end - venue.start + 1);
        else if (f === 2) p.p = 1 + rng.int(reg.places);
        else if (f === 3) p.pay = rng.int(4);
        else if (f === 4) p.amt = rng.int(4);
        else if (f === 5) {
          var v = 1 + rng.int(R.NUM_MAX);
          if (p.n.indexOf(v) !== -1) return null;
          p.n[rng.int(6)] = v;
          p.n.sort(function (a, b) { return a - b; });
        } else {
          var L = R.INITIALS[rng.int(R.INITIALS.length)];
          p.i = rng.int(2) ? p.i[0] + L : L + p.i[1];
        }
        return 'x';
      },
      mustMove: function () { return ['t']; },
      keys: function (r) { return [r.t]; },
      assign: function (target, nm) { target.t = nm.t; target.m = nm.m; target.p = nm.p; target.pay = nm.pay; target.amt = nm.amt; target.n = nm.n; target.i = nm.i; },
      sort: function () { return function (a, b) { return a.t - b.t; }; },
      finalize: function () {},
      columns: function (cs) {
        return [
          { key: 'ticket', head: 'TICKET', align: 'left' },
          { key: 'time', head: 'TIME', align: 'right' },
          { key: 'place', head: cs.venue.placeShort, align: 'right' },
          { key: 'amount', head: 'PAID', align: 'right' },
          { key: 'method', head: 'METHOD', align: 'left' },
          { key: 'numbers', head: 'LUCKY NUMBERS', align: 'left' },
          { key: 'initials', head: 'INITIALS', align: 'left' }
        ];
      },
      row: function (rec, cs) { return R.row(rec, cs.venue); },
      recordLabel: function (rec) { return 'Ticket ' + rec.t; },
      ledgerLabel: function (rec) { return String(rec.t); },
      rangeText: function (a, b) { return 'Tickets ' + a.t + ' to ' + b.t; },
      chapters: function (cs) { return LK.extras.lotteryChapters(cs); },
      hasChapters: function () { return true; },
      keyDigits: function (rec) { return String(rec.t); },
      firstHint: function (clue, cs, chaptered) { return LK.extras.firstHint(clue, cs, chaptered); },
      describe: function (clue, rec, cs) { return LK.extras.describe(clue, rec, cs); }
    };
    return t;
  }

  LK.types = { register: register, get: get, all: all, fromFields: fromFields, chaptersBy: chaptersBy, units: units, lottery: lotteryType, ROMAN: ROMAN };
})(typeof window !== 'undefined' ? window : globalThis);
