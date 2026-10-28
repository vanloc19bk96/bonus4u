/*
 * The book plan: how many days the countdown has, the optional Twelve Days bonus, the theme the
 * AI writes for, the hidden sentence (one letter a day) and the puzzle settings. A day's id never
 * changes ('d1'..'d25', 'b1'..'b12'), so words already written stay with their day.
 * Every countdown ends on Christmas Eve, except the 25 days, which run to Christmas Day: 24 and
 * 25 days start on December 1, 12 days on December 13, any other length (7 to 24) on 25 - n.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  // guide tells the AI what the words and clues are about; arc is how the days move through it,
  // focus what most words must be about and sample the example lines in the reply format.
  var THEMES = [
    { id: 'cozy', title: 'Cozy Christmas at home', sub: 'Candles, baking, cards, snow and family', guide: 'a cozy Christmas at home: candles and lamps, the fireplace, baking, cards, wrapping, snow and winter weather, visitors and family traditions',
      arc: 'the first days are the first dark evenings and getting the house ready, the middle days baking, cards, shopping and visits, the last days wrapping, carols and Christmas Eve',
      focus: 'Christmas at home and the cozy side of winter', sample: ['Boots in the Hall', 'LAMP | It lights the corner of a room', 'EMBERS | Glowing bits left in the grate'] },
    { id: 'vintage', title: 'The Christmases you grew up with', sub: 'Remember-when holidays, 1950s to 1970s', guide: 'old-fashioned Christmases of the 1950s to 1970s: tinsel, paper chains, the catalog wish book, carol singers, the Christmas pageant, holiday baking and the toys and treats of the time (everyday words only, no brand names)',
      arc: 'the first days are bringing the old decorations down from the attic and leafing through the wish book, the middle days paper chains, baking, the school pageant and carol singers, the last days wrapping, midnight church and Christmas Eve',
      focus: 'old-fashioned Christmases of the 1950s to 1970s', sample: ['The Wish Book', 'TINSEL | Shiny strands hung on the tree', 'PAGEANT | School play about the first Christmas'] },
    { id: 'carols', title: 'Carols, movies and stories', sub: 'Classic holiday songs, films and tales', guide: 'classic Christmas stories, carols and holiday films: the characters, places and things in them (no song lyrics and no quotes, single plain words only)',
      arc: 'each day visits one classic carol, story or holiday film, moving from the old tales and carols to the films families watch on Christmas Eve',
      focus: 'Christmas carols, stories and films', sample: ['A Christmas Carol', 'SCROOGE | Miser visited by three spirits', 'GHOST | Spirit who visits at night'] },
    { id: 'faith', title: 'The first Christmas', sub: 'Advent, the Nativity and church traditions', guide: 'the Christian Advent and the Nativity: Bethlehem, the shepherds, the star, the wise men, angels, church services, candles, hymns and giving',
      arc: 'the days follow the Advent story: the waiting and the prophets, Mary and Joseph, the journey to Bethlehem, the shepherds and the angels, the stable on Christmas Eve',
      focus: 'Advent and the Nativity', sample: ['The Long Road', 'DONKEY | Animal Mary rode to Bethlehem', 'MANGER | Feeding trough used as a crib'] },
    { id: 'winter', title: 'Winter wonderland', sub: 'Snow, frost, birds and winter walks', guide: 'winter outdoors: snow, ice, frost, sledding, skating, winter birds and animals, evergreen trees, mittens and scarves, and warm drinks after a walk',
      arc: 'the first days are the first frosts and the first snow, the middle days sledding, skating, winter birds and woodland walks, the last days the longest night and a snowy Christmas Eve',
      focus: 'winter outdoors', sample: ['First Frost', 'ICICLE | Frozen spike hanging from a roof', 'ROBIN | Red-breasted winter bird'] },
    { id: 'kids', title: 'For kids', sub: 'Easy words: Santa, elves, toys and snowmen', guide: 'a child’s Christmas: Santa, reindeer, elves, toys, snowmen, cookies, presents, stockings and the Christmas tree (easy, well-known words only)', easy: true,
      arc: 'the first days are writing to Santa and decorating the tree, the middle days the elves in the toy workshop, cookies, snowmen and snowball fights, the last days the reindeer, stockings, presents and Santa’s sleigh on Christmas Eve',
      focus: 'Christmas as a child sees it: Santa, reindeer, elves, toys, snowmen, cookies, presents, stockings and the tree', sample: ['Santa’s Workshop', 'ELF | Santa’s little helper', 'SLEIGH | Santa rides it across the sky'] },
    { id: 'custom', title: 'My own theme', sub: 'Type it in the box below', guide: '' }
  ];

  // words is an extra rule for the answers, easy keeps them short (maxLen letters at most), blurb is
  // the back-cover tone, more gives extra head-start answers and defaults are set when it is picked.
  var AUDIENCES = [
    { id: 'seniors', label: 'Adults & seniors', who: 'adults and seniors who enjoy a gentle daily crossword', clue: 'friendly, everyday English', blurb: 'cozy and inviting' },
    { id: 'women', label: 'Women', who: 'women who like a calm, cozy puzzle with their morning coffee', clue: 'friendly, everyday English', blurb: 'cozy and inviting' },
    { id: 'family', label: 'The whole family', who: 'families solving together, from teenagers to grandparents', clue: 'simple, everyday English', blurb: 'warm and inviting',
      words: 'words everyone in the family knows, from a teenager to a grandparent' },
    { id: 'young', label: 'Young kids (6 to 8)', who: 'children aged 6 to 8 who are just starting to read on their own', clue: 'very short, simple words a young reader knows', easy: true, maxLen: 7, more: true,
      words: 'very easy words a child aged 6 to 8 can read and spell', blurb: 'fun and inviting, written for the parents and grandparents who buy it', defaults: { size: 11, lines: 2 } },
    { id: 'kids', label: 'Kids (8 to 12)', who: 'children aged 8 to 12', clue: 'very simple words a child knows', easy: true,
      words: 'easy, well-known words that a child aged 8 to 12 knows and can spell', blurb: 'fun and inviting, written for the parents and grandparents who buy it' }
  ];

  // Sentences for the hidden letter strip; the app keeps those with as many letters as days.
  // Every length a countdown can have (7 to 25) has at least one.
  var SENTENCES = [
    'Have a holly jolly Christmas', 'A very merry Christmas to you', 'Santa Claus is coming to town', 'Sing and be merry this season', 'Peace and joy this Christmas',
    'We wish you a merry Christmas', 'Wishing you a merry Christmas', 'Peace on earth goodwill to all', 'Merry Christmas from all of us', 'Merry Christmas to one and all',
    'Warm wishes this Christmas', 'Love and joy this Christmas', 'Merry Christmas everyone', 'Tidings of comfort and joy', 'Tis the season to be jolly', 'Peace and joy to the world',
    'Silent night holy night', 'A merry Christmas to all', 'Merry Christmas to all', 'Have a merry Christmas', 'O come all ye faithful', 'All is calm and bright',
    'Christmas is coming', 'Peace on earth to you', 'Home for Christmas', 'Season’s greetings', 'A merry Christmas', 'Peace love and joy', 'Merry Christmas', 'Merry and bright',
    'Joy to the world', 'Goodwill to all', 'Happy holidays', 'Twelfth Night', 'Deck the halls', 'Happy New Year', 'Ring the bells', 'Hope and cheer', 'Snow and stars', 'New year cheer', 'Feliz Navidad',
    'Silent night', 'Jingle bells', 'Glad tidings', 'Warm wishes', 'Love and joy', 'Let it snow', 'Holy night', 'Joy to all', 'Noel Noel', 'Be merry', 'Believe'
  ];
  // These belong to the days after Christmas: ideas for the Twelve Days strip only.
  var NEW_YEAR = ['Twelfth Night', 'Happy New Year', 'New year cheer'];

  // The countdowns on the cards; any other length from MIN_DAYS to 24 is a custom one.
  var PRESET_DAYS = [24, 25, 12], MIN_DAYS = 7;

  var GRID_SIZES = [
    { n: 11, label: '11 × 11', hint: 'Quick, about 14 answers', target: 15, min: 11, ask: 24 },
    { n: 13, label: '13 × 13', hint: 'Bestseller size, about 17 answers', target: 18, min: 14, ask: 30 },
    { n: 15, label: '15 × 15', hint: 'Long sitting, about 20 answers', target: 22, min: 17, ask: 36 }
  ];

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function theme(id) { return THEMES.filter(function (t) { return t.id === id; })[0] || THEMES[0]; }
  function audience(id) { return AUDIENCES.filter(function (a) { return a.id === id; })[0] || AUDIENCES[0]; }
  function grid(n) { return GRID_SIZES.filter(function (g) { return g.n === +n; })[0] || GRID_SIZES[1]; }

  function letters(s) { return String(s || '').toUpperCase().replace(/[^A-Z]/g, ''); }

  function sentencesFor(n, set) {
    return SENTENCES.filter(function (s) { return letters(s).length === n && (set === 'bonus' || NEW_YEAR.indexOf(s) === -1); });
  }

  // The countdown's first and last dates (days of December).
  function lastDate(project) { return project.plan.days === 25 ? 25 : 24; }
  function firstDate(project) { return lastDate(project) - project.plan.days + 1; }
  function dateOf(project, no) { return 'December ' + (firstDate(project) + no - 1); }
  // "December 13–24" for a run of countdown days.
  function dateSpan(project, from, to) { return dateOf(project, from) + (to !== from ? '–' + (firstDate(project) + to - 1) : ''); }
  function validDays(n) { n = Math.round(+n); return n === 25 || (n >= MIN_DAYS && n <= 24) ? n : 0; }

  /*
   * The days of the book in order: the countdown, then the Twelve Days bonus.
   * [{ id, set: 'main'|'bonus', no (1-based within its set), index (0-based in the book), date }]
   */
  function days(project) {
    var out = [], n = project.plan.days, i;
    for (i = 1; i <= n; i++) out.push({ id: 'd' + i, set: 'main', no: i, date: dateOf(project, i) });
    if (project.plan.bonus) {
      for (i = 1; i <= 12; i++) {
        var d = 25 + i;
        out.push({ id: 'b' + i, set: 'bonus', no: i, date: d <= 31 ? 'December ' + d : 'January ' + (d - 31) });
      }
    }
    out.forEach(function (d, k) { d.index = k; });
    return out;
  }

  // The weeks of the countdown (Advent has four candles): 7, 7, 7 and the rest, a tail of one or two
  // days joining the week before it. Under two weeks the countdown is two halves. The bonus is one more block.
  // candles: how many Advent candles burn by the block's first date.
  function weeks(project) {
    var n = project.plan.days, out = [], start = 1, k = 0;
    var names = ['The First Week', 'The Second Week', 'The Third Week'];
    if (n < 14) {
      var half = Math.ceil(n / 2);
      out.push({ from: 1, to: half, title: 'The First Days' }, { from: half + 1, to: n, title: 'The Last Days' });
    } else {
      while (start <= n) {
        var end = k < 3 ? Math.min(n, start + 6) : n;
        if (n - end < 3) end = n;
        out.push({ from: start, to: end, title: end === n && end - start !== 6 ? 'The Last Days' : names[k] });
        start = end + 1; k++;
      }
    }
    out.forEach(function (w, i) {
      w.no = i + 1; w.set = 'main';
      w.candles = Math.min(4, Math.floor((firstDate(project) + w.from - 2) / 7) + 1);
    });
    if (project.plan.bonus) out.push({ no: out.length + 1, set: 'bonus', from: 1, to: 12, title: 'The Twelve Days', candles: 4 });
    return out;
  }

  // How many answers are printed in a day's grid: 3 in the first week, 2 in the second, then none.
  // Young solvers get three answers in the first half and two after that.
  function givens(project, day) {
    if (!project.plan.headStart) return 0;
    var n = day.set === 'bonus' ? 12 : project.plan.days, part = day.no / n;
    if (audience(project.plan.audience).more) return part <= 0.5 ? 3 : 2;
    if (n >= 20) return day.no <= 6 ? 3 : day.no <= 12 ? 2 : 0;
    return part <= 0.25 ? 3 : part <= 0.5 ? 2 : 0;
  }

  // One to three stars.
  function stars(project, day) {
    var g = givens(project, day);
    if (project.plan.headStart) return g === 3 ? 1 : g === 2 ? 2 : 3;
    var n = day.set === 'bonus' ? 12 : project.plan.days;
    return day.no <= n / 3 ? 1 : day.no <= n * 2 / 3 ? 2 : 3;
  }

  // The hidden letter of a day ('' when the sentence is not the right length).
  function sentenceOf(project, set) { return letters(set === 'bonus' ? project.plan.bonusSentence : project.plan.sentence); }
  function sentenceOk(project, set) {
    var n = set === 'bonus' ? 12 : project.plan.days;
    return sentenceOf(project, set).length === n;
  }
  function letterOf(project, day) {
    if (!sentenceOk(project, day.set)) return '';
    return sentenceOf(project, day.set).charAt(day.no - 1);
  }

  function titleIdeas(project) {
    var a = audience(project.plan.audience), n = project.plan.days, t = project.plan.theme;
    var who = a.id === 'kids' || a.id === 'young' ? 'Kids' : a.id === 'women' ? 'Women' : a.id === 'family' ? 'the Whole Family' : 'Adults and Seniors';
    var ideas = ['Crossword Advent Calendar for ' + who, 'The Christmas Crossword Advent Calendar', 'Cozy Crossword Advent Calendar'];
    if (t === 'vintage') ideas.unshift('Remember When? Crossword Advent Calendar');
    if (t === 'faith') ideas.unshift('The Nativity Crossword Advent Calendar');
    if (t === 'kids') ideas.unshift('My Christmas Crossword Advent Calendar');
    if (n !== 24) ideas.push(n + (n === 25 ? ' Days of Christmas Crosswords' : ' Days Till Christmas Crosswords'));
    return ideas.slice(0, 4);
  }

  function subtitleIdea(project) {
    var n = project.plan.days, large = project.book.print !== 'regular';
    return n + ' Days of ' + (large ? 'Large Print ' : '') + 'Christmas Crosswords, One Puzzle a Day from ' + dateOf(project, 1) + (project.plan.bonus ? ', with a Twelve Days Bonus' : '');
  }

  function bookTitle(project) { return (project.book.title || '').trim() || titleIdeas(project)[0]; }
  function bookSubtitle(project) { return (project.book.subtitle || '').trim() || subtitleIdea(project); }

  function newProject() {
    return {
      v: 1,
      seed: CX.util.randomSeed(),
      book: { title: '', subtitle: '', author: '', trim: '6x9', paper: 'white', print: 'large' },
      plan: {
        days: 24, bonus: false, theme: 'cozy', customTheme: '', audience: 'seniors',
        sentence: 'Have a holly jolly Christmas', bonusSentence: 'Twelfth Night',
        size: 13, headStart: true, memory: true, story: true, lines: 4
      },
      days: {},              // day id -> { title, story, question, words: [{ w, c }], v (grid variant) }
      ai: { weeks: [], eve: [], blurb: '' },
      cover: { design: 'marquee', palette: '' }
    };
  }

  function emptyDay() { return { title: '', story: '', question: '', words: [], v: 0 }; }
  function day(project, id) { return project.days[id] || (project.days[id] = emptyDay()); }

  // Fills in anything an older or hand-edited project file is missing.
  function normalize(p) {
    var d = newProject();
    p = p && typeof p === 'object' ? p : {};
    var out = { v: 1, seed: typeof p.seed === 'string' && p.seed ? p.seed : d.seed };
    ['book', 'plan', 'ai', 'cover'].forEach(function (k) {
      out[k] = Object.assign({}, d[k], p[k] && typeof p[k] === 'object' ? p[k] : {});
    });
    var pl = out.plan;
    pl.days = validDays(pl.days) || 24;
    pl.size = grid(pl.size).n;
    pl.lines = CX.util.clamp(Math.round(+pl.lines) || 0, 0, 6);
    ['bonus', 'headStart', 'memory', 'story'].forEach(function (k) { pl[k] = !!pl[k]; });
    ['sentence', 'bonusSentence', 'customTheme'].forEach(function (k) { if (typeof pl[k] !== 'string') pl[k] = d.plan[k]; });
    out.days = {};
    if (p.days && typeof p.days === 'object') {
      Object.keys(p.days).forEach(function (id) {
        if (!/^[db]\d{1,2}$/.test(id)) return;
        var s = p.days[id] || {}, e = emptyDay();
        ['title', 'story', 'question'].forEach(function (k) { e[k] = typeof s[k] === 'string' ? s[k] : ''; });
        e.words = Array.isArray(s.words) ? s.words.filter(function (x) { return x && typeof x.w === 'string' && typeof x.c === 'string'; }).map(function (x) { return { w: letters(x.w), c: x.c }; }) : [];
        e.v = Math.max(0, Math.round(+s.v) || 0);
        out.days[id] = e;
      });
    }
    ['weeks', 'eve'].forEach(function (k) { if (!Array.isArray(out.ai[k])) out.ai[k] = []; });
    if (typeof out.ai.blurb !== 'string') out.ai.blurb = '';
    return out;
  }

  CX.plan = {
    THEMES: THEMES, AUDIENCES: AUDIENCES, SENTENCES: SENTENCES, NEW_YEAR: NEW_YEAR, GRID_SIZES: GRID_SIZES, MONTHS: MONTHS, PRESET_DAYS: PRESET_DAYS, MIN_DAYS: MIN_DAYS,
    theme: theme, audience: audience, grid: grid, letters: letters, sentencesFor: sentencesFor, validDays: validDays,
    firstDate: firstDate, lastDate: lastDate, dateOf: dateOf, dateSpan: dateSpan,
    days: days, weeks: weeks, givens: givens, stars: stars, sentenceOf: sentenceOf, sentenceOk: sentenceOk, letterOf: letterOf,
    titleIdeas: titleIdeas, subtitleIdea: subtitleIdea, bookTitle: bookTitle, bookSubtitle: bookSubtitle,
    newProject: newProject, normalize: normalize, day: day, emptyDay: emptyDay
  };
})(typeof window !== 'undefined' ? window : globalThis);
