import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  Vector3,
} from "@babylonjs/core";

import { pbr } from "./materials";
import { castShadow, receiveShadow } from "./shadows";

export interface Lane {
  length: number; // along X
  roadWidth: number; // across Z
  pavementWidth: number;
  shopDepth: number;
  shopHeight: number;
  // Z coord of the outer edge where shop fronts sit (both sides).
  shopFrontZ: number;
  ground: Mesh;
}

function paintRoadTexture(scene: Scene, lengthU: number): DynamicTexture {
  const w = 2048;
  const h = 256;
  const tex = new DynamicTexture("roadTex", { width: w, height: h }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;

  // Base asphalt with grime mottling.
  ctx.fillStyle = "#2b2926";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 3 + 1;
    const g = 30 + Math.floor(Math.random() * 50);
    ctx.fillStyle = `rgba(${g},${g - 5},${g - 10},${Math.random() * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Center dashed line (faded — these roads never have fresh paint).
  ctx.fillStyle = "rgba(220, 200, 120, 0.55)";
  const dashLen = 80;
  const gapLen = 80;
  for (let x = 0; x < w; x += dashLen + gapLen) {
    ctx.fillRect(x, h / 2 - 3, dashLen, 6);
  }

  // Random oil stains.
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 20 + Math.random() * 40;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  tex.update();
  tex.uScale = lengthU; // repeat along length
  tex.vScale = 1;
  return tex;
}

function paintPavementTexture(scene: Scene, lengthU: number): DynamicTexture {
  const w = 1024;
  const h = 512;
  const tex = new DynamicTexture("pavTex", { width: w, height: h }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;

  ctx.fillStyle = "#9a8d76";
  ctx.fillRect(0, 0, w, h);

  // Square tile grid with color variation — interlocking paver vibe.
  const tile = 128;
  for (let y = 0; y < h; y += tile) {
    for (let x = 0; x < w; x += tile) {
      const n = (Math.random() - 0.5) * 40;
      const r = Math.max(60, Math.min(200, 154 + n));
      const g = Math.max(60, Math.min(200, 141 + n));
      const b = Math.max(50, Math.min(200, 118 + n));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
    }
  }

  // Grout lines.
  ctx.strokeStyle = "rgba(40,30,20,0.45)";
  ctx.lineWidth = 2;
  for (let y = 0; y < h; y += tile) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let x = 0; x < w; x += tile) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Grime streaks.
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 40 + 10, 3);
  }

  tex.update();
  tex.uScale = lengthU * 0.5;
  tex.vScale = 1;
  return tex;
}

export function buildLane(scene: Scene): Lane {
  const length = 200;
  const roadWidth = 8;
  const pavementWidth = 2.5;
  const shopDepth = 5;
  const shopHeight = 8;
  const totalWidth = roadWidth + pavementWidth * 2;
  const shopFrontZ = roadWidth / 2 + pavementWidth;

  // Ground root — receives collision for gravity.
  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: length, height: totalWidth + shopDepth * 2 + 20, subdivisions: 1 },
    scene,
  );
  ground.checkCollisions = true;
  ground.isPickable = false;

  ground.material = pbr(scene, "groundMat", {
    albedo: new Color3(0.35, 0.3, 0.25),
    roughness: 0.95,
  });
  ground.position.y = 0;

  // Road strip — dark asphalt, very rough, slightly reflective when wet but
  // we're dry today so almost matte.
  const road = MeshBuilder.CreateGround(
    "road",
    { width: length, height: roadWidth, subdivisions: 1 },
    scene,
  );
  road.material = pbr(scene, "roadMat", {
    albedoTexture: paintRoadTexture(scene, length / 10),
    roughness: 0.92,
  });
  road.position.y = 0.01;
  road.isPickable = false;
  road.checkCollisions = false;
  receiveShadow(road);

  // Pavements.
  for (const sign of [-1, 1]) {
    const pav = MeshBuilder.CreateGround(
      `pavement_${sign}`,
      { width: length, height: pavementWidth, subdivisions: 1 },
      scene,
    );
    pav.material = pbr(scene, `pavMat_${sign}`, {
      albedoTexture: paintPavementTexture(scene, length / 6),
      roughness: 0.8,  // tile has some sheen vs road's matte asphalt
    });
    pav.position.y = 0.12;
    pav.position.z = sign * (roadWidth / 2 + pavementWidth / 2);
    pav.isPickable = false;
    pav.checkCollisions = false;
    receiveShadow(pav);
  }

  // Kerb strips between road and pavement — thin boxes so the edge reads.
  for (const sign of [-1, 1]) {
    const kerb = MeshBuilder.CreateBox(
      `kerb_${sign}`,
      { width: length, height: 0.12, depth: 0.15 },
      scene,
    );
    kerb.position.set(0, 0.06, sign * (roadWidth / 2 + 0.075));
    kerb.material = pbr(scene, `kerbMat_${sign}`, {
      albedo: new Color3(0.85, 0.85, 0.82),
      roughness: 0.85,
    });
    kerb.isPickable = false;
    kerb.checkCollisions = false;
  }

  // Far back-wall behind shops on each side so the player can't see into the
  // void if they peek past the shopfront. Collidable.
  for (const sign of [-1, 1]) {
    const backWall = MeshBuilder.CreateBox(
      `backWall_${sign}`,
      { width: length, height: shopHeight + 4, depth: 0.5 },
      scene,
    );
    backWall.position.set(0, (shopHeight + 4) / 2, sign * (shopFrontZ + shopDepth));
    backWall.material = pbr(scene, `backWallMat_${sign}`, {
      albedo: new Color3(0.2, 0.2, 0.22),
      roughness: 0.9,
    });
    backWall.checkCollisions = true;
    backWall.isPickable = false;
    receiveShadow(backWall);
    castShadow(backWall);
  }

  // End caps so the lane is closed off at both ends (gives the 200m its
  // feeling of a block).
  for (const sign of [-1, 1]) {
    const cap = MeshBuilder.CreateBox(
      `endCap_${sign}`,
      { width: 1, height: shopHeight + 4, depth: totalWidth + shopDepth * 2 },
      scene,
    );
    cap.position.set(sign * (length / 2), (shopHeight + 4) / 2, 0);
    cap.material = pbr(scene, `endCapMat_${sign}`, {
      albedo: new Color3(0.18, 0.18, 0.2),
      roughness: 0.9,
    });
    cap.checkCollisions = true;
    cap.isPickable = false;
  }

  // Overhead tangled wires — thin black cylinders strung between posts.
  const postsPerSide = 6;
  const postSpacing = length / (postsPerSide - 1);
  const postPositions: Vector3[] = [];
  for (let s of [-1, 1]) {
    for (let i = 0; i < postsPerSide; i++) {
      const x = -length / 2 + i * postSpacing;
      const z = s * (shopFrontZ - 0.2);
      const post = MeshBuilder.CreateCylinder(
        `post_${s}_${i}`,
        { height: shopHeight + 2, diameterTop: 0.2, diameterBottom: 0.25, tessellation: 8 },
        scene,
      );
      post.position.set(x, (shopHeight + 2) / 2, z);
      post.material = pbr(scene, `postMat_${s}_${i}`, {
        albedo: new Color3(0.15, 0.15, 0.15),
        roughness: 0.7,  // weathered concrete-painted-black power pole
      });
      post.checkCollisions = false;
      post.isPickable = false;
      postPositions.push(new Vector3(x, shopHeight + 1.8, z));
    }
  }

  // String wires across the lane between opposing posts (paired by index)
  // plus along each side between consecutive posts. Random sag via a middle
  // bend segment.
  const wireMat = pbr(scene, "wireMat", {
    albedo: new Color3(0.05, 0.05, 0.05),
    roughness: 0.7,
  });

  const makeWire = (a: Vector3, b: Vector3, sagY: number) => {
    const mid = a.add(b).scale(0.5);
    mid.y -= sagY;
    const seg1 = MeshBuilder.CreateTube(
      "wire",
      {
        path: [a, mid, b],
        radius: 0.03,
        tessellation: 6,
        updatable: false,
      },
      scene,
    );
    seg1.material = wireMat;
    seg1.isPickable = false;
    seg1.checkCollisions = false;
  };

  // Cross-lane wires (pair by index i within side).
  for (let i = 0; i < postsPerSide; i++) {
    const left = postPositions[i]; // s=-1 side first
    const right = postPositions[postsPerSide + i]; // s=+1 side
    for (let k = 0; k < 4; k++) {
      const offY = k * 0.18;
      makeWire(
        new Vector3(left.x + (k - 1.5) * 0.08, left.y - offY, left.z),
        new Vector3(right.x + (k - 1.5) * 0.08, right.y - offY, right.z),
        0.5 + Math.random() * 0.6,
      );
    }
  }
  // Along-lane wires per side.
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < postsPerSide - 1; i++) {
      const a = postPositions[s * postsPerSide + i];
      const b = postPositions[s * postsPerSide + i + 1];
      for (let k = 0; k < 3; k++) {
        const offY = k * 0.15;
        makeWire(
          new Vector3(a.x, a.y - offY, a.z + (k - 1) * 0.05),
          new Vector3(b.x, b.y - offY, b.z + (k - 1) * 0.05),
          0.4 + Math.random() * 0.4,
        );
      }
    }
  }

  return {
    length,
    roadWidth,
    pavementWidth,
    shopDepth,
    shopHeight,
    shopFrontZ,
    ground,
  };
}
