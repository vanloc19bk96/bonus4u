/*
 * Words that must never be readable in a printed grid by accident (any of the 8 directions).
 * The puzzle builder refills the random letters when one of these shows up in cells that are
 * not part of a listed word. Kept deliberately short and blunt: profanity, slurs, crude terms.
 */
(function (root) {
  'use strict';
  var Cozy = root.Cozy = root.Cozy || {};
  var WORDS = (
    'FUCK FUCKS FUCKER FUKC FCUK FUK FUQ SHIT SHITE SHITS CUNT CUNTS COCK COCKS DICK DICKS PRICK ' +
    'PUSSY TWAT TWATS WANK WANKER BITCH BITCHES BASTARD SLUT SLUTS WHORE WHORES SKANK HOOKER ' +
    'PISS PISSED ARSE ARSES ASSHOLE ASSES JIZZ CUM CUMS SPUNK SEMEN BONER DILDO ANAL ANUS ' +
    'BOOB BOOBS TITS TITTY TITTIES NIPPLE PENIS VAGINA CLIT ORGASM HORNY SEXY SEX PORN PORNO NUDE ' +
    'NIGGER NIGGA NIGER NEGRO COON SPIC SPICK WETBACK CHINK GOOK KIKE KYKE HEEB DAGO WOP ' +
    'FAG FAGS FAGGOT DYKE TRANNY RETARD RETARDS SPAZ SPASTIC CRIP NAZI NAZIS HITLER KKK ' +
    'RAPE RAPED RAPES RAPIST MOLEST PEDO PEDOS INCEST KILLYOU DIE DIES ' +
    'DAMN GODDAMN CRAP TURD POOP FART FARTS BUTT BUTTS DOUCHE DUMBASS JACKASS HELL'
  ).split(/\s+/).filter(Boolean);

  // Very short or very common words would block normal letter mixes; keep them out of the scan.
  var SKIP_IN_GRID = { DIE: 1, DIES: 1, HELL: 1, BUTT: 1, BUTTS: 1, CRAP: 1, DAMN: 1, SEX: 1, CUM: 1, CUMS: 1, ANUS: 1, ANAL: 1, POOP: 1 };

  var gridWords = WORDS.filter(function (w) { return !SKIP_IN_GRID[w]; });

  // Words that flag prose for a gentle "worth a look" warning (clean cozy tone check).
  var proseWords = WORDS.filter(function (w) {
    return ['DIE', 'DIES', 'BUTT', 'BUTTS', 'CRAP', 'FART', 'FARTS', 'POOP', 'NUDE', 'SEXY', 'COCK', 'COCKS', 'DICK', 'DICKS', 'HOOKER', 'NIPPLE', 'NEGRO', 'NIGER', 'HITLER', 'NAZI', 'NAZIS', 'KILLYOU'].indexOf(w) === -1;
  });

  Cozy.blocklist = { all: WORDS, grid: gridWords, prose: proseWords };
})(typeof window !== 'undefined' ? window : globalThis);
