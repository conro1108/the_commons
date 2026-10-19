// The back office, behind a 5s hold on the notice board: dry runs of Gary's
// pipeline (api/backoffice.ts runs them), the live in-tray on demand, and
// local-only fakes for testing how things arrive. Loaded only when opened.

import type { Filing, Status } from "./net.ts";
import type { Plot } from "./layout.ts";

export interface DevHooks {
  me: string;
  filings: Map<number, Filing>;
  arrive: (f: Filing) => Promise<void>;
  papers: () => void;
  speak: (line?: string) => void;
  selected: () => number | null; // the filing on the selected plot
  freePlot: () => Plot | null;
}

// Mirrors CONDITIONS in api/gary.ts.
const STOCK = ["north", "flag", "plaque", "tuesdays", "dignified", "neighbour", "goose", "smaller"];
const STATUSES: Status[] = ["approved", "conditional", "committee", "denied", "refused", "lost"];
const KEPT = "the_commons.dev.runs";

interface Run {
  n: number;
  kind: string;
  input: Record<string, unknown>;
  result?: any;
  error?: string;
  ms?: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);
const pct = (p: number) => `<span class="${p > 0.5 ? "yes" : "no"}">${p > 0.5 ? "yes" : "no"} ${Math.round(p * 100)}%</span>`;

/** Any result, readably: decisions as choices with odds, drafts as text, sprites drawn. */
function show(v: unknown, key = "", depth = 0): string {
  if (v === null || v === undefined) return `<span class="dim">—</span>`;
  if (typeof v === "number") return key === "checks" ? pct(v) : String(v);
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") return v.length > 50 || v.includes("\n") ? `<div class="txt">${esc(v)}</div>` : esc(v);
  if (Array.isArray(v)) {
    if (!v.length) return `<span class="dim">${key === "problems" ? "✓ none" : "none"}</span>`;
    return `<ol>${v.map((x) => `<li>${show(x, key, depth + 1)}</li>`).join("")}</ol>`;
  }
  const o = v as Record<string, any>;
  if (Array.isArray(o.rows) && o.palette && typeof o.palette === "object") return sprite(o.rows, o.palette);
  if (o.type === "boolean" && typeof o.probability === "number") return pct(o.probability);
  if (o.type === "choice" && typeof o.choice === "string") {
    const odds = Object.entries((o.probabilities ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return `<b>${esc(o.choice)}</b>${odds.map(([c, p]) => `<span class="odds"><i style="width:${p * 60}px"></i>${esc(c)} ${Math.round(p * 100)}%</span>`).join("")}`;
  }
  const rows = Object.entries(o).map(([k, x]) => `<div class="kv"><span class="k">${esc(k)}</span> ${show(x, k === "checks" ? k : key === "checks" ? "" : k, depth + 1)}</div>`).join("");
  return depth >= 2 ? `<details><summary>${Object.keys(o).length} fields</summary>${rows}</details>` : rows;
}

function sprite(rows: string[], palette: Record<string, string>) {
  const c = document.createElement("canvas");
  c.width = Math.max(...rows.map((r) => r.length));
  c.height = rows.length;
  const g = c.getContext("2d")!;
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === "." || !palette[ch]) return;
    g.fillStyle = palette[ch];
    g.fillRect(x, y, 1, 1);
  }));
  return `<img class="sprite" src="${c.toDataURL()}" width="${c.width * 6}" height="${c.height * 6}">`;
}

let panel: HTMLElement | null = null;

/** Open the back office, or close it if it's open. */
export function backoffice(hooks: DevHooks) {
  if (!panel) panel = mount(hooks);
  panel.hidden = !panel.hidden;
  const id = panel.querySelector<HTMLInputElement>("[name=id]")!;
  const sel = hooks.selected();
  if (!panel.hidden && sel !== null && !id.value) id.value = String(sel);
}

