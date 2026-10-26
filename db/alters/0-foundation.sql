-- Building and enforcement, the shared part: the schedule, the shell, and
-- placements that can be inside or in other things, or in the pound.
-- Hand-run once (node db/push.mjs db/alters/0-foundation.sql); folded into db/tables.sql.
alter table the_commons.filings add column if not exists schedule jsonb;
alter table the_commons.filings add column if not exists shell jsonb;
alter table the_commons.placements add column if not exists room text not null default 'out' check (room in ('out', 'in'));
alter table the_commons.placements add column if not exists parent bigint references the_commons.placements on delete cascade;
alter table the_commons.placements add column if not exists impounded_at timestamptz;
alter table the_commons.placements drop constraint if exists placements_filing_x_y_key;
create unique index if not exists placements_cell on the_commons.placements (filing, room, coalesce(parent, 0), x, y)
  where impounded_at is null;
