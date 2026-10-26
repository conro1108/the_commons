// Permit cards with schedules and variations, made up, side by side (slice C). No network.
// ?use=dojo|sanctuary|bench|tearoom for one card; ?mine=1 to show the variation form.

import { changeUse, vary, type Fitting, type Schedule } from "../src/schedule.ts";
import { scheduleHtml, variationForm, variationHtml } from "../src/permit.ts";
import type { Variation } from "../src/net.ts";

// The game's own styles, so the cards look as they do on the map.
const page = await (await fetch("/index.html")).text();
document.head.insertAdjacentHTML("beforeend", page.match(/<style>[\s\S]*?<\/style>/)![0]);
document.head.insertAdjacentHTML("beforeend", `<style>
  body { overflow: auto; height: auto; padding: 16px; }
  #cards { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
  #cards .paper { position: static; width: 300px; padding: 8px 12px; }
</style>`);

const at = "2026-10-25T12:00:00Z";
const fit = (name: string, key: string, where: "in" | "out", how: Fitting["how"] = "granted"): Fitting => ({ name, key, where, how, at });

const dojo: Schedule = {
  shell: { kind: "building", words: "a hall, timber, one room", material: "timber" },
  fittings: [fit("mats", "mat", "in"), fit("a rack of practice swords", "rack", "in"), fit("a board of belts", "board", "in"),
    fit("a punching bag", "bag", "in"), fit("a shoe rack", "item", "out")],
  use: "a karate studio",
};
const v = (o: Partial<Variation>): Variation => ({
  id: 1, filing: 112, kind: "addition", what: "a vending machine", room: "in", retrospective: false, status: "granted", scale: "small",
  condition: null, reply: null, minutes: null, filed_at: at, heard_at: at, ...o,
});

const CARDS: Record<string, { intent: string; permit: string; schedule: Schedule; condition?: string; variations: Variation[] }> = {
  dojo: {
    intent: "a karate studio",
    permit: "Approved. Keep the shouting down after dark and we'll get on fine.",
    schedule: vary(dojo, { kind: "fitting", name: "a vending machine", key: "item", where: "in" }, at),
    condition: "Must be quiet after dark.",
    variations: [
      v({ reply: "Granted. I suppose people get thirsty after all that kicking. It's on your schedule." }),
      v({ id: 2, what: "and a sauna", status: "committee", scale: "material", heard_at: null,
        reply: "A sauna's a bigger thing than I'll stamp myself. It goes to the committee tonight." }),
    ],
  },
  tearoom: {
    intent: "a tea room",
    permit: "Approved. A change I can understand: the scones were always the draw.",
    schedule: changeUse(dojo, {
      shell: dojo.shell, use: "a tea room",
      fittings: [fit("tables", "table", "in"), fit("a counter", "counter", "in"), fit("a cake stand", "item", "in"), fit("a bench", "bench", "out")],
    }, ["store", "store", "historic", "historic", "keep"]),
    variations: [v({ kind: "use", what: "a tea room", scale: "material", reply: "Approved. A change I can understand: the scones were always the draw." })],
  },
  sanctuary: {
    intent: "a goose sanctuary",
    permit: "Approved. I don't know how you get geese to stay anywhere, but I hope it works.",
    schedule: {
      shell: { kind: "enclosure", words: "a pen, wire mesh", material: "wire" },
      fittings: [fit("a goose house", "item", "out"), fit("a pond", "pond", "out"), fit("geese", "goose", "out"), fit("a hay bale", "hay", "out")],
      use: "a goose sanctuary",
    },
    variations: [v({ what: "a hot tub", room: null, status: "denied", scale: null, retrospective: true,
      reply: "Denied: a hot tub isn't part of a goose sanctuary, whatever the geese think. If that's where it's going, it wants a change of use." })],
  },
  bench: {
    intent: "a bench, for looking at the pond with",
    permit: "Approved. That's a good one, and nice to get something simple for a change.",
    schedule: {
      shell: { kind: "none", words: "none", material: null },
      fittings: [fit("a bench", "bench", "out"), fit("a tree for shade", "tree", "out")],
      use: "a bench, for looking at the pond with",
    },
    variations: [],
  },
};

const q = new URLSearchParams(location.search);
const mine = !!q.get("mine");
const pick = q.get("use");
document.getElementById("cards")!.innerHTML = Object.entries(CARDS)
  .filter(([k]) => !pick || k === pick)
  .map(([, c], i) => `<div class="paper">
      <h2>Plot ${12 + i}, somewhere</h2>
      <p>Held by you: <q>${c.intent}</q></p>
      <p class="stamp approved">Approved</p>
      <p class="permit">${c.permit}</p>
      ${scheduleHtml(c.schedule)}
      ${c.condition ? `<div class="condition"><p><b>Condition.</b> ${c.condition}</p></div>` : ""}
      ${c.variations.map(variationHtml).join("")}
      ${mine ? variationForm(c.schedule.shell.kind !== "none") : ""}
      <p class="meta">Filing 0112</p>
    </div>`)
  .join("");
