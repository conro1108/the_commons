import { BUILDABLE, propCanvas, propSize } from "./content/props.ts";
import { BUILD_H, BUILD_W, MAP_H, MAP_W, MARGIN, PATH, PLOT_H, PLOT_W, ZOOM, plotAt, plotName, plotOrigin, type Plot } from "./layout.ts";
import {
  HELD, fileClaim, handlesFor, loadFilings, loadPlacements, place, signIn, supabase, unplace,
  type Filing, type Placement,
} from "./net.ts";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { FOCUS_H, FOCUS_PAD, FOCUS_W, draw, drawFocus, placementAt, plotKey, type Ghost, type Walker } from "./render.ts";

const SPEED = 40; // art pixels per second

const STAMP: Record<Filing["status"], string> = {
  pending: "In Gary's in-tray",
  approved: "Approved",
  conditional: "Approved with conditions",
  committee: "Referred to committee",
  denied: "Denied",
  lost: "Lost in the post",
};

interface Mover extends Walker {
  tx: number;
  ty: number;
}

const canvas = document.querySelector("canvas")!;
const ctx = canvas.getContext("2d")!;
const $ = (id: string) => document.getElementById(id)!;
const form = $("claim") as HTMLFormElement;
const intent = form.querySelector("textarea")!;

const filings = new Map<number, Filing>();
const placements = new Map<number, Placement>();
const built = new Map<number, Placement[]>(); // filing -> its placements; replaced, never mutated, so minis can cache
const walkers = new Map<string, Mover>();
let handles = new Map<string, string>();
let me = "";
let hover: Plot | null = null;
let selected: Plot | null = null;
let scale = 1;
let focus: Filing | null = null; // the plot we're up close to, if any
let tool = BUILDABLE[0]; // a prop name, or REMOVE
let ghost: Ghost | null = null;
const REMOVE = "remove";

const pad = (n: number) => String(n).padStart(4, "0");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);
const who = (id: string) => (id === me ? "you" : (handles.get(id) ?? "a resident"));

function heldPlots() {
  const held = new Map<string, Filing>();
  for (const f of filings.values()) if (HELD.includes(f.status)) held.set(plotKey({ x: f.plot_x, y: f.plot_y }), f);
  return held;
}

const BUILT: Filing["status"][] = ["approved", "conditional"];

const myHeld = () => [...filings.values()].find((f) => f.filer === me && HELD.includes(f.status));

// --- panel ---------------------------------------------------------------

function ruling(f: Filing) {
  const extra = f.status === "denied" && f.bylaw ? ` (Bylaw ${f.bylaw})` : "";
  return `<p class="stamp ${f.status}">${STAMP[f.status]}${extra}</p>
    ${f.permit ? `<p class="permit">${esc(f.permit)}</p>` : ""}`;
}

function renderPlot() {
  const info = $("plot");
  form.hidden = true;
  if (!selected) {
    info.innerHTML = `<p class="hint">Click a plot to see who holds it, or an empty one to file a claim.</p>`;
    return;
  }
  const f = heldPlots().get(plotKey(selected));
  const title = `<h2>Plot ${plotName(selected)}</h2>`;
  if (f) {
    const enter = BUILT.includes(f.status)
      ? `<button id="enter">${f.filer === me ? "Build here" : "Look closer"}</button>`
      : "";
    info.innerHTML = `${title}<p>Held by ${esc(who(f.filer))}: <q>${esc(f.intent)}</q></p>${ruling(f)}
      <p class="meta">Filing ${pad(f.id)}</p>${enter}`;
    document.getElementById("enter")?.addEventListener("click", () => enterFocus(f));
    return;
  }
  const mine = myHeld();
  if (mine) {
    info.innerHTML = `${title}<p>Unclaimed. Residents may hold one plot; yours is ${plotName({ x: mine.plot_x, y: mine.plot_y })}.</p>`;
    return;
  }
  info.innerHTML = `${title}<p>Unclaimed. State your intent for this plot in one breath.</p>`;
  form.hidden = false;
}

