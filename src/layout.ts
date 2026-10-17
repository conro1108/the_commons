// The commons in art pixels. COLS/ROWS are mirrored by the plot_x/plot_y
// checks in db/schema.sql.

export const COLS = 8;
export const ROWS = 5;
export const PLOT_W = 24;
export const PLOT_H = 18;
export const PATH = 8; // gap between plots
export const MARGIN = 18; // border for trees and the pond

export const MAP_W = MARGIN * 2 + COLS * PLOT_W + (COLS + 1) * PATH;
export const MAP_H = MARGIN * 2 + ROWS * PLOT_H + (ROWS + 1) * PATH;

export interface Plot {
  x: number;
  y: number;
}

export function plotOrigin({ x, y }: Plot) {
  return {
    left: MARGIN + PATH + x * (PLOT_W + PATH),
    top: MARGIN + PATH + y * (PLOT_H + PATH),
  };
}

/** The plot under an art-pixel point, or null on a path or the border. */
export function plotAt(px: number, py: number): Plot | null {
  const x = Math.floor((px - MARGIN - PATH) / (PLOT_W + PATH));
  const y = Math.floor((py - MARGIN - PATH) / (PLOT_H + PATH));
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
  const { left, top } = plotOrigin({ x, y });
  return px >= left && px < left + PLOT_W && py >= top && py < top + PLOT_H ? { x, y } : null;
}

/** "C4": column letter, row number, the way a clerk would write it. */
export const plotName = ({ x, y }: Plot) => `${String.fromCharCode(65 + x)}${y + 1}`;
