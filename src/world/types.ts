// The shape of the commons: what every part of the game agrees a plot is.
// Pure types, so api/ can `import type` them without pulling in client code.

export interface Point {
  x: number;
  y: number;
}

export type RegionId = "green" | "knoll" | "wetend" | "shaw" | "bank";

/** How a region's plots are bounded once granted. Each view draws its own at its own scale. */
export type Boundary = "rail" | "drystone" | "hurdle" | "hedge" | "picket";

export interface Region {
  id: RegionId;
  name: string; // "the Knoll", as a clerk writes it mid-sentence
  blurb: string; // one line, for the claim card
  sun: "full" | "dappled" | "shade";
  wind: "sheltered" | "breezy" | "exposed";
  wet: "dry" | "damp" | "boggy";
  soil: string; // "thin, over stone"
  boundary: Boundary;
  // The region's own covenant: a local bylaw a filing can be denied under, in Gary's register.
  covenant: string;
  // The condition Gary falls back on here when he can't write one, and the palette prop that meets it.
  stock: { condition: string; wants: string | null };
}

/** Something already on a plot when it's claimed. Fixed; nothing can be built on its cells. */
export type FeatureKind = "boulder" | "gorse" | "stump" | "spring" | "molehills" | "old_post" | "roots" | "puddle";

export interface Feature {
  kind: FeatureKind;
  x: number; // plot-local cells, top-left of its footprint, inside the mask
  y: number;
  w: number;
  h: number;
}

export type Side = "north" | "east" | "south" | "west";

export interface PlotDef {
  id: number; // 1..N, the number on the gatepost and in filings.plot; never renumber
  name: string; // "the Wedge": the clerk's name for it
  region: RegionId;
  x: number; // bounding box on the map, art px (one map px is one build cell)
  y: number;
  w: number; // bounding box size in cells
  h: number;
  mask: string; // w*h chars, row-major: '#' is the plot, '.' is not
  area: number; // '#' cells; a cell is a square yard
  gate: Point; // map px, on a path, where you stand to go in
  door: Point; // plot-local cell on the mask's edge where the boundary has its gap
  features: Feature[];
  edges: Record<Side, string[]>; // what lies along each side: "the footpath", "the stream", "Plot 6"
  neighbours: number[]; // plots sharing a boundary
  particulars: string[]; // the schedule, in words: size and shape, aspect, ground, features, what bounds it
}

export interface World {
  regions: Region[];
  plots: PlotDef[];
}
