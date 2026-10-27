import { todaysBriefing } from "@/lib/server/briefing";
import { authDevice } from "@/lib/server/devices";
import { speakable, synthesize } from "@/lib/server/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// For your alarm: GET ?format=audio → MP3 of today's briefing in Taylor's voice; ?format=json → text.
export async function GET(req: Request) {
  const dev = await authDevice(req);
  if (!dev) return new Response("Unknown device key.", { status: 401 });
  const format = new URL(req.url).searchParams.get("format") || "audio";
  try {
    const b = await todaysBriefing(dev.userId, dev.name);
    if (format === "json") return Response.json({ spoken: b.spoken, written: b.written, day: b.day });
    const audio = await synthesize(speakable(b.spoken));
    return audio ?? new Response(b.spoken, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (err) {
    console.error("[taylor] device briefing", err);
    return new Response("Good morning. I couldn't put your briefing together just now.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
