import { BRUSHES, EMPTY, GROUND, paintGround } from "./content/ground.ts";
import { PALETTE, propCanvas, propSize } from "./content/props.ts";
import { BYLAWS, CONDITIONS } from "./rulebook.ts";
import { BUILD_H, BUILD_W, MAP_H, MAP_W, MARGIN, PATH, PLOT_H, PLOT_W, ZOOM, plotAt, plotName, plotOrigin, type Plot } from "./layout.ts";
import {
  HELD, fileClaim, handlesFor, loadFilings, loadPlacements, move, paint, place, signIn, supabase, unplace,
  type Filing, type Placement,
} from "./net.ts";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  BOARD, DIRT, FOCUS_H, FOCUS_PAD, FOCUS_W, HILLS, colourOf, draw, drawFocus, land, letterPhase, placementAt, plotKey,
  type Cells, type FocusScene, type Letter, type Walker,
} from "./render.ts";
import { GARY_LINES, garyAt } from "./life.ts";

const SPEED = 40; // art pixels per second
const ZOOM_MS = 520; // map <-> plot

const STAMP: Record<Filing["status"], string> = {
  pending: "In Gary's in-tray",
  approved: "Approved",
  conditional: "Approved with conditions",
  committee: "Referred to committee",
  denied: "Denied",
  refused: "Refused",
  lost: "Lost in the post",
};

interface Mover extends Walker {
  tx: number;
  ty: number;
}

/** "prop:bench", "ground:p", "move" or "remove". */
type Tool = string;

const canvas = document.querySelector("canvas")!;
const ctx = canvas.getContext("2d")!;
const $ = (id: string) => document.getElementById(id)!;

const filings = new Map<number, Filing>();
const placements = new Map<number, Placement>();
const built = new Map<number, Placement[]>(); // filing -> its placements; replaced, never mutated, so minis can cache
const walkers = new Map<string, Mover>();
let handles = new Map<string, string>();
let me = "";
let hover: Plot | null = null;
let selected: Plot | null = null;
const letters: Letter[] = [];
let heading: (() => void) | null = null; // what to do when we get where we're walking
// Our rulings still in the post: the panel keeps them sealed until the letter lands.
const unread = new Set<number>();

let focus: Filing | null = null; // the plot we're up close to, if any
let zoom: { start: number; dir: 1 | -1; filing: Filing } | null = null; // flying in or out
let tool: Tool = "prop:bench";
let pointer: { x: number; y: number } | null = null; // build space, while over the plot
let stroke: { cells: string[]; before: string; last: Cells } | null = null; // painting ground
// Ground we've painted this visit. Only the holder paints a plot, so ours is
// newer than any echo — echoes of earlier saves can arrive after later strokes.
const painted = new Map<number, string>();
let drag: { p: Placement; dx: number; dy: number; x: number; y: number } | null = null; // moving a prop

const pad = (n: number) => String(n).padStart(4, "0");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);
const who = (id: string) => (id === me ? "you" : (handles.get(id) ?? "a resident"));
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Who holds what, as far as we know: a ruling still in the post reads as pending until its letter opens. */
function heldPlots() {
  const held = new Map<string, Filing>();
  for (const f of filings.values()) {
    if (unread.has(f.id)) held.set(plotKey({ x: f.plot_x, y: f.plot_y }), { ...f, status: "pending" });
    else if (HELD.includes(f.status)) held.set(plotKey({ x: f.plot_x, y: f.plot_y }), f);
  }
  return held;
}

const BUILT: Filing["status"][] = ["approved", "conditional"];

/** Newest granted plots first, the same on every screen, since Gary's rounds depend on it. */
const recent = () =>
  [...filings.values()]
    .filter((f) => BUILT.includes(f.status) && f.stamped_at)
    .sort((a, b) => b.stamped_at!.localeCompare(a.stamped_at!) || b.id - a.id)
    .slice(0, 5)
    .map((f) => ({ x: f.plot_x, y: f.plot_y }));

const mineInFocus = () => !!focus && focus.filer === me && !zoom;

// --- paper: the corner tag, cards by the things you click, the board ---------

