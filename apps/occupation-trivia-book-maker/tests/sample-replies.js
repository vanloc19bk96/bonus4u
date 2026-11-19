/*
 * Test data only (not loaded by index.html): replies in the shapes chat models really send,
 * including the drift the reader has to forgive.
 */
'use strict';

// The asked-for format, inside a code block, two chapters, one true-or-false question.
const CLEAN = [
  'Here are your questions!',
  '',
  '```',
  'CHAPTER: Through the Ages',
  'Q: Who is known as "The Lady with the Lamp"?',
  'A) Clara Barton',
  'B) Florence Nightingale',
  'C) Mary Seacole',
  'D) Dorothea Dix',
  'ANSWER: B',
  'FACT: Soldiers in the Crimean War gave her the nickname for her night rounds with a lamp.',
  '',
  'Q: In which war did Florence Nightingale lead a team of nurses?',
  'A) The Crimean War',
  'B) The Boer War',
  'C) World War I',
  'D) The Civil War',
  'ANSWER: A',
  'FACT: She arrived at the hospital in Scutari in 1854 with 38 nurses.',
  '',
  'Q: Florence Nightingale was born in Florence, Italy.',
  'A) True',
  'B) False',
  'ANSWER: A',
  'FACT: She was named after the city where she was born in 1820.',
  '',
  'CHAPTER: Famous Nurses',
  'Q: Which nurse founded the American Red Cross?',
  'A) Clara Barton',
  'B) Mary Breckinridge',
  'C) Lillian Wald',
  'D) Linda Richards',
  'ANSWER: A',
  'FACT: Clara Barton founded the American Red Cross in 1881, at age 59.',
  '',
  'Q: Which Jamaican-born nurse ran the "British Hotel" for soldiers in the Crimea?',
  'A) Edith Cavell',
  'B) Mary Seacole',
  'C) Mary Mahoney',
  'D) Agnes Hunt',
  'ANSWER: B',
  'FACT: A statue of Mary Seacole stands outside St Thomas\' Hospital in London.',
  '```'
].join('\n');

// Drift: bold labels, numbered questions, inline options, "Answer: text", false-first true/false, a broken question.
const MESSY = [
  '**Chapter 2: Famous Nurses**',
  '',
  '1. **Which nurse was the first African American to earn a nursing license in the US?**',
  'A) Mary Mahoney   B) Harriet Tubman   C) Susie King Taylor   D) Mabel Staupers',
  '**Answer:** A) Mary Mahoney',
  '**Fact:** Mary Mahoney graduated from nursing school in 1879.',
  '',
  '2. Which nurse is honored on International Nurses Day, held on her birthday?',
  'a. Florence Nightingale',
  'b. Clara Barton',
  'c. Edith Cavell',
  'd. Virginia Henderson',
  'Correct answer: Florence Nightingale',
  '',
  '3. Who wrote "Notes on Nursing" in 1859?',
  'A) Clara Barton',
  'B) Florence Nightingale',
  'C) Dorothea Dix',
  'D) Lillian Wald',
  '',
  '4. Edith Cavell was an American nurse.',
  'A) False',
  'B) True',
  'Answer: False',
  'Did you know: Edith Cavell was British; she helped soldiers escape occupied Belgium in World War I.'
].join('\n');

const EXTRAS = [
  '```',
  'WELCOME:',
  'Welcome, nurses! You keep hospitals, clinics and communities running, often on very little sleep.',
  '',
  'This book celebrates everything that makes nursing special: its history, its heroes, its lingo and its unforgettable shifts.',
  '',
  'Play on your own, quiz your coworkers on a break, or challenge your family. Have fun!',
  '',
  'FUN FACTS:',
  '- Florence Nightingale was also a pioneering statistician.',
  '- International Nurses Day is held every year on May 12.',
  '- The nursing cap began as a way to keep hair tidy.',
  '- Nurses are often voted the most trusted profession in polls.',
  '',
  'STORY PROMPTS:',
  '1. What made you want to become a nurse?',
  '2. What do you remember about your very first shift?',
  '3. Who was the best mentor you ever had?',
  '',
  'RANKS:',
  '- Student Nurse - Every expert started right here.',
  '- New Grad - You know your way around the ward.',
  '- Charge Nurse: The floor runs smoothly with you on shift.',
  '- **Nurse Educator** — You could teach this book.',
  '- Chief Nursing Officer – A true nursing legend!',
  '',
  'BACK COVER:',
  'Think you know nursing? This fun trivia book puts your knowledge to the test.',
  '```'
].join('\n');

const TOPICS = ['stethoscopes', 'night shifts', 'famous nurses', 'scrubs', 'charting', 'vital signs', 'hospital lingo', 'nursing caps', 'break rooms', 'pagers'];

// A full chapter of made-up questions in the reply format, for layout tests. Every fifth is true or false.
function fakeReply(title, n, seed) {
  const L = ['CHAPTER: ' + title];
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
    L.push('Q: ' + (long ? 'On a busy hospital ward, which of these ' + t + ' became a favorite with nurses everywhere and is still talked about fondly today? (' + title + ' ' + (i + 1) + ')' : 'Which of these ' + t + ' came first in ' + title + ' number ' + (i + 1) + '?'));
    const longOpt = (i + seed) % 7 === 0;
    ['A', 'B', 'C', 'D'].forEach((l, k) => L.push(l + ') ' + (longOpt ? 'A rather long answer choice number ' + (k + 1) : t.slice(0, 1).toUpperCase() + t.slice(1, 6) + ' ' + (k + 1))));
    L.push('ANSWER: ' + 'ABCD'[(i * 7 + seed) % 4 === 3 ? 1 : 2]);
    L.push('FACT: A short fun fact about ' + t + ' that fits on one or two lines of the answer page.');
    L.push('');
  }
  return L.join('\n');
}

module.exports = { CLEAN, MESSY, EXTRAS, fakeReply };
