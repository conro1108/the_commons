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
| Props, ground paint, plot features, colours | `src/content/{props,ground,features,palette}.ts`; the build palette's art `src/content/outdoors.ts` |
| Map art: ground, scenery, Gary's hut and the board | `src/map/` |
| The baked world and questions about it; regions | `src/world/` (baked by `scripts/world/`) |
| Bylaws as shown to players | `src/rulebook.ts` (mirrors `api/gary.ts`) |
| Gary's rulings, permits, inspections, audits, appeals, committee, drawings | `api/gary.ts` |
| His rounds against the schedule: questions, red tags, the pound, lawful by time | `src/letter.ts`; the round in `api/gary.ts` ("the letter"), timings `keep_tags()` in `db/logic.sql` |
| Logging in by name | `api/door.ts` |
| The back office (hold the notice board 3s) | `src/backoffice.ts`, `api/backoffice.ts` |
| Tables | `db/tables.sql` |
| Policies, triggers, queue, cron, the plots' rows | `db/logic.sql` |
| Look at the map or a plot with no network | `dev/*.html` |

## Gotchas

- The commons' data is kept, unlike other toys': there's no `drop schema`.
  `db/tables.sql` never reruns, so a table change is a hand-run `alter table`
  folded back in. CI reruns `db/logic.sql` in full on every `db/**` push, so
  it has to survive running twice.
- AI results are stored rather than regenerated, so everyone sees the same
  Gary.
- Vercel only has this repo, so art from cozy_sprites is copied into
  `src/content/canon/`, not imported.
- `scheduled()` (src/schedule.ts) has an SQL twin, `on_schedule()` in
  db/logic.sql, used by Gary's rounds and lawful-by-time. Change one without
  the other and he asks about, or certifies, the wrong things.
- Non-integer `ctx.scale()`/`ctx.rotate()` smears sprite art off the pixel grid.