function ruling(f: Filing, fresh = false) {
  if (unread.has(f.id)) return `<p class="stamp pending">In the post</p><p class="meta">Gary's reply is on its way.</p>`;
  const bylaw = f.status === "denied" && f.bylaw ? BYLAWS[f.bylaw - 1] : null;
  return `<p class="stamp ${f.status}${fresh ? " thunk" : ""}">${STAMP[f.status]}${bylaw ? ` (Bylaw ${f.bylaw})` : ""}</p>
    ${bylaw ? `<p class="meta"><b>Bylaw ${f.bylaw}.</b> ${bylaw}</p>` : ""}
    ${f.permit ? `<p class="permit">${esc(f.permit)}</p>` : ""}`;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** The whole exchange: what was asked, when, and everything Gary said back. */
function exchange(f: Filing, fresh = false) {
  return `<p class="meta">Filing ${pad(f.id)}, Plot ${plotName({ x: f.plot_x, y: f.plot_y })}. Filed by ${esc(who(f.filer))}, ${when(f.filed_at)}.</p>
    <p><q>${esc(f.intent)}</q></p>
    ${ruling(f, fresh)}
    ${conditionHtml(f)}
    ${f.stamped_at && !unread.has(f.id) ? `<p class="meta">Stamped ${when(f.stamped_at)}.</p>` : ""}`;
}

/** The condition on a plot, and whether what's built answers it. */
function conditionHtml(f: Filing) {
  const c = f.condition ? CONDITIONS[f.condition] : null;
  if (!c || unread.has(f.id)) return "";
  if (!BUILT.includes(f.status)) return `<p><b>Condition.</b> ${c.text}</p>`;
  const neighbours = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dy]) =>
    heldPlots().has(plotKey({ x: f.plot_x + dx, y: f.plot_y + dy })),
  ).length;
  const [met, note] = c.check({ props: new Set((built.get(f.id) ?? []).map((p) => p.prop)), neighbours, today: new Date() });
  return `<div class="condition"><p><b>Condition.</b> ${c.text}</p>
    <p class="stamp ${met ? "approved" : "pending"}">${met ? "Met" : "Outstanding"}</p> <span class="meta">${note}</span></div>`;
}

function renderTag() {
  const names = [...walkers.keys()].map(who).sort((a, b) => (a === "you" ? -1 : b === "you" ? 1 : a.localeCompare(b)));
  const held = [...filings.values()]
    .filter((f) => f.filer === me && (HELD.includes(f.status) || unread.has(f.id)))
    .sort((a, b) => a.plot_y - b.plot_y || a.plot_x - b.plot_x);
  $("tag").innerHTML = `<h1>The Commons</h1><p class="meta">Administered by Gary. Here: ${names.map(esc).join(", ")}</p>
    ${held.length
      ? `<p class="yours"><span class="swatch" style="background:${colourOf(me)}"></span>${held
          .map((f) => `<button data-filing="${f.id}" class="plot-link ${unread.has(f.id) ? "pending" : f.status}">${plotName({ x: f.plot_x, y: f.plot_y })}</button>`)
          .join("")}</p>`
      : `<p class="hint">Click a plot to read its permit, or an empty one to claim it.</p>`}`;
  for (const b of $("tag").querySelectorAll<HTMLButtonElement>("[data-filing]")) {
    b.addEventListener("click", () => visit(filings.get(Number(b.dataset.filing))!));
  }
}

/** Go to one of our plots: inside if it's granted, otherwise its card on the map. */
function visit(f: Filing) {
  if (BUILT.includes(f.status) && !unread.has(f.id)) {
    closeCard();
    enterFocus(f);
  } else openCard({ x: f.plot_x, y: f.plot_y });
}

// The card: a plot's permit, a claim form, or Gary's reply to one of ours.
const card = $("card");
let reply: number | null = null; // a filing whose reply the card is showing, rather than the plot
let thunk: number | null = null; // a ruling just opened, to stamp as the card appears

function openCard(plot: Plot, filing: number | null = null) {
  if (selected && plotKey(selected) !== plotKey(plot)) heading = null;
  selected = plot;
  reply = filing;
  renderCard();
}

function closeCard() {
  selected = null;
  reply = null;
  card.hidden = true;
}

