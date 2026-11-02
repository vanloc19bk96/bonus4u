/*
 * What a chat model might send back, written by hand for the tests and the sample book: one story and
 * a pool of room writing that fits any puzzle type. Not a real ChatGPT reply, so watch for drift the
 * first time real replies go in.
 */
'use strict';

const ROOMS = ['The Grand Hall', 'The Long Library', 'The Music Room', 'The Glass Conservatory', 'The Portrait Gallery', 'The Cold Kitchen', 'The Wine Cellar', 'The Nursery', 'The Clock Tower', 'The Chapel', 'The Boathouse', 'The Map Room', 'The Silver Pantry', 'The Attic', 'The Gun Room', 'The Ice House'];

const WORDS = { 4: 'WELL', 5: 'CANDY', 6: 'SECRET', 7: 'LANTERN', 8: 'SUNSTONE', 9: 'CLOCKWORK', 10: 'BLACKTHORN', 11: 'CANDLESTICK', 12: 'HOUSEKEEPERS', 13: 'NIGHTWATCHMAN', 14: 'THE LAST CANDLE', 15: 'THE LOCKED CHAPEL', 16: 'THE SILVER LANTERN' };
const DECOYS = { 4: 'GATE,LOCK,DOOR,VEIL,MASK', 5: 'CANDLE,GHOST,BELLS,SHADE,CROWN', 6: 'LOCKET,MIRROR,SHADOW,VELVET,CANDLE', 7: 'CURTAIN,MANSION,PORTRAIT,COMPASS,LOCKETS', 8: 'MIDNIGHT,STAIRWAY,PORTRAIT,CHAMBERS,BLACKOUT', 9: 'NIGHTFALL,CANDLELIT,SECRETARY,GATEHOUSE,MOONLIGHT', 10: 'WHITETHORN,GOLDENROOM,STORMCLOUD,COPPERGATE,GREYMANTLE', 11: 'CANDLELIGHT,BLACKSMITHS,WATERCOLOUR,HOUSEMASTER,STAIRCASING', 12: 'CHAMBERMAIDS,GRANDFATHERS,CANDLEMAKERS,LANDSCAPINGS,HEADMISTRESS', 13: 'GRANDMOTHERLY,GATEKEEPERSON,HOUSEHOLDINGS,SCHOOLMASTERS,CANDLELIGHTED', 14: 'THELASTSHADOWS,THEGRANDBALLRM,THESECRETSTAIR,THEDARKCORRIDR,THEOLDCHANCELS', 15: 'THEHIDDENPORTAL,THEBLACKCURTAIN,THESILVERMIRROR,THEIRONCORRIDOR,THESTONEARCHWAY', 16: 'THEGOLDENCHAMBER,THEWINTERGARDENS,THEHOLLOWSTAIRCS,THEBURNINGCANDLE,THEFORGOTTENHALL' };

