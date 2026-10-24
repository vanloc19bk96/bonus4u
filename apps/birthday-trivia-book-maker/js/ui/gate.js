/*
 * The access key: the app opens only after a valid key is typed. Only salted, stretched SHA-256
 * hashes of the keys live in this file, never the keys themselves. A key that worked is
 * remembered on this computer (as its hash) so it is asked for once.
 * New key: node tools/make-key.js, then add the printed hash to KEY_HASHES.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  var SALT = 'btb-gate-v1:5ba436fca7d884cb5bb70385d0ca0330';
  var ROUNDS = 20000;
  var KEY_HASHES = [
    '041d90992de56ae72f79a820f4fca7a1f33f3db81134c095d8e83cfabeae52fd',
    'b5d7c9861a973768f490917e67be08ba8405614527b2f448a3bc94159f61b46a'
  ];
  var STORE = 'btb.accessKey';

  // ---------- SHA-256 (plain JavaScript: crypto.subtle is missing on file:// in some browsers) ----------
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function utf8(str) {
    var s = unescape(encodeURIComponent(str)), out = new Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function sha256(str) {
    var bytes = utf8(str), bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (var s = 56; s >= 0; s -= 8) bytes.push(s >= 32 ? Math.floor(bitLen / Math.pow(2, s)) & 0xff : (bitLen >>> s) & 0xff);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var W = new Array(64);
    for (var off = 0; off < bytes.length; off += 64) {
      for (var t = 0; t < 16; t++) {
        var j = off + t * 4;
        W[t] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
      }
      for (t = 16; t < 64; t++) {
        var w15 = W[t - 15], w2 = W[t - 2];
        var s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
        var s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[t] + W[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  // ---------- keys ----------
  // Case, spaces and dashes do not matter: "btb abcd-efgh" is the same key as "BTB-ABCD-EFGH".
  function normalize(key) { return String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  function hashKey(key) {
    var h = sha256(SALT + normalize(key));
    for (var i = 0; i < ROUNDS; i++) h = sha256(h + SALT);
    return h;
  }

  function isKnownHash(h) { return KEY_HASHES.indexOf(h) !== -1; }

  function remembered() {
    try { return root.localStorage.getItem(STORE) || ''; } catch (e) { return ''; }
  }
  function remember(h) {
    try { root.localStorage.setItem(STORE, h); } catch (e) { /* private window: asked again next time */ }
  }

  // ---------- the gate screen ----------
  function open(onOpen) {
    var gate = document.getElementById('gate');
    var unlock = function () {
      gate.hidden = true;
      document.getElementById('app').hidden = false;
      document.getElementById('loading').hidden = false;
      onOpen();
    };
    if (isKnownHash(remembered())) { unlock(); return; }

    var form = document.getElementById('gateForm'), input = document.getElementById('gateKey');
    var error = document.getElementById('gateError'), btn = document.getElementById('gateSubmit');
    document.getElementById('loading').hidden = true;
    gate.hidden = false;
    input.focus();
    input.addEventListener('input', function () { error.textContent = ''; input.classList.remove('invalid'); });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!normalize(input.value)) { error.textContent = 'Type your access key first.'; input.focus(); return; }
      btn.disabled = true;
      setTimeout(function () {   // let the button show it is busy before hashing
        var h = hashKey(input.value);
        btn.disabled = false;
        if (!isKnownHash(h)) {
          error.textContent = 'That key does not work. Check it against your purchase email and try again.';
          input.classList.add('invalid');
          input.select();
          return;
        }
        remember(h);
        unlock();
      }, 30);
    });
  }

  CX.gate = { open: open, hashKey: hashKey, sha256: sha256, normalize: normalize, isKnownHash: isKnownHash, KEY_HASHES: KEY_HASHES };
})(window);
