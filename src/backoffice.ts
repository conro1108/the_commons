// The back office, behind a 3s hold on the notice board: write a filing, pick
// what happens to it, and read the whole exchange between the models. Denied,
// or refused, you can write back: three appeals to Gary (a refusal skips him), then the committee, then one plea
// against them (the escalation is a proposal, not yet in the game). A dry run;
// api/backoffice.ts runs it and nothing is written. Loaded only when opened.

import { mapGround } from "./render.ts";
import { MAP_H, MAP_W, PLOTS, REGIONS, plotAt, plotById, type PlotDef } from "./world/index.ts";

// Mirrors Call in api/gary.ts.
interface Call { step: string; model: string; sent: any; got?: any; reasoning?: string; ms?: number; error?: string }

const FLOWS = {
  life: ["File it", "Gary rules, and the committee sits if he refers it. Denied, you write back."],
  committee: ["Straight to committee", "As if Gary referred it: five councillors, Jev hears the votes, the clerk writes it up."],
  draw: ["Draw", "Haiku draws it as a sprite, taking the filing as the thing's name."],
} as const;
type Flow = keyof typeof FLOWS;
const STATUS: Record<string, string> = {
  approved: "Approved", conditional: "Approved on condition", committee: "Referred to committee", denied: "Denied", refused: "Refused",
};
const WHO: Record<string, string> = { "typesafe-ai/jev": "Jev", "anthropic/claude-haiku-5.5": "Haiku", "anthropic/claude-sonnet-5.5": "Sonnet" };

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);
const pre = (v: unknown) => `<pre>${esc(typeof v === "string" ? v : JSON.stringify(v, null, 2))}</pre>`;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const secs = (ms?: number) => (ms === undefined ? "" : `${(ms / 1000).toFixed(1)}s`);
const bylawName = (n: number | null) => (n === null ? "no bylaw" : n === 0 ? "the covenant" : `Bylaw ${n}`);

// --- what came of it ----------------------------------------------------------

function stamp(v: { status: string; bylaw: number | null; concern?: string | null }, count?: string) {
  const under = v.status === "denied" ? ` under ${bylawName(v.bylaw)}` : "";
  return `<span class="stamp ${v.status}">${STATUS[v.status]}${under}</span>${v.concern ? ` <span class="dim">(${esc(v.concern)})</span>` : ""}${count ? ` <span class="dim">${esc(count)}</span>` : ""}`;
}
const said = (text: string | null | undefined) => `<blockquote>${esc(text ?? "")}</blockquote>`;
const conditionOf = (w: { condition: string; wants: string | null } | null) =>
  w ? `<p><span class="k">Condition</span> ${esc(w.condition)}${w.wants ? ` <span class="dim">(met with: ${esc(w.wants)})</span>` : ""}</p>` : "";

const VOTE = (v: string | null) =>
  v === null ? "struck" : v === "approved" ? "in favour" : v === "conditional" ? "in favour, on condition" : v === "refused" ? "against, as unfit" : v === "against" ? "against, no bylaw" : v === "abstain" ? "abstains" : `against, under ${v === "covenant" ? "the covenant" : `Bylaw ${v.slice(1)}`}`;

const ruled = (r: any) => `${stamp(r.verdict)}${said(r.permit)}${conditionOf(r.written)}`;
const sat = (r: any) => !r ? `<p>No quorum: fewer than three speeches stood. It sits again tomorrow night.</p>`
  : `${stamp(r.verdict, r.verdict.count)}${said(r.minutes.finding ?? r.minutes.outcome)}${conditionOf(r.written)}
    <ul class="votes">${r.minutes.members.map((m: any) => `<li><b>${esc(m.seat)}</b> ${VOTE(m.vote)}</li>`).join("")}</ul>`;
