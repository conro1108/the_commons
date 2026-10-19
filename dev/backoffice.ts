// Gary's back office: a dev-server-only API for src/dev.ts. It runs the real
// pipeline in api/gary.ts, reloaded on every request so a prompt edit is live
// on the next try. Dry runs write nothing; /dev/desk is the real in-tray and
// writes to the shared commons. Never built or deployed (`apply: "serve"`).
//
// Models go through the AI Gateway on the Vercel OIDC token in .env.local
// (refreshed by the Vercel CLI login); the database on the secret key in
// ~/projects/.supabase.env. Both stay in this process.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";
import type * as Gary from "../api/gary.ts";

const LOOPBACK = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
const LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function backoffice(): Plugin {
  return {
    name: "the-commons-backoffice",
    apply: "serve",
    configureServer(server) {
      for (const file of [".env.local", `${homedir()}/projects/.supabase.env`]) {
        if (existsSync(file)) process.loadEnvFile(file);
      }
      server.middlewares.use("/dev", async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        // Only this machine, by its own name, from its own pages, as JSON. Vite's host
        // check and CORS default cover most of this already; this holds if either is loosened.
        const origin = req.headers.origin;
        if (
          !LOOPBACK.includes(req.socket.remoteAddress ?? "") || !LOCALHOST.test(req.headers.host ?? "") ||
          (origin && new URL(origin).host !== req.headers.host) ||
          req.method !== "POST" || !req.headers["content-type"]?.startsWith("application/json")
        ) {
          return send(403, { error: "back office is local only" });
        }
        const t = performance.now();
        try {
          const gary = (await server.ssrLoadModule("/api/gary.ts")) as typeof Gary;
          const result = await run(gary, (req.url ?? "").replace(/^\//, ""), JSON.parse(await read(req)));
          send(200, { result, ms: Math.round(performance.now() - t) });
        } catch (e) {
          send(500, { error: e instanceof Error ? e.message : String(e), ms: Math.round(performance.now() - t) });
        }
      });
    },
  };
}

async function read(req: IncomingMessage) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body || "{}";
}

type Body = Parameters<typeof Gary.desk>[1] & {
  intent?: string; label?: string; stock?: Gary.Condition; writeIn?: boolean; condition?: string;
};

async function run(gary: typeof Gary, what: string, b: Body): Promise<unknown> {
  const db = gary.deskDb();
  const filing = { id: b.id ?? 9999, intent: b.intent ?? "" };
  switch (what) {
    case "rule":
      return gary.rule(filing, await gary.precedentFor(db, filing.id));
    case "condition":
      return gary.writeCondition(filing, b.stock ?? "flag", undefined, b.writeIn);
    case "committee":
      return gary.sit(filing);
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
