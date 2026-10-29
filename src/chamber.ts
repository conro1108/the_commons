// The committee chamber: a sitting acted out from its minutes. The clerk reads
// the item, each councillor stands in turn to say their piece and shows their
// vote, then the clerk reads the finding and the stamp comes down. Click, tap,
// space or enter to go on; Esc leaves. Loaded only when a sitting is shown;
// tune it on dev/chamber.html.

import { blit, widthOf } from "./avatar.ts";
import { humanSprite, type HumanSpec } from "./content/people.ts";
import { REGIONS, plotById } from "./world/index.ts";
import type { Filing } from "./net.ts";

export interface Sitting {
  intent: string;
  plot?: number;
  minutes: NonNullable<Filing["minutes"]>;
  plea?: string | null; // on appeal: what the filer wrote to the committee
  condition?: () => string | null | undefined; // asked at the end, since an allowed appeal's filing may arrive after it
}

const W = 160, H = 96; // art pixels
const SEATS = [40, 62, 84, 106, 128];
const CLERK_AT = { x: 16, y: 85 }; // feet
const BIG = 2; // people are drawn at twice map size, so they read over the table
const PACE = Number(new URLSearchParams(location.search).get("pace")) || 55; // characters a second

// Seats as named in api/gary.ts COMMITTEE; anyone else gets a plain look.
const LOOKS: Record<string, HumanSpec> = {
  "Councillor Bramble": { skin: "porcelain", hair: "bun", hairColour: "grey", outfit: "cardigan", outfitColour: "lilac", extra: "scarf" },
  "Councillor Pike": { skin: "sand", hair: "short", hairColour: "black", outfit: "cardigan", outfitColour: "navy", extra: "glasses" },
  "Councillor Ashdown": { skin: "umber", hair: "beanie", hairColour: "brown", outfit: "raincoat", outfitColour: "marigold", extra: "beard" },
  "Councillor Moth": { skin: "peach", hair: "curly", hairColour: "pink", outfit: "dress", outfitColour: "rose", extra: "flower" },
  "Councillor Fenwick": { skin: "olive", hair: "bald", hairColour: "grey", outfit: "tee", outfitColour: "moss", extra: "freckles" },
};
const PLAIN: HumanSpec = { skin: "peach", hair: "short", hairColour: "brown", outfit: "tee", outfitColour: "sage", extra: "none" };
const CLERK: HumanSpec = { skin: "cocoa", hair: "bob", hairColour: "black", outfit: "tee", outfitColour: "sky", extra: "glasses" };

/** A vote as a placard: the word, and a word under it. */
function placard(v: string | null): { cls: string; big: string; small: string; title: string } {
  if (v === null) return { cls: "struck", big: "STRUCK", small: "", title: "Struck from the minutes" };
  if (v === "approved") return { cls: "aye", big: "AYE", small: "", title: "In favour" };
  if (v === "conditional") return { cls: "aye", big: "AYE", small: "IF", title: "In favour, on a condition" };
  if (v === "abstain") return { cls: "abstain", big: "ABSTAIN", small: "", title: "Abstains" };
  if (v === "covenant") return { cls: "nay", big: "NAY", small: "COV", title: "Against, under the covenant" };
  if (v === "refused") return { cls: "nay", big: "NAY", small: "UNFIT", title: "Against, as unfit" };
  if (v === "against") return { cls: "nay", big: "NAY", small: "", title: "Against, citing no bylaw" };
  return { cls: "nay", big: "NAY", small: `B${v.slice(1)}`, title: `Against, under Bylaw ${v.slice(1)}` };
}

