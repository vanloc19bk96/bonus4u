/*
 * The prompts the user copies into ChatGPT (or any AI chat). The AI only writes the themes and the
 * words; the app chooses which words fit and builds every grid. A prompt only asks for what its
 * puzzles still miss and lists what the book already has, so copying the same prompt again tops
 * the puzzles up instead of starting over.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan;

  var PER_PROMPT = 10;
  var TOP_UP = 6;           // words asked for when a puzzle has its words but no set fits the grid

  function perPrompt(project) { return Math.min(P.audience(project.plan.audience).perPrompt || PER_PROMPT, PER_PROMPT); }

  // What a puzzle still needs: { words, title, theme, span } (a number and booleans).
  function needs(project, pz) {
    var d = project.puzzles[pz.id] || P.emptyPuzzle(), st = CX.puzzles.status(project, pz);
    var words = st.state === 'ok' ? 0 : Math.max(0, st.ask - d.words.length);
    var span = !!CX.puzzles.spanProblem(project, d);
    if (!words && st.state === 'weak' && !span) words = TOP_UP;
    return { words: words, title: !d.title.trim(), theme: !d.theme.trim(), span: span };
  }
  function puzzleDone(project, pz) {
    var n = needs(project, pz);
    return !n.words && !n.title && !n.theme && !n.span;
  }

  // [{ kind: 'puzzles', puzzles: [...] } ..., { kind: 'extras' }]
  function list(project) {
    var all = P.puzzles(project), size = perPrompt(project), out = [];
    for (var i = 0; i < all.length; i += size) out.push({ kind: 'puzzles', puzzles: all.slice(i, i + size) });
    out.push({ kind: 'extras' });
    out.forEach(function (p, k) { p.no = k + 1; p.done = isDone(project, p); });
    return out;
  }

  function isDone(project, p) {
    if (p.kind === 'puzzles') return p.puzzles.every(function (x) { return puzzleDone(project, x); });
    return project.ai.welcome.length > 0 && project.ai.closing.length > 0 && !!project.ai.blurb.trim();
  }

  // The first prompt that still needs a reply (or the last one when everything is done).
  function next(project) {
    var l = list(project);
    for (var i = 0; i < l.length; i++) if (!l[i].done) return i;
    return l.length - 1;
  }

  function label(pz) { return 'PUZZLE ' + pz.no; }

  // The chosen theme, or the user's own one, as { guide, topics, sample, easy }.
  function topic(project) {
    var pl = project.plan, t = P.theme(pl.theme);
    if (t.id !== 'custom') return t;
    var own = pl.customTheme.trim();
    if (!own) return P.theme('mix');
    return { guide: own, topics: 'as many different sides of this theme as you can find',
      sample: { title: 'A Playful Title', theme: 'What the words have in common', span: 'THESPANWORD', words: ['WORD', 'ANOTHER', 'THIRDWORD', 'FOURTH', 'FIFTHONE', 'SIXTH'] } };
  }

  function about(project) {
    var a = P.audience(project.plan.audience);
    return 'You are writing the content of a themed word puzzle book for ' + a.who + '. The theme of the book: ' + topic(project).guide + '.';
  }

  function howItWorks(project) {
    var lim = P.limits(project);
    return 'How the puzzle works: the solver sees a ' + lim.cols + ' by ' + lim.rows + ' grid of ' + lim.cells + ' letters and a playful title. Hidden in it are several theme words and one SPAN word that names the theme and runs from one edge of the grid to the opposite edge. Words can turn in any direction, and every letter is used exactly once. You only write the words: an app builds the grid and chooses which of your words fit exactly.';
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /*
   * What makes the puzzle work, for the writing prompt and the check prompt alike. Chat models know
   * the subject but not the craft, so it is spelled out: a sideways title, a span word that sums up
   * the set, words that clearly belong and can't be mistaken for one another, and a spread of lengths
   * (the app can only fill the grid exactly when it has lengths to choose from).
   */
  function rules(project) {
    var lim = P.limits(project), a = P.audience(project.plan.audience), tp = topic(project), L = [];
    var mid = Math.min(lim.maxLen, lim.minLen + 3);
    L.push('Rules for each puzzle:');
    L.push('- TITLE: a playful hint of 2 to 5 words that points at the theme sideways, like a pun or a common saying ("' + tp.sample.title + '"). It must not contain the span word or any of the words. It should make the solver think, not state the category.');
    L.push('- THEME: the plain meaning in under 10 words ("' + tp.sample.theme + '"). It is printed in the hints at the back of the book, so it must not contain the span word or any of the words.');
    L.push('- SPAN: one word or a short common phrase that sums up the theme, ' + lim.spanMin + ' to ' + lim.spanMax + ' letters not counting spaces (' + tp.sample.span + ' has ' + P.letters(tp.sample.span).length + '). Count the letters. It must be something people really say, and it is never one of the WORDS.');
    L.push('- WORDS: ' + lim.ask + ' words that clearly belong to the theme, the strongest first. The app keeps about ' + lim.min + ' to ' + lim.max + ' of them.');
    L.push('Rules for the words:');
    L.push('- One real English word each, spelled the way a standard dictionary spells it, ' + lim.minLen + ' to ' + lim.maxLen + ' letters: no spaces, hyphens, apostrophes, numbers or abbreviations.');
    L.push('- Mix the lengths on purpose: about a third short (' + lim.minLen + ' or ' + (lim.minLen + 1) + ' letters), a third medium (' + Math.min(lim.maxLen, lim.minLen + 2) + ' or ' + mid + ') and a third longer (' + Math.min(lim.maxLen, mid + 1) + ' or more). This matters: the app needs lengths to choose from.');
    L.push('- Every word is a clear member of that puzzle’s theme: a solver who has guessed the theme would accept it at once. No weak, stretched or generic filler.');
    L.push('- No word inside another word or inside the span word (not CAT and CATS, not TEA with TEAPOT), and no two forms of one word (not BAKE and BAKING).');
    if (a.words || a.easy || tp.easy) L.push('- Only ' + (a.words || 'easy, well-known words that everyone knows') + '.');
    L.push('- No brand names, no names of living people, no song lyrics, no foreign words, nothing rude, sad or scary.');
    L.push('- Every puzzle has its own subject. Never two puzzles about the same thing, and try not to repeat a word across puzzles.');
    return L;
  }

  // The span words the rest of the book already uses, so a new batch does not repeat a subject.
  function usedSubjects(project, pzs) {
    var ids = pzs.map(function (x) { return x.id; }), out = [];
    P.puzzles(project).forEach(function (x) {
      if (ids.indexOf(x.id) !== -1) return;
      var s = ((project.puzzles[x.id] || {}).span || '').trim();
      if (s) out.push(s);
    });
    return out;
  }

  function sampleBlock(pz, sample, ask) {
    var words = sample.words.slice(0, Math.min(sample.words.length, ask));
    return [label(pz), 'TITLE: ' + sample.title, 'THEME: ' + sample.theme, 'SPAN: ' + sample.span, 'WORDS: ' + words.join(', ') + ', ...'];
  }

  function puzzlesPrompt(project, p) {
    var lim = P.limits(project), tp = topic(project);
    var todo = p.puzzles.filter(function (x) { return !puzzleDone(project, x); });
    if (!todo.length) todo = p.puzzles;
    var L = [about(project), '', howItWorks(project), ''];
    L.push('Write ' + (todo.length > 1 ? 'these ' + todo.length + ' puzzles' : 'this puzzle') + ':');
    todo.forEach(function (x) {
      var d = project.puzzles[x.id] || P.emptyPuzzle(), n = needs(project, x), parts = [];
      if (!n.title) parts.push('its title is "' + d.title.trim() + '"');
      if (!n.span) parts.push('its span word is ' + d.span.trim());
      else if (P.letters(d.span)) parts.push('its span word ' + d.span.trim() + ' does not fit, so choose another of ' + lim.spanMin + ' to ' + lim.spanMax + ' letters');
      if (d.words.length && n.words) parts.push('exactly ' + n.words + ' more words (it already has ' + d.words.join(', ') + '; do not repeat them), with a good mix of lengths');
      else if (!n.words) parts.push('no new words');
      else parts.push('exactly ' + n.words + ' words');
      L.push('- ' + label(x) + ': ' + parts.join(', ') + '.');
    });
    L.push('');
    L.push('Subjects to draw on, using as many different ones as you can: ' + tp.topics + '.');
    L.push('');
    Array.prototype.push.apply(L, rules(project));
    var used = usedSubjects(project, todo);
    if (used.length) L.push('- These subjects are already in the book, so do not write about them again: ' + used.join(', ') + '.');
    L.push('');
    L.push('Before you reply, check each puzzle: read the title as ' + P.audience(project.plan.audience).reader + ' would, count the letters of each span word, and replace any word that is misspelled, too obscure or only loosely on the theme.');
    L.push('');
    L.push('Reply with one code block in exactly this format, for every puzzle:');
    L.push('');
    Array.prototype.push.apply(L, sampleBlock(todo[0], tp.sample, lim.ask));
    if (todo.length > 1) { L.push(''); L.push('Start each puzzle with its own PUZZLE line, in order. Write out every word: never leave "..." in your reply.'); }
    else { L.push(''); L.push('Write out every word: never leave "..." in your reply.'); }
    return L.join('\n');
  }

  function extrasPrompt(project) {
    var pl = project.plan, a = P.audience(pl.audience), L = [about(project), '', howItWorks(project), ''];
    L.push('The book has ' + pl.count + ' puzzles' + (pl.hints ? ', hints' : '') + ' and full solutions at the back. In the book the puzzle is called "' + (pl.name.trim() || 'Word Trails') + '". Write these short texts:');
    L.push('- WELCOME: a warm note for the first pages, 2 or 3 sentences (about 50 words), inviting the reader in.');
    L.push('- CLOSING: a short happy note for the last page, 2 short paragraphs (about 70 words), congratulating the solver. You may ask kindly for an honest review, but never offer anything in return.');
    L.push('- BACK COVER: a back-cover description of the book, about 70 words, ' + a.blurb + '. Do not name any newspaper, app or other puzzle brand, and promise nothing the book does not have.');
    L.push('');
    L.push('Plain, friendly words for ' + a.who + '.');
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
   * Sends puzzles the book already has back to the AI with the same rules, for a corrected version
   * in full. Its reply goes in with "Replace", so a weak set can be fixed without starting over.
   */
  function checkPrompt(project, pzs) {
    var lim = P.limits(project), a = P.audience(project.plan.audience);
    var have = pzs.filter(function (x) { return ((project.puzzles[x.id] || {}).words || []).length; });
    var L = [about(project), '', howItWorks(project), ''];
    L.push('Below ' + (have.length > 1 ? 'are ' + have.length + ' puzzles' : 'is one puzzle') + ' of the book. Check them as a careful puzzle editor for ' + a.who + ' and send them back corrected.');
    L.push('');
    Array.prototype.push.apply(L, rules(project));
    L.push('');
    L.push('How to check:');
    L.push('- Is every word spelled right and a clear member of the theme? Replace any that is not.');
    L.push('- Does the title point at the theme without naming it? Does the span word really sum up the words?');
    L.push('- Keep every good word and title exactly as it is, and keep at least ' + lim.ask + ' words in each puzzle.');
    L.push('');
    L.push('Reply with one code block in the same format as below: every puzzle in full, with all its words (the ones you kept and the new ones).');
    L.push('');
    have.forEach(function (x, i) {
      var d = project.puzzles[x.id];
      if (i) L.push('');
      L.push(label(x));
      L.push('TITLE: ' + (d.title.trim() || '(a playful title)'));
      L.push('THEME: ' + (d.theme.trim() || '(the plain meaning)'));
      L.push('SPAN: ' + (d.span.trim() || '(the span word)'));
      L.push('WORDS: ' + d.words.join(', '));
    });
    return L.join('\n');
  }

  function text(project, p) { return p.kind === 'extras' ? extrasPrompt(project) : puzzlesPrompt(project, p); }

  function title(p) {
    if (p.kind === 'extras') return 'Welcome, closing note and back cover';
    var a = p.puzzles[0], z = p.puzzles[p.puzzles.length - 1];
    return 'Puzzles ' + a.no + (z !== a ? '–' + z.no : '');
  }

  CX.prompts = { PER_PROMPT: PER_PROMPT, perPrompt: perPrompt, needs: needs, puzzleDone: puzzleDone, list: list, next: next, text: text, checkText: checkPrompt, title: title, label: label, isDone: isDone, cap: cap };
})(typeof window !== 'undefined' ? window : globalThis);
