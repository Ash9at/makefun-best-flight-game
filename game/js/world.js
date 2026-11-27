// world.js — the island of Skyward Post, generated once from a fixed seed.
//
// Everything the renderer and the flight model need to know about the
// ground lives here: the height field (one analytic function, sampled
// into a grid for drawing), the flattened runway strip and town plateau,
// the offshore carrier, the ring gates and the mail drop zones. North is
// -z, east is +x, heights are metres above the sea at y = 0.

// A small deterministic random source, so the island is the same island
// on every visit and every machine.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

// Smooth 0..1 blend between two edges, for coastlines and flattening.
function smooth(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// The runway: a 760 m strip running east-west, south of the town.
export const RUNWAY = { cx: 150, cz: 780, halfLen: 380, halfWid: 34, elev: 14, heading: Math.PI / 2 };
// The town plateau, and the carrier riding at anchor north-west.
export const TOWN = { cx: 620, cz: 120, r: 300, elev: 30 };
export const CARRIER = { cx: -1500, cz: -1250, deckY: 15, heading: 0.6, halfLen: 150, halfWid: 26 };

// Raw island shape before the man-made flattening: a broad volcanic cone
// with two hill shoulders, falling to a beach and then under the sea.
function islandHeight(x, z) {
  const d = Math.hypot(x, z);
  const cone = 168 * Math.exp(-(d * d) / (2 * 880 * 880));
  const hills =
    34 * Math.sin(x * 0.0042 + 1.7) * Math.cos(z * 0.0036 - 0.6) +
    16 * Math.sin(x * 0.0105 + 0.4) * Math.sin(z * 0.0091 + 2.1) +
    9 * Math.sin(x * 0.023 - 1.2) * Math.cos(z * 0.019 + 0.8);
  const land = cone + hills * clamp(cone / 60, 0, 1);
  const shore = smooth(1950, 1250, d); // 1 inland, 0 out at sea
  return lerp(-14, Math.max(land, 1.5), shore);
}

// Distance to the runway rectangle (0 when inside it).
function runwayBlend(x, z) {
  const dx = Math.max(Math.abs(x - RUNWAY.cx) - RUNWAY.halfLen, 0);
  const dz = Math.max(Math.abs(z - RUNWAY.cz) - RUNWAY.halfWid, 0);
  return smooth(150, 20, Math.hypot(dx, dz));
}

function townBlend(x, z) {
  return smooth(TOWN.r + 130, TOWN.r - 60, Math.hypot(x - TOWN.cx, z - TOWN.cz));
}

// Ground height anywhere: island, blended flat where people built things.
export function groundHeight(x, z) {
  let h = islandHeight(x, z);
  h = lerp(h, RUNWAY.elev, runwayBlend(x, z));
  h = lerp(h, TOWN.elev, townBlend(x, z));
  // The graded approaches: the strip was cut into a saddle, and its
  // approaches were graded with it — a 3% ramp falling away from each
  // end of the strip, so a pilot on a proper glide slope clears the
  // hills that guard the pocket. Only ever lowers the ground.
  const endDist = Math.abs(x - RUNWAY.cx) - RUNWAY.halfLen;
  const latDist = Math.abs(z - RUNWAY.cz);
  if (endDist > 0 && latDist < 130) {
    const blend = smooth(130, 55, latDist) * smooth(1050, 700, endDist);
    const ramp = RUNWAY.elev + endDist * 0.03;
    if (blend > 0 && ramp < h) h = lerp(h, ramp, blend);
  }
  return h;
}

// Is a point over the carrier's deck, and if so how high is the deck?
export function deckHeightAt(x, z) {
  const dx = x - CARRIER.cx;
  const dz = z - CARRIER.cz;
  const c = Math.cos(-CARRIER.heading);
  const s = Math.sin(-CARRIER.heading);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  if (Math.abs(lx) <= CARRIER.halfWid && Math.abs(lz) <= CARRIER.halfLen) return CARRIER.deckY;
  return null;
}

// The solid surface under a point: terrain, sea level, or the deck.
export function surfaceHeight(x, z) {
  const deck = deckHeightAt(x, z);
  if (deck !== null) return deck;
  return Math.max(groundHeight(x, z), 0);
}

// --- Terrain grid for the renderer -------------------------------------
export const GRID = { cell: 120, extent: 2520 };
GRID.n = Math.round((GRID.extent * 2) / GRID.cell); // cells per side
GRID.heights = null; // (n+1) x (n+1) corner heights
GRID.colors = null; // one fill colour per cell

function cellColor(h, slope, jitter) {
  let base;
  if (h < 3.5) base = [216, 192, 138]; // beach sand
  else if (h < 55) base = [96, 152, 74]; // meadow grass
  else if (h < 105) base = [66, 118, 58]; // high pasture
  else if (h < 140) base = [110, 104, 96]; // rock
  else base = [196, 198, 200]; // the pale summit
  if (slope > 0.85 && h >= 3.5) base = [104, 98, 90]; // steep faces go rocky
  const f = 0.92 + jitter * 0.16;
  return `rgb(${Math.round(base[0] * f)},${Math.round(base[1] * f)},${Math.round(base[2] * f)})`;
}

function buildGrid() {
  const { n, cell, extent } = GRID;
  const rng = makeRng(20261127);
  const heights = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      heights[j * (n + 1) + i] = groundHeight(-extent + i * cell, -extent + j * cell);
    }
  }
  const colors = new Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const h00 = heights[j * (n + 1) + i];
      const h10 = heights[j * (n + 1) + i + 1];
      const h01 = heights[(j + 1) * (n + 1) + i];
      const slope = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00)) / cell;
      colors[j * n + i] = cellColor((h00 + h10 + h01) / 3, slope, rng());
    }
  }
  GRID.heights = heights;
  GRID.colors = colors;
}

