import { authorise, isOwner } from "@/lib/server-auth";
import { runMorningBriefing } from "@/lib/server/briefing";
import { placesConfigured } from "@/lib/server/leads";
import { resendConfigured } from "@/lib/server/resend";
import { approveUrl, autopilotOn, draftPost, listPosts, localDay, platforms } from "@/lib/server/social";
import { whatsappConfigured } from "@/lib/server/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function ownerOnly(req: Request) {
  const a = await authorise(req);
  return a.ok && isOwner(a.email);
}

export async function GET(req: Request) {
  if (!(await ownerOnly(req))) return Response.json({ owner: false });
  const posts = await listPosts(5).catch(() => []);
  return Response.json({
    owner: true,
    social: { autopilot: autopilotOn(), platforms: platforms(), recent: posts.map((p) => ({ id: p.id, day: p.day, headline: p.headline, status: p.status, link: approveUrl(p.id) })) },
    channels: { email: resendConfigured(), whatsapp: whatsappConfigured() && Boolean(process.env.OWNER_WHATSAPP) },
    leads: placesConfigured(),
    crons: Boolean(process.env.CRON_SECRET),
  });
}

export async function POST(req: Request) {
  if (!(await ownerOnly(req))) return Response.json({ error: "Owner only." }, { status: 403 });
  const { action } = await req.json().catch(() => ({}));
  try {
    if (action === "briefing") return Response.json(await runMorningBriefing());
    if (action === "post") {
      const { iso } = localDay();
      const existing = (await listPosts(5)).find((p) => p.day === iso);
      const post = existing || (await draftPost(iso));
      return Response.json({ link: approveUrl(post.id) });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("[taylor] autopilot", err);
    return Response.json({ error: String(err?.message || "failed").slice(0, 200) }, { status: 500 });
  }
}
