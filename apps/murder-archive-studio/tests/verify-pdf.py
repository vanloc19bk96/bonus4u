"""Checks a generated PDF the way KDP's previewer would: page size, embedded fonts, margins.
Usage: python tests/verify-pdf.py book.pdf [png_dir page,page,...]"""
import sys, fitz
path = sys.argv[1]
doc = fitz.open(path)
sizes = set((round(p.rect.width, 2), round(p.rect.height, 2)) for p in doc)
print('pages', len(doc), 'sizes (pt)', sizes)
fonts = {}
for p in doc:
    for f in p.get_fonts(full=True):
        fonts[f[3]] = (f[1], f[2])
for name, (ext, kind) in fonts.items():
    print('font', name, ext, kind, 'EMBEDDED' if ext in ('ttf', 'otf', 'cff', 'pfa', 'pfb') or ext not in ('n/a', '') else 'NOT EMBEDDED')
# text outside the trim minus 0.25in (KDP hard minimum)
bad = 0
for p in doc:
    w, h = p.rect.width, p.rect.height
    for b in p.get_text('dict')['blocks']:
        x0, y0, x1, y1 = b['bbox']
        if x0 < 18 or y0 < 18 or x1 > w - 18 or y1 > h - 18:
            bad += 1
print('text blocks closer than 0.25in to an edge:', bad)
if len(sys.argv) > 3:
    out = sys.argv[2]
    for n in sys.argv[3].split(','):
        pix = doc[int(n) - 1].get_pixmap(dpi=110)
        pix.save('%s/page-%s.png' % (out, n))
    print('rendered', sys.argv[3])
