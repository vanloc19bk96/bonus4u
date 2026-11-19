/*
 * Replies as an AI chat sends them back, for the tests: the asked-for format, the drifts chat models
 * make, and the extras. Sentences come from the app's library (real quotes) or are made up for
 * length and letter mixes (the tests only need the shape).
 */
'use strict';

// The asked-for format: PUZZLE n (level) / TEXT: / BY:
function reply(items, nos, levels) {
  return '```\n' + items.map((q, i) => {
    const L = ['PUZZLE ' + nos[i] + ' (' + ((levels && levels[i]) || 'medium') + ')', 'TEXT: ' + q.text];
    if (q.by !== undefined) L.push('BY: ' + q.by);
    return L.join('\n');
  }).join('\n\n') + '\n```';
}

// Chat drift: bold labels, a numbered list, quote — Author on one line, a joke over two lines,
// "Quote:" instead of TEXT, an author on a dash line, chatter before and after.
const MESSY = [
  'Sure! Here are your puzzles:',
  '',
  '**PUZZLE 3 (easy)**',
  '**TEXT:** "Well done is better than well said."',
  '**BY:** Benjamin Franklin',
  '',
  'Puzzle 4 (medium): "Lost time is never found again." — Benjamin Franklin',
  '',
  '### PUZZLE 5 (hard)',
  'Quote: Whenever you find yourself on the side of the majority, it is time to pause and reflect.',
  '— Mark Twain',
  '',
  'PUZZLE 6 (easy)',
  'Q: Why did the scarecrow win an award?',
  'A: Because he was outstanding in his field.',
  '',
  'I hope these work well for your book!'
].join('\n');

const NUMBERED = [
  'Here are 3 more:',
  '1. "A stitch in time saves nine." — English proverb',
  '2. "Diligence is the mother of good luck." - Benjamin Franklin',
  '3. Heaven is under our feet as well as over our heads. — Henry David Thoreau'
].join('\n');

// The old app's paste format: one quote a line, text | author.
const PIPES = [
  'The only thing we have to fear is fear itself. | Franklin D. Roosevelt',
  'Hope is the thing with feathers that perches in the soul. | Emily Dickinson',
  'Not all those who wander are lost, said the old map maker to me.'
].join('\n');

const EXTRAS = [
  '```',
  'WELCOME:',
  'Welcome to a book of secret codes! Every page hides a sentence waiting for you to crack it.',
  '',
  'CLOSING:',
  'You did it! Every code in this book has been cracked.',
  'Thank you for solving along with us.',
  '',
  'BACK COVER:',
  'Each puzzle hides a famous quote in a secret code. Crack it one letter at a time.',
  '```'
].join('\n');

// Made-up sentences of a given length with ordinary words; some heavy on one letter (E), like the
// sentence that once stopped a book ("Letter E > 22%").
const WORDS = ['the', 'green', 'tree', 'keeps', 'sweet', 'bees', 'free', 'every', 'evening', 'deep', 'river', 'quietly', 'jumps', 'over', 'lazy', 'fox', 'world', 'gives', 'back', 'what', 'you', 'bring', 'kind', 'words', 'open', 'many', 'doors', 'patience', 'garden', 'morning'];
function sentence(n, seed) {
  let out = '', i = seed * 7 + 3;
  while (out.length < n) { out += (out ? ' ' : '') + WORDS[i % WORDS.length]; i = (i * 31 + 11) % 997; }
  out = out.slice(0, n).replace(/\s+\S*$/, '');
  return out.charAt(0).toUpperCase() + out.slice(1) + '.';
}

module.exports = { reply, MESSY, NUMBERED, PIPES, EXTRAS, sentence };
