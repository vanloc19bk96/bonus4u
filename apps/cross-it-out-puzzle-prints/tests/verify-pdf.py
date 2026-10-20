"""Deep PDF check for tests/run.js: page size and count, embedded fonts, real text, cover size.
Usage: python verify-pdf.py interior.pdf W H pages cover.pdf CW CH  (sizes in points)"""
import sys
import fitz

f, W, H, n, cf, CW, CH = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4]), sys.argv[5], float(sys.argv[6]), float(sys.argv[7])
problems = []
d = fitz.open(f)
if d.page_count != n:
    problems.append('page count %d, expected %d' % (d.page_count, n))
for i, pg in enumerate(d):
    r = pg.rect
    if abs(r.width - W) > 0.05 or abs(r.height - H) > 0.05:
        problems.append('page %d is %.2f x %.2f' % (i + 1, r.width, r.height))
        break
fonts = set()
for i in range(d.page_count):
    for ft in d.get_page_fonts(i):
        fonts.add((ft[3], ft[1]))
if not fonts:
    problems.append('no fonts')
for name, ext in fonts:
    if ext not in ('ttf', 'otf', 'cff', 'n/a') and not ext:
        problems.append('font %s not embedded' % name)
for name, ext in fonts:
    if 'Source' not in name:
        problems.append('unexpected font %s' % name)
text = d[2].get_text()
if 'Welcome' not in text:
    problems.append('page 3 text not extractable: %r' % text[:60])
c = fitz.open(cf)
cr = c[0].rect
if c.page_count != 1 or abs(cr.width - CW) > 0.05 or abs(cr.height - CH) > 0.05:
    problems.append('cover is %.2f x %.2f, expected %.2f x %.2f' % (cr.width, cr.height, CW, CH))
print('\n'.join(problems) if problems else 'OK %d pages, fonts: %s' % (d.page_count, ', '.join(sorted(n for n, e in fonts))))
