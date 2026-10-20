/* layout.js — the typesetting engine.

   It turns (questions, settings) into a display list: an array of pages,
   each holding plain draw commands measured in inches. Two renderers walk
   that same list, so the preview and the PDF break lines in exactly the
   same places. All measuring happens through one hidden jsPDF instance
   that has the real book fonts registered.                               */
(function () {
  var W = window.WYR;
  var C = W.config;
  var K = W.kdp;

  /* ====================================================================
     Typeset helpers: font registration, measuring and word wrapping
     ==================================================================== */
  var T = (W.typeset = {});

  var measureDoc = null;
  var widthCache = {};

  T.registerFonts = function (doc) {
    for (var key in W.fonts) {
      if (!Object.prototype.hasOwnProperty.call(W.fonts, key)) continue;
      var f = W.fonts[key];
      doc.addFileToVFS(f.file, f.base64);
      doc.addFont(f.file, f.family, f.style);
    }
    return doc;
  };

  T.newDoc = function (wIn, hIn) {
    var jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) throw new Error('Could not find the jsPDF library (lib/jspdf.umd.min.js).');
    var doc = new jsPDFCtor({
      unit: 'in',
      format: [wIn || 6, hIn || 9],
      orientation: 'portrait',
      compress: true,
      // Keeps jsPDF's built-in Helvetica/Times/Courier out of the file.
      // They are never embedded, and KDP flags fonts it cannot embed.
      putOnlyUsedFonts: true
    });
    return T.registerFonts(doc);
  };

  function docForMeasuring() {
    if (!measureDoc) measureDoc = T.newDoc(6, 9);
    return measureDoc;
  }

  T.lineHeight = function (sizePt) { return C.LINE_HEIGHT * sizePt / 72; };

  /* Baseline offset from the top of a line box. Mirrors what a browser does
     with an explicit line-height, using the font's own ascent/descent, so
     the PDF and the preview put the glyphs on the same line. */
  T.baselineOffset = function (fontKey, sizePt) {
    var m = C.FONT_METRICS[fontKey] || C.FONT_METRICS['Nunito-Regular'];
    var lh = T.lineHeight(sizePt);
    var sizeIn = sizePt / 72;
    return (lh - (m.ascent + m.descent) * sizeIn) / 2 + m.ascent * sizeIn;
  };

  /* Top of a one-line text op whose capitals end up optically centred on
     centreY. A line box hangs the glyphs high (the ascent reserves room for
     descenders capitals never use), so centring the box is not the same as
     centring what you see. Used to line labels up with a drawn shape. */
  T.capCentredTop = function (fontKey, sizePt, centreY) {
    var m = C.FONT_METRICS[fontKey] || C.FONT_METRICS['Nunito-Regular'];
    var cap = (m.cap || 0.7) * sizePt / 72;
    return centreY - (T.baselineOffset(fontKey, sizePt) - cap / 2);
  };

  T.width = function (text, family, style, sizePt) {
    if (!text) return 0;
    var key = family + '|' + style + '|' + sizePt + '|' + text;
    var hit = widthCache[key];
    if (hit !== undefined) return hit;
    var doc = docForMeasuring();
    doc.setFont(family, style);
    doc.setFontSize(sizePt);
    var w = doc.getTextWidth(text);
    if (Object.keys(widthCache).length > 60000) widthCache = {};
    widthCache[key] = w;
    return w;
  };

  /* Greedy word wrap. Falls back to breaking inside a word only when a
     single word is wider than the column. Results are cached: auto-fit asks
     for the same string at a dozen sizes, three layout passes in a row. */
  var wrapCache = {};

  T.wrap = function (text, family, style, sizePt, maxW) {
    var ck = family + '|' + style + '|' + sizePt + '|' + maxW.toFixed(4) + '|' + text;
    var cached = wrapCache[ck];
    if (cached) return cached;
    var result = wrapUncached(text, family, style, sizePt, maxW);
    if (Object.keys(wrapCache).length > 40000) wrapCache = {};
    wrapCache[ck] = result;
    return result;
  };

  function wrapUncached(text, family, style, sizePt, maxW) {
    var src = String(text == null ? '' : text).trim();
    if (!src) return [''];
    var paragraphs = src.split('\n');
    var out = [];
    for (var p = 0; p < paragraphs.length; p++) {
      var words = paragraphs[p].split(/\s+/).filter(function (x) { return x.length; });
      if (!words.length) { out.push(''); continue; }
      var line = '';
      for (var i = 0; i < words.length; i++) {
        var candidate = line ? line + ' ' + words[i] : words[i];
        if (T.width(candidate, family, style, sizePt) <= maxW || !line) {
          if (!line && T.width(words[i], family, style, sizePt) > maxW) {
            var pieces = breakWord(words[i], family, style, sizePt, maxW);
            for (var j = 0; j < pieces.length - 1; j++) out.push(pieces[j]);
            line = pieces[pieces.length - 1];
            continue;
          }
          line = candidate;
        } else {
          out.push(line);
          line = words[i];
          if (T.width(line, family, style, sizePt) > maxW) {
            var more = breakWord(line, family, style, sizePt, maxW);
            for (var k = 0; k < more.length - 1; k++) out.push(more[k]);
            line = more[more.length - 1];
          }
        }
      }
      out.push(line);
    }
    return out;
  }

  function breakWord(word, family, style, sizePt, maxW) {
    var parts = [], cur = '';
    for (var i = 0; i < word.length; i++) {
      var next = cur + word[i];
      if (cur && T.width(next + '-', family, style, sizePt) > maxW) {
        parts.push(cur + '-');
        cur = word[i];
      } else cur = next;
    }
    parts.push(cur);
    return parts;
  }

  /* ====================================================================
     Draw command builders. x/y are the top-left corner, in inches.
     ==================================================================== */
  function text(lines, opts) {
    return {
      type: 'text',
      lines: Array.isArray(lines) ? lines : [lines],
      x: opts.x, y: opts.y, w: opts.w,
      family: opts.family || 'Nunito',
      style: opts.style || 'normal',
      size: opts.size,
      align: opts.align || 'left',
      color: opts.color == null ? 0 : opts.color,
      lineHeight: C.LINE_HEIGHT
    };
  }
  function rect(o) {
    return {
      type: 'rect', x: o.x, y: o.y, w: o.w, h: o.h,
      radius: o.radius || 0,
      fill: o.fill == null ? null : o.fill,
      stroke: o.stroke == null ? null : o.stroke,
      lineWidth: o.lineWidth || 0
    };
  }
  function circle(o) {
    return {
      type: 'circle', cx: o.cx, cy: o.cy, r: o.r,
      fill: o.fill == null ? null : o.fill,
      stroke: o.stroke == null ? null : o.stroke,
      lineWidth: o.lineWidth || 0
    };
  }
  function line(o) {
    return {
      type: 'line', x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2,
      lineWidth: o.lineWidth || C.MIN_LINE_PT,
      dash: o.dash || null,
      color: o.color == null ? 0 : o.color
    };
  }

  function blockHeight(lines, sizePt) { return lines.length * T.lineHeight(sizePt); }

  /* ====================================================================
     The engine
     ==================================================================== */
  var L = (W.layout = {});

  /* build(state) -> book
     { pages, margins, trim, perPage, warnings, sections }
     The gutter depends on the page count and the page count depends on the
     gutter, so we settle it by iterating (spec section 3.2).            */
  L.build = function (data) {
    var trimId = data.layout.trim;
    var guess = estimatePageCount(data);
    var margins = K.margins(trimId, guess);
    var book = null;

    for (var pass = 0; pass < 3; pass++) {
      book = compose(data, margins);
      var wanted = K.margins(trimId, book.pages.length);
      if (Math.abs(wanted.gutter - margins.gutter) < 0.0001) break;
      margins = wanted;
    }
    book.margins = margins;
    book.trim = trimId;
    book.audit = K.audit(book);
    return book;
  };

  function estimatePageCount(data) {
    var perPage = data.layout.perPage || 1;
    var n = data.questions.length || 1;
    var pages = Math.ceil(n / perPage) + 4;
    var s = data.layout.sections;
    if (s.howTo) pages += 2;
    if (s.chapters) pages += 8;
    if (s.yourTurn) pages += 5;
    if (s.answers) pages += Math.ceil(n / 12);
    if (s.thankYou) pages += 1;
    return pages;
  }

  /* --- the page context ------------------------------------------------ */
  function newContext(data, margins) {
    var trim = C.TRIMS[data.layout.trim] || C.TRIMS[C.DEFAULT_TRIM];
    var large = K.isLargeTrim(data.layout.trim);
    var scale = large ? C.TYPE.largeScale : 1;
    var perPage = data.layout.perPage === 2 ? 2 : 1;
    var base = perPage === 2 ? C.TYPE.two : C.TYPE.one;

    return {
      data: data,
      trim: trim,
      large: large,
      margins: margins,
      perPage: perPage,
      t: C.text(data.setup.language),
      warnings: [],
      pages: [],
      sizes: {
        prompt: pt(base.prompt * scale),
        optionMax: pt(base.optionMax * scale),
        optionMin: pt(base.optionMin * scale),
        or: pt(base.or * scale),
        meta: pt(base.meta * (large ? 1.1 : 1)),
        folio: pt(large ? C.TYPE.folioLarge : C.TYPE.folio),
        answerBody: pt(large ? C.TYPE.answers.bodyLarge : C.TYPE.answers.body),
        answerHead: pt(C.TYPE.answers.head * scale),
        sectionTitle: pt(24 * scale),
        bodyText: pt((large ? 12 : 11))
      }
    };
  }

  function pt(v) { return Math.max(C.MIN_FONT_PT, Math.round(v * 2) / 2); }

  function addPage(ctx, kind) {
    var page = { no: ctx.pages.length + 1, kind: kind || 'content', ops: [] };
    ctx.pages.push(page);
    return page;
  }

  /* The box we actually lay content into: the KDP safe area pulled in by a
     small inset on every side, so nothing ever touches the margin line. */
  function safeOf(ctx, page) {
    var s = K.safeArea(ctx.data.layout.trim, page.no, ctx.margins);
    var i = C.CONTENT_INSET;
    return {
      x: s.x + i, y: s.y + i,
      w: s.w - i * 2, h: s.h - i * 2,
      trimW: s.trimW, trimH: s.trimH
    };
  }

  /* Starts a section on a right-hand (odd) page, adding at most one blank
     page. KDP flags runs of blank pages, so never more than one. */
  function startOnOdd(ctx, kind) {
    if (ctx.pages.length % 2 !== 0) addPage(ctx, 'blank');
    return addPage(ctx, kind);
  }

  function folio(ctx, page) {
    if (page.kind === 'blank' || page.kind === 'title' || page.kind === 'copyright') return;
    var s = safeOf(ctx, page);
    var size = ctx.sizes.folio;
    var lh = T.lineHeight(size);
    page.ops.push(text([String(page.no)], {
      x: s.x, y: s.y + s.h - lh, w: s.w, size: size,
      family: 'Nunito', style: 'normal', align: 'center', color: 0
    }));
  }

  /* ====================================================================
     compose(): the whole book, front to back (spec section 7.3)
     ==================================================================== */
  function compose(data, margins) {
    var ctx = newContext(data, margins);
    var sections = data.layout.sections;

    composeTitle(ctx);
    composeCopyright(ctx);
    if (sections.howTo) {
      composeHowToPlay(ctx);
      composeScoreSheet(ctx);
    }
    composeQuestions(ctx);
    if (sections.yourTurn) composeYourTurn(ctx);
    if (sections.answers && data.layout.answersPlacement !== 'chapter') {
      composeAnswers(ctx, data.questions, true);
    }
    if (sections.thankYou) composeThankYou(ctx);

    // A paperback is printed in sheets; an odd last page leaves a stray back.
    if (ctx.pages.length % 2 !== 0) addPage(ctx, 'blank');

    for (var i = 0; i < ctx.pages.length; i++) folio(ctx, ctx.pages[i]);

    return {
      pages: ctx.pages,
      warnings: ctx.warnings,
      perPage: ctx.perPage,
      sizes: ctx.sizes
    };
  }

  /* --- front matter ---------------------------------------------------- */
  function composeTitle(ctx) {
    var page = addPage(ctx, 'title');
    var s = safeOf(ctx, page);
    var b = ctx.data.book;
    var title = b.title || defaultTitle(ctx);
    var y = s.y + s.h * 0.24;

    var size = ctx.sizes.sectionTitle + (ctx.large ? 10 : 8);
    var lines;
    while (true) {
      lines = T.wrap(title, 'Baloo2', 'bold', size, s.w);
      if (lines.length <= 3 || size <= 16) break;
      size -= 1;
    }
    page.ops.push(text(lines, {
      x: s.x, y: y, w: s.w, size: size, family: 'Baloo2', style: 'bold', align: 'center'
    }));
    y += blockHeight(lines, size) + 0.28;

    page.ops.push(line({
      x1: s.x + s.w * 0.3, y1: y, x2: s.x + s.w * 0.7, y2: y, lineWidth: 1.2
    }));
    y += 0.3;

    if (b.subtitle) {
      var subSize = ctx.sizes.bodyText + 2;
      var subLines = T.wrap(b.subtitle, 'Nunito', 'normal', subSize, s.w * 0.9);
      page.ops.push(text(subLines, {
        x: s.x + s.w * 0.05, y: y, w: s.w * 0.9, size: subSize,
        family: 'Nunito', style: 'normal', align: 'center'
      }));
    }

    if (b.author) {
      var aSize = ctx.sizes.bodyText;
      var aLines = T.wrap(b.author, 'Nunito', 'bold', aSize, s.w);
      page.ops.push(text(aLines, {
        x: s.x, y: s.y + s.h - blockHeight(aLines, aSize) - 0.2, w: s.w,
        size: aSize, family: 'Nunito', style: 'bold', align: 'center'
      }));
    }
  }

  function defaultTitle(ctx) {
    var t = ctx.t;
    return t.prompt.replace(/[….]+$/, '');
  }

  function composeCopyright(ctx) {
    var page = addPage(ctx, 'copyright');
    var s = safeOf(ctx, page);
    var b = ctx.data.book, t = ctx.t;
    var size = C.MIN_FONT_PT;
    var author = b.author || (b.title || defaultTitle(ctx));
    var parts = [
      t.copyright.replace('{year}', b.year).replace('{author}', author),
      t.copyright2,
      t.copyright3.replace('{year}', b.year)
    ];
    var gap = 0.16;
    var blocks = [], totalH = 0, i;
    for (i = 0; i < parts.length; i++) {
      var lines = T.wrap(parts[i], 'Nunito', 'normal', size, s.w * 0.86);
      blocks.push(lines);
      totalH += blockHeight(lines, size);
    }
    totalH += gap * (parts.length - 1);   // gaps sit between blocks, not after the last

    var y = s.y + (s.h - totalH) / 2;
    for (i = 0; i < blocks.length; i++) {
      page.ops.push(text(blocks[i], {
        x: s.x + s.w * 0.07, y: y, w: s.w * 0.86, size: size,
        family: 'Nunito', style: 'normal', align: 'center'
      }));
      y += blockHeight(blocks[i], size) + gap;
    }
  }

  /* --- how to play ----------------------------------------------------- */
  function composeHowToPlay(ctx) {
    var t = ctx.t;
    var blocks = [];
    blocks.push(titleBlock(ctx, t.howToTitle));
    blocks.push(paraBlock(ctx, t.howToIntro, 'normal', ctx.sizes.bodyText, 0.18));
    blocks.push(headingBlock(ctx, t.classicTitle));
    blocks.push(paraBlock(ctx, t.classicBody, 'normal', ctx.sizes.bodyText, 0.16));
    blocks.push(headingBlock(ctx, t.scoreTitle));
    blocks.push(paraBlock(ctx, t.scoreBody, 'normal', ctx.sizes.bodyText, 0.16));
    blocks.push(headingBlock(ctx, t.tipTitle));
    blocks.push(paraBlock(ctx, t.tipBody, 'normal', ctx.sizes.bodyText, 0.22));
    if (ctx.data.layout.sections.answers) {
      blocks.push(paraBlock(ctx, t.answersNote, 'italic', ctx.sizes.bodyText, 0.1));
    }
    flow(ctx, blocks, { startOdd: true, kind: 'howto', columns: 1 });
  }

  function composeScoreSheet(ctx) {
    var page = addPage(ctx, 'scoresheet');
    var s = safeOf(ctx, page);
    var t = ctx.t;
    var y = s.y;

    var tSize = ctx.sizes.sectionTitle;
    var tLines = T.wrap(t.scoreSheetTitle, 'Baloo2', 'bold', tSize, s.w);
    page.ops.push(text(tLines, {
      x: s.x, y: y, w: s.w, size: tSize, family: 'Baloo2', style: 'bold', align: 'center'
    }));
    y += blockHeight(tLines, tSize) + 0.1;

    var noteSize = ctx.sizes.meta;
    var noteLines = T.wrap(t.scoreSheetNote, 'Nunito', 'italic', noteSize, s.w);
    page.ops.push(text(noteLines, {
      x: s.x, y: y, w: s.w, size: noteSize, family: 'Nunito', style: 'italic',
      align: 'center', color: C.GREY.meta
    }));
    y += blockHeight(noteLines, noteSize) + 0.22;

    var rows = 20;
    var bottom = s.y + s.h - T.lineHeight(ctx.sizes.folio) - 0.15;
    var headH = 0.32;
    var rowH = Math.min(0.34, (bottom - y - headH) / rows);
    var tableH = headH + rowH * rows;
    var colNum = s.w * 0.18, colPlayer = (s.w - colNum) / 2;
    var lw = 1;

    page.ops.push(rect({
      x: s.x, y: y, w: s.w, h: tableH, stroke: 0, lineWidth: lw, radius: 0.06
    }));

    // header
    var hSize = ctx.sizes.meta;
    var hy = y + (headH - T.lineHeight(hSize)) / 2;
    page.ops.push(text(['#'], {
      x: s.x, y: hy, w: colNum, size: hSize, family: 'Nunito', style: 'bold', align: 'center'
    }));
    page.ops.push(text([t.player1], {
      x: s.x + colNum, y: hy, w: colPlayer, size: hSize, family: 'Nunito', style: 'bold', align: 'center'
    }));
    page.ops.push(text([t.player2], {
      x: s.x + colNum + colPlayer, y: hy, w: colPlayer, size: hSize, family: 'Nunito', style: 'bold', align: 'center'
    }));
    page.ops.push(line({ x1: s.x, y1: y + headH, x2: s.x + s.w, y2: y + headH, lineWidth: lw }));
    page.ops.push(line({ x1: s.x + colNum, y1: y, x2: s.x + colNum, y2: y + tableH, lineWidth: lw }));
    page.ops.push(line({
      x1: s.x + colNum + colPlayer, y1: y, x2: s.x + colNum + colPlayer, y2: y + tableH, lineWidth: lw
    }));

    var nSize = Math.max(C.MIN_FONT_PT, ctx.sizes.meta);
    for (var r = 0; r < rows; r++) {
      var ry = y + headH + r * rowH;
      if (r > 0) {
        page.ops.push(line({
          x1: s.x, y1: ry, x2: s.x + s.w, y2: ry, lineWidth: C.MIN_LINE_PT, color: C.GREY.rule
        }));
      }
      page.ops.push(text([String(r + 1)], {
        x: s.x, y: ry + (rowH - T.lineHeight(nSize)) / 2, w: colNum, size: nSize,
        family: 'Nunito', style: 'normal', align: 'center', color: C.GREY.meta
      }));
    }
  }

  /* --- question pages --------------------------------------------------- */
  function composeQuestions(ctx) {
    var data = ctx.data;
    var groups = data.layout.sections.chapters
      ? groupByCategory(data.questions)
      : [{ cat: null, items: data.questions.slice() }];

    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      if (group.cat) composeChapterTitle(ctx, group, g + 1, groups.length);

      var items = group.items;
      for (var i = 0; i < items.length;) {
        var page = addPage(ctx, 'question');
        var s = safeOf(ctx, page);
        var folioH = T.lineHeight(ctx.sizes.folio) + 0.08;
        var area = { x: s.x, y: s.y, w: s.w, h: s.h - folioH };

        if (ctx.perPage === 2 && i + 1 < items.length) {
          var gap = 0.16;
          var half = (area.h - gap) / 2;
          var okTop = placeQuestion(ctx, page, items[i], { x: area.x, y: area.y, w: area.w, h: half });
          var okBottom = okTop && placeQuestion(ctx, page, items[i + 1],
            { x: area.x, y: area.y + half + gap, w: area.w, h: half });
          if (okTop && okBottom) {
            page.ops.push(line({
              x1: area.x + area.w * 0.1, y1: area.y + half + gap / 2,
              x2: area.x + area.w * 0.9, y2: area.y + half + gap / 2,
              lineWidth: C.MIN_LINE_PT, dash: [0.05, 0.05], color: C.GREY.faint
            }));
            i += 2;
          } else if (okTop) {
            i += 1;                           // the second one waits for a new page
          } else {
            page.ops.length = 0;              // too long for half a page: own page
            placeQuestion(ctx, page, items[i], area, true);
            i += 1;
          }
        } else {
          placeQuestion(ctx, page, items[i], area, true);
          i += 1;
        }
      }

      if (ctx.data.layout.sections.answers && ctx.data.layout.answersPlacement === 'chapter') {
        composeAnswers(ctx, group.items, false, group.cat);
      }
    }
  }

  function groupByCategory(questions) {
    var order = [], map = {};
    for (var i = 0; i < questions.length; i++) {
      var cat = questions[i].cat || 'General';
      if (!map[cat]) { map[cat] = { cat: cat, items: [] }; order.push(map[cat]); }
      map[cat].items.push(questions[i]);
    }
    return order;
  }

  function composeChapterTitle(ctx, group, index, total) {
    var page = ctx.data.layout.chapterOnOdd
      ? startOnOdd(ctx, 'chapter')
      : addPage(ctx, 'chapter');
    var s = safeOf(ctx, page);
    var t = ctx.t;
    var y = s.y + s.h * 0.3;

    var labelSize = ctx.sizes.meta;
    page.ops.push(text([(t.chapterWord + ' ' + index).toUpperCase()], {
      x: s.x, y: y, w: s.w, size: labelSize, family: 'Nunito', style: 'bold',
      align: 'center', color: C.GREY.meta
    }));
    y += T.lineHeight(labelSize) + 0.18;

    var size = ctx.sizes.sectionTitle + (ctx.large ? 6 : 4);
    var lines;
    while (true) {
      lines = T.wrap(group.cat, 'Baloo2', 'bold', size, s.w);
      if (lines.length <= 2 || size <= 14) break;
      size -= 1;
    }
    page.ops.push(text(lines, {
      x: s.x, y: y, w: s.w, size: size, family: 'Baloo2', style: 'bold', align: 'center'
    }));
    y += blockHeight(lines, size) + 0.22;

    page.ops.push(line({
      x1: s.x + s.w * 0.35, y1: y, x2: s.x + s.w * 0.65, y2: y, lineWidth: 1
    }));
    y += 0.2;

    var nSize = ctx.sizes.bodyText;
    page.ops.push(text([group.items.length + ' ' + t.questionsWord], {
      x: s.x, y: y, w: s.w, size: nSize, family: 'Nunito', style: 'italic',
      align: 'center', color: C.GREY.meta
    }));
  }

  /* Draws one question inside `area`. Returns false when even the smallest
     size does not fit, so the caller can give it a page of its own. */
  function placeQuestion(ctx, page, q, area, allowShrinkPrompt) {
    var t = ctx.t;
    var metaSize = ctx.sizes.meta;
    var metaLH = T.lineHeight(metaSize);

    var inner = { x: area.x, y: area.y + metaLH + 0.08, w: area.w, h: area.h - metaLH - 0.08 };
    var fit = fitQuestion(ctx, q, inner, ctx.sizes.prompt, ctx.sizes.or);

    if (!fit && allowShrinkPrompt) {           // last resort: shrink the heading too
      var p = ctx.sizes.prompt, o = ctx.sizes.or;
      while (!fit && p > C.MIN_FONT_PT) {
        p = Math.max(C.MIN_FONT_PT, p - 1);
        o = Math.max(C.MIN_FONT_PT, o - 1);
        fit = fitQuestion(ctx, q, inner, p, o);
      }
      if (!fit) {
        ctx.warnings.push('Question #' + q.id + ' is too long to fit a page — shorten it.');
        fit = fitQuestion(ctx, q, inner, C.MIN_FONT_PT, C.MIN_FONT_PT, true);
      }
    }
    if (!fit) return false;

    // header: category on the left, question number on the right
    page.ops.push(text([(q.cat || '').toUpperCase()], {
      x: area.x, y: area.y, w: area.w * 0.7, size: metaSize,
      family: 'Nunito', style: 'bold', align: 'left', color: C.GREY.meta
    }));
    page.ops.push(text(['#' + q.id], {
      x: area.x + area.w * 0.7, y: area.y, w: area.w * 0.3, size: metaSize,
      family: 'Nunito', style: 'bold', align: 'right', color: C.GREY.meta
    }));

    for (var i = 0; i < fit.ops.length; i++) page.ops.push(fit.ops[i]);
    return true;
  }

  /* Tries option sizes from big to small until the whole block fits. */
  function fitQuestion(ctx, q, inner, promptSize, orSize, force) {
    var t = ctx.t;
    var pad = ctx.perPage === 2 ? 0.13 : 0.17;
    var tickH = ctx.data.layout.checkboxStyle === 'none' ? 0 : (ctx.perPage === 2 ? 0.2 : 0.24);
    var gapPrompt = ctx.perPage === 2 ? 0.1 : 0.16;
    var gapOr = ctx.perPage === 2 ? 0.05 : 0.08;

    var promptLines = T.wrap(t.prompt, 'Baloo2', 'bold', promptSize, inner.w);
    var promptH = blockHeight(promptLines, promptSize);
    var orR = (orSize / 72) * 0.92;
    var orD = orR * 2;
    var innerW = inner.w - pad * 2;

    for (var size = ctx.sizes.optionMax; size >= ctx.sizes.optionMin - 0.01; size -= 0.5) {
      var aLines = T.wrap(q.a, 'Nunito', 'bold', size, innerW);
      var bLines = T.wrap(q.b, 'Nunito', 'bold', size, innerW);
      var aH = pad + blockHeight(aLines, size) + (tickH ? 0.04 + tickH : 0) + pad;
      var bH = pad + blockHeight(bLines, size) + (tickH ? 0.04 + tickH : 0) + pad;
      var total = promptH + gapPrompt + aH + gapOr + orD + gapOr + bH;
      if (total <= inner.h || (force && size <= ctx.sizes.optionMin + 0.01)) {
        return {
          ops: renderQuestion(ctx, inner, {
            promptLines: promptLines, promptSize: promptSize, promptH: promptH,
            aLines: aLines, bLines: bLines, size: size, aH: aH, bH: bH,
            orR: orR, orSize: orSize, pad: pad, tickH: tickH,
            gapPrompt: gapPrompt, gapOr: gapOr, total: total
          })
        };
      }
    }
    return null;
  }

  function renderQuestion(ctx, inner, f) {
    var ops = [];
    var t = ctx.t;
    var y = inner.y + Math.max(0, (inner.h - f.total) / 2);

    ops.push(text(f.promptLines, {
      x: inner.x, y: y, w: inner.w, size: f.promptSize,
      family: 'Baloo2', style: 'bold', align: 'center'
    }));
    y += f.promptH + f.gapPrompt;

    y = optionBox(ctx, ops, inner, y, f, f.aLines, f.aH);
    y += f.gapOr;

    var cx = inner.x + inner.w / 2, cy = y + f.orR;
    ops.push(circle({ cx: cx, cy: cy, r: f.orR, fill: 0, lineWidth: 0 }));
    var orLH = T.lineHeight(f.orSize);
    ops.push(text([t.or], {
      x: cx - f.orR, y: cy - orLH / 2, w: f.orR * 2, size: f.orSize,
      family: 'Baloo2', style: 'bold', align: 'center', color: 1
    }));
    y += f.orR * 2 + f.gapOr;

    optionBox(ctx, ops, inner, y, f, f.bLines, f.bH);
    return ops;
  }

  function optionBox(ctx, ops, inner, y, f, lines, boxH) {
    var radius = ctx.perPage === 2 ? 0.09 : 0.12;
    ops.push(rect({
      x: inner.x, y: y, w: inner.w, h: boxH,
      radius: radius, fill: C.GREY.box, stroke: 0, lineWidth: 1
    }));
    ops.push(text(lines, {
      x: inner.x + f.pad, y: y + f.pad, w: inner.w - f.pad * 2, size: f.size,
      family: 'Nunito', style: 'bold', align: 'center'
    }));
    if (f.tickH) {
      drawTicks(ctx, ops, inner, y + boxH - f.pad - f.tickH, f);
    }
    return y + boxH;
  }

  function drawTicks(ctx, ops, inner, y, f) {
    var t = ctx.t;
    var style = ctx.data.layout.checkboxStyle;
    var boxSize = Math.min(0.16, f.tickH * 0.7);
    var labelSize = ctx.sizes.meta;
    var labels = style === 'single' ? [''] : [t.p1, t.p2];
    var right = inner.x + inner.w - f.pad;
    var items = [];
    var i, label, labelW, itemW;

    for (i = 0; i < labels.length; i++) {
      label = labels[i];
      labelW = label ? T.width(label, 'Nunito', 'bold', labelSize) : 0;
      itemW = boxSize + (label ? 0.06 + labelW : 0);
      items.push({ label: label, labelW: labelW, w: itemW });
    }
    var totalW = 0;
    for (i = 0; i < items.length; i++) totalW += items[i].w;
    totalW += 0.18 * (items.length - 1);

    var x = right - totalW;
    var top = y + (f.tickH - boxSize) / 2;
    for (i = 0; i < items.length; i++) {
      ops.push(rect({
        x: x, y: top, w: boxSize, h: boxSize,
        radius: 0.02, fill: 1, stroke: 0, lineWidth: 1
      }));
      if (items[i].label) {
        ops.push(text([items[i].label], {
          x: x + boxSize + 0.06,
          y: T.capCentredTop('Nunito-Bold', labelSize, top + boxSize / 2),
          w: items[i].labelW, size: labelSize,
          family: 'Nunito', style: 'bold', align: 'left', color: C.GREY.meta
        }));
      }
      x += items[i].w + 0.18;
    }
  }

  /* --- your turn -------------------------------------------------------- */
  function composeYourTurn(ctx) {
    var t = ctx.t;
    var first = startOnOdd(ctx, 'yourturn');
    var pages = [first];
    for (var i = 1; i < 5; i++) pages.push(addPage(ctx, 'yourturn'));

    for (var p = 0; p < pages.length; p++) {
      var page = pages[p];
      var s = safeOf(ctx, page);
      var folioH = T.lineHeight(ctx.sizes.folio) + 0.08;
      var y = s.y;

      if (p === 0) {
        var tSize = ctx.sizes.sectionTitle;
        var tLines = T.wrap(t.yourTurnTitle, 'Baloo2', 'bold', tSize, s.w);
        page.ops.push(text(tLines, {
          x: s.x, y: y, w: s.w, size: tSize, family: 'Baloo2', style: 'bold', align: 'center'
        }));
        y += blockHeight(tLines, tSize) + 0.08;
        var iSize = ctx.sizes.bodyText;
        var iLines = T.wrap(t.yourTurnIntro, 'Nunito', 'italic', iSize, s.w * 0.9);
        page.ops.push(text(iLines, {
          x: s.x + s.w * 0.05, y: y, w: s.w * 0.9, size: iSize,
          family: 'Nunito', style: 'italic', align: 'center', color: C.GREY.meta
        }));
        y += blockHeight(iLines, iSize) + 0.26;
      }

      var available = s.y + s.h - folioH - y;
      var slots = 2, slotGap = 0.24;
      var slotH = (available - slotGap * (slots - 1)) / slots;
      for (var k = 0; k < slots; k++) {
        drawBlankQuestion(ctx, page, { x: s.x, y: y + k * (slotH + slotGap), w: s.w, h: slotH });
      }
    }
  }

  function drawBlankQuestion(ctx, page, area) {
    var t = ctx.t;
    var pSize = Math.max(C.MIN_FONT_PT, ctx.sizes.prompt * 0.62);
    var y = area.y;

    page.ops.push(text([t.yourTurnPrompt], {
      x: area.x, y: y, w: area.w, size: pSize, family: 'Baloo2', style: 'bold', align: 'center'
    }));
    y += T.lineHeight(pSize) + 0.12;

    var orSize = Math.max(C.MIN_FONT_PT, ctx.sizes.or * 0.6);
    var orH = T.lineHeight(orSize) + 0.16;
    var ruleSpace = area.y + area.h - y - orH;
    var perGroup = ruleSpace / 2;
    var rules = 2;
    var step = perGroup / (rules + 0.4);

    var g, r, ry;
    for (r = 0; r < rules; r++) {
      ry = y + step * (r + 1);
      page.ops.push(line({
        x1: area.x + 0.1, y1: ry, x2: area.x + area.w - 0.1, y2: ry,
        lineWidth: C.MIN_LINE_PT, color: C.GREY.rule
      }));
    }
    y += perGroup;

    page.ops.push(text([t.yourTurnOr], {
      x: area.x, y: y, w: area.w, size: orSize,
      family: 'Baloo2', style: 'bold', align: 'center', color: C.GREY.meta
    }));
    y += orH;

    for (r = 0; r < rules; r++) {
      ry = y + step * (r + 1);
      if (ry > area.y + area.h) break;
      page.ops.push(line({
        x1: area.x + 0.1, y1: ry, x2: area.x + area.w - 0.1, y2: ry,
        lineWidth: C.MIN_LINE_PT, color: C.GREY.rule
      }));
    }
  }

  /* --- behind the choices ---------------------------------------------- */
  function composeAnswers(ctx, questions, withTitle, chapterName) {
    var t = ctx.t;
    var blocks = [];
    if (withTitle) {
      blocks.push(titleBlock(ctx, t.answersTitle));
      blocks.push(paraBlock(ctx, t.answersIntro, 'italic', ctx.sizes.bodyText, 0.22));
    } else {
      blocks.push(headingBlock(ctx, t.answersTitle + ' — ' + chapterName, ctx.sizes.answerHead + 2));
    }
    for (var i = 0; i < questions.length; i++) {
      blocks.push(answerBlock(ctx, questions[i]));
    }
    flow(ctx, blocks, {
      startOdd: withTitle, kind: 'answers',
      columns: ctx.large ? 2 : 1
    });
  }

  function answerBlock(ctx, q) {
    var t = ctx.t;
    var size = ctx.sizes.answerBody;
    return {
      gapAfter: 0.14,
      keepTogether: true,
      measure: function (w) {
        var parts = answerParts(ctx, q, w, size);
        var h = 0;
        for (var i = 0; i < parts.length; i++) h += parts[i].h;
        return h;
      },
      draw: function (x, y, w) {
        var parts = answerParts(ctx, q, w, size);
        var ops = [], cy = y;
        for (var i = 0; i < parts.length; i++) {
          ops.push(text(parts[i].lines, {
            x: x, y: cy, w: w, size: size,
            family: 'Nunito', style: parts[i].style, align: 'left',
            color: parts[i].color == null ? 0 : parts[i].color
          }));
          cy += parts[i].h;
        }
        return ops;
      }
    };
  }

  function answerParts(ctx, q, w, size) {
    var t = ctx.t;
    var head = '#' + q.id + '  ' + shorten(q.a, 46) + '  ' + t.vs + '  ' + shorten(q.b, 46);
    var parts = [];
    function add(str, style, color) {
      if (!str) return;
      var lines = T.wrap(str, 'Nunito', style, size, w);
      parts.push({ lines: lines, style: style, color: color, h: blockHeight(lines, size) });
    }
    add(head, 'bold');
    if (q.why_hard) add(t.whyHard + ' ' + q.why_hard, 'normal');
    var ab = [];
    if (q.a_plus) ab.push('A: ' + q.a_plus);
    if (q.b_plus) ab.push('B: ' + q.b_plus);
    if (ab.length) add(ab.join('   '), 'normal');
    if (q.bonus) add(t.bonus + ' ' + q.bonus, 'italic', C.GREY.meta);
    return parts;
  }

  function shorten(s, max) {
    s = String(s || '');
    return s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  }

  /* --- thank you -------------------------------------------------------- */
  function composeThankYou(ctx) {
    var t = ctx.t;
    var page = startOnOdd(ctx, 'thanks');
    var s = safeOf(ctx, page);
    var y = s.y + s.h * 0.22;

    var tSize = ctx.sizes.sectionTitle + 4;
    var tLines = T.wrap(t.thanksTitle, 'Baloo2', 'bold', tSize, s.w);
    page.ops.push(text(tLines, {
      x: s.x, y: y, w: s.w, size: tSize, family: 'Baloo2', style: 'bold', align: 'center'
    }));
    y += blockHeight(tLines, tSize) + 0.3;

    var bSize = ctx.sizes.bodyText + 1;
    var bodies = [t.thanksBody, t.thanksBody2, t.thanksBody3];
    for (var i = 0; i < bodies.length; i++) {
      var lines = T.wrap(bodies[i], 'Nunito', i === 2 ? 'italic' : 'normal', bSize, s.w * 0.88);
      page.ops.push(text(lines, {
        x: s.x + s.w * 0.06, y: y, w: s.w * 0.88, size: bSize,
        family: 'Nunito', style: i === 2 ? 'italic' : 'normal', align: 'center'
      }));
      y += blockHeight(lines, bSize) + 0.24;
    }
  }

  /* --- generic block flow ---------------------------------------------- */
  function titleBlock(ctx, str) {
    var size = ctx.sizes.sectionTitle;
    return {
      gapAfter: 0.22, keepTogether: true,
      measure: function (w) { return blockHeight(T.wrap(str, 'Baloo2', 'bold', size, w), size); },
      draw: function (x, y, w) {
        return [text(T.wrap(str, 'Baloo2', 'bold', size, w), {
          x: x, y: y, w: w, size: size, family: 'Baloo2', style: 'bold', align: 'center'
        })];
      }
    };
  }

  function headingBlock(ctx, str, sizeOverride) {
    var size = sizeOverride || ctx.sizes.answerHead;
    return {
      gapAfter: 0.06, keepTogether: true, keepWithNext: true,
      measure: function (w) { return blockHeight(T.wrap(str, 'Baloo2', 'bold', size, w), size); },
      draw: function (x, y, w) {
        return [text(T.wrap(str, 'Baloo2', 'bold', size, w), {
          x: x, y: y, w: w, size: size, family: 'Baloo2', style: 'bold', align: 'left'
        })];
      }
    };
  }

  function paraBlock(ctx, str, style, size, gapAfter) {
    return {
      gapAfter: gapAfter == null ? 0.14 : gapAfter, keepTogether: false,
      measure: function (w) { return blockHeight(T.wrap(str, 'Nunito', style, size, w), size); },
      lines: function (w) { return T.wrap(str, 'Nunito', style, size, w); },
      size: size, style: style,
      draw: function (x, y, w, fromLine, toLine) {
        var all = T.wrap(str, 'Nunito', style, size, w);
        var slice = all.slice(fromLine || 0, toLine == null ? all.length : toLine);
        return [text(slice, {
          x: x, y: y, w: w, size: size, family: 'Nunito', style: style, align: 'left'
        })];
      }
    };
  }

  /* Places blocks down one or two columns, opening pages as needed.
     A block marked keepTogether never straddles a column break. */
  function flow(ctx, blocks, opts) {
    var columns = opts.columns || 1;
    var colGap = 0.3;
    var page = opts.startOdd ? startOnOdd(ctx, opts.kind) : addPage(ctx, opts.kind);
    var s = safeOf(ctx, page);
    var folioH = T.lineHeight(ctx.sizes.folio) + 0.08;
    var colW = (s.w - colGap * (columns - 1)) / columns;
    var col = 0;
    var x = s.x;
    var y = s.y;
    var bottom = s.y + s.h - folioH;

    function nextColumn() {
      col++;
      if (col >= columns) {
        page = addPage(ctx, opts.kind);
        s = safeOf(ctx, page);
        colW = (s.w - colGap * (columns - 1)) / columns;
        bottom = s.y + s.h - folioH;
        col = 0;
      }
      x = s.x + col * (colW + colGap);
      y = s.y;
    }

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var h = block.measure(colW);

      if (y + h > bottom && y > s.y) {
        if (block.keepTogether || !block.lines) { nextColumn(); }
        else {
          // Split a plain paragraph across the break, line by line.
          var lines = block.lines(colW);
          var lh = T.lineHeight(block.size);
          var canFit = Math.floor((bottom - y) / lh);
          if (canFit >= 2 && lines.length - canFit >= 1) {
            pushOps(page, block.draw(x, y, colW, 0, canFit));
            nextColumn();
            pushOps(page, block.draw(x, y, colW, canFit, lines.length));
            y += (lines.length - canFit) * lh + (block.gapAfter || 0);
            continue;
          }
          nextColumn();
        }
      }
      if (y + h > bottom && y <= s.y + 0.001 && h > bottom - s.y) {
        // Taller than a whole column: let it overflow rather than loop.
        ctx.warnings.push('A block of text is taller than a whole column and overflowed.');
      }
      pushOps(page, block.draw(x, y, colW));
      y += h + (block.gapAfter || 0);
    }
  }

  function pushOps(page, ops) {
    for (var i = 0; i < ops.length; i++) page.ops.push(ops[i]);
  }

  /* Exposed for the tests and for the PDF renderer. */
  L.text = text;
  L.rect = rect;
  L.circle = circle;
  L.line = line;
})();
