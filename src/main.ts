import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { BRUSHES, empty, groundLabel, paintGround } from "./content/ground.ts";
import { drawnAs, look, PALETTE, propCanvas, propSize, SCALES, sized } from "./content/props.ts";
import { BYLAWS } from "./rulebook.ts";
import {
  LANDMARKS, MAP_H, MAP_W, REGIONS, ZOOM, plotAt, plotById, plotLabel, route, slide, walkable, type PlotDef, type Point,
} from "./world/index.ts";
import {
  APPEALS, HELD, nextCourt, avatarOf, fileAppeal, fileClaim, handlesFor, isGuest, keepPapers, logIn, loadAppeals, loadFilings, loadPlacements, move, paint,
  place, placeInside, moveInside, rehandle, saveProfile, signIn, summonGary, supabase, unplace,
  answerTag, fileRetrospective, loadTags, reclaim, summonRounds,
  type Appeal, type Filing, type Placement,
} from "./net.ts";
import { fileChangeOfUse, fileVariation, loadVariations, type Variation } from "./net.ts";
import { scheduleHtml, variationForm, variationHtml } from "./permit.ts";
import { askForPlot, flipSign, loadSpirit, pinNotice, signBook, summonReader, unpinNotice, type Notice, type Visit } from "./net.ts";
import { hasDoor, spiritCardHtml, spiritHtml, styleSpirit } from "./spirit.ts";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { VOID, colourOf, draw, letterPhase, type Letter, type Walker } from "./render.ts";
import {
  FOCUS_PAD, SURROUND, canPaint, canPlace, drawFocus, focusSize, land, placementAt, type Cells, type FocusScene,
} from "./closeup.ts";
import {
  DEFAULT_MATERIAL, DEFAULT_PAINT, MATERIALS, PAINTS, defaultWindows, footprintProblem, frontWallAt, kindOf, materialSwatch, materialsFor,
  onShell, raise, scheduledMaterial, shellKind, windowFits, type Kind as ShellKind,
} from "./shell.ts";
import { saveShell } from "./net.ts";
import type { Shell } from "./schedule.ts";
import { BOARD_BOX } from "./map/landmarks.ts";
import { GARY_LINES, garyAt } from "./life.ts";
import { looksLike } from "./avatar.ts";
import { openDoor, openPapers, papersOpen } from "./papers.ts";
import { isWaiting, letterHtml, poundHtml, thingName, type Tag } from "./letter.ts";
import {
  doorOutside, drawRoom, fitting, fittingKeys, onDoor, roomArt, roomSize, slotAt, spotFor, spriteOf, thingAt, type RoomScene,
} from "./interior.ts";

const SPEED = 40; // art pixels per second
const ZOOM_MS = 520; // map <-> plot

const STAMP: Record<Filing["status"], string> = {
  pending: "In Gary's in-tray",
  approved: "Approved",
  conditional: "Approved with conditions",
  committee: "Referred to committee",
  denied: "Denied",
  refused: "Denied", // crude: private, and appealed only to the committee, but a denial all the same
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
const appeals = new Map<number, Appeal[]>(); // filing -> its appeals, in order
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
let openGroup = "Growing"; // the palette tab showing, on a phone; "Building" anywhere puts the toolbar in building mode
let gardenTool: Tool = "prop:bench"; // what we were holding before building mode, to hand back
let placing = false; // a prop held under the pointer, set down where it's let go
let drag: { p: Placement; dx: number; dy: number; x: number; y: number } | null = null; // moving a prop

const pad = (n: number) => String(n).padStart(4, "0");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);
const touch = matchMedia("(pointer: coarse)").matches;
const phone = matchMedia("(max-width: 600px)"); // papers sit along the bottom, the card as a sheet
const lookOf = (id: string) => looksLike(handles.get(id), avatarOf(id));
const who = (id: string) => (id === me ? "you" : !avatarOf(id) ? "a guest" : (handles.get(id) ?? "a resident"));
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
  // Appealed, the filing reads as first denied, whatever came of it after.
  const heard = appeals.get(f.id) ?? [];
  if (heard.length) return stamped({ ...f, status: "denied" }) + heard.map((a, i) => appealHtml(a, f, heard, fresh && i === heard.length - 1)).join("");
  return stamped(f, fresh);
}

/** Gary's ruling as stamped: the stamp, the bylaw it's under, the permit, and any minutes. */
function stamped(f: Filing, fresh = false) {
  const denied = f.status === "denied" && f.bylaw !== null;
  const region = REGIONS[plotOf(f).region];
  const [cite, text] = !denied ? ["", ""] : f.bylaw ? [`Bylaw ${f.bylaw}`, BYLAWS[f.bylaw! - 1]] : [`the covenant of ${region.name}`, region.covenant];
  return `<p class="stamp ${f.status}${fresh ? " thunk" : ""}">${STAMP[f.status]}${denied ? ` (${f.bylaw ? cite : "covenant"})` : ""}</p>
    ${denied ? `<p class="meta"><b>${cite[0].toUpperCase()}${cite.slice(1)}.</b> ${text}</p>` : ""}
    ${f.permit ? `<p class="permit">${esc(f.permit)}</p>` : ""}
    ${minutesHtml(f)}`;
}

/** One appeal: the plea, and what Gary (or the committee) made of it. */
function appealHtml(a: Appeal, f: Filing, all: Appeal[], fresh: boolean) {
  const under = a.bylaw === null ? "" : ` (${a.bylaw ? `Bylaw ${a.bylaw}` : "covenant"})`;
  const title = a.court === "gary" ? `Appeal ${a.n}.`
    : all.some((b) => b.court === "committee" && b.n < a.n) ? "Final appeal, to the committee."
    : a.plea ? "Appeal to the committee." : "Gone up to the committee.";
  return `<div class="condition"><p><b>${title}</b>${a.plea ? ` <q>${esc(a.plea)}</q>` : ""}</p>
    ${a.heard_at
      ? `<p class="stamp ${a.allowed ? "approved" : "denied"}${fresh ? " thunk" : ""}">${a.allowed ? "Allowed" : `Dismissed${under}`}</p>
        <p class="permit">${esc(a.reply ?? "")}</p>${a.minutes ? membersHtml(a.minutes, f) : ""}`
      : `<p class="stamp pending">${a.court === "gary" ? "In Gary's in-tray" : "Before the committee tonight"}</p>`}</div>`;
}

/** Room to write back about one of our denials, to whoever's next to hear it, if there's anyone left. */
function appealForm(f: Filing) {
  if (f.filer !== me || (f.status !== "denied" && f.status !== "refused") || unread.has(f.id)) return "";
  const made = appeals.get(f.id) ?? [];
  if (made.some((a) => !a.heard_at)) return "";
  const next = nextCourt(f.status, made);
  if (!next) return `<p class="meta">No further appeals. The matter is closed.</p>`;
  if (heldPlots().has(f.plot)) return `<p class="meta">The plot has been claimed since, so there is nothing left to appeal.</p>`;
  const toGary = made.filter((a) => a.court === "gary").length;
  const [label, note] = next === "gary" ? ["Not quite understood? Make your case", `${APPEALS - toGary} of ${APPEALS} left`]
    : made.some((a) => a.court === "committee") ? ["One last plea, against the committee's finding", "This one's final."]
    : f.status === "denied" ? ["Gary's dismissed it twice. Put your case to the committee", "It sits overnight."]
    : ["Gary won't hear an appeal on this himself. Put your case to the committee", "It sits overnight."];
  return `<form class="appeal"><label class="intent">${label}
      <textarea rows="3" maxlength="280" placeholder="it isn't a business: the lemonade is free" required></textarea></label>
      <button>Appeal</button> <span class="meta">${note}</span><p class="problem"></p></form>`;
}

/** Our latest denial on a free plot that could still be appealed, to point to from its card. */
const appealableOn = (plot: number) =>
  [...filings.values()].filter((f) => f.plot === plot && appealForm(f).startsWith("<form")).sort((a, b) => b.id - a.id)[0];

const VOTED = (v: string | null, f: Filing) =>
  !v ? "remarks struck from the record" : v === "approved" ? "in favour" : v === "conditional" ? "in favour, on a condition"
  : v === "refused" ? "against, as still unfit" : v === "against" ? "against, citing no bylaw" : v === "abstain" ? "abstaining"
  : v === "covenant" ? `against, under the covenant of ${REGIONS[plotOf(f).region].name}` : `against, under Bylaw ${v.slice(1)}`;

