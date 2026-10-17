import { createClient, type PostgrestError } from "@supabase/supabase-js";
import type { PropDef } from "./content/canon/props.ts";

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
  plot_x: number;
  plot_y: number;
  intent: string;
  status: Status;
  condition: string | null;
  wants: string | null;
  bylaw: number | null;
  permit: string | null;
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

export async function loadFilings(): Promise<Filing[]> {
  const { data, error } = await supabase.from("filings").select("*").order("id", { ascending: false }).limit(500);
  if (error) throw error;
  return data;
}

const handles = new Map<string, string>();

/** Handles from app.profiles, the shared core every toy reads names from. */
export async function handlesFor(ids: string[]): Promise<Map<string, string>> {
  const missing = [...new Set(ids)].filter((id) => !handles.has(id));
  if (missing.length) {
    const { data } = await supabase.schema("app").from("profiles").select("id, handle").in("id", missing);
    for (const p of data ?? []) handles.set(p.id, p.handle);
  }
  return handles;
}

/** Look a handle up again, after word that it changed. */
export async function rehandle(id: string) {
  handles.delete(id);
  return handlesFor([id]);
}

/** Put a name on file: the handle every toy shows for you. */
export async function rename(id: string, name: string): Promise<string | null> {
  const { error } = await supabase.schema("app").from("profiles").update({ handle: name, display_name: name }).eq("id", id);
  if (!error) {
    handles.set(id, name);
    return null;
  }
  if (error.code === "23505") return "That name is already on file for someone else.";
  return said(error);
}

/** File a claim; returns a clerk's explanation if the in-tray says no. */
export async function fileClaim(x: number, y: number, intent: string): Promise<string | null> {
  const { error } = await supabase.from("filings").insert({ plot_x: x, plot_y: y, intent });
  if (!error) return null;
  if (error.message.includes("filings_plot_held")) return "Another filing for this plot is already in Gary's in-tray.";
  if (error.code === "23514") return "Filings must be between 3 and 120 characters.";
  return said(error);
}

export interface Placement {
  id: number;
  filing: number;
  x: number;
  y: number;
  prop: string;
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

const COLUMNS = "id, filing, x, y, prop, label, label_ok, sprite";

export async function place(filing: number, x: number, y: number, prop: string, label?: string): Promise<Placement | string> {
  const { data, error } = await supabase.from("placements").insert({ filing, x, y, prop, label }).select(COLUMNS).single();
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

export async function move(id: number, x: number, y: number): Promise<string | null> {
  const { error } = await supabase.from("placements").update({ x, y }).eq("id", id);
  if (!error) return null;
  if (error.code === "23505") return "Something is already standing exactly there.";
  return said(error);
}

export async function paint(filing: number, ground: string): Promise<string | null> {
  const { error } = await supabase.from("filings").update({ ground }).eq("id", filing);
  return error && said(error);
}
