# D. The letter: progress

Slice D of plans/building-and-enforcement-slices.md. Resume from the first unticked step.

- [x] 1. Read the design, slices, CLAUDE.md, and the code (gary.ts audit, logic.sql cron, main.ts presence, closeup/render).
- [ ] 2. Schema: `db/alters/4-letter.sql` (tags table), folded into `db/tables.sql`.
- [ ] 3. `db/logic.sql` section: tag policies, answer trigger -> desk, `on_schedule()`, `add_fitting()`, `reclaim()`, `send_rounds()` (daily), `keep_tags()` (hourly: lawful, overdue, unanswered), cron.
- [ ] 4. `src/letter.ts`: Tag type, open/overdue helpers, question wording, red tag + questionnaire pixel art, card HTML.
- [ ] 5. `api/gary.ts` section: the round (`{ letter: filing }`) asks about unscheduled things.
- [ ] 6. `api/gary.ts`: ruling on an answer (`{ tag: id }`): Jev (ancillary/incidental/separate/evasive, generous), scribe reply, checked, stored; ancillary -> schedule.
- [ ] 7. Retrospective permission stub (C's call site), client and server.
- [ ] 8. `src/net.ts` section: loadTags, answerTag, reclaim, fileRetrospective (stub).
- [ ] 9. Render hooks: red tags on the map (`render.ts`), on things up close and questionnaire on the door (`closeup.ts`); impounded things not drawn.
- [ ] 10. `src/main.ts` section: tags state + realtime, "Gary's here" when present, questionnaire on the door, red tag card, the pound at the hut.
- [ ] 11. Dev: `dev/letter.html` (cards, no network), `?letter=1` on dev/plot and dev/map.
- [ ] 12. Test: decision -> outcome (explained/tagged) if cheap; else none.
- [ ] 13. `npm run build` + `npm test` pass; CLAUDE.md map row; final commit.

## Notes

- Step 1: the audit stays (see step 5 note for why). Round is its own cron.
