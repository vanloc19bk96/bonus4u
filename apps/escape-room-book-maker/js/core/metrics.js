/*
 * Font metrics read straight from the bundled TrueType files.
 * The layout engine measures every word with these advance widths, and both the preview
 * and the PDF place each word at the measured position, so line breaks match exactly.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  // key -> PDF font name (6-letter subset tag + PostScript name) and CSS family used by the preview.
  var FONT_INFO = {
    serif: { pdf: 'CXIOAA+SourceSerif4-Regular', css: 'CXSerif' },
    serifBold: { pdf: 'CXIOAB+SourceSerif4-Bold', css: 'CXSerifBold' },
    sans: { pdf: 'CXIOAC+SourceSans3-Regular', css: 'CXSans' },
    sansBold: { pdf: 'CXIOAD+SourceSans3-Bold', css: 'CXSansBold' }
  };

  function b64ToBytes(b64) {
    var bin = root.atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function parseTTF(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var numTables = dv.getUint16(4);
    var tables = {};
    for (var i = 0; i < numTables; i++) {
      var o = 12 + i * 16;
      var tag = String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
      tables[tag] = { offset: dv.getUint32(o + 8), length: dv.getUint32(o + 12) };
    }
    var head = tables.head.offset;
    var upm = dv.getUint16(head + 18);
    var hhea = tables.hhea.offset;
    var ascent = dv.getInt16(hhea + 4), descent = dv.getInt16(hhea + 6);
    var numH = dv.getUint16(hhea + 34);
    var hmtx = tables.hmtx.offset;
    var advances = [];
    for (var g = 0; g < numH; g++) advances.push(dv.getUint16(hmtx + g * 4));
    var capHeight = Math.round(upm * 0.7), xHeight = Math.round(upm * 0.5);
    if (tables['OS/2']) {
      var os2 = tables['OS/2'].offset;
      var ver = dv.getUint16(os2);
      if (ver >= 2) { xHeight = dv.getInt16(os2 + 86); capHeight = dv.getInt16(os2 + 88); }
    }
    // cmap: prefer format 12 (full unicode) then format 4 (BMP)
    var cmapOff = tables.cmap.offset;
    var nSub = dv.getUint16(cmapOff + 2);
    var best = null, bestFmt = 0;
    for (var s = 0; s < nSub; s++) {
      var pid = dv.getUint16(cmapOff + 4 + s * 8), eid = dv.getUint16(cmapOff + 6 + s * 8);
      var so = cmapOff + dv.getUint32(cmapOff + 8 + s * 8);
      var fmt = dv.getUint16(so);
      var unicode = (pid === 3 && (eid === 1 || eid === 10)) || pid === 0;
      if (!unicode) continue;
      if (fmt === 12 && bestFmt !== 12) { best = so; bestFmt = 12; }
      else if (fmt === 4 && !best) { best = so; bestFmt = 4; }
    }
    var map = new Map();
    if (bestFmt === 4) {
      var segX2 = dv.getUint16(best + 6), seg = segX2 / 2;
      var endO = best + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
      for (var k = 0; k < seg; k++) {
        var end = dv.getUint16(endO + k * 2), start = dv.getUint16(startO + k * 2);
        var delta = dv.getInt16(deltaO + k * 2), ro = dv.getUint16(rangeO + k * 2);
        if (start === 0xFFFF) continue;
        for (var c = start; c <= end; c++) {
          var gid;
          if (ro === 0) gid = (c + delta) & 0xFFFF;
          else {
            var gi = rangeO + k * 2 + ro + (c - start) * 2;
            gid = dv.getUint16(gi);
            if (gid !== 0) gid = (gid + delta) & 0xFFFF;
          }
          if (gid) map.set(c, gid);
        }
      }
    } else if (bestFmt === 12) {
      var nGroups = dv.getUint32(best + 12);
      for (var q = 0; q < nGroups; q++) {
        var go = best + 16 + q * 12;
        var sc = dv.getUint32(go), ec = dv.getUint32(go + 4), sg = dv.getUint32(go + 8);
        if (ec - sc > 70000) continue;
        for (var cc = sc; cc <= ec; cc++) map.set(cc, sg + (cc - sc));
      }
    }
    return { upm: upm, ascent: ascent, descent: descent, capHeight: capHeight, xHeight: xHeight, advances: advances, cmap: map };
  }

  function makeFont(key, parsed) {
    var cache = new Map();
    var upm = parsed.upm;
    function adv(code) {
      var w = cache.get(code);
      if (w !== undefined) return w;
      var gid = parsed.cmap.get(code) || 0;
      var a = parsed.advances[Math.min(gid, parsed.advances.length - 1)];
      w = a / upm;
      cache.set(code, w);
      return w;
    }
    return {
      key: key,
      info: FONT_INFO[key],
      upm: upm,
      ascent: parsed.ascent / upm,
      descent: -parsed.descent / upm,
      capHeight: parsed.capHeight / upm,
      xHeight: parsed.xHeight / upm,
      has: function (ch) { return parsed.cmap.has(ch.codePointAt(0)); },
      // width in pt at the given size; letterSpacing is added between characters
      width: function (str, size, letterSpacing) {
        var w = 0, n = 0;
        for (var i = 0; i < str.length; i++) {
          var code = str.charCodeAt(i);
          w += adv(code); n++;
        }
        return w * size + (letterSpacing ? letterSpacing * Math.max(0, n - 1) : 0);
      }
    };
  }

  var loaded = null;
  function load() {
    if (loaded) return loaded;
    var data = root.CX_FONT_DATA;
    if (!data) throw new Error('Font data is missing');
    loaded = {};
    Object.keys(FONT_INFO).forEach(function (key) {
      loaded[key] = makeFont(key, parseTTF(b64ToBytes(data[key].data)));
    });
    return loaded;
  }

  // Replace characters a font cannot draw with close equivalents, so nothing prints as a box.
  var FALLBACK = { '′': "'", '″': '"', '‒': '–', '―': '—', '−': '-', '­': '' };
  function printable(str, font) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (ch === ' ' || font.has(ch)) { out += ch; continue; }
      if (FALLBACK[ch] !== undefined) { out += FALLBACK[ch]; continue; }
      var plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (plain && font.has(plain[0])) out += plain[0];
    }
    return out;
  }

  CX.metrics = { FONT_INFO: FONT_INFO, load: load, printable: printable, b64ToBytes: b64ToBytes };
})(typeof window !== 'undefined' ? window : globalThis);
