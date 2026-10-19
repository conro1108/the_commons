// The residents' own avatars: a chibi human, 9×14 map pixels, built by
// stacking char grids — body, outfit, hair, extra, then eyes on top so
// nothing ever covers them (canon draws glasses before the face, too). Faces
// sit a pixel right of centre, so the sprite faces right and a flip faces left.
// Specs are plain ids so they can live in a db column; anything unknown falls
// back to the default rather than failing.

import { K, type PropDef } from "./canon/props.ts";

export interface HumanSpec {
  skin: string;
  hair: string;
  hairColour: string;
  outfit: string;
  outfitColour: string;
  extra: string;
}

export const SKINS = [
  { id: "porcelain", colour: "#fbe3d3" },
  { id: "peach", colour: "#f2cfaa" },
  { id: "sand", colour: "#e0b48a" },
  { id: "olive", colour: "#c4925f" },
  { id: "umber", colour: "#9a6440" },
  { id: "cocoa", colour: "#6e452f" },
];

export const HAIRS = [
  { id: "short", label: "Short" },
  { id: "bob", label: "Bob" },
  { id: "long", label: "Long" },
  { id: "curly", label: "Curly" },
  { id: "bun", label: "Bun" },
  { id: "beanie", label: "Beanie" },
  { id: "bald", label: "Bald" },
];

export const HAIR_COLOURS = [
  { id: "black", colour: "#5a4858" },
  { id: "brown", colour: "#6b4630" },
  { id: "chestnut", colour: "#9a5a32" },
  { id: "ginger", colour: "#d9773a" },
  { id: "blonde", colour: "#ecc66a" },
  { id: "grey", colour: "#b9b6c2" },
  { id: "pink", colour: "#f09ab8" },
  { id: "teal", colour: "#5fb3a8" },
];

export const OUTFITS = [
  { id: "tee", label: "Tee" },
  { id: "overalls", label: "Overalls" },
  { id: "dress", label: "Dress" },
  { id: "cardigan", label: "Cardigan" },
  { id: "raincoat", label: "Raincoat" },
];

export const OUTFIT_COLOURS = [
  { id: "tomato", colour: "#e06a5a" },
  { id: "marigold", colour: "#f2b544" },
  { id: "sage", colour: "#8fbf75" },
  { id: "moss", colour: "#5f8f4e" },
  { id: "sky", colour: "#7fb2e0" },
  { id: "navy", colour: "#4f5f9a" },
  { id: "lilac", colour: "#b6a1e2" },
  { id: "rose", colour: "#f0a0b4" },
];

export const EXTRAS = [
  { id: "none", label: "None" },
  { id: "glasses", label: "Glasses" },
  { id: "scarf", label: "Scarf" },
  { id: "flower", label: "Flower" },
  { id: "freckles", label: "Freckles" },
  { id: "beard", label: "Beard" },
];

export const DEFAULT_HUMAN: HumanSpec = {
  skin: "peach",
  hair: "short",
  hairColour: "brown",
  outfit: "tee",
  outfitColour: "sage",
  extra: "none",
};

// --- the grids ---------------------------------------------------------------
// k ink, S skin, f freckle, c blush, e eye, H/h hair, B/b outfit, W cream, P/p denim,
// X/Y extra accents. "." leaves what's underneath; "_" rubs it out.

const BASE = [
  ".........",
  "..kkkkk..",
  ".kSSSSSk.",
  "kSSSSSSSk",
  "kSSSSSSSk",
  "kSSSSSSSk",
  "kScSSSSck",
  ".kSSSSSk.",
  "..kkkkk..",
];

// Rows 9-13. Both frames share the top; step 1 lifts the back foot.
const OUTFIT_GRIDS: Record<string, string[]> = {
  tee: ["kbBBBBBbk", "kSBBBBBSk", ".kPPPPPk.", ".kPPkPPk.", ".kkk.kkk."],
  overalls: ["kWBWWWBWk", "kSBBBBBSk", ".kBBBBBk.", ".kBBkBBk.", ".kkk.kkk."],
  dress: ["kbBBBBBbk", "kSBBBBBSk", "kBBBBBBBk", ".kkSkSkk.", "..kk.kk.."],
  cardigan: ["kbBBWBBbk", "kSBBWBBSk", ".kPPPPPk.", ".kPPkPPk.", ".kkk.kkk."],
  raincoat: ["kbBBBBBbk", "kSBbBbBSk", ".kBBBBBk.", ".kbbkbbk.", ".kkk.kkk."],
};
const STRIDE: Record<string, string[]> = {
  tee: ["_.kPPPk._", "_.kkkkk._"],
  overalls: ["_.kBBBk._", "_.kkkkk._"],
  dress: ["_.kSSSk._", "__.kkk.__"],
  cardigan: ["_.kPPPk._", "_.kkkkk._"],
  raincoat: ["_.kbbbk._", "_.kkkkk._"],
};

