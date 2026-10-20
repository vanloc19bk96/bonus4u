const fs = require('fs');
const path = require('path');

const dir = __dirname;
const DATA_URL = 'https://raw.githubusercontent.com/vanloc19bk96/affiliate-bonuses-data/refs/heads/master/365-day-coster-launch-calendar-events.json';

async function loadEventsJson() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data?.events?.length) throw new Error('Invalid calendar data');
    console.log(`Fetched ${data.events.length} events from GitHub`);
    return JSON.stringify(data);
  } catch (err) {
    console.warn('GitHub fetch failed, trying local file…', err.message);
    const localPath = path.join(dir, '365-day-coster-launch-calendar-events.json');
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath, 'utf8');
    }
    throw new Error('Could not load calendar data from GitHub or local file');
  }
}

async function build() {
  const indexHtml = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const eventsJson = await loadEventsJson();

  let nichesBlock = '';
  const nichesPath = path.join(dir, 'niches.json');
  if (fs.existsSync(nichesPath)) {
    const nichesJson = fs.readFileSync(nichesPath, 'utf8');
    nichesBlock = `\n<script id="embedded-niches" type="application/json">\n${nichesJson}\n</script>`;
  }

  const embeddedBlocks = [
    `<script id="embedded-events" type="application/json">\n${eventsJson}\n</script>`,
    nichesBlock.trim(),
  ].filter(Boolean).join('\n');

  const standalone = indexHtml.replace(
    '  <script>\n    const BRAND = {',
    `${embeddedBlocks}\n\n  <script>\n    const BRAND = {`
  );

  fs.writeFileSync(path.join(dir, 'index-standalone.html'), standalone, 'utf8');

  const sizeKb = (fs.statSync(path.join(dir, 'index-standalone.html')).size / 1024).toFixed(1);
  console.log(`Built index-standalone.html (${sizeKb} KB)`);
}

build().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
