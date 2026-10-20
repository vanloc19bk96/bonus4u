/*! layout.js — trim geometry, gutters, type sizes, book page plan. */
(function (global) {
  'use strict';

  var TRIMS = [
    { id: '8.5x11', w: 8.5, h: 11, label: '8.5 x 11 in', defaultGrid: 11, card: 3.45, cell: 0.281 },
    { id: '8x10', w: 8, h: 10, label: '8 x 10 in', defaultGrid: 11, card: 3.20, cell: 0.258 },
    { id: '6x9', w: 6, h: 9, label: '6 x 9 in', defaultGrid: 9, card: 2.35, cell: 0.221 }
  ];

  var TYPE = {
    '8.5x11': { title: 16, scene: 10, grid: 13, check: 10, blank: 10, flavor: 11, key: 9, page: 9 },
    '8x10': { title: 15, scene: 9.5, grid: 12, check: 9.5, blank: 9.5, flavor: 10.5, key: 8.5, page: 9 },
    '6x9': { title: 13, scene: 9, grid: 10.5, check: 9, blank: 9, flavor: 10, key: 8, page: 8 }
  };

  // Courier Prime cap-height / em-square. Circles sit on cap ink, not the em box.
  var GRID_CAP_RATIO = 1187 / 2048;

  function trimById(id) {
    for (var i = 0; i < TRIMS.length; i++) if (TRIMS[i].id === id) return TRIMS[i];
    return TRIMS[0];
  }

  function gutterFor(pageCount) {
    if (pageCount <= 150) return 0.5;
    if (pageCount <= 300) return 0.625;
    if (pageCount <= 500) return 0.75;
    if (pageCount <= 700) return 0.875;
    return 1.0;
  }

  // Breathing room inside the KDP safe area (overlay still uses raw margins).
  var CONTENT_INSET = 0.1;
  // Bottom strip for the folio plus a gap above it so content does not sit on the page number.
  var FOLIO_BAND = 0.26;

  function pageMargins(pageNumber, pageCount) {
    var inside = gutterFor(pageCount);
    var outside = 0.5;
    var isRecto = pageNumber % 2 === 1;
    return {
      left: isRecto ? inside : outside,
      right: isRecto ? outside : inside,
      top: 0.5,
      bottom: 0.5,
      gutterSide: isRecto ? 'left' : 'right',
      outsideSide: isRecto ? 'right' : 'left'
    };
  }

  function contentBox(margins) {
    return {
      top: margins.top + CONTENT_INSET,
      left: margins.left + CONTENT_INSET,
      right: margins.right + CONTENT_INSET,
      bottom: margins.bottom + FOLIO_BAND
    };
  }

  function defaultGridSize(settings) {
    var trim = trimById(settings.trimId);
    if (settings.gridOverride && settings.gridOverride !== 'auto') {
      return Number(settings.gridOverride);
    }
    var byDiff = settings.difficulty === 'easy' ? 9 : settings.difficulty === 'hard' ? 13 : 11;
    if (trim.id === '6x9') return Math.min(byDiff, 9);
    return byDiff;
  }

  function puzzleGeom(trim, margins, gridN) {
    var contentW = trim.w - margins.left - margins.right;
    var contentH = trim.h - margins.top - margins.bottom;
    var type = TYPE[trim.id] || TYPE['8.5x11'];
    var titleH = (type.title / 16) * 0.45;
    var checkLine = (type.check * 1.2) / 72;
    var checkH = Math.max(1.05, 0.15 + 7 * checkLine);
    var blankH = Math.max(0.48, (type.blank / 10) * 0.70);
    var colGap = Math.max(0.14, Math.min(0.30, contentW * 0.04));
    var rowGap = Math.max(0.12, Math.min(0.25, contentH * 0.028));
    var bandMin = 0.12;
    var badgeHang = 0.12;
    var sceneBudget = Math.max(2.0, contentH - titleH - checkH - blankH - badgeHang - bandMin * 2);
    var card = Math.min((contentW - colGap) / 2, (sceneBudget - rowGap) / 2);
    var sceneH = card * 2 + rowGap;
    var pad = Math.max(0.08, Math.min(0.18, card * 0.052));
    var cell = (card - pad * 2) / gridN;
    var gridPt = Math.min(type.grid * (cell / trim.cell), cell * 72 * 0.78);
    var leftover = contentH - titleH - sceneH - checkH - blankH;
    return {
      contentW: contentW,
      contentH: contentH,
      titleH: titleH,
      checkH: checkH,
      blankH: blankH,
      sceneH: sceneH,
      card: card,
      colGap: colGap,
      rowGap: rowGap,
      pad: pad,
      cell: cell,
      gridN: gridN,
      type: type,
      gridPt: gridPt,
      checkW: card,
      bandGap: leftover / 3,
      sceneOffsetX: (contentW - (card * 2 + colGap)) / 2,
      capRatio: GRID_CAP_RATIO
    };
  }

  function minFontPt(geom) {
    var t = geom.type;
    return Math.min(t.title, t.scene, geom.gridPt, t.check, t.blank, t.flavor, t.key, t.page);
  }

  function formatPlacement(placement, scene) {
    var word = String((placement && placement.word) || '');
    var titled = word ? word.charAt(0) + word.slice(1).toLowerCase() : '';
    var row = Number(placement && placement.r) + 1;
    var col = Number(placement && placement.c) + 1;
    var dir = placement && placement.dir ? ' ' + placement.dir : '';
    return titled + ' ' + String(scene || '') + ' (row ' + row + ', col ' + col + ')' + dir;
  }

  // Mono answer-key lines wrap; estimate height so cases are never clipped by overflow:hidden.
  function estimateKeyCaseHeight(puzzle, contentW, keyPt) {
    var lineH = (keyPt * 1.25) / 72;
    var titleH = ((keyPt + 1) * 1.2) / 72 + 0.02;
    var gap = 0.08;
    // ~0.6em mono advance → chars/inch ≈ (72/pt) / 0.6
    var cpi = (72 / Math.max(7, keyPt)) / 0.6;
    var cpl = Math.max(28, contentW * cpi);
    function linesFor(text) {
      return Math.max(1, Math.ceil(String(text || '').length / cpl));
    }
    var weapon = puzzle.weapon || 'XXXXXXXX';
    var killer = puzzle.killer || 'XXXXXXXX';
    var victim = puzzle.victim || 'XXXXXXXX';
    var location = puzzle.location || 'XXXXXXXXXX';
    var sol = 'Weapon ' + weapon + ' · Killer ' + killer + ' · Victim ' + victim + ' · Location ' + location;
    var bits = [];
    if (puzzle.grids && puzzle.grids.length) {
      puzzle.grids.forEach(function (g) {
        (g.placed || []).forEach(function (pl) {
          if (pl.kind === 'evidence' || pl.kind === 'victim') {
            bits.push(formatPlacement(pl, g.scene));
          }
        });
      });
    } else {
      // Pre-build fallback: ~7 placement phrases (matches a finished case).
      bits.push(
        'Evidence Scene Name (row 12, col 12) across · Evidence Scene Name (row 12, col 12) across · ' +
        'Evidence Scene Name (row 12, col 12) down · Evidence Scene Name (row 12, col 12) across · ' +
        'Evidence Scene Name (row 12, col 12) up · Evidence Scene Name (row 12, col 12) across · ' +
        'Victimname Scene Name (row 12, col 12) across'
      );
    }
    return titleH + (linesFor(sol) + linesFor(bits.join(' · '))) * lineH + gap;
  }

  function packAnswerPages(push, trim, caseCount, perKey, puzzles) {
    // Rough page count → realistic gutter (max gutter makes the column too narrow).
    var roughPages = Math.max(24, 3 + caseCount + Math.ceil(caseCount / Math.max(4, perKey || 12)) + 2);
    var box = contentBox(pageMargins(1, roughPages));
    var contentW = trim.w - box.left - box.right;
    var contentH = trim.h - box.top - box.bottom;
    var type = TYPE[trim.id] || TYPE['8.5x11'];
    var headH = (type.title * 1.15) / 72 + 0.1;
    var budget = contentH - headH;
    var maxPer = Math.max(4, Math.min(20, perKey || 12));
    var list = puzzles && puzzles.length ? puzzles : null;
    var from = 0;

    while (from < caseCount) {
      var used = 0;
      var to = from - 1;
      while (to + 1 < caseCount && (to - from + 1) < maxPer) {
        var puzzle = list ? list[to + 1] : { id: to + 2 };
        if (!puzzle) break;
        var need = estimateKeyCaseHeight(puzzle, contentW, type.key);
        if (to >= from && used + need > budget) break;
        used += need;
        to += 1;
      }
      if (to < from) to = from;
      push('answers-text', { from: from, to: to });
      from = to + 1;
    }
  }

  function planBook(opts) {
    var trim = trimById(opts.trimId);
    var caseCount = opts.caseCount || 0;
    var howto = opts.howto !== false;
    var answers = opts.answers !== false;
    var perKey = opts.perKeyPage || 12;
    var pages = [];

    function push(kind, extra) {
      var p = { kind: kind, number: pages.length + 1 };
      if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) p[k] = extra[k];
      pages.push(p);
      return p;
    }

    push('title');
    push('copyright');
    if (howto) push('howto');
    var firstPuzzle = pages.length + 1;
    for (var i = 0; i < caseCount; i++) push('puzzle', { caseIndex: i });
    if (answers && caseCount) {
      packAnswerPages(push, trim, caseCount, perKey, opts.puzzles);
    }
    if (pages.length % 2 === 1) push('blank');

    var pageCount = pages.length;
    pages.forEach(function (p) {
      p.margins = pageMargins(p.number, pageCount);
      p.showNumber = p.kind === 'puzzle' || p.kind === 'answers-text';
      p.folio = p.number;
    });

    return {
      trim: trim,
      pages: pages,
      pageCount: pageCount,
      gutter: gutterFor(pageCount),
      firstPuzzle: firstPuzzle,
      gridSize: defaultGridSize(opts),
      geom: puzzleGeom(trim, contentBox(pageMargins(firstPuzzle, pageCount)), defaultGridSize(opts))
    };
  }

  function slug(text) {
    return (text || 'murder-search').toString().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'murder-search';
  }

  function pdfName(title, trim) {
    var t = trim.id.replace(/\./g, 'x');
    return slug(title) + '-interior-' + t + '.pdf';
  }

  function defaultCopyrightText(author) {
    var year = new Date().getFullYear();
    var line = 'Copyright © ' + year + (author ? ' ' + author : '');
    return [
      line,
      'All rights reserved. No part of this book may be reproduced without written permission, except for brief quotations in a review.',
      'Printed in the United States of America.',
      'This interior was prepared for Amazon KDP paperback: no bleed, black ink on white paper.'
    ].join('\n\n');
  }

  function copyrightParagraphs(settings) {
    var text = (settings.copyrightText || '').trim() || defaultCopyrightText(settings.author || '');
    var paras = [settings.bookTitle || 'Murder Search'];
    text.split(/\n\s*\n/).forEach(function (block) {
      var line = block.replace(/\s*\n\s*/g, ' ').trim();
      if (line) paras.push(line);
    });
    return paras;
  }

  global.MMLayout = {
    TRIMS: TRIMS,
    TYPE: TYPE,
    GRID_CAP_RATIO: GRID_CAP_RATIO,
    CONTENT_INSET: CONTENT_INSET,
    FOLIO_BAND: FOLIO_BAND,
    trimById: trimById,
    gutterFor: gutterFor,
    pageMargins: pageMargins,
    contentBox: contentBox,
    defaultGridSize: defaultGridSize,
    puzzleGeom: puzzleGeom,
    minFontPt: minFontPt,
    planBook: planBook,
    formatPlacement: formatPlacement,
    slug: slug,
    pdfName: pdfName,
    defaultCopyrightText: defaultCopyrightText,
    copyrightParagraphs: copyrightParagraphs
  };
})(typeof window !== 'undefined' ? window : globalThis);
