/* config.js — constants: trim sizes, KDP margin table, font metrics, presets,
   category plans, audience/style rules and the localized book copy. */
(function () {
  var W = window.WYR;

  var C = (W.config = {});

  C.STORAGE_VERSION = 1;
  C.BATCH_SIZE = 50;

  /* --- KDP hard limits (see spec section 3) ----------------------------- */
  C.MIN_FONT_PT = 9;      // KDP floor is 7pt; we keep 9pt so kids can read it
  C.MIN_LINE_PT = 0.75;   // thinnest stroke KDP accepts
  C.MIN_PAGES = 24;
  C.MAX_PAGES = 828;

  /* --- Trim sizes (no bleed: PDF page == trim size) --------------------- */
  C.TRIMS = {
    '6x9':      { label: '6" x 9"',      w: 6,   h: 9,    perPage: 1, note: 'Most popular' },
    '5.5x8.5':  { label: '5.5" x 8.5"',  w: 5.5, h: 8.5,  perPage: 1, note: 'Compact, gift sized' },
    '7x10':     { label: '7" x 10"',     w: 7,   h: 10,   perPage: 2, note: '' },
    '8x10':     { label: '8" x 10"',     w: 8,   h: 10,   perPage: 2, note: '' },
    '8.5x11':   { label: '8.5" x 11"',   w: 8.5, h: 11,   perPage: 2, note: 'Large format' }
  };
  C.TRIM_ORDER = ['6x9', '5.5x8.5', '7x10', '8x10', '8.5x11'];
  C.DEFAULT_TRIM = '6x9';

  /* --- KDP margin table, black & white interior, no bleed --------------- */
  C.GUTTER_TABLE = [
    { max: 150, gutter: 0.375 },
    { max: 300, gutter: 0.5 },
    { max: 500, gutter: 0.625 },
    { max: 700, gutter: 0.75 },
    { max: 828, gutter: 0.875 }
  ];
  C.GUTTER_SAFETY = 0.125;     // always added on top of the KDP minimum
  C.MIN_OUTSIDE = 0.25;        // KDP minimum outside margin, no bleed
  C.OUTSIDE_SMALL = 0.5;       // what we actually use, trim < 8"
  C.OUTSIDE_LARGE = 0.6;       // trim >= 8"
  C.LARGE_TRIM_FROM = 8;       // width in inches that counts as a "large" trim
  /* Breathing room kept between the content and the safe-area edge, so the
     text never looks glued to the margin line. Purely visual: the safe area
     itself stays exactly where KDP wants it. */
  C.CONTENT_INSET = 0.08;

  /* --- Font metrics, read from the shipped TTFs (units per em = 1000) ----
     Both renderers use these numbers, so a line of text sits at the same
     height in the preview and in the PDF. All four faces set
     USE_TYPO_METRICS, so the browser uses exactly these values too. */
  C.FONT_METRICS = {
    'Baloo2-Bold':    { ascent: 1.078, descent: 0.524, cap: 0.602 },
    'Nunito-Regular': { ascent: 1.011, descent: 0.353, cap: 0.705 },
    'Nunito-Bold':    { ascent: 1.011, descent: 0.353, cap: 0.705 },
    'Nunito-Italic':  { ascent: 1.011, descent: 0.353, cap: 0.705 }
  };
  C.FONT_KEY = function (family, style) {
    if (family === 'Baloo2') return 'Baloo2-Bold';
    if (style === 'bold') return 'Nunito-Bold';
    if (style === 'italic') return 'Nunito-Italic';
    return 'Nunito-Regular';
  };
  C.PREVIEW_FAMILY = { Baloo2: 'WYRBaloo2', Nunito: 'WYRNunito' };

  C.LINE_HEIGHT = 1.25;

  /* --- Type scale in points. "large" applies to trims >= 8" wide -------- */
  C.TYPE = {
    one: { prompt: 26, optionMax: 20, optionMin: 14, or: 22, meta: 10 },
    two: { prompt: 18, optionMax: 15, optionMin: 11, or: 16, meta: 9 },
    largeScale: 1.2,
    answers: { body: 10, bodyLarge: 11, head: 12 },
    folio: 9, folioLarge: 10
  };

  /* --- Grey levels. KDP prints a very light tint poorly, keep fills dark
     enough to show up (>= 8% ink). Values are 0..1 luminance. ----------- */
  C.GREY = { box: 0.92, meta: 0.4, rule: 0.35, faint: 0.6 };

  /* --- Step 1 options (labels are what the sidebar shows) ---------------------------------------------------- */
  C.AUDIENCES = [
    { id: 'kids68',   label: 'Kids ages 6-8',        en: 'Kids ages 6-8',
      words: '5-14', rules: 'very simple words a 6 year old can read aloud, grade 1-2 vocabulary',
      bans: ', nothing frightening, no violence', scary: 'a cartoon ghost saying boo' },
    { id: 'kids812',  label: 'Kids ages 8-12',       en: 'Kids ages 8-12',
      words: '6-18', rules: 'simple everyday words, playful tone',
      bans: ', no dating or romance', scary: 'a friendly monster under the bed' },
    { id: 'teens',    label: 'Teens ages 13-17',     en: 'Teens ages 13-17',
      words: '8-22', rules: 'natural teen phrasing, never babyish, never edgy',
      bans: ', no alcohol, no drugs, nothing sexual', scary: 'a spooky campfire story' },
    { id: 'family',   label: 'The whole family',     en: 'The whole family',
      words: '6-18', rules: 'simple words that work for a 7 year old and still amuse an adult',
      bans: '', scary: 'a friendly monster under the bed' },
    { id: 'adults',   label: 'Adults (clean)',       en: 'Adults',
      words: '8-25', rules: 'natural adult phrasing, dry humour welcome',
      bans: ', nothing crude, nothing 18+', scary: 'an awkward dinner party' },
    { id: 'couples',  label: 'Couples (clean)',      en: 'Couples',
      words: '8-25', rules: 'warm, playful phrasing about life together',
      bans: ', nothing crude, nothing 18+', scary: 'an awkward dinner party' }
  ];
  C.DEFAULT_AUDIENCE = 'kids812';

  C.THEMES = [
    { id: 'general',   label: 'General mix',              en: 'General mix' },
    { id: 'silly',     label: 'Silly & Funny',            en: 'Silly & Funny' },
    { id: 'gross',     label: 'Gross & Yuck',             en: 'Gross & Yuck' },
    { id: 'spooky',    label: 'Spooky (gentle)',          en: 'Spooky (gentle)' },
    { id: 'christmas', label: 'Christmas',                en: 'Christmas' },
    { id: 'halloween', label: 'Halloween',                  en: 'Halloween' },
    { id: 'easter',    label: 'Easter',                   en: 'Easter' },
    { id: 'valentine', label: 'Valentine',                  en: "Valentine's Day" },
    { id: 'summer',    label: 'Summer & Road Trip',       en: 'Summer & Road Trip' },
    { id: 'animals',   label: 'Animals',                  en: 'Animals' },
    { id: 'food',      label: 'Food',                     en: 'Food' },
    { id: 'sports',    label: 'Sports',                   en: 'Sports' },
    { id: 'school',    label: 'School',                   en: 'School' },
    { id: 'fantasy',   label: 'Superpowers & Fantasy',    en: 'Superpowers & Fantasy' },
    { id: 'custom',    label: 'Something else…',          en: '' }
  ];
  C.DEFAULT_THEME = 'general';

  /* Category plans per theme. Holiday editions keep a slice of General so a
     300 question book does not feel repetitive (spec section 5.3). */
  C.CATEGORY_PLANS = {
    general:   ['Superpowers', 'Silly & Funny', 'Gross & Yuck', 'Animals', 'Food', 'School', 'Adventure & Travel', 'Future & Fantasy'],
    silly:     ['Weird Bodies', 'Talking Things', 'Silly Jobs', 'Upside-Down Days', 'Funny Food', 'Pet Chaos'],
    gross:     ['Slimy', 'Smelly', 'Icky Food', 'Bugs & Critters', 'Bathroom Humour', 'Silly & Funny'],
    spooky:    ['Friendly Ghosts', 'Haunted House', 'Monsters', 'Dark & Creaky', 'Silly & Funny', 'Superpowers'],
    christmas: ['Santa & Elves', 'Presents', 'Christmas Food', 'Snow & Winter', 'Family Traditions', 'Silly & Funny'],
    halloween: ['Costumes', 'Trick or Treat', 'Monsters', 'Haunted House', 'Spooky Food', 'Silly & Funny'],
    easter:    ['Egg Hunt', 'Bunnies & Chicks', 'Spring Outdoors', 'Easter Treats', 'Family Traditions', 'Silly & Funny'],
    valentine: ['Friendship', 'Sweet Treats', 'Kind Deeds', 'Cards & Gifts', 'Silly & Funny', 'Animals'],
    summer:    ['Beach Days', 'Road Trip', 'Camping', 'Summer Food', 'Water Fun', 'Silly & Funny'],
    animals:   ['Pets', 'Jungle', 'Ocean', 'Farm', 'Tiny Creatures', 'Animal Powers'],
    food:      ['Sweets', 'Weird Combos', 'Breakfast', 'Restaurant Chaos', 'Cooking', 'Silly & Funny'],
    sports:    ['Playground Games', 'Team Sports', 'Water Sports', 'Winter Sports', 'Weird Olympics', 'Silly & Funny'],
    school:    ['Classroom', 'Recess', 'Homework', 'Field Trips', 'Lunchroom', 'Silly & Funny'],
    fantasy:   ['Superpowers', 'Magic Spells', 'Dragons & Beasts', 'Time Travel', 'Space', 'Secret Worlds']
  };
  /* Older audiences get their own plan whatever the theme (spec section 5.3). */
  C.AUDIENCE_PLANS = {
    teens:   ['Social Life', 'School', 'Tech & Internet', 'Future', 'Money', 'Superpowers', 'Food', 'Travel'],
    adults:  ['Life Choices', 'Money', 'Travel', 'Relationships', 'Work', 'Hypothetical', 'Food'],
    couples: ['Life Choices', 'Money', 'Travel', 'Relationships', 'Work', 'Hypothetical', 'Food']
  };

  C.STYLES = [
    { id: 'funny',    label: 'Goofy',     emoji: '😂',
      mix: '70% silly and absurd, 20% gross or weird, 10% thought-provoking' },
    { id: 'balanced', label: 'Balanced',  emoji: '⚖️',
      mix: '45% silly, 35% genuinely hard dilemmas, 20% imaginative or thought-provoking' },
    { id: 'deep',     label: 'Thoughtful', emoji: '🤔',
      mix: '60% real dilemmas, 25% imaginative, 15% plain funny' }
  ];
  C.DEFAULT_STYLE = 'balanced';

  C.LANGUAGES = [
    { id: 'en', label: 'English (US)', en: 'English', spelling: 'use US spelling' },
    { id: 'es', label: 'Spanish',     en: 'Spanish', spelling: 'use neutral Latin American Spanish' },
    { id: 'fr', label: 'French',      en: 'French', spelling: 'use standard French from France' },
    { id: 'de', label: 'German',      en: 'German', spelling: 'use standard German' }
  ];
  C.DEFAULT_LANGUAGE = 'en';

  C.COUNT_CHIPS = [100, 200, 300];
  C.DEFAULT_COUNT = 200;
  C.MIN_COUNT = 20;
  C.MAX_COUNT = 500;

  /* --- Book copy, per language (spec section 7.3). Printed inside the book,
     so it is written in the book language, not in the UI language. ------- */
  C.BOOK_TEXT = {};

  C.BOOK_TEXT.en = {
    prompt: 'Would you rather…', or: 'OR', p1: 'P1', p2: 'P2',
    copyright: 'Copyright © {year} {author}. All rights reserved.',
    copyright2: 'No part of this book may be reproduced, stored in a retrieval system, or transmitted in any form or by any means without written permission from the publisher, except for brief quotations in a review.',
    copyright3: 'First edition, {year}.',
    howToTitle: 'How to Play',
    howToIntro: 'Grab at least one other person, open the book anywhere and read a question out loud. There is no right answer — the fun is in the argument that follows.',
    classicTitle: 'Classic Game',
    classicBody: 'Read the question out loud. Everyone picks A or B, then explains why in one sentence. No skipping, no "both", no "neither". Tick your answer in the box next to the option.',
    scoreTitle: 'Laugh Challenge (Score Mode)',
    scoreBody: 'One player reads the question in the funniest voice they can manage. If anyone laughs, the reader scores 1 point. Pass the book to the left and read the next question. First player to 10 points wins.',
    tipTitle: 'House Rules',
    tipBody: 'Pick a time limit — five seconds is brutal and brilliant. Anyone who says "it depends" loses a point. The youngest player always goes first.',
    answersNote: 'Answers and fun arguments are in the "Behind the Choices" section at the back of the book.',
    scoreSheetTitle: 'Score Sheet',
    scoreSheetNote: 'Tick a box every time you score a point.',
    player1: 'Player 1', player2: 'Player 2',
    answersTitle: 'Behind the Choices',
    answersIntro: 'No answer is wrong — but here is why each question is so hard, plus the best argument for each side. Read these after you have argued it out.',
    whyHard: "Why it's hard:", bonus: 'Bonus:', vs: 'vs',
    yourTurnTitle: 'Your Turn!',
    yourTurnIntro: 'Write your own questions. Try them on your family and see who cannot decide.',
    yourTurnPrompt: 'Would you rather', yourTurnOr: 'OR',
    thanksTitle: 'Thank You!',
    thanksBody: 'Thank you for playing! We hope this book started at least one ridiculous argument.',
    thanksBody2: 'If your family had fun, a short review helps other families find the book. It really does make a difference for a small publisher.',
    thanksBody3: 'Now go and ask someone the hardest question in the book.',
    chapterWord: 'Chapter', questionsWord: 'questions'
  };


  C.BOOK_TEXT.es = {
    prompt: '¿Qué prefieres…', or: 'O', p1: 'J1', p2: 'J2',
    copyright: 'Copyright © {year} {author}. Todos los derechos reservados.',
    copyright2: 'Ninguna parte de este libro puede reproducirse, almacenarse ni transmitirse de ninguna forma sin el permiso escrito del editor, salvo citas breves en una reseña.',
    copyright3: 'Primera edición, {year}.',
    howToTitle: 'Cómo jugar',
    howToIntro: 'Busca al menos a otra persona, abre el libro por cualquier página y lee una pregunta en voz alta. No hay respuesta correcta: la gracia está en la discusión.',
    classicTitle: 'Juego clásico',
    classicBody: 'Lee la pregunta en voz alta. Cada persona elige A o B y explica por qué en una frase. No se puede pasar, ni decir "las dos" ni "ninguna". Marca tu respuesta en la casilla.',
    scoreTitle: 'Reto de risa (con puntos)',
    scoreBody: 'Un jugador lee la pregunta con la voz más graciosa que pueda. Si alguien se ríe, quien lee gana 1 punto. Pasa el libro a la izquierda. Gana quien llegue primero a 10 puntos.',
    tipTitle: 'Reglas de la casa',
    tipBody: 'Pon un límite de tiempo: cinco segundos es cruel y genial. Quien diga "depende" pierde un punto. El más joven empieza siempre.',
    answersNote: 'Las explicaciones y los mejores argumentos están en "Detrás de la elección", al final del libro.',
    scoreSheetTitle: 'Hoja de puntos',
    scoreSheetNote: 'Marca una casilla cada vez que ganes un punto.',
    player1: 'Jugador 1', player2: 'Jugador 2',
    answersTitle: 'Detrás de la elección',
    answersIntro: 'Ninguna respuesta es incorrecta, pero aquí tienes por qué cada pregunta es difícil y el mejor argumento para cada lado.',
    whyHard: 'Por qué cuesta:', bonus: 'Extra:', vs: 'o',
    yourTurnTitle: '¡Te toca!',
    yourTurnIntro: 'Escribe tus propias preguntas y pruébalas con tu familia.',
    yourTurnPrompt: 'Qué prefieres', yourTurnOr: 'O',
    thanksTitle: '¡Gracias!',
    thanksBody: '¡Gracias por jugar! Esperamos que este libro haya provocado al menos una discusión ridícula.',
    thanksBody2: 'Si os habéis divertido, una reseña corta ayuda a otras familias a encontrar el libro.',
    thanksBody3: 'Ahora ve y hazle a alguien la pregunta más difícil del libro.',
    chapterWord: 'Capítulo', questionsWord: 'preguntas'
  };

  C.BOOK_TEXT.fr = {
    prompt: 'Tu préfères…', or: 'OU', p1: 'J1', p2: 'J2',
    copyright: 'Copyright © {year} {author}. Tous droits réservés.',
    copyright2: "Aucune partie de ce livre ne peut être reproduite, stockée ou transmise sous quelque forme que ce soit sans l'autorisation écrite de l'éditeur, à l'exception de courtes citations dans une critique.",
    copyright3: 'Première édition, {year}.',
    howToTitle: 'Comment jouer',
    howToIntro: "Trouve au moins une autre personne, ouvre le livre au hasard et lis une question à voix haute. Il n'y a pas de bonne réponse : tout le plaisir est dans le débat.",
    classicTitle: 'Jeu classique',
    classicBody: 'Lis la question à voix haute. Chacun choisit A ou B et explique pourquoi en une phrase. Interdit de passer, de dire "les deux" ou "aucun". Coche ta réponse dans la case.',
    scoreTitle: 'Défi du rire (avec points)',
    scoreBody: "Un joueur lit la question avec la voix la plus drôle possible. Si quelqu'un rit, le lecteur marque 1 point. Passe le livre à gauche. Le premier à 10 points gagne.",
    tipTitle: 'Règles maison',
    tipBody: "Fixez un temps limite : cinq secondes, c'est cruel et parfait. Celui qui dit \"ça dépend\" perd un point. Le plus jeune commence toujours.",
    answersNote: 'Les explications et les meilleurs arguments sont dans "Derrière le choix", à la fin du livre.',
    scoreSheetTitle: 'Feuille de score',
    scoreSheetNote: 'Coche une case chaque fois que tu marques un point.',
    player1: 'Joueur 1', player2: 'Joueur 2',
    answersTitle: 'Derrière le choix',
    answersIntro: "Aucune réponse n'est fausse, mais voici pourquoi chaque question est difficile et le meilleur argument pour chaque camp.",
    whyHard: "Pourquoi c'est dur :", bonus: 'Bonus :', vs: 'ou',
    yourTurnTitle: 'À toi de jouer !',
    yourTurnIntro: 'Écris tes propres questions et teste-les sur ta famille.',
    yourTurnPrompt: 'Tu préfères', yourTurnOr: 'OU',
    thanksTitle: 'Merci !',
    thanksBody: "Merci d'avoir joué ! Nous espérons que ce livre a déclenché au moins une dispute ridícule.",
    thanksBody2: 'Si vous vous êtes amusés, un court avis aide les autres familles à trouver ce livre.',
    thanksBody3: 'Maintenant, pose à quelqu’un la question la plus dure du livre.',
    chapterWord: 'Chapitre', questionsWord: 'questions'
  };

  C.BOOK_TEXT.de = {
    prompt: 'Was wäre dir lieber…', or: 'ODER', p1: 'S1', p2: 'S2',
    copyright: 'Copyright © {year} {author}. Alle Rechte vorbehalten.',
    copyright2: 'Kein Teil dieses Buches darf ohne schriftliche Genehmigung des Verlags in irgendeiner Form reproduziert, gespeichert oder übertragen werden, ausgenommen kurze Zitate in einer Rezension.',
    copyright3: 'Erste Auflage, {year}.',
    howToTitle: 'So wird gespielt',
    howToIntro: 'Hol dir mindestens eine weitere Person, schlag das Buch irgendwo auf und lies eine Frage laut vor. Es gibt keine richtige Antwort — der Spaß liegt in der Diskussion.',
    classicTitle: 'Klassisches Spiel',
    classicBody: 'Lies die Frage laut vor. Alle wählen A oder B und begründen es in einem Satz. Kein Überspringen, kein "beides", kein "keins". Kreuze deine Antwort im Kästchen an.',
    scoreTitle: 'Lach-Challenge (mit Punkten)',
    scoreBody: 'Eine Person liest die Frage so komisch wie möglich vor. Lacht jemand, gibt es 1 Punkt für die vorlesende Person. Gib das Buch nach links weiter. Wer zuerst 10 Punkte hat, gewinnt.',
    tipTitle: 'Hausregeln',
    tipBody: 'Setzt ein Zeitlimit — fünf Sekunden sind gemein und großartig. Wer "kommt drauf an" sagt, verliert einen Punkt. Die jüngste Person fängt immer an.',
    answersNote: 'Die Erklärungen und besten Argumente stehen im Teil "Hinter der Entscheidung" am Ende des Buches.',
    scoreSheetTitle: 'Punkteblatt',
    scoreSheetNote: 'Kreuze ein Kästchen an, wenn du einen Punkt bekommst.',
    player1: 'Spieler 1', player2: 'Spieler 2',
    answersTitle: 'Hinter der Entscheidung',
    answersIntro: 'Keine Antwort ist falsch — aber hier steht, warum jede Frage so schwer ist, und das beste Argument für jede Seite.',
    whyHard: 'Warum es schwer ist:', bonus: 'Bonus:', vs: 'oder',
    yourTurnTitle: 'Du bist dran!',
    yourTurnIntro: 'Schreib deine eigenen Fragen und probiere sie an deiner Familie aus.',
    yourTurnPrompt: 'Was wäre dir lieber', yourTurnOr: 'ODER',
    thanksTitle: 'Danke!',
    thanksBody: 'Danke fürs Mitspielen! Wir hoffen, dieses Buch hat mindestens einen absurden Streit ausgelöst.',
    thanksBody2: 'Wenn ihr Spaß hattet, hilft eine kurze Rezension anderen Familien, das Buch zu finden.',
    thanksBody3: 'Und jetzt stell jemandem die schwerste Frage im Buch.',
    chapterWord: 'Kapitel', questionsWord: 'Fragen'
  };

  C.text = function (lang) { return C.BOOK_TEXT[lang] || C.BOOK_TEXT.en; };
  C.find = function (list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  };
})();
