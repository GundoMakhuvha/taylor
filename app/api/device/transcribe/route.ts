import { authDevice } from "@/lib/server/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Speech-to-text for the laptop companion (audio body → { text }). Uses Whisper on Groq.
export async function POST(req: Request) {
  const dev = await authDevice(req);
  if (!dev) return Response.json({ error: "Unknown device key." }, { status: 401 });
  if (!process.env.GROQ_API_KEY) return Response.json({ error: "Transcription needs GROQ_API_KEY." }, { status: 503 });
  const audio = await req.arrayBuffer();
  if (!audio.byteLength || audio.byteLength > 20 * 1024 * 1024) return Response.json({ error: "Bad audio" }, { status: 400 });

  const form = new FormData();
  form.append("file", new Blob([audio], { type: req.headers.get("content-type") || "audio/wav" }), "speech.wav");
  form.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
  form.append("language", "en");
  form.append("response_format", "json");
  form.append("prompt", "Taylor, Capvtal, Gundo, Outlook, WhatsApp, Power BI, Johannesburg.");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("[taylor] transcribe", r.status, JSON.stringify(j).slice(0, 200));
    return Response.json({ error: "Transcription failed" }, { status: 502 });
  }
  return Response.json({ text: (j.text || "").trim() });
}