/** A referral's night in committee: the clerk's finding, then each member in turn. */
function minutesHtml(f: Filing) {
  const m = f.minutes;
  if (!m) return "";
  return `<div class="condition"><p><b>Minutes of the committee.</b> ${esc(m.finding ?? m.outcome)}</p>${membersHtml(m, f)}</div>`;
}

const membersHtml = (m: NonNullable<Filing["minutes"]>, f: Filing) =>
  m.members.map((x) => `<p class="meta"><b>${esc(x.seat)}</b>, ${VOTED(x.vote, f)}.${x.speech ? ` <q>${esc(x.speech)}</q>` : ""}</p>`).join("");

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** The whole exchange: what was asked, when, and everything Gary said back. */
function exchange(f: Filing, fresh = false) {
  return `<p class="meta">Filing ${pad(f.id)}, ${esc(labelOf(f.plot))}. Filed by ${esc(who(f.filer))}, ${when(f.filed_at)}.</p>
    <p><q>${esc(f.intent)}</q></p>
    ${ruling(f, fresh)}
    ${conditionHtml(f, true)}
    ${f.stamped_at && !unread.has(f.id) ? `<p class="meta">Stamped ${when(f.stamped_at)}.</p>` : ""}`;
}

/** The condition on a plot, and what Gary made of it when he last came round. Under a permit
 *  that already quotes it (the card), only whether it's met. */
function conditionHtml(f: Filing, underPermit = false) {
  if (!f.condition || unread.has(f.id)) return "";
  const quoted = underPermit && !!f.permit?.includes(f.condition);
  const said = quoted ? "" : ` ${esc(f.condition)}`;
  if (!BUILT.includes(f.status)) return quoted ? "" : `<p><b>Condition.</b>${said}</p>`;
  const coming = !f.met_at && f.built_at && f.built_at > (f.inspected_at ?? "");
  const note = f.remark
    ? `Gary, on his last visit: <q>${esc(f.remark)}</q>`
    : esc(f.filer === me ? "Gary will come round once you've built something." : "Gary has not yet been round.");
  return `<div class="condition"><p><b>Condition.</b>${said}</p>
    <p class="stamp ${f.met_at ? "approved" : "pending"}">${f.met_at ? "Met" : "Outstanding"}</p> <span class="meta">${note}</span>
    ${coming ? `<p class="meta">He has noticed more building and will be round again once it settles.</p>` : ""}</div>`;
}

// Your papers: name and look, amended from the tag whenever you like.
let guest = true; // only looking round: no name on file, can't file

function papers() {
  openPapers({
    me,
    name: handles.get(me) ?? "",
    avatar: avatarOf(me),
    save: async (name, avatar) => {
      const problem = (await saveProfile(me, name, avatar)) ?? (guest ? await keepPapers() : null);
      if (!problem) {
        guest = false;
        channel?.send({ type: "broadcast", event: "renamed", payload: { id: me } });
        renderAll();
      }
      return problem;
    },
    back: guest ? door : undefined,
    signOut: () => void supabase.auth.signOut({ scope: "local" }),
  });
}

/** The gate: apply, come in under a name already on file, or look round as a guest. */
function door() {
  localStorage.removeItem("looking");
  openDoor({
    apply: papers,
    logIn: async (name) => {
      const problem = await logIn(name);
      if (!problem) location.reload();
      return problem;
    },
    look: () => localStorage.setItem("looking", "1"),
  });
}

