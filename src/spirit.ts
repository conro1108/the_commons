// The spirit of a place, as shown: the open sign, the what's-on board by the
// door, the visitors' book, Gary's last reading of its use, a drift notice, and
// boarding up for disuse (and the planks across it on the map). Pure HTML and
// pixels from data, so dev/spirit.html can show every state with no network;
// src/main.ts (its "the spirit" section) loads the data and wires the buttons.

import { PLANK } from "./content/palette.ts";
import { inPlot, type PlotDef } from "./world/index.ts";
import type { Filing, Notice, Visit } from "./net.ts";
import { useOf } from "./schedule.ts";

export interface SpiritView {
  f: Filing;
  notices: Notice[];
  visits: Visit[];
  me: string;
  guest: boolean;
  who: (id: string) => string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const today = () => new Date().toISOString().slice(0, 10);

/** Gary's drift notice: "This is a tea room. You've a permit for a karate studio." */
export function driftLine(f: Filing): string {
  const use = useOf(f);
  return f.drift && f.drift !== "something else"
    ? `This is ${f.drift}. You've a permit for ${use}.`
    : `This isn't ${use} any more, and that's what you've a permit for.`;
}

/** His last reading of the place, under the permit. */
export function readingHtml(f: Filing): string {
  if (!f.reading || f.boarded_at) return ""; // boarded up says so itself
  return `<p class="spirit-reading">Gary's reading: <q>${esc(f.reading)}</q>${f.read_at ? ` <span class="meta">${day(f.read_at)}</span>` : ""}</p>`;
}

/** Boarded up: what the holder and everyone else are told, and asking for it. */
function boardedHtml(f: Filing, mine: boolean, guest: boolean): string {
  if (!f.boarded_at) return "";
  const since = day(f.boarded_at);
  if (mine) {
    return `<div class="spirit-boarded"><b>Boarded up</b> for disuse since ${since}. Everything's still there; anything you do here takes the boards down.
      ${f.quit_by ? `<p class="problem">Someone has asked for this plot. Reopen it by ${day(f.quit_by)}, or it's freed.</p>` : ""}</div>`;
  }
  return `<div class="spirit-boarded"><b>Boarded up</b> since ${since}.
    ${f.quit_by
      ? `<p class="meta">Asked for. Its holder has until ${day(f.quit_by)} to reopen it, or it's freed.</p>`
      : guest ? "" : `<p class="meta">Want it? Gary will give the holder a week's notice to reopen it.</p><button class="spirit-ask">Ask Gary for it</button>`}
    <p class="problem spirit-problem"></p></div>`;
}

/** For the plot's card on the map: the reading, and boarding up. */
export function spiritCardHtml(f: Filing, me: string, guest: boolean): string {
  return `${readingHtml(f)}${boardedHtml(f, f.filer === me, guest)}`;
}

/** Up close: the sign, the board, the book, the reading, and any notice from Gary. */
export function spiritHtml(v: SpiritView): string {
  const { f, me, guest } = v;
  const mine = f.filer === me;
  const open = !!f.open_sign;
  const sign = mine
    ? `<button class="spirit-sign ${open ? "open" : "closed"}" title="Flip the sign">${open ? "Open" : "Closed"}</button>`
    : `<span class="spirit-sign ${open ? "open" : "closed"}">${open ? "Open" : "Closed"}</span>`;

  const notices = v.notices.filter((n) => n.ok || mine);
  const board = `<div class="spirit-board"><h3>What's on</h3>
    ${notices.length
      ? `<ul>${notices.map((n) => `<li class="${n.ok === false ? "unfit" : n.ok === null ? "unread" : ""}">${esc(n.line)}${
          mine ? `${n.ok === null ? ` <span class="meta">(with Gary)</span>` : n.ok === false ? ` <span class="meta">(Gary won't have it up)</span>` : ""}<button class="spirit-unpin" data-unpin="${n.id}" aria-label="Take it down">×</button>` : ""}</li>`).join("")}</ul>`
      : `<p class="meta">${mine ? "Nothing up. Pin a line: what's on, and when." : "Nothing on."}</p>`}
    ${mine && v.notices.length < 8 ? `<form class="spirit-pin"><input maxlength="80" placeholder="${f.boarded_at ? "Reopening Saturday" : "Beginners' kata, Thursdays at six"}" required><button>Pin</button></form>` : ""}</div>`;

  const lines = v.visits.filter((l) => l.ok || l.visitor === me).slice(0, 6);
  const signed = v.visits.some((l) => l.visitor === me && l.day === today());
  const canSign = !mine && !guest && !signed && !f.boarded_at;
  const book = `<div class="spirit-book"><h3>Visitors' book</h3>
    ${lines.length
      ? `<ul>${lines.map((l) => `<li><q>${esc(l.line)}</q> <span class="meta">${esc(v.who(l.visitor))}, ${day(l.at)}${l.ok === null ? " (with Gary)" : l.ok === false ? " (not kept)" : ""}</span></li>`).join("")}</ul>`
      : `<p class="meta">Nobody's signed it yet.</p>`}
    ${canSign ? `<form class="spirit-sign-book"><input maxlength="140" placeholder="Lovely scones" required><button>Sign</button></form>` : ""}
    ${!mine && guest ? `<p class="meta">Guests can't sign the book.</p>` : ""}</div>`;

  const drift = mine && f.drift && !f.boarded_at
    ? `<div class="spirit-drift"><p><b>Gary:</b> <q>${esc(driftLine(f))}</q></p>
        <p class="meta">Put it back the way it was, or file for a change of use.</p>
        <button class="spirit-put-back">I've put it back</button> <button class="spirit-change-use">File a change of use</button></div>`
    : "";

  return `<div class="spirit">${boardedHtml(f, mine, guest)}${drift}
    <div class="spirit-door">${sign}<span class="meta">${esc(useOf(f))}</span></div>
    ${readingHtml(f)}${board}${book}<p class="problem spirit-problem"></p></div>`;
}

export const SPIRIT_CSS = `
.spirit { border-top: 1px dashed #c9b88f; margin-top: 8px; padding-top: 6px; font-size: 12px; }
.spirit h3 { margin: 8px 0 2px; }
.spirit ul { margin: 0; padding-left: 16px; }
.spirit li { margin: 2px 0; }
.spirit li.unread, .spirit li.unfit { color: #7a6a8a; }
.spirit li.unfit { text-decoration: line-through; }
.spirit form { display: flex; gap: 4px; margin-top: 4px; }
.spirit form input { flex: 1; min-width: 0; font: inherit; padding: 2px 6px; border: 2px solid #402e3a; background: #fbf4dc; }
.spirit form button { margin: 0; padding: 0 8px; }
.spirit-door { display: flex; align-items: center; gap: 8px; }
.spirit-sign { display: inline-block; margin: 2px 0; padding: 0 8px; font-weight: bold; text-transform: uppercase; letter-spacing: .1em;
  border: 2px solid #402e3a; transform: rotate(-3deg); box-shadow: 2px 2px 0 #402e3a; }
.spirit-sign.open { background: #c8e6b0; color: #2d5a2a; }
.spirit-sign.closed { background: #e8d8d0; color: #7a3a40; }
button.spirit-sign:active { transform: rotate(-3deg) translate(1px, 1px); }
.spirit-unpin { margin: 0 0 0 4px; padding: 0 4px; border: 0; background: none; box-shadow: none; color: #7a6a8a; }
.spirit-reading { background: #fbf4dc; border-left: 3px solid #7a6a8a; padding: 2px 8px; margin: 6px 0; }
.spirit-drift { background: #fbe4e0; border: 2px solid #b5404f; padding: 4px 8px; margin: 6px 0; }
.spirit-drift button { margin-top: 2px; }
.spirit-boarded { background: repeating-linear-gradient(-8deg, #cca66a 0 10px, #b08652 10px 12px); border: 2px solid #6e4a3a;
  padding: 4px 8px; margin: 6px 0; }
.spirit-boarded .meta { color: #4e3436; }
`;

/** Put the spirit's styles on the page, once. */
export function styleSpirit() {
  if (document.getElementById("spirit-css")) return;
  const s = document.createElement("style");
  s.id = "spirit-css";
  s.textContent = SPIRIT_CSS;
  document.head.append(s);
}

/** A boarded-up plot on the map: shuttered a shade darker, and two planks nailed across it. */
export function drawBoarded(ctx: CanvasRenderingContext2D, p: PlotDef) {
  ctx.fillStyle = "#2a1e2a";
  ctx.globalAlpha = 0.28;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (inPlot(p, x, y)) ctx.fillRect(p.x + x, p.y + y, 1, 1);
  ctx.globalAlpha = 1;
  for (const row of [Math.floor(p.h * 0.38), Math.floor(p.h * 0.62)]) {
    const xs = [...Array(p.w).keys()].filter((x) => inPlot(p, x, row));
    if (!xs.length) continue;
    const x0 = xs[0], x1 = xs[xs.length - 1];
    ctx.fillStyle = PLANK[3];
    ctx.fillRect(p.x + x0, p.y + row, x1 - x0 + 1, 1);
    ctx.fillStyle = PLANK[1];
    ctx.fillRect(p.x + x0, p.y + row + 1, x1 - x0 + 1, 1);
    ctx.fillStyle = PLANK[0]; // nails at either end
    ctx.fillRect(p.x + x0 + 1, p.y + row, 1, 1);
    ctx.fillRect(p.x + x1 - 1, p.y + row, 1, 1);
  }
}
