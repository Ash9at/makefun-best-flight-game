// renderer.js — the hand-rolled 3D view: one canvas, one projector.
//
// No engine and no library: the camera (camera.js) builds an
// orthonormal basis each frame, world points are dotted onto it and
// divided by depth, and flat-shaded polygons are painted far to near.
// The terrain grid colours are precomputed in world.js, so a frame is
// projection and fills only. Particles live in particles.js.

import { Camera } from './camera.js';
import { GRID, TREES, BUILDINGS, CLOUDS, RUNWAY, CARRIER, GATES, GATE_RADIUS, DROP_ZONES, DROP_RADIUS, BOATS, boatPosition, FLOCKS, birdPosition, groundHeight, LIGHTHOUSE, FIELDS, ROADS } from './world.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);


const SUN = { x: -0.45, y: 0.62, z: -0.66 }; // toward the afternoon sun

// Port Sable roof colours, indexed by each building's tone.
const ROOFS = [[168, 84, 60], [96, 106, 118], [178, 120, 80], [150, 148, 140]];

function shade(hex, n, sunFacing) {
  // hex like [r,g,b]; sunFacing -1..1 darkens or warms the face.
  const f = 0.72 + 0.28 * clamp(sunFacing, -1, 1);
  return `rgb(${Math.round(hex[0] * f)},${Math.round(hex[1] * f)},${Math.round(hex[2] * f)})`;
}


