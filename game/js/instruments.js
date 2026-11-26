// instruments.js — the panel the pilot actually flies by.
//
// Everything is drawn on the 2D canvas over the 3D view: a heading tape
// across the top, airspeed and altitude tapes down the sides, an
// artificial horizon with a pitch ladder, and throttle, fuel and damage
// gauges along the bottom. Amber on dark glass, lit like real lamps.

const PANEL = 'rgba(8, 16, 24, 0.62)';
const EDGE = 'rgba(150, 200, 235, 0.5)';
const LIT = '#ffd98a';
const CYAN = '#9fd8ef';
const RED = '#ff5d47';
const GREEN = '#7de08d';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function box(ctx, x, y, w, h, r = 8) {
  ctx.fillStyle = PANEL;
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}

function label(ctx, text, x, y, size = 11, color = CYAN, align = 'center') {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

// The compass ribbon across the top: ticks every 10 degrees, letters
// for the cardinals, the current heading boxed in the middle.
function headingTape(ctx, w, headingDeg) {
  const bw = 430, x0 = w / 2 - bw / 2, y = 14;
  box(ctx, x0, y, bw, 40);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 + 4, y + 3, bw - 8, 34);
  ctx.clip();
  const pxPerDeg = 3.4;
  const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  for (let d = -60; d <= 60; d += 5) {
    let deg = Math.round((headingDeg + d) / 5) * 5;
    const shown = ((deg % 360) + 360) % 360;
    const x = w / 2 + (deg - headingDeg) * pxPerDeg;
    if (shown % 30 === 0) {
      label(ctx, names[shown] || String(shown / 10).padStart(2, '0'), x, y + 15, 13, shown % 90 === 0 ? LIT : CYAN);
      ctx.strokeStyle = EDGE;
      ctx.beginPath(); ctx.moveTo(x, y + 27); ctx.lineTo(x, y + 35); ctx.stroke();
    } else if (shown % 10 === 0) {
      ctx.strokeStyle = EDGE;
      ctx.beginPath(); ctx.moveTo(x, y + 29); ctx.lineTo(x, y + 35); ctx.stroke();
    }
  }
  ctx.restore();
  ctx.fillStyle = LIT;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 5, y + 42); ctx.lineTo(w / 2 + 5, y + 42); ctx.lineTo(w / 2, y + 50);
  ctx.closePath(); ctx.fill();
  label(ctx, `${Math.round(headingDeg)}°`, w / 2, y + 62, 14, LIT);
}

// A vertical tape (airspeed on the left, altitude on the right) with a
// boxed readout of the current value. bands, when given, are coloured
// ranges painted on the tape's edge: the airspeed tape carries a red
// stall band and an amber approach band, like a real ASI.
function verticalTape(ctx, x, y, h, value, step, fmt, title, warn, bands) {
  box(ctx, x, y, 86, h);
  label(ctx, title, x + 43, y + 13, 10.5);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 3, y + 22, 80, h - 48);
  ctx.clip();
  const mid = y + h / 2 + 8;
  const pxPerUnit = 1.6;
  if (bands) {
    for (const b of bands) {
      const yTop = mid - (b.to - value) * pxPerUnit;
      const yBot = mid - (b.from - value) * pxPerUnit;
      ctx.fillStyle = b.color;
      ctx.fillRect(x + 74, yTop, 9, Math.max(2, yBot - yTop));
    }
  }
  const first = Math.floor((value - (h / 2) / pxPerUnit) / step) * step;
  for (let v = first; v < value + (h / 2) / pxPerUnit + step; v += step) {
    if (v < 0) continue;
    const yy = mid - (v - value) * pxPerUnit;
    ctx.strokeStyle = EDGE;
    ctx.beginPath(); ctx.moveTo(x + 58, yy); ctx.lineTo(x + 70, yy); ctx.stroke();
    label(ctx, fmt(v), x + 34, yy, 11.5, CYAN);
  }
  ctx.restore();
  // The readout box rides the middle of the tape.
  ctx.fillStyle = warn ? RED : '#101c28';
  ctx.strokeStyle = warn ? RED : LIT;
  ctx.beginPath();
  ctx.roundRect(x + 8, mid - 14, 70, 28, 5);
  ctx.fill(); ctx.stroke();
  label(ctx, fmt(value), x + 43, mid, 15, warn ? '#fff' : LIT);
}

