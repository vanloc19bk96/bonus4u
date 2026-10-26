/* Shared helpers: namespace, seeded random numbers, hashing, small string tools. */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  // FNV-1a, 32 bit. Stable across browsers, used for seeds and cache keys.
  function hashString(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function hashHex(str) {
    var a = hashString(str), b = hashString('~' + str + '#');
    return ('00000000' + a.toString(16)).slice(-8) + ('00000000' + b.toString(16)).slice(-8);
  }

  // mulberry32: tiny, fast, good enough for puzzle layout.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    var next = mulberry32(hashString(String(seed)));
    var rng = {
      next: next,
      int: function (n) { return Math.floor(next() * n); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = Math.floor(next() * (i + 1));
          var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      }
    };
    return rng;
  }

  function randomSeed() {
    var s = '';
    var chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    var buf = null;
    try {
      if (root.crypto && root.crypto.getRandomValues) { buf = new Uint32Array(10); root.crypto.getRandomValues(buf); }
    } catch (e) { buf = null; }
    for (var i = 0; i < 10; i++) s += chars[(buf ? buf[i] : Math.floor(Math.random() * 4294967296)) % chars.length];
    return s;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  function slugify(s) {
    var out = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return out.slice(0, 60).replace(/-+$/, '') || 'crossword-advent-calendar';
  }

  function countWords(text) {
    var m = String(text || '').match(/[A-Za-z0-9À-ɏ]+(?:['’\-][A-Za-z0-9À-ɏ]+)*/g);
    return m ? m.length : 0;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }

  CX.util = {
    hashString: hashString, hashHex: hashHex, makeRng: makeRng, randomSeed: randomSeed,
    clamp: clamp, clone: clone, slugify: slugify, countWords: countWords,
    escapeHtml: escapeHtml, plural: plural, range: range
  };
})(typeof window !== 'undefined' ? window : globalThis);
