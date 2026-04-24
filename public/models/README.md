# Model drop zone

Drop `.glb` files here with the exact filenames the game expects. Anything
missing is silently replaced by the procedural primitive (box-cow, box-human,
etc) — so you can add models one at a time without breaking the build.

## Expected filenames

| Filename                     | Used for                           | Priority |
|------------------------------|------------------------------------|----------|
| `erickshaw.glb`              | Electric rickshaw (parked + moving) | **high** |
| `cow.glb`                    | Wandering cow on the road           | **high** |
| `npc_male_kurta.glb`         | Male NPCs (kurta/shirt)             | **high** |
| `npc_female_saree.glb`       | Female NPCs (saree/salwar)          | **high** |
| `auto_rickshaw.glb`          | Auto (3-wheeler, petrol/CNG)        | medium   |
| `scooter.glb`                | Parked/moving scooters              | medium   |

## Conventions

- **Format**: **glTF 2.0 binary (`.glb`)** — single-file, embedded textures.
  Blender → File → Export → glTF 2.0 → "glTF Binary (.glb)".
- **Units**: **meters**. A cow ~1.5m long, a human ~1.7m tall, an e-rickshaw
  ~2.6m long. If your model is in cm or inches, fix it in Blender before
  export (Object → Apply → Scale).
- **Origin**: at the **base center** of the object (the point that should
  rest on the ground). Feet for humans, contact patch for vehicles.
- **Forward axis**: **+Z** (model faces +Z). If your DCC tool exports facing
  -Z, either re-orient in Blender, or set a `yawOffset` in
  `src/scene/assets.ts` for this entry.
- **Animations (optional)**: for rigged characters, bake anims named
  `walk`, `idle`, `sit`, etc. The game will play `walk` during movement and
  `idle` when standing. If your model has no animations, the game just
  translates/rotates the static mesh — fine for a first pass.
- **Materials**: PBR is preferred. Textures should be packed into the .glb
  (the "Embed Textures" checkbox in Blender's export dialog).

## Size budget

Keep each file under **3 MB** if you can. The v0.1 scope is
"download everything up front", so the whole folder gets pulled to the client
on first load. Current comfort budget: **total all-models < 30 MB**.

If you have a larger hero asset (e.g. a detailed e-rickshaw with 4K textures),
ship it — we'll add streaming later.

## Where the files go on the site

Vite copies anything in `public/` straight to the deployed root. After a push
lands, your model is at `https://<host>/shokGD/models/<filename>`.

## Adding a new model type

Edit `src/scene/assets.ts` → append a new entry to `MANIFEST`, then use it
from whichever scene file wants to spawn it (see `src/scene/erickshaw.ts`,
`src/npc/cow.ts`, `src/npc/crowd.ts` for patterns).
