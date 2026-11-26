# Skyward Post — 4 sorties, 12 gates, 3 mail drops, 1 storm rescue, 1 carrier, one island

[![best-flight-game-20261126-0057 on make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Ash9at/makefun-best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Ash9at/makefun-best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

An original chase-view flight game for the make.fun [best flight game](https://make.fun/bounty/best-flight-game-20261126-0057) bounty, written from scratch in hand-rolled vanilla JavaScript — no engine, no libraries, no assets. A tiny 3D projector drawn on a 2D canvas flies a mail plane over a procedural island: one volcanic cone with a town, a strip, pine slopes, and an aircraft carrier riding at anchor offshore.

## The sorties

1. **Gate Circuit** — 12 rings around the island against the clock; the clock starts at the first ring, and the full score needs a landing back on the strip. Rings 4 and 8 hug the volcano's shoulders and ring 10 grazes the south-west ridge, so the route alternates high cruising with thread-the-needle flying.
2. **Mail Drop** — 3 mail bags for 3 painted circles (the town green, the south farm, the lighthouse point). Bags keep the plane's speed and fall under a canopy: lead the target, score by the metre.
3. **Carrier Landing** — one 300 m deck, a yellow touchdown box, judged on centreline deviation, touchdown zone and sink rate.
4. **Storm Rescue** — a fishing boat dead in a dusk storm south-east of the island. Weather is a system here, not a skin: rain, fog, a steady westerly drift and gusts that shove the nose and rock the wings. Find her by her red flare, drop the supply raft alongside (scored by the metre), then get home and land — on the strip, or, bravely, on the deck.
5. **Free Flight** — take off from the strip and fly the island as you like.

The island is alive while you fly it: fishing boats steam their routes offshore, birds work the thermals off the cone, and a second mail plane flies its own circuit all day. A pilot log on the title screen keeps your best score and rank per sortie and the campaign total for the session.

Flying rewards discipline: banks make the turns, speed makes the lift, and below the 27 m/s stall the nose drops and the airframe buffets. Fuel burns with the throttle and hard arrivals bend the plane — damage and an empty tank both turn a sortie into decisions.

## The panel

A lit instrument set flies with you: heading tape, airspeed and altitude tapes, an artificial horizon with a pitch ladder and roll pointer, vertical speed, and throttle, fuel and damage gauges. The engine, the wind and every chime are synthesised live with WebAudio — there are no audio files.

## Controls

| Key | Does |
| --- | --- |
| ↑ / ↓ | pitch (climb / descend) |
| ← / → | bank (banks do the turning) |
| W / S | throttle up / down |
| A / D | rudder |
| SPACE | release a mail bag |
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

- `game/js/world.js` — the island: height field, runway and town flattening, carrier, gates, drop zones, scenery, and the living traffic of boats and birds.
- `game/js/renderer.js` — the hand-rolled 3D projector: chase camera, terrain, carrier, rings, boats, weather (storm sky, fog, rain, the rescue flare), and the polygon-built mail plane.
- `game/js/aircraft.js` — the flight model: throttle, coordinated turns, stall, wind and gusts, fuel, damage, landing and crash judgement.
- `game/js/missions.js` — the four sorties and free flight: objectives, weather, scoring, debriefs.
- `game/js/instruments.js` — the HUD: tapes, horizon, gauges, banners.
- `game/js/audio.js` — the synthesised engine, wind and chimes.
- `game/js/game.js` — boot, keyboard, screens (title, briefing, flying, debrief) and the frame loop.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output and writes `dossier.json` with the vendored make.fun library (`vendor/makefun-game.ts`, unchanged from the kit).

## License

MIT — see `LICENSE`.
