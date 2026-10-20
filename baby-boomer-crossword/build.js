/**
 * Build single-file crossword-prints.html (offline KDP generator)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const ASSETS = path.join(ROOT, 'assets');
const OUT = path.join(ROOT, 'crossword-prints.html');

const MODULES = [
  ['constants', 'constants.js'],
  ['rng', 'rng.js'],
  ['parser', 'parser.js'],
  ['crossword', 'crossword.js'],
  ['selftest', 'selftest.js'],
  ['layout', 'layout.js'],
  ['validate', 'validate.js'],
  ['render-preview', 'render-preview.js'],
  ['render-pdf', 'render-pdf.js'],
  ['ui', 'ui.js'],
];

function stripModuleBoilerplate(code) {
  return code.replace(/^['"]use strict['"];?\s*/m, '');
}

function wrapModule(name, code) {
  const cleaned = stripModuleBoilerplate(code);
  return `
;__modules[${JSON.stringify('./' + name)}] = function(module, exports, require) {
${cleaned}
};
`;
}

function build() {
  const css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
  const body = fs.readFileSync(path.join(SRC, 'body.html'), 'utf8');
  const jspdf = fs.readFileSync(path.join(ASSETS, 'jspdf.umd.min.js'), 'utf8');
  const fonts = fs.readFileSync(path.join(ASSETS, 'fonts-b64.js'), 'utf8');

  let app = `
var __modules = Object.create(null);
var __cache = Object.create(null);
function require(name) {
  if (__cache[name]) return __cache[name].exports;
  var aliases = {
    './constants': './constants',
    './rng': './rng',
    './parser': './parser',
    './crossword': './crossword',
    './selftest': './selftest',
    './layout': './layout',
    './validate': './validate',
    './render-preview': './render-preview',
    './render-pdf': './render-pdf',
    './ui': './ui'
  };
  var key = aliases[name] || name;
  if (typeof __modules[key] !== 'function') {
    throw new Error('Unknown module: ' + name);
  }
  var mod = { exports: {} };
  __cache[key] = mod;
  __modules[key](mod, mod.exports, require);
  return mod.exports;
}
`;

  for (const [name, file] of MODULES) {
    const code = fs.readFileSync(path.join(SRC, file), 'utf8');
    app += wrapModule(name, code);
  }
  app += `\nrequire('./ui');\n`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Crossword Interior — KDP Puzzle Book Generator</title>
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${jspdf}
</script>
<script>
${fonts}
</script>
<script>
${app}
</script>
</body>
</html>
`;

  fs.writeFileSync(OUT, html, 'utf8');
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log('Wrote', OUT, `(${kb} KB)`);
}

build();
