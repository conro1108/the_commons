import { BRUSHES, empty, groundLabel, paintGround } from "./content/ground.ts";
import { drawnAs, look, PALETTE, propCanvas, propSize, SCALES, sized } from "./content/props.ts";
import { BYLAWS } from "./rulebook.ts";
import {
  LANDMARKS, MAP_H, MAP_W, PLOTS, REGIONS, ZOOM, plotAt, plotById, plotLabel, route, walkable, type PlotDef, type Point,
} from "./world/index.ts";
import {
  HELD, afterGoogle, avatarOf, fileClaim, handlesFor, keepPapers, loadFilings, loadPlacements, move, paint, pencilled, place, rehandle,
  saveProfile, signIn, summonGary, supabase, unplace,
  type Filing, type Placement,
} from "./net.ts";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { VOID, colourOf, draw, letterPhase, type Letter, type Walker } from "./render.ts";
import {
  FOCUS_PAD, SURROUND, canPaint, canPlace, drawFocus, focusSize, land, placementAt, type Cells, type FocusScene,
} from "./closeup.ts";
import { BOARD_BOX } from "./map/landmarks.ts";
import { GARY_LINES, garyAt } from "./life.ts";
import { looksLike } from "./avatar.ts";
import { openPapers, papersOpen } from "./papers.ts";

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
let hover: number | null = null; // plot ids
let selected: number | null = null;
let waypoints: Point[] = []; // the rest of the way, along the paths
let free = false; // walking by the arrow keys, which stop at anything solid
const letters: Letter[] = [];
let heading: (() => void) | null = null; // what to do when we get where we're walking
// Our rulings still in the post: the panel keeps them sealed until the letter lands.
const unread = new Set<number>();

let focus: Filing | null = null; // the plot we're up close to, if any
let zoom: { start: number; dir: 1 | -1; filing: Filing } | null = null; // flying in or out
let tool: Tool = "prop:bench";
let size = 1; // how big the next thing goes up
let pointer: { x: number; y: number } | null = null; // build space, while over the plot
let stroke: { cells: string[]; before: string; last: Cells } | null = null; // painting ground
// Ground we've painted this visit. Only the holder paints a plot, so ours is
// newer than any echo — echoes of earlier saves can arrive after later strokes.
const painted = new Map<number, string>();
let openGroup = "Growing"; // the palette tab showing, on a phone
let placing = false; // a prop held under the pointer, set down where it's let go
let drag: { p: Placement; dx: number; dy: number; x: number; y: number } | null = null; // moving a prop

const pad = (n: number) => String(n).padStart(4, "0");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);
const touch = matchMedia("(pointer: coarse)").matches;
const phone = matchMedia("(max-width: 600px)"); // papers sit along the bottom, the card as a sheet
const lookOf = (id: string) => looksLike(handles.get(id), avatarOf(id), id);
const who = (id: string) => (id === me ? "you" : (handles.get(id) ?? "a resident"));
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Who holds what, as far as we know: a ruling still in the post reads as pending until its letter opens. */
function heldPlots() {
  const held = new Map<number, Filing>();
  for (const f of filings.values()) {
    if (unread.has(f.id)) held.set(f.plot, { ...f, status: "pending" });
    else if (HELD.includes(f.status)) held.set(f.plot, f);
  }
  return held;
}

const plotOf = (f: Filing) => plotById(f.plot)!;
const labelOf = (id: number) => plotLabel(plotById(id)!);

const BUILT: Filing["status"][] = ["approved", "conditional"];

/** Most lately stamped or inspected plots first, the same on every screen, since Gary's rounds depend on it. */
const seen = (f: Filing) => (f.inspected_at ?? "") > f.stamped_at! ? f.inspected_at! : f.stamped_at!;
const recent = () =>
  [...filings.values()]
    .filter((f) => BUILT.includes(f.status) && f.stamped_at)
    .sort((a, b) => seen(b).localeCompare(seen(a)) || b.id - a.id)
    .slice(0, 5)
    .map((f) => f.plot);

const mineInFocus = () => !!focus && focus.filer === me && !zoom;

// --- paper: the corner tag, cards by the things you click, the board ---------

function ruling(f: Filing, fresh = false) {
  if (unread.has(f.id)) return `<p class="stamp pending">In the post</p><p class="meta">Gary's reply is on its way.</p>`;
  const denied = f.status === "denied" && f.bylaw !== null;
  const region = REGIONS[plotOf(f).region];
  const [cite, text] = !denied ? ["", ""] : f.bylaw ? [`Bylaw ${f.bylaw}`, BYLAWS[f.bylaw! - 1]] : [`the covenant of ${region.name}`, region.covenant];
  return `<p class="stamp ${f.status}${fresh ? " thunk" : ""}">${STAMP[f.status]}${denied ? ` (${f.bylaw ? cite : "covenant"})` : ""}</p>
    ${denied ? `<p class="meta"><b>${cite[0].toUpperCase()}${cite.slice(1)}.</b> ${text}</p>` : ""}
    ${f.permit ? `<p class="permit">${esc(f.permit)}</p>` : ""}
    ${minutesHtml(f)}`;
}

const VOTED = (v: string | null, f: Filing) =>
  !v ? "remarks struck from the record" : v === "approved" ? "in favour" : v === "conditional" ? "in favour, on a condition"
  : v === "covenant" ? `against, under the covenant of ${REGIONS[plotOf(f).region].name}` : `against, under Bylaw ${v.slice(1)}`;

