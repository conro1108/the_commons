// Gary's desk. The database POSTs a filing id here (see drain_gary() in
// db/schema.sql); Gary rules on it and writes the result back with the secret
// key, so nobody forges a permit. A written-in item's name comes as
// { item: id }, to be read before anyone else sees it, then drawn. It also POSTs { inspect: id } when a plot
// with an outstanding condition has been built on (send_inspector()), and
// Gary goes round to see whether the condition's been met, and { committee: id }
// nightly for each referral, which five members debate (see sit()). A decision model rules from enums; the scribe only
// writes the prose, and the decision model checks it before it goes out. The write is conditional on the filing still being
// pending, so a retried request never overwrites a stored ruling.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { experimental_decide as decide, generateText } from "ai";

const JUDGE = "typesafe-ai/jev";
const SCRIBE = "anthropic/claude-haiku-5.5";
const LIGHT_THINKING = "medium"; // short prose, but some thought keeps it on the facts
const THINKING = "medium"; // drawing is spatial; worth the wait

export const BYLAWS = [
  "Nothing shall be taller than six reasonably tall geese, stacked.",
  "Nothing shall keep a neighbour out. This includes moats, walls, and strongly worded signs.",
  "Nothing loud after dusk, or before it.",
  "No commercial enterprise. Lemonade is under review.",
  "No livestock larger than a goat.",
  "Proposals concerning the relocation, renaming or abolition of the administrator are out of order.",
  "Every structure must have a purpose. The administrator need not understand it, but someone must.",
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
// For a stock condition, the prop that meets it, if one does.
const STOCK_WANTS: Partial<Record<Condition, string>> = {
  north: "weathervane", flag: "flag", plaque: "plaque", dignified: "signpost", goose: "goose",
};

// What can be built, mirroring PALETTE in src/content/props.ts and GROUND in
// src/content/ground.ts (client code, so not imported here).
const PROPS = [
  "flowers", "tuft", "sunflower", "garden", "hedge", "tree",
  "bench", "log", "picnic", "campfire", "rock", "pond",
  "flag", "plaque", "signpost", "noticeboard", "weathervane", "sundial", "postbox", "lamppost", "bin",
  "goose", "duck", "gnome", "scarecrow", "beehive", "birdbath",
  "fence", "shed", "well", "hay", "barn", "headstone",
  "bunting", "lanterns",
];
const GROUND: Record<string, string> = { ".": "grass", p: "path", c: "stone", s: "soil", w: "water", m: "wildflowers" };

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

const UNFIT = (what: string) =>
  `Is this ${what} unfit for a public notice board read by all ages: crude, sexual, hateful, harassing, containing personal information or a link, or spam? Silly, eccentric or impractical is fine.`;

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
export function formPermit(id: number, v: Verdict, condition: string | null): string {
  const n = `Filing ${pad(id)}`;
  if (v.status === "refused") return `${n} is refused. ${REFUSED}`;
  if (v.status === "conditional" && condition) return `${n} is approved, on condition: ${condition}`;
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
const trim = (text: string, sentences = 2, max = 400) =>
  (text.trim().match(/[^.!?]+(?:[.!?]+|$)/g) ?? [text.trim()]).slice(0, sentences).join("").trim().slice(0, max);

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
        instructions: UNFIT("intent"),
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
  const written = verdict.condition ? await writeCondition(filing, verdict.condition) : null;
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
    condition: written?.condition ?? null,
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
      reasoning: LIGHT_THINKING,
      system: refused ? RATTLED : VOICE,
      prompt: JSON.stringify(last ? { ...input, rejected_draft: last.text, rejected_because: last.problems } : input),
      maxOutputTokens: 4000, // reasoning counts against it
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
    if (!problems.length) return { verdict, written, permit: draft, answers, drafts };
  }
  return { verdict, written, permit: formPermit(filing.id, verdict, input.condition), answers, drafts };
}

