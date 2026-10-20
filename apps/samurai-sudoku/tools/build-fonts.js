/*
 * build-fonts.js: regenerates js/fonts.js from the two TTF files in tools/fonts.
 *
 *   node tools/build-fonts.js
 *
 * The app itself never runs this. js/fonts.js is committed as a plain script so the
 * page works from file:// with no build step. The output holds:
 *   - the TTFs as base64 (jsPDF embeds them in the PDF; the preview loads them as FontFace)
 *   - advance widths + vertical metrics, so layout.js can measure and wrap text the same
 *     way for the SVG preview and the PDF (one layout engine, two renderers).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FONTS = {
  regular: path.join(__dirname, 'fonts', 'AtkinsonHyperlegible-Regular.ttf'),
  bold: path.join(__dirname, 'fonts', 'AtkinsonHyperlegible-Bold.ttf'),
};

// Characters the layout may need to measure: printable ASCII, Latin-1, plus typographic extras.
const EXTRA = [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x00D7];

function readTables(buf) {
  const numTables = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = buf.toString('latin1', rec, rec + 4);
    tables[tag] = { offset: buf.readUInt32BE(rec + 8), length: buf.readUInt32BE(rec + 12) };
  }
  return tables;
}

function readName(buf, t, wantedId) {
  const base = t.name.offset;
  const count = buf.readUInt16BE(base + 2);
  const strOff = base + buf.readUInt16BE(base + 4);
  for (let i = 0; i < count; i++) {
    const r = base + 6 + i * 12;
    const platform = buf.readUInt16BE(r);
    const nameId = buf.readUInt16BE(r + 6);
    const len = buf.readUInt16BE(r + 8);
    const off = buf.readUInt16BE(r + 10);
    if (nameId !== wantedId) continue;
    const raw = buf.slice(strOff + off, strOff + off + len);
    if (platform === 3 || platform === 0) {
      let s = '';
      for (let j = 0; j + 1 < raw.length; j += 2) s += String.fromCharCode(raw.readUInt16BE(j));
      return s;
    }
    return raw.toString('latin1');
  }
  return '';
}

function cmapFormat4(buf, t) {
  const base = t.cmap.offset;
  const n = buf.readUInt16BE(base + 2);
  for (let i = 0; i < n; i++) {
    const r = base + 4 + i * 8;
    const platform = buf.readUInt16BE(r);
    const enc = buf.readUInt16BE(r + 2);
    const sub = base + buf.readUInt32BE(r + 4);
    if (platform === 3 && enc === 1 && buf.readUInt16BE(sub) === 4) {
      const segX2 = buf.readUInt16BE(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      return function glyphIndex(code) {
        for (let s = 0; s < segX2 / 2; s++) {
          const end = buf.readUInt16BE(ends + s * 2);
          if (code > end) continue;
          const start = buf.readUInt16BE(starts + s * 2);
          if (code < start) return 0;
          const delta = buf.readInt16BE(deltas + s * 2);
          const ro = buf.readUInt16BE(ranges + s * 2);
          if (ro === 0) return (code + delta) & 0xFFFF;
          const gi = buf.readUInt16BE(ranges + s * 2 + ro + (code - start) * 2);
          return gi === 0 ? 0 : (gi + delta) & 0xFFFF;
        }
        return 0;
      };
    }
  }
  throw new Error('No Windows Unicode BMP cmap (format 4) found');
}

function metrics(file) {
  const buf = fs.readFileSync(file);
  const t = readTables(buf);
  const upm = buf.readUInt16BE(t.head.offset + 18);
  const ascent = buf.readInt16BE(t.hhea.offset + 4);
  const descent = buf.readInt16BE(t.hhea.offset + 6);
  const numH = buf.readUInt16BE(t.hhea.offset + 34);
  const os2 = t['OS/2'].offset;
  const os2Version = buf.readUInt16BE(os2);
  const capHeight = os2Version >= 2 ? buf.readInt16BE(os2 + 88) : Math.round(upm * 0.7);
  const glyph = cmapFormat4(buf, t);
  const adv = gi => buf.readUInt16BE(t.hmtx.offset + Math.min(gi, numH - 1) * 4);

  const codes = [];
  for (let c = 32; c <= 255; c++) if (c < 127 || c >= 160) codes.push(c);
  codes.push(...EXTRA);
  const widths = {};
  const missing = [];
  codes.forEach(c => {
    const gi = glyph(c);
    if (gi === 0 && c !== 32) { missing.push(c); return; }
    widths[c] = adv(gi);
  });
  return {
    buf,
    license: readName(buf, t, 13),
    licenseUrl: readName(buf, t, 14),
    copyright: readName(buf, t, 0),
    fullName: readName(buf, t, 4),
    m: { upm, ascent, descent: -descent, capHeight, widths, fallback: adv(glyph(0x6E)) },
    missing,
  };
}

const out = {};
for (const key of Object.keys(FONTS)) out[key] = metrics(FONTS[key]);

if (process.argv.includes('--info')) {
  for (const key of Object.keys(out)) {
    const f = out[key];
    console.log(key, f.fullName, '|', f.copyright);
    console.log('  license:', f.license.slice(0, 160), f.licenseUrl);
    console.log('  upm', f.m.upm, 'asc', f.m.ascent, 'desc', f.m.descent, 'cap', f.m.capHeight,
      'missing', f.missing.map(c => c.toString(16)).join(','));
  }
  process.exit(0);
}

const banner = `/*!
 * fonts.js: GENERATED by tools/build-fonts.js. Do not edit by hand.
 *
 * ${out.regular.fullName} and ${out.bold.fullName}
 * ${out.regular.copyright}
 * Licensed under the SIL Open Font License, Version 1.1 (see lib/OFL.txt).
 *
 * KDP needs every font embedded in the PDF. jsPDF's built-in Helvetica/Times are
 * "standard 14" fonts that are referenced but never embedded, so we ship a real TTF.
 */
`;

const js = banner +
  'window.SS = window.SS || {};\n' +
  'SS.FONT_FILES = {\n' +
  `  regular: { file: 'AtkinsonHyperlegible-Regular.ttf', base64: '${out.regular.buf.toString('base64')}' },\n` +
  `  bold: { file: 'AtkinsonHyperlegible-Bold.ttf', base64: '${out.bold.buf.toString('base64')}' }\n` +
  '};\n' +
  'SS.FONT_METRICS = ' + JSON.stringify({ regular: out.regular.m, bold: out.bold.m }) + ';\n';

fs.writeFileSync(path.join(ROOT, 'js', 'fonts.js'), js);
console.log('wrote js/fonts.js', (js.length / 1024).toFixed(0) + ' KB');
