/* Loads the app's core scripts into Node's global scope, in the same order as index.html. */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
globalThis.window = globalThis;
const CORE = ['js/fonts.js', 'js/core/util.js', 'js/core/text.js', 'js/core/names.js', 'js/core/metrics.js', 'js/core/themes.js', 'js/core/register.js',
  'js/core/fields.js', 'js/core/clues.js', 'js/core/kdp.js', 'js/core/reader.js', 'js/core/prompts.js', 'js/core/story.js', 'js/core/types.js',
  'js/data/archives.js', 'js/core/book.js', 'js/core/extras.js', 'js/core/layout.js'];
module.exports = function load(extra) {
  CORE.concat(extra || []).forEach(function (f) { require(path.join(ROOT, f)); });
  return globalThis.LK;
};
