// renderer.js — the hand-rolled 3D view: one canvas, one projector.
//
// No engine and no library: a chase camera builds an orthonormal basis
// each frame, world points are dotted onto it and divided by depth, and
// flat-shaded polygons are painted far to near. The terrain grid colours
// are precomputed in world.js, so a frame is projection and fills only.

import { GRID, TREES, BUILDINGS, CLOUDS, RUNWAY, CARRIER, GATES, GATE_RADIUS, DROP_ZONES, DROP_RADIUS, groundHeight } from './world.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// The camera: a point in the world plus the basis it looks through.
export class Camera {
  constructor() {
    this.x = 0; this.y = 240; this.z = 2200;
    this.f = { x: 0, y: 0, z: -1 };
    this.r = { x: 1, y: 0, z: 0 };
    this.u = { x: 0, y: 1, z: 0 };
    this.focal = 600;
    this.shake = 0;
  }

  // Park the camera behind and above the plane, rolling part-way with it
  // so the horizon leans but never spins. snap=true jumps straight there
  // (used when a sortie starts or the plane is placed for a screenshot).
  follow(plane, dt, snap = false) {
    const b = plane.basis();
    const dist = 27, up = 10;
    const tx = plane.x - b.f.x * dist + b.u.x * up;
    const ty = plane.y - b.f.y * dist + b.u.y * up;
    const tz = plane.z - b.f.z * dist + b.u.z * up;
    const gap = Math.hypot(tx - this.x, ty - this.y, tz - this.z);
    const k = snap || gap > 160 ? 1 : 1 - Math.exp(-dt * 7);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.z += (tz - this.z) * k;
    // Look at a point ahead of the nose.
    let fx = plane.x + b.f.x * 70 - this.x;
    let fy = plane.y + b.f.y * 70 - this.y;
    let fz = plane.z + b.f.z * 70 - this.z;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    this.f = { x: fx, y: fy, z: fz };
    // Camera up: mostly the world's, leaning 55% toward the plane's.
    const lean = 0.55;
    let ux = b.u.x * lean, uy = 1 - lean + b.u.y * lean, uz = b.u.z * lean;
    // right = forward x up-ish, then true up = right x forward
    let rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    this.r = { x: rx, y: ry, z: rz };
    this.u = {
      x: ry * fz - rz * fy,
      y: rz * fx - rx * fz,
      z: rx * fy - ry * fx,
    };
  }

  // Free orbit for the title screen: circle the island, look at its heart.
  orbit(time) {
    const a = time * 0.05;
    this.x = Math.cos(a) * 2100;
    this.z = Math.sin(a) * 2100;
    this.y = 430 + Math.sin(time * 0.11) * 60;
    let fx = -this.x, fy = 60 - this.y, fz = -this.z;
    const fl = Math.hypot(fx, fy, fz) || 1;
    this.f = { x: fx / fl, y: fy / fl, z: fz / fl };
    // right = forward swung 90 degrees in the ground plane; up completes it.
    let rx = -this.f.z, rz = this.f.x;
    const rl = Math.hypot(rx, rz) || 1;
    this.r = { x: rx / rl, y: 0, z: rz / rl };
    this.u = {
      x: this.r.y * this.f.z - this.r.z * this.f.y,
      y: this.r.z * this.f.x - this.r.x * this.f.z,
      z: this.r.x * this.f.y - this.r.y * this.f.x,
    };
  }

  project(x, y, z, w, h) {
    const dx = x - this.x, dy = y - this.y, dz = z - this.z;
    const cx = dx * this.r.x + dy * this.r.y + dz * this.r.z;
    const cy = dx * this.u.x + dy * this.u.y + dz * this.u.z;
    const cz = dx * this.f.x + dy * this.f.y + dz * this.f.z;
    if (cz < 4) return null;
    const s = this.focal / cz;
    return { x: w / 2 + cx * s, y: h / 2 - cy * s, z: cz, s };
  }
}

const SUN = { x: -0.45, y: 0.62, z: -0.66 }; // toward the afternoon sun

function shade(hex, n, sunFacing) {
  // hex like [r,g,b]; sunFacing -1..1 darkens or warms the face.
  const f = 0.72 + 0.28 * clamp(sunFacing, -1, 1);
  return `rgb(${Math.round(hex[0] * f)},${Math.round(hex[1] * f)},${Math.round(hex[2] * f)})`;
}

