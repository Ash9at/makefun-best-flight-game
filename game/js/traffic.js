// traffic.js — the other mail plane.
//
// It flies its own circuit of the island all day, in the menus and in
// every sortie, and never once lands: a second aircraft in the sky is
// the cheapest living-world signal there is. Waypoints are (x, z)
// around the island at a safe, scenic height, flown with the same
// Aircraft model the player gets.

import { Aircraft } from './aircraft.js';

const ROUTE = [[600, -1900], [-1900, -400], [-700, 1900], [1900, 300]];
const CRUISE_Y = 285;

export class Traffic {
  constructor() {
    this.plane = new Aircraft();
    this.plane.reset({ x: 1900, y: CRUISE_Y, z: 300, yaw: -1.2, speed: 58, throttle: 0.62 });
    // Her tank is scenery, not a system: she flies the island all
    // day, so hers never runs dry. (The player's model would ditch
    // her in the sea inside eight minutes — she is the living
    // world, not a sortie.)
    this.plane.fuel = 1e9;
    this.leg = 0;
  }

  step(dt, time) {
    const p = this.plane;
    const [tx, tz] = ROUTE[this.leg];
    const dx = tx - p.x, dz = tz - p.z;
    if (Math.hypot(dx, dz) < 240) this.leg = (this.leg + 1) % ROUTE.length;
    let headErr = Math.atan2(dx, -dz) - p.yaw;
    while (headErr > Math.PI) headErr -= Math.PI * 2;
    while (headErr < -Math.PI) headErr += Math.PI * 2;
    p.throttle = 0.62;
    p.step(dt, {
      roll: Math.max(-0.55, Math.min(0.55, headErr * 1.3)),
      pitch: Math.max(-0.5, Math.min(0.5, (CRUISE_Y - p.y) * 0.012 - p.vspeed * 0.02)),
      throttleDelta: 0,
      rudder: 0,
    }, time);
  }
}