function renderTag() {
  const names = [...walkers.keys()].map(who).sort((a, b) => (a === "you" ? -1 : b === "you" ? 1 : a.localeCompare(b)));
  const held = [...filings.values()]
    .filter((f) => f.filer === me && (HELD.includes(f.status) || unread.has(f.id)))
    .sort((a, b) => a.plot - b.plot);
  const mine = handles.get(me) ?? "…";
  $("tag").innerHTML = `<h1>The Commons</h1><p class="meta">Administered by Gary. Here: ${names.map(esc).join(", ")}</p>
    <p class="meta">${guest
      ? `Looking round as a guest. <button class="plot-link door">Come in</button>`
      : `On file as <button class="plot-link rename" title="Amend your papers">${esc(mine)}</button>`}</p>
    ${held.length
      ? `<p class="yours"><span class="swatch" style="background:${colourOf(me)}"></span>${held
          .map((f) => `<button data-filing="${f.id}" class="plot-link ${unread.has(f.id) ? "pending" : f.status}" title="${esc(labelOf(f.plot))}">${f.plot}</button>`)
          .join("")}</p>`
      : `<p class="hint">${touch ? "Tap" : "Click"} a plot to read its permit, or an empty one to claim it.</p>`}`;
  for (const b of $("tag").querySelectorAll<HTMLButtonElement>("[data-filing]")) {
    b.addEventListener("click", () => visit(filings.get(Number(b.dataset.filing))!));
  }
  $("tag").querySelector(".rename")?.addEventListener("click", papers);
  $("tag").querySelector(".door")?.addEventListener("click", door);
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
    body = `<h2>A reply from Gary</h2>${exchange(f, fresh)}${appealForm(f)}${enter}`;
  } else if (f) {
    body = `<h2>${esc(plotLabel(def))}</h2><p class="meta where">${esc(REGIONS[def.region].name)}</p>
      <p>Held by ${esc(who(f.filer))}: <q>${esc(f.intent)}</q></p>
      ${ruling(f, fresh)}${conditionHtml(f, true)}${spiritCardHtml(f, me, guest)}${letterFor(f)}${worksHtml(f)}${variationsHtml(f)}${enter}<p class="meta">Filing ${pad(f.id)}</p>`;
  } else {
    const denial = appealableOn(plot);
    body = `${particulars(def)}
      ${denial ? `<p class="meta">Gary denied your Filing ${pad(denial.id)} here. <button class="plot-link" data-reply="${denial.id}">Appeal it</button></p>` : ""}
      ${guest
        ? `<p class="meta">Guests can't file. <button class="plot-link door">Come in</button> and you can.</p>`
        : `<form><label class="intent">Your intent, in one breath
      <textarea rows="2" maxlength="120" placeholder="a bench, for looking at the pond with" required></textarea></label>
      <button>Submit to Gary</button><p class="problem"></p></form>`}`;
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
  if (f) wireAsk(card, f);
  card.querySelector(".door")?.addEventListener("click", door);
  card.querySelector<HTMLButtonElement>("[data-reply]")?.addEventListener("click", (e) =>
    openCard(plot, Number((e.currentTarget as HTMLButtonElement).dataset.reply)));
  if (f) wireVariation(f, typed, typing);
  wireLetter(card);
  const form = card.querySelector<HTMLFormElement>("form:not(.vary):not(.answer)");
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
      void (form.classList.contains("appeal") && f ? appeal(f, form) : claim(plot, form));
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

async function appeal(f: Filing, form: HTMLFormElement) {
  const box = form.querySelector("textarea")!;
  const button = form.querySelector("button")!;
  button.disabled = true;
  const made = await fileAppeal(f.id, box.value.trim());
  button.disabled = false;
  if (typeof made === "string") return void (form.querySelector(".problem")!.textContent = made);
  box.value = "";
  setAppeal(made);
  letters.push({ plot: f.plot, out: true });
  renderCard();
}

function setAppeal(a: Appeal) {
  const list = (appeals.get(a.filing) ?? []).filter((x) => x.id !== a.id);
  appeals.set(a.filing, [...list, a].sort((x, y) => x.n - y.n));
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

// --- the schedule and variations (slice C) ------------------------------------
// A granted plot's card shows its schedule (src/permit.ts), what's been filed
// against it, and, to its holder, room to go back to Gary.

const variations = new Map<number, Variation[]>(); // filing -> its variations, in order

function setVariation(v: Variation) {
  const list = (variations.get(v.filing) ?? []).filter((x) => x.id !== v.id);
  variations.set(v.filing, [...list, v].sort((a, b) => a.id - b.id));
}

// What the permit covers, folded: it's a reference, not a to-do list. Only its holder needs it.
const worksHtml = (f: Filing) => (f.schedule && f.filer === me && BUILT.includes(f.status) && !unread.has(f.id)
  ? `<details class="fold"><summary>What your permit covers</summary>${scheduleHtml(f.schedule)}</details>` : "");

/** What's been filed against a permit, the latest few; and the form, if it's ours and nothing's before Gary. */
function variationsHtml(f: Filing) {
  if (!BUILT.includes(f.status) || unread.has(f.id)) return "";
  const all = variations.get(f.id) ?? [];
  const open = all.some((v) => v.status === "pending" || v.status === "committee");
  const mine = f.filer === me && !guest;
  return all.slice(-3).map(variationHtml).join("") + (mine && !open ? variationForm(f.schedule?.shell.kind !== "none") : "");
}

function wireVariation(f: Filing, typed: string, typing: boolean) {
  const form = card.querySelector<HTMLFormElement>("form.vary");
  if (!form) return;
  const box = form.querySelector("textarea")!;
  const use = form.querySelector<HTMLInputElement>("[name=use]")!;
  const room = form.querySelector<HTMLSelectElement>("[name=room]");
  box.value = typed;
  if (typing) box.focus();
  use.addEventListener("change", () => {
    box.placeholder = use.checked ? "a tea room" : "a vending machine";
    if (room) room.hidden = use.checked;
  });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const what = box.value.trim();
    form.querySelector("button")!.disabled = true;
    const got = use.checked ? await fileChangeOfUse(f.id, what) : await fileVariation(f.id, what, (room?.value || null) as "in" | "out" | null);
    if (typeof got === "string") {
      form.querySelector("button")!.disabled = false;
      form.querySelector(".problem")!.textContent = got;
      return;
    }
    box.value = "";
    setVariation(got);
    renderCard();
  });
}

// --- up close: the plot's card and the toolbar --------------------------------

const HINTS: Record<string, string> = {
  prop: touch ? "Touch and slide; it goes down where you let go." : "Click to place it. Right-click takes things down.",
  ground: "Drag to paint the ground.",
  move: "Drag things about.",
  remove: `${touch ? "Tap" : "Click"} something to take it down.`,
  item: `${touch ? "Touch, slide and let go" : "Click"} to set it down. Gary reads the label before anyone else does.`,
  shell: "Drag out where it stands. Drag it to move it. The door faces your gate; Gary reads the sign first.",
  window: `${touch ? "Tap" : "Click"} the front wall to put a window in, or take one out.`,
};

function renderBuildInfo() {
  if (!focus) return;
  const f = focus;
  const p = plotOf(f);
  const count = built.get(f.id)?.length ?? 0;
  const restoreTyping = keepSpiritTyping();
  $("build-info").innerHTML = `<h2>${esc(plotLabel(p))}</h2><p class="meta where">${esc(REGIONS[p.region].name)}, ${Math.round(p.area / 10) * 10} sq. yd.</p>
    <p>${f.filer === me ? "Yours" : `Held by ${esc(who(f.filer))}`}: <q>${esc(f.intent)}</q></p>
    ${foldCondition(f)}
    ${letterFor(f)}
    ${f.filer === me ? "" : `<p class="meta">${count ? `${count} thing${count === 1 ? "" : "s"} built.` : "Nothing built yet."}</p>`}
    ${spiritUp(f)}`;
  wireLetter($("build-info"));
  wireSpirit(f);
  restoreTyping();
  $("tool-hint").textContent = tool === "shell" && f.shell && kindOf(f.shell) === "building"
    ? "Drag it to move it. Then step inside, or click its door, to furnish it."
    : HINTS[tool.split(":")[0]];
  if (f.filer === me) {
    if (drawnHere(f).map((d) => d.look).join() !== drawnKey) renderPalette();
    renderTools(f);
  }
  fitFocus(); // the info's height moves the plot on an upright screen
  doorway();
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
    b.classList.toggle("wanted", wants.has(b.dataset.tool!.replace(/^prop:/, "")));
  }
  $("palette").querySelector(".write-in")?.classList.toggle("on", tool.startsWith("item:"));
  for (const b of $("palette").querySelectorAll<HTMLButtonElement>("[data-size]")) b.classList.toggle("on", Number(b.dataset.size) === size);
  for (const g of $("palette").querySelectorAll<HTMLElement>("[data-group]")) {
    g.classList.toggle("open", g.dataset.group === openGroup);
    $("tabs").querySelector(`[data-tab="${g.dataset.group}"]`)?.classList.toggle("wanted", !!g.querySelector(".wanted"));
  }
  for (const b of $("tabs").querySelectorAll<HTMLButtonElement>("[data-tab]")) b.classList.toggle("on", b.dataset.tab === openGroup);
  const building = openGroup === "Building";
  $("palette").classList.toggle("building", building);
  for (const b of $("mode").querySelectorAll<HTMLButtonElement>("[data-mode]")) b.classList.toggle("on", (b.dataset.mode === "Building") === building);
  renderShellTools(f);
}

const icons = new Map<string, string>();

/** An icon's size in a palette button: whole times over where it fits, so the pixels stay square; squeezed only if even once won't. */
function iconSize(w: number, h: number) {
  const room = Math.min(44 / w, 30 / h);
  const k = room >= 1 ? Math.min(Math.floor(room), 4) : room;
  return `width="${Math.round(w * k)}" height="${Math.round(h * k)}"`;
}

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
      .map((p) => button(`prop:${p}`, p, `<img src="${icon(p, () => propCanvas(p))}" ${iconSize(propSize(p).w, propSize(p).h)} alt="${p}">`))
      .join(""))),
    // Anything not in the palette, by name: it goes down as a labelled parcel. What Gary has drawn here, again in a tap.
    group("Write in", drawnHere(focus!).map((d) => button(`item:${esc(d.label)}`, esc(d.label), `<img src="${propCanvas(d.look).toDataURL()}" ${iconSize(propSize(d.look).w, propSize(d.look).h)} alt="${esc(d.label)}">`)).join("")
      + `<form class="write-in"><input maxlength="24" placeholder="a lobster" aria-label="something of your own" required><button>Use</button></form>`),
    shellGroupHtml(focus!, group, button),
  ].join("");
  // On a phone the groups are tabs, one open at a time; Tools stays out.
  const names = ["Ground", ...PALETTE.map((g) => g.group), "Write in", ...(shellKindHere(focus!) ? ["Building"] : [])];
  $("tabs").innerHTML = names.map((n) => `<button data-tab="${n}">${n}</button>`).join("");
  for (const b of $("tabs").querySelectorAll<HTMLButtonElement>("[data-tab]")) b.addEventListener("click", () => openTab(b.dataset.tab!));
  // Off a phone, one switch between the garden and the building, so neither's tools crowd the other's.
  const kind = shellKindHere(focus!);
  $("mode").hidden = !kind;
  $("mode").innerHTML = kind ? `<button data-mode="Growing">Garden</button><button data-mode="Building">${kind === "building" ? "Building" : "Pen"}</button>` : "";
  for (const b of $("mode").querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    b.addEventListener("click", () => openTab(b.dataset.mode === "Building" ? "Building" : openGroup === "Building" ? "Growing" : openGroup));
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
  bindShellGroup(focus!);
}

/** Open a group of the toolbar; into or out of building mode, swap what's in hand. */
function openTab(name: string) {
  const building = name === "Building", was = openGroup === "Building";
  openGroup = name;
  if (building && !was) {
    gardenTool = tool;
    tool = "shell";
  } else if (!building && was) tool = gardenTool;
  renderBuildInfo();
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
  const next = PALETTE.find((g) => f.wants && !f.met_at && g.props.includes(f.wants))?.group ?? (shellKindHere(f) ? openGroup : "Growing");
  if (openGroup === "Building" && next !== "Building") tool = gardenTool;
  openGroup = next;
  zoom = { start: performance.now(), dir: 1, filing: f };
  pointer = null;
  heading = null;
  $("build-problem").textContent = "";
  showPanels();
  void loadSpiritFor(f);
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
  shellDrag = null;
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
  renderPound();
}

// --- the spirit: the sign, the board, the book, Gary's reading ---------------
// The HTML is src/spirit.ts; this loads a place's board and book when we go up
// close, keeps them current, and wires the buttons, up close and on the card.

let spirit: { filing: number; notices: Notice[]; visits: Visit[] } | null = null;
let spiritOpen = false; // on a phone it folds away like the condition

styleSpirit();

async function loadSpiritFor(f: Filing) {
  spirit = { filing: f.id, notices: [], visits: [] };
  const got = await loadSpirit(f.id);
  if (spirit?.filing !== f.id) return;
  spirit = { filing: f.id, ...got };
  handles = await handlesFor(got.visits.map((v) => v.visitor));
  renderBuildInfo();
}

/** The spirit's part of the build info, for the plot up close. */
function spiritUp(f: Filing) {
  const html = spiritHtml({ f, notices: spirit?.filing === f.id ? spirit.notices : [], visits: spirit?.filing === f.id ? spirit.visits : [], me, guest, who });
  if (!phone.matches) return html;
  return `<details class="fold spirit-fold"${spiritOpen ? " open" : ""}><summary>${hasDoor(f) ? (f.open_sign ? "Open" : "Closed") : "Visitors"}${f.boarded_at ? ", boarded up" : f.drift ? ", a notice from Gary" : ""}</summary>${html}</details>`;
}

/** What's being typed into the board or the book, kept across a re-render. */
function keepSpiritTyping() {
  const el = document.activeElement;
  const typing = el instanceof HTMLInputElement && el.closest(".spirit form") ? { form: el.closest("form")!.className, value: el.value } : null;
  return () => {
    const fold = $("build-info").querySelector<HTMLDetailsElement>(".spirit-fold");
    fold?.addEventListener("toggle", () => (spiritOpen = fold.open));
    if (!typing) return;
    const box = $("build-info").querySelector<HTMLInputElement>(`form.${typing.form} input`);
    if (!box) return;
    box.value = typing.value;
    box.focus();
  };
}

const spiritProblem = (root: HTMLElement, text: string) => {
  const p = root.querySelector(".spirit-problem");
  if (p) p.textContent = text;
};

function wireSpirit(f: Filing) {
  const root = $("build-info");
  const s = spirit?.filing === f.id ? spirit : null;
  root.querySelector(".spirit-sign")?.addEventListener("click", async () => {
    const problem = await flipSign(f.id, !f.open_sign);
    if (problem) return spiritProblem(root, problem);
    f.open_sign = !f.open_sign;
    renderBuildInfo();
  });
  root.querySelector<HTMLFormElement>(".spirit-pin")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const box = (e.currentTarget as HTMLFormElement).querySelector("input")!;
    const got = await pinNotice(f.id, box.value.trim());
    if (typeof got === "string") return spiritProblem(root, got);
    box.value = "";
    if (s && !s.notices.some((n) => n.id === got.id)) s.notices.push(got);
    renderBuildInfo();
  });
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-unpin]")) {
    b.addEventListener("click", async () => {
      const id = Number(b.dataset.unpin);
      if (!(await unpinNotice(id))) return spiritProblem(root, "It won't come down. Try again in a moment.");
      if (s) s.notices = s.notices.filter((n) => n.id !== id);
      renderBuildInfo();
    });
  }
  root.querySelector<HTMLFormElement>(".spirit-sign-book")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const box = (e.currentTarget as HTMLFormElement).querySelector("input")!;
    const got = await signBook(f.id, box.value.trim());
    if (typeof got === "string") return spiritProblem(root, got);
    box.value = "";
    if (s && !s.visits.some((v) => v.id === got.id)) s.visits.unshift(got);
    renderBuildInfo();
  });
  root.querySelector(".spirit-put-back")?.addEventListener("click", async () => {
    const n = await summonReader();
    spiritProblem(root, n === null ? "Gary couldn't be reached." : n ? "Gary's on his way to have another look." : "Gary's only just been. Give him a minute.");
  });
  root.querySelector(".spirit-change-use")?.addEventListener("click", async () => {
    const got = await fileChangeOfUse(f.id, f.drift ?? "");
    if (typeof got === "string") return spiritProblem(root, got);
    setVariation(got);
    spiritProblem(root, "Filed. Gary will rule on the change of use.");
  });
  wireAsk(root, f);
}

/** Ask Gary for a boarded-up plot, from up close or from its card. */
function wireAsk(root: HTMLElement, f: Filing) {
  root.querySelector(".spirit-ask")?.addEventListener("click", async () => {
    const until = await askForPlot(f.plot);
    if (!until) return spiritProblem(root, "Gary can't give notice on this one.");
    f.quit_by = until;
    renderAll();
  });
}

/** Lines on the board and in the book as they're written, and as Gary reads them. */
function spiritChannel(ch: RealtimeChannel) {
  for (const table of ["notices", "visits"] as const) {
    ch.on("postgres_changes", { event: "*", schema: "the_commons", table }, async ({ eventType, new: row, old }) => {
      if (!spirit) return;
      const list = (table === "notices" ? spirit.notices : spirit.visits) as (Notice | Visit)[];
      if (eventType === "DELETE") {
        const id = (old as { id: number }).id;
        if (table === "notices") spirit.notices = spirit.notices.filter((n) => n.id !== id);
        else spirit.visits = spirit.visits.filter((v) => v.id !== id);
      } else {
        const r = row as Notice | Visit;
        if (r.filing !== spirit.filing) return;
        const at = list.findIndex((x) => x.id === r.id);
        if (at >= 0) list[at] = r;
        else if (table === "notices") spirit.notices.push(r as Notice);
        else spirit.visits.unshift(r as Visit);
        if ("visitor" in r) handles = await handlesFor([r.visitor]);
      }
      if (focus) renderBuildInfo();
    });
  }
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
  fitRoom();
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
  draw(ctx, { held: heldPlots(), built, me, hover: null, selected: null, walkers: [...walkers.values()], look: lookOf, letters: [], t: Date.now(), recent: recent(), tags: tagsOf, pound: pounded });
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
  const scene: FocusScene = { plot: plotOf(f), filing: f, built: ps, mine: f.filer === me, ghost: null, brush: null, hover: null, tags: tagsOf.get(f.id) };
  shellScene(scene);
  if (!mine || !pointer) return scene;
  const [kind, arg] = tool.split(":");
  if (drag) {
    const moved = { ...drag.p, x: drag.x, y: drag.y };
    scene.built = ps.map((p) => (p.id === moved.id ? moved : p));
    scene.hover = { p: moved, colour: "#fff8e0" };
  } else if (kind === "reclaim") {
    scene.ghost = handGhost(f, pointer);
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
  const plot = plotOf(focus), shell = focus.shell;
  const p = placementAt(built.get(focus.id) ?? [], b.x, b.y);
  if (!p) return;
  const from = p.size ?? 1;
  const to = SCALES.find((k) => k > from && canPlace(plot, look({ ...p, size: k }), p.x, p.y, shell)) ?? 1;
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
  if (!canPlace(plotOf(f), shape, at.x, at.y, f.shell)) return problem("It has to stand on the plot, and not on what's already there.");
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
  if (indoors !== null || knock(e)) return;
  if (!focus || zoom || !mineInFocus()) return;
  const [kind] = tool.split(":");
  placing = e.button === 0 && (kind === "prop" || kind === "item" || kind === "reclaim");
  const b = toBuild(e);
  if (!b) return void (placing = false);
  pointer = b;
  if (e.button === 2 || kind === "remove") return takeDown(b);
  if (kind === "resize") return void regrow(b);
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  if (kind === "shell" || kind === "window") return shellDown(b);
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
  if (indoors !== null) return;
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
  if (shellDrag) shellMove(b);
  if (drag) {
    const { w, h } = propSize(look(drag.p));
    Object.assign(drag, propAt(look(drag.p), b.x - drag.dx + w / 2, b.y - drag.dy + h / 2));
  }
});

canvas.addEventListener("pointerup", async (e) => {
  if (indoors !== null) return;
  if (shellDrag) return shellUp();
  if (placing) {
    placing = false;
    const at = pointer;
    if (e.pointerType !== "mouse") pointer = null;
    if (!at || !focus) return;
    const [kind, arg] = tool.split(":");
    return void (kind === "item" ? placeAt("item", at, tool.slice(5)) : kind === "reclaim" ? putBack(at) : placeAt(arg, at));
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
    if (focus && !canPlace(plotOf(focus), look(p), x, y, focus.shell)) return problem("It has to stand on the plot, and not on what's already there.");
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
  else if (indoors !== null) leaveRoom();
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

// Double-click a plot to step inside, or the path round it to step out. Counted
// by hand, since phones don't send dblclick once the canvas takes its own touches.
let lastClick: { t: number; x: number; y: number } | null = null;
canvas.addEventListener("click", (e) => {
  if (indoors !== null) return;
  const touch = (e as PointerEvent).pointerType !== "mouse";
  const last = lastClick;
  lastClick = { t: e.timeStamp, x: e.clientX, y: e.clientY };
  if (!last || e.timeStamp - last.t > 400 || Math.hypot(e.clientX - last.x, e.clientY - last.y) > (touch ? 30 : 6)) return;
  lastClick = null;
  if (zoom) return;
  if (!focus) {
    if (onGary(toArt(e, mapView), touch ? 4 : 0)) return void summon();
    const f = enterableAt(e);
    if (f) walkInto(f);
  } else if (!toBuild(e)) {
    leaveFocus();
  }
});

// Scroll or pinch: in over a plot goes inside, out comes back to the commons.
canvas.addEventListener("wheel", (e) => {
  if (indoors !== null) return void roomWheel(e);
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

// --- inside: through a shell's door into its room (src/interior.ts) ----------

let indoors: number | null = null; // the filing whose room we're in; focus stays on its plot
const insides = new Map<number, Placement[]>(); // filing -> what's inside and in things
let roomView: View = { s: 1, ox: 0, oy: 0 };
let roomTool = "move"; // a fitting to lay out, or "move" / "remove"
let roomPointer: { x: number; y: number } | null = null; // art px of the room
let roomDrag: { p: Placement; x: number; y: number; slot: { holder: Placement; slot: number } | null } | null = null;

const indoorFiling = () => (indoors === null ? null : (filings.get(indoors) ?? null));
const mineIndoors = () => indoorFiling()?.filer === me && !zoom;
/** Small things go in slots; a thing with slots of its own never does. */
const slotted = (prop: string) => !!fitting(prop)?.small && !fitting(prop)?.slots;

function regroupInside(filing: number) {
  insides.set(filing, [...placements.values()].filter((p) => p.filing === filing && (p.room === "in" || !!p.parent) && p.room !== "store" && !p.impounded_at));
  if (filing === indoors) renderRoomInfo();
}

/** The "Go inside" button up close, for anyone, when there's a shell to go into. */
function doorway() {
  $("go-in").hidden = !focus?.shell;
}
$("go-in").addEventListener("click", () => focus && goInside(focus));

/** Whether a point in build space is on the shell's door. */
function atDoor(f: Filing, b: { x: number; y: number }): boolean {
  if (!f.shell) return false;
  const d = doorOutside(f.shell);
  const cx = Math.floor(b.x / ZOOM), cy = Math.floor(b.y / ZOOM);
  return cx >= d.x && cy >= d.y && cx < d.x + d.w && cy < d.y + d.h;
}

/** A press on the shell's door up close goes in. */
function knock(e: PointerEvent): boolean {
  const f = focus;
  if (!f?.shell || zoom || e.button !== 0) return false;
  const b = toBuild(e);
  if (!b || !atDoor(f, b)) return false;
  e.stopImmediatePropagation(); // the room's own handler would take this press as a click inside
  goInside(f);
  return true;
}

function goInside(f: Filing) {
  if (!f.shell || zoom) return;
  indoors = f.id;
  roomPointer = null;
  roomDrag = null;
  stroke = null;
  drag = null;
  placing = false;
  $("build").hidden = true;
  $("room").hidden = false;
  $("room-problem").textContent = "";
  renderRoomInfo();
  renderRoomTools();
}

function leaveRoom() {
  if (indoors === null) return;
  indoors = null;
  roomDrag = null;
  $("room").hidden = true;
  $("build").hidden = !focus;
  renderBuildInfo();
}

$("room-leave").addEventListener("click", leaveRoom);

function roomWheel(e: WheelEvent) {
  e.preventDefault();
  if (!zoom && e.deltaY > 4) leaveRoom();
}

function renderRoomInfo() {
  const f = indoorFiling();
  if (!f) return;
  const n = (insides.get(f.id) ?? []).length;
  const name = f.shell?.sign && f.shell.sign_ok ? f.shell.sign : f.intent;
  $("room-info").innerHTML = `<h2>${esc(name)}</h2>
    <p>${f.filer === me ? "Yours, inside." : `${esc(who(f.filer))}'s place. You're visiting.`}</p>
    <p class="meta">${n ? `${n} thing${n === 1 ? "" : "s"} inside.` : "Nothing inside yet."} The door's the way out.</p>`;
  fitRoom();
}