/** The stamp, read off the outcome (written by OUTCOME() in api/gary.ts). */
function stampOf(outcome: string, appeal: boolean): { cls: string; big: string; small: string } {
  const o = outcome.replace(/^.*?the filing is /, "");
  if (o.startsWith("returned")) return { cls: "abstain", big: "Returned", small: "undecided" };
  if (o.startsWith("refused")) return { cls: "nay", big: appeal ? "Dismissed" : "Refused", small: "as unfit" };
  const cond = o.startsWith("approved on condition") ? "on condition" : "";
  if (o.startsWith("approved")) return { cls: "aye", big: appeal ? "Allowed" : "Approved", small: cond };
  const under = o.match(/^denied under (Bylaw \d+|the covenant)/)?.[1] ?? "";
  return { cls: "nay", big: appeal ? "Dismissed" : "Denied", small: under && `under ${under}` };
}

type Beat = { who: number | "clerk"; name: string; text: string; struck?: boolean; finding?: boolean };

function script(s: Sitting): Beat[] {
  const p = s.plot !== undefined ? plotById(s.plot) : undefined;
  const where = p ? `, on Plot ${p.id}, ${p.name}, ${REGIONS[p.region].name}` : "";
  const why = s.plea ? `It comes to us on appeal against the administrator. The filer writes: “${s.plea}”` : "Referred to us by the administrator.";
  const condition = s.condition?.();
  return [
    { who: "clerk", name: "The clerk", text: `Order, please. Next item: “${s.intent}”${where}. ${why}` },
    ...s.minutes.members.map((m, i): Beat => (m.speech
      ? { who: i, name: m.seat, text: m.speech }
      : { who: i, name: m.seat, text: "(Struck from the minutes.)", struck: true })),
    { who: "clerk", name: "The clerk", text: s.minutes.finding ?? s.minutes.outcome, finding: true },
    ...(condition ? [{ who: "clerk" as const, name: "The clerk", text: `The condition: ${condition}` }] : []),
  ];
}

/** When each character of a line is out: a beat at the end of a sentence, a breath at a comma. */
function timings(text: string): number[] {
  let t = 0;
  return [...text].map((ch) => (t += 1000 / PACE + (/[.!?]/.test(ch) ? 260 : /[,;:]/.test(ch) ? 90 : 0)));
}

// --- the room ---------------------------------------------------------------

const rect = (g: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};
const STARS = [[3, 4], [11, 2], [15, 9], [6, 13], [16, 17], [2, 19], [9, 7]];

/** The walls, floor, windows and board: everything that doesn't move, drawn once. */
function room(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  rect(g, "#e6d4a8", 0, 0, W, 62);
  rect(g, "#6b4a3a", 0, 0, W, 3);
  rect(g, "#d6c193", 0, 3, W, 1);
  // wainscot
  rect(g, "#8a5a3c", 0, 46, W, 16);
  rect(g, "#a8744c", 0, 45, W, 2);
  for (let x = 6; x < W; x += 16) rect(g, "#7a4c32", x, 49, 1, 11);
  // floorboards
  rect(g, "#6e4a36", 0, 62, W, H - 62);
  for (let y = 66, row = 0; y < H; y += 5, row++) {
    rect(g, "#5e3e2c", 0, y, W, 1);
    for (let x = (row % 2) * 13; x < W; x += 26) rect(g, "#5e3e2c", x, y - 4, 1, 4);
  }
  // two windows on the night (it meets overnight)
  for (const wx of [8, 132]) {
    rect(g, "#6b4a3a", wx - 1, 9, 22, 28);
    rect(g, "#27304f", wx + 1, 11, 18, 24);
    for (const [sx, sy] of STARS) rect(g, "#fffdf3", wx + 1 + sx, 11 + sy, 1, 1);
    rect(g, "#6b4a3a", wx + 9, 11, 2, 24);
    rect(g, "#6b4a3a", wx + 1, 22, 18, 2);
    rect(g, "#a8744c", wx - 2, 37, 24, 2);
  }
  // the moon, in the left one
  rect(g, "#fbf4dc", 12, 13, 3, 4);
  rect(g, "#fbf4dc", 11, 14, 5, 2);
  rect(g, "#27304f", 14, 13, 2, 2);
  // the tally board
  rect(g, "#6b4a3a", 55, 8, 50, 22);
  rect(g, "#2f4a3a", 57, 10, 46, 18);
  rect(g, "#6b4a3a", 79, 4, 2, 4);
  // the clerk's chair
  rect(g, "#5a3a2a", CLERK_AT.x - 8, CLERK_AT.y - 32, 16, 24);
  rect(g, "#6e4a36", CLERK_AT.x - 6, CLERK_AT.y - 30, 12, 20);
  return c;
}

