#!/usr/bin/env node
// Headless smoke test:
//   1. serve the built dist/ on a local port
//   2. open it in headless Chromium via Puppeteer (under xvfb-run if needed)
//   3. wait for the loader to hide (means scene built successfully)
//   4. sample a few frames' worth of FPS and check for console errors
//
// Run as:   npm run build && npm run smoke
// or:       npm run build && xvfb-run -a npm run smoke

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = resolve(__dirname, "..", "dist");

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

const PORT = 4317;

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
console.log(`[smoke] serving ${DIST} on :${PORT}`);

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

  // Runtime errors = hard fail. Console errors (network 404s etc) are soft —
  // we log them as warnings since sandboxed environments often block CDNs.
  const pageErrors = [];
  const consoleSoftErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleSoftErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`[smoke] opening ${url}`);
  await page.goto(url, { waitUntil: "load", timeout: 60_000 });

  // Wait for loader to hide — means all builders finished without throwing.
  await page.waitForFunction(
    () => document.getElementById("loader")?.classList.contains("hidden"),
    { timeout: 60_000 },
  );
  console.log("[smoke] loader hid — scene booted");

  // Let it render a couple of seconds to catch any per-frame errors.
  await new Promise((r) => setTimeout(r, 2500));

  const canvasInfo = await page.evaluate(() => {
    const c = document.getElementById("game");
    return { w: c?.width ?? 0, h: c?.height ?? 0 };
  });
  console.log(`[smoke] canvas is ${canvasInfo.w}x${canvasInfo.h}`);

  if (pageErrors.length > 0) {
    console.error("[smoke] UNCAUGHT runtime errors:");
    for (const e of pageErrors) console.error("  -", e);
    exitCode = 1;
  } else {
    console.log("[smoke] no uncaught runtime errors");
  }
  if (consoleSoftErrors.length > 0) {
    console.warn("[smoke] soft console errors (usually network, non-fatal):");
    for (const e of consoleSoftErrors) console.warn("  -", e);
  }
  if (canvasInfo.w === 0) {
    console.error("[smoke] canvas has zero width — render failed");
    exitCode = 1;
  }
} catch (err) {
  console.error("[smoke] failed:", err);
  exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}

process.exit(exitCode);
