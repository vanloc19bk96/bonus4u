'use strict';

const { DEFAULT_CONFIG, maxPagesFor, MIN_PAGES, DIFFICULTY } = require('./constants');
const { validatePageLimits } = require('./geometry');
const { generateBook, sanitizeFilename, formatKeyLine } = require('./layout');
const { parseCsv, collectQuotes, prepareQuotePool } = require('./quotes');
const { renderPageToCanvas } = require('./render-canvas');
const { pageMeta } = require('./render-shared');
const { exportVectorPdf, exportRasterPdf, exportQcSheet } = require('./render-pdf');
const { canvasToPng300, canvasToJpeg300 } = require('./dpi-meta');
const { createZip, downloadBlob } = require('./zip');

const $ = (id) => document.getElementById(id);
const PREVIEW_DPI = 150;

let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
let book = null;
let pageIndex = 1;
let isStale = true;
let importedRows = [];
let cancelFlag = { cancelled: false };
let previewObserver = null;
let previewRenderToken = 0;
const loadedPages = new Set();
const visiblePages = new Set();

function radioValue(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
}

function setRadio(name, value) {
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}

function readForm() {
  config.book.title = $('title').value.trim();
  config.book.subtitle = $('subtitle').value.trim();
  config.book.volume = $('volume').value.trim();
  config.book.author = $('author').value.trim();
  config.book.publisher = $('publisher').value.trim();
  config.book.year = Number($('year').value) || new Date().getFullYear();
  config.book.isbn = $('isbn').value.trim();
  config.format.trim = '8.5x11';
  config.format.paper = $('paper').value;
  config.format.bleed = $('bleed').checked;
  config.format.largePrint = $('largePrint').checked;
  config.puzzles.count = Math.max(1, Number($('puzzleCount').value) || 1);
  config.puzzles.perPage = Math.max(1, Math.min(4, Number(radioValue('perPage') || DEFAULT_CONFIG.puzzles.perPage)));
  config.puzzles.mix = {
    easy: Number($('mixEasy').value) || 0,
    medium: Number($('mixMed').value) || 0,
    hard: Number($('mixHard').value) || 0,
    expert: Number($('mixExpert').value) || 0,
  };
  config.puzzles.order = radioValue('order') || 'progressive';
  config.puzzles.source = radioValue('source') || 'builtin';
  config.puzzles.freshKeyPerPuzzle = $('freshKey').checked;
  config.puzzles.allowReciprocal = $('allowReciprocal').checked;
  config.puzzles.numericVariant = $('numericVariant').checked;
  config.puzzles.stripPunctuation = $('stripPunct').checked;
  config.layout.gutterPad = Number($('gutterPad').value);
  if (!Number.isFinite(config.layout.gutterPad)) config.layout.gutterPad = 0.125;
  config.layout.outerMargin = Number($('outerMargin').value);
  if (!Number.isFinite(config.layout.outerMargin)) config.layout.outerMargin = 0.5;
  config.layout.cellSizeMax = Number($('cellSizeMax').value) || 20;
  config.layout.showPageNumbers = $('showPageNumbers').checked;
  config.sections.howToSolve = $('howToSolve').checked;
  config.sections.worksheet = $('worksheet').checked;
  config.sections.dedication = false;
  config.sections.notesEvery = 0;
  config.sections.solutionsPerPage = Math.max(
    2,
    Math.min(40, Number($('solutionsPerPage').value) || DEFAULT_CONFIG.sections.solutionsPerPage)
  );
  return config;
}

