#!/usr/bin/env node
// Apply a .sql file to the shared Supabase project.
//
// Talks to the Management API rather than Postgres directly, which is why there
// is no CLI to install, no driver dependency, and no database password on this
// machine. The access token in ~/projects/.supabase.env (or, in CI, the
// environment) is the only secret.
//
//   node db/push.mjs db/logic.sql
//
// Canonical copy lives in ~/projects/supabase/. Projects keep their own copy so
// each repo stays self-contained; if you fix a bug here, fix it there too.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENV_FILE = join(homedir(), "projects", ".supabase.env");

function loadEnv() {
  let raw;
  try {
    raw = readFileSync(ENV_FILE, "utf8");
  } catch {
    // CI has no ~/projects; it passes the same two vars as repo secrets.
    if (process.env.SUPABASE_ACCESS_TOKEN) return process.env;
    die(`missing ${ENV_FILE} — see the Shared Supabase section of ~/projects/CLAUDE.md`);
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function die(message) {
  console.error(`db:push — ${message}`);
  process.exit(1);
}

const file = process.argv[2] ?? "db/logic.sql";
const sql = readFileSync(file, "utf8");
const env = loadEnv();
const ref = env.SUPABASE_PROJECT_REF;
const token = env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) die("SUPABASE_PROJECT_REF or SUPABASE_ACCESS_TOKEN not set");

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});

const body = await res.text();
if (!res.ok) {
  // The API reports the failing statement, which is the only part worth reading.
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    detail = parsed.message ?? parsed.error ?? body;
  } catch {}
  die(`${res.status}\n${detail}`);
}

console.log(`db:push — applied ${file}`);
