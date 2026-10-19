# Phase 4 — Somewhere, not a grid

Live checklist; update as work lands so a fresh session can resume from here.

The commons stops being an 8×5 grid of identical rectangles. It becomes a
small, composed landscape with five kinds of ground, and plots of different
sizes and shapes cut out of it by paths, a stream, a slope and a wood. Where a
plot is, how big, what shape, and what climate it has all feed Gary's
application → decision → condition → inspection loop.

Smaller and crisper than the_farm: one fixed, hand-composed map, not an
unbounded world. Not a copy of it either — take the idea (regions you can
name and navigate by), not the code or the look.

## Tech stack: stays Canvas 2D

Considered PixiJS/WebGL. Not worth it: the map is 384×240 art pixels at a whole
scale, all the effects wanted (multiply-blended shadows, a day/night grade,
additive lamp glow, animated water) are a `globalCompositeOperation` away, and
the art is code already. Taste is the bottleneck, not the renderer.

## Art direction

This should look like a professionally art-directed pixel game, not a
programmer's map. Concretely:

- **One light.** Sun from the upper left. Everything that stands casts a short
  shadow down and to the right, the same colour everywhere (a cool purple-grey,
  multiplied, never black). Cliff faces and south slopes are the shaded side.
- **Hue-shifted ramps.** Each material has a 3–5 step ramp; shadows shift cool
  (toward blue/purple), highlights warm (toward yellow). No pure greys, no
  pure black, no saturated primaries. Ink `#402e3a` (canon `K`) stays the outline
  colour for *objects*; terrain is never outlined — its edges are value
  changes (a lit lip on a bank, a dark rim round water).
- **Each region reads at a glance** by palette and texture, not by a border:
  the Green bright and mown (stripes), the Knoll cooler and grey-green with
  heather and stone breaking through, the Wet End deep blue-green with reeds
  and standing water, the Shaw dark and mossy with dappled light and leaf
  litter, the Warm Bank yellow-green and sandy. Borders between regions are
  dithered and wander; there is never a straight seam.
- **Elevation.** The Knoll is two or three terraces with short cliff faces
  (lit lip, shaded face, a few stones at the foot); paths climb it by steps.
  The Warm Bank is a slope, shown by shading, not cliffs.
- **Composition.** The map is framed, not boxed: wood thickens along the north
  and east edges, the stream enters from the north and S-curves down the west
  into the pond, fields and hedgerows suggest country beyond the south edge.
  The pond and the Green are the focal point. Nothing is laid out on a ruler.
- **Paths are worn, not drawn.** Soft-edged dirt, lighter where most walked,
  grass encroaching at the margins, the odd pebble; stepping stones in the
  Wet End, a plank footbridge over the stream, steps up the Knoll.
- **Motion is ambient and slow.** Water glints, reeds and grass sway in the
  wind on the Knoll, leaves fall in the Shaw, bees on the Bank, ducks on the
  pond. Nothing flickers: noise is seeded by position, never re-rolled per frame.
- **Time of day** follows the resident's own clock: warm low light at
  morning and evening, a blue night with lit windows and lamps glowing.
  Done as a grade over the finished frame (multiply + a little additive), so
  every sprite gets it for free. A `?hour=` param on the dev previews.
- **Pixels stay square.** Whole-number scale only, `fillRect`/`drawImage` at
  integer positions, no anti-aliased paths, no gradients on art, no
  non-integer `ctx.scale()`/`ctx.rotate()` on sprites.

## The map (src/world)

384×240 map art pixels; one map pixel is one build cell; a build cell is 4×4
art pixels up close (`ZOOM = 4`). Rough composition, to be refined by eye:

- **The Knoll** — north and north-west, raised in terraces, a stony crown with
  a cairn at the top. Drystone walls. Exposed to the westerly.
- **The Wet End** — the west, either side of the lower stream and the pond's
  western margin. Reeds, boggy ground, hurdle fences, stepping stones.
- **The Green** — the centre, touching the pond's north-east shore. Mown
  lawn, the notice board, a bench, **Gary's hut** (his office: letters fly to
  and from it), the main crossing of paths.
- **The Shaw** — the east: deep wood along the edge (no plots in it), plots in
  clearings at its margin. **The Old Oak** stands here, big, its canopy over
  the plots beside it.
- **The Warm Bank** — the south-east, a sandy slope falling to the south.

**Plots:** 22–26, numbered 1..N (never renumber once live). Sizes vary a lot —
the smallest about 100 cells, the largest about 1000, bounding box at most
44×32. Shapes are cut by what's around them: wedges where paths fork, a long
strip along the stream with one curved side, an L round a boulder field, a
trapezoid on the slope. Not rectangles, not Voronoi soup. Each has a name a
clerk would give it ("the Wedge", "Long Strip", "Sluice Corner", "the
Nook"), a region, a few site features (fixed: a boulder, a stump, a spring,
molehills, an old post, oak roots, a puddle that never dries), and a gate on
a path. Neighbours are plots that share a boundary, not grid adjacency.

**Baked, not generated at runtime.** `npm run world` runs `scripts/world.ts`,
which composes the map and writes `src/world/plots.json` (a `World`: regions +
plots with masks, gates, features, edges, neighbours, particulars) and
whatever terrain data the client needs. Everything else reads the baked
files, so client, server and database agree to the cell. The script is the
only place generation logic lives; tweak it and rerun.

### Contract

`src/world/types.ts` (types) and `src/world/regions.ts` (region content) are
written; don't change their shape without updating every user. The client
module `src/world/index.ts` (pure, no DOM) exports:

