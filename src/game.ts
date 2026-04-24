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

  // Temp flythrough camera used during boot so the loader has something alive
  // behind it. The player controller takes over on enter().
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

  // Soft fill; real sun comes from buildSky.
  new HemisphericLight("fill", new Vector3(0, 1, 0), scene).intensity = 0.35;

  progress(0.08, "painting the sky");
  buildSky(scene);

  progress(0.18, "laying the road");
  const lane = buildLane(scene);

  progress(0.38, "raising the shopfronts");
  buildShops(scene, lane);

  progress(0.58, "lighting the chai stall");
  buildChaiStall(scene, lane);

  progress(0.68, "sending the cow out for a wander");
  const cow = spawnCow(scene, lane);

  progress(0.74, "filling the gali with people");
  const crowd = spawnCrowd(scene, lane, 20);

  progress(0.84, "mixing the ambient bed");
  const audio = initAmbientAudio();

  progress(0.92, "spawning player");
  const player = createPlayer(scene, canvas, lane);

  // Pre-bake shadow/material state by rendering one frame now.
  scene.render();

  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;
    updatePlayer(player, dt);
    updateCrowd(crowd, dt);
    updateCow(cow, dt);
    scene.render();
  });

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);

  return {
    enter() {
      // Hand control from boot cam to player.
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
