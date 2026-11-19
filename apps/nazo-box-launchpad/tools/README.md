# NAZO BOX · Listing Launchpad

Bonus for NAZO BOX buyers. A seller describes the book they built in NAZO BOX, gets 7
backend keywords from the researched Publisher Rocket list, and the AI writes 5 title +
subtitle pairs, a description and back cover text, all checked against Amazon's KDP rules.

```
apps/nazo-box-launchpad/
  index.html          the deliverable (protected build), served at /nazo-box-launchpad/
  How to use.txt      buyer notes
  src/launchpad.html  readable source: edit this, never index.html
  tools/              keyword build, key lock, protect, smoke test
```

`src/` and `tools/` are never deployed (scripts/build.mjs skips them), but they are in the git repo.

| File in tools/ | What it is |
|---|---|
| `Murder_Nonogram_Keyword_Database.xlsx` | Publisher Rocket research (19 Nov 2026). |
| `build-keywords.py` | Cleans the workbook into `nazo-box-keyword.json` (drops brands, sets, other formats, variants; tags each keyword with what it claims about the book). |
| `nazo-box-keyword.json` | Keyword dataset (257 keywords). **Upload to the data repo** (below). |
| `encrypt-key.mjs` | Locks the AI key inside `src/launchpad.html` behind an `NZB-...` activate code. |
| `protect.js` | Writes the protected `../index.html` (obfuscated script). |
| `smoke.js`, `test-key.js` | ~160 checks with a fake AI and a dummy key (fit rules, quick picks for 7 kinds of book, UI flow, sanitiser, rules check). |

## One-time: lock the AI key and build

```bash
cd apps/nazo-box-launchpad/tools
npm install
node encrypt-key.mjs --new-code --from "D:/warriorplus/Kids Activity Prints/dev/launchpad/src/launchpad.html" --from-code <Kids activate code>
npm test
```

`encrypt-key.mjs` prints the activate code: put it in the WarriorPlus bonus delivery next to the link.
It never prints the AI key. Or use a different key: `GRSAI_API_KEY=sk-... node encrypt-key.mjs --new-code`.
To keep an existing code: `--code NZB-XXXX-XXXX-XXXX-XXXX` instead of `--new-code`.
Never write the activate code into a file in this repo: the repo is public.

## Publish the keyword data (required before shipping)

The page loads `https://raw.githubusercontent.com/vanloc19bk96/affiliate-bonuses-data/master/nazo-box-keyword.json`
(jsDelivr as fallback). Commit `nazo-box-keyword.json` to `vanloc19bk96/affiliate-bonuses-data` on `master`.
Until then the keyword table is empty.

Local test before that: `python -m http.server 8765` in `tools/`, then open
`http://127.0.0.1:8765/build-test/launchpad.html?data=/nazo-box-keyword.json` (after `npm run verify`;
test code `NZB-TEST-2345-6789-ABCD`, AI calls fail with the dummy key). `?data=` only works on localhost.

## Rebuild after changes

```bash
python build-keywords.py   # after changing the workbook or the rules
npm test                   # smoke test on source + protected build, then writes ../index.html
```

## AI

grsai, model `gpt-6.1-sol` (same account and model as the Kids Activity Prints launchpad, Nov 2026).
