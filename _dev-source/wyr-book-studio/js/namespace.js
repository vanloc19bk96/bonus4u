/* namespace.js — global namespace. Loaded first, before every other script.
   file:// blocks ES modules, so everything hangs off window.WYR instead. */
(function () {
  var W = (window.WYR = window.WYR || {});
  W.fonts = W.fonts || {};
  W.version = '1.0.0';
})();
