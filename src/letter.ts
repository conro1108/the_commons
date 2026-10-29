// The letter, on the client: Gary's questions about what's built off the
// schedule, his red tags, and the pound at his hut. Types, the words on the
// paper (HTML strings, wired up in main.ts), and the pixel art that
// closeup.ts and render.ts hang on things. No network, so dev/letter.html can
// show all of it. The round itself is api/gary.ts; the timings are keep_tags()
// in db/logic.sql.

export type TagStatus = "asked" | "ancillary" | "tagged" | "filed" | "permitted" | "removed" | "impounded" | "returned" | "lawful";

export interface Tag {
  id: number;
  filing: number;
  placement: number | null; // null once it's been taken down
  what: string; // bare: "hot tub"
  question: string;
  asked_at: string;
  answer: string | null;
  answered_at: string | null;
  reply: string | null;
  due: string | null; // a red tag's date
  status: TagStatus;
  closed_at: string | null;
}

export const TAG_COLUMNS = "id, filing, placement, what, question, asked_at, answer, answered_at, reply, due, status, closed_at";

/** Still being dealt with: one of these per thing at most. */
export const isOpen = (t: Tag) => t.status === "asked" || t.status === "tagged" || t.status === "filed";
/** Wearing a red tag, on the map and up close. */
export const isRed = (t: Tag) => t.status === "tagged" || t.status === "filed";
/** A question nobody's answered yet: the questionnaire on the door. */
export const isWaiting = (t: Tag) => t.status === "asked" && !t.answer;

/** What Gary calls a thing, bare. Mirrors the_commons.thing_name() in db/logic.sql. */
export const thingName = (prop: string, label?: string | null) =>
  prop === "item" ? (label ?? "parcel").trim().replace(/^(a|an|the|some)\s+/i, "") : prop.replace(/_/g, " ");

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
const DAY = 864e5;

/** Which of a plot's tags its paper shows: anything open, and what's been settled in the last two days. */
export const shown = (tags: Tag[], now = Date.now()) =>
  tags.filter((t) => isOpen(t) || (t.closed_at && now - Date.parse(t.closed_at) < 2 * DAY && t.status !== "removed" && t.status !== "returned"));

/**
 * The letter on a plot's paper. The holder gets a form for each question and
 * buttons on each red tag; `here` holds the questions Gary asked while they
 * were about (he's at the gate), rather than left on the door.
 */
export function letterHtml(tags: Tag[], o: { mine: boolean; here: Set<number>; now?: number }) {
  const list = shown(tags, o.now).sort((a, b) => b.id - a.id);
  if (!list.length) return "";
  // What's settled folds to a line each, as the appeal trail does; what still wants something stays open.
  const okayed = list.filter(waved);
  const settled = list.filter((t) => !isOpen(t) && !waved(t));
  const folds = [...settled.map((t) => settledHtml(t, o.mine)), ...(okayed.length ? [okayedHtml(okayed)] : [])];
  return `<div class="letter">${list.filter(isOpen).map((t) => tagHtml(t, o.mine, o.here.has(t.id))).join("")}${folds.length ? `<div class="trail">${folds.join("")}</div>` : ""}</div>`;
}

const fold = (title: string, said: string, outcome: string, good: boolean, body: string) =>
  `<details><summary><b>${esc(title)}</b><q>${esc(said)}</q><span${good ? ` class="good"` : ""}>${outcome}</span></summary>${body}</details>`;

/** A settled tag as a line: the thing, what it was said to be for, how it came out. Opened, what Gary asked and said. */
function settledHtml(t: Tag, mine: boolean) {
  const what = capital(t.what);
  const reply = t.reply ? `<p class="permit">${esc(t.reply)}</p>` : "";
  if (t.status === "lawful") return fold(what, "up a week and nobody asked", "lawful", true, reply);
  const good = t.status === "ancillary";
  const pound = good ? "" : `<p class="meta">The ${esc(t.what)} is in the pound at Gary's hut.${mine ? " Get it back there." : ""}</p>`;
  return fold(what, t.answer ?? t.question, good ? "on the schedule" : "impounded", good, `<p><b>Gary:</b> <q>${esc(t.question)}</q></p>${reply}${pound}`);
}

/** Put on the schedule by Gary himself on his rounds, without asking: plainly part of the place. */
export const waved = (t: Tag) => t.status === "ancillary" && !t.answer;

/** "The fridge, the stove and the wall shelf" */
const listOf = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

