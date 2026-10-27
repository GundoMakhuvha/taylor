import { accountsEnabled } from "@/lib/server-auth";
import { engine } from "@/lib/server/llm";
import { premiumVoiceConfigured } from "@/lib/server/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Which subsystems are configured. Booleans only; never reveals providers or keys.
export async function GET() {
  const premiumVoice = premiumVoiceConfigured();
  return Response.json(
    {
      core: Boolean(engine()),
      voice: premiumVoice ? "premium" : "standard",
      memory: accountsEnabled() ? "cloud" : "device",
      search: process.env.WEB_SEARCH !== "off",
      googleSignIn: process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "on",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
