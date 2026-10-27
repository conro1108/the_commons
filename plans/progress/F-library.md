# F. The library: progress

Branch `worktree-agent-acc722659ac2419b9`. Resume from the first unticked step.

- [x] 1. Read the design, slices and canon art; plan the API. Notes: a room cell = ZOOM (4 art px); floor sprites are exactly w*4 wide, bottom row = front edge of footprint; held things fit slot boxes.
- [x] 2. `src/content/fittings.ts` skeleton: types, shared colours, lookup + match helpers. Notes: shared letter->colour map `C`, per-piece `pal` overrides; `stretch()` widens art; `bestFitting()` scores shared words + head noun.
- [x] 3. Seating and tables.
- [x] 4. Storage: shelves, bookcase, cabinets, drawers, chests.
- [x] 5. Things that hold things (group "Racks"): racks, peg board, hooks, coat stand, trophy cabinet, display case. Held things in group "Held" so stock resolves.
- [x] 6. Underfoot: rugs, mats, tatami, doormat. Flat, no ink outline, drawn first.
- [x] 7. Kitchen and shop: counter, stove, sink, fridge, vending machine, dresser, till.
- [x] 8. Sleeping and washing: beds, bath, hot tub, screen.
- [x] 9. Light and growing: lamps, plants, fireplace, wood stove.
- [x] 10. Walls: chalkboard, cork board, mirror, picture, clock, shelves.
- [x] 11. Odds: punching bag, gong, piano, easel, fish tank, etc.
- [x] 12. More small held things (books, cups, kettle...).
- [x] 13. Floors and wall finishes (tileable). Notes: 10 floors, 9 walls (plaster, whitewash, stripes, floral get a wood skirt); FLAGS rows shared by flagstones and stonework.
- [x] 13b. Matched slice B's shape (coordinator's note): `small` (= held), `flat` (Underfoot), `lamp`, `vary` (palette overrides per slot, cycled), `slotAt()` turns a slot box into [centre x, bottom y]. Slots themselves stay boxes (size + hang); see final note.
- [x] 14. Register fittings as props (one line in props.ts) so placements draw; throws on a key collision. Notes: props.ts imports FITTINGS and merges after a collision check; props.footprint() is wrong for fittings (uses sprite height), use f.w/f.d.
- [x] 15. (done early, to judge as I go) `dev/library.html` + `dev/library.ts`: every piece on a floor/wall patch, footprint and slots marked; ?scale ?floor ?wall ?stock ?slots ?only ?group ?room.
- [x] 16. Look at it by eye (headless Chrome screenshot via a /tmp script, vite on :5199) and fix what looks off. Fixed: quieter boards and parquet, bigger quarry tiles, softer checker, clock rim, dev card room for hung things.
- [x] 17. test/fittings.test.ts (written early as the validator; the matching test fails until all pieces exist). Passes: keys, art, slots, stock fits, and the design's schedule lines match.
- [x] 18. `npm run build`, `npm test`, final commit, note for B and C. Also: any preposition now ends the head phrase ("a trophy from the kata" -> trophy); "register" left only on till. Done.
