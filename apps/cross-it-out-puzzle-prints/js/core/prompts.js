/*
 * Prompts the user copies into ChatGPT, Claude or Gemini, and readers for the replies.
 *
 * The AI never builds puzzles. It supplies what it is good at: topics, little mysteries, lists
 * of everyday things and plain facts about them, with the exact options each fact describes.
 * The app writes every letter clue, picks the answer and proves the puzzle has one answer.
 * A second prompt asks an AI to fact-check the knowledge clues the book actually uses.
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

  // ---------- fact-check ----------
  var AUDIT_CHUNK = 30;

  // The puzzles that use knowledge clues, in book order.
  function auditCases(built) {
    return built.all.filter(function (pz) { return pz.clues.some(function (c) { return c.type === 'fact' || c.type === 'notFact'; }); });
  }

  /*
   * One fact-check prompt for the part'th chunk of cases (0-based). Returns { text, from, to, parts }.
   */
  function auditPrompt(project, built, part) {
    var list = auditCases(built);
    var parts = Math.max(1, Math.ceil(list.length / AUDIT_CHUNK));
    part = Math.max(0, Math.min(parts - 1, part || 0));
    var chunk = list.slice(part * AUDIT_CHUNK, (part + 1) * AUDIT_CHUNK);
    var L = [];
    L.push('Please fact-check the everyday-knowledge clues in my puzzle book “Cross It Out If…” (' + (project.setup.spelling === 'uk' ? 'British' : 'American') + ' English, readers: ' + (AUDIENCE[project.setup.audience] || AUDIENCE.adults) + ').');
    L.push('In each puzzle the reader crosses out every option a clue describes; the one option left is the answer. Below, for every knowledge clue, you see which options I expect a careful reader to cross out with it and which they keep.');
    L.push('');
    L.push('Report a problem only when:');
    L.push('- "answer": the ANSWER could reasonably be described by the clue (a reader might cross it out), or');
    L.push('- "crossed": an option in CROSSES OUT is not clearly described by the clue (a reader might keep it).');
    L.push('Be strict but fair: report anything a sensible reader could dispute. Ignore spelling and grammar.');
    L.push('');
    chunk.forEach(function (pz) {
      L.push('CASE ' + pz.no + ' (' + pz.pack.topic + '). ANSWER: ' + pz.options[pz.answer]);
      pz.clues.forEach(function (c) {
        if (c.type !== 'fact' && c.type !== 'notFact') return;
        var crossed = [], kept = [];
        pz.options.forEach(function (o, i) { if (c.yes & (1 << i)) crossed.push(o); else if (!(c.maybe & (1 << i))) kept.push(o); });
        L.push('  Clue: "' + c.text + '"');
        L.push('    CROSSES OUT: ' + crossed.join(', '));
        L.push('    KEEPS: ' + kept.join(', '));
      });
    });
    L.push('');
    L.push('Reply with ONE JSON object only, inside a single ```json code block:');
    L.push('{ "issues": [ { "case": 12, "clue": "It grows underground", "option": "Peanut", "problem": "crossed", "why": "a few words" } ] }');
    L.push('If everything is correct, reply { "issues": [] }.');
    return { text: L.join('\n'), from: chunk.length ? chunk[0].no : 0, to: chunk.length ? chunk[chunk.length - 1].no : 0, parts: parts, count: list.length };
  }

  // Reads a fact-check reply. Returns { ok, issues:[{ case, clue, option, problem }] }.
  function readAudit(text) {
    var objs = CX.reader.allObjects(text);
    var issues = null;
    objs.forEach(function (o) {
      if (issues) return;
      if (Array.isArray(o.issues)) issues = o.issues;
      else if (o.case !== undefined && o.option) issues = [o];
    });
    if (!issues) return { ok: false, issues: [] };
    return {
      ok: true,
      issues: issues.filter(function (i) { return i && typeof i === 'object'; }).map(function (i) {
        return { case: parseInt(String(i.case).replace(/[^0-9]/g, ''), 10), clue: String(i.clue || ''), option: String(i.option || ''), problem: String(i.problem || '').toLowerCase() };
      }).filter(function (i) { return i.case > 0 && i.option; })
    };
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

  CX.prompts = { THEMES: THEMES, AUDIENCE: AUDIENCE, theme: theme, packPrompt: packPrompt, fixPrompt: fixPrompt, auditPrompt: auditPrompt, auditCases: auditCases, readAudit: readAudit, listingPrompt: listingPrompt, AUDIT_CHUNK: AUDIT_CHUNK };
})(typeof window !== 'undefined' ? window : globalThis);
