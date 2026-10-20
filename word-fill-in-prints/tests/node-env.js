/*
 * node-env.js: loads the app's classic browser scripts into Node for the test scripts.
 * The scripts attach themselves to window.WF; here `window` is simply Node's global.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
global.window = global;

function load(rel) {
  const file = path.join(ROOT, rel);
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}

module.exports = { ROOT, load };