function renderCard() {
  if (!selected || focus) {
    card.hidden = true;
    return;
  }
  const plot = selected;
  const draft = card.querySelector("textarea");
  const typed = draft?.value ?? "";
  const typing = document.activeElement === draft;
  const f = reply !== null ? filings.get(reply) : heldPlots().get(plotKey(plot));
  const fresh = thunk !== null && thunk === f?.id;
  thunk = null;
  let body: string;
  if (f && reply !== null) {
    body = `<h2>A reply from Gary</h2>${exchange(f, fresh)}`;
  } else if (f) {
    body = `<h2>Plot ${plotName(plot)}</h2><p>Held by ${esc(who(f.filer))}: <q>${esc(f.intent)}</q></p>
      ${ruling(f, fresh)}${conditionHtml(f)}<p class="meta">Filing ${pad(f.id)}</p>`;
  } else {
    body = `<h2>Plot ${plotName(plot)}</h2><p>Unclaimed. State your intent for this plot in one breath.</p>
      <form><textarea rows="2" maxlength="120" placeholder="a bench, for looking at the pond with" required></textarea>
      <button>Submit to Gary</button><p class="problem"></p></form>`;
  }
  const enter = f && BUILT.includes(f.status) && !unread.has(f.id) ? `<button class="enter">Step inside</button>` : "";
  card.innerHTML = `<button class="close" aria-label="Close">×</button>${body}${enter}`;
  card.hidden = false;
  card.querySelector(".close")!.addEventListener("click", closeCard);
  if (f) card.querySelector(".enter")?.addEventListener("click", () => walkInto(f));
  const form = card.querySelector("form");
  if (form) {
    const box = form.querySelector("textarea")!;
    box.value = typed;
    if (typing) box.focus();
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      void claim(plot, form);
    });
  }
  placeCard();
}

async function claim(plot: Plot, form: HTMLFormElement) {
  const box = form.querySelector("textarea")!;
  const button = form.querySelector("button")!;
  button.disabled = true;
  const problem = await fileClaim(plot.x, plot.y, box.value.trim());
  button.disabled = false;
  form.querySelector(".problem")!.textContent = problem ?? "";
  if (problem) return;
  box.value = "";
  letters.push({ plot, out: true });
  closeCard();
}

/** Hang the card above its plot, or below it if there's no room, kept on screen. */
function placeCard() {
  if (card.hidden || !selected) return;
  const { left, top } = plotOrigin(selected);
  const v = mapView;
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const x = v.ox + (left + PLOT_W / 2) * v.s - w / 2;
  let y = v.oy + top * v.s - h - 12;
  if (y < 8) y = v.oy + (top + PLOT_H) * v.s + 12;
  card.style.left = `${clamp(x, 8, canvas.width - w - 8)}px`;
  card.style.top = `${clamp(y, 8, canvas.height - h - 8)}px`;
}

// The notice board, read up close.
const board = $("board");
let reading: number | null = null; // the notice taken down to read

function openBoard() {
  closeCard();
  board.hidden = false;
  renderBoard();
}

function closeBoard() {
  board.hidden = true;
  reading = null;
}

/** A notice's lean, from its number, so it hangs the same way every visit. */
const lean = (id: number) => `${(((id * 7919) % 11) - 5) * 0.7}deg`;

function renderBoard() {
  if (board.hidden) return;
  const recent = [...filings.values()]
    .filter((f) => f.stamped_at && f.status !== "lost" && f.status !== "refused" && !unread.has(f.id))
    .sort((a, b) => b.stamped_at!.localeCompare(a.stamped_at!))
    .slice(0, 18);
  const notice = (f: Filing) => `<div class="notice" data-filing="${f.id}" style="--r:${lean(f.id)}">
      <span class="pin" style="background:${colourOf(f.filer)}"></span>
      <span class="stamp ${f.status}">${STAMP[f.status]}</span>
      <q>${esc(f.intent)}</q><span class="meta">Plot ${plotName({ x: f.plot_x, y: f.plot_y })} — ${esc(who(f.filer))}</span></div>`;
  const open = reading !== null ? filings.get(reading) : null;
  board.innerHTML = `<div class="cork">
      <div class="plank"><h2>Notices</h2><span>by order of the administrator <button class="close" aria-label="Close">×</button></span></div>
      ${recent.length ? `<div class="pins">${recent.map(notice).join("")}</div>` : `<p class="empty-board">Nothing pinned up yet. Gary is ready.</p>`}
      ${open ? `<div class="reading"><div class="notice"><span class="pin" style="background:${colourOf(open.filer)}"></span>
        <button class="close back" aria-label="Pin it back">×</button>${exchange(open)}</div></div>` : ""}
    </div>`;
  board.querySelector(".plank .close")!.addEventListener("click", closeBoard);
  for (const n of board.querySelectorAll<HTMLElement>(".pins [data-filing]")) {
    n.addEventListener("click", () => {
      reading = Number(n.dataset.filing);
      renderBoard();
    });
  }
  board.querySelector(".reading")?.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains("reading") || t.classList.contains("back")) {
      reading = null;
      renderBoard();
    }
  });
}