function renderMine() {
  const latest = [...filings.values()].filter((f) => f.filer === me).sort((a, b) => b.id - a.id)[0];
  $("mine").innerHTML = latest
    ? `<h2>Your filing</h2><p>Filing ${pad(latest.id)}, Plot ${plotName({ x: latest.plot_x, y: latest.plot_y })}: <q>${esc(latest.intent)}</q></p>
       ${ruling(latest)}${latest.status === "pending" ? `<p class="meta">Rulings usually take about a minute.</p>` : ""}`
    : "";
}

function renderBoard() {
  const recent = [...filings.values()]
    .filter((f) => f.stamped_at && f.status !== "lost")
    .sort((a, b) => b.stamped_at!.localeCompare(a.stamped_at!))
    .slice(0, 8);
  $("board").innerHTML = recent.length
    ? `<h2>Notice board</h2><ul>${recent
        .map((f) => `<li><span class="stamp ${f.status}">${STAMP[f.status]}</span> ${plotName({ x: f.plot_x, y: f.plot_y })}
          <q>${esc(f.intent)}</q> <span class="meta">— ${esc(who(f.filer))}</span></li>`)
        .join("")}</ul>`
    : `<h2>Notice board</h2><p class="hint">No rulings yet. Gary is ready.</p>`;
}

function renderHere() {
  const names = [...walkers.keys()].map(who).sort((a, b) => (a === "you" ? -1 : b === "you" ? 1 : a.localeCompare(b)));
  $("here").textContent = `On the commons: ${names.join(", ")}`;
}

function renderBuild() {
  const panel = $("build");
  for (const id of ["plot", "mine", "board"]) $(id).hidden = !!focus;
  panel.hidden = !focus;
  if (!focus) return;
  const f = focus;
  const mine = f.filer === me;
  const count = built.get(f.id)?.length ?? 0;
  panel.innerHTML = `<h2>Plot ${plotName({ x: f.plot_x, y: f.plot_y })}</h2>
    <p>${mine ? "Yours" : `Held by ${esc(who(f.filer))}`}: <q>${esc(f.intent)}</q></p>
    ${f.condition ? `<p class="meta">Condition: ${esc(f.condition)}</p>` : ""}
    ${mine
      ? `<p class="hint">Building on a granted plot needs no further paperwork. Gary finds this difficult.
         Click to place; right-click to take down.</p>
         <div id="palette">${[...BUILDABLE, REMOVE].map((name) => `<button data-tool="${name}" title="${name}"
           class="${name === tool ? "on" : ""}">${name === REMOVE ? "take down" : `<img src="${propCanvas(name).toDataURL()}" width="${propSize(name).w * 2}" alt="${name}">`}</button>`).join("")}</div>
         <p id="build-problem"></p>`
      : `<p class="meta">${count ? `${count} thing${count === 1 ? "" : "s"} built.` : "Nothing built yet."}</p>`}
    <button id="leave">Back to the commons</button>`;
  panel.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) =>
    b.addEventListener("click", () => {
      tool = b.dataset.tool!;
      renderBuild();
    }),
  );
  $("leave").addEventListener("click", leaveFocus);
}

function enterFocus(f: Filing) {
  focus = f;
  ghost = null;
  resize();
  renderBuild();
}

function leaveFocus() {
  focus = null;
  ghost = null;
  resize();
  renderAll();
}

function renderAll() {
  renderBuild();
  if (focus) return;
  renderPlot();
  renderMine();
  renderBoard();
  renderHere();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selected) return;
  const button = form.querySelector("button")!;
  button.disabled = true;
  const problem = await fileClaim(selected.x, selected.y, intent.value.trim());
  button.disabled = false;
  $("problem").textContent = problem ?? "";
  if (!problem) intent.value = "";
});

// --- map -----------------------------------------------------------------