const ROOM_HINTS: Record<string, string> = {
  move: "Drag things about. Drop a small thing on a rack, shelf or table to put it there.",
  remove: `${touch ? "Tap" : "Click"} something to take it down.`,
  wall: "Click the back wall to hang it.",
  floor: "Click the floor to set it down.",
  small: "Click a free slot on a rack, shelf or table, or the floor.",
};

function renderRoomTools() {
  const mine = mineIndoors();
  $("room-tools").hidden = !mine;
  if (mine) {
    const button = (t: string, title: string, inner: string) => `<button data-tool="${t}" title="${esc(title)}">${inner}</button>`;
    const groups = new Map<string, string[]>();
    for (const k of fittingKeys()) groups.set(fitting(k)!.group, [...(groups.get(fitting(k)!.group) ?? []), k]);
    const group = (name: string, inner: string) => `<div class="group"><h3>${esc(name)}</h3><div class="row">${inner}</div></div>`;
    $("room-palette").innerHTML = group("Tools", button("move", "move things", "move") + button("remove", "take down", "take down"))
      + [...groups].map(([name, keys]) => group(name === "Held" ? "Small things" : name, keys.map((k) => {
        const c = spriteOf({ prop: k, x: 0, parent: null });
        return button(k, fitting(k)!.name, `<img src="${icon(`fitting:${k}`, () => c)}" ${iconSize(c.width, c.height)} alt="${esc(fitting(k)!.name)}">`);
      }).join(""))).join("");
    for (const b of $("room-palette").querySelectorAll<HTMLButtonElement>("[data-tool]")) {
      b.classList.toggle("on", b.dataset.tool === roomTool);
      b.addEventListener("click", () => {
        roomTool = b.dataset.tool!;
        renderRoomTools();
      });
    }
    const f = fitting(roomTool);
    $("room-hint").textContent = ROOM_HINTS[!f ? roomTool : slotted(roomTool) ? "small" : f.on];
  }
  fitRoom();
}

