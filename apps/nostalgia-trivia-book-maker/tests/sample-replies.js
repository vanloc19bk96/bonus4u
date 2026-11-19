/*
 * Test data only (not loaded by index.html): replies in the shapes chat models really send,
 * including the drift the reader has to forgive.
 */
'use strict';

// The asked-for format, inside a code block, two rounds, one true-or-false question.
const CLEAN = [
  'Here are your questions!',
  '',
  '```',
  'ROUND: 1950s – Music & Dance',
  'Q: Which singer was known as "The King of Rock and Roll"?',
  'A) Buddy Holly',
  'B) Elvis Presley',
  'C) Chuck Berry',
  'D) Little Richard',
  'ANSWER: B',
  'FACT: Elvis sold over a billion records in his career.',
  '',
  'Q: Which dance craze had teens twisting their hips in the early 1960s and late 1950s?',
  'A) The Twist',
  'B) The Hustle',
  'C) The Macarena',
  'D) The Moonwalk',
  'ANSWER: A',
  'FACT: Chubby Checker’s "The Twist" topped the charts twice.',
  '',
  'Q: Sock hops were often held in school gyms.',
  'A) True',
  'B) False',
  'ANSWER: A',
  'FACT: Dancers took their shoes off to protect the gym floor.',
  '',
  'ROUND: 1950s – At the Movies',
  'Q: Which actress starred in "Roman Holiday" (1953)?',
  'A) Grace Kelly',
  'B) Audrey Hepburn',
  'C) Doris Day',
  'D) Marilyn Monroe',
  'ANSWER: B',
  'FACT: She won the Academy Award for Best Actress for the role.',
  '',
  'Q: Where did families often watch movies from their cars?',
  'A) At the drive-in',
  'B) At the diner',
  'C) At the bowling alley',
  'D) At the soda fountain',
  'ANSWER: A',
  'FACT: There were over 4,000 drive-ins in the United States in the late 1950s.',
  '```'
].join('\n');

// Drift: bold labels, numbered questions, inline options, "Answer: text", false-first true/false, a broken question.
const MESSY = [
  '**Round 3: \'50s TV & Radio**',
  '',
  '1. **Which TV comedy starred Lucille Ball and Desi Arnaz?**',
  'A) I Love Lucy   B) The Honeymooners   C) Leave It to Beaver   D) Father Knows Best',
  '**Answer:** A) I Love Lucy',
  '**Fact:** It was one of the first shows filmed in front of a live audience.',
  '',
  '2. Which western hero rode a horse named Silver?',
  'a. The Lone Ranger',
  'b. Roy Rogers',
  'c. Hopalong Cassidy',
  'd. Davy Crockett',
  'Correct answer: The Lone Ranger',
  '',
  '3. Which show had a family named the Cleavers?',
  'A) Leave It to Beaver',
  'B) Lassie',
  'C) Dragnet',
  'D) Bonanza',
  '',
  '4. Most homes had a color TV by 1955.',
  'A) False',
  'B) True',
  'Answer: False',
  'Did you know: Color sets were rare and expensive until the mid-1960s.'
].join('\n');

const ERAS = [
  '```',
  'DECADE: 1950s',
  'INTRO:',
  'Close your eyes and picture a quiet street, a shiny car in every driveway and a jukebox playing down at the diner.',
  '',
  'It was a decade of new homes, new music and a brand-new box in the living room called television.',
  'AT A GLANCE:',
  '- 1951: Color TV broadcasts begin in the United States.',
  '- 1953: Mount Everest is climbed for the first time.',
  '- 1955: Disneyland opens its gates in California.',
  '- 1956: Elvis appears on national TV.',
  '- 1958: The hula hoop becomes a craze.',
  '- 1959: Hawaii becomes the 50th state.',
  'DID YOU KNOW:',
  '- A gallon of gas cost about 27 cents.',
  '- The first credit card was introduced in 1950.',
  '- Frozen TV dinners went on sale in 1953.',
  'MEMORY PROMPTS:',
  '- What was your favorite song on the radio?',
  '- What did your family drive?',
  '- Where did you go on a Saturday night?',
  '- What treat did you buy with your allowance?',
  '',
  '**The 1960s**',
  'Intro: The sixties brought the Beatles, the space race and a whole new kind of fun.',
  'The 1960s at a glance:',
  '1961 – The first person travels into space.',
  '1964 – The Beatles arrive in America.',
  '1966 – Color TV shows become common.',
  '1967 – The first Super Bowl is played.',
  '1969 – People walk on the Moon.',
  'Did you know?',
  '* The lava lamp was invented in 1963.',
  '* A stamp cost 4 cents for most of the decade.',
  '* The Etch A Sketch went on sale in 1960.',
  'Memory prompts:',
  '1. Where were you when people walked on the Moon?',
  '2. Which band did you love most?',
  '3. What was your favorite TV show?',
  '',
  'DECADE: 2000s',
  'INTRO:',
  'Flip phones and pop princesses.',
  '```'
].join('\n');