function story(rooms, finale) {
  const L = [];
  L.push('PREMISE: Lord Vex invites you to dinner at Blackthorn Manor, then vanishes as the doors lock. He staged it all to find out who can be trusted with the secret of the house.');
  L.push('YOU: A private investigator who came for a free dinner and an easy fee.');
  L.push('TITLE IDEAS:');
  L.push('The Last Guest at Blackthorn');
  L.push('One Night at Blackthorn Manor');
  L.push('Thirteen Candles');
  L.push('OPENING:');
  L.push('The invitation came in the rain, with no stamp and a wax seal. Dinner at Blackthorn Manor, it said, and a fee that made you read it twice.');
  L.push('You are the last to arrive. Twelve candles burn on a table laid for thirteen. Your host raises a glass, says your name, and the lights go out.');
  L.push('When they come back his chair is empty. Somewhere below you, one after another, you hear the doors of the house lock. A folded note lies on your plate: find your own way out.');
  L.push('ROOMS:');
  ROOMS.slice(0, rooms).forEach((n, i) => L.push((i + 1) + '. ' + n));
  if (finale === 'culprit') {
    L.push('SUSPECTS:');
    L.push('Eleanor Easton | The housekeeper of thirty years, who was left nothing in the will.');
    L.push('Henry Hargrave | A retired colonel who owes his host a great deal of money.');
    L.push('Rosalind Ricci | A singer who says she never met Lord Vex, though his letters say otherwise.');
    L.push('Percival Poole | The family doctor, who signed papers he should not have signed.');
    L.push('Sousa Sullivan | A young architect who knows every hidden passage in the house.');
    L.push('CULPRIT: Percival Poole');
    L.push('WRONG ENDING: The room goes quiet. Then someone laughs, and you know you have named the wrong person.');
  } else {
    L.push('FINAL WORD: ' + (WORDS[rooms] || 'LANTERN') + ' (' + rooms + ')');
    L.push('DECOYS: ' + (DECOYS[rooms] || DECOYS[7]).split(',').map((w) => w + ' (' + rooms + ')').join(', '));
    L.push('WORD CLUE: It is the first thing you lit in this house, and the last thing you will need.');
  }
  L.push('ENDING:');
  L.push('The last lock gives with a sound like a held breath let go. Cold air and the smell of rain come in through the crack.');
  L.push('Lord Vex is waiting on the drive with an umbrella, and he is smiling. He holds out the fee, and a second envelope, sealed with the same wax. You think about it for a long moment. Then you take them both.');
  L.push('DEAD END LINES:');
  L.push('A bell rings somewhere above you, once, and stops.');
  L.push('The candles in the hall all lean the same way, though there is no wind.');
  L.push('Behind the wall, something heavy is dragged a little closer.');
  L.push('The lock clicks twice and holds. You can almost hear it laughing.');
  L.push('Every clock in the house strikes the wrong hour.');
  L.push('A cold draft runs across your hands, and the handle will not turn.');
  L.push('Far below you, a door you already opened quietly locks again.');
  L.push('Your own footsteps go on for a moment after you have stopped.');
  L.push('CLOSING:');
  L.push('You got out, and most guests never do. Thank you for spending your evening at Blackthorn Manor. If you enjoyed the house, an honest review helps other guests find their way to the door.');
  L.push('BACK COVER:');
  L.push('Twelve candles. Thirteen places. One empty chair. You came to Blackthorn Manor for dinner and a fee, and now every door in the house is locked behind you. Crack the codes, read the rooms and find out why you were invited. All it takes is a pencil and a long, dark evening.');
  return L.join('\n');
}

const ENTER = ['You push through and the door swings shut behind you with a soft, final click. Dust hangs in the light of a single lamp. A long table runs down the middle of the room, and a heavy door stands at the far end, its brass lock covered in small dials.',
  'The air in here is colder, and it smells of old paper and candle smoke. Shelves climb into the dark on both sides. On the far wall a door with no handle waits, and beside it a little panel of numbered wheels.'];
const EXIT = ['The dials settle and something inside the door lets go. It swings open a hand’s width, and warm air reaches you from the passage beyond. You take the lamp and go on.',
  'A bolt slides back with a long, slow scrape. The door drifts open by itself. Whoever built this house has been expecting you, and that thought stays with you all the way down the passage.'];
const TITLES = ['The Butler’s Note', 'A Card Under the Lamp', 'The Scratched Panel', 'What the Maid Left', 'The Brass Plate', 'A Page Torn Out', 'The Tile Floor', 'Marks on the Wall', 'The Locked Drawer', 'The Velvet Case', 'The Old Ledger', 'A Stained Window'];
const STORY = ['It was tucked behind the lamp, where only a careful guest would look. Someone in this house wanted it found, but not too quickly.',
  'You find it where the dust has been disturbed. Somebody stood here not long ago, and they left in a hurry.',
  'The butler’s handwriting is neat, even here. Whatever he meant by it, he clearly thought it was worth hiding from his master.'];