/** The room as big as whole pixels allow, clear of the papers. */
function fitRoom() {
  const f = indoorFiling();
  if (!f?.shell) return;
  const art = roomArt(roomSize(f.shell));
  const tools = $("room-tools"), info = $("room-info");
  const below = !tools.hidden ? (tools.offsetHeight + 16) * dpr : 0;
  const above = canvas.height > canvas.width ? (info.offsetTop + info.offsetHeight + 8) * dpr : 0;
  roomView = fit(art.w, art.h, below, above);
}

/** What's in the room, with whatever's being placed or dragged shown where it would go. */
function roomScene(f: Filing, ghosts = true): RoomScene {
  const all = insides.get(f.id) ?? [];
  const things = all.filter((p) => p.room === "in" && !p.parent);
  const ids = new Set(things.map((p) => p.id));
  const held = all.filter((p) => p.parent && ids.has(p.parent));
  const scene: RoomScene = { shell: f.shell!, things, held, ghost: null, hover: null, door: false };
  const at = roomPointer;
  if (!at) return scene;
  scene.door = onDoor(f.shell!, at.x, at.y);
  if (!ghosts || !mineIndoors() || scene.door) return scene;
  if (roomDrag) {
    const d = roomDrag;
    scene.things = things.filter((p) => p.id !== d.p.id);
    scene.held = held.filter((p) => p.id !== d.p.id);
    scene.ghost = d.slot ? { ...d.p, parent: d.slot.holder.id, x: d.slot.slot, y: 0 } : { ...d.p, parent: null, x: d.x, y: d.y };
  } else if (fitting(roomTool)) {
    const slot = slotted(roomTool) ? slotAt(scene, at.x, at.y) : null;
    const spot = !slot && spotFor(roomSize(f.shell!), roomTool, at.x, at.y);
    const ghost = { id: 0, filing: f.id, prop: roomTool, room: "in" as const };
    if (slot) scene.ghost = { ...ghost, x: slot.slot, y: 0, parent: slot.holder.id };
    else if (spot) scene.ghost = { ...ghost, ...spot, parent: null };
  } else {
    const p = thingAt(scene, at.x, at.y);
    if (p) scene.hover = { p, colour: roomTool === "remove" ? "#e05c48" : "#fff8e0" };
  }
  return scene;
}

