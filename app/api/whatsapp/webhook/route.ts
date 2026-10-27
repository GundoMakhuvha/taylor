import { after } from "next/server";
import { handleIncoming, verifySignature, whatsappConfigured } from "@/lib/server/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Meta calls this once to verify the webhook URL.
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (
    u.searchParams.get("hub.mode") === "subscribe" &&
    process.env.WHATSAPP_VERIFY_TOKEN &&
    u.searchParams.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new Response(u.searchParams.get("hub.challenge") || "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Incoming messages. Answer Meta immediately, then process in the background.
export async function POST(req: Request) {
  if (!whatsappConfigured()) return new Response("Not configured", { status: 503 });
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Bad signature", { status: 401 });
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  after(() => handleIncoming(payload));
  return new Response("OK", { status: 200 });
}
