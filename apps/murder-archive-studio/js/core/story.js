/*
 * The story: reading the AI's answer, merging fixes, and checking it.
 * Messages produced here are shown to the user, so they use plain words only.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var T = LK.text, U = LK.util;

  var KEYS = ['titles', 'subtitle', 'blurb', 'keywords', 'setting', 'victim', 'client', 'prologue', 'letter', 'clue_notes', 'interludes', 'patrons', 'killer', 'motive', 'epilogue'];

  function str(v) { return v == null ? '' : (typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : '')); }

  function person(v) {
    if (!v) return null;
    if (typeof v === 'string') return { name: T.cleanLine(v), who: '' };
    return { name: T.cleanLine(str(v.name)), who: T.cleanLine(str(v.who || v.role)) };
  }

  function section(v, needTitle) {
    if (!v) return null;
    if (typeof v === 'string') v = { text: v };
    var out = { paragraphs: T.cleanParagraphs(str(v.text)) };
    if (needTitle) out.title = T.cleanTitle(str(v.title));
    return out;
  }

  // Turns a pasted answer (whole story or a partial fix) into story fields. Unknown keys are ignored.
  function fromAnswer(obj) {
    var out = {};
    if (obj.titles !== undefined) {
      var t = Array.isArray(obj.titles) ? obj.titles : [obj.titles];
      out.titles = t.map(function (x) { return T.cleanTitle(typeof x === 'object' && x ? str(x.title) : str(x)); }).filter(Boolean);
    }
    if (obj.subtitle !== undefined) out.subtitle = T.cleanLine(str(obj.subtitle));
    if (obj.blurb !== undefined) out.blurb = T.cleanParagraphs(str(obj.blurb)).join('\n\n');
    if (obj.keywords !== undefined) {
      var k = Array.isArray(obj.keywords) ? obj.keywords : str(obj.keywords).split(/[,;\n]/);
      out.keywords = k.map(function (x) { return T.cleanLine(str(x)).replace(/[“”"]/g, ''); }).filter(Boolean);
    }
    if (obj.setting !== undefined) out.setting = T.cleanLine(str(obj.setting));
    if (obj.victim !== undefined) out.victim = person(obj.victim);
    if (obj.client !== undefined) out.client = person(obj.client);
    if (obj.prologue !== undefined) out.prologue = section(obj.prologue, true);
    if (obj.letter !== undefined) out.letter = section(obj.letter, false);
    if (obj.epilogue !== undefined) out.epilogue = section(obj.epilogue, true);
    if (obj.clue_notes !== undefined) {
      var notes = {}, titles = {};
      var arr = Array.isArray(obj.clue_notes) ? obj.clue_notes : [];
      arr.forEach(function (x, i) {
        var n = typeof x === 'object' && x ? parseInt(x.n, 10) : NaN;
        if (!(n > 0)) n = i + 1;
        var note = typeof x === 'string' ? x : str(x && (x.note || x.text));
        notes[n] = T.cleanLine(note);
        var ti = typeof x === 'object' && x ? T.cleanTitle(str(x.title)) : '';
        if (ti) titles[n] = ti;
      });
      out.clueNotes = notes;
      out.clueTitles = titles;
    }
    if (obj.interludes !== undefined) {
      out.interludes = (Array.isArray(obj.interludes) ? obj.interludes : []).map(function (x, i) {
        if (typeof x === 'string') x = { text: x };
        if (!x || typeof x !== 'object') return null;
        var sec = section(x, true);
        return { after: parseInt(x.after, 10) || 0, title: sec.title, paragraphs: sec.paragraphs };
      }).filter(function (x) { return x && x.paragraphs.length; });
    }
    if (obj.patrons !== undefined) {
      out.patrons = (Array.isArray(obj.patrons) ? obj.patrons : []).map(function (p) {
        if (typeof p === 'string') return { name: T.cleanLine(p), role: '', note: '' };
        return { name: T.cleanLine(str(p.name)), role: T.cleanLine(str(p.role)), note: T.cleanLine(str(p.note || p.who)) };
      }).filter(function (p) { return p.name; });
    }
    if (obj.killer !== undefined) out.killer = T.cleanLine(typeof obj.killer === 'object' && obj.killer ? str(obj.killer.name) : str(obj.killer));
    if (obj.motive !== undefined) out.motive = T.cleanLine(str(obj.motive));
    return out;
  }

  /*
   * Reads pasted text. Returns { story fields } or null when nothing usable was found.
   */
  function read(text) {
    var obj = LK.reader.pickAnswer(text, KEYS);
    if (!obj) return null;
    var fields = fromAnswer(obj);
    return Object.keys(fields).length ? fields : null;
  }

  function merge(base, fields) {
    var out = U.clone(base || {});
    Object.keys(fields).forEach(function (k) {
      if ((k === 'clueNotes' || k === 'clueTitles') && out[k]) {
        Object.keys(fields[k]).forEach(function (n) { out[k][n] = fields[k][n]; });
      } else out[k] = U.clone(fields[k]);
    });
    return out;
  }

  // ---------- checks ----------
  function issue(level, field, text) { return { level: level, field: field, text: text }; }
  function words(paragraphs) { return U.countWords((paragraphs || []).join(' ')); }
  function nameKey(s) { return T.stripAccents(String(s || '')).toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim(); }

  var FAMOUS = ['miss marple', 'jane marple', 'hercule poirot', 'poirot', 'sherlock holmes', 'sherlock', 'jessica fletcher',
    'nancy drew', 'father brown', 'peter wimsey', 'nero wolfe', 'philip marlowe', 'sam spade', 'ellery queen', 'benoit blanc',
    'cormoran strike', 'adrian monk', 'columbo', 'agatha christie', 'arthur conan doyle', 'james patterson', 'alice'];
  var BANNED_TITLE = ['lottery killer', 'killer isnt alice', 'murdle', 'cluedo', 'agatha christie', 'sherlock', 'poirot', 'killer is still on board',
    'killer never checked in', 'killer was on the guest list', 'killer signed the register', 'killer bought a ticket', 'one killer mysteries', 'sealed verdict', 'one name remains'];
  var BANNED_KEYWORDS = ['bestseller', 'best seller', 'best-selling', 'bestselling', 'free', 'kindle unlimited', 'new release',
    'on sale', 'amazon', 'kindle', 'lottery killer', 'murdle', 'agatha christie', 'james patterson', 'remington', 'iris starling', 'killer isnt alice', 'myra cross'];

  function hasPhrase(text, list) {
    var t = ' ' + nameKey(text).replace(/'/g, '') + ' ';
    for (var i = 0; i < list.length; i++) if (t.indexOf(' ' + nameKey(list[i]) + ' ') !== -1) return list[i];
    return null;
  }

  /*
   * Checks the story against the current case. Returns a list of issues:
   * errors block the download, warnings are worth a look.
   */
  function check(story, cs, project) {
    var out = [];
    if (!story) return [issue('error', null, 'There is no story yet.')];
    var K = cs.clues.length, t = cs.type, named = t.mode === 'named';

    var titles = story.titles || [];
    if (!titles.length) out.push(issue('error', 'titles', 'The title ideas are missing.'));
    titles.forEach(function (ti) {
      if (ti.length > 80) out.push(issue('warning', 'titles', 'The title “' + T.shortenAtWord(ti, 40) + '…” is long for a cover.'));
      var bad = hasPhrase(ti, BANNED_TITLE);
      if (bad) out.push(issue('error', 'titles', 'The title “' + ti + '” uses “' + bad + '”, the name of an existing book or brand. Amazon may block it.'));
    });
    var title = LK.book.title(project);
    if (title && hasPhrase(title, BANNED_TITLE)) out.push(issue('error', 'titles', 'Your book title uses the name of an existing book or brand (“' + hasPhrase(title, BANNED_TITLE) + '”). Pick another title.'));

    if (!story.subtitle) out.push(issue('warning', 'subtitle', 'The subtitle is missing.'));
    else if ((title + ': ' + story.subtitle).length > 200) out.push(issue('error', 'subtitle', 'Title and subtitle together are over 200 characters, the Amazon limit.'));

    var bw = U.countWords(story.blurb || '');
    if (!bw) out.push(issue('error', 'blurb', 'The book description (blurb) is missing.'));
    else if (bw < 60 || bw > 320) out.push(issue('warning', 'blurb', 'The book description has ' + bw + ' words; 120 to 200 reads best.'));
    if ((story.blurb || '').length > 4000) out.push(issue('error', 'blurb', 'The book description is over 4,000 characters, the Amazon limit.'));

    var kw = story.keywords || [];
    if (kw.length !== 7) out.push(issue('warning', 'keywords', 'There are ' + kw.length + ' keywords; Amazon gives you 7 slots.'));
    kw.forEach(function (k) {
      if (k.length > 50) out.push(issue('error', 'keywords', 'The keyword “' + T.shortenAtWord(k, 30) + '…” is over 50 characters.'));
      var bad = hasPhrase(k, BANNED_KEYWORDS);
      if (bad) out.push(issue('error', 'keywords', 'The keyword “' + k + '” uses “' + bad + '”, which Amazon does not allow in keywords.'));
    });

    if (!story.victim || !story.victim.name) out.push(issue('error', 'victim', 'The victim\'s name is missing.'));
    // parts the user left out of the book are not checked
    var has = function (key) { return LK.book.hasPage(project, key); };
    if (has('letter') && (!story.client || !story.client.name)) out.push(issue('error', 'client', 'The letter writer\'s name is missing.'));

    if (has('prologue')) {
      var pw = story.prologue ? words(story.prologue.paragraphs) : 0;
      if (!pw) out.push(issue('error', 'prologue', 'The prologue is missing.'));
      else if (pw < 300 || pw > 900) out.push(issue('warning', 'prologue', 'The prologue has ' + pw + ' words; 450 to 650 is the target.'));
      if (story.prologue && !story.prologue.title) out.push(issue('warning', 'prologue', 'The prologue has no title; the book will call it “Prologue”.'));
    }

    if (has('letter')) {
      var lw = story.letter ? words(story.letter.paragraphs) : 0;
      if (!lw) out.push(issue('error', 'letter', 'The letter is missing.'));
      else if (lw < 120 || lw > 400) out.push(issue('warning', 'letter', 'The letter has ' + lw + ' words; 180 to 280 is the target.'));
    }

    if (has('epilogue')) {
      var ew = story.epilogue ? words(story.epilogue.paragraphs) : 0;
      if (!ew) out.push(issue('error', 'epilogue', 'The epilogue (the reveal) is missing.'));
      else if (ew < 250 || ew > 900) out.push(issue('warning', 'epilogue', 'The epilogue has ' + ew + ' words; 400 to 600 is the target.'));
    }

    // the killer: from the ledger the AI wrote, or fixed by the archive
    var killerKey = named ? nameKey(LK.book.killerName(project, cs)) : nameKey(story.killer);
    var killerLast = killerKey.split(' ').pop();
    var namesKiller = function (text) {
      var k = ' ' + nameKey(text) + ' ';
      return !!killerKey && (k.indexOf(' ' + killerKey + ' ') !== -1 || (killerLast.length > 3 && k.indexOf(' ' + killerLast + ' ') !== -1));
    };

    // clue notes must match the clues of the current case
    var notes = story.clueNotes || {}, ctitles = story.clueTitles || {};
    var missing = [], digits = [], long = [], spoil = [], tdigits = [], noTitle = 0;
    for (var n = 1; n <= K; n++) {
      var note = notes[n];
      if (!note) { missing.push(n); continue; }
      if (/\d/.test(note)) digits.push(n);
      if (U.countWords(note) > 55) long.push(n);
      if (namesKiller(note) || (ctitles[n] && namesKiller(ctitles[n]))) spoil.push(n);
      if (ctitles[n] && /\d/.test(ctitles[n])) tdigits.push(n);
      if (!ctitles[n]) noTitle++;
    }
    if (story.caseKey && story.caseKey !== LK.book.caseKey(project)) {
      out.push(issue('error', 'clue_notes', 'Your settings changed after you pasted the story, so the clues are new. Refresh the clue notes (one short prompt in step 2).'));
    } else {
      if (missing.length) out.push(issue('error', 'clue_notes', 'Clue notes are missing for clue ' + missing.join(', ') + '.'));
      if (digits.length) out.push(issue('error', 'clue_notes', 'Clue notes ' + digits.join(', ') + ' contain digits. Notes must not repeat or change the numbers in the clue.'));
      if (tdigits.length) out.push(issue('error', 'clue_notes', 'The titles of clues ' + tdigits.join(', ') + ' contain digits. Titles must not give numbers away.'));
      if (spoil.length) out.push(issue('error', 'clue_notes', 'Clue notes ' + spoil.join(', ') + ' name the killer, which spoils the puzzle.'));
      if (long.length) out.push(issue('warning', 'clue_notes', 'Clue notes ' + long.join(', ') + ' are long; 12 to 40 words fit best.'));
      if (noTitle && noTitle < K) out.push(issue('warning', 'clue_notes', noTitle + ' clues have no title. They print with their number only.'));
    }

    var inter = story.interludes || [];
    if (inter.length && inter.length < LK.prompts.INTERLUDES) out.push(issue('warning', 'interludes', 'There are ' + inter.length + ' interludes instead of ' + LK.prompts.INTERLUDES + '. That still works.'));
    inter.forEach(function (x) {
      var w = words(x.paragraphs);
      if (w > 180) out.push(issue('warning', 'interludes', 'The interlude “' + (x.title || 'untitled') + '” has ' + w + ' words; 60 to 110 fit best.'));
      if (/\d/.test(x.paragraphs.join(' '))) out.push(issue('warning', 'interludes', 'The interlude “' + (x.title || 'untitled') + '” contains digits. Check that it does not give away a clue.'));
    });

    var seen = {};
    if (!named) {
      var patrons = story.patrons || [];
      var P = LK.prompts.PATRONS, word = t.id === 'lottery' ? 'patrons' : 'suspects';
      if (patrons.length < 12) out.push(issue('error', 'patrons', 'The ledger has ' + patrons.length + ' ' + word + '; it needs ' + P + '.'));
      else if (patrons.length !== P) out.push(issue('warning', 'patrons', 'The ledger has ' + patrons.length + ' ' + word + ' instead of ' + P + '. That still works.'));
      if (patrons.length > 40) out.push(issue('error', 'patrons', 'The ledger has too many ' + word + ' (' + patrons.length + '); it needs ' + P + '.'));
      patrons.forEach(function (p) {
        var k = nameKey(p.name);
        if (seen[k]) out.push(issue('error', 'patrons', '“' + p.name + '” appears twice in the ledger.'));
        seen[k] = true;
        if (k.split(' ').length < 2) out.push(issue('warning', 'patrons', '“' + p.name + '” needs a first and last name.'));
      });
      var killer = patrons.filter(function (p) { return nameKey(p.name) === killerKey; });
      if (!story.killer) out.push(issue('error', 'killer', 'The killer is not named.'));
      else if (!killer.length) out.push(issue('error', 'killer', 'The killer “' + story.killer + '” is not one of the ' + word + ' in the ledger.'));
      [story.victim, story.client].forEach(function (pp) {
        if (pp && pp.name && seen[nameKey(pp.name)]) out.push(issue('warning', 'patrons', '“' + pp.name + '” is in the ledger but is also the ' + (pp === story.victim ? 'victim' : 'letter writer') + '.'));
      });
    } else {
      // the victim and the letter writer must not share a name with anyone in the archive
      var archiveNames = {};
      cs.records.forEach(function (r) { archiveNames[nameKey(r.first + ' ' + r.last)] = true; });
      [story.victim, story.client].forEach(function (pp) {
        if (pp && pp.name && archiveNames[nameKey(pp.name)]) out.push(issue('warning', pp === story.victim ? 'victim' : 'client', '“' + pp.name + '” is also a name in the ' + t.archive.name + '. Readers may find that confusing.'));
      });
      if (has('epilogue') && story.epilogue && story.epilogue.paragraphs && !namesKiller(story.epilogue.paragraphs.join(' '))) {
        out.push(issue('warning', 'epilogue', 'The epilogue never names the killer, ' + LK.book.killerName(project, cs) + '.'));
      }
    }

    // famous names
    var all = named ? [] : (story.patrons || []).map(function (p) { return p.name; });
    if (story.victim) all.push(story.victim.name);
    if (story.client) all.push(story.client.name);
    all.forEach(function (nm) {
      var hit = hasPhrase(nm, FAMOUS.filter(function (f) { return f !== 'alice'; }));
      if (hit) out.push(issue('warning', 'patrons', '“' + nm + '” is the name of a famous detective or author. Pick an original name before you publish.'));
    });
    var author = nameKey(project.setup.author);
    if (author && hasPhrase(author, FAMOUS.filter(function (f) { return f.indexOf(' ') !== -1; }))) {
      out.push(issue('error', null, 'Your pen name matches a famous author. Amazon does not allow that.'));
    }
    if (!named && has('epilogue') && story.epilogue && story.epilogue.paragraphs && !/\[\s*(TICKET|ANSWER)\s*\]/i.test(story.epilogue.paragraphs.join(' '))) {
      out.push(issue('warning', 'epilogue', 'The epilogue never mentions the answer itself (the ' + t.ledger.item + '). That is fine, but readers like to see it.'));
    }
    return out;
  }

  LK.story = { KEYS: KEYS, read: read, fromAnswer: fromAnswer, merge: merge, check: check, nameKey: nameKey };
})(typeof window !== 'undefined' ? window : globalThis);