function okayedHtml(ts: Tag[]) {
  const names = [...new Set(ts.map((t) => t.what.toLowerCase()))].map((w) => `the ${w}`);
  const line = `${capital(listOf(names))}: all part of the place.`;
  return fold("His round", line, "on the schedule", true, `<p><b>Gary:</b> <q>Been round. ${esc(line)} On the schedule.</q></p>`);
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function tagHtml(t: Tag, mine: boolean, here: boolean) {
  const said = `${t.answer ? ` <span class="meta">${mine ? "You" : "The holder"}:</span> <q>${esc(t.answer)}</q>` : ""}`;
  const reply = t.reply ? `<p class="permit">${esc(t.reply)}</p>` : "";
  const q = `<p><b>Gary:</b> <q>${esc(t.question)}</q>${said}</p>`;
  switch (t.status) {
    case "asked":
      if (t.answer) return `<div class="condition" data-tag="${t.id}">${q}<p class="stamp pending">Gary's thinking it over</p></div>`;
      if (!mine) return `<div class="condition" data-tag="${t.id}"><p class="meta">A questionnaire from Gary is pinned to the door.</p></div>`;
      return `<div class="condition questionnaire${here ? " here" : ""}" data-tag="${t.id}">
        <p class="form-no">${here ? "Gary's at the gate" : "Questionnaire, left on the door"}</p>${q}
        <form class="answer"><textarea rows="2" maxlength="200" placeholder="${esc(placeholder(t.what))}" required></textarea>
        <button>Answer</button><p class="problem"></p></form></div>`;
    case "tagged":
    case "filed":
      return `<div class="condition red" data-tag="${t.id}">${q}${reply}
        <p class="stamp denied">${t.status === "filed" ? "Red tag: filed for" : "Red tag"}</p>
        ${t.status === "filed"
          ? `<span class="meta">Waiting on the filing.</span>`
          : `<span class="meta">By ${t.due ? day(t.due) : "the date"}: take it down or file for it, or it goes to the pound.</span>
             ${mine && t.placement ? `<p><button class="take-down">Take it down</button> <button class="file-for">File for it</button></p><p class="problem"></p>` : ""}`}</div>`;
    case "ancillary":
      return `<div class="condition" data-tag="${t.id}">${q}${reply}<p class="stamp approved">Ancillary</p> <span class="meta">On the schedule.</span></div>`;
    case "lawful":
      return `<div class="condition" data-tag="${t.id}"><p class="stamp approved">Certificate of Lawfulness</p>
        <p class="meta">The ${esc(t.what)}: up a week and nobody asked.</p>${reply}</div>`;
    case "impounded":
      return `<div class="condition" data-tag="${t.id}">${q}${reply}<p class="stamp denied">Impounded</p>
        <span class="meta">The ${esc(t.what)} is in the pound at Gary's hut.${mine ? " Get it back there." : ""}</span></div>`;
    default:
      return "";
  }
}

/** Something to start the holder off. */
const placeholder = (what: string) => `the ${what} is for…`;

export interface Impounded {
  id: number; // the placement
  name: string;
  plot: string; // "Plot 12, the Hollow"
  icon: string; // an image src
  since: string;
}

/** The pound at Gary's hut, as its holder sees it: their things, and a button each. */
export function poundHtml(things: Impounded[]) {
  return `<button class="close" aria-label="Close">×</button><h2>The pound</h2>
    <p class="meta">Behind Gary's hut. Nothing here is thrown away.</p>
    ${things.length
      ? `<ul class="pound">${things.map((t) => `<li data-placement="${t.id}"><img src="${t.icon}" alt="">
          <span><b>The ${esc(t.name)}</b><br><span class="meta">${esc(t.plot)}, since ${day(t.since)}</span></span>
          <button class="reclaim">Get it back</button></li>`).join("")}</ul><p class="problem"></p>`
      : `<p>Nothing of yours is in the pound.</p>`}`;
}

// --- the art -------------------------------------------------------------------

const INK = "#402e3a";
const COLOURS: Record<string, string> = { k: INK, r: "#c8473c", R: "#e8735e", w: "#fffdf3", s: "#e3c48e", g: "#a597b0" };

function pixels(ctx: CanvasRenderingContext2D, rows: string[], left: number, top: number) {
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === ".") return;
    ctx.fillStyle = COLOURS[c];
    ctx.fillRect(Math.round(left) + x, Math.round(top) + y, 1, 1);
  }));
}

// A luggage tag on a string, up close: the string's top is where it hangs from.
const RED_TAG = ["..s..", "..s..", ".kkk.", "kRwRk", "krrrk", "krrrk", "krrrk", ".kkk."];
// The same, one map pixel a cell: a speck of red, outlined so it shows on any ground.
const MAP_TAG = [".k.", "kRk", "krk", "kkk"];
// A questionnaire pinned up on a stake: a sheet with lines of questions on, a red pin at the top.
const SHEET = ["..r...", "kkkkkk", "kwwwwk", "kwggwk", "kwwwwk", "kwgggk", "kwwwwk", "kwggwk", "kwwwwk", "kkkkkk", "..s...", "..s...", "..s..."];

/** A red tag, hung from (x, y), up close. Swings a pixel now and then. */
export const drawRedTag = (ctx: CanvasRenderingContext2D, x: number, y: number, t = 0) =>
  pixels(ctx, RED_TAG, x - 2 + (Math.floor(t / 700 + x) % 5 === 0 ? 1 : 0), y);

/** A red tag on the map, at a thing's top corner. */
export const drawMapTag = (ctx: CanvasRenderingContext2D, x: number, y: number) => pixels(ctx, MAP_TAG, x - 1, y - 3);

/** Gary's questionnaire pinned up, its top-left at (x, y). */
export const drawQuestionnaire = (ctx: CanvasRenderingContext2D, x: number, y: number) => pixels(ctx, SHEET, x, y);

/** The pound by the hut: a little pen, with a crate in it per thing (up to three). */
export function drawPound(ctx: CanvasRenderingContext2D, x: number, y: number, n: number) {
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, 9, 1);
  ctx.fillRect(x, y + 4, 9, 1);
  for (const px of [0, 4, 8]) ctx.fillRect(x + px, y - 1, 1, 6);
  for (let i = 0; i < Math.min(n, 3); i++) {
    ctx.fillStyle = INK;
    ctx.fillRect(x + 1 + i * 2, y + 1, 2, 3);
    ctx.fillStyle = "#c9a26a";
    ctx.fillRect(x + 1 + i * 2, y + 2, 2, 1);
  }
}
