# E. The spirit: progress

Branch `worktree-agent-a723058c2a972b2bb`. Resume from the first unticked step.

- [x] 1. Schema: `db/alters/5-spirit.sql` + folded into `db/tables.sql` (filings: open_sign, stirred_at, boarded_at, quit_by, quit_for, reading, read_at, drift; tables notices, visits, readings; RLS on)
- [x] 2. `db/logic.sql` section: policies + grants for notices/visits/readings, open_sign update grant
- [x] 3. `db/logic.sql`: triggers (stirred_at on sign/notice/visit; unboard on any stir or build)
- [x] 4. `db/logic.sql`: send_spirit() cron (fitness reads of notices/visits, readings when changed or a week stale), summon_reader(), board_up() daily, ask_for_plot() rpc, freeing after a week's notice; realtime for notices/visits
- [ ] 5. `api/gary.ts` section: readLine() fitness for notices and visits
- [ ] 6. `api/gary.ts`: readUse() reading (Jev: yes/mostly/drifted; scribe: other use + line; checks; fallbacks), readings row, latest copied onto filing; desk hooks
- [ ] 7. `api/gary.ts`: driftOf() export for C's change of use (mixed use if filed before drift)
- [ ] 8. `src/schedule.ts`: useOf() (schedule.use or intent)
- [ ] 9. `src/net.ts` section: Filing fields, Notice/Visit types, load/post/sign/flip/ask/summon, fileChangeOfUse stub (C)
- [ ] 10. `src/spirit.ts`: pure HTML for sign/board/book/reading/drift/boarded + CSS + drawBoarded()
- [ ] 11. `src/main.ts` section: wiring up close (build-info) and on the card; realtime hook
- [ ] 12. Render hook: boarded plots on the map (`src/render.ts`, one line)
- [ ] 13. `dev/spirit.html`: every state, no network
- [ ] 14. `npm run build` + `npm test`, final commit, notes below

## Notes
- 1: alter is `db/alters/5-spirit.sql`. `read_sent` added too (the reader's own throttle, like inspect_sent).
- 2-4: one section in db/logic.sql, `-- --- the spirit` ... `-- --- end of the spirit`, just before the realtime block. Fitness reads aren't on the pgmq in-tray (drain_gary untouched): send_spirit() posts {notice}/{visit}/{reading} itself, throttled by sent_at/tries/read_sent. Crons: the_commons_spirit (15s), the_commons_disuse (hourly, board_up()). RPCs: summon_reader(), ask_for_plot(plot). Disuse = greatest(stamped_at, built_at, stirred_at) older than 30 days. Freed = status 'lost' (plot free under filings_plot_held; placements kept on the lost filing). Unboarding is the filings_stirred trigger: any stir or build by anyone clears boarded_at/quit_by. Not run against a database (no psql here).