// --- Scenery: trees, town buildings, clouds ----------------------------
export const TREES = []; // {x, z, y, s} cones on the green slopes
export const BUILDINGS = []; // {x, z, y, w, d, h, tone} town boxes
export const CLOUDS = []; // {x, y, z, s} soft billboards

function buildScenery() {
  const rng = makeRng(977351);
  let guard = 0;
  while (TREES.length < 420 && guard++ < 6000) {
    const x = (rng() * 2 - 1) * 1900;
    const z = (rng() * 2 - 1) * 1900;
    const h = groundHeight(x, z);
    if (h < 6 || h > 118) continue;
    if (runwayBlend(x, z) > 0.05 || townBlend(x, z) > 0.25) continue;
    TREES.push({ x, z, y: h, s: 0.8 + rng() * 0.7 });
  }
  // The town of Port Sable: two loose streets of flat-roofed blocks.
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 7; col++) {
      if (rng() < 0.22) continue;
      const x = TOWN.cx - 210 + col * 68 + (rng() - 0.5) * 16;
      const z = TOWN.cz - 130 + row * 62 + (rng() - 0.5) * 14;
      BUILDINGS.push({
        x, z, y: TOWN.elev, w: 26 + rng() * 20, d: 24 + rng() * 16,
        h: 10 + rng() * 22, tone: rng(),
      });
    }
  }
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = 500 + rng() * 2600;
    CLOUDS.push({ x: Math.cos(a) * r, y: 400 + rng() * 170, z: Math.sin(a) * r, s: 90 + rng() * 150 });
  }
}

// --- The course furniture ----------------------------------------------
// Twelve rings for the Gate Circuit, flown in order around the island.
// Rings 4 and 8 hug the volcano's shoulders (their centres sit barely
// 35 m over the slope) and ring 10 grazes the south-west ridge: those
// three are thread-the-needle rings, and the routing between the high
// cruising rings and the low ones is part of the flying.
export const GATES = [
  { x: 0, y: 120, z: 1150, yaw: 0 },
  { x: 950, y: 150, z: 700, yaw: 0.9 },
  { x: 1350, y: 190, z: -250, yaw: 1.8 },
  { x: 520, y: 172, z: -420, yaw: 2.3 },
  { x: 800, y: 230, z: -1150, yaw: 2.6 },
  { x: -150, y: 260, z: -1450, yaw: 3.4 },
  { x: -1050, y: 200, z: -800, yaw: 4.2 },
  { x: -500, y: 170, z: -250, yaw: 4.7 },
  { x: -1350, y: 150, z: 250, yaw: 5.1 },
  { x: -700, y: 120, z: 1000, yaw: 5.8 },
  { x: -150, y: 100, z: 1420, yaw: 6.0 },
  { x: 450, y: 140, z: 1150, yaw: 0.4 },
];
export const GATE_RADIUS = 58;

// Three mail drop zones: the town green, the south farm, the lighthouse point.
export const DROP_ZONES = [
  { x: TOWN.cx - 40, z: TOWN.cz + 210, name: 'Port Sable green' },
  { x: -420, z: 1080, name: 'South farm field' },
  { x: 1180, z: 420, name: 'East lighthouse point' },
];
export const DROP_RADIUS = 46;
for (const zone of DROP_ZONES) zone.y = groundHeight(zone.x, zone.z);

