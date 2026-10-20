/*
 * Node harness that loads the browser scripts exactly the way index.html does:
 * plain <script src> semantics inside one shared global (window) — no modules.
 * Used by test/qa.js. Not shipped to the app folder's runtime.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function loadApp(opts = {}) {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.console = console;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.Math = Math;
  sandbox.navigator = { userAgent: 'node', platform: 'node' };
  sandbox.document = {
    createElement: () => ({ style: {}, getContext: () => null, setAttribute() {}, appendChild() {} }),
    createElementNS: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    documentElement: { style: {} },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}
  };
  sandbox.location = { href: 'file:///binario/index.html' };
  sandbox.btoa = (s) => Buffer.from(s, 'latin1').toString('base64');
  sandbox.atob = (s) => Buffer.from(s, 'base64').toString('latin1');

  vm.createContext(sandbox);

  const files = [];
  if (opts.pdf) files.push('vendor/jspdf.umd.min.js', 'vendor/font-notosans.js');
  files.push('js/binario-core.js');
  if (opts.layout !== false && fs.existsSync(path.join(ROOT, 'js/kdp-layout.js'))) files.push('js/kdp-layout.js');
  if (opts.pdf) files.push('js/pdf-export.js');
  if (opts.preview) files.push('js/preview.js');

  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  }
  return sandbox;
}

module.exports = { loadApp, ROOT };