function mount(hooks: DevHooks): HTMLElement {
  const style = document.createElement("style");
  style.textContent = `
    #dev { position: fixed; top: 8px; right: 8px; bottom: 8px; width: min(460px, 96vw); overflow-y: auto; z-index: 50; font-size: 12px; }
    #dev h2 { margin: 10px 0 4px; }
    #dev label { display: inline-flex; gap: 4px; align-items: center; margin-right: 8px; }
    #dev input, #dev select { font: inherit; border: 2px solid #402e3a; background: #fbf4dc; padding: 1px 4px; }
    #dev input[type=number] { width: 70px; }
    #dev button { margin: 4px 4px 0 0; padding: 2px 8px; }
    #dev .live button { background: #f6c3b4; }
    #dev .run { border-top: 2px dashed #c9b88f; margin-top: 8px; padding-top: 6px; }
    #dev .run > .meta { display: flex; gap: 8px; align-items: baseline; }
    #dev .run > .meta button { margin: 0; padding: 0 6px; box-shadow: none; }
    #dev .kv { margin: 2px 0 2px 8px; }
    #dev .k { color: #7a6a8a; }
    #dev .txt { white-space: pre-wrap; background: #fbf4dc; border: 1px dashed #c9b88f; padding: 2px 6px; max-height: 160px; overflow-y: auto; }
    #dev ol { margin: 2px 0; padding-left: 20px; }
    #dev .yes { color: #b5404f; font-weight: bold; } #dev .no { color: #3d7a3a; }
    #dev .odds { display: block; margin-left: 8px; color: #7a6a8a; }
    #dev .odds i { display: inline-block; height: 6px; background: #b07a1e; margin-right: 4px; }
    #dev .dim { color: #b8a8c0; }
    #dev .sprite { image-rendering: pixelated; background: #8ec572; padding: 6px; }
`;
  document.head.append(style);

  const panel = document.createElement("div");
  panel.id = "dev";
  panel.className = "paper";
  panel.hidden = true;
  panel.innerHTML = `<button class="close" aria-label="Close">×</button>
    <h2>Back office</h2>
    <label>Filing <input type="number" name="id" placeholder="9999"></label><button data-do="filing">Look up</button>
    <textarea name="intent" rows="2" maxlength="120" placeholder="an intent, or the name of a thing to draw"></textarea>
    <h2>Dry run <span class="meta">nothing is written; current prompts</span></h2>
    <button data-do="rule">Rule</button><button data-do="committee">Committee</button><button data-do="draw">Draw</button><br>
    <label><select name="stock">${STOCK.map((c) => `<option>${c}</option>`).join("")}</select></label>
    <label><input type="checkbox" name="writeIn"> write-in</label><button data-do="condition">Write condition</button><br>
    <label><input name="condition" placeholder="condition (else the filing's)"></label><button data-do="inspect">Inspect</button><button data-do="audit">Audit</button>
    <h2>The live in-tray <span class="meta">writes to the shared commons</span></h2>
    <div class="live"><button data-desk="id">Rule now</button><button data-desk="committee">Convene now</button><button data-desk="inspect">Inspect now</button><button data-desk="audit">Audit now</button></div>
    <h2>Only here <span class="meta">gone on reload</span></h2>
    <label><select name="status">${STATUSES.map((s) => `<option>${s}</option>`).join("")}</select></label><button data-do="fake">A letter arrives</button>
    <button data-do="papers">Form R-1</button><button data-do="speak">Gary speaks</button>
    <h2>Runs <button data-do="clear">clear</button></h2>
    <div class="runs"></div>`;
  document.body.append(panel);

  const field = <T extends HTMLElement = HTMLInputElement>(name: string) => panel.querySelector<T>(`[name=${name}]`)!;
  const id = () => (field("id").value ? Number(field("id").value) : null);
  const intent = () => field<HTMLTextAreaElement>("intent").value.trim();

  let runs: Run[] = JSON.parse(localStorage.getItem(KEPT) ?? "[]");
  let n = runs.reduce((m, r) => Math.max(m, r.n), 0);
  const keep = () => {
    try {
      localStorage.setItem(KEPT, JSON.stringify(runs.slice(0, 12)));
    } catch {
      localStorage.removeItem(KEPT); // draws are big; past the quota, forget rather than hang
    }
  };

  function render() {
    panel.querySelector(".runs")!.innerHTML = runs.map((r) => `<div class="run" data-n="${r.n}">
      <div class="meta"><b>${esc(r.kind)}</b><span>${esc(JSON.stringify(r.input))}</span>
        <span>${r.ms !== undefined ? `${(r.ms / 1000).toFixed(1)}s` : "running…"}</span>
        ${r.result?.verdict || (r.kind === "filing" && r.result) ? `<button data-preview="${r.n}">as a letter</button>` : ""}</div>
      ${r.error ? `<p class="problem">${esc(r.error)}</p>` : r.result !== undefined ? `${show(r.result)}<details><summary>raw</summary><div class="txt">${esc(JSON.stringify(r.result, null, 2))}</div></details>` : ""}
    </div>`).join("");
  }

  async function call(kind: string, path: string, input: Record<string, unknown>) {
    const run: Run = { n: ++n, kind, input };
    runs.unshift(run);
    render();
    try {
      const res = await fetch("/api/backoffice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ what: path, ...input }) });
      const body = await res.json();
      Object.assign(run, body.error ? { error: body.error, ms: body.ms } : { result: body.result, ms: body.ms });
      if (kind === "filing" && run.result) field<HTMLTextAreaElement>("intent").value = run.result.intent;
    } catch (e) {
      run.error = String(e);
    }
    keep();
    render();
  }

  // A ruling sent by post to a plot that isn't really ours: the client's own
  // path for a stamp (arrive), with nothing written anywhere.
  let fakes = 90000;
  async function letter(from: Status, stamped: Partial<Filing>, wanted?: number | null) {
    const plot = hooks.freePlot();
    if (!plot) return hooks.speak("No free plot to send it to.");
    const fid = wanted && !hooks.filings.has(wanted) ? wanted : ++fakes;
    const now = new Date().toISOString();
    const base: Filing = {
      id: fid, filer: hooks.me, plot_x: plot.x, plot_y: plot.y, intent: intent() || "a bench, for looking at the pond with",
      status: from, condition: null, wants: null, bylaw: null, permit: null, minutes: null, filed_at: now, stamped_at: null,
      built_at: null, inspected_at: null, remark: null, met_at: null, ground: null,
    };
    await hooks.arrive(base);
    await hooks.arrive({ ...base, stamped_at: now, ...stamped, id: fid, filer: hooks.me, plot_x: plot.x, plot_y: plot.y });
  }

  function preview(r: Run) {
    const res = r.result;
    if (r.kind === "filing") return letter(res.minutes ? "committee" : "pending", res);
    const stamped = {
      intent: String(r.input.intent), status: res.verdict.status, bylaw: res.verdict.bylaw,
      condition: res.written?.condition ?? null, wants: res.written?.wants ?? null,
    };
    if (r.kind === "committee") return letter("committee", { ...stamped, permit: res.minutes.outcome, minutes: res.minutes });
    return letter("pending", { ...stamped, permit: res.permit }, r.input.id as number);
  }

  const DO: Record<string, () => unknown> = {
    filing: () => id() && call("filing", "filing", { id: id() }),
    rule: () => call("rule", "rule", { id: id() ?? 9999, intent: intent() }),
    committee: () => call("committee", "committee", { id: id() ?? 9999, intent: intent() }),
    draw: () => call("draw", "draw", { label: intent() }),
    condition: () => call("condition", "condition", {
      id: id() ?? 9999, intent: intent(), stock: field<HTMLSelectElement>("stock").value, writeIn: field("writeIn").checked,
    }),
    inspect: () => id() && call("inspect", "inspect", { id: id(), condition: field("condition").value.trim() || undefined }),
    audit: () => id() && call("audit", "audit", { id: id() }),
    fake: () => {
      const status = field<HTMLSelectElement>("status").value as Status;
      return letter("pending", { status, permit: `A ${status} letter, from the back office.`, bylaw: status === "denied" ? 1 : null });
    },
    papers: hooks.papers,
    speak: () => hooks.speak(),
    clear: () => {
      runs = [];
      keep();
      render();
    },
  };

  panel.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    if (b.classList.contains("close")) panel.hidden = true;
    else if (b.dataset.do) void DO[b.dataset.do]();
    else if (b.dataset.preview) void preview(runs.find((r) => r.n === Number(b.dataset.preview))!);
    else if (b.dataset.desk && id() && confirm(`${b.textContent}: Filing ${id()}, on the live commons?`)) {
      void call(`desk ${b.dataset.desk}`, "desk", { [b.dataset.desk]: id() });
    }
  });

  render();
  return panel;
}
