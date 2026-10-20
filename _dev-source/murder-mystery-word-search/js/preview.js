/*! preview.js — HTML/CSS page renderer in inch units. */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pad2(n) {
    n = Number(n);
    return (n < 10 ? '0' : '') + n;
  }

  function inch(v) { return (Math.round(v * 1000) / 1000) + 'in'; }

  function pageShell(plan, page, inner, settings) {
    var m = page.margins;
    var box = global.MMLayout.contentBox(m);
    var trim = plan.trim;
    // Folio sits on the safe-area floor; contentBox reserves FOLIO_BAND above it.
    var numStyle = 'bottom:' + inch(m.bottom) + ';';
    if (settings && settings.pagePos === 'outside') {
      numStyle += (m.outsideSide === 'right' ? 'right' : 'left') + ':' + inch(m[m.outsideSide]) +
        ';text-align:' + (m.outsideSide === 'right' ? 'right' : 'left') + ';';
    } else {
      numStyle += 'left:' + inch(m.left) + ';right:' + inch(m.right) + ';text-align:center;';
    }
    var overlay = '<div class="mm-margin-overlay" style="top:' + inch(m.top) + ';bottom:' + inch(m.bottom) +
      ';left:' + inch(m.left) + ';right:' + inch(m.right) + '"></div>';
    var folio = page.showNumber ? '<div class="mm-folio" style="' + numStyle + '">' + page.folio + '</div>' : '';
    return '<div class="mm-page" style="width:' + inch(trim.w) + ';height:' + inch(trim.h) + '">' +
      '<div class="mm-content" style="top:' + inch(box.top) + ';bottom:' + inch(box.bottom) +
      ';left:' + inch(box.left) + ';right:' + inch(box.right) + '">' + inner + '</div>' +
      folio + overlay + '</div>';
  }

  function renderTitle(plan, page, settings) {
    var inner = '<div class="mm-front">' +
      '<div class="mm-front-kicker">A murder mystery word search collection</div>' +
      '<h1 class="mm-front-title">' + esc(settings.bookTitle || 'Murder Search') + '</h1>' +
      (settings.author ? '<div class="mm-front-author">' + esc(settings.author) + '</div>' : '') +
      '</div>';
    return pageShell(plan, page, inner, settings);
  }

  function renderCopyright(plan, page, settings) {
    var html = '<div class="mm-copy">';
    global.MMLayout.copyrightParagraphs(settings).forEach(function (para) {
      html += '<p>' + esc(para) + '</p>';
    });
    html += '</div>';
    return pageShell(plan, page, html, settings);
  }

  function renderHowto(plan, page, settings) {
    var steps = settings.howtoText || global.MMPrompt.DEFAULT_HOWTO;
    var titles = settings.howtoTitles || global.MMPrompt.DEFAULT_HOWTO_TITLES;
    var html = '<div class="mm-howto-head">How To Solve Every Case</div><ol class="mm-howto">';
    for (var i = 0; i < 5; i++) {
      html += '<li><span class="mm-pill">' + (i + 1) + ' · ' + esc(titles[i] || '') + '</span>' +
        '<p>' + esc(steps[i] || '') + '</p></li>';
    }
    html += '</ol>';
    return pageShell(plan, page, html, settings);
  }

  function renderGrid(grid, geom, showAnswers) {
    var n = geom.gridN;
    var cell = geom.cell;
    var html = '<div class="mm-grid" style="width:' + inch(cell * n) + ';height:' + inch(cell * n) +
      ';grid-template-columns:repeat(' + n + ',1fr);grid-template-rows:repeat(' + n + ',1fr);font-size:' + geom.gridPt + 'pt">';
    var r, c, key, ch, circled, inWord, cls;
    var wordMap = {};
    if (showAnswers && grid.placed) {
      grid.placed.forEach(function (p) {
        p.cells.forEach(function (cellPos) { wordMap[cellPos[0] + ',' + cellPos[1]] = p.kind; });
      });
    }
    for (r = 0; r < n; r++) {
      for (c = 0; c < n; c++) {
        key = r + ',' + c;
        ch = grid.letters[r][c];
        circled = grid.circleMap && grid.circleMap[key];
        inWord = wordMap[key];
        cls = 'mm-cell' + (circled ? ' is-circled' : '') + (inWord ? ' is-word is-' + inWord : '');
        html += '<span class="' + cls + '"><span class="mm-ch">' + esc(ch) + '</span></span>';
      }
    }
    return html + '</div>';
  }

  function renderPuzzle(plan, page, puzzle, settings, showAnswers) {
    if (!puzzle) return renderBlank(plan, page, settings);
    var geom = plan.geom;
    var pairW = geom.card * 2 + geom.colGap;
    var inner = '<div class="mm-puzzle" style="gap:' + inch(geom.bandGap) + '">';
    inner += '<div class="mm-titlebar" style="height:' + inch(geom.titleH) + ';font-size:' + geom.type.title + 'pt">CASE #' + pad2(puzzle.id) + ' · ' + esc(puzzle.theme.toUpperCase()) + '</div>';
    inner += '<div class="mm-scenes" style="height:' + inch(geom.sceneH) + ';width:' + inch(pairW) +
      ';row-gap:' + inch(geom.rowGap) + ';column-gap:' + inch(geom.colGap) + '">';
    for (var i = 0; i < 4; i++) {
      inner += '<div class="mm-card" style="width:' + inch(geom.card) + ';height:' + inch(geom.card) + ';padding:' + inch(geom.pad) + '">' +
        '<div class="mm-badge" style="font-size:' + geom.type.scene + 'pt">' + esc(puzzle.grids[i].scene) + '</div>' +
        renderGrid(puzzle.grids[i], geom, showAnswers) +
        '</div>';
    }
    inner += '</div>';
    inner += '<div class="mm-checks" style="min-height:' + inch(geom.checkH) + ';width:' + inch(pairW) + '">' +
      checklist('EVIDENCE', puzzle.evidence, geom) +
      checklist('SUSPECTS', puzzle.suspects, geom) +
      '</div>';
    inner += '<div class="mm-blanks" style="height:' + inch(geom.blankH) + ';font-size:' + geom.type.blank + 'pt">' +
      blankRow('WEAPON', 'VICTIM', showAnswers ? puzzle.weapon : '', showAnswers ? puzzle.victim : '') +
      blankRow('KILLER', 'LOCATION', showAnswers ? puzzle.killer : '', showAnswers ? puzzle.location : '') +
      '</div></div>';
    return pageShell(plan, page, inner, settings);
  }

  function checklist(title, items, geom) {
    var html = '<div class="mm-check" style="width:' + inch(geom.checkW) + ';font-size:' + geom.type.check + 'pt"><div class="mm-check-h">' + title + '</div>';
    items.forEach(function (item) {
      html += '<div class="mm-check-item"><span class="mm-box" aria-hidden="true"></span><span class="mm-check-label">' + esc(item) + '</span></div>';
    });
    return html + '</div>';
  }

  function blankRow(a, b, av, bv) {
    return '<div class="mm-blank-row">' +
      '<span>' + a + '</span><span class="mm-line">' + esc(av) + '</span>' +
      '<span>' + b + '</span><span class="mm-line">' + esc(bv) + '</span></div>';
  }

  function renderAnswersText(plan, page, puzzles, settings) {
    var keyPt = plan.geom.type.key;
    var html = '<div class="mm-key-head" style="font-size:' + plan.geom.type.title + 'pt">Answer key</div>';
    for (var i = page.from; i <= page.to; i++) {
      var p = puzzles[i];
      if (!p) continue;
      html += '<div class="mm-key-case" style="font-size:' + keyPt + 'pt">' +
        '<div class="mm-key-title" style="font-size:' + (keyPt + 1) + 'pt">Case ' +
        pad2(p.id) + ' · ' + esc(p.theme) + '</div>';
      html += '<div class="mm-key-sol">Weapon ' + esc(p.weapon) + ' · Killer ' + esc(p.killer) +
        ' · Victim ' + esc(p.victim) + ' · Location ' + esc(p.location) + '</div>';
      var lines = [];
      p.grids.forEach(function (g) {
        g.placed.forEach(function (pl) {
          if (pl.kind === 'evidence' || pl.kind === 'victim') {
            lines.push(esc(global.MMLayout.formatPlacement(pl, g.scene)));
          }
        });
      });
      html += '<div class="mm-key-lines">' + lines.join(' · ') + '</div></div>';
    }
    return pageShell(plan, page, html, settings);
  }

  function renderBlank(plan, page, settings) {
    return pageShell(plan, page, '', settings);
  }

  function renderPage(plan, page, book, settings, showAnswers) {
    switch (page.kind) {
      case 'title': return renderTitle(plan, page, settings);
      case 'copyright': return renderCopyright(plan, page, settings);
      case 'howto': return renderHowto(plan, page, settings);
      case 'puzzle': return renderPuzzle(plan, page, book.puzzles[page.caseIndex], settings, showAnswers);
      case 'answers-text': return renderAnswersText(plan, page, book.puzzles, settings);
      default: return renderBlank(plan, page, settings);
    }
  }

  global.MMPreview = { renderPage: renderPage, esc: esc, pad2: pad2 };
})(typeof window !== 'undefined' ? window : globalThis);