board.addEventListener("click", (e) => {
  if (e.target === board) closeBoard();
});

// --- up close: the plot's card and the toolbar --------------------------------

const HINTS: Record<string, string> = {
  prop: "Click to place it. Right-click takes things down.",
  ground: "Drag to paint the ground.",
  move: "Drag things about.",
  remove: "Click something to take it down.",
};

function renderBuildInfo() {
  if (!focus) return;
  const f = focus;
  const count = built.get(f.id)?.length ?? 0;
  $("build-info").innerHTML = `<h2>Plot ${plotName({ x: f.plot_x, y: f.plot_y })}</h2>
    <p>${f.filer === me ? "Yours" : `Held by ${esc(who(f.filer))}`}: <q>${esc(f.intent)}</q></p>
    ${conditionHtml(f)}
    ${f.filer === me
      ? `<p class="hint">Building on a granted plot needs no further paperwork. Gary finds this difficult.</p>`
      : `<p class="meta">${count ? `${count} thing${count === 1 ? "" : "s"} built.` : "Nothing built yet."}</p>`}`;
  $("tool-hint").textContent = HINTS[tool.split(":")[0]];
  const wants = new Set(f.condition ? (CONDITIONS[f.condition]?.wants ?? []) : []);
  for (const b of $("palette").querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    b.classList.toggle("on", b.dataset.tool === tool);
    b.classList.toggle("wanted", wants.has(b.dataset.tool!.slice(5)));
  }
}

const icons = new Map<string, string>();

function icon(key: string, make: () => HTMLCanvasElement) {
  if (!icons.has(key)) icons.set(key, make().toDataURL());
  return icons.get(key)!;
}

/** A square of one ground, cut from a whole plot of it. */
function swatch(ch: string) {
  const full = document.createElement("canvas");
  full.width = BUILD_W;
  full.height = BUILD_H;
  paintGround(full.getContext("2d")!, ch.repeat(PLOT_W * PLOT_H), 3);
  const c = document.createElement("canvas");
  c.width = c.height = 12;
  c.getContext("2d")!.drawImage(full, -8, -8);
  return c;
}

/** The toolbar, built once per visit; tool changes only flip classes. */
function renderPalette() {
  const mine = focus?.filer === me;
  $("tools").hidden = !mine;
  if (!mine) return;
  const button = (t: Tool, title: string, inner: string) =>
    `<button data-tool="${t}" title="${title}">${inner}</button>`;
  const group = (name: string, inner: string) => `<div class="group"><h3>${name}</h3><div class="row">${inner}</div></div>`;
  $("palette").innerHTML = [
    group("Tools", button("move", "move things", "move") + button("remove", "take down", "take down")),
    group("Ground", BRUSHES.map((ch) =>
      button(`ground:${ch}`, GROUND[ch].label, `<img src="${icon(`ground:${ch}`, () => swatch(ch))}" width="24" alt="${GROUND[ch].label}">`),
    ).join("")),
    ...PALETTE.map(({ group: name, props }) => group(name, props
      .map((p) => button(`prop:${p}`, p, `<img src="${icon(p, () => propCanvas(p))}" width="${Math.min(propSize(p).w * 2, 40)}" alt="${p}">`))
      .join(""))),
  ].join("");
  for (const b of $("palette").querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    b.addEventListener("click", () => {
      tool = b.dataset.tool!;
      renderBuildInfo();
    });
  }
}

function showPanels() {
  $("tag").hidden = !!focus;
  $("build").hidden = !focus;
  if (focus) {
    card.hidden = true;
    $("bubble").hidden = true;
    $("nametag").hidden = true;
  }
}

function enterFocus(f: Filing) {
  if (zoom) return;
  focus = f;
  zoom = { start: performance.now(), dir: 1, filing: f };
  pointer = null;
  heading = null;
  $("build-problem").textContent = "";
  showPanels();
  renderPalette();
  renderBuildInfo();
  fitFocus();
}

function leaveFocus() {
  if (!focus || zoom) return;
  zoom = { start: performance.now(), dir: -1, filing: focus };
  focus = null;
  stroke = null;
  drag = null;
  selected = null;
  showPanels();
  renderAll();
}

