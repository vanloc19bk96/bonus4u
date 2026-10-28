/*
 * Editable copy for Canva (and PowerPoint, Google Slides, Keynote): the same laid-out pages as the
 * PDF, written as a .pptx with one slide per page at the trim size. Every line of text is a real
 * text box (lines of one paragraph share a box), and boxes, lines, circles and shapes stay vector
 * shapes, so nothing is merged or re-flowed on import the way Canva does with a PDF.
 * Text boxes are centred on the printed line and a little wider than it, so a stand-in font keeps
 * each line on its own line. Fonts are named, not embedded: Source Serif 4 and Source Sans 3.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  var EMU = 12700; // per pt
  var FACE = { serif: ['Source Serif 4', 0], serifBold: ['Source Serif 4', 1], sans: ['Source Sans 3', 0], sansBold: ['Source Sans 3', 1] };
  var NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  var HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  var TREE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

  function e(v) { return Math.round(v * EMU); }
  function esc(s) { return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function hex(it) {
    if (it.color) {
      var c = String(it.color).replace('#', '');
      if (c.length === 3) c = c.replace(/./g, '$&$&');
      return c.toUpperCase();
    }
    var g = Math.round(255 * (1 - (it.ink == null ? 1 : it.ink))).toString(16).toUpperCase();
    if (g.length < 2) g = '0' + g;
    return g + g + g;
  }
  function solid(c) { return '<a:solidFill><a:srgbClr val="' + c + '"/></a:solidFill>'; }
  function ln(it, w) {
    var dash = '';
    if (it.dash && it.dash.length) {
      dash = '<a:custDash>';
      for (var i = 0; i < it.dash.length; i += 2) {
        var d = it.dash[i], sp = it.dash[i + 1] == null ? d : it.dash[i + 1];
        dash += '<a:ds d="' + Math.max(1, Math.round(d / w * 100000)) + '" sp="' + Math.max(1, Math.round(sp / w * 100000)) + '"/>';
      }
      dash += '</a:custDash>';
    }
    return '<a:ln w="' + e(w) + '" cap="' + (it.round || it.cap ? 'rnd' : 'flat') + '">' + solid(hex(it)) + dash + (it.round ? '<a:round/>' : '<a:miter lim="800000"/>') + '</a:ln>';
  }
  function xfrm(x, y, w, h, extra) {
    return '<a:xfrm' + (extra || '') + '><a:off x="' + e(x) + '" y="' + e(y) + '"/><a:ext cx="' + Math.max(0, e(w)) + '" cy="' + Math.max(0, e(h)) + '"/></a:xfrm>';
  }

  // ---------- text: consecutive lines of one paragraph go in one box ----------
  function anchorX(it, w) { return it.align === 'center' ? it.x + w / 2 : it.align === 'right' ? it.x + w : it.x; }
  function same(a, b) { return a.font === b.font && a.size === b.size && hex(a) === hex(b) && (a.ls || 0) === (b.ls || 0) && (a.align || '') === (b.align || ''); }

  function groupText(items, F) {
    var out = [], g = null;
    items.forEach(function (it) {
      if (it.t !== 'text') { g = null; out.push(it); return; }
      var w = F[it.font].width(it.str, it.size, it.ls || 0);
      if (g && !it.angle && !g.first.angle && same(g.first, it)) {
        var last = g.lines[g.lines.length - 1], dy = it.y - last.y;
        var okStep = dy > it.size * 0.9 && dy < it.size * 2.2 && (g.step == null || Math.abs(dy - g.step) < 0.15);
        if (okStep && Math.abs(anchorX(it, w) - g.ax) < 0.3) { g.lines.push({ str: it.str, y: it.y, w: w }); g.step = dy; return; }
      }
      g = { t: 'textbox', first: it, ax: anchorX(it, w), lines: [{ str: it.str, y: it.y, w: w }], step: null };
      out.push(g);
    });
    return out;
  }

  function textbox(g, id, F) {
    var it = g.first, f = F[it.font], size = it.size, face = FACE[it.font] || FACE.serif;
    var mid = (f.ascent - f.descent) / 2 * size; // middle of the line's ink box, above the baseline
    var W = 0;
    g.lines.forEach(function (l) { if (l.w > W) W = l.w; });
    var pad = Math.max(size * 0.8, W * 0.12), bw = W + pad;
    var step = g.step || size * 1.2, n = g.lines.length;
    var bh = (n - 1) * step + size * 1.6;
    var cy = (g.lines[0].y + g.lines[n - 1].y) / 2 - mid;
    var bx = it.align === 'center' ? g.ax - bw / 2 : it.align === 'right' ? g.ax - bw : g.ax;
    var by = cy - bh / 2, rot = '';
    if (it.angle) {
      // PDF text turns counter-clockwise about its start; a slide box turns clockwise about its centre.
      var th = -it.angle * Math.PI / 180, dx = bw / 2, dy = -mid;
      var cx1 = it.x + dx * Math.cos(th) - dy * Math.sin(th), cy1 = it.y + dx * Math.sin(th) + dy * Math.cos(th);
      bx = cx1 - bw / 2; by = cy1 - bh / 2;
      rot = ' rot="' + ((Math.round(-it.angle * 60000) % 21600000 + 21600000) % 21600000) + '"';
    }
    var algn = it.align === 'center' ? 'ctr' : it.align === 'right' ? 'r' : 'l';
    var rpr = '<a:rPr lang="en-US" sz="' + Math.max(100, Math.round(size * 100)) + '"' + (face[1] ? ' b="1"' : ' b="0"') +
      (it.ls ? ' spc="' + Math.round(it.ls * 100) + '"' : '') + ' dirty="0">' + solid(hex(it)) +
      '<a:latin typeface="' + face[0] + '"/><a:cs typeface="' + face[0] + '"/></a:rPr>';
    var ppr = '<a:pPr algn="' + algn + '">' + (n > 1 ? '<a:lnSpc><a:spcPts val="' + Math.round(step * 100) + '"/></a:lnSpc>' : '') + '<a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr>';
    var paras = g.lines.map(function (l) { return '<a:p>' + ppr + '<a:r>' + rpr + '<a:t>' + esc(l.str) + '</a:t></a:r></a:p>'; }).join('');
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Text ' + id + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>' + xfrm(bx, by, bw, bh, rot) +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>' +
      paras + '</p:txBody></p:sp>';
  }

  // ---------- shapes ----------
  function shape(it, id) {
    var nv = '<p:nvSpPr><p:cNvPr id="' + id + '" name="Shape ' + id + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>';
    var paint = it.mode === 'stroke' ? '<a:noFill/>' + ln(it, it.lw) : solid(hex(it)) + '<a:ln><a:noFill/></a:ln>';
    if (it.t === 'line') {
      var flip = (it.x2 - it.x1) * (it.y2 - it.y1) < 0 ? ' flipH="1"' : '';
      return '<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="' + id + '" name="Line ' + id + '"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>' +
        xfrm(Math.min(it.x1, it.x2), Math.min(it.y1, it.y2), Math.abs(it.x2 - it.x1), Math.abs(it.y2 - it.y1), flip) +
        '<a:prstGeom prst="line"><a:avLst/></a:prstGeom>' + ln(it, it.w) + '</p:spPr></p:cxnSp>';
    }
    if (it.t === 'rect' || it.t === 'ellipse') {
      var box = it.t === 'rect' ? [it.x, it.y, it.w, it.h] : [it.cx - it.rx, it.cy - it.ry, it.rx * 2, it.ry * 2];
      return '<p:sp>' + nv + '<p:spPr>' + xfrm(box[0], box[1], box[2], box[3]) + '<a:prstGeom prst="' + it.t + '"><a:avLst/></a:prstGeom>' + paint + '</p:spPr></p:sp>';
    }
    if (it.t === 'poly') {
      var p = it.pts, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, k;
      for (k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]); }
      var pw = Math.max(1, e(x1 - x0)), ph = Math.max(1, e(y1 - y0)), path = '';
      for (k = 0; k < p.length; k += 2) {
        var pt = '<a:pt x="' + e(p[k] - x0) + '" y="' + e(p[k + 1] - y0) + '"/>';
        path += k ? '<a:lnTo>' + pt + '</a:lnTo>' : '<a:moveTo>' + pt + '</a:moveTo>';
      }
      var closed = it.mode !== 'stroke' || it.closed;
      return '<p:sp>' + nv + '<p:spPr>' + xfrm(x0, y0, x1 - x0, y1 - y0) +
        '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="' + pw + '" h="' + ph + '"' + (it.mode === 'stroke' ? ' fill="none"' : '') + '>' +
        path + (closed ? '<a:close/>' : '') + '</a:path></a:pathLst></a:custGeom>' + paint + '</p:spPr></p:sp>';
    }
    return '';
  }

  function slide(page, F) {
    var body = '', id = 2;
    groupText(page.items, F).forEach(function (it) { body += it.t === 'textbox' ? textbox(it, id++, F) : shape(it, id++); });
    return HEAD + '<p:sld ' + NS + '><p:cSld><p:spTree>' + TREE + body + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }

  // ---------- package parts ----------
  function theme() {
    var clr = [['dk1', '000000'], ['lt1', 'FFFFFF'], ['dk2', '1F1F1F'], ['lt2', 'EEEEEE'], ['accent1', '4F4F4F'], ['accent2', '6F6F6F'], ['accent3', '8F8F8F'],
      ['accent4', 'AFAFAF'], ['accent5', '3F3F3F'], ['accent6', '5F5F5F'], ['hlink', '0563C1'], ['folHlink', '954F72']]
      .map(function (c) { return '<a:' + c[0] + '><a:srgbClr val="' + c[1] + '"/></a:' + c[0] + '>'; }).join('');
    var font = function (t) { return '<a:latin typeface="' + t + '"/><a:ea typeface=""/><a:cs typeface=""/>'; };
    var fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>', three = function (s) { return s + s + s; };
    return HEAD + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Book"><a:themeElements><a:clrScheme name="Book">' + clr + '</a:clrScheme>' +
      '<a:fontScheme name="Book"><a:majorFont>' + font('Source Serif 4') + '</a:majorFont><a:minorFont>' + font('Source Serif 4') + '</a:minorFont></a:fontScheme>' +
      '<a:fmtScheme name="Book"><a:fillStyleLst>' + three(fill) + '</a:fillStyleLst><a:lnStyleLst>' + three('<a:ln w="9525">' + fill + '</a:ln>') + '</a:lnStyleLst>' +
      '<a:effectStyleLst>' + three('<a:effectStyle><a:effectLst/></a:effectStyle>') + '</a:effectStyleLst><a:bgFillStyleLst>' + three(fill) + '</a:bgFillStyleLst></a:fmtScheme>' +
      '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
  }

  function rels(list) {
    return HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      list.map(function (r, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/' + r[0] + '" Target="' + r[1] + '"/>'; }).join('') + '</Relationships>';
  }
  var REL = 'officeDocument/2006/relationships/';

  function parts(pages, W, H, F) {
    var files = [], n = pages.length, PML = 'application/vnd.openxmlformats-officedocument.presentationml.';
    var types = '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="' + PML + 'presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="' + PML + 'slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="' + PML + 'slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>';
    var ids = '', prel = [[REL + 'slideMaster', 'slideMasters/slideMaster1.xml'], [REL + 'theme', 'theme/theme1.xml']];
    for (var i = 1; i <= n; i++) {
      types += '<Override PartName="/ppt/slides/slide' + i + '.xml" ContentType="' + PML + 'slide+xml"/>';
      ids += '<p:sldId id="' + (255 + i) + '" r:id="rId' + (i + 2) + '"/>';
      prel.push([REL + 'slide', 'slides/slide' + i + '.xml']);
    }
    files.push(['[Content_Types].xml', HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' + types + '</Types>']);
    files.push(['_rels/.rels', rels([[REL + 'officeDocument', 'ppt/presentation.xml']])]);
    files.push(['ppt/presentation.xml', HEAD + '<p:presentation ' + NS + '><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' + ids +
      '</p:sldIdLst><p:sldSz cx="' + e(W) + '" cy="' + e(H) + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>']);
    files.push(['ppt/_rels/presentation.xml.rels', rels(prel)]);
    files.push(['ppt/slideMasters/slideMaster1.xml', HEAD + '<p:sldMaster ' + NS + '><p:cSld><p:bg><p:bgPr>' + solid('FFFFFF') + '<a:effectLst/></p:bgPr></p:bg><p:spTree>' + TREE +
      '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>']);
    files.push(['ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([[REL + 'slideLayout', '../slideLayouts/slideLayout1.xml'], [REL + 'theme', '../theme/theme1.xml']])]);
    files.push(['ppt/slideLayouts/slideLayout1.xml', HEAD + '<p:sldLayout ' + NS + ' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>' + TREE + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>']);
    files.push(['ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([[REL + 'slideMaster', '../slideMasters/slideMaster1.xml']])]);
    files.push(['ppt/theme/theme1.xml', theme()]);
    pages.forEach(function (pg, k) {
      files.push(['ppt/slides/slide' + (k + 1) + '.xml', slide(pg, F)]);
      files.push(['ppt/slides/_rels/slide' + (k + 1) + '.xml.rels', rels([[REL + 'slideLayout', '../slideLayouts/slideLayout1.xml']])]);
    });
    return files;
  }

  // ---------- zip (deflate when the browser has CompressionStream, stored otherwise) ----------
  var CRC = null;
  function crc32(b) {
    if (!CRC) { CRC = new Int32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } }
    var x = -1;
    for (var i = 0; i < b.length; i++) x = CRC[(x ^ b[i]) & 255] ^ (x >>> 8);
    return (x ^ -1) >>> 0;
  }
  async function deflate(b) {
    if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') return null;
    try {
      var s = new Blob([b]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    } catch (err) { return null; }
  }
  async function zip(files, onProgress) {
    var enc = new TextEncoder(), chunks = [], central = [], offset = 0;
    function head(sig, size) { var a = new Uint8Array(size), v = new DataView(a.buffer); v.setUint32(0, sig, true); return { a: a, v: v }; }
    for (var i = 0; i < files.length; i++) {
      var name = enc.encode(files[i][0]), raw = enc.encode(files[i][1]), crc = crc32(raw);
      var z = await deflate(raw), method = z ? 8 : 0, data = z || raw;
      var L = head(0x04034b50, 30 + name.length);
      L.v.setUint16(4, 20, true); L.v.setUint16(8, method, true); L.v.setUint16(12, 0x21, true);
      L.v.setUint32(14, crc, true); L.v.setUint32(18, data.length, true); L.v.setUint32(22, raw.length, true); L.v.setUint16(26, name.length, true);
      L.a.set(name, 30);
      var C = head(0x02014b50, 46 + name.length);
      C.v.setUint16(4, 20, true); C.v.setUint16(6, 20, true); C.v.setUint16(10, method, true); C.v.setUint16(14, 0x21, true);
      C.v.setUint32(16, crc, true); C.v.setUint32(20, data.length, true); C.v.setUint32(24, raw.length, true); C.v.setUint16(28, name.length, true);
      C.v.setUint32(42, offset, true); C.a.set(name, 46);
      chunks.push(L.a, data); central.push(C.a);
      offset += L.a.length + data.length;
      if (onProgress && i % 16 === 15) onProgress(0.3 + 0.7 * i / files.length);
    }
    var cSize = central.reduce(function (s, c) { return s + c.length; }, 0);
    var E = head(0x06054b50, 22);
    E.v.setUint16(8, files.length, true); E.v.setUint16(10, files.length, true); E.v.setUint32(12, cSize, true); E.v.setUint32(16, offset, true);
    var all = chunks.concat(central, [E.a]), out = new Uint8Array(offset + cSize + 22), p = 0;
    all.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }

  // The interior, one slide per page. Resolves with a Uint8Array.
  async function build(book, onProgress) {
    var F = CX.metrics.load();
    var files = parts(book.pages, book.W, book.H, F);
    if (onProgress) onProgress(0.3);
    return zip(files, onProgress);
  }

  // The full-wrap cover as one slide.
  async function buildCover(cv) {
    return zip(parts([cv], cv.W, cv.H, CX.metrics.load()));
  }

  CX.pptx = { build: build, buildCover: buildCover };
})(typeof window !== 'undefined' ? window : globalThis);
