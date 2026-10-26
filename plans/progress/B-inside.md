# B. Inside: progress

Slice B of `plans/building-and-enforcement-slices.md`. Resume from the first unticked step.

- [x] 1. Progress file. Read the design, slices, foundation (`src/schedule.ts`, `db/alters/0-foundation.sql`).
- [x] 2. Fittings stand-in behind one seam (`src/interior-fittings.ts`, read only through `fitting()` in interior.ts).
- [x] 3. `src/interior.ts` geometry: room size off the shell, wall rows, cells to art, doors in and out.
- [x] 4. Drawing the room: floor, back and side walls, front lip, windows, door.
- [x] 5. Things in the room, and things in things (slots), with hit tests.
- [x] 6. Light: window pools by hour, time-of-day grade, lamps after dark.
- [x] 7. `dev/room.html`: fake shell, fittings, held things; ?w ?h ?hour ?door ?windows ?material ?scale.
- [x] 8. Look at it (screenshot) and tune.
- [ ] 9. `db/logic.sql`: own section, `room_size()`/`placeable()`; placement policies and grants take room/parent.
- [ ] 10. `src/net.ts`: own section, placeInside / moveInside.
- [ ] 11. `src/main.ts` hooks: regroup keeps inside things off the plot, frame draws the room, handlers step aside.
- [ ] 12. `src/main.ts` own section: going in (door click, button) and out (door, button, Escape, wheel); visitors read-only.
- [ ] 13. `src/main.ts`: laying out inside: place, move, take down, put in slots.
- [ ] 14. `npm run build`, `npm test`.
- [ ] 15. Final notes below, commit.

## Notes
- Step 2: stand-in is src/interior-fittings.ts (18 pieces). RoomFitting = PropDef + on floor|wall, flat, slots [cx, bottom y], small, lamp, vary. Delete on merge with F.
- Steps 3-6: src/interior.ts. Room = min(44, max(8, 2w)) x min(32, max(6, 2h) + WALL), WALL = 5 rows of back wall at the top of the grid. Cutaway: PAD art px of wall top round it, door/windows sit in it ('n' ones on the back wall face). doorOutside() is the seam to A (middle of the door side). Anchors are top-left cells; wall things must sit in rows < WALL, floor things' foot on the floor. No overlap check (outdoors has none either).
- Step 7: dev/room.html with knobs for hour/w/h; ?door ?windows ?material ?paint ?scale ?bare.
- Step 8: screenshots via `npx playwright@1.61 screenshot` (matches the cached chromium) against `npx vite --port 5291`. Lighter timber walls; lamp glow clipped to the room and smaller.
