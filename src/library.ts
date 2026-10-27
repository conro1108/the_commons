// What Gary can write a fitting onto a schedule as: the library's pieces, the
// shell materials, and the closest piece to a name. The one seam between the
// schedule (api/gary.ts) and the hand-drawn library.
//
// The pieces are the outdoor props plus src/content/fittings.ts; the materials
// mirror src/shell.ts. Shared by api/gary.ts and the client, so nothing here
// touches the DOM.

import { FITTINGS as DRAWN, bestFitting } from "./content/fittings.ts";
import { norm, type Where } from "./schedule.ts";

export interface Piece {
  key: string; // as stored in placements.prop and Fitting.key
  name: string; // what Gary would call it
  where: Where | "either";
}

// The outdoor props (src/content/props.ts PALETTE, mirrored in api/gary.ts SIZES).
const PROPS: Piece[] = [
  ["flowers", "flowers"], ["tuft", "a tuft of grass"], ["sunflower", "a sunflower"], ["garden", "a vegetable garden"], ["hedge", "a hedge"],
  ["tree", "a tree"], ["bench", "a bench"], ["log", "a log"], ["picnic", "a picnic table"], ["campfire", "a campfire"], ["rock", "a rock"],
  ["pond", "a pond"], ["flag", "a flag"], ["plaque", "a plaque"], ["signpost", "a signpost"], ["noticeboard", "a noticeboard"],
  ["weathervane", "a weathervane"], ["sundial", "a sundial"], ["postbox", "a postbox"], ["lamppost", "a lamppost"], ["bin", "a bin"],
  ["goose", "a goose"], ["duck", "a duck"], ["gnome", "a gnome"], ["scarecrow", "a scarecrow"], ["beehive", "a beehive"],
  ["birdbath", "a birdbath"], ["fence", "a fence"], ["shed", "a shed"], ["well", "a well"], ["hay", "a hay bale"], ["barn", "a barn"],
  ["headstone", "a headstone"], ["bunting", "bunting"], ["lanterns", "lanterns"],
].map(([key, name]) => ({ key, name, where: "out" as const }));

// The hand-drawn fittings: inside things, though anything small enough can go out.
const FITTINGS: Piece[] = Object.entries(DRAWN).map(([key, f]) => ({ key, name: f.name, where: f.small ? "either" : "in" }));

export const LIBRARY: Piece[] = [...PROPS, ...FITTINGS];
export const pieceOf = (key: string) => LIBRARY.find((p) => p.key === key);

// Mirrors MATERIALS in src/shell.ts (which draws them, and so can't be imported by api/): keep the keys in step.
export const MATERIALS: Record<string, string> = {
  timber: "timber (a building or a rail fence)", brick: "brick (a building or a wall)", stone: "stone (a building or a dry wall)",
  render: "whitewash and thatch (a building)", tin: "corrugated tin (a building)", glass: "glass (a building: a greenhouse, a conservatory)",
  picket: "picket fence (an enclosure)", wattle: "wattle hurdles (an enclosure)", hedge: "hedge (an enclosure)",
};

/** The piece a name plainly is, if any: the same name, or the piece's whole name as its last words ("a rack" for "a weapons rack").
 *  Anything less clear is left to the decision model. */
export function closest(name: string): Piece | null {
  const n = norm(name);
  const best = bestFitting(name);
  return LIBRARY.find((p) => norm(p.name) === n || p.key === n)
    ?? (best && best.score >= 0.6 ? pieceOf(best.key) : undefined)
    ?? LIBRARY.find((p) => n.endsWith(` ${norm(p.name)}`))
    ?? null;
}