const pleaded = (plea: string) => `<p class="said-by-you"><span class="k">You wrote</span> <q>${esc(plea)}</q></p>`;
const filed = (intent: string, plot?: number) => {
  const p = plot !== undefined ? plotById(plot) : null;
  return `<p class="said-by-you"><span class="k">You filed</span> <q>${esc(intent)}</q>${p ? ` <span class="dim">on Plot ${p.id}, ${esc(p.name)}, ${esc(REGIONS[p.region].name)}</span>` : ""}</p>`;
};
const heard = (h: any) => `${!h.verdict ? `<span class="stamp refused">Not heard</span>` : h.verdict.status === "denied"
  ? `<span class="stamp denied">Dismissed</span> <span class="dim">still under ${bylawName(h.verdict.bylaw)}</span>`
  : `<span class="stamp approved">Allowed</span> ${stamp(h.verdict)}`}${said(h.reply)}${conditionOf(h.written)}`;

type Step = Flow | "appeal" | "escalate";
function outcome(what: Step, r: any): string {
  switch (what) {
    case "committee": case "escalate": return sat(r);
    case "appeal": return heard(r);
    case "draw": return r.sprite ? sprite(r.sprite) : `<p>No usable sprite after three tries.</p>`;
    case "life": return ruled(r.ruled) + (r.ruled.verdict.status === "committee" ? `<h3>The committee</h3>${sat(r.sat)}` : "");
  }
}

function sprite({ rows, palette }: { rows: string[]; palette: Record<string, string> }) {
  const c = document.createElement("canvas");
  c.width = Math.max(...rows.map((r) => r.length));
  c.height = rows.length;
  const g = c.getContext("2d")!;
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === "." || !palette[ch]) return;
    g.fillStyle = palette[ch];
    g.fillRect(x, y, 1, 1);
  }));
  return `<img class="sprite" src="${c.toDataURL()}" width="${c.width * 8}" height="${c.height * 8}">`;
}

// --- the conversation ---------------------------------------------------------

/** Jev's picks: each choice with its runners-up, each yes/no with its odds. */
function picks(got: Record<string, any>) {
  return `<ul class="picks">${Object.entries(got).map(([k, a]) => {
    if (a?.type === "boolean") return `<li><span class="k">${esc(k)}</span> ${a.probability > 0.5 ? "<b>yes</b>" : "no"} <span class="dim">${pct(a.probability)}</span></li>`;
    const rest = Object.entries((a?.probabilities ?? {}) as Record<string, number>)
      .filter(([c, p]) => c !== a.choice && p >= 0.05).sort((x, y) => y[1] - x[1]).map(([c, p]) => `${esc(c)} ${pct(p)}`);
    const p = a?.probabilities?.[a.choice];
    return `<li><span class="k">${esc(k)}</span> <b>${esc(a?.choice)}</b>${p !== undefined ? ` <span class="dim">${pct(p)}${rest.length ? `, ${rest.join(", ")}` : ""}</span>` : ""}</li>`;
  }).join("")}</ul>`;
}

function questions(qs: Record<string, any>) {
  return `<dl>${Object.entries(qs).map(([k, q]) => `<dt>${esc(k)} <span class="dim">${esc(q.type)}</span></dt>
    <dd>${esc(q.instructions)}${q.criteria ? `<ul>${Object.entries(q.criteria).map(([c, d]) => `<li><b>${esc(c)}</b> ${c === d ? "" : esc(d)}</li>`).join("")}</ul>` : ""}</dd>`).join("")}</dl>`;
}

function message(c: Call) {
  const writes = typeof c.sent?.system === "string";
  const short = c.model.split("/").pop();
  const who = c.step.startsWith("Councillor")
    ? `${esc(c.step)} <span class="dim">${esc(short)}</span>`
    : `${esc(WHO[c.model] ?? short)} <span class="dim">· ${esc(c.step)}</span>`;
  const body = c.error ? `<p class="problem">${esc(c.error)}</p>`
    : c.got === undefined ? `<p class="dim">No answer.</p>`
    : writes ? `<p class="said">${esc(c.got)}</p>` : picks(c.got);
  const given = writes
    ? `<h3>System</h3>${pre(c.sent.system)}<h3>Prompt</h3>${pre(c.sent.prompt)}`
    : `<h3>State</h3>${pre(c.sent.state)}<h3>Questions</h3>${questions(c.sent.questions)}`;
  return `<div class="msg ${writes ? "writes" : "asks"}">
    <div class="who"><span>${who}</span><span class="dim">${secs(c.ms)}</span></div>
    ${body}
    ${c.reasoning ? `<details><summary>Its reasoning</summary>${pre(c.reasoning)}</details>` : ""}
    <details><summary>What it was given</summary>${given}</details>
  </div>`;
}

