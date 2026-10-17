// What Gary's conditions ask for, and whether the plot as built answers them.
// Keys and wording mirror CONDITIONS in api/gary.ts (server code, so not
// imported here). There's no fail state: an unmet condition is outstanding,
// with no deadline, and Gary is patient about it.

export interface Plotting {
  props: Set<string>; // what's built on the plot
  neighbours: number; // held plots next door
  today: Date;
}

interface Condition {
  text: string;
  wants?: string[]; // props that would answer it, marked in the palette
  check: (p: Plotting) => [met: boolean, note: string];
}

const has = (p: Plotting, names: string[]) => names.some((n) => p.props.has(n));

export const CONDITIONS: Record<string, Condition> = {
  north: {
    text: "Must face north.",
    wants: ["weathervane"],
    check: (p) =>
      has(p, ["weathervane"])
        ? [true, "A weathervane confirms the orientation."]
        : [false, "Gary would be reassured by a weathervane."],
  },
  flag: {
    text: "Must include a small flag.",
    wants: ["flag", "bunting"],
    check: (p) =>
      has(p, ["flag", "bunting"]) ? [true, "A flag is flying."] : [false, "Gary is still looking for the small flag."],
  },
  plaque: {
    text: "Must bear a plaque stating the permit number.",
    wants: ["plaque"],
    check: (p) =>
      has(p, ["plaque"])
        ? [true, "The plaque is up. Gary trusts the number is correct."]
        : [false, "A plaque is outstanding."],
  },
  tuesdays: {
    text: "Must be quiet on Tuesdays.",
    check: (p) =>
      p.today.getDay() === 2 ? [true, "It is Tuesday. Gary is listening."] : [true, "It is not Tuesday. Nothing to report."],
  },
  dignified: {
    text: "Must be given a name, and the name must be dignified.",
    wants: ["signpost", "noticeboard"],
    check: (p) =>
      has(p, ["signpost", "noticeboard"])
        ? [true, "A sign is up. Gary assumes the name is dignified."]
        : [false, "It has no name yet. A sign would do it."],
  },
  neighbour: {
    text: "Must be shown to at least one neighbour.",
    check: (p) =>
      p.neighbours
        ? [true, "It can be seen from next door, which Gary is counting."]
        : [false, "No neighbours yet. Gary will wait."],
  },
  goose: {
    text: "Must be inspected by a goose.",
    wants: ["goose"],
    check: (p) =>
      has(p, ["goose"]) ? [true, "A goose is on site. The inspection is presumed ongoing."] : [false, "Awaiting a goose."],
  },
  smaller: {
    text: "Must be slightly smaller than intended.",
    check: () => [true, "Gary cannot measure intent, and takes your word for it."],
  },
};
