// The spirit's panels in every state, and a boarded-up plot on the map, from
// made-up data. ?plot=N picks the plot drawn. No network.

import { drawBoarded, spiritCardHtml, spiritHtml, styleSpirit, type SpiritView } from "../src/spirit.ts";
import { mini } from "../src/closeup.ts";
import { plotById } from "../src/world/index.ts";
import type { Filing, Notice, Visit } from "../src/net.ts";

const q = new URLSearchParams(location.search);
const plot = plotById(Number(q.get("plot") ?? 12))!;
const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
const base: Filing = {
  id: 112, filer: "holder", plot: plot.id, intent: "a karate studio", status: "approved", condition: null, wants: null, bylaw: null,
  permit: "Approved.", minutes: null, filed_at: ago(40), stamped_at: ago(40), built_at: ago(2), inspected_at: null, remark: null, met_at: null,
  ground: null, schedule: { shell: { kind: "building", words: "a hall, timber, one room", material: "timber" }, fittings: [], use: "a karate studio" }, shell: null,
  reading: "Mostly a karate studio. Some tea.", read_at: ago(1), drift: null, boarded_at: null, quit_by: null,
};
const notices: Notice[] = [
  { id: 1, filing: 112, line: "Beginners' kata, Thursdays at six", posted_at: ago(5), ok: true },
  { id: 2, filing: 112, line: "Teas on Saturdays", posted_at: ago(3), ok: true },
  { id: 3, filing: 112, line: "Sparring, bring your own gloves", posted_at: ago(0), ok: null },
];
const visits: Visit[] = [
  { id: 1, filing: 112, visitor: "marjorie", line: "Lovely scones.", day: ago(1).slice(0, 10), at: ago(1), ok: true },
  { id: 2, filing: 112, visitor: "bob", line: "Got my yellow belt! Also the scones.", day: ago(2).slice(0, 10), at: ago(2), ok: true },
];
const names: Record<string, string> = { holder: "Keiko", marjorie: "Marjorie", bob: "Bob", visitor: "you" };
const who = (id: string) => names[id] ?? "a resident";

const states: [string, SpiritView | { card: Filing; me: string; guest: boolean }][] = [
  ["Up close, yours", { f: base, notices, visits, me: "holder", guest: false, who }],
  ["Up close, visiting: sign the book", { f: base, notices, visits, me: "visitor", guest: false, who }],
  ["Up close, a guest", { f: base, notices, visits, me: "someone", guest: true, who }],
  ["Yours, drifted", { f: { ...base, drift: "a tea room", reading: "A tea room, really." }, notices: [...notices, { id: 4, filing: 112, line: "Teas every day", posted_at: ago(1), ok: true }], visits, me: "holder", guest: false, who }],
  ["Yours, boarded up and asked for", { f: { ...base, boarded_at: ago(3), quit_by: ago(-4), reading: "Boarded up. Nothing on, nobody in, and nothing changed in a month. It's all still there." }, notices: [], visits: [], me: "holder", guest: false, who }],
  ["Yours, nothing up yet", { f: { ...base, reading: null }, notices: [], visits: [], me: "holder", guest: false, who }],
  ["Yours, a change of use later", { f: { ...base, reading: null, schedule: { ...base.schedule!, use: "a tea room" } }, notices: [], visits: [], me: "holder", guest: false, who }],
  ["The card on the map: reading", { card: base, me: "visitor", guest: false }],
  ["The card: boarded, ask for it", { card: { ...base, boarded_at: ago(3) }, me: "visitor", guest: false }],
  ["The card: boarded, asked for", { card: { ...base, boarded_at: ago(3), quit_by: ago(-6) }, me: "visitor", guest: false }],
];

styleSpirit();
const grid = document.getElementById("grid")!;
for (const [label, s] of states) {
  const box = document.createElement("div");
  const html = "card" in s ? spiritCardHtml(s.card, s.me, s.guest) : spiritHtml(s);
  box.innerHTML = `<p class="label">${label}</p><div class="paper"><h2>Plot ${plot.id}</h2><p><q>a karate studio</q></p>${html}</div>`;
  grid.append(box);
}

// The plot on the map, as it is and boarded up.
for (const boarded of [false, true]) {
  const S = 6;
  const cv = document.createElement("canvas");
  cv.width = plot.w * S;
  cv.height = plot.h * S;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(S, 0, 0, S, -plot.x * S, -plot.y * S);
  ctx.fillStyle = "#6f8f4c"; // grass, where the map's baked ground would be
  for (let y = 0; y < plot.h; y++) for (let x = 0; x < plot.w; x++) if (plot.mask[y * plot.w + x] === "#") ctx.fillRect(plot.x + x, plot.y + y, 1, 1);
  ctx.drawImage(mini(plot, base, []), plot.x, plot.y);
  if (boarded) drawBoarded(ctx, plot);
  const box = document.createElement("div");
  box.innerHTML = `<p class="label">On the map${boarded ? ", boarded up" : ""}</p>`;
  box.append(cv);
  grid.append(box);
}
