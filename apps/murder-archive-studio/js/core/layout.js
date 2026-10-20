/*
 * Page layout to KDP standards: the chosen trim size, no bleed, mirrored margins that grow with
 * the page count. Produces pages made of simple drawing items in points (origin top-left):
 *   { t:'text', x, y (baseline), size, font, str }
 *   { t:'line', x1, y1, x2, y2, w, gray? }        gray = share of black ink (1 = black)
 *   { t:'rect', x, y, w, h, lw } outline, or { t:'rect', x, y, w, h, fill: gray } filled
 * The preview (SVG) and the PDF draw exactly these items, so they match line for line.
 * The archive prints as a table (one record per row) or, for short records such as names or
 * coordinates, as a grid with numbered lines and columns.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var U = LK.util, KDP = LK.kdp, R = LK.register;

  var PT = 72;
  var BAND_GRAY = 0.12;     // row bands in the register (KDP: fills of 10% or more print reliably)
  var RULE_GRAY = 0.55;     // writing lines on the notes pages
  var F;                    // fonts, loaded on first use

  function r2(v) { return Math.round(v * 100) / 100; }
  function fmtN(n) { return n.toLocaleString('en-US'); }
  function pad(v, n) { var s = String(v); while (s.length < n) s = '0' + s; return s; }

  // ---------- pages ----------
  function Page(ctx, num, section, label) {
    this.num = num; this.section = section; this.label = label;
    this.side = num % 2 === 1 ? 'right' : 'left';
    var inside = ctx.m.inside * PT, outside = ctx.m.outside * PT;
    this.W = ctx.W; this.H = ctx.H;
    this.x0 = this.side === 'right' ? inside : outside;
    this.x1 = ctx.W - (this.side === 'right' ? outside : inside);
    this.y0 = ctx.m.top * PT;
    this.y1 = ctx.H - ctx.m.bottom * PT;
    this.cx = (this.x0 + this.x1) / 2;
    this.width = this.x1 - this.x0;
    this.bodyBottom = this.y1 - ctx.sizes.folio * 2.4;
    this.items = [];
    this.meta = {};
    this.folio = true;
  }
  Page.prototype.text = function (str, x, y, size, font) {
    var s = LK.metrics.printable(String(str), F[font]);
    if (s) this.items.push({ t: 'text', x: r2(x), y: r2(y), size: size, font: font, str: s });
    return F[font].width(s, size);
  };
  Page.prototype.center = function (str, y, size, font, cx) {
    var s = LK.metrics.printable(String(str), F[font]);
    var w = F[font].width(s, size);
    this.text(s, (cx == null ? this.cx : cx) - w / 2, y, size, font);
    return w;
  };
  Page.prototype.right = function (str, xr, y, size, font) {
    var s = LK.metrics.printable(String(str), F[font]);
    var w = F[font].width(s, size);
    this.text(s, xr - w, y, size, font);
    return w;
  };
  // Letterspaced text: each character placed on its own, so SVG and PDF agree exactly.
  Page.prototype.spaced = function (str, x, y, size, font, ls, align) {
    var s = LK.metrics.printable(String(str), F[font]);
    var total = F[font].width(s, size, ls);
    if (align === 'center') x -= total / 2;
    else if (align === 'right') x -= total;
    for (var i = 0; i < s.length; i++) {
      if (s[i] !== ' ') this.items.push({ t: 'text', x: r2(x), y: r2(y), size: size, font: font, str: s[i] });
      x += F[font].width(s[i], size) + ls;
    }
    return total;
  };
  Page.prototype.line = function (x1, y1, x2, y2, w, gray) {
    var it = { t: 'line', x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), w: Math.max(KDP.MIN_LINE_PT, w || KDP.MIN_LINE_PT) };
    if (gray != null && gray < 1) it.gray = gray;
    this.items.push(it);
  };
  Page.prototype.rect = function (x, y, w, h, lw) {
    this.items.push({ t: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), lw: Math.max(KDP.MIN_LINE_PT, lw || KDP.MIN_LINE_PT) });
  };
  Page.prototype.fill = function (x, y, w, h, gray) {
    this.items.push({ t: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), fill: gray == null ? 1 : gray });
  };
  // A dashed line made of short solid lines, so it prints the same everywhere (cut lines).
  Page.prototype.dash = function (x1, y1, x2, y2, w, gray, on, off) {
    on = on || 4; off = off || 3;
    var len = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
    if (!len) return;
    var ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    for (var d = 0; d < len; d += on + off) {
      var e = Math.min(len, d + on);
      this.line(x1 + ux * d, y1 + uy * d, x1 + ux * e, y1 + uy * e, w, gray);
    }
  };

  function addPage(ctx, section, label) {
    var pg = new Page(ctx, ctx.pages.length + 1, section, label);
    ctx.pages.push(pg);
    return pg;
  }

  // ---------- text helpers ----------
  function wrap(str, size, font, maxW, firstIndent) {
    var words = String(str).split(/\s+/).filter(Boolean);
    var lines = [], cur = [], curW = 0, sw = F[font].width(' ', size);
    var limit = maxW - (firstIndent || 0);
    words.forEach(function (w) {
      var ww = F[font].width(w, size);
      if (cur.length && curW + sw + ww > limit) {
        lines.push(cur); cur = [w]; curW = ww; limit = maxW;
      } else { curW += (cur.length ? sw : 0) + ww; cur.push(w); }
    });
    if (cur.length) lines.push(cur);
    return lines;
  }

  function wrapBalanced(str, size, font, maxW) {
    var lines = wrap(str, size, font, maxW).map(function (l) { return l.join(' '); });
    if (lines.length !== 2) return lines;
    var words = String(str).split(/\s+/).filter(Boolean);
    var best = lines, bestDiff = Infinity;
    for (var k = 1; k < words.length; k++) {
      var a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
      var wa = F[font].width(a, size), wb = F[font].width(b, size);
      if (wa > maxW || wb > maxW) continue;
      if (Math.abs(wa - wb) < bestDiff) { bestDiff = Math.abs(wa - wb); best = [a, b]; }
    }
    return best;
  }

  // A line of words, justified to width unless it is the last line of its paragraph.
  function setLine(pg, words, x, baseline, width, size, font, justify) {
    if (!justify || words.length < 2) { pg.text(words.join(' '), x, baseline, size, font); return; }
    var total = 0;
    words.forEach(function (w) { total += F[font].width(w, size); });
    var gap = (width - total) / (words.length - 1);
    var sw = F[font].width(' ', size);
    if (gap > sw * 2.6) { pg.text(words.join(' '), x, baseline, size, font); return; }
    var cx = x;
    words.forEach(function (w) { pg.text(w, cx, baseline, size, font); cx += F[font].width(w, size) + gap; });
  }

  // ---------- flowing text across pages ----------
  function Flow(ctx, section, label) { this.ctx = ctx; this.section = section; this.label = label; this.page = null; this.y = 0; }
  Flow.prototype.newPage = function () { this.page = addPage(this.ctx, this.section, this.label); this.y = this.page.y0; return this.page; };
  Flow.prototype.need = function (h) { if (!this.page || this.y + h > this.page.bodyBottom) this.newPage(); };
  Flow.prototype.fits = function (h) { return this.page && this.y + h <= this.page.bodyBottom; };

  function baselineIn(top, size, leading) { return top + (leading - size) / 2 + size * 0.8; }

  /*
   * Paragraphs of body text. opts: { size, leading, font, indent (first-line indent, not on the first
   * paragraph), gap (space between paragraphs), justify, center }
   */
  function paragraphs(flow, paras, opts) {
    var size = opts.size, lead = opts.leading, font = opts.font || 'serif';
    paras.forEach(function (p, pi) {
      if (pi > 0 && opts.gap) flow.y += opts.gap;
      var indent = pi > 0 && opts.indent ? opts.indent : 0;
      flow.need(lead * Math.min(2, 1 + (p.length > 80 ? 1 : 0)));
      var lines = wrap(p, size, font, flow.page.width * (opts.narrow || 1), indent);
      lines.forEach(function (words, li) {
        flow.need(lead);
        if (opts.center) { flow.page.center(words.join(' '), baselineIn(flow.y, size, lead), size, font); flow.y += lead; return; }
        var x = flow.page.x0 + (li === 0 ? indent : 0);
        var w = flow.page.width - (li === 0 ? indent : 0);
        setLine(flow.page, words, x, baselineIn(flow.y, size, lead), w, size, font, opts.justify !== false && li < lines.length - 1);
        flow.y += lead;
      });
    });
  }

  function ornament(pg, cx, cy, half) {
    half = half || 40;
    pg.line(cx - half, cy, cx - 8, cy, 0.75);
    pg.line(cx + 8, cy, cx + half, cy, 0.75);
    pg.fill(cx - 2.6, cy - 2.6, 5.2, 5.2, 1);
  }

  // Section opener at the top of a new page: a small spaced kicker, the title and an ornament.
  function opener(flow, kicker, title) {
    var ctx = flow.ctx, pg = flow.newPage();
    var y = pg.y0 + ctx.sizes.body * 2.2;
    pg.spaced(kicker.toUpperCase(), pg.cx, y, ctx.sizes.kicker, 'sansBold', 1.6, 'center');
    y += ctx.sizes.h1 * 1.5;
    wrapBalanced(title, ctx.sizes.h1, 'serifBold', pg.width * 0.9).forEach(function (l) {
      pg.center(l, y, ctx.sizes.h1, 'serifBold');
      y += ctx.sizes.h1 * 1.2;
    });
    ornament(pg, pg.cx, y - ctx.sizes.h1 * 0.35, 36);
    flow.y = y + ctx.sizes.body * 0.9;
    return pg;
  }

  function placeholder(pg, title, note) {
    pg.meta.placeholder = { title: title, note: note };
  }

  // A small spaced heading inside a flow.
  function subhead(flow, title) {
    var s = flow.ctx.sizes;
    flow.y += s.body * 0.6;
    flow.need(s.lead * 3);
    flow.page.spaced(title.toUpperCase(), flow.page.x0, baselineIn(flow.y, s.kicker, s.lead), s.kicker, 'sansBold', 1.2);
    flow.y += s.lead;
  }

  // Bullets or numbered steps. "Term: explanation" items get a bold term.
  function bullets(flow, items, numbered) {
    var s = flow.ctx.sizes;
    items.forEach(function (it, i) {
      var label = numbered ? (i + 1) + '.' : '•';
      var ind = s.body * 1.25, w = flow.page ? flow.page.width - ind : 0;
      var m = !numbered && /^([^:]{2,24}):\s(.*)$/.exec(it);
      var term = m ? m[1] + ':' : '', rest = m ? m[2] : it;
      var termW = term ? F.serifBold.width(term, s.body) + F.serif.width(' ', s.body) : 0;
      flow.need(s.lead);
      w = flow.page.width - ind;
      var lines = wrap(rest, s.body, 'serif', w, termW);
      flow.need(s.lead * Math.min(2, lines.length));
      flow.page.text(label, flow.page.x0, baselineIn(flow.y, s.body, s.lead), s.body, numbered ? 'serifBold' : 'serif');
      lines.forEach(function (words, li) {
        flow.need(s.lead);
        var base = baselineIn(flow.y, s.body, s.lead);
        var x = flow.page.x0 + ind;
        if (li === 0 && term) { flow.page.text(term, x, base, s.body, 'serifBold'); x += termW; }
        setLine(flow.page, words, x, base, w - (li === 0 ? termW : 0), s.body, 'serif', li < lines.length - 1);
        flow.y += s.lead;
      });
      flow.y += s.body * 0.25;
    });
  }

  function list(arr) { return arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' or ' + arr[arr.length - 1]; }
  function andList(arr) { return arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1]; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- the archive as a table ----------
  function tableColumns(ctx, rows, size) {
    var cols = ctx.columns;
    var hs = Math.max(KDP.MIN_FONT_PT, size * 0.78);
    var font = 'sans', hfont = 'sansBold';
    var widths = cols.map(function (c) { return F[hfont].width(c.head, hs, 0.4); });
    rows.forEach(function (row) {
      cols.forEach(function (c, i) { var w = F[font].width(row[c.key], size); if (w > widths[i]) widths[i] = w; });
    });
    var box = size * 0.62;
    var gap = size * 0.95;
    var total = box + gap + widths.reduce(function (a, b) { return a + b; }, 0) + gap * (cols.length - 1);
    return { cols: cols, widths: widths, box: box, gap: gap, total: total, size: size, hs: hs };
  }

  function fitTable(ctx, rows, width) {
    var want = ctx.sizes.reg;
    for (var s = want; s >= KDP.MIN_FONT_PT - 0.001; s -= 0.25) {
      var t = tableColumns(ctx, rows, s);
      if (t.total <= width) {
        // spread the spare room over the gaps, but keep the table compact
        var spare = width - t.total;
        var add = Math.min(spare / t.cols.length, s * 1.4);
        t.gap += add;
        t.total += add * t.cols.length;
        t.shrunk = s < want;
        return t;
      }
    }
    var tiny = tableColumns(ctx, rows, KDP.MIN_FONT_PT);
    tiny.overflow = true;
    return tiny;
  }

  // Column x positions for a table that starts at x.
  function columnX(t, x) {
    var xs = [], cur = x + t.box + t.gap;
    t.widths.forEach(function (w, i) { xs.push(cur); cur += w + (i < t.widths.length - 1 ? t.gap : 0); });
    return xs;
  }

  function drawHeader(pg, t, x, y) {
    var xs = columnX(t, x);
    t.cols.forEach(function (c, i) {
      if (c.align === 'right') pg.spaced(c.head, xs[i] + t.widths[i], y, t.hs, 'sansBold', 0.4, 'right');
      else pg.spaced(c.head, xs[i], y, t.hs, 'sansBold', 0.4);
    });
  }

  function drawRow(pg, t, x, top, rowH, row) {
    var xs = columnX(t, x);
    var base = top + rowH / 2 + t.size * 0.34;
    var bs = t.box;
    pg.rect(x, top + (rowH - bs) / 2, bs, bs, 0.75);
    t.cols.forEach(function (c, i) {
      if (c.align === 'right') pg.right(row[c.key], xs[i] + t.widths[i], base, t.size, 'sans');
      else pg.text(row[c.key], xs[i], base, t.size, 'sans');
    });
  }

  // ---------- the archive as a grid ----------
  // Short records (names, coordinates) side by side, with line numbers down the left and column
  // numbers along the top, so every record has an address: page, line and column.
  function fitGrid(ctx, width) {
    var want = ctx.sizes.reg, w1 = 0;
    ctx.cells.forEach(function (c) { var w = F.sans.width(c, 1); if (w > w1) w1 = w; });
    var num = Math.max(KDP.MIN_FONT_PT, ctx.sizes.small * 0.82);
    var numW = F.sansBold.width('88', num) + want * 0.9;
    for (var s = want; s >= KDP.MIN_FONT_PT - 0.001; s -= 0.25) {
      var box = s * 0.62, inner = s * 0.55, gap = s * 1.3;
      var cellW = box + inner + w1 * s;
      var cols = Math.min(9, Math.floor((width - numW + gap) / (cellW + gap)));
      if (cols >= 2 || s <= KDP.MIN_FONT_PT) {
        if (cols < 1) break;
        // spread the room left over between the columns
        gap = cols > 1 ? Math.min(gap * 3, (width - numW - cols * cellW) / (cols - 1)) : gap;
        return { size: s, box: box, inner: inner, cellW: cellW, gap: gap, cols: cols, numW: numW, num: num, shrunk: s < want,
          total: numW + cols * cellW + (cols - 1) * gap };
      }
    }
    return { overflow: true, size: KDP.MIN_FONT_PT, box: 4, inner: 4, cellW: width, gap: 0, cols: 1, numW: numW, num: num, total: width };
  }

  // ---------- the archive section ----------
  function archiveSection(ctx) {
    var cs = ctx.cs, t = ctx.type, recs = cs.records;
    var probe = new Page(ctx, 1, 'register', '');
    ctx.recPage = new Array(recs.length);
    ctx.recPos = new Array(recs.length);
    var spec;
    if (ctx.grid) {
      spec = ctx.gridSpec = fitGrid(ctx, probe.width - 6);
    } else {
      spec = ctx.registerTable = fitTable(ctx, ctx.rows, probe.width - 6); // room for the row bands either side
    }
    var noun = t.archive.name;
    if (spec.overflow) ctx.problems.push({ level: 'error', text: 'The ' + noun + ' does not fit the page width. Choose a larger trim size or regular print.' });
    else if (spec.shrunk) ctx.problems.push({ level: 'warning', text: 'The ' + noun + ' text was reduced to ' + spec.size + ' pt so the columns fit the page.' });
    var pagesFor = ctx.grid ? gridPages : registerPages;
    if (ctx.chaptered) {
      var first = null;
      ctx.chapters.forEach(function (ch) {
        var op = chapterOpener(ctx, ch);
        if (!first) first = op;
        pagesFor(ctx, ch.idx, ch);
      });
      return first;
    }
    return pagesFor(ctx, recs.map(function (r, i) { return i; }), null);
  }

  // A chapter of the archive: the mood, the chapter number and title, its span and record count.
  function chapterOpener(ctx, ch) {
    var s = ctx.sizes, u = ctx.type.unit, pg = addPage(ctx, 'register', 'Chapter ' + ch.roman);
    var y = pg.y0 + (pg.bodyBottom - pg.y0) * 0.3;
    wrap(ch.mood, s.body * 1.05, 'serif', pg.width * 0.85).forEach(function (words) {
      pg.center(words.join(' '), y, s.body * 1.05, 'serif'); y += s.lead;
    });
    y += s.h1 * 1.1;
    pg.spaced('CHAPTER ' + ch.roman, pg.cx, y, s.h1 * 0.62, 'sansBold', 3, 'center');
    y += s.h1 * 1.45;
    wrapBalanced(ch.title.toUpperCase(), s.h1 * 1.1, 'serifBold', pg.width * 0.9).forEach(function (l) {
      pg.center(l, y, s.h1 * 1.1, 'serifBold'); y += s.h1 * 1.3;
    });
    ornament(pg, pg.cx, y - s.h1 * 0.4, 46);
    y += s.body * 1.6;
    var count = fmtN(ch.idx.length) + ' ' + (ch.idx.length === 1 ? u.one : u.many);
    wrap(ch.sub && ch.sub !== ch.title ? ch.sub + '   ·   ' + count : count, s.body, 'sans', pg.width * 0.9).forEach(function (words) {
      pg.center(words.join(' '), y, s.body, 'sans'); y += s.lead;
    });
    y += s.lead * 0.2;
    wrap(ch.note, s.small, 'serif', pg.width * 0.8).forEach(function (words) {
      pg.center(words.join(' '), y, s.small, 'serif'); y += s.small * 1.5;
    });
    return pg;
  }

  // The running head of an archive page: the range of records and the archive or chapter name.
  function runningHead(ctx, pg, range, ch) {
    var small = ctx.sizes.small, headY = pg.y0 + small;
    var label = ctx.type.archive.title.toUpperCase().replace(/^THE /, '');
    if (ch) {
      label = 'CHAPTER ' + ch.roman + '  ·  ' + ch.title.toUpperCase();
      if (F.sansBold.width(label, small * 0.92, 1.2) + F.sans.width(range, small) + small * 2 > pg.width) label = 'CHAPTER ' + ch.roman;
    }
    if (pg.side === 'left') {
      if (range) pg.text(range, pg.x0, headY, small, 'sans');
      pg.spaced(label, pg.x1, headY, small * 0.92, 'sansBold', 1.2, 'right');
    } else {
      pg.spaced(label, pg.x0, headY, small * 0.92, 'sansBold', 1.2);
      if (range) pg.right(range, pg.x1, headY, small, 'sans');
    }
    var ruleY = headY + small * 0.55;
    pg.line(pg.x0, ruleY, pg.x1, ruleY, 0.75);
    return ruleY;
  }

  // Table pages for a list of record indexes. ch: the chapter, or null for one long list.
  function registerPages(ctx, list, ch) {
    var cs = ctx.cs, recs = cs.records, t = ctx.registerTable;
    var rowH = t.size * 1.5;
    var hs = t.hs, i = 0, first = null;
    var label = ch ? 'Chapter ' + ch.roman : ctx.type.archive.title.replace(/^The /, '');
    while (i < list.length) {
      var pg = addPage(ctx, 'register', label);
      if (!first) first = pg;
      var x = pg.x0 + (pg.width - t.total) / 2;
      var ruleY = pg.y0 + ctx.sizes.small * 1.55;
      var colY = ruleY + hs * 1.75;
      var top = colY + hs * 0.65;
      var rows = Math.floor((pg.bodyBottom - top) / rowH);
      var end = Math.min(list.length, i + rows);
      runningHead(ctx, pg, ctx.type.rangeText(recs[list[i]], recs[list[end - 1]], cs), ch);
      drawHeader(pg, t, x, colY);
      pg.line(x, top - 1.2, x + t.total, top - 1.2, 1);
      for (var r = 0; r < end - i; r++) {
        var rowTop = top + r * rowH;
        if (Math.floor(r / 5) % 2 === 1) pg.fill(x - 2, rowTop, t.total + 4, rowH, BAND_GRAY);
      }
      for (var r2_ = 0; r2_ < end - i; r2_++) {
        var idx = list[i + r2_], rt = top + r2_ * rowH;
        drawRow(pg, t, x, rt, rowH, ctx.rows[idx]);
        ctx.recPage[idx] = pg.num;
        ctx.recPos[idx] = { page: pg.num, line: r2_ + 1, col: 1 };
        if (idx === cs.killerIndex) pg.meta.killerRow = { x: x - 3, y: rt, w: t.total + 6, h: rowH };
      }
      pg.line(x, top + (end - i) * rowH + 1, x + t.total, top + (end - i) * rowH + 1, 0.75);
      pg.meta.range = [i, end - 1];
      i = end;
    }
    return first;
  }

  // Grid pages for a list of record indexes, read down the columns (names) or along the lines.
  function gridPages(ctx, list, ch) {
    var cs = ctx.cs, recs = cs.records, g = ctx.gridSpec, s = ctx.sizes;
    var rowH = g.size * 1.5, i = 0, first = null;
    var byCols = ctx.type.gridOrder === 'columns';
    var label = ch ? 'Chapter ' + ch.roman : ctx.type.archive.title.replace(/^The /, '');
    while (i < list.length) {
      var pg = addPage(ctx, 'register', label);
      if (!first) first = pg;
      var x = pg.x0 + (pg.width - g.total) / 2;
      var ruleY = pg.y0 + s.small * 1.55;
      var colY = ruleY + g.num * 1.9;
      var top = colY + g.num * 0.75;
      var lines = Math.floor((pg.bodyBottom - top) / rowH);
      var per = lines * g.cols;
      var end = Math.min(list.length, i + per), n = end - i;
      // a part-filled last page keeps its columns even
      var used = byCols ? Math.ceil(n / g.cols) : Math.ceil(n / g.cols);
      runningHead(ctx, pg, ctx.type.rangeText(recs[list[i]], recs[list[end - 1]], cs), ch);
      var cx0 = x + g.numW;
      for (var c = 0; c < g.cols; c++) {
        pg.center(String(c + 1), colY, g.num, 'sansBold', cx0 + c * (g.cellW + g.gap) + g.box / 2);
      }
      pg.line(cx0 - 2, top - 1.2, x + g.total, top - 1.2, 1);
      for (var l = 0; l < used; l++) {
        var lt = top + l * rowH;
        if (Math.floor(l / 5) % 2 === 1) pg.fill(x - 2, lt, g.total + 4, rowH, BAND_GRAY);
        pg.right(String(l + 1), x + g.numW - g.size * 0.9, lt + rowH / 2 + g.num * 0.34, g.num, 'sansBold');
      }
      for (var k = 0; k < n; k++) {
        var line = byCols ? k % used : Math.floor(k / g.cols);
        var col = byCols ? Math.floor(k / used) : k % g.cols;
        var idx = list[i + k];
        var cx = cx0 + col * (g.cellW + g.gap), ct = top + line * rowH;
        pg.rect(cx, ct + (rowH - g.box) / 2, g.box, g.box, 0.75);
        pg.text(ctx.cells[idx], cx + g.box + g.inner, ct + rowH / 2 + g.size * 0.34, g.size, 'sans');
        ctx.recPage[idx] = pg.num;
        ctx.recPos[idx] = { page: pg.num, line: line + 1, col: col + 1 };
        if (idx === cs.killerIndex) pg.meta.killerRow = { x: cx - 2, y: ct, w: g.cellW + 4, h: rowH };
      }
      pg.line(cx0 - 2, top + used * rowH + 1, x + g.total, top + used * rowH + 1, 0.75);
      pg.meta.range = [i, end - 1];
      i = end;
    }
    return first;
  }

  // ---------- front matter ----------
  function tagline(ctx) {
    var t = ctx.type, who = t.target.who.replace(/^the /, '').toUpperCase();
    return fmtN(ctx.cs.records.length) + ' ' + t.unit.many.toUpperCase() + '  ·  ' + ctx.cs.clues.length + ' CLUES  ·  ONE ' + who;
  }

  function titlePage(ctx) {
    var pg = addPage(ctx, 'front', 'Title page');
    pg.folio = false;
    var s = ctx.sizes, title = ctx.title || 'Your Book Title';
    var y = pg.y0 + (pg.y1 - pg.y0) * 0.24;
    var ts = s.title;
    var lines = wrapBalanced(title, ts, 'serifBold', pg.width * 0.92);
    while (lines.length > 3 && ts > 18) { ts -= 1; lines = wrapBalanced(title, ts, 'serifBold', pg.width * 0.92); }
    lines.forEach(function (l) { pg.center(l, y, ts, 'serifBold'); y += ts * 1.18; });
    y += s.body * 0.4;
    ornament(pg, pg.cx, y, 46);
    y += s.body * 2.2;
    if (ctx.subtitle) {
      wrapBalanced(ctx.subtitle, s.sub, 'serif', pg.width * 0.84).concat([]).forEach(function (l) {
        pg.center(l, y, s.sub, 'serif'); y += s.sub * 1.35;
      });
    }
    y += s.body * 1.6;
    var tag = tagline(ctx), ks = s.kicker;
    while (F.sansBold.width(tag, ks, 1.4) > pg.width && ks > KDP.MIN_FONT_PT + 0.01) ks = Math.max(KDP.MIN_FONT_PT, ks - 0.25);
    pg.spaced(tag, pg.cx, y, ks, 'sansBold', 1.4, 'center');
    pg.center(ctx.author || 'Author Name', pg.y0 + (pg.y1 - pg.y0) * 0.86, s.sub * 1.12, 'serif');
    if (!ctx.author) placeholder(pg, '', '');
  }

  function copyrightPage(ctx) {
    var pg = addPage(ctx, 'front', 'Copyright');
    pg.folio = false;
    var s = ctx.sizes.small, lead = s * 1.5;
    var year = new Date(ctx.project.createdAt || Date.now()).getFullYear();
    var paras = [
      ctx.title || 'Your Book Title',
      'Copyright © ' + year + ' ' + (ctx.author || 'Author Name') + '. All rights reserved.',
      'No part of this book may be reproduced, stored or transmitted in any form or by any means without written permission from the author, except for brief quotations in a review. Readers may copy pages for their own personal use while solving the puzzle.',
      'This is a work of fiction. Names, characters, places and events are the products of the author’s imagination or are used fictitiously. Any resemblance to actual persons, living or dead, or to actual events is coincidental.',
      'Case file ' + ctx.project.seed.toUpperCase() + '  ·  First edition'
    ];
    var h = 0;
    var blocks = paras.map(function (p) { var l = wrap(p, s, 'serif', pg.width); h += l.length * lead + lead * 0.6; return l; });
    var y = pg.bodyBottom - h;
    blocks.forEach(function (lines) {
      lines.forEach(function (words) { pg.text(words.join(' '), pg.x0, baselineIn(y, s, lead), s, 'serif'); y += lead; });
      y += lead * 0.6;
    });
  }

  function contentsPage(ctx) {
    var pg = addPage(ctx, 'front', 'Contents');
    pg.folio = false;
    var s = ctx.sizes;
    var y = pg.y0 + s.body * 2.2;
    pg.spaced('CONTENTS', pg.cx, y, s.kicker, 'sansBold', 1.6, 'center');
    ornament(pg, pg.cx, y + s.body * 1.2, 30);
    ctx.contents = { page: pg, y: y + s.body * 3.2 };
  }

  function fillContents(ctx, entries) {
    var pg = ctx.contents.page, y = ctx.contents.y, s = ctx.sizes.body;
    var mains = entries.filter(function (e) { return !e.sub; }).length, subs = entries.length - mains;
    // shrink the spacing when chapters make the list long, so it always fits one page
    var lead = Math.min(s * 2, (pg.bodyBottom - y) / (mains + subs * 0.75 + 0.5));
    entries.forEach(function (e) {
      if (e.sub) y -= lead * 0.25;
      var size = e.sub ? Math.max(LK.kdp.MIN_FONT_PT, s * 0.88) : s;
      var w = pg.text(e.title.trim(), pg.x0 + (e.sub ? s * 1.2 : 0), y, size, 'serif') + (e.sub ? s * 1.2 : 0);
      var nw = pg.right(String(e.page), pg.x1, y, size, 'serif');
      // dotted leader made of small squares (no hairlines)
      var dx = pg.x0 + w + 6, end = pg.x1 - nw - 6;
      for (var x = dx; x + 1.2 < end; x += 5) pg.fill(x, y - 1.8, 1.2, 1.2, 1);
      y += lead;
    });
  }

  // ---------- how to play ----------
  function lotteryReading(ctx) {
    var cs = ctx.cs, v = cs.venue;
    var minT = Math.min.apply(null, cs.records.map(function (r) { return r.m; }));
    var maxT = Math.max.apply(null, cs.records.map(function (r) { return r.m; }));
    return [
      ctx.chaptered
        ? 'Ticket: a five-digit ticket number. The register is told in chapters, one for each part of the event, by the time the ticket was bought. Inside a chapter, tickets are sorted by number.'
        : 'Ticket: a five-digit ticket number. The register is sorted by it.',
      'Time: when the ticket was bought, between ' + LK.themes.clock(minT) + ' and ' + LK.themes.clock(maxT) + '.',
      v.place + ': the ' + v.place.toLowerCase() + ' number, from 1 to ' + cs.places + '.',
      'Paid: ' + list(v.amounts.map(R.fmtAmount)) + '.',
      'Method: how the ticket was paid for: ' + list(v.methods) + '.',
      'Lucky numbers: the six numbers from 1 to 49 the buyer chose, smallest first.',
      'Initials: the buyer’s initials, first name then last name.'
    ];
  }
  var LOTTERY_CLUE_READING = [
    '“Or later”, “or earlier”, “or higher”, “or more” and “or less” include the value itself.',
    '“Between” includes both ends: a ticket bought at exactly either time is between them.',
    'The minutes of a time are its last two digits: 9:47 PM has minutes 47.',
    'The digits of 48213 are 4, 8, 2, 1 and 3, and they add up to 18.',
    '“If A, then B” clues rule out only tickets where A is true and B is false.',
    '“A, or B (or both)” clues keep every ticket where at least one part is true.'
  ];

  function howToPlay(ctx) {
    var cs = ctx.cs, t = ctx.type, u = t.unit, s = ctx.sizes, lot = t.id === 'lottery', named = t.mode === 'named';
    var flow = new Flow(ctx, 'howto', 'How to Play');
    opener(flow, 'Before you begin', 'How to Play');
    var body = { size: s.body, leading: s.lead, gap: s.body * 0.55, justify: true };
    var archive = t.archive.title;
    paragraphs(flow, [lot ? 'Somewhere in the Ticket Register is the one ticket the killer bought. Your job is to find it, using nothing but the clues and the data.'
      : 'Somewhere in ' + archive + ' is ' + (named ? 'the name of the killer' : t.answer) + '. Your job is to find ' + (named ? 'that name' : 'it') + ', using nothing but the clues and the data.'], body);
    subhead(flow, 'The steps');
    var intro = ctx.has('prologue') && ctx.has('letter') ? 'Read the prologue and the letter. They set the scene.'
      : ctx.has('prologue') ? 'Read the prologue. It sets the scene.'
      : ctx.has('letter') ? 'Read the letter. It sets the scene.' : null;
    var stuck = ctx.project.setup.checkpoints || ctx.has('hints')
      ? 'Stuck? ' + (ctx.project.setup.checkpoints ? 'The Checkpoints page tells you how many ' + u.many + ' should be left after each clue. ' : '') +
        (ctx.has('hints') ? 'The Detective’s Hints give two hints for every clue, and never the answer.' : '')
      : null;
    bullets(flow, [
      intro,
      ctx.has('practice') && ctx.practice ? 'New to this kind of puzzle? Try the two-minute Practice Case first.' : null,
      lot ? 'Take the clues in order. Each clue describes the killer’s ticket. Go through the register and cross out every ticket that does not match.'
        : 'Take the clues in order. Each clue describes ' + t.answer + '. Go through ' + archive.replace(/^The /, 'the ') + ' and cross out every ' + u.one + ' that does not match.',
      'Only ' + u.many + ' still in play matter. You never need to check ' + (/^[aeiou]/.test(u.one) ? 'an ' : 'a ') + u.one + ' you have already crossed out.',
      named ? 'When one name is left, you have found the killer.'
        : lot ? 'When one ticket is left, find its number in the Patron Ledger to name the killer.'
          : 'When one ' + u.one + ' is left, find it in ' + t.ledger.title + ' to name the killer.',
      ctx.has('verdict')
        ? 'Prove it: unlock the Verdict Cipher with your answer. Only the right answer turns its code into words, so nothing is spoiled.'
        : 'Check your answer in the Solution at the back.',
      stuck
    ].filter(Boolean), true);
    subhead(flow, 'Reading the ' + t.archive.name);
    bullets(flow, lot ? lotteryReading(ctx) : t.reading(Object.assign({}, cs, { chaptered: ctx.chaptered })));
    subhead(flow, 'Reading the clues');
    bullets(flow, lot ? LOTTERY_CLUE_READING : t.clueReading(cs));
    subhead(flow, 'Tips');
    bullets(flow, [
      'Work in pencil or with a fine highlighter. Tick the small box beside ' + (/^[aeiou]/.test(u.one) ? 'an ' : 'a ') + u.one + ' when you cross it out.',
      'Every clue matters: each one rules out at least one ' + u.one + ' that no other clue does.',
      ctx.chaptered ? (lot ? 'Time clues can rule out whole chapters at once. Check the hours on each chapter’s first page.' : t.chapterHint) : null,
      ctx.atlas ? 'Keep a finger in the Atlas: some clues compare the hideout with a real city.' : null,
      ctx.has('cards') ? 'Cut out the Clue Cards near the back of the book and keep the clue you are working on beside the ' + t.archive.name + '.' : null
    ].filter(Boolean));
    return flow;
  }

  // ---------- the practice case ----------
  function practiceSection(ctx) {
    var pr = ctx.practice, s = ctx.sizes, t = ctx.type, u = t.unit;
    var flow = new Flow(ctx, 'practice', 'The Practice Case');
    var first = opener(flow, 'A two-minute warm-up', 'The Practice Case');
    var body = { size: s.body, leading: s.lead, gap: s.body * 0.5, justify: true };
    paragraphs(flow, ['New to elimination puzzles? Try this little case first: ' + pr.cs.records.length + ' ' + u.many + ', four clues, one answer. ' +
      'The method is exactly the one you will use on the real ' + t.archive.name + '. Already comfortable? Skip ahead to the clues.'], body);
    flow.y += s.body * 0.6;
    // the mini archive
    var pg = flow.page;
    if (ctx.grid) {
      var cells = pr.cs.records.map(function (r) { return t.cell(r, pr.cs); });
      flow.need(s.lead * cells.length);
      cells.forEach(function (c, i) {
        flow.page.text((i + 1) + '.', flow.page.x0 + s.body, baselineIn(flow.y, s.body, s.lead), s.body, 'sansBold');
        flow.page.text(c, flow.page.x0 + s.body * 2.6, baselineIn(flow.y, s.body, s.lead), s.body, 'sans');
        flow.y += s.lead;
      });
    } else {
      var rows = pr.cs.records.map(function (r) { return t.row(r, pr.cs); });
      var tb = fitTable(ctx, rows, pg.width - 6);
      var rowH = tb.size * 1.5;
      flow.need(tb.hs * 2.6 + rowH * rows.length);
      pg = flow.page;
      var x = pg.x0 + (pg.width - tb.total) / 2, colY = flow.y + tb.hs * 1.2;
      drawHeader(pg, tb, x, colY);
      var top = colY + tb.hs * 0.65;
      pg.line(x, top - 1.2, x + tb.total, top - 1.2, 1);
      rows.forEach(function (row, i) {
        if (i % 2 === 1) pg.fill(x - 2, top + i * rowH, tb.total + 4, rowH, BAND_GRAY);
        drawRow(pg, tb, x, top + i * rowH, rowH, row);
      });
      pg.line(x, top + rows.length * rowH + 1, x + tb.total, top + rows.length * rowH + 1, 0.75);
      flow.y = top + rows.length * rowH + s.body;
    }
    subhead(flow, 'The clues');
    bullets(flow, pr.clues.map(function (c) { return c.text; }), true);
    subhead(flow, 'Worked through');
    var remaining = pr.cs.records.length;
    pr.clues.forEach(function (c) {
      remaining -= c.out.length;
      var why = c.out.map(function (r) { return t.recordLabel(r, pr.cs) + ' (' + t.describe(c, r, pr.cs) + ')'; });
      var text = 'Clue ' + c.n + ' crosses out ' + andList(why) + '. ' +
        (remaining === 1 ? 'One ' + u.one + ' is left.' : fmtN(remaining) + ' ' + u.many + ' are left.');
      paragraphs(flow, [text], body);
      flow.y += s.body * 0.35;
    });
    flow.y += s.body * 0.4;
    paragraphs(flow, [t.recordLabel(pr.killer, pr.cs) + ' is the only ' + u.one + ' that matches all four clues. That is the whole method: one clue at a time, ' +
      'crossing out only what does not match.'], { size: s.body, leading: s.lead, justify: true, font: 'serifBold' });
    return first;
  }

  // ---------- story sections ----------
  function prologue(ctx) {
    var st = ctx.story, s = ctx.sizes;
    var flow = new Flow(ctx, 'prologue', 'Prologue');
    var title = st && st.prologue && st.prologue.title ? st.prologue.title : 'Prologue';
    var first = opener(flow, 'Prologue', title);
    if (st && st.prologue && st.prologue.paragraphs.length) {
      paragraphs(flow, st.prologue.paragraphs, { size: s.body, leading: s.lead, indent: s.body * 1.4, justify: true });
    } else {
      placeholder(first, 'The prologue goes here', 'Paste your story in step 2. About two pages: the event and the death.');
      flow.newPage(); placeholder(flow.page, 'Prologue, continued', '');
    }
    return first;
  }

  function letter(ctx) {
    var st = ctx.story, s = ctx.sizes;
    var flow = new Flow(ctx, 'letter', 'The Letter');
    var first = opener(flow, 'Inside the envelope', 'The Letter');
    if (st && st.letter && st.letter.paragraphs.length) {
      paragraphs(flow, st.letter.paragraphs, { size: s.body, leading: s.lead, gap: s.body * 0.7, justify: true });
      if (st.client && st.client.name) {
        flow.y += s.body * 0.6;
        flow.need(s.lead);
        flow.page.right(st.client.name, flow.page.x1, baselineIn(flow.y, s.body * 1.1, s.lead), s.body * 1.1, 'serifBold');
        flow.y += s.lead;
      }
    } else {
      placeholder(first, 'The letter goes here', 'The letter writer hands the case to the reader.');
    }
    return first;
  }

  // Where each interlude goes: after the clue the AI named, or spread evenly.
  function interludePlan(ctx) {
    var st = ctx.story, K = ctx.cs.clues.length, out = {};
    if (!st || !st.interludes || !st.interludes.length || ctx.storyStale) return out;
    var slots = LK.prompts.interludeSlots(K);
    st.interludes.forEach(function (x, i) {
      var at = x.after >= 1 && x.after < K ? x.after : slots[Math.min(i, slots.length - 1)];
      while (out[at] && at < K - 1) at++;
      if (!out[at]) out[at] = x;
    });
    return out;
  }

  function cluesSection(ctx) {
    var cs = ctx.cs, st = ctx.story, s = ctx.sizes, t = ctx.type;
    var fresh = st && !ctx.storyStale;
    var notes = fresh && st.clueNotes ? st.clueNotes : {}, titles = fresh && st.clueTitles ? st.clueTitles : {};
    var help = ctx.project.setup.clueHelp !== false;
    var inter = interludePlan(ctx);
    var flow = new Flow(ctx, 'clues', 'The Clues');
    var first = opener(flow, 'The evidence', 'The Clues');
    paragraphs(flow, ['Work through the clues in order. Each one describes ' + t.answer + ': cross out every ' + t.unit.one + ' in the ' + t.archive.name + ' that does not match it.'],
      { size: s.body, leading: s.lead, justify: true });
    flow.y += s.body * 0.8;
    var ruleSize = s.rule, pad = ruleSize * 0.75, boxW;
    var helpSize = Math.max(KDP.MIN_FONT_PT, s.small), helpLead = helpSize * 1.4;
    cs.clues.forEach(function (c) {
      var pg = flow.page;
      boxW = pg.width;
      var title = titles[c.n] || '';
      var titleSize = s.body * 1.15, titleLead = titleSize * 1.3;
      var titleLines = title ? wrap(title, titleSize, 'serifBold', pg.width) : [];
      var noteLines = notes[c.n] ? wrap(notes[c.n], s.body, 'serif', pg.width) : [];
      var ruleLines = wrap(c.text, ruleSize, 'sansBold', boxW - pad * 2 - ruleSize * 1.6);
      var helpText = help ? t.firstHint(c, cs, ctx.chaptered) : '';
      var helpLines = helpText ? wrap(helpText, helpSize, 'serif', pg.width) : [];
      var ruleLead = ruleSize * 1.32;
      var boxH = ruleLines.length * ruleLead + pad * 1.5;
      var h = s.lead + titleLines.length * titleLead + noteLines.length * s.lead + s.body * 0.35 + boxH +
        (helpLines.length ? s.body * 0.4 + helpLines.length * helpLead : 0) + s.body * 1.5;
      if (!flow.fits(h)) flow.newPage();
      pg = flow.page;
      var y = flow.y;
      pg.spaced('CLUE ' + c.n, pg.x0, baselineIn(y, s.kicker, s.lead), s.kicker, 'sansBold', 1.4);
      y += s.lead;
      titleLines.forEach(function (words) {
        pg.text(words.join(' '), pg.x0, baselineIn(y, titleSize, titleLead), titleSize, 'serifBold');
        y += titleLead;
      });
      noteLines.forEach(function (words, li) {
        setLine(pg, words, pg.x0, baselineIn(y, s.body, s.lead), pg.width, s.body, 'serif', li < noteLines.length - 1);
        y += s.lead;
      });
      y += s.body * 0.35;
      pg.rect(pg.x0, y, pg.width, boxH, 0.75);
      var bx = pg.x0 + pad, by = y + pad * 0.75;
      var cb = ruleSize * 0.85;
      pg.rect(bx, by + (ruleLead - cb) / 2, cb, cb, 0.75);
      ruleLines.forEach(function (words, li) {
        pg.text(words.join(' '), bx + ruleSize * 1.6, baselineIn(by + li * ruleLead, ruleSize, ruleLead), ruleSize, 'sansBold');
      });
      y += boxH;
      if (helpLines.length) {
        y += s.body * 0.4;
        helpLines.forEach(function (words, li) {
          setLine(pg, words, pg.x0, baselineIn(y, helpSize, helpLead), pg.width, helpSize, 'serif', li < helpLines.length - 1);
          y += helpLead;
        });
      }
      flow.y = y + s.body * 1.5;
      if (inter[c.n]) interlude(flow, inter[c.n]);
    });
    return first;
  }

  // A short scene between clues: the story moves on while the reader works.
  function interlude(flow, x) {
    var s = flow.ctx.sizes;
    var paras = x.paragraphs;
    var est = (paras.join(' ').length / 60) * s.lead;
    flow.need(Math.min(s.lead * 6 + est * 0.5, flow.page.bodyBottom - flow.page.y0));
    ornament(flow.page, flow.page.cx, flow.y + s.body * 0.2, 30);
    flow.y += s.body * 1.4;
    if (x.title) {
      flow.page.spaced(x.title.toUpperCase(), flow.page.cx, baselineIn(flow.y, s.kicker, s.lead), s.kicker, 'sansBold', 1.4, 'center');
      flow.y += s.lead * 1.1;
    }
    paragraphs(flow, paras, { size: s.body, leading: s.lead, gap: s.body * 0.5, justify: true });
    flow.y += s.body * 0.6;
    flow.need(s.body * 2);
    ornament(flow.page, flow.page.cx, flow.y + s.body * 0.2, 30);
    flow.y += s.body * 2;
  }

  function ledgerSection(ctx) {
    var s = ctx.sizes, rows = ctx.ledger, L = ctx.type.ledger;
    var flow = new Flow(ctx, 'ledger', L.title);
    var first = opener(flow, L.kicker, L.title);
    paragraphs(flow, [L.intro(ctx.cs)], { size: s.body, leading: s.lead, justify: true });
    flow.y += s.body;
    if (!rows) {
      placeholder(first, 'The ledger goes here', 'Twenty named suspects and their ' + L.items + ', filled in from your story.');
      return first;
    }
    var nameSize = s.body, small = s.small * 1.05;
    rows.forEach(function (r) {
      var pg = flow.page;
      var items = r.items.join('   ');
      var tw = F.sans.width(items, nameSize);
      var nameW = pg.width - tw - nameSize * 1.5;
      // long items (coordinates) go on their own line under the name
      var own = nameW < pg.width * 0.4;
      var nameLines = wrap(r.name + (r.role ? ', ' + r.role : ''), nameSize, 'serif', own ? pg.width : nameW);
      var itemLines = own ? wrap(r.items.join('    '), nameSize, 'sans', pg.width) : [];
      var noteLines = r.note ? wrap(r.note, small, 'serif', pg.width * 0.92) : [];
      var h = (nameLines.length + itemLines.length) * s.lead + noteLines.length * small * 1.4 + s.body * 0.9;
      if (!flow.fits(h)) flow.newPage();
      pg = flow.page;
      var y = flow.y;
      nameLines.forEach(function (words, li) {
        var line = words.join(' ');
        var base = baselineIn(y, nameSize, s.lead);
        if (li === 0) {
          var nm = r.name, rest = line.slice(nm.length);
          if (line.indexOf(nm) === 0) {
            var w = pg.text(nm, pg.x0, base, nameSize, 'serifBold');
            if (rest) pg.text(rest, pg.x0 + w, base, nameSize, 'serif');
          } else pg.text(line, pg.x0, base, nameSize, 'serif');
          if (!own) pg.right(items, pg.x1, base, nameSize, 'sans');
        } else pg.text(line, pg.x0, base, nameSize, 'serif');
        y += s.lead;
      });
      itemLines.forEach(function (words) { pg.text(words.join(' '), pg.x0 + nameSize, baselineIn(y, nameSize, s.lead), nameSize, 'sans'); y += s.lead; });
      noteLines.forEach(function (words) {
        pg.text(words.join(' '), pg.x0, baselineIn(y, small, small * 1.4), small, 'serif');
        y += small * 1.4;
      });
      y += s.body * 0.45;
      pg.line(pg.x0, y, pg.x1, y, 0.75, RULE_GRAY);
      flow.y = y + s.body * 0.45;
    });
    return first;
  }

  // The Atlas: real cities and their coordinates, for the clues that compare with them.
  function atlasSection(ctx) {
    var s = ctx.sizes, cities = ctx.atlas.slice().sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    var flow = new Flow(ctx, 'atlas', 'The Atlas');
    var first = opener(flow, 'For reference', 'The Atlas');
    paragraphs(flow, ['Some clues compare the hideout with a real city. Here is every city the clues may name, with its latitude and longitude. ' +
      'Compare the numbers exactly as printed.'], { size: s.body, leading: s.lead, justify: true });
    flow.y += s.body * 0.8;
    var size = s.body, rowH = size * 1.6, hs = Math.max(KDP.MIN_FONT_PT, size * 0.78);
    var pg = flow.page;
    var nameW = 0;
    cities.forEach(function (c) { nameW = Math.max(nameW, F.serif.width(c.name, size)); });
    var numW = F.sans.width('170.00°W', size);
    var gap = size * 2, total = nameW + gap + numW * 2 + gap;
    var x = pg.x0 + (pg.width - total) / 2;
    function head() {
      pg.spaced('CITY', x, baselineIn(flow.y, hs, rowH), hs, 'sansBold', 0.4);
      pg.spaced('LATITUDE', x + nameW + gap + numW, baselineIn(flow.y, hs, rowH), hs, 'sansBold', 0.4, 'right');
      pg.spaced('LONGITUDE', x + total, baselineIn(flow.y, hs, rowH), hs, 'sansBold', 0.4, 'right');
      flow.y += rowH;
      pg.line(x, flow.y - 1, x + total, flow.y - 1, 1);
    }
    head();
    cities.forEach(function (c, i) {
      if (!flow.fits(rowH)) { flow.newPage(); pg = flow.page; x = pg.x0 + (pg.width - total) / 2; head(); }
      if (i % 2 === 1) pg.fill(x - 2, flow.y, total + 4, rowH, BAND_GRAY);
      var b = baselineIn(flow.y, size, rowH);
      pg.text(c.name, x, b, size, 'serif');
      pg.right(LK.fields.fmtLat(c.lat), x + nameW + gap + numW, b, size, 'sans');
      pg.right(LK.fields.fmtLon(c.lon), x + total, b, size, 'sans');
      flow.y += rowH;
    });
    pg.line(x, flow.y + 1, x + total, flow.y + 1, 0.75);
    return first;
  }

  function notesSection(ctx, n) {
    var s = ctx.sizes, first = null;
    for (var i = 0; i < n; i++) {
      var flow = new Flow(ctx, 'notes', 'Detective’s Notes');
      if (i === 0) { first = opener(flow, 'Your workspace', 'Detective’s Notes'); }
      else { flow.newPage(); flow.y = flow.page.y0 + s.body; }
      var pg = flow.page, gap = s.body * 2.1;
      for (var y = flow.y + gap; y <= pg.bodyBottom; y += gap) pg.line(pg.x0, y, pg.x1, y, 0.75, RULE_GRAY);
    }
    return first;
  }

  function checkpointsSection(ctx) {
    var s = ctx.sizes, cs = ctx.cs, u = ctx.type.unit;
    var flow = new Flow(ctx, 'checkpoints', 'Checkpoints');
    var first = opener(flow, 'Check your work', 'Checkpoints');
    paragraphs(flow, ['After each clue, this many ' + u.many + ' should still be in play. If your count is different, look again at the last clue before moving on.'],
      { size: s.body, leading: s.lead, justify: true });
    flow.y += s.body;
    var pg = flow.page;
    var K = cs.clues.length, rowH = s.body * 1.75;
    var perCol = Math.ceil(K / 2);
    var colW = Math.min(pg.width / 2 - s.body, s.body * 13);
    var startX = pg.cx - colW - s.body * 0.5;
    var left = (u.many.length > 11 ? 'LEFT' : u.many.toUpperCase() + ' LEFT');
    if (flow.y + (perCol + 1) * rowH > pg.bodyBottom) { flow.newPage(); pg = flow.page; }
    [0, 1].forEach(function (col) {
      var x = startX + col * (colW + s.body);
      var y = flow.y;
      pg.spaced('AFTER CLUE', x, baselineIn(y, s.kicker, rowH), s.kicker, 'sansBold', 0.8);
      pg.spaced(left, x + colW, baselineIn(y, s.kicker, rowH), s.kicker, 'sansBold', 0.8, 'right');
      y += rowH;
      pg.line(x, y - 2, x + colW, y - 2, 1);
      for (var k = col * perCol; k < Math.min(K, (col + 1) * perCol); k++) {
        var b = baselineIn(y, s.body, rowH);
        pg.text(String(k + 1), x + s.body * 0.4, b, s.body, 'sansBold');
        pg.right(cs.check.checkpoints[k].toLocaleString('en-US'), x + colW - s.body * 0.4, b, s.body, 'sans');
        y += rowH;
        pg.line(x, y - 2, x + colW, y - 2, 0.75, RULE_GRAY);
      }
    });
    flow.y += (perCol + 1) * rowH;
    return first;
  }

  // ---------- detective's hints ----------
  function hintsSection(ctx) {
    var s = ctx.sizes, cs = ctx.cs, t = ctx.type;
    var list2 = LK.extras.hints(cs, function (r) { return ctx.recPage[r]; }, ctx.chaptered, ctx.project.seed);
    var flow = new Flow(ctx, 'hints', 'Detective’s Hints');
    var first = opener(flow, 'Stuck on a clue?', 'Detective’s Hints');
    var body = { size: s.body, leading: s.lead, justify: true };
    paragraphs(flow, ['Every clue has two hints. Read the first hint before the second, and the second only when you need it. ' +
      (t.id === 'lottery' ? 'The hints never name the killer’s ticket: the tickets they show are ones you will cross out sooner or later.'
        : 'The hints never point at the answer: the ' + t.unit.many + ' they show are ones you will cross out sooner or later.')], body);
    function part(title, note, pick) {
      flow.y += s.body * 1.2;
      flow.need(s.lead * 4);
      flow.page.spaced(title, flow.page.x0, baselineIn(flow.y, s.kicker, s.lead), s.kicker, 'sansBold', 1.4);
      flow.y += s.lead * 0.8;
      flow.page.line(flow.page.x0, flow.y, flow.page.x1, flow.y, 0.75);
      flow.y += s.body * 0.6;
      if (note) { paragraphs(flow, [note], { size: s.small, leading: s.small * 1.45, justify: false }); flow.y += s.body * 0.3; }
      list2.forEach(function (hnt) {
        flow.need(s.lead * 2.6);
        flow.page.spaced('CLUE ' + hnt.n, flow.page.x0, baselineIn(flow.y, s.kicker, s.lead), s.kicker, 'sansBold', 1.2);
        flow.y += s.lead * 0.9;
        paragraphs(flow, [pick(hnt)], body);
        flow.y += s.body * 0.55;
      });
    }
    part('FIRST HINTS: HOW TO READ THE CLUE', null, function (x) { return x.first; });
    flow.newPage();
    flow.y = flow.page.y0 + s.body;
    part('SECOND HINTS: A WORKED EXAMPLE', 'One ' + t.unit.one + ' the clue rules out, one it keeps, and how many ' + t.unit.many + ' you should have left.', function (x) { return x.second; });
    return first;
  }

  // ---------- the verdict cipher ----------
  // The answer's key: its own number (ticket, badge...), or where it sits on the page.
  function verdictKey(ctx) {
    var cs = ctx.cs, t = ctx.type;
    var code = t.keyDigits(cs.killer, cs);
    if (code) return { digits: code, label: t.keyLabel, groups: null };
    var pos = ctx.recPos[cs.killerIndex] || { page: 1, line: 1, col: 1 };
    return { digits: pad(pos.page, 3) + pad(pos.line, 2) + pos.col, label: 'place on the page', groups: [['PAGE', 3], ['LINE', 2], ['COL', 1]] };
  }

  function verdictSection(ctx) {
    var s = ctx.sizes, cs = ctx.cs, t = ctx.type;
    var key = verdictKey(ctx), L = key.digits.length;
    var v = LK.extras.verdict(key.digits, ctx.killerName, ctx.project.seed);
    ctx.verdict = v;
    var flow = new Flow(ctx, 'verdict', 'The Verdict Cipher');
    var first = opener(flow, 'Check your answer', 'The Verdict Cipher');
    var answer = t.mode === 'named' ? 'name' : t.unit.one;
    paragraphs(flow, ['Think you have found the ' + answer + '? Use it as the key. Only the right answer turns the code below into words, ' +
      'so you can check your answer without a single spoiler.'], { size: s.body, leading: s.lead, justify: true });
    flow.y += s.body * 0.5;
    var ledger = ctx.type.mode === 'ledger';
    var steps = [
      key.groups ? 'Write the address of your answer in the boxes below, one digit per box: its page number as three digits (page 47 is 047), then its line number as two digits (line 9 is 09), then its column number.'
        : 'Write the ' + L + ' digits of the ' + key.label + ' of your answer in the boxes below, one digit per box.',
      'Under each code letter, a small number tells you which box to use.',
      'In the Decoder, go to the row of that digit, find the code letter in the row, and read the real letter at the top of its column.',
      ctx.killerName ? (ledger ? 'If the letters spell the name of a suspect in ' + ctx.type.ledger.title + ', you have caught the killer.'
        : 'If the letters spell the name you found, you have caught the killer.') + ' If they make no sense, one clue was misread: check your work and try again.'
        : 'If the letters spell real words, you have caught the killer. If they make no sense, one clue was misread: check your work and try again.'
    ];
    steps.forEach(function (st, i) {
      var ind = s.body * 1.3, lines = wrap(st, s.body, 'serif', flow.page.width - ind);
      flow.need(s.lead * lines.length);
      flow.page.text((i + 1) + '.', flow.page.x0, baselineIn(flow.y, s.body, s.lead), s.body, 'serifBold');
      lines.forEach(function (words, li) {
        setLine(flow.page, words, flow.page.x0 + ind, baselineIn(flow.y, s.body, s.lead), flow.page.width - ind, s.body, 'serif', li < lines.length - 1);
        flow.y += s.lead;
      });
      flow.y += s.body * 0.2;
    });
    // the key: one box per digit
    var box = Math.min(s.body * 2.1, (flow.page.width - s.body * 0.6 * (L - 1)) / L);
    var bgap = s.body * 0.6;
    flow.y += s.body * 0.6;
    flow.need(box + s.lead * 2.6);
    var pg = flow.page, kx = pg.cx - (box * L + bgap * (L - 1)) / 2;
    pg.spaced('YOUR KEY', pg.cx, baselineIn(flow.y, s.kicker, s.lead), s.kicker, 'sansBold', 1.4, 'center');
    flow.y += s.lead;
    var tiny0 = Math.max(LK.kdp.MIN_FONT_PT, s.small * 0.9);
    for (var d = 0; d < L; d++) {
      var bx = kx + d * (box + bgap);
      pg.rect(bx, flow.y, box, box, 1);
      pg.center(String(d + 1), flow.y + box + s.small * 1.3, tiny0, 'sans', bx + box / 2);
    }
    if (key.groups) {
      var gi = 0;
      key.groups.forEach(function (g) {
        var gx0 = kx + gi * (box + bgap), gx1 = kx + (gi + g[1] - 1) * (box + bgap) + box;
        pg.center(g[0], flow.y + box + s.small * 2.6, tiny0, 'sansBold', (gx0 + gx1) / 2);
        gi += g[1];
      });
    }
    flow.y += box + s.lead * (key.groups ? 2.1 : 1.3);
    // the code: one cell per letter, an empty box underneath to write the real letter
    var cw = Math.min(s.body * 2, pg.width / 16), ch = cw * 0.95, gapW = cw * 0.55;
    var cs2 = s.body * 1.05, tiny = Math.max(LK.kdp.MIN_FONT_PT, s.small * 0.82);
    var words = [], cur = [];
    v.cipher.forEach(function (x) { if (x.c === ' ') { if (cur.length) words.push(cur); cur = []; } else cur.push(x); });
    if (cur.length) words.push(cur);
    var lineH = ch * 2 + tiny * 2.2 + s.body * 0.9;
    flow.need(lineH + s.lead);
    flow.page.spaced('THE CODE', flow.page.cx, baselineIn(flow.y, s.kicker, s.lead), s.kicker, 'sansBold', 1.4, 'center');
    flow.y += s.lead * 1.1;
    var lines = [], line = [], lw = 0;
    words.forEach(function (w) {
      var ww = w.length * cw;
      if (line.length && lw + gapW + ww > flow.page.width) { lines.push(line); line = []; lw = 0; }
      lw += (line.length ? gapW : 0) + ww; line.push(w);
    });
    if (line.length) lines.push(line);
    lines.forEach(function (ln) {
      flow.need(lineH);
      var p2 = flow.page, total = 0;
      ln.forEach(function (w, wi) { total += w.length * cw + (wi ? gapW : 0); });
      var x = p2.cx - total / 2, y = flow.y;
      ln.forEach(function (w) {
        w.forEach(function (cell) {
          if (cell.pos) {
            p2.rect(x + 1, y, cw - 2, ch, 0.75);
            p2.center(cell.c, y + ch * 0.68, cs2, 'sansBold', x + cw / 2);
            p2.center(String(cell.pos), y + ch + tiny * 1.15, tiny, 'sans', x + cw / 2);
            p2.rect(x + 1, y + ch + tiny * 1.6, cw - 2, ch, 0.75);
          } else {
            p2.center(cell.c, y + ch * 0.68, cs2, 'sansBold', x + cw / 2);
            p2.center(cell.c, y + ch + tiny * 1.6 + ch * 0.68, cs2, 'sansBold', x + cw / 2);
          }
          x += cw;
        });
        x += gapW;
      });
      flow.y += lineH;
    });
    // the decoder table, on its own page
    flow.newPage();
    pg = flow.page;
    var y = pg.y0 + s.body * 1.6;
    pg.spaced('THE DECODER', pg.cx, y, s.kicker * 1.2, 'sansBold', 1.6, 'center');
    y += s.lead;
    wrap('Row = the digit from your key. Find the code letter in that row; the real letter is at the top of its column.', s.small, 'serif', pg.width * 0.9)
      .forEach(function (wds) { pg.center(wds.join(' '), y, s.small, 'serif'); y += s.small * 1.45; });
    y += s.body * 0.6;
    var labW = F.sansBold.width('DIGIT 0', Math.max(LK.kdp.MIN_FONT_PT, s.small * 0.85)) + s.body * 0.6;
    var colW = (pg.width - labW) / 26;
    var ts = Math.max(LK.kdp.MIN_FONT_PT, Math.min(s.small, colW * 0.78));
    var rh = Math.min(s.body * 2.1, (pg.bodyBottom - y - s.lead * 6) / 11.5);
    var lab = Math.max(LK.kdp.MIN_FONT_PT, s.small * 0.85);
    var x0 = pg.x0 + labW;
    // header row: the real letters, white on black
    pg.fill(pg.x0, y, pg.width, rh, 1);
    pg.items.push({ t: 'text', x: r2(pg.x0 + s.body * 0.2), y: r2(y + rh * 0.66), size: lab, font: 'sansBold', str: 'REAL', paper: true });
    for (var a = 0; a < 26; a++) {
      var Lr = String.fromCharCode(65 + a), w2 = F.sansBold.width(Lr, ts);
      pg.items.push({ t: 'text', x: r2(x0 + a * colW + (colW - w2) / 2), y: r2(y + rh * 0.66), size: ts, font: 'sansBold', str: Lr, paper: true });
    }
    y += rh;
    for (var dg = 0; dg < 10; dg++) {
      if (dg % 2 === 1) pg.fill(pg.x0, y, pg.width, rh, BAND_GRAY);
      pg.text('DIGIT ' + dg, pg.x0 + s.body * 0.2, y + rh * 0.66, lab, 'sansBold');
      for (var a2 = 0; a2 < 26; a2++) {
        pg.center(v.table[dg][a2], y + rh * 0.66, ts, 'sans', x0 + a2 * colW + colW / 2);
      }
      y += rh;
    }
    pg.line(pg.x0, y, pg.x1, y, 0.75);
    for (var vc = 0; vc <= 26; vc += 2) pg.line(x0 + vc * colW, y - rh * 10, x0 + vc * colW, y, 0.75, RULE_GRAY);
    // a worked example with made-up numbers, so the first letter is never a guess
    var exDigit = 7, exReal = 4, exCode = v.table[exDigit][exReal];
    y += s.lead * 1.4;
    pg.spaced('EXAMPLE', pg.x0, y, s.kicker, 'sansBold', 1.4);
    y += s.lead * 0.4;
    wrap('Say a code letter is ' + exCode + ', the small number under it is 2, and the second digit of your key is ' + exDigit + '. ' +
      'Go to the row DIGIT ' + exDigit + ' and find ' + exCode + ' in it. At the top of that column is ' + String.fromCharCode(65 + exReal) +
      ', so you write ' + String.fromCharCode(65 + exReal) + ' in the empty box under the ' + exCode + '.', s.body, 'serif', pg.width)
      .forEach(function (wds, i, all) {
        y += s.lead;
        setLine(pg, wds, pg.x0, y, pg.width, s.body, 'serif', i < all.length - 1);
      });
    return first;
  }

  // ---------- clue cards ----------
  // Cards on right-hand pages with nothing on the back, so cutting them out loses no content.
  function cardsSection(ctx) {
    var s = ctx.sizes, cs = ctx.cs, first = null;
    if ((ctx.pages.length + 1) % 2 === 0) {
      var padPg = addPage(ctx, 'cards', 'Notes');
      padPg.spaced('NOTES', padPg.cx, padPg.y0 + s.body * 1.6, s.kicker, 'sansBold', 1.6, 'center');
      for (var ly = padPg.y0 + s.body * 4; ly <= padPg.bodyBottom; ly += s.body * 2.1) padPg.line(padPg.x0, ly, padPg.x1, ly, 0.75, RULE_GRAY);
    }
    var probe = new Page(ctx, ctx.pages.length + 1, 'cards', '');
    var gutter = s.body * 0.9, cardW = probe.width / 2;
    var inner = cardW - gutter * 2, rs = s.rule * 0.95, rl = rs * 1.3;
    var needH = 0;
    cs.clues.forEach(function (c) { needH = Math.max(needH, wrap(c.text, rs, 'sansBold', inner).length); });
    var cardH = gutter * 1.6 + s.lead + needH * rl + gutter;
    var top0 = probe.y0 + s.lead * 2.2;
    var rows = Math.max(1, Math.floor((probe.bodyBottom - top0) / cardH));
    var per = rows * 2;
    for (var k = 0; k < cs.clues.length; k += per) {
      var pg = addPage(ctx, 'cards', 'Clue Cards');
      if (!first) first = pg;
      pg.spaced('CLUE CARDS', pg.cx, pg.y0 + s.body, s.kicker, 'sansBold', 1.6, 'center');
      pg.center('Cut along the dashed lines. The back of this page is blank.', pg.y0 + s.body + s.lead * 0.95, s.small, 'serif');
      var batch = cs.clues.slice(k, k + per);
      var nRows = Math.ceil(batch.length / 2);
      var gx0 = pg.x0, gy0 = top0, gx1 = pg.x1, gy1 = top0 + nRows * cardH;
      for (var rr = 0; rr <= nRows; rr++) pg.dash(gx0, gy0 + rr * cardH, gx1, gy0 + rr * cardH, 0.75);
      pg.dash(gx0, gy0, gx0, gy1, 0.75);
      pg.dash(gx1, gy0, gx1, gy1, 0.75);
      pg.dash(pg.cx, gy0, pg.cx, gy1, 0.75);
      batch.forEach(function (c, bi) {
        var cx0 = gx0 + (bi % 2) * cardW + gutter, cy0 = gy0 + Math.floor(bi / 2) * cardH + gutter * 1.1;
        var cb = s.kicker;
        pg.rect(cx0, cy0 + (s.lead - cb) / 2 - s.kicker * 0.2, cb, cb, 0.75);
        pg.spaced('CLUE ' + c.n, cx0 + cb + s.body * 0.5, baselineIn(cy0, s.kicker, s.lead), s.kicker, 'sansBold', 1.3);
        var yy = cy0 + s.lead + gutter * 0.3;
        wrap(c.text, rs, 'sansBold', inner).forEach(function (words) {
          pg.text(words.join(' '), cx0, baselineIn(yy, rs, rl), rs, 'sansBold'); yy += rl;
        });
      });
      // the back of the leaf stays blank
      var back = addPage(ctx, 'cards', 'Back of the clue cards');
      back.folio = false;
      back.center('This side is left blank so you can cut out the clue cards.', back.y0 + (back.bodyBottom - back.y0) * 0.5, s.small, 'serif');
    }
    return first;
  }

  function stopPage(ctx) {
    var s = ctx.sizes, t = ctx.type;
    var pg = addPage(ctx, 'stop', 'Stop');
    var y = pg.y0 + (pg.bodyBottom - pg.y0) * 0.36;
    pg.spaced('STOP', pg.cx, y, s.title * 1.25, 'serifBold', 6, 'center');
    y += s.body * 2.4;
    ornament(pg, pg.cx, y, 46);
    y += s.body * 2.4;
    var found = t.id === 'lottery' ? 'found the killer’s ticket and named the killer'
      : t.mode === 'named' ? 'found the last name standing' : 'found ' + t.answer + ' and named the killer';
    wrap((ctx.has('epilogue') ? 'The solution and the epilogue come next.' : 'The solution comes next.') +
      ' Turn the page only when you have ' + found + '.', s.body * 1.1, 'serif', pg.width * 0.78)
      .forEach(function (words) { pg.center(words.join(' '), y, s.body * 1.1, 'serif'); y += s.lead * 1.1; });
    return pg;
  }

  function solutionSection(ctx) {
    var s = ctx.sizes, cs = ctx.cs, st = ctx.story, t = ctx.type, u = t.unit, lot = t.id === 'lottery';
    var flow = new Flow(ctx, 'solution', 'Solution');
    var first = opener(flow, 'Solution', lot ? 'The Last Ticket Standing' : t.mode === 'named' ? 'The Last Name Standing' : 'The Last ' + cap(u.one) + ' Standing');
    var pg = flow.page;
    if (ctx.grid) {
      var pos = ctx.recPos[cs.killerIndex] || { page: 0, line: 0, col: 0 };
      var big = s.body * 1.6, text = ctx.cells[cs.killerIndex];
      var bw = F.sansBold.width(text, big) + s.body * 2.4, bh = big * 2.2;
      var by = flow.y + s.body * 0.4;
      pg.rect(pg.cx - bw / 2, by, bw, bh, 1);
      pg.center(text, by + bh / 2 + big * 0.34, big, 'sansBold');
      pg.center('Page ' + pos.page + ', line ' + pos.line + ', column ' + pos.col, by + bh + s.lead, s.small, 'sans');
      flow.y = by + bh + s.lead * 2;
    } else {
      var tb = ctx.registerTable;
      var x = pg.x0 + (pg.width - tb.total) / 2;
      var colY = flow.y + tb.hs * 1.2;
      drawHeader(pg, tb, x, colY);
      var top = colY + tb.hs * 0.65, rowH = tb.size * 1.5;
      pg.line(x, top - 1.2, x + tb.total, top - 1.2, 1);
      pg.fill(x - 2, top, tb.total + 4, rowH, BAND_GRAY);
      drawRow(pg, tb, x, top, rowH, ctx.rows[cs.killerIndex]);
      pg.line(x, top + rowH + 1, x + tb.total, top + rowH + 1, 0.75);
      flow.y = top + rowH + s.body * 1.6;
    }
    var killerRow = ctx.ledger ? ctx.ledger.filter(function (r) { return r.killer; })[0] : null;
    var label = t.recordLabel(cs.killer, cs);
    var paras = [lot ? 'Ticket ' + cs.killer.t + ' is the only ticket that matches all ' + cs.clues.length + ' clues.'
      : label + ' is the only ' + u.one + ' that matches all ' + cs.clues.length + ' clues.'];
    if (killerRow) {
      paras.push(lot ? 'The Patron Ledger shows it was bought by ' + killerRow.name + (killerRow.role ? ', ' + killerRow.role : '') + '.'
        : t.ledger.title + ' links it to ' + killerRow.name + (killerRow.role ? ', ' + killerRow.role : '') + '.');
    }
    if (t.mode === 'named') paras.push(label + ' is the killer.');
    if (st && st.motive) paras.push('Motive: ' + st.motive);
    paras.push('Every clue was needed: each one rules out at least one ' + u.one + ' that no other clue rules out.');
    paragraphs(flow, paras, { size: s.body, leading: s.lead, gap: s.body * 0.6, justify: true });
    // the last records to fall, and the clue that ruled each one out
    var lateSteps = [];
    for (var k = 0; k < cs.clues.length; k++) {
      var before = k === 0 ? cs.records.length : cs.check.checkpoints[k - 1];
      if (before <= 12) {
        var out = [];
        for (var r = 0; r < cs.records.length; r++) if (cs.check.elimAt[r] === k + 1) out.push(lot ? String(cs.records[r].t) : t.recordLabel(cs.records[r], cs));
        lateSteps.push({ n: k + 1, items: out });
      }
    }
    if (lateSteps.length) {
      flow.y += s.body * 0.8;
      flow.need(s.lead * 3);
      flow.page.spaced('THE FINAL ELIMINATIONS', flow.page.x0, baselineIn(flow.y, s.kicker, s.lead), s.kicker, 'sansBold', 1.2);
      flow.y += s.lead;
      lateSteps.forEach(function (st2) {
        var line = lot ? 'Clue ' + st2.n + ' rules out ' + (st2.items.length === 1 ? 'ticket ' : 'tickets ') + andList(st2.items) + '.'
          : 'Clue ' + st2.n + ' rules out ' + andList(st2.items) + '.';
        paragraphs(flow, [line], { size: s.body, leading: s.lead, justify: false });
      });
    }
    if (!killerRow && t.mode !== 'named') placeholder(first, '', 'The killer’s name appears here once the story is in.');
    return first;
  }

  function epilogue(ctx) {
    var st = ctx.story, s = ctx.sizes;
    var flow = new Flow(ctx, 'epilogue', 'Epilogue');
    var title = st && st.epilogue && st.epilogue.title ? st.epilogue.title : 'Epilogue';
    var first = opener(flow, 'Epilogue', title);
    if (st && st.epilogue && st.epilogue.paragraphs.length) {
      var ans = LK.prompts.answerText(ctx.cs);
      var paras = st.epilogue.paragraphs.map(function (p) { return p.replace(/\[\s*(TICKET|ANSWER)\s*\]/gi, ans); });
      paragraphs(flow, paras, { size: s.body, leading: s.lead, indent: s.body * 1.4, justify: true });
    } else {
      placeholder(first, 'The epilogue goes here', 'The killer is unmasked and every clue falls into place.');
      flow.newPage(); placeholder(flow.page, 'Epilogue, continued', '');
    }
    return first;
  }

  // A certificate for the reader who solves the case.
  function certificatePage(ctx) {
    var s = ctx.sizes;
    if ((ctx.pages.length + 1) % 2 === 0) { var blank = addPage(ctx, 'certificate', 'Notes'); blank.folio = false; }
    var pg = addPage(ctx, 'certificate', 'Certificate');
    pg.folio = false;
    var x0 = pg.x0, y0 = pg.y0 + s.body, w = pg.width, h = pg.bodyBottom - y0;
    pg.rect(x0, y0, w, h, 2);
    pg.rect(x0 + 5, y0 + 5, w - 10, h - 10, 0.75);
    // the block below is about 25 body lines tall: center it in the frame
    var y = y0 + Math.max(h * 0.12, (h - s.body * 25) / 2);
    pg.spaced('CERTIFICATE', pg.cx, y, s.h1 * 0.95, 'serifBold', 4, 'center');
    y += s.h1 * 0.95;
    pg.spaced('OF DETECTION', pg.cx, y, s.kicker * 1.2, 'sansBold', 2.4, 'center');
    y += s.body * 1.6;
    ornament(pg, pg.cx, y, 46);
    y += s.body * 3;
    pg.center('This certifies that', y, s.body * 1.05, 'serif');
    y += s.body * 3.2;
    pg.line(pg.cx - w * 0.33, y, pg.cx + w * 0.33, y, 0.75);
    y += s.body * 2.4;
    pg.center('solved the case of', y, s.body * 1.05, 'serif');
    y += s.lead * 1.5;
    wrapBalanced(ctx.title || 'Your Book Title', s.sub * 1.15, 'serifBold', w * 0.8).forEach(function (l) {
      pg.center(l, y, s.sub * 1.15, 'serifBold'); y += s.sub * 1.5;
    });
    y += s.body * 0.8;
    pg.center('finding the one answer among ' + fmtN(ctx.cs.records.length) + ' ' + ctx.type.unit.many + ' with ' + ctx.cs.clues.length + ' clues.', y, s.small, 'serif');
    y += s.body * 3.6;
    var lx = pg.cx - w * 0.36, rx = pg.cx + w * 0.04, lw = w * 0.32;
    pg.line(lx, y, lx + lw, y, 0.75);
    pg.line(rx, y, rx + lw, y, 0.75);
    pg.center('Date solved', y + s.small * 1.6, s.small, 'serif', lx + lw / 2);
    pg.center('Time taken', y + s.small * 1.6, s.small, 'serif', rx + lw / 2);
    pg.center('Case file ' + ctx.project.seed.toUpperCase(), y0 + h - s.body * 1.6, s.small, 'sans');
    return pg;
  }

  // ---------- folios ----------
  function folios(ctx) {
    ctx.pages.forEach(function (pg) {
      if (!pg.folio) return;
      pg.center(String(pg.num), pg.y1 - F.sans.descent * ctx.sizes.folio, ctx.sizes.folio, 'sans');
    });
  }

  // ---------- sizes ----------
  function sizesFor(trim, print) {
    var big = print === 'large';
    var k = trim.w <= 6 ? 0 : trim.w <= 7 ? 1 : 2;
    var body = [10.5, 11, 11.5][k] + (big ? 2.5 : 0);
    return {
      body: body,
      lead: body * 1.42,
      small: Math.max(KDP.MIN_FONT_PT + 1, body * 0.8),
      kicker: Math.max(KDP.MIN_FONT_PT + 0.5, body * 0.78),
      h1: body * 1.9,
      title: [28, 32, 34][k] + (big ? 2 : 0),
      sub: body * 1.12,
      rule: body * 0.98,
      folio: Math.max(KDP.MIN_FONT_PT + 1, body * 0.8),
      reg: [8, 8.75, 9.5][k] + (big ? 2.25 : 0)
    };
  }

  /*
   * Lays out the whole book. Returns { pages, sections, problems, pageCount, margins, trim, sizes, table }.
   */
  function layoutBook(project, cs) {
    F = F || LK.metrics.load();
    var setup = project.setup;
    var trim = KDP.trim(setup.trim);
    var story = project.story || null;
    var t = cs.type;
    var stale = !!(story && story.caseKey && story.caseKey !== LK.book.caseKey(project));
    var grid = t.layout === 'grid';
    var columns = t.columns(cs);
    var rows = grid ? null : cs.records.map(function (r) { return t.row(r, cs); });
    var cells = grid ? cs.records.map(function (r) { return t.cell(r, cs); }) : null;
    var ledger = story ? LK.book.ledger(project, cs) : null;
    var chapters = setup.registerMode !== 'list' ? LK.extras.chapters(cs) : null;
    var practice = LK.book.hasPage(project, 'practice') ? LK.extras.practice(cs, project.seed) : null;
    var atlas = cs.setting.atlas || null;
    var guess = Math.ceil(cs.records.length / (grid ? 120 : 40)) + 20;
    var result = null;
    for (var pass = 0; pass < 4; pass++) {
      var m = KDP.margins(guess);
      var ctx = {
        project: project, cs: cs, type: t, story: story, storyStale: stale, rows: rows, cells: cells, columns: columns, grid: grid, ledger: ledger,
        W: trim.w * PT, H: trim.h * PT, m: m, sizes: sizesFor(trim, setup.print), pages: [], problems: [],
        title: LK.book.title(project), subtitle: story && story.subtitle ? story.subtitle : '', author: (setup.author || '').trim(),
        has: function (key) { return LK.book.hasPage(project, key); },
        chaptered: !!(chapters && chapters.length), chapters: chapters, practice: practice, atlas: atlas,
        killerName: story || t.mode === 'named' ? LK.book.killerName(project, cs) : ''
      };
      var sec = {};
      titlePage(ctx);
      if (ctx.has('copyright')) copyrightPage(ctx);
      if (ctx.has('contents')) contentsPage(ctx);
      if (ctx.has('howto')) {
        howToPlay(ctx);
        sec.howto = ctx.pages.filter(function (p) { return p.section === 'howto'; })[0];
      }
      if (ctx.has('practice') && practice) sec.practice = practiceSection(ctx);
      if (ctx.has('prologue')) sec.prologue = prologue(ctx);
      if (ctx.has('letter')) sec.letter = letter(ctx);
      sec.clues = cluesSection(ctx);
      sec.register = archiveSection(ctx);
      if (atlas) sec.atlas = atlasSection(ctx);
      if (t.mode === 'ledger') sec.ledger = ledgerSection(ctx);
      if (setup.notesPages > 0) sec.notes = notesSection(ctx, setup.notesPages);
      if (setup.checkpoints) sec.checkpoints = checkpointsSection(ctx);
      if (ctx.has('hints')) sec.hints = hintsSection(ctx);
      if (ctx.has('verdict')) sec.verdict = verdictSection(ctx);
      if (ctx.has('cards')) sec.cards = cardsSection(ctx);
      if (ctx.has('stop')) sec.stop = stopPage(ctx);
      sec.solution = solutionSection(ctx);
      if (ctx.has('epilogue')) sec.epilogue = epilogue(ctx);
      if (ctx.has('certificate')) sec.certificate = certificatePage(ctx);
      var entries = [
        ['How to Play', sec.howto], ['The Practice Case', sec.practice], ['Prologue', sec.prologue], ['The Letter', sec.letter], ['The Clues', sec.clues],
        [t.archive.title, sec.register], ['The Atlas', sec.atlas], [t.ledger ? t.ledger.title : '', sec.ledger], ['Detective’s Notes', sec.notes],
        ['Checkpoints', sec.checkpoints], ['Detective’s Hints', sec.hints], ['The Verdict Cipher', sec.verdict],
        ['Clue Cards', sec.cards], ['Solution', sec.solution], ['Epilogue', sec.epilogue], ['Certificate of Detection', sec.certificate]
      ].filter(function (e) { return e[1]; }).map(function (e) { return { title: e[0], page: e[1].num }; });
      if (ctx.chaptered) {
        // chapters show in the page menu of the preview, after the archive entry
        var at = entries.map(function (e) { return e.title; }).indexOf(t.archive.title);
        var chEntries = ctx.chapters.map(function (ch) {
          var pgc = ctx.pages.filter(function (p) { return p.label === 'Chapter ' + ch.roman; })[0];
          return { title: 'Chapter ' + ch.roman + ': ' + ch.title, page: pgc.num, sub: true };
        });
        entries.splice.apply(entries, [at + 1, 0].concat(chEntries));
      }
      if (ctx.contents) fillContents(ctx, entries);
      folios(ctx);
      var n = ctx.pages.length;
      var front = ctx.pages.filter(function (p) { return p.section === 'front'; }).map(function (p) { return { title: p.label, page: p.num }; });
      result = {
        pages: ctx.pages, sections: entries, front: front, problems: ctx.problems, pageCount: n, margins: m, trim: trim,
        sizes: ctx.sizes, table: ctx.registerTable, grid: ctx.gridSpec, recPos: ctx.recPos, verdict: ctx.verdict, stale: stale, W: ctx.W, H: ctx.H
      };
      if (KDP.minGutter(n) === KDP.minGutter(guess)) break;
      guess = n;
    }
    if (result.pageCount < KDP.MIN_PAGES) result.problems.push({ level: 'error', text: 'The book has ' + result.pageCount + ' pages; KDP needs at least ' + KDP.MIN_PAGES + '.' });
    if (result.pageCount > KDP.MAX_PAGES) result.problems.push({ level: 'error', text: 'The book has ' + result.pageCount + ' pages; KDP allows at most ' + KDP.MAX_PAGES + '. Use fewer ' + t.unit.many + '.' });
    return result;
  }

  /*
   * Checks every page against the KDP rules this app can verify itself:
   * everything inside the margins, no text under 7 pt, no line under 0.75 pt, no fill under 10% gray.
   */
  function audit(book) {
    var outside = [], tiny = 0, thin = 0, pale = 0, eps = 0.6;
    book.pages.forEach(function (pg) {
      pg.items.forEach(function (it) {
        var box = itemBox(it);
        if (box && (box.x < pg.x0 - eps || box.y < pg.y0 - eps || box.x + box.w > pg.x1 + eps || box.y + box.h > pg.y1 + eps)) {
          if (outside.indexOf(pg.num) === -1) outside.push(pg.num);
        }
        if (it.t === 'text' && it.size < KDP.MIN_FONT_PT - 0.001) tiny++;
        if ((it.t === 'line' || (it.t === 'rect' && !it.fill)) && (it.w || it.lw) < KDP.MIN_LINE_PT - 0.001) thin++;
        if (it.t === 'rect' && it.fill && it.fill < KDP.MIN_GRAY_FILL) pale++;
      });
    });
    return { outside: outside, tiny: tiny, thin: thin, pale: pale };
  }

  function itemBox(it) {
    if (it.t === 'text') {
      var f = F[it.font];
      var w = f.width(it.str, it.size);
      return { x: it.x, y: it.y - f.ascent * it.size, w: w, h: (f.ascent + f.descent) * it.size };
    }
    if (it.t === 'rect') return { x: it.x, y: it.y, w: it.w, h: it.h };
    if (it.t === 'line') return { x: Math.min(it.x1, it.x2), y: Math.min(it.y1, it.y2), w: Math.abs(it.x2 - it.x1), h: Math.abs(it.y2 - it.y1) };
    return null;
  }

  LK.layout = { layoutBook: layoutBook, audit: audit, sizesFor: sizesFor, BAND_GRAY: BAND_GRAY, RULE_GRAY: RULE_GRAY };
})(typeof window !== 'undefined' ? window : globalThis);
