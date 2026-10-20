'use strict';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function u32be(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

/**
 * Insert pHYs chunk before first IDAT: 11811 px/metre = 300 DPI.
 */
function patchPngDpi(uint8) {
  const bytes = uint8 instanceof Uint8Array ? uint8 : new Uint8Array(uint8);
  // PNG signature 8 bytes
  let offset = 8;
  let idatAt = -1;
  while (offset + 8 < bytes.length) {
    const len = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === 'pHYs') {
      // already present — overwrite
      const ppm = 11811;
      bytes[offset + 8] = (ppm >>> 24) & 255;
      bytes[offset + 9] = (ppm >>> 16) & 255;
      bytes[offset + 10] = (ppm >>> 8) & 255;
      bytes[offset + 11] = ppm & 255;
      bytes[offset + 12] = (ppm >>> 24) & 255;
      bytes[offset + 13] = (ppm >>> 16) & 255;
      bytes[offset + 14] = (ppm >>> 8) & 255;
      bytes[offset + 15] = ppm & 255;
      bytes[offset + 16] = 1;
      const chunkData = bytes.subarray(offset + 4, offset + 8 + 9);
      const crc = crc32(chunkData);
      const crcBytes = u32be(crc);
      bytes[offset + 17] = crcBytes[0];
      bytes[offset + 18] = crcBytes[1];
      bytes[offset + 19] = crcBytes[2];
      bytes[offset + 20] = crcBytes[3];
      return bytes;
    }
    if (type === 'IDAT') {
      idatAt = offset;
      break;
    }
    offset += 12 + len;
  }
  if (idatAt < 0) return bytes;

  const ppm = 11811;
  const data = new Uint8Array([
    ...u32be(9),
    112, 72, 89, 115, // pHYs
    ...u32be(ppm),
    ...u32be(ppm),
    1,
  ]);
  const crc = crc32(data.subarray(4));
  const chunk = new Uint8Array(data.length + 4);
  chunk.set(data, 0);
  chunk.set(u32be(crc), data.length);

  const out = new Uint8Array(bytes.length + chunk.length);
  out.set(bytes.subarray(0, idatAt), 0);
  out.set(chunk, idatAt);
  out.set(bytes.subarray(idatAt), idatAt + chunk.length);
  return out;
}

/**
 * Patch JFIF APP0 densitiy to 300 DPI, or insert APP0 after SOI.
 */
function patchJpegDpi(uint8) {
  const bytes = uint8 instanceof Uint8Array ? uint8 : new Uint8Array(uint8);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;

  // Look for APP0 JFIF
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xe0 && len >= 16) {
      // JFIF?
      if (
        bytes[i + 4] === 0x4a &&
        bytes[i + 5] === 0x46 &&
        bytes[i + 6] === 0x49 &&
        bytes[i + 7] === 0x46 &&
        bytes[i + 8] === 0x00
      ) {
        bytes[i + 11] = 1; // units = DPI
        bytes[i + 12] = (300 >> 8) & 255;
        bytes[i + 13] = 300 & 255;
        bytes[i + 14] = (300 >> 8) & 255;
        bytes[i + 15] = 300 & 255;
        return bytes;
      }
    }
    i += 2 + len;
  }

  // Insert APP0 after SOI
  const app0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x01, 0x2c, 0x01, 0x2c, 0x00, 0x00,
  ]);
  const out = new Uint8Array(bytes.length + app0.length);
  out[0] = 0xff;
  out[1] = 0xd8;
  out.set(app0, 2);
  out.set(bytes.subarray(2), 2 + app0.length);
  return out;
}

async function canvasToPng300(canvas) {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const buf = new Uint8Array(await blob.arrayBuffer());
  return patchPngDpi(buf);
}

async function canvasToJpeg300(canvas, quality) {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality == null ? 0.92 : quality));
  const buf = new Uint8Array(await blob.arrayBuffer());
  return patchJpegDpi(buf);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { crc32, patchPngDpi, patchJpegDpi, canvasToPng300, canvasToJpeg300 };
}
