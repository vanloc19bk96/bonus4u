'use strict';

const {
  TRIM_SIZES,
  DEFAULT_SETTINGS,
  gutterForPageCount,
} = require('./constants');

const LARGE_PRINT_CELL_IN = 0.45;
const { parseWordList, parsePrompt2Blocks } = require('./parser');
const { generatePuzzle } = require('./crossword');
const { buildPagePlan, computeMaxGrid } = require('./layout');
const { validateState } = require('./validate');
const { renderPageSvg } = require('./render-preview');
const { exportPdf } = require('./render-pdf');
const { runSelfTest } = require('./selftest');

const SAMPLE_RAW = `# Baby Boomer sample — packs cleanly on large-print pages
RADIO | Kitchen companion before TV dinners
BEATLES | British band that sparked Beatlemania
MUSTANG | Ford pony car introduced in 1964
TRANSISTOR | Tiny device that powered pocket radios
SOCKHOP | Casual school dance in the gym
POLAROID | Instant camera brand name
SITAR | Indian string instrument heard in 60s rock
PEACE | Antiwar symbol of the late 1960s
APOLLO | NASA program that reached the Moon
DINER | Chrome counter spot for milkshakes
RECORD | Vinyl disc spun on the hi-fi
DRIVEIN | Outdoor cinema viewed from the car
EDSEL | Ill-fated Ford model of the late 1950s
TWIST | Dance craze popularized by Chubby Checker
`;

function uid() {
  return 'p' + Math.random().toString(36).slice(2, 9);
}

function randomSeed() {
  return ((Math.random() * 0xffffffff) >>> 0) || 1;
}

const state = {
  version: 1,
  settings: {
    ...DEFAULT_SETTINGS,
    trim: { ...DEFAULT_SETTINGS.trim },
    seed: randomSeed(),
  },
  puzzles: [
    {
      id: uid(),
      title: 'Nostalgia Starter',
      raw: SAMPLE_RAW,
      entries: [],
      result: null,
    },
  ],
};

let plan = null;
let currentPage = 1;
let fitMode = true;

function $(id) {
  return document.getElementById(id);
}

function estimatePageCountForGutter() {
  if (plan && plan.pageCount) return plan.pageCount;
  // Rough upper bound before first layout: puzzle pages + answer pages
  const n = Math.max(1, state.puzzles.length);
  const answers = state.settings.answerKey
    ? Math.ceil(n / (state.settings.answersPerPage || 4))
    : 0;
  return Math.max(24, n + answers);
}

function applyAutoMaxGrid() {
  const pageCount = estimatePageCountForGutter();
  const gutter = gutterForPageCount(pageCount);
  state.settings.maxGrid = computeMaxGrid(state.settings, { gutter, pageCount });
  syncMaxLenFromGrid();
}

function readSettingsFromForm() {
  const trimId = $('trimSize').value;
  const trim = TRIM_SIZES.find((t) => t.id === trimId) || TRIM_SIZES[5];
  state.settings = {
    bookTitle: '',
    trim: { w: trim.w, h: trim.h },
    bleed: $('bleed').checked,
    maxGrid: state.settings.maxGrid || DEFAULT_SETTINGS.maxGrid,
    cellSize: LARGE_PRINT_CELL_IN,
    puzzleTitleFormat: $('puzzleTitleFormat').value || 'Puzzle {n}',
    cluesColumns: 2,
    cluesPlacement: 'same',
    answerKey: $('answerKey').checked,
    answersPerPage: Number($('answersPerPage').value),
    pageNumbers: $('pageNumbers').checked,
    seed: state.settings.seed || randomSeed(),
    filledBlocks: false,
  };
  applyAutoMaxGrid();
}

function writeSettingsToForm() {
  const s = state.settings;
  const trim =
    TRIM_SIZES.find(
      (t) => Math.abs(t.w - s.trim.w) < 0.01 && Math.abs(t.h - s.trim.h) < 0.01
    ) || TRIM_SIZES[5];
  $('trimSize').value = trim.id;
  $('bleed').checked = !!s.bleed;
  s.cellSize = LARGE_PRINT_CELL_IN;
  $('puzzleTitleFormat').value = s.puzzleTitleFormat || 'Puzzle {n}';
  $('answerKey').checked = !!s.answerKey;
  $('answersPerPage').value = String(s.answersPerPage);
  $('pageNumbers').checked = s.pageNumbers !== false;
  applyAutoMaxGrid();
}

