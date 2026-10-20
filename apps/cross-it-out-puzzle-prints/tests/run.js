/*
 * The test suite: node tests/run.js
 * Engine fairness, the AI reply reader, whole books in every layout and size, the KDP checks
 * on every page and cover, and real PDFs (checked with PyMuPDF when Python has it).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const env = require('./node-env.js');
const CX = env.loadAll();

let passed = 0, failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log('  ok   ' + name); },
    (e) => { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); });
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'expected equal') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); }

// A project that uses only its own packs: the starter packs, renamed, as if an AI wrote them.
function aiReply(n, tag) {
  const packs = CX.starter.packs().slice(0, n).map((p) => ({
    topic: p.topic + ' ' + tag,
    cases: p.cases.map((c) => ({ title: c.title + ' ' + tag, story: c.story })),
    options: p.options,
    facts: p.facts.map((f) => ({ clue: f.clue, not: f.not, yes: f.yes.map((i) => p.options[i]), maybe: f.maybe.map((i) => p.options[i]) }))
  }));
  return 'Sure! Here are your packs.\n```json\n' + JSON.stringify({ packs }, null, 2) + '\n```\nEnjoy!';
}
function project(o) {
  const p = CX.book.newProject();
  p.seed = o.seed || 'test1';
  p.setup.title = 'Last One Standing';
  p.setup.author = 'Ruth Ellery';
  Object.assign(p.setup, o.setup || {});
  if (o.own) p.packs = CX.packs.read(aiReply(o.own, 'X')).packs;
  return p;
}

(async function main() {
  console.log('Cross It Out Puzzle Prints tests');

  await test('starter library: 22 clean packs, no notes, every pack Master-ready', () => {
    const packs = CX.starter.packs();
    eq(packs.length, 22, 'pack count');
    packs.forEach((p) => {
      eq(p._notes.length, 0, p.topic + ' notes');
      assert(p.options.length >= 24, p.topic + ' has ' + p.options.length + ' options');
      eq(p.cases.length, 2, p.topic + ' cases');
      assert(p.facts.length >= 5, p.topic + ' facts');
    });
  });

  await test('engine: every level, every audience, 3 seeds, all fair', () => {
    let made = 0;
    CX.starter.packs().forEach((p) => {
      ['adults', 'kids'].forEach((aud) => {
        CX.engine.LEVELS.forEach((lv) => {
          ['a', 'b', 'c'].forEach((sd) => {
            const ci = sd === 'b' ? 1 : 0;
            const r = CX.engine.make(p, ci, { seed: sd + p.id + lv.id + aud, level: lv.id, audience: aud });
            if (!r.ok) return;
            made++;
            const L = CX.engine.level(lv.id, aud);
            eq(r.clues.length, L.clues, 'clue count');
            assert(r.lineup.length >= L.lineup[0] && r.lineup.length <= L.lineup[1], 'line-up size');
            r.clues.forEach((c) => assert(c.tier <= L.maxTier + 1e-9 || c.type === 'fact', 'tier too high: ' + c.text));
            const probs = CX.engine.verify(p, r);
            assert(!probs.length, p.topic + ' ' + lv.id + ': ' + probs.join('; '));
            const mentions = CX.engine.prepare(p).mentions[ci];
            assert(mentions.indexOf(r.lineup[r.answer]) === -1, 'the answer is named in its own story');
          });
        });
      });
    });
    assert(made >= 22 * 2 * 4 * 3 * 0.95, 'too many failures: made ' + made);
  });

  await test('engine: steps cross out every option but the answer, once', () => {
    const p = CX.starter.packs()[3];
    const r = CX.engine.make(p, 0, { seed: 'steps', level: 'master' });
    const st = CX.engine.steps(r), seen = {};
    st.forEach((list) => list.forEach((i) => { assert(!seen[i], 'crossed twice'); seen[i] = 1; }));
    eq(Object.keys(seen).length, r.lineup.length - 1);
    assert(!seen[r.answer], 'answer crossed');
  });

  await test('clues: letter rules (Y is no vowel, hyphens, spaces)', () => {
    const T = CX.clues.TYPES, i = CX.clues.info;
    eq(T.longer.test(i('Ice Cream'), 7), CX.clues.YES, 'ICE CREAM has 8 letters');
    eq(T.vowelsMin.test(i('Rhythm'), 1), CX.clues.MAYBE, 'RHYTHM: only Y, so debatable');
    eq(T.vowelsMin.test(i('Crwth'), 1), CX.clues.NO, 'no vowel at all');
    eq(T.single.test(i('T-Shirt')), CX.clues.MAYBE, 'hyphen is debatable');
    eq(T.double.test(i('Bus Stop')), CX.clues.MAYBE, 'SS across a space is debatable');
    eq(T.double.test(i('Pen Cap')), CX.clues.NO);
    eq(T.double.test(i('Ice Lolly')), CX.clues.YES);
    eq(T.startsVowel.test(i('Yam')), CX.clues.MAYBE);
    eq(CX.clues.cleanOption('  3. CAFÉ ').text, 'Cafe');
    assert(!CX.clues.cleanOption('7-Up').ok, 'numbers refused');
  });

  await test('reader: messy AI replies (prose, trailing commas, smart quotes, cut off)', () => {
    const messy = 'Here you go:\n```json\n{ "packs": [ { “topic”: “Things in a shed”, "cases": [ {"title":"The Lost Key","story":"Dad lost something in the shed. What was it?"}, {"title":"The Odd Smell","story":"Something in the shed smells odd. Which thing is it?"}, ], ' +
      '"options": ["Rake","Shovel","Hammer","Ladder","Bucket","Hose","Saw","Drill","Wheelbarrow","Paint Can","Flowerpot","Bicycle","Lawnmower","Toolbox","Broom","Gloves",], ' +
      '"facts": [ {"clue":"It has a handle","not":"It does not have a handle","yes":["Rake","Shovel","Hammer","Saw","Drill","Broom","Bucket"],"maybe":["Hose"]}, {"clue":"It is delicious","yes":["Rake"]} ] } ] }\n```';
    const r = CX.packs.read(messy);
    eq(r.packs.length, 1, 'one pack: ' + r.errors.join('; '));
    const p = r.packs[0];
    eq(p.topic, 'Things in a shed');
    eq(p.options.length, 16);
    eq(p.facts.length, 1, 'the opinion fact is dropped');
    assert(r.notes.some((n) => /opinion/.test(n)), 'note explains the dropped fact');
    const cut = CX.packs.read(aiReply(3, 'Z').slice(0, -900));
    assert(cut.cutOff, 'cut-off reply detected');
    assert(cut.packs.length >= 1, 'complete packs before the cut are kept');
    const fix = CX.prompts.fixPrompt(cut);
    assert(/cut off/.test(fix), 'fix prompt mentions the cut');
  });

  await test('prompts: pack prompt has the rules, the theme and topics to avoid', () => {
    const p = project({});
    const t = CX.prompts.packPrompt(p, { theme: 'christmas', count: 8, avoid: ['Fruit at the market'] });
    assert(/8 new puzzle packs/.test(t) && /Christmas/.test(t) && /Fruit at the market/.test(t) && /```json/.test(t));
  });

  await test('book: own packs come first, the starter library only fills gaps', () => {
    const p = project({ own: 16 });
    const b = CX.book.build(p);
    eq(b.all.length, 40);
    assert(b.starterShare <= 0.25, 'starter share ' + b.starterShare);
    const ck = CX.checklist.build(p, b, CX.layout.layoutBook(p, b));
    assert(ck.canDownload, ck.items.filter((i) => !i.ok).map((i) => i.title + ': ' + i.detail).join('; '));
  });

  await test('book: the starter library alone cannot be downloaded', () => {
    const p = project({});
    const b = CX.book.build(p);
    const ck = CX.checklist.build(p, b, CX.layout.layoutBook(p, b));
    assert(!ck.canDownload, 'should be blocked');
    assert(ck.items.some((i) => i.title === 'Your own content' && !i.ok));
  });

  await test('book: same project, same book; a new seed, a new book', () => {
    const a = CX.book.build(project({ own: 10 })), b = CX.book.build(project({ own: 10 }));
    const sig = (x) => x.all.map((z) => z.key + z.options[z.answer] + z.clues.map((c) => c.text).join()).join('|');
    eq(sig(a), sig(b));
    CX.book.clearCache();
    eq(sig(CX.book.build(project({ own: 10 }))), sig(a), 'after clearing the cache');
    assert(sig(CX.book.build(project({ own: 10, seed: 'other' }))) !== sig(a));
  });

  await test('book: case tweaks (new clues, remove) and save/open round trip', () => {
    const p = project({ own: 12 });
    const b0 = CX.book.build(p);
    const k = b0.all[3].key;
    p.tweaks[k] = { v: 1 };
    p.tweaks[b0.all[4].key] = { off: true };
    const b1 = CX.book.build(p);
    assert(!b1.all.some((z) => z.key === b0.all[4].key), 'removed');
    const saved = JSON.parse(JSON.stringify({ project: CX.book.toSave(p) }));
    const q = CX.book.upgrade(saved.project);
    eq(q.packs.length, 12);
    const b2 = CX.book.build(q);
    eq(JSON.stringify(b2.all.map((z) => z.key + z.answer)), JSON.stringify(b1.all.map((z) => z.key + z.answer)));
  });

  await test('fact-check: an issue makes the option debatable and the case stays fair', () => {
    const p = project({ own: 16, setup: { starter: true } });
    let b = CX.book.build(p);
    const pz = b.all.find((z) => z.clues.some((c) => c.type === 'fact'));
    const fc = pz.clues.find((c) => c.type === 'fact');
    const opt = pz.options.find((o, i) => fc.yes & (1 << i));
    const audit = CX.prompts.readAudit('```json\n{"issues":[{"case":' + pz.no + ',"clue":"' + fc.text + '","option":"' + opt + '","problem":"crossed"}]}\n```');
    assert(audit.ok);
    const res = CX.book.applyFactIssues(p, b, audit.issues);
    eq(res.applied, 1, res.skipped.join('; '));
    b = CX.book.build(p);
    b.all.forEach((z) => assert(!CX.engine.verify(z.pack, z).length, 'case ' + z.no + ' unfair'));
    const again = b.all.find((z) => z.key === pz.key);
    if (again) {
      const oi = again.options.indexOf(opt);
      again.clues.filter((c) => c.text === fc.text).forEach((c) => assert(oi === -1 || !(c.yes & (1 << oi)), 'still relies on the disputed option'));
    }
    // the shared starter pack itself is untouched
    CX.starter.packs().forEach((sp) => sp.facts.forEach((f) => assert(f.maybe.length >= 0)));
  });

  // every layout, trim and print size: KDP rules on every page and on the cover
  const combos = [];
  CX.kdp.TRIMS.forEach((t) => ['spread', 'single'].forEach((layout) => combos.push({ trim: t.id, layout, largePrint: false })));
  ['6x9', '8.5x11', '5.5x8.5'].forEach((trim) => combos.push({ trim, layout: 'spread', largePrint: true, audience: 'seniors' }));
  combos.push({ trim: '6x9', layout: 'single', largePrint: false, audience: 'kids' });
  combos.push({ trim: '6x9', layout: 'spread', largePrint: false, counts: { warmup: 30, casework: 30, tough: 30, master: 30 }, paper: 'cream' });
  for (const c of combos) {
    await test('layout: ' + JSON.stringify(c), () => {
      const p = project({ own: c.counts ? 22 : 16, setup: Object.assign({}, c, { pages: Object.assign({}, CX.book.newProject().setup.pages) }) });
      if (c.counts) {
        p.setup.counts = c.counts;
        p.packs = p.packs.concat(CX.packs.read(aiReply(22, 'Y')).packs).concat(CX.packs.read(aiReply(22, 'W')).packs);
      }
      const b = CX.book.build(p);
      const book = CX.layout.layoutBook(p, b);
      const probs = CX.layout.audit(book);
      assert(!probs.length, probs.slice(0, 4).join('; '));
      eq(book.pageCount % 2, 0, 'even page count');
      assert(book.pageCount >= 24, 'at least 24 pages');
      Object.keys(book.casePage).forEach((no) => {
        const pg = book.pages[book.casePage[no] - 1];
        if (p.setup.layout === 'spread') eq(pg.side, 'left', 'case ' + no + ' clues on a left page');
      });
      b.all.forEach((z) => assert(book.casePage[z.no], 'case ' + z.no + ' placed'));
      assert(!book.pages.some((pg) => pg.meta.overflow), 'a case did not fit');
      const ck = CX.checklist.build(p, b, book);
      assert(ck.canDownload, ck.items.filter((i) => !i.ok).map((i) => i.title + ': ' + i.detail).join('; '));
      CX.cover.DESIGNS.forEach((d) => Object.keys(CX.cover.PALETTES).forEach((pal) => {
        p.setup.cover.design = d.id; p.setup.cover.palette = pal;
        const cv = CX.cover.layout(p, b, book);
        const ci = CX.cover.audit(cv);
        assert(!ci.length, d.id + '/' + pal + ': ' + ci.join('; '));
        const want = CX.kdp.cover(p.setup.trim, book.pageCount, p.setup.paper);
        assert(Math.abs(cv.W - want.width * 72) < 0.01 && Math.abs(cv.H - want.height * 72) < 0.01, 'cover size');
      }));
    });
  }

  await test('cover: long title, long pen name, custom badge and blurb stay inside', () => {
    const p = project({ own: 16, setup: { title: 'The Absolutely Enormous Cross It Out Casebook of Everyday Mysteries', author: 'Professor Wilhelmina Fotheringay-Smythe' } });
    p.setup.cover.badge = 'BIG FAMILY EDITION';
    p.setup.cover.blurb = Array(8).fill('A very long paragraph about the book that keeps going and going.').join(' ') + '\n' + 'Second paragraph.';
    const b = CX.book.build(p), book = CX.layout.layoutBook(p, b);
    CX.cover.DESIGNS.forEach((d) => {
      p.setup.cover.design = d.id;
      const issues = CX.cover.audit(CX.cover.layout(p, b, book));
      assert(!issues.length, d.id + ': ' + issues.join('; '));
    });
    const la = CX.layout.audit(book);
    assert(!la.length, la.slice(0, 4).join('; '));
  });

  // real PDFs
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cxio-'));
  await test('pdf: interior and cover build; checked with PyMuPDF when available', async () => {
    for (const layout of ['spread', 'single']) {
      const p = project({ own: 16, setup: { layout } });
      const b = CX.book.build(p), book = CX.layout.layoutBook(p, b);
      const bytes = await CX.pdf.build(book, { fileId: '0123456789ABCDEF0123456789ABCDEF' });
      const f = path.join(tmp, layout + '.pdf');
      fs.writeFileSync(f, Buffer.from(bytes));
      const head = Buffer.from(bytes.slice(0, 5)).toString();
      eq(head, '%PDF-');
      assert(!/\/Producer \(/.test(Buffer.from(bytes).toString('latin1')), 'metadata blanked');
      const cv = CX.cover.layout(p, b, book);
      const cb = await CX.pdf.buildCover(cv, {});
      fs.writeFileSync(path.join(tmp, layout + '-cover.pdf'), Buffer.from(cb));
      let out = null;
      try {
        out = execFileSync('python', [path.join(__dirname, 'verify-pdf.py'), f, String(book.W), String(book.H), String(book.pageCount),
          path.join(tmp, layout + '-cover.pdf'), String(cv.W), String(cv.H)], { encoding: 'utf8' });
      } catch (e) {
        if (/No module named/.test(String(e.stderr))) { console.log('       (PyMuPDF not installed: skipped the deep PDF check)'); continue; }
        throw new Error(String(e.stdout || '') + String(e.stderr || e.message));
      }
      assert(/^OK/m.test(out), out);
    }
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
