import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
} from "@babylonjs/core";

import { buildSky } from "./scene/sky";
import { buildLane } from "./scene/lane";
import { buildShops } from "./scene/shops";
import { buildChaiStall } from "./scene/chaiStall";
import { spawnCrowd, updateCrowd } from "./npc/crowd";
import { spawnCow, updateCow } from "./npc/cow";
import { createPlayer, updatePlayer } from "./player/controller";
import { initAmbientAudio } from "./audio/ambient";
import { loadAssets, MANIFEST } from "./scene/assets";
import { spawnErickshaws, updateErickshaws, summarize } from "./scene/erickshaw";

export type ProgressFn = (pct: number, label: string) => void;

export interface Game {
  enter(): void;
  dispose(): void;
}

export async function startGame(
  canvas: HTMLCanvasElement,
  progress: ProgressFn,
): Promise<Game> {
  progress(0.02, "creating engine");
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.72, 0.78, 0.85, 1.0);
  scene.ambientColor = new Color3(0.35, 0.33, 0.30);
  scene.gravity = new Vector3(0, -0.6, 0);
  scene.collisionsEnabled = true;

  const bootCam = new ArcRotateCamera(
    "bootCam",
    Math.PI * 0.75,
    Math.PI / 2.4,
    40,
    new Vector3(0, 2, 0),
    scene,
  );
  bootCam.attachControl(canvas, false);
  bootCam.useAutoRotationBehavior = true;

  new HemisphericLight("fill", new Vector3(0, 1, 0), scene).intensity = 0.35;

  progress(0.06, "painting the sky");
  buildSky(scene);

  progress(0.14, "laying the road");
  const lane = buildLane(scene);

  progress(0.30, "raising the shopfronts");
  buildShops(scene, lane);

  progress(0.44, "lighting the chai stall");
  buildChaiStall(scene, lane);

  // Assets load — models.glb, optional per file. Missing files are fine.
  // Vite sets import.meta.env.BASE_URL to the deploy base ("/" in dev,
  // "/shokGD/" on Pages), so appending "models/" gives the public-dir path.
  progress(0.50, "loading models");
  const viteEnv = (import.meta as unknown as { env: { BASE_URL: string } }).env;
  const baseUrl = `${viteEnv.BASE_URL}models/`;
  const assets = await loadAssets(scene, MANIFEST, baseUrl, (done, total, label) => {
    progress(0.50 + (done / total) * 0.20, label);
  });
  console.log("[shokGD]", summarize(assets));

  progress(0.72, "sending the cow out for a wander");
  const cow = spawnCow(scene, lane, assets);

  progress(0.78, "filling the gali with people");
  const crowd = spawnCrowd(scene, lane, 20, assets);

  progress(0.84, "parking the e-rickshaws");
  const erickshaws = spawnErickshaws(scene, lane, assets);

  progress(0.90, "mixing the ambient bed");
  const audio = initAmbientAudio();

  progress(0.95, "spawning player");
  const player = createPlayer(scene, canvas, lane);

  // Pre-bake one frame so the first displayed frame looks right.
  scene.render();

  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;
    updatePlayer(player, dt);
    updateCrowd(crowd, dt);
    updateCow(cow, dt);
    updateErickshaws(erickshaws, dt);
    scene.render();
  });

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);

  // Surface model-load status in the HUD so the user can see what loaded vs
  // what's still a primitive — makes it obvious when to commit a new .glb.
  const hud = document.getElementById("hud");
  if (hud) {
    hud.innerHTML =
      `shokGD v0.2 — Janakpuri gali (prototype)<br>` +
      `<span style="opacity:0.6">models loaded: ${
        assets.loaded.length ? assets.loaded.join(", ") : "(none — using procedural)"
      }</span>`;
  }

  return {
    enter() {
      bootCam.detachControl();
      scene.activeCamera = player.camera;
      player.camera.attachControl(canvas, true);
      player.requestPointerLock();
      audio.start();
    },
    dispose() {
      window.removeEventListener("resize", onResize);
      scene.dispose();
      engine.dispose();
    },
  };
}
