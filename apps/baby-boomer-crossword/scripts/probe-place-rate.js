'use strict';

const { parseWordList } = require('../src/parser');
const { generateCrossword } = require('../src/crossword');

// Hard thematic lists similar to user's Route 66 style (long compounds)
const HARD = `
SPRINGFIELD | Capital city along the route
KINGMAN | Arizona stop for travelers
WINSLOW | Arizona town in a famous lyric
SEDONA | Red rock destination nearby
GALLUP | New Mexico trading town
BLANKET | Warm cover for cool nights
SPEAKER | Roadside radio voice
TICKET | Stub for the next attraction
FAMILY | Relatives on vacation together
DOUBLE | Twin beds at the motel
ROADSIDE | Beside the highway
EXHIBIT | Museum display case
DETOUR | Forced alternate path
STATUE | Roadside figure of note
GUARDRAIL | Metal barrier on curves
CROSSWALK | Painted path for pedestrians
MILEAGE | Distance shown on the odometer
ROUTE | Numbered highway path
DINER | Chrome lunch counter
MAP | Folded paper guide
RADIO | Dashboard music box
TRAIL | Path for explorers
MOTEL | Overnight roadside rooms
DESERT | Dry open country
CANYON | Deep rock gorge
`;

const EASY = `
ROUTE | Numbered highway path
DINER | Chrome lunch counter
MAP | Folded paper guide
RADIO | Dashboard music box
TRAIL | Path for explorers
MOTEL | Overnight roadside rooms
DESERT | Dry open country
CANYON | Deep rock gorge
NEON | Bright roadside glow
SIGN | Painted highway marker
CAFE | Small meal stop
TRUCK | Heavy road vehicle
GAS | Fuel for the tank
TOWN | Small settlement stop
BRIDGE | Span over a river
HILL | Gentle rise in the road
`;

function run(label, raw, grid) {
  const { entries } = parseWordList(raw, grid);
  const t0 = Date.now();
  const result = generateCrossword(entries, grid, 424242);
  const ms = Date.now() - t0;
  console.log(
    `${label}: ${result.placed.length}/${entries.length} placed, ` +
      `${result.unplaced.length} skipped, ${result.rows}x${result.cols}, ${ms}ms`
  );
  if (result.unplaced.length) console.log('  unplaced:', result.unplaced.join(', '));
}

run('HARD@15', HARD, 15);
run('EASY@15', EASY, 15);
run('EASY@13', EASY, 13);
