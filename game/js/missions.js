// missions.js — the sorties of the Skyward Post.
//
// Three jobs with different goals and a free-flight mode. Each sortie
// owns its state, its scoring and the words on its debrief screen; the
// game loop only flies the plane and asks the mission what happened.

import { GATES, GATE_RADIUS, DROP_ZONES, CARRIER } from './world.js';
import { STALL_SPEED } from './aircraft.js';

export const SORTIES = [
  {
    id: 'gates',
    name: 'Sortie 1 — Gate Circuit',
    tagline: '8 rings around the island, against the clock',
    brief: [
      'Fly the orange ring, then the next, all eight of them.',
      'The clock runs from the first ring. Smooth banks beat',
      'greedy ones: a stalled wing drops you out of the course.',
      'Land back on the strip afterwards for the full score.',
    ],
    spawn: { x: 0, y: 175, z: 2150, yaw: 0, speed: 58, throttle: 0.6 },
  },
  {
    id: 'mail',
    name: 'Sortie 2 — Mail Drop',
    tagline: '3 mail bags, 3 painted circles, no second chances',
    brief: [
      'Three villages are waiting for their post. Fly low over',
      'the yellow circle and press SPACE to let a bag go.',
      'The bag keeps your speed and falls — lead the target,',
      'mind the stall, and watch the fuel on the far leg east.',
    ],
    spawn: { x: -520, y: 185, z: 720, yaw: 1.24, speed: 55, throttle: 0.58 },
  },
  {
    id: 'carrier',
    name: 'Sortie 3 — Carrier Landing',
    tagline: 'One deck, 140 metres of it, moving nothing but your nerve',
    brief: [
      'The carrier rides north-west, deck lit and waiting.',
      'Come in slow and flat along her centreline, touch down',
      'inside the yellow box, sink rate gentler than 3.6 m/s.',
      'Too fast or too firm and the deck crew will fish you out.',
    ],
    spawn: { x: -2093, y: 138, z: -384, yaw: 0.6, speed: 52, throttle: 0.45 },
  },
  {
    id: 'free',
    name: 'Free Flight',
    tagline: 'The island, the plane, no errands',
    brief: [
      'Take off from the strip and fly the island as you like.',
      'Land back on the strip or the deck whenever you are done.',
    ],
    spawn: { x: -190, y: 16, z: 780, yaw: Math.PI / 2, speed: 0, throttle: 0 },
  },
];

function rankFor(score) {
  if (score >= 1050) return 'S';
  if (score >= 850) return 'A';
  if (score >= 620) return 'B';
  if (score >= 380) return 'C';
  return 'D';
}

const crashWords = {
  water: 'You put her in the sea.',
  terrain: 'You flew into the island.',
  hard: 'That arrival broke the aeroplane.',
};

export class Mission {
  constructor(sortie, plane, sound) {
    this.sortie = sortie;
    this.sound = sound;
    plane.reset(sortie.spawn);
    if (sortie.id === 'free') plane.onGround = true;
    this.state = 'flying'; // flying | complete | failed
    this.elapsed = 0;
    this.popups = []; // {text, sub} for the banner queue
    this.result = null;
    // Gate circuit state.
    this.nextGate = 0;
    this.gateTimes = [];
    this.clockRunning = false;
    // Mail state.
    this.bagsLeft = 3;
    this.bag = null; // {x,y,z,vx,vy,vz}
    this.dropScores = [];
    this.zoneIndex = 0;
    // Carrier state.
    this.judged = false;
  }

  popup(text, sub) {
    this.popups.push({ text, sub });
  }

  // What the renderer needs beyond the world itself.
  scene() {
    if (this.sortie.id === 'gates') {
      return {
        gates: GATES,
        gateState: (i) => (i < this.nextGate ? 'done' : i === this.nextGate ? 'next' : 'todo'),
        bag: null, zones: null, activeZone: -1,
      };
    }
    if (this.sortie.id === 'mail') {
      return {
        gates: null, gateState: null,
        bag: this.bag,
        zones: DROP_ZONES, activeZone: this.zoneIndex,
      };
    }
    return { gates: null, gateState: null, bag: null, zones: null, activeZone: -1 };
  }

  hud() {
    const t = this.elapsed.toFixed(1);
    if (this.sortie.id === 'gates') {
      return {
        title: 'GATE CIRCUIT',
        lines: [
          `Ring ${Math.min(this.nextGate + 1, 8)} of 8 · clock ${this.clockRunning ? t + 's' : '—'}`,
          this.nextGate >= 8 ? 'All rings flown — land on the strip' : 'Follow the orange ring',
        ],
      };
    }
    if (this.sortie.id === 'mail') {
      const zone = DROP_ZONES[this.zoneIndex];
      return {
        title: 'MAIL DROP',
        lines: [
          `Bags aboard: ${this.bagsLeft} · delivered ${this.dropScores.length} of 3`,
          zone ? `Next: ${zone.name} — SPACE to drop` : 'All bags away',
        ],
      };
    }
    if (this.sortie.id === 'carrier') {
      return {
        title: 'CARRIER LANDING',
        lines: ['Deck ahead — slow, flat, centred', `Aim sink gentler than 3.6 m/s`],
      };
    }
    return { title: 'FREE FLIGHT', lines: ['The island is yours', 'Land on the strip or deck to finish'] };
  }

  // SPACE pressed: only the mail plane carries anything to drop.
  releaseBag(plane) {
    if (this.sortie.id !== 'mail' || this.state !== 'flying') return;
    if (this.bag || this.bagsLeft <= 0) return;
    const b = plane.basis();
    this.bag = {
      x: plane.x, y: plane.y - 2, z: plane.z,
      vx: b.f.x * plane.speed, vy: b.f.y * plane.speed - 1, vz: b.f.z * plane.speed,
    };
    this.bagsLeft--;
    this.sound.drop();
    this.popup('MAIL AWAY', DROP_ZONES[this.zoneIndex].name);
  }