function drawInside(now: number) {
  const f = indoorFiling();
  if (!f?.shell) return leaveRoom();
  fill(SURROUND);
  viewport(roomView);
  const scene = roomScene(f);
  drawRoom(ctx, scene, now);
  canvas.style.cursor = scene.door ? "pointer"
    : !mineIndoors() || !roomPointer ? ""
    : roomTool === "move" ? (roomDrag ? "grabbing" : scene.hover ? "grab" : "")
    : roomTool === "remove" ? (scene.hover ? "pointer" : "") : "crosshair";
}

function roomProblem(text: string) {
  $("room-problem").textContent = text;
}

async function layOut(f: Filing, prop: string, at: { x: number; y: number }) {
  const scene = roomScene(f, false);
  const slot = slotted(prop) ? slotAt(scene, at.x, at.y) : null;
  const spot = slot ? null : spotFor(roomSize(f.shell!), prop, at.x, at.y);
  if (!slot && !spot) return roomProblem("It won't go there.");
  const result = slot ? await placeInside(f.id, slot.slot, 0, prop, slot.holder) : await placeInside(f.id, spot!.x, spot!.y, prop, null);
  if (typeof result === "string") return roomProblem(result);
  roomProblem("");
  addPlacement(result);
}

/** Take a thing down, and whatever it held with it (the database cascades the same). */
function takeOut(p: Placement) {
  const gone = [p, ...(insides.get(p.filing) ?? []).filter((c) => c.parent === p.id)];
  for (const g of gone) removePlacement(g.id);
  unplace(p.id).then((ok) => ok || gone.forEach(addPlacement));
}

canvas.addEventListener("pointerdown", (e) => {
  const f = indoorFiling();
  if (!f?.shell || zoom) return;
  const at = toArt(e, roomView);
  roomPointer = at;
  if (e.button === 0 && onDoor(f.shell, at.x, at.y)) return leaveRoom();
  if (!mineIndoors()) return;
  const p = thingAt(roomScene(f, false), at.x, at.y);
  if (e.button === 2 || roomTool === "remove") return void (p && takeOut(p));
  if (e.button !== 0) return;
  if (roomTool === "move") {
    if (!p) return;
    roomDrag = { p, x: p.x, y: p.y, slot: null };
    canvas.setPointerCapture(e.pointerId);
  } else if (fitting(roomTool)) void layOut(f, roomTool, at);
});

canvas.addEventListener("pointermove", (e) => {
  const f = indoorFiling();
  if (!f?.shell) return;
  const at = (roomPointer = toArt(e, roomView));
  const d = roomDrag;
  if (!d) return;
  const scene = roomScene(f, false);
  scene.held = scene.held.filter((p) => p.id !== d.p.id);
  d.slot = slotted(d.p.prop) ? slotAt(scene, at.x, at.y) : null;
  const spot = !d.slot && spotFor(roomSize(f.shell), d.p.prop, at.x, at.y);
  if (spot) Object.assign(d, spot);
});

canvas.addEventListener("pointerup", async () => {
  const d = roomDrag;
  if (indoors === null || !d) return;
  roomDrag = null;
  const to = d.slot ? { x: d.slot.slot, y: 0, parent: d.slot.holder.id } : { x: d.x, y: d.y, parent: null };
  if (to.x === d.p.x && to.y === d.p.y && to.parent === (d.p.parent ?? null)) return;
  setPlacement({ ...d.p, ...to });
  const err = await moveInside(d.p.id, to.x, to.y, to.parent);
  if (err) {
    setPlacement(d.p);
    roomProblem(err);
  } else roomProblem("");
});

canvas.addEventListener("pointerleave", () => {
  if (!roomDrag) roomPointer = null;
});
// --- up close: the shell (slice A) --------------------------------------------
// The holder's building or pen: drag its footprint out (or drag it to move it),
// put windows in the front wall, turn the door, choose material and paint, and
// hang a sign for Gary to read. Drawn by src/shell.ts; saved by saveShell.

let shellDrag: { from: { x: number; y: number }; move: { dx: number; dy: number } | null; draft: Shell | null; problem: string | null } | null = null;
let shellPick = { material: "", paint: DEFAULT_PAINT }; // what the next one goes up in
const shellSaving = new Map<number, Shell | null>(); // our save in flight, over any echo of an older one

const shellKindHere = (f: Filing) => shellKind(f.schedule);

/** The material a shell goes up in: Gary's, else what's been chosen, else timber. */
function shellMaterial(f: Filing, kind: ShellKind): string {
  const fixed = scheduledMaterial(f.schedule, kind);
  if (fixed) return fixed;
  for (const m of [shellPick.material, f.shell?.material]) if (m && MATERIALS[m]?.kinds.includes(kind)) return m;
  return DEFAULT_MATERIAL;
}

/** The Building group of the toolbar, or nothing where the schedule has no shell. */
function shellGroupHtml(f: Filing, group: (name: string, inner: string) => string, button: (t: Tool, title: string, inner: string) => string): string {
  const kind = shellKindHere(f);
  if (!kind) return "";
  const building = kind === "building";
  const fixed = scheduledMaterial(f.schedule, kind);
  const paint = f.shell?.paint ?? shellPick.paint;
  return group("Building",
    button("shell", building ? "drag out where it stands; drag it to move it" : "drag out the pen; drag it to move it", building ? "build" : "pen")
    + (building ? button("window", "put a window in the front wall, or take one out", "windows") + `<button data-shell="door" title="turn the door to the next side">door</button>` : "")
    + `<button data-shell="down" title="take it down">take down</button>`
    + (fixed ? "" : materialsFor(kind).map((m) =>
      `<button data-material="${m}" title="${MATERIALS[m].name}"><img src="${materialSwatch(m, paint).toDataURL()}" width="24" alt="${MATERIALS[m].name}"></button>`).join(""))
    + (building || MATERIALS[shellMaterial(f, kind)].fence === "picket"
      ? Object.entries(PAINTS).map(([k, p]) => `<button data-paint="${k}" title="${p.name}"><span style="display:inline-block;width:18px;height:18px;border:2px solid #402e3a;background:${p.ramp[2]}"></span></button>`).join("")
      : "")
    + `<form class="sign-in write-in"><input maxlength="24" placeholder="what the sign says" aria-label="the sign" value="${esc(f.shell?.sign ?? "")}"><button>Hang</button></form>`
    + `<span class="meta sign-status"></span>`
    + (building ? `<button data-shell="in" class="step-in" title="go in and furnish it">Step inside →</button>` : ""));
}

function bindShellGroup(f: Filing) {
  const pal = $("palette");
  for (const b of pal.querySelectorAll<HTMLButtonElement>("[data-material]")) b.addEventListener("click", () => restyle({ material: b.dataset.material! }));
  for (const b of pal.querySelectorAll<HTMLButtonElement>("[data-paint]")) b.addEventListener("click", () => restyle({ paint: b.dataset.paint! }));
  pal.querySelector<HTMLButtonElement>('[data-shell="door"]')?.addEventListener("click", () => {
    const s = focus?.shell;
    if (!s) return problem("Put the building up first.");
    const door = (["s", "e", "n", "w"] as const)[(["s", "e", "n", "w"].indexOf(s.door) + 1) % 4];
    void putShell({ ...s, door, windows: defaultWindows(s, door) });
  });
  pal.querySelector<HTMLButtonElement>('[data-shell="down"]')?.addEventListener("click", () => {
    if (!focus?.shell) return;
    if (confirm(kindOf(focus.shell) === "building" ? "Take the building down? What's inside stays on your plot's books." : "Take the pen down?")) void putShell(null);
  });
  pal.querySelector<HTMLButtonElement>('[data-shell="in"]')?.addEventListener("click", () => focus && goInside(focus));
  const sign = pal.querySelector<HTMLFormElement>(".sign-in");
  sign?.addEventListener("submit", (e) => {
    e.preventDefault();
    const s = focus?.shell;
    if (!s) return problem("Put it up first, then hang the sign.");
    const text = sign.querySelector("input")!.value.trim() || null;
    if (text !== s.sign) void putShell({ ...s, sign: text, sign_ok: null });
  });
  void f;
}

/** Material and paint: for the next one, and for the one that's up. */
function restyle(change: { material?: string; paint?: string }) {
  shellPick = { ...shellPick, ...change };
  const s = focus?.shell;
  if (s) void putShell({ ...s, ...change });
  else renderBuildInfo();
}

