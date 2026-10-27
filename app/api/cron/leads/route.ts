import { cronAllowed } from "@/lib/server/cron";
import { findLeads, placesConfigured, todaysQueries } from "@/lib/server/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Weekdays: find local businesses without websites (they appear in tomorrow's briefing).
export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response("Unauthorized", { status: 401 });
  if (!placesConfigured()) return Response.json({ skipped: "GOOGLE_PLACES_API_KEY not set" });
  const out = [];
  for (const q of todaysQueries(Number(process.env.LEAD_SEARCHES_PER_DAY || 2))) {
    try {
      const r = await findLeads(q);
      out.push({ query: q, new: r.new_leads.length });
    } catch (err: any) {
      out.push({ query: q, error: String(err?.message || err).slice(0, 120) });
    }
  }
  return Response.json({ results: out });
}