// Draw one flat polygon from projected points.
function poly(ctx, pts, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

// A box in the world: centre, half extents, yaw, three tones by face.
function drawBox(ctx, cam, w, h, cx, cy, cz, hx, hy, hz, yaw, tones) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const corner = (lx, ly, lz) => ({
    x: cx + lx * c - lz * s,
    y: cy + ly,
    z: cz + lx * s + lz * c,
  });
  const v = [
    corner(-hx, -hy, -hz), corner(hx, -hy, -hz), corner(hx, -hy, hz), corner(-hx, -hy, hz),
    corner(-hx, hy, -hz), corner(hx, hy, -hz), corner(hx, hy, hz), corner(-hx, hy, hz),
  ].map((p) => cam.project(p.x, p.y, p.z, w, h));
  if (v.some((p) => p === null)) return;
  const faces = [
    { idx: [4, 5, 6, 7], tone: tones.top },
    { idx: [0, 1, 5, 4], tone: tones.side },
    { idx: [1, 2, 6, 5], tone: tones.end },
    { idx: [2, 3, 7, 6], tone: tones.side },
    { idx: [3, 0, 4, 7], tone: tones.end },
  ];
  for (const f of faces) poly(ctx, f.idx.map((i) => v[i]), f.tone);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = new Camera();
    this.cells = []; // scratch: visible terrain cells per frame
  }

  drawSkyAndSea(w, h, storm = false) {
    const ctx = this.ctx;
    const cam = this.cam;
    // Where does the horizon fall on screen?
    const horizon = cam.project(cam.x + cam.f.x * 4000, cam.y + cam.f.y * 4000 - cam.y * 0 + 0, cam.z + cam.f.z * 4000, w, h);
    let hy = horizon ? horizon.y : h / 2;
    hy = clamp(hy, -h * 0.4, h * 1.2);
    const night = !!this.night;
    const sky = ctx.createLinearGradient(0, -h * 0.2, 0, Math.max(hy, 1));
    if (night) {
      sky.addColorStop(0, '#050914');
      sky.addColorStop(0.55, '#0e1c31');
      sky.addColorStop(1, '#2b405c');
    } else if (storm) {
      sky.addColorStop(0, '#232f3a');
      sky.addColorStop(0.55, '#54626d');
      sky.addColorStop(1, '#93a3ab');
    } else {
      sky.addColorStop(0, '#2d5a8f');
      sky.addColorStop(0.55, '#7db1dd');
      sky.addColorStop(1, '#dceef8');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, Math.max(hy, 0));
    const sea = ctx.createLinearGradient(0, Math.max(hy, 0), 0, h);
    if (night) {
      sea.addColorStop(0, '#1a2a3a');
      sea.addColorStop(0.25, '#101e2c');
      sea.addColorStop(1, '#08131d');
    } else if (storm) {
      sea.addColorStop(0, '#5d6f76');
      sea.addColorStop(0.25, '#33454f');
      sea.addColorStop(1, '#1d2c36');
    } else {
      sea.addColorStop(0, '#7fa8bd');
      sea.addColorStop(0.25, '#3f7296');
      sea.addColorStop(1, '#27536f');
    }
    ctx.fillStyle = sea;
    ctx.fillRect(0, Math.max(hy, 0), w, h - Math.max(hy, 0));
    if (night) {
      // Stars: fixed screen-space field above the horizon, hashed so
      // they never swim between frames; and a pale moon riding high.
      ctx.fillStyle = 'rgba(220,232,248,0.85)';
      for (let i = 0; i < 150; i++) {
        const hx = Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
        const hy2 = Math.abs(Math.sin(i * 269.5 + 183.3) * 28001.8384) % 1;
        const sx = hx * w, sy = hy2 * Math.max(hy, 0) * 0.92;
        if (sy > hy - 2) continue;
        ctx.globalAlpha = 0.25 + 0.6 * ((i * 37) % 10) / 10;
        ctx.fillRect(sx, sy, (i % 7 === 0) ? 2 : 1, (i % 7 === 0) ? 2 : 1);
      }
      ctx.globalAlpha = 1;
      const moon = cam.project(cam.x - SUN.x * 5000, cam.y + 3400, cam.z - SUN.z * 5000, w, h);
      if (moon) {
        const g = ctx.createRadialGradient(moon.x, moon.y, 3, moon.x, moon.y, 90);
        g.addColorStop(0, 'rgba(232,240,250,0.95)');
        g.addColorStop(0.18, 'rgba(200,216,238,0.5)');
        g.addColorStop(1, 'rgba(200,216,238,0)');
        ctx.fillStyle = g;
        ctx.fillRect(moon.x - 95, moon.y - 95, 190, 190);
      }
    }
    // The sun, when it is in front of the camera (a storm swallows it).
    const sun = storm || night ? null : cam.project(cam.x + SUN.x * 5000, cam.y + SUN.y * 5000, cam.z + SUN.z * 5000, w, h);
    if (sun) {
      const g = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
      g.addColorStop(0, 'rgba(255,246,214,0.95)');
      g.addColorStop(0.25, 'rgba(255,238,190,0.55)');
      g.addColorStop(1, 'rgba(255,238,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sun.x - 140, sun.y - 140, 280, 280);
    }
  }

  drawClouds(w, h) {
    const ctx = this.ctx;
    const cam = this.cam;
    const sorted = [];
    for (const c of CLOUDS) {
      const q = cam.project(c.x, c.y, c.z, w, h);
      if (q && q.z < 6000) sorted.push({ q, c });
    }
    sorted.sort((a, b) => b.q.z - a.q.z);
    for (const { q, c } of sorted) {
      const r = c.s * q.s;
      if (r < 6) continue;
      ctx.fillStyle = this.night ? 'rgba(36,48,68,0.88)' : this.storm ? 'rgba(150,160,168,0.9)' : 'rgba(255,255,255,0.78)';
      for (const [ox, oy, orr] of [[0, 0, 1], [-0.7, 0.14, 0.66], [0.72, 0.16, 0.6], [0.1, -0.3, 0.55]]) {
        ctx.beginPath();
        ctx.ellipse(q.x + ox * r, q.y + oy * r * 0.4, r * orr, r * orr * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawTerrain(w, h) {
    const ctx = this.ctx;
    const cam = this.cam;
    const { n, cell, extent, heights, colors } = GRID;
    const cells = this.cells;
    cells.length = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const cx = -extent + (i + 0.5) * cell;
        const cz = -extent + (j + 0.5) * cell;
        const dx = cx - cam.x, dz = cz - cam.z;
        const depth = dx * cam.f.x + dz * cam.f.z;
        const far = 4600 * (1 - 0.58 * (this.fog || 0)); // weather closes the world in
        if (depth < -140 || depth > far) continue;
        const side = dx * cam.r.x + dz * cam.r.z;
        if (Math.abs(side) > depth * 1.15 + 500) continue;
        cells.push({ i, j, depth });
      }
    }
    cells.sort((a, b) => b.depth - a.depth);
    const idx = (i, j) => j * (n + 1) + i;
    for (const { i, j } of cells) {
      const x0 = -extent + i * cell, z0 = -extent + j * cell;
      // Wholly drowned cells stay unpainted: the sea shows through.
      const hs = [heights[idx(i, j)], heights[idx(i + 1, j)], heights[idx(i + 1, j + 1)], heights[idx(i, j + 1)]];
      if (Math.max(...hs) < 0.3) continue;
      const pts = [];
      let ok = true;
      for (const [ci, cj] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) {
        const y = heights[idx(ci, cj)];
        const p = cam.project(x0 + (ci - i) * cell, Math.max(y, -2), z0 + (cj - j) * cell, w, h);
        if (!p) { ok = false; break; }
        pts.push(p);
      }
      if (!ok) continue;
      poly(ctx, pts, colors[j * n + i]);
    }
  }

  drawRunway(w, h) {
    const ctx = this.ctx;
    const cam = this.cam;
    const { cx, cz, halfLen, halfWid, elev } = RUNWAY;
    // Drawn in segments along its length: the end behind the camera
    // would fail projection and take the whole strip with it.
    const SEGMENTS = 6;
    for (let i = 0; i < SEGMENTS; i++) {
      const x0 = cx - halfLen + (i / SEGMENTS) * halfLen * 2;
      const x1 = cx - halfLen + ((i + 1) / SEGMENTS) * halfLen * 2;
      const quad = [
        [x0, cz - halfWid], [x1, cz - halfWid],
        [x1, cz + halfWid], [x0, cz + halfWid],
      ].map(([x, z]) => cam.project(x, elev + 0.4, z, w, h));
      if (quad.some((p) => !p)) continue;
      poly(ctx, quad, '#4c4f52');
      const a = cam.project(x0 + 8, elev + 0.5, cz, w, h);
      const b = cam.project(x1 - 8, elev + 0.5, cz, w, h);
      if (a && b) {
        ctx.strokeStyle = 'rgba(240,240,235,0.85)';
        ctx.lineWidth = Math.max(1, a.s * 0.3);
        ctx.setLineDash([10, 9]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // Threshold bars at both ends.
    for (const endX of [cx - halfLen + 14, cx + halfLen - 14]) {
      const a = cam.project(endX, elev + 0.5, cz - halfWid + 6, w, h);
      const b = cam.project(endX, elev + 0.5, cz + halfWid - 6, w, h);
      if (a && b) {
        ctx.strokeStyle = 'rgba(245,245,240,0.95)';
        ctx.lineWidth = Math.max(2, a.s * 0.8);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    // Edge lights after dark (night, or the storm's dusk): two rows of
    // amber lamps the length of the strip, green at the near threshold.
    // In the night sortie they are how the strip is found at all.
    if (this.night || this.storm) {
      for (let d = -halfLen; d <= halfLen; d += 76) {
        for (const side of [-1, 1]) {
          const p = cam.project(cx + d, elev + 1.1, cz + side * (halfWid + 3), w, h);
          if (!p || p.z > 2600) continue;
          ctx.fillStyle = 'rgba(255,196,92,0.95)';
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.3, p.s * 0.55), 0, Math.PI * 2); ctx.fill();
        }
      }
      for (const endX of [cx - halfLen, cx + halfLen]) {
        const p = cam.project(endX, elev + 1.1, cz, w, h);
        if (p && p.z < 2600) {
          ctx.fillStyle = '#7de08d';
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.6, p.s * 0.7), 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  drawScenery(w, h) {
    const ctx = this.ctx;
    const cam = this.cam;
    const items = [];
    for (const t of TREES) {
      const dx = t.x - cam.x, dz = t.z - cam.z;
      const depth = dx * cam.f.x + dz * cam.f.z;
      if (depth > 30 && depth < 2600) items.push({ depth, kind: 'tree', o: t });
    }
    for (const b of BUILDINGS) {
      const dx = b.x - cam.x, dz = b.z - cam.z;
      const depth = dx * cam.f.x + dz * cam.f.z;
      if (depth > 30 && depth < 3200) items.push({ depth, kind: 'building', o: b });
    }
    items.sort((a, b) => b.depth - a.depth);
    for (const { kind, o } of items) {
      if (kind === 'tree') {
        const base = cam.project(o.x, o.y, o.z, w, h);
        const top = cam.project(o.x, o.y + 13 * o.s, o.z, w, h);
        if (!base || !top) continue;
        const wid = 6.5 * o.s * base.s;
        ctx.fillStyle = '#5a4632';
        ctx.fillRect(base.x - 1, top.y + (base.y - top.y) * 0.55, 2, (base.y - top.y) * 0.45);
        ctx.fillStyle = '#2e5d33';
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(base.x - wid, base.y);
        ctx.lineTo(base.x + wid, base.y);
        ctx.closePath();
        ctx.fill();
      } else {
        // Roofs carry the town's colour — rust, slate, clay or grey,
        // picked per building — so Port Sable is not one beige slab.
        const roof = ROOFS[Math.min(3, Math.floor(o.tone * 4))];
        const tones = {
          top: shade(roof, null, 1),
          side: shade([168, 156, 138], null, o.tone * 0.4),
          end: shade([140, 128, 110], null, -0.2 + o.tone * 0.3),
        };
        if (this.night) {
          // After dark the town goes lamplit: dark walls, and the roof
          // reads only as a silhouette against the sky.
          tones.top = shade(roof, null, -0.55);
          tones.side = shade([52, 54, 60], null, 0.1);
          tones.end = shade([44, 46, 52], null, 0);
        }
        drawBox(ctx, cam, w, h, o.x, o.y + o.h / 2, o.z, o.w / 2, o.h / 2, o.d / 2, 0, tones);
        if (this.night) {
          // Lit windows: a few amber panes on the two faces a pilot
          // sees coming in — south and east — placed by a hash of the
          // building so they never swim between frames.
          const seed = Math.abs(Math.sin(o.x * 12.9898 + o.z * 78.233) * 43758.5453) % 1;
          const rows = 3 + Math.floor(seed * 3);
          for (let k = 0; k < rows; k++) {
            const fy = o.y + o.h * (0.3 + 0.22 * (k % 3));
            const onSouth = k % 2 === 0;
            const fx = onSouth
              ? o.x + ((seed * 7 + k * 0.37) % 1 - 0.5) * o.w * 0.62
              : o.x + o.w / 2 + 0.4;
            const fz = onSouth
              ? o.z + o.d / 2 + 0.4
              : o.z + ((seed * 5 + k * 0.53) % 1 - 0.5) * o.d * 0.62;
            const p = cam.project(fx, fy, fz, w, h);
            if (!p || p.z > 2200) continue;
            // A halo first, then the pane: lamplight, not a pixel.
            const s = Math.max(2.1, p.s * 1.9);
            ctx.fillStyle = 'rgba(255,190,100,0.20)';
            ctx.fillRect(p.x - s * 1.15, p.y - s * 1.4, s * 2.3, s * 2.8);
            ctx.fillStyle = (k % 3 === 0) ? 'rgba(255,220,150,0.98)' : 'rgba(255,192,105,0.92)';
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s * 1.25);
          }
        }
      }
    }
  }

  // The island's landmarks, drawn on the ground: the dirt roads a
  // pilot navigates by, the south farm's field patchwork, and the
  // lighthouse on the east point — white tower, red band, and after
  // dark a beam that sweeps the water on a slow turn.
  drawLandmarks(w, h, time) {
    const ctx = this.ctx;
    const cam = this.cam;
    // Farm fields: quads that follow the slope's corner heights.
    for (const f of FIELDS) {
      const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
      const corner = (lx, lz) => ({
        x: f.x + lx * c - lz * s,
        z: f.z + lx * s + lz * c,
      });
      const pts = [corner(-f.w / 2, -f.d / 2), corner(f.w / 2, -f.d / 2), corner(f.w / 2, f.d / 2), corner(-f.w / 2, f.d / 2)]
        .map((p) => cam.project(p.x, groundHeight(p.x, p.z) + 0.4, p.z, w, h));
      if (pts.some((p) => !p)) continue;
      const t = this.night ? f.tone.map((v) => Math.round(v * 0.42)) : f.tone;
      poly(ctx, pts, `rgb(${t[0]},${t[1]},${t[2]})`);
    }
    // Roads: each polyline walked in short steps, ribboned onto the
    // ground at a fixed width.
    ctx.fillStyle = this.night ? '#2e2c26' : '#6d6353';
    for (const road of ROADS) {
      for (let i = 0; i + 1 < road.length; i++) {
        const [ax, az] = road[i];
        const [bx, bz] = road[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.round(len / 34));
        const px = -(bz - az) / len, pz = (bx - ax) / len; // perpendicular
        for (let k = 0; k < steps; k++) {
          const t0 = k / steps, t1 = (k + 1) / steps;
          const quad = [
            [ax + (bx - ax) * t0 + px * 4.5, az + (bz - az) * t0 + pz * 4.5],
            [ax + (bx - ax) * t0 - px * 4.5, az + (bz - az) * t0 - pz * 4.5],
            [ax + (bx - ax) * t1 - px * 4.5, az + (bz - az) * t1 - pz * 4.5],
            [ax + (bx - ax) * t1 + px * 4.5, az + (bz - az) * t1 + pz * 4.5],
          ].map(([x, z]) => cam.project(x, groundHeight(x, z) + 0.45, z, w, h));
          if (quad.some((p) => !p)) continue;
          poly(ctx, quad, ctx.fillStyle);
        }
      }
    }
    // The lighthouse: stacked drums — white, red band, white — and a
    // dark lamp room on top.
    const L = LIGHTHOUSE;
    const seg = (y0, y1, hx, col) => drawBox(ctx, cam, w, h, L.x, L.y + (y0 + y1) / 2, L.z, hx, (y1 - y0) / 2, hx, 0.4, {
      top: shade(col, null, 0.8), side: shade(col, null, 0.1), end: shade(col, null, -0.25),
    });
    seg(0, 13, 3.6, [228, 226, 218]);
    seg(13, 21, 3.1, [178, 52, 42]);
    seg(21, 30, 2.6, [228, 226, 218]);
    seg(30, 34, 2.0, [38, 44, 52]);
    if (this.night || this.storm) {
      // The lamp, and the beam sweeping from it: two soft triangles
      // turning slowly, reaching out over the water.
      const lampY = L.y + 32;
      const q = cam.project(L.x, lampY, L.z, w, h);
      if (q) {
        const g = ctx.createRadialGradient(q.x, q.y, 1, q.x, q.y, 44);
        g.addColorStop(0, 'rgba(255,244,200,0.95)');
        g.addColorStop(0.25, 'rgba(255,232,160,0.45)');
        g.addColorStop(1, 'rgba(255,232,160,0)');
        ctx.fillStyle = g;
        ctx.fillRect(q.x - 46, q.y - 46, 92, 92);
      }
      const ang = time * 0.45;
      for (const spread of [0.16, 0.07]) {
        const a1 = ang - spread, a2 = ang + spread;
        const p1 = cam.project(L.x + Math.cos(a1) * 760, lampY - 26, L.z + Math.sin(a1) * 760, w, h);
        const p2 = cam.project(L.x + Math.cos(a2) * 760, lampY - 26, L.z + Math.sin(a2) * 760, w, h);
        if (!q || !p1 || !p2) continue;
        ctx.fillStyle = spread > 0.1 ? 'rgba(255,240,190,0.055)' : 'rgba(255,244,205,0.10)';
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  drawCarrier(w, h) {
    const ctx = this.ctx;
    const cam = this.cam;
    const { cx, cz, deckY, heading } = CARRIER;
    // Hull below the deck line, then the deck plate itself. The boxes
    // turn with +heading so their long axis is the same axis the
    // landing frame in world.js measures along.
    drawBox(ctx, cam, w, h, cx, deckY - 6, cz, 30, 6, 155, heading, {
      top: shade([70, 76, 84], null, 0.4), side: shade([52, 58, 66], null, 0), end: shade([44, 50, 58], null, -0.3),
    });
    drawBox(ctx, cam, w, h, cx, deckY + 0.5, cz, 26, 0.6, 150, heading, {
      top: '#3c4148', side: '#33373d', end: '#33373d',
    });
    // The island tower, offset to starboard of the deck.
    const tx = cx + Math.cos(heading) * 30;
    const tz = cz + Math.sin(heading) * 30;
    drawBox(ctx, cam, w, h, tx, deckY + 11, tz, 9, 11, 14, heading, {
      top: shade([88, 94, 102], null, 0.6), side: shade([66, 72, 80], null, 0.1), end: shade([58, 64, 72], null, -0.2),
    });
    // Deck markings: centreline and the touchdown box. The local->world
    // map is the inverse of the analysis frame world.js measures in.
    const c = Math.cos(-heading), s = Math.sin(-heading);
    const toWorld = (lx, lz) => ({ x: cx + lx * c + lz * s, z: cz - lx * s + lz * c });
    ctx.strokeStyle = 'rgba(245,245,240,0.85)';
    const p1 = toWorld(0, -148), p2 = toWorld(0, 148);
    const q1 = cam.project(p1.x, deckY + 1.3, p1.z, w, h);
    const q2 = cam.project(p2.x, deckY + 1.3, p2.z, w, h);
    if (q1 && q2) {
      ctx.lineWidth = Math.max(1, q1.s * 0.3);
      ctx.setLineDash([16, 12]);
      ctx.beginPath(); ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    const box = [toWorld(-13, -70), toWorld(13, -70), toWorld(13, 70), toWorld(-13, 70)]
      .map((p) => cam.project(p.x, deckY + 1.3, p.z, w, h));
    if (!box.some((p) => !p)) {
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = Math.max(1.5, box[0].s * 0.4);
      ctx.beginPath();
      ctx.moveTo(box[0].x, box[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(box[i].x, box[i].y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // A ring gate standing in the air, its plane facing along its yaw.
  drawGate(w, h, gate, state) {
    const ctx = this.ctx;
    const cam = this.cam;
    const fx = Math.sin(gate.yaw), fz = -Math.cos(gate.yaw);
    const rx = Math.cos(gate.yaw), rz = Math.sin(gate.yaw);
    const SEG = 18;
    const pts = [];
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const lx = Math.cos(a) * GATE_RADIUS * rx;
      const lz = Math.cos(a) * GATE_RADIUS * rz;
      const ly = Math.sin(a) * GATE_RADIUS;
      const p = cam.project(gate.x + lx, gate.y + ly, gate.z + lz, w, h);
      if (!p) return;
      pts.push(p);
    }
    const style = state === 'next' ? '#ffb02e' : state === 'done' ? 'rgba(90,220,130,0.5)' : 'rgba(120,190,255,0.55)';
    ctx.strokeStyle = style;
    ctx.lineWidth = state === 'next' ? Math.max(2.5, pts[0].s * 1.1) : Math.max(1.5, pts[0].s * 0.7);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    if (state === 'next') {
      // A soft glow pass so the target reads at a glance.
      ctx.strokeStyle = 'rgba(255,176,46,0.25)';
      ctx.lineWidth = Math.max(6, pts[0].s * 3);
      ctx.stroke();
    }
  }

  // A mail drop zone: a painted ring lying on the ground, with a flag.
  // After dark the ring is a circle of lanterns — the only way the
  // night mail finds its targets.
  drawDropZone(w, h, zone, active) {
    const ctx = this.ctx;
    const cam = this.cam;
    const SEG = 20;
    if (this.night) {
      // Lantern dots around the ring, then the ring itself brighter.
      for (let i = 0; i < SEG; i += 2) {
        const a = (i / SEG) * Math.PI * 2;
        const p = cam.project(zone.x + Math.cos(a) * DROP_RADIUS, groundHeight(zone.x + Math.cos(a) * DROP_RADIUS, zone.z + Math.sin(a) * DROP_RADIUS) + 2.2, zone.z + Math.sin(a) * DROP_RADIUS, w, h);
        if (!p || p.z > 2400) continue;
        ctx.fillStyle = active ? 'rgba(255,210,92,0.95)' : 'rgba(255,196,92,0.6)';
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.3, p.s * 0.55), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = active ? '#ffd23e' : this.night ? 'rgba(255,210,62,0.75)' : 'rgba(255,210,62,0.45)';
    let prev = null;
    let lw = 2;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const x = zone.x + Math.cos(a) * DROP_RADIUS;
      const z = zone.z + Math.sin(a) * DROP_RADIUS;
      const p = cam.project(x, groundHeight(x, z) + 1.2, z, w, h);
      if (!p) { prev = null; continue; }
      lw = Math.max(1.5, p.s * 0.8);
      if (prev) {
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      prev = p;
    }
    const poleBase = cam.project(zone.x, zone.y, zone.z, w, h);
    const poleTop = cam.project(zone.x, zone.y + 16, zone.z, w, h);
    if (poleBase && poleTop) {
      ctx.strokeStyle = '#e8e4da';
      ctx.lineWidth = Math.max(1, poleBase.s * 0.25);
      ctx.beginPath(); ctx.moveTo(poleBase.x, poleBase.y); ctx.lineTo(poleTop.x, poleTop.y); ctx.stroke();
      ctx.fillStyle = '#d84a35';
      ctx.beginPath();
      ctx.moveTo(poleTop.x, poleTop.y);
      ctx.lineTo(poleTop.x + 11 * poleTop.s * 0.14 + 4, poleTop.y + 3);
      ctx.lineTo(poleTop.x, poleTop.y + 6);
      ctx.closePath(); ctx.fill();
    }
  }

  // The mail plane itself, drawn as shaded plates in its own basis.
  drawAircraft(w, h, plane, time) {
    const ctx = this.ctx;
    const cam = this.cam;
    const b = plane.basis();
    const P = (lx, ly, lz) => cam.project(
      plane.x + b.r.x * lx + b.u.x * ly + b.f.x * lz,
      plane.y + b.r.y * lx + b.u.y * ly + b.f.y * lz,
      plane.z + b.r.z * lx + b.u.z * ly + b.f.z * lz, w, h);
    // Faces: [local corners], base colour. Local: z forward, x right, y up.
    const FUSE = [232, 222, 198], RED = [178, 52, 42], DARK = [38, 44, 52], GLASS = [70, 120, 160];
    const box = (cx, cy, cz, hx, hy, hz, col) => {
      const cs = [
        [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz],
        [-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz],
      ].map(([x, y, z]) => [cx + x, cy + y, cz + z]);
      return [
        { c: [cs[4], cs[5], cs[6], cs[7]], col, n: [0, 1, 0] },
        { c: [cs[0], cs[1], cs[5], cs[4]], col, n: [0, 0, -1] },
        { c: [cs[1], cs[2], cs[6], cs[5]], col, n: [1, 0, 0] },
        { c: [cs[2], cs[3], cs[7], cs[6]], col, n: [0, 0, 1] },
        { c: [cs[3], cs[0], cs[4], cs[7]], col, n: [-1, 0, 0] },
        { c: [cs[0], cs[3], cs[2], cs[1]], col, n: [0, -1, 0] },
      ];
    };
    let faces = [];
    faces = faces.concat(box(0, 0, 0.4, 0.62, 0.62, 3.4, FUSE)); // fuselage
    faces = faces.concat(box(0, 0.08, -4.3, 0.4, 0.45, 1.3, FUSE)); // tail cone
    faces = faces.concat(box(0, -0.02, 0.7, 6.1, 0.09, 0.85, RED)); // main wing
    faces = faces.concat(box(0, 0.12, -5.3, 2.5, 0.08, 0.62, RED)); // tailplane
    faces = faces.concat(box(0, 0.85, -5.3, 0.09, 0.85, 0.6, RED)); // fin
    faces = faces.concat(box(0, 0.78, 1.6, 0.5, 0.34, 0.95, GLASS)); // canopy
    faces = faces.concat(box(-1.1, -1.05, 0.9, 0.14, 0.5, 0.14, DARK)); // gear legs
    faces = faces.concat(box(1.1, -1.05, 0.9, 0.14, 0.5, 0.14, DARK));
    // The built details: parts a kit plane is assembled from, each a
    // plate of its own — wing struts, wheel spats, a tailwheel, the
    // exhaust stub, a radio mast, and the red cheatline she wears.
    faces = faces.concat(box(-1.55, -0.5, 0.75, 0.07, 0.52, 0.07, DARK)); // struts
    faces = faces.concat(box(1.55, -0.5, 0.75, 0.07, 0.52, 0.07, DARK));
    faces = faces.concat(box(-1.1, -1.62, 0.9, 0.3, 0.34, 0.62, RED)); // wheel spats
    faces = faces.concat(box(1.1, -1.62, 0.9, 0.3, 0.34, 0.62, RED));
    faces = faces.concat(box(0, -0.72, -5.15, 0.16, 0.3, 0.3, DARK)); // tailwheel
    faces = faces.concat(box(0.66, -0.28, 2.6, 0.12, 0.12, 0.5, DARK)); // exhaust stub
    faces = faces.concat(box(0, 1.32, -0.6, 0.05, 0.42, 0.05, DARK)); // radio mast
    faces = faces.concat(box(-0.64, 0.08, 0.2, 0.02, 0.13, 3.1, RED)); // cheatlines
    faces = faces.concat(box(0.64, 0.08, 0.2, 0.02, 0.13, 3.1, RED));
    // Shade and sort the plates, then paint.
    const painted = [];
    for (const f of faces) {
      const nWorld = {
        x: b.r.x * f.n[0] + b.u.x * f.n[1] + b.f.x * f.n[2],
        y: b.r.y * f.n[0] + b.u.y * f.n[1] + b.f.y * f.n[2],
        z: b.r.z * f.n[0] + b.u.z * f.n[1] + b.f.z * f.n[2],
      };
      const facing = nWorld.x * SUN.x + nWorld.y * SUN.y + nWorld.z * SUN.z;
      // Back faces (pointing away from the camera) are skipped.
      const toCam = { x: cam.x - plane.x, y: cam.y - plane.y, z: cam.z - plane.z };
      if (nWorld.x * toCam.x + nWorld.y * toCam.y + nWorld.z * toCam.z < 0) continue;
      const pts = f.c.map(([lx, ly, lz]) => P(lx, ly, lz));
      if (pts.some((p) => !p)) continue;
      painted.push({ pts, fill: shade(f.col, null, facing) });
    }
    for (const p of painted) poly(ctx, p.pts, p.fill);
    // The propeller: from behind, only a faint rim of the arc shows
    // around the nose; from the front, the full blurred disc and blades.
    const hub = P(0, 0, 3.95);
    const tipT = P(0, 1.65, 3.95);
    if (hub && tipT) {
      const r = Math.hypot(tipT.x - hub.x, tipT.y - hub.y);
      const behind = b.f.x * (cam.x - plane.x) + b.f.y * (cam.y - plane.y) + b.f.z * (cam.z - plane.z) < 0;
      if (behind) {
        ctx.strokeStyle = 'rgba(30,32,36,0.28)';
        ctx.lineWidth = Math.max(1.5, r * 0.07);
        ctx.beginPath(); ctx.arc(hub.x, hub.y, r, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(30,32,36,0.16)';
        ctx.beginPath(); ctx.arc(hub.x, hub.y, r, 0, Math.PI * 2); ctx.fill();
        const a = plane.propPhase;
        ctx.strokeStyle = 'rgba(20,22,26,0.55)';
        ctx.lineWidth = Math.max(1.5, r * 0.09);
        for (const off of [0, Math.PI]) {
          const tip = P(Math.sin(a + off) * 1.6, Math.cos(a + off) * 1.6, 3.95);
          if (tip) { ctx.beginPath(); ctx.moveTo(hub.x, hub.y); ctx.lineTo(tip.x, tip.y); ctx.stroke(); }
        }
      }
      ctx.fillStyle = '#8c2f26';
      ctx.beginPath(); ctx.arc(hub.x, hub.y, Math.max(2, r * 0.14), 0, Math.PI * 2); ctx.fill();
    }
  }

  // A falling mail bag: a canvas parcel under a little white canopy.
  drawBag(w, h, bag) {
    const ctx = this.ctx;
    const cam = this.cam;
    const p = cam.project(bag.x, bag.y, bag.z, w, h);
    if (!p) return;
    const s = Math.max(3.5, p.s * 1.0);
    // The canopy: a pale half-disc floating a parcel's height above it.
    ctx.fillStyle = 'rgba(245,242,235,0.92)';
    ctx.beginPath();
    ctx.arc(p.x, p.y - s * 1.15, s * 0.85, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,80,60,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x - s * 0.8, p.y - s * 1.1); ctx.lineTo(p.x - s * 0.3, p.y - s * 0.4);
    ctx.moveTo(p.x + s * 0.8, p.y - s * 1.1); ctx.lineTo(p.x + s * 0.3, p.y - s * 0.4);
    ctx.stroke();
    ctx.fillStyle = '#b99b5f';
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    ctx.strokeStyle = '#7a6234';
    ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
  }

  // A fishing boat on the sea: hull, cabin, mast and a foam wake. The
  // distressed variant rides lower, lists, and trails engine smoke.
  drawBoat(w, h, x, z, heading, time, distressed = false) {
    const ctx = this.ctx;
    const cam = this.cam;
    const c = Math.cos(heading), s = Math.sin(heading);
    const toWorld = (lx, lz) => ({ x: x + lx * c - lz * s, z: z + lx * s + lz * c });
    if (!distressed) {
      // The wake: a pale fan spreading behind the stern.
      const stern = toWorld(0, -10);
      const tipL = toWorld(-6, -36);
      const tipR = toWorld(6, -36);
      const pts = [stern, tipL, tipR].map((p) => cam.project(p.x, 0.35, p.z, w, h));
      if (!pts.some((p) => !p)) {
        ctx.fillStyle = 'rgba(235,245,248,0.35)';
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.closePath();
        ctx.fill();
      }
    }
    const ride = distressed ? 0.1 : 0.9;
    drawBox(ctx, cam, w, h, x, ride, z, 3.1, 1.5, 11, heading, {
      top: shade([196, 90, 60], null, 0.5), side: shade([150, 62, 44], null, 0), end: shade([120, 50, 36], null, -0.3),
    });
    drawBox(ctx, cam, w, h, x, ride + 2.2, z, 2.1, 1.1, 4.5, heading, {
      top: shade([232, 230, 222], null, 0.7), side: shade([206, 204, 196], null, 0.1), end: shade([178, 176, 168], null, -0.2),
    });
    const mastBase = cam.project(x, ride + 3.2, z, w, h);
    const mastTop = cam.project(x, ride + 10, z, w, h);
    if (mastBase && mastTop) {
      ctx.strokeStyle = '#4a4238';
      ctx.lineWidth = Math.max(1, mastBase.s * 0.22);
      ctx.beginPath(); ctx.moveTo(mastBase.x, mastBase.y); ctx.lineTo(mastTop.x, mastTop.y); ctx.stroke();
    }
    if (distressed) {
      // A lazy column of dark smoke from the dead engine, blown west.
      for (let k = 0; k < 6; k++) {
        const age = ((time * 0.45 + k / 6) % 1);
        const px = x - age * 26, py = ride + 3 + age * 34, pz = z + age * 10;
        const q = cam.project(px, py, pz, w, h);
        if (!q) continue;
        ctx.fillStyle = `rgba(38,38,40,${(0.4 * (1 - age)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, Math.max(2, (3 + age * 13) * q.s * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // A forest fire seat: a ring of flame at the base and a column of
  // smoke climbing out of the pines — the pilot finds the fire by its
  // smoke, the way the brief says. Doused, it is a scorch mark and a
  // thin wisp of steam.
  drawFire(w, h, fire, time) {
    const ctx = this.ctx;
    const cam = this.cam;
    if (fire.out) {
      const q = cam.project(fire.x, fire.y + 6, fire.z, w, h);
      if (q) {
        ctx.fillStyle = 'rgba(220,225,228,0.30)';
        ctx.beginPath();
        ctx.arc(q.x, q.y, Math.max(2, 5 * q.s * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    // Flame tongues at the seat, flickering on a hash of the time so
    // they dance without a clock of their own.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + fire.x;
      const fx = fire.x + Math.cos(a) * 9, fz = fire.z + Math.sin(a) * 9;
      const flick = 0.7 + 0.5 * Math.abs(Math.sin(time * 7 + k * 2.3 + fire.z));
      const base = cam.project(fx, fire.y + 1, fz, w, h);
      const tip = cam.project(fx, fire.y + 1 + 11 * flick, fz, w, h);
      if (!base || !tip) continue;
      ctx.strokeStyle = k % 2 ? 'rgba(255,140,40,0.9)' : 'rgba(255,190,60,0.9)';
      ctx.lineWidth = Math.max(2, base.s * 1.1);
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    }
    // The smoke column: dark puffs rising and drifting west, like the
    // rescue boat's engine smoke but far taller — this one is a
    // landmark, the thing the whole sortie navigates by.
    for (let k = 0; k < 8; k++) {
      const age = ((time * 0.3 + k / 8) % 1);
      const px = fire.x - age * 46, py = fire.y + 8 + age * 95, pz = fire.z + age * 10;
      const q = cam.project(px, py, pz, w, h);
      if (!q) continue;
      ctx.fillStyle = `rgba(40,38,36,${(0.5 * (1 - age)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(q.x, q.y, Math.max(2, (5 + age * 26) * q.s * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The distress flare over the rescue boat: a pulsing ring on the water
  // where the raft must land, a masthead light, and every few seconds a
  // red flare arcing into the murk — the thing the pilot navigates by.
  drawRescueSignals(w, h, bx, bz, time) {
    const ctx = this.ctx;
    const cam = this.cam;
    const SEG = 22;
    const pulse = 0.65 + 0.35 * Math.sin(time * 3.2);
    ctx.strokeStyle = `rgba(255,84,60,${(0.85 * pulse).toFixed(3)})`;
    let prev = null;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const p = cam.project(bx + Math.cos(a) * DROP_RADIUS, 0.7, bz + Math.sin(a) * DROP_RADIUS, w, h);
      if (!p) { prev = null; continue; }
      if (prev) {
        ctx.lineWidth = Math.max(1.5, p.s * 0.8);
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      prev = p;
    }
    // The arcing flare itself: up, hang, fall, dark, again.
    const phase = time % 8;
    if (phase < 3.2) {
      const fx = bx + phase * 11, fz = bz - phase * 6;
      const fy = 8 + phase * 44 - phase * phase * 10.5;
      const q = cam.project(fx, fy, fz, w, h);
      if (q) {
        const g = ctx.createRadialGradient(q.x, q.y, 1, q.x, q.y, 34);
        g.addColorStop(0, 'rgba(255,120,80,0.95)');
        g.addColorStop(0.3, 'rgba(255,70,45,0.55)');
        g.addColorStop(1, 'rgba(255,70,45,0)');
        ctx.fillStyle = g;
        ctx.fillRect(q.x - 36, q.y - 36, 72, 72);
        ctx.fillStyle = '#ffd9c9';
        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1.6, q.s * 0.35), 0, Math.PI * 2); ctx.fill();
      }
    }
    // The masthead light, blinking through the rain.
    if (Math.sin(time * 3.2) > -0.2) {
      const q = cam.project(bx, 11, bz, w, h);
      if (q) {
        ctx.fillStyle = 'rgba(255,190,90,0.9)';
        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1.4, q.s * 0.3), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Island birds: dark chevrons riding the thermals, wings flapping.
  drawBirds(w, h, time) {
    const ctx = this.ctx;
    const cam = this.cam;
    ctx.strokeStyle = 'rgba(28,34,38,0.85)';
    ctx.lineWidth = 1.6;
    for (const flock of FLOCKS) {
      for (let i = 0; i < flock.n; i++) {
        const b = birdPosition(flock, i, time);
        const q = cam.project(b.x, b.y, b.z, w, h);
        if (!q || q.z > 2400) continue;
        const half = Math.max(2.5, 1.15 * q.s);
        const lift = Math.sin(b.flap) * half * 0.55;
        ctx.beginPath();
        ctx.moveTo(q.x - half, q.y - lift);
        ctx.lineTo(q.x, q.y + half * 0.22);
        ctx.lineTo(q.x + half, q.y - lift);
        ctx.stroke();
      }
    }
  }

  // Rain, screen-space: slanted streaks blown by the sortie's wind.
  drawRain(w, h, intensity, time) {
    const ctx = this.ctx;
    const n = Math.floor(170 * intensity);
    if (n <= 0) return;
    ctx.strokeStyle = 'rgba(205,222,232,0.34)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const hash = Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
      const hash2 = Math.abs(Math.sin(i * 269.5 + 183.3) * 28001.8384) % 1;
      const x = ((hash + time * 0.13 * (0.5 + hash2)) % 1.2 - 0.1) * w;
      const y = ((hash2 + time * (1.5 + hash * 0.7)) % 1.1 - 0.05) * h;
      const len = 13 + hash * 15;
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.36, y + len);
    }
    ctx.stroke();
  }

  // The whole world in one call. scene: {plane, traffic, gates states,
  // zones, activeZone, bag, particles, showAircraft, weather, rescue}
  render(w, h, scene) {
    const weather = scene.weather || { rain: 0, dusk: false, fog: 0 };
    this.storm = !!weather.dusk;
    this.night = !!weather.night;
    this.fog = weather.fog || 0;
    this.cam.focal = h * 0.92;
    this.drawSkyAndSea(w, h, this.storm);
    this.drawClouds(w, h);
    this.drawTerrain(w, h);
    this.drawRunway(w, h);
    this.drawLandmarks(w, h, scene.time);
    this.drawCarrier(w, h);
    for (const b of BOATS) {
      const p = boatPosition(b, scene.time);
      this.drawBoat(w, h, p.x, p.z, p.heading, scene.time, false);
    }
    if (scene.rescue) this.drawBoat(w, h, scene.rescue.x, scene.rescue.z, scene.rescue.heading, scene.time, true);
    this.drawScenery(w, h);
    this.drawBirds(w, h, scene.time);
    if (scene.zones) scene.zones.forEach((z, i) => this.drawDropZone(w, h, z, i === scene.activeZone));
    if (scene.fires) scene.fires.forEach((f) => this.drawFire(w, h, f, scene.time));
    if (scene.gates) scene.gates.forEach((g, i) => this.drawGate(w, h, g, scene.gateState(i)));
    if (scene.rescue && scene.rescueSignals) this.drawRescueSignals(w, h, scene.rescue.x, scene.rescue.z, scene.time);
    if (scene.bag) this.drawBag(w, h, scene.bag);
    if (scene.particles) scene.particles.draw(this.ctx, this.cam, w, h);
    if (scene.traffic) this.drawAircraft(w, h, scene.traffic, scene.time);
    if (scene.plane && scene.showAircraft !== false) this.drawAircraft(w, h, scene.plane, scene.time);
    if (this.night) {
      // Night deepens the world a touch; the lamps drawn into it —
      // windows, strip lights, the lighthouse — carry the picture.
      this.ctx.fillStyle = 'rgba(6,10,24,0.36)';
      this.ctx.fillRect(0, 0, w, h);
      if (weather.fog > 0) {
        this.ctx.fillStyle = `rgba(110,132,164,${(weather.fog * 0.20).toFixed(3)})`;
        this.ctx.fillRect(0, 0, w, h);
      }
    } else if (this.storm) {
      // Dusk gloom over the whole world, then the rain in front of it.
      this.ctx.fillStyle = 'rgba(30,40,56,0.20)';
      this.ctx.fillRect(0, 0, w, h);
    }
    if (weather.rain > 0) {
      if (weather.fog > 0) {
        this.ctx.fillStyle = `rgba(146,162,170,${(weather.fog * 0.30).toFixed(3)})`;
        this.ctx.fillRect(0, 0, w, h);
      }
      this.drawRain(w, h, weather.rain, scene.time);
    }
  }
}
