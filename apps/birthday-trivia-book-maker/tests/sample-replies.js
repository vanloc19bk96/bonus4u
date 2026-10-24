/*
 * Test data only (not loaded by index.html): replies in the shapes chat models really send,
 * including the drift the reader has to forgive.
 */
'use strict';

// The asked-for format, inside a code block, two chapters.
const CLEAN = [
  'Here are your questions!',
  '',
  '```',
  'CHAPTER: Growing Up',
  'Q: Which toy, first sold in 1945, could "walk" down a flight of stairs?',
  'A) Yo-yo',
  'B) Slinky',
  'C) Hula hoop',
  'D) Etch A Sketch',
  'ANSWER: B',
  'FACT: The Slinky was invented by accident when an engineer knocked a spring off a shelf.',
  '',
  'Q: What was the name of the cowboy hero whose horse was called Trigger?',
  'A) Gene Autry',
  'B) Hopalong Cassidy',
  'C) Roy Rogers',
  'D) The Lone Ranger',
  'ANSWER: C',
  'FACT: Trigger was so famous that he was preserved and displayed in a museum.',
  '',
  'Q: Which board game, first sold by Parker Brothers in 1935, lets players buy Boardwalk?',
  'A) Monopoly',
  'B) Scrabble',
  'C) Clue',
  'D) Sorry!',
  'ANSWER: A',
  'FACT: Monopoly money is printed in larger amounts each year than real US dollars.',
  '',
  'CHAPTER: Music & Dancing',
  'Q: Which crooner was nicknamed "The Voice"?',
  'A) Bing Crosby',
  'B) Perry Como',
  'C) Frank Sinatra',
  'D) Dean Martin',
  'ANSWER: C',
  'FACT: Screaming teenage fans called "bobby-soxers" packed his 1944 shows in New York.',
  '',
  'Q: Who recorded "I Walk the Line" in 1956?',
  'A) Hank Williams',
  'B) Johnny Cash',
  'C) Elvis Presley',
  'D) Buddy Holly',
  'ANSWER: B',
  'FACT: Cash hummed before each verse to find his starting note.',
  '```'
].join('\n');

// Drift: bold labels, numbered questions, inline options, "Answer: C) text", a broken question.
const MESSY = [
  '**Chapter 2: Music & Dancing**',
  '',
  '1. **Which dance craze did Chubby Checker start in 1960?**',
  'A) The Twist   B) The Mashed Potato   C) The Stroll   D) The Hustle',
  '**Answer:** A) The Twist',
  '**Fact:** Checker\'s "The Twist" hit number one twice, in 1960 and 1962.',
  '',
  '2. Which band sang "Rock Around the Clock"?',
  'a. Bill Haley & His Comets',
  'b. The Platters',
  'c. The Drifters',
  'd. The Coasters',
  'Correct answer: Bill Haley & His Comets',
  '',
  '3. Who was known as the "King of Rock and Roll"?',
  'A) Little Richard',
  'B) Elvis Presley',
  'C) Chuck Berry',
  'D) Jerry Lee Lewis',
  '',
  '4. Which singer had the hit "Respect" in 1967?',
  'A) Diana Ross',
  'B) Aretha Franklin',
  'C) Tina Turner',
  'D) Gladys Knight',
  'Answer: B',
  'Did you know: The song was written and first recorded by Otis Redding.'
].join('\n');

const EXTRAS = [
  '```',
  'WELCOME:',
  'Happy 90th birthday! Ninety years is a lifetime of songs, stories and good times, and this book is here to bring them all back.',
  '',
  'Since 1936 you have seen radio give way to television, the first steps on the Moon and more changes than anyone could count.',
  '',
  'So gather the family, pour something nice, and see how many answers you remember. Let the fun begin!',
  '',
  'YEAR FACTS:',
  '- Franklin D. Roosevelt was President of the United States.',
  '- A loaf of bread cost about 8 cents.',
  '- Jesse Owens won four gold medals at the Berlin Olympics.',
  '- "Gone with the Wind" was published and became a bestseller.',
  '',
  'MEMORY PROMPTS:',
  '1. What was your very first job, and what did it pay?',
  '2. Which song always gets you dancing?',
  '3. What was your first car?',
  '',
  'BACK COVER:',
  'Turning 90 calls for a celebration! This cheerful trivia book takes the birthday star on a trip down memory lane.',
  '```'
].join('\n');

const TOPICS = ['toys', 'radio shows', 'movie stars', 'baseball', 'cars', 'prices', 'inventions', 'snacks', 'fashion', 'slogans'];

// A full chapter of made-up questions in the reply format, for layout tests.
function fakeReply(title, n, seed) {
  const L = ['CHAPTER: ' + title];
  for (let i = 0; i < n; i++) {
    const t = TOPICS[(i + seed) % TOPICS.length];
    const long = (i + seed) % 4 === 0;
    L.push('Q: ' + (long ? 'In the years after the war, which of these ' + t + ' became a favorite in homes across the country and is still remembered fondly today? (' + title + ' ' + (i + 1) + ')' : 'Which of these ' + t + ' arrived first in ' + title + ' number ' + (i + 1) + '?'));
    const longOpt = (i + seed) % 5 === 0;
    ['A', 'B', 'C', 'D'].forEach((l, k) => L.push(l + ') ' + (longOpt ? 'A rather long answer choice number ' + (k + 1) : t.slice(0, 1).toUpperCase() + t.slice(1, 6) + ' ' + (k + 1))));
    L.push('ANSWER: ' + 'ABCD'[(i * 7 + seed) % 4 === 3 ? 1 : 2]);
    L.push('FACT: A short fun fact about ' + t + ' that fits on one or two lines of the answer page.');
    L.push('');
  }
  return L.join('\n');
}

module.exports = { CLEAN, MESSY, EXTRAS, fakeReply };
