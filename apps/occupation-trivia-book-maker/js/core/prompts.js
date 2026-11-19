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
  var RANKS = 5;

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

  // What the extras prompt asks for: always the welcome letter and the back cover.
  function extrasWanted(project) {
    var e = project.extras, w = ['welcome', 'blurb'];
    if (e.facts) w.push('facts');
    if (e.stories) w.push('stories');
    if (e.ranks) w.push('ranks');
    return w;
  }

  function hasExtra(project, k) {
    var ai = project.ai;
    if (k === 'blurb') return !!ai.blurb.trim();
    if (k === 'ranks') return ai.ranks.length >= RANKS;
    return ai[k].length > 0;
  }

  function isDone(project, p) {
    if (p.kind === 'questions') return p.chapters.every(function (ch) { return missing(project, ch) === 0; });
    return extrasWanted(project).every(function (k) { return hasExtra(project, k); });
  }

  // The first prompt that still needs a reply (or the last one when everything is done).
  function next(project) {
    var l = list(project);
    for (var i = 0; i < l.length; i++) if (!l[i].done) return i;
    return l.length - 1;
  }

  function about(project) {
    var b = project.book, j = P.job(b), a = P.audience(b.audience), c = P.country(b.country);
    var L = [];
    if (j.general) L.push('The book is about jobs and careers of every kind, from the everyday to the unusual.');
    else L.push('The book is about ' + j.field + ': the job of ' + (/^[aeiou]/i.test(j.name) ? 'an ' : 'a ') + j.name.toLowerCase() + '.' + (j.about ? ' About the job: ' + j.about : ''));
    L.push('The readers are ' + a.who.replace(/\{plural\}/g, j.plural.toLowerCase()).replace(/\{field\}/g, j.field) + '.');
    L.push(c.where ? 'They live in ' + c.where + ': where a fact depends on the country (laws, ranks, licenses, organizations, brands), use ' + c.where + '.'
      : 'Readers live all over the world: prefer facts that are true everywhere, and name the country when a fact belongs to one.');
    L.push('People play it alone, with coworkers on a break, or read the questions aloud at a party.');
    return L.join(' ');
  }

  function questionPrompt(project, p) {
    var b = project.book, j = P.job(b), a = P.audience(b.audience), c = P.country(b.country);
    var todo = p.chapters.filter(function (ch) { return missing(project, ch) > 0; });
    if (!todo.length) todo = p.chapters;
    var L = [];
    L.push('You are writing a trivia book' + (j.general ? ' about jobs and careers' : ' for ' + j.plural.toLowerCase()) + '. ' + about(project));
    L.push('');
    L.push('Write trivia questions for ' + (todo.length > 1 ? 'these chapters' : 'this chapter') + ':');
    todo.forEach(function (ch) {
      var n = missing(project, ch) || project.plan.perChapter;
      L.push('- CHAPTER: ' + ch.title + ' — exactly ' + n + ' questions about ' + ch.guide + '.');
    });
    L.push('');
    L.push('Rules:');
    L.push('- Most questions have exactly 4 answer choices (A, B, C, D) and only one is correct. The wrong choices are believable but clearly wrong.');
    if (project.plan.tf) L.push('- About 1 question in 5 is a true-or-false statement instead: write it as a statement, give exactly 2 choices, A) True and B) False, and mix true and false answers.');
    L.push('- Use only well-established facts that are easy to check. No trick questions, no "all of the above", no opinions, no facts that sources disagree on or that change often.');
    L.push('- Never give medical, legal, financial or safety instructions as advice: ask about facts, history and general knowledge.');
    L.push('- Mix the difficulty: ' + a.mix + '.');
    L.push('- Keep each question under 30 words and each answer choice under 8 words.');
    L.push('- Friendly, upbeat tone that celebrates the job. Humor is welcome but never mean, crude or about real tragedies.');
    L.push('- After each question, add a FACT: one short, surprising fun fact about the answer (under 25 words).');
    L.push('- Use ' + c.spelling + ' spelling. Do not number the questions.');
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
    if (project.plan.tf) {
      L.push('');
      L.push('Q: A true-or-false statement.');
      L.push('A) True');
      L.push('B) False');
      L.push('ANSWER: B');
      L.push('FACT: One short fun fact that explains the answer.');
    }
    if (todo.length > 1) {
      L.push('');
      L.push('Start each chapter with its own CHAPTER: line, using the chapter names above.');
    }
    return L.join('\n');
  }

  function extrasPrompt(project) {
    var b = project.book, j = P.job(b), w = extrasWanted(project);
    var readers = j.general ? 'trivia fans' : j.plural.toLowerCase();
    var L = [];
    L.push('You are writing parts of a trivia book' + (j.general ? ' about jobs and careers' : ' for ' + readers) + '. ' + about(project));
    L.push('');
    L.push('Write these parts:');
    L.push('- WELCOME: a warm welcome letter to the reader, 3 short paragraphs (about 140 words in all). Celebrate ' + (j.general ? 'the world of work' : readers + ' and the work they do') + ', and invite them to play alone, with coworkers or with family.');
    if (w.indexOf('facts') !== -1) L.push('- FUN FACTS: 16 surprising, true fun facts about ' + j.field + '. One sentence each, with real numbers where possible.');
    if (w.indexOf('stories') !== -1) L.push('- STORY PROMPTS: 12 questions that invite the reader to write about their own ' + (j.general ? 'working life' : 'life as ' + (/^[aeiou]/i.test(j.name) ? 'an ' : 'a ') + j.name.toLowerCase()) + ' (for example their first day, a proud moment, the funniest thing that happened at work). One sentence each.');
    if (w.indexOf('ranks') !== -1) L.push('- RANKS: exactly ' + RANKS + ' fun rank titles for the score card, from the lowest score to the highest, in the style of the job (for example from "Rookie" to "Legend"). Each line: the rank title, a dash, and a short, kind comment of under 12 words.');
    L.push('- BACK COVER: a back-cover description of the book, about 70 words, upbeat and inviting. Do not invent a number of questions.');
    L.push('');
    L.push('Facts must be accurate and easy to check. Use ' + P.country(b.country).spelling + ' spelling.');
    L.push('');
    L.push('Reply with one code block in exactly this format:');
    L.push('');
    L.push('WELCOME:');
    L.push('First paragraph.');
    L.push('Second paragraph.');
    L.push('Third paragraph.');
    if (w.indexOf('facts') !== -1) { L.push(''); L.push('FUN FACTS:'); L.push('- First fact.'); L.push('- Second fact.'); }
    if (w.indexOf('stories') !== -1) { L.push(''); L.push('STORY PROMPTS:'); L.push('- First question?'); L.push('- Second question?'); }
    if (w.indexOf('ranks') !== -1) { L.push(''); L.push('RANKS:'); L.push('- Lowest Rank Title - short comment'); L.push('- Next Rank Title - short comment'); }
    L.push('');
    L.push('BACK COVER:');
    L.push('The description.');
    return L.join('\n');
  }

  function text(project, p) { return p.kind === 'extras' ? extrasPrompt(project) : questionPrompt(project, p); }

  function label(p) {
    if (p.kind === 'extras') return 'Welcome letter, fun facts, ranks and back cover';
    return p.chapters.map(function (c) { return c.title; }).join(', ');
  }

  CX.prompts = { PER_PROMPT: PER_PROMPT, RANKS: RANKS, list: list, next: next, text: text, label: label, missing: missing, isDone: isDone, extrasWanted: extrasWanted, hasExtra: hasExtra };
})(typeof window !== 'undefined' ? window : globalThis);
