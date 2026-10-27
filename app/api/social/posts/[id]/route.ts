import { authorise, isOwner } from "@/lib/server-auth";
import { appUrl } from "@/lib/server/admin";
import { unseal } from "@/lib/server/crypto";
import { publishPost, skipPost } from "@/lib/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Approve/skip a drafted post. Works from the emailed link (signed token) or from the app (owner sign-in).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isForm = (req.headers.get("content-type") || "").includes("form");
  let action = "";
  let token = "";
  if (isForm) {
    const f = await req.formData();
    action = String(f.get("action") || "");
    token = String(f.get("t") || "");
  } else {
    const j = await req.json().catch(() => ({}));
    action = j.action || "";
    token = j.t || "";
  }

  let allowed = false;
  const sealed = token ? unseal<{ pid: string }>(token) : null;
  if (sealed?.pid === id) allowed = true;
  else {
    const auth = await authorise(req);
    allowed = auth.ok && isOwner(auth.email);
  }
  if (!allowed) return Response.json({ error: "This link has expired." }, { status: 403 });

  let result = "";
  try {
    if (action === "publish") {
      const p = await publishPost(id);
      result = p.status;
    } else if (action === "skip") {
      await skipPost(id);
      result = "skipped";
    } else return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("[taylor] post action", err);
    result = "failed";
  }
  if (isForm) return Response.redirect(`${appUrl()}/approve/post/${id}?t=${encodeURIComponent(token)}&done=${result}`, 303);
  return Response.json({ ok: result !== "failed", status: result });
}
