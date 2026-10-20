/*
 * Reading the AI's pasted answer and checking it.
 * The reader is forgiving: code fences, chatter around the answer, curly quotes, trailing commas,
 * raw line breaks inside strings and unquoted keys are all accepted.
 * Messages produced here are shown to the user, so they use plain words only.
 */
(function (root) {
  'use strict';
  var Cozy = root.Cozy = root.Cozy || {};
  var T = Cozy.text, U = Cozy.util;

  // ---------- forgiving reader ----------
  function Reader(src, pos) { this.s = src; this.p = pos; }
  Reader.prototype.fail = function () { throw new Error('unreadable at ' + this.p); };
  Reader.prototype.ws = function () {
    var s = this.s;
    for (;;) {
      var c = s[this.p];
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === ' ' || c === '﻿') { this.p++; continue; }
      if (c === '/' && s[this.p + 1] === '/') { while (this.p < s.length && s[this.p] !== '\n') this.p++; continue; }
      if (c === '/' && s[this.p + 1] === '*') { var e = s.indexOf('*/', this.p + 2); this.p = e < 0 ? s.length : e + 2; continue; }
      return c;
    }
  };
  Reader.prototype.value = function () {
    var c = this.ws();
    if (c === '{') return this.object();
    if (c === '[') return this.array();
    if (c === '"' || c === '“' || c === '”' || c === "'" || c === '‘' || c === '’') return this.string();
    if (c === '-' || (c >= '0' && c <= '9')) return this.number();
    var m = /^(true|false|null)\b/.exec(this.s.slice(this.p, this.p + 6));
    if (m) { this.p += m[1].length; return m[1] === 'true' ? true : m[1] === 'false' ? false : null; }
    // bare word value (e.g. word lists without quotes): read up to , ] }
    var start = this.p;
    while (this.p < this.s.length && !/[,\]}\n]/.test(this.s[this.p])) this.p++;
    var raw = this.s.slice(start, this.p).trim();
    if (!raw) this.fail();
    return raw;
  };
  Reader.prototype.object = function () {
    this.p++;
    var out = {};
    for (;;) {
      var c = this.ws();
      if (c === '}') { this.p++; return out; }
      if (c === ',') { this.p++; continue; }
      if (c === undefined) this.fail();
      var key;
      if (c === '"' || c === '“' || c === '”' || c === "'" || c === '‘' || c === '’') key = this.string(true);
      else {
        var m = /^[A-Za-z_$][\w$-]*/.exec(this.s.slice(this.p, this.p + 64));
        if (!m) this.fail();
        key = m[0]; this.p += key.length;
      }
      if (this.ws() !== ':') this.fail();
      this.p++;
      out[key] = this.value();
      c = this.ws();
      if (c === ',') { this.p++; continue; }
      if (c === '}') { this.p++; return out; }
      // missing comma between members: tolerate when the next thing looks like a key
      if (c === '"' || c === '“' || /[A-Za-z_]/.test(c || '')) continue;
      this.fail();
    }
  };
  Reader.prototype.array = function () {
    this.p++;
    var out = [];
    for (;;) {
      var c = this.ws();
      if (c === ']') { this.p++; return out; }
      if (c === ',') { this.p++; continue; }
      if (c === undefined) this.fail();
      out.push(this.value());
      c = this.ws();
      if (c === ',') { this.p++; continue; }
      if (c === ']') { this.p++; return out; }
      if (c === '{' || c === '"' || c === '“') continue; // missing comma
      this.fail();
    }
  };
  Reader.prototype.number = function () {
    var m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.s.slice(this.p, this.p + 40));
    if (!m) this.fail();
    this.p += m[0].length;
    return Number(m[0]);
  };
  // A closing quote only counts when what follows looks like the end of a value.
  Reader.prototype.closesHere = function (i, isKey) {
    var s = this.s, j = i + 1;
    while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\r' || s[j] === '\n')) j++;
    var n = s[j];
    if (n === undefined) return true;
    if (isKey) return n === ':';
    return n === ',' || n === '}' || n === ']' || n === ':';
  };
  Reader.prototype.string = function (isKey) {
    var s = this.s, open = s[this.p];
    var closers = open === '"' ? ['"', '”'] : (open === '“' || open === '”') ? ['”', '"', '“'] : ["'", '’'];
    this.p++;
    var out = '';
    while (this.p < s.length) {
      var c = s[this.p];
      if (c === '\\') {
        var n = s[this.p + 1];
        var map = { n: '\n', t: ' ', r: '', b: '', f: '', '"': '"', "'": "'", '\\': '\\', '/': '/' };
        if (n === 'u') { out += String.fromCharCode(parseInt(s.substr(this.p + 2, 4), 16) || 32); this.p += 6; continue; }
        out += map.hasOwnProperty(n) ? map[n] : n;
        this.p += 2; continue;
      }
      if (closers.indexOf(c) !== -1 && this.closesHere(this.p, isKey)) { this.p++; return out; }
      out += c;
      this.p++;
    }
    this.fail();
  };

  // Finds every top-level { ... } that reads cleanly, in order of appearance.
  function readObjects(text) {
    var src = String(text || '');
    var found = [];
    var i = 0, guard = 0;
    while (i < src.length && guard++ < 50) {
      var start = src.indexOf('{', i);
      if (start < 0) break;
      var obj = null, end = start + 1;
      try {
        // strict first, for speed and exactness, on the balanced slice
        var slice = balancedSlice(src, start);
        if (slice) { obj = JSON.parse(slice); end = start + slice.length; }
      } catch (e) { obj = null; }
      if (!obj) {
        try { var r = new Reader(src, start); obj = r.value(); end = r.p; } catch (e2) { obj = null; }
      }
      if (obj && typeof obj === 'object') { found.push(obj); i = end; }
      else i = start + 1;
    }
    // an answer that is just a list of chapters
    if (!found.length) {
      var a = src.indexOf('[');
      if (a >= 0) { try { var arr = new Reader(src, a).value(); if (Array.isArray(arr)) found.push({ chapters: arr }); } catch (e3) { /* ignore */ } }
    }
    return found;
  }

  function balancedSlice(src, start) {
    var depth = 0, inStr = false, esc = false;
    for (var i = start; i < src.length; i++) {
      var c = src[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1).replace(/,\s*([}\]])/g, '$1'); }
    }
    return null;
  }

  // Lower-case keys and a few common synonyms so small naming slips still import.
  var TOP_ALIASES = {
    chapter: 'chapters', chapterlist: 'chapters', chapters_list: 'chapters', title_options: 'titles', titleoptions: 'titles',
    booktitles: 'titles', book_titles: 'titles', description: 'blurb', bookdescription: 'blurb', book_description: 'blurb',
    keyword: 'keywords', clue: 'clues', hiddenclues: 'clues', hidden_clues: 'clues', murderer: 'killer', culprit: 'killer',
    killername: 'killer', killer_name: 'killer', detective: 'sleuth', characters: 'cast', recurring: 'cast', side_characters: 'cast'
  };
  var ITEM_ALIASES = {
    number: 'n', chapternumber: 'n', chapter_number: 'n', num: 'n', body: 'text', content: 'text', chapter_text: 'text',
    wordlist: 'words', word_list: 'words', puzzlewords: 'words', puzzle_words: 'words', clueword: 'word', clue_word: 'word',
    role_in_story: 'role', chapter_title: 'title'
  };
  function normalizeKeys(o, depth) {
    depth = depth || 0;
    if (depth > 6 || o == null) return o;
    if (Array.isArray(o)) return o.map(function (x) { return normalizeKeys(x, depth + 1); });
    if (typeof o !== 'object') return o;
    var aliases = depth === 0 ? TOP_ALIASES : ITEM_ALIASES;
    var out = {};
    Object.keys(o).forEach(function (k) {
      var lk = k.toLowerCase().trim().replace(/\s+/g, '_');
      var nk = aliases[lk] || aliases[lk.replace(/_/g, '')] || lk;
      if (out[nk] === undefined) out[nk] = normalizeKeys(o[k], depth + 1);
    });
    return out;
  }

  function pickAnswer(text, wantKeys) {
    var objs = readObjects(text).map(function (o) { return normalizeKeys(o); });
    if (!objs.length) return null;
    for (var i = 0; i < objs.length; i++) {
      for (var k = 0; k < wantKeys.length; k++) if (objs[i][wantKeys[k]] !== undefined) return objs[i];
      // an object nested one level down (e.g. { "book": { ... } })
      var vals = Object.keys(objs[i]).map(function (k2) { return objs[i][k2]; });
      for (var v = 0; v < vals.length; v++) {
        if (vals[v] && typeof vals[v] === 'object' && !Array.isArray(vals[v])) {
          for (var k3 = 0; k3 < wantKeys.length; k3++) if (vals[v][wantKeys[k3]] !== undefined) return vals[v];
        }
      }
    }
    return objs[0];
  }

  // ---------- issue helpers ----------
  function issue(level, where, text, extra) {
    var o = { level: level, where: where, text: text };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }

  function str(v) { return v == null ? '' : (typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : '')); }

  function lettersOnly(s) { return T.normalizeWord(s); }

  var FAMOUS_FULL = ['JANE MARPLE', 'MISS MARPLE', 'HERCULE POIROT', 'SHERLOCK HOLMES', 'JESSICA FLETCHER', 'NANCY DREW',
    'FATHER BROWN', 'PETER WIMSEY', 'HANNAH SWENSEN', 'AGATHA RAISIN', 'KINSEY MILLHONE', 'PRECIOUS RAMOTSWE',
    'MAISIE DOBBS', 'TEMPERANCE BRENNAN', 'STEPHANIE PLUM', 'GOLDY SCHULZ', 'AURORA TEAGARDEN', 'FLAVIA DE LUCE',
    'LORD PETER', 'AMELIA PEABODY', 'MRS. POLLIFAX', 'ADRIAN MONK', 'ELLERY QUEEN', 'NERO WOLFE', 'PHILIP MARLOWE',
    'SAM SPADE', 'TOMMY AND TUPPENCE', 'CORMORAN STRIKE', 'RICHARD CASTLE', 'BENOIT BLANC', 'HERCULE', 'POIROT', 'MARPLE', 'SHERLOCK'];

  function famousNameIssues(names) {
    var out = [];
    names.forEach(function (n) {
      var up = T.stripAccents(n).toUpperCase().replace(/\s+/g, ' ').trim();
      var words = ' ' + up.replace(/[^A-Z ]/g, '') + ' ';
      var hit = FAMOUS_FULL.some(function (f) { return words.indexOf(' ' + f.replace(/[^A-Z ]/g, '') + ' ') !== -1; });
      if (hit) out.push(issue('warning', 'Names', '“' + n + '” is the name of a well-known fictional detective. Pick an original name before you publish.'));
    });
    return out;
  }

  function proseFlags(text) {
    var tokens = T.letterTokens(text);
    var hits = {};
    var list = Cozy.blocklist ? Cozy.blocklist.prose : [];
    tokens.forEach(function (t) { if (list.indexOf(t) !== -1) hits[t] = true; });
    return Object.keys(hits);
  }

  // ---------- story plan ----------
  function clueChapters(N, C) {
    var out = [];
    if (C <= 0) return out;
    if (C === 1) return [Math.round((2 + N - 1) / 2)];
    var span = (N - 1) - 2;
    for (var i = 0; i < C; i++) out.push(Math.round((2 * (C - 1) + i * span) / (C - 1)));
    return out;
  }

  function nameOf(v) {
    if (typeof v === 'string') return T.cleanLine(v);
    if (v && typeof v === 'object') return T.cleanLine(str(v.name) || str(v.full_name) || str(v.fullname));
    return '';
  }

  /*
   * Checks a story plan. Fixable slips are fixed and reported as 'fixed'.
   * setup gives N (chapter count) and C (clue count).
   * Returns { plan, issues, ok }
   */
  function checkPlan(raw, setup, previousPlan) {
    var N = setup.chapters, C = setup.clueCount;
    var wanted = clueChapters(N, C);
    var issues = [];
    var p = normalizeKeys(raw || {});
    // a fix answer may hold only the corrected parts: merge onto the earlier plan
    if (previousPlan) {
      var merged = U.clone(previousPlan);
      Object.keys(p).forEach(function (k) {
        if (k === 'outline' && Array.isArray(p.outline) && Array.isArray(merged.outline) && p.outline.length < N) {
          p.outline.forEach(function (o) {
            var n = parseInt(o && o.n, 10);
            var at = merged.outline.findIndex(function (x) { return x.n === n; });
            if (at >= 0) merged.outline[at] = o; else merged.outline.push(o);
          });
        } else merged[k] = p[k];
      });
      p = merged;
    }
    var plan = {};

    // titles
    var titles = Array.isArray(p.titles) ? p.titles : (p.title ? [p.title] : []);
    plan.titles = titles.map(function (t) { return T.cleanTitle(str(t)); }).filter(Boolean).slice(0, 5);
    if (!plan.titles.length && !setup.bookTitle) issues.push(issue('error', 'Titles', 'The answer has no book titles.', { fix: 'titles' }));
    plan.subtitle = T.cleanLine(str(p.subtitle));
    if (!plan.subtitle) {
      plan.subtitle = 'A Cozy Mystery Word Search Book';
      issues.push(issue('fixed', 'Subtitle', 'No subtitle was given, so a standard one was added. You can change it later.'));
    }
    plan.blurb = (T.cleanParagraphs(str(p.blurb)).join('\n\n'));
    var blurbWords = U.countWords(plan.blurb);
    if (!plan.blurb) issues.push(issue('warning', 'Description', 'The book description is missing. You can still finish the book and write one for Amazon yourself.'));
    else if (blurbWords > 170) issues.push(issue('warning', 'Description', 'The book description has ' + blurbWords + ' words; 150 or fewer reads best on Amazon.'));

    var kw = Array.isArray(p.keywords) ? p.keywords : (typeof p.keywords === 'string' ? p.keywords.split(/[,;\n]/) : []);
    var seenKw = {};
    plan.keywords = kw.map(function (k) { return T.cleanLine(str(k)).replace(/^["']|["']$/g, '').slice(0, 50); })
      .filter(function (k) { var key = k.toLowerCase(); if (!k || seenKw[key]) return false; seenKw[key] = 1; return true; });
    if (plan.keywords.length > 7) { plan.keywords = plan.keywords.slice(0, 7); issues.push(issue('fixed', 'Keywords', 'Amazon allows 7 keyword boxes, so only the first 7 were kept.')); }
    else if (plan.keywords.length < 7) issues.push(issue('warning', 'Keywords', 'Only ' + plan.keywords.length + ' of 7 keywords came back. You can add your own on Amazon.'));

    plan.setting = T.cleanLine(str(p.setting) || (p.setting && typeof p.setting === 'object' ? Object.keys(p.setting).map(function (k) { return str(p.setting[k]); }).join('. ') : ''));
    if (!plan.setting) issues.push(issue('error', 'Setting', 'The setting of the story is missing.', { fix: 'setting' }));

    var sl = p.sleuth && typeof p.sleuth === 'object' ? p.sleuth : { name: str(p.sleuth) };
    plan.sleuth = { name: nameOf(sl), age: parseInt(sl.age, 10) || null, job: T.cleanLine(str(sl.job || sl.occupation || sl.role)), trait: T.cleanLine(str(sl.trait || sl.quirk || sl.personality)) };
    if (!plan.sleuth.name) issues.push(issue('error', 'Sleuth', 'The sleuth has no name.', { fix: 'sleuth' }));

    var vi = p.victim && typeof p.victim === 'object' ? p.victim : { name: str(p.victim) };
    plan.victim = { name: nameOf(vi), who: T.cleanLine(str(vi.who || vi.role || vi.description)) };
    if (!plan.victim.name) issues.push(issue('error', 'Victim', 'The victim has no name.', { fix: 'victim' }));

    plan.cast = (Array.isArray(p.cast) ? p.cast : []).map(function (c) {
      return { name: nameOf(c), role: T.cleanLine(str(c && (c.role || c.who))) };
    }).filter(function (c) { return c.name; }).slice(0, 8);

    var sus = Array.isArray(p.suspects) ? p.suspects : [];
    plan.suspects = sus.map(function (s) {
      return { name: nameOf(s), role: T.cleanLine(str(s && (s.role || s.who || s.job))), motive: T.cleanLine(str(s && s.motive)) };
    }).filter(function (s) { return s.name; });
    if (plan.suspects.length < 3 || plan.suspects.length > 7) {
      issues.push(issue('error', 'Suspects', 'The story has ' + plan.suspects.length + ' suspects; it needs 5.', { fix: 'suspects' }));
    } else if (plan.suspects.length !== 5) {
      issues.push(issue('warning', 'Suspects', 'The story has ' + plan.suspects.length + ' suspects instead of 5. The book still works.'));
    }

    // killer must be one of the suspects
    var killer = nameOf(p.killer);
    var match = null;
    if (killer) {
      var kU = lettersOnly(killer);
      match = plan.suspects.find(function (s) { return lettersOnly(s.name) === kU; }) ||
        plan.suspects.find(function (s) { var sU = lettersOnly(s.name); return sU.indexOf(kU) !== -1 || kU.indexOf(sU) !== -1; });
    }
    if (!killer) issues.push(issue('error', 'Killer', 'The answer does not say who the killer is.', { fix: 'killer' }));
    else if (!match) issues.push(issue('error', 'Killer', 'The killer “' + killer + '” is not one of the suspects.', { fix: 'killer' }));
    else {
      if (match.name !== killer) issues.push(issue('fixed', 'Killer', 'The killer’s name was matched to the suspect “' + match.name + '”.'));
      killer = match.name;
    }
    plan.killer = killer;
    var kLen = lettersOnly(killer).length;
    if (killer && (kLen < 6 || kLen > 16)) {
      issues.push(issue('error', 'Killer', 'The killer’s name “' + killer + '” has ' + kLen + ' letters; it needs 6 to 16 (spaces not counted).', { fix: 'killer' }));
    }
    plan.solution = T.cleanLine(str(p.solution));
    if (!plan.solution) issues.push(issue('warning', 'Solution', 'The answer has no short solution. The epilogue will still explain the case.'));

    // outline
    var out = Array.isArray(p.outline) ? p.outline : [];
    var byN = {};
    out.forEach(function (o, i) {
      if (!o || typeof o !== 'object') return;
      var n = parseInt(o.n != null ? o.n : o.chapter, 10);
      if (!n) n = i + 1;
      byN[n] = { n: n, title: T.cleanTitle(str(o.title)), beat: T.cleanLine(str(o.beat || o.summary || o.description || o.plot)) };
    });
    var missingOutline = [];
    plan.outline = [];
    for (var n = 1; n <= N; n++) {
      if (!byN[n] || !byN[n].title) { missingOutline.push(n); continue; }
      var t = byN[n].title;
      if (t.length > 40) { t = T.shortenAtWord(t, 40); }
      plan.outline.push({ n: n, title: t, beat: byN[n].beat });
    }
    if (missingOutline.length) {
      issues.push(issue('error', 'Outline', missingOutline.length === N ? 'The chapter outline is missing.' :
        'The outline is missing ' + U.plural(missingOutline.length, 'chapter') + ': ' + listNumbers(missingOutline) + '.', { fix: 'outline', missing: missingOutline }));
    }
    var extra = Object.keys(byN).map(Number).filter(function (k) { return k > N; });
    if (extra.length) issues.push(issue('fixed', 'Outline', 'The outline had chapters past ' + N + '; those were left out.'));

    // clues
    var rawClues = Array.isArray(p.clues) ? p.clues : [];
    var clues = rawClues.map(function (c, i) {
      if (typeof c === 'string') return { chapter: wanted[i], word: c };
      return { chapter: parseInt(c && (c.chapter != null ? c.chapter : c.n), 10), word: str(c && (c.word || c.clue)) };
    });
    var clueProblems = [];
    if (clues.length !== C) clueProblems.push('There are ' + clues.length + ' hidden clues; the book needs exactly ' + C + '.');
    var seenWord = {};
    clues.forEach(function (c) {
      var raw2 = c.word.trim();
      var norm = lettersOnly(raw2);
      c.norm = norm;
      if (/[\s\-]/.test(raw2.trim()) && norm.length) clueProblems.push('The clue “' + raw2 + '” is more than one word.');
      else if (norm.length < 4 || norm.length > 9) clueProblems.push('The clue “' + (raw2 || '(empty)') + '” has ' + norm.length + ' letters; clues need 4 to 9.');
      if (T.isPalindrome(norm)) clueProblems.push('The clue “' + raw2 + '” reads the same backward, so it would be found twice in the final grid.');
      if (seenWord[norm]) clueProblems.push('The clue “' + raw2 + '” is used twice.');
      seenWord[norm] = true;
    });
    for (var a = 0; a < clues.length; a++) for (var b = 0; b < clues.length; b++) {
      if (a !== b && clues[a].norm && clues[b].norm && clues[a].norm !== clues[b].norm && clues[a].norm.length >= clues[b].norm.length &&
        T.containsEither(clues[a].norm, clues[b].norm)) {
        clueProblems.push('The clue “' + clues[b].word + '” is hidden inside “' + clues[a].word + '”, so it would be found twice in the final grid.');
      }
    }
    // chapters: accept the AI's own choice if it is sensible, otherwise use ours
    if (!clueProblems.length) {
      var chs = clues.map(function (c) { return c.chapter; });
      var distinct = {};
      var valid = chs.every(function (x) { if (!x || x < 2 || x > N - 1 || distinct[x]) return false; distinct[x] = 1; return true; });
      if (!valid) {
        var sorted = clues.slice().sort(function (x, y) { return (x.chapter || 0) - (y.chapter || 0); });
        sorted.forEach(function (c, i) { c.chapter = wanted[i]; });
        clues = sorted;
        issues.push(issue('fixed', 'Clues', 'Some clues pointed at unusable chapters, so they were spread across chapters ' + listNumbers(wanted) + '.'));
      }
    }
    clueProblems.forEach(function (msg) { issues.push(issue('error', 'Clues', msg, { fix: 'clues' })); });
    plan.clues = clues.map(function (c) { return { chapter: c.chapter, word: c.norm, display: T.displayWord(c.word) }; })
      .sort(function (x, y) { return x.chapter - y.chapter; });

    // originality and tone
    var names = [plan.sleuth.name, plan.victim.name].concat(plan.suspects.map(function (s) { return s.name; }), plan.cast.map(function (c) { return c.name; }));
    issues = issues.concat(famousNameIssues(names));
    var flagged = proseFlags([plan.blurb, plan.setting, plan.solution].concat(plan.outline.map(function (o) { return o.beat; })).join(' '));
    if (flagged.length) issues.push(issue('warning', 'Tone', 'The plan uses words that do not suit a clean cozy: ' + flagged.join(', ').toLowerCase() + '.'));

    var ok = !issues.some(function (i) { return i.level === 'error'; });
    return { plan: plan, issues: issues, ok: ok };
  }

  function listNumbers(arr) {
    if (arr.length <= 8) return arr.join(', ');
    return arr.slice(0, 8).join(', ') + ' and ' + (arr.length - 8) + ' more';
  }

  // ---------- chapters ----------
  var STOP = ('ABOUT ABOVE AFTER AGAIN AGAINST ALMOST ALONG ALREADY ALSO ALTHOUGH ALWAYS AMONG ANOTHER ANYONE ANYTHING AROUND ' +
    'BECAUSE BEEN BEFORE BEHIND BEING BELOW BESIDE BETTER BETWEEN BOTH CAME CANNOT COME COULD COULDNT DIDNT DOES DOESNT DOING DONE ' +
    'DOWN DURING EACH EITHER ELSE ENOUGH EVEN EVER EVERY EVERYONE EVERYTHING FROM GAVE GETS GIVE GOES GOING GONE GOOD GREAT ' +
    'HAD HAVE HAVING HERE HERS HERSELF HIMSELF INTO ITSELF JUST KEPT KNEW KNOW KNOWN LAST LATER LEAST LESS LIKE LITTLE LONG LOOK LOOKED ' +
    'MADE MAKE MANY MAYBE MIGHT MORE MOST MUCH MUST NEVER NEXT NOTHING ONCE ONLY ONTO OTHER OTHERS OUGHT OURS OUT OVER PERHAPS ' +
    'QUITE RATHER REALLY SAID SAME SEEM SEEMED SHALL SHOULD SINCE SOME SOMEONE SOMETHING SOON STILL SUCH SURE TAKE TAKEN THAN ' +
    'THAT THATS THEIR THEIRS THEM THEMSELVES THEN THERE THESE THEY THING THINGS THINK THIS THOSE THOUGH THOUGHT THREE THROUGH ' +
    'TOLD TOOK TOWARD TOWARDS UNDER UNTIL UPON VERY WANT WANTED WASNT WELL WENT WERE WHAT WHEN WHERE WHETHER WHICH WHILE WHO WHOM ' +
    'WHOSE WILL WITH WITHIN WITHOUT WONT WOULD WOULDNT YOUR YOURS YOURSELF ASKED TURNED SAYS SAYING TELL TOLD FELT FEEL ' +
    'SHES HES THEYD SHED HED ITS YOU YOUD YOULL IVE ILL IM DONT CANT ISNT ARENT WERENT HADNT HASNT').split(/\s+/);
  var STOPSET = {};
  STOP.forEach(function (w) { STOPSET[w] = 1; });

  // Picks extra words from the chapter text when the AI's list comes up short.
  function suggestWords(text, existing, count, maxLen, avoid) {
    var raw = String(text || '').match(/[A-Za-zÀ-ɏ]+(?:['’][A-Za-z]+)?/g) || [];
    var stats = {};
    raw.forEach(function (tok, i) {
      var clean = tok.replace(/['’]s$/i, '');
      var norm = T.normalizeWord(clean);
      if (norm.length < 5 || norm.length > maxLen || STOPSET[norm]) return;
      if (/['’]/.test(clean)) return;
      var st = stats[norm] || (stats[norm] = { norm: norm, display: clean, count: 0, cap: 0, first: i });
      st.count++;
      var prev = i > 0 ? raw[i - 1] : '';
      if (/^[A-Z]/.test(clean) && i > 0 && !/[.!?]$/.test(prev)) st.cap++;
    });
    var picks = Object.keys(stats).map(function (k) { return stats[k]; })
      .filter(function (s) { return !T.isPalindrome(s.norm); })
      .sort(function (a, b) {
        var sa = a.cap * 3 + a.count + a.norm.length * 0.25, sb = b.cap * 3 + b.count + b.norm.length * 0.25;
        return sb - sa || a.first - b.first;
      });
    var out = [];
    var all = existing.slice();
    for (var i = 0; i < picks.length && out.length < count; i++) {
      var w = picks[i].norm;
      var clash = all.concat(avoid || []).some(function (x) { return x === w || (x.length >= w.length ? T.containsEither(x, w) : T.containsEither(w, x)); });
      if (clash) continue;
      all.push(w);
      out.push({ display: T.displayWord(picks[i].display), norm: w });
    }
    return out;
  }

  /*
   * Builds a chapter's final word list.
   * opts: { wordsPerPuzzle, maxLen, clue: { word, display } or null }
   * Returns { list: [{display, norm, isClue}], notes: [issue], usable }
   */
  function prepareWords(chapter, opts) {
    var need = opts.wordsPerPuzzle, maxLen = opts.maxLen;
    var where = 'Chapter ' + chapter.n;
    var notes = [];
    var clue = opts.clue;
    var list = [];
    var dropped = { short: [], long: [], dup: [], inside: [], pal: [] };
    (chapter.words || []).forEach(function (w) {
      var raw = str(w).trim();
      if (!raw) return;
      var norm = T.normalizeWord(raw);
      var display = T.displayWord(raw);
      if (norm.length < 4) { dropped.short.push(display || raw); return; }
      if (norm.length > maxLen) { dropped.long.push(display); return; }
      if (T.isPalindrome(norm)) { dropped.pal.push(display); return; }
      if (list.some(function (x) { return x.norm === norm; })) { dropped.dup.push(display); return; }
      list.push({ display: display, norm: norm, isClue: false });
    });
    if (clue) {
      var at = list.findIndex(function (x) { return x.norm === clue.word; });
      if (at >= 0) list[at].isClue = true;
      else {
        var entry = { display: clue.display || clue.word, norm: clue.word, isClue: true };
        if (list.length >= need) { list[need - 1] = entry; list.length = need; }
        else list.push(entry);
        notes.push(issue('fixed', where, 'The clue word ' + entry.display + ' was missing from the word list, so it was added.'));
      }
    }
    // no word may be readable inside another one (forwards or backwards)
    var keep = [];
    list.forEach(function (x) { keep.push(x); });
    for (var i = 0; i < keep.length; i++) {
      for (var j = 0; j < keep.length; j++) {
        if (i === j || !keep[i] || !keep[j]) continue;
        var A = keep[i], B = keep[j];
        if (A.norm.length < B.norm.length) continue;
        if (A.norm === B.norm || !T.containsEither(A.norm, B.norm)) {
          if (!(A.norm === T.reverse(B.norm) && i < j)) continue;
        }
        // B is inside A: drop B, unless B is the clue (then drop A)
        var drop = B.isClue ? i : j;
        dropped.inside.push(keep[drop].display);
        keep[drop] = null;
      }
    }
    list = keep.filter(Boolean);
    if (list.length > need) {
      var clueEntry = list.find(function (x) { return x.isClue; });
      var others = list.filter(function (x) { return !x.isClue; }).slice(0, clueEntry ? need - 1 : need);
      list = clueEntry ? others.concat([clueEntry]) : others;
    }
    var dropMsgs = [];
    if (dropped.short.length) dropMsgs.push(dropped.short.join(', ') + ' (too short)');
    if (dropped.long.length) dropMsgs.push(dropped.long.join(', ') + ' (too long for the grid)');
    if (dropped.dup.length) dropMsgs.push(dropped.dup.join(', ') + ' (listed twice)');
    if (dropped.inside.length) dropMsgs.push(dropped.inside.join(', ') + ' (hidden inside another word)');
    if (dropped.pal.length) dropMsgs.push(dropped.pal.join(', ') + ' (reads the same backward)');
    if (dropMsgs.length) notes.push(issue('fixed', where, 'Removed ' + dropMsgs.join('; ') + '.'));

    if (list.length < need) {
      var text = (chapter.paragraphs || []).join(' ');
      var add = suggestWords(text, list.map(function (x) { return x.norm; }), need - list.length, maxLen, []);
      if (add.length) {
        add.forEach(function (x) { list.splice(list.length - (clue ? 1 : 0), 0, { display: x.display, norm: x.norm, isClue: false }); });
        // keep the clue last for readability of the stored list
        list.sort(function (a, b) { return (a.isClue ? 1 : 0) - (b.isClue ? 1 : 0); });
        notes.push(issue('fixed', where, 'Added ' + add.map(function (x) { return x.display; }).join(', ') + ' from the chapter text to make ' + need + ' words.'));
      }
    }
    if (list.length < need) {
      notes.push(issue('error', where, where + ' has ' + list.length + ' usable words; ' + need + ' are needed.', { fix: 'words', n: chapter.n }));
    }
    // words not in the text: warning only
    var tokens = T.letterTokens((chapter.paragraphs || []).join(' '));
    var absent = list.filter(function (x) { return !T.wordInText(x.display, tokens); }).map(function (x) { return x.display; });
    if (absent.length) notes.push(issue('warning', where, 'Not found in the chapter text: ' + absent.join(', ') + '.', { n: chapter.n }));
    return { list: list, notes: notes, usable: list.length };
  }

  /*
   * Checks one pasted batch of chapters.
   * ctx: { N, from, to, plan, clueByChapter, isLast, wantsEpilogue }
   * Returns { chapters: {n: chapter}, epilogue, issues, ok }
   */
  function checkBatch(raw, ctx) {
    var issues = [];
    var obj = normalizeKeys(raw || {});
    var arr = Array.isArray(obj.chapters) ? obj.chapters : (Array.isArray(obj) ? obj : []);
    if (!arr.length && obj.n && obj.text) arr = [obj];
    var batchSize = ctx.to - ctx.from + 1;
    var nums = arr.map(function (c, i) { return parseInt(c && (c.n != null ? c.n : c.chapter), 10) || null; });
    // the AI restarted numbering at 1 for a later part
    var inRange = nums.filter(function (n) { return n >= ctx.from && n <= ctx.to; }).length;
    if (ctx.from > 1 && inRange === 0 && arr.length === batchSize && nums.every(function (n, i) { return n === i + 1; })) {
      nums = nums.map(function (n) { return n + ctx.from - 1; });
      issues.push(issue('fixed', 'Numbering', 'The chapters were numbered from 1, so they were renumbered ' + ctx.from + ' to ' + ctx.to + '.'));
    }
    if (nums.some(function (n) { return n == null; }) && arr.length === batchSize) {
      nums = arr.map(function (c, i) { return ctx.from + i; });
      issues.push(issue('fixed', 'Numbering', 'Some chapters had no number, so they were numbered in order.'));
    }
    var chapters = {};
    var outside = [];
    arr.forEach(function (c, i) {
      var n = nums[i];
      if (!c || typeof c !== 'object') return;
      if (!n || n < 1 || n > ctx.N) { outside.push(n || '?'); return; }
      if (n < ctx.from || n > ctx.to) { outside.push(n); return; }
      var title = T.cleanTitle(str(c.title));
      var paragraphs = T.cleanParagraphs(str(c.text));
      var words = Array.isArray(c.words) ? c.words.map(str) : (typeof c.words === 'string' ? c.words.split(/[,;\n]/) : []);
      var where = 'Chapter ' + n;
      if (!title) issues.push(issue('error', where, where + ' has no title.', { fix: 'chapter', n: n }));
      else if (title.length > 40) {
        var short = T.shortenAtWord(title, 40);
        issues.push(issue('fixed', where, 'The title of ' + where.toLowerCase() + ' was shortened to “' + short + '” (40 characters at most).'));
        title = short;
      }
      if (!paragraphs.length) issues.push(issue('error', where, where + ' has no text.', { fix: 'chapter', n: n }));
      chapters[n] = { n: n, title: title, paragraphs: paragraphs, words: words };
    });
    if (outside.length) {
      issues.push(issue('warning', 'Numbering', 'This answer also had chapter ' + outside.join(', ') + ', which belongs to another part, so it was left out.'));
    }
    if (!arr.length) issues.push(issue('error', 'Answer', 'No chapters were found in this answer.', { fix: 'batch' }));
    var epilogue = null;
    if (obj.epilogue) {
      var e = typeof obj.epilogue === 'string' ? { title: 'Epilogue', text: obj.epilogue } : obj.epilogue;
      epilogue = { title: T.cleanTitle(str(e.title)) || 'Epilogue', paragraphs: T.cleanParagraphs(str(e.text)) };
      if (epilogue.title.length > 40) epilogue.title = T.shortenAtWord(epilogue.title, 40);
      if (!epilogue.paragraphs.length) { issues.push(issue('error', 'Epilogue', 'The epilogue has no text.', { fix: 'epilogue' })); epilogue = null; }
    }
    return { chapters: chapters, epilogue: epilogue, issues: issues };
  }

  // Content checks on a stored chapter (run for the batch and again in the review step).
  function chapterContentIssues(ch, ctx) {
    var out = [];
    var where = 'Chapter ' + ch.n;
    var text = ch.paragraphs.join(' ');
    var wc = U.countWords(text);
    if (wc < 200) out.push(issue('warning', where, where + ' has ' + wc + ' words; 220 to 260 fills the page best.', { n: ch.n }));
    else if (wc > 270) out.push(issue('warning', where, where + ' has ' + wc + ' words; 220 to 260 fills the page best.', { n: ch.n }));
    var clue = ctx.clueByChapter[ch.n];
    if (clue) {
      var tokens = T.letterTokens(text);
      if (!T.wordInText(clue.display || clue.word, tokens)) {
        out.push(issue('warning', where, 'The clue word ' + (clue.display || clue.word) + ' is not mentioned in the text of ' + where.toLowerCase() + '. Readers will find it in the word list, but the story reads better when it appears.', { fix: 'clueMention', n: ch.n }));
      }
    }
    var flagged = proseFlags(text);
    if (flagged.length) out.push(issue('warning', where, where + ' uses words that do not suit a clean cozy: ' + flagged.join(', ').toLowerCase() + '.', { fix: 'tone', n: ch.n }));
    return out;
  }

  function epilogueIssues(ep, ctx) {
    var out = [];
    if (!ep) return out;
    var text = ep.paragraphs.join(' ');
    var wc = U.countWords(text);
    if (wc > 260) out.push(issue('warning', 'Epilogue', 'The epilogue has ' + wc + ' words; 250 or fewer fits the page best.'));
    if (ctx.killer) {
      var tokens = T.letterTokens(text);
      var parts = T.letterTokens(ctx.killer);
      var named = parts.some(function (p) { return p.length > 2 && tokens.indexOf(p) !== -1; });
      if (!named) out.push(issue('warning', 'Epilogue', 'The epilogue never names the killer, ' + ctx.killer + '. Readers expect the sleuth to explain who did it.', { fix: 'epilogue' }));
    }
    return out;
  }

  Cozy.validate = {
    readObjects: readObjects, pickAnswer: pickAnswer, normalizeKeys: normalizeKeys,
    clueChapters: clueChapters, checkPlan: checkPlan, checkBatch: checkBatch,
    prepareWords: prepareWords, suggestWords: suggestWords, chapterContentIssues: chapterContentIssues,
    epilogueIssues: epilogueIssues, famousNameIssues: famousNameIssues, proseFlags: proseFlags, issue: issue
  };
})(typeof window !== 'undefined' ? window : globalThis);
