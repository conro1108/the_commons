# E. The spirit: progress

Branch `worktree-agent-a723058c2a972b2bb`. Resume from the first unticked step.

- [x] 1. Schema: `db/alters/5-spirit.sql` + folded into `db/tables.sql` (filings: open_sign, stirred_at, boarded_at, quit_by, quit_for, reading, read_at, drift; tables notices, visits, readings; RLS on)
- [x] 2. `db/logic.sql` section: policies + grants for notices/visits/readings, open_sign update grant
- [x] 3. `db/logic.sql`: triggers (stirred_at on sign/notice/visit; unboard on any stir or build)
- [x] 4. `db/logic.sql`: send_spirit() cron (fitness reads of notices/visits, readings when changed or a week stale), summon_reader(), board_up() daily, ask_for_plot() rpc, freeing after a week's notice; realtime for notices/visits
- [x] 5. `api/gary.ts` section: readLine() fitness for notices and visits
- [x] 6. `api/gary.ts`: readUse() reading (Jev: yes/mostly/drifted; scribe: other use + line; checks; fallbacks), readings row, latest copied onto filing; desk hooks
- [x] 7. `api/gary.ts`: driftOf() export for C's change of use (mixed use if filed before drift)
- [x] 8. `src/schedule.ts`: useOf() (schedule.use or intent)
- [x] 9. `src/net.ts` section: Filing fields, Notice/Visit types, load/post/sign/flip/ask/summon, fileChangeOfUse stub (C)
- [x] 10. `src/spirit.ts`: pure HTML for sign/board/book/reading/drift/boarded + CSS + drawBoarded()
- [x] 11. `src/main.ts` section: wiring up close (build-info) and on the card; realtime hook
- [x] 12. Render hook: boarded plots on the map (`src/render.ts`, one line)
- [x] 13. `dev/spirit.html`: every state, no network
- [x] 14. `npm run build` + `npm test`, final commit, notes below

## Notes
- 1: alter is `db/alters/5-spirit.sql`. `read_sent` added too (the reader's own throttle, like inspect_sent).
- 2-4: one section in db/logic.sql, `-- --- the spirit` ... `-- --- end of the spirit`, just before the realtime block. Fitness reads aren't on the pgmq in-tray (drain_gary untouched): send_spirit() posts {notice}/{visit}/{reading} itself, throttled by sent_at/tries/read_sent. Crons: the_commons_spirit (15s), the_commons_disuse (hourly, board_up()). RPCs: summon_reader(), ask_for_plot(plot). Disuse = greatest(stamped_at, built_at, stirred_at) older than 30 days. Freed = status 'lost' (plot free under filings_plot_held; placements kept on the lost filing). Unboarding is the filings_stirred trigger: any stir or build by anyone clears boarded_at/quit_by. Not run against a database (no psql here).
- 5-8: `// --- the spirit` section in api/gary.ts just above deskDb; desk() gets `& SpiritBody` and a two-line hook (spiritDesk). Reading: Jev picks yes/mostly/drifted; scribe writes two lines (other use / the reading), checked for invents/contradicts/unfit, fallback formReading(). Unchanged evidence (stable()) only bumps read_at. Drift stored on filings.drift (the other use, or 'something else'). `driftOf(db, filing, asOf)` exported for C. survey() isn't filtered to room='out' (B/D's to change); inside things are read separately.
- 9: optional spirit fields on Filing (so dev pages' made-up filings still compile); section at the end of net.ts. `fileChangeOfUse()` is the STUB for C.
- 10: src/spirit.ts: spiritHtml (up close), spiritCardHtml (map card), driftLine, styleSpirit (CSS injected, so dev page shares it), drawBoarded(ctx, plot).
- 11: main.ts section `// --- the spirit` just above `// --- canvas and views`. Hooks: imports (own lines), renderBuildInfo (spiritUp + wireSpirit + keep typing), renderCard held branch (spiritCardHtml + wireAsk), enterFocus (loadSpiritFor), start() (spiritChannel before subscribe). The change-of-use button calls the net.ts stub.
- 12: render.ts drawPlot: one line after the mini, `if (f.boarded_at) drawBoarded(ctx, p)`, plus its import. Nothing in closeup.ts (A's); boarding up close isn't drawn.
- 13: dev/spirit.html (+ dev/spirit.ts): nine panel states (holder, visitor, guest, drifted, boarded + asked, empty, three card states) and the plot on the map, plain and boarded. ?plot=N. Screenshot checked.
- 14: build and test pass. The alter also gives every held place a month's grace (stirred_at = now()) so board_up() doesn't board up the whole commons on its first run.

## For whoever merges
- Apply `db/alters/5-spirit.sql` before logic.sql reruns (policies reference the new tables/columns).
- C: `fileChangeOfUse()` in src/net.ts is the stub the drift notice's button calls; `driftOf(db, filing, asOf)` in api/gary.ts says whether the change of use was filed before Gary found the drift (mixed use may be granted) or after (dearer). A granted change of use should clear `filings.drift` (and could set `read_sent = null` so he rereads).
- B/D: survey() still lists placements of every room; the reading reads room 'in' separately, so survey() wants `.eq("room", "out")` once inside exists.
- A: nothing in closeup.ts; a boarded place up close isn't drawn boarded (only the panel says so). Hook if wanted: `f.boarded_at`.
- Not done: a drift notice doesn't come by post (letter) on the map; you see it up close.
