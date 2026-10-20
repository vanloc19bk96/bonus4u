/*
 * book-builder.js — turns the book state into a list of laid-out pages.
 *
 * The page model produced here is the single input to both the HTML preview
 * and the PDF export, so the two can never drift. Every coordinate is in
 * inches, measured from the top-left corner of the PDF page (bleed included).
 */
(function (global) {
  'use strict';

  var C = global.NCB_CONST;
  var U = global.NCB_UTILS;
  var LAYOUT = global.NCB_LAYOUT;

  /** A source line in capitals, short enough to read as a title, becomes a heading. */
  function isHeadingLine(line) {
    var trimmed = line.trim();
    if (!trimmed || trimmed.length > 40) return false;
    return trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  }

  /**
   * Wrap an editable front-matter block into drawable lines.
   * Returns [{type, tokens, sizePt, bold, heightIn}].
   */
  function layoutTextBlock(text, widthIn) {
    var L = C.BOOK_LAYOUT;
    var out = [];
    var source = String(text === undefined || text === null ? '' : text).replace(/\r\n?/g, '\n').split('\n');

    for (var i = 0; i < source.length; i++) {
      var line = source[i];

      if (line.trim() === '') {
        out.push({ type: 'blank', tokens: [], sizePt: L.bodyPt, bold: false, heightIn: (L.bodyPt / C.POINTS_PER_INCH) * 0.8 });
        continue;
      }

      var heading = isHeadingLine(line);
      var sizePt = heading ? L.headingPt : L.bodyPt;
      var wrapped = U.wrapTextBlock(line, widthIn, sizePt, heading);

      for (var w = 0; w < wrapped.length; w++) {
        out.push({
          type: heading ? 'heading' : 'body',
          tokens: wrapped[w],
          widthIn: U.tokensWidth(wrapped[w]),
          sizePt: sizePt,
          bold: heading,
          heightIn: (sizePt / C.POINTS_PER_INCH) * L.bodyLeadingRatio
        });
      }
      if (heading) {
        out.push({ type: 'blank', tokens: [], sizePt: L.bodyPt, bold: false, heightIn: (L.bodyPt / C.POINTS_PER_INCH) * 0.5 });
      }
    }

    // A trailing blank line would only push a continuation page.
    while (out.length && out[out.length - 1].type === 'blank') out.pop();
    return out;
  }

  /** Split laid-out lines across as many pages as they need. */
  function paginateLines(lines, availableHeightIn) {
    var pages = [];
    var current = [];
    var used = 0;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (current.length && used + line.heightIn > availableHeightIn) {
        pages.push(current);
        current = [];
        used = 0;
        if (line.type === 'blank') continue; // never start a page with blank space
      }
      current.push(line);
      used += line.heightIn;
    }
    if (current.length) pages.push(current);
    if (!pages.length) pages.push([]);
    return pages;
  }

  /** Shrink a band rect on all four sides by `insetIn`, for breathing room inside the safe area. */
  function insetRect(rect, insetIn) {
    return {
      x: rect.x + insetIn,
      y: rect.y + insetIn,
      w: rect.w - insetIn * 2,
      h: rect.h - insetIn * 2
    };
  }

  /**
   * Positions of the puzzle cards on one page, given a density layout and how
   * many cards the page actually carries.
   *
   * Card slots are stepped across the whole body area, but a card's drawn
   * content (title, digit grid and clue pegs) is smaller than its slot and is
   * anchored to the slot's top-left corner. So the block of real content is
   * centred in the body area on both axes: the margin above the first row
   * matches the margin below the last row, and the left margin of a row matches
   * its right margin. A page that is not completely full stays balanced too —
   * three cards in a 2x2 grid put the third in the middle of row two, and a
   * lone card lands dead centre of the page.
   */
  function placeCards(bodyArea, densityLayout, cardCount) {
    var L = C.BOOK_LAYOUT;
    var cols = densityLayout.cols;
    var card = densityLayout.card;
    var count = (cardCount === undefined || cardCount === null)
      ? cols * densityLayout.rows
      : Math.max(0, Math.min(cardCount, cols * densityLayout.rows));

    var stepX = densityLayout.cardWIn + L.cardGapIn;
    var stepY = densityLayout.cardHIn + L.cardGapIn;

    var rowsUsed = Math.max(1, Math.ceil(count / cols));

    // Content, not slots: the used rows span (rowsUsed - 1) full steps plus one
    // card's worth of drawn height. Centre that in the body area.
    var contentBlockHIn = (rowsUsed - 1) * stepY + card.usedHeightIn;
    var offsetY = Math.max(0, (bodyArea.h - contentBlockHIn) / 2);

    var slots = [];
    for (var i = 0; i < count; i++) {
      var r = Math.floor(i / cols);
      var c = i % cols;
      var cardsInRow = Math.min(cols, count - r * cols);
      // A row's content runs from the first card's left pad to the last card's
      // right edge; centring it also absorbs a short final row.
      var contentRowWIn = (cardsInRow - 1) * stepX + card.usedWidthIn;
      var offsetX = Math.max(0, (bodyArea.w - contentRowWIn) / 2 - L.cardPadXIn);
      slots.push({
        x: bodyArea.x + offsetX + c * stepX,
        y: bodyArea.y + offsetY + r * stepY,
        w: densityLayout.cardWIn,
        h: densityLayout.cardHIn
      });
    }
    return slots;
  }

  /**
   * Build every page of the book.
   *
   * Margins depend on the final page count, and the page count depends on the
   * margins, so the pass is repeated until the gutter bracket stops changing.
   *
   * @returns {{pages, rules, density, warnings, sections}}
   */
  function buildBook(book) {
    var puzzles = book.puzzles || [];
    var trim = C.KDP_TRIM_SIZES[book.print.trimSizeId];
    if (!trim) throw new Error('Unknown trim size: ' + book.print.trimSizeId);

    // Cards are sized for the longest clue list actually present, so a book of
    // short puzzles is not squeezed by the settings' worst case.
    var clueRowsForLayout = book.puzzleSettings.maxClues;
    for (var p = 0; p < puzzles.length; p++) {
      clueRowsForLayout = Math.max(clueRowsForLayout, puzzles[p].guesses.length);
    }
    if (!puzzles.length) clueRowsForLayout = book.puzzleSettings.maxClues;

    var estimate = Math.max(trim.minPages, puzzles.length + 8);
    var result = null;

    for (var pass = 0; pass < 6; pass++) {
      result = layoutPass(book, puzzles, trim, clueRowsForLayout, estimate);
      if (result.pages.length === estimate) break;
      var next = result.pages.length;
      // Guard against oscillating between two gutter brackets: settle on the
      // larger count, which is the safer margin.
      if (pass >= 3) next = Math.max(next, estimate);
      estimate = Math.max(1, next);
    }

    return result;
  }

  function layoutPass(book, puzzles, trim, clueRowsForLayout, assumedPageCount) {
    var L = C.BOOK_LAYOUT;
    var warnings = [];

    var rules = LAYOUT.getKdpLayoutRules({
      trimSizeId: book.print.trimSizeId,
      trimWidthIn: trim.widthIn,
      trimHeightIn: trim.heightIn,
      pageCount: assumedPageCount,
      bleed: book.print.bleed,
      inkType: book.print.ink,
      paperType: book.print.paper
    });

    var showPageNumbers = book.print.showPageNumbers !== false;

    // Both facing-page variants share the same content size, so a page-1 box is
    // enough to plan the layout; only x shifts on even pages. Puzzle pages carry
    // no running head, so the density plan reserves no header band either.
    var planBox = LAYOUT.getContentBox(rules, 1);
    var planBands = LAYOUT.getPageBands(planBox, { header: false, footer: showPageNumbers });

    // Puzzle cards and the answer key sit a little inside the safe area, so
    // nothing touches the trimmed edge of the content box.
    var puzzleBodyPlan = insetRect(planBands.body, L.bodyInsetIn);
    var density = LAYOUT.chooseDensity(puzzleBodyPlan, book.puzzleSettings.puzzlesPerPage, book.puzzleSettings.codeLength, clueRowsForLayout);
    var densityLayout = density.layout;

    if (densityLayout && !densityLayout.fits) {
      if (density.recommended) {
        warnings.push('At ' + trim.label + ', ' + densityLayout.density + ' puzzles per page makes the digits smaller than ' +
          C.MIN_FONT_PT.puzzleDigit + ' pt. Try ' + density.recommended + ' per page.');
      } else {
        warnings.push('No puzzle density fits ' + trim.label + ' with a code length of ' + book.puzzleSettings.codeLength +
          ' and up to ' + clueRowsForLayout + ' clue rows. Choose a larger trim size or a shorter code.');
      }
    }

    var pages = [];
    var sections = { copyright: 0, instructions: 0, puzzles: 0, answers: 0, blank: 0 };

    function newPage(kind, options) {
      var index = pages.length + 1;
      var box = LAYOUT.getContentBox(rules, index);
      var bands = LAYOUT.getPageBands(box, options);
      var page = {
        id: 'page-' + index,
        index: index,
        kind: kind,
        box: box,
        bands: bands,
        headerText: options.headerText || null,
        showPageNumber: !!options.footer,
        overflow: false
      };
      pages.push(page);
      return page;
    }

    /* --- front matter --- */

    function addFrontMatter(kind, text) {
      var probeBox = LAYOUT.getContentBox(rules, pages.length + 1);
      var probeBands = LAYOUT.getPageBands(probeBox, { header: false, footer: false });
      var textArea = insetRect(probeBands.body, L.frontMatterInsetIn);
      var lines = layoutTextBlock(text, textArea.w);
      var chunks = paginateLines(lines, textArea.h);

      for (var i = 0; i < chunks.length; i++) {
        var page = newPage(kind, { header: false, footer: false });
        var textBox = insetRect(page.bands.body, L.frontMatterInsetIn);

        var usedHeight = 0;
        for (var li = 0; li < chunks[i].length; li++) usedHeight += chunks[i][li].heightIn;
        textBox.y += Math.max(0, (textBox.h - usedHeight) / 2);

        page.bands.body = textBox;
        page.lines = chunks[i];
        page.continuation = i > 0;
        page.textAlign = 'center';
        sections[kind]++;
      }
      if (chunks.length > 1) {
        warnings.push('The ' + (kind === 'copyright' ? 'copyright' : 'instruction') + ' text does not fit on one page. ' +
          (chunks.length - 1) + ' continuation page' + (chunks.length > 2 ? 's have' : ' has') + ' been added.');
      }
    }

    if (book.frontMatter.copyright.enabled) {
      addFrontMatter('copyright', U.applyPlaceholders(book.frontMatter.copyright.text, book.meta));
    }
    if (book.frontMatter.instructions.enabled) {
      addFrontMatter('instructions', U.applyPlaceholders(book.frontMatter.instructions.text, book.meta));
    }

    /* --- puzzle pages --- */

    var perPage = densityLayout ? densityLayout.cols * densityLayout.rows : 1;
    for (var i = 0; i < puzzles.length; i += perPage) {
      var page = newPage('puzzles', { header: false, footer: showPageNumbers });
      var group = puzzles.slice(i, i + perPage);
      var slots = placeCards(insetRect(page.bands.body, L.bodyInsetIn), densityLayout, group.length);

      page.card = densityLayout.card;
      page.cards = [];
      for (var s = 0; s < group.length; s++) {
        page.cards.push({ puzzle: group[s], box: slots[s] });
      }
      if (densityLayout.card.usedHeightIn > densityLayout.cardHIn + 1e-6 ||
          densityLayout.card.usedWidthIn > densityLayout.cardWIn - C.BOOK_LAYOUT.cardPadXIn * 2 + 1e-6) {
        page.overflow = true;
      }
      sections.puzzles++;
    }

    /* --- answer key --- */

    if (book.answers.enabled && puzzles.length) {
      // One measured offset for the code column, shared by the preview and the
      // PDF so the two cannot drift apart.
      var codeOffsetIn = U.textWidthIn('000', L.answerPt, false) + L.answerLabelGapIn;

      var widestCode = 0;
      var entries = [];
      for (var a = 0; a < puzzles.length; a++) {
        var entry = {
          label: U.padNumber(puzzles[a].id, 3),
          code: puzzles[a].secret.join(' ')
        };
        entry.text = entry.label + '   ' + entry.code;
        entries.push(entry);
        if (a % 25 === 0 || a === puzzles.length - 1) {
          widestCode = Math.max(widestCode, U.textWidthIn(entry.code, L.answerPt, false));
        }
      }

      var answerProbeBox = LAYOUT.getContentBox(rules, pages.length + 1);
      var answerBands = LAYOUT.getPageBands(answerProbeBox, { header: true, footer: showPageNumbers });
      var grid = LAYOUT.measureAnswerGrid(insetRect(answerBands.body, L.bodyInsetIn), codeOffsetIn + widestCode);
      grid.codeOffsetIn = codeOffsetIn;

      for (var e = 0; e < entries.length; e += grid.perPage) {
        var apage = newPage('answers', { header: true, footer: showPageNumbers, headerText: 'ANSWER KEY' });
        var slice = entries.slice(e, e + grid.perPage);
        var abody = insetRect(apage.bands.body, L.bodyInsetIn);
        apage.grid = grid;
        apage.answers = [];

        // Centre the entries this page actually carries, on both axes, so a
        // short last page is balanced instead of stacked at the top-left.
        var colsUsed = Math.max(1, Math.ceil(slice.length / grid.rows));
        var rowsUsed = Math.min(slice.length, grid.rows);
        var blockWIn = (colsUsed - 1) * grid.colPitchIn + grid.colWidthIn;
        var blockHIn = rowsUsed * grid.lineHeightIn;
        var offsetXIn = Math.max(0, (abody.w - blockWIn) / 2);
        var offsetYIn = Math.max(0, (abody.h - blockHIn) / 2);

        for (var k = 0; k < slice.length; k++) {
          var col = Math.floor(k / grid.rows);
          var row = k % grid.rows;
          apage.answers.push({
            entry: slice[k],
            x: abody.x + offsetXIn + col * grid.colPitchIn,
            y: abody.y + offsetYIn + row * grid.lineHeightIn,
            sizePt: L.answerPt
          });
        }
        sections.answers++;
      }
    }

    /* --- even-page padding --- */

    // KDP prints on sheets of two pages, so a paperback interior always comes
    // out with an even physical page count. Rather than let KDP silently append
    // an unnamed blank page, add it here so the preview, the PDF and the printed
    // book all agree on the same page count. This runs inside the layout pass so
    // the gutter margin is computed for the real (even) count.
    if (pages.length % 2 === 1) {
      var pad = newPage('blank', { header: false, footer: false });
      pad.isPadPage = true;
      sections.blank++;
    }

    return {
      pages: pages,
      rules: rules,
      density: density,
      densityLayout: densityLayout,
      clueRowsForLayout: clueRowsForLayout,
      sections: sections,
      warnings: warnings
    };
  }

  global.NCB_BOOK = {
    isHeadingLine: isHeadingLine,
    layoutTextBlock: layoutTextBlock,
    paginateLines: paginateLines,
    placeCards: placeCards,
    buildBook: buildBook
  };
})(window);
