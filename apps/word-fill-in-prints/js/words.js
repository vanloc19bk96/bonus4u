/*
 * words.js: everything about the user's words. The app ships no puzzle words; they come
 * from the user (typed, a file, or ChatGPT's answer to the prompts built here).
 *
 *   parse(text)          -> [{ title, words: [raw strings] }]  (JSON or plain text, see below)
 *   prepare(list, opts)  -> cleaned puzzles + a report of what was skipped and why
 *   buildPrompts(opts)   -> the ChatGPT prompt (one prompt for the whole book)
 *
 * Plain-text format (what the prompt asks ChatGPT for, and what people type):
 *   1. Breakfast Foods
 *   EGG, HAM, OAT, JAM, TOAST
 * or "Farm Animals: cow, horse, sheep, pig" on one line,
 * or a title line ending with ":" followed by one word per line; a blank line ends a puzzle.
 * A list with no titles at all is one big pool that the app splits into puzzles.
 */
(function () {
  'use strict';
  window.WF = window.WF || {};

  // ------------------------------------------------------------------ parsing
  // Finds every top-level JSON object/array in free text (ChatGPT often adds prose or ```json fences).
  function jsonChunks(text) {
    var out = [], i = 0;
    while (i < text.length) {
      var ch = text.charAt(i);
      if (ch !== '{' && ch !== '[') { i++; continue; }
      var depth = 0, inStr = false, esc = false, j = i;
      for (; j < text.length; j++) {
        var c = text.charAt(j);
        if (inStr) {
          if (esc) esc = false;
          else if (c === '\\') esc = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') inStr = true;
        else if (c === '{' || c === '[') depth++;
        else if (c === '}' || c === ']') { depth--; if (depth === 0) break; }
      }
      if (depth !== 0) { out.push({ error: 'unclosed', start: i, end: text.length }); break; }
      var raw = text.slice(i, j + 1);
      var value = tryJSON(raw);
      if (value === undefined) out.push({ error: 'invalid', start: i, end: j + 1 });
      else out.push({ value: value, start: i, end: j + 1 });
      i = j + 1;
    }
    return out;
  }

  function tryJSON(raw) {
    try { return JSON.parse(raw); } catch (e) { /* try a light repair below */ }
    var fixed = raw
      .replace(/[“”]/g, '"')          // curly double quotes
      .replace(/,\s*([}\]])/g, '$1');           // trailing commas
    try { return JSON.parse(fixed); } catch (e2) { return undefined; }
  }

  // Pulls complete {"title": "...", "words": [...]} objects out of broken JSON text.
  function salvage(raw) {
    var out = [], re = /\{\s*"(?:title|theme|name|topic)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"words"\s*:\s*\[([^\]]*)\]\s*\}/g, m;
    while ((m = re.exec(raw))) {
      var words = tryJSON('[' + m[2] + ']');
      var title = tryJSON('"' + m[1] + '"');
      if (Array.isArray(words)) out.push({ title: typeof title === 'string' ? title : m[1], words: words.filter(function (w) { return typeof w === 'string'; }) });
    }
    return out;
  }

  function pickString(o, keys) {
    for (var i = 0; i < keys.length; i++) if (typeof o[keys[i]] === 'string') return o[keys[i]];
    return '';
  }
  function pickArray(o, keys) {
    for (var i = 0; i < keys.length; i++) if (Array.isArray(o[keys[i]])) return o[keys[i]];
    return null;
  }

  // Accepts the documented shape and the usual variations ChatGPT produces.
  function fromJSON(value, out) {
    if (Array.isArray(value)) {
      if (value.every(function (v) { return typeof v === 'string'; })) { out.push({ title: '', words: value }); return; }
      value.forEach(function (v) { fromJSON(v, out); });
      return;
    }
    if (!value || typeof value !== 'object') return;
    var words = pickArray(value, ['words', 'wordList', 'word_list', 'list', 'items', 'answers']);
    if (words) {
      out.push({
        title: pickString(value, ['title', 'theme', 'name', 'topic', 'category']),
        words: words.map(function (w) { return typeof w === 'string' ? w : w && typeof w.word === 'string' ? w.word : ''; })
      });
      return;
    }
    var list = pickArray(value, ['puzzles', 'themes', 'data', 'book', 'categories', 'topics']);
    if (list) { fromJSON(list, out); return; }
    // { "Farm Animals": [...], "Kitchen": [...] }
    Object.keys(value).forEach(function (k) {
      if (Array.isArray(value[k]) && value[k].every(function (v) { return typeof v === 'string'; })) {
        out.push({ title: k, words: value[k] });
      }
    });
  }

  function splitWords(s) {
    return s.split(/[,;|\t]+/).map(function (w) { return w.trim(); }).filter(Boolean);
  }

  // Drops markdown and list markers ChatGPT adds: "### 1. **Breakfast Foods**" -> "Breakfast Foods".
  function cleanLine(line) {
    return line
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/\*\*|__/g, '')
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
      .trim();
  }
  function isList(t) { return /[,;|\t]/.test(t); }

  function fromText(text) {
    var lines = text.split(/\r?\n/).map(cleanLine), out = [], cur = null;
    function close() {
      // A title of 4+ words with no words under it is chatter ("Here are your lists:").
      if (cur && (cur.words.length || (cur.title && cur.title.split(/\s+/).length < 6))) out.push(cur);
      cur = null;
    }
    function nextLine(i) {
      for (var j = i + 1; j < lines.length; j++) if (lines[j]) return lines[j];
      return '';
    }
    lines.forEach(function (t, i) {
      // A blank line ends a puzzle, except right after its title (the words may follow a gap).
      if (!t) { if (cur && cur.words.length) close(); return; }
      var m = t.match(/^([^:]{1,80}):\s*(.*)$/);
      if (m) {
        close();
        cur = { title: m[1].trim(), words: splitWords(m[2]) };
        return;
      }
      // "Breakfast Foods" alone on a line, with its comma-separated words on the next line.
      if (!isList(t) && t.length <= 80 && isList(nextLine(i))) {
        close();
        cur = { title: t, words: [] };
        return;
      }
      if (isList(t)) {
        if (!cur) cur = { title: '', words: [] };
        cur.words = cur.words.concat(splitWords(t));
        return;
      }
      // A line without commas is one entry (it may be "ICE CREAM"); a sentence is chatter.
      if (t.split(/\s+/).length > 3) return;
      if (!cur) cur = { title: '', words: [] };
      cur.words.push(t);
    });
    close();
    return out;
  }

  // Returns { puzzles: [{title, words}], errors: [string], format: 'json'|'text'|'' }
  function parse(text) {
    text = String(text || '').replace(/```[a-zA-Z]*/g, '');
    if (!text.trim()) return { puzzles: [], errors: [], format: '' };
    var looksJSON = /^\s*[{[]/.test(text) || /"words"\s*:/.test(text);
    if (looksJSON) {
      var chunks = jsonChunks(text), puzzles = [], errors = [];
      var rest = '', pos = 0;
      chunks.forEach(function (c, i) {
        if (c.value !== undefined) { fromJSON(c.value, puzzles); }
        else {
          // Broken or cut-off JSON: keep every list that is complete.
          var saved = salvage(text.slice(c.start, c.end));
          puzzles = puzzles.concat(saved);
          errors.push('Part ' + (i + 1) + (c.error === 'unclosed' ? ' looks cut off' : ' is not valid JSON') +
            (saved.length ? ' (kept its ' + saved.length + ' complete list' + (saved.length === 1 ? '' : 's') + ')' : '') +
            '. Ask ChatGPT to "continue" or run that prompt again, and paste the rest.');
        }
        rest += text.slice(pos, c.start) + '\n';
        pos = c.end;
      });
      rest += text.slice(pos);
      // Typed lists next to the JSON ("Trees: oak, pine, elm"). Chatty lines are ignored:
      // only "Title: word, word, word" lines count.
      rest.split(/\r?\n/).forEach(function (line) {
        if (/^[^:{}\[\]"]{1,80}:\s*[^,]+(,[^,]+){2,}$/.test(line.trim())) puzzles = puzzles.concat(fromText(line));
      });
      if (puzzles.length || errors.length) return { puzzles: puzzles, errors: errors, format: 'json' };
    }
    return { puzzles: fromText(text), errors: [], format: 'text' };
  }

  // ------------------------------------------------------------------ cleaning
  var FOLD = { 'Æ': 'AE', 'Œ': 'OE', 'Ø': 'O', 'ß': 'SS', 'Þ': 'TH', 'Ð': 'D', 'Đ': 'D', 'ẞ': 'SS' };

  // Letters the embedded font can print, as uppercase (A-Z plus Latin-1 letters).
  function isPrintableLetter(ch) {
    var c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return true;
    return c >= 192 && c <= 222 && c !== 215 && !!WF.FONT_METRICS.bold.widths[c];
  }

  // Word -> { word } or { reason }. Spaces, hyphens and apostrophes are dropped
  // ("ICE CREAM" -> "ICECREAM"), which is the norm in fill-in books.
  function cleanWord(raw, opts) {
    var s = String(raw || '').trim();
    if (!s) return { reason: 'empty' };
    s = s.toUpperCase();
    if (opts.stripAccents) {
      s = s.replace(/[ÆŒØßÞÐĐẞ]/g, function (m) { return FOLD[m]; });
      if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    } else if (s.normalize) s = s.normalize('NFC');
    s = s.replace(/[\s\-‐-―'’.·]/g, '');
    if (!s) return { reason: 'empty' };
    for (var i = 0; i < s.length; i++) {
      if (!isPrintableLetter(s.charAt(i))) {
        return { reason: /\d/.test(s.charAt(i)) ? 'has a number' : 'has "' + s.charAt(i) + '"' + (opts.stripAccents ? '' : ' (try Remove accents)') };
      }
    }
    if (s.length < opts.minLen) return { reason: 'shorter than ' + opts.minLen + ' letters' };
    if (s.length > opts.maxLen) return { reason: 'longer than ' + opts.maxLen + ' letters (the grid size)' };
    return { word: s };
  }

  // Keeps only characters the font can print in titles.
  function cleanTitle(raw) {
    var s = String(raw || '').replace(/\s+/g, ' ').trim(), out = '';
    var widths = WF.FONT_METRICS.bold.widths;
    for (var i = 0; i < s.length; i++) if (widths[s.charCodeAt(i)] !== undefined) out += s.charAt(i);
    return out.slice(0, 60).trim();
  }

  /*
   * list: parse().puzzles
   * opts: { stripAccents, minLen, maxLen, noRepeats, minWords, poolSize }
   * Titled puzzles stay one puzzle each. Untitled lists are pooled and cut into puzzles of
   * poolSize words (the generator uses as many of each chunk as fit).
   */
  function prepare(list, opts) {
    var report = { skipped: [], dropped: [], repeats: 0, duplicateTitles: [] };
    var puzzles = [], pool = [], usedBook = {}, titleSeen = {};

    list.forEach(function (item, idx) {
      var seen = {}, words = [];
      item.words.forEach(function (raw) {
        var r = cleanWord(raw, opts);
        if (!r.word) {
          if (r.reason !== 'empty' && report.skipped.length < 400) report.skipped.push({ raw: String(raw), reason: r.reason, title: item.title });
          return;
        }
        if (seen[r.word]) return;
        seen[r.word] = true;
        words.push(r.word);
      });
      var title = cleanTitle(item.title);
      if (!title) { pool = pool.concat(words); return; }
      var key = title.toLowerCase();
      if (titleSeen[key]) report.duplicateTitles.push(title);
      titleSeen[key] = true;
      puzzles.push({ title: title, words: words, source: idx });
    });

    if (pool.length) {
      var size = Math.max(opts.minWords, opts.poolSize), chunk = [];
      var seenPool = {};
      pool = pool.filter(function (w) { if (seenPool[w]) return false; seenPool[w] = true; return true; });
      for (var i = 0; i < pool.length; i += size) {
        chunk = pool.slice(i, i + size);
        puzzles.push({ title: '', words: chunk, source: -1 });
      }
    }

    // A word already used by an earlier puzzle is removed from later ones.
    if (opts.noRepeats) {
      puzzles.forEach(function (p) {
        p.words = p.words.filter(function (w) {
          if (usedBook[w]) { report.repeats++; return false; }
          usedBook[w] = true;
          return true;
        });
      });
    }

    var ok = [];
    puzzles.forEach(function (p) {
      if (p.words.length < opts.minWords) report.dropped.push({ title: p.title || '(untitled list)', count: p.words.length });
      else ok.push(p);
    });
    var total = 0;
    ok.forEach(function (p) { total += p.words.length; });
    return { puzzles: ok, wordCount: total, report: report };
  }

  // ------------------------------------------------------------------ prompts
  var AUDIENCE = {
    adults: 'adults',
    seniors: 'seniors (familiar, everyday words; nothing obscure)',
    kids: 'children aged 8 to 12 (simple, well-known, age-appropriate words)',
    teens: 'teenagers',
    all: 'all ages (family friendly)'
  };
  var LEVEL = {
    easy: 'mostly common, everyday words',
    medium: 'a mix of common words and a few less obvious ones',
    hard: 'a mix that includes plenty of less obvious, more specific words'
  };

  function randomCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';
    for (var i = 0; i < 6; i++) out += chars.charAt(WF.random.int(chars.length));
    return out;
  }

  // Lists per prompt: small enough that the AI answers in one go without stopping.
  function perPrompt(wordsPer) { return wordsPer > 40 ? 5 : 10; }

  /*
   * opts: { themes: [string], count, wordsPer, minLen, maxLen, audience, language, topic, difficulty }
   * Returns [{ label, text, from, to }]: one prompt per batch of lists. Every prompt carries the
   * full rules, and asks the AI to stay different from earlier lists in the same chat, so pasting
   * them one after another in one chat keeps themes and words apart. Missing themes are invented.
   */
  function buildPrompts(opts) {
    var n = opts.count, per = perPrompt(opts.wordsPer), parts = Math.ceil(n / per), out = [];
    // A title is read as "the line before a comma list", so it must not contain commas.
    var themes = opts.themes.slice(0, n).map(function (t) { return t.replace(/\s*[,;]\s*/g, ' & '); });
    for (var from = 1; from <= n; from += per) {
      var to = Math.min(n, from + per - 1), part = out.length + 1;
      out.push({
        label: parts === 1
          ? 'One prompt · ' + n + ' puzzle' + (n === 1 ? '' : 's')
          : 'Prompt ' + part + ' · puzzle' + (from === to ? ' ' + from : 's ' + from + '–' + to),
        text: promptText(opts, themes.slice(from - 1, to), from, to, part, parts),
        from: from,
        to: to
      });
    }
    return out;
  }

  function promptText(o, themes, from, to, part, parts) {
    var lang = (o.language || 'English').trim(), n = to - from + 1, invent = n - themes.length, s = n === 1 ? '' : 's';
    var multi = parts > 1, range = n === 1 ? 'number ' + from : 'numbered ' + from + ' to ' + to;
    var L = [];
    L.push('You are helping me write a Word Fill-In puzzle book' + (o.topic ? ' about "' + o.topic.trim() + '"' : '') + '.');
    L.push('A Word Fill-In is a crossword with no clues: the solver fits a list of words into a grid, so I only need word lists.');
    if (multi) {
      L.push('I am asking for the lists in ' + parts + ' parts, in this same chat. This is part ' + part + ' of ' + parts + '.');
      if (from > 1) L.push('If lists 1 to ' + (from - 1) + ' are already in this chat, every new theme and every word must be different from all of them.');
    }
    L.push('');
    L.push('Create ' + n + ' word list' + s + ', one per theme, ' + range + '.');
    if (themes.length) {
      L.push('Use these themes, in this order, with these exact titles:');
      themes.forEach(function (t, i) { L.push((from + i) + '. ' + t); });
    }
    if (invent > 0) {
      var first = from + themes.length;
      L.push((themes.length
        ? 'Then invent ' + invent + ' more theme' + (invent === 1 ? '' : 's') + ' (' + (invent === 1 ? 'number ' + first : 'numbers ' + first + ' to ' + to) + ')'
        : 'Invent ' + n + ' theme' + s) + ' that fit the book. Every theme must be different from all the others.');
    }
    L.push('');
    L.push('Rules for every list:');
    L.push('- Exactly ' + o.wordsPer + ' different words, all clearly related to the theme.');
    L.push('- Language: ' + lang + '. Audience: ' + (AUDIENCE[o.audience] || AUDIENCE.adults) + '.');
    L.push('- Each word is ' + o.minLen + ' to ' + o.maxLen + ' letters long. Letters only: no numbers, no hyphens, no abbreviations.');
    var shortTop = Math.min(5, o.maxLen), longFrom = Math.min(8, o.maxLen);
    L.push(o.maxLen >= 8
      ? '- Mix the lengths: about a third short (' + o.minLen + '-' + shortTop + ' letters), a third medium (6-7), a third long (' + longFrom + '+). Short words are important.'
      : '- Mix the lengths evenly from ' + o.minLen + ' to ' + o.maxLen + ' letters. Short words are important.');
    L.push('- Use ' + (LEVEL[o.difficulty] || LEVEL.medium) + '.');
    L.push('- Single words are best. A two-word term is fine only if it is very well known.');
    L.push('- Family friendly. No brand names. No word may appear twice anywhere in your answer' + (from > 1 ? ' or in the earlier lists.' : '.'));
    L.push('- Variation code ' + randomCode() + ': use it to make your own fresh choices; do not just list the most obvious words.');
    L.push('');
    L.push('Answer format (follow it exactly):');
    L.push('- Put the whole answer in one plain-text code block. No introduction, no notes, no JSON, no bold.');
    L.push('- Each list is 2 lines: its number and theme title, then all its words on ONE line in CAPITAL LETTERS, separated by commas.');
    L.push('- Leave one empty line between lists. Never put a comma in a theme title.');
    L.push('');
    L.push('Example:');
    L.push(from + '. Theme Title');
    L.push('WORD, WORD, WORD, WORD, WORD');
    L.push('');
    L.push((from + 1) + '. Theme Title');
    L.push('WORD, WORD, WORD, WORD, WORD');
    L.push('');
    L.push((n === 1 ? 'Write the list, ' : 'Write all ' + n + ' lists, ') + range + '. Do not skip, shorten or summarize any list.' +
      (to < o.count ? ' Stop after number ' + to + ': I will ask for the next part.' : ''));
    if (n > 1) L.push('If your reply gets too long, stop after a complete list. When I write "continue", go on from the next number in a new code block.');
    return L.join('\n');
  }

  function themePrompt(o) {
    var L = [];
    L.push('Suggest ' + o.count + ' different themes for a Word Fill-In puzzle book' + (o.topic ? ' about "' + o.topic.trim() + '"' : '') +
      ' for ' + (AUDIENCE[o.audience] || AUDIENCE.adults) + ', in ' + ((o.language || 'English').trim()) + '.');
    L.push('Each theme must be specific enough to give at least ' + o.wordsPer + ' related words (for example "Things in a Kitchen", not "Stuff").');
    L.push('Keep each theme name short (2 to 5 words). Variation code ' + randomCode() + ': make fresh, varied choices.');
    L.push('Answer with JSON only: an array of strings, like ["Theme one","Theme two"]');
    return L.join('\n');
  }

  // Themes box: accepts one theme per line, or a pasted JSON array.
  function parseThemes(text) {
    text = String(text || '').replace(/```[a-zA-Z]*/g, '');
    var chunks = /^\s*\[/.test(text) ? jsonChunks(text) : [];
    var out = [];
    chunks.forEach(function (c) {
      if (Array.isArray(c.value)) c.value.forEach(function (v) { if (typeof v === 'string') out.push(v); else if (v && v.title) out.push(String(v.title)); });
    });
    if (!out.length) out = text.split(/\r?\n/).map(function (l) { return l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''); });
    var seen = {};
    return out.map(function (t) { return cleanTitle(t); }).filter(function (t) {
      var k = t.toLowerCase();
      if (!t || seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  // ------------------------------------------------------------------ theme ideas
  // Theme NAMES only, as a starting point the user can edit. The words always come from the user.
  var IDEAS = [
    'Farm Animals', 'Ocean Life', 'In the Kitchen', 'Garden Flowers', 'Fruits', 'Vegetables', 'Weather', 'Musical Instruments',
    'Sports', 'Board Games', 'Birds', 'Insects and Bugs', 'Trees', 'At the Beach', 'Camping Trip', 'Things in a Bathroom',
    'Tools in the Shed', 'Colors and Shades', 'Clothing', 'Shoes and Hats', 'Jobs and Careers', 'Things with Wheels',
    'At the Airport', 'World Capitals', 'Countries', 'US States', 'Rivers and Lakes', 'Mountains', 'Space and Planets',
    'Dinosaurs', 'Desserts', 'Breakfast Foods', 'Cheese', 'Herbs and Spices', 'Baking', 'Pasta Shapes', 'Drinks',
    'Dog Breeds', 'Cat Breeds', 'Pets', 'Jungle Animals', 'Arctic Animals', 'Reptiles', 'Knitting and Sewing',
    'Gardening', 'Home Furniture', 'Office Supplies', 'School Days', 'Science Lab', 'Human Body', 'Doctor Visit',
    'Emotions', 'Hobbies', 'Dance Styles', 'Movie Night', 'Theater', 'Books and Reading', 'Famous Painters',
    'Composers', 'Inventions', 'Gemstones', 'Metals and Minerals', 'Fishing', 'Sailing', 'Winter Fun', 'Spring Time',
    'Summer Holiday', 'Autumn Days', 'Christmas', 'Halloween', 'Thanksgiving', 'Easter', 'Valentine’s Day',
    'Wedding Day', 'Birthday Party', 'Picnic', 'Carnival and Fair', 'Circus', 'Castles and Knights', 'Pirates',
    'Ancient Egypt', 'Ancient Rome', 'Greek Myths', 'The Wild West', 'Fairy Tales', 'Magic Show', 'Detective Story',
    'Things That Fly', 'Boats and Ships', 'Trains and Railways', 'Cars', 'City Life', 'Country Life', 'Around the House',
    'Cleaning Day', 'Laundry', 'Coffee Shop', 'Bakery', 'Farmers Market', 'Supermarket', 'Restaurant Menu',
    'Italian Food', 'Mexican Food', 'Asian Food', 'Soup and Stew', 'Nuts and Seeds', 'Berries', 'Citrus Fruits',
    'Mushrooms and Fungi', 'Rainforest', 'Desert', 'Volcanoes', 'Rocks and Soil', 'Rivers and Streams', 'Islands',
    'Olympic Sports', 'Tennis', 'Golf', 'Baseball', 'Basketball', 'Soccer', 'Swimming', 'Cycling', 'Hiking',
    'Yoga and Wellness', 'Healthy Living', 'Music Genres', 'Photography', 'Computers', 'Math Words', 'Grammar Words',
    'Shapes and Patterns', 'Things That Are Round', 'Things That Are Red', 'Things That Are Green', 'Small Things',
    'Opposites', 'Money and Banking', 'Post Office', 'Newspaper', 'Radio and TV', 'Nursery Rhymes', 'Toys',
    'Playground', 'Baby Things', 'Grandparents', 'Family', 'Friendship', 'Kindness', 'Hometown', 'Road Trip',
    'Hotel Stay', 'Cruise Ship', 'Safari', 'National Parks', 'Nature Walk', 'Pond Life', 'Night Sky', 'Bees and Honey'
  ];

  function suggestThemes(count, exclude) {
    var ex = {}, pool = [];
    (exclude || []).forEach(function (t) { ex[t.toLowerCase()] = true; });
    IDEAS.forEach(function (t) { if (!ex[t.toLowerCase()]) pool.push(t); });
    for (var i = pool.length - 1; i > 0; i--) {
      var j = WF.random.int(i + 1), t = pool[i];
      pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, Math.max(0, count));
  }

  // ------------------------------------------------------------------ randomness
  // crypto-backed so two people never start from the same seed or variation code.
  WF.random = {
    uint32: function () {
      try {
        var a = new Uint32Array(1);
        window.crypto.getRandomValues(a);
        return a[0];
      } catch (e) { return Math.floor(Math.random() * 4294967296); }
    },
    int: function (n) { return WF.random.uint32() % n; }
  };

  WF.Words = {
    IDEA_COUNT: IDEAS.length,
    parse: parse,
    cleanWord: cleanWord,
    cleanTitle: cleanTitle,
    prepare: prepare,
    buildPrompts: buildPrompts,
    themePrompt: themePrompt,
    parseThemes: parseThemes,
    suggestThemes: suggestThemes
  };
})();
