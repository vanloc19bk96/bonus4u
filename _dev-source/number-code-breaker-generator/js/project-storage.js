/*
 * project-storage.js — last-used form settings.
 *
 * localStorage only remembers the form so a reload does not lose your setup.
 * The generated puzzles are never persisted; every generation is a fresh draw.
 */
(function (global) {
  'use strict';

  var C = global.NCB_CONST;

  var SETTINGS_KEY = 'ncb.settings.v2';

  function isObject(value) { return value !== null && typeof value === 'object'; }

  function saveSettings(book) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        version: C.PROJECT_FILE_VERSION,
        meta: book.meta,
        print: book.print,
        frontMatter: book.frontMatter,
        puzzleSettings: book.puzzleSettings,
        answers: book.answers
      }));
    } catch (err) {
      // Private browsing or a full quota: settings simply are not remembered.
    }
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!isObject(data) || data.version !== C.PROJECT_FILE_VERSION) return null;
      if (data.print && !C.KDP_TRIM_SIZES[data.print.trimSizeId]) return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  function clearSettings() {
    try { localStorage.removeItem(SETTINGS_KEY); } catch (err) { /* nothing to do */ }
  }

  global.NCB_STORAGE = {
    SETTINGS_KEY: SETTINGS_KEY,
    saveSettings: saveSettings,
    loadSettings: loadSettings,
    clearSettings: clearSettings
  };
})(window);
