// Writes the plots block in db/logic.sql from src/world/plots.json: run by
// `npm run world`, checked by test/gary.test.ts.

import { readFileSync, writeFileSync } from "node:fs";
import world from "../src/world/plots.json" with { type: "json" };
import type { World } from "../src/world/types.ts";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function plotsBlock(w: World): string {
  const rows = w.plots.map((p) => `  (${p.id}, ${q(p.name)}, ${q(p.region)}, ${p.w}, ${p.h}, ${q(p.mask)})`);
  return `-- <plots>\ninsert into the_commons.plots (id, name, region, w, h, mask) values\n${rows.join(",\n")}\non conflict (id) do update set name = excluded.name, region = excluded.region, w = excluded.w, h = excluded.h, mask = excluded.mask;\n-- </plots>`;
}

export const SCHEMA = new URL("../db/logic.sql", import.meta.url);
export const withPlots = (sql: string, w: World) => sql.replace(/-- <plots>[\s\S]*?-- <\/plots>/, plotsBlock(w));

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(SCHEMA, withPlots(readFileSync(SCHEMA, "utf8"), world as World));
  console.log(`logic.sql: ${(world as World).plots.length} plots`);
}
