// The building toolbar's parts, outside and in: tabs along the bottom (one
// group open at a time), the tray of that group's things above them, and a
// short row of tools (move, resize, take down). HTML strings and the icons;
// src/main.ts fills them and wires them. Styles in index.html ("The dock").

import { K, type PropDef } from "./content/canon/props.ts";

const W = "#fffdf3", Y = "#ffe9a8", B = "#a97048", A = "#a8e4ef";

/** The tools' own icons, drawn like the props: ink on paper, 11 px. */
const ICONS: Record<string, PropDef> = {
  move: { rows: [
    ".....k.....",
    "....kkk....",
    "...kkkkk...",
    ".....k.....",
    ".k...k...k.",
    "kkkkkkkkkkk",
    ".k...k...k.",
    ".....k.....",
    "...kkkkk...",
    "....kkk....",
    ".....k.....",
  ], palette: { k: K } },
  resize: { rows: [
    "......kkkkk",
    "........kkk",
    ".......k.kk",
    "......k...k",
    ".....k.....",
    "kkkk.......",
    "kyyk.......",
    "kyyk.......",
    "kkkk.......",
    "...........",
    "...........",
  ], palette: { k: K, y: Y } },
  remove: { rows: [
    "....kkk....",
    "kkkkkkkkkkk",
    ".kwwwwwwwk.",
    ".kwkwkwkwk.",
    ".kwkwkwkwk.",
    ".kwkwkwkwk.",
    ".kwkwkwkwk.",
    ".kwwwwwwwk.",
    "..kkkkkkk..",
  ], palette: { k: K, w: W } },
  shell: { rows: [
    ".....k.....",
    "....kbk....",
    "...kbbbk...",
    "..kbbbbbk..",
    ".kbbbbbbbk.",
    "kkkkkkkkkkk",
    ".kwwwwwwwk.",
    ".kwkkwkkwk.",
    ".kwkkwkawk.",
    ".kwkkwkkwk.",
    ".kkkkkkkkk.",
  ], palette: { k: K, b: B, w: W, a: A } },
  window: { rows: [
    "kkkkkkkkk",
    "kaaakaaak",
    "kaWakaWak",
    "kaaakaaak",
    "kkkkkkkkk",
    "kaaakaaak",
    "kaaakaaak",
    "kkkkkkkkk",
  ], palette: { k: K, a: A, W } },
  door: { rows: [
    ".kkkkkk.",
    "kbbbbbbk",
    "kbkkkkbk",
    "kbkbbkbk",
    "kbkbbkbk",
    "kbbbbYbk",
    "kbkbbkbk",
    "kbkkkkbk",
    "kbbbbbbk",
    "kkkkkkkk",
  ], palette: { k: K, b: B, Y: "#e8c56a" } },
};

const urls = new Map<string, string>();

/** A tool's icon as an <img>, drawn twice over. */
export function toolIcon(name: string): string {
  const def = ICONS[name];
  if (!urls.has(name)) {
    const c = document.createElement("canvas");
    c.width = Math.max(...def.rows.map((r) => r.length));
    c.height = def.rows.length;
    const ctx = c.getContext("2d")!;
    def.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!def.palette[ch]) return;
      ctx.fillStyle = def.palette[ch];
      ctx.fillRect(x, y, 1, 1);
    }));
    urls.set(name, c.toDataURL());
  }
  const w = Math.max(...def.rows.map((r) => r.length));
  return `<img src="${urls.get(name)}" width="${w * 2}" height="${def.rows.length * 2}" alt="">`;
}

/** A picture of a thing for a button: whole times over where it fits the box, so the pixels stay square. */
export function pic(src: string, w: number, h: number, box = { w: 48, h: 34 }): string {
  const room = Math.min(box.w / w, box.h / h);
  const k = room >= 1 ? Math.min(Math.floor(room), 4) : room;
  return `<img src="${src}" width="${Math.round(w * k)}" height="${Math.round(h * k)}" alt="">`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);

/** A thing in the tray: its picture over its name. */
export const item = (data: string, picture: string, name: string, cls = "") =>
  `<button class="item ${cls}" ${data} title="${esc(name)}"><span class="pic">${picture}</span><span class="name">${esc(name)}</span></button>`;

/** A tab along the bottom. */
export const tab = (key: string, picture: string, name: string) =>
  `<button class="tab" data-tab="${esc(key)}"><span class="pic">${picture}</span><span class="name">${esc(name)}</span></button>`;

/** A tool in the tool row. */
export const tool = (key: string, name: string, title: string) =>
  `<button data-tool="${key}" title="${esc(title)}"><span class="pic">${toolIcon(key)}</span><span class="name">${esc(name)}</span></button>`;

/** "a picnic table" as a label: "picnic table". */
export const bare = (name: string) => name.replace(/^(a|an|some) /, "");
