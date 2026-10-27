import { authorise } from "@/lib/server-auth";
import { PROVIDERS, connectorsReady, isProvider, redirectUri } from "@/lib/server/connections";
import { seal } from "@/lib/server/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the provider's consent URL. The browser then navigates there.
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider)) return Response.json({ error: "Unknown connector" }, { status: 404 });

  const auth = await authorise(req);
  if (!auth.ok || !auth.userId) return Response.json({ error: "Please sign in first." }, { status: 401 });
  if (!connectorsReady()) return Response.json({ error: "Connectors aren't set up on the server yet." }, { status: 503 });

  const p = PROVIDERS[provider];
  if (!p.configured()) return Response.json({ error: `${p.label} isn't set up on the server yet.` }, { status: 503 });

  const state = seal({ uid: auth.userId, p: provider }, 15 * 60);
  return Response.json({ url: p.authUrl(state, redirectUri(provider)) });
}
