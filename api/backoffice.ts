// Gary's back office (src/backoffice.ts): dry runs of his pipeline, nothing
// written, each with the transcript of every model call it made. Open to
// anyone who finds the door (a 3s hold on the notice board); deliberately, for now.

import * as gary from "./gary.js";

type Body = {
  what: string; id?: number; plot?: number; intent?: string; label?: string;
  bylaw?: number | null; refused?: boolean; plea?: string; earlier?: { plea: string; reply: string | null }[]; against?: { finding: string; plea: string };
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

async function run(db: gary.Db, { what, ...b }: Body): Promise<unknown> {
  const filing = { id: b.id ?? 9999, intent: b.intent ?? "" };
  const plot = gary.plotOf(b.plot ?? 1);
  switch (what) {
    case "committee":
      return gary.sit(filing, plot);
    case "life": {
      // Ruled, then sat on if referred. Appeals are written one at a time, by whoever's at the back office.
      const ruled = await gary.rule(filing, plot, await gary.precedentFor(db, filing.id, plot));
      return { ruled, sat: ruled.verdict.status === "committee" ? await gary.sit(filing, plot) : null };
    }
    case "appeal":
      return gary.hear({ ...filing, bylaw: b.bylaw ?? null }, b.plea ?? "", b.earlier ?? [], plot);
    case "escalate":
      // Not in the game: three appeals dismissed (or a refusal, at once) go up to the committee, which may be appealed once.
      return gary.sit(filing, plot, { bylaw: b.bylaw ?? null, refused: b.refused, exchange: b.earlier ?? [], ...(b.against && { against: b.against }) });
    case "draw":
      return gary.draw(b.label ?? "");
  }
  throw new Error(`no such desk: ${what}`);
}
