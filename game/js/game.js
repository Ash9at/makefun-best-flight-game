// game.js — Skyward Post: boot, screens and the frame loop.
//
// The flow is title -> briefing -> flying -> debrief, with the island
// always live behind the menus. This file owns the screens, the
// camera direction and the banner queue; the keyboard lives in
// input.js, the flying itself in aircraft.js, the jobs in
// missions.js, the panel in instruments.js.

import { Renderer } from './renderer.js';
import { Particles } from './particles.js';
import { Aircraft } from './aircraft.js';
import { Traffic } from './traffic.js';
import { PilotLog } from './pilotlog.js';
import { autopilotInput } from './autopilot.js';
import { Mission, SORTIES } from './missions.js';
import { attachKeys, pilotInput } from './input.js';
import { drawInstruments, drawBanner, drawPathMarker, drawObjective, drawDropSight } from './instruments.js';
import { Sound } from './audio.js';
import { RUNWAY } from './world.js';

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const renderer = new Renderer(canvas);
const particles = new Particles();
const plane = new Aircraft();
const sound = new Sound();

// The other mail plane (traffic.js) and the pilot's log book
// (pilotlog.js): the living world and the campaign memory.
const traffic = new Traffic();
const pilotLog = new PilotLog();
let lastWasBest = false;
// The campaign airframe: damage a sortie ends with is the damage the
// next one starts with — the plane remembers being bent. A crash
// writes her off, but the replacement is a tired war-surplus spare
// that starts 25% worn, so the write-off is never the free way out
// of a repair bill; a repair on the title screen costs 150 campaign
// points. Push on bent, or pay: a decision that outlives any sortie.
let airframeDamage = 0;
let repairDebt = 0;
function recordResult() {
  lastWasBest = pilotLog.record(mission);
  airframeDamage = plane.crashed ? 25 : Math.round(plane.damage);
}

let screen = 'title'; // title | brief | fly | done
let selected = 0; // sortie index on the title screen
let mission = null;
let banner = null; // {text, sub, until}
let time = 0;
let lastStamp = performance.now();
let paused = false;
let menuArmed = false; // the menu's autopilot flight is set up once

// Demo hold: the autopilot (autopilot.js) keeps the plane on a heading
// and height. The title screen uses it to fly the island; screenshots
// use it too.
let demoHold = null; // {heading, alt}

// --- Keyboard: presses drive the screens; input.js holds the keys --
attachKeys((code) => {
  sound.ensure();
  if (screen === 'title') {
    if (code.startsWith('Digit')) {
      const n = Number(code.slice(5));
      if (n >= 1 && n <= SORTIES.length) { selected = n - 1; screen = 'brief'; }
    }
    if (code === 'Enter') screen = 'brief';
    if (code === 'ArrowUp') selected = (selected + SORTIES.length - 1) % SORTIES.length;
    if (code === 'ArrowDown') selected = (selected + 1) % SORTIES.length;
    if (code === 'KeyR' && airframeDamage > 0) {
      repairDebt += 150;
      airframeDamage = 0;
    }
  } else if (screen === 'brief') {
    if (code === 'Enter') startSortie(selected);
    if (code === 'Escape') screen = 'title';
  } else if (screen === 'fly') {
    if (code === 'Space' && mission) mission.releaseBag(plane);
    if (code === 'KeyP') paused = !paused;
    if (code === 'Escape') { screen = 'title'; mission = null; demoHold = null; }
  } else if (screen === 'done') {
    if (code === 'Enter' || code === 'Escape') { screen = 'title'; mission = null; }
  }
});
addEventListener('pointerdown', () => sound.ensure());

function startSortie(index) {
  selected = index;
  mission = new Mission(SORTIES[index], plane, sound);
  // The campaign airframe: yesterday's bent wing is today's problem.
  if (airframeDamage > 0) plane.damage = airframeDamage;
  const w = SORTIES[index].weather.wind;
  plane.wind = { x: w.x, z: w.z, gust: w.gust };
  renderer.cam.follow(plane, 1, true);
  menuArmed = false;
  demoHold = null;
  banner = null;
  paused = false;
  screen = 'fly';
}

// --- Text screens ----------------------------------------------------------
function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(7, 14, 22, 0.78)';
  ctx.strokeStyle = 'rgba(150, 200, 235, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.stroke();
}

