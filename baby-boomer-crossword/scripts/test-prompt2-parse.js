'use strict';

const assert = require('assert');
const { parsePrompt2Blocks } = require('../src/parser');

const sample = `
Here is your list:

PUZZLE: Classic Cars of the 1950s
CHEVY | Bowtie-badged carmaker of the era
FINS | Tail styling that grew every model year
CHROME | Shiny trim on every bumper

PUZZLE: Drive-In Movies and Soda Fountains
\`\`\`
JUKEBOX | Coin-fed music machine in every diner
MALT | Thick shake flavour at the fountain
USHER | Person who showed you to your seat
# ignore me
SODA | Fountain drink

PUZZLE: Too Thin
AB | short
ONLY | One valid pair here
`;

const { blocks, warnings } = parsePrompt2Blocks(sample, 12);
assert.strictEqual(blocks.length, 3);
assert.strictEqual(blocks[0].title, 'Classic Cars of the 1950s');
assert.strictEqual(blocks[0].entries.length, 3);
assert.strictEqual(blocks[0].tooFew, false);
assert.strictEqual(blocks[1].title, 'Drive-In Movies and Soda Fountains');
assert.strictEqual(blocks[1].entries.length, 4);
assert.strictEqual(blocks[2].tooFew, true);
assert.ok(warnings.some((w) => /Too Thin/i.test(w)));

const fallback = parsePrompt2Blocks(
  'RADIO | Kitchen companion\nBEATLES | British band\nMUSTANG | Ford pony car',
  13
);
assert.strictEqual(fallback.blocks.length, 1);
assert.strictEqual(fallback.blocks[0].title, '');
assert.strictEqual(fallback.blocks[0].entries.length, 3);

console.log('parsePrompt2Blocks OK');
