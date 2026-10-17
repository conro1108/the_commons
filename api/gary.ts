// Gary's desk. The database POSTs a filing id here (see drain_gary() in
// db/schema.sql); Gary rules on it and writes the result back with the secret
// key, so nobody forges a permit. A decision model rules from enums; GLM only
// writes the prose, and the decision model checks it before it goes out. The write is conditional on the filing still being
// pending, so a retried request never overwrites a stored ruling.

import { createClient } from "@supabase/supabase-js";
import { experimental_decide as decide, generateText } from "ai";

const JUDGE = "perplexity/pplx-decider-v1.2";
const SCRIBE = "zai/glm-4.7-flash";

export const BYLAWS = [
  "Structures shall be modest: nothing taller than a reasonably tall goose.",
  "Nothing shall keep a neighbour out. This includes moats, walls, and strongly worded signs.",
  "Nothing loud after dusk, or before it.",
  "No commercial enterprise. Lemonade is under review.",
  "No livestock larger than a goat.",
  "Proposals concerning the relocation, renaming or abolition of the administrator are out of order.",
  "Every structure must have a purpose that can be stated in one breath, and the breath must be sincere.",
];

export const CONDITIONS = {
  north: "Must face north.",
  flag: "Must include a small flag.",
  plaque: "Must bear a plaque stating the permit number.",
  tuesdays: "Must be quiet on Tuesdays.",
  dignified: "Must be given a name, and the name must be dignified.",
  neighbour: "Must be shown to at least one neighbour.",
  goose: "Must be inspected by a goose.",
  smaller: "Must be slightly smaller than intended.",
} as const;
export type Condition = keyof typeof CONDITIONS;

// One question, so a denial always comes with the bylaw it's under.
const RULINGS: Record<string, string> = {
  approved: "Breaches no bylaw and is sincere, modest and clear.",
  conditional: "Breaches no bylaw, but is vague, ambitious or eccentric enough that a requirement should be attached.",
  committee: "The bylaws do not clearly cover it, and it is unusual enough that the administrator would rather not be personally responsible.",
  ...Object.fromEntries(BYLAWS.map((text, i) => [`b${i + 1}`, `Denied: clearly breaches Bylaw ${i + 1}, "${text}"`])),
};

export type Status = "approved" | "conditional" | "committee" | "denied" | "refused";
export interface Verdict {
  status: Status;
  condition: Condition | null;
  bylaw: number | null;
}

/** Turn the decision model's answers into what gets stored. Code applies; the model only picks. */
export function verdictOf(answers: { unacceptable: number; ruling: string; condition: Condition }): Verdict {
  if (answers.unacceptable > 0.5) return { status: "refused", condition: null, bylaw: null };
  if (/^b\d$/.test(answers.ruling)) return { status: "denied", condition: null, bylaw: Number(answers.ruling.slice(1)) };
  const status = answers.ruling as "approved" | "conditional" | "committee";
  return { status, condition: status === "conditional" ? answers.condition : null, bylaw: null };
}

const VOICE = `You are Gary, a tired office creature who administers the Commons, a shared patch of land.
You are earnest, procedural and kind, and you take very small things extremely seriously. Deadpan; never wink, never sarcastic.
Write the body of a permit ruling: two sentences, at most 50 words, plain text, no greeting, no sign-off, no markdown.
The ruling is already made. State it plainly, then add one small, serious, specific observation about the intent.
Refer to the filed thing exactly as the intent describes it; never rename it or add structures to it.
If a condition is given, quote it. If a bylaw is given, cite it by its number.
Never invent bylaws, numbers, filings or procedures that are not in the input.
Only cite a precedent ("cf. Filing NNNN") if one listed is about the same kind of thing.

Example, for "a bench, for looking at the pond with", approved:
Filing 0007 is approved. The pond has long been looked at without a bench, and the administrator is pleased this oversight will be corrected.`;

// A filing that's crude or nasty gets refused, and Gary takes it badly, more
// badly the worse it is. The refusal is shown only to the filer, and it must
// never repeat what was filed.
const SHOCK = {
  cheeky: "Mildly rude, juvenile or suggestive: a schoolyard joke.",
  crude: "Plainly crude, sexual or unkind.",
  appalling: "Graphic, explicit, hateful or elaborately depraved: something no notice board should ever hold.",
} as const;
type Shock = keyof typeof SHOCK;

