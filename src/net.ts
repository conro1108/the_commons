import { createClient, isAuthRetryableFetchError, type PostgrestError } from "@supabase/supabase-js";
import type { PropDef } from "./content/canon/props.ts";
import { parseAvatar, type Avatar } from "./avatar.ts";
import type { Room, Schedule, Shell, Where } from "./schedule.ts";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { db: { schema: "the_commons" }, global: { fetch: refreshing } },
);

/**
 * The database refuses papers it thinks have expired, though this device
 * thinks they're fine (a slow clock, a phone that slept through the refresh).
 * Get fresh ones and ask again, once.
 */
async function refreshing(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  const url = input instanceof Request ? input.url : String(input);
  if (res.status !== 401 || !url.includes("/rest/v1/")) return res;
  const { data } = await supabase.auth.refreshSession();
  if (!data.session) return res;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}

// A session that can't be refreshed (a tab left asleep too long) is dropped,
// and every write after it would be refused. Start over as someone new instead.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") location.reload();
});

/** A write's error, in words; "permission denied" means the session lapsed. */
const said = (error: PostgrestError) =>
  error.code === "42501" ? "Gary can't find your papers. Reload the page and he'll issue new ones." : error.message;

export type Status = "pending" | "approved" | "conditional" | "committee" | "denied" | "refused" | "lost";

export interface Filing {
  id: number;
  filer: string;
  plot: number; // a PlotDef id (src/world)
  intent: string;
  status: Status;
  condition: string | null;
  wants: string | null;
  bylaw: number | null; // 1-7 for BYLAWS; 0 for the covenant of the plot's region
  permit: string | null;
  minutes: { outcome: string; finding: string | null; members: { seat: string; vote: string | null; speech: string | null }[] } | null;
  filed_at: string;
  stamped_at: string | null;
  built_at: string | null;
  inspected_at: string | null;
  remark: string | null;
  met_at: string | null;
  ground: string | null;
  schedule: Schedule | null; // Gary's, once granted; null for filings from before schedules
  shell: Shell | null; // the holder's building, once put up
}

/** Statuses that hold a plot; denied, refused and lost give it back. */
export const HELD: Status[] = ["pending", "approved", "conditional", "committee"];

export async function signIn(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  // Couldn't reach the counter to renew them: they're still ours, so don't start over as someone new.
  if (isAuthRetryableFetchError(error)) throw error;
  if (data.session) {
    // Papers for someone no longer on file still look fine to this browser. Ask the counter.
    const { data: held, error: lost } = await supabase.auth.getUser();
    if (held.user) return held.user.id;
    if (isAuthRetryableFetchError(lost)) throw lost;
    await supabase.auth.signOut({ scope: "local" });
    return new Promise(() => {}); // signing out reloads the page, which starts over
  }
  const { data: signed, error: refused } = await supabase.auth.signInAnonymously();
  if (refused || !signed.user) throw refused ?? new Error("no user");
  return signed.user.id;
}

/** Whether we're only looking round: an anonymous session, with no name to come back by. */
export async function isGuest(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  return data.user?.is_anonymous ?? true;
}

