'use strict';

const { IN, maxPagesFor, MIN_PAGES, CONTENT_INSET_IN } = require('./constants');

function gutterMinForPageCount(pageCount) {
  if (pageCount <= 150) return 0.375;
  if (pageCount <= 300) return 0.5;
  if (pageCount <= 500) return 0.625;
  if (pageCount <= 700) return 0.75;
  return 0.875;
}

/**
 * Single source of truth for page geometry (spec §3.4).
 * All values in inches. Returns a function(isRecto) → box.
 */
function computeGeometry({ trimW, trimH, bleed, pageCount, gutterPad, outerMargin }) {
  const gutterMin = gutterMinForPageCount(pageCount);
  const gutter = gutterMin + gutterPad;
  const outerMin = bleed ? 0.375 : 0.25;
  const outer = Math.max(outerMargin, outerMin);

  const pageW = bleed ? trimW + 0.125 : trimW;
  const pageH = bleed ? trimH + 0.25 : trimH;
  const b = bleed ? 0.125 : 0;

  return function geometryForPage(isRecto) {
    return {
      pageW,
      pageH,
      gutter,
      gutterMin,
      outer,
      outerMin,
      bleed: b,
      left: isRecto ? gutter : outer + b,
      right: isRecto ? outer + b : gutter,
      top: outer + b,
      bottom: outer + b,
      get contentW() {
        return this.pageW - this.left - this.right;
      },
      get contentH() {
        return this.pageH - this.top - this.bottom;
      },
    };
  };
}

function contentBoxPt(pageIndex1, geoFn) {
  const isRecto = pageIndex1 % 2 === 1;
  const g = geoFn(isRecto);
  return {
    isRecto,
    pageW: g.pageW * IN,
    pageH: g.pageH * IN,
    x: g.left * IN,
    y: g.top * IN,
    w: g.contentW * IN,
    h: g.contentH * IN,
    left: g.left * IN,
    right: g.right * IN,
    top: g.top * IN,
    bottom: g.bottom * IN,
    gutter: g.gutter,
    gutterMin: g.gutterMin,
    outer: g.outer,
    outerMin: g.outerMin,
  };
}

/** Soft-padded draw box inside the KDP content/safe box */
function insetContentBox(box, insetIn) {
  const pad = (insetIn == null ? CONTENT_INSET_IN : insetIn) * IN;
  return {
    ...box,
    x: box.x + pad,
    y: box.y + pad,
    w: Math.max(0, box.w - pad * 2),
    h: Math.max(0, box.h - pad * 2),
    inset: pad,
  };
}

function validatePageLimits(trimId, paper, pageCount) {
  const max = maxPagesFor(trimId, paper);
  const errors = [];
  const warnings = [];
  if (pageCount < MIN_PAGES) {
    errors.push(`Page count ${pageCount} is below KDP minimum (${MIN_PAGES}).`);
  }
  if (pageCount > max) {
    errors.push(`Page count ${pageCount} exceeds maximum ${max} for ${trimId} / ${paper}.`);
  }
  return { max, errors, warnings };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    gutterMinForPageCount,
    computeGeometry,
    contentBoxPt,
    insetContentBox,
    validatePageLimits,
  };
}
