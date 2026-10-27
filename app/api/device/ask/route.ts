import { askTaylor } from "@/lib/server/agent";
import { appUrl } from "@/lib/server/admin";
import { seal } from "@/lib/server/crypto";
import { PHONE_URL, authDevice } from "@/lib/server/devices";
import { engine } from "@/lib/server/llm";
import { premiumVoiceConfigured, speakable } from "@/lib/server/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Hands-free: { "text": "what's on my calendar?" } → { reply, audio_url, open_app, open_url }
export async function POST(req: Request) {
  const dev = await authDevice(req);
  if (!dev) return Response.json({ error: "Unknown device key." }, { status: 401 });
  if (!engine()) return Response.json({ reply: "I'm offline right now." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.text || body.input || "").trim();
  if (!text) return Response.json({ reply: "I didn't catch that." });

  try {
    const r = await askTaylor({ userId: dev.userId, email: dev.email, name: dev.name, text, channelKey: `dev:${dev.deviceId}`, channel: dev.kind });
    const spoken = speakable(r.reply).slice(0, 1800);
    return Response.json({
      reply: r.reply,
      spoken,
      audio_url: premiumVoiceConfigured() ? `${appUrl()}/api/device/audio?t=${encodeURIComponent(seal({ s: spoken }, 900))}` : "",
      open_app: r.open.app || "",
      open_url: r.open.app && dev.kind === "phone" ? PHONE_URL[r.open.app] || "" : "",
    });
  } catch (err) {
    console.error("[taylor] device ask", err);
    return Response.json({ reply: "Sorry, something went wrong on my side. Try again in a moment.", spoken: "Sorry, something went wrong on my side." }, { status: 500 });
  }
}
