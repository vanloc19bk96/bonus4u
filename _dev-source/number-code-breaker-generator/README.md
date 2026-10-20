# Number Code Breaker — KDP Book Generator

A local, offline tool for generating complete **Number Code Breaker** puzzle books
(Mastermind-style numeric logic puzzles) and exporting them as print-ready PDF
interiors for Amazon KDP paperbacks.

## Running it

Double-click **`index.html`**.

That is the whole install. There is no server, no Node requirement, no `npm install`,
no build step, no database, no login, no API key, and no network access at runtime.
Everything — including the PDF library and the embedded font — is vendored in this
folder and loaded through ordinary relative `<script>` tags, so it all works from a
`file://` URL.

Open **`tests.html`** the same way to run the developer test suite.

## What it does

- Generates any number of puzzles, each with **exactly one** possible solution.
- Supports all 16 standard KDP paperback trim sizes, with 8.5 × 11 in as the default.
- Lays out front matter, puzzle pages and an answer key with correct mirrored gutters.
- Shows a live, print-accurate preview of every page.
- Runs a live KDP compliance checklist and blocks export until it passes.
- Exports a vector PDF at the exact physical page size, with fonts embedded.
- Remembers your last settings between sessions.

## The puzzle

Each puzzle hides a numeric code. Every clue row is a guess, scored beside it:

- **●** a correct number in the correct position
- **○** a correct number in the wrong position

The symbols are a group — they do not line up with particular columns. They are drawn
as real vector circles rather than Unicode glyphs, so the meaning survives black-ink
printing and does not depend on colour.

Scoring is duplicate-safe: shared digits are counted as the sum, over each digit, of
`min(timesInSecret, timesInGuess)`, so a guess of `1 1 7 5` against a secret of
`1 5 1 3` scores one correct place and two misplaced — never more copies of a digit
than the secret actually contains.

### Uniqueness is proved, not assumed

Clues are chosen by information reduction: at each round the generator evaluates a
pool of candidate guesses, scores each against the target, and picks the one whose
surviving candidate count lands closest to a geometric schedule, so the puzzle
collapses to a single answer on the last clue row rather than several rows early.

Every finished puzzle is then **re-solved from scratch** against a complete
enumeration of the codes the settings allow. A puzzle is only accepted when exactly
one code satisfies every clue and that code is the one in the answer key. Anything
else is regenerated. This applies to every difficulty preset — "harder" never means
"possibly ambiguous".

## KDP rules

Verified against Amazon's published documentation on **9 September 2026**:

