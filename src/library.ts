// What Gary can write a fitting onto a schedule as: the library's pieces, the
// shell materials, and the closest piece to a name. The one seam between the
// schedule (api/gary.ts) and the hand-drawn library.
//
// STAND-IN: slice F is building src/content/fittings.ts (FITTINGS and a
// best-match helper) and slice A the shell materials. Until they land, the
// lists below stand for them. On merge: build LIBRARY from F's FITTINGS plus the
// props, point closest() at F's helper, and take MATERIALS from A. Shared by
// api/gary.ts and the client, so nothing here touches the DOM.

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

// STAND-IN for F's FITTINGS: the keys B's stand-in uses too (src/interior-fittings.ts on B's branch), plus a few.
const FITTINGS: Piece[] = [
  ["mat", "a mat", "in"], ["rug", "a rug", "in"], ["rack", "a rack", "either"], ["board", "a board on the wall", "in"],
  ["bag", "a punching bag", "in"], ["cabinet", "a cabinet", "in"], ["shelf", "a shelf", "in"], ["table", "a table", "either"],
  ["plant", "a pot plant", "either"], ["lamp", "a lamp", "in"], ["stool", "a stool", "either"], ["clock", "a clock", "in"],
  ["picture", "a picture", "in"], ["counter", "a counter", "in"], ["chair", "a chair", "either"], ["stove", "a stove", "in"],
  ["bookcase", "a bookcase", "in"], ["bed", "a bed", "in"], ["crate", "a crate", "either"], ["barrel", "a barrel", "either"],
].map(([key, name, where]) => ({ key, name, where: where as Piece["where"] }));

export const LIBRARY: Piece[] = [...PROPS, ...FITTINGS];
export const pieceOf = (key: string) => LIBRARY.find((p) => p.key === key);

// STAND-IN for A's shell materials.
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
  return LIBRARY.find((p) => norm(p.name) === n || p.key === n)
    ?? LIBRARY.find((p) => n.endsWith(` ${norm(p.name)}`))
    ?? null;
}
