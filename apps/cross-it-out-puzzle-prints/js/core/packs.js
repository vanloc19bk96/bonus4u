/*
 * Puzzle packs: the raw material the AI writes (or the starter library ships).
 *   { id, topic, cases:[{ title, story }], options:[text], facts:[{ clue, not, yes:[index], maybe:[index] }], source }
 * This file reads packs out of a pasted AI reply, cleans every part, maps fact lists onto the
 * options, and reports what was fixed or dropped, in plain words, so the fix prompt can ask
 * the AI for exactly what is missing.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var U = CX.util, T = CX.text, C = CX.clues;

  var MIN_OPTIONS = 12;      // a warm-up needs 12
  var GOOD_OPTIONS = 24;     // a master file needs 24
  var MAX_OPTIONS = 40;
  var MAX_FACTS = 12;

  // Clue words that belong to the app's letter clues, not to knowledge facts.
  var LETTER_TALK = /\b(letters?|vowels?|consonants?|syllables?|spell(?:s|ed|t|ing)?|alphabet|rhymes?|starts? with|ends? with|begins? with|initials?|plural|singular|words?|anagram)\b/i;
  var OPINION = /\b(delicious|tasty|yummy|cute|beautiful|pretty|ugly|boring|fun|best|worst|favou?rite|popular|expensive|cheap|nice|lovely|gross|scary|cool|amazing)\b/i;

  function key(t) { return String(t).toUpperCase().replace(/[^A-Z]/g, ''); }
  // CUP, CUPS, CUPES; BERRY, BERRIES; KNIFE, KNIVES
  function stems(k) {
    var out = [k];
    if (/IES$/.test(k)) out.push(k.slice(0, -3) + 'Y');
    if (/VES$/.test(k)) { out.push(k.slice(0, -3) + 'F'); out.push(k.slice(0, -3) + 'FE'); }
    if (/ES$/.test(k)) out.push(k.slice(0, -2));
    if (/S$/.test(k)) out.push(k.slice(0, -1));
    return out;
  }

  function cleanClue(raw) {
    var t = T.cleanLine(raw || '');
    t = t.replace(/^["“”'‘’]+|["“”'‘’]+$/g, '');
    t = t.replace(/^(?:cross (?:it|them) out if|cross out if|cross out)\s*(?:…|\.\.\.)?\s*/i, '').replace(/^if\s+/i, '');
    t = t.replace(/^(?:…|\.\.\.)\s*/, '').replace(/[.!;:,]+$/, '').trim();
    if (t) t = t[0].toUpperCase() + t.slice(1);
    t = t.replace(/^It'S\b/, 'It’s').replace(/^It's\b/, 'It’s');
    return t;
  }

  /*
   * One pack from whatever shape the AI used. Returns { pack, notes:[text], error } where error
   * means the pack cannot be used at all.
   */
  function normalize(raw, n) {
    var notes = [], label = 'Pack ' + n;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { pack: null, notes: [], error: label + ' is not a pack.' };
    var topic = T.cleanLine(raw.topic || raw.title || '').replace(/[.!]+$/, '');
    if (topic) label = '“' + topic + '”';

    // options
    var rawOpts = raw.options || raw.items || raw.list || [];
    if (typeof rawOpts === 'string') rawOpts = rawOpts.split(/[,;\n•·]+/);
    if (!Array.isArray(rawOpts)) rawOpts = [];
    var options = [], seen = {}, dropped = [];
    rawOpts.forEach(function (o) {
      if (o && typeof o === 'object') o = o.name || o.option || o.text || o.topic || '';
      var c = C.cleanOption(o);
      if (!c.ok) { if (c.text) dropped.push(c.text + ' (' + c.reason + ')'); return; }
      var k = key(c.text);
      var clash = stems(k).some(function (s) { return seen[s]; }) || seen[k + 'S'] || seen[k + 'ES'];
      if (clash) { dropped.push(c.text + ' (a repeat)'); return; }
      seen[k] = c.text;
      options.push(c.text);
    });
    if (options.length > MAX_OPTIONS) { dropped.push((options.length - MAX_OPTIONS) + ' options over the limit of ' + MAX_OPTIONS); options = options.slice(0, MAX_OPTIONS); }
    if (dropped.length) notes.push(label + ': left out ' + dropped.slice(0, 6).join(', ') + (dropped.length > 6 ? ' and ' + (dropped.length - 6) + ' more' : '') + '.');
    if (!topic) topic = options.slice(0, 3).join(', ') || 'Untitled pack';

    var index = {};
    options.forEach(function (o, i) { index[key(o)] = i; });
    function find(name) {
      if (name && typeof name === 'object') name = name.name || name.option || '';
      var k = key(C.cleanOption(name).text || name);
      if (!k) return -1;
      var ss = stems(k).concat([k + 'S', k + 'ES']);
      for (var i = 0; i < ss.length; i++) if (index[ss[i]] !== undefined) return index[ss[i]];
      return -1;
    }

    // cases
    var rawCases = raw.cases;
    if (!Array.isArray(rawCases)) rawCases = rawCases ? [rawCases] : [];
    if (!rawCases.length && (raw.story || raw.title)) rawCases = [{ title: raw.title || topic, story: raw.story || '' }];
    var cases = [];
    rawCases.forEach(function (cs) {
      if (typeof cs === 'string') cs = { title: '', story: cs };
      if (!cs || typeof cs !== 'object') return;
      var title = T.cleanTitle(cs.title || '').replace(/[.!?]+$/, '');
      var story = T.cleanParagraphs(cs.story || cs.text || '').join(' ');
      if (!title && !story) return;
      if (!title) title = 'The ' + topic.replace(/^the\s+/i, '');
      if (title.length > 44) title = T.shortenAtWord(title, 44);
      if (story.length > 190) { story = T.shortenAtWord(story, 186) + '…'; notes.push(label + ': a story was too long and was shortened.'); }
      cases.push({ title: title, story: story });
    });
    if (cases.length > 4) cases = cases.slice(0, 4);

    // facts
    var rawFacts = raw.facts;
    if (!Array.isArray(rawFacts)) rawFacts = [];
    var facts = [], factSeen = {}, factNotes = [];
    rawFacts.forEach(function (f) {
      if (!f || typeof f !== 'object') return;
      var clue = cleanClue(f.clue || f.story || '');
      if (!clue) return;
      if (!/^it(?:’s|'s|s)?\b/i.test(clue)) { factNotes.push('“' + clue + '” (must start with “It”)'); return; }
      if (LETTER_TALK.test(clue)) { factNotes.push('“' + clue + '” (letter and word clues are made by the app)'); return; }
      if (OPINION.test(clue)) { factNotes.push('“' + clue + '” (an opinion, not a fact)'); return; }
      if (clue.length > 60) { factNotes.push('“' + T.shortenAtWord(clue, 40) + '…” (too long)'); return; }
      var fk = clue.toLowerCase();
      if (factSeen[fk]) return;
      var yes = [], maybe = [], unknown = [];
      [].concat(f.yes || []).forEach(function (nm) { var i = find(nm); if (i < 0) { if (nm) unknown.push(String(nm)); } else if (yes.indexOf(i) === -1) yes.push(i); });
      [].concat(f.maybe || []).forEach(function (nm) { var i = find(nm); if (i < 0) { if (nm) unknown.push(String(nm)); } else if (maybe.indexOf(i) === -1) maybe.push(i); });
      // listed as both: treat as debatable
      yes = yes.filter(function (i) { return maybe.indexOf(i) === -1; });
      if (unknown.length) notes.push(label + ': the fact “' + clue + '” named ' + unknown.slice(0, 3).join(', ') + (unknown.length > 3 ? '…' : '') + ', not in the options; ignored.');
      if (!yes.length) { factNotes.push('“' + clue + '” (describes none of the options)'); return; }
      if (yes.length + maybe.length >= options.length - 1) { factNotes.push('“' + clue + '” (describes nearly every option)'); return; }
      var not = cleanClue(f.not || '');
      if (not && (!/^it\b/i.test(not) || !/\b(not|never|no)\b|n['’]t\b/i.test(not) || LETTER_TALK.test(not))) not = '';
      factSeen[fk] = 1;
      facts.push({ clue: clue, not: not, yes: yes.sort(function (a, b) { return a - b; }), maybe: maybe.sort(function (a, b) { return a - b; }) });
    });
    if (facts.length > MAX_FACTS) facts = facts.slice(0, MAX_FACTS);
    if (factNotes.length) notes.push(label + ': left out the fact' + (factNotes.length > 1 ? 's ' : ' ') + factNotes.slice(0, 4).join(', ') + (factNotes.length > 4 ? ' and ' + (factNotes.length - 4) + ' more' : '') + '.');

    var error = '';
    if (options.length < MIN_OPTIONS) error = label + ' has only ' + options.length + ' usable options. It needs at least ' + MIN_OPTIONS + ' (' + GOOD_OPTIONS + ' or more for the hardest level).';
    else if (!cases.length) error = label + ' has no mystery (title and story).';

    var pack = {
      id: 'p' + U.hashHex(topic.toLowerCase() + '|' + options.join('|')).slice(0, 10),
      topic: topic, cases: cases, options: options, facts: facts, source: 'ai'
    };
    return { pack: pack, notes: notes, error: error };
  }

  /*
   * Every pack in a pasted reply. Returns { packs:[pack], errors:[text], notes:[text], found (raw count), cutOff }.
   */
  function read(text) {
    var objs = CX.reader.allObjects(text);
    var raws = [];
    objs.forEach(function (o) {
      if (Array.isArray(o.packs)) raws = raws.concat(o.packs);
      else if (Array.isArray(o.items) && o.items.length && typeof o.items[0] === 'object') raws = raws.concat(o.items);
      else if (o.options || o.items) raws.push(o);
    });
    var src = String(text || '');
    var cutOff = !!(src.trim() && objs.length && !/[}\]]\s*(?:```)?\s*$/.test(src.trim()));
    var packs = [], errors = [], notes = [], ids = {};
    raws.forEach(function (raw, i) {
      var r = normalize(raw, i + 1);
      notes = notes.concat(r.notes);
      if (r.error) { errors.push(r.error); return; }
      if (!r.pack || ids[r.pack.id]) return;
      ids[r.pack.id] = 1;
      packs.push(r.pack);
    });
    return { packs: packs, errors: errors, notes: notes, found: raws.length, cutOff: cutOff };
  }

  // Quick facts about a pack for the lists in the sidebar.
  function summary(pack) {
    var n = pack.options.length;
    return {
      options: n, facts: pack.facts.length, cases: pack.cases.length,
      levels: CX.engine.LEVELS.filter(function (l) { return n >= l.lineup[0]; }).map(function (l) { return l.id; })
    };
  }

  // A clean copy for saving (no cached engine data).
  function plain(pack) {
    return { id: pack.id, topic: pack.topic, cases: U.clone(pack.cases), options: pack.options.slice(), facts: U.clone(pack.facts), source: pack.source || 'ai', off: !!pack.off };
  }

  // Packs from a saved file, checked again so a hand-edited file cannot break the engine.
  function fromSaved(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (p, i) {
      if (!p || !Array.isArray(p.options)) return;
      var r = normalize({
        topic: p.topic, cases: p.cases, options: p.options,
        facts: (p.facts || []).map(function (f) {
          var name = function (i2) { return typeof i2 === 'number' ? p.options[i2] : i2; };
          return { clue: f.clue, not: f.not, yes: (f.yes || []).map(name), maybe: (f.maybe || []).map(name) };
        })
      }, i + 1);
      if (r.error || !r.pack) return;
      r.pack.source = p.source || 'ai';
      r.pack.off = !!p.off;
      out.push(r.pack);
    });
    return out;
  }

  // Marks an option as debatable for a fact (after a fact-check). Returns true when it changed.
  function markDebatable(pack, factIndex, optIndex) {
    var f = pack.facts[factIndex];
    if (!f) return false;
    var changed = false;
    var yi = f.yes.indexOf(optIndex);
    if (yi !== -1) { f.yes.splice(yi, 1); changed = true; }
    if (f.maybe.indexOf(optIndex) === -1) { f.maybe.push(optIndex); f.maybe.sort(function (a, b) { return a - b; }); changed = true; }
    // a fact left with no firm options is simply never used (indices of the others stay put)
    if (changed) { delete pack._prep; delete pack._hash; }
    return changed;
  }

  CX.packs = { MIN_OPTIONS: MIN_OPTIONS, GOOD_OPTIONS: GOOD_OPTIONS, normalize: normalize, read: read, summary: summary, plain: plain, fromSaved: fromSaved, markDebatable: markDebatable, key: key };
})(typeof window !== 'undefined' ? window : globalThis);