// One reusable particle pool: dust, spray and damage smoke.
export class Particles {
  constructor() {
    this.list = [];
  }
  spawn(x, y, z, opts) {
    const n = opts.n || 8;
    for (let i = 0; i < n; i++) {
      if (this.list.length > 420) return;
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed || 6) * (0.3 + Math.random() * 0.7);
      this.list.push({
        x, y, z,
        vx: Math.cos(a) * sp, vy: (opts.up || 3) * Math.random(), vz: Math.sin(a) * sp,
        life: 0, ttl: (opts.ttl || 0.9) * (0.6 + Math.random() * 0.7),
        size: opts.size || 3, color: opts.color || '255,255,255',
      });
    }
  }
  step(dt) {
    for (const p of this.list) {
      p.life += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy -= 2.2 * dt;
    }
    this.list = this.list.filter((p) => p.life < p.ttl);
  }
  draw(ctx, cam, w, h) {
    for (const p of this.list) {
      const q = cam.project(p.x, p.y, p.z, w, h);
      if (!q) continue;
      const a = 0.55 * (1 - p.life / p.ttl);
      ctx.fillStyle = `rgba(${p.color},${a.toFixed(3)})`;
      const r = Math.max(1, p.size * q.s * 0.06);
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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

  drawSkyAndSea(w, h) {
    const ctx = this.ctx;
    const cam = this.cam;
    // Where does the horizon fall on screen?
    const horizon = cam.project(cam.x + cam.f.x * 4000, cam.y + cam.f.y * 4000 - cam.y * 0 + 0, cam.z + cam.f.z * 4000, w, h);
    let hy = horizon ? horizon.y : h / 2;
    hy = clamp(hy, -h * 0.4, h * 1.2);
    const sky = ctx.createLinearGradient(0, -h * 0.2, 0, Math.max(hy, 1));
    sky.addColorStop(0, '#2d5a8f');
    sky.addColorStop(0.55, '#7db1dd');
    sky.addColorStop(1, '#dceef8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, Math.max(hy, 0));
    const sea = ctx.createLinearGradient(0, Math.max(hy, 0), 0, h);
    sea.addColorStop(0, '#7fa8bd');
    sea.addColorStop(0.25, '#3f7296');
    sea.addColorStop(1, '#27536f');
    ctx.fillStyle = sea;
    ctx.fillRect(0, Math.max(hy, 0), w, h - Math.max(hy, 0));
    // The sun, when it is in front of the camera.
    const sun = cam.project(cam.x + SUN.x * 5000, cam.y + SUN.y * 5000, cam.z + SUN.z * 5000, w, h);
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
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
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
        if (depth < -140 || depth > 4600) continue;
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
        const tones = {
          top: shade([206, 198, 182], null, 1),
          side: shade([168, 156, 138], null, o.tone * 0.4),
          end: shade([140, 128, 110], null, -0.2 + o.tone * 0.3),
        };
        drawBox(ctx, cam, w, h, o.x, o.y + o.h / 2, o.z, o.w / 2, o.h / 2, o.d / 2, 0, tones);
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
  drawDropZone(w, h, zone, active) {
    const ctx = this.ctx;
    const cam = this.cam;
    const SEG = 20;
    ctx.strokeStyle = active ? '#ffd23e' : 'rgba(255,210,62,0.45)';
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
    const s = Math.max(2.5, p.s * 0.62);
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

  // The whole world in one call. scene: {plane, gates states, zones,
  // activeZone, bag, particles, showAircraft}
  render(w, h, scene) {
    this.cam.focal = h * 0.92;
    this.drawSkyAndSea(w, h);
    this.drawClouds(w, h);
    this.drawTerrain(w, h);
    this.drawRunway(w, h);
    this.drawCarrier(w, h);
    this.drawScenery(w, h);
    if (scene.zones) scene.zones.forEach((z, i) => this.drawDropZone(w, h, z, i === scene.activeZone));
    if (scene.gates) scene.gates.forEach((g, i) => this.drawGate(w, h, g, scene.gateState(i)));
    if (scene.bag) this.drawBag(w, h, scene.bag);
    if (scene.particles) scene.particles.draw(this.ctx, this.cam, w, h);
    if (scene.plane && scene.showAircraft !== false) this.drawAircraft(w, h, scene.plane, scene.time);
  }
}
