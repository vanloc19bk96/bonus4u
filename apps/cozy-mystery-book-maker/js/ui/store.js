/* Undo and redo. The project is not saved in the browser: a reload starts a new book. */
(function (root) {
  'use strict';
  var Cozy = root.Cozy = root.Cozy || {};
  // Nothing is kept between visits: reloading the page starts a fresh book.
  // Clear the project that older versions autosaved, so it never comes back.
  try { root.localStorage.removeItem('cozyMysteryBookMaker.project.v1'); } catch (e) { /* ignore */ }

  // ---------- undo ----------
  var undoStack = [], redoStack = [], LIMIT = 60;
  function snapshot(project) {
    var copy = Object.assign({}, project);
    delete copy.cache;
    return JSON.stringify(copy);
  }
  function restore(snap, project) {
    var o = JSON.parse(snap);
    o.cache = project.cache; // puzzles are keyed by their inputs, so the cache stays valid
    return o;
  }
  // accepts a project, or a snapshot string taken before an edit began
  function push(project) {
    var s = typeof project === 'string' ? project : snapshot(project);
    if (undoStack.length && undoStack[undoStack.length - 1] === s) return;
    undoStack.push(s);
    if (undoStack.length > LIMIT) undoStack.shift();
    redoStack.length = 0;
  }
  function undo(project) {
    if (!undoStack.length) return null;
    redoStack.push(snapshot(project));
    return restore(undoStack.pop(), project);
  }
  function redo(project) {
    if (!redoStack.length) return null;
    undoStack.push(snapshot(project));
    return restore(redoStack.pop(), project);
  }
  function resetHistory() { undoStack.length = 0; redoStack.length = 0; }

  Cozy.store = {
    pushUndo: push, snapshot: snapshot, undo: undo, redo: redo, resetHistory: resetHistory,
    canUndo: function () { return undoStack.length > 0; }, canRedo: function () { return redoStack.length > 0; }
  };
})(window);