/** The toolbar's Building group, as things stand. */
function renderShellTools(f: Filing) {
  const pal = $("palette");
  const s = f.shell;
  const material = shellKindHere(f) ? shellMaterial(f, s ? kindOf(s) : shellKindHere(f)!) : "";
  const paint = s?.paint ?? shellPick.paint;
  for (const b of pal.querySelectorAll<HTMLButtonElement>("[data-material]")) b.classList.toggle("on", b.dataset.material === material);
  for (const b of pal.querySelectorAll<HTMLButtonElement>("[data-paint]")) b.classList.toggle("on", b.dataset.paint === paint);
  const stepIn = pal.querySelector<HTMLButtonElement>('[data-shell="in"]');
  if (stepIn) stepIn.hidden = !s;
  const status = pal.querySelector(".sign-status");
  if (status) status.textContent = !s?.sign ? "" : s.sign_ok === null ? "Gary is reading the sign." : s.sign_ok ? "" : "Gary has declined the sign. It hangs blank.";
}

/** Save the shell, showing it at once and putting it back if the database says no. */
async function putShell(next: Shell | null) {
  const f = focus;
  if (!f) return;
  const before = f.shell;
  f.shell = next;
  shellSaving.set(f.id, next);
  problem("");
  renderBuildInfo();
  const err = await saveShell(f.id, next);
  shellSaving.delete(f.id);
  if (err) {
    f.shell = before;
    problem(err);
    renderBuildInfo();
  }
}

/** The footprint between two cells, or the shell moved by the drag. */
function shellDraft(f: Filing, at: { x: number; y: number }): Shell | null {
  const kind = shellKindHere(f);
  if (!kind || !shellDrag) return null;
  const plot = plotOf(f);
  const cx = Math.floor(at.x / ZOOM), cy = Math.floor(at.y / ZOOM);
  const prev = f.shell;
  if (shellDrag.move && prev) {
    const x = clamp(cx - shellDrag.move.dx, 0, plot.w - prev.w), y = clamp(cy - shellDrag.move.dy, 0, plot.h - prev.h);
    return raise(plot, kindOf(prev), { x, y, w: prev.w, h: prev.h }, prev, prev.material, prev.paint);
  }
  const { x: fx, y: fy } = shellDrag.from;
  const r = { x: Math.min(fx, cx), y: Math.min(fy, cy), w: Math.abs(cx - fx) + 1, h: Math.abs(cy - fy) + 1 };
  return raise(plot, kind, r, prev, shellMaterial(f, kind), prev?.paint ?? shellPick.paint);
}

/** The close-up's view of a shell being dragged out or moved. */
function shellScene(scene: FocusScene) {
  if (!shellDrag?.draft) return;
  scene.shell = { shell: shellDrag.draft, ok: !shellDrag.problem };
}

/** Pointer down with the shell tools: start a footprint or a move, or put in a window. */
function shellDown(b: { x: number; y: number }) {
  const f = focus!;
  if (tool === "window") {
    const s = f.shell;
    const at = s && frontWallAt(s, b.x, b.y);
    if (!s || at === null) return problem("Click the front wall where you'd like a window.");
    const has = s.windows.some((w) => w.side === "s" && w.at === at);
    if (!has && !windowFits(s, "s", at)) return problem("There isn't room for a window there.");
    return void putShell({ ...s, windows: has ? s.windows.filter((w) => !(w.side === "s" && w.at === at)) : [...s.windows, { side: "s", at }] });
  }
  const cx = Math.floor(b.x / ZOOM), cy = Math.floor(b.y / ZOOM);
  const s = f.shell;
  shellDrag = { from: { x: cx, y: cy }, move: s && onShell(s, b.x, b.y) ? { dx: cx - s.x, dy: cy - s.y } : null, draft: null, problem: null };
  shellMove(b);
}

function shellMove(b: { x: number; y: number }) {
  const f = focus;
  if (!f || !shellDrag) return;
  const draft = shellDraft(f, b);
  shellDrag.draft = draft;
  const others = (built.get(f.id) ?? []);
  shellDrag.problem = draft && footprintProblem(plotOf(f), kindOf(draft), draft, others);
}

function shellUp() {
  const drag = shellDrag;
  shellDrag = null;
  if (!drag?.draft || !focus) return;
  if (drag.problem) return problem(drag.problem);
  const s = drag.draft, was = focus.shell;
  if (was && s.x === was.x && s.y === was.y && s.w === was.w && s.h === was.h) return;
  void putShell(s);
}

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
function onGary(p: { x: number; y: number }, slop = 0) {
  const g = garyAt(Date.now(), recent());
  return Math.abs(p.x - g.x) <= 6 + slop && p.y >= g.y - 13 - slop && p.y <= g.y + 1 + slop;
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
  const [n, r] = await Promise.all([summonGary(), summonRounds()]);
  speak(n === null && r === null ? "Not now. The kettle." : n || r ? "Right. I'll come round now." : "Nothing outstanding that I haven't already seen.");
}

// Hold the notice board for three seconds and the back office opens (src/backoffice.ts).
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
    backoffice(selected ?? 1);
  }, 3000);
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
  if (onHut(p)) return goTo(LANDMARKS.office.at.x, LANDMARKS.office.at.y, openPound);
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

// --- the letter: Gary's questions, red tags, the pound (src/letter.ts) --------

const tags = new Map<number, Tag>();
let tagsOf = new Map<number, Tag[]>(); // filing -> its tags, for the map and up close; replaced on change
// Questions Gary asked while we were about (Realtime brought them, so we're present):
// he's at the gate, rather than leaving a questionnaire on the door.
const askedHere = new Set<number>();
const answering = new Map<number, string>(); // answers half typed, kept across re-renders
let typingTag: number | null = null; // and which one has the cursor
let pounded = 0; // things in the pound, anyone's: the crates by the hut
HINTS.reclaim = `${touch ? "Touch, slide and let go" : "Click"} to put it back where you like.`;

function setTag(t: Tag) {
  tags.set(t.id, t);
  tagsOf = new Map();
  for (const x of tags.values()) tagsOf.set(x.filing, [...(tagsOf.get(x.filing) ?? []), x]);
}

async function loadLetter() {
  try {
    for (const t of await loadTags()) setTag(t);
    renderAll();
  } catch {
    // No tags table yet (or a blip): the commons works without the letter.
  }
}

/** A tag as the database now has it. A new question on our plot means Gary's at the gate now. */
function tagArrived(t: Tag, fresh: boolean) {
  const was = tags.get(t.id);
  setTag(t);
  const f = filings.get(t.filing);
  if (f?.filer !== me) return renderAll();
  if (fresh && isWaiting(t)) {
    askedHere.add(t.id);
    if (!focus) {
      speak(t.question);
      openCard(f.plot);
    }
  } else if (was?.status === "asked" && t.status !== "asked" && t.reply && !focus) speak(t.reply);
  renderAll();
}

/** The letter on a plot's paper: questions, red tags, certificates. */
const letterFor = (f: Filing) => letterHtml(tagsOf.get(f.id) ?? [], { mine: f.filer === me, here: askedHere });

/** Wire up the letter's forms and buttons in a paper just rendered. */
function wireLetter(paper: HTMLElement) {
  for (const box of paper.querySelectorAll<HTMLElement>("[data-tag]")) {
    const t = tags.get(Number(box.dataset.tag));
    if (!t) continue;
    const form = box.querySelector<HTMLFormElement>("form.answer");
    if (form) {
      const text = form.querySelector("textarea")!;
      text.value = answering.get(t.id) ?? "";
      if (typingTag === t.id) text.focus();
      text.addEventListener("input", () => answering.set(t.id, text.value));
      text.addEventListener("focus", () => void (typingTag = t.id));
      // Re-rendering takes the box away from under the cursor; only a real blur lets go.
      text.addEventListener("blur", () => void (text.isConnected && typingTag === t.id && (typingTag = null)));
      text.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          form.requestSubmit();
        }
      });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const button = form.querySelector("button")!;
        button.disabled = true;
        const problem = await answerTag(t.id, text.value.trim());
        button.disabled = false;
        if (problem) return void (form.querySelector(".problem")!.textContent = problem);
        answering.delete(t.id);
        setTag({ ...t, answer: text.value.trim(), answered_at: new Date().toISOString() });
        renderAll();
      });
    }
    box.querySelector(".take-down")?.addEventListener("click", () => {
      const p = t.placement !== null ? placements.get(t.placement) : null;
      if (!p) return;
      removePlacement(p.id);
      unplace(p.id).then((ok) => ok || setPlacement(p));
    });
    box.querySelector(".file-for")?.addEventListener("click", async () => {
      const got = await fileRetrospective(t);
      if (typeof got === "string") return void (box.querySelector(".problem")!.textContent = got);
      setVariation(got);
      renderAll();
    });
  }
}

