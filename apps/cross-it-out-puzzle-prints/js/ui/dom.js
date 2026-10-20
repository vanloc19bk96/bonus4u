/* Small DOM helpers: element builder, copy with "Copied" feedback, toast, confirm dialog, downloads. */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    append(el, children);
    return el;
  }
  function append(el, children) {
    if (children == null) return;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copyText(text, btn) {
    function done(ok) {
      if (!btn) return;
      if (!ok) { toast('Copying was blocked by the browser. Select the text and press Ctrl+C.'); return; }
      var label = btn.getAttribute('data-label') || btn.textContent;
      btn.setAttribute('data-label', label);
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      clearTimeout(btn._copyTimer);
      btn._copyTimer = setTimeout(function () { btn.textContent = label; btn.classList.remove('copied'); }, 2000);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText && root.isSecureContext !== false) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
        return;
      }
    } catch (e) { /* fall through */ }
    done(fallbackCopy(text));
  }

  function copyButton(label, getText, cls) {
    var b = h('button', { type: 'button', class: cls || 'btn' }, label);
    b.addEventListener('click', function () { copyText(typeof getText === 'function' ? getText() : getText, b); });
    return b;
  }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  // Confirm dialog (used only before data would be discarded). Resolves with the chosen value.
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var back = document.getElementById('modal');
      var prevFocus = document.activeElement;
      document.getElementById('modalTitle').textContent = opts.title;
      var body = document.getElementById('modalBody');
      body.innerHTML = '';
      (Array.isArray(opts.body) ? opts.body : [opts.body]).forEach(function (p) { body.appendChild(h('p', null, p)); });
      var acts = document.getElementById('modalActions');
      acts.innerHTML = '';
      function close(v) {
        back.hidden = true;
        document.removeEventListener('keydown', onKey, true);
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(v);
      }
      var buttons = opts.actions.map(function (a) {
        var b = h('button', { type: 'button', class: a.primary ? 'btn btn-primary' : (a.danger ? 'btn danger-text' : 'btn') }, a.label);
        b.addEventListener('click', function () { close(a.value); });
        acts.appendChild(b);
        return b;
      });
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
        if (e.key === 'Tab') {
          var first = buttons[0], last = buttons[buttons.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener('keydown', onKey, true);
      back.hidden = false;
      (buttons.find(function (b, i) { return !opts.actions[i].danger; }) || buttons[0]).focus();
    });
  }

  function download(data, filename, type) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }

  function debounce(fn, ms) {
    var t;
    var d = function () { var args = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, args); }, ms); };
    d.flush = function () { clearTimeout(t); fn(); };
    d.cancel = function () { clearTimeout(t); };
    return d;
  }

  // Registers the bundled fonts for the preview and the interface.
  function registerFonts() {
    if (!root.FontFace || !document.fonts) return Promise.resolve();
    var info = CX.metrics.FONT_INFO, data = root.CX_FONT_DATA;
    var loads = Object.keys(info).map(function (key) {
      var bytes = CX.metrics.b64ToBytes(data[key].data);
      var ff = new FontFace(info[key].css, bytes.buffer);
      document.fonts.add(ff);
      return ff.load().catch(function () { return null; });
    });
    return Promise.all(loads);
  }

  CX.dom = { h: h, append: append, copyText: copyText, copyButton: copyButton, toast: toast, confirm: confirmDialog, download: download, debounce: debounce, registerFonts: registerFonts };
})(window);
