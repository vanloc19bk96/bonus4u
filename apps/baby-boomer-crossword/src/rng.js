'use strict';

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(globalSeed, index) {
  let h = (Number(globalSeed) >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (index + 1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0 || 1;
}

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

function pickBest(rng, items, scoreFn) {
  if (!items.length) return null;
  let best = items[0];
  let bestScore = scoreFn(best);
  for (let i = 1; i < items.length; i++) {
    const s = scoreFn(items[i]);
    if (s > bestScore || (s === bestScore && rng() < 0.5)) {
      best = items[i];
      bestScore = s;
    }
  }
  return best;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mulberry32, hashSeed, shuffle, pickBest };
}
