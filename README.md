# shokGD

A photoreal-ish open-world desi experience, starting from the smallest thing
that can feel real: **one 200m gali**. Think 40-feet-road C1 Janakpuri — cows,
chai stalls, tangled overhead wires, mismatched signboards, honks.

v0.1 ships as a web game (Babylon.js) so we can iterate fast and you can walk
the lane by opening a URL.

## scope — v0.1

- single 200m lane, daylight
- ~20 NPCs wandering the pavements
- 1 cow wandering the road
- ≥5 shops with procedurally-painted Devanagari + English signage (+ filler shopfronts)
- 1 chai stall with steam particles
- procedural ambient audio: traffic chatter bed, random honks, distant temple bell
- FPV walking camera with collision against shopfronts
- full initial load — no progressive streaming yet
- deploys to GitHub Pages on every push to the main feature branch

## dev

```bash
npm install
npm run dev           # vite dev server at http://localhost:5173
npm run build         # typecheck + vite build into dist/
npm run preview       # serve dist/ locally
npm run smoke         # headless puppeteer smoke test (run after build)
```

## controls

- `W` `A` `S` `D` — walk
- `Shift` — run
- `Mouse` — look
- `Esc` — release pointer lock

## deploy

A push to `claude/india-open-world-env-sXbSk` or `main` triggers
`.github/workflows/deploy.yml`, which builds and publishes `dist/` to GitHub
Pages. Enable Pages once in repo **Settings → Pages → Source: GitHub Actions**.

## project layout

```
src/
  main.ts              # entry, loader, hand-off to game
  game.ts              # engine + scene orchestration + render loop
  scene/
    sky.ts             # gradient skydome + sun + hemi bounce
    lane.ts            # road, pavements, kerbs, end-caps, overhead wires
    shops.ts           # procedural shopfronts + banners + bins + scooters
    signage.ts         # canvas-to-texture signboard painter
    chaiStall.ts       # cart + kettle + tarp + steam particles
  npc/
    crowd.ts           # spawn + wander AI for 20 NPCs
    cow.ts             # spawn + wander AI for the cow
  player/
    controller.ts      # FPV walking, WASD + pointer lock + ellipsoid collision
  audio/
    ambient.ts         # pink-noise bed + synthesized honks + bells
  util/
    rand.ts            # seeded PRNG so layout is stable across reloads
    desi.ts            # shop name pool (Devanagari + English), phone template
```

## known gaps (intentional for v0.1)

- no NPC/cow collision with the player — you can clip through them
- no interactions (buy chai, haggle, pet cow — all later)
- no night/dusk, no weather, no particles for dust haze
- no real photogrammetry assets — everything is procedural boxes + painted canvases
- mobile is not tuned

These are tracked for v0.2.
