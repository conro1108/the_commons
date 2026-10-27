-- Slice D, the letter: Gary's questions about what's built off the schedule.
-- Hand-run once (node db/push.mjs db/alters/4-letter.sql); folded into db/tables.sql.
create table if not exists the_commons.tags (
  id          bigint generated always as identity primary key,
  filing      bigint not null references the_commons.filings on delete cascade,
  placement   bigint references the_commons.placements on delete set null, -- null once it's been taken down
  what        text not null, -- the thing as Gary calls it, bare: "hot tub"
  question    text not null,
  asked_at    timestamptz not null default now(),
  answer      text check (length(btrim(answer)) between 1 and 200),
  answered_at timestamptz,
  reply       text, -- Gary's, to the answer (or to the lack of one)
  record      jsonb, -- the decision model's answers and the drafts; stored, never regenerated
  due         timestamptz, -- a red tag's date: taken down, filed for, or to the pound
  status      text not null default 'asked' check (status in
                ('asked', 'ancillary', 'tagged', 'filed', 'permitted', 'removed', 'impounded', 'returned', 'lawful')),
  closed_at   timestamptz
);
create unique index if not exists tags_open on the_commons.tags (placement) where status in ('asked', 'tagged', 'filed');
create index if not exists tags_filing on the_commons.tags (filing);
alter table the_commons.tags enable row level security;
