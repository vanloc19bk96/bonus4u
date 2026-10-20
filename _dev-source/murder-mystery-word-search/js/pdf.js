/*! pdf.js — jsPDF vector renderer with embedded fonts. */
(function (global) {
  'use strict';

  var L = global.MMLayout;
  var CORE_FONTS = /\/BaseFont\s*\/(Helvetica|Times-Roman|Times-Bold|Times-Italic|Times-BoldItalic|Courier|Symbol|ZapfDingbats)(-(Bold|Oblique|BoldOblique))?[\s\/>]/;

  function pt(inches) { return inches * 72; }

  function jsPDFCtor() {
    if (global.jspdf && global.jspdf.jsPDF) return global.jspdf.jsPDF;
    return global.jsPDF;
  }

  function registerFonts(doc) {
    if (!global.GRID_MONO_BASE64 || !global.NOTO_SANS_BASE64) {
      throw new Error('Font files did not load, so the PDF cannot embed type.');
    }
    doc.addFileToVFS('GridMono.ttf', global.GRID_MONO_BASE64);
    doc.addFont('GridMono.ttf', 'GridMono', 'normal');
    doc.addFileToVFS('DisplaySans.ttf', global.NOTO_SANS_BASE64);
    doc.addFont('DisplaySans.ttf', 'DisplaySans', 'normal');
    doc.addFileToVFS('DisplaySans-Bold.ttf', global.NOTO_SANS_BOLD_BASE64);
    doc.addFont('DisplaySans-Bold.ttf', 'DisplaySans', 'bold');
    doc.addFileToVFS('BodySerif.ttf', global.BODY_SERIF_BASE64 || global.NOTO_SANS_BASE64);
    doc.addFont('BodySerif.ttf', 'BodySerif', 'normal');
    doc.setFont('DisplaySans', 'normal');
  }

  function setGreyFill(doc, pct) {
    doc.setFillColor(Math.round(255 * (1 - pct)));
  }

  function black(doc) {
    doc.setTextColor(0);
    doc.setDrawColor(0);
    doc.setFillColor(0);
  }

  function font(doc, family, weight, size) {
    doc.setFont(family, weight || 'normal');
    doc.setFontSize(size);
    black(doc);
  }

  function blankRanges(text, ranges) {
    if (!ranges.length) return text;
    ranges.sort(function (a, b) { return a.start - b.start; });
    var out = '', cursor = 0, i, range;
    for (i = 0; i < ranges.length; i++) {
      range = ranges[i];
      if (range.start < cursor) return null;
      out += text.slice(cursor, range.start);
      out += new Array(range.end - range.start + 1).join(' ');
      cursor = range.end;
    }
    return out + text.slice(cursor);
  }

  function stripUnusedCoreFonts(raw) {
    var ranges = [];
    var coreObjectNumbers = {};
    var objectPattern = /(\d+)\s+0\s+obj\s*<<([\s\S]*?)>>\s*endobj/g;
    var match, body, bodyStart;
    while ((match = objectPattern.exec(raw)) !== null) {
      body = match[2];
      if (body.indexOf('/Type /Font') === -1) continue;
      if (body.indexOf('/FontFile') !== -1) continue;
      if (body.indexOf('/Type0') !== -1) continue;
      if (!CORE_FONTS.test(body)) continue;
      coreObjectNumbers[match[1]] = true;
      bodyStart = match.index + match[0].indexOf('<<') + 2;
      ranges.push({ start: bodyStart, end: bodyStart + body.length });
    }
    if (!ranges.length) return raw;
    var fontDict = /\/Font\s*<<([\s\S]*?)>>/.exec(raw);
    if (fontDict) {
      var dictStart = fontDict.index + fontDict[0].indexOf('<<') + 2;
      var entryPattern = /\/F\d+\s+(\d+)\s+0\s+R/g;
      var entry;
      while ((entry = entryPattern.exec(fontDict[1])) !== null) {
        if (!coreObjectNumbers[entry[1]]) continue;
        ranges.push({ start: dictStart + entry.index, end: dictStart + entry.index + entry[0].length });
      }
    }
    return blankRanges(raw, ranges) || raw;
  }

  function contentOrigin(page) {
    var box = global.MMLayout.contentBox(page.margins);
    return { x: pt(box.left), y: pt(box.top) };
  }

  function contentWidth(plan, page) {
    var box = global.MMLayout.contentBox(page.margins);
    return pt(plan.trim.w - box.left - box.right);
  }

  function contentHeight(plan, page) {
    var box = global.MMLayout.contentBox(page.margins);
    return pt(plan.trim.h - box.top - box.bottom);
  }

  function drawFolio(doc, plan, page, settings) {
    if (!page.showNumber) return;
    var m = page.margins;
    font(doc, 'DisplaySans', 'normal', plan.geom.type.page);
    // Baseline on the safe-area bottom edge; contentBox leaves a gap above.
    var y = pt(plan.trim.h - m.bottom);
    var text = String(page.folio);
    var w = doc.getTextWidth(text);
    var x;
    if (settings && settings.pagePos === 'outside') {
      x = m.outsideSide === 'right' ? pt(plan.trim.w - m.right) - w : pt(m.left);
    } else {
      x = pt(plan.trim.w / 2) - w / 2;
    }
    doc.text(text, x, y);
  }

  function drawTitle(doc, plan, page, settings) {
    var trim = plan.trim;
    font(doc, 'BodySerif', 'normal', plan.geom.type.flavor);
    doc.text('A murder mystery word search collection', pt(trim.w / 2), pt(trim.h * 0.34), { align: 'center' });
    font(doc, 'DisplaySans', 'bold', Math.max(22, plan.geom.type.title + 10));
    doc.text(settings.bookTitle || 'Murder Search', pt(trim.w / 2), pt(trim.h * 0.46), { align: 'center' });
    if (settings.author) {
      font(doc, 'BodySerif', 'normal', plan.geom.type.flavor + 1);
      doc.text(settings.author, pt(trim.w / 2), pt(trim.h * 0.54), { align: 'center' });
    }
  }

  function drawCopyright(doc, plan, page, settings) {
    var o = contentOrigin(page);
    var width = contentWidth(plan, page);
    var height = contentHeight(plan, page);
    var cx = o.x + width / 2;
    var paras = global.MMLayout.copyrightParagraphs(settings);
    var lineH = plan.geom.type.flavor + 4;
    var gap = 10;
    var blocks = [];
    var totalH = 0;
    font(doc, 'BodySerif', 'normal', plan.geom.type.flavor);
    paras.forEach(function (line, index) {
      var wrapped = doc.splitTextToSize(line, width);
      var blockH = wrapped.length * lineH;
      blocks.push(wrapped);
      totalH += blockH + (index ? gap : 0);
    });
    var y = o.y + Math.max(0, (height - totalH) / 2) + plan.geom.type.flavor;
    blocks.forEach(function (wrapped, index) {
      if (index) y += gap;
      doc.text(wrapped, cx, y, { align: 'center' });
      y += wrapped.length * lineH;
    });
  }

  function drawHowto(doc, plan, page, settings) {
    var o = contentOrigin(page);
    var y = o.y + 8;
    var width = contentWidth(plan, page);
    var steps = settings.howtoText || global.MMPrompt.DEFAULT_HOWTO;
    var titles = settings.howtoTitles || global.MMPrompt.DEFAULT_HOWTO_TITLES;
    font(doc, 'DisplaySans', 'bold', plan.geom.type.title);
    doc.text('How To Solve Every Case', o.x, y);
    y += 28;
    for (var i = 0; i < 5; i++) {
      var label = (i + 1) + ' · ' + (titles[i] || '');
      font(doc, 'DisplaySans', 'bold', 10);
      var tw = doc.getTextWidth(label) + 16;
      setGreyFill(doc, 1);
      doc.roundedRect(o.x, y - 11, tw, 16, 8, 8, 'F');
      doc.setTextColor(255);
      doc.text(label, o.x + 8, y);
      black(doc);
      y += 18;
      font(doc, 'BodySerif', 'normal', plan.geom.type.flavor);
      var wrapped = doc.splitTextToSize(steps[i] || '', width);
      doc.text(wrapped, o.x, y);
      y += wrapped.length * (plan.geom.type.flavor + 3) + 14;
    }
  }

  function drawGrid(doc, grid, x, y, geom) {
    var n = geom.gridN;
    var cell = pt(geom.cell);
    var size = n * cell;
    var fontSize = geom.gridPt;
    var capH = fontSize * (geom.capRatio || L.GRID_CAP_RATIO);
    var r, row, advance, x0, baseline, cx, cy, radius;
    font(doc, 'GridMono', 'normal', fontSize);
    advance = doc.getStringUnitWidth('M') * fontSize;
    x0 = x + (cell - advance) / 2;
    for (r = 0; r < n; r++) {
      row = grid.letters[r].join('');
      // y-down: put cap optical center on the cell center.
      baseline = y + r * cell + cell / 2 + capH / 2;
      doc.text(row, x0, baseline, { charSpace: cell - advance });
    }
    doc.setLineWidth(0.6);
    black(doc);
    // Diameter ~1.05em around the letter, matching the on-screen preview.
    radius = Math.min(cell * 0.46, fontSize * 0.525);
    (grid.circles || []).forEach(function (cir) {
      cx = x + cir.c * cell + cell / 2;
      cy = y + cir.r * cell + cell / 2;
      doc.circle(cx, cy, radius, 'S');
    });
    return size;
  }

  function drawPuzzle(doc, plan, page, puzzle) {
    var geom = plan.geom;
    var o = contentOrigin(page);
    var y = o.y;
    var barH = pt(geom.titleH);
    setGreyFill(doc, 0.10);
    doc.rect(o.x, y, pt(geom.contentW), barH, 'F');
    font(doc, 'DisplaySans', 'bold', geom.type.title);
    doc.text('CASE #' + global.MMPreview.pad2(puzzle.id) + '  ' + String(puzzle.theme).toUpperCase(), o.x + 8, y + barH * 0.68);
    y += barH + pt(geom.bandGap);

    var card = pt(geom.card);
    var colGap = pt(geom.colGap);
    var rowGap = pt(geom.rowGap);
    var sceneX = o.x + pt(geom.sceneOffsetX || 0);
    var i, col, row, cx, cy, g, gridSize;
    for (i = 0; i < 4; i++) {
      col = i % 2;
      row = Math.floor(i / 2);
      cx = sceneX + col * (card + colGap);
      cy = y + row * (card + rowGap);
      doc.setLineWidth(0.8);
      black(doc);
      doc.rect(cx, cy, card, card);
      g = puzzle.grids[i];
      var badge = g.scene;
      font(doc, 'DisplaySans', 'bold', geom.type.scene);
      var bw = doc.getTextWidth(badge) + 14;
      setGreyFill(doc, 1);
      doc.rect(cx + (card - bw) / 2, cy - 8, bw, 16, 'F');
      doc.setTextColor(255);
      doc.text(badge, cx + card / 2, cy + 3, { align: 'center' });
      black(doc);
      gridSize = geom.gridN * pt(geom.cell);
      drawGrid(doc, g, cx + (card - gridSize) / 2, cy + (card - gridSize) / 2, geom);
    }
    y += pt(geom.sceneH) + pt(geom.bandGap);

    var checkH = pt(geom.checkH);
    var checkW = pt(geom.checkW);
    var lists = [
      { title: 'EVIDENCE', items: puzzle.evidence, x: sceneX },
      { title: 'SUSPECTS', items: puzzle.suspects, x: sceneX + card + colGap }
    ];
    lists.forEach(function (list) {
      setGreyFill(doc, 0.10);
      doc.rect(list.x, y, checkW, checkH, 'F');
      var padY = 10;
      var headingH = geom.type.check + 4;
      var itemH = (checkH - padY * 2 - headingH) / Math.max(list.items.length, 1);
      font(doc, 'DisplaySans', 'bold', geom.type.check);
      doc.text(list.title, list.x + 8, y + padY + geom.type.check * 0.8);
      font(doc, 'GridMono', 'normal', geom.type.check);
      list.items.forEach(function (item, idx) {
        var iy = y + padY + headingH + idx * itemH + itemH * 0.72;
        var box = Math.max(7, geom.type.check * 0.72);
        // Center the square on cap-height, not the text baseline.
        var mid = iy - geom.type.check * 0.35;
        doc.setLineWidth(0.6);
        doc.rect(list.x + 8, mid - box / 2, box, box);
        doc.text(item, list.x + 8 + box + 6, iy);
      });
    });
    y += checkH + pt(geom.bandGap);

    font(doc, 'DisplaySans', 'bold', geom.type.blank);
    var labels = [['WEAPON', 'VICTIM'], ['KILLER', 'LOCATION']];
    var colW = pt(geom.contentW) / 2;
    labels.forEach(function (pair, rowIdx) {
      var ly = y + 16 + rowIdx * 22;
      pair.forEach(function (label, colIdx) {
        var lx = o.x + colIdx * colW;
        doc.text(label, lx, ly);
        doc.setLineWidth(0.7);
        doc.line(lx + doc.getTextWidth(label) + 8, ly + 1, lx + colW - 16, ly + 1);
      });
    });
  }

  function drawAnswersText(doc, plan, page, puzzles) {
    var o = contentOrigin(page);
    var y = o.y + 6;
    var width = contentWidth(plan, page);
    var maxY = o.y + contentHeight(plan, page) - 2;
    var keyPt = plan.geom.type.key;
    var lineGap = keyPt * 1.25;
    font(doc, 'DisplaySans', 'bold', plan.geom.type.title);
    doc.text('Answer key', o.x, y);
    y += plan.geom.type.title * 1.15 + 6;
    for (var i = page.from; i <= page.to; i++) {
      var p = puzzles[i];
      if (!p) continue;
      if (y + lineGap * 3 > maxY) break;
      font(doc, 'DisplaySans', 'bold', keyPt + 1);
      doc.text('Case ' + global.MMPreview.pad2(p.id) + '  ' + p.theme, o.x, y);
      y += (keyPt + 1) * 1.2;
      font(doc, 'GridMono', 'normal', keyPt);
      var line = 'Weapon ' + p.weapon + ' · Killer ' + p.killer + ' · Victim ' + p.victim + ' · Location ' + p.location;
      var solWrapped = doc.splitTextToSize(line, width);
      doc.text(solWrapped, o.x, y);
      y += solWrapped.length * lineGap;
      var bits = [];
      p.grids.forEach(function (g) {
        g.placed.forEach(function (pl) {
          if (pl.kind === 'evidence' || pl.kind === 'victim') {
            bits.push(global.MMLayout.formatPlacement(pl, g.scene));
          }
        });
      });
      var wrapped = doc.splitTextToSize(bits.join(' · '), width);
      if (y + wrapped.length * lineGap > maxY) {
        var fit = Math.max(1, Math.floor((maxY - y) / lineGap));
        wrapped = wrapped.slice(0, fit);
      }
      doc.text(wrapped, o.x, y);
      y += wrapped.length * lineGap + 6;
    }
  }

  function drawPage(doc, plan, page, book, settings) {
    switch (page.kind) {
      case 'title': drawTitle(doc, plan, page, settings); break;
      case 'copyright': drawCopyright(doc, plan, page, settings); break;
      case 'howto': drawHowto(doc, plan, page, settings); break;
      case 'puzzle': drawPuzzle(doc, plan, page, book.puzzles[page.caseIndex]); break;
      case 'answers-text': drawAnswersText(doc, plan, page, book.puzzles); break;
      default: break;
    }
    drawFolio(doc, plan, page, settings);
  }

  function toBytes(raw) {
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
    return bytes;
  }

  function exportPdf(plan, book, settings, hooks) {
    hooks = hooks || {};
    var Ctor = jsPDFCtor();
    if (!Ctor) return Promise.reject(new Error('jsPDF did not load.'));
    var minPt = L.minFontPt(plan.geom);
    if (minPt < 7) {
      return Promise.reject(new Error('A letter would print below 7 pt on this trim. Reduce the grid or change the trim.'));
    }
    var w = pt(plan.trim.w);
    var h = pt(plan.trim.h);
    var doc = new Ctor({ unit: 'pt', format: [w, h], compress: true });
    registerFonts(doc);
    doc.setProperties({
      title: settings.bookTitle || 'Murder Search',
      author: settings.author || '',
      creator: 'Murder Mystery Word Search Generator'
    });
    var pages = plan.pages;
    var index = 0;
    return new Promise(function (resolve, reject) {
      function step() {
        var start = Date.now();
        while (index < pages.length) {
          if (index > 0) doc.addPage([w, h]);
          drawPage(doc, plan, pages[index], book, settings);
          index++;
          if (Date.now() - start > 50 || index % 10 === 0) break;
        }
        if (hooks.onProgress) hooks.onProgress(index, pages.length, 'Writing page ' + index + ' of ' + pages.length);
        if (index < pages.length) {
          requestAnimationFrame(step);
        } else {
          var raw = stripUnusedCoreFonts(doc.output());
          var bytes = toBytes(raw);
          resolve({
            bytes: bytes,
            blob: new Blob([bytes], { type: 'application/pdf' }),
            fileName: L.pdfName(settings.bookTitle, plan.trim)
          });
        }
      }
      requestAnimationFrame(step);
    });
  }

  global.MMPdf = {
    exportPdf: exportPdf,
    registerFonts: registerFonts,
    stripUnusedCoreFonts: stripUnusedCoreFonts
  };
})(typeof window !== 'undefined' ? window : globalThis);
