import {
  Scene,
  UniversalCamera,
  Vector3,
} from "@babylonjs/core";

import type { Lane } from "../scene/lane";

export interface Player {
  camera: UniversalCamera;
  requestPointerLock(): void;
  keys: Set<string>;
  lane: Lane;
}

export function createPlayer(scene: Scene, canvas: HTMLCanvasElement, lane: Lane): Player {
  const eyeHeight = 1.7;
  const camera = new UniversalCamera(
    "player",
    new Vector3(-lane.length / 2 + 6, eyeHeight, -lane.roadWidth / 2 - 1),
    scene,
  );
  camera.minZ = 0.1;
  camera.maxZ = 600;
  camera.fov = 1.1; // slightly wide — reads more like a street photo FOV
  camera.speed = 0; // we drive motion manually, not via built-in keyboard
  camera.angularSensibility = 1600;
  camera.inertia = 0.4;
  // Look toward +X (down the lane).
  camera.setTarget(new Vector3(0, eyeHeight, -lane.roadWidth / 2 - 1));

  // Collision setup — small ellipsoid at the camera so the player can't walk
  // through shopfronts or the back walls.
  camera.checkCollisions = true;
  camera.applyGravity = true;
  camera.ellipsoid = new Vector3(0.35, eyeHeight / 2, 0.35);
  camera.ellipsoidOffset = new Vector3(0, eyeHeight / 2, 0);

  // We'll handle keyboard ourselves so we get running + consistent speed.
  camera.inputs.removeByType("FreeCameraKeyboardMoveInput");

  const keys = new Set<string>();
  const onKey = (e: KeyboardEvent, down: boolean) => {
    const k = e.key.toLowerCase();
    if (down) keys.add(k);
    else keys.delete(k);
  };
  window.addEventListener("keydown", (e) => onKey(e, true));
  window.addEventListener("keyup", (e) => onKey(e, false));

  return {
    camera,
    keys,
    lane,
    requestPointerLock() {
      if (canvas.requestPointerLock) canvas.requestPointerLock();
    },
  };
}

const WALK_SPEED = 2.6; // m/s — a relaxed walk
const RUN_SPEED = 5.2;

export function updatePlayer(player: Player, dt: number): void {
  const { camera, keys } = player;
  const speed = keys.has("shift") ? RUN_SPEED : WALK_SPEED;

  // Build a horizontal forward vector from camera yaw so look-up-and-down
  // doesn't scale movement.
  const forward = camera.getDirection(Vector3.Forward());
  forward.y = 0;
  if (forward.lengthSquared() < 1e-6) forward.set(0, 0, 1);
  forward.normalize();
  const right = new Vector3(forward.z, 0, -forward.x);

  const move = new Vector3(0, 0, 0);
  if (keys.has("w") || keys.has("arrowup")) move.addInPlace(forward);
  if (keys.has("s") || keys.has("arrowdown")) move.subtractInPlace(forward);
  if (keys.has("d") || keys.has("arrowright")) move.addInPlace(right);
  if (keys.has("a") || keys.has("arrowleft")) move.subtractInPlace(right);

  if (move.lengthSquared() > 0) {
    move.normalize().scaleInPlace(speed * dt);
    // _collideWithWorld is Babylon's internal collision entry point for
    // cameras — it moves the camera along `move` while resolving against
    // any mesh with checkCollisions=true via the camera's ellipsoid.
    (camera as unknown as { _collideWithWorld: (v: Vector3) => void })
      ._collideWithWorld(move);
  }
}