function parsePuzzle(puzzle) {
  const parsed = parseWordList(puzzle.raw, state.settings.maxGrid);
  puzzle.entries = parsed.entries;
  puzzle.parseWarnings = parsed.warnings;
  return parsed;
}

function statusLine(puzzle) {
  const parsed = puzzle.entries ? puzzle.entries.length : 0;
  if (!puzzle.result) {
    return `${parsed} words parsed · not generated`;
  }
  const r = puzzle.result;
  return `${parsed} words parsed · ${r.placed.length} placed · ${r.unplaced.length} skipped · grid ${r.rows}×${r.cols}`;
}

function renderPuzzleList() {
  const host = $('puzzleList');
  host.innerHTML = '';
  state.puzzles.forEach((puzzle, index) => {
    parsePuzzle(puzzle);
    const card = document.createElement('div');
    card.className = 'puzzle-card' + (puzzle.collapsed ? ' collapsed' : '');
    card.dataset.id = puzzle.id;
    card.innerHTML = `
      <div class="puzzle-head">
        <strong>Puzzle ${index + 1}</strong>
        <input type="text" class="title-input" placeholder="Title (optional)" value="${escapeAttr(puzzle.title || '')}" />
        <button type="button" class="icon-btn btn-collapse" title="Collapse">${puzzle.collapsed ? '⌄' : '⌃'}</button>
        <div class="menu">
          <button type="button" class="icon-btn btn-menu">⋮</button>
          <div class="menu-pop">
            <button type="button" data-act="dup">Duplicate</button>
            <button type="button" data-act="up">Move up</button>
            <button type="button" data-act="down">Move down</button>
            <button type="button" data-act="del">Delete</button>
          </div>
        </div>
      </div>
      <div class="puzzle-body">
        <textarea class="raw-input" spellcheck="false">${escapeHtml(puzzle.raw || '')}</textarea>
        <div class="puzzle-status">${escapeHtml(statusLine(puzzle))}</div>
        <div class="actions" style="margin-top:8px">
          <button type="button" class="btn-regen">Regenerate</button>
        </div>
      </div>
    `;
    host.appendChild(card);

    card.querySelector('.title-input').addEventListener('change', (e) => {
      puzzle.title = e.target.value;
      refreshPlanAndPreview();
    });
    card.querySelector('.raw-input').addEventListener('input', (e) => {
      puzzle.raw = e.target.value;
      puzzle.result = null;
      parsePuzzle(puzzle);
      card.querySelector('.puzzle-status').textContent = statusLine(puzzle);
      refreshPlanAndPreview();
    });
    card.querySelector('.btn-collapse').addEventListener('click', () => {
      puzzle.collapsed = !puzzle.collapsed;
      renderPuzzleList();
    });
    card.querySelector('.btn-regen').addEventListener('click', () => {
      regenerateOne(index);
    });
    const menu = card.querySelector('.menu');
    card.querySelector('.btn-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.menu.open').forEach((m) => {
        if (m !== menu) m.classList.remove('open');
      });
      menu.classList.toggle('open');
    });
    menu.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        menuAction(btn.dataset.act, index);
        menu.classList.remove('open');
      });
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

function menuAction(act, index) {
  if (act === 'dup') {
    const src = state.puzzles[index];
    state.puzzles.splice(index + 1, 0, {
      id: uid(),
      title: src.title,
      raw: src.raw,
      entries: [],
      result: null,
    });
  } else if (act === 'up' && index > 0) {
    const t = state.puzzles[index - 1];
    state.puzzles[index - 1] = state.puzzles[index];
    state.puzzles[index] = t;
  } else if (act === 'down' && index < state.puzzles.length - 1) {
    const t = state.puzzles[index + 1];
    state.puzzles[index + 1] = state.puzzles[index];
    state.puzzles[index] = t;
  } else if (act === 'del') {
    if (state.puzzles.length === 1) {
      alert('Need at least one puzzle.');
      return;
    }
    state.puzzles.splice(index, 1);
  }
  renderPuzzleList();
  refreshPlanAndPreview();
}

function regenerateOne(index) {
  readSettingsFromForm();
  const puzzle = state.puzzles[index];
  parsePuzzle(puzzle);
  // Bump seed for this puzzle only
  const localSeed = (state.settings.seed + (index + 1) * 1009 + Date.now() % 997) >>> 0;
  const generated = generatePuzzle(
    puzzle,
    state.settings.maxGrid,
    localSeed,
    0
  );
  puzzle.result = generated.result;
  renderPuzzleList();
  refreshPlanAndPreview();
}

