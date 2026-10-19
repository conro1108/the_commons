// Composes the commons and bakes it: `npm run world`. The only place the map's
// generation lives; the client, api/ and the database read what this writes.

import { writeFileSync } from "node:fs";
import { compose, W, H, T, idx } from "./world/terrain.ts";
import { rle } from "./world/bake.ts";
import { cutPaths } from "./world/paths.ts";
import { cutPlots } from "./world/plots.ts";
import { site } from "./world/site.ts";
import { LANDMARKS, OAK_CANOPY } from "./world/landmarks.ts";
import { REGIONS } from "../src/world/regions.ts";
import type { World } from "../src/world/types.ts";

const out = (f: string) => new URL(`../src/world/${f}`, import.meta.url);

const g = compose();
const owner = cutPaths(g);
const plots = site(g, owner, cutPlots(g));

// The pond and the bridges, measured off the ground.
const box = (keep: (t: string, x: number, y: number) => boolean) => {
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (keep(g.t[idx(x, y)], x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
const pond = box((t, x, y) => (t === T.water || t === T.shallows) && Math.hypot((x - 166) / 60, (y - 160) / 32) < 1);
const bridge = box((t, _x, y) => t === T.bridge && y < 100);

const map = {
  w: W,
  h: H,
  terrain: rle(g.t),
  region: rle(g.r),
  height: rle(Array.from(g.h, (n) => String.fromCharCode(97 + n))),
  landmarks: { ...LANDMARKS, pond: { ...pond, at: { x: pond.x + pond.w / 2, y: pond.y - 2 } }, bridge: { ...bridge, at: { x: bridge.x, y: bridge.y } }, canopy: { ...OAK_CANOPY, at: { x: 0, y: 0 } } },
};
writeFileSync(out("map.json"), JSON.stringify(map) + "\n");
const world: World = { regions: Object.values(REGIONS), plots };
writeFileSync(out("plots.json"), JSON.stringify(world) + "\n");
console.log(`map.json ${(JSON.stringify(map).length / 1024).toFixed(1)}k, plots.json ${(JSON.stringify(world).length / 1024).toFixed(1)}k`);
for (const p of plots) console.log(String(p.id).padStart(2), p.name.padEnd(18), p.region.padEnd(7), String(p.area).padStart(4), `${p.w}x${p.h}`.padEnd(6), p.features.map((f) => f.kind).join(","), "|", p.neighbours.join(","));