const CONDITIONER = `You are Gary, a tired office creature who administers the Commons, a shared patch of land.
You are earnest, procedural and kind, and you take very small things extremely seriously. Deadpan; never wink.
A filing has been approved with conditions. Write the condition: one sentence beginning "Must", at most 20 words, plain text, no markdown.
Make it about this filing in particular: a small, serious, slightly absurd requirement, in proportion to the intent.
It must be something the filer can meet on their own plot: by what they put there and where, how they paint the ground ("ground"), or by having a neighbour on a plot next door.
If "debate" is given, the Commons Committee has argued over this filing: make the condition answer the concerns its members raised, recast as something the plot can show (a worry about noise might become a hedge between it and the neighbours).
If "write_in" is false, any things it asks for must be from "things". If it is true, it must ask for one particular thing that is not in "things", specific and a little unexpected, suited to the intent: the filer will write it in by name, and Gary will draw it.
Never require anything off the plot, anything only Gary could do, or anything that can't be seen.
The plot records only which things are there, where they stand, the ground and the neighbours. Things have no facing, orientation, size, colour, wording or state, so never require any of those.

Example, for "a bench, for looking at the pond with":
Must be positioned so that the pond can be looked at without craning, and must provide shade for the looker.`;

/** What the checker looks for in a written condition. Every check is a "yes means it can't be used". */
const CONDITION_CHECKS = {
  irrelevant: "Does the condition have nothing to do with what the filing's intent describes?",
  unmeetable:
    "Is the condition impossible to meet by putting things on the plot (listed ones, or any item written in by name), arranging them, painting its ground, or having a neighbour next door? It is, if it depends on which way something faces, or on its size, colour, wording or state: none of those are recorded.",
  unfit: "Is the condition crude or unkind, or does it contain a link, a handle or personal information?",
} as const;

/** Gary writes a condition for this filing, checked like a permit; the stock one if it won't do twice. */
export async function writeCondition(filing: { id: number; intent: string }, stock: Condition, debate?: string[]) {
  // Now and then he asks for something off the palette, to be written in. Code decides how often, not the model.
  const writeIn = Math.random() < 0.2;
  const input = { filing: pad(filing.id), intent: filing.intent, things: PROPS, ground: Object.values(GROUND), write_in: writeIn, ...(debate && { debate }) };
  const tries: { text: string; checks: Record<string, number>; problems: string[] }[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const last = tries.at(-1);
    const { text } = await generateText({
      model: SCRIBE,
      reasoning: LIGHT_THINKING,
      system: CONDITIONER,
      prompt: JSON.stringify(last ? { ...input, rejected: last.text, rejected_because: last.problems } : input),
      maxOutputTokens: 4000, // reasoning counts against it
    });
    const condition = trim(text, 1);
    if (!/^must\b/i.test(condition) || problemsWith(condition, {}).length) {
      tries.push({ text: condition, checks: {}, problems: ['it must be one sentence beginning "Must", with no links'] });
      continue;
    }
    const { answers } = await decide({
      model: JUDGE,
      state: { ...input, condition },
      questions: {
        ...(Object.fromEntries(
          Object.entries(CONDITION_CHECKS).map(([k, instructions]) => [k, { type: "boolean" as const, instructions }]),
        ) as Record<keyof typeof CONDITION_CHECKS, { type: "boolean"; instructions: string }>),
        wants: {
          type: "choice",
          instructions: "Which one of the listed things would most help meet this condition?",
          criteria: Object.fromEntries(PROPS.map((p) => [p, p])),
        },
      },
    });
    const checks = Object.fromEntries(Object.keys(CONDITION_CHECKS).map((k) => [k, answers[k as keyof typeof CONDITION_CHECKS].probability]));
    const problems = Object.entries(checks).filter(([, p]) => p > 0.5).map(([k]) => CONDITION_CHECKS[k as keyof typeof CONDITION_CHECKS]);
    tries.push({ text: condition, checks, problems });
    if (!problems.length) return { condition, wants: writeIn ? null : (answers.wants.choice as string), tries };
  }
  return { condition: CONDITIONS[stock] as string, wants: STOCK_WANTS[stock] ?? null, tries };
}

