'use strict';

const { ALLOWED_CHARS } = require('./constants');
const { BUILTIN_QUOTES } = require('./quotes-data');

const CURLY_MAP = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2026': '...',
  '\u00A0': ' ',
};

function stripDiacritics(s) {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeQuote(raw, maxLen, opts) {
  if (raw == null) return { ok: false, reason: 'empty' };
  let text = String(raw);
  text = stripDiacritics(text);
  text = text.replace(/[\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u00A0]/g, (ch) => CURLY_MAP[ch] || ch);
  text = text.toUpperCase();
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length < 20) return { ok: false, reason: 'too short (<20)', text };
  if (maxLen && text.length > maxLen) return { ok: false, reason: `too long (>${maxLen})`, text };
  if (!ALLOWED_CHARS.test(text)) {
    return { ok: false, reason: 'disallowed characters', text };
  }
  const letters = new Set();
  for (const ch of text) {
    if (ch >= 'A' && ch <= 'Z') letters.add(ch);
  }
  // Paste/import: slightly looser (10) so short personal quotes can still generate
  const minDistinct = (opts && opts.minDistinct) || 12;
  if (letters.size < minDistinct) {
    return { ok: false, reason: `distinct letters < ${minDistinct} (${letters.size})`, text };
  }
  return { ok: true, text, charLen: text.length, distinct: letters.size };
}

function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function parsePasteLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;
  const parts = raw.split('|');
  if (parts.length >= 2) {
    return { text: parts[0].trim(), author: parts.slice(1).join('|').trim() };
  }
  return { text: raw, author: '' };
}

function parseCsv(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (i === 0 && /^text\b/i.test(line)) continue;
    // simple CSV: text,author,source,theme
    const cols = [];
    let cur = '';
    let inQ = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === ',' && !inQ) {
        cols.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    cols.push(cur);
    out.push({
      text: (cols[0] || '').trim(),
      author: (cols[1] || '').trim(),
      source: (cols[2] || '').trim(),
      theme: (cols[3] || '').trim(),
    });
  }
  return out;
}

function collectQuotes(source, pasteText, importedRows, theme) {
  let pool = [];
  if (source === 'paste') {
    pool = String(pasteText || '')
      .split(/\r?\n/)
      .map(parsePasteLine)
      .filter(Boolean);
  } else if (source === 'import') {
    pool = importedRows || [];
  } else {
    pool = BUILTIN_QUOTES;
  }
  if (theme && theme !== 'any') {
    const filtered = pool.filter((q) => (q.theme || '').toLowerCase() === theme.toLowerCase());
    if (filtered.length) pool = filtered;
  }
  return pool;
}

function prepareQuotePool(pool, maxLen, opts) {
  const ready = [];
  const skipped = [];
  const seen = new Set();
  for (const q of pool) {
    const n = normalizeQuote(q.text, maxLen, opts);
    if (!n.ok) {
      skipped.push({ text: q.text, reason: n.reason });
      continue;
    }
    const h = hashText(n.text);
    if (seen.has(h)) {
      skipped.push({ text: q.text, reason: 'duplicate' });
      continue;
    }
    seen.add(h);
    ready.push({
      text: n.text,
      author: q.author || '',
      source: q.source || '',
      theme: q.theme || '',
      charLen: n.charLen,
      hash: h,
    });
  }
  return { ready, skipped };
}

function filterByDifficulty(pool, difficulty) {
  const bands = {
    easy: [25, 90],
    medium: [70, 140],
    hard: [120, 200],
    expert: [150, 260],
  };
  const [lo, hi] = bands[difficulty] || [25, 260];
  const matched = pool.filter((q) => q.charLen >= lo && q.charLen <= hi);
  return matched.length ? matched : pool.filter((q) => q.charLen >= lo - 20 && q.charLen <= hi + 40);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BUILTIN_QUOTES,
    normalizeQuote,
    hashText,
    parsePasteLine,
    parseCsv,
    collectQuotes,
    prepareQuotePool,
    filterByDifficulty,
  };
}
