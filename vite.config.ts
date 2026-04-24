import { defineConfig } from "vite";

// GitHub Pages serves under /<repo>/ — set BASE at build time from env.
// In dev and local preview we use "/".
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  build: {
    target: "es2022",
    sourcemap: true,
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
    port: 5173,
  },
});