/** A referral's night in committee: the clerk's finding, then each member in turn. */
function minutesHtml(f: Filing) {
  const m = f.minutes;
  if (!m) return "";
  return `<div class="condition"><p><b>Minutes of the committee.</b> ${esc(m.finding ?? m.outcome)}</p>
    ${m.members.map((x) => `<p class="meta"><b>${esc(x.seat)}</b>, ${VOTED(x.vote, f)}.${x.speech ? ` <q>${esc(x.speech)}</q>` : ""}</p>`).join("")}</div>`;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** The whole exchange: what was asked, when, and everything Gary said back. */
function exchange(f: Filing, fresh = false) {
  return `<p class="meta">Filing ${pad(f.id)}, ${esc(labelOf(f.plot))}. Filed by ${esc(who(f.filer))}, ${when(f.filed_at)}.</p>
    <p><q>${esc(f.intent)}</q></p>
    ${ruling(f, fresh)}
    ${conditionHtml(f)}
    ${f.stamped_at && !unread.has(f.id) ? `<p class="meta">Stamped ${when(f.stamped_at)}.</p>` : ""}`;
}

/** The condition on a plot, and what Gary made of it when he last came round. */
function conditionHtml(f: Filing) {
  if (!f.condition || unread.has(f.id)) return "";
  if (!BUILT.includes(f.status)) return `<p><b>Condition.</b> ${esc(f.condition)}</p>`;
  const coming = !f.met_at && f.built_at && f.built_at > (f.inspected_at ?? "");
  const note = f.remark
    ? `Gary, on his last visit: <q>${esc(f.remark)}</q>`
    : esc(f.filer === me ? "Gary will come round once you've built something." : "Gary has not yet been round.");
  return `<div class="condition"><p><b>Condition.</b> ${esc(f.condition)}</p>
    <p class="stamp ${f.met_at ? "approved" : "pending"}">${f.met_at ? "Met" : "Outstanding"}</p> <span class="meta">${note}</span>
    ${coming ? `<p class="meta">He has noticed more building and will be round again once it settles.</p>` : ""}</div>`;
}

// Your papers: name and look, amended from the tag whenever you like.
let kept = false; // signed with Google, not just pencilled into this browser

function papers() {
  openPapers({
    me,
    name: handles.get(me) ?? "",
    avatar: avatarOf(me),
    pencilled: !kept,
    save: async (name, avatar) => {
      const problem = await saveProfile(me, name, avatar);
      if (!problem) {
        channel?.send({ type: "broadcast", event: "renamed", payload: { id: me } });
        renderAll();
      }
      return problem;
    },
    keep: keepPapers,
    signOut: () => void supabase.auth.signOut(),
  });
}

function renderTag() {
  const names = [...walkers.keys()].map(who).sort((a, b) => (a === "you" ? -1 : b === "you" ? 1 : a.localeCompare(b)));
  const held = [...filings.values()]
    .filter((f) => f.filer === me && (HELD.includes(f.status) || unread.has(f.id)))
    .sort((a, b) => a.plot - b.plot);
  const mine = handles.get(me) ?? "…";
  $("tag").innerHTML = `<h1>The Commons</h1><p class="meta">Administered by Gary. Here: ${names.map(esc).join(", ")}</p>
    <p class="meta">On file as <button class="plot-link rename" title="Amend your papers">${esc(mine)}</button>
      ${kept ? "" : `<button class="plot-link keep" title="Pencilled in: kept in this browser only">pencilled in</button>`}</p>
    ${held.length
      ? `<p class="yours"><span class="swatch" style="background:${colourOf(me)}"></span>${held
          .map((f) => `<button data-filing="${f.id}" class="plot-link ${unread.has(f.id) ? "pending" : f.status}" title="${esc(labelOf(f.plot))}">${f.plot}</button>`)
          .join("")}</p>`
      : `<p class="hint">${touch ? "Tap" : "Click"} a plot to read its permit, or an empty one to claim it.</p>`}`;
  for (const b of $("tag").querySelectorAll<HTMLButtonElement>("[data-filing]")) {
    b.addEventListener("click", () => visit(filings.get(Number(b.dataset.filing))!));
  }
  for (const b of $("tag").querySelectorAll(".rename, .keep")) b.addEventListener("click", papers);
}

/** Go to one of our plots: inside if it's granted, otherwise its card on the map. */
function visit(f: Filing) {
  if (BUILT.includes(f.status) && !unread.has(f.id)) {
    closeCard();
    enterFocus(f);
  } else openCard(f.plot);
}

// The card: a plot's permit, a claim form, or Gary's reply to one of ours.
const card = $("card");
let reply: number | null = null; // a filing whose reply the card is showing, rather than the plot
let thunk: number | null = null; // a ruling just opened, to stamp as the card appears
let folded = false; // the card shrunk to its title, out of the way
let cardAt: { x: number; y: number } | null = null; // where it's been dragged to, if it has (CSS px)

function openCard(plot: number, filing: number | null = null) {
  if (selected !== null && selected !== plot) heading = null;
  if (selected !== plot) folded = false;
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
  const f = reply !== null ? filings.get(reply) : heldPlots().get(plot);
  const def = plotById(plot)!;
  const fresh = thunk !== null && thunk === f?.id;
  thunk = null;
  const enter = f && BUILT.includes(f.status) && !unread.has(f.id) ? `<button class="enter">Step inside</button>` : "";
  let body: string;
  if (folded) {
    body = `<h2>${f && reply !== null ? "A reply from Gary" : esc(plotLabel(def))}</h2>${enter}`;
  } else if (f && reply !== null) {
    body = `<h2>A reply from Gary</h2>${exchange(f, fresh)}${enter}`;
  } else if (f) {
    body = `<h2>${esc(plotLabel(def))}</h2><p class="meta where">${esc(REGIONS[def.region].name)}</p>
      <p>Held by ${esc(who(f.filer))}: <q>${esc(f.intent)}</q></p>
      ${enter}${ruling(f, fresh)}${conditionHtml(f)}<p class="meta">Filing ${pad(f.id)}</p>`;
  } else {
    body = `${particulars(def)}
      <form><label class="intent">Your intent, in one breath
      <textarea rows="2" maxlength="120" placeholder="a bench, for looking at the pond with" required></textarea></label>
      <button>Submit to Gary</button><p class="problem"></p></form>`;
  }
  card.innerHTML = `<div class="bar"><button class="fold" aria-label="${folded ? "Unfold" : "Fold up"}">${folded ? "+" : "–"}</button><button class="close" aria-label="Close">×</button></div>${body}`;
  card.classList.toggle("folded", folded);
  card.hidden = false;
  card.querySelector(".close")!.addEventListener("click", closeCard);
  card.querySelector(".fold")!.addEventListener("click", () => {
    folded = !folded;
    renderCard();
  });
  if (f) card.querySelector(".enter")?.addEventListener("click", () => walkInto(f));
  const form = card.querySelector("form");
  if (form) {
    const box = form.querySelector("textarea")!;
    box.value = typed;
    if (typing) box.focus();
    // Enter files it; an intent is one breath, so there's no need for a second line.
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      void claim(plot, form);
    });
  }
  const shape = card.querySelector<HTMLCanvasElement>("canvas.shape");
  if (shape) drawShape(shape, def);
  placeCard();
}

