/*
 * firefox-check.js: the smoke test in Firefox (headless, WebDriver BiDi), from file://.
 *
 *   node tests/firefox-check.js [outDir] [firefoxPath]
 *
 * Checks: opens with a book in the preview and no errors; the default book generates in
 * Blob workers without freezing the page; the preview uses the embedded fonts; Download
 * PDF saves a file and shows the KDP values.
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'jigsaw-sudoku-firefox'));
const FIREFOX = [process.argv[3], 'C:/Program Files/Mozilla Firefox/firefox.exe', 'C:/Program Files (x86)/Mozilla Firefox/firefox.exe']
  .filter(Boolean).find(p => fs.existsSync(p));
const PORT = 9900 + Math.floor(Math.random() * 90);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!FIREFOX) throw new Error('Firefox not found. Pass its path as the 2nd argument.');
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-ff-'));
  fs.writeFileSync(path.join(profile, 'user.js'), [
    'user_pref("browser.download.folderList", 2);',
    'user_pref("browser.download.dir", ' + JSON.stringify(OUT) + ');',
    'user_pref("browser.download.useDownloadDir", true);',
    'user_pref("browser.download.always_ask_before_handling_new_types", false);',
    'user_pref("pdfjs.disabled", true);'
  ].join('\n'));
  const proc = spawn(FIREFOX, ['--headless', '--remote-debugging-port', String(PORT), '--profile', profile, '--no-remote',
    '--width=1440', '--height=900'], { stdio: 'ignore' });

  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) {
    await sleep(300);
    try {
      const sock = new WebSocket('ws://127.0.0.1:' + PORT + '/session');
      await new Promise((res, rej) => { sock.addEventListener('open', res); sock.addEventListener('error', rej); });
      ws = sock;
    } catch (e) { /* not up yet */ }
  }
  if (!ws) throw new Error('Could not connect to Firefox WebDriver BiDi');

  let id = 0;
  const pending = new Map(), problems = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'log.entryAdded' && (m.params.level === 'error' || m.params.level === 'warn' || m.params.type === 'javascript')) {
      problems.push(m.params.level + ': ' + m.params.text);
    }
  });
  const send = (method, params) => new Promise(resolve => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });

  await send('session.new', { capabilities: {} });
  await send('session.subscribe', { events: ['log.entryAdded'] });
  const tree = await send('browsingContext.getTree', {});
  const context = tree.result.contexts[0].context;
  const evaluate = async expr => {
    const r = await send('script.evaluate', { expression: 'JSON.stringify(' + expr + ')', target: { context }, awaitPromise: true });
    if (r.type === 'error' || r.result.type === 'exception') throw new Error('eval failed: ' + JSON.stringify(r).slice(0, 400));
    return JSON.parse(r.result.result.value);
  };
  const waitFor = async (expr, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await evaluate(expr)) return Date.now() - t0; await sleep(150); }
    throw new Error('timeout: ' + expr);
  };
  const results = [];
  const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' - ' + detail : '')); };

  const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
  await send('browsingContext.navigate', { context, url, wait: 'complete' });
  await waitFor('!!(window.KS && KS.App && KS.App.state.book)', 20000);
  await evaluate(`(function () {
    window.__maxGap = 0; var last = performance.now();
    (function frame(t) { window.__maxGap = Math.max(window.__maxGap, t - last); last = t; if (!window.__stop) requestAnimationFrame(frame); })(last);
    return true; })()`);
  check('Firefox: opens with the create-puzzles placeholder', await evaluate('!document.getElementById("preview-empty").hidden && !document.querySelector(".page")'));
  await evaluate('(document.getElementById("create-puzzles").click(), true)');
  await sleep(800);
  check('Firefox: Create puzzles shows the book in the preview', await evaluate('document.querySelectorAll(".page svg").length > 0'));
  check('Firefox: no errors on load', problems.length === 0, problems.join(' | '));
  check('Firefox: generation runs in Blob workers', await evaluate('KS.App.generator.useWorkers && KS.App.generator.workers.length > 0'));

  const ms = await waitFor('KS.App.state.gen.ready === 200 && /Ready for KDP/.test(document.getElementById("status-text").textContent)', 180000);
  const gen = await evaluate('({ gap: Math.round(window.__maxGap), font: document.fonts.check("700 12px \\"KS Sans\\"") && document.fonts.check("400 12px \\"KS Serif\\""), texts: document.querySelectorAll(".page svg text").length })');
  await evaluate('(window.__stop = true)');
  check('Firefox: default book ready', true, (ms / 1000).toFixed(1) + ' s');
  check('Firefox: page stays responsive (longest frame gap < 250 ms)', gen.gap < 250, gen.gap + ' ms');
  check('Firefox: preview uses the embedded fonts', gen.font && gen.texts > 20, gen.texts + ' text nodes');

  const shot = await send('browsingContext.captureScreenshot', { context });
  if (shot.result) fs.writeFileSync(path.join(OUT, 'firefox-ready.png'), Buffer.from(shot.result.data, 'base64'));

  const before = new Set(fs.readdirSync(OUT));
  await evaluate('(document.getElementById("download").click(), true)');
  const t0 = Date.now();
  let pdf = null;
  while (Date.now() - t0 < 120000 && !pdf) {
    await sleep(400);
    pdf = fs.readdirSync(OUT).find(f => f.endsWith('.pdf') && !before.has(f));
  }
  if (pdf) await sleep(1000); // let Firefox finish writing
  check('Firefox: Download PDF saves a file', !!pdf, pdf || 'none');
  check('Firefox: "What to enter on KDP" is shown', await evaluate('document.getElementById("kdp-dialog").open'));
  check('Firefox: nothing written to browser storage', await evaluate('localStorage.length + sessionStorage.length === 0'));
  check('Firefox: no errors during the run', problems.length === 0, problems.join(' | '));

  try { await send('session.end', {}); } catch (e) { /* ignore */ }
  ws.close();
  proc.kill();
  const failed = results.filter(r => !r).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed. Output: ' + OUT);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