const MSG = ['THE SPARE KEY IS IN DRAWER [N]', 'LOOK BEHIND PORTRAIT [N]', 'THE BOLT IS UNDER STONE [N]', 'COUNT TO [N] AND TURN'];
const SHORT = ['DRAWER [N]', 'STONE [N]', 'BOX [N]'];
const NAMES = ['Ada', 'Boris', 'Clara', 'Dmitri'];
const OBJECTS = ['silver ring', 'map', 'candle', 'letter'];
const SEARCH = ['CANDLE', 'MIRROR', 'SHADOW', 'LOCKET', 'PORTRAIT', 'STAIRS', 'ATTIC', 'CELLAR', 'VELVET', 'GARDEN'];

/* A reply for these rooms (from CX.plan.rooms), writing what each slot's type needs. */
function rooms(list, CX, opts) {
  opts = opts || {};
  const L = [];
  list.forEach((room) => {
    L.push('ROOM ' + room.no);
    L.push('NAME: ' + ROOMS[(room.no - 1) % ROOMS.length]);
    L.push('ENTER: ' + ENTER[room.no % 2]);
    L.push('EXIT: ' + EXIT[room.no % 2]);
    if (opts.evidence) L.push('EVIDENCE: A dated note in the study shows this person was on the far side of the house all evening.');
    room.slots.forEach((s, i) => {
      const k = CX.engine.kind(s.kind), n = room.no * 7 + i;
      L.push('PUZZLE ' + s.key);
      L.push('TITLE: ' + TITLES[n % TITLES.length] + ' ' + s.key.replace('.', '-'));
      L.push('STORY: ' + STORY[n % STORY.length]);
      k.needs.forEach((f) => {
        if (f === 'message') L.push('MESSAGE: ' + (k.short ? SHORT : MSG)[n % (k.short ? SHORT : MSG).length]);
        if (f === 'words') L.push('WORDS: ' + SEARCH.join(', '));
        if (f === 'people') L.push('PEOPLE: ' + NAMES.join(', '));
        if (f === 'objects') L.push('OBJECTS: ' + OBJECTS.join(', '));
        if (f === 'place') L.push('PLACE: locker');
        if (f === 'riddle') L.push('RIDDLE: I have a face but cannot smile.\nI have hands but cannot hold.\nI run all day and never leave the wall.');
        if (f === 'answer') L.push('ANSWER: A clock');
        if (f === 'wrong') L.push('WRONG: A mirror, A portrait, A river');
        if (f === 'hint') L.push('HINT: Listen to the room for a moment.');
        if (f === 'why') L.push('WHY: A clock has a face and hands, and it runs without moving.');
      });
    });
    L.push('');
  });
  return L.join('\n');
}

// How a chat model tends to drift: bold labels, a label alone on its line, numbering, chatter.
const MESSY = [
  'Sure! Here is the room you asked for:',
  '',
  '**ROOM 3: The Music Room**',
  '**ENTER:**',
  'You step inside.',
  '',
  'The piano lid is open.',
  '**EXIT:** The door opens.',
  '',
  '### Puzzle 3.1 (Shift code)',
  '**TITLE:** "The Butler\'s Note"',
  'STORY: It was behind the lamp.',
  'MESSAGE: "The spare key is in drawer [N]."',
  '',
  'PUZZLE 3.2 - The Grid',
  'STORY: On the wall.',
  'PEOPLE: 1. Ada, 2. Boris, Clara, Dmitri',
  'OBJECTS: a map, the ring, a key, a letter',
  'PLACE: A locker.',
  '',
  'Puzzle 3.3',
  'TITLE: Crate Words',
  'WORDS: candle, mirror, shadow, ...',
  'WRONG ANSWERS: A, B, C',
  '```',
  'Let me know if you want more!'
].join('\n');

module.exports = { story, rooms, MESSY, ROOMS, WORDS, DECOYS };
