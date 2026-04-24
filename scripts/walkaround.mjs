#!/usr/bin/env node
// Headless walkaround: boots the game, clicks to enter, then drives WASD while
// saving screenshots. Useful for "seeing" the world from Claude Code.

import { createServer } from "node:http";
import { stat, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = resolve(__dirname, "..", "dist");
const OUT = "/tmp/shokgd-walk";
await mkdir(OUT, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".map":  "application/json",
  ".ico":  "image/x-icon",
};

const PORT = 4318;
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (path === "/") path = "/index.html";
    const fp = join(DIST, path);
    await stat(fp);
    res.setHeader("content-type", MIME[extname(fp)] ?? "application/octet-stream");
    createReadStream(fp).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
});
await new Promise((r) => server.listen(PORT, r));
console.log(`[walk] serving ${DIST} on :${PORT}`);

let exitCode = 0;
let browser;
try {
  browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });

  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e}`));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(
    () => document.getElementById("loader")?.classList.contains("hidden"),
    { timeout: 60_000 },
  );
  console.log("[walk] scene booted");

  // Boot camera view (auto-rotating preview, before entering)
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: join(OUT, "00-boot.png") });

  // Click to enter -> pointer lock + player camera
  await page.click("#game");
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: join(OUT, "01-entered.png") });

  // Helper: press a key for N ms
  async function hold(key, ms) {
    await page.keyboard.down(key);
    await new Promise((r) => setTimeout(r, ms));
    await page.keyboard.up(key);
  }

  // Capture the player position each step by introspecting the scene.
  // The game doesn't expose a global handle — but we can reach into
  // the Babylon engine via the registered canvas -> scene.activeCamera.
  async function readPose() {
    return await page.evaluate(() => {
      // Babylon stores engines globally; grab the first one.
      const BJS = globalThis.BABYLON;
      if (!BJS) return null;
      const eng = BJS.EngineStore?.Instances?.[0];
      const scene = eng?.scenes?.[0];
      const cam = scene?.activeCamera;
      if (!cam) return null;
      return {
        pos: [cam.position.x, cam.position.y, cam.position.z],
        rot: [cam.rotation?.x ?? 0, cam.rotation?.y ?? 0, cam.rotation?.z ?? 0],
        cam: cam.name,
        fps: eng.getFps ? Math.round(eng.getFps()) : null,
      };
    });
  }

  const before = await readPose();
  console.log("[walk] pose before:", JSON.stringify(before));

  // Walk forward 2s
  await hold("KeyW", 2000);
  await page.screenshot({ path: join(OUT, "02-forward-2s.png") });
  console.log("[walk] after W 2s:", JSON.stringify(await readPose()));

  // Sprint forward 3s (Shift+W)
  await page.keyboard.down("ShiftLeft");
  await hold("KeyW", 3000);
  await page.keyboard.up("ShiftLeft");
  await page.screenshot({ path: join(OUT, "03-sprint-3s.png") });
  console.log("[walk] after Shift+W 3s:", JSON.stringify(await readPose()));

  // Turn right (arrow key or mouse). Use mouse move, since camera uses mouse look.
  await page.mouse.move(512, 384);
  await page.mouse.move(800, 384, { steps: 20 });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: join(OUT, "04-look-right.png") });
  console.log("[walk] after look right:", JSON.stringify(await readPose()));

  // Strafe left 1.5s
  await hold("KeyA", 1500);
  await page.screenshot({ path: join(OUT, "05-strafe-left.png") });
  console.log("[walk] after A 1.5s:", JSON.stringify(await readPose()));

  // Walk forward + look around more
  await page.mouse.move(300, 384, { steps: 20 });
  await hold("KeyW", 1500);
  await page.screenshot({ path: join(OUT, "06-turn-forward.png") });
  console.log("[walk] after turn+W:", JSON.stringify(await readPose()));

  // Walk backward
  await hold("KeyS", 2000);
  await page.screenshot({ path: join(OUT, "07-back.png") });
  console.log("[walk] after S 2s:", JSON.stringify(await readPose()));

  // Pitch down a touch to look at ground
  await page.mouse.move(512, 600, { steps: 20 });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: join(OUT, "08-look-down.png") });
  console.log("[walk] after pitch down:", JSON.stringify(await readPose()));

  // Final pose + fps
  const pose = await readPose();
  console.log("[walk] final pose:", JSON.stringify(pose));

  // Summarize scene contents
  const sceneInfo = await page.evaluate(() => {
    const BJS = globalThis.BABYLON;
    const eng = BJS?.EngineStore?.Instances?.[0];
    const scene = eng?.scenes?.[0];
    if (!scene) return null;
    const meshes = scene.meshes.map((m) => m.name).slice(0, 80);
    return {
      meshCount: scene.meshes.length,
      materialCount: scene.materials.length,
      textureCount: scene.textures.length,
      lightCount: scene.lights.length,
      cameraCount: scene.cameras.length,
      activeCamera: scene.activeCamera?.name,
      sampleMeshes: meshes,
    };
  });
  console.log("[walk] scene:", JSON.stringify(sceneInfo, null, 2));

  console.log(`[walk] screenshots -> ${OUT}`);
} catch (err) {
  console.error("[walk] failed:", err);
  exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}
process.exit(exitCode);
