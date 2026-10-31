/*
 * The prompts the user copies into ChatGPT (or any AI chat). The AI only writes words, clues and
 * the little texts around them; the app builds every grid. Days are grouped so one reply holds
 * about 120 words. A prompt only asks for what its days still miss and lists the words the
 * book already has, so copying the same prompt again tops the days up instead of starting over.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var P = CX.plan;

  var WORDS_PER_PROMPT = 120;
  var TOP_UP = 8;           // words asked for when a day has its words but the grid comes out small

  function perPrompt(project) { return Math.min(P.audience(project.plan.audience).days || 99, Math.max(2, Math.floor(WORDS_PER_PROMPT / P.grid(project.plan.size).ask))); }

  // What a day still needs: { words, title, story, question } (numbers / booleans).
  function needs(project, day) {
    var d = project.days[day.id] || P.emptyDay(), pl = project.plan, st = CX.puzzles.status(project, day);
    var words = st.state === 'ok' ? 0 : Math.max(0, st.ask - d.words.length);
    if (!words && st.state === 'weak') words = TOP_UP;
    return {
      words: words,
      title: !d.title.trim(),
      story: pl.story && !d.story.trim(),
      question: pl.memory && !d.question.trim()
    };
  }
  function dayDone(project, day) {
    var n = needs(project, day);
    return !n.words && !n.title && !n.story && !n.question;
  }

  // [{ kind: 'days', days: [day...] } ..., { kind: 'extras' }]
  function list(project) {
    var all = P.days(project), size = perPrompt(project), out = [];
    ['main', 'bonus'].forEach(function (set) {
      var ds = all.filter(function (d) { return d.set === set; });
      for (var i = 0; i < ds.length; i += size) out.push({ kind: 'days', set: set, days: ds.slice(i, i + size) });
    });
    out.push({ kind: 'extras' });
    out.forEach(function (p, i) { p.no = i + 1; p.done = isDone(project, p); });
    return out;
  }

  function extrasWanted(project) {
    var w = ['weeks', 'eve', 'blurb'];
    return w;
  }

  function isDone(project, p) {
    if (p.kind === 'days') return p.days.every(function (d) { return dayDone(project, d); });
    var ai = project.ai;
    return ai.weeks.length >= P.weeks(project).length && ai.eve.length > 0 && !!ai.blurb.trim();
  }

  // The first prompt that still needs a reply (or the last one when everything is done).
  function next(project) {
    var l = list(project);
    for (var i = 0; i < l.length; i++) if (!l[i].done) return i;
    return l.length - 1;
  }

  function label(day) { return (day.set === 'bonus' ? 'BONUS DAY ' : 'DAY ') + day.no; }

  // The chosen theme, or the user's own one, as { guide, arc, focus, sample }.
  function topic(project) {
    var pl = project.plan, t = P.theme(pl.theme);
    if (t.id !== 'custom') return t;
    var own = pl.customTheme.trim();
    if (!own) return P.theme('cozy');
    return { guide: own, arc: 'each day takes a different part of the book’s theme, in an order that builds up to Christmas Eve',
      focus: 'the book’s theme', sample: ['A Short Title', 'WORD | A short clue for it', 'ANOTHER | Another short clue'] };
  }

  function about(project) {
    var pl = project.plan, a = P.audience(pl.audience), guide = topic(project).guide;
    return 'You are writing a Christmas crossword advent calendar book: one crossword a day, from ' + P.dateOf(project, 1) + ' to December ' + P.lastDate(project) +
      (pl.bonus ? ', plus a bonus of twelve more from December 26 to January 6' : '') + '. The puzzles are for ' + a.who + '. The theme of the book: ' + guide + '.';
  }

  function usedElsewhere(project, days) {
    var ids = days.map(function (d) { return d.id; }), out = [];
    P.days(project).forEach(function (d) {
      if (ids.indexOf(d.id) !== -1) return;
      ((project.days[d.id] || {}).words || []).forEach(function (x) { out.push(x.w); });
    });
    return out;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /*
   * What makes the crossword work, for the days prompt and the check prompt alike: the rules for
   * the words and the clues. Chat models know the theme but not the craft, so it is spelled out:
   * one answer per clue (the answer-first test), no two answers of a day that mean the same,
   * and a hard word is swapped rather than clued with something complicated.
   */
  function rules(project) {
    var pl = project.plan, g = P.grid(pl.size), a = P.audience(pl.audience), tp = topic(project), easy = a.easy || tp.easy;
    var maxLen = Math.min(g.n, a.maxLen || (easy ? 9 : g.n)), L = [];
    L.push('Rules for the words:');
    L.push('- One English word each, 3 to ' + maxLen + ' letters: no spaces, hyphens, apostrophes, numbers or abbreviations.');
    L.push(maxLen <= 7 ? '- Mix the lengths: about half short (3 or 4 letters) and half longer (5 to ' + maxLen + ').' : '- Mix the lengths: about a third short (3 to 5 letters), a third medium (6 or 7) and a third long (8 or more).');
    L.push(a.loose
      ? '- Plenty of words are clearly about the day’s theme and ' + tp.focus + '. The rest (up to half) can be easy everyday words from home, the holidays, winter or a child’s day. Never an awkward or hard word just to stay on the theme.'
      : '- Every word belongs to the book’s theme and the day’s theme. At least two thirds of them are clearly about ' + tp.focus + '; the rest are everyday words that still fit the day. No filler words that have nothing to do with the theme, and no awkward word forced in just to stay on it.');
    if (a.words || easy) L.push('- Only ' + (a.words || 'easy, well-known words that everyone knows') + '.');
    L.push('- No two words of the same day mean nearly the same thing or could answer the same clue (not GLOVE and MITTEN; not MONEY, CASH and COIN; not SHOP and STORE). When two words are that close, keep one and choose a different word.');
    L.push('- No brand names, no famous people, no song lyrics, no foreign words, nothing sad or scary.');
    L.push(a.reuse ? '- Never the same word twice on one day. A good easy word may come back on another day when it fits that day too.' : '- Never use the same word twice, on the same day or on two days.');
    L.push('Rules for the clues:');
    L.push('- ' + cap(a.clue) + ': a plain definition the solver can work out. No puns, no cryptic tricks, no fill-in-the-blank song lines.');
    L.push('- The answer-first test: ' + (a.reader || 'a solver') + ' who reads the clue without seeing the answer thinks of this exact word. A clue that only makes sense once you know the answer is not good enough. Bad: "Draw this with crayons" (PICTURE: you can draw anything). Good: "A photo or a drawing in a frame" (PICTURE).');
    L.push('- A clue fits only its own answer, never another answer of the same day. "A sweet treat" could be many things; "Red and white sweet shaped like a hook" is one.');
    L.push('- ' + ((a.clueWords || 8) > 8 ? 'Clear beats short: up to ' + a.clueWords + ' simple words.' : 'Under 8 words.') + ' A clue never contains its answer, a word made from it or another answer of the same day. Do not write the letter count.');
    if (a.clueHow) L.push('- ' + a.clueHow);
    L.push('- When a word is hard to clue clearly' + (a.level ? ' for ' + a.level : '') + ', change the word instead of forcing a long or tricky clue.');
    return L;
  }

  function finalCheck(project) {
    var a = P.audience(project.plan.audience);
    return 'Before you reply, read every clue as ' + (a.reader || 'a solver') + ' would, without the answer, and check: does it lead to this one word, could another answer of the same day fit it too, is any word in it too hard? Replace any word that fails rather than forcing a complicated clue.';
  }

  function daysPrompt(project, p) {
    var pl = project.plan, g = P.grid(pl.size), a = P.audience(pl.audience), tp = topic(project), easy = a.easy || tp.easy;
    var todo = p.days.filter(function (d) { return !dayDone(project, d); });
    if (!todo.length) todo = p.days;
    var L = [about(project), ''];
    L.push('Write the words and clues for ' + (todo.length > 1 ? 'these days' : 'this day') + ':');
    todo.forEach(function (day) {
      var d = project.days[day.id] || P.emptyDay(), n = needs(project, day), letter = P.letterOf(project, day);
      var want = n.words || (d.words.length ? 0 : g.ask), parts = [];
      if (d.title.trim()) parts.push('its title is "' + d.title.trim() + '"');
      parts.push(want ? 'exactly ' + want + (d.words.length ? ' more' : '') + ' words' : 'no new words');
      if (want && letter) parts.push('at least ' + Math.min(/[JKQVXZ]/.test(letter) ? 3 : 5, Math.max(2, Math.ceil(want / 6))) + ' of them contain the letter ' + letter);
      L.push('- ' + label(day) + ' (' + day.date + '): ' + parts.join(', ') + '.');
    });
    L.push('');
    L.push('Each day has its own small theme, taken from the book’s theme and following the countdown: ' + tp.arc +
      (pl.bonus ? '; the bonus days are the quiet days after Christmas up to Twelfth Night' : '') + '. Give each day a short, ' + (easy ? 'fun' : 'warm') + ' title of 2 to 4 words that names its theme (for example "' + tp.sample[0] + '").');
    L.push('');
    Array.prototype.push.apply(L, rules(project));
    var extra = [];
    if (todo.some(function (d) { return needs(project, d).story; })) extra.push(easy ? 'STORY: one happy sentence (under 15 words, in words a child can read) that sets the scene for the day' : 'STORY: one warm sentence (under 25 words) that sets the scene for the day');
    if (todo.some(function (d) { return needs(project, d).question; })) extra.push('QUESTION: one friendly question that invites the solver to share a memory or a thought about the day’s theme');
    if (extra.length) { L.push('For every day also write:'); extra.forEach(function (e) { L.push('- ' + e + '.'); }); }
    if (a.reuse) {
      // other days' words may come back, so only a day's own words are off limits for it
      var own = todo.filter(function (day) { return ((project.days[day.id] || {}).words || []).length; }).map(function (day) {
        return label(day) + ': ' + project.days[day.id].words.map(function (x) { return x.w; }).join(', ');
      });
      if (own.length) L.push('- These days already have these words; do not give them again on the same day: ' + own.join('; ') + '.');
    } else {
      var old = [];
      todo.forEach(function (day) { ((project.days[day.id] || {}).words || []).forEach(function (x) { old.push(x.w); }); });
      var other = usedElsewhere(project, todo);
      if (old.length || other.length) L.push('- These words are already in the book; do not use them again: ' + old.concat(other).join(', ') + '.');
    }
    L.push('');
    L.push((a.loose ? 'Most important: every title stays on the book’s theme and most words fit the day’s theme, but an easy word always beats a hard one.'
      : 'Most important: stay on the book’s theme in every title, word and clue.') + ' The theme: ' + tp.guide.replace(/[.\s]+$/, '') + '. Everything must suit ' + a.who + '.');
    L.push('');
    L.push(finalCheck(project));
    L.push('');
    L.push('Reply with one code block in exactly this format, one line per word:');
    L.push('');
    var ex = todo[0];
    L.push(label(ex) + ': The Title');
    if (pl.story) L.push('STORY: The scene-setting sentence.');
    if (pl.memory) L.push('QUESTION: The memory question?');
    L.push('WORDS:');
    L.push(tp.sample[1]);
    L.push(tp.sample[2]);
    if (todo.length > 1) { L.push(''); L.push('Start each day with its own ' + (ex.set === 'bonus' ? 'BONUS DAY' : 'DAY') + ' line, in order.'); }
    return L.join('\n');
  }

  function extrasPrompt(project) {
    var pl = project.plan, wk = P.weeks(project), L = [about(project), ''];
    L.push('Write these short texts for the book:');
    wk.forEach(function (w) {
      L.push('- WEEK ' + w.no + ': a warm 2 or 3 sentence welcome (about 45 words) for "' + w.title + '" (' +
        (w.set === 'bonus' ? 'the bonus puzzles from December 26 to January 6' : P.dateSpan(project, w.from, w.to)) + '): what the season brings in these days and a gentle nudge to keep going.');
    });
    L.push('- CHRISTMAS EVE: a short, happy note for the last page (' + (P.lastDate(project) === 25 ? 'Christmas Day' : 'Christmas Eve') + '), 2 short paragraphs (about 90 words), congratulating the solver on finishing the countdown and wishing them a merry Christmas.');
    L.push('- BACK COVER: a back-cover description of the book, about 70 words, ' + P.audience(pl.audience).blurb + '. Do not mention a number of clues.');
    L.push('');
    L.push('Plain, friendly words for ' + P.audience(pl.audience).who + '. No song lyrics.');
    L.push('');
    L.push('Reply with one code block in exactly this format:');
    L.push('');
    wk.forEach(function (w) { L.push('WEEK ' + w.no + ':'); L.push('The text.'); L.push(''); });
    L.push('CHRISTMAS EVE:');
    L.push('First paragraph.');
    L.push('Second paragraph.');
    L.push('');
    L.push('BACK COVER:');
    L.push('The description.');
    return L.join('\n');
  }

  /*
   * Sends the words and clues the days already have back to the AI with the same rules, for a
   * corrected version of each day in full. Its reply goes in with "Replace", so a bad clue found
   * in the book can be fixed without starting the day over. Titles stay (pictures may be made for them).
   */
  function checkPrompt(project, days) {
    var pl = project.plan, a = P.audience(pl.audience);
    var have = days.filter(function (d) { return ((project.days[d.id] || {}).words || []).length; });
    var L = [about(project), ''];
    L.push('Below ' + (have.length > 1 ? 'are the words and clues of ' + have.length + ' days' : 'are the words and clues of one day') + ' of the book. Check them as a careful crossword editor for ' + a.who + ' and send them back corrected.');
    L.push('');
    Array.prototype.push.apply(L, rules(project));
    L.push('');
    L.push('How to check:');
    L.push('- Read every clue as ' + (a.reader || 'a solver') + ' would, without the answer. Rewrite any clue that fails the answer-first test, that another answer of the same day also fits, or that has a hard word in it.');
    L.push('- When two answers of a day mean nearly the same thing, or a word is too hard to read, spell or clue simply, replace the word with a better one that keeps the rules.');
    L.push('- Keep every good word and clue exactly as it is, and keep about the same number of words in each day.');
    L.push('- Keep each day’s title exactly as it is.' + (pl.story || pl.memory ? ' Keep the STORY and QUESTION lines too, only making them easier to read where needed.' : ''));
    var letters = have.map(function (day) { var l = P.letterOf(project, day); return l ? label(day) + ': ' + l : ''; }).filter(Boolean);
    if (letters.length) L.push('- Each day needs words with its letter of the hidden sentence: keep at least 3 words that contain it (' + letters.join(', ') + ').');
    L.push('');
    L.push(finalCheck(project));
    L.push('');
    L.push('Reply with one code block in the same format as the days below: every day in full, with all its words (the ones you kept and the new ones), one line per word.');
    L.push('');
    have.forEach(function (day, i) {
      var d = project.days[day.id];
      if (i) L.push('');
      L.push(label(day) + ': ' + (d.title.trim() || '(a short title)'));
      if (d.story.trim()) L.push('STORY: ' + d.story.trim());
      if (d.question.trim()) L.push('QUESTION: ' + d.question.trim());
      L.push('WORDS:');
      d.words.forEach(function (x) { L.push(x.w + ' | ' + x.c); });
    });
    return L.join('\n');
  }

  function text(project, p) { return p.kind === 'extras' ? extrasPrompt(project) : daysPrompt(project, p); }

  function title(p) {
    if (p.kind === 'extras') return 'Week pages, Christmas Eve note and back cover';
    var a = p.days[0], z = p.days[p.days.length - 1];
    return (a.set === 'bonus' ? 'Bonus days ' : 'Days ') + a.no + (z !== a ? '–' + z.no : '');
  }

  CX.prompts = { WORDS_PER_PROMPT: WORDS_PER_PROMPT, perPrompt: perPrompt, needs: needs, dayDone: dayDone, list: list, next: next, text: text, checkText: checkPrompt, title: title, label: label, extrasWanted: extrasWanted, isDone: isDone };
})(typeof window !== 'undefined' ? window : globalThis);
