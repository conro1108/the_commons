// Copied from cozy_sprites src/render/props.ts (canon; copy, never import).
// Char grids: each character maps to a palette colour, anything else is
// transparent; width is the longest row.

export type PropName = "tree" | "flowers" | "tuft" | "pond" | "note";

interface PropDef {
  rows: string[];
  palette: Record<string, string>;
}

const K = "#402e3a"; // shared outline ink

const PROPS: Record<PropName, PropDef> = {
  tree: {
    rows: [
      ".....kkkkk......",
      "...kkgggggkk....",
      "..kggglgggggk...",
      ".kgglllggggggk..",
      ".kglllllgglggk..",
      "kggllllggglllgk.",
      "kglllllggggllgk.",
      "kgglllgggggggk..",
      ".kggggggglggk...",
      "..kkgggggggk....",
      "....kkgggkk.....",
      "......ktbk......",
      "......ktbk......",
      ".....kttbk......",
      ".....ktttbk.....",
    ],
    palette: { k: K, g: "#4e8a3c", l: "#74b356", t: "#7a5230", b: "#5c3d22" },
  },
  flowers: {
    rows: [
      ".r...w...p.",
      "rrr.www.ppp",
      ".r.g.w.g.p.",
      ".g.g.g.g.g.",
      "ggggggggggg",
    ],
    palette: { g: "#5a9440", r: "#e06a7c", w: "#f6f1dc", p: "#c98add" },
  },
  tuft: {
    rows: [
      "g..g..g",
      ".g.g.g.",
      ".ggggg.",
    ],
    palette: { g: "#6aa348" },
  },
  pond: {
    rows: [
      "......kkkkkkkkkkkk......",
      "...kkkwwbbbbbbbbwwkkk...",
      ".kkbwwbbbbwwbbbbbbwwbkk.",
      "kbbbbbwwbbbbbbwwbbbbbbbk",
      "kbbwwbbbbbbwbbbbbbwwbbbk",
      ".kbbbbbwwbbbbbwwbbbbbbk.",
      "..kkbbbbbbbwwbbbbbbkkk..",
      "....kkkkkkkkkkkkkkk.....",
    ],
    palette: { k: "#3d6b52", b: "#5db3c9", w: "#a8e4ef" },
  },
  note: {
    rows: [
      "...kk...",
      "...kkk..",
      "...k.kk.",
      "...k....",
      "...k....",
      ".kkk....",
      "kkkk....",
      ".kk.....",
    ],
    palette: { k: "#5a4a6a" },
  },
};

const cache = new Map<PropName, HTMLCanvasElement>();

/** A prop rasterised at one canvas pixel per cell, cached. */
export function propCanvas(name: PropName): HTMLCanvasElement {
  let c = cache.get(name);
  if (c) return c;
  const def = PROPS[name];
  c = document.createElement("canvas");
  c.width = Math.max(...def.rows.map((r) => r.length));
  c.height = def.rows.length;
  const ctx = c.getContext("2d")!;
  def.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const colour = def.palette[ch];
      if (!colour) return;
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  cache.set(name, c);
  return c;
}