const artSize = () => (focus ? { w: FOCUS_W, h: FOCUS_H } : { w: MAP_W, h: MAP_H });

function resize() {
  const box = $("field").getBoundingClientRect();
  const { w, h } = artSize();
  scale = Math.max(1, Math.floor(Math.min(box.width / w, box.height / h)));
  canvas.width = w * scale;
  canvas.height = h * scale;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

function toArt(e: MouseEvent) {
  const r = canvas.getBoundingClientRect();
  const { w, h } = artSize();
  return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
}

// --- up close: building ----------------------------------------------------

/** A build-space point, or null off the plot. */
function toBuild(e: MouseEvent) {
  const p = toArt(e);
  const b = { x: p.x - FOCUS_PAD, y: p.y - FOCUS_PAD };
  return b.x >= 0 && b.y >= 0 && b.x < BUILD_W && b.y < BUILD_H ? b : null;
}

/** Where the current prop would go: centred on the cursor, snapped to cells, kept inside the fence. */
function ghostAt(e: MouseEvent): Ghost | null {
  const b = toBuild(e);
  if (!b || !focus || focus.filer !== me || tool === REMOVE) return null;
  const { w, h } = propSize(tool);
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(0, max));
  return {
    prop: tool,
    x: clamp(Math.round((b.x - w / 2) / ZOOM), Math.floor((BUILD_W - w) / ZOOM)),
    y: clamp(Math.round((b.y - h / 2) / ZOOM), Math.floor((BUILD_H - h) / ZOOM)),
  };
}

function takeDown(e: MouseEvent) {
  const b = toBuild(e);
  if (!b || !focus) return;
  const p = placementAt(built.get(focus.id) ?? [], b.x, b.y);
  if (!p) return;
  removePlacement(p.id);
  unplace(p.id);
}

async function buildClick(e: MouseEvent) {
  if (!focus || focus.filer !== me) return;
  if (tool === REMOVE) return takeDown(e);
  const g = ghostAt(e);
  if (!g) return;
  const result = await place(focus.id, g.x, g.y, g.prop);
  const problem = document.getElementById("build-problem");
  if (problem) problem.textContent = typeof result === "string" ? result : "";
  if (typeof result !== "string") addPlacement(result);
}

canvas.addEventListener("contextmenu", (e) => {
  if (!focus || focus.filer !== me) return;
  e.preventDefault();
  takeDown(e);
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && focus) leaveFocus();
});

// --- the map, and pointing at things on it ----------------------------------

canvas.addEventListener("mousemove", (e) => {
  if (focus) {
    ghost = ghostAt(e);
    canvas.style.cursor = focus.filer === me && tool === REMOVE ? "crosshair" : "";
    return;
  }
  const p = toArt(e);
  hover = plotAt(p.x, p.y);
});
canvas.addEventListener("mouseleave", () => {
  hover = null;
  ghost = null;
});

canvas.addEventListener("click", (e) => {
  if (focus) return void buildClick(e);
  const p = toArt(e);
  const plot = plotAt(p.x, p.y);
  let tx = p.x;
  let ty = p.y;
  if (plot) {
    // Walk to the path just below the plot, as one does before filing.
    const { left, top } = plotOrigin(plot);
    tx = left + PLOT_W / 2;
    ty = top + PLOT_H + PATH / 2 + 3;
    if (plotKey(plot) !== (selected && plotKey(selected))) $("problem").textContent = "";
    selected = plot;
    renderPlot();
  }
  walkTo(Math.min(Math.max(tx, MARGIN + 2), MAP_W - MARGIN - 2), Math.min(Math.max(ty, MARGIN + 7), MAP_H - MARGIN - 1));
});

// --- the field channel: avatars (broadcast), who's here (presence), filings --

let channel: RealtimeChannel;

function walkTo(tx: number, ty: number) {
  const self = walkers.get(me);
  if (!self || !channel) return;
  self.tx = tx;
  self.ty = ty;
  channel.send({ type: "broadcast", event: "walk", payload: { id: me, x: self.x, y: self.y, tx, ty } });
}

