/*
 * text.js: measures and wraps text with the bundled fonts' own advance widths.
 * Both renderers draw without kerning or ligatures, so these numbers are exact for the
 * SVG preview and for the PDF. Sizes in points, results in inches.
 */
(function () {
  'use strict';
  window.KS = window.KS || {};

  var M = KS.FONT_METRICS;
  var FACES = ['serif', 'serifBold', 'sans', 'sansBold'];

  // Typographic replacements for characters the fonts may not carry, then anything still
  // unknown is dropped, so neither renderer ever falls back to a missing glyph.
  var REPLACE = { '\t': ' ', '­': '', ' ': ' ', ' ': ' ', '−': '-', '⁃': '-' };

  function supported(code) {
    for (var i = 0; i < FACES.length; i++) if (M[FACES[i]].widths[code] === undefined) return false;
    return true;
  }

  // Cleans user text: known replacements, collapsed spaces, unsupported characters removed.
  // Line breaks are kept only when `multiline` is set.
  function clean(str, multiline) {
    str = String(str == null ? '' : str);
    if (str.normalize) str = str.normalize('NFC');
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (REPLACE[ch] !== undefined) ch = REPLACE[ch];
      if (ch === '\r') continue;
      if (ch === '\n') { out += multiline ? '\n' : ' '; continue; }
      if (ch.length && !supported(ch.charCodeAt(0))) continue;
      out += ch;
    }
    out = out.replace(/[  ]+/g, function (m) { return m.indexOf(' ') >= 0 ? ' ' : ' '; });
    return multiline
      ? out.split('\n').map(function (l) { return l.trim(); }).join('\n').replace(/\n{3,}/g, '\n\n').trim()
      : out.trim();
  }

  function width(str, face, size) {
    var m = M[face], w = 0;
    for (var i = 0; i < str.length; i++) {
      var adv = m.widths[str.charCodeAt(i)];
      w += adv === undefined ? m.widths[0x3F] : adv;
    }
    return w / m.upm * size / 72;
  }

  function ascent(face, size) { return M[face].ascent / M[face].upm * size / 72; }
  function descent(face, size) { return M[face].descent / M[face].upm * size / 72; }
  function capHeight(face, size) { return M[face].capHeight / M[face].upm * size / 72; }

  // Greedy word wrap. Paragraphs split on '\n'; an empty paragraph gives an empty line.
  // A single word wider than the line is broken between characters.
  function wrap(str, face, size, maxWidth) {
    var lines = [];
    String(str).split('\n').forEach(function (para) {
      var words = para.split(' ').filter(function (w) { return w.length; });
      if (!words.length) { lines.push(''); return; }
      var line = '';
      words.forEach(function (word) {
        var trial = line ? line + ' ' + word : word;
        if (width(trial, face, size) <= maxWidth) { line = trial; return; }
        if (line) lines.push(line);
        line = word;
        while (width(line, face, size) > maxWidth && line.length > 1) {
          var cut = line.length - 1;
          while (cut > 1 && width(line.slice(0, cut), face, size) > maxWidth) cut--;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      });
      lines.push(line);
    });
    return lines;
  }

  // Largest size from `size` down to `minSize` (in `step`s) at which the text wraps into
  // at most `maxLines`. Reports whether it fits at all.
  function fit(str, face, size, minSize, maxWidth, maxLines, step) {
    step = step || 1;
    for (var s = size; s >= minSize - 1e-9; s -= step) {
      var lines = wrap(str, face, s, maxWidth);
      if (lines.length <= maxLines) return { size: s, lines: lines, fits: true };
    }
    return { size: minSize, lines: wrap(str, face, minSize, maxWidth), fits: false };
  }

  // Shortens a single line with an ellipsis so it fits `maxWidth`.
  function truncate(str, face, size, maxWidth) {
    if (width(str, face, size) <= maxWidth) return str;
    var s = str;
    while (s.length > 1 && width(s + '…', face, size) > maxWidth) s = s.slice(0, -1);
    return s.replace(/\s+$/, '') + '…';
  }

  KS.Text = {
    FACES: FACES,
    clean: clean,
    width: width,
    ascent: ascent,
    descent: descent,
    capHeight: capHeight,
    wrap: wrap,
    fit: fit,
    truncate: truncate
  };
})();
