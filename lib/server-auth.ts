// Server-side gate: when accounts are enabled, only signed-in (and optionally allow-listed) users can use Taylor.
import { createClient } from "@supabase/supabase-js";

export const accountsEnabled = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const list = (v?: string) =>
  (v || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

type AuthResult = { ok: true; userId?: string; email?: string } | { ok: false; status: number };

export async function authorise(req: Request): Promise<AuthResult> {
  if (!accountsEnabled()) return { ok: true }; // guest mode (no accounts configured yet)

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401 };

  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401 };

    const email = (data.user.email || "").toLowerCase();
    const allow = list(process.env.ALLOWED_EMAILS);
    if (allow.length && !allow.includes(email)) return { ok: false, status: 403 };

    return { ok: true, userId: data.user.id, email };
  } catch (err) {
    console.error("[taylor] auth error", err);
    return { ok: false, status: 401 };
  }
}

/** The business owner(s): may use WhatsApp Business, leads, social autopilot and briefings. */
export function ownerEmails(): string[] {
  for (const v of [process.env.OWNER_EMAIL, process.env.WHATSAPP_OWNER_EMAILS, process.env.ALLOWED_EMAILS]) {
    const l = list(v);
    if (l.length) return l;
  }
  return [];
}
export const isOwner = (email?: string) => Boolean(email && ownerEmails().includes(email.toLowerCase()));
/** @deprecated use isOwner */
export const isWhatsAppOwner = isOwner;
