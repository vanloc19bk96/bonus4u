/*
 * Builds interior and cover PDFs for inspection.
 *   node tests/make-pdf.js outDir sample <lottery|manifest> [style] [trim]
 *   node tests/make-pdf.js outDir type <typeId> [setting] [count] [trim]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const load = require('./load.js');
const LK = load(['js/data/sample.js', 'js/data/sample-manifest.js', 'js/core/cover.js', 'js/core/cover-art.js', 'js/core/cover-designs.js', 'js/render/pdf.js']);
globalThis.jspdf = require(path.resolve(__dirname, '../js/vendor/jspdf.umd.min.js'));
const [out, mode, id, a, b, c] = process.argv.slice(2);
let p;
if (mode === 'sample') {
  p = LK.book.sampleProject(id);
  if (a) p.setup.cover.style = a;
  if (b) p.setup.trim = b;
} else {
  p = LK.book.newProject(id);
  p.seed = 'pdf-' + id;
  const t = LK.types.get(id);
  if (a) p.setup.venue = a;
  p.setup.count = +(b || t.defaultCount);
  if (c) p.setup.trim = c;
  p.setup.author = 'Jane Doe';
  LK.book.upgrade(p);
}
const cs = LK.book.getCase(p);
const book = LK.layout.layoutBook(p, cs);
const cv = LK.cover.layout(p, cs, book);
const meta = { title: LK.book.title(p) || 'Test', author: p.setup.author, createdAt: p.createdAt, fileId: LK.util.hashHex(p.seed) + LK.util.hashHex('x' + p.seed) };
const name = (mode === 'sample' ? 'sample-' : '') + id;
Promise.all([LK.pdf.build(book, meta), LK.pdf.buildCover(cv, meta)]).then(([x, y]) => {
  fs.writeFileSync(path.join(out, name + '-interior.pdf'), Buffer.from(x));
  fs.writeFileSync(path.join(out, name + '-cover.pdf'), Buffer.from(y));
  console.log(name, 'interior pages', book.pageCount, 'cover', (cv.W / 72).toFixed(3), 'x', (cv.H / 72).toFixed(3), 'in');
  console.log(book.sections.map(s => s.title + ' ' + s.page).join(' | '));
});
