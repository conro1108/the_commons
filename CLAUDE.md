# CLAUDE.md

The Commons: a shared multiplayer patch of land, administered with enormous
seriousness by Gary. See `PLAN.md`.

Vite + TypeScript + canvas, no framework. Vercel Functions in `api/`, Supabase
schema `the_commons`. `npm run dev` / `npm test` / `npm run build` /
`npm run db:push` / `npm run world` (rebake the map) / `npm run runs` (back
office runs).

## Map

Most files open with a comment saying what they own; read it before grepping.

| Want to change… | File |
|---|---|
| Boot, input, views, the corner tag, cards, toolbar, building, realtime | `src/main.ts` (sections marked `// ---`) |
| Drawing the map: plots, walkers, letters, Gary | `src/render.ts` |
| A plot up close, and its miniature on the map | `src/closeup.ts` |
| Every Supabase call: sign-in, filings, appeals, placements, profiles | `src/net.ts` |
| The gate and Form R-1 (look and name) | `src/papers.ts`; avatars `src/avatar.ts`, people `src/content/people.ts` |
| Gary's rounds, the goose, ducks, bees | `src/life.ts` |
| Time-of-day light | `src/light.ts` |
| Props, ground paint, plot features, colours | `src/content/{props,ground,features,palette}.ts` |
| Map art: ground, scenery, Gary's hut and the board | `src/map/` |
| The baked world and questions about it; regions | `src/world/` (baked by `scripts/world/`) |
| Bylaws as shown to players | `src/rulebook.ts` (mirrors `api/gary.ts`) |
| Gary's rulings, permits, inspections, audits, appeals, committee, drawings | `api/gary.ts` |
| Logging in by name | `api/door.ts` |
| The back office (hold the notice board 3s) | `src/backoffice.ts`, `api/backoffice.ts` |
| Tables | `db/tables.sql` |
| Policies, triggers, queue, cron, the plots' rows | `db/logic.sql` |
| Look at the map or a plot with no network | `dev/*.html` |

## Rules

- The commons' data is kept: no `drop schema`. `db/tables.sql` is never rerun;
  change a table with a hand-run `alter table` and fold it back in.
  `db/logic.sql` is rerun in full by CI, so keep it safe to run twice.
- AI results are stored, never regenerated: everyone sees the same commons.
- Art borrowed from cozy_sprites is copied into `src/content/canon/`, not
  imported; Vercel only has this repo.
- Never draw sprite art with non-integer `ctx.scale()`/`ctx.rotate()`: it smears.
