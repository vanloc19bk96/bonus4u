'use strict';

const { computeGeometry, gutterMinForPageCount } = require('./geometry');
const { mulberry32, derangement, parseSeed } = require('./rng');
const { normalizeQuote, prepareQuotePool, BUILTIN_QUOTES } = require('./quotes');
const { makePuzzle, keyHasFixedPoints, encode } = require('./cipher');
const { generateBook } = require('./layout');
const { DEFAULT_CONFIG } = require('./constants');
const { patchPngDpi, patchJpegDpi, crc32 } = require('./dpi-meta');

async function runSelftest() {
  const results = [];
  function assert(name, cond, detail) {
    results.push({ name, ok: !!cond, detail: detail || '' });
  }

  // 1. Gutter at ~100 puzzles / ~128 pages band
  assert('gutter 100pp band', gutterMinForPageCount(128) === 0.375);
  assert('gutter 320pp band', gutterMinForPageCount(320) === 0.625);

  const geo = computeGeometry({
    trimW: 6,
    trimH: 9,
    bleed: true,
    pageCount: 128,
    gutterPad: 0.125,
    outerMargin: 0.5,
  });
  const g = geo(true);
  assert('bleed page size', Math.abs(g.pageW - 6.125) < 1e-9 && Math.abs(g.pageH - 9.25) < 1e-9);
  const recto = geo(true);
  const verso = geo(false);
  assert('mirrored margins', recto.left === verso.right && recto.right === verso.left);

  // Outer margin floor
  const geoTight = computeGeometry({
    trimW: 6,
    trimH: 9,
    bleed: false,
    pageCount: 100,
    gutterPad: 0.125,
    outerMargin: 0.1,
  });
  assert('outer floor', geoTight(true).outer === 0.25);

  // Quotes normalize (need ≥12 distinct letters to pass full rules)
  const n = normalizeQuote("Café — the quick brown fox jumps over a lazy dog!");
  assert('normalize diacritics', n.ok && n.text.includes('CAFE') && n.text.includes('QUICK'));

  const { ready } = prepareQuotePool(BUILTIN_QUOTES, 260);
  assert('quote bank size', ready.length >= 500, String(ready.length));

  // Derangement
  const rng = mulberry32(48211);
  const key = derangement(rng, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', false);
  assert('no fixed points', !keyHasFixedPoints(key));

  // Round-trip
  const sample = ready.find((q) => q.charLen >= 70 && q.charLen <= 140) || ready[0];
  const puzzle = makePuzzle(rng, sample, 'medium', { allowReciprocal: false });
  assert('puzzle made', !puzzle.error, puzzle.error);
  if (!puzzle.error) {
    const decoded = encode(puzzle.cipher, puzzle.invKey, false);
    // numeric path uses different invert — letter path:
    let plain = '';
    for (const ch of puzzle.cipher) {
      if (ch >= 'A' && ch <= 'Z') plain += puzzle.invKey[ch];
      else plain += ch;
    }
    assert('round-trip', plain === puzzle.plain);
  }

  // Seed parse
  assert('seed parse', parseSeed(48211) === 48211);

  // DPI helpers smoke
  const pngSig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  // minimal fake: sig + IHDR-ish skip — just ensure function returns Uint8Array
  const fakePng = new Uint8Array(100);
  fakePng.set(pngSig, 0);
  // write IHDR chunk then IDAT
  fakePng[8] = 0;
  fakePng[9] = 0;
  fakePng[10] = 0;
  fakePng[11] = 13;
  fakePng[12] = 73;
  fakePng[13] = 72;
  fakePng[14] = 68;
  fakePng[15] = 82;
  // len 13 + type 4 + data 13 + crc 4 = 25 → next at 8+25=33
  const idatAt = 33;
  fakePng[idatAt] = 0;
  fakePng[idatAt + 1] = 0;
  fakePng[idatAt + 2] = 0;
  fakePng[idatAt + 3] = 0;
  fakePng[idatAt + 4] = 73;
  fakePng[idatAt + 5] = 68;
  fakePng[idatAt + 6] = 65;
  fakePng[idatAt + 7] = 84;
  const patched = patchPngDpi(fakePng);
  assert('png patch grows or ok', patched.length >= fakePng.length);

  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
  const pj = patchJpegDpi(jpeg);
  // units @13, Xdensity @14-15 (300 = 0x012C)
  assert('jpeg dpi 300', pj[13] === 1 && pj[14] === 1 && pj[15] === 0x2c);

  assert('crc32 stable', crc32(new Uint8Array([1, 2, 3])) === crc32(new Uint8Array([1, 2, 3])));

  // Small book generation (node — no DOM canvas needed for generateBook)
  const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  cfg.puzzles.count = 12;
  cfg.sections.howToSolve = false;
  cfg.sections.worksheet = false;
  cfg.puzzles.seed = 48211;
  const book1 = await generateBook(cfg, {});
  const book2 = await generateBook(cfg, {});
  assert('generate ok', !book1.error && book1.pages.length > 0, book1.error);
  assert(
    'deterministic seed',
    !book1.error &&
      book1.puzzles[0].cipher === book2.puzzles[0].cipher &&
      book1.puzzles[0].plain === book2.puzzles[0].plain
  );
  assert('gutter pad applied', !book1.error && Math.abs(book1.stats.gutter - (0.375 + 0.125)) < 1e-9);

  const failed = results.filter((r) => !r.ok);
  return { results, failed, ok: failed.length === 0 };
}

if (require.main === module) {
  runSelftest().then((r) => {
    for (const x of r.results) {
      console.log(x.ok ? 'PASS' : 'FAIL', x.name, x.detail || '');
    }
    console.log(r.ok ? 'ALL PASS' : `FAILED ${r.failed.length}`);
    process.exit(r.ok ? 0 : 1);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runSelftest };
}