function yieldToUi() {
  // Double rAF so the browser can paint progress before the next heavy chunk
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function setBusy(isBusy, label, pct) {
  const overlay = $('busyOverlay');
  const busyText = $('busyText');
  const busyBar = $('busyBar');
  const progress = $('progress');
  const bar = $('progressBar');
  const text = $('progressText');

  if (isBusy) {
    overlay.hidden = false;
    progress.classList.add('show');
    if (busyText) busyText.textContent = label || 'Working…';
    if (text) text.textContent = label || 'Working…';
    const width = Math.max(0, Math.min(100, pct == null ? 0 : pct)) + '%';
    if (busyBar) busyBar.style.width = width;
    if (bar) bar.style.width = width;
  } else {
    overlay.hidden = true;
    progress.classList.remove('show');
    if (busyBar) busyBar.style.width = '0%';
    if (bar) bar.style.width = '0%';
  }

  ['btnGenerateAll', 'btnAddBulkPuzzles', 'btnPromptHelper', 'btnAddPuzzle'].forEach(
    (id) => {
      const el = $(id);
      if (el) el.disabled = !!isBusy;
    }
  );
  // Keep Download gated by validation — only force-disable while busy
  if (isBusy && $('btnDownload')) $('btnDownload').disabled = true;
}

async function generateAll() {
  readSettingsFromForm();
  state.settings.seed = randomSeed();
  const total = state.puzzles.length;
  setBusy(true, total ? `Generating 0 / ${total}` : 'Generating…', 0);
  await yieldToUi();

  try {
    for (let i = 0; i < total; i++) {
      parsePuzzle(state.puzzles[i]);
      const generated = generatePuzzle(
        state.puzzles[i],
        state.settings.maxGrid,
        state.settings.seed,
        i
      );
      state.puzzles[i].result = generated.result;
      const done = i + 1;
      const pct = Math.round((done / total) * 100);
      setBusy(true, `Generating ${done} / ${total}`, pct);
      // Always yield so UI stays responsive (spec batching; also needed under 60)
      await yieldToUi();
    }

    setBusy(true, 'Building page list…', 100);
    await yieldToUi();
    renderPuzzleList();

    setBusy(true, 'Building preview…', 100);
    await yieldToUi();
    refreshPlanAndPreview();
  } finally {
    setBusy(false);
  }
}

function refreshPlanAndPreview() {
  readSettingsFromForm();
  state.puzzles.forEach((p) => parsePuzzle(p));
  plan = buildPagePlan(state);
  const validation = validateState(state, plan);
  renderValidation(validation);
  $('pageTotal').textContent = String(plan.pageCount);
  if (currentPage > plan.pageCount) currentPage = plan.pageCount || 1;
  if (currentPage < 1) currentPage = 1;
  $('pageInput').value = String(currentPage);
  renderPreview();
  $('btnDownload').disabled = validation.hasError;
}

function renderValidation(validation) {
  const ul = $('validationList');
  ul.innerHTML = '';
  for (const item of validation.items) {
    const li = document.createElement('li');
    li.className = item.level;
    const icon =
      item.level === 'ok' ? '✅' : item.level === 'warn' ? '⚠️' : '❌';
    li.textContent = `${icon} ${item.msg}`;
    ul.appendChild(li);
  }
}

function renderPreview() {
  if (!plan || !plan.pages.length) {
    $('pageFrame').innerHTML = '<p class="hint">Generate puzzles to preview pages.</p>';
    return;
  }
  const page = plan.pages[currentPage - 1];
  const svg = renderPageSvg(page, currentPage, plan, state, {
    showMargins: $('showMargins').checked,
  });
  $('pageFrame').innerHTML = svg;
  $('pageFrame').classList.toggle('fit', fitMode);
}

function downloadPdf() {
  readSettingsFromForm();
  plan = buildPagePlan(state);
  const validation = validateState(state, plan);
  if (validation.hasError) {
    alert('Fix validation errors before downloading.');
    return;
  }
  if (validation.hasWarn) {
    if (!confirm('There are warnings. Download PDF anyway?')) return;
  }
  exportPdf(state, plan);
}

function exportJson() {
  readSettingsFromForm();
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.settings.bookTitle || 'crossword') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.settings || !Array.isArray(data.puzzles)) {
        throw new Error('Invalid file');
      }
      state.version = data.version || 1;
      state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
      state.puzzles = data.puzzles.map((p) => ({
        id: p.id || uid(),
        title: p.title || '',
        raw: p.raw || '',
        entries: p.entries || [],
        result: p.result || null,
      }));
      writeSettingsToForm();
      renderPuzzleList();
      refreshPlanAndPreview();
    } catch (e) {
      alert('Import failed: ' + e.message);
    }
  };
  reader.readAsText(file);
}

