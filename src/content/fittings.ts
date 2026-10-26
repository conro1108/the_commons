// The library: the hand-drawn fittings that furnish a built place inside and
// out, which of them hold other things and where, and the floors and wall
// finishes of interiors. Gary picks from here when he writes a schedule
// (src/schedule.ts), and anything he draws for himself has to sit beside it.
// No DOM, so api/gary.ts can read it. See it all at dev/library.html.
//
// Drawn as the canon is (src/content/canon/props.ts): char grids, outlined in
// ink, lit from the upper left, seen from a little above and in front.
// - A room cell is ZOOM (4) art px. A floor piece is exactly w*4 px wide; its
//   bottom row is the front edge of its w*d cell footprint, and it may rise
//   above that. A wall piece is w*4 wide and flat (d = 0).
// - A slot is a box in the piece's own px where a held thing is drawn: sat on
//   the box's bottom edge, or hung from its top (hang), centred across. Boxes
//   on tops may start above the sprite (y < 0): things stick up.
// - Keys are stored in placements: never rename or drop one that's been used.

import { K, type PropDef } from "./canon/props.ts";

export interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
  hang?: true;
}

export interface FittingDef extends PropDef {
  name: string; // as Gary would write it: "a punching bag"
  aliases: string[]; // other ways of saying it, for matching schedule lines to keys
  group: string;
  on: "floor" | "wall";
  w: number; // cells across
  d: number; // cells deep; 0 on a wall
  slots?: Slot[]; // where held things go
  held?: "sit" | "hang"; // small enough to go in a slot, and which kind
  stock?: string; // what usually fills its slots, a key here
}

/** A tileable interior surface: rows repeat both ways; skirt, if any, runs along the foot of a wall. */
export interface Surface extends PropDef {
  name: string;
  aliases: string[];
  skirt?: string[];
}

// Shared colours, one letter each across the library, so pieces agree. A piece
// may override any of them in `pal`.
const C: Record<string, string> = {
  k: K,
  // wood, light to dark (canon's), and pale pine
  W: "#c9a06a", t: "#a97048", b: "#7a5230", d: "#5c3d22", P: "#e3c48e",
  // cloth and paper
  w: "#f7ecd8", c: "#fffdf3",
  // metal, light to dark, and iron
  S: "#d2d4dc", s: "#b0b4c4", g: "#888ca0", m: "#4a4458",
  // red, rose, blue
  r: "#e05c48", R: "#a8403a", p: "#e06a7c", u: "#6aa9d8", U: "#4a6fa0",
  // green, light to dark
  l: "#74b356", n: "#5a9440", N: "#3e6e30",
  // yellow, gold, lamplight, orange
  y: "#e8c56a", Y: "#b8923e", h: "#ffd884", L: "#fff4c9", o: "#f59a3e",
  // glass and water
  a: "#a8e4ef", A: "#5db3c9",
  // violet, terracotta, leather
  v: "#c98add", V: "#83608a", q: "#c9584a", Q: "#7a4034", e: "#8a5a3c",
  // upholstery, light to dark: a dusty rose by default
  x: "#e8907e", z: "#c26a5e", Z: "#8a4448",
};

interface Piece extends Omit<FittingDef, "palette"> {
  pal?: Record<string, string>;
}

/** Widen art by repeating one column, for benches, counters and long tables. */
const stretch = (rows: string[], at: number, by: number) => rows.map((r) => r.slice(0, at) + r[at].repeat(by + 1) + r.slice(at + 1));