// --- the panel ----------------------------------------------------------------

let panel: HTMLElement | null = null;

/** Open the back office, or close it if it's open. Starts on the given plot. */
export function backoffice(plot: number) {
  if (!panel) panel = mount(plot);
  panel.hidden = !panel.hidden;
}

/** The commons with every plot lit, to pick one from: hovered, it says what it is; clicked, it's the one. */
function picker(el: HTMLElement, first: number, card: HTMLElement) {
  const c = el.querySelector("canvas")!;
  const g = c.getContext("2d")!;
  let chosen = first;
  let hover: number | null = null;
  const cells = (p: PlotDef) => [...p.mask].flatMap((m, i) => (m === "#" ? [[i % p.w, Math.floor(i / p.w)]] : []));
  const edge = (p: PlotDef, x: number, y: number) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => p.mask[(y + dy) * p.w + x + dx] !== "#" || x + dx < 0 || x + dx >= p.w);

  function paint() {
    g.drawImage(mapGround(), 0, 0);
    g.fillStyle = "#1b262266";
    g.fillRect(0, 0, MAP_W, MAP_H);
    for (const p of PLOTS) {
      const lit = p.id === chosen ? "#ffe9a8dd" : p.id === hover ? "#fffdf3aa" : "#fffdf344";
      for (const [x, y] of cells(p)) {
        g.fillStyle = (p.id === chosen || p.id === hover) && edge(p, x, y) ? "#402e3a" : lit;
        g.fillRect(p.x + x, p.y + y, 1, 1);
      }
    }
    const p = plotById(hover ?? chosen)!;
    const r = REGIONS[p.region];
    card.innerHTML = `<h3>${hover !== null && hover !== chosen ? "" : "Chosen: "}Plot ${p.id}, ${esc(p.name)} <span class="dim">on ${esc(r.name)}</span></h3>
      <p class="dim">${esc(r.blurb)}</p><ul>${p.particulars.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  }
  const at = (e: MouseEvent) => {
    const b = c.getBoundingClientRect();
    return plotAt(Math.floor(((e.clientX - b.left) / b.width) * MAP_W), Math.floor(((e.clientY - b.top) / b.height) * MAP_H));
  };
  c.addEventListener("mousemove", (e) => {
    const id = at(e)?.id ?? null;
    if (id !== hover) (hover = id), paint();
  });
  c.addEventListener("mouseleave", () => ((hover = null), paint()));
  c.addEventListener("click", (e) => {
    const p = at(e);
    if (p) (chosen = p.id), paint();
  });
  paint();
  return () => chosen;
}

const STYLE = `
  #dev { position: fixed; top: 12px; right: 12px; bottom: 12px; width: min(720px, calc(100vw - 24px)); box-sizing: border-box;
         overflow-y: auto; z-index: 50; padding: 22px 28px 48px; font-size: 14px; line-height: 1.5; }
  #dev h1 { font-size: 18px; } #dev h1 + p { margin: 2px 0 0; }
  #dev section { margin-top: 28px; }
  #dev h2 { margin-bottom: 10px; }
  #dev h3 { margin: 12px 0 4px; }
  #dev textarea, #dev input, #dev select { font: inherit; border: 2px solid #402e3a; background: #fbf4dc; padding: 4px 8px; }
  #dev textarea { display: block; width: 100%; box-sizing: border-box; padding: 8px 10px; resize: vertical; }
  #dev .picker canvas { display: block; width: 100%; image-rendering: pixelated; cursor: pointer; border: 2px solid #402e3a; }
  #dev .picker .card { min-height: 9em; margin-top: 10px; }
  #dev .picker .card h3 { margin: 0; text-transform: none; letter-spacing: 0; font-size: 14px; color: inherit; }
  #dev .picker .card ul { margin: 6px 0 0; padding-left: 18px; }
  #dev .flows { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
  #dev .flow { position: relative; border: 2px solid #c9b88f; padding: 8px 12px; cursor: pointer; }
  #dev .flow:has(input:checked) { border-color: #402e3a; background: #ffe9a8; box-shadow: 2px 2px 0 #402e3a; }
  #dev .flow input { position: absolute; opacity: 0; pointer-events: none; }
  #dev .flow b { display: block; } #dev .flow span { display: block; font-size: 12px; color: #7a6a8a; line-height: 1.35; }
  #dev .flows + textarea { margin-top: 14px; }
  #dev .go { margin-top: 12px; padding: 8px 26px; font-size: 15px; }
  #dev .dim, #dev .k { color: #8a7a98; } #dev .k { margin-right: 6px; }
  #dev blockquote { margin: 10px 0 14px; padding: 10px 14px; background: #fbf4dc; border: 1px dashed #c9b88f; white-space: pre-wrap; }
  #dev .stamp { display: inline-block; padding: 1px 8px; border: 2px solid; font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
  #dev .stamp.approved, #dev .stamp.conditional { color: #3d7a3a; }
  #dev .stamp.denied, #dev .stamp.refused { color: #b5404f; }
  #dev .stamp.committee { color: #b07a1e; }
  #dev .step { margin-top: 32px; padding-top: 20px; border-top: 2px dashed #c9b88f; }
  #dev .step:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
  #dev .said-by-you { margin: 0 0 12px; font-size: 15px; }
  #dev .reply { margin-top: 32px; padding: 16px 18px; border: 2px solid #402e3a; background: #fff4c9; }
  #dev .reply textarea { margin-top: 8px; background: #fffdf3; }
  #dev .closed { margin-top: 28px; font-style: italic; }
  #dev .votes { margin: 0; padding-left: 18px; }
  #dev .copy-all { float: right; } #dev .copy { font-size: 12px; margin-left: 8px; vertical-align: middle; }
  #dev .msg { margin: 14px 0; padding: 10px 14px; border-left: 4px solid; background: #fffaf0; }
  #dev .msg.asks { border-color: #b07a1e; } #dev .msg.writes { border-color: #7a6a8a; }
  #dev .msg .who { display: flex; justify-content: space-between; gap: 12px; font-weight: bold; margin-bottom: 6px; }
  #dev .msg .said { white-space: pre-wrap; margin: 0; }
  #dev .picks { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 2px 18px; }
  #dev details { margin-top: 8px; } #dev summary { cursor: pointer; color: #8a7a98; }
  #dev pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; background: #fbf4dc; border: 1px dashed #c9b88f;
             padding: 8px 10px; margin: 4px 0; max-height: 360px; overflow-y: auto; }
  #dev dt { font-weight: bold; margin-top: 8px; } #dev dd { margin: 0 0 0 12px; } #dev dd ul { margin: 2px 0; padding-left: 18px; }
  #dev .sprite { image-rendering: pixelated; background: #8ec572; padding: 8px; margin: 10px 0; }
