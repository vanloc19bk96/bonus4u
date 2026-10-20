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
  window.WF = window.WF || {};
  var KDP = WF.KDP;

  // ------------------------------------------------------------------ style constants
  var GRID_LINE = 1;          // one stroke weight (pt) for every grid edge
  var LETTER_RATIO = 0.6;     // letter size = 0.6 x cell
  var MIN_CELL = 0.25;        // below this, squares get hard to write in (a comfort check, not a KDP rule)
  var FOOTER_PT = 9;
  var BLOCK_FILL = 0.22;      // "blocks" style: dark gray, not solid black (saves ink, prints evenly)
  var GAP = 0.3;              // between solution grids
  var CONTENT_INSET = 0.125;  // breathing room between the live (safe) area edge and page content
  var SOLUTION_ARRANGEMENTS = { 1: [[1, 1]], 2: [[1, 2], [2, 1]], 4: [[2, 2], [1, 4], [4, 1]], 6: [[2, 3], [3, 2]] };
  var LEVELS = ['easy', 'medium', 'hard'];
  var LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', mixed: 'Mixed' };
  var NBSP = String.fromCharCode(160);
  var ELLIPSIS = String.fromCharCode(8230);

  // ------------------------------------------------------------------ text metrics
  var Text = {
    metrics: function (bold) { return WF.FONT_METRICS[bold ? 'bold' : 'regular']; },
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
      var words = str.split(/ +/), lines = [], line = '';
      words.forEach(function (word) {
        var tryLine = line ? line + ' ' + word : word;
        if (line && Text.measure(tryLine, pt, bold) > width) { lines.push(line); line = word; }
        else line = tryLine;
      });
      if (line) lines.push(line);
      return lines;
    },
    // Cuts with an ellipsis so the string fits in width.
    fit: function (str, pt, bold, width) {
      if (Text.measure(str, pt, bold) <= width) return str;
      var s = str;
      while (s.length > 1 && Text.measure(s + ELLIPSIS, pt, bold) > width) s = s.slice(0, -1);
      return s.replace(/\s+$/, '') + ELLIPSIS;
    }
  };

  // ------------------------------------------------------------------ puzzle parameters
  function difficultyForIndex(index, count, difficulty) {
    if (difficulty !== 'mixed') return difficulty;
    return LEVELS[Math.min(2, Math.floor(index * 3 / Math.max(1, count)))];
  }

  // Biggest grid that still leaves comfortable squares (0.25 in, 0.3 in for large print)
  // next to the word list on this trim. Margins assume a 300-page gutter, which is safe.
  function gridCap(s) {
    var trim = KDP.trimByKey(s.trim), m = KDP.margins(300, s.bleed, s.marginPreset);
    var w = trim.w - m.inside - m.outside - 2 * CONTENT_INSET, h = trim.h - 2 * m.outside - 2 * CONTENT_INSET;
    var room = w > h * 1.15 ? Math.min(w * 0.6, h - 0.8) : Math.min(w, (h - 1.2) * 0.62);
    return Math.floor(room / (s.largePrint ? 0.3 : 0.25));
  }

  // Grid size + how many words to aim for. Smaller trims and large print get smaller grids.
  function gridFor(s, difficulty) {
    var base = { easy: 11, medium: 13, hard: 15 }[difficulty] || 13;
    var n = base;
    if (s.gridSize && s.gridSize !== 'auto') n = Number(s.gridSize);
    else {
      var trim = KDP.trimByKey(s.trim);
      if (Math.min(trim.w, trim.h) < 6) n -= 2;
      if (s.largePrint && trim.w < 7) n -= 2;
    }
    var cap = gridCap(s), capped = n > cap;
    n = Math.max(9, Math.min(19, cap, n));
    var density = { easy: 0.13, medium: 0.14, hard: 0.15 }[difficulty] || 0.14;
    return {
      n: n,
      capped: capped,
      target: Math.round(n * n * density),
      starters: difficulty === 'easy' ? 2 : 1,
      maxGivens: difficulty === 'easy' ? 6 : difficulty === 'medium' ? 4 : 3
    };
  }

  // ------------------------------------------------------------------ page geometry
  function pageFrame(trim, bleed, margins, pageNumber) {
    var size = KDP.pageSize(trim, bleed), side = KDP.sideOf(pageNumber);
    var tx = bleed && side === 'left' ? KDP.BLEED_W : 0;
    var ty = bleed ? KDP.BLEED_H / 2 : 0;
    var liveX = tx + (side === 'right' ? margins.inside : margins.outside);
    var live = { x: liveX, y: ty + margins.outside, w: trim.w - margins.inside - margins.outside, h: trim.h - 2 * margins.outside };
    return {
      w: size.w, h: size.h, side: side,
      trim: { x: tx, y: ty, w: trim.w, h: trim.h },
      live: live,
      // Content is laid out in this box, a little inside the live area.
      content: { x: live.x + CONTENT_INSET, y: live.y + CONTENT_INSET, w: live.w - 2 * CONTENT_INSET, h: live.h - 2 * CONTENT_INSET }
    };
  }

  function footerBand(pageNumbers) { return pageNumbers ? FOOTER_PT * 2.4 / 72 : 0; }

  function typeSizes(live, s) {
    var small = live.w < 5;
    if (s.largePrint) {
      return { small: small, title: small ? 17 : 20, label: small ? 10 : 11, list: small ? 12.5 : 14, head: small ? 11 : 12, minList: 11, maxCell: 0.5 };
    }
    return { small: small, title: small ? 14 : 17, label: small ? 8.5 : 9.5, list: small ? 9.5 : 11, head: small ? 8.5 : 9.5, minList: 8, maxCell: 0.42 };
  }

  // ------------------------------------------------------------------ word list
  // Groups the words by length ("4 LETTERS") and flows them into balanced columns.
  // Every column starts with a heading (repeated when a group continues), a split group
  // keeps at least two words on each side, and heading + gap take exactly two word lines
  // so word baselines line up across columns.
  function listLayout(words, width, pt, headPt, maxHeight) {
    var lead = pt * 1.32 / 72, headH = lead * 1.2, gapH = lead * 0.8;
    var groups = {}, lens = [];
    words.forEach(function (w) {
      var L = w.w.length;
      if (!groups[L]) { groups[L] = []; lens.push(L); }
      groups[L].push(w);
    });
    lens.sort(function (a, b) { return a - b; });
    var widest = 0;
    lens.forEach(function (L) {
      widest = Math.max(widest, Text.measure(L + NBSP + 'LETTERS', headPt, true));
      groups[L].forEach(function (w) { widest = Math.max(widest, Text.measure(w.w, pt, false)); });
    });
    var colGap = Math.max(0.22, pt * 2 / 72);
    var maxCols = Math.max(1, Math.min(7, Math.floor((width + colGap) / (widest + colGap))));

    // Greedy fill, `rows` word lines per column (a column-top heading counts as one).
    function flow(rows) {
      var cap = headH + (rows - 1) * lead + 1e-9;
      var cols = [], heights = [], splits = 0, lone = 0, col = null, h = 0;
      function newCol() { col = []; cols.push(col); heights.push(0); h = 0; }
      function addHead(L) {
        if (col.length) { col.push({ k: 'gap', h: gapH }); h += gapH; }
        col.push({ k: 'head', text: L + NBSP + 'LETTERS', h: headH }); h += headH;
      }
      newCol();
      lens.forEach(function (L) {
        var list = groups[L], i = 0;
        while (i < list.length) {
          var left = list.length - i, headCost = col.length ? gapH + headH : headH;
          var room = Math.floor((cap - h - headCost) / lead + 1e-6), take;
          if (room >= left) take = left;
          else if (!col.length && room >= 2) {
            take = Math.ceil(left / Math.ceil(left / room));    // a group that fills whole columns splits evenly
            if (left - take === 1) lone++;
          } else {
            take = left - room === 1 ? room - 1 : room;         // never leave one word behind
            if (take < Math.min(2, left)) take = 0;              // never strand one word under a heading
          }
          if (take === 0) {
            if (!col.length) { take = Math.min(left, room); if (take < 2 || left - take === 1) lone++; }
            else { newCol(); continue; }
          }
          if (i > 0) splits++;
          addHead(L);
          for (var k = 0; k < take; k++) {
            col.push({ k: 'word', text: list[i + k].w, given: !!list[i + k].given, h: lead }); h += lead;
          }
          heights[heights.length - 1] = h;
          i += take;
          if (i < list.length) newCol();
        }
      });
      return { cols: cols, height: Math.max.apply(null, heights), score: rows + splits * 0.75 + lone * 4 };
    }

    // Shortest block that fits the columns; a slightly taller one wins if it splits fewer groups.
    var best = null, firstOk = 0;
    for (var rows = 2; rows <= words.length + 1; rows++) {
      var f = flow(rows);
      if (f.cols.length > maxCols) continue;
      if (!firstOk) firstOk = rows;
      if (!best || f.score < best.score) best = f;
      if (rows >= firstOk + 3) break;
    }
    if (!best) best = flow(words.length + 1);
    var used = best.cols.length;
    var step = used > 1 ? Math.min((width - widest) / (used - 1), widest + colGap * 3) : 0;
    var blockW = widest + step * (used - 1);
    return {
      pt: pt, headPt: headPt, cols: best.cols, height: best.height, width: blockW, step: step, widest: widest,
      fits: maxHeight === undefined || best.height <= maxHeight + 1e-9
    };
  }

  function drawList(cmds, lay, x0, y0) {
    lay.cols.forEach(function (col, ci) {
      var x = x0 + ci * lay.step, y = y0;
      col.forEach(function (it) {
        if (it.k === 'head') {
          // Sits close to its first word, not to the gap above it.
          var hb = y + it.h + Text.ascent(lay.pt, false) - lay.headPt * 1.45 / 72;
          cmds.push({ t: 'text', x: x, y: hb, text: it.text, size: lay.headPt, bold: true, gray: 0, align: 'left' });
        } else if (it.k === 'word') {
          var base = y + Text.ascent(lay.pt, false);
          cmds.push({ t: 'text', x: x, y: base, text: it.text, size: lay.pt, bold: false, gray: 0, align: 'left' });
          if (it.given) {
            // Starter words are crossed off: they are already in the grid.
            var sy = base - Text.capHeight(lay.pt, false) * 0.45, w = Text.measure(it.text, lay.pt, false);
            cmds.push({ t: 'line', x1: x + 1 / 144, y1: sy, x2: x + w - 1 / 144, y2: sy, w: 1, gray: 0, cap: 'butt' });
          }
        }
        y += it.h;
      });
    });
  }

  // ------------------------------------------------------------------ grid drawing
  function isLetter(pz, r, c) {
    return r >= 0 && c >= 0 && r < pz.rows && c < pz.cols && pz.grid.charAt(r * pz.cols + c) !== '.';
  }

  function givenMask(pz) {
    var mask = {};
    pz.words.forEach(function (w) {
      if (!w.given) return;
      for (var i = 0; i < w.w.length; i++) mask[w.d === 'a' ? w.r * pz.cols + w.c + i : (w.r + i) * pz.cols + w.c] = true;
    });
    return mask;
  }

  // mode: 'puzzle' (starter letters only) or 'solution' (every letter).
  function drawGrid(cmds, x0, y0, cell, pz, mode, style) {
    var rows = pz.rows, cols = pz.cols;
    if (style === 'blocks') {
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols;) {
          if (isLetter(pz, r, c)) { c++; continue; }
          var s = c;
          while (c < cols && !isLetter(pz, r, c)) c++;
          cmds.push({ t: 'rect', x: x0 + s * cell, y: y0 + r * cell, w: (c - s) * cell, h: cell, fill: BLOCK_FILL });
        }
      }
    }
    // Every edge uses the same weight; open style draws only edges that touch a letter square.
    function weight(a, b) {
      return style === 'blocks' || a || b ? GRID_LINE : 0;
    }
    var segs = [];
    function flush(run, horizontal, k) {
      if (!run || !run.w) return;
      segs.push(horizontal
        ? { x1: x0 + run.s * cell, y1: y0 + k * cell, x2: x0 + (run.s + run.n) * cell, y2: y0 + k * cell, w: run.w }
        : { x1: x0 + k * cell, y1: y0 + run.s * cell, x2: x0 + k * cell, y2: y0 + (run.s + run.n) * cell, w: run.w });
    }
    [true, false].forEach(function (horizontal) {
      var K = horizontal ? rows : cols, A = horizontal ? cols : rows;
      for (var k = 0; k <= K; k++) {
        var run = null;
        for (var a = 0; a < A; a++) {
          var before = horizontal ? isLetter(pz, k - 1, a) : isLetter(pz, a, k - 1);
          var after = horizontal ? isLetter(pz, k, a) : isLetter(pz, a, k);
          var w = weight(before, after);
          if (run && run.w === w) { run.n++; continue; }
          flush(run, horizontal, k);
          run = { s: a, n: 1, w: w };
        }
        flush(run, horizontal, k);
      }
    });
    segs.forEach(function (sg) {
      cmds.push({ t: 'line', x1: sg.x1, y1: sg.y1, x2: sg.x2, y2: sg.y2, w: sg.w, gray: 0, cap: 'square' });
    });

    var mask = givenMask(pz), pt = cell * 72 * LETTER_RATIO, dy = Text.capHeight(pt, true) / 2;
    for (var i = 0; i < pz.grid.length; i++) {
      var ch = pz.grid.charAt(i);
      if (ch === '.' || (mode === 'puzzle' && !mask[i])) continue;
      var rr = Math.floor(i / cols), cc = i % cols;
      cmds.push({
        t: 'text', x: x0 + (cc + 0.5) * cell, y: y0 + (rr + 0.5) * cell + dy, text: ch,
        size: pt, bold: mode === 'puzzle' || !!mask[i], gray: 0, align: 'center'
      });
    }
  }

  // Room a grid needs beyond its squares: half the outline weight on each side.
  function gridPad() { return GRID_LINE / 72; }

  // ------------------------------------------------------------------ puzzle page
  function headerLines(live, item, s, ts, prefix) {
    var title = item.title, lines = [];
    var label = prefix + ' ' + item.id;
    if (title) {
      lines.push({ text: label.toUpperCase(), pt: ts.label, bold: false, gray: 0.3, lead: ts.label * 1.6 / 72 });
      var pt = ts.title, wrapped = Text.wrap(title, pt, true, live.w);
      while (wrapped.length > 2 && pt > 11) { pt -= 1; wrapped = Text.wrap(title, pt, true, live.w); }
      if (wrapped.length > 2) wrapped = [wrapped[0], Text.fit(wrapped.slice(1).join(' '), pt, true, live.w)];
      wrapped.forEach(function (l) { lines.push({ text: l, pt: pt, bold: true, gray: 0, lead: pt * 1.25 / 72 }); });
    } else {
      lines.push({ text: label, pt: ts.title, bold: true, gray: 0, lead: ts.title * 1.25 / 72 });
    }
    var h = 0;
    lines.forEach(function (l) { h += l.lead; });
    return { lines: lines, h: h };
  }

  // Works out sizes and positions for one puzzle page (no commands), so the summary can
  // check every puzzle cheaply.
  function puzzleGeometry(live, item, s, prefix) {
    var ts = typeSizes(live, s), head = headerLines(live, item, s, ts, prefix);
    var top = live.y + head.h + 0.12, bottom = live.y + live.h - footerBand(s.pageNumbers);
    var availH = bottom - top, pad = gridPad();
    var landscape = live.w > live.h * 1.15;
    var gap = ts.small ? 0.22 : 0.3;
    var pt, list, cell, gridW, listW;
    // Shrink the list type first; on landscape pages also give the list a wider column.
    var fracs = landscape ? [0.36, 0.44, 0.52] : [1];
    outer: for (var fi = 0; fi < fracs.length; fi++) {
      for (pt = ts.list; ; pt = Math.max(ts.minList, pt - 0.5)) {
        var headPt = Math.max(KDP.MIN_FONT_PT, pt - (ts.list - ts.head));
        if (landscape) {
          listW = live.w * fracs[fi];
          gridW = live.w - listW - gap;
          list = listLayout(item.words, listW, pt, headPt);
          cell = Math.min(ts.maxCell, (gridW - pad) / item.cols, (availH - pad) / item.rows);
        } else {
          list = listLayout(item.words, live.w, pt, headPt);
          cell = Math.min(ts.maxCell, (live.w - pad) / item.cols, (availH - gap - list.height - pad) / item.rows);
        }
        var tooTall = landscape && list.height > availH;
        if (cell >= MIN_CELL && !tooTall) break outer;
        if (pt <= ts.minList) break;
      }
    }
    var g = { ts: ts, head: head, list: list, cell: cell, landscape: landscape, fits: true };
    var gw = item.cols * cell, gh = item.rows * cell;
    if (landscape) {
      g.gridX = live.x + (gridW - gw) / 2;
      g.gridY = top + (availH - gh) / 2;
      g.listX = live.x + gridW + gap + (listW - list.width) / 2;
      g.listY = top + Math.max(0, (availH - list.height) / 2);
      g.fits = list.height <= availH + 1e-6;
    } else {
      var blockH = gh + pad + gap + list.height;
      var y0 = top + Math.max(0, (availH - blockH) * 0.4);
      g.gridX = live.x + (live.w - gw) / 2;
      g.gridY = y0 + pad / 2;
      g.listX = live.x + (live.w - list.width) / 2;
      g.listY = y0 + gh + pad + gap;
      g.fits = blockH <= availH + 1e-6;
    }
    return g;
  }

  function renderPuzzlePage(cmds, live, pg, s, prefix) {
    var item = pg.item, g = puzzleGeometry(live, item, s, prefix);
    var y = live.y, cx = live.x + live.w / 2;
    g.head.lines.forEach(function (l) {
      cmds.push({ t: 'text', x: cx, y: y + Text.ascent(l.pt, l.bold), text: l.text, size: l.pt, bold: l.bold, gray: l.gray, align: 'center' });
      y += l.lead;
    });
    drawGrid(cmds, g.gridX, g.gridY, g.cell, item, 'puzzle', s.gridStyle);
    drawList(cmds, g.list, g.listX, g.listY);
  }

  // ------------------------------------------------------------------ solutions
  function solutionLabelPt(perPage) { return perPage <= 2 ? 10 : 9; }

  function solutionSlots(live, perPage, pageNumbers, dims) {
    var labelPt = solutionLabelPt(perPage), band = labelPt * 1.8 / 72, pad = gridPad();
    var contentH = live.h - footerBand(pageNumbers);
    var best = null;
    SOLUTION_ARRANGEMENTS[perPage].forEach(function (arr) {
      var cw = (live.w - GAP * (arr[0] - 1)) / arr[0], ch = (contentH - GAP * (arr[1] - 1)) / arr[1];
      var cell = Math.min((cw - pad) / dims.cols, (ch - band - pad) / dims.rows, 0.4);
      if (!best || cell > best.cell + 1e-9) best = { cols: arr[0], rows: arr[1], cw: cw, ch: ch, cell: cell };
    });
    var slots = [];
    for (var r = 0; r < best.rows; r++) {
      for (var c = 0; c < best.cols; c++) {
        slots.push({ x: live.x + c * (best.cw + GAP), y: live.y + r * (best.ch + GAP), w: best.cw, h: best.ch, cell: best.cell, labelPt: labelPt, band: band });
      }
    }
    return slots;
  }

  function renderSolutionPage(cmds, live, pg, s, plan, prefix) {
    var slots = solutionSlots(live, plan.solutionsPerPage, s.pageNumbers, plan.dims);
    pg.items.forEach(function (item, k) {
      var slot = slots[k], cell = slot.cell, pad = gridPad();
      var boxW = plan.dims.cols * cell, boxH = plan.dims.rows * cell;
      var blockH = slot.band + boxH + pad, top = slot.y + (slot.h - blockH) / 2;
      var boxX = slot.x + (slot.w - boxW) / 2;
      var label = item.title ? item.id + '.' + NBSP + item.title : prefix + ' ' + item.id;
      cmds.push({
        t: 'text', x: slot.x + slot.w / 2, y: top + Text.ascent(slot.labelPt, true),
        text: Text.fit(label, slot.labelPt, true, slot.w), size: slot.labelPt, bold: true, gray: 0, align: 'center'
      });
      var gx = boxX + (plan.dims.cols - item.cols) * cell / 2, gy = top + slot.band + pad / 2 + (plan.dims.rows - item.rows) * cell / 2;
      drawGrid(cmds, gx, gy, cell, item, 'solution', s.gridStyle);
    });
  }

  function renderSolutionsHeader(cmds, live, n, prefix) {
    var cx = live.x + live.w / 2, y = live.y + live.h * 0.38;
    cmds.push({ t: 'text', x: cx, y: y, text: 'Solutions', size: 30, bold: true, gray: 0, align: 'center' });
    var sub = n === 1 ? prefix + ' 1' : prefix + 's 1 – ' + n;
    cmds.push({ t: 'text', x: cx, y: y + 0.45, text: sub, size: 12, bold: false, gray: 0.25, align: 'center' });
  }

  // ------------------------------------------------------------------ front matter
  function renderTitlePage(cmds, live, s) {
    var cx = live.x + live.w / 2, width = live.w * 0.9;
    var title = (s.bookTitle || '').trim() || 'Word Fill-In Puzzles';
    var tpt = live.w < 5 ? 26 : 34, lines = Text.wrap(title, tpt, true, width);
    while (lines.length > 3 && tpt > 18) { tpt -= 2; lines = Text.wrap(title, tpt, true, width); }
    var y = live.y + live.h * 0.3;
    lines.forEach(function (l) {
      cmds.push({ t: 'text', x: cx, y: y, text: Text.fit(l, tpt, true, live.w), size: tpt, bold: true, gray: 0, align: 'center' });
      y += tpt * 1.2 / 72;
    });
    var sub = (s.subtitle || '').trim();
    if (sub) {
      y += 0.15;
      var spt = live.w < 5 ? 13 : 16;
      Text.wrap(sub, spt, false, width).slice(0, 4).forEach(function (l) {
        cmds.push({ t: 'text', x: cx, y: y, text: Text.fit(l, spt, false, live.w), size: spt, bold: false, gray: 0.2, align: 'center' });
        y += spt * 1.35 / 72;
      });
    }
    var author = (s.copyrightHolder || '').trim();
    if (author) {
      cmds.push({ t: 'text', x: cx, y: live.y + live.h * 0.82, text: Text.fit(author, 14, false, live.w), size: 14, bold: false, gray: 0, align: 'center' });
    }
  }

  // Copyright notice centered on the page. Long extra lines step the text down (never under 7 pt).
  function renderCopyright(cmds, live, s) {
    var year = s.copyrightYear || new Date().getFullYear();
    var holder = (s.copyrightHolder || '').trim(), title = (s.bookTitle || '').trim();
    var notes = (s.copyrightNotes || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var width = Math.min(live.w, 4.6), cx = live.x + live.w / 2;

    function wrap(str, pt, bold) {
      var out = [];
      Text.wrap(str, pt, bold, width).forEach(function (line) {
        while (Text.measure(line, pt, bold) > width) {
          var k = line.length - 1;
          while (k > 1 && Text.measure(line.slice(0, k), pt, bold) > width) k--;
          k = Math.max(1, k);
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

  function howToText(live, s, x, width, bodyPt) {
    var cmds = [], lead = bodyPt * 1.45 / 72, headPt = bodyPt + 2;
    var titlePt = Math.min(live.w < 5 ? 20 : 24, bodyPt * 2);
    var y = live.y + Text.ascent(titlePt, true);
    cmds.push({ t: 'text', x: live.x + live.w / 2, y: y, text: 'How to Play', size: titlePt, bold: true, gray: 0, align: 'center' });
    y += titlePt * 0.9 / 72;

    function para(text, opts) {
      opts = opts || {};
      var indent = opts.bullet ? 0.22 : 0;
      Text.wrap(text, bodyPt, false, width - indent).forEach(function (line, i) {
        y += lead;
        if (opts.bullet && i === 0) cmds.push({ t: 'text', x: x, y: y, text: String.fromCharCode(8226), size: bodyPt, bold: true, gray: 0, align: 'left' });
        cmds.push({ t: 'text', x: x + indent, y: y, text: line, size: bodyPt, bold: false, gray: 0, align: 'left' });
      });
      y += lead * 0.35;
    }
    function heading(text) {
      y += lead * 0.7 + Text.ascent(headPt, true) * 0.5;
      cmds.push({ t: 'text', x: x, y: y, text: text, size: headPt, bold: true, gray: 0, align: 'left' });
      y += lead * 0.1;
    }

    para('A Word Fill-In is a crossword without clues. Each puzzle has a grid and a list of words. Your job is to fit every word from the list into the grid.');
    heading('Rules');
    para('Words read from left to right, or from top to bottom.', { bullet: true });
    para('Every word in the list is used exactly once, and every row or column of two or more squares holds one word.', { bullet: true });
    para('Where two words cross, they share the same letter.', { bullet: true });
    para('To get you started, one word (on easier puzzles, two) is already in the grid. It is crossed off in the list.', { bullet: true });
    heading('Tips');
    para('The words are grouped by length. Count the squares of a space to know which group its word comes from.', { bullet: true });
    para('Begin with the letters of the starter word, then look for a length group with only one or two words.', { bullet: true });
    para('Cross each word off the list as you place it. A pencil makes changes easy.', { bullet: true });
    para('Every puzzle has exactly one solution' + (s.includeSolutions ? '. The solutions are at the back of the book.' : '.'));
    // The last line's descenders must stay inside the page too.
    return { cmds: cmds, y: y - lead * 0.35 + Text.descent(bodyPt, false) };
  }

  // Rules and tips, then a small solved example if there is room. The text steps down in
  // size (never under 8 pt) until it fits, so short landscape trims work too.
  function renderHowTo(cmds, live, s, example) {
    var small = live.w < 5, big = s.largePrint;
    var width = Math.min(live.w, 5.8), x = live.x + (live.w - width) / 2;
    var bottom = live.y + live.h - footerBand(s.pageNumbers);
    var bodyPt = big ? (small ? 12 : 14) : (small ? 10 : 11.5), lay;
    for (;;) {
      lay = howToText(live, s, x, width, bodyPt);
      if (lay.y <= bottom || bodyPt <= 8) break;
      bodyPt = Math.max(8, bodyPt - 0.5);
    }
    Array.prototype.push.apply(cmds, lay.cmds);
    var y = lay.y;

    // A small solved example (built from words no puzzle uses), if there is room.
    if (!example) return;
    var capPt = big ? 11 : 9, capH = capPt * 2 / 72, pad = gridPad();
    var areaTop = y + 0.25, areaH = bottom - areaTop - capH;
    var cell = Math.min(0.3, (width - pad) / example.cols, (areaH - pad) / example.rows);
    if (cell * 72 * LETTER_RATIO < 8 || areaH < 1.2) return;
    var gw = example.cols * cell, gh = example.rows * cell;
    var gx = live.x + (live.w - gw) / 2, gy = areaTop + pad / 2 + Math.max(0, (areaH - gh - pad) / 2 - 0.1);
    drawGrid(cmds, gx, gy, cell, example, 'solution', s.gridStyle);
    cmds.push({
      t: 'text', x: live.x + live.w / 2, y: gy + gh + pad / 2 + capH * 0.8, text: 'Example of a finished grid. The starter word is in bold.',
      size: capPt, bold: false, gray: 0.2, align: 'center'
    });
  }

  // ------------------------------------------------------------------ contents
  function contentsMetrics(live, s) {
    var pt = s.largePrint ? 13 : live.w < 5 ? 10 : 11, lead = pt * 1.6 / 72, head = 0.75;
    var avail = live.h - footerBand(s.pageNumbers) - head;
    return { pt: pt, lead: lead, head: head, perPage: Math.max(5, Math.floor(avail / lead)) };
  }

  function renderContents(cmds, live, pg, s) {
    var m = contentsMetrics(live, s), cx = live.x + live.w / 2;
    cmds.push({ t: 'text', x: cx, y: live.y + Text.ascent(20, true), text: pg.first ? 'Contents' : 'Contents (continued)', size: pg.first ? 20 : 14, bold: true, gray: 0, align: 'center' });
    var y = live.y + m.head, dotW = Text.measure('. ', m.pt, false);
    var width = Math.min(live.w, 5.2), x0 = live.x + (live.w - width) / 2;
    pg.entries.forEach(function (e) {
      var base = y + Text.ascent(m.pt, false), num = String(e.page);
      var numW = Text.measure(num, m.pt, e.bold);
      var label = Text.fit(e.label, m.pt, e.bold, width - numW - 0.35);
      var labelW = Text.measure(label, m.pt, e.bold);
      cmds.push({ t: 'text', x: x0, y: base, text: label, size: m.pt, bold: !!e.bold, gray: 0, align: 'left' });
      cmds.push({ t: 'text', x: x0 + width, y: base, text: num, size: m.pt, bold: !!e.bold, gray: 0, align: 'right' });
      var dotsSpace = width - labelW - numW - 0.16;
      var count = Math.floor(dotsSpace / dotW);
      if (count > 2) {
        var dots = new Array(count + 1).join('. ').trim();
        cmds.push({ t: 'text', x: x0 + width - numW - 0.08, y: base, text: dots, size: m.pt, bold: false, gray: 0.45, align: 'right' });
      }
      y += m.lead;
    });
  }

  // ------------------------------------------------------------------ book plan
  function hasTitles(items) { return items.some(function (p) { return !!p.title; }); }

  function frontCount(s) { return (s.titlePage ? 1 : 0) + (s.copyrightPage ? 1 : 0) + (s.howToPlay ? 1 : 0); }

  function countPages(s, n, sp, contentsPages) {
    return frontCount(s) + contentsPages + n + (s.includeSolutions ? 1 + Math.ceil(n / sp) : 0);
  }

  /*
   * items: [{ title, rows?, cols? }] (puzzles, or placeholders sized from gridFor before generation)
   * dims: { rows, cols } the biggest grid, for uniform solution slots.
   */
  function plan(s, items, dims) {
    var n = items.length, trim = KDP.trimByKey(s.trim);
    var contentsOn = !!s.contentsPage && hasTitles(items);
    function liveFor(pageCount) {
      return pageFrame(trim, s.bleed, KDP.margins(pageCount, s.bleed, s.marginPreset), 1).content;
    }
    function contentsPagesFor(pageCount) {
      if (!contentsOn) return 0;
      var entries = n + (s.howToPlay ? 1 : 0) + (s.includeSolutions ? 1 : 0);
      return Math.ceil(entries / contentsMetrics(liveFor(pageCount), s).perPage);
    }
    function solutionPt(pageCount, sp) {
      return solutionSlots(liveFor(pageCount), sp, s.pageNumbers, dims)[0].cell * 72 * LETTER_RATIO;
    }
    var sp = SOLUTION_ARRANGEMENTS[s.solutionsPerPage] ? s.solutionsPerPage : 4, cp = contentsPagesFor(24), avail = {};
    for (var iter = 0; iter < 4; iter++) {
      var pc = countPages(s, n, sp, cp);
      avail = {};
      [1, 2, 4, 6].forEach(function (v) {
        var pt = solutionPt(countPages(s, n, v, cp), v);
        avail[v] = { ok: pt >= KDP.MIN_FONT_PT, pt: pt, reason: pt >= KDP.MIN_FONT_PT ? '' : 'letters would be ' + pt.toFixed(1) + ' pt (KDP minimum is 7 pt)' };
      });
      var wanted = SOLUTION_ARRANGEMENTS[s.solutionsPerPage] ? s.solutionsPerPage : 4;
      sp = [6, 4, 2, 1].filter(function (v) { return v <= wanted && avail[v].ok; })[0] || 1;
      cp = contentsPagesFor(pc);
    }
    var pageCount = countPages(s, n, sp, cp);
    cp = contentsPagesFor(pageCount);
    pageCount = countPages(s, n, sp, cp);
    return {
      trim: trim, solutionsPerPage: sp, availability: { solutionsPerPage: avail },
      contentsPages: cp, contentsOn: contentsOn,
      pageCount: pageCount, margins: KDP.margins(pageCount, s.bleed, s.marginPreset),
      maxPages: KDP.maxPages(trim), dims: dims,
      solutionLetterPt: s.includeSolutions ? solutionPt(pageCount, sp) : null
    };
  }

  // ------------------------------------------------------------------ book build
  // puzzles: generated puzzles, each { id, title, rows, cols, grid, words }.
  // example: a small extra puzzle made from words no puzzle uses (shown solved on the
  // How to Play page, so it never gives away a real answer), or null.
  function build(s, puzzles, example) {
    var n = puzzles.length, dims = { rows: 1, cols: 1 };
    puzzles.forEach(function (p) { dims.rows = Math.max(dims.rows, p.rows); dims.cols = Math.max(dims.cols, p.cols); });
    var p = plan(s, puzzles, dims);
    var prefix = (s.titlePrefix || '').trim() || 'Puzzle';

    var pages = [];
    if (s.titlePage) pages.push({ kind: 'title' });
    if (s.copyrightPage) pages.push({ kind: 'copyright' });
    if (s.howToPlay) pages.push({ kind: 'howto' });
    var contents = [];
    for (var c = 0; c < p.contentsPages; c++) { contents.push({ kind: 'contents', entries: [], first: c === 0 }); pages.push(contents[c]); }
    var firstPuzzle = pages.length;
    puzzles.forEach(function (item) { pages.push({ kind: 'puzzle', item: item }); });
    var solutionsStart = -1;
    if (s.includeSolutions) {
      solutionsStart = pages.length;
      pages.push({ kind: 'solutionsHeader' });
      for (var i = 0; i < n; i += p.solutionsPerPage) pages.push({ kind: 'solutions', items: puzzles.slice(i, i + p.solutionsPerPage) });
    }
    pages.forEach(function (pg, idx) { pg.number = idx + 1; pg.side = KDP.sideOf(idx + 1); });

    if (contents.length) {
      var entries = [];
      if (s.howToPlay) entries.push({ label: 'How to Play', page: pages.filter(function (pg) { return pg.kind === 'howto'; })[0].number, bold: true });
      puzzles.forEach(function (item, k) {
        entries.push({ label: item.id + '.' + NBSP + (item.title || prefix + ' ' + item.id), page: pages[firstPuzzle + k].number });
      });
      if (solutionsStart >= 0) entries.push({ label: 'Solutions', page: pages[solutionsStart].number, bold: true });
      var per = Math.ceil(entries.length / contents.length);
      contents.forEach(function (pg, k) { pg.entries = entries.slice(k * per, (k + 1) * per); });
    }


    var cache = {}, cacheOrder = [], CACHE_MAX = 24;
    function renderPage(idx) {
      if (cache[idx]) return cache[idx];
      var pg = pages[idx];
      var frame = pageFrame(p.trim, s.bleed, p.margins, pg.number);
      var cmds = [];
      if (pg.kind === 'puzzle') renderPuzzlePage(cmds, frame.content, pg, s, prefix);
      else if (pg.kind === 'solutions') renderSolutionPage(cmds, frame.content, pg, s, p, prefix);
      else if (pg.kind === 'solutionsHeader') renderSolutionsHeader(cmds, frame.content, n, prefix);
      else if (pg.kind === 'howto') renderHowTo(cmds, frame.content, s, example);
      else if (pg.kind === 'contents') renderContents(cmds, frame.content, pg, s);
      else if (pg.kind === 'copyright') renderCopyright(cmds, frame.content, s);
      else if (pg.kind === 'title') renderTitlePage(cmds, frame.content, s);
      // Front matter pages (title, copyright) print no number, as in most books.
      if (s.pageNumbers && pg.kind !== 'copyright' && pg.kind !== 'title') {
        cmds.push({
          t: 'text', x: frame.content.x + frame.content.w / 2, y: frame.content.y + frame.content.h - Text.descent(FOOTER_PT, false),
          text: String(pg.number), size: FOOTER_PT, bold: false, gray: 0, align: 'center'
        });
      }
      var out = { number: pg.number, side: frame.side, kind: pg.kind, w: frame.w, h: frame.h, trim: frame.trim, live: frame.live, commands: cmds };
      cache[idx] = out;
      cacheOrder.push(idx);
      if (cacheOrder.length > CACHE_MAX) delete cache[cacheOrder.shift()];
      return out;
    }

    // Per-puzzle geometry checks (cheap: no draw commands). Both page sides share the same size.
    var live = pageFrame(p.trim, s.bleed, p.margins, 1).content, minCell = Infinity, minListPt = Infinity, overflow = [];
    puzzles.forEach(function (item) {
      var g = puzzleGeometry(live, item, s, prefix);
      minCell = Math.min(minCell, g.cell);
      minListPt = Math.min(minListPt, g.list.headPt, g.list.pt);
      if (!g.fits) overflow.push(item.id);
    });

    return {
      settings: s,
      plan: p,
      trim: p.trim,
      pageCount: pages.length,
      puzzleCount: n,
      fingerprint: WF.engine.hashString(puzzles.map(function (q) { return q.title + ':' + q.grid; }).join('|')),
      pageSize: KDP.pageSize(p.trim, s.bleed),
      margins: p.margins,
      pages: pages,
      stats: { minCell: minCell, minListPt: minListPt, overflow: overflow, puzzleLetterPt: minCell * 72 * LETTER_RATIO },
      renderPage: renderPage
    };
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

  WF.Layout = {
    GRID_LINE: GRID_LINE,
    LABELS: LABELS,
    LEVELS: LEVELS,
    MIN_CELL: MIN_CELL,
    LETTER_RATIO: LETTER_RATIO,
    Text: Text,
    difficultyForIndex: difficultyForIndex,
    gridFor: gridFor,
    countPages: countPages,
    plan: plan,
    build: build,
    validate: validate,
    pageFrame: pageFrame,
    listLayout: listLayout
  };
  WF.Text = Text;
})();