  finish(score, title, lines) {
    this.state = 'complete';
    this.result = { score, title, lines, rank: rankFor(score) };
    this.sound.fanfare();
  }

  fail(reason) {
    if (this.state !== 'flying') return;
    this.state = 'failed';
    this.result = { score: 0, title: 'Sortie over', lines: [reason], rank: '—' };
  }

  // One frame of mission logic. events come from the aircraft's step.
  update(dt, plane, events) {
    if (this.state !== 'flying') return;
    this.elapsed += dt;
    if (plane.crashed) {
      this.fail(crashWords[plane.crashed] || 'The plane is down.');
      return;
    }
    if (this.sortie.id === 'gates') this.updateGates(plane);
    else if (this.sortie.id === 'mail') this.updateMail(dt, plane);
    else if (this.sortie.id === 'carrier') this.updateCarrier(plane, events);
    else if (this.sortie.id === 'free') this.updateFree(plane, events);
  }

  updateGates(plane) {
    if (this.nextGate < GATES.length) {
      const g = GATES[this.nextGate];
      const d = Math.hypot(plane.x - g.x, plane.y - g.y, plane.z - g.z);
      if (d < GATE_RADIUS - 4) {
        if (!this.clockRunning) { this.clockRunning = true; this.elapsed = 0; }
        this.gateTimes.push(this.elapsed);
        this.nextGate++;
        this.sound.gate();
        this.popup(
          this.nextGate >= 8 ? 'ALL 8 RINGS FLOWN' : `RING ${this.nextGate} OF 8`,
          this.nextGate >= 8 ? 'Now land on the strip for the full score' : `split ${this.elapsed.toFixed(1)}s`,
        );
      }
    } else if (plane.onGround && plane.overRunway() && plane.speed < 4) {
      const timeScore = Math.max(0, 900 - Math.round(this.elapsed) * 3);
      const score = timeScore + Math.round(plane.fuel * 1.5) - Math.round(plane.damage * 2);
      this.finish(Math.max(60, score), 'Circuit complete — and home again', [
        `Course time ${this.elapsed.toFixed(1)}s over 8 rings`,
        `Time points ${timeScore} · fuel bonus ${Math.round(plane.fuel * 1.5)} · damage −${Math.round(plane.damage * 2)}`,
      ]);
    }
  }

  updateMail(dt, plane) {
    if (this.bag) {
      const bag = this.bag;
      bag.vy -= 9.81 * dt;
      bag.x += bag.vx * dt; bag.y += bag.vy * dt; bag.z += bag.vz * dt;
      const zone = DROP_ZONES[this.zoneIndex];
      if (bag.y <= zone.y + 1) {
        const dist = Math.hypot(bag.x - zone.x, bag.z - zone.z);
        let pts, word;
        if (dist < 15) { pts = 300; word = 'ON THE MAT'; }
        else if (dist < 30) { pts = 210; word = 'IN THE CIRCLE'; }
        else if (dist < 46) { pts = 120; word = 'EDGE OF THE PAINT'; }
        else { pts = 25; word = `${Math.round(dist)} m away — in the field`; }
        this.dropScores.push(pts);
        this.sound.scored();
        this.popup(word, `${zone.name} · +${pts}`);
        this.bag = null;
        this.zoneIndex++;
      }
    }
    if (this.zoneIndex >= DROP_ZONES.length && !this.bag) {
      const dropTotal = this.dropScores.reduce((a, b) => a + b, 0);
      const score = dropTotal + Math.round(plane.fuel) - Math.round(plane.damage * 2);
      this.finish(Math.max(40, score), 'The post is delivered', [
        `Drops: ${this.dropScores.join(' + ')} = ${dropTotal} points`,
        `Fuel bonus ${Math.round(plane.fuel)} · damage −${Math.round(plane.damage * 2)}`,
        'Land anywhere safe — the flying is done.',
      ]);
    }
  }

  updateCarrier(plane, events) {
    if (!events.touchedDown || this.judged) return;
    this.judged = true;
    if (plane.overDeck()) {
      const pos = plane.deckPosition();
      const inBox = Math.abs(pos.along) <= 70 && Math.abs(pos.across) <= 20;
      const centre = Math.max(0, 400 - Math.round(Math.abs(pos.across) * 16));
      const zonePts = inBox ? 350 : 120;
      const gentle = plane.vspeed >= -3.6 ? 250 : Math.max(0, 250 - Math.round((-plane.vspeed - 3.6) * 60));
      const score = centre + zonePts + gentle - Math.round(plane.damage * 2);
      this.finish(Math.max(80, score), 'On the deck — the crew is impressed', [
        `Touchdown ${Math.abs(pos.across).toFixed(1)} m off the centreline, sink ${plane.vspeed.toFixed(1)} m/s`,
        `Centreline ${centre} · zone ${zonePts} · gentle ${gentle} · damage −${Math.round(plane.damage * 2)}`,
      ]);
    } else if (plane.overRunway() && !plane.crashed) {
      this.finish(220, 'Diverted to the strip', [
        'A safe landing ashore: 220 points.',
        'The deck wanted you, but the island caught you.',
      ]);
    }
  }

  updateFree(plane, events) {
    if (events.touchedDown && (plane.overRunway() || plane.overDeck()) && this.elapsed > 20) {
      this.finish(300 + Math.round(plane.fuel), 'Home again', [
        'A free flight, ended the way it should be: parked.',
        `Fuel left ${Math.round(plane.fuel)}% · damage ${Math.round(plane.damage)}%`,
      ]);
    }
  }
}
