/*
 * The prompts the user copies into ChatGPT (or any AI chat). The AI writes the groups and their
 * links; the app checks them, shuffles the board and lays out the book. A prompt only asks for the
 * puzzles of its batch that are not ready yet, so copying it again finishes the batch instead of
 * starting over.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan;

  var PER_PROMPT = 10;
  var MAX_USED = 160;   // links of other puzzles listed in a prompt, so the AI does not repeat them

  function done(project, pz) { var st = CX.puzzles.status(project, pz); return st.state === 'ok'; }

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

  // The chosen theme, or the user's own one: { guide, topics, sample }. Kids always get the kids sample.
  function topic(project) {
    var pl = project.plan, a = P.audience(pl.audience), t = P.theme(pl.theme), own = pl.customTheme.trim();
    var sample = a.kid ? P.theme('kids').sample : (t.sample || P.theme('mix').sample);
    if (t.id === 'custom' && own) return { guide: own, topics: 'as many different sides of this theme as you can find, with some light wordplay', sample: sample };
    if (t.id === 'custom') t = P.theme('mix');
    return { guide: t.guide, topics: t.topics, sample: sample };
  }

  function about(project) {
    var a = P.audience(project.plan.audience);
    return 'You are writing the puzzles of a word puzzle book for ' + a.who + '. The theme of the book: ' + topic(project).guide + '.';
  }

  function howItWorks() {
    return 'How the puzzle works: the solver sees 16 answers on a 4 by 4 board and sorts them into four groups of four. Each group has a LINK: what its four answers share. The fun is in the traps: some answers seem to fit two groups, but only one way of sorting uses all 16. You write the groups; an app shuffles the board and prints the book.';
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /*
   * What makes the puzzle fair, for the writing prompt and the check prompt alike. Chat models know
   * facts but not the craft, so it is spelled out: precise links, traps that fail on a close look,
   * one way to sort, short answers that fit a printed tile, and links that never repeat.
   */
  // The longest answer: what the reader knows, and what fits a tile at this page and text size.
  function maxLetters(project) { return Math.max(6, Math.min(P.audience(project.plan.audience).maxLetters, CX.layout ? CX.layout.tileLetters(project) : 99)); }

  function rules(project) {
    var a = P.audience(project.plan.audience), L = [];
    L.push('Rules for every puzzle:');
    L.push('- Exactly 4 groups of exactly 4 answers. GROUP 1 is the most direct link, GROUP 4 the trickiest.');
    L.push('- LINK: a short, precise name for what the four answers share, under 8 words ("Things you crack", "Card games", "___ fish", "Hidden animal"). Precise, not loose: "Card games", not "Games". For answers that go with the same word, write the blank as ___ ("___ fish" means STARFISH, SWORDFISH...).');
    L.push('- ANSWERS: one word or a common two-word phrase, in capitals, at most ' + maxLetters(project) + ' letters in a word, American spelling, no abbreviations. They are printed on small tiles, so shorter is better.');
    L.push('- Only one way to sort: every answer truly fits its own link, and each link fits exactly four of the 16 answers. A trap may seem to fit another group, but must fail it on a close look (PALM is a body part, but it is not hidden inside a longer word).');
    L.push('- Every puzzle has at least one trap. Name the traps on the TRAP line, with why they do not belong where they seem to.');
    L.push('- No answer may contain a word of its own link (not FISH under "Kinds of fish"), and no two answers may be forms of one word (not CAT and CATS).');
    L.push('- Facts must be true and widely known: nothing a solver has to look up' + (a.words ? '. Only ' + a.words : '') + '.');
    if (a.kid) {
      L.push('- Plain links a child understands: kinds of things, colors, shapes, places, and simple word games like ___ BALL. No hidden words or anagrams.');
      L.push('- Keep it cheerful and safe for children: no disasters, weapons, fighting, alcohol, smoking, illness, hunting, death or romance.');
    } else {
      L.push('- Use many kinds of links across the book: kinds of things, things that share a trait, ___ phrases, hidden words, sound-alikes, words that can follow the same word, things that come in a set. Never the same kind of trick twice in one puzzle.');
    }
    L.push('- No brand names, no living people, no song lyrics, nothing rude, sad or scary, and no politics.');
    L.push('- How hard each puzzle is (the level is next to its number):');
    P.LEVELS.forEach(function (lv) { L.push('  ' + (a.kid ? P.KID_ASK[lv.id] : lv.ask)); });
    L.push('- Every puzzle has its own subjects: never reuse a link from another puzzle, and try not to repeat an answer anywhere in the book.');
    return L;
  }

  // The links the rest of the book already uses, so a new batch does not repeat them.
  function usedLinks(project, pzs) {
    var ids = pzs.map(function (x) { return x.id; }), out = [];
    P.puzzles(project).forEach(function (x) {
      if (ids.indexOf(x.id) !== -1) return;
      ((project.puzzles[x.id] || {}).groups || []).forEach(function (g) { if (g.link.trim()) out.push(g.link.trim()); });
    });
    return out.slice(-MAX_USED);
  }

  function block(project, pz, d) {
    var L = [label(project, pz)];
    d.groups.forEach(function (g, i) { L.push('GROUP ' + (i + 1) + ': ' + (g.link.trim() || '(the link)') + ' = ' + g.words.join(', ')); });
    L.push('TRAP: ' + (d.trap || '(the traps and why they do not belong)'));
    return L;
  }

  function sampleBlock(project, pz, sample) { return block(project, pz, P.asPuzzle(sample)); }

  function puzzlesPrompt(project, p) {
    var todo = p.puzzles.filter(function (x) { return !done(project, x); });
    if (!todo.length) todo = p.puzzles;
    var L = [about(project), '', howItWorks(), ''];
    L.push('Write ' + (todo.length > 1 ? 'these ' + todo.length + ' puzzles' : 'this puzzle') + ': ' + todo.map(function (x) { return label(project, x); }).join(', ') + '.');
    var redo = todo.filter(function (x) { var st = CX.puzzles.status(project, x); return st.state === 'weak' || st.state === 'part'; });
    redo.forEach(function (x) {
      var st = CX.puzzles.status(project, x);
      L.push('- PUZZLE ' + x.no + ' came back unfinished last time (' + (st.pz.problems[0] || 'groups missing') + '): write it again in full.');
    });
    L.push('');
    L.push('Subjects to draw on, using as many different ones as you can: ' + topic(project).topics + '.');
    L.push('');
    Array.prototype.push.apply(L, rules(project));
    var used = usedLinks(project, todo);
    if (used.length) L.push('- These links are already in the book, so do not use them again: ' + used.join('; ') + '.');
    L.push('');
    L.push('Before you reply, check each puzzle as ' + P.audience(project.plan.audience).reader + ' would: try to sort the 16 answers another way, and if you can, change an answer or a link until only one way works. Count 4 answers in every group.');
    L.push('');
    L.push('Reply with one code block in exactly this format, for every puzzle (this example shows the format only: do not use its groups):');
    L.push('');
    Array.prototype.push.apply(L, sampleBlock(project, todo[0], topic(project).sample));
    L.push('');
    L.push(todo.length > 1 ? 'Start each puzzle with its own PUZZLE line, in order. Write out every answer: never leave "..." in your reply.' : 'Write out every answer: never leave "..." in your reply.');
    return L.join('\n');
  }

  function extrasPrompt(project) {
    var pl = project.plan, a = P.audience(pl.audience), L = [about(project), '', howItWorks(), ''];
    L.push('The book has ' + pl.count + ' puzzles' + (pl.hints ? ', hints at the back (the four links of each puzzle, a few pages long)' : '') + ' and full solutions at the back. In the book the puzzle is called "' + (pl.name.trim() || 'Word Links') + '". Write these short texts:');
    if (a.kid) {
      L.push('- WELCOME: a warm note for the first pages that speaks to the child, 2 or 3 short sentences (about 40 words).');
      L.push('- CLOSING: a short happy note for the last page that speaks to the child, 2 short paragraphs (about 70 words). If you mention a review, ask the child to tell a grown-up, because a grown-up has to write it, and never offer anything in return.');
    } else {
      L.push('- WELCOME: a warm note for the first pages, 2 or 3 sentences (about 50 words), inviting the reader in.');
      L.push('- CLOSING: a short happy note for the last page, 2 short paragraphs (about 70 words), congratulating the solver. You may ask kindly for an honest review, but never offer anything in return.');
    }
    L.push('- BACK COVER: a back-cover description of the book, about 70 words, ' + a.blurb + '. Do not name any newspaper, app or other puzzle brand, and promise nothing the book does not have.');
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
   * full. Its reply goes in with "Replace", so a weak puzzle can be fixed without starting over.
   */
  function checkPrompt(project, pzs) {
    var a = P.audience(project.plan.audience);
    var have = pzs.filter(function (x) { return ((project.puzzles[x.id] || {}).groups || []).length; });
    var L = [about(project), '', howItWorks(), ''];
    L.push('Below ' + (have.length > 1 ? 'are ' + have.length + ' puzzles' : 'is one puzzle') + ' of the book. Check them as a careful puzzle editor for ' + a.who + ' and send them back corrected.');
    L.push('');
    Array.prototype.push.apply(L, rules(project));
    L.push('');
    L.push('How to check each puzzle:');
    L.push('- Try hard to sort the 16 answers another way. If any answer fits a second group as well as its own, replace it or sharpen the link.');
    L.push('- Is every fact true, every answer spelled right, every link precise? Would ' + a.reader + ' know every answer?');
    L.push('- Are the groups in order, the most direct first? Does the puzzle match its level?');
    L.push('- Keep every good group exactly as it is.');
    L.push('');
    L.push('Reply with one code block in the same format as below: every puzzle in full, four groups of four, with its TRAP line.');
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

  CX.prompts = { PER_PROMPT: PER_PROMPT, maxLetters: maxLetters, done: done, list: list, next: next, text: text, checkText: checkPrompt, title: title, isDone: isDone, cap: cap, topic: topic };
})(typeof window !== 'undefined' ? window : globalThis);
