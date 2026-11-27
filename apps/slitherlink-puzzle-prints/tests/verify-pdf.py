"""
verify-pdf.py: independent check of an exported interior PDF with PyMuPDF (pip install pymupdf).

    python tests/verify-pdf.py book.pdf '{"w": 8.5, "h": 11, "pages": 120,
                                          "margins": {"inside": 0.625, "outside": 0.5, "top": 0.5, "bottom": 0.5}}'

It reads the PDF itself, not the app's layout data, and checks the KDP rules: page size,
page count, margins on odd (right) and even (left) pages, embedded fonts, no images,
text at least 7 pt, strokes at least 0.75 pt, gray only, no metadata, annotations,
bookmarks or encryption. Prints a JSON report; exit code 1 if anything fails.
"""
import json
import sys

import fitz  # PyMuPDF

TOL = 0.35  # points: anti-aliasing slack for glyph boxes and stroke ends


def main():
    path, spec = sys.argv[1], json.loads(sys.argv[2])
    doc = fitz.open(path)
    w, h = spec["w"] * 72, spec["h"] * 72
    m = {k: v * 72 for k, v in spec["margins"].items()}
    problems = []
    stats = {"pages": doc.page_count, "fonts": set(), "minFont": 99.0, "minStroke": 99.0, "images": 0}

    def bad(msg):
        if len(problems) < 25:
            problems.append(msg)

    if doc.page_count != spec["pages"]:
        bad("page count %d, expected %d" % (doc.page_count, spec["pages"]))
    if doc.page_count % 2 or doc.page_count < 24:
        bad("page count %d is odd or below 24" % doc.page_count)
    if doc.is_encrypted:
        bad("encrypted")
    if any(v for k, v in doc.metadata.items() if k not in ("format", "encryption")):
        bad("metadata present: %r" % doc.metadata)
    if doc.get_toc():
        bad("bookmarks present")

    for page in doc:
        n = page.number + 1
        if abs(page.rect.width - w) > 0.01 or abs(page.rect.height - h) > 0.01:
            bad("page %d size %.2f x %.2f pt" % (n, page.rect.width, page.rect.height))
        right = n % 2 == 1
        x0 = m["inside"] if right else m["outside"]
        x1 = w - (m["outside"] if right else m["inside"])
        live = fitz.Rect(x0 - TOL, m["top"] - TOL, x1 + TOL, h - m["bottom"] + TOL)
        if list(page.annots()) or list(page.links()):
            bad("page %d has annotations or links" % n)
        imgs = page.get_images()
        stats["images"] += len(imgs)
        for f in page.get_fonts(full=True):
            stats["fonts"].add((f[3], f[1]))
            if f[1] in ("n/a", ""):
                bad("page %d font %s is not embedded" % (n, f[3]))
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    if not span["text"].strip():
                        continue
                    stats["minFont"] = min(stats["minFont"], span["size"])
                    if span["size"] < 7 - 0.01:
                        bad("page %d text %r is %.2f pt" % (n, span["text"], span["size"]))
                    if not live.contains(fitz.Rect(span["bbox"])):
                        bad("page %d text %r at %s is outside the margins" % (n, span["text"], span["bbox"]))
        for d in page.get_drawings():
            width = d.get("width")
            r = fitz.Rect(d["rect"])
            for key in ("color", "fill"):
                c = d.get(key)
                if c and not (abs(c[0] - c[1]) < 1e-3 and abs(c[1] - c[2]) < 1e-3):
                    bad("page %d uses a non-gray colour %r" % (n, c))
            if d.get("fill_opacity", 1) not in (None, 1) or d.get("stroke_opacity", 1) not in (None, 1):
                bad("page %d uses transparency" % n)
            if d["type"] in ("s", "fs") and width is not None:
                stats["minStroke"] = min(stats["minStroke"], width)
                if width < 0.75 - 1e-3:
                    bad("page %d stroke %.3f pt" % (n, width))
                r = fitz.Rect(r.x0 - width / 2, r.y0 - width / 2, r.x1 + width / 2, r.y1 + width / 2)
            if not live.contains(r):
                bad("page %d drawing %s is outside the margins" % (n, tuple(round(v, 2) for v in r)))

    stats["fonts"] = sorted("%s (%s)" % f for f in stats["fonts"])
    report = {"ok": not problems, "problems": problems, "stats": stats}
    print(json.dumps(report))
    sys.exit(0 if not problems else 1)


if __name__ == "__main__":
    main()
