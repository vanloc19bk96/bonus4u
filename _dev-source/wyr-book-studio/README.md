# WYR Book Studio

Make a **Would You Rather** book that meets Amazon KDP's print rules. Everything runs
on your own machine: nothing to install, no internet, no account.

---

## Five minute start

1. Unzip the whole folder, keeping the sub-folders (`js/`, `fonts/`, `lib/`…) as they are.
2. **Double-click `index.html`** — it opens in your browser.
3. Hit **“Try it with sample questions”** to see a finished book straight away.

> Use a recent Chrome, Edge or Firefox. There is no web server to start.

---

## Three steps to a book

### ① Set up the content
Choose who the book is for, the theme, and how many questions. Every field already has
a sensible default, so you can go straight to **“Build the prompt →”**.

What sells on Amazon: best sellers usually carry **200–300 questions** at **6" x 9"**, and
seasonal editions (Christmas, Halloween, Summer) do particularly well.

### ② Get the questions from an AI
One panel, two halves, because a book takes several laps between them.

**A — Copy the prompt.** The app writes it for you. Hit **“📋 Copy prompt”**, open
ChatGPT, Claude, Gemini or Grok, paste it and send.

200 questions is more than any model will write in one reply, so the work is split into
**rounds** of 50. Once the AI finishes a round, type `next` to get the following one —
there is a **“📋 Copy the next command”** button for that.

**B — Paste the reply.** Copy the **whole** reply from the AI — extra chatter around it is
fine — and hit **“Add to the book”**. The app finds the data, forgives the usual
formatting slips, and **drops duplicates** on its own. The next round then loads straight
back into A, so you never leave the panel until the book is full.

*Tip:* use the strongest model you have. Whether the questions are good or forgettable
decides whether the book sells.

- If the AI got cut off mid-answer, the app still keeps every complete question and tells
  you to type `continue` and paste the rest.
- ✏️ edits a single question, 🗑 deletes it.
- Tick a few questions you are not happy with and press **“Rewrite prompt”**. The AI
  rewrites exactly those, and pasting the result **replaces** them instead of adding more.
- **“Export JSON”** saves a backup; **“Import JSON”** opens one again.

### ③ Layout & download
Set the title (or click one of the AI's three suggestions), pick the trim size, choose
which sections to include, then hit **“⬇ Download PDF”**.

The panel above the button always shows the page count, gutter, outside margin, and
whether the book ✓ **meets the KDP rules**.

The preview on the right shows **one page at a time**, exactly as it will print. Move
with ◀ ▶ or the ← → arrow keys, jump to any page by typing its number in the box, and
use ⏮ ⏭ for the first and last page. **“Show margins”** draws the KDP safe area over the
page so you can see what sits inside it.

---

## KDP upload checklist

When you create the paperback on KDP, choose exactly these:

| Setting | Choose |
|---|---|
| Trim size | **The size you picked in the app** (6" x 9" by default) |
| Bleed | **No bleed** |
| Interior & paper type | **Black & white**, white or cream paper |
| Low-content book? | **No** — this book has real written content, it is not a blank notebook |
| Interior file | The PDF you just downloaded |

After uploading:

1. Run the KDP **Print Previewer** and check there are no margin warnings.
2. Make the **cover separately** — this app builds the interior only. Use the KDP cover
   calculator and give it the **exact page count** the app shows, so the spine comes out right.

---

## How the PDF is built

These details matter, because KDP rejects files that get them wrong:

- **The page is exactly the trim size** (6x9 → 432 × 648 pt), no bleed.
- **Margins follow the KDP table**, plus 0.125" of our own headroom. The gutter depends on
  the page count, so the app lays the book out, counts the pages, and lays it out again if
  the gutter changed.
- **Mirrored margins**: odd pages (right-hand) carry the gutter on the left, even pages on
  the right.
- **Text stays real text** — selectable, copyable, and crisp at any size. The app never
  screenshots a page, so the file is small and nothing looks blurry.
- **Fonts are embedded**: Baloo 2 and Nunito, both under the SIL Open Font License 1.1
  and free for commercial books.
- **9pt minimum type** and **0.75pt minimum line weight** — both above what KDP demands.
- No transparency, no annotations, no bookmarks, no crop marks.

Before letting you download, the app audits the whole book and warns you if anything
falls outside the safe area.

---

## Questions people ask

**Where is my work saved?**
Nowhere, unless you save it yourself. The app keeps everything in memory only — nothing
is written to the browser and nothing is ever sent anywhere, so opening `index.html`
always starts a fresh project. Press **“Export JSON”** before you close the tab, and
**“Import JSON”** to pick the project back up.

**It says the book is under 24 pages.**
KDP will not print anything thinner. Add more questions, switch back to one question per
page, or turn on the **Write your own** and **answer** sections.

**Can the book be in another language?**
Change “Language inside the book” in step ①. Everything printed inside the book — how to
play, the copyright page, the section titles — switches with it, and the prompt asks the
AI to write the questions in that language. English, Spanish, French and German are
built in, and the fonts cover all of them.

**Is there an answer key?**
Would You Rather has no right answer. Instead every question gets a **“Behind the Choices”**
entry at the back: why the choice is genuinely hard, the best argument for each side, and
a follow-up question. That section is what separates your book from the ones that are
nothing but a list of questions.

**Will 500 questions freeze the browser?**
No. The PDF is built in batches with a progress bar. A 320 page book takes about five
seconds.

---

## Tests

Two test pages, opened by double-clicking just like the app:

- `tests/parser-tests.html` — the reader for AI replies (code fences, surrounding chatter,
  trailing commas, truncated answers, bare arrays, long field names, duplicates, emoji,
  accented letters).
- `tests/layout-tests.html` — the KDP margin table, mirrored margins, the safe area,
  minimum type and line weights, every trim size, and a 500 question book.

---

## What is in the folder

```
wyr-book-studio/
├── index.html              the app
├── css/styles.css
├── js/
│   ├── namespace.js        window.WYR
│   ├── config.js           trim sizes, the KDP margin table, book copy per language
│   ├── state.js            the in-memory project state
│   ├── prompt.js           writes the prompt for the AI
│   ├── parser.js           reads and cleans whatever the AI replied
│   ├── kdp.js              margins and the compliance audit
│   ├── layout.js           the typesetting engine (measuring, wrapping, display list)
│   ├── render-preview.js   draws one page of the display list on screen
│   ├── render-pdf.js       draws that same display list into the PDF
│   ├── ui.js               the three step interface
│   └── app.js              startup
├── fonts/                  Baloo 2 + Nunito as base64 (SIL OFL 1.1, see OFL.txt)
├── lib/jspdf.umd.min.js    jsPDF 2.5.1
├── sample/sample-data.js   30 sample questions
└── tests/
```

The preview and the PDF share **one display list** and **one set of text measurements**,
which is why what you see on screen is what gets printed.

---

## Font licence

Baloo 2 and Nunito are released under the **SIL Open Font License 1.1**, which allows
commercial books. The full licence is in `fonts/OFL.txt` — keep that file with the folder
if you pass it on.
