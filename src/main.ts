// Placeholder until the first slice in PLAN.md lands.

const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const ctx = canvas.getContext("2d")!;
canvas.width = innerWidth;
canvas.height = innerHeight;
ctx.fillStyle = "#9bc47a";
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = "#402e3a";
ctx.font = "16px monospace";
ctx.fillText("The Commons ... Under review", 16, 32);