const PIECES: Record<string, Piece> = {
  // --- Sitting
  chair: {
    name: "a chair", aliases: ["wooden chair", "dining chair", "kitchen chair", "seat"], group: "Sitting", on: "floor", w: 2, d: 2,
    rows: [
      ".kkkkkk.",
      ".kWWWWk.",
      ".kttttk.",
      ".kbkkbk.",
      ".kWWWWk.",
      ".kbbbbk.",
      "kkkkkkkk",
      "kWWWWWWk",
      "kWWWWWtk",
      "kttttttk",
      "kkkkkkkk",
      ".kb..bk.",
      ".kb..bk.",
      ".kk..kk.",
    ],
  },
  stool: {
    name: "a stool", aliases: ["bar stool", "milking stool", "high stool"], group: "Sitting", on: "floor", w: 2, d: 1,
    rows: [
      ".kkkkkk.",
      "kWWWWWWk",
      "kttttttk",
      ".kkkkkk.",
      ".kb..bk.",
      ".kbkkbk.",
      ".kb..bk.",
      ".kk..kk.",
    ],
  },
  armchair: {
    name: "an armchair", aliases: ["easy chair", "comfy chair", "wing chair", "fireside chair"], group: "Sitting", on: "floor", w: 3, d: 3,
    rows: [
      "...kkkkkk...",
      "..kxxxxxxk..",
      ".kxxzzzzzZk.",
      ".kxzzzzzzZk.",
      "kkkzzzzzzZkk",
      "kxxkzzzzZkxk",
      "kxzkkkkkkkzk",
      "kxzkxxxxxkZk",
      "kxzkxxxxxkZk",
      "kxzkzzzzzkZk",
      "kzzkkkkkkkZk",
      "kzzzzzzzzzZk",
      "kZZZZZZZZZZk",
      ".kkkkkkkkkk.",
      ".kd......dk.",
    ],
  },
  sofa: {
    name: "a sofa", aliases: ["settee", "couch", "chesterfield"], group: "Sitting", on: "floor", w: 6, d: 3,
    rows: [
      "...kkkkkkkkkkkkkkkkkk...",
      "..kxxxxxxxxxxxxxxxxxxk..",
      ".kxxzzzzzzzzzzzzzzzzzZk.",
      ".kxzzzzzzzzzzzzzzzzzzZk.",
      "kkkzzzzzzzzzzzzzzzzzzZkk",
      "kxxkzzzzzzzzzzzzzzzzZkxk",
      "kxzkkkkkkkkkkkkkkkkkkkzk",
      "kxzkxxxxxxxxkxxxxxxxxkZk",
      "kxzkxxxxxxxxkxxxxxxxxkZk",
      "kxzkzzzzzzzzkzzzzzzzzkZk",
      "kzzkkkkkkkkkkkkkkkkkkkZk",
      "kzzzzzzzzzzzzzzzzzzzzzZk",
      "kZZZZZZZZZZZZZZZZZZZZZZk",
      ".kkkkkkkkkkkkkkkkkkkkkk.",
      ".kd..................dk.",
    ],
    pal: { x: "#8fb0a0", z: "#5f8a7c", Z: "#3c5c58" },
  },
  pew: {
    name: "a pew", aliases: ["long bench", "settle", "church bench", "indoor bench", "waiting bench"], group: "Sitting", on: "floor", w: 6, d: 2,
    rows: stretch([
      ".kkkkkk.",
      "kWWWWWWk",
      "kttttttk",
      "kttttttk",
      "kbbbbbbk",
      "kkkkkkkk",
      "kWWWWWWk",
      "kWWWWWWk",
      "kttttttk",
      "kkkkkkkk",
      "kbk..kbk",
      "kbk..kbk",
      "kkk..kkk",
    ], 3, 16),
  },
  cushion: {
    name: "a floor cushion", aliases: ["cushion", "zabuton", "pouffe", "beanbag", "kneeling cushion"], group: "Sitting", on: "floor", w: 2, d: 2,
    rows: [
      ".kkkkkk.",
      "kxxxxxxk",
      "kxxzxxzk",
      "kxzzzzzk",
      "kzzzzzZk",
      "kZZZZZZk",
      "kZZZZZZk",
      ".kkkkkk.",
    ],
    pal: { x: "#8aa6d0", z: "#6a84b8", Z: "#4a5c8a" },
  },

  // --- Tables
  table: {
    name: "a table", aliases: ["kitchen table", "dining table", "wooden table", "tea table", "cafe table"], group: "Tables", on: "floor", w: 4, d: 3,
    rows: [
      ".kkkkkkkkkkkkkk.",
      "kWWWWWWWWWWWWWWk",
      "kWWWtWWWWWWWWWtk",
      "kWWWWWWWWWtWWWtk",
      "kWWWWWWWWWWWWWtk",
      "kkkkkkkkkkkkkkkk",
      "kttttttttttttttk",
      "kbkkkkkkkkkkkkbk",
      "kbk..........kbk",
      "kbk..........kbk",
      "kdk..........kdk",
      "kkk..........kkk",
    ],
    slots: [{ x: 1, y: -6, w: 7, h: 10 }, { x: 8, y: -6, w: 7, h: 10 }],
  },
  side_table: {
    name: "a side table", aliases: ["small table", "little table", "occasional table", "round table", "lamp table"], group: "Tables", on: "floor", w: 2, d: 2,
    rows: [
      ".kkkkkk.",
      "kWWWWWWk",
      "kWWWWWtk",
      "kttttttk",
      ".kkkkkk.",
      "..ktbk..",
      "..ktbk..",
      "..ktbk..",
      ".kkkkkk.",
    ],
    slots: [{ x: 1, y: -7, w: 6, h: 10 }],
  },
  trestle: {
    name: "a long table", aliases: ["trestle table", "banqueting table", "refectory table", "big table", "meeting table"], group: "Tables", on: "floor", w: 8, d: 3,
    rows: stretch([
      ".kkkkkkkkkkkkkk.",
      "kWWWWWWWWWWWWWWk",
      "kWWWtWWWWWWWWWtk",
      "kWWWWWWWWWtWWWtk",
      "kWWWWWWWWWWWWWtk",
      "kkkkkkkkkkkkkkkk",
      "kttttttttttttttk",
      "kbkkkkkkkkkkkkbk",
      "kbk..........kbk",
      "kbk..........kbk",
      "kdk..........kdk",
      "kkk..........kkk",
    ], 7, 16),
    slots: [{ x: 1, y: -6, w: 7, h: 10 }, { x: 9, y: -6, w: 7, h: 10 }, { x: 16, y: -6, w: 7, h: 10 }, { x: 24, y: -6, w: 7, h: 10 }],
  },
  desk: {
    name: "a desk", aliases: ["writing desk", "office desk", "bureau", "study desk"], group: "Tables", on: "floor", w: 5, d: 3,
    rows: [
      ".kkkkkkkkkkkkkkkkkk.",
      "kWWWWWWWWWWWWWWWWWWk",
      "kWWtWWWWWWWWWWWWWWtk",
      "kWWWWWWWWWWWWtWWWWtk",
      "kkkkkkkkkkkkkkkkkkkk",
      "kttttttttttktttttttk",
      "kbkkkkkkkkbkkkkkkkbk",
      "kbk......kbkWWyWWkbk",
      "kbk......kbktttttkbk",
      "kbk......kbkkkkkkkbk",
      "kbk......kbkWWyWWkbk",
      "kbk......kbktttttkbk",
      "kdk......kdkkkkkkkdk",
      "kkk......kkkkkkkkkkk",
    ],
    slots: [{ x: 1, y: -6, w: 8, h: 9 }, { x: 11, y: -6, w: 8, h: 9 }],
  },
  workbench: {
    name: "a workbench", aliases: ["work bench", "carpenter's bench", "potting bench", "tool bench"], group: "Tables", on: "floor", w: 6, d: 2,
    rows: [
      ".kkkkkkkkkkkkkkkkkkkkkk.",
      "kPPPPPPPPPPPPPPPPPPPPPPk",
      "kPWPPPPPPPPWPPPPPPPPPWWk",
      "kkkkkkkkkkkkkkkkkkkkkkkk",
      "kWWWWWWWWWWWWWWWWWWWWWWk",
      "kttkkkkkkkkkkkkkkkkkkttk",
      "ktk..................ktk",
      "ktkkkkkkkkkkkkkkkkkkkktk",
      "ktkbbbbbbbbbbbbbbbbbbktk",
      "kbkkkkkkkkkkkkkkkkkkkkbk",
      "kbk..................kbk",
      "kkk..................kkk",
    ],
    pal: { P: "#d6b476" },
    slots: [{ x: 2, y: -7, w: 9, h: 9 }, { x: 13, y: -7, w: 9, h: 9 }, { x: 4, y: 3, w: 16, h: 5 }],
  },

  // --- Storage
  bookcase: {
    name: "a bookcase", aliases: ["bookshelf", "bookshelves", "shelf of books", "books", "library shelves"], group: "Storage", on: "floor", w: 4, d: 1,
    rows: [
      "kkkkkkkkkkkkkkkk",
      "kWWWWWWWWWWWWWWk",
      "kttttttttttttttk",
      "ktkddddddddddkbk",
      "ktkdrUddydddpkbk",
      "ktkdrUnwyRdupkbk",
      "ktkdrUnwyRdupkbk",
      "ktkdrUnwyRuupkbk",
      "ktkdrUnwyRuupkbk",
      "ktkWWWWWWWWWWkbk",
      "kttttttttttttttk",
      "ktkddddddddddkbk",
      "ktkdvddwdddddkbk",
      "ktkdvlNwqdrrdkbk",
      "ktkdvlNwqdyydkbk",
      "ktkdvlNwqdUUdkbk",
      "ktkdvlNwqdnndkbk",
      "ktkWWWWWWWWWWkbk",
      "kttttttttttttttk",
      "ktkddddddddddkbk",
      "ktkddyddddddukbk",
      "ktkduyRdddqpukbk",
      "ktkduyRdrdqpukbk",
      "ktkduyRrrdqpukbk",
      "ktkduyRrdrqpukbk",
      "ktkWWWWWWWWWWkbk",
      "kttttttttttttttk",
      "kbbbbbbbbbbbbbbk",
      "kkkkkkkkkkkkkkkk",
    ],
  },
  shelf_unit: {
    name: "a set of shelves", aliases: ["shelves", "shelving", "shelf unit", "open shelves", "stock shelves"], group: "Storage", on: "floor", w: 4, d: 1,
    rows: [
      "kkkkkkkkkkkkkkkk",
      "kWWWWWWWWWWWWWWk",
      "kttttttttttttttk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkWWWWWWWWWWkbk",
      "kttttttttttttttk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkWWWWWWWWWWkbk",
      "kttttttttttttttk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkddddddddddkbk",
      "ktkWWWWWWWWWWkbk",
      "kttttttttttttttk",
      "kbbbbbbbbbbbbbbk",
      "kkkkkkkkkkkkkkkk",
    ],
    slots: [
      { x: 3, y: 3, w: 5, h: 7 }, { x: 8, y: 3, w: 5, h: 7 },
      { x: 3, y: 11, w: 5, h: 7 }, { x: 8, y: 11, w: 5, h: 7 },
      { x: 3, y: 19, w: 5, h: 7 }, { x: 8, y: 19, w: 5, h: 7 },
    ],
    stock: "jar",
  },
  cupboard: {
    name: "a cupboard", aliases: ["cabinet", "kitchen cupboard", "store cupboard", "press", "linen cupboard"], group: "Storage", on: "floor", w: 4, d: 2,
    rows: [
      ".kkkkkkkkkkkkkk.",
      "kWWWWWWWWWWWWWWk",
      "kWWWWWWWWWWWWWtk",
      "kkkkkkkkkkkkkkkk",
      "kttttttkkttttttk",
      "ktWWWWbkktWWWWbk",
      "ktWttWbkktWttWbk",
      "ktWttWbkktWttWbk",
      "ktWttWbkktWttWbk",
      "ktWttWykkyWttWbk",
      "ktWttWbkktWttWbk",
      "ktWttWbkktWttWbk",
      "ktWttWbkktWttWbk",
      "ktbbbbbkkbbbbbbk",
      "kttttttkkttttttk",
      "kkkkkkkkkkkkkkkk",
      "kbk..........kbk",
      "kkk..........kkk",
    ],
    slots: [{ x: 1, y: -7, w: 7, h: 10 }, { x: 8, y: -7, w: 7, h: 10 }],
  },
  drawers: {
    name: "a chest of drawers", aliases: ["drawers", "dresser drawers", "tallboy", "commode"], group: "Storage", on: "floor", w: 3, d: 2,
    rows: [
      ".kkkkkkkkkk.",
      "kWWWWWWWWWWk",
      "kWWWWWWWWWtk",
      "kkkkkkkkkkkk",
      "ktWWWWWWWWbk",
      "ktttYkkYttbk",
      "kbbbbbbbbbbk",
      "ktWWWWWWWWbk",
      "ktttYkkYttbk",
      "kbbbbbbbbbbk",
      "ktWWWWWWWWbk",
      "ktttYkkYttbk",
      "kbbbbbbbbbbk",
      "kkkkkkkkkkkk",
      ".kd......dk.",
    ],
    slots: [{ x: 1, y: -7, w: 10, h: 10 }],
  },
  wardrobe: {
    name: "a wardrobe", aliases: ["armoire", "clothes cupboard", "locker", "lockers"], group: "Storage", on: "floor", w: 4, d: 2,
    rows: [
      "..kkkkkkkkkkkk..",
      ".kWWWWWWWWWWWWk.",
      "kkkkkkkkkkkkkkkk",
      "kWWWWWWWWWWWWWWk",
      "kttttttttttttttk",
      "kkkkkkkkkkkkkkkk",
      "ktWWWWbkktWWWWbk",
      "ktWttWbkktWttWbk",
      "ktWttWbkktWttWbk",
      "ktWttWbkktWttWbk",
      "ktWttWbkktWttWbk",
      "ktWttWbkktWttWbk",
      "ktWttWykkyWttWbk",
      "ktWttWbkktWttWbk",
      "ktWttWbkktWttWbk",
      "ktWttWbkktWttWbk",
      "ktWttWbkktWttWbk",
      "ktWttWbkktWttWbk",
      "ktbbbbbkkbbbbbbk",
      "kkkkkkkkkkkkkkkk",
      "kbbbbbbbbbbbbbbk",
      "kkkkkkkkkkkkkkkk",
      ".kd..........dk.",
    ],
  },
  chest: {
    name: "a chest", aliases: ["trunk", "blanket box", "toy box", "sea chest", "box"], group: "Storage", on: "floor", w: 3, d: 2,
    rows: [
      ".kkkkkkkkkk.",
      "kWWWWWWWWWWk",
      "kWtWWWWWWtWk",
      "kmmmmmmmmmmk",
      "kkkkkkkkkkkk",
      "kttmtyytmttk",
      "kttmtkktmtbk",
      "kttmttttmtbk",
      "kbbmbbbbmbbk",
      "kkkkkkkkkkkk",
    ],
  },
  filing_cabinet: {
    name: "a filing cabinet", aliases: ["filing cabinets", "files", "cabinet of files", "records"], group: "Storage", on: "floor", w: 2, d: 2,
    rows: [
      ".kkkkkk.",
      "kSSSSSSk",
      "kSSSSSsk",
      "kkkkkkkk",
      "ksSSSSgk",
      "ksswcsgk",
      "ksgkkggk",
      "kggggggk",
      "ksSSSSgk",
      "ksswcsgk",
      "ksgkkggk",
      "kggggggk",
      "ksSSSSgk",
      "ksswcsgk",
      "ksgkkggk",
      "kggggggk",
      "kkkkkkkk",
    ],
    slots: [{ x: 1, y: -7, w: 6, h: 10 }],
  },
  crate: {
    name: "a crate", aliases: ["crates", "wooden crate", "packing case", "box of stock", "boxes"], group: "Storage", on: "floor", w: 2, d: 2,
    rows: [
      ".kkkkkk.",
      "kPPPPPPk",
      "kPWWWWPk",
      "kPPPPPPk",
      "kkkkkkkk",
      "kWWWWWtk",
      "kttttttk",
      "kWWWWWtk",
      "kttttttk",
      "kWWWWWtk",
      "kbbbbbbk",
      "kkkkkkkk",
    ],
    slots: [{ x: 1, y: -6, w: 6, h: 9 }],
  },
  barrel: {
    name: "a barrel", aliases: ["cask", "keg", "water butt", "barrels"], group: "Storage", on: "floor", w: 2, d: 2,
    rows: [
      ".kkkkkk.",
      "kWttttWk",
      "kttbbttk",
      "kmmmmmmk",
      "kWttttbk",
      "kWtttbbk",
      "kmmmmmmk",
      "kWttttbk",
      "kWtttbbk",
      "kmmmmmmk",
      ".kbbbbk.",
      "..kkkk..",
    ],
  },
  basket: {
    name: "a basket", aliases: ["wicker basket", "laundry basket", "hamper", "log basket"], group: "Storage", on: "floor", w: 2, d: 1, held: "sit",
    rows: [
      ".kkkkkk.",
      "kddddddk",
      "kWyWyWyk",
      "kyWyWyWk",
      "kWyWyWyk",
      ".kkkkkk.",
    ],
    pal: { y: "#d6b476" },
  },

  // --- Things that hold things
  sword_rack: {
    name: "a sword rack", aliases: ["rack of practice swords", "rack of swords", "weapon rack", "bokken rack", "rack of staffs", "stick rack"], group: "Racks", on: "floor", w: 4, d: 1,
    rows: [
      "kkkkkkkkkkkkkkkk",
      "kWWWWWWWWWWWWWWk",
      "kttkttkttkttkttk",
      "kkkkkkkkkkkkkkkk",
      "kWk..........kbk",
      "kWk..........kbk",
      "kWk..........kbk",
      "kWk..........kbk",
      "kWk..........kbk",
      "kWk..........kbk",
      "kWk..........kbk",
      "kWk..........kbk",
      "kkkkkkkkkkkkkkkk",
      "kWWWWWWWWWWWWWWk",
      "kttttttttttttttk",
      "kkkkkkkkkkkkkkkk",
      "kWk..........kbk",
      "kWk..........kbk",
      "kkk..........kkk",
    ],
    slots: [{ x: 2, y: 1, w: 3, h: 17, hang: true }, { x: 5, y: 1, w: 3, h: 17, hang: true }, { x: 8, y: 1, w: 3, h: 17, hang: true }, { x: 11, y: 1, w: 3, h: 17, hang: true }],
    stock: "practice_sword",
  },
  peg_board: {
    name: "a peg board", aliases: ["board of belts", "belt board", "board of pegs", "peg rail", "board on the wall with pegs"], group: "Racks", on: "wall", w: 6, d: 0,
    rows: [
      "kkkkkkkkkkkkkkkkkkkkkkkk",
      "kWWWWWWWWWWWWWWWWWWWWWWk",
      "kWkkkkkkkkkkkkkkkkkkkktk",
      "kWkPPPPPPPPPPPPPPPPPPktk",
      "kWkPkPPPPkPPPPkPPPPkPktk",
      "kWkPPPPPPPPPPPPPPPPPPktk",
      "kWkPPPPPPPPPPPPPPPPPPktk",
      "kWkPPPPPPPPPPPPPPPPPPktk",
      "kWkPPPPPPPPPPPPPPPPPPktk",
      "kWkPPPPPPPPPPPPPPPPPPktk",
      "kWkPPPPPPPPPPPPPPPPPPktk",
      "kWkPPPPPPPPPPPPPPPPPPktk",
      "kWkPPPPPPPPPPPPPPPPPPktk",
      "kWkPPPPPPPPPPPPPPPPPPktk",
      "kWkkkkkkkkkkkkkkkkkkkktk",
      "kttttttttttttttttttttttk",
      "kkkkkkkkkkkkkkkkkkkkkkkk",
    ],
    pal: { P: "#d6b476" },
    slots: [{ x: 2, y: 4, w: 5, h: 10, hang: true }, { x: 7, y: 4, w: 5, h: 10, hang: true }, { x: 12, y: 4, w: 5, h: 10, hang: true }, { x: 17, y: 4, w: 5, h: 10, hang: true }],
    stock: "belt",
  },
  coat_hooks: {
    name: "a row of coat hooks", aliases: ["coat hooks", "hooks", "coat pegs", "hat pegs", "hook rail"], group: "Racks", on: "wall", w: 4, d: 0,
    rows: [
      "kkkkkkkkkkkkkkkk",
      "kWWWWWWWWWWWWWWk",
      "kWsWWWWsWWWWsWtk",
      "kttgttttgttttgtk",
      "kkkkkkkkkkkkkkkk",
    ],
    slots: [{ x: 0, y: 2, w: 5, h: 12, hang: true }, { x: 5, y: 2, w: 5, h: 12, hang: true }, { x: 10, y: 2, w: 5, h: 12, hang: true }],
    stock: "coat",
  },
  coat_stand: {
    name: "a coat stand", aliases: ["hat stand", "hatstand", "coat rack", "hall stand"], group: "Racks", on: "floor", w: 3, d: 1,
    rows: [
      ".....kk.....",
      "....kWbk....",
      ".k..kWbk..k.",
      "kbkkkWbkkkbk",
      ".kk.kWbk.kk.",
      "....kWbk....",
      "....kWbk....",
      "....kWbk....",
      "....kWbk....",
      "....kWbk....",
      "....kWbk....",
      "....kWbk....",
      "....kWbk....",
      "....kWbk....",
      "....kWbk....",
      "....kWbk....",
      "....kWbk....",
      "....kWbk....",
      "...kkWbkk...",
      "..kWWWbbbk..",
      "..kkkkkkkk..",
    ],
    slots: [{ x: 0, y: 3, w: 5, h: 14, hang: true }, { x: 7, y: 3, w: 5, h: 14, hang: true }],
    stock: "coat",
  },
  shoe_rack: {
    name: "a shoe rack", aliases: ["shoe rack by the door", "rack of shoes", "shoes", "boot rack", "shoe shelf"], group: "Racks", on: "floor", w: 3, d: 1,
    rows: [
      "kkkkkkkkkkkk",
      "kWWWWWWWWWWk",
      "kttttttttttk",
      "kdkrrkduukbk",
      "kdrrRkuuUkbk",
      "kWWWWWWWWWWk",
      "kttttttttttk",
      "kdkeekdmmkbk",
      "kdeeekmmmkbk",
      "kWWWWWWWWWWk",
      "kttttttttttk",
      "kkkkkkkkkkkk",
    ],
  },
  umbrella_stand: {
    name: "an umbrella stand", aliases: ["umbrellas", "stick stand", "brolly stand"], group: "Racks", on: "floor", w: 2, d: 1,
    rows: [
      "..k..k..",
      ".kuk.kpk",
      ".kuk.kpk",
      "kuUukpkk",
      "kkUkkpk.",
      "..kk.k..",
      ".kkkkkk.",
      "kSSSSSgk",
      "ksSsssgk",
      "ksSsssgk",
      "ksSsssgk",
      "kgggggmk",
      ".kkkkkk.",
    ],
  },
  trophy_cabinet: {
    name: "a trophy cabinet", aliases: ["trophy case", "cabinet of trophies", "glass cabinet", "display cabinet", "curio cabinet"], group: "Racks", on: "floor", w: 4, d: 1,
    rows: [
      "...kkkkkkkkkk...",
      "..kWWWWWWWWWWk..",
      "kkkkkkkkkkkkkkkk",
      "kWWWWWWWWWWWWWWk",
      "kttttttttttttttk",
      "ktkabbbbbbbbbkbk",
      "ktkbabbbbbbbbkbk",
      "ktkbbbbbbbbbbkbk",
      "ktkbbbbbbbbbbkbk",
      "ktkbbbbbbbbbbkbk",
      "ktkbbbbbbbbbbkbk",
      "ktkbbbbbbbbbbkbk",
      "ktkaaaaaaaaaakbk",
      "ktkkkkkkkkkkkkbk",
      "ktkabbbbbbbbbkbk",
      "ktkbbbbbbbbbbkbk",
      "ktkbbbbbbbbbbkbk",
      "ktkbbbbbbbbbbkbk",
      "ktkbbbbbbbbbbkbk",
      "ktkbbbbbbbbbbkbk",
      "ktkbbbbbbbbbbkbk",
      "ktkaaaaaaaaaakbk",
      "ktkkkkkkkkkkkkbk",
      "kttttttttttttttk",
      "kttttyttttyttttk",
      "kbbbbbbbbbbbbbbk",
      "kkkkkkkkkkkkkkkk",
      ".kd..........dk.",
    ],
    pal: { b: "#5a4a58", a: "#c8e8e8" },
    slots: [{ x: 3, y: 5, w: 5, h: 8 }, { x: 8, y: 5, w: 5, h: 8 }, { x: 3, y: 14, w: 5, h: 8 }, { x: 8, y: 14, w: 5, h: 8 }],
    stock: "trophy",
  },
  display_case: {
    name: "a display case", aliases: ["glass counter", "display counter", "cake counter", "showcase", "jewellery case"], group: "Racks", on: "floor", w: 5, d: 2,
    rows: [
      ".kkkkkkkkkkkkkkkkkk.",
      "kSSSSSSSSSSSSSSSSSSk",
      "kkkkkkkkkkkkkkkkkkkk",
      "ktkaaccaaaaaaaaaakbk",
      "ktkacaaaaaaaaaaaakbk",
      "ktkaaaaaaaaaaaaaakbk",
      "ktkaaaaaaaaaaaaaakbk",
      "ktkaaaaaaaaaaaaaakbk",
      "ktkaaaaaaaaaaaaaakbk",
      "ktkwwwwwwwwwwwwwwkbk",
      "ktkkkkkkkkkkkkkkkkbk",
      "kttttttttttttttttttk",
      "ktWWWWWWWWWWWWWWWWbk",
      "kttttttttttttttttttk",
      "kbbbbbbbbbbbbbbbbbbk",
      "kkkkkkkkkkkkkkkkkkkk",
    ],
    pal: { a: "#bfe0e0", c: "#f2fbf8" },
    slots: [{ x: 3, y: 2, w: 4, h: 8 }, { x: 8, y: 2, w: 4, h: 8 }, { x: 13, y: 2, w: 4, h: 8 }],
    stock: "cake",
  },
  tool_rack: {
    name: "a tool rack", aliases: ["tool board", "rack of tools", "tools on the wall", "pegboard of tools", "utensil rail"], group: "Racks", on: "wall", w: 5, d: 0,
    rows: [
      "kkkkkkkkkkkkkkkkkkkk",
      "kWWWWWWWWWWWWWWWWWWk",
      "kWsWWWWsWWWWsWWWWsWk",
      "kttgttttgttttgttttgk",
      "kkkkkkkkkkkkkkkkkkkk",
    ],
    slots: [{ x: 0, y: 2, w: 5, h: 10, hang: true }, { x: 5, y: 2, w: 5, h: 10, hang: true }, { x: 10, y: 2, w: 5, h: 10, hang: true }, { x: 15, y: 2, w: 5, h: 10, hang: true }],
    stock: "saucepan",
  },

  // --- Underfoot
  rug: {
    name: "a rug", aliases: ["carpet", "persian rug", "red rug", "hearth rug", "oriental rug"], group: "Underfoot", on: "floor", w: 5, d: 3,
    rows: [
      "RRRRRRRRRRRRRRRRRRRR",
      "RyyyyyyyyyyyyyyyyyyR",
      "RyRRRRRRRRRRRRRRRRyR",
      "RyRrrrrrryyrrrrrrRyR",
      "RyRrrrrryuuyrrrrrRyR",
      "RyRrrrryuwwuyrrrrRyR",
      "RyRrrrryuwwuyrrrrRyR",
      "RyRrrrrryuuyrrrrrRyR",
      "RyRrrrrrryyrrrrrrRyR",
      "RyRRRRRRRRRRRRRRRRyR",
      "RyyyyyyyyyyyyyyyyyyR",
      "RRRRRRRRRRRRRRRRRRRR",
    ],
    pal: { R: "#7a3438", r: "#b0453a", y: "#d9b45e", u: "#4a6fa0", w: "#f0dcb0" },
  },
  round_rug: {
    name: "a round rug", aliases: ["rag rug", "braided rug", "oval rug", "circular rug", "bath mat"], group: "Underfoot", on: "floor", w: 4, d: 3,
    rows: [
      "....UUUUUUUU....",
      "..UUuuuuuuuuUU..",
      ".UuuwwwwwwwwuuU.",
      "UuuwwuuuuuuwwuuU",
      "UuwwuuyyyyuuwwuU",
      "UuwuuyyyyyyuuwuU",
      "UuwuuyyyyyyuuwuU",
      "UuwwuuyyyyuuwwuU",
      "UuuwwuuuuuuwwuuU",
      ".UuuwwwwwwwwuuU.",
      "..UUuuuuuuuuUU..",
      "....UUUUUUUU....",
    ],
    pal: { U: "#4a5c8a", u: "#7a96c4", w: "#efe2c4", y: "#d98a6a" },
  },
  runner: {
    name: "a runner", aliases: ["hall runner", "long rug", "carpet runner", "red carpet", "aisle carpet"], group: "Underfoot", on: "floor", w: 8, d: 2,
    rows: stretch([
      "NNNNNNNN",
      "NyyyyyyN",
      "NylnnlyN",
      "NynyynyN",
      "NynyynyN",
      "NylnnlyN",
      "NyyyyyyN",
      "NNNNNNNN",
    ], 3, 24),
    pal: { N: "#2f5446", n: "#4f7a5e", l: "#8fb07a", y: "#d9c48a" },
  },
  tatami: {
    name: "a tatami mat", aliases: ["mats", "mat", "tatami", "training mats", "dojo mats", "judo mats"], group: "Underfoot", on: "floor", w: 4, d: 2,
    rows: [
      "NNNNNNNNNNNNNNNN",
      "fffffffffffffffF",
      "fFffffFffffffFfF",
      "fffffffffffffffF",
      "ffffFfffffFffffF",
      "fffffffffffffffF",
      "fFfffffFffffffFF",
      "NNNNNNNNNNNNNNNN",
    ],
    pal: { N: "#2f4a36", f: "#cfc684", F: "#aaa262" },
  },
  exercise_mat: {
    name: "an exercise mat", aliases: ["yoga mat", "gym mat", "crash mat", "foam mat", "mats for exercise"], group: "Underfoot", on: "floor", w: 3, d: 4,
    rows: [
      "kkkkkkkkkkkk",
      "kaaaaaaaaauk",
      "kauuuuuuuuuk",
      "kauuuuuuuuuk",
      "kauuuuuuuuuk",
      "kauuuuuuuuuk",
      "kauuuuuuuuuk",
      "kauuuuuuuuuk",
      "kauuuuuuuuuk",
      "kauuuuuuuuuk",
      "kauuuuuuuuuk",
      "kauuuuuuuuuk",
      "kauuuuuuuuuk",
      "kauuuuuuuuuk",
      "kUUUUUUUUUUk",
      "kkkkkkkkkkkk",
    ],
    pal: { a: "#9ac8e8", u: "#6a9fd0", U: "#4a6fa0" },
  },
  doormat: {
    name: "a doormat", aliases: ["welcome mat", "door mat", "coir mat", "boot scraper"], group: "Underfoot", on: "floor", w: 3, d: 1,
    rows: [
      "eeeeeeeeeeee",
      "eYyYyYyYyYYe",
      "eyYyYyYyYyYe",
      "eYyYyYyYyYYe",
      "eeeeeeeeeeee",
    ],
    pal: { e: "#6e4a3a", Y: "#b08652", y: "#cca66a" },
  },

  // --- Small things, held in others' slots
  practice_sword: {
    name: "a practice sword", aliases: ["bokken", "wooden sword", "sword", "staff", "kendo stick"], group: "Held", on: "floor", w: 1, d: 1, held: "hang",
    rows: [".k.", "kdk", "kdk", "kdk", "kmk", "kWk", "kWk", "kWk", "kWk", "kWk", "kWk", "kWk", "kWk", "kWk", ".k."],
  },
  belt: {
    name: "a belt", aliases: ["belts", "karate belt", "coloured belt", "sash"], group: "Held", on: "floor", w: 2, d: 1, held: "hang",
    rows: ["..k..", ".kyk.", "kyyyk", "kYYYk", "kyyyk", "kykyk", "kykyk", "kykyk", "kkkkk"],
  },
  coat: {
    name: "a coat", aliases: ["jacket", "coats", "mac", "overcoat", "gown", "robe"], group: "Held", on: "floor", w: 2, d: 1, held: "hang",
    rows: ["..k..", ".kuk.", "kuuUk", "kuuUk", "kukUk", "kuuUk", "kuuUk", "kuuUk", "kkkkk"],
    pal: { u: "#b08652", U: "#7a5a3c" },
  },
  saucepan: {
    name: "a saucepan", aliases: ["pan", "pans", "pot", "pots and pans", "frying pan"], group: "Held", on: "floor", w: 2, d: 1, held: "hang",
    rows: ["..k..", ".kmk.", ".kmk.", ".kmk.", "kkkkk", "kSsgk", "ksggk", ".kkk."],
  },
  trophy: {
    name: "a trophy", aliases: ["cup", "trophies", "prize", "award", "silver cup"], group: "Held", on: "floor", w: 2, d: 1, held: "sit",
    rows: ["kkkkk", "khyyk", "kyyYk", ".kyk.", ".kYk.", "kkkkk", "kdddk", "kkkkk"],
  },
  cake: {
    name: "a cake", aliases: ["cakes", "scones", "buns", "pastries", "sponge"], group: "Held", on: "floor", w: 1, d: 1, held: "sit",
    rows: [".kk.", "kwwk", "kppk", "kwwk", "kkkk"],
  },
  jar: {
    name: "a jar", aliases: ["jars", "sweet jar", "jar of sweets", "jam jar", "pickles", "preserves"], group: "Held", on: "floor", w: 1, d: 1, held: "sit",
    rows: [".kk.", "kRRk", "kpyk", "kypk", "kpuk", ".kk."],
    pal: { p: "#e88aa0" },
  },
};