/** The councillors' table, in front of them. */
function table(g: CanvasRenderingContext2D) {
  rect(g, "#cf9a68", 26, 60, 116, 1);
  rect(g, "#b88454", 26, 61, 116, 2);
  rect(g, "#8a5a3c", 27, 63, 114, 13);
  rect(g, "#5e3e2c", 27, 76, 114, 1);
  for (const x of SEATS) {
    rect(g, "#fffdf3", x - 3, 60, 5, 2); // papers
    rect(g, "#ecdcb0", x - 6, 66, 12, 4); // name plate
    rect(g, "#6b4a3a", x - 4, 67, 8, 1);
  }
  rect(g, "#d8e8f0", 72, 56, 3, 4); // the jug
  rect(g, "#fffdf3", 72, 56, 3, 1);
}

function desk(g: CanvasRenderingContext2D) {
  const { x, y } = CLERK_AT;
  rect(g, "#cf9a68", x - 13, y - 8, 28, 1);
  rect(g, "#b88454", x - 13, y - 7, 28, 2);
  rect(g, "#8a5a3c", x - 12, y - 5, 26, 10);
  rect(g, "#5e3e2c", x - 12, y + 5, 26, 1);
  rect(g, "#fffdf3", x - 2, y - 9, 9, 2); // the minutes
  rect(g, "#402e3a", x + 9, y - 13, 1, 5); // the pen
}

function chair(g: CanvasRenderingContext2D, x: number) {
  rect(g, "#5a3a2a", x - 9, 34, 18, 26);
  rect(g, "#5a3a2a", x - 8, 33, 16, 1);
  rect(g, "#6e4a36", x - 7, 36, 14, 22);
}

// --- the sitting --------------------------------------------------------------

