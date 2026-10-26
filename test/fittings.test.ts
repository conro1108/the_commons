import { test } from "node:test";
import assert from "node:assert/strict";
import { FITTINGS, FLOORS, WALLS, bestFitting } from "../src/content/fittings.ts";
import "../src/content/props.ts"; // throws if a fitting's key is already a prop's

const size = (rows: string[]) => ({ w: rows[0].length, h: rows.length });

test("library art is well formed: keys, sizes, colours, slots inside the piece", () => {
  const keys = [...Object.keys(FITTINGS), ...Object.keys(FLOORS), ...Object.keys(WALLS)];
  assert.equal(new Set(keys).size, keys.length, "keys are unique across fittings, floors and walls");
  for (const [key, f] of [...Object.entries(FITTINGS), ...Object.entries(FLOORS), ...Object.entries(WALLS)]) {
    assert.match(key, /^[a-z_]{1,24}$/);
    const all = [...f.rows, ...("skirt" in f && f.skirt ? f.skirt : [])];
    for (const [y, r] of all.entries()) {
      assert.equal(r.length, all[0].length, `${key} row ${y} is ${r.length} wide, not ${all[0].length}`);
      for (const ch of r) assert.ok(ch === "." || f.palette[ch], `${key} row ${y} has '${ch}', which has no colour`);
    }
  }
  for (const [key, f] of Object.entries(FITTINGS)) {
    const { w, h } = size(f.rows);
    if (!f.held) assert.equal(w, f.w * 4, `${key} is ${w} px wide, not ${f.w} cells`);
    assert.ok(f.on === "wall" ? f.d === 0 : h >= f.d * 4, `${key} is as deep as it stands`);
    for (const s of f.slots ?? []) // hung things may dangle below; stood things may stick up above
      assert.ok(s.x >= 0 && s.x + s.w <= w && s.w > 0 && s.h > 0 && (s.hang ? s.y >= 0 && s.y < h : s.y + s.h <= h), `${key}'s slot at ${s.x},${s.y} is on it`);
    if (f.stock) {
      const st = FITTINGS[f.stock];
      assert.ok(st?.held, `${key} is stocked with a held thing`);
      const fits = (f.slots ?? []).filter((s) => !!s.hang === (st.held === "hang") && s.w >= size(st.rows).w && s.h >= size(st.rows).h);
      assert.ok(fits.length, `${key}'s stock fits a slot`);
    }
  }
});

test("schedule lines find their pieces, and nonsense finds none close", () => {
  const near = (s: string) => { const b = bestFitting(s); return b && b.score >= 0.6 ? b.key : null; };
  assert.equal(near("a punching bag"), "punching_bag");
  assert.equal(near("mats"), "tatami");
  assert.equal(near("a rack of practice swords"), "sword_rack");
  assert.equal(near("a board of belts"), "peg_board");
  assert.equal(near("a shoe rack by the door"), "shoe_rack");
  assert.equal(near("a vending machine"), "vending_machine");
  assert.equal(near("bookshelves"), "bookcase");
  assert.equal(near("a sauna"), null);
});
