import { runMorningBriefing } from "@/lib/server/briefing";
import { cronAllowed } from "@/lib/server/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily: build the morning briefing and send it to WhatsApp + email.
export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await runMorningBriefing());
  } catch (err) {
    console.error("[taylor] cron morning", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
