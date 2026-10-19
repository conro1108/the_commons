// The paths, authored: where people would walk from the lane to the Green, up
// the Knoll, round the pond and out along the Bank. Each is a spline through
// junctions it shares with the others, so the graph joins up exactly.

import { fbm, spline, type P } from "./noise.ts";
import { T, W, H, idx, inside, type Ground } from "./terrain.ts";

export interface Path {
  name: string; // as a clerk writes it in a plot's edges
  r: number; // half-width
  over: string; // what it becomes over water: a bridge or stepping stones
  pts: P[];
}

// junctions
const X: P = [214, 100]; // the main crossing, on the Green
const SHORE: P = [219, 128]; // where the pond path leaves the lane
const FORD: P = [74, 146]; // the Wet End fork
const FOOT: P = [104, 78]; // the foot of the Knoll, past the bridge
const SPLIT: P = [282, 98]; // where the Shaw track drops to the Bank
const BANK: P = [216, 184]; // where the Bank path leaves the lane
const COPSE: P = [208, 56]; // the ride's end on the lane
const BEND: P = [270, 186]; // where the cut meets the Bank path

export const PATHS: Path[] = [
  { name: "the lane", r: 1.7, over: T.bridge, pts: [[199, 244], [201, 226], [208, 204], BANK, [222, 162], [223, 142], SHORE, [216, 114], X, [216, 80], COPSE, [196, 30], [190, 8], [188, -4]] },
  { name: "the Knoll path", r: 1.2, over: T.bridge, pts: [X, [196, 96], [172, 90], [150, 85], [130, 82], [116, 80], FOOT, [92, 70], [84, 60], [72, 50], [58, 40], [48, 36]] },
  { name: "the pond path", r: 1.2, over: T.stones, pts: [SHORE, [200, 130], [180, 129], [158, 130], [138, 128], [116, 128], [96, 134], FORD, [46, 160], [20, 170], [-4, 176]] },
  { name: "the lower path", r: 1.1, over: T.stones, pts: [FORD, [84, 170], [104, 186], [124, 196], [146, 204], [170, 207], [192, 208], [206, 205]] },
  { name: "the Shaw track", r: 1.4, over: T.bridge, pts: [X, [236, 104], [258, 100], SPLIT, [300, 102], [322, 98], [344, 92], [366, 90], [388, 92]] },
  { name: "the cut", r: 1.1, over: T.bridge, pts: [SPLIT, [288, 120], [285, 142], [278, 164], BEND] },
  { name: "the Bank path", r: 1.2, over: T.bridge, pts: [BANK, [236, 186], [254, 189], BEND, [296, 196], [320, 208], [338, 222], [344, 234], [348, 244]] },
  { name: "the Knoll path", r: 1.1, over: T.bridge, pts: [FOOT, [96, 92], [80, 104], [60, 112], [44, 124], [38, 140], [46, 160]] },
  { name: "the ride", r: 1.1, over: T.bridge, pts: [COPSE, [232, 50], [258, 52], [284, 62], [310, 60], [330, 52]] },
];

/** Each path's centreline, sampled about every px. */
export const CENTRES: P[][] = PATHS.map((p) => spline(p.pts, 0.5));

/** Cuts the paths into the ground; returns, per cell, the index of the path there (or -1). */
export function cutPaths(g: Ground): Int16Array {
  const owner = new Int16Array(W * H).fill(-1);
  PATHS.forEach((p, n) => {
    const r = Math.ceil(p.r) + 1;
    for (const [cx, cy] of CENTRES[n])
      for (let y = Math.floor(cy - r); y <= cy + r; y++)
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          if (!inside(x, y)) continue;
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d > p.r + fbm(x, y, 5, 81 + n) * 0.9) continue;
          const i = idx(x, y), t = g.t[i];
          if (owner[i] >= 0 && t !== T.path) continue;
          owner[i] = n;
          g.t[i] =
            t === T.water || t === T.shallows ? p.over
            : t === T.cliff ? T.steps
            : t === T.steps || t === T.bridge || t === T.stones ? t
            : T.path;
        }
  });
  return owner;
}
