// game.js — Skyward Post: boot, input, screens and the frame loop.
//
// The flow is title -> briefing -> flying -> debrief, with the island
// always live behind the menus. This file owns the keyboard, the camera
// direction and the banner queue; the flying itself lives in
// aircraft.js, the jobs in missions.js, the panel in instruments.js.

import { Renderer, Particles } from './renderer.js';
import { Aircraft } from './aircraft.js';
import { Mission, SORTIES } from './missions.js';
import { drawInstruments, drawBanner, drawPathMarker } from './instruments.js';
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

let screen = 'title'; // title | brief | fly | done
let selected = 0; // sortie index on the title screen
let mission = null;
let banner = null; // {text, sub, until}
let time = 0;
let lastStamp = performance.now();
let paused = false;
let menuArmed = false; // the menu's autopilot flight is set up once

// Demo hold: an autopilot that keeps the plane on a heading and height.
// The title screen uses it to fly the island; screenshots use it too.
let demoHold = null; // {heading, alt}
function autopilotInput() {
  const b = plane.basis();
  let headErr = demoHold.heading - plane.yaw;
  while (headErr > Math.PI) headErr -= Math.PI * 2;
  while (headErr < -Math.PI) headErr += Math.PI * 2;
  const altErr = demoHold.alt - plane.y;
  return {
    roll: Math.max(-1, Math.min(1, headErr * 1.4)),
    pitch: Math.max(-1, Math.min(1, altErr * 0.012 - plane.vspeed * 0.02)),
    throttleDelta: 0,
    rudder: 0,
    _b: b,
  };
}

// --- Keyboard ------------------------------------------------------------
const keys = new Set();
addEventListener('keydown', (e) => {
  sound.ensure();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (screen === 'title') {
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= SORTIES.length) { selected = n - 1; screen = 'brief'; }
    }
    if (e.code === 'Enter') screen = 'brief';
    if (e.code === 'ArrowUp') selected = (selected + SORTIES.length - 1) % SORTIES.length;
    if (e.code === 'ArrowDown') selected = (selected + 1) % SORTIES.length;
  } else if (screen === 'brief') {
    if (e.code === 'Enter') startSortie(selected);
    if (e.code === 'Escape') screen = 'title';
  } else if (screen === 'fly') {
    if (e.code === 'Space' && mission) mission.releaseBag(plane);
    if (e.code === 'KeyP') paused = !paused;
    if (e.code === 'Escape') { screen = 'title'; mission = null; demoHold = null; }
  } else if (screen === 'done') {
    if (e.code === 'Enter' || e.code === 'Escape') { screen = 'title'; mission = null; }
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('pointerdown', () => sound.ensure());

function pilotInput() {
  const input = { pitch: 0, roll: 0, throttleDelta: 0, rudder: 0 };
  if (keys.has('ArrowUp')) input.pitch += 1;
  if (keys.has('ArrowDown')) input.pitch -= 1;
  if (keys.has('ArrowLeft')) input.roll -= 1;
  if (keys.has('ArrowRight')) input.roll += 1;
  if (keys.has('KeyA')) input.rudder = -1;
  if (keys.has('KeyD')) input.rudder = 1;
  if (keys.has('KeyW')) input.throttleDelta += 1;
  if (keys.has('KeyS')) input.throttleDelta -= 1;
  return input;
}

function startSortie(index) {
  selected = index;
  mission = new Mission(SORTIES[index], plane, sound);
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
  panel(W / 2 - 330, 88, 660, 128);
  text('SKYWARD POST', W / 2, 138, 52, '#ffd98a', 'center', 800);
  text('3 sorties · 8 gates · 3 mail drops · 1 carrier · one island', W / 2, 188, 16.5, '#9fd8ef');
  panel(W / 2 - 330, 244, 660, 218);
  SORTIES.forEach((s, i) => {
    const y = 282 + i * 46;
    if (i === selected) {
      ctx.fillStyle = 'rgba(255, 217, 138, 0.16)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 306, y - 19, 612, 38, 8);
      ctx.fill();
    }
    text(`${i + 1}  ${s.name}`, W / 2 - 288, y, 19, i === selected ? '#ffd98a' : '#dfeaf4', 'left', 700);
    text(s.tagline, W / 2 - 288, y + 0, 13.5, '#8fb6cc', 'right');
  });
  text('↑ ↓ choose · ENTER briefing', W / 2, 500, 15, '#cfe3f2');
  text('ARROWS bank & pitch · W/S throttle · A/D rudder · SPACE drop mail · P pause', W / 2, 528, 13.5, '#8fb6cc');
}

function drawBrief() {
  const s = SORTIES[selected];
  panel(W / 2 - 330, 150, 660, 330);
  text(s.name, W / 2, 196, 30, '#ffd98a', 'center', 800);
  text(s.tagline, W / 2, 232, 15.5, '#9fd8ef');
  s.brief.forEach((line, i) => text(line, W / 2, 282 + i * 27, 16.5, '#dfeaf4'));
  text('ENTER — take off', W / 2, 428, 17, '#7de08d');
  text('ESC — back', W / 2, 452, 13.5, '#8fb6cc');
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
    const input = autopilotInput();
    plane.step(dt, input, time);
    renderer.cam.follow(plane, dt);
    renderer.render(W, H, { plane, time, gates: null, gateState: null, zones: null, activeZone: -1, bag: null, particles });
  } else if (screen === 'fly' || screen === 'done') {
    if (screen === 'fly' && !paused) {
      const input = demoHold ? autopilotInput() : pilotInput();
      const events = plane.step(dt, input, time);
      if (events.touchedDown) sound.thud();
      if (plane.crashed === 'water') particles.spawn(plane.x, 2, plane.z, { n: 60, speed: 14, up: 12, ttl: 1.3, size: 5, color: '210,235,250' });
      if (plane.crashed) particles.spawn(plane.x, plane.y + 2, plane.z, { n: 40, speed: 9, up: 7, ttl: 1.1, size: 5, color: '70,70,70' });
      if (plane.onGround && plane.speed > 18) particles.spawn(plane.x, plane.y - 1, plane.z, { n: 2, speed: 3, up: 2, ttl: 0.7, size: 3, color: '200,190,160' });
      if (plane.damage > 45 && !plane.crashed && Math.random() < 0.5) {
        particles.spawn(plane.x, plane.y + 1, plane.z, { n: 2, speed: 1.5, up: 3, ttl: 1.2, size: 4, color: '60,60,60' });
      }
      mission.update(dt, plane, events);
      while (mission.popups.length) {
        const p = mission.popups.shift();
        banner = { text: p.text, sub: p.sub, until: time + 2.4 };
      }
      if (mission.state !== 'flying') screen = 'done';
    }
    particles.step(dt);
    renderer.cam.follow(plane, dt);
    const sc = mission.scene();
    renderer.render(W, H, { plane, time, particles, ...sc });
    drawPathMarker(ctx, W, H, plane);
    drawInstruments(ctx, W, H, plane, mission.hud(), time);
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
