/*
 * The prompts the user copies into ChatGPT (or any AI chat). Chapters are grouped so one reply
 * holds up to 40 questions, which chat models write in one go. A prompt only asks for the
 * questions a chapter is still missing and lists the ones it already has, so a second copy of
 * the same prompt tops a chapter up instead of starting over.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan;

  var PER_PROMPT = 40;

  function have(project, id) { return (project.questions[id] || []).length; }
  function missing(project, ch) { return Math.max(0, project.plan.perChapter - have(project, ch.id)); }

  // [{ kind: 'questions', chapters: [ch...] } ..., { kind: 'extras' }]
  function list(project) {
    var chs = P.chapters(project), per = project.plan.perChapter;
    var size = Math.max(1, Math.floor(PER_PROMPT / per));
    var out = [];
    for (var i = 0; i < chs.length; i += size) out.push({ kind: 'questions', chapters: chs.slice(i, i + size) });
    out.push({ kind: 'extras' });
    out.forEach(function (p, i) { p.no = i + 1; p.done = isDone(project, p); });
    return out;
  }

  function extrasWanted(project) {
    var e = project.extras, w = ['welcome', 'blurb'];
    if (e.born) w.push('born');
    if (e.memories) w.push('memories');
    return w;
  }

  function isDone(project, p) {
    if (p.kind === 'questions') return p.chapters.every(function (ch) { return missing(project, ch) === 0; });
    var ai = project.ai;
    return extrasWanted(project).every(function (k) { return k === 'blurb' ? !!ai.blurb.trim() : ai[k].length > 0; });
  }

  // The first prompt that still needs a reply (or the last one when everything is done).
  function next(project) {
    var l = list(project);
    for (var i = 0; i < l.length; i++) if (!l[i].done) return i;
    return l.length - 1;
  }

  function who(project) {
    var r = P.reader(project.book), c = P.country(project.book.country);
    return 'The reader turns ' + r.age + ' in ' + r.year + ' (born in ' + r.born + ') and grew up in ' + c.grew + '. ' +
      'The book is a birthday gift: family and friends will read the questions aloud at the party, and the birthday star answers.';
  }

  function questionPrompt(project, p) {
    var r = P.reader(project.book), c = P.country(project.book.country);
    var todo = p.chapters.filter(function (ch) { return missing(project, ch) > 0; });
    if (!todo.length) todo = p.chapters;
    var L = [];
    L.push('You are writing a ' + r.ord + ' birthday trivia book. ' + who(project));
    L.push('');
    L.push('Write multiple-choice trivia questions for ' + (todo.length > 1 ? 'these chapters' : 'this chapter') + ':');
    todo.forEach(function (ch) {
      var n = missing(project, ch) || project.plan.perChapter;
      L.push('- CHAPTER: ' + ch.title + ' — exactly ' + n + ' questions about ' + ch.guide + '.');
    });
    L.push('');
    L.push('Rules:');
    if (project.plan.style === 'decade') L.push('- Every question must be about the years named for its chapter.');
    else L.push('- Spread the questions over ' + r.goldFrom + ' to ' + r.year + ', with most of them from ' + r.goldFrom + ' to ' + r.goldTo + ' (the reader’s childhood and young adult years).');
    L.push('- Each question has exactly 4 answer choices (A, B, C, D) and only one is correct. The wrong choices are believable but clearly wrong.');
    L.push('- Use only well-known facts that are easy to check. No trick questions, no "all of the above", no facts that sources disagree on.');
    L.push('- Mix the difficulty: about a third easy, half medium, the rest harder.');
    L.push('- Keep each question under 30 words and each answer choice under 8 words.');
    L.push('- Warm, cheerful, nostalgic tone. History is welcome, but no grim details about wars, disasters or crimes.');
    L.push('- After each question, add a FACT: one short, surprising fun fact about the answer (under 25 words).');
    L.push('- Use ' + c.spelling + ' spelling. Prices in ' + c.money + '.');
    L.push('- Do not number the questions.');
    var old = [];
    todo.forEach(function (ch) { (project.questions[ch.id] || []).forEach(function (q) { old.push(q.q); }); });
    if (old.length) {
      L.push('- Do not repeat or rephrase any of these questions, which are already in the book:');
      old.forEach(function (q) { L.push('  * ' + q); });
    }
    L.push('');
    L.push('Reply with one code block in exactly this format, a blank line between questions:');
    L.push('');
    L.push('CHAPTER: ' + todo[0].title);
    L.push('Q: The question?');
    L.push('A) first choice');
    L.push('B) second choice');
    L.push('C) third choice');
    L.push('D) fourth choice');
    L.push('ANSWER: C');
    L.push('FACT: One short fun fact about the answer.');
    if (todo.length > 1) {
      L.push('');
      L.push('Start each chapter with its own CHAPTER: line, using the chapter names above.');
    }
    return L.join('\n');
  }

  function extrasPrompt(project) {
    var r = P.reader(project.book), w = extrasWanted(project);
    var L = [];
    L.push('You are writing parts of a ' + r.ord + ' birthday trivia book. ' + who(project));
    L.push('');
    L.push('Write these parts:');
    L.push('- WELCOME: a warm welcome letter to the birthday star, 3 short paragraphs (about 140 words in all). Say happy ' + r.ord + ' birthday, celebrate the years since ' + r.born + ', and invite family and friends to play along.');
    if (w.indexOf('born') !== -1) L.push('- YEAR FACTS: 16 fun facts about ' + r.born + ', the year the reader was born: who led the country, prices of everyday things, popular songs, films, inventions, sports and news. One sentence each, with real numbers where possible.');
    if (w.indexOf('memories') !== -1) L.push('- MEMORY PROMPTS: 12 questions that invite the birthday star to tell a story from their life (for example their first job, their first car, a favorite song to dance to). One sentence each.');
    L.push('- BACK COVER: a back-cover description of the book, about 70 words, cheerful and inviting. Do not invent a number of questions.');
    L.push('');
    L.push('Facts must be accurate and easy to check. Use ' + P.country(project.book.country).spelling + ' spelling.');
    L.push('');
    L.push('Reply with one code block in exactly this format:');
    L.push('');
    L.push('WELCOME:');
    L.push('First paragraph.');
    L.push('Second paragraph.');
    L.push('Third paragraph.');
    if (w.indexOf('born') !== -1) { L.push(''); L.push('YEAR FACTS:'); L.push('- First fact.'); L.push('- Second fact.'); }
    if (w.indexOf('memories') !== -1) { L.push(''); L.push('MEMORY PROMPTS:'); L.push('- First question?'); L.push('- Second question?'); }
    L.push('');
    L.push('BACK COVER:');
    L.push('The description.');
    return L.join('\n');
  }

  function text(project, p) { return p.kind === 'extras' ? extrasPrompt(project) : questionPrompt(project, p); }

  function label(p) {
    if (p.kind === 'extras') return 'Welcome letter, year facts, memory prompts and back cover';
    return p.chapters.map(function (c) { return c.title; }).join(', ');
  }

  CX.prompts = { PER_PROMPT: PER_PROMPT, list: list, next: next, text: text, label: label, missing: missing, isDone: isDone, extrasWanted: extrasWanted };
})(typeof window !== 'undefined' ? window : globalThis);
