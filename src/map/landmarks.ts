// The commons' fixtures, drawn each frame so walkers sort in front of or
// behind them: Gary's hut (his office), the notice board, the Old Oak's trunk.
// Each returns the y of its base, for depth.

import { LANDMARKS } from "../world/index.ts";
import * as C from "../content/palette.ts";

const ROOF = ["#5e2e30", "#86423a", "#a85a48", "#c47a5e"];
const WALL = ["#a8987e", "#cbbd9e", "#e8dcbc", "#f6eed6"];
const rect = (ctx: CanvasRenderingContext2D, colour: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w, h);
};

export const HUT = { w: 18, h: 17 };

/** Gary's hut: whitewashed, a tiled roof, a stovepipe, a lamp in the window after dark. Base on the office's footprint. */
export function drawHut(ctx: CanvasRenderingContext2D, t: number, lamp: boolean) {
  const f = LANDMARKS.office;
  const x = f.x - 4, base = f.y + f.h, y = base - HUT.h;
  // walls
  rect(ctx, C.INK, x + 1, y + 8, 16, 9);
  rect(ctx, WALL[2], x + 2, y + 9, 14, 7);
  rect(ctx, WALL[3], x + 2, y + 9, 3, 7);
  rect(ctx, WALL[1], x + 13, y + 9, 3, 7);
  rect(ctx, WALL[0], x + 2, y + 15, 14, 1);
  // door, ajar, with a step
  rect(ctx, C.INK, x + 4, y + 10, 5, 7);
  rect(ctx, C.PLANK[2], x + 5, y + 11, 3, 6);
  rect(ctx, C.PLANK[3], x + 5, y + 11, 1, 6);
  rect(ctx, "#e8c45a", x + 7, y + 14, 1, 1);
  rect(ctx, C.STONE[3], x + 4, y + 17, 5, 1);
  // window
  rect(ctx, C.INK, x + 10, y + 10, 5, 4);
  rect(ctx, lamp ? C.LAMP : "#7aa6b8", x + 11, y + 11, 3, 2);
  rect(ctx, lamp ? "#fff2b8" : "#b6d6dc", x + 11, y + 11, 1, 1);
  // the sign over the door: OFFICE, in a hand too small to read
  rect(ctx, C.INK, x + 3, y + 8, 7, 3);
  rect(ctx, "#f0e2b4", x + 4, y + 9, 5, 1);
  // roof: tiles in courses, lit along the left
  rect(ctx, C.INK, x, y + 2, 18, 7);
  for (let r = 0; r < 5; r++) {
    rect(ctx, ROOF[r === 0 ? 3 : 2], x + 1, y + 3 + r, 16, 1);
    for (let k = (r % 2) * 2; k < 16; k += 4) rect(ctx, ROOF[1], x + 1 + k, y + 3 + r, 1, 1);
  }
  rect(ctx, ROOF[3], x + 1, y + 3, 3, 4);
  rect(ctx, ROOF[0], x + 1, y + 8, 16, 1);
  // stovepipe, and smoke that drifts east
  rect(ctx, C.INK, x + 13, y - 1, 3, 4);
  rect(ctx, C.STONE[2], x + 14, y, 1, 3);
  for (let i = 0; i < 3; i++) {
    const age = ((t / 1400 + i / 3) % 1);
    const sx = x + 14 + Math.round(age * 6 + Math.sin(age * 6 + i) * 1);
    const sy = y - 2 - Math.round(age * 9);
    ctx.globalAlpha = 0.75 * (1 - age);
    rect(ctx, "#e8e4ec", sx, sy, age > 0.5 ? 2 : 1, 1);
  }
  ctx.globalAlpha = 1;
  return base;
}

/** The notice board, at the crossing: a little roof, cork, notices pinned up. */
export function drawBoard(ctx: CanvasRenderingContext2D) {
  const f = LANDMARKS.board;
  const x = f.x - 4, base = f.y + f.h, y = base - 13;
  rect(ctx, C.PLANK[0], x + 2, y + 8, 1, 5);
  rect(ctx, C.PLANK[0], x + 10, y + 8, 1, 5);
  rect(ctx, C.INK, x, y + 1, 13, 9);
  rect(ctx, "#b8894f", x + 1, y + 2, 11, 7);
  rect(ctx, "#c9a06a", x + 1, y + 2, 11, 1);
  for (const [nx, ny, pin] of [[2, 3, "#e05c48"], [5, 4, "#3e8a5a"], [8, 3, "#5b7fc9"]] as const) {
    rect(ctx, "#fffdf3", x + nx, y + ny, 2, 3);
    rect(ctx, pin, x + nx, y + ny, 1, 1);
  }
  rect(ctx, C.INK, x - 1, y, 15, 2);
  rect(ctx, C.PLANK[3], x, y, 13, 1);
  return base;
}

export const BOARD_BOX = () => {
  const f = LANDMARKS.board;
  return { x: f.x - 5, y: f.y + f.h - 14, w: 15, h: 15 };
};

/** The Old Oak's trunk and its roots; the canopy goes on top of everything else. */
export function drawOak(ctx: CanvasRenderingContext2D) {
  const f = LANDMARKS.oak;
  const x = f.x, base = f.y + f.h;
  rect(ctx, C.INK, x, base - 14, 8, 14);
  rect(ctx, C.PLANK[1], x + 1, base - 14, 6, 13);
  rect(ctx, C.PLANK[2], x + 1, base - 14, 2, 13);
  rect(ctx, C.PLANK[0], x + 5, base - 12, 1, 4);
  // roots
  rect(ctx, C.INK, x - 2, base - 2, 12, 2);
  rect(ctx, C.PLANK[1], x - 1, base - 2, 2, 1);
  rect(ctx, C.PLANK[1], x + 7, base - 2, 2, 1);
  return base;
}
