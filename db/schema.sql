-- The Commons' slice of the shared toybox database.
--
-- Full rebuild, not a migration: dropped and recreated on every push, by hand
-- (`npm run db:push`) or by .github/workflows/db.yml when db/** changes on main.
-- That wipes the commons, which is fine until people are actually living in it
-- (see PLAN.md, "Open questions"). RLS on every table, in the block that creates it.

drop schema if exists the_commons cascade;
create schema the_commons;
grant usage on schema the_commons to anon, authenticated;