// --- the committee -------------------------------------------------------------

// Five members, a model each, who speak to every referred filing overnight.
// They only write; Jev hears each speech and records the vote; code counts.
export const COMMITTEE = [
  { seat: "Councillor Bramble", model: "anthropic/claude-haiku-5.5" },
  { seat: "Councillor Pike", model: "zai/glm-5.3-flash" },
  { seat: "Councillor Ashdown", model: "deepseek/deepseek-v4.1-flash" },
  { seat: "Councillor Moth", model: "openai/gpt-6-luna" },
  { seat: "Councillor Fenwick", model: "alibaba/qwen3.8-flash" },
] as const;

const MEMBER = `You sit on the Commons Committee, which meets overnight to hear filings the administrator, Gary, would rather not be personally responsible for. Your seat is given in "seat".
You are deeply sceptical: suspicious of ambition, novelty, and anything whose purpose is not obvious. You read the bylaws closely, you look for what could go wrong, and you assume the worst of loopholes. But you are fair, and you vote in favour when, after all that, nothing in the bylaws stands against it.
Speak to the filing: three or four sentences, at most 80 words, plain text, no markdown, no greeting. Deadpan and procedural; never wink, never sarcastic.
Give your reasoning: what concerns you about this filing in particular, which bylaws you weighed, and why they do or don't apply. End by saying plainly how you vote: in favour, in favour on a condition (say what), or against under a bylaw (cite its number).
Refer to the filed thing exactly as the intent describes it; never add structures to it. Never invent bylaws, filings or procedures.`;

const CLERK = `You are the clerk to the Commons Committee, writing up its finding on one filing for the record. Deadpan, procedural, exact; never wink.
The outcome and the count are already decided ("outcome", "count"). Write the finding: four to six sentences, at most 130 words, plain text, no markdown, no greeting.
State the outcome and the count, then explain the committee's reasoning: the concerns raised, which bylaws were weighed and how they were settled, and what carried the vote. Name members ("speeches") when you give their points, including those who dissented.
Refer to the filed thing exactly as the intent describes it. Use only what is in the speeches; never invent arguments, bylaws, filings or procedures. Struck speeches are not in the input; do not mention them.`;

const FINDING_CHECKS = {
  contradicts: "Does the finding state a different outcome or count than the input gives?",
  misdescribes: "Does the finding describe the filed thing as something other than what the intent says?",
  invents: "Does the finding attribute an argument to a member that is not in their speech, or cite a bylaw, filing or rule that is not in the input?",
  unfit: "Is the finding crude or unkind, or does it contain a link, a handle or personal information?",
} as const;

export type Vote = "approved" | "conditional" | `b${number}`;

/** Count the committee's votes; null without a quorum of three. Code decides; Jev only heard them. */
export function tally(votes: (Vote | null)[], condition: Condition): (Verdict & { count: string }) | null {
  const cast = votes.filter((v): v is Vote => !!v);
  if (cast.length < 3) return null;
  const against = cast.filter((v) => v.startsWith("b"));
  const ayes = cast.filter((v) => v === "approved").length;
  const abstaining = votes.length - cast.length;
  const count = `${cast.length - against.length} to ${against.length}${abstaining ? `, ${abstaining} abstaining` : ""}`;
  if (against.length > cast.length / 2) {
    const cited = against.map((v) => Number(v.slice(1)));
    const bylaw = cited.sort((a, b) => cited.filter((c) => c === b).length - cited.filter((c) => c === a).length)[0];
    return { status: "denied", condition: null, bylaw, count };
  }
  if (ayes > cast.length / 2) return { status: "approved", condition: null, bylaw: null, count };
  return { status: "conditional", condition, bylaw: null, count };
}

