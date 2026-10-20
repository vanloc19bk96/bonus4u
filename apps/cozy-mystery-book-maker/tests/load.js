/* Loads the app's browser scripts into Node for tests. Usage: const Cozy = require('./load')(); */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const CORE = [
  'js/fonts.js', 'js/core/util.js', 'js/core/text.js', 'js/core/metrics.js', 'js/core/blocklist.js',
  'js/core/puzzle.js', 'js/core/validate.js', 'js/core/prompts.js', 'js/core/book.js', 'js/core/layout.js', 'js/core/checklist.js',
  'js/data/themes.js', 'js/data/sample.js'
];

module.exports = function load(extra) {
  global.window = global;
  for (const f of CORE.concat(extra || [])) {
    const file = path.join(ROOT, f);
    if (!fs.existsSync(file)) continue;
    vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
  }
  return global.Cozy;
};
module.exports.ROOT = ROOT;
