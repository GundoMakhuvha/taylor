import { unseal } from "@/lib/server/crypto";
import { synthesize } from "@/lib/server/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Taylor's voice for a reply (short-lived signed link from /api/device/ask).
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  const p = unseal<{ s: string }>(t);
  if (!p?.s) return new Response("Expired", { status: 410 });
  return (await synthesize(p.s)) ?? new Response(null, { status: 204 });
}
