// The committee chamber with no network, on sittings kept from real runs
// (dev/sittings.json). ?n=0.. picks one and plays it at once; ?pace= sets
// characters a second.

import { chamber, type Sitting } from "../src/chamber.ts";
import sittings from "./sittings.json";

const all = sittings as unknown as (Omit<Sitting, "condition"> & { condition?: string })[];
const q = new URLSearchParams(location.search);
const play = (i: number) => {
  const { condition, ...s } = all[i];
  return chamber({ ...s, condition: () => condition });
};

document.getElementById("out")!.innerHTML = all.map((s, i) =>
  `<a href="?n=${i}${q.get("pace") ? `&pace=${q.get("pace")}` : ""}">${i}. ${s.intent}${s.plea ? " (on appeal)" : ""}</a>`).join("");
if (q.get("n")) void play(Number(q.get("n")));