// The pound, behind Gary's hut: your impounded things, and getting them back.
const pound = Object.assign(document.createElement("div"), { id: "pound", className: "paper", hidden: true });
$("field").append(pound);

const onHut = (p: { x: number; y: number }) => {
  const o = LANDMARKS.office;
  return p.x >= o.x - 1 && p.x < o.x + o.w + 12 && p.y >= o.y - 10 && p.y < o.y + o.h;
};

function openPound() {
  closeCard();
  pound.hidden = false;
  renderPound();
}

function renderPound() {
  if (pound.hidden) return;
  const mine = [...placements.values()].filter((p) => p.impounded_at && filings.get(p.filing)?.filer === me && !p.parent);
  pound.innerHTML = poundHtml(mine.map((p) => ({
    id: p.id, name: thingName(p.prop, p.label), plot: labelOf(filings.get(p.filing)!.plot),
    icon: icon(`pound:${look(p)}`, () => propCanvas(look(p))), since: p.impounded_at!,
  })));
  pound.querySelector(".close")!.addEventListener("click", () => void (pound.hidden = true));
  for (const li of pound.querySelectorAll<HTMLElement>("[data-placement]")) {
    li.querySelector(".reclaim")!.addEventListener("click", () => void getBack(Number(li.dataset.placement)));
  }
}

/** Back where it was if that's free; otherwise to its plot, in hand, to put down somewhere. */
async function getBack(id: number) {
  const p = placements.get(id);
  if (!p) return;
  const ok = await reclaim(id);
  if (typeof ok === "string") return void (pound.querySelector(".problem")!.textContent = ok);
  if (ok) {
    setPlacement({ ...p, impounded_at: null });
    pound.hidden = true;
    speak(`There's your ${thingName(p.prop, p.label)}. It's back where it was.`);
    return;
  }
  pound.hidden = true;
  tool = `reclaim:${id}`;
  enterFocus(filings.get(p.filing)!);
  problem("Something's standing where it was. Put it down somewhere else.");
}

/** The thing in hand from the pound, if that's the tool and we're on its plot. */
function inHand() {
  const p = tool.startsWith("reclaim:") ? placements.get(Number(tool.slice(8))) : null;
  return p && p.impounded_at && focus?.id === p.filing ? p : null;
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") pound.hidden = true;
});

function handGhost(f: Filing, at: { x: number; y: number }): Placement | null {
  const p = inHand();
  return p ? { ...p, id: 0, filing: f.id, prop: look(p), size: 1, label: null, ...propAt(look(p), at.x, at.y) } : null;
}

async function putBack(at: { x: number; y: number }) {
  const p = inHand();
  if (!p || !focus) return;
  const spot = propAt(look(p), at.x, at.y);
  if (!canPlace(plotOf(focus), look(p), spot.x, spot.y)) return problem("It has to stand on the plot, and not on what's already there.");
  const ok = await reclaim(p.id, spot.x, spot.y);
  if (ok !== true) return problem(typeof ok === "string" ? ok : "Something is already standing exactly there.");
  problem("");
  land(p.id);
  setPlacement({ ...p, ...spot, impounded_at: null });
  tool = "move";
  renderBuildInfo();
}

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
    // The arrow keys slide along water, wood and walls, and into gaps close by; routes go round them.
    if (w.id === me && free && !walkable(nx, ny) && walkable(w.x, w.y)) {
      const to = slide(w.x, w.y, nx - w.x, ny - w.y);
      if (!to) {
        w.tx = w.x;
        w.ty = w.y;
        w.moving = false;
        continue;
      }
      // Carry the heading along, so a held key keeps on the same way once past.
      w.tx += to.x - nx;
      w.ty += to.y - ny;
      w.x = to.x;
      w.y = to.y;
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
  } else if (indoors !== null) {
    drawInside(now);
  } else if (focus) {
    fill(SURROUND);
    viewport(focusView);
    drawFocus(ctx, focusScene(focus), now);
    labelItems();
    canvas.style.cursor = pointer && atDoor(focus, pointer) ? "pointer"
      : mineInFocus() && pointer ? (tool === "move" ? (drag ? "grabbing" : "grab") : "crosshair") : "";
  } else {
    fill(VOID);
    follow();
    viewport(mapView);
    const t = Date.now();
    draw(ctx, { held: heldPlots(), built, me, hover, selected, walkers: [...walkers.values()], look: lookOf, letters, t, recent: recent(), tags: tagsOf, pound: pounded });
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
  // Gary's ruling on one of ours, or an appeal allowed: it comes by post.
  const was = filings.get(f.id);
  if (f.filer === me && (was?.status === "pending" || was?.status === "committee" || was?.status === "denied" || was?.status === "refused") && f.status !== was.status) {
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
  if (shellSaving.has(f.id)) f.shell = shellSaving.get(f.id)!;
  filings.set(f.id, f);
  if (focus?.id === f.id) focus = f;
}

function regroup(filing: number) {
  // On the plot: outdoors, not held in anything, not impounded (at the hut). Storage and inside are elsewhere.
  built.set(filing, [...placements.values()].filter((p) => p.filing === filing && (p.room ?? "out") === "out" && !p.parent && !p.impounded_at));
  pounded = [...placements.values()].filter((p) => p.impounded_at && !p.parent).length;
  regroupInside(filing);
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

/** A load that fails is usually a blip (a phone just waking, a network changing): ask twice more before giving up. */
async function again<T>(load: () => Promise<T>): Promise<T> {
  for (const wait of [1000, 3000]) {
    try {
      return await load();
    } catch {
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return load();
}

async function start() {
  me = await again(signIn);
  guest = await isGuest();
  const [loaded, placed, appealed] = await again(() => Promise.all([loadFilings(), loadPlacements(), loadAppeals()]));
  for (const f of loaded) upsert(f);
  for (const a of appealed) setAppeal(a);
  for (const p of placed) placements.set(p.id, p);
  for (const id of new Set(placed.map((p) => p.filing))) regroup(id);
  for (const v of await loadVariations().catch(() => [])) setVariation(v);
  void loadLetter();
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
    .on("postgres_changes", { event: "*", schema: "the_commons", table: "appeals" }, ({ new: row }) => {
      if (!row || !("id" in row)) return;
      const a = row as Appeal;
      const f = filings.get(a.filing);
      const was = appeals.get(a.filing)?.find((x) => x.id === a.id);
      // A dismissal of one of ours comes by post (one allowed came with the filing, in arrive()).
      if (f?.filer === me && a.heard_at && !was?.heard_at && !a.allowed) {
        unread.add(f.id);
        letters.push({ plot: f.plot, out: false, status: "denied", filing: f.id });
      }
      setAppeal(a);
      renderAll();
    })
    .on("postgres_changes", { event: "*", schema: "the_commons", table: "variations" }, ({ new: row }) => {
      if (!row || !("id" in row)) return;
      setVariation(row as Variation);
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
      renderAll();
    });
  channel.on("postgres_changes", { event: "*", schema: "the_commons", table: "tags" }, ({ eventType, new: row }) => {
    if (row && "id" in row) tagArrived(row as Tag, eventType === "INSERT");
  });
  spiritChannel(channel);
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") channel.track(spawn);
  });

  renderAll();
  requestAnimationFrame(frame);
  if (guest && !localStorage.getItem("looking")) door();
}

resize();
window.addEventListener("resize", resize);
// auth-js holds on to a failed token refresh for a minute, so asking again in
// this page won't help: a fresh page will, once.
start().then(() => sessionStorage.removeItem("reloaded"), (err) => {
  if (isAuthRetryableFetchError(err) && !sessionStorage.getItem("reloaded")) {
    sessionStorage.setItem("reloaded", "1");
    setTimeout(() => location.reload(), 2000);
  }
  $("tag").textContent = `The commons is closed: ${err.message ?? err}. Tap to try again.`;
  $("tag").onclick = () => location.reload();
});
