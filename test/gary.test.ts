import { test } from "node:test";
import assert from "node:assert/strict";
import { verdictOf } from "../api/gary.ts";

test("unacceptable filings are lost, whatever the ruling", () => {
  assert.deepEqual(
    verdictOf({ unacceptable: 0.9, ruling: "approved", condition: "flag", bylaw: "none" }),
    { status: "lost", condition: null, bylaw: null },
  );
});

test("conditions only on conditional; denials cite a bylaw or go to committee", () => {
  const base = { unacceptable: 0.1, condition: "flag" as const };
  assert.deepEqual(verdictOf({ ...base, ruling: "approved", bylaw: "b2" }), { status: "approved", condition: null, bylaw: null });
  assert.deepEqual(verdictOf({ ...base, ruling: "conditional", bylaw: "none" }), { status: "conditional", condition: "flag", bylaw: null });
  assert.deepEqual(verdictOf({ ...base, ruling: "denied", bylaw: "b2" }), { status: "denied", condition: null, bylaw: 2 });
  assert.deepEqual(verdictOf({ ...base, ruling: "denied", bylaw: "none" }), { status: "committee", condition: null, bylaw: null });
});
