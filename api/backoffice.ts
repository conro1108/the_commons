// Gary's back office (src/backoffice.ts): dry runs of his pipeline, nothing
// written, and the live in-tray on demand. Open to anyone who finds the door
// (a 5s hold on the notice board); deliberately, for now.

import * as gary from "./gary.js";

type Body = Parameters<typeof gary.desk>[1] & {
  what: string; plot?: number; intent?: string; label?: string; stock?: gary.Condition; writeIn?: boolean; condition?: string;
};

export async function POST(req: Request): Promise<Response> {
  const db = gary.deskDb();
  const t = performance.now();
  const ms = () => Math.round(performance.now() - t);
  try {
    return Response.json({ result: await run(db, await req.json()), ms: ms() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e), ms: ms() }, { status: 500 });
  }
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
