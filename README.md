# Skyward Post — 6 sorties, 12 gates, 5 mail drops, 2 fires, 1 storm rescue, 1 carrier — day, storm and night

[![best-flight-game-20261126-0057 on make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Ash9at/makefun-best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Ash9at/makefun-best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

An original chase-view flight game for the make.fun [best flight game](https://make.fun/bounty/best-flight-game-20261126-0057) bounty, written from scratch in hand-rolled vanilla JavaScript — no engine, no libraries, no assets. A tiny 3D projector drawn on a 2D canvas flies a mail plane over a procedural island with named, navigable landmarks: one volcanic cone, the town of Port Sable with its coast road, a strip, the south farm's field patchwork, a lighthouse on the east point, and an aircraft carrier riding at anchor offshore.

## The sorties

1. **Gate Circuit** — 12 rings around the island against the clock; the clock starts at the first ring, and the full score needs a landing back on the strip. Rings 4 and 8 hug the volcano's shoulders and ring 10 grazes the south-west ridge, so the route alternates high cruising with thread-the-needle flying. A mid-circuit pit stop on the strip trades 25 s of clock for fuel and repairs.
2. **Mail Drop** — 3 mail bags for 3 painted circles (the town green, the south farm, the lighthouse point). Bags keep the plane's speed and fall under a canopy: lead the target, score by the metre. A release flown low and slow — under 75 m and under 46 m/s, right where the stall lives — earns +60: risk is priced into every drop.
3. **Carrier Landing** — one 300 m deck, a yellow touchdown box, judged on centreline deviation, touchdown zone and sink rate.
4. **Storm Rescue** — a fishing boat dead in a dusk storm south-east of the island. Weather is a system here, not a skin: rain, fog, a steady westerly drift and gusts that shove the nose and rock the wings. Find her by her red flare, drop the supply raft alongside (scored by the metre), then get home and land — on the strip, or, bravely, on the deck.
5. **Night Mail** — the island after dark: 2 bags for 2 lantern-lit circles, navigating by the lit strip, the town's windows and the lighthouse's sweeping beam, flying the panel all the way.
6. **Forest Fire** — two seats of fire in the pine woods, found by their own smoke columns, and 3 water bags to douse them with: one spare, no more. A bag dropped into the painted ring scores by the metre and low-and-slow earns its +60 here too — but a miss does not move on: the fire keeps burning, the spare is spent circling back, and when the bags are gone the sortie ends on whatever was saved.
7. **Free Flight — First Flight** — a guided first lap (throttle, lift-off, a banked circle, a landing, one prompted step at a time), then the island is yours for as long as you like.

The island is alive while you fly it: fishing boats steam their routes offshore, birds work the thermals off the cone, and a second mail plane flies its own circuit all day. A pilot log on the title screen keeps your best score and rank per sortie and the campaign total for the session — and the campaign has a memory of its own: **damage carries from sortie to sortie**. End a flight bent and the next one starts bent, flying worse until you pay 150 campaign points for a repair on the title screen (a crash writes the airframe off, and its replacement is free). Push on damaged, or pay — the decision outlives any single sortie.

Flying rewards discipline: banks make the turns, speed makes the lift, and below the 27 m/s stall the nose drops and the airframe buffets. Fuel burns with the throttle and hard arrivals bend the plane — damage and an empty tank both turn a sortie into decisions. An empty tank is not the end: the engine dies, the warning reads FUEL EXHAUSTED — GLIDE, and a dead-stick landing on the strip still counts.

## The panel

A lit instrument set flies with you: heading tape, airspeed and altitude tapes with the stall and approach bands painted on the speed tape, an artificial horizon with a pitch ladder and roll pointer, vertical speed coloured by the landing judge's own bands, and throttle, fuel and damage gauges. In the middle of the view sits a true flight-path vector — the velocity itself, wind drift and stall slide included, projected onto the world: put it on the touchdown box and that is where the wheels arrive. The engine, the wind, the stall warning and every chime are synthesised live with WebAudio — there are no audio files, and when the tank runs dry the engine winds down to a windmilling prop and only the wind is left.

## Controls

| Key | Does |
| --- | --- |
| ↑ / ↓ | pitch (climb / descend) |
| ← / → | bank (banks do the turning) |
| W / S | throttle up / down |
| A / D | rudder |
| SPACE | release a mail bag |
| R | repair the campaign airframe (title screen, −150 pts) |
| P | pause |
| ENTER | confirm on the menus |
| ESC | back / abandon sortie |

## Play it

Serve `game/` with any static file server and open `index.html` in desktop Chrome — it loads nothing from the network:

```
node -e "require('http').createServer((q,r)=>{const fs=require('fs');const p=q.url=='/'?'/index.html':q.url;try{r.end(fs.readFileSync('game'+p))}catch{r.statusCode=404;r.end()}}).listen(8080)"
```

## How it is built

Every file has one job, and the names say which:

- `game/js/world.js` — the island: height field, runway and town flattening, carrier, gates, drop zones, the fire seats, and the landmarks (lighthouse, farm fields, roads), plus the living traffic of boats and birds.
- `game/js/renderer.js` — the hand-rolled 3D projector: terrain, carrier, rings, boats, landmarks, fires, and the weather (day, storm sky, fog, rain, the rescue flare, and the full night: stars, moon, lit windows, strip lights, the lighthouse beam).
- `game/js/camera.js` — the chase camera, its projection, and touchdown shake.
- `game/js/particles.js` — dust, spray and damage smoke.
- `game/js/aircraft.js` — the flight model: throttle, coordinated turns, stall, wind and gusts, fuel, damage, landing and crash judgement.
- `game/js/missions.js` — the six sorties and free flight: objectives, weather, scoring, debriefs.
- `game/js/traffic.js` — the other mail plane on its all-day circuit.
- `game/js/autopilot.js` — the demo hold that flies the menus.
- `game/js/pilotlog.js` — the session log book behind the campaign board.
- `game/js/instruments.js` — the HUD: tapes, horizon, the flight-path vector, gauges, banners.
- `game/js/audio.js` — the synthesised engine, wind, stall warning and chimes.
- `game/js/input.js` — the keyboard: the held-key set and what the held keys mean for the plane.
- `game/js/game.js` — boot, screens (title, briefing, flying, debrief) and the frame loop.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output and writes `dossier.json` with the vendored make.fun library (`vendor/makefun-game.ts`, unchanged from the kit).

## License

MIT — see `LICENSE`.
