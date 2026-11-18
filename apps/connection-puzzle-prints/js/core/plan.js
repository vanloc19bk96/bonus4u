/*
 * The book plan: how many puzzles, who solves them, the theme the AI writes for and the level.
 * A puzzle is 16 words in four groups of four; each group has a link (what its words share).
 * Group 1 is the most direct link, group 4 the trickiest. A puzzle's id never changes ('p1',
 * 'p2'...), so what was written stays with it.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  // guide tells the AI what the book is about, topics give it room to vary, sample is the example
  // puzzle in the reply format: four groups, most direct first, with a trap (a word that seems to
  // fit another group). Every sample is a real, fair puzzle of its theme.
  var THEMES = [
    { id: 'mix', title: 'Everyday mix', sub: 'Home, food, games, nature, wordplay', guide: 'a wide mix of everyday subjects and light wordplay',
      topics: 'food, the home, animals, nature, jobs, hobbies, sports, games, music, travel, clothes, school, weather, tools, phrases that share a word',
      sample: { groups: [['Breakfast foods', 'TOAST, CEREAL, BACON, WAFFLE'], ['Things you crack', 'EGG, CODE, JOKE, SAFE'], ['Card games', 'BRIDGE, RUMMY, SNAP, POKER'], ['___ tie', 'BOW, NECK, ZIP, CABLE']], trap: 'EGG looks like a breakfast food; SNAP sounds like a crack.' } },
    { id: 'wordplay', title: 'Wordplay', sub: 'Hidden words, sound-alikes, ___ phrases', guide: 'wordplay: hidden words, sound-alikes, words that go before or after the same word, anagrams, plus some plain categories',
      topics: 'hidden words, homophones, words before or after a common word, anagrams, words that become new words with one letter changed, compound words, plain everyday categories to balance the wordplay',
      sample: { groups: [['Anagrams of STOP', 'POTS, TOPS, SPOT, OPTS'], ['___ fish', 'STAR, SWORD, CAT, GOLD'], ['Sound like letters', 'SEA, TEA, WHY, EYE'], ['Hidden animal', 'SCATTER, BEARD, CANTEEN, DOGMA']], trap: 'CAT also hides in SCATTER; SEA could go with fish.' } },
    { id: 'trivia', title: 'Trivia', sub: 'Geography, science, history, sport', guide: 'general knowledge: geography, science, history, sport and the arts (facts most adults know)',
      topics: 'planets, elements, capital cities, rivers, countries, oceans, inventions, famous painters, composers, sports, units of measure, the human body, Greek letters',
      sample: { groups: [['Planets', 'MARS, VENUS, SATURN, MERCURY'], ['Metals', 'IRON, ZINC, COPPER, TIN'], ['Rivers', 'NILE, AMAZON, DANUBE, THAMES'], ['Greek letters', 'ALPHA, DELTA, SIGMA, OMEGA']], trap: 'MERCURY is a metal too; a DELTA is part of a river.' } },
    { id: 'nostalgia', title: 'Remember when', sub: 'Everyday life from the 1950s to the 1980s', guide: 'nostalgia: everyday life in the 1950s to 1980s (plain words only, no brand names)',
      topics: 'dances, playground games, old kitchens, school days, fashions, music formats, old toys, the corner store, road trips, drive-ins, phrases of the time',
      sample: { groups: [['Dances of the time', 'TWIST, JIVE, HUSTLE, STROLL'], ['In an old kitchen', 'PERCOLATOR, TOASTER, ICEBOX, MIXER'], ['Playground games', 'HOPSCOTCH, MARBLES, JACKS, TAG'], ['___ box', 'JUKE, LUNCH, SOAP, MAIL']], trap: 'ICEBOX ends in BOX but belongs in the kitchen.' } },
    { id: 'nature', title: 'Nature and animals', sub: 'Birds, trees, gardens, seas', guide: 'nature and animals',
      topics: 'birds, trees, flowers, insects, sea creatures, farm animals, wild animals, weather, rocks, rivers and lakes, the seasons, animal homes, baby animals, collective nouns',
      sample: { groups: [['Garden birds', 'ROBIN, WREN, SWIFT, JAY'], ['Trees', 'ASH, ELM, BIRCH, CEDAR'], ['Words meaning quick', 'RAPID, BRISK, FLEET, HASTY'], ['Parts of a flower', 'PETAL, STEM, SEPAL, ANTHER']], trap: 'SWIFT also means quick.' } },
    { id: 'food', title: 'Food and kitchen', sub: 'Baking, cooking, world foods', guide: 'food, cooking and the kitchen',
      topics: 'pasta, cheeses, herbs and spices, fruit, vegetables, baking, breakfast, desserts, kitchen tools, dishes from around the world, drinks without alcohol, phrases with food words',
      sample: { groups: [['Pasta shapes', 'PENNE, FUSILLI, RIGATONI, ORZO'], ['Herbs', 'BASIL, SAGE, THYME, DILL'], ['Cheeses', 'BRIE, FETA, EDAM, GOUDA'], ['___ cake', 'CUP, PAN, CHEESE, SPONGE']], trap: 'CHEESE sits with the cheeses at first sight.' } },
    { id: 'culture', title: 'Movies, music and books', sub: 'Genres, instruments, stories', guide: 'movies, music, books and the arts (general words, no song lyrics, no living people)',
      topics: 'instruments, film genres, parts of a book, dances, fairy tales, theater, painting, the orchestra, poetry, music terms, famous composers and painters of the past',
      sample: { groups: [['Instruments', 'CELLO, OBOE, HARP, TUBA'], ['Film genres', 'WESTERN, HORROR, COMEDY, THRILLER'], ['Parts of a book', 'SPINE, CHAPTER, INDEX, COVER'], ['Dances', 'TANGO, SALSA, WALTZ, POLKA']], trap: 'A COVER is also a song; SALSA is also a sauce.' } },
    { id: 'sport', title: 'Sports and games', sub: 'Ball games, board games, cards', guide: 'sports, board games and card games',
      topics: 'golf, tennis, baseball, soccer, chess, card games, board games, the Olympics, swimming, fishing, sports equipment, sporting phrases in everyday speech',
      sample: { groups: [['Golf words', 'TEE, PAR, BIRDIE, EAGLE'], ['Birds of prey', 'HAWK, FALCON, OWL, KITE'], ['Tennis words', 'LOVE, DEUCE, ACE, SERVE'], ['Chess pieces', 'KING, QUEEN, ROOK, BISHOP']], trap: 'EAGLE is also a bird of prey; ACE is a golf word too.' } },
    { id: 'faith', title: 'Bible and faith', sub: 'Stories, books and church life', guide: 'the Bible and Christian life',
      topics: 'the disciples, books of the Bible, Old Testament stories, parables, places in the Holy Land, church life, hymns, Christmas and Easter, fruits of the Spirit',
      sample: { groups: [['Disciples', 'PETER, ANDREW, JAMES, THOMAS'], ['Old Testament books', 'GENESIS, RUTH, JOB, JONAH'], ['Fruits of the Spirit', 'LOVE, JOY, PEACE, PATIENCE'], ['In the story of Noah', 'ARK, DOVE, RAINBOW, FLOOD']], trap: 'JAMES is also a book of the Bible, but of the New Testament.' } },
    { id: 'seasons', title: 'Holidays and seasons', sub: 'Christmas, summer, autumn and more', guide: 'holidays and the seasons of the year',
      topics: 'Christmas, Thanksgiving, Halloween, Easter, New Year, Valentine’s Day, summer at the beach, autumn, spring gardens, winter weather, birthdays',
      sample: { groups: [['Signs of autumn', 'ACORN, PUMPKIN, CIDER, LEAVES'], ['On a Christmas tree', 'TINSEL, STAR, GARLAND, LIGHTS'], ['At the beach', 'SAND, TOWEL, BUCKET, SHELL'], ['Snow___', 'BALL, MAN, FLAKE, DRIFT']], trap: 'A BALL could hang on a Christmas tree.' } },
    { id: 'kids', title: 'For kids', sub: 'Animals, colors, school, food', guide: 'things children know and love', kid: true,
      topics: 'farm animals, zoo animals, pets, colors, fruit, vegetables, toys, school, the playground, the beach, sports, weather, shapes, body parts, things that go',
      sample: { groups: [['Farm animals', 'COW, PIG, SHEEP, GOAT'], ['Colors', 'RED, ORANGE, GREEN, BLUE'], ['Fruit', 'APPLE, BANANA, GRAPE, LEMON'], ['In a classroom', 'DESK, BOARD, CHALK, RULER']], trap: 'ORANGE is a color and a fruit.' } },
    { id: 'custom', title: 'My own theme', sub: 'Type it in the box below', guide: '' }
  ];

  // blurb: the back-cover tone; reader: who the links are tested on; maxLetters: the longest answer.
  var AUDIENCES = [
    { id: 'adults', label: 'Adults & seniors', who: 'adults and seniors who enjoy a thinking word puzzle', reader: 'a keen puzzle solver', blurb: 'warm and inviting', maxLetters: 12, defaults: { level: 'mixed' } },
    { id: 'family', label: 'The whole family', who: 'families solving together, from teenagers to grandparents', reader: 'a teenager', blurb: 'warm and inviting', maxLetters: 11,
      words: 'words and facts everyone in the family knows, from a teenager to a grandparent', defaults: { level: 'mixed' } },
    { id: 'kids', label: 'Kids (8 to 12)', who: 'children aged 8 to 12', reader: 'a 9-year-old', kid: true, blurb: 'fun and inviting, written for the parents and grandparents who buy it', maxLetters: 9,
      words: 'words a typical 9-year-old uses at home or at school and can read and spell without help', defaults: { level: 'easy' } }
  ];

  // How hard a whole puzzle is; the four groups inside it always run from the most direct to the trickiest.
  var LEVELS = [
    { id: 'easy', label: 'Easy', stars: 1, section: 'Warm-Up', help: 'Plain links you can spot quickly, with one gentle trap.',
      ask: 'EASY: four plain categories (like Fruit or Things in a kitchen) and one gentle trap: a word that seems to fit a second group.' },
    { id: 'medium', label: 'Medium', stars: 2, section: 'Thinking Cap', help: 'One group plays with words, and a few words fit more than one group.',
      ask: 'MEDIUM: three plain categories and one wordplay group (a word that goes before or after the same word, a hidden word, sound-alikes), with two traps.' },
    { id: 'hard', label: 'Hard', stars: 3, section: 'Brain Benders', help: 'Two groups play with words, and traps are everywhere.',
      ask: 'HARD: two plain categories and two wordplay groups, with three or more traps, so that five or six words seem to fit the easiest group.' }
  ];
  var KID_ASK = {
    easy: 'EASY: four plain categories a child knows (like Farm animals or Colors) and one gentle trap.',
    medium: 'MEDIUM: four plain categories a child knows, with two traps (a word that seems to fit two groups, like ORANGE in Colors and Fruit).',
    hard: 'HARD: three plain categories and one simple word game a child can get (words that go before the same word, like ___ BALL), with two or three traps.'
  };

  var COUNTS = [50, 100, 150, 200, 300], MIN_COUNT = 10, MAX_COUNT = 500;
  // The worked examples for the How to Play page (never in a prompt). The book prints the one that
  // shares the fewest answers and links with its own puzzles, so the example never gives one away.
  // Short answers only (7 letters at most), so the example board stays at the text size.
  var EXAMPLES = [
    { groups: [['Trees', 'OAK, PINE, PALM, MAPLE'], ['Things that have a key', 'PIANO, LOCK, MAP, CAR'], ['___ cake', 'CUP, PAN, CHEESE, CARROT'], ['Hidden body part', 'ARMY, CHINA, EARTH, LEGEND']],
      trap: 'MAPLE starts with MAP, PALM is a body part, and a map’s key is called its LEGEND.' },
    { groups: [['Garden birds', 'ROBIN, WREN, FINCH, LARK'], ['Things with a shell', 'EGG, NUT, SNAIL, OYSTER'], ['___ worm', 'BOOK, EARTH, SILK, GLOW'], ['Rhymes with CAKE', 'LAKE, RAKE, SNAKE, BRAKE']],
      trap: 'SNAKE seems to belong with the worms, but it rhymes with CAKE. A SNAIL could pass for a worm too, but it has a shell.' },
    { groups: [['In a toolbox', 'HAMMER, WRENCH, PLIERS, LEVEL'], ['Dances', 'WALTZ, TANGO, POLKA, JIVE'], ['___ print', 'FOOT, FINGER, BLUE, SMALL'], ['Hidden number', 'OFTEN, WEIGHT, CANINE, STONE']],
      trap: 'STONE seems to belong with the tools, but it hides ONE.' },
    { groups: [['Red things', 'TOMATO, RUBY, CHERRY, BRICK'], ['Card suits', 'HEART, SPADE, CLUB, DIAMOND'], ['At a wedding', 'CAKE, VEIL, RING, BOUQUET'], ['Hidden vehicle', 'SCARF, VANISH, BUSY, CABLE']],
      trap: 'HEART and DIAMOND seem to go with a wedding, but they are card suits. A SCARF could be worn at a wedding, but it hides CAR.' },
    { groups: [['Weather', 'RAIN, HAIL, SLEET, FOG'], ['Things with a face', 'CLOCK, COIN, CLIFF, DICE'], ['Fire___', 'PLACE, WORK, MAN, FLY'], ['Sound like letters', 'BEE, PEA, YOU, OWE']],
      trap: 'PEA and BEE seem out of place until you say them out loud, and DICE seems odd next to a CLOCK until you think of their faces.' },
    { groups: [['Things in a pond', 'FROG, DUCK, REED, LILY'], ['Tools for writing', 'PEN, QUILL, CHALK, CRAYON'], ['Moon ___', 'BEAM, WALK, SHINE, CAKE'], ['Hidden pronoun', 'SHEEP, THEME, WEST, YOUTH']],
      trap: 'SHEEP seems to belong near the pond, but it hides SHE. CAKE seems out of place until you put MOON before it.' },
    { groups: [['Knots', 'REEF, BOW, GRANNY, HITCH'], ['Things that ring', 'BELL, PHONE, ALARM, CHIME'], ['___ cap', 'ICE, KNEE, NIGHT, BOTTLE'], ['Hidden metal', 'SATIN, IRONY, GOLDEN, LEADER']],
      trap: 'NIGHT seems to go with ALARM, but it belongs with ___ cap. GOLDEN looks like a color word, but it hides GOLD.' },
    { groups: [['Shades of green', 'LIME, OLIVE, JADE, MINT'], ['Things with wings', 'BAT, PLANE, ANGEL, MOTH'], ['___ bag', 'TEA, SAND, BEAN, HAND'], ['Words before BOARD', 'SURF, DART, SIDE, CHALK']],
      trap: 'SAND seems to go with SURF, but it belongs with ___ bag. MINT seems to go with TEA, but it is a shade of green.' }
  ];
  var EXAMPLE = EXAMPLES[0];

  function setAudience(plan, id) {
    var a = audience(id);
    plan.audience = a.id;
    Object.assign(plan, a.defaults);
    if (a.kid && plan.theme === 'mix') plan.theme = 'kids';
    if (!a.kid && plan.theme === 'kids') plan.theme = 'mix';
  }

  /*
   * How much a set of groups (an example, a cover) gives away of the book: a group with the same link
   * as a group of the book, or two answers of one book group, gives that group away (10 each); any
   * other answer of the book counts 1.
   */
  function overlap(project, groups) {
    var book = [], all = {}, n = 0;
    function key(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9_ ]+/g, ''); }
    Object.keys(project.puzzles).forEach(function (k) {
      (project.puzzles[k].groups || []).forEach(function (g) {
        var stems = g.words.map(CX.engine.stem);
        stems.forEach(function (s) { all[s] = 1; });
        book.push({ link: key(g.link), stems: stems });
      });
    });
    groups.forEach(function (g) {
      var link = key(g.link || g[0]), stems = (g.words || g[1].split(/\s*,\s*/)).map(CX.engine.stem);
      var gives = book.some(function (b) { return b.link === link || stems.filter(function (s) { return b.stems.indexOf(s) !== -1; }).length >= 2; });
      n += gives ? 10 : 0;
      stems.forEach(function (s) { if (all[s]) n++; });
    });
    return n;
  }
  // The example that shares least with the book (the first of equals, so it stays put).
  function example(project) {
    var best = EXAMPLES[0], low = 1e9;
    EXAMPLES.forEach(function (e) { var n = overlap(project, e.groups); if (n < low) { low = n; best = e; } });
    return best;
  }
  // Only 16 pt and more is sold as large print (KDP's large print size).
  function largePrint(project) { return project.book.print === 'xl'; }

  function theme(id) { return THEMES.filter(function (t) { return t.id === id; })[0] || THEMES[0]; }
  function audience(id) { return AUDIENCES.filter(function (a) { return a.id === id; })[0] || AUDIENCES[0]; }
  function level(id) { return LEVELS.filter(function (l) { return l.id === id; })[0] || LEVELS[1]; }
  function validCount(n) { n = Math.round(+n); return n >= MIN_COUNT && n <= MAX_COUNT ? n : 0; }

  // A sample or example as a puzzle: { groups: [{ link, words: [4] }], trap }.
  function asPuzzle(s) {
    return { groups: s.groups.map(function (g) { return { link: g[0], words: g[1].split(/\s*,\s*/) }; }), trap: s.trap || '', v: 0 };
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
    var a = project.plan.audience, n = project.plan.name.trim() || 'Word Links';
    var who = a === 'kids' ? 'Kids' : a === 'family' ? 'the Whole Family' : 'Adults';
    var ideas = [n + ' Puzzle Book for ' + who, 'Find the Connection: Word Group Puzzles', 'The Big Book of ' + n];
    if (project.plan.theme === 'faith') ideas.unshift('Bible ' + n);
    if (project.plan.theme === 'nostalgia') ideas.unshift('Remember When ' + n);
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
    return String(s).replace(new RegExp('\\b' + from + '\\b(?=(?:[\\s-]+[A-Za-z]+){0,4}[\\s-]+(?:puzzles?|grids?)\\b)', 'gi'), String(to));
  }

  function subtitleIdea(project, planned) {
    var large = largePrint(project), n = bookCount(project, planned);
    return n + ' ' + (large ? 'Large Print ' : '') + 'Word Puzzles: Sort 16 Words into Four Groups of Four, with Hints and Solutions';
  }
  function bookTitle(project, planned) { return countText(project, (project.book.title || '').trim() || titleIdeas(project)[0], planned); }
  function bookSubtitle(project, planned) {
    var own = (project.book.subtitle || '').trim();
    return own ? countText(project, own, planned) : subtitleIdea(project, planned);
  }

  function newProject() {
    return {
      v: 1,
      seed: CX.util.randomSeed(),
      book: { title: '', subtitle: '', author: '', trim: '8.5x11', paper: 'white', print: 'xl' },
      plan: { count: 100, theme: 'mix', customTheme: '', audience: 'adults', level: 'mixed', perPage: 1, stars: true, hints: true, log: true, name: 'Word Links' },
      puzzles: {},           // puzzle id -> { groups: [{ link, words: [] }], trap, v (tile shuffle) }
      ai: { welcome: [], closing: [], blurb: '' },
      cover: { design: 'bars', palette: '' }
    };
  }

  function emptyPuzzle() { return { groups: [], trap: '', v: 0 }; }
  function puzzle(project, id) { return project.puzzles[id] || (project.puzzles[id] = emptyPuzzle()); }

  // An answer as the book prints it: capitals, single spaces, letters and a few marks only.
  function cleanWord(s) {
    return CX.text.stripAccents(String(s || '')).toUpperCase().replace(/[‘’`]/g, '\'').replace(/[^A-Z0-9 '&.\-]+/g, ' ')
      .replace(/\s+/g, ' ').replace(/^[\s.\-']+|[\s.\-']+$/g, '');
  }
  function letters(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

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
    pl.perPage = +pl.perPage === 2 ? 2 : 1;
    if (pl.level !== 'mixed') pl.level = level(pl.level).id;
    pl.audience = audience(pl.audience).id;
    pl.theme = theme(pl.theme).id;
    ['stars', 'hints', 'log'].forEach(function (k) { pl[k] = !!pl[k]; });
    ['customTheme', 'name'].forEach(function (k) { if (typeof pl[k] !== 'string') pl[k] = d.plan[k]; });
    out.puzzles = {};
    if (p.puzzles && typeof p.puzzles === 'object') {
      Object.keys(p.puzzles).forEach(function (id) {
        if (!/^p\d{1,3}$/.test(id)) return;
        var s = p.puzzles[id] || {}, e = emptyPuzzle();
        e.groups = (Array.isArray(s.groups) ? s.groups : []).slice(0, 4).map(function (g) {
          g = g || {};
          return { link: typeof g.link === 'string' ? g.link : '', words: (Array.isArray(g.words) ? g.words : []).filter(function (w) { return typeof w === 'string'; }).map(cleanWord).filter(Boolean).slice(0, 8) };
        });
        e.trap = typeof s.trap === 'string' ? s.trap : '';
        e.v = Math.max(0, Math.round(+s.v) || 0);
        out.puzzles[id] = e;
      });
    }
    ['welcome', 'closing'].forEach(function (k) { if (!Array.isArray(out.ai[k])) out.ai[k] = []; });
    if (typeof out.ai.blurb !== 'string') out.ai.blurb = '';
    return out;
  }

  CX.plan = {
    THEMES: THEMES, AUDIENCES: AUDIENCES, LEVELS: LEVELS, KID_ASK: KID_ASK, COUNTS: COUNTS, MIN_COUNT: MIN_COUNT, MAX_COUNT: MAX_COUNT, EXAMPLE: EXAMPLE, EXAMPLES: EXAMPLES, example: example, overlap: overlap, largePrint: largePrint,
    theme: theme, audience: audience, setAudience: setAudience, level: level, validCount: validCount, asPuzzle: asPuzzle,
    puzzles: puzzles, levelOf: levelOf, titleIdeas: titleIdeas, subtitleIdea: subtitleIdea, bookTitle: bookTitle, bookSubtitle: bookSubtitle, bookCount: bookCount, countText: countText,
    newProject: newProject, normalize: normalize, puzzle: puzzle, emptyPuzzle: emptyPuzzle, cleanWord: cleanWord, letters: letters
  };
})(typeof window !== 'undefined' ? window : globalThis);
