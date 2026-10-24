#!/usr/bin/env node
// What the back office has been doing, as JSON: every run of the latest session
// (one case, filing to last appeal), or one run by the number it shows.
//
//   npm run runs            # the latest session
//   npm run runs -- 41      # run 41
//
// Reads through the Management API, like db/push.mjs, with the same token.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const env = Object.fromEntries(
  readFileSync(join(homedir(), "projects", ".supabase.env"), "utf8")
    .split("\n")
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);

const id = Number(process.argv[2]);
const where = Number.isInteger(id) && id > 0
  ? `id = ${id}`
  : `session = (select session from the_commons.backoffice_runs order by id desc limit 1)`;
const query = `select coalesce(jsonb_agg(r order by r.id), '[]') as runs from the_commons.backoffice_runs r where ${where}`;

const res = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
if (!res.ok) {
  console.error(`runs — ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(JSON.stringify((await res.json())[0].runs, null, 2));
