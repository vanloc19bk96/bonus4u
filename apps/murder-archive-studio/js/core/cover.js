/*
 * The paperback cover: back, spine and front on one sheet, at the exact size KDP asks for
 * (trim size, page count, white paper, 0.125 in bleed on every side). Drawn from the same
 * simple items as the interior, plus color, ellipses and rotated spine text:
 *   { t:'text', ..., color?, angle? }  { t:'rect', ..., color? (fill) | stroke? }
 *   { t:'line', ..., color? }          { t:'ellipse', cx, cy, rx, ry, lw, stroke? | color? }
 *   { t:'poly', pts:[x,y,...], closed?, color? (fill) | stroke?, lw?, round? }
 * Text may carry hs, a horizontal scale (0.6-1) that gives the condensed poster look of the
 * titles on bestselling covers from the bundled fonts. The front of the cover is drawn by its
 * design (js/core/cover-designs.js); the back and spine are shared and take the design's colors.
 * Every word sits inside KDP's safe area, and the barcode corner of the back is kept clear.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};
  var U = LK.util, KDP = LK.kdp, R = LK.register;
  var PT = 72;
  var F;

  var STYLES = {
    classic: { label: 'Classic red', frame: '#8E1F1F', panel: '#F4EAD5', ink: '#1B1A17', accent: '#8E1F1F', mark: '#B3261E', onFrame: '#F4EAD5', head: '#1B1A17', headInk: '#F4EAD5', band: '#E7D9BB' },
    noir: { label: 'Noir gold', frame: '#0D0E11', panel: '#18191E', ink: '#EFE7D6', accent: '#D1A84C', mark: '#D1A84C', onFrame: '#D1A84C', head: '#D1A84C', headInk: '#18191E', band: '#24262D' },
    royal: { label: 'Royal blue', frame: '#143F8F', panel: '#F4EAD5', ink: '#14161C', accent: '#143F8F', mark: '#B3261E', onFrame: '#F4EAD5', head: '#14161C', headInk: '#F4EAD5', band: '#E3D7BD' },
    emerald: { label: 'Emerald', frame: '#1E5A3A', panel: '#F3EBD8', ink: '#16181A', accent: '#1E5A3A', mark: '#B3261E', onFrame: '#F3EBD8', head: '#16181A', headInk: '#F3EBD8', band: '#E2D8BE' },
    casefile: { label: 'Case file', frame: '#2A2A2A', panel: '#E6CD93', ink: '#1A1A1A', accent: '#A3271B', mark: '#A3271B', onFrame: '#E6CD93', head: '#1A1A1A', headInk: '#E6CD93', band: '#D8BC7E' }
  };

  // A cover design by id: one of the designs in js/core/cover-designs.js, or one of the five
  // original register styles above (which keep their exact look for saved projects).
  function template(id) {
    var D = LK.coverDesigns, d = D && D.get(id);
    if (d) return d;
    var key = STYLES[id] ? id : 'classic';
    return { id: key, label: STYLES[key].label, layout: 'register', pal: STYLES[key] };
  }

  function r2(v) { return Math.round(v * 100) / 100; }
  function lum(hex) {
    return [1, 3, 5].map(function (i) { var v = parseInt(hex.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce(function (a, v, i) { return a + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  // the color, or a blend of it toward the ink, that reads on the background
  function readable(c, bg, ink) {
    for (var t = 0; t <= 1.001; t += 0.1) {
      var m = '#' + [1, 3, 5].map(function (i) {
        var a = parseInt(c.substr(i, 2), 16), b = parseInt(ink.substr(i, 2), 16), v = Math.round(a + (b - a) * t);
        return (v < 16 ? '0' : '') + v.toString(16);
      }).join('').toUpperCase();
      if (t === 0) m = c;
      if (contrast(m, bg) >= 3.2) return m;
    }
    return ink;
  }
  function txt(str, font) { return LK.metrics.printable(String(str), F[font]); }
  function width(str, size, font, ls, hs) { return F[font].width(txt(str, font), size, ls || 0) * (hs || 1); }

  function Sheet(W, H) { this.W = W; this.H = H; this.items = []; }
  Sheet.prototype.rect = function (x, y, w, h, color) { this.items.push({ t: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), color: color }); };
  Sheet.prototype.frame = function (x, y, w, h, color, lw) { this.items.push({ t: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), stroke: color, lw: lw || 1 }); };
  Sheet.prototype.line = function (x1, y1, x2, y2, color, w, cap) {
    var it = { t: 'line', x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), w: w || 1, color: color };
    if (cap) it.cap = true;
    this.items.push(it);
  };
  Sheet.prototype.ellipse = function (cx, cy, rx, ry, stroke, lw, fill) {
    var it = { t: 'ellipse', cx: r2(cx), cy: r2(cy), rx: r2(rx), ry: r2(ry), lw: lw || 1 };
    if (fill) it.color = fill; else it.stroke = stroke;
    this.items.push(it);
  };
  Sheet.prototype.text = function (str, x, y, size, font, color, angle, hs) {
    var s = txt(str, font);
    if (!s) return 0;
    var it = { t: 'text', x: r2(x), y: r2(y), size: r2(size), font: font, str: s, color: color };
    if (angle) it.angle = angle;
    if (hs && hs !== 1) it.hs = r2(hs);
    this.items.push(it);
    return F[font].width(s, size) * (hs || 1);
  };
  // pts: flat [x0, y0, x1, y1, ...]; a fill color, or a stroke color with a line width
  Sheet.prototype.poly = function (pts, fill, stroke, lw, closed, round) {
    var it = { t: 'poly', pts: pts.map(r2), closed: closed !== false };
    if (fill) it.color = fill; else { it.stroke = stroke; it.lw = lw || 1; }
    if (round) it.round = true;
    this.items.push(it);
  };
  // letterspaced, each glyph placed on its own so the preview and the PDF agree
  Sheet.prototype.spaced = function (str, x, y, size, font, color, ls, align, hs) {
    hs = hs || 1;
    var s = txt(str, font), total = F[font].width(s, size, ls) * hs;
    if (align === 'center') x -= total / 2; else if (align === 'right') x -= total;
    for (var i = 0; i < s.length; i++) {
      if (s[i] !== ' ') {
        var it = { t: 'text', x: r2(x), y: r2(y), size: r2(size), font: font, str: s[i], color: color };
        if (hs !== 1) it.hs = r2(hs);
        this.items.push(it);
      }
      x += (F[font].width(s[i], size) + ls) * hs;
    }
    return total;
  };
  Sheet.prototype.center = function (str, cx, y, size, font, color, hs) {
    return this.text(str, cx - width(str, size, font, 0, hs) / 2, y, size, font, color, 0, hs);
  };
  Sheet.prototype.right = function (str, rx, y, size, font, color, hs) {
    return this.text(str, rx - width(str, size, font, 0, hs), y, size, font, color, 0, hs);
  };

  function wrap(str, size, font, maxW) {
    var words = String(str).split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur && width(t, size, font) > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // The biggest size at which a short line fits the width, capped. lsK: letterspacing as a share of the size.
  function fitSize(str, font, maxW, cap, lsK, hs) {
    var w1 = (width(str, 1, font) + (lsK ? lsK * str.length : 0)) * (hs || 1);
    return Math.min(cap, w1 ? maxW / w1 : cap);
  }

  // Title words split into 1-4 lines, choosing the split that prints the title biggest.
  // o: { font, hs (horizontal scale), lead (line height per size), keepCase, minLines, maxLines }
  function titleLines(title, maxW, maxH, cap, o) {
    o = o || {};
    var font = o.font || 'serifBold', hs = o.hs || 1, lead = o.lead || 1.02;
    var src = o.keepCase ? title : title.toUpperCase();
    var words = src.split(/\s+/).filter(Boolean);
    var best = { lines: [src], size: 10 };
    var lo = Math.min(o.minLines || 1, words.length);
    for (var n = lo; n <= Math.min(o.maxLines || 4, words.length); n++) {
      var splits = partitions(words, n);
      splits.forEach(function (lines) {
        var widest = Math.max.apply(null, lines.map(function (l) { return width(l, 1, font, 0, hs); }));
        var size = Math.min(cap, maxW / widest, maxH / (n * lead));
        if (size > best.size + 0.01) best = { lines: lines, size: size };
      });
    }
    return best;
  }
  function partitions(words, n) {
    if (n === 1) return [[words.join(' ')]];
    var out = [];
    for (var k = 1; k <= words.length - n + 1; k++) {
      partitions(words.slice(k), n - 1).forEach(function (rest) { out.push([words.slice(0, k).join(' ')].concat(rest)); });
    }
    return out.slice(0, 400);
  }

  // ---------- icons (simple line drawings) ----------
  function iconTicket(sh, cx, cy, s, c, bg) {
    var w = s * 1.25, h = s * 0.7, x = cx - w / 2, y = cy - h / 2;
    sh.frame(x, y, w, h, c, 1.6);
    sh.ellipse(x, cy, h * 0.17, h * 0.17, c, 1.6, bg);
    sh.ellipse(x + w, cy, h * 0.17, h * 0.17, c, 1.6, bg);
    sh.rect(x - h * 0.2, cy - h * 0.13, h * 0.2, h * 0.26, bg);
    sh.rect(x + w, cy - h * 0.13, h * 0.2, h * 0.26, bg);
    for (var yy = y + 3; yy < y + h - 2; yy += 5) sh.line(x + w * 0.3, yy, x + w * 0.3, yy + 2.5, c, 1.2);
    sh.line(x + w * 0.42, cy - h * 0.12, x + w * 0.85, cy - h * 0.12, c, 1.4);
    sh.line(x + w * 0.42, cy + h * 0.12, x + w * 0.72, cy + h * 0.12, c, 1.4);
  }
  function iconEnvelope(sh, cx, cy, s, c) {
    var w = s * 1.2, h = s * 0.78, x = cx - w / 2, y = cy - h / 2;
    sh.frame(x, y, w, h, c, 1.6);
    sh.line(x, y, cx, cy + h * 0.08, c, 1.6, true);
    sh.line(x + w, y, cx, cy + h * 0.08, c, 1.6, true);
  }
  function iconLens(sh, cx, cy, s, c) {
    var r = s * 0.3;
    sh.ellipse(cx - s * 0.1, cy - s * 0.1, r, r, c, 2);
    sh.line(cx - s * 0.1 + r * 0.72, cy - s * 0.1 + r * 0.72, cx + s * 0.42, cy + s * 0.42, c, 3, true);
  }
  function iconList(sh, cx, cy, s, c) {
    var w = s * 0.82, h = s * 1.02, x = cx - w / 2, y = cy - h / 2;
    sh.frame(x, y, w, h, c, 1.6);
    for (var i = 1; i <= 4; i++) sh.line(x + w * 0.18, y + h * i / 5.2, x + w * (i === 4 ? 0.6 : 0.82), y + h * i / 5.2, c, 1.3);
  }
  function iconShip(sh, cx, cy, s, c) {
    var w = s * 1.3, y = cy + s * 0.08;
    sh.line(cx - w / 2, y, cx + w / 2, y, c, 1.6, true);
    sh.line(cx - w / 2, y, cx - w * 0.36, y + s * 0.3, c, 1.6, true);
    sh.line(cx + w / 2, y, cx + w * 0.36, y + s * 0.3, c, 1.6, true);
    sh.line(cx - w * 0.36, y + s * 0.3, cx + w * 0.36, y + s * 0.3, c, 1.6, true);
    sh.frame(cx - w * 0.3, y - s * 0.26, w * 0.6, s * 0.26, c, 1.4);
    sh.frame(cx - w * 0.06, y - s * 0.52, w * 0.16, s * 0.26, c, 1.4);
  }
  function iconKey(sh, cx, cy, s, c) {
    var r = s * 0.2;
    sh.ellipse(cx - s * 0.36, cy, r, r, c, 1.8);
    sh.line(cx - s * 0.16, cy, cx + s * 0.5, cy, c, 1.8, true);
    sh.line(cx + s * 0.36, cy, cx + s * 0.36, cy + s * 0.18, c, 1.6, true);
    sh.line(cx + s * 0.5, cy, cx + s * 0.5, cy + s * 0.22, c, 1.6, true);
  }
  function iconPhone(sh, cx, cy, s, c) {
    var w = s * 0.56, h = s * 1.0;
    sh.frame(cx - w / 2, cy - h / 2, w, h, c, 1.6);
    sh.line(cx - w * 0.3, cy - h * 0.36, cx + w * 0.3, cy - h * 0.36, c, 1.2);
    sh.line(cx - w * 0.3, cy + h * 0.32, cx + w * 0.3, cy + h * 0.32, c, 1.2);
    sh.ellipse(cx, cy + h * 0.41, 1.4, 1.4, c, 1, c);
  }
  function iconPin(sh, cx, cy, s, c) {
    var r = s * 0.3, top = cy - s * 0.18;
    sh.ellipse(cx, top, r, r, c, 1.8);
    sh.ellipse(cx, top, r * 0.32, r * 0.32, c, 1.2);
    sh.line(cx - r * 0.86, top + r * 0.5, cx, cy + s * 0.5, c, 1.8, true);
    sh.line(cx + r * 0.86, top + r * 0.5, cx, cy + s * 0.5, c, 1.8, true);
  }
  function iconBadge(sh, cx, cy, s, c) {
    var w = s * 0.82, h = s * 1.02, x = cx - w / 2, y = cy - h / 2;
    sh.frame(x, y, w, h, c, 1.6);
    sh.ellipse(cx, y + h * 0.36, w * 0.17, w * 0.17, c, 1.4);
    sh.line(x + w * 0.22, y + h * 0.68, x + w * 0.78, y + h * 0.68, c, 1.3);
    sh.line(x + w * 0.3, y + h * 0.82, x + w * 0.7, y + h * 0.82, c, 1.3);
  }
  var ICONS = { ticket: iconTicket, list: iconList, ship: iconShip, key: iconKey, phone: iconPhone, pin: iconPin, badge: iconBadge };

  function iconLock(sh, cx, cy, s, c, bg) {
    var w = s * 0.8, h = s * 0.55;
    sh.ellipse(cx, cy - h * 0.25, w * 0.3, s * 0.38, c, 2);
    sh.rect(cx - w / 2, cy - h * 0.25, w, h + 2, bg);
    sh.frame(cx - w / 2, cy - h * 0.2, w, h, c, 1.8);
    sh.ellipse(cx, cy + h * 0.2, 2.2, 2.2, c, 1, c);
  }

  // ---------- the cover ----------
  /*
   * project, cs (the case), book (the interior layout, for its page count).
   * Returns { W, H, items, guides: { bleed, spineX0, spineX1, safe[], barcode }, spine, spineText, style }.
   */
  function layout(project, cs, book) {
    F = F || LK.metrics.load();
    var setup = project.setup, story = project.story || {};
    var tpl = template(setup.cover && setup.cover.style), st = tpl.pal;
    var trim = KDP.trim(setup.trim);
    var dims = KDP.cover(setup.trim, book.pageCount);
    var bleed = KDP.COVER_BLEED * PT, tw = trim.w * PT, th = trim.h * PT, spine = dims.spine * PT;
    var W = bleed * 2 + tw * 2 + spine, H = bleed * 2 + th;
    var sh = new Sheet(W, H);
    var t = cs.type, u = t.unit, lot = t.id === 'lottery';
    var N = cs.records.length.toLocaleString('en-US'), K = cs.clues.length;
    var one = 'One ' + t.target.who.replace(/^the /, '') + '.';
    var title = LK.book.title(project) || 'Your Book Title';
    var author = (setup.author || '').trim() || 'Author Name';
    var cv = setup.cover || {};
    var kicker = (cv.kicker || 'An elimination murder mystery puzzle').toUpperCase();
    var line = (cv.line || N + ' ' + u.many + '. ' + K + ' clues. ' + one).toUpperCase();
    var question = (cv.question || 'Can you find ' + t.target.who + '?').toUpperCase();

    var backX = bleed, spineX = bleed + tw, frontX = bleed + tw + spine;
    sh.rect(0, 0, W, H, st.frame);

    var inset = 0.3 * PT, band = 0.6 * PT;
    function panel(x0) {
      var p = { x: x0 + inset, y: bleed + band, w: tw - inset * 2, h: th - band - inset };
      sh.rect(p.x, p.y, p.w, p.h, st.panel);
      sh.frame(p.x + 5, p.y + 5, p.w - 10, p.h - 10, st.ink, 0.75);
      return p;
    }

    // ---------- front ----------
    var pad = 0.3 * PT;
    var ks = fitSize(kicker, 'sansBold', tw - inset * 2 - 16, 10.5, 0.16);
    var design = tpl.layout !== 'register' && LK.coverDesigns && LK.coverDesigns.fronts[tpl.layout];
    if (design) {
      design({
        sh: sh, kit: KIT, pal: st, tpl: tpl, opt: tpl.opt || {}, x: frontX, y: bleed, w: tw, h: th, bleed: bleed, W: W, H: H,
        title: title, author: author, kicker: kicker, line: line, question: question, N: N, K: K, one: one,
        cs: cs, type: t, unit: u, project: project, rng: U.makeRng('front:' + project.seed + ':' + tpl.id)
      });
    } else registerFront();
    function registerFront() {
    var fp = panel(frontX);
    var cx = fp.x + fp.w / 2, inner = fp.w - pad * 2;
    sh.spaced(kicker, frontX + tw / 2, bleed + band * 0.62, ks, 'sansBold', st.onFrame, ks * 0.16, 'center');
    var y = fp.y + pad + 4;
    var tl = titleLines(title, inner, fp.h * 0.36, 0.95 * PT);
    tl.lines.forEach(function (l, i) {
      y += tl.size * 0.82;
      sh.center(l, cx, y, tl.size, 'serifBold', i === tl.lines.length - 1 && tl.lines.length > 1 ? st.accent : st.ink);
      y += tl.size * 0.2;
    });
    y += 10;
    sh.line(fp.x + pad, y, fp.x + fp.w - pad, y, st.ink, 1.4);
    y += 4;
    sh.line(fp.x + pad, y, fp.x + fp.w - pad, y, st.ink, 0.6);
    var ls = fitSize(line, 'sansBold', inner, 14.5, 0.05);
    y += ls * 1.75;
    sh.spaced(line, cx, y, ls, 'sansBold', st.ink, ls * 0.05, 'center');
    var qs = fitSize(question, 'sansBold', inner * 0.9, ls * 1.05, 0.05);
    y += qs * 1.45;
    sh.spaced(question, cx, y, qs, 'sansBold', st.mark, qs * 0.05, 'center');
    y += qs * 1.1;

    // author at the foot of the panel
    var as = fitSize(author.toUpperCase(), 'serifBold', inner * 0.8, 15, 0.12);
    var authorY = fp.y + fp.h - pad - 2;
    sh.spaced(author.toUpperCase(), cx, authorY, as, 'serifBold', st.ink, as * 0.12, 'center');

    // a slice of the real register, one row redacted and circled
    var avail = authorY - as * 2.2 - y - 8;
    var rows = 7, rowH = Math.min(22, avail / (rows + 1.6));
    if (rowH > 9) registerSnippet(sh, st, cs, cx, y + (avail - rowH * (rows + 1)) / 2 + 2, inner, rowH, rows, project.seed);
    }

    // ---------- spine ----------
    var spineGuide = null;
    var capH = F.sansBold.capHeight || 0.66;
    // KDP keeps 0.0625 in clear on each side of spine text; below 7 pt the spine stays plain
    var sp = Math.min(14, (spine - 0.125 * PT) / capH * 0.9);
    if (dims.spineText && sp >= KDP.MIN_FONT_PT) {
      var stitle = title.toUpperCase(), sauth = author.toUpperCase();
      var room = th - 1.1 * PT;
      // the pen name prints a little smaller than the title, but never under 7 pt
      var sa = function (z) { return Math.max(KDP.MIN_FONT_PT, z * 0.82); };
      var len = function (z) { return width(stitle, z, 'sansBold') + width(sauth, sa(z), 'serifBold') + z * 2.2; };
      for (var guard = 0; guard < 40 && len(sp) > room && sp > KDP.MIN_FONT_PT; guard++) sp = Math.max(KDP.MIN_FONT_PT, sp * Math.max(0.9, room / len(sp)));
      if (len(sp) <= room) {
        var bx = spineX + spine / 2 - sp * capH / 2;
        var y0 = bleed + (th - len(sp)) / 2;
        sh.text(stitle, bx, y0, sp, 'sansBold', st.onFrame, -90);
        sh.text(sauth, bx + (sp - sa(sp)) * capH / 2, y0 + width(stitle, sp, 'sansBold') + sp * 2.2, sa(sp), 'serifBold', st.onFrame, -90);
        spineGuide = { x: spineX + 0.0625 * PT, y: bleed + 0.125 * PT, w: spine - 0.125 * PT, h: th - 0.25 * PT };
      }
    }

    // ---------- back ----------
    // a front made for a dark ground can carry an accent too pale for the light back panel
    st = Object.assign({}, st, { accent: readable(st.accent, st.panel, st.ink), mark: readable(st.mark, st.panel, st.ink) });
    var bp = panel(backX);
    var bcx = bp.x + bp.w / 2, binner = bp.w - pad * 2;
    var barcode = { x: backX + tw - 0.25 * PT - 2 * PT, y: bleed + th - 0.25 * PT - 1.2 * PT, w: 2 * PT, h: 1.2 * PT };
    var backKick = lot ? 'EVERY TICKET IS A SUSPECT' : t.coverBack;
    var bks = Math.min(ks, fitSize(backKick, 'sansBold', tw - 16, 10.5, 0.16));
    sh.spaced(backKick, backX + tw / 2, bleed + band * 0.62, bks, 'sansBold', st.onFrame, bks * 0.16, 'center');
    var by = bp.y + pad;
    var head = N + ' ' + u.many + '. ' + K + ' clues. ' + one;
    var hs = fitSize(head.toUpperCase(), 'sansBold', binner, 15, 0.04);
    by += hs * 1.1;
    sh.spaced(head.toUpperCase(), bcx, by, hs, 'sansBold', st.accent, hs * 0.04, 'center');
    by += hs * 0.9;
    sh.line(bp.x + pad, by, bp.x + bp.w - pad, by, st.ink, 0.75);
    by += 12;
    // features row near the bottom, above the barcode corner
    var featTop = barcode.y - 0.95 * PT;
    var blurb = story.blurb || 'Your book description appears here once the story is in. It tells readers what happened, who is asking for their help, and how the puzzle works, without giving the killer away.';
    var paras = blurb.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var claim = 'No riddles. No guessing. Just you, a pencil and the evidence.';
    // what is inside the book: shown when the description leaves room for it at a readable size
    var has = function (k) { return LK.book.hasPage(project, k); };
    var chaptered = setup.registerMode !== 'list' && t.hasChapters(cs.setting);
    var inside = [
      lot ? 'The complete register: ' + N + ' tickets' + (chaptered ? ', told hour by hour in chapters' : '')
        : 'The complete ' + t.archive.name + ': ' + N + ' ' + u.many + (chaptered ? ', in chapters' : ''),
      K + ' clues, every one needed, and exactly one answer',
      setup.checkpoints || has('hints') ? (has('hints') ? 'Two hints for every clue' : 'Checkpoints') + (setup.checkpoints && has('hints') ? ' and a checkpoint after each one' : '') : null,
      has('practice') ? 'A two-minute practice case to learn the method' : null,
      has('verdict') ? 'A verdict cipher: check your answer with no spoilers' : null,
      has('cards') ? 'Cut-out clue cards' + (setup.notesPages ? ' and detective’s notes pages' : '') : null
    ].filter(Boolean);
    var ins = 9, insLead = ins * 1.55, insH = ins * 2.6 + inside.length * insLead + 14;
    function fitBlurb(room) {
      for (var size = 11; size >= 7.5; size -= 0.25) {
        var ls2 = [];
        paras.forEach(function (p, i) { if (i) ls2.push(null); ls2 = ls2.concat(wrap(p, size, 'serif', binner)); });
        var hgt = ls2.reduce(function (a, l) { return a + (l === null ? size * 0.55 : size * 1.38); }, 0);
        if (hgt <= room) return { size: size, lines: ls2, h: hgt };
      }
      return null;
    }
    var room2 = featTop - by - 34;
    var fitted = fitBlurb(room2 - insH);
    var showInside = !!(fitted && fitted.size >= 9);
    if (!showInside) fitted = fitBlurb(room2) || fitBlurb(1e9);
    var bs = fitted.size;
    fitted.lines.forEach(function (l) {
      if (l === null) { by += bs * 0.55; return; }
      by += bs * 1.38;
      sh.text(l, bp.x + pad, by - bs * 0.3, bs, 'serif', st.ink);
    });
    if (showInside) {
      var iy = by + (featTop - 34 - by - insH) / 2 + 10;
      sh.line(bp.x + pad, iy, bp.x + bp.w - pad, iy, st.ink, 0.6);
      iy += ins * 2.1;
      sh.spaced('INSIDE THE CASE FILE', bp.x + pad, iy, ins * 0.95, 'sansBold', st.accent, ins * 0.1);
      iy += ins * 0.4;
      inside.forEach(function (t) {
        iy += insLead;
        sh.rect(bp.x + pad, iy - ins * 0.62, ins * 0.5, ins * 0.5, st.accent);
        sh.text(t, bp.x + pad + ins * 1.1, iy, ins, 'sans', st.ink);
      });
    }
    var cs2 = Math.min(bs * 1.05, fitSize(claim, 'serifBold', binner, 11));
    by = Math.max(by + cs2 * 1.6, featTop - 16);
    sh.center(claim, bcx, Math.min(by, featTop - 8), cs2, 'serifBold', st.accent);

    // features: icons with labels, left of the barcode corner
    var feats = [
      { icon: ICONS[t.icon] || iconList, label: N + ' ' + (u.many.length > 11 ? 'RECORDS' : u.many.toUpperCase()) },
      { icon: iconEnvelope, label: K + ' CLUES' },
      { icon: iconLens, label: '1 ' + t.target.who.replace(/^the /, '').toUpperCase() }
    ];
    if (LK.book.hasPage(project, 'verdict')) feats.push({ icon: iconLock, label: 'VERDICT CIPHER' });
    var fw = (barcode.x - 8 - (bp.x + pad)) / feats.length;
    var longest = feats.reduce(function (a, f) { return width(f.label, 1, 'sansBold') > width(a, 1, 'sansBold') ? f.label : a; }, '');
    var isz = Math.min(0.42 * PT, fw * 0.5), fs = Math.min(7.5, fitSize(longest, 'sansBold', fw - 4, 7.5));
    fs = Math.max(KDP.MIN_FONT_PT, fs);
    feats.forEach(function (f, i) {
      var fx = bp.x + pad + fw * i + fw / 2, fy = featTop + isz * 0.75 + 6;
      f.icon(sh, fx, fy, isz, st.ink, st.panel);
      sh.center(f.label, fx, fy + isz * 0.5 + fs * 2, fs, 'sansBold', st.ink);
    });
    // pen name, small, bottom left of the back
    var ps = 8.5;
    sh.text(author, bp.x + pad, bp.y + bp.h - pad + 2, ps, 'serif', st.ink);

    var safeIn = 0.125 * PT;
    var guides = {
      bleed: bleed, spineX0: spineX, spineX1: spineX + spine,
      safe: [
        { x: backX + safeIn, y: bleed + safeIn, w: tw - safeIn * 2, h: th - safeIn * 2 },
        { x: frontX + safeIn, y: bleed + safeIn, w: tw - safeIn * 2, h: th - safeIn * 2 }
      ].concat(spineGuide ? [spineGuide] : []),
      barcode: barcode
    };
    return { W: W, H: H, items: sh.items, guides: guides, spine: dims.spine, spineText: !!spineGuide, style: st, template: tpl.id, dims: dims };
  }

  function registerSnippet(sh, st, cs, cx, top, tableW, rowH, rows, seed) {
    var rng = U.makeRng('cover:' + seed);
    var t = cs.type, cols;
    if (t.id === 'lottery') cols = [['ticket', 'TICKET #'], ['time', 'TIME'], ['place', cs.venue.placeShort], ['amount', 'PAID'], ['method', 'METHOD']];
    else cols = t.columns(cs).map(function (c) { return [c.key, c.head]; });
    var start = rng.int(Math.max(1, cs.records.length - rows - 1));
    var data = [];
    for (var i = start; data.length < rows && i < cs.records.length; i++) if (i !== cs.killerIndex) data.push(t.row(cs.records[i], cs));
    // as many columns as fit the panel at a readable size
    var fs0 = Math.max(KDP.MIN_FONT_PT, Math.min(rowH * 0.5, 11));
    while (cols.length > 1) {
      var need = cols.reduce(function (a, c) {
        var w = width(c[1], fs0 * 0.84, 'sansBold', 0.4);
        data.forEach(function (r) { w = Math.max(w, width(r[c[0]], fs0, 'sans')); });
        return a + w + 6;
      }, 0);
      if (need <= tableW) break;
      cols = cols.slice(0, -1);
    }
    var fs = Math.max(KDP.MIN_FONT_PT, Math.min(rowH * 0.5, 11)), hfs = Math.max(KDP.MIN_FONT_PT, fs * 0.84);
    var widths = cols.map(function (c) {
      var w = width(c[1], hfs, 'sansBold', 0.4);
      data.forEach(function (r) { w = Math.max(w, width(r[c[0]], fs, 'sans')); });
      return w;
    });
    var natural = widths.reduce(function (a, b) { return a + b; }, 0);
    if (natural + cols.length * 6 > tableW) tableW = natural + cols.length * 6;
    var gap = (tableW - natural) / cols.length;
    var x0 = cx - tableW / 2;
    sh.rect(x0, top, tableW, rowH, st.head);
    var x = x0 + gap / 2;
    cols.forEach(function (c, ci) {
      sh.spaced(c[1], x + widths[ci] / 2, top + rowH * 0.66, hfs, 'sansBold', st.headInk, 0.4, 'center');
      x += widths[ci] + gap;
    });
    var redact = Math.floor(rows / 2), struck = [0, 1, rows - 2];
    data.forEach(function (r, ri) {
      var y = top + rowH * (ri + 1);
      if (ri % 2 === 1) sh.rect(x0, y, tableW, rowH, st.band);
      var xx = x0 + gap / 2;
      cols.forEach(function (c, ci) {
        if (ri === redact) sh.rect(xx + widths[ci] * 0.12, y + rowH * 0.27, widths[ci] * 0.76, rowH * 0.46, st.ink);
        else sh.center(r[c[0]], xx + widths[ci] / 2, y + rowH * 0.68, fs, 'sans', st.ink);
        xx += widths[ci] + gap;
      });
      if (struck.indexOf(ri) !== -1) sh.line(x0 + 4, y + rowH * 0.52, x0 + tableW - 4, y + rowH * 0.52, st.ink, 0.9);
    });
    sh.line(x0, top + rowH * (data.length + 1), x0 + tableW, top + rowH * (data.length + 1), st.ink, 0.75);
    var ry = top + rowH * (redact + 1.5);
    sh.ellipse(cx, ry, tableW * 0.55, rowH * 0.95, st.mark, 2.2);
    sh.ellipse(cx + 1.5, ry - 0.8, tableW * 0.54, rowH * 0.88, st.mark, 1.1);
  }

  // Words outside the safe areas, or inside the barcode corner. Returns a list of problems.
  function audit(cv) {
    F = F || LK.metrics.load();
    var out = [], g = cv.guides;
    function inside(b, r) { return b.x >= r.x - 0.5 && b.y >= r.y - 0.5 && b.x + b.w <= r.x + r.w + 0.5 && b.y + b.h <= r.y + r.h + 0.5; }
    function overlaps(b, r) { return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y; }
    cv.items.forEach(function (it) {
      if (it.t !== 'text') return;
      var f = F[it.font], w = f.width(it.str, it.size) * (it.hs || 1);
      // spine text is all capitals: it reaches cap height above the baseline, nothing below
      var b;
      if (it.angle === -90) b = { x: it.x, y: it.y, w: f.capHeight * it.size, h: w };
      else if (it.angle) {
        // the box around the turned glyph box (angles turn counterclockwise, y points down)
        var a = it.angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        var xs = [], ys = [];
        [[0, -f.ascent * it.size], [w, -f.ascent * it.size], [0, f.descent * it.size], [w, f.descent * it.size]].forEach(function (p) {
          xs.push(it.x + p[0] * ca + p[1] * sa); ys.push(it.y - p[0] * sa + p[1] * ca);
        });
        b = { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys) };
        b.w = Math.max.apply(null, xs) - b.x; b.h = Math.max.apply(null, ys) - b.y;
      } else b = { x: it.x, y: it.y - f.ascent * it.size, w: w, h: (f.ascent + f.descent) * it.size };
      if (!g.safe.some(function (r) { return inside(b, r); })) out.push('“' + it.str + '” is outside the safe area');
      if (overlaps(b, g.barcode)) out.push('“' + it.str + '” is in the barcode area');
      if (it.size < KDP.MIN_FONT_PT - 0.01) out.push('“' + it.str + '” is smaller than 7 pt');
    });
    return out.slice(0, 6);
  }

  var KIT = {
    PT: PT, Sheet: Sheet, width: width, fitSize: fitSize, titleLines: titleLines, wrap: wrap, registerSnippet: registerSnippet,
    icons: ICONS, iconEnvelope: iconEnvelope, iconLens: iconLens, iconLock: iconLock,
    font: function (k) { return F[k]; }, txt: txt
  };

  LK.cover = { STYLES: STYLES, template: template, layout: layout, audit: audit, kit: KIT };
})(typeof window !== 'undefined' ? window : globalThis);
