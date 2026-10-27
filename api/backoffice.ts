// Gary's back office (src/backoffice.ts): dry runs of his pipeline, nothing
// written but the run itself (backoffice_runs, read by scripts/runs.mjs), each
// with the transcript of every model call it made. Open to anyone who finds the
// door (a 3s hold on the notice board); deliberately, for now.

import * as gary from "./gary.js";

type Body = {
  what: string; session?: string; step?: string; id?: number; plot?: number; intent?: string; label?: string;
  bylaw?: number | null; refused?: boolean; plea?: string; earlier?: { plea: string; reply: string | null }[]; against?: { finding: string; plea: string; said?: Record<string, string> };
};

export async function POST(req: Request): Promise<Response> {
  const db = gary.deskDb();
  const t = performance.now();
  const calls: gary.Call[] = [];
  let body: Body | undefined;
  let out: { result?: unknown; error?: string };
  try {
    body = (await req.json()) as Body;
    out = { result: await gary.transcript.run(calls, () => run(db, body!)) };
  } catch (e) {
    out = { error: e instanceof Error ? e.message : String(e) };
  }
  const ms = Math.round(performance.now() - t);
  let logged: number | undefined;
  if (body?.session) {
    const { data, error } = await db.from("backoffice_runs")
      .insert({ session: body.session, what: body.what, body, ...out, calls, ms }).select("id").single();
    if (error) console.error("backoffice_runs:", error.message);
    logged = data?.id;
  }
  return Response.json({ ...out, calls, ms, run: logged }, { status: out.error ? 500 : 200 });
}

// A phone that lost the line (a backgrounded tab, mostly) asks after its step here; the run
// carries on without it and is kept, so the reply turns up once it's done.
export async function GET(req: Request): Promise<Response> {
  const step = new URL(req.url).searchParams.get("step");
  const { data } = step
    ? await gary.deskDb().from("backoffice_runs").select("id, result, error, calls, ms").eq("body->>step", step).maybeSingle()
    : { data: null };
  if (!data) return new Response(null, { status: 404 });
  return Response.json({ result: data.result, error: data.error ?? undefined, calls: data.calls, ms: data.ms, run: data.id });
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
