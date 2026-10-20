/* Lays out a book for every archive type and setting and audits it for KDP: node tests/books.js [quick] */
'use strict';
const assert = require('assert');
const load = require('./load.js');
const LK = load(['js/data/sample.js', 'js/core/cover.js']);
const quick = process.argv[2] === 'quick';
const clean = { outside: [], tiny: 0, thin: 0, pale: 0 };
let n = 0;
LK.types.all().forEach(function (t) {
  t.settings.forEach(function (s, si) {
    if (quick && si > 0) return;
    ['chapters', 'list'].forEach(function (mode, mi) {
      const p = LK.book.newProject(t.id);
      p.seed = 'book-' + t.id + '-' + s.id;
      p.setup.venue = s.id;
      p.setup.author = 'Jane Doe';
      p.setup.registerMode = mode;
      p.setup.trim = ['6x9', '8.5x11', '7x10'][(si + mi) % 3];
      p.setup.print = si % 2 ? 'large' : 'regular';
      LK.book.upgrade(p);
      const t0 = Date.now();
      const cs = LK.book.getCase(p);
      assert(cs.ok, t.id + ' case');
      const book = LK.layout.layoutBook(p, cs);
      const a = LK.layout.audit(book);
      assert.deepStrictEqual(a, clean, t.id + '/' + s.id + ' ' + p.setup.trim + ' ' + p.setup.print + ' audit ' + JSON.stringify(a));
      assert(!book.problems.some(x => x.level === 'error'), t.id + ' layout errors ' + JSON.stringify(book.problems));
      // every record printed exactly once, and the answer has an address
      const placed = book.recPos.filter(Boolean).length;
      assert.strictEqual(placed, cs.records.length, t.id + ' records placed');
      // the verdict opens only with the answer's key
      if (book.verdict) {
        assert.strictEqual(LK.extras.unlock(book.verdict, book.verdict.key), book.verdict.message);
        book.verdict.cipher.forEach(x => { if (x.pos) assert.notStrictEqual(x.c, x.plain); });
      }
      const cv = LK.cover.layout(p, cs, book);
      assert.deepStrictEqual(LK.cover.audit(cv), [], t.id + ' cover audit');
      n++;
      console.log(t.id.padEnd(9), s.id.padEnd(11), mode.padEnd(8), p.setup.trim.padEnd(6), p.setup.print.padEnd(7), String(cs.records.length).padStart(6), book.pageCount + ' pages', (Date.now() - t0) + 'ms',
        book.problems.map(x => x.text).join(' | '));
    });
  });
});
console.log(n + ' books laid out and audited');
