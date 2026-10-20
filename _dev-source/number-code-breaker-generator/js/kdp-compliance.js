/*
 * kdp-compliance.js — the live KDP checklist and the gate on PDF export.
 *
 * Errors block export. Warnings never do. Every message explains what to change.
 */
(function (global) {
  'use strict';

  var C = global.NCB_CONST;
  var U = global.NCB_UTILS;
  var LAYOUT = global.NCB_LAYOUT;

  function check(status, label, detail) {
    return { status: status, label: label, detail: detail || '' };
  }

  /**
   * @param {object} book        book state (puzzles included)
   * @param {object} built       result of NCB_BOOK.buildBook
   * @param {object} validation  result of NCB_VALIDATOR.validateBook, or null
   */
  function buildComplianceReport(book, built, validation) {
    var errors = [];
    var warnings = [];
    var checks = [];

    var rules = built.rules;
    var trim = C.KDP_TRIM_SIZES[book.print.trimSizeId];
    var actual = built.pages.length;
    var effective = LAYOUT.getEffectivePageCount(actual);

    /* --- trim and page size --- */
    checks.push(check('pass', 'Trim: ' + trim.label));
    checks.push(check('pass', rules.bleed ? 'Bleed on' : 'No bleed',
      'PDF page ' + rules.pageWidthIn.toFixed(3) + ' × ' + rules.pageHeightIn.toFixed(3) + ' in (' +
      Math.round(rules.pageWidthPt * 1000) / 1000 + ' × ' + Math.round(rules.pageHeightPt * 1000) / 1000 + ' pt)'));

    /* --- page count --- */
    var pageLabel = actual + ' PDF page' + (actual === 1 ? '' : 's') + ' / ' + effective + ' effective page' + (effective === 1 ? '' : 's');
    if (actual === 0) {
      errors.push('The book has no pages yet. Generate the book first.');
      checks.push(check('fail', pageLabel));
    } else if (effective < rules.minPages) {
      errors.push('This setup creates only ' + effective + ' effective KDP pages. The selected ' + trim.label +
        ' black-ink paperback profile requires at least ' + rules.minPages + ' pages. Increase the puzzle count.');
      checks.push(check('fail', pageLabel, 'Minimum for this profile is ' + rules.minPages + '.'));
    } else if (effective > rules.maxPages) {
      errors.push('This setup would exceed the current page limit for a ' + trim.label + ' black-ink paperback (' +
        rules.maxPages + ' pages). Reduce the puzzle count or choose a denser puzzles-per-page setting.');
      checks.push(check('fail', pageLabel, 'Maximum for this profile is ' + rules.maxPages + '.'));
    } else {
      checks.push(check('pass', pageLabel, 'Allowed range ' + rules.minPages + '–' + rules.maxPages + ' for this profile.'));
    }

    // The builder always pads an odd manuscript to an even physical page count,
    // so KDP never inserts a blank page of its own. Nothing to warn about here.

    /* --- margins --- */
    var gutterOk = rules.marginInsideIn >= rules.kdpMinGutterIn;
    checks.push(check(gutterOk ? 'pass' : 'fail', 'Gutter: ' + U.formatInches(rules.marginInsideIn),
      'KDP minimum at ' + effective + ' pages is ' + U.formatInches(rules.kdpMinGutterIn) + '.'));
    if (!gutterOk) errors.push('The inside/gutter margin is smaller than the KDP minimum for this page count.');

    var outsideOk = rules.marginOutsideIn >= rules.kdpMinOutsideIn &&
      rules.marginTopIn >= rules.kdpMinOutsideIn && rules.marginBottomIn >= rules.kdpMinOutsideIn;
    checks.push(check(outsideOk ? 'pass' : 'fail', 'Outside margin: ' + U.formatInches(rules.marginOutsideIn),
      'KDP minimum is ' + U.formatInches(rules.kdpMinOutsideIn) + (rules.bleed ? ' with bleed.' : ' without bleed.')));
    if (!outsideOk) errors.push('The outside, top or bottom margin is smaller than the KDP minimum.');

    /* --- puzzles --- */
    var total = (book.puzzles || []).length;
    if (total === 0) {
      errors.push('No puzzles have been generated yet.');
      checks.push(check('fail', 'No puzzles generated'));
    } else if (validation) {
      var unique = validation.uniqueCount;
      var uniqueOk = unique === total;
      checks.push(check(uniqueOk ? 'pass' : 'fail', unique + ' / ' + total + ' puzzles have unique solutions'));
      if (!uniqueOk) {
        errors.push((total - unique) + ' puzzle' + (total - unique === 1 ? '' : 's') +
          ' did not pass the unique-solution check. Regenerate the book.');
        for (var v = 0; v < validation.issues.length && v < 6; v++) errors.push(validation.issues[v]);
      }
    } else {
      checks.push(check('warn', total + ' puzzles generated', 'Not yet re-validated.'));
    }

    /* --- safe area --- */
    var overflowing = 0;
    for (var i = 0; i < built.pages.length; i++) if (built.pages[i].overflow) overflowing++;

    var densityFits = !built.densityLayout || built.densityLayout.fits;
    if (overflowing > 0) {
      errors.push(overflowing + ' page' + (overflowing === 1 ? '' : 's') + ' overflow the safe content area.');
      checks.push(check('fail', overflowing + ' page(s) overflow the safe area'));
    } else if (!densityFits) {
      var digitPt = built.densityLayout ? built.densityLayout.card.digitPt : 0;
      errors.push('At this trim size the chosen puzzles-per-page setting shrinks the puzzle digits to ' +
        digitPt.toFixed(1) + ' pt, below the ' + C.MIN_FONT_PT.puzzleDigit + ' pt minimum.' +
        (built.density.recommended ? ' Use ' + built.density.recommended + ' puzzles per page instead.' : ''));
      checks.push(check('fail', 'Puzzle digits too small at this density'));
    } else {
      checks.push(check('pass', 'All content fits the safe area',
        built.densityLayout ? 'Puzzle digits ' + built.densityLayout.card.digitPt.toFixed(1) + ' pt.' : ''));
    }

    /* --- page-count sanity on unique page ids --- */
    var seenIds = {};
    for (var d = 0; d < built.pages.length; d++) {
      if (seenIds[built.pages[d].id]) { errors.push('Internal error: duplicate page id ' + built.pages[d].id + '.'); break; }
      seenIds[built.pages[d].id] = true;
    }

    /* --- content warnings --- */
    if (!book.answers.enabled) {
      warnings.push('The answer key is turned off. Readers will have no way to check their solutions.');
    }
    if (book.frontMatter.copyright.enabled && !String(book.frontMatter.copyright.text || '').trim()) {
      warnings.push('The copyright page is on but its text is empty, so it will print as a blank page.');
    }
    if (book.frontMatter.instructions.enabled && !String(book.frontMatter.instructions.text || '').trim()) {
      warnings.push('The instruction page is on but its text is empty, so it will print as a blank page.');
    }
    if (total > 0 && total < 10) {
      warnings.push('Only ' + total + ' puzzle' + (total === 1 ? '' : 's') + ' — most published puzzle books carry far more.');
    }

    var ok = errors.length === 0;
    checks.push(check(ok ? 'pass' : 'fail', ok ? 'PDF export ready' : 'PDF export blocked'));

    return {
      ok: ok,
      errors: errors,
      warnings: warnings.concat(built.warnings || []),
      checks: checks,
      actualPageCount: actual,
      effectivePageCount: effective,
      minPages: rules.minPages,
      maxPages: rules.maxPages
    };
  }

  global.NCB_COMPLIANCE = { buildComplianceReport: buildComplianceReport };
})(window);
