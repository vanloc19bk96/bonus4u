/*
 * utils.js — small shared helpers: units, formatting, text measurement.
 *
 * The text measurer wraps a single hidden jsPDF instance loaded with the same
 * embedded font the export uses, so the book builder, the HTML preview and the
 * PDF all break lines at exactly the same places.
 */
(function (global) {
  'use strict';

  var C = global.NCB_CONST;

  function inToPt(inches) { return inches * C.POINTS_PER_INCH; }
  function ptToIn(points) { return points / C.POINTS_PER_INCH; }

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  /** Round to a fixed number of decimals without float dust. */
  function round(value, decimals) {
    var f = Math.pow(10, decimals === undefined ? 4 : decimals);
    return Math.round(value * f) / f;
  }

  /** 7 -> "007" */
  function padNumber(value, width) {
    var s = String(value);
    while (s.length < width) s = '0' + s;
    return s;
  }

  /** 0.5 -> "0.50 in" */
  function formatInches(value) {
    return value.toFixed(2) + ' in';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Replace {YEAR}, {AUTHOR}, {TITLE}, {SUBTITLE} in editable front matter. */
  function applyPlaceholders(text, meta) {
    var author = (meta && meta.author ? meta.author : '').trim();
    return String(text === undefined || text === null ? '' : text)
      .replace(/\{YEAR\}/g, String(new Date().getFullYear()))
      .replace(/\{AUTHOR_OR_PUBLISHER\}/g, author || 'the author')
      .replace(/\{AUTHOR\}/g, author || 'the author')
      .replace(/\{TITLE\}/g, (meta && meta.title ? meta.title : '').trim())
      .replace(/\{SUBTITLE\}/g, (meta && meta.subtitle ? meta.subtitle : '').trim());
  }

  /** Yield to the browser so long generation loops keep the UI alive. */
  function nextFrame() {
    return new Promise(function (resolve) {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { resolve(); });
      else setTimeout(resolve, 0);
    });
  }

  /* ---------------------------------------------------------------- *
   * Text measurement
   * ---------------------------------------------------------------- */

  var FONT_REGULAR = 'NotoSans';
  var FONT_BOLD = 'NotoSans';

  var measureDoc = null;
  var fontsReady = false;

  /**
   * Register the embedded TTFs on a jsPDF document.
   *
   * jsPDF's built-in Helvetica/Times/Courier are PDF "standard 14" fonts: they
   * are referenced but never embedded, which fails KDP preflight. Adding a real
   * TTF through the virtual file system makes jsPDF subset and embed it.
   */
  function registerFonts(doc) {
    if (!global.NOTO_SANS_BASE64 || !global.NOTO_SANS_BOLD_BASE64) {
      throw new Error('Embedded font data is missing. Check vendor/font-notosans.js.');
    }
    doc.addFileToVFS('NotoSans-Regular.ttf', global.NOTO_SANS_BASE64);
    doc.addFont('NotoSans-Regular.ttf', FONT_REGULAR, 'normal');
    doc.addFileToVFS('NotoSans-Bold.ttf', global.NOTO_SANS_BOLD_BASE64);
    doc.addFont('NotoSans-Bold.ttf', FONT_BOLD, 'bold');
    return doc;
  }

  function createPdfDoc(widthIn, heightIn) {
    var jsPDF = global.jspdf && global.jspdf.jsPDF;
    if (!jsPDF) throw new Error('jsPDF is not loaded. Check vendor/jspdf.umd.min.js.');
    var doc = new jsPDF({
      unit: 'pt',
      format: [inToPt(widthIn), inToPt(heightIn)],
      orientation: widthIn > heightIn ? 'landscape' : 'portrait',
      compress: true
    });
    registerFonts(doc);
    return doc;
  }

  /** Lazily build the hidden measuring document. */
  function getMeasureDoc() {
    if (!measureDoc) {
      measureDoc = createPdfDoc(8.5, 11);
      fontsReady = true;
    }
    return measureDoc;
  }

  function areFontsReady() { return fontsReady; }

  /** Width of a string in inches at a given point size. */
  function textWidthIn(text, sizePt, bold) {
    var doc = getMeasureDoc();
    doc.setFont(bold ? FONT_BOLD : FONT_REGULAR, bold ? 'bold' : 'normal');
    doc.setFontSize(sizePt);
    return ptToIn(doc.getTextWidth(String(text)));
  }

  /**
   * The two clue symbols are drawn as real vector circles rather than relying on
   * Unicode glyph coverage, so measurement substitutes an equivalent advance.
   */
  var FILLED_PEG = '●';
  var HOLLOW_PEG = '○';

  function isPegChar(ch) { return ch === FILLED_PEG || ch === HOLLOW_PEG; }

  /** Advance width, in inches, reserved for one inline clue symbol. */
  function pegAdvanceIn(sizePt) {
    return textWidthIn('O', sizePt, false) * 1.15;
  }

  /**
   * Split a paragraph into tokens of text and inline peg symbols, keeping the
   * measured width of each so preview and PDF lay them out identically.
   */
  function tokenizeLine(line, sizePt, bold) {
    var tokens = [];
    var buffer = '';
    function flush() {
      if (buffer) {
        tokens.push({ type: 'text', text: buffer, widthIn: textWidthIn(buffer, sizePt, bold) });
        buffer = '';
      }
    }
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (isPegChar(ch)) {
        flush();
        tokens.push({ type: 'peg', filled: ch === FILLED_PEG, widthIn: pegAdvanceIn(sizePt) });
      } else {
        buffer += ch;
      }
    }
    flush();
    return tokens;
  }

  function tokensWidth(tokens) {
    var total = 0;
    for (var i = 0; i < tokens.length; i++) total += tokens[i].widthIn;
    return total;
  }

  /**
   * Wrap a block of text to `maxWidthIn`, honouring existing newlines and
   * inline peg symbols. Returns an array of lines, each an array of tokens.
   */
  function wrapTextBlock(text, maxWidthIn, sizePt, bold) {
    var lines = [];
    var paragraphs = String(text === undefined || text === null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    var spaceIn = textWidthIn(' ', sizePt, bold);

    for (var p = 0; p < paragraphs.length; p++) {
      var paragraph = paragraphs[p];
      if (paragraph.trim() === '') {
        lines.push([]); // blank line, preserved as vertical space
        continue;
      }
      var words = paragraph.split(/\s+/).filter(function (w) { return w.length > 0; });
      var current = [];
      var currentWidth = 0;

      for (var w = 0; w < words.length; w++) {
        var wordTokens = tokenizeLine(words[w], sizePt, bold);
        var wordWidth = tokensWidth(wordTokens);
        var addWidth = current.length ? spaceIn + wordWidth : wordWidth;

        if (current.length && currentWidth + addWidth > maxWidthIn) {
          lines.push(current);
          current = wordTokens.slice();
          currentWidth = wordWidth;
        } else {
          if (current.length) {
            current.push({ type: 'text', text: ' ', widthIn: spaceIn });
            currentWidth += spaceIn;
          }
          current = current.concat(wordTokens);
          currentWidth += wordWidth;
        }
      }
      if (current.length) lines.push(current);
    }

    // Trailing blank lines carry no meaning on a printed page.
    while (lines.length && lines[lines.length - 1].length === 0) lines.pop();
    return lines;
  }

  /** Flatten a token line back to plain text (peg symbols included). */
  function lineToPlainText(tokens) {
    var out = '';
    for (var i = 0; i < tokens.length; i++) {
      out += tokens[i].type === 'peg' ? (tokens[i].filled ? FILLED_PEG : HOLLOW_PEG) : tokens[i].text;
    }
    return out;
  }

  function download(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  global.NCB_UTILS = {
    FONT_REGULAR: FONT_REGULAR,
    FONT_BOLD: FONT_BOLD,
    FILLED_PEG: FILLED_PEG,
    HOLLOW_PEG: HOLLOW_PEG,
    inToPt: inToPt,
    ptToIn: ptToIn,
    clamp: clamp,
    round: round,
    padNumber: padNumber,
    formatInches: formatInches,
    escapeHtml: escapeHtml,
    applyPlaceholders: applyPlaceholders,
    nextFrame: nextFrame,
    registerFonts: registerFonts,
    createPdfDoc: createPdfDoc,
    areFontsReady: areFontsReady,
    textWidthIn: textWidthIn,
    pegAdvanceIn: pegAdvanceIn,
    tokenizeLine: tokenizeLine,
    tokensWidth: tokensWidth,
    wrapTextBlock: wrapTextBlock,
    lineToPlainText: lineToPlainText,
    download: download
  };
})(window);
