/*
 * kdp-layout.js — every physical dimension in the book comes from here.
 *
 * Preview, pagination, validation and PDF export all call getKdpLayoutRules()
 * and getContentBox(). Margin arithmetic must never be repeated anywhere else.
 */
(function (global) {
  'use strict';

  var C = global.NCB_CONST;
  var U = global.NCB_UTILS;

  /** Minimum inside/gutter margin KDP requires for a given final page count. */
  function getKdpMinGutterIn(pageCount) {
    var table = C.KDP_GUTTER_TABLE;
    for (var i = 0; i < table.length; i++) {
      if (pageCount <= table[i].upTo) return table[i].gutterIn;
    }
    return table[table.length - 1].gutterIn;
  }

  /** KDP rounds an odd manuscript up to an even physical page count. */
  function getEffectivePageCount(actualPageCount) {
    return actualPageCount % 2 === 0 ? actualPageCount : actualPageCount + 1;
  }

  function isLargeTrim(widthIn, heightIn) {
    return widthIn > C.LARGE_TRIM_WIDTH_IN || heightIn > C.LARGE_TRIM_HEIGHT_IN;
  }

  /**
   * The one function that resolves a print profile into real dimensions.
   *
   * @param {object} opts
   * @param {number} opts.trimWidthIn
   * @param {number} opts.trimHeightIn
   * @param {number} opts.pageCount   final physical PDF page count
   * @param {boolean} opts.bleed
   * @param {string} [opts.inkType]   'black'
   * @param {string} [opts.paperType] 'white'
   * @param {string} [opts.trimSizeId]
   */
  function getKdpLayoutRules(opts) {
    var trimW = opts.trimWidthIn;
    var trimH = opts.trimHeightIn;
    var bleed = !!opts.bleed;
    var pageCount = Math.max(1, opts.pageCount || 1);

    var profile = opts.trimSizeId ? C.KDP_TRIM_SIZES[opts.trimSizeId] : null;

    var kdpMinGutterIn = getKdpMinGutterIn(getEffectivePageCount(pageCount));
    var kdpMinOutsideIn = bleed ? C.KDP_MIN_OUTSIDE_BLEED_IN : C.KDP_MIN_OUTSIDE_NO_BLEED_IN;

    // Design margins sit inside the KDP minimums, never on top of them.
    var d = C.DESIGN_MARGIN_IN;
    var marginInsideIn = Math.max(d.insideFloor, kdpMinGutterIn + d.insideSafetyBuffer);
    var marginOutsideIn = Math.max(d.outside, kdpMinOutsideIn);
    var marginTopIn = Math.max(d.top, kdpMinOutsideIn);
    var marginBottomIn = Math.max(d.bottom, kdpMinOutsideIn);

    // Bleed grows the PDF page on the outside edge, top and bottom only.
    var pageWidthIn = bleed ? trimW + C.BLEED_IN : trimW;
    var pageHeightIn = bleed ? trimH + C.BLEED_IN * 2 : trimH;

    return {
      trimSizeId: opts.trimSizeId || null,
      trimWidthIn: trimW,
      trimHeightIn: trimH,
      bleed: bleed,
      bleedIn: bleed ? C.BLEED_IN : 0,
      inkType: opts.inkType || 'black',
      paperType: opts.paperType || 'white',

      pageWidthIn: pageWidthIn,
      pageHeightIn: pageHeightIn,
      pageWidthPt: U.inToPt(pageWidthIn),
      pageHeightPt: U.inToPt(pageHeightIn),

      kdpMinGutterIn: kdpMinGutterIn,
      kdpMinOutsideIn: kdpMinOutsideIn,

      marginTopIn: marginTopIn,
      marginBottomIn: marginBottomIn,
      marginInsideIn: marginInsideIn,
      marginOutsideIn: marginOutsideIn,

      contentWidthIn: trimW - marginInsideIn - marginOutsideIn,
      contentHeightIn: trimH - marginTopIn - marginBottomIn,

      pageCount: pageCount,
      effectivePageCount: getEffectivePageCount(pageCount),
      minPages: profile ? profile.minPages : 24,
      maxPages: profile ? profile.maxPages : 828,
      category: profile ? profile.category : (isLargeTrim(trimW, trimH) ? 'large' : 'regular')
    };
  }

  /**
   * Safe content rectangle for one physical page, in inches measured from the
   * top-left corner of the PDF page (bleed included).
   *
   * Page 1 is a right-hand (odd) page: gutter left, outside right.
   */
  function getContentBox(rules, physicalPageIndex) {
    var isOdd = physicalPageIndex % 2 === 1;
    var bleedIn = rules.bleedIn;

    // Where the trimmed page begins inside the (possibly larger) PDF page.
    var trimX0 = bleedIn ? (isOdd ? 0 : bleedIn) : 0;
    var trimY0 = bleedIn;

    var leftMargin = isOdd ? rules.marginInsideIn : rules.marginOutsideIn;

    return {
      isOdd: isOdd,
      gutterSide: isOdd ? 'left' : 'right',
      trimX0: trimX0,
      trimY0: trimY0,
      x: trimX0 + leftMargin,
      y: trimY0 + rules.marginTopIn,
      w: rules.contentWidthIn,
      h: rules.contentHeightIn
    };
  }

  /**
   * Preview overlay for the inside/gutter margin.
   *
   * Bleed is added only on the outside, top and bottom — never on the gutter —
   * so an even (left-hand) page's gutter is flush with the PDF's right edge,
   * even when the trim box itself is shifted right by the outside bleed.
   */
  function getGutterRect(rules, box) {
    var w = rules.marginInsideIn;
    return {
      x: box.isOdd ? box.trimX0 : rules.pageWidthIn - w,
      y: 0,
      w: w,
      h: rules.pageHeightIn
    };
  }

  /**
   * Vertical bands inside the content box: running head, body, page-number foot.
   * Bands are only reserved when the page actually uses them.
   *
   * Header and footer are inset horizontally so the running-head rule does not
   * sit on the safe-area edge, where it would meet the gutter overlay.
   */
  function getPageBands(box, options) {
    var L = C.BOOK_LAYOUT;
    var showHeader = !!(options && options.header);
    var showFooter = !!(options && options.footer);

    var headerH = showHeader ? L.headerHeightIn + L.headerGapIn : 0;
    var footerH = showFooter ? L.footerHeightIn + L.footerGapIn : 0;
    var insetX = L.bodyInsetIn;

    return {
      header: showHeader
        ? { x: box.x + insetX, y: box.y, w: box.w - insetX * 2, h: L.headerHeightIn }
        : null,
      body: { x: box.x, y: box.y + headerH, w: box.w, h: box.h - headerH - footerH },
      footer: showFooter
        ? { x: box.x + insetX, y: box.y + box.h - L.footerHeightIn, w: box.w - insetX * 2, h: L.footerHeightIn }
        : null
    };
  }

  /**
   * Geometry of one puzzle card, derived from a single square `cell` size.
   *
   * A card is: a title line, then `clueRows` rows of `codeLength` square digit
   * cells, with the clue pegs grouped to the right of each row.
   */
  function measureCard(cardWIn, cardHIn, codeLength, clueRows) {
    var L = C.BOOK_LAYOUT;
    var titleLineIn = (L.cardTitlePt / C.POINTS_PER_INCH) * 1.25;
    var titleBlockIn = titleLineIn + L.cardTitleGapIn;

    // Width in "cell units": digit cells + lead gap + one pitch per peg slot.
    var widthUnits = codeLength * (1 + L.pegPitchRatio) + L.pegLeadGapRatio;

    var cellFromW = (cardWIn - L.cardPadXIn * 2) / widthUnits;
    var cellFromH = (cardHIn - titleBlockIn) / clueRows;
    var cell = Math.min(cellFromW, cellFromH);

    var digitPt = cell * L.digitFontRatio * C.POINTS_PER_INCH;
    var gridW = cell * codeLength;
    var pegAreaW = cell * (L.pegLeadGapRatio + L.pegPitchRatio * codeLength);

    return {
      cardWIn: cardWIn,
      cardHIn: cardHIn,
      cellIn: cell,
      digitPt: digitPt,
      titleLineIn: titleLineIn,
      titleBlockIn: titleBlockIn,
      gridWidthIn: gridW,
      gridHeightIn: cell * clueRows,
      pegAreaWidthIn: pegAreaW,
      pegDiameterIn: cell * L.pegDiameterRatio,
      pegPitchIn: cell * L.pegPitchRatio,
      pegLeadGapIn: cell * L.pegLeadGapRatio,
      gridLineIn: U.clamp(cell * L.gridLineRatio, L.minGridLineIn, L.maxGridLineIn),
      usedWidthIn: gridW + pegAreaW,
      usedHeightIn: titleBlockIn + cell * clueRows,
      fits: cell > 0 && digitPt >= C.MIN_FONT_PT.puzzleDigit
    };
  }

  /**
   * Card box for a given density inside a puzzle body area.
   */
  function measureDensity(bodyArea, density, codeLength, clueRows) {
    var L = C.BOOK_LAYOUT;
    var option = null;
    for (var i = 0; i < C.DENSITY_OPTIONS.length; i++) {
      if (C.DENSITY_OPTIONS[i].value === density) option = C.DENSITY_OPTIONS[i];
    }
    if (!option) return null;

    var cardW = (bodyArea.w - L.cardGapIn * (option.cols - 1)) / option.cols;
    var cardH = (bodyArea.h - L.cardGapIn * (option.rows - 1)) / option.rows;
    var card = measureCard(cardW, cardH, codeLength, clueRows);

    return {
      density: density,
      cols: option.cols,
      rows: option.rows,
      cardWIn: cardW,
      cardHIn: cardH,
      card: card,
      fits: card.fits
    };
  }

  /**
   * Highest density that still satisfies the readability minimums, or the
   * requested density with a `fits: false` flag so the UI can warn.
   */
  function chooseDensity(bodyArea, requested, codeLength, clueRows) {
    if (requested === 'auto' || requested === null || requested === undefined) {
      for (var i = 0; i < C.DENSITY_OPTIONS.length; i++) {
        var m = measureDensity(bodyArea, C.DENSITY_OPTIONS[i].value, codeLength, clueRows);
        if (m && m.fits) return { auto: true, layout: m, recommended: m.density };
      }
      // Nothing fits: fall back to one per page and let validation report it.
      var one = measureDensity(bodyArea, 1, codeLength, clueRows);
      return { auto: true, layout: one, recommended: 1 };
    }

    var chosen = measureDensity(bodyArea, Number(requested), codeLength, clueRows);
    var recommended = null;
    if (chosen && !chosen.fits) {
      for (var j = 0; j < C.DENSITY_OPTIONS.length; j++) {
        var alt = measureDensity(bodyArea, C.DENSITY_OPTIONS[j].value, codeLength, clueRows);
        if (alt && alt.fits) { recommended = alt.density; break; }
      }
    }
    return { auto: false, layout: chosen, recommended: recommended };
  }

  /**
   * Column/row fit for the answer key, computed from the real content box.
   *
   * Columns keep their natural content width (not stretched to fill the row) so
   * the block of entries can be centred in the body area, the same way the
   * puzzle cards are.
   */
  function measureAnswerGrid(bodyArea, entryWidthIn) {
    var L = C.BOOK_LAYOUT;
    var colWidthIn = Math.max(L.answerMinColWidthIn, entryWidthIn);
    var colPitchIn = colWidthIn + L.answerColGapIn;
    var cols = Math.max(1, Math.floor((bodyArea.w + L.answerColGapIn) / colPitchIn));
    var rows = Math.max(1, Math.floor(bodyArea.h / L.answerLineIn));
    return {
      cols: cols,
      rows: rows,
      colWidthIn: colWidthIn,
      colPitchIn: colPitchIn,
      lineHeightIn: L.answerLineIn,
      perPage: cols * rows
    };
  }

  global.NCB_LAYOUT = {
    getKdpMinGutterIn: getKdpMinGutterIn,
    getEffectivePageCount: getEffectivePageCount,
    isLargeTrim: isLargeTrim,
    getKdpLayoutRules: getKdpLayoutRules,
    getContentBox: getContentBox,
    getGutterRect: getGutterRect,
    getPageBands: getPageBands,
    measureCard: measureCard,
    measureDensity: measureDensity,
    chooseDensity: chooseDensity,
    measureAnswerGrid: measureAnswerGrid
  };
})(window);
