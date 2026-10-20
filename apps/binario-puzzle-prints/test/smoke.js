/* Loads index.html in jsdom exactly as a browser would (scripts run in order),
   then drives the real UI: change fields, click Generate, click Download. */
const path = require('path');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const errors = [];

const vc = new VirtualConsole();
// jsPDF feature-detects a 2D canvas context when it loads. jsdom has no canvas
// implementation, so it throws there; every real browser has one. That single
// message is an environment limitation, not an app defect.
const JSDOM_ONLY = /HTMLCanvasElement's getContext/;
vc.on('jsdomError', e => {
  const msg = e.stack || e.message;
  if (!JSDOM_ONLY.test(msg)) errors.push('jsdomError: ' + msg);
  else console.log('  · (ignored, jsdom-only) jsPDF canvas feature detection');
});
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
vc.on('warn', (...a) => errors.push('console.warn: ' + a.join(' ')));

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

JSDOM.fromFile(path.join(ROOT, 'index.html'), {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html'
}).then(async dom => {
  const { window } = dom;
  const doc = window.document;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  await wait(1200);   // let the classic scripts finish loading

  function fail(m) { errors.push(m); }
  function ok(m) { console.log('  ✓ ' + m); }

  // --- globals ---------------------------------------------------------
  for (const g of ['jspdf', 'NOTO_SANS_BASE64', 'BinarioCore', 'KdpLayout', 'PdfExport', 'Preview', 'App']) {
    if (!window[g]) fail('global missing: ' + g);
  }
  if (!errors.length) ok('all seven globals loaded from plain <script src> tags');

  // --- initial render --------------------------------------------------
  const summary = doc.getElementById('summary').textContent;
  if (!summary.includes('pages')) fail('summary line not rendered: ' + summary);
  else ok('summary line rendered: ' + summary);

  const trimOpts = doc.getElementById('f-trim').options.length;
  if (trimOpts !== 16) fail('trim dropdown has ' + trimOpts + ' options');
  else ok('trim dropdown populated with 16 sizes, default ' + doc.getElementById('f-trim').value);

  const svg0 = doc.getElementById('preview-box').innerHTML;
  if (!svg0.includes('<svg') || !svg0.includes('<circle')) fail('preview did not render before Generate');
  else ok('preview renders before Generate (placeholder puzzles)');

  if (!doc.getElementById('btn-download').disabled) fail('Download should start disabled');
  else ok('Download starts disabled');

  // --- the MIN_CELL block ---------------------------------------------
  setValue(doc.getElementById('f-trim'), '6x9');
  doc.querySelector('input[name=perpage][value="4"]').checked = true;
  doc.querySelector('input[name=perpage][value="4"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(400);
  const problems = doc.getElementById('problems').textContent;
  if (!problems.includes('too small to print')) fail('6×9 + 4/page did not show the cell-too-small block');
  else ok('6×9 + 4 per page shows the MIN_CELL block and keeps Download disabled');
  if (!doc.getElementById('btn-download').disabled) fail('Download enabled despite a blocking error');

  // --- back to a valid, small book, then generate ----------------------
  setValue(doc.getElementById('f-trim'), '8.5x11');
  doc.querySelector('input[name=perpage][value="2"]').checked = true;
  doc.querySelector('input[name=perpage][value="4"]').checked = false;
  doc.querySelector('input[name=perpage][value="2"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  setValue(doc.getElementById('f-count'), '10');
  setValue(doc.getElementById('f-size'), '8');
  setValue(doc.getElementById('f-diff'), 'mixed');
  await wait(400);

  doc.getElementById('btn-generate').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  for (let i = 0; i < 100 && doc.getElementById('btn-download').disabled; i++) await wait(100);
  if (doc.getElementById('btn-download').disabled) fail('Generate never enabled Download: ' + doc.getElementById('gen-note').textContent);
  else ok('Generate ran with progress and enabled both downloads: ' + doc.getElementById('gen-note').textContent.slice(0, 70) + '…');

  const svg1 = doc.getElementById('preview-box').innerHTML;
  if (svg1 === svg0) fail('preview did not switch to the real puzzles');
  else ok('preview switched to the generated puzzles');

  // --- preview tabs ----------------------------------------------------
  for (const kind of ['solutions', 'howto', 'title', 'puzzles']) {
    doc.querySelector('.tab[data-kind="' + kind + '"]').dispatchEvent(new window.Event('click', { bubbles: true }));
    await wait(60);
    const s = doc.getElementById('preview-box').innerHTML;
    if (!s.includes('<svg')) fail('preview tab ' + kind + ' rendered nothing');
  }
  ok('all four preview tabs render');

  // --- downloads: intercept the save so nothing hits the disk ----------
  let saved = [];
  const realSave = window.PdfExport.save, realSample = window.PdfExport.saveSample;
  const jsPDF = window.jspdf.jsPDF;
  const realSaveMethod = jsPDF.API.save;
  jsPDF.API.save = function (name) { saved.push({ name: name, pages: this.internal.getNumberOfPages() }); return this; };

  doc.getElementById('btn-download').dispatchEvent(new window.Event('click', { bubbles: true }));
  await wait(1500);
  doc.getElementById('btn-sample').dispatchEvent(new window.Event('click', { bubbles: true }));
  await wait(1500);

  if (saved.length !== 2) fail('expected 2 saved PDFs, got ' + saved.length + ' — note: ' + doc.getElementById('gen-note').textContent);
  else {
    ok('Download PDF produced ' + saved[0].name + ' (' + saved[0].pages + ' pages)');
    ok('Sample PDF produced ' + saved[1].name + ' (' + saved[1].pages + ' pages)');
    if (saved[1].pages !== 4) fail('sample should be 4 pages, got ' + saved[1].pages);
  }

  // --- changing settings invalidates the puzzles -----------------------
  setValue(doc.getElementById('f-size'), '10');
  await wait(400);
  if (!doc.getElementById('btn-download').disabled) fail('changing grid size left Download enabled');
  else ok('changing the grid size invalidates the puzzles and disables Download');

  function setValue(el, v) {
    el.value = v;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  }

  console.log('');
  if (errors.length) {
    console.log('FAILED (' + errors.length + '):');
    for (const e of errors) console.log('  ✗ ' + e);
    process.exit(1);
  }
  console.log('Smoke test passed with zero console errors.');
  process.exit(0);
}).catch(e => { console.error('FATAL', e); process.exit(1); });
