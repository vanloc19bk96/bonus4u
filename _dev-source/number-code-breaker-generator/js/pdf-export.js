/*
 * pdf-export.js — draws the book as a real vector PDF.
 *
 * Nothing here reads the DOM. Every coordinate comes from the page model in
 * inches and is converted to PDF points exactly once, at draw time.
 *
 * The interior is pure black on white: no colour, no transparency, no raster
 * images, no links, no annotations.
 */
(function (global) {
  'use strict';

  var C = global.NCB_CONST;
  var U = global.NCB_UTILS;

  /** Inches to points — the only conversion used by the drawing helpers. */
  function pt(inches) { return U.inToPt(inches); }

  var PEG_STROKE_RATIO = C.BOOK_LAYOUT.pegStrokeRatio;

  function setBlack(doc) {
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setFillColor(0, 0, 0);
  }

  function useFont(doc, sizePt, bold) {
    doc.setFont(bold ? U.FONT_BOLD : U.FONT_REGULAR, bold ? 'bold' : 'normal');
    doc.setFontSize(sizePt);
  }

  /* ------------------------------------------------------------------ *
   * Primitives
   * ------------------------------------------------------------------ */

  /**
   * One clue symbol: filled = right digit in the right place, outline = right
   * digit in the wrong place. The outline is inset by half its stroke so both
   * symbols end up the same outside diameter.
   */
  function drawPeg(doc, centerXIn, centerYIn, radiusIn, filled) {
    var radiusPt = pt(radiusIn);
    if (filled) {
      doc.circle(pt(centerXIn), pt(centerYIn), radiusPt, 'F');
    } else {
      var lineWidth = Math.max(radiusPt * PEG_STROKE_RATIO * 2, 0.5);
      doc.setLineWidth(lineWidth);
      doc.circle(pt(centerXIn), pt(centerYIn), radiusPt - lineWidth / 2, 'S');
    }
  }

  /**
   * The clue group to the right of a guess row.
   * Filled circles are always printed first, then the outline circles. The
   * symbols are a group — they never line up with a particular digit column.
   */
  function drawFeedbackPegs(doc, startXIn, rowCenterYIn, metrics, feedback) {
    var radius = metrics.pegDiameterIn / 2;
    var total = feedback.correctPlace + feedback.correctNumberWrongPlace;
    for (var i = 0; i < total; i++) {
      var cx = startXIn + metrics.pegPitchIn * i + metrics.pegPitchIn / 2;
      drawPeg(doc, cx, rowCenterYIn, radius, i < feedback.correctPlace);
    }
  }

  /** One row of digit cells plus its clue group. */
  function drawGuessRow(doc, gridXIn, rowYIn, metrics, guess, feedback) {
    var cell = metrics.cellIn;
    useFont(doc, metrics.digitPt, false);
    for (var i = 0; i < guess.length; i++) {
      doc.text(String(guess[i]), pt(gridXIn + cell * i + cell / 2), pt(rowYIn + cell / 2), {
        align: 'center',
        baseline: 'middle'
      });
    }
    drawFeedbackPegs(doc, gridXIn + cell * guess.length + metrics.pegLeadGapIn, rowYIn + cell / 2, metrics, feedback);
  }

  /** Title, grid rules and all rows of one puzzle. */
  function drawPuzzleCard(doc, cardBox, metrics, puzzle) {
    var L = C.BOOK_LAYOUT;
    var rows = puzzle.guesses.length;
    var cell = metrics.cellIn;

    var gridX = cardBox.x + L.cardPadXIn;
    var gridY = cardBox.y + metrics.titleBlockIn;
    var gridW = cell * puzzle.settings.codeLength;
    var gridH = cell * rows;

    useFont(doc, L.cardTitlePt, true);
    // Centred over the grid: same left edge and width as the grid below it.
    doc.text('Puzzle ' + U.padNumber(puzzle.id, 3), pt(gridX + gridW / 2), pt(cardBox.y), {
      align: 'center',
      baseline: 'top'
    });

    doc.setLineWidth(pt(metrics.gridLineIn));
    doc.rect(pt(gridX), pt(gridY), pt(gridW), pt(gridH), 'S');

    var i;
    for (i = 1; i < puzzle.settings.codeLength; i++) {
      doc.line(pt(gridX + cell * i), pt(gridY), pt(gridX + cell * i), pt(gridY + gridH));
    }
    for (i = 1; i < rows; i++) {
      doc.line(pt(gridX), pt(gridY + cell * i), pt(gridX + gridW), pt(gridY + cell * i));
    }

    for (i = 0; i < rows; i++) {
      drawGuessRow(doc, gridX, gridY + cell * i, metrics, puzzle.guesses[i], puzzle.feedback[i]);
    }
  }

  function drawHeader(doc, page) {
    if (!page.bands.header || !page.headerText) return;
    var L = C.BOOK_LAYOUT;
    var band = page.bands.header;
    useFont(doc, L.headerPt, false);
    doc.text(page.headerText, pt(band.x + band.w / 2), pt(band.y + band.h * 0.55), {
      align: 'center',
      baseline: 'middle'
    });
    doc.setLineWidth(0.5);
    doc.line(pt(band.x), pt(band.y + band.h), pt(band.x + band.w), pt(band.y + band.h));
  }

  function drawPageNumber(doc, page) {
    if (!page.showPageNumber || !page.bands.footer) return;
    var L = C.BOOK_LAYOUT;
    var band = page.bands.footer;
    useFont(doc, L.footerPt, false);
    doc.text(String(page.index), pt(band.x + band.w / 2), pt(band.y + band.h * 0.5), {
      align: 'center',
      baseline: 'middle'
    });
  }

  /** A front-matter page: wrapped lines, with inline clue symbols drawn as circles. */
  function drawTextPage(doc, page) {
    var body = page.bands.body;
    var centered = page.textAlign === 'center';
    var y = body.y;

    for (var i = 0; i < page.lines.length; i++) {
      var line = page.lines[i];
      if (line.type === 'blank') { y += line.heightIn; continue; }

      var baseline = y + line.heightIn * 0.75;
      var x = centered ? body.x + (body.w - line.widthIn) / 2 : body.x;
      useFont(doc, line.sizePt, line.bold);

      for (var t = 0; t < line.tokens.length; t++) {
        var token = line.tokens[t];
        if (token.type === 'peg') {
          var sizeIn = line.sizePt / C.POINTS_PER_INCH;
          drawPeg(doc,
            x + token.widthIn / 2,
            baseline - sizeIn * C.BOOK_LAYOUT.inlinePegBaselineRatio,
            sizeIn * C.BOOK_LAYOUT.inlinePegDiameterRatio / 2,
            token.filled);
        } else {
          doc.text(token.text, pt(x), pt(baseline), { baseline: 'alphabetic' });
        }
        x += token.widthIn;
      }
      y += line.heightIn;
    }
  }

  function drawPuzzlePage(doc, page) {
    drawHeader(doc, page);
    for (var i = 0; i < page.cards.length; i++) {
      drawPuzzleCard(doc, page.cards[i].box, page.card, page.cards[i].puzzle);
    }
    drawPageNumber(doc, page);
  }

  function drawAnswerPage(doc, page) {
    drawHeader(doc, page);
    useFont(doc, C.BOOK_LAYOUT.answerPt, false);
    for (var i = 0; i < page.answers.length; i++) {
      var a = page.answers[i];
      var baseline = pt(a.y + page.grid.lineHeightIn * 0.72);
      doc.text(a.entry.label, pt(a.x), baseline, { baseline: 'alphabetic' });
      doc.text(a.entry.code, pt(a.x + page.grid.codeOffsetIn), baseline, { baseline: 'alphabetic' });
    }
    drawPageNumber(doc, page);
  }

  function drawPage(doc, page) {
    setBlack(doc);
    switch (page.kind) {
      case 'copyright':
      case 'instructions':
        drawTextPage(doc, page);
        break;
      case 'puzzles':
        drawPuzzlePage(doc, page);
        break;
      case 'answers':
        drawAnswerPage(doc, page);
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ *
   * Standard-14 font removal
   * ------------------------------------------------------------------ */

  var CORE_FONTS = /\/BaseFont\s*\/(Helvetica|Times-Roman|Times-Bold|Times-Italic|Times-BoldItalic|Courier|Symbol|ZapfDingbats)(-(Bold|Oblique|BoldOblique))?[\s\/>]/;

  /** Overwrite byte ranges with spaces, keeping the file length identical. */
  function blankRanges(text, ranges) {
    if (!ranges.length) return text;
    ranges.sort(function (a, b) { return a.start - b.start; });

    var out = '';
    var cursor = 0;
    for (var i = 0; i < ranges.length; i++) {
      var range = ranges[i];
      if (range.start < cursor) return null; // overlapping ranges: refuse to patch
      out += text.slice(cursor, range.start);
      out += new Array(range.end - range.start + 1).join(' ');
      cursor = range.end;
    }
    return out + text.slice(cursor);
  }

  /**
   * jsPDF registers the PDF "standard 14" fonts — Helvetica, Times, Courier,
   * Symbol, ZapfDingbats — in every document's shared font resource dictionary
   * whether or not anything draws with them. Those fonts are referenced but
   * never embedded, so a preflight that walks the resource tree reports
   * fourteen non-embedded fonts. KDP rejects interiors on exactly that.
   *
   * All of our drawing selects the embedded Noto Sans faces, so the entries are
   * dead weight. They are removed by overwriting them with spaces: every
   * replacement preserves the byte length, so the cross-reference table stays
   * valid without being rebuilt.
   *
   * If the document does not look the way this expects, the original bytes come
   * back untouched — a slightly larger PDF beats a corrupt one.
   */
  function stripUnusedCoreFonts(raw) {
    var ranges = [];
    var coreObjectNumbers = {};

    var objectPattern = /(\d+)\s+0\s+obj\s*<<([\s\S]*?)>>\s*endobj/g;
    var match;
    while ((match = objectPattern.exec(raw)) !== null) {
      var body = match[2];
      if (body.indexOf('/Type /Font') === -1) continue;
      if (body.indexOf('/FontFile') !== -1) continue;   // an embedded face
      if (body.indexOf('/Type0') !== -1) continue;      // our composite fonts
      if (!CORE_FONTS.test(body)) continue;

      coreObjectNumbers[match[1]] = true;

      // Blank the dictionary body, leaving a valid empty "<<  >>" object.
      var bodyStart = match.index + match[0].indexOf('<<') + 2;
      ranges.push({ start: bodyStart, end: bodyStart + body.length });
    }

    if (!ranges.length) return raw;

    // Drop the matching /Fn entries from the shared font resource dictionary.
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

    var patched = blankRanges(raw, ranges);
    if (patched === null || patched.length !== raw.length) return raw;
    return patched;
  }

  /** Latin-1 PDF string to bytes. */
  function toBytes(raw) {
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
    return bytes;
  }

  /* ------------------------------------------------------------------ *
   * Preflight
   * ------------------------------------------------------------------ */

  /**
   * Re-open the finished document and confirm what actually came out: page
   * count and the physical size of every page.
   */
  function preflight(doc, built, raw) {
    var issues = [];
    var expectedPages = built.pages.length;
    var expectedW = built.rules.pageWidthPt;
    var expectedH = built.rules.pageHeightPt;
    var tolerance = 0.05; // points

    var actualPages = 0;
    try {
      actualPages = doc.internal.getNumberOfPages();
    } catch (err) {
      issues.push('Could not read the page count back from the PDF.');
    }

    if (actualPages !== expectedPages) {
      issues.push('The PDF has ' + actualPages + ' pages but the book model has ' + expectedPages + '.');
    }

    var checkedSizes = 0;
    for (var i = 1; i <= actualPages; i++) {
      try {
        var mediaBox = doc.internal.getPageInfo(i).pageContext.mediaBox;
        var w = mediaBox.topRightX - mediaBox.bottomLeftX;
        var h = mediaBox.topRightY - mediaBox.bottomLeftY;
        if (Math.abs(w - expectedW) > tolerance || Math.abs(h - expectedH) > tolerance) {
          issues.push('Page ' + i + ' measures ' + w.toFixed(2) + ' × ' + h.toFixed(2) + ' pt instead of ' +
            expectedW.toFixed(2) + ' × ' + expectedH.toFixed(2) + ' pt.');
          if (issues.length > 5) break;
        }
        checkedSizes++;
      } catch (err) {
        issues.push('Could not read the size of page ' + i + '.');
        break;
      }
    }

    // Font and content checks run on the bytes that will actually be saved.
    var embeddedFonts = 0;
    var coreFontsInResources = 0;
    var rasterImages = 0;
    var annotations = 0;

    if (raw) {
      embeddedFonts = (raw.match(/\/FontFile2/g) || []).length;
      rasterImages = (raw.match(/\/Subtype\s*\/Image/g) || []).length;
      annotations = (raw.match(/\/Annots/g) || []).length;

      var fontDict = /\/Font\s*<<([\s\S]*?)>>/.exec(raw);
      if (fontDict) {
        var referenced = fontDict[1].match(/\/F\d+\s+(\d+)\s+0\s+R/g) || [];
        for (var f = 0; f < referenced.length; f++) {
          var number = referenced[f].match(/(\d+)\s+0\s+R/)[1];
          var objectMatch = new RegExp('(?:^|[^\\d])' + number + '\\s+0\\s+obj\\s*<<([\\s\\S]*?)>>').exec(raw);
          if (objectMatch && objectMatch[1].indexOf('/Type /Font') !== -1 &&
              objectMatch[1].indexOf('/FontFile') === -1 && objectMatch[1].indexOf('/Type0') === -1) {
            coreFontsInResources++;
          }
        }
      }

      if (embeddedFonts === 0) issues.push('No embedded font program was found in the PDF.');
      if (coreFontsInResources > 0) {
        issues.push(coreFontsInResources + ' non-embedded font(s) remain in the PDF resources.');
      }
      if (!/^%PDF-/.test(raw)) issues.push('The output does not start with a PDF header.');
      if (raw.indexOf('/Encrypt') !== -1) issues.push('The PDF appears to be encrypted.');
    }

    return {
      ok: issues.length === 0,
      issues: issues,
      pageCount: actualPages,
      checkedSizes: checkedSizes,
      pageWidthPt: expectedW,
      pageHeightPt: expectedH,
      embeddedFonts: embeddedFonts,
      coreFontsInResources: coreFontsInResources,
      rasterImages: rasterImages,
      annotations: annotations,
      byteLength: raw ? raw.length : 0
    };
  }

  /* ------------------------------------------------------------------ *
   * Export
   * ------------------------------------------------------------------ */

  /**
   * Render the whole book.
   *
   * @param {object} book   book state
   * @param {object} built  result of NCB_BOOK.buildBook
   * @param {object} hooks  { onProgress(done, total, stage), shouldCancel() }
   * @returns {Promise<{doc, preflight}>}
   */
  function exportBookToPdf(book, built, hooks) {
    hooks = hooks || {};
    var rules = built.rules;
    var pages = built.pages;

    if (!pages.length) return Promise.reject(new Error('There are no pages to export.'));

    var doc = U.createPdfDoc(rules.pageWidthIn, rules.pageHeightIn);

    doc.setProperties({
      title: book.meta.title || 'Number Code Breaker',
      subject: book.meta.subtitle || 'Number Code Breaker puzzles',
      author: book.meta.author || '',
      creator: 'Number Code Breaker KDP Generator'
    });

    var index = 0;

    return new Promise(function (resolve, reject) {
      function step() {
        if (hooks.shouldCancel && hooks.shouldCancel()) {
          reject(new Error('PDF export cancelled.'));
          return;
        }

        var sliceStart = Date.now();
        while (index < pages.length) {
          if (index > 0) {
            doc.addPage([rules.pageWidthPt, rules.pageHeightPt],
              rules.pageWidthIn > rules.pageHeightIn ? 'landscape' : 'portrait');
          }
          drawPage(doc, pages[index]);
          index++;
          if (Date.now() - sliceStart > 60) break;
        }

        if (hooks.onProgress) hooks.onProgress(index, pages.length, 'Rendering PDF');

        if (index < pages.length) {
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(step);
          else setTimeout(step, 0);
        } else {
          if (hooks.onProgress) hooks.onProgress(pages.length, pages.length, 'Checking the PDF');
          var raw = stripUnusedCoreFonts(doc.output());
          var bytes = toBytes(raw);
          resolve({
            doc: doc,
            bytes: bytes,
            blob: new Blob([bytes], { type: 'application/pdf' }),
            preflight: preflight(doc, built, raw)
          });
        }
      }
      step();
    });
  }

  /** number-code-breaker-8.5x11-interior.pdf */
  function suggestFilename(book) {
    var trim = C.KDP_TRIM_SIZES[book.print.trimSizeId];
    var slug = (book.meta.title || 'number-code-breaker')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'number-code-breaker';
    var size = trim ? trim.widthIn + 'x' + trim.heightIn : 'custom';
    return slug + '-' + size + (book.print.bleed ? '-bleed' : '') + '-interior.pdf';
  }

  global.NCB_PDF = {
    exportBookToPdf: exportBookToPdf,
    preflight: preflight,
    stripUnusedCoreFonts: stripUnusedCoreFonts,
    suggestFilename: suggestFilename,
    drawPuzzleCard: drawPuzzleCard,
    drawGuessRow: drawGuessRow,
    drawFeedbackPegs: drawFeedbackPegs,
    drawTextPage: drawTextPage,
    drawAnswerPage: drawAnswerPage,
    drawPageNumber: drawPageNumber
  };
})(window);