function text(str, x, y, size, color = '#dfeaf4', align = 'center', weight = 600) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function drawTitle() {
  panel(W / 2 - 330, 84, 660, 128);
  text('SKYWARD POST', W / 2, 134, 52, '#ffd98a', 'center', 800);
  text('6 sorties · 12 gates · 5 mail drops · 2 fires · 1 storm rescue · 1 carrier · day, storm and night', W / 2, 184, 16, '#9fd8ef');
  panel(W / 2 - 330, 232, 660, 292);
  SORTIES.forEach((s, i) => {
    const y = 270 + i * 44;
    if (i === selected) {
      ctx.fillStyle = 'rgba(255, 217, 138, 0.16)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 306, y - 19, 612, 40, 8);
      ctx.fill();
    }
    text(`${i + 1}  ${s.name}`, W / 2 - 288, y - 4, 18.5, i === selected ? '#ffd98a' : '#dfeaf4', 'left', 700);
    text(s.tagline, W / 2 + 288, y - 4, 12.5, '#8fb6cc', 'right');
    const log = pilotLog.get(s.id);
    text(log ? `BEST ${log.best} · RANK ${log.rank} · flown ${log.plays}×` : '— not flown yet —',
      W / 2 + 288, y + 14, 11.5, log ? '#7de08d' : '#5f7d90', 'right');
  });
  const camp = pilotLog.campaign(SORTIES);
  text(`CAMPAIGN — ${camp.flown} of ${SORTIES.length} sorties flown · best total ${camp.total - repairDebt} · ↑ ↓ choose · ENTER briefing`, W / 2, 552, 14.5, '#cfe3f2');
  if (airframeDamage > 0) {
    text(`AIRFRAME ${airframeDamage}% DAMAGED — she flies worse until repaired · R repair (−150 pts)`, W / 2, 578, 13.5, '#ffb02e');
  }
  text('ARROWS bank & pitch · W/S throttle · A/D rudder · SPACE drop · P pause', W / 2, 604, 13, '#8fb6cc');
}

function drawBrief() {
  const s = SORTIES[selected];
  panel(W / 2 - 330, 150, 660, 330);
  text(s.name, W / 2, 196, 30, '#ffd98a', 'center', 800);
  text(s.tagline, W / 2, 232, 15.5, '#9fd8ef');
  s.brief.forEach((line, i) => text(line, W / 2, 282 + i * 27, 16.5, '#dfeaf4'));
  if (airframeDamage > 0) {
    text(`Airframe ${airframeDamage}% damaged — more drag, softer controls, earlier stall`, W / 2, 440, 14, '#ffb02e');
    text('ENTER — take off', W / 2, 462, 17, '#7de08d');
  } else {
    text('ENTER — take off', W / 2, 428, 17, '#7de08d');
    text('ESC — back', W / 2, 452, 13.5, '#8fb6cc');
  }
}

function drawDone() {
  const r = mission.result;
  const won = mission.state === 'complete';
  panel(W / 2 - 320, 170, 640, 320);
  text(won ? 'SORTIE COMPLETE' : 'SORTIE OVER', W / 2, 214, 30, won ? '#7de08d' : '#ff5d47', 'center', 800);
  text(r.title, W / 2, 254, 18, '#ffd98a');
  r.lines.forEach((line, i) => text(line, W / 2, 296 + i * 26, 15.5, '#dfeaf4'));
  if (won) {
    text(`${r.score}`, W / 2 - 70, 420, 40, '#ffd98a', 'right', 800);
    text('points', W / 2 - 58, 428, 15, '#9fd8ef', 'left');
    text(`RANK ${r.rank}`, W / 2 + 90, 420, 40, '#7de08d', 'left', 800);
    if (lastWasBest) text('★ NEW BEST — the log book is updated', W / 2, 388, 15, '#ffd98a');
  }
  text('ENTER — back to the island', W / 2, 466, 14.5, '#8fb6cc');
}

