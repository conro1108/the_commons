# Phase 3 — Give it some life

Live checklist; update as work lands so a fresh session can resume from here.
Scope: the sidebar goes; the commons explains itself in-world, and has things
living in it.

## Decisions
- **No sidebar.** The canvas fills the window. Information is paper you find
  in the world: cards that pop up by the thing you clicked, ink-bordered with a
  hard shadow, a degree or two crooked. A small corner tag holds the title,
  who's here, and your plots.
- **Plots.** Granted plots have their permit pinned to a post by the gate.
  Clicking a plot (or its post) opens its card: the permit, or a claim form on
  an empty plot, or "In Gary's in-tray". Double-click still walks in.
- **Notice board.** A fixture in the bottom border, left of the pond. Click it
  and you walk over; on arrival a cork board opens with recent rulings pinned
  up, each a little crooked with a pin in the filer's colour. Click a notice to
  read the whole exchange.
- **Your mail.** When Gary's letter opens over your plot, the permit card pops
  open there too. That replaces the "your latest filing" panel.
- **Up close.** A card top-left (plot, holder, intent, condition), a back
  button, and for your own plot a paper toolbar along the bottom.
- **Life** (`src/life.ts`). Gary walks the paths with a clipboard, lingering at
  the newest plots; click him for a deadpan line. A goose on the paths, ducks
  by the pond, butterflies, pond ripples, leaves drifting off the border trees.
  Driven by `Date.now()` so every resident sees the same Gary in the same
  place, without any server. Gary will do real things later; for now he's
  just around.
- Name tags over residents on hover.

## Checklist
- [x] `src/life.ts`: Gary, goose, ducks, butterflies, ripples, leaves
- [x] Layout: full-window canvas, corner tag, paper card component
- [x] Plot cards (permit / claim form / pending), permit posts drawn at gates
- [x] Notice board fixture + cork board overlay + notice detail
- [x] Letter opening pops your permit card
- [x] Focus view: info card, back button, bottom toolbar
- [x] Gary's speech bubble, name tags on hover
- [x] Checked in browser (map, claim card, permit card, board + reading, Gary, close-up + toolbar).
      Not yet seen live: a reply card popping when your own letter opens.
