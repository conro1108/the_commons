// Everything a resident can build with: canon props from The Meadow, plus the
// Commons' own. Names are stored as text in the_commons.placements, so new art
// is a client change only — but never rename or drop one that's been placed.

import { CANON, K, type PropDef } from "./canon/props.ts";
import { ZOOM } from "../world/index.ts";
import { FEATURES } from "./features.ts";

const COMMONS: Record<string, PropDef> = {
  item: {
    // anything at all, written in: a parcel, its label tied on with string
    rows: [
      ".kkkkkkk.",
      "ktttttttk",
      "ktkkkwwwk",
      "ktttwkkwk",
      "kbbbwwwwk",
      "kbbbbbbbk",
      ".kkkkkkk.",
    ],
    palette: { k: K, t: "#c9a06a", b: "#a97048", w: "#fffdf3" },
  },
  bench: {
    // for looking at the pond with
    rows: [
      ".kkkkkkkkkkkkkk.",
      "kttttttttttttttk",
      "kbbbbbbbbbbbbbbk",
      ".kkkkkkkkkkkkkk.",
      "kttttttttttttttk",
      "kbbbbbbbbbbbbbbk",
      ".kkkkkkkkkkkkkk.",
      ".kb..........kb.",
      ".kb..........kb.",
    ],
    palette: { k: K, t: "#a97048", b: "#7a5230" },
  },
  flag: {
    // the small flag conditions so often require
    rows: ["kfff", "kfff", "kff.", "k...", "k...", "k...", "k..."],
    palette: { k: K, f: "#e06a7c" },
  },
  goose: {
    // a reasonably tall goose, the Commons' unit of height and its inspector
    rows: [
      "..kkk.....",
      ".kwwwk....",
      "oowkwk....",
      "..kwwk....",
      "...kwk....",
      "...kwk....",
      "...kwwkkk.",
      "..kwwwwwwk",
      "..kwgggwwk",
      "...kwwwwk.",
      "....kkkk..",
      "....o..o..",
    ],
    palette: { k: K, w: "#f7ecd8", g: "#b0b4c4", o: "#f59a3e" },
  },
  duck: {
    rows: [
      "..kk.....",
      ".kggk....",
      "ookgk....",
      "..kwkkkk.",
      ".kbbbbbbk",
      "..kkkkkk.",
    ],
    palette: { k: K, o: "#f59a3e", g: "#3e8a5a", w: "#f7ecd8", b: "#a97048" },
  },
  weathervane: {
    // points north, which on the commons is up
    rows: [
      "...k...",
      "..kyk..",
      ".kyyyk.",
      "..kyk..",
      "...y...",
      "kyyyyyk",
      "...y...",
      "...y...",
      "..kyk..",
      "..kyk..",
      "...k...",
      "...t...",
      "...t...",
      "...t...",
      "..ttt..",
    ],
    palette: { k: K, y: "#c9a648", t: "#5c3d22" },
  },
  plaque: {
    rows: [
      ".kkkkkk.",
      "kyyyyyyk",
      "kyddyddk",
      "kyyyyyyk",
      "kydddyyk",
      "kyyyyyyk",
      ".kkkkkk.",
      "...tb...",
      "...tb...",
    ],
    palette: { k: K, y: "#e8c56a", d: "#a8842e", t: "#7a5230", b: "#5c3d22" },
  },
  signpost: {
    // for the plot's name, which must be dignified
    rows: [
      ".kkkkkkkkkk.",
      "kwwwwwwwwwwk",
      "kwddwddddwwk",
      "kwwwwwwwwwwk",
      "kwdddwddwwwk",
      "kwwwwwwwwwwk",
      ".kkkkkkkkkk.",
      "..tb....tb..",
      "..tb....tb..",
      "..tb....tb..",
      "..tb....tb..",
      ".gtbg..gtbg.",
    ],
    palette: { k: K, w: "#e3c48e", d: "#8a5a3c", t: "#7a5230", b: "#5c3d22", g: "#5a9440" },
  },
  noticeboard: {
    rows: [
      ".kkkkkkkkkkkk.",
      "kttttttttttttk",
      "ktwrwcccwrcctk",
      "ktwllcccwlcctk",
      "ktwwwccccccctk",
      "ktccccwrwwcctk",
      "ktccccwllwcctk",
      "ktccccwwwwcctk",
      "kttttttttttttk",
      ".kkkkkkkkkkkk.",
      "..tb......tb..",
      "..tb......tb..",
      "..tb......tb..",
    ],
    palette: { k: K, t: "#7a5230", b: "#5c3d22", c: "#c9a06a", w: "#f7ecd8", l: "#b0b4c4", r: "#e05c48" },
  },
  postbox: {
    // Pesto empties it, eventually
    rows: [
      "..kkk..",
      ".krrrk.",
      "krhrrrk",
      "kkkkkkk",
      "krhrrrk",
      "krkkkrk",
      "krhrrrk",
      "krhwwrk",
      "krhrrrk",
      "krhrrrk",
      "kkkkkkk",
      "kdddddk",
      ".kkkkk.",
    ],
    palette: { k: K, r: "#d0463c", h: "#e8806e", w: "#f7ecd8", d: "#7a2e2a" },
  },
  lamppost: {
    rows: [
      "..kkk..",
      ".kpppk.",
      "kyyyyyk",
      "kylllyk",
      "kyyyyyk",
      ".kpppk.",
      "..kpk..",
      "...p...",
      "...p...",
      "...p...",
      "...p...",
      "...p...",
      "...p...",
      "...p...",
      "..ppp..",
      ".kpppk.",
    ],
    palette: { k: K, p: "#4a4458", y: "#ffd884", l: "#fff4c9" },
  },
  bin: {
    // municipal
    rows: [
      ".kkkkk.",
      "kgggggk",
      "kkkkkkk",
      "kgglggk",
      "kgglggk",
      "kgglggk",
      "kgglggk",
      ".kkkkk.",
    ],
    palette: { k: K, g: "#3e6e30", l: "#5a9440" },
  },
  sundial: {
    rows: [
      "....k....",
      "...kk....",
      ".kkkkkkk.",
      "kyyyyyyyk",
      ".kkkkkkk.",
      "..kssck..",
      "..kssck..",
      ".kkkkkkk.",
    ],
    palette: { k: K, y: "#e8c56a", s: "#b0b4c4", c: "#888ca0" },
  },
  birdbath: {
    rows: [
      ".kkkkkkk.",
      "kswwbbwsk",
      "ksbbbbbsk",
      ".kssssck.",
      "..kkkkk..",
      "...ksk...",
      "...ksk...",
      "...kck...",
      "..kssck..",
      ".kkkkkkk.",
    ],
    palette: { k: K, s: "#b0b4c4", c: "#888ca0", b: "#5db3c9", w: "#a8e4ef" },
  },
  beehive: {
    rows: [
      "....kkk....",
      "...khhhk...",
      "..khyyyhk..",
      ".khhhhhhhk.",
      ".kyyyyyyyk.",
      "khhhhhhhhhk",
      "kyyyykyyyyk",
      "khhhkdkhhhk",
      "kkkkkkkkkkk",
      ".kt.....tk.",
      ".kt.....tk.",
    ],
    palette: { k: K, h: "#c9a648", y: "#e8c56a", d: "#5c3d22", t: "#7a5230" },
  },
  gnome: {
    rows: [
      "...k...",
      "..krk..",
      "..krk..",
      ".krrrk.",
      ".kfffk.",
      "kwwfwwk",
      ".kwwwk.",
      "kbbwbbk",
      ".kbbbk.",
      ".kk.kk.",
    ],
    palette: { k: K, r: "#e05c48", f: "#f2d3b0", w: "#f7ecd8", b: "#6aa9d8" },
  },
  sunflower: {
    rows: [
      "..yyy..",
      ".yybyy.",
      "yybbbyy",
      ".yybyy.",
      "..yyy..",
      "...g...",
      ".l.g...",
      ".llg...",
      "...g.l.",
      "...gll.",
      "...g...",
      "...g...",
      "..ggg..",
    ],
    palette: { y: "#f5c968", b: "#7a5230", g: "#5a9440", l: "#74b356" },
  },
  hedge: {
    // will want to spread, eventually
    rows: [
      ".kkkkkkkkkk.",
      "kgglgggglggk",
      "kglllgglllgk",
      "kggggggggggk",
      "kgdggdgggdgk",
      "kggggggggggk",
      "kdgdggdgdggk",
      ".kkkkkkkkkk.",
    ],
    palette: { k: K, g: "#4e8a3c", l: "#74b356", d: "#3e6e30" },
  },
  rock: {
    rows: [
      "...kkkk..",
      ".kkllssk.",
      "kllssssck",
      "kssssscck",
      ".kkkkkkk.",
    ],
    palette: { k: K, l: "#c8ccd8", s: "#b0b4c4", c: "#888ca0" },
  },
  well: {
    rows: [
      "...kkkkkkkk...",
      "..krrrrrrrrk..",
      ".krrrrrrrrrrk.",
      "kkkkkkkkkkkkkk",
      "..tb...q..tb..",
      "..tb...q..tb..",
      "..tb..kkk.tb..",
      "..tb..kgk.tb..",
      "..tb..kkk.tb..",
      ".kkkkkkkkkkkk.",
      "kccscccsccscck",
      "ksscccsscccssk",
      "kcsccsccscccsk",
      "kssccsccssccsk",
      ".kkkkkkkkkkkk.",
    ],
    palette: { k: K, r: "#b0453a", t: "#7a5230", b: "#5c3d22", q: "#d8c08a", g: "#888ca0", c: "#b0b4c4", s: "#888ca0" },
  },
  shed: {
    rows: [
      "........kk........",
      "......kkrrkk......",
      "....kkrrrrrrkk....",
      "..kkrrrrrrrrrrkk..",
      "kkrrrrrrrrrrrrrrkk",
      ".kkkkkkkkkkkkkkkk.",
      ".kwwbwwbwwbwwbwwk.",
      ".kwkkkkkwkkkkkkwk.",
      ".kwkdddkwkaaaakwk.",
      ".kwkdddkwkffffkwk.",
      ".kwkdddkwkaaaakwk.",
      ".kwkdddkwkkkkkkwk.",
      ".kwkddhkwwbwwbwwk.",
      ".kwkdddkwwbwwbwwk.",
      ".kwkdddkwwbwwbwwk.",
      ".kkkkkkkkkkkkkkkk.",
    ],
    palette: { k: K, r: "#7a7f99", w: "#c9a06a", b: "#a97048", d: "#7a5230", h: "#e8c56a", a: "#a8e4ef", f: "#f7ecd8" },
  },
  notice: {
    // a filing pinned to a stake, awaiting Gary; Gary's, not the palette's
    rows: [
      "...r...",
      "kkkkkkk",
      "kpppppk",
      "kplllpk",
      "kpppppk",
      "kpllppk",
      "kpppppk",
      "kkkkkkk",
      "...b...",
      "...b...",
    ],
    palette: { k: K, p: "#fffdf3", l: "#9a8f9e", r: "#e06a7c", b: "#7a5230" },
  },
};

