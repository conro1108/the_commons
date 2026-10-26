# D. The letter: progress

Slice D of plans/building-and-enforcement-slices.md. Resume from the first unticked step.

- [x] 1. Read the design, slices, CLAUDE.md, and the code (gary.ts audit, logic.sql cron, main.ts presence, closeup/render).
- [x] 2. Schema: `db/alters/4-letter.sql` (tags table), folded into `db/tables.sql`.
- [x] 3. `db/logic.sql` section: tag policies, answer trigger -> desk, `on_schedule()`, `add_fitting()`, `reclaim()`, `send_rounds()` (daily), `keep_tags()` (hourly: lawful, overdue, unanswered), cron.
- [x] 4. `src/letter.ts`: Tag type, open/overdue helpers, question wording, red tag + questionnaire pixel art, card HTML.
- [x] 5. `api/gary.ts` section: the round (`{ letter: filing }`) asks about unscheduled things.
- [x] 6. `api/gary.ts`: ruling on an answer (`{ tag: id }`): Jev (ancillary/incidental/separate/evasive, generous), scribe reply, checked, stored; ancillary -> schedule.
- [ ] 7. Retrospective permission stub (C's call site), client and server. (server half done: `retrospective()` in gary.ts, unwired, 501)
- [ ] 8. `src/net.ts` section: loadTags, answerTag, reclaim, fileRetrospective (stub).
- [ ] 9. Render hooks: red tags on the map (`render.ts`), on things up close and questionnaire on the door (`closeup.ts`); impounded things not drawn.
- [ ] 10. `src/main.ts` section: tags state + realtime, "Gary's here" when present, questionnaire on the door, red tag card, the pound at the hut.
- [ ] 11. Dev: `dev/letter.html` (cards, no network), `?letter=1` on dev/plot and dev/map.
- [ ] 12. Test: decision -> outcome (explained/tagged) if cheap; else none.
- [ ] 13. `npm run build` + `npm test` pass; CLAUDE.md map row; final commit.

## Notes

- Step 1: the audit stays (see step 5 note for why). Round is its own cron.
- Steps 2-3: `tags` table (status machine in the db/tables.sql comment). SQL in its own `-- --- the letter` section of logic.sql. Crons: `the_commons_rounds` every 3h (2 plots, latest built first: missing plots is how things get lawful), `the_commons_tags` hourly (no models). Answer trigger posts `{tag}` to the desk directly via `letter_post()` (didn't touch drain_gary). `summon_rounds()` RPC for double-clicking Gary. Not validated against a real Postgres (no local psql).
- Steps 5-6: gary.ts section `// --- the letter` before deskDb; desk routes { letter } -> round(), { tag } -> answered(). Questions are a form of words (questionFor), one per kind of thing, 4 a visit. Ruling: Jev picks ancillary/incidental/separate/unexplained; explainedBy() counts it explained if P(ancillary)+P(incidental) >= 0.35 (generous); reply via the existing note() writer+checker. Explained -> add_fitting rpc, how 'ancillary'. Unfit answers are nulled on the tag, kept in record.
