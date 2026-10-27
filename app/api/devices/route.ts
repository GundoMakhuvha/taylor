import { authorise } from "@/lib/server-auth";
import { adminConfigured } from "@/lib/server/admin";
import { createDevice, deleteDevice, listDevices } from "@/lib/server/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function user(req: Request) {
  const a = await authorise(req);
  return a.ok && a.userId && adminConfigured() ? a.userId : null;
}

export async function GET(req: Request) {
  const uid = await user(req);
  if (!uid) return Response.json({ error: "Please sign in." }, { status: 401 });
  return Response.json({ devices: await listDevices(uid) });
}

export async function POST(req: Request) {
  const uid = await user(req);
  if (!uid) return Response.json({ error: "Please sign in." }, { status: 401 });
  const j = await req.json().catch(() => ({}));
  const kind = j.kind === "laptop" ? "laptop" : "phone";
  return Response.json(await createDevice(uid, String(j.name || ""), kind));
}

export async function DELETE(req: Request) {
  const uid = await user(req);
  if (!uid) return Response.json({ error: "Please sign in." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  await deleteDevice(uid, id);
  return Response.json({ ok: true });
}