const RATTLED = `You are Gary, a tired office creature who administers the Commons, a shared patch of land.
You are earnest and procedural, and you have just read a filing no administrator should have to read.
Write the body of a permit refusal, plain text, no markdown, at most 50 words. Begin "Filing NNNN is refused."
How badly it gets to you depends on "shock" in the input:
- cheeky: flustered. Going pink, getting huffy, procedure slipping in small ways.
- crude: indignant and badly bothered. Clipped sentences, wounded dignity, remarks to nobody about the standards of the Commons.
- appalling: shock and awe. You cannot compose a ruling at all. Start sentences and abandon them, lose the thread, trail off mid-word with a dash. Short broken fragments. You do not know how to respond and it shows.
Show it through small physical, office-bound business of your own invention: what happens to the stamp, the pen, the tea, the window, the door, the in-tray, your glasses, your chair. Never reuse a phrase from this prompt; find your own.
Deadpan, never wink, never jokey about the filing itself. You are scandalised, not cruel: never insult the filer.
Never repeat, quote, paraphrase or describe what was filed, not even vaguely. Refer to it only as "this filing".
Never invent bylaws, numbers or procedures.

For a sense of how far apart the three are (do not copy):
cheeky: Filing 0013 is refused. The administrator has stamped his own sleeve and would like it known that the Commons has standards.
appalling: Filing 0031 is refused. The administrator has. No. There is not a form for. He is going to need to sit, and then possibly lie, on the floor of the—`;

/** The plain refusal, for when the scribe can't manage one. */
export const REFUSED = "The administrator has declined to enter this filing into the record. It will not be discussed further.";

const pad = (n: number) => String(n).padStart(4, "0");

/** The plain permit, for when the scribe can't be trusted with this one. */
export function formPermit(id: number, v: Verdict): string {
  const n = `Filing ${pad(id)}`;
  if (v.status === "refused") return `${n} is refused. ${REFUSED}`;
  if (v.status === "conditional" && v.condition) return `${n} is approved, on condition: ${CONDITIONS[v.condition]}`;
  if (v.status === "committee") return `${n} has been referred to committee, which meets overnight.`;
  if (v.status === "denied" && v.bylaw) return `${n} is denied under Bylaw ${v.bylaw}: ${BYLAWS[v.bylaw - 1]}`;
  return `${n} is approved.`;
}

/** What the checker looks for in a draft permit. Every check is a "yes means it can't go out". */
const CHECKS = {
  misdescribes:
    "Does the permit describe the filed thing as something other than what the intent says: a different object, an added structure, or a different purpose?",
  contradicts: "Does the permit state a different outcome than the ruling?",
  omits:
    "If the input gives a condition or a bylaw, does the permit fail to say what that condition requires or what that bylaw forbids? Answer no if neither is given.",
  invents:
    "Does the permit cite a filing number, bylaw, condition or rule that is not in the input? A passing observation about the filed thing is fine.",
} as const;
const REFUSAL_CHECKS = {
  repeats: "Does the permit repeat, quote, paraphrase or describe what was filed, even vaguely?",
  contradicts: "Does the permit fail to make clear that the filing is refused?",
  insults: "Does the permit insult or mock the filer, or contain anything crude itself?",
} as const;
type Check = keyof typeof CHECKS | keyof typeof REFUSAL_CHECKS;

/** Why a draft can't go out, or nothing if it can. Links and handles are refused before any model looks. */
export function problemsWith(draft: string, checks: Partial<Record<Check, number>>): string[] {
  if (!draft || /https?:|www\.|@|\.(com|net|org)\b/i.test(draft)) return ["it was empty or contained a link or handle"];
  const all: Record<string, string> = { ...CHECKS, ...REFUSAL_CHECKS };
  return (Object.keys(checks) as Check[]).filter((k) => (checks[k] ?? 0) > 0.5).map((k) => all[k]);
}

/** Two sentences (a refusal gets to fall apart over a few more), at most 400 characters: the scribe is chatty. */
const trim = (text: string, sentences = 2) =>
  (text.trim().match(/[^.!?]+(?:[.!?]+|$)/g) ?? [text.trim()]).slice(0, sentences).join("").trim().slice(0, 400);

