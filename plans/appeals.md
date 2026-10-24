# Schema split, and appeals in the game

Two things before real players: a push stops wiping the commons, and the
appeal ladder the back office proved out becomes the game's.

## The split
- `db/tables.sql`: tables, indexes, RLS enabled. `create ... if not exists`;
  never run by CI. A change is a hand-run `alter table`, folded back in here.
- `db/logic.sql`: everything else (plots rows, functions, triggers, policies,
  grants, queue, cron), rerunnable, pushed by CI on `db/**`.

## The ladder
- Denied: three appeals to Gary. The third dismissed goes up to the committee
  by itself (no new plea), which sits that night.
- Refused: Gary won't hear it; the filer's one plea goes straight to the committee.
- Either way, the committee dismissing it leaves one last plea against its
  finding, also heard overnight. That's final.
- Allowed anywhere up the ladder, the filing is granted if the plot is still free.
- An appeal row says which court (`gary`, `committee`); the database decides
  which is next (`next_appeal`), so the client only sends the plea.

## Checklist
- [ ] tables.sql / logic.sql, push.mjs, CI, plots generator, test, docs
- [ ] appeals: court, nullable plea, minutes; next_appeal; escalation in apply_appeal; nightly sitting
- [ ] api: sitAppeal, with the plea checked for fitness
- [ ] client: the form at each rung, committee rows with their minutes, realtime inserts
- [ ] one-time rebuild, live check (back office can't reach the real flow: run a sitting by hand)
- [ ] PLAN.md: phase 4 done, deeper building + ongoing compliance before the world tick
