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
// Eight rings for the Gate Circuit, flown in order around the island.
export const GATES = [
  { x: 0, y: 120, z: 1150, yaw: 0 },
  { x: 950, y: 150, z: 700, yaw: 0.9 },
  { x: 1350, y: 190, z: -250, yaw: 1.8 },
  { x: 800, y: 230, z: -1150, yaw: 2.6 },
  { x: -150, y: 260, z: -1450, yaw: 3.4 },
  { x: -1050, y: 200, z: -800, yaw: 4.2 },
  { x: -1350, y: 150, z: 250, yaw: 5.1 },
  { x: -700, y: 120, z: 1000, yaw: 5.8 },
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

buildGrid();
buildScenery();
