# CLAUDE.md

The Commons is a shared multiplayer patch of land in the world of The Meadow
(`~/projects/cozy_sprites`) and The Farm (github.com/kassandrews/the_farm).
Read `PLAN.md` first: premise, the first-guess loop, AI rules, architecture.
Tone follows the_farm's DESIGN.md — deadpan institutional absurdism, no fail
states, no stamina.

Vite + TypeScript + canvas, no framework. Vercel Functions in `api/`, Supabase
schema `the_commons` in `db/schema.sql`. `npm run dev` / `npm run build` /
`npm run db:push`.

- cozy_sprites is canon and finished: copy content from it into
  `src/content/canon/`, never import from or modify it.
- AI picks from enums and writes prose; code applies the result. Store every
  AI result; never regenerate for the same input.
- Writes that involve AI go through a Function with the secret key. Clients
  write directly only where RLS can fully judge the request.
- Never draw sprite art with non-integer `ctx.scale()`/`ctx.rotate()` (see
  cozy_sprites `drawSpriteQuantized`).
