import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

import { castAndReceive, castShadow } from "./shadows";
import {
  SHOP_ENGLISH,
  SHOP_HINDI,
  TAGLINES,
  SIGN_PALETTES,
  randomPhone,
} from "../util/desi";
import { mulberry32, pick, range } from "../util/rand";
import { paintSignTexture, paintBannerTexture } from "./signage";
import type { Lane } from "./lane";

// Lay shops down both sides of the lane. Each shop is a box with a signboard
// panel across its upper front. Widths vary so the rhythm looks organic.
export function buildShops(scene: Scene, lane: Lane): Mesh[] {
  const rng = mulberry32(1337);
  const meshes: Mesh[] = [];
  const facadePalette = [
    new Color3(0.85, 0.78, 0.65),
    new Color3(0.78, 0.7, 0.55),
    new Color3(0.9, 0.85, 0.78),
    new Color3(0.65, 0.55, 0.45),
    new Color3(0.72, 0.68, 0.6),
    new Color3(0.6, 0.75, 0.82),
  ];

  for (const side of [-1, 1] as const) {
    let x = -lane.length / 2 + 2;
    let shopIdx = 0;
    while (x < lane.length / 2 - 2) {
      const width = range(rng, 7, 14);
      if (x + width > lane.length / 2 - 2) break;

      const height = range(rng, lane.shopHeight * 0.75, lane.shopHeight * 1.05);
      const depth = lane.shopDepth - 0.4;
      const cx = x + width / 2;
      const cz = side * (lane.shopFrontZ + depth / 2);

      // Building body.
      const body = MeshBuilder.CreateBox(
        `shop_body_${side}_${shopIdx}`,
        { width, height, depth },
        scene,
      );
      body.position.set(cx, height / 2, cz);
      const bodyMat = new StandardMaterial(`shop_body_mat_${side}_${shopIdx}`, scene);
      bodyMat.diffuseColor = pick(rng, facadePalette);
      bodyMat.specularColor = new Color3(0.05, 0.05, 0.05);
      body.material = bodyMat;
      body.checkCollisions = true;
      body.isPickable = false;
      castAndReceive(body);
      meshes.push(body);

      // Signboard: flat plane in front of the body near the top.
      const signH = Math.min(1.6, height * 0.22);
      const signW = width - 0.4;
      const sign = MeshBuilder.CreatePlane(
        `sign_${side}_${shopIdx}`,
        { width: signW, height: signH },
        scene,
      );
      const signZ = side * (lane.shopFrontZ - 0.02);
      sign.position.set(cx, height - signH / 2 - 0.3, signZ);
      // side=-1 shops face the lane (+Z) after a 180° yaw. Rotation PI
      // around Y keeps the plane visible (CCW winding from +Z preserved)
      // but swaps the screen-space U direction, which mirrors the text.
      // We compensate by flipping the texture's U mapping below.
      if (side === -1) sign.rotation.y = Math.PI;
      const signMat = new StandardMaterial(`sign_mat_${side}_${shopIdx}`, scene);
      const idx = shopIdx + (side === 1 ? 7 : 0);
      const spec = {
        english: SHOP_ENGLISH[idx % SHOP_ENGLISH.length],
        hindi: SHOP_HINDI[idx % SHOP_HINDI.length],
        tagline: pick(rng, TAGLINES),
        phone: randomPhone(rng),
        palette: pick(rng, SIGN_PALETTES),
      };
      const signTex = paintSignTexture(scene, `${side}_${shopIdx}`, spec);
      signMat.diffuseTexture = signTex;
      signMat.emissiveColor = new Color3(0.25, 0.25, 0.25); // self-lit for legibility
      signMat.specularColor = new Color3(0, 0, 0);
      sign.material = signMat;
      sign.isPickable = false;
      sign.checkCollisions = false;
      meshes.push(sign);

      // Awning — simple angled plank over the shopfront door area.
      if (rng() > 0.35) {
        const awning = MeshBuilder.CreateBox(
          `awning_${side}_${shopIdx}`,
          { width: signW * 0.9, height: 0.08, depth: 1.6 },
          scene,
        );
        awning.position.set(
          cx,
          height - signH - 0.8,
          side * (lane.shopFrontZ - 0.8),
        );
        awning.rotation.x = side * -0.2;
        const am = new StandardMaterial(`awning_mat_${side}_${shopIdx}`, scene);
        am.diffuseColor = new Color3(
          0.3 + rng() * 0.5,
          0.2 + rng() * 0.4,
          0.2 + rng() * 0.3,
        );
        am.specularColor = new Color3(0, 0, 0);
        awning.material = am;
        awning.isPickable = false;
        awning.checkCollisions = false;
        castShadow(awning);
        meshes.push(awning);
      }

      // Shutter/door box — darker rectangle inset on front.
      const door = MeshBuilder.CreatePlane(
        `door_${side}_${shopIdx}`,
        { width: Math.min(3.5, width * 0.45), height: Math.min(3, height - signH - 1) },
        scene,
      );
      door.position.set(
        cx,
        (height - signH - 1) / 2,
        side * (lane.shopFrontZ - 0.015),
      );
      if (side === -1) door.rotation.y = Math.PI;
      const doorMat = new StandardMaterial(`door_mat_${side}_${shopIdx}`, scene);
      doorMat.diffuseColor = new Color3(0.15, 0.12, 0.1);
      doorMat.specularColor = new Color3(0.2, 0.2, 0.2);
      door.material = doorMat;
      door.isPickable = false;
      door.checkCollisions = false;
      meshes.push(door);

      x += width + range(rng, 0.1, 0.4);
      shopIdx++;
    }
  }

  // A couple of cross-lane banners at fixed positions. Each banner is built
  // as TWO back-to-back single-sided planes, so text reads correctly from
  // both viewing directions along the lane — a single plane would show
  // mirrored text from one side.
  const bannerSpecs = [
    { text: "शुभ विवाह", bg: "#f1b90b", fg: "#c1121f", x: -50 },
    { text: "नवरात्रि महोत्सव", bg: "#e63946", fg: "#ffffff", x: 20 },
    { text: "WASTE TO WONDER", bg: "#2a9d8f", fg: "#ffffff", x: 70 },
  ];
  for (let i = 0; i < bannerSpecs.length; i++) {
    const s = bannerSpecs[i];
    const bm = new StandardMaterial(`banner_mat_${i}`, scene);
    bm.diffuseTexture = paintBannerTexture(scene, `b${i}`, s.text, s.bg, s.fg);
    bm.emissiveColor = new Color3(0.3, 0.3, 0.3);
    bm.backFaceCulling = true;
    bm.specularColor = new Color3(0, 0, 0);

    for (const face of [+1, -1] as const) {
      const banner = MeshBuilder.CreatePlane(
        `banner_${i}_${face === 1 ? "a" : "b"}`,
        { width: 10, height: 1.8 },
        scene,
      );
      banner.position.set(s.x, lane.shopHeight - 0.5, 0);
      banner.rotation.y = face * Math.PI / 2;
      banner.material = bm;
      banner.isPickable = false;
      banner.checkCollisions = false;
      meshes.push(banner);
    }
  }

  // Scatter a few trash bins + tyre piles on pavements for life.
  for (let i = 0; i < 8; i++) {
    const side = rng() > 0.5 ? 1 : -1;
    const bin = MeshBuilder.CreateCylinder(
      `bin_${i}`,
      { height: 0.9, diameter: 0.6 },
      scene,
    );
    bin.position.set(
      range(rng, -lane.length / 2 + 5, lane.length / 2 - 5),
      0.55,
      side * (lane.shopFrontZ - 0.5 + rng() * 0.3),
    );
    const bm = new StandardMaterial(`bin_mat_${i}`, scene);
    bm.diffuseColor = new Color3(0.12, 0.35, 0.18);
    bm.specularColor = new Color3(0, 0, 0);
    bin.material = bm;
    bin.checkCollisions = true;
    bin.isPickable = false;
    meshes.push(bin);
  }

  // Drop a couple of parked scooters — oriented boxes with wheels (low fi).
  const parkedSpots: { x: number; z: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const side = rng() > 0.5 ? 1 : -1;
    const x = range(rng, -lane.length / 2 + 10, lane.length / 2 - 10);
    parkedSpots.push({ x, z: side * (lane.roadWidth / 2 - 0.8) });
  }
  for (let i = 0; i < parkedSpots.length; i++) {
    const p = parkedSpots[i];
    const scooter = MeshBuilder.CreateBox(
      `scoot_${i}`,
      { width: 0.5, height: 0.9, depth: 1.6 },
      scene,
    );
    scooter.position.set(p.x, 0.45, p.z);
    scooter.rotation.y = Math.random() * 0.3;
    const sm = new StandardMaterial(`scoot_mat_${i}`, scene);
    sm.diffuseColor = new Color3(
      0.2 + Math.random() * 0.6,
      0.2 + Math.random() * 0.6,
      0.2 + Math.random() * 0.6,
    );
    sm.specularColor = new Color3(0.3, 0.3, 0.3);
    scooter.material = sm;
    scooter.checkCollisions = true;
    scooter.isPickable = false;
    meshes.push(scooter);
  }

  // Reference position to place chai stall without overlapping (see chaiStall.ts).
  (lane as Lane & { chaiStallPos?: Vector3 }).chaiStallPos = new Vector3(
    -15,
    0,
    lane.shopFrontZ - 1.4,
  );

  return meshes;
}
