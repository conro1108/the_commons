import { test } from "node:test";
import assert from "node:assert/strict";
import { changeUse, scheduled, vary, type Schedule } from "../src/schedule.ts";
import { variationOf } from "../api/gary.ts";

const at = "2026-10-25T12:00:00Z";
const dojo: Schedule = {
  shell: { kind: "building", words: "a hall, timber, one room", material: "timber" },
  fittings: [
    { name: "mats", key: "mat", where: "in", how: "granted", at },
    { name: "a punching bag", key: "bag", where: "in", how: "granted", at },
    { name: "a shoe rack", key: "item", where: "out", how: "granted", at },
  ],
  use: "a karate studio",
};

test("a granted variation joins the schedule once, and a written-in item of its name is then on it", () => {
  const v = vary(dojo, { kind: "fitting", name: "a vending machine", key: "item", where: "in" }, at);
  assert.equal(v.fittings.at(-1)?.how, "variation");
  assert.ok(scheduled(v, { prop: "item", label: "Vending machine", room: "in" }));
  assert.ok(!scheduled(dojo, { prop: "item", label: "vending machine", room: "in" }));
  assert.equal(vary(v, { kind: "fitting", name: "vending machine", key: "item", where: "in" }, at).fittings.length, v.fittings.length);
  assert.equal(vary(dojo, { kind: "room", name: "a sauna" }, at).shell.rooms, 2);
});

test("a change of use keeps the shell, and old fittings stay, turn historic or go to storage", () => {
  const tea: Schedule = { ...dojo, use: "a tea room", fittings: [{ name: "tables", key: "table", where: "in", how: "granted", at }] };
  const s = changeUse(dojo, tea, ["store", "historic", "keep"]);
  assert.equal(s.shell, dojo.shell);
  assert.equal(s.use, "a tea room");
  assert.deepEqual(s.fittings.map((f) => [f.name, f.how]), [["tables", "granted"], ["a punching bag", "historic"], ["a shoe rack", "granted"]]);
  assert.deepEqual(s.stored?.map((f) => f.name), ["mats"]);
  assert.ok(scheduled(s, { prop: "mat", room: "store" }) && !scheduled(s, { prop: "mat", room: "in" }));
});

test("small variations are stamped, material ones go to committee, retrospective ones come with a condition", () => {
  assert.equal(variationOf({ unacceptable: 0, ruling: "belongs", nature: "fitting" }, false).status, "granted");
  assert.equal(variationOf({ unacceptable: 0, ruling: "belongs", nature: "room" }, false).status, "committee");
  assert.equal(variationOf({ unacceptable: 0, ruling: "foreign", nature: "fitting" }, false).status, "denied");
  assert.equal(variationOf({ unacceptable: 0, ruling: "b3", nature: "fitting" }, false).bylaw, 3);
  assert.ok(variationOf({ unacceptable: 0, ruling: "belongs", nature: "fitting", belongs: 0.6 }, true).conditioned);
});
