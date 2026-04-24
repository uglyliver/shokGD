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

## Optimizing a Meshy (or any) glb before committing

Meshy exports are typically 20–40 MB (millions of tris, uncompressed PNG
textures). Crunch them with [`gltfpack`](https://github.com/zeux/meshoptimizer)
before committing. Download the native binary (npm build lacks texture
compression) from the meshoptimizer releases.

```bash
# One-time install (native binary, not the npm package)
# macOS:  brew install gltfpack
# Linux:  curl -sSL -o gltfpack.zip \
#         https://github.com/zeux/meshoptimizer/releases/download/v1.1/gltfpack-ubuntu.zip \
#         && unzip gltfpack.zip && chmod +x gltfpack && sudo mv gltfpack /usr/local/bin/

# Optimize (geometry + texture). DO NOT pass -cc — see note below.
gltfpack -i meshy_export.glb -o erickshaw.glb \
    -si 0.015        `# simplify to ~1.5% of source triangles (~10k for a 1.7M-tri Meshy output)` \
    -tw -tl 1024 -tq 85  `# convert textures to WebP, cap at 1024², quality 85` \
    -mm              `# merge materials where possible`
```

Typical Meshy output: **25 MB → 1–2 MB**, ~10k tris.

Don't use `-cc` (meshopt geometry compression) or `-tc` (KTX2/Basis) for now.
Both need Babylon CDN-hosted decoders at runtime — that's a brittle external
dependency, AND `EXT_meshopt_compression` makes Babylon's
`boundingBox.minimumWorld` return wrong values, which silently breaks the
auto-ground logic in `src/scene/assets.ts` and leaves models half-buried.
WebP textures are native to browsers, zero decoder needed.

If the optimized model looks too simplified, raise `-si` (try `0.03` for ~30k
tris) or the texture budget (try `-tl 2048 -tq 90`). Re-run, re-check size.

## Where the files go on the site

Vite copies anything in `public/` straight to the deployed root. After a push
lands, your model is at `https://<host>/shokGD/models/<filename>`.

## Adding a new model type

Edit `src/scene/assets.ts` → append a new entry to `MANIFEST`, then use it
from whichever scene file wants to spawn it (see `src/scene/erickshaw.ts`,
`src/npc/cow.ts`, `src/npc/crowd.ts` for patterns).
