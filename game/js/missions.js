// missions.js — the sorties of the Skyward Post.
//
// Six jobs with different goals and a free-flight mode. Each sortie
// owns its state, its scoring and the words on its debrief screen; the
// game loop only flies the plane and asks the mission what happened.

import { GATES, GATE_RADIUS, DROP_ZONES, FIRES, CARRIER, RUNWAY, rescueBoatPosition } from './world.js';
import { STALL_SPEED } from './aircraft.js';

// The weather each sortie flies in: rain and fog for the renderer, a
// steady wind and a gust multiplier for the flight model. Only the
// rescue flies in real weather; the night mail flies after dark; the
// rest share the island's fair day.
const FAIR = { rain: 0, fog: 0, dusk: false, wind: { x: 0, z: 0, gust: 1 } };
const STORM = { rain: 0.85, fog: 0.55, dusk: true, wind: { x: -7, z: 3, gust: 2.6 } };
const NIGHT = { rain: 0, fog: 0.12, dusk: false, night: true, wind: { x: -2, z: 1, gust: 1.15 } };

export const SORTIES = [
  {
    id: 'gates',
    name: 'Sortie 1 — Gate Circuit',
    tagline: '12 rings around the island, against the clock',
    brief: [
      'Fly the orange ring, then the next, all twelve of them.',
      'The clock runs from the first ring. Rings 4 and 8 hug',
      'the volcano shoulders and ring 10 grazes the ridge:',
      'thread those gently, and land home for the full score.',
      'Bent or thirsty? A pit stop on the strip repairs and',
      'refuels — and costs 25 seconds of clock.',
    ],
    spawn: { x: 0, y: 175, z: 2150, yaw: 0, speed: 58, throttle: 0.6 },
    weather: FAIR,
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
      'Low and slow over the circle earns +60 — but low and',
      'slow is exactly where the stall lives. Your call.',
    ],
    spawn: { x: -520, y: 185, z: 720, yaw: 1.24, speed: 55, throttle: 0.58 },
    weather: FAIR,
  },
  {
    id: 'carrier',
    name: 'Sortie 3 — Carrier Landing',
    tagline: 'One deck, a yellow box, no second tries',
    brief: [
      'The carrier rides north-west, deck lit and waiting.',
      'Come in slow and flat along her centreline, touch down',
      'inside the yellow box, sink rate gentler than 3.6 m/s.',
      'Too fast or too firm and the deck crew will fish you out.',
    ],
    spawn: { x: -2093, y: 138, z: -384, yaw: 0.6, speed: 52, throttle: 0.45 },
    weather: FAIR,
  },
  {
    id: 'rescue',
    name: 'Sortie 4 — Storm Rescue',
    tagline: 'Find the flare, drop the raft, get home',
    brief: [
      'A fishing boat has lost her engine south-east, in the',
      'storm. Find her by the red flare, fly low and slow,',
      'and press SPACE to drop the supply raft alongside.',
      'Then turn for home and land on the strip — in gusts,',
      'rain and a westerly that pushes you the whole way.',
    ],
    spawn: { x: 420, y: 150, z: 2380, yaw: 0.5, speed: 56, throttle: 0.6 },
    weather: STORM,
  },
  {
    id: 'night',
    name: 'Sortie 5 — Night Mail',
    tagline: '2 bags by lantern light, navigating on the panel',
    brief: [
      'The island after dark: two bags, two lantern rings.',
      'Port Sable green first, then the lighthouse point.',
      'The strip is lit, the town windows are lit and the',
      'lighthouse sweeps the water — navigate by the lights,',
      'fly the panel, and drop low and slow for the bonus.',
    ],
    spawn: { x: 300, y: 195, z: 2150, yaw: 0.12, speed: 56, throttle: 0.58 },
    weather: NIGHT,
    zones: [DROP_ZONES[0], DROP_ZONES[2]],
  },
  {
    id: 'fire',
    name: 'Sortie 6 — Forest Fire',
    tagline: '2 fires in the pines, 3 water bags, no rain coming',
    brief: [
      'Two seats of fire in the pine woods, west and south-',
      'east, each wearing its own column of smoke. You carry',
      'three water bags for two fires — one spare, no more.',
      'Drop into the painted ring: a bag from height is rain,',
      'a bag from the treetops is a bucket. Low and slow',
      'earns +60 here too. Miss twice and the woods keep one.',
    ],
    spawn: { x: -300, y: 190, z: 1900, yaw: 0.35, speed: 56, throttle: 0.58 },
    weather: FAIR,
    zones: FIRES,
    bags: 3,
  },
  {
    id: 'free',
    name: 'Free Flight — First Flight',
    tagline: 'A guided first lap, then the island is yours',
    brief: [
      'New to the plane? This sortie teaches her: throttle,',
      'lift-off, a banked circle of the island, and a landing,',
      'one prompted step at a time. Old hands can ignore the',
      'prompts and simply fly — land when you are done.',
    ],
    spawn: { x: -190, y: 16, z: 780, yaw: Math.PI / 2, speed: 0, throttle: 0 },
    weather: FAIR,
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
    // Mail state. A sortie may name its own zones (the night mail
    // flies a shorter round); the bag count follows the zones.
    this.zones = sortie.zones || DROP_ZONES;
    this.bagsLeft = sortie.bags || this.zones.length;
    this.bag = null; // {x,y,z,vx,vy,vz,releaseAlt,releaseSpeed}
    this.dropScores = [];
    this.zoneIndex = 0;
    // Free-flight guide state: the prompted first-lap steps.
    this.guide = 0;
    this.guideTurn = 0;
    this.prevYaw = plane.yaw;
    // Carrier state.
    this.judged = false;
    // Rescue state: find the boat, raft away, then get home.
    this.raftPhase = 'find'; // find | away | home
    this.raftScore = 0;
    this.boatPos = rescueBoatPosition(0);
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
    if (this.sortie.id === 'mail' || this.sortie.id === 'night') {
      return {
        gates: null, gateState: null,
        bag: this.bag,
        zones: this.zones, activeZone: this.zoneIndex,
      };
    }
    if (this.sortie.id === 'fire') {
      return {
        gates: null, gateState: null,
        bag: this.bag,
        zones: this.zones, activeZone: this.zoneIndex,
        // The renderer draws each seat's smoke; a seat is out once
        // the drops have moved past it.
        fires: this.zones.map((z, i) => ({ ...z, out: i < this.zoneIndex })),
      };
    }
    if (this.sortie.id === 'rescue') {
      return {
        gates: null, gateState: null,
        bag: this.bag,
        zones: null, activeZone: -1,
        rescue: this.boatPos,
        rescueSignals: this.raftPhase === 'find',
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
          `Ring ${Math.min(this.nextGate + 1, 12)} of 12 · clock ${this.clockRunning ? t + 's' : '—'}`,
          this.nextGate >= 12 ? 'All rings flown — land on the strip' : 'Follow the orange ring',
        ],
      };
    }
    if (this.sortie.id === 'mail' || this.sortie.id === 'night') {
      const zone = this.zones[this.zoneIndex];
      return {
        title: this.sortie.id === 'night' ? 'NIGHT MAIL' : 'MAIL DROP',
        lines: [
          `Bags aboard: ${this.bagsLeft} · delivered ${this.dropScores.length} of ${this.zones.length}`,
          zone ? `Next: ${zone.name} — SPACE to drop` : 'All bags away',
        ],
      };
    }
    if (this.sortie.id === 'fire') {
      const zone = this.zones[this.zoneIndex];
      return {
        title: 'FOREST FIRE',
        lines: [
          `Water bags: ${this.bagsLeft} · fires out ${this.zoneIndex} of ${this.zones.length}`,
          zone ? `Next: ${zone.name} — SPACE to drop` : 'All fires out',
        ],
      };
    }
    if (this.sortie.id === 'carrier') {
      return {
        title: 'CARRIER LANDING',
        lines: ['Deck ahead — slow, flat, centred', `Aim sink gentler than 3.6 m/s`],
      };
    }
    if (this.sortie.id === 'rescue') {
      const lines = {
        find: ['Find the red flare — SE offshore, low', 'SPACE drops the raft alongside her'],
        away: ['Raft is away — turn for home', 'Land on the strip to finish'],
        home: ['Land on the strip to finish', 'Mind the gusts on final'],
      }[this.raftPhase];
      return { title: 'STORM RESCUE', lines };
    }
    if (this.sortie.id === 'free') {
      const steps = [
        'Step 1 of 4 — W: throttle up, roll down the strip',
        'Step 2 of 4 — climb away: ease the nose up',
        'Step 3 of 4 — bank with ← → and circle the island',
        'Step 4 of 4 — land on the strip or the deck',
        'All steps flown — the island is yours',
      ];
      return {
        title: 'FREE FLIGHT',
        lines: [steps[Math.min(this.guide, 4)], 'Land on the strip or deck to finish'],
      };
    }
    return { title: 'FREE FLIGHT', lines: ['The island is yours', 'Land on the strip or deck to finish'] };
  }

  // SPACE pressed: the mail plane drops a bag, the rescue plane a raft.
  releaseBag(plane) {
    if (this.state !== 'flying' || this.bag) return;
    if (this.sortie.id === 'mail' || this.sortie.id === 'night' || this.sortie.id === 'fire') {
      if (this.bagsLeft <= 0) return;
      const b = plane.basis();
      const zone = this.zones[this.zoneIndex];
      this.bag = {
        x: plane.x, y: plane.y - 2, z: plane.z,
        vx: b.f.x * plane.speed, vy: b.f.y * plane.speed - 1, vz: b.f.z * plane.speed,
        // How the drop was flown, for the low-and-slow bonus: a brave
        // release close to the ground and close to the stall earns
        // more than a safe high one. Risk priced into the drop.
        releaseAlt: plane.y - zone.y,
        releaseSpeed: plane.speed,
      };
      this.bagsLeft--;
      this.sound.drop();
      this.popup(this.sortie.id === 'fire' ? 'WATER AWAY' : 'MAIL AWAY', zone.name);
    } else if (this.sortie.id === 'rescue' && this.raftPhase === 'find') {
      const b = plane.basis();
      this.bag = {
        x: plane.x, y: plane.y - 2, z: plane.z,
        vx: b.f.x * plane.speed, vy: b.f.y * plane.speed - 1, vz: b.f.z * plane.speed,
      };
      this.raftPhase = 'away';
      this.sound.drop();
      this.popup('RAFT AWAY', 'watch it fall — then turn for home');
    }
  }

  // Where the sortie wants the pilot next, for the objective arrow:
  // {x, z, label} or null when there is nothing to point at.
  objective() {
    if (this.state !== 'flying') return null;
    switch (this.sortie.id) {
      case 'gates': {
        const g = GATES[this.nextGate];
        return g ? { x: g.x, z: g.z, label: `RING ${this.nextGate + 1}` } : { x: RUNWAY.cx, z: RUNWAY.cz, label: 'LAND' };
      }
      case 'mail':
      case 'night':
      case 'fire': {
        const zn = this.zones[this.zoneIndex];
        return zn ? { x: zn.x, z: zn.z, label: this.sortie.id === 'fire' ? 'FIRE' : 'DROP ZONE' } : null;
      }
      case 'carrier':
        return { x: CARRIER.cx, z: CARRIER.cz, label: 'DECK' };
      case 'rescue': {
        if (this.raftPhase === 'find') {
          const b = rescueBoatPosition(this.elapsed);
          return { x: b.x, z: b.z, label: 'DISTRESSED BOAT' };
        }
        return { x: RUNWAY.cx, z: RUNWAY.cz, label: 'LAND' };
      }
      default:
        return null;
    }
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
    else if (this.sortie.id === 'mail' || this.sortie.id === 'night') this.updateMail(dt, plane);
    else if (this.sortie.id === 'fire') this.updateFire(dt, plane);
    else if (this.sortie.id === 'carrier') this.updateCarrier(plane, events);
    else if (this.sortie.id === 'rescue') this.updateRescue(dt, plane, events);
    else if (this.sortie.id === 'free') this.updateFree(plane, events);
  }

  updateGates(plane) {
    // The pit stop: a full stop on the strip before the last ring is
    // a trade — the crew refuels and patches the airframe, and the
    // clock takes 25 s for it. Worth it after a bent arrival or a
    // thirsty first half; a detour that costs the lead if it is not.
    if (this.nextGate < GATES.length && plane.onGround && plane.overRunway() && plane.speed < 4) {
      if (!this.pitDone) {
        this.pitDone = true;
        this.elapsed += 25;
        plane.fuel = 100;
        plane.damage = 0;
        this.sound.gate();
        this.popup('PIT STOP', 'refuelled and patched — 25 s on the clock');
      }
    } else if (!plane.onGround) {
      this.pitDone = false;
    }
    if (this.nextGate < GATES.length) {
      const g = GATES[this.nextGate];
      const d = Math.hypot(plane.x - g.x, plane.y - g.y, plane.z - g.z);
      if (d < GATE_RADIUS - 4) {
        if (!this.clockRunning) { this.clockRunning = true; this.elapsed = 0; }
        this.gateTimes.push(this.elapsed);
        this.nextGate++;
        this.sound.gate();
        this.popup(
          this.nextGate >= 12 ? 'ALL 12 RINGS FLOWN' : `RING ${this.nextGate} OF 12`,
          this.nextGate >= 12 ? 'Now land on the strip for the full score' : `split ${this.elapsed.toFixed(1)}s`,
        );
      }
    } else if (plane.onGround && plane.overRunway() && plane.speed < 4) {
      const timeScore = Math.max(0, 1150 - Math.round(this.elapsed) * 3);
      const score = timeScore + Math.round(plane.fuel * 1.5) - Math.round(plane.damage * 2);
      this.finish(Math.max(60, score), 'Circuit complete — and home again', [
        `Course time ${this.elapsed.toFixed(1)}s over 12 rings`,
        `Time points ${timeScore} · fuel bonus ${Math.round(plane.fuel * 1.5)} · damage −${Math.round(plane.damage * 2)}`,
      ]);
    }
  }

  updateMail(dt, plane) {
    if (this.bag) {
      const bag = this.bag;
      bag.vy -= 9.81 * dt;
      bag.x += bag.vx * dt; bag.y += bag.vy * dt; bag.z += bag.vz * dt;
      const zone = this.zones[this.zoneIndex];
      if (bag.y <= zone.y + 1) {
        const dist = Math.hypot(bag.x - zone.x, bag.z - zone.z);
        let pts, word;
        if (dist < 15) { pts = 300; word = 'ON THE MAT'; }
        else if (dist < 30) { pts = 210; word = 'IN THE CIRCLE'; }
        else if (dist < 46) { pts = 120; word = 'EDGE OF THE PAINT'; }
        else { pts = 25; word = `${Math.round(dist)} m away — in the field`; }
        // The low-and-slow bonus: released under 75 m and under
        // 46 m/s, the drop was flown bravely, close to the stall.
        if (bag.releaseAlt < 75 && bag.releaseSpeed < 46) {
          pts += 60;
          word += ' · LOW AND SLOW +60';
        }
        this.dropScores.push(pts);
        this.sound.scored();
        this.popup(word, `${zone.name} · +${pts}`);
        this.bag = null;
        this.zoneIndex++;
      }
    }
    if (this.zoneIndex >= this.zones.length && !this.bag) {
      const dropTotal = this.dropScores.reduce((a, b) => a + b, 0);
      const score = dropTotal + Math.round(plane.fuel) - Math.round(plane.damage * 2);
      const title = this.sortie.id === 'night' ? 'The night post is delivered' : 'The post is delivered';
      this.finish(Math.max(40, score), title, [
        `Drops: ${this.dropScores.join(' + ')} = ${dropTotal} points`,
        `Fuel bonus ${Math.round(plane.fuel)} · damage −${Math.round(plane.damage * 2)}`,
        'Land anywhere safe — the flying is done.',
      ]);
    }
  }

  // The firefighting drop: like the mail, a bag falls ballistically —
  // but a miss does not move on. The fire keeps burning, the spare
  // bag is spent circling back, and with the bags gone the sortie
  // ends on whatever was doused. Accuracy is the whole job here.
  updateFire(dt, plane) {
    if (this.bag) {
      const bag = this.bag;
      bag.vy -= 9.81 * dt;
      bag.x += bag.vx * dt; bag.y += bag.vy * dt; bag.z += bag.vz * dt;
      const zone = this.zones[this.zoneIndex];
      if (bag.y <= zone.y + 1) {
        const dist = Math.hypot(bag.x - zone.x, bag.z - zone.z);
        if (dist < 46) {
          let pts, word;
          if (dist < 15) { pts = 300; word = 'RIGHT IN THE FLAMES'; }
          else if (dist < 30) { pts = 210; word = 'DOWN THE SMOKE COLUMN'; }
          else { pts = 120; word = 'EDGE OF THE RING — IT SUFFOCATES'; }
          if (bag.releaseAlt < 75 && bag.releaseSpeed < 46) {
            pts += 60;
            word += ' · LOW AND SLOW +60';
          }
          this.dropScores.push(pts);
          this.sound.scored();
          this.popup(word, `${zone.name} is out · +${pts}`);
          this.zoneIndex++;
        } else {
          this.sound.gate();
          this.popup('MISSED — THE FIRE STILL BURNS', `${Math.round(dist)} m off · ${this.bagsLeft} bag${this.bagsLeft === 1 ? '' : 's'} left`);
        }
        this.bag = null;
      }
    }
    if (this.zoneIndex >= this.zones.length && !this.bag) {
      const dropTotal = this.dropScores.reduce((a, b) => a + b, 0);
      const score = dropTotal + Math.round(plane.fuel) - Math.round(plane.damage * 2);
      this.finish(Math.max(40, score), 'Both fires are out', [
        `Drops: ${this.dropScores.join(' + ')} = ${dropTotal} points`,
        `Fuel bonus ${Math.round(plane.fuel)} · damage −${Math.round(plane.damage * 2)}`,
        'The woods will smoke for a day. The island keeps its pines.',
      ]);
    } else if (this.bagsLeft <= 0 && !this.bag && this.state === 'flying') {
      const dropTotal = this.dropScores.reduce((a, b) => a + b, 0);
      const score = dropTotal + Math.round(plane.fuel) - Math.round(plane.damage * 2);
      this.finish(Math.max(30, score), 'Out of water', [
        `${this.zoneIndex} of ${this.zones.length} fires doused for ${dropTotal} points`,
        'The rest is up to the wind and the bucket brigades.',
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

  updateRescue(dt, plane, events) {
    this.boatPos = rescueBoatPosition(this.elapsed);
    if (this.bag) {
      // The raft falls like a mail bag, but the sea decides the score.
      const bag = this.bag;
      bag.vy -= 9.81 * dt;
      bag.x += bag.vx * dt; bag.y += bag.vy * dt; bag.z += bag.vz * dt;
      if (bag.y <= 1.2) {
        const dist = Math.hypot(bag.x - this.boatPos.x, bag.z - this.boatPos.z);
        let word;
        if (dist < 14) { this.raftScore = 420; word = 'RIGHT ALONGSIDE'; }
        else if (dist < 28) { this.raftScore = 320; word = 'CLOSE ENOUGH TO THROW A LINE'; }
        else if (dist < 46) { this.raftScore = 190; word = 'IN THE RING — THEY CAN REACH IT'; }
        else { this.raftScore = 60; word = `${Math.round(dist)} m off — the sea has it now`; }
        this.sound.scored();
        this.popup(word, `raft +${this.raftScore} · now get home`);
        this.bag = null;
        this.raftPhase = 'home';
      }
    }
    if (this.raftPhase === 'home' && plane.onGround && plane.overRunway() && plane.speed < 4) {
      const home = 260 + Math.round(plane.fuel) - Math.round(plane.damage * 2);
      const score = this.raftScore + home;
      this.finish(Math.max(60, score), 'Home through the storm', [
        `Raft ${this.raftScore} points · the boat's crew has their supplies`,
        `Home bonus ${260 + Math.round(plane.fuel)} · damage −${Math.round(plane.damage * 2)}`,
        'Somewhere south-east, a flare goes up in thanks.',
      ]);
    }
    if (events.touchedDown && plane.overDeck() && this.raftPhase === 'home') {
      // A deck landing in a storm counts as home, and then some.
      const score = this.raftScore + 340 + Math.round(plane.fuel) - Math.round(plane.damage * 2);
      this.finish(Math.max(60, score), 'On the deck — in THAT weather', [
        `Raft ${this.raftScore} points · deck bonus in a storm`,
        'The carrier crew will be telling this one for weeks.',
      ]);
    }
  }

  updateFree(plane, events) {
    // The guided first lap: four prompted steps, each announced as it
    // is flown. Old hands ignore them; the finish is the same either
    // way — a landing on the strip or the deck after some flying.
    let dyaw = plane.yaw - this.prevYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.prevYaw = plane.yaw;
    if (!plane.onGround) this.guideTurn += Math.abs(dyaw);
    if (this.guide === 0 && plane.speed > 32) {
      this.guide = 1;
      this.popup('ROLLING', 'ease the nose up as she passes 35 m/s');
    } else if (this.guide === 1 && !plane.onGround && plane.y > 60) {
      this.guide = 2;
      this.popup('AIRBORNE', 'now bank — let the wings do the turning');
    } else if (this.guide === 2 && this.guideTurn > 5.6) {
      this.guide = 3;
      this.popup('A FULL CIRCLE', 'last step: bring her home and land');
    }
    if (events.touchedDown && (plane.overRunway() || plane.overDeck()) && this.elapsed > 20) {
      if (this.guide === 3) this.guide = 4;
      this.finish(300 + Math.round(plane.fuel), 'Home again', [
        this.guide >= 4 ? 'Every step flown: throttle, climb, circle, landing.' : 'A free flight, ended the way it should be: parked.',
        `Fuel left ${Math.round(plane.fuel)}% · damage ${Math.round(plane.damage)}%`,
      ]);
    }
  }
}
