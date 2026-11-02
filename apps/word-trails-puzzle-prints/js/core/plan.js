/*
 * The book plan: how many puzzles, who solves them, the theme the AI writes for, the grid size and
 * the level. A puzzle's id never changes ('p1', 'p2'...), so words already written stay with it.
 * In the book the edge-to-edge word is the "span word"; the app and the AI use the same name.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  // guide tells the AI what the puzzles are about, topics gives it room to vary, sample is the
  // example in the reply format (so the example never pulls a book off its own theme). kid is the
  // same theme told for children, with words short enough for the youngest readers.
  var THEMES = [
    { id: 'mix', title: 'Everyday mix', sub: 'Home, food, nature, jobs, hobbies, travel', guide: 'a wide mix of everyday subjects',
      topics: 'around the home, food and cooking, animals, nature, weather, jobs, hobbies, sports, travel, music, school, tools, clothes, games, shops, the seasons',
      sample: { title: 'Snug as a Bug', theme: 'Things you find on a bed', span: 'BEDDING', words: ['PILLOW', 'SHEET', 'BLANKET', 'QUILT', 'MATTRESS', 'DUVET', 'COVERS', 'THROW', 'BOLSTER', 'CUSHION'] },
      kid: { guide: 'a wide mix of things children see and do every day',
        topics: 'home, favorite foods, pets, farm animals, the park, the beach, toys and games, sports, school, clothes, colors, the seasons',
        sample: { title: 'Splish Splash', theme: 'Things you splash with in the tub', span: 'BATHTIME', words: ['SOAP', 'DUCK', 'TOYS', 'FOAM', 'CUP', 'TOWEL', 'WATER', 'SPONGE', 'BUBBLES', 'SHAMPOO'] } } },
    { id: 'nostalgia', title: 'Remember when', sub: 'Everyday life from the 1950s to the 1980s', guide: 'nostalgia: everyday life in the 1950s to 1980s (plain words only, no brand names)',
      topics: 'old toys, school days, soda fountains, drive-ins, record players, old kitchens, family road trips, the corner store, playground games, fashions and dances of the time',
      sample: { title: 'Dropping the Needle', theme: 'Things around a record player', span: 'TURNTABLE', words: ['VINYL', 'NEEDLE', 'ALBUM', 'SPEAKER', 'SLEEVE', 'STYLUS', 'RECORD', 'GROOVE', 'CABINET', 'DIAL'] },
      kid: { guide: 'what life was like when grandparents were young (plain words only, no brand names)',
        topics: 'old toys, playground games, school long ago, letters and stamps, record players, the corner store, family road trips, old kitchens, drive-in movies',
        sample: { title: 'When Grandma Was Little', theme: 'What children played with long ago', span: 'OLD TOYS', words: ['KITE', 'DOLL', 'SLED', 'JACKS', 'WAGON', 'ROBOT', 'BLOCKS', 'PUPPET', 'MARBLES', 'CRAYONS'] } } },
    { id: 'nature', title: 'Nature and animals', sub: 'Birds, gardens, forests, seas', guide: 'nature and animals',
      topics: 'garden birds, trees, wildflowers, forest animals, sea creatures, insects, rivers and lakes, mountains, weather, farm animals, the seasons, national parks',
      sample: { title: 'Up With the Lark', theme: 'Birds you might hear at dawn', span: 'SONGBIRDS', words: ['ROBIN', 'WREN', 'THRUSH', 'SPARROW', 'FINCH', 'WARBLER', 'CARDINAL', 'BLACKBIRD', 'CHICKADEE', 'NUTHATCH'] },
      kid: { guide: 'animals and the outdoors',
        topics: 'garden bugs, forest animals, sea animals, birds, trees, flowers, ponds and rivers, farm animals, mountains, the seasons',
        sample: { title: 'Ribbit and Splash', theme: 'Animals that live near water', span: 'POND LIFE', words: ['FROG', 'DUCK', 'FISH', 'SWAN', 'SNAIL', 'OTTER', 'TURTLE', 'BEETLE', 'TADPOLE', 'MINNOWS'] } } },
    { id: 'food', title: 'Food and kitchen', sub: 'Baking, cooking, world foods', guide: 'food, cooking and the kitchen',
      topics: 'baking, breakfast, herbs and spices, fruit, vegetables, kitchen tools, cheese, soups, desserts, street food, dishes from around the world, picnics',
      sample: { title: 'Rise and Shine', theme: 'Things in a bakery', span: 'BAKESHOP', words: ['BAGEL', 'MUFFIN', 'CROISSANT', 'SCONE', 'DONUT', 'LOAF', 'PRETZEL', 'BISCUIT', 'ECLAIR', 'CUPCAKE'] },
      kid: { guide: 'foods children know and love',
        topics: 'breakfast, fruit, vegetables, pizza night, birthday treats, picnics, snacks, baking cookies, ice cream, foods from around the world',
        sample: { title: 'Midday Munch', theme: 'What you might eat at school', span: 'LUNCHBOX', words: ['PEAR', 'SNACK', 'APPLE', 'JUICE', 'GRAPES', 'BANANA', 'COOKIE', 'CHEESE', 'CRACKERS', 'SANDWICH'] } } },
    { id: 'travel', title: 'Travel and places', sub: 'Countries, cities, landmarks', guide: 'travel and places around the world',
      topics: 'packing a suitcase, airports, trains, famous landmarks, islands, capital cities, rivers of the world, road trips, camping, the seaside, national dishes',
      sample: { title: 'Check Your Bags', theme: 'Things at an airport', span: 'DEPARTURES', words: ['RUNWAY', 'TICKET', 'GATE', 'LUGGAGE', 'PASSPORT', 'TERMINAL', 'PILOT', 'CUSTOMS', 'BOARDING', 'CAROUSEL'] },
      kid: { guide: 'trips and places around the world',
        topics: 'packing a bag, trains, planes, boats, camping, the beach, the zoo, big cities, famous landmarks, road trips, maps',
        sample: { title: 'Ready to Go', theme: 'What you pack for a trip', span: 'VACATION', words: ['BAG', 'MAP', 'BOOK', 'SOCKS', 'SHOES', 'TOWEL', 'CAMERA', 'TICKET', 'SNACKS', 'SUITCASE'] } } },
    { id: 'culture', title: 'Movies, music and books', sub: 'Genres, instruments, stories', guide: 'movies, music, books and the arts (general words, no song lyrics or quotes)',
      topics: 'musical instruments, film genres, parts of a theater, fairy tale characters, dance styles, painting, parts of a book, the orchestra, museums, photography',
      sample: { title: 'Strike Up the Band', theme: 'Instruments in an orchestra', span: 'SYMPHONY', words: ['VIOLIN', 'CELLO', 'FLUTE', 'OBOE', 'TRUMPET', 'CLARINET', 'TIMPANI', 'BASSOON', 'TROMBONE', 'PICCOLO'] },
      kid: { guide: 'music, stories, movies and art (general words, no song lyrics or quotes)',
        topics: 'instruments children know, fairy tale characters, parts of a book, drawing and painting, dancing, puppet shows, going to the movies, singing',
        sample: { title: 'Toot and Strum', theme: 'What people play to make music', span: 'THE BAND', words: ['DRUM', 'BELL', 'HARP', 'HORN', 'TUBA', 'FLUTE', 'PIANO', 'GUITAR', 'VIOLIN', 'TRUMPET'] } } },
    { id: 'faith', title: 'Bible and faith', sub: 'Stories, places and church life', guide: 'the Bible and Christian life',
      topics: 'the books of the Bible, the disciples, Old Testament stories, places in the Holy Land, church life, hymns, parables, Christmas and Easter, fruits of the Spirit',
      sample: { title: 'All Aboard', theme: 'Things in the story of Noah', span: 'THEARK', words: ['DOVE', 'FLOOD', 'RAINBOW', 'CUBIT', 'ANIMALS', 'OLIVE', 'RAVEN', 'SHEM', 'CYPRESS', 'COVENANT'] },
      kid: { guide: 'favorite Bible stories and Christian life for children',
        topics: 'Noah and the animals, baby Moses, Jonah and the big fish, the Christmas story, Easter joy, Jesus and his friends, the parables, church and Sunday school, prayers, kindness',
        sample: { title: 'All Aboard', theme: 'Things in the story of Noah', span: 'NOAHS ARK', words: ['DOVE', 'BOAT', 'WOOD', 'RAVEN', 'OLIVE', 'LIONS', 'SHEEP', 'CAMELS', 'RAINBOW', 'ANIMALS'] } } },
    { id: 'seasons', title: 'Holidays and seasons', sub: 'Christmas, summer, harvest and more', guide: 'holidays and the seasons of the year',
      topics: 'Christmas, Thanksgiving, Halloween, Easter, New Year, Valentine’s Day, summer at the beach, autumn leaves, spring gardens, winter snow, birthdays, weddings',
      sample: { title: 'Falling for You', theme: 'Signs of autumn', span: 'HARVEST', words: ['PUMPKIN', 'ACORN', 'MAPLE', 'CIDER', 'SCARECROW', 'LEAVES', 'SQUASH', 'SWEATER', 'ORCHARD', 'HAYRIDE'] },
      kid: { guide: 'holidays and the seasons of the year',
        topics: 'Christmas, Thanksgiving, Halloween costumes and candy, Easter, New Year, birthdays, summer at the beach, fall leaves, spring gardens, snow days',
        sample: { title: 'Cool and Crunchy', theme: 'Signs that summer is over', span: 'FALL FUN', words: ['PIE', 'HAY', 'RAKE', 'ACORN', 'APPLE', 'BOOTS', 'LEAVES', 'SQUASH', 'PUMPKIN', 'SWEATER'] } } },
    { id: 'kids', title: 'For kids', sub: 'Pets, school, playground, space', guide: 'things children know and love', easy: true,
      topics: 'pets, the playground, school, zoo animals, dinosaurs, space, toys, the beach, sports, colors, fruit, superheroes without names, birthday parties',
      sample: { title: 'Back to School', theme: 'Things in a school bag', span: 'BACKPACK', words: ['PENCIL', 'RULER', 'PAPER', 'LUNCH', 'CRAYON', 'ERASER', 'NOTEBOOK', 'GLUE', 'FOLDER', 'MARKER'] } },
    { id: 'custom', title: 'My own theme', sub: 'Type it in the box below', guide: '' }
  ];

  // minLen is the shortest word, maxLen caps the longest; words is an extra rule for the answers,
  // blurb the back-cover tone, reader who the title is tested on and defaults what picking it sets.
  // kid books also get their own title rule, a cap on the span word and the kid version of a theme.
  var AUDIENCES = [
    { id: 'adults', label: 'Adults & seniors', who: 'adults and seniors who enjoy a thinking word puzzle', minLen: 4, reader: 'a keen word-puzzle solver', blurb: 'warm and inviting', defaults: { size: '6x8', level: 'mixed' } },
    { id: 'family', label: 'The whole family', who: 'families solving together, from teenagers to grandparents', minLen: 4, reader: 'a teenager', blurb: 'warm and inviting',
      words: 'words everyone in the family knows, from a teenager to a grandparent', defaults: { size: '6x8', level: 'mixed' } },
    { id: 'kids', label: 'Kids (8 to 12)', who: 'children aged 8 to 12', minLen: 3, maxLen: 8, spanMax: 10, kid: true, reader: 'a 9-year-old', blurb: 'fun and inviting, written for the parents and grandparents who buy it',
      title: 'a fun hint of 2 to 5 easy words that a 9-year-old gets at once, like a rhyme, a sound word or a simple joke',
      words: 'words a typical 9-year-old uses at home or at school and can read and spell without help. If mostly grown-ups or specialists use a word, leave it out (not COLANDER, PICCOLO, CUSTOMS)', defaults: { size: '6x8', level: 'easy' } },
    { id: 'young', label: 'Young kids (6 to 8)', who: 'children aged 6 to 8 who are just starting to read on their own', minLen: 3, maxLen: 6, spanMax: 8, kid: true, perPrompt: 6, reader: 'a 6-year-old', blurb: 'fun and inviting, written for the parents and grandparents who buy it',
      title: 'a short, plain clue of 2 to 4 very easy words that a 6-year-old can read alone. It may simply say what the puzzle is about',
      words: 'very easy words from a first or second grade reading list, which a child aged 6 to 8 can read and spell. Think about spelling, not just whether a child knows the word (not ICICLE, PUCK, JERSEY)', defaults: { size: '5x6', level: 'easy' } }
  ];

  // min and max: how many theme words a grid uses (the span word comes on top). ask: how many the AI
  // writes, more than the grid holds, so the app can find a set whose letters add up exactly.
  var GRID_SIZES = [
    { id: '5x6', cols: 5, rows: 6, label: '5 × 6', hint: '30 letters: quick, good for young kids', min: 3, max: 6, ask: 12, spanMax: 11, maxLen: 8 },
    { id: '6x8', cols: 6, rows: 8, label: '6 × 8', hint: '48 letters: the classic size', min: 5, max: 8, ask: 14, spanMax: 14, maxLen: 10 },
    { id: '7x9', cols: 7, rows: 9, label: '7 × 9', hint: '63 letters: a longer sitting', min: 6, max: 10, ask: 16, spanMax: 15, maxLen: 11 },
    { id: '8x10', cols: 8, rows: 10, label: '8 × 10', hint: '80 letters: for experts', min: 8, max: 13, ask: 20, spanMax: 16, maxLen: 12 }
  ];

  // Stars on the page and what the page prints to help: see layout.js.
  var LEVELS = [
    { id: 'easy', label: 'Easy', stars: 1, section: 'Warm-Up', help: 'Gentle trails. The page shows each word’s first letter and length.' },
    { id: 'medium', label: 'Medium', stars: 2, section: 'Getting Twisty', help: 'Trails turn more often. The page shows each word’s length.' },
    { id: 'hard', label: 'Hard', stars: 3, section: 'Expert Trails', help: 'Trails twist at every chance. The page only says how many words to find.' }
  ];

  var COUNTS = [50, 75, 100, 150, 200], MIN_COUNT = 10, MAX_COUNT = 300;

  // Who solves the book: also what fits them. A theme someone chose on purpose stays.
  function setAudience(plan, id) {
    var a = audience(id);
    plan.audience = a.id;
    Object.assign(plan, a.defaults);
    if (a.kid && plan.theme === 'mix') plan.theme = 'kids';
    if (!a.kid && plan.theme === 'kids') plan.theme = 'mix';
  }

  function theme(id) { return THEMES.filter(function (t) { return t.id === id; })[0] || THEMES[0]; }
  function audience(id) { return AUDIENCES.filter(function (a) { return a.id === id; })[0] || AUDIENCES[0]; }
  function grid(id) { return GRID_SIZES.filter(function (g) { return g.id === id; })[0] || GRID_SIZES[1]; }
  function level(id) { return LEVELS.filter(function (l) { return l.id === id; })[0] || LEVELS[1]; }

  function letters(s) { return String(s || '').toUpperCase().replace(/[^A-Z]/g, ''); }
  function validCount(n) { n = Math.round(+n); return n >= MIN_COUNT && n <= MAX_COUNT ? n : 0; }

  // Word and span lengths the grid and the audience allow.
  function limits(project) {
    var g = grid(project.plan.size), a = audience(project.plan.audience), cells = g.cols * g.rows;
    var maxLen = Math.min(g.maxLen, a.maxLen || 99);
    return {
      cols: g.cols, rows: g.rows, cells: cells, min: g.min, max: g.max, ask: g.ask,
      minLen: a.minLen, maxLen: maxLen,
      spanMin: Math.min(g.cols, g.rows),
      // a big grid and short words leave a kid's span word more letters to cover, so its cap gives way there
      spanMax: Math.min(g.spanMax, Math.max(a.spanMax || 99, cells - g.max * (maxLen - 2)))
    };
  }

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

  function titleIdeas(project) {
    var a = project.plan.audience, n = project.plan.name.trim() || 'Word Trails', t = project.plan.theme;
    var who = a === 'kids' || a === 'young' ? 'Kids' : a === 'family' ? 'the Whole Family' : 'Adults';
    var ideas = [n + ' Puzzle Book for ' + who, 'The Big Book of ' + n, 'Theme Trails: A New Kind of Word Search'];
    if (t === 'nostalgia') ideas.unshift('Remember When ' + n);
    if (t === 'faith') ideas.unshift('Bible ' + n);
    if (t === 'kids') ideas.unshift('My First ' + n);
    return ideas.slice(0, 4);
  }

  function subtitleIdea(project) {
    var large = project.book.print !== 'regular', n = project.plan.count;
    return n + ' ' + (large ? 'Large Print ' : '') + 'Themed Word Search Puzzles Where Every Letter Counts, with Hints and Solutions';
  }

  function bookTitle(project) { return (project.book.title || '').trim() || titleIdeas(project)[0]; }
  function bookSubtitle(project) { return (project.book.subtitle || '').trim() || subtitleIdea(project); }

  function newProject() {
    return {
      v: 1,
      seed: CX.util.randomSeed(),
      book: { title: '', subtitle: '', author: '', trim: '8.5x11', paper: 'white', print: 'large' },
      plan: { count: 100, theme: 'mix', customTheme: '', audience: 'adults', size: '6x8', level: 'mixed', perPage: 1, stars: true, hints: true, log: true, name: 'Word Trails' },
      puzzles: {},           // puzzle id -> { title, theme, span, words: [], v (grid variant) }
      ai: { welcome: [], closing: [], blurb: '' },
      cover: { design: 'bubbles', palette: '' }
    };
  }

  function emptyPuzzle() { return { title: '', theme: '', span: '', words: [], v: 0 }; }
  function puzzle(project, id) { return project.puzzles[id] || (project.puzzles[id] = emptyPuzzle()); }

  // Fills in anything an older or hand-edited project file is missing.
  function normalize(p) {
    var d = newProject();
    p = p && typeof p === 'object' ? p : {};
    var out = { v: 1, seed: typeof p.seed === 'string' && p.seed ? p.seed : d.seed };
    ['book', 'plan', 'ai', 'cover'].forEach(function (k) {
      out[k] = Object.assign({}, d[k], p[k] && typeof p[k] === 'object' ? p[k] : {});
    });
    var pl = out.plan;
    pl.count = validCount(pl.count) || 100;
    pl.size = grid(pl.size).id;
    pl.perPage = +pl.perPage === 2 ? 2 : 1;
    if (pl.level !== 'mixed') pl.level = level(pl.level).id;
    ['stars', 'hints', 'log'].forEach(function (k) { pl[k] = !!pl[k]; });
    ['customTheme', 'name'].forEach(function (k) { if (typeof pl[k] !== 'string') pl[k] = d.plan[k]; });
    out.puzzles = {};
    if (p.puzzles && typeof p.puzzles === 'object') {
      Object.keys(p.puzzles).forEach(function (id) {
        if (!/^p\d{1,3}$/.test(id)) return;
        var s = p.puzzles[id] || {}, e = emptyPuzzle();
        ['title', 'theme', 'span'].forEach(function (k) { e[k] = typeof s[k] === 'string' ? s[k] : ''; });
        e.words = Array.isArray(s.words) ? s.words.filter(function (w) { return typeof w === 'string'; }).map(letters).filter(Boolean) : [];
        e.v = Math.max(0, Math.round(+s.v) || 0);
        out.puzzles[id] = e;
      });
    }
    ['welcome', 'closing'].forEach(function (k) { if (!Array.isArray(out.ai[k])) out.ai[k] = []; });
    if (typeof out.ai.blurb !== 'string') out.ai.blurb = '';
    return out;
  }

  CX.plan = {
    THEMES: THEMES, AUDIENCES: AUDIENCES, GRID_SIZES: GRID_SIZES, LEVELS: LEVELS, COUNTS: COUNTS, MIN_COUNT: MIN_COUNT, MAX_COUNT: MAX_COUNT,
    theme: theme, audience: audience, setAudience: setAudience, grid: grid, level: level, letters: letters, validCount: validCount, limits: limits,
    puzzles: puzzles, levelOf: levelOf, titleIdeas: titleIdeas, subtitleIdea: subtitleIdea, bookTitle: bookTitle, bookSubtitle: bookSubtitle,
    newProject: newProject, normalize: normalize, puzzle: puzzle, emptyPuzzle: emptyPuzzle
  };
})(typeof window !== 'undefined' ? window : globalThis);