$("leave").addEventListener("click", leaveFocus);

function renderAll() {
  if (focus) return renderBuildInfo();
  renderTag();
  renderCard();
  renderBoard();
}

// --- canvas and views --------------------------------------------------------

interface View {
  s: number; // device pixels per art pixel, always whole
  ox: number;
  oy: number;
}

let mapView: View = { s: 1, ox: 0, oy: 0 };
let focusView: View = { s: 1, ox: 0, oy: 0 };

/** The biggest whole-pixel view of w x h, centred, leaving `below` px clear at the bottom. */
function fit(w: number, h: number, below = 0): View {
  const room = canvas.height - below;
  const s = Math.max(1, Math.floor(Math.min(canvas.width / w, room / h)));
  return { s, ox: Math.floor((canvas.width - w * s) / 2), oy: Math.floor((room - h * s) / 2) };
}

/** Up close, clear of the toolbar when there is one. */
function fitFocus() {
  const tools = $("tools");
  focusView = fit(FOCUS_W, FOCUS_H, focus && !tools.hidden ? tools.offsetHeight + 16 : 0);
}

function resize() {
  const box = $("field").getBoundingClientRect();
  canvas.width = Math.floor(box.width);
  canvas.height = Math.floor(box.height);
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  ctx.imageSmoothingEnabled = false;
  mapView = fit(MAP_W, MAP_H);
  fitFocus();
}

function toArt(e: MouseEvent, v: View) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left - v.ox) / v.s, y: (e.clientY - r.top - v.oy) / v.s };
}

const viewport = (v: View) => ctx.setTransform(v.s, 0, 0, v.s, v.ox, v.oy);

function fill(colour: string) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Fly between the map and a plot. The map zooms in whole-number steps so its
 * pixels stay square, with the plot sliding to where the close-up will put it;
 * then the close-up fades in over the top. At full zoom one map pixel of the
 * plot is exactly one build cell, so the miniature resolves into the real thing.
 */
function drawZoom(now: number) {
  const z = zoom!;
  const t = Math.min(1, (now - z.start) / ZOOM_MS);
  const u = z.dir === 1 ? t : 1 - t;
  const { left, top } = plotOrigin({ x: z.filing.plot_x, y: z.filing.plot_y });
  const s0 = mapView.s;
  const s1 = focusView.s * ZOOM;
  const s = Math.round(s0 * (s1 / s0) ** ease(Math.min(1, u / 0.8)));
  const k = s1 === s0 ? 1 : (s - s0) / (s1 - s0);
  const from = { x: mapView.ox + s0 * left, y: mapView.oy + s0 * top };
  const to = { x: focusView.ox + focusView.s * FOCUS_PAD, y: focusView.oy + focusView.s * FOCUS_PAD };
  fill(HILLS);
  viewport({
    s,
    ox: Math.round(from.x + (to.x - from.x) * k - s * left),
    oy: Math.round(from.y + (to.y - from.y) * k - s * top),
  });
  draw(ctx, { held: heldPlots(), built, me, hover: null, selected: null, walkers: [...walkers.values()], letters: [], t: Date.now(), recent: recent() });
  const fade = Math.max(0, (u - 0.65) / 0.35);
  if (fade > 0) {
    ctx.globalAlpha = fade;
    fill(DIRT);
    viewport(focusView);
    drawFocus(ctx, focusScene(z.filing), now);
    ctx.globalAlpha = 1;
  }
  if (t >= 1) zoom = null;
}

// --- up close: building ----------------------------------------------------

/** A build-space point, or null off the plot. */
function toBuild(e: MouseEvent) {
  const p = toArt(e, focusView);
  const b = { x: p.x - FOCUS_PAD, y: p.y - FOCUS_PAD };
  return b.x >= 0 && b.y >= 0 && b.x < BUILD_W && b.y < BUILD_H ? b : null;
}

/** Where a prop would go: centred on the point, snapped to cells, kept inside the fence. */
function propAt(prop: string, bx: number, by: number) {
  const { w, h } = propSize(prop);
  return {
    x: clamp(Math.round((bx - w / 2) / ZOOM), 0, Math.floor((BUILD_W - w) / ZOOM)),
    y: clamp(Math.round((by - h / 2) / ZOOM), 0, Math.floor((BUILD_H - h) / ZOOM)),
  };
}

