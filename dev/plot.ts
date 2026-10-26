// One plot up close, with made-up building on it. ?plot=N, ?scale=3, ?hour=, ?bare=1 for nothing built. No network.

import { drawFocus, focusSize } from "../src/closeup.ts";
import { plotById } from "../src/world/index.ts";
import type { Filing, Placement } from "../src/net.ts";

const q = new URLSearchParams(location.search);
const plot = plotById(Number(q.get("plot") ?? 12))!;
const S = +(q.get("scale") ?? 3);
const { w, h } = focusSize(plot);
const cv = document.getElementById("c") as HTMLCanvasElement;
cv.width = w * S;
cv.height = h * S;
const ctx = cv.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

const g = [...".".repeat(plot.w * plot.h)];
const mid = Math.floor(plot.h / 2);
if (!q.get("bare")) {
  for (let x = 0; x < plot.w; x++) if (plot.mask[mid * plot.w + x] === "#") g[mid * plot.w + x] = "p";
  for (let y = mid + 2; y < mid + 5; y++) for (let x = 4; x < 12; x++) if (plot.mask[y * plot.w + x] === "#") g[y * plot.w + x] = "s";
}
const filing: Filing = {
  id: 1, filer: "me", plot: plot.id, intent: "a bench", status: "approved", condition: null, wants: null, bylaw: null, permit: null,
  minutes: null, filed_at: "", stamped_at: "", built_at: null, inspected_at: null, remark: null, met_at: null, ground: g.join(""), schedule: null, shell: null,
};
const props = ["bench", "tree", "flowers", "beehive", "lamppost", "goose"];
const built: Placement[] = q.get("bare") ? [] : props.map((prop, k) => ({ id: k + 1, filing: 1, x: 2 + ((k * 7) % Math.max(1, plot.w - 8)), y: Math.max(0, mid - 5 + (k % 2) * 7), prop }));
ctx.setTransform(S, 0, 0, S, 0, 0);
drawFocus(ctx, { plot, filing, built, mine: true, ghost: null, brush: null, hover: null }, performance.now() + 1e6);
