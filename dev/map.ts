// The real map with made-up residents: every plot state, walkers, letters.
// ?scale=4, ?hour=20, ?hover=7, ?t=ms to pin the clock. No network.

import { draw, type Scene } from "../src/render.ts";
import { MAP_H, MAP_W, PLOTS, route, LANDMARKS } from "../src/world/index.ts";
import type { Filing, Placement } from "../src/net.ts";

const q = new URLSearchParams(location.search);
const S = +(q.get("scale") ?? 4);
const cv = document.getElementById("c") as HTMLCanvasElement;
cv.width = MAP_W * S;
cv.height = MAP_H * S;
const ctx = cv.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

const me = "a1b2c3d4-0000-0000-0000-000000000000";
const other = "7f3e2a10-0000-0000-0000-000000000000";
const filing = (id: number, plot: number, status: Filing["status"], filer = other, ground: string | null = null): Filing => ({
  id, filer, plot, intent: "a bench, for looking at the pond with", status, condition: null, wants: null, bylaw: null, permit: null,
  minutes: null, filed_at: "", stamped_at: "", built_at: null, inspected_at: null, remark: null, met_at: null, ground, schedule: null, shell: null,
});
const held = new Map<number, Filing>();
const built = new Map<number, Placement[]>();
const states: [number, Filing["status"], string][] = [[12, "approved", me], [3, "approved", other], [7, "pending", other], [19, "conditional", other], [22, "committee", other], [24, "approved", other], [16, "approved", other], [8, "conditional", me]];
states.forEach(([plot, status, who], i) => {
  const p = PLOTS[plot - 1];
  // A path across, a soil bed, a few things.
  const g = [...".".repeat(p.w * p.h)];
  for (let x = 0; x < p.w; x++) g[Math.floor(p.h / 2) * p.w + x] = "p";
  for (let y = 2; y < 6; y++) for (let x = 2; x < 9; x++) g[y * p.w + x] = "s";
  const f = filing(i + 1, plot, status, who, g.join(""));
  held.set(plot, f);
  const props = ["bench", "tree", "flowers", "shed", "beehive", "goose"];
  built.set(f.id, props.slice(0, 2 + (i % 4)).map((prop, k) => ({ id: i * 10 + k, filing: f.id, x: 3 + k * 6, y: Math.floor(p.h / 2) + 2, prop })));
});

const walkers = [
  { id: me, x: LANDMARKS.board.at.x + 6, y: LANDMARKS.board.at.y + 4, facing: 1 },
  { id: other, x: 240, y: 140, moving: true, facing: -1 },
];
const t = Number(q.get("t") ?? Date.now());
const scene: Scene = {
  held, built, me, hover: q.get("hover") ? +q.get("hover")! : null, selected: q.get("selected") ? +q.get("selected")! : null,
  walkers, look: (id) => (id === me ? { meadow: "dog" } : { meadow: "blob" }), letters: [], t, recent: [12, 3],
};
const frame = () => {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  draw(ctx, { ...scene, t: q.get("t") ? t : Date.now() });
  if (q.get("route")) {
    const [ax, ay, bx, by] = q.get("route")!.split(",").map(Number);
    ctx.fillStyle = "#f0f";
    for (const p of route({ x: ax, y: ay }, { x: bx, y: by })) ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  if (!q.get("once")) requestAnimationFrame(frame);
};
const t0 = performance.now();
frame();
const t1 = performance.now();
frame();
document.title = `first ${Math.round(t1 - t0)}ms, then ${Math.round(performance.now() - t1)}ms`;
console.log(document.title);
