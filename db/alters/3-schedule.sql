-- Building and enforcement, slice C (Gary's schedule): the pieces he's drawn
-- once for everyone, variations filed against a permit, and storage as a room.
-- Hand-run once (node db/push.mjs db/alters/3-schedule.sql); folded into db/tables.sql.
create table if not exists the_commons.pieces (
  name     text primary key check (name ~ '^[a-z0-9]' and length(name) <= 80),
  sprite   jsonb,
  drafts   jsonb,
  drawn_at timestamptz not null default now()
);
alter table the_commons.pieces enable row level security;

create table if not exists the_commons.variations (
  id            bigint generated always as identity primary key,
  filing        bigint not null references the_commons.filings on delete cascade,
  filer         uuid not null default auth.uid() references auth.users on delete cascade,
  kind          text not null default 'addition' check (kind in ('addition', 'use')),
  what          text not null check (length(btrim(what)) between 3 and 80),
  room          text check (room in ('out', 'in')),
  retrospective boolean not null default false,
  status        text not null default 'pending' check (status in ('pending', 'granted', 'committee', 'denied', 'refused')),
  scale         text check (scale in ('small', 'material')),
  ok            boolean,
  condition     text,
  reply         text,
  minutes       jsonb,
  record        jsonb,
  filed_at      timestamptz not null default now(),
  heard_at      timestamptz
);
create index if not exists variations_filing on the_commons.variations (filing, id);
create unique index if not exists variations_open on the_commons.variations (filing) where status in ('pending', 'committee');
alter table the_commons.variations enable row level security;

alter table the_commons.placements drop constraint if exists placements_room_check;
alter table the_commons.placements add constraint placements_room_check check (room in ('out', 'in', 'store'));
