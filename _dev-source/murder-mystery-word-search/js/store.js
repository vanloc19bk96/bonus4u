/*! store.js — project save/open via file download only. */
(function (global) {
  'use strict';

  var LEGACY_KEY = 'mm-word-search-project-v1';

  function clearLegacyAutosave() {
    try {
      if (global.localStorage) global.localStorage.removeItem(LEGACY_KEY);
    } catch (err) { /* file:// may block storage */ }
  }

  function exportProject(state) {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      settings: state.settings,
      cases: state.cases,
      quarantined: state.quarantined,
      seed: state.settings && state.settings.seed
    };
  }

  function downloadProject(state) {
    var blob = new Blob([JSON.stringify(exportProject(state), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (global.MMLayout ? global.MMLayout.slug(state.settings.bookTitle) : 'murder-search') + '-project.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  function readFile(file, done) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        done(null, JSON.parse(String(reader.result || '')));
      } catch (err) {
        done(new Error('That file is not a readable project.'));
      }
    };
    reader.onerror = function () { done(new Error('Could not read that file.')); };
    reader.readAsText(file);
  }

  global.MMStore = {
    clearLegacyAutosave: clearLegacyAutosave,
    downloadProject: downloadProject,
    readFile: readFile,
    exportProject: exportProject
  };
})(typeof window !== 'undefined' ? window : globalThis);