/** The 2x2 cells a ground brush covers, centred on the nearest cell corner. */
function brushAt(bx: number, by: number): Cells {
  return {
    x: clamp(Math.round(bx / ZOOM) - 1, 0, PLOT_W - 2),
    y: clamp(Math.round(by / ZOOM) - 1, 0, PLOT_H - 2),
    w: 2,
    h: 2,
  };
}

function focusScene(f: Filing): FocusScene {
  const mine = f.filer === me && !zoom;
  const ps = built.get(f.id) ?? [];
  const scene: FocusScene = { filing: f, built: ps, mine: f.filer === me, ghost: null, brush: null, hover: null };
  if (!mine || !pointer) return scene;
  const [kind, arg] = tool.split(":");
  if (drag) {
    const moved = { ...drag.p, x: drag.x, y: drag.y };
    scene.built = ps.map((p) => (p.id === moved.id ? moved : p));
    scene.hover = { p: moved, colour: "#fff8e0" };
  } else if (kind === "prop") {
    scene.ghost = { id: 0, filing: f.id, prop: arg, ...propAt(arg, pointer.x, pointer.y) };
  } else if (kind === "ground") {
    scene.brush = brushAt(pointer.x, pointer.y);
  } else {
    const p = placementAt(ps, pointer.x, pointer.y);
    if (p) scene.hover = { p, colour: kind === "move" ? "#fff8e0" : "#e05c48" };
  }
  return scene;
}

function problem(text: string) {
  $("build-problem").textContent = text;
}

function setPlacement(p: Placement) {
  const before = placements.get(p.id);
  placements.set(p.id, p);
  if (before && before.filing !== p.filing) regroup(before.filing);
  regroup(p.filing);
}

function takeDown(b: { x: number; y: number }) {
  if (!focus) return;
  const p = placementAt(built.get(focus.id) ?? [], b.x, b.y);
  if (!p) return;
  removePlacement(p.id);
  unplace(p.id).then((ok) => ok || setPlacement(p));
}

async function placeAt(prop: string, b: { x: number; y: number }) {
  const f = focus!;
  const at = propAt(prop, b.x, b.y);
  const result = await place(f.id, at.x, at.y, prop);
  if (typeof result === "string") return problem(result);
  problem("");
  land(result.id);
  addPlacement(result);
}

/** Lay ground along the brush's path since the last point, so a quick drag leaves no gaps. */
function paintTo(to: Cells) {
  if (!stroke || !focus) return;
  const ch = tool.split(":")[1];
  const from = stroke.last;
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(from.x + ((to.x - from.x) * i) / steps);
    const y = Math.round(from.y + ((to.y - from.y) * i) / steps);
    for (let dy = 0; dy < to.h; dy++) for (let dx = 0; dx < to.w; dx++) stroke.cells[(y + dy) * PLOT_W + x + dx] = ch;
  }
  stroke.last = to;
  focus.ground = stroke.cells.join("");
  painted.set(focus.id, focus.ground);
}

canvas.addEventListener("pointerdown", (e) => {
  if (!focus || zoom) return;
  const b = toBuild(e);
  if (!b || !mineInFocus()) return;
  pointer = b;
  const [kind, arg] = tool.split(":");
  if (e.button === 2 || kind === "remove") return takeDown(b);
  if (e.button !== 0) return;
  if (kind === "prop") return void placeAt(arg, b);
  canvas.setPointerCapture(e.pointerId);
  if (kind === "ground") {
    const before = focus.ground ?? EMPTY;
    const at = brushAt(b.x, b.y);
    stroke = { cells: before.split(""), before, last: at };
    paintTo(at);
  } else if (kind === "move") {
    const p = placementAt(built.get(focus.id) ?? [], b.x, b.y);
    if (p) drag = { p, dx: b.x - p.x * ZOOM, dy: b.y - p.y * ZOOM, x: p.x, y: p.y };
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!focus) {
    const p = toArt(e, mapView);
    mouse = p;
    hover = plotAt(p.x, p.y);
    return;
  }
  const b = toBuild(e);
  if (!b) {
    if (!stroke && !drag) pointer = null;
    return;
  }
  pointer = b;
  if (stroke) paintTo(brushAt(b.x, b.y));
  if (drag) {
    const { w, h } = propSize(drag.p.prop);
    Object.assign(drag, propAt(drag.p.prop, b.x - drag.dx + w / 2, b.y - drag.dy + h / 2));
  }
});

