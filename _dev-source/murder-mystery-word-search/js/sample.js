/*! sample.js — three valid cases so the app opens with content. */
(function (global) {
  'use strict';

  var SAMPLE_CASES = [
    {
      id: 1,
      theme: 'Airport',
      scenes: ['TERMINAL', 'CONTROL TOWER', 'LOUNGE', 'GATE 7'],
      suspects: ['MECHANIC', 'STEWARD', 'MARSHAL', 'PILOT', 'CLERK', 'CAPTAIN'],
      evidence: ['FLASK', 'POISON', 'WIRE', 'SYRINGE', 'KNIFE', 'BELT'],
      victim: 'MRS GALE',
      flavor: 'A body in the departures hall, twenty minutes before boarding.'
    },
    {
      id: 2,
      theme: 'Museum',
      scenes: ['GALLERY', 'ARCHIVE', 'FOYER', 'VAULT'],
      suspects: ['CURATOR', 'GUARD', 'DOCENT', 'VALET', 'JANITOR', 'TRUSTEE'],
      evidence: ['ROPE', 'CHISEL', 'GLOVE', 'VIAL', 'HAMMER', 'CORD'],
      victim: 'MR HALE',
      flavor: 'The night bell rang once. By dawn a patron was missing from the ledger.'
    },
    {
      id: 3,
      theme: 'Manor',
      scenes: ['LIBRARY', 'PARLOR', 'CELLAR', 'ATTIC'],
      suspects: ['BUTLER', 'MAID', 'COOK', 'GARDENER', 'NIECE', 'LAWYER'],
      evidence: ['CANDLE', 'POKER', 'LACE', 'SPADE', 'NEEDLE', 'FLASK'],
      victim: 'LADY FOX',
      flavor: 'Rain on the east wing windows, and a will that nobody would sign.'
    }
  ];

  global.MMSample = {
    version: 1,
    cases: SAMPLE_CASES
  };
})(typeof window !== 'undefined' ? window : globalThis);