function artificialHorizon(ctx, x, y, r, plane) {
  box(ctx, x - r - 10, y - r - 10, (r + 10) * 2, (r + 10) * 2, 12);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-plane.roll);
  const pitchPx = clamp(plane.pitch, -0.9, 0.9) * (r / 0.5);
  ctx.translate(0, pitchPx);
  // Sky and ground of the little world inside the gauge.
  ctx.fillStyle = '#3f74a8';
  ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 1.6);
  ctx.fillStyle = '#7a5c36';
  ctx.fillRect(-r * 1.6, 0, r * 3.2, r * 1.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1;
  for (const deg of [-20, -10, 10, 20]) {
    const yy = -deg * (r / 28);
    const half = deg % 20 === 0 ? r * 0.42 : r * 0.26;
    ctx.beginPath(); ctx.moveTo(-half, yy); ctx.lineTo(half, yy); ctx.stroke();
  }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-r * 1.6, 0); ctx.lineTo(r * 1.6, 0); ctx.stroke();
  ctx.restore();
  // The fixed aircraft symbol and the roll pointer live outside the clip.
  ctx.strokeStyle = LIT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.52, y); ctx.lineTo(x - r * 0.16, y); ctx.lineTo(x - r * 0.16, y + 5);
  ctx.moveTo(x + r * 0.52, y); ctx.lineTo(x + r * 0.16, y); ctx.lineTo(x + r * 0.16, y + 5);
  ctx.stroke();
  ctx.fillStyle = LIT;
  ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
  const a = -plane.roll;
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(x + Math.sin(a) * (r - 6), y - Math.cos(a) * (r - 6));
  ctx.lineTo(x + Math.sin(a - 0.16) * (r - 16), y - Math.cos(a - 0.16) * (r - 16));
  ctx.lineTo(x + Math.sin(a + 0.16) * (r - 16), y - Math.cos(a + 0.16) * (r - 16));
  ctx.closePath(); ctx.fill();
  label(ctx, 'ATTITUDE', x, y + r + 22, 10.5);
}

