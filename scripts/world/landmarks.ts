// The fixed points of the commons. A rect is the footprint (nothing walks or
// is built on it); `at` is where you stand on the path to visit it.

import { CAIRN } from "./terrain.ts";

export interface Landmark { x: number; y: number; w: number; h: number; at: { x: number; y: number } }

export const LANDMARKS: Record<string, Landmark> = {
  office: { x: 222, y: 82, w: 10, h: 7, at: { x: 217, y: 88 } }, // Gary's hut, door on the lane
  board: { x: 203, y: 101, w: 5, h: 3, at: { x: 207, y: 99 } }, // the notice board, at the crossing
  bench: { x: 184, y: 133, w: 5, h: 2, at: { x: 186, y: 130 } }, // facing the pond
  oak: { x: 310, y: 76, w: 8, h: 6, at: { x: 314, y: 99 } }, // the trunk; the canopy is far wider
  cairn: { x: CAIRN[0] - 2, y: CAIRN[1] - 2, w: 4, h: 4, at: { x: 49, y: 36 } },
  spawn: { x: 200, y: 224, w: 1, h: 1, at: { x: 200, y: 224 } }, // through the hedge from the lane
};
// pond and bridge are measured off the baked terrain in world.ts
export const OAK_CANOPY = { x: 296, y: 60, w: 36, h: 28 };
