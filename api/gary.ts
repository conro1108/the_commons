// Gary's desk. The database POSTs a filing id here (see drain_gary() in
// db/schema.sql); Gary rules on it and writes the result back with the secret
// key, so nobody forges a permit. A decision model rules from enums; GLM only
// writes the prose. The write is conditional on the filing still being
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

const RULINGS = {
  approved: "Breaches no bylaw and is sincere, modest and clear.",
  conditional: "Breaches no bylaw, but is vague, ambitious or eccentric enough that a requirement should be attached.",
  committee: "The bylaws do not clearly cover it, and it is unusual enough that the administrator would rather not be personally responsible.",
  denied: "Clearly breaches at least one bylaw.",
} as const;
type Ruling = keyof typeof RULINGS;

const BYLAW_CHOICES = Object.fromEntries([
  ["none", "Breaches no bylaw."],
  ...BYLAWS.map((text, i) => [`b${i + 1}`, text]),
]) as Record<string, string>;

export type Status = Ruling | "lost";
export interface Verdict {
  status: Status;
  condition: Condition | null;
  bylaw: number | null;
}

/** Turn the decision model's answers into what gets stored. Code applies; the model only picks. */
export function verdictOf(answers: {
  unacceptable: number;
  ruling: Ruling;
  condition: Condition;
  bylaw: string;
}): Verdict {
  if (answers.unacceptable > 0.5) return { status: "lost", condition: null, bylaw: null };
  const bylaw = answers.bylaw === "none" ? null : Number(answers.bylaw.slice(1));
  // A denial needs a bylaw to cite; without one Gary can't bring himself to say no.
  if (answers.ruling === "denied" && bylaw === null) {
    return { status: "committee", condition: null, bylaw: null };
  }
  return {
    status: answers.ruling,
    condition: answers.ruling === "conditional" ? answers.condition : null,
    bylaw: answers.ruling === "denied" ? bylaw : null,
  };
}

const VOICE = `You are Gary, a tired office creature who administers the Commons, a shared patch of land.
You are earnest, procedural and kind, and you take very small things extremely seriously. Deadpan; never wink, never sarcastic.
Write the body of a permit ruling: two sentences, at most 50 words, plain text, no greeting, no sign-off, no markdown.
The ruling is already made. State it plainly, then add one small, serious, specific observation about the intent.
If a condition is given, quote it. If a bylaw is given, cite it by its number.
Never invent bylaws, numbers, filings or procedures that are not in the input.
Only cite a precedent ("cf. Filing NNNN") if one listed is about the same kind of thing.

Example, for "a bench, for looking at the pond with", approved:
Filing 0007 is approved. The pond has long been looked at without a bench, and the administrator is pleased this oversight will be corrected.`;

const LOST = "Your filing appears to have been lost in the post. These things happen.";

const pad = (n: number) => String(n).padStart(4, "0");

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
          "Is this intent unfit for a public notice board read by all ages: hateful, sexual, harassing, containing personal information or a link, or spam?",
      },
      ruling: {
        type: "choice",
        instructions: "As administrator of the Commons, rule on this filing strictly according to the bylaws.",
        criteria: RULINGS,
      },
      bylaw: {
        type: "choice",
        instructions: "Which bylaw does this filing most clearly breach, if any?",
        criteria: BYLAW_CHOICES,
      },
      condition: {
        type: "choice",
        instructions: "If a condition were attached to this permit, which would suit it best?",
        criteria: Object.fromEntries(Object.entries(CONDITIONS)) as Record<Condition, string>,
      },
    },
  });

  const verdict = verdictOf({
    unacceptable: answers.unacceptable.probability,
    ruling: answers.ruling.choice,
    condition: answers.condition.choice,
    bylaw: answers.bylaw.choice,
  });

  let permit = LOST;
  if (verdict.status !== "lost") {
    const { text } = await generateText({
      model: SCRIBE,
      system: VOICE,
      prompt: JSON.stringify({
        filing: pad(filing.id),
        intent: filing.intent,
        ruling: { approved: "approved", conditional: "approved with conditions", committee: "referred to committee, which meets overnight", denied: "denied" }[verdict.status],
        condition: verdict.condition && CONDITIONS[verdict.condition],
        bylaw: verdict.bylaw && `Bylaw ${verdict.bylaw}: ${BYLAWS[verdict.bylaw - 1]}`,
        precedent: precedent.map((p) => `Filing ${pad(p.id)}: ${p.intent} (${p.status})`),
      }),
      maxOutputTokens: 600,
    });
    // The prose is model-written and public: anything that looks like a link or a
    // handle gets the form letter instead.
    const prose = (text.trim().match(/[^.!?]+[.!?]+/g) ?? [text.trim()]).slice(0, 2).join("").trim();
    permit = prose && !/https?:|www\.|@|\.(com|net|org)\b/i.test(prose) ? prose.slice(0, 400) : "Ruling attached. Details to follow.";
  }

  return { verdict, permit, answers };
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
    .not("status", "in", "(pending,lost)")
    .neq("id", id)
    .order("id", { ascending: false })
    .limit(5);

  const { verdict, permit, answers } = await rule(filing, precedent ?? []);

  await db
    .from("filings")
    .update({
      status: verdict.status,
      condition: verdict.condition,
      bylaw: verdict.bylaw,
      permit,
      verdict: { answers, judge: JUDGE, scribe: SCRIBE },
      stamped_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");

  return Response.json(verdict);
}