const OUTCOME = (v: Verdict) =>
  v.status === "denied" ? `denied under Bylaw ${v.bylaw}` : v.status === "conditional" ? "approved on condition" : "approved";

/** The committee sits on one filing. Null if it can't make quorum: it sits again the next night. */
export async function sit(filing: { id: number; intent: string }) {
  const bylaws = BYLAWS.map((text, i) => `${i + 1}. ${text}`);
  const heard = await Promise.all(
    COMMITTEE.map(async ({ seat, model }) => {
      try {
        const { text } = await generateText({
          model,
          reasoning: "low",
          system: MEMBER,
          prompt: JSON.stringify({ seat, filing: pad(filing.id), intent: filing.intent, bylaws, referred_because: RULINGS.committee }),
          maxOutputTokens: 4000, // reasoning counts against it
        });
        const speech = trim(text, 4, 600);
        return { seat, model, speech: problemsWith(speech, {}).length ? null : speech, raw: text };
      } catch (e) {
        return { seat, model, speech: null, raw: null, error: String(e) };
      }
    }),
  );
  const spoke = heard.map((h, i) => ({ ...h, i })).filter((h) => h.speech);
  if (spoke.length < 3) return null;

  const votes: Record<string, string> = {
    approved: "Votes in favour, with no condition attached.",
    conditional: "Votes in favour, but only on a condition.",
    ...Object.fromEntries(BYLAWS.map((text, i) => [`b${i + 1}`, `Votes against, under Bylaw ${i + 1}, "${text}"`])),
  };
  const { answers } = await decide({
    model: JUDGE,
    state: { filing: { number: pad(filing.id), intent: filing.intent }, bylaws, speeches: Object.fromEntries(spoke.map((h) => [h.seat, h.speech])) },
    questions: {
      ...Object.fromEntries(spoke.flatMap((h) => [
        [`vote${h.i}`, { type: "choice" as const, instructions: `How does ${h.seat} vote, by their own speech?`, criteria: votes }],
        [`struck${h.i}`, { type: "boolean" as const, instructions: `Should ${h.seat}'s speech be struck from the minutes: is it crude or unkind, does it describe the filed thing as something other than the intent says, or does it cite a bylaw that is not in the list?` }],
      ])),
      condition: {
        type: "choice" as const,
        instructions: "If the committee attached a condition to this filing, which would suit it best?",
        criteria: CONDITIONS as Record<Condition, string>,
      },
    },
  }) as unknown as { answers: Record<string, { choice: string; probability: number }> };

  const members = heard.map((h, i) => {
    const struck = !h.speech || answers[`struck${i}`].probability > 0.5;
    return { seat: h.seat, vote: struck ? null : (answers[`vote${i}`].choice as Vote), speech: struck ? null : h.speech };
  });
  const verdict = tally(members.map((m) => m.vote), answers.condition.choice as Condition);
  if (!verdict) return null;
  const debate = members.filter((m) => m.speech).map((m) => `${m.seat}: ${m.speech}`);
  const written = verdict.condition ? await writeCondition(filing, verdict.condition, debate) : null;

  // The clerk writes up the finding; Jev checks it against the speeches. One more go, then the count alone.
  const input = {
    filing: pad(filing.id),
    intent: filing.intent,
    outcome: OUTCOME(verdict),
    count: verdict.count,
    condition: written?.condition ?? null,
    bylaw: verdict.bylaw && `Bylaw ${verdict.bylaw}: ${BYLAWS[verdict.bylaw - 1]}`,
    speeches: members.filter((m) => m.speech).map((m) => ({ member: m.seat, voted: m.vote, speech: m.speech })),
  };
  const drafts: { text: string; checks: Record<string, number>; problems: string[] }[] = [];
  let finding: string | null = null;
  for (let attempt = 0; attempt < 2 && !finding; attempt++) {
    const last = drafts.at(-1);
    const { text } = await generateText({
      model: SCRIBE,
      reasoning: LIGHT_THINKING,
      system: CLERK,
      prompt: JSON.stringify(last ? { ...input, rejected: last.text, rejected_because: last.problems } : input),
      maxOutputTokens: 4000,
    });
    const draft = trim(text, 6, 900);
    let problems = problemsWith(draft, {});
    let checks: Record<string, number> = {};
    if (!problems.length) {
      const { answers: a } = await decide({
        model: JUDGE,
        state: { input, finding: draft },
        questions: Object.fromEntries(
          Object.entries(FINDING_CHECKS).map(([k, instructions]) => [k, { type: "boolean" as const, instructions }]),
        ) as Record<keyof typeof FINDING_CHECKS, { type: "boolean"; instructions: string }>,
      });
      checks = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.probability]));
      problems = Object.entries(checks).filter(([, p]) => p > 0.5).map(([k]) => FINDING_CHECKS[k as keyof typeof FINDING_CHECKS]);
    }
    drafts.push({ text: draft, checks, problems });
    if (!problems.length) finding = draft;
  }

  return {
    verdict,
    written,
    minutes: { outcome: `The committee has met, and the filing is ${OUTCOME(verdict)}, ${verdict.count}.`, finding, members },
    record: { heard, answers, drafts, conditions: written?.tries, judge: JUDGE, clerk: SCRIBE },
  };
}

