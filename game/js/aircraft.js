// aircraft.js — the Skyward Post mail plane and how it flies.
//
// A disciplined little arcade model: the throttle makes speed, speed
// makes lift, banks make turns, and below the stall speed the nose drops
// and the airframe complains. Fuel burns faster the harder you push, and
// hard arrivals bend the aeroplane — both turn a sortie into decisions.

import { groundHeight, deckHeightAt, RUNWAY, CARRIER } from './world.js';

export const STALL_SPEED = 27; // m/s, below this the wing gives up
export const TOUCHDOWN_MAX_SINK = -3.6; // m/s, gentler than this is a landing
export const TOUCHDOWN_MAX_SPEED = 64; // m/s on the deck

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class Aircraft {
  constructor() {
    this.reset({ x: 0, y: 200, z: 1900, yaw: 0, speed: 55 });
  }

  // Place the plane in the air (or on a strip) with a clean airframe.
  reset({ x, y, z, yaw, pitch = 0, roll = 0, speed = 50, throttle = 0.55 }) {
    this.x = x; this.y = y; this.z = z;
    this.yaw = yaw; this.pitch = pitch; this.roll = roll;
    this.speed = speed; this.throttle = throttle;
    this.vspeed = 0; // smoothed vertical speed, for judging arrivals
    this.fuel = 100; // percent
    this.damage = 0; // percent, 100 is a wreck
    this.onGround = false;
    this.crashed = null; // null | 'terrain' | 'water' | 'hard'
    this.stalled = false;
    this.buffet = 0;
    this.propPhase = 0;
    this.gear = 1.9; // metres from the centre to the wheels
    // The weather the sortie flies in: a steady drift (m/s) and a gust
    // multiplier on the island's own turbulence. Calm is {0, 0, 1}; the
    // game sets this from the sortie after every reset.
    this.wind = { x: 0, z: 0, gust: 1 };
  }

  // Orthonormal basis of the airframe: forward, right, up.
  basis() {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const f = { x: sy * cp, y: sp, z: -cy * cp };
    const rFlat = { x: cy, y: 0, z: sy };
    const uFlat = {
      x: rFlat.y * f.z - rFlat.z * f.y,
      y: rFlat.z * f.x - rFlat.x * f.z,
      z: rFlat.x * f.y - rFlat.y * f.x,
    };
    const cr = Math.cos(this.roll), sr = Math.sin(this.roll);
    // Positive roll is a right bank: the right wingtip drops, the nose
    // swings right, and the turn rate in step() follows the same sign.
    const r = {
      x: rFlat.x * cr - uFlat.x * sr,
      y: rFlat.y * cr - uFlat.y * sr,
      z: rFlat.z * cr - uFlat.z * sr,
    };
    const u = {
      x: uFlat.x * cr + rFlat.x * sr,
      y: uFlat.y * cr + rFlat.y * sr,
      z: uFlat.z * cr + rFlat.z * sr,
    };
    return { f, r, u };
  }

  headingDeg() {
    let d = (this.yaw * 180) / Math.PI;
    d %= 360;
    return d < 0 ? d + 360 : d;
  }

  // Advance the simulation. input: {pitch: -1..1 (positive = climb),
  // roll: -1..1 (positive = bank right), throttleDelta: -1..1, rudder}.
  // Returns an events object the game reads for sounds and banners.
  step(dt, input, time) {
    const events = { touchedDown: false, tookOff: false, splashed: false, struck: false };
    if (this.crashed) return events;
    dt = Math.min(dt, 0.05);

    // Throttle and the fuel it drinks.
    this.throttle = clamp(this.throttle + input.throttleDelta * dt * 0.7, 0, 1);
    const burning = this.fuel > 0;
    if (burning && !this.onGround) this.fuel = Math.max(0, this.fuel - dt * (0.14 + this.throttle * 0.30));
    const power = burning ? this.throttle : 0;

    // Roll toward the commanded bank; the bank does the turning.
    const targetRoll = input.roll * 1.05;
    this.roll += clamp(targetRoll - this.roll, -2.6 * dt, 2.6 * dt);
    const turnRate = (9.81 * Math.tan(clamp(this.roll, -1.2, 1.2))) / Math.max(this.speed, 16);
    if (!this.onGround) this.yaw += turnRate * dt;

    // Pitch answers the stick, slower when the air is thin and fast.
    const pitchAuth = clamp(this.speed / 45, 0.35, 1);
    this.pitch += input.pitch * 0.85 * pitchAuth * dt;
    // A light weathervane: pitch settles a touch toward the horizon.
    this.pitch -= this.pitch * 0.10 * dt;
    this.pitch = clamp(this.pitch, -0.95, 0.85);
    if (input.rudder && !this.onGround) this.yaw += input.rudder * 0.25 * dt;

    // Speed: thrust against drag, trading height for pace on the slope.
    const thrust = power * 13.5;
    const drag = 0.0038 * this.speed * this.speed + (this.onGround ? 2.2 : 0);
    let accel = thrust - drag - 9.81 * Math.sin(this.pitch);
    if (this.onGround && power === 0) accel -= 3.0; // brakes and grass
    this.speed = Math.max(0, this.speed + accel * dt);

    // The stall: too slow and the wing stops holding the nose up.
    this.stalled = !this.onGround && this.speed < STALL_SPEED;
    if (this.stalled) {
      this.pitch -= (STALL_SPEED - this.speed) * 0.045 * dt * 10;
      this.buffet = Math.min(1, this.buffet + dt * 5);
    } else {
      this.buffet = Math.max(0, this.buffet - dt * 3);
    }

    // Move along the nose; a stalled wing also slides downward.
    const { f } = this.basis();
    const prevY = this.y;
    this.x += f.x * this.speed * dt;
    this.y += f.y * this.speed * dt;
    this.z += f.z * this.speed * dt;
    if (this.stalled) this.y -= (STALL_SPEED - this.speed) * 0.42 * dt;
    if (!this.onGround) {
      // The sortie's steady wind drifts the whole air mass, plane and all.
      this.x += this.wind.x * dt;
      this.z += this.wind.z * dt;
      // Gusting over the island, stronger down low — and as wild as the
      // sortie's weather says. In a storm the gusts also shove the nose
      // and rock the wings, so the pilot flies the plane, not the plan.
      const gust = Math.sin(time * 0.7 + this.x * 0.002) * Math.sin(time * 1.13 + this.z * 0.0016);
      const g = this.wind.gust;
      if (this.y < 260) this.y += gust * 1.4 * g * dt;
      if (g > 1.2) {
        const kick = Math.sin(time * 1.9 + this.z * 0.001) * Math.sin(time * 0.83 + this.x * 0.0013);
        this.y += kick * (g - 1) * 2.6 * dt;
        this.roll += Math.sin(time * 2.3 + 1.7) * (g - 1) * 0.10 * dt;
        this.pitch += Math.sin(time * 1.55 + 0.4) * (g - 1) * 0.05 * dt;
      }
    }
    const rawV = dt > 0 ? (this.y - prevY) / dt : 0;
    this.vspeed += (rawV - this.vspeed) * Math.min(1, dt * 5);
    this.propPhase += dt * (4 + power * 46);

    // What is under the wheels?
    const deck = deckHeightAt(this.x, this.z);
    const ground = deck !== null ? deck : groundHeight(this.x, this.z);
    const floorY = Math.max(ground, 0) + this.gear;
    const wasGround = this.onGround;

    if (this.y <= floorY) {
      this.y = floorY;
      const onStrip = deck !== null || this.overRunway();
      if (!wasGround) {
        // The arrival itself: judge it once, on the way in.
        events.touchedDown = true;
        if (deck === null && ground < 0.5) {
          this.crashed = 'water';
          events.splashed = true;
        } else if (this.vspeed < -9 || this.speed > 96) {
          this.crashed = 'hard';
          this.damage = 100;
          events.struck = true;
        } else if (!onStrip) {
          // Putting down on rough country: it can be survived, barely.
          if (this.vspeed < TOUCHDOWN_MAX_SINK - 1.5 || this.speed > 58) {
            this.crashed = 'terrain';
            this.damage = 100;
            events.struck = true;
          } else {
            this.damage = Math.min(100, this.damage + 30);
          }
        } else if (this.vspeed < TOUCHDOWN_MAX_SINK) {
          // A firm arrival on the strip: bounce and bend a little.
          this.damage = Math.min(100, this.damage + Math.round((-this.vspeed - 3.6) * 6));
          events.struck = this.damage >= 100;
          if (this.damage >= 100) this.crashed = 'hard';
        }
      }
      this.onGround = !this.crashed;
      if (this.onGround) {
        // Rolling: keep the nose near the ground plane, let speed rule.
        this.pitch = Math.max(this.pitch, -0.02);
        if (this.speed > 34 && this.pitch > 0.06) {
          this.onGround = false; // rotated: airborne again
          events.tookOff = true;
        }
      }
    } else if (wasGround && this.y > floorY + 0.4) {
      this.onGround = false;
      events.tookOff = true;
    }
    return events;
  }

  overRunway() {
    return (
      Math.abs(this.x - RUNWAY.cx) <= RUNWAY.halfLen + 10 &&
      Math.abs(this.z - RUNWAY.cz) <= RUNWAY.halfWid + 8
    );
  }

  overDeck() {
    return deckHeightAt(this.x, this.z) !== null;
  }

  // How far past the near end of the deck the plane is, in metres,
  // and how far off its centreline — the landing judge's raw numbers.
  deckPosition() {
    const dx = this.x - CARRIER.cx;
    const dz = this.z - CARRIER.cz;
    const c = Math.cos(-CARRIER.heading);
    const s = Math.sin(-CARRIER.heading);
    return { along: dx * s + dz * c, across: dx * c - dz * s };
  }
}
