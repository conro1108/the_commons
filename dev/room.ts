// A room with no network: a fake shell, fittings laid out, things held in things.
// ?w=10&h=7 (the shell's footprint), ?door=s|n|e|w, ?windows=n2,n7,e3 (side and
// cells along it), ?material=timber|brick|stone|plaster, ?paint=#hex, ?hour=,
// ?scale=3, ?bare=1 for an empty room. Hover to see what a click would land on,
// or which slot a trophy would go in.

import { canStand, drawRoom, onDoor, roomArt, roomSize, slotAt, thingAt, type RoomScene } from "../src/interior.ts";
import type { Shell } from "../src/schedule.ts";
import type { Placement } from "../src/net.ts";

const q = new URLSearchParams(location.search);
const S = +(q.get("scale") ?? 3);
const cv = document.getElementById("c") as HTMLCanvasElement;
const ctx = cv.getContext("2d")!;
const knob = (id: string, v: number) => {
  const el = document.getElementById(id) as HTMLInputElement;
  el.value = String(v);
  return el;
};
const hourK = knob("hour", +(q.get("hour") ?? 11));
const wK = knob("w", +(q.get("w") ?? 10));
const hK = knob("h", +(q.get("h") ?? 7));

function shell(): Shell {
  const w = +wK.value, h = +hK.value;
  const windows = (q.get("windows") ?? `n${Math.floor(w / 4)},n${Math.floor((w * 3) / 4)},e${Math.floor(h / 2)},w1`)
    .split(",").filter(Boolean).map((s) => ({ side: s[0] as Shell["door"], at: Number(s.slice(1)) }));
  return {
    x: 2, y: 2, w, h, material: q.get("material") ?? "timber", paint: q.get("paint") ?? "#8e6644",
    door: (q.get("door") ?? "s") as Shell["door"], windows, sign: "Commons Karate", sign_ok: true,
  };
}

/** A dojo, laid out against whatever size the room is; what doesn't fit is left out. */
function layout(s: Shell): { things: Placement[]; held: Placement[] } {
  if (q.get("bare")) return { things: [], held: [] };
  const r = roomSize(s);
  let id = 0;
  const thing = (prop: string, x: number, y: number): Placement => ({ id: ++id, filing: 1, prop, x, y, room: "in", parent: null });
  const things = [
    thing("rack", 1, 1), thing("board", 8, 1), thing("clock", r.w - 3, 1), thing("shelf", r.w - 9, 2),
    thing("mat", Math.floor(r.w / 2) - 3, 8), thing("cabinet", 1, 6), thing("bag", r.w - 4, 6),
    thing("lamp", r.w - 3, r.h - 4), thing("table", 1, r.h - 3), thing("stool", 7, r.h - 2), thing("rug", r.w - 9, r.h - 3),
  ].filter((p) => canStand(r, p));
  const on = (holder: string, prop: string, slots: number[]) => {
    const h = things.find((t) => t.prop === holder);
    return h ? slots.map((x) => ({ id: ++id, filing: 1, prop, x, y: 0, room: "in" as const, parent: h.id })) : [];
  };
  const held = [
    ...on("rack", "sword", [0, 1, 3]), ...on("board", "belt", [0, 1, 2, 3]), ...on("cabinet", "trophy", [0, 3]),
    ...on("shelf", "book", [0, 1]), ...on("shelf", "plant", [3]), ...on("table", "mug", [1]),
  ];
  return { things, held };
}

let hover: { x: number; y: number } | null = null;
function frame(now: number) {
  const s = shell();
  const art = roomArt(roomSize(s));
  if (cv.width !== art.w * S || cv.height !== art.h * S) {
    cv.width = art.w * S;
    cv.height = art.h * S;
  }
  document.getElementById("hour-v")!.textContent = hourK.value;
  const scene: RoomScene = { shell: s, ...layout(s), ghost: null, hover: null, door: false, hour: +hourK.value };
  if (hover) {
    const p = thingAt(scene, hover.x, hover.y);
    if (p) scene.hover = { p, colour: "#fff8e0" };
    const slot = !p && slotAt(scene, hover.x, hover.y);
    if (slot) scene.ghost = { id: 0, filing: 1, prop: "trophy", x: slot.slot, y: 0, room: "in", parent: slot.holder.id };
    scene.door = onDoor(s, hover.x, hover.y);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(S, 0, 0, S, 0, 0);
  drawRoom(ctx, scene, now);
  requestAnimationFrame(frame);
}
cv.addEventListener("pointermove", (e) => {
  const r = cv.getBoundingClientRect();
  hover = { x: (e.clientX - r.left) / S, y: (e.clientY - r.top) / S };
});
cv.addEventListener("pointerleave", () => void (hover = null));
requestAnimationFrame(frame);
