import { MAP_H, MAP_W, MARGIN, PATH, PLOT_H, PLOT_W, plotAt, plotName, plotOrigin, type Plot } from "./layout.ts";
import { HELD, fileClaim, handlesFor, loadFilings, signIn, supabase, type Filing } from "./net.ts";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { draw, plotKey, type Walker } from "./render.ts";

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
const walkers = new Map<string, Mover>();
let handles = new Map<string, string>();
let me = "";
let hover: Plot | null = null;
let selected: Plot | null = null;
let scale = 1;

const pad = (n: number) => String(n).padStart(4, "0");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);
const who = (id: string) => (id === me ? "you" : (handles.get(id) ?? "a resident"));

function heldPlots() {
  const held = new Map<string, Filing>();
  for (const f of filings.values()) if (HELD.includes(f.status)) held.set(plotKey({ x: f.plot_x, y: f.plot_y }), f);
  return held;
}

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
    info.innerHTML = `${title}<p>Held by ${esc(who(f.filer))}: <q>${esc(f.intent)}</q></p>${ruling(f)}
      <p class="meta">Filing ${pad(f.id)}</p>`;
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

function renderAll() {
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

function resize() {
  const box = $("field").getBoundingClientRect();
  scale = Math.max(1, Math.floor(Math.min(box.width / MAP_W, box.height / MAP_H)));
  canvas.width = MAP_W * scale;
  canvas.height = MAP_H * scale;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

function toArt(e: MouseEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * MAP_W, y: ((e.clientY - r.top) / r.height) * MAP_H };
}

canvas.addEventListener("mousemove", (e) => {
  const p = toArt(e);
  hover = plotAt(p.x, p.y);
});
canvas.addEventListener("mouseleave", () => (hover = null));

canvas.addEventListener("click", (e) => {
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
  draw(ctx, { held: heldPlots(), me, hover, selected, walkers: [...walkers.values()] });
  requestAnimationFrame(frame);
}

function upsert(f: Filing) {
  filings.set(f.id, f);
}

async function start() {
  me = await signIn();
  for (const f of await loadFilings()) upsert(f);
  handles = await handlesFor([me, ...[...filings.values()].map((f) => f.filer)]);

  const spawn = { x: MAP_W / 2 + (Math.random() - 0.5) * 60, y: MAP_H - MARGIN - 3 };
  walkers.set(me, { id: me, ...spawn, tx: spawn.x, ty: spawn.y });

  channel = supabase.channel("the_commons:field", { config: { presence: { key: me } } });
  channel
    .on("broadcast", { event: "walk" }, ({ payload }) => {
      const w = walkers.get(payload.id);
      if (w) Object.assign(w, payload);
      else walkers.set(payload.id, payload);
    })
    .on("presence", { event: "sync" }, async () => {
      const state = channel.presenceState<{ x: number; y: number }>();
      for (const id of walkers.keys()) if (!(id in state)) walkers.delete(id);
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
