/*
 * browser-check.js: end-to-end check in a real browser (Edge or Chrome, headless) loading
 * index.html straight from file://, with no special flags, the way a user double-clicks it.
 *
 *   node tests/browser-check.js [outDir] [browserPath]
 *
 * Checks: no console errors; generation runs in Blob workers without freezing the page
 * (measures the longest main-thread stall while 100 Medium puzzles generate); progress and
 * Cancel work; preview renders; Download produces a PDF. Screenshots + PDF go to outDir.
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'samurai-sudoku-check'));
const CANDIDATES = [
  process.argv[3],
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
].filter(Boolean);
const BROWSER = CANDIDATES.find(p => fs.existsSync(p));
const PORT = 9333 + Math.floor(Math.random() * 500);

fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ssp-profile-'));
  const proc = spawn(BROWSER, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--window-size=1440,960', 'about:blank'
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(200);
    try { targets = await getJSON('http://127.0.0.1:' + PORT + '/json/list'); } catch (e) { /* not up yet */ }
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  let msgId = 0;
  const pending = new Map();
  const problems = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      problems.push('console.' + m.params.type + ': ' + m.params.args.map(a => a.value || a.description).join(' '));
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('log: ' + m.params.entry.text);
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
  const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' - ' + detail : '')); };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT, eventsEnabled: true });
  const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
  await send('Page.navigate', { url });
  await waitFor('document.readyState === "complete" && !!(window.SS && SS.App)', 15000);
  await evaluate('localStorage.clear(); true');
  await sleep(300);
  await shot('01-empty.png');
  check('app loads from file:// with no errors', problems.length === 0, problems.join(' | '));
  check('empty state shown before generating', await evaluate('!document.getElementById("empty").hidden'));
  check('download disabled before generating', await evaluate('document.getElementById("download").disabled'));

  // 100 Medium puzzles: measure the longest gap between animation frames (UI freeze).
  await evaluate(`(function () {
    var c = document.getElementById('count'); c.value = '100'; c.dispatchEvent(new Event('input', { bubbles: true }));
    var d = document.getElementById('difficulty'); d.value = 'medium'; d.dispatchEvent(new Event('change', { bubbles: true }));
    window.__maxGap = 0; window.__progressSeen = [];
    var last = performance.now();
    (function frame(t) { window.__maxGap = Math.max(window.__maxGap, t - last); last = t; if (!window.__stopFrames) requestAnimationFrame(frame); })(last);
    var obs = new MutationObserver(function () { var t = document.getElementById('progress-text').textContent; if (window.__progressSeen.indexOf(t) < 0) window.__progressSeen.push(t); });
    obs.observe(document.getElementById('progress-text'), { childList: true, characterData: true, subtree: true });
    document.getElementById('generate').click();
    return true;
  })()`);
  const genMs = await waitFor('!!SS.App.state.puzzles && !SS.App.state.busy', 180000);
  const gen = await evaluate('({ n: SS.App.state.puzzles.length, mode: SS.App.generationMode, maxGap: Math.round(window.__maxGap), progress: window.__progressSeen.length, sample: window.__progressSeen.slice(0, 3), diffs: SS.App.state.puzzles.map(function (p) { return p.difficulty; }).filter(function (d) { return d !== "medium"; }).length, verified: SS.App.state.puzzles.every(function (p) { return p.verified; }) })');
  await evaluate('window.__stopFrames = true');
  check('100 Medium puzzles generated', gen.n === 100 && gen.diffs === 0 && gen.verified, 'in ' + genMs + ' ms, ' + gen.mode);
  check('generation ran in Blob workers', /^workers/.test(gen.mode), gen.mode);
  check('UI never froze (longest frame gap < 250 ms)', gen.maxGap < 250, gen.maxGap + ' ms');
  check('progress text updated', gen.progress >= 3, gen.sample.join(', '));
  await sleep(300);
  await shot('02-generated.png');

  await evaluate(`(function () {
    document.querySelector('input[name="view"][value="spread"]').click();
    document.getElementById('show-margins').click();
    document.getElementById('next').click();
    return true;
  })()`);
  await sleep(300);
  await shot('03-spread-margins.png');
  check('spread view shows 2 pages', await evaluate('document.querySelectorAll("#pages .sheet").length === 2'));

  // Layout-only change: no regeneration needed, preview updates instantly.
  const before = await evaluate('SS.App.state.puzzles[0].givens');
  await evaluate(`(function () { var t = document.getElementById('trim'); t.value = '6x9'; t.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(200);
  const after = await evaluate('({ same: SS.App.state.puzzles[0].givens, stale: !document.getElementById("stale-notice").hidden, w: SS.App.state.book.pageSize.w })');
  check('trim change re-lays out without regenerating', after.same === before && !after.stale && after.w === 6);
  await evaluate(`(function () { var d = document.getElementById('difficulty'); d.value = 'hard'; d.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(150);
  check('difficulty change shows "click Generate" notice', await evaluate('!document.getElementById("stale-notice").hidden && document.getElementById("download").disabled'));
  await evaluate(`(function () { var d = document.getElementById('difficulty'); d.value = 'medium'; d.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(150);
  await shot('04-6x9.png');
  const tip = await evaluate('(function () { var r = document.querySelector(".switch .tip").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tip.x, y: tip.y });
  await sleep(250);
  await shot('04a-tooltip.png');
  check('tooltip shows on hover', await evaluate('getComputedStyle(document.querySelector(".switch .tip"), "::after").visibility === "visible"'));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 500 });
  await evaluate('document.querySelector(".sidebar").scrollTop = 1e6; true');
  await sleep(200);
  await shot('04b-summary.png');
  check('KDP check list all green', await evaluate('document.querySelectorAll("#checks li.bad").length === 0 && document.querySelectorAll("#checks li.ok").length === 6'));

  // Page-count limits (layout-only: checked on the placeholder plan, no generation needed).
  const setCount = n => evaluate(`(function () { var c = document.getElementById('count'); c.value = '${n}'; c.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await setCount(5);
  await sleep(150);
  const under = await evaluate('document.getElementById("check-problems").textContent');
  check('under 24 pages: warning says how many puzzles to add', /add \d+ more puzzle/.test(under), under);
  await shot('04c-under-24.png');
  await setCount(100);
  await evaluate(`(function () { document.querySelector('input[name="solutionsPerPage"][value="1"]').click(); return true; })()`);
  await sleep(150);
  // 100 puzzles cannot exceed 828 pages, so check the plan the summary uses for 500.
  const over = await evaluate(`(function () {
    var s = Object.assign({}, SS.App.state.settings, { count: 500, solutionsPerPage: 1, perPage: 1 });
    return SS.Layout.plan(s, 500).pageCount;
  })()`);
  check('over 828 pages is detected', over > 828, over + ' pages');
  await evaluate(`(function () { document.querySelector('input[name="solutionsPerPage"][value="4"]').click(); return true; })()`);
  await sleep(150);

  // Download.
  // Download at the three trims the spec asks to test.
  for (const trim of ['8.5x11', '6x9', '8.27x11.69']) {
    await waitFor('!SS.App.state.busy', 60000);
    await evaluate(`(function () { var t = document.getElementById('trim'); t.value = '${trim}'; t.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await sleep(150);
    const beforeFiles = new Set(fs.readdirSync(OUT));
    await evaluate('document.getElementById("download").click(); true');
    const t0 = Date.now();
    let pdf = null;
    while (Date.now() - t0 < 120000 && !pdf) {
      await sleep(300);
      pdf = fs.readdirSync(OUT).find(f => f.endsWith('.pdf') && !beforeFiles.has(f) && f.includes('_' + trim + '_'));
    }
    check('Download PDF at ' + trim, !!pdf, pdf ? pdf + ' in ' + (Date.now() - t0) + ' ms' : 'none');
  }

  // Cancel: start a big Expert run and cancel it once its own progress appears.
  await waitFor('!SS.App.state.busy', 60000);
  await evaluate(`(function () {
    var c = document.getElementById('count'); c.value = '500'; c.dispatchEvent(new Event('input', { bubbles: true }));
    var d = document.getElementById('difficulty'); d.value = 'expert'; d.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('generate').click(); return true;
  })()`);
  await waitFor('!document.getElementById("progress").hidden && /Generating [1-9]\\d* \\/ 500/.test(document.getElementById("progress-text").textContent)', 60000);
  await shot('05-generating.png');
  await evaluate('document.getElementById("cancel").click(); true');
  await sleep(300);
  const afterCancel = await evaluate('({ busy: !!SS.App.state.busy, n: SS.App.state.puzzles.length, progressHidden: document.getElementById("progress").hidden })');
  check('Cancel stops generation and keeps the previous book', !afterCancel.busy && afterCancel.n === 100 && afterCancel.progressHidden, JSON.stringify(afterCancel));

  check('no console errors during the run', problems.length === 0, problems.join(' | '));
  ws.close();
  proc.kill();
  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed. Output: ' + OUT);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
