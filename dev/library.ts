// Every piece in the library at scale, stood on a patch of floor or hung on a
// patch of wall, footprint dashed, slots boxed (sit cyan, hang pink) and filled
// with their stock. ?scale=4, ?floor=boards, ?wall=plaster, ?stock=0, ?slots=0,
// ?only=key, ?group=Tables (or surfaces), ?room=0 for no sample room. No network.

import { FITTINGS, FLOORS, WALLS, type FittingDef, type Surface } from "../src/content/fittings.ts";
import type { PropDef } from "../src/content/canon/props.ts";

const q = new URLSearchParams(location.search);
const S = +(q.get("scale") ?? 4);
const floorKey = q.get("floor") ?? Object.keys(FLOORS)[0];
const wallKey = q.get("wall") ?? Object.keys(WALLS)[0];
const showStock = q.get("stock") !== "0";
const showSlots = q.get("slots") !== "0";
const only = q.get("only");
const group = q.get("group")?.toLowerCase();
const out = document.getElementById("out")!;

const raster = (def: PropDef) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, ...def.rows.map((r) => r.length));
  c.height = def.rows.length;
  const x = c.getContext("2d")!;
  def.rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const col = def.palette[ch];
    if (col) { x.fillStyle = col; x.fillRect(i, j, 1, 1); }
  }));
  return c;
};

/** Fill a rect with a surface tiled from the rect's own corner, skirt along its foot. */
function tile(ctx: CanvasRenderingContext2D, s: Surface | undefined, x: number, y: number, w: number, h: number, skirt = true) {
  if (!s) return;
  const t = raster(s);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let j = y; j < y + h; j += t.height) for (let i = x; i < x + w; i += t.width) ctx.drawImage(t, i, j);
  if (s.skirt && skirt) {
    const k = raster({ rows: s.skirt, palette: s.palette });
    for (let i = x; i < x + w; i += k.width) ctx.drawImage(k, i, y + h - k.height);
  }
  ctx.restore();
}

/** A piece, with its stock in its slots. */
function drawPiece(ctx: CanvasRenderingContext2D, f: FittingDef, x: number, y: number, marks: boolean) {
  ctx.drawImage(raster(f), x, y);
  const st = f.stock ? FITTINGS[f.stock] : undefined;
  for (const s of f.slots ?? []) {
    if (st && showStock && !!s.hang === (st.held === "hang")) {
      const c = raster(st);
      if (c.width <= s.w && c.height <= s.h)
        ctx.drawImage(c, x + s.x + Math.floor((s.w - c.width) / 2), y + (s.hang ? s.y : s.y + s.h - c.height));
    }
    if (marks && showSlots) {
      ctx.strokeStyle = s.hang ? "#ff6ad5" : "#4ee6ff";
      ctx.lineWidth = 1 / S;
      ctx.strokeRect(x + s.x + 0.5 / S, y + s.y + 0.5 / S, s.w - 1 / S, s.h - 1 / S);
    }
  }
}

function card(parent: HTMLElement, w: number, h: number, caption: string) {
  const fig = document.createElement("figure");
  const cv = document.createElement("canvas");
  cv.width = w * S;
  cv.height = h * S;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.scale(S, S);
  fig.append(cv);
  if (caption) {
    const cap = document.createElement("figcaption");
    cap.innerHTML = caption;
    fig.append(cap);
  }
  parent.append(fig);
  return ctx;
}

function section(title: string) {
  const h = document.createElement("h2");
  h.textContent = title;
  const g = document.createElement("div");
  g.className = "grid";
  out.append(h, g);
  return g;
}