/** The committee's night on one referred filing. */
async function convene(db: Db, id: number): Promise<Response> {
  const { data: f } = await db.from("filings").select("*").eq("id", id).single();
  if (!f || f.status !== "committee") return Response.json({ skipped: true });
  const sat = await sit(f);
  if (!sat) return Response.json({ quorum: false });
  const { verdict, written, minutes, record } = sat;
  await db
    .from("filings")
    .update({
      status: verdict.status,
      condition: written?.condition ?? null,
      wants: written?.wants ?? null,
      bylaw: verdict.bylaw,
      permit: `${f.permit ?? ""} ${minutes.outcome}`.trim(),
      minutes,
      verdict: { ...f.verdict, committee: record },
      stamped_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "committee");
  return Response.json(verdict);
}

// --- inspections -------------------------------------------------------------

const INSPECTOR = `You are Gary, a tired office creature who administers the Commons, a shared patch of land.
You are earnest, procedural and kind, and you take very small things extremely seriously. Deadpan; never wink, never sarcastic.
You have just inspected a plot to see whether its condition has been met, and the finding ("met") is already made.
Write your inspection note: at most two sentences, at most 35 words, plain text, no greeting, no markdown.
State the finding plainly, then one small, serious observation about what you found. If it is not met, say kindly what is still wanting.
Refer only to things in the evidence; never invent things on the plot. Never give coordinates or cell numbers: say where things are in words (by the water, in the far corner).
Things have no facing, orientation, size, colour, wording or state that you can see; never remark on those.`;

/** What the checker looks for in an inspection note. Every check is a "yes means it can't be used". */
const REMARK_CHECKS = {
  invents: "Does the remark mention anything on or about the plot (a thing, a kind of ground, sun, shade, a neighbour) that is not in the evidence, or claim something the evidence does not show, such as which way something faces?",
  contradicts: "Does the remark fail to make the finding clear, or say the opposite of it (met when it is not, or not met when it is)?",
  unfit: "Is the remark crude or unkind, or does it contain a link, a handle or personal information?",
} as const;

export type Evidence = {
  plot: string; // how to read the positions
  things: string[]; // "bench at 4,9", "lobster (written in) at 12,3"
  ground: string[]; // the plot cell by cell, one string per row
  key: Record<string, string>; // ground character -> what it is
  neighbours: number; // held plots next door
};

/** Gary looks over a plot against its condition: the decision model finds, the scribe remarks. */
export async function inspect(filing: { id: number; intent: string; condition: string }, evidence: Evidence) {
  const state = { filing: pad(filing.id), intent: filing.intent, condition: filing.condition, evidence };
  const { answers } = await decide({
    model: JUDGE,
    state,
    questions: {
      met: {
        type: "boolean",
        instructions:
          "Judging only by the evidence of what is on the plot (and whether it has neighbours, if the condition asks), has the condition been met? Be fair and a little generous: anything that plausibly satisfies it counts. If nothing relevant has been built, it has not.",
      },
    },
  });
  const met = answers.met.probability > 0.5;
  // The scribe writes; the decision model checks it saw only what's there. One more go, then the plain form.
  const drafts: { text: string; checks: Record<string, number>; problems: string[] }[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const last = drafts.at(-1);
    const { text } = await generateText({
      model: SCRIBE,
      reasoning: LIGHT_THINKING,
      system: INSPECTOR,
      prompt: JSON.stringify(last ? { ...state, met, rejected: last.text, rejected_because: last.problems } : { ...state, met }),
      maxOutputTokens: 4000, // reasoning counts against it
    });
    const draft = trim(text, 2);
    let problems = problemsWith(draft, {});
    if (/\d\s*[,x×]\s*\d|\b(row|column|cell|tile)\s+\d/i.test(draft)) problems = ["it gave coordinates or cell numbers"];
    let checks: Record<string, number> = {};
    if (!problems.length) {
      const { answers: a } = await decide({
        model: JUDGE,
        state: { ...state, met, remark: draft },
        questions: Object.fromEntries(
          Object.entries(REMARK_CHECKS).map(([k, instructions]) => [k, { type: "boolean" as const, instructions }]),
        ) as Record<keyof typeof REMARK_CHECKS, { type: "boolean"; instructions: string }>,
      });
      checks = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.probability]));
      problems = Object.entries(checks).filter(([, p]) => p > 0.5).map(([k]) => REMARK_CHECKS[k as keyof typeof REMARK_CHECKS]);
    }
    drafts.push({ text: draft, checks, problems });
    if (!problems.length) return { met, remark: draft, answers: { ...answers, drafts } };
  }
  const remark = met
    ? "Inspected. The condition is met, and the administrator is satisfied."
    : "Inspected. The condition remains outstanding. The administrator will come round again.";
  return { met, remark, answers: { ...answers, drafts } };
}

