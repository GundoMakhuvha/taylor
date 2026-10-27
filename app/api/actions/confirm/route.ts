import { authorise, isOwner } from "@/lib/server-auth";
import { connectorsReady, listConnections, type ProviderId } from "@/lib/server/connections";
import { unseal } from "@/lib/server/crypto";
import { executeAction } from "@/lib/server/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The user tapped Confirm (or said "yes"): carry out the held action.
export async function POST(req: Request) {
  const auth = await authorise(req);
  if (!auth.ok || !auth.userId) return Response.json({ error: "Please sign in again." }, { status: 401 });

  let token = "";
  try {
    token = (await req.json())?.token || "";
  } catch {}
  const a = unseal<{ uid: string; tool: string; args: any; tz: string }>(token);
  if (!a) return Response.json({ error: "That request has expired. Ask Taylor to prepare it again." }, { status: 410 });
  if (a.uid !== auth.userId) return Response.json({ error: "Not allowed." }, { status: 403 });

  try {
    const linked = new Set<ProviderId>(connectorsReady() ? (await listConnections(auth.userId)).map((c) => c.provider) : []);
    const message = await executeAction(a.tool, a.args, auth.userId, a.tz || "Africa/Johannesburg", linked, isOwner(auth.email));
    return Response.json({ ok: true, message });
  } catch (err: any) {
    console.error("[taylor] action failed", a.tool, err);
    const reason = String(err?.message || "").replace(/^\d{3}:\s*/, "").slice(0, 220);
    return Response.json({ error: `That didn't go through${reason ? `: ${reason}` : "."}` }, { status: 502 });
  }
}
