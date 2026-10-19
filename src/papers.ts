// Your papers: Form R-1, the application for residency. Filled in on the way
// in, and amended whenever you like from the tag. Section A is how you look
// (one of the Meadow's creatures, or a person made up from parts), B is the
// name on file, C is keeping it all with a Google account.

import { CREATURES } from "./content/canon/creatures.ts";
import {
  EXTRAS, HAIR_COLOURS, HAIRS, OUTFIT_COLOURS, OUTFITS, SKINS, randomHuman, type HumanSpec,
} from "./content/people.ts";
import { blit, looksLike, portrait, spriteOf, stranger, widthOf, type Avatar } from "./avatar.ts";
import { GARY_SPRITE } from "./life.ts";

export interface Papers {
  me: string;
  name: string;
  avatar: Avatar | null; // null on a first visit
  pencilled: boolean; // anonymous: kept in this browser only
  save: (name: string, avatar: Avatar) => Promise<string | null>;
  keep: () => Promise<string | null>; // off to Google
  signOut: () => void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);

const GOOGLE = `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

/** A sprite drawn small and crisp onto a fresh canvas, for a card or a chip. */
function mini(a: Avatar | null, scale: number, w: number, h: number, sprite = a && spriteOf(a)) {
  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  if (sprite) {
    const ctx = c.getContext("2d")!;
    blit(ctx, sprite, Math.floor((w - widthOf(sprite)) / 2) * scale, (h - sprite.rows.length) * scale, false, scale);
  }
  return c;
}

let stop: (() => void) | null = null;

export function openPapers(p: Papers) {
  stop?.();
  const root = document.getElementById("papers")!;
  const first = !p.avatar;
  let kind: "meadow" | "human" = p.avatar && "meadow" in p.avatar ? "meadow" : "human";
  let form = p.avatar && "meadow" in p.avatar ? p.avatar.meadow : Object.keys(CREATURES)[0];
  let human: HumanSpec = p.avatar && "human" in p.avatar ? p.avatar.human : (stranger(p.me) as { human: HumanSpec }).human;
  let name = /^player-[0-9a-f]{8}$/.test(p.name) ? "" : p.name;
  let busy = false;

  const chosen = (): Avatar => (kind === "meadow" ? { meadow: form } : { human });
  
  root.innerHTML = `
    <form class="papers" novalidate>
      <header>
        <p class="form-no"><span>Form R-1</span><span>${first ? "Application for residency" : "Amendment to particulars"}</span></p>
        <h1>The Commons</h1>
        <p class="meta">${first
          ? "Welcome. Before you go in, Gary needs a few particulars. There are three sections. He has numbered them."
          : "Amend whatever you like. Gary will initial it."}</p>
        ${first ? "" : `<button type="button" class="close" aria-label="Close">×</button>`}
      </header>

      <section>
        <h2><span class="sec">A</span>Particulars of appearance</h2>
        <div class="kinds" role="tablist">
          <button type="button" role="tab" data-kind="meadow">From the Meadow</button>
          <button type="button" role="tab" data-kind="human">A person</button>
        </div>
        <div class="meadow"></div>
        <div class="maker">
          <div class="stage"><canvas width="160" height="152"></canvas><button type="button" class="shuffle">Shuffle</button></div>
          <div class="parts"></div>
        </div>
      </section>

      <section>
        <h2><span class="sec">B</span>Name on file</h2>
        <input name="name" maxlength="24" autocomplete="nickname" placeholder="As you'd like it on your permits" value="${esc(name)}">
        <p class="hint egg" hidden>The Meadow has its own arrangements for Connors. Gary is not in a position to discuss them.</p>
      </section>

      <section>
        <h2><span class="sec">C</span>Keeping your papers</h2>
        ${p.pencilled
          ? `<p>Your papers are <b>pencilled in</b>: they live in this browser and nowhere else. Sign them with Google and they'll keep — the same plots, the same name, on any device. Already a resident elsewhere? The same button finds you.</p>`
          : `<p class="kept"><span class="stamp approved">Kept on file</span> Signed with Google. You can come back from anywhere. <button type="button" class="link signout">Sign out</button></p>`}
      </section>

      <footer>
        <p class="problem" role="alert"></p>
        <div class="actions">
          ${first ? "" : `<button type="button" class="cancel">Cancel</button>`}
          ${p.pencilled ? `<button type="button" class="google">${GOOGLE}<span>${first ? "Submit and sign with Google" : "Sign with Google"}</span></button>` : ""}
          <button class="submit">${first ? "Submit application" : "File amendment"}</button>
        </div>
      </footer>
      <div class="approved-stamp" hidden><span class="stamp approved thunk">${first ? "Approved" : "Amended"}</span></div>
    </form>`;
  root.hidden = false;
  const $ = <T extends HTMLElement = HTMLElement>(q: string) => root.querySelector<T>(q)!;

  // --- A: the Meadow's creatures, and Gary's post, which is filled.
  const meadow = $(".meadow");
  for (const [id, c] of Object.entries(CREATURES)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "creature";
    b.dataset.form = id;
    b.append(mini({ meadow: id }, 4, 16, 16));
    b.insertAdjacentHTML("beforeend", `<b>${esc(c.name)}</b><small>${esc(c.blurb)}</small>`);
    b.addEventListener("click", () => {
      form = id;
      refresh();
    });
    meadow.append(b);
  }
  const gary = document.createElement("div");
  gary.className = "creature filled";
  gary.append(mini(null, 4, 16, 16, GARY_SPRITE));
  gary.insertAdjacentHTML("beforeend", `<b>Tired Office Creature</b><small>Position filled.</small>`);
  meadow.append(gary);

  // --- A: a person, part by part. Style chips show the person wearing that part.
  const ROWS: { key: keyof HumanSpec; label: string; options: { id: string; label?: string; colour?: string }[] }[] = [
    { key: "skin", label: "Skin", options: SKINS },
    { key: "hair", label: "Hair", options: HAIRS },
    { key: "hairColour", label: "Hair colour", options: HAIR_COLOURS },
    { key: "outfit", label: "Outfit", options: OUTFITS },
    { key: "outfitColour", label: "Outfit colour", options: OUTFIT_COLOURS },
    { key: "extra", label: "Finishing touch", options: EXTRAS },
  ];
  function renderParts() {
    $(".parts").innerHTML = "";
    for (const row of ROWS) {
      const line = document.createElement("div");
      line.className = "part";
      line.innerHTML = `<h3>${row.label}</h3><div class="chips" role="radiogroup" aria-label="${row.label}"></div>`;
      const chips = line.querySelector(".chips")!;
      for (const o of row.options) {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(human[row.key] === o.id));
        b.title = o.label ?? o.id;
        if (o.colour) {
          b.className = "chip swatch-chip";
          b.style.setProperty("--c", o.colour);
        } else {
          b.className = "chip style-chip";
          b.append(mini({ human: { ...human, [row.key]: o.id } }, 2, 12, 16));
        }
        b.addEventListener("click", () => {
          human = { ...human, [row.key]: o.id };
          renderParts();
          refresh();
        });
        chips.append(b);
      }
      $(".parts").append(line);
    }
  }
  $(".shuffle").addEventListener("click", () => {
    human = randomHuman();
    renderParts();
    refresh();
  });

  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-kind]")) {
    b.addEventListener("click", () => {
      kind = b.dataset.kind as typeof kind;
      refresh();
    });
  }

  function refresh() {
    for (const b of root.querySelectorAll<HTMLButtonElement>("[data-kind]")) b.setAttribute("aria-selected", String(b.dataset.kind === kind));
    for (const b of root.querySelectorAll<HTMLButtonElement>(".creature[data-form]")) b.classList.toggle("on", b.dataset.form === form);
    meadow.hidden = kind !== "meadow";
    $(".maker").hidden = kind !== "human";
    $(".egg").hidden = name.trim().toLowerCase() !== "connor";
  }

  // The person on the stage walks on the spot and turns now and then; a
  // Connor's mole stands in for whoever they picked.
  const stage = $<HTMLCanvasElement>(".stage canvas");
  let raf = 0;
  const tick = (now: number) => {
    if (kind === "human") portrait(stage, looksLike(name, { human }, p.me), 8, (Math.floor(now / 320) % 2) as 0 | 1, Math.floor(now / 2600) % 2 === 1);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const input = $<HTMLInputElement>("input[name=name]");
  input.addEventListener("input", () => {
    name = input.value;
    refresh();
  });

  const problem = (text: string) => ($(".problem").textContent = text);
  async function submit(): Promise<boolean> {
    const n = name.trim();
    if (!n) {
      problem("Section B is blank. Gary cannot file a blank.");
      input.focus();
      return false;
    }
    busy = true;
    root.querySelectorAll("button").forEach((b) => (b.disabled = true));
    const err = await p.save(n, chosen());
    busy = false;
    root.querySelectorAll("button").forEach((b) => (b.disabled = false));
    if (err) problem(err);
    return !err;
  }

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || !(await submit())) return;
    $(".approved-stamp").hidden = false;
    setTimeout(close, 950);
  });
  // Off to Google even if the papers wouldn't file: a resident from elsewhere,
  // retyping their own name, finds it taken by themselves until they're back.
  root.querySelector(".google")?.addEventListener("click", async () => {
    if (busy) return;
    if (name.trim()) await submit();
    const err = await p.keep();
    if (err) problem(`Google would not take the papers: ${err}`);
  });
  root.querySelector(".signout")?.addEventListener("click", p.signOut);
  root.querySelector(".cancel")?.addEventListener("click", close);
  root.querySelector(".close")?.addEventListener("click", close);
  const escape = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !first) close();
  };
  window.addEventListener("keydown", escape);

  function close() {
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", escape);
    root.hidden = true;
    root.innerHTML = "";
    stop = null;
  }
  stop = close;

  renderParts();
  refresh();
  if (first && !matchMedia("(pointer: coarse)").matches) setTimeout(() => input.focus({ preventScroll: true }), 50);
}

export const papersOpen = () => !document.getElementById("papers")!.hidden;