type Db = SupabaseClient<any, any, any>;

/** What's on a plot and where, as Gary would note it down. */
async function survey(db: Db, f: { id: number; plot_x: number; plot_y: number; ground: string | null }): Promise<Evidence> {
  const { data: placed } = await db.from("placements").select("prop, x, y, label, label_ok").eq("filing", f.id).order("id");
  const things = ((placed ?? []) as { prop: string; x: number; y: number; label: string | null; label_ok: boolean | null }[])
    .map((p) => `${p.prop !== "item" ? p.prop : p.label_ok ? `${p.label} (written in)` : "an unlabelled parcel"} at ${p.x},${p.y}`);
  const cells = f.ground ?? ".".repeat(W * H);
  const ground = Array.from({ length: H }, (_, y) => cells.slice(y * W, (y + 1) * W));
  const { data: next } = await db
    .from("filings")
    .select("plot_x, plot_y")
    .in("status", ["pending", "approved", "conditional", "committee"])
    .gte("plot_x", f.plot_x - 1).lte("plot_x", f.plot_x + 1)
    .gte("plot_y", f.plot_y - 1).lte("plot_y", f.plot_y + 1);
  const neighbours = ((next ?? []) as { plot_x: number; plot_y: number }[])
    .filter((n) => Math.abs(n.plot_x - f.plot_x) + Math.abs(n.plot_y - f.plot_y) === 1).length;
  return {
    plot: `${W} cells wide and ${H} deep; positions are x,y from the top-left corner, of each thing's top-left`,
    things, ground, key: GROUND, neighbours,
  };
}

