// The letter's paper with no network: every state a tag can be in, as the
// holder and as a passer-by, and the pound. ?here=1 has Gary at the gate
// rather than a questionnaire on the door. Also fakeTag(), for ?letter=1 on
// dev/map.html and dev/plot.html.

import { letterHtml, poundHtml, type Tag, type TagStatus } from "../src/letter.ts";
import { propCanvas } from "../src/content/props.ts";

const DAY = 864e5;

export function fakeTag(placement: number, filing: number, status: TagStatus, over: Partial<Tag> = {}): Tag {
  const now = Date.now();
  const lines: Partial<Record<TagStatus, Partial<Tag>>> = {
    tagged: { answer: "after training", reply: "That's not part of a karate studio. It's tagged: take it down or file for it by Thursday, or it comes to the pound.", due: new Date(now + 3 * DAY).toISOString() },
    filed: { answer: "after training", reply: "That's not part of a karate studio. It's tagged.", due: new Date(now + 3 * DAY).toISOString() },
    ancillary: { what: "kettle", question: "What's the kettle for?", answer: "for the parents waiting", reply: "Fair enough, they'll want a cup of tea. I'll put it on the schedule.", closed_at: new Date(now).toISOString() },
    lawful: { what: "sundial", question: "Certificate of Lawfulness", reply: "It's been up a week and nobody's said anything, so it's lawful now. It's on the schedule.", closed_at: new Date(now).toISOString() },
    impounded: { answer: "it's nice", reply: "That's not part of a karate studio. It's tagged.", closed_at: new Date(now).toISOString() },
  };
  return {
    id: placement * 10 + filing, filing, placement, what: "hot tub", question: "What's the hot tub for?", asked_at: new Date(now - DAY).toISOString(),
    answer: null, answered_at: null, reply: null, due: null, status, closed_at: null, ...lines[status], ...over,
  };
}

const out = document.getElementById("out");
if (out) {
  const q = new URLSearchParams(location.search);
  const all: Tag[] = [
    fakeTag(1, 1, "asked", { id: 1 }),
    fakeTag(2, 1, "asked", { id: 2, what: "trampoline", question: "And the trampoline? What's that for?", answer: "warming up", answered_at: new Date().toISOString() }),
    fakeTag(3, 1, "tagged", { id: 3 }),
    fakeTag(4, 1, "filed", { id: 4, what: "sauna", question: "What's the sauna for?" }),
    fakeTag(5, 1, "ancillary", { id: 5 }),
    fakeTag(6, 1, "lawful", { id: 6 }),
    fakeTag(7, 1, "impounded", { id: 7, what: "jukebox", question: "What's the jukebox for?" }),
    // waved through on his round, unasked
    ...["fridge", "stove", "wall shelf"].map((what, i) => fakeTag(8 + i, 1, "ancillary", { id: 8 + i, what, question: "", answer: null, reply: null })),
  ];
  const here = new Set(q.get("here") ? [1] : []);
  const icon = (name: string) => propCanvas(name).toDataURL();
  out.innerHTML = `
    <div class="paper"><h2>The holder's paper</h2>${letterHtml(all, { mine: true, here })}</div>
    <div class="paper"><h2>A passer-by's</h2>${letterHtml(all, { mine: false, here })}</div>
    <div class="paper pound">${poundHtml([
      { id: 1, name: "jukebox", plot: "Plot 12, the Hollow", icon: icon("barn"), since: new Date(Date.now() - 2 * DAY).toISOString() },
      { id: 2, name: "hot tub", plot: "Plot 12, the Hollow", icon: icon("well"), since: new Date().toISOString() },
    ])}</div>
    <div class="paper pound">${poundHtml([])}</div>`;
}