async function door(body: object, token?: string): Promise<{ token?: string; error?: string }> {
  try {
    const res = await fetch("/api/door", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { error: "Gary's door is stuck. Try again in a moment." };
  }
}

/** Papers just filed by a guest: keep them, so the name will let them back in from anywhere. */
export async function keepPapers(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const { error } = await door({ keep: true }, data.session?.access_token);
  if (error) return error;
  await supabase.auth.refreshSession(); // the new papers say we're no longer a guest
  return null;
}

/** Come in as the resident by that name, whoever's browser this is. */
export async function logIn(name: string): Promise<string | null> {
  const { token, error } = await door({ name });
  if (!token) return error ?? "Nobody by that name is on file.";
  const { error: refused } = await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
  return refused && refused.message;
}

export async function loadFilings(): Promise<Filing[]> {
  const { data, error } = await supabase.from("filings").select("*").order("id", { ascending: false }).limit(500);
  if (error) throw error;
  return data;
}

const handles = new Map<string, string>();
const avatars = new Map<string, Avatar | null>();

/** Handles and avatars from app.profiles, the shared core every toy reads names from. */
export async function handlesFor(ids: string[]): Promise<Map<string, string>> {
  const missing = [...new Set(ids)].filter((id) => !handles.has(id));
  if (missing.length) {
    const { data } = await supabase.schema("app").from("profiles").select("id, handle, avatar").in("id", missing);
    for (const p of data ?? []) {
      handles.set(p.id, p.handle);
      avatars.set(p.id, parseAvatar(p.avatar));
    }
  }
  return handles;
}

/** What someone looks like, if they've chosen; ask handlesFor first. */
export const avatarOf = (id: string) => avatars.get(id) ?? null;

/** Look someone up again, after word that their papers changed. */
export async function rehandle(id: string) {
  handles.delete(id);
  return handlesFor([id]);
}

/** Put a name and a look on file: what every toy shows for you. */
export async function saveProfile(id: string, name: string, avatar: Avatar): Promise<string | null> {
  const { error } = await supabase.schema("app").from("profiles").update({ handle: name, display_name: name, avatar }).eq("id", id);
  if (!error) {
    handles.set(id, name);
    avatars.set(id, avatar);
    return null;
  }
  if (error.code === "23505") return "That name is already on file for someone else.";
  return said(error);
}

/** File a claim; returns a clerk's explanation if the in-tray says no. */
export async function fileClaim(plot: number, intent: string): Promise<string | null> {
  const { error } = await supabase.from("filings").insert({ plot, intent });
  if (!error) return null;
  if (error.message.includes("filings_plot_held")) return "Another filing for this plot is already in Gary's in-tray.";
  if (error.code === "23514") return "Filings must be between 3 and 120 characters.";
  return said(error);
}

/** One rung up from a denial: to Gary, or to the committee (see db/tables.sql). */
export interface Appeal {
  id: number;
  filing: number;
  n: number; // 1 to 5, in order up the ladder
  court: "gary" | "committee";
  plea: string | null; // none when Gary's third dismissal sent it up by itself
  heard_at: string | null;
  allowed: boolean | null;
  bylaw: number | null; // dismissed: what the denial still stands under
  reply: string | null; // Gary's, or the committee's finding
  minutes: Filing["minutes"];
}

/** A denied filing gets this many goes at Gary before it goes up to the committee. The database counts too. */
export const APPEALS = 3;

/** Which court would hear the next appeal, as the database's next_appeal() reckons it (bar the plot being free). */
export function nextCourt(status: string, made: Appeal[]): Appeal["court"] | null {
  const toGary = made.filter((a) => a.court === "gary").length;
  const upstairs = made.filter((a) => a.court === "committee").length;
  if (status === "denied" && toGary < APPEALS) return "gary";
  if ((status === "refused" && upstairs === 0) || upstairs === 1) return "committee";
  return null;
}

const APPEAL_COLUMNS = "id, filing, n, court, plea, heard_at, allowed, bylaw, reply, minutes";

export async function loadAppeals(): Promise<Appeal[]> {
  const { data, error } = await supabase.from("appeals").select(APPEAL_COLUMNS).order("id");
  if (error) throw error;
  return data;
}

/** Write back about a denial, to whoever's next to hear it; the appeal, or a clerk's explanation if it can't be heard. */
export async function fileAppeal(filing: number, plea: string): Promise<Appeal | string> {
  const { data, error } = await supabase.from("appeals").insert({ filing, plea }).select(APPEAL_COLUMNS).single();
  if (!error) return data;
  if (error.code === "23514") return "An appeal must be between 3 and 280 characters.";
  if (error.code === "42501" || error.code === "23505" || error.code === "23502") return "This filing can't be appealed just now.";
  return said(error);
}

export interface Placement {
  id: number;
  filing: number;
  x: number;
  y: number;
  prop: string;
  size?: number; // drawn this many times over
  label?: string | null; // a written-in item's name
  label_ok?: boolean | null; // Gary's read of it: null while he hasn't
  sprite?: PropDef | null; // and his drawing of it, once he's done one
  room?: Room; // outdoors on the plot, inside the shell, or in storage (put away on a change of use)
  parent?: number | null; // held in or on another placement; x is the slot
  impounded_at?: string | null; // in the pound at Gary's hut
}

export async function loadPlacements(): Promise<Placement[]> {
  const all: Placement[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("placements").select(COLUMNS).order("id").range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) return all;
  }
}

