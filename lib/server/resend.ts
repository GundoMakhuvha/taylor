// Automated email from Taylor via Resend. Used ONLY for mail people have asked for
// (your own briefings, alerts and previews). Resend forbids cold/unsolicited email.
export const resendConfigured = () => Boolean(process.env.RESEND_API_KEY);

export async function sendViaResend(a: { to: string | string[]; subject: string; text: string; html?: string; replyTo?: string }) {
  if (!resendConfigured()) return { ok: false as const, reason: "Resend isn't set up" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "Taylor <taylor@capvtal.com>",
      to: Array.isArray(a.to) ? a.to : [a.to],
      subject: a.subject,
      text: a.text,
      html: a.html,
      reply_to: a.replyTo,
    }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    console.error("[taylor] resend", r.status, err.slice(0, 300));
    return { ok: false as const, reason: `email failed (${r.status})` };
  }
  return { ok: true as const };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Simple branded HTML wrapper for Taylor's emails. */
export function taylorEmailHtml(title: string, bodyText: string, cta?: { label: string; url: string }) {
  const paras = esc(bodyText)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6">${p.replace(/\n/g, "<br>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`)
    .join("");
  const button = cta
    ? `<p style="margin:22px 0 6px"><a href="${esc(cta.url)}" style="background:#5fe3ff;color:#031019;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#05080f;padding:24px 12px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#eaf6ff">
<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#0a1322;border:1px solid #1d3a4f;border-radius:16px">
<tr><td style="padding:22px 26px 8px;font-family:Consolas,monospace;font-size:12px;letter-spacing:4px;color:#5fe3ff">TAYLOR · CAPVTAL INNOVATIONS</td></tr>
<tr><td style="padding:4px 26px 0"><h1 style="margin:0 0 16px;font-size:22px;color:#eaf6ff">${esc(title)}</h1>${paras}${button}</td></tr>
<tr><td style="padding:14px 26px 22px;font-size:12px;color:#7d9bad">Sent by Taylor, your AI assistant at Capvtal Innovations.</td></tr>
</table></body></html>`;
}