function writeForm(cfg) {
  $('title').value = cfg.book.title;
  $('subtitle').value = cfg.book.subtitle;
  $('volume').value = cfg.book.volume;
  $('author').value = cfg.book.author;
  $('publisher').value = cfg.book.publisher;
  $('year').value = cfg.book.year;
  $('isbn').value = cfg.book.isbn;
  $('paper').value = cfg.format.paper;
  $('bleed').checked = cfg.format.bleed;
  $('largePrint').checked = cfg.format.largePrint;
  $('puzzleCount').value = cfg.puzzles.count;
  setRadio('perPage', String(cfg.puzzles.perPage));
  $('mixEasy').value = cfg.puzzles.mix.easy;
  $('mixMed').value = cfg.puzzles.mix.medium;
  $('mixHard').value = cfg.puzzles.mix.hard;
  $('mixExpert').value = cfg.puzzles.mix.expert;
  setRadio('order', cfg.puzzles.order);
  setRadio('source', cfg.puzzles.source);
  $('freshKey').checked = cfg.puzzles.freshKeyPerPuzzle;
  $('allowReciprocal').checked = cfg.puzzles.allowReciprocal;
  $('numericVariant').checked = cfg.puzzles.numericVariant;
  $('stripPunct').checked = cfg.puzzles.stripPunctuation;
  $('gutterPad').value = cfg.layout.gutterPad;
  $('outerMargin').value = cfg.layout.outerMargin;
  $('cellSizeMax').value = cfg.layout.cellSizeMax;
  $('showPageNumbers').checked = cfg.layout.showPageNumbers;
  $('howToSolve').checked = cfg.sections.howToSolve;
  $('worksheet').checked = cfg.sections.worksheet;
  $('solutionsPerPage').value = cfg.sections.solutionsPerPage;
  updateSourceUi();
  updatePageLimitHint();
}

function markStale() {
  isStale = true;
  $('exportRow').classList.add('stale');
  document.querySelectorAll('.export-btn').forEach((b) => {
    b.disabled = true;
  });
  $('btnExportPage').disabled = true;
  updateOuterMarginHint();
}

function markFresh() {
  isStale = false;
  $('exportRow').classList.remove('stale');
}

function updateSourceUi() {
  const src = radioValue('source') || 'builtin';
  $('pasteWrap').hidden = src !== 'paste';
  $('importWrap').hidden = src !== 'import';
  if (src === 'paste') updatePasteStatus();
  else clearPasteStatus();
}

function formatSkipReason(reason) {
  const r = String(reason || '');
  if (r.startsWith('too short')) return 'too short (need ≥20 characters)';
  if (r.startsWith('too long')) return r;
  if (r.startsWith('distinct letters')) {
    const m = r.match(/\((\d+)\)/);
    const n = m ? m[1] : '?';
    const need = r.includes('< 10') ? 10 : 12;
    return `only ${n} different letters (need ≥${need})`;
  }
  if (r === 'disallowed characters') return 'contains characters other than A–Z and basic punctuation';
  if (r === 'duplicate') return 'duplicate of another line';
  if (r === 'empty') return 'empty line';
  return r;
}

function clearPasteStatus() {
  const el = $('pasteStatus');
  if (!el) return;
  el.textContent = '';
  el.className = 'hint';
}

function setPasteStatus(lines, isError) {
  const el = $('pasteStatus');
  if (!el) return;
  el.textContent = (lines || []).filter(Boolean).join('\n');
  el.className = isError ? 'field-error' : 'hint';
}

function updatePasteStatus() {
  const el = $('pasteStatus');
  if (!el) return;
  const src = radioValue('source') || 'builtin';
  if (src !== 'paste') {
    clearPasteStatus();
    return;
  }
  const pasteText = $('pasteBox').value || '';
  const lines = pasteText.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) {
    setPasteStatus(['Paste one quote per line. Optional: text | author'], false);
    return;
  }
  const pool = collectQuotes('paste', pasteText, [], 'any');
  const { ready, skipped } = prepareQuotePool(pool, DIFFICULTY.expert.maxLen, { minDistinct: 10 });
  const msgs = [];
  if (ready.length) msgs.push(`${ready.length} valid quote${ready.length === 1 ? '' : 's'}`);
  for (const s of skipped.slice(0, 8)) {
    const preview = String(s.text || '').trim().slice(0, 40) || '(empty)';
    msgs.push(`Line rejected: "${preview}" — ${formatSkipReason(s.reason)}`);
  }
  if (skipped.length > 8) msgs.push(`…and ${skipped.length - 8} more rejected`);
  if (!ready.length && skipped.length) {
    msgs.unshift('No valid quotes yet. Need ≥20 characters, ≥10 different letters, a word of ≥4 letters.');
  }
  setPasteStatus(msgs, skipped.length > 0);
}

function updatePageLimitHint() {
  const paper = $('paper').value;
  const max = maxPagesFor('8.5x11', paper);
  $('pageLimitHint').textContent = `8.5 × 11 · KDP page limits: ${MIN_PAGES}–${max}.`;
}