```ts
MAP_W, MAP_H, ZOOM
REGIONS                       // re-exported
PLOTS: PlotDef[]; plotById(id): PlotDef | undefined
plotAt(px, py): PlotDef | null           // map art px; null on path, water, wood…
inPlot(p, cx, cy): boolean               // plot-local cell
terrainAt(x, y): Terrain                 // map px; a small string union the script defines
regionAt(x, y): RegionId                 // everywhere, for colouring the ground
heightAt(x, y): number                   // terrace level, 0 = lowest
LANDMARKS                                // board, bench, office (Gary's hut), pond, oak, bridge, cairn, spawn: rects/points in map px
route(from: Point, to: Point): Point[]   // along the paths; ends included
walkable(x, y): boolean                  // for arrow-key walking
plotLabel(p): string                     // "Plot 7, the Wedge"
```

`api/` reads `src/world/plots.json` with `import … with { type: "json" }` and
types via `import type` from `src/world/types.ts` — never a value import from
`src/`, which Node's test runner and Vercel would each resolve differently.

## The loop, reworked (api/gary.ts, db/schema.sql)

- **Data.** `filings.plot smallint references the_commons.plots` replaces
  `plot_x`/`plot_y`. A `the_commons.plots` table (id, region, w, h, mask) is a
  generated block in `db/schema.sql`, written from `plots.json` by
  `npm run world:sql`; a test fails if it's stale. RLS uses it: a placement's
  anchor must be inside the mask; `ground` must be `w*h` long. `bylaw = 0`
  means denied under the region's covenant.
- **Filing.** Gary's decision state carries the plot: name, region, area,
  particulars, covenant. One more ruling choice: denied under the covenant.
  A new question, **fit**: does the intent suit this plot — `fits`, `cramped`
  (too big or ambitious for its area), `against the grain` (wrong for its
  climate: a sunbed in the Shaw, a paper lantern on the Knoll). Code applies
  it: an approval that doesn't fit becomes conditional, and the condition
  writer is told why. A permit's prose may remark on the site.
- **Conditions** are written for the plot as well as the intent: they may ask
  for things by side ("a hedge along its west side, against the wind"), by
  feature ("beside the spring"), or by ground — anything an inspection can
  see. Each region's stock condition is the fallback for filings there.
- **Inspections and audits** get the plot's shape (rows of the mask, with
  ground), its features as things already there, and what lies along each
  side, so "west side", "by the stump" and "the corner nearest the pond" are
  judgeable. Neighbours come from `PlotDef.neighbours`.
- **Committee** members hear the particulars and the covenant too.
- **Precedent** prefers filings on the same kind of ground ("cf. Filing 0041,
  also on the Knoll").

## The game, reworked (src/)

- **Map** (`src/render.ts`, `src/life.ts`): the composed terrain baked once to
  a background canvas; plots drawn on it by state — unclaimed as surveyed
  ground (pegs and a line of twine round the mask, its features showing),
  pending as pegs plus Gary's notice, granted with its region's boundary
  drawn round the mask (picket, drystone, hurdle, hedge, rail) with the door
  gap, the holder's pennant and the permit on the gatepost, and the build in
  miniature. Gary walks the paths from his hut via `route()`; ambient life is
  per region; day/night grade.
- **Close-up** (`src/closeup.ts`, `src/content/ground.ts`): the real shape.
  Cells outside the mask show what's really there at build scale (path,
  stream, the neighbour's boundary) and can't be built or painted on; the
  boundary in its region's style with a gap at `door`; the plot's
  unpainted ground is its region's native ground (`.`), not one green;
  features drawn and blocking; a plot sign that can write any plot number.
- **Papers** (`src/main.ts`, `index.html`): the claim card becomes the plot's
  *particulars* — name, region, area, its outline drawn small, the
  particulars, the covenant — set like a land-registry schedule. Permit cards
  and the board say "Plot 7, the Wedge". Walking routes along paths.

### Interfaces between the map, the close-up and main.ts

```ts
// src/render.ts
interface Scene { held: Map<number, Filing>; built: Map<number, Placement[]>; me: string;
  hover: number | null; selected: number | null;   // plot ids
  walkers: Walker[]; look(id): Avatar; letters: Letter[]; t: number; recent: number[] }
interface Letter { plot: number; out: boolean; status?; filing?; start? }
draw(ctx, scene); letterPhase(l, now); colourOf(id); FLIGHT; VOID  // VOID: fill colour outside the map
// src/closeup.ts
interface FocusScene { plot: PlotDef; filing: Filing; built: Placement[]; mine: boolean;
  ghost: Placement | null; brush: Cells | null; hover: { p: Placement; colour: string } | null }
mini(plot: PlotDef, f: Filing | null, ps: Placement[]): HTMLCanvasElement  // w×h, clear outside the mask
drawFocus(ctx, scene, now); focusSize(plot): { w, h }; FOCUS_PAD; placementAt(ps, bx, by); land(id)
canPlace(plot, prop, x, y): boolean   // footprint inside the mask and off the features
SURROUND                              // fill colour round the close-up
```

## Checklist
- [ ] World: `scripts/world.ts`, `plots.json`, `src/world/index.ts`, dev preview, a test or two
- [ ] Desk: schema + generated plots block, gary.ts site-aware, backoffice, tests
- [ ] Map: terrain art, plot states, boundaries, life on routes, day/night
- [ ] Close-up + papers: masked build view, native ground, features, particulars card, routes
- [ ] Integrated, checked in the browser (claim → ruling → build → map), pushed
- [ ] Review (negotiate)
