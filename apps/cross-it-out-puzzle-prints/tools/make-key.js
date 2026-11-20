/*
 * Makes an access key and the hash that goes into SHARED.hashes in js/ui/gate.js.
 * One key opens all three makers (Escape Room Book Maker, Birthday Trivia Book Maker,
 * Cross It Out Puzzle Prints), so add the printed hash to SHARED.hashes in all three gate.js.
 *   node tools/make-key.js            a new random key
 *   node tools/make-key.js KDP-...    the hash of a key you already have
 * Keep the key itself out of the repo: only the hash goes into the code.
 */
'use strict';
const crypto = require('crypto');
require('../tests/node-env.js').load('js/ui/gate.js');
const gate = window.CX.gate;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I, easy to type
function group() { return Array.from(crypto.randomBytes(4), (b) => ALPHABET[b % 32]).join(''); }

const key = process.argv[2] || 'KDP-' + [group(), group(), group(), group()].join('-');
console.log('Key:  ' + key);
console.log('Hash: ' + gate.hashKey(key));
console.log('Add the hash to SHARED.hashes in js/ui/gate.js of all three apps.');
