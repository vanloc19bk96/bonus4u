/*
 * layout.js: the one layout calculation behind both the preview and the PDF.
 *
 * build(settings, puzzles, version) paginates the book, resolves KDP margins for the final
 * page count, and returns a Book whose renderPage(i) yields drawing commands (grid.js
 * format) in inches from the page's top-left corner. Nothing here knows about the DOM or
 * jsPDF.
 */
(function () {
  'use strict';
  window.KS = window.KS || {};
  var KDP = KS.KDP, T = KS.Text, G = KS.Grid, S = KS.Settings;

  // ---------------------------------------------------------------- styles
  var HEADER = { face: 'sans', size: 9, ink: 0.75, band: 0.38 };
  var FOOTER = { face: 'sans', size: 9, ink: 1, band: 0.3 };
  var PUZZLE_TEXT = { 1: { label: 16, ref: 10 }, 2: { label: 13, ref: 9 }, 4: { label: 11, ref: 8.5 }, 6: { label: 9.5, ref: 7.5 } };
  var GRID_ROWS = { 1: 1, 2: 2, 4: 2, 6: 3 };
  var BADGE_INK = 0.72;
  var BLOCK_GAP = 0.25;
  var ROW_GAP = { 1: 0.25, 2: 0.25, 4: 0.25, 6: 0.16 };
  var SOL = { labelFace: 'sansBold', label: 8, colGap: 0.26, rowGap: 0.2, minCellPt: 15, heading: 22 };
  var LABEL_GAP = 0.08, REF_GAP = 0.07;
  // Breathing room between the printed content and the margin (safe area) on every side.
  var INSET = 0.1;

  function boxH(face, size) { return T.ascent(face, size) + T.descent(face, size); }

  // The How to Play example: an Easy puzzle of the book's size and variant, made by the
  // engine from a fixed key, so it is the same in every book of that kind.
  var examples = {};
  function exampleFor(size, variant) {
    var key = size + variant;
    if (!(key in examples)) examples[key] = KS.engine.generate('how-to-play', size, variant, 'easy', 0, 0);
    return examples[key];
  }

  function digitRange(n) { return n === 10 ? '0 to 9' : '1 to ' + n; }

  function rulesFor(n, variant) {
    var list = [
      'Fill every row and every column with the digits ' + digitRange(n) + ', using each digit once.',
      'The thick lines divide the grid into ' + n + ' irregular regions of ' + n + ' cells. Each region also holds every digit once.'
    ];
    if (variant === 'diagonal') list.push('Both long diagonals (the thin gray lines from corner to corner) also hold every digit once.');
    list.push('The printed digits are your clues. Every puzzle has exactly one solution, and you can reach it by logic alone, without guessing.');
    return list;
  }
  var TIPS = [
    'Look for a digit that fits in only one cell of a row, column or region. The odd shapes of the regions often hide these.',
    'When all the spots for a digit inside a region lie in one row or column, that digit cannot go anywhere else in that row or column. It works the other way round too.',
    'Pencil small candidates into the cells and cross them out as you go.'
  ];
  var TIP_MIXED = 'The puzzles start easy and get harder as the book goes on.';
  var REGION_NOTE = 'The shaded cells are one region: like every row and column, it holds each digit once.';

  // ---------------------------------------------------------------- margins
  function resolveMargins(settings, pageCount) {
    var m = settings.margins, kdpInside = KDP.minGutter(pageCount);
    var inside = m.autoInside ? kdpInside + KDP.COMFORT : Math.max(m.inside, kdpInside);
    return {
      inside: inside, outside: m.outside, top: m.top, bottom: m.bottom,
      kdpInside: kdpInside,
      raised: !m.autoInside && m.inside < kdpInside - 1e-9
    };
  }

  // ---------------------------------------------------------------- geometry
  function hasHeader(settings) { return settings.header === 'title' || settings.header === 'level'; }

  // Height of the label above each grid: a line of bold text, or a numbered badge.
  function labelBand(settings, txt, count) {
    if (settings.labelStyle !== 'badge') return { h: boxH('sansBold', txt.label) + LABEL_GAP };
    var r = badgeRadius(txt.label, count);
    return { h: 2 * r + LABEL_GAP, r: r };
  }
  function tagSize(labelSize) { return Math.max(KDP.MIN_FONT_PT, labelSize * 0.8); }
  function badgeRadius(size, count) {
    var widest = T.width(String(Math.max(10, count)).replace(/\d/g, '0'), 'sansBold', size);
    return Math.max(widest / 2 + 0.05, T.capHeight('sansBold', size) * 0.95 + 0.03);
  }
  function bodyBand(settings) {
    return { top: hasHeader(settings) ? HEADER.band : 0, bottom: settings.pageNumbers ? FOOTER.band : 0 };
  }

  function puzzleGeometry(settings, liveW, liveH) {
    var n = settings.perPage, txt = PUZZLE_TEXT[n], band = bodyBand(settings), size = +settings.size;
    var areaH = liveH - band.top - band.bottom;
    var cols = n >= 4 ? 2 : 1, rows = GRID_ROWS[n], rowGap = ROW_GAP[n];
    var blockW = (liveW - (cols - 1) * BLOCK_GAP) / cols;
    var blockH = (areaH - (rows - 1) * rowGap) / rows;
    var lb = labelBand(settings, txt, settings.count), labelH = lb.h;
    var refH = settings.solutionRef ? REF_GAP + boxH('sans', txt.ref) : 0;
    // Leave room for the outer border's stroke, which straddles the grid edge.
    var pad = G.STROKE_PAD;
    var grid = Math.max(0, Math.min(blockW - pad, blockH - labelH - refH - pad));
    // A badge goes beside the grid (number disc, level underneath) when that leaves the
    // grid at least as big as a badge on top would. The grid stays centred in its block
    // when there is room, otherwise it moves right just enough to clear the badge.
    var badge = null, sideW = 0, shift = 0;
    if (settings.labelStyle === 'badge') {
      sideW = Math.max(2 * lb.r, T.width('EXTREME', 'sans', tagSize(txt.label))) + 0.12;
      var side = Math.max(0, Math.min(blockW - sideW - pad, blockH - refH - pad));
      if (side >= grid) {
        badge = 'side'; grid = side; labelH = 0;
        shift = Math.max(0, sideW + pad / 2 - (blockW - grid) / 2);
      } else badge = 'top';
    }
    // Spread the rows evenly down the page, never closer together than the row gap.
    var stackH = labelH + grid + refH + pad;
    var free = areaH - rows * stackH;
    var between = rows > 1 ? Math.max(rowGap, free / (rows + 1)) : 0;
    var outer = (free - (rows - 1) * between) / 2;
    var slots = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var bx = c * (blockW + BLOCK_GAP);
        var top = band.top + outer + r * (stackH + between) + pad / 2;
        slots.push({ x: bx + (blockW - grid) / 2 + shift, y: top + labelH, cx: bx + blockW / 2 + shift });
      }
    }
    return { grid: grid, cellPt: grid / size * 72, slots: slots, txt: txt, perPage: n, labelH: labelH, badge: badge, badgeR: lb.r || 0, sideW: sideW };
  }

  function solutionGeometry(settings, liveW, liveH) {
    var band = bodyBand(settings), areaH = liveH - band.top - band.bottom, size = +settings.size;
    var labelH = boxH(SOL.labelFace, SOL.label) + 0.05;
    var best = null;
    for (var cols = 1; cols <= 5; cols++) {
      for (var rows = 1; rows <= 7; rows++) {
        var grid = Math.min((liveW - (cols - 1) * SOL.colGap) / cols, (areaH - (rows - 1) * SOL.rowGap) / rows - labelH) - G.STROKE_PAD;
        if (grid / size * 72 < SOL.minCellPt) continue;
        var count = cols * rows;
        if (!best || count > best.count || (count === best.count && grid > best.grid)) {
          best = { cols: cols, rows: rows, grid: grid, count: count };
        }
      }
    }
    if (!best) best = { cols: 1, rows: 1, grid: Math.min(liveW, areaH - labelH) - G.STROKE_PAD, count: 1 };
    var headingH = boxH('serifBold', SOL.heading) + 0.22;
    var rowH = labelH + best.grid + G.STROKE_PAD + SOL.rowGap;
    var rowsFirst = Math.max(1, Math.min(best.rows, Math.floor((areaH - headingH + SOL.rowGap) / rowH)));
    var totalW = best.cols * best.grid + (best.cols - 1) * SOL.colGap;
    return {
      cols: best.cols, rows: best.rows, rowsFirst: rowsFirst, grid: best.grid, labelH: labelH,
      perPage: best.count, firstPage: best.cols * rowsFirst, headingH: headingH,
      x0: (liveW - totalW) / 2, top: band.top, cellPt: best.grid / size * 72, rowH: rowH
    };
  }

  // ---------------------------------------------------------------- pagination
  // Each difficulty level starts on a fresh page, like the sections of the bestselling books.
  function paginate(settings, slots, geo) {
    var pages = [], p = settings.pages, i, count = slots.length;
    if (p.title) pages.push({ type: 'title' });
    if (p.copyright) pages.push({ type: 'copyright' });
    if (p.contents) pages.push({ type: 'contents' });
    if (p.howTo) pages.push({ type: 'howto' });
    var per = settings.perPage;
    for (i = 0; i < count;) {
      var level = slots[i].level, n = 0;
      while (n < per && i + n < count && slots[i + n].level === level) n++;
      pages.push({ type: 'puzzles', first: i, n: n, level: level });
      i += n;
    }
    var first = true;
    for (i = 0; i < count;) {
      var n = Math.min(first ? geo.solution.firstPage : geo.solution.perPage, count - i);
      pages.push({ type: 'solutions', first: i, n: n, heading: first });
      i += n; first = false;
    }
    if (p.thanks) pages.push({ type: 'thanks' });
    if (pages.length % 2) pages.push({ type: 'blank' });
    return pages;
  }

  // Margins depend on the page count and the page count can depend on the margins (fewer
  // solution grids fit a narrower page), so iterate until the gutter row is stable.
  function plan(settings, slots) {
    var trim = KDP.trim(settings.trim), guess = KDP.MIN_PAGES, out = null;
    for (var iter = 0; iter < 8; iter++) {
      var mg = resolveMargins(settings, guess);
      var liveW = trim.w - mg.inside - mg.outside, liveH = trim.h - mg.top - mg.bottom;
      var boxW = liveW - 2 * INSET, boxH = liveH - 2 * INSET;
      var geo = { puzzle: puzzleGeometry(settings, boxW, boxH), solution: solutionGeometry(settings, boxW, boxH) };
      var pages = paginate(settings, slots, geo);
      out = { trim: trim, margins: mg, liveW: liveW, liveH: liveH, boxW: boxW, boxH: boxH, geo: geo, pages: pages };
      if (KDP.minGutter(pages.length) <= mg.kdpInside) break;
      guess = pages.length;
    }
    return out;
  }

  function slotsOf(settings, count) {
    return S.puzzlePlan(count == null ? settings.count : count, settings.difficulty, settings.mix, settings.size);
  }

  function pageCountFor(settings, count) { return plan(settings, slotsOf(settings, count)).pages.length; }

  // ---------------------------------------------------------------- book
  function build(settings, puzzles, version) {
    var slots = slotsOf(settings);
    var count = slots.length;
    var p = plan(settings, slots);
    var puzzlePage = new Array(count), solutionPage = new Array(count);
    p.pages.forEach(function (pg, idx) {
      if (pg.type === 'puzzles') for (var k = 0; k < pg.n; k++) puzzlePage[pg.first + k] = idx + 1;
      if (pg.type === 'solutions') for (k = 0; k < pg.n; k++) solutionPage[pg.first + k] = idx + 1;
    });
    var text = {
      title: T.clean(settings.title),
      subtitle: T.clean(S.subtitle(settings)),
      author: T.clean(settings.author),
      copyright: T.clean(settings.copyrightText, true),
      thanks: T.clean(settings.thanksText, true)
    };
    var mixed = S.isMixed(settings);
    var book = {
      version: version || 0,
      settings: settings,
      trim: p.trim,
      margins: p.margins,
      geo: p.geo,
      liveW: p.liveW,
      liveH: p.liveH,
      boxW: p.boxW,
      boxH: p.boxH,
      pages: p.pages,
      pageCount: p.pages.length,
      slots: slots,
      count: count,
      puzzles: puzzles || [],
      puzzlePage: puzzlePage,
      solutionPage: solutionPage,
      text: text,
      mixed: mixed,
      size: +settings.size,
      sections: sectionsOf(p.pages),
      titleFit: titleBlock(p.trim, p.boxW, text).fit
    };
    book.renderPage = function (i) { return renderPage(book, i); };
    book.pageKey = function (i) { return pageKey(book, i); };
    return book;
  }

  // Where each level's puzzles start, for the contents page.
  function sectionsOf(pages) {
    var out = [];
    pages.forEach(function (pg, idx) {
      if (pg.type !== 'puzzles') return;
      var last = out[out.length - 1];
      if (!last || last.level !== pg.level) out.push({ level: pg.level, page: idx + 1, from: pg.first + 1, to: pg.first + pg.n });
      else last.to = pg.first + pg.n;
    });
    return out;
  }

  function pageKey(book, i) {
    var pg = book.pages[i], ready = '';
    if (pg.type === 'puzzles' || pg.type === 'solutions') {
      for (var k = 0; k < pg.n; k++) {
        var pz = book.puzzles[pg.first + k];
        ready += pz ? pz.salt + 1 : 0; // the salt changes if a duplicate was replaced
      }
    }
    return book.version + ':' + i + ':' + ready;
  }

  function frameOf(book, i) {
    var number = i + 1, right = KDP.isRightPage(number), mg = book.margins;
    var x = right ? mg.inside : mg.outside;
    return {
      index: i,
      number: number,
      side: right ? 'right' : 'left',
      w: book.trim.w,
      h: book.trim.h,
      live: { x: x, y: mg.top, w: book.liveW, h: book.liveH },     // KDP safe area
      box: { x: x + INSET, y: mg.top + INSET, w: book.boxW, h: book.boxH }, // where content goes
      gutter: right ? { x: 0, w: mg.inside } : { x: book.trim.w - mg.inside, w: mg.inside },
      type: book.pages[i].type,
      commands: []
    };
  }

  function renderPage(book, i) {
    var page = frameOf(book, i), pg = book.pages[i], out = page.commands;
    switch (pg.type) {
      case 'title': drawTitle(book, page, out); break;
      case 'copyright': drawCopyright(book, page, out); break;
      case 'contents': drawContents(book, page, out); break;
      case 'howto': drawHowTo(book, page, out); break;
      case 'puzzles': drawPuzzles(book, page, pg, out); break;
      case 'solutions': drawSolutions(book, page, pg, out); break;
      case 'thanks': drawThanks(book, page, out); break;
      default: break; // blank padding page
    }
    var s = book.settings;
    var running = pg.type === 'puzzles' || pg.type === 'solutions';
    var headText = s.header === 'title' ? book.text.title
      : s.header === 'level' ? (pg.type === 'puzzles' ? S.LEVEL_LABEL[pg.level] + ' Puzzles' : 'Solutions') : '';
    if (running && headText) {
      var head = T.truncate(headText, HEADER.face, HEADER.size, page.box.w);
      out.push({
        t: 'text', x: page.box.x + (page.box.w - T.width(head, HEADER.face, HEADER.size)) / 2,
        y: page.box.y + T.ascent(HEADER.face, HEADER.size), text: head, face: HEADER.face, size: HEADER.size, ink: HEADER.ink
      });
    }
    var numbered = pg.type !== 'title' && pg.type !== 'copyright' && pg.type !== 'contents' && pg.type !== 'blank';
    if (numbered && s.pageNumbers) {
      var num = String(page.number);
      out.push({
        t: 'text', x: page.box.x + (page.box.w - T.width(num, FOOTER.face, FOOTER.size)) / 2,
        y: page.box.y + page.box.h - T.descent(FOOTER.face, FOOTER.size), text: num, face: FOOTER.face, size: FOOTER.size, ink: FOOTER.ink
      });
    }
    return page;
  }

  // ---------------------------------------------------------------- text helpers
  // Pushes centred or left-aligned lines starting with the first baseline at `y`.
  function lines(out, list, face, size, x, w, y, leading, align, ink) {
    list.forEach(function (line, k) {
      if (!line) return;
      var lx = align === 'center' ? x + (w - T.width(line, face, size)) / 2 : x;
      out.push({ t: 'text', x: lx, y: y + k * leading, text: line, face: face, size: size, ink: ink == null ? 1 : ink });
    });
  }

  // Bulleted paragraphs with a hanging indent. Returns the height used.
  function bullets(out, items, face, size, x, w, top, leading, gap, dry) {
    var indent = size * 1.25 / 72, y = top + T.ascent(face, size), used = 0;
    items.forEach(function (item, k) {
      var wrapped = T.wrap(item, face, size, w - indent);
      if (!dry) {
        out.push({ t: 'text', x: x, y: y, text: '•', face: face, size: size, ink: 1 });
        lines(out, wrapped, face, size, x + indent, w - indent, y, leading, 'left');
      }
      var h = (wrapped.length - 1) * leading + (k < items.length - 1 ? gap : 0);
      y += h + leading;
      used += h + leading;
    });
    return used - leading + T.ascent(face, size) + T.descent(face, size);
  }

  // ---------------------------------------------------------------- pages
  function titleBlock(trim, liveW, text) {
    var size = Math.max(30, Math.min(46, Math.round(trim.w * 5.2)));
    var title = T.fit(text.title || ' ', 'serifBold', size, Math.round(size * 0.6), liveW, 3, 1);
    var subSize = Math.max(13, Math.min(18, Math.round(trim.w * 2)));
    var sub = text.subtitle ? T.fit(text.subtitle, 'sans', subSize, Math.round(subSize * 0.75), liveW, 3, 0.5) : { lines: [], size: subSize, fits: true };
    return { title: title, sub: sub, fit: { title: title.fits, subtitle: sub.fits } };
  }

  function drawTitle(book, page, out) {
    var L = page.box, tb = titleBlock(book.trim, L.w, book.text);
    var tLead = tb.title.size * 1.14 / 72;
    var y = L.y + L.h * 0.27 + T.ascent('serifBold', tb.title.size);
    lines(out, tb.title.lines, 'serifBold', tb.title.size, L.x, L.w, y, tLead, 'center');
    y += (tb.title.lines.length - 1) * tLead + T.descent('serifBold', tb.title.size) + 0.28;
    var rule = Math.min(1.6, L.w * 0.4);
    out.push({ t: 'line', x1: L.x + (L.w - rule) / 2, y1: y, x2: L.x + (L.w + rule) / 2, y2: y, w: 1, ink: 1, cap: 'butt' });
    if (tb.sub.lines.length) {
      var sLead = tb.sub.size * 1.3 / 72;
      y += 0.28 + T.ascent('sans', tb.sub.size);
      lines(out, tb.sub.lines, 'sans', tb.sub.size, L.x, L.w, y, sLead, 'center');
    }
    if (book.text.author) {
      var aSize = Math.max(12, Math.min(17, Math.round(book.trim.w * 1.9)));
      var aLines = T.wrap(book.text.author, 'serif', aSize, L.w).slice(0, 2);
      var aLead = aSize * 1.3 / 72;
      var ay = L.y + L.h - 0.35 - (aLines.length - 1) * aLead - T.descent('serif', aSize);
      lines(out, aLines, 'serif', aSize, L.x, L.w, ay, aLead, 'center');
    }
  }

  function drawCopyright(book, page, out) {
    var L = page.box, year = new Date().getFullYear();
    var paras = [];
    if (book.text.author) paras.push('Copyright © ' + year + ' ' + book.text.author);
    if (book.text.copyright) paras.push(book.text.copyright);
    if (!paras.length) return;
    var src = paras.join('\n\n');
    // Shrink long notices rather than let them climb off the page.
    // A comfortable measure for centred lines.
    var w = Math.min(L.w, 4.6), size = 9.5, wrapped;
    for (; size >= 7.5; size -= 0.5) {
      wrapped = T.wrap(src, 'serif', size, w);
      if (wrapped.length * size * 1.45 / 72 <= L.h * 0.6) break;
    }
    size = Math.max(size, 7.5);
    // Centred on the page, both ways.
    var lead = size * 1.45 / 72;
    var blockH = (wrapped.length - 1) * lead + boxH('serif', size);
    var y = L.y + (L.h - blockH) / 2 + T.ascent('serif', size);
    lines(out, wrapped, 'serif', size, L.x + (L.w - w) / 2, w, y, lead, 'center');
  }

  function contentsRows(book) {
    var rows = [], find = function (type) {
      for (var i = 0; i < book.pages.length; i++) if (book.pages[i].type === type) return i + 1;
      return 0;
    };
    if (find('howto')) rows.push({ text: 'How to Play', page: find('howto') });
    book.sections.forEach(function (sec) {
      rows.push({ text: S.LEVEL_LABEL[sec.level] + ' Puzzles', note: sec.from + '–' + sec.to, page: sec.page });
    });
    rows.push({ text: 'Solutions', page: find('solutions') });
    if (find('thanks')) rows.push({ text: 'Thank You', page: find('thanks') });
    return rows;
  }

  function drawContents(book, page, out) {
    var L = page.box, hs = Math.max(22, Math.min(30, Math.round(book.trim.w * 3.2)));
    var y = L.y + L.h * 0.12 + T.ascent('serifBold', hs);
    var head = 'Contents';
    out.push({ t: 'text', x: L.x + (L.w - T.width(head, 'serifBold', hs)) / 2, y: y, text: head, face: 'serifBold', size: hs, ink: 1 });
    var w = Math.min(L.w, 4.8), x = L.x + (L.w - w) / 2, size = book.trim.w < 7 ? 11.5 : 13;
    var lead = size * 2.1 / 72, dot = T.width('. ', 'serif', size);
    y += T.descent('serifBold', hs) + 0.45 + T.ascent('serif', size);
    contentsRows(book).forEach(function (row) {
      var num = String(row.page), numW = T.width(num, 'serif', size);
      out.push({ t: 'text', x: x, y: y, text: row.text, face: 'serif', size: size, ink: 1 });
      var end = x + T.width(row.text, 'serif', size);
      if (row.note) {
        // SVG drops a leading space, so the gap is a position, not a character.
        var note = '(' + row.note + ')', ns = size - 2;
        end += T.width(' ', 'serif', size);
        out.push({ t: 'text', x: end, y: y, text: note, face: 'serif', size: ns, ink: 0.7 });
        end += T.width(note, 'serif', ns);
      }
      out.push({ t: 'text', x: x + w - numW, y: y, text: num, face: 'serif', size: size, ink: 1 });
      var dots = Math.floor((x + w - numW - end - 0.2) / dot);
      if (dots > 2) {
        var leader = new Array(dots + 1).join('. ').trim(), lw = T.width(leader, 'serif', size);
        out.push({ t: 'text', x: x + w - numW - 0.1 - lw, y: y, text: leader, face: 'serif', size: size, ink: 0.55 });
      }
      y += lead;
    });
  }

  function drawHowTo(book, page, out) {
    var L = page.box, band = bodyBand(book.settings), small = L.w < 5.5;
    var tips = book.mixed ? TIPS.concat([TIP_MIXED]) : TIPS;
    var rules = rulesFor(book.size, book.settings.variant), ex = exampleFor(book.size, book.settings.variant);
    var bodyTop = L.y + band.top, bodyH = L.h - band.top - band.bottom;
    // Shrink the text a little on small pages until the example grids are comfortably big.
    var scale = 1, lay;
    for (var tries = 0; tries < 5; tries++) {
      lay = howToSizes(scale, small, L.w, bodyH, tips, rules);
      if (lay.grid / book.size * 72 >= 19 || scale <= 0.8) break;
      scale -= 0.05;
    }
    var y = bodyTop;
    var hs = lay.heading;
    out.push({ t: 'text', x: L.x, y: y + T.ascent('serifBold', hs), text: 'How to Play', face: 'serifBold', size: hs, ink: 1 });
    y += boxH('serifBold', hs) + 0.14;
    bullets(out, rules, 'serif', lay.body, L.x, L.w, y, lay.bodyLead, 0.05);
    y += lay.rulesH + 0.24;
    var g = lay.grid, gap = lay.gridGap, gx = L.x + (L.w - (g * 2 + gap)) / 2;
    var cap = 9 * scale;
    [['Example puzzle', false], ['Its solution', true]].forEach(function (pair, k) {
      var x = gx + k * (g + gap);
      var w = T.width(pair[0], 'sansBold', cap);
      out.push({ t: 'text', x: x + (g - w) / 2, y: y + T.ascent('sansBold', cap), text: pair[0], face: 'sansBold', size: cap, ink: 1 });
      if (ex) G.jigsaw(out, ex, x, y + boxH('sansBold', cap) + 0.07, g, { digits: pair[1], highlight: 0 });
    });
    y += boxH('sansBold', cap) + 0.07 + g + 0.1;
    var nl = T.wrap(REGION_NOTE, 'serif', lay.note, L.w);
    lines(out, nl, 'serif', lay.note, L.x, L.w, y + T.ascent('serif', lay.note), lay.note * 1.3 / 72, 'center', 0.8);
    y += lay.noteH + 0.24;
    var th = lay.tipHead;
    out.push({ t: 'text', x: L.x, y: y + T.ascent('serifBold', th), text: 'Tips', face: 'serifBold', size: th, ink: 1 });
    y += boxH('serifBold', th) + 0.08;
    bullets(out, tips, 'serif', lay.tip, L.x, L.w, y, lay.tipLead, 0.05);
  }

  function howToSizes(scale, small, w, h, tips, rules) {
    var r = {
      heading: (small ? 20 : 24) * scale,
      body: Math.max(8, (small ? 10 : 11) * scale),
      tipHead: (small ? 12 : 13) * scale,
      tip: Math.max(8, (small ? 9.5 : 10.5) * scale),
      gridGap: small ? 0.25 : 0.4
    };
    r.bodyLead = r.body * 1.38 / 72;
    r.tipLead = r.tip * 1.38 / 72;
    r.rulesH = bullets(null, rules, 'serif', r.body, 0, w, 0, r.bodyLead, 0.05, true);
    r.note = Math.max(8, 9 * scale);
    r.noteH = (T.wrap(REGION_NOTE, 'serif', r.note, w).length - 1) * r.note * 1.3 / 72 + boxH('serif', r.note);
    r.tipsH = bullets(null, tips, 'serif', r.tip, 0, w, 0, r.tipLead, 0.05, true);
    var fixed = boxH('serifBold', r.heading) + 0.14 + r.rulesH + 0.24 + boxH('sansBold', 9 * scale) + 0.07 + 0.1 + r.noteH + 0.24 +
      boxH('serifBold', r.tipHead) + 0.08 + r.tipsH;
    r.grid = Math.max(0, Math.min((w - r.gridGap - G.STROKE_PAD) / 2, h - fixed - G.STROKE_PAD, 3.3));
    return r;
  }

  function drawPuzzles(book, page, pg, out) {
    var geo = book.geo.puzzle, L = page.box, st = book.settings;
    for (var k = 0; k < pg.n; k++) {
      var idx = pg.first + k, slot = geo.slots[k], pz = book.puzzles[idx];
      var gx = L.x + slot.x, gy = L.y + slot.y, cx = L.x + slot.cx;
      var level = S.LEVEL_LABEL[book.slots[idx].level], ls = geo.txt.label;
      if (geo.badge) {
        // A dark disc with the puzzle number in white and the level: beside the grid's top
        // left corner with the level underneath, or above the grid with the level after it.
        var r = geo.badgeR, num = String(idx + 1), tag = level.toUpperCase(), ts = tagSize(ls), dcx, dcy, tx, ty;
        if (geo.badge === 'side') {
          dcx = gx - geo.sideW / 2 - 0.02; dcy = gy + r;
          tx = dcx - T.width(tag, 'sans', ts) / 2; ty = dcy + r + 0.06 + T.capHeight('sans', ts);
        } else {
          dcx = gx + r; dcy = gy - LABEL_GAP - r;
          tx = dcx + r + 0.08; ty = dcy + T.capHeight('sans', ts) / 2;
        }
        out.push({ t: 'disc', cx: dcx, cy: dcy, r: r, fill: BADGE_INK });
        out.push({ t: 'text', x: dcx - T.width(num, 'sansBold', ls) / 2, y: dcy + T.capHeight('sansBold', ls) / 2, text: num, face: 'sansBold', size: ls, ink: 0 });
        out.push({ t: 'text', x: tx, y: ty, text: tag, face: 'sans', size: ts, ink: 0.85 });
      } else {
        var label = 'Puzzle ' + (idx + 1) + (book.mixed ? ' · ' + level : '');
        out.push({
          t: 'text', x: cx - T.width(label, 'sansBold', ls) / 2, y: gy - LABEL_GAP - T.descent('sansBold', ls),
          text: label, face: 'sansBold', size: ls, ink: 1
        });
      }
      if (pz) G.jigsaw(out, pz, gx, gy, geo.grid, { shade: st.shade });
      else G.placeholder(out, gx, gy, geo.grid, book.size, 'puzzle');
      if (st.solutionRef) {
        var ref = 'Solution on page ' + book.solutionPage[idx], rs = geo.txt.ref;
        out.push({
          t: 'text', x: cx - T.width(ref, 'sans', rs) / 2, y: gy + geo.grid + REF_GAP + T.ascent('sans', rs),
          text: ref, face: 'sans', size: rs, ink: 0.8
        });
      }
    }
  }

  function drawSolutions(book, page, pg, out) {
    var geo = book.geo.solution, L = page.box, top = L.y + geo.top;
    if (pg.heading) {
      out.push({ t: 'text', x: L.x, y: top + T.ascent('serifBold', SOL.heading), text: 'Solutions', face: 'serifBold', size: SOL.heading, ink: 1 });
      top += geo.headingH;
    }
    for (var k = 0; k < pg.n; k++) {
      var idx = pg.first + k, col = k % geo.cols, row = Math.floor(k / geo.cols);
      var x = L.x + geo.x0 + col * (geo.grid + SOL.colGap);
      var y = top + row * geo.rowH;
      var label = 'Puzzle ' + (idx + 1);
      out.push({ t: 'text', x: x, y: y + T.ascent(SOL.labelFace, SOL.label), text: label, face: SOL.labelFace, size: SOL.label, ink: 1 });
      var pz = book.puzzles[idx];
      if (pz) G.solution(out, pz, x, y + geo.labelH, geo.grid, { shade: book.settings.shade });
      else G.placeholder(out, x, y + geo.labelH, geo.grid, book.size, 'solution');
    }
  }

  function drawThanks(book, page, out) {
    var L = page.box, hs = Math.max(20, Math.min(28, Math.round(book.trim.w * 3)));
    var y = L.y + L.h * 0.26 + T.ascent('serifBold', hs);
    var head = 'Thank You!';
    out.push({ t: 'text', x: L.x + (L.w - T.width(head, 'serifBold', hs)) / 2, y: y, text: head, face: 'serifBold', size: hs, ink: 1 });
    if (!book.text.thanks) return;
    var w = Math.min(L.w, 4.8), size = 12, wrapped;
    var room = L.y + L.h - FOOTER.band - (y + T.descent('serifBold', hs) + 0.35);
    for (; size >= 8; size -= 0.5) {
      wrapped = T.wrap(book.text.thanks, 'serif', size, w);
      if ((wrapped.length - 1) * size * 1.5 / 72 + boxH('serif', size) <= room) break;
    }
    size = Math.max(size, 8);
    lines(out, wrapped, 'serif', size, L.x + (L.w - w) / 2, w, y + T.descent('serifBold', hs) + 0.35 + T.ascent('serif', size), size * 1.5 / 72, 'center');
  }

  // ---------------------------------------------------------------- options
  // Which puzzles-per-page choices leave cells big enough to write in.
  function perPageOptions(settings) {
    return S.PER_PAGE.map(function (n) {
      var s = Object.assign({}, settings, { perPage: n });
      var p = plan(s, slotsOf(s));
      var cellPt = p.geo.puzzle.cellPt;
      return { n: n, ok: cellPt >= KDP.MIN_CELL_PT - 1e-9, cellPt: cellPt, pages: p.pages.length };
    });
  }

  KS.Layout = {
    exampleFor: exampleFor,
    contentsRows: contentsRows,
    build: build,
    pageCountFor: pageCountFor,
    perPageOptions: perPageOptions,
    resolveMargins: resolveMargins
  };
})();
