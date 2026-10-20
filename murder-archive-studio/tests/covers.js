/*
 * Every cover design, for every book type, at the small, middle and large trim sizes:
 * lays out without errors, keeps all words inside KDP's safe area, clear of the barcode box,
 * at 7 pt or more, and draws only colors the PDF can take.
 *   node tests/covers.js [designId]
 */
'use strict';
const assert = require('assert');
const load = require('./load.js');
const LK = load(['js/data/sample.js', 'js/data/sample-manifest.js', 'js/core/cover.js', 'js/core/cover-art.js', 'js/core/cover-designs.js']);

const only = process.argv[2];
const D = LK.coverDesigns;
assert.strictEqual(D.list.length, 50, 'there are 50 designs');
assert.strictEqual(new Set(D.ids).size, 50, 'design ids are unique');
D.list.forEach(d => {
  assert.ok(d.layout === 'register' || D.fronts[d.layout], d.id + ': unknown layout ' + d.layout);
  assert.ok(D.groups.some(g => g.id === d.group), d.id + ': unknown group');
  ['frame', 'panel', 'ink', 'accent', 'mark', 'onFrame', 'head', 'headInk', 'band'].forEach(k => assert.ok(/^#[0-9A-F]{6}$/i.test(d.pal[k]), d.id + ': pal.' + k));
});

const types = ['lottery', 'manifest', 'hotel', 'staff', 'guestlist', 'calls', 'coords', 'visitors'];
const trims = ['5x8', '6x9', '8.5x11'];
const titles = ['The Killer Is Still On Board', 'Murder at the Grand Hotel: The Night Nobody Checked Out', 'Caller Unknown'];
const cache = {};
function base(type, trim, ti) {
  const key = type + trim + ti;
  if (!cache[key]) {
    const p = LK.book.newProject(type);
    p.seed = 'covers-' + type;
    p.setup.trim = trim;
    p.setup.author = ti === 1 ? 'Josephine Ashworth-Blackwood' : 'Ada Nightingale';
    p.setup.title = titles[ti];
    LK.book.upgrade(p);
    const cs = LK.book.getCase(p);
    cache[key] = { p, cs, book: LK.layout.layoutBook(p, cs) };
  }
  return cache[key];
}
let n = 0;
D.list.filter(d => !only || d.id === only).forEach(d => {
  types.forEach((type, ti) => trims.forEach((trim, ri) => {
    const b = base(type, trim, (ti + ri) % 3);
    const p = JSON.parse(JSON.stringify(b.p));
    p.setup.cover.style = d.id;
    LK.book.upgrade(p);
    assert.strictEqual(p.setup.cover.style, d.id, d.id + ' survives the project upgrade');
    const cv = LK.cover.layout(p, b.cs, b.book);
    assert.strictEqual(cv.template, d.id);
    const issues = LK.cover.audit(cv);
    assert.deepStrictEqual(issues, [], d.id + ' ' + type + ' ' + trim + ': ' + issues.join('; '));
    cv.items.forEach(it => {
      ['x', 'y', 'w', 'h', 'cx', 'cy', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'size'].forEach(k => {
        if (k in it) assert.ok(Number.isFinite(it[k]), d.id + ' ' + type + ': bad ' + k + ' on ' + JSON.stringify(it).slice(0, 120));
      });
      if (it.pts) assert.ok(it.pts.length >= 4 && it.pts.every(Number.isFinite), d.id + ': bad poly');
      ['color', 'stroke'].forEach(k => { if (it[k] && typeof it[k] === 'string') assert.ok(/^#[0-9A-F]{6}$/i.test(it[k]), d.id + ': color ' + it[k]); });
    });
    n++;
  }));
});
console.log(n + ' covers laid out and audited');