// A sample room, to judge pieces together: wall above, floor below.
if (q.get("room") !== "0" && !only && !group) {
  const g = section(`A room: ${floorKey} floor, ${wallKey} walls`);
  const W = 32 * 4, WALL = 9 * 4, H = WALL + 17 * 4;
  const ctx = card(g, W, H, "");
  tile(ctx, WALLS[wallKey], 0, 0, W, WALL);
  tile(ctx, FLOORS[floorKey], 0, WALL, W, H - WALL);
  // [key, cell x, cell y of the footprint's back row]; wall pieces: y is px up the wall from the floor line
  const room: [string, number, number][] = [
    ["chalkboard", 25, 16], ["wall_clock", 12, 22], ["picture", 17, 16], ["coat_hooks", 6, 9],
    ["bookcase", 1, 0], ["shelf_unit", 6, 0], ["fireplace", 12, 0], ["pot_plant", 19, 0], ["dresser", 21, 0],
    ["rug", 9, 6], ["armchair", 4, 6], ["side_table", 1, 7], ["table", 15, 7], ["chair", 13, 8], ["chair", 19, 8],
    ["floor_lamp", 1, 11], ["sofa", 8, 12], ["punching_bag", 27, 6], ["tatami", 24, 12], ["tatami", 28, 12],
  ];
  const at = (k: string, cx: number, cy: number) => {
    const f = FITTINGS[k];
    if (!f) return;
    const h = f.rows.length;
    if (f.on === "wall") drawPiece(ctx, f, cx * 4, WALL - cy - h, false);
    else drawPiece(ctx, f, cx * 4, WALL + (cy + f.d) * 4 - h, false);
  };
  // wall first, then the floor back to front, so nearer things overlap; flat things first of all
  const flat = (k: string) => (FITTINGS[k]?.group === "Underfoot" ? 0 : 1);
  room.filter(([k]) => FITTINGS[k]?.on === "wall").forEach(([k, x, y]) => at(k, x, y));
  room.filter(([k]) => FITTINGS[k]?.on === "floor")
    .sort((a, b) => flat(a[0]) - flat(b[0]) || a[2] + FITTINGS[a[0]].d - (b[2] + FITTINGS[b[0]].d))
    .forEach(([k, x, y]) => at(k, x, y));
}

const groups = new Map<string, [string, FittingDef][]>();
for (const [k, f] of Object.entries(FITTINGS)) if ((!only || k === only) && (!group || f.group.toLowerCase() === group)) groups.set(f.group, [...(groups.get(f.group) ?? []), [k, f]]);
const total = Object.keys(FITTINGS).length;
const placed = Object.values(FITTINGS).filter((f) => !f.held).length;
out.insertAdjacentHTML("afterbegin", `<div>${placed} pieces, ${total - placed} held things, ${Object.keys(FLOORS).length} floors, ${Object.keys(WALLS).length} walls</div>`);
for (const [name, list] of groups) {
  const g = section(`${name} (${list.length})`);
  for (const [k, f] of list) {
    const pw = f.rows[0].length, ph = f.rows.length, pad = 4;
    const lift = Math.max(0, ...(f.slots ?? []).map((s) => -s.y)); // room for things stood on tops
    const W = pw + pad * 2, H = ph + pad * 2 + lift;
    const info = f.held ? `held (${f.held})` : `${f.on} ${f.w}×${f.d}`;
    const slots = f.slots ? ` · ${f.slots.length} slot${f.slots.length > 1 ? "s" : ""}${f.stock ? ` of ${f.stock}` : ""}` : "";
    const ctx = card(g, W, H, `<b>${k}</b><br>${f.name}<br><small>${info}${slots}</small>`);
    if (f.on === "wall" || f.held === "hang") tile(ctx, WALLS[wallKey], 0, 0, W, H, false);
    else {
      const top = H - pad - (f.held ? 2 : f.d * 4);
      tile(ctx, WALLS[wallKey], 0, 0, W, top);
      tile(ctx, FLOORS[floorKey], 0, top, W, H - top);
      if (!f.held && showSlots) {
        ctx.setLineDash([1, 1]);
        ctx.strokeStyle = "#ffffffaa";
        ctx.lineWidth = 1 / S;
        ctx.strokeRect(pad, top, f.w * 4, f.d * 4);
        ctx.setLineDash([]);
      }
    }
    drawPiece(ctx, f, pad, pad + lift, true);
  }
}

if (!only && (!group || group === "surfaces")) {
  const g = section(`Floors (${Object.keys(FLOORS).length})`);
  for (const [k, s] of Object.entries(FLOORS)) tile(card(g, 64, 40, `<b>${k}</b><br>${s.name}`), s, 0, 0, 64, 40);
  const h = section(`Walls (${Object.keys(WALLS).length})`);
  for (const [k, s] of Object.entries(WALLS)) tile(card(h, 64, 40, `<b>${k}</b><br>${s.name}`), s, 0, 0, 64, 40);
}