function updatePerPageHint() {
  const el = $('perPageHint');
  if (!el) return;
  const perPage = Number(radioValue('perPage') || DEFAULT_CONFIG.puzzles.perPage);
  if (perPage >= 4) {
    el.textContent = '4/page: best with Easy–Medium. Hard/Expert quotes are longer — if Generate fails, try Per page 2.';
  } else if (perPage === 3) {
    el.textContent = '3/page: Hard/Expert may still be tight. If Generate fails, lower Per page or Hard/Expert %.';
  } else {
    el.textContent = '';
  }
}

function updateOuterMarginHint() {
  readForm();
  const outerMin = config.format.bleed ? 0.375 : 0.25;
  if (config.layout.outerMargin < outerMin) {
    $('outerError').textContent = `Minimum ${outerMin}" for this bleed mode.`;
  } else {
    $('outerError').textContent = '';
  }
}

function enableExportIfReady(canExport) {
  if (book && !isStale && canExport) {
    document.querySelectorAll('.export-btn').forEach((b) => {
      b.disabled = false;
    });
    $('btnExportPage').disabled = false;
    markFresh();
  }
}

function bookHasBlockingErrors(bookResult) {
  const lim = validatePageLimits(
    config.format.trim,
    config.format.paper,
    bookResult.stats.pageCount
  );
  if (lim.errors.length) return true;
  if (config.layout.outerMargin < bookResult.stats.outerMin) return true;
  return false;
}

function showProgress(active, label, ratio) {
  $('progressWrap').classList.toggle('active', !!active);
  if (label) $('progressLabel').textContent = label;
  $('progressBar').style.width = Math.round((ratio || 0) * 100) + '%';
}

function previewOverlays() {
  return {
    showMargins: $('showMargins').checked,
    showSafe: $('showSafe').checked,
  };
}

function updatePageLabel() {
  if (!book) return;
  document.querySelectorAll('.preview-page').forEach((el) => {
    el.classList.toggle('is-active', Number(el.dataset.page) === pageIndex);
  });
}

function disconnectPreviewObserver() {
  if (previewObserver) {
    previewObserver.disconnect();
    previewObserver = null;
  }
}

function paintSlot(pageNo) {
  if (!book) return;
  const slot = document.querySelector(`.preview-page[data-page="${pageNo}"] .preview-page-slot`);
  if (!slot) return;
  const canvas = slot.querySelector('canvas');
  if (!canvas) return;
  slot.classList.add('is-loading');
  const off = renderPageToCanvas(book, pageNo, PREVIEW_DPI, previewOverlays());
  canvas.width = off.width;
  canvas.height = off.height;
  canvas.getContext('2d').drawImage(off, 0, 0);
  slot.classList.remove('is-loading');
  loadedPages.add(pageNo);
}

