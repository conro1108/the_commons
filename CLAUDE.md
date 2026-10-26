# CLAUDE.md

The Commons: a shared multiplayer patch of land, administered with enormous
seriousness by Gary. See `PLAN.md`.

Vite + TypeScript + canvas, no framework. Vercel Functions in `api/`, Supabase
schema `the_commons`. `npm run dev` / `npm run build` / `npm run db:push`.

- The commons' data is kept: no `drop schema`. `db/tables.sql` is never rerun;
  change a table with a hand-run `alter table` and fold it back in.
  `db/logic.sql` is rerun in full by CI, so keep it safe to run twice.
- AI results are stored, never regenerated: everyone sees the same commons.
- Art borrowed from cozy_sprites is copied into `src/content/canon/`, not
  imported; Vercel only has this repo.
- Never draw sprite art with non-integer `ctx.scale()`/`ctx.rotate()`: it smears.
