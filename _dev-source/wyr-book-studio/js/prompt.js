/* prompt.js — builds the prompt the user pastes into ChatGPT / Claude /
   Gemini / Grok, and the shorter "rewrite these ones" prompt. The prompt is
   written in English (models follow it best) while the book itself is
   written in whatever language the user picked. */
(function () {
  var W = window.WYR;
  var C = W.config;

  var P = (W.prompt = {});

  P.totalBatches = function (count) {
    return Math.max(1, Math.ceil(count / C.BATCH_SIZE));
  };

  /* Spreads the requested question count over the categories for the theme,
     handing the remainder to the first categories. */
  P.categoryPlan = function (setup) {
    var names = C.AUDIENCE_PLANS[setup.audience];
    if (!names) names = C.CATEGORY_PLANS[setup.theme];
    if (!names && setup.theme === 'custom') names = null;
    if (!names) names = C.CATEGORY_PLANS.general;

    if (!names) return [];
    var count = setup.count;
    var per = Math.floor(count / names.length);
    var extra = count - per * names.length;
    var plan = [];
    for (var i = 0; i < names.length; i++) {
      plan.push({ name: names[i], n: per + (i < extra ? 1 : 0) });
    }
    return plan.filter(function (p) { return p.n > 0; });
  };

  P.categoryNames = function (setup) {
    return P.categoryPlan(setup).map(function (p) { return p.name; });
  };

  function themeLabel(setup) {
    if (setup.theme === 'custom') {
      return setup.customTheme ? setup.customTheme : 'General mix';
    }
    return C.find(C.THEMES, setup.theme).en;
  }

  /* --- the main prompt -------------------------------------------------- */
  P.build = function (setup, batchNo) {
    var audience = C.find(C.AUDIENCES, setup.audience);
    var style = C.find(C.STYLES, setup.style);
    var lang = C.find(C.LANGUAGES, setup.language);
    var total = P.totalBatches(setup.count);
    var batch = Math.min(Math.max(1, batchNo || 1), total);
    var size = C.BATCH_SIZE;
    var startId = (batch - 1) * size + 1;
    var endId = Math.min(batch * size, setup.count);

    var plan = P.categoryPlan(setup);
    var planLines;
    if (plan.length) {
      planLines = plan.map(function (p) { return '- ' + p.name + ': ' + p.n; }).join('\n');
    } else {
      planLines = '- (Invent 6 to 8 categories that fit the theme, list them in batch 1 and reuse exactly those names for the whole book.)';
    }

    var t = [];
    t.push('You are a best-selling author of "Would You Rather" game books on Amazon, known for questions that make families laugh out loud and argue happily for minutes over every single choice.');
    t.push('');
    t.push('## BOOK');
    t.push('- Audience: ' + audience.en + ' (' + audience.rules + ')');
    t.push('- Theme / edition: ' + themeLabel(setup));
    t.push('- Style mix: ' + style.mix);
    t.push('- Book language: ' + lang.en + ' (write ALL question text and answer fields in this language; natural, native phrasing; ' + lang.spelling + ')');
    t.push('- Total questions: ' + setup.count + ', delivered in ' + total + ' batches of up to ' + size + '.');
    t.push('- Category plan for the WHOLE book (keep these exact category names, in English, even when the questions are in another language):');
    t.push(planLines);
    t.push('');
    t.push('## WHAT MAKES A GREAT QUESTION (follow strictly)');
    t.push('1. BALANCED: both options must be equally tempting OR equally awful. Aim for a 50/50 split of opinions. If most people would instantly pick one side, throw it away and write a better one.');
    t.push('2. CLEAR CONTRAST: the two options differ along one obvious axis (big vs small, past vs future, famous vs secret, power vs price, now vs later, hot vs cold, alone vs crowd).');
    t.push('3. THE CATCH: the best questions give each option an upside AND a funny or painful downside ("fly, but only 2 feet off the ground").');
    t.push('4. VIVID & SPECIFIC: concrete images, numbers, sounds, smells. Something you can picture instantly.');
    t.push('5. PARALLEL: both options have similar length and grammar, each starts with a verb ("have", "be", "eat"), each is ' + audience.words + ' words.');
    t.push('6. VARIETY: never reuse the same premise, the same superpower, the same animal or the same punchline twice in the whole book. Mix silly, gross, imaginative and thought-provoking questions.');
    t.push('7. READ-ALOUD FUN: it should sound funny when a parent or a child reads it out loud.');
    t.push('8. PERFECT WRITING: zero typos, no missing words, no awkward phrasing.');
    t.push('');
    t.push('## NEVER INCLUDE');
    t.push('- Brand names, real celebrities, real people, copyrighted characters, movies, games or songs.');
    t.push('- Politics, religion, death, serious injury, weapons, drugs, alcohol' + audience.bans + '.');
    t.push('- Body shaming, insults about groups of people, anything scarier than ' + audience.scary + '.');
    t.push('- Dangerous actions a child could copy.');
    t.push('- The words "Would you rather" or a question mark inside the options (the book adds them).');
    t.push('- Emoji or symbols of any kind.');
    t.push('');
    t.push('## ANSWER KEY FIELDS (the "Behind the Choices" section printed at the back)');
    t.push('- "why_hard": why this choice is genuinely tough (max 25 words, fun tone).');
    t.push('- "a_plus": the single best argument for option A (max 15 words).');
    t.push('- "b_plus": the single best argument for option B (max 15 words).');
    t.push('- "bonus": one short follow-up question to keep the conversation going (max 15 words).');
    t.push('');
    t.push('## OUTPUT FORMAT (critical)');
    t.push('- Reply with ONE ```json code block and nothing else: no intro, no notes, no summary.');
    t.push('- Valid JSON: double quotes, no trailing commas, no comments.');
    t.push('- Schema:');
    t.push('{');
    t.push('  "batch": <number>,');
    t.push('  "total_batches": ' + total + ',');
    t.push('  "book": { "title_ideas": [ { "title": "...", "subtitle": "..." } ] },');
    t.push('  "questions": [');
    t.push('    { "id": <number>, "cat": "<category from the plan>", "a": "...", "b": "...", "why_hard": "...", "a_plus": "...", "b_plus": "...", "bonus": "..." }');
    t.push('  ]');
    t.push('}');
    if (batch === 1) {
      t.push('- "book" appears ONLY in batch 1: give 3 Amazon-style title ideas in the book language. Each subtitle mentions the number ' +
        setup.count + ', the audience, and uses like family game night, road trips and parties.');
    } else {
      t.push('- Leave "book" out of this batch.');
    }
    t.push('');
    t.push('## BATCHING');
    t.push('- Now write BATCH ' + batch + ' only: ids ' + startId + ' to ' + endId +
      ', mixing the categories in proportion to the plan (do not group them together).');
    t.push('- Before writing, silently brainstorm about twice as many ideas as you need, then keep only the most balanced and funniest ones.');
    if (total > 1) {
      t.push('- Then STOP. When I reply "next", write the following batch with ids continuing from the last one, still following every rule and never repeating an idea from an earlier batch.');
      t.push('- The final batch must bring the total to exactly ' + setup.count +
        ' questions and complete every category count in the plan.');
    }
    return t.join('\n');
  };

  /* --- the "rewrite these" prompt (step 3) ------------------------------ */
  P.buildReplacement = function (setup, questions) {
    var audience = C.find(C.AUDIENCES, setup.audience);
    var lang = C.find(C.LANGUAGES, setup.language);
    var slim = questions.map(function (q) {
      return { id: q.id, cat: q.cat, a: q.a, b: q.b };
    });

    var t = [];
    t.push('Rewrite ONLY these "Would You Rather" questions for the same book.');
    t.push('Book: ' + audience.en + ', theme ' + themeLabel(setup) + ', written in ' + lang.en + '.');
    t.push('Keep the same ids and the same categories. Make each one more balanced, funnier and completely different from the old version.');
    t.push('');
    t.push('## RULES');
    t.push('- Both options must be equally tempting or equally awful, so opinions split 50/50.');
    t.push('- Give each option an upside and a funny downside ("fly, but only 2 feet off the ground").');
    t.push('- Both options start with a verb and are ' + audience.words + ' words, similar in length.');
    t.push('- No brand names, real people, copyrighted characters, politics, religion, death, weapons, drugs, alcohol' + audience.bans + '.');
    t.push('- Never write "Would you rather" or a question mark inside an option. No emoji.');
    t.push('- Fill in why_hard (max 25 words), a_plus and b_plus (max 15 words each) and bonus (max 15 words), in ' + lang.en + '.');
    t.push('');
    t.push('## OLD QUESTIONS');
    t.push('```json');
    t.push(JSON.stringify(slim, null, 2));
    t.push('```');
    t.push('');
    t.push('## OUTPUT');
    t.push('Reply with ONE ```json code block and nothing else:');
    t.push('{ "replace": true, "questions": [ { "id": <same id>, "cat": "<same category>", "a": "...", "b": "...", "why_hard": "...", "a_plus": "...", "b_plus": "...", "bonus": "..." } ] }');
    return t.join('\n');
  };
})();
