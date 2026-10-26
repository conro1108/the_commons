# Building and enforcement: the slices

How `building-and-enforcement.md` is being built: six slices in parallel on
top of a shared foundation, merged back one at a time. The visitors (the
design's last section) are out of scope.

## The foundation (already on main)

- `src/schedule.ts`: `Schedule`, `Fitting`, `Shell`, `scheduled()`. Extend
  it, don't fork it.
- `filings.schedule` (Gary's) and `filings.shell` (the holder's), jsonb.
- `placements.room` ('out' | 'in'), `placements.parent` (in or on another
  thing; x is the slot), `placements.impounded_at` (in the pound). The
  uniqueness is now `(filing, room, parent, x, y)` among things not impounded.
- Already applied to the live database (`db/alters/0-foundation.sql`).

Filings granted before this have `schedule: null` and are held to nothing:
`scheduled()` says yes to everything on them. Don't break their plots.

## Rules for every slice

- Work in your worktree, commit there. **Don't push, don't run
  `db:push`, don't touch the live database.** Merging and applying is done
  centrally.
- New tables or columns: a hand-run file `db/alters/<n>-<slice>.sql`, and the
  same folded into `db/tables.sql` under its own heading, RLS on. Policies,
  triggers, queue and cron go in `db/logic.sql`, in a section of your own,
  and must survive running twice.
- In the shared hotspots (`src/main.ts`, `api/gary.ts`, `db/logic.sql`,
  `src/net.ts`), add your own `// ---` section rather than threading changes
  through others', so merges stay mechanical. Small hooks into existing code
  are fine; keep them small.
- New Gary prose follows the existing pattern: the decision model (Jev) rules
  from enums, the scribe writes, checked before it goes out, results stored
  not regenerated.
- Make it visible without the network: a `dev/*.html` page or a query param
  on an existing one.
- `npm run build` and `npm test` pass. Tests only for flows that would
  visibly break (see ~/projects/CLAUDE.md); most slices earn none.
- Finish with a short note: what's done, what you stubbed, any schema you
  added, and anything another slice needs to know.

## The slices

| Slice | Owns | Leans on |
|---|---|---|
| **A. Outside**: drag a shell's footprint, walls, a roof that fits, door to the path, sign over it, material and paint, windows; drawn up close and on the map miniature. Enclosures (a pen) and no shell too. | `src/shell.ts` (new), `src/closeup.ts`, `src/render.ts`, saving `filings.shell` (policy + `net.ts`), reading the sign (reuse how item labels are read) | Schedule's `shell.kind`/`material` |
| **B. Inside**: through the door into the room, sized off the footprint generously; laying out fittings on floor and walls; light from the windows; things in things (racks, boards, cabinets with visible slots). | `src/interior.ts` (new), `dev/room.html`, the placement policies for `room`/`parent` | A's `Shell` (fake one in dev); F's fittings |
| **C. Gary's schedule**: writing the schedule on a grant (library piece where close, else he draws it once into a shared store); the permit card shows it; variations (small ones same day, material ones to committee); change of use (shell kept, schedule rewritten, misfits to storage or historic). | `api/gary.ts` (grant, variations), variations table + queue, the permit/variation UI in `main.ts` | F's fitting keys (`FITTINGS` list) |
| **D. The letter**: his rounds against the schedule, in and out; asking on the spot or a questionnaire on the door; explained → ancillary, not → red tag with a date on the map; the pound at the hut and getting things back; a Certificate of Lawfulness after a week unflagged; retrospective permission dearer. | tags table, the round in `api/gary.ts` + cron, tag/questionnaire/pound UI, red tags in `render.ts`/`closeup.ts` | `scheduled()`, C's variation filing for "file for it" |
| **E. The spirit**: the open sign; the what's-on board (holder's notices, read for fitness); the visitors' book; Gary's reading of the use, shown under the permit; drift → notice (put it back or file a change of use); disuse → boarded up, intact, and a week's notice if someone else files. | notices/visits/readings tables, the reading in `api/gary.ts` + cron, the board/book/sign UI | C's change of use |
| **F. The library**: the hand-drawn fittings (aim for 60+ to start: shelves, tables, racks, rugs, lamps, mats, counters...), which hold others and where their slots are, floors and wall finishes for interiors. Matches the look of `src/content/canon`. | `src/content/fittings.ts` (new), a library page in `dev/` | nothing |
