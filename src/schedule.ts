// What a permit lets you build, and what's been built under it: the schedule
// Gary writes when he grants a filing, and the shell the holder puts up. Shared
// by the client and api/gary.ts, so nothing here touches the DOM.
// See plans/building-and-enforcement.md for the design.

/** Where a thing goes: outdoors on the plot, or inside the shell's room. */
export type Where = "out" | "in";

/** How a fitting got onto the schedule. */
export type How =
  | "granted" // with the permit
  | "variation" // filed for, and granted
  | "ancillary" // explained to Gary on his rounds, and let stand
  | "lawful" // unflagged for a week: a Certificate of Lawfulness
  | "historic"; // kept through a change of use

export interface Fitting {
  name: string; // as Gary wrote it: "a rack of practice swords"
  key: string; // a library piece (src/content/fittings.ts or a prop), or "item" for one Gary drew
  where: Where;
  how: How;
  at: string; // when it joined the schedule
}

export interface Schedule {
  shell: {
    kind: "building" | "enclosure" | "none";
    words: string; // "a hall, timber, one room"
    material: string | null; // a shell material key, for a building or enclosure
    rooms?: number; // how many rooms inside; one unless a variation added more
    larger?: boolean; // an interior larger than the exterior, granted by variation
  };
  fittings: Fitting[];
  use: string; // what the place is for, as the spirit reads it: "a karate studio"
  stored?: Fitting[]; // put away on a change of use: off the schedule, and their things in storage
}

/** The shell as the holder has put it up, in build cells of the plot's box. */
export interface Shell {
  x: number;
  y: number;
  w: number;
  h: number;
  material: string;
  paint: string; // a palette colour
  door: "n" | "e" | "s" | "w";
  windows: { side: "n" | "e" | "s" | "w"; at: number }[]; // at: cells along that side
  sign: string | null;
  sign_ok: boolean | null; // Gary's read of the sign: null while he hasn't
}

/** Where a placement can be: on the plot, inside, or in storage (put away on a change of use; x is a slot). */
export type Room = Where | "store";

/** A thing's name as compared: lower case, one space, no leading article ("A Vending  machine" is "vending machine"). */
export const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/^(a|an|the|some)\s+/, "");

/** Whether a placed thing is this fitting: the same key, or for a written-in item, the same name. Where it is aside. */
export const isFitting = (f: Fitting, p: { prop: string; label?: string | null }) =>
  p.prop === "item" ? f.key === "item" && norm(f.name) === norm(p.label ?? "") : f.key === p.prop;

/** Whether a placed thing is on the schedule: the same key, or for a written-in item, the same name. */
export function scheduled(s: Schedule | null, p: { prop: string; label?: string | null; room?: Room }): boolean {
  if (!s) return true; // granted before schedules: nothing to hold it to
  const where = p.room ?? "out";
  if (where === "store") return true; // in storage: not on the plot at all
  return s.fittings.some((f) => f.where === where && isFitting(f, p));
}

// --- changing a schedule (slice C): variations and changes of use, applied by api/gary.ts ---

/** What a granted variation adds: a fitting, a room, or an interior larger than the exterior. */
export type Addition =
  | { kind: "fitting"; name: string; key: string; where: Where }
  | { kind: "room"; name: string } // "a second room", "an extension", "a sauna" as a room of its own
  | { kind: "larger"; name: string };

const same = (f: Fitting, g: Fitting) => g.where === f.where && g.key === f.key && (f.key !== "item" || norm(g.name) === norm(f.name));

/** A schedule with a granted variation added (how: 'variation', or D's 'ancillary'/'lawful'). Nothing already on it is added twice. */
export function vary(s: Schedule, a: Addition, at: string, how: How = "variation"): Schedule {
  if (a.kind === "room") return { ...s, shell: { ...s.shell, rooms: (s.shell.rooms ?? 1) + 1, words: `${s.shell.words}; and ${a.name}` } };
  if (a.kind === "larger") return { ...s, shell: { ...s.shell, larger: true, words: `${s.shell.words}; larger inside than out` } };
  const f: Fitting = { name: a.name, key: a.key, where: a.where, how, at };
  return s.fittings.some((g) => same(f, g)) ? s : { ...s, fittings: [...s.fittings, f] };
}

/** What becomes of a fitting on a change of use: still fits, kept on as historic, or put in storage. */
export type Fate = "keep" | "historic" | "store";

/** A change of use: the old shell kept, the new use's fittings in, and each old fitting (by index) kept, kept as historic, or
 *  stored. One the new schedule already has is kept once, as granted under the new use. */
export function changeUse(old: Schedule, fresh: Schedule, fates: Fate[]): Schedule {
  const fate = (i: number) => fates[i] ?? "historic";
  const left = old.fittings.map((f, i) => ({ f, fate: fate(i) })).filter(({ f }) => !fresh.fittings.some((g) => same(f, g)));
  const stored = left.filter((x) => x.fate === "store").map((x) => x.f);
  return {
    shell: old.shell,
    use: fresh.use,
    fittings: [...fresh.fittings, ...left.filter((x) => x.fate !== "store").map((x) => (x.fate === "historic" ? { ...x.f, how: "historic" as const } : x.f))],
    ...((old.stored?.length || stored.length) ? { stored: [...(old.stored ?? []), ...stored] } : {}),
  };
}

/** What a place is for, as the spirit reads it: the schedule's use, or for a filing from before schedules, its intent. */
export const useOf = (f: { schedule: Schedule | null; intent: string }): string => f.schedule?.use || f.intent;
