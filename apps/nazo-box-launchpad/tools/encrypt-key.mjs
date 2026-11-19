// Locks the AI service key inside ../src/launchpad.html behind an activate code.
//
// The page stores the key encrypted (AES-GCM, key derived from the activate code
// with PBKDF2-SHA256, 250,000 rounds). Only the right code decrypts it, so the
// raw key never appears in the shipped file.
//
//   node encrypt-key.mjs --new-code                       # make a new NZB-... code
//   node encrypt-key.mjs --code NZB-XXXX-XXXX-XXXX-XXXX   # keep a code you already gave buyers
//
// The AI key comes from, in order:
//   GRSAI_API_KEY=sk-...                                      (environment variable)
//   --from <other launchpad.html> --from-code <its code>      (reuse the key another launchpad unlocks)
//
// Prints the activate code (put it in the bonus delivery) and never prints the AI key.
import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src', 'launchpad.html');
const ITERATIONS = 250000;
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // no 0/O, 1/I/L

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i === -1 ? '' : (args[i + 1] || ''); };

function normalizeCode(code) { return String(code || '').trim().toUpperCase().replace(/\s+/g, ''); }
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const unb64 = (text) => Uint8Array.from(Buffer.from(text, 'base64'));

function newCode() {
  const group = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
  return ['NZB', group(), group(), group(), group()].join('-');
}

async function aesKey(code, salt, usage, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizeCode(code)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

function readBlock(html) {
  const m = html.match(/const ENCRYPTED_API_KEY = \{\s*iter:\s*(\d+),\s*salt:\s*'([^']*)',\s*iv:\s*'([^']*)',\s*ct:\s*'([^']*)',\s*\};/);
  if (!m) throw new Error('ENCRYPTED_API_KEY block not found');
  return { iter: Number(m[1]), salt: m[2], iv: m[3], ct: m[4] };
}

async function decryptFrom(file, code) {
  const block = readBlock(fs.readFileSync(file, 'utf8'));
  const key = await aesKey(code, unb64(block.salt), 'decrypt', block.iter);
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(block.iv) }, key, unb64(block.ct)));
  } catch (err) {
    throw new Error('That code does not unlock ' + path.basename(file));
  }
}

async function main() {
  const code = args.includes('--new-code') ? newCode() : normalizeCode(arg('--code'));
  if (!code) throw new Error('Pass --new-code or --code <activate code>');

  let apiKey = process.env.GRSAI_API_KEY || '';
  if (!apiKey && arg('--from')) apiKey = await decryptFrom(arg('--from'), arg('--from-code'));
  if (!apiKey) throw new Error('No AI key: set GRSAI_API_KEY or pass --from <launchpad.html> --from-code <code>');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(code, salt, 'encrypt');
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(apiKey)));

  const html = fs.readFileSync(SRC, 'utf8');
  readBlock(html);   // throws when the block is missing
  const block = "const ENCRYPTED_API_KEY = {\n    iter: " + ITERATIONS + ",\n    salt: '" + b64(salt) + "',\n    iv:   '" + b64(iv) +
    "',\n    ct:   '" + b64(ct) + "',\n  };";
  fs.writeFileSync(SRC, html.replace(/const ENCRYPTED_API_KEY = \{[\s\S]*?\n  \};/, () => block));

  // Prove the round trip before telling anyone the code.
  const check = await decryptFrom(SRC, code);
  if (check !== apiKey) throw new Error('Round trip failed');
  console.log('Updated', path.relative(process.cwd(), SRC));
  console.log('Activate code:', code);
  console.log('Next: npm test   (rebuilds ../index.html)');
}

main().catch((err) => { console.error(err.message); process.exit(1); });
