/*
 * The book plan: which job the book is about, who reads it, and which chapters it has.
 * Chapter titles and the AI's instructions are written for the chosen job ("Famous Nurses",
 * "the core knowledge every electrician needs"). A chapter's id never changes, so questions already
 * written stay with their chapter when the job, the title or the chapter list changes.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  // name: one person who does the job; plural; field: the line of work in a phrase ("nursing");
  // hero: the big word on the cover.
  var JOBS = [
    { id: 'nurse', group: 'Health care', name: 'Nurse', plural: 'Nurses', field: 'nursing', hero: 'NURSE' },
    { id: 'doctor', group: 'Health care', name: 'Doctor', plural: 'Doctors', field: 'medicine', hero: 'DOCTOR' },
    { id: 'pharmacist', group: 'Health care', name: 'Pharmacist', plural: 'Pharmacists', field: 'pharmacy', hero: 'PHARMACIST' },
    { id: 'dentist', group: 'Health care', name: 'Dentist', plural: 'Dentists', field: 'dentistry', hero: 'DENTIST' },
    { id: 'vet', group: 'Health care', name: 'Veterinarian', plural: 'Veterinarians', field: 'veterinary medicine', hero: 'VET' },
    { id: 'therapist', group: 'Health care', name: 'Physical Therapist', plural: 'Physical Therapists', field: 'physical therapy', hero: 'THERAPIST' },
    { id: 'firefighter', group: 'Emergency & service', name: 'Firefighter', plural: 'Firefighters', field: 'firefighting', hero: 'FIREFIGHTER' },
    { id: 'police', group: 'Emergency & service', name: 'Police Officer', plural: 'Police Officers', field: 'policing and law enforcement', hero: 'POLICE' },
    { id: 'paramedic', group: 'Emergency & service', name: 'Paramedic', plural: 'Paramedics and EMTs', field: 'emergency medical services', hero: 'PARAMEDIC' },
    { id: 'military', group: 'Emergency & service', name: 'Military Veteran', plural: 'Military Veterans', field: 'military service', hero: 'VETERAN' },
    { id: 'mail', group: 'Emergency & service', name: 'Mail Carrier', plural: 'Mail Carriers', field: 'the postal service', hero: 'POSTAL' },
    { id: 'social', group: 'Emergency & service', name: 'Social Worker', plural: 'Social Workers', field: 'social work', hero: 'SOCIAL WORK' },
    { id: 'teacher', group: 'Education & science', name: 'Teacher', plural: 'Teachers', field: 'teaching and education', hero: 'TEACHER' },
    { id: 'librarian', group: 'Education & science', name: 'Librarian', plural: 'Librarians', field: 'libraries and librarianship', hero: 'LIBRARIAN' },
    { id: 'scientist', group: 'Education & science', name: 'Scientist', plural: 'Scientists', field: 'science and the lab', hero: 'SCIENTIST' },
    { id: 'engineer', group: 'Education & science', name: 'Engineer', plural: 'Engineers', field: 'engineering', hero: 'ENGINEER' },
    { id: 'coder', group: 'Education & science', name: 'Software Developer', plural: 'Software Developers', field: 'programming and software', hero: 'CODER' },
    { id: 'electrician', group: 'Trades', name: 'Electrician', plural: 'Electricians', field: 'electrical work', hero: 'ELECTRICIAN' },
    { id: 'plumber', group: 'Trades', name: 'Plumber', plural: 'Plumbers', field: 'plumbing', hero: 'PLUMBER' },
    { id: 'carpenter', group: 'Trades', name: 'Carpenter', plural: 'Carpenters', field: 'carpentry and woodworking', hero: 'CARPENTER' },
    { id: 'mechanic', group: 'Trades', name: 'Mechanic', plural: 'Mechanics', field: 'auto repair', hero: 'MECHANIC' },
    { id: 'builder', group: 'Trades', name: 'Construction Worker', plural: 'Construction Workers', field: 'construction', hero: 'BUILDER' },
    { id: 'welder', group: 'Trades', name: 'Welder', plural: 'Welders', field: 'welding and metalwork', hero: 'WELDER' },
    { id: 'farmer', group: 'Trades', name: 'Farmer', plural: 'Farmers', field: 'farming and agriculture', hero: 'FARMER' },
    { id: 'trucker', group: 'Transport', name: 'Truck Driver', plural: 'Truck Drivers', field: 'trucking', hero: 'TRUCKER' },
    { id: 'pilot', group: 'Transport', name: 'Pilot', plural: 'Pilots', field: 'aviation and flying', hero: 'PILOT' },
    { id: 'flight', group: 'Transport', name: 'Flight Attendant', plural: 'Flight Attendants', field: 'cabin crew work', hero: 'CABIN CREW' },
    { id: 'railroad', group: 'Transport', name: 'Railroader', plural: 'Railroaders', field: 'railroads and trains', hero: 'RAILROAD' },
    { id: 'accountant', group: 'Office & business', name: 'Accountant', plural: 'Accountants', field: 'accounting', hero: 'ACCOUNTANT' },
    { id: 'lawyer', group: 'Office & business', name: 'Lawyer', plural: 'Lawyers', field: 'law', hero: 'LAWYER' },
    { id: 'realestate', group: 'Office & business', name: 'Real Estate Agent', plural: 'Real Estate Agents', field: 'real estate', hero: 'REAL ESTATE' },
    { id: 'admin', group: 'Office & business', name: 'Office Administrator', plural: 'Office Administrators', field: 'office work', hero: 'OFFICE' },
    { id: 'chef', group: 'Food & service', name: 'Chef', plural: 'Chefs', field: 'cooking and professional kitchens', hero: 'CHEF' },
    { id: 'barista', group: 'Food & service', name: 'Barista', plural: 'Baristas', field: 'coffee', hero: 'BARISTA' },
    { id: 'hairstylist', group: 'Food & service', name: 'Hairstylist', plural: 'Hairstylists', field: 'hairdressing', hero: 'HAIRSTYLIST' },
    { id: 'jobs', group: 'Any job', name: 'Jobs & Careers', plural: 'Trivia Fans', field: 'jobs and careers of every kind', hero: 'JOBS', general: true },
    { id: 'custom', group: 'Any job', name: '', plural: '', field: '', hero: '' }
  ];

  var AUDIENCES = [
    { id: 'pro', label: 'People who do the job', hint: 'Insider knowledge, jargon and humor from the job', who: 'people who work as {plural} or have retired from the job: they know the work well, so include real job knowledge, jargon and insider humor', mix: 'about a quarter easy, half medium, the rest hard' },
    { id: 'student', label: 'Students and new starters', hint: 'Learning-friendly: each fun fact also teaches', who: 'students and people new to {field}: questions should help them learn, and the fun fact should teach something useful', mix: 'about a third easy, half medium, the rest harder' },
    { id: 'fan', label: 'Family, friends and fans', hint: 'A gift anyone can play: no special knowledge needed', who: 'a general audience who love {field} or know someone in it: no specialist knowledge needed, everything can be guessed or learned from the fun fact', mix: 'about half easy, a third medium, the rest harder' }
  ];

  var COUNTRIES = [
    { id: 'us', label: 'United States', where: 'the United States', spelling: 'American' },
    { id: 'uk', label: 'United Kingdom', where: 'the United Kingdom', spelling: 'British' },
    { id: 'ca', label: 'Canada', where: 'Canada', spelling: 'Canadian' },
    { id: 'au', label: 'Australia', where: 'Australia', spelling: 'Australian' },
    { id: 'world', label: 'Anywhere (worldwide mix)', where: '', spelling: 'American' }
  ];

  // Topic chapters. {name} {plural} {field} {an} are filled in for the job.
  var TOPICS = [
    { id: 'history', title: 'Through the Ages', sub: 'Where it all began and how the job changed', guide: 'the history of {field}: origins, milestones, the first schools and organizations, and how the work changed over time' },
    { id: 'legends', title: 'Famous {plural}', sub: 'Pioneers, heroes and household names', guide: 'famous people in {field}: pioneers, heroes, record holders, inventors and well-known people who once did the job' },
    { id: 'tools', title: 'Tools of the Trade', sub: 'Equipment, gear and uniforms', guide: 'the tools, equipment, machines, gear and uniforms of {field}, what they are called and what they are for' },
    { id: 'lingo', title: 'Talk the Talk', sub: 'Jargon, slang and abbreviations', guide: 'the language of {field}: jargon, slang, nicknames, abbreviations and acronyms, and what they mean' },
    { id: 'know', title: 'Know Your Stuff', sub: 'The know-how every {name} needs', guide: 'the core knowledge of {field}: the basic facts, rules of thumb and know-how that every {name} learns' },
    { id: 'science', title: 'The Science Behind It', sub: 'How and why things work', guide: 'the science and technology behind {field}: how things work and why' },
    { id: 'day', title: 'A Day on the Job', sub: 'Shifts, routines and workplaces', guide: 'everyday life in {field}: shifts, routines, workplaces, coworkers, customers and the break room' },
    { id: 'safety', title: 'Safety First', sub: 'Rules, safety and best practice', guide: 'safety, rules and best practice in {field}: well-known safety symbols, codes, signs and habits (general knowledge only, never instructions to follow)' },
    { id: 'career', title: 'Training & Careers', sub: 'Schools, licenses, ranks and specialties', guide: 'careers in {field}: training, schools, exams, licenses, ranks, titles and specialties' },
    { id: 'screen', title: '{plural} in Pop Culture', sub: 'Movies, TV shows, books and songs', guide: '{field} in pop culture: famous movies, TV shows, books, songs, cartoon characters and toys about the job' },
    { id: 'world', title: 'Around the World', sub: 'How the job works in other countries', guide: '{field} around the world: how the job, its names, uniforms and traditions differ from country to country' },
    { id: 'records', title: 'Firsts & Records', sub: 'Record breakers and big numbers', guide: 'firsts, records and big numbers in {field}: the first, biggest, fastest, oldest and longest' },
    { id: 'weird', title: 'Weird & Wonderful', sub: 'Strange-but-true facts', guide: 'strange-but-true facts, odd traditions, curious inventions and surprising stories from {field}' },
    { id: 'then', title: 'Then & Now', sub: 'How the job has changed', guide: 'how {field} has changed: old ways and old tools compared with today, and how technology changed the job' },
    { id: 'laughs', title: 'Break Room Laughs', sub: 'Light-hearted questions about the job', guide: 'light-hearted, funny questions about life in {field}: famous sayings, quirky habits, holidays and celebrations of the job (kind humor, never mean)' },
    { id: 'final', title: 'The Ultimate Challenge', sub: 'A final round of harder questions', guide: 'a final mixed round about every part of {field}, a little harder than the other chapters' }
  ];
  var DEFAULT_TOPICS = ['history', 'legends', 'tools', 'lingo', 'know', 'day', 'screen', 'world', 'weird', 'final'];

  // For "Jobs & Careers" (every kind of work) some chapters read better with their own words.
  var GENERAL = {
    history: { title: 'Work Through the Ages', guide: 'the history of work: old trades, guilds, apprentices, the factory age and how jobs changed over time' },
    legends: { title: 'Famous Faces at Work', guide: 'famous people and the jobs they did before they were famous, and famous inventors, explorers and pioneers of their trades' },
    tools: { guide: 'the tools, machines, gear and uniforms of many different jobs, and which job uses which tool' },
    lingo: { guide: 'the jargon and slang of many different jobs (kitchens, hospitals, aviation, trucking, theater, offices) and what it means' },
    know: { title: 'Name That Job', sub: 'Which job does what?', guide: 'which job does what: clues about a job, its tasks or its tools, and the job title as the answer' },
    science: { guide: 'the science and technology used at work in many jobs: how things work and why' },
    day: { title: 'A Day at Work', guide: 'everyday working life: shifts, commutes, offices, uniforms, break rooms and famous workplaces' },
    safety: { guide: 'safety at work: well-known safety symbols, signs, colors and protective gear (general knowledge only)' },
    career: { guide: 'careers: training, apprenticeships, degrees, licenses, job titles and ranks across many jobs' },
    screen: { title: 'Jobs in Pop Culture', guide: 'jobs in pop culture: famous movies, TV shows, books, songs and characters and the jobs they do' },
    world: { guide: 'jobs around the world: unusual jobs, national traditions, and how the same job differs from country to country' },
    records: { guide: 'firsts, records and big numbers at work: the biggest employers, longest careers, highest-paid and first-ever jobs' },
    weird: { title: 'Unusual Jobs', sub: 'Strange jobs, old and new', guide: 'strange, unusual and forgotten jobs from history and today (knocker-uppers, ice cutters, gumologists) and strange-but-true workplace facts' },
    then: { guide: 'jobs then and now: jobs that disappeared, jobs that are new, and how technology changed work' },
    laughs: { guide: 'light-hearted, funny questions about working life: office habits, famous sayings, quirky workplace traditions (kind humor, never mean)' },
    final: { guide: 'a final mixed round about every kind of job, a little harder than the other chapters' }
  };

  var NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }
  function country(id) { return byId(COUNTRIES, id); }
  function audience(id) { return byId(AUDIENCES, id); }
  function topic(id) { for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].id === id) return TOPICS[i]; return null; }

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  // "the work of plumbers" -> "The Work of Plumbers": small words stay small after the first.
  function titleCase(s) {
    return clean(s).replace(/(^|[\s\-\/])([a-z])([a-z']*)/g, function (m, a, b, c) {
      return a && /^(of|the|and|a|an|in|on|at|to|for|or)$/.test(b + c) ? m : a + b.toUpperCase() + c;
    });
  }
  // A simple English plural: Nurse -> Nurses, Secretary -> Secretaries, Coach -> Coaches.
  function pluralOf(name) {
    var n = clean(name);
    if (!n) return '';
    if (/[^aeiou]y$/i.test(n)) return n.slice(0, -1) + 'ies';
    if (/(s|x|z|ch|sh)$/i.test(n)) return n + 'es';
    return n + 's';
  }

  /*
   * The job the book is about: { id, name, plural, field, hero, general, custom, about }.
   * A typed job ("custom") takes its words from the book, with sensible fill-ins.
   */
  function job(book) {
    var j = byId(JOBS, book.job);
    if (j.id !== 'custom') return Object.assign({ custom: false, about: '' }, j);
    var name = titleCase(book.jobName) || 'Worker';
    var plural = titleCase(book.jobPlural) || pluralOf(name);
    return {
      id: 'custom', group: j.group, custom: true, general: false,
      name: name, plural: plural,
      field: clean(book.jobField) || 'the work of ' + plural.toLowerCase(),
      hero: name.toUpperCase().length <= 12 ? name.toUpperCase() : name.split(' ').pop().toUpperCase(),
      about: clean(book.jobAbout)
    };
  }

  // The big word on the cover: typed by the user, else the job's own.
  function hero(book) { return clean(book.hero).toUpperCase() || job(book).hero; }

  function fill(s, j) {
    return String(s).replace(/\{name\}/g, j.general ? 'worker' : j.name.toLowerCase())
      .replace(/\{plural\}/g, j.plural).replace(/\{field\}/g, j.field);
  }

  // The chapters of the book, in order: { id, title, sub, guide }.
  function chapters(project) {
    var j = job(project.book), ids = project.plan.topics || [];
    return TOPICS.filter(function (t) { return ids.indexOf(t.id) !== -1; }).map(function (t) {
      var g = j.general ? Object.assign({}, t, GENERAL[t.id] || {}) : t;
      return { id: t.id, title: fill(g.title, j), sub: fill(g.sub, j), guide: fill(g.guide, j) };
    });
  }

  function questionCount(project) { return chapters(project).length * project.plan.perChapter; }

  // A round number for titles: 200, 250, 300 ... never more than the book has.
  function roundCount(n) {
    if (n >= 100) return Math.floor(n / 50) * 50;
    if (n >= 20) return Math.floor(n / 10) * 10;
    return n;
  }

  function titleIdeas(project) {
    var j = job(project.book);
    if (j.general) {
      return ['The Ultimate Jobs & Careers Trivia Book', 'What Do They Do? The Jobs Trivia Book', 'The Big Book of Job Trivia', 'Who Does What? A Trivia Book About Jobs'];
    }
    return [
      'The Ultimate ' + j.name + ' Trivia Book',
      j.name + ' Trivia Challenge',
      'Think You Know ' + titleCase(j.field.split(' and ')[0]).replace(/^(The|A|An) /, function (m) { return m.toLowerCase(); }) + '?',
      'The Big ' + j.name + ' Quiz Book'
    ];
  }

  function subtitleIdea(project) {
    var j = job(project.book), n = roundCount(questionCount(project)), a = project.book.audience;
    var who = j.general ? 'Curious Minds, Students and Trivia Lovers'
      : a === 'student' ? j.plural + ' in Training, Students and New Starters'
        : a === 'fan' ? 'Anyone Who Loves a ' + j.name + ': A Fun Gift' : j.plural + ', Retirees and Everyone in the Job';
    return (n ? n + ' ' : '') + 'Fun Questions, Answers and Facts for ' + who;
  }

  function bookTitle(project) { return clean(project.book.title) || titleIdeas(project)[0]; }
  function bookSubtitle(project) { return clean(project.book.subtitle) || subtitleIdea(project); }

  function newProject() {
    return {
      v: 1,
      app: 'occupation-trivia',
      seed: CX.util.randomSeed(),
      book: {
        job: 'nurse', jobName: '', jobPlural: '', jobField: '', jobAbout: '', audience: 'pro', country: 'us',
        title: '', subtitle: '', hero: '', author: '', trim: '6x9', paper: 'white', print: 'regular'
      },
      plan: { topics: DEFAULT_TOPICS.slice(), perChapter: 20, answers: 'chapter', tf: true },
      extras: { facts: true, ranks: true, stories: false, certificate: true },
      questions: {},          // chapter id -> [{ q, o: [options], a: index of the right option, f: fun fact }]
      ai: { welcome: [], facts: [], stories: [], ranks: [], blurb: '' },
      cover: { design: 'idcard', palette: '' }   // palette '': the template's own colors
    };
  }

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
      if (!topic(k) || !Array.isArray(qs[k])) return;
      out.questions[k] = qs[k].filter(function (q) {
        return q && typeof q.q === 'string' && Array.isArray(q.o) && q.o.length >= 2 && q.o.every(function (o) { return typeof o === 'string'; }) &&
          q.a === Math.floor(q.a) && q.a >= 0 && q.a < q.o.length;
      }).map(function (q) { return { q: q.q, o: q.o.slice(0, 6), a: q.a, f: typeof q.f === 'string' ? q.f : '' }; });
    });
    var b = out.book;
    if (!JOBS.some(function (j) { return j.id === b.job; })) b.job = d.book.job;
    if (!AUDIENCES.some(function (a) { return a.id === b.audience; })) b.audience = d.book.audience;
    if (!COUNTRIES.some(function (c) { return c.id === b.country; })) b.country = d.book.country;
    if (!CX.kdp.TRIMS.some(function (t) { return t.id === b.trim; })) b.trim = d.book.trim;
    if (!CX.kdp.PAPERS.some(function (x) { return x.id === b.paper; })) b.paper = d.book.paper;
    if (['regular', 'large', 'xl'].indexOf(b.print) === -1) b.print = d.book.print;
    ['jobName', 'jobPlural', 'jobField', 'jobAbout', 'title', 'subtitle', 'hero', 'author'].forEach(function (k) { if (typeof b[k] !== 'string') b[k] = ''; });
    var pl = out.plan;
    pl.topics = Array.isArray(pl.topics) ? TOPICS.map(function (t) { return t.id; }).filter(function (id) { return pl.topics.indexOf(id) !== -1; }) : DEFAULT_TOPICS.slice();
    pl.perChapter = CX.util.clamp(Math.round(+pl.perChapter) || 20, 5, 40);
    if (pl.answers !== 'back') pl.answers = 'chapter';
    pl.tf = pl.tf !== false;
    ['facts', 'ranks', 'stories', 'certificate'].forEach(function (k) { out.extras[k] = !!out.extras[k]; });
    ['welcome', 'facts', 'stories', 'ranks'].forEach(function (k) {
      if (!Array.isArray(out.ai[k])) out.ai[k] = [];
      out.ai[k] = out.ai[k].filter(function (x) { return typeof x === 'string' && x.trim(); });
    });
    if (typeof out.ai.blurb !== 'string') out.ai.blurb = '';
    if (typeof out.cover.design !== 'string') out.cover.design = d.cover.design;
    if (typeof out.cover.palette !== 'string') out.cover.palette = '';
    return out;
  }

  CX.plan = {
    JOBS: JOBS, AUDIENCES: AUDIENCES, COUNTRIES: COUNTRIES, TOPICS: TOPICS, DEFAULT_TOPICS: DEFAULT_TOPICS, NUM: NUM,
    country: country, audience: audience, topic: topic, job: job, hero: hero, pluralOf: pluralOf, titleCase: titleCase,
    chapters: chapters, questionCount: questionCount, roundCount: roundCount,
    titleIdeas: titleIdeas, subtitleIdea: subtitleIdea, bookTitle: bookTitle, bookSubtitle: bookSubtitle,
    newProject: newProject, normalize: normalize
  };
})(typeof window !== 'undefined' ? window : globalThis);
