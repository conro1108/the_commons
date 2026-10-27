// One plot up close, with made-up building on it. No network.
// ?plot=N, ?scale=3, ?hour=, ?bare=1 for nothing built, ?letter=1 for a red tag on the beehive and a questionnaire.
// A shell: ?shell=x,y,w,h (cells) or ?shell=1 for one somewhere sensible, with
// ?kind=enclosure, ?material=brick, ?paint=blue, ?sign=The+Dojo, ?door=e, ?unread=1 (Gary hasn't read the sign).
// ?all=1 shows every material side by side on one big plot; ?mini=1 adds the map's miniature, big.

import { drawFocus, focusSize, mini } from "../src/closeup.ts";
import { fakeTag } from "./letter.ts";
import { plotById } from "../src/world/index.ts";
import { MATERIALS, doorSide, materialsFor, raise, type Kind } from "../src/shell.ts";
import type { Shell } from "../src/schedule.ts";
import type { Filing, Placement } from "../src/net.ts";

const q = new URLSearchParams(location.search);
const plot = plotById(Number(q.get("plot") ?? 12))!;
const S = +(q.get("scale") ?? 3);
const kind = (q.get("kind") ?? "building") as Kind;

const g = [...".".repeat(plot.w * plot.h)];
const mid = Math.floor(plot.h / 2);
if (!q.get("bare")) {
  for (let x = 0; x < plot.w; x++) if (plot.mask[mid * plot.w + x] === "#") g[mid * plot.w + x] = "p";
  for (let y = mid + 2; y < mid + 5; y++) for (let x = 4; x < 12; x++) if (plot.mask[y * plot.w + x] === "#") g[y * plot.w + x] = "s";
}

function shellAt(x: number, y: number, w: number, h: number, material: string): Shell {
  const s = raise(plot, kind, { x, y, w, h }, null, material, q.get("paint") ?? "green");
  if (q.get("door")) s.door = q.get("door") as Shell["door"];
  s.sign = q.get("sign") ?? (kind === "enclosure" ? "Geese" : "The Dojo");
  s.sign_ok = q.get("unread") ? null : true;
  return s;
}

const filing = (shell: Shell | null): Filing => ({
  id: 1, filer: "me", plot: plot.id, intent: "a karate studio", status: "approved", condition: null, wants: null, bylaw: null, permit: null,
  minutes: null, filed_at: "", stamped_at: "", built_at: null, inspected_at: null, remark: null, met_at: null, ground: g.join(""), schedule: null, shell,
});

const cv = document.getElementById("c") as HTMLCanvasElement;
const ctx = cv.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

if (q.get("all")) {
  // Every material for this kind, one plot each, in a row.
  const mats = materialsFor(kind);
  const { w, h } = focusSize(plot);
  cv.width = w * S * Math.min(3, mats.length);
  cv.height = h * S * Math.ceil(mats.length / 3);
  mats.forEach((m, i) => {
    const s = shellAt(6, 6, kind === "building" ? 10 + (i % 3) * 2 : 12, kind === "building" ? 6 + (i % 2) * 3 : 8, m);
    ctx.setTransform(S, 0, 0, S, (i % 3) * w * S, Math.floor(i / 3) * h * S);
    drawFocus(ctx, { plot, filing: filing(s), built: [], mine: true, ghost: null, brush: null, hover: null }, performance.now() + 1e6);
    ctx.fillStyle = "#fff";
    ctx.font = "6px monospace";
    ctx.fillText(MATERIALS[m].name, 4, 8);
  });
} else {
  const spec = q.get("shell");
  let shell: Shell | null = null;
  if (spec) {
    const [x, y, w, h] = spec === "1" ? [Math.floor(plot.w / 2) - 5, 6, 11, 7] : spec.split(",").map(Number);
    shell = shellAt(x, y, w, h, q.get("material") ?? "timber");
  }
  const props = ["bench", "tree", "flowers", "beehive", "lamppost", "goose"];
  const built: Placement[] = q.get("bare") ? [] : props.map((prop, k) => ({ id: k + 1, filing: 1, x: 2 + ((k * 7) % Math.max(1, plot.w - 8)), y: Math.max(0, mid - 5 + (k % 2) * 7), prop }));
  const { w, h } = focusSize(plot);
  const M = q.get("mini") ? 8 : 0;
  cv.width = w * S + (M ? plot.w * M + 16 : 0);
  cv.height = Math.max(h * S, plot.h * M);
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const f = filing(shell);
  const tags = q.get("letter") && built.length > 5 ? [fakeTag(4, 1, "tagged"), fakeTag(6, 1, "asked")] : undefined;
  drawFocus(ctx, { plot, filing: f, built, mine: true, ghost: null, brush: null, hover: null, tags }, performance.now() + 1e6);
  if (M) {
    ctx.setTransform(M, 0, 0, M, w * S + 16, 0);
    ctx.fillStyle = "#5ea64e";
    ctx.fillRect(0, 0, plot.w, plot.h);
    ctx.drawImage(mini(plot, f, built), 0, 0);
  }
  if (shell) console.log("door faces", doorSide(plot, shell), shell);
}
