import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SIZES, explainedBy, problemsWith, tally, verdictOf } from "../api/gary.ts";
import { PALETTE, footprint } from "../src/content/props.ts";
import { plotsBlock } from "../scripts/plots-sql.ts";
import world from "../src/world/plots.json" with { type: "json" };

test("unacceptable filings are refused, whatever the ruling", () => {
  assert.deepEqual(verdictOf({ unacceptable: 0.9, ruling: "approved", condition: "flag" }), {
    status: "refused", condition: null, bylaw: null,
  });
});

test("conditions only on conditional; a denial is always under a bylaw or the covenant", () => {
  const base = { unacceptable: 0.1, condition: "flag" as const };
  assert.deepEqual(verdictOf({ ...base, ruling: "approved" }), { status: "approved", condition: null, bylaw: null });
  assert.deepEqual(verdictOf({ ...base, ruling: "conditional" }), { status: "conditional", condition: "flag", bylaw: null });
  assert.deepEqual(verdictOf({ ...base, ruling: "b2" }), { status: "denied", condition: null, bylaw: 2 });
  assert.deepEqual(verdictOf({ ...base, ruling: "covenant" }), { status: "denied", condition: null, bylaw: 0 });
  assert.deepEqual(verdictOf({ ...base, ruling: "committee", particulars: 0.1 }), { status: "denied", condition: null, bylaw: null });
});

test("an approval that doesn't suit its plot comes with a condition, and says why", () => {
  const v = verdictOf({ unacceptable: 0.1, ruling: "approved", condition: "local", fit: "cramped" });
  assert.deepEqual(v, { status: "conditional", condition: "local", bylaw: null, concern: "cramped" });
});

test("a draft goes out only if it has no link and the checker flags nothing", () => {
  assert.equal(problemsWith("Filing 0001 is approved. See www.example.com.", {}).length, 1);
  assert.equal(problemsWith("Filing 0001 is approved.", { misdescribes: 0.2, invents: 0.1 }).length, 0);
  assert.equal(problemsWith("Filing 0001 is approved for a gazebo.", { misdescribes: 0.9 }).length, 1);
});

test("the committee needs a quorum; a majority against denies under the most-cited bylaw; a split carries on condition", () => {
  assert.equal(tally(["approved", "b2", null, null, null], "flag"), null);
  assert.deepEqual(tally(["b3", "b1", "b3", "approved", null], "flag"), { status: "denied", condition: null, bylaw: 3, count: "1 to 3, 1 abstaining" });
  assert.equal(tally(["approved", "approved", "approved", "b2", "conditional"], "flag")?.status, "approved");
  assert.deepEqual(tally(["against", "b7", "against", "approved", "abstain"], "flag"), { status: "denied", condition: null, bylaw: 7, count: "1 to 3, 1 abstaining" });
  assert.deepEqual(tally(["against", "against", "approved", "abstain", null], "flag"), { status: "denied", condition: null, bylaw: null, count: "1 to 2, 2 abstaining" });
  assert.equal(tally(["approved", "approved", "conditional", "b2", "b4"], "flag")?.condition, "flag");
});

test("Gary is generous about what's ancillary, but an unfit answer explains nothing", () => {
  assert.equal(explainedBy({ unfit: 0.1, kind: "separate", odds: { ancillary: 0.2, incidental: 0.2, separate: 0.6 } }), true);
  assert.equal(explainedBy({ unfit: 0.1, kind: "separate", odds: { ancillary: 0.1, incidental: 0.1, separate: 0.8 } }), false);
  assert.equal(explainedBy({ unfit: 0.9, kind: "ancillary", odds: { ancillary: 1 } }), false);
});

test("Gary knows every prop on the palette, at the size it's drawn", () => {
  const drawn = Object.fromEntries(PALETTE.flatMap((g) => g.props).map((p) => [p, footprint(p)]));
  assert.deepEqual(SIZES, drawn);
});

test("the database's plots are the baked ones: rerun `npm run world` if not", () => {
  assert.ok(readFileSync(new URL("../db/logic.sql", import.meta.url), "utf8").includes(plotsBlock(world as never)));
});
