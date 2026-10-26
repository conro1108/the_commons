# B. Inside: progress

Slice B of `plans/building-and-enforcement-slices.md`. Resume from the first unticked step.

- [x] 1. Progress file. Read the design, slices, foundation (`src/schedule.ts`, `db/alters/0-foundation.sql`).
- [ ] 2. Fittings stand-in behind one seam (`src/interior-fittings.ts`, read only through `fitting()` in interior.ts).
- [ ] 3. `src/interior.ts` geometry: room size off the shell, wall rows, cells to art, doors in and out.
- [ ] 4. Drawing the room: floor, back and side walls, front lip, windows, door.
- [ ] 5. Things in the room, and things in things (slots), with hit tests.
- [ ] 6. Light: window pools by hour, time-of-day grade, lamps after dark.
- [ ] 7. `dev/room.html`: fake shell, fittings, held things; ?w ?h ?hour ?door ?windows ?material ?scale.
- [ ] 8. Look at it (screenshot) and tune.
- [ ] 9. `db/logic.sql`: own section, `room_size()`/`placeable()`; placement policies and grants take room/parent.
- [ ] 10. `src/net.ts`: own section, placeInside / moveInside.
- [ ] 11. `src/main.ts` hooks: regroup keeps inside things off the plot, frame draws the room, handlers step aside.
- [ ] 12. `src/main.ts` own section: going in (door click, button) and out (door, button, Escape, wheel); visitors read-only.
- [ ] 13. `src/main.ts`: laying out inside: place, move, take down, put in slots.
- [ ] 14. `npm run build`, `npm test`.
- [ ] 15. Final notes below, commit.

## Notes
