// Ground a resident can paint, one char per build cell of the plot's box,
// stored as a string in the_commons.filings.ground. Like props, kinds are a
// client change; never reuse a letter for something else. '.' is the plot's
// native ground, which depends on where it is; unknown letters draw as that.

import { ZOOM, type PlotDef } from "../world/index.ts";
import type { RegionId } from "../world/types.ts";
import * as P from "./palette.ts";

export const GRASS = ".";
export const empty = (p: PlotDef) => GRASS.repeat(p.w * p.h);

interface Kind {
  label: string;
  base: string;
  edge?: string; // outline where it meets other ground; absent means it blends
  /** Texture inside one cell. h is this cell's noise, 0..1. */
  detail?: (put: (x: number, y: number, c: string) => void, h: number, cx: number, cy: number) => void;
}

const FLOWERS = ["#e06a7c", "#f6f1dc", "#c98add", "#ffd884"];

const tuft = (put: (x: number, y: number, c: string) => void, dark: string) => {
  put(1, 2, dark);
  put(2, 2, dark);
  put(2, 1, dark);
};

// The mower's stripe: a shade between the Green's two lightest, not a jump.
const STRIPE = "#79b858";

/** Each region's own ground, as it is before anyone paints it. */
export const NATIVE: Record<RegionId, Kind> = {
  green: {
    label: "mown grass",
    base: P.GRASS.green[3],
    detail: (put, h, cx, cy) => {
      // Stripes from the mower, three cells wide.
      if (Math.floor((cx + cy * 0.35) / 3) % 2) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) put(x, y, STRIPE);
      if (h < 0.1) tuft(put, P.GRASS.green[1]);
    },
  },
  knoll: {
    label: "thin turf over stone",
    base: P.GRASS.knoll[3],
    detail: (put, h) => {
      if (h < 0.12) { put(1, 1, P.STONE[3]); put(2, 1, P.STONE[4]); put(1, 2, P.STONE[2]); put(2, 2, P.STONE[2]); }
      else if (h > 0.9) { put(2, 1, P.HEATHER[2]); put(1, 2, P.HEATHER[1]); }
      else if (h > 0.6) tuft(put, P.GRASS.knoll[2]);
    },
  },
  wetend: {
    label: "wet grass on clay",
    base: P.GRASS.wetend[3],
    detail: (put, h) => {
      if (h < 0.18) { put(1, 0, P.GRASS.wetend[4]); put(1, 1, P.GRASS.wetend[2]); put(2, 1, P.GRASS.wetend[4]); put(2, 2, P.GRASS.wetend[2]); }
      else if (h > 0.93) { put(1, 2, P.WATER[3]); put(2, 2, P.WATER[4]); }
    },
  },
  shaw: {
    label: "leaf mould",
    base: P.GRASS.shaw[3],
    detail: (put, h, cx, cy) => {
      if (h < 0.35) put(Math.floor(h * 11) % 4, Math.floor(h * 7) % 4, P.LITTER[2 + (h < 0.15 ? 1 : 0)]);
      if (h > 0.75) put((cx * 3 + cy) % 4, 2, P.LITTER[3]);
      if (h > 0.95) tuft(put, P.GRASS.shaw[2]);
    },
  },
  bank: {
    label: "sandy grass",
    base: P.GRASS.bank[3],
    detail: (put, h, cx, cy) => {
      if (h < 0.22) for (let x = 0; x < 3; x++) put(x + ((cx + cy) % 2), 3, P.SAND[3]);
      else if (h > 0.94) put(2, 1, P.FLOWERS[Math.floor(h * 97) % P.FLOWERS.length]);
      else if (h > 0.8) tuft(put, P.GRASS.bank[2]);
    },
  },
};

