-- The spirit: what a place is used for. The open sign and the boarding up on
-- filings; the what's-on board, the visitors' book and Gary's readings.
-- Hand-run once (node db/push.mjs db/alters/5-spirit.sql); folded into db/tables.sql.
alter table the_commons.filings add column if not exists open_sign boolean not null default false;
alter table the_commons.filings add column if not exists stirred_at timestamptz;
alter table the_commons.filings add column if not exists boarded_at timestamptz;
alter table the_commons.filings add column if not exists quit_by timestamptz;
alter table the_commons.filings add column if not exists quit_for uuid references auth.users on delete set null;
alter table the_commons.filings add column if not exists reading text;
alter table the_commons.filings add column if not exists read_at timestamptz;
alter table the_commons.filings add column if not exists drift text;
alter table the_commons.filings add column if not exists read_sent timestamptz;

create table if not exists the_commons.notices (
  id        bigint generated always as identity primary key,
  filing    bigint not null references the_commons.filings on delete cascade,
  line      text not null check (length(btrim(line)) between 3 and 80),
  posted_at timestamptz not null default now(),
  ok        boolean,
  checked   jsonb,
  sent_at   timestamptz,
  tries     smallint not null default 0
);
create index if not exists notices_filing on the_commons.notices (filing);
alter table the_commons.notices enable row level security;

create table if not exists the_commons.visits (
  id      bigint generated always as identity primary key,
  filing  bigint not null references the_commons.filings on delete cascade,
  visitor uuid not null default auth.uid() references auth.users on delete cascade,
  line    text not null check (length(btrim(line)) between 3 and 140),
  day     date not null default current_date,
  at      timestamptz not null default now(),
  ok      boolean,
  checked jsonb,
  sent_at timestamptz,
  tries   smallint not null default 0,
  unique (filing, visitor, day)
);
alter table the_commons.visits enable row level security;

create table if not exists the_commons.readings (
  id       bigint generated always as identity primary key,
  filing   bigint not null references the_commons.filings on delete cascade,
  at       timestamptz not null default now(),
  use      text not null,
  verdict  text not null check (verdict in ('yes', 'mostly', 'drifted', 'boarded', 'freed')),
  other    text,
  line     text not null,
  evidence jsonb,
  answers  jsonb
);
create index if not exists readings_filing on the_commons.readings (filing, id);
alter table the_commons.readings enable row level security;

-- A month's grace for every place already held, so board_up() doesn't board up
-- the whole commons the hour it's switched on (nobody's had a sign or a board till now).
update the_commons.filings set stirred_at = now() where stirred_at is null and status in ('approved', 'conditional');
