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
-- denied and lost filings free it again. Clients insert only the three columns
-- they get to choose; everything else is Gary's, written by /api/gary.
create table the_commons.filings (
  id         bigint generated always as identity primary key, -- "Filing 0041"
  filer      uuid not null default auth.uid() references auth.users on delete cascade,
  plot_x     smallint not null check (plot_x between 0 and 7),
  plot_y     smallint not null check (plot_y between 0 and 4),
  intent     text not null check (length(btrim(intent)) between 3 and 120),
  status     text not null default 'pending'
             check (status in ('pending', 'approved', 'conditional', 'committee', 'denied', 'lost')),
  condition  text,
  bylaw      smallint,
  permit     text,
  verdict    jsonb, -- Jev's raw answers and the models used; stored, never regenerated
  filed_at   timestamptz not null default now(),
  stamped_at timestamptz
);
create unique index filings_plot_held on the_commons.filings (plot_x, plot_y)
  where status in ('pending', 'approved', 'conditional', 'committee');
create unique index filings_one_plot_each on the_commons.filings (filer)
  where status in ('pending', 'approved', 'conditional', 'committee');
alter table the_commons.filings enable row level security;
-- Pending text hasn't been past Gary yet, and lost text never will be.
create policy "rulings are public; your own filings are yours"
  on the_commons.filings for select
  using (status not in ('pending', 'lost') or filer = auth.uid());
-- Gary processes three filings per resident per day — a limit on the AI only.
create policy "file a claim"
  on the_commons.filings for insert to authenticated
  with check (
    filer = auth.uid()
    and (select count(*) from the_commons.filings f
         where f.filer = auth.uid() and f.filed_at > now() - interval '1 day') < 3
  );
grant select on the_commons.filings to anon, authenticated;
grant insert (plot_x, plot_y, intent) on the_commons.filings to authenticated;
grant all on the_commons.filings to service_role;
alter publication supabase_realtime add table the_commons.filings;

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

-- Every minute: hand each queued filing to /api/gary. A message stays in the
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

select cron.unschedule(jobname) from cron.job where jobname like 'the_commons_%';
select cron.schedule('the_commons_gary', '* * * * *', 'select the_commons.drain_gary()');
-- The committee meets at 4am and has never once said no.
select cron.schedule('the_commons_committee', '0 4 * * *', $$
  update the_commons.filings
    set status = 'approved', stamped_at = now(),
        permit = coalesce(permit || ' ', '') || 'The committee has met, and approves.'
    where status = 'committee'
$$);
