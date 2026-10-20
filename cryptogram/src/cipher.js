'use strict';

const { DIFFICULTY, LETTERS } = require('./constants');
const { derangement, numericKey, shuffle } = require('./rng');

function letterFreq(text) {
  const counts = {};
  let total = 0;
  for (const ch of text) {
    if (ch >= 'A' && ch <= 'Z') {
      counts[ch] = (counts[ch] || 0) + 1;
      total++;
    }
  }
  return { counts, total };
}

function distinctLetters(text) {
  const set = new Set();
  for (const ch of text) {
    if (ch >= 'A' && ch <= 'Z') set.add(ch);
  }
  return set;
}

function solvabilityCheck(plain, opts) {
  const minDistinct = (opts && opts.minDistinct) || 12;
  const minWordLen = (opts && opts.minWordLen) || 6;
  const letters = distinctLetters(plain);
  if (letters.size < minDistinct) return `distinct letters < ${minDistinct}`;
  const words = plain.split(/\s+/).filter(Boolean);
  if (!words.some((w) => w.replace(/[^A-Z]/g, '').length >= minWordLen)) {
    return `no word of ≥ ${minWordLen} letters`;
  }
  const { counts, total } = letterFreq(plain);
  if (total > 0) {
    for (const ch of Object.keys(counts)) {
      if (counts[ch] / total > 0.22) return `letter ${ch} > 22%`;
    }
  }
  return null;
}

function pickRevealed(rng, plain, count) {
  if (count <= 0) return [];
  const { counts } = letterFreq(plain);
  const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  const n = Math.min(count, ranked.length);
  return ranked.slice(0, n);
}

function encode(plain, key, numeric) {
  let out = '';
  for (const ch of plain) {
    if (ch >= 'A' && ch <= 'Z') {
      out += numeric ? String(key[ch]) : key[ch];
    } else {
      out += ch;
    }
  }
  return out;
}

/** Token cells for layout: letter/number glyphs stay atomic (esp. numeric 10–26). */
function encodeCells(plain, key, numeric) {
  const cells = [];
  for (const ch of plain) {
    if (ch >= 'A' && ch <= 'Z') {
      cells.push({
        kind: 'letter',
        cipher: String(key[ch]),
        plain: ch,
      });
    } else if (ch === ' ') {
      cells.push({ kind: 'space', cipher: ' ', plain: ' ' });
    } else {
      cells.push({ kind: 'punct', cipher: ch, plain: ch });
    }
  }
  return cells;
}

function invertKey(key) {
  const inv = {};
  for (const k of Object.keys(key)) inv[key[k]] = k;
  return inv;
}

function keyHasFixedPoints(key) {
  for (const k of Object.keys(key)) {
    if (String(key[k]) === k) return true;
  }
  return false;
}

function makePuzzle(rng, quote, difficulty, opts) {
  const band = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  let plain = quote.text;
  if (opts.stripPunctuation || (difficulty === 'expert' && opts.stripPunctuation !== false && opts.forceStrip)) {
    plain = plain.replace(/[.,!?;:'"-]/g, '').replace(/\s+/g, ' ').trim();
  }
  const fail = solvabilityCheck(plain, {
    minDistinct: opts.minDistinct,
    minWordLen: opts.minWordLen,
  });
  if (fail) return { error: fail };

  const useNumeric = opts.numericVariant || band.numeric === true;
  const key = useNumeric
    ? numericKey(rng)
    : derangement(rng, LETTERS, opts.allowReciprocal);

  if (!useNumeric && keyHasFixedPoints(key)) {
    return { error: 'fixed point in key' };
  }

  const revealCount = typeof opts.revealOverride === 'number' ? opts.revealOverride : band.reveal;
  const revealedPlain = pickRevealed(rng, plain, revealCount);
  // revealed as cipher symbols that map to those plain letters
  const revealed = revealedPlain.map((p) => String(key[p]));

  for (const p of revealedPlain) {
    if (!plain.includes(p)) return { error: 'revealed letter missing' };
  }

  const cipher = encode(plain, key, useNumeric);
  const cells = encodeCells(plain, key, useNumeric);
  return {
    plain,
    author: quote.author || '',
    source: quote.source || '',
    theme: quote.theme || '',
    difficulty,
    key,
    invKey: invertKey(key),
    revealed,
    revealedPlain,
    cipher,
    cells,
    numeric: useNumeric,
    aids: band.aids.slice(),
  };
}

function buildDifficultyQueue(count, mix, order, rng) {
  const levels = ['easy', 'medium', 'hard', 'expert'];
  const totalMix = levels.reduce((s, k) => s + (Number(mix[k]) || 0), 0) || 100;
  const queue = [];
  for (const level of levels) {
    const share = (Number(mix[level]) || 0) / totalMix;
    const n = Math.round(count * share);
    for (let i = 0; i < n; i++) queue.push(level);
  }
  while (queue.length < count) queue.push('medium');
  while (queue.length > count) queue.pop();
  if (order === 'shuffled') return shuffle(rng, queue);
  // progressive: easy → expert (already roughly ordered; sort stably)
  const rank = { easy: 0, medium: 1, hard: 2, expert: 3 };
  return queue.sort((a, b) => rank[a] - rank[b]);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    letterFreq,
    distinctLetters,
    solvabilityCheck,
    pickRevealed,
    encode,
    encodeCells,
    invertKey,
    keyHasFixedPoints,
    makePuzzle,
    buildDifficultyQueue,
  };
}
