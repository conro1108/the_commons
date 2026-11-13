# The Commons

A shared, persistent patch of land. It belongs to everyone, so it belongs to
nobody, so it is administered, with enormous seriousness, by Gary, a tired
office creature.

Deadpan institutional absurdism, no fail states. The Meadow (cozy_sprites) and
The Farm were the inspiration, not a canon to stay inside. Mechanics are still
open; play them and throw out what's dull.

## What's here

- **Come in** by name: your name is your key, no password. Guests look round
  as grey ghosts and can't file.
- **File a claim** on a plot with one line of intent. Gary approves, attaches
  a condition, refers it to the committee, or denies it under a bylaw, and
  writes the permit. Crude filings are refused, shown to nobody else.
- **Build** on a granted plot: canon props, written-in items Gary draws, and
  painted ground. Gary comes round to check conditions, and audits now and
  then.
- **Appeal** a denial to Gary, then up to the committee, which sits nightly.
- **The gazette**: each morning, a few things that happened between the places
  people have built, on the notice board. Answer on your own what's-on board
  and tomorrow's paper reads it.

## Next, roughly

What the gazette reports should start to show: things moved, worn, grown,
sat on, so the commons changes while you're away. Then petitions and mail.
The paperwork is deep enough; what it governs is what's thin.

## How it fits together

- **Supabase:** Postgres + RLS holds everything; clients write directly only
  where RLS can judge it alone. Realtime: Postgres Changes for rulings,
  Broadcast for walking, Presence for who's here.
- **The filing pipeline:** insert a filing → trigger enqueues (pgmq) →
  pg_cron drains every few seconds → pg_net POSTs `/api/gary` → Gary rules
  and writes back with the secret key → Realtime delivers the stamp.
  pg_cron also sends the inspector, the daily auditor and the nightly
  committee. Name jobs, queues and secrets `the_commons_*`; they're
  database-wide.
- **Vercel:** Functions in `api/` for anything with AI or the secret key;
  models through the AI Gateway.
- **Deploy:** pushing to `main` deploys the app. CI reruns `db/logic.sql`
  on `db/**` changes. `db/tables.sql` is never rerun (see CLAUDE.md).

Phase checklists from earlier work are in `plans/`.
