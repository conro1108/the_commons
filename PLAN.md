# The Commons — plan

A shared, persistent, multiplayer patch of land in the world of The Meadow
(cozy_sprites) and The Farm (the_farm). The Farm is your town; the Commons is
the land that belongs to *everyone's* town at once — which means it belongs to
nobody, which means it is administered, with enormous seriousness, by Gary.

Tone and pillars are inherited from the_farm's DESIGN.md: deadpan institutional
absurdism, no fail states, no stamina, real time gates the world and never your
hands. Read it before designing a mechanic.

**The mechanics are the open, interesting part.** Everything below the loop is
plumbing; the loop is a first guess to be played and thrown away.

## A first-guess loop

1. **File a claim.** Pick an empty plot, write one line of intent ("a bench,
   for looking at the pond with"). Gary processes it: the AI returns a
   decision from a fixed set — *approved*, *approved with conditions*,
   *referred to committee* — plus the permit's prose and, maybe, a condition
   from an enum ("must face north", "must include a small flag"). Nothing is
   ever denied; committee resolves overnight.
2. **Build on your plot.** Canon props and tiles, free and uncapped.
3. **The commons lives while you're away.** Nightly, a cron reads the day's
   event log and writes *The Commons Gazette* — one AI call for everyone.
4. **Something that needs other people.** The real question. Candidates:
   - **Petitions** — anyone petitions the council ("the pond should be
     larger"); others co-sign; at a threshold the weekly council meeting
     rules, picking an effect from an enum (a decree, an unlocked prop, a
     festival, a renamed path) and writing the minutes. Emergent law.
   - **Mail** — leave a note or gift on someone's plot; Pesto delivers it on
     his round, in real time, so it arrives later than you'd like.
   - **Public works** — a bridge needs 200 planks from anyone; the plaque
     lists who.
   - **Neighbourliness** — things on your plot touch adjacent plots (a lamp
     lights next door; a hedge becomes a shared hedge, with paperwork).

Build the first three, play it, then pick from 4.

## AI rules

- The AI writes prose and **picks from enums**; code validates and applies.
  It never mutates state directly.
- Every call goes through a Vercel Function, and its result is stored — never
  regenerated for the same input.
- Players' text is public, and anonymous sign-in means strangers. The filing
  call doubles as moderation: an unacceptable filing is *lost in the post*
  (status `lost`, never shown to anyone else).
- Budget is $5 of AI Gateway credit. Per filing (cheap model, short), per night
  (gazette), per week (council). Gary processes three filings per resident per
  day — an institutional limit on the AI, not on building.

## Architecture

- **Client:** Vite + TypeScript + canvas, no framework — same as the siblings.
  Pixel art is code (string grids + palettes); vendor canon art from
  cozy_sprites into `src/content/canon/` (copy, never import; never modify
  cozy_sprites). the_farm isn't ours — ask before lifting from it.
- **Server:** Vercel Functions in `api/`. AI via the AI SDK + AI Gateway, which
  authenticates by OIDC on Vercel (no key in the repo). Crons in `vercel.json`
  (Hobby allows daily).
- **Data:** Supabase schema `the_commons` in the shared `connor_toys` project.
  Clients read through PostgREST and subscribe with Realtime. Clients write
  directly only where no AI is involved (placing props on your own plot, RLS
  owner-only); AI-backed writes go through a Function using
  `SUPABASE_SECRET_KEY`, so nobody can forge a permit.
- Rough tables: `plots`, `placements`, `filings`, `events` (append-only, feeds
  the gazette), `gazette`, later `petitions`/`signatures`. Users are
  `auth.users` ids; names come from `app.profiles`.

## Deploy — straight from the repo

- **Frontend + Functions + crons:** Vercel Git integration; every push to
  `main` deploys. Needs `SUPABASE_SECRET_KEY` in Vercel env. `.env` holds only
  the publishable URL/key and is committed.
- **Database:** `.github/workflows/db.yml` runs `db/push.mjs` on any `db/**`
  change. Needs repo secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`.
- Schema `the_commons` is already created and exposed to PostgREST.

## First slice

1. Plot grid renders from the DB; Realtime shows others' changes live.
2. Anonymous sign-in; file a claim; Gary stamps it.
3. Place a handful of canon props on your plot.
4. Nightly gazette.

## Open questions

- The schema rebuild wipes the commons. Fine while prototyping; once people
  live here, the commons is the one toy whose data isn't disposable.
- Avatar: hatch a form, or import a Meadow export like the_farm does?
- One commons for everyone, or several (a "parish" per N players)?
- How big is a plot, and does the map grow as people arrive?