/* Prompt helper — 3-step chain + bulk import (spec §8) */
const AUDIENCE_PRESETS = [
  {
    label: 'Baby boomers (60-80, US, nostalgia + large print)',
    value:
      'Baby boomers aged 60-80 in the US, retired, love nostalgia, need large print',
  },
  {
    label: 'Seniors (75+, gentle / very large print)',
    value:
      'Seniors aged 75+, gentle mental exercise, very large print, easy clues',
  },
  {
    label: 'Adults (30-55, relax / medium)',
    value: 'Adults aged 30-55 who do puzzles to relax, medium difficulty',
  },
  {
    label: 'Kids (8-12)',
    value: 'Children aged 8-12, school vocabulary level, simple clues',
  },
  {
    label: 'Bible / faith readers',
    value: 'Adult Christian readers familiar with the Bible',
  },
  {
    label: 'Travel / geography',
    value: 'Adults interested in travel, geography, and world culture',
  },
  { label: 'Custom…', value: '' },
];

let promptTab = '0';
/** @type {{ topic: string, why: string, keywords: string }[]} */
let parsedTopicBlocks = [];
/** @type {string[]} */
let parsedSubtopics = [];
/** @type {Array<{title:string, raw:string, entries:Array<{word:string,clue:string}>, warnings:string[], tooFew:boolean, selected:boolean}>} */
let bulkBlocks = [];
let toastTimer = null;

function fillAudienceSelect(selectEl) {
  selectEl.innerHTML = '';
  AUDIENCE_PRESETS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = p.label;
    selectEl.appendChild(opt);
  });
}

function isCustomAudienceIndex(idx) {
  return AUDIENCE_PRESETS[idx] && AUDIENCE_PRESETS[idx].value === '';
}

function applyAudiencePreset() {
  const idx = Number($('p0AudiencePreset').value);
  const preset = AUDIENCE_PRESETS[idx];
  const wrap = $('p0AudienceCustom');
  const isCustom = isCustomAudienceIndex(idx);
  if (wrap) wrap.hidden = !isCustom;
  if (!preset) return;
  if (!isCustom) {
    $('p0Audience').value = preset.value;
  } else if (!$('p0Audience').value.trim()) {
    $('p0Audience').value = '';
    $('p0Audience').focus();
  }
}

function formatTopicBlock(block) {
  return (
    `TOPIC: ${block.topic || ''}\n` +
    `WHY: ${block.why || ''}\n` +
    `KEYWORDS: ${block.keywords || ''}`
  );
}

function parseTopicBlocks(text) {
  const blocks = [];
  let current = null;
  const flush = () => {
    if (current && current.topic) blocks.push(current);
    current = null;
  };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const mTopic = /^TOPIC:\s*(.*)$/i.exec(line);
    const mWhy = /^WHY:\s*(.*)$/i.exec(line);
    const mKw = /^KEYWORDS:\s*(.*)$/i.exec(line);
    if (mTopic) {
      flush();
      current = { topic: mTopic[1].trim(), why: '', keywords: '' };
    } else if (mWhy) {
      if (!current) current = { topic: '', why: '', keywords: '' };
      current.why = mWhy[1].trim();
    } else if (mKw) {
      if (!current) current = { topic: '', why: '', keywords: '' };
      current.keywords = mKw[1].trim();
    }
  }
  flush();
  return blocks.filter((b) => b.topic);
}

function parseSubtopics(text) {
  const subs = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = /^SUBTOPIC:\s*(.+)$/i.exec(raw.trim());
    if (m) {
      const name = m[1].trim();
      if (name) subs.push(name);
    }
  }
  return subs;
}

function formatSubtopicsList(names) {
  return names.map((n) => `SUBTOPIC: ${n}`).join('\n');
}

function normalizeTopicBlockText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  const blocks = parseTopicBlocks(trimmed);
  if (blocks.length) return formatTopicBlock(blocks[0]);
  // Free-form skip: treat whole text as TOPIC if no labels
  if (!/^TOPIC:/im.test(trimmed)) {
    return formatTopicBlock({ topic: trimmed, why: '', keywords: '' });
  }
  return trimmed;
}