canvas.addEventListener("pointerup", async () => {
  if (stroke && focus) {
    const { before } = stroke;
    const f = focus;
    stroke = null;
    if (f.ground === before) return;
    const err = await paint(f.id, f.ground!);
    if (err) {
      f.ground = before;
      painted.set(f.id, before);
      problem(err);
    }
  }
  if (drag) {
    const { p, x, y } = drag;
    drag = null;
    if (p.x === x && p.y === y) return;
    setPlacement({ ...p, x, y });
    const err = await move(p.id, x, y);
    if (err) {
      setPlacement(p);
      problem(err);
    }
  }
});

canvas.addEventListener("pointerleave", () => {
  hover = null;
  mouse = null;
  if (!stroke && !drag) pointer = null;
});

canvas.addEventListener("contextmenu", (e) => {
  if (focus) e.preventDefault();
});

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (reading !== null) {
    reading = null;
    renderBoard();
  } else if (!board.hidden) closeBoard();
  else if (focus) leaveFocus();
  else closeCard();
});

/** The granted plot under a map point, if any: the ones you can step inside. */
function enterableAt(e: MouseEvent) {
  const p = toArt(e, mapView);
  const plot = plotAt(p.x, p.y);
  const f = plot && heldPlots().get(plotKey(plot));
  return f && BUILT.includes(f.status) ? f : null;
}

// Double-click a plot to step inside, or the path round it to step out.
canvas.addEventListener("dblclick", (e) => {
  if (zoom) return;
  if (!focus) {
    const f = enterableAt(e);
    if (f) walkInto(f);
  } else if (!toBuild(e)) {
    leaveFocus();
  }
});

// Scroll or pinch: in over a plot goes inside, out comes back to the commons.
canvas.addEventListener("wheel", (e) => {
  // Pinches arrive as ctrl-wheel; keep the browser from zooming the page.
  if (e.ctrlKey || focus) e.preventDefault();
  if (zoom || Math.abs(e.deltaY) < 4) return;
  if (focus) {
    if (e.deltaY > 0) leaveFocus();
    return;
  }
  const f = e.deltaY < 0 && enterableAt(e);
  if (!f) return;
  e.preventDefault();
  closeCard();
  enterFocus(f);
}, { passive: false });

// --- the map ---------------------------------------------------------------

/** Where you stand to go into a plot: on the path, just outside its gate. */
function gate(plot: Plot) {
  const { left, top } = plotOrigin(plot);
  return { x: left + PLOT_W / 2, y: top + PLOT_H + PATH / 2 + 3 };
}

/** Walk somewhere, then do something there. */
function goTo(x: number, y: number, then: () => void) {
  const self = walkers.get(me);
  if (!self || Math.hypot(self.x - x, self.y - y) < 1) return then();
  heading = then;
  walkTo(x, y);
}

/** Walk to a plot's gate and step inside on arrival. */
function walkInto(f: Filing) {
  const g = gate({ x: f.plot_x, y: f.plot_y });
  goTo(g.x, g.y, () => enterFocus(f));
}

/** Whether a map point is on Gary, give or take a pixel. */
function onGary(p: { x: number; y: number }) {
  const g = garyAt(Date.now(), recent());
  return Math.abs(p.x - g.x) <= 4 && p.y >= g.y - 12 && p.y <= g.y + 1;
}

const onBoard = (p: { x: number; y: number }) =>
  p.x >= BOARD.x - 1 && p.x < BOARD.x + BOARD.w + 1 && p.y >= BOARD.y - 1 && p.y < MAP_H;

/** Gary says something, for a few seconds. */
let said: { line: string; until: number } | null = null;
function speak() {
  const lines = GARY_LINES.filter((l) => l !== said?.line);
  said = { line: lines[Math.floor(Math.random() * lines.length)], until: performance.now() + 4500 };
  $("bubble").textContent = said.line;
}

canvas.addEventListener("click", (e) => {
  if (focus || zoom) return;
  heading = null;
  const p = toArt(e, mapView);
  if (onGary(p)) return speak();
  const walk = (x: number, y: number) => walkTo(clamp(x, MARGIN + 2, MAP_W - MARGIN - 2), clamp(y, MARGIN + 7, MAP_H - MARGIN - 1));
  if (onBoard(p)) {
    closeCard();
    return goTo(BOARD.x + BOARD.w / 2, MAP_H - MARGIN - 1, openBoard);
  }
  const plot = plotAt(p.x, p.y);
  if (plot) {
    // Walk to the gate, as one does before filing, and read what's pinned there.
    const g = gate(plot);
    openCard(plot);
    return walk(g.x, g.y);
  }
  closeCard(); // just out for a walk
  walk(p.x, p.y);
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
    if (w.id === me && move === dist) {
      channel.track({ x: w.x, y: w.y });
      const then = heading;
      heading = null;
      if (then && !focus && !zoom) then();
    }
  }
}