const COLUMNS = "id, filing, x, y, prop, size, label, label_ok, sprite, room, parent, impounded_at";

export async function place(filing: number, x: number, y: number, prop: string, size: number, label?: string): Promise<Placement | string> {
  const { data, error } = await supabase.from("placements").insert({ filing, x, y, prop, size, label }).select(COLUMNS).single();
  if (!error) return data;
  if (error.code === "23505") return "Something is already standing exactly there.";
  return said(error);
}

/** Send Gary round your plots now. How many he's gone to, or null if he couldn't be reached. */
export async function summonGary(): Promise<number | null> {
  const { data, error } = await supabase.rpc("summon_gary");
  return error ? null : data;
}

export async function unplace(id: number): Promise<boolean> {
  const { error } = await supabase.from("placements").delete().eq("id", id);
  return !error;
}

export async function move(id: number, x: number, y: number, size?: number): Promise<string | null> {
  const { error } = await supabase.from("placements").update({ x, y, size }).eq("id", id);
  if (!error) return null;
  if (error.code === "23505") return "Something is already standing exactly there.";
  return said(error);
}

export async function paint(filing: number, ground: string): Promise<string | null> {
  const { error } = await supabase.from("filings").update({ ground }).eq("id", filing);
  return error && said(error);
}

// --- variations and the pieces Gary drew (slice C) ------------------------------

/** Going back to Gary about a permit: an addition, or a change of use (see db/tables.sql). */
export interface Variation {
  id: number;
  filing: number;
  kind: "addition" | "use";
  what: string;
  room: Where | null;
  retrospective: boolean;
  status: "pending" | "granted" | "committee" | "denied" | "refused";
  scale: "small" | "material" | null;
  condition: string | null;
  reply: string | null;
  minutes: Filing["minutes"];
  filed_at: string;
  heard_at: string | null;
}

const VARIATION_COLUMNS = "id, filing, kind, what, room, retrospective, status, scale, condition, reply, minutes, filed_at, heard_at";

export async function loadVariations(): Promise<Variation[]> {
  const { data, error } = await supabase.from("variations").select(VARIATION_COLUMNS).order("id");
  if (error) throw error;
  return data;
}

async function vary(row: { filing: number; kind: Variation["kind"]; what: string; room?: Where | null }): Promise<Variation | string> {
  const { data, error } = await supabase.from("variations").insert(row).select(VARIATION_COLUMNS).single();
  if (!error) return data;
  if (error.code === "23514") return "A variation must be between 3 and 80 characters.";
  if (error.code === "23505" || error.code === "42501") return "Gary's already got one about this permit in front of him.";
  return said(error);
}

/** File for something new on one's permit ("a vending machine"); room: where it'd go, or null for Gary's call. */
export const fileVariation = (filing: number, what: string, room: Where | null = null) => vary({ filing, kind: "addition", what, room });

/** File for a change of use: the shell stays, the schedule is rewritten. Slice E's drift notice points here. */
export const fileChangeOfUse = (filing: number, use: string) => vary({ filing, kind: "use", what: use });

/** Gary's drawings of scheduled things nothing in the library was close to, by name (norm() in src/schedule.ts). */
export async function loadPieces(names: string[]): Promise<Map<string, PropDef>> {
  const out = new Map<string, PropDef>();
  if (!names.length) return out;
  const { data } = await supabase.from("pieces").select("name, sprite").in("name", names);
  for (const p of data ?? []) if (p.sprite) out.set(p.name, p.sprite);
  return out;
}
