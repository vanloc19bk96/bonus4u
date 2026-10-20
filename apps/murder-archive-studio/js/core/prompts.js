/*
 * Prompts the user copies into ChatGPT, Claude or Gemini.
 * Each prompt works in a brand-new chat, states every limit the app checks, and asks for one
 * JSON object with an example of the exact structure. The clues are written by the engine and
 * handed to the AI as fixed text: the AI only writes the story around them.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};

  var PATRONS = 20;      // suspects the AI invents for archives without names
  var CAST = 8;          // people from the archive the AI writes into the story
  var INTERLUDES = 3;    // short scenes between the clues

  var TONES = {
    cozy: 'warm, witty and cozy, like a classic village mystery',
    classic: 'a classic Golden Age whodunit: elegant, clever, a little theatrical',
    dark: 'tense and atmospheric, a gripping thriller voice, but never graphic'
  };

  var CONTENT_RULES = [
    '- Clean content: no gore, no sexual content, no profanity, no cruelty to animals or children. The death happens off the page and is never described in detail.',
    '- Every name you invent must be original: no real people, no brands, and no characters, places or titles from existing books, films, games or TV shows. Do not borrow the plot or names of any existing puzzle book, such as “The Lottery Killer”, “The Killer Isn’t Alice” or “The Killer Is Still On Board”.',
    '- US English spelling and punctuation, for readers on Amazon.com.'
  ].join('\n');

  var ANSWER_RULES =
    'Reply with ONE JSON object only. No greeting, no explanation, no notes before or after it, and no markdown. ' +
    'Use straight double quotes, no trailing commas, and write paragraph breaks inside text as \\n\\n.';

  function fmtN(n) { return n.toLocaleString('en-US'); }
  function isLottery(cs) { return cs.type.id === 'lottery'; }
  function suspectsKey(cs) { return isLottery(cs) ? 'patrons' : 'suspects'; }

  function venueLine(project, cs) {
    var s = project.setup, v = cs.setting;
    if (v.id === 'custom') return (s.customVenue || (isLottery(cs) ? 'a charity raffle evening' : v.where || 'a place of your choice')) + '.';
    return v.label + ' (' + v.hint.charAt(0).toLowerCase() + v.hint.slice(1) + ').';
  }

  function registerLine(cs) {
    if (!isLottery(cs)) return cs.type.recordLine(cs);
    var v = cs.venue;
    return 'Each ticket record shows: ticket number, purchase time, ' + v.place.toLowerCase() + ' number (1 to ' + cs.places + '), amount paid (' +
      v.amounts.map(LK.register.fmtAmount).join(', ') + '), payment method (' + v.methods.join(', ') + '), six lucky numbers from 1 to 49, and the buyer\'s initials.';
  }

  function premise(project, cs) {
    if (!isLottery(cs)) return cs.type.premise(cs);
    return 'On the night of the murder, ' + fmtN(cs.records.length) + ' lottery tickets were sold for ' + LK.themes.venue(project.setup.venue).draw + '. The book prints the whole ticket register.';
  }

  // Story sparks, fixed by the seed. A setting with a fixed era or place keeps it.
  function sparks(project, cs) {
    var sp = LK.themes.sparks(project.seed);
    var t = cs.type, s = cs.setting;
    if (!isLottery(cs) && t.twists) sp.twist = LK.util.makeRng('twist:' + project.seed).pick(t.twists);
    if (s.fixedEra) sp.era = s.fixedEra;
    return sp;
  }

  function sparkLines(project, cs) {
    var sp = sparks(project, cs), s = cs.setting;
    var place = isLottery(cs) || !s.where || s.id === 'custom' ? sp.region + ', in ' + sp.era + '.'
      : cap(s.where) + ', in ' + sp.era + '. Some of the characters come from ' + sp.region + '.';
    return [
      '- Place and time: ' + place,
      '- Victim: ' + sp.victim + '. How they died: ' + sp.method + ' (kept off the page).',
      '- The letter that hands the case to the reader is written by ' + sp.client + '.',
      '- Motive: ' + sp.motive + '.',
      '- Twist for the ending: ' + sp.twist + '.'
    ];
  }

  function clueLines(cs) { return cs.clues.map(function (c) { return c.n + '. ' + c.text; }); }

  // The clue numbers after which the interludes are printed.
  function interludeSlots(K) {
    var out = [];
    for (var i = 1; i <= INTERLUDES; i++) out.push(Math.round(K * i / (INTERLUDES + 1)));
    return out;
  }

  // What [ANSWER] stands for in the epilogue.
  function answerText(cs) {
    var t = cs.type;
    if (isLottery(cs)) return String(cs.killer.t);
    if (t.mode === 'ledger') return t.ledgerLabel(cs.killer, cs);
    var key = t.keyDigits(cs.killer, cs);
    return key || t.recordLabel(cs.killer, cs);
  }

  function noteRules(L) {
    L.push('- Never repeat, change or add any number, time, digit, amount, letter or label from the clue. The exact rule is printed right under your note.');
    L.push('- Write no digits at all in the notes, and never name the killer.');
    L.push('- Use a different witness or source for each clue, and let them build the story.');
  }

  // ---------- the story prompt ----------
  function storyPrompt(project, cs) {
    var s = project.setup, t = cs.type, u = t.unit, named = t.mode === 'named';
    var N = cs.records.length, K = cs.clues.length;
    var L = [];
    L.push('You are a bestselling author of murder mystery puzzle books. Write the story for an elimination-style murder mystery puzzle book for adults. The puzzle is already built; you write the story around it.');
    L.push('');
    L.push('HOW THE BOOK WORKS');
    L.push('- ' + premise(project, cs) + ' ' + registerLine(cs));
    if (isLottery(cs)) L.push('- The reader is the detective. Using ' + K + ' clues, they cross out tickets until exactly one is left: the ticket the killer bought.');
    else if (named) L.push('- The reader is the detective. Using ' + K + ' clues, they cross out ' + u.many + ' until exactly one is left. Every record names a real person, so the last name standing is the killer.');
    else L.push('- The reader is the detective. Using ' + K + ' clues, they cross out ' + u.many + ' until exactly one is left: ' + (t.target.who === 'the killer' ? 'the one that belongs to the killer.' : t.target.who + '.'));
    if (!named) L.push('- ' + t.ledger.prompt.replace('the named', 'the ' + PATRONS + ' named') + ' The last ' + t.ledger.item + ' standing points to the killer\'s name.');
    L.push('- Reading order: prologue, a letter that hands the case to the reader, the clues (with ' + INTERLUDES + ' short interludes between them), the ' + t.archive.name + (named ? '' : ', the ' + t.ledger.title.replace(/^The /, '')) + ', then the epilogue that reveals the truth.');
    L.push('');
    L.push('THE CASE');
    L.push('- Setting: ' + venueLine(project, cs));
    sparkLines(project, cs).forEach(function (l) { L.push(l); });
    if (s.ideas && s.ideas.trim()) L.push('- The author\'s own ideas (follow them, they win over the sparks above): ' + s.ideas.trim().replace(/\s+/g, ' '));
    L.push('- Adjust a spark if it clashes with the setting, but keep its spirit. Make the story fresh and surprising.');
    L.push('- Tone: ' + (TONES[s.tone] || TONES.classic) + '.');
    if (named) {
      var cast = LK.book.cast(project, cs, CAST);
      var killer = cast.filter(function (c) { return c.killer; })[0];
      L.push('');
      L.push('THE CAST (fixed by the puzzle: these people are in the ' + t.archive.name + ' with exactly these details)');
      L.push('- SECRET, for you only: the killer is ' + killer.name + ' (' + killer.details + ').');
      L.push('- Other people from the ' + t.archive.name + ' to weave in as suspects and red herrings: ' + cast.filter(function (c) { return !c.killer; }).map(function (c) { return c.name + ' (' + c.details + ')'; }).join('; ') + '.');
      L.push('- Use these names exactly as written, and do not contradict their details. The victim and the letter writer are new characters, not in the ' + t.archive.name + '. In the prologue, the killer is just one of the crowd and must not look more suspicious than the others.');
    }
    L.push('');
    L.push('THE CLUES (fixed, written by the puzzle engine; do not change them)');
    clueLines(cs).forEach(function (l) { L.push(l); });
    L.push('');
    L.push('For EACH clue, write a "title" of 2 to 4 words (for example "The Service Bell" or "A Torn Receipt") and a "note": one or two sentences, 12 to 40 words, saying who or what revealed this fact in the story (a waiter\'s memory, a torn receipt, a security camera, a gossiping guest...). Rules for titles and notes:');
    noteRules(L);
    L.push('');
    L.push('INTERLUDES');
    L.push('- Write ' + INTERLUDES + ' short scenes that are printed between the clues, after clues ' + interludeSlots(K).join(', ') + '. Each has a title (at most 4 words) and 60 to 110 words: the investigation moves on, the pressure rises, a suspect says too much. No digits, and never reveal the killer.');
    if (!named) {
      L.push('');
      L.push((isLottery(cs) ? 'PATRON LEDGER' : 'SUSPECTS'));
      L.push('- Exactly ' + PATRONS + ' suspects, each with an original full name (first and last), a role of at most 8 words, and a note of at most 20 words that makes them look suspicious or interesting.');
      L.push('- Exactly one suspect is the killer. Write the killer\'s name in "killer" exactly as it appears in "' + suspectsKey(cs) + '". The victim and the letter writer are not suspects.');
    }
    L.push('');
    L.push('WRITING');
    L.push('- prologue: a title (at most 40 characters) and 450 to 650 words in 5 to 8 paragraphs: the event, ' + (isLottery(cs) ? 'the draw, ' : '') + 'the death, and why the police have the wrong person. Third person, past tense.');
    L.push('- letter: 180 to 280 words from the letter writer to the reader, starting "Dear Detective," and explaining the clues and the ' + t.archive.name + '. Put the writer\'s name in "client" and end the text with a short sign-off line, without the name (the app prints the name as the signature).');
    L.push('- epilogue: a title and 400 to 600 words: the killer is unmasked, with the motive, the method, how the clues fit together and the twist. Write ' + (isLottery(cs) ? '[TICKET] wherever the killer\'s ticket number appears' : '[ANSWER] wherever the ' + (named ? t.keyLabel : t.ledger.item) + ' of the answer appears') + '; the app fills it in.');
    L.push(CONTENT_RULES);
    L.push('');
    L.push('FOR THE AMAZON LISTING');
    L.push('- titles: 3 original title ideas, at most 60 characters each' + (s.title ? ' (put "' + s.title + '" first)' : '') + '. Never use the title of an existing book or series, such as "The Lottery Killer", "The Killer Isn\'t Alice", "The Killer Is Still On Board" or "The Killer Never Checked In".');
    L.push('- subtitle: at most 120 characters, for example "A Murder Mystery Elimination Puzzle: ' + fmtN(N) + ' ' + cap(u.many) + ', ' + K + ' Clues, One Killer".');
    L.push('- blurb: the Amazon description, 120 to 200 words. Hook the reader, explain how the puzzle works, never reveal the killer.');
    L.push('- keywords: exactly 7 search phrases a reader would type on Amazon, at most 50 characters each. No author names, no brand or series names, no words like "bestseller", "free" or "new".');
    L.push('');
    L.push('ANSWER');
    L.push(ANSWER_RULES);
    L.push('Example of the exact structure (shortened; your answer has all ' + K + ' clue notes, all ' + INTERLUDES + ' interludes' + (named ? '' : ' and all ' + PATRONS + ' suspects') + '):');
    var ex = {
      titles: ['Title One', 'Title Two', 'Title Three'],
      subtitle: 'A Murder Mystery Elimination Puzzle',
      blurb: 'Amazon description, 120 to 200 words.',
      keywords: ['murder mystery puzzle book', 'keyword 2', 'keyword 3', 'keyword 4', 'keyword 5', 'keyword 6', 'keyword 7'],
      setting: 'Town, place and time in one or two sentences.',
      victim: { name: 'First Last', who: 'who the victim was' },
      client: { name: 'First Last', who: 'who the letter writer is' },
      prologue: { title: 'Prologue Title', text: 'First paragraph...\n\nSecond paragraph...' },
      letter: { text: 'Dear Detective,\n\nFirst paragraph...\n\nWith hope,' },
      clue_notes: [{ n: 1, title: 'Two To Four Words', note: 'Who or what revealed this clue, with no digits.' }],
      interludes: [{ after: interludeSlots(K)[0], title: 'Scene Title', text: 'A short scene of 60 to 110 words.' }]
    };
    if (!named) {
      ex[suspectsKey(cs)] = [{ name: 'First Last', role: 'short role', note: 'why they look suspicious' }];
      ex.killer = 'First Last';
    }
    ex.motive = 'Why the killer did it, in one or two sentences.';
    ex.epilogue = { title: 'Epilogue Title', text: 'First paragraph... ' + (isLottery(cs) ? 'ticket [TICKET]' : '[ANSWER]') + ' ...\n\nSecond paragraph...' };
    L.push(JSON.stringify(ex, null, 2));
    return L.join('\n');
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function storyCore(project, cs, L) {
    var st = project.story, t = cs.type;
    L.push('STORY');
    L.push('Setting: ' + (st.setting || venueLine(project, cs)));
    if (st.victim && st.victim.name) L.push('Victim: ' + st.victim.name + (st.victim.who ? ', ' + st.victim.who : '') + '.');
    if (st.client && st.client.name) L.push('Letter writer: ' + st.client.name + (st.client.who ? ', ' + st.client.who : '') + '.');
    L.push('SECRET, for you only: the killer is ' + LK.book.killerName(project, cs) + '. ' + (st.motive || ''));
  }

  // ---------- refresh the clue notes after the clues changed ----------
  function cluesPrompt(project, cs) {
    var L = [], K = cs.clues.length;
    L.push('You are a bestselling author of murder mystery puzzle books. The clues of my puzzle book changed. Write a new title and a new short note for each clue, and new interludes, that fit the story below.');
    L.push('');
    storyCore(project, cs, L);
    L.push('');
    L.push('THE CLUES (fixed, do not change them)');
    clueLines(cs).forEach(function (l) { L.push(l); });
    L.push('');
    L.push('For EACH clue, write a "title" of 2 to 4 words and a "note": one or two sentences, 12 to 40 words, saying who or what revealed this fact in the story.');
    noteRules(L);
    L.push('Also write ' + INTERLUDES + ' interludes (title of at most 4 words, 60 to 110 words each, no digits, never revealing the killer), printed after clues ' + interludeSlots(K).join(', ') + '.');
    L.push(CONTENT_RULES);
    L.push('');
    L.push('ANSWER');
    L.push(ANSWER_RULES);
    L.push('Structure: ' + JSON.stringify({ clue_notes: [{ n: 1, title: '...', note: '...' }, { n: 2, title: '...', note: '...' }], interludes: [{ after: interludeSlots(K)[0], title: '...', text: '...' }] }) +
      ' with all ' + K + ' notes and all ' + INTERLUDES + ' interludes.');
    return L.join('\n');
  }

  // ---------- fix prompt ----------
  function fieldHelp(cs) {
    var lot = isLottery(cs), sk = suspectsKey(cs);
    return {
      titles: '"titles": 3 original title ideas, at most 60 characters each, never the title of an existing book or series',
      subtitle: '"subtitle": at most 120 characters',
      blurb: '"blurb": 120 to 200 words, never revealing the killer',
      keywords: '"keywords": exactly 7 phrases, at most 50 characters each, no author, brand or series names, no "bestseller", "free" or "new"',
      setting: '"setting": one or two sentences',
      victim: '"victim": { "name", "who" }',
      client: '"client": { "name", "who" } (the letter writer)',
      prologue: '"prologue": { "title" (at most 40 characters), "text" (450 to 650 words) }',
      letter: '"letter": { "text" (180 to 280 words, starting "Dear Detective,") }',
      clue_notes: '"clue_notes": one item per clue { "n", "title" (2 to 4 words), "note" (12 to 40 words) }, no digits, never naming the killer',
      interludes: '"interludes": ' + INTERLUDES + ' items { "after" (the clue number), "title", "text" (60 to 110 words) }, printed after clues ' + interludeSlots(cs.clues.length).join(', '),
      patrons: '"' + sk + '": exactly ' + PATRONS + ' items { "name", "role", "note" } with original, different full names',
      killer: '"killer": the killer\'s name exactly as written in "' + sk + '"',
      motive: '"motive": one or two sentences',
      epilogue: '"epilogue": { "title", "text" (400 to 600 words, with ' + (lot ? '[TICKET] where the ticket number goes' : '[ANSWER] where the answer goes') + ') }'
    };
  }

  function fixPrompt(project, cs, issues) {
    var errs = issues.filter(function (i) { return i.level === 'error'; });
    var fields = {};
    errs.forEach(function (i) { if (i.field) fields[i.field] = true; });
    if (fields.killer && cs.type.mode === 'ledger') fields.patrons = true;
    var help = fieldHelp(cs);
    var L = [];
    L.push('You wrote the story for my murder mystery puzzle book, but some parts need fixing:');
    errs.forEach(function (i) { L.push('- ' + i.text); });
    L.push('');
    if (fields.clue_notes || fields.interludes) {
      L.push('THE CLUES (fixed, do not change them)');
      clueLines(cs).forEach(function (l) { L.push(l); });
      L.push('');
    }
    var st = project.story || {};
    if (fields.patrons && st.patrons && st.patrons.length) {
      L.push('CURRENT SUSPECTS: ' + st.patrons.map(function (p) { return p.name; }).join('; ') + '.');
      L.push('');
    }
    L.push('Return ONLY these corrected fields, complete, and keep everything else in the story the same:');
    Object.keys(fields).forEach(function (f) { if (help[f]) L.push('- ' + help[f]); });
    L.push(CONTENT_RULES);
    L.push('');
    L.push('ANSWER');
    L.push(ANSWER_RULES);
    return L.join('\n');
  }

  // ---------- cover artwork ----------
  function coverPrompt(project, cs) {
    var st = project.story || {};
    var sp = sparks(project, cs);
    var t = LK.kdp.trim(project.setup.trim);
    var px = Math.round(t.w * 300) + ' x ' + Math.round(t.h * 300);
    var props = cs.setting.props || (isLottery(cs) ? 'a lottery ticket stub, a magnifying glass, a champagne glass or a raffle drum' : 'a magnifying glass and an old file of records');
    return 'Create front cover artwork for a murder mystery puzzle book (portrait, ' + t.w + ' x ' + t.h + ' inches, ' + px + ' pixels or larger). ' +
      'Scene: ' + (st.setting || venueLine(project, cs) + ' ' + sp.region) + ' ' +
      'Show props from the story: ' + props + ', and dramatic evening light. ' +
      'Style: bold, high-contrast illustration that reads well as a small thumbnail. ' +
      'Leave calm empty space in the top third for the title and at the bottom for the author name. ' +
      'Do NOT add any text, letters, numbers or logos. No blood, no weapons, no faces of real people.';
  }

  LK.prompts = {
    PATRONS: PATRONS, CAST: CAST, INTERLUDES: INTERLUDES, TONES: TONES, interludeSlots: interludeSlots, answerText: answerText,
    storyPrompt: storyPrompt, cluesPrompt: cluesPrompt, fixPrompt: fixPrompt, coverPrompt: coverPrompt
  };
})(typeof window !== 'undefined' ? window : globalThis);
