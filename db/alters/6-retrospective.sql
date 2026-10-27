-- Retrospective permission: a variation filed for a red-tagged thing carries its tag.
-- Hand-run once (node db/push.mjs db/alters/6-retrospective.sql); folded into db/tables.sql.
alter table the_commons.variations add column if not exists tag bigint references the_commons.tags on delete set null;