const STYLE = `
  #chamber { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; align-items: center; justify-content: center;
             gap: 10px; padding: 12px; background: #1b2622ee; color: #402e3a; font: 14px/1.45 ui-monospace, monospace; cursor: pointer;
             user-select: none; -webkit-user-select: none; }
  #chamber .stage { position: relative; border: 2px solid #402e3a; box-shadow: 3px 3px 0 #000a; }
  #chamber canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
  #chamber .tally { position: absolute; left: 35.6%; top: 10.4%; width: 28.8%; height: 18.8%; display: flex; align-items: center;
                    justify-content: center; gap: 1.2em; color: #e8f0e0; font-size: max(10px, calc(var(--s) * 3.4px)); font-weight: bold; }
  #chamber .tally .n { display: inline-block; min-width: 1ch; }
  #chamber .card { position: absolute; top: 64%; transform: translate(-50%, 0) scale(0); padding: 1px 4px; border: 2px solid #402e3a;
                   background: #fffdf3; font-weight: bold; text-align: center; line-height: 1.05; font-size: max(9px, calc(var(--s) * 2.6px));
                   box-shadow: 1px 1px 0 #402e3a; transition: transform .25s cubic-bezier(.3, 1.8, .5, 1); white-space: nowrap; }
  #chamber .card.up { transform: translate(-50%, 0) scale(1); }
  #chamber .card small { display: block; font-size: .78em; }
  #chamber .aye { color: #3d7a3a; } #chamber .nay { color: #b5404f; } #chamber .abstain { color: #7a6a8a; }
  #chamber .card.struck { color: #7a6a8a; text-decoration: line-through; }
  #chamber .stamp { position: absolute; left: 50%; top: 40%; padding: .1em .5em; border: .14em solid currentColor; background: #fffdf3e0;
                    font-size: max(20px, calc(var(--s) * 9px)); font-weight: bold; text-transform: uppercase; letter-spacing: .06em;
                    line-height: 1.1; text-align: center; transform: translate(-50%, -50%) rotate(-8deg) scale(2.6); opacity: 0;
                    transition: transform .22s cubic-bezier(.5, 0, .9, .4), opacity .12s; pointer-events: none; }
  #chamber .stamp.down { transform: translate(-50%, -50%) rotate(-8deg) scale(1); opacity: 1; }
  #chamber .stamp small { display: block; font-size: .42em; letter-spacing: .1em; }
  #chamber .stage.thud { animation: thud .18s; }
  @keyframes thud { 30% { translate: 0 3px; } }
  #chamber .say { position: relative; box-sizing: border-box; min-height: 8.6em; max-height: 34vh; overflow-y: auto; padding: 10px 14px 18px;
                  background: #fffdf3; border: 2px solid #402e3a; box-shadow: 3px 3px 0 #000a; }
  #chamber .say b { display: block; margin-bottom: 2px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #7a6a8a; }
  #chamber .say p { margin: 0; white-space: pre-wrap; }
  #chamber .say p.struck { color: #7a6a8a; font-style: italic; }
  #chamber .say .more { position: absolute; right: 10px; bottom: 4px; font-size: 11px; color: #7a6a8a; animation: blink 1s steps(2) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  #chamber .bar { display: flex; justify-content: flex-end; gap: 6px; }
  #chamber .bar button { font: inherit; font-size: 12px; font-weight: bold; padding: 2px 10px; border: 2px solid #402e3a; background: #ffe9a8;
                         box-shadow: 2px 2px 0 #000a; cursor: pointer; color: #402e3a; }
`;

let styled = false;

