import { test } from "node:test";
import assert from "node:assert/strict";
import { LANDMARKS, PLOTS, inPlot, plotAt, route } from "../src/world/index.ts";

test("every plot is one piece, nobody else's, with a gate that walks to Gary's hut", () => {
  for (const p of PLOTS) {
    assert.ok(p.area > 80 && p.w <= 44 && p.h <= 32, `plot ${p.id} is a sensible size`);
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) if (inPlot(p, x, y)) assert.equal(plotAt(p.x + x, p.y + y)?.id, p.id);
    for (const f of p.features)
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) assert.ok(inPlot(p, x, y), `plot ${p.id}'s ${f.kind} is on it`);
    const way = route(p.gate, LANDMARKS.office.at);
    assert.ok(way.length > 2, `plot ${p.id}'s gate is on the paths`);
  }
});
