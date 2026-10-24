/*
 * The book plan: who the book is for (age, birthday year, country) and which chapters it has.
 * Chapters come from a topic list or from the decades of the reader's life. A chapter's id stays
 * the same when the age changes, so questions already written stay with their chapter.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  var COUNTRIES = [
    { id: 'us', label: 'United States', grew: 'the United States', spelling: 'American', money: 'US dollars and cents' },
    { id: 'uk', label: 'United Kingdom', grew: 'the United Kingdom', spelling: 'British', money: 'pounds, shillings and pence (before 1971) and pounds and pence after' },
    { id: 'ca', label: 'Canada', grew: 'Canada', spelling: 'Canadian', money: 'Canadian dollars' },
    { id: 'au', label: 'Australia', grew: 'Australia', spelling: 'Australian', money: 'pounds (before 1966) and Australian dollars after' },
    { id: 'world', label: 'Anywhere (worldwide mix)', grew: 'an English-speaking country (keep questions international)', spelling: 'American', money: 'US dollars' }
  ];

  // Topic chapters. guide tells the AI what belongs in the chapter.
  var TOPICS = [
    { id: 'childhood', title: 'Growing Up', sub: 'Toys, games, school days and childhood treats', guide: 'childhood: toys, games, school days, comics, candy, cartoons and children’s radio or TV shows from the reader’s childhood years' },
    { id: 'music', title: 'Music & Dancing', sub: 'Singers, hit songs, bands and dance crazes', guide: 'music: singers, bands, hit songs, record labels, dance crazes and famous concerts' },
    { id: 'movies', title: 'The Silver Screen', sub: 'Movies, movie stars and famous film lines', guide: 'movies: hit films, movie stars, famous film lines, studios and awards' },
    { id: 'tv', title: 'Radio & Television', sub: 'Favorite shows, hosts and catchphrases', guide: 'radio and television: shows, hosts, characters, catchphrases and theme songs' },
    { id: 'history', title: 'Headlines & History', sub: 'The moments that made the news', guide: 'history and world events: leaders, milestones, inventions announced, landings and celebrations (no grim details)' },
    { id: 'sports', title: 'Sports Legends', sub: 'Great athletes, teams and championships', guide: 'sports: famous athletes, teams, championships, Olympic moments and records' },
    { id: 'prices', title: 'What It Cost', sub: 'Prices and pay, then and now', guide: 'the cost of living: prices of everyday things (bread, gas, stamps, movie tickets, cars, houses) and wages, then compared with now' },
    { id: 'inventions', title: 'Inventions & Gadgets', sub: 'New things that changed everyday life', guide: 'inventions and technology: household gadgets, electronics, medicine and the first time things appeared' },
    { id: 'food', title: 'Food & Kitchen', sub: 'Brands, snacks, recipes and diners', guide: 'food and drink: brands, snacks, cereals, sodas, recipes, kitchen habits, diners and restaurant chains' },
    { id: 'fashion', title: 'Fashion & Style', sub: 'Clothes, hairstyles and trends', guide: 'fashion: clothes, hairstyles, shoes, designers, fads and trends' },
    { id: 'cars', title: 'Cars & Travel', sub: 'Cars, trains, planes and road trips', guide: 'cars and travel: car models and makers, gas stations, trains, air travel, road trips and vacation spots' },
    { id: 'famous', title: 'Famous Faces', sub: 'Stars, leaders and household names', guide: 'famous people: celebrities, leaders, royals, comedians, authors and their famous quotes' },
    { id: 'ads', title: 'Ads, Slogans & Brands', sub: 'Jingles, mascots and catchy slogans', guide: 'advertising: slogans, jingles, mascots, famous brands and their products' },
    { id: 'words', title: 'Slang & Sayings', sub: 'Words and phrases of the decades', guide: 'language: slang, sayings, expressions and words that were popular in each decade' },
    { id: 'space', title: 'Space & Science', sub: 'Rockets, moonwalks and discoveries', guide: 'space and science: the space race, astronauts, satellites, medical breakthroughs and famous discoveries' },
    { id: 'home', title: 'Life at Home', sub: 'Everyday life, chores and family fun', guide: 'home life: furniture, appliances, chores, family routines, telephones, mail and holidays' }
  ];
  var DEFAULT_TOPICS = ['childhood', 'music', 'movies', 'tv', 'history', 'sports', 'prices', 'inventions', 'food', 'famous'];

  var NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

  function country(id) {
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].id === id) return COUNTRIES[i];
    return COUNTRIES[0];
  }
  function topic(id) {
    for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].id === id) return TOPICS[i];
    return null;
  }

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // The reader: age turned on the birthday, the year of that birthday and the birth year.
  function reader(book) {
    var age = Math.round(+book.age) || 90;
    var year = Math.round(+book.year) || new Date().getFullYear();
    var born = year - age;
    return {
      age: age, year: year, born: born,
      ord: ordinal(age),
      // the years a reader remembers best: childhood to young adulthood
      goldFrom: born + 5, goldTo: Math.min(year, born + 35)
    };
  }

  // Decade chapters: one per decade of the reader's life. Decades that end before the reader
  // turned five are merged into the next one (nobody remembers the year they were two).
  function decades(r) {
    var out = [], d = Math.floor(r.born / 10) * 10, last = Math.floor(r.year / 10) * 10, start = d;
    for (; d <= last; d += 10) {
      if (d + 9 - r.born < 5 && d < last) continue;
      var from = Math.max(start, r.born), to = Math.min(d + 9, r.year);
      var label = start === d ? 'The ' + d + 's' : 'The ' + start + 's & ' + d + 's';
      var a0 = Math.max(0, from - r.born), a1 = to - r.born;
      out.push({
        id: 'd' + d,
        title: label,
        sub: a0 === 0 ? 'From the year you were born to age ' + a1 : 'When you were ' + a0 + ' to ' + a1,
        guide: 'the years ' + from + ' to ' + to + ': music, movies, radio and TV, sports, news, prices, fashion and everyday life of ' + (start === d ? 'the ' + d + 's' : 'those years') +
          ' (the reader was ' + a0 + ' to ' + a1 + ' years old)',
        from: from, to: to
      });
      start = d + 10;
    }
    return out;
  }

  // The chapters of the book, in order.
  function chapters(project) {
    var r = reader(project.book);
    if (project.plan.style === 'decade') return decades(r);
    var ids = project.plan.topics || [];
    return TOPICS.filter(function (t) { return ids.indexOf(t.id) !== -1; }).map(function (t) {
      return { id: t.id, title: t.title, sub: t.sub, guide: t.guide, from: r.born, to: r.year };
    });
  }

  function titleIdeas(book) {
    var r = reader(book);
    return [
      'The ' + r.ord + ' Birthday Trivia Book',
      'Happy ' + r.ord + ' Birthday Trivia',
      'Born in ' + r.born + ': The ' + r.ord + ' Birthday Trivia Book',
      'The ' + r.ord + ' Birthday Quiz Book'
    ];
  }

  function subtitleIdea(book) {
    var r = reader(book);
    return 'Fun Questions, Fun Facts and Happy Memories from ' + r.born + ' to Today';
  }

  function bookTitle(book) { return (book.title || '').trim() || titleIdeas(book)[0]; }
  function bookSubtitle(book) { return (book.subtitle || '').trim() || subtitleIdea(book); }

  function newProject() {
    return {
      v: 1,
      seed: CX.util.randomSeed(),
      book: { age: 90, year: new Date().getFullYear(), country: 'us', title: '', subtitle: '', author: '', trim: '6x9', paper: 'white', print: 'large' },
      plan: { style: 'topic', topics: DEFAULT_TOPICS.slice(), perChapter: 20, answers: 'chapter' },
      extras: { born: true, memories: true, scores: true, wishes: true },
      questions: {},          // chapter id -> [{ q, o: [options], a: index of the right option, f: fun fact }]
      ai: { welcome: [], born: [], memories: [], blurb: '' },
      cover: { design: 'badge', palette: '' }   // palette '': the template's own colors
    };
  }

  // Fills in anything an older or hand-edited project file is missing.
  function normalize(p) {
    var d = newProject();
    p = p && typeof p === 'object' ? p : {};
    var out = { v: 1, seed: typeof p.seed === 'string' && p.seed ? p.seed : d.seed };
    ['book', 'plan', 'extras', 'ai', 'cover'].forEach(function (k) {
      out[k] = Object.assign({}, d[k], p[k] && typeof p[k] === 'object' ? p[k] : {});
    });
    out.questions = p.questions && typeof p.questions === 'object' ? p.questions : {};
    if (!Array.isArray(out.plan.topics)) out.plan.topics = DEFAULT_TOPICS.slice();
    out.book.age = CX.util.clamp(Math.round(+out.book.age) || 90, 18, 110);
    out.book.year = CX.util.clamp(Math.round(+out.book.year) || d.book.year, 1990, 2100);
    out.plan.perChapter = CX.util.clamp(Math.round(+out.plan.perChapter) || 20, 5, 40);
    ['welcome', 'born', 'memories'].forEach(function (k) { if (!Array.isArray(out.ai[k])) out.ai[k] = []; });
    if (typeof out.ai.blurb !== 'string') out.ai.blurb = '';
    return out;
  }

  CX.plan = {
    COUNTRIES: COUNTRIES, TOPICS: TOPICS, DEFAULT_TOPICS: DEFAULT_TOPICS, NUM: NUM,
    country: country, topic: topic, ordinal: ordinal, reader: reader, decades: decades, chapters: chapters,
    titleIdeas: titleIdeas, subtitleIdea: subtitleIdea, bookTitle: bookTitle, bookSubtitle: bookSubtitle,
    newProject: newProject, normalize: normalize
  };
})(typeof window !== 'undefined' ? window : globalThis);
