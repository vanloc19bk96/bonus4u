/*
 * browser-check.js: end-to-end check in a real browser (Edge or Chrome, headless) loading
 * index.html straight from file://, the way a user double-clicks it.
 *
 *   node tests/browser-check.js [outDir] [browserPath]
 *
 * Checks: no console errors; words dialog (prompts, paste, status, apply); generation runs
 * in Blob workers without freezing the page; preview renders; Download produces a PDF;
 * Cancel works. Screenshots + PDFs go to outDir. Uses tests/fixtures/sample-words.json
 * (test data only: the app itself ships no puzzle words).
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'word-fill-in-check'));
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wfp-profile-'));
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
  await waitFor('document.readyState === "complete" && !!(window.WF && WF.App)', 15000);
  await evaluate('localStorage.clear(); true');
  await send('Page.reload');
  await sleep(500);
  await waitFor('document.readyState === "complete" && !!(window.WF && WF.App)', 15000);
  await sleep(300);
  await shot('01-empty.png');
  check('app loads from file:// with no errors', problems.length === 0, problems.join(' | '));
  check('empty state shown', await evaluate('!document.getElementById("empty").hidden'));
  check('download disabled before generating', await evaluate('document.getElementById("download").disabled'));

  // Words dialog: prompt builder.
  await evaluate('document.getElementById("empty-add-words").click(); true');
  await sleep(200);
  check('words dialog opens', await evaluate('document.getElementById("words-dialog").open'));
  await evaluate(`(function () {
    var t = document.getElementById('wz-topic'); t.value = 'Everyday life'; t.dispatchEvent(new Event('input', { bubbles: true }));
    var c = document.getElementById('wz-count'); c.value = '30'; c.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('wz-ideas').click();
    return true;
  })()`);
  await sleep(200);
  const pr = await evaluate('({ prompts: document.querySelectorAll("#prompt-list li").length, themes: document.getElementById("wz-themes").value.split("\\n").filter(Boolean).length, text: document.getElementById("prompt-preview").textContent })');
  check('random theme ideas fill the themes box', pr.themes === 30, pr.themes + ' themes');
  check('prompts are split into batches', pr.prompts === 3, pr.prompts + ' prompts');
  check('prompt asks for JSON and has a variation code', /"puzzles"/.test(pr.text) && /Variation code [A-Z0-9]{6}/.test(pr.text));
  check('prompts show an Updated badge after a themes change', await evaluate('!document.getElementById("prompts-updated").hidden'));
  await shot('02-words-dialog.png');

  // Paste answers: the fixture as JSON wrapped in chatter + a typed text list.
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-words.json'), 'utf8');
  const pasted = 'Sure! Here is your JSON:\n```json\n' + fixture + '\n```\n\nMy extra: oak, pine, maple, birch, cedar, willow, spruce, elm, ash, beech, poplar, hazel, larch, yew, alder';
  await evaluate('(function () { var w = document.getElementById("words-input"); w.value = ' + JSON.stringify(pasted) + '; w.dispatchEvent(new Event("input", { bubbles: true })); return true; })()');
  await sleep(500);
  const status = await evaluate('document.getElementById("wd-status").textContent');
  check('paste box recognises 7 puzzles', /7 puzzles/.test(status), status.slice(0, 120));
  await shot('03-words-pasted.png');
  await evaluate('document.getElementById("wd-apply").click(); true');
  await sleep(300);
  check('dialog closes and the words card is ready', await evaluate('!document.getElementById("words-dialog").open && document.getElementById("words-card").classList.contains("ready")'));

  // Generate.
  await evaluate(`(function () {
    var t = document.getElementById('titlePage'); t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true }));
    var b = document.getElementById('bookTitle'); b.value = 'Everyday Word Fill-In'; b.dispatchEvent(new Event('input', { bubbles: true }));
    window.__maxGap = 0; var last = performance.now();
    (function frame(t) { window.__maxGap = Math.max(window.__maxGap, t - last); last = t; if (!window.__stopFrames) requestAnimationFrame(frame); })(last);
    document.getElementById('generate').click();
    return true;
  })()`);
  const genMs = await waitFor('!!WF.App.state.puzzles && !WF.App.state.busy', 120000);
  const gen = await evaluate('({ n: WF.App.state.puzzles.length, mode: WF.App.generationMode, maxGap: Math.round(window.__maxGap), example: !!WF.App.state.example, pages: WF.App.state.book.pageCount, warn: WF.App.state.genWarnings })');
  await evaluate('window.__stopFrames = true');
  check('7 puzzles generated', gen.n === 7, 'in ' + genMs + ' ms, ' + gen.mode + ', ' + gen.pages + ' pages ' + JSON.stringify(gen.warn));
  check('generation ran in Blob workers', /^workers/.test(gen.mode), gen.mode);
  check('UI never froze (longest frame gap < 250 ms)', gen.maxGap < 250, gen.maxGap + ' ms');
  check('how-to example built from spare words', gen.example);
  check('KDP page check flags a short book', await evaluate('/KDP needs at least 24/.test(document.getElementById("check-problems").textContent)'));
  await sleep(300);
  await shot('04-generated.png');
  await evaluate('WF.App.state.page = 3; WF.App.refresh(); true');
  await sleep(300);
  await shot('05-puzzle-page.png');

  await evaluate(`(function () {
    document.querySelector('input[name="view"][value="spread"]').click();
    document.getElementById('show-margins').click();
    return true;
  })()`);
  await sleep(300);
  await shot('06-spread-margins.png');

  // A layout-only change must not need a new Generate.
  await evaluate(`(function () { document.querySelector('input[name="gridStyle"][value="blocks"]').click(); return true; })()`);
  await sleep(200);
  check('grid style changes without regenerating', await evaluate('document.getElementById("stale-notice").hidden && !document.getElementById("download").disabled'));
  await shot('07-blocks.png');
  // A difficulty change does.
  await evaluate(`(function () { var d = document.getElementById('difficulty'); d.value = 'hard'; d.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(200);
  check('difficulty change asks for Generate', await evaluate('!document.getElementById("stale-notice").hidden && document.getElementById("download").disabled'));
  await evaluate('document.getElementById("generate").click(); true');
  await waitFor('!WF.App.state.busy && document.getElementById("stale-notice").hidden', 120000);

  for (const trim of ['8.5x11', '6x9']) {
    await evaluate(`(function () { var t = document.getElementById('trim'); t.value = '${trim}'; t.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await sleep(200);
    if (!(await evaluate('document.getElementById("stale-notice").hidden'))) {
      await evaluate('document.getElementById("generate").click(); true');
      await waitFor('!WF.App.state.busy && document.getElementById("stale-notice").hidden', 120000);
    }
    const beforeFiles = new Set(fs.readdirSync(OUT));
    await evaluate('document.getElementById("download").click(); true');
    const t0 = Date.now();
    let pdf = null;
    while (Date.now() - t0 < 120000 && !pdf) {
      await sleep(300);
      pdf = fs.readdirSync(OUT).find(f => f.endsWith('.pdf') && !beforeFiles.has(f) && f.includes('_' + trim + '_'));
    }
    check('Download PDF at ' + trim, !!pdf, pdf ? pdf + ' in ' + (Date.now() - t0) + ' ms' : 'none ' + await evaluate('document.getElementById("action-error").textContent'));
  }

  // Cancel: a big run, cancelled once progress shows.
  await waitFor('!WF.App.state.busy', 60000);
  const bigText = await evaluate('(function () { var out = []; for (var i = 0; i < 40; i++) WF.App.state.prepared.puzzles.forEach(function (p) { out.push((p.title || "List") + " " + i + ": " + p.words.join(", ")); }); return out.join("\\n"); })()');
  await evaluate('WF.App.openWords(); var w = document.getElementById("words-input"); w.value = ' + JSON.stringify(bigText) + '; document.getElementById("noRepeats").click(); WF.App.applyWords(); true');
  await sleep(300);
  await evaluate('document.getElementById("generate").click(); true');
  await waitFor('!document.getElementById("progress").hidden && /Building puzzle [1-9]\\d* \\//.test(document.getElementById("progress-text").textContent)', 60000);
  await shot('08-generating.png');
  await evaluate('document.getElementById("cancel").click(); true');
  await sleep(300);
  const afterCancel = await evaluate('({ busy: !!WF.App.state.busy, progressHidden: document.getElementById("progress").hidden, stale: !document.getElementById("stale-notice").hidden })');
  check('Cancel stops generation', !afterCancel.busy && afterCancel.progressHidden, JSON.stringify(afterCancel));

  check('no console errors during the run', problems.length === 0, problems.join(' | '));
  ws.close();
  proc.kill();
  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed. Output: ' + OUT);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