// --- Landmarks: the island's named, recognisable furniture -------------
// The lighthouse on the east point, beside the third drop zone: a white
// tower with a red band, whose beam sweeps the water after dark. It is
// the first thing a pilot looks for coming in from the sea.
export const LIGHTHOUSE = { x: 1262, z: 468, h: 34 };
LIGHTHOUSE.y = groundHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);

// The forest fires of the firefighting sortie: two seats in the pine
// woods, west and south-east, each marked by its own smoke column. A
// water bag dropped into the painted ring douses the seat.
export const FIRES = [
  { x: -1050, z: 900, name: 'the west pine fire' },
  { x: 700, z: 1450, name: 'the south ridge fire' },
];
for (const fire of FIRES) fire.y = groundHeight(fire.x, fire.z);

// The south farm's fields: a patchwork of small plots below the farm
// drop zone, each a quad that follows the slope's corner heights, in
// the greens and golds of worked land.
export const FIELDS = [];
{
  const rng = makeRng(4177);
  const tones = [[122, 166, 74], [172, 158, 82], [96, 146, 66], [188, 172, 96], [110, 138, 70]];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      if (rng() < 0.18) continue;
      FIELDS.push({
        x: -640 + col * 118 + (rng() - 0.5) * 14,
        z: 1150 + row * 104 + (rng() - 0.5) * 12,
        w: 96 + rng() * 22, d: 82 + rng() * 18,
        yaw: (rng() - 0.5) * 0.35,
        tone: tones[Math.floor(rng() * tones.length)],
      });
    }
  }
}

// Roads a pilot can navigate by: the town to the strip, the strip on
// to the south farm, and the coast road out to the lighthouse point.
// Each road is a polyline the renderer ribbons onto the ground.
export const ROADS = [
  [[618, 210], [430, 430], [220, 640], [152, 742]],
  [[140, 800], [-90, 905], [-290, 1005], [-405, 1052]],
  [[700, 190], [905, 285], [1095, 380], [1172, 415]],
];

// --- Living water and air ----------------------------------------------
// Fishing boats putting along slow circular routes offshore. Their
// positions are pure functions of the clock, so every frame and every
// machine agrees where they are.
export const BOATS = [
  { cx: 1750, cz: 500, r: 300, speed: 0.021, phase: 0.6, dir: 1 },
  { cx: -1850, cz: -450, r: 340, speed: 0.016, phase: 2.9, dir: -1 },
  { cx: 500, cz: 1950, r: 260, speed: 0.024, phase: 4.4, dir: 1 },
];

// Where a boat is at time t, and the heading it steams on (the yaw
// whose local +z axis, as drawBox turns it, points along the motion).
export function boatPosition(boat, t) {
  const a = boat.phase + t * boat.speed * boat.dir;
  const x = boat.cx + Math.cos(a) * boat.r;
  const z = boat.cz + Math.sin(a) * boat.r;
  const vx = -Math.sin(a) * boat.dir;
  const vz = Math.cos(a) * boat.dir;
  return { x, z, heading: Math.atan2(-vx, vz) };
}

// The distressed boat of the Storm Rescue: engine dead south-east of the
// island, drifting in a slow, small circle on the swell, firing flares.
export const RESCUE_BOAT = { cx: 1520, cz: 1560, r: 26, speed: 0.05, phase: 1.2, dir: 1 };

export function rescueBoatPosition(t) {
  const a = RESCUE_BOAT.phase + t * RESCUE_BOAT.speed;
  return {
    x: RESCUE_BOAT.cx + Math.cos(a) * RESCUE_BOAT.r,
    z: RESCUE_BOAT.cz + Math.sin(a) * RESCUE_BOAT.r,
    heading: a + 0.8,
  };
}

// Two flocks of island birds working the thermals off the cone. Each
// bird rides the flock's circle with its own offset and flap phase.
export const FLOCKS = [
  { cx: 260, cy: 265, cz: -180, r: 150, speed: 0.11, phase: 0, n: 7 },
  { cx: -620, cy: 210, cz: 480, r: 190, speed: 0.09, phase: 2.4, n: 6 },
];

export function birdPosition(flock, i, t) {
  const a = flock.phase + t * flock.speed + i * 0.42;
  const rr = flock.r + Math.sin(i * 2.7) * 26;
  return {
    x: flock.cx + Math.cos(a) * rr,
    y: flock.cy + Math.sin(t * 0.9 + i * 1.7) * 7 + (i % 3) * 6,
    z: flock.cz + Math.sin(a) * rr,
    flap: t * 7 + i * 1.3,
  };
}

buildGrid();
buildScenery();