// Features join as "feature:boulder" and so on: drawable, never on the palette.
const PROPS: Record<string, PropDef> = Object.assign(
  Object.create(null), CANON, COMMONS, Object.fromEntries(Object.entries(FEATURES).map(([k, v]) => [`feature:${k}`, v])),
);

/** The build palette, in groups. Gary keeps the notice. */
export const PALETTE: { group: string; props: string[] }[] = [
  { group: "Growing", props: ["flowers", "tuft", "sunflower", "garden", "hedge", "tree"] },
  { group: "Sitting", props: ["bench", "log", "picnic", "campfire", "rock", "pond"] },
  { group: "Civic", props: ["flag", "plaque", "signpost", "noticeboard", "weathervane", "sundial", "postbox", "lamppost", "bin"] },
  { group: "Residents", props: ["goose", "duck", "gnome", "scarecrow", "beehive", "birdbath"] },
  { group: "Structures", props: ["fence", "shed", "well", "hay", "barn", "headstone"] },
  { group: "Festive", props: ["bunting", "lanterns"] },
];

/** The prop a placement draws as: a written-in item Gary has drawn wears its drawing, filed under its name. */
export function look(p: { prop: string; label?: string | null; sprite?: PropDef | null }): string {
  if (!p.sprite || !p.label) return p.prop;
  const name = `item:${p.label.trim().toLowerCase()}`;
  PROPS[name] ??= p.sprite;
  return name;
}

