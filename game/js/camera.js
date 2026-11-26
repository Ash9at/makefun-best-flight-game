// camera.js — the chase camera and its projector.
//
// A point in the world plus the orthonormal basis it looks through:
// follow() parks it behind and above the plane, rolling part-way with
// the airframe so the horizon leans but never spins; project() dots a
// world point onto the basis and divides by depth.

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
    // Touchdown shake, set by the game on arrivals: a few frames of
    // jitter that die away, so a firm landing is felt, not just read.
    if (this.shake > 0.02) {
      this.x += (Math.random() * 2 - 1) * this.shake;
      this.y += (Math.random() * 2 - 1) * this.shake * 0.7;
      this.shake *= Math.exp(-dt * 6);
    } else {
      this.shake = 0;
    }
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
