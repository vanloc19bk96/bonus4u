/*
 * Test data only (not loaded by index.html): replies in the shapes chat models really send,
 * including the drift the reader has to forgive, and made-up word lists for whole books.
 */
'use strict';

const CLEAN = [
  'Here are your words!',
  '',
  '```',
  'DAY 1: The First Evening',
  'STORY: Dark comes in before five now, so from tonight the room has to be lit by hand.',
  'QUESTION: Which thing in your house tells you December has actually begun?',
  'WORDS:',
  'LAMPLIGHT | Shine thrown across a dark room',
  'MATCHBOOK | Strike it once and throw it away',
  'SMOKE | Gray drift above a wood fire',
  'ADVENT | The four weeks before December 25',
  'LAMP | It lights the corner of a room',
  'HEARTH | Stone floor in front of the fire',
  'BASIN | Bowl where the dishes are washed',
  'LOG | Thick piece of wood for the fire',
  'TAPER | Slim candle used to light others',
  'GLOW | Soft light from a dying coal',
  'TINDERBOX | Small container of dry kindling',
  'ASHES | Gray powder left in the grate',
  'FLAME | The bright tongue of a fire',
  'CANDLELIGHT | Soft shine from one small wick',
  'KINDLING | Thin sticks that start a fire',
  'SETTEE | Long soft seat in the parlor',
  'MANTEL | Shelf above the open fireplace',
  'SPARK | Tiny flash that starts a fire',
  'WICK | The string inside a candle',
  'EMBERS | Glowing bits left in the grate',
  'POKER | Iron rod for stirring the fire',
  'CURTAIN | Drawn across the window at dusk',
  'SLIPPERS | Soft shoes for the evening',
  'BLANKET | Warm cover for the knees',
  '',
  'DAY 2: Boots in the Hall',
  'STORY: The first wet snow came in on everyone’s boots.',
  'QUESTION: What did you wear on snowy days as a child?',
  'WORDS:',
  'PEG | Hook for a coat',
  'BOOTS | Rubber footwear for slush',
  'MITTENS | Gloves without separate fingers',
  'SCARF | Long strip worn round the neck',
  '```'
].join('\n');

const MESSY = [
  '**Day 3 – Up Before the Others**',
  'Story: The kettle is the only sound in the house.',
  'Memory question: Who was always first up in your house?',
  '1. KETTLE - It whistles when the water boils',
  '2. Toast (5): Browned bread',
  '3. ICE CREAM | A cold dessert',
  '4. DAWN — First light of the day',
  '5. FROST | Its clue says frost',
  '6. SUNRISE | The sun comes up',
  'It | too short',
  '7. **RADIATOR** | Warm metal panel under the window (8)'
].join('\n');

const EXTRAS = [
  '```',
  'WEEK 1:',
  'The strip is empty and the house is waking up.',
  'Take your time with these first gentle grids.',
  '',
  'WEEK 2:',
  'Cards are arriving and the grids give a little less.',
  '',
  'WEEK 3: The busiest week of the year: pour something warm.',
  '',
  'WEEK 4:',
  'The last few days. The sentence is taking shape.',
  '',
  'CHRISTMAS EVE:',
  'You did it! Every grid is full.',
  'Merry Christmas to you and yours.',
  '',
  'BACK COVER:',
  'Open one crossword a day from December 1 and count down to Christmas.',
  '```'
].join('\n');

// Made-up but crossword-friendly words: consonants and vowels in turn, so grids can cross.
const CONS = 'BCDFGHJKLMNPRSTVWYLNRST', VOW = 'AEIOUAEIOE';
function word(i) {
  let x = (i * 2654435761) >>> 0;
  const next = () => { x = (Math.imul(x ^ (x >>> 15), 2246822519) + 0x9E3779B9) >>> 0; return x; };
  const len = 3 + (next() % 9), start = next() % 2;
  let w = '';
  for (let k = 0; k < len; k++) w += (k + start) % 2 ? VOW[next() % VOW.length] : CONS[next() % CONS.length];
  return w;
}
// Every call hands out words no earlier call used, so days never share a word.
const used = new Set();
let counter = 0;
function words(n) {
  const out = [];
  while (out.length < n) {
    const w = word(counter++);
    if (used.has(w)) continue;
    used.add(w);
    out.push(w);
  }
  return out;
}

// A reply for these day labels ("DAY 1", "BONUS DAY 3") with n words each; words differ between seeds.
function fakeReply(labels, n, seed) {
  const L = ['```'];
  labels.forEach((lab, k) => {
    L.push(lab + ': Title Number ' + (seed * 10 + k));
    L.push('STORY: A short warm sentence that sets the scene for this day of the countdown.');
    L.push('QUESTION: What do you remember best about this part of December?');
    L.push('WORDS:');
    words(n).forEach((w, i) => L.push(w + ' | A plain clue for word number ' + (i + 1)));
    L.push('');
  });
  L.push('```');
  return L.join('\n');
}

// Starts the word supply over, so two books made the same way get the same words.
function reset() { used.clear(); counter = 0; }

module.exports = { CLEAN, MESSY, EXTRAS, fakeReply, word, reset };
