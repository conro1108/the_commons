// The commons' colours. One light, from the upper left: every ramp runs dark
// to light, shadows leaning cool (blue, purple), highlights leaning warm
// (yellow). No pure greys, no black. Terrain is never outlined; objects are, in INK.

import type { RegionId } from "../world/types.ts";

export type Ramp = readonly string[];

export const INK = "#402e3a"; // canon K, for objects only

/** Cast shadows, multiplied, the same colour everywhere: a cool purple-grey. */
export const SHADOW = "#a497bd";

/** The native grass of each region, dark to light. Index 2 is the body colour. */
export const GRASS: Record<RegionId, Ramp> = {
  green: ["#2f6a4c", "#3f8a4e", "#5ea64e", "#84c05a", "#b2d86c"], // bright, mown
  knoll: ["#3c5658", "#557466", "#708f76", "#91a986", "#b6c49a"], // cool and grey-green
  wetend: ["#1d4650", "#2a6058", "#3b7a5e", "#5a9468", "#82ae78"], // deep blue-green
  shaw: ["#20342f", "#2c4936", "#3f6040", "#5a7a48", "#7e9654"], // dark, mossy
  bank: ["#6a7a3c", "#8c9944", "#aeb450", "#ccc864", "#e6dc88"], // yellow-green, going to sand
};

export const PATH: Ramp = ["#6a4c4a", "#8a644e", "#a88456", "#c4a26a", "#dabe86"]; // worn dirt
export const SAND: Ramp = ["#9a7652", "#bc9662", "#d6b476", "#e8cf96", "#f4e6ba"];
export const STONE: Ramp = ["#463f56", "#645e72", "#86828e", "#aca8a6", "#d2cebc"];
export const WATER: Ramp = ["#1c3256", "#224c6c", "#2c6a84", "#4489a0", "#76b6bc", "#d2ecd8"]; // last is the glint
export const REEDS: Ramp = ["#34523a", "#52723e", "#80924a", "#aea85c", "#d6c67e"]; // stems to seed heads
export const HEATHER: Ramp = ["#5a4466", "#83608a", "#a77ea6", "#c8a0c0"];
export const LITTER: Ramp = ["#382c30", "#563e34", "#765438", "#966c40", "#b4884c"]; // the wood's floor
export const PLANK: Ramp = ["#4e3436", "#6e4a3a", "#8e6644", "#b08652", "#cca66a"]; // bridge, hut, posts
export const FOLIAGE: Ramp = ["#1a2a36", "#20403c", "#2c5a40", "#447844", "#66984c", "#92b25a"]; // canopy, hedge
export const FIELD: Ramp = ["#7a7a46", "#9c9450", "#bcae62", "#d6c87c"]; // the country beyond the hedge

/** A terrace edge: the shaded face below, the lit lip along the top. */
export const CLIFF = {
  face: ["#3e3a52", "#555068", "#6c6878", "#86808a"] as Ramp,
  lip: ["#a8b48e", "#ccd2a6", "#e6e4ba"] as Ramp,
};

export const FLOWERS = ["#e06a7c", "#f6f1dc", "#c98add", "#ffd884"]; // as in the close-up's ground
export const LAMP = "#ffd27a"; // windows and lamps after dark, added
