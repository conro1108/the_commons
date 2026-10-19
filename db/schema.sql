-- The Commons' slice of the shared toybox database.
--
-- Full rebuild, not a migration: dropped and recreated on every push, by hand
-- (`npm run db:push`) or by .github/workflows/db.yml when db/** changes on main.
-- That wipes the commons, which is fine until people are actually living in it
-- (see PLAN.md, "Open questions"). RLS on every table, in the block that creates it.
--
-- Queues, cron jobs and Vault secrets are database-wide, so everything here is
-- named the_commons_* and torn down by this file before it's recreated. The one
-- thing this file doesn't own is the Vault secret `the_commons_gary` (the bearer
-- token the database sends to /api/gary, also GARY_SECRET in Vercel env) — it's
-- a secret, so it was created once by hand and survives rebuilds.

create extension if not exists pgmq;
create extension if not exists pg_net;

drop schema if exists the_commons cascade;
create schema the_commons;
grant usage on schema the_commons to anon, authenticated, service_role;

-- Filings: the whole map. A plot is held by its one filing in a held status;
-- denied, refused and lost filings free it again. Clients insert only the three columns
-- they get to choose; everything else is Gary's, written by /api/gary.
create table the_commons.filings (
  id         bigint generated always as identity primary key, -- "Filing 0041"
  filer      uuid not null default auth.uid() references auth.users on delete cascade,
  plot_x     smallint not null check (plot_x between 0 and 7),
  plot_y     smallint not null check (plot_y between 0 and 4),
  intent     text not null check (length(btrim(intent)) between 3 and 120),
  status     text not null default 'pending'
             check (status in ('pending', 'approved', 'conditional', 'committee', 'denied', 'refused', 'lost')),
  condition  text, -- written for this filing by Gary; met when he inspects and says so
  wants      text, -- the one palette prop Gary thinks would most help meet it
  bylaw      smallint,
  permit     text,
  verdict    jsonb, -- Jev's raw answers and the models used; stored, never regenerated
  minutes    jsonb, -- a referral's night in committee: {outcome, finding, members: [{seat, vote, speech}]}
  -- The holder's ground painting: one char per build cell, row-major, '.' for
  -- grass (src/content/ground.ts). Null until painted.
  ground     text check (length(ground) = 432 and ground ~ '^[.a-z]*$'),
  filed_at   timestamptz not null default now(),
  stamped_at timestamptz,
  -- Gary's inspections of a condition: the latest, in full in inspections.
  built_at     timestamptz, -- last change to what's on the plot (trigger-set)
  inspect_sent timestamptz, -- when Gary was last sent round
  inspected_at timestamptz,
  remark       text,
  met_at       timestamptz
);
create unique index filings_plot_held on the_commons.filings (plot_x, plot_y)
  where status in ('pending', 'approved', 'conditional', 'committee');
alter table the_commons.filings enable row level security;
-- Pending text hasn't been past Gary yet; refused text failed moderation; lost
-- text never reached him. None of it is anyone's business but the filer's.
create policy "rulings are public; your own filings are yours"
  on the_commons.filings for select
  using (status not in ('pending', 'refused', 'lost') or filer = auth.uid());
create policy "file a claim"
  on the_commons.filings for insert to authenticated
  with check (filer = auth.uid());
grant select on the_commons.filings to anon, authenticated;
-- Once granted, the holder may paint the ground; nothing else on the row is theirs.
create policy "paint your own granted plot"
  on the_commons.filings for update to authenticated
  using (filer = auth.uid() and status in ('approved', 'conditional'))
  with check (filer = auth.uid() and status in ('approved', 'conditional'));
grant insert (plot_x, plot_y, intent) on the_commons.filings to authenticated;
grant update (ground) on the_commons.filings to authenticated;
grant all on the_commons.filings to service_role;
alter publication supabase_realtime add table the_commons.filings;

-- Repainting the ground counts as building.
create function the_commons.ground_built() returns trigger
language plpgsql as $$
begin
  if new.ground is distinct from old.ground then new.built_at := now(); end if;
  return new;
end $$;
create trigger filings_ground_built before update of ground on the_commons.filings
  for each row execute function the_commons.ground_built();

-- Placements: what's been built. Only on a plot you hold outright (approved or
-- conditional) — building needs no paperwork, which Gary finds difficult. x/y
-- are build cells, one per plot pixel on the map (PLOT_W x PLOT_H in
-- src/layout.ts). One prop anchored per cell; uncapped otherwise. The prop is
-- free text so new art is a client change; RLS can't judge art, only ownership.
create table the_commons.placements (
  id        bigint generated always as identity primary key,
  filing    bigint not null references the_commons.filings on delete cascade,
  x         smallint not null check (x between 0 and 23),
  y         smallint not null check (y between 0 and 17),
  prop      text not null check (prop ~ '^[a-z_]{1,24}$'),
  -- A written-in item ('item') carries its own name, shown once Gary has read
  -- it (label_ok); until then it's a parcel to everyone but its builder.
  label     text check (label is null or (prop = 'item' and length(btrim(label)) between 1 and 24)),
  label_ok  boolean,
  label_check jsonb, -- the decision model's raw answer
  sprite    jsonb, -- Gary's drawing of it, {rows, palette}; reused for the same name
  sprite_drafts jsonb, -- every attempt at the drawing
  placed_at timestamptz not null default now(),
  unique (filing, x, y)
);
alter table the_commons.placements enable row level security;
create policy "placements are public"
  on the_commons.placements for select using (true);
create policy "build on your own granted plot"
  on the_commons.placements for insert to authenticated
  with check (exists (select 1 from the_commons.filings f
    where f.id = filing and f.filer = auth.uid() and f.status in ('approved', 'conditional')));
create policy "move things about on your plot"
  on the_commons.placements for update to authenticated
  using (exists (select 1 from the_commons.filings f
    where f.id = filing and f.filer = auth.uid()))
  with check (exists (select 1 from the_commons.filings f
    where f.id = filing and f.filer = auth.uid()));
create policy "take down what's on your plot"
  on the_commons.placements for delete to authenticated
  using (exists (select 1 from the_commons.filings f
    where f.id = filing and f.filer = auth.uid()));
grant select on the_commons.placements to anon, authenticated;
grant insert (filing, x, y, prop, label), update (x, y), delete on the_commons.placements to authenticated;
grant all on the_commons.placements to service_role;
alter publication supabase_realtime add table the_commons.placements;

-- Anything built, moved or taken down marks the plot as changed, for Gary.
create function the_commons.placement_built() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update the_commons.filings set built_at = now() where id = coalesce(new.filing, old.filing);
  return null;
end $$;
revoke execute on function the_commons.placement_built() from public, anon, authenticated;
create trigger placements_built after insert or update or delete on the_commons.placements
  for each row execute function the_commons.placement_built();

-- Inspections: every time Gary has come round about a condition. Written only
-- by /api/gary; the latest is copied onto the filing for the map.
create table the_commons.inspections (
  id       bigint generated always as identity primary key,
  filing   bigint not null references the_commons.filings on delete cascade,
  at       timestamptz not null default now(),
  met      boolean not null,
  remark   text not null,
  evidence jsonb not null, -- what he saw: props, ground, neighbours
  answers  jsonb not null  -- the decision model's raw answers
);
alter table the_commons.inspections enable row level security;
create policy "inspections are public"
  on the_commons.inspections for select using (true);
grant select on the_commons.inspections to anon, authenticated;
grant all on the_commons.inspections to service_role;

-- Gary's in-tray.
select pgmq.drop_queue('the_commons_gary')
  where exists (select 1 from pgmq.list_queues() where queue_name = 'the_commons_gary');
select pgmq.create('the_commons_gary');

create function the_commons.enqueue_filing() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pgmq.send('the_commons_gary', jsonb_build_object('id', new.id));
  return new;
end $$;
revoke execute on function the_commons.enqueue_filing() from public, anon, authenticated;
create trigger filings_enqueue after insert on the_commons.filings
  for each row execute function the_commons.enqueue_filing();

-- A written-in item's name goes in the same in-tray.
create function the_commons.enqueue_item() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pgmq.send('the_commons_gary', jsonb_build_object('item', new.id));
  return new;
end $$;
revoke execute on function the_commons.enqueue_item() from public, anon, authenticated;
create trigger placements_enqueue after insert on the_commons.placements
  for each row when (new.label is not null) execute function the_commons.enqueue_item();

-- Every five seconds: hand each queued filing to /api/gary. A message stays in the
-- queue (invisible for two minutes, then retried) until its filing is no longer
-- pending. After five tries it backs off to hourly; the filing stays pending —
-- and so unpublished — until Gary has actually read it. One he still can't read
-- after two days is lost in the post, which is private and frees the plot.
create function the_commons.drain_gary() returns void
language plpgsql security definer set search_path = '' as $$
declare
  m record;
  f the_commons.filings;
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'the_commons_gary';
  if secret is null then return; end if;
  for m in select * from pgmq.read('the_commons_gary', 120, 10) loop
    -- An item's name: read until it's been ruled on, or given up as unlabelled.
    if m.message ? 'item' then
      if m.read_ct > 20 or not exists (select 1 from the_commons.placements
          where id = (m.message->>'item')::bigint and label_ok is null) then
        perform pgmq.delete('the_commons_gary', m.msg_id);
      else
        perform net.http_post(
          url := 'https://the-commons-eosin.vercel.app/api/gary',
          body := jsonb_build_object('item', (m.message->>'item')::bigint),
          headers := jsonb_build_object('Content-Type', 'application/json',
                                        'Authorization', 'Bearer ' || secret),
          timeout_milliseconds := 30000);
      end if;
      continue;
    end if;
    select * into f from the_commons.filings where id = (m.message->>'id')::bigint;
    if f.id is null or f.status <> 'pending' then
      perform pgmq.delete('the_commons_gary', m.msg_id);
    elsif m.read_ct > 53 then
      update the_commons.filings
        set status = 'lost', stamped_at = now(),
            permit = 'Your filing appears to have been lost in the post. These things happen.'
        where id = f.id;
      perform pgmq.delete('the_commons_gary', m.msg_id);
    else
      if m.read_ct > 5 then perform pgmq.set_vt('the_commons_gary', m.msg_id, 3600); end if;
      perform net.http_post(
        url := 'https://the-commons-eosin.vercel.app/api/gary',
        body := jsonb_build_object('id', f.id),
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || secret),
        timeout_milliseconds := 30000);
    end if;
  end loop;
end $$;
revoke execute on function the_commons.drain_gary() from public, anon, authenticated;

-- Gary's rounds: an outstanding condition on a plot that's been built on and
-- then left alone for a minute and a half gets a visit. Once per change; if a
-- visit fails, the next bit of building sends him again. Asked by a filer, he
-- goes round just theirs, straight away. Returns how many plots he's off to.
create function the_commons.send_inspector(asked_by uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  f record;
  secret text;
  n int := 0;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'the_commons_gary';
  if secret is null then return 0; end if;
  for f in
    update the_commons.filings set inspect_sent = now()
    where status = 'conditional' and met_at is null
      and (filer = asked_by or asked_by is null and built_at < now() - interval '90 seconds')
      and built_at > coalesce(inspect_sent, '-infinity')
    returning id
  loop
    n := n + 1;
    perform net.http_post(
      url := 'https://the-commons-eosin.vercel.app/api/gary',
      body := jsonb_build_object('inspect', f.id),
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || secret),
      timeout_milliseconds := 30000);
  end loop;
  return n;
end $$;
revoke execute on function the_commons.send_inspector(uuid) from public, anon, authenticated;

-- Double-click Gary and he comes round your plots now.
create function the_commons.summon_gary() returns int
language sql security definer set search_path = '' as $$
  select the_commons.send_inspector(auth.uid())
$$;
revoke execute on function the_commons.summon_gary() from public, anon;
grant execute on function the_commons.summon_gary() to authenticated;

select cron.unschedule(jobname) from cron.job where jobname like 'the_commons_%';
select cron.schedule('the_commons_gary', '5 seconds', 'select the_commons.drain_gary()');
select cron.schedule('the_commons_inspector', '30 seconds', 'select the_commons.send_inspector(null)');
-- The committee meets at 4am: each referral is sent to /api/gary to be
-- debated. One that can't make quorum stays referred until the next night.
select cron.schedule('the_commons_committee', '0 4 * * *', $$
  select net.http_post(
    url := 'https://the-commons-eosin.vercel.app/api/gary',
    body := jsonb_build_object('committee', f.id),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'the_commons_gary')),
    timeout_milliseconds := 30000)
  from the_commons.filings f where f.status = 'committee'
$$);
