/*! prompt.js — prompt builder, batching, repair prompt. */
(function (global) {
  'use strict';

  var BATCH = 20;

  var DEFAULT_HOWTO_TITLES = [
    'Find the words',
    'Spot the repeated evidence',
    'Corner the killer',
    'Unscramble the leftover circles',
    'Name the room'
  ];

  var DEFAULT_HOWTO = [
    'Search each of the four scenes for the listed suspects and evidence. Circle every word you find. Words run in straight lines.',
    'Exactly one evidence word appears in two scenes. That repeated object is the weapon.',
    'The two scenes that hold the weapon share exactly one suspect. That person is the killer.',
    'Circled letters that do not sit inside a found word are leftover. Unscramble them to name the victim.',
    'The victim name also runs in a straight line through exactly one grid. That scene is the location.'
  ];

  function batchCount(total) {
    var n = Math.max(1, Math.ceil((Number(total) || 0) / BATCH));
    return n;
  }

  function batchRange(index, total) {
    var start = index * BATCH + 1;
    var end = Math.min(total, (index + 1) * BATCH);
    return { start: start, end: end, count: end - start + 1 };
  }

  function victimRule(difficulty) {
    if (difficulty === 'easy') return '5 to 6 letters once spaces are removed, max 2 words';
    if (difficulty === 'hard') return '8 to 9 letters once spaces are removed, max 2 words';
    return '7 letters once spaces are removed, max 2 words';
  }

  function suspectRule(difficulty) {
    if (difficulty === 'easy') return '5 to 7 letters';
    return '5 to 9 letters';
  }

  function evidenceRule(difficulty) {
    if (difficulty === 'easy') return '4 to 6 letters';
    return '4 to 8 letters';
  }

  function buildPrompt(opts) {
    var range = batchRange(opts.batchIndex || 0, opts.total);
    var theme = (opts.theme || 'vintage detective').trim() || 'vintage detective';
    var level = opts.readingLevel || 'adult';
    var diff = opts.difficulty || 'standard';
    return [
      'You are generating content for a murder mystery word search puzzle book.',
      'Return ONE fenced json code block. No commentary before or after it.',
      '',
      'Generate ' + range.count + ' cases, ids ' + range.start + ' to ' + range.end + '.',
      'Book theme: ' + theme + '. Reading level: ' + level + '.',
      '',
      'Rules for every case:',
      '- "theme": the setting, 1 to 3 words, unique across all cases.',
      '- "scenes": exactly 4 room or area names inside that setting. Max 14 characters each.',
      '- "suspects": exactly 6 occupation or role words, one word each, ' + suspectRule(diff) + ',',
      '  A to Z only, no spaces, no hyphens, all distinct.',
      '- "evidence": exactly 6 physical object words, one word each, ' + evidenceRule(diff) + ',',
      '  A to Z only, all distinct.',
      '- "victim": a person name, ' + victimRule(diff) + '.',
      '- "flavor": one sentence, max 120 characters, sets the scene. No spoilers.',
      '',
      'Hard constraints:',
      '- No word in suspects or evidence may contain another word from either list.',
      '- Do not reuse a suspect word or an evidence word across cases more than twice.',
      '- Do not name the killer, the weapon or the location anywhere. The app decides those.',
      '',
      'Output schema:',
      '{"version":1,"cases":[{"id":' + range.start + ',"theme":"Airport",',
      ' "scenes":["TERMINAL","CONTROL TOWER","LOUNGE","GATE 7"],',
      ' "suspects":["MECHANIC","STEWARD","MARSHAL","PILOT","CLERK","CAPTAIN"],',
      ' "evidence":["FLASK","POISON","WIRE","SYRINGE","KNIFE","BELT"],',
      ' "victim":"MRS GALE",',
      ' "flavor":"A body in the departures hall, twenty minutes before boarding."}]}'
    ].join('\n');
  }

  function buildRepairPrompt(quarantined) {
    var lines = [
      'Some cases failed validation. Return ONE fenced json code block with only the repaired cases.',
      'Keep the same ids. Fix only what is listed.',
      ''
    ];
    quarantined.forEach(function (item) {
      lines.push('Case ' + item.id + ': ' + (item.messages || []).join(' '));
    });
    lines.push('');
    lines.push('Use the same schema as before. No commentary.');
    return lines.join('\n');
  }

  global.MMPrompt = {
    BATCH: BATCH,
    DEFAULT_HOWTO: DEFAULT_HOWTO,
    DEFAULT_HOWTO_TITLES: DEFAULT_HOWTO_TITLES,
    batchCount: batchCount,
    batchRange: batchRange,
    buildPrompt: buildPrompt,
    buildRepairPrompt: buildRepairPrompt
  };
})(typeof window !== 'undefined' ? window : globalThis);
