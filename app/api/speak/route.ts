import { authorise } from "@/lib/server-auth";
import { synthesize } from "@/lib/server/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Turns Taylor's reply into speech. 204 = no premium voice; the browser uses its built-in British voice.
export async function POST(req: Request) {
  const auth = await authorise(req);
  if (!auth.ok) return new Response(null, { status: auth.status });

  let text = "";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text.slice(0, 2500) : "";
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!text.trim()) return new Response("Bad request", { status: 400 });

  return (await synthesize(text)) ?? new Response(null, { status: 204 });
}
