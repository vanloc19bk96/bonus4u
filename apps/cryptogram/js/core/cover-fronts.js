/*
 * The fronts of the cover templates. Each layout draws into the front's safe box
 * f = { x, y, w, h, cx } (every word stays inside it) and may paint shapes out to the bleed:
 * f.X0..f.X1 across, 0..f.H down. A layout gets the sheet, f, the cover's words
 * w = { title, sub, author, count, large, kid, code }, the palette, the template's options, a scale k
 * (the cover shrinks k until res.fits) and a seeded random. It returns { fits, avoid, confetti }.
 *
 * The coded phrase on a cover is decoration and never comes from the book, so no cover gives a
 * puzzle away.
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};
  var K = CX.cover.kit;

  var PHRASES = ['CRACK THE CODE', 'SOLVE THE SECRET', 'READ BETWEEN THE LINES', 'EVERY LETTER COUNTS', 'THE ANSWER IS HIDDEN', 'KEEP CALM AND DECODE'];
  var KEY = { A: 'Q', B: 'X', C: 'M', D: 'Z', E: 'R', F: 'J', G: 'W', H: 'B', I: 'T', J: 'K', K: 'P', L: 'D', M: 'Y', N: 'H', O: 'V', P: 'L', Q: 'F', R: 'N', S: 'G', T: 'E', U: 'O', V: 'A', W: 'C', X: 'U', Y: 'I', Z: 'S' };

  // The phrase for this cover: the first one the book does not use, then the next ones for variety.
  function phrase(w, n) {
    var used = {};
    if (w.project) Object.keys(w.project.puzzles).forEach(function (k) { used[CX.engine.sameKey(w.project.puzzles[k].text)] = 1; });
    var free = PHRASES.filter(function (p) { return !used[CX.engine.sameKey(p)]; });
    return (free.length ? free : PHRASES)[(n || 0) % (free.length || PHRASES.length)];
  }
  function codeOf(ch, num) { var c = KEY[ch]; return num ? String(CX.engine.ABC.indexOf(c) + 1) : c; }

  function title(sh, f, w, pal, k, top, o) {
    o = o || {};
    return K.textLines(sh, w.title, o.x == null ? f.x : o.x, top, o.w || f.w, Object.assign({ font: 'sansBold', lines: 4, color: pal.title, fill: 1.2, lead: 0.12 }, o, { max: (o.max || f.w * 0.14) * k }));
  }

  /*
   * A coded phrase as the puzzles print it: a line per letter with the code under it, some letters
   * already solved above their lines. Rows break between words. Returns the bottom.
   * o: { ink (lines and code), solved (color of the solved letters), max (cell size cap), rows, solve (how many letters shown) }
   */
  function coded(sh, x, y, w, str, o) {
    var words = str.split(' '), num = o.num, rows = o.rows || 2;
    var lettersW = function (s) { return Math.max(1, s.length); };
    // the size at which the words fit in rows
    function layout(cs) {
      var cw = num ? cs * 1.5 : cs * 1.18, gap = cw * 0.7, out = [], cur = [], curW = 0;
      words.forEach(function (wd) {
        var ww = lettersW(wd) * cw, add = (cur.length ? gap : 0) + ww;
        if (cur.length && curW + add > w) { out.push({ words: cur, w: curW }); cur = [wd]; curW = ww; } else { cur.push(wd); curW += add; }
      });
      if (cur.length) out.push({ words: cur, w: curW });
      return { rows: out, cw: cw, gap: gap, cs: cs };
    }
    var cs = o.max || 40, lay = layout(cs);
    while (cs > 8 && (lay.rows.length > rows || lay.rows.some(function (r) { return r.w > w; }))) { cs -= 1; lay = layout(cs); }
    var rowH = cs * 2.75, solvedSet = {}, letters = str.replace(/[^A-Z]/g, '').split('');
    // the most used letters are the solved ones
    var count = {};
    letters.forEach(function (c) { count[c] = (count[c] || 0) + 1; });
    Object.keys(count).sort(function (a, b) { return count[b] - count[a] || (a < b ? -1 : 1); }).slice(0, o.solve == null ? 3 : o.solve).forEach(function (c) { solvedSet[c] = 1; });
    lay.rows.forEach(function (r, ri) {
      var cx = x + (w - r.w) / 2, top = y + ri * rowH;
      r.words.forEach(function (wd, wi) {
        if (wi) cx += lay.gap;
        wd.split('').forEach(function (ch) {
          var lineY = top + cs * 1.35;
          sh.line(cx + lay.cw * 0.1, lineY, cx + lay.cw * 0.9, lineY, o.ink, Math.max(1, cs * 0.06));
          var code = codeOf(ch, num), size = num ? cs * 0.72 : cs * 0.82;
          sh.text(code, cx + lay.cw / 2, lineY + cs * 0.3 + K.capH('sansBold') * size, size, 'sansBold', o.ink, { align: 'center' });
          if (solvedSet[ch]) sh.text(ch, cx + lay.cw / 2, lineY - cs * 0.2, cs, 'sansBold', o.solved, { align: 'center' });
          cx += lay.cw;
        });
      });
    });
    return y + lay.rows.length * rowH - cs * 0.4;
  }

  // Moves what was drawn since item start down into the free space above bottom (part of it).
  function settle(sh, start, end, bottom, part) {
    var dy = Math.max(0, (bottom - end) * part);
    if (dy) sh.shift(start, 0, dy);
  }

  var L = {};

  // Title on top, then a card with a coded phrase half solved (the classic look of the niche).
  L.cipher = function (sh, f, w, pal, o, k) {
    var bottom = K.flow(sh, f, w, { kind: o.sub || 'plain', fill: pal.a1, color: o.sub ? K.contrastOn(pal.a1) : pal.ink, font: 'sans' }, { color: pal.ink });
    var y = title(sh, f, w, pal, k, f.y + f.h * 0.02, { upper: !!o.upper });
    var start = sh.items.length, top = y + f.h * 0.05, pad = f.w * 0.07;
    var card = { x: f.x, y: top, w: f.w };
    var inner = K.measure(sh, function () { return coded(sh, card.x + pad, top + pad, card.w - pad * 2, phrase(w), { ink: pal.cardInk, solved: pal.a3, max: f.w * 0.075 * k, rows: 2, num: w.num }); });
    var ch = inner - top + pad;
    sh.rrect(card.x, top, card.w, ch, f.w * 0.035, pal.card);
    coded(sh, card.x + pad, top + pad, card.w - pad * 2, phrase(w), { ink: pal.cardInk, solved: pal.a3, max: f.w * 0.075 * k, rows: 2, num: w.num });
    var end = top + ch;
    settle(sh, start, end, bottom - f.h * 0.03, 0.5);
    return { fits: end <= bottom - f.h * 0.02, confetti: null };
  };

  // Title, then the cipher key: plain letters on top, their codes on tiles under them.
  L.key = function (sh, f, w, pal, o, k) {
    var bottom = K.flow(sh, f, w, { kind: 'box', fill: pal.a1, color: K.contrastOn(pal.a1) }, { color: pal.ink });
    var y = title(sh, f, w, pal, k, f.y + f.h * 0.02, { upper: !!o.upper });
    var start = sh.items.length, letters = 'ABCDEFG'.split(''), n = letters.length, gap = f.w * 0.018, tw = (f.w - gap * (n - 1)) / n;
    var th = tw * 1.05 * k, top = y + f.h * 0.06;
    letters.forEach(function (c, i) {
      var x = f.x + i * (tw + gap), ls = tw * 0.5;
      sh.rrect(x, top, tw, th, tw * 0.14, pal.card);
      sh.text(c, x + tw / 2, top + th / 2 + K.capH('sansBold') * ls / 2, ls, 'sansBold', pal.cardInk, { align: 'center' });
      sh.rrect(x, top + th + gap * 2, tw, th, tw * 0.14, i % 3 === 1 ? pal.a3 : pal.a1);
      var cc = codeOf(c, w.num), cs = w.num ? tw * 0.42 : tw * 0.5, ink = K.contrastOn(i % 3 === 1 ? pal.a3 : pal.a1);
      sh.text(cc, x + tw / 2, top + th * 1.5 + gap * 2 + K.capH('sansBold') * cs / 2, cs, 'sansBold', ink, { align: 'center' });
    });
    var end = coded(sh, f.x, top + th * 2 + gap * 2 + f.h * 0.045, f.w, phrase(w, 1), { ink: pal.ink, solved: K.visible(pal.bg, pal.a3, pal.a1, pal.title), max: f.w * 0.06 * k, rows: 1, num: w.num, solve: 2 });
    settle(sh, start, end, bottom - f.h * 0.03, 0.45);
    return { fits: end <= bottom - f.h * 0.02, confetti: null };
  };

  // A huge number of puzzles, the word CRYPTOGRAMS, the title and a coded strip.
  L.count = function (sh, f, w, pal, o, k) {
    var bottom = K.flow(sh, f, w, { kind: 'plain', color: pal.ink, font: 'sans' }, { color: pal.ink });
    var start = sh.items.length, n = String(w.count), ns = K.fitLine(n, 'sansBold', f.w * 0.7, f.h * 0.26 * k), y = f.y + f.h * 0.02 + K.capH('sansBold') * ns;
    sh.text(n, f.cx, y, ns, 'sansBold', pal.a1 === pal.bg ? pal.title : K.visible(pal.bg, pal.a1, pal.title), { align: 'center' });
    var word = w.large ? 'LARGE PRINT CRYPTOGRAMS' : 'CRYPTOGRAMS', ps = Math.min(f.w * 0.09, ns * 0.22);
    y += ps * 1.6;
    sh.text(word, f.cx, y, K.fitLine(word, 'sansBold', f.w * 0.9, ps, 0.14), 'sansBold', pal.ink, { align: 'center', ls: ps * 0.14 });
    var cy = coded(sh, f.x + f.w * 0.05, y + f.h * 0.035, f.w * 0.9, phrase(w), { ink: pal.ink, solved: K.visible(pal.bg, pal.a3, pal.a1, pal.title), max: f.w * 0.068 * k, rows: 1, num: w.num, solve: 3 });
    var end = title(sh, f, w, pal, k, cy + f.h * 0.05, { max: f.w * 0.12 });
    settle(sh, start, end, bottom - f.h * 0.03, 0.35);
    return { fits: end <= bottom - f.h * 0.02, confetti: null };
  };

  // Calm: a serif title, a small coded line, a thin frame.
  L.quiet = function (sh, f, w, pal, o, k) {
    sh.frame(f.x - f.w * 0.02, f.y - f.w * 0.02, f.w * 1.04, f.h + f.w * 0.04, pal.title, 1.2);
    var inner = { x: f.x + f.w * 0.06, y: f.y + f.h * 0.04, w: f.w * 0.88, h: f.h * 0.92, cx: f.cx, X0: f.X0, X1: f.X1, H: f.H, B: f.B };
    var bottom = K.flow(sh, inner, w, { kind: 'line', color: pal.ink, font: 'serif' }, { color: pal.ink, font: 'serif', lsK: 0.08, upper: true });
    var start = sh.items.length, y = title(sh, inner, w, pal, k, inner.y + inner.h * 0.03, { font: 'serifBold', max: inner.w * 0.13, fill: 1 });
    var end = coded(sh, inner.x + inner.w * 0.08, y + inner.h * 0.08, inner.w * 0.84, phrase(w), { ink: pal.ink, solved: K.visible(pal.bg, pal.a1, pal.a3, pal.title), max: inner.w * 0.07 * k, rows: 2, num: w.num, solve: 2 });
    settle(sh, start, end, bottom - inner.h * 0.03, 0.35);
    return { fits: end <= bottom - inner.h * 0.03, confetti: null };
  };

  // Bands of coded letters across the cover behind a big title card.
  L.bands = function (sh, f, w, pal, o, k) {
    var bh = f.H / 5, cols = [pal.a1, pal.a2, pal.a3, pal.a2, pal.a1];
    cols.forEach(function (c, i) { sh.rect(f.X0, i * bh, f.X1 - f.X0, bh + 0.5, c); });
    // code letters in the top and bottom bands, clear of the card
    [0, 4].forEach(function (i) {
      var str = PHRASES[i === 0 ? 3 : 1].split('').map(function (c) { return c === ' ' ? ' ' : codeOf(c, w.num); }).join(w.num ? ' ' : '  ');
      var s = K.fitLine(str, 'sansBold', f.w, bh * 0.32);
      sh.text(str, f.cx, i * bh + bh * 0.5 + s * 0.35, s, 'sansBold', K.mix(cols[i], '#1B1B3A', 0.45), { align: 'center' });
    });
    var cw = f.w, ch = f.h * 0.54, cy = f.y + f.h * 0.23;
    sh.rrect(f.x, cy, cw, ch, f.w * 0.04, pal.card);
    var inner = { x: f.x + cw * 0.07, y: cy + ch * 0.07, w: cw * 0.86, h: ch * 0.86, cx: f.cx, X0: f.x, X1: f.x + cw, H: f.H, B: f.B };
    var bottom = K.flow(sh, inner, w, { kind: 'plain', color: pal.cardInk, font: 'sans' }, { color: pal.cardInk });
    var end = title(sh, inner, w, Object.assign({}, pal, { title: pal.cardInk }), k, inner.y, { max: inner.w * 0.16 });
    return { fits: end <= bottom - inner.h * 0.03, confetti: null };
  };

  L.phrase = phrase;
  CX.coverFronts = L;
})(typeof window !== 'undefined' ? window : globalThis);
