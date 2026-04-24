#!/usr/bin/env node
// Resize embedded textures inside Meshy glb exports. Meshy ships 1024-2048
// PNGs per material, which makes each glb ~8 MB. Walk the glb, decode each
// embedded image with sharp, resize, re-encode, and write a new glb with
// updated bufferViews.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const TARGET_PX = 512;

async function shrinkGlb(srcPath, outPath) {
  const buf = await readFile(srcPath);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const totalLen = view.getUint32(8, true);

  let off = 12;
  let json = null;
  let bin = null;
  let jsonStart = 0, jsonEnd = 0, binStart = 0, binEnd = 0;
  while (off < totalLen) {
    const len = view.getUint32(off, true);
    const type = view.getUint32(off + 4, true);
    const start = off + 8;
    const end = start + len;
    if (type === 0x4E4F534A) { // JSON
      json = JSON.parse(new TextDecoder().decode(buf.subarray(start, end)));
      jsonStart = start; jsonEnd = end;
    } else if (type === 0x004E4942) { // BIN
      bin = buf.subarray(start, end);
      binStart = start; binEnd = end;
    }
    off = end;
  }
  if (!json || !bin) throw new Error("missing chunks");

  // Build new bin: walk bufferViews in order, replace those that are images.
  const imageByBufferView = new Map();
  for (const img of json.images ?? []) {
    if (typeof img.bufferView === "number") imageByBufferView.set(img.bufferView, img);
  }

  const newBufferViews = [];
  const newBinChunks = [];
  let newOffset = 0;
  for (let i = 0; i < json.bufferViews.length; i++) {
    const bv = json.bufferViews[i];
    const oldBytes = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    let newBytes = oldBytes;
    if (imageByBufferView.has(i)) {
      // Resize the image
      try {
        const meta = await sharp(oldBytes).metadata();
        if (meta.width && meta.height && Math.max(meta.width, meta.height) > TARGET_PX) {
          newBytes = await sharp(oldBytes)
            .resize(TARGET_PX, TARGET_PX, { fit: "inside", withoutEnlargement: true })
            .png({ compressionLevel: 9 })
            .toBuffer();
        }
      } catch (e) {
        console.warn(`  bv[${i}] image resize failed:`, e.message);
      }
    }
    // 4-byte align
    const padding = (4 - (newBytes.length % 4)) % 4;
    const padded = padding > 0
      ? Buffer.concat([newBytes, Buffer.alloc(padding)])
      : newBytes;
    newBufferViews.push({ ...bv, byteOffset: newOffset, byteLength: newBytes.length });
    newBinChunks.push(padded);
    newOffset += padded.length;
  }
  json.bufferViews = newBufferViews;
  // Update the buffer length
  json.buffers[0].byteLength = newOffset;

  const newBin = Buffer.concat(newBinChunks);
  const newJsonStr = JSON.stringify(json);
  // JSON chunk must also be 4-aligned, padded with spaces (0x20).
  const jsonPadding = (4 - (newJsonStr.length % 4)) % 4;
  const jsonPadded = newJsonStr + " ".repeat(jsonPadding);
  const jsonBytes = Buffer.from(jsonPadded, "utf-8");

  // Build full GLB
  const newTotalLen = 12 + 8 + jsonBytes.length + 8 + newBin.length;
  const out = Buffer.alloc(newTotalLen);
  // Header
  out.writeUInt32LE(0x46546C67, 0); // "glTF"
  out.writeUInt32LE(2, 4);           // version
  out.writeUInt32LE(newTotalLen, 8); // length
  // JSON chunk
  out.writeUInt32LE(jsonBytes.length, 12);
  out.writeUInt32LE(0x4E4F534A, 16); // "JSON"
  jsonBytes.copy(out, 20);
  // BIN chunk
  let p = 20 + jsonBytes.length;
  out.writeUInt32LE(newBin.length, p);
  out.writeUInt32LE(0x004E4942, p + 4); // "BIN\0"
  newBin.copy(out, p + 8);

  await writeFile(outPath, out);
  return { srcSize: buf.length, outSize: out.length };
}

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2 !== 0) {
  console.error("usage: shrink-glb-textures.mjs <src1> <dst1> [<src2> <dst2> ...]");
  process.exit(1);
}
for (let i = 0; i < args.length; i += 2) {
  const src = resolve(args[i]);
  const out = resolve(args[i + 1]);
  console.log(`shrinking ${src} -> ${out}`);
  const { srcSize, outSize } = await shrinkGlb(src, out);
  console.log(`  ${(srcSize / 1024).toFixed(0)} KB -> ${(outSize / 1024).toFixed(0)} KB (${((outSize / srcSize) * 100).toFixed(0)}%)`);
}