function setTopicBlockEverywhere(blockText) {
  const normalized = normalizeTopicBlockText(blockText);
  $('p1TopicBlock').value = normalized;
  $('p2TopicBlock').value = normalized;
}

function syncSubtopicCountLabels() {
  const n = parsedSubtopics.length;
  const msg = n ? `${n} subtopic${n === 1 ? '' : 's'} found` : 'No SUBTOPIC: lines found';
  if ($('p1SubCount')) $('p1SubCount').textContent = msg;
  if ($('p2SubCount')) {
    $('p2SubCount').textContent = n
      ? `${n} subtopic${n === 1 ? '' : 's'} in SUBTOPICS`
      : 'No subtopics yet';
  }
}

function setSubtopicsEverywhere(namesOrText) {
  if (Array.isArray(namesOrText)) {
    parsedSubtopics = namesOrText.slice();
    $('p2Subtopics').value = formatSubtopicsList(parsedSubtopics);
  } else {
    const text = String(namesOrText || '').trim();
    $('p2Subtopics').value = text;
    parsedSubtopics = parseSubtopics(text);
  }
  syncSubtopicCountLabels();
}

function rebuildTopicBlockSelect() {
  const sel = $('p0BlockSelect');
  const prev = sel.value;
  sel.innerHTML = '';
  if (!parsedTopicBlocks.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— paste result first —';
    sel.appendChild(opt);
    return;
  }
  parsedTopicBlocks.forEach((b, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = b.topic;
    sel.appendChild(opt);
  });
  const keep = prev !== '' && Number(prev) < parsedTopicBlocks.length;
  sel.value = keep ? prev : '0';
  applyChosenTopicBlock();
}

function applyChosenTopicBlock() {
  const idx = Number($('p0BlockSelect').value);
  const block = parsedTopicBlocks[idx];
  if (!block) return;
  setTopicBlockEverywhere(formatTopicBlock(block));
  refreshPromptOut();
}

function onPastePrompt0() {
  parsedTopicBlocks = parseTopicBlocks($('p0Paste').value);
  rebuildTopicBlockSelect();
}

function onPastePrompt1() {
  const names = parseSubtopics($('p1Paste').value);
  setSubtopicsEverywhere(names);
  refreshPromptOut();
}

function onPastePrompt2() {
  readSettingsFromForm();
  const maxLen = Number($('p2Max').value) || state.settings.maxGrid;
  const parsed = parsePrompt2Blocks($('p2Paste').value, maxLen);
  bulkBlocks = parsed.blocks;
  renderBulkPreview(parsed.warnings);
}

function selectedBulkCount() {
  return bulkBlocks.filter((b) => b.selected && !b.tooFew).length;
}

function updateAddBulkButton() {
  const n = selectedBulkCount();
  const btn = $('btnAddBulkPuzzles');
  btn.disabled = n < 1;
  btn.textContent = n === 1 ? '+ Add 1 puzzle' : `+ Add ${n} puzzles`;
}

function renderBulkPreview(extraWarnings) {
  const wrap = $('bulkPreview');
  const list = $('bulkPreviewList');
  const warnEl = $('bulkPreviewWarn');
  list.innerHTML = '';

  if (!bulkBlocks.length || !$('p2Paste').value.trim()) {
    wrap.hidden = true;
    warnEl.textContent = '';
    updateAddBulkButton();
    return;
  }

  wrap.hidden = false;
  bulkBlocks.forEach((block, index) => {
    const row = document.createElement('label');
    row.className = 'bulk-row' + (block.tooFew ? ' too-few' : '');
    const title = block.title || '(untitled)';
    const countLabel = `${block.entries.length} word${block.entries.length === 1 ? '' : 's'}`;
    const flag = block.tooFew ? ' ⚠️ quá ít, bỏ qua' : '';
    row.innerHTML = `
      <input type="checkbox" data-bulk-idx="${index}" ${block.selected && !block.tooFew ? 'checked' : ''} ${block.tooFew ? 'disabled' : ''} />
      <span class="bulk-title">${escapeHtml(title)}${flag}</span>
      <span class="word-count">${escapeHtml(countLabel)}</span>
    `;
    const cb = row.querySelector('input');
    cb.addEventListener('change', () => {
      bulkBlocks[index].selected = cb.checked;
      updateAddBulkButton();
    });
    list.appendChild(row);
  });

  const warns = (extraWarnings || []).slice();
  if (!bulkBlocks.some((b) => !b.tooFew)) {
    warns.push('No puzzle blocks with ≥ 3 valid WORD | CLUE pairs');
  }
  warnEl.textContent = warns.join(' · ');
  updateAddBulkButton();
}

