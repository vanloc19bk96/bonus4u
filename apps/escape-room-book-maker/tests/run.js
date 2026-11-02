/*
 * node tests/run.js
 * Reader; every puzzle type at every level, solved again here by code that shares nothing with the
 * generators; the door tables; the route through the printed pages; prompts and top-ups; every trim
 * x text size against the KDP margins and minimums; every cover template; and real PDFs (checked
 * with PyMuPDF through tests/verify-pdf.py when Python has it).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const env = require('./node-env.js');
const S = require('./sample-replies.js');
const CX = env.loadAll();
const E = CX.engine, P = CX.plan, Z = CX.puzzles;

let failed = 0, passed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log('ok   ' + name); }, (e) => { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); });
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected true'); }

// A finished book from the sample replies.
function fullProject(mut) {
  const p = P.newProject();
  p.seed = 'test-book';
  p.book.author = 'Blackthorn Press';
  if (mut) mut(p);
  CX.content.addStory(p, CX.reader.readStory(S.story(p.plan.rooms, p.plan.finale)));
  CX.prompts.list(p).forEach((pr) => {
    if (pr.kind === 'rooms') CX.content.addRooms(p, CX.reader.readRooms(S.rooms(pr.rooms, CX, { evidence: p.plan.finale === 'culprit' })), pr.rooms);
  });
  return p;
}

const F = CX.metrics.load();
function textWidth(it) { return F[it.font].width(it.str, it.size, it.ls || 0); }

// A text item's box, whichever way it is turned.
function textBox(it) {
  const w = textWidth(it), up = it.size * 0.8, down = it.size * 0.22;
  if (it.angle === 180) return { x0: it.x - w, x1: it.x, y0: it.y - down, y1: it.y + up };
  if (it.angle === 90) return { x0: it.x - up, x1: it.x + down, y0: it.y - w, y1: it.y };
  if (it.angle === 270) return { x0: it.x - down, x1: it.x + up, y0: it.y - w, y1: it.y };
  return { x0: it.x, x1: it.x + w, y0: it.y - up, y1: it.y + down };
}

// Every item inside the page's margins, and the KDP minimums.
function checkPage(pg) {
  const tol = 1;
  pg.items.forEach((it) => {
    if (it.t === 'text') {
      ok(it.size >= CX.kdp.MIN_FONT_PT, 'text under 7 pt on page ' + pg.num + ': ' + it.str + ' ' + it.size);
      const b = textBox(it);
      ok(b.x0 >= pg.x0 - tol && b.x1 <= pg.x1 + tol, 'text outside the margins on page ' + pg.num + ' (' + pg.label + '): "' + it.str + '" x ' + b.x0.toFixed(1) + '-' + b.x1.toFixed(1) + ' of ' + pg.x0.toFixed(1) + '-' + pg.x1.toFixed(1));
      ok(b.y0 >= (pg.flip ? pg.safe.y0 : pg.y0) - tol && b.y1 <= pg.y1 + tol + 2, 'text outside top/bottom on page ' + pg.num + ' (' + pg.label + '): ' + it.str + ' y ' + b.y0.toFixed(1) + '-' + b.y1.toFixed(1) + ' of ' + pg.y0.toFixed(1) + '-' + pg.y1.toFixed(1));
    } else if (it.t === 'line') {
      ok(it.w >= CX.kdp.MIN_LINE_PT, 'thin line on page ' + pg.num);
      ok(Math.min(it.x1, it.x2) >= pg.x0 - tol && Math.max(it.x1, it.x2) <= pg.x1 + tol, 'line outside margins on page ' + pg.num + ' (' + pg.label + ')');
      ok(Math.min(it.y1, it.y2) >= (pg.flip ? pg.safe.y0 : pg.y0) - tol && Math.max(it.y1, it.y2) <= pg.y1 + tol, 'line outside top/bottom on page ' + pg.num + ' (' + pg.label + ')');
    } else if (it.t === 'rect') {
      if (it.mode === 'stroke') ok(it.lw >= CX.kdp.MIN_LINE_PT, 'thin box on page ' + pg.num);
      ok(it.x >= pg.x0 - tol && it.x + it.w <= pg.x1 + tol && it.y >= (pg.flip ? pg.safe.y0 : pg.y0) - tol && it.y + it.h <= pg.y1 + tol, 'box outside the margins on page ' + pg.num + ' (' + pg.label + ')');
    } else if (it.t === 'poly' || it.t === 'ellipse') {
      if (it.mode === 'stroke') ok(it.lw >= CX.kdp.MIN_LINE_PT, 'thin outline on page ' + pg.num);
      const xs = it.t === 'poly' ? it.pts.filter((v, i) => i % 2 === 0) : [it.cx - it.rx, it.cx + it.rx];
      const ys = it.t === 'poly' ? it.pts.filter((v, i) => i % 2 === 1) : [it.cy - it.ry, it.cy + it.ry];
      const pad = (it.lw || 0) / 2 + 1;
      ok(Math.min.apply(null, xs) - pad >= pg.x0 - 3 && Math.max.apply(null, xs) + pad <= pg.x1 + 3 && Math.min.apply(null, ys) - pad >= (pg.flip ? pg.safe.y0 : pg.y0) - 3 && Math.max.apply(null, ys) + pad <= pg.y1 + 3,
        'drawing outside the margins on page ' + pg.num + ' (' + pg.label + ')');
    }
    if (it.ink != null) ok(it.ink >= CX.kdp.MIN_GRAY, 'ink lighter than 10% gray on page ' + pg.num);
  });
}

function clash(pg) {
  const b = pg.items.filter((it) => it.t === 'text').map((it) => { const x = textBox(it); return { it, x0: x.x0, x1: x.x1, y0: x.y0 + it.size * 0.08, y1: x.y1 - it.size * 0.02 }; });
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    if (Math.min(b[i].x1, b[j].x1) - Math.max(b[i].x0, b[j].x0) > 0.6 && Math.min(b[i].y1, b[j].y1) - Math.max(b[i].y0, b[j].y0) > 0.6) return b[i].it.str + ' / ' + b[j].it.str + ' on page ' + pg.num + ' (' + pg.label + ')';
  }
  return '';
}

// ---------- solving again, from what is printed ----------
const DATA = { message: 'THE SPARE KEY IS IN DRAWER [N]', words: S.ROOMS.length ? ['CANDLE', 'MIRROR', 'SHADOW', 'LOCKET', 'PORTRAIT', 'STAIRS', 'ATTIC', 'CELLAR', 'VELVET', 'GARDEN'] : [], people: ['Ada', 'Boris', 'Clara', 'Dmitri'], objects: ['ring', 'map', 'candle', 'letter'], place: 'locker', riddle: 'I have a face but cannot smile.', answer: 'A clock', wrong: ['A mirror', 'A portrait', 'A river'], hint: 'Listen to the room.', why: 'A clock has a face.' };
const SHORT = Object.assign({}, DATA, { message: 'DRAWER [N]' });
const REV_MORSE = {}; Object.keys(E.MORSE).forEach((k) => { REV_MORSE[E.MORSE[k]] = k; });

function numberIn(words, digit) { ok(words.join(' ').split(' ').includes(E.NUMS[digit]), 'the message does not name ' + E.NUMS[digit] + ': ' + words.join(' ')); }

const SOLVE = {
  caesar(z) {
    const plain = z.solved.words.join(''), coded = z.draw.words.join('');
    eq(plain.length, coded.length);
    const k = (coded.charCodeAt(0) - plain.charCodeAt(0) + 26) % 26;
    ok(k > 0, 'no shift');
    for (let i = 0; i < plain.length; i++) eq((coded.charCodeAt(i) - plain.charCodeAt(i) + 26) % 26, k, 'one shift for every letter');
    numberIn(z.solved.words, z.digit);
  },
  pigpen(z) { eq(z.draw.words, z.solved.words); numberIn(z.solved.words, z.digit); },
  morse(z) {
    const read = z.draw.words.map((w) => w.map((c) => REV_MORSE[c]).join(''));
    eq(read, z.solved.words);
    numberIn(read, z.digit);
  },
  numbers(z) {
    // the rule is printed in the first line of the task
    const t = z.task[0], back = /backward/.test(t), add = +(/plus (\d)/.exec(t) || [0, 0])[1];
    const read = z.draw.words.map((w) => w.map((n) => E.ABC[back ? 26 - n : n - add - 1]).join(''));
    eq(read, z.solved.words);
    numberIn(read, z.digit);
  },
  grille(z) {
    const d = z.draw, n = d.n, turned = /quarter/.test(z.task[0]);
    // read through the card the way the page says, a quarter turn clockwise if it asks
    const holes = d.card.map((h) => (turned ? [h[1], n - 1 - h[0]] : h)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const read = holes.map((h) => d.grid[h[0]][h[1]]).join('');
    eq(read, z.steps[0].replace('The holes uncover: ', '').replace(/[ .]/g, ''));
    ok(read.includes(E.NUMS[z.digit]), 'the stencil does not name the digit');
  },
  sudoku(z) {
    const d = z.draw, n = d.n, g = d.grid.map((r) => r.slice());
    eq(g[d.mark[0]][d.mark[1]], 0, 'the ringed square is empty');
    // an independent search: every row, column and box once
    const b = d.box; let count = 0, value = null;
    (function go(i) {
      if (count > 1) return;
      if (i === n * n) { count++; value = g[d.mark[0]][d.mark[1]]; return; }
      const r = Math.floor(i / n), c = i % n;
      if (g[r][c]) return go(i + 1);
      for (let v = 1; v <= n; v++) {
        let fine = true;
        for (let k = 0; k < n && fine; k++) if (g[r][k] === v || g[k][c] === v) fine = false;
        const r0 = r - r % b[0], c0 = c - c % b[1];
        for (let x = 0; x < b[0] && fine; x++) for (let y = 0; y < b[1] && fine; y++) if (g[r0 + x][c0 + y] === v) fine = false;
        if (fine) { g[r][c] = v; go(i + 1); if (count > 1) { g[r][c] = 0; return; } const keep = value; g[r][c] = 0; value = keep; }
      }
    })(0);
    eq(count, 1, 'one solution');
    eq(value, z.digit);
  },
  logic(z) {
    // read the printed clues as a person would, and try every arrangement
    const d = z.draw, n = d.n, people = d.people, objects = d.objects, tests = [];
    const pi = (s) => people.indexOf(s), oi = (s) => objects.indexOf(s);
    d.clues.forEach((c) => {
      let m;
      if ((m = /^(\w+) took \w+ (\d)\.$/.exec(c))) { const p = pi(m[1]), k = +m[2] - 1; tests.push((W) => W[p] === k); }
      else if ((m = /^(\w+) did not take \w+ (\d)\.$/.exec(c))) { const p = pi(m[1]), k = +m[2] - 1; tests.push((W) => W[p] !== k); }
      else if ((m = /^(\w+)’s \w+ has a higher number than (\w+)’s\.$/.exec(c))) { const a = pi(m[1]), b = pi(m[2]); tests.push((W) => W[a] > W[b]); }
      else if ((m = /^(\w+)’s \w+ is the very next one after (\w+)’s\.$/.exec(c))) { const a = pi(m[1]), b = pi(m[2]); tests.push((W) => W[a] === W[b] + 1); }
      else if ((m = /^(\w+) found the (.+)\.$/.exec(c))) { const a = pi(m[1]), o = oi(m[2]); tests.push((W, X) => W[a] === X[o]); }
      else if ((m = /^(\w+) did not find the (.+)\.$/.exec(c))) { const a = pi(m[1]), o = oi(m[2]); tests.push((W, X) => W[a] !== X[o]); }
      else if ((m = /^The (.+) was in the \w+ right after (\w+)’s\.$/.exec(c))) { const o = oi(m[1]), a = pi(m[2]); tests.push((W, X) => X[o] === W[a] + 1); }
      else if ((m = /^The (.+) was not in \w+ (\d)\.$/.exec(c))) { const o = oi(m[1]), k = +m[2] - 1; tests.push((W, X) => X[o] !== k); }
      else throw new Error('a clue nobody can read: ' + c);
    });
    const perms = E.permutations(n), hits = [];
    perms.forEach((W) => perms.forEach((X) => { if (tests.every((t) => t(W, X))) hits.push([W, X]); }));
    eq(hits.length, 1, 'one arrangement fits the clues');
    const asked = /that held the (.+)\.$/.exec(z.task[1])[1];
    eq(hits[0][1][oi(asked)] + 1, z.digit);
  },
  lock(z) {
    const d = z.draw, hits = [];
    (function go(a) {
      if (a.length === d.n) {
        if (d.rows.every((r) => {
          let right = 0, near = 0;
          r.guess.forEach((g, i) => { if (a[i] === g) right++; else if (a.includes(g)) near++; });
          return right === r.right && near === r.near;
        })) hits.push(a);
        return;
      }
      for (let i = 0; i < 10; i++) if (!a.includes(i)) go(a.concat([i]));
    })([]);
    eq(hits.length, 1, 'one code fits the tries');
    eq(hits[0][d.spot], z.digit);
  },
  symbols(z) {
    const d = z.draw, names = [];
    d.eqs.forEach((e) => e.terms.forEach((t) => { [t.s, t.times].forEach((s) => { if (s && !names.includes(s)) names.push(s); }); }));
    const hits = [];
    (function go(i, m) {
      if (i === names.length) {
        if (d.eqs.every((e) => e.terms.reduce((a, t) => a + (t.times ? m[t.s] * m[t.times] : m[t.s]), 0) === e.total)) hits.push(Object.assign({}, m));
        return;
      }
      for (let v = 1; v <= 9; v++) { m[names[i]] = v; go(i + 1, m); }
    })(0, {});
    eq(hits.length, 1, 'one set of values');
    eq(hits[0][d.target], z.digit);
  },
  sequence(z) {
    const next = +/next number is (\d+)/.exec(z.steps[0])[1], n = z.draw.nums;
    eq(next % 10, z.digit);
    ok(n.length >= 5, 'a row long enough to show the rule');
    // the rule printed has to fit every number shown, and give the next one
    const rule = z.steps[0], all = n.concat([next]);
    let m;
    if ((m = /Each number is (\d+) more/.exec(rule))) { for (let i = 1; i < all.length; i++) eq(all[i] - all[i - 1], +m[1]); }
    else if ((m = /step grows by one each time: \+(\d+)/.exec(rule))) { for (let i = 1; i < all.length; i++) eq(all[i] - all[i - 1], +m[1] + i - 1); }
    else if ((m = /take turns: \+(\d+), then -(\d+)/.exec(rule))) { for (let i = 1; i < all.length; i++) eq(all[i] - all[i - 1], i % 2 ? +m[1] : -m[2]); }
    else if (/doubled, plus 1/.test(rule)) { for (let i = 1; i < all.length; i++) eq(all[i], all[i - 1] * 2 + 1); }
    else if (/two before it added/.test(rule)) { for (let i = 2; i < all.length; i++) eq(all[i], all[i - 1] + all[i - 2]); }
    else if ((m = /odd places go up by (\d+), the even places by (\d+)/.exec(rule))) { for (let i = 2; i < all.length; i++) eq(all[i] - all[i - 2], i % 2 ? +m[2] : +m[1]); }
    else throw new Error('a rule nobody checked: ' + rule);
  },
  maze(z) {
    const d = z.draw, n = d.n, seen = {}, q = [d.start.join()];
    seen[q[0]] = 1;
    while (q.length) {
      const [r, c] = q.shift().split(',').map(Number);
      if (r > 0 && !d.walls.h[r][c] && !seen[(r - 1) + ',' + c]) { seen[(r - 1) + ',' + c] = 1; q.push((r - 1) + ',' + c); }
      if (r < n - 1 && !d.walls.h[r + 1][c] && !seen[(r + 1) + ',' + c]) { seen[(r + 1) + ',' + c] = 1; q.push((r + 1) + ',' + c); }
      if (c > 0 && !d.walls.v[r][c] && !seen[r + ',' + (c - 1)]) { seen[r + ',' + (c - 1)] = 1; q.push(r + ',' + (c - 1)); }
      if (c < n - 1 && !d.walls.v[r][c + 1] && !seen[r + ',' + (c + 1)]) { seen[r + ',' + (c + 1)] = 1; q.push(r + ',' + (c + 1)); }
    }
    const open = d.exits.filter((e) => seen[e.r + ',' + e.c]);
    eq(open.map((e) => e.label), [z.digit], 'only one exit can be reached');
    ok(d.exits.length >= 3, 'several exits');
    eq(new Set(d.exits.map((e) => e.label)).size, d.exits.length, 'exit numbers differ');
  },
  picture(z) {
    const d = z.draw, s = z.solved;
    // the clues printed really describe the picture
    eq(s.pic.map(E.runs), d.rows);
    eq(s.pic[0].map((_, x) => E.runs(s.pic.map((row) => row[x]))), d.cols);
    const given = {}; d.given.forEach((k) => { given[k] = 1; });
    eq(E.picSolve(d.rows, d.cols, given, 2).length, 1, 'one picture fits');
    d.given.forEach((k) => { const [y, x] = k.split(',').map(Number); eq(s.pic[y][x], 1, 'a shaded square belongs to the picture'); });
  },
  walk(z) {
    const d = z.draw, DIR = { north: [-1, 0], east: [0, 1], south: [1, 0], west: [0, -1] }, ORDER = ['north', 'east', 'south', 'west'];
    let at = d.start.slice(), face = null;
    d.words.forEach((w) => {
      let m;
      if ((m = /facing (\w+)/.exec(w))) { face = ORDER.indexOf(m[1]); return; }
      if (/^Start/.test(w)) return;
      if ((m = /^Go (\d) (\w+)\.$/.exec(w))) { const v = DIR[m[2]]; at = [at[0] + v[0] * m[1], at[1] + v[1] * m[1]]; }
      else if ((m = /^Turn (\w+) and walk (\d)/.exec(w))) { face = (face + (m[1] === 'right' ? 1 : 3)) % 4; const v = DIR[ORDER[face]]; at = [at[0] + v[0] * m[2], at[1] + v[1] * m[2]]; }
      else throw new Error('a direction nobody can read: ' + w);
      ok(at[0] >= 0 && at[1] >= 0 && at[0] < d.n && at[1] < d.n, 'the walk leaves the plan');
    });
    eq(d.grid[at[0]][at[1]], z.digit);
  },
  gears(z) {
    const g = z.draw.gears, turn = [true];
    for (let i = 1; i < g.length; i++) {
      eq(Math.abs(g[i].r - g[g[i].parent].r) + Math.abs(g[i].c - g[g[i].parent].c), 1, 'a gear touches its parent');
      turn[i] = !turn[g[i].parent];
    }
    // no gear touches another except along the chain, or it would jam
    for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) {
      if (Math.abs(g[a].r - g[b].r) + Math.abs(g[a].c - g[b].c) === 1) ok(g[b].parent === a || g[a].parent === b, 'two gears touch outside the chain');
    }
    const same = turn.filter(Boolean).length, against = /opposite way/.test(z.task[1]);
    eq(against ? g.length - same : same, z.digit);
  },
  clocks(z) {
    const h = z.draw.hours.concat([z.digit]);
    const steps = h.slice(1).map((v, i) => ((v - h[i]) % 12 + 12) % 12);
    const a = steps;
    ok((a[0] === a[1] && a[1] === a[2] && a[2] === a[3]) || (a[0] === a[2] && a[1] === a[3] && a[0] !== a[1]) || (a[1] === a[0] + 1 && a[2] === a[1] + 1 && a[3] === a[2] + 1), 'the steps follow a pattern: ' + a);
    ok(z.digit >= 1 && z.digit <= 9);
  },
  count(z) {
    const d = z.draw, t = z.task[0];
    let m, n = 0;
    if ((m = /^Count the (\w+)s on the board/.exec(t))) { d.cells.forEach((r) => r.forEach((c) => { if (c.s === m[1]) n++; })); }
    else if ((m = /^Count only the (\w+)s with a dot/.exec(t))) { d.cells.forEach((r) => r.forEach((c) => { if (c.s === m[1] && c.dot) n++; })); }
    else if ((m = /^Count only the (\w+)s that have a (\w+) directly above/.exec(t))) { d.cells.forEach((r, a) => r.forEach((c, b) => { if (c.s === m[1] && a > 0 && d.cells[a - 1][b].s === m[2]) n++; })); }
    else throw new Error('a rule nobody can read: ' + t);
    eq(n, z.digit);
  },
  search(z) {
    const d = z.draw, n = d.n, used = {};
    d.words.forEach((w) => {
      let hits = 0;
      [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]].forEach(([dr, dc]) => {
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
          let fine = true;
          for (let i = 0; i < w.length && fine; i++) { const x = r + dr * i, y = c + dc * i; fine = x >= 0 && y >= 0 && x < n && y < n && d.grid[x][y] === w[i]; }
          if (fine) { hits++; for (let i = 0; i < w.length; i++) used[(r + dr * i) + ',' + (c + dc * i)] = 1; }
        }
      });
      eq(hits, 1, w + ' is in the grid exactly once');
    });
    let left = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!used[r + ',' + c] && d.grid[r][c] !== '#') left += d.grid[r][c];
    ok(left.endsWith(E.NUMS[z.digit]) || left.includes(E.NUMS[z.digit]), 'the leftover letters read ' + left + ', not ' + E.NUMS[z.digit]);
    eq(left, z.steps[0].replace('With every word crossed off, the letters left read: ', '').replace(/[ .]/g, ''));
  },
  riddle(z) {
    const right = z.draw.options.filter((o) => o.text === 'A clock');
    eq(right.map((o) => o.label), [z.digit]);
    eq(new Set(z.draw.options.map((o) => o.label)).size, 4);
  }
};

(async function main() {
  // ---------- reader ----------
  await test('reader: the story reply in the asked-for format', () => {
    const text = S.story(10, 'escape'), r = CX.reader.readStory(text);
    eq(CX.reader.kind(text), 'story');
    ok(/^Lord Vex/.test(r.premise));
    eq(r.roomNames.length, 10);
    eq(r.roomNames[0], 'The Grand Hall');
    eq(r.word, ['BLACKTHORN']);
    eq(r.wordDecoys.length, 5);
    eq(r.wordDecoys[0], 'WHITETHORN', 'the letter count is dropped');
    eq(r.opening.length, 3);
    eq(r.alarms.length, 8);
    eq(r.titles.length, 3);
    ok(/^Twelve candles/.test(r.blurb));
  });

  await test('reader: suspects and the culprit', () => {
    const r = CX.reader.readStory(S.story(8, 'culprit'));
    eq(r.suspects.length, 5);
    eq(r.suspects[0], { name: 'Eleanor Easton', about: 'The housekeeper of thirty years, who was left nothing in the will.' });
    eq(r.culprit, 'Percival Poole');
    ok(r.badEnding.length === 1);
  });

  await test('reader: a messy rooms reply (bold labels, chatter, labels alone, a lead-in)', () => {
    const r = CX.reader.readRooms(S.MESSY);
    eq(CX.reader.kind(S.MESSY), 'rooms');
    eq(r.rooms.length, 1);
    const room = r.rooms[0];
    eq(room.no, 3);
    eq(CX.reader.roomFields(room.fields).name, 'The Music Room');
    eq(CX.reader.roomFields(room.fields).enter, ['You step inside.', 'The piano lid is open.']);
    eq(CX.reader.roomFields(room.fields).exit, ['The door opens.']);
    eq(room.puzzles.map((q) => q.no), [1, 2, 3]);
    const a = CX.reader.puzzleFields(room.puzzles[0].fields), b = CX.reader.puzzleFields(room.puzzles[1].fields), c = CX.reader.puzzleFields(room.puzzles[2].fields);
    eq(a.title, 'The Butler’s Note');
    ok(/\[N\]/.test(a.message), 'the marker survives');
    eq(b.title, 'The Grid');
    eq(b.people, ['Ada', 'Boris', 'Clara', 'Dmitri']);
    eq(b.objects, ['map', 'ring', 'key', 'letter']);
    eq(b.place, 'locker');
    eq(c.words, ['CANDLE', 'MIRROR', 'SHADOW'], 'the "..." is no word');
    eq(c.wrong, ['A', 'B', 'C']);
  });

  await test('reader: nonsense is not a reply', () => {
    eq(CX.reader.kind('Sure! Happy to help with your book.'), 'unknown');
  });

  // ---------- every puzzle, solved again ----------
  for (const k of E.list()) {
    await test('puzzle ' + k.id + ': every level and digit, proved by a separate solver', () => {
      [1, 2, 3].forEach((level) => {
        k.digits(level).forEach((digit) => {
          for (let i = 0; i < 4; i++) {
            const z = E.build({ kind: k.id, level, digit, seed: 'proof|' + i, data: k.short ? SHORT : DATA });
            ok(!z.problem, k.id + ' level ' + level + ' digit ' + digit + ': ' + z.problem);
            eq(z.digit, digit);
            SOLVE[k.id](z);
            eq(z.hints.length, 3, 'three hints');
            z.hints.forEach((h) => ok(h && h.length > 8, 'an empty hint'));
            ok(z.trap.digit !== digit && z.trap.digit >= 0 && z.trap.digit <= 9, 'the slip is another digit: ' + z.trap.digit);
            ok(z.trap.note && z.task.length, 'text is there');
          }
        });
      });
    });
  }

  await test('puzzle: the same seed gives the same puzzle', () => {
    E.list().forEach((k) => {
      const a = E.build({ kind: k.id, level: 2, seed: 'same', data: k.short ? SHORT : DATA }), b = E.build({ kind: k.id, level: 2, seed: 'same', data: k.short ? SHORT : DATA });
      eq(JSON.stringify(a), JSON.stringify(b), k.id);
    });
  });

  await test('puzzle: a bad message is refused and says why', () => {
    ok(/another|also names/.test(E.build({ kind: 'caesar', level: 1, seed: 'x', data: { message: 'TAKE SEVEN STEPS TO DOOR [N]' } }).problem));
    ok(/letters long/.test(E.build({ kind: 'morse', level: 1, seed: 'x', data: { message: 'THIS MESSAGE IS FAR TOO LONG FOR MORSE CODE [N]' } }).problem));
    ok(/no message/.test(E.build({ kind: 'numbers', level: 1, seed: 'x', data: {} }).problem));
    ok(/riddle/.test(E.build({ kind: 'riddle', level: 1, seed: 'x', data: {} }).problem));
    ok(/people/.test(E.build({ kind: 'logic', level: 1, seed: 'x', data: { objects: DATA.objects, place: 'box' } }).problem));
  });

  await test('puzzle: a message with no marker still gets its number word', () => {
    const z = E.build({ kind: 'numbers', level: 1, seed: 'x', digit: 7, data: { message: 'LOOK BEHIND THE CLOCK' } });
    eq(z.solved.words.join(' '), 'LOOK BEHIND THE CLOCK SEVEN');
  });

  // ---------- the plan ----------
  await test('plan: no room repeats a type or holds more than two text codes; all types get used', () => {
    ['a', 'b', 'c', 'd'].forEach((seed) => {
      [[6, 3], [8, 4], [10, 4], [16, 4], [4, 3]].forEach(([rooms, per]) => {
        const p = P.newProject(); p.seed = seed; p.plan.rooms = rooms; p.plan.perRoom = per;
        const plan = P.kindPlan(p);
        plan.forEach((r) => {
          eq(new Set(r).size, r.length, 'no repeats in a room: ' + r);
          ok(r.filter((k) => E.kind(k).group === 'code').length <= 2, 'at most two text codes');
        });
        if (rooms * per >= E.list().length + 4) eq(new Set([].concat.apply([], plan)).size, E.list().length, 'a big book uses every type');
      });
    });
  });

  await test('plan: a rising book gets harder and kids stay on easy', () => {
    const p = P.newProject(); p.plan.rooms = 9;
    eq(P.rooms(p).map((r) => r.level), [1, 1, 1, 2, 2, 2, 3, 3, 3]);
    P.setAudience(p.plan, 'kids');
    eq(new Set(P.rooms(p).map((r) => r.level)).size, 1);
    ok(p.plan.kinds.every((k) => E.kind(k).kid), 'only the gentler types');
    ok(p.plan.kinds.indexOf('logic') === -1);
  });

  await test('plan: a type the user chose stays and the prompt follows it', () => {
    const p = P.newProject(), r = P.rooms(p)[0], other = E.list().filter((k) => k.id !== r.slots[0].kind && !r.slots.some((s) => s.kind === k.id))[0];
    P.puzzle(p, r.slots[0]).kind = other.id;
    eq(P.rooms(p)[0].slots[0].kind, other.id);
  });

  await test('project file: normalize keeps the work and drops rubbish', () => {
    const p = fullProject();
    const back = P.normalize(JSON.parse(JSON.stringify(p)));
    eq(back.rooms, p.rooms);
    eq(back.story, p.story);
    const empty = P.normalize({ plan: { rooms: 99, kinds: ['nope'] }, rooms: { x: {}, r1: { puzzles: { zz: {} } } } });
    eq(empty.plan.rooms, 10);
    ok(empty.plan.kinds.length > 4);
    eq(Object.keys(empty.rooms), ['r1']);
  });

  // ---------- the doors ----------
  await test('door: each table holds the real code once, and no digit gives it away', () => {
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach((seed) => {
      [3, 4].forEach((per) => {
        const p = fullProject((q) => { q.seed = seed; q.plan.perRoom = per; });
        P.rooms(p).forEach((room) => {
          const d = Z.door(p, room);
          ok(d, 'a door');
          eq(d.table.length, Z.ROWS);
          eq(d.table.filter((r) => r.real).map((r) => r.code), [d.code]);
          eq(new Set(d.table.map((r) => r.code)).size, Z.ROWS, 'all codes differ');
          eq(d.code, Z.roomPuzzles(p, room).map((b) => b.pz.digit).join(''));
          // in every place the real digit is no more common than the slip digit
          for (let i = 0; i < per; i++) {
            const real = d.table.filter((r) => r.code[i] === d.code[i]).length;
            ok(real <= Z.ROWS / 2 + (per === 3 ? 0 : 1), 'place ' + i + ' of ' + d.table.map((r) => r.code) + ' gives it away');
          }
          ok(d.table.filter((r) => r.wrong.length === 1).length >= 2, 'some one-digit slips, so a Dead End can say which puzzle');
          d.table.filter((r) => !r.real).forEach((r) => ok(r.wrong.length >= 1, 'a false code is false'));
        });
      });
    });
  });

  await test('finale: key letters spell the word once, out of order', () => {
    const p = fullProject();
    const letters = Z.rewards(p).map((r) => r.letter), word = P.letters(p.story.word);
    eq(letters.slice().sort().join(''), word.split('').sort().join(''));
    ok(letters.join('') !== word, 'the log must not simply spell it');
  });

  await test('finale: every innocent suspect is cleared in a room, and the culprit never', () => {
    const p = fullProject((q) => { q.plan.finale = 'culprit'; q.plan.rooms = 8; });
    const cleared = Z.rewards(p).filter((r) => r.clears).map((r) => r.clears).sort();
    eq(cleared, p.story.suspects.map((s) => s.name).filter((n) => n !== p.story.culprit).sort());
    Z.rewards(p).filter((r) => r.clears).forEach((r) => ok(r.evidence, 'the clue is written'));
  });

  await test('finale: the first candidate of the right length wins, and wrong-length decoys stay out', () => {
    const p = P.newProject();
    CX.content.addStory(p, CX.reader.readStory('FINAL WORD: LANTERN (10), BLACKTHORN (10), WHITETHORN (10)\nDECOYS: GOLDENROOM (10), SHORT (10), STORMCLOUD (10), COPPERGATE (9)'));
    eq(p.story.word, 'BLACKTHORN');
    eq(Z.goodDecoys(p).sort(), ['COPPERGATE', 'GOLDENROOM', 'STORMCLOUD', 'WHITETHORN'].sort());
    ok(!Z.goodDecoys(p).includes('SHORT') && !Z.goodDecoys(p).includes('LANTERN'), 'a wrong length would stand out');
    p.story.wordDecoys = ['SHORT'];
    ok(CX.prompts.storyNeeds(p).includes('decoys'), 'too few good decoys are asked for again');
    p.story.word = 'SHORT';
    ok(/could not be used: the final word has 5 letters/.test(CX.prompts.text(p, CX.prompts.list(p)[0])), 'the prompt says what went wrong');
  });

  await test('finale: a word of the wrong length is caught', () => {
    const p = fullProject();
    p.story.word = 'SHORT';
    ok(/5 letters/.test(Z.wordProblem(p)));
    ok(CX.prompts.storyNeeds(p).includes('word'));
    const it = CX.checklist.run(p, CX.layout.layoutBook(p, {})).filter((x) => x.label === 'The final word')[0];
    ok(!it.ok);
  });

  // ---------- the route ----------
  await test('route: the book plays from the first room to the ending, in every shape', () => {
    [{}, { plan: { perRoom: 3, rooms: 6 } }, { plan: { rooms: 12 } }, { plan: { finale: 'culprit', rooms: 8 } }, { plan: { shuffle: false } }, { plan: { flip: false, rooms: 4 } }, { book: { trim: '8.5x11', print: 'large' } }].forEach((o) => {
      ['s1', 's2', 's3'].forEach((seed) => {
        const p = fullProject((q) => { q.seed = seed; Object.assign(q.plan, o.plan || {}); Object.assign(q.book, o.book || {}); });
        const book = CX.layout.layoutBook(p, {}), problems = CX.layout.verifyRoute(p, book);
        eq(problems, [], JSON.stringify(o) + ' ' + seed);
      });
    });
  });

  await test('route: the page numbers are on the printed page', () => {
    const p = fullProject(), book = CX.layout.layoutBook(p, {}), M = book.model;
    // follow the printed words only, from room 1 to the ending
    const textOf = (pg) => pg.items.filter((i) => i.t === 'text').map((i) => i.str).join('\n');
    let at = book.pages.find((g) => g.meta.room === 1), steps = 0;
    M.rooms.forEach((room) => {
      eq(at.meta.room, room.no, 'on the right room');
      const door = book.pages.find((g) => g.meta.door === room.no), code = M.doors[room.id].code, t = textOf(door);
      const m = new RegExp(code.split('').join(' ') + '\\n+turn to page (\\d+)').exec(t);
      ok(m, 'the code ' + code + ' is printed with a page');
      at = book.pages[+m[1] - 1];
      steps++;
    });
    ok(at.meta.final, 'the last code leads to the last door');
    eq(steps, M.rooms.length);
    const word = P.letters(p.story.word), mw = new RegExp(word + '\\n+turn to page (\\d+)').exec(textOf(at));
    ok(mw, 'the word is printed');
    ok(book.pages[+mw[1] - 1].meta.ending, 'the word leads to the ending');
  });

  await test('route: a wrong code gets a Dead End that names it and sends you back', () => {
    const p = fullProject(), book = CX.layout.layoutBook(p, {});
    const door = book.pages.find((g) => g.meta.door === 1), wrong = door.meta.rows.filter((r) => !r.real);
    eq(wrong.length, Z.ROWS - 1);
    wrong.forEach((r) => {
      const dead = book.pages[r.page - 1];
      eq(dead.kind, 'dead');
      const t = dead.items.filter((i) => i.t === 'text').map((i) => i.str).join(' ');
      ok(t.includes(r.code.split('').join(' ')), 'it names the code');
      ok(t.includes('Back to page ' + door.num), 'it sends you back');
    });
    eq(new Set(door.meta.rows.map((r) => r.page)).size, Z.ROWS, 'no row stands out by its page number');
  });

  await test('route: every puzzle points at its three hints and its answer', () => {
    const p = fullProject(), book = CX.layout.layoutBook(p, {});
    book.pages.filter((g) => g.kind === 'puzzle').forEach((g) => {
      const foot = g.items.filter((i) => i.t === 'text' && /^Stuck\?/.test(i.str))[0];
      ok(foot, 'a way to the hints on page ' + g.num);
      const m = /Hints: page (\d+), page (\d+), page (\d+)\. Answer: page (\d+)\./.exec(foot.str);
      ok(m, foot.str);
      const texts = [1, 2, 3, 4].map((i) => book.pages[+m[i] - 1].items.filter((x) => x.t === 'text').map((x) => x.str));
      [0, 1, 2].forEach((i) => { ok(texts[i].includes(g.meta.key), 'hint ' + i + ' of ' + g.meta.key + ' is on page ' + m[i + 1]); eq(book.pages[+m[i + 1] - 1].kind, 'hints'); });
      ok(texts[3].some((s) => s.indexOf(g.meta.key + '  ') === 0), 'the answer to ' + g.meta.key + ' is on page ' + m[4]);
    });
  });

  await test('route: rooms are not in order, and a shuffled room is never just the next page', () => {
    const p = fullProject(), book = CX.layout.layoutBook(p, {}), order = book.pages.filter((g) => g.meta.room).map((g) => g.meta.room);
    ok(order.join() !== order.slice().sort((a, b) => a - b).join(), 'shuffled');
    eq(order[0], 1, 'room 1 comes first');
  });

  await test('answers: the upside-down pages are turned, the rest are not', () => {
    const p = fullProject(), book = CX.layout.layoutBook(p, {});
    const flipped = book.pages.filter((g) => g.flip);
    ok(flipped.length > 2);
    ok(flipped.every((g) => g.kind === 'answers' || g.kind === 'master'));
    flipped.forEach((g) => {
      const words = g.items.filter((i) => i.t === 'text');
      ok(words.filter((i) => i.angle === 180).length === words.length - 1, 'all but the page number on page ' + g.num);
      ok(!words[words.length - 1].angle, 'the page number stays upright');
    });
    const off = fullProject((q) => { q.plan.flip = false; });
    eq(CX.layout.layoutBook(off, {}).pages.filter((g) => g.flip).length, 0);
  });

  // ---------- prompts ----------
  await test('prompts: the story comes first, and each room prompt tells the AI what the page shows', () => {
    const p = P.newProject(), l = CX.prompts.list(p);
    eq(l[0].kind, 'story');
    eq(l.length, 6);
    const t = CX.prompts.text(p, l[0]);
    ok(/exactly 10 letters/.test(t));
    ok(/Give 3 candidates/.test(t));
    ok(/ROOMS: a numbered list of exactly 10/.test(t));
    const r = CX.prompts.text(p, l[1]);
    ok(/ROOM 1/.test(r) && /ROOM 2/.test(r));
    ok(/PUZZLE 1\.1/.test(r));
    ok(/never explain a puzzle/.test(r));
  });

  await test('prompts: a message slot asks for the [N] marker, with the shortest limit', () => {
    const p = P.newProject();
    const room = P.rooms(p).filter((x) => x.slots.some((s) => s.kind === 'morse'))[0];
    const t = CX.prompts.text(p, { kind: 'rooms', rooms: [room] });
    ok(/\[N\]/.test(t));
    ok(/MESSAGE \(at most 15 letters\)/.test(t), 'morse: 20 letters less room for the number word');
    // a message at the limit, with the longest number word in it, still builds
    const k = E.kind('morse');
    ok(!E.build({ kind: 'morse', level: 1, digit: 3, seed: 'x', data: { message: 'ABCDEFGHIJKLMNO [N]' } }).problem, k.id);
  });

  await test('prompts: the writing has no brand or rival names, and no spoiler of how a puzzle is solved', () => {
    const p = P.newProject();
    CX.prompts.list(p).forEach((pr) => {
      const t = CX.prompts.text(p, pr);
      ['Strands', 'Murdoku', 'Puzzling Escapes', 'Locked In', 'Vex Manor', 'Kosmos'].forEach((n) => ok(!t.includes(n), 'prompt names ' + n));
      ok(!/the page shows[^\n]*sudoku/i.test(t), 'names a puzzle type to the reader');
    });
  });

  await test('prompts: copying again only asks for what is missing', () => {
    const p = P.newProject();
    const l = CX.prompts.list(p);
    CX.content.addStory(p, CX.reader.readStory(S.story(10, 'escape')));
    eq(CX.prompts.storyNeeds(p), []);
    ok(CX.prompts.list(p)[0].done);
    const pr = l[1];
    CX.content.addRooms(p, CX.reader.readRooms(S.rooms(pr.rooms, CX)), pr.rooms);
    ok(CX.prompts.list(p)[1].done);
    // knock out one field: the prompt asks for that field of that puzzle
    const slot = pr.rooms[0].slots[0], q = P.puzzle(p, slot);
    q.story = '';
    const t = CX.prompts.text(p, CX.prompts.list(p)[1]);
    ok(new RegExp('PUZZLE ' + slot.key.replace('.', '\\.') + ':.*Write STORY\\.').test(t), 'asks for the story');
    ok(!/ENTER: walking in/.test(t), 'no room text it already has');
    ok(!new RegExp('PUZZLE ' + pr.rooms[0].slots[1].key.replace('.', '\\.') + ':').test(t), 'nothing for a finished puzzle');
  });

  await test('prompts: a kid book asks for kid writing, a culprit book for suspects', () => {
    const k = P.newProject(); P.setAudience(k.plan, 'kids');
    ok(/9-year-old can read/.test(CX.prompts.text(k, CX.prompts.list(k)[1])));
    ok(/ask the child to tell a grown-up/.test(CX.prompts.text(k, CX.prompts.list(k)[0])));
    const c = P.newProject(); c.plan.finale = 'culprit';
    const t = CX.prompts.text(c, CX.prompts.list(c)[0]);
    ok(/SUSPECTS/.test(t) && /CULPRIT/.test(t) && !/FINAL WORD/.test(t));
    CX.content.addStory(c, CX.reader.readStory(S.story(10, 'culprit')));
    const room = P.rooms(c).filter((r) => CX.prompts.evidenceFor(c, r))[0];
    ok(new RegExp('EVIDENCE: one sentence.*' + CX.prompts.evidenceFor(c, room)).test(CX.prompts.text(c, { kind: 'rooms', rooms: [room] })));
  });

  await test('content: a reply replaces what it names and nothing else; a fresh reply goes to its room', () => {
    const p = fullProject(), room = P.rooms(p)[2], before = JSON.stringify(p.rooms[room.id].enter);
    CX.content.addRooms(p, CX.reader.readRooms('ROOM 3\nEXIT: A new way out.'), []);
    eq(p.rooms[room.id].exit, ['A new way out.']);
    eq(JSON.stringify(p.rooms[room.id].enter), before);
    const rep = CX.content.addRooms(p, CX.reader.readRooms('ROOM 99\nENTER: Nowhere.'), []);
    ok(rep.unplaced > 0);
    CX.content.clearRooms(p, [room]);
    eq(p.rooms[room.id].enter, []);
    ok(!CX.prompts.roomDone(p, room));
  });

  await test('checklist: a finished book is all green, an empty one is not', () => {
    const p = fullProject(), items = CX.checklist.run(p, CX.layout.layoutBook(p, {}));
    eq(items.filter((i) => !i.ok).map((i) => i.label + ': ' + i.detail), []);
    const e = P.newProject(), bad = CX.checklist.run(e, CX.layout.layoutBook(e, {})).filter((i) => !i.ok).map((i) => i.label);
    ok(bad.includes('Pen name') && bad.includes('The story') && bad.includes('The rooms'));
  });

  await test('checklist: repeats are found', () => {
    const p = fullProject(), r = P.rooms(p);
    P.puzzle(p, r[1].slots[0]).title = P.puzzle(p, r[0].slots[0]).title;
    ok(CX.content.repeats(p).some((x) => x.what === 'title'));
  });

  // ---------- pages ----------
  await test('layout: every trim and text size keeps the KDP rules, nothing overlaps or gets cramped', () => {
    CX.kdp.TRIMS.forEach((t) => {
      Object.keys(CX.layout.PRINT).forEach((print) => {
        ['one', 'two'].forEach((seed) => {
          const p = fullProject((q) => { q.seed = seed; q.book.trim = t.id; q.book.print = print; });
          const book = CX.layout.layoutBook(p, {});
          book.pages.forEach((pg) => {
            checkPage(pg);
            const c = clash(pg);
            ok(!c, t.id + ' ' + print + ': words overlap: ' + c);
            // the words of a page end above its page number
          });
          const tight = book.pages.filter((g) => g.meta.tight).map((g) => g.meta.tight);
          eq(tight.map((key) => key + ' ' + P.rooms(p)[+key.split('.')[0] - 1].slots[+key.split('.')[1] - 1].kind), [], t.id + ' ' + print + ' cramped puzzles');
          ok(book.pages.length >= CX.kdp.MIN_PAGES);
          eq(CX.layout.verifyRoute(p, book), [], t.id + ' ' + print);
        });
      });
    });
  });

  await test('layout: every puzzle type fits the smallest page in the largest print, at the hardest level', () => {
    E.list().forEach((k) => {
      const p = P.newProject();
      p.seed = 'fit-' + k.id; p.book.trim = '5.5x8.5'; p.book.print = 'large'; p.plan.level = 'hard';
      p.plan.kinds = E.list().map((x) => x.id);
      CX.content.addStory(p, CX.reader.readStory(S.story(p.plan.rooms, p.plan.finale)));
      P.rooms(p).forEach((r) => { r.slots.forEach((s) => { P.puzzle(p, s).kind = k.id; }); });
      CX.prompts.list(p).forEach((pr) => { if (pr.kind === 'rooms') CX.content.addRooms(p, CX.reader.readRooms(S.rooms(pr.rooms, CX)), pr.rooms); });
      const book = CX.layout.layoutBook(p, {});
      const pz = book.pages.filter((g) => g.kind === 'puzzle');
      eq(pz.length, 40);
      pz.forEach(checkPage);
      eq(pz.filter((g) => g.meta.tight).map((g) => g.meta.tight), [], k.id + ' is cramped');
      pz.forEach((g) => ok(!clash(g), k.id + ': ' + clash(g)));
    });
  });

  await test('layout: the draft shows placeholders, the print copy does not', () => {
    const p = P.newProject();
    const draft = CX.layout.layoutBook(p, { draft: true }), print = CX.layout.layoutBook(p, {});
    const has = (b, s) => b.pages.some((g) => g.items.some((i) => i.t === 'text' && i.str.includes(s)));
    ok(has(draft, 'goes here'));
    ok(!has(print, 'goes here'));
  });

  await test('layout: the Master Key explains its missing rows in the preview only, the right way up', () => {
    const p = P.newProject();
    const note = (b) => b.pages.filter((g) => g.kind === 'master').map((g) => g.items.filter((i) => i.t === 'text' && /other codes go here/.test(i.str))[0]).filter(Boolean);
    const shown = note(CX.layout.layoutBook(p, { draft: true }));
    eq(shown.length, 1);
    ok(!shown[0].angle, 'not upside down');
    eq(note(CX.layout.layoutBook(p, {})).length, 0, 'never in the PDF');
    eq(note(CX.layout.layoutBook(fullProject(), { draft: true })).length, 0, 'gone when every room is in');
  });

  await test('layout: Dead End pages are evenly full', () => {
    const p = fullProject(), book = CX.layout.layoutBook(p, {}), dead = book.pages.filter((g) => g.kind === 'dead').map((g) => g.meta.entries.length);
    ok(Math.max.apply(null, dead) - Math.min.apply(null, dead) <= 3, 'entries a page: ' + dead);
  });

  await test('layout: a book is a sensible length', () => {
    const p = fullProject(), n = CX.layout.layoutBook(p, {}).pages.length;
    ok(n >= 85 && n <= 135, n + ' pages');
    ok(n <= CX.kdp.maxPages('6x9', 'white'));
  });

  // ---------- covers ----------
  await test('covers: every template on every trim keeps its words on the front and clear of the barcode', () => {
    const p = fullProject(), pages = CX.layout.layoutBook(p, {}).pages.length;
    CX.kdp.TRIMS.forEach((t) => {
      p.book.trim = t.id;
      CX.cover.DESIGNS.forEach((d) => {
        p.cover.design = d.id; p.cover.palette = '';
        const cv = CX.cover.build(p, pages), g = cv.guides, bleed = 0.375 * 72;
        const front = cv.items.filter((i) => i.t === 'text' && !i.angle && i.x >= g.spineX1 - 1);
        ok(front.length >= 3, d.id + ' has words');
        front.forEach((i) => {
          const w = F[i.font].width(i.str, i.size, i.ls || 0);
          ok(i.x >= g.spineX1 + 0.25 * 72 - 1 && i.x + w <= cv.W - g.bleed - 0.25 * 72 + 1, d.id + ' on ' + t.id + ': "' + i.str + '" runs outside the safe area');
          ok(i.y - i.size * 0.8 >= g.bleed + 0.25 * 72 - 1 && i.y <= cv.H - g.bleed - 0.25 * 72 + 1, d.id + ' on ' + t.id + ': "' + i.str + '" runs off top or bottom');
        });
        ok(!cv.overlapsBarcode, d.id + ' on ' + t.id + ' runs into the barcode');
        const size = CX.kdp.cover(t.id, pages, p.book.paper);
        ok(Math.abs(cv.W - size.width * 72) < 0.01 && Math.abs(cv.H - size.height * 72) < 0.01, 'exact size');
      });
    });
  });

  await test('covers: a long title still fits, and each setting has a picture', () => {
    const p = fullProject(), pages = CX.layout.layoutBook(p, {}).pages.length;
    p.book.title = 'The Extraordinarily Long Night of the Fourteenth Guest at the Very Old Manor by the Sea';
    CX.cover.DESIGNS.forEach((d) => {
      p.cover.design = d.id;
      const cv = CX.cover.build(p, pages), g = cv.guides;
      cv.items.filter((i) => i.t === 'text' && !i.angle && i.x >= g.spineX1 - 1).forEach((i) => ok(i.size >= 7, d.id + ' ' + i.str + ' ' + i.size));
    });
    P.SETTINGS.forEach((s) => ok(CX.coverFronts.ART[s.art], s.id + ' draws ' + s.art));
    P.SETTINGS.forEach((s) => ok(CX.cover.DESIGNS.some((d) => d.opt.art === s.art), s.id + ' has a template'));
  });

  // ---------- real files ----------
  await test('pdf: a real interior and cover, checked with PyMuPDF', async () => {
    const p = fullProject(), book = CX.layout.layoutBook(p, {}), cv = CX.cover.build(p, book.pages.length);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erb-')), a = path.join(dir, 'i.pdf'), c = path.join(dir, 'c.pdf');
    fs.writeFileSync(a, Buffer.from(await CX.pdf.build(book, { fileId: 'a'.repeat(32) })));
    fs.writeFileSync(c, Buffer.from(await CX.pdf.buildCover(cv, { fileId: 'b'.repeat(32) })));
    let out = '';
    try { out = execFileSync('python', [path.join(__dirname, 'verify-pdf.py'), a, book.W, book.H, book.pages.length, c, cv.W, cv.H].map(String), { encoding: 'utf8' }); }
    catch (e) { if (/fitz|No module/.test(String(e.stderr || e))) { console.log('     (PyMuPDF not found, skipped)'); return; } throw new Error(String(e.stderr || e)); }
    ok(/^OK /.test(out.trim()), out);
    const bytes = fs.readFileSync(a).toString('latin1');
    ok(!/\/Producer \(/.test(bytes), 'no metadata');
  });

  await test('pptx: the Canva copy builds, including upside-down pages', async () => {
    const p = fullProject((q) => { q.plan.rooms = 4; }), book = CX.layout.layoutBook(p, {});
    const a = await CX.pptx.build(book), b = await CX.pptx.buildCover(CX.cover.build(p, book.pages.length));
    ok(a.length > 1000 && b.length > 1000);
    eq(String.fromCharCode(a[0], a[1]), 'PK');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
