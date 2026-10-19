import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZES, problemsWith, tally, verdictOf } from "../api/gary.ts";
import { PALETTE, footprint } from "../src/content/props.ts";

test("unacceptable filings are refused, whatever the ruling", () => {
  assert.deepEqual(verdictOf({ unacceptable: 0.9, ruling: "approved", condition: "flag" }), {
    status: "refused", condition: null, bylaw: null,
  });
});

test("conditions only on conditional; a denial is always under a bylaw", () => {
  const base = { unacceptable: 0.1, condition: "flag" as const };
  assert.deepEqual(verdictOf({ ...base, ruling: "approved" }), { status: "approved", condition: null, bylaw: null });
  assert.deepEqual(verdictOf({ ...base, ruling: "conditional" }), { status: "conditional", condition: "flag", bylaw: null });
  assert.deepEqual(verdictOf({ ...base, ruling: "b2" }), { status: "denied", condition: null, bylaw: 2 });
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
  assert.equal(tally(["approved", "approved", "conditional", "b2", "b4"], "flag")?.condition, "flag");
});

test("Gary knows every prop on the palette, at the size it's drawn", () => {
  const drawn = Object.fromEntries(PALETTE.flatMap((g) => g.props).map((p) => [p, footprint(p)]));
  assert.deepEqual(SIZES, drawn);
});