/** An unclaimed plot's particulars, set out like the schedule to a deed. */
function particulars(p: PlotDef) {
  const r = REGIONS[p.region];
  return `<div class="schedule">
      <p class="form-no"><span>Schedule of particulars</span><span>Unclaimed</span></p>
      <h2>${esc(plotLabel(p))}</h2>
      <div class="deed">
        <canvas class="shape" width="${p.w}" height="${p.h}" title="The plot, north at the top"></canvas>
        <dl>
          <dt>Ground</dt><dd>${esc(r.name)}</dd>
          <dt>Area</dt><dd>${Math.round(p.area / 10) * 10} sq. yd.</dd>
          <dt>Sun</dt><dd>${r.sun}</dd><dt>Wind</dt><dd>${r.wind}</dd>
          <dt>Soil</dt><dd>${esc(r.soil)}</dd>
        </dl>
      </div>
      <p class="blurb">${esc(r.blurb)}</p>
      <ol class="particulars">${p.particulars.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
      <p class="covenant"><b>Covenant.</b> ${esc(r.covenant)}</p>
    </div>`;
}

/** The plot's outline, drawn small: its mask in its own ground's colour, and its features. */
function drawShape(c: HTMLCanvasElement, p: PlotDef) {
  const ctx = c.getContext("2d")!;
  const g = document.createElement("canvas");
  g.width = p.w * ZOOM;
  g.height = p.h * ZOOM;
  paintGround(g.getContext("2d")!, empty(p), p.id, p);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(g, 0, 0, p.w, p.h);
  ctx.fillStyle = "#402e3a";
  for (const f of p.features) ctx.fillRect(f.x, f.y, f.w, f.h);
}

async function claim(plot: number, form: HTMLFormElement) {
  const box = form.querySelector("textarea")!;
  const button = form.querySelector("button")!;
  button.disabled = true;
  const problem = await fileClaim(plot, box.value.trim());
  button.disabled = false;
  form.querySelector(".problem")!.textContent = problem ?? "";
  if (problem) return;
  box.value = "";
  letters.push({ plot, out: true });
  closeCard();
}

/** Hang the card beside its plot, above or below, kept on screen. */
function placeCard() {
  if (card.hidden || selected === null) return;
  if (phone.matches) return void (card.style.left = card.style.top = "");
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  if (cardAt) {
    card.style.left = `${clamp(cardAt.x, 8, canvas.width / dpr - w - 8)}px`;
    card.style.top = `${clamp(cardAt.y, 8, canvas.height / dpr - h - 8)}px`;
    return;
  }
  const p = plotById(selected)!;
  const v = mapView;
  const x = (v.ox + (p.x + p.w / 2) * v.s) / dpr - w / 2;
  let y = (v.oy + p.y * v.s) / dpr - h - 12;
  if (y < 8) y = (v.oy + (p.y + p.h) * v.s) / dpr + 12;
  card.style.left = `${clamp(x, 8, canvas.width / dpr - w - 8)}px`;
  card.style.top = `${clamp(y, 8, canvas.height / dpr - h - 8)}px`;
}

