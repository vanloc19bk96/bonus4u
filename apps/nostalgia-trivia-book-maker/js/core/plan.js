/*
 * The book plan: which decades the book visits, which themed rounds each decade has, who reads it
 * and where they grew up. The book is organized like the bestselling nostalgia trivia books on
 * Amazon: one part per decade (an opener page with the decade at a glance, then themed rounds of
 * questions, a "Remember When?" memory page and the answers).
 *
 * A round is one theme inside one decade; its id is "<decade>-<theme>" (for example
 * "1950s-music") and never changes, so questions already written stay with their round when
 * decades or themes are added or removed.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  // nick: the decade's nickname on its opener page; about: what the AI should think of first.
  var DECADES = [
    { id: '1940s', year: 1940, short: "'40s", nick: 'Big Bands & the Home Front', about: 'big bands, radio shows, Hollywood’s golden age, ration books and victory gardens' },
    { id: '1950s', year: 1950, short: "'50s", nick: 'Rock ’n’ Roll & Sock Hops', about: 'rock and roll, drive-ins, diners, sock hops, early television and new suburbs' },
    { id: '1960s', year: 1960, short: "'60s", nick: 'Moonshots & Flower Power', about: 'the British Invasion, Motown, the space race, flower power and color TV' },
    { id: '1970s', year: 1970, short: "'70s", nick: 'Disco, Denim & Eight-Tracks', about: 'disco, bell-bottoms, eight-track tapes, blockbusters, muscle cars and roller skates' },
    { id: '1980s', year: 1980, short: "'80s", nick: 'Arcades, Big Hair & Mixtapes', about: 'arcade games, music videos, big hair, Walkmans, mixtapes and home video' },
    { id: '1990s', year: 1990, short: "'90s", nick: 'Dial-Up, Sitcoms & Boy Bands', about: 'sitcoms, boy bands, grunge, dial-up internet, pagers and video game consoles' },
    { id: '2000s', year: 2000, short: "'00s", nick: 'Flip Phones & Pop Princesses', about: 'flip phones, MP3 players, reality TV, pop princesses and the first social networks' }
  ];
  var DEFAULT_DECADES = ['1950s', '1960s', '1970s', '1980s', '1990s'];

  // The themed rounds. keys: words that name the theme in a chat model's heading.
  var THEMES = [
    { id: 'music', title: 'Music & Dance', sub: 'Hit songs, singers, bands and dance crazes', guide: 'music: hit songs, singers, bands, record labels, dance crazes and how people listened', keys: 'music song songs singer singers band bands dance dancing hits records radio' },
    { id: 'movies', title: 'At the Movies', sub: 'Hit films, movie stars and famous lines', guide: 'movies: hit films, movie stars, famous movie lines, cartoons and going to the movies', keys: 'movie movies film films cinema screen hollywood stars' },
    { id: 'tv', title: 'TV & Radio', sub: 'Favorite shows, hosts and catchphrases', guide: 'television and radio: favorite shows, hosts, characters, catchphrases and theme songs', keys: 'tv television radio shows sitcom sitcoms' },
    { id: 'toys', title: 'Toys, Games & Fads', sub: 'What everyone played with and talked about', guide: 'toys, games, crazes and fads: the toys children wanted, board games, outdoor games and the fads everyone talked about', keys: 'toys toy games fads fad crazes playtime' },
    { id: 'fashion', title: 'Fashion & Hairstyles', sub: 'Clothes, shoes and the looks of the day', guide: 'fashion: clothes, shoes, hairstyles, makeup and the looks everyone copied', keys: 'fashion style styles clothes hair hairstyles' },
    { id: 'food', title: 'Food & Drink', sub: 'Snacks, sodas, recipes and diners', guide: 'food and drink: snacks, candy, cereals, sodas, recipes, kitchen habits and places people went to eat', keys: 'food drink drinks snacks kitchen candy diner diners eats' },
    { id: 'home', title: 'Everyday Life', sub: 'Home, school, family and the neighborhood', guide: 'everyday life: home and family routines, school days, chores, telephones, the mailman, shopping and the neighborhood', keys: 'everyday life home family school daily living' },
    { id: 'cars', title: 'Cars & Travel', sub: 'Cars, road trips and getting around', guide: 'cars and travel: car models, gas stations, road trips, vacations, trains and air travel', keys: 'cars car travel road trips vacations driving' },
    { id: 'tech', title: 'Gadgets & Inventions', sub: 'New things that changed everyday life', guide: 'gadgets and inventions: household appliances, electronics and new things that changed everyday life', keys: 'gadgets gadget inventions invention technology tech science' },
    { id: 'sports', title: 'Sports Heroes', sub: 'Great athletes, teams and big games', guide: 'sports: great athletes, teams, championships, big games and famous records', keys: 'sports sport athletes heroes games' },
    { id: 'famous', title: 'Famous Faces', sub: 'Stars and household names', guide: 'famous people: celebrities, entertainers, comedians, authors and other household names', keys: 'famous faces people celebrities stars names' },
    { id: 'news', title: 'Headlines', sub: 'The happy moments that made the news', guide: 'headlines: celebrations, firsts, landmarks opening, inventions announced, space missions and other upbeat moments that made the news', keys: 'headlines headline news history events moments' },
    { id: 'ads', title: 'Ads & Jingles', sub: 'Slogans, mascots and famous brands', guide: 'advertising: slogans, jingles, mascots, famous brands and their products', keys: 'ads ad advertising jingles jingle slogans brands commercials' },
    { id: 'slang', title: 'Slang & Sayings', sub: 'The words everyone was saying', guide: 'slang and sayings: words, phrases and expressions that were popular then, and what they meant', keys: 'slang sayings words phrases lingo expressions' },
    { id: 'prices', title: 'What It Cost', sub: 'Prices and pay, then and now', guide: 'the cost of living: what everyday things cost (a loaf of bread, a gallon of gas, a stamp, a movie ticket, a car, a house), with answers as rounded, typical prices', keys: 'prices price cost costs money pay' }
  ];
  var DEFAULT_THEMES = ['music', 'movies', 'tv', 'toys', 'food', 'home'];

  var AUDIENCES = [
    { id: 'seniors', label: 'Seniors', hint: 'Gentle, familiar questions that bring back memories', who: 'seniors and older adults who lived through these years, some of them in care homes or memory groups: questions should feel familiar and spark happy memories, never make anyone feel tested', mix: 'mostly easy: about 60% easy, 30% medium and 10% a little harder', words: 'Seniors' },
    { id: 'boomers', label: 'Adults who lived it', hint: 'Baby boomers and Gen X: a real challenge with deep cuts', who: 'adults who grew up in these decades and love a real challenge: include some deep cuts alongside the classics', mix: 'about a third easy, half medium and the rest hard', words: 'Adults' },
    { id: 'family', label: 'The whole family', hint: 'Grandparents and grandkids play together', who: 'whole families: grandparents who remember these years and children or grandchildren who do not, so every question can be guessed or enjoyed by someone who was not there', mix: 'about half easy, a third medium and the rest harder', words: 'the Whole Family' }
  ];

  var COUNTRIES = [
    { id: 'us', label: 'United States', where: 'the United States', spelling: 'American', adj: 'American' },
    { id: 'uk', label: 'United Kingdom', where: 'the United Kingdom', spelling: 'British', adj: 'British' },
    { id: 'ca', label: 'Canada', where: 'Canada', spelling: 'Canadian', adj: 'Canadian' },
    { id: 'au', label: 'Australia', where: 'Australia', spelling: 'Australian', adj: 'Australian' },
    { id: 'world', label: 'Anywhere (worldwide mix)', where: '', spelling: 'American', adj: '' }
  ];

  var NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];
  var PER_ROUND = [5, 8, 10, 12, 15, 20, 25, 30];
  var MIN_PER = 3, MAX_PER = 40;
  // Total questions to aim for; 0 means the user picks the questions per round.
  var TARGETS = [100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000];

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function country(id) { return byId(COUNTRIES, id); }
  function audience(id) { return byId(AUDIENCES, id); }
  function decade(id) { return find(DECADES, id); }
  function theme(id) { return find(THEMES, id); }

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  // Upper case that keeps decades readable: "the 1950s" -> "THE 1950s", "'80s" -> "'80s".
  function upper(s) { return String(s == null ? '' : s).toUpperCase().replace(/(\d)S\b/g, '$1s'); }
  // "the work of plumbers" -> "The Work of Plumbers": small words stay small after the first.
  function titleCase(s) {
    return clean(s).replace(/(^|[\s\-\/])([a-z])([a-z']*)/g, function (m, a, b, c) {
      return a && /^(of|the|and|a|an|in|on|at|to|for|or)$/.test(b + c) ? m : a + b.toUpperCase() + c;
    });
  }

  // The decades of the book, oldest first, as { id, year, title, short, nick, about, n }.
  function decades(project) {
    var ids = project.plan.decades || [];
    return DECADES.filter(function (d) { return ids.indexOf(d.id) !== -1; }).map(function (d, i) {
      return Object.assign({ title: 'The ' + d.id, n: i + 1 }, d);
    });
  }

  function themes(project) {
    var ids = project.plan.themes || [];
    return THEMES.filter(function (t) { return ids.indexOf(t.id) !== -1; });
  }

  // Every round of the book in reading order: { id, decade, theme, title, sub, guide, full, no }.
  // no: the round's number inside its decade.
  function rounds(project) {
    var ts = themes(project), out = [];
    decades(project).forEach(function (d) {
      ts.forEach(function (t, i) {
        out.push({ id: d.id + '-' + t.id, decade: d, theme: t, no: i + 1, title: t.title, sub: t.sub, guide: t.guide, full: d.id + ' – ' + t.title });
      });
    });
    return out;
  }
  function roundsOf(project, decadeId) { return rounds(project).filter(function (r) { return r.decade.id === decadeId; }); }

  function questionCount(project) { return rounds(project).length * project.plan.perRound; }

  /*
   * With a total to aim for, every round gets the same number of questions: the total divided by
   * the rounds, rounded up so the book never has fewer than asked (300 over 30 rounds -> 10 each,
   * 500 -> 17 each = 510). Called whenever decades or themes change. Returns the per-round count.
   */
  function applyTarget(project) {
    var pl = project.plan, n = rounds(project).length;
    if (pl.target > 0 && n) pl.perRound = CX.util.clamp(Math.ceil(pl.target / n), MIN_PER, MAX_PER);
    return pl.perRound;
  }
  // What the total comes to with these rounds, and whether the target can be reached at all.
  function targetInfo(project) {
    var pl = project.plan, n = rounds(project).length, total = n * pl.perRound;
    return { rounds: n, per: pl.perRound, total: total, target: pl.target, short: pl.target > 0 && total < pl.target, over: pl.target > 0 && total > pl.target };
  }

  // A round number for titles: 200, 250, 300 ... never more than the book has.
  function roundCount(n) {
    if (n >= 100) return Math.floor(n / 50) * 50;
    if (n >= 20) return Math.floor(n / 10) * 10;
    return n;
  }

  // "the 1950s to the 1990s", "the 1980s", "the 1950s and 1960s"
  function span(project) {
    var ds = decades(project);
    if (!ds.length) return 'the good old days';
    if (ds.length === 1) return 'the ' + ds[0].id;
    if (ds.length === 2) return 'the ' + ds[0].id + ' and ' + ds[1].id;
    return 'the ' + ds[0].id + ' to the ' + ds[ds.length - 1].id;
  }
  // "1950s–1990s" for the cover and the score card, or the one decade.
  function range(project) {
    var ds = decades(project);
    if (!ds.length) return '';
    return ds.length === 1 ? ds[0].id : ds[0].id + '–' + ds[ds.length - 1].id;
  }

  function titleIdeas(project) {
    var ds = decades(project), a = project.book.audience;
    if (ds.length === 1) {
      return ['The Ultimate ' + ds[0].id + ' Trivia Book', 'Remember the ' + ds[0].id + '? A Nostalgia Trivia Book', ds[0].id + ' Nostalgia Trivia', 'Totally ' + ds[0].id + ' Trivia Challenge'];
    }
    var who = a === 'seniors' ? ' for Seniors' : a === 'family' ? ' for the Whole Family' : '';
    return [
      'Nostalgia Trivia' + who,
      'Remember When? Nostalgia Trivia from ' + span(project),
      'The Big Book of Nostalgia Trivia',
      'Back in the Day: A Nostalgia Trivia Book'
    ];
  }

  function subtitleIdea(project) {
    var n = roundCount(questionCount(project)), b = project.book, e = project.extras, ds = decades(project);
    var lp = b.print === 'xl' ? 'Large-Print ' : '';
    var from = ds.length > 1 ? ' from ' + span(project) : ds.length ? ' About the ' + ds[0].id : '';
    var with_ = e.memories ? 'Answers, Fun Facts and Memory Prompts' : 'Answers and Fun Facts';
    return (n ? n + ' ' : '') + 'Fun ' + lp + 'Questions' + from + ', with ' + with_;
  }

  function bookTitle(project) { return clean(project.book.title) || titleIdeas(project)[0]; }
  function bookSubtitle(project) { return clean(project.book.subtitle) || subtitleIdea(project); }

  // The big word on the cover: typed by the user, else NOSTALGIA (or the one decade).
  function heroIdea(project) {
    var ds = decades(project);
    return ds.length === 1 ? ds[0].id : 'NOSTALGIA';
  }
  function hero(project) { return upper(clean(project.book.hero)) || upper(heroIdea(project)); }

  function newProject() {
    return {
      v: 1,
      app: 'nostalgia-trivia',
      seed: CX.util.randomSeed(),
      book: { audience: 'seniors', country: 'us', title: '', subtitle: '', hero: '', author: '', trim: '8.5x11', paper: 'white', print: 'xl' },
      plan: { decades: DEFAULT_DECADES.slice(), themes: DEFAULT_THEMES.slice(), target: 300, perRound: 10, answers: 'decade', tf: true },
      extras: { eras: true, memories: true, belongs: true, ranks: true, certificate: true },
      questions: {},          // round id -> [{ q, o: [options], a: index of the right option, f: fun fact }]
      eras: {},               // decade id -> { intro: [paragraphs], timeline: ['1955|Disneyland opens'], facts: [], memories: [] }
      ai: { welcome: [], ranks: [], blurb: '' },
      cover: { design: 'cassette', palette: '' }   // palette '': the template's own colors
    };
  }

  function strings(a) { return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string' && x.trim(); }) : []; }

  // Fills in anything an older or hand-edited project file is missing.
  function normalize(p) {
    var d = newProject();
    p = p && typeof p === 'object' ? p : {};
    var out = { v: 1, app: d.app, seed: typeof p.seed === 'string' && p.seed ? p.seed : d.seed };
    ['book', 'plan', 'extras', 'ai', 'cover'].forEach(function (k) {
      out[k] = Object.assign({}, d[k], p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) ? p[k] : {});
    });
    var qs = p.questions && typeof p.questions === 'object' && !Array.isArray(p.questions) ? p.questions : {};
    out.questions = {};
    Object.keys(qs).forEach(function (k) {
      var m = /^(\d{4}s)-([a-z]+)$/.exec(k);
      if (!m || !decade(m[1]) || !theme(m[2]) || !Array.isArray(qs[k])) return;
      out.questions[k] = qs[k].filter(function (q) {
        return q && typeof q.q === 'string' && Array.isArray(q.o) && q.o.length >= 2 && q.o.every(function (o) { return typeof o === 'string'; }) &&
          q.a === Math.floor(q.a) && q.a >= 0 && q.a < Math.min(6, q.o.length);
      }).map(function (q) { return { q: q.q, o: q.o.slice(0, 6), a: q.a, f: typeof q.f === 'string' ? q.f : '' }; });
    });
    var eras = p.eras && typeof p.eras === 'object' && !Array.isArray(p.eras) ? p.eras : {};
    out.eras = {};
    Object.keys(eras).forEach(function (k) {
      if (!decade(k) || !eras[k] || typeof eras[k] !== 'object') return;
      out.eras[k] = { intro: strings(eras[k].intro), timeline: strings(eras[k].timeline), facts: strings(eras[k].facts), memories: strings(eras[k].memories) };
    });
    var b = out.book;
    if (!AUDIENCES.some(function (a) { return a.id === b.audience; })) b.audience = d.book.audience;
    if (!COUNTRIES.some(function (c) { return c.id === b.country; })) b.country = d.book.country;
    if (!CX.kdp.TRIMS.some(function (t) { return t.id === b.trim; })) b.trim = d.book.trim;
    if (!CX.kdp.PAPERS.some(function (x) { return x.id === b.paper; })) b.paper = d.book.paper;
    if (['regular', 'large', 'xl'].indexOf(b.print) === -1) b.print = d.book.print;
    ['title', 'subtitle', 'hero', 'author'].forEach(function (k) { if (typeof b[k] !== 'string') b[k] = ''; });
    var pl = out.plan;
    pl.decades = Array.isArray(pl.decades) ? DECADES.map(function (x) { return x.id; }).filter(function (id) { return pl.decades.indexOf(id) !== -1; }) : DEFAULT_DECADES.slice();
    pl.themes = Array.isArray(pl.themes) ? THEMES.map(function (x) { return x.id; }).filter(function (id) { return pl.themes.indexOf(id) !== -1; }) : DEFAULT_THEMES.slice();
    pl.perRound = CX.util.clamp(Math.round(+pl.perRound) || 10, MIN_PER, MAX_PER);
    pl.target = TARGETS.indexOf(+pl.target) !== -1 ? +pl.target : 0;
    applyTarget(out);
    if (pl.answers !== 'back') pl.answers = 'decade';
    pl.tf = pl.tf !== false;
    ['eras', 'memories', 'belongs', 'ranks', 'certificate'].forEach(function (k) { out.extras[k] = !!out.extras[k]; });
    Object.keys(out.extras).forEach(function (k) { if (!(k in d.extras)) delete out.extras[k]; });
    ['welcome', 'ranks'].forEach(function (k) { out.ai[k] = strings(out.ai[k]); });
    if (typeof out.ai.blurb !== 'string') out.ai.blurb = '';
    Object.keys(out.ai).forEach(function (k) { if (!(k in d.ai)) delete out.ai[k]; });
    if (typeof out.cover.design !== 'string') out.cover.design = d.cover.design;
    if (typeof out.cover.palette !== 'string') out.cover.palette = '';
    return out;
  }

  CX.plan = {
    DECADES: DECADES, THEMES: THEMES, AUDIENCES: AUDIENCES, COUNTRIES: COUNTRIES, DEFAULT_DECADES: DEFAULT_DECADES, DEFAULT_THEMES: DEFAULT_THEMES,
    NUM: NUM, PER_ROUND: PER_ROUND, TARGETS: TARGETS, MIN_PER: MIN_PER, MAX_PER: MAX_PER, applyTarget: applyTarget, targetInfo: targetInfo,
    country: country, audience: audience, decade: decade, theme: theme, titleCase: titleCase, upper: upper,
    decades: decades, themes: themes, rounds: rounds, roundsOf: roundsOf, questionCount: questionCount, roundCount: roundCount, span: span, range: range,
    titleIdeas: titleIdeas, subtitleIdea: subtitleIdea, bookTitle: bookTitle, bookSubtitle: bookSubtitle, heroIdea: heroIdea, hero: hero,
    newProject: newProject, normalize: normalize
  };
})(typeof window !== 'undefined' ? window : globalThis);
