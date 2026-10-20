/*
 * browser-check.js: end-to-end check in a real browser (Edge or Chrome, headless), loading
 * index.html straight from file:// the way a user double-clicks it.
 *
 *   node tests/browser-check.js [outDir] [browserPath]
 *
 * Covers: no console errors or network requests; nothing written to browser storage; the
 * default book generates in Blob workers without freezing the page; Download is one click
 * and shows the KDP values; layout changes do not regenerate; unavailable options and
 * page-count problems are explained; puzzle settings wait for Create puzzles; Cancel and
 * Resume; 1024 px layout.
 * Screenshots and the downloaded PDFs go to outDir.
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'killer-sudoku-check'));
const BROWSER = [
  process.argv[3],
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
].filter(Boolean).find(p => fs.existsSync(p));
const PORT = 9400 + Math.floor(Math.random() * 500);
const sleep = ms => new Promise(r => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  if (!BROWSER) throw new Error('No Edge/Chrome found. Pass the browser path as the 2nd argument.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-profile-'));
  const proc = spawn(BROWSER, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--window-size=1440,900', 'about:blank'
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) {
    await sleep(200);
    try { targets = await getJSON('http://127.0.0.1:' + PORT + '/json/list'); } catch (e) { /* not up yet */ }
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  let msgId = 0;
  const pending = new Map();
  const problems = [];
  const requests = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      problems.push('console.' + m.params.type + ': ' + m.params.args.map(a => a.value || a.description).join(' '));
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('log: ' + m.params.entry.text);
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  });
  const send = (method, params = {}) => new Promise(resolve => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 500));
    return r.result.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
  };
  const waitFor = async (expr, timeoutMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await evaluate(expr)) return Date.now() - t0;
      await sleep(100);
    }
    throw new Error('timeout waiting for ' + expr);
  };
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok });
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' - ' + detail : ''));
  };
  const statusText = () => evaluate('document.getElementById("status-text").textContent');
  const setField = (id, value, ev) => evaluate(`(function () {
    var el = document.getElementById('${id}'); el.focus(); el.value = '${value}';
    el.dispatchEvent(new Event('${ev || 'input'}', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true })); el.blur(); return true; })()`);
  const newPdfs = (before) => fs.readdirSync(OUT).filter(f => f.endsWith('.pdf') && !before.has(f));

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT, eventsEnabled: true });
  const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
  await send('Page.navigate', { url });
  await waitFor('document.readyState === "complete" && !!(window.KS && KS.App && KS.App.state.book)', 20000);
  await sleep(300);
  const opening = await evaluate(`({ placeholder: !document.getElementById('preview-empty').hidden, pages: document.querySelectorAll('.page').length,
    create: !document.getElementById('create-puzzles').disabled, dl: document.getElementById('download').disabled, total: KS.App.state.gen.total })`);
  await shot('00-empty.png');
  check('opens with a placeholder and no puzzles until Create puzzles', opening.placeholder && opening.pages === 0 && opening.create && opening.dl && opening.total === 0, JSON.stringify(opening));
  check('status asks to create puzzles', /Create puzzles/.test(await statusText()), await statusText());

  // Difficulty mix: shown for mixed difficulties, editable, applies only when it adds up to 100.
  const mixState = () => evaluate(`({ shown: !document.getElementById('mix').hidden,
    pct: ['easy', 'medium', 'hard'].map(function (l) { return document.getElementById('f-mix-' + l).value; }).join('/'),
    msg: document.getElementById('m-mix').textContent, diff: document.getElementById('f-difficulty').value,
    create: !document.getElementById('create-puzzles').disabled, subtitle: document.getElementById('f-subtitle').value })`);
  let mx = await mixState();
  check('Easy to Hard shows its mix', mx.shown && mx.pct === '34/33/33' && mx.msg === '68 Easy · 66 Medium · 66 Hard puzzles', JSON.stringify(mx));
  await setField('f-mix-easy', '50');
  mx = await mixState();
  check('a mix that does not add up to 100 shows an error and blocks Create', /add up to 116%/.test(mx.msg) && !mx.create && mx.diff === 'easy-hard', JSON.stringify(mx));
  await setField('f-mix-medium', '20');
  await setField('f-mix-hard', '30');
  mx = await mixState();
  check('a valid mix becomes a custom mix', mx.diff === 'mix' && mx.pct === '50/20/30' && mx.msg === '100 Easy · 40 Medium · 60 Hard puzzles' && mx.create &&
    /Easy to Hard/.test(mx.subtitle), JSON.stringify(mx));
  await shot('00b-mix.png');
  await setField('f-difficulty', 'hard', 'change');
  check('a single level hides the mix', !(await mixState()).shown);
  await setField('f-difficulty', 'easy-hard', 'change');

  // Frame-gap probe: the longest time between two animation frames while generating.
  await evaluate(`(function () {
    window.__maxGap = 0; var last = performance.now();
    (function frame(t) { window.__maxGap = Math.max(window.__maxGap, t - last); last = t; if (!window.__stop) requestAnimationFrame(frame); })(last);
    return true; })()`);
  await evaluate('document.getElementById("create-puzzles").click(); true');
  await sleep(600);
  await shot('01-opening.png');
  check('Create puzzles shows the book in the preview', await evaluate('document.querySelectorAll(".page svg").length > 0'));
  check('status shows puzzle creation progress', /^Creating puzzles \d+ \/ 200$/.test(await statusText()), await statusText());
  check('generation runs in Blob workers', await evaluate('KS.App.generator.useWorkers && KS.App.generator.workers.length > 0'),
    await evaluate('KS.App.generator.workers.length') + ' workers');

  const genMs = await waitFor('KS.App.state.gen.ready === 200 && /Ready for KDP/.test(document.getElementById("status-text").textContent)', 120000);
  const maxGap = await evaluate('Math.round(window.__maxGap)');
  await evaluate('window.__stop = true; true');
  check('default book (200 puzzles) ready in under 60 s', genMs < 60000, (genMs / 1000).toFixed(1) + ' s');
  check('page stays responsive while generating (longest frame gap < 250 ms)', maxGap < 250, maxGap + ' ms');
  check('status says pages and Ready for KDP', /^\d+ pages · Ready for KDP$/.test(await statusText()), await statusText());
  check('Download enabled when ready', await evaluate('!document.getElementById("download").disabled'));
  await shot('02-ready.png');

  // Checks panel.
  await evaluate('document.getElementById("status-toggle").click(); true');
  await sleep(150);
  const checks = await evaluate('Array.from(document.querySelectorAll("#checks-list li")).map(function (li) { return li.className + " " + li.querySelector("b").textContent; })');
  check('checks panel lists the KDP checks, none failing', checks.length >= 10 && !checks.some(c => /s-fail|s-pending/.test(c)), checks.length + ' checks');
  await shot('03-checks.png');
  await evaluate('document.getElementById("status-toggle").click(); true');

  // One click to download, then the KDP values.
  let before = new Set(fs.readdirSync(OUT));
  const tDl = Date.now();
  await evaluate('document.getElementById("download").click(); true');
  await waitFor('document.getElementById("kdp-dialog").open', 60000);
  let files = [];
  while (Date.now() - tDl < 30000 && !(files = newPdfs(before)).length) await sleep(200);
  const dialogText = await evaluate('document.getElementById("kdp-values").textContent');
  check('Download PDF is one click and saves the file', files.length === 1 && /^killer-sudoku-interior-8\.5x11-\d+p\.pdf$/.test(files[0]), files.join(', ') + ' in ' + (Date.now() - tDl) + ' ms');
  check('"What to enter on KDP" shows size, bleed, interior and page count', /8\.5 x 11 in/.test(dialogText) && /No bleed/.test(dialogText) && /Black & white/.test(dialogText), dialogText);
  await shot('04-kdp-dialog.png');
  await evaluate('document.querySelector("#kdp-dialog button").click(); true');

  // Layout change: no regeneration, preview updates.
  const keyBefore = await evaluate('KS.App.state.gen.puzzles[0].key');
  await setField('f-trim', '6x9', 'change');
  await sleep(300);
  const after = await evaluate('({ key: KS.App.state.gen.puzzles[0].key, ready: KS.App.state.gen.ready, w: KS.App.state.book.trim.w, running: KS.App.state.gen.running })');
  check('book size change re-lays out without regenerating', after.key === keyBefore && after.ready === 200 && after.w === 6 && !after.running);
  const pp4 = await evaluate('document.querySelector("#perpage [data-n=\'4\']").getAttribute("aria-disabled")');
  check('4 per page is unavailable at 6 x 9 in', pp4 === 'true');
  await evaluate('document.querySelector("#perpage [data-n=\'4\']").click(); true');
  await sleep(100);
  check('unavailable option explains why', /too small to write in/.test(await evaluate('document.getElementById("m-perpage").textContent')));
  await evaluate('document.getElementById("show-margins").click(); true');
  await sleep(400);
  await shot('05-6x9-margins.png');
  check('margin overlay is drawn', await evaluate('document.querySelectorAll(".guide-live").length > 0'));
  await evaluate('document.getElementById("show-margins").click(); true');

  // Download at 6 x 9.
  await waitFor('/Ready for KDP/.test(document.getElementById("status-text").textContent)', 30000);
  before = new Set(fs.readdirSync(OUT));
  await evaluate('document.getElementById("download").click(); true');
  await waitFor('document.getElementById("kdp-dialog").open', 60000);
  await sleep(500);
  files = newPdfs(before);
  check('Download at 6 x 9 in', files.length === 1 && /6x9/.test(files[0]), files.join(', '));
  await evaluate('document.querySelector("#kdp-dialog button").click(); true');
  await setField('f-trim', '8.5x11', 'change');

  // Puzzle settings wait for Create puzzles; layout settings still apply at once.
  check('Create puzzles is disabled while the puzzles match the settings', await evaluate('document.getElementById("create-puzzles").disabled'));
  await setField('f-count', '10');
  await evaluate('document.querySelector("#perpage [data-n=\'4\']").click(); true');
  await sleep(300);
  const waiting = await evaluate(`({ status: document.getElementById('status-text').textContent, action: document.getElementById('status-action').textContent,
    create: !document.getElementById('create-puzzles').disabled, total: KS.App.state.gen.total, running: KS.App.state.gen.running,
    pages: KS.App.state.book.pageCount, note: document.getElementById('m-count').textContent, dl: document.getElementById('download').disabled })`);
  check('changing the count does not regenerate until Create puzzles', waiting.total === 200 && !waiting.running && waiting.create && waiting.dl &&
    /Click Create puzzles/.test(waiting.status), JSON.stringify(waiting));
  check('layout changes still apply at once while puzzles wait', waiting.pages < 120, waiting.pages + ' pages with 4 per page');
  check('page-count advice shows next to the count before creating', /^Add at least \d+ more puzzles? to reach 24 pages\.$/.test(waiting.note), waiting.note);
  await shot('06a-pending.png');
  await evaluate('document.getElementById("create-puzzles").click(); true');
  await sleep(300);
  const few = await statusText();
  check('below 24 pages: says how many puzzles to add', /^Add at least \d+ more puzzles? to reach 24 pages\.$/.test(few), few);
  check('Download disabled below 24 pages', await evaluate('document.getElementById("download").disabled'));
  await shot('06-too-few.png');

  // Invalid input is not applied.
  await evaluate(`(function () { var el = document.getElementById('f-count'); el.focus(); el.value = '5000';
    el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(100);
  check('out-of-range count shows an error next to the field', /from 10 to 1000/.test(await evaluate('document.getElementById("m-count").textContent')) &&
    await evaluate('KS.App.state.settings.count === 10'));
  await evaluate('document.getElementById("f-count").blur(); true');

  // Cancel and Resume on a 1000-puzzle book.
  await setField('f-count', '1000');
  await evaluate('document.querySelector("#perpage [data-n=\'2\']").click(); true');
  await evaluate('document.getElementById("create-puzzles").click(); true');
  await waitFor('/Creating puzzles [1-9]\\d* \\/ 1000/.test(document.getElementById("status-text").textContent)', 60000);
  await shot('07-generating-1000.png');
  const typed = await evaluate(`(function () { var el = document.getElementById('f-author'); el.focus(); el.value = 'Test Author';
    el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); return KS.App.state.settings.author; })()`);
  check('form stays usable while generating 1000 puzzles', typed === 'Test Author');
  const tCancel = Date.now();
  await evaluate('document.getElementById("status-action").click(); true');
  await waitFor('!KS.App.state.gen.running', 2000);
  const readyAtCancel = await evaluate('KS.App.state.gen.ready');
  await sleep(1500);
  const readyLater = await evaluate('KS.App.state.gen.ready');
  check('Cancel stops promptly', readyLater === readyAtCancel, (Date.now() - tCancel) + ' ms, stopped at ' + readyAtCancel);
  const stopped = await statusText();
  check('stopped status offers Resume', /stopped at \d+ of 1000/.test(stopped) && await evaluate('document.getElementById("status-action").textContent === "Resume"'), stopped);
  await evaluate('document.getElementById("status-action").click(); true');
  await waitFor('KS.App.state.gen.ready > ' + readyAtCancel, 30000);
  check('Resume continues generating', true);
  await evaluate('KS.App.state && document.getElementById("status-action").click(); true');

  // 1024 px wide window.
  await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 700, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  const narrow = await evaluate(`(function () {
    var d = document.documentElement, b = document.getElementById('download').getBoundingClientRect(),
      c = document.getElementById('create-puzzles').getBoundingClientRect();
    return { scrollW: d.scrollWidth, clientW: d.clientWidth, btnBottom: Math.max(b.bottom, c.bottom), h: window.innerHeight, btnRight: Math.max(b.right, c.right) };
  })()`);
  check('1024 px: no horizontal scrollbar, Download and Create puzzles visible', narrow.scrollW <= narrow.clientW && narrow.btnBottom <= narrow.h && narrow.btnRight <= 1024, JSON.stringify(narrow));
  await shot('08-1024.png');

  const storage = await evaluate('localStorage.length + sessionStorage.length');
  check('nothing written to browser storage', storage === 0, String(storage));
  const external = requests.filter(u => !/^(file|blob|data):/.test(u));
  check('no network requests', external.length === 0, external.slice(0, 3).join(', '));
  check('no console errors during the run', problems.length === 0, problems.join(' | '));

  ws.close();
  proc.kill();
  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed. Output: ' + OUT);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