function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2800);
}

function scrollToPuzzleId(id) {
  const card = document.querySelector(`.puzzle-card[data-id="${id}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function addBulkPuzzles() {
  const chosen = bulkBlocks.filter((b) => b.selected && !b.tooFew);
  if (!chosen.length) return;

  const mode = $('bulkImportMode').value;
  if (mode === 'replace') {
    if (!confirm('Replace all existing puzzles with the selected ones?')) return;
    state.puzzles = [];
  }

  const firstId = uid();
  chosen.forEach((block, i) => {
    state.puzzles.push({
      id: i === 0 ? firstId : uid(),
      title: block.title || '',
      raw: block.raw || '',
      entries: [],
      result: null,
    });
  });

  // Close modal first, show busy overlay, then generate (skip early full list render)
  $('promptModal').classList.remove('open');
  const n = chosen.length;
  setBusy(true, `Adding ${n} puzzle${n === 1 ? '' : 's'}…`, 0);
  await yieldToUi();

  await generateAll();
  scrollToPuzzleId(firstId);
  showToast(n === 1 ? 'Added 1 puzzle' : `Added ${n} puzzles`);
}

function syncMaxLenFromGrid() {
  const maxGrid = Number(state.settings.maxGrid) || 13;
  const hardCap = Math.max(3, maxGrid - 1);
  // Soft cap 8 — longer words are the main cause of unplaced skips
  const suggested = Math.min(8, hardCap);
  const current = Number($('p2Max').value) || suggested;
  if (current > hardCap || current > 8) {
    $('p2Max').value = String(suggested);
  }
}

function prompt0Text() {
  const audience = $('p0Audience').value.trim();
  const num = $('p0Num').value || '10';
  return `You are a KDP market researcher for crossword puzzle books.

AUDIENCE: ${audience}

List exactly ${num} crossword puzzle book topics for this audience.

Each topic must:
- be narrow enough to be one whole book, broad enough for 50+ puzzles
- avoid trademarks, brand names, and copyrighted titles

OUTPUT — repeat this 3-line block ${num} times, blank line between blocks:

TOPIC: <book title as it would appear on the cover>
WHY: <one sentence, why this audience buys it>
KEYWORDS: <three phrases a shopper would type into Amazon search>

Output nothing else. No numbering, no intro, no closing text, no code fences.`;
}

function prompt1Text() {
  const topicBlock = normalizeTopicBlockText($('p1TopicBlock').value);
  const num = $('p1Num').value || '50';
  return `You are a crossword puzzle book editor.

TOPIC BLOCK:
${topicBlock}

Using the TOPIC as the theme, the WHY as the emotional angle, and the
KEYWORDS as a guide to who is reading, list exactly ${num}
sub-topics for this book.

Each sub-topic must:
- yield at least 20 related single words
- not overlap with the others
- be instantly recognisable to this audience

OUTPUT — one per line, exactly this format:

SUBTOPIC: <name>

Output nothing else. No numbering, no intro, no closing text, no code fences.`;
}

function prompt2Text() {
  const topicBlock = normalizeTopicBlockText($('p2TopicBlock').value);
  const subtopics = $('p2Subtopics').value.trim();
  const num = $('p2Num').value || '16';
  const minLen = $('p2Min').value || '3';
  const maxLen = $('p2Max').value || '8';
  return `You are a crossword puzzle constructor for a freeform / criss-cross grid.

TOPIC BLOCK:
${topicBlock}

SUBTOPICS:
${subtopics}

For EVERY subtopic listed above, generate exactly ${num} word/clue pairs
that can ALL intersect on one compact grid (no leftovers).

WORDS — packing rules (critical):
- A-Z only, ALL CAPS, single tokens. No spaces, hyphens, apostrophes,
  numbers, or accents. (Write NEWYORK not NEW YORK.)
- Length ${minLen}-${maxLen} letters ONLY. Prefer 4–6 letters.
- At least ${Math.max(8, Math.floor(Number(num) * 0.6))} words must be 4–6 letters.
- At most 2 words may be longer than 7 letters.
- Real everyday words or very common short names. No trademarks.
- No duplicates within a subtopic.
- Favour common letters (A E I O R S T N L). Avoid rare letters (J Q X Z)
  unless the word is short and highly thematic.
- Every word must share at least 2 letter-types with two other words
  in the same list (so they can cross).
- Prefer words that cross easily: ROUTE, DINER, MAP, RADIO, TRAIL —
  not long compounds like FERRISWHEEL, GUARDRAIL, BARBERSHOP.

CLUES:
- Maximum ${$('p2ClueMax').value} characters, one line each.
- Plain descriptive style, no cryptic wordplay.
- Never contain the answer word or any part of it.
- Difficulty: ${$('p2Diff').value}.
- Written for the audience implied by the KEYWORDS above.

OUTPUT — repeat this block once per subtopic, in the same order,
separated by one blank line:

PUZZLE: <subtopic name, copied exactly>
WORD | Clue text
WORD | Clue text
...

Output nothing else. No numbering, no intro, no closing text, no code fences.
Do not stop early — cover all subtopics listed.`;
}

function refreshPromptOut() {
  if (promptTab === '0') $('promptOut').value = prompt0Text();
  else if (promptTab === '1') $('promptOut').value = prompt1Text();
  else $('promptOut').value = prompt2Text();
}

function showPromptTab(tab) {
  promptTab = String(tab);
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === promptTab);
  });
  $('promptTab0').hidden = promptTab !== '0';
  $('promptTab1').hidden = promptTab !== '1';
  $('promptTab2').hidden = promptTab !== '2';
  $('promptPaste0').hidden = promptTab !== '0';
  $('promptPaste1').hidden = promptTab !== '1';
  $('promptPaste2').hidden = promptTab !== '2';
  if (promptTab === '2') {
    syncMaxLenFromGrid();
    parsedSubtopics = parseSubtopics($('p2Subtopics').value);
    syncSubtopicCountLabels();
  }
  refreshPromptOut();
}

function carryTopicToTab1() {
  const selIdx = $('p0BlockSelect').value;
  if (selIdx !== '' && parsedTopicBlocks[Number(selIdx)]) {
    setTopicBlockEverywhere(formatTopicBlock(parsedTopicBlocks[Number(selIdx)]));
  } else if ($('p1TopicBlock').value.trim()) {
    setTopicBlockEverywhere($('p1TopicBlock').value);
  }
}

function carrySubToTab2() {
  setTopicBlockEverywhere($('p1TopicBlock').value);
  if ($('p1Paste').value.trim()) {
    onPastePrompt1();
  } else if ($('p2Subtopics').value.trim()) {
    parsedSubtopics = parseSubtopics($('p2Subtopics').value);
    syncSubtopicCountLabels();
  }
}

function initPromptHelper() {
  fillAudienceSelect($('p0AudiencePreset'));
  $('p0AudiencePreset').value = '0';
  applyAudiencePreset();
  rebuildTopicBlockSelect();
  syncSubtopicCountLabels();
  updateAddBulkButton();
}

function initFormControls() {
  const trimSel = $('trimSize');
  TRIM_SIZES.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent =
      t.id === 'a4'
        ? `8.27 × 11.69 (A4)`
        : `${t.w} × ${t.h}`;
    if (t.id === '8.5x11') opt.selected = true;
    trimSel.appendChild(opt);
  });

}

function bindEvents() {
  [
    'puzzleTitleFormat',
    'answerKey',
    'answersPerPage',
    'pageNumbers',
  ].forEach((id) => {
    $(id).addEventListener('change', refreshPlanAndPreview);
  });

  // Trim / bleed change the auto maxGrid — regenerate so boards stay in safe area
  ['trimSize', 'bleed'].forEach((id) => {
    $(id).addEventListener('change', () => {
      readSettingsFromForm();
      syncMaxLenFromGrid();
      if (promptTab === '2') refreshPromptOut();
      generateAll().catch((e) => alert(e.message || String(e)));
    });
  });

  $('btnAddPuzzle').addEventListener('click', () => {
    state.puzzles.push({
      id: uid(),
      title: '',
      raw: '',
      entries: [],
      result: null,
    });
    renderPuzzleList();
    refreshPlanAndPreview();
  });
  $('btnGenerateAll').addEventListener('click', () => generateAll());
  $('btnDownload').addEventListener('click', downloadPdf);
  $('btnExportJson').addEventListener('click', exportJson);
  $('btnImportJson').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importJson(f);
    e.target.value = '';
  });

  $('btnPrev').addEventListener('click', () => {
    currentPage = Math.max(1, currentPage - 1);
    $('pageInput').value = String(currentPage);
    renderPreview();
  });
  $('btnNext').addEventListener('click', () => {
    currentPage = Math.min(plan ? plan.pageCount : 1, currentPage + 1);
    $('pageInput').value = String(currentPage);
    renderPreview();
  });
  $('pageInput').addEventListener('change', () => {
    currentPage = Math.max(
      1,
      Math.min(plan ? plan.pageCount : 1, Number($('pageInput').value) || 1)
    );
    $('pageInput').value = String(currentPage);
    renderPreview();
  });
  $('showMargins').addEventListener('change', renderPreview);
  $('btnFit').addEventListener('click', () => {
    fitMode = !fitMode;
    renderPreview();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
      return;
    }
    if (e.key === 'ArrowLeft') $('btnPrev').click();
    if (e.key === 'ArrowRight') $('btnNext').click();
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
  });

  $('btnPromptHelper').addEventListener('click', () => {
    $('promptModal').classList.add('open');
    showPromptTab(promptTab);
  });
  $('btnClosePrompt').addEventListener('click', () => {
    $('promptModal').classList.remove('open');
  });
  document.querySelectorAll('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => showPromptTab(btn.dataset.tab));
  });

  $('p0AudiencePreset').addEventListener('change', () => {
    applyAudiencePreset();
    refreshPromptOut();
  });

  $('p0Paste').addEventListener('input', onPastePrompt0);
  $('p0Paste').addEventListener('change', onPastePrompt0);
  $('p0BlockSelect').addEventListener('change', applyChosenTopicBlock);

  $('p1Paste').addEventListener('input', onPastePrompt1);
  $('p1Paste').addEventListener('change', onPastePrompt1);

  $('p2Paste').addEventListener('input', onPastePrompt2);
  $('p2Paste').addEventListener('change', onPastePrompt2);
  $('btnAddBulkPuzzles').addEventListener('click', () => {
    addBulkPuzzles().catch((e) => alert(e.message || String(e)));
  });

  $('btnSkipTopic').addEventListener('click', () => {
    // Spec: skip tab 0 — user types TOPIC BLOCK on tab 1
    showPromptTab('1');
    $('p1TopicBlock').focus();
  });
  $('btnNextFrom0').addEventListener('click', () => {
    carryTopicToTab1();
    showPromptTab('1');
  });
  $('btnNextFrom1').addEventListener('click', () => {
    carrySubToTab2();
    showPromptTab('2');
  });

  [
    'p0Audience',
    'p0Num',
    'p1TopicBlock',
    'p1Num',
    'p2TopicBlock',
    'p2Subtopics',
    'p2Num',
    'p2Min',
    'p2Max',
    'p2Diff',
    'p2ClueMax',
  ].forEach((id) => {
    $(id).addEventListener('input', refreshPromptOut);
    $(id).addEventListener('change', refreshPromptOut);
  });

  // Keep TOPIC BLOCK in sync across tabs 1 & 2
  $('p1TopicBlock').addEventListener('input', () => {
    $('p2TopicBlock').value = $('p1TopicBlock').value;
  });
  $('p2TopicBlock').addEventListener('input', () => {
    $('p1TopicBlock').value = $('p2TopicBlock').value;
  });

  // Editing SUBTOPICS by hand keeps the parsed count in sync
  $('p2Subtopics').addEventListener('input', () => {
    parsedSubtopics = parseSubtopics($('p2Subtopics').value);
    syncSubtopicCountLabels();
  });

  $('btnCopyPrompt').addEventListener('click', async () => {
    const text = $('promptOut').value;
    try {
      await navigator.clipboard.writeText(text);
      $('btnCopyPrompt').textContent = 'Copied!';
      setTimeout(() => {
        $('btnCopyPrompt').textContent = 'Copy prompt';
      }, 1200);
    } catch {
      $('promptOut').select();
      document.execCommand('copy');
    }
  });
}

function boot() {
  initFormControls();
  initPromptHelper();
  state.settings.seed = randomSeed();
  writeSettingsToForm();
  bindEvents();
  renderPuzzleList();
  generateAll().then(() => {
    // Expose self-test for console
    window.runSelfTest = function () {
      const r = runSelfTest(state.puzzles);
      console.log(r.report.join('\n'));
      console.log(`Pass ${r.pass} / Fail ${r.fail}`);
      return r;
    };
    window.__crosswordState = state;
    window.__crosswordPlan = () => plan;
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { state, generateAll, boot };
}