/** Every fitting, by key, palettes filled in. */
export const FITTINGS: Record<string, FittingDef> = Object.fromEntries(
  Object.entries(PIECES).map(([key, { pal, ...p }]) => [key, { ...p, palette: { ...C, ...pal } }]),
);

const SURFACES = (s: Record<string, Omit<Surface, "palette"> & { pal?: Record<string, string> }>): Record<string, Surface> =>
  Object.fromEntries(Object.entries(s).map(([key, { pal, ...v }]) => [key, { ...v, palette: { ...C, ...pal } }]));

/** Interior floors. */
export const FLOORS: Record<string, Surface> = SURFACES({});

/** Interior wall finishes. */
export const WALLS: Record<string, Surface> = SURFACES({});

/** A fitting by key, or undefined. */
export const fitting = (key: string): FittingDef | undefined => (Object.hasOwn(FITTINGS, key) ? FITTINGS[key] : undefined);

// --- Matching what Gary wrote to a key

const STOP = new Set(["a", "an", "the", "some", "of", "for", "with", "and", "by", "in", "on", "to", "at", "set", "pair", "few", "couple", "one", "two", "three", "small", "large", "big", "little", "old", "new"]);

const word = (w: string) =>
  w.endsWith("ies") && w.length > 4 ? w.slice(0, -3) + "y"
  : w.endsWith("ves") && w.length > 4 ? w.slice(0, -3) + "f"
  : /(ch|sh|x|ss)es$/.test(w) ? w.slice(0, -2)
  : w.endsWith("s") && !w.endsWith("ss") && w.length > 3 ? w.slice(0, -1)
  : w;

