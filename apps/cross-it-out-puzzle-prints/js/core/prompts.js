/*
 * Prompts the user copies into ChatGPT, Claude or Gemini, and readers for the replies.
 *
 * The AI never builds puzzles. It supplies what it is good at: topics, little mysteries, lists
 * of everyday things and plain facts about them, with the exact options each fact describes.
 * The app writes every letter clue, picks the answer and proves the puzzle has one answer.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var U = CX.util;

  var THEMES = [
    { id: 'everyday', label: 'Everyday mysteries', text: 'everyday life: home, kitchen, town, shops, school, hobbies, pets, garden, holidays' },
    { id: 'food', label: 'Food & kitchen', text: 'food, cooking, baking, drinks, the kitchen, markets and picnics' },
    { id: 'animals', label: 'Animals & nature', text: 'animals, pets, birds, insects, sea life, plants, trees and the countryside' },
    { id: 'places', label: 'Travel & places', text: 'places in town, buildings, travel, transport, holidays and landmarks (no real place names)' },
    { id: 'home', label: 'Home & hobbies', text: 'rooms, furniture, tools, crafts, toys, games, music, sports and hobbies' },
    { id: 'christmas', label: 'Christmas', text: 'Christmas and winter: decorations, gifts, festive food, winter clothes, snow days, carols and family traditions' },
    { id: 'halloween', label: 'Halloween', text: 'Halloween and autumn: costumes, pumpkins, spooky (but friendly) creatures, sweets, harvest and bonfire nights' },
    { id: 'seaside', label: 'Seaside & summer', text: 'the seaside and summer: beach things, sea creatures, boats, ice creams, camping and holidays' },
    { id: 'custom', label: 'My own theme', text: '' }
  ];

  var AUDIENCE = {
    adults: 'adults who enjoy relaxing puzzles',
    seniors: 'older adults and seniors (a large-print book): familiar, timeless words, nothing too modern',
    kids: 'children aged 8 to 12: simple, familiar words and facts a child knows'
  };

  function theme(id) { return THEMES.filter(function (t) { return t.id === id; })[0] || THEMES[0]; }

  var EXAMPLE = {
    packs: [{
      topic: 'Things in a sewing box',
      cases: [
        { title: 'The Missing Thimble', story: 'Grandma finished the quilt, but one thing never went back in her sewing box. What was it?' },
        { title: 'The Tangled Drawer', story: 'Somebody borrowed an item from the sewing box and returned it in a knot. Which one?' }
      ],
      options: ['Needle', 'Thimble', 'Scissors', 'Button', 'Zipper', 'Tape Measure', 'Pin Cushion', 'Ribbon', 'Safety Pin', 'Thread', 'Chalk', 'Velcro', '... 30 to 36 options in a real pack ...'],
      facts: [
        { clue: 'It is sharp', not: 'It is not sharp', yes: ['Needle', 'Scissors', 'Safety Pin'], maybe: [] },
        { clue: 'It is used to fasten clothes', not: 'It is not used to fasten clothes', yes: ['Button', 'Zipper', 'Safety Pin', 'Velcro'], maybe: ['Ribbon'] },
        { clue: 'It is long and thin', not: 'It is not long and thin', yes: ['Needle', 'Ribbon', 'Thread', 'Tape Measure'], maybe: ['Chalk', 'Zipper'] },
        { clue: '... 8 to 10 facts in a real pack ...', not: '...', yes: ['...'], maybe: [] }
      ]
    }]
  };

  /*
   * The pack prompt. opts: { theme, custom, count, avoid:[topic], variation }
   */
  function packPrompt(project, opts) {
    var s = project.setup;
    var th = theme(opts.theme);
    var themeText = th.id === 'custom' ? (String(opts.custom || '').trim() || 'anything family-friendly') : th.text;
    var spell = s.spelling === 'uk' ? 'British' : 'American';
    var count = opts.count || 10;
    var L = [];
    L.push('You are helping me write a printed puzzle book called “Cross It Out If…”. Please write ' + count + ' new puzzle packs.');
    L.push('');
    L.push('HOW THE PUZZLES WORK');
    L.push('Each puzzle shows a little mystery, a line-up of possible answers and a few “Cross it out if…” clues. The reader crosses out every option a clue describes; the one option left standing is the answer.');
    L.push('My software builds the puzzles. It writes all the letter and spelling clues itself (“It contains the letter A”, “It has more than five letters”), picks the answer and proves every puzzle has exactly one answer. From you it needs the raw material only: topics, mini mysteries, lists of options and everyday facts with the exact options each fact describes.');
    L.push('');
    L.push('THE BOOK');
    L.push('- Theme: ' + themeText + '.');
    L.push('- Readers: ' + (AUDIENCE[s.audience] || AUDIENCE.adults) + '.');
    L.push('- Spelling: ' + spell + ' English.');
    L.push('- Family-friendly: no violence, no alcohol, no brand names, no real people, no politics or religion.');
    if (opts.avoid && opts.avoid.length) L.push('- I already have these topics, so choose different ones: ' + opts.avoid.slice(0, 80).join('; ') + '.');
    L.push('- Variation code ' + (opts.variation || U.randomSeed().slice(0, 6)).toUpperCase() + ' (ignore it; it only makes this request unique).');
    L.push('');
    L.push('EACH PACK HAS');
    L.push('1. "topic": the kind of thing the options are, 2 to 6 words (e.g. "Things in a sewing box", "Jobs in a hospital").');
    L.push('2. "cases": 2 mini mysteries set around this topic. Each has a "title" (2 to 5 words, e.g. "The Missing Thimble") and a "story": one or two short sentences, at most 25 words, ending with a question such as "Which one was it?". The story only sets the scene: it never hints at the answer and never names any of the options. Light and cosy in tone: lost things, mix-ups, surprises, small mysteries.');
    L.push('3. "options": 30 to 36 different things that fit the topic.');
    L.push('   - Common, concrete, everyday nouns the readers know. Singular. 1 to 3 words each, at most 18 letters.');
    L.push('   - Letters, spaces, hyphens and apostrophes only: no numbers, no brand or product names, no names of real people or places.');
    L.push('   - No near-duplicates (Cup / Teacup) and no plural pairs.');
    L.push('   - Mix the lengths: some short (3 to 5 letters), many medium, some long (9+ letters) and a few of two words.');
    L.push('4. "facts": 8 to 10 everyday-knowledge facts about the options, each written as the end of the sentence “Cross it out if…”, starting with "It" (e.g. "It grows underground", "It is worn on the feet", "It is usually yellow", "It is found in a bathroom").');
    L.push('   - Plain common knowledge that every reader agrees on. No opinions ("It is delicious"), no trivia, no jokes or puns.');
    L.push('   - Never about spelling, letters, sounds, length or words: my software writes those clues.');
    L.push('   - Each fact should describe roughly a quarter to a half of the options, and the facts should be different from each other: what it is, what it is made of, where it is found, what it is used for, colour, size, shape, season, alive or not, and so on.');
    L.push('   - "yes": EVERY option the fact clearly describes, spelled exactly as in "options". Go through the options one by one; a missed option makes a puzzle wrong.');
    L.push('   - "maybe": every option where people could reasonably disagree. When in doubt, put it here; my software then never relies on it.');
    L.push('   - "not": the same fact turned negative (e.g. "It does not grow underground"), used for harder puzzles.');
    L.push('');
    L.push('THE REPLY');
    L.push('Reply with ONE JSON object only, inside a single ```json code block, nothing before or after it. Straight double quotes, no comments, no trailing commas.');
    L.push('This example shows the format only; do not reuse its topic, and remember that a real pack has 30 to 36 options and 8 to 10 facts:');
    L.push('```json');
    L.push(JSON.stringify(EXAMPLE, null, 2));
    L.push('```');
    L.push('If the reply would get too long, finish the pack you are writing, close the JSON properly and stop. I will ask for more.');
    return L.join('\n');
  }

  /*
   * The prompts the book takes: the replies already added (one per batch of packs) and the
   * prompts still needed to fill the missing cases at `count` packs a reply (two cases a pack).
   * Returns { done:[{ no, batch, packs:[pack], cases }], left, total, current (0 when the book
   * is full), nextBatch, missing }.
   */
  function plan(project, built, count) {
    var groups = {};
    project.packs.forEach(function (pk) {
      var b = pk.batch || 0;
      (groups[b] = groups[b] || []).push(pk);
    });
    var batches = Object.keys(groups).map(Number).sort(function (a, b) { return a - b; });
    var done = batches.map(function (b, i) {
      var cases = groups[b].reduce(function (a, pk) { return a + (pk.off ? 0 : pk.cases.length); }, 0);
      return { no: i + 1, batch: b, packs: groups[b], cases: cases };
    });
    var missing = built ? Object.keys(built.short).reduce(function (a, k) { return a + built.short[k]; }, 0) : 0;
    var left = Math.ceil(Math.ceil(missing / 2) / Math.max(1, count || 10));
    return {
      done: done, left: left, total: done.length + left,
      current: left ? done.length + 1 : 0,
      nextBatch: batches.length ? batches[batches.length - 1] + 1 : 1,
      missing: missing
    };
  }

  /*
   * Asks again for the packs that could not be used, and for missing facts where the AI was short.
   */
  function fixPrompt(result) {
    var L = [];
    L.push('Thank you. Some packs in your last reply could not be used:');
    result.errors.forEach(function (e) { L.push('- ' + e); });
    (result.notes || []).slice(0, 12).forEach(function (e) { L.push('- ' + e); });
    if (result.cutOff) L.push('- The reply was cut off before the end.');
    L.push('');
    L.push('Please write those packs again in full (or new packs in their place), following every rule from my first message: 30 to 36 options, 2 cases and 8 to 10 facts with complete "yes" and "maybe" lists.');
    L.push('Reply with ONE JSON object only, in the same format, inside a single ```json code block: { "packs": [ ... ] }');
    return L.join('\n');
  }

  // ---------- listing ----------
  function listingPrompt(project, info) {
    var s = project.setup, L = [];
    L.push('Write my Amazon KDP listing for a paperback puzzle book. Facts about the book:');
    L.push('- Title: ' + (s.title || 'Cross It Out If…') + (s.subtitle ? ' / Subtitle: ' + s.subtitle : ''));
    L.push('- ' + info.total + ' “Cross it out if…” elimination puzzles: each one is a mini mystery with a line-up of options; the reader crosses out every option the clues describe until one answer is left.');
    L.push('- Levels: ' + info.levels.join('; ') + '.');
    L.push('- Clues mix everyday knowledge and letter clues (letters, word length, vowels). Every puzzle was checked to have exactly one answer, and every clue is needed.');
    L.push('- Also inside: how to play with a worked example, a clue guide, ' + (s.pages.solutions === 'explained' ? 'solutions with every crossing-out explained' : 'solutions at the back') + '.');
    L.push('- ' + info.trim + ' paperback, ' + info.pages + ' pages' + (s.largePrint ? ', large print' : '') + '. Readers: ' + (AUDIENCE[s.audience] || AUDIENCE.adults) + '.');
    if (info.themes) L.push('- Topics include: ' + info.themes + '.');
    L.push('');
    L.push('Write, in ' + (s.spelling === 'uk' ? 'British' : 'American') + ' English:');
    L.push('1. Three subtitle ideas (max 120 characters, no claims like "best-selling", no other authors or brands).');
    L.push('2. A book description of 150 to 250 words: a hook line, what a puzzle looks like, a bullet list of what is inside, who it is for. Use only <b>, <br>, <ul>, <li> HTML tags.');
    L.push('3. Seven search keyword phrases (each under 50 characters, no quotes, no brand or author names, no words already in the title).');
    L.push('Do not promise anything the facts above do not say.');
    return L.join('\n');
  }

  CX.prompts = { THEMES: THEMES, AUDIENCE: AUDIENCE, theme: theme, packPrompt: packPrompt, plan: plan, fixPrompt: fixPrompt, listingPrompt: listingPrompt };
})(typeof window !== 'undefined' ? window : globalThis);
