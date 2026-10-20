/*
 * preview-renderer.js — the on-screen book preview.
 *
 * Consumes exactly the same page model as the PDF exporter, so what you see is
 * what gets printed. Positions are written as calc(var(--ppi) * <inches>px),
 * which means zooming only changes one CSS variable — no re-render, no reflow
 * of the page model.
 *
 * Pages are filled in lazily as they scroll into view so a 200-page book stays
 * responsive.
 */
(function (global) {
  'use strict';

  var C = global.NCB_CONST;
  var U = global.NCB_UTILS;
  var LAYOUT = global.NCB_LAYOUT;

  var observer = null;

  /** Pages drawn immediately, before any lazy filling kicks in. */
  var EAGER_PAGES = 6;

  /** Inches -> a CSS length that tracks the zoom variable. */
  function inch(value) {
    return 'calc(var(--ppi) * ' + U.round(value, 4) + 'px)';
  }

  /** Points -> the same, converted through 72 pt per inch. */
  function points(value) {
    return inch(value / C.POINTS_PER_INCH);
  }

  function el(tag, className, styles) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (styles) for (var key in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, key)) node.style[key] = styles[key];
    }
    return node;
  }

  function box(tag, className, rect) {
    return el(tag, className, {
      left: inch(rect.x),
      top: inch(rect.y),
      width: inch(rect.w),
      height: inch(rect.h)
    });
  }

  /* ------------------------------------------------------------------ *
   * Page pieces
   * ------------------------------------------------------------------ */

  function renderHeader(page) {
    if (!page.bands.header || !page.headerText) return null;
    var node = box('div', 'pv-header', page.bands.header);
    node.style.fontSize = points(C.BOOK_LAYOUT.headerPt);
    node.textContent = page.headerText;
    return node;
  }

  function renderFooter(page) {
    if (!page.showPageNumber || !page.bands.footer) return null;
    var node = box('div', 'pv-footer', page.bands.footer);
    node.style.fontSize = points(C.BOOK_LAYOUT.footerPt);
    node.textContent = String(page.index);
    return node;
  }

  /**
   * One inline clue symbol inside front-matter text.
   *
   * The span's bottom edge sits on the text baseline, so lifting it by
   * (baselineRatio − diameterRatio/2) puts its centre exactly where the PDF
   * draws the circle.
   */
  function renderInlinePeg(token, sizePt) {
    var L = C.BOOK_LAYOUT;
    var sizeIn = sizePt / C.POINTS_PER_INCH;
    var diameterIn = sizeIn * L.inlinePegDiameterRatio;
    var liftIn = sizeIn * L.inlinePegBaselineRatio - diameterIn / 2;

    return el('span', 'pv-inline-peg' + (token.filled ? ' is-filled' : ''), {
      width: inch(diameterIn),
      height: inch(diameterIn),
      marginBottom: inch(liftIn),
      marginRight: inch(Math.max(0, token.widthIn - diameterIn)),
      borderWidth: inch(diameterIn * L.pegStrokeRatio)
    });
  }

  function renderTextPage(page) {
    var frag = document.createDocumentFragment();
    var body = page.bands.body;
    var centered = page.textAlign === 'center';
    var y = body.y;

    for (var i = 0; i < page.lines.length; i++) {
      var line = page.lines[i];
      if (line.type === 'blank') { y += line.heightIn; continue; }

      var lineX = centered ? body.x + (body.w - line.widthIn) / 2 : body.x;
      var node = el('div', 'pv-line' + (line.bold ? ' is-heading' : ''), {
        left: inch(lineX),
        top: inch(y),
        width: inch(line.widthIn),
        height: inch(line.heightIn),
        fontSize: points(line.sizePt)
      });

      for (var t = 0; t < line.tokens.length; t++) {
        var token = line.tokens[t];
        if (token.type === 'peg') {
          node.appendChild(renderInlinePeg(token, line.sizePt));
        } else {
          var span = document.createElement('span');
          span.textContent = token.text;
          node.appendChild(span);
        }
      }
      frag.appendChild(node);
      y += line.heightIn;
    }
    return frag;
  }

  function renderPuzzleCard(cardEntry, metrics) {
    var L = C.BOOK_LAYOUT;
    var puzzle = cardEntry.puzzle;
    var rect = cardEntry.box;
    var cell = metrics.cellIn;
    var codeLength = puzzle.settings.codeLength;

    var card = box('div', 'pv-card', rect);

    var title = el('div', 'pv-card-title', {
      left: inch(L.cardPadXIn),
      top: '0',
      width: inch(cell * codeLength),
      textAlign: 'center',
      fontSize: points(L.cardTitlePt),
      lineHeight: inch(metrics.titleLineIn)
    });
    title.textContent = 'Puzzle ' + U.padNumber(puzzle.id, 3);
    card.appendChild(title);

    var grid = el('div', 'pv-grid', {
      left: inch(L.cardPadXIn),
      top: inch(metrics.titleBlockIn),
      width: inch(cell * codeLength),
      height: inch(cell * puzzle.guesses.length),
      borderWidth: inch(metrics.gridLineIn),
      gridTemplateColumns: 'repeat(' + codeLength + ', ' + inch(cell) + ')',
      gridTemplateRows: 'repeat(' + puzzle.guesses.length + ', ' + inch(cell) + ')',
      fontSize: points(metrics.digitPt)
    });

    var ruleWidth = inch(metrics.gridLineIn);
    for (var r = 0; r < puzzle.guesses.length; r++) {
      for (var c = 0; c < codeLength; c++) {
        // Only interior rules are drawn on cells; the outer rule is the grid's border.
        var cellNode = el('div', 'pv-cell', {
          borderRightWidth: c === codeLength - 1 ? '0' : ruleWidth,
          borderBottomWidth: r === puzzle.guesses.length - 1 ? '0' : ruleWidth
        });
        cellNode.textContent = String(puzzle.guesses[r][c]);
        grid.appendChild(cellNode);
      }
    }
    card.appendChild(grid);

    for (var row = 0; row < puzzle.feedback.length; row++) {
      var feedback = puzzle.feedback[row];
      var pegRow = el('div', 'pv-pegs', {
        left: inch(L.cardPadXIn + cell * codeLength + metrics.pegLeadGapIn),
        top: inch(metrics.titleBlockIn + cell * row),
        height: inch(cell)
      });
      var total = feedback.correctPlace + feedback.correctNumberWrongPlace;
      for (var p = 0; p < total; p++) {
        pegRow.appendChild(el('span', 'pv-peg' + (p < feedback.correctPlace ? ' is-filled' : ''), {
          width: inch(metrics.pegDiameterIn),
          height: inch(metrics.pegDiameterIn),
          marginRight: inch(metrics.pegPitchIn - metrics.pegDiameterIn),
          borderWidth: inch(metrics.pegDiameterIn * C.BOOK_LAYOUT.pegStrokeRatio)
        }));
      }
      card.appendChild(pegRow);
    }

    return card;
  }

  function renderPuzzlePage(page) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < page.cards.length; i++) {
      frag.appendChild(renderPuzzleCard(page.cards[i], page.card));
    }
    return frag;
  }

  function renderAnswerPage(page) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < page.answers.length; i++) {
      var a = page.answers[i];
      var node = el('div', 'pv-answer', {
        left: inch(a.x),
        top: inch(a.y),
        width: inch(page.grid.colWidthIn),
        height: inch(page.grid.lineHeightIn),
        fontSize: points(a.sizePt)
      });
      // The label occupies the same measured offset the PDF uses for the code.
      var label = el('span', 'pv-answer-label', { width: inch(page.grid.codeOffsetIn) });
      label.textContent = a.entry.label;
      var code = el('span', 'pv-answer-code');
      code.textContent = a.entry.code;
      node.appendChild(label);
      node.appendChild(code);
      frag.appendChild(node);
    }
    return frag;
  }

  /** Fill in a page shell that has scrolled into view. */
  function fillPage(pageNode, page, options) {
    if (pageNode.dataset.filled === '1') return;
    pageNode.dataset.filled = '1';

    var sheet = pageNode.querySelector('.pv-sheet');
    sheet.innerHTML = '';

    if (options.showGuides) {
      var bleedIn = page.box.trimX0 || page.box.trimY0;
      if (bleedIn) {
        sheet.appendChild(box('div', 'pv-guide pv-guide-trim', {
          x: page.box.trimX0, y: page.box.trimY0,
          w: options.rules.trimWidthIn, h: options.rules.trimHeightIn
        }));
      }
      sheet.appendChild(box('div', 'pv-guide pv-guide-safe', page.box));
      sheet.appendChild(box('div', 'pv-guide pv-guide-gutter',
        LAYOUT.getGutterRect(options.rules, page.box)));
    }

    var header = renderHeader(page);
    if (header) sheet.appendChild(header);

    switch (page.kind) {
      case 'copyright':
      case 'instructions':
        sheet.appendChild(renderTextPage(page));
        break;
      case 'puzzles':
        sheet.appendChild(renderPuzzlePage(page));
        break;
      case 'answers':
        sheet.appendChild(renderAnswerPage(page));
        break;
      default:
        break;
    }

    var footer = renderFooter(page);
    if (footer) sheet.appendChild(footer);
  }

  var KIND_LABELS = {
    copyright: 'Copyright',
    instructions: 'How to play',
    puzzles: 'Puzzles',
    answers: 'Answer key',
    blank: 'Blank (even-page pad)'
  };

  /**
   * Render the whole preview.
   *
   * @param {HTMLElement} container
   * @param {object} built  result of NCB_BOOK.buildBook
   * @param {object} options { showGuides }
   */
  function renderBookPreview(container, built, options) {
    options = options || {};
    options.rules = built.rules;

    if (observer) { observer.disconnect(); observer = null; }
    container.innerHTML = '';

    var rules = built.rules;
    var frag = document.createDocumentFragment();
    var nodes = [];

    for (var i = 0; i < built.pages.length; i++) {
      var page = built.pages[i];

      var wrap = el('div', 'pv-page-wrap');
      var sheetWrap = el('div', 'pv-page', {
        width: inch(rules.pageWidthIn),
        height: inch(rules.pageHeightIn)
      });
      sheetWrap.appendChild(el('div', 'pv-sheet'));
      wrap.appendChild(sheetWrap);

      var caption = el('div', 'pv-caption');
      caption.textContent = 'Page ' + page.index + ' · ' + (KIND_LABELS[page.kind] || page.kind) +
        ' · ' + (page.box.isOdd ? 'right-hand' : 'left-hand') + ', gutter ' + page.box.gutterSide;
      wrap.appendChild(caption);

      sheetWrap.dataset.pageIndex = String(i);
      frag.appendChild(wrap);
      nodes.push(sheetWrap);
    }

    container.appendChild(frag);

    // The first pages are drawn straight away so the preview is never blank,
    // even if lazy filling is throttled or unavailable.
    for (var eager = 0; eager < Math.min(EAGER_PAGES, nodes.length); eager++) {
      fillPage(nodes[eager], built.pages[eager], options);
    }

    if (typeof IntersectionObserver === 'function') {
      // Pages scroll inside the preview pane, so that pane is the root the
      // observer must measure against — not the document viewport.
      observer = new IntersectionObserver(function (entries) {
        for (var e = 0; e < entries.length; e++) {
          if (!entries[e].isIntersecting) continue;
          var node = entries[e].target;
          fillPage(node, built.pages[Number(node.dataset.pageIndex)], options);
        }
      }, { root: options.root || null, rootMargin: '600px 0px' });

      for (var n = 0; n < nodes.length; n++) observer.observe(nodes[n]);
    } else {
      for (var f = 0; f < nodes.length; f++) fillPage(nodes[f], built.pages[f], options);
    }

    return {
      pageCount: built.pages.length,
      /** Draw every remaining page — used before measuring or debugging. */
      fillAll: function () {
        for (var i = 0; i < nodes.length; i++) fillPage(nodes[i], built.pages[i], options);
      }
    };
  }

  global.NCB_PREVIEW = {
    renderBookPreview: renderBookPreview,
    inch: inch,
    points: points
  };
})(window);
