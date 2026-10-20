'use strict';

const { IN } = require('./constants');
const { drawPageContent, pageMeta } = require('./render-shared');

function makeCanvasApi(ctx, scale) {
  const S = (v) => v * scale;
  let fontFamily = 'sans-serif';
  let fontWeight = 'normal';
  let fontSize = 12;

  function applyFont() {
    const fam = '"Atkinson Hyperlegible", system-ui, "Segoe UI", sans-serif';
    ctx.font = `${fontWeight === 'bold' ? 'bold ' : ''}${S(fontSize)}px ${fam}`;
  }

  return {
    setFont(family, weight, size) {
      fontFamily = family;
      fontWeight = weight;
      fontSize = size;
      applyFont();
    },
    setFill(color) {
      ctx.fillStyle = color;
    },
    setStroke(color, width, dash) {
      ctx.strokeStyle = color;
      ctx.lineWidth = S(width || 1);
      ctx.setLineDash(dash ? dash.map(S) : []);
    },
    text(str, x, y, opts) {
      applyFont();
      opts = opts || {};
      ctx.textAlign = opts.align || 'left';
      ctx.textBaseline = 'alphabetic';
      if (opts.maxWidth) {
        ctx.fillText(String(str), S(x), S(y), S(opts.maxWidth));
      } else {
        ctx.fillText(String(str), S(x), S(y));
      }
      ctx.textAlign = 'left';
    },
    measure(str) {
      applyFont();
      return ctx.measureText(String(str)).width / scale;
    },
    line(x1, y1, x2, y2) {
      ctx.beginPath();
      ctx.moveTo(S(x1), S(y1));
      ctx.lineTo(S(x2), S(y2));
      ctx.stroke();
      ctx.setLineDash([]);
    },
    rect(x, y, w, h, fill) {
      if (fill) ctx.fillRect(S(x), S(y), S(w), S(h));
      else ctx.strokeRect(S(x), S(y), S(w), S(h));
    },
    clipRect(x, y, w, h) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(S(x), S(y), S(w), S(h));
      ctx.clip();
    },
    clearClip() {
      ctx.restore();
    },
  };
}

function renderPageToCanvas(book, pageIndex1, dpi, overlays) {
  const { box } = pageMeta(book, pageIndex1);
  const scale = dpi / 72;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.pageW * scale);
  canvas.height = Math.round(box.pageH * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const api = makeCanvasApi(ctx, scale);
  drawPageContent(api, book, pageIndex1, overlays);
  return canvas;
}

function paintPreview(canvasEl, book, pageIndex1, overlays) {
  if (!book || !canvasEl) return;
  const dpi = 110;
  const off = renderPageToCanvas(book, pageIndex1, dpi, overlays);
  const ctx = canvasEl.getContext('2d');
  canvasEl.width = off.width;
  canvasEl.height = off.height;
  ctx.drawImage(off, 0, 0);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderPageToCanvas, paintPreview, makeCanvasApi };
}
