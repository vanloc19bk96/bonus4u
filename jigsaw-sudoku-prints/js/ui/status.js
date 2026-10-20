/*
 * status.js: the sticky footer. One status at a time (creating puzzles, a blocking
 * problem, building the PDF, or ready), an optional action (Cancel / Resume), and the full
 * list of KDP checks when the status line is opened.
 */
(function () {
  'use strict';
  window.KS = window.KS || {};

  function $(id) { return document.getElementById(id); }
  var ICON = { pass: '✓', auto: '✓', fail: '✕', warn: '!', pending: '…' };

  function Status() {
    this.action = null;
    var self = this;
    $('status-toggle').addEventListener('click', function () {
      var open = $('status-toggle').getAttribute('aria-expanded') !== 'true';
      $('status-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
      $('checks').hidden = !open;
    });
    $('status-action').addEventListener('click', function () { if (self.action) self.action.run(); });
  }

  // model: { tone: 'busy' | 'ok' | 'bad' | 'idle', text, progress: 0..1 | null,
  //          action: { label, run } | null, checks: [...], canDownload }
  Status.prototype.render = function (model) {
    if ($('status-text').textContent !== model.text) $('status-text').textContent = model.text;
    $('status-dot').className = 'dot ' + model.tone;
    var bar = $('progress');
    bar.hidden = model.progress == null;
    if (model.progress != null) $('progress-bar').style.width = Math.round(model.progress * 1000) / 10 + '%';
    this.action = model.action;
    var btn = $('status-action');
    btn.hidden = !model.action;
    if (model.action) btn.textContent = model.action.label;
    $('download').disabled = !model.canDownload;
    this.renderChecks(model.checks);
  };

  Status.prototype.renderChecks = function (checks) {
    var ul = $('checks-list'), html = '';
    checks.forEach(function (c) {
      html += '<li class="s-' + c.status + '"><span class="icon-status" aria-hidden="true">' + ICON[c.status] + '</span>' +
        '<b>' + esc(c.label) + '<span class="visually-hidden"> (' + c.status + ')</span></b>' +
        (c.message ? '<small>' + esc(c.message) + '</small>' : '') + '</li>';
    });
    if (ul.innerHTML !== html) ul.innerHTML = html;
  };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  KS.Status = Status;
})();