const EXTRAS = [
  '```',
  'WELCOME:',
  'Welcome, friend! Pull up a chair and get ready for a trip down memory lane.',
  '',
  'This book is filled with the songs, shows, toys and treats that made the good old days so special.',
  '',
  'Play on your own, quiz your family, or share the stories each question brings back. Have fun!',
  '',
  'RANKS:',
  '- Young Whippersnapper - Every expert started right here.',
  '- Memory Maker - You know your way around the decades.',
  '- Golden Oldie: The good old days are in good hands.',
  '- **Trivia Treasure** — You could have written this book.',
  '- Living Legend – You remember it all!',
  '',
  'BACK COVER:',
  'Do you remember? This fun trivia book takes you back through the decades.',
  '```'
].join('\n');

const TOPICS = ['jukeboxes', 'drive-ins', 'sock hops', 'soda fountains', 'hula hoops', 'transistor radios', 'poodle skirts', 'TV dinners', 'roller skates', 'eight-tracks'];

// A full round of made-up questions in the reply format, for layout tests. Every fifth is true or false.
function fakeReply(title, n, seed) {
  const L = ['ROUND: ' + title];
  for (let i = 0; i < n; i++) {
    const t = TOPICS[(i + seed) % TOPICS.length];
    if ((i + seed) % 5 === 4) {
      L.push('Q: The first ' + t + ' were introduced long before most people think (' + title + ' ' + (i + 1) + ').');
      L.push('A) True', 'B) False');
      L.push('ANSWER: ' + ((i + seed) % 2 ? 'A' : 'B'));
      L.push('FACT: A short fun fact that explains the answer about ' + t + '.');
      L.push('');
      continue;
    }
    const long = (i + seed) % 4 === 0;
    L.push('Q: ' + (long ? 'Back in the good old days, which of these ' + t + ' became a favorite everywhere and is still talked about fondly today? (' + title + ' ' + (i + 1) + ')' : 'Which of these ' + t + ' came first in ' + title + ' number ' + (i + 1) + '?'));
    const longOpt = (i + seed) % 7 === 0;
    ['A', 'B', 'C', 'D'].forEach((l, k) => L.push(l + ') ' + (longOpt ? 'A rather long answer choice number ' + (k + 1) : t.slice(0, 1).toUpperCase() + t.slice(1, 6) + ' ' + (k + 1))));
    L.push('ANSWER: ' + 'ABCD'[(i * 7 + seed) % 4 === 3 ? 1 : 2]);
    L.push('FACT: A short fun fact about ' + t + ' that fits on one or two lines of the answer page.');
    L.push('');
  }
  return L.join('\n');
}

// The decade pages for these decades, in the reply format.
function fakeEras(decades) {
  const L = [];
  decades.forEach((d) => {
    const y = parseInt(d, 10);
    L.push('DECADE: ' + d, 'INTRO:');
    L.push('Close your eyes and picture the ' + d + ': the music on the radio, the shows on TV and the treats at the corner store, all just the way you remember them.');
    L.push('', 'It was a decade of new sounds, new styles and new gadgets, and every family had its own stories to tell about it.');
    L.push('AT A GLANCE:');
    for (let i = 0; i < 8; i++) L.push('- ' + (y + i) + ': A happy moment of the ' + d + ' that everyone talked about' + (i % 3 === 0 ? ' for many years afterwards, at home and at work.' : '.'));
    L.push('DID YOU KNOW:');
    for (let i = 0; i < 5; i++) L.push('- A fun fact about everyday life in the ' + d + ', number ' + (i + 1) + ', with a real number in it.');
    L.push('MEMORY PROMPTS:');
    for (let i = 0; i < 4; i++) L.push('- What do you remember most about the ' + d + ' (memory ' + (i + 1) + ')?');
    L.push('');
  });
  return L.join('\n');
}

module.exports = { CLEAN, MESSY, ERAS, EXTRAS, fakeReply, fakeEras };