// Drag the card anywhere (not on a phone, where it's a sheet); it stays put after.
let carrying: { dx: number; dy: number } | null = null;
card.addEventListener("pointerdown", (e) => {
  if (phone.matches || e.button !== 0 || (e.target as HTMLElement).closest("button, input, textarea, a, label")) return;
  e.preventDefault();
  carrying = { dx: e.clientX - card.offsetLeft, dy: e.clientY - card.offsetTop };
  card.setPointerCapture(e.pointerId);
});
card.addEventListener("pointermove", (e) => {
  if (!carrying) return;
  cardAt = { x: e.clientX - carrying.dx, y: e.clientY - carrying.dy };
  placeCard();
});
card.addEventListener("pointerup", () => void (carrying = null));

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
      <q>${esc(f.intent)}</q><span class="meta">${esc(labelOf(f.plot))} — ${esc(who(f.filer))}</span></div>`;
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
  prop: touch ? "Touch and slide; it goes down where you let go." : "Click to place it. Right-click takes things down.",
  ground: "Drag to paint the ground.",
  move: "Drag things about.",
  remove: `${touch ? "Tap" : "Click"} something to take it down.`,
  item: `${touch ? "Touch, slide and let go" : "Click"} to set it down. Gary reads the label before anyone else does.`,
};

function renderBuildInfo() {
  if (!focus) return;
  const f = focus;
  const p = plotOf(f);
  const count = built.get(f.id)?.length ?? 0;
  $("build-info").innerHTML = `<h2>${esc(plotLabel(p))}</h2><p class="meta where">${esc(REGIONS[p.region].name)}, ${Math.round(p.area / 10) * 10} sq. yd.</p>
    <p>${f.filer === me ? "Yours" : `Held by ${esc(who(f.filer))}`}: <q>${esc(f.intent)}</q></p>
    ${foldCondition(f)}
    ${f.filer === me
      ? `<p class="hint">Building on a granted plot needs no further paperwork. Gary finds this difficult.</p>`
      : `<p class="meta">${count ? `${count} thing${count === 1 ? "" : "s"} built.` : "Nothing built yet."}</p>`}`;
  $("tool-hint").textContent = HINTS[tool.split(":")[0]];
  if (f.filer === me) {
    if (drawnHere(f).map((d) => d.look).join() !== drawnKey) renderPalette();
    renderTools(f);
  }
  fitFocus(); // the info's height moves the plot on an upright screen
}

/** On a phone the condition folds away, so the plot gets the screen; keep it as it was left. */
let conditionOpen = false;
function foldCondition(f: Filing) {
  const html = conditionHtml(f);
  if (!html || !phone.matches) return html;
  return `<details class="fold"${conditionOpen ? " open" : ""}><summary>Condition${f.met_at ? ", met" : BUILT.includes(f.status) ? ", outstanding" : ""}</summary>${html}</details>`;
}

$("build-info").addEventListener("toggle", (e) => {
  conditionOpen = (e.target as HTMLDetailsElement).open;
  fitFocus();
}, true);

/** Flip the toolbar's classes; it only exists on your own plot. */
function renderTools(f: Filing) {
  const wants = new Set(f.wants && !f.met_at ? [f.wants] : []);
  for (const b of $("palette").querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    b.classList.toggle("on", b.dataset.tool === tool);
    b.classList.toggle("wanted", wants.has(b.dataset.tool!.slice(5)));
  }
  $("palette").querySelector(".write-in")?.classList.toggle("on", tool.startsWith("item:"));
  for (const b of $("palette").querySelectorAll<HTMLButtonElement>("[data-size]")) b.classList.toggle("on", Number(b.dataset.size) === size);
  for (const g of $("palette").querySelectorAll<HTMLElement>("[data-group]")) {
    g.classList.toggle("open", g.dataset.group === openGroup);
    $("tabs").querySelector(`[data-tab="${g.dataset.group}"]`)?.classList.toggle("wanted", !!g.querySelector(".wanted"));
  }
  for (const b of $("tabs").querySelectorAll<HTMLButtonElement>("[data-tab]")) b.classList.toggle("on", b.dataset.tab === openGroup);
}

const icons = new Map<string, string>();

function icon(key: string, make: () => HTMLCanvasElement) {
  if (!icons.has(key)) icons.set(key, make().toDataURL());
  return icons.get(key)!;
}

/** A square of one ground, cut from a patch of it on this plot's kind of land. */
function swatch(ch: string, p: PlotDef) {
  const patch: PlotDef = { ...p, w: 5, h: 5, mask: "#".repeat(25), features: [] };
  const full = document.createElement("canvas");
  full.width = full.height = 5 * ZOOM;
  paintGround(full.getContext("2d")!, ch.repeat(25), 3, patch);
  const c = document.createElement("canvas");
  c.width = c.height = 12;
  c.getContext("2d")!.drawImage(full, -4, -4);
  return c;
}

/** The written-in things on a plot Gary has drawn, one of each. */
function drawnHere(f: Filing) {
  const seen = new Map<string, { label: string; look: string }>();
  for (const p of built.get(f.id) ?? []) {
    if (p.prop !== "item" || !p.label_ok || !p.sprite) continue;
    const name = look(p);
    if (!seen.has(name)) seen.set(name, { label: p.label!.trim(), look: name });
  }
  return [...seen.values()];
}
let drawnKey = ""; // which drawings the toolbar has buttons for

/** The toolbar, built once per visit (and when Gary finishes a drawing); tool changes only flip classes. */
function renderPalette() {
  const mine = focus?.filer === me;
  $("tools").hidden = !mine;
  if (!mine) return;
  const p = plotOf(focus!);
  drawnKey = drawnHere(focus!).map((d) => d.look).join();
  const button = (t: Tool, title: string, inner: string) =>
    `<button data-tool="${t}" title="${title}">${inner}</button>`;
  const group = (name: string, inner: string) =>
    `<div class="group" data-group="${name}"><h3>${name}</h3><div class="row">${inner}</div></div>`;
  $("palette").innerHTML = [
    group("Tools", button("move", "move things", "move") + button("resize", "make a thing bigger, then back again", "resize") + button("remove", "take down", "take down")
      + SCALES.map((k) => `<button data-size="${k}" title="build things ${k} times over">${k}×</button>`).join("")),
    `<div id="tabs"></div>`,
    group("Ground", BRUSHES.map((ch) =>
      button(`ground:${ch}`, groundLabel(ch, p), `<img src="${icon(`ground:${ch}:${p.region}`, () => swatch(ch, p))}" width="24" alt="${groundLabel(ch, p)}">`),
    ).join("")),
    ...PALETTE.map(({ group: name, props }) => group(name, props
      .map((p) => button(`prop:${p}`, p, `<img src="${icon(p, () => propCanvas(p))}" width="${Math.min(propSize(p).w * 2, 40)}" alt="${p}">`))
      .join(""))),
    // Anything not in the palette, by name: it goes down as a labelled parcel. What Gary has drawn here, again in a tap.
    group("Write in", drawnHere(focus!).map((d) => button(`item:${esc(d.label)}`, esc(d.label), `<img src="${propCanvas(d.look).toDataURL()}" width="${Math.min(propSize(d.look).w * 2, 40)}" alt="${esc(d.label)}">`)).join("")
      + `<form class="write-in"><input maxlength="24" placeholder="a lobster" aria-label="something of your own" required><button>Use</button></form>`),
  ].join("");
  // On a phone the groups are tabs, one open at a time; Tools stays out.
  const names = ["Ground", ...PALETTE.map((g) => g.group), "Write in"];
  $("tabs").innerHTML = names.map((n) => `<button data-tab="${n}">${n}</button>`).join("");
  for (const b of $("tabs").querySelectorAll<HTMLButtonElement>("[data-tab]")) {
    b.addEventListener("click", () => {
      openGroup = b.dataset.tab!;
      renderBuildInfo();
    });
  }
  const writeIn = $("palette").querySelector<HTMLFormElement>(".write-in")!;
  writeIn.addEventListener("submit", (e) => {
    e.preventDefault();
    tool = `item:${writeIn.querySelector("input")!.value.trim()}`;
    renderBuildInfo();
  });
  for (const b of $("palette").querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    b.addEventListener("click", () => {
      tool = b.dataset.tool!;
      renderBuildInfo();
    });
  }
  for (const b of $("palette").querySelectorAll<HTMLButtonElement>("[data-size]")) {
    b.addEventListener("click", () => {
      size = Number(b.dataset.size);
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
  openGroup = PALETTE.find((g) => f.wants && !f.met_at && g.props.includes(f.wants))?.group ?? openGroup;
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
let dpr = 1; // device pixels per CSS pixel: views are in device pixels, the DOM in CSS
let focusView: View = { s: 1, ox: 0, oy: 0 };

/** The biggest whole-pixel view of w x h, centred, leaving `below` px clear at the bottom. */
function fit(w: number, h: number, below = 0, above = 0): View {
  const room = canvas.height - below - above;
  const s = Math.max(1, Math.floor(Math.min(canvas.width / w, room / h)));
  return { s, ox: Math.floor((canvas.width - w * s) / 2), oy: above + Math.floor((room - h * s) / 2) };
}

/**
 * The map whole if it fits at a tappable size; otherwise (a phone held upright)
 * bigger than the screen, with the view following you about in follow().
 */
function fitMap(): View {
  const whole = fit(MAP_W, MAP_H);
  const s = Math.max(whole.s, Math.min(Math.round(2 * dpr), Math.floor(canvas.height / MAP_H)));
  return s === whole.s ? whole : { s, ox: 0, oy: 0 };
}

// Dragged, the map stays where it's put until you set off somewhere; then it glides back to you.
let camera: { ox: number; oy: number } | null = null;
let gliding = false;
let panning: { x: number; y: number; ox: number; oy: number; moved: boolean } | null = null;

function release() {
  if (camera) gliding = true;
  camera = null;
}

/**
 * Centre the map on us along any side it overflows, stopping at its edges, in
 * the room above whatever paper sits along the bottom (a phone held upright).
 */
function follow() {
  const self = walkers.get(me);
  const { s } = mapView;
  const low = !card.hidden ? card : $("tag");
  const room = phone.matches ? (low.offsetTop - 8) * dpr : canvas.height;
  const axis = (room: number, art: number, at: number | undefined, held: number | undefined) =>
    room >= art * s ? Math.floor((room - art * s) / 2) : Math.round(clamp(held ?? room / 2 - (at ?? art / 2) * s, room - art * s, 0));
  const ox = axis(canvas.width, MAP_W, self?.x, camera?.ox);
  const oy = axis(room, MAP_H, self?.y, camera?.oy);
  if (camera) Object.assign(camera, { ox, oy });
  if (gliding) {
    mapView.ox += Math.round((ox - mapView.ox) * 0.2);
    mapView.oy += Math.round((oy - mapView.oy) * 0.2);
    gliding = Math.abs(ox - mapView.ox) > 2 || Math.abs(oy - mapView.oy) > 2;
    if (gliding) return;
  }
  mapView.ox = ox;
  mapView.oy = oy;
}

/** Up close, clear of the toolbar when there is one. */
/** The plot between the papers: below the info as well as above the tools when the screen is upright. */
function fitFocus() {
  const tools = $("tools");
  const info = $("build-info");
  const f = focus ?? zoom?.filing;
  if (!f) return;
  const below = focus && !tools.hidden ? (tools.offsetHeight + 16) * dpr : 0;
  const above = focus && canvas.height > canvas.width ? (info.offsetTop + info.offsetHeight + 8) * dpr : 0;
  const { w, h } = focusSize(plotOf(f));
  focusView = fit(w, h, below, above);
}

function resize() {
  const box = $("field").getBoundingClientRect();
  // Draw at the screen's real resolution: sharper, and finer whole-pixel steps
  // to fit the map with, which matters most on a phone.
  dpr = devicePixelRatio || 1;
  canvas.width = Math.floor(box.width * dpr);
  canvas.height = Math.floor(box.height * dpr);
  canvas.style.width = `${box.width}px`;
  canvas.style.height = `${box.height}px`;
  ctx.imageSmoothingEnabled = false;
  mapView = fitMap();
  fitFocus();
}

function toArt(e: MouseEvent, v: View) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * dpr - v.ox) / v.s, y: ((e.clientY - r.top) * dpr - v.oy) / v.s };
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
  const { x: left, y: top } = plotOf(z.filing);
  const s0 = mapView.s;
  const s1 = focusView.s * ZOOM;
  const s = Math.round(s0 * (s1 / s0) ** ease(Math.min(1, u / 0.8)));
  const k = s1 === s0 ? 1 : (s - s0) / (s1 - s0);
  const from = { x: mapView.ox + s0 * left, y: mapView.oy + s0 * top };
  const to = { x: focusView.ox + focusView.s * FOCUS_PAD, y: focusView.oy + focusView.s * FOCUS_PAD };
  fill(VOID);
  viewport({
    s,
    ox: Math.round(from.x + (to.x - from.x) * k - s * left),
    oy: Math.round(from.y + (to.y - from.y) * k - s * top),
  });
  draw(ctx, { held: heldPlots(), built, me, hover: null, selected: null, walkers: [...walkers.values()], look: lookOf, letters: [], t: Date.now(), recent: recent() });
  const fade = Math.max(0, (u - 0.65) / 0.35);
  if (fade > 0) {
    ctx.globalAlpha = fade;
    fill(SURROUND);
    viewport(focusView);
    drawFocus(ctx, focusScene(z.filing), now);
    ctx.globalAlpha = 1;
  }
  if (t >= 1) zoom = null;
}

// --- up close: building ----------------------------------------------------

/** A build-space point, or null off the plot. */
/** A finger hides what it's placing, so a touch places a little above itself. */
const LIFT = 48; // CSS px

/** A build-space point over the plot's box, or null off it. */
function toBuild(e: MouseEvent) {
  if (!focus) return null;
  const plot = plotOf(focus);
  const p = toArt(e, focusView);
  const lift = placing && (e as PointerEvent).pointerType !== "mouse" ? (LIFT * dpr) / focusView.s : 0;
  const b = { x: p.x - FOCUS_PAD, y: p.y - FOCUS_PAD - lift };
  return b.x >= 0 && b.y >= 0 && b.x < plot.w * ZOOM && b.y < plot.h * ZOOM ? b : null;
}

/** Where a prop would go: centred on the point, snapped to cells, kept inside the plot's box. */
function propAt(prop: string, bx: number, by: number) {
  const plot = plotOf(focus!);
  const { w, h } = propSize(prop);
  return {
    x: clamp(Math.round((bx - w / 2) / ZOOM), 0, Math.floor((plot.w * ZOOM - w) / ZOOM)),
    y: clamp(Math.round((by - h / 2) / ZOOM), 0, Math.floor((plot.h * ZOOM - h) / ZOOM)),
  };
}

/** The 2x2 cells a ground brush covers, centred on the nearest cell corner. */
function brushAt(bx: number, by: number): Cells {
  const plot = plotOf(focus!);
  return {
    x: clamp(Math.round(bx / ZOOM) - 1, 0, plot.w - 2),
    y: clamp(Math.round(by / ZOOM) - 1, 0, plot.h - 2),
    w: 2,
    h: 2,
  };
}

function focusScene(f: Filing): FocusScene {
  const mine = f.filer === me && !zoom;
  const ps = built.get(f.id) ?? [];
  const scene: FocusScene = { plot: plotOf(f), filing: f, built: ps, mine: f.filer === me, ghost: null, brush: null, hover: null };
  if (!mine || !pointer) return scene;
  const [kind, arg] = tool.split(":");
  if (drag) {
    const moved = { ...drag.p, x: drag.x, y: drag.y };
    scene.built = ps.map((p) => (p.id === moved.id ? moved : p));
    scene.hover = { p: moved, colour: "#fff8e0" };
  } else if (kind === "prop" || kind === "item") {
    const prop = sized(kind === "item" ? drawnAs(tool.slice(5)) : arg, size);
    scene.ghost = { id: 0, filing: f.id, prop, ...propAt(prop, pointer.x, pointer.y) };
  } else if (kind === "ground") {
    scene.brush = brushAt(pointer.x, pointer.y);
  } else {
    const p = placementAt(ps, pointer.x, pointer.y);
    if (p) scene.hover = { p, colour: kind === "remove" ? "#e05c48" : "#fff8e0" };
  }
  return scene;
}

/** Written-in items' names, hung over them up close. Unread or declined ones are just parcels, except to their builder. */
function labelItems() {
  const box = $("labels");
  const f = focus;
  const items = f && !zoom ? (built.get(f.id) ?? []).filter((p) => p.prop === "item") : [];
  while (box.children.length < items.length) box.append(Object.assign(document.createElement("div"), { className: "item-label" }));
  while (box.children.length > items.length) box.lastChild!.remove();
  items.forEach((p, i) => {
    const { w } = propSize(look(p));
    const el = box.children[i] as HTMLElement;
    const text = p.label_ok
      ? p.label!
      : f!.filer !== me ? "a parcel" : p.label_ok === false ? "a parcel (Gary declined the label)" : `${p.label} (Gary is reading it)`;
    if (el.textContent !== text) el.textContent = text;
    const at = drag?.p.id === p.id ? drag : p;
    el.style.left = `${(focusView.ox + (FOCUS_PAD + at.x * ZOOM + w / 2) * focusView.s) / dpr}px`;
    el.style.top = `${(focusView.oy + (FOCUS_PAD + at.y * ZOOM - 1) * focusView.s) / dpr}px`;
  });
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

/** The next size up that fits where it stands, round to the plain one again. */
async function regrow(b: { x: number; y: number }) {
  if (!focus) return;
  const plot = plotOf(focus);
  const p = placementAt(built.get(focus.id) ?? [], b.x, b.y);
  if (!p) return;
  const from = p.size ?? 1;
  const to = SCALES.find((k) => k > from && canPlace(plot, look({ ...p, size: k }), p.x, p.y)) ?? 1;
  if (to === from) return problem("There isn't room for it any bigger.");
  problem("");
  setPlacement({ ...p, size: to });
  const err = await move(p.id, p.x, p.y, to);
  if (err) {
    setPlacement(p);
    problem(err);
  }
}

async function placeAt(prop: string, b: { x: number; y: number }, label?: string) {
  const f = focus!;
  const shape = sized(label ? drawnAs(label) : prop, size);
  const at = propAt(shape, b.x, b.y);
  if (!canPlace(plotOf(f), shape, at.x, at.y)) return problem("It has to stand on the plot, and not on what's already there.");
  const result = await place(f.id, at.x, at.y, prop, size, label);
  if (typeof result === "string") return problem(result);
  problem("");
  land(result.id);
  addPlacement(result);
}

/** Lay ground along the brush's path since the last point, so a quick drag leaves no gaps. */
function paintTo(to: Cells) {
  if (!stroke || !focus) return;
  const plot = plotOf(focus);
  const ch = tool.split(":")[1];
  const from = stroke.last;
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(from.x + ((to.x - from.x) * i) / steps);
    const y = Math.round(from.y + ((to.y - from.y) * i) / steps);
    for (let dy = 0; dy < to.h; dy++)
      for (let dx = 0; dx < to.w; dx++) if (canPaint(plot, x + dx, y + dy)) stroke.cells[(y + dy) * plot.w + x + dx] = ch;
  }
  stroke.last = to;
  focus.ground = stroke.cells.join("");
  painted.set(focus.id, focus.ground);
}

canvas.addEventListener("pointerdown", (e) => {
  if (!focus || zoom || !mineInFocus()) return;
  const [kind] = tool.split(":");
  placing = e.button === 0 && (kind === "prop" || kind === "item");
  const b = toBuild(e);
  if (!b) return void (placing = false);
  pointer = b;
  if (e.button === 2 || kind === "remove") return takeDown(b);
  if (kind === "resize") return void regrow(b);
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  if (kind === "ground") {
    const before = focus.ground ?? empty(plotOf(focus));
    const at = brushAt(b.x, b.y);
    stroke = { cells: before.split(""), before, last: at };
    paintTo(at);
  } else if (kind === "move") {
    const p = placementAt(built.get(focus.id) ?? [], b.x, b.y);
    if (p) drag = { p, dx: b.x - p.x * ZOOM, dy: b.y - p.y * ZOOM, x: p.x, y: p.y };
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!focus && panning) {
    const dx = (e.clientX - panning.x) * dpr, dy = (e.clientY - panning.y) * dpr;
    if (!panning.moved && Math.hypot(dx, dy) > 8 * dpr) {
      panning.moved = true;
      clearTimeout(holding);
    }
    if (panning.moved) {
      gliding = false;
      camera = { ox: panning.ox + dx, oy: panning.oy + dy };
    }
  }
  if (!focus) {
    const p = toArt(e, mapView);
    mouse = p;
    hover = plotAt(p.x, p.y)?.id ?? null;
    return;
  }
  const b = toBuild(e);
  if (!b) {
    if (!stroke && !drag && !placing) pointer = null;
    return;
  }
  pointer = b;
  if (stroke) paintTo(brushAt(b.x, b.y));
  if (drag) {
    const { w, h } = propSize(look(drag.p));
    Object.assign(drag, propAt(look(drag.p), b.x - drag.dx + w / 2, b.y - drag.dy + h / 2));
  }
});

canvas.addEventListener("pointerup", async (e) => {
  if (placing) {
    placing = false;
    const at = pointer;
    if (e.pointerType !== "mouse") pointer = null;
    if (!at || !focus) return;
    const [kind, arg] = tool.split(":");
    return void (kind === "item" ? placeAt("item", at, tool.slice(5)) : placeAt(arg, at));
  }
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
    if (focus && !canPlace(plotOf(focus), look(p), x, y)) return problem("It has to stand on the plot, and not on what's already there.");
    setPlacement({ ...p, x, y });
    const err = await move(p.id, x, y);
    if (err) {
      setPlacement(p);
      problem(err);
    }
  }
});

canvas.addEventListener("pointercancel", () => void (placing = false));

canvas.addEventListener("pointerleave", () => {
  hover = null;
  mouse = null;
  if (!stroke && !drag) pointer = null;
});

canvas.addEventListener("contextmenu", (e) => {
  if (focus || onBoard(toArt(e, mapView))) e.preventDefault(); // a long press on the board is a hold, not a menu
});

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (papersOpen()) return;
  if (reading !== null) {
    reading = null;
    renderBoard();
  } else if (!board.hidden) closeBoard();
  else if (focus) leaveFocus();
  else closeCard();
});

// Arrow keys walk you about the commons, for as long as they're held.
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const pressed = new Set<string>();
function arrows(e: KeyboardEvent) {
  if (!(e.key in ARROWS) || papersOpen() || (e.target as HTMLElement).closest?.("input, textarea")) return;
  e.preventDefault();
  const was = pressed.size;
  if (e.type === "keydown") pressed.add(e.key);
  else pressed.delete(e.key);
  const self = walkers.get(me);
  if (!self || focus || zoom || (e.repeat && pressed.size === was)) return;
  heading = null;
  waypoints = [];
  free = true;
  release();
  const [dx, dy] = [...pressed].reduce(([x, y], k) => [x + ARROWS[k][0], y + ARROWS[k][1]], [0, 0]);
  walkTo(clamp(self.x + dx * 1000, 2, MAP_W - 2), clamp(self.y + dy * 1000, 8, MAP_H - 1));
}
window.addEventListener("keydown", arrows);
window.addEventListener("keyup", arrows);
window.addEventListener("blur", () => pressed.clear());

/** The granted plot under a map point, if any: the ones you can step inside. */
function enterableAt(e: MouseEvent) {
  const p = toArt(e, mapView);
  const plot = plotAt(p.x, p.y);
  const f = plot && heldPlots().get(plot.id);
  return f && BUILT.includes(f.status) ? f : null;
}

// Double-click a plot to step inside, or the path round it to step out.
canvas.addEventListener("dblclick", (e) => {
  if (zoom) return;
  if (!focus) {
    if (onGary(toArt(e, mapView))) return void summon();
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

/** Walk somewhere along the paths, then do something there. */
function goTo(x: number, y: number, then: () => void) {
  const self = walkers.get(me);
  if (!self || Math.hypot(self.x - x, self.y - y) < 1) return then();
  walkAlong(x, y);
  heading = then;
}

/** Walk round to a plot's gate, in view, and step inside on arrival. */
function walkInto(f: Filing) {
  const g = plotOf(f).gate;
  closeCard();
  release();
  goTo(g.x, g.y, () => enterFocus(f));
}

/** Whether a map point is on Gary, give or take a pixel. */
function onGary(p: { x: number; y: number }) {
  const g = garyAt(Date.now(), recent());
  return Math.abs(p.x - g.x) <= 6 && p.y >= g.y - 13 && p.y <= g.y + 1;
}

const onBoard = (p: { x: number; y: number }) => {
  const b = BOARD_BOX();
  return p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;
};

/** Gary says something, for a few seconds. */
let said: { line: string; until: number } | null = null;
function speak(line?: string) {
  const lines = GARY_LINES.filter((l) => l !== said?.line);
  said = { line: line ?? lines[Math.floor(Math.random() * lines.length)], until: performance.now() + 4500 };
  $("bubble").textContent = said.line;
}

/** Double-clicked, Gary comes round your outstanding conditions now. */
async function summon() {
  const n = await summonGary();
  speak(n === null ? "Not now. The kettle." : n ? "Right. I'll come round now." : "Nothing outstanding that I haven't already seen.");
}

// Hold the notice board for five seconds and the back office opens (src/backoffice.ts).
let holding: number | undefined;
let heldOpen = false; // the click that ends a hold that opened it isn't a click
let panned = false; // nor is the one that ends a drag
canvas.addEventListener("pointerdown", (e) => {
  heldOpen = false;
  panned = false;
  if (!focus && !zoom && e.button === 0) panning = { x: e.clientX, y: e.clientY, ox: mapView.ox, oy: mapView.oy, moved: false };
  if (focus || zoom || !onBoard(toArt(e, mapView))) return;
  holding = window.setTimeout(async () => {
    heldOpen = true;
    const { backoffice } = await import("./backoffice.ts");
    backoffice({
      me, filings, arrive, papers, speak,
      selected: () => (selected !== null ? (heldPlots().get(selected)?.id ?? null) : null),
      freePlot: () => {
        const held = heldPlots();
        if (selected !== null && !held.has(selected)) return selected;
        return PLOTS.find((p) => !held.has(p.id))?.id ?? null;
      },
    });
  }, 5000);
});
for (const ev of ["pointerup", "pointercancel", "pointerleave"]) {
  canvas.addEventListener(ev, () => {
    clearTimeout(holding);
    panned = !!panning?.moved;
    panning = null;
  });
}

canvas.addEventListener("click", (e) => {
  if (focus || zoom || heldOpen || panned) return;
  heading = null;
  const p = toArt(e, mapView);
  if (onGary(p)) return speak();
  if (onBoard(p)) {
    closeCard();
    return goTo(LANDMARKS.board.at.x, LANDMARKS.board.at.y, openBoard);
  }
  const plot = plotAt(p.x, p.y);
  if (plot) {
    // Walk to the gate, as one does before filing, and read what's pinned there.
    openCard(plot.id);
    return walkAlong(plot.gate.x, plot.gate.y);
  }
  closeCard(); // just out for a walk
  release();
  walkAlong(p.x, p.y);
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

/** Walk somewhere, by the paths where they go that way, leg by leg; never into the water. */
function walkAlong(x: number, y: number) {
  const self = walkers.get(me);
  if (!self) return;
  heading = null;
  free = false;
  waypoints = route(self, { x, y }).slice(1);
  const next = waypoints.shift();
  if (next) walkTo(next.x, next.y);
}

function step(dt: number) {
  for (const w of walkers.values()) {
    const dx = w.tx - w.x;
    const dy = w.ty - w.y;
    const dist = Math.hypot(dx, dy);
    w.moving = dist >= 0.01;
    if (!w.moving) {
      // A leg that ends where we already stand is done: on to the next, or there.
      if (w.id !== me) continue;
      if (waypoints.length) {
        const next = waypoints.shift()!;
        walkTo(next.x, next.y);
      } else if (heading && !focus && !zoom) {
        const then = heading;
        heading = null;
        then();
      }
      continue;
    }
    if (Math.abs(dx) > 0.01) w.facing = Math.sign(dx);
    const move = Math.min(dist, SPEED * dt);
    const nx = w.x + (dx / dist) * move, ny = w.y + (dy / dist) * move;
    // The arrow keys stop at water, wood and walls; routes go round them.
    if (w.id === me && free && !walkable(nx, ny) && walkable(w.x, w.y)) {
      w.tx = w.x;
      w.ty = w.y;
      w.moving = false;
      continue;
    }
    w.x = nx;
    w.y = ny;
    // The next leg of a walk along the paths.
    if (w.id === me && move === dist && waypoints.length) {
      const next = waypoints.shift()!;
      walkTo(next.x, next.y);
      continue;
    }
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
  const screen = (x: number, y: number) => ({
    left: `${(mapView.ox + x * mapView.s) / dpr}px`,
    top: `${(mapView.oy + y * mapView.s) / dpr}px`,
  });
  const gary = garyAt(t, recent());
  const bubble = $("bubble");
  bubble.hidden = !said || now > said.until;
  if (!bubble.hidden) Object.assign(bubble.style, screen(gary.x, gary.y - 17));
  const tag = $("nametag");
  const over = mouse && [...walkers.values()].find((w) => Math.abs(mouse!.x - w.x) <= 5 && mouse!.y >= w.y - 14 && mouse!.y <= w.y + 1);
  const name = over ? who(over.id) : mouse && onGary(mouse) ? "Gary" : mouse && onBoard(mouse) ? "the notice board" : null;
  const b = BOARD_BOX();
  tag.hidden = !name || !bubble.hidden && name === "Gary";
  if (name) {
    tag.textContent = name;
    const at = over ?? (name === "Gary" ? gary : { x: b.x + b.w / 2, y: b.y + 1 });
    Object.assign(tag.style, screen(at.x, at.y - (over ? 18 : name === "Gary" ? 15 : 2)));
  }
  canvas.style.cursor = name && !over ? "pointer" : hover !== null ? "pointer" : "";
}

let last = performance.now();
function frame(now: number) {
  step(Math.min((now - last) / 1000, 0.1));
  last = now;
  if (zoom) {
    drawZoom(now);
  } else if (focus) {
    fill(SURROUND);
    viewport(focusView);
    drawFocus(ctx, focusScene(focus), now);
    labelItems();
    canvas.style.cursor = mineInFocus() && pointer ? (tool === "move" ? (drag ? "grabbing" : "grab") : "crosshair") : "";
  } else {
    fill(VOID);
    follow();
    viewport(mapView);
    const t = Date.now();
    draw(ctx, { held: heldPlots(), built, me, hover, selected, walkers: [...walkers.values()], look: lookOf, letters, t, recent: recent() });
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

/** A filing as the database now has it, by Realtime (or from the dev back office). */
async function arrive(f: Filing) {
  // Gary's ruling on one of ours: it comes by post.
  const was = filings.get(f.id);
  if (f.filer === me && (was?.status === "pending" || was?.status === "committee") && f.status !== was.status) {
    unread.add(f.id);
    letters.push({ plot: f.plot, out: false, status: f.status, filing: f.id });
  }
  // His inspection, likewise, unless we're standing on the plot to hear it.
  if (f.filer === me && was && f.inspected_at !== was.inspected_at && focus?.id !== f.id) {
    unread.add(f.id);
    letters.push({ plot: f.plot, out: false, status: f.met_at ? "approved" : "committee", filing: f.id });
  }
  upsert(f);
  handles = await handlesFor([f.filer]);
  renderAll();
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
  if (await afterGoogle()) return; // off to Google again, as the resident that account already is
  me = await signIn();
  kept = !(await pencilled());
  const [loaded, placed] = await Promise.all([loadFilings(), loadPlacements()]);
  for (const f of loaded) upsert(f);
  for (const p of placed) placements.set(p.id, p);
  for (const id of new Set(placed.map((p) => p.filing))) regroup(id);
  handles = await handlesFor([me, ...[...filings.values()].map((f) => f.filer)]);

  const spawn = { x: LANDMARKS.spawn.x + Math.round((Math.random() - 0.5) * 6), y: LANDMARKS.spawn.y };
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
    // Someone renamed: ask the database what they're called now, rather than the message.
    .on("broadcast", { event: "renamed" }, async ({ payload }) => {
      if (typeof payload?.id !== "string" || !walkers.has(payload.id)) return;
      handles = await rehandle(payload.id);
      renderAll();
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
    .on("postgres_changes", { event: "*", schema: "the_commons", table: "filings" }, ({ new: row }) => {
      if (row && "id" in row) void arrive(row as Filing);
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
      renderAll();
    });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") channel.track(spawn);
  });

  renderAll();
  requestAnimationFrame(frame);
  if (!avatarOf(me)) papers(); // first time through the gate
}

resize();
window.addEventListener("resize", resize);
start().catch((err) => {
  $("tag").textContent = `The commons is closed: ${err.message ?? err}`;
});
