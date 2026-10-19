// Run-length strings: "g12p3w40" — a code char then its run. Decoded by src/world/index.ts.

export function rle(cells: ArrayLike<string>): string {
  let out = "";
  for (let i = 0; i < cells.length; ) {
    let j = i;
    while (j < cells.length && cells[j] === cells[i]) j++;
    out += cells[i] + (j - i);
    i = j;
  }
  return out;
}