function step(dt: number) {
  for (const w of walkers.values()) {
    const dx = w.tx - w.x;
    const dy = w.ty - w.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) continue;
    const move = Math.min(dist, SPEED * dt);
    w.x += (dx / dist) * move;
    w.y += (dy / dist) * move;
    // Arrived: tell presence where we are, for anyone who joins later.
    if (w.id === me && move === dist) channel.track({ x: w.x, y: w.y });
  }
}

let last = performance.now();
function frame(now: number) {
  step(Math.min((now - last) / 1000, 0.1));
  last = now;
  if (focus) drawFocus(ctx, focus, built.get(focus.id) ?? [], ghost, focus.filer === me);
  else draw(ctx, { held: heldPlots(), built, me, hover, selected, walkers: [...walkers.values()] });
  requestAnimationFrame(frame);
}

function upsert(f: Filing) {
  filings.set(f.id, f);
  if (focus?.id === f.id) focus = f;
}

function regroup(filing: number) {
  built.set(filing, [...placements.values()].filter((p) => p.filing === filing));
}

function addPlacement(p: Placement) {
  if (placements.has(p.id)) return;
  placements.set(p.id, p);
  regroup(p.filing);
}

function removePlacement(id: number) {
  const p = placements.get(id);
  if (!p) return;
  placements.delete(id);
  regroup(p.filing);
}

async function start() {
  me = await signIn();
  const [loaded, placed] = await Promise.all([loadFilings(), loadPlacements()]);
  for (const f of loaded) upsert(f);
  for (const p of placed) placements.set(p.id, p);
  for (const id of new Set(placed.map((p) => p.filing))) regroup(id);
  handles = await handlesFor([me, ...[...filings.values()].map((f) => f.filer)]);

  const spawn = { x: MAP_W / 2 + (Math.random() - 0.5) * 60, y: MAP_H - MARGIN - 3 };
  walkers.set(me, { id: me, ...spawn, tx: spawn.x, ty: spawn.y });

  channel = supabase.channel("the_commons:field", { config: { presence: { key: me } } });
  channel
    .on("broadcast", { event: "walk" }, ({ payload }) => {
      // Broadcasts aren't tied to their sender: only move residents presence
      // vouches for, never ourselves, and only by numbers.
      const { id, x, y, tx, ty } = payload;
      const w = walkers.get(id);
      if (!w || id === me || ![x, y, tx, ty].every(Number.isFinite)) return;
      Object.assign(w, { x, y, tx, ty });
    })
    .on("presence", { event: "sync" }, async () => {
      const state = channel.presenceState<{ x: number; y: number }>();
      for (const id of walkers.keys()) if (id !== me && !(id in state)) walkers.delete(id);
      for (const [id, [p]] of Object.entries(state)) {
        if (!walkers.has(id)) walkers.set(id, { id, x: p.x, y: p.y, tx: p.x, ty: p.y });
      }
      handles = await handlesFor(Object.keys(state));
      renderHere();
    })
    .on("postgres_changes", { event: "*", schema: "the_commons", table: "filings" }, async ({ new: row }) => {
      if (!row || !("id" in row)) return;
      const f = row as Filing;
      upsert(f);
      handles = await handlesFor([f.filer]);
      renderAll();
    })
    .on("postgres_changes", { event: "*", schema: "the_commons", table: "placements" }, ({ eventType, new: row, old }) => {
      // Deletes carry only the id.
      if (eventType === "DELETE") removePlacement((old as { id: number }).id);
      else if (row && "id" in row) addPlacement(row as Placement);
      if (focus && focus.filer !== me) renderBuild(); // the visitor's count
    });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") channel.track(spawn);
  });

  renderAll();
  requestAnimationFrame(frame);
}

resize();
window.addEventListener("resize", resize);
start().catch((err) => {
  $("plot").textContent = `The commons is closed: ${err.message ?? err}`;
});
