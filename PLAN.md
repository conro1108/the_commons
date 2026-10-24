# The Commons — plan

A shared, persistent, multiplayer patch of land in the world of The Meadow
(cozy_sprites) and The Farm (the_farm). The Farm is your town; the Commons is
the land that belongs to *everyone's* town at once — which means it belongs to
nobody, which means it is administered, with enormous seriousness, by Gary — the Meadow's Tired Office
Creature, on what he understands to be a permanent secondment.

Tone and pillars are inherited from the_farm's DESIGN.md: deadpan institutional
absurdism, no fail states, no stamina, real time gates the world and never your
hands. Read it before designing a mechanic.

**The mechanics are the open, interesting part.** The loop below is a first
guess to be played and thrown away.

This is also deliberately an infra project: lean hard on Vercel and Supabase.
The rule that keeps that honest — **every service gets one job it is the best
tool for**, and no job is done twice. See the infra map.

## A first-guess loop

1. **File a claim.** Pick an empty plot, write one line of intent ("a bench,
   for looking at the pond with"). It goes into Gary's in-tray and comes back
   a few seconds later — the delay is the joke, and it's also the queue.
   Gary returns a decision from a fixed set — *approved*, *approved with
   conditions*, *referred to committee*, *denied* — plus the permit's prose, maybe a
   condition from an enum ("must face north", "must include a small flag"),
   and citations of precedent ("cf. Filing 0041, also a bench"). Denials cite
   one of a few absurd bylaws (no moats; no livestock larger than a goat) and
   free the plot to refile; committee resolves overnight.
2. **Build on your plot.** Canon props and tiles, free and uncapped.
3. **The commons reacts.** The world is server-simulated, so what one player
   does changes what everyone comes back to. See below — this is the
   multiplayer mechanic, and the reason the backend has real work.
4. **The Commons Gazette.** Nightly, the day's event log becomes a newspaper —
   one AI call for everyone — with a front page you can share.

Later, if the commons wants more: **petitions** (co-sign; at a threshold the
weekly council rules, picking an effect from an enum and writing minutes),
**mail** (Pesto delivers on his round, later than you'd like), **public works**
(a bridge needs 200 planks from anyone; the plaque lists who).

## The commons reacts

A world tick advances the whole commons a step every few minutes. Things a
browser can't be trusted to compute for everyone:

- **Spread.** Hedges creep into empty neighbouring plots; flowers seed
  downwind; paths wear in where people actually walk (from Presence data).
  A hedge that reaches your plot is a boundary dispute, with paperwork.
- **A cast that notices.** Gary inspects the newest construction; Pesto
  re-routes around whatever got built; someone sits on the bench you made.
  Each of these is an event, and events are memories: the cast's dialogue
  retrieves relevant ones (the_farm's "NPCs that remember", but shared —
  Gary remembers what *other* people built).
- **Shared stock.** The plank pile for public works, the seed exchange —
  quantities everyone draws from and adds to.
- **Settling up.** Committee referrals resolve, petitions tally, the day's
  events close for the gazette.

No fail states: spread is never damage, a dispute is never a loss.

## AI rules

- The AI writes prose and **picks from enums**; code validates and applies.
  It never mutates state directly.
- Every result is stored and never regenerated for the same input.
- Players' text is public and sign-in is anonymous. Gary's stamp doubles as
  moderation: a crude or nasty filing is denied (status `refused`, shown to
  nobody else, never appealed). Gary loses his patience over it — withering,
  then incredulous, then snapping outright — in proportion, and never repeats what was filed.
  *Lost in the post* is only for filings Gary never received.
- Gary's ruling is one choice — approve, conditional, committee, or denied
  under a specific bylaw — so a denial always cites one. GLM writes the
  permit; the decision model then checks the draft against the input
  (misdescribes the filing? contradicts the ruling? invents things?). One
  retry with the problems named, then a plain permit written by code. Every
  draft and check is stored in `verdict`.
- Budget is the Gateway's free $5/month — buying any credits forfeits it, so
  only models marked *Free AI Gateway Credit* (models page column; not in the
  public API) are usable. Gary's *judgment* — decision, condition, bylaw,
  lost-in-the-post — is a decision model (`perplexity/pplx-decider-v1.2`,
  AI SDK `experimental_decide`: typed questions in, choices and probabilities
  out). It writes no prose, so the permit is `zai/glm-4.7-flash`. Jev
  (`typesafe-ai/jev`) was the first pick but isn't free-tier. The gazette and
  council get the best free-tier model. Residents may hold any number of plots
  and file as often as they like. Near the budget, an Edge Config
  flag puts **Gary on leave**: stamps go canned until it's flipped back.

## Infra map

| Service | Its job here |
|---|---|
| **Supabase Postgres + RLS** | All state. Clients write directly only where RLS can judge it alone (props on your own plot, a filing row in `pending`). |
| **Supabase Auth** | Anonymous sign-in; Google via `linkIdentity()` keeps your papers (same uuid). Look and name live in `app.profiles`, filled in on Form R-1 (`src/papers.ts`). |
| **Supabase Realtime** | Postgres Changes for the map and stamps; **Broadcast** for avatars walking around (never persisted); **Presence** for who's on the commons, which also feeds path wear. |
| **pg_cron** | The world tick (every few minutes) and draining Gary's queue (every five seconds). Vercel Hobby crons are daily-only, so anything frequent lives here. |
| **Supabase Queues (pgmq)** | Gary's in-tray. A filing insert enqueues; retries and backlog for free. |
| **pg_net + Vault** | The database calls out to Vercel: the drain job POSTs queued filings to `/api/gary`, with a shared secret held in Vault. |
| **Supabase Edge Functions** | The world tick when its step logic outgrows SQL (pathfinding for Pesto, spread rules) — TypeScript, invoked by pg_cron. |
| **pgvector** | Embeddings of filings and events: Gary's precedent citations, the cast's memory retrieval. |
| **Supabase Storage** | Nightly snapshot of the map — a time-lapse of the commons growing up. |
| **Vercel Functions** | Everything that touches the AI: `/api/gary`, `/api/gazette`. They write with `SUPABASE_SECRET_KEY`, so nobody forges a permit. |
| **AI Gateway** | All model calls, embeddings included. OIDC on Vercel, so no key in the repo. One place for spend. |
| **Vercel Cron** | Daily: the gazette. Weekly: the council, if petitions land. |
| **Vercel Workflow** | The council meeting as a durable multi-step run: gather petitions → deliberate → apply effects → write minutes. Check availability on Hobby before leaning on it. |
| **OG images (`@vercel/og`)** | Share cards: a stamped permit, the gazette's front page, your plot. Pixel art as SVG rects. |
| **Edge Config** | Gary on leave (AI kill switch), festival overrides, tuning knobs — read at the edge, changed without a deploy. |
| **Vercel Firewall** | Rate limits on `/api/*`. |

The filing pipeline is the spine, and touches most of the map:
client inserts `filings` row → trigger enqueues (pgmq) → pg_cron drains →
pg_net POSTs `/api/gary` → AI Gateway (decision model rules, GLM writes the permit) → write-back with
the secret key → Realtime delivers the stamp to the filer.

Client: Vite + TypeScript + canvas, no framework — same as the siblings. Pixel
art is code (string grids + palettes); vendor canon art from cozy_sprites into
`src/content/canon/` (copy, never import; never modify cozy_sprites).
the_farm isn't ours — ask before lifting from it.

Rough tables: `plots`, `placements`, `filings`, `events` (append-only, embedded,
feeds the gazette and memory), `gazette`, `cast` (positions, current errand),
later `petitions`/`signatures`. Users are `auth.users` ids; names come from
`app.profiles`.

## Deploy — straight from the repo

- **Frontend, Functions, crons:** Vercel Git integration; every push to `main`
  deploys. `SUPABASE_SECRET_KEY` goes in Vercel env when the first Function
  lands. `.env` holds only the publishable URL/key and is committed.
- **Database:** `.github/workflows/db.yml` runs `db/push.mjs` on any `db/**`
  change. Repo secrets are set. `schema.sql` owns everything in-database —
  tables, RLS, queues, cron schedules, triggers — so it's the IaC.
- **Edge Functions:** to be decided — deploy from the same workflow via the
  Management API, if the tick ever leaves SQL.
- Schema `the_commons` is created and exposed to PostgREST.

## Phases

Each phase gets its own live checklist in `plans/phase-N.md`, written when the
phase starts and kept current while building, so work can resume mid-phase.

1. **Claim a spot** — done ([plans/phase-1.md](plans/phase-1.md)). Shared map,
   avatars and who's here, file a claim, Gary rules on it.
2. **Build it** — in progress ([plans/phase-2.md](plans/phase-2.md)). Place
   props on your plot, free and uncapped, in a focused view of the plot.
3. **Give it some life** — done ([plans/phase-3.md](plans/phase-3.md)).
4. **Somewhere, not a grid** — in progress ([plans/phase-4.md](plans/phase-4.md)).
   A composed map of five kinds of ground; plot site and climate feed the loop.
5. **The field changes while you're away** — the world tick: hedges spread,
   paths wear in, the cast notices what got built.
6. **The daily newspaper** — the nightly Gazette, with an OG front page.

Later: petitions and the council, mail, public works, identity (see Open
questions).

## Open questions

- **Drawn write-ins.** A written-in item is a labelled parcel, so "a beach
  umbrella" reads as shade to the inspector but looks like a box. Follow-up:
  draw a sprite for each approved label (generated once, stored, reused by
  name) so the umbrella looks like one. Hold off until a generator can match
  the canon art; a bad sprite is worse than a parcel.
- The schema rebuild wipes the commons — and its cron jobs and queue, which
  live in the schema too. Fine while prototyping; once people live here, the
  commons is the one toy whose data isn't disposable. **Needed soon, before
  real players:** CI rebuilds on any `db/**` push, so even a one-line cron
  tweak wipes every filing. Plan: split into `db/tables.sql` (`create table if
  not exists`, never auto-run; changes are hand-run `alter table`s folded back
  in) and `db/logic.sql` (functions, triggers, RLS, cron, queue — rerunnable,
  pushed by CI).
- pg_cron jobs, pgmq queues, and Vault secrets are database-wide, not
  per-schema — name them `the_commons_*` so they don't collide with siblings,
  and have `schema.sql` unschedule its own jobs before rescheduling.
- Avatar: hatch a form, or import a Meadow export like the_farm does?
- One commons for everyone, or several (a "parish" per N players)?
- How big is a plot, and does the map grow as people arrive?
- **Identity: persistent accounts via Google** (and maybe GitHub), so a plot
  survives a cleared browser. Plan: Supabase Auth's Google provider +
  `linkIdentity()`, which upgrades the anonymous user in place — same uuid,
  same plot, same `app.profiles` row. Not Clerk or similar: those users never
  land in `auth.users`, breaking the toybox rule. Needs a Google OAuth client
  and the provider enabled on the shared project (benefits every sibling).