function unloadSlot(pageNo) {
  const slot = document.querySelector(`.preview-page[data-page="${pageNo}"] .preview-page-slot`);
  if (!slot) return;
  const canvas = slot.querySelector('canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // keep intrinsic size via CSS aspect-ratio; shrink bitmap memory
  canvas.width = 1;
  canvas.height = 1;
  loadedPages.delete(pageNo);
}

function syncVisiblePage() {
  if (!visiblePages.size) return;
  const sorted = Array.from(visiblePages).sort((a, b) => a - b);
  // Prefer the topmost visible page in the viewport
  const scroll = $('previewScroll');
  const rootTop = scroll.getBoundingClientRect().top;
  let best = sorted[0];
  let bestDist = Infinity;
  for (const n of sorted) {
    const el = document.querySelector(`.preview-page[data-page="${n}"]`);
    if (!el) continue;
    const dist = Math.abs(el.getBoundingClientRect().top - rootTop - 8);
    if (dist < bestDist) {
      bestDist = dist;
      best = n;
    }
  }
  if (best !== pageIndex) {
    pageIndex = best;
    updatePageLabel();
  }
}

function mountPreviewScroll() {
  const scroll = $('previewScroll');
  disconnectPreviewObserver();
  loadedPages.clear();
  visiblePages.clear();
  previewRenderToken += 1;
  const token = previewRenderToken;
  scroll.innerHTML = '';

  if (!book) {
    scroll.innerHTML = '<div class="preview-empty" id="previewEmpty">No pages yet — click Generate book.</div>';
    updatePageLabel();
    return;
  }

  const { box } = pageMeta(book, 1);

  for (let i = 1; i <= book.pages.length; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'preview-page';
    wrap.dataset.page = String(i);
    wrap.innerHTML =
      `<div class="preview-page-slot is-loading" style="aspect-ratio:${box.pageW} / ${box.pageH}">` +
      `<canvas aria-label="Page ${i}"></canvas></div>`;
    scroll.appendChild(wrap);
  }

  previewObserver = new IntersectionObserver(
    (entries) => {
      if (token !== previewRenderToken) return;
      for (const entry of entries) {
        const pageNo = Number(entry.target.dataset.page);
        if (!pageNo) continue;
        if (entry.isIntersecting) {
          visiblePages.add(pageNo);
          if (!loadedPages.has(pageNo)) paintSlot(pageNo);
        } else {
          visiblePages.delete(pageNo);
          // Unload pages far from viewport to keep memory in check
          if (loadedPages.has(pageNo) && Math.abs(pageNo - pageIndex) > 6) {
            unloadSlot(pageNo);
          }
        }
      }
      syncVisiblePage();
    },
    { root: scroll, rootMargin: '240px 0px', threshold: 0.01 }
  );

  scroll.querySelectorAll('.preview-page').forEach((el) => previewObserver.observe(el));
  pageIndex = 1;
  updatePageLabel();
  scroll.scrollTop = 0;
}

function refreshPreview() {
  if (!book) {
    mountPreviewScroll();
    return;
  }
  // Overlay/settings change: repaint only loaded (visible) pages
  const pages = Array.from(loadedPages);
  for (const n of pages) paintSlot(n);
  updatePageLabel();
}

function freshSeed() {
  return ((Date.now() ^ ((Math.random() * 0x100000000) >>> 0)) >>> 0) || 1;
}

async function onGenerate() {
  readForm();
  config.puzzles.seed = freshSeed();
  cancelFlag = { cancelled: false };
  showProgress(true, 'Generating…', 0);
  try {
    const pasteText = $('pasteBox') ? $('pasteBox').value : '';
    const result = await generateBook(
      config,
      { pasteText, importedRows, cancelFlag },
      (r, msg) => showProgress(true, msg, r)
    );
    if (result.cancelled) {
      showProgress(false);
      return;
    }
    if (result.error) {
      if (config.puzzles.source === 'paste') updatePasteStatus();
      window.alert(result.error);
      if (result.errorKind === 'autofit') updatePerPageHint();
      book = null;
      mountPreviewScroll();
      markStale();
      showProgress(false);
      return;
    }
    book = result;
    isStale = false;
    $('puzzleCount').value = config.puzzles.count;
    if (config.puzzles.source === 'paste') updatePasteStatus();
    const blocked = bookHasBlockingErrors(book);
    if (!blocked) {
      enableExportIfReady(true);
    } else {
      markStale();
      isStale = true;
    }
    mountPreviewScroll();
  } catch (err) {
    window.alert(String(err.message || err));
  }
  showProgress(false);
}

async function withExport(fn) {
  if (!book || isStale) return;
  cancelFlag = { cancelled: false };
  showProgress(true, 'Exporting…', 0);
  try {
    await fn();
  } catch (err) {
    window.alert(String(err.message || err));
  }
  showProgress(false);
}

async function exportImageZip(kind) {
  await withExport(async () => {
    const files = [];
    const slug = sanitizeFilename(config.book.title);
    const n = book.pages.length;
    for (let i = 1; i <= n; i++) {
      if (cancelFlag.cancelled) return;
      const canvas = renderPageToCanvas(book, i, 300, null);
      const bytes =
        kind === 'png' ? await canvasToPng300(canvas) : await canvasToJpeg300(canvas, 0.92);
      const page = book.pages[i - 1];
      let type = page.kind;
      if (page.kind === 'puzzle' && page.payload.puzzles) {
        type = 'puzzle-' + String(page.payload.puzzles[0].n).padStart(3, '0');
      }
      const name = `${slug}_p${String(i).padStart(3, '0')}_${type}.${kind}`;
      files.push({ name, data: bytes });
      if (i % 4 === 0) {
        showProgress(true, `${kind.toUpperCase()} ${i}/${n}`, i / n);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    const zip = createZip(files);
    downloadBlob(`${slug}_${kind}.zip`, zip, 'application/zip');
  });
}

function exportCsv() {
  if (!book) return;
  const rows = [['number', 'difficulty', 'quote', 'author', 'key']];
  for (const p of book.puzzles) {
    rows.push([
      p.n,
      p.difficulty,
      '"' + p.plain.replace(/"/g, '""') + '"',
      '"' + (p.author || '').replace(/"/g, '""') + '"',
      '"' + formatKeyLine(p.key, p.numeric).replace(/"/g, '""') + '"',
    ]);
  }
  const csv = rows.map((r) => r.join(',')).join('\n');
  downloadBlob(
    sanitizeFilename(config.book.title) + '_puzzles.csv',
    new TextEncoder().encode(csv),
    'text/csv'
  );
}

const PRESET_KEY = 'cryptogram.preset.v3';
const PRESET_KEYS_LEGACY = ['cryptogram.preset.v2', 'cryptogram.preset.v1'];

function savePreset() {
  readForm();
  const data = JSON.stringify(config, null, 2);
  downloadBlob(sanitizeFilename(config.book.title) + '_preset.json', new TextEncoder().encode(data), 'application/json');
  try {
    localStorage.setItem(PRESET_KEY, data);
    for (const key of PRESET_KEYS_LEGACY) localStorage.removeItem(key);
  } catch (e) {
    /* file:// may block */
  }
}

function loadPresetObject(obj, options) {
  if (!obj || typeof obj !== 'object') return;
  const opts = options || {};
  config = Object.assign(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), obj);
  config.book = Object.assign({}, DEFAULT_CONFIG.book, obj.book || {});
  config.format = Object.assign({}, DEFAULT_CONFIG.format, obj.format || {});
  config.puzzles = Object.assign({}, DEFAULT_CONFIG.puzzles, obj.puzzles || {});
  config.puzzles.mix = Object.assign({}, DEFAULT_CONFIG.puzzles.mix, (obj.puzzles && obj.puzzles.mix) || {});
  config.layout = Object.assign({}, DEFAULT_CONFIG.layout, obj.layout || {});
  config.sections = Object.assign({}, DEFAULT_CONFIG.sections, obj.sections || {});
  // Always lock trim; ignore older presets with other sizes
  config.format.trim = '8.5x11';
  // Legacy autosave — adopt current product defaults for migrated keys
  if (opts.resetPerPage) {
    config.puzzles.perPage = DEFAULT_CONFIG.puzzles.perPage;
  }
  if (opts.resetSolutionsPerPage) {
    config.sections.solutionsPerPage = DEFAULT_CONFIG.sections.solutionsPerPage;
  }
  writeForm(config);
  updatePerPageHint();
  markStale();
}

function registerPrintFonts() {
  if (typeof FONT_REGULAR_B64 === 'undefined' || document.getElementById('printFontFace')) return;
  const style = document.createElement('style');
  style.id = 'printFontFace';
  style.textContent = `
@font-face {
  font-family: 'Atkinson Hyperlegible';
  src: url(data:font/ttf;base64,${FONT_REGULAR_B64}) format('truetype');
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: 'Atkinson Hyperlegible';
  src: url(data:font/ttf;base64,${FONT_BOLD_B64}) format('truetype');
  font-weight: 700;
  font-style: normal;
}`;
  document.head.appendChild(style);
  if (document.fonts && document.fonts.load) {
    document.fonts.load('14px "Atkinson Hyperlegible"').catch(() => {});
    document.fonts.load('bold 14px "Atkinson Hyperlegible"').catch(() => {});
  }
}

function bind() {
  registerPrintFonts();
  writeForm(config);

  try {
    const saved = localStorage.getItem(PRESET_KEY);
    if (saved) {
      loadPresetObject(JSON.parse(saved));
    } else {
      for (const key of PRESET_KEYS_LEGACY) {
        const legacy = localStorage.getItem(key);
        if (!legacy) continue;
        loadPresetObject(JSON.parse(legacy), {
          resetPerPage: true,
          resetSolutionsPerPage: true,
        });
        localStorage.removeItem(key);
        break;
      }
    }
  } catch (e) {
    /* ignore */
  }

  const staleIds = [
    'title', 'subtitle', 'volume', 'year', 'author', 'publisher', 'isbn', 'paper',
    'bleed', 'puzzleCount', 'largePrint', 'mixEasy', 'mixMed', 'mixHard', 'mixExpert',
    'freshKey', 'allowReciprocal', 'numericVariant', 'stripPunct', 'gutterPad',
    'outerMargin', 'cellSizeMax', 'showPageNumbers', 'howToSolve',
    'worksheet', 'solutionsPerPage',
    'pasteBox',
  ];
  for (const id of staleIds) {
    const el = $(id);
    if (el) el.addEventListener('change', markStale);
    if (el) el.addEventListener('input', markStale);
  }
  $('pasteBox').addEventListener('input', updatePasteStatus);
  $('pasteBox').addEventListener('change', updatePasteStatus);
  document.querySelectorAll('input[type="radio"]').forEach((el) => {
    el.addEventListener('change', () => {
      updateSourceUi();
      markStale();
    });
  });
  $('paper').addEventListener('change', updatePageLimitHint);
  $('largePrint').addEventListener('change', () => {
    if ($('largePrint').checked) {
      setRadio('perPage', '1');
      markStale();
    }
  });
  document.querySelectorAll('input[name="perPage"]').forEach((el) => {
    el.addEventListener('change', () => {
      if ($('largePrint').checked && el.value !== '1') {
        $('largePrint').checked = false;
      }
      updatePerPageHint();
      markStale();
    });
  });
  updatePerPageHint();

  $('btnGenerate').addEventListener('click', onGenerate);
  $('btnCancel').addEventListener('click', () => {
    cancelFlag.cancelled = true;
  });
  $('showMargins').addEventListener('change', refreshPreview);
  $('showSafe').addEventListener('change', refreshPreview);
  $('previewScroll').addEventListener('scroll', () => {
    // Keep active page label in sync while scrolling loaded slots
    syncVisiblePage();
  }, { passive: true });

  $('btnPdf').addEventListener('click', () =>
    withExport(() => exportVectorPdf(book, (r, m) => showProgress(true, m, r), cancelFlag))
  );
  $('btnPdfFlat').addEventListener('click', () =>
    withExport(() => exportRasterPdf(book, (r, m) => showProgress(true, m, r), cancelFlag))
  );
  $('btnPngZip').addEventListener('click', () => exportImageZip('png'));
  $('btnJpgZip').addEventListener('click', () => exportImageZip('jpg'));
  $('btnCsv').addEventListener('click', exportCsv);
  $('btnQc').addEventListener('click', () => withExport(() => exportQcSheet(book)));
  $('btnExportPage').addEventListener('click', async () => {
    if (!book) return;
    const canvas = renderPageToCanvas(book, pageIndex, 300, null);
    const bytes = await canvasToPng300(canvas);
    const slug = sanitizeFilename(config.book.title);
    downloadBlob(`${slug}_p${String(pageIndex).padStart(3, '0')}.png`, bytes, 'image/png');
  });

  $('btnSave').addEventListener('click', savePreset);
  $('btnLoad').addEventListener('click', () => $('presetFile').click());
  $('presetFile').addEventListener('change', async () => {
    const f = $('presetFile').files[0];
    if (!f) return;
    const text = await f.text();
    loadPresetObject(JSON.parse(text));
  });
  $('importFile').addEventListener('change', async () => {
    const f = $('importFile').files[0];
    if (!f) return;
    const text = await f.text();
    if (/\.csv$/i.test(f.name) || text.includes(',')) importedRows = parseCsv(text);
    else {
      importedRows = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const parts = l.split('|');
          return { text: parts[0].trim(), author: (parts[1] || '').trim() };
        });
    }
    $('importStatus').textContent = `Loaded ${importedRows.length} rows from ${f.name}`;
    markStale();
  });

  $('btnAbout').addEventListener('click', () => $('aboutModal').classList.add('open'));
  $('btnCloseAbout').addEventListener('click', () => $('aboutModal').classList.remove('open'));
  $('aboutModal').addEventListener('click', (e) => {
    if (e.target === $('aboutModal')) $('aboutModal').classList.remove('open');
  });

  updateOuterMarginHint();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { readForm, loadPresetObject };
}
