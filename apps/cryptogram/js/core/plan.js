/*
 * The book plan: how many puzzles, who solves them, what the hidden sentences are about, the level,
 * the code (letters or numbers) and how the name under a quote is shown. A puzzle is one sentence
 * (a quote, a verse, a fact or a joke) written in a secret code: every letter is swapped for another
 * letter (or a number). A puzzle's id never changes ('p1', 'p2'...), so what was written stays with it.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  // by: what the BY line holds ('person', 'ref', 'origin' or '' for none); guide tells the AI what
  // to write, topics give it room to vary, sample shows the reply format (never printed).
  // library: which quotes of the app's own library fit this theme (null: none).
  var THEMES = [
    { id: 'quotes', title: 'Famous quotes', sub: 'Wisdom and wit of famous people from history', by: 'person', library: 'all',
      guide: 'famous quotes by well-known people from history: writers, thinkers, leaders, scientists and artists',
      topics: 'life, wisdom, friendship, work, courage, kindness, happiness, time, books, nature, success, humor, family, hope, learning',
      sample: { text: 'Well done is better than well said.', by: 'Benjamin Franklin' } },
    { id: 'inspire', title: 'Inspiring quotes', sub: 'Hope, courage and kindness', by: 'person', library: 'inspire',
      guide: 'uplifting quotes about hope, courage, kindness, gratitude and never giving up, by well-known people from history',
      topics: 'hope, courage, kindness, gratitude, perseverance, faith in yourself, new beginnings, friendship, joy, patience',
      sample: { text: 'Courage is resistance to fear, mastery of fear, not absence of fear.', by: 'Mark Twain' } },
    { id: 'funny', title: 'Funny quotes', sub: 'Witty lines that make you smile', by: 'person', library: null,
      guide: 'funny and witty quotes by well-known humorists and writers from history',
      topics: 'age, money, work, marriage, food, exercise, advice, politics kept gentle, books, weather, getting up in the morning',
      sample: { text: 'Never put off till tomorrow what may be done day after tomorrow just as well.', by: 'Mark Twain' } },
    { id: 'proverbs', title: 'Proverbs and sayings', sub: 'Old wisdom from around the world', by: 'origin', library: 'proverbs',
      guide: 'proverbs and old sayings from around the world',
      topics: 'proverbs from Ireland, China, Africa, Japan, Italy, Russia, India, Spain, the Arab world, Native American sayings, old English sayings',
      sample: { text: 'A good laugh and a long sleep are the best cures in the doctor\'s book.', by: 'Irish proverb' } },
    { id: 'bible', title: 'Bible verses', sub: 'King James Version, with the reference', by: 'ref', library: null,
      guide: 'well-known Bible verses, word for word from the King James Version (KJV)',
      topics: 'Psalms, Proverbs, the Gospels, the letters of Paul, Genesis, Isaiah, faith, love, hope, comfort, praise, wisdom',
      sample: { text: 'This is the day which the LORD hath made; we will rejoice and be glad in it.', by: 'Psalm 118:24' } },
    { id: 'facts', title: 'Fun facts', sub: 'Amazing true facts about the world', by: '', library: null,
      guide: 'surprising, true and cheerful fun facts',
      topics: 'animals, the human body, space, the ocean, food, history, inventions, language, geography, weather, plants, record breakers',
      sample: { text: 'A group of flamingos is called a flamboyance, and they can only eat with their heads upside down.', by: '' } },
    { id: 'jokes', title: 'Jokes and riddles', sub: 'A question and its punchline', by: '', library: null,
      guide: 'clean, family-friendly jokes and riddles: the question and its answer together in one text',
      topics: 'animals, food, school, sports, the weather, jobs, music, space, holidays, wordplay and puns',
      sample: { text: 'Why did the scarecrow win an award? Because he was outstanding in his field.', by: '' } },
    { id: 'seasons', title: 'Holidays and seasons', sub: 'Christmas, summer, autumn and more', by: 'person', library: null,
      guide: 'quotes and cheerful lines about the holidays and the seasons of the year, by well-known people from history',
      topics: 'Christmas, Thanksgiving, New Year, Easter, spring, summer, autumn, winter, snow, gardens, family gatherings',
      sample: { text: 'Heap on more wood! The wind is chill; but let it whistle as it will, we\'ll keep our Christmas merry still.', by: 'Walter Scott' } },
    { id: 'kids', title: 'For kids', sub: 'Fun facts, jokes and gentle sayings', by: '', library: null, kid: true,
      guide: 'fun facts, jokes and cheerful sayings that children love',
      topics: 'animals, dinosaurs, space, the ocean, food, sports, school, funny jokes, the human body, weather, inventions',
      sample: { text: 'An octopus has three hearts, nine brains and blue blood.', by: '' } },
    { id: 'custom', title: 'My own theme', sub: 'Type it in the box below', by: 'person', library: null, guide: '' }
  ];

  // How the BY line is printed: coded with the sentence, shown plainly under it, or only in the solutions.
  var ATTRIBUTION = [
    { id: 'code', label: 'In code with the quote', help: 'The name is part of the puzzle, after a dash. Solving it is part of the fun.' },
    { id: 'plain', label: 'Shown under the puzzle', help: 'The name is printed plainly under the puzzle: a clue that helps.' },
    { id: 'back', label: 'Only in the solutions', help: 'The puzzle shows the sentence only.' }
  ];

  var CODES = [
    { id: 'letters', label: 'Letters (A to Z)', help: 'Every letter stands for another letter. The classic cryptogram.' },
    { id: 'numbers', label: 'Numbers (1 to 26)', help: 'Every letter is a number. Also called a number code or codeword quote.' }
  ];

  // reader: who the sentences are tested on; blurb: the back-cover tone.
  var AUDIENCES = [
    { id: 'adults', label: 'Adults & seniors', who: 'adults and seniors who enjoy a thinking word puzzle', reader: 'a keen puzzle solver', blurb: 'warm and inviting', extraGiven: 0, defaults: { level: 'mixed' } },
    { id: 'family', label: 'The whole family', who: 'families solving together, from teenagers to grandparents', reader: 'a teenager', blurb: 'warm and inviting', extraGiven: 0,
      words: 'words everyone in the family knows, from a teenager to a grandparent', defaults: { level: 'mixed' } },
    { id: 'kids', label: 'Kids (8 to 12)', who: 'children aged 8 to 12', reader: 'a 9-year-old', kid: true, blurb: 'fun and inviting, written for the parents and grandparents who buy it', extraGiven: 1,
      words: 'words a typical 9-year-old can read and spell without help', defaults: { level: 'easy' } }
  ];

  // given: letters printed for the solver at the start; len: the length asked for, in characters
  // with spaces (the app lowers it to what fits the page).
  var LEVELS = [
    { id: 'easy', label: 'Easy', stars: 1, section: 'Warm-Up', given: 3, len: [40, 80], help: 'Short sentences, and three letters are given to start you off.' },
    { id: 'medium', label: 'Medium', stars: 2, section: 'Thinking Cap', given: 2, len: [70, 115], help: 'Longer sentences, with two letters given.' },
    { id: 'hard', label: 'Hard', stars: 3, section: 'Brain Benders', given: 0, len: [100, 150], help: 'The longest sentences, and no letters given. Just you and the code.' }
  ];

  var COUNTS = [50, 100, 150, 200, 300], MIN_COUNT = 10, MAX_COUNT = 500;

  // Worked examples for the How to Solve page (never in a prompt): the book uses one that is not in it.
  var EXAMPLES = [
    { text: 'Little by little, one travels far.', by: 'Spanish proverb' },
    { text: 'Where there is love there is life.', by: 'Mahatma Gandhi' },
    { text: 'The best way out is always through.', by: 'Robert Frost' },
    { text: 'Hope is the thing with feathers.', by: 'Emily Dickinson' }
  ];

  function setAudience(plan, id) {
    var a = audience(id);
    plan.audience = a.id;
    Object.assign(plan, a.defaults);
    if (a.kid && theme(plan.theme).by === 'person' && plan.theme !== 'custom') plan.theme = 'kids';
    if (!a.kid && plan.theme === 'kids') plan.theme = 'quotes';
  }

  // Only 16 pt and more is sold as large print (KDP's large print size).
  function largePrint(project) { return project.book.print === 'xl'; }

  function theme(id) { return THEMES.filter(function (t) { return t.id === id; })[0] || THEMES[0]; }
  function audience(id) { return AUDIENCES.filter(function (a) { return a.id === id; })[0] || AUDIENCES[0]; }
  function level(id) { return LEVELS.filter(function (l) { return l.id === id; })[0] || LEVELS[1]; }
  function attribution(id) { return ATTRIBUTION.filter(function (a) { return a.id === id; })[0] || ATTRIBUTION[0]; }
  function code(id) { return CODES.filter(function (c) { return c.id === id; })[0] || CODES[0]; }
  function validCount(n) { n = Math.round(+n); return n >= MIN_COUNT && n <= MAX_COUNT ? n : 0; }

  // What the BY line is for this book: 'person', 'ref', 'origin' or '' (none).
  function byKind(project) { return theme(project.plan.theme).by; }

  // The puzzles of the book in order: [{ id, no (1-based), index (0-based) }].
  function puzzles(project) {
    var out = [];
    for (var i = 1; i <= project.plan.count; i++) out.push({ id: 'p' + i, no: i, index: i - 1 });
    return out;
  }

  // A puzzle's level: the book's one, or in a mixed book the first 30% easy, the last 30% hard.
  function levelOf(project, pz) {
    var l = project.plan.level;
    if (l !== 'mixed') return level(l).id;
    var part = pz.index / Math.max(1, project.plan.count);
    return part < 0.3 ? 'easy' : part < 0.7 ? 'medium' : 'hard';
  }

  // Letters given at the start of a puzzle of this level.
  function givenCount(project, lvl) { return level(lvl).given + (lvl === 'hard' ? 0 : audience(project.plan.audience).extraGiven); }

  function titleIdeas(project) {
    var a = project.plan.audience, t = project.plan.theme, large = largePrint(project);
    var who = a === 'kids' ? 'Kids' : a === 'family' ? 'the Whole Family' : 'Adults';
    var ideas = [];
    if (t === 'bible') ideas.push('Bible Verse Cryptograms');
    else if (t === 'funny') ideas.push('Funny Cryptograms');
    else if (t === 'facts') ideas.push('Fun Fact Cryptograms');
    else if (t === 'jokes') ideas.push('Cryptogram Jokes and Riddles');
    else if (t === 'inspire') ideas.push('Inspiring Cryptograms');
    else if (t === 'proverbs') ideas.push('Proverb Cryptograms');
    ideas.push((large ? 'Large Print ' : '') + 'Cryptograms for ' + who, 'Cryptogram Puzzle Book', 'Crack the Code: Cryptogram Puzzles');
    return ideas.slice(0, 4);
  }

  // The number of puzzles the book may promise: what the PDF prints. planned: the number chosen,
  // for the preview while the book is still being written.
  function bookCount(project, planned) {
    return (!planned && CX.puzzles.printed(project).length) || project.plan.count;
  }

  // A text that promises "100 puzzles" says what the PDF prints when a puzzle had to stay out.
  function countText(project, s, planned) {
    var from = project.plan.count, to = bookCount(project, planned);
    if (from === to) return s;
    return String(s).replace(new RegExp('\\b' + from + '\\b(?=(?:[\\s-]+[A-Za-z]+){0,4}[\\s-]+(?:puzzles?|cryptograms?|quotes?|codes?)\\b)', 'gi'), String(to));
  }

  var WHAT = { quotes: 'Famous Quotes', inspire: 'Inspiring Quotes', funny: 'Funny Quotes', proverbs: 'Proverbs and Sayings', bible: 'Bible Verses', facts: 'Fun Facts', jokes: 'Jokes and Riddles', seasons: 'Holiday Quotes', kids: 'Fun Facts and Jokes', custom: 'Hidden Messages' };
  function subtitleIdea(project, planned) {
    var large = largePrint(project), n = bookCount(project, planned), what = WHAT[project.plan.theme] || 'Hidden Messages';
    return n + ' ' + (large ? 'Large Print ' : '') + 'Cryptogram Puzzles of ' + what + ', with Hints and Solutions';
  }
  function bookTitle(project, planned) { return countText(project, (project.book.title || '').trim() || titleIdeas(project)[0], planned); }
  function bookSubtitle(project, planned) {
    var own = (project.book.subtitle || '').trim();
    return own ? countText(project, own, planned) : subtitleIdea(project, planned);
  }

  function newProject() {
    return {
      v: 1,
      app: 'cryptogram',
      seed: CX.util.randomSeed(),
      book: { title: '', subtitle: '', author: '', trim: '8.5x11', paper: 'white', print: 'large' },
      plan: { count: 100, theme: 'quotes', customTheme: '', audience: 'adults', level: 'mixed', code: 'letters', by: 'code', perPage: 2, tracker: true, stars: true, hints: true, log: true },
      puzzles: {},           // puzzle id -> { text, by, v (a new code when it changes) }
      ai: { welcome: [], closing: [], blurb: '' },
      cover: { design: 'cipher', palette: '' }
    };
  }

  function emptyPuzzle() { return { text: '', by: '', v: 0 }; }
  function puzzle(project, id) { return project.puzzles[id] || (project.puzzles[id] = emptyPuzzle()); }

  // Fills in anything an older or hand-edited project file is missing.
  function normalize(p) {
    var d = newProject();
    p = p && typeof p === 'object' ? p : {};
    var out = { v: 1, app: 'cryptogram', seed: typeof p.seed === 'string' && p.seed ? p.seed : d.seed };
    ['book', 'plan', 'ai', 'cover'].forEach(function (k) {
      out[k] = Object.assign({}, d[k], p[k] && typeof p[k] === 'object' ? p[k] : {});
    });
    var pl = out.plan, b = out.book;
    pl.count = validCount(pl.count) || 100;
    pl.perPage = Math.max(1, Math.min(4, Math.round(+pl.perPage) || 1));
    if (pl.level !== 'mixed') pl.level = level(pl.level).id;
    pl.audience = audience(pl.audience).id;
    pl.theme = theme(pl.theme).id;
    pl.code = code(pl.code).id;
    pl.by = attribution(pl.by).id;
    ['tracker', 'stars', 'hints', 'log'].forEach(function (k) { pl[k] = !!pl[k]; });
    if (typeof pl.customTheme !== 'string') pl.customTheme = '';
    b.trim = CX.kdp.trim(b.trim).id;
    b.paper = CX.kdp.paper(b.paper).id;
    if (['regular', 'large', 'xl'].indexOf(b.print) < 0) b.print = d.book.print;
    ['title', 'subtitle', 'author'].forEach(function (k) { if (typeof b[k] !== 'string') b[k] = ''; });
    out.puzzles = {};
    if (p.puzzles && typeof p.puzzles === 'object') {
      Object.keys(p.puzzles).forEach(function (id) {
        if (!/^p\d{1,3}$/.test(id)) return;
        var s = p.puzzles[id] || {}, e = emptyPuzzle();
        e.text = typeof s.text === 'string' ? s.text.slice(0, 1200) : '';
        e.by = typeof s.by === 'string' ? s.by.slice(0, 120) : '';
        e.v = Math.max(0, Math.round(+s.v) || 0);
        if (e.text.trim() || e.by.trim()) out.puzzles[id] = e;
      });
    }
    ['welcome', 'closing'].forEach(function (k) { if (!Array.isArray(out.ai[k])) out.ai[k] = []; out.ai[k] = out.ai[k].filter(function (x) { return typeof x === 'string'; }); });
    if (typeof out.ai.blurb !== 'string') out.ai.blurb = '';
    if (typeof out.cover.design !== 'string') out.cover.design = d.cover.design;
    if (typeof out.cover.palette !== 'string') out.cover.palette = '';
    return out;
  }

  /*
   * The settings file of the first version of this app (Cryptogram Prints 1.0): its book details and
   * settings become a new project. Its puzzles came from the library, so they are filled from it again.
   */
  function fromOldConfig(c) {
    var p = newProject(), bk = c.book || {}, pz = c.puzzles || {}, fm = c.format || {};
    p.book.title = String(bk.title || '');
    p.book.subtitle = String(bk.subtitle || '');
    p.book.author = String(bk.author || bk.publisher || '');
    if (fm.paper === 'cream') p.book.paper = 'cream';
    if (fm.largePrint) { p.book.print = 'xl'; p.plan.perPage = 1; }
    p.plan.count = validCount(pz.count) || 100;
    if (!fm.largePrint) p.plan.perPage = Math.max(1, Math.min(4, Math.round(+pz.perPage) || 2));
    if (pz.numericVariant) p.plan.code = 'numbers';
    return p;
  }
  function isOldConfig(c) { return !!(c && c.format && c.puzzles && typeof c.puzzles.count !== 'undefined' && !c.plan); }

  CX.plan = {
    THEMES: THEMES, AUDIENCES: AUDIENCES, LEVELS: LEVELS, ATTRIBUTION: ATTRIBUTION, CODES: CODES, COUNTS: COUNTS, MIN_COUNT: MIN_COUNT, MAX_COUNT: MAX_COUNT, EXAMPLES: EXAMPLES,
    largePrint: largePrint, theme: theme, audience: audience, setAudience: setAudience, level: level, attribution: attribution, code: code, validCount: validCount, byKind: byKind,
    puzzles: puzzles, levelOf: levelOf, givenCount: givenCount, titleIdeas: titleIdeas, subtitleIdea: subtitleIdea, bookTitle: bookTitle, bookSubtitle: bookSubtitle, bookCount: bookCount, countText: countText,
    newProject: newProject, normalize: normalize, puzzle: puzzle, emptyPuzzle: emptyPuzzle, fromOldConfig: fromOldConfig, isOldConfig: isOldConfig
  };
})(typeof window !== 'undefined' ? window : globalThis);
