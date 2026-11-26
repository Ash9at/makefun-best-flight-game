# Skyward Post — 3 sorties, 8 gates, 3 mail drops, 1 carrier, one island

[![best-flight-game-20261126-0057 on make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Ash9at/makefun-best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Ash9at/makefun-best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

An original chase-view flight game for the make.fun [best flight game](https://make.fun/bounty/best-flight-game-20261126-0057) bounty, written from scratch in hand-rolled vanilla JavaScript — no engine, no libraries, no assets. A tiny 3D projector drawn on a 2D canvas flies a mail plane over a procedural island: one volcanic cone with a town, a strip, pine slopes, and an aircraft carrier riding at anchor offshore.

## The sorties

1. **Gate Circuit** — 8 rings around the island against the clock; the clock starts at the first ring, and the full score needs a landing back on the strip.
2. **Mail Drop** — 3 mail bags for 3 painted circles (the town green, the south farm, the lighthouse point). Bags keep the plane's speed and fall under a canopy: lead the target, score by the metre.
3. **Carrier Landing** — one 300 m deck, a yellow touchdown box, judged on centreline deviation, touchdown zone and sink rate.
4. **Free Flight** — take off from the strip and fly the island as you like.

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

- `game/js/world.js` — the island: height field, runway and town flattening, carrier, gates, drop zones, scenery.
- `game/js/renderer.js` — the hand-rolled 3D projector: chase camera, terrain, carrier, rings, and the polygon-built mail plane.
- `game/js/aircraft.js` — the flight model: throttle, coordinated turns, stall, fuel, damage, landing and crash judgement.
- `game/js/missions.js` — the three sorties and free flight: objectives, scoring, debriefs.
- `game/js/instruments.js` — the HUD: tapes, horizon, gauges, banners.
- `game/js/audio.js` — the synthesised engine, wind and chimes.
- `game/js/game.js` — boot, keyboard, screens (title, briefing, flying, debrief) and the frame loop.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output and writes `dossier.json` with the vendored make.fun library (`vendor/makefun-game.ts`, unchanged from the kit).

## License

MIT — see `LICENSE`.
