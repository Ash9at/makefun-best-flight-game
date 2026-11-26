// particles.js — one reusable particle pool.
//
// Dust on the roll-out, spray on a ditching, smoke from a bent
// airframe: a single capped pool, stepped and drawn by the game loop.

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
