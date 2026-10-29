// src/net.ts with no network, for looking at the real app offline:
// `FAKE=1 npm run dev`, then /?at=12 to stand up close to your own plot
// (vite.config.ts swaps this in). Everything lives in memory and is forgotten
// on reload. Knobs, read once at load:
//   ?shell=0     no building up yet          ?kind=enclosure  a pen, not a building
//   ?theirs=1    the plot is someone else's  ?bare=1          nothing placed on it
//   ?in=1        and step inside (with ?at)
//   ?appeal=gary or committee   a denial of yours on plot 7, its appeal not yet heard; ?appeal=heard, allowed by the committee in the end

import type { PropDef } from "../src/content/canon/props.ts";
import type { Avatar } from "../src/avatar.ts";
import type { Schedule, Shell, Where } from "../src/schedule.ts";
import type { Tag } from "../src/letter.ts";
import type { Filing, Appeal, Placement, Variation, Notice, Visit, Status } from "../src/net.ts";

export type { Filing, Appeal, Placement, Variation, Notice, Visit, Status };

const q = new URLSearchParams(location.search);
const ME = "me-0000-0000";
const THEM = "them-0000-0000";
const PLOT = Number(q.get("at") ?? 12);
const kind = q.get("kind") === "enclosure" ? "enclosure" : "building";

/** A stand-in for the supabase client: realtime that never hears anything, a door that's never locked. */
const channel = {
  on() { return channel; },
  subscribe(cb?: (s: string) => void) { cb?.("SUBSCRIBED"); return channel; },
  track: async () => "ok",
  send: async () => "ok",
  presenceState: () => ({}),
  unsubscribe: async () => "ok",
};
export const supabase = { channel: () => channel, removeChannel: async () => "ok", auth: { signOut: async () => location.reload() } };

const now = new Date().toISOString();
const schedule: Schedule = {
  shell: { kind, words: kind === "building" ? "a hall, timber, one room" : "a pen, picket", material: null },
  fittings: [
    { name: "a punching bag", key: "item", where: "in", how: "granted", at: now },
    { name: "a bench", key: "bench", where: "out", how: "granted", at: now },
  ],
  use: "a karate studio",
};
const shell: Shell = {
  kind, x: 6, y: 3, w: 10, h: 6, material: kind === "building" ? "timber" : "picket", paint: "green",
  door: "s", windows: [{ side: "s", at: 2 }, { side: "s", at: 7 }], sign: "The Dojo", sign_ok: true,
};

const filing = (id: number, filer: string, plot: number, intent: string): Filing => ({
  id, filer, plot, intent, status: "approved", condition: null, wants: null, bylaw: null, permit: "P-0001",
  minutes: null, filed_at: now, stamped_at: now, built_at: null, inspected_at: null, remark: null, met_at: null,
  ground: null, schedule, shell: q.get("shell") === "0" ? null : { ...shell }, open_sign: true,
});
const filings: Filing[] = [filing(1, q.get("theirs") ? THEM : ME, PLOT, "a karate studio"), filing(2, THEM, PLOT === 3 ? 4 : 3, "a quiet bench")];
const court = q.get("appeal") as Appeal["court"] | "heard" | null;
if (court) filings.push({ ...filing(3, ME, 7, "a moat"), status: court === "heard" ? "conditional" : "denied", bylaw: 2, shell: null,
  permit: "Denied under Bylaw 2: a moat keeps neighbours out, however small.", condition: court === "heard" ? "Must have a bridge, always down." : null });

let nextId = 100;
const placements: Placement[] = q.get("bare") ? [] : [
  { id: 1, filing: 1, x: 2, y: 12, prop: "bench" },
  { id: 2, filing: 1, x: 18, y: 11, prop: "tree" },
  { id: 3, filing: 1, x: 12, y: 13, prop: "beehive" },
  { id: 4, filing: 1, x: 3, y: 4, prop: "lamppost" },
  { id: 5, filing: 1, x: 2, y: 2, prop: "chair", room: "in" },
  { id: 6, filing: 1, x: 6, y: 1, prop: "bookcase", room: "in" },
];
const handles = new Map([[ME, "connor"], [THEM, "marguerite"]]);

export const HELD: Status[] = ["pending", "approved", "conditional", "committee"];
export const APPEALS = 2;
export function nextCourt(status: string, made: Appeal[]): Appeal["court"] | null {
  const toGary = made.filter((a) => a.court === "gary").length;
  if (status === "denied" && toGary < APPEALS) return "gary";
  return made.filter((a) => a.court === "committee").length < 2 ? "committee" : null;
}

export const signIn = async () => ME;
export const isGuest = async () => false;
export const keepPapers = async () => null;
export const logIn = async () => null;
export const loadFilings = async () => filings.map((f) => ({ ...f }));
export const handlesFor = async (_ids: string[]) => handles;
export const avatarOf = (_id: string): Avatar | null => null;
export const rehandle = async (_id: string) => handles;
export const saveProfile = async (id: string, name: string, _a: Avatar) => (handles.set(id, name), null);
export const fileClaim = async () => "The fake in-tray is closed.";
const heard = (n: number, court: Appeal["court"], plea: string, reply: string): Appeal =>
  ({ id: n, filing: 3, n, court, plea, heard_at: now, allowed: false, bylaw: 2, reply, minutes: null });
