// Copied from cozy_sprites src/render/props.ts (canon; copy, never import).
// Char grids: each character maps to a palette colour, anything else is
// transparent; width is the longest row. The Commons' own art lives beside
// this in src/content/props.ts — canon is a source, not a boundary.

export interface PropDef {
  rows: string[];
  palette: Record<string, string>;
}

export const K = "#402e3a"; // shared outline ink

export const CANON: Record<string, PropDef> = {
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
      // Was twelve cells against everyone else's eleven; the rasterizer sizes
      // the canvas from the first row and silently dropped the overflow, so it
      // never showed here. Caught by The Farm's props.test.ts on its vendored
      // copy; trimmed to what the art was always drawing.
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
  hay: {
    rows: [
      ".kkkkkkkkkk.",
      "khyyhhyyhyhk",
      "kyhyyhhyhyyk",
      "khhyhyyhhyhk",
      "kyhyhhyhyhyk",
      "khyyhyhhyyhk",
      ".kkkkkkkkkk.",
    ],
    palette: { k: "#8a6a2e", y: "#e8c56a", h: "#c9a648" },
  },
  picnic: {
    rows: [
      "......kbbbk.........",
      "......kbbbk.........",
      ".....kbbbbbk........",
      "..kkkkkkkkkkkkkkk...",
      ".krwrwrwrwrwrwrwrk..",
      "kwrwrwrwrwrwrwrwrwk.",
      "krwrwrwrwrwrwrwrwrrk",
      "kkkkkkkkkkkkkkkkkkkk",
    ],
    palette: { k: K, r: "#e05c48", w: "#f7ecd8", b: "#b98a4e" },
  },
  campfire: {
    rows: [
      ".....y......",
      "....yoy.....",
      "....yoy.....",
      "...yooroy...",
      "...yorroy...",
      "..yorrrroy..",
      "..yorrrroy..",
      "...yorroy...",
      ".t..yooy..t.",
      ".ttttkktttt.",
      "t.tt.kk.tt.t",
    ],
    palette: { k: K, y: "#ffd884", o: "#f59a3e", r: "#e05c48", t: "#7a5230" },
  },
  bunting: {
    // one repeating unit of festival flags on a string
    rows: [
      "ssssssssssss",
      ".rrr..bbb...",
      ".rrr..bbb...",
      "..r....b....",
      "............",
    ],
    palette: { s: "#8a6a4e", r: "#e06a7c", b: "#6aa9d8" },
  },
  lanterns: {
    // one repeating unit of paper lanterns on a string, for festival nights
    rows: [
      "ssssssssssss",
      "..k.....k...",
      ".kok...kok..",
      ".oyo...oyo..",
      ".oyo...oyo..",
      ".kok...kok..",
      "............",
    ],
    palette: { k: K, s: "#7a6a8a", o: "#f59a3e", y: "#ffe9a8" },
  },
  fence: {
    // distant paddock fence, tiles along the horizon
    rows: [
      "w........w..",
      "wwwwwwwwwwww",
      "w........w..",
      "wwwwwwwwwwww",
      "w........w..",
      "w........w..",
    ],
    palette: { w: "#9a7148" },
  },
  barn: {
    rows: [
      ".......kkkkkkkkk........",
      ".....kkrrrrrrrrrkk......",
      "...kkrrrrrrrrrrrrrkk....",
      ".kkrrrrrrrrrrrrrrrrrkk..",
      "kkbbbbbbbbbbbbbbbbbbbkk.",
      ".kbbwwbbbbbdddbbbbwwbk..",
      ".kbbwwbbbbdddddbbbwwbk..",
      ".kbbbbbbbbddkddbbbbbbk..",
      ".kbbbbbbbbddkddbbbbbbk..",
      ".kkkkkkkkkkkkkkkkkkkkk..",
    ],
    palette: { k: K, r: "#b0453a", b: "#c9584a", w: "#f7ecd8", d: "#7a4034" },
  },
  headstone: {
    // a rounded stone with a carved rim, moss and a flower at its foot
    rows: [
      "....kkkkkk....",
      "...kssssssk...",
      "..kssccccssk..",
      "..kscssssssk..",
      "..kssssssssk..",
      "..kscssssssk..",
      "..kssssssssk..",
      "..kscsssscsk..",
      "..kssssssssk..",
      ".kssssssssssk.",
      "rkmmssssssmmkg",
      ".g.g.g..g.g.g.",
    ],
    palette: { k: K, s: "#b0b4c4", c: "#888ca0", m: "#6a9a58", g: "#5a9440", r: "#e06a7c" },
  },
  garden: {
    // a tidy veggie bed: furrowed soil, sprout rows, one proud carrot shoulder
    rows: [
      ".kkkkkkkkkkkkkkkk.",
      "kSdddSdddSdddSdddk",
      "kSdgdSdgdSdgdSdgdk",
      "kSdddSdddSdddSdddk",
      "kSdgdSdodSdgdSdgdk",
      "kSdddSdddSdddSdddk",
      ".kkkkkkkkkkkkkkkk.",
    ],
    palette: { k: "#5c3d22", d: "#8a5f3c", S: "#7a5234", g: "#5a9440", o: "#e8863a" },
  },
  scarecrow: {
    // straw hat, button face, patched shirt on a crossbar pole
    rows: [
      "....khhhk...",
      "...khhhhhk..",
      "..khhhhhhhk.",
      "....kffk....",
      "...kffffk...",
      "kkkkssssskkk",
      "...ksssssk..",
      "...ksppssk..",
      "....ksssk...",
      "....ktbk....",
      "....ktbk....",
      "....ktbk....",
      "....ktbk....",
    ],
    palette: {
      k: K,
      h: "#e8c56a",
      f: "#f7ecd8",
      s: "#6aa9d8",
      p: "#e06a7c",
      t: "#7a5230",
      b: "#5c3d22",
    },
  },
  log: {
    // a fallen log to perch on by the fire
    rows: [
      ".kkkkkkkkkkkk.",
      "kbttttttttttbk",
      "kbtbttbtbttbbk",
      ".kkkkkkkkkkkk.",
    ],
    palette: { k: "#5c3d22", t: "#a97048", b: "#8a5a3c" },
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