const HAIR_GRIDS: Record<string, string[]> = {
  bald: [],
  short: [
    ".........",
    "..kkkkk..",
    ".kHHHHHk.",
    "kHHHHHHHk",
    "kH.......",
  ],
  bob: [
    ".........",
    "..kkkkk..",
    ".kHHHHHk.",
    "kHHHHHHHk",
    "kHh....Hk",
    "kHh....Hk",
    "kHh....Hk",
    ".kH...Hk.",
  ],
  long: [
    ".........",
    "..kkkkk..",
    ".kHHHHHk.",
    "kHHHHHHHk",
    "kHh....Hk",
    "kHh....Hk",
    "kHh....Hk",
    "kHH...HHk",
    "kHhkkkhHk",
    "kHk...kHk",
    "_k.....k_",
  ],
  curly: [
    ".kk.k.kk.",
    "kHHkHkHHk",
    "kHhHHHhHk",
    "kHHHhHHHk",
    "kHh....Hk",
    "kHH....Hk",
    "kHh....Hk",
    ".kH...Hk.",
  ],
  bun: [
    "...kkk...",
    "..kHhHk..",
    ".kHHHHHk.",
    "kHHHHHHHk",
    "kH.......",
  ],
  beanie: [
    "...kWk...",
    "..kkkkk..",
    ".kBBBBBk.",
    "kbbbbbbbk",
    "kH.......",
  ],
};

const EXTRA_GRIDS: Record<string, string[]> = {
  none: [],
  glasses: ["", "", "", "", "..XXkXXX.", "..XX.XXX."],
  scarf: ["", "", "", "", "", "", "", "", ".kXXXXXk.", "..Yx....."],
  flower: ["", "......X..", ".....XYX.", "......X.."],
  freckles: ["", "", "", "", "", "..f....f.", "...f..f.."],
  beard: ["", "", "", "", "", "", "kH.....Hk", ".kHHHHHk.", "..kHhHk.."],
};
const EXTRA_COLOURS: Record<string, Record<string, string>> = {
  glasses: { X: "#dbe7ff" },
  scarf: { X: "#d9605a", x: "#b34a45", Y: "#d9605a" },
  flower: { X: "#fffdf3", Y: "#f2b544" },
};

const FACE = ["", "", "", "", "...e..e..", "...e..e.."];

// --- building ----------------------------------------------------------------

const pick = <T extends { id: string }>(list: T[], id: string) => list.find((o) => o.id === id) ?? list[0];

/** Darker by 15%, for the one shade every fill gets. */
function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * 0.85).toString(16).padStart(2, "0");
  return `#${c(16)}${c(8)}${c(0)}`;
}

/** Blend toward a colour: the blush is skin warmed pink, not a sticker. */
function mix(a: string, b: string, t: number) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t).toString(16).padStart(2, "0");
  return `#${c(16)}${c(8)}${c(0)}`;
}

function stamp(grid: string[][], layer: string[], top = 0) {
  layer.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ".") grid[top + y][x] = ch === "_" ? "." : ch;
    }),
  );
}

function valid(spec: HumanSpec): HumanSpec {
  const ok = (list: { id: string }[], id: string, dflt: string) => (list.some((o) => o.id === id) ? id : dflt);
  const d = DEFAULT_HUMAN;
  return {
    skin: ok(SKINS, spec.skin, d.skin),
    hair: ok(HAIRS, spec.hair, d.hair),
    hairColour: ok(HAIR_COLOURS, spec.hairColour, d.hairColour),
    outfit: ok(OUTFITS, spec.outfit, d.outfit),
    outfitColour: ok(OUTFIT_COLOURS, spec.outfitColour, d.outfitColour),
    extra: ok(EXTRAS, spec.extra, d.extra),
  };
}

/** Untrusted json (a db column, a request body) to a spec, or null if it isn't one at all. */
export function validHuman(x: unknown): HumanSpec | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const s = (k: keyof HumanSpec) => (typeof o[k] === "string" ? (o[k] as string) : "");
  return valid({ skin: s("skin"), hair: s("hair"), hairColour: s("hairColour"), outfit: s("outfit"), outfitColour: s("outfitColour"), extra: s("extra") });
}

export function randomHuman(rand: () => number = Math.random): HumanSpec {
  const any = <T extends { id: string }>(list: T[]) => list[Math.floor(rand() * list.length)].id;
  // Extras are a garnish: most people go without.
  return {
    skin: any(SKINS),
    hair: any(HAIRS),
    hairColour: any(HAIR_COLOURS),
    outfit: any(OUTFITS),
    outfitColour: any(OUTFIT_COLOURS),
    extra: rand() < 0.4 ? "none" : any(EXTRAS),
  };
}

const cache = new Map<string, PropDef>();

export function humanSprite(spec: HumanSpec, step: 0 | 1): PropDef {
  const v = valid(spec);
  const key = JSON.stringify([v, step]);
  const hit = cache.get(key);
  if (hit) return hit;

  const grid = Array.from({ length: 14 }, () => [..."........."]);
  stamp(grid, BASE);
  stamp(grid, OUTFIT_GRIDS[v.outfit], 9);
  if (step) stamp(grid, STRIDE[v.outfit], 12);
  stamp(grid, HAIR_GRIDS[v.hair]);
  stamp(grid, EXTRA_GRIDS[v.extra]);
  stamp(grid, FACE);

  const skin = pick(SKINS, v.skin).colour;
  const hair = pick(HAIR_COLOURS, v.hairColour).colour;
  const cloth = pick(OUTFIT_COLOURS, v.outfitColour).colour;
  const sprite: PropDef = {
    rows: grid.map((r) => r.join("")),
    palette: {
      k: K, e: "#3a2b3f", W: "#fffdf3", P: "#6a7bb0", p: shade("#6a7bb0"),
      S: skin, f: mix(skin, K, 0.3), c: mix(skin, "#ff7a8a", 0.35),
      H: hair, h: shade(hair), B: cloth, b: shade(cloth),
      ...EXTRA_COLOURS[v.extra],
    },
  };
  cache.set(key, sprite);
  return sprite;
}
