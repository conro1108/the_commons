# Phase 1 — Claim a spot (done)

Live checklist; update as work lands so a fresh session can resume from here.
Scope (from PLAN.md, revised): shared map, see others' plots and avatars live,
file a claim, Gary rules on it. No building (phase 2). Gary **can deny** —
against a short list of absurd bylaws — and a denial frees the plot to refile.

## Decisions
- Map is 8×5 plots (constants in `src/layout.ts`, mirrored by `db/schema.sql` checks).
- One table, `filings`, is the map: a plot is held by its one filing in
  pending/approved/conditional/committee. Unique partial indexes enforce one
  holder per plot and one plot per resident. Denied/lost free the plot.
- RLS: rulings public, pending/lost visible only to the filer. Clients insert
  only `plot_x, plot_y, intent` (column grant); 3 filings/day per resident.
- Pipeline: insert → trigger `pgmq.send` → pg_cron every minute
  `drain_gary()` → `net.http_post` to `/api/gary` with Vault secret
  `the_commons_gary` → `perplexity/pplx-decider-v1.2` (`experimental_decide`)
  rules, `zai/glm-4.7-flash` writes the permit (both on the Gateway free tier;
  Jev isn't, and buying credits forfeits the free $5/mo) → conditional update
  `where status = 'pending'` → Realtime. Drain deletes queue messages whose
  filing is no longer pending; >5 tries → hourly; >53 → lost (private).
  Never published until a model has ruled.
- Committee resolves at 04:00 via pg_cron (always approves).
- Names: `app.profiles.handle` (auto-created for anonymous users).
- Avatars: Broadcast positions on channel `the_commons:field`; Presence for
  who's here. Click to walk.

## Checklist
- [x] `db/schema.sql`: filings, RLS, queue, trigger, drain, cron
- [x] Vault secret `the_commons_gary` created; `db:push` applied (cron + queue verified)
- [x] `api/gary.ts`: decision-model ruling + GLM permit + write-back; test for verdict mapping
  (`rule()` is exported; try it locally with `.env.local`'s OIDC token)
- [x] Vercel: project linked, env `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GARY_SECRET`
- [x] Gateway: card added; switched off Jev to free-tier models
- [x] Client: canon props, map render, anonymous sign-in, filings + realtime
- [x] Client: avatars (broadcast) + who's here (presence)
- [x] Client: claim form, plot info panel, notice board
- [x] RLS probed: second plot rejected, forged status rejected
- [x] End-to-end on production: file → stamped within ~1 min
- [x] Review (hash-out): 7 fixed, #3 (global pending cap) dropped by agreement,
  poison-filing fallback added
- [x] PLAN.md updated, pushed
