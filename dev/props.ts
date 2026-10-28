// Every prop on the outdoor palette at scale, on a patch of grass, beside a
// row of the library's fittings for comparison: the two should look like one
// set. ?scale=5, ?fittings=0, ?only=bench,flag. No network.

import { PALETTE, propCanvas } from "../src/content/props.ts";
import { FITTINGS } from "../src/content/fittings.ts";

const q = new URLSearchParams(location.search);
const S = +(q.get("scale") ?? 5);
const only = q.get("only")?.split(",");
const out = document.getElementById("out")!;

function figure(grid: HTMLElement, key: string, ground: string) {
  const src = propCanvas(key);
  const c = document.createElement("canvas");
  c.width = (src.width + 4) * S;
  c.height = (src.height + 4) * S;
  const x = c.getContext("2d")!;
  x.imageSmoothingEnabled = false;
  x.fillStyle = ground;
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(src, 2 * S, 2 * S, src.width * S, src.height * S);
  const f = document.createElement("figure");
  f.append(c, Object.assign(document.createElement("figcaption"), { textContent: `${key} ${src.width}×${src.height}` }));
  grid.append(f);
}

for (const { group, props } of PALETTE) {
  const keep = props.filter((p) => !only || only.includes(p));
  if (!keep.length) continue;
  out.insertAdjacentHTML("beforeend", `<h2>${group}</h2><div class="grid"></div>`);
  for (const p of keep) figure(out.lastElementChild as HTMLElement, p, "#9fb46a");
}
if (q.get("fittings") !== "0" && !only) {
  out.insertAdjacentHTML("beforeend", `<h2>indoors, for comparison</h2><div class="grid"></div>`);
  for (const k of ["chair", "armchair", "sofa", "bookcase", "stove", "fireplace", "potted_plant", "lamp"].filter((k) => k in FITTINGS))
    figure(out.lastElementChild as HTMLElement, k, "#b89870");
}
