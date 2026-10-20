'use strict';

const { maxPagesForTrim, MIN_LINE_PT, OUTSIDE_IN } = require('./constants');
const { gutterForPageCount } = require('./constants');

function validateState(state, plan) {
  const items = [];
  const settings = state.settings;
  const trim = settings.trim;
  const maxPages = maxPagesForTrim(trim);

  items.push({
    level: 'ok',
    msg: `Trim size ${trim.w} × ${trim.h} in, ${settings.bleed ? 'with bleed' : 'no bleed'}`,
  });

  const pc = plan ? plan.pageCount : 0;
  if (pc > maxPages) {
    items.push({
      level: 'error',
      msg: `Page count ${pc} exceeds max ${maxPages} for this trim`,
    });
  } else if (pc % 2 === 1) {
    items.push({
      level: 'warn',
      msg: `Page count ${pc} is odd — KDP prefers even`,
    });
  } else if (pc < 24) {
    items.push({
      level: 'warn',
      msg: `Page count: ${pc} — below KDP minimum of 24 (upload may be rejected)`,
    });
  } else {
    items.push({
      level: 'ok',
      msg: `Page count: ${pc} (even, ≥ 24, ≤ ${maxPages})`,
    });
  }

  const gutter = plan ? plan.gutter : gutterForPageCount(pc || 24);
  const bracket =
    pc <= 150
      ? '24–150'
      : pc <= 300
        ? '151–300'
        : pc <= 500
          ? '301–500'
          : pc <= 700
            ? '501–700'
            : '701–828';
  items.push({
    level: 'ok',
    msg: `Gutter ${gutter}" (bracket ${bracket}) · outside ${OUTSIDE_IN}"`,
  });

  items.push({ level: 'ok', msg: 'Mirrored margins: ON' });
  items.push({
    level: typeof FONT_REGULAR_B64 !== 'undefined' ? 'ok' : 'error',
    msg:
      typeof FONT_REGULAR_B64 !== 'undefined'
        ? 'Font embedded: Source Sans (Regular + Bold)'
        : 'Font missing — rebuild required',
  });
  items.push({
    level: 'ok',
    msg: `Min line weight: ${MIN_LINE_PT} pt`,
  });
  items.push({
    level: 'ok',
    msg: `Grid auto ${settings.maxGrid}×${settings.maxGrid} at ${settings.cellSize}" (KDP safe width)`,
  });

  for (let i = 0; i < state.puzzles.length; i++) {
    const p = state.puzzles[i];
    if (!p.result) {
      items.push({
        level: 'warn',
        msg: `Puzzle ${i + 1}: not generated yet`,
      });
      continue;
    }
    // Unplaced / sparse grids are normal for freeform packing — shown on each
    // puzzle card status line, not as book-level warnings.
    if (!p.entries || p.entries.length === 0) {
      items.push({
        level: 'error',
        msg: `Puzzle ${i + 1}: no valid words`,
      });
    }
    // Very long clues
    for (const c of (p.result.across || []).concat(p.result.down || [])) {
      if (c.clue && c.clue.length > 120) {
        items.push({
          level: 'error',
          msg: `Puzzle ${i + 1}: clue "${c.clue.slice(0, 40)}…" too long`,
        });
        break;
      }
    }
  }

  if (plan && plan.warnings) {
    for (const w of plan.warnings) {
      items.push({ level: w.level === 'error' ? 'error' : 'warn', msg: w.msg });
    }
  }

  const hasError = items.some((x) => x.level === 'error');
  const hasWarn = items.some((x) => x.level === 'warn');
  return { items, hasError, hasWarn };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateState };
}