- [Trim sizes and page counts](https://kdp.amazon.com/en_US/help/topic/G201834180)
- [Trim size, bleed and margins](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6)
- [Paperback submission guidelines](https://kdp.amazon.com/en_US/help/topic/G201857950)

All of it lives in one place, `js/constants.js` and `js/kdp-layout.js`. Preview,
pagination, validation and PDF export read from there; no margin arithmetic is
repeated anywhere else.

**Minimum inside/gutter margin**, by final page count:

| Page count | Gutter | Outside/top/bottom, no bleed | With bleed |
|---|---|---|---|
| 24–150 | 0.375 in | 0.25 in | 0.375 in |
| 151–300 | 0.5 in | 0.25 in | 0.375 in |
| 301–500 | 0.625 in | 0.25 in | 0.375 in |
| 501–700 | 0.75 in | 0.25 in | 0.375 in |
| 701–828 | 0.875 in | 0.25 in | 0.375 in |

The book is not designed against those minimums. The safe design margin is 0.5 in on
the top, bottom and outside, and `max(0.5, KDP minimum gutter + 0.125)` on the inside.

**Bleed** adds 0.125 in to the outside edge, the top and the bottom — never to the
gutter. An 8.5 × 11 trim therefore becomes an 8.625 × 11.25 in PDF page. No-bleed is
the default and the right choice for this book, since no content reaches the paper edge.

**Page limits come from the selected trim profile**, not from one global number: 828
pages at 5 × 8, but 590 at 8.5 × 11, 780 at A4 and 800 at 8.25 × 8.25.

**Even page count.** KDP prints on two-page sheets, so a paperback interior always has
an even physical page count; if the manuscript is odd, KDP appends a blank page of its
own. The generator adds that trailing blank page itself, so the preview, the exported
PDF and the printed book all show the same page count.

## Things worth knowing

**Facing pages.** Page 1 is a right-hand page: gutter left, outside right. Even pages
mirror it. Up to 150 pages the safe inside and outside margins are both 0.5 in, so the
two content boxes coincide — that is what the margin rule above produces, and it is
correct. The mirroring becomes visible in the geometry from 151 pages onward, and the
preview always shows which side the gutter is on.

**Code space limit.** Uniqueness is proved by enumerating every code the settings
allow, so the app refuses configurations above 400,000 possible codes and says so
plainly. That covers every code length up to 6 positions with up to 8 distinct digits.
A 6-position code over all ten digits (1,000,000 codes) is rejected rather than
silently downgraded to a weaker guarantee.

**Answer key density.** The spec suggested 16–24 answers per page; this fits them
dynamically instead, which is the stricter requirement. On 8.5 × 11 that is four
columns of 25, so a 100-puzzle book needs one answer page rather than five. Line
height and column width are fixed and comfortable, and the layout never violates the
safe area.

**Embedded fonts.** jsPDF's built-in Helvetica, Times and Courier are PDF "standard 14"
fonts: referenced but never embedded, which fails KDP preflight. This app embeds Noto
Sans instead. jsPDF also registers all fourteen core fonts in every document's shared
font resource dictionary even when nothing draws with them, so the exporter strips
those dead entries from the finished file — by overwriting them with spaces, which
keeps every byte offset and the cross-reference table valid. The exported PDF contains
no non-embedded font.

**Front-matter headings.** In the copyright and instruction text, a short line typed
IN CAPITALS is rendered as a heading. `{YEAR}`, `{AUTHOR_OR_PUBLISHER}`, `{TITLE}` and
`{SUBTITLE}` are filled in. Text too long for one page continues onto extra pages,
which count toward the total and keep the correct gutter side.

**Repagination.** Changing the trim size, bleed, density or front matter repaginates
the existing puzzles without regenerating them. Changing anything that affects the
puzzles themselves marks the book stale and disables export until you regenerate.

**Randomness.** Every generation draws a fresh random seed, so each run produces a
new book. All randomness still flows through one seeded generator internally;
`Math.random()` is used only to mint that per-run seed.

## Tests

`tests.html` runs its full check suite in the browser with no tooling:

- scoring, including every duplicate-digit case
- the solver on unique, ambiguous and contradictory clue sets
- 1000 generated puzzles across all four presets, each re-solved and asserted unique
- seed determinism
- KDP gutter brackets at 24 / 150 / 151 / 300 / 301 / 500 / 501 / 700 / 701 / 828
- page counts below the minimum and above the trim-specific maximum
- page geometry: 8.5 × 11 no bleed = 612 × 792 pt, with bleed = 621 × 810 pt
- facing-page mirroring and bleed placement
- all 16 trim sizes: page size, bleed size, page limits, aspect ratio, safe area, density
- the page model, front-matter overflow and repagination
- PDF export, preflight, embedded fonts and the absence of non-embedded fonts

## Files

```
number-code-breaker-generator/
├── index.html              the app
├── tests.html              the test runner
├── css/styles.css          app chrome and the print-accurate preview
├── js/
│   ├── constants.js        KDP profiles, margins, layout geometry — one source of truth
│   ├── seeded-random.js    the only source of randomness
│   ├── utils.js            units, text measurement, wrapping
│   ├── kdp-layout.js       margins, facing pages, bleed, card and answer geometry
│   ├── puzzle-engine.js    scoring, code space, solver, generator
│   ├── puzzle-validator.js independent re-verification of every puzzle
│   ├── book-builder.js     the page model shared by preview and export
│   ├── kdp-compliance.js   the live checklist and the export gate
│   ├── preview-renderer.js HTML preview
│   ├── pdf-export.js       vector PDF drawing and preflight
│   ├── project-storage.js  remembers your last settings between sessions
│   ├── app.js              form state and wiring
│   └── tests.js            the test suite
└── vendor/                 jsPDF and the embedded font (see vendor/README.txt)
```

## Before you publish

This app is built to Amazon KDP's published paperback formatting rules and runs its own
preflight before saving a file. It does not submit anything to Amazon and cannot approve
a file on Amazon's behalf. **Always review the finished PDF in KDP's Print Previewer
before publishing**, and re-check the current KDP documentation if Amazon changes its
requirements.

## Third-party licences

- **jsPDF 2.5.1** — MIT, © 2010–2021 James Hall and contributors.
- **Noto Sans** (Regular and Bold) — SIL Open Font License 1.1, © 2022 The Noto Project
  Authors. See `vendor/OFL.txt`.
