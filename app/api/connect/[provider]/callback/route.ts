import { appUrl } from "@/lib/server/admin";
import { PROVIDERS, isProvider, redirectUri, saveConnection } from "@/lib/server/connections";
import { unseal } from "@/lib/server/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(`${appUrl()}/?${q}`, 302);

  if (!isProvider(provider)) return back("connect_error=unknown");
  const state = unseal<{ uid: string; p: string }>(url.searchParams.get("state") || "");
  const code = url.searchParams.get("code");
  if (!state || state.p !== provider) return back(`connect_error=${provider}`);
  if (!code) return back(`connect_error=${provider}&reason=cancelled`);

  try {
    const { account, secret } = await PROVIDERS[provider].exchange(code, redirectUri(provider));
    await saveConnection(state.uid, provider, account || PROVIDERS[provider].label, secret);
    return back(`connected=${provider}`);
  } catch (err) {
    console.error(`[taylor] connect ${provider} failed`, err);
    return back(`connect_error=${provider}`);
  }
}
