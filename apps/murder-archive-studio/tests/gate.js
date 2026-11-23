/*
 * Checks the NAZO BOX bonus activate key screen (js/ui/gate.js): node tests/gate.js
 * The same file is in Murder Archive Studio, Nostalgia Trivia Book Maker and Occupation Trivia Book Maker.
 * To check the real key without writing it into a file: NZB_KEY=NZB-... node tests/gate.js
 */
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APPS = path.join(ROOT, '..');
const MAKERS = ['murder-archive-studio', 'nostalgia-trivia-book-maker', 'occupation-trivia-book-maker'];
const gateSrc = fs.readFileSync(path.join(ROOT, 'js/ui/gate.js'), 'utf8');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

// gate.js in a sandbox with its own localStorage
function loadGate() {
  const store = {};
  const win = { localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
  vm.runInNewContext(gateSrc, { window: win, globalThis: win }, { filename: 'gate.js' });
  return { G: win.NZBGate, store };
}
const TEST_KEY = 'NZB-TEST-2345-6789-ABCD';

test('SHA-256 matches Node', () => {
  const { G } = loadGate();
  ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'é漢字 test'.repeat(9)].forEach((s) =>
    assert.strictEqual(G.sha256(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'), 'sha256 of ' + s.length + ' chars'));
});

test('only hashes are stored, never a key', () => {
  const { G } = loadGate();
  assert(G.HASHES.length > 0, 'at least one key hash');
  G.HASHES.forEach((h) => assert(/^[0-9a-f]{64}$/.test(h), 'hash ' + h));
  assert(!/NZB-[A-Z0-9]{4}-[A-Z0-9]{4}-/.test(gateSrc.replace(/NZB-X{4}-X{4}-X{4}-X{4}|NZB-ABCD-EFGH-/g, '')), 'a plain key is written in gate.js');
  assert(!/__SALT__|__HASH__/.test(gateSrc), 'salt or hash placeholder left in gate.js');
});

test('wrong keys are refused; case, spaces and dashes do not matter', () => {
  const { G } = loadGate();
  ['', '   ', 'NZB', 'NZB-AAAA-AAAA-AAAA-AAAA', 'KDP-AAAA-AAAA-AAAA-AAAA', TEST_KEY].forEach((k) => assert(!G.check(k), 'accepted ' + JSON.stringify(k)));
  assert.strictEqual(G.hashKey('nzb abcd efgh-2345 6789'), G.hashKey('NZB-ABCD-EFGH-2345-6789'));
  assert.strictEqual(G.canonical('nzb abcd efgh 2345 6789'), 'NZB-ABCD-EFGH-2345-6789');
});

test('a key opens the app, is remembered, and is handed to the Launchpad', () => {
  const { G, store } = loadGate();
  G.HASHES.push(G.hashKey(TEST_KEY));            // a test key for this sandbox only
  assert(!G.isRemembered(), 'remembered before any key');
  const h = G.check('nzb-test 2345 6789 abcd');
  assert(h, 'the test key is refused');
  // what the submit handler does
  store[G.STORE] = h;
  if (!store[G.LAUNCHPAD_STORE]) store[G.LAUNCHPAD_STORE] = G.canonical('nzb-test 2345 6789 abcd');
  assert(G.isRemembered(), 'not remembered');
  assert.strictEqual(store[G.LAUNCHPAD_STORE], TEST_KEY, 'the Launchpad gets the key with its dashes');
});

test('a key typed in the Launchpad opens the app without asking', () => {
  const { G, store } = loadGate();
  G.HASHES.push(G.hashKey(TEST_KEY));
  store[G.LAUNCHPAD_STORE] = TEST_KEY;
  assert(G.isRemembered(), 'the Launchpad key does not open the app');
  assert(G.HASHES.indexOf(store[G.STORE]) !== -1, 'the hash is not remembered');
  const other = loadGate();
  other.store[other.G.LAUNCHPAD_STORE] = 'NZB-WRNG-WRNG-WRNG-WRNG';
  assert(!other.G.isRemembered(), 'a wrong Launchpad key opens the app');
});

test('the Launchpad remembers its key where gate.js looks for it', () => {
  const { G } = loadGate();
  const lp = fs.readFileSync(path.join(APPS, 'nazo-box-launchpad/src/launchpad.html'), 'utf8');
  assert(lp.includes("const STORAGE_KEY   = '" + G.LAUNCHPAD_STORE + "'"), 'Launchpad STORAGE_KEY differs');
});

test('gate.js is the same in all three book makers', () => {
  MAKERS.forEach((app) => {
    const f = path.join(APPS, app, 'js/ui/gate.js');
    assert(fs.existsSync(f), app + ' has no gate.js');
    assert.strictEqual(fs.readFileSync(f, 'utf8'), gateSrc, app + ' has a different gate.js');
    const t = path.join(APPS, app, 'tests/gate.js');
    assert(fs.existsSync(t) && fs.readFileSync(t, 'utf8') === fs.readFileSync(__filename, 'utf8'), app + ' has a different tests/gate.js');
  });
});

test('index.html shows the key screen first and boots through it', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(/<div class="app" id="app" aria-busy="true" hidden>/.test(html), '#app is not hidden');
  ['id="gate"', 'id="gateForm"', 'id="gateKey"', 'id="gateError"', 'id="gateSubmit"'].forEach((id) => assert(html.includes(id), 'missing ' + id));
  const g = html.indexOf('<script src="js/ui/gate.js"></script>'), a = html.indexOf('<script src="js/ui/app.js"></script>');
  assert(g !== -1 && a !== -1 && g < a, 'gate.js must load before app.js');
  const app = fs.readFileSync(path.join(ROOT, 'js/ui/app.js'), 'utf8');
  assert(/root\.NZBGate\.open\(boot\)/.test(app), 'app.js does not boot through the gate');
  assert(!/addEventListener\('DOMContentLoaded', boot\)|else boot\(\);/.test(app), 'app.js still boots without the gate');
});

if (process.env.NZB_KEY) {
  test('the real key (NZB_KEY) opens the app', () => {
    const { G } = loadGate();
    assert(G.check(process.env.NZB_KEY), 'NZB_KEY is refused');
    assert(G.check(process.env.NZB_KEY.toLowerCase().replace(/-/g, ' ')), 'NZB_KEY in lower case with spaces is refused');
  });
}

console.log('\n' + passed + ' passed');
