# C. Gary's schedule: progress

Branch `worktree-agent-abdf4488549af27a7`. Resume from the first unticked step.

- [x] 1. Progress file.
- [x] 2. `src/schedule.ts`: pure helpers (norm names, add a granted variation, apply a change of use, stored room) + `scheduled()` ignoring storage.
- [x] 3. `src/library.ts`: the seam onto F's fittings (stand-in list + best match), and shell materials stand-in.
- [x] 4. Schema: `db/alters/3-schedule.sql` (pieces, variations, placements room 'store'), folded into `db/tables.sql`.
- [x] 5. `db/logic.sql` own section: policies, enqueue, own queue + drain, nightly committee for variations, realtime.
- [x] 6. `api/gary.ts` own section: `writeSchedule()` (Jev picks shell/keys, scribe writes names, checked) + pieces drawn once.
- [x] 7. Hook grants: desk(), convene(), hearAppeal(), sitAppeal() call `scheduleFor()`; readLabel reuses pieces.
- [x] 8. `api/gary.ts`: variations, `ruleVariation()` (small same day, material to committee, retrospective dearer).
- [x] 9. `api/gary.ts`: change of use (fresh ruling, schedule rewritten, misfits historic or to storage).
- [x] 10. `api/gary.ts`: committee sitting on variations; desk() routes `variation` / `committee_variation`.
- [x] 11. `src/net.ts` own section: Variation type, load, fileVariation, fileChangeOfUse.
- [ ] 12. `src/permit.ts`: schedule + variations HTML (shared by main.ts and the dev page).
- [ ] 13. `src/main.ts` own section: schedule on the permit card, variation form + list, realtime.
- [ ] 14. `dev/permit.html`: the permit card with a schedule, no network (?use=, ?v=).
- [ ] 15. Tests for the pure schedule helpers.
- [ ] 16. `npm run build`, `npm test`, final note.

## Notes

- 1: plan as above. Storage is a third placement room, 'store' (x is a slot), so a change of use can put misfits away without the pound.
- 2: `norm`, `isFitting`, `vary` (fitting/room/larger), `changeUse` (fates keep/historic/store) in src/schedule.ts; Schedule gains shell.rooms, shell.larger, stored. `Room` = Where | 'store'; net.ts Placement.room uses it.
- 3: src/library.ts is the seam: LIBRARY (props + STAND-IN fittings with B's stand-in keys), MATERIALS (stand-in for A), closest(). On merge swap in F's FITTINGS/helper and A's materials.
- 4: db/alters/3-schedule.sql: pieces (name pk = norm()'d), variations (kind addition|use, retrospective flag for D), placements room check widened to 'store'. Folded into tables.sql under its own heading.
- 5: logic.sql section before Realtime (after the cron reset): norm(), pieces policy, piece_item trigger (item named like a drawn piece goes up drawn), can_vary + variations policies, own queue the_commons_variations + drain_variations (5s cron), convene_variations (4am), realtime for variations. Unique index variations_open (one pending/committee per filing).
- 6-7: api/gary.ts section 'the schedule (slice C)' before deskDb: writeSchedule (Jev: shell/material/chief; scribe JSON; Jev odd+key per fitting; fallback = chief piece), drawPieces (pieces table, reuses item sprites), scheduleFor (catches; failure = unscheduled). Hooked into desk, convene, hearAppeal, sitAppeal; readLabel also reuses pieces. NOTE: gary.ts now imports src/library.ts + src/schedule.ts at runtime (first such import; verify on a Vercel preview).
- 8-10: section 'variations and changes of use (slice C)': variationOf (pure), ruleVariation, fileVariation (server, for D/E), addToSchedule (for D: ancillary/lawful), applyChangeOfUse (writeSchedule keeping shell, Jev fates, changeUse, store()), hearVariation, sitVariation (reuses sit()). desk routes variation / committee_variation.
- 11: net.ts section: Variation, loadVariations, fileVariation, fileChangeOfUse (E's entry), loadPieces.
