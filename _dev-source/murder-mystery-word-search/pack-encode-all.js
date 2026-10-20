/**
 * Encodes HTML/JS/CSS for distribution while keeping file:// working.
 * Usage: node pack-encode-all.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const DEST = path.basename(path.dirname(SRC)) === '_dev-source'
  ? path.resolve(SRC, '..', '..', 'murder-mystery-word-search')
  : SRC;
const KEY = Buffer.from([0x71, 0x2a, 0x9f, 0x14, 0xc8, 0x53, 0xe6, 0x0b, 0x4d, 0xb1, 0x38, 0xd4, 0x67, 0x1c, 0xa2, 0x5e]);
if (SRC === DEST) {
  throw new Error('Run this from _dev-source/murder-mystery-word-search so source files are not overwritten.');
}
const CHUNK = 1200;

const APP_SCRIPTS = [
  'js/vendor/jspdf.umd.min.js',
  'js/fonts.base64.js',
  'js/rng.js',
  'js/validate.js',
  'js/prompt.js',
  'js/engine.js',
  'js/layout.js',
  'js/preview.js',
  'js/pdf.js',
  'js/store.js',
  'js/sample.js',
  'js/ui.js',
  'js/app.js'
];

const ENCODE_JS_FILES = APP_SCRIPTS.slice();

function readUtf8(relPath) {
  return fs.readFileSync(path.join(SRC, relPath), 'utf8');
}

function writeUtf8(relPath, text) {
  const abs = path.join(DEST, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, 'utf8');
}

function copyLicense(relPath) {
  const from = path.join(SRC, relPath);
  const to = path.join(DEST, relPath);
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function xorBuffer(buf, key) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
  return out;
}

function encodeText(text) {
  return xorBuffer(Buffer.from(text, 'utf8'), KEY).toString('base64');
}

function chunkJoin(b64) {
  const parts = [];
  for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));
  return '[' + parts.map((p) => JSON.stringify(p)).join(',') + '].join("")';
}

function keyLiteral() {
  return '[' + Array.from(KEY).join(',') + ']';
}

function decoderFn() {
  return 'function d(a,k){var b=atob(a.replace(/\\s/g,"")),n=b.length,u=new Uint8Array(n),i=0;for(;i<n;i++)u[i]=b.charCodeAt(i)^k[i%k.length];return new TextDecoder("utf-8").decode(u);}';
}

function wrapJs(source) {
  const payload = chunkJoin(encodeText(source));
  return (
    '!function(){' +
    decoderFn() +
    'var t=d(' + payload + ',' + keyLiteral() + ');' +
    'var s=document.createElement("script");s.text=t;' +
    'document.currentScript.parentNode.insertBefore(s,document.currentScript);' +
    '}();'
  );
}

function wrapCss(source) {
  const payload = chunkJoin(encodeText(source));
  return (
    '!function(){' +
    decoderFn() +
    'var t=d(' + payload + ',' + keyLiteral() + ');' +
    'var s=document.createElement("style");s.appendChild(document.createTextNode(t));document.head.appendChild(s);' +
    '}();'
  );
}

function extractBody(html) {
  const withoutScripts = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const withoutLinks = withoutScripts.replace(/<link\b[^>]*>/gi, '');
  const match = withoutLinks.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  if (!match) throw new Error('No <body> found');
  return match[1].trim();
}

function extractInlineCss(html) {
  const blocks = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = re.exec(html))) blocks.push(match[1]);
  return blocks.join('\n');
}

function extractTitle(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : 'App';
}

function packPage(htmlSource, css, scriptFiles) {
  const title = extractTitle(htmlSource);
  const inlineCss = extractInlineCss(htmlSource);
  const payload = {
    h: extractBody(htmlSource),
    c: css + (inlineCss ? '\n' + inlineCss : ''),
    s: scriptFiles.map(readUtf8)
  };
  const encoded = chunkJoin(encodeText(JSON.stringify(payload)));
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + title + '</title>',
    '</head>',
    '<body>',
    '<script>',
    '(function(){',
    decoderFn(),
    'try{',
    'var p=JSON.parse(d(' + encoded + ',' + keyLiteral() + '));',
    'var st=document.createElement("style");',
    'st.appendChild(document.createTextNode(p.c));',
    'document.head.appendChild(st);',
    'var boot=document.currentScript;',
    'boot.insertAdjacentHTML("beforebegin", p.h);',
    'var i,el;',
    'for(i=0;i<p.s.length;i++){',
    'el=document.createElement("script");',
    'el.text=p.s[i];',
    'boot.parentNode.insertBefore(el, boot);',
    'boot.parentNode.removeChild(el);',
    '}',
    'boot.parentNode.removeChild(boot);',
    '}catch(e){',
    'document.body.textContent="This file could not be opened. Use Chrome or Edge.";',
    '}',
    '})();',
    '</script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

function decodeText(b64) {
  return xorBuffer(Buffer.from(b64, 'base64'), KEY).toString('utf8');
}

function assertRoundtrip(label, original) {
  const back = decodeText(encodeText(original));
  if (back !== original) throw new Error('Roundtrip failed: ' + label);
}

function syntaxCheck(rel, source) {
  try {
    new Function(source);
  } catch (error) {
    throw new Error('Syntax error in ' + rel + ': ' + error.message);
  }
}

function verifyPacked(label, html, expectedScriptCount, needle) {
  const match = html.match(/d\(\[([\s\S]*?)\]\.join\(""\),\[/);
  if (!match) throw new Error(label + ': encoded payload missing');
  const parts = JSON.parse('[' + match[1] + ']');
  const payload = JSON.parse(decodeText(parts.join('')));
  if (!payload.h || !payload.c || !Array.isArray(payload.s)) {
    throw new Error(label + ': payload shape invalid');
  }
  if (payload.s.length !== expectedScriptCount) {
    throw new Error(label + ': expected ' + expectedScriptCount + ' scripts, got ' + payload.s.length);
  }
  if (!payload.h.includes(needle)) {
    throw new Error(label + ': HTML body missing ' + needle);
  }
  payload.s.forEach((code, i) => syntaxCheck(label + ' script[' + i + ']', code));
}

function main() {
  const css = readUtf8('css/app.css');
  const appHtml = fs.existsSync(path.join(SRC, 'index.source.html'))
    ? readUtf8('index.source.html')
    : readUtf8('index.html');

  if (!appHtml.includes('f-title')) throw new Error('App HTML source is already encoded');
  if (!css.includes('--gold')) throw new Error('CSS source is already encoded');

  for (const rel of ENCODE_JS_FILES) {
    const source = readUtf8(rel);
    syntaxCheck(rel, source);
    assertRoundtrip(rel, source);
  }
  assertRoundtrip('css', css);

  const packedApp = packPage(appHtml, css, APP_SCRIPTS);
  verifyPacked('index.html', packedApp, APP_SCRIPTS.length, 'f-title');

  writeUtf8('index.html', packedApp);
  writeUtf8('css/app.css', wrapCss(css));

  for (const rel of ENCODE_JS_FILES) {
    writeUtf8(rel, wrapJs(readUtf8(rel)));
  }

  copyLicense('js/OFL.txt');

  const leftoverSource = path.join(DEST, 'index.source.html');
  if (fs.existsSync(leftoverSource)) fs.unlinkSync(leftoverSource);
  const leftoverPack = path.join(DEST, 'pack-encode-all.js');
  if (fs.existsSync(leftoverPack)) fs.unlinkSync(leftoverPack);

  console.log('Encoded distribution in', DEST);
  console.log('Readable source stays in', SRC);
}

main();
