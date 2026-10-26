# CLAUDE.md

The Commons is a shared multiplayer patch of land in the world of The Meadow
(`~/projects/cozy_sprites`) and The Farm (github.com/kassandrews/the_farm).
Read `PLAN.md` first: premise, what's built, architecture.
Tone follows the_farm's DESIGN.md — deadpan institutional absurdism, no fail
states, no stamina.

Vite + TypeScript + canvas, no framework. Vercel Functions in `api/`, Supabase
schema `the_commons`. `npm run dev` / `npm run build` / `npm run db:push`.

- The commons' data is kept, unlike the other toys': no `drop schema`.
  `db/tables.sql` is the tables, never rerun; change one with a hand-run
  `alter table` and fold it back in. `db/logic.sql` is everything else, rerun
  in full by CI (and `npm run db:push`), so it must stay safe to run twice.

- cozy_sprites is canon and finished: copy content from it into
  `src/content/canon/`, never import from or modify it.
- AI results are stored, never regenerated: everyone sees the same commons.
- Never draw sprite art with non-integer `ctx.scale()`/`ctx.rotate()` (see
  cozy_sprites `drawSpriteQuantized`).
