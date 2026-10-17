import { test } from "node:test";
import assert from "node:assert/strict";
import { problemsWith, verdictOf } from "../api/gary.ts";

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
