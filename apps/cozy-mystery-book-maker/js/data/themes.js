/* Theme suggestions. "Surprise me" picks one of the longer list using the book's seed. */
(function (root) {
  'use strict';
  var Cozy = root.Cozy = root.Cozy || {};
  var CHIPS = ['Bakery', 'Bookshop', 'Seaside inn', 'Christmas market', 'Garden club', 'Knitting circle'];
  var SURPRISE = [
    'Bakery', 'Bookshop', 'Seaside inn', 'Christmas market', 'Garden club', 'Knitting circle',
    'Tea room', 'Antique shop', 'Apple orchard', 'Quilting bee', 'Flower shop', 'Chocolate shop',
    'Library book sale', 'Pumpkin festival', 'Beekeeping farm', 'Village dog show', 'Community theater',
    'Cooking class', 'Ski lodge', 'Lakeside cabins', 'Vintage dress shop', 'Bed and breakfast',
    'Farmers market', 'Cat cafe', 'Country fair', 'Lighthouse village', 'Jam and pickle contest', 'Choir rehearsal'
  ];
  function isSurprise(theme) { return !theme || /^\s*surprise me\s*$/i.test(theme); }
  function resolve(theme, seed) {
    if (!isSurprise(theme)) return theme.trim();
    var r = Cozy.util.makeRng('theme|' + seed);
    return SURPRISE[r.int(SURPRISE.length)];
  }
  Cozy.themes = { CHIPS: CHIPS, SURPRISE: SURPRISE, isSurprise: isSurprise, resolve: resolve };
})(typeof window !== 'undefined' ? window : globalThis);
