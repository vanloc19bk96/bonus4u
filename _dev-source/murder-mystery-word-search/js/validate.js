/*! validate.js — paste normalizer and the import check table. */
(function (global) {
  'use strict';

  var LETTERS = /^[A-Z]+$/;

  function normalizePaste(text) {
    var s = String(text || '');
    s = s.replace(/```(?:json)?/gi, '');
    s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
    var first = s.indexOf('{');
    var last = s.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    return s.slice(first, last + 1);
  }

  function cleanWord(value) {
    return String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function lettersOnly(value) {
    return cleanWord(value).replace(/[^A-Z]/g, '');
  }

  function parseReply(text) {
    var raw = normalizePaste(text);
    if (!raw) {
      return { ok: false, error: 'Nothing readable in that paste. Copy the whole grey code block, including both curly braces.' };
    }
    var data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return { ok: false, error: 'Nothing readable in that paste. Copy the whole grey code block, including both curly braces.' };
    }
    if (!data || !Array.isArray(data.cases) || data.cases.length === 0) {
      return { ok: false, error: "That looks like a different kind of answer. Ask the AI to return only the json block." };
    }
    return { ok: true, data: data };
  }

  function containsOther(words) {
    var i, j;
    for (i = 0; i < words.length; i++) {
      for (j = 0; j < words.length; j++) {
        if (i === j) continue;
        if (words[i].indexOf(words[j]) !== -1) return { outer: words[i], inner: words[j] };
      }
    }
    return null;
  }

  function validateCase(item, gridSize) {
    var id = item && item.id != null ? Number(item.id) : NaN;
    var label = isFinite(id) ? String(id) : '?';
    var theme = cleanWord(item && item.theme);
    var scenes = ((item && item.scenes) || []).map(cleanWord);
    var suspects = ((item && item.suspects) || []).map(lettersOnly);
    var evidence = ((item && item.evidence) || []).map(lettersOnly);
    var victimDisplay = cleanWord(item && item.victim);
    var victim = lettersOnly(victimDisplay);
    var flavor = String((item && item.flavor) || '').trim();

    if (!isFinite(id) || id < 1) {
      return { ok: false, id: id, messages: ['A case is missing a valid id. Ask the AI to number the cases.'] };
    }
    if (scenes.length !== 4 || suspects.length !== 6 || evidence.length !== 6) {
      var msg;
      if (suspects.length !== 6) msg = 'Case ' + label + ' came back with ' + suspects.length + ' suspects instead of 6.';
      else if (evidence.length !== 6) msg = 'Case ' + label + ' came back with ' + evidence.length + ' evidence words instead of 6.';
      else msg = 'Case ' + label + ' came back with ' + scenes.length + ' scenes instead of 4.';
      return { ok: false, id: id, messages: [msg] };
    }

    var messages = [];
    var i, word, unique;

    unique = {};
    for (i = 0; i < suspects.length; i++) {
      word = suspects[i];
      if (!LETTERS.test(word)) messages.push('Case ' + label + ' has a word with a hyphen. Letters only.');
      else if (word.length < 5 || word.length > 9) messages.push('Case ' + label + ' has a suspect word that is too long for the grid.');
      if (unique[word]) messages.push('Case ' + label + ' repeats the suspect ' + word + '.');
      unique[word] = true;
    }
    for (i = 0; i < evidence.length; i++) {
      word = evidence[i];
      if (!LETTERS.test(word)) messages.push('Case ' + label + ' has a word with a hyphen. Letters only.');
      else if (word.length < 4 || word.length > 8) messages.push('Case ' + label + ' has an evidence word that is too long for the grid.');
      if (unique[word]) messages.push('Case ' + label + ' repeats the word ' + word + '.');
      unique[word] = true;
    }
    if (!LETTERS.test(victim) || victim.length < 5 || victim.length > 9) {
      messages.push('Case ' + label + ' victim name is too short to hide in the grid.');
    }
    var nested = containsOther(suspects.concat(evidence));
    if (nested) {
      messages.push('Case ' + label + ' has ' + nested.inner + ' and ' + nested.outer + ', so the reader cannot tell them apart.');
    }
    for (i = 0; i < scenes.length; i++) {
      if (scenes[i].length > 14) messages.push('Case ' + label + ' scene name is too long for the label.');
      if (!scenes[i]) messages.push('Case ' + label + ' is missing a scene name.');
    }
    if (theme.length < 1) messages.push('Case ' + label + ' is missing a theme.');

    var longest = victim.length;
    suspects.concat(evidence).forEach(function (w) { if (w.length > longest) longest = w.length; });
    if (gridSize && longest + 1 > gridSize && longest > gridSize) {
      messages.push('Case ' + label + ' needs a ' + longest + ' letter word in an ' + gridSize + 'x' + gridSize + ' grid.');
    } else if (gridSize && longest > gridSize) {
      messages.push('Case ' + label + ' needs a ' + longest + ' letter word in an ' + gridSize + 'x' + gridSize + ' grid.');
    }

    if (messages.length) return { ok: false, id: id, messages: messages };

    return {
      ok: true,
      case: {
        id: id,
        theme: theme,
        scenes: scenes,
        suspects: suspects,
        evidence: evidence,
        victim: victimDisplay,
        victimLetters: victim,
        flavor: flavor.slice(0, 120)
      }
    };
  }

  function mergeBatch(parsed, pool, gridSize) {
    var existing = {};
    pool.forEach(function (c) { existing[c.id] = true; });
    var accepted = [];
    var quarantined = [];
    var notes = [];
    var list = parsed.cases || [];
    for (var i = 0; i < list.length; i++) {
      var result = validateCase(list[i], gridSize);
      if (result.ok && existing[result.case.id]) {
        notes.push('Case ' + result.case.id + ' was already loaded. Kept the first one.');
        continue;
      }
      if (!result.ok) {
        quarantined.push({ id: result.id, messages: result.messages, raw: list[i] });
        notes.push(result.messages[0]);
        continue;
      }
      accepted.push(result.case);
      existing[result.case.id] = true;
    }
    return { accepted: accepted, quarantined: quarantined, notes: notes };
  }

  global.MMValidate = {
    normalizePaste: normalizePaste,
    parseReply: parseReply,
    validateCase: validateCase,
    mergeBatch: mergeBatch,
    lettersOnly: lettersOnly,
    cleanWord: cleanWord
  };
})(typeof window !== 'undefined' ? window : globalThis);
