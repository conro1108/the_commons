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
  };
  fittings: Fitting[];
  use: string; // what the place is for, as the spirit reads it: "a karate studio"
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

/** Whether a placed thing is on the schedule: the same key, or for a written-in item, the same name. */
export function scheduled(s: Schedule | null, p: { prop: string; label?: string | null; room?: Where }): boolean {
  if (!s) return true; // granted before schedules: nothing to hold it to
  const where = p.room ?? "out";
  const name = p.label?.trim().toLowerCase();
  return s.fittings.some((f) =>
    f.where === where && (p.prop === "item" ? f.key === "item" && f.name.trim().toLowerCase() === name : f.key === p.prop));
}

/** What a place is for, as the spirit reads it: the schedule's use, or for a filing from before schedules, its intent. */
export const useOf = (f: { schedule: Schedule | null; intent: string }): string => f.schedule?.use || f.intent;
