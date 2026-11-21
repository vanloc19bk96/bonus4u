/*
 * Pictures of the pages: every laid-out page (or the cover) drawn on a canvas item for item, with
 * the fonts and positions of the PDF, and saved as a PNG at 300 or 150 dots per inch. A book comes
 * as one .zip with a PNG for each page, for PowerPoint, Canva or an image editor. Every PNG carries
 * its resolution (a pHYs chunk), so it comes in at the real page size.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var INFO = CX.metrics.FONT_INFO;
  var DPIS = [{ id: 300, label: '300 dpi – print quality' }, { id: 150, label: '150 dpi – smaller files, for the screen' }];

  function gray(ink) { var v = Math.round(255 * (1 - (ink == null ? 1 : ink))); return 'rgb(' + v + ',' + v + ',' + v + ')'; }
  function col(it) { return it.color || gray(it.ink); }

  // The same items the PDF draws, in points; the canvas is scaled to the resolution.
  function drawItems(ctx, list, F) {
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it.t === 'text') {
        ctx.font = it.size + 'px ' + INFO[it.font].css;
        ctx.fillStyle = col(it);
        ctx.save();
        ctx.translate(it.x, it.y);
        if (it.angle) ctx.rotate(-it.angle * Math.PI / 180);
        if (it.hs) ctx.scale(it.hs, 1);
        if (it.ls) {
          // spaced-out letters go down one by one, each at the place the layout measured
          for (var k = 0, x = 0; k < it.str.length; k++) {
            ctx.fillText(it.str[k], x, 0);
            x += F[it.font].width(it.str[k], it.size) + it.ls;
          }
        } else ctx.fillText(it.str, 0, 0);
        ctx.restore();
      } else if (it.t === 'line') {
        ctx.strokeStyle = col(it); ctx.lineWidth = it.w; ctx.setLineDash(it.dash || []); ctx.lineCap = it.cap ? 'round' : 'butt';
        ctx.beginPath(); ctx.moveTo(it.x1, it.y1); ctx.lineTo(it.x2, it.y2); ctx.stroke();
      } else if (it.t === 'rect' || it.t === 'ellipse' || it.t === 'poly') {
        ctx.beginPath();
        if (it.t === 'rect') ctx.rect(it.x, it.y, it.w, it.h);
        else if (it.t === 'ellipse') ctx.ellipse(it.cx, it.cy, it.rx, it.ry, 0, 0, Math.PI * 2);
        else {
          ctx.moveTo(it.pts[0], it.pts[1]);
          for (var q = 2; q < it.pts.length; q += 2) ctx.lineTo(it.pts[q], it.pts[q + 1]);
          if (it.closed || it.mode !== 'stroke') ctx.closePath();
        }
        if (it.mode === 'stroke') {
          ctx.strokeStyle = col(it); ctx.lineWidth = it.lw; ctx.setLineDash(it.dash || []);
          ctx.lineCap = it.round ? 'round' : 'butt'; ctx.lineJoin = it.round ? 'round' : 'miter';
          ctx.stroke();
        } else { ctx.fillStyle = col(it); ctx.fill(); }
      }
    }
  }

  // One page (or the cover) on the canvas at this resolution, on white paper.
  function paint(canvas, page, dpi) {
    var w = Math.round(page.W * dpi / 72), h = Math.round(page.H * dpi / 72);
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('this browser could not make a picture this big; choose 150 dpi');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(w / page.W, 0, 0, h / page.H, 0, 0);
    ctx.textBaseline = 'alphabetic';
    if ('fontKerning' in ctx) ctx.fontKerning = 'none'; // the PDF sets every letter by its own width
    drawItems(ctx, page.items, CX.metrics.load());
  }

  function toBytes(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('this browser could not make a picture this big; choose 150 dpi')); return; }
        blob.arrayBuffer().then(function (b) { resolve(new Uint8Array(b)); }, reject);
      }, 'image/png');
    });
  }

  /*
   * Writes the resolution into a PNG: a pHYs chunk right after the header (one the browser wrote
   * itself is replaced), so PowerPoint and image editors open the page at its real size.
   */
  function setDpi(png, dpi) {
    if (png.length < 45 || png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4E || png[3] !== 0x47) return png;
    var ppm = Math.round(dpi / 0.0254), c = new Uint8Array(21), v = new DataView(c.buffer);
    v.setUint32(0, 9); c.set([0x70, 0x48, 0x59, 0x73], 4); v.setUint32(8, ppm); v.setUint32(12, ppm); c[16] = 1;
    v.setUint32(17, CX.pptx.crc32(c.subarray(4, 17)));
    var dv = new DataView(png.buffer, png.byteOffset, png.byteLength), parts = [png.subarray(0, 33), c], from = 33, o = 33;
    while (o + 12 <= png.length) {
      var end = o + 12 + dv.getUint32(o), type = String.fromCharCode(png[o + 4], png[o + 5], png[o + 6], png[o + 7]);
      if (type === 'IDAT') break;
      if (type === 'pHYs') { parts.push(png.subarray(from, o)); from = end; }
      o = end;
    }
    parts.push(png.subarray(from));
    var out = new Uint8Array(parts.reduce(function (s, p) { return s + p.length; }, 0)), at = 0;
    parts.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }

  /*
   * A .zip of files that are already packed (PNG): stored as they are. files: [{ name, bytes }].
   * Returns the parts of the file in order, so a big book never needs one huge block of memory.
   */
  function zipParts(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    function head(sig, size) { var a = new Uint8Array(size), v = new DataView(a.buffer); v.setUint32(0, sig, true); return { a: a, v: v }; }
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = CX.pptx.crc32(f.bytes), n = f.bytes.length;
      var L = head(0x04034b50, 30 + name.length);
      L.v.setUint16(4, 20, true); L.v.setUint16(12, 0x21, true);
      L.v.setUint32(14, crc, true); L.v.setUint32(18, n, true); L.v.setUint32(22, n, true); L.v.setUint16(26, name.length, true);
      L.a.set(name, 30);
      var C = head(0x02014b50, 46 + name.length);
      C.v.setUint16(4, 20, true); C.v.setUint16(6, 20, true); C.v.setUint16(14, 0x21, true);
      C.v.setUint32(16, crc, true); C.v.setUint32(20, n, true); C.v.setUint32(24, n, true); C.v.setUint16(28, name.length, true);
      C.v.setUint32(42, offset, true); C.a.set(name, 46);
      parts.push(L.a, f.bytes); central.push(C.a);
      offset += L.a.length + n;
    });
    var cSize = central.reduce(function (s, c) { return s + c.length; }, 0);
    var E = head(0x06054b50, 22);
    E.v.setUint16(8, files.length, true); E.v.setUint16(10, files.length, true); E.v.setUint32(12, cSize, true); E.v.setUint32(16, offset, true);
    return parts.concat(central, [E.a]);
  }

  function pad(n, len) { n = String(n); while (n.length < len) n = '0' + n; return n; }

  /*
   * Every page of the book as a PNG, in one .zip. opts: { dpi, name (the start of each file name) };
   * onProgress(fraction). Resolves with a Blob.
   */
  async function zip(book, opts, onProgress) {
    var canvas = document.createElement('canvas'), files = [], n = book.pages.length, len = Math.max(3, String(n).length);
    for (var i = 0; i < n; i++) {
      paint(canvas, book.pages[i], opts.dpi);
      files.push({ name: opts.name + '-page-' + pad(i + 1, len) + '.png', bytes: setDpi(await toBytes(canvas), opts.dpi) });
      if (onProgress) onProgress((i + 1) / n * 0.97);
    }
    canvas.width = canvas.height = 1; // give the big picture back
    var blob = new Blob(zipParts(files), { type: 'application/zip' });
    if (onProgress) onProgress(1);
    return blob;
  }

  // One page, or the full cover, as a PNG. Resolves with a Uint8Array.
  async function one(page, dpi) {
    var canvas = document.createElement('canvas');
    paint(canvas, page, dpi);
    return setDpi(await toBytes(canvas), dpi);
  }

  CX.png = { DPIS: DPIS, zip: zip, one: one, setDpi: setDpi, zipParts: zipParts, drawItems: drawItems };
})(typeof window !== 'undefined' ? window : globalThis);
