For maintainers (end users never need this folder).

No build step is needed to run the app: index.html loads plain scripts.
These scripts only regenerate bundled data files:

  node tools/build-fonts.js    fonts/*.ttf      -> js/fonts.js (base64)
  node tools/build-sample.js   sample-src/*.json -> js/data/sample.js (the 50-chapter sample book)
  node tests/run.js            engine acceptance tests (sample book, puzzles, prompts, PDF)

Fonts: PT Serif (Regular, Bold, Italic) and Lato (Regular, Bold), SIL Open Font License 1.1.
They ship unmodified because both licenses reserve the font names. jsPDF subsets them inside the PDF.

Code map
  js/core/util.js        seeded RNG, hashing
  js/core/text.js        word normalization, curly quotes, markdown stripping
  js/core/metrics.js     TrueType metrics (the layout measures with these, so preview == PDF)
  js/core/puzzle.js      grid builder and verifier (regular, hidden clue, final reveal)
  js/core/validate.js    forgiving reader for pasted answers + plan/chapter checks
  js/core/prompts.js     the prompts users copy into an AI chat
  js/core/book.js        project model, page map, KDP margins, puzzle cache
  js/core/layout.js      page layout to KDP standards -> drawing items in points
  js/core/checklist.js   pre-download checklist
  js/render/svg.js       preview renderer        js/render/pdf.js   PDF renderer (jsPDF)
  js/ui/*                interface (sidebar steps, preview, editor, storage, undo)
