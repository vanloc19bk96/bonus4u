/*
 * firefox-check.js: the same smoke test in Firefox (headless, WebDriver BiDi), from file://.
 *
 *   node tests/firefox-check.js [outDir] [firefoxPath]
 *
 * Checks: loads with no errors, generation runs in Blob workers without freezing the page,
 * preview renders with the embedded font, Download PDF saves a file.
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'samurai-sudoku-firefox'));
const FIREFOX = [process.argv[3], 'C:/Program Files/Mozilla Firefox/firefox.exe', 'C:/Program Files (x86)/Mozilla Firefox/firefox.exe']
  .filter(Boolean).find(p => fs.existsSync(p));
const PORT = 9900 + Math.floor(Math.random() * 90);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!FIREFOX) throw new Error('Firefox not found. Pass its path as the 2nd argument.');
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ssp-ff-'));
  fs.writeFileSync(path.join(profile, 'user.js'), [
    'user_pref("browser.download.folderList", 2);',
    'user_pref("browser.download.dir", ' + JSON.stringify(OUT) + ');',
    'user_pref("browser.download.useDownloadDir", true);',
    'user_pref("browser.download.always_ask_before_handling_new_types", false);',
    'user_pref("pdfjs.disabled", true);'
  ].join('\n'));
  const proc = spawn(FIREFOX, ['--headless', '--remote-debugging-port', String(PORT), '--profile', profile, '--no-remote', '--width=1440', '--height=960'], { stdio: 'ignore' });

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
    if (m.method === 'log.entryAdded' && (m.params.level === 'error' || m.params.type === 'javascript')) problems.push(m.params.text);
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
  await waitFor('!!(window.SS && SS.App)', 15000);
  check('Firefox: app loads from file:// with no errors', problems.length === 0, problems.join(' | '));

  await evaluate(`(function () {
    var c = document.getElementById('count'); c.value = '100'; c.dispatchEvent(new Event('input', { bubbles: true }));
    var d = document.getElementById('difficulty'); d.value = 'medium'; d.dispatchEvent(new Event('change', { bubbles: true }));
    window.__maxGap = 0; var last = performance.now();
    (function frame(t) { window.__maxGap = Math.max(window.__maxGap, t - last); last = t; if (!window.__stop) requestAnimationFrame(frame); })(last);
    document.getElementById('generate').click(); return true;
  })()`);
  const ms = await waitFor('!!SS.App.state.puzzles && !SS.App.state.busy', 180000);
  const gen = await evaluate('({ n: SS.App.state.puzzles.length, mode: SS.App.generationMode, gap: Math.round(window.__maxGap), fontOk: document.fonts.check("700 12px SSAtkinson"), sheets: document.querySelectorAll("#pages .sheet svg text").length })');
  await evaluate('(window.__stop = true)');
  check('Firefox: 100 Medium puzzles generated in Blob workers', gen.n === 100 && /^workers/.test(gen.mode), ms + ' ms, ' + gen.mode);
  check('Firefox: UI never froze (longest frame gap < 250 ms)', gen.gap < 250, gen.gap + ' ms');
  check('Firefox: preview rendered with the embedded font', gen.fontOk && gen.sheets > 50, gen.sheets + ' text nodes');

  const shot = await send('browsingContext.captureScreenshot', { context });
  if (shot.result) fs.writeFileSync(path.join(OUT, 'firefox-generated.png'), Buffer.from(shot.result.data, 'base64'));

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
  check('Firefox: no errors during the run', problems.length === 0, problems.join(' | '));

  try { await send('session.end', {}); } catch (e) { /* ignore */ }
  ws.close();
  proc.kill();
  const failed = results.filter(r => !r).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed. Output: ' + OUT);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
