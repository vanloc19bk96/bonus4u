'use strict';

const { parseWordList } = require('../src/parser');
const { generateCrossword } = require('../src/crossword');
const { runSelfTest } = require('../src/selftest');

const SAMPLES = [
  `CAT | Feline pet
DOG | Canine pet
BIRD | Feathered flyer
FISH | Water animal
HORSE | Farm animal
MOUSE | Small rodent
TIGER | Big cat
LION | King of beasts
ZEBRA | Striped equine
SNAKE | Legless reptile`,
  `APPLE | Red fruit
BANANA | Yellow fruit
ORANGE | Citrus fruit
GRAPE | Vine fruit
MELON | Large summer fruit
CHERRY | Small red stone fruit
PEACH | Fuzzy stone fruit
LEMON | Sour yellow citrus
MANGO | Tropical fruit
PAPAYA | Tropical orange fruit
KIWI | Fuzzy brown fruit
PLUM | Purple stone fruit
PEAR | Bell shaped fruit
BERRY | Small juicy fruit
FIG | Soft Mediterranean fruit`,
  `# cars
MUSTANG | Ford pony car
CAMARO | Chevy rival
FIREBIRD | Pontiac muscle
CHARGER | Dodge muscle
CORVETTE | Chevy sports car
THUNDERBIRD | Ford personal luxury
GTO | Pontiac legend
BARRACUDA | Plymouth muscle
CHALLENGER | Dodge pony
TORINO | Ford intermediate
NOVA | Chevy compact
IMPALA | Chevy full size
`,
];

function padSamples() {
  // Create ~20 sample sets by reusing / shuffling
  const out = [];
  for (let i = 0; i < 20; i++) {
    const base = SAMPLES[i % SAMPLES.length];
    out.push(base);
  }
  return out;
}

let pass = 0;
let fail = 0;
const puzzles = [];

padSamples().forEach((raw, i) => {
  const { entries } = parseWordList(raw, 13);
  const result = generateCrossword(entries, 13, 12345 + i * 17);
  puzzles.push({ result });
});

const report = runSelfTest(puzzles);
console.log(report.report.join('\n'));
console.log(`\nSelf-test: ${report.pass} pass, ${report.fail} fail`);
if (!report.ok) process.exit(1);
