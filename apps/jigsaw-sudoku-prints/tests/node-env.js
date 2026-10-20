/*
 * node-env.js: loads the app's classic browser scripts into Node for the test scripts.
 * The scripts attach themselves to window.KS; here `window` is simply Node's global.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
global.window = global;
global.self = global;

function load(rel) {
  const file = path.join(ROOT, rel);
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}

// The same scripts, in the same order, as index.html.
const CORE = ['js/vendor/jspdf.umd.min.js', 'js/fonts.js', 'js/engine/engine.js', 'js/engine/workers.js', 'js/core/kdp.js', 'js/core/settings.js',
  'js/core/text.js', 'js/core/grid.js', 'js/core/layout.js', 'js/core/checks.js'];

module.exports = { ROOT, load, CORE };
