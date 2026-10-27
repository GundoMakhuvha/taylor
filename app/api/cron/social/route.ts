import { cronAllowed } from "@/lib/server/cron";
import { runDailySocial } from "@/lib/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily: draft today's themed post, then publish (autopilot) or send it to you for approval.
export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response("Unauthorized", { status: 401 });
  if (process.env.SOCIAL_DAILY === "off") return Response.json({ skipped: "SOCIAL_DAILY=off" });
  try {
    return Response.json(await runDailySocial());
  } catch (err) {
    console.error("[taylor] cron social", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
