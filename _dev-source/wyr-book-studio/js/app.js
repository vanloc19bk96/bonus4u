/* app.js — startup. Checks the pieces that must be present and hands over
   to the UI. The app keeps nothing between visits: every load starts on an
   empty project. */
(function () {
  var W = window.WYR;

  function missing() {
    var problems = [];
    if (!(window.jspdf && window.jspdf.jsPDF)) {
      problems.push('The PDF library did not load (lib/jspdf.umd.min.js).');
    }
    var wanted = ['Baloo2-Bold', 'Nunito-Regular', 'Nunito-Bold', 'Nunito-Italic'];
    for (var i = 0; i < wanted.length; i++) {
      if (!W.fonts[wanted[i]]) problems.push('Missing font file: fonts/' + wanted[i] + '.');
    }
    return problems;
  }

  function fail(problems) {
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:24px;' +
      'background:#fff;z-index:999;font:14px/1.6 system-ui,sans-serif;text-align:center';
    box.innerHTML = '<div><h2 style="margin:0 0 8px">Some app files are missing</h2>' +
      '<p style="color:#555">' + problems.join('<br>') + '</p>' +
      '<p style="color:#888">Make sure you unzipped the whole folder and opened ' +
      '<code>index.html</code> from inside it.</p></div>';
    document.body.appendChild(box);
  }

  function start() {
    var problems = missing();
    if (problems.length) { fail(problems); return; }

    W.state.onChange(function (data, reason) {
      // Anything that changes the printed book redraws the preview.
      if (reason === 'questions' || reason === 'book' || reason === 'layout' ||
          reason === 'import' || reason === 'sample' || reason === 'reset') {
        W.ui.scheduleLayout();
      }
    });

    W.ui.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else start();
})();
