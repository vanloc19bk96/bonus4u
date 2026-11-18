/*
 * Test data only (index.html never loads this). Real puzzles come from the theme samples in plan.js;
 * synth() makes as many made-up puzzles as a big book needs, with answers from 3 to 12 letters and
 * two-word phrases, so every page size is tried with long and short words.
 */
'use strict';

const SYL = ['BA', 'RO', 'TEN', 'MI', 'LOR', 'KA', 'PEN', 'DU', 'SAM', 'VEL', 'TO', 'NIC', 'WEM', 'GRA', 'HUL', 'ZEP', 'FIN', 'QUO', 'JAX', 'MOR'];

function rng(seed) {
  let a = 0;
  for (const c of String(seed)) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) >>> 0);
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// A made-up answer of about len letters.
function word(r, len) {
  let w = '';
  while (w.length < len) w += SYL[Math.floor(r() * SYL.length)];
  return w.slice(0, len);
}

// n made-up puzzles: [{ groups: [{ link, words }], trap }]. maxLen: the longest answer (12 for adults).
function synth(n, seed, maxLen) {
  const r = rng(seed || 'synth'), out = [];
  maxLen = maxLen || 12;
  for (let i = 0; i < n; i++) {
    const seen = new Set(), groups = [];
    for (let g = 0; g < 4; g++) {
      const words = [];
      while (words.length < 4) {
        let w;
        if (r() < 0.12) w = word(r, 3 + Math.floor(r() * 4)) + ' ' + word(r, 3 + Math.floor(r() * 4));
        else w = word(r, 3 + Math.floor(Math.pow(r(), 1.6) * (maxLen - 2)));
        if (/S$/.test(w)) continue;   // no CAT and CATS by accident
        if (!seen.has(w.replace(/ /g, ''))) { seen.add(w.replace(/ /g, '')); words.push(w); }
      }
      const link = r() < 0.25 ? '___ ' + word(r, 4).toLowerCase() + ' ' + (i * 4 + g + 1) : 'Things that share link number ' + (i * 4 + g + 1) + (r() < 0.3 ? ' in a long and wordy way' : '');
      groups.push({ link, words });
    }
    out.push({ groups, trap: 'A made-up trap.' });
  }
  return out;
}

// A reply in the asked-for format for these puzzles, numbered from nos.
function reply(puzzles, nos) {
  return '```\n' + puzzles.map((p, i) => ['PUZZLE ' + nos[i] + ' (easy)'].concat(p.groups.map((g, k) => 'GROUP ' + (k + 1) + ': ' + g.link + ' = ' + g.words.join(', ')), ['TRAP: ' + p.trap]).join('\n')).join('\n\n') + '\n```';
}

// What chat models really send: bold marks, colors for groups, answers on the next line, notes in brackets.
const MESSY = [
  'Sure! Here are your puzzles:',
  '',
  '**PUZZLE 3 (medium)**',
  '- **Yellow:** Breakfast foods = Toast, Cereal, Bacon, Waffle',
  '- **Green:** Things you crack: EGG, CODE (a secret one), JOKE, SAFE',
  '- **Blue:** Card games – BRIDGE, RUMMY, SNAP, POKER',
  '- **Purple:** ___ tie = BOW, NECK, ZIP, CABLE',
  '**Trap:** EGG looks like a breakfast food.',
  '',
  '### Puzzle 4',
  'Group 1 (most direct): Trees',
  'OAK, PINE, PALM, MAPLE',
  'Group 2: Things that have a key',
  'Answers: PIANO, LOCK, MAP, CAR',
  '1. ___ cake = CUP, PAN, CHEESE, CARROT',
  'Hidden body part = ARMY, CHINA, EARTH, LEGEND',
  'TRAP: MAPLE starts with MAP.',
  '',
  'Let me know if you want more!'
].join('\n');

const EXTRAS = [
  'WELCOME:',
  'Welcome to a book of sixteen-word boards. Take your time, trust your first hunch and watch for the traps.',
  '',
  'CLOSING:',
  'You sorted every board in the book. Well done!',
  'If you enjoyed it, an honest review helps other solvers find it.',
  '',
  'BACK COVER:',
  'Each puzzle hides four groups of four. Find the links, dodge the traps and sort the board.'
].join('\n');

module.exports = { synth, reply, MESSY, EXTRAS };
