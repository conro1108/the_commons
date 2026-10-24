// The five kinds of ground the commons is made of. Each is a climate as well
// as a place: Gary reads it into every ruling, condition and inspection, and
// each has a covenant of its own a filing can be denied under. Mirrored into
// src/world/plots.json by the world script, for api/ to read.

import type { Region, RegionId } from "./types.ts";

export const REGIONS: Record<RegionId, Region> = {
  green: {
    id: "green",
    name: "the Green",
    blurb: "Mown, level and looked at. The bench is here, and so is the notice board.",
    sun: "full",
    wind: "sheltered",
    wet: "dry",
    soil: "good loam",
    boundary: "picket",
    covenant: "The Green is in full view of the bench. Whatever's built there should be worth looking at.",
    stock: { condition: "Must include a bench, so that the Green may look back.", wants: "bench" },
  },
  knoll: {
    id: "knoll",
    name: "the Knoll",
    blurb: "High, bare and in the wind. The view is excellent and the soil is mostly stone.",
    sun: "full",
    wind: "exposed",
    wet: "dry",
    soil: "thin, over stone",
    boundary: "drystone",
    covenant: "Nothing on the Knoll shall be lighter than the wind. Anything that would blow away must be weighed down or not brought.",
    stock: { condition: "Must be weighed down with a rock, against the westerly.", wants: "rock" },
  },
  wetend: {
    id: "wetend",
    name: "the Wet End",
    blurb: "Where the stream slows down and thinks about becoming the pond. Reeds, clay, and the ducks.",
    sun: "full",
    wind: "breezy",
    wet: "boggy",
    soil: "heavy clay",
    boundary: "hurdle",
    covenant: "The Wet End is subject to the Flood Easement. Nothing shall be built there that minds getting wet.",
    stock: { condition: "Must keep a duck, who is used to it.", wants: "duck" },
  },
  shaw: {
    id: "shaw",
    name: "the Shaw",
    blurb: "The edge of the wood, under the Old Oak. Cool, quiet, and full of leaves that were here first.",
    sun: "dappled",
    wind: "sheltered",
    wet: "damp",
    soil: "leaf mould",
    boundary: "hedge",
    covenant: "The Old Oak was here first. Nothing in the Shaw shall dig at its roots or crowd its branches.",
    stock: { condition: "Must include a birdbath, for whoever lives in the oak.", wants: "birdbath" },
  },
  bank: {
    id: "bank",
    name: "the Warm Bank",
    blurb: "A south-facing slope of sandy soil that holds the sun all afternoon. The bees know.",
    sun: "full",
    wind: "sheltered",
    wet: "dry",
    soil: "light and sandy",
    boundary: "rail",
    covenant: "Nothing on the Warm Bank shall cast its shade on a neighbour's beans.",
    stock: { condition: "Must keep the bees in mind: a beehive, or flowers they would visit.", wants: "beehive" },
  },
};
