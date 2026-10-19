// What's on a plot before anyone is: drawn at build scale, one per FeatureKind,
// each exactly its footprint (src/world/types.ts) in cells times four.

import { K, type PropDef } from "./canon/props.ts";
import type { FeatureKind } from "../world/types.ts";
import * as P from "./palette.ts";

export const FEATURES: Record<FeatureKind, PropDef> = {
  boulder: {
    rows: [
      "....kkkkk...",
      "..kkSSSSskk.",
      ".kSSSSSSSssk",
      "kSSSSSSssssk",
      "kSSSsssssssk",
      "ksssssssdddk",
      ".kddddddddk.",
      "..kkkkkkkk..",
    ],
    palette: { k: K, S: P.STONE[4], s: P.STONE[3], d: P.STONE[1] },
  },
  gorse: {
    rows: [
      "...kkkk.....",
      ".kkgGGgkkk..",
      "kgGyGggGGgk.",
      "kgggGyggyGgk",
      "kggygggggggk",
      "kdggggydggdk",
      ".kddddddddk.",
      "..kkkkkkkk..",
    ],
    palette: { k: K, G: "#6a8a48", g: "#4a6a3e", d: "#2f4a36", y: "#f0c84a" },
  },
  stump: {
    rows: [
      ".kkkkkk.",
      "kRRrrRRk",
      "kRrRRrRk",
      "kbRRRRbk",
      "kBbbbbbk",
      "kBbbbbdk",
      "kdbbbbdk",
      ".kkkkkk.",
    ],
    palette: { k: K, R: P.PLANK[4], r: P.PLANK[2], B: P.PLANK[2], b: P.PLANK[1], d: P.PLANK[0] },
  },
  spring: {
    rows: [
      "...kkkkkk...",
      ".kkwwwwwwkk.",
      "kswwWwwwwwsk",
      "kswwwwwWwwsk",
      "kSsswwwwwssk",
      ".kSSsssssSk.",
      "..kkkkkkkk..",
      "............",
    ],
    palette: { k: K, w: P.WATER[3], W: P.WATER[5], s: P.STONE[2], S: P.STONE[3] },
  },
  molehills: {
    rows: [
      "................",
      "..kkk...........",
      ".kmMmk......kkk.",
      "kmmmmmk....kmMmk",
      ".kkkkk....kmmmmk",
      "...........kkkk.",
      "......kkk.......",
      ".....kmMmk......",
      "....kmmmmmk.....",
      ".....kkkkk......",
      "................",
      "................",
    ],
    palette: { k: K, m: "#6a4a36", M: "#8a6448" },
  },
  old_post: {
    rows: [".kk.", "kPpk", "kPpk", "kPpk", "kPpk", "kPdk", "kPdk", "kkkk"],
    palette: { k: K, P: P.PLANK[3], p: P.PLANK[2], d: P.PLANK[1] },
  },
  roots: {
    rows: [
      "................",
      "..kk.......kk...",
      ".kbbk.....kbbk..",
      "kbBbbkkkkkbbBbk.",
      "kbbbBbbbbbBbbbbk",
      ".kkbbbkkkbbbkkk.",
      "...kkk...kkk....",
      "................",
    ],
    palette: { k: K, b: P.PLANK[1], B: P.PLANK[3] },
  },
  puddle: {
    rows: [
      "................",
      "...kkkkkkkkk....",
      ".kkwwwwWwwwwkk..",
      "kwwwWwwwwwwwwwk.",
      "kwwwwwwwwWwwwwwk",
      ".kkwwwwwwwwwkkk.",
      "...kkkkkkkkk....",
      "................",
    ],
    palette: { k: P.WATER[1], w: P.WATER[3], W: P.WATER[5] },
  },
};

/** Lie flat on the ground, under everything; the rest stand and sort with props. */
export const FLAT: FeatureKind[] = ["spring", "molehills", "roots", "puddle"];
