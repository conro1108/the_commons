// A resident's look, as kept in app.profiles.avatar (the shared core, so any
// toy in the Meadow's world can read it): { meadow: "dog" } for one of the
// Meadow's creatures, or { human: HumanSpec } for a person made up from parts.
// Drawn at 1:1 map pixels, like Gary: creatures hop, people stride.

import type { PropDef } from "./content/canon/props.ts";
import { CREATURES, MOLE } from "./content/canon/creatures.ts";
import { humanSprite, randomHuman, validHuman, type HumanSpec } from "./content/people.ts";

export type Avatar = { meadow: string } | { human: HumanSpec };

/** An avatar from untrusted json, or null if it isn't one. */
export function parseAvatar(x: unknown): Avatar | null {
  if (!x || typeof x !== "object") return null;
  const a = x as Record<string, unknown>;
  if (typeof a.meadow === "string" && CREATURES[a.meadow]) return { meadow: a.meadow };
  const human = validHuman(a.human);
  return human ? { human } : null;
}

const strangers = new Map<string, Avatar>();

/** Someone who hasn't chosen yet: a person, the same one on every screen. */
export function stranger(id: string): Avatar {
  let found = strangers.get(id);
  if (!found) {
    let n = parseInt(id.replace(/-/g, "").slice(0, 8), 16) | 0;
    const rand = () => {
      n = (n + 0x6d2b79f5) | 0;
      let t = Math.imul(n ^ (n >>> 15), 1 | n);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    strangers.set(id, (found = { human: randomHuman(rand) }));
  }
  return found;
}

export const spriteOf = (a: Avatar, step: 0 | 1 = 0): PropDef =>
  "meadow" in a ? (a.meadow === "mole" ? MOLE : CREATURES[a.meadow]) : humanSprite(a.human, step);

/** As in the Meadow: anyone named Connor is a mole, whatever they picked. */
export const looksLike = (name: string | undefined, chosen: Avatar | null, id: string): Avatar =>
  name?.trim().toLowerCase() === "connor" ? { meadow: "mole" } : (chosen ?? stranger(id));

export const widthOf = (s: PropDef) => Math.max(...s.rows.map((r) => r.length));

export function blit(ctx: CanvasRenderingContext2D, s: PropDef, left: number, top: number, flip = false, scale = 1) {
  const w = widthOf(s);
  s.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const colour = s.palette[ch];
      if (!colour) return;
      ctx.fillStyle = colour;
      ctx.fillRect(left + (flip ? w - 1 - x : x) * scale, top + y * scale, scale, scale);
    }),
  );
}

/** Draw with feet at (x, y); returns the top of the head. */
export function drawAvatar(ctx: CanvasRenderingContext2D, a: Avatar, x: number, y: number, moving: boolean, t: number, flip: boolean) {
  const stride = moving ? ((Math.floor(t / 220) % 2) as 0 | 1) : 0;
  const creature = "meadow" in a;
  const s = spriteOf(a, creature ? 0 : stride);
  const top = Math.round(y) - s.rows.length - (creature ? stride : 0);
  blit(ctx, s, Math.round(x) - Math.floor(widthOf(s) / 2), top, flip);
  return top;
}

/** A crisp, enlarged portrait for the papers, bottom-centred in a fixed box. */
export function portrait(canvas: HTMLCanvasElement, a: Avatar, scale: number, step: 0 | 1 = 0, flip = false) {
  const s = spriteOf(a, step);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const left = Math.floor((canvas.width / scale - widthOf(s)) / 2) * scale;
  blit(ctx, s, left, canvas.height - s.rows.length * scale, flip, scale);
}
