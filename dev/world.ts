// A look at the baked world: ?scale=4, ?overlay=1 for plots, gates, doors,
// features and the path graph, ?route=x,y,x,y to walk one. No network.

import { MAP_W, MAP_H, terrainAt, regionAt, heightAt } from "../src/world/index.ts";
import * as C from "../src/content/palette.ts";

const q = new URLSearchParams(location.search);
const S = +(q.get("scale") ?? 4);
const cv = document.getElementById("c") as HTMLCanvasElement;
cv.width = MAP_W * S;
cv.height = MAP_H * S;
const ctx = cv.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

const hash = (x: number, y: number, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const pick = (r: readonly string[], i: number) => r[Math.max(0, Math.min(r.length - 1, i))];

function ground(x: number, y: number): string {
  const t = terrainAt(x, y), reg = regionAt(x, y), n = hash(x, y);
  const grass = C.GRASS[reg];
  const lit = heightAt(x, y);
  switch (t) {
    case "grass": {
      if (terrainAt(x, y + 1) === "cliff" && heightAt(x, y + 1) < lit) return pick(C.CLIFF.lip, 1 + (n > 0.6 ? 1 : 0));
      if (reg === "green") return pick(grass, 2 + ((x + y) >> 3) % 2);
      if (reg === "knoll" && n > 0.93) return pick(C.HEATHER, 1 + (n > 0.97 ? 1 : 0));
      if (reg === "shaw" && n > 0.85) return pick(C.LITTER, 3);
      if (reg === "bank" && n > 0.8) return pick(C.SAND, 2);
      return pick(grass, 2 + (n > 0.75 ? 1 : n < 0.15 ? -1 : 0));
    }
    case "path": return pick(C.PATH, 2 + (n > 0.7 ? 1 : n < 0.1 ? -1 : 0));
    case "steps": return pick(C.STONE, 2 + (y % 2));
    case "bridge": return pick(C.PLANK, 2 + (x % 3 === 0 ? 1 : 0));
    case "stones": return pick(C.STONE, 3);
    case "water": return pick(C.WATER, 1 + (n > 0.995 ? 4 : 0));
    case "shallows": return pick(C.WATER, 3);
    case "reeds": return pick(C.REEDS, 1 + Math.floor(n * 3));
    case "wood": return pick(C.FOLIAGE, 1 + Math.floor(n * 2.2));
    case "cliff": {
      const above = heightAt(x, y - 1) > lit || heightAt(x, y - 2) > lit;
      return pick(C.CLIFF.face, above ? (heightAt(x, y - 1) > lit ? 2 : 1) : 0);
    }
    case "rock": return pick(C.STONE, 2 + (n > 0.5 ? 1 : 0));
    case "hedge": return pick(C.FOLIAGE, 2 + (n > 0.6 ? 1 : 0));
    case "field": return pick(C.FIELD, 1 + ((x >> 5) % 3 === 0 ? 1 : 0));
  }
}

const off = new OffscreenCanvas(MAP_W, MAP_H);
const octx = off.getContext("2d")!;
for (let y = 0; y < MAP_H; y++)
  for (let x = 0; x < MAP_W; x++) {
    octx.fillStyle = ground(x, y);
    octx.fillRect(x, y, 1, 1);
  }
ctx.drawImage(off, 0, 0, MAP_W * S, MAP_H * S);

if (q.get("grid")) {
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "10px monospace";
  for (let x = 0; x < MAP_W; x += 10) for (let y = 0; y < MAP_H; y += 10) {
    ctx.fillRect(x * S, y * S, 2, 2);
    if (x % 40 === 0 && y % 40 === 0) ctx.fillText(`${x},${y}`, x * S + 3, y * S + 10);
  }
}

if (q.get("overlay")) {
  const { PLOTS } = await import("../src/world/index.ts");
  for (const p of PLOTS) {
    const hue = (p.id * 47) % 360;
    ctx.fillStyle = `hsla(${hue} 80% 60% / 0.45)`;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.mask[y * p.w + x] === "#") ctx.fillRect((p.x + x) * S, (p.y + y) * S, S, S);
    ctx.fillStyle = "#402e3a";
    for (const f of p.features) ctx.fillRect((p.x + f.x) * S, (p.y + f.y) * S, f.w * S, f.h * S);
    ctx.fillStyle = "#fff";
    ctx.fillRect((p.x + p.door.x) * S, (p.y + p.door.y) * S, S, S);
    ctx.fillStyle = "#f00";
    ctx.fillRect(p.gate.x * S, p.gate.y * S, S, S);
    ctx.font = "bold 13px monospace";
    ctx.fillStyle = "#000";
    ctx.fillText(String(p.id), (p.x + p.w / 2) * S - 6, (p.y + p.h / 2) * S + 4);
  }
}
