// A granted permit's schedule and the variations filed against it, as the card
// shows them (slice C). Plain HTML from data, no state, so src/main.ts and
// dev/permit.html draw the same thing. Styles: `.works` in index.html.

import type { Variation } from "./net.ts";
import type { Fitting, How, Schedule } from "./schedule.ts";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);

const HOW: Record<How, string> = { granted: "", variation: "varied", ancillary: "ancillary", lawful: "lawful", historic: "historic" };
const named = (f: Fitting) => `${esc(f.name)}${HOW[f.how] ? ` <i>(${HOW[f.how]})</i>` : ""}`;
const line = (fs: Fitting[]) => fs.map(named).join(" · ");

/** The schedule, set out like the design's: shell, inside, outside, and the condition if given. */
export function scheduleHtml(s: Schedule, condition: string | null = null): string {
  const inside = s.fittings.filter((f) => f.where === "in");
  const outside = s.fittings.filter((f) => f.where === "out");
  const building = s.shell.kind === "building";
  const out = [line(outside), building ? "a sign" : ""].filter(Boolean).join(" · ");
  return `<div class="works"><h3>Schedule</h3><dl>
      <dt>Shell</dt><dd>${esc(s.shell.words)}</dd>
      ${building || inside.length ? `<dt>Inside</dt><dd>${line(inside) || "nothing yet"}</dd>` : ""}
      <dt>Outside</dt><dd>${out || "nothing yet"}</dd>
      ${s.stored?.length ? `<dt>Stored</dt><dd>${line(s.stored)}</dd>` : ""}
      ${condition ? `<dt>Condition</dt><dd>${esc(condition)}</dd>` : ""}
    </dl></div>`;
}

const STAMP: Record<Variation["status"], [string, string]> = {
  pending: ["pending", "In Gary's in-tray"],
  granted: ["approved", "Granted"],
  committee: ["pending", "Before the committee tonight"],
  denied: ["denied", "Denied"],
  refused: ["denied", "Denied"],
};

/** One variation: what was asked, the stamp, and what Gary (or the committee) said. */
export function variationHtml(v: Variation): string {
  const title = v.kind === "use" ? "Change of use" : v.retrospective ? "Retrospective permission" : "Variation";
  const [cls, stamp] = STAMP[v.status];
  return `<div class="condition"><p><b>${title}.</b> <q>${esc(v.what)}</q></p>
      <p class="stamp ${cls}">${stamp}</p>
      ${v.reply ? `<p class="permit">${esc(v.reply)}</p>` : ""}
      ${v.condition ? `<p><b>Condition.</b> ${esc(v.condition)}</p>` : ""}
      ${v.minutes ? `<p class="meta"><b>Minutes of the committee.</b> ${esc(v.minutes.finding ?? v.minutes.outcome)}</p>` : ""}
    </div>`;
}

/** Room to go back to Gary: something new for the place, or a change of use. */
export function variationForm(building: boolean): string {
  return `<form class="vary"><label class="intent">Going back to Gary
      <textarea rows="2" maxlength="80" placeholder="a vending machine" required></textarea></label>
      <label class="meta"><input type="checkbox" name="use"> It's a change of use</label>
      ${building ? `<select name="room" class="meta"><option value="">wherever suits</option><option value="in">inside</option><option value="out">outside</option></select>` : ""}
      <button>File a variation</button><p class="problem"></p></form>`;
}
