/*
 * layout.js: the one layout engine. Turns settings + puzzles into pages made of primitive
 * draw commands. preview.js (SVG) and pdf.js (jsPDF) both render these same commands, so
 * the preview is exactly what gets printed.
 *
 * Units: positions and lengths in inches (origin top-left of the PDF page, y down);
 * font sizes and line weights in points. Colors are gray levels 0 (black) .. 1 (white).
 *
 * Commands:
 *   { t: 'rect', x, y, w, h, fill }
 *   { t: 'line', x1, y1, x2, y2, w, gray, cap: 'butt' | 'square' }
 *   { t: 'text', x, y, text, size, bold, gray, align: 'left' | 'center' | 'right' }  (y = baseline)
 */
(function () {
  'use strict';
  window.SS = window.SS || {};
  var KDP = SS.KDP;

  // ------------------------------------------------------------------ style constants
  var LINE = { thin: 0.75, box: 2, outline: 2.5 };
  var DIGIT_RATIO = 0.6;       // digit size = 0.6 x cell height
  var MIN_TWO_UP_PT = 9;       // 2 puzzles per page only if givens stay >= 9 pt
  var GAP = 0.3;               // between stacked grids
  var FOOTER_PT = 9;
  var SHADE = 0.86;            // shared-box fill
  var FILLED_GRAY = 0.35;      // solution digits that were not givens
  var LEVELS = ['easy', 'medium', 'hard', 'expert'];
  var LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert', mixed: 'Mixed' };
  // Candidate [cols, rows] per solutions-per-page; the one giving the biggest grids wins.
  var SOLUTION_ARRANGEMENTS = { 1: [[1, 1]], 2: [[1, 2], [2, 1]], 4: [[2, 2], [1, 4], [4, 1]], 6: [[2, 3], [3, 2]] };

  // ------------------------------------------------------------------ text metrics
  var Text = {
    metrics: function (bold) { return SS.FONT_METRICS[bold ? 'bold' : 'regular']; },
    // Width in inches. No kerning (jsPDF does not kern; the SVG preview disables it too).
    measure: function (str, pt, bold) {
      var m = Text.metrics(bold), units = 0;
      for (var i = 0; i < str.length; i++) {
        var w = m.widths[str.charCodeAt(i)];
        units += w === undefined ? m.fallback : w;
      }
      return units / m.upm * pt / 72;
    },
    ascent: function (pt, bold) { var m = Text.metrics(bold); return m.ascent / m.upm * pt / 72; },
    descent: function (pt, bold) { var m = Text.metrics(bold); return m.descent / m.upm * pt / 72; },
    capHeight: function (pt, bold) { var m = Text.metrics(bold); return m.capHeight / m.upm * pt / 72; },
    wrap: function (str, pt, bold, width) {
      // Split on plain spaces only, so non-breaking spaces keep "3 x 3" together.
      var words = str.split(/ +/), lines = [], line = '';
      words.forEach(function (word) {
        var tryLine = line ? line + ' ' + word : word;
        if (line && Text.measure(tryLine, pt, bold) > width) { lines.push(line); line = word; }
        else line = tryLine;
      });
      if (line) lines.push(line);
      return lines;
    }
  };

  // ------------------------------------------------------------------ samurai grid geometry
  // Line segments of the whole Samurai figure in cell units, merged into long runs.
  // Weight of an edge = heaviest role it plays in any grid: outline > box line > cell line.
  var gridSegments = (function () {
    var cache = null;
    return function () {
      if (cache) return cache;
      var E = SS.engine, N = E.N;
      function isActive(r, c) { return r >= 0 && c >= 0 && r < N && c < N && E.active[r * N + c] === 1; }
      function weightAt(k, along, horizontal) {
        var best = 0;
        E.GRIDS.forEach(function (g) {
          var r0 = horizontal ? g.r : g.c, c0 = horizontal ? g.c : g.r;
          if (along < c0 || along >= c0 + 9 || k < r0 || k > r0 + 9) return;
          var local = k - r0;
          var w = local === 0 || local === 9 ? LINE.outline : local % 3 === 0 ? LINE.box : LINE.thin;
          if (w > best) best = w;
        });
        return best;
      }
      var segs = [];
      [true, false].forEach(function (horizontal) {
        for (var k = 0; k <= N; k++) {
          var run = null;
          for (var a = 0; a <= N; a++) {
            var w = 0;
            if (a < N) {
              var present = horizontal ? isActive(k - 1, a) || isActive(k, a) : isActive(a, k - 1) || isActive(a, k);
              if (present) w = weightAt(k, a, horizontal);
            }
            if (run && run.w === w) { run.len++; continue; }
            if (run && run.w > 0) segs.push(runToSeg(run, k, horizontal));
            run = { start: a, len: 1, w: w };
          }
        }
      });
      function runToSeg(run, k, horizontal) {
        return horizontal
          ? { x1: run.start, y1: k, x2: run.start + run.len, y2: k, w: run.w }
          : { x1: k, y1: run.start, x2: k, y2: run.start + run.len, w: run.w };
      }
      segs.sort(function (p, q) { return p.w - q.w; }); // thin first, thick on top
      var shared = [];
      E.units.forEach(function (u, ui) {
        var info = E.unitInfo[ui];
        if (info.kind === 'box' && info.grids.length > 1) shared.push({ r: Math.floor(u[0] / N), c: u[0] % N });
      });
      cache = { segs: segs, shared: shared };
      return cache;
    };
  })();

  // Extra room a grid needs beyond its side: half the outline weight on each side.
  var GRID_BLEED_IN = LINE.outline / 72;

  function drawSamurai(cmds, x0, y0, side, opts) {
    var E = SS.engine, N = E.N, cell = side / N, geo = gridSegments();
    if (opts.shade) {
      geo.shared.forEach(function (b) {
        cmds.push({ t: 'rect', x: x0 + b.c * cell, y: y0 + b.r * cell, w: cell * 3, h: cell * 3, fill: SHADE });
      });
    }
    geo.segs.forEach(function (s) {
      cmds.push({
        t: 'line', x1: x0 + s.x1 * cell, y1: y0 + s.y1 * cell, x2: x0 + s.x2 * cell, y2: y0 + s.y2 * cell,
        w: s.w, gray: 0, cap: s.w > LINE.thin ? 'square' : 'butt'
      });
    });
    var pt = digitPt(side);
    var dy = Text.capHeight(pt, true) / 2;
    var givens = opts.givens, solution = opts.solution;
    if (!givens) return;
    for (var c = 0; c < E.SIZE; c++) {
      if (!E.active[c]) continue;
      var g = givens.charCodeAt(c) - 48, isGiven = g >= 1 && g <= 9;
      var d = isGiven ? g : (solution ? solution.charCodeAt(c) - 48 : 0);
      if (!(d >= 1 && d <= 9)) continue;
      var r = Math.floor(c / N), col = c % N;
      cmds.push({
        t: 'text', x: x0 + (col + 0.5) * cell, y: y0 + (r + 0.5) * cell + dy, text: String(d),
        size: pt, bold: isGiven, gray: isGiven ? 0 : FILLED_GRAY, align: 'center'
      });
    }
  }

  function digitPt(side) { return DIGIT_RATIO * (side / 21) * 72; }

  // ------------------------------------------------------------------ page geometry
  function pageFrame(trim, bleed, margins, pageNumber) {
    var size = KDP.pageSize(trim, bleed), side = KDP.sideOf(pageNumber);
    var tx = bleed && side === 'left' ? KDP.BLEED_W : 0;
    var ty = bleed ? KDP.BLEED_H / 2 : 0;
    var liveX = tx + (side === 'right' ? margins.inside : margins.outside);
    return {
      w: size.w, h: size.h, side: side,
      trim: { x: tx, y: ty, w: trim.w, h: trim.h },
      live: { x: liveX, y: ty + margins.outside, w: trim.w - margins.inside - margins.outside, h: trim.h - 2 * margins.outside }
    };
  }

  function footerBand(pageNumbers) { return pageNumbers ? FOOTER_PT * 2.4 / 72 : 0; }

  function headerSizes(live) {
    var title = live.w >= 6 ? 14 : 12;
    return { title: title, diff: title - 3, band: title * 1.9 / 72 };
  }

  // Grid slots for puzzle pages: perPage stacked vertically, each with a header band.
  function puzzleSlots(live, perPage, pageNumbers) {
    var hs = headerSizes(live), contentH = live.h - footerBand(pageNumbers);
    var slotH = (contentH - GAP * (perPage - 1)) / perPage;
    var side = Math.min(live.w, slotH - hs.band) - GRID_BLEED_IN;
    var slots = [];
    for (var i = 0; i < perPage; i++) {
      var top = live.y + i * (slotH + GAP);
      var blockH = hs.band + side + GRID_BLEED_IN;
      var blockTop = top + (slotH - blockH) / 2;
      slots.push({
        gridX: live.x + (live.w - side) / 2,
        gridY: blockTop + hs.band + GRID_BLEED_IN / 2,
        side: side,
        headerTop: blockTop,
        sizes: hs
      });
    }
    return slots;
  }

  function solutionLabelPt(perPage) { return perPage <= 2 ? 10 : 9; }

  function solutionSlots(live, perPage, pageNumbers) {
    var labelPt = solutionLabelPt(perPage), band = labelPt * 1.8 / 72;
    var contentH = live.h - footerBand(pageNumbers);
    var cols, rows, cellW, cellH, side = -Infinity;
    SOLUTION_ARRANGEMENTS[perPage].forEach(function (arr) {
      var cw = (live.w - GAP * (arr[0] - 1)) / arr[0], ch = (contentH - GAP * (arr[1] - 1)) / arr[1];
      var sd = Math.min(cw, ch - band) - GRID_BLEED_IN;
      if (sd > side + 1e-9) { side = sd; cols = arr[0]; rows = arr[1]; cellW = cw; cellH = ch; }
    });
    var slots = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var left = live.x + c * (cellW + GAP), top = live.y + r * (cellH + GAP);
        var blockH = band + side + GRID_BLEED_IN, blockTop = top + (cellH - blockH) / 2;
        slots.push({
          gridX: left + (cellW - side) / 2,
          gridY: blockTop + band + GRID_BLEED_IN / 2,
          side: side,
          labelTop: blockTop,
          labelPt: labelPt
        });
      }
    }
    return slots;
  }

  // ------------------------------------------------------------------ book plan
  function difficultyForIndex(index, count, difficulty) {
    if (difficulty !== 'mixed') return difficulty;
    return LEVELS[Math.min(3, Math.floor(index * 4 / Math.max(1, count)))];
  }

  function countPages(s, n, perPage, solPer) {
    return (s.copyrightPage ? 1 : 0) + (s.howToPlay ? 1 : 0) + Math.ceil(n / perPage) + (s.includeSolutions ? 1 + Math.ceil(n / solPer) : 0);
  }

  // Resolves which "per page" options are allowed (they depend on margins, which depend on
  // the page count, which depends on the options) and which values actually apply.
  function plan(s, n) {
    var trim = KDP.trimByKey(s.trim);
    function liveFor(pageCount) {
      var m = KDP.margins(pageCount, s.bleed, s.marginPreset);
      return pageFrame(trim, s.bleed, m, 1).live;
    }
    function puzzlePt(pp, sp) {
      return digitPt(puzzleSlots(liveFor(countPages(s, n, pp, sp)), pp, s.pageNumbers)[0].side);
    }
    function solutionPt(pp, sp) {
      return digitPt(solutionSlots(liveFor(countPages(s, n, pp, sp)), sp, s.pageNumbers)[0].side);
    }
    var pp = s.perPage === 2 ? 2 : 1;
    var sp = SOLUTION_ARRANGEMENTS[s.solutionsPerPage] ? s.solutionsPerPage : 4;
    var avail = {};
    for (var iter = 0; iter < 3; iter++) {
      avail.perPage = {};
      [1, 2].forEach(function (v) {
        var pt = puzzlePt(v, sp), need = v === 2 ? MIN_TWO_UP_PT : KDP.MIN_FONT_PT;
        avail.perPage[v] = {
          ok: pt >= need, pt: pt,
          reason: pt >= need ? '' : 'Digits would be ' + pt.toFixed(1) + ' pt (need ' + need + ' pt) at this trim size'
        };
      });
      avail.solutionsPerPage = {};
      [1, 2, 4, 6].forEach(function (v) {
        var pt = solutionPt(pp, v);
        avail.solutionsPerPage[v] = {
          ok: pt >= KDP.MIN_FONT_PT, pt: pt,
          reason: pt >= KDP.MIN_FONT_PT ? '' : 'Digits would be ' + pt.toFixed(1) + ' pt (KDP minimum is 7 pt)'
        };
      });
      pp = avail.perPage[s.perPage] && avail.perPage[s.perPage].ok ? s.perPage : 1;
      var wanted = SOLUTION_ARRANGEMENTS[s.solutionsPerPage] ? s.solutionsPerPage : 4;
      sp = [6, 4, 2, 1].filter(function (v) { return v <= wanted && avail.solutionsPerPage[v].ok; })[0] || 1;
    }
    var pageCount = countPages(s, n, pp, sp);
    var margins = KDP.margins(pageCount, s.bleed, s.marginPreset);
    var toAdd = 0;
    if (pageCount < KDP.MIN_PAGES) {
      var more = n;
      while (countPages(s, more, pp, sp) < KDP.MIN_PAGES && more < 5000) more++;
      toAdd = more - n;
    }
    return {
      trim: trim, perPage: pp, solutionsPerPage: sp, availability: avail,
      pageCount: pageCount, margins: margins, puzzlesToAdd: toAdd,
      puzzleDigitPt: puzzlePt(pp, sp), solutionDigitPt: s.includeSolutions ? solutionPt(pp, sp) : null
    };
  }

  // ------------------------------------------------------------------ book build
  // puzzles: array of { id, difficulty, givens, solution } or null for an empty placeholder book.
  function build(s, puzzles) {
    var n = puzzles ? puzzles.length : s.count;
    var p = plan(s, n);
    var prefix = (s.titlePrefix || '').trim() || 'Puzzle';
    var items = [];
    for (var i = 0; i < n; i++) {
      items.push(puzzles ? puzzles[i] : { id: i + 1, difficulty: difficultyForIndex(i, n, s.difficulty), givens: null, solution: null });
    }

    var pages = [];
    if (s.copyrightPage) pages.push({ kind: 'copyright' });
    if (s.howToPlay) pages.push({ kind: 'howto' });
    for (i = 0; i < n; i += p.perPage) pages.push({ kind: 'puzzles', items: items.slice(i, i + p.perPage) });
    if (s.includeSolutions) {
      pages.push({ kind: 'solutionsHeader' });
      for (i = 0; i < n; i += p.solutionsPerPage) pages.push({ kind: 'solutions', items: items.slice(i, i + p.solutionsPerPage) });
    }
    pages.forEach(function (pg, idx) { pg.number = idx + 1; pg.side = KDP.sideOf(idx + 1); });

    // Small cache: the preview revisits pages, but a full export must not keep all pages in memory.
    var cache = {}, cacheOrder = [], CACHE_MAX = 24;
    function renderPage(idx) {
      if (cache[idx]) return cache[idx];
      var pg = pages[idx];
      var frame = pageFrame(p.trim, s.bleed, p.margins, pg.number);
      var cmds = [];
      if (pg.kind === 'puzzles') renderPuzzlePage(cmds, frame.live, pg, s, p, prefix);
      else if (pg.kind === 'solutions') renderSolutionPage(cmds, frame.live, pg, s, p, prefix);
      else if (pg.kind === 'solutionsHeader') renderSolutionsHeader(cmds, frame.live, n, prefix);
      else if (pg.kind === 'howto') renderHowTo(cmds, frame.live, s);
      else if (pg.kind === 'copyright') renderCopyright(cmds, frame.live, s);
      // Front matter: the copyright page counts as page 1 but, as in most books, shows no number.
      if (s.pageNumbers && pg.kind !== 'copyright') {
        cmds.push({
          t: 'text', x: frame.live.x + frame.live.w / 2, y: frame.live.y + frame.live.h - Text.descent(FOOTER_PT, false),
          text: String(pg.number), size: FOOTER_PT, bold: false, gray: 0, align: 'center'
        });
      }
      var out = { number: pg.number, side: frame.side, kind: pg.kind, w: frame.w, h: frame.h, trim: frame.trim, live: frame.live, commands: cmds };
      cache[idx] = out;
      cacheOrder.push(idx);
      if (cacheOrder.length > CACHE_MAX) delete cache[cacheOrder.shift()];
      return out;
    }

    return {
      settings: s,
      plan: p,
      trim: p.trim,
      pageCount: pages.length,
      puzzleCount: n,
      fingerprint: puzzles ? SS.engine.hashString(puzzles.map(function (q) { return q.givens; }).join('')) : 0,
      pageSize: KDP.pageSize(p.trim, s.bleed),
      margins: p.margins,
      pages: pages,
      placeholder: !puzzles,
      renderPage: renderPage
    };
  }

  function renderPuzzlePage(cmds, live, pg, s, p, prefix) {
    var slots = puzzleSlots(live, p.perPage, s.pageNumbers);
    pg.items.forEach(function (item, k) {
      var slot = slots[k], hs = slot.sizes;
      var base = slot.headerTop + Text.ascent(hs.title, true);
      cmds.push({ t: 'text', x: slot.gridX, y: base, text: prefix + ' ' + item.id, size: hs.title, bold: true, gray: 0, align: 'left' });
      cmds.push({ t: 'text', x: slot.gridX + slot.side, y: base, text: LABELS[item.difficulty] || '', size: hs.diff, bold: false, gray: 0.25, align: 'right' });
      drawSamurai(cmds, slot.gridX, slot.gridY, slot.side, { shade: s.shadeShared, givens: item.givens, solution: null });
    });
  }

  function renderSolutionPage(cmds, live, pg, s, p, prefix) {
    var slots = solutionSlots(live, p.solutionsPerPage, s.pageNumbers);
    pg.items.forEach(function (item, k) {
      var slot = slots[k];
      cmds.push({
        t: 'text', x: slot.gridX, y: slot.labelTop + Text.ascent(slot.labelPt, true),
        text: prefix + ' ' + item.id, size: slot.labelPt, bold: true, gray: 0, align: 'left'
      });
      drawSamurai(cmds, slot.gridX, slot.gridY, slot.side, { shade: s.shadeShared, givens: item.givens, solution: item.solution });
    });
  }

  function renderSolutionsHeader(cmds, live, n, prefix) {
    var cx = live.x + live.w / 2, y = live.y + live.h * 0.38;
    cmds.push({ t: 'text', x: cx, y: y, text: 'Solutions', size: 30, bold: true, gray: 0, align: 'center' });
    var sub = n === 1 ? prefix + ' 1' : prefix + ' 1 – ' + n;
    cmds.push({ t: 'text', x: cx, y: y + 0.45, text: sub, size: 12, bold: false, gray: 0.25, align: 'center' });
  }

  var NBSP = String.fromCharCode(160);
  var TIMES = NBSP + String.fromCharCode(215) + NBSP; // "3 x 3" that never breaks across lines

  // Rules text plus a small labeled diagram. Portrait: diagram under the text.
  // Landscape trims: text on the left, diagram on the right (there is no room below).
  function renderHowTo(cmds, live, s) {
    var small = live.w < 5, landscape = live.w > live.h * 1.15;
    var bodyPt = small ? 10 : 11, lead = bodyPt * 1.45 / 72, headPt = small ? 12 : 13, titlePt = small ? 20 : 22;
    var bottom = live.y + live.h - footerBand(s.pageNumbers);
    var colGap = 0.35;
    var width = landscape ? (live.w - colGap) * 0.6 : Math.min(live.w, 5.8);
    var x = landscape ? live.x : live.x + (live.w - width) / 2;
    var y = live.y + Text.ascent(titlePt, true);
    cmds.push({ t: 'text', x: live.x + live.w / 2, y: y, text: 'How to Play', size: titlePt, bold: true, gray: 0, align: 'center' });
    y += 0.3;
    var textTop = y;

    function para(text, opts) {
      opts = opts || {};
      var indent = opts.bullet ? 0.2 : 0;
      var lines = Text.wrap(text, bodyPt, false, width - indent);
      lines.forEach(function (line, i) {
        y += lead;
        if (opts.bullet && i === 0) cmds.push({ t: 'text', x: x, y: y, text: String.fromCharCode(8226), size: bodyPt, bold: true, gray: 0, align: 'left' });
        cmds.push({ t: 'text', x: x + indent, y: y, text: line, size: bodyPt, bold: false, gray: 0, align: 'left' });
      });
      y += lead * 0.35;
    }
    function heading(text) {
      y += lead * 0.6 + Text.ascent(headPt, true) * 0.6;
      cmds.push({ t: 'text', x: x, y: y, text: text, size: headPt, bold: true, gray: 0, align: 'left' });
      y += lead * 0.1;
    }

    para('A Samurai Sudoku is five classic 9' + TIMES + '9 Sudoku grids joined in an X: four corner grids and one center grid. Each corner grid shares one 3' + TIMES + '3 box with the center grid.');
    heading('Rules');
    para('Fill every empty cell with a digit from 1 to 9.', { bullet: true });
    para('In each of the five grids, every row, every column and every 3' + TIMES + '3 box contains each digit from 1 to 9 exactly once.', { bullet: true });
    para('The four boxes where grids overlap (shaded in the diagram) belong to two grids at once, so their digits must work for both grids.', { bullet: true });
    para('Rows and columns stop at the edge of their own grid. They do not continue into the next grid.', { bullet: true });
    heading('Tip');
    para('Start in the shared boxes. They get clues from two grids, so they often fill in first. Every puzzle has exactly one solution' +
      (s.includeSolutions ? ', and the solutions are at the back of the book.' : '.'));

    // Labeled diagram in the remaining space.
    var captionPt = 9, captionH = captionPt * 2.2 / 72, caption = 'Shaded boxes are shared: each one is part of two grids.';
    var area;
    if (landscape) {
      var colX = live.x + width + colGap;
      area = { x: colX, y: textTop + 0.1, w: live.x + live.w - colX, h: bottom - textTop - 0.1 };
    } else {
      area = { x: live.x, y: y + 0.3, w: live.w, h: bottom - y - 0.3 };
    }
    var pad = DIAGRAM_OUTLINE / 72; // strokes reach half their width past the diagram edge
    var side = Math.min(3.2, area.w * (landscape ? 1 : 0.65) - pad);
    // The caption may need two lines in a narrow column.
    var capLines = Text.wrap(caption, captionPt, false, area.w);
    side = Math.min(side, area.h - captionH * capLines.length - pad);
    if (side < 1.4) return; // not enough room on very small trims: the text alone still explains it
    var dx = area.x + (area.w - side) / 2;
    var dy = area.y + (area.h - side - captionH * capLines.length) / 2;
    drawDiagram(cmds, dx, dy, side);
    capLines.forEach(function (line, i) {
      cmds.push({
        t: 'text', x: area.x + area.w / 2, y: dy + side + captionH * (0.75 + i * 0.6), text: line,
        size: captionPt, bold: false, gray: 0.2, align: 'center'
      });
    });
  }

  // Copyright notice as a block centered on the page (both ways). Long extra lines make the
  // text step down in size (never under 7 pt) until the block fits.
  function renderCopyright(cmds, live, s) {
    var year = s.copyrightYear || new Date().getFullYear();
    var holder = (s.copyrightHolder || '').trim(), title = (s.bookTitle || '').trim();
    var notes = (s.copyrightNotes || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var width = Math.min(live.w, 4.6), cx = live.x + live.w / 2;

    // Like Text.wrap, but also breaks a word that is wider than the line on its own (URLs).
    function wrap(str, pt, bold) {
      var out = [];
      Text.wrap(str, pt, bold, width).forEach(function (line) {
        while (Text.measure(line, pt, bold) > width) {
          var k = line.length - 1;
          while (k > 1 && Text.measure(line.slice(0, k), pt, bold) > width) k--;
          k = Math.max(1, k); // always move forward, even on a single over-wide glyph
          out.push(line.slice(0, k));
          line = line.slice(k);
        }
        out.push(line);
      });
      return out;
    }
    function layoutAt(bodyPt) {
      var titlePt = bodyPt + 3, lead = bodyPt * 1.45 / 72, gap = lead * 0.7, blocks = [];
      function add(text, pt, bold, space) {
        blocks.push({ lines: wrap(text, pt, bold), pt: pt, bold: bold, lead: pt * 1.45 / 72, before: blocks.length ? space : 0 });
      }
      if (title) add(title, titlePt, true, 0);
      add('Copyright ' + String.fromCharCode(169) + ' ' + year + (holder ? ' ' + holder : ''), bodyPt, false, gap);
      add('All rights reserved.', bodyPt, false, 0);
      add('No part of this book may be reproduced, stored in a retrieval system or transmitted in any form or by any means, ' +
        'electronic, mechanical, photocopying, recording or otherwise, without prior written permission from the publisher, ' +
        'except for brief quotations in a review.', bodyPt, false, gap);
      notes.forEach(function (n, i) { add(n, bodyPt, false, i === 0 ? gap : 0); });
      var h = 0;
      blocks.forEach(function (b) { h += b.before + b.lines.length * b.lead; });
      return { blocks: blocks, h: h };
    }
    var pt = live.w < 5 ? 9 : 10, lay = layoutAt(pt);
    while (lay.h > live.h && pt > KDP.MIN_FONT_PT) { pt = Math.max(KDP.MIN_FONT_PT, pt - 0.5); lay = layoutAt(pt); }

    var y = live.y + Math.max(0, (live.h - lay.h) / 2);
    lay.blocks.forEach(function (b) {
      y += b.before;
      b.lines.forEach(function (line) {
        cmds.push({ t: 'text', x: cx, y: y + Text.ascent(b.pt, b.bold), text: line, size: b.pt, bold: b.bold, gray: 0, align: 'center' });
        y += b.lead;
      });
    });
  }

  var DIAGRAM_OUTLINE = 1.5; // pt

  // Box-level Samurai: 7 x 7 boxes, grids numbered in reading order.
  function drawDiagram(cmds, x0, y0, side) {
    var bs = side / 7, E = SS.engine;
    var shared = [[2, 2], [2, 4], [4, 2], [4, 4]];
    shared.forEach(function (b) { cmds.push({ t: 'rect', x: x0 + b[1] * bs, y: y0 + b[0] * bs, w: bs, h: bs, fill: SHADE }); });
    var outlines = [];
    E.GRIDS.forEach(function (g) {
      var gx = x0 + g.c / 3 * bs, gy = y0 + g.r / 3 * bs;
      for (var k = 1; k < 3; k++) {
        cmds.push({ t: 'line', x1: gx + k * bs, y1: gy, x2: gx + k * bs, y2: gy + 3 * bs, w: LINE.thin, gray: 0, cap: 'butt' });
        cmds.push({ t: 'line', x1: gx, y1: gy + k * bs, x2: gx + 3 * bs, y2: gy + k * bs, w: LINE.thin, gray: 0, cap: 'butt' });
      }
      outlines.push([gx, gy]);
    });
    outlines.forEach(function (o) {
      var a = o[0], b = o[1], s3 = 3 * bs;
      [[a, b, a + s3, b], [a + s3, b, a + s3, b + s3], [a, b + s3, a + s3, b + s3], [a, b, a, b + s3]].forEach(function (l) {
        cmds.push({ t: 'line', x1: l[0], y1: l[1], x2: l[2], y2: l[3], w: DIAGRAM_OUTLINE, gray: 0, cap: 'square' });
      });
    });
    var labelPt = Math.max(7, Math.min(11, bs * 72 * 0.26));
    E.GRIDS.forEach(function (g, gi) {
      var cx = x0 + (g.c / 3 + 1.5) * bs, cy = y0 + (g.r / 3 + 1.5) * bs;
      var label = 'Grid ' + (gi + 1);
      if (Text.measure(label, labelPt, true) > bs * 0.92) label = String(gi + 1);
      cmds.push({ t: 'text', x: cx, y: cy + Text.capHeight(labelPt, true) / 2, text: label, size: labelPt, bold: true, gray: 0, align: 'center' });
    });
  }

  // ------------------------------------------------------------------ validation
  // Scans real draw commands: everything inside the live area, fonts >= 7 pt, lines >= 0.75 pt.
  function validate(book, onlyPages) {
    var res = { ok: true, minFont: Infinity, minLine: Infinity, outside: [], pagesChecked: 0 };
    var eps = 1e-6;
    var list = onlyPages || book.pages.map(function (pg, i) { return i; });
    list.forEach(function (idx) {
      var page = book.renderPage(idx), L = page.live;
      res.pagesChecked++;
      page.commands.forEach(function (c) {
        var box;
        if (c.t === 'line') {
          var h = c.w / 72 / 2;
          res.minLine = Math.min(res.minLine, c.w);
          box = [Math.min(c.x1, c.x2) - h, Math.min(c.y1, c.y2) - h, Math.max(c.x1, c.x2) + h, Math.max(c.y1, c.y2) + h];
        } else if (c.t === 'rect') {
          box = [c.x, c.y, c.x + c.w, c.y + c.h];
        } else {
          res.minFont = Math.min(res.minFont, c.size);
          var w = Text.measure(c.text, c.size, c.bold);
          var left = c.align === 'center' ? c.x - w / 2 : c.align === 'right' ? c.x - w : c.x;
          box = [left, c.y - Text.ascent(c.size, c.bold), left + w, c.y + Text.descent(c.size, c.bold)];
        }
        if (box[0] < L.x - eps || box[1] < L.y - eps || box[2] > L.x + L.w + eps || box[3] > L.y + L.h + eps) {
          if (res.outside.length < 20) res.outside.push({ page: page.number, command: c });
        }
      });
    });
    if (res.minFont < KDP.MIN_FONT_PT || res.minLine < KDP.MIN_LINE_PT || res.outside.length) res.ok = false;
    return res;
  }

  SS.Layout = {
    LINE: LINE,
    LABELS: LABELS,
    LEVELS: LEVELS,
    FOOTER_PT: FOOTER_PT,
    Text: Text,
    difficultyForIndex: difficultyForIndex,
    countPages: countPages,
    plan: plan,
    build: build,
    validate: validate,
    pageFrame: pageFrame
  };
  SS.Text = Text;
})();