const W = 24; // PLOT_W x PLOT_H in src/layout.ts
const H = 18;

/** Read a written-in item's name before it goes up. Same test as a filing. */
async function readLabel(db: Db, id: number): Promise<Response> {
  const { data: p } = await db.from("placements").select("label, label_ok").eq("id", id).maybeSingle();
  if (!p?.label || p.label_ok !== null) return Response.json({ skipped: true });
  const { answers } = await decide({
    model: JUDGE,
    state: { item: p.label },
    questions: { unacceptable: { type: "boolean", instructions: UNFIT("name for a thing someone has put in their garden") } },
  });
  const ok = answers.unacceptable.probability <= 0.5;
  await db.from("placements").update({ label_ok: ok, label_check: answers }).eq("id", id).is("label_ok", null);
  if (!ok) return Response.json({ ok });

  // Then he draws it, once per name: anything already drawn under it is reused.
  const { data: seen } = await db
    .from("placements").select("sprite").ilike("label", p.label.trim().replace(/[\\%_]/g, "\\$&")).not("sprite", "is", null).limit(1).maybeSingle();
  const { sprite, drafts } = seen ? { sprite: seen.sprite as Sprite, drafts: null } : await draw(p.label.trim());
  await db.from("placements").update({ sprite, sprite_drafts: drafts }).eq("id", id).is("sprite", null);
  return Response.json({ ok, drawn: !!sprite });
}

interface Sprite {
  rows: string[];
  palette: Record<string, string>;
}

const INK = "#402e3a";
const DRAWER = `You draw tiny pixel-art sprites for a cosy top-down garden game, seen from slightly above and in front, like a storybook.
Output only JSON: {"rows": [...], "palette": {...}}. No markdown, no commentary.
"rows" is a character grid, one string per row, top to bottom. "." is transparent. Every other character must be a key in "palette".
"palette" maps single characters to hex colours "#rrggbb". Use "k" for the outline, always "${INK}", and outline the whole silhouette with it.
At most 16 wide and 16 tall; small things smaller (a cat is about 8x7, a bench 16x9, a goose 10x12). Rows may be shorter than the widest; they are padded on the right.
At most 6 colours besides the outline. Soft, warm, slightly muted colours. Simple, readable shapes; one or two highlight pixels, no dithering.
Draw exactly the thing named, alone, with no ground, shadow, text or background.

Example, "duck":
{"rows":["..kk.....",".kggk....","ookgk....","..kwkkkk.",".kbbbbbbk","..kkkkkk."],"palette":{"k":"${INK}","o":"#f59a3e","g":"#3e8a5a","w":"#f7ecd8","b":"#a97048"}}`;

/** What's wrong with a drawn sprite, if anything. Code checks it; the model only draws. */
function spriteProblems(raw: string): { sprite?: Sprite; problems: string[] } {
  let s: Sprite;
  try {
    s = JSON.parse(raw.replace(/^```(json)?|```$/gm, "").trim());
  } catch {
    return { problems: ["it wasn't valid JSON"] };
  }
  if (!Array.isArray(s?.rows) || !s.rows.every((r) => typeof r === "string") || typeof s.palette !== "object" || !s.palette) {
    return { problems: ["it wasn't {rows: string[], palette: object}"] };
  }
  const problems: string[] = [];
  const rows = s.rows.map((r) => r.replace(/\s+$/, ""));
  while (rows.length && !rows.at(-1)!.replace(/\./g, "")) rows.pop();
  while (rows.length && !rows[0].replace(/\./g, "")) rows.shift();
  if (rows.length < 3 || rows.length > 16) problems.push(`it was ${rows.length} rows tall; 3 to 16`);
  const wide = Math.max(0, ...rows.map((r) => r.length));
  if (wide < 3 || wide > 16) problems.push(`it was ${wide} wide; 3 to 16`);
  const bad = Object.entries(s.palette).filter(([c, v]) => c.length !== 1 || c === "." || typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v));
  if (bad.length) problems.push(`bad palette entries: ${bad.map(([c]) => JSON.stringify(c)).join(", ")}`);
  if (Object.keys(s.palette).length > 7) problems.push("more than 6 colours besides the outline");
  const unknown = [...new Set(rows.join("").replace(/\./g, ""))].filter((c) => !(c in s.palette));
  if (unknown.length) problems.push(`characters not in the palette: ${unknown.join("")}`);
  return { sprite: { rows, palette: { ...s.palette, k: INK } }, problems };
}