export const loadAppeals = async (): Promise<Appeal[]> =>
  court === "heard" ? [
    heard(1, "gary", "It's a very small moat, more of a puddle really, and the ducks love it.", "Small or not, a moat keeps people out. Bylaw 2 stands."),
    heard(2, "gary", "There's a bridge.", "A bridge you can pull up is still a moat. It stays denied."),
    { ...heard(3, "committee", "Gary is being unreasonable: a moat with a bridge keeps nobody out.", "The committee allows it on condition, 4 to 1: with a bridge that stays down, nobody is kept out."),
      allowed: true, bylaw: null,
      minutes: { outcome: "The committee has met, and the filing is approved on condition, 4 to 1.", finding: "The committee allows it on condition, 4 to 1: with a bridge that stays down, nobody is kept out.",
        members: [{ seat: "Councillor Pike", vote: "conditional", speech: "Bylaw 2 is about keeping people out. A bridge that never lifts keeps nobody out." },
          { seat: "Councillor Fenwick", vote: "b2", speech: "A moat is a moat." }] } },
  ]
  : court ? [{ id: 1, filing: 3, n: 1, court, plea: "It's a very small moat.", heard_at: null, allowed: null, bylaw: null, reply: null, minutes: null }] : [];
export const fileAppeal = async (): Promise<Appeal | string> => "The fake committee isn't sitting.";
export const loadPlacements = async () => placements.map((p) => ({ ...p }));

export async function place(filing: number, x: number, y: number, prop: string, size: number, label?: string): Promise<Placement | string> {
  const p: Placement = { id: nextId++, filing, x, y, prop, size, label: label ?? null, label_ok: label ? true : null, room: "out" };
  placements.push(p);
  return { ...p };
}
export const summonGary = async () => 0;
export async function unplace(id: number) {
  const i = placements.findIndex((p) => p.id === id);
  if (i >= 0) placements.splice(i, 1);
  return true;
}
export async function move(id: number, x: number, y: number, size?: number) {
  const p = placements.find((p) => p.id === id);
  if (p) Object.assign(p, { x, y }, size === undefined ? {} : { size });
  return null;
}
export const paint = async (_f: number, _g: string) => null;
export const loadVariations = async (): Promise<Variation[]> => [];
export const fileVariation = async (_f: number, _w: string, _r: Where | null = null): Promise<Variation | string> => "Not offline.";
export const fileChangeOfUse = async (_f: number, _u: string): Promise<Variation | string> => "Not offline.";
export const loadPieces = async (_n: string[]) => new Map<string, PropDef>();
export const loadTags = async (): Promise<Tag[]> => [];
export const answerTag = async () => null;
export const reclaim = async (): Promise<boolean | string> => true;
export const summonRounds = async () => 0;
export const summonCommittee = async () => 0;
export const fileRetrospective = async (_t: Tag): Promise<Variation | string> => "Not offline.";
export const loadSpirit = async (_f: number): Promise<{ notices: Notice[]; visits: Visit[] }> => ({
  notices: [{ id: 1, filing: 1, line: "Beginners' class, Tuesdays", posted_at: now, ok: true }],
  visits: [{ id: 1, filing: 1, visitor: THEM, line: "Very calm in here.", day: now.slice(0, 10), at: now, ok: true }],
});
export const flipSign = async () => null;
export const pinNotice = async (filing: number, line: string): Promise<Notice | string> => ({ id: nextId++, filing, line, posted_at: now, ok: true });
export const unpinNotice = async () => true;
export const signBook = async (filing: number, line: string): Promise<Visit | string> => ({ id: nextId++, filing, visitor: ME, line, day: now, at: now, ok: true });
export const summonReader = async () => 0;
export const askForPlot = async () => null;

export async function placeInside(filing: number, x: number, y: number, prop: string, holder: Placement | null): Promise<Placement | string> {
  const p: Placement = { id: nextId++, filing, x, y: holder ? 0 : y, prop, size: 1, room: holder?.room ?? "in", parent: holder?.id ?? null };
  placements.push(p);
  return { ...p };
}
export async function moveInside(id: number, x: number, y: number, parent: number | null) {
  const p = placements.find((p) => p.id === id);
  if (p) Object.assign(p, { x, y, parent });
  return null;
}
export async function saveShell(id: number, s: Shell | null) {
  const f = filings.find((f) => f.id === id);
  if (f) f.shell = s;
  return null;
}

// Everything src/net.ts exports, or the app won't load offline: tsc names whatever's missing.
type Missing = Exclude<keyof typeof import("../src/net.ts"), keyof typeof import("./fakenet.ts")>;
export const complete: [Missing] extends [never] ? true : Missing = true;
