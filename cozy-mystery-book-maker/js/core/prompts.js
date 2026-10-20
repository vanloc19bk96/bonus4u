/*
 * Prompts the user copies into ChatGPT, Claude or Gemini.
 * Every prompt is self-contained (works in a brand-new chat), states the limits the app checks,
 * and ends by asking for a single JSON object with one example of the exact structure.
 */
(function (root) {
  'use strict';
  var Cozy = root.Cozy = root.Cozy || {};

  var CONTENT_RULES =
    '- Clean cozy tone: no graphic violence, no gore, no profanity, no adult content. The murder happens off the page and is never described in detail.\n' +
    '- Every name must be original: no real people, no brands, and no characters, places or series names from existing books, films or TV shows.\n' +
    '- US English spelling and punctuation, for readers on Amazon.com.';

  var ANSWER_RULES =
    'Reply with ONE JSON object only. No greeting, no explanation, no notes before or after it, and no markdown. ' +
    'Use straight double quotes, no trailing commas, and write paragraph breaks inside text as \\n\\n.';

  function seriesLine(setup) {
    if (!setup.seriesName) return '';
    return 'Series: "' + setup.seriesName + '"' + (setup.bookNumber ? ', book ' + setup.bookNumber : '') + '.';
  }

  function joinNums(arr) { return arr.join(', '); }

  // ---------- prompt 1: story plan ----------
  function planPrompt(project, d) {
    var s = project.setup;
    var theme = Cozy.themes.resolve(s.theme, project.seed);
    var bible = project.seriesBible;
    var lines = [];
    lines.push('You are a bestselling author of clean cozy mysteries. Plan a cozy mystery that will be printed as a word search puzzle book for adults.');
    lines.push('');
    lines.push('HOW THE BOOK WORKS');
    lines.push('- The book has ' + d.N + ' short chapters. Each chapter fills one printed page (about 240 words) and faces a word search puzzle built from words in that chapter.');
    lines.push('- In ' + d.C + ' chapters, one word in the puzzle\'s word list is a hidden clue: it is printed in the list but missing from the grid. Readers write each missing word in a Detective\'s Notebook.');
    lines.push('- A final puzzle uses the ' + d.C + ' clue words. Once they are all crossed out, the leftover letters spell the killer\'s name.');
    lines.push('- Chapter ' + d.N + ' ends just before the sleuth names the killer. An epilogue after the final puzzle explains the case.');
    lines.push('');
    lines.push('BOOK DETAILS');
    lines.push('- Theme: ' + theme + '. Build the setting, the sleuth\'s life and the crime around it.');
    if (s.bookTitle) lines.push('- Working title: "' + s.bookTitle + '". Put it first in "titles", followed by 2 alternatives.');
    else lines.push('- Propose 3 original, catchy cozy mystery titles (wordplay is welcome, at most 40 characters each).');
    if (s.seriesName) lines.push('- ' + seriesLine(s));
    if (bible) {
      lines.push('- This is the next book in an existing series. Keep the same sleuth: ' + bible.sleuth.name + (bible.sleuth.age ? ', ' + bible.sleuth.age : '') +
        (bible.sleuth.job ? ', ' + bible.sleuth.job : '') + (bible.sleuth.trait ? ' (' + bible.sleuth.trait + ')' : '') + '.');
      if (bible.setting) lines.push('- Keep the same home town: ' + bible.setting);
      if (bible.cast && bible.cast.length) lines.push('- Returning friends you may use: ' + bible.cast.map(function (c) { return c.name + ' (' + c.role + ')'; }).join('; ') + '.');
      if (bible.previous && bible.previous.length) lines.push('- Earlier books, whose plots, victims and killers must NOT be reused: ' + bible.previous.join('; ') + '.');
    }
    lines.push('');
    lines.push('STORY RULES');
    lines.push('- An amateur sleuth (not a police officer), one victim, and exactly 5 suspects, each with a believable motive and a secret.');
    lines.push('- Exactly one suspect is the killer. The killer\'s full name must have 6 to 16 letters, not counting spaces (for example "Vera Holloway").');
    lines.push('- Fair play: the clues point to the killer, but every suspect looks guilty at some point, and at least two red herrings are cleared along the way.');
    lines.push('- 2 to 4 recurring friends or helpers (for example a best friend, a pet, a local officer) give the series warmth. List them in "cast".');
    lines.push(CONTENT_RULES);
    lines.push('');
    lines.push('HIDDEN CLUES');
    lines.push('Give exactly ' + d.C + ' clues, one for each of these chapters: ' + joinNums(d.clueChapters) + '. Each clue word must be:');
    lines.push('- one single word, 4 to 9 letters, letters only (no spaces, hyphens or apostrophes);');
    lines.push('- a concrete piece of evidence or fact that points to the killer (for example LEDGER, TEACUP, GLOVES);');
    lines.push('- different from every other clue, and not contained inside another clue, forwards or backwards (not both GLOVE and FOXGLOVE);');
    lines.push('- found or noticed in the beat of that chapter in the outline.');
    lines.push('');
    lines.push('ANSWER');
    lines.push(ANSWER_RULES);
    lines.push('Fields:');
    lines.push('- titles: 3 title ideas');
    lines.push('- subtitle: for the cover, for example "A Cozy Mystery Word Search Book: ' + d.N + ' Chapters, ' + d.N + ' Puzzles and One Killer to Unmask"');
    lines.push('- blurb: the Amazon book description, at most 150 words. Hook the reader, explain the hidden-clue game, never reveal the killer.');
    lines.push('- keywords: exactly 7 search phrases a reader would type on Amazon, each at most 50 characters');
    lines.push('- setting: town, region and key places, 1 to 3 sentences');
    lines.push('- sleuth, victim, cast, suspects (exactly 5), killer (the full name exactly as written in suspects), solution (2 to 3 sentences: who, why and how)');
    lines.push('- outline: exactly ' + d.N + ' items with n from 1 to ' + d.N + ', a title of at most 40 characters and a one-sentence beat');
    lines.push('- clues: exactly ' + d.C + ' items, one per chapter listed above');
    lines.push('');
    lines.push('Example of the exact structure (shortened; your answer has all ' + d.N + ' outline items and all ' + d.C + ' clues):');
    lines.push(JSON.stringify({
      titles: ['Title One', 'Title Two', 'Title Three'],
      subtitle: 'A Cozy Mystery Word Search Book',
      blurb: 'Book description, 150 words at most.',
      keywords: ['cozy mystery word search', 'word search for adults', 'keyword 3', 'keyword 4', 'keyword 5', 'keyword 6', 'keyword 7'],
      setting: 'Town, region and key places.',
      sleuth: { name: 'First Last', age: 63, job: 'what she or he does', trait: 'a memorable habit' },
      victim: { name: 'First Last', who: 'who the victim was' },
      cast: [{ name: 'First Last', role: 'best friend who runs the tea shop' }],
      suspects: [{ name: 'First Last', role: 'who they are', motive: 'why they might have done it' }],
      killer: 'First Last',
      solution: 'Who did it, why and how, in 2 to 3 sentences.',
      outline: [{ n: 1, title: 'Chapter Title', beat: 'One sentence about what happens.' }],
      clues: [{ chapter: d.clueChapters[0] || 2, word: 'LEDGER' }]
    }, null, 2));
    return lines.join('\n');
  }

  // ---------- prompts 2+: chapters ----------
  function bibleText(project, d) {
    var p = project.plan;
    var L = [];
    L.push('Book: "' + Cozy.book.title(project) + '"' + (project.setup.seriesName ? ' (' + seriesLine(project.setup) + ')' : '') + '.');
    L.push('Setting: ' + p.setting);
    L.push('Sleuth: ' + p.sleuth.name + (p.sleuth.age ? ', ' + p.sleuth.age : '') + (p.sleuth.job ? ', ' + p.sleuth.job : '') + (p.sleuth.trait ? '. Trait: ' + p.sleuth.trait : '') + '.');
    L.push('Victim: ' + p.victim.name + (p.victim.who ? ', ' + p.victim.who : '') + '.');
    if (p.cast && p.cast.length) L.push('Recurring characters: ' + p.cast.map(function (c) { return c.name + (c.role ? ' (' + c.role + ')' : ''); }).join('; ') + '.');
    L.push('Suspects:');
    p.suspects.forEach(function (s) { L.push('- ' + s.name + (s.role ? ', ' + s.role : '') + (s.motive ? '. Motive: ' + s.motive : '')); });
    L.push('SECRET, for you only: the killer is ' + p.killer + '. ' + (p.solution || ''));
    return L.join('\n');
  }

  function batchPrompt(project, d, bi) {
    var b = d.batches[bi];
    var p = project.plan;
    var isLast = bi === d.batches.length - 1;
    var clueBy = d.clueByChapter;
    var L = [];
    L.push('You are a bestselling author of clean cozy mysteries. Write chapters ' + b.from + ' to ' + b.to + ' of ' + d.N + ' for a cozy mystery that is printed as a word search puzzle book. ' +
      'Each chapter fills exactly one printed page and faces a word search built from words in that chapter.' + (isLast ? ' Also write the epilogue.' : ''));
    L.push('');
    L.push('STORY BIBLE (keep every name and fact consistent)');
    L.push(bibleText(project, d));
    L.push('');
    var before = p.outline.filter(function (o) { return o.n < b.from; });
    if (before.length) {
      L.push('STORY SO FAR (already written)');
      before.forEach(function (o) { L.push(o.n + '. ' + o.title + ': ' + o.beat); });
      L.push('');
    }
    L.push('WRITE THESE CHAPTERS');
    p.outline.filter(function (o) { return o.n >= b.from && o.n <= b.to; }).forEach(function (o) {
      var line = 'Chapter ' + o.n + ', "' + o.title + '": ' + o.beat;
      var c = clueBy[o.n];
      if (c) line += ' HIDDEN CLUE: mention "' + c.display.toLowerCase() + '" naturally in the text and include ' + c.display + ' in this chapter\'s words.';
      L.push(line);
    });
    var after = p.outline.filter(function (o) { return o.n > b.to; });
    if (after.length) {
      L.push('');
      L.push('COMING LATER (do not write or spoil these yet)');
      after.forEach(function (o) { L.push(o.n + '. ' + o.title + ': ' + o.beat); });
    }
    var prev = project.chapters[b.from - 1];
    if (prev && prev.paragraphs && prev.paragraphs.length) {
      L.push('');
      L.push('THE CHAPTER JUST BEFORE THESE (match its voice; do not repeat it)');
      L.push('Chapter ' + prev.n + ', "' + prev.title + '"');
      L.push(prev.paragraphs.join('\n\n'));
    }
    L.push('');
    L.push('RULES FOR EVERY CHAPTER');
    L.push('- title: at most 40 characters.');
    L.push('- text: 220 to 260 words (count them), in 3 to 5 paragraphs. Plain prose only: no headings, no chapter label, no asterisks, no bullet points.');
    L.push('- Third person, past tense, close on ' + p.sleuth.name + '. Warm, gently funny, with vivid small-town detail and some dialogue. Each chapter ends with a small hook.');
    L.push('- Never reveal or hint too strongly who the killer is before the epilogue. ' + (b.to === d.N ? 'Chapter ' + d.N + ' must end just before the sleuth says the name, so the reader turns to the final puzzle.' : ''));
    L.push(CONTENT_RULES);
    L.push('- words: exactly ' + d.wordsPerPuzzle + ' words taken from that chapter\'s text, spelled exactly as in the text. Each has 4 to ' + d.maxWordLen + ' letters. ' +
      'Prefer vivid nouns and names. No duplicates, no palindromes, and no word contained inside another word of the list, forwards or backwards (not both TEA and TEACUP).');
    if (isLast) {
      L.push('');
      L.push('EPILOGUE');
      L.push('- epilogue: a title of at most 40 characters and a text of 200 to 250 words in 3 or 4 paragraphs.');
      L.push('- The sleuth reveals that ' + p.killer + ' is the killer, explains the motive and method, shows how the hidden clues (' +
        d.clueList.map(function (c) { return c.display.toLowerCase(); }).join(', ') + ') fit together, and ties up the loose ends warmly. The arrest happens gently, with no violence.');
    }
    L.push('');
    L.push('ANSWER');
    L.push(ANSWER_RULES);
    L.push('Example of the exact structure (your answer has ' + (b.to - b.from + 1) + ' chapters, ' + b.from + ' to ' + b.to + (isLast ? ', and the epilogue' : '') + '):');
    var ex = { chapters: [{ n: b.from, title: 'Chapter Title', text: 'First paragraph...\n\nSecond paragraph...\n\nThird paragraph...', words: ['WORD', 'WORD', '...'] }] };
    if (isLast) ex.epilogue = { title: 'Epilogue Title', text: 'First paragraph...\n\nSecond paragraph...' };
    L.push(JSON.stringify(ex, null, 2));
    return L.join('\n');
  }

  // ---------- fix prompts ----------
  function planFixPrompt(project, d, issues, plan) {
    var errs = issues.filter(function (i) { return i.level === 'error'; });
    var fields = {};
    errs.forEach(function (i) { fields[i.fix || 'all'] = true; });
    var L = [];
    L.push('You are helping plan a clean cozy mystery word search book with ' + d.N + ' one-page chapters. The plan below has problems that must be fixed:');
    errs.forEach(function (i) { L.push('- ' + i.text); });
    L.push('');
    L.push('CURRENT PLAN');
    var compact = {
      setting: plan.setting, sleuth: plan.sleuth, victim: plan.victim, suspects: plan.suspects, killer: plan.killer, solution: plan.solution,
      clues: plan.clues.map(function (c) { return { chapter: c.chapter, word: c.display || c.word }; })
    };
    if (fields.outline || fields.clues) compact.outline = plan.outline;
    L.push(JSON.stringify(compact, null, 1));
    L.push('');
    L.push('RULES');
    L.push('- exactly 5 suspects; the killer is one of them, written exactly as in suspects, and the killer\'s full name has 6 to 16 letters not counting spaces;');
    L.push('- exactly ' + d.C + ' clues, one each for chapters ' + joinNums(d.clueChapters) + '; each clue is one word of 4 to 9 letters, letters only, all different, none contained inside another forwards or backwards, each a piece of evidence that points to the killer;');
    L.push('- the outline has exactly ' + d.N + ' items, n from 1 to ' + d.N + ', each with a title of at most 40 characters and a one-sentence beat.');
    L.push(CONTENT_RULES);
    L.push('');
    var want = [];
    if (fields.titles) want.push('"titles"');
    if (fields.setting) want.push('"setting"');
    if (fields.sleuth) want.push('"sleuth"');
    if (fields.victim) want.push('"victim"');
    if (fields.suspects || fields.killer) want.push('"suspects"', '"killer"', '"solution"');
    if (fields.outline) want.push('"outline" (all ' + d.N + ' items)');
    if (fields.clues) want.push('"clues" (all ' + d.C + ' items)');
    if (fields.all || !want.length) want.push('every field');
    L.push('ANSWER');
    L.push(ANSWER_RULES);
    L.push('Return only the corrected parts: ' + want.join(', ') + '. Keep everything else the same. Example: {"clues": [{"chapter": ' + (d.clueChapters[0] || 2) + ', "word": "LEDGER"}]}');
    return L.join('\n');
  }

  function batchFixPrompt(project, d, bi, issues) {
    var b = d.batches[bi];
    var p = project.plan;
    var byN = {};
    var general = [];
    issues.forEach(function (i) {
      if (i.level !== 'error' && !i.fixable) return;
      if (i.n) (byN[i.n] || (byN[i.n] = [])).push(i.text);
      else general.push(i);
    });
    var wantsEpilogue = general.some(function (i) { return i.fix === 'epilogue'; });
    var wholeBatch = general.some(function (i) { return i.fix === 'batch'; });
    var nums = Object.keys(byN).map(Number).sort(function (a, c) { return a - c; });
    // missing chapters
    general.forEach(function (i) { if (i.missing) i.missing.forEach(function (n) { if (nums.indexOf(n) === -1) { nums.push(n); byN[n] = ['Chapter ' + n + ' is missing.']; } }); });
    nums.sort(function (a, c) { return a - c; });
    if (wholeBatch) return batchPrompt(project, d, bi);
    var L = [];
    L.push('You are a bestselling author of clean cozy mysteries, helping finish a cozy mystery word search book of ' + d.N + ' one-page chapters. Some chapters need fixing:');
    nums.forEach(function (n) { byN[n].forEach(function (t) { L.push('- ' + t); }); });
    if (wantsEpilogue) L.push('- The epilogue is missing or empty.');
    L.push('');
    L.push('STORY BIBLE');
    L.push(bibleText(project, d));
    L.push('');
    nums.forEach(function (n) {
      var o = p.outline.find(function (x) { return x.n === n; });
      var ch = project.chapters[n];
      var c = d.clueByChapter[n];
      L.push('CHAPTER ' + n + (o ? ', "' + o.title + '": ' + o.beat : ''));
      if (c) L.push('Hidden clue for this chapter: mention "' + c.display.toLowerCase() + '" naturally and include ' + c.display + ' in its words.');
      if (ch && ch.paragraphs && ch.paragraphs.length) {
        L.push('Current text (keep what works, fix only the problem):');
        L.push(ch.paragraphs.join('\n\n'));
        if (ch.words && ch.words.length) L.push('Current words: ' + ch.words.join(', '));
      }
      L.push('');
    });
    if (wantsEpilogue) {
      L.push('EPILOGUE: a title of at most 40 characters and 200 to 250 words revealing that ' + p.killer + ' is the killer, explaining why and how, and tying up loose ends warmly.');
      L.push('');
    }
    L.push('RULES');
    L.push('- title at most 40 characters; text 220 to 260 words in 3 to 5 paragraphs, plain prose; third person past tense, close on ' + p.sleuth.name + '.');
    L.push('- words: exactly ' + d.wordsPerPuzzle + ' words from the chapter text, spelled as in the text, 4 to ' + d.maxWordLen + ' letters each, no duplicates, no palindromes, no word inside another forwards or backwards.');
    L.push('- Do not reveal the killer before the epilogue.');
    L.push(CONTENT_RULES);
    L.push('');
    L.push('ANSWER');
    L.push(ANSWER_RULES);
    L.push('Return only the fixed ' + (nums.length ? 'chapter' + (nums.length > 1 ? 's' : '') + ' (' + nums.join(', ') + ')' : '') + (wantsEpilogue ? (nums.length ? ' and ' : '') + 'the epilogue' : '') + ', each complete, in this structure:');
    var ex = {};
    if (nums.length) ex.chapters = [{ n: nums[0], title: 'Chapter Title', text: 'First paragraph...\n\nSecond paragraph...', words: ['WORD', '...'] }];
    if (wantsEpilogue) ex.epilogue = { title: 'Epilogue Title', text: '...' };
    L.push(JSON.stringify(ex));
    return L.join('\n');
  }

  // A fix prompt for one chapter, used by the review step (e.g. a chapter too long for its page).
  function chapterFixPrompt(project, d, n, problemText) {
    var bi = d.batches.findIndex(function (b) { return n >= b.from && n <= b.to; });
    return batchFixPrompt(project, d, bi, [{ level: 'error', n: n, text: problemText }]);
  }

  // ---------- cover art ----------
  function coverPrompt(project) {
    var p = project.plan || {};
    var theme = Cozy.themes.resolve(project.setup.theme, project.seed);
    return 'Create front cover artwork for a cozy mystery puzzle book (portrait, 6 x 9 inch, 1800 x 2700 pixels or larger). ' +
      'Theme: ' + theme + '. Setting: ' + (p.setting || 'a charming small town') + ' ' +
      'Style: warm, inviting hand-painted illustration, soft autumn light, a storefront or street scene with small mystery props ' +
      '(a magnifying glass, a teacup, a scattered note) and perhaps a cat; no people\'s faces up close. ' +
      'Leave calm empty space in the top third for the title and at the bottom for the author name. ' +
      'Do NOT add any text, letters or logos. No gore, no weapons, nothing frightening.';
  }

  Cozy.prompts = {
    planPrompt: planPrompt, batchPrompt: batchPrompt, planFixPrompt: planFixPrompt,
    batchFixPrompt: batchFixPrompt, chapterFixPrompt: chapterFixPrompt, coverPrompt: coverPrompt
  };
})(typeof window !== 'undefined' ? window : globalThis);