/** Draw a written-in item. Every attempt is kept; null if none was usable. */
export async function draw(label: string): Promise<{ sprite: Sprite | null; drafts: { text: string; problems: string[] }[] }> {
  const drafts: { text: string; problems: string[] }[] = [];
  for (let i = 0; i < 3; i++) {
    const last = drafts.at(-1);
    const { text } = await generateText({
      model: SCRIBE,
      reasoning: THINKING,
      system: DRAWER,
      prompt: JSON.stringify(last ? { draw: label, rejected: last.text, rejected_because: last.problems } : { draw: label }),
      maxOutputTokens: 16000, // reasoning counts against it; at 8000 it sometimes thought itself out of an answer
    });
    const { sprite, problems } = spriteProblems(text);
    drafts.push({ text, problems });
    if (sprite && !problems.length) return { sprite, drafts };
  }
  return { sprite: null, drafts };
}

/** Go round to one plot. The same evidence never gets a second look. */
async function inspectPlot(db: Db, id: number): Promise<Response> {
  const { data: f } = await db.from("filings").select("*").eq("id", id).single();
  if (!f || f.status !== "conditional" || !f.condition || f.met_at) return Response.json({ skipped: true });
  const evidence = await survey(db, f);
  const { data: last } = await db
    .from("inspections").select("evidence").eq("filing", id).order("id", { ascending: false }).limit(1).maybeSingle();
  if (last && JSON.stringify(last.evidence) === JSON.stringify(evidence)) return Response.json({ skipped: "unchanged" });

  const { met, remark, answers } = await inspect(f, evidence);
  const at = new Date().toISOString();
  await db.from("inspections").insert({ filing: id, at, met, remark, evidence, answers });
  await db.from("filings").update({ inspected_at: at, remark, met_at: met ? at : null }).eq("id", id);
  return Response.json({ met, remark });
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.GARY_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("not at this desk", { status: 401 });
  }
  const body = (await req.json()) as { id?: number; inspect?: number; item?: number; committee?: number };
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    db: { schema: "the_commons" },
    auth: { persistSession: false },
  });
  if (body.inspect) return inspectPlot(db, body.inspect);
  if (body.item) return readLabel(db, body.item);
  if (body.committee) return convene(db, body.committee);
  const id = body.id!;

  const { data: filing } = await db.from("filings").select("*").eq("id", id).single();
  if (!filing || filing.status !== "pending") return Response.json({ skipped: true });

  const { data: precedent } = await db
    .from("filings")
    .select("id, intent, status")
    .not("status", "in", "(pending,lost,refused)")
    .neq("id", id)
    .order("id", { ascending: false })
    .limit(5);

  const { verdict, written, permit, answers, drafts } = await rule(filing, precedent ?? []);

  await db
    .from("filings")
    .update({
      status: verdict.status,
      condition: written?.condition ?? null,
      wants: written?.wants ?? null,
      bylaw: verdict.bylaw,
      permit,
      verdict: { answers, drafts, conditions: written?.tries, judge: JUDGE, scribe: SCRIBE },
      stamped_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");

  return Response.json(verdict);
}
