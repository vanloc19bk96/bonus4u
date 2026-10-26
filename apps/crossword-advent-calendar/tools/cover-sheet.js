/*
 * node tools/cover-sheet.js [out.html] [trim]
 * Writes one HTML page with the front of every cover template, for a quick look in a browser.
 * TITLE, DAYS (12, 24 or 25), BONUS=1, PRINT (regular, large, xl), COLS and GUIDES=1 change the book.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const env = require('../tests/node-env.js');
const S = require('../tests/sample-replies.js');
const CX = env.loadAll();

const out = process.argv[2] || path.join(__dirname, 'cover-sheet.html');
const p = CX.plan.newProject();
p.seed = 'cover-sheet';
p.book.author = 'Snowy Lane Press';
if (process.argv[3]) p.book.trim = process.argv[3];
if (process.env.TITLE) p.book.title = process.env.TITLE;
if (process.env.DAYS) p.plan.days = +process.env.DAYS;
if (process.env.BONUS) p.plan.bonus = true;
if (process.env.PRINT) p.book.print = process.env.PRINT;
CX.prompts.list(p).forEach((pr) => {
  if (pr.kind === 'days') CX.content.addReply(p, CX.reader.readDays(S.fakeReply(pr.days.map((d) => CX.prompts.label(d)), CX.plan.grid(p.plan.size).ask, pr.no)), pr.days);
});
CX.content.addExtras(p, CX.reader.readExtras(S.EXTRAS));
const pages = CX.layout.layoutBook(p, {}).pages.length;
const fonts = Object.keys(CX.metrics.FONT_INFO).map((k) => '@font-face{font-family:' + CX.metrics.FONT_INFO[k].css + ';src:url(data:font/ttf;base64,' + global.CX_FONT_DATA[k].data + ')}').join('');
const cells = CX.cover.DESIGNS.map((d, i) => {
  p.cover.design = d.id; p.cover.palette = '';
  const cv = CX.cover.build(p, pages), g = cv.guides;
  return '<figure><div>' + CX.svg.renderCover(cv, { crop: { x: g.spineX1, y: 0, w: cv.W - g.spineX1, h: cv.H }, guides: process.env.GUIDES }) + '</div><figcaption>' + (i + 1) + '. ' + d.label + '</figcaption></figure>';
});
fs.writeFileSync(out, '<!doctype html><meta charset="utf-8"><style>' + fonts + 'body{margin:0;background:#ccc;font:12px sans-serif}main{display:grid;grid-template-columns:repeat(' + (process.env.COLS || 6) + ',1fr);gap:6px;padding:6px}figure{margin:0}svg{width:100%;height:auto;display:block;background:#fff}.cover-svg{font-kerning:none}figcaption{padding:2px}</style><main>' + cells.join('') + '</main>');
console.log('wrote ' + out + ' (' + cells.length + ' templates, ' + pages + ' pages)');
