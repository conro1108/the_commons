// Gary's back office (src/backoffice.ts): dry runs of his pipeline, nothing
// written, and the live in-tray on demand, each with the transcript of every
// model call it made. Open to anyone who finds the door (a 5s hold on the
// notice board); deliberately, for now.

import * as gary from "./gary.js";

type Body = Parameters<typeof gary.desk>[1] & {
  what: string; plot?: number; intent?: string; label?: string; stock?: gary.Condition; writeIn?: boolean; condition?: string;
  bylaw?: number; pleas?: string[];
};

export async function POST(req: Request): Promise<Response> {
  const db = gary.deskDb();
  const t = performance.now();
  const ms = () => Math.round(performance.now() - t);
  const calls: gary.Call[] = [];
  try {
    const body = await req.json();
    return Response.json({ result: await gary.transcript.run(calls, () => run(db, body)), calls, ms: ms() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e), calls, ms: ms() }, { status: 500 });
  }
}

/** Up to three pleas against a denial, in turn, until one is allowed or refused a hearing. */
async function appeal(filing: { id: number; intent: string; bylaw: number | null }, pleas: string[], plot: ReturnType<typeof gary.plotOf>) {
  const earlier: { plea: string; reply: string | null }[] = [];
  const heard = [];
  for (const plea of pleas.slice(0, 3)) {
    const h = await gary.hear(filing, plea, earlier, plot);
    heard.push({ plea, ...h });
    if (!h.ok || h.verdict?.status !== "denied") break;
    earlier.push({ plea, reply: h.reply });
  }
  return heard;
}

async function run(db: gary.Db, { what, ...b }: Body): Promise<unknown> {
  const filing = { id: b.id ?? 9999, intent: b.intent ?? "" };
  const plot = gary.plotOf(b.plot ?? 1);
  switch (what) {
    case "rule":
      return gary.rule(filing, plot, await gary.precedentFor(db, filing.id, plot));
    case "condition":
      return gary.writeCondition(filing, b.stock ?? "local", { plot, writeIn: b.writeIn });
    case "committee":
      return gary.sit(filing, plot);
    case "appeal":
      return appeal({ ...filing, bylaw: b.bylaw ?? 1 }, b.pleas ?? [], plot);
    case "life": {
      // A filing's whole life, dry: ruled; sat on, if referred; appealed, if denied and there are pleas.
      const ruled = await gary.rule(filing, plot, await gary.precedentFor(db, filing.id, plot));
      const sat = ruled.verdict.status === "committee" ? await gary.sit(filing, plot) : null;
      const v = sat ? sat.verdict : ruled.verdict;
      const appealed = v.status === "denied" && b.pleas?.length ? await appeal({ ...filing, bylaw: v.bylaw }, b.pleas, plot) : null;
      return { ruled, sat, appealed };
    }
    case "draw":
      return gary.draw(b.label ?? "");
    case "inspect": {
      const { data: f, error } = await db.from("filings").select("*").eq("id", b.id).single();
      if (error) throw error;
      const evidence = await gary.survey(db, f);
      const condition = b.condition || f.condition;
      if (!condition) throw new Error(`Filing ${b.id} has no condition; give one to try.`);
      return { evidence, ...(await gary.inspect({ ...f, condition }, evidence)) };
    }
    case "audit": {
      const { data: f, error } = await db.from("filings").select("*").eq("id", b.id).single();
      if (error) throw error;
      const evidence = await gary.survey(db, f);
      return { evidence, ...(await gary.audit(f, evidence)) };
    }
    case "filing": {
      const [f, inspections] = await Promise.all([
        db.from("filings").select("*").eq("id", b.id).single(),
        db.from("inspections").select("*").eq("filing", b.id).order("id", { ascending: false }),
      ]);
      if (f.error) throw f.error;
      return { ...f.data, inspections: inspections.data };
    }
    case "desk":
      return (await gary.desk(db, b)).json();
  }
  throw new Error(`no such desk: ${what}`);
}
