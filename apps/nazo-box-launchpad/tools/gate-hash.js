// Prints the hash of an NZB-... activate key for HASHES in the book makers' js/ui/gate.js
// (Murder Archive Studio, Nostalgia Trivia Book Maker, Occupation Trivia Book Maker).
//
//   node gate-hash.js NZB-XXXX-XXXX-XXXX-XXXX
//
// Add the printed hash to HASHES in all three gate.js files. Only the hash goes into the repo
// (it is public): never write the key itself into a file.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const key = process.argv[2];
if (!key) { console.error('Usage: node gate-hash.js NZB-XXXX-XXXX-XXXX-XXXX'); process.exit(1); }

const gateFile = path.join(__dirname, '..', '..', 'nostalgia-trivia-book-maker', 'js', 'ui', 'gate.js');
const sandbox = { globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.runInNewContext(fs.readFileSync(gateFile, 'utf8'), sandbox, { filename: gateFile });
const gate = sandbox.window.NZBGate;

console.log('Hash: ' + gate.hashKey(key));
console.log('Add it to HASHES in js/ui/gate.js of murder-archive-studio, nostalgia-trivia-book-maker and occupation-trivia-book-maker.');
