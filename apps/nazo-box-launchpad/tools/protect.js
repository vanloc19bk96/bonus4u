// Builds the protected HTML shipped to buyers from the readable source in ../src/.
// The app script is obfuscated (encoded strings, flattened control flow, renamed
// identifiers); markup and CSS stay as they are.
//
//   node protect.js               # writes ../index.html (the file buyers open)
//   node protect.js --test-build  # writes build-test/launchpad.html, keeping the smoke-test hook
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const SRC = path.join(__dirname, '..', 'src', 'launchpad.html');
const IS_TEST_BUILD = process.argv.includes('--test-build');
const OUT_FILE = IS_TEST_BUILD
  ? path.join(__dirname, 'build-test', 'launchpad.html')
  : path.join(__dirname, '..', 'index.html');

const APP_SCRIPT_RE = /<script>\n([\s\S]*?)<\/script>/;
const TEST_HOOK_RE = /\n[ \t]*\/\/ Pure functions[^\n]*\n[ \t]*window\.__launchpad = \{[\s\S]*?\n[ \t]*\};\n/;

// Tuned so the UI stays instant: heavier settings (debugProtection, high
// control-flow thresholds) slow every re-render of the keyword table.
const OBFUSCATOR_OPTIONS = {
  target: 'browser',
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  numbersToExpressions: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 24,
  stringArray: true,
  stringArrayThreshold: 1,
  stringArrayEncoding: ['rc4'],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayIndexShift: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: 'function',
  transformObjectKeys: true,
  selfDefending: true,
  debugProtection: false,
  disableConsoleOutput: false,
  unicodeEscapeSequence: false,
};

function removeTestHook(script) {
  if (!script.includes('window.__launchpad')) return script;
  if (!TEST_HOOK_RE.test(script)) throw new Error('Test hook found but its block did not match TEST_HOOK_RE');
  return script.replace(TEST_HOOK_RE, '\n');
}

async function main() {
  let source = fs.readFileSync(SRC, 'utf8');
  if (IS_TEST_BUILD) {
    // The test copy carries a dummy key locked with the test code, never the real one.
    source = await require('./test-key').withDummyKey(source);
  } else if (/__(SALT|IV|CT)__/.test(source)) {
    throw new Error('AI key not locked yet. Run (in tools/): node encrypt-key.mjs --new-code --from <launchpad.html> --from-code <code>');
  }
  const scriptMatch = source.match(APP_SCRIPT_RE);
  if (!scriptMatch) throw new Error('app <script> block not found');

  let script = scriptMatch[1];
  if (!IS_TEST_BUILD) script = removeTestHook(script);
  if (!IS_TEST_BUILD && script.includes('__launchpad')) throw new Error('test hook survived');

  const obfuscated = JavaScriptObfuscator.obfuscate(script, OBFUSCATOR_OPTIONS).getObfuscatedCode();
  if (/<\/script/i.test(obfuscated)) throw new Error('obfuscated code contains </script');

  const output = source.replace(APP_SCRIPT_RE, () => '<script>\n' + obfuscated + '\n</script>');
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, output, 'utf8');
  const kb = (n) => (n / 1024).toFixed(0) + ' KB';
  console.log('launchpad.html: ' + kb(source.length) + ' -> ' + kb(output.length) + ' in ' + path.relative(process.cwd(), OUT_FILE));
}

main().catch((err) => { console.error(err.message); process.exit(1); });
