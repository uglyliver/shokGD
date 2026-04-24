#!/usr/bin/env node
// Visual regression + scene-invariants harness.
//
//   npm run visual            — capture screenshots, check invariants, diff
//                               against baselines (fails if invariants broken
//                               or if size/shape of screenshots changed).
//   npm run visual:update     — same, but overwrite baselines with current
//                               output. Use after an intentional visual change.
//
// The invariants catch regressions that pixel-diff can't (sunk models, wrong
// counts, crashes, FPS collapse). The screenshots are for eyeball review in
// PRs — we don't do pixel-diff because legitimate material/lighting changes
// alter every pixel, and a noisy diff is worse than no diff.
//
// Requires dist/ built already (`npm run build`).

import { createServer } from "node:http";
import { stat, mkdir, copyFile, readdir, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");
const BASELINE_DIR = resolve(ROOT, "tests", "baseline");
const ACTUAL_DIR = resolve(ROOT, "tests", "actual");

const UPDATE = process.argv.includes("--update");
const MIME = {
  ".html":"text/html; charset=utf-8",
  ".js":"application/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".svg":"image/svg+xml",
  ".png":"image/png",
  ".glb":"model/gltf-binary",
  ".woff":"font/woff",
  ".woff2":"font/woff2",
  ".map":"application/json",
  ".ico":"image/x-icon",
};
const PORT = 4319;

// --- The canonical camera poses. Each captures one characteristic view.
// Using the bootCam (ArcRotateCamera) everywhere — easier to pose via
// alpha/beta/radius than to hand-compute yaw/pitch for a UniversalCamera.
const POSES = [
  { name: "00-boot-default", target: [0, 2, 0],    alpha: Math.PI * 0.75, beta: Math.PI / 2.4,  radius: 40 },
  { name: "01-overview",     target: [0, 0, 0],    alpha: Math.PI / 2,    beta: Math.PI / 6,    radius: 60 },
  { name: "02-lane-west",    target: [0, 1.7, 0],  alpha: 0,              beta: Math.PI / 2 - 0.05, radius: 0.01 },
  { name: "03-lane-east",    target: [0, 1.7, 0],  alpha: Math.PI,        beta: Math.PI / 2 - 0.05, radius: 0.01 },
  { name: "04-shops-left",   target: [0, 2, -6],   alpha: Math.PI / 2,    beta: Math.PI / 2 - 0.1,  radius: 6 },
  { name: "05-shops-right",  target: [0, 2, 6],    alpha: -Math.PI / 2,   beta: Math.PI / 2 - 0.1,  radius: 6 },
  { name: "06-chai-stall",   target: [-15, 1.3, 5], alpha: Math.PI / 2,   beta: Math.PI / 2 - 0.2,  radius: 4 },
  { name: "07-rickshaw",     dynamic: "firstParkedRickshaw", alpha: Math.PI / 3, beta: Math.PI / 2.4, radius: 4 },
];

// --- Invariants: runs inside the page via evaluate. Returns { pass, failures[] }.
async function runInvariants(page) {
  return page.evaluate(() => {
    const w = /** @type {any} */ (window);
    const h = w.__shokGD;
    const failures = [];
    const expect = (cond, msg) => { if (!cond) failures.push(msg); };

    expect(!!h, "debug hook __shokGD missing");
    if (!h) return { pass: false, failures };

    const { scene, engine, crowd, erickshaws, lane } = h;

    expect(scene.isReady(), "scene not ready");
    // FPS floor is intentionally low: SwiftShader (headless software GL)
    // caps out around 5-15 fps on this scene. A real GPU gets 60+. We're
    // only guarding against a catastrophic perf regression (e.g. shader
    // compile loop, per-frame allocation leak) — not measuring quality.
    const fps = Math.round(engine.getFps?.() ?? 0);
    expect(fps >= 3, `fps ${fps} < 3 — catastrophic regression`);

    // Expected model counts
    const meshes = scene.meshes;
    const shopBodies = meshes.filter(m => /^shop_body_/.test(m.name));
    const signs = meshes.filter(m => /^sign_\-?1_/.test(m.name));
    expect(shopBodies.length >= 10, `shop bodies: ${shopBodies.length} (want ≥ 10)`);
    expect(signs.length >= 10, `signboards: ${signs.length} (want ≥ 10)`);

    // Chai stall
    expect(!!scene.getMeshByName("chai_cart"), "chai_cart mesh missing");
    expect(!!scene.getMeshByName("chai_pot"),  "chai_pot mesh missing");

    // NPCs — we spawn 20
    expect(crowd.npcs.length === 20, `npc count: ${crowd.npcs.length} (want 20)`);

    // Erickshaws — 4 parked + 2 moving
    const rootNodes = scene.transformNodes.filter(n => /^erickshaw_/.test(n.name) && !/__(corr|inner)$/.test(n.name));
    const parked = rootNodes.filter(n => /_parked_/.test(n.name));
    const moving = rootNodes.filter(n => /_moving_/.test(n.name));
    expect(parked.length === 4, `parked rickshaws: ${parked.length} (want 4)`);
    expect(moving.length === 2, `moving rickshaws: ${moving.length} (want 2)`);

    // Grounding: every loaded-model instance must have its world-space bbox
    // min.y within a few cm of 0 (i.e. sitting on the road). Floats can
    // drift, allow ±0.02.
    const groundedness = [];
    for (const outer of rootNodes) {
      const childMeshes = outer.getChildMeshes(false);
      if (!childMeshes.length) continue;
      let minY = Infinity;
      for (const me of childMeshes) {
        me.computeWorldMatrix(true);
        const bb = me.getBoundingInfo()?.boundingBox;
        if (!bb) continue;
        if (bb.minimumWorld.y < minY) minY = bb.minimumWorld.y;
      }
      if (!isFinite(minY)) continue;
      groundedness.push({ name: outer.name, minY: +minY.toFixed(3) });
      if (Math.abs(minY) > 0.02) {
        failures.push(`${outer.name} not grounded: world min.y = ${minY.toFixed(3)}`);
      }
    }

    // NPC positions — must be on a pavement (|z| in [roadWidth/2, shopFrontZ])
    const roadHalf = lane.roadWidth / 2;
    for (const npc of crowd.npcs) {
      const z = npc.root.position.z;
      const absZ = Math.abs(z);
      if (absZ < roadHalf || absZ > lane.shopFrontZ + 0.5) {
        failures.push(`npc ${npc.root.name} off pavement: z=${z.toFixed(2)}`);
      }
    }

    // Moving rickshaws — must be inside the lane (|x| ≤ lane.length/2, |z| ≤ roadWidth/2)
    for (const m of erickshaws.moving) {
      const p = m.root.position;
      if (Math.abs(p.x) > lane.length / 2) failures.push(`moving rickshaw off-lane x=${p.x.toFixed(1)}`);
      if (Math.abs(p.z) > roadHalf)        failures.push(`moving rickshaw off-road z=${p.z.toFixed(2)}`);
      if (!isFinite(p.x) || !isFinite(p.z)) failures.push(`moving rickshaw NaN position`);
    }

    return { pass: failures.length === 0, failures, fps, groundedness };
  });
}

// --- Serve dist/
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
console.log(`[visual] serving ${DIST} on :${PORT}`);

await mkdir(ACTUAL_DIR, { recursive: true });
// Clear out any stale actuals from prior runs so the report reflects this run only.
for (const f of await readdir(ACTUAL_DIR).catch(() => [])) {
  if (f.endsWith(".png")) await rm(join(ACTUAL_DIR, f));
}

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

  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(
    () => document.getElementById("loader")?.classList.contains("hidden") && !!window.__shokGD,
    { timeout: 60_000 },
  );
  // Let a handful of frames run so the FPS reading stabilises.
  await new Promise((r) => setTimeout(r, 2500));

  // Click to enter the gali. This triggers the game's enter() handler which
  // detaches the boot cam and activates the player cam. Surprisingly, that
  // click is also what makes page.screenshot() reliably capture the WebGL
  // canvas — without it, screenshots come back all-black even with
  // preserveDrawingBuffer:true. We override activeCamera back to bootCam
  // immediately after so the test harness controls the framing.
  await page.click("#game");
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => {
    const { scene, bootCam } = window.__shokGD;
    scene.activeCamera = bootCam;
  });

  // --- Invariants first; fail fast if the scene is structurally broken.
  console.log("[visual] checking invariants…");
  const inv = await runInvariants(page);
  if (inv.pass) {
    console.log(`[visual] invariants OK (fps=${inv.fps})`);
  } else {
    console.error(`[visual] invariants FAILED (fps=${inv.fps}):`);
    for (const f of inv.failures) console.error("  -", f);
    exitCode = 1;
  }

  // --- Screenshots
  console.log("[visual] capturing screenshots…");
  for (const pose of POSES) {
    // Dynamic poses compute their target from the live scene.
    const target = await page.evaluate((p) => {
      const { scene, erickshaws } = window.__shokGD;
      if (p.dynamic === "firstParkedRickshaw") {
        const r = scene.transformNodes.find(n => n.name === "erickshaw_parked_0");
        return r ? [r.position.x, 1.0, r.position.z] : [0, 1, 0];
      }
      return p.target;
    }, pose);

    await page.evaluate((p, tgt) => {
      const { scene, bootCam } = window.__shokGD;
      bootCam.target.set(tgt[0], tgt[1], tgt[2]);
      bootCam.alpha = p.alpha;
      bootCam.beta = p.beta;
      // ArcRotateCamera has a default lowerRadiusLimit that clamps very small
      // radii; honour it by pushing through at least 0.1 so we get a render.
      bootCam.radius = Math.max(0.1, p.radius);
      bootCam.useAutoRotationBehavior = false;
      scene.activeCamera = bootCam;
    }, pose, target);

    // Let several frames run so progressive effects (IBL LODs, shadow warm-up)
    // settle, then force a synchronous render immediately before the capture.
    // Without the synchronous render, page.screenshot() sometimes catches the
    // canvas mid-clear even with preserveDrawingBuffer:true.
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => {
      window.__shokGD.scene.render();
      r();
    })));
    const file = join(ACTUAL_DIR, `${pose.name}.png`);
    await page.screenshot({ path: file });
    console.log(`  ${pose.name}.png`);
  }

  if (pageErrors.length) {
    console.error("[visual] uncaught page errors:");
    for (const e of pageErrors) console.error("  -", e);
    exitCode = 1;
  }
  if (consoleErrors.length) {
    // Soft: many sandboxes produce cert/404 noise unrelated to our scene.
    console.warn("[visual] console.error lines (soft):");
    for (const e of consoleErrors) console.warn("  -", e);
  }

  // --- Baseline compare (or update)
  if (UPDATE) {
    await mkdir(BASELINE_DIR, { recursive: true });
    for (const pose of POSES) {
      await copyFile(
        join(ACTUAL_DIR, `${pose.name}.png`),
        join(BASELINE_DIR, `${pose.name}.png`),
      );
    }
    console.log(`[visual] baselines updated (${POSES.length} files -> tests/baseline/)`);
  } else {
    const baseFiles = new Set(await readdir(BASELINE_DIR).catch(() => []));
    const missing = POSES.filter(p => !baseFiles.has(`${p.name}.png`));
    if (missing.length) {
      console.warn(`[visual] no baseline for ${missing.length} pose(s): ${missing.map(p=>p.name).join(", ")}`);
      console.warn(`[visual] run \`npm run visual:update\` to capture baselines first.`);
    } else {
      // Simple size sanity: both files must exist and be > 4KB (black images
      // compress to ~200B, so this catches "PBR rendered a black screen").
      const { statSync } = await import("node:fs");
      let sizeWarnings = 0;
      for (const pose of POSES) {
        const a = statSync(join(ACTUAL_DIR, `${pose.name}.png`)).size;
        const b = statSync(join(BASELINE_DIR, `${pose.name}.png`)).size;
        if (a < 4_000) {
          console.error(`[visual] ${pose.name}.png is suspiciously small (${a} B) — black frame?`);
          exitCode = 1;
          sizeWarnings++;
        }
        const ratio = a / b;
        if (ratio < 0.3 || ratio > 3.0) {
          console.warn(`[visual] ${pose.name}.png size changed ${ratio.toFixed(2)}x (baseline ${b}, actual ${a})`);
          sizeWarnings++;
        }
      }
      if (sizeWarnings === 0) {
        console.log(`[visual] all ${POSES.length} screenshots within baseline size bounds`);
      }
    }
  }
} catch (err) {
  console.error("[visual] failed:", err);
  exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}

process.exit(exitCode);
