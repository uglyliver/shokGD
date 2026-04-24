import { startGame } from "./game";

const loader = document.getElementById("loader") as HTMLDivElement;
const fill = document.getElementById("loader-fill") as HTMLDivElement;
const msg = document.getElementById("loader-msg") as HTMLDivElement;
const start = document.getElementById("start") as HTMLDivElement;
const canvas = document.getElementById("game") as HTMLCanvasElement;

const setProgress = (pct: number, label: string) => {
  fill.style.width = `${Math.round(pct * 100)}%`;
  msg.textContent = label;
};

// Wait for fonts before we start painting signage to canvases,
// otherwise first-frame textures use a fallback font.
const fontsReady: Promise<unknown> =
  "fonts" in document
    ? (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready
    : Promise.resolve();

(async () => {
  try {
    setProgress(0.05, "loading fonts");
    await fontsReady;

    setProgress(0.15, "warming up the engine");
    const game = await startGame(canvas, (p, label) => setProgress(0.15 + p * 0.8, label));

    setProgress(1.0, "ready");
    await new Promise((r) => setTimeout(r, 250));
    loader.classList.add("hidden");
    start.classList.add("show");

    const enter = () => {
      start.classList.remove("show");
      game.enter();
    };
    start.addEventListener("click", enter);
    canvas.addEventListener("click", enter);
  } catch (err) {
    console.error(err);
    msg.textContent = `boot failed: ${(err as Error).message ?? err}`;
  }
})();