// A labelled horizontal bar: throttle, fuel, damage share the shape.
function gaugeBar(ctx, x, y, w, title, frac, color, text) {
  label(ctx, title, x, y - 2, 10.5, CYAN, 'left');
  ctx.fillStyle = 'rgba(10,20,30,0.7)';
  ctx.strokeStyle = EDGE;
  ctx.beginPath(); ctx.roundRect(x, y + 6, w, 13, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(x + 1.5, y + 7.5, Math.max(0, (w - 3) * clamp(frac, 0, 1)), 10, 3); ctx.fill();
  label(ctx, text, x + w + 8, y + 12, 12, color, 'left');
}

// The whole panel for one frame of flight. mission: {title, lines} or null.
export function drawInstruments(ctx, w, h, plane, mission, time) {
  const kt = plane.speed * 1.944;
  const altM = Math.max(0, plane.y);
  headingTape(ctx, w, plane.headingDeg());
  // Stall at 27 m/s is 52 kt; the approach band runs to 68 kt.
  const asiBands = [
    { from: 0, to: 52, color: 'rgba(255,93,71,0.55)' },
    { from: 52, to: 68, color: 'rgba(255,176,46,0.45)' },
  ];
  verticalTape(ctx, 16, h / 2 - 130, 250, kt, 20, (v) => `${Math.round(v)}`, 'AIRSPEED KT', plane.stalled, asiBands);
  verticalTape(ctx, w - 102, h / 2 - 130, 250, altM, 50, (v) => `${Math.round(v)}`, 'ALTITUDE M', false);
  // Vertical speed tucked under the altitude tape, coloured by the
  // touchdown bands the landing judge uses: amber past -3.6, red past -6.
  const vs = plane.vspeed;
  label(ctx, `VSI ${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`, w - 59, h / 2 + 138, 12, vs < -6 ? RED : vs < -3.6 ? '#ffb02e' : CYAN);

  artificialHorizon(ctx, 128, h - 118, 62, plane);

  // Throttle, fuel and damage along the bottom middle.
  const gx = 250, gw = 240;
  gaugeBar(ctx, gx, h - 96, gw, 'THROTTLE', plane.throttle, LIT, `${Math.round(plane.throttle * 100)}%`);
  const fuelColor = plane.fuel < 20 ? RED : plane.fuel < 45 ? '#ffb02e' : GREEN;
  gaugeBar(ctx, gx, h - 62, gw, 'FUEL', plane.fuel / 100, fuelColor, `${Math.round(plane.fuel)}%`);
  if (plane.damage > 0) {
    gaugeBar(ctx, gx, h - 28, gw, 'DAMAGE', plane.damage / 100, RED, `${Math.round(plane.damage)}%`);
  }

  // The wind the sortie actually flies in, bottom right: calm on a fair
  // day, a number and a warning when the weather is a decision.
  const windSpd = Math.hypot(plane.wind.x, plane.wind.z);
  const windTxt = windSpd < 0.5 ? 'WIND CALM' : `WIND ${Math.round(windSpd)} M/S${plane.wind.gust > 1.2 ? ' · GUSTING' : ''}`;
  label(ctx, `${windTxt} · ISLAND TIME ${new Date(0, 0, 0, 0, 0, Math.floor(time) % 3600).toTimeString().slice(3, 8)}`, w - 130, h - 24, 10.5, windSpd < 0.5 ? 'rgba(200,225,245,0.75)' : '#ffb02e');

  // The sortie card, top left: what you are doing and how it is going.
  if (mission) {
    const lines = mission.lines;
    box(ctx, 16, 14, 252, 44 + lines.length * 19);
    label(ctx, mission.title, 30, 36, 13.5, LIT, 'left');
    lines.forEach((ln, i) => label(ctx, ln, 30, 60 + i * 19, 12, CYAN, 'left'));
  }

  // Warnings shout from the middle of the screen.
  ctx.textAlign = 'center';
  if (plane.stalled && Math.floor(time * 3) % 2 === 0) {
    label(ctx, 'STALL', w / 2, h * 0.30, 30, RED);
    label(ctx, 'nose dropping — build speed', w / 2, h * 0.30 + 30, 13, RED);
  } else if (plane.fuel <= 0) {
    label(ctx, 'FUEL EXHAUSTED — GLIDE', w / 2, h * 0.30, 20, RED);
  } else if (plane.fuel < 18) {
    label(ctx, 'LOW FUEL', w / 2, h * 0.30, 17, '#ffb02e');
  } else if (plane.damage >= 40) {
    // Past 40 the airframe itself flies worse (aircraft.js applies it);
    // the panel says so before the pilot blames the wind.
    label(ctx, 'AIRFRAME DAMAGED — HANDLING DEGRADED', w / 2, h * 0.30, 15, '#ffb02e');
  }
}

// The objective cue under the heading tape: an arrow on the relative
// bearing to the next thing the sortie wants, with its distance. obj is
// {dist, rel, label} or null. Criterion 1 lives here: the target is
// always findable, and "ahead" is visible at a glance.
export function drawObjective(ctx, w, h, obj) {
  if (!obj) return;
  const cx = w / 2, cy = 96;
  const ahead = Math.abs(obj.rel) < 0.25;
  ctx.save();
  ctx.translate(cx - 58, cy);
  ctx.rotate(clamp(obj.rel, -1.2, 1.2));
  ctx.fillStyle = ahead ? GREEN : LIT;
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 2.5); ctx.lineTo(-5.5, 6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  const distTxt = obj.dist >= 1000 ? `${(obj.dist / 1000).toFixed(1)} KM` : `${Math.round(obj.dist)} M`;
  label(ctx, `${obj.label} · ${distTxt}`, cx + 8, cy, 13, ahead ? GREEN : CYAN, 'left');
}

// A centred event banner: gate cleared, mail away, touchdown judged.
export function drawBanner(ctx, w, h, text, sub, alpha) {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = 'rgba(8,16,24,0.66)';
  const tw = Math.max(320, text.length * 17);
  ctx.beginPath();
  ctx.roundRect(w / 2 - tw / 2, h * 0.16, tw, sub ? 86 : 58, 10);
  ctx.fill();
  label(ctx, text, w / 2, h * 0.16 + 30, 24, LIT);
  if (sub) label(ctx, sub, w / 2, h * 0.16 + 60, 14, CYAN);
  ctx.restore();
}

// The little cross the pilot flies toward: a flight-path marker.
export function drawPathMarker(ctx, w, h, plane) {
  const cx = w / 2, cy = h / 2;
  const dx = clamp(-plane.roll * 30, -40, 40);
  ctx.strokeStyle = 'rgba(125,224,141,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx + dx, cy + 26, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + dx - 20, cy + 26); ctx.lineTo(cx + dx - 10, cy + 26);
  ctx.moveTo(cx + dx + 10, cy + 26); ctx.lineTo(cx + dx + 20, cy + 26);
  ctx.moveTo(cx + dx, cy + 17); ctx.lineTo(cx + dx, cy + 12);
  ctx.stroke();
}
