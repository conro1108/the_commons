# F. The library: progress

Branch `worktree-agent-acc722659ac2419b9`. Resume from the first unticked step.

- [x] 1. Read the design, slices and canon art; plan the API. Notes: a room cell = ZOOM (4 art px); floor sprites are exactly w*4 wide, bottom row = front edge of footprint; held things fit slot boxes.
- [x] 2. `src/content/fittings.ts` skeleton: types, shared colours, lookup + match helpers. Notes: shared letter->colour map `C`, per-piece `pal` overrides; `stretch()` widens art; `bestFitting()` scores shared words + head noun.
- [x] 3. Seating and tables.
- [x] 4. Storage: shelves, bookcase, cabinets, drawers, chests.
- [x] 5. Things that hold things (group "Racks"): racks, peg board, hooks, coat stand, trophy cabinet, display case. Held things in group "Held" so stock resolves.
- [x] 6. Underfoot: rugs, mats, tatami, doormat. Flat, no ink outline, drawn first.
- [ ] 7. Kitchen and shop: counter, stove, sink, fridge, vending machine, dresser, till.
- [ ] 8. Sleeping and washing: beds, bath, hot tub, screen.
- [ ] 9. Light and growing: lamps, plants, fireplace, wood stove.
- [ ] 10. Walls: chalkboard, cork board, mirror, picture, clock, shelves.
- [ ] 11. Odds: punching bag, gong, piano, easel, fish tank, etc.
- [ ] 12. More small held things (books, cups, kettle...).
- [ ] 13. Floors and wall finishes (tileable).
- [ ] 14. Register fittings as props (one line in props.ts) so placements draw; throws on a key collision.
- [x] 15. (done early, to judge as I go) `dev/library.html` + `dev/library.ts`: every piece on a floor/wall patch, footprint and slots marked; ?scale ?floor ?wall ?stock ?slots ?only ?group ?room.
- [ ] 16. Look at it by eye (headless Chrome screenshot via a /tmp script, vite on :5199) and fix what looks off.
- [ ] 17. test/fittings.test.ts (written early as the validator; the matching test fails until all pieces exist).
- [ ] 18. `npm run build`, `npm test`, final commit, note for B and C.