/** The words that matter, singular, and the head noun ("rack" in "a rack of practice swords"). */
function words(s: string): { all: Set<string>; head: string } {
  const raw = s.toLowerCase().replace(/['’]s\b/g, "").replace(/[^a-z ]+/g, " ").split(/\s+/).filter(Boolean);
  const of = raw.indexOf("of");
  const before = (of > 0 ? raw.slice(0, of) : raw).filter((w) => !STOP.has(w));
  const all = new Set(raw.filter((w) => !STOP.has(w)).map(word));
  return { all, head: word(before.at(-1) ?? [...all].at(-1) ?? "") };
}

function likeness(a: ReturnType<typeof words>, b: ReturnType<typeof words>): number {
  let shared = 0;
  for (const w of a.all) if (b.all.has(w)) shared++;
  if (!shared) return 0;
  const overlap = shared / new Set([...a.all, ...b.all]).size;
  return Math.min(1, overlap * 0.75 + (a.head === b.head ? 0.35 : 0));
}

const INDEX = Object.entries(FITTINGS).flatMap(([key, f]) => [f.name, key.replace(/_/g, " "), ...f.aliases].map((s) => ({ key, w: words(s) })));

/**
 * The library piece closest to a name as written ("a rack of practice swords"),
 * scored 0..1: 1 is the same words, around 0.5 shares the head noun and a word
 * more. Null when nothing shares a word. Whether it's close enough is the
 * caller's to say; 0.6 is a fair line.
 */
export function bestFitting(name: string): { key: string; score: number } | null {
  const q = words(name);
  let best: { key: string; score: number } | null = null;
  for (const e of INDEX) {
    const score = likeness(q, e.w);
    if (score > (best?.score ?? 0)) best = { key: e.key, score };
  }
  return best;
}
