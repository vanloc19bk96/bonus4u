const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'prompts.json');
const outPath = path.join(__dirname, 'prompts.js');

const json = fs.readFileSync(jsonPath, 'utf8');
JSON.parse(json);

fs.writeFileSync(outPath, `window.VAULT_PROMPTS = ${json};\n`, 'utf8');
console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB)`);
