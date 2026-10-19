// The time of day, by the resident's own clock: a grade over the finished
// frame, so every sprite gets it for free. Warm and low at either end of the
// day, blue at night. ?hour= overrides it, for looking.

const forced = new URLSearchParams(location.search).get("hour");

/** Hours since midnight, fractional. */
export function hourNow(): number {
  if (forced !== null) return Number(forced);
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

// [hour, multiply colour, its strength]
const KEYS: [number, string, number][] = [
  [0, "#3c4a8c", 0.62],
  [4.5, "#3c4a8c", 0.6],
  [6, "#c890a8", 0.38],
  [7.5, "#f0c8a0", 0.16],
  [9, "#ffffff", 0],
  [16.5, "#ffffff", 0],
  [18, "#ffc890", 0.24],
  [19.5, "#c07890", 0.42],
  [21, "#4a4a8c", 0.56],
  [24, "#3c4a8c", 0.62],
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** The grade at an hour: a colour to multiply by, and how strongly. */
export function gradeAt(hour: number): { colour: string; alpha: number } {
  let k = 0;
  while (k < KEYS.length - 2 && KEYS[k + 1][0] <= hour) k++;
  const [h0, c0, a0] = KEYS[k], [h1, c1, a1] = KEYS[k + 1];
  const t = Math.min(1, Math.max(0, (hour - h0) / (h1 - h0)));
  const [r0, g0, b0] = rgb(c0), [r1, g1, b1] = rgb(c1);
  return { colour: `rgb(${lerp(r0, r1, t)} ${lerp(g0, g1, t)} ${lerp(b0, b1, t)})`, alpha: lerp(a0, a1, t) };
}

/** Whether lamps are lit. */
export const dark = (hour: number) => hour < 6.2 || hour > 19.2;

/** Grade a w x h area in the current transform. */
export function grade(ctx: CanvasRenderingContext2D, w: number, h: number, hour = hourNow()) {
  const { colour, alpha } = gradeAt(hour);
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** A pool of lamplight, added after the grade: stepped squares, never a smooth gradient. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, strength = 1) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "#ffb050";
  for (let k = r; k > 0; k -= 2) {
    ctx.globalAlpha = 0.07 * strength;
    ctx.fillRect(Math.round(x - k), Math.round(y - k * 0.7), k * 2, Math.round(k * 1.4));
  }
  ctx.restore();
}
