/*
 * checks.js: the KDP checks from the spec (section 9). They decide whether Download is
 * enabled, and every failing check carries one sentence telling the user what to do.
 *
 * Page content is checked by measuring the real drawing commands, so a check passes only
 * if what would be printed passes.
 */
(function () {
  'use strict';
  window.KS = window.KS || {};
  var KDP = KS.KDP, T = KS.Text, L = KS.Layout, S = KS.Settings;
  var EPS = 1e-6;

  function fmt(n) { return String(Math.round(n * 1000) / 1000); }

  // ---------------------------------------------------------------- page content
  function bbox(c) {
    var h;
    switch (c.t) {
      case 'text':
        return { x0: c.x, y0: c.y - T.ascent(c.face, c.size), x1: c.x + T.width(c.text, c.face, c.size), y1: c.y + T.descent(c.face, c.size) };
      case 'line': {
        // Exact extent of a stroked segment: half the weight across it, and along it too
        // only for square caps.
        h = c.w / 144;
        var len = Math.hypot(c.x2 - c.x1, c.y2 - c.y1) || 1;
        var ux = (c.x2 - c.x1) / len, uy = (c.y2 - c.y1) / len, nx = Math.abs(uy) * h, ny = Math.abs(ux) * h;
        var ax = c.cap === 'square' ? Math.abs(ux) * h : 0, ay = c.cap === 'square' ? Math.abs(uy) * h : 0;
        return {
          x0: Math.min(c.x1, c.x2) - nx - ax, y0: Math.min(c.y1, c.y2) - ny - ay,
          x1: Math.max(c.x1, c.x2) + nx + ax, y1: Math.max(c.y1, c.y2) + ny + ay
        };
      }
      case 'path':
        h = c.w / 144;
        var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        for (var i = 0; i < c.pts.length; i += 2) {
          b.x0 = Math.min(b.x0, c.pts[i] - h); b.x1 = Math.max(b.x1, c.pts[i] + h);
          b.y0 = Math.min(b.y0, c.pts[i + 1] - h); b.y1 = Math.max(b.y1, c.pts[i + 1] + h);
        }
        return b;
      case 'rect':
        return { x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.h };
      default:
        return null;
    }
  }

  // Measures one rendered page. Screen-only commands are ignored: they never print.
  function scanPage(page) {
    var r = { outside: false, smallFont: false, thinLine: false, lightInk: false, minFont: Infinity, minLine: Infinity };
    var live = page.live;
    page.commands.forEach(function (c) {
      if (c.preview) return;
      var b = bbox(c);
      if (b && (b.x0 < live.x - EPS || b.y0 < live.y - EPS || b.x1 > live.x + live.w + EPS || b.y1 > live.y + live.h + EPS)) {
        r.outside = true;
      }
      if (c.t === 'text') {
        r.minFont = Math.min(r.minFont, c.size);
        if (c.size < KDP.MIN_FONT_PT - EPS) r.smallFont = true;
      }
      if (c.t === 'line' || c.t === 'path') {
        r.minLine = Math.min(r.minLine, c.w);
        if (c.w < KDP.MIN_LINE_PT - EPS) r.thinLine = true;
      }
      var ink = c.t === 'rect' ? c.fill : c.ink;
      if (ink > EPS && ink < 0.1) r.lightInk = true;
    });
    return r;
  }

  // Scans every page in small slices so a long book never blocks typing. Returns a cancel
  // function; onDone receives the summary.
  function scanBook(book, onDone) {
    var i = 0, stopped = false;
    var sum = { pages: book.pageCount, outside: [], smallFont: [], thinLine: [], lightInk: [], minFont: Infinity, minLine: Infinity };
    function slice() {
      if (stopped) return;
      var end = Math.min(book.pageCount, i + 12);
      for (; i < end; i++) addPage(sum, i + 1, scanPage(book.renderPage(i)));
      if (i < book.pageCount) setTimeout(slice, 0);
      else onDone(sum);
    }
    setTimeout(slice, 0);
    return function () { stopped = true; };
  }

  function addPage(sum, number, r) {
    if (r.outside) sum.outside.push(number);
    if (r.smallFont) sum.smallFont.push(number);
    if (r.thinLine) sum.thinLine.push(number);
    if (r.lightInk) sum.lightInk.push(number);
    sum.minFont = Math.min(sum.minFont, r.minFont);
    sum.minLine = Math.min(sum.minLine, r.minLine);
  }

  function pageList(nums) {
    var head = nums.slice(0, 5).join(', ');
    return (nums.length > 1 ? 'pages ' : 'page ') + head + (nums.length > 5 ? ' and ' + (nums.length - 5) + ' more' : '');
  }

  // ---------------------------------------------------------------- page count helpers
  // Smallest number of puzzles that reaches KDP's 24-page minimum with these settings.
  function puzzlesForMinimum(settings) {
    var lim = S.LIMITS.count;
    for (var c = settings.count + 1; c <= lim.max; c++) {
      if (L.pageCountFor(settings, c) >= KDP.MIN_PAGES) return c;
    }
    return null;
  }

  // Largest number of puzzles that stays within the book size's page limit.
  function puzzlesForMaximum(settings, maxPages) {
    var lo = S.LIMITS.count.min, hi = settings.count;
    if (L.pageCountFor(settings, lo) > maxPages) return null;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      if (L.pageCountFor(settings, mid) <= maxPages) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // ---------------------------------------------------------------- all checks
  // status: 'pass' | 'auto' (fixed for the user) | 'warn' (not blocking) | 'fail' (blocks)
  //         | 'pending' (still working; blocks)
  // ctx: { gen: { ready, total, failed, running, cancelled }, scan: summary | null,
  //        pending: true when the puzzle settings were changed but not created yet,
  //        empty: true before any puzzles were created }
  function run(book, ctx) {
    var s = book.settings, out = [], trim = book.trim;
    function add(id, label, status, message) { out.push({ id: id, label: label, status: status, message: message || '' }); }

    add('title', 'Book title', book.text.title ? 'pass' : 'fail', book.text.title ? '' : 'Enter a book title.');
    add('applied', 'Puzzles match the settings', ctx.pending ? 'fail' : 'pass',
      ctx.empty ? 'Click Create puzzles to start your book.'
        : ctx.pending ? 'Puzzle settings changed. Click Create puzzles to apply them.' : '');

    var gen = ctx.gen || { ready: 0, total: book.count };
    if (gen.failed) {
      add('generated', 'All puzzles created', 'fail', gen.failedMessage);
    } else if (gen.ready < gen.total) {
      add('generated', 'All puzzles created', gen.cancelled ? 'fail' : 'pending',
        gen.cancelled
          ? 'Puzzle creation was stopped at ' + gen.ready + ' of ' + gen.total + '. Click Resume to finish.'
          : 'Creating puzzles ' + gen.ready + ' / ' + gen.total + '.');
    } else {
      add('generated', 'All puzzles created', 'pass', gen.total + ' of ' + gen.total + ' puzzles.');
    }
    add('unique', 'Unique solutions', gen.ready ? 'pass' : 'pending',
      'Each puzzle is checked by a solver; any puzzle with more than one solution is replaced before it enters the book.');

    if (book.pageCount < KDP.MIN_PAGES) {
      var need = puzzlesForMinimum(s);
      add('minPages', 'At least 24 pages', 'fail', need
        ? 'Add at least ' + (need - s.count) + ' more puzzle' + (need - s.count === 1 ? '' : 's') + ' to reach 24 pages.'
        : 'Turn on more pages under Advanced or add puzzles to reach 24 pages.');
    } else {
      add('minPages', 'At least 24 pages', 'pass', book.pageCount + ' pages.');
    }

    if (book.pageCount > trim.maxPages) {
      add('maxPages', 'Within the page limit', 'fail', maxPagesAdvice(book));
    } else {
      add('maxPages', 'Within the page limit', 'pass', trim.label + ' allows up to ' + trim.maxPages + ' pages.');
    }

    var padded = book.pages[book.pages.length - 1].type === 'blank';
    add('even', 'Even page count', padded ? 'auto' : 'pass', padded ? 'One blank page was added at the end.' : '');

    var mg = book.margins;
    if (mg.raised) {
      add('gutter', 'Inner margin (gutter)', 'auto', 'Raised to ' + fmt(mg.inside) + ' in, the KDP minimum for ' + book.pageCount + ' pages.');
    } else {
      add('gutter', 'Inner margin (gutter)', mg.inside >= mg.kdpInside - EPS ? 'pass' : 'fail',
        fmt(mg.inside) + ' in (KDP minimum ' + fmt(mg.kdpInside) + ' in for ' + book.pageCount + ' pages).');
    }
    var minOther = Math.min(mg.outside, mg.top, mg.bottom);
    add('margins', 'Outer, top and bottom margins', minOther >= KDP.MIN_MARGIN - EPS ? 'pass' : 'fail',
      minOther >= KDP.MIN_MARGIN - EPS ? 'All at least 0.25 in.' : 'Set every margin to at least 0.25 in.');

    var scan = ctx.scan;
    if (!scan) {
      add('inside', 'Content inside margins', 'pending', 'Checking every page…');
      add('font', 'Text at least 7 pt', 'pending', '');
      add('lines', 'Lines at least 0.75 pt', 'pending', '');
    } else {
      add('inside', 'Content inside margins', scan.outside.length ? 'fail' : 'pass',
        scan.outside.length ? 'Something crosses the margin on ' + pageList(scan.outside) + '. Shorten the text or reduce the margins.' : 'Checked ' + scan.pages + ' pages.');
      add('font', 'Text at least 7 pt', scan.smallFont.length ? 'fail' : 'pass',
        scan.smallFont.length ? 'Text is smaller than 7 pt on ' + pageList(scan.smallFont) + '.' : 'Smallest text ' + fmt(scan.minFont) + ' pt.');
      add('lines', 'Lines at least 0.75 pt', scan.thinLine.length ? 'fail' : 'pass',
        scan.thinLine.length ? 'A line is thinner than 0.75 pt on ' + pageList(scan.thinLine) + '.' : 'Thinnest line ' + fmt(scan.minLine) + ' pt.');
    }

    var tf = book.titleFit;
    add('titleFit', 'Title fits the title page', !s.pages.title || (tf.title && tf.subtitle) ? 'pass' : 'warn',
      !s.pages.title || (tf.title && tf.subtitle) ? '' : (tf.title ? 'The subtitle is too long for three lines. Shorten it.' : 'The title is too long for three lines. Shorten it.'));
    return out;
  }

  function maxPagesAdvice(book) {
    var s = book.settings, trim = book.trim;
    var msg = 'This book has ' + book.pageCount + ' pages; ' + trim.label + ' allows ' + trim.maxPages + '.';
    var options = L.perPageOptions(s).filter(function (o) { return o.ok && o.n > s.perPage && o.pages <= trim.maxPages; });
    if (options.length) return msg + ' Choose ' + options[0].n + ' puzzles per page or use fewer puzzles.';
    var fit = puzzlesForMaximum(s, trim.maxPages);
    return msg + (fit ? ' Reduce the book to ' + fit + ' puzzles.' : ' Choose fewer puzzles.');
  }

  function isBlocking(c) { return c.status === 'fail' || c.status === 'pending'; }

  KS.Checks = {
    scanPage: scanPage,
    scanBook: scanBook,
    run: run,
    isBlocking: isBlocking,
    puzzlesForMinimum: puzzlesForMinimum
  };
})();
