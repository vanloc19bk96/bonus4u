/*
 * The prompts the user copies into ChatGPT (or any AI chat). Questions are asked one decade at a
 * time, its rounds split into prompts of up to 40 questions, which chat models write in one go.
 * A prompt only asks for what is still missing and lists the questions already in the book, so a
 * second copy of the same prompt tops a round up instead of starting over. Then one prompt writes
 * the decade pages (intro, at a glance, fun facts, memory prompts) and one the welcome letter,
 * ranks and back cover.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan;

  var PER_PROMPT = 40;
  var RANKS = 5;
  // What a decade page needs before it counts as done, and how much of it the book prints.
  var ERA = {
    intro: { min: 1, max: 4, label: 'intro' },
    timeline: { min: 5, max: 10, label: 'at a glance' },
    facts: { min: 3, max: 6, label: 'fun facts' },
    memories: { min: 3, max: 6, label: 'memory prompts' }
  };

  function have(project, id) { return (project.questions[id] || []).length; }
  function missing(project, r) { return Math.max(0, project.plan.perRound - have(project, r.id)); }

  // Splits a decade's rounds into the fewest prompts of up to 40 questions, as even as possible.
  function chunks(list, per) {
    var size = Math.max(1, Math.floor(PER_PROMPT / per)), n = Math.ceil(list.length / size), out = [], at = 0;
    for (var i = 0; i < n; i++) {
      var take = Math.ceil((list.length - at) / (n - i));
      out.push(list.slice(at, at + take));
      at += take;
    }
    return out;
  }

  // The parts of the decade pages the book prints.
  function eraWanted(project) {
    var w = [];
    if (project.extras.eras) w.push('intro', 'timeline', 'facts');
    if (project.extras.memories) w.push('memories');
    return w;
  }
  function eraMissing(project, decadeId) {
    var e = project.eras[decadeId] || {};
    return eraWanted(project).filter(function (k) { return (e[k] || []).length < ERA[k].min; });
  }

  // [{ kind: 'questions', decade, rounds: [r...] } ..., { kind: 'eras' }?, { kind: 'extras' }]
  function list(project) {
    var out = [], per = project.plan.perRound;
    P.decades(project).forEach(function (d) {
      chunks(P.roundsOf(project, d.id), per).forEach(function (rs) { out.push({ kind: 'questions', decade: d, rounds: rs }); });
    });
    if (eraWanted(project).length && P.decades(project).length) out.push({ kind: 'eras' });
    out.push({ kind: 'extras' });
    out.forEach(function (p, i) { p.no = i + 1; p.done = isDone(project, p); });
    return out;
  }

  // What the extras prompt asks for: the welcome letter and the back cover, and the ranks.
  function extrasWanted(project) {
    var w = ['welcome', 'blurb'];
    if (project.extras.ranks) w.push('ranks');
    return w;
  }

  function hasExtra(project, k) {
    var ai = project.ai;
    if (k === 'blurb') return !!ai.blurb.trim();
    if (k === 'ranks') return ai.ranks.length >= RANKS;
    return ai[k].length > 0;
  }

  function isDone(project, p) {
    if (p.kind === 'questions') return p.rounds.every(function (r) { return missing(project, r) === 0; });
    if (p.kind === 'eras') return P.decades(project).every(function (d) { return !eraMissing(project, d.id).length; });
    return extrasWanted(project).every(function (k) { return hasExtra(project, k); });
  }

  // The first prompt that still needs a reply (or the last one when everything is done).
  function next(project) {
    var l = list(project);
    for (var i = 0; i < l.length; i++) if (!l[i].done) return i;
    return l.length - 1;
  }

  function about(project) {
    var b = project.book, a = P.audience(b.audience), c = P.country(b.country);
    var L = [];
    L.push('The book is a nostalgia trivia book about ' + P.span(project) + '.');
    L.push('The readers are ' + a.who + '.');
    L.push(c.where ? 'They grew up in ' + c.where + ': ask about the ' + c.adj + ' music, TV, brands, prices and everyday life of those years (things that were famous everywhere are welcome too).'
      : 'Readers live all over the world: prefer things that were famous in many countries, and name the country when something belongs to one.');
    L.push('People play it alone, with family, or read the questions aloud to a group at a senior center or a party.');
    return L.join(' ');
  }

  function common(project) {
    var c = P.country(project.book.country);
    return [
      '- Use only well-known, well-established facts that are easy to check. No trick questions, no "all of the above", no opinions and no facts that sources disagree on.',
      '- Keep it upbeat and kind: no wars, disasters, crimes, assassinations, illness or deaths.',
      '- Use ' + c.spelling + ' spelling.'
    ];
  }

  function questionPrompt(project, p) {
    var b = project.book, a = P.audience(b.audience), d = p.decade;
    var todo = p.rounds.filter(function (r) { return missing(project, r) > 0; });
    if (!todo.length) todo = p.rounds;
    var L = [];
    L.push('You are writing a nostalgia trivia book. ' + about(project));
    L.push('');
    L.push('Write trivia questions about the ' + d.id + ' (the years ' + d.year + ' to ' + (d.year + 9) + ') for ' + (todo.length > 1 ? 'these rounds' : 'this round') + ':');
    todo.forEach(function (r) {
      var n = missing(project, r) || project.plan.perRound;
      L.push('- ROUND: ' + r.full + ' — exactly ' + n + ' questions about ' + r.guide + ' in the ' + d.id + '.');
    });
    L.push('');
    L.push('Rules:');
    L.push('- Every question is about something from the ' + d.id + ': it happened, came out or was popular between ' + d.year + ' and ' + (d.year + 9) + '. Think of ' + d.about + '.');
    L.push('- Most questions have exactly 4 answer choices (A, B, C, D) and only one is correct. The wrong choices are believable but clearly wrong.');
    if (project.plan.tf) L.push('- About 1 question in 5 is a true-or-false statement instead: write it as a statement, give exactly 2 choices, A) True and B) False, and mix true and false answers.');
    common(project).forEach(function (l) { L.push(l); });
    L.push('- Mix the difficulty: ' + a.mix + '. Put the easiest questions first in each round.');
    L.push('- Keep each question under 30 words and each answer choice under 8 words.');
    L.push('- Warm, friendly tone that celebrates the decade. Gentle humor is welcome.');
    L.push('- After each question, add a FACT: one short, surprising fun fact about the answer (under 25 words).');
    L.push('- Do not number the questions.');
    var old = [];
    todo.forEach(function (r) { (project.questions[r.id] || []).forEach(function (q) { old.push(q.q); }); });
    if (old.length) {
      L.push('- Do not repeat or rephrase any of these questions, which are already in the book:');
      old.forEach(function (q) { L.push('  * ' + q); });
    }
    L.push('');
    L.push('Reply with one code block in exactly this format, a blank line between questions:');
    L.push('');
    L.push('ROUND: ' + todo[0].full);
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
      L.push('Start each round with its own ROUND: line, using the round names above.');
    }
    return L.join('\n');
  }

  function erasPrompt(project) {
    var w = eraWanted(project);
    var todo = P.decades(project).filter(function (d) { return eraMissing(project, d.id).length; });
    if (!todo.length) todo = P.decades(project);
    var L = [];
    L.push('You are writing the decade pages of a nostalgia trivia book. ' + about(project));
    L.push('');
    L.push('For each decade below, write:');
    if (w.indexOf('intro') !== -1) {
      L.push('- INTRO: 2 short, warm paragraphs (about 90 words in all) that take the reader back to the decade: its sights, sounds and everyday moments. Speak to the reader as "you".');
      L.push('- AT A GLANCE: 8 happy or remarkable moments of the decade in time order, one per line, each starting with its year (for example "1955: ..."), under 15 words each.');
      L.push('- DID YOU KNOW: 5 surprising, true fun facts about everyday life in the decade, one sentence each.');
    }
    if (w.indexOf('memories') !== -1) L.push('- MEMORY PROMPTS: 4 questions that invite the reader to write down their own memories of the decade (for example a favorite song, a first car or a family tradition). One sentence each, and kind to someone who was only a child then.');
    L.push('');
    L.push('Decades: ' + todo.map(function (d) { return d.id; }).join(', ') + '.');
    L.push('');
    L.push('Rules:');
    common(project).forEach(function (l) { L.push(l); });
    L.push('');
    L.push('Reply with one code block in exactly this format, every decade in turn:');
    L.push('');
    L.push('DECADE: ' + todo[0].id);
    if (w.indexOf('intro') !== -1) {
      L.push('INTRO:');
      L.push('First paragraph.');
      L.push('Second paragraph.');
      L.push('AT A GLANCE:');
      L.push('- ' + todo[0].year + ': A happy moment.');
      L.push('- ' + (todo[0].year + 3) + ': Another moment.');
      L.push('DID YOU KNOW:');
      L.push('- A fun fact.');
    }
    if (w.indexOf('memories') !== -1) {
      L.push('MEMORY PROMPTS:');
      L.push('- A question about the reader’s own memories?');
    }
    if (todo.length > 1) {
      L.push('');
      L.push('DECADE: ' + todo[1].id);
      L.push('...');
    }
    return L.join('\n');
  }

  function extrasPrompt(project) {
    var w = extrasWanted(project);
    var L = [];
    L.push('You are writing parts of a nostalgia trivia book. ' + about(project));
    L.push('');
    L.push('Write these parts:');
    L.push('- WELCOME: a warm welcome letter to the reader, 3 short paragraphs (about 140 words in all). Invite them on a trip down memory lane through ' + P.span(project) + ', and to play alone, with friends or with the whole family, sharing the stories each question brings back.');
    if (w.indexOf('ranks') !== -1) L.push('- RANKS: exactly ' + RANKS + ' fun, kind rank titles for the score card, from the lowest score to the highest, in a nostalgic style (for example from "Young Whippersnapper" to "Living Legend"). Each line: the rank title, a dash, and a short, warm comment of under 12 words.');
    L.push('- BACK COVER: a back-cover description of the book, about 70 words, warm and inviting. Do not invent a number of questions.');
    L.push('');
    L.push('Rules:');
    common(project).forEach(function (l) { L.push(l); });
    L.push('');
    L.push('Reply with one code block in exactly this format:');
    L.push('');
    L.push('WELCOME:');
    L.push('First paragraph.');
    L.push('Second paragraph.');
    L.push('Third paragraph.');
    if (w.indexOf('ranks') !== -1) { L.push(''); L.push('RANKS:'); L.push('- Lowest Rank Title - short comment'); L.push('- Next Rank Title - short comment'); }
    L.push('');
    L.push('BACK COVER:');
    L.push('The description.');
    return L.join('\n');
  }

  function text(project, p) {
    if (p.kind === 'extras') return extrasPrompt(project);
    if (p.kind === 'eras') return erasPrompt(project);
    return questionPrompt(project, p);
  }

  function label(p) {
    if (p.kind === 'extras') return 'Welcome letter, ranks and back cover';
    if (p.kind === 'eras') return 'Decade pages';
    return p.decade.id + ': ' + p.rounds.map(function (r) { return r.title; }).join(', ');
  }

  CX.prompts = {
    PER_PROMPT: PER_PROMPT, RANKS: RANKS, ERA: ERA, chunks: chunks, list: list, next: next, text: text, label: label, missing: missing, isDone: isDone,
    extrasWanted: extrasWanted, hasExtra: hasExtra, eraWanted: eraWanted, eraMissing: eraMissing
  };
})(typeof window !== 'undefined' ? window : globalThis);
