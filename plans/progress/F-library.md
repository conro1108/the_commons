# F. The library: progress

Branch `worktree-agent-acc722659ac2419b9`. Resume from the first unticked step.

- [x] 1. Read the design, slices and canon art; plan the API. Notes: a room cell = ZOOM (4 art px); floor sprites are exactly w*4 wide, bottom row = front edge of footprint; held things fit slot boxes.
- [ ] 2. `src/content/fittings.ts` skeleton: types, shared colours, lookup + match helpers, collision-free keys.
- [ ] 3. Seating and tables.
- [ ] 4. Storage: shelves, bookcase, cabinets, drawers, chests.
- [ ] 5. Things that hold things: racks, peg board, hooks, coat stand, trophy cabinet, display case.
- [ ] 6. Soft floor pieces: rugs, mats, tatami, cushions, doormat.
- [ ] 7. Kitchen and shop: counter, stove, sink, fridge, vending machine, dresser, till.
- [ ] 8. Sleeping and washing: beds, bath, hot tub, wardrobe, screen.
- [ ] 9. Light and growing: lamps, plants, fireplace, wood stove.
- [ ] 10. Walls: chalkboard, cork board, mirror, picture, clock, shelves.
- [ ] 11. Odds: punching bag, gong, piano, barrel, crate, easel, workbench, fish tank, etc.
- [ ] 12. Small held things (swords, belts, trophies, books, cups, kettle...).
- [ ] 13. Floors and wall finishes (tileable).
- [ ] 14. Register fittings as props (one line in props.ts) so placements draw.
- [ ] 15. `dev/library.html`: every piece on a floor/wall patch, footprint and slots marked, ?scale ?floor ?wall ?stock.
- [ ] 16. Look at it by eye (headless Chrome screenshot) and fix what looks off.
- [ ] 17. Test: keys valid and unique, art well-formed, slots in bounds, design's examples match.
- [ ] 18. `npm run build`, `npm test`, final commit, note for B and C.
