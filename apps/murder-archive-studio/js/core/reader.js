/*
 * A forgiving reader for answers pasted from an AI chat.
 * Code fences, chatter around the answer, curly quotes, trailing commas, raw line breaks
 * inside strings and unquoted keys are all accepted.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};

  // ---------- forgiving reader ----------
  function Reader(src, pos) { this.s = src; this.p = pos; }
  Reader.prototype.fail = function () { throw new Error('unreadable at ' + this.p); };
  Reader.prototype.ws = function () {
    var s = this.s;
    for (;;) {
      var c = s[this.p];
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === ' ' || c === '﻿') { this.p++; continue; }
      if (c === '/' && s[this.p + 1] === '/') { while (this.p < s.length && s[this.p] !== '\n') this.p++; continue; }
      if (c === '/' && s[this.p + 1] === '*') { var e = s.indexOf('*/', this.p + 2); this.p = e < 0 ? s.length : e + 2; continue; }
      return c;
    }
  };
  Reader.prototype.value = function () {
    var c = this.ws();
    if (c === '{') return this.object();
    if (c === '[') return this.array();
    if (c === '"' || c === '“' || c === '”' || c === "'" || c === '‘' || c === '’') return this.string();
    if (c === '-' || (c >= '0' && c <= '9')) return this.number();
    var m = /^(true|false|null)\b/.exec(this.s.slice(this.p, this.p + 6));
    if (m) { this.p += m[1].length; return m[1] === 'true' ? true : m[1] === 'false' ? false : null; }
    // bare word value (e.g. word lists without quotes): read up to , ] }
    var start = this.p;
    while (this.p < this.s.length && !/[,\]}\n]/.test(this.s[this.p])) this.p++;
    var raw = this.s.slice(start, this.p).trim();
    if (!raw) this.fail();
    return raw;
  };
  Reader.prototype.object = function () {
    this.p++;
    var out = {};
    for (;;) {
      var c = this.ws();
      if (c === '}') { this.p++; return out; }
      if (c === ',') { this.p++; continue; }
      if (c === undefined) this.fail();
      var key;
      if (c === '"' || c === '“' || c === '”' || c === "'" || c === '‘' || c === '’') key = this.string(true);
      else {
        var m = /^[A-Za-z_$][\w$-]*/.exec(this.s.slice(this.p, this.p + 64));
        if (!m) this.fail();
        key = m[0]; this.p += key.length;
      }
      if (this.ws() !== ':') this.fail();
      this.p++;
      out[key] = this.value();
      c = this.ws();
      if (c === ',') { this.p++; continue; }
      if (c === '}') { this.p++; return out; }
      // missing comma between members: tolerate when the next thing looks like a key
      if (c === '"' || c === '“' || /[A-Za-z_]/.test(c || '')) continue;
      this.fail();
    }
  };
  Reader.prototype.array = function () {
    this.p++;
    var out = [];
    for (;;) {
      var c = this.ws();
      if (c === ']') { this.p++; return out; }
      if (c === ',') { this.p++; continue; }
      if (c === undefined) this.fail();
      out.push(this.value());
      c = this.ws();
      if (c === ',') { this.p++; continue; }
      if (c === ']') { this.p++; return out; }
      if (c === '{' || c === '"' || c === '“') continue; // missing comma
      this.fail();
    }
  };
  Reader.prototype.number = function () {
    var m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.s.slice(this.p, this.p + 40));
    if (!m) this.fail();
    this.p += m[0].length;
    return Number(m[0]);
  };
  // A closing quote only counts when what follows looks like the end of a value.
  Reader.prototype.closesHere = function (i, isKey) {
    var s = this.s, j = i + 1;
    while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\r' || s[j] === '\n')) j++;
    var n = s[j];
    if (n === undefined) return true;
    if (isKey) return n === ':';
    return n === ',' || n === '}' || n === ']' || n === ':';
  };
  Reader.prototype.string = function (isKey) {
    var s = this.s, open = s[this.p];
    var closers = open === '"' ? ['"', '”'] : (open === '“' || open === '”') ? ['”', '"', '“'] : ["'", '’'];
    this.p++;
    var out = '';
    while (this.p < s.length) {
      var c = s[this.p];
      if (c === '\\') {
        var n = s[this.p + 1];
        var map = { n: '\n', t: ' ', r: '', b: '', f: '', '"': '"', "'": "'", '\\': '\\', '/': '/' };
        if (n === 'u') { out += String.fromCharCode(parseInt(s.substr(this.p + 2, 4), 16) || 32); this.p += 6; continue; }
        out += map.hasOwnProperty(n) ? map[n] : n;
        this.p += 2; continue;
      }
      if (closers.indexOf(c) !== -1 && this.closesHere(this.p, isKey)) { this.p++; return out; }
      out += c;
      this.p++;
    }
    this.fail();
  };

  // Finds every top-level { ... } that reads cleanly, in order of appearance.
  function readObjects(text) {
    var src = String(text || '');
    var found = [];
    var i = 0, guard = 0;
    while (i < src.length && guard++ < 50) {
      var start = src.indexOf('{', i);
      if (start < 0) break;
      var obj = null, end = start + 1;
      try {
        // strict first, for speed and exactness, on the balanced slice
        var slice = balancedSlice(src, start);
        if (slice) { obj = JSON.parse(slice); end = start + slice.length; }
      } catch (e) { obj = null; }
      if (!obj) {
        try { var r = new Reader(src, start); obj = r.value(); end = r.p; } catch (e2) { obj = null; }
      }
      if (obj && typeof obj === 'object') { found.push(obj); i = end; }
      else i = start + 1;
    }
    // an answer that is just a list of chapters
    if (!found.length) {
      var a = src.indexOf('[');
      if (a >= 0) { try { var arr = new Reader(src, a).value(); if (Array.isArray(arr)) found.push({ chapters: arr }); } catch (e3) { /* ignore */ } }
    }
    return found;
  }

  function balancedSlice(src, start) {
    var depth = 0, inStr = false, esc = false;
    for (var i = start; i < src.length; i++) {
      var c = src[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1).replace(/,\s*([}\]])/g, '$1'); }
    }
    return null;
  }

  // Lower-case keys and a few common synonyms so small naming slips still import.
  var TOP_ALIASES = {
    title_options: 'titles', titleoptions: 'titles', booktitles: 'titles', book_titles: 'titles', title_ideas: 'titles',
    description: 'blurb', bookdescription: 'blurb', book_description: 'blurb', amazon_description: 'blurb',
    keyword: 'keywords', search_keywords: 'keywords', murderer: 'killer', culprit: 'killer', killername: 'killer',
    killer_name: 'killer', suspects: 'patrons', guests: 'patrons', patron_ledger: 'patrons', ledger: 'patrons',
    cluenotes: 'clue_notes', clues: 'clue_notes', clue_sources: 'clue_notes', notes: 'clue_notes',
    narrator: 'client', letter_writer: 'client', sender: 'client', intro: 'prologue', opening: 'prologue',
    the_letter: 'letter', envelope_letter: 'letter', ending: 'epilogue', reveal: 'epilogue', solution: 'epilogue'
  };
  var ITEM_ALIASES = {
    number: 'n', clue: 'n', clue_number: 'n', cluenumber: 'n', num: 'n', body: 'text', content: 'text',
    source: 'note', clue_note: 'note', story: 'note', description: 'who', role_in_story: 'role', occupation: 'role',
    full_name: 'name', fullname: 'name', heading: 'title'
  };
  function normalizeKeys(o, depth) {
    depth = depth || 0;
    if (depth > 6 || o == null) return o;
    if (Array.isArray(o)) return o.map(function (x) { return normalizeKeys(x, depth + 1); });
    if (typeof o !== 'object') return o;
    var aliases = depth === 0 ? TOP_ALIASES : ITEM_ALIASES;
    var out = {};
    Object.keys(o).forEach(function (k) {
      var lk = k.toLowerCase().trim().replace(/\s+/g, '_');
      var nk = aliases[lk] || aliases[lk.replace(/_/g, '')] || lk;
      if (out[nk] === undefined) out[nk] = normalizeKeys(o[k], depth + 1);
    });
    return out;
  }

  function pickAnswer(text, wantKeys) {
    var objs = readObjects(text).map(function (o) { return normalizeKeys(o); });
    if (!objs.length) return null;
    for (var i = 0; i < objs.length; i++) {
      for (var k = 0; k < wantKeys.length; k++) if (objs[i][wantKeys[k]] !== undefined) return objs[i];
      // an object nested one level down (e.g. { "book": { ... } })
      var vals = Object.keys(objs[i]).map(function (k2) { return objs[i][k2]; });
      for (var v = 0; v < vals.length; v++) {
        if (vals[v] && typeof vals[v] === 'object' && !Array.isArray(vals[v])) {
          for (var k3 = 0; k3 < wantKeys.length; k3++) if (vals[v][wantKeys[k3]] !== undefined) return vals[v];
        }
      }
    }
    return objs[0];
  }

  LK.reader = { readObjects: readObjects, normalizeKeys: normalizeKeys, pickAnswer: pickAnswer };
})(typeof window !== 'undefined' ? window : globalThis);
