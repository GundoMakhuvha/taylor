import { authorise, isOwner } from "@/lib/server-auth";
import { PROVIDERS, PROVIDER_IDS, connectorsReady, deleteConnection, isProvider, listConnections } from "@/lib/server/connections";
import { whatsappConfigured } from "@/lib/server/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authorise(req);
  if (!auth.ok) return Response.json({ error: "Please sign in." }, { status: auth.status });
  const ready = connectorsReady() && Boolean(auth.userId);
  let linked: { provider: string; account: string }[] = [];
  try {
    if (ready) linked = await listConnections(auth.userId!);
  } catch (err) {
    console.error("[taylor] list connections", err);
  }
  return Response.json({
    ready,
    providers: PROVIDER_IDS.map((id) => ({
      id,
      label: PROVIDERS[id].label,
      covers: PROVIDERS[id].covers,
      available: ready && PROVIDERS[id].configured(),
      account: linked.find((l) => l.provider === id)?.account ?? null,
    })),
    whatsapp: { available: whatsappConfigured(), owner: isOwner(auth.email) },
  });
}

export async function DELETE(req: Request) {
  const auth = await authorise(req);
  if (!auth.ok || !auth.userId) return Response.json({ error: "Please sign in." }, { status: 401 });
  const provider = new URL(req.url).searchParams.get("provider") || "";
  if (!isProvider(provider)) return Response.json({ error: "Unknown connector" }, { status: 400 });
  try {
    await deleteConnection(auth.userId, provider);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[taylor] disconnect", err);
    return Response.json({ error: "Couldn't disconnect right now." }, { status: 500 });
  }
}
