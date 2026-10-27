// The business owner: who Taylor works for when running Capvtal on autopilot. Server-only.
import { ownerEmails } from "../server-auth";
import { admin, adminConfigured, appUrl } from "./admin";
import { connectorsReady, listConnections, type ProviderId } from "./connections";
import { sendViaResend, taylorEmailHtml } from "./resend";
import { sendWhatsApp, whatsappConfigured } from "./whatsapp";

export const OWNER_TZ = () => process.env.OWNER_TIMEZONE || "Africa/Johannesburg";

let cached: { id: string; email: string; name: string } | null = null;

/** Finds the owner's Taylor account (first OWNER_EMAIL). */
export async function owner(): Promise<{ id: string; email: string; name: string } | null> {
  if (cached) return cached;
  const email = ownerEmails()[0];
  if (!email || !adminConfigured()) return null;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || "").toLowerCase() === email);
    if (u) {
      cached = { id: u.id, email, name: (u.user_metadata?.name as string) || process.env.OWNER_NAME || "" };
      return cached;
    }
    if (data.users.length < 200) break;
  }
  return null;
}

export async function ownerLinked(uid: string): Promise<Set<ProviderId>> {
  if (!connectorsReady()) return new Set();
  try {
    return new Set((await listConnections(uid)).map((c) => c.provider));
  } catch {
    return new Set();
  }
}

/**
 * Send the owner an update on WhatsApp and/or email.
 * WhatsApp: free-form if you've messaged the business number in the last 24h,
 * otherwise the approved template (WHATSAPP_UPDATE_TEMPLATE) with a one-paragraph summary.
 */
export async function notifyOwner(a: {
  subject: string;
  text: string;
  short?: string;
  cta?: { label: string; url: string };
  channels?: ("email" | "whatsapp")[];
}) {
  const channels = a.channels || ["email", "whatsapp"];
  const out: string[] = [];
  const o = await owner().catch(() => null);
  const to = process.env.OWNER_NOTIFY_EMAIL || o?.email;

  if (channels.includes("email") && to) {
    const r = await sendViaResend({ to, subject: a.subject, text: a.text + (a.cta ? `\n\n${a.cta.label}: ${a.cta.url}` : ""), html: taylorEmailHtml(a.subject, a.text, a.cta) });
    out.push(r.ok ? "email" : `email failed (${r.reason})`);
  }

  const phone = process.env.OWNER_WHATSAPP;
  if (channels.includes("whatsapp") && phone && whatsappConfigured()) {
    const body = (a.short || a.text).slice(0, 3800) + (a.cta ? `\n\n${a.cta.label}: ${a.cta.url}` : "");
    const r = await sendWhatsApp(phone, body, "taylor");
    if (r.ok) out.push("whatsapp");
    else if (process.env.WHATSAPP_UPDATE_TEMPLATE) {
      const t = await sendTemplate(phone, process.env.WHATSAPP_UPDATE_TEMPLATE, oneLine(a.short || a.text, 900));
      out.push(t ? "whatsapp (template)" : "whatsapp failed");
    } else out.push("whatsapp skipped (24h window closed; set WHATSAPP_UPDATE_TEMPLATE)");
  }
  return out;
}

const oneLine = (s: string, max: number) =>
  s
    .replace(/\*\*/g, "")
    .replace(/\s*\n+\s*/g, " • ")
    .replace(/\s{4,}/g, "   ")
    .slice(0, max);

async function sendTemplate(phone: string, name: string, param: string) {
  const r = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace(/\D/g, ""),
      type: "template",
      template: {
        name,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: param }] }],
      },
    }),
  });
  if (!r.ok) console.error("[taylor] whatsapp template", r.status, (await r.text().catch(() => "")).slice(0, 300));
  return r.ok;
}

export const link = (path: string) => `${appUrl()}${path}`;
