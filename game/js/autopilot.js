// autopilot.js — the demo hold.
//
// Keeps the plane on a heading and a height: the title screen uses it
// to fly the island behind the menus, and screenshot staging uses it
// to hold a scene steady. It produces the same input shape the
// keyboard does, so the Aircraft cannot tell the difference.

export function autopilotInput(plane, hold) {
  let headErr = hold.heading - plane.yaw;
  while (headErr > Math.PI) headErr -= Math.PI * 2;
  while (headErr < -Math.PI) headErr += Math.PI * 2;
  const altErr = hold.alt - plane.y;
  return {
    roll: Math.max(-1, Math.min(1, headErr * 1.4)),
    pitch: Math.max(-1, Math.min(1, altErr * 0.012 - plane.vspeed * 0.02)),
    throttleDelta: 0,
    rudder: 0,
  };
}