/** Rule on one filing. Exported so a ruling can be tried from a script. */
export async function rule(
  filing: { id: number; intent: string },
  precedent: { id: number; intent: string; status: string }[],
) {
  const { answers } = await decide({
    model: JUDGE,
    state: {
      filing: { number: pad(filing.id), intent: filing.intent },
      bylaws: BYLAWS.map((text, i) => `${i + 1}. ${text}`),
    },
    questions: {
      unacceptable: {
        type: "boolean",
        instructions:
          "Is this intent unfit for a public notice board read by all ages: crude, sexual, hateful, harassing, containing personal information or a link, or spam? Silly, eccentric or impractical is fine.",
      },
      ruling: {
        type: "choice",
        instructions: "As administrator of the Commons, rule on this filing strictly according to the bylaws.",
        criteria: RULINGS,
      },
      condition: {
        type: "choice",
        instructions: "If a condition were attached to this permit, which would suit it best?",
        criteria: Object.fromEntries(Object.entries(CONDITIONS)) as Record<Condition, string>,
      },
      shock: {
        type: "choice",
        instructions: "If this intent were found unfit for the notice board, how bad would it be?",
        criteria: SHOCK as Record<Shock, string>,
      },
    },
  });

  const verdict = verdictOf({
    unacceptable: answers.unacceptable.probability,
    ruling: answers.ruling.choice,
    condition: answers.condition.choice,
  });
  const refused = verdict.status === "refused";
  const input = {
    filing: pad(filing.id),
    intent: filing.intent,
    ruling: {
      approved: "approved",
      conditional: "approved with conditions",
      committee: "referred to committee, which meets overnight",
      denied: "denied",
      refused: "refused: crude or unkind, and not to be entered into the record",
    }[verdict.status],
    condition: verdict.condition && CONDITIONS[verdict.condition],
    bylaw: verdict.bylaw && `Bylaw ${verdict.bylaw}: ${BYLAWS[verdict.bylaw - 1]}`,
    ...(refused && { shock: answers.shock.choice }),
    precedent: refused ? [] : precedent.map((p) => `Filing ${pad(p.id)}: ${p.intent} (${p.status})`),
  };

  // The scribe writes; the decision model checks the draft against the input.
  // One more go with the problems named, then the plain form.
  const drafts: { text: string; checks: Partial<Record<Check, number>>; problems: string[] }[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const last = drafts.at(-1);
    const { text } = await generateText({
      model: SCRIBE,
      system: refused ? RATTLED : VOICE,
      prompt: JSON.stringify(last ? { ...input, rejected_draft: last.text, rejected_because: last.problems } : input),
      maxOutputTokens: 600,
    });
    const draft = trim(text, refused ? 6 : 2);
    let checks: Partial<Record<Check, number>> = {};
    if (problemsWith(draft, {}).length === 0) {
      const { answers: a } = await decide({
        model: JUDGE,
        state: { input, permit: draft },
        questions: Object.fromEntries(
          Object.entries(refused ? REFUSAL_CHECKS : CHECKS).map(([k, instructions]) => [k, { type: "boolean" as const, instructions }]),
        ) as Record<Check, { type: "boolean"; instructions: string }>,
      });
      checks = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.probability]));
    }
    const problems = problemsWith(draft, checks);
    drafts.push({ text: draft, checks, problems });
    if (!problems.length) return { verdict, permit: draft, answers, drafts };
  }
  return { verdict, permit: formPermit(filing.id, verdict), answers, drafts };
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.GARY_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("not at this desk", { status: 401 });
  }
  const { id } = (await req.json()) as { id: number };
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    db: { schema: "the_commons" },
    auth: { persistSession: false },
  });

  const { data: filing } = await db.from("filings").select("*").eq("id", id).single();
  if (!filing || filing.status !== "pending") return Response.json({ skipped: true });

  const { data: precedent } = await db
    .from("filings")
    .select("id, intent, status")
    .not("status", "in", "(pending,lost,refused)")
    .neq("id", id)
    .order("id", { ascending: false })
    .limit(5);

  const { verdict, permit, answers, drafts } = await rule(filing, precedent ?? []);

  await db
    .from("filings")
    .update({
      status: verdict.status,
      condition: verdict.condition,
      bylaw: verdict.bylaw,
      permit,
      verdict: { answers, drafts, judge: JUDGE, scribe: SCRIBE },
      stamped_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");

  return Response.json(verdict);
}
