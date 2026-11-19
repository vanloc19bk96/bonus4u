// A dummy AI key block for tests: locked with TEST_CODE, never the real key.
// Used by smoke.js (source) and protect.js --test-build (obfuscated test copy).
const { webcrypto } = require('crypto');

const TEST_CODE = 'NZB-TEST-2345-6789-ABCD';
const TEST_KEY = 'sk-test-dummy-key';
const BLOCK_RE = /const ENCRYPTED_API_KEY = \{[\s\S]*?\n  \};/;

async function dummyBlock() {
  const subtle = webcrypto.subtle;
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const base = await subtle.importKey('raw', new TextEncoder().encode(TEST_CODE), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(TEST_KEY)));
  const b64 = (b) => Buffer.from(b).toString('base64');
  return "const ENCRYPTED_API_KEY = {\n    iter: 1000,\n    salt: '" + b64(salt) + "',\n    iv:   '" + b64(iv) + "',\n    ct:   '" + b64(ct) + "',\n  };";
}

async function withDummyKey(html) {
  if (!BLOCK_RE.test(html)) throw new Error('ENCRYPTED_API_KEY block not found');
  const block = await dummyBlock();
  return html.replace(BLOCK_RE, () => block);
}

module.exports = { TEST_CODE, TEST_KEY, BLOCK_RE, withDummyKey };
