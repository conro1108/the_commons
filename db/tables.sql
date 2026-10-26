-- The Commons' tables: what people have made here, which isn't disposable.
--
-- Never run by CI, and never dropped. Everything is `if not exists`, so
-- running it again does nothing. Changing a table means a hand-run
-- `alter table` (node db/push.mjs on a scratch file), then folding the change
-- back in here so this file always says what the tables are.
--
-- Everything else in the database (functions, triggers, policies, grants, the
-- plots' rows, queue, cron) is db/logic.sql, which CI reruns on every push.
-- RLS is enabled here, in the block that creates each table; the policies live there.

create schema if not exists the_commons;
grant usage on schema the_commons to anon, authenticated, service_role;

-- Plots: the commons' land, cut once by scripts/world.ts. Rows are written by
-- the generated block in db/logic.sql.
create table if not exists the_commons.plots (
  id     smallint primary key,
  name   text not null,
  region text not null,
  w      smallint not null,
  h      smallint not null,
  mask   text not null check (length(mask) = w * h) -- row-major, '#' is the plot
);
alter table the_commons.plots enable row level security;

-- Filings: the whole map. A plot is held by its one filing in a held status;
-- denied, refused and lost filings free it again. Clients insert only the three columns
-- they get to choose; everything else is Gary's, written by /api/gary.
create table if not exists the_commons.filings (
  id         bigint generated always as identity primary key, -- "Filing 0041"
  filer      uuid not null default auth.uid() references auth.users on delete cascade,
  plot       smallint not null references the_commons.plots,
  intent     text not null check (length(btrim(intent)) between 3 and 120),
  status     text not null default 'pending'
             check (status in ('pending', 'approved', 'conditional', 'committee', 'denied', 'refused', 'lost')),
  condition  text, -- written for this filing by Gary; met when he inspects and says so
  wants      text, -- the one palette prop Gary thinks would most help meet it
  bylaw      smallint, -- 1-7 for the bylaws, 0 for the covenant of the plot's region
  permit     text,
  verdict    jsonb, -- Jev's raw answers and the models used; stored, never regenerated
  minutes    jsonb, -- a referral's night in committee: {outcome, finding, members: [{seat, vote, speech}]}
  -- The holder's ground painting: one char per build cell of the plot's box,
  -- row-major, '.' for its native ground (src/content/ground.ts). Null until
  -- painted; its length is checked against the plot by trigger.
  ground     text check (length(ground) <= 1408 and ground ~ '^[.a-z]*$'),
  filed_at   timestamptz not null default now(),
  stamped_at timestamptz,
  -- Gary's inspections of a condition: the latest, in full in inspections.
  built_at     timestamptz, -- last change to what's on the plot (trigger-set)
  inspect_sent timestamptz, -- when Gary was last sent round
  inspected_at timestamptz,
  remark       text,
  met_at       timestamptz,
  audited_at   timestamptz, -- when Gary last came back to audit it (send_auditor)
  schedule     jsonb, -- Gary's: what the permit lets you build (Schedule, src/schedule.ts); null for filings granted before schedules
  shell        jsonb  -- the holder's: the building as put up (Shell, src/schedule.ts)
);
create unique index if not exists filings_plot_held on the_commons.filings (plot)
  where status in ('pending', 'approved', 'conditional', 'committee');
alter table the_commons.filings enable row level security;

-- Placements: what's been built. Outdoors (room 'out'), x/y are build cells of
-- the plot's box, one per map pixel; inside the shell (room 'in'), cells of its
-- room; in or on another thing (parent), x is the slot. One prop anchored per
-- cell; uncapped otherwise. The prop is
-- free text so new art is a client change; RLS can't judge art, only ownership.
create table if not exists the_commons.placements (
  id        bigint generated always as identity primary key,
  filing    bigint not null references the_commons.filings on delete cascade,
  x         smallint not null check (x between 0 and 43),
  y         smallint not null check (y between 0 and 31),
  prop      text not null check (prop ~ '^[a-z_]{1,24}$'),
  size      smallint not null default 1 check (size between 1 and 3), -- drawn this many times over
  -- A written-in item ('item') carries its own name, shown once Gary has read
  -- it (label_ok); until then it's a parcel to everyone but its builder.
  label     text check (label is null or (prop = 'item' and length(btrim(label)) between 1 and 24)),
  label_ok  boolean,
  label_check jsonb, -- the decision model's raw answer
  sprite    jsonb, -- Gary's drawing of it, {rows, palette}; reused for the same name
  sprite_drafts jsonb, -- every attempt at the drawing
  placed_at timestamptz not null default now(),
  room      text not null default 'out' check (room in ('out', 'in')),
  parent    bigint references the_commons.placements on delete cascade,
  impounded_at timestamptz -- in the pound at Gary's hut; null when it's where it was put
);
create unique index if not exists placements_cell on the_commons.placements (filing, room, coalesce(parent, 0), x, y)
  where impounded_at is null;
alter table the_commons.placements enable row level security;

-- Inspections: every time Gary has come round about a condition, or to audit
-- a granted plot against its permit. Written only by /api/gary; the latest is
-- copied onto the filing for the map.
create table if not exists the_commons.inspections (
  id       bigint generated always as identity primary key,
  filing   bigint not null references the_commons.filings on delete cascade,
  at       timestamptz not null default now(),
  kind     text not null default 'condition' check (kind in ('condition', 'audit')),
  met      boolean not null, -- for an audit: in order
  remark   text not null,
  evidence jsonb not null, -- what he saw: props, ground, neighbours
  answers  jsonb not null  -- the decision model's raw answers
);
alter table the_commons.inspections enable row level security;

-- Appeals: the ladder up from a denial, one rung a row, while the plot is still
-- free. A denial gets three to Gary; the third dismissed goes up to the
-- committee by itself (no plea), a refusal goes straight there with one. The
-- committee dismissing it leaves one last plea against its finding. Allowed
-- anywhere, the filing is granted, its denial kept for the record. Clients
-- insert only the plea; which court hears it is the database's call (next_appeal).
create table if not exists the_commons.appeals (
  id       bigint generated always as identity primary key,
  filing   bigint not null references the_commons.filings on delete cascade,
  n        smallint not null check (n between 1 and 5), -- set by trigger
  court    text not null check (court in ('gary', 'committee')), -- set by trigger
  plea     text check (plea is null and court = 'committee' or length(btrim(plea)) between 3 and 280),
  filed_at timestamptz not null default now(),
  heard_at timestamptz,
  ok       boolean, -- fit for anyone else to read
  allowed  boolean,
  bylaw    smallint, -- dismissed: what the denial still stands under (0 the covenant)
  reply    text, -- Gary's reply, or the committee's finding
  minutes  jsonb, -- the committee's: {outcome, finding, members}
  record   jsonb, -- the models' answers and the drafts; stored, never regenerated
  unique (filing, n)
);
alter table the_commons.appeals enable row level security;

-- The back office's runs, kept so what's seen there can be talked over afterwards
-- (scripts/runs.mjs). A session is one case, from filing it to its last appeal.
-- Written only by api/backoffice.ts; nobody else reads it.
create table if not exists the_commons.backoffice_runs (
  id      bigint generated always as identity primary key,
  session uuid not null,
  at      timestamptz not null default now(),
  what    text not null,
  body    jsonb not null, -- what the back office sent
  result  jsonb,
  error   text,
  calls   jsonb not null, -- every model call, as transcript() wrote it down
  ms      int not null
);
create index if not exists backoffice_runs_session on the_commons.backoffice_runs (session, id);
alter table the_commons.backoffice_runs enable row level security;
