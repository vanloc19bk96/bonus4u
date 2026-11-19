/*
 * The prompts the user copies into ChatGPT (or any AI chat). The AI writes the sentences; the app
 * puts each one in code, picks the given letters and the hint, and lays out the book. Every prompt
 * asks for sentences no longer than the space a puzzle has on the page, so whatever comes back
 * fits. A prompt only asks for the puzzles of its batch that are not ready yet, so copying it again
 * finishes the batch instead of starting over.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan, E = CX.engine;

  var PER_PROMPT = 25;
  var MAX_USED = 120;   // sentences of other puzzles listed in a prompt, so the AI does not repeat them

  function done(project, pz) { return CX.puzzles.status(project, pz).state === 'ok'; }

  // [{ kind: 'puzzles', puzzles: [...] } ..., { kind: 'extras' }]
  function list(project) {
    var all = P.puzzles(project), out = [];
    for (var i = 0; i < all.length; i += PER_PROMPT) out.push({ kind: 'puzzles', puzzles: all.slice(i, i + PER_PROMPT) });
    out.push({ kind: 'extras' });
    out.forEach(function (p, k) { p.no = k + 1; p.done = isDone(project, p); });
    return out;
  }

  function isDone(project, p) {
    if (p.kind === 'puzzles') return p.puzzles.every(function (x) { return done(project, x); });
    return project.ai.welcome.length > 0 && project.ai.closing.length > 0 && !!project.ai.blurb.trim();
  }

  // The first prompt that still needs a reply (or the last one when everything is done).
  function next(project) {
    var l = list(project);
    for (var i = 0; i < l.length; i++) if (!l[i].done) return i;
    return l.length - 1;
  }

  function label(project, pz) { return 'PUZZLE ' + pz.no + ' (' + P.levelOf(project, pz) + ')'; }

  /*
   * The length a sentence of this level may have, in characters with spaces: { lo, hi }. hi is what
   * the level asks for, never more than what fits a puzzle's space on the page (with room to spare).
   */
  function length(project, lvl) {
    var cap = CX.layout.capacity(project, CX.layout.perPage(project)), lv = P.level(lvl);
    var hi = Math.max(30, Math.min(lv.len[1], Math.floor(cap * 0.85)));
    var lo = Math.max(25, Math.min(lv.len[0], Math.floor(hi * 0.6)));
    return { lo: lo, hi: hi };
  }
  function words(n) { return Math.max(4, Math.round(n / 5.8)); }
  function lengthText(r) { return r.lo + ' to ' + r.hi + ' characters with spaces (about ' + words(r.lo) + ' to ' + words(r.hi) + ' words)'; }

  // The chosen theme, or the user's own one: { guide, topics, sample, by }. Kids always get a kid sample.
  function topic(project) {
    var pl = project.plan, a = P.audience(pl.audience), t = P.theme(pl.theme), own = pl.customTheme.trim();
    var sample = t.sample || P.theme('quotes').sample;
    if (a.kid && t.by === '') sample = P.theme('kids').sample;
    if (t.id === 'custom' && own) return { guide: own, topics: 'as many different sides of this theme as you can find', sample: sample, by: 'person', own: true };
    if (t.id === 'custom') t = P.theme('quotes');
    return { guide: t.guide, topics: t.topics, sample: sample, by: t.by, id: t.id };
  }

  function about(project) {
    var a = P.audience(project.plan.audience);
    return 'You are writing the sentences of a cryptogram puzzle book for ' + a.who + '. The theme of the book: ' + topic(project).guide + '.';
  }

  function howItWorks() {
    return 'How the puzzle works: each sentence is printed in a secret code, with every letter swapped for another letter, and the solver cracks the code to read it. An app makes the codes and prints the book; you write the sentences.';
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // What the BY line holds, in the rules.
  function byRule(project) {
    var t = topic(project);
    if (t.by === 'ref') return '- BY: the reference, book chapter:verse (Psalm 23:1, John 3:16).';
    if (t.by === 'origin') return '- BY: where the saying comes from (Irish proverb, Chinese proverb, Old English saying). Only the origin you are sure of; "Proverb" if you are not.';
    if (t.by === 'person') return '- BY: the full name of the person, as it is usually written (Mark Twain, Jane Austen), with no dates, titles or book names.' + (t.own ? ' For a line that is not a quote (a saying, a fact), leave BY empty.' : '');
    return '';
  }

  /*
   * What makes a good cryptogram sentence, for the writing prompt and the check prompt alike. The
   * risk with quotes is a line that sounds famous but was never said, so that is spelled out.
   */
  function rules(project) {
    var a = P.audience(project.plan.audience), t = topic(project), L = [];
    L.push('Rules for every puzzle:');
    L.push('- TEXT: one complete sentence or two, in plain English with American spelling. Its length depends on its level (count the characters, spaces included):');
    P.LEVELS.forEach(function (lv) { L.push('    ' + lv.label.toUpperCase() + ': ' + lengthText(length(project, lv.id)) + '.'); });
    L.push('  Never go over the most for its level: the page has room for no more.');
    if (t.own) {
      L.push('- A quote must be real and word for word, by someone who lived long ago (who died before 1955): never invent a quote or put a famous name on a line that person did not say. A fact must be true and widely known. A saying or joke needs no name.');
    } else if (t.by === 'person' || t.by === 'origin') {
      L.push('- Only real quotes you are sure of, word for word as they are usually printed, by people who lived long ago (who died before 1955). Never invent a quote, never change its words, and never put a famous name on a line that person did not say. If you are not sure of the words or of who said them, choose another quote.');
      L.push('- No more than 3 quotes by the same person in one reply.');
    } else if (t.by === 'ref') {
      L.push('- Word for word from the King James Version, as it is printed (keep thee, thou, hath and LORD). A whole verse, or a part of one that reads as a complete sentence.');
    } else if (t.id === 'facts' || t.id === 'kids') {
      L.push('- Facts must be true and widely known, things you are sure of. Write numbers as words (three hearts, not 3 hearts).');
    } else if (t.id === 'jokes') {
      L.push('- The question and its answer together in one TEXT: "Why did the cow cross the road? To get to the udder side." Clean, kind jokes only.');
    }
    var by = byRule(project);
    if (by) L.push(by);
    if (a.words) L.push('- Only ' + a.words + '.');
    if (a.kid) L.push('- Keep it cheerful and safe for children: no disasters, weapons, fighting, alcohol, smoking, illness, death or romance.');
    L.push('- Use only the letters A to Z, ordinary punctuation and spaces: no emoji, symbols, accents or foreign letters, and write numbers as words.');
    L.push('- Nothing rude, sad or scary, and no politics.');
    L.push('- Every puzzle has its own sentence: never repeat one that is already in the book.');
    return L;
  }

  // The sentences the rest of the book already has, so a new batch does not repeat them.
  function used(project, pzs) {
    var ids = pzs.map(function (x) { return x.id; }), out = [];
    P.puzzles(project).forEach(function (x) {
      if (ids.indexOf(x.id) !== -1) return;
      var d = project.puzzles[x.id];
      if (d && d.text.trim()) out.push(E.clean(d.text).split(' ').slice(0, 7).join(' ') + (d.text.split(' ').length > 7 ? '…' : ''));
    });
    return out.slice(-MAX_USED);
  }

  function block(project, pz, d) {
    var L = [label(project, pz), 'TEXT: ' + (d.text || '(the sentence)')];
    if (topic(project).by) L.push('BY: ' + (d.by || ''));
    return L;
  }

  function puzzlesPrompt(project, p) {
    var todo = p.puzzles.filter(function (x) { return !done(project, x); });
    if (!todo.length) todo = p.puzzles;
    var L = [about(project), '', howItWorks(), ''];
    L.push('Write ' + (todo.length > 1 ? 'these ' + todo.length + ' puzzles' : 'this puzzle') + ': ' + todo.map(function (x) { return label(project, x); }).join(', ') + '.');
    todo.forEach(function (x) {
      var st = CX.puzzles.status(project, x);
      if (st.state === 'weak') L.push('- PUZZLE ' + x.no + ' did not work last time (' + st.pz.problems[0] + '): write a new one.');
    });
    L.push('');
    L.push('Subjects to draw on, using as many different ones as you can: ' + topic(project).topics + '.');
    L.push('');
    Array.prototype.push.apply(L, rules(project));
    var u = used(project, todo);
    if (u.length) L.push('- These sentences are already in the book, so do not use them again: ' + u.join(' / ') + '.');
    L.push('');
    L.push('Before you reply, check every puzzle: is it real and true, word for word? Is it inside the length for its level?');
    L.push('');
    L.push('Reply with one code block in exactly this format, for every puzzle (this example shows the format only: do not use its words):');
    L.push('');
    Array.prototype.push.apply(L, block(project, todo[0], topic(project).sample));
    L.push('');
    L.push(todo.length > 1 ? 'Start each puzzle with its own PUZZLE line, with its number, in order. Write out every puzzle in full: never leave "..." in your reply.' : 'Write it out in full: never leave "..." in your reply.');
    return L.join('\n');
  }

  function extrasPrompt(project) {
    var pl = project.plan, a = P.audience(pl.audience), L = [about(project), '', howItWorks(), ''];
    L.push('The book has ' + pl.count + ' cryptogram puzzles' + (pl.hints ? ', a page of hints at the back (one extra letter for each puzzle)' : '') + ' and full solutions at the back. Write these short texts:');
    if (a.kid) {
      L.push('- WELCOME: a warm note for the first pages that speaks to the child, 2 or 3 short sentences (about 40 words).');
      L.push('- CLOSING: a short happy note for the last page that speaks to the child, 2 short paragraphs (about 70 words). If you mention a review, ask the child to tell a grown-up, because a grown-up has to write it, and never offer anything in return.');
    } else {
      L.push('- WELCOME: a warm note for the first pages, 2 or 3 sentences (about 50 words), inviting the reader in.');
      L.push('- CLOSING: a short happy note for the last page, 2 short paragraphs (about 70 words), congratulating the solver. You may ask kindly for an honest review, but never offer anything in return.');
    }
    L.push('- BACK COVER: a back-cover description of the book, about 70 words, ' + a.blurb + '. Do not name any newspaper, app or puzzle brand, and promise nothing the book does not have.');
    L.push('');
    L.push(a.kid ? 'Write the WELCOME and CLOSING in short, easy sentences that ' + a.reader + ' can read. Write the BACK COVER for the grown-up who buys the book.' : 'Plain, friendly words for ' + a.who + '.');
    L.push('');
    L.push('Reply with one code block in exactly this format:');
    L.push('');
    L.push('WELCOME:');
    L.push('The text.');
    L.push('');
    L.push('CLOSING:');
    L.push('First paragraph.');
    L.push('Second paragraph.');
    L.push('');
    L.push('BACK COVER:');
    L.push('The description.');
    return L.join('\n');
  }

  /*
   * Sends puzzles the book already has back to the AI with the same rules, for a corrected version in
   * full. Its reply goes in with "Replace", so a doubtful quote can be fixed without starting over.
   */
  function checkPrompt(project, pzs) {
    var t = topic(project);
    var have = pzs.filter(function (x) { var d = project.puzzles[x.id]; return d && d.text.trim(); });
    var L = [about(project), '', howItWorks(), ''];
    L.push('Below ' + (have.length > 1 ? 'are ' + have.length + ' puzzles' : 'is one puzzle') + ' of the book. Check them as a careful editor and send them back corrected.');
    L.push('');
    Array.prototype.push.apply(L, rules(project));
    L.push('');
    L.push('How to check each puzzle:');
    if (t.by === 'person' || t.by === 'origin') L.push('- Is the quote real, word for word, and is the name right? Many lines online are credited to the wrong person. If you are not sure, replace it with a real quote you are sure of.');
    else if (t.by === 'ref') L.push('- Is the verse word for word from the King James Version, with the right reference?');
    else L.push('- Is every fact true and every joke clean and easy to follow?');
    L.push('- Is it inside the length for its level? Shorten or replace a sentence that is too long.');
    L.push('- Keep every good puzzle exactly as it is.');
    L.push('');
    L.push('Reply with one code block in the same format as below: every puzzle in full.');
    L.push('');
    have.forEach(function (x, i) {
      if (i) L.push('');
      Array.prototype.push.apply(L, block(project, x, project.puzzles[x.id]));
    });
    return L.join('\n');
  }

  function text(project, p) { return p.kind === 'extras' ? extrasPrompt(project) : puzzlesPrompt(project, p); }

  function title(p) {
    if (p.kind === 'extras') return 'Welcome, closing note and back cover';
    var a = p.puzzles[0], z = p.puzzles[p.puzzles.length - 1];
    return 'Puzzles ' + a.no + (z !== a ? '–' + z.no : '');
  }

  CX.prompts = { PER_PROMPT: PER_PROMPT, length: length, lengthText: lengthText, done: done, list: list, next: next, text: text, checkText: checkPrompt, title: title, isDone: isDone, cap: cap, topic: topic };
})(typeof window !== 'undefined' ? window : globalThis);
