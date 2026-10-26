# Slice A, Outside: progress

Resume from the first unticked step. Notes say what was decided and touched.

- [x] 1. Read the design, slices, CLAUDE.md; plan. No new columns needed (filings.shell exists), so no db/alters file unless that changes.
- [ ] 2. `src/shell.ts`: materials, paints, what the schedule allows (null schedule = building, default timber; 'none' = no tool), footprint checks, door side from the gate, default windows.
- [ ] 3. `src/shell.ts`: draw a building up close: material walls, roof by proportion (gable E-W, gable N-S, hipped), door, windows, sign with a pixel font, porch for side/back doors.
- [ ] 4. `src/shell.ts`: draw an enclosure (fence ring with a gate) and the map miniature of both.
- [ ] 5. `src/closeup.ts`: shell in the back-to-front sort, footprint ghost, props kept off a building, mini cache keyed on the shell.
- [ ] 6. `dev/plot.html`: ?shell= (and ?material=, ?paint=, ?sign=, ?kind=) with no network.
- [ ] 7. `src/net.ts`: saveShell section.
- [ ] 8. `db/logic.sql`: own section: grant update (shell), trigger (holder can't set sign_ok; sign change resets it, reuses a known ruling, enqueues; shell counts as building); drain_gary hook for 'sign'.
- [ ] 9. `api/gary.ts`: readSign + desk hook.
- [ ] 10. `src/main.ts`: own section: shell tool (drag footprint, material/paint, sign, windows, take down), sign label overlay.
- [ ] 11. Look at it (dev page screenshots), tune the art.
- [ ] 12. `npm run build`, `npm test`, final note.
