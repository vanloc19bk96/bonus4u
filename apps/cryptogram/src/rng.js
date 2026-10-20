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

function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function parseSeed(raw) {
  if (raw === '' || raw == null) return (Date.now() >>> 0) || 1;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return (n >>> 0) || 1;
  let h = 2166136261;
  const s = String(raw);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

function derangement(rng, letters, allowReciprocal) {
  const n = letters.length;
  for (let attempt = 0; attempt < 200; attempt++) {
    const perm = shuffle(rng, letters.split(''));
    let ok = true;
    for (let i = 0; i < n; i++) {
      if (perm[i] === letters[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (!allowReciprocal) {
      const map = {};
      for (let i = 0; i < n; i++) map[letters[i]] = perm[i];
      let recip = false;
      for (let i = 0; i < n; i++) {
        const a = letters[i];
        const b = map[a];
        if (map[b] === a && a < b) {
          recip = true;
          break;
        }
      }
      if (recip) continue;
    }
    const key = {};
    for (let i = 0; i < n; i++) key[letters[i]] = perm[i];
    return key;
  }
  // Fallback: swap-based derangement (may allow reciprocal)
  const perm = letters.split('');
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * i);
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  for (let i = 0; i < n; i++) {
    if (perm[i] === letters[i]) {
      const j = (i + 1) % n;
      const tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }
  }
  const key = {};
  for (let i = 0; i < n; i++) key[letters[i]] = perm[i];
  return key;
}

function numericKey(rng) {
  const nums = shuffle(rng, Array.from({ length: 26 }, (_, i) => i + 1));
  const key = {};
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < 26; i++) key[letters[i]] = nums[i];
  return key;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mulberry32, shuffle, randInt, parseSeed, derangement, numericKey };
}