// --- The frame -------------------------------------------------------------
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastStamp) / 1000;
  lastStamp = now;
  dt = Math.min(dt, 0.05);
  if (!paused) time += dt;

  const onMenu = screen === 'title' || screen === 'brief';
  if (onMenu) {
    // The island idles behind the menus, flown by the autopilot.
    if (!menuArmed) {
      plane.reset({ x: 1500, y: 300, z: 1500, yaw: 2.6, speed: 62, throttle: 0.62 });
      menuArmed = true;
    }
    demoHold = { heading: plane.yaw + 0.32, alt: 300 };
    const input = autopilotInput(plane, demoHold);
    plane.step(dt, input, time);
    traffic.step(dt, time);
    renderer.cam.follow(plane, dt);
    renderer.render(W, H, { plane, traffic: traffic.plane, time, gates: null, gateState: null, zones: null, activeZone: -1, bag: null, particles });
  } else if (screen === 'fly' || screen === 'done') {
    if (screen === 'fly' && !paused) {
      const input = demoHold ? autopilotInput(plane, demoHold) : pilotInput();
      const prevVs = plane.vspeed;
      const events = plane.step(dt, input, time);
      if (events.touchedDown) {
        sound.thud();
        // The arrival is felt as well as heard: shake with the sink.
        renderer.cam.shake = plane.crashed ? 0.55 : Math.min(0.5, 0.10 + Math.abs(prevVs) * 0.045);
      }
      if (plane.crashed === 'water') particles.spawn(plane.x, 2, plane.z, { n: 60, speed: 14, up: 12, ttl: 1.3, size: 5, color: '210,235,250' });
      if (plane.crashed) particles.spawn(plane.x, plane.y + 2, plane.z, { n: 40, speed: 9, up: 7, ttl: 1.1, size: 5, color: '70,70,70' });
      if (plane.onGround && plane.speed > 18) particles.spawn(plane.x, plane.y - 1, plane.z, { n: 2, speed: 3, up: 2, ttl: 0.7, size: 3, color: '200,190,160' });
      if (plane.damage > 45 && !plane.crashed && Math.random() < 0.5) {
        particles.spawn(plane.x, plane.y + 1, plane.z, { n: 2, speed: 1.5, up: 3, ttl: 1.2, size: 4, color: '60,60,60' });
      }
      mission.update(dt, plane, events);
      // The stall warning buzzes while the wing is stalled.
      if (plane.stalled && time - (frame.lastWarn || 0) > 0.55) {
        frame.lastWarn = time;
        sound.warn();
      }
      while (mission.popups.length) {
        const p = mission.popups.shift();
        banner = { text: p.text, sub: p.sub, until: time + 2.4 };
      }
      if (mission.state !== 'flying') {
        recordResult();
        screen = 'done';
      }
    }
    traffic.step(dt, time);
    particles.step(dt);
    renderer.cam.follow(plane, dt);
    const sc = mission.scene();
    renderer.render(W, H, { plane, traffic: traffic.plane, time, particles, weather: mission.sortie.weather, ...sc });
    drawPathMarker(ctx, W, H, plane, renderer.cam);
    // The drop sight, on sorties where SPACE lets something go:
    // the predicted splash point of a release made this second.
    if (screen === 'fly' && mission.state === 'flying') {
      const sightY = mission.dropSight();
      if (sightY !== null) drawDropSight(ctx, W, H, plane, renderer.cam, sightY);
    }
    drawInstruments(ctx, W, H, plane, mission.hud(), time);
    if (screen === 'fly' && mission.state === 'flying') {
      const o = mission.objective();
      if (o) {
        const dx = o.x - plane.x, dz = o.z - plane.z;
        let rel = Math.atan2(dx, -dz) - plane.yaw;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        drawObjective(ctx, W, H, { dist: Math.hypot(dx, dz), rel, label: o.label });
      }
    }
    if (banner && time < banner.until) {
      drawBanner(ctx, W, H, banner.text, banner.sub, Math.min(1, (banner.until - time) / 0.5));
    }
    if (paused) {
      panel(W / 2 - 170, H / 2 - 70, 340, 140);
      text('PAUSED', W / 2, H / 2 - 26, 30, '#ffd98a', 'center', 800);
      text('P — resume · ESC — abandon sortie', W / 2, H / 2 + 18, 14.5, '#cfe3f2');
    }
    if (screen === 'done') drawDone();
  }

  if (screen === 'title') drawTitle();
  if (screen === 'brief') drawBrief();
  sound.update(screen === 'fly' || screen === 'done' ? plane : null);
}

// Screenshot hooks: the maker stages real scenes of the running game.
window.SKYPOST = {
  start: (i) => startSortie(i),
  place: (props) => {
    Object.assign(plane, props);
    demoHold = { heading: plane.yaw, alt: plane.y };
    renderer.cam.follow(plane, 1, true);
  },
  hold: (heading, alt) => { demoHold = { heading, alt }; },
  release: () => { if (mission) mission.releaseBag(plane); },
  mission: () => (mission ? {
    id: mission.sortie.id, state: mission.state, nextGate: mission.nextGate,
    bagsLeft: mission.bagsLeft, drops: mission.dropScores.length,
    raftPhase: mission.raftPhase, raftScore: mission.raftScore,
    score: mission.result ? mission.result.score : null,
    wind: plane.wind, fuel: Math.round(plane.fuel), damage: Math.round(plane.damage),
    traffic: { x: Math.round(traffic.plane.x), y: Math.round(traffic.plane.y), z: Math.round(traffic.plane.z) },
    log: pilotLog.entries,
  } : null),
  state: () => ({ screen, x: plane.x, y: plane.y, z: plane.z, yaw: plane.yaw, speed: plane.speed, crashed: plane.crashed }),
  cam: () => ({
    pos: [renderer.cam.x, renderer.cam.y, renderer.cam.z],
    f: renderer.cam.f, r: renderer.cam.r, u: renderer.cam.u,
    centre: renderer.cam.project(plane.x, plane.y, plane.z, W, H),
    nose: renderer.cam.project(plane.x, plane.y, plane.z + 1, W, H),
  }),
};

requestAnimationFrame(frame);
document.getElementById('boot').style.opacity = '0';
