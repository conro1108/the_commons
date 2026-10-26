// The gate. A resident's name is their key: give it here from any browser and
// you're let in as them. Supabase only lets someone back in by an address, so
// each resident gets one that's never written to (<id>@the-commons.invalid),
// and this hands out a one-time token for it. Guests are anonymous sessions
// and have none, so nobody can sign in as a guest.
//
// POST { keep: true } with your session: your papers are filed, so keep them.
// POST { name }: a token for that resident, for supabase.auth.verifyOtp.

import { createClient } from "@supabase/supabase-js";

const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const address = (id: string) => `${id}@the-commons.invalid`;
const no = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { keep?: boolean; name?: string };
  const admin = db();

  if (body.keep) {
    const jwt = req.headers.get("authorization")?.replace(/^Bearer /, "");
    const { data } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
    if (!data.user) return no("Gary can't find your papers.", 401);
    if (!data.user.is_anonymous) return Response.json({ ok: true });
    const { data: profile } = await admin.schema("app").from("profiles").select("avatar").eq("id", data.user.id).single();
    if (!profile || !Object.keys(profile.avatar ?? {}).length) return no("Your papers aren't filled in yet.");
    const { error } = await admin.auth.admin.updateUserById(data.user.id, { email: address(data.user.id), email_confirm: true });
    return error ? no(error.message, 500) : Response.json({ ok: true });
  }

  const name = body.name?.trim();
  if (!name) return no("Gary needs a name.");
  // The name as written, or failing that, the one name it is in any case.
  const profiles = admin.schema("app").from("profiles");
  const { data: exact } = await profiles.select("id").eq("handle", name).maybeSingle();
  const { data: loose } = exact ? { data: [exact] } : await profiles.select("id").ilike("handle", name.replace(/[\\%_]/g, "\\$&")).limit(2);
  if (loose?.length !== 1) return no("Nobody by that name is on file.", 404);
  // A guest has no address, and asking for a link to one would make a new user.
  const email = address(loose[0].id);
  const { data: held } = await admin.auth.admin.getUserById(loose[0].id);
  if (held.user?.email !== email) return no("Nobody by that name is on file.", 404);
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) return no(error.message, 500);
  return Response.json({ token: link.properties.hashed_token });
}
