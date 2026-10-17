# Phase 1 — Claim a spot

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
  `the_commons_gary` → Jev (`typesafe-ai/jev`, `experimental_decide`) rules,
  GLM (`zai/glm-5.3-flash`) writes the permit → conditional update
  `where status = 'pending'` → Realtime. Drain deletes queue messages whose
  filing is no longer pending; >5 tries → committee.
- Committee resolves at 04:00 via pg_cron (always approves).
- Names: `app.profiles.handle` (auto-created for anonymous users).
- Avatars: Broadcast positions on channel `the_commons:field`; Presence for
  who's here. Click to walk.

## Checklist
- [x] `db/schema.sql`: filings, RLS, queue, trigger, drain, cron
- [x] Vault secret `the_commons_gary` created; `db:push` applied (cron + queue verified)
- [x] `api/gary.ts`: Jev ruling + GLM permit + write-back; test for verdict mapping
  (`rule()` is exported; try it locally with `.env.local`'s OIDC token)
- [x] Vercel: project linked, env `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GARY_SECRET`
- [ ] **BLOCKED on user:** AI Gateway needs a credit card on the Vercel team
  (403 customer_verification_required). Until then filings fall to committee.
- [ ] Client: canon props, map render, anonymous sign-in, filings + realtime
- [ ] Client: avatars (broadcast) + who's here (presence)
- [ ] Client: claim form, plot info panel, notice board
- [ ] End-to-end on production: file → stamped within ~1 min
- [ ] Review (hash-out), fixes, PLAN.md updated, pushed