`;

function mount(first: number): HTMLElement {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  const panel = document.createElement("div");
  panel.id = "dev";
  panel.className = "paper";
  panel.hidden = true;
  panel.innerHTML = `<button class="close" aria-label="Close">×</button>
    <h1>Back office</h1>
    <p class="dim">A dry run: nothing is written to the commons.</p>
    <section class="picker" data-for="life committee">
      <h2>The plot</h2>
      <canvas width="${MAP_W}" height="${MAP_H}"></canvas>
      <div class="card"></div>
    </section>
    <section>
      <h2>The filing, and what happens to it</h2>
      <div class="flows">${Object.entries(FLOWS).map(([k, [name, blurb]], i) =>
        `<label class="flow"><input type="radio" name="flow" value="${k}"${i ? "" : " checked"}><b>${name}</b><span>${blurb}</span></label>`).join("")}</div>
      <textarea name="intent" rows="3" maxlength="120" placeholder="a bench, for looking at the pond with"></textarea>
      <button class="go">Run</button>
    </section>
    <section class="out" hidden>
      <button class="copy-all">Copy JSON</button>
      <div class="stages"></div>
      <div class="reply" hidden>
        <h2 class="to"></h2>
        <p class="why dim"></p>
        <textarea name="plea" rows="3" placeholder="it's a very small moat, more of a puddle really"></textarea>
        <button class="send">Send</button>
      </div>
      <p class="closed dim" hidden></p>
    </section>`;
  document.body.append(panel);

  const field = <T extends HTMLElement = HTMLInputElement>(name: string) => panel.querySelector<T>(`[name=${name}]`)!;
  const $ = (sel: string) => panel.querySelector<HTMLElement>(sel)!;
  const flow = () => panel.querySelector<HTMLInputElement>("[name=flow]:checked")!.value as Flow;

  const refit = () => panel.querySelectorAll<HTMLElement>("[data-for]").forEach((el) => (el.hidden = !el.dataset.for!.split(" ").includes(flow())));
  refit();
  panel.querySelectorAll("[name=flow]").forEach((r) => r.addEventListener("change", refit));
  const chosen = picker($(".picker"), first, $(".picker .card"));

  // The case, while it's open to appeal: what it's denied under (or that it was refused), and what's been said.
  // Denied, it's three pleas to Gary, then the committee; refused, Gary won't hear it, so straight to the committee.
  let open: {
    intent: string; plot: number; bylaw: number | null; refused: boolean; exchange: { plea: string; reply: string | null }[]; finding?: string;
  } | null = null;
  let busy = false;
  let session = crypto.randomUUID(); // one case, filing to last appeal, as kept in backoffice_runs

  /** A step's reply, asked after until it's been kept or the deadline passes. */
  async function recover(step: string, deadline: number): Promise<any> {
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`/api/backoffice?step=${step}`).catch(() => null);
      if (res?.ok) return res.json();
    }
    throw new Error("The line dropped, and his reply never came.");
  }

  // Every step of the case as it came back, for copying out whole.
  let steps: unknown[] = [];
  async function copy(button: HTMLElement, what: unknown) {
    await navigator.clipboard.writeText(JSON.stringify(what, null, 2));
    const was = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = was), 1200);
  }
  $(".copy-all").addEventListener("click", (e) => void copy(e.currentTarget as HTMLElement, { session, steps }));

  /** One step of the case: a stage with its outcome and the conversation that produced it. */
  async function stage(title: string, what: Step, input: Record<string, unknown>, before = ""): Promise<any> {
    panel.querySelectorAll<HTMLDetailsElement>(".talk").forEach((d) => (d.open = false));
    const el = document.createElement("div");
    el.className = "step";
    el.innerHTML = `<h2>${title} <span class="took dim"></span><button class="copy" hidden>copy</button></h2>${before}<div class="outcome"></div>
      <details class="talk" open><summary>The conversation</summary><div class="calls"></div></details>`;
    $(".stages").append(el);
    const at = (sel: string) => el.querySelector<HTMLElement>(sel)!;
    const t = Date.now();
    let waiting = "At his desk…";
    const wait = () => (at(".outcome").innerHTML = `<p class="dim">${waiting} ${Math.round((Date.now() - t) / 1000)}s</p>`);
    wait();
    const tick = setInterval(wait, 1000);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const step = crypto.randomUUID();
    try {
      let body: any;
      try {
        const res = await fetch("/api/backoffice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ what, id: 9999, session, step, ...input }) });
        body = await res.json();
      } catch {
        // The line dropped (a phone puts a backgrounded tab to sleep), but the run carries on and is kept: ask after it.
        waiting = "The line dropped; waiting on his reply…";
        body = await recover(step, t + 5 * 60_000);
      }
      const kept = { title, what, input, ...body };
      steps.push(kept);
      at(".copy").hidden = false;
      at(".copy").addEventListener("click", () => void copy(at(".copy"), kept));
      at(".outcome").innerHTML = body.error ? `<p class="problem">${esc(body.error)}</p>` : outcome(what, body.result);
      at(".took").textContent = `${secs(body.ms)}, ${body.calls?.length ?? 0} calls${body.run ? `, run ${body.run}` : ""}`;
      at(".calls").innerHTML = (body.calls ?? []).map(message).join("") || `<p class="dim">No models were asked.</p>`;
      return body.error ? undefined : body.result;
    } catch (e) {
      at(".outcome").innerHTML = `<p class="problem">${esc(e)}</p>`;
    } finally {
      clearInterval(tick);
    }
  }

  /** Where the case stands: open to a plea (to Gary, or against the committee), or closed. */
  function standing(why?: string) {
    const n = open?.exchange.length ?? 0;
    $(".reply").hidden = !open;
    $(".closed").hidden = !!open || !why;
    $(".closed").textContent = why ?? "";
    if (!open) return;
    $(".to").textContent = open.finding ? "Final appeal, against the committee" : open.refused ? "Appeal, to the committee" : `Appeal ${n + 1} of 3, to Gary`;
    $(".why").textContent = open.finding ? "The committee has ruled on appeal. One last plea, and that's final."
      : open.refused ? "Refused as unfit. Gary won't hear an appeal himself, so this goes straight to the committee."
      : `Denied under ${bylawName(open.bylaw)}. Write back to make your case.${n === 2 ? " If this is dismissed too, it goes up to the committee." : ""}`;
    field<HTMLTextAreaElement>("plea").focus({ preventScroll: true });
  }

  /** Denied or refused: open to appeal. */
  const settle = (v: { status: string; bylaw: number | null } | undefined, intent: string, plot: number) => {
    const against = v?.status === "denied" || v?.status === "refused";
    open = against ? { intent, plot, bylaw: v.bylaw, refused: v.status === "refused", exchange: [] } : null;
    standing();
  };

  async function run() {
    if (busy) return;
    const f = flow();
    const intent = field<HTMLTextAreaElement>("intent").value.trim();
    const plot = chosen();
    $(".out").hidden = false;
    $(".stages").innerHTML = "";
    steps = [];
    open = null;
    session = crypto.randomUUID();
    standing();
    if (!intent) return standing("Write a filing first.");

    busy = true;
    const r = await stage({ life: "Gary rules", committee: "The committee", draw: "Drawn" }[f], f, { intent, label: intent, plot },
      filed(intent, f === "draw" ? undefined : plot));
    busy = false;
    if (r && f !== "draw") settle(f === "life" ? (r.sat?.verdict ?? r.ruled.verdict) : r.verdict, intent, plot);
  }

  async function send() {
    const plea = field<HTMLTextAreaElement>("plea").value.trim();
    if (busy || !open || !plea) return;
    const c = open;
    busy = true;
    field<HTMLTextAreaElement>("plea").value = "";
    $(".reply").hidden = true;
    const base = () => ({ intent: c.intent, plot: c.plot, bylaw: c.bylaw, refused: c.refused, earlier: c.exchange });
    const close = (why: string) => ((open = null), standing(why));

    /** The committee hears it on appeal; against them, one plea more. */
    async function upstairs(before = "") {
      const sat = await stage("The committee, on appeal", "escalate", base(), before);
      if (sat === undefined) return close("Something went wrong at the desk.");
      if (!sat) return close("No quorum, so it'd sit again tomorrow night. The case is closed here.");
      if (sat.verdict.status !== "denied" && sat.verdict.status !== "refused") return close("Allowed on appeal. The case is closed.");
      c.finding = sat.minutes.finding ?? sat.minutes.outcome;
      standing();
    }

    if (c.finding) {
      await stage("Final appeal, to the committee", "escalate", { ...base(), against: { finding: c.finding, plea } }, pleaded(plea));
      close("That was final.");
    } else if (c.refused) {
      c.exchange.push({ plea, reply: null });
      await upstairs(pleaded(plea));
    } else {
      const h = await stage(`Appeal ${c.exchange.length + 1} to Gary`, "appeal", { ...base(), plea }, pleaded(plea));
      if (!h) close("Something went wrong at the desk.");
      else if (!h.ok) close("Gary won't hear it. That's the end of it.");
      else if (h.verdict.status !== "denied") close("Allowed. The case is closed.");
      else {
        c.exchange.push({ plea, reply: h.reply });
        c.bylaw = h.verdict.bylaw;
        if (c.exchange.length < 3) standing();
        else await upstairs();
      }
    }
    busy = false;
  }

  $(".go").addEventListener("click", run);
  $(".send").addEventListener("click", send);
  panel.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
    void ((e.target as HTMLElement).getAttribute("name") === "plea" ? send() : run());
  });
  $(".close").addEventListener("click", () => (panel.hidden = true));
  return panel;
}