export const GROUND: Record<string, Kind> = {
  p: {
    label: "path",
    base: "#d8c08a",
    edge: "#c2a670",
    detail: (put, h) => {
      if (h < 0.5) put(1 + Math.floor(h * 4), 1 + Math.floor(h * 8) % 2, "#c2a670");
      else if (h > 0.85) put(2, 2, "#e6d4a6");
    },
  },
  c: {
    label: "stone",
    base: "#d3ccbc",
    edge: "#8f8878",
    detail: (put, _h, _cx, cy) => {
      // Flagstones in a running bond: mortar on the bottom row, joints offset by row.
      for (let x = 0; x < 4; x++) put(x, 3, "#aaa292");
      const joint = cy % 2 ? 1 : 3;
      for (let y = 0; y < 3; y++) put(joint, y, "#aaa292");
      put(joint === 3 ? 0 : 2, 0, "#e4dfd2");
    },
  },
  s: {
    label: "soil",
    base: "#8a5f3c",
    edge: "#5c3d22",
    detail: (put, h) => {
      for (let x = 0; x < 4; x++) put(x, 3, "#7a5234");
      if (h < 0.3) {
        put(1, 2, "#5a9440");
        put(1, 1, "#74b356");
      }
    },
  },
  w: {
    label: "water",
    base: "#5db3c9",
    edge: "#3d6b52",
    detail: (put, h) => {
      if (h < 0.3) {
        put(1, 1, "#a8e4ef");
        put(2, 1, "#a8e4ef");
      }
    },
  },
  m: {
    label: "wildflowers",
    base: "#a6cf6c",
    detail: (put, h, cx, cy) => {
      put(Math.floor(h * 4), 1, "#86b850");
      put(Math.floor(h * 4), 2, "#86b850");
      put((Math.floor(h * 4) + 2) % 4, 3, "#86b850");
      if (h > 0.25) put((cx + cy) % 3, Math.floor(h * 10) % 3, FLOWERS[Math.floor(h * 97) % FLOWERS.length]);
    },
  },
};

/** The brushes, in palette order; '.' puts the native ground back. */
export const BRUSHES = [".", "p", "c", "s", "w", "m"];

/** A brush's name, on a plot: '.' is whatever that plot's ground is. */
export const groundLabel = (ch: string, p: PlotDef) => (ch === GRASS ? NATIVE[p.region].label : GROUND[ch].label);
const noise = (n: number) => ((Math.sin(n * 78.233 + 1.7) * 43758.5453) % 1 + 1) % 1;

/**
 * Paint a plot's ground string at one build pixel per art pixel, on its own
 * cells only. Outlined kinds get edges where they meet different ground,
 * rounded outer corners and filled inner ones. The plot's edge counts as more
 * of the same, so a path runs on under the fence. With grass false, native
 * ground stays transparent.
 */
export function paintGround(ctx: CanvasRenderingContext2D, ground: string, seed: number, plot: PlotDef, grass = true) {
  const W = plot.w, H = plot.h;
  const kindOf = (ch: string) => (ch === GRASS ? NATIVE[plot.region] : (GROUND[ch] ?? NATIVE[plot.region]));
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && plot.mask[y * W + x] === "#";
  const at = (x: number, y: number) => (!inside(x, y) ? null : (ground[y * W + x] ?? GRASS));
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      if (!inside(cx, cy)) continue;
      const ch = at(cx, cy)!;
      if (ch === GRASS && !grass) continue;
      const k = kindOf(ch);
      const left = cx * ZOOM;
      const top = cy * ZOOM;
      const put = (x: number, y: number, c: string) => {
        ctx.fillStyle = c;
        ctx.fillRect(left + x, top + y, 1, 1);
      };
      ctx.fillStyle = k.base;
      ctx.fillRect(left, top, ZOOM, ZOOM);
      k.detail?.(put, noise(seed * 1013 + cy * W + cx), cx, cy);
      if (!k.edge) continue;
      const same = (dx: number, dy: number) => {
        const n = at(cx + dx, cy + dy);
        return n === null || n === ch;
      };
      const n = same(0, -1), s = same(0, 1), w = same(-1, 0), e = same(1, 0);
      if (!n) for (let x = 0; x < 4; x++) put(x, 0, k.edge);
      if (!s) for (let x = 0; x < 4; x++) put(x, 3, k.edge);
      if (!w) for (let y = 0; y < 4; y++) put(0, y, k.edge);
      if (!e) for (let y = 0; y < 4; y++) put(3, y, k.edge);
      // Corners: [dx, dy, corner x, corner y, inner x, inner y]
      for (const [dx, dy, x, y, ix, iy] of [[-1, -1, 0, 0, 1, 1], [1, -1, 3, 0, 2, 1], [-1, 1, 0, 3, 1, 2], [1, 1, 3, 3, 2, 2]]) {
        const v = same(0, dy), hz = same(dx, 0);
        if (!v && !hz) {
          // Outer corner: round it off with whatever's next door.
          const next = at(cx, cy + dy) ?? GRASS;
          if (next === GRASS && !grass) ctx.clearRect(left + x, top + y, 1, 1);
          else put(x, y, kindOf(next).base);
          put(ix, iy, k.edge);
        } else if (v && hz && !same(dx, dy)) {
          put(x, y, k.edge); // inner corner
        }
      }
    }
  }
}
