/*
 * node-env.js: loads the app's browser scripts into Node for the test scripts.
 * The scripts attach themselves to window.CX; here `window` is simply Node's global.
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

// The same scripts, in the same order, as index.html (without the user interface).
const CORE = ['js/vendor/jspdf.umd.min.js', 'js/fonts.js', 'js/core/util.js', 'js/core/text.js', 'js/core/metrics.js', 'js/core/kdp.js',
  'js/core/reader.js', 'js/core/clues.js', 'js/core/engine.js', 'js/core/packs.js', 'js/core/prompts.js',
  'js/core/book.js', 'js/core/layout.js', 'js/core/cover.js', 'js/core/cover-fronts.js', 'js/core/checklist.js', 'js/render/svg.js', 'js/render/pdf.js'];

function loadAll() { CORE.forEach(f => { if (fs.existsSync(path.join(ROOT, f))) load(f); }); return global.CX; }

module.exports = { ROOT, load, CORE, loadAll };
