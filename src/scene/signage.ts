import { DynamicTexture, Scene } from "@babylonjs/core";

export interface SignSpec {
  english: string;
  hindi: string;
  tagline: string;
  phone: string;
  palette: { bg: string; fg: string; accent: string };
}

// Paint a shopfront signboard to a canvas and return a Babylon DynamicTexture.
// Ratio 4:1 (wide) — matches typical horizontal signboards. Lots of the
// "desi" read comes from layering Devanagari + English + a contrasting
// strip with a phone number.
export function paintSignTexture(
  scene: Scene,
  name: string,
  spec: SignSpec,
  widthPx = 1024,
  heightPx = 256,
): DynamicTexture {
  const tex = new DynamicTexture(
    `sign_${name}`,
    { width: widthPx, height: heightPx },
    scene,
    false,
  );
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;

  // Background with subtle vertical noise.
  ctx.fillStyle = spec.palette.bg;
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 ? "#000" : "#fff";
    ctx.fillRect(0, (i / 40) * heightPx, widthPx, 2);
  }
  ctx.globalAlpha = 1;

  // Accent strip on the left — common on Indian signboards (logo area).
  ctx.fillStyle = spec.palette.accent;
  ctx.fillRect(0, 0, heightPx * 0.9, heightPx);
  ctx.fillStyle = spec.palette.bg;
  ctx.beginPath();
  ctx.moveTo(heightPx * 0.9, 0);
  ctx.lineTo(heightPx * 1.1, 0);
  ctx.lineTo(heightPx * 0.9, heightPx);
  ctx.closePath();
  ctx.fill();

  // Hindi top line.
  ctx.fillStyle = spec.palette.fg;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = "700 58px 'Noto Sans Devanagari', sans-serif";
  ctx.fillText(spec.hindi, heightPx * 1.15, 20, widthPx - heightPx * 1.2);

  // English big line.
  ctx.font = "900 72px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(spec.english, heightPx * 1.15, 90, widthPx - heightPx * 1.2);

  // Tagline strip at bottom.
  ctx.fillStyle = spec.palette.accent;
  ctx.fillRect(heightPx * 1.15, heightPx - 48, widthPx - heightPx * 1.2, 40);
  ctx.fillStyle = spec.palette.bg;
  ctx.font = "700 22px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(
    `${spec.tagline}   ·   ${spec.phone}`,
    heightPx * 1.15 + 10,
    heightPx - 42,
  );

  tex.update(false);
  return tex;
}

// A smaller "hanging banner" texture for cross-lane political/event banners.
export function paintBannerTexture(
  scene: Scene,
  name: string,
  text: string,
  bg: string,
  fg: string,
): DynamicTexture {
  const w = 1024;
  const h = 192;
  const tex = new DynamicTexture(`banner_${name}`, { width: w, height: h }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = "900 80px 'Noto Sans Devanagari', 'Noto Sans', sans-serif";
  ctx.fillText(text, w / 2, h / 2);
  // Slightly torn lower edge — rectangles.
  ctx.fillStyle = bg;
  for (let x = 0; x < w; x += 32) {
    ctx.fillRect(x + Math.random() * 8, h - 6, 16, 6);
  }
  tex.update(false);
  return tex;
}
