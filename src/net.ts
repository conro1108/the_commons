import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { db: { schema: "the_commons" } },
);

export type Status = "pending" | "approved" | "conditional" | "committee" | "denied" | "lost";

export interface Filing {
  id: number;
  filer: string;
  plot_x: number;
  plot_y: number;
  intent: string;
  status: Status;
  condition: string | null;
  bylaw: number | null;
  permit: string | null;
  filed_at: string;
  stamped_at: string | null;
}

/** Statuses that hold a plot; denied and lost give it back. */
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

/** File a claim; returns a clerk's explanation if the in-tray says no. */
export async function fileClaim(x: number, y: number, intent: string): Promise<string | null> {
  const { error } = await supabase.from("filings").insert({ plot_x: x, plot_y: y, intent });
  if (!error) return null;
  if (error.message.includes("filings_plot_held")) return "Another filing for this plot is already in Gary's in-tray.";
  if (error.message.includes("filings_one_plot_each")) return "Residents may hold one plot. You hold one.";
  if (error.code === "42501") return "Gary has processed three of your filings today. The in-tray reopens tomorrow.";
  if (error.code === "23514") return "Filings must be between 3 and 120 characters.";
  return error.message;
}

export interface Placement {
  id: number;
  filing: number;
  x: number;
  y: number;
  prop: string;
}

export async function loadPlacements(): Promise<Placement[]> {
  const all: Placement[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("placements").select("id, filing, x, y, prop").order("id").range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) return all;
  }
}

export async function place(filing: number, x: number, y: number, prop: string): Promise<Placement | string> {
  const { data, error } = await supabase.from("placements").insert({ filing, x, y, prop }).select("id, filing, x, y, prop").single();
  if (!error) return data;
  if (error.code === "23505") return "Something is already standing exactly there.";
  return error.message;
}

export async function unplace(id: number): Promise<boolean> {
  const { error } = await supabase.from("placements").delete().eq("id", id);
  return !error;
}
