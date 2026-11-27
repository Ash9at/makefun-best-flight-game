// input.js — the keyboard: what is held, and what the held keys mean
// for the plane.
//
// game.js owns the screens and asks this file two things: tell me
// when a key is pressed (menus, drops, repairs), and turn the held
// keys into one frame of pilot input. Nothing here knows what a
// sortie is, and nothing in the flying files knows what a key is.

export const keys = new Set();

// Discrete presses go to onPress(code); the held set lives here.
// Arrows and space are claimed so the page never scrolls out from
// under a pilot's hands.
export function attachKeys(onPress) {
  addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    onPress(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  // If the window loses focus mid-press (an alt-tab with the
  // throttle held), the keyup never arrives and the key would
  // stay held forever. Letting go of the window is letting go
  // of the keys.
  addEventListener('blur', () => keys.clear());
}

// One frame of stick, rudder and throttle from the held keys.
export function pilotInput() {
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
