/**
 * Encodes HTML/JS/CSS for distribution while keeping file:// working.
 * Usage: node pack-encode-all.js
 *
 * Readable source stays in this folder. Encoded files are written to
 * ../../wyr-book-studio so double-clicking index.html still runs the app.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const DEST = path.basename(path.dirname(SRC)) === '_dev-source'
  ? path.resolve(SRC, '..', '..', 'wyr-book-studio')
  : SRC;
const KEY = Buffer.from([0x3e, 0xa7, 0x51, 0xc4, 0x18, 0x9d, 0x62, 0xb0, 0x0f, 0xe8, 0x74, 0x2b, 0xd6, 0x45, 0x8c, 0x19]);
if (SRC === DEST) {
  throw new Error('Run this from _dev-source/wyr-book-studio so source files are not overwritten.');
}
const CHUNK = 1200;

const APP_JS = [
  'js/namespace.js',
  'lib/jspdf.umd.min.js',
  'fonts/baloo2-bold.js',
  'fonts/nunito-regular.js',
  'fonts/nunito-bold.js',
  'fonts/nunito-italic.js',
  'js/config.js',
  'js/state.js',
  'js/prompt.js',
  'js/parser.js',
  'js/kdp.js',
  'js/layout.js',
  'js/render-preview.js',
  'js/render-pdf.js',
  'sample/sample-data.js',
  'js/ui.js',
  'js/app.js'
];

function readUtf8(relPath) {
  return fs.readFileSync(path.join(SRC, relPath), 'utf8');
}

function writeUtf8(relPath, text) {
  const abs = path.join(DEST, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, 'utf8');
}

function copyFile(relPath) {
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

function decodeText(b64) {
  return xorBuffer(Buffer.from(b64, 'base64'), KEY).toString('utf8');
}

function chunkJoin(b64) {
  const parts = [];
  for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));
  return '[' + parts.map((part) => JSON.stringify(part)).join(',') + '].join("")';
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
  const withoutStyles = withoutLinks.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const match = withoutStyles.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
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

function extractScripts(html, htmlRel) {
  const base = path.posix.dirname(htmlRel);
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const srcMatch = match[1].match(/src\s*=\s*["']([^"']+)["']/i);
    if (srcMatch) {
      const rel = path.posix.normalize(path.posix.join(base, srcMatch[1]));
      scripts.push(readUtf8(rel));
      continue;
    }
    if (match[2].trim()) scripts.push(match[2]);
  }
  return scripts;
}

function packPage(htmlSource, css, scripts) {
  const title = extractTitle(htmlSource);
  const inlineCss = extractInlineCss(htmlSource);
  const payload = {
    h: extractBody(htmlSource),
    c: css + (inlineCss ? '\n' + inlineCss : ''),
    s: scripts
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
    'document.body.textContent="This file could not be opened. Use Chrome, Edge, or Firefox.";',
    '}',
    '})();',
    '</script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
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
  payload.s.forEach((code, index) => syntaxCheck(label + ' script[' + index + ']', code));
  if (html.includes(needle)) {
    throw new Error(label + ': plaintext leaked into packed HTML');
  }
}

function packHtml(relPath, css, needle) {
  const html = readUtf8(relPath);
  const scripts = extractScripts(html, relPath);
  if (!scripts.length) throw new Error(relPath + ': no scripts found');
  scripts.forEach((code, index) => syntaxCheck(relPath + ' script[' + index + ']', code));
  const packed = packPage(html, css, scripts);
  verifyPacked(relPath, packed, scripts.length, needle);
  writeUtf8(relPath, packed);
  return scripts.length;
}

function main() {
  const appHtml = readUtf8('index.html');
  const css = readUtf8('css/styles.css');
  if (!appHtml.includes('id="btn-sample"')) throw new Error('index.html source is already encoded');
  if (!css.includes('.sidebar')) throw new Error('CSS source is already encoded');

  for (const rel of APP_JS) {
    const source = readUtf8(rel);
    syntaxCheck(rel, source);
    assertRoundtrip(rel, source);
  }
  assertRoundtrip('css', css);
  assertRoundtrip('index-html', appHtml);

  const appCount = packHtml('index.html', css, 'id="btn-sample"');
  const parserCount = packHtml('tests/parser-tests.html', '', 'id="results"');
  const layoutCount = packHtml('tests/layout-tests.html', '', 'id="results"');

  writeUtf8('css/styles.css', wrapCss(css));
  for (const rel of APP_JS) writeUtf8(rel, wrapJs(readUtf8(rel)));

  copyFile('fonts/OFL.txt');
  copyFile('README.md');

  const specInDest = path.join(DEST, 'spec.md');
  if (fs.existsSync(specInDest)) fs.unlinkSync(specInDest);
  const leftoverPack = path.join(DEST, 'pack-encode-all.js');
  if (fs.existsSync(leftoverPack)) fs.unlinkSync(leftoverPack);

  console.log('Encoded distribution in', DEST);
  console.log('Readable source stays in', SRC);
  console.log('Scripts packed: index=' + appCount + ' parser-tests=' + parserCount + ' layout-tests=' + layoutCount);
}

main();
