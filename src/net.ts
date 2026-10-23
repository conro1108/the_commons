import { createClient, type PostgrestError } from "@supabase/supabase-js";
import type { PropDef } from "./content/canon/props.ts";
import { parseAvatar, type Avatar } from "./avatar.ts";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { db: { schema: "the_commons" } },
);

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
}

/** Statuses that hold a plot; denied, refused and lost give it back. */
export const HELD: Status[] = ["pending", "approved", "conditional", "committee"];

export async function signIn(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error || !signed.user) throw error ?? new Error("no user");
  return signed.user.id;
}

/** Whether these papers are only pencilled in: an anonymous session, gone with the browser. */
export async function pencilled(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  return data.user?.is_anonymous ?? true;
}

const back = () => ({ redirectTo: location.origin + location.pathname });

/**
 * Keep these papers: put a Google account on the anonymous user we already
 * are, so the same id, plots and profile survive a cleared browser. Leaves the
 * page for Google and comes back.
 */
export async function keepPapers(): Promise<string | null> {
  const { error } = await supabase.auth.linkIdentity({ provider: "google", options: back() });
  return error && error.message;
}

/** Sign in as a resident from another browser: whoever that Google account already is. */
export async function signInWithGoogle(): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: back() });
  return error && error.message;
}

/**
 * Back from Google with an account that's already somebody's: linking can't
 * merge two residents, so become that one instead. True if we're off again.
 */
export async function afterGoogle(): Promise<boolean> {
  const query = new URLSearchParams(location.search + "&" + location.hash.slice(1));
  if (query.get("error_code") !== "identity_already_exists") return false;
  history.replaceState(null, "", location.pathname);
  return !(await signInWithGoogle());
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

export interface Appeal {
  id: number;
  filing: number;
  n: number; // 1 to APPEALS
  plea: string;
  heard_at: string | null;
  allowed: boolean | null;
  bylaw: number | null; // dismissed: what the denial still stands under
  reply: string | null;
}

/** A denied filing gets this many goes at making its case. The database counts too. */
export const APPEALS = 3;

const APPEAL_COLUMNS = "id, filing, n, plea, heard_at, allowed, bylaw, reply";

export async function loadAppeals(): Promise<Appeal[]> {
  const { data, error } = await supabase.from("appeals").select(APPEAL_COLUMNS).order("id");
  if (error) throw error;
  return data;
}

/** Write back to Gary about a denial; the appeal, or a clerk's explanation if it can't be heard. */
export async function fileAppeal(filing: number, plea: string): Promise<Appeal | string> {
  const { data, error } = await supabase.from("appeals").insert({ filing, plea }).select(APPEAL_COLUMNS).single();
  if (!error) return data;
  if (error.code === "23514") return "An appeal must be between 3 and 280 characters.";
  if (error.code === "42501" || error.code === "23505") return "Gary can't hear an appeal on this filing just now.";
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

const COLUMNS = "id, filing, x, y, prop, size, label, label_ok, sprite";

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
