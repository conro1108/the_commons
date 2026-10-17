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

## Taste pass (first) — done
- [x] Ground painting: grass/path/stone/soil/water/wildflowers, autotiled edges
      (`src/content/ground.ts`); `filings.ground`, 432 chars, holder-updatable
      column (Postgres regex caps `{n}` at 255, hence the length check). Shown
      in the miniature; grass stays clear so the map's tufts show through.
      The holder's own paint is authoritative for the session: stale save
      echoes used to clobber later strokes.
- [x] Move tool (drag), halo on hover for move / take down (with a pixel's
      grace for thin props), drop-in with a puff of dust when anything lands
- [x] Zoom map <-> plot: whole-number zoom steps toward where the close-up puts
      the plot, then the close-up fades in. The canvas fills #field and both
      views are fitted inside it.
- [x] 19 Commons props (goose, duck, weathervane, plaque, signpost,
      noticeboard, postbox, lamppost, bin, sundial, birdbath, beehive, gnome,
      sunflower, hedge, rock, well, shed, plus bench/flag); palette in groups
- [x] Conditions in words (`src/conditions.ts`, mirrors api/gary.ts) and
      checked against the build: Met / Outstanding, no deadline; props that
      would answer one are marked in the palette
- [x] Gate in every fence; a plot sign in a 3x5 clerk's hand up close
- [x] Browser check (own plot, visitor), commit, push

## Later (taste)
Tune by playing: prop sizes relative to each other, brush size (2x2 now),
more ground kinds, undo, avatars visiting a plot, sounds.