/** Act out a sitting; resolves when it's been watched (or left). */
export function chamber(s: Sitting): Promise<void> {
  if (!styled) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.append(style);
    styled = true;
  }
  const beats = script(s);
  const members = s.minutes.members;
  const sprites = members.map((m) => humanSprite(LOOKS[m.seat] ?? PLAIN, 0));
  const clerk = humanSprite(CLERK, 0);
  const stamp = stampOf(s.minutes.outcome, !!s.plea);

  const el = document.createElement("div");
  el.id = "chamber";
  el.innerHTML = `
    <div class="stage">
      <canvas width="${W}" height="${H}"></canvas>
      <div class="tally"><span class="aye">AYE <span class="n">0</span></span><span class="nay">NAY <span class="n">0</span></span></div>
      ${members.map((m, i) => {
        const c = placard(m.vote);
        return `<div class="card ${c.cls}" style="left:${(SEATS[i] / W) * 100}%" title="${c.title}">${c.big}${c.small ? `<small>${c.small}</small>` : ""}</div>`;
      }).join("")}
      <div class="stamp ${stamp.cls}">${stamp.big}${stamp.small ? `<small>${stamp.small}</small>` : ""}</div>
    </div>
    <div class="say"><b></b><p></p><span class="more" hidden>▼</span></div>
    <div class="bar"><button class="skip">Skip to the vote</button><button class="leave">Leave</button></div>`;
  document.body.append(el);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const stage = $(".stage");
  const g = $<HTMLCanvasElement>("canvas").getContext("2d")!;
  const cards = [...el.querySelectorAll<HTMLElement>(".card")];
  const backdrop = room();

  function fit() {
    const s = Math.max(1, Math.min(6, Math.floor((innerWidth - 28) / W), Math.floor((innerHeight - 230) / H)));
    stage.style.width = `${W * s}px`;
    stage.style.height = `${H * s}px`;
    el.style.setProperty("--s", String(s));
    $(".say").style.width = $(".bar").style.width = `${W * s + 4}px`;
  }
  fit();
  addEventListener("resize", fit);

  let at = 0;
  let began = performance.now();
  let times = timings(beats[0].text);
  let shown = -1; // characters out on this beat
  let revealed = false;
  const up = new Set<number>();
  const tally = () => {
    const votes = [...up].map((i) => members[i].vote);
    const [aye, nay] = el.querySelectorAll<HTMLElement>(".tally .n");
    aye.textContent = String(votes.filter((v) => v === "approved" || v === "conditional").length);
    nay.textContent = String(votes.filter((v) => v && v !== "approved" && v !== "conditional" && v !== "abstain").length);
  };
  const raise = (i: number) => {
    up.add(i);
    cards[i].classList.add("up");
    tally();
  };
  function slam() {
    $(".stamp").classList.add("down");
    setTimeout(() => stage.classList.add("thud"), 200);
  }

  const beat = () => beats[at];
  const done = (now: number) => now - began >= times[times.length - 1];
  function enter(i: number) {
    at = i;
    began = performance.now();
    times = timings(beats[i].text);
    shown = -1;
    revealed = false;
    $("b").textContent = beats[i].name;
    $(".say p").className = beats[i].struck ? "struck" : "";
    $(".say").scrollTop = 0;
    $(".skip").hidden = beats.slice(0, i + 1).some((b) => b.finding);
  }
  enter(0);

  function on() {
    if (!done(performance.now())) return void (began = -Infinity);
    if (at < beats.length - 1) return enter(at + 1);
    leave();
  }
  function skip() {
    members.forEach((_, i) => raise(i));
    enter(beats.findIndex((b) => b.finding));
    began = -Infinity;
  }

  let resolve!: () => void;
  const watched = new Promise<void>((r) => (resolve = r));
  let frame = 0;
  function leave() {
    cancelAnimationFrame(frame);
    removeEventListener("resize", fit);
    removeEventListener("keydown", key, true);
    el.remove();
    resolve();
  }
  function key(e: KeyboardEvent) {
    if (e.key === "Escape") leave();
    else if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") on();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
  addEventListener("keydown", key, true);
  el.addEventListener("click", on);
  $(".skip").addEventListener("click", (e) => (e.stopPropagation(), skip()));
  $(".leave").addEventListener("click", (e) => (e.stopPropagation(), leave()));

  function draw(now: number) {
    const b = beat();
    const typing = !done(now);
    const n = typing ? times.findIndex((t) => t > now - began) : b.text.length;
    if (n !== shown) {
      shown = n;
      $(".say p").textContent = b.text.slice(0, n);
      $(".more").hidden = typing;
    }
    if (!typing && !revealed) {
      revealed = true;
      if (typeof b.who === "number") raise(b.who);
      if (b.finding) slam();
    }

    g.drawImage(backdrop, 0, 0);
    const talking = typing && !b.struck && Math.floor(now / 170) % 2 === 1;
    // The speaker's up; everyone else turns to them (to the clerk, when it's the clerk).
    const speaker = typeof b.who === "number" ? SEATS[b.who] : CLERK_AT.x;
    members.forEach((_, i) => {
      const x = SEATS[i];
      const standing = b.who === i;
      const rise = standing ? Math.min(8, Math.floor((now - began) / 20)) : 0;
      chair(g, x);
      const sprite = sprites[i];
      const foot = 68 - rise - (standing && talking ? 1 : 0);
      blit(g, sprite, x - widthOf(sprite), foot - sprite.rows.length * BIG, !standing && speaker < x, BIG);
    });
    table(g);
    const lift = b.who === "clerk" && talking ? 1 : 0;
    blit(g, clerk, CLERK_AT.x - widthOf(clerk), CLERK_AT.y - clerk.rows.length * BIG - lift, false, BIG);
    desk(g);
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
  return watched;
}
