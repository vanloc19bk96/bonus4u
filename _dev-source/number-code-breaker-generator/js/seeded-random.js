/*
 * seeded-random.js — the project's only source of randomness.
 *
 * Every random decision in the generator flows through createSeededRandom() so
 * that the same seed plus the same settings always rebuilds the same book.
 * Raw Math.random() is used in exactly one place: minting a fresh seed string.
 */
(function (global) {
  'use strict';

  /** xfnv1a string hash — turns any seed string into a 32-bit integer. */
  function hashSeed(str) {
    var h = 2166136261 >>> 0;
    var s = String(str);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /**
   * mulberry32 — small, fast, and good enough for puzzle generation.
   * Returns a function producing floats in [0, 1) plus a few helpers.
   */
  function createSeededRandom(seed) {
    var state = hashSeed(seed === undefined || seed === null || seed === '' ? 'default' : seed);

    function next() {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Integer in [min, max] inclusive. */
    next.int = function (min, max) {
      return min + Math.floor(next() * (max - min + 1));
    };

    /** Random element of an array. */
    next.pick = function (arr) {
      return arr[Math.floor(next() * arr.length)];
    };

    /** In-place Fisher-Yates shuffle. */
    next.shuffle = function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(next() * (i + 1));
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    };

    return next;
  }

  /** Mint a human-friendly seed such as "K4M2-9QXP". */
  function generateSeed() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 8; i++) {
      if (i === 4) out += '-';
      out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return out;
  }

  global.NCB_RANDOM = {
    createSeededRandom: createSeededRandom,
    generateSeed: generateSeed,
    hashSeed: hashSeed
  };
})(window);
