'use strict';

function normalizeWord(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

function splitLine(line) {
  const pipe = line.indexOf('|');
  if (pipe >= 0) {
    return [line.slice(0, pipe), line.slice(pipe + 1)];
  }
  const tab = line.indexOf('\t');
  if (tab >= 0) {
    return [line.slice(0, tab), line.slice(tab + 1)];
  }
  const semi = line.indexOf(';');
  if (semi >= 0) {
    return [line.slice(0, semi), line.slice(semi + 1)];
  }
  return null;
}

/**
 * Parse WORD | CLUE textarea content.
 * @returns {{ entries: Array<{word:string, clue:string}>, warnings: string[] }}
 */
function parseWordList(raw, maxLen) {
  const warnings = [];
  const entries = [];
  const seen = new Set();
  const lines = String(raw || '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const parts = splitLine(line);
    if (!parts) {
      warnings.push(`Line ${i + 1}: no separator (| / tab / ;)`);
      continue;
    }

    const word = normalizeWord(parts[0]);
    const clue = parts[1].trim();

    if (word.length < 3) {
      warnings.push(`Skipped short word (<3): "${parts[0].trim()}"`);
      continue;
    }
    if (maxLen && word.length > maxLen) {
      warnings.push(`Skipped word longer than grid (${word.length}>${maxLen}): ${word}`);
      continue;
    }
    if (!clue) {
      warnings.push(`Skipped ${word}: empty clue`);
      continue;
    }
    if (seen.has(word)) {
      warnings.push(`Duplicate word skipped: ${word}`);
      continue;
    }
    seen.add(word);
    entries.push({ word, clue });
  }

  return { entries, warnings };
}

function isNoiseLine(line) {
  const t = String(line || '').trim();
  if (!t) return true;
  if (t.startsWith('#')) return true;
  if (/^```/.test(t)) return true;
  return false;
}

/**
 * Parse PROMPT 2 bulk output into puzzle blocks (spec §8.3).
 * @returns {{
 *   blocks: Array<{
 *     title: string,
 *     raw: string,
 *     entries: Array<{word:string, clue:string}>,
 *     warnings: string[],
 *     tooFew: boolean,
 *     selected: boolean
 *   }>,
 *   warnings: string[]
 * }}
 */
function parsePrompt2Blocks(text, maxLen) {
  const lines = String(text || '').split(/\r?\n/);
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*PUZZLE:\s*/i.test(lines[i])) starts.push(i);
  }

  const outWarnings = [];
  /** @type {Array<{title:string, raw:string, entries:Array<{word:string,clue:string}>, warnings:string[], tooFew:boolean, selected:boolean}>} */
  const blocks = [];

  function pushBlock(title, bodyLines) {
    const kept = [];
    for (const line of bodyLines) {
      if (isNoiseLine(line)) continue;
      kept.push(line.trimEnd());
    }
    const raw = kept.join('\n');
    const parsed = parseWordList(raw, maxLen);
    const tooFew = parsed.entries.length < 3;
    if (tooFew) {
      outWarnings.push(
        `Skipped "${title || '(untitled)'}": only ${parsed.entries.length} valid pairs (< 3)`
      );
    }
    blocks.push({
      title: title || '',
      raw,
      entries: parsed.entries,
      warnings: parsed.warnings,
      tooFew,
      selected: !tooFew,
    });
  }

  if (!starts.length) {
    // Fallback: treat whole paste as one puzzle (manual WORD | CLUE list)
    pushBlock('', lines);
    return { blocks, warnings: outWarnings };
  }

  // Text before the first PUZZLE: line is ignored (AI preamble)
  for (let b = 0; b < starts.length; b++) {
    const start = starts[b];
    const end = b + 1 < starts.length ? starts[b + 1] : lines.length;
    const title = lines[start].replace(/^\s*PUZZLE:\s*/i, '').trim();
    pushBlock(title, lines.slice(start + 1, end));
  }

  return { blocks, warnings: outWarnings };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeWord, parseWordList, parsePrompt2Blocks };
}
