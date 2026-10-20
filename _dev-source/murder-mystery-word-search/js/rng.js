/*! rng.js — mulberry32 and shuffle. Seeded, deterministic. */
(function (global) {
  'use strict';

  function mulberry32(a) {
    var seed = a | 0;
    return function () {
      seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hashSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return seed >>> 0;
    var s = String(seed == null ? '1' : seed);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function shuffle(list, rng) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function pick(list, rng) {
    return list[Math.floor(rng() * list.length)];
  }

  function caseRng(seed, caseId) {
    return mulberry32(hashSeed(seed) + (Number(caseId) || 0));
  }

  global.MMRng = {
    mulberry32: mulberry32,
    hashSeed: hashSeed,
    shuffle: shuffle,
    pick: pick,
    caseRng: caseRng
  };
})(typeof window !== 'undefined' ? window : globalThis);
