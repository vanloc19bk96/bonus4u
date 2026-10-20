/* parser.js — turns "whatever the user pasted" into clean question objects.
   The input is an AI answer, so assume code fences, chatter around the JSON,
   trailing commas and an output that was cut off mid-sentence. */
(function () {
  var W = window.WYR;
  var C = W.config;

  var P = (W.parser = {});

  /* Characters the bundled font subsets actually contain. Anything else
     (emoji, arrows, CJK) would print as a blank box, so it is dropped. */
  var SUPPORTED = /[\u0000-\u024F\u0259\u0300-\u036F\u1E00-\u1EFF\u2000-\u206F\u20A0-\u20BF\u2122\u2212]/;

  var FIELD_ALIASES = {
    a: ['a', 'option_a', 'optionA', 'optiona', 'choice_a', 'choiceA', 'first', 'left'],
    b: ['b', 'option_b', 'optionB', 'optionb', 'choice_b', 'choiceB', 'second', 'right'],
    cat: ['cat', 'category', 'categoria', 'theme', 'topic'],
    why_hard: ['why_hard', 'whyHard', 'why', 'why_its_hard', 'whyItsHard', 'reason'],
    a_plus: ['a_plus', 'aPlus', 'pro_a', 'proA', 'for_a', 'argument_a'],
    b_plus: ['b_plus', 'bPlus', 'pro_b', 'proB', 'for_b', 'argument_b'],
    bonus: ['bonus', 'follow_up', 'followUp', 'bonus_question', 'extra'],
    id: ['id', 'number', 'no', 'num', 'index']
  };

  /* Prefixes to strip from an option, in every language we offer. */
  var LEAD_PATTERNS = [
    /^would you rather\b[\s,:-]*/i,
    /^b[ạa]n s[ẽe]\s*ch[ọo]n\b[\s,:-]*/i,
    /^¿?qu[ée] prefieres\b[\s,:-]*/i,
    /^tu pr[ée]f[èe]res\b[\s,:-]*/i,
    /^was w[äa]re dir lieber\b[\s,:-]*/i,
    /^(option\s*)?[ab][).:]\s*/i,
    /^[-•*]\s*/
  ];

  /* --- step 1: normalise the raw paste -------------------------------- */
  P.normalize = function (text) {
    var s = String(text == null ? '' : text);
    s = s.replace(/^\uFEFF/, '');                 // BOM
    s = s.replace(/\r\n?/g, '\n');
    if (s.normalize) s = s.normalize('NFC');      // Vietnamese often arrives NFD
    return s;
  };

  /* Smart quotes are only a problem where they stand in for JSON syntax,
     i.e. around a key or right after a structural character. Curly quotes
     inside the sentences themselves are fine and stay. */
  function straightenStructuralQuotes(s) {
    return s
      .replace(/([{\[,:]\s*)[“”]/g, '$1"')
      .replace(/[“”](\s*[}\],:])/g, '"$1')
      .replace(/([{\[,]\s*)[‘’]([A-Za-z_][\w]*)[‘’](\s*:)/g, '$1"$2"$3');
  }

  /* --- step 2: find the JSON inside the answer ------------------------ */
  P.extractCandidates = function (text) {
    var out = [], m;
    var fence = /```(?:json|JSON)?\s*\n?([\s\S]*?)(?:```|$)/g;
    while ((m = fence.exec(text)) !== null) {
      if (m[1] && m[1].trim()) out.push(m[1].trim());
    }
    if (out.length) return out;

    // No fence: take the widest brace or bracket span we can find. Whichever
    // opens first is the real payload: a bare array holds objects, and an
    // object can hold arrays, so the outermost one has to win.
    var firstObj = text.indexOf('{'), lastObj = text.lastIndexOf('}');
    var firstArr = text.indexOf('['), lastArr = text.lastIndexOf(']');
    var objSpan = (firstObj !== -1 && lastObj > firstObj) ? text.slice(firstObj, lastObj + 1) : null;
    var arrSpan = (firstArr !== -1 && lastArr > firstArr) ? text.slice(firstArr, lastArr + 1) : null;
    if (arrSpan && (firstObj === -1 || firstArr < firstObj)) {
      out.push(arrSpan);
      if (objSpan) out.push(objSpan);
    } else {
      if (objSpan) out.push(objSpan);
      if (arrSpan) out.push(arrSpan);
    }
    if (firstObj !== -1 && lastObj <= firstObj) out.push(text.slice(firstObj));  // truncated
    if (!out.length && text.trim()) out.push(text.trim());
    return out;
  };

  /* --- step 3: forgiving JSON parse ----------------------------------- */
  function loosen(s) {
    return s
      .replace(/^\s*(?:json|JSON)\s*\n/, '')
      .replace(/\/\/[^\n"]*$/gm, '')          // line comments outside strings
      .replace(/\/\*[\s\S]*?\*\//g, '')       // block comments
      .replace(/,(\s*[}\]])/g, '$1')          // trailing commas
      .replace(/[\u00A0\u2028\u2029]/g, ' '); // exotic whitespace
  }

  /* An AI that ran out of tokens leaves an unterminated object. Cut back to
     the last complete question object, then close the brackets ourselves. */
  function repairTruncated(s) {
    var lastComplete = -1, depth = 0, inStr = false, esc = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') {
        depth--;
        if (depth >= 1) lastComplete = i;     // end of a nested object/array
      }
    }
    if (lastComplete < 0) return null;
    var head = s.slice(0, lastComplete + 1);

    // Recount what is still open after the cut, and close it in order.
    var open = [];
    inStr = false; esc = false;
    for (var j = 0; j < head.length; j++) {
      var c = head[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') open.push(c);
      else if (c === '}' || c === ']') open.pop();
    }
    var tail = '';
    for (var k = open.length - 1; k >= 0; k--) tail += open[k] === '{' ? '}' : ']';
    return head + tail;
  }

  P.parseJSON = function (candidate) {
    var attempts = [candidate, loosen(candidate), straightenStructuralQuotes(loosen(candidate))];
    for (var i = 0; i < attempts.length; i++) {
      try { return { data: JSON.parse(attempts[i]), truncated: false }; } catch (e) { /* next */ }
    }
    // Raw newlines inside string literals break JSON.parse; escape them.
    var escaped = loosen(candidate).replace(/"(?:[^"\\]|\\.)*"/g, function (str) {
      return str.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
    });
    try { return { data: JSON.parse(escaped), truncated: false }; } catch (e) { /* next */ }

    var repaired = repairTruncated(escaped);
    if (repaired) {
      try { return { data: JSON.parse(repaired), truncated: true }; } catch (e) { /* give up */ }
    }
    return null;
  };

  /* --- step 4: pull the questions out of whatever shape came back ------ */
  function pick(obj, names) {
    for (var i = 0; i < names.length; i++) {
      if (obj[names[i]] != null && obj[names[i]] !== '') return obj[names[i]];
    }
    return undefined;
  }

  function findQuestionArray(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    var keys = ['questions', 'items', 'data', 'list', 'results', 'wyr'];
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(data[keys[i]])) return data[keys[i]];
    }
    // Last resort: the first array of objects anywhere in the payload.
    for (var k in data) {
      if (Array.isArray(data[k]) && data[k].length && typeof data[k][0] === 'object') return data[k];
    }
    // A single question object on its own is a list of one.
    if (pick(data, FIELD_ALIASES.a) && pick(data, FIELD_ALIASES.b)) return [data];
    return null;
  }

  /* --- step 5: clean one option --------------------------------------- */
  P.cleanOption = function (raw, warnings) {
    var s = String(raw == null ? '' : raw).trim();
    var before;
    do {
      before = s;
      for (var i = 0; i < LEAD_PATTERNS.length; i++) s = s.replace(LEAD_PATTERNS[i], '');
      s = s.trim();
    } while (s !== before);

    s = s.replace(/\s+/g, ' ');
    s = s.replace(/[?.…]+$/, '').trim();     // the book supplies its own "?"

    // Lowercase the opening letter unless it is a proper noun: only lower it
    // when the second letter is already lowercase (so "USA" and "Minecraft"
    // survive, "Be able to fly" becomes "be able to fly").
    if (s.length > 1 && isUpper(s[0]) && isLower(s[1])) {
      var word = s.split(' ')[0].replace(/[^\w]/g, '');
      if (!isLikelyProperNoun(word)) s = s[0].toLowerCase() + s.slice(1);
    }

    s = stripUnsupported(s, warnings);
    return s;
  };

  /* Words we should not lowercase even though they open the sentence. */
  function isUpper(ch) { return ch !== ch.toLowerCase() && ch === ch.toUpperCase(); }
  function isLower(ch) { return ch !== ch.toUpperCase() && ch === ch.toLowerCase(); }

  var PROPER_HINTS = /^(I|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|Santa|Earth|Mars|Christmas|Halloween|Easter)$/;
  function isLikelyProperNoun(word) { return PROPER_HINTS.test(word); }

  function stripUnsupported(s, warnings) {
    var out = '', dropped = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      var code = s.codePointAt(i);
      if (code > 0xFFFF) { i++; dropped++; continue; }   // surrogate pair: emoji
      if (SUPPORTED.test(ch)) out += ch;
      else dropped++;
    }
    if (dropped && warnings) warnings.push('dropped ' + count(dropped, 'character') + ' the font has no glyph for (emoji?)');
    return out.replace(/\s+/g, ' ').trim();
  }
  P.stripUnsupported = stripUnsupported;

  function cleanPlain(raw, warnings) {
    var s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    return stripUnsupported(s, warnings);
  }

  /* --- step 6: dedupe -------------------------------------------------- */
  function tokens(q) {
    var s = (q.a + ' ' + q.b).toLowerCase();
    if (s.normalize) s = s.normalize('NFC');
    s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    var words = s.split(/\s+/).filter(Boolean);
    var set = {};
    for (var i = 0; i < words.length; i++) set[words[i]] = true;
    return set;
  }

  P.jaccard = function (setA, setB) {
    var inter = 0, union = 0, k;
    for (k in setA) { union++; if (setB[k]) inter++; }
    for (k in setB) if (!setA[k]) union++;
    return union === 0 ? 0 : inter / union;
  };
  P.DUPE_THRESHOLD = 0.7;

  /* --- the public entry point ------------------------------------------ */
  /* parse(rawText, existingQuestions) ->
     { ok, error, replace, truncated, questions[], duplicates, titleIdeas[],
       batch, totalBatches, notes[] }                                        */
  P.parse = function (rawText, existing) {
    existing = existing || [];
    var text = P.normalize(rawText);
    if (!text.trim()) {
      return fail('Nothing to add yet — paste the answer from the AI into the box above.');
    }

    var candidates = P.extractCandidates(text);
    var parsed = null;
    for (var i = 0; i < candidates.length && !parsed; i++) parsed = P.parseJSON(candidates[i]);
    if (!parsed) {
      return fail('Could not read that. Make sure you copied the WHOLE answer, ' +
        'including the part that starts with { or with a ```json block.');
    }

    var data = parsed.data;
    var list = findQuestionArray(data);
    if (!list || !list.length) {
      return fail('There are no questions in there. The AI may have answered in prose — ' +
        'ask it to reply in the JSON format from the prompt.');
    }

    var notes = [];
    if (parsed.truncated) {
      notes.push('The end was cut off — type `continue` in the AI, then paste the rest.');
    }

    var isReplace = !!(data && (data.replace === true || data.mode === 'replace'));
    var seen = [], out = [], duplicates = 0, skipped = 0;
    var k;

    // Existing questions count towards dedupe unless this is a rewrite batch.
    if (!isReplace) {
      for (k = 0; k < existing.length; k++) {
        seen.push({ id: existing[k].id, set: tokens(existing[k]) });
      }
    }

    for (k = 0; k < list.length; k++) {
      var src = list[k];
      if (!src || typeof src !== 'object') { skipped++; continue; }
      var warnings = [];

      var a = P.cleanOption(pick(src, FIELD_ALIASES.a), warnings);
      var b = P.cleanOption(pick(src, FIELD_ALIASES.b), warnings);
      if (!a || !b) { skipped++; continue; }

      var q = {
        id: 0,
        sourceId: toInt(pick(src, FIELD_ALIASES.id)),
        cat: cleanPlain(pick(src, FIELD_ALIASES.cat) || '', warnings) || 'General',
        a: a,
        b: b,
        why_hard: cleanPlain(pick(src, FIELD_ALIASES.why_hard) || '', warnings),
        a_plus: cleanPlain(pick(src, FIELD_ALIASES.a_plus) || '', warnings),
        b_plus: cleanPlain(pick(src, FIELD_ALIASES.b_plus) || '', warnings),
        bonus: cleanPlain(pick(src, FIELD_ALIASES.bonus) || '', warnings),
        warnings: warnings
      };

      if (!q.why_hard || !q.a_plus || !q.b_plus) warnings.push('answer key is incomplete');
      if (a.split(' ').length > 30 || b.split(' ').length > 30) warnings.push('quite long, the type may have to shrink');

      var set = tokens(q);
      var dupe = false;
      for (var j = 0; j < seen.length; j++) {
        if (P.jaccard(set, seen[j].set) >= P.DUPE_THRESHOLD) { dupe = true; break; }
      }
      if (dupe && !isReplace) { duplicates++; continue; }

      seen.push({ id: q.sourceId, set: set });
      out.push(q);
    }

    if (!out.length) {
      return fail(duplicates
        ? 'All ' + count(duplicates, 'question') + ' you pasted repeat ones you already have. Type `next` in the AI for a fresh batch.'
        : 'No usable questions came out of that answer.');
    }

    if (duplicates) notes.push('Dropped ' + count(duplicates, 'duplicate question') + '.');
    if (skipped) notes.push('Skipped ' + count(skipped, 'entry', 'entries') + ' missing option A or B.');

    var ideas = [];
    if (data && data.book && Array.isArray(data.book.title_ideas)) {
      for (var t = 0; t < data.book.title_ideas.length; t++) {
        var idea = data.book.title_ideas[t];
        if (!idea) continue;
        ideas.push({
          title: cleanPlain(idea.title || idea.name || ''),
          subtitle: cleanPlain(idea.subtitle || idea.sub || '')
        });
      }
      ideas = ideas.filter(function (x) { return x.title; });
    }

    return {
      ok: true,
      error: '',
      replace: isReplace,
      truncated: parsed.truncated,
      questions: out,
      duplicates: duplicates,
      skipped: skipped,
      titleIdeas: ideas,
      batch: toInt(data && data.batch) || 0,
      totalBatches: toInt(data && data.total_batches) || 0,
      notes: notes
    };
  };

  /* "1 question" / "2 questions" */
  function count(n, word, plural) {
    return n + ' ' + (n === 1 ? word : (plural || word + 's'));
  }

  function toInt(v) {
    var n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  }

  function fail(msg) {
    return {
      ok: false, error: msg, replace: false, truncated: false,
      questions: [], duplicates: 0, skipped: 0, titleIdeas: [],
      batch: 0, totalBatches: 0, notes: []
    };
  }
})();