/** What a written-in item will look like when it goes up: its drawing, if that name has one yet, or a parcel. */
export function drawnAs(label: string): string {
  const name = `item:${label.trim().toLowerCase()}`;
  return PROPS[name] ? name : "item";
}

const cache = new Map<string, HTMLCanvasElement>();

/** A prop rasterised at one canvas pixel per cell, cached. Unknown names draw nothing. */
export function propCanvas(name: string): HTMLCanvasElement {
  let c = cache.get(name);
  if (c) return c;
  const def = PROPS[name] ?? { rows: [""], palette: {} };
  c = document.createElement("canvas");
  c.width = Math.max(1, ...def.rows.map((r) => r.length));
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

/** The build cells a prop covers, wide and deep, from its top-left anchor. No canvas, so tests can ask. */
export function footprint(name: string): [number, number] {
  const def = PROPS[name] ?? PROPS.item;
  return [Math.ceil(Math.max(1, ...def.rows.map((r) => r.length)) / ZOOM), Math.ceil(def.rows.length / ZOOM)];
}

export function propSize(name: string): { w: number; h: number } {
  const c = propCanvas(name);
  return { w: c.width, h: c.height };
}

/** Whether the prop has paint at (x, y), so clicks land on the prop and not its box. */
export function propHas(name: string, x: number, y: number): boolean {
  const def = PROPS[name];
  return !!def?.palette[def.rows[y]?.[x] ?? ""];
}