let mouse: { x: number; y: number } | null = null; // map art space, while over the map

/** Things that follow the map about: Gary's speech bubble, a name over whoever you point at. */
function overlays(now: number, t: number) {
  const screen = (x: number, y: number) => ({ left: `${mapView.ox + x * mapView.s}px`, top: `${mapView.oy + y * mapView.s}px` });
  const gary = garyAt(t, recent());
  const bubble = $("bubble");
  bubble.hidden = !said || now > said.until;
  if (!bubble.hidden) Object.assign(bubble.style, screen(gary.x, gary.y - 15));
  const tag = $("nametag");
  const over = mouse && [...walkers.values()].find((w) => Math.abs(mouse!.x - w.x) <= 3 && mouse!.y >= w.y - 8 && mouse!.y <= w.y + 1);
  const name = over ? who(over.id) : mouse && onGary(mouse) ? "Gary" : mouse && onBoard(mouse) ? "the notice board" : null;
  tag.hidden = !name || !bubble.hidden && name === "Gary";
  if (name) {
    tag.textContent = name;
    const at = over ?? (name === "Gary" ? gary : { x: BOARD.x + BOARD.w / 2, y: BOARD.y + 1 });
    Object.assign(tag.style, screen(at.x, at.y - (over ? 9 : name === "Gary" ? 13 : 2)));
  }
  canvas.style.cursor = name && !over ? "pointer" : hover ? "pointer" : "";
}

let last = performance.now();
function frame(now: number) {
  step(Math.min((now - last) / 1000, 0.1));
  last = now;
  if (zoom) {
    drawZoom(now);
  } else if (focus) {
    fill(DIRT);
    viewport(focusView);
    drawFocus(ctx, focusScene(focus), now);
    canvas.style.cursor = mineInFocus() && pointer ? (tool === "move" ? (drag ? "grabbing" : "grab") : "crosshair") : "";
  } else {
    fill(HILLS);
    viewport(mapView);
    const t = Date.now();
    draw(ctx, { held: heldPlots(), built, me, hover, selected, walkers: [...walkers.values()], letters, t, recent: recent() });
    post(now);
    placeCard();
    overlays(now, t);
  }
  requestAnimationFrame(frame);
}

/** Letters on their way: when one of ours lands, open it in the panel too. */
function post(now: number) {
  for (let i = letters.length - 1; i >= 0; i--) {
    const l = letters[i];
    const phase = letterPhase(l, now);
    const id = l.filing;
    if (phase !== "flying" && id !== undefined && unread.delete(id)) {
      thunk = id;
      if (!focus) openCard(l.plot, id);
    }
    if (phase === "done") letters.splice(i, 1);
  }
}

function upsert(f: Filing) {
  if (painted.has(f.id)) f.ground = painted.get(f.id)!;
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
      renderTag();
    })
    .on("postgres_changes", { event: "*", schema: "the_commons", table: "filings" }, async ({ new: row }) => {
      if (!row || !("id" in row)) return;
      const f = row as Filing;
      // Gary's ruling on one of ours: it comes by post.
      const was = filings.get(f.id);
      if (f.filer === me && was?.status === "pending" && f.status !== "pending") {
        unread.add(f.id);
        letters.push({ plot: { x: f.plot_x, y: f.plot_y }, out: false, status: f.status, filing: f.id });
      }
      upsert(f);
      handles = await handlesFor([f.filer]);
      renderAll();
    })
    .on("postgres_changes", { event: "*", schema: "the_commons", table: "placements" }, ({ eventType, new: row, old }) => {
      // Deletes carry only the id.
      if (eventType === "DELETE") removePlacement((old as { id: number }).id);
      else if (row && "id" in row) {
        const p = row as Placement;
        if (eventType === "INSERT" && !placements.has(p.id)) land(p.id);
        // A move echoing back mid-drag is ours; anything else is news.
        if (drag?.p.id !== p.id) setPlacement(p);
      }
      if (focus) renderBuildInfo();
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
  $("tag").textContent = `The commons is closed: ${err.message ?? err}`;
});
