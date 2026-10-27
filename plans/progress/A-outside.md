# Slice A, Outside: progress

Resume from the first unticked step. Notes say what was decided and touched.

- [x] 1. Read the design, slices, CLAUDE.md; plan. No new columns needed (filings.shell exists), so no db/alters file unless that changes.
- [x] 2. `src/shell.ts`: materials, paints, what the schedule allows (null schedule = building, default timber; 'none' = no tool), footprint checks, door side from the gate, default windows. Added optional `kind` to `Shell` in schedule.ts (missing = building).
- [x] 3. `src/shell.ts`: draw a building up close: material walls, roof by proportion (gable E-W, gable N-S, hipped), door, windows, sign with a 3x5 font (two lines, else a squiggle), a built-out porch for side doors, a peek of porch roof for back doors. Cached per shell+look.
- [x] 4. `src/shell.ts`: enclosure (fence ring, gate on the door side, gateposts, sign on a post) and `shellMini` for the map at a pixel per cell.
- [x] 5. `src/closeup.ts`: shell in the back-to-front sort; `scene.shell` draft override with footprint outline; `canPlace(..., shell)` keeps props out from under a roof; drawBuilt only draws room 'out', unparented, unimpounded placements; mini keyed on shell; lit windows after dark.
- [x] 6. `dev/plot.html`: ?shell=1 or x,y,w,h, ?kind, ?material, ?paint, ?sign, ?door, ?unread, ?all=1 (every material), ?mini=1. Looked at it via playwright screenshots (/tmp, not committed).
- [x] 7. `src/net.ts`: saveShell section (own `// ---` at the end).
- [x] 8. `db/logic.sql`: own section: grant update (shell), trigger (holder can't set sign_ok; sign change resets it, reuses a known ruling, enqueues; shell counts as building); drain_gary hook for 'sign'. Done: section "The shell (slice A)" before Realtime; trigger enqueues itself (no after trigger); sign_read() for Gary. No new columns, so no db/alters file. SQL not run anywhere (no local postgres).
- [x] 9. `api/gary.ts`: readSign section + one-line desk hook; writes via `the_commons.sign_read` rpc (service role only) so it never clobbers a newer shell.
- [x] 10. `src/main.ts`: section "up close: the shell (slice A)" plus small hooks (imports, HINTS, renderTools, renderPalette adds a Building group last, focusScene, pointer down/move/up, canPlace gets the shell, upsert keeps an in-flight save over echoes, leaveFocus). Tools: build/pen (drag out; drag the shell to move it), windows (click the front wall), door (turns it), take down, material (unless the schedule fixes one), paint, sign form with a status line. No floating DOM label: the sign is lettered in pixels. `materialSwatch` added to shell.ts. Not exercised against the live db.
- [ ] 11. Look at it (dev page screenshots), tune the art.
- [ ] 12. `npm run build`, `npm test`, final note.
