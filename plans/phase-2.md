# Phase 2 — Build it

Live checklist; update as work lands so a fresh session can resume from here.
Scope: place props on your granted plot, free and uncapped. Fundamentals
first; taste and style are expected to take most of the later effort.

## Decisions
- **Focus view.** "Build here" (yours) / "Look closer" (anyone's granted plot)
  swaps the canvas to that one plot, big. Esc or "Back to the commons" returns.
- **Cells.** A plot is PLOT_W×PLOT_H cells (24×18); each cell is ZOOM=4 pixels
  up close. Props anchor top-left on a cell, art at 1:1 in build space.
- **Miniature.** On the map, a built plot is its build shrunk to one pixel per
  cell, commonest colour per block (outline ink loses ties). Empty plots keep
  the default flowers.
- **Content isn't canon-locked.** `src/content/props.ts` merges canon props
  with the Commons' own (bench, flag). `placements.prop` is free text checked
  only for shape, so new art is a client-only change; never rename a placed one.
- `placements`: one anchor per cell per plot (unique), insert only on your
  approved/conditional plot, delete your own; public select; Realtime.

## Checklist
- [x] `placements` table + RLS, pushed
- [x] Prop registry (canon + commons), focus view, palette, place/take down
- [x] Map miniature; realtime placements
- [x] Checked in browser: claim → approved → build → miniature on map
- [x] Review (hash-out): 3 fixed (proto-name crash, paging order, failed take-down), startup gap accepted

## Later (taste)
Ground tiles (paths, soil, water), drag to move, a zoom transition, more
Commons-original props, conditions that check what you built.
