// Screenshot a page in headless Chrome, as a phone or a desktop, after a few
// taps: for looking at the app while working on it (with `FAKE=1 npm run dev`,
// see dev/fakenet.ts). No dependencies; talks to Chrome over its debugging port.
//
//   node scripts/shot.mjs <url> <out.png> [--phone] [--size 1280x800] [steps…]
//
// Steps run in order: wait:600, click:<css selector>, tap:x,y (css px),
// drag:x1,y1,x2,y2 (shiftdrag: holds shift), eval:<js>. A phone is 390x844 at 3x, touch on; --phone
// --size 844x390 is one held sideways.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, out, ...rest] = process.argv.slice(2);
const phone = rest.includes("--phone");
const sized = rest[rest.indexOf("--size") + 1];
const [w, h] = rest.includes("--size") ? sized.split("x").map(Number) : phone ? [390, 844] : [1280, 800];
const steps = rest.filter((a) => /^(wait|click|tap|drag|shiftdrag|eval):/.test(a));

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "shot-"))}`,
  "--hide-scrollbars", "--no-first-run", `--window-size=${w},${h}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(100);
  target = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).then((ts) => ts.find((t) => t.type === "page")).catch(() => null);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let n = 0;
const waiting = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) waiting.get(m.id)(m.result ?? m);
});
const send = (method, params = {}) => new Promise((r) => { const id = ++n; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: phone ? 3 : 1, mobile: phone });
if (phone) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(1500);

async function press(x, y, to = [x, y], modifiers = 0) {
  if (phone) {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + ((to[0] - x) * i) / 8, y: y + ((to[1] - y) * i) / 8 }] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, modifiers });
    for (let i = 1; i <= 8; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + ((to[0] - x) * i) / 8, y: y + ((to[1] - y) * i) / 8, button: "left", buttons: 1, modifiers });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to[0], y: to[1], button: "left", clickCount: 1, modifiers });
  }
}

for (const step of steps) {
  const [kind, ...arg] = step.split(":");
  const a = arg.join(":");
  if (kind === "wait") await sleep(Number(a));
  if (kind === "eval") await send("Runtime.evaluate", { expression: a, awaitPromise: true });
  if (kind === "tap") await press(...a.split(",").map(Number));
  if (kind === "drag") { const [x1, y1, x2, y2] = a.split(",").map(Number); await press(x1, y1, [x2, y2]); }
  if (kind === "shiftdrag") { const [x1, y1, x2, y2] = a.split(",").map(Number); await press(x1, y1, [x2, y2], 8); }
  if (kind === "click") {
    const { result } = await send("Runtime.evaluate", { expression: `(() => { const el = document.querySelector(${JSON.stringify(a)}); el?.scrollIntoView({ block: "nearest", inline: "center" }); const r = el?.getBoundingClientRect(); return r && [r.x + r.width / 2, r.y + r.height / 2]; })()`, returnByValue: true });
    if (!result.value) console.error(`no ${a}`);
    else await press(...result.value);
  }
  await sleep(100);
}

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
ws.close();
chrome.kill();
